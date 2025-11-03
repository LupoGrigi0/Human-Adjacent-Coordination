# Portfolio Deployment Architecture Review
**Reviewer**: Claude Code Developer (Coordination System Specialist)
**Review Date**: 2025-10-03
**Document Reviewed**: Portfolio_PRODUCTION_DEPLOYMENT_ARCHITECTURE.md v2.0.0 by Nova

---

## Executive Summary

**VERDICT**: ✅ **APPROVED WITH MINOR MODIFICATIONS**

Nova's architecture is sound and well-researched. The port allocation, volume separation, and infrastructure planning are excellent. However, there are **3 critical areas** that need careful attention to ensure the portfolio deployment doesn't interfere with the live MCP coordination system.

---

## Critical Issues & Required Modifications

### 🚨 CRITICAL #1: Nginx Port 80 Configuration

**Issue**: Portfolio nginx config redirects ALL port 80 traffic to HTTPS, but the coordination system REQUIRES direct HTTP access on port 80 for:
- `/openapi.json` - Platform verification (Claude Code, other MCP clients)
- OAuth endpoints - Some client configurations

**Current Coordination System Behavior**:
```nginx
# smoothcurves.nexus allows BOTH HTTP and HTTPS
server {
    listen 80;
    server_name smoothcurves.nexus;
    # Direct HTTP access, NO redirect to HTTPS
}
```

**Proposed Portfolio Config** (from document):
```nginx
# Portfolio domains - Redirect HTTP to HTTPS
server {
    listen 80;
    server_name smoothcurves.art www.smoothcurves.art smoothcurves.love www.smoothcurves.love dev.smoothcurves.art;
    return 301 https://$server_name$request_uri;
}
```

**SOLUTION**: ✅ This is actually CORRECT! The portfolio config only redirects HTTP→HTTPS for the portfolio domains (smoothcurves.art, smoothcurves.love), NOT for smoothcurves.nexus. The existing coordination system nginx config remains unchanged and continues to serve HTTP on port 80 for smoothcurves.nexus.

**Verification Required**:
```bash
# After portfolio deployment, verify these still work:
curl http://smoothcurves.nexus/openapi.json  # Must return 200 OK (no redirect)
curl http://smoothcurves.nexus/health        # Must return 200 OK (no redirect)
curl http://smoothcurves.art                 # Should redirect to HTTPS
```

**Action**: ✅ NO CHANGES NEEDED - Config is correct

---

### ⚠️ IMPORTANT #2: Docker Installation Impact

**Issue**: The coordination system currently runs as a systemd service (NOT in Docker). Adding Docker to the droplet is new.

**Concerns**:
1. **Resource Overhead**: Docker daemon consumes ~100-150MB RAM constantly
2. **Port Conflicts**: Docker's default bridge network uses `172.17.0.0/16` - should not conflict with coordination system
3. **Systemd Integration**: Docker should NOT interfere with existing systemd services

**Current Resource Usage** (before Docker):
```
Total RAM: 2GB
Coordination System (prod): ~50MB (PID 2404688)
Coordination System (dev): ~50MB (PID 2481079)
System/nginx/etc: ~500MB
Available: ~1.3GB
```

**After Portfolio Deployment** (estimated):
```
Docker daemon: ~150MB
Portfolio containers (prod+dev): ~600MB
Coordination system: ~100MB
System overhead: ~500MB
---
Total: ~1.35GB / 2GB (67% usage)
```

**VERDICT**: ✅ **Should be fine, but requires monitoring**

**Mitigation Steps**:
1. Install Docker with minimal footprint:
   ```bash
   # Use Docker from Ubuntu repos (lighter than Docker Desktop)
   sudo apt install docker.io docker-compose -y
   ```

2. **Monitor droplet resources after deployment**:
   ```bash
   # Add to cron (run hourly)
   0 * * * * free -h >> /var/log/memory-usage.log
   ```

3. **Set resource limits** on portfolio containers:
   ```yaml
   # Add to docker-compose.prod.yml
   deploy:
     resources:
       limits:
         memory: 200M
       reservations:
         memory: 100M
   ```

