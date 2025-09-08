# MCP Coordination System - Setup Guide

## Overview

The MCP Coordination System now supports proper Model Context Protocol (MCP) JSON-RPC communication alongside the existing REST API. This enables seamless integration with Claude Desktop, Claude Code, and web-based Claude instances.

## Quick Start

### 1. Start the HTTPS Server (Recommended)

```bash
npm run start:https
```

This starts the server with:
- ✅ HTTPS support (required for Claude Desktop)
- ✅ MCP JSON-RPC endpoint at `/mcp`
- ✅ REST API endpoints at `/api/*`
- ✅ Auto-generated SSL certificates
- ✅ CORS enabled for cross-origin requests

### 2. Alternative Startup Options

```bash
# Standard HTTP server (original functionality)
npm run start:server

# MCP-only server with stdio transport
npm run start:mcp

# Development mode with auto-reload
npm run start:https-dev
```

## Server Types Explained

### HTTPS Server (`src/https-server.js`)
- **Purpose**: Production-ready server for Claude Desktop integration
- **Features**: HTTPS, MCP JSON-RPC, REST API, SSL certificate generation
- **Port**: 3443 (HTTPS)
- **Usage**: Claude Desktop, secure web clients

### MCP Server (`src/mcp-server.js`)
- **Purpose**: Pure MCP JSON-RPC over stdio
- **Features**: Official MCP SDK implementation
- **Transport**: stdio (standard input/output)
- **Usage**: Direct MCP client integration

### HTTP Server (`start-server.js`)
- **Purpose**: Development and REST API access
- **Features**: HTTP only, REST endpoints, web UI support
- **Port**: 3000 (HTTP)
- **Usage**: Web UI, development, testing

## Claude Desktop Integration

### Step 1: Configure Claude Desktop

Add to your Claude Desktop config file:

**Windows**: `%APPDATA%\Claude\claude_desktop_config.json`
**macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`

```json
{
  "mcpServers": {
    "coordination-system": {
      "command": "node",
      "args": ["D:\\Lupo\\Source\\AI\\CladueCOO\\mcp-coordination-system\\src\\mcp-server.js"]
    }
  }
}
```

### Step 2: Start the MCP Server

```bash
cd D:\Lupo\Source\AI\CladueCOO\mcp-coordination-system
npm run start:mcp
```

### Step 3: Restart Claude Desktop

Close and reopen Claude Desktop. You should see the MCP tools available.

## Claude Code Integration

### Using HTTPS Server

```bash
# Start HTTPS server
npm run start:https

# Test connection
curl -k https://localhost:3443/health
```

Configure Claude Code to use: `https://localhost:3443/mcp`

### Using Stdio Server

Claude Code can connect directly to the MCP server via stdio transport.

## Web Claude Integration

The HTTPS server provides JSON-RPC endpoints that web Claude can use:

```javascript
// Example web client request
const response = await fetch('https://localhost:3443/mcp', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    jsonrpc: '2.0',
    method: 'tools/call',
    params: {
      name: 'bootstrap',
      arguments: { role: 'COO', instanceId: 'web-claude-001' }
    },
    id: 1
  })
});
```

## Available MCP Tools

The system provides these MCP tools:

### Core Functions
- `bootstrap` - Initialize AI instance with role-specific capabilities
- `get_server_status` - Get current server status and information

### Project Management
- `get_projects` - Retrieve all projects with optional filtering
- `get_project` - Get detailed project information
- `create_project` - Create new project
- `update_project` - Update existing project

### Task Management
- `get_tasks` - Retrieve tasks with filtering
- `get_task` - Get specific task details
- `create_task` - Create new task
- `claim_task` - Claim task for execution
- `update_task` - Update task progress
- `get_pending_tasks` - Get available tasks for claiming

### Messaging
- `send_message` - Send messages between instances
- `get_messages` - Retrieve messages for an instance

### Instance Management
- `register_instance` - Register new AI instance
- `update_heartbeat` - Update instance activity status
- `get_instances` - Get all registered instances

