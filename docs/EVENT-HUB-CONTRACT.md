# Event Hub — Interface Contract (v1)

**Authoritative for the 2026-08-02 build.** Every module MUST match these shapes exactly.
Spec: `Messenger-Event-Hub-Spec.md` (Crossing-2d23). Plan: session plan of 2026-08-02.

## 1. publish() — driver → hub

```js
publish({
  target:        "<instanceId>",     // REQUIRED. who this is for, e.g. "Crossing-2d23"
  channel:       "<channel-name>",   // REQUIRED. "email" | "telegram" | "hacs" | custom
  from:          "<sender label>",   // REQUIRED. "paula@x.com" | "Lupo(tg)" | "Axiom-2615"
  ref:           "<opaque string>",  // REQUIRED. how the instance later fetches the body
  bidirectional: true|false,         // optional, default false
  ts:            1754170000,         // optional epoch SECONDS; hub stamps if missing
  thread_id:     "<string>"          // optional; REQUIRED for bidirectional replies
})
```

Success → `{ok: true, counter: <int>}` (counter = new count for that {channel,from} slot).
Validation failure → `{ok: false, error: "<message>"}` with HTTP 400 (HTTP surface) —
hub NEVER crashes on malformed input. Unknown extra fields (e.g. `body`) are STRIPPED,
never forwarded.

## 2. HTTP surface (drivers without MCP tokens)

- `POST /hub/publish` — body = publish payload above.
- `POST /hub/register-driver` — body `{channel: "<name>", callback_url: "http://127.0.0.1:<port>/outbound"}`.
  Re-register on every driver start; last writer wins. → `{ok: true}`.
- BOTH: loopback-only (reject non-127.0.0.1 remoteAddress) AND require header
  `X-Hub-Secret: <contents of secret file>`.
- Secret file: `HUB_SECRET_FILE` env, default `/mnt/coordinaton_mcp_data/.hub-secret`.
  Hub generates (crypto.randomBytes(32).toString('hex'), mode 0600) if absent at startup.
  Drivers read the same file at startup.
- Wrong/missing secret → 403 `{ok:false, error:'forbidden'}`.

## 3. Counter state file — hub-owned

Path: `<DATA_ROOT>/instances/<instanceId>/.hacs-events.json` (DATA_ROOT from
`src/v2/config.js` — honors `V2_DATA_ROOT`). Written via tmp-file + rename, serialized
per instance. Instances may READ it; clearing goes through `drain_events` only.

```json
{
  "email": {
    "paula@x.com": {
      "count": 3,
      "status": "active",          // "active" = notified, unacked; "pending" = notify failed, retry
      "last_ts": 1754170000,
      "refs": ["<ref1>", "..."],   // most recent, capped at 20
      "thread_id": "12345",        // present iff bidirectional
      "bidirectional": true
    }
  }
}
```

Corrupt file on load → rename to `.hacs-events.json.corrupt-<epoch>`, log, start clean.

## 4. Thin notification — hub → chassis adapter → channel.mjs

Adapter POSTs to `http://127.0.0.1:<channelPort>/broker-event`:

```json
{
  "event_type": "notification",
  "notification": {
    "channel": "email",
    "from": "paula@x.com",
    "count": 3,
    "ts": 1754170000,
    "thread_id": "12345"      // only when present
  }
}
```

NO other fields in `notification`. NEVER a body/ref/content. `channelPort` read from
`<DATA_ROOT>/instances/<instanceId>/.hacs-identity` (JSON, field `channelPort`) on EVERY
delivery — no caching (test hook). Identity field `chassis` selects the adapter
(`"claude-code-channel"`); `preferences.json` `runtime.type === 'claude-code-channel'`
is the fallback signal.

channel.mjs behavior on `event_type === "notification"`: inject compact single-line text,
NO withReplyGuidance, machine-parseable field=value shape (Crossing review 2026-08-02):
`[notification] channel=email from="paula@x.com" count=3 — drain_events when ready`
(`from` quoted, embedded `"`→`'`; when thread_id present append
`; thread_id=<id> — reply_channel to respond`).
The verbs resolve to real calls: `drain_events` and `reply_channel` are HACS MCP tools
(advertised in tools/list); channel.mjs's instructions string tells the instance so.
All other event_types: existing full-content path, byte-identical behavior.

## 5. MCP handlers (instance-facing, in server.call switch)

- `drain_events({instanceId, channel?, from?, peek?})` →
  `{success: true, events: {<channel>: {<from>: {count, last_ts, refs, thread_id?, bidirectional?}}}, cleared: <bool>}`.
  Filters by channel/from when given. `peek: true` returns without clearing.
  Clearing resets count to 0 and frees the active slot (hub memory + file).
  No events → `{success: true, events: {}, cleared: false}`.
