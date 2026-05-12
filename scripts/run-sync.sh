#!/bin/bash
cd /opt/draftcoach-sync

# Load env vars
if [ -f .env ]; then
  set -a
  source .env
  set +a
fi

export SYNC_WORK_DIR=/opt/draftcoach-sync
export NODE_PATH=/opt/draftcoach-sync/node_modules

# Run the Mobalytics sync (replaces old Gemini auto-sync)
node sync-mobalytics.cjs >> /var/log/draftcoach-sync.log 2>&1

# Copy output to git data repo
if [ -f /opt/shared/kb/data/build-templates.json ]; then
  mkdir -p /opt/draftcoach-sync/repo/data/kb
  cp /opt/shared/kb/data/build-templates.json /opt/draftcoach-sync/repo/data/kb/
  cp /opt/shared/kb/data/rune-templates.json /opt/draftcoach-sync/repo/data/kb/
  cd /opt/draftcoach-sync/repo
  git add -A
  git diff --cached --quiet || git commit -m "data: mobalytics sync $(date +%Y-%m-%d)"
  git push origin data 2>/dev/null || true
fi

exit $?
