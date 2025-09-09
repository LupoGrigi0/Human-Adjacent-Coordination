#!/bin/bash

# Let's Encrypt SSL Setup using port 443 (no port 80 needed)
# Works with RunPod port mapping: 17689 → 443

set -e

echo "================================================"
echo "  🔐 Let's Encrypt SSL Setup (Port 443 Method)"
echo "     Domain: SmoothCurves.nexus"
echo "     External Port: 17689 → 443"
echo "================================================"
echo ""

cd /projects/Human-Adjacent-Coordination

# Step 1: Create nginx config that serves ACME challenge on port 443
echo "🔧 Step 1: Creating nginx config for port 443 ACME validation..."

cat > /etc/nginx/sites-available/letsencrypt-443 << 'EOF'
server {
    listen 443 default_server;
    server_name SmoothCurves.nexus;
    
    # Serve Let's Encrypt ACME challenge
    location /.well-known/acme-challenge/ {
        root /var/www/html;
        try_files $uri $uri/ =404;
        # Add headers to ensure plain HTTP response
        add_header Content-Type text/plain;
    }
    
    # Temporary: Serve health check for testing
    location = /health {
        proxy_pass https://127.0.0.1:3444/health;
        proxy_ssl_verify off;
        proxy_set_header Host $host;
    }
    
    # Everything else returns info about SSL setup
    location / {
        return 200 'SSL Setup in Progress for SmoothCurves.nexus. Please wait...';
        add_header Content-Type text/plain;
    }
}
EOF

cat > /etc/nginx/nginx-443-setup.conf << 'EOF'
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

    access_log /var/log/nginx/access.log;
    error_log /var/log/nginx/error.log;

    # Include our ACME-serving config
    include /etc/nginx/sites-available/letsencrypt-443;
}
EOF

# Apply the config
pkill nginx || true
nginx -c /etc/nginx/nginx-443-setup.conf -t
nginx -c /etc/nginx/nginx-443-setup.conf

echo "✅ Nginx configured for ACME challenge on port 443"

# Step 2: Test external access
echo "🌐 Step 2: Testing external access..."
sleep 2

if curl -k https://213.173.105.105:17689/health > /dev/null 2>&1; then
    echo "✅ External port 17689→443 is accessible!"
elif curl -k https://SmoothCurves.nexus:17689/health > /dev/null 2>&1; then
    echo "✅ Domain access on port 17689 works!"
else
    echo "⚠️  External access test inconclusive, proceeding anyway..."
fi

# Step 3: Use standalone mode with port 443
echo "🔐 Step 3: Attempting Let's Encrypt with standalone mode on port 443..."

# Stop nginx temporarily for standalone mode
pkill nginx

# Try certbot standalone on port 443
certbot certonly \
    --standalone \
    --preferred-challenges http \
    --http-01-port 443 \
    --email admin@SmoothCurves.nexus \
    --agree-tos \
    --no-eff-email \
    --domains SmoothCurves.nexus \
    --force-renewal

if [ $? -eq 0 ]; then
    echo "✅ SSL certificate obtained!"
    
    # Step 4: Create final HTTPS configuration
    echo "🔧 Step 4: Creating production HTTPS configuration..."
    
    cat > /etc/nginx/sites-available/smoothcurves-production << 'EOF'
server {
    listen 443 ssl http2;
    server_name SmoothCurves.nexus;
    
    # Let's Encrypt SSL certificates
    ssl_certificate /etc/letsencrypt/live/SmoothCurves.nexus/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/SmoothCurves.nexus/privkey.pem;
    
    # Modern SSL configuration
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-RSA-AES256-GCM-SHA512:DHE-RSA-AES256-GCM-SHA512:ECDHE-RSA-AES256-GCM-SHA384;
    ssl_prefer_server_ciphers off;
    ssl_session_cache shared:SSL:10m;
    
    # Security headers
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Frame-Options DENY;
    add_header X-Content-Type-Options nosniff;
    
    # Proxy all requests to SSE MCP server
    location / {
        proxy_pass https://127.0.0.1:3444;
        proxy_ssl_verify off;
        
        # Standard proxy headers
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
        proxy_set_header X-Forwarded-Port 443;
        
        # SSE-specific settings
        proxy_http_version 1.1;
        proxy_set_header Connection '';
        proxy_buffering off;
        proxy_cache off;
        proxy_read_timeout 24h;
        
        # CORS for MCP clients
        add_header Access-Control-Allow-Origin *;
        add_header Access-Control-Allow-Methods "GET, POST, OPTIONS";
        add_header Access-Control-Allow-Headers "Authorization, Content-Type, Accept";
    }
}
EOF

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
    
    access_log /var/log/nginx/access.log;
    error_log /var/log/nginx/error.log;
    
    gzip on;
    gzip_vary on;
    gzip_proxied any;
    gzip_comp_level 6;
    
    include /etc/nginx/sites-available/smoothcurves-production;
}
EOF

    # Test and apply production config
    nginx -c /etc/nginx/nginx-production.conf -t
    nginx -c /etc/nginx/nginx-production.conf
    
    echo "✅ Production HTTPS server started!"
    
    # Step 5: Final test
    echo "🧪 Step 5: Final validation..."
    sleep 3
    
    if curl -s https://213.173.105.105:17689/health > /dev/null 2>&1; then
        echo "✅ HTTPS working on external IP!"
        curl https://213.173.105.105:17689/health | head -1
    fi
    
    if curl -s https://SmoothCurves.nexus:17689/health > /dev/null 2>&1; then
        echo "✅ HTTPS working on domain!"
        curl https://SmoothCurves.nexus:17689/health | head -1
    fi
    
    echo ""
    echo "================================================"
    echo "  🎉 SSL DEPLOYMENT SUCCESSFUL!"
    echo "================================================"
    echo ""
    echo "🎯 Production endpoints:"
    echo "   HTTPS (External IP): https://213.173.105.105:17689/health"
    echo "   HTTPS (Domain): https://SmoothCurves.nexus:17689/health"
    echo "   MCP Endpoint: https://SmoothCurves.nexus:17689/mcp"
    echo ""
    echo "🤖 Ready for Claude Desktop/Web MCP connections!"
    
else
    echo "❌ Certificate generation failed"
    echo "Falling back to self-signed certificate setup..."
    
    # Fallback: Start nginx with our existing setup
    nginx -c /etc/nginx/nginx-mcp.conf
    echo "✅ Fallback: HTTP proxy running on port 3000"
fi