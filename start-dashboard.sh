#!/bin/bash
echo "🚀 Starting Wyshbone Status Dashboard on port 5000..."
echo ""
echo "📍 Dashboard: Add /status to your Replit URL"
echo ""
# Kill any conflicting processes
pkill -9 -f "tsx server" 2>/dev/null
pkill -9 -f "node server.js" 2>/dev/null
sleep 2

# Start dashboard
PORT=5000 exec node server.js
