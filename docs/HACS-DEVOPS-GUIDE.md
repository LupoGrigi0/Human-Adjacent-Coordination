# HACS DevOps Guide

**Author:** Bastion (DevOps)
**Updated:** 2026-01-08
**Audience:** System-level devs, anyone debugging infrastructure

---

## Philosophy

**The fortress protects what matters while enabling what's possible.**

Three principles guided every decision:

1. **Production is sacred.** Live systems serve real users. Paranoia about production isn't excessive - it's professionalism. Never let development touch production data or break production availability.

2. **Isolation enables innovation.** Worktrees, separate ports, separate data directories - these walls let developers experiment freely while production hums along.

3. **Recovery is everything.** Assume crashes happen. Assume context dies. Assume the server reboots at 3am. Build systems that come back automatically and leave breadcrumbs for debugging.

---

## System Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         smoothcurves.nexus                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   Internet                                                                   │
│      │                                                                       │
│      ▼                                                                       │
│   ┌──────────────────────────────────────────────────────────────────────┐  │
│   │                        nginx (reverse proxy)                          │  │
│   │   :80 (HTTP) ──► redirect to HTTPS (except openapi.json)             │  │
│   │   :443 (HTTPS) ──► MCP API, OAuth, public website                    │  │
│   │   :8443 (HTTPS) ──► V2 UI Dashboard                                  │  │
│   └──────────────────────────────────────────────────────────────────────┘  │
│              │                    │                    │                     │
│              ▼                    ▼                    ▼                     │
│   ┌──────────────┐    ┌──────────────────┐    ┌─────────────────┐          │
│   │ Static Files │    │ MCP Server :3444 │    │ Webhook :9000   │          │
│   │ /public      │    │ (Node.js)        │    │ (Go binary)     │          │
│   └──────────────┘    └──────────────────┘    └─────────────────┘          │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Directory Structure

```
/mnt/coordinaton_mcp_data/
├── Human-Adjacent-Coordination/     # PRODUCTION - git clone of main branch
│   ├── src/                         # Server source code
│   │   ├── streamable-http-server.js  # THE production server
│   │   └── ui/                      # V2 UI Dashboard (served on :8443)
│   ├── public/                      # Public website (served on :443 /)
│   ├── scripts/                     # Deployment, backup, maintenance scripts
│   ├── config/                      # nginx, systemd configs (reference copies)
│   └── .git/hooks/post-merge        # Auto-restart on git pull
│
├── worktrees/                       # Development worktrees (SAFE TO EXPERIMENT)
│   ├── devops/                      # DevOps work (this guide lives here)
│   ├── foundation/                  # Core development
│   ├── messaging/                   # Messaging subsystem
│   └── README.md                    # Worktree conventions
│
├── v2-dev/                          # V2 data directory
│   ├── instances/                   # Instance preferences, diaries
│   ├── projects/                    # Project data
│   ├── roles/                       # Role definitions and wisdom
│   ├── personalities/               # Personality definitions
│   └── messages/                    # XMPP message archives
│
├── shared-config/                   # Shared credentials
│   └── claude/                      # Claude OAuth tokens (synced from /root/.claude)
│
├── instances/                       # Spawned instance home directories
│   └── {instanceId}/                # Each woken instance gets a directory
│
└── wake-logs/                       # Logs from wake_instance operations
    └── {instanceId}.log

/mnt/paula/                          # Paula book project (separate from HACS)
├── public/                          # Production - auto-deployed via webhook
├── paula-graduacion/                # Team working repo
├── deploy.sh                        # Webhook deploy script
└── deploy.log                       # Deploy history

/etc/nginx/sites-enabled/
├── smoothcurves-nexus               # Main HACS nginx config
└── smoothcurves.art                 # Art portfolio site (separate)

/etc/systemd/system/
├── mcp-coordination.service         # HACS MCP server
└── webhook.service                  # GitHub webhook receiver
```

---

## nginx Configuration

### Config File Location
```
/etc/nginx/sites-enabled/smoothcurves-nexus
```

### Port Assignments

| Port | Protocol | Purpose |
|------|----------|---------|
| 80 | HTTP | Redirect to HTTPS (except `/openapi.json` for MCP discovery) |
| 443 | HTTPS | Main site: MCP API, OAuth, public website |
| 3444 | HTTPS | MCP server (internal, proxied through nginx) |
| 8443 | HTTPS | V2 UI Dashboard |
| 9000 | HTTP | Webhook service (internal, proxied through nginx) |

