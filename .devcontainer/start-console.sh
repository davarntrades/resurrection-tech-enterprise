#!/usr/bin/env bash
# Start the Resurrection Tech™ Analyst Console once, in the background.
# Idempotent — safe to run on every Codespace attach (won't double-start).
cd "$(dirname "$0")/.."

code=$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:8787 2>/dev/null || echo 000)
if [ "$code" = "000" ]; then
  echo "Starting Analyst Console on http://127.0.0.1:8787 …"
  nohup npm run console > /tmp/console.log 2>&1 &
  sleep 3
  echo "──────────────────────────────────────────────────────────────"
  echo " Analyst Console is starting on port 8787."
  echo " • Open it from the PORTS tab (port 8787 → globe icon)."
  echo " • Login credentials are printed in /tmp/console.log (and saved"
  echo "   to .env.delivery)."
  echo "──────────────────────────────────────────────────────────────"
else
  echo "Analyst Console already running on port 8787 (HTTP $code)."
fi
