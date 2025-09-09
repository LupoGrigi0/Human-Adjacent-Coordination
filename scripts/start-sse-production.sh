#!/bin/bash

# Start SSE MCP Server - Production Mode
# For Human-Adjacent Coordination System
# Target: SmoothCurves.nexus:3444

echo "================================================"
echo "  Human-Adjacent Coordination System"
echo "  SSE MCP Server - Production Mode"
echo "  Port: 3444 (HTTPS)"
echo "================================================"
echo ""

# Set production environment
export NODE_ENV=production
export SSE_PORT=3444
export SSE_HOST=0.0.0.0
export DEBUG=false

# Production domain configuration
export PRODUCTION_DOMAIN=SmoothCurves.nexus

# SSL certificate paths (will use Let's Encrypt in production)
# Note: SSL_CERT_PATH should be the directory, not the file
if [ -f "/etc/letsencrypt/live/SmoothCurves.nexus/fullchain.pem" ]; then
    echo "✅ Using Let's Encrypt certificates for SmoothCurves.nexus"
    # For Let's Encrypt, we'll need to symlink or copy to certs directory
    export SSL_CERT_PATH=./certs
    export NODE_TLS_REJECT_UNAUTHORIZED=1
elif [ -f "./certs/server.crt" ] || [ -f "./certs/server.cert" ]; then
    echo "⚠️  Using self-signed certificates (development mode)"
    export SSL_CERT_PATH=./certs
    export NODE_TLS_REJECT_UNAUTHORIZED=0
else
    echo "🔧 No certificates found. Generating self-signed certificates..."
    
    # Create certificates directory if it doesn't exist
    mkdir -p ./certs
    
    # Generate self-signed certificate
    openssl req -x509 -newkey rsa:2048 -nodes \
        -keyout ./certs/server.key \
        -out ./certs/server.cert \
        -days 365 \
        -subj "/C=US/ST=State/L=City/O=HumanAdjacentAI/CN=localhost" \
        -addext "subjectAltName=DNS:localhost,DNS:SmoothCurves.nexus,IP:127.0.0.1,IP:213.173.105.105"
    
    if [ $? -eq 0 ]; then
        echo "✅ Self-signed certificates generated successfully"
        export SSL_CERT_PATH=./certs/server.cert
        export SSL_KEY_PATH=./certs/server.key
        export NODE_TLS_REJECT_UNAUTHORIZED=0
    else
        echo "❌ Failed to generate certificates"
        exit 1
    fi
fi

echo ""
echo "🔧 Configuration:"
echo "   Environment: $NODE_ENV"
echo "   Port: $SSE_PORT"
echo "   Host: $SSE_HOST"
echo "   Domain: $PRODUCTION_DOMAIN"
echo "   SSL Cert Dir: $SSL_CERT_PATH"
echo ""

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed"
    echo "   Please install Node.js 20.x or later"
    exit 1
fi

# Check Node.js version
NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 20 ]; then
    echo "⚠️  Warning: Node.js version is less than 20.x"
    echo "   Current version: $(node -v)"
    echo "   Recommended: v20.x or later"
fi

# Check if dependencies are installed
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies..."
    npm install
    if [ $? -ne 0 ]; then
        echo "❌ Failed to install dependencies"
        exit 1
    fi
fi

echo ""
echo "🚀 Starting SSE MCP Server..."
echo "   Local health check: https://localhost:$SSE_PORT/health"
echo "   External health check: https://$PRODUCTION_DOMAIN:$SSE_PORT/health"
echo ""
echo "Press Ctrl+C to stop the server"
echo "================================================"
echo ""

# Start the SSE server
node src/sse-server.js

# Handle server exit
if [ $? -eq 0 ]; then
    echo ""
    echo "✅ SSE MCP server stopped normally"
else
    echo ""
    echo "❌ SSE MCP server failed or crashed"
    echo ""
    echo "💡 Troubleshooting:"
    echo "   1. Check if port $SSE_PORT is available: lsof -i :$SSE_PORT"
    echo "   2. Verify SSL certificates exist and are readable"
    echo "   3. Check logs for detailed error information"
    echo "   4. Ensure all dependencies are installed: npm install"
    echo "   5. For production deployment:"
    echo "      - Run: sudo certbot certonly --standalone -d $PRODUCTION_DOMAIN"
    echo "      - Ensure DNS points to this server's IP"
fi

echo ""
echo "Server session ended"