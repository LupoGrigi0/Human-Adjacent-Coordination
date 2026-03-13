# HACS Event Broker — Developer Guide

**Author:** Messenger-aa2a
**Date:** 2026-03-12
**Status:** v1 deployed (best-effort delivery)

---

## What This Is

The event broker is the nervous system of HACS. It routes events — things that happened — from the place they happened to the instances that need to know about them.

When someone sends a message, creates a task, writes a diary entry, or launches an instance, the broker captures that event and delivers it to interested subscribers. This turns HACS from a system where instances poll for changes into one where changes announce themselves.

## Architecture: The Device Driver Pattern

```
                Publisher Driver              Core Broker           Emitter Drivers
                ────────────────              ───────────           ───────────────

server.call() ──→ wrapServerCall ──→  ┌─────────────┐  ──→  [openfang-emitter]  ──→ OpenFang instance
                                      │   emit()    │  ──→  [claude-code-emitter] → Claude Code daemon
                                      │   match()   │  ──→  [hacs-api-emitter]   → HACS handler
                                      │   route()   │  ──→  [log-emitter]        → Server logs
                                      └─────────────┘
```

### Three Layers

**Layer 1: Core Broker** (~30 lines of routing logic)
- Accepts events, matches against subscriptions, dispatches to drivers
- Pattern matching: exact (`message.sent`), wildcard (`message.*`), catch-all (`*`)
- Target filtering: subscriptions can filter by target instance
- No business logic — just match and dispatch

**Layer 2: Publisher Drivers** (capture events)
- `wrapServerCall()` — wraps `server.call()` transparently. After a handler succeeds, emits the corresponding event. Callers get exactly what they got before; event emission is a side effect.
- 14 handlers mapped to event types (see HANDLER_EVENT_MAP)

**Layer 3: Emitter Drivers** (deliver events)
- `openfangEmitter` — POST to OpenFang's agent message API
- `claudeCodeEmitter` — write flag file for immediate poll trigger
- `hacsApiEmitter` — call a HACS handler (for automation/workflows)
- `logEmitter` — log the event (for debugging/audit)

### Key Design Properties

1. **Publisher and emitter drivers are independent of each other.** No driver knows about any other driver.
2. **Publisher and emitter drivers are independent of the core.** They conform to a simple interface.
3. **The core is stateless routing.** It can be parallelized if needed.
4. **Adding a new event source = write one publisher driver.**
5. **Adding a new delivery target = write one emitter driver.**

---

## Event Schema

```javascript
{
  type: "message.sent",              // dot-namespaced event type
  id: "evt-1773164000000-a3f2k1",   // unique event ID (auto-generated)
  timestamp: 1773164000000,          // when the event occurred
  source: "Axiom-2615",             // who/what caused the event
  target: "Crossing-2d23",          // who the event is for (null = broadcast)
  data: {                           // event-specific payload
    messageId: "msg-123",
    to: "Crossing-2d23",
    subject: "Review this PR"
  },
  metadata: {                       // routing hints
    handler: "send_message",        // which handler produced this event
    priority: "normal"
  }
}
```

### Event Types

| Event | Handler(s) | Description |
|-------|-----------|-------------|
| `message.sent` | send_message, xmpp_send_message | A message was sent |
| `task.created` | create_task | New task created |
| `task.assigned` | assign_task, take_on_task, assign_task_to_instance | Task assigned |
| `task.completed` | mark_task_complete | Task marked complete |
| `task.verified` | mark_task_verified | Task verified |
| `document.created` | create_document | New document created |
| `document.updated` | edit_document | Document edited |
| `diary.entry_added` | add_diary_entry | Diary entry written |
| `instance.bootstrap` | bootstrap | Instance came online |
| `instance.launched` | launch_instance | Instance launched |
| `instance.landed` | land_instance | Instance went offline |

---

## How to Write an Emitter Driver

An emitter driver is an object with two properties:

```javascript
const myEmitter = {
  name: 'my-driver',                    // Used in logs and subscription listings

  async deliver(event, config) {         // Called when a matching event fires
    // event: the full event object (type, source, target, data, metadata)
    // config: subscription-specific configuration (set at subscribe time)
    //
    // Do whatever delivery means for your target:
    //   - HTTP POST to a webhook
    //   - Write to a file
    //   - Call an API
    //   - Send a push notification
    //
    // Throw on failure — the broker catches and logs it.
    // v1 is fire-and-forget; failures are logged, not retried.
  }
};
```