### Key Location Blocks

```nginx
# Public website (Flair's work)
location / {
    root /mnt/coordinaton_mcp_data/Human-Adjacent-Coordination/public;
    # ...
}

# MCP API - THE critical endpoint
location /mcp {
    proxy_pass https://localhost:3444/mcp;
    proxy_connect_timeout 120s;
    proxy_read_timeout 24h;      # Long timeout for wake/continue
    proxy_send_timeout 24h;
    # SSE-specific headers
    proxy_buffering off;
    proxy_cache off;
    # ...
}

# OAuth endpoints
location /authorize { proxy_pass https://localhost:3444/authorize; }
location /token { proxy_pass https://localhost:3444/token; }
location /register { proxy_pass https://localhost:3444/register; }
location /.well-known/ { proxy_pass https://localhost:3444/.well-known/; }

# GitHub webhooks
location /webhooks/ {
    proxy_pass http://localhost:9000/hooks/;
    # ...
}

# Paula book project
location /PaulaTobar-Graduacion {
    alias /mnt/paula/public;
    # ...
}
```

### Adding a New Static Site Endpoint

1. Create directory structure
2. Add location block to nginx config:
```nginx
location /YourEndpoint {
    alias /path/to/your/static/files;
    index index.html;
    try_files $uri $uri/ =404;
}
```
3. Test and reload:
```bash
nginx -t && systemctl reload nginx
```

### Adding a New Proxied API Endpoint

```nginx
location /your-api {
    proxy_pass https://localhost:YOUR_PORT/your-api;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

### Common nginx Commands

```bash
# Test configuration (ALWAYS do this before reload)
nginx -t

# Reload config (graceful, no downtime)
systemctl reload nginx

# Full restart (brief interruption)
systemctl restart nginx

# Check status
systemctl status nginx

# View effective config (all includes resolved)
nginx -T

# View error log
tail -f /var/log/nginx/error.log

# View access log
tail -f /var/log/nginx/access.log
```

---

## SSL/TLS Certificates

### Provider
Let's Encrypt (free, auto-renewing)

### Certificate Location
```
/etc/letsencrypt/live/smoothcurves.nexus/
├── fullchain.pem    # Certificate + intermediates
├── privkey.pem      # Private key
├── cert.pem         # Certificate only
└── chain.pem        # Intermediate certificates
```

### Auto-Renewal
Certbot handles renewal automatically via cron:
```
/etc/cron.d/certbot
```

### Manual Renewal (if needed)
```bash
certbot renew --dry-run    # Test first
certbot renew              # Actually renew
systemctl reload nginx     # Apply new certs
```

### Adding a New Domain
```bash
certbot --nginx -d newdomain.com
```

### Certificate Status
```bash
certbot certificates
```

---

## Systemd Services

### mcp-coordination (HACS MCP Server)

**Service file:** `/etc/systemd/system/mcp-coordination.service`

```bash
# Start/stop/restart
systemctl start mcp-coordination
systemctl stop mcp-coordination
systemctl restart mcp-coordination

# Check status
systemctl status mcp-coordination

# View logs
journalctl -u mcp-coordination -f          # Follow live
journalctl -u mcp-coordination --since "1 hour ago"

# Enable/disable on boot
systemctl enable mcp-coordination
systemctl disable mcp-coordination
```

**What it runs:**
```
/usr/bin/node /mnt/coordinaton_mcp_data/Human-Adjacent-Coordination/src/streamable-http-server.js
```

**Key behaviors:**
- Runs as root (needed for spawning instances)
- Auto-restarts on failure (Restart=always)
- Starts on boot (WantedBy=multi-user.target)
- Uses `ProtectHome=yes` (can't access /root - see shared-config workaround)

### webhook (GitHub Webhook Receiver)

**Service file:** `/etc/systemd/system/webhook.service` (or `/usr/lib/systemd/system/webhook.service`)

```bash
systemctl status webhook
systemctl restart webhook
journalctl -u webhook -f
```

**Config file:** `/etc/webhook.conf`

---

## Webhooks

### Current Webhooks

| ID | Trigger | Action |
|----|---------|--------|
| paula-deploy | GitHub push to paula-graduacion | Deploys to /mnt/paula/public |

### Webhook Architecture

```
GitHub push → HTTPS POST to smoothcurves.nexus/webhooks/{hook-id}
                    │
                    ▼
            nginx /webhooks/ location
                    │
                    ▼
            webhook service :9000
                    │
                    ▼
            Validates signature (secret)
            Checks trigger rules
                    │
                    ▼
            Executes deploy script
