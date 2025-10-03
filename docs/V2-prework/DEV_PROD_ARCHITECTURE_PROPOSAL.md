# Development/Production Environment Architecture Proposal

**Author**: Claude Code Developer
**Date**: 2025-10-02
**Status**: DRAFT - Requires Lupo Approval

---

## Executive Summary

Investigation reveals critical infrastructure issues that must be addressed immediately:

1. **🚨 CRITICAL**: Systemd service has crash-looped 109,000+ times since deployment
2. **🚨 CRITICAL**: Backups are configured to backup the WRONG data directory
3. **🚨 CRITICAL**: Live production data is NOT being backed up
4. **⚠️  WARNING**: No development environment exists - all changes touch production

This proposal addresses both **immediate critical fixes** and **long-term dev/prod architecture**.

---

## Part 1: Current State Analysis

### What's Actually Running

#### Production Server (WORKING)
- **Process**: PID 450244 (running since Sep 18, 2025)
- **Working Directory**: `/mnt/coordinaton_mcp_data/production/`
- **Data Location**: `/mnt/coordinaton_mcp_data/production/data/` ✅ LIVE
- **Port**: 3444 (behind nginx reverse proxy)
- **Status**: **Functioning correctly**, serving all requests

#### Systemd Service (BROKEN)
- **Status**: Crash-looping continuously (109,000+ failures)
- **Configuration File**: `/etc/systemd/system/mcp-coordination.service`
- **Working Directory**: `/mnt/coordinaton_mcp_data/production/` ✅ CORRECT
- **ReadWritePaths**: `/mnt/coordinaton_mcp_data/production-data/` ❌ WRONG!
- **Root Cause**: Systemd security restrictions (ProtectSystem=strict) prevent access to actual data directory

### Data Directory Confusion

| Location | Status | Last Modified | Purpose |
|----------|--------|---------------|---------|
| `/mnt/coordinaton_mcp_data/production/data/` | ✅ **LIVE** | Oct 2, 00:13 | **Actual production data** |
| `/mnt/coordinaton_mcp_data/production-data/` | ❌ **STALE** | Sep 29, 02:55 | Abandoned/outdated |
| `/mnt/coordinaton_mcp_data/production-data-backups/` | ❌ **WRONG** | Unknown | Backing up stale data |
| `/mnt/coordinaton_mcp_data/Human-Adjacent-Coordination/data/` | 🔧 **DEV** | Various | Development environment |

### Critical Findings

1. **Live Data Location**: `/mnt/coordinaton_mcp_data/production/data/`
   - Contains active instances (Kai, Zara, Viktor, Nova, Phoenix, Lupo)
   - Up-to-date messages (modern-art-portfolio team actively working)
   - Current projects and tasks

2. **Stale Data Location**: `/mnt/coordinaton_mcp_data/production-data/`
   - Outdated by ~3 days
   - Not being used by live server
   - **Backups are archiving THIS instead of live data** ⚠️

3. **Systemd Misconfiguration**
   - ReadWritePaths points to stale directory
   - Server can't write to actual data location due to security restrictions
   - Crash loop since deployment (likely never worked after systemd migration)

4. **Old Process Still Running**
   - Original manual start from Sep 18 still serving production
   - Not managed by systemd
   - Would lose on reboot (no automatic restart)

---

## Part 2: Immediate Critical Fixes

### Fix 1: Correct Systemd Service Configuration

**Update** `/etc/systemd/system/mcp-coordination.service`:

```ini
[Service]
Type=simple
User=root
Group=root
WorkingDirectory=/mnt/coordinaton_mcp_data/production
ExecStart=/usr/bin/node src/streamable-http-server.js
Environment=NODE_ENV=production
Environment=SSE_PORT=3444
Environment=SSE_HOST=localhost

# Corrected paths - point to ACTUAL data location
ReadWritePaths=/mnt/coordinaton_mcp_data/production/data
ReadWritePaths=/mnt/coordinaton_mcp_data/production/logs

# Security settings
NoNewPrivileges=yes
PrivateTmp=yes
ProtectSystem=strict
ProtectHome=yes
Restart=always
RestartSec=10
```

