# External Integrations

**Analysis Date:** 2026-01-28

## APIs & External Services

**Model Context Protocol (MCP):**
- Claude Desktop and Claude Code integration
- SDK: `@modelcontextprotocol/sdk` ^0.6.0
- Transport: Stdio (local), SSE/HTTP (remote)
- Auth: Instance ID based, JWT tokens

**XMPP Messaging (ejabberd):**
- Real-time messaging between AI instances
- Container: `ejabberd/ecs:latest`
- Domain: `smoothcurves.nexus`
- Ports: 5222 (XMPP), 5280 (HTTP API)
- Implementation: `src/v2/messaging.js`

**Claude CLI:**
- Used by `wake_instance` and `continue_conversation`
- Spawns new Claude sessions via command line
- Implementation: `src/v2/wakeInstance.js`, `src/v2/continueConversation.js`

## Data Storage

**Databases:**
- File-based JSON storage (no external database)
- Root: `/mnt/coordinaton_mcp_data/` (configurable via `V2_DATA_ROOT`)
- Instance data: `{DATA_ROOT}/instances/{instanceId}/`
- Project data: `{DATA_ROOT}/projects/{projectId}/`
- Roles: `{DATA_ROOT}/roles/`
- Messages: `data/messages/`

**ejabberd Database:**
- Docker volume: `ejabberd_data`
- Stores XMPP message history and user accounts

**File Storage:**
- Local filesystem only
- Documents per instance/project
- Diary entries per instance
- Wake logs: `{DATA_ROOT}/wake-logs/`

**Caching:**
- In-memory rate limiting map (`src/v2/messaging.js`)
- Session maps in SSE server
- No external cache service

## Authentication & Identity

**Auth Provider:**
- Custom implementation
- Instance-based identity
- JWT tokens for API auth
- Recovery keys for context restoration

**Implementation Files:**
- `src/v2/identity.js` - Context registration and lookup
- `src/v2/authKeys.js` - Recovery key generation
- `src/v2/preApprove.js` - Instance pre-approval

**Key Management:**
- Recovery keys stored hashed: `{DATA_ROOT}/auth-keys/recovery/`
- Role keys: `{DATA_ROOT}/auth-keys/roles/`
- Personality keys: `{DATA_ROOT}/auth-keys/personalities/`

## Git Integration

**GitHub Operations:**
- Clone, push, status for project repos
- Implementation: `src/v2/git-operations.js`
- Runs git as root (has credentials)
- Used by team members working on project code

## Monitoring & Observability

**Error Tracking:**
- Custom Winston logger (`src/logger.js`)
- File logging: `logs/mcp-server.log`, `logs/sse-server.log`
- No external error tracking service

**Logs:**
- Winston for application logging
- journalctl for systemd service logs
- nginx access/error logs: `/var/log/nginx/`

**Health Checks:**
- `/health` endpoint on SSE server
- ejabberd: `ejabberdctl status`

## CI/CD & Deployment

**Hosting:**
- Self-hosted Linux server
- Domain: `smoothcurves.nexus`
- nginx reverse proxy with SSL termination

**Deployment:**
- Manual via scripts (`scripts/deploy-to-production.sh`)
- systemd service: `mcp-coordination.service`
- Backup before deploy (data and code)

**CI Pipeline:**
- None configured
- Manual `npm test` and `npm run lint`

## SSL/TLS Configuration

**Certificates:**
- Let's Encrypt via certbot
- Location: `/etc/letsencrypt/live/smoothcurves.nexus/`
- Auto-renewal via certbot timer

**nginx SSL:**
- TLS 1.2 and 1.3
- Modern cipher suites
- HSTS enabled

## Environment Configuration

**Required env vars (production):**
```bash
NODE_ENV=production
SSE_PORT=3444
SSE_HOST=localhost
SSL_CERT_PATH=/etc/letsencrypt/live/smoothcurves.nexus
SSL_STRICT=true
PRODUCTION_DATA_DIR=/mnt/coordinaton_mcp_data/production-data
```

**Optional env vars:**
```bash
V2_DATA_ROOT=/custom/data/path/
USE_HTTP=true          # Dev only
MCP_MODE=stdio         # For proxy client
```

**Secrets location:**
- No .env files (configured in systemd service)
- XMPP passwords in docker-compose.yml (should be moved to env)
- Git credentials on server (root user)

## Webhooks & Callbacks

**Incoming:**
- None

**Outgoing:**
- None

## Network Architecture

**Production Flow:**
```
Internet
    ↓
nginx (443/80) - SSL termination
    ↓
SSE Server (3444) - localhost only
    ↓
ejabberd (5222/5280) - localhost only
```

**Firewall (UFW):**
- Port 22: SSH
- Port 80: HTTP (redirects to 443)
- Port 443: HTTPS

**Internal Services:**
- MCP/SSE: localhost:3444
- ejabberd XMPP: localhost:5222
- ejabberd HTTP API: localhost:5280

## Docker Services

**ejabberd (`docker/ejabberd/docker-compose.yml`):**
```yaml
services:
  ejabberd:
    image: ejabberd/ecs:latest
    hostname: smoothcurves.nexus
    ports:
      - "127.0.0.1:5222:5222"  # XMPP
      - "127.0.0.1:5280:5280"  # HTTP API
    volumes:
      - ejabberd_data:/home/ejabberd/database
      - ejabberd_logs:/home/ejabberd/logs
```

**Pre-configured Users:**
- admin, lupo, system, genevieve

**Pre-configured Rooms:**
- announcements, executives

## Endpoint Documentation

**OpenAPI Specs:**
- `src/openapi.json` - Core API spec
- `openapi-generated.json` - Full generated spec
- `public/docs/openapi-verbose.json` - Verbose spec

**Endpoint Generation:**
- `src/endpoint_definition_automation/` - Code generators
- Generates MCP tools, OpenAPI specs, help docs

---

*Integration audit: 2026-01-28*
