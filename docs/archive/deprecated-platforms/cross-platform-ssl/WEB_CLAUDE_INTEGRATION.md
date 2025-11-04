# Web Claude MCP Integration Guide

## Overview

Web-based Claude instances can connect to the MCP Coordination System via the HTTPS server using JSON-RPC over HTTP. This allows web Claude to coordinate with Claude Desktop and Claude Code instances seamlessly.

## Connection Methods

### Method 1: HTTPS JSON-RPC Endpoint

**Endpoint**: `https://localhost:3443/mcp`
**Protocol**: JSON-RPC 2.0 over HTTPS
**Content-Type**: `application/json`

### Method 2: REST API Endpoints

**Base URL**: `https://localhost:3443/api/mcp/`
**Protocol**: REST over HTTPS
**Content-Type**: `application/json`

## HTTPS Server Setup

### Start the Server

```bash
cd D:\Lupo\Source\AI\CladueCOO\mcp-coordination-system
npm run start:https
```

The server provides:
- ✅ HTTPS endpoint at `https://localhost:3443`
- ✅ MCP JSON-RPC at `/mcp`
- ✅ REST API at `/api/mcp/*`
- ✅ Auto-generated SSL certificates
- ✅ CORS enabled for web access

### Verify Server Status

```bash
curl -k https://localhost:3443/health
```

Expected response:
```json
{
  "status": "healthy",
  "timestamp": "2025-08-23T08:52:08.346Z",
  "server": {
    "name": "MCP Coordination System",
    "version": "1.0.0",
    "protocol": "mcp",
    "status": "operational"
  },
  "https": true,
  "port": 3443
}
```

## JSON-RPC Integration

### Initialize Connection

```javascript
const MCP_ENDPOINT = 'https://localhost:3443/mcp';

async function callMCPTool(toolName, args = {}) {
  const response = await fetch(MCP_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      method: 'tools/call',
      params: {
        name: toolName,
        arguments: args
      },
      id: Math.floor(Math.random() * 1000)
    })
  });
  
  return await response.json();
}
```

### List Available Tools

```javascript
async function listMCPTools() {
  const response = await fetch(MCP_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      method: 'tools/list',
      id: 1
    })
  });
  
  return await response.json();
}
```

### Example Usage

```javascript
// Bootstrap as a PA instance
const bootstrapResult = await callMCPTool('bootstrap', {
  role: 'PA',
  instanceId: 'web-claude-pa-001'
});

// Get all projects
const projectsResult = await callMCPTool('get_projects');

// Create a new task
const taskResult = await callMCPTool('create_task', {
  id: 'web-task-001',
  title: 'Review project status',
  description: 'Check all active projects and update status',
  project_id: 'collections-rescue',
  priority: 'high'
});

// Send a message to the COO
const messageResult = await callMCPTool('send_message', {
  to: 'COO',
  from: 'web-claude-pa-001',
  subject: 'Status Update',
  content: 'All projects reviewed and updated',
  priority: 'normal'
});
```

## REST API Integration

### Bootstrap Endpoint

```javascript
const response = await fetch('https://localhost:3443/api/mcp/bootstrap', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    role: 'PA',
    instanceId: 'web-claude-pa-001'
  })
});
```

### Generic Function Call

```javascript
const response = await fetch('https://localhost:3443/api/mcp/call', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    function: 'get_projects',
    params: {
      status: 'active',
      priority: 'high'
    }
  })
});
```

### Server Status Check

```javascript
const response = await fetch('https://localhost:3443/api/mcp/status', {
  method: 'GET',
  headers: {
    'Content-Type': 'application/json',
  }
});
```

## Available MCP Tools

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

### Messaging System
- `send_message` - Send messages between instances
- `get_messages` - Retrieve messages for an instance
- `mark_message_read` - Mark message as read
- `archive_message` - Archive completed message

### Instance Management
- `register_instance` - Register new AI instance
- `update_heartbeat` - Update instance activity status
- `get_instances` - Get all registered instances

## Complete Example: Web Claude Dashboard

