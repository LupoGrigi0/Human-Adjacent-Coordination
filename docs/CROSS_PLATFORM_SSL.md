# Cross-Platform mkcert Certificate Solution

**Complete HTTPS setup for MCP testing across Windows, Mac, and Android platforms**  
*Author: claude-code-Certificate-Specialist-2025-09-03*

## Overview

This solution enables secure HTTPS connections to the Windows-hosted MCP coordination system from Mac and Android devices on different network subnets. It uses `mkcert` to generate locally trusted certificates that work across all platforms without certificate warnings.

## Architecture

```
Windows Server (192.168.0.171)
├── mkcert CA Certificate Authority
├── Server Certificate (localhost + IP)
├── MCP Coordination System (HTTPS:3444)
└── Certificate Sharing System

Mac Client (192.168.1.100)          Android Device (Mobile Network)
├── mkcert CA Installation           ├── Manual CA Installation  
├── Automatic Trust                  ├── System Trust Store
└── HTTPS Connection ✅              └── HTTPS Connection ✅
```

## Quick Start

### 1. Windows Server Setup
```bash
# Install and configure mkcert certificates
npm run setup:ssl

# Start HTTPS server  
npm run start:sse

# Server available at:
# - Local: https://localhost:3444
# - Network: https://192.168.0.171:3444
```

### 2. Mac Client Setup
```bash
# Copy CA certificate and install
bash scripts/setup-ssl-mac.sh 192.168.0.171

# Test connection
curl https://192.168.0.171:3444/health
```

### 3. Android Device Setup
```bash
# Share certificate with Android
npm run share:certs

# Follow Android installation guide
# See: ANDROID_SETUP.md
```

## Detailed Setup Instructions

### Windows Server (Host Machine)

#### Prerequisites
- Windows 10/11
- Node.js 20+
- Chocolatey (recommended) or manual mkcert installation

#### Step 1: Install mkcert
```bash
# Via Chocolatey (recommended)
choco install mkcert

# Or download from: https://github.com/FiloSottile/mkcert/releases
```

#### Step 2: Generate Certificates
```bash
# Run setup script (handles everything automatically)
npm run setup:ssl

# Or manually:
scripts\setup-ssl-windows.bat
```

**What this does:**
- Auto-detects your local IP address
- Installs mkcert local Certificate Authority
- Generates certificates for `localhost`, `127.0.0.1`, and your IP
- Creates `mkcert-ca-cert.pem` for sharing with other platforms
- Updates SSE server to use mkcert certificates automatically

#### Step 3: Start HTTPS Server
```bash
# Start with mkcert certificate support
npm run start:sse

# Server automatically detects and uses mkcert certificates
# Logs show both localhost and network URLs
```

### Mac Client Setup

#### Prerequisites
- macOS 10.12+
- Homebrew
- Network access to Windows server

#### Step 1: Transfer CA Certificate
```bash
# Option A: Copy via network
scp user@192.168.0.171:path/to/mcp-coordination-system/certs/mkcert-ca-cert.pem ./

# Option B: Use certificate sharing utility on Windows
# Run: npm run share:certs
# Download from: http://192.168.0.171:8000/mkcert-ca-cert.pem
```

#### Step 2: Install Certificate  
```bash
# Run Mac setup script
bash setup-ssl-mac.sh 192.168.0.171

# This script:
# - Installs mkcert via Homebrew
# - Copies CA certificate to mkcert directory  
# - Installs CA in system trust store
# - Tests connection to Windows server
```

#### Step 3: Verify Connection
```bash
# Test HTTPS connection
curl https://192.168.0.171:3444/health

# Should return JSON without certificate errors
# Create test script for easy validation
bash test-windows-connection.sh
```

### Android Device Setup

#### Prerequisites
- Android 4.0+ (API level 14+)
- Network access to Windows server
- File manager or browser for certificate installation

#### Step 1: Transfer CA Certificate

**Option A: HTTP Download**
```bash
# On Windows, start file server
npm run share:certs
# Select option 1: HTTP server

# On Android browser:
# Navigate to: http://192.168.0.171:8000/mkcert-ca-cert.pem
# Download the certificate file
```

**Option B: Manual Transfer**
- Copy `certs/mkcert-ca-cert.pem` from Windows to Android
- Via USB, email, cloud storage, or network share

