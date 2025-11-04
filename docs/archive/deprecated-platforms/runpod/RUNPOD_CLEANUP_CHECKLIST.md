# RunPod Cleanup Checklist - Removing Workarounds for DigitalOcean

## Overview

This document outlines all the RunPod-specific workarounds that need to be removed/simplified when migrating to DigitalOcean's standard networking environment.

## Files to Modify

### 1. `scripts/start-sse-production.sh` - Major Simplification

**Current (RunPod workarounds)**:
```bash
export SSE_PORT=73444  # ← Weird high port for symmetrical mapping
export SSE_HOST=0.0.0.0  # ← Network binding workaround
# Complex SSL certificate detection logic
# Self-signed certificate generation
# RunPod-specific paths and configurations
```

**After (DigitalOcean standard)**:
```bash
#!/bin/bash
export NODE_ENV=production
export SSE_PORT=3444  # ← Back to standard port
export SSE_HOST=smoothcurves.nexus  # ← Proper hostname binding

# Simple Let's Encrypt path (standard location)
if [ -f "/etc/letsencrypt/live/smoothcurves.nexus/fullchain.pem" ]; then
    export SSL_CERT_PATH=/etc/letsencrypt/live/smoothcurves.nexus
    export SSL_KEY_PATH=/etc/letsencrypt/live/smoothcurves.nexus/privkey.pem
else
    echo "❌ SSL certificates not found. Run: sudo certbot --nginx -d smoothcurves.nexus"
    exit 1
fi

node src/sse-server.js
```

**Lines to remove**: 25-60 (complex certificate logic)  
**Lines to simplify**: 14-22 (environment variables)

### 2. `src/sse-server.js` - Fix Network Binding

**Current issue**:
```javascript
const CONFIG = {
  host: process.env.SSE_HOST || process.env.HOST || 'localhost',  // ← 0.0.0.0 workaround
  // ...
};
```

**After (proper hostname)**:
```javascript  
const CONFIG = {
  host: process.env.SSE_HOST || 'smoothcurves.nexus',  // ← Clean hostname binding
  // ...
};
```

**Search and replace**:
- `0.0.0.0` → `smoothcurves.nexus` (everywhere in logging and binding)
- Remove any `process.env.HOST` references (RunPod-specific)

### 3. Nginx Configuration Files - Complete Replacement

