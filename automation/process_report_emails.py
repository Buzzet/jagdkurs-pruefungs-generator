#!/usr/bin/env python3
import argparse
import email
import imaplib
import json
import os
import re
import subprocess
from datetime import datetime
from email.header import decode_header, make_header
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA_FILE = ROOT / 'data' / 'questions.final.tagged.json'
STATE_FILE = ROOT / 'automation' / 'report_worker_state.json'
LOG_FILE = ROOT / 'data' / 'report-fixes.log.jsonl'


def keychain_password(account: str, service: str) -> str:
    return subprocess.check_output([
        'security', 'find-generic-password', '-a', account, '-s', service, '-w'
    ], text=True).strip()


def decode_subject(msg) -> str:
    return str(make_header(decode_header(msg.get('Subject', ''))))


def get_body_text(msg) -> str:
    if msg.is_multipart():
        for part in msg.walk():
            ctype = part.get_content_type()
            disp = str(part.get('Content-Disposition', ''))
            if ctype == 'text/plain' and 'attachment' not in disp.lower():
                payload = part.get_payload(decode=True) or b''
                charset = part.get_content_charset() or 'utf-8'
                return payload.decode(charset, errors='replace')
        return ''
    payload = msg.get_payload(decode=True) or b''
    charset = msg.get_content_charset() or 'utf-8'
    return payload.decode(charset, errors='replace')


def parse_report(body: str):
    out = {}
    for line in body.splitlines():
        if ':' not in line:
            continue
        key, value = line.split(':', 1)
        key = key.strip().lower()
        value = value.strip()
        out[key] = value
    return {
        'subject': out.get('fach', ''),
        'mode': out.get('modus', ''),
        'question': out.get('frage', ''),
        'answer': out.get('antwort', ''),
        'alternatives': [x.strip() for x in out.get('alternativen', '').split(',') if x.strip() and x.strip() != '-'],
        'reason': out.get('grund', ''),
        'time': out.get('zeit', ''),
    }


def normalize_question(text: str, answer: str) -> str:
    s = (text or '').strip()
    # strip broken prefixes
    while True:
        n = re.sub(r'^(Welche Aussage ist richtig:\s*|Welche Antwort ist richtig\?\s*|Was trifft zu\?\s*|Bitte wählen Sie[^:]*:\s*)', '', s, flags=re.I).strip()
        if n == s:
            break
        s = n

    s = re.sub(r'^Welcher Gruppe wird (.+?) zugeordnet\?$', r'Zu welcher Gruppe gehört \1?', s, flags=re.I)
    s = re.sub(r'^Zu welcher Gruppe gehört (.+?) zugeordnet\?$', r'Zu welcher Gruppe gehört \1?', s, flags=re.I)
    s = re.sub(r'^Nennen Sie eine Wildart, die in Deutschland klassisch zum Niederwild\.?$',
               'Nennen Sie Wildarten, die in Deutschland zum Niederwild zählen.', s, flags=re.I)
    s = re.sub(r'^Nennen Sie eine Wildart, die zum Hochwild\.?$',
               'Was gehört alles zum Hochwild?', s, flags=re.I)

    if re.match(r'^Was trifft auf .+ zu\?$', s, flags=re.I):
        if answer in {'Gründelente', 'Tauchente', 'Hühnervogel', 'Greifvogel', 'Rabenvogel', 'Gänsevogel'}:
            s = re.sub(r'^Was trifft auf (.+?) zu\?$', r'Zu welcher Gruppe gehört \1?', s, flags=re.I)
        elif answer in {'Wiederkäuer', 'Allesfresser', 'Fleischfresser', 'Pflanzenfresser'}:
            s = re.sub(r'^Was trifft auf (.+?) zu\?$', r'Welche Ernährungsweise hat \1?', s, flags=re.I)

    s = s.replace('?.', '?')
    s = re.sub(r'\s+', ' ', s).strip()
    if s and s[-1] not in '?.':
        s += '?'
    return s


def enrich_alternatives(item: dict):
    q = (item.get('FrageFreitext') or item.get('Frage') or '').lower()
    ans = (item.get('Antwort') or '').strip().lower()
    pools = {
        'niederwild': ['Fuchs', 'Kaninchen', 'Feldhase', 'Rehwild', 'Rebhuhn', 'Fasan', 'Stockente', 'Ringeltaube'],
        'hochwild': ['Rotwild', 'Damwild', 'Rehwild', 'Schwarzwild', 'Muffelwild'],
        'wiederkäuer': ['Rehwild', 'Rotwild', 'Damwild', 'Muffelwild'],
    }
    add = []
    if 'niederwild' in q:
        add = pools['niederwild']
    elif 'hochwild' in q:
        add = pools['hochwild']
    elif 'wiederkäuer' in q or 'wiederkaeuer' in q:
        add = pools['wiederkäuer']

    cur = item.get('AlternativeAntworten') or []
    merged = []
    for x in [*cur, *add]:
        if not x or x.lower() == ans:
            continue
        if x not in merged:
            merged.append(x)
    item['AlternativeAntworten'] = merged[:8]


