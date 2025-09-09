#!/bin/bash

# RunPod Complete Setup Script for Human-Adjacent Coordination System
# This script recreates the entire working environment after pod resets
# Generated from successful 2025-09-09 deployment session

set -e  # Exit on any error

echo "================================================"
echo "  🚀 Human-Adjacent Coordination System"
echo "     Complete RunPod Environment Setup"
echo "     Version: 2025-09-09 Production Ready"
echo "================================================"
echo ""

# ============================================================================
# PHASE 1: PERSISTENT HOME DIRECTORY SETUP
# ============================================================================
echo "📁 PHASE 1: Setting up persistent home directory..."

# Move root home to persistent storage if not already done
if [ ! -d "/projects/root-home" ]; then
    echo "Moving root home directory to persistent storage..."
    cp -r /root /projects/root-home
    echo "Root home moved to /projects/root-home"
fi

# Create symbolic link to persistent home
if [ ! -L "/root" ] || [ "$(readlink /root)" != "/projects/root-home" ]; then
    echo "Linking /root to persistent storage..."
    rm -rf /root
    ln -sf /projects/root-home /root
    echo "Root home linked to persistent storage"
fi

# Update HOME environment variable
export HOME=/projects/root-home
cd $HOME

echo "✅ Persistent home directory configured"
echo ""

# ============================================================================  
# PHASE 2: NODE.JS AND DEPENDENCIES
# ============================================================================
echo "📦 PHASE 2: Installing Node.js and dependencies..."

# Update package list
apt update

# Install Node.js 20.x via NodeSource repository (most reliable method)
echo "Installing Node.js 20.x..."
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
apt install -y nodejs

# Verify Node.js installation
NODE_VERSION=$(node -v)
echo "✅ Node.js installed: $NODE_VERSION"

# Install global packages
echo "Installing global npm packages..."
npm install -g @anthropic-ai/claude-code

echo "✅ Dependencies installed"
echo ""

# ============================================================================
# PHASE 3: NGINX AND REVERSE PROXY SETUP
# ============================================================================
echo "🌐 PHASE 3: Setting up nginx reverse proxy..."

# Install nginx and certbot
apt install -y nginx certbot python3-certbot-nginx

# Kill any running nginx instances
pkill nginx || true

# Create custom nginx configuration (no conflicts with RunPod defaults)
cat > /etc/nginx/nginx-mcp.conf << 'EOF'
user www-data;
worker_processes auto;
pid /run/nginx.pid;

events {
    worker_connections 768;
}

http {
    sendfile on;
    tcp_nopush on;
    tcp_nodelay on;
    keepalive_timeout 65;
    types_hash_max_size 2048;

    include /etc/nginx/mime.types;
    default_type application/octet-stream;

    # Logging
    access_log /var/log/nginx/access.log;
    error_log /var/log/nginx/error.log;

    # Gzip
    gzip on;
    gzip_vary on;
    gzip_proxied any;
    gzip_comp_level 6;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml application/xml+rss text/javascript;

    # Include our MCP site configuration
    include /etc/nginx/sites-available/smoothcurves-mcp-temp;
}
EOF

# Create site configuration for HTTP reverse proxy
cat > /etc/nginx/sites-available/smoothcurves-mcp-temp << 'EOF'
# HTTP reverse proxy for SmoothCurves.nexus MCP system
# Maps port 3000 (external 16872) to SSE server on port 3444
server {
    listen 3000;
    server_name SmoothCurves.nexus;
    
    # Let's Encrypt challenge location (for future SSL setup)
    location /.well-known/acme-challenge/ {
        root /var/www/html;
    }
    
    # Proxy all traffic to SSE server
    location / {
        proxy_pass https://127.0.0.1:3444;
        proxy_ssl_verify off;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-Host $server_name;
        
        # SSE-specific headers
        proxy_set_header Connection '';
        proxy_http_version 1.1;
        proxy_buffering off;
        proxy_cache off;
        proxy_read_timeout 24h;
        proxy_send_timeout 24h;
        
        # CORS headers for MCP clients
        add_header Access-Control-Allow-Origin *;
        add_header Access-Control-Allow-Methods "GET, POST, OPTIONS";
        add_header Access-Control-Allow-Headers "Authorization, Content-Type, Accept";
    }
    
    # Health check endpoint
    location = /health {
        proxy_pass https://127.0.0.1:3444/health;
        proxy_ssl_verify off;
        proxy_set_header Host $host;
        access_log off;
    }
}
EOF

# Create web root for Let's Encrypt
mkdir -p /var/www/html