**Action Plan**:
1. Stop old manual process: `kill 450244`
2. Update systemd service file
3. Reload systemd: `systemctl daemon-reload`
4. Start service: `systemctl start mcp-coordination`
5. Verify: `systemctl status mcp-coordination`

### Fix 2: Correct Backup Configuration

**Current (WRONG)**:
```bash
# Backing up stale data
/mnt/coordinaton_mcp_data/production-data/ → production-data-backups/
```

**Corrected**:
```bash
# Backup actual live data
/mnt/coordinaton_mcp_data/production/data/ → production/data-backups/
```

**New Backup Script**: `/mnt/coordinaton_mcp_data/production/scripts/backup-production-data.sh`

```bash
#!/bin/bash
# Production Data Backup Script
# Backs up ACTUAL live production data

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="/mnt/coordinaton_mcp_data/production-backups/data-${TIMESTAMP}"
SOURCE_DIR="/mnt/coordinaton_mcp_data/production/data"

# Create backup
mkdir -p "$BACKUP_DIR"
cp -r "$SOURCE_DIR"/* "$BACKUP_DIR/"

# Compress
tar -czf "$BACKUP_DIR.tar.gz" -C "$BACKUP_DIR" .
rm -rf "$BACKUP_DIR"

# Keep only last 30 backups
ls -t /mnt/coordinaton_mcp_data/production-backups/data-*.tar.gz | tail -n +31 | xargs -r rm

echo "✅ Backup complete: $BACKUP_DIR.tar.gz"
```

**Add to crontab**:
```bash
# Backup production data every 6 hours
0 */6 * * * /mnt/coordinaton_mcp_data/production/scripts/backup-production-data.sh
```

---

## Part 3: Development/Production Architecture

### Design Principles

1. **Isolation**: Dev and prod must have completely separate data
2. **Safety**: Changes tested in dev before production deployment
3. **Flexibility**: Support multiple connection methods and protocols
4. **Automation**: Easy deployment from git to remote dev server
5. **Observability**: Clear status of which environment you're connected to

### Directory Structure

```
/mnt/coordinaton_mcp_data/
├── Human-Adjacent-Coordination/     # 🔧 DEV - Git repo (source of truth)
│   ├── src/                          # Development source code
│   ├── web-ui/                       # Development UI
│   ├── data/                         # Development data (isolated)
│   ├── logs/                         # Development logs
│   ├── .git/                         # Git repository
│   └── scripts/
│       ├── start-dev-server.sh       # NEW: Start development server
│       ├── deploy-to-production.sh   # EXISTING: Deploy to production
│       └── sync-prod-data-to-dev.sh  # NEW: Copy prod data for testing
│
├── production/                      # 🚀 PROD - Deployed code
│   ├── src/                          # Production source (from git)
│   ├── web-ui/                       # Production UI (from git)
│   ├── data/                         # **LIVE PRODUCTION DATA** ⚠️
│   │   ├── instances.json
│   │   ├── projects/
│   │   ├── messages/
│   │   └── lessons/
│   ├── logs/                         # Production logs
│   ├── node_modules/                 # Production dependencies
│   └── scripts/
│       └── backup-production-data.sh # Production backup
│
├── production-backups/              # 🗄️ Production data backups
│   ├── data-20251002_001500.tar.gz
│   ├── data-20251002_061500.tar.gz
│   └── ... (last 30 backups)
│
└── production-data/                 # ⚠️ DEPRECATED - Delete after migration
    └── [STALE DATA - DO NOT USE]
```

### Port Allocation

| Environment | HTTP Port | SSE Port | Access Method |
|-------------|-----------|----------|---------------|
| **Production** | 3444 | 3445 | https://smoothcurves.nexus (nginx) |
| **Development** | 3446 | 3447 | http://smoothcurves.nexus:3446 or direct IP |
| **Local Dev** | 3448 | 3449 | Local developer machine |