def load_state():
    if STATE_FILE.exists():
        return json.loads(STATE_FILE.read_text(encoding='utf-8'))
    return {'processed_message_ids': []}


def save_state(state):
    STATE_FILE.parent.mkdir(parents=True, exist_ok=True)
    STATE_FILE.write_text(json.dumps(state, ensure_ascii=False, indent=2), encoding='utf-8')


def apply_report(report):
    data = json.loads(DATA_FILE.read_text(encoding='utf-8'))
    target = (report.get('question') or '').strip().lower()
    if not target:
        return 0, 'no_question_in_report'

    changed = 0
    reason = (report.get('reason') or '').lower()

    for item in data:
        q = (item.get('FrageFreitext') or item.get('Frage') or '').strip().lower()
        if q != target:
            continue

        old = item.get('FrageFreitext') or item.get('Frage')
        new_q = normalize_question(old, item.get('Antwort', ''))
        item['FrageFreitext'] = new_q
        item['Frage'] = new_q
        item['FrageMC'] = new_q

        # if reporter says wrong/unclear and no concrete rewrite happened, quarantine from PDF/AI
        if new_q == old and any(k in reason for k in ['unklar', 'irreführ', 'irrefuehr', 'falsch']):
            item['PdfEligible'] = False
            item['ReportFlag'] = f"AUTO_REVIEW:{report.get('reason','')[:120]}"

        enrich_alternatives(item)
        changed += 1

    if changed:
        DATA_FILE.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding='utf-8')
        with LOG_FILE.open('a', encoding='utf-8') as f:
            f.write(json.dumps({
                'at': datetime.utcnow().isoformat() + 'Z',
                'report': report,
                'changedCount': changed,
            }, ensure_ascii=False) + '\n')

    return changed, 'ok' if changed else 'question_not_found'


def git_commit_push(msg: str):
    subprocess.run(['git', 'add', str(DATA_FILE), str(LOG_FILE)], cwd=ROOT, check=False)
    # commit may fail when no changes
    c = subprocess.run(['git', 'commit', '-m', msg], cwd=ROOT)
    if c.returncode == 0:
        subprocess.run(['git', 'push'], cwd=ROOT, check=False)


def run_once(gmail_account: str, keychain_service: str, auto_commit: bool):
    pw = keychain_password(gmail_account, keychain_service)
    state = load_state()
    processed = set(state.get('processed_message_ids', []))

    M = imaplib.IMAP4_SSL('imap.gmail.com', 993)
    M.login(gmail_account, pw)
    M.select('INBOX')

    typ, data = M.search(None, '(UNSEEN SUBJECT "Jagdkurs Meldung:")')
    ids = data[0].split() if data and data[0] else []

    total_changed = 0
    for mid in ids:
        typ, msg_data = M.fetch(mid, '(RFC822)')
        raw = msg_data[0][1]
        msg = email.message_from_bytes(raw)
        message_id = msg.get('Message-ID', '').strip() or f'imap:{mid.decode()}'
        if message_id in processed:
            continue

        subj = decode_subject(msg)
        body = get_body_text(msg)
        report = parse_report(body)
        changed, status = apply_report(report)
        total_changed += changed

        print(f'[REPORT-WORKER] {subj} -> {status}, changed={changed}')

        processed.add(message_id)
        M.store(mid, '+FLAGS', '\\Seen')

    M.logout()

    state['processed_message_ids'] = list(processed)[-5000:]
    save_state(state)

    if total_changed and auto_commit:
        git_commit_push(f'chore: auto-fix report emails ({total_changed} question updates)')

    print(f'[REPORT-WORKER] done. updated={total_changed}, emails={len(ids)}')


def main():
    ap = argparse.ArgumentParser(description='Process Jagdkurs report emails and auto-fix questions')
    ap.add_argument('--gmail-account', default='jannik.reinefeld@gmail.com')
    ap.add_argument('--keychain-service', default='openclaw-gmail-smtp')
    ap.add_argument('--commit', action='store_true')
    args = ap.parse_args()

    run_once(args.gmail_account, args.keychain_service, auto_commit=args.commit)


if __name__ == '__main__':
    main()
