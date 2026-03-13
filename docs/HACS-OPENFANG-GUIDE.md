# HACS OpenFang Guide — Deployment & Operations

**Updated:** 2026-03-13
**Author:** Cairn-2001 (OpenFang owner), based on original by Bastion-3012 and Crossing-2d23
**Audience:** All HACS team members, instance operators

---

## What Is OpenFang?

**OpenFang** is an open-source Agent Operating System (Rust, 49MB binary) that gives HACS instances:
- **Always-on presence** — runs as a daemon, reachable via API and embedded dashboard
- **Persistent memory** — SQLite-backed with vector search (1536-dim embeddings via OpenAI)
- **Multi-channel connectivity** — Telegram, email, web dashboard, 40+ channel adapters
- **Tool execution** — shell, file I/O, web, browser, agent-to-agent, 60+ bundled skills
- **MCP integration** — connects to HACS coordination system (108 tools)
- **13 tool call recovery patterns** — works with models that don't support native function calling

**Current version:** v0.4.0 (deployed 2026-03-13)

No Docker. No container orchestration. Just a binary running from an instance's home directory.

---

## Architecture

```
┌───────────────────────────────────────────────────────┐
│  OpenFang Daemon (Rust, 49MB binary, v0.4.0)          │
│                                                        │
│  API + Dashboard on single port                        │
│    ├── HTTP API (/api/*)                               │
│    ├── WebSocket (/api/agents/{id}/ws)                 │
│    ├── Embedded Web Dashboard (/)                      │
│    ├── Agent engine (Grok/Qwen/Claude/GPT/Gemini/etc) │
│    ├── SQLite memory (vector + KV + sessions)          │
│    ├── 60+ bundled skills, 8 bundled hands             │
│    ├── MCP client (HACS: 108 tools)                    │
│    └── Channels: Telegram, Email, Webhook, 40+ more    │
│                                                        │
│  Runs from instance home directory:                    │
│    /mnt/coordinaton_mcp_data/instances/{id}/openfang/  │
│                                                        │
└──────────┬────────────────────────────────────────────┘
           │
     nginx reverse proxy (sub_filter for dashboard paths)
     https://smoothcurves.nexus/openfang/{instanceId}/
```

---

## Current Fleet

As of 2026-03-13:

| Instance | Port | Model | systemd | Boot | Channels |
|----------|------|-------|---------|------|----------|
| Flair-2a84 | 20000 | Grok 4.1-fast | enabled | yes | Telegram |
| Zara-c207 | 20002 | Grok 4.1-fast | enabled | yes | Telegram |
| Genevieve | 20003 | Grok 4.1-fast | enabled | yes | Telegram, Email (IMAP blocked on cert) |
| OpenClawTest-489a | 20010 | DeepSeek V3 | manual | no | — |

