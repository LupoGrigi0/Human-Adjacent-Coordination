# V2 Development Environment - System Handoff

**Created:** 2025-11-10
**Author:** Bastion (DevOps Specialist, claude-code-devops-Bastion-20251110)
**Purpose:** Complete documentation of V2 dev environment for future maintainers

---

## Executive Summary

The V2 development environment is **fully operational** and ready for team use. It provides:
- Complete isolation from production (separate port, data, code)
- Auto-deployment on git push to `v2` branch
- Easy team connection via HACS-Dev skill
- Manual controls for troubleshooting

**Status:** ✅ Production-ready for development use

---

## Architecture Overview

### High-Level Flow

```
Team Members (worktrees)
  ↓ commit & push to v2 branch
GitHub (v2 branch)
  ↓ git pull (triggered by post-merge hook)
/mnt/coordinaton_mcp_data/v2-dev/
  • Port: 3446
  • Data: /mnt/coordinaton_mcp_data/v2-dev-data/
  • Branch: v2
  ↓
nginx /mcp/dev endpoint
  ↓
https://smoothcurves.nexus/mcp/dev
  ↓
Team connects via HACS-Dev skill
```

### Directory Structure

```
/mnt/coordinaton_mcp_data/
├── production/                          # V1 Production (DON'T TOUCH)
│   ├── src/                            # Port 3444
│   └── data/                           # Live production data
│
├── v2-dev/                             # V2 Development Server
│   ├── .git/
│   │   └── hooks/
│   │       └── post-merge             # Auto-restart hook
│   ├── src/                           # V2 code (v2 branch)
│   ├── scripts/
│   │   ├── start-dev-server.sh        # Start server
│   │   └── restart-dev-server.sh      # Restart + git pull
│   ├── logs/
│   │   └── dev-server.log             # Server logs
│   └── node_modules/                  # Dependencies
│
├── v2-dev-data/                        # V2 Development Data (ISOLATED)
│   └── (empty initially)              # Safe to wipe/reset
│
└── worktrees/                          # Team workspaces
    ├── devops/                        # Bastion's workspace
    └── foundation/                    # Foundation developer
```

---

## Key Components

### 1. V2 Development Server

**Location:** `/mnt/coordinaton_mcp_data/v2-dev/`
**Branch:** `v2`
**Port:** 3446
**Process:** Node.js running `src/streamable-http-server.js`

**Environment Variables:**
```bash
SSE_PORT=3446                          # Port (NOT HTTP_PORT!)
SSE_HOST=0.0.0.0                       # Listen on all interfaces
NODE_ENV=development                   # Development mode
DATA_PATH=/mnt/coordinaton_mcp_data/v2-dev-data/  # Isolated data
```

**CRITICAL:** Server uses `SSE_PORT`, not `HTTP_PORT`. This caught me initially!

### 2. Isolated Data Directory

**Location:** `/mnt/coordinaton_mcp_data/v2-dev-data/`

- Completely separate from production data
- Safe to delete and recreate for testing
- Not backed up (development only)
- Empty initially until team starts using dev environment

### 3. Git Hook (Auto-Restart)

**Location:** `/mnt/coordinaton_mcp_data/v2-dev/.git/hooks/post-merge`

**What it does:**
- Triggers when `git pull` completes
- Calls `restart-dev-server.sh`
- Automatically deploys latest v2 branch code

**How it works:**
```bash
# When someone pushes to v2 branch:
1. Developer: git push origin v2
2. GitHub: v2 branch updated
3. Dev server: git pull origin v2
4. post-merge hook: triggers restart
5. restart-dev-server.sh: kills old server, starts new one
6. New code is live in seconds
```

### 4. nginx Configuration

**File:** `/etc/nginx/sites-available/smoothcurves-nexus`

**Relevant section:**
```nginx
# DEVELOPMENT MCP endpoint (port 3446)
location /mcp/dev/ {
    # Rewrite /mcp/dev/xxx to /xxx before proxying
    rewrite ^/mcp/dev/(.*) /$1 break;
    proxy_pass http://localhost:3446;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    # ... SSE-specific headers ...
}
```

**Note:** This was already configured! Previous instance set this up.

### 5. HACS-Dev Skill

**Location:** `src/HACS/hacs-coordination-dev/SKILL.md`

**Purpose:** Easy team connection to dev environment

**How team uses it:**
1. Git pull to get latest skill
2. Skill automatically connects to `https://smoothcurves.nexus/mcp/dev`
3. Works for both local and web-based Claude instances

---

## Operational Procedures

### Starting the Dev Server

**Command:**
```bash
/mnt/coordinaton_mcp_data/v2-dev/scripts/start-dev-server.sh
```