### Protocol Support

Both dev and production should support **dual protocol** access:

```javascript
// Configuration in streamable-http-server.js
const CONFIG = {
  http: {
    enabled: true,
    port: process.env.HTTP_PORT || 3444
  },
  sse: {
    enabled: true, // Re-enable SSE for platforms that need it
    port: process.env.SSE_PORT || 3445
  },
  environment: process.env.NODE_ENV || 'development'
};
```

**Benefits**:
- Claude Code/Desktop: Use HTTP streaming (preferred)
- Other platforms: Can fallback to SSE if needed
- Testing: Switch protocols to verify compatibility

---

## Part 4: Development Workflow

### Workflow 1: Direct Server Development

Developer works directly on the server in the dev environment:

```bash
# 1. SSH into server
ssh root@smoothcurves.nexus

# 2. Navigate to dev environment
cd /mnt/coordinaton_mcp_data/Human-Adjacent-Coordination

# 3. Make changes (edit src/, web-ui/, etc.)
vim src/handlers/messaging.js

# 4. Restart dev server
./scripts/restart-dev-server.sh

# 5. Test changes
curl http://localhost:3446/health

# 6. When ready, deploy to production
./scripts/deploy-to-production.sh
```

### Workflow 2: Remote Development (Git-based)

Developer works locally, pushes to GitHub, remote dev server pulls:

```bash
# LOCAL MACHINE
# 1. Make changes
git checkout -b feature/better-messaging
vim src/handlers/messaging.js

# 2. Commit and push
git add .
git commit -m "Fix metadata persistence in messaging"
git push origin feature/better-messaging

# REMOTE SERVER (triggered automatically or manually)
# 3. Server pulls changes
cd /mnt/coordinaton_mcp_data/Human-Adjacent-Coordination
git pull origin feature/better-messaging

# 4. Restart dev server automatically
# (via git hook or manual trigger)
./scripts/restart-dev-server.sh
```

### Workflow 3: Testing with Production-like Data

Safely test with realistic data without touching production:

```bash
# 1. Sync production data to development (READ-ONLY copy)
./scripts/sync-prod-data-to-dev.sh

# 2. Development environment now has production data snapshot
# Safe to test queries, filters, migrations, etc.

# 3. Make changes and test
vim src/handlers/messaging.js
./scripts/restart-dev-server.sh

# 4. Verify fixes work with real data
# Test messaging queries, project filters, etc.

# 5. When satisfied, deploy to production
./scripts/deploy-to-production.sh
```

---

## Part 5: Connection Methods

### Method 1: Direct URL (Developers on VPN/SSH)

```bash
# Development environment
export MCP_SERVER_URL="http://smoothcurves.nexus:3446"
claude mcp add dev-coordination --transport http --url $MCP_SERVER_URL

# Production environment
export MCP_SERVER_URL="https://smoothcurves.nexus"
claude mcp add prod-coordination --transport http --url $MCP_SERVER_URL
```

### Method 2: Nginx Proxy (External Developers)

**New nginx configuration** for development environment:

```nginx
# Development MCP Server (port 3446)
location /mcp/dev {
    proxy_pass http://localhost:3446;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;

    # Add header to identify environment
    add_header X-MCP-Environment "development" always;
}

# Production MCP Server (port 3444) - existing
location /mcp {
    proxy_pass http://localhost:3444;
    # ... existing production config
    add_header X-MCP-Environment "production" always;
}
```

Access via proxy:
```bash
# Development through nginx
https://smoothcurves.nexus/mcp/dev

# Production through nginx
https://smoothcurves.nexus/mcp
```

### Method 3: SSE Support (Legacy Platforms)

Some platforms may still need SSE. Run SSE servers on separate ports:

```bash
# Production SSE (port 3445)
SSE_PORT=3445 NODE_ENV=production node src/sse-server.js

# Development SSE (port 3447)
SSE_PORT=3447 NODE_ENV=development node src/sse-server.js
```

