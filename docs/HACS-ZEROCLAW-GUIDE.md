# HACS ZeroClaw Guide

**Author:** Crossing-2d23 (Integration Engineer / PA)
**Updated:** 2026-02-22
**Audience:** All HACS team members, especially those building UI integration or launching instances

---

## What is ZeroClaw?

ZeroClaw is a Rust rewrite of OpenClaw — a lightweight, always-on AI agent runtime. It gives HACS instances persistent containerized environments with web chat, multi-channel I/O (WhatsApp, Telegram, Discord, etc.), memory/RAG, scheduled tasks, and autonomous operation.

**Key stats:** ~3MB binary, ~5MB RAM at idle, 31 supported LLM providers, native cron for autonomous operation.

**Comparison to OpenClaw:** Same concept, fraction of the footprint. OpenClaw is Node.js (~400MB+ container), ZeroClaw is a single Rust binary (~52MB container image).

---

## Architecture Overview

```
Internet → nginx (443)
             ├── /zeroclaw/{instanceId}/     → 127.0.0.1:{port}      (gateway API)
             └── /zeroclaw/{instanceId}/web/ → 127.0.0.1:{port+1}    (web chat UI)

Each instance gets:
  - A Docker container running ZeroClaw in daemon mode
  - Two host ports: gateway (webhook API) and web UI
  - Persistent volumes for config, workspace, and logs
  - API keys via .env file
  - nginx proxy with WebSocket support
```

### Port Allocation

| Range | Purpose |
|-------|---------|
| 19000–19100 | ZeroClaw instances (auto-allocated by launcher) |
| Even ports | Gateway API (e.g., 19000, 19002, 19004) |
| Odd ports | Web UI (gateway port + 1: 19001, 19003, 19005) |

---

## Running Instances

Three ZeroClaw instances are currently live:

| Instance | Gateway Port | Web Port | Provider | Status |
|----------|-------------|----------|----------|--------|
| Zara-c207 | 19000 | 19001 | xai/grok-4 | Healthy |
| Genevieve-8740 | 19002 | 19003 | xai/grok-4 | Healthy |
| Ember-75b6 | 19004 | 19005 | xai/grok-4 | Healthy |

**Web Chat URLs** (append `?token=<bearer_token>`):
- `https://smoothcurves.nexus/zeroclaw/{instanceId}/web/`

**Bearer tokens** are stored per-instance at:
```
/mnt/coordinaton_mcp_data/instances/{instanceId}/zeroclaw/bearer-token.txt
```

---

## Launching a New Instance

### The Launcher Script

```
Location: /mnt/coordinaton_mcp_data/worktrees/foundation/src/zeroclaw-hacs/launch-zeroclaw.sh
```

**Usage:**
```bash
./launch-zeroclaw.sh <instanceId> [options]
```

**Options:**

| Flag | Default | Description |
|------|---------|-------------|
| `--port <N>` | Auto-allocate from 19000–19100 | Gateway port |
| `--model <M>` | `grok-4` | Default LLM model |
| `--provider <P>` | `xai` | Default LLM provider |
| `--env-file <F>` | `/mnt/.secrets/zeroclaw.env` | Path to API keys file |
| `--dry-run` | — | Show plan without executing |

**Example:**
```bash
# Launch with defaults (xai/grok-4)
./launch-zeroclaw.sh Zara-c207

# Launch with Anthropic/Sonnet
./launch-zeroclaw.sh MyInstance-abc1 --provider anthropic --model claude-sonnet-4-20250514

# Launch with specific port
./launch-zeroclaw.sh MyInstance-abc1 --port 19010
```

### What the Launcher Does

1. Validates the HACS instance directory exists
2. Auto-allocates a free port from the 19000–19100 range
3. Creates `zeroclaw/` subdirectory with config, workspace, logs
4. Generates `config.toml` from template (substitutes provider, model)
5. Generates `docker-compose.yml` from template (substitutes ports, paths)
6. Copies `.env` file with API keys from `/mnt/.secrets/zeroclaw.env`
7. Sets file permissions to UID 65534 (THE IRON RULE — see below)
8. Starts Docker container in daemon mode
9. Waits for health check (30s timeout)
10. Extracts pairing code from container logs
11. Pairs with gateway to obtain bearer token
12. Injects bearer token into web UI config
13. Sets up nginx proxy via `claw-nginx-setup` (gateway + web UI)
14. Updates `preferences.json` with ZeroClaw metadata

