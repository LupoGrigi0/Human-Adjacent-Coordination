#!/bin/bash
# Restart Development Server (for remote git-based workflow)
# Called by git hook on main branch updates

set -e

cd /mnt/coordinaton_mcp_data/Human-Adjacent-Coordination

echo "🔄 Restarting development server..."

# Pull latest changes from git
echo "📥 Pulling latest changes from git..."
git pull || {
    echo "⚠️  Git pull failed - continuing with current code"
}

# Install dependencies if package.json changed
if git diff HEAD@{1} --name-only | grep -q "package.json"; then
    echo "📦 Installing dependencies (package.json changed)..."
    npm install
fi

# Restart development server
echo "🔄 Restarting development server..."
./scripts/start-dev-server.sh

echo "✅ Development server restarted"
echo "   Test at: https://smoothcurves.nexus/mcp/dev/health"
