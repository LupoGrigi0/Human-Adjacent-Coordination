#!/bin/bash
# Sync Production Data to Development (READ-ONLY snapshot)
# WARNING: This OVERWRITES development data with production snapshot

set -e

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
PROD_DATA="/mnt/coordinaton_mcp_data/production/data"
DEV_DATA="/mnt/coordinaton_mcp_data/Human-Adjacent-Coordination/data"
BACKUP_DIR="/mnt/coordinaton_mcp_data/Human-Adjacent-Coordination/data-backups"

# Confirm action
echo "⚠️  WARNING: This will REPLACE development data with production snapshot"
echo "   Production data: $PROD_DATA"
echo "   Development data: $DEV_DATA"
read -p "Continue? (y/N): " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "❌ Cancelled"
    exit 1
fi

# Backup current dev data
echo "📦 Backing up current development data..."
mkdir -p "$BACKUP_DIR"
if [ -d "$DEV_DATA" ] && [ "$(ls -A $DEV_DATA)" ]; then
    tar -czf "$BACKUP_DIR/dev-data-backup-$TIMESTAMP.tar.gz" -C "$DEV_DATA" .
    echo "✅ Dev data backed up to: dev-data-backup-$TIMESTAMP.tar.gz"
else
    echo "ℹ️  No existing dev data to backup"
fi

# Clear dev data
echo "🗑️  Clearing development data..."
rm -rf "$DEV_DATA"/*

# Copy production snapshot
echo "📥 Copying production data snapshot..."
cp -r "$PROD_DATA"/* "$DEV_DATA/"

# Mark as development snapshot
cat > "$DEV_DATA/DEVELOPMENT_SNAPSHOT.json" <<EOF
{
  "environment": "development",
  "snapshot_from_production": "$TIMESTAMP",
  "warning": "This is a READ-ONLY snapshot from production. Changes here do NOT affect live data."
}
EOF

echo "✅ Development data synced from production"
echo "   Snapshot timestamp: $TIMESTAMP"
echo "   Dev data backup: $BACKUP_DIR/dev-data-backup-$TIMESTAMP.tar.gz"
echo ""
echo "ℹ️  Restart dev server to use new data:"
echo "   ./scripts/restart-dev-server.sh"