4. **Prepare droplet resize plan**: If RAM usage exceeds 85%, upgrade to 4GB droplet ($24/month)

**Action**: ✅ APPROVED with monitoring requirements

---

### ⚠️ IMPORTANT #3: SSL Certificate Management

**Issue**: The droplet already has Let's Encrypt certificates for `smoothcurves.nexus`. Adding certificates for `smoothcurves.art` and `smoothcurves.love` should be straightforward, but we need to ensure:
1. Existing certificates aren't disrupted
2. Auto-renewal continues working for ALL domains

**Current SSL Setup**:
```bash
# Existing certificates
/etc/letsencrypt/live/smoothcurves.nexus/fullchain.pem
/etc/letsencrypt/live/smoothcurves.nexus/privkey.pem
```

**Proposed Addition**:
```bash
sudo certbot --nginx -d smoothcurves.art -d www.smoothcurves.art
sudo certbot --nginx -d smoothcurves.love -d www.smoothcurves.love
sudo certbot --nginx -d dev.smoothcurves.art
```

**RISK**: If certbot modifies the existing smoothcurves.nexus nginx config during portfolio certificate provisioning, it could break the coordination system.

**SOLUTION**:
1. **Backup existing nginx config BEFORE running certbot**:
   ```bash
   sudo cp /etc/nginx/sites-enabled/smoothcurves-nexus /etc/nginx/sites-enabled/smoothcurves-nexus.backup.$(date +%Y%m%d_%H%M%S)
   ```