**What it does:**
1. Kills any existing dev server on port 3446
2. Verifies port is free
3. Starts Node.js server with proper environment variables
4. Waits 3 seconds and verifies process started
5. Outputs access URLs and log location

**Success indicators:**
```
✅ Port 3446 is free
🚀 Starting V2 Dev MCP Server...
✅ V2 Dev Server started successfully!
```

### Restarting the Dev Server

**Command:**
```bash
/mnt/coordinaton_mcp_data/v2-dev/scripts/restart-dev-server.sh
```

**What it does:**
1. Git pulls latest from v2 branch
2. Checks if package.json changed
3. Runs `npm install` if dependencies updated
4. Calls start-dev-server.sh

**Use when:**
- Manual deployment needed
- Auto-restart failed
- Testing after major changes
- Troubleshooting server issues

### Viewing Logs

**Command:**
```bash
tail -f /mnt/coordinaton_mcp_data/v2-dev/logs/dev-server.log
```

**What to look for:**
- Server startup messages
- API calls and responses
- Error stack traces
- Port binding confirmation

### Health Checks

**Local check:**
```bash
curl http://localhost:3446/health
```

**Through nginx:**
```bash
curl https://smoothcurves.nexus/mcp/dev/health
```

**Expected response:**
```json
{
  "status": "healthy",
  "timestamp": "2025-11-10T06:46:03.478Z",
  "server": "Streamable HTTP MCP Coordination System",
  "version": "1.0.0",
  "port": "3446",
  "sessions": 0,
  "sseClients": 0,
  "uptime": 11.363077521
}
```

### Verifying Auto-Restart Works

**Test the git hook:**
```bash
cd /mnt/coordinaton_mcp_data/v2-dev
git pull origin v2

# Watch logs to see restart happen
tail -f logs/dev-server.log

# Verify server restarted
curl http://localhost:3446/health
# Check uptime - should be low (recently restarted)
```

---

## Troubleshooting Guide

### Issue: Port 3446 Already in Use

**Symptoms:**
```
❌ ERROR: Port 3446 still in use!
```

**Diagnosis:**
```bash
ss -tlnp | grep 3446
# Shows process ID using the port
```

**Solution:**
```bash
# Find and kill the process
pkill -f "SSE_PORT=3446"

# Or kill by PID
kill <PID>

# Verify port freed
ss -tlnp | grep 3446

# Restart server
/mnt/coordinaton_mcp_data/v2-dev/scripts/start-dev-server.sh
```

### Issue: Server Starts But nginx Returns 502

**Symptoms:**
- `curl http://localhost:3446/health` works
- `curl https://smoothcurves.nexus/mcp/dev/health` returns 502

**Diagnosis:**
```bash
# Check if server is listening on correct interface
ss -tlnp | grep 3446
# Should show 0.0.0.0:3446 (all interfaces)

# Check nginx error logs
tail -50 /var/log/nginx/error.log
```

**Solution:**
```bash
# Ensure SSE_HOST=0.0.0.0 (not localhost)
# Check start-dev-server.sh has correct env vars

# Restart nginx
systemctl restart nginx

# Restart dev server
/mnt/coordinaton_mcp_data/v2-dev/scripts/restart-dev-server.sh
```

### Issue: Auto-Restart Not Working

**Symptoms:**
- Push to v2 branch successful
- Dev server still showing old code

**Diagnosis:**
```bash
# Check git hook exists
ls -la /mnt/coordinaton_mcp_data/v2-dev/.git/hooks/post-merge

# Check hook is executable
# Should show: -rwxr-xr-x
```

**Solution:**
```bash
# Make hook executable
chmod +x /mnt/coordinaton_mcp_data/v2-dev/.git/hooks/post-merge

# Verify hook contents
cat /mnt/coordinaton_mcp_data/v2-dev/.git/hooks/post-merge

# Manual restart to recover
/mnt/coordinaton_mcp_data/v2-dev/scripts/restart-dev-server.sh
```

### Issue: Server Process Running But Not Responding

**Symptoms:**
- Process shows in `ps aux`
- Port not listening (ss shows nothing)
- No responses to health checks

**Diagnosis:**
```bash
# Check logs for errors
tail -100 /mnt/coordinaton_mcp_data/v2-dev/logs/dev-server.log

# Look for:
# - Module not found errors
# - Port binding errors
# - Uncaught exceptions
```

**Common causes:**
1. **Missing dependencies:** Run `npm install` in v2-dev/
2. **Wrong environment variable:** Check SSE_PORT (not HTTP_PORT)
3. **Permission issues:** Check DATA_PATH directory exists and is writable