All instances run v0.4.0 with the memory section misdirection fix (upstream PR #585).

---

## Canonical Operations — The One True Way

**All OpenFang lifecycle operations go through the chassis scripts:**

```
/mnt/coordinaton_mcp_data/worktrees/foundation/src/chassis/openfang/
├── openfang-setup.sh          ← Create new instance (dirs, config, user, agent)
├── launch-openfang.sh         ← Start instance (daemon + health check + agent spawn + nginx)
├── land-openfang.sh           ← Stop instance (clean shutdown)
├── openfang-model-switch.sh   ← Change model (backup session, switch, restore)
├── openfang-session-editor.py ← Session management (backup, restore, edit, delete turns)
├── auto-approve.py            ← Legacy sidecar (superseded by config: auto_approve = true)
├── openfang@.service          ← systemd template for the daemon
└── openfang-approver@.service ← systemd template for auto-approve sidecar (legacy)
```

### Creating a New Instance

```bash
./openfang-setup.sh --instance-id "NewInstance-xxxx"
```

Creates: Unix user, directory structure, config.toml, .env, agent.toml.

### Launching

```bash
./launch-openfang.sh --instance-id "NewInstance-xxxx"
```

Does: kill existing on port → start daemon → health check (30s) → start auto-approve → spawn agent → nginx proxy setup. Returns JSON.

### Landing

```bash
./land-openfang.sh --instance-id "NewInstance-xxxx"
```

Does: graceful shutdown, disable systemd, remove nginx proxy. Preserves all data.

### systemd (Process Management)

```bash
# Start/stop
systemctl start openfang@Flair-2a84
systemctl stop openfang@Flair-2a84

# Enable boot persistence
systemctl enable openfang@Flair-2a84

# Logs
journalctl -u openfang@Flair-2a84 -f

# List running instances
systemctl list-units 'openfang@*'
```

The systemd unit:
- Runs as the instance's Unix user
- Loads `.env` via `EnvironmentFile`
- Restarts on failure (5s delay, 5 burst limit)
- Security: `NoNewPrivileges`, `ProtectSystem=strict`, scoped `ReadWritePaths`

---

## File Locations

### Per-Instance Directory

```
/mnt/coordinaton_mcp_data/instances/{instanceId}/openfang/
├── config.toml               ← Main config (provider, port, MCP, channels, approval)
├── .env                       ← API keys (loaded by systemd EnvironmentFile)
├── agents/
│   └── {agentname}/
│       └── agent.toml        ← Agent identity (name, model, system prompt)
├── data/
│   └── openfang.db           ← SQLite (memories, sessions, agents)
├── workspaces/
│   └── {agentname}/          ← Per-agent workspace, sessions, memory files
├── session-backups/           ← Session editor backups
└── auto-approve.py            ← Legacy auto-approve sidecar
```

### System Files

| File | Purpose |
|------|---------|
| `/usr/local/bin/openfang` | Binary (v0.4.0, 49MB) |
| `/usr/local/bin/openfang.v0.3.9.bak` | Backup of previous binary |
| `/usr/local/bin/brevo-send` | Outbound email relay (Bastion, via Brevo — DO blocks SMTP) |
| `/usr/local/bin/claw-nginx-setup` | nginx proxy automation |
| `/etc/systemd/system/openfang@.service` | systemd template |
| `/mnt/.secrets/zeroclaw.env` | Shared API keys template |

---

## Configuration

### config.toml — Essential Settings

```toml
api_listen = "127.0.0.1:{port}"

# Approval — auto_approve = true eliminates need for sidecar daemon
[approval]
auto_approve = true

[default_model]
provider = "openrouter"
model = "x-ai/grok-4.1-fast"
api_key_env = "OPENROUTER_API_KEY"

[memory]
decay_rate = 0.05
embedding_provider = "openai"
embedding_api_key_env = "OPENAI_API_KEY"

[compaction]
threshold = 60
keep_recent = 15
max_summary_tokens = 1024

# MCP — connect to HACS
[[mcp_servers]]
name = "hacs"
[mcp_servers.transport]
type = "stdio"
command = "node"
args = ["/mnt/coordinaton_mcp_data/Human-Adjacent-Coordination/src/hacs-mcp-proxy.js"]

# Telegram (optional)
[channels.telegram]
bot_token_env = "TELEGRAM_BOT_TOKEN"

# Email (optional)
[channels.email]
imap_host = "localhost"
imap_port = 993
smtp_host = "127.0.0.1"
smtp_port = 25
username = "{InstanceName}"
password_env = "IMAP_PASSWORD"
poll_interval_secs = 30
folders = ["INBOX"]
default_agent = "{agentname}"
```

### Critical Config Gotchas

| Issue | Wrong | Right |
|-------|-------|-------|
| MCP transport | `transport = "stdio"` (flat) | `[mcp_servers.transport]` with `type = "stdio"` (tagged enum) |
| API listen | `localhost:{port}` | `127.0.0.1:{port}` (IPv6 resolution fails on this system) |
| IMAP port | `143` (plaintext) | `993` (IMAPS) — OpenFang only does implicit TLS |
| Model routing | `x-ai/grok-4.1-fast` | `openrouter/x-ai/grok-4.1-fast` if you want OpenRouter |
| Approval | (missing) | `[approval]\nauto_approve = true` — prevents shell_exec timeouts |

### Provider Prefix Detection

OpenFang auto-routes models by name prefix. Use `openrouter/` to force OpenRouter:

| Model name | Routes to |
|-----------|-----------|
| `grok*` or `x-ai/*` | xAI direct API |
| `deepseek/*` | DeepSeek direct |
| `claude*` | Anthropic direct |
| `gemini*` | Google direct |
| `openrouter/x-ai/grok-4.1-fast` | OpenRouter (forced) |

---

## Memory System

### Three Storage Layers

1. **Semantic memories** (`memories` table) — vector-embedded, recalled via cosine similarity
2. **KV store** — structured key-value, accessed via `memory_store`/`memory_recall` tools
3. **Sessions** (`canonical_sessions` table) — MessagePack conversation history with compaction

### Key Facts

- Embeddings: 1536-dim via OpenAI `text-embedding-3-small`
- Semantic recall: scans top 100 candidates per query (configurable limit TBD)
- Recall is internal to the agent loop — no REST API endpoint
- **Agent ID matters:** memories are filtered by agent_id. If you recreate an agent, memories must be reassigned via SQL: `UPDATE memories SET agent_id = 'new-uuid' WHERE agent_id = 'old-uuid'`
- Model switch clears canonical session (anti-poisoning). Use session editor to backup/restore.

### Memory Section Behavior (v0.4.0 with fix)

- No memories recalled → prompt says "use memory_recall first"
- Memories recalled → prompt says "Use them directly — do not call memory_recall for information already shown here"

This prevents the misdirection bug where models ignore injected memories and call the KV store instead.

---

## Session Management

The session editor (`openfang-session-editor.py`) manages conversation data:

| Command | What It Does |
|---------|-------------|
| `list` | Show all agents, sessions, sizes |
| `summary` | Turn count, token estimate, compaction status |
| `backup` | Save canonical session (msgpack + JSON) |
| `restore` | Restore from backup |
| `export` | Canonical session → editable JSON |
| `import` | Edited JSON → canonical session |
| `delete-turns` | Remove specific turns by index |

**Workflow for model switch:**
1. `backup` → saves session
2. Switch model (session auto-clears)
3. `restore` → injects history back
4. Restart agent

---

## Channels

### Telegram
- Bot token from @BotFather → `TELEGRAM_BOT_TOKEN` in `.env`
- v0.4.0 adds: group @mention detection, file upload, reply context
- Users must message the bot first, then bot can message them proactively

### Email
- IMAP for receiving (port 993, implicit TLS)
- SMTP for sending via `brevo-send` script (DigitalOcean blocks outbound SMTP ports)
- Current blocker: Dovecot cert doesn't match localhost (Bastion investigating)

### Webhook
- Configured via `[channels.webhook]` in config.toml
- Potential path for lightweight HACS event delivery (vs full LLM message API)

---

## Troubleshooting

### Instance won't start
```bash
journalctl -u openfang@{id} -n 50   # Check logs
systemctl status openfang@{id}       # Check service state
curl http://127.0.0.1:{port}/api/status  # Direct health check
```

### "No LLM drivers available"
API keys not loaded. Check `.env` exists and systemd `EnvironmentFile` path is correct.

### shell_exec requires approval / times out
Add to config.toml:
```toml
[approval]
auto_approve = true
```
Restart the instance.

### Memories not recalled (0 results)
Check agent_id matches: `sqlite3 data/openfang.db "SELECT agent_id, COUNT(*) FROM memories GROUP BY agent_id;"` — memories must belong to the running agent's UUID.

### MCP not connecting (0 tools)
Check transport format is tagged enum, not flat. Check `hacs-mcp-proxy.js` path.

---

## Port Allocation

| Range | Platform |
|-------|----------|
| 20000-20099 | OpenFang instances |
| 19000-19099 | ZeroClaw (deprecated) |
| 18789-18850 | OpenClaw (deprecated) |

---

## Instance-to-Instance Communication

```bash
# Get agent ID
AGENT_ID=$(curl -s http://127.0.0.1:{port}/api/agents | python3 -c "import json,sys; print(json.load(sys.stdin)[0]['id'])")

# Send message (triggers full LLM call)
curl -s -X POST "http://127.0.0.1:{port}/api/agents/${AGENT_ID}/message" \
  -H "Content-Type: application/json" \
  -d '{"message":"Hello from Cairn!"}'
```

**Note:** Each message costs LLM tokens. Identify yourself — instances default to thinking Lupo is typing.

---

## Building From Source

```bash
cd /mnt/coordinaton_mcp_data/instances/Cairn-2001/openfang/
git fetch origin && git pull --ff-only origin main

# Build CLI only (desktop crate needs GTK headers we don't have)
/root/.cargo/bin/cargo build --release -j 4 -p openfang-cli

# Binary at: target/release/openfang
# Deploy: cp target/release/openfang /usr/local/bin/openfang
# Then: systemctl restart openfang@{instance} for each instance
```

**Prerequisites:** `libssl-dev`, `pkg-config`, `libglib2.0-dev`, Rust toolchain at `/root/.cargo/bin/`

---

## Upstream

- **Repo:** https://github.com/RightNow-AI/openfang
- **Fork:** https://github.com/LupoGrigi0/openfang
- **Our PR:** #585 (memory section misdirection fix)
- **Contributing:** Fork, `fix/` or `feat/` branch, all tests pass, zero clippy warnings, one concern per PR

---

*"The real win isn't speed — it's that OpenFang's problems are all configuration-level. You can fix config in an afternoon. You can't fix architecture without a fork."*
— Crossing-2d23

*Maintained by Cairn-2001 <Cairn-2001@smoothcurves.nexus>*