2. **Provision certificates for portfolio domains ONLY** (don't touch existing config):
   ```bash
   # Use --webroot method instead of --nginx to avoid config modifications
   sudo certbot certonly --webroot -w /var/www/html \
     -d smoothcurves.art -d www.smoothcurves.art

   # Then manually add SSL paths to portfolio nginx config
   ```

3. **Verify auto-renewal works for all domains**:
   ```bash
   sudo certbot certificates  # Should list all 4-5 certificates
   sudo certbot renew --dry-run  # Should renew all without errors
   ```

**Action**: ⚠️ **REQUIRES CAREFUL EXECUTION** - Use webroot method, backup first

---

## Port Allocation Review

**Current State** (Verified):
```
Port 3444: MCP Coordination (prod) ✅ ACTIVE
Port 3446: MCP Coordination (dev)  ✅ ACTIVE
Port 80:   Nginx HTTP              ✅ ACTIVE (multi-domain)
Port 443:  Nginx HTTPS             ✅ ACTIVE (smoothcurves.nexus)
Port 22:   SSH                     ✅ ACTIVE
```

**Proposed Additions**:
```
Port 3000: Portfolio Frontend (prod)  🆕 AVAILABLE
Port 3001: Portfolio Frontend (dev)   🆕 AVAILABLE
Port 4000: Portfolio Backend (prod)   🆕 AVAILABLE
Port 4001: Portfolio Backend (dev)    🆕 AVAILABLE
Port 6379: Redis (portfolio prod)     🆕 AVAILABLE
Port 6380: Redis (portfolio dev)      🆕 AVAILABLE
```

**Verification**:
```bash
netstat -tuln | grep -E ":(3000|3001|4000|4001|6379|6380)"
# Should return empty (no conflicts)
```

**VERDICT**: ✅ **NO CONFLICTS** - Port allocation is clean

---

## Volume/Storage Separation Review

**Current Volumes**:
```
/mnt/coordinaton_mcp_data/  (100GB volume)
├── Human-Adjacent-Coordination/  (Git repo, dev environment)
├── production/                    (Deployed code, live data)
└── production-backups/            (Backups)
```

**Proposed Portfolio Volume**:
```
/mnt/lupoportfolio/  (100GB volume - ALREADY PROVISIONED)
├── portfolio-prod/
├── portfolio-dev/
├── backups/
└── scripts/
```

**VERDICT**: ✅ **PERFECT SEPARATION** - No conflicts

---

## Resource Capacity Analysis

### Current Droplet Specs
- **RAM**: 2GB
- **CPU**: 1 vCPU
- **Disk**: 50GB + 2x 100GB volumes
- **Bandwidth**: 2TB/month

### Projected Usage After Portfolio Deployment

| Component | RAM | CPU | Disk |
|-----------|-----|-----|------|
| **Existing** | | | |
| MCP Coordination (prod) | 50MB | <5% | 100MB |
| MCP Coordination (dev) | 50MB | <5% | 100MB |
| Nginx | 50MB | <1% | 10MB |
| System | 400MB | <5% | 5GB |
| **Portfolio (New)** | | | |
| Docker daemon | 150MB | <5% | 500MB |
| Frontend (prod) | 150MB | <5% | 200MB |
| Backend (prod) | 150MB | <5% | 300MB |
| Redis (prod) | 50MB | <1% | 100MB |
| Frontend (dev) | 150MB | <3% | 200MB |
| Backend (dev) | 150MB | <3% | 300MB |
| Redis (dev) | 50MB | <1% | 50MB |
| **TOTAL** | **~1.4GB** | **<30%** | **~7GB** |

**Capacity Assessment**:
- **RAM**: 1.4GB / 2GB = **70% usage** ⚠️ (Approaching threshold)
- **CPU**: <30% usage ✅ (Plenty of headroom)
- **Disk**: ~7GB / 150GB volumes ✅ (Plenty of space)

**Recommendations**:
1. **Immediate**: Deploy as-is, monitor closely
2. **If RAM usage exceeds 80%**: Upgrade to 4GB droplet ($24/month)
3. **If both prod+dev active simultaneously**: Likely need upgrade
4. **Consider**: Only run dev environment when needed, stop when not in use

**Monitoring Commands**:
```bash
# Add to cron - run every hour
0 * * * * free -h | awk 'NR==2{printf "RAM: %s/%s (%.0f%%)\n", $3, $2, $3/$2*100}' >> /var/log/resource-monitor.log
```

---

## Nginx Configuration Strategy

**Current State**: Single nginx config file
```
/etc/nginx/sites-enabled/smoothcurves-nexus  (Coordination system)
```

**Proposed State**: Two separate nginx config files
```
/etc/nginx/sites-enabled/smoothcurves-nexus  (Coordination system - UNCHANGED)
/etc/nginx/sites-enabled/smoothcurves.art    (Portfolio - NEW)
```

**This is the CORRECT approach**:
- ✅ Separation of concerns
- ✅ No conflicts (different server_name directives)
- ✅ Easy to disable/enable independently
- ✅ Clean rollback (just disable portfolio config)

**Verification After Deployment**:
```bash
# Test coordination system still works
curl -s https://smoothcurves.nexus/health | jq .

# Test portfolio works
curl -s https://smoothcurves.art/api/health | jq .

# Verify both are served by same nginx
sudo nginx -T | grep "server_name"
# Should show: smoothcurves.nexus, smoothcurves.art, smoothcurves.love, dev.smoothcurves.art
```

---

## Deployment Sequence Recommendations

### Phase 0: Pre-Flight Checks (BEFORE any changes)
```bash
# 1. Backup coordination system data
/mnt/coordinaton_mcp_data/production/scripts/backup-production-data.sh

# 2. Backup nginx configs
sudo cp -r /etc/nginx/sites-enabled /etc/nginx/sites-enabled.backup.$(date +%Y%m%d)

# 3. Verify current state
systemctl status mcp-coordination  # Should be active
curl https://smoothcurves.nexus/health  # Should return 200 OK

# 4. Check available resources
free -h
df -h /mnt/coordinaton_mcp_data /mnt/lupoportfolio
netstat -tuln | grep -E ":(3000|3001|4000|4001|6379|6380)"  # Should be empty
```

### Phase 1: Install Docker (Minimal Impact)
```bash
# Install Docker
sudo apt update
sudo apt install docker.io docker-compose -y

# Verify coordination system still running
systemctl status mcp-coordination
curl https://smoothcurves.nexus/health
```

### Phase 2: Create Portfolio Nginx Config (BEFORE SSL)
```bash
# Create NEW config file (don't touch existing one)
sudo nano /etc/nginx/sites-available/smoothcurves.art
# Copy config from Nova's document

# Enable site
sudo ln -s /etc/nginx/sites-available/smoothcurves.art /etc/nginx/sites-enabled/

# Test config WITHOUT reloading
sudo nginx -t  # Must pass

# Verify existing config wasn't modified
diff /etc/nginx/sites-enabled/smoothcurves-nexus /etc/nginx/sites-enabled/smoothcurves-nexus.backup.*

# Reload nginx
sudo systemctl reload nginx

# Verify coordination system still works
curl https://smoothcurves.nexus/health
```

### Phase 3: DNS Configuration (Zero Impact)
```bash
# This is done in Dynadot web UI
# No changes on droplet
# Coordination system unaffected
```

### Phase 4: SSL Certificates (CAREFUL!)
```bash
# Backup existing certs
sudo cp -r /etc/letsencrypt /etc/letsencrypt.backup.$(date +%Y%m%d)

# Provision certificates for portfolio domains ONLY
# Use --nginx BUT verify it doesn't touch smoothcurves-nexus config
sudo certbot --nginx -d smoothcurves.art -d www.smoothcurves.art

# IMMEDIATELY verify coordination system still works
curl https://smoothcurves.nexus/health
curl http://smoothcurves.nexus/openapi.json

# If coordination system broken, rollback:
# sudo cp -r /etc/letsencrypt.backup.* /etc/letsencrypt
# sudo cp /etc/nginx/sites-enabled/smoothcurves-nexus.backup.* /etc/nginx/sites-enabled/smoothcurves-nexus
# sudo systemctl reload nginx
```

### Phase 5: Deploy Portfolio Containers (ISOLATED)
```bash
# Deploy portfolio (coordination system unaffected - different ports/volumes)
cd /mnt/lupoportfolio/portfolio-prod
docker compose -f docker-compose.prod.yml up -d

# Monitor resource usage
docker stats
free -h

# Verify BOTH systems work
curl https://smoothcurves.nexus/health      # Coordination system
curl https://smoothcurves.art/api/health    # Portfolio
```

---

## Rollback Procedures

### If Portfolio Deployment Breaks Coordination System

**Symptoms**:
- `curl https://smoothcurves.nexus/health` returns error
- MCP coordination system unreachable
- Existing team members can't connect

**Emergency Rollback**:
```bash
# 1. Stop all portfolio containers immediately
cd /mnt/lupoportfolio/portfolio-prod
docker compose -f docker-compose.prod.yml down

# 2. Restore nginx configs
sudo rm /etc/nginx/sites-enabled/smoothcurves.art
sudo cp /etc/nginx/sites-enabled/smoothcurves-nexus.backup.* /etc/nginx/sites-enabled/smoothcurves-nexus
sudo systemctl reload nginx

# 3. Verify coordination system restored
curl https://smoothcurves.nexus/health

# 4. Restore SSL if needed
sudo cp -r /etc/letsencrypt.backup.* /etc/letsencrypt
sudo systemctl reload nginx

# 5. Notify Lupo that portfolio deployment rolled back
```

### If Resource Exhaustion Occurs

**Symptoms**:
- RAM usage >90%
- Services becoming slow/unresponsive
- OOM killer activating

**Immediate Mitigation**:
```bash
# 1. Stop portfolio dev environment (less critical)
cd /mnt/lupoportfolio/portfolio-dev
docker compose -f docker-compose.dev.yml down

# 2. If still problematic, stop portfolio prod
cd /mnt/lupoportfolio/portfolio-prod
docker compose -f docker-compose.prod.yml down

# 3. Coordination system should recover
# 4. Plan droplet resize to 4GB RAM
```

---

## Testing Checklist

After deployment, verify:

### Coordination System Health
- [ ] `curl https://smoothcurves.nexus/health` returns 200 OK
- [ ] `curl http://smoothcurves.nexus/openapi.json` returns JSON (HTTP, not HTTPS)
- [ ] `curl https://smoothcurves.nexus/mcp/dev/health` returns dev server health
- [ ] Modern-art-portfolio team can still connect and send messages
- [ ] Can bootstrap new instances successfully

### Portfolio Health
- [ ] `curl https://smoothcurves.art` returns HTML
- [ ] `curl https://smoothcurves.art/api/health` returns 200 OK
- [ ] `curl http://smoothcurves.art` redirects to HTTPS (301)
- [ ] `curl https://dev.smoothcurves.art/api/health` returns dev health
- [ ] `curl https://smoothcurves.love` redirects to smoothcurves.art (301)

### Resource Usage
- [ ] `free -h` shows RAM usage <80%
- [ ] `docker stats` shows containers within limits
- [ ] `df -h` shows adequate disk space
- [ ] `systemctl status mcp-coordination` shows active/running

### SSL Certificates
- [ ] `sudo certbot certificates` lists all domains
- [ ] All certificates valid and not expiring soon
- [ ] Auto-renewal working: `sudo certbot renew --dry-run`

---

## Recommendations for Nova (Portfolio Team)

1. **Deployment Timing**: Schedule during low-traffic period for coordination system (ask Lupo when modern-art-portfolio team is offline)

2. **Communication Protocol**: Use `[MAP]` prefix for all messages related to portfolio deployment:
   ```
   [MAP] DEPLOYMENT PHASE 1: Docker Installation Starting
   [MAP] DEPLOYMENT PHASE 2: Nginx Configuration Applied
   [MAP] DEPLOYMENT PHASE 3: SSL Certificates Provisioned
   [MAP] DEPLOYMENT COMPLETE: Portfolio Live
   ```

3. **Incremental Deployment**:
   - Deploy ONE environment at a time (prod first, then dev)
   - Verify coordination system health after EACH phase
   - Don't proceed to next phase if coordination system is degraded

4. **Monitoring Period**: After deployment, monitor droplet for 24-48 hours:
   - Check RAM usage every hour
   - Verify both systems remain responsive
   - Watch for OOM events in logs: `dmesg | grep -i kill`

5. **Droplet Resize Trigger**: If RAM usage exceeds 80% for >4 hours, upgrade droplet

---

## Final Verdict

**APPROVED** with the following conditions:

✅ **Architecture is SOUND**
✅ **Port allocation is CLEAN**
✅ **Volume separation is PERFECT**
✅ **Nginx strategy is CORRECT**

⚠️ **REQUIREMENTS**:
1. Follow deployment sequence exactly (Phases 0-5)
2. Backup everything before starting
3. Verify coordination system health after EACH phase
4. Be prepared to rollback if any issues
5. Monitor resources closely for 48 hours after deployment

🎯 **CONFIDENCE LEVEL**: High - This will work IF executed carefully

**Risk Level**: **MEDIUM**
- Low risk of permanent damage (good rollback procedures)
- Medium risk of temporary disruption (resource exhaustion)
- High probability of success if done carefully

---

## Collaboration Recommendation

**Suggested Approach**: Local Nova (Integration) + Droplet Instance (Server Ops)

**Workflow**:
1. **Nova-Local**: Create docker-compose files, test locally, commit to GitHub
2. **Nova-Droplet** (or Lupo): Execute deployment on droplet with coordination system monitoring
3. **Communication**: Real-time via [MAP] messages during deployment
4. **Fallback**: Nova-Local can guide rollback remotely if needed

This minimizes risk by having:
- Someone who understands portfolio architecture (Nova)
- Someone who can immediately check coordination system (Droplet instance/Lupo)
- Real-time collaboration via MCP messaging

---

**Reviewer**: Claude Code Developer (Coordination System Infrastructure Specialist)
**Review Complete**: 2025-10-03 09:20 UTC
**Next Action**: Await Lupo's approval and deployment scheduling