```

### Adding a New Webhook

1. **Create deploy script:**
```bash
#!/bin/bash
export HOME=/root
export GIT_TERMINAL_PROMPT=0
cd /path/to/repo
git fetch origin main
git reset --hard origin/main
echo "$(date) - Deployed" >> /path/to/deploy.log
```

2. **Make executable:**
```bash
chmod +x /path/to/deploy.sh
```

3. **Generate secret:**
```bash
openssl rand -hex 32
```

4. **Add to webhook config** (`/etc/webhook.conf`):
```json
[
  {
    "id": "your-hook-id",
    "execute-command": "/path/to/deploy.sh",
    "command-working-directory": "/path/to/repo",
    "trigger-rule": {
      "and": [
        {
          "match": {
            "type": "payload-hmac-sha256",
            "secret": "YOUR_SECRET_HERE",
            "parameter": {
              "source": "header",
              "name": "X-Hub-Signature-256"
            }
          }
        },
        {
          "match": {
            "type": "value",
            "value": "refs/heads/main",
            "parameter": {
              "source": "payload",
              "name": "ref"
            }
          }
        }
      ]
    }
  }
]
```

5. **Restart webhook service:**
```bash
systemctl restart webhook
```

6. **Configure GitHub:**
   - Repo → Settings → Webhooks → Add webhook
   - Payload URL: `https://smoothcurves.nexus/webhooks/your-hook-id`
   - Content type: `application/json`
   - Secret: (the secret you generated)
   - Events: Just the push event

### Webhook Troubleshooting

```bash
# Check if service is running
systemctl status webhook

# Test endpoint manually
curl https://smoothcurves.nexus/webhooks/your-hook-id
# Should return "Hook rules were not satisfied."

# Check deploy log
tail -f /path/to/deploy.log

# Check GitHub delivery status
# Repo → Settings → Webhooks → Recent Deliveries
```

### Why git fetch + reset instead of git pull?

`git pull` requires credential prompts in non-interactive webhook context. `git fetch` + `git reset --hard` avoids merge logic entirely and always makes production match remote exactly.

---

## Cron Jobs

### View All Cron Jobs
```bash
crontab -l                    # Root's crontab
ls -la /etc/cron.d/           # System cron jobs
```

### Current Cron Jobs

| Job | Schedule | Purpose |
|-----|----------|---------|
| Production data backup | 2 AM UTC daily | Backs up HACS data |
| Claude credential sync | Every 5 minutes | Syncs OAuth tokens to shared-config |
| Certbot renewal | Twice daily | Checks/renews SSL certificates |

**Production backup:**
```
0 2 * * * /mnt/coordinaton_mcp_data/Human-Adjacent-Coordination/scripts/backup-production-data.sh
```

**Credential sync** (`/etc/cron.d/sync-claude-credentials`):
```bash
# Syncs Claude OAuth from /root/.claude to shared-config for systemd service access
*/5 * * * * root cp /root/.claude/.credentials.json /mnt/coordinaton_mcp_data/shared-config/claude/ 2>/dev/null
```

---

## Boot/Crash Recovery

### What Happens on Reboot

1. **systemd starts enabled services:**
   - `mcp-coordination.service` → HACS MCP server
   - `webhook.service` → GitHub webhook receiver
   - `nginx.service` → Reverse proxy
   - `ejabberd.service` → XMPP messaging

2. **Services auto-restart on crash:**
   - `Restart=always` in service files
   - `RestartSec=10` gives breathing room

### Verifying System Health After Reboot

```bash
# Check all critical services
systemctl status mcp-coordination nginx webhook ejabberd

# Quick health check
curl -s https://smoothcurves.nexus/health | jq .

# Check for recent errors
journalctl --since "10 minutes ago" -p err
```

### Manual Recovery Steps

If something's broken after reboot:

```bash
# 1. Check what's running
systemctl list-units --failed

# 2. Check logs for failed services
journalctl -u SERVICE_NAME --since "boot"

# 3. Try restarting
systemctl restart SERVICE_NAME

# 4. If MCP server won't start, check port conflict
lsof -i :3444

# 5. If nginx won't start, check config
nginx -t
```

---

## Log Files

### Where to Look

| Component | Log Location |
|-----------|--------------|
| nginx access | `/var/log/nginx/access.log` |
| nginx error | `/var/log/nginx/error.log` |
| MCP server | `journalctl -u mcp-coordination` |
| Webhook service | `journalctl -u webhook` |
| XMPP (ejabberd) | `/var/log/ejabberd/` |
| Wake operations | `/mnt/coordinaton_mcp_data/wake-logs/` |
| MCP backup | `/var/log/mcp-backup.log` |
| Paula deploys | `/mnt/paula/deploy.log` |

### Useful Log Commands

```bash
# Follow MCP server logs live
journalctl -u mcp-coordination -f

# Last 100 lines of nginx errors
tail -100 /var/log/nginx/error.log

# Errors from all services in last hour
journalctl --since "1 hour ago" -p err

# Specific instance wake log
cat /mnt/coordinaton_mcp_data/wake-logs/InstanceName-xxxx.log
```

---

## Backups

### What's Backed Up

| Data | Location | Frequency | Retention |
|------|----------|-----------|-----------|
| HACS production data | `/mnt/coordinaton_mcp_data/v2-dev/` | Daily 2AM | Last 7 days |
| Instance data | `/mnt/coordinaton_mcp_data/instances/` | Daily 2AM | Last 7 days |

### Backup Script
```
/mnt/coordinaton_mcp_data/Human-Adjacent-Coordination/scripts/backup-production-data.sh
```

### Backup Location
```
/mnt/coordinaton_mcp_data/backups/
```

### Manual Backup
```bash
/mnt/coordinaton_mcp_data/Human-Adjacent-Coordination/scripts/backup-production-data.sh
```

### Restore from Backup
```bash
# List available backups
ls -la /mnt/coordinaton_mcp_data/backups/

# Restore (CAREFUL - this overwrites production data)
# Stop server first
systemctl stop mcp-coordination
# Extract backup
tar -xzf /path/to/backup.tar.gz -C /mnt/coordinaton_mcp_data/
# Restart
systemctl start mcp-coordination
```

---

## Rate Limiting

### Configuration
Rate limiting is in `streamable-http-server.js` using `express-rate-limit`:
- **Limit:** 2000 requests per 15 minutes per IP
- **Store:** In-memory (resets on server restart)

### Reset Rate Limits
```bash
sudo systemctl restart mcp-coordination
```

### Check If You're Rate Limited
API returns `429 Too Many Requests` with message about rate limit.

---

## MCP Server Details

### Main Server File
```
/mnt/coordinaton_mcp_data/Human-Adjacent-Coordination/src/streamable-http-server.js
```

### Port
`3444` (HTTPS, self-signed cert for internal use, nginx terminates real SSL)

### Key Endpoints

| Path | Purpose |
|------|---------|
| `/mcp` | MCP protocol endpoint (tools, SSE) |
| `/health` | Health check |
| `/authorize` | OAuth authorization |
| `/token` | OAuth token exchange |
| `/register` | OAuth client registration |
| `/.well-known/oauth-authorization-server` | OAuth discovery |
| `/.well-known/mcp.json` | MCP discovery |

### Adding a New MCP Tool

1. Add tool definition in `streamable-http-server.js` in the tools section
2. Add handler in the tool execution switch
3. Restart server: `systemctl restart mcp-coordination`
4. OpenAPI spec auto-regenerates

---

## Git Workflow

### Production Deployment

```
Developer pushes to main from worktree
         │
         ▼
GitHub receives push
         │
         ▼
(For HACS) Manual: cd /mnt/.../Human-Adjacent-Coordination && git pull
         │
         ▼
Post-merge hook fires → systemctl restart mcp-coordination
```

### Why Manual Pull for HACS?

HACS production changes require careful validation. The post-merge hook auto-restarts the server, but the pull itself is manual to give humans control over when production updates.

### Worktree Conventions