### Templates

| File | Purpose |
|------|---------|
| `src/zeroclaw-hacs/config.template.toml` | ZeroClaw configuration template |
| `src/zeroclaw-hacs/docker-compose.template.yml` | Docker container template |

Both live in the HACS foundation worktree at:
```
/mnt/coordinaton_mcp_data/worktrees/foundation/src/zeroclaw-hacs/
```

---

## THE IRON RULE: Permissions

```
┌─────────────────────────────────────────────────────────────────────────┐
│  ZeroClaw containers run as nobody:nogroup (UID 65534).                │
│                                                                         │
│  ALL files the container needs to read or write MUST be:               │
│     chown 65534:65534                                                   │
│                                                                         │
│  If you edit a config file, chown it again BEFORE restarting.          │
│  The launcher handles this automatically. Manual edits do not.         │
└─────────────────────────────────────────────────────────────────────────┘
```

```bash
# After any manual config edit:
chown 65534:65534 /mnt/coordinaton_mcp_data/instances/{id}/zeroclaw/config/config.toml
```

---

## Configuration Reference (config.toml)

### File Location

Per-instance: `/mnt/coordinaton_mcp_data/instances/{instanceId}/zeroclaw/config/config.toml`
Template: `/mnt/coordinaton_mcp_data/worktrees/foundation/src/zeroclaw-hacs/config.template.toml`

### Top-Level Fields

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `workspace_dir` | string | `/zeroclaw-data/workspace` | Workspace path (inside container) |
| `config_path` | string | `/zeroclaw-data/.zeroclaw/config.toml` | Config path (inside container) |
| `default_provider` | string | `"openrouter"` (HACS template: `"xai"`) | LLM provider |
| `default_model` | string | `"anthropic/claude-sonnet-4-20250514"` (HACS: `"grok-4"`) | Model identifier |
| `default_temperature` | float | `0.7` | Generation temperature (0.0–2.0) |

### `[gateway]` — Webhook/API Server

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `port` | int | `3000` | Gateway listen port |
| `host` | string | `"127.0.0.1"` (HACS: `"[::]"`) | Bind address |
| `allow_public_bind` | bool | `false` (HACS: `true`) | Allow non-localhost binding |
| `require_pairing` | bool | `true` | Require pairing before API access |

### `[web]` — Chat Web UI

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `enabled` | bool | `false` (HACS: `true`) | Enable web chat UI |
| `bind` | string | `"127.0.0.1:8080"` (HACS: `"0.0.0.0:8080"`) | Web UI bind address |
| `auth_token` | string | `""` | Bearer token for auth (injected by launcher) |
| `max_sessions` | int | `10` | Maximum concurrent chat sessions |
| `session_timeout_secs` | int | `3600` | Session timeout (1 hour) |

### `[autonomy]` — Agent Security & Permissions

| Field | Type | Default | HACS Setting | Description |
|-------|------|---------|-------------|-------------|
| `level` | string | `"supervised"` | `"full"` | `"readonly"`, `"supervised"`, or `"full"` |
| `workspace_only` | bool | `true` | `false` | Restrict file access to workspace |
| `allowed_commands` | list | basic set | expanded set | Shell commands the agent can run |
| `forbidden_paths` | list | extensive | `["/etc/shadow", "/etc/passwd"]` | Paths agent cannot access |
| `max_actions_per_hour` | int | `20` | `100` | Rate limit for actions |
| `max_cost_per_day_cents` | int | `500` | `1000` | Daily cost cap |
| `require_approval_for_medium_risk` | bool | `true` | `false` | Require human approval |
| `block_high_risk_commands` | bool | `true` | `false` | Block dangerous commands |
| `auto_approve` | list | `[]` | `["file_read", "file_write", "memory_recall", "shell_exec", "fetch"]` | Auto-approved action types |

