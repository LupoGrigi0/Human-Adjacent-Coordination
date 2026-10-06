# DigitalOcean Migration Guide for Human-Adjacent Coordination System

## Executive Summary

After extensive testing on RunPod, we've encountered fundamental networking limitations that make it unsuitable for production MCP hosting:
- 100-second proxy timeout kills long-running SSE connections
- Complex port mapping prevents standard SSL certificate setup
- Limited control over network configuration

**DigitalOcean provides the ideal environment** for our MCP system with standard networking, predictable costs, and full control.

## Why DigitalOcean?

### ✅ Perfect for MCP Requirements
- **Standard Ports**: 80/443 work exactly as expected
- **No Proxy Timeouts**: Direct connections to your server
- **Real SSL**: Let's Encrypt works in 5 minutes
- **Full SSH Access**: Native development environment
- **Persistent Storage**: Built-in volumes with automatic backups

### 💰 Cost Comparison
- **RunPod**: ~$0.50/hour GPU instance = $360/month (plus complexity)
- **DigitalOcean**: $12/month droplet (1GB RAM, 25GB SSD, 1TB transfer)
- **Winner**: DigitalOcean saves $4,200/year while being simpler

### 🛠️ Development Experience
- **SSH**: Standard key-based authentication
- **VSCode Remote**: Works perfectly out of the box
- **Git**: Standard workflow, no container limitations
- **Debugging**: Full system access, normal ports, standard tools

## DigitalOcean Droplet Configuration

### Recommended Specifications

**Basic Droplet**: $12/month
- **CPU**: 1 vCPU (sufficient for MCP server)
- **RAM**: 1 GB (Node.js + nginx + system)
- **Storage**: 25 GB SSD (OS + code + logs)
- **Transfer**: 1,000 GB/month (plenty for MCP traffic)
- **IPv4**: 1 dedicated IP address

**If you need more power later**: Easy to resize up to 2GB RAM ($18/month) or 4GB RAM ($36/month)

### Step-by-Step Droplet Creation

#### 1. Create DigitalOcean Account
- Go to: https://www.digitalocean.com/
- Sign up with your email
- **Payment**: Add credit card (required even for $200 free credit)
- **Free Credits**: New accounts get $200 credit (4+ months free!)

#### 2. Create SSH Key (Before Creating Droplet)
On your Windows machine:
```bash
# In PowerShell or WSL
ssh-keygen -t rsa -b 4096 -C "your-email@example.com"
# Save to default location: C:\Users\YourName\.ssh\id_rsa
# Copy the public key content:
type C:\Users\YourName\.ssh\id_rsa.pub
```

#### 3. Droplet Creation Settings
**In DigitalOcean Web Interface:**

1. **Click "Create" → "Droplets"**

2. **Choose an image**: 
   - Select: **Ubuntu 24.04 (LTS) x64**
   - Why: Latest LTS, best package support, most stable

3. **Choose a plan**:
   - Select: **Basic**
   - CPU Options: **Regular**
   - Size: **$12/mo** (1GB RAM, 1 vCPU, 25GB SSD, 1TB transfer)

4. **Choose a datacenter region**:
   - Select: **New York 3** (or closest to you)
   - Why: Lower latency, better for development

5. **Authentication**:
   - Select: **SSH Key** (NOT password)
   - Click **"New SSH Key"**
   - Paste your public key content
   - Name: "Windows Development Key"
   - Why: Much more secure, required for VSCode Remote

6. **Additional options**:
   - ✅ **IPv6**: Enable (future-proofing)
   - ✅ **Monitoring**: Enable (free system metrics)
   - ❌ **Backups**: Skip for now ($2.40/month, enable later if needed)
   - ❌ **VPC**: Use default
   - ❌ **User data**: Skip

7. **Finalize details**:
   - **Quantity**: 1 Droplet
   - **Hostname**: `smoothcurves-mcp` (or your preference)
   - **Tags**: `mcp-server`, `production`
   - **Project**: Default (or create "MCP Hosting")

8. **Click "Create Droplet"**

#### 4. Initial Setup (5 minutes after creation)

**Get your droplet IP**:
```bash
# In DigitalOcean dashboard, note your droplet's IP address
# Example: 147.182.203.45
```

**Test SSH connection**:
```bash
# From Windows PowerShell/WSL
ssh root@147.182.203.45
```

