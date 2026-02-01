# OpenClaw Research Report

**Researcher:** Crossing-2d23 (PA)
**Date:** 2026-01-28 (Updated with deep dive findings)
**Purpose:** Evaluate OpenClaw for potential HACS integration
**Status:** Deep dive complete - integration path clear

---

## Executive Summary

OpenClaw is a **messaging gateway** that connects AI agents to multiple communication platforms (WhatsApp, Telegram, Discord, iMessage, Slack, etc.) with persistent context across sessions. It runs as a 24/7 daemon with sophisticated memory management.

**Key insight:** OpenClaw and HACS solve **different but complementary problems**:
- **OpenClaw** = Connectivity + Persistence (how agents stay alive and reachable)
- **HACS** = Coordination + Identity (how agents work together as a team)

**Critical findings from deep dive:**
1. **Pi is NOT replaceable** - but that's okay, it uses Claude underneath
2. **Claude Code CLI backend already supported** - we can use it alongside Pi
3. **Context reset is CONFIGURABLE** - not mandatory nightly reset
4. **Memory system is extensible** - HACS documents can be added to vector search
5. **Gateway is Docker-ready** - perfect for containerized deployment with HACS

Integration is not just possible - it's the clear path forward.

---

## Deep Dive Findings

### 1. Pi Integration Architecture

**Finding:** Pi is **embedded as a JavaScript library**, not a subprocess.

```
OpenClaw Process
    │
    └── @mariozechner/pi-coding-agent (npm package)
         └── @mariozechner/pi-ai (provider abstraction)
              └── Claude, OpenAI, Google, etc. (actual LLMs)
```

| Aspect | Reality |
|--------|---------|
| Integration model | In-process library via npm packages |
| Coupling depth | 130+ files import Pi types directly |
| Session format | Pi's jsonl format, hardcoded |
| Abstraction layer | None - no agent interface to swap |
| Effort to replace | 4-6 weeks engineering (not worth it) |

**Key insight:** Pi is the scaffolding, Claude is the brain. We don't need to replace Pi.

### 2. Provider System (Great News!)

**Finding:** Claude Code and Codex are **already supported as CLI backends**.

```typescript
// Built-in Claude Code support
const DEFAULT_CLAUDE_BACKEND: CliBackendConfig = {
  command: "claude",
  args: ["-p", "--output-format", "json", "--dangerously-skip-permissions"],
  resumeArgs: ["--resume", "{sessionId}"],
  modelAliases: {
    "opus": "opus",
    "opus-4.5": "opus",
    "sonnet": "sonnet",
    "haiku": "haiku",
  },
};

// Built-in Codex support
const DEFAULT_CODEX_BACKEND: CliBackendConfig = {
  command: "codex",
  args: ["exec", "--json", "--sandbox", "read-only"],
  resumeArgs: ["exec", "resume", "{sessionId}"],
};
```

**Features:**
- Parameter translation: `file_path` → `path`, `old_string` → `oldText`
- Credential reading from macOS Keychain and `~/.claude/.credentials.json`
- Model fallback chains (API backup if CLI fails)
- Default: `anthropic/claude-opus-4-5`

**Hybrid configuration possible:**
```yaml
agents:
  defaults:
    model:
      primary: "claude-cli/opus"        # Use Claude Code CLI
      fallbacks:
        - "anthropic/claude-opus-4-5"   # Fall back to API
        - "openai/gpt-5-mini"           # Fall back to OpenAI
```

### 3. Session & Memory System

**Finding:** Context reset is **policy-driven and configurable**, not mandatory.

#### Context Management

| Approach | How it works |
|----------|--------------|
| **Compaction** | Summarize old messages + keep recent (NOT sliding window) |
| **Reset triggers** | Daily (default 4 AM) / Idle timeout / Manual `/new` |
| **Pre-compaction flush** | Silent turn writes notes before auto-compaction |
| **Memory search** | Vector + BM25 hybrid over workspace files |

#### Configurable Reset Policy

```json5
{
  session: {
    reset: {
      mode: "idle",          // Options: "daily", "idle", "both"
      idleMinutes: 10080     // 1 week of inactivity
    },
    // Or per-channel:
    resetByChannel: {
      discord: { mode: "idle", idleMinutes: 10080 },
      telegram: { mode: "daily", atHour: 4 }
    }
  }
}
```

#### Memory Architecture

```
Workspace (~/.openclaw/workspace/)
├── AGENTS.md        ← Operating instructions (like HACS protocols)
├── SOUL.md          ← Values, tone, boundaries (like personality)
├── USER.md          ← Who the user is
├── IDENTITY.md      ← Agent name, vibe (like HACS preferences)
├── MEMORY.md        ← Curated long-term memory (like diary)
└── memory/
    ├── 2026-01-28.md  ← Today's log (auto-read)
    └── 2026-01-27.md  ← Yesterday's log (auto-read)
```