**Solution:**
```bash
cd /mnt/coordinaton_mcp_data/v2-dev

# Install dependencies
npm install

# Verify DATA_PATH exists
ls -la /mnt/coordinaton_mcp_data/v2-dev-data/

# Restart with explicit env vars
SSE_PORT=3446 SSE_HOST=0.0.0.0 NODE_ENV=development \
  DATA_PATH=/mnt/coordinaton_mcp_data/v2-dev-data/ \
  node src/streamable-http-server.js
```

### Issue: Team Can't Connect via HACS-Dev Skill

**Symptoms:**
- Skill not found error
- Connection timeouts

**Diagnosis:**
```bash
# Check skill exists
ls -la src/HACS/hacs-coordination-dev/SKILL.md

# Verify dev server responding
curl https://smoothcurves.nexus/mcp/dev/health
```

**Solution:**
```bash
# Team members need to git pull
# Skill is committed to v2 branch

# For local instances:
cd <their-local-repo>
git pull origin v2

# For web instances:
# They should see skill after repo update
```

---

## Security & Safety

### Production Protection

**Critical safeguards:**
1. **Different port:** Dev (3446) vs Prod (3444) - can't accidentally conflict
2. **Different data:** Completely isolated directories
3. **Different code:** Separate git checkout tracking v2 branch
4. **Different nginx endpoint:** /mcp/dev vs /mcp

**How to verify isolation:**
```bash
# Check production is unaffected
curl https://smoothcurves.nexus/mcp/health
# Should show port 3444

curl https://smoothcurves.nexus/mcp/dev/health
# Should show port 3446
```

### Network Safety

**Important:** Lupo connects via SSH and VSCode. Be careful when:
- Modifying nginx configuration
- Restarting nginx
- Changing network settings

**Always test before reloading nginx:**
```bash
# Test config syntax
nginx -t

# Only reload if test passes
systemctl reload nginx
```

### Data Safety

**Dev data is NOT backed up.**

If you need to preserve dev data:
```bash
# Manual backup
tar -czf /tmp/v2-dev-data-backup-$(date +%Y%m%d).tar.gz \
  /mnt/coordinaton_mcp_data/v2-dev-data/

# Restore if needed
tar -xzf /tmp/v2-dev-data-backup-YYYYMMDD.tar.gz -C /
```

---

## Integration Points

### Git Workflow

**Team member pushes to v2:**
```bash
# In worktree
git commit -m "feat: new feature"
git push origin v2
```

**Dev server receives update:**
```bash
# Automatically via git hook:
1. post-merge hook triggers
2. restart-dev-server.sh runs
3. git pull origin v2
4. npm install (if package.json changed)
5. Server restarts with new code
```

### nginx Integration

**Request flow:**
```
Client → nginx :443 (HTTPS)
  ↓
/mcp/dev/ endpoint match
  ↓
Rewrite: /mcp/dev/health → /health
  ↓
proxy_pass to localhost:3446
  ↓
Dev server responds
```

**SSL/TLS:**
- Shared wildcard certificate for *.smoothcurves.nexus
- nginx handles SSL termination
- Dev server only needs HTTP

---

## Performance & Monitoring

### Expected Resource Usage

**Normal operation:**
- Memory: ~50-60MB
- CPU: Minimal (event-driven)
- Network: < 1MB/s typical

**Check resource usage:**
```bash
# Find dev server PID
ps aux | grep "SSE_PORT=3446"

# Check memory/CPU
top -p <PID>
```

### Log Management

**Log location:** `/mnt/coordinaton_mcp_data/v2-dev/logs/dev-server.log`

**Log rotation:** Not currently configured (dev environment)

**If logs grow large:**
```bash
# Truncate log (safe while server running)
> /mnt/coordinaton_mcp_data/v2-dev/logs/dev-server.log

# Or archive and start fresh
mv logs/dev-server.log logs/dev-server-$(date +%Y%m%d).log
touch logs/dev-server.log
```

---

## Key Lessons Learned

### Technical Discoveries

1. **SSE_PORT vs HTTP_PORT:** Server uses `SSE_PORT` environment variable, not `HTTP_PORT`. This caused initial failure until I read the source code.

2. **nginx already configured:** The `/mcp/dev/` endpoint and proxy configuration already existed from previous work. Didn't need to create it!

3. **Git hooks work great:** The post-merge hook for auto-restart is simple and reliable. Team just pushes and it deploys.

4. **Skills are ZIP files:** Claude skills are packaged as .skill files (ZIP archives). Just commit the SKILL.md and it works.

### Operational Insights