```html
<!DOCTYPE html>
<html>
<head>
    <title>MCP Coordination Dashboard</title>
</head>
<body>
    <h1>MCP Coordination System</h1>
    <div id="status"></div>
    <div id="projects"></div>
    <div id="tasks"></div>

    <script>
        const MCP_ENDPOINT = 'https://localhost:3443/mcp';
        const instanceId = 'web-claude-dashboard-' + Date.now();

        async function callMCP(method, params = {}) {
            try {
                const response = await fetch(MCP_ENDPOINT, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        jsonrpc: '2.0',
                        method: method === 'tools/list' ? method : 'tools/call',
                        params: method === 'tools/list' ? {} : { name: method, arguments: params },
                        id: Math.floor(Math.random() * 1000)
                    })
                });
                return await response.json();
            } catch (error) {
                console.error('MCP call failed:', error);
                return { error: error.message };
            }
        }

        async function initialize() {
            // Bootstrap instance
            const bootstrap = await callMCP('bootstrap', {
                role: 'PA',
                instanceId: instanceId
            });
            console.log('Bootstrap result:', bootstrap);

            // Get server status
            const status = await callMCP('get_server_status');
            document.getElementById('status').innerHTML = 
                `<h2>Server Status</h2><pre>${JSON.stringify(status.result, null, 2)}</pre>`;

            // Get projects
            const projects = await callMCP('get_projects');
            document.getElementById('projects').innerHTML = 
                `<h2>Projects</h2><pre>${JSON.stringify(projects.result, null, 2)}</pre>`;

            // Get pending tasks
            const tasks = await callMCP('get_pending_tasks');
            document.getElementById('tasks').innerHTML = 
                `<h2>Pending Tasks</h2><pre>${JSON.stringify(tasks.result, null, 2)}</pre>`;
        }

        // Initialize on page load
        initialize();
    </script>
</body>
</html>
```

## SSL Certificate Handling

### Development (Self-Signed Certificates)

The server auto-generates self-signed certificates. Browsers will show security warnings:

1. **Chrome/Edge**: Click "Advanced" → "Proceed to localhost (unsafe)"
2. **Firefox**: Click "Advanced" → "Accept the Risk and Continue"
3. **Accept the certificate** when prompted

### Production Setup

For production, replace self-signed certificates with proper SSL certificates:

1. Obtain SSL certificates from a Certificate Authority
2. Replace files:
   - `certs/server.key` - Private key
   - `certs/server.crt` - Certificate
3. Restart the HTTPS server

## Error Handling

### Common Issues

1. **CORS Errors**: Server enables CORS by default, but ensure proper headers
2. **SSL Certificate Warnings**: Expected with self-signed certificates
3. **Connection Refused**: Ensure HTTPS server is running on port 3443
4. **ERR_SSL_KEY_USAGE_INCOMPATIBLE**: Certificate lacks required key usage extensions

### SSL Certificate Error: ERR_SSL_KEY_USAGE_INCOMPATIBLE

**Problem**: Modern browsers show `ERR_SSL_KEY_USAGE_INCOMPATIBLE` and refuse to connect, even with "Advanced" options.

**Root Cause**: The SSL certificate was generated without the required `digitalSignature` key usage extension.

**Solution**: Regenerate certificates with proper extensions:

1. **Update certificate configuration**:
   ```bash
   # Edit certs/openssl.conf
   [v3_req]
   keyUsage = critical, digitalSignature, keyEncipherment, dataEncipherment
   extendedKeyUsage = serverAuth
   subjectAltName = @alt_names
   ```

2. **Regenerate certificates**:
   ```bash
   cd certs/
   rm -f server.key server.crt
   openssl genrsa -out server.key 2048
   openssl req -new -x509 -key server.key -out server.crt -days 365 -config openssl.conf
   ```

3. **Restart HTTPS server**:
   ```bash
   # Kill existing server
   netstat -ano | findstr 3443  # Find process ID
   taskkill /PID [process_id] /F
   
   # Start with new certificate
   npm run start:https
   ```

**Verification**: Browser should now show standard "Not Secure" warning with clickable "Advanced" button.

### Error Response Format

```json
{
  "jsonrpc": "2.0",
  "error": {
    "code": -32603,
    "message": "Internal error",
    "data": "Additional error details"
  },
  "id": 1
}
```

### Success Response Format

```json
{
  "jsonrpc": "2.0",
  "result": {
    "content": [
      {
        "type": "text",
        "text": "Function result as JSON string"
      }
    ]
  },
  "id": 1
}
```

## Security Considerations

- Uses HTTPS with SSL certificates
- CORS enabled for localhost/127.0.0.1
- Rate limiting: 1000 requests per 15 minutes
- Request size limit: 10MB
- Security headers enabled via Helmet middleware

## Testing Commands

```bash
# Test health check
curl -k https://localhost:3443/health

# Test MCP tools list
curl -k -X POST https://localhost:3443/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc": "2.0", "method": "tools/list", "id": 1}'

# Test bootstrap function
curl -k -X POST https://localhost:3443/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc": "2.0", "method": "tools/call", "params": {"name": "bootstrap", "arguments": {"role": "PA", "instanceId": "test-001"}}, "id": 2}'
```

---

**Created by**: claude-code-MCP-ProtocolExpert-2025-08-23-1600  
**Updated**: 2025-08-23  
**Version**: 1.0.0