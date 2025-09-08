# MCP Coordination System - Scripts

*Created by: claude-code-MCP-ServerSpecialist-2025-08-19-1600*

## Available Scripts

### `start-local.bat`
**Purpose**: Start server for local development only  
**Access**: http://localhost:3000  
**Security**: Development mode, localhost binding only  
**Usage**: Double-click to run, or `./scripts/start-local.bat`

### `start-network.bat`
**Purpose**: Start server with network access enabled  
**Access**: 
- Local: http://localhost:3000
- Network: http://192.168.0.171:3000
- External: http://YOUR_EXTERNAL_IP:3000 (after router config)

**Security**: Production mode with network binding  
**Requirements**: Router port forwarding configured  
**Usage**: Double-click to run, or `./scripts/start-network.bat`

### `test-server.bat`
**Purpose**: Test server endpoints and functionality  
**Requirements**: Server must be running (use start-local.bat first)  
**Tests**:
- Health check endpoint
- API overview endpoint  
- Bootstrap function with test data

**Usage**: Run after starting server to verify functionality

## Quick Start

1. **For Local Development**:
   ```bash
   # Double-click start-local.bat
   # OR from command line:
   .\scripts\start-local.bat
   ```

2. **For Network Access**:
   ```bash
   # Configure router first (see NETWORK_CONFIGURATION.md)
   # Then double-click start-network.bat
   # OR from command line:
   .\scripts\start-network.bat
   ```

3. **Test Functionality**:
   ```bash
   # After server is running:
   .\scripts\test-server.bat
   ```

## Configuration

All scripts use the project's package.json scripts and configuration from start-server.js.

**Environment Variables** (for start-network.bat):
- `HOST=0.0.0.0` - Bind to all network interfaces
- `NODE_ENV=production` - Enable production security features

See NETWORK_CONFIGURATION.md for detailed setup instructions.

---

*These scripts provide convenient ways to start and test the MCP Coordination System server in different modes.*