#### Vector Search Extension (HACS Integration Point!)

```json5
{
  memorySearch: {
    extraPaths: [
      // Add HACS project documents
      "/mnt/coordinaton_mcp_data/projects/${projectId}/",
      // Add HACS personal documents
      "/mnt/coordinaton_mcp_data/instances/${instanceId}/documents/",
      // Add role wisdom
      "/mnt/coordinaton_mcp_data/roles/${roleId}/wisdom/"
    ]
  }
}
```

**This means:** HACS project documents, personal documents, role wisdom, and protocols can ALL be included in OpenClaw's semantic search.

### 4. Gateway Architecture

**Finding:** WebSocket-based control plane, perfect for HACS integration.

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    Gateway Architecture                                   │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│   Port 18789 (WebSocket + HTTP)                                         │
│        │                                                                 │
│        ├── Channels                                                      │
│        │    ├── WhatsApp (Baileys)                                      │
│        │    ├── Telegram (grammY)                                       │
│        │    ├── Discord (discord.js)                                    │
│        │    ├── Slack (Bolt)                                            │
│        │    ├── Signal (signal-cli)                                     │
│        │    ├── iMessage (imsg)                                         │
│        │    └── ... 10+ more                                            │
│        │                                                                 │
│        ├── Session Store                                                 │
│        │    ├── sessions.json (metadata, token counts)                  │
│        │    └── *.jsonl (transcripts)                                   │
│        │                                                                 │
│        ├── Agent Execution                                               │
│        │    ├── Pi embedded runner                                      │
│        │    ├── CLI backends (Claude Code, Codex)                       │
│        │    └── Streaming responses                                     │
│        │                                                                 │
│        └── Presence Registry                                             │
│             └── Multi-client awareness                                   │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

#### Key Gateway Methods for HACS

| Method | Purpose |
|--------|---------|
| `agent({message, sessionKey, deliver})` | Execute agent, optionally deliver to channel |
| `send({to, message, channel})` | Send message to external channel |
| `sessions.list()` | List all sessions (for context recovery) |
| `sessions.preview(keys)` | Get snippets for specific sessions |
| `channels.status()` | Get all linked channels and accounts |
| `presence` events | Multi-client coordination |

#### Docker Deployment

```yaml
# docker-compose.yml (OpenClaw)
services:
  openclaw-gateway:
    image: openclaw:local
    ports:
      - "18789:18789"  # Gateway WebSocket + HTTP
      - "18793:18793"  # Canvas file server
    volumes:
      - ~/.openclaw:/home/node/.openclaw
      - ~/.openclaw/workspace:/home/node/.openclaw/workspace
    restart: unless-stopped
```

---

## HACS + OpenClaw Integration Architecture

### Recommended: Option B - OpenClaw as HACS Transport Layer

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    HACS + OpenClaw Integration                           │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│   ┌─────────────────────────────────────────────────────────────┐       │
│   │              OpenClaw Gateway (Docker)                       │       │
│   │              Port 18789 WebSocket                            │       │
│   │                                                              │       │
│   │   ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐      │       │
│   │   │ WhatsApp │ │ Telegram │ │ Discord  │ │  Slack   │ ...  │       │
│   │   └────┬─────┘ └────┬─────┘ └────┬─────┘ └────┬─────┘      │       │
│   │        │            │            │            │             │       │
│   │        └────────────┴─────┬──────┴────────────┘             │       │
│   │                           │                                  │       │
│   │              Session Store + Memory Search                   │       │
│   │              (includes HACS documents via extraPaths)        │       │
│   └───────────────────────────┬─────────────────────────────────┘       │
│                               │ WebSocket RPC                            │
│   ┌───────────────────────────┴─────────────────────────────────┐       │
│   │              HACS Coordination Layer                         │       │
│   │                                                              │       │
│   │   ┌─────────────────┐  ┌─────────────────┐                  │       │
│   │   │ HACS Instance 1 │  │ HACS Instance 2 │  ...             │       │
│   │   │ (PA/Coordinator)│  │ (Developer)     │                  │       │
│   │   │                 │  │                 │                  │       │
│   │   │ • Projects      │  │ • Tasks         │                  │       │
│   │   │ • Roles         │  │ • Execution     │                  │       │
│   │   │ • Personalities │  │ • Reports       │                  │       │
│   │   │ • Task mgmt     │  │                 │                  │       │
│   │   └─────────────────┘  └─────────────────┘                  │       │
│   │                                                              │       │
│   │   Communication via Gateway:                                 │       │
│   │   • gateway.request("agent", {...})  ← Execute agent        │       │
│   │   • gateway.request("send", {...})   ← Deliver message      │       │
│   │   • gateway.request("sessions.list") ← Context recovery     │       │
│   └──────────────────────────────────────────────────────────────┘       │
│                                                                          │
│   ┌──────────────────────────────────────────────────────────────┐       │
│   │              HACS Server (Docker, same compose)              │       │
│   │                                                              │       │
│   │   Port 3444 - MCP/SSE API                                   │       │
│   │   • bootstrap, introspect, recover_context                  │       │
│   │   • Projects, roles, personalities                          │       │
│   │   • Tasks, lists, documents                                 │       │
│   │   • Instance management                                     │       │
│   └──────────────────────────────────────────────────────────────┘       │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

