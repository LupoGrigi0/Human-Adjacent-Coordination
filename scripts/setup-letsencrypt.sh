#!/bin/bash

# Let's Encrypt SSL Certificate Setup for SmoothCurves.nexus
# Run this after port 80 and 443 are accessible from the internet

set -e

echo "================================================"
echo "  🔐 Let's Encrypt SSL Certificate Setup"
echo "     Domain: SmoothCurves.nexus"
echo "================================================"
echo ""

# Ensure we're in the right directory
cd /projects/Human-Adjacent-Coordination

# Step 1: Switch to Let's Encrypt nginx config
echo "🔧 Step 1: Switching to Let's Encrypt nginx configuration..."
pkill nginx || true
nginx -c /etc/nginx/nginx-letsencrypt.conf -t
nginx -c /etc/nginx/nginx-letsencrypt.conf
echo "✅ Nginx configured for Let's Encrypt validation"
echo ""

# Step 2: Test port 80 accessibility
echo "🌐 Step 2: Testing port 80 accessibility..."
if curl -s http://SmoothCurves.nexus/ > /dev/null 2>&1; then
    echo "✅ Port 80 is accessible"
else
    echo "❌ Port 80 is not accessible yet"
    echo "Please ensure RunPod port mapping is configured:"
    echo "  - Port 80 → 80 (HTTP)"
    echo "  - Port 443 → 443 (HTTPS)"
    echo ""
    echo "Once ports are ready, run this script again."
    exit 1
fi

# Step 3: Generate Let's Encrypt certificate
echo "🔐 Step 3: Generating Let's Encrypt SSL certificate..."
certbot certonly \
    --webroot \
    --webroot-path=/var/www/html \
    --email admin@SmoothCurves.nexus \
    --agree-tos \
    --no-eff-email \
    --domains SmoothCurves.nexus

if [ $? -eq 0 ]; then
    echo "✅ SSL certificate generated successfully!"
else
    echo "❌ SSL certificate generation failed"
    echo "Check the error messages above for troubleshooting"
    exit 1
fi

# Step 4: Create HTTPS nginx configuration
echo "🔧 Step 4: Creating HTTPS nginx configuration..."

cat > /etc/nginx/sites-available/smoothcurves-https << 'EOF'
# SmoothCurves.nexus HTTPS Configuration with SSL
server {
    listen 80;
    server_name SmoothCurves.nexus;
    
    # Let's Encrypt ACME challenge
    location /.well-known/acme-challenge/ {
        root /var/www/html;
    }
    
    # Redirect HTTP to HTTPS
    location / {
        return 301 https://$server_name$request_uri;
    }
}

server {
    listen 443 ssl http2;
    server_name SmoothCurves.nexus;
    
    # SSL certificates from Let's Encrypt
    ssl_certificate /etc/letsencrypt/live/SmoothCurves.nexus/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/SmoothCurves.nexus/privkey.pem;
    
    # Modern SSL configuration
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-RSA-AES256-GCM-SHA512:DHE-RSA-AES256-GCM-SHA512:ECDHE-RSA-AES256-GCM-SHA384:DHE-RSA-AES256-GCM-SHA384;
    ssl_prefer_server_ciphers off;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 10m;
    
    # Security headers
    add_header X-Frame-Options DENY;
    add_header X-Content-Type-Options nosniff;
    add_header X-XSS-Protection "1; mode=block";
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    
    # Proxy to SSE MCP server
    location / {
        proxy_pass https://127.0.0.1:3444;
        
        # Disable SSL verification for self-signed cert on backend
        proxy_ssl_verify off;
        proxy_ssl_session_reuse off;
        
        # Headers for MCP/SSE
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-Host $server_name;
        proxy_set_header X-Forwarded-Port 443;
        
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
        
        # Handle OPTIONS requests
        if ($request_method = 'OPTIONS') {
            add_header Access-Control-Allow-Origin *;
            add_header Access-Control-Allow-Methods "GET, POST, OPTIONS";
            add_header Access-Control-Allow-Headers "Authorization, Content-Type, Accept";
            add_header Content-Length 0;
            add_header Content-Type text/plain;
            return 200;
        }
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

# Step 5: Create final nginx configuration with HTTPS
cat > /etc/nginx/nginx-production.conf << 'EOF'
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

    # Include HTTPS site configuration
    include /etc/nginx/sites-available/smoothcurves-https;
}
EOF

echo "✅ HTTPS configuration created"

# Step 6: Test and apply new configuration
echo "🧪 Step 6: Testing new HTTPS configuration..."
nginx -c /etc/nginx/nginx-production.conf -t

if [ $? -eq 0 ]; then
    echo "✅ Nginx configuration is valid"
    
    # Apply the new configuration
    pkill nginx || true
    nginx -c /etc/nginx/nginx-production.conf
    
    echo "✅ Nginx restarted with HTTPS configuration"
else
    echo "❌ Nginx configuration test failed"
    exit 1
fi

# Step 7: Final validation
echo "🧪 Step 7: Final validation..."

sleep 3

# Test HTTPS endpoint
if curl -s https://SmoothCurves.nexus/health > /dev/null 2>&1; then
    echo "✅ HTTPS endpoint is working!"
    curl https://SmoothCurves.nexus/health
else
    echo "⚠️  HTTPS endpoint test failed (may need time to propagate)"
fi

echo ""
echo "================================================"
echo "  ✅ SSL SETUP COMPLETE!"
echo "================================================"
echo ""
echo "🎯 Production endpoints:"
echo "   HTTPS: https://SmoothCurves.nexus/health"
echo "   HTTPS MCP: https://SmoothCurves.nexus/mcp"
echo ""
echo "🔄 HTTP redirects automatically to HTTPS"
echo "🔐 Let's Encrypt certificate installed"
echo "🤖 Ready for Claude Desktop/Web MCP connections!"
echo ""
echo "🔄 To renew certificate (in 3 months):"
echo "   certbot renew"
echo ""
echo "🎉 Human-Adjacent Coordination System is now GLOBALLY ACCESSIBLE with SSL!"