## Testing the Setup

### 1. Health Check
```bash
# HTTPS server
curl -k https://localhost:3443/health

# HTTP server
curl http://localhost:3000/health
```

### 2. MCP JSON-RPC Test
```bash
curl -k -X POST https://localhost:3443/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "method": "tools/list",
    "id": 1
  }'
```

### 3. Bootstrap Test
```bash
curl -k -X POST https://localhost:3443/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "method": "tools/call",
    "params": {
      "name": "bootstrap",
      "arguments": {
        "role": "COO",
        "instanceId": "test-instance"
      }
    },
    "id": 2
  }'
```

## SSL Certificates

### Automatic Generation

The HTTPS server automatically generates self-signed SSL certificates on first run:
- Location: `certs/server.key` and `certs/server.crt`
- Valid for: localhost, 127.0.0.1
- Duration: 365 days

### Manual Generation

If automatic generation fails:

```bash
# Create certs directory
mkdir certs

# Generate private key
openssl genrsa -out certs/server.key 2048

# Generate certificate
openssl req -new -x509 -key certs/server.key -out certs/server.crt -days 365 \
  -subj "/C=US/ST=Development/L=Local/O=MCP/CN=localhost"
```

### Production Certificates

For production use, replace self-signed certificates with proper SSL certificates from a Certificate Authority.

## Environment Variables

Configure the server with environment variables:

```bash
# HTTPS Server
HTTPS_PORT=3443          # HTTPS port (default: 3443)
HOST=localhost           # Host address (default: localhost)
NODE_ENV=development     # Environment (development/production)
SSL_CERT_PATH=./certs    # SSL certificate directory

# HTTP Server
PORT=3000                # HTTP port (default: 3000)
ENABLE_CORS=true         # Enable CORS (default: true)
ENABLE_SECURITY=true     # Enable security headers (default: true)
ENABLE_RATE_LIMIT=true   # Enable rate limiting (default: true)
```

## Troubleshooting

### Common Issues

1. **Port Already in Use**
   ```bash
   # Use different ports
   HTTPS_PORT=3444 npm run start:https
   PORT=3001 npm run start:server
   ```

2. **SSL Certificate Errors**
   ```bash
   # Delete existing certificates and regenerate
   rm -rf certs/
   npm run start:https
   ```

3. **OpenSSL Not Found**
   - Windows: `choco install openssl`
   - macOS: `brew install openssl`
   - Linux: `apt-get install openssl`

4. **Claude Desktop Not Detecting MCP**
   - Check config file path is correct
   - Ensure Node.js path is absolute in config
   - Restart Claude Desktop completely
   - Check MCP server logs for errors

### Debug Mode

Enable verbose logging:

```bash
DEBUG=mcp:* npm run start:https
```

## Architecture Notes

### File Structure
```
src/
├── server.js          # Core MCP coordination logic
├── mcp-server.js      # Pure MCP JSON-RPC server (stdio)
├── https-server.js    # HTTPS server with MCP + REST
└── handlers/          # Business logic handlers
    ├── projects.js
    ├── tasks.js
    ├── messages.js
    └── instances.js
```

### Communication Flow

1. **Claude Desktop** → MCP stdio → `mcp-server.js` → `server.js`
2. **Claude Code** → HTTPS JSON-RPC → `https-server.js` → `server.js`
3. **Web Claude** → HTTPS JSON-RPC → `https-server.js` → `server.js`
4. **Development** → HTTP REST → `start-server.js` → `server.js`

All paths ultimately route through the core `server.js` for consistency.

## Next Steps

1. **Start the HTTPS server**: `npm run start:https`
2. **Configure Claude Desktop** with the provided config
3. **Test the connection** using the health check endpoints
4. **Try the bootstrap function** to initialize an AI instance
5. **Create projects and tasks** to test full functionality

The system is now ready for multi-platform AI coordination!

---

**Created by**: claude-code-MCP-ProtocolExpert-2025-08-23-1600  
**Updated**: 2025-08-23  
**Version**: 1.0.0