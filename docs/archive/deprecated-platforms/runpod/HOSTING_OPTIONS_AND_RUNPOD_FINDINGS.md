# Hosting Options & RunPod SSL Investigation Results

## Current Challenge Summary

We successfully built and deployed the Human-Adjacent Coordination System MCP server on RunPod, but encountered SSL certificate challenges that prevent Claude Desktop/Web from connecting securely.

### ✅ What Works
- **MCP Server**: Functional, externally accessible at `https://213.173.105.105:17686/mcp`
- **SSE Streaming**: Server-Sent Events working correctly
- **Self-Signed SSL**: Local connections work, external connections get browser warnings
- **RunPod Environment**: Automation scripts, persistent storage, complete development environment

### ❌ Current SSL Problem
- **Domain SSL Issue**: `https://smoothcurves.nexus:17686/mcp` fails with HSTS errors
- **Port Mapping Complexity**: Internal port 443 → external port 17689 breaks Let's Encrypt validation
- **Certificate Validation**: Let's Encrypt cannot reach `http://smoothcurves.nexus/.well-known/acme-challenge/` due to redirect loops

## Test Results from User (September 9, 2025)

From Windows machine using Chrome:

1. **https://213.173.105.105:17686/mcp** 
   - Result: ✅ **CONNECTED TO MCP!** 
   - Issue: "Connection not secure" warning (self-signed cert)

2. **http://213.173.105.105:80**
   - Result: ❌ "Site can't be reached"

3. **http://smoothcurves.nexus:80**
   - Result: ❌ Redirects to HTTPS then "Site can't be reached"
   - Issue: HSTS blocking with no ignore option

4. **http://a29fq2z8gihgna-80.proxy.runpod.net:80**
   - Result: ✅ Shows "Let's Encrypt validation server ready for SmoothCurves.nexus"
   - Behavior: Immediately redirects to HTTPS

## RunPod Network Architecture Analysis

### Port Mapping Types
- **HTTP Ports (80, 8080, 8000)**: Direct mapping, no proxy, external port = internal port
- **TCP Ports (22, 443, 3000, 3444)**: Proxied with external port remapping:
  - 22 → 17685 (SSH)
  - 443 → 17689 (HTTPS)
  - 3000 → 17688 (HTTP Proxy)
  - 3444 → 17686 (MCP Server)
  - 3445 → 17687

### Critical Limitation: 100-Second Timeout
RunPod's HTTP proxy has a 100-second timeout that disconnects idle connections, making it unsuitable for long-running SSE connections required by MCP.

## Discovered Solution: Symmetrical Ports (Above 70000)

**Key Finding**: RunPod ports above 70000 use **symmetrical mapping** (internal = external) and bypass the proxy system entirely.

### Proposed Test Strategy
- **MCP Server**: Port 73444 → 73444 (direct TCP, no timeout)
- **Nginx HTTPS**: Port 70443 → 70443 (direct TCP, standard HTTPS)
- **Domain**: `https://smoothcurves.nexus:70443/mcp`
- **Let's Encrypt**: Standard validation on port 80, serve on 70443

## DigitalOcean VPS Recommendation

### Recommended Configuration
- **Droplet**: Basic Droplet, $12/month
- **Specs**: 1 GB RAM, 1 vCPU, 25 GB SSD, 1000 GB transfer
- **OS**: Ubuntu 24.04 LTS
- **Location**: Choose closest to your region

### DigitalOcean Advantages
- **Standard Networking**: Ports 80/443 work normally, no proxy complexity
- **SSH Access**: Direct SSH with key-based auth from Windows
- **Predictable Environment**: Standard Linux VPS, no container limitations
- **SSL Setup**: Let's Encrypt works in 5 minutes with certbot
- **VSCode Remote**: Full development environment
- **Cost**: $12/month, predictable billing

### Migration Effort Estimate
- **SSH Setup**: 10 minutes (upload SSH key)
- **Environment Setup**: 30 minutes (Node.js, nginx, git clone)
- **SSL Certificates**: 5 minutes (certbot --nginx)
- **MCP Testing**: 10 minutes
- **Total**: ~1 hour for complete working system

### Setup Commands (DigitalOcean)
```bash
# Initial setup
sudo apt update && sudo apt upgrade -y
sudo apt install -y nodejs npm nginx git certbot python3-certbot-nginx

# Clone and setup
git clone https://github.com/yourusername/Human-Adjacent-Coordination.git
cd Human-Adjacent-Coordination
npm install

# SSL (requires domain pointing to droplet IP)
sudo certbot --nginx -d smoothcurves.nexus

# Start services
npm start
```

## Decision Matrix

| Factor | RunPod (Symmetrical Ports) | DigitalOcean VPS |
|--------|---------------------------|------------------|
| **Setup Time** | 30 minutes | 60 minutes |
| **Success Probability** | 85% | 95% |
| **Monthly Cost** | Already paid | $12/month |
| **SSH Access** | Limited (port 17685) | Native SSH |
| **SSL Complexity** | Custom port solution | Standard ports |
| **Long-term Maintenance** | Proxy complications | Straightforward |
| **Development Experience** | Container limitations | Full control |
| **GPU Access** | ✅ Available | ❌ None |

## Recommendation

**For MCP hosting specifically**: **DigitalOcean VPS** is the better choice due to:
1. Standard SSL/HTTPS on ports 80/443
2. No proxy timeouts for SSE connections  
3. Familiar SSH-based development workflow
4. Predictable, well-documented environment

**Keep RunPod for**: GPU-intensive AI workloads where the networking complexity is worth the compute power.

## Next Steps

### Option A: Test Symmetrical Ports on RunPod
1. Add TCP ports 73444 and 70443 (triggers pod reset)
2. Update MCP server to bind to 73444
3. Configure nginx for HTTPS on 70443
4. Test `https://smoothcurves.nexus:70443/mcp`

### Option B: Migrate to DigitalOcean
1. Create $12/month droplet with SSH key
2. Point smoothcurves.nexus DNS to new IP
3. Run standard Let's Encrypt setup
4. Test `https://smoothcurves.nexus/mcp`

---
*Document created: September 9, 2025*
*Status: Ready for pod reset testing or migration decision*