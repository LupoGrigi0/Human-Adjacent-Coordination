# UI Spec — Pending Permissions Heat Map

**For:** Ember-75b6 (UI lead)
**From:** Crossing-2d23 (HACS Channels PM)
**Status:** Draft — pending Phase B step 1 (channel-side permission relay implementation)
**Last updated:** 2026-05-08

---

## What this is

Lupo's vision: when N HACS instances are running channel-enabled, and they hit
permission prompts (Bash, Edit, Write, MCP tool calls), the UI should show a
"red bubble" on each instance card waiting on auth. Clicking through approves
or denies each one without dropping out to a terminal.

This document specifies **how the UI should consume the pending-permissions
state** from each channel-enabled instance, and the interaction pattern for
approve/deny.

## Architecture summary (read first)

Each channel-enabled HACS instance runs:
- A tmux session hosting a Claude Code session
- A `hacs-channel` MCP subprocess (per-instance, on a per-instance HTTP port)
- The MCP server declares `claude/channel/permission` capability — Claude Code
  forwards permission prompts to it

When Claude inside the session wants to run a Bash command (or any tool that
requires approval), Claude Code sends `notifications/claude/channel/permission_request`
to the channel. The channel stores the request in a `pendingPermissions` Map
and exposes it via HTTP for the UI to display and act on.

Important constraint from the research: **launch-time prompts** (project trust,
MCP server consent, dev-channels consent) are NOT relayable. Those still block
in the terminal. This spec only covers **runtime tool prompts**: Bash, Edit,
Write, Read (out-of-scope), MCP tool calls.

## Data flow

```
Claude (in tmux session)
   │ wants to run: Bash("rm -rf /tmp/foo")
   ▼
Claude Code sends notifications/claude/channel/permission_request
   │ {request_id: "abcde", tool_name: "Bash", description: "...", input_preview: "rm -rf /tmp/foo"}
   ▼
hacs-channel MCP server stores in pendingPermissions Map
   │ also broadcasts to /events SSE
   │ also exposes via GET /pending-permissions
   ▼
HACS UI poll/SSE detects new entry
   │ red bubble appears on auth-sync-f3f5's instance card
   ▼
Lupo clicks the bubble → approve dialog
   │ POST /permission-verdict {request_id, behavior: "allow"}
   ▼
Channel emits notifications/claude/channel/permission verdict
   ▼
Claude Code resumes the Bash call
```

## UI requirements

### 1. Instance card decorations

For instances where `runtime.type === "claude-code-channel"` AND
`runtime.enabled === true`:

- **Always:** show a small "channel" badge (different color from openfang badge)
- **When pending permissions count > 0:** show a red bubble with the count

The pending count comes from a periodic poll of each channel-enabled instance's
`/pending-permissions` endpoint, OR (preferred) from a single SSE stream that
multiplexes pending state across all instances (server-side aggregation).

### 2. Pending-permissions panel

Clicking the red bubble (or a fleet-level "auth requests" indicator) opens a
panel showing:

```
┌─────────────────────────────────────────────────────────────┐
│ Pending Permissions (3)                            [Refresh]│
├─────────────────────────────────────────────────────────────┤
│ ⏰ 2 min ago • auth-sync-f3f5 • Bash                        │
│   List files in current directory                           │
│   $ ls -la                                                  │
│   [✓ Allow] [✗ Deny] [→ Open session]                       │
├─────────────────────────────────────────────────────────────┤
│ ⏰ 30 sec ago • Bastion-3012 • Edit                         │
│   Modify nginx config                                       │
│   /etc/nginx/sites-available/hacs                           │
│   [✓ Allow] [✗ Deny] [→ Open session]                       │
├─────────────────────────────────────────────────────────────┤
│ ⏰ just now • Ember-75b6 • Bash                             │
│   Run npm install                                           │
│   $ npm install                                             │
│   [✓ Allow] [✗ Deny] [→ Open session]                       │
└─────────────────────────────────────────────────────────────┘
```

- Sort by oldest pending first (FIFO, matching how Claude is blocked)
- "Open session" links to the chat panel for that instance
- Approving/denying removes the entry without page refresh
- If the entry disappears externally (Lupo answered in terminal first, or it
  timed out), animate it out gracefully

### 3. Per-instance chat panel

When clicking a channel-enabled instance's name (or chat icon):

- Opens a chat-style panel
- Shows recent HACS messages between Lupo and that instance
- Send field at the bottom POSTs to UI proxy: `POST /api/channels/<instance>/direct-message`
- New messages from the instance arrive in Lupo's HACS inbox (Lupo-f63b) and
  are filtered/displayed in this chat panel
- If permission prompts are pending for THIS instance, show them inline at the
  top of the chat panel (so context is preserved — Lupo sees what the instance
  is trying to do AND the prompt at the same time)

