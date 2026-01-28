# Technology Stack

**Analysis Date:** 2026-01-28

## Languages

**Primary:**
- JavaScript (ES Modules) - All server and client code

**Secondary:**
- Bash - Deployment scripts, wake scripts (`scripts/`, `src/v2/scripts/`)
- YAML - ejabberd configuration (`docker/ejabberd/`)

## Runtime

**Environment:**
- Node.js >= 20.0.0 (required in `package.json` engines)

**Package Manager:**
- npm (with package-lock.json)
- Lockfile: present

## Frameworks

**Core:**
- Express.js ^4.19.2 - HTTP/HTTPS server framework
- @modelcontextprotocol/sdk ^0.6.0 - Official MCP protocol implementation

**Testing:**
- Jest ^29.7.0 - Test runner and assertion library
- Supertest ^6.3.3 - HTTP testing

**Build/Dev:**
- ESLint ^8.56.0 - Linting (airbnb-base config)
- Prettier ^3.1.1 - Code formatting
- Node.js --watch mode - Development hot reload

## Key Dependencies

**Critical:**
- `@modelcontextprotocol/sdk` ^0.6.0 - Core protocol for AI coordination
- `express` ^4.19.2 - All HTTP endpoints
- `winston` ^3.11.0 - Structured logging

**Security:**
- `helmet` ^7.1.0 - Security headers
- `cors` ^2.8.5 - Cross-origin requests
- `express-rate-limit` ^7.1.5 - Request rate limiting
- `jsonwebtoken` ^9.0.2 - JWT authentication

**Utilities:**
- `uuid` ^9.0.1 - UUID generation
- `joi` ^17.11.0 - Input validation

**Dev Dependencies:**
- `@jest/globals` ^30.0.5 - Jest type definitions
- `@types/node` ^20.10.0 - Node.js types
- `eslint-config-airbnb-base` ^15.0.0 - ESLint rules
- `eslint-plugin-import` ^2.29.1 - Import linting

## Configuration

**Environment Variables:**
```bash
NODE_ENV=production|development
SSE_PORT=3444                    # Server port
SSE_HOST=localhost               # Bind address
SSL_CERT_PATH=/etc/letsencrypt/live/smoothcurves.nexus
SSL_STRICT=true                  # Force strict SSL
USE_HTTP=true                    # HTTP fallback (dev only)
MCP_MODE=stdio                   # For proxy client
V2_DATA_ROOT=/mnt/coordinaton_mcp_data/  # Data directory override
PRODUCTION_DATA_DIR=/mnt/coordinaton_mcp_data/production-data
```

**Key Config Files:**
- `package.json` - Dependencies and scripts
- `jest.config.js` - Test configuration
- `config/nginx/smoothcurves-nexus` - nginx reverse proxy
- `config/environment.md` - Environment documentation
- `docker/ejabberd/docker-compose.yml` - XMPP server
- `docker/ejabberd/ejabberd.yml` - XMPP configuration

## Server Modes

**MCP Server (`src/mcp-server.js`):**
- Stdio transport for Claude Desktop integration
- JSON-RPC 2.0 protocol

**SSE Server (`src/sse-server.js`):**
- HTTP/HTTPS with Server-Sent Events
- Used for web clients and remote AI instances

**Proxy Client (`src/mcp-proxy-client.js`):**
- Bridges local stdio to remote SSE server
- Claude Code integration

## Platform Requirements

**Development:**
- Node.js 20.x+
- npm
- Git
- Optional: Docker (for ejabberd)

**Production:**
- Ubuntu 20.04+ Linux
- Node.js 20.x+
- nginx (reverse proxy)
- systemd (service management)
- Let's Encrypt (SSL certificates)
- Docker (for ejabberd XMPP)
- snapd (for certbot)

**System Packages:**
```bash
curl wget git nginx ufw htop tree jq unzip tar build-essential
```

## npm Scripts

**Start:**
```bash
npm start              # node src/server.js
npm run start:server   # node start-server.js
npm run start:https    # node src/https-server.js
npm run start:sse      # node src/sse-server.js
npm run start:mcp      # node src/mcp-server.js
npm run start:proxy    # node mcp-proxy-client.js
npm run start:dev      # node --watch start-server.js
```

**Test:**
```bash
npm test               # Jest with experimental VM modules
npm run test:watch     # Jest watch mode
npm run test:coverage  # Jest with coverage
```

**Quality:**
```bash
npm run lint           # ESLint check
npm run lint:fix       # ESLint auto-fix
npm run format         # Prettier formatting
```

---

*Stack analysis: 2026-01-28*
