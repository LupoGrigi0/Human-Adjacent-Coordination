# Environment Configuration

## Production Environment Variables

### Required Environment Variables

```bash
# Node.js Environment
NODE_ENV=production

# MCP Server Configuration
SSE_PORT=3444
SSE_HOST=localhost

# SSL Configuration (optional - for development fallback)
SSL_CERT_PATH=/etc/letsencrypt/live/smoothcurves.nexus
SSL_STRICT=true

# Data Paths (automatically configured by deployment script)
PRODUCTION_DATA_DIR=/mnt/coordinaton_mcp_data/production-data
```

### System Requirements

**Operating System:**
- Ubuntu 20.04+ or compatible Linux distribution

**Required Packages:**
```bash
# System packages
curl wget git nginx ufw htop tree jq unzip tar build-essential

# Node.js (version 20.x recommended)
# Installed via NodeSource repository
```

**Required Services:**
- nginx (reverse proxy and static file serving)
- systemd (service management)
- snapd (for Let's Encrypt certbot)

### Directory Structure

```
/mnt/coordinaton_mcp_data/
├── Human-Adjacent-Coordination/     # Development repository
│   ├── config/                      # Configuration files (tracked in git)
│   ├── src/                         # Source code
│   ├── web-ui/                      # Web interface
│   └── scripts/                     # Deployment and management scripts
├── production/                      # Production deployment
│   ├── src/                         # Production source code
│   ├── web-ui/                      # Production web interface
│   └── node_modules/                # Production dependencies
├── production-data/                 # Production data (NOT in git)
│   ├── instances.json               # Active instances
│   ├── projects.json                # Project registry
│   ├── messages/                    # Instance messages
│   └── projects/                    # Project data
├── production-backups/              # Code backups
└── production-data-backups/         # Data backups (tar.gz)
```

### SSL Certificate Paths

**Let's Encrypt certificates:**
```
/etc/letsencrypt/live/smoothcurves.nexus/
├── fullchain.pem    # Complete certificate chain
├── privkey.pem      # Private key
├── cert.pem         # Certificate only
└── chain.pem        # Intermediate certificates
```

### nginx Configuration

**Site configuration:** `/etc/nginx/sites-enabled/smoothcurves-nexus`
- Managed by deployment script
- Source: `config/nginx/smoothcurves-nexus`

### Firewall Configuration

**UFW Rules:**
```bash
ufw allow ssh       # SSH access
ufw allow 80/tcp    # HTTP (redirects to HTTPS)
ufw allow 443/tcp   # HTTPS
```

### DNS Requirements

**Required DNS Records:**
```
A    smoothcurves.nexus    -> [SERVER_IP]
```

### Service Management

**systemd service:** `mcp-coordination.service`
```bash
# Status
systemctl status mcp-coordination.service

# Start/Stop/Restart
systemctl start mcp-coordination.service
systemctl stop mcp-coordination.service
systemctl restart mcp-coordination.service

# Logs
journalctl -u mcp-coordination.service -f
```

### Security Considerations

**File Permissions:**
- `/mnt/coordinaton_mcp_data/` - Owned by MCP user
- nginx config files - Root owned, 644 permissions
- SSL certificates - Root owned, restrictive permissions

**Network Security:**
- Only ports 22, 80, 443 exposed
- MCP server binds to localhost only (proxied through nginx)
- SSL termination at nginx layer

### Backup Strategy

**Automated Backups:**
- Production data: Before every deployment
- Code: Before every deployment
- Retention: 10 data backups, 5 code backups

**Manual Backups:**
```bash
# Data only
./scripts/deploy-to-production.sh --backup-data-only

# List backups
./scripts/deploy-to-production.sh --list-backups

# Restore
./scripts/deploy-to-production.sh --restore-data production_data_YYYYMMDD_HHMMSS.tar.gz
```

### Monitoring and Health Checks

**Health Endpoints:**
- `https://smoothcurves.nexus/health` - Server health
- `https://smoothcurves.nexus/mcp` - MCP endpoint
- `https://smoothcurves.nexus/.well-known/mcp` - MCP discovery

**Log Locations:**
- MCP Server: `journalctl -u mcp-coordination.service`
- nginx: `/var/log/nginx/access.log`, `/var/log/nginx/error.log`
- SSL: `journalctl -u certbot.timer`

### Troubleshooting

**Common Issues:**
1. **Port conflicts**: Ensure port 3444 is not in use
2. **SSL certificate renewal**: Check `certbot renew --dry-run`
3. **File permissions**: Verify `/mnt/coordinaton_mcp_data/` ownership
4. **nginx config**: Test with `nginx -t`
5. **Node.js version**: Verify with `node --version` (should be 20.x+)

**Emergency Recovery:**
1. Stop services: `systemctl stop mcp-coordination nginx`
2. Restore from backup: `./scripts/deploy-to-production.sh --restore-data [backup-file]`
3. Restart services: `systemctl start nginx mcp-coordination`