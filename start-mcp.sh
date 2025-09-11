#!/bin/bash
cd /mnt/coordinaton_mcp_data/Human-Adjacent-Coordination
export NODE_ENV=production
export SSE_PORT=3444  
export SSE_HOST=smoothcurves.nexus
export SSL_CERT_PATH=/etc/letsencrypt/live/smoothcurves.nexus

echo 'Starting MCP server...'
echo 'Environment: NODE_ENV='$NODE_ENV', SSE_PORT='$SSE_PORT', SSE_HOST='$SSE_HOST
node src/sse-server.js
