import imaplib
import email
import os
from datetime import datetime, timedelta
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.append(str(ROOT / 'automation'))
import process_report_emails as worker

def main():
    gmail_account = os.environ.get('GMAIL_ACCOUNT')
    app_password = os.environ.get('GMAIL_APP_PASSWORD')
    if not gmail_account or not app_password:
        raise SystemExit('Missing Gmail credentials')

    since_date = datetime.utcnow() - timedelta(days=1)
    since_str = since_date.strftime('%d-%b-%Y')
    print(f"[REPORT-SCAN] Checking reports since {since_str}")

    M = imaplib.IMAP4_SSL('imap.gmail.com', 993)
    M.login(gmail_account, app_password)
    M.select('INBOX')

    search_query = f'(SINCE "{since_str}" SUBJECT "Jagdkurs Meldung:")'
    typ, data = M.search(None, search_query)
    ids = data[0].split() if data and data[0] else []
    print(f"[REPORT-SCAN] Found {len(ids)} report emails")

    state = worker.load_state()
    processed_ids = set(state.get('processed_message_ids', []))
    results = []
    total_changed = 0

    for mid in ids:
        typ, msg_data = M.fetch(mid, '(RFC822)')
        raw = msg_data[0][1]
        msg = email.message_from_bytes(raw)
        message_id = msg.get('Message-ID', '').strip() or f'imap:{mid.decode()}'
        subj = worker.decode_subject(msg)
        body = worker.get_body_text(msg)
        report = worker.parse_report(body)
        already = message_id in processed_ids
        changed, status = worker.apply_report(report)
        total_changed += changed
        results.append({
            'message_id': message_id,
            'subject': subj,
            'question': report.get('question'),
            'changed': changed,
            'status': status,
            'already_processed': already,
        })
        processed_ids.add(message_id)
        M.store(mid, '+FLAGS', '\\Seen')

    state['processed_message_ids'] = list(processed_ids)[-5000:]
    worker.save_state(state)
    M.logout()

    print('[REPORT-SCAN] Results:')
    for r in results:
        print(r)

    print(f"[REPORT-SCAN] Total question updates: {total_changed}")

if __name__ == '__main__':
    main()
