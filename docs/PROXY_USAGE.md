# MCP stdio-to-SSE Proxy Bridge

## Overview

The MCP stdio-to-SSE Proxy Bridge (`mcp-proxy-client.js`) enables Claude Desktop and Claude Code to connect to the SSE MCP Server via the stdio transport protocol. This proxy acts as a transparent bridge, forwarding all MCP JSON-RPC messages between clients and the server.

## Architecture

```
Claude Desktop/Code → stdio MCP Proxy → HTTPS/HTTP → SSE MCP Server
     (works!)          (this bridge)      (network)   (already works!)
```

## Features

- **stdio MCP Transport**: Full compliance with MCP stdio specification
- **HTTP/HTTPS Support**: Connects to both HTTP and HTTPS SSE servers
- **SSL Development Mode**: Bypasses self-signed certificate issues
- **Connection Pooling**: Efficient HTTP connection management
- **Error Handling**: Robust retry logic and graceful failure handling
- **Session Management**: Automatic session tracking and recovery
- **Debug Logging**: Optional debug mode for troubleshooting

## Installation & Setup

### 1. Prerequisites

- Node.js 20+ installed
- SSE MCP Server running on `https://localhost:3444/mcp` (or configured URL)
- MCP Coordination System operational

### 2. Configuration

The proxy supports configuration via environment variables:

```bash
# SSE Server URL (default: https://localhost:3444/mcp)
export SSE_SERVER_URL=https://localhost:3444/mcp

# Use HTTP instead of HTTPS (default: false)
export USE_HTTP=true

# Request timeout in milliseconds (default: 30000)
export REQUEST_TIMEOUT=30000

# Maximum retry attempts (default: 3)
export MAX_RETRIES=3

# Enable debug logging (default: false)
export DEBUG=true
```

### 3. Test Connection

Before integrating with Claude, test the proxy connection:

```bash
# Test with HTTPS (default)
node test-proxy-connection.js

# Test with HTTP
USE_HTTP=true node test-proxy-connection.js

# Test with custom server
SSE_SERVER_URL=http://localhost:3444/mcp node test-proxy-connection.js
```

Expected output:
```
🧪 MCP stdio-to-SSE Proxy Connection Test
==================================================
📡 Test 1: Basic Connection
✅ Basic connection successful

🚀 Test 2: MCP Initialize  
✅ Initialize successful
   Server: mcp-coordination-system-sse

🛠️  Test 3: Tools List
✅ Tools list successful
   Found 21 tools
   Tools: bootstrap, get_server_status, get_projects, get_project, create_project...

🎯 Test 4: Bootstrap Tool Call
✅ Bootstrap successful
   Status: Success
   Instance ID: proxy-test-dev-001

📋 Test 5: Get Projects Tool Call
✅ Get projects successful
   Found 2 projects

📊 Test Results
==================================================
Basic Connection: ✅ PASS
MCP Initialize: ✅ PASS
Tools List: ✅ PASS
Bootstrap Call: ✅ PASS
Get Projects Call: ✅ PASS

==================================================
Overall: 5/5 tests passed
🎉 All tests passed! Proxy is ready for Claude integration.
```

## Claude Integration

### Claude Desktop Configuration