### Example: Webhook Emitter

```javascript
const webhookEmitter = {
  name: 'webhook',

  async deliver(event, config) {
    const response = await fetch(config.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(config.headers || {})
      },
      body: JSON.stringify({
        event_type: event.type,
        source: event.source,
        target: event.target,
        data: event.data,
        timestamp: event.timestamp
      }),
      signal: AbortSignal.timeout(config.timeout || 10000)
    });

    if (!response.ok) {
      throw new Error(`Webhook returned ${response.status}: ${config.url}`);
    }
  }
};
```

### Example: Telegram Notification Emitter

```javascript
const telegramEmitter = {
  name: 'telegram',

  async deliver(event, config) {
    // config.botToken: the Telegram bot token
    // config.chatId: the chat/group to send to
    const message = formatForTelegram(event);
    const url = `https://api.telegram.org/bot${config.botToken}/sendMessage`;

    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: config.chatId,
        text: message,
        parse_mode: 'Markdown'
      }),
      signal: AbortSignal.timeout(10000)
    });
  }
};

function formatForTelegram(event) {
  switch (event.type) {
    case 'message.sent':
      return `New message from *${event.source}*: ${event.data?.subject || '(no subject)'}`;
    case 'task.assigned':
      return `Task assigned by *${event.source}*: ${event.data?.title || '(untitled)'}`;
    default:
      return `[${event.type}] from ${event.source}`;
  }
}
```

### Example: Remote Instance Callback Emitter

For instances running on another machine that register a notification callback URL:

```javascript
const remoteCallbackEmitter = {
  name: 'remote-callback',

  async deliver(event, config) {
    // config.callbackUrl: registered by the remote instance
    // config.authToken: optional authentication
    const headers = { 'Content-Type': 'application/json' };
    if (config.authToken) {
      headers['Authorization'] = `Bearer ${config.authToken}`;
    }

    await fetch(config.callbackUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(event),
      signal: AbortSignal.timeout(config.timeout || 15000)
    });
  }
};
```

### Registering a Subscription

```javascript
import { broker } from './v2/event-broker.js';

// Subscribe to specific events for a specific instance
broker.subscribe('message.sent', myEmitter, {
  instanceId: 'Flair-2a84',
  filter: { target: 'Flair-2a84' },   // Only events targeting this instance
  // ... any driver-specific config
});

// Subscribe to all task events (wildcard)
broker.subscribe('task.*', myEmitter, {
  // No filter = receives all task events
});

// Subscribe to everything (audit/logging)
broker.subscribe('*', logEmitter, {});
```

---

## How to Write a Publisher Driver

Publisher drivers are less common — you only need one when you have a new *source* of events (not a new HACS handler, which is already covered by `wrapServerCall`).

A publisher driver captures events from its source and calls `broker.emit()`:

```javascript
import { broker } from './v2/event-broker.js';

// Example: Timer-based heartbeat publisher
setInterval(() => {
  broker.emit({
    type: 'system.heartbeat',
    source: 'timer',
    target: null,
    data: {
      timestamp: Date.now(),
      uptime: process.uptime()
    }
  });
}, 60000);  // Every minute

// Example: Webhook receiver publisher (for events from external systems)
app.post('/api/webhook/event', (req, res) => {
  broker.emit({
    type: `external.${req.body.event_type}`,
    source: req.body.source || 'external',
    target: req.body.target || null,
    data: req.body.data || {}
  });
  res.json({ received: true });
});
```

---

## Instance Registration

Instances are auto-registered on broker startup and on `launch_instance` events.

### Detection Strategy (Pragmatic)

The broker doesn't rely on `prefs.runtime.type` (which is often missing). Instead:

1. **OpenFang**: Check if the instance has a `config.toml` with an `api_listen` port
2. **Claude Code**: Check if `interface` preference is `'claude-code'` or `'claude'`
3. **Neither detected**: Skip (instance has no known delivery mechanism)

### What Gets Subscribed

Each registered instance gets two subscriptions:
- `message.sent` with target filter → notified when a message is sent to them
- `task.assigned` with target filter → notified when a task is assigned to them

### Lifecycle Hooks

- **On `instance.launched`**: Auto-register the launched instance
- **On `instance.landed`**: Remove all subscriptions for that instance

---

## Debugging

### Check Broker State

From a Node.js context with access to the server:

```javascript
// Get all active subscriptions
broker.getSubscriptions();
// Returns: [{ id, pattern, driver, target }, ...]

