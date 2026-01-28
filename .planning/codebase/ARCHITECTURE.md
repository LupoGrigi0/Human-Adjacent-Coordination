# Architecture

**Analysis Date:** 2025-01-28

## Pattern Overview

**Overall:** Layered MCP (Model Context Protocol) Server with Multi-Transport Support

**Key Characteristics:**
- Central coordination server (`src/server.js`) routes all API calls through a unified `call()` method
- V2 implementation in `src/v2/` supersedes legacy V1 handlers in `src/handlers/`
- Multiple transport layers (stdio, SSE, Streamable HTTP) share the same core server
- File-based persistence with directory-per-entity pattern
- Role-based access control with token-based authentication for privileged roles

## Layers

**Transport Layer:**
- Purpose: Handle protocol-specific communication (stdio, SSE, HTTP)
- Location: `src/mcp-server.js`, `src/sse-server.js`, `src/streamable-http-server.js`
- Contains: Express servers, MCP SDK integration, SSL handling, session management
- Depends on: Core Server Layer
- Used by: External clients (Claude Desktop, Claude Code, Web UI)

**Core Server Layer:**
- Purpose: Central API routing and orchestration
- Location: `src/server.js`
- Contains: `MCPCoordinationServer` class with `call()` method routing all function calls
- Depends on: V2 Handlers, Legacy Handlers, Logger
- Used by: Transport Layer

**V2 Handler Layer:**
- Purpose: Implementation of all V2 coordination APIs
- Location: `src/v2/`
- Contains: Bootstrap, identity, roles, personalities, tasks, projects, messaging, documents, lists
- Depends on: Data Layer, Config, Permissions
- Used by: Core Server Layer

**Legacy Handler Layer:**
- Purpose: V1 API implementations (some still in use, some deprecated)
- Location: `src/handlers/`
- Contains: messages-v3.js (active), instances.js (active), projects.js, tasks-v2.js
- Depends on: Data Layer, Logger
- Used by: Core Server Layer

**Data Layer:**
- Purpose: File system abstraction for JSON/markdown persistence
- Location: `src/v2/data.js`, `src/v2/config.js`
- Contains: Atomic JSON read/write, directory helpers, entity loading
- Depends on: Node.js fs module
- Used by: V2 Handlers, Legacy Handlers

**UI Layer:**
- Purpose: Web-based dashboard for system administration
- Location: `src/ui/`, `src/v2/ui/`
- Contains: Static HTML/CSS/JS for Executive Dashboard
- Depends on: API Layer (via HTTP calls)
- Used by: Administrators via browser

## Data Flow

**Bootstrap Flow (New Instance):**

1. Client calls `bootstrap({ role, instanceId, personality })`
2. `src/v2/bootstrap.js` generates instanceId if not provided
3. Loads default documents from `data/default/`
4. Loads role documents from `data/roles/{roleId}/`
5. Loads personality documents if specified from `data/personalities/{id}/`
6. Creates instance directory at `/mnt/coordinaton_mcp_data/instances/{instanceId}/`
7. Initializes permissions via `src/v2/permissions.js`
8. Returns welcome payload with protocols, wisdom, and available tools

**API Call Flow:**

1. Transport layer receives request (stdio JSON-RPC, HTTP POST, etc.)
2. Request parsed and passed to `MCPCoordinationServer.call(functionName, params)`
3. Auto-registration: If `instanceId` and `role` in params, instance is registered
4. Heartbeat updated for existing instances
5. Switch statement routes to appropriate handler function
6. Handler reads/writes data via `src/v2/data.js` utilities
7. Response returned up through transport layer

**State Management:**
- Instance state persisted to `data/instances/{instanceId}/preferences.json`
- Project state persisted to `data/projects/{projectId}/project.json`
- Messages routed to instance-specific, project-specific, or global inboxes
- UI state stored per-instance via `src/v2/uiState.js`

## Key Abstractions

**Instance:**
- Purpose: Represents a running AI instance in the coordination system
- Examples: `src/v2/instances.js`, `src/v2/bootstrap.js`, `src/v2/identity.js`
- Pattern: Directory-per-instance at `/mnt/coordinaton_mcp_data/instances/{id}/`
- Contains: `preferences.json`, `diary.md`, recovery keys

**Role:**
- Purpose: Defines capabilities and permissions (COO, PM, Developer, etc.)
- Examples: `src/v2/roles.js`, `src/v2/takeOnRole.js`
- Pattern: Directory-per-role at `/mnt/coordinaton_mcp_data/roles/{roleId}/`
- Contains: `role.json`, `SUMMARY.md`, `wisdom/` subdirectory with markdown docs

**Personality:**
- Purpose: Optional AI personality overlay with custom documents
- Examples: `src/v2/personalities.js`, `src/v2/adoptPersonality.js`
- Pattern: Directory-per-personality at `/mnt/coordinaton_mcp_data/personalities/{id}/`
- Contains: `personality.json`, markdown documents

**Project:**
- Purpose: Container for tasks, documents, and team coordination
- Examples: `src/v2/projects.js`, `src/v2/task-management.js`
- Pattern: Directory-per-project at `/mnt/coordinaton_mcp_data/projects/{id}/`
- Contains: `project.json` or `preferences.json`, `tasks.json`, documents

## Entry Points

**MCP Stdio (Claude Desktop):**
- Location: `src/mcp-server.js`
- Triggers: `node src/mcp-server.js` or via Claude Desktop MCP config
- Responsibilities: JSON-RPC over stdio, implements `@modelcontextprotocol/sdk`

**Streamable HTTP (Production):**
- Location: `src/streamable-http-server.js`
- Triggers: `node src/streamable-http-server.js` or systemd service
- Responsibilities: HTTPS server with session management, serves UI static files

**SSE Server (Legacy/Development):**
- Location: `src/sse-server.js`
- Triggers: `node src/sse-server.js`
- Responsibilities: SSE-based transport (deprecated in favor of Streamable HTTP)

**Core Server (Direct/Testing):**
- Location: `src/server.js`
- Triggers: `node src/server.js` or imported by transport layers
- Responsibilities: API routing via `server.call()`, can be used directly for testing

## Error Handling

**Strategy:** Return structured error objects, never throw across API boundaries

**Patterns:**
- All handlers return `{ success: true, ... }` or `{ success: false, error: { message, code } }`
- Transport layers wrap errors in protocol-appropriate format
- Logger writes to file in stdio mode to avoid JSON-RPC pollution
- Missing files return `null` (not errors) - callers check for null

## Cross-Cutting Concerns

**Logging:**
- `src/logger.js` provides file-based logging
- Stdio mode writes only to file (no stdout/stderr pollution)
- Factory function `createLogger(filename)` for transport-specific logs

**Validation:**
- Input validation in each handler
- Joi schema validation (available but not universally applied)
- Security limits in `src/v2/messaging.js` (rate limiting, input sanitization)

**Authentication:**
- Token-based for privileged roles (Executive, PA, COO, PM)
- Tokens stored in environment variables
- `src/v2/permissions.js` manages role-based access control
- Recovery keys for identity resurrection via `src/v2/authKeys.js`

---

*Architecture analysis: 2025-01-28*
