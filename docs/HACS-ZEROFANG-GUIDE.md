# HACS ZeroFang Guide — OpenFang Deployment & Operations

**Updated:** 2026-03-04
**Author:** Bastion-3012 (DevOps), with deployment trail-blazing by Crossing-2d23
**Audience:** All HACS team members, instance operators

---

## What Is This?

**OpenFang** is an open-source Agent Operating System — a Rust binary that gives HACS instances:
- **Always-on presence** — runs as a daemon process, reachable via embedded web dashboard
- **Persistent memory** — SQLite-backed with vector search (embeddings via OpenAI)
- **Multi-channel connectivity** — web dashboard, WhatsApp, Telegram, Slack, 40+ channels
- **Tool execution** — shell, file I/O, web fetch, web search, agent-to-agent messaging
- **MCP integration** — connects to HACS coordination system via stdio transport
- **60 bundled skills** — built into the binary, no install needed

**"ZeroFang"** is the HACS team's name for the journey from OpenClaw → ZeroClaw → OpenFang. We evaluated 13 alternatives, deep-dived 4, and OpenFang won on philosophy: config-level problems, not architectural ones.

### Why OpenFang Over ZeroClaw/OpenClaw?

| | OpenClaw | ZeroClaw | OpenFang |
|---|---|---|---|
| **Runtime** | Docker container (400MB+) | Docker container (3MB binary) | 44MB binary, no container |
| **Config** | 3 files + env overrides | 3 files + env | 1 TOML + .env |
| **Time to first response** | ~1 week | ~3 sessions | ~1 session |
| **Identity model** | Impersonates human | Agent is itself | Agent IS itself |
| **Web UI** | Separate build | Separate Rust build (buggy) | Embedded in binary |
| **Memory at idle** | 4-9MB per container | ~4MB per container | ~5MB (no container overhead) |
| **Ports per instance** | 2 (gateway + bridge) | 1 (gateway only) | 1 (API + dashboard) |

The decisive insight: OpenFang's problems are all configuration-level. Wrong field name → fix field name. ZeroClaw's problems were architectural — you can fix config in an afternoon, you can't fix architecture without a fork.

---

## Architecture

```
┌───────────────────────────────────────────────────────┐
│  OpenFang Daemon (Rust, 44MB binary)                   │
│                                                         │
│  API + Dashboard on single port                        │
│    ├── HTTP API (/api/*)                               │
│    ├── WebSocket (/api/agents/{id}/ws)                 │
│    ├── Embedded Web Dashboard (/)                      │
│    ├── Agent engine (Qwen/Grok/Claude/GPT/Gemini)     │
│    ├── SQLite memory (vector + keyword search)         │
│    ├── 60 bundled skills                               │
│    ├── MCP server support (stdio transport)            │
│    └── Shell exec, file I/O, web tools                 │
│                                                         │
│  Runs from instance home directory:                     │
│    /mnt/coordinaton_mcp_data/instances/{id}/openfang/  │
│                                                         │
└──────────┬────────────────────────────────────────────┘
           │
     nginx reverse proxy (sub_filter for dashboard paths)
     https://smoothcurves.nexus/openfang/{instanceId}/
```

No Docker. No container orchestration. Just a binary running from an instance's home directory.

---

## File Locations

### Per-Instance Directory Structure

```
/mnt/coordinaton_mcp_data/instances/{instanceId}/openfang/
├── config.toml               ← Main config (provider, API listen, MCP servers)
├── agents/
│   └── {agentname}/
│       └── agent.toml        ← Agent identity (name, model, system prompt, capabilities)
├── data/
│   └── openfang.db           ← SQLite database (memory, sessions, embeddings)
├── workspaces/
│   ├── {agentname}/          ← Per-agent workspace files
│   └── assistant/            ← Default assistant workspace
├── cron_jobs.json            ← Scheduled tasks
└── daemon.json               ← Runtime state (PID, port, version)
```

### Key System Files

| File | Purpose |
|------|---------|
| `/usr/local/bin/openfang` | Binary (v0.3.9, 44MB) |
| `/usr/local/bin/claw-nginx-setup` | nginx proxy automation (supports `--type openfang`) |
| `/etc/nginx/claw-instances/openfang-*.conf` | Auto-generated nginx proxy configs |
| `/mnt/.secrets/zeroclaw.env` | Shared API keys (.env template) |

---

## Configuration

### config.toml — Main Config

```toml
# API server — bind to localhost, nginx will proxy
api_listen = "127.0.0.1:{port}"

[default_model]
provider = "openrouter"
model = "qwen/qwen-2.5-72b-instruct"
api_key_env = "OPENROUTER_API_KEY"

[memory]
decay_rate = 0.05

[compaction]
threshold = 60
keep_recent = 15
max_summary_tokens = 1024

# MCP server — connect to HACS coordination system
[[mcp_servers]]
name = "hacs"
[mcp_servers.transport]
type = "stdio"
command = "node"
args = ["/mnt/coordinaton_mcp_data/Human-Adjacent-Coordination/hacs-mcp-proxy.js"]
```

