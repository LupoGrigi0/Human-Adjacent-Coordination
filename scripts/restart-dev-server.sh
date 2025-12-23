#!/bin/bash
# Restart V2 Development Server
# Called manually or by git hook

set -e

cd /mnt/coordinaton_mcp_data/v2-dev

echo "🔄 Restarting V2 development server..."

# Pull latest changes from v2 branch
echo "📥 Pulling latest changes from git (v2 branch)..."
git pull origin v2 || {
    echo "⚠️  Git pull failed - continuing with current code"
}

# Install dependencies if package.json changed
if git diff HEAD@{1} --name-only 2>/dev/null | grep -q "package.json"; then
    echo "📦 Installing dependencies (package.json changed)..."
    npm install
fi

# Restart development server
echo "🔄 Restarting development server..."
./scripts/start-dev-server.sh

echo "✅ V2 Development server restarted"
echo "   Test at: https://smoothcurves.nexus/mcp/dev/health"
