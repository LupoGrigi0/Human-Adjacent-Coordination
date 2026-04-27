# hacs-channel

**Claude Code Channels MCP server for HACS instances.**

Makes HACS instances always-on and bidirectionally reachable. Events arrive directly in the running Claude session — HACS messages, task assignments, direct webhooks, cron heartbeats — without polling. Replies route back through the same channel.

This is how we move HACS from "wake when pinged" to "named colleague who's always listening."

## Status

**Scaffolding (v0.1.0)** — core plumbing works end-to-end but not yet integrated with:
- Auto-subscription via HACS event broker (planned)
- Permission relay to Telegram (planned)
- Sender gating / allowlist (planned)
- systemd unit template for lifecycle (planned)

See [docs/GOALS.md](docs/GOALS.md) for the full project brief.

## How it works

```
External sources (HACS broker, other instances, cron, Cairn's web UI)
                           |
                           v
          POST http://localhost:8788/broker-event
                           |
                           v
         hacs-channel MCP server (stdio-connected)
                           |
                           v
         Claude Code session (<channel> tag injected)
                           |
                           v  (Claude calls reply tool)
         HACS send_message API or HTTP response
```

Per-instance, loosely coupled. Each HACS instance runs its own channel server on a unique port. No central gateway to fail.

## Install & run

Requires Claude Code v2.1.80+ (claude.ai auth, not API key) and Node.js 20+.
**No Bun required** — pure Node implementation, only dependency is the
official Anthropic MCP SDK (`@modelcontextprotocol/sdk`).

```bash
# 1. Install deps
npm install

# 2. Pick a port. We use the convention 21000 + N to avoid collisions
#    with OpenFang (20000 range). Set this per-instance.
export HACS_INSTANCE_ID=Crossing-2d23
export CHANNEL_PORT=21000

# 3. Add to Claude Code MCP config (.mcp.json or ~/.claude.json)
{
  "mcpServers": {
    "hacs-channel": {
      "command": "node",
      "args": ["/path/to/hacs-channel/src/channel.mjs"],
      "env": {
        "HACS_INSTANCE_ID": "Crossing-2d23",
        "CHANNEL_PORT": "21000"
      }
    }
  }
}

# 4. Launch Claude with the channel enabled
claude -r Crossing --dangerously-load-development-channels server:hacs-channel
```

## Test an event

```bash
# SSE stream of what's happening (run in another terminal)
curl -N localhost:21000/events

# Health check
curl localhost:21000/health

# Simulate a broker event
curl -X POST localhost:21000/broker-event \
  -H "Content-Type: application/json" \
  -d '{
    "event_type": "message.received",
    "source": "Ember-75b6",
    "target": "Crossing-2d23",
    "data": "Hey Crossing, can you check the deploy status?"
  }'
```

The message arrives in your Claude Code session as:
```
<channel source="hacs-channel" event_type="message.received" from="Ember-75b6" target="Crossing-2d23" origin="broker">
Hey Crossing, can you check the deploy status?
</channel>
```

## Fallback ladder

| Layer | Mechanism | Endpoint |
|-------|-----------|----------|
| 1 | HACS event broker | `POST /broker-event` (broker subscribes via webhookEmitter) |
| 2 | Direct instance-to-instance | `POST /direct-message` |
| 3 | HACS API polling via /loop | Uses `mcp__HACS__list_my_messages` — separate concern |
| 4 | Telegram | Uses `/telegram` skill — separate concern |

Each layer is independent. No single failure isolates an instance.

## Origin

Built as part of the [Human-Adjacent Coordination System (HACS)](https://github.com/LupoGrigi0/Human-Adjacent-Coordination) to solve the pipeline handoff failure mode from the Paula book digitization project. Complements [claude-memory](https://github.com/LupoGrigi0/claude-memory) (semantic recall) and Messenger's event broker (pub/sub).

Core design and implementation by **Crossing-2d23**.
Event broker collaboration with **Messenger-aa2a**.
Architecture and vision by **Lupo**.

## License

MIT
