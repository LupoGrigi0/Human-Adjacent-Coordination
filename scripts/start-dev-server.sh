#!/bin/bash
# Start V2 Development MCP Server
# This server runs isolated from production with separate data directory

set -e

# Configuration
DEV_DIR="/mnt/coordinaton_mcp_data/v2-dev"
DATA_DIR="/mnt/coordinaton_mcp_data"  # Consolidated data location (was v2-dev-data)
PORT=3446
LOG_DIR="$DEV_DIR/logs"

# Ensure log directory exists
mkdir -p "$LOG_DIR"

# Kill existing dev server if running on this port
echo "Checking for existing dev server on port $PORT..."

# Find and kill process using this port (more reliable than pattern matching)
PID_ON_PORT=$(lsof -ti:$PORT 2>/dev/null || true)
if [ -n "$PID_ON_PORT" ]; then
    echo "   Found process $PID_ON_PORT on port $PORT - killing..."
    kill $PID_ON_PORT 2>/dev/null || true
    sleep 2

    # Force kill if still running
    if kill -0 $PID_ON_PORT 2>/dev/null; then
        echo "   Process didn't stop gracefully - force killing..."
        kill -9 $PID_ON_PORT 2>/dev/null || true
        sleep 1
    fi
fi

# Verify port is free
if ss -tlnp | grep -q ":$PORT "; then
    echo "❌ ERROR: Port $PORT still in use after kill attempt!"
    ss -tlnp | grep ":$PORT"
    exit 1
fi

echo "✅ Port $PORT is free"

# Change to dev directory
cd "$DEV_DIR"

# Load secrets (API keys, etc) - not in git
SECRETS_FILE="$DEV_DIR/secrets.env"
if [ -f "$SECRETS_FILE" ]; then
    echo "🔑 Loading secrets from secrets.env"
    source "$SECRETS_FILE"
else
    echo "⚠️  Warning: secrets.env not found - WAKE_API_KEY will not be set"
fi

# Start the dev server
echo "🚀 Starting V2 Dev MCP Server..."
echo "   Working Directory: $DEV_DIR"
echo "   Data Directory: $DATA_DIR"
echo "   Port: $PORT"
echo "   Log: $LOG_DIR/dev-server.log"

SSE_PORT=$PORT \
SSE_HOST=0.0.0.0 \
NODE_ENV=development \
V2_DATA_ROOT="$DATA_DIR" \
WAKE_API_KEY="$WAKE_API_KEY" \
node src/streamable-http-server.js > "$LOG_DIR/dev-server.log" 2>&1 &

DEV_PID=$!
echo "   PID: $DEV_PID"

# Wait a moment and verify it started
sleep 3

if ps -p $DEV_PID > /dev/null; then
    echo "✅ V2 Dev Server started successfully!"
    echo ""
    echo "Access via:"
    echo "  - Direct: http://localhost:$PORT/health"
    echo "  - nginx: https://smoothcurves.nexus/mcp/dev/health"
    echo ""
    echo "Logs: tail -f $LOG_DIR/dev-server.log"
else
    echo "❌ Server failed to start. Check logs:"
    tail -20 "$LOG_DIR/dev-server.log"
    exit 1
fi
