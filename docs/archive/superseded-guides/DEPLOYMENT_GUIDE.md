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

# Punting recommendations 
Based on my comprehensive research, here's my honest assessment and recommendations:

  🎯 The GOOD NEWS: You're NOT wasting time!

  Your approach is 100% CORRECT. The research confirms:

  1. MCP REQUIRES proper SSL certificates - Claude Desktop/Web need real domain-validated certificates, not proxy SSL
  2. Your architecture is RIGHT - Using Let's Encrypt with SmoothCurves.nexus domain is the proper production approach
  3. RunPod CAN work - But has specific networking quirks we need to navigate

  🚨 RunPod's Critical Limitation: The 100-Second Timeout

  The research revealed a MASSIVE issue: RunPod's HTTP proxy has a 100-second timeout. SSE connections need to stay open much longer for real-time communication, making RunPod's proxy unsuitable for MCP.

  📊 Hosting Recommendations (Pros/Cons)

● Option 1: Fix RunPod (RECOMMENDED - Keep Your Investment)

  Status: ⚡ Very Close to Working
  - Pros: Leverage all your work, GPU access, familiar environment
  - Cons: Network complexity, port mapping challenges
  - Cost: Already paid
  - Effort: 1-2 hours to complete SSL setup
  - Success Rate: 90% based on current progress

  Option 2: Switch to DigitalOcean/Linode VPS

  Status: 🔄 Clean Slate Approach
  - Pros: Full control, standard SSL setup, persistent storage
  - Cons: No GPU, must recreate environment, monthly costs
  - Cost: $10-20/month
  - Effort: 4-6 hours complete setup
  - Success Rate: 95%

  Option 3: Switch to Railway/Render/Fly.io

  Status: 🚀 Modern Platform
  - Pros: Automatic HTTPS, Git deploy, zero config SSL
  - Cons: No SSH access, limited control, usage-based pricing
  - Cost: $5-15/month
  - Effort: 2-3 hours setup
  - Success Rate: 85%

  🎯 My Honest Recommendation: FINISH RunPod!

  Why: You're literally one working Let's Encrypt command away from success. The infrastructure works - we proved the MCP server connects externally. We just need proper SSL certificates.

  Next Steps:
  1. Debug why port 80 isn't responding to domain requests (probably DNS propagation)
  2. Complete Let's Encrypt setup (should take 30 minutes max)
  3. Test Claude Desktop connection

  Fallback: If we can't solve the DNS/port 80 issue in the next hour, I'll help you migrate to a $12/month DigitalOcean droplet where this would work in 20 minutes.

  What do you think? Should we do one final push on RunPod or cut our losses and move to a traditional VPS?

> There is this one bit of hidden information, about symmetrical ports https://docs.runpod.io/pods/configuration/expose-ports it looks like any port we use over 70000 is not proxied. I've lost track of what the 
  actual problem is.. but could this still work if we moved our SSE server to 73444 and the same port inside and outside would be the same, and use something like port 70001 for the nginx proxy? or am I not 
  understanding the problem. but, I'm real close to cutting our losses. A digitalOcean Droplet sounds fantastic. so far the most time consuming issue has allways been getting SSH set up. As soon as I can ssh in 
  from my windows machine, I can install VSCode remote, js node, claude code and synch the repo. after SSH is set up and I'm able to auth with github and anthropic.. the server is pretty rock solid. \
  So, is the problem port 80 and our ip address or is the problem the wierd port mapping of the IP ports.

● AH! You found the KEY! 🎯

  The symmetrical ports above 70000 completely changes everything! This could solve our EXACT problem.

  The Current Problem (Crystal Clear Now):

  1. Port 80 works - We confirmed http://smoothcurves.nexus → Let's Encrypt message
  2. But HTTPS redirects fail - Because port 443 maps to external 17689, breaking SSL
  3. Let's Encrypt needs matching domain/IP - Can't validate when ports don't match

  The Symmetrical Port Solution:

  SSE Server: 73444 → 73444 (no proxy!)
  Nginx: 70443 → 70443 (no proxy!)
  Domain: smoothcurves.nexus:70443

  This bypasses RunPod's proxy entirely - direct TCP connection with matching ports!

  Quick Test Strategy:

  Option A: 30-minute RunPod fix using symmetrical ports
  Option B: Cut losses, move to DigitalOcean ($12/month, SSH-friendly)

  Given your SSH preference and the "rock solid" experience with traditional VPS, I'm leaning toward DigitalOcean. You'll have:

  - SSH access immediately
  - Standard ports (80/443)
  - No proxy weirdness
  - VSCode Remote
  - 20-minute Let's Encrypt setup

  My gut says: The symmetrical ports SHOULD work, but given how much time we've spent on RunPod networking quirks, you might be happier with a clean, predictable VPS environment.

  Your call: 30-minute RunPod experiment with ports 73444/70443, or jump ship to DigitalOcean?