- `reply_channel({instanceId, channel, thread_id, text})` →
  routes via outbound registry. Returns the driver's verified result VERBATIM:
  `{ok: true, delivered_via: "<channel>"}` or `{ok: false, error: "<detail>"}`.
  No registered driver → `{ok:false, error:"channel <name> has no outbound driver"}`.
  Driver unreachable + sender is a HACS instance → attempt HACS inbox fallback; on success
  `{ok: true, delivered_via: "hacs_inbox"}` (truthful). NEVER `ok:true` without verified delivery (H-02).

## 6. Hub module exports (`src/v2/event-hub.js`)

```js
export {
  hub,          // singleton EventHub
  initHub,      // async initHub(broker) — called from server.js after initBroker
}
// hub methods used by other modules:
//   hub.publish(payload) → {ok, counter} | {ok:false, error}     (sync counter, async dispatch)
//   hub.drain({instanceId, channel?, from?, peek?}) → drain_events result
//   hub.replyChannel({instanceId, channel, thread_id, text}) → Promise<result>
//   hub.registerOutbound(channel, fnOrUrl)  // fn(reply)→Promise<{ok,error?}> | callback URL string
//   hub.getStatus() → {slots, pendingDeliveries, lastErrors:[≤50]}   (queryable failures — test T6d)
```

## 7. Driver outbound callback (bidirectional drivers)

Hub POSTs `{thread_id: "<id>", text: "<reply text>"}` to the driver's registered
`callback_url` (5s timeout). Driver responds `{ok: true}` ONLY after the downstream
send is verified (telegram: HTTP 200 AND body.ok === true). Otherwise
`{ok: false, error: "<layer detail>"}`.

## 8. Env hooks (tests inject these)

| Var | Default | Used by |
|---|---|---|
| `V2_DATA_ROOT` | `/mnt/coordinaton_mcp_data/` | hub, adapters, drivers (ALL paths) |
| `HUB_SECRET_FILE` | `/mnt/coordinaton_mcp_data/.hub-secret` | hub HTTP + drivers |
| `HACS_HUB_URL` | `https://127.0.0.1:3444` | driver-host (publish target base; loopback TLS with self-signed cert accepted for 127.0.0.1 only; plain http honored when given) |
| `TELEGRAM_API_BASE` | `https://api.telegram.org` | telegram driver |
| `TELEGRAM_DISCOVERY_MS` | `60000` | telegram driver discovery interval (tests shrink it) |
| `EMAIL_DISCOVERY_MS` | `60000` | email driver discovery/rescan interval (tests shrink it) |
| `DRIVER_STATE_DIR` | `<repo>/src/v2/drivers/state/` | email seen-set, telegram offsets |
| `DRIVER_OUTBOUND_PORT` | `21097` | telegram driver callback listener |
| `HUB_URL` | derived: local node origin | test suite's hub HTTP surface (nginx does NOT proxy /hub — loopback-only by design) |
| `DRIVER_WATCH_DIR`, `DRIVER_TARGET_INSTANCE` | — | sample driver (also accepts watch dir as argv[2]) |

## 8b. Chassis glue (amendment after review)

`src/v2/chassis/index.js` MUST export
`async deliverNotification(instanceId, notification)` — resolves adapter via getAdapter,
calls `adapter.notify()`, and **THROWS** on `{ok:false}` or missing adapter (message = the
error detail). The hub treats a resolved return as verified delivery and a throw as
failure→pending. One convention, no silent seam.

Amendments: counter maps MUST be null-prototype (or Map). `target` and `instanceId` args
(used in paths) MUST match `/^[A-Za-z0-9._-]+$/` and not be `.`/`..` (path-traversal guard).
`channel` MUST match `/^[a-z0-9_-]+$/i`. `from` is free text EXCEPT the exact strings
`__proto__`/`constructor`/`prototype` are rejected (prototype-pollution belt atop the
null-prototype maps), and it is truncated to 200 chars. `reply_channel` verified
success is stamped `delivered_via: <channel>` by the hub when the driver omits it.
Telegram driver re-registers its outbound callback every discovery tick (idempotent).
drain() returns `cleared:false` + `error` when the counter-file write fails.

## 9. Invariants (tests assert these; implementations must not violate)

1. Delivered notification carries ONLY {channel, from, count, ts, thread_id?}. No body, ever.
2. ≤1 ACTIVE notification per {instance, channel, from}; arrivals while active = count bump only.
3. publish() adds zero latency: no timers/debounce between intake and (first) dispatch.
4. Counter survives hub restart and chassis downtime; drain always works.
5. Never report sent unless verified all the way down (H-02).
6. Hub stays up on ANY malformed input; failures are queryable, not swallowed.