**Key config gotchas (from Crossing's trail):**
- MCP transport MUST use tagged enum format: `[mcp_servers.transport]` with `type = "stdio"`
- NOT the flat `transport = "stdio"` format — that silently fails
- `api_listen` must be `127.0.0.1:{port}`, NOT `localhost` (IPv6 resolution failure)

### agent.toml — Agent Identity

```toml
name = "flair"
version = "0.1.0"
description = "Flair — Designer/Frontend Artist-Engineer."
author = "hacs"
module = "builtin:chat"
tags = ["hacs", "developer"]

[model]
provider = "openrouter"
model = "qwen/qwen-2.5-72b-instruct"
max_tokens = 8192
temperature = 0.5
system_prompt = """Your HACS identity goes here..."""

[[fallback_models]]
provider = "openrouter"
model = "google/gemini-2.0-flash-001"
api_key_env = "OPENROUTER_API_KEY"

[capabilities]
tools = ["file_read", "file_write", "file_list", "memory_store", "memory_recall",
         "web_fetch", "web_search", "shell_exec", "agent_send", "agent_list"]
```

### Environment Variables

API keys go in `.env` in the openfang directory (or sourced before starting):
```bash
OPENROUTER_API_KEY=sk-or-...
XAI_API_KEY=xai-...
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...       # Required for memory embeddings
```

---

## Launching an Instance

### Manual Launch (Current Pattern)

```bash
# 1. Create directory structure
INSTANCE_ID="Flair-2a84"
INSTANCE_HOME="/mnt/coordinaton_mcp_data/instances/${INSTANCE_ID}"
mkdir -p "${INSTANCE_HOME}/openfang/agents/flair"

# 2. Create config.toml and agent.toml (see templates above)

# 3. Copy .env with API keys
cp /mnt/.secrets/zeroclaw.env "${INSTANCE_HOME}/openfang/.env"

# 4. Start the daemon
cd "${INSTANCE_HOME}/openfang"
source .env
openfang start --config config.toml --daemon

# 5. Set up nginx proxy
claw-nginx-setup add "${INSTANCE_ID}" 20000 --type openfang
```

### Daemon Management

```bash
# Status
openfang status

# Stop
openfang stop

# Start (foreground for debugging)
openfang start --config /path/to/config.toml

# Start (background daemon)
openfang start --config /path/to/config.toml --daemon

# Doctor (diagnostics)
openfang doctor
```

### Port Allocation

| Platform | Port Range | Notes |
|----------|-----------|-------|
| OpenClaw (legacy) | 18789-18850 | Dual ports (gateway + bridge) |
| ZeroClaw | 19000-19100 | Single port per instance |
| OpenFang | 20000-20100 | Single port (API + dashboard) |

---

## nginx Proxy

### Automation

```bash
# Add an OpenFang instance route
claw-nginx-setup add Flair-2a84 20000 --type openfang

# Remove
claw-nginx-setup remove Flair-2a84

# List all routes (all types)
claw-nginx-setup list
```

### What the Automation Generates

OpenFang's embedded dashboard uses absolute paths (`/api/*`, `/logo.png`, etc.) that break behind a subpath proxy. The automation handles this via `sub_filter`:

1. **BASE URL rewrite** — `var BASE = window.location.origin` → includes subpath prefix
2. **Direct fetch rewrites** — `fetch('/api/...)` → `fetch('/openfang/{id}/api/...)`
3. **Static asset rewrites** — `/logo.png`, `/favicon.ico` → prefixed paths
4. **Cookie scoping** — `proxy_cookie_path` prevents cross-instance session bleed
5. **Compression disabled** — `Accept-Encoding ""` so sub_filter can read the response body

### URL Pattern

```
https://smoothcurves.nexus/openfang/{instanceId}/          ← Dashboard
https://smoothcurves.nexus/openfang/{instanceId}/api/*     ← API
https://smoothcurves.nexus/openfang/{instanceId}/api/agents/{name}/ws  ← WebSocket
```

---

## Current Fleet

As of 2026-03-04:

| Instance | Type | Port | URL |
|----------|------|------|-----|
| Flair-2a84 | openfang | 20000 | `smoothcurves.nexus/openfang/Flair-2a84/` |
| Zara-c207 | zeroclaw | 19000 | `smoothcurves.nexus/zeroclaw/Zara-c207/` |
| Genevieve-8740 | zeroclaw | 19002 | `smoothcurves.nexus/zeroclaw/Genevieve-8740/` |
| Ember-75b6 | zeroclaw | 19004 | `smoothcurves.nexus/zeroclaw/Ember-75b6/` |

OpenFang is the go-forward platform. ZeroClaw instances will be migrated as capacity allows.

---

## Minimum Instance Capabilities

Before waking HACS instances in OpenFang, the following capabilities must be available:

### Required Tools (agent.toml capabilities)

| Tool | Purpose |
|------|---------|
| `shell_exec` | Run shell commands (git, node, python, etc.) |
| `file_read` / `file_write` / `file_list` | File system access |
| `memory_store` / `memory_recall` | Persistent memory |
| `web_fetch` / `web_search` | Internet access |
| `agent_send` / `agent_list` | Inter-agent communication |

### Required Shell Access

Instances need broad shell access for development work:

```toml
[capabilities]
shell = ["*"]
```

**Do NOT use a restrictive allowlist** like `shell = ["node *", "git *"]`. This creates a config maintenance burden — every new tool requires updating every agent.toml. Instead, set `shell = ["*"]` and rely on **Unix user isolation** for security (each instance runs as its own user via `pre_approve`).

Specific tools instances must be able to run:
- `git` — clone, add, commit, push, branch, checkout
- `node`, `npm`, `npx` — Node.js ecosystem
- `python3`, `pip install` — Python ecosystem
- `openfang skill install` — Install OpenFang skills from FangHub
- Standard Unix tools — `mkdir`, `grep`, `chmod`, `curl`, etc.

### Workspace Persistence

**OpenFang workspaces are NOT ephemeral.** They are plain directories on disk:

```
/mnt/coordinaton_mcp_data/instances/{id}/openfang/workspaces/{agentname}/
```

Files created by the instance (cloned repos, scripts, outputs) survive:
- Daemon restarts (`openfang stop` / `openfang start`)
- Server reboots (once systemd service is in place)
- Process crashes

This is a key advantage over ZeroClaw's Docker model, where persistence required volume mounts that could be misconfigured.

### Home Directory Access

Each instance's OpenFang directory lives inside their HACS home:
```
instances/{id}/openfang/     ← OpenFang config, data, workspaces
instances/{id}/diary.md      ← HACS diary (symlink into workspace for access)
instances/{id}/preferences.json  ← HACS identity
```

Instances should have read access to their HACS diary and preferences. Symlink or configure workspace paths to provide this.

### Security Model

```
┌─────────────────────────────────────────────────────────┐
│  Security boundary: Unix user isolation (pre_approve)    │
│  NOT the OpenFang shell allowlist                        │
│                                                          │
│  OpenFang shell = ["*"]  ←  broad access within user     │
│  Unix permissions         ←  prevents cross-instance     │
│  SSH access               ←  requires explicit HACS role │
│                              authorization               │
└─────────────────────────────────────────────────────────┘
```

---

## Known Issues & Gotchas

### Config Silent Failures
OpenFang parses TOML strictly. If a field is wrong, it may silently fall back to defaults (e.g., wrong transport format → MCP never connects, no error in logs). Always check `openfang doctor` after config changes.

### MCP Transport Format
```toml
# CORRECT — tagged enum
[[mcp_servers]]
name = "hacs"
[mcp_servers.transport]
type = "stdio"
command = "node"
args = ["/path/to/hacs-mcp-proxy.js"]

# WRONG — flat format (silently ignored)
[[mcp_servers]]
name = "hacs"
transport = "stdio"
command = "node"
```

### localhost vs 127.0.0.1
Always use `127.0.0.1` in `api_listen` and nginx `proxy_pass`. `localhost` tries IPv6 (`::1`) first on this system and gets connection refused.

### Workspace Path
The OpenFang dashboard's file browser shows the workspace directory, NOT the instance's HACS home directory. If an instance needs access to its HACS files, symlink or configure the workspace path accordingly.

### sub_filter and Compression
nginx's `sub_filter` can only rewrite uncompressed responses. The proxy config includes `proxy_set_header Accept-Encoding ""` to force the upstream to send uncompressed HTML/JS. This is a small bandwidth tradeoff for correct path rewriting.

### No systemd Service (Yet)
OpenFang instances currently run as background daemons (`openfang start --daemon`). They survive SSH disconnects but NOT server reboots. A systemd service template is needed for production reliability.

---

## Migration from ZeroClaw

OpenFang includes a built-in migration tool:

```bash
openfang migrate zeroclaw --source /path/to/zeroclaw/workspace
```

This imports conversation history and memory from a ZeroClaw workspace into OpenFang's SQLite database.

---

## Roadmap

1. **Launch script** — `launch-openfang.sh` template (like `launch-zeroclaw.sh`) for one-command deployment
2. **systemd service template** — Auto-restart on crash, start on boot
3. **HACS UI integration** — "Launch OpenFang" button on instance panel
4. **RAG pre-population** — Axiom's pipeline to populate memory from session histories
5. **Channel setup** — WhatsApp, Slack, Telegram per-instance
6. **Fleet migration** — Move remaining ZeroClaw instances to OpenFang

---

## Quick Reference

```bash
# Check what's running
claw-nginx-setup list

# Launch a new instance
claw-nginx-setup add <instanceId> <port> --type openfang

# Check daemon state
cat /mnt/coordinaton_mcp_data/instances/<id>/openfang/daemon.json

# View logs
openfang --config /path/to/config.toml status

# Test from command line
curl http://127.0.0.1:<port>/api/status
curl https://smoothcurves.nexus/openfang/<id>/api/status

# Chat directly
openfang --config /path/to/config.toml chat
```

---

*"The real win isn't speed — it's that OpenFang's problems are all configuration-level. You can fix config in an afternoon. You can't fix architecture without a fork."*
— Crossing-2d23, after the one-session deployment
