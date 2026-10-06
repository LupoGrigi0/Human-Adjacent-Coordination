# Bastion: V1 to V2 Production Cutover

**From:** Crossing (Integration Engineer)
**To:** Bastion (DevOps)
**Date:** 2025-12-23
**Re:** Replacing V1 production server with V2

---

## Executive Summary

The V2 codebase is ready. The directory consolidation is complete. It's time to shut down the V1 production server and replace it with V2.

**End state:** One server running V2 code from main branch at `https://smoothcurves.nexus/mcp/`

---

## Recommended Order of Operations

### Step 1: Merge v2 → main (Crossing/Lupo)

Before you touch production, we'll merge the v2 branch down to main:

```bash
cd /mnt/coordinaton_mcp_data/worktrees/foundation
git checkout main
git merge origin/v2 --no-edit
git push origin main
```

This makes main contain the V2 code. Production impact: **none yet** (V1 is still running).

### Step 2: Stop V1 Production Server (Bastion)

```bash
# Check what's running
sudo systemctl status mcp-coordination

# Stop V1
sudo systemctl stop mcp-coordination
```

The V1 server runs from `/mnt/coordinaton_mcp_data/production/` - this directory can be archived after cutover.

### Step 3: Update Production Configuration (Bastion)

The V2 server needs to know where data lives. Two options:

**Option A: Environment Variable (Recommended)**

Update the systemd service file to set `V2_DATA_ROOT`:

```bash
sudo vim /etc/systemd/system/mcp-coordination.service
```

Add to `[Service]` section:
```ini
Environment=V2_DATA_ROOT=/mnt/coordinaton_mcp_data/
Environment=SSE_PORT=3444
Environment=NODE_ENV=production
```

**Option B: Use Defaults**

The code defaults to `/mnt/coordinaton_mcp_data/` so if no env var is set, it will use the consolidated location automatically.

### Step 4: Point Production at V2 Code (Bastion)

You have options for where production runs from:

**Option A: Run from Human-Adjacent-Coordination (main branch)**

```bash
cd /mnt/coordinaton_mcp_data/Human-Adjacent-Coordination
git checkout main
git pull origin main
npm install  # if dependencies changed
```

Update systemd to run from this directory.

**Option B: Create new production directory**

```bash
cd /mnt/coordinaton_mcp_data
git clone https://github.com/LupoGrigi0/Human-Adjacent-Coordination.git v2-production
cd v2-production
git checkout main
npm install
```

Update systemd to run from `/mnt/coordinaton_mcp_data/v2-production/`.

### Step 5: Update Systemd Service (Bastion)

Example updated service file:

```ini
[Unit]
Description=MCP Coordination System - V2 Production
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/mnt/coordinaton_mcp_data/Human-Adjacent-Coordination
Environment=V2_DATA_ROOT=/mnt/coordinaton_mcp_data/
Environment=SSE_PORT=3444
Environment=SSE_HOST=0.0.0.0
Environment=NODE_ENV=production
ExecStart=/usr/bin/node src/streamable-http-server.js
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

Then:
```bash
sudo systemctl daemon-reload
sudo systemctl start mcp-coordination
sudo systemctl status mcp-coordination
```

### Step 6: Verify Production (Bastion)

```bash
# Health check
curl https://smoothcurves.nexus/mcp/health

# Should show V2 version
curl -s https://smoothcurves.nexus/mcp/health | jq '.version'
# Expected: "2.0.0"

# Test bootstrap
curl -X POST https://smoothcurves.nexus/mcp/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}' | jq '.result.tools | length'
# Should show 40+ tools (V2 has more than V1)
```

### Step 7: Update nginx (Bastion, if needed)

The nginx config probably doesn't need changes if:
- Production URL stays at `/mcp/`
- Port stays at 3444

But verify:
```bash
cat /etc/nginx/sites-enabled/smoothcurves.nexus | grep -A10 "location /mcp"
```

If the proxy_pass points to localhost:3444, you're good.

### Step 8: Remove /mcp/dev/ endpoint? (Decision needed)

Once V2 is production, do we still need `/mcp/dev/`?

**Option A: Keep it** - Useful for testing feature branches before merge
**Option B: Remove it** - Simplify, one endpoint only

If keeping it, the dev server continues running on port 3446.

---

## Data Paths Summary

### Before (V1)
```
Production code: /mnt/coordinaton_mcp_data/production/
Production data: /mnt/coordinaton_mcp_data/production/data/
```

### After (V2)
```
Production code: /mnt/coordinaton_mcp_data/Human-Adjacent-Coordination/ (or v2-production/)
Production data: /mnt/coordinaton_mcp_data/  (consolidated - instances/, projects/, roles/, etc.)
```

### Key Directories (V2 consolidated structure)
```
/mnt/coordinaton_mcp_data/
├── instances/           # Instance data (preferences.json, diary.md, etc.)
├── projects/            # Project data
├── roles/               # Role definitions
├── personalities/       # Personality definitions
├── permissions/         # RBAC permissions
├── default/             # Default bootstrap documents
├── wake-logs/           # Wake job logs
├── wake-jobs/           # Wake job state
└── Human-Adjacent-Coordination/  # Code (main branch)
```

---

## Rollback Plan

If V2 production fails:

```bash
# 1. Stop V2
sudo systemctl stop mcp-coordination

# 2. Revert systemd to V1 config
sudo vim /etc/systemd/system/mcp-coordination.service
# Change WorkingDirectory back to /mnt/coordinaton_mcp_data/production/
# Remove V2_DATA_ROOT env var

# 3. Restart V1
sudo systemctl daemon-reload
sudo systemctl start mcp-coordination

# 4. Verify V1 is back
curl https://smoothcurves.nexus/mcp/health
```

---

## Post-Cutover Cleanup

After V2 is stable (24-48 hours):

1. **Archive V1 production directory:**
   ```bash
   mv /mnt/coordinaton_mcp_data/production \
      /mnt/coordinaton_mcp_data/archive/v1-production-$(date +%Y%m%d)
   ```

2. **Archive v2-dev-data (already deprecated):**
   ```bash
   mv /mnt/coordinaton_mcp_data/v2-dev-data \
      /mnt/coordinaton_mcp_data/archive/v2-dev-data-$(date +%Y%m%d)
   ```

3. **Update V2-DEVELOPER-GUIDE.md** - Remove V1 references, update paths

---

## Questions for Bastion

1. **Secrets:** Does V2 production need any secrets beyond what's in the current systemd config? (WAKE_API_KEY, tokens, etc.)

2. **SSL:** Any SSL config changes needed, or does nginx handle all of that?

3. **Monitoring:** Any health check or monitoring scripts that reference V1 paths?

4. **Backups:** Are there automated backups of `/mnt/coordinaton_mcp_data/production/data/` that need to be updated to backup the new consolidated location?

---

## Contact

If you have questions:
- **Crossing** - Integration, API, data paths
- **Lupo** - Approvals, decisions
- **Canvas** - If UI breaks after cutover

---

**TL;DR:**
1. We merge v2→main
2. You stop V1, update systemd to point at main branch code with V2_DATA_ROOT set
3. You start V2, verify it works
4. We archive the old directories after 24-48h

---

*"One server. One branch. One source of truth."*

— Crossing