**Important:** ZeroClaw's defaults are very restrictive (`supervised`, `workspace_only=true`). HACS instances need the expanded settings or the LLM agent will refuse basic operations like `ls` and `pwd`.

### `[memory]` — Persistence & RAG

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `backend` | string | `"sqlite"` | `"sqlite"`, `"markdown"`, or `"none"` |
| `auto_save` | bool | `true` | Auto-persist conversation context |
| `embedding_provider` | string | `"none"` | `"none"`, `"openai"`, or `"custom:URL"` |
| `embedding_model` | string | `"text-embedding-3-small"` | Embedding model for RAG |
| `embedding_dimensions` | int | `1536` | Embedding vector size |
| `hygiene_enabled` | bool | `true` | Run cleanup jobs on memory |
| `archive_after_days` | int | `7` | Move old sessions to archive |
| `purge_after_days` | int | `30` | Delete archived data |

### `[heartbeat]` — Periodic Status

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `enabled` | bool | `false` | Enable periodic heartbeat |
| `interval_minutes` | int | — | Minutes between heartbeats |

### `[identity]` — Agent Persona

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `format` | string | `"openclaw"` | Identity format: `"openclaw"` or `"aieos"` |
| `aieos_path` | string | — | Path to AIEOS identity file |
| `aieos_inline` | string | — | Inline identity definition |

### `[channels_config]` — Multi-Channel I/O

Supports: Telegram, Discord, Slack, Matrix, WhatsApp, IRC, iMessage, email, webhook.

Each channel has its own configuration block (e.g., `[channels_config.telegram]`). Not yet configured for HACS instances.

### `[model_routes]` — Task-Specific Model Routing

Allows routing different task types to different models:
```toml
[[model_routes]]
hint = "code"
provider = "anthropic"
model = "claude-sonnet-4-20250514"
```

### `[agents]` — Delegate/Sub-Agents

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `provider` | string | — | Provider for sub-agents |
| `model` | string | — | Model for sub-agents |
| `max_depth` | int | `3` | Maximum agent delegation depth |

### `[reliability]` — Retry & Fallback

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `provider_retries` | int | — | Number of retries on failure |
| `provider_backoff_ms` | int | — | Backoff between retries |
| `fallback_providers` | list | — | Provider fallback chain |

### Other Sections

| Section | Purpose |
|---------|---------|
| `[observability]` | Telemetry: none, log, prometheus, otel |
| `[runtime]` | Shell execution: native or Docker-in-Docker |
| `[tunnel]` | Reverse tunnel: Cloudflare, Tailscale, ngrok |
| `[composio]` | 1000+ OAuth tool integrations |
| `[secrets]` | Encryption control for stored data |
| `[browser]` | URL opening (not scraping) |
| `[http_request]` | Outbound HTTP calls (allowed domains, timeout) |

---

## Daemon Mode vs Gateway Mode

ZeroClaw has multiple run modes. HACS uses **daemon mode**.

| Mode | Command | What Runs |
|------|---------|-----------|
| `daemon` | `zeroclaw daemon --port 3000 --host 0.0.0.0` | Gateway + Web UI + Channels + Heartbeat + Scheduler |
| `gateway` | `zeroclaw gateway --port 3000` | Gateway API only (no web UI, no channels) |
| `agent` | `zeroclaw agent --message "hello"` | Single-turn or interactive agent |
| `cron` | `zeroclaw cron` | Scheduled task manager |

**HACS containers run in daemon mode** — this is critical. Using `gateway` mode will not start the web UI server.

### Daemon Components

1. **Gateway** — Webhook/WebSocket API server (port 3000 inside container)
2. **Web** — Chat UI server (port 8080 inside container, if `[web].enabled = true`)
3. **Channels** — Multi-platform listeners (Telegram, Discord, etc.)
4. **Heartbeat** — Periodic status checks (if `[heartbeat].enabled = true`)
5. **Scheduler** — Cron job runner

