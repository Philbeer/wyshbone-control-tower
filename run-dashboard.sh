#!/bin/bash

echo "🚀 Starting Wyshbone Dashboard with auto-restart..."
echo ""

# Kill any existing processes
pkill -9 -f "tsx server" 2>/dev/null
pkill -9 -f "node server.js" 2>/dev/null
sleep 2

# Keep the server alive - restart if it crashes
while true; do
  echo "[$(date '+%H:%M:%S')] Starting dashboard on port 5000..."
  PORT=5000 node server.js 2>&1 | tee -a /tmp/dashboard.log
  
  echo "[$(date '+%H:%M:%S')] Server stopped. Restarting in 3 seconds..."
  sleep 3
done