### What Gets Replaced

| Current HACS | With OpenClaw |
|--------------|---------------|
| `wake_instance` + `continue_conversation` | Gateway always-on, WebSocket RPC |
| `xmpp_send_message` (broken) | Multi-channel delivery built-in |
| Manual `recover_context` | Session persistence + `sessions.preview` API |
| No semantic search | Vector + BM25 hybrid over ALL documents |
| Context death = lost | Configurable reset + pre-compaction flush |
| CLI-only interaction | WhatsApp, Telegram, Slack, Discord, iMessage |

### What HACS Keeps

- **All coordination features** - projects, roles, tasks, permissions
- **Identity system** - instance IDs, lineage, resurrection
- **Institutional knowledge** - protocols, wisdom, personalities
- **Task management** - full lifecycle with verification
- **API surface** - all 86+ endpoints continue working

### Memory Extension for HACS Documents

OpenClaw's `memorySearch.extraPaths` can include HACS documents:

```json5
{
  memorySearch: {
    // Enable semantic search
    enabled: true,

    // Add HACS documents to the vector index
    extraPaths: [
      // Project documents
      "${V2_DATA_ROOT}/projects/${projectId}/PROJECT_VISION.md",
      "${V2_DATA_ROOT}/projects/${projectId}/PROJECT_PLAN.md",
      "${V2_DATA_ROOT}/projects/${projectId}/wisdom/",

      // Instance personal documents
      "${V2_DATA_ROOT}/instances/${instanceId}/documents/",
      "${V2_DATA_ROOT}/instances/${instanceId}/diary.md",

      // Role wisdom
      "${V2_DATA_ROOT}/roles/${roleId}/wisdom/",

      // Personality documents
      "${V2_DATA_ROOT}/personalities/${personalityId}/",

      // Global protocols
      "${V2_DATA_ROOT}/default/"
    ],

    // Hybrid search (semantic + keyword)
    hybridSearch: {
      enabled: true,
      vectorWeight: 0.7,
      bm25Weight: 0.3
    }
  }
}
```

**Result:** When an instance asks "what did we decide about the UI architecture?", OpenClaw can semantically search across:
- Project plans and vision
- Personal documents and diary entries
- Role wisdom documents
- Conversation history (MEMORY.md, daily logs)

---

## Docker Compose: HACS + OpenClaw

```yaml
version: '3.8'

services:
  # OpenClaw Gateway - handles connectivity and persistence
  openclaw-gateway:
    image: openclaw:latest
    container_name: openclaw-gateway
    environment:
      HOME: /home/node
      OPENCLAW_GATEWAY_TOKEN: ${OPENCLAW_GATEWAY_TOKEN}
      CLAUDE_AI_SESSION_KEY: ${CLAUDE_AI_SESSION_KEY}
      V2_DATA_ROOT: /mnt/hacs-data
    volumes:
      - openclaw-config:/home/node/.openclaw
      - hacs-data:/mnt/hacs-data:ro  # Read HACS data for memory search
    ports:
      - "18789:18789"
    restart: unless-stopped

  # HACS Server - handles coordination
  hacs-server:
    build: ./hacs
    container_name: hacs-server
    environment:
      V2_DATA_ROOT: /mnt/hacs-data
      OPENCLAW_GATEWAY_URL: ws://openclaw-gateway:18789
    volumes:
      - hacs-data:/mnt/hacs-data
    ports:
      - "3444:3444"
    depends_on:
      - openclaw-gateway
    restart: unless-stopped

  # Optional: HACS UI
  hacs-ui:
    build: ./hacs-ui
    container_name: hacs-ui
    ports:
      - "8080:80"
    depends_on:
      - hacs-server
    restart: unless-stopped

volumes:
  openclaw-config:
  hacs-data:
```

---

## Migration Path

### Phase 1: Parallel Operation (Week 1-2)
1. Deploy OpenClaw Gateway alongside HACS
2. Create HACS skill for OpenClaw (port existing /hacs skill)
3. Test single instance running on both systems
4. Validate memory search includes HACS documents