#### Step 2: Install Certificate
1. Open **Settings** → **Security** → **Encryption & credentials**
2. Tap **Install a certificate** → **CA certificate**
3. Browse and select `mkcert-ca-cert.pem`
4. Enter certificate name (e.g., "MCP Server CA")
5. Tap **OK** to install

#### Step 3: Test Connection
- Open browser on Android
- Navigate to: `https://192.168.0.171:3444/health`
- Should show JSON response without certificate warnings

For detailed Android instructions, see: [ANDROID_SETUP.md](ANDROID_SETUP.md)

## Network Configuration

### Firewall Rules
Ensure Windows firewall allows inbound connections on port 3444:

```bash
# Windows Firewall rule
netsh advfirewall firewall add rule name="MCP Server" dir=in action=allow protocol=TCP localport=3444

# Or use Windows Defender Firewall GUI
# Inbound Rules → New Rule → Port → TCP 3444 → Allow
```

### Router Configuration
For cross-subnet access, ensure routing between network segments:

```bash
# Test connectivity from Mac/Android to Windows IP
ping 192.168.0.171
telnet 192.168.0.171 3444
```

### Multiple Network Interfaces
If Windows has multiple IP addresses, generate certificates for all:

```bash
# During setup, certificates include all detected IPs
# Manual generation for specific IPs:
cd certs
mkcert localhost 127.0.0.1 192.168.0.171 192.168.1.100 10.0.0.50
```

## Testing & Validation

### Automated Test Suite
```bash
# Run comprehensive test suite
npm run test:cross-platform

# Tests include:
# - mkcert installation
# - Certificate validity
# - Network configuration
# - Port availability  
# - Cross-platform script availability
# - Dependencies check
```

### Manual Validation

#### Windows Local Test
```bash
curl -k https://localhost:3444/health
# Should work without certificate warnings
```

#### Network Clients Test  
```bash
# From Mac/Android/other devices
curl https://192.168.0.171:3444/health

# Expected response:
{
  "status": "healthy",
  "timestamp": "2025-09-03T...",
  "server": "SSE MCP Coordination System",
  "version": "1.0.0"
}
```

#### Certificate Chain Validation
```bash
# Verify certificate details
openssl x509 -in certs/localhost.pem -noout -text
openssl x509 -in certs/localhost.pem -noout -dates
openssl verify -CAfile certs/mkcert-ca-cert.pem certs/localhost.pem
```

## Troubleshooting

### Common Issues

#### "Certificate not trusted" errors
- **Windows**: Ensure `mkcert -install` was run successfully
- **Mac**: Verify CA certificate copied to `$(mkcert -CAROOT)/rootCA.pem`  
- **Android**: Check certificate installed in User credentials (not Device)

#### Connection refused
- Verify Windows server is running: `netstat -an | findstr :3444`
- Check firewall rules allow port 3444
- Test basic connectivity: `ping 192.168.0.171`

#### Wrong IP address in certificates
- Re-run `setup-ssl-windows.bat` to detect current IP
- Or manually specify: `mkcert localhost 127.0.0.1 [YOUR_IP]`

#### mkcert not found
```bash
# Windows
choco install mkcert

# Mac  
brew install mkcert

# Verify installation
mkcert -version
```

### Debug Information

#### Certificate Inspection
```bash
# View certificate details
openssl x509 -in certs/localhost.pem -noout -text

# Check Subject Alternative Names
openssl x509 -in certs/localhost.pem -noout -text | grep -A5 "Subject Alternative Name"

# View certificate dates
openssl x509 -in certs/localhost.pem -noout -dates
```

#### Network Diagnostics
```bash
# Windows network interfaces
ipconfig /all

# Test port connectivity
telnet 192.168.0.171 3444
nc -zv 192.168.0.171 3444

# Firewall status
netsh firewall show opmode
```

#### Server Logs
The SSE server provides detailed logging:
```bash
npm run start:sse

# Look for:
# - "mkcert certificates found"
# - "Local network IP: X.X.X.X"  
# - "Cross-platform access ready"
```

## Security Considerations

### Development vs Production

**Development Use (Current Setup)**
- mkcert certificates are for local development only
- CA is installed locally on each device
- Perfect for testing and development workflows