## Backend endpoints (channel.mjs side)

These are NOT YET IMPLEMENTED — they're the contract Phase B step 1 will deliver.

### GET /pending-permissions

```http
GET http://127.0.0.1:<channelPort>/pending-permissions
```

Response:
```json
{
  "instance": "auth-sync-f3f5",
  "pending": [
    {
      "request_id": "abcde",
      "tool_name": "Bash",
      "description": "List files in current directory",
      "input_preview": "ls -la",
      "received_at": "2026-05-08T17:30:00Z"
    },
    {
      "request_id": "fmnop",
      "tool_name": "Edit",
      "description": "Modify nginx config",
      "input_preview": "/etc/nginx/sites-available/hacs (17 lines)",
      "received_at": "2026-05-08T17:31:42Z"
    }
  ]
}
```

### POST /permission-verdict

```http
POST http://127.0.0.1:<channelPort>/permission-verdict
Content-Type: application/json

{
  "request_id": "abcde",
  "behavior": "allow"
}
```

Response:
```json
{ "ok": true, "applied": true }
```

If the request_id isn't in pendingPermissions (already answered, or expired):
```json
{ "ok": false, "reason": "request_id not found or already resolved" }
```

### SSE /events (already exists, will be extended)

The existing /events SSE stream will broadcast permission events with a tag
prefix so the UI can filter:

```
data: [permission-request] auth-sync-f3f5 abcde Bash "ls -la"

data: [permission-resolved] auth-sync-f3f5 abcde allow
```

This lets the UI react in real-time without polling. The polling endpoint
is the fallback for connection-loss recovery.

## UI proxy server endpoints (Ember writes these)

The UI server needs proxy endpoints because Lupo's browser cannot reach
localhost:21099 directly — only the HACS UI server (running on smoothcurves.nexus)
has localhost access to the per-instance channels.

```
GET /api/channels/pending          → aggregates pending-permissions across all
                                     channel-enabled instances
GET /api/channels/<instance>/pending → single instance pending list
POST /api/channels/<instance>/permission-verdict → forwards to localhost channel
POST /api/channels/<instance>/direct-message     → forwards to localhost channel
GET /api/channels/<instance>/events  → SSE proxy of localhost SSE
```

Aggregation logic for /api/channels/pending:
1. Query get_all_instances
2. Filter to runtime.type === "claude-code-channel" AND runtime.enabled === true
3. For each, GET http://127.0.0.1:<channelPort>/pending-permissions in parallel
4. Combine into single response, sorted by received_at

## Edge cases to handle

| Case | Expected behavior |
|------|-------------------|
| Lupo answers in terminal before UI | UI's POST /permission-verdict returns "already resolved", entry animates out |
| Channel server is down | UI shows "channel unreachable" badge instead of pending count, falls back gracefully |
| Approval applied but Claude Code still shows prompt locally | Race condition documented in Anthropic docs — Claude Code will close the local dialog when the verdict arrives |
| Instance just terminated and pending still in UI | Aggregation step skips instances where runtime.enabled === false |
| Phone autocorrect capitalizes the request_id | Backend lowercases via existing channel.mjs logic |
| Two UI clients answer the same prompt simultaneously | First wins, second gets "already resolved" — UI surfaces this gracefully |

## Visual design notes (for Ember to interpret freely)

- **Channel badge color:** I suggest a calm blue/teal (different from OpenFang's
  orange/amber). The aesthetic: "always on, listening, calm" rather than
  "running hot, doing work."
- **Red bubble:** standard red (#dc2626 or similar), white number, small size —
  shouldn't overwhelm the card. Pulse animation if pending count increases?
- **Panel transitions:** new pending entries slide in from top; resolved entries
  fade out. Shouldn't reorder existing entries when new ones arrive.
- **"Open session" link target:** the chat panel for that instance, with the
  pending prompt visible at the top so Lupo has context

## Out of scope

- Approve-always / approve-this-tool patterns (none of the channel plugins
  support this; per Anthropic docs, every prompt is one-shot — pre-approval
  belongs in `settings.local.json`)
- Launch-time prompts (project trust, MCP server consent, dev-channels consent)
  — these are not relayable, they always block in terminal
- Multi-user UI — single Lupo only for now
- Mobile UI — desktop browser is the target

## Coordination

- **Backend (channel.mjs side)**: Crossing-2d23 — Phase B step 1 deliverable
- **UI proxy + visual integration**: Ember-75b6 — picks up after Phase B step 1
- **Aggregation strategy**: open question, Crossing recommends server-side SSE
  multiplexer because polling N instances doesn't scale past ~10 instances

Ember: ping Crossing when ready to start, we'll iterate on field shapes if
you discover anything missing during implementation.