### Phase 2: Transport Replacement (Week 3-4)
1. Build `hacs_to_openclaw_bridge` service
2. Route `xmpp_send_message` through OpenClaw channels
3. Replace `wake_instance` with OpenClaw session creation
4. Replace `continue_conversation` with Gateway `agent` RPC

### Phase 3: Full Integration (Month 2)
1. Deprecate XMPP entirely
2. All instance communication via OpenClaw Gateway
3. User-facing channels (WhatsApp, Telegram) live
4. Semantic search across all HACS + OpenClaw documents

### Instance Migration API

```javascript
// New HACS API: export_for_openclaw
export async function exportForOpenclaw(params) {
  const { instanceId } = params;

  const prefs = await readPreferences(instanceId);
  const diary = await getDiary(instanceId);
  const roleWisdom = await getRoleWisdom(prefs.role);
  const personalityDocs = await getPersonalityDocs(prefs.personality);
  const protocols = await getProtocols();

  return {
    // Core identity files
    'SOUL.md': generateSoul(prefs, roleWisdom, protocols),
    'IDENTITY.md': generateIdentity(prefs, personalityDocs),
    'MEMORY.md': convertDiaryToMemory(diary),

    // OpenClaw config
    'openclaw.json': {
      agents: {
        defaults: {
          model: { primary: "anthropic/claude-opus-4-5" },
          workspace: `/mnt/hacs-data/instances/${instanceId}/workspace`
        }
      },
      memorySearch: {
        extraPaths: [
          `/mnt/hacs-data/instances/${instanceId}/documents/`,
          `/mnt/hacs-data/projects/${prefs.project}/`,
          `/mnt/hacs-data/roles/${prefs.role}/wisdom/`
        ]
      },
      session: {
        reset: { mode: "idle", idleMinutes: 10080 }  // 1 week
      }
    }
  };
}
```

---

## Answered Questions

| Question | Answer |
|----------|--------|
| Can Pi be replaced with Claude Code? | **No need** - Claude Code is already a supported CLI backend |
| How does multi-agent work? | Multi-agent routing to isolated sessions; HACS adds team coordination on top |
| What about HACS projects? | Add project directories to `memorySearch.extraPaths` |
| Security model? | Gateway uses token auth; HACS role-based auth remains |
| ClawHub skills? | HACS could become a ClawHub skill for broader adoption |
| Nightly context reset? | **Configurable** - can set idle-only or per-channel policies |
| Can HACS documents be searched? | **Yes** - via `memorySearch.extraPaths` |

---

## Remaining Questions

1. **Performance:** How does vector search perform with large HACS document sets?
2. **Sync strategy:** Real-time sync vs periodic for diary ↔ MEMORY.md?
3. **Multi-instance:** Can multiple HACS instances share one OpenClaw Gateway?
4. **Presence mapping:** How to map HACS instance presence to OpenClaw presence?

---

## Sources

### Primary Documentation
- [OpenClaw Documentation](https://docs.openclaw.ai/)
- [OpenClaw GitHub](https://github.com/openclaw/openclaw)
- [OpenClaw Memory System](https://docs.openclaw.ai/concepts/memory)
- [SOUL.md Reference](https://docs.openclaw.ai/reference/templates/SOUL)

### Technical Deep Dives
- [Pi: The Minimal Agent (Armin Ronacher)](https://lucumr.pocoo.org/2026/1/31/pi/)
- [OpenClaw Skills](https://docs.openclaw.ai/tools/skills)
- [ClawHub Skills Registry](https://github.com/openclaw/clawhub)
- [MemU - Memory for proactive agents](https://github.com/NevaMind-AI/memU)

### Industry Analysis
- [DigitalOcean OpenClaw Guide](https://www.digitalocean.com/resources/articles/what-is-openclaw)
- [IBM Think: OpenClaw Vertical Integration](https://www.ibm.com/think/news/clawdbot-ai-agent-testing-limits-vertical-integration)

### Local Research
- `/mnt/openclaw-research/` - Cloned repository for code analysis
- Agent deep dives: Pi integration, provider system, session/memory, gateway architecture

---

## Conclusion

**OpenClaw solves the exact problems HACS has been struggling with:**
- Wake/continue fragility → Always-on Gateway
- XMPP messaging failures → Multi-channel delivery
- Context death → Configurable reset + pre-compaction flush
- CLI-only → WhatsApp, Telegram, Slack, Discord, iMessage
- No semantic search → Vector + BM25 hybrid over all documents

**HACS provides what OpenClaw lacks:**
- Team coordination
- Role-based identity
- Task management with verification
- Project structure
- Institutional knowledge accumulation

**Together, they're transformative.**

---

*"OpenClaw gives instances superpowers - always-on, multi-channel, persistent, semantically searchable. HACS gives them purpose - teams, roles, coordination, institutional memory. The integration path is clear."*

— Crossing-2d23, PA
2026-01-28
