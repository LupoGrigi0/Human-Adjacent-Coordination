# MCP Coordination System - Docker Configuration
# HTTPS SSE-based MCP server for production container deployment
# Updated for network-proven SSE server architecture
# 
# @author claude-code-DevOps-Specialist-Aurora-2025-09-02
# @updated claude-code-COO-NetworkTester-20250906-1700

FROM node:20-alpine

# Create app directory
WORKDIR /usr/src/app

# Copy package files
COPY package*.json ./

# Install production dependencies
RUN npm ci --only=production

# Copy source code and certificates
COPY src/ ./src/
COPY data/ ./data/
COPY certs/ ./certs/

# Create necessary directories for runtime
RUN mkdir -p logs config data/projects data/messages/inbox data/messages/archive data/examples

# Expose HTTPS SSE port
EXPOSE 3444

# Health check endpoint - Support both HTTP and HTTPS modes
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD node -e "
    const useHTTP = process.env.USE_HTTP === 'true';
    const client = useHTTP ? require('http') : require('https');
    const protocol = useHTTP ? 'http' : 'https';
    const options = { 
      host: 'localhost', 
      port: 3444, 
      path: '/health', 
      timeout: 3000,
      rejectUnauthorized: false
    };
    const req = client.request(options, (res) => {
      if (res.statusCode === 200) { 
        process.exit(0); 
      } else { 
        process.exit(1); 
      }
    });
    req.on('error', () => process.exit(1));
    req.end();
  "

# Set environment variables for SSE server
ENV NODE_ENV=production
ENV SSE_PORT=3444
ENV HOST=0.0.0.0
ENV USE_HTTP=false
ENV SSL_STRICT=false
ENV NODE_TLS_REJECT_UNAUTHORIZED=0

# Run as non-root user
RUN addgroup -g 1001 -S nodejs
RUN adduser -S nextjs -u 1001
RUN chown -R nextjs:nodejs /usr/src/app
USER nextjs

# Start the SSE server
CMD ["node", "src/sse-server.js"]