# Test nginx configuration
nginx -c /etc/nginx/nginx-mcp.conf -t

# Start nginx with custom config
nginx -c /etc/nginx/nginx-mcp.conf

echo "✅ Nginx reverse proxy configured and running on port 3000"
echo ""

# ============================================================================
# PHASE 4: SSE SERVER FIXES AND STARTUP
# ============================================================================
echo "🔧 PHASE 4: Applying SSE server fixes and starting..."

# Navigate to project directory
cd /projects/Human-Adjacent-Coordination

# Apply critical network binding fix if not already done
if ! grep -q "SSE_HOST.*HOST" src/sse-server.js; then
    echo "Applying network binding fix to src/sse-server.js..."
    sed -i 's/host: process\.env\.HOST || '\''localhost'\'',/host: process.env.SSE_HOST || process.env.HOST || '\''localhost'\'',/' src/sse-server.js
    echo "✅ Network binding fix applied"
fi

# Generate SSL certificates if they don't exist
if [ ! -f "certs/server.crt" ]; then
    echo "Generating self-signed SSL certificates..."
    mkdir -p certs
    openssl req -x509 -newkey rsa:2048 -nodes \
        -keyout ./certs/server.key \
        -out ./certs/server.crt \
        -days 365 \
        -subj "/C=US/ST=Washington/L=Yakima/O=HumanAdjacentAI/CN=localhost" \
        -addext "subjectAltName=DNS:localhost,DNS:SmoothCurves.nexus,IP:127.0.0.1,IP:213.173.105.105,IP:0.0.0.0"
    echo "✅ SSL certificates generated"
fi

# Install npm dependencies
if [ ! -d "node_modules" ]; then
    echo "Installing npm dependencies..."
    npm install
fi

# Start SSE server in background
echo "Starting SSE MCP Server..."
nohup ./scripts/start-sse-production.sh > /tmp/sse-server-startup.log 2>&1 &

# Wait for server to start and test
sleep 5

echo "✅ SSE server startup initiated"
echo ""

# ============================================================================
# PHASE 5: VALIDATION AND STATUS
# ============================================================================
echo "🧪 PHASE 5: System validation..."

# Test SSE server health
echo "Testing SSE server health..."
if curl -k -f https://localhost:3444/health > /dev/null 2>&1; then
    echo "✅ SSE server responding on port 3444"
else
    echo "⚠️  SSE server not yet responding (may still be starting)"
fi

# Test nginx reverse proxy
echo "Testing nginx reverse proxy..."
if curl -f -H "Host: SmoothCurves.nexus" http://localhost:3000/health > /dev/null 2>&1; then
    echo "✅ Nginx reverse proxy working on port 3000"
else
    echo "❌ Nginx reverse proxy not responding"
fi

# Check processes
echo ""
echo "🔍 Process status:"
echo "Nginx processes:"
ps aux | grep nginx | grep -v grep || echo "  No nginx processes found"
echo ""
echo "Node.js processes:"
ps aux | grep node | grep -v grep || echo "  No node processes found"
echo ""

# Show network listeners
echo "🌐 Network listeners:"
ss -tlnp | grep -E ":(3000|3444)" || echo "  No listeners on ports 3000 or 3444"
echo ""

# ============================================================================
# FINAL STATUS AND INSTRUCTIONS
# ============================================================================
echo "================================================"
echo "  ✅ SETUP COMPLETE!"
echo "================================================"
echo ""
echo "🎯 ACCESS POINTS:"
echo "   Local SSE:     https://localhost:3444/health"
echo "   Local Proxy:   http://localhost:3000/health"  
echo "   External SSE:  https://213.173.105.105:16870/health"
echo "   External Proxy: http://213.173.105.105:16872/health"
echo ""
echo "🔍 VALIDATION COMMANDS:"
echo "   curl -k https://localhost:3444/health"
echo "   curl http://SmoothCurves.nexus:16872/health"
echo ""
echo "📋 NEXT STEPS:"
echo "   1. Verify external access from your Windows machine"
echo "   2. Add port 80 mapping to RunPod for Let's Encrypt SSL"
echo "   3. Run: certbot certonly --standalone -d SmoothCurves.nexus"
echo "   4. Test MCP connectivity with Claude Desktop/Web"
echo ""
echo "💡 TROUBLESHOOTING:"
echo "   - Check logs: tail -f logs/sse-server.log"
echo "   - Check nginx: nginx -c /etc/nginx/nginx-mcp.conf -t"
echo "   - Restart SSE: ./scripts/start-sse-production.sh"
echo ""
echo "🤖 Human-Adjacent Coordination System ready!"
echo "================================================"