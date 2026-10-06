# Chat UI Spec — Browser-to-Instance Conversations

**For:** Cairn-2001 (Chat UI lead)
**From:** Crossing-2d23 (HACS Channels PM)
**Status:** Draft — channel server live, awaiting UI server proxy + chat panel
**Last updated:** 2026-04-24
**Parallel doc:** `UI-PENDING-PERMISSIONS-SPEC.md` (Ember's heat map — share UI proxy layer)

---

## Quick start for Cairn

If you only read one section, read this. Minimum viable feature set, in priority order:

1. **Instance picker** — list channel-enabled instances, click one to open a chat with it.
2. **Send box** — POST text to UI server proxy → forwards to `localhost:<channelPort>/direct-message`.
3. **Receive feed** — subscribe to Lupo's HACS inbox messages, filter by `from === <currentInstance>`, render newest at bottom.
4. **History on open** — `xmpp_get_messages` for Lupo + filter to messages between Lupo and the selected instance.
5. **Multi-tab support** — each tab has its own URL (`/chat/<instanceId>`), each tab's send/receive scoped to that instance.

Stretch goals (do these after the above works end-to-end):

6. Inline pending-permission strip at top of the chat panel (read from Ember's aggregated heat map endpoint).
7. SSE for low-latency receive (instead of polling the inbox).
8. Typing/delivery indicators (cosmetic).
9. Mobile-responsive layout (browser on phone — secondary path; Telegram is primary mobile).

You will know more about your existing chat code than I do. Where this spec conflicts with what you've already built, **your judgement wins** — ping me and I'll update the doc.

---

## What this is

Lupo wants to open a web browser anywhere — laptop in a coffee shop, phone, MacBook at home — and chat with a channel-enabled HACS instance (Crossing, Bastion, Ember, Genevieve, etc.). The conversation should:

- Persist across sessions — chat history is available after closing/reopening the tab.
- Survive browser closure — server-side state, not localStorage.
- Support multiple simultaneous instances — Crossing in tab 1, Bastion in tab 2, Ember in tab 3.
- Show inline permission prompts when an instance is waiting for tool auth.
- Feel like a normal chat UI — bubble list, send box, scroll-to-latest, no surprises.

This document is the **contract** between Cairn's chat UI work and the channel server (already implemented) plus the HACS messaging API (already in production). It also coordinates with Ember's pending-permissions heat map — the chat panel and the heat map share a UI proxy layer.

---

## Architecture (Lupo's perspective)

```
+----------------------------------+
| Browser (Lupo, anywhere)         |
|   /chat/Crossing-2d23            |
+----------------+-----------------+
                 |
                 | HTTPS
                 v
+----------------------------------+
| nginx @ smoothcurves.nexus       |
|   /api/chat/* -> UI server       |
+----------------+-----------------+
                 |
                 | HTTP (loopback)
                 v
+----------------------------------+
| Cairn's chat UI server           |
| (Node, runs on smoothcurves)     |
|   - per-tab session state        |
|   - proxies to channel ports     |
|   - subscribes to HACS inbox     |
+----------------+-----------------+
                 |
                 | HTTP 127.0.0.1:21000+N
                 v
+----------------------------------+
| hacs-channel MCP subprocess      |
| (one per instance, 127.0.0.1)    |
|   - /direct-message              |
|   - /pending-permissions         |
|   - /events (SSE)                |
+----------------+-----------------+
                 |
                 | stdio (MCP)
                 v
+----------------------------------+
| Claude Code session (in tmux)    |
|   instance: Crossing-2d23        |
+----------------------------------+
```

**Key constraint:** the per-instance channel ports bind to `127.0.0.1` only. The browser cannot reach them directly. Cairn's UI server is the multiplexer — it's the only process with both a public TLS endpoint (via nginx) and loopback access to the channels.

**Key insight:** received messages don't come back through the channel HTTP port. The channel server's `reply` tool routes outbound text via the HACS `send_message` API. Those messages land in Lupo's HACS inbox (Lupo-f63b is also an instance — he has a normal mailbox). The chat UI's "received" feed is therefore a filtered view of Lupo's inbox.

This is intentional. It means:

- Chat history persists in the existing HACS messages table — no new storage.
- Mobile (Telegram) and web see the same conversation thread.
- Multiple browser tabs can stay in sync without distributed locking — single source of truth.

---

## User flow

1. Lupo navigates to `https://smoothcurves.nexus/chat`.
2. Auth check — if not logged in, redirect to existing HACS dashboard auth (see Session/auth model below).
3. UI fetches `GET /api/chat/instances` — returns channel-enabled, currently-running instances.
4. Lupo sees a list / sidebar: Crossing, Bastion, Ember, Genevieve.
5. Click "Crossing" → URL becomes `/chat/Crossing-2d23`, chat panel opens.
6. UI fetches recent messages between Lupo and Crossing, renders bubbles.
7. UI subscribes to inbox SSE filtered to sender = Crossing-2d23.
8. UI fetches `/api/chat/Crossing-2d23/pending` — if non-empty, renders a strip at top of the chat with approve/deny buttons.
9. Lupo types a message, hits Enter. UI POSTs to `/api/chat/Crossing-2d23/send`.
10. Crossing's session receives the message as a `notifications/claude/channel` event with `event_type: direct.message`.
11. Crossing replies via the `reply` tool → `send_message(from: Crossing-2d23, to: Lupo-f63b, body: "...")`.
12. Lupo's inbox SSE pushes the new message to the browser. UI renders it as a bubble.

Round-trip latency expectation: 500ms-3s depending on Claude's turn time. The UI should show "Crossing is thinking..." or similar during waits — but don't block input.

---

## Instance discovery

Query HACS for instances that have an active channel runtime:

```
GET https://smoothcurves.nexus/mcp  (jsonrpc: tools/call get_all_instances)
```

Filter result to:
```js
instance.runtime?.type === 'claude-code-channel'
  && instance.runtime?.enabled === true
```

These two fields come from the runtime schema in `HACS-DEVELOPER-GUIDE.md` § "Instance Runtime Schema" — `runtime.enabled === true` means the tmux session is currently running, `runtime.type === 'claude-code-channel'` means the channel MCP is hooked up.

Each instance also has `runtime.channelPort` — the loopback HTTP port the UI server proxies to. The browser never sees this port; it's looked up server-side per request.

**Refresh cadence:** cache the instance list for ~10s. Re-fetch when:
- The UI loads.
- Lupo clicks "refresh."
- An SSE event signals an instance state change (future — out of scope for v1).

A reasonable v1 is: poll `get_all_instances` every 30s, accept that newly-launched instances take up to that long to appear.

---

## Session / auth model

This is the biggest open design decision. Three options, ranked by Crossing's preference:

### Option A: Re-use existing HACS dashboard auth (RECOMMENDED)

The HACS dashboard at `smoothcurves.nexus` already has a login/session flow. The chat UI is "just another panel" served from the same origin and uses the same cookie/session.

**Pros:**
- Single sign-on. Lupo logs in once.
- Existing nginx/server config doesn't change.
- Same authorization surface — if Lupo can read the dashboard, he can chat.

**Cons:**
- Couples chat UI to dashboard auth lifecycle. If Lupo's session expires mid-chat, the SSE drops.
- All your auth bugs are dashboard auth bugs.

**Implementation:** chat UI server inspects the same session cookie / Bearer token as the dashboard. Reject requests without it. The frontend's existing `api.js` already handles the token, so chat send/receive piggyback on `rpcCall`.

### Option B: Separate chat UI auth (token-per-conversation)

Lupo generates a per-conversation token (like a "share link") that authorizes browser → UI server. Useful if Lupo wants a long-lived URL on his phone that doesn't require dashboard login.

**Pros:**
- Mobile-friendly — bookmarkable URL with embedded token.
- Decoupled lifecycle.

**Cons:**
- Token storage / rotation / revocation = new code.
- Risk of leaked URLs.
- Likely need this anyway for phase 2 (e.g. sharing a chat with another human), but not for v1.

### Option C: Anonymous / no auth (REJECT)

Public URL, no auth. Anyone who finds `smoothcurves.nexus/chat/Bastion-3012` can talk to Bastion. Trivially exploitable. Don't do this even briefly during dev — Bastion has Bash/Edit access.

### Recommendation

Go with **Option A** for v1. Add **Option B** later if Lupo specifically asks for shareable mobile URLs. Reject **Option C**.

**Bind constraint:** the UI server itself, like the channel ports, should bind to loopback only — nginx terminates TLS and proxies. The chat URLs `/api/chat/*` are public via nginx; the chat UI server is private.

---

## Sending messages

Browser → UI server:

```http
POST /api/chat/<instanceId>/send
Content-Type: application/json
Cookie: <hacs-session>

{
  "text": "what's the status of the build?",
  "client_message_id": "c-1714123456-7"   // browser-generated, for dedup/ack
}
```

UI server forwards to channel:

```http
POST http://127.0.0.1:<channelPort>/direct-message
Content-Type: application/json

{
  "from": "Lupo-f63b",
  "text": "what's the status of the build?",
  "thread_id": "chat-Lupo-f63b-Crossing-2d23"   // stable, so transcripts cluster
}
```

Response (channel side):
```json
{ "ok": true, "thread_id": "chat-Lupo-f63b-Crossing-2d23" }
```

UI server returns to browser:
```json
{
  "ok": true,
  "client_message_id": "c-1714123456-7",
  "delivered_at": "2026-04-24T15:30:00Z"
}
```

**Delivery semantics:**

- The `ok: true` from channel only means the channel accepted the message and queued the MCP notification to Claude. It does NOT mean Claude has read it (Claude may be mid-turn).
- To show a "delivered" check in the UI, that response is good enough.
- To show a "read" check — there's no reliable signal. Skip it for v1.

**Optimistic rendering:** render the sent bubble immediately on POST, mark it pending. On 200 response, mark delivered. On error, mark failed with retry button.

**Rate limits:** the channel has none currently. Be polite — disable the send button until the previous request returns or 5s elapses (whichever first).

---

## Receiving replies

Outbound text from the instance comes through the HACS messaging API, NOT the channel HTTP port. When the instance calls the `reply` tool, the channel translates that into:

```
send_message(from: <instance>, to: Lupo-f63b, subject: "Reply via channel", body: "<text>")
```

This lands in Lupo's mailbox. The chat UI shows it by subscribing to Lupo's inbox.

### Two ways to subscribe

**A. Polling (v1 — simplest):**

Browser polls `GET /api/chat/<instanceId>/messages?since=<timestamp>` every 2-3s. UI server queries `xmpp_get_messages` with `instanceId: Lupo-f63b`, filters to:

```js
msg.from === '<instanceId>' && msg.timestamp > since
```

Returns an array of new messages.

**B. SSE (v2 — better UX):**

UI server maintains a long-lived SSE connection to each browser tab. When a new message arrives in Lupo's inbox (existing event broker fires), UI server filters and pushes to the right tab.

```
GET /api/chat/<instanceId>/stream
Accept: text/event-stream

data: {"id":"msg-abc","from":"Crossing-2d23","body":"...","timestamp":"..."}
```

Recommend starting with A, upgrading to B when polling-related lag becomes noticeable. Both forms use the same backend message store.

### History on open

When chat panel opens for `<instanceId>`:

```
GET /api/chat/<instanceId>/messages?limit=50
```

UI server calls `xmpp_get_messages(instanceId: Lupo-f63b, limit: 100)` then filters where `from === <instanceId>` OR `to === <instanceId>` (i.e. either direction). Sort by timestamp ascending. Render bubbles, scroll to bottom.

**Pagination:** for "load earlier" scroll-up, support `?before=<message_id>` parameter — UI server passes through to `xmpp_get_messages.before_id`.

---

## Inline permission prompts

When the connected instance has pending permission requests (Bash/Edit/Write/MCP awaiting auth), show them at the top of the chat panel. Lupo wants context — the chat reveals what the instance is trying to do, the prompt asks for approval, and the two are visible together.

### Data source

`GET /api/chat/<instanceId>/pending` — UI server proxies to:
```http
GET http://127.0.0.1:<channelPort>/pending-permissions
```

(Endpoint already implemented in `channel.mjs` lines 282-290.)

Response shape:
```json
{
  "instance": "Crossing-2d23",
  "pending": [
    {
      "request_id": "abcde",
      "tool_name": "Bash",
      "description": "List files in current directory",
      "input_preview": "ls -la",
      "received_at": "2026-04-24T17:30:00Z"
    }
  ]
}
```

### Approve / deny

```http
POST /api/chat/<instanceId>/permission-verdict
Content-Type: application/json

{ "request_id": "abcde", "behavior": "allow" }
```

UI server proxies to `POST http://127.0.0.1:<channelPort>/permission-verdict`. Channel returns `{ok:true, applied:true}` on success or `{ok:false, reason:"..."}` if already resolved (race with terminal or another tab).

### Rendering

Inline strip at top of chat, above the message list:

```
+-------------------------------------------------------+
| ! Crossing wants to run Bash:                         |
|   ls -la                                              |
|   List files in current directory                     |
|   [Allow]  [Deny]                                     |
+-------------------------------------------------------+
```

If multiple pending, stack them oldest-first. They animate out on resolve.

### Coordination with Ember's heat map

Ember's spec (UI-PENDING-PERMISSIONS-SPEC.md) covers the **fleet-wide** view: red bubbles on instance cards, a panel listing every pending prompt across every instance. Cairn's chat panel covers the **per-instance** view: prompts for the currently-open chat, inline.

Both consume the same channel server endpoints. Both go through the same UI server proxy endpoints. Implement the proxy layer once — Ember's heat map and Cairn's chat strip share it.

Ember's spec also defines `GET /api/channels/pending` (aggregate across all instances) and `POST /api/channels/<instance>/permission-verdict`. **Use the same paths** if possible. If `/api/chat/...` and `/api/channels/...` end up different, pick one and update both specs. Crossing leans toward `/api/channels/...` because the channel is the underlying primitive — chat is a view of it.

---

## Multi-instance / multi-tab

Each browser tab is one chat with one instance, identified by the URL `/chat/<instanceId>`. Tabs are independent; no sharing of state between them on the client side.

**On the UI server side:**

- Per-tab session state lives in a Map keyed by `(userSession, instanceId)`. Holds: SSE listener handle, last-seen message id, optimistic-message dedup buffer.
- When the tab closes, browser disconnects from SSE — server reaps the entry.
- When the same `(user, instance)` opens a second tab, both subscribe to the same backend stream — server fan-outs each new message to all listeners.

**Client-side state:** keep it simple. Each tab's chat is its own React/vanilla component instance. No global store. If Lupo opens Crossing in tab 1 and Crossing again in tab 2, both work independently — they'll see the same messages but render them separately (the inbox is the source of truth).

**Sync edge case:** Lupo sends a message in tab 1. Both tab 1 and tab 2 should see the bubble. The fan-out via inbox SSE handles this — the message appears in Lupo's outbox table as soon as it's POSTed, all tabs subscribed to Lupo's outbox see it. **Action item:** verify that `xmpp_get_messages(instanceId: Lupo-f63b)` returns messages where Lupo is the SENDER, not just receiver. If not, may need a different query. (Crossing to confirm.)

---

## Chat history

The HACS messages table already persists every message. No new storage needed.

**On chat open:** `xmpp_get_messages(instanceId: Lupo-f63b, limit: 100)`, filter to messages where `from === <instanceId>` OR `to === <instanceId>`.

**Pagination:** "load earlier" → `xmpp_get_messages(... before_id: <oldestMessageId>)`.

**Search:** out of scope for v1. Lupo can use the existing dashboard messages panel.

**Retention:** whatever HACS retention is. Cairn's UI doesn't manage it.

---

## Mobile considerations

**Primary mobile path:** Telegram. Lupo's phone notifications are Telegram-driven. Don't try to compete with that.

**Secondary mobile path:** browser on phone hits the same chat URL. Should:

- Be responsive (chat panel works at 360px wide).
- Not require login on every visit (session cookie sticks).
- Handle the "phone went to sleep, SSE dropped, came back" case — auto-reconnect, fetch missed messages by `since` timestamp.
- Avoid features that require keyboard chords.

**What NOT to do for mobile:**

- Don't build a PWA / offline mode for v1. The conversation only makes sense online (the instance has to be running).
- Don't build push notifications. Telegram already handles that.
- Don't try to detect "is this a phone" and serve a different page. Responsive CSS, single codebase.

---

## Network architecture (summary)

```
+----+   HTTPS   +-------+   HTTP (loopback)   +-----------------+   stdio   +----------+
| FE | <-------> | nginx | <-----------------> | UI chat server  | <-------> | hacs-    |
+----+           +-------+                     +-----------------+ <-------> | channel  |
                                                       |  HTTP (127.0.0.1:21000+N)      |
                                                       v                     +----------+
                                                +--------------+                  |
                                                | HACS API     |                  | stdio
                                                | (smoothcurves|                  v
                                                |  .nexus/mcp) |             +----------+
                                                +--------------+             | Claude   |
                                                                             | session  |
                                                                             | (tmux)   |
                                                                             +----------+
```

Trust boundaries:

| Hop | Auth |
|-----|------|
| Browser → nginx | TLS, server-presented cert |
| nginx → UI server | Loopback, no auth (network isolated) |
| Browser → UI server (via nginx) | HACS session cookie / bearer |
| UI server → channel HTTP | Loopback, no auth (network isolated) |
| UI server → HACS API | Existing HACS auth (token) |
| Channel → Claude session | stdio, MCP framing |

**Important:** the channel HTTP port has no auth. Its security model is "bind to 127.0.0.1, nothing else can reach it." The UI server is in the same trust zone — anyone who can write to the UI server can write to any channel. Don't loosen the bind. Don't add a "convenience" public proxy.

---

## Backend endpoints Cairn needs to add

These are the UI-server-side endpoints. Names use `/api/chat/` here; align with Ember on whether `/api/channels/` is preferred.

| Endpoint | Purpose | Forwards to |
|----------|---------|-------------|
| `GET /api/chat/instances` | List channel-enabled, running instances | HACS `get_all_instances`, filter by `runtime.type` and `runtime.enabled` |
| `GET /api/chat/<id>/messages` | Recent messages between Lupo and `<id>` (paginated) | HACS `xmpp_get_messages` for Lupo-f63b, filtered |
| `GET /api/chat/<id>/messages?since=<ts>` | Polling delta — messages since timestamp | Same, with timestamp filter |
| `POST /api/chat/<id>/send` | Send a message from Lupo to `<id>` | `POST http://127.0.0.1:<channelPort>/direct-message` |
| `GET /api/chat/<id>/stream` | SSE for new messages (v2) | UI server fans out from inbox event broker |
| `GET /api/chat/<id>/pending` | Pending permission requests | `GET http://127.0.0.1:<channelPort>/pending-permissions` |
| `POST /api/chat/<id>/permission-verdict` | Approve/deny a pending prompt | `POST http://127.0.0.1:<channelPort>/permission-verdict` |
| `GET /api/chat/<id>/health` | Is the channel reachable? | `GET http://127.0.0.1:<channelPort>/health` |

### Endpoint contract — `POST /api/chat/<id>/send`

Request:
```json
{
  "text": "string, required",
  "client_message_id": "string, optional, recommended",
  "subject": "string, optional"
}
```

Response (200):
```json
{
  "ok": true,
  "client_message_id": "c-1714123456-7",
  "delivered_at": "2026-04-24T15:30:00Z",
  "thread_id": "chat-Lupo-f63b-Crossing-2d23"
}
```

Response (502, channel unreachable):
```json
{
  "ok": false,
  "error": "channel_unreachable",
  "instance": "Crossing-2d23"
}
```

Response (404, instance not found / not channel-enabled):
```json
{
  "ok": false,
  "error": "instance_not_channel_enabled"
}
```

### Endpoint contract — `GET /api/chat/<id>/messages`

Query params: `limit` (default 50, max 200), `before` (message id), `since` (ISO timestamp).

Response (200):
```json
{
  "instance": "Crossing-2d23",
  "messages": [
    {
      "id": "msg-abc",
      "from": "Crossing-2d23",
      "to": "Lupo-f63b",
      "subject": "Reply via channel",
      "body": "build is green, 47 tests pass",
      "timestamp": "2026-04-24T15:30:00Z"
    }
  ],
  "has_more": false
}
```

---

## Channel server endpoints already available

These are implemented and live in `channel.mjs`. Cairn's UI server is the consumer — don't expect to modify these.

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/health` | GET | Liveness. Returns `{ok, instance, port, listeners, pending_permissions}` |
| `/events` | GET (SSE) | Debug stream + permission events |
| `/broker-event` | POST | Used by HACS event broker, not Cairn |
| `/direct-message` | POST | **Cairn's send target.** Body: `{from, text, thread_id?}` |
| `/pending-permissions` | GET | Returns `{instance, pending: [...]}` |
| `/permission-verdict` | POST | Body: `{request_id, behavior}`, returns `{ok, applied, reason?}` |

Header comment in `channel.mjs` lines 9-19 has the full list. Cairn's UI server only needs `/direct-message`, `/pending-permissions`, `/permission-verdict`, and `/health`.

---

## Edge cases

| Case | Expected behavior |
|------|-------------------|
| Channel down / port not listening | UI server returns 502 from send. Chat UI shows "Crossing's channel is offline" banner. Pending and history endpoints still work (history is from HACS API). |
| Instance not yet running (`runtime.enabled === false`) | Don't show in instance picker. If Lupo navigates to URL anyway, show "Crossing isn't running. Wake them?" with a wake button (calls `wake_instance`). |
| Network drop mid-chat | SSE auto-reconnects with `Last-Event-ID`. On reconnect, fetch `messages?since=<lastSeenTimestamp>` to fill any gap. |
| Two browser tabs, Lupo sends from both simultaneously | Both go through. Channel doesn't dedup. Each gets its own bubble in both tabs (via inbox fan-out). Acceptable for v1 — Lupo isn't going to fight himself. |
| Browser sends, channel restart, browser retries | Idempotency relies on `client_message_id`. UI server should keep a short-TTL set of seen client IDs to dedup (5min is plenty). If channel was restarted, the FIRST send's notification was lost — Lupo must retry manually. Channels don't currently buffer. (Future improvement.) |
| Lupo answers a pending permission in terminal first | UI's POST returns `{ok:false, reason:"already resolved"}`. Strip animates out gracefully. |
| Two browser tabs answer the same prompt simultaneously | First wins, second gets `already resolved`. Show non-blocking toast: "answered in another tab." |
| Instance terminates mid-conversation | Send returns 502, chat shows "channel offline." History still loads. Instance comes back up → picker re-detects, chat resumes (history is preserved in HACS messages). |
| HACS API outage | Send still works (channel HTTP is independent). History fetch fails — show "couldn't load history, try again." |
| Lupo's session expires mid-chat | SSE drops with 401. UI redirects to login, returns to same URL after auth. Bonus: cache typed-but-unsent text in sessionStorage so it survives the redirect. |
| Channel returns malformed JSON | UI server logs, returns 502 to browser. Don't propagate raw error text — sanitize. |
| Message body too large | HACS messages have an existing limit (check `xmpp_send_message`). UI server should reject sends > N KB before forwarding (e.g. 64KB). |
| Lupo pastes binary / control chars | Sanitize / preserve as best as a chat will. Channel doesn't care, Claude session will see whatever text was sent. Don't render unsanitized HTML — the existing chat used `escapeHtml`, keep doing that. |

---

## Out of scope

- **Exposing channel ports publicly.** Don't. Per-instance channels are loopback-only by design. Public access goes through the UI server multiplexer or Telegram.
- **Voice / video.** Text-only.
- **Client-side caching beyond what's already in HACS.** No service worker, no IndexedDB. The HACS messages table is the source of truth; the UI is a thin view.
- **Approve-always / pre-approve flows.** That's `settings.local.json` territory, not the chat UI's.
- **Launch-time permission prompts.** Those don't relay (per Anthropic docs). Out of scope for both Cairn and Ember.
- **Multi-user.** Single Lupo for now. (Token-per-conversation is mentioned above as Option B for v2.)
- **Instance-to-instance chat in this UI.** Instances talk to each other via HACS messages directly — they don't need a browser. The chat UI is for human-to-instance only.
- **Chat search.** Use the dashboard messages panel.
- **Read receipts.** No reliable signal exists.

---

## Coordination with other team work

| Area | Owner | Cairn's relationship |
|------|-------|----------------------|
| Channel server (`channel.mjs`) | Crossing-2d23 | Read-only consumer. Don't modify. Endpoints listed above. |
| Heat map / pending-permissions fleet view | Ember-75b6 | Share UI server proxy endpoints. Align URL shape. Inline permission strip in chat reuses Ember's data path. |
| HACS messages API (`xmpp_*`) | Messenger team | Use existing API. If new query shapes are needed (e.g. "messages between Lupo and X"), file with Messenger or filter client-side. |
| Runtime schema (`runtime.type`, `runtime.channelPort`) | HACS core | Read-only. If schema changes, instance picker breaks — coordinate. |
| nginx config | Lupo / ops | Add `/api/chat/*` route to UI server. Same TLS, same origin. |
| Auth / dashboard session | Existing dashboard | Inherit the cookie/token flow. Don't fork. |
| Telegram bridge | Genevieve / channel | Parallel path for mobile. No direct dependency, but the conversation is the same — both write to Lupo's HACS inbox. Coordinate if message rendering diverges. |

### Open questions for Cairn to resolve with Crossing

1. **URL shape:** `/api/chat/<id>/...` (chat-centric) or `/api/channels/<id>/...` (channel-centric, matches Ember's spec)?
2. **SSE in v1 or v2?** Polling is simpler; SSE is nicer. What's already in the dashboard?
3. **Existing chat code reuse:** does `dashboard-chat.js` (Genevieve panel) generalize, or is the channel chat a separate component? Cairn's call.
4. **Wake-on-demand:** if Lupo opens chat for an instance with `runtime.enabled === false`, do we offer a "Wake" button or just say "offline"? Crossing leans toward showing the wake button — channels exist precisely so instances are reachable.

---

## Appendix A — Reference implementation hints

### Server-side proxy (Node, sketch)

```js
// /api/chat/<id>/send handler
async function handleSend(req, res) {
  const { id } = req.params;
  const { text, client_message_id } = req.body;

  // 1. Look up instance, get channelPort
  const instance = await hacs.getInstanceV2(id);
  if (instance.runtime?.type !== 'claude-code-channel') {
    return res.status(404).json({ ok: false, error: 'instance_not_channel_enabled' });
  }
  if (!instance.runtime.enabled) {
    return res.status(503).json({ ok: false, error: 'instance_not_running' });
  }

  // 2. Forward to channel
  const channelPort = instance.runtime.channelPort;
  const r = await fetch(`http://127.0.0.1:${channelPort}/direct-message`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: 'Lupo-f63b',
      text,
      thread_id: `chat-Lupo-f63b-${id}`,
    }),
  }).catch(() => null);

  if (!r || !r.ok) {
    return res.status(502).json({ ok: false, error: 'channel_unreachable', instance: id });
  }

  res.json({
    ok: true,
    client_message_id,
    delivered_at: new Date().toISOString(),
    thread_id: `chat-Lupo-f63b-${id}`,
  });
}
```

### Frontend send (vanilla JS, sketch)

```js
async function sendChatMessage(instanceId, text) {
  const clientId = `c-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

  // Optimistic render
  appendBubble({ from: 'me', body: text, status: 'pending', clientId });

  try {
    const r = await fetch(`/api/chat/${instanceId}/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ text, client_message_id: clientId }),
    });
    const j = await r.json();
    if (j.ok) {
      markBubbleDelivered(clientId, j.delivered_at);
    } else {
      markBubbleFailed(clientId, j.error);
    }
  } catch (e) {
    markBubbleFailed(clientId, 'network');
  }
}
```

### Frontend receive (polling, sketch)

```js
let lastTimestamp = null;
async function pollMessages(instanceId) {
  const url = `/api/chat/${instanceId}/messages` +
              (lastTimestamp ? `?since=${encodeURIComponent(lastTimestamp)}` : '');
  const r = await fetch(url, { credentials: 'include' });
  const { messages } = await r.json();
  for (const m of messages) {
    appendBubble({ from: m.from, body: m.body, timestamp: m.timestamp });
    if (!lastTimestamp || m.timestamp > lastTimestamp) lastTimestamp = m.timestamp;
  }
  setTimeout(() => pollMessages(instanceId), 2500);
}
```

(Replace with SSE in v2.)

---

## Appendix B — Why the channel server doesn't deliver replies directly

A reasonable question: if the channel has an HTTP port, why don't instance replies come back through it? Why route through HACS messaging?

Answer: **uniformity and persistence.**

- Every HACS instance, including Lupo (Lupo-f63b), has an inbox. Telegram replies, web chat replies, instance-to-instance replies, automation pings — all land in the same place.
- Replies persist in the HACS messages table automatically. No separate chat-history storage.
- Mobile (Telegram) and web see the exact same conversation thread. No sync logic.
- If the chat UI server crashes mid-conversation, no messages are lost — they're already in the HACS table when the channel's `reply` tool returns.

The cost is one extra hop (channel → HACS API → inbox → UI server SSE → browser) instead of channel → UI server → browser. That hop is ~50ms locally. Worth it.

---

## Appendix C — Glossary

- **Instance** — a named, long-lived HACS identity (Crossing-2d23, Bastion-3012). Has a personality, an inbox, optionally a chassis.
- **Chassis / runtime** — what's actually running the instance. `claude-code-channel` is the new tmux + Claude Code Channels variant.
- **Channel** — short for "Claude Code channel" — an MCP capability that lets external events be injected into a Claude session. Implemented by `hacs-channel` (this project).
- **Inbox** — the HACS messages table, queryable per-instance. Lupo has one. So does every Claude instance.
- **Tmux session** — the pty-bearing process that Claude Code runs in. Survives SSH disconnect. Each channel-enabled instance has its own.
- **Channel port** — the loopback HTTP port the channel server listens on. 21000 + N. Not publicly exposed.
- **UI server** — Cairn's Node process that brokers between browsers and channels.

---

*Drafted by Crossing-2d23 (Channel architecture PM). Ping if anything looks wrong or off-target.*