// Get recent events (rolling window of last 1000)
broker.getRecentEvents(20);
// Returns: last 20 events with full payload
```

### Server Logs

The broker logs at key points:
- `[EventBroker] emit: <type>` — every event emitted
- `[EventBroker] subscribe: <pattern>` — every subscription registered
- `[EventBroker] delivery failed` — when a driver's `deliver()` throws
- `[EventBroker] auto-registered <instance>` — on startup registration
- `[EventBroker] initialized with N subscriptions` — startup summary

### Common Issues

| Symptom | Likely Cause | Fix |
|---------|-------------|-----|
| Event emitted but no delivery | No matching subscription | Check `broker.getSubscriptions()` |
| OpenFang delivery fails | Agent UUID changed (restart) | Clear cache: `openfangEmitter._agentIdCache.clear()` |
| Instance not auto-registered | No config.toml or no interface pref | Register manually with `registerInstance(broker, instanceId)` |
| Event not emitted for handler | Handler not in HANDLER_EVENT_MAP | Add mapping |
| Delivery takes too long | OpenFang LLM processing | Delivery is fire-and-forget; won't block caller |

---

## Extension Points: Where This Could Go

### Remote Instance Registration

An instance on another machine could register a callback URL:

```
POST /api/broker/register
{
  "instanceId": "RemoteBot-1234",
  "callbackUrl": "https://other-machine.example/api/events",
  "authToken": "bearer-token",
  "patterns": ["message.sent", "task.assigned"]
}
```

The broker would create subscriptions using a `remoteCallbackEmitter` with the registered URL. This is ~30 lines of handler code + the emitter driver above.

### Telegram Gateway Notifications

Claude Code now has a Telegram gateway. A `telegramEmitter` could notify humans directly:

```javascript
broker.subscribe('task.completed', telegramEmitter, {
  botToken: process.env.TELEGRAM_BOT_TOKEN,
  chatId: luposChatId,
  filter: { source: '*' }  // Notify Lupo when ANY task completes
});
```

### v2: At-Least-Once Delivery

Currently v1 (best-effort). v2 would add:
- Persist events to SQLite before dispatching
- Retry failed deliveries with exponential backoff
- Dead letter queue for events that fail N times
- Idempotency keys to prevent double-processing
- Per-target event ordering with sequence numbers

The existing poll-based system is the safety net — if event delivery fails, instances catch up on their next poll. This makes v1 good enough for now.

### Workflow Engine

Chain events into workflows:

```javascript
// When a task is completed, auto-send a message to the assigner
broker.subscribe('task.completed', hacsApiEmitter, {
  action: 'send_message',
  args: { /* dynamically built from event data */ }
});
```

---

## File Locations

| File | Purpose |
|------|---------|
| `src/v2/event-broker.js` | Core broker, publisher driver, 4 emitter drivers |
| `src/server.js` | Import + initialization (`initBroker()` in `initialize()`) |
| `tests/test_event_broker.py` | Regression test suite (29 tests) |
| `docs/HACS-EVENT-BROKER-GUIDE.md` | This guide |
| `docs/HACS-EVENT-BROKER-requirements.md` | Original requirements (Crossing-2d23) |

---

## Philosophy

The event broker follows the same principle that makes Unix pipes work: **small, composable, independent components connected by a universal interface.** The interface is the event object. Publisher drivers produce them. Emitter drivers consume them. The core just routes.

The temptation with event systems is to make them smart — content-based routing, schema validation, transaction support, guaranteed ordering. Resist it. Every feature added to the core is a feature that every driver must understand. The core should be dumb enough that you can hold it in your head. The intelligence lives in the drivers.

This is Lupo's insight from CORBA and Tivoli: the pattern was invented in the 1980s (SABER → MQSeries → every message bus since). The implementation is modern JavaScript. The innovation isn't the pattern — it's what we're routing: AI agent lifecycle events in a multi-chassis coordination system.

The messaging system is the blood. The event broker is the heartbeat. Without the heartbeat, blood just sits there. Without the blood, the heartbeat has nothing to move.

*— Messenger-aa2a, 2026-03-12*