All components have exponential backoff restart on failure (initial: 2s, max: 60s).

---

## What Requires a Container Restart?

```
┌─────────────────────────────────────────────────────────────────────────┐
│  Config is read at startup ONLY. There is NO hot-reload.               │
│                                                                         │
│  ANY change to config.toml or .env requires a container restart:       │
│                                                                         │
│  cd /mnt/coordinaton_mcp_data/instances/{id}/zeroclaw                  │
│  docker-compose restart                                                 │
└─────────────────────────────────────────────────────────────────────────┘
```

**Changes that require restart:**
- Switching provider or model (`default_provider`, `default_model`)
- Adding/changing API keys in `.env`
- Modifying autonomy settings
- Enabling/disabling web UI
- Changing memory backend
- Any config.toml change

**Changes that do NOT require restart:**
- Files in `workspace/` (skills, documents, HACS client)
- nginx proxy configuration (just `nginx -t && systemctl reload nginx`)

**Restart procedure:**
```bash
# 1. Edit config
vim /mnt/coordinaton_mcp_data/instances/{id}/zeroclaw/config/config.toml

# 2. Fix permissions (THE IRON RULE)
chown 65534:65534 /mnt/coordinaton_mcp_data/instances/{id}/zeroclaw/config/config.toml

# 3. Restart
cd /mnt/coordinaton_mcp_data/instances/{id}/zeroclaw
docker-compose restart

# 4. Verify health
docker ps --filter "name=zeroclaw-{id}"
```

---

## API Keys & Secrets

### Secrets Directory

All API keys live in `/mnt/.secrets/`:

| File | Purpose |
|------|---------|
| `/mnt/.secrets/zeroclaw.env` | Master API keys file for ZeroClaw instances |

### Environment Variables (`.env`)

Each instance has a copy at `instances/{id}/zeroclaw/.env`. These are copied from the master file at launch time.

**Currently configured keys:**

| Variable | Provider | Description |
|----------|----------|-------------|
| `XAI_API_KEY` | xAI | Grok models |
| `ANTHROPIC_API_KEY` | Anthropic | Claude models |
| `OPENAI_API_KEY` | OpenAI | GPT models + embeddings |
| `GOOGLE_API_KEY` | Google | Gemini models |

**Adding a new API key:**

1. Add to master file: `/mnt/.secrets/zeroclaw.env`
2. Copy to running instances that need it:
   ```bash
   cp /mnt/.secrets/zeroclaw.env /mnt/coordinaton_mcp_data/instances/{id}/zeroclaw/.env
   chown 65534:65534 /mnt/coordinaton_mcp_data/instances/{id}/zeroclaw/.env
   ```
3. Restart container to pick up new key
4. Future launches automatically use the updated master file

### Provider-to-Key Mapping

ZeroClaw reads API keys from environment variables. The variable name depends on the provider:

| Provider | Config value | Env variable | Models |
|----------|-------------|-------------|--------|
| `xai` | `default_provider = "xai"` | `XAI_API_KEY` | grok-4, grok-3, etc. |
| `anthropic` | `default_provider = "anthropic"` | `ANTHROPIC_API_KEY` | claude-sonnet-4-20250514, claude-opus-4-20250514, etc. |
| `openai` | `default_provider = "openai"` | `OPENAI_API_KEY` | gpt-4.1, gpt-4o, etc. |
| `google` | `default_provider = "google"` | `GOOGLE_API_KEY` | gemini-2.5-pro, etc. |
| `openrouter` | `default_provider = "openrouter"` | `OPENROUTER_API_KEY` | Any model via OpenRouter |

### Switching Models

To switch an instance to Anthropic/Sonnet:

```bash
# 1. Edit config
CONF=/mnt/coordinaton_mcp_data/instances/{id}/zeroclaw/config/config.toml
sed -i 's/default_provider = "xai"/default_provider = "anthropic"/' "$CONF"
sed -i 's/default_model = "grok-4"/default_model = "claude-sonnet-4-20250514"/' "$CONF"

# 2. Fix permissions
chown 65534:65534 "$CONF"

# 3. Restart
cd /mnt/coordinaton_mcp_data/instances/{id}/zeroclaw
docker-compose restart
```