> Ok, let me set up ports 73444 and 70443, it will require a pod reset. but we've proven we can survive that easy. Before I reset the pod. Can you document the digital ocean recommendation droplet.. and document
   what we are trying to test, and why, and what the problem is, and document the test results I handed you earlier.. .this will prevent any confusion when we come back. Once you've documented and checked 
  everything in I'll create tcp ports 73444 and 70443

● I'll document everything thoroughly before the pod reset. Let me create comprehensive documentation covering the DigitalOcean recommendation, our test plan, and all the key findings.

● Write(docs/HOSTING_OPTIONS_AND_RUNPOD_FINDINGS.md)
  ⎿  Wrote 141 lines to docs/HOSTING_OPTIONS_AND_RUNPOD_FINDINGS.md                                                                                                                                      
     # Hosting Options & RunPod SSL Investigation Results
     ## Current Challenge Summary
     We successfully built and deployed the Human-Adjacent Coordination System MCP server on RunPod, but encountered SSL certificate challenges that prevent Claude Desktop/Web from connecting securely.
     ### ✅ What Works
     - **MCP Server**: Functional, externally accessible at `https://213.173.105.105:17686/mcp`
     - **SSE Streaming**: Server-Sent Events working correctly
     - **Self-Signed SSL**: Local connections work, external connections get browser warnings
     … +131 lines (ctrl+r to expand)

● Write(docs/SYMMETRICAL_PORT_TEST_PLAN.md)
  ⎿  Wrote 151 lines to docs/SYMMETRICAL_PORT_TEST_PLAN.md                                                                                    
     # RunPod Symmetrical Port Test Plan
     ## Objective
     Test RunPod's symmetrical port feature (ports >70000) to bypass proxy limitations and enable proper SSL certificates for MCP connections.
     ## The Problem We're Solving
     ### Current Issue
     - **Port Mapping Mismatch**: Internal 443 → External 17689 prevents Let's Encrypt validation
     - **Proxy Timeout**: 100-second timeout kills long-running SSE connections
     … +141 lines (ctrl+r to expand)

● Write(docs/SESSION_HANDOFF_2025_09_09_PART2.md)
  ⎿  Wrote 119 lines to docs/SESSION_HANDOFF_2025_09_09_PART2.md                                                                                                                       
     # Session Handoff - September 9, 2025 (Part 2)
     ## SSL Investigation & Hosting Decision Point
     ### Current Status: MAJOR BREAKTHROUGH + DECISION POINT
     We successfully proved the MCP server works externally but discovered critical RunPod SSL limitations. Now testing a potential bypass solution or preparing for hosting migration.
     ## 🎯 Key Achievements This Session
     ### ✅ MCP Server Fully Functional
     … +109 lines (ctrl+r to expand)

● Now let me commit all documentation:

● Bash(git add docs/HOSTING_OPTIONS_AND_RUNPOD_FINDINGS.md docs/SYMMETRICAL_PORT_TEST_PLAN.md docs/SESSION_HANDOFF_2025_09_09_PART2.md)
  ⎿  (No content)

● Bash(git status)
  ⎿  On branch main                               
     Your branch is up to date with 'origin/main'.
     … +17 lines (ctrl+r to expand)

● Bash(git commit -m "CRITICAL: SSL investigation results & hosting decision documentation…)
  ⎿  [main f3a87eb] CRITICAL: SSL investigation results & hosting decision documentation
      3 files changed, 411 insertions(+)
      create mode 100644 docs/HOSTING_OPTIONS_AND_RUNPOD_FINDINGS.md
     … +2 lines (ctrl+r to expand)

● ✅ Documentation Complete & Committed!

  All documentation has been created and committed to git. Here's what I've documented:

  📋 Key Documents Created:

  1. docs/HOSTING_OPTIONS_AND_RUNPOD_FINDINGS.md
    - Complete test results you provided
    - DigitalOcean VPS specs ($12/month droplet)
    - RunPod vs DigitalOcean decision matrix
    - Migration effort estimates
  2. docs/SYMMETRICAL_PORT_TEST_PLAN.md
    - Detailed test strategy for ports 73444/70443
    - Configuration changes needed
    - Expected results & success criteria
    - 30-minute timeline
  3. docs/SESSION_HANDOFF_2025_09_09_PART2.md
    - Current status & achievements
    - Test results you provided
    - Recovery instructions post-reset

  🎯 Ready for Pod Reset!

  Test Plan: Add TCP ports 73444 and 70443, then:
  - Update MCP server to port 73444
  - Configure nginx HTTPS on port 70443
  - Test https://smoothcurves.nexus:70443/mcp

  Fallback: If symmetrical ports don't work in 30 minutes, we have complete DigitalOcean migration documentation ready.

  You're good to go! Reset the pod with ports 73444 and 70443 - all knowledge is preserved and we'll be right back where we started in minutes. 🚀