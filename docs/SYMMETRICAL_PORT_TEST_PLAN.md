# RunPod Symmetrical Port Test Plan

## Objective
Test RunPod's symmetrical port feature (ports >70000) to bypass proxy limitations and enable proper SSL certificates for MCP connections.

## The Problem We're Solving

### Current Issue
- **Port Mapping Mismatch**: Internal 443 → External 17689 prevents Let's Encrypt validation
- **Proxy Timeout**: 100-second timeout kills long-running SSE connections
- **SSL Redirect Loop**: Domain HTTPS requests fail due to port mismatches

### Root Cause
RunPod's proxy system transforms:
- `https://smoothcurves.nexus:443` → `https://smoothcurves.nexus:17689` (breaks SSL)
- Let's Encrypt validates `http://smoothcurves.nexus/.well-known/acme-challenge/` but gets redirected to HTTPS on wrong port

## Symmetrical Port Solution

### Key Discovery
RunPod documentation states: "To request symmetrical mapping, specify port numbers above 70000 in your TCP configuration - these signal RunPod to allocate matching internal and external ports."

### Test Configuration
- **MCP Server Port**: 73444 → 73444 (direct TCP, no proxy)
- **HTTPS Port**: 70443 → 70443 (direct TCP, no proxy) 
- **HTTP Port**: 80 → 80 (already working for Let's Encrypt)

## Test Plan Steps

### Phase 1: Pod Reset and Port Configuration
1. **Add TCP Ports**: 73444, 70443 (will trigger pod reset)
2. **Verify Symmetrical Mapping**: External ports should match internal ports
3. **Re-run Setup Script**: `./scripts/runpod-complete-setup.sh`

### Phase 2: Service Configuration Updates

#### Update MCP Server Configuration
```bash
# Update scripts/start-sse-production.sh
export SSE_PORT=73444
export SSE_HOST=0.0.0.0
```

#### Create New Nginx Configuration
```nginx
# /etc/nginx/sites-available/smoothcurves-ssl
server {
    listen 70443 ssl http2;
    server_name smoothcurves.nexus;
    
    ssl_certificate /etc/letsencrypt/live/smoothcurves.nexus/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/smoothcurves.nexus/privkey.pem;
    
    location /mcp {
        proxy_pass https://127.0.0.1:73444/mcp;
        # SSE-specific proxy settings
        proxy_set_header Connection '';
        proxy_http_version 1.1;
        proxy_buffering off;
        proxy_cache off;
        proxy_read_timeout 24h;
    }
    
    location /health {
        proxy_pass https://127.0.0.1:73444/health;
    }
}
```

### Phase 3: SSL Certificate Setup
1. **Ensure Port 80 Serves ACME**: Keep existing Let's Encrypt nginx config
2. **Run Let's Encrypt**: `certbot certonly --webroot -w /var/www/html -d smoothcurves.nexus`
3. **Configure SSL on Port 70443**: Use certificates for custom port

### Phase 4: Testing Protocol

#### Test 1: Port Accessibility
```bash
# Should show symmetrical mapping
curl -v https://smoothcurves.nexus:70443/health
```

#### Test 2: MCP Endpoint 
```bash
# Should connect without proxy timeout
curl -v https://smoothcurves.nexus:70443/mcp
```

#### Test 3: External Validation
From Windows machine:
- `https://smoothcurves.nexus:70443/mcp` (should connect with valid SSL)
- Chrome should show secure lock, no certificate warnings

### Phase 5: Claude Desktop Testing
Configure Claude Desktop MCP client:
```json
{
  "mcpServers": {
    "human-adjacent-coordination": {
      "command": "curl",
      "args": ["-N", "https://smoothcurves.nexus:70443/mcp"]
    }
  }
}
```

## Expected Results

### Success Criteria
- ✅ External ports 73444 and 70443 match internal ports
- ✅ `https://smoothcurves.nexus:70443/health` returns JSON health status
- ✅ `https://smoothcurves.nexus:70443/mcp` establishes SSE connection
- ✅ Chrome shows secure connection (green lock)
- ✅ No 100-second timeout on SSE stream
- ✅ Claude Desktop can connect to MCP server

### Potential Issues & Fallbacks
- **Issue**: Symmetrical ports don't work as documented
  - **Fallback**: Immediate migration to DigitalOcean VPS
- **Issue**: Let's Encrypt still can't validate custom port
  - **Fallback**: Self-signed certificates with client-side trust
- **Issue**: SSE connections still timeout
  - **Fallback**: Switch to HTTP polling instead of SSE

## Files to Update Post-Reset

### Configuration Files
- `scripts/start-sse-production.sh` (change port to 73444)
- `src/sse-server.js` (verify port binding)
- Create new nginx config for port 70443

### Test Commands
```bash
# Verify server binding
ss -tlnp | grep 73444

# Test internal connectivity  
curl -k https://localhost:73444/health

# Test external connectivity
curl -k https://smoothcurves.nexus:70443/health
```

## Timeline
- **Setup**: 15 minutes post-reset
- **Testing**: 15 minutes validation
- **Total**: 30 minutes to success or failure decision point

---
*Created: September 9, 2025*
*Ready for: Pod reset with TCP ports 73444 and 70443*