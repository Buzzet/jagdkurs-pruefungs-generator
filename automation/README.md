# Report Worker (Auto-fix from Email)

This worker reads incoming report emails (`Subject: Jagdkurs Meldung:`), evaluates them, and applies automatic fixes to `data/questions.final.tagged.json`.

## One-shot run
```bash
python3 automation/process_report_emails.py --commit
```

## Install auto-run on macOS (every 3 minutes)
```bash
bash automation/install_report_worker_launchd.sh
```

## Requirements
- Keychain entry with Gmail app password:
  - account: `jannik.reinefeld@gmail.com`
  - service: `openclaw-gmail-smtp`

The script only processes unread report emails and keeps a state file at:
- `automation/report_worker_state.json`

Fix log is written to:
- `data/report-fixes.log.jsonl`
