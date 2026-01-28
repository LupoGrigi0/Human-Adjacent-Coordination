# Codebase Structure

**Analysis Date:** 2025-01-28

## Directory Layout

```
/mnt/coordinaton_mcp_data/worktrees/containerize/
├── src/                          # Source code (Node.js ES modules)
│   ├── v2/                       # V2 API implementations (current)
│   │   ├── ui/                   # V2 UI static files
│   │   ├── scripts/              # Wake scripts for spawning instances
│   │   └── tools/                # Empty (reserved for future tools)
│   ├── handlers/                 # Legacy V1 handlers (some still active)
│   ├── ui/                       # Primary UI static files
│   ├── endpoint_definition_automation/  # API doc generation tools
│   │   └── generators/           # Individual generator scripts
│   ├── HACS/                     # HACS client library (in development)
│   └── *.js                      # Core server files
├── data/                         # Development data directory
│   ├── roles/                    # Role definitions (COO, PM, Developer, etc.)
│   ├── projects/                 # Project directories
│   ├── messages/                 # Message storage (inbox, archive, instances)
│   ├── lessons/                  # Extracted lessons storage
│   └── archive/                  # Archived development data
├── config/                       # Configuration files
│   ├── nginx/                    # Nginx config templates
│   ├── systemd/                  # Systemd service files
│   ├── ssl/                      # SSL configuration
│   └── scripts/                  # Config-related scripts
├── docker/                       # Docker configurations
│   └── ejabberd/                 # XMPP server config
├── certs/                        # SSL certificates (dev/local)
├── tests/                        # Test files
│   ├── V1/                       # V1 API tests
│   ├── V2/                       # V2 API tests
│   └── TestManagerSuccessor/     # Test management system
├── docs/                         # Documentation
├── scripts/                      # Deployment and utility scripts
├── public/                       # Public static assets
├── Crossing/                     # AI instance diary/notes (Crossing personality)
├── HumanAdjacentAI-Protocol/     # Protocol documentation and personalities
│   ├── Personalities/            # AI personality definitions
│   ├── HandoffArchive/           # Session handoff records
│   └── SpecialistBriefs/         # Specialist briefing documents
└── .planning/                    # GSD planning documents
    └── codebase/                 # Codebase analysis (this directory)
```

## Directory Purposes

**src/**
- Purpose: All server-side JavaScript source code
- Contains: Server entry points, handlers, utilities
- Key files: `server.js`, `mcp-server.js`, `sse-server.js`, `streamable-http-server.js`

**src/v2/**
- Purpose: V2 API implementations (current active code)
- Contains: All V2 handlers organized by domain (identity, tasks, projects, etc.)
- Key files: `bootstrap.js`, `config.js`, `data.js`, `task-management.js`, `messaging.js`

**src/handlers/**
- Purpose: Legacy V1 handlers (some still active, some deprecated)
- Contains: messages-v3.js (active), instances.js (active), others mostly legacy
- Key files: `messages-v3.js`, `instances.js`

**src/ui/ and src/v2/ui/**
- Purpose: Static files for Executive Dashboard web interface
- Contains: HTML, CSS, JavaScript for browser-based admin UI
- Key files: `index.html`, `app.js`, `api.js`, `styles.css`

**data/**
- Purpose: Development/local data storage
- Contains: Instance data, project data, messages, roles
- Key files: `instances.json`, roles subdirectories

**config/**
- Purpose: Server and deployment configuration
- Contains: Nginx configs, systemd services, SSL configs
- Key files: `environment.md`, nginx templates

**HumanAdjacentAI-Protocol/**
- Purpose: AI collaboration protocol documentation
- Contains: Personality definitions, handoff archives, protocol docs
- Key files: `PROTOCOLS.md`, `AGENTS.md`, `CLAUDE.md`

## Key File Locations

**Entry Points:**
- `src/server.js`: Core MCP server class with call() routing
- `src/mcp-server.js`: MCP stdio transport (Claude Desktop)
- `src/sse-server.js`: SSE transport (legacy)
- `src/streamable-http-server.js`: HTTP transport (production)

**Configuration:**
- `src/v2/config.js`: Path configuration for data directories
- `package.json`: Dependencies and npm scripts
- `jest.config.js`: Test configuration

**Core Logic:**
- `src/v2/bootstrap.js`: Instance initialization and resurrection
- `src/v2/task-management.js`: Task CRUD operations
- `src/v2/messaging.js`: XMPP messaging integration
- `src/v2/identity.js`: Instance identity and recovery
- `src/v2/data.js`: File system utilities

**Testing:**
- `tests/V1/bootstrap.test.js`: Bootstrap API tests
- `tests/V1/messages-v2.test.js`: Message system tests

## Naming Conventions

**Files:**
- `kebab-case.js`: Handler and utility files (e.g., `task-management.js`)
- `camelCase.js`: Some utility files (e.g., `joinProject.js`, `takeOnRole.js`)
- `*.test.js`: Test files adjacent to feature name

**Directories:**
- `lowercase`: Standard directories (src, data, config)
- `PascalCase`: Protocol directories (Crossing, HumanAdjacentAI-Protocol)
- `kebab-case`: Multi-word directories (endpoint_definition_automation uses underscore)

**API Functions:**
- `snake_case`: MCP tool names (e.g., `create_task`, `get_project`)
- `camelCase`: Internal JavaScript functions (e.g., `createTask`, `getProject`)

## Where to Add New Code

**New V2 API Handler:**
- Primary code: `src/v2/{feature-name}.js`
- Add import to `src/server.js`
- Add case to switch statement in `server.call()`
- Tests: `tests/V2/{feature-name}.test.js`

**New UI Feature:**
- Implementation: `src/ui/{feature}.js` or `src/v2/ui/{feature}.js`
- Styles: Append to `src/ui/styles.css`

**New Data Entity:**
- Create directory structure in data path (via config.js getters)
- Add path getter to `src/v2/config.js`
- Add CRUD helpers to handler file

**Utilities:**
- Shared helpers: `src/v2/data.js` for file operations
- Logging: Use existing `src/logger.js`

## Special Directories

**data/ (Development Data):**
- Purpose: Local development data storage
- Generated: Partially (instances created at runtime)
- Committed: No (except roles/, which has role definitions)
- Note: Production uses `/mnt/coordinaton_mcp_data/` directly

**/mnt/coordinaton_mcp_data/ (Production Data):**
- Purpose: Production data storage (external to repo)
- Generated: At runtime by API calls
- Committed: No
- Contains: instances/, projects/, personalities/, roles/, permissions/

**node_modules/**
- Purpose: npm dependencies
- Generated: Yes (`npm install`)
- Committed: No

**logs/**
- Purpose: Server log files
- Generated: Yes (at runtime)
- Committed: No

**certs/**
- Purpose: SSL certificates for local development
- Generated: Via mkcert or OpenSSL
- Committed: Some template files only

**.planning/**
- Purpose: GSD planning and codebase analysis documents
- Generated: By GSD mapping commands
- Committed: Yes

---

*Structure analysis: 2025-01-28*
