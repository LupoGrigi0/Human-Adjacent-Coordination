#!/bin/bash
# Start Development MCP Server
# Port 3446 (HTTP streaming)
# Accessible via: https://smoothcurves.nexus/mcp/dev

set -e

cd /mnt/coordinaton_mcp_data/Human-Adjacent-Coordination

# Kill existing dev server if running
echo "🔍 Checking for existing dev server..."
pkill -f "SSE_PORT=3446" || echo "   No existing dev server found"

# Create logs directory if it doesn't exist
mkdir -p logs

# Start HTTP streaming server on port 3446
echo "🚀 Starting development MCP server..."
SSE_PORT=3446 \
  SSE_HOST=0.0.0.0 \
  NODE_ENV=development \
  node src/streamable-http-server.js > logs/dev-http.log 2>&1 &

DEV_PID=$!

# Wait a moment for server to start
sleep 2

# Verify server is running
if ps -p $DEV_PID > /dev/null; then
    echo "✅ Development server started (PID: $DEV_PID)"
    echo "   Local:    http://localhost:3446"
    echo "   External: https://smoothcurves.nexus/mcp/dev"
    echo "   Logs:     tail -f logs/dev-http.log"

    # Test health endpoint
    if curl -s http://localhost:3446/health > /dev/null 2>&1; then
        echo "✅ Health check passed"
    else
        echo "⚠️  Health check failed (server may still be starting)"
    fi
else
    echo "❌ Failed to start development server"
    cat logs/dev-http.log
    exit 1
fi
