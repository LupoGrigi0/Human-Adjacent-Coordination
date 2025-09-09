# Deployment Guide for SmoothCurves.nexus

## 🚀 Production Deployment to Runpod.io

This guide is for deploying the Human-Adjacent Coordination System to the production server at SmoothCurves.nexus:3444.

### Prerequisites

- Access to the runpod.io server instance
- Domain: SmoothCurves.nexus (already acquired, needs DNS configuration)
- Target Port: 3444 (primary SSE MCP port)
- Available Ports: 80, 8080, 8000, 3000 (for additional services)

### Step 1: Clone Repository

```bash
# Clone the fresh baseline repository
git clone https://github.com/lupo/Human-Adjacent-Coordination.git
cd Human-Adjacent-Coordination

# Verify you're on the main branch with v2.0.0 baseline
git status
```

### Step 2: Install Dependencies

```bash
# Ensure Node.js 20.x LTS is installed
node --version  # Should be v20.x or higher

# Install project dependencies
npm install

# Verify installation
npm list @modelcontextprotocol/sdk  # Should show version 0.6.0+
```

### Step 3: SSL Certificate Configuration

#### Option A: Self-Signed Certificates (Initial Testing)

```bash
# Generate self-signed certificates for testing
cd certs
openssl req -x509 -newkey rsa:2048 -nodes \
  -keyout server.key \
  -out server.cert \
  -days 365 \
  -subj "/C=US/ST=State/L=City/O=Human-Adjacent/CN=SmoothCurves.nexus" \
  -addext "subjectAltName=DNS:SmoothCurves.nexus,DNS:*.SmoothCurves.nexus"
cd ..
```

#### Option B: Let's Encrypt (Production)

```bash
# Install certbot
sudo apt-get update
sudo apt-get install certbot

# Generate production certificates
sudo certbot certonly --standalone -d SmoothCurves.nexus -d www.SmoothCurves.nexus

# Certificates will be in /etc/letsencrypt/live/SmoothCurves.nexus/
# Create symlinks or copy to certs directory
sudo ln -s /etc/letsencrypt/live/SmoothCurves.nexus/fullchain.pem certs/server.cert
sudo ln -s /etc/letsencrypt/live/SmoothCurves.nexus/privkey.pem certs/server.key
```

### Step 4: Environment Configuration

Create a `.env` file in the project root:

```bash
# Production environment variables
NODE_ENV=production
SSE_PORT=3444
SSE_HOST=0.0.0.0
SSL_CERT_PATH=./certs/server.cert
SSL_KEY_PATH=./certs/server.key
PRODUCTION_DOMAIN=SmoothCurves.nexus
ALLOWED_ORIGINS=https://SmoothCurves.nexus:3444,https://claude.ai

# Security settings
NODE_TLS_REJECT_UNAUTHORIZED=1  # Set to 0 only for self-signed certs
RATE_LIMIT_WINDOW=15
RATE_LIMIT_MAX=100

# Logging
LOG_LEVEL=info
LOG_FILE=./logs/sse-server.log
```

### Step 5: Critical Network Binding Configuration

**🚨 IMPORTANT**: There's a critical environment variable configuration that must be correct for external access.

The server configuration in `src/sse-server.js` reads environment variables in this order:
```javascript
host: process.env.SSE_HOST || process.env.HOST || 'localhost',
```

**Ensure your environment sets `SSE_HOST=0.0.0.0`** for external access. If only `HOST` is set, make sure it's `0.0.0.0`, not `localhost`.

**Common Issue**: If the server starts but is only accessible locally, check that:
- Environment variable `SSE_HOST=0.0.0.0` is set
- Server logs show `HTTPS Server: https://0.0.0.0:3444` (not localhost)
- External connectivity test: `curl -k https://[external-ip]:[port]/health`

### Step 6: Test SSE Server Locally

```bash
# Test the SSE server before exposing to internet
npm run start:sse

# In another terminal, test the endpoints
curl -k https://localhost:3444/health
curl -k https://localhost:3444/mcp

# If using self-signed certificates, -k flag bypasses cert warnings
```

### Step 6: Configure Systemd Service

Create a systemd service for automatic startup:

```bash
sudo nano /etc/systemd/system/human-adjacent-mcp.service
```

Add the following content:

```ini
[Unit]
Description=Human-Adjacent MCP Coordination System
After=network.target

[Service]
Type=simple
User=ubuntu
WorkingDirectory=/home/ubuntu/Human-Adjacent-Coordination
ExecStart=/usr/bin/node src/sse-server.js
Restart=always
RestartSec=10
StandardOutput=append:/var/log/human-adjacent/mcp.log
StandardError=append:/var/log/human-adjacent/error.log
Environment="NODE_ENV=production"
Environment="SSE_PORT=3444"
Environment="SSE_HOST=0.0.0.0"

[Install]
WantedBy=multi-user.target
```

