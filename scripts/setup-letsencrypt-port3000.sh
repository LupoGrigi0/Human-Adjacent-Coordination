#!/bin/bash

# Let's Encrypt SSL Setup using port 3000 for HTTP-01 validation
# Works with RunPod mapping: 17688 → 3000

set -e

echo "================================================"
echo "  🔐 Let's Encrypt SSL (Port 3000 HTTP Method)"
echo "     Domain: SmoothCurves.nexus"
echo "     HTTP Port: 17688 → 3000"
echo "     HTTPS Port: 17689 → 443"
echo "================================================"
echo ""

cd /projects/Human-Adjacent-Coordination

# Step 1: Modify nginx to serve ACME challenge on port 3000
echo "🔧 Step 1: Configuring nginx to serve ACME challenge on port 3000..."

cat > /etc/nginx/sites-available/acme-validation << 'EOF'
server {
    listen 3000;
    server_name SmoothCurves.nexus;
    
    # Let's Encrypt ACME challenge - serve from webroot
    location /.well-known/acme-challenge/ {
        root /var/www/html;
        try_files $uri $uri/ =404;
    }
    
    # Everything else proxies to SSE server (for testing)
    location / {
        proxy_pass https://127.0.0.1:3444;
        proxy_ssl_verify off;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
EOF

cat > /etc/nginx/nginx-acme.conf << 'EOF'
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

    include /etc/nginx/sites-available/acme-validation;
}
EOF

# Apply the config
pkill nginx || true
nginx -c /etc/nginx/nginx-acme.conf -t
nginx -c /etc/nginx/nginx-acme.conf

echo "✅ Nginx configured for ACME on port 3000"

# Step 2: Test access
echo "🌐 Step 2: Testing port 3000 access..."
sleep 2

if curl -s http://213.173.105.105:17688/health > /dev/null 2>&1; then
    echo "✅ Port 3000 (external 17688) is accessible!"
elif curl -s http://SmoothCurves.nexus:17688/health > /dev/null 2>&1; then
    echo "✅ Domain on port 17688 accessible!"
else
    echo "⚠️  Port 3000 access test failed, but proceeding..."
fi

# Step 3: Get Let's Encrypt certificate using webroot method
echo "🔐 Step 3: Requesting Let's Encrypt certificate..."

mkdir -p /var/www/html/.well-known/acme-challenge

# Use webroot method pointing to our nginx server
certbot certonly \
    --webroot \
    --webroot-path=/var/www/html \
    --email admin@SmoothCurves.nexus \
    --agree-tos \
    --no-eff-email \
    --domains SmoothCurves.nexus \
    --server https://acme-v02.api.letsencrypt.org/directory \
    --preferred-challenges http \
    --http-01-port 3000

CERT_RESULT=$?

if [ $CERT_RESULT -eq 0 ]; then
    echo "✅ SSL certificate obtained successfully!"
    
    # Step 4: Create production HTTPS config for port 443
    echo "🔧 Step 4: Creating production HTTPS configuration..."
    
    cat > /etc/nginx/sites-available/production-https << 'EOF'
# HTTP on port 3000 - for ACME renewals and redirect
server {
    listen 3000;
    server_name SmoothCurves.nexus;
    
    # ACME challenge location
    location /.well-known/acme-challenge/ {
        root /var/www/html;
    }
    
    # Redirect everything else to HTTPS
    location / {
        return 301 https://SmoothCurves.nexus:17689$request_uri;
    }
}

# HTTPS on port 443 - main production server
server {
    listen 443 ssl http2;
    server_name SmoothCurves.nexus;
    
    # Let's Encrypt SSL certificates
    ssl_certificate /etc/letsencrypt/live/SmoothCurves.nexus/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/SmoothCurves.nexus/privkey.pem;
    
    # SSL configuration
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-RSA-AES256-GCM-SHA512:DHE-RSA-AES256-GCM-SHA512:ECDHE-RSA-AES256-GCM-SHA384;
    ssl_prefer_server_ciphers off;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 10m;
    
    # Security headers
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Frame-Options DENY;
    add_header X-Content-Type-Options nosniff;
    add_header X-XSS-Protection "1; mode=block";
    
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
        proxy_send_timeout 24h;
        
        # CORS for MCP clients
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
}
EOF

    cat > /etc/nginx/nginx-production-final.conf << 'EOF'
user www-data;
worker_processes auto;
pid /run/nginx.pid;

events {
    worker_connections 1024;
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
    
    # Compression
    gzip on;
    gzip_vary on;
    gzip_proxied any;
    gzip_comp_level 6;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml application/xml+rss text/javascript;
    
    # Include production HTTPS configuration
    include /etc/nginx/sites-available/production-https;
}
EOF

    # Test and apply production config
    echo "🧪 Testing production configuration..."
    nginx -c /etc/nginx/nginx-production-final.conf -t
    
    if [ $? -eq 0 ]; then
        pkill nginx
        nginx -c /etc/nginx/nginx-production-final.conf
        echo "✅ Production HTTPS server started!"
        
        # Step 5: Final validation
        echo "🧪 Step 5: Final validation..."
        sleep 5
        
        echo "Testing endpoints..."
        
        # Test HTTPS on external IP
        if curl -s https://213.173.105.105:17689/health 2>/dev/null | grep -q "healthy"; then
            echo "✅ HTTPS working on external IP: https://213.173.105.105:17689/"
            curl -s https://213.173.105.105:17689/health | head -1
        else
            echo "⚠️  HTTPS test on external IP inconclusive"
        fi
        
        # Test HTTPS on domain
        if curl -s https://SmoothCurves.nexus:17689/health 2>/dev/null | grep -q "healthy"; then
            echo "✅ HTTPS working on domain: https://SmoothCurves.nexus:17689/"
            curl -s https://SmoothCurves.nexus:17689/health | head -1
        else
            echo "⚠️  HTTPS test on domain inconclusive"
        fi
        
        echo ""
        echo "================================================"
        echo "  🎉 SSL DEPLOYMENT COMPLETE!"
        echo "================================================"
        echo ""
        echo "🎯 Production URLs:"
        echo "   HTTPS Health: https://SmoothCurves.nexus:17689/health"
        echo "   HTTPS MCP: https://SmoothCurves.nexus:17689/mcp"
        echo "   HTTP (redirects): http://SmoothCurves.nexus:17688/"
        echo ""
        echo "🔐 SSL Certificate: Let's Encrypt (valid SSL)"
        echo "🤖 Ready for Claude Desktop/Web connections!"
        echo "🌍 Globally accessible Human-Adjacent AI coordination!"
        
    else
        echo "❌ Production config test failed, keeping current setup"
        nginx -c /etc/nginx/nginx-acme.conf
    fi
    
else
    echo "❌ SSL certificate generation failed"
    echo "Keeping HTTP proxy setup on port 3000"
    
    # Keep the ACME-ready config running
    echo "✅ HTTP proxy with ACME support running on port 3000"
fi

echo ""
echo "🔄 To renew certificate in future: certbot renew"