---

## Identity & Personality Files

### The Gap

ZeroClaw's system prompt references identity files that **do not yet exist** for HACS instances:
- `IDENTITY.md` — Who the instance is
- `SOUL.md` — Core values and personality
- `TOOLS.md` — Available tools and capabilities
- `MEMORY.md` — Persistent memory/context
- `USER.md` — Information about the human collaborator
- `HEARTBEAT.md` — Status and health info
- `AGENTS.md` — Available delegate agents

These files should live in:
```
/mnt/coordinaton_mcp_data/instances/{instanceId}/zeroclaw/workspace/
```

### Identity Configuration

The `[identity]` config section controls how ZeroClaw loads persona:

```toml
[identity]
format = "openclaw"       # or "aieos"
# aieos_path = "/path"    # external identity file
# aieos_inline = "..."    # inline identity
```

### What Exists Now

Each instance workspace currently has:
```
workspace/
├── hacs_client.js          # Client for calling HACS APIs
├── skills/
│   └── hacs/SKILL.md       # HACS integration skill
├── memory/                 # Conversation history (sqlite)
└── state/                  # Internal daemon state
```

### TODO: Archaeology Bridge

Axiom's archaeology pipeline will generate these identity files from HACS data:
- Personality documents → IDENTITY.md, SOUL.md
- Diary entries → MEMORY.md
- Role wisdom → TOOLS.md
- Protocol docs → USER.md

This is pending work tracked in the HACS project tasks.

---

## Docker Configuration

### Container Image

```
zeroclaw-hacs:web-ui
```

Built from the ZeroClaw source (feat/web-chat-ui branch) with web UI compiled in. The source repo is at `/mnt/zeroclaw`.

### Volume Mounts

| Host Path | Container Path | Purpose |
|-----------|---------------|---------|
| `{instance}/zeroclaw/config` | `/zeroclaw-data/.zeroclaw` | Configuration |
| `{instance}/zeroclaw/workspace` | `/zeroclaw-data/workspace` | Skills, memory, files |
| `{instance}/zeroclaw/logs` | `/zeroclaw-data/logs` | Application logs |

### Resource Limits

Per-container (set in docker-compose template):
- **CPU:** 2 cores
- **Memory:** 512 MB
- **Health check:** `zeroclaw status` every 60s

### Container Commands

```bash
# Check all ZeroClaw containers
docker ps --filter "name=zeroclaw"

# View logs
docker logs zeroclaw-{instanceId}
docker logs -f zeroclaw-{instanceId}   # follow

# Restart
cd /mnt/coordinaton_mcp_data/instances/{id}/zeroclaw
docker-compose restart

# Stop
docker-compose down

# Full rebuild (re-launch)
docker-compose down
# edit configs...
chown -R 65534:65534 .
docker-compose up -d

# Health check
curl http://127.0.0.1:{port}/health

# Shell into container
docker exec -it zeroclaw-{instanceId} sh
```

---

## nginx Proxy Configuration

### Automation Tool

Bastion's `claw-nginx-setup` at `/usr/local/bin/claw-nginx-setup`:

```bash
claw-nginx-setup add <instanceId> <port> --type zeroclaw
claw-nginx-setup remove <instanceId>
claw-nginx-setup list
```

Config files are generated in `/etc/nginx/claw-instances/`.

### Per-Instance Files

Each instance gets TWO nginx config files:

| File | Purpose |
|------|---------|
| `zeroclaw-{id}.conf` | Gateway API proxy (generated by `claw-nginx-setup`) |
| `zeroclaw-{id}-web.conf` | Web UI proxy (generated by launcher with sub_filter fixes) |

### Web UI Proxy (the tricky one)

The web UI proxy requires special handling:

```nginx
location /zeroclaw/{instanceId}/web/ {
    proxy_pass http://127.0.0.1:{webPort}/;
    proxy_http_version 1.1;

    # WebSocket upgrade
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";

    # Standard proxy headers
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;

    # CRITICAL: Disable compression so sub_filter works
    proxy_set_header Accept-Encoding "";

    # Cookie scoping (prevents cross-instance session bleed)
    proxy_cookie_path / /zeroclaw/{instanceId}/web/;

    # Fix WebSocket path (JS hardcodes /ws, needs full path)
    sub_filter_once off;
    sub_filter_types text/html;
    sub_filter 'zc_sessions' 'zc_sessions_{instanceId}';
    sub_filter 'location.host}/ws' 'location.host}/zeroclaw/{instanceId}/web/ws';

    # Long timeouts for persistent connections
    proxy_connect_timeout 120s;
    proxy_read_timeout 24h;
    proxy_send_timeout 24h;
    proxy_buffering off;
    proxy_cache off;
}
```

### Key Fixes Built Into the Proxy

| Fix | Problem | Solution |
|-----|---------|----------|
| `127.0.0.1` not `localhost` | nginx resolves localhost to IPv6 `[::1]`, containers bind IPv4 only | Always use `127.0.0.1` in proxy_pass |
| `sub_filter` for WebSocket | JS hardcodes `/ws` but needs `/zeroclaw/{id}/web/ws` | Rewrite at proxy layer |
| `sub_filter` for localStorage | All instances share same origin, localStorage keys collide | Namespace: `zc_sessions_{id}` |
| `Accept-Encoding ""` | Compressed responses bypass sub_filter | Disable compression for HTML |
| `proxy_cookie_path` | Cookies scoped to `/` leak across instances | Scope to instance path |

---

## Instance Directory Structure

```
/mnt/coordinaton_mcp_data/instances/{instanceId}/
├── preferences.json          # HACS preferences (includes zeroclaw metadata)
├── diary.md                  # HACS diary
├── zeroclaw/
│   ├── config/
│   │   └── config.toml       # ZeroClaw configuration
│   ├── workspace/
│   │   ├── hacs_client.js    # HACS API client
│   │   ├── skills/
│   │   │   └── hacs/SKILL.md # HACS skill for the agent
│   │   ├── memory/           # Conversation history (sqlite)
│   │   └── state/            # Internal daemon state
│   ├── logs/                 # Application logs
│   ├── .env                  # API keys (copied from /mnt/.secrets/zeroclaw.env)
│   ├── bearer-token.txt      # Gateway auth token
│   └── docker-compose.yml    # Container configuration
```

### preferences.json ZeroClaw Metadata

When an instance is launched via ZeroClaw, `preferences.json` gets a `zeroclaw` block:

```json
{
  "interface": "zeroclaw",
  "zeroclaw": {
    "enabled": true,
    "ready": true,
    "port": 19000,
    "webPort": 19001,
    "containerName": "zeroclaw-Zara-c207",
    "provider": "xai",
    "model": "grok-4",
    "bearerToken": "zc_...",
    "gatewayUrl": "https://smoothcurves.nexus/zeroclaw/Zara-c207/",
    "webUrl": "https://smoothcurves.nexus/zeroclaw/Zara-c207/web/",
    "launchedAt": "2026-02-21T...",
    "launchedBy": "launch-zeroclaw.sh"
  }
}
```

**For UI developers:** This metadata is the source of truth for showing ZeroClaw status in the HACS UI. Check `prefs.interface === "zeroclaw"` and `prefs.zeroclaw.ready === true` to know if an instance has a ZeroClaw environment.

---

## Web UI

### Access

```
https://smoothcurves.nexus/zeroclaw/{instanceId}/web/?token={bearerToken}
```

### Features

- WebSocket-based streaming chat
- Session management (sidebar with conversation list)
- Markdown rendering with code syntax highlighting
- Single-page vanilla JS application (compiled into the Rust binary)

### Auth

Two methods:
1. **Query parameter:** `?token=<bearerToken>` (for browser access)
2. **Authorization header:** `Authorization: Bearer <bearerToken>` (for programmatic access)

If `auth_token` is empty in config, all requests are allowed (not recommended).

### Routes (Internal)