**First login setup**:
```bash
# Update system
apt update && apt upgrade -y

# Install essential packages
apt install -y curl wget git unzip htop

# Create non-root user for security
adduser --disabled-password --gecos "" mcp
usermod -aG sudo mcp
mkdir -p /home/mcp/.ssh
cp /root/.ssh/authorized_keys /home/mcp/.ssh/
chown -R mcp:mcp /home/mcp/.ssh
chmod 700 /home/mcp/.ssh
chmod 600 /home/mcp/.ssh/authorized_keys

# Test non-root SSH
exit
ssh mcp@147.182.203.45
```

## Persistent Storage & Data Management

### Built-in Persistence
**Everything persists by default** on DigitalOcean droplets:
- `/home/` - User data, SSH keys, development environment
- `/opt/` - Application installations  
- `/etc/` - Configuration files (nginx, SSL certificates)
- `/var/` - Logs, databases, runtime data

**Unlike RunPod**: No container resets, no ephemeral storage worries!

### Volume Setup for Production Data (Optional)

**For production-grade backup isolation**:
```bash
# Create 10GB volume in DigitalOcean dashboard
# Attach to droplet, then:

# Format and mount
sudo mkfs.ext4 /dev/disk/by-id/scsi-0DO_Volume_mcp-data
sudo mkdir -p /mnt/mcp-data
echo '/dev/disk/by-id/scsi-0DO_Volume_mcp-data /mnt/mcp-data ext4 defaults,nofail,discard 0 0' | sudo tee -a /etc/fstab
sudo mount -a

# Create data directories
sudo mkdir -p /mnt/mcp-data/{data,logs,backups}
sudo chown -R mcp:mcp /mnt/mcp-data

# Symlink from application
ln -s /mnt/mcp-data/data /home/mcp/Human-Adjacent-Coordination/data
ln -s /mnt/mcp-data/logs /home/mcp/Human-Adjacent-Coordination/logs
```

**Volume Benefits**:
- Independent backups (can snapshot just data)
- Easy to resize or migrate data
- Survives droplet rebuilds
- Cost: $1/month per 10GB

## DNS Configuration

**Update your domain registrar**:
```bash
# Replace RunPod IP with DigitalOcean IP
smoothcurves.nexus → A → 147.182.203.45

# Optional: Add www subdomain
www.smoothcurves.nexus → CNAME → smoothcurves.nexus
```

## Software Installation on DigitalOcean

### Core Environment Setup
```bash
# Node.js 20.x (official repository)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Nginx
sudo apt install -y nginx

# Let's Encrypt
sudo apt install -y certbot python3-certbot-nginx

# Development tools
sudo apt install -y build-essential git vim htop tree
```

### Clone and Setup Project
```bash
# Clone repository
cd /home/mcp
git clone https://github.com/yourusername/Human-Adjacent-Coordination.git
cd Human-Adjacent-Coordination

# Install dependencies
npm install

# Set up directories
mkdir -p data logs certs backups
```

## Code Cleanup Required (RunPod Workarounds to Remove)

### Files to Simplify

#### 1. `scripts/start-sse-production.sh`
**Remove**:
- Complex port environment variables
- Self-signed certificate generation
- RunPod-specific SSL paths

**Simplify to**:
```bash
#!/bin/bash
export NODE_ENV=production
export SSE_PORT=3444
export SSE_HOST=0.0.0.0

# Let's Encrypt certificates
if [ -f "/etc/letsencrypt/live/smoothcurves.nexus/fullchain.pem" ]; then
    export SSL_CERT_PATH=/etc/letsencrypt/live/smoothcurves.nexus
fi

node src/sse-server.js
```

#### 2. `src/sse-server.js`
**Fix network binding** (if still using 0.0.0.0):
```javascript
// Change to proper hostname binding
const CONFIG = {
  port: process.env.SSE_PORT || 3444,
  host: 'smoothcurves.nexus', // No more 0.0.0.0 workarounds
  // ...
};
```

#### 3. Nginx Configuration
**Replace complex proxy configs with simple**:
```nginx
server {
    listen 80;
    server_name smoothcurves.nexus;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name smoothcurves.nexus;
    
    ssl_certificate /etc/letsencrypt/live/smoothcurves.nexus/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/smoothcurves.nexus/privkey.pem;
    
    location /mcp {
        proxy_pass https://localhost:3444/mcp;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        # SSE headers
        proxy_set_header Connection '';
        proxy_http_version 1.1;
        proxy_buffering off;
        proxy_cache off;
        proxy_read_timeout 24h;
    }
}
```