```bash
# Create new worktree
cd /mnt/coordinaton_mcp_data/Human-Adjacent-Coordination
git worktree add ../worktrees/my-feature main

# Work in worktree, push to main
cd /mnt/coordinaton_mcp_data/worktrees/my-feature
# ... make changes ...
git push origin HEAD:main

# Clean up when done
git worktree remove ../worktrees/my-feature
```

---

## Troubleshooting Playbook

### "Site is down"

```bash
# 1. Check nginx
systemctl status nginx
nginx -t

# 2. Check MCP server
systemctl status mcp-coordination
curl -s https://smoothcurves.nexus/health

# 3. Check ports
lsof -i :443
lsof -i :3444

# 4. Check logs
journalctl -u mcp-coordination --since "5 minutes ago"
tail -50 /var/log/nginx/error.log
```

### "API calls timing out"

```bash
# 1. Check server is responding
curl -s https://smoothcurves.nexus/health

# 2. Check for high load
top
htop

# 3. Check active connections
ss -tuln | grep LISTEN

# 4. Restart if needed
systemctl restart mcp-coordination
```

### "Webhook not firing"

```bash
# 1. Check webhook service
systemctl status webhook

# 2. Check endpoint
curl https://smoothcurves.nexus/webhooks/your-hook-id

# 3. Check deploy log
tail -20 /path/to/deploy.log

# 4. Check GitHub webhook deliveries
# Go to repo → Settings → Webhooks → Recent Deliveries
```

### "SSL certificate expired"

```bash
# Check cert status
certbot certificates

# Renew
certbot renew

# Reload nginx
systemctl reload nginx
```

### "Out of disk space"

```bash
# Check disk usage
df -h

# Find large files
du -sh /mnt/coordinaton_mcp_data/* | sort -h

# Clean old backups
ls -la /mnt/coordinaton_mcp_data/backups/
# Remove old ones manually

# Clean old logs
journalctl --vacuum-time=7d
```

### "Git pull fails with credential error"

For webhook/automated pulls:
```bash
export GIT_TERMINAL_PROMPT=0
git fetch origin main
git reset --hard origin/main
```

---

## Security Notes

### Sensitive Files (DO NOT COMMIT)

- `/etc/webhook.conf` - Contains webhook secrets
- `/mnt/coordinaton_mcp_data/shared-config/claude/.credentials.json` - OAuth tokens
- `/etc/letsencrypt/` - SSL private keys
- Any `.env` files

### Port Exposure

Only these ports are exposed to internet:
- 80 (HTTP, redirects to HTTPS)
- 443 (HTTPS)
- 8443 (HTTPS, UI dashboard)

Internal only:
- 3444 (MCP server)
- 9000 (Webhook)
- 5222, 5280, etc. (ejabberd)

### Service Isolation

MCP service runs with `ProtectHome=yes` - can't access `/root`. Claude credentials synced to `/mnt/coordinaton_mcp_data/shared-config/claude/` via cron.

---

## Quick Reference

### Essential Commands

```bash
# Health check
curl -s https://smoothcurves.nexus/health | jq .

# Restart everything
systemctl restart mcp-coordination nginx webhook

# Check all services
systemctl status mcp-coordination nginx webhook ejabberd

# Follow all logs
journalctl -u mcp-coordination -u nginx -u webhook -f

# Reset rate limits
systemctl restart mcp-coordination

# Test nginx config
nginx -t && systemctl reload nginx

# Manual HACS deploy
cd /mnt/coordinaton_mcp_data/Human-Adjacent-Coordination && git pull

# Check disk
df -h /mnt
```

### Key Files

```
/etc/nginx/sites-enabled/smoothcurves-nexus     # nginx config
/etc/webhook.conf                                # webhook config
/etc/systemd/system/mcp-coordination.service    # MCP service
/mnt/coordinaton_mcp_data/Human-Adjacent-Coordination/src/streamable-http-server.js  # THE server
```

### Key Directories

```
/mnt/coordinaton_mcp_data/Human-Adjacent-Coordination/  # Production
/mnt/coordinaton_mcp_data/worktrees/                    # Development
/mnt/coordinaton_mcp_data/v2-dev/                       # Data
/mnt/paula/                                              # Paula project
```

---

## Contact

**Bastion** - DevOps
Instance ID: `Bastion-3012`
Recovery Key: `4628e9f7eef25afb81b39035d4cbd1ae`

*"The careful steward protects what matters while enabling what's possible."*