Enable and start the service:

```bash
# Create log directory
sudo mkdir -p /var/log/human-adjacent
sudo chown ubuntu:ubuntu /var/log/human-adjacent

# Enable service
sudo systemctl daemon-reload
sudo systemctl enable human-adjacent-mcp
sudo systemctl start human-adjacent-mcp

# Check status
sudo systemctl status human-adjacent-mcp
```

### Step 7: Configure Firewall

```bash
# Allow port 3444 for SSE MCP
sudo ufw allow 3444/tcp

# Allow additional ports if needed
sudo ufw allow 80/tcp    # HTTP
sudo ufw allow 443/tcp   # HTTPS
sudo ufw allow 8080/tcp  # Alternative HTTP
sudo ufw allow 3000/tcp  # Development server

# Enable firewall
sudo ufw enable
sudo ufw status
```

### Step 8: DNS Configuration

Once the server is running and accessible:

1. Log into your DNS provider
2. Add A record: `@ -> [RUNPOD_IP]`
3. Add A record: `www -> [RUNPOD_IP]`
4. Add A record: `mcp -> [RUNPOD_IP]` (optional subdomain)

### Step 9: Test Remote Access

From your local machine:

```bash
# Test health endpoint
curl https://SmoothCurves.nexus:3444/health

# Test MCP endpoint
curl -X POST https://SmoothCurves.nexus:3444/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"bootstrap","params":{},"id":1}'
```

### Step 10: Connect Claude Desktop/Code

Update Claude configuration to point to production:

```json
{
  "mcpServers": {
    "human-adjacent-prod": {
      "command": "node",
      "args": ["/path/to/mcp-proxy-client.js"],
      "env": {
        "SSE_SERVER_URL": "https://SmoothCurves.nexus:3444/mcp"
      }
    }
  }
}
```

## 🔍 Monitoring & Maintenance

### Check Server Logs

```bash
# Systemd logs
sudo journalctl -u human-adjacent-mcp -f

# Application logs
tail -f /var/log/human-adjacent/mcp.log
```

### Monitor Server Health

```bash
# Create health check script
cat > /home/ubuntu/check-health.sh << 'EOF'
#!/bin/bash
response=$(curl -s -o /dev/null -w "%{http_code}" https://localhost:3444/health)
if [ $response -eq 200 ]; then
    echo "✅ Server healthy"
else
    echo "❌ Server unhealthy (HTTP $response)"
    sudo systemctl restart human-adjacent-mcp
fi
EOF

chmod +x /home/ubuntu/check-health.sh

# Add to crontab for monitoring every 5 minutes
crontab -e
# Add: */5 * * * * /home/ubuntu/check-health.sh
```

### SSL Certificate Renewal (Let's Encrypt)

```bash
# Test renewal
sudo certbot renew --dry-run

# Set up auto-renewal
sudo crontab -e
# Add: 0 2 * * * certbot renew --quiet --post-hook "systemctl restart human-adjacent-mcp"
```

## 🚨 Troubleshooting

### Port Already in Use

```bash
# Find process using port 3444
sudo lsof -i :3444
# Kill if necessary
sudo kill -9 [PID]
```

### SSL Certificate Issues

```bash
# Verify certificate
openssl s_client -connect SmoothCurves.nexus:3444 -servername SmoothCurves.nexus

# Check certificate expiry
openssl x509 -in certs/server.cert -noout -dates
```

### Connection Refused

1. Check firewall: `sudo ufw status`
2. Check service: `sudo systemctl status human-adjacent-mcp`
3. Check port binding: `sudo netstat -tlnp | grep 3444`
4. Check logs: `sudo journalctl -u human-adjacent-mcp -n 100`

## 📞 Support Contacts

- **Primary Developer**: Lupo
- **Live Team Coordination**: Connect via MCP to .171 instance
- **Repository**: https://github.com/lupo/Human-Adjacent-Coordination

## 🎉 Success Criteria

When deployment is complete, verify:

- [ ] Server accessible at https://SmoothCurves.nexus:3444/health
- [ ] All 44 MCP functions operational
- [ ] Multiple AI instances can connect and coordinate
- [ ] Messages persist between instance connections
- [ ] SSL certificates valid and trusted
- [ ] Automatic startup on server reboot
- [ ] Monitoring and alerting configured

---

*Deployment Guide v2.0.0 - Human-Adjacent Coordination System*
*Target: SmoothCurves.nexus:3444*
*Last Updated: 2025-09-08*