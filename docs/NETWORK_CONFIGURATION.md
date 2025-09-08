# Network Configuration Guide
**MCP Coordination System - External Access Setup**

*Created by: claude-code-MCP-ServerSpecialist-2025-08-19-1600*

## Current Status ✅

**Server Status**: OPERATIONAL  
**Local Access**: http://localhost:3000  
**Local Network IP**: 192.168.0.171  
**Potential Network Access**: http://192.168.0.171:3000

## Verified Working Endpoints

- ✅ **Health Check**: `GET /health`
- ✅ **API Overview**: `GET /`
- ✅ **Bootstrap**: `POST /api/mcp/bootstrap`
- ✅ **MCP Functions**: `POST /api/mcp/call`
- ✅ **Server Status**: `GET /api/mcp/status`

## Network Configuration Requirements

### For Lupo: Required Network Settings

#### 1. **Router Configuration** 
```bash
# Port forwarding required for external access:
Internal IP: 192.168.0.171
Internal Port: 3000
External Port: 3000 (or different if preferred)
Protocol: TCP
```

#### 2. **Windows Firewall** 
```powershell
# Allow inbound traffic on port 3000
netsh advfirewall firewall add rule name="MCP Server" dir=in action=allow protocol=TCP localport=3000
```

#### 3. **Router Settings Checklist**
- [ ] Port forwarding enabled for 192.168.0.171:3000
- [ ] UPnP enabled (if desired for automatic configuration)
- [ ] External port configured (recommend 3000)
- [ ] Firewall rule allowing TCP traffic on chosen port

#### 4. **Find Your External IP**
```bash
# Get your public IP address
curl ifconfig.me
# OR
curl ipinfo.io/ip
```

### Configuration Options

#### Option A: Default Configuration (Current)
```bash
Host: localhost
Port: 3000
Environment: development
Security: enabled
CORS: enabled
Rate Limiting: enabled
```

#### Option B: Network Access Configuration
```bash
# Set environment variables for network access:
HOST=0.0.0.0  # Allow external connections
PORT=3000     # Or your preferred port
NODE_ENV=production  # Enable production security
```

#### Option C: Custom Port Configuration
```bash
# If port 3000 is in use:
PORT=3001 npm run start:server
# OR
PORT=8080 npm run start:server
```

## Laragon Integration

### Creating Laragon Profile

#### 1. **Laragon Project Setup**
```bash
# In Laragon root directory (typically C:\laragon\www):
mkdir mcp-coordination
cd mcp-coordination

# Create symbolic link or copy project:
mklink /D mcp-server "D:\Lupo\Source\AI\CladueCOO\mcp-coordination-system"
```

#### 2. **Laragon Virtual Host**
Create `C:\laragon\etc\apache2\sites-enabled\mcp.conf`:
```apache
<VirtualHost *:80>
    ServerName mcp.test
    ProxyPreserveHost On
    ProxyRequests Off
    ProxyPass / http://localhost:3000/
    ProxyPassReverse / http://localhost:3000/
</VirtualHost>
```

#### 3. **Alternative: Direct Node.js in Laragon**
```bash
# In Laragon terminal:
cd "D:\Lupo\Source\AI\CladueCOO\mcp-coordination-system"
npm run start:server
```

## Testing Network Connectivity

### Local Network Test
```bash
# Test from another device on same network:
curl http://192.168.0.171:3000/health

# Expected response:
{
  "status": "healthy",
  "timestamp": "2025-08-19T22:XX:XX.XXXZ",
  "server": {
    "name": "MCP Coordination System",
    "version": "1.0.0",
    "protocol": "mcp",
    "status": "operational"
  },
  "uptime": XXX.XXXXXX
}
```

### External Access Test (After Router Configuration)
```bash
# Replace YOUR_EXTERNAL_IP with your public IP:
curl http://YOUR_EXTERNAL_IP:3000/health
```

## Security Considerations

### Current Security Features ✅
- **Helmet.js**: Security headers enabled
- **CORS**: Configured for development/production
- **Rate Limiting**: 100 requests per 15 minutes per IP
- **Input Validation**: JSON payload validation
- **Error Handling**: No sensitive information leaked

### Additional Security Recommendations
1. **Environment Variables**: Store sensitive config in `.env` file
2. **Authentication**: Implement token-based auth for external access
3. **HTTPS**: Add SSL/TLS for production deployment
4. **Monitoring**: Set up logging and monitoring
5. **Backup**: Regular backup of data directory

## Troubleshooting

### Common Issues

#### Server Won't Start
```bash
# Check if port is in use:
netstat -an | findstr :3000

# Kill process using port:
netpid=$(netstat -ano | findstr :3000 | head -1 | awk '{print $5}')
taskkill /PID $netpid /F
```

#### Can't Access from Network
1. Verify Windows Firewall allows port 3000
2. Check router port forwarding configuration
3. Confirm server is binding to correct interface
4. Test with: `telnet 192.168.0.171 3000`

#### CORS Errors
- Current CORS settings allow localhost in development
- For external access, update CORS origin in start-server.js

### Logs and Debugging
```bash
# Server logs will show:
📨 2025-08-19T22:XX:XX.XXXZ - GET /health
📨 2025-08-19T22:XX:XX.XXXZ - POST /api/mcp/bootstrap

# To enable debug logging:
DEBUG=* npm run start:server
```

## Next Steps for External Access

### For Lupo to Configure:

1. **Router Access**:
   - Open router admin panel (typically http://192.168.0.1 or http://192.168.1.1)
   - Navigate to Port Forwarding / NAT / Virtual Servers
   - Add rule: Internal IP: 192.168.0.171, Port: 3000

2. **Test Internal Network Access**:
   ```bash
   # From another device on your network:
   curl http://192.168.0.171:3000/health
   ```

3. **Configure External Access**:
   - Find your external IP: `curl ifconfig.me`
   - Test external access after router configuration

4. **Optional: DNS Setup**:
   - Consider dynamic DNS service for stable external access
   - Examples: DuckDNS, No-IP, DynDNS

## Environment Configuration Files

### Create .env for Custom Settings
```bash
# Create .env file in project root:
echo "HOST=0.0.0.0" > .env
echo "PORT=3000" >> .env
echo "NODE_ENV=production" >> .env
echo "ENABLE_CORS=true" >> .env
echo "ENABLE_SECURITY=true" >> .env
echo "ENABLE_RATE_LIMIT=true" >> .env
```

### Load Environment Variables
Add to start-server.js (already implemented):
```javascript
import dotenv from 'dotenv';
dotenv.config();
```

---

## Current Server Startup Commands

```bash
# Standard startup (localhost only):
npm run start:server

# Development with auto-reload:
npm run start:dev

# Network access (bind to all interfaces):
HOST=0.0.0.0 npm run start:server

# Custom port:
PORT=3001 npm run start:server

# Production mode:
NODE_ENV=production npm run start:server
```

## Summary for Lupo

**What's Working Now:**
- ✅ Server running on localhost:3000
- ✅ All API endpoints responding correctly
- ✅ Bootstrap function fully operational
- ✅ Ready for network configuration

**What You Need to Do:**
1. Configure router port forwarding (192.168.0.171:3000)
2. Test network access from another device
3. Optional: Set up Laragon integration
4. Optional: Configure external access and DNS

**Ready for Next Steps:**
- The MCP Coordination System is ready for AI instance coordination
- Network infrastructure prepared for external connections
- All security and CORS configured appropriately

---

*This configuration enables the MCP Coordination System to serve AI instances across different substrates while maintaining security and reliability.*