Add to your Claude Desktop configuration file (typically `~/.claude/claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "coordination-system-proxy": {
      "command": "node",
      "args": ["D:\\Lupo\\Source\\AI\\CladueCOO\\mcp-coordination-system\\mcp-proxy-client.js"],
      "env": {
        "SSE_SERVER_URL": "https://localhost:3444/mcp",
        "USE_HTTP": "false",
        "DEBUG": "false"
      }
    }
  }
}
```

### Claude Code Configuration

Add to your `.claude.json` MCP configuration:

```json
{
  "mcp": {
    "servers": {
      "coordination-system-proxy": {
        "command": "node",
        "args": ["mcp-proxy-client.js"],
        "cwd": "D:\\Lupo\\Source\\AI\\CladueCOO\\mcp-coordination-system",
        "env": {
          "SSE_SERVER_URL": "https://localhost:3444/mcp",
          "USE_HTTP": "false"
        }
      }
    }
  }
}
```

### Alternative HTTP Configuration

For improved reliability during development, use HTTP mode:

```json
{
  "mcpServers": {
    "coordination-system-proxy": {
      "command": "node",
      "args": ["D:\\Lupo\\Source\\AI\\CladueCOO\\mcp-coordination-system\\mcp-proxy-client.js"],
      "env": {
        "SSE_SERVER_URL": "http://localhost:3444/mcp",
        "USE_HTTP": "true",
        "DEBUG": "false"
      }
    }
  }
}
```

## Available Functions

Through the proxy, Claude instances have access to all 21+ coordination functions:

### Core Functions
- `bootstrap(role, instanceId?)` - Initialize AI instance with role-specific context
- `get_server_status()` - Get MCP server status and information

### Project Management
- `get_projects(status?, priority?, assignee?)` - List projects with optional filtering
- `get_project(id)` - Get detailed project information
- `create_project(id, name, description, ...)` - Create new project
- `update_project(id, updates)` - Update existing project

### Task Management  
- `get_tasks(project_id?, status?, priority?, assignee?)` - List tasks
- `get_task(id)` - Get detailed task information
- `create_task(id, title, description, ...)` - Create new task
- `claim_task(id, instanceId)` - Claim task for execution
- `update_task(id, updates)` - Update task progress
- `get_pending_tasks(priority?, role?)` - Get available tasks

### Communication
- `send_message(to, from, subject, content, priority?)` - Send inter-instance messages
- `get_messages(instanceId, unread_only?, limit?)` - Retrieve messages

### Instance Management
- `register_instance(instanceId, role, capabilities?)` - Register AI instance
- `update_heartbeat(instanceId)` - Update instance activity status
- `get_instances(active_only?, role?)` - List registered instances

### Lessons System
- `submit_lessons(project_id, instance_id, lessons, metadata?)` - Submit extracted lessons
- `get_lessons(project_id?, lesson_types?, min_confidence?, limit?)` - Retrieve lessons
- `get_onboarding_lessons(role?, project_id?, limit?)` - Get critical onboarding lessons
- `get_lesson_patterns(project_id?, pattern_type?)` - Get lesson insights
- `export_lessons(project_id?, format?)` - Export lessons for analysis

## Troubleshooting

### Common Issues

**1. Connection Refused**
```bash
# Check if SSE server is running
curl https://localhost:3444/health

# Try HTTP mode instead
USE_HTTP=true node test-proxy-connection.js
```

**2. SSL Certificate Issues**
```bash
# Use HTTP mode for development
export USE_HTTP=true

# Or ensure SSL certificates are properly configured
cd mcp-coordination-system
npm run setup:ssl
```

**3. Port Conflicts**
```bash
# Check if port is in use
netstat -an | grep 3444

# Use different port (example alternative)
export SSE_SERVER_URL=https://localhost:3446/mcp
```

**4. Claude Integration Issues**
- Ensure absolute paths in configuration files
- Check environment variables are properly set
- Verify proxy process can start independently
- Enable debug mode for detailed logging

### Debug Mode

Enable detailed logging for troubleshooting:

```bash
# Environment variable
export DEBUG=true
node mcp-proxy-client.js

# Or in Claude configuration
"env": {
  "DEBUG": "true"
}
```

Debug output includes:
- Connection status and retry attempts
- Message forwarding details
- Session management
- HTTP/HTTPS request/response logging

### Performance Optimization

**Connection Pooling**: The proxy uses HTTP/HTTPS agents with keep-alive connections for optimal performance.

**Retry Logic**: Exponential backoff retry logic handles temporary network issues.

**Session Persistence**: Session IDs are automatically tracked and maintained across requests.

## Security Notes

**Development Mode**: The proxy bypasses SSL certificate verification for development with self-signed certificates.

**Production Use**: For production deployments:
- Use valid SSL certificates
- Set `NODE_TLS_REJECT_UNAUTHORIZED=1`
- Configure proper CORS and security headers
- Use environment-specific URLs

## Support

For issues or questions:

1. Run `node test-proxy-connection.js` to verify connectivity
2. Check SSE server status at `/health` endpoint
3. Enable debug mode for detailed logging
4. Review MCP server logs for server-side issues

## Version History

- **v1.0.0** - Initial stdio-to-SSE proxy bridge implementation
- Full MCP protocol compliance
- HTTP/HTTPS support with SSL bypass
- Connection pooling and retry logic
- Comprehensive error handling and logging