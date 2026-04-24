#!/bin/bash
# DraftCoach Quick Start (for WSL/Git Bash)

echo "========================================"
echo "  DraftCoach - Starting All Services"
echo "========================================"

# Start MongoDB if not running
if ! pgrep -x "mongod" > /dev/null; then
    echo "Starting MongoDB..."
    mongod --dbpath /c/MongoDB/data --port 27017 --bind_ip 127.0.0.1 &
    sleep 3
fi

# Start services in background
echo "Starting Backend..."
cd /c/Users/n3tgg/.openclaw2/workspace/DraftCoach/apps/backend && npm run dev &

echo "Starting Billing..."
cd /c/Users/n3tgg/.openclaw2/workspace/DraftCoach/apps/billing && npm run dev &

echo "Starting Web..."
cd /c/Users/n3tgg/.openclaw2/workspace/DraftCoach/apps/web && npm run dev &

echo ""
echo "========================================"
echo "  All services started!"
echo "========================================"
echo ""
echo "  - Backend:    http://localhost:3210"
echo "  - Billing:    http://localhost:3211"
echo "  - Web:        http://localhost:3000"
echo "  - Billing UI: http://localhost:3000/billing"