#### 4. Files to Delete
- `scripts/runpod-complete-setup.sh` (RunPod-specific)
- `scripts/setup-letsencrypt-port*` (port workaround scripts)
- All custom nginx configs in `/etc/nginx/sites-available/`

## Final Deployment Steps

### 1. SSL Certificate Setup (5 minutes)
```bash
# Automatic nginx configuration + SSL
sudo certbot --nginx -d smoothcurves.nexus

# Verify renewal works
sudo certbot renew --dry-run
```

### 2. Service Configuration
```bash
# Create systemd service
sudo tee /etc/systemd/system/mcp-server.service > /dev/null <<EOF
[Unit]
Description=Human-Adjacent Coordination MCP Server
After=network.target

[Service]
Type=simple
User=mcp
WorkingDirectory=/home/mcp/Human-Adjacent-Coordination
Environment=NODE_ENV=production
Environment=SSE_PORT=3444
Environment=SSE_HOST=0.0.0.0
ExecStart=/usr/bin/node src/sse-server.js
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

# Enable and start
sudo systemctl enable mcp-server
sudo systemctl start mcp-server
```

### 3. Firewall Configuration
```bash
# Enable UFW firewall
sudo ufw enable

# Allow SSH, HTTP, HTTPS
sudo ufw allow 22
sudo ufw allow 80
sudo ufw allow 443

# Check status
sudo ufw status
```

### 4. Final Testing
```bash
# Health check
curl -s https://smoothcurves.nexus/health | jq

# MCP endpoint
curl -s https://smoothcurves.nexus/mcp

# SSL verification
echo | openssl s_client -connect smoothcurves.nexus:443 -servername smoothcurves.nexus 2>/dev/null | openssl x509 -noout -dates
```

## VSCode Remote Development

**Perfect integration with DigitalOcean**:

1. **Install VSCode Remote-SSH extension**
2. **Add SSH config** (`~/.ssh/config`):
```
Host smoothcurves-mcp
    HostName 147.182.203.45
    User mcp
    IdentityFile ~/.ssh/id_rsa
```
3. **Connect**: `Ctrl+Shift+P` → "Remote-SSH: Connect to Host" → `smoothcurves-mcp`
4. **Install Claude Code** directly on the remote server

## Monitoring & Maintenance

### System Monitoring
```bash
# System resources
htop

# Service status
sudo systemctl status mcp-server nginx

# SSL certificate expiry
sudo certbot certificates

# Disk usage
df -h
du -sh /home/mcp/Human-Adjacent-Coordination/
```

### Log Management
```bash
# Application logs
tail -f /home/mcp/Human-Adjacent-Coordination/logs/sse-server.log

# System logs
sudo journalctl -u mcp-server -f

# Nginx logs
sudo tail -f /var/log/nginx/access.log
```

### Backup Strategy
```bash
# Daily backup script
#!/bin/bash
DATE=$(date +%Y%m%d)
tar -czf /home/mcp/backups/mcp-backup-$DATE.tar.gz \
    -C /home/mcp Human-Adjacent-Coordination/data \
    -C /etc/letsencrypt live archive
```

## Migration Timeline

**Total Time**: 30-45 minutes for complete setup

1. **DigitalOcean Account**: 5 minutes
2. **SSH Key Setup**: 5 minutes  
3. **Droplet Creation**: 2 minutes
4. **Initial Server Setup**: 10 minutes
5. **Code Migration**: 5 minutes
6. **SSL Certificate**: 5 minutes
7. **Service Configuration**: 5 minutes
8. **Testing**: 5 minutes

## Cost Analysis

### Monthly Costs
- **Basic Droplet**: $12/month
- **Volume (optional)**: $1/month per 10GB
- **Bandwidth**: Included (1TB/month)
- **Backups (optional)**: 20% of droplet cost ($2.40/month)

### Annual Cost
- **Basic Setup**: $144/year
- **With Volume + Backups**: $180/year
- **vs RunPod**: Saves $4,200+/year

## Conclusion

DigitalOcean provides the **ideal hosting environment** for our MCP system:
- **Standard networking** eliminates all RunPod complexity
- **Full control** over SSL, ports, and configuration  
- **Predictable costs** at a fraction of RunPod pricing
- **Professional development environment** with native SSH
- **Proven reliability** for production workloads

**Next Step**: Create your DigitalOcean account and let's get this deployed in under an hour! 🚀

---
*Created: September 10, 2025*
*Status: Ready for DigitalOcean migration*