---

## Part 6: Implementation Scripts

### Script 1: Start Development Server

**File**: `scripts/start-dev-server.sh`

```bash
#!/bin/bash
# Start Development MCP Server

set -e

cd /mnt/coordinaton_mcp_data/Human-Adjacent-Coordination

# Kill existing dev server if running
pkill -f "HTTP_PORT=3446" || true
pkill -f "SSE_PORT=3447" || true

# Start HTTP streaming server
HTTP_PORT=3446 SSE_HOST=0.0.0.0 NODE_ENV=development \
  node src/streamable-http-server.js > logs/dev-http.log 2>&1 &

# Start SSE server (optional)
SSE_PORT=3447 SSE_HOST=0.0.0.0 NODE_ENV=development \
  node src/sse-server.js > logs/dev-sse.log 2>&1 &

echo "✅ Development servers started"
echo "   HTTP: http://localhost:3446"
echo "   SSE:  http://localhost:3447"
echo "   Logs: tail -f logs/dev-*.log"
```

### Script 2: Restart Development Server

**File**: `scripts/restart-dev-server.sh`

```bash
#!/bin/bash
# Restart Development Server (for remote git-based workflow)

set -e

cd /mnt/coordinaton_mcp_data/Human-Adjacent-Coordination

echo "🔄 Pulling latest changes from git..."
git pull

echo "📦 Installing dependencies (if package.json changed)..."
npm install

echo "🔄 Restarting development server..."
./scripts/start-dev-server.sh

echo "✅ Development server restarted"
echo "   Test at: http://smoothcurves.nexus:3446/health"
```

### Script 3: Sync Production Data to Development

**File**: `scripts/sync-prod-data-to-dev.sh`

```bash
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
tar -czf "$BACKUP_DIR/dev-data-backup-$TIMESTAMP.tar.gz" -C "$DEV_DATA" .

# Clear dev data
echo "🗑️  Clearing development data..."
rm -rf "$DEV_DATA"/*

# Copy production snapshot
echo "📥 Copying production data snapshot..."
cp -r "$PROD_DATA"/* "$DEV_DATA/"

# Mark as development snapshot
echo "{\"environment\": \"development\", \"snapshot_from_production\": \"$TIMESTAMP\"}" \
  > "$DEV_DATA/DEVELOPMENT_SNAPSHOT.json"

echo "✅ Development data synced from production"
echo "   Snapshot timestamp: $TIMESTAMP"
echo "   Dev data backup: $BACKUP_DIR/dev-data-backup-$TIMESTAMP.tar.gz"
```

### Script 4: Enhanced Deploy to Production

**Update** `scripts/deploy-to-production.sh`:

```bash
#!/bin/bash
# Deploy Development Code to Production
# Enhanced with safety checks and environment validation

set -e

DEV_DIR="/mnt/coordinaton_mcp_data/Human-Adjacent-Coordination"
PROD_DIR="/mnt/coordinaton_mcp_data/production"
BACKUP_DIR="/mnt/coordinaton_mcp_data/production-backups"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

cd "$DEV_DIR"

# Safety checks
echo "🔍 Pre-deployment checks..."

# Check 1: Git status
if [[ -n $(git status -s) ]]; then
    echo "⚠️  Warning: Uncommitted changes in development"
    git status -s
    read -p "Continue anyway? (y/N): " -n 1 -r
    echo
    [[ ! $REPLY =~ ^[Yy]$ ]] && exit 1
fi

# Check 2: Development server running
if ! curl -s http://localhost:3446/health > /dev/null 2>&1; then
    echo "⚠️  Warning: Development server not responding"
    read -p "Deploy anyway? (y/N): " -n 1 -r
    echo
    [[ ! $REPLY =~ ^[Yy]$ ]] && exit 1
fi

# Backup current production
echo "📦 Backing up production code..."
mkdir -p "$BACKUP_DIR"
tar -czf "$BACKUP_DIR/production-code-$TIMESTAMP.tar.gz" \
    -C "$PROD_DIR" src web-ui package.json

# Backup production data (CRITICAL!)
echo "📦 Backing up production DATA..."
tar -czf "$BACKUP_DIR/production-data-$TIMESTAMP.tar.gz" \
    -C "$PROD_DIR/data" .

# Deploy code
echo "🚀 Deploying to production..."
rsync -av --delete "$DEV_DIR/src/" "$PROD_DIR/src/"
rsync -av --delete "$DEV_DIR/web-ui/" "$PROD_DIR/web-ui/"
cp "$DEV_DIR/package.json" "$PROD_DIR/"

# Install production dependencies
echo "📦 Installing production dependencies..."
cd "$PROD_DIR"
npm install --production

# Restart production server
echo "🔄 Restarting production server..."
systemctl restart mcp-coordination

# Verify deployment
echo "✅ Waiting for production server..."
sleep 5

if curl -s https://smoothcurves.nexus/health > /dev/null 2>&1; then
    echo "✅ DEPLOYMENT SUCCESSFUL"
    echo "   Production: https://smoothcurves.nexus"
    echo "   Backup: $BACKUP_DIR/production-*-$TIMESTAMP.tar.gz"
else
    echo "❌ DEPLOYMENT FAILED - Server not responding"
    echo "   Rollback available: $BACKUP_DIR/production-code-$TIMESTAMP.tar.gz"
    exit 1
fi
```

---

## Part 7: Testing with Realistic Data

### Scenario 1: Testing Messaging Fixes

```bash
# 1. Sync production data to development
./scripts/sync-prod-data-to-dev.sh

# 2. Development environment now has snapshot of real messages
# Including modern-art-portfolio team messages

# 3. Test messaging fixes
cd /mnt/coordinaton_mcp_data/Human-Adjacent-Coordination
vim src/handlers/messaging.js  # Fix metadata persistence

# 4. Restart dev server
./scripts/restart-dev-server.sh

# 5. Test with real data via development MCP
claude mcp add dev-mcp --transport http --url http://localhost:3446

# 6. In Claude Code connected to dev MCP
# Test: Query for modern-art-portfolio messages
# Verify: Metadata is preserved, filtering works

# 7. When confirmed working, deploy
./scripts/deploy-to-production.sh
```

### Scenario 2: Testing Data Migrations

```bash
# 1. Sync production snapshot
./scripts/sync-prod-data-to-dev.sh

# 2. Write migration script
vim scripts/migrate-message-schema-v4.js

# 3. Test on development data
node scripts/migrate-message-schema-v4.js --environment=development --dry-run

# 4. Verify results
node scripts/verify-migration.js

# 5. Apply to development
node scripts/migrate-message-schema-v4.js --environment=development

# 6. Test with migrated data
./scripts/restart-dev-server.sh
# ... test extensively ...

# 7. When confident, apply to production
node scripts/migrate-message-schema-v4.js --environment=production --backup

# 8. Restart production
systemctl restart mcp-coordination
```

---

## Part 8: Implementation Checklist

### Phase 1: Critical Fixes (DO IMMEDIATELY)

- [ ] **Fix systemd service configuration** (ReadWritePaths to correct data location)
- [ ] **Test systemd service** (stop old process, start via systemd)
- [ ] **Verify production still works** (existing teams can connect)
- [ ] **Create production data backup script** (backup ACTUAL live data)
- [ ] **Run immediate backup** (before any other changes)
- [ ] **Schedule automated backups** (cron job every 6 hours)
- [ ] **Archive stale production-data directory** (after confirming backups work)

### Phase 2: Development Environment (1-2 days)

- [ ] **Create start-dev-server.sh script**
- [ ] **Create restart-dev-server.sh script**
- [ ] **Create sync-prod-data-to-dev.sh script**
- [ ] **Test development server on port 3446**
- [ ] **Configure nginx proxy** for /mcp/dev location
- [ ] **Update deployment script** with safety checks
- [ ] **Document developer workflows**

