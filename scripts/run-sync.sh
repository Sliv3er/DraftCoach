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

# Run the patch-aware sync. It writes SR, ARAM, ARAM Mayhem, and augment KB
# files into the data branch repo and pushes only when data changed.
if [ -f scripts/auto-sync-patch.cjs ]; then
  node scripts/auto-sync-patch.cjs >> /var/log/draftcoach-sync.log 2>&1
else
  node auto-sync-patch.cjs >> /var/log/draftcoach-sync.log 2>&1
fi

exit $?
