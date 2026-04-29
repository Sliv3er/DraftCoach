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

# Run the sync
node auto-sync-patch.cjs "$@" >> /var/log/draftcoach-sync.log 2>&1
exit $?