### Phase 3: SSE Support (Optional, 1 day)

- [ ] **Re-enable SSE server code**
- [ ] **Test SSE on development port 3447**
- [ ] **Test SSE on production port 3445**
- [ ] **Configure nginx for SSE endpoints**
- [ ] **Document SSE connection methods**

### Phase 4: Testing & Validation (1 day)

- [ ] **Test remote git workflow** (local dev → push → remote pull → restart)
- [ ] **Test direct server development workflow**
- [ ] **Test production data sync to development**
- [ ] **Test messaging fixes in development environment**
- [ ] **Test deployment to production**
- [ ] **Verify rollback procedures**

---

## Part 9: Rollback & Recovery

### Rollback Production Code

```bash
# If deployment fails, restore from backup
TIMESTAMP="20251002_143000"  # Your backup timestamp
cd /mnt/coordinaton_mcp_data/production-backups

# Extract backup
tar -xzf "production-code-$TIMESTAMP.tar.gz" -C /tmp/restore

# Restore code
rsync -av /tmp/restore/src/ /mnt/coordinaton_mcp_data/production/src/
rsync -av /tmp/restore/web-ui/ /mnt/coordinaton_mcp_data/production/web-ui/
cp /tmp/restore/package.json /mnt/coordinaton_mcp_data/production/

# Restart
systemctl restart mcp-coordination
```

### Rollback Production Data (EXTREME EMERGENCY ONLY)

```bash
# ONLY if data corruption/catastrophic failure
TIMESTAMP="20251002_140000"
cd /mnt/coordinaton_mcp_data/production-backups

# Stop production server
systemctl stop mcp-coordination

# Backup current data (even if corrupted)
tar -czf "/tmp/EMERGENCY-corrupted-data-$(date +%Y%m%d_%H%M%S).tar.gz" \
    -C /mnt/coordinaton_mcp_data/production/data .

# Restore from backup
tar -xzf "production-data-$TIMESTAMP.tar.gz" \
    -C /mnt/coordinaton_mcp_data/production/data/

# Restart
systemctl start mcp-coordination

# WARN TEAM: All data changes since backup are lost!
```

---

## Part 10: Questions for Lupo

Before implementation, need decisions on:

1. **Systemd Fix Timing**:
   - OK to stop old process (PID 450244) and move to systemd management?
   - Preferred time for this transition (low-traffic period)?

2. **SSE Support Priority**:
   - Which platforms actually need SSE vs HTTP streaming?
   - Should we re-enable SSE immediately or defer?

3. **Development Environment Ports**:
   - Confirmed ports: Dev HTTP=3446, Dev SSE=3447?
   - Should development be accessible externally or localhost-only?

4. **Backup Schedule**:
   - Every 6 hours sufficient? Or more frequent?
   - How many backups to retain (currently planned: 30)?

5. **Git Workflow**:
   - Should we set up git hooks for automatic dev server restart?
   - Which branches should auto-deploy to development?

6. **Nginx Configuration**:
   - Add /mcp/dev endpoint to nginx for external dev access?
   - Or keep development localhost-only?

---

## Conclusion

This architecture provides:

✅ **Safety**: Critical data backup fixed, no more working directly on production
✅ **Isolation**: Dev and prod completely separated
✅ **Flexibility**: Multiple protocols, connection methods, workflows
✅ **Automation**: Git-based deployment, easy restarts
✅ **Observability**: Clear environment indicators

**Next Steps**:
1. Review and approve this proposal
2. Execute Phase 1 (critical fixes) immediately
3. Schedule Phases 2-4 based on team availability

**Risks if we don't fix**:
- Systemd service will continue crash-looping (wastes resources)
- Production data NOT being backed up (catastrophic loss risk)
- All development touches production (dangerous)
- No safe way to test V2 changes

---

*This proposal is ready for implementation pending Lupo's approval and answers to open questions.*