**Production Deployment**
- Use certificates from trusted public CA (Let's Encrypt, etc.)
- Configure proper DNS with domain names
- Implement certificate rotation and monitoring

### Network Security
- Ensure network traffic is on trusted networks
- Consider VPN for remote access scenarios
- Monitor certificate expiration (mkcert certs last 2+ years)

### Certificate Management
```bash
# View installed CA certificates
# Windows: certlm.msc → Trusted Root Certification Authorities
# Mac: Keychain Access → System → Certificates  
# Android: Settings → Security → Trusted credentials → User

# Remove mkcert CA when no longer needed
mkcert -uninstall
```

## Advanced Configuration

### Corporate Networks
```bash
# Proxy considerations
export HTTP_PROXY=http://proxy.company.com:8080
export HTTPS_PROXY=http://proxy.company.com:8080

# Certificate bundle for corporate CAs
export NODE_EXTRA_CA_CERTS=/path/to/corporate-ca-bundle.pem
```

### Load Balancer Integration
For production deployment behind load balancers:

```json
// nginx configuration
{
  "upstream": "backend",
  "servers": ["192.168.0.171:3444"],
  "ssl_certificate": "/etc/ssl/production-cert.pem",
  "ssl_certificate_key": "/etc/ssl/production-key.pem"
}
```

### Monitoring & Logging
```bash
# Certificate expiration monitoring
openssl x509 -in certs/localhost.pem -noout -dates
# Expires: Dec  3 10:30:00 2026 GMT

# Access logging  
tail -f logs/mcp-server.log | grep "HTTPS\|SSL\|TLS"
```

## Scripts Reference

| Script | Purpose | Usage |
|--------|---------|-------|
| `setup-ssl-windows.bat` | Generate mkcert certificates | `npm run setup:ssl` |
| `setup-ssl-mac.sh` | Install CA on Mac | `bash setup-ssl-mac.sh IP` |
| `share-certificates.bat` | Transfer certs to other devices | `npm run share:certs` |
| `test-cross-platform-ssl.bat` | Validate entire setup | `npm run test:cross-platform` |

## Package.json Integration

```json
{
  "scripts": {
    "setup:ssl": "scripts\\setup-ssl-windows.bat",
    "share:certs": "scripts\\share-certificates.bat", 
    "test:cross-platform": "scripts\\test-cross-platform-ssl.bat",
    "start:sse": "node src/sse-server.js"
  }
}
```

## Success Criteria Checklist

- [ ] ✅ Windows generates trusted certificates for localhost + IP
- [ ] ✅ Mac can securely connect to Windows server via IP  
- [ ] ✅ Android can install CA and connect without warnings
- [ ] ✅ All platforms access MCP without certificate errors
- [ ] ✅ Automated setup scripts for each platform
- [ ] ✅ Comprehensive testing and validation tools
- [ ] ✅ Cross-platform certificate sharing utilities
- [ ] ✅ Server automatically detects and uses mkcert certificates

## File Structure

```
mcp-coordination-system/
├── scripts/
│   ├── setup-ssl-windows.bat      # Windows mkcert setup
│   ├── setup-ssl-mac.sh           # Mac CA installation  
│   ├── share-certificates.bat     # Certificate sharing utility
│   └── test-cross-platform-ssl.bat # Comprehensive test suite
├── certs/
│   ├── localhost.pem              # Server certificate
│   ├── localhost-key.pem          # Server private key
│   ├── mkcert-ca-cert.pem         # CA cert for clients
│   └── cert-info.txt              # Setup information
├── src/
│   └── sse-server.js              # Updated with mkcert support
├── ANDROID_SETUP.md               # Android installation guide
├── CROSS_PLATFORM_SSL.md          # This document
└── package.json                   # npm scripts integration
```

---

## Summary

This cross-platform mkcert certificate solution provides:

1. **Automated Windows Setup** - One command generates all certificates
2. **Mac Integration** - Script-based CA installation and testing  
3. **Android Support** - Detailed guide for manual certificate installation
4. **Network Compatibility** - Works across different subnets and networks
5. **Testing & Validation** - Comprehensive test suite ensures everything works
6. **Certificate Sharing** - Multiple options for transferring certificates safely

The solution eliminates certificate warnings and enables secure HTTPS connections from any platform to the Windows-hosted MCP coordination system, making cross-platform development seamless and secure.