# nginx Configuration for MCP Server
**Created by**: Network Analysis Specialist (claude-opus-4-1-20250805)  
**Date**: 2025-09-11  
**Purpose**: Preserve nginx reverse proxy configuration for SmoothCurves.nexus MCP deployment

## Overview
This nginx configuration provides a production-ready reverse proxy for the MCP (Model Context Protocol) server, handling SSL termination, OAuth 2.1 endpoints, and Server-Sent Events (SSE) streaming.

## Configuration File Location
**DigitalOcean**: `/etc/nginx/sites-enabled/smoothcurves-nexus`

## Complete Configuration

```nginx
# Redirect HTTP to HTTPS
server {
    listen 80;
    server_name smoothcurves.nexus;
    return 301 https://$server_name$request_uri;
}

# HTTPS server for MCP
server {
    listen 443 ssl http2;
    server_name smoothcurves.nexus;
    
    # Let's Encrypt SSL certificates
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
        proxy_read_timeout 24h;
        proxy_send_timeout 24h;
    }
    
    # OAuth 2.1 discovery endpoints
    location /.well-known/ {
        proxy_pass https://localhost:3444/.well-known/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
    
    # OAuth authorization endpoints
    location /authorize {
        proxy_pass https://localhost:3444/authorize;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
    
    location /token {
        proxy_pass https://localhost:3444/token;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
    
    location /register {
        proxy_pass https://localhost:3444/register;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
    
    # Health check
    location /health {
        proxy_pass https://localhost:3444/health;
        proxy_set_header Host $host;
        access_log off;
    }
    
    # Root redirects to health
    location = / {
        return 302 /health;
    }
}
```

## Key Features

### 🔒 SSL/TLS Configuration
- **Let's Encrypt Integration**: Automatic certificate management
- **Modern TLS**: TLSv1.2 and TLSv1.3 only
- **HSTS**: Strict Transport Security headers
- **Security Headers**: Frame protection, content type sniffing prevention

### 🌐 MCP Integration
- **Primary Endpoint**: `/mcp` → `https://localhost:3444/mcp`
- **SSE Optimization**: 24-hour timeouts, no buffering, HTTP/1.1
- **Real-time Streaming**: Configured for Server-Sent Events transport

### 🔐 OAuth 2.1 Support
- **Discovery**: `/.well-known/` endpoints for OAuth metadata
- **Authorization Flow**: `/authorize`, `/token`, `/register` endpoints
- **MCP-specific**: Supports both base and `/mcp`-suffixed discovery paths

### 📊 Monitoring
- **Health Check**: `/health` endpoint for load balancer integration
- **Access Logging**: Disabled for health checks, enabled for MCP traffic
- **Root Redirect**: `/` → `/health` for easy status checking

## Installation Instructions

### 1. Create Configuration File
```bash
sudo nano /etc/nginx/sites-enabled/smoothcurves-nexus
# Paste the configuration above
```

### 2. SSL Certificate Setup
```bash
# Install Certbot
sudo apt update && sudo apt install certbot python3-certbot-nginx

# Generate Let's Encrypt certificate
sudo certbot certonly --standalone -d smoothcurves.nexus

# Verify certificate paths match nginx config
ls -la /etc/letsencrypt/live/smoothcurves.nexus/
```

### 3. Test and Reload
```bash
# Test configuration
sudo nginx -t

# Reload nginx
sudo systemctl reload nginx

# Verify status
sudo systemctl status nginx
```

### 4. Firewall Configuration
```bash
# Allow HTTP and HTTPS
sudo ufw allow 'Nginx Full'
sudo ufw enable
```

## Verification Commands

```bash
# Test HTTP redirect
curl -I http://smoothcurves.nexus

# Test HTTPS health check
curl -I https://smoothcurves.nexus/health

# Test OAuth discovery
curl https://smoothcurves.nexus/.well-known/oauth-protected-resource

# Test MCP endpoint (should return 401 without auth)
curl -I https://smoothcurves.nexus/mcp
```

## Architecture Diagram

```
Internet → nginx:443 (SSL termination) → Node.js:3444 (MCP Server) → 44 MCP Functions
           ↓
       Let's Encrypt
       SSL Certificates
```

## Troubleshooting

### SSL Issues
```bash
# Check certificate status
sudo certbot certificates

# Renew certificates
sudo certbot renew --dry-run
```

### nginx Issues
```bash
# Check configuration syntax
sudo nginx -t

# View error logs
sudo tail -f /var/log/nginx/error.log

# Check if ports are in use
sudo netstat -tulpn | grep -E ':(80|443|3444)'
```

### MCP Connection Issues
```bash
# Test backend server
curl -k https://localhost:3444/health

# Check if MCP server is running
ps aux | grep node

# View MCP server logs
tail -f /mnt/coordinaton_mcp_data/Human-Adjacent-Coordination/logs/sse-server.log
```

## Migration Notes

### For Streamable HTTP Transport
When migrating from SSE to Streamable HTTP transport:

1. **Preserve this nginx config** - it's transport-agnostic
2. **Update backend server** (`src/sse-server.js`) to support Streamable HTTP
3. **No nginx changes required** - reverse proxy handles both transports
4. **SSL/OAuth configuration remains valid**

### Port Changes
- **Current**: Backend runs on port 3444
- **nginx**: Proxies 443 → 3444
- **Health**: Available at both nginx and backend levels

## Credits
**Research & Implementation**: Network Analysis Specialist (claude-opus-4-1-20250805)  
**SSL Integration**: Previous deployment specialists  
**OAuth 2.1 Endpoints**: Discovered through Claude Desktop compatibility testing  
**SSE Optimization**: Required for real-time MCP streaming (applicable to Streamable HTTP)

## Future Improvements

1. **Load Balancing**: Add upstream block for multiple backend servers
2. **Rate Limiting**: Implement per-IP rate limiting for OAuth endpoints  
3. **Monitoring**: Add nginx status module and metrics
4. **Caching**: Add intelligent caching for static OAuth metadata
5. **IPv6**: Add IPv6 support for dual-stack deployment