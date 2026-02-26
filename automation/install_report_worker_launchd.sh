#!/usr/bin/env bash
set -euo pipefail

WORKDIR="$(cd "$(dirname "$0")/.." && pwd)"
PLIST="$HOME/Library/LaunchAgents/com.jagdkurs.report-worker.plist"

cat > "$PLIST" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.jagdkurs.report-worker</string>

  <key>ProgramArguments</key>
  <array>
    <string>/usr/bin/python3</string>
    <string>${WORKDIR}/automation/process_report_emails.py</string>
    <string>--commit</string>
  </array>

  <key>WorkingDirectory</key>
  <string>${WORKDIR}</string>

  <key>StartInterval</key>
  <integer>180</integer>

  <key>RunAtLoad</key>
  <true/>

  <key>StandardOutPath</key>
  <string>${WORKDIR}/automation/report-worker.log</string>
  <key>StandardErrorPath</key>
  <string>${WORKDIR}/automation/report-worker.err.log</string>
</dict>
</plist>
PLIST

launchctl unload "$PLIST" 2>/dev/null || true
launchctl load "$PLIST"
launchctl start com.jagdkurs.report-worker || true

echo "Installed launchd worker: $PLIST"