**Remove these files**:
- `/etc/nginx/sites-available/smoothcurves-mcp-temp` (port 3000 proxy)
- `/etc/nginx/sites-available/letsencrypt-setup` (custom port 80 config)
- `/etc/nginx/nginx-mcp.conf` (custom config to avoid RunPod conflicts)
- `/etc/nginx/nginx-letsencrypt.conf` (Let's Encrypt workaround)

**Replace with single file** `/etc/nginx/sites-available/smoothcurves-nexus`:
```nginx
# Redirect HTTP to HTTPS
server {
    listen 80;
    server_name smoothcurves.nexus www.smoothcurves.nexus;
    return 301 https://smoothcurves.nexus$request_uri;
}

# HTTPS server
server {
    listen 443 ssl http2;
    server_name smoothcurves.nexus www.smoothcurves.nexus;
    
    # Let's Encrypt SSL certificates (standard location)
    ssl_certificate /etc/letsencrypt/live/smoothcurves.nexus/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/smoothcurves.nexus/privkey.pem;
    
    # Modern SSL configuration
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-RSA-AES128-GCM-SHA256:ECDHE-RSA-AES256-GCM-SHA384;
    ssl_prefer_server_ciphers off;
    
    # Security headers
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Frame-Options DENY always;
    add_header X-Content-Type-Options nosniff always;
    
    # MCP endpoint
    location /mcp {
        proxy_pass https://localhost:3444/mcp;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # SSE-specific headers (no timeout!)
        proxy_set_header Connection '';
        proxy_http_version 1.1;
        proxy_buffering off;
        proxy_cache off;
        proxy_read_timeout 24h;  # ← No 100-second RunPod limit!
        proxy_send_timeout 24h;
    }
    
    # Health check
    location /health {
        proxy_pass https://localhost:3444/health;
        proxy_set_header Host $host;
        access_log off;
    }
    
    # Optional: Serve static files or web UI
    location / {
        proxy_pass https://localhost:3444/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

**Enable the site**:
```bash
sudo ln -sf /etc/nginx/sites-available/smoothcurves-nexus /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx
```

### 4. Scripts to Delete (RunPod-Specific)

**Delete these files entirely**:
- `scripts/runpod-complete-setup.sh` - Complete RunPod automation
- `scripts/setup-letsencrypt-port443.sh` - Port 443 SSL workaround  
- `scripts/setup-letsencrypt-port3000.sh` - Port 3000 SSL workaround
- `scripts/setup-letsencrypt.sh` - Original SSL with RunPod quirks

**Replace with simple** `scripts/digitalocean-setup.sh`:
```bash
#!/bin/bash
echo "DigitalOcean MCP Server Setup"

# Install system packages
sudo apt update
sudo apt install -y nodejs npm nginx certbot python3-certbot-nginx

# Install dependencies
npm install

# Set up SSL (requires DNS pointing to this server)
sudo certbot --nginx -d smoothcurves.nexus

# Create systemd service
sudo tee /etc/systemd/system/mcp-server.service > /dev/null <<EOF
[Unit]
Description=Human-Adjacent Coordination MCP Server
After=network.target

[Service]
Type=simple
User=$USER
WorkingDirectory=$PWD
Environment=NODE_ENV=production
Environment=SSE_PORT=3444
Environment=SSE_HOST=smoothcurves.nexus
ExecStart=/usr/bin/node src/sse-server.js
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

# Enable and start service
sudo systemctl enable mcp-server
sudo systemctl start mcp-server

echo "✅ MCP server is now running at https://smoothcurves.nexus/mcp"
```

### 5. Documentation to Archive

**Move to `docs/archive/` folder**:
- `docs/SESSION_HANDOFF_2025_09_09.md` - RunPod recovery documentation
- `docs/SESSION_HANDOFF_2025_09_09_PART2.md` - SSL investigation 
- `docs/HOSTING_OPTIONS_AND_RUNPOD_FINDINGS.md` - RunPod analysis
- `docs/SYMMETRICAL_PORT_TEST_PLAN.md` - Port workaround attempt

**Keep for reference but mark as obsolete**.

### 6. Environment Variables to Clean Up

**Remove from all files**:
```bash
# RunPod-specific environment variables
SSE_HOST=0.0.0.0  # ← Remove, use proper hostname
SSL_CERT_PATH=./certs/server.cert  # ← Remove, use Let's Encrypt path
NODE_TLS_REJECT_UNAUTHORIZED=0  # ← Remove, use proper SSL
```

**Standardize to**:
```bash  
# Standard production environment
NODE_ENV=production
SSE_PORT=3444
SSE_HOST=smoothcurves.nexus
SSL_CERT_PATH=/etc/letsencrypt/live/smoothcurves.nexus
```

### 7. Package.json Scripts - Simplification

**Current (complex)**:
```json
{
  "scripts": {
    "start:prod": "./scripts/start-sse-production.sh",
    "setup:runpod": "./scripts/runpod-complete-setup.sh"
  }
}
```

**After (simple)**:
```json
{
  "scripts": {
    "start": "node src/sse-server.js",
    "start:prod": "NODE_ENV=production node src/sse-server.js",
    "setup": "./scripts/digitalocean-setup.sh"
  }
}
```

## Testing After Cleanup

### 1. Local Development
```bash
# Should work without any RunPod workarounds
npm start
curl https://localhost:3444/health
```

### 2. Production Deployment
```bash  
# Should work with standard commands
sudo nginx -t
sudo systemctl status mcp-server
curl https://smoothcurves.nexus/health
```

### 3. SSL Verification
```bash
# Should show proper Let's Encrypt certificate
echo | openssl s_client -connect smoothcurves.nexus:443 -servername smoothcurves.nexus 2>/dev/null | openssl x509 -noout -issuer
# Should show: issuer=C = US, O = Let's Encrypt, CN = R3
```

## Complexity Reduction Metrics

**Before (RunPod)**:
- 8 custom scripts
- 4 nginx configurations  
- 200+ lines of port mapping workarounds
- 15 environment variables
- Complex SSL certificate handling

**After (DigitalOcean)**:
- 1 simple setup script
- 1 nginx configuration
- Standard port 80/443 usage
- 3 environment variables  
- Native Let's Encrypt SSL

**Reduction**: ~75% less complexity, 90% fewer custom configurations

## Migration Validation Checklist

After cleanup, verify:

- [ ] **Port 3444**: Server binds to standard port (not 73444)
- [ ] **Hostname**: Uses `smoothcurves.nexus` (not 0.0.0.0)
- [ ] **SSL**: Uses Let's Encrypt certificates (not self-signed)
- [ ] **Nginx**: Single clean configuration file
- [ ] **No timeouts**: Long-running SSE connections work
- [ ] **Standard URLs**: `https://smoothcurves.nexus/mcp` (no port numbers)
- [ ] **Service**: Runs as systemd service (not manual startup)

## Benefits After Cleanup

1. **Maintainability**: Standard configuration, easy to debug
2. **Performance**: No proxy layers, direct connections
3. **Security**: Proper SSL certificates, no workarounds
4. **Scalability**: Easy to replicate on any standard VPS
5. **Documentation**: Configuration matches industry standards

---

**Ready for**: Clean DigitalOcean deployment with standard practices  
**Complexity**: Reduced by 75%  
**Maintainability**: Significantly improved