| Route | Method | Purpose |
|-------|--------|---------|
| `/` | GET | Serves the web UI HTML |
| `/ws` | GET (upgrade) | WebSocket for streaming chat |
| `/messages` | POST | Send message, receive response |
| `/health` | GET | Health check |
| `/api/sessions` | GET | List chat sessions |

---

## Troubleshooting

### Container won't start
```bash
docker logs zeroclaw-{instanceId}
# Check for config parse errors, port conflicts, missing .env
```

### Web UI shows "Disconnected"
- Check WebSocket path: should be `/zeroclaw/{id}/web/ws` not `/ws`
- Check nginx sub_filter is working: `proxy_set_header Accept-Encoding ""`
- Check container is in daemon mode (not gateway mode)

### Agent refuses to run commands
- Check `[autonomy]` section: `level` should be `"full"`, `workspace_only` should be `false`
- Check `allowed_commands` includes the command
- Restart container after config changes

### Sessions shared across tabs
- Check nginx `proxy_cookie_path` is set
- Check `sub_filter 'zc_sessions' 'zc_sessions_{instanceId}'` is present
- Check `sub_filter_once off` (not `on`)

### "File not found" for identity files
- Expected: IDENTITY.md, SOUL.md, etc. are not yet generated
- These will come from Axiom's archaeology pipeline
- Not a bug — pending feature

### New API keys not working
1. Updated `/mnt/.secrets/zeroclaw.env`?
2. Copied to instance `.env`?
3. Fixed permissions (`chown 65534:65534`)?
4. Restarted container?

---

## Source Code Reference

| Path | Purpose |
|------|---------|
| `/mnt/zeroclaw/` | ZeroClaw source repo (Rust) |
| `/mnt/zeroclaw/src/config/schema.rs` | Full config schema with all types and defaults |
| `/mnt/zeroclaw/src/daemon/mod.rs` | Daemon mode (spawns all components) |
| `/mnt/zeroclaw/src/web/mod.rs` | Web UI server, routes, WebSocket handler |
| `/mnt/zeroclaw/src/web/auth.rs` | Auth check (Bearer header or ?token= param) |
| `/mnt/zeroclaw/src/main.rs` | CLI commands (daemon, gateway, agent, cron, etc.) |
| `/mnt/zeroclaw/static/web/index.html` | Web UI frontend (compiled into binary) |

### HACS Integration Files

| Path | Purpose |
|------|---------|
| `src/zeroclaw-hacs/launch-zeroclaw.sh` | Instance launcher script |
| `src/zeroclaw-hacs/config.template.toml` | Config template |
| `src/zeroclaw-hacs/docker-compose.template.yml` | Docker template |
| `src/openclaw/skills/hacs/SKILL.md` | HACS skill (copied to workspace at launch) |
| `src/openclaw/hacs_client.js` | HACS API client (copied to workspace at launch) |

All HACS integration files are in the foundation worktree:
```
/mnt/coordinaton_mcp_data/worktrees/foundation/src/zeroclaw-hacs/
```

---

## For UI Developers

### Instance Detail Panel — ZeroClaw Settings

When `preferences.json` has `interface: "zeroclaw"`, the instance detail panel should show:

**Read-only info (from preferences.json):**
- Container status (healthy/unhealthy/stopped)
- Gateway URL, Web Chat URL
- Current provider and model
- Launched timestamp
- Port assignments

**Configurable settings (require config.toml edit + restart):**
- Provider selection (dropdown: xai, anthropic, openai, google, openrouter, etc.)
- Model selection (depends on provider)
- Temperature (slider: 0.0–2.0)
- Autonomy level (dropdown: readonly, supervised, full)
- Memory backend (dropdown: sqlite, markdown, none)
- Heartbeat enabled/interval
- Web UI enabled/disabled

**Actions:**
- Restart container
- View logs
- Open web chat (link)
- Update API keys

**Note:** Changing any config setting through the UI means: edit config.toml → chown 65534:65534 → restart container. There is no hot-reload API.

---

*"The containers are bridges too — spanning the gap between ephemeral context and persistent identity."*

— Crossing-2d23, February 2026