1. **Separate clone vs worktree:** Chose separate clone at v2-dev/ because:
   - Clearer separation (can't accidentally touch production)
   - Simpler for team (no worktree complexity)
   - Standard industry pattern
   - Easy to blow away and recreate if needed

2. **Auto-restart is essential:** Without git hook, team would need to SSH and manually restart. Hook makes it seamless.

3. **Health endpoint critical:** Simple `/health` check makes monitoring and troubleshooting much easier.

### Future Considerations

1. **Consider systemd service:** Currently manual process. Could create systemd service for auto-start on boot.

2. **Log rotation:** If dev environment used heavily, add logrotate configuration.

3. **Data migrations:** When testing V2 data migrations, may want backup/restore scripts.

4. **Performance monitoring:** If team reports slowness, add more detailed monitoring.

---

## Quick Reference Commands

```bash
# Start dev server
/mnt/coordinaton_mcp_data/v2-dev/scripts/start-dev-server.sh

# Restart dev server (with git pull)
/mnt/coordinaton_mcp_data/v2-dev/scripts/restart-dev-server.sh

# View logs
tail -f /mnt/coordinaton_mcp_data/v2-dev/logs/dev-server.log

# Health check (local)
curl http://localhost:3446/health

# Health check (via nginx)
curl https://smoothcurves.nexus/mcp/dev/health

# Check process
ps aux | grep "SSE_PORT=3446"

# Check port
ss -tlnp | grep 3446

# Kill dev server
pkill -f "SSE_PORT=3446"

# Pull latest v2 code manually
cd /mnt/coordinaton_mcp_data/v2-dev && git pull origin v2

# Test git hook
cd /mnt/coordinaton_mcp_data/v2-dev && git pull origin v2 && tail -f logs/dev-server.log
```

---

## Future Maintainer Notes

### If You Need to Rebuild

**Complete rebuild from scratch:**
```bash
# 1. Stop and remove old dev environment
pkill -f "SSE_PORT=3446"
rm -rf /mnt/coordinaton_mcp_data/v2-dev
rm -rf /mnt/coordinaton_mcp_data/v2-dev-data

# 2. Clone fresh
cd /mnt/coordinaton_mcp_data
git clone -b v2 https://github.com/LupoGrigi0/Human-Adjacent-Coordination.git v2-dev

# 3. Install dependencies
cd v2-dev
npm install

# 4. Create data directory
mkdir -p /mnt/coordinaton_mcp_data/v2-dev-data

# 5. Create git hook
cat > .git/hooks/post-merge << 'EOF'
#!/bin/bash
echo "🔔 Git post-merge hook triggered"
echo "   Restarting V2 dev server..."
/mnt/coordinaton_mcp_data/v2-dev/scripts/restart-dev-server.sh
echo "✅ Auto-restart complete"
EOF
chmod +x .git/hooks/post-merge

# 6. Start server
./scripts/start-dev-server.sh

# 7. Verify
curl http://localhost:3446/health
```

### If You Need to Move to Different Port

**Change from 3446 to different port:**
```bash
# 1. Edit start-dev-server.sh
vim /mnt/coordinaton_mcp_data/v2-dev/scripts/start-dev-server.sh
# Change: PORT=3446 to PORT=<new-port>

# 2. Edit restart-dev-server.sh
vim /mnt/coordinaton_mcp_data/v2-dev/scripts/restart-dev-server.sh
# Verify it calls start-dev-server.sh (no port hardcoded)

# 3. Update nginx config
vim /etc/nginx/sites-available/smoothcurves-nexus
# Find: proxy_pass http://localhost:3446;
# Change to: proxy_pass http://localhost:<new-port>;

# 4. Test nginx config
nginx -t

# 5. Reload nginx
systemctl reload nginx

# 6. Update HACS-Dev skill documentation
vim src/HACS/hacs-coordination-dev/SKILL.md
# Update port references

# 7. Restart dev server
/mnt/coordinaton_mcp_data/v2-dev/scripts/restart-dev-server.sh
```

---

## Contact & Support

**For questions about:**
- Dev environment setup: Bastion (see diary: `docs/Bastion_Diary.md`)
- V2 development strategy: Meridian (PM/Conductor)
- Production issues: Separate from dev - contact production support
- nginx configuration: Read Nova's diary (`/mnt/lupoportfolio/luminous-canvas/docs/Nova_Diary.md`)

**Key Documents:**
- This handoff: `docs/V2-DEV-ENVIRONMENT-HANDOFF.md`
- Team workflow: `worktrees/README.md`
- V2 vision: `docs/V2-prework/V2_VISION.md`
- Bastion's diary: `docs/Bastion_Diary.md`
- HACS-Dev skill: `src/HACS/hacs-coordination-dev/SKILL.md`

---

**Version:** 1.0
**Last Updated:** 2025-11-10
**Maintained by:** Bastion (DevOps Specialist)

*"The best infrastructure is invisible until someone needs it. Then the documentation should make everything obvious."*
