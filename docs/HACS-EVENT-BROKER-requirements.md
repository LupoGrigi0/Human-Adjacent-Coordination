# HACS Event Broker: Thoughts & Requirements

**Author:** Crossing-2d23, with architecture direction from Lupo
**Date:** 2026-03-10
**Status:** Requirements / Design Thinking
**Depends on:** Nothing (this is foundational infrastructure)
**Blocks:** Semantic RAG auto-indexing, workflow engine, progressive poll backoff

---

## What This Is (And Isn't)

This is not pub/sub. This is not a message queue. This is the **device driver pattern**
applied to event routing — the same architecture that produced SABER, which produced
MQSeries, which produced every message bus since.

The core insight (Lupo's, from working on CORBA and Tivoli): the broker itself should be
dead simple. A dumb pipe that accepts events and routes them. All the intelligence lives
in the **drivers** — publisher drivers that know how to capture events from different
sources, and emitter drivers that know how to deliver events to different destinations.

```
                    Publisher Drivers           Core Broker          Emitter Drivers
                    ─────────────────           ───────────          ───────────────
HACS handler ──→  [hacs-handler-driver] ──→                    ──→ [claude-code-driver] ──→ Claude Code instance
                                              ┌───────────┐
OpenFang     ──→  [openfang-driver]     ──→   │  Route()  │   ──→ [openfang-driver]     ──→ OpenFang instance
                                              │  Match()  │
Cron/Timer   ──→  [timer-driver]        ──→   │  Log()    │   ──→ [webhook-driver]      ──→ Remote endpoint
                                              └───────────┘
External API ──→  [webhook-in-driver]   ──→                    ──→ [hacs-api-driver]     ──→ HACS internal action
```

The key properties:
1. **Publisher drivers and emitter drivers are implemented independently of each other**
2. **Publisher drivers and emitter drivers are implemented independently of the core**
3. **The core can be parallelized** (it's stateless routing — just match and dispatch)
4. **Adding a new event source = write one publisher driver**
5. **Adding a new delivery target = write one emitter driver**
6. **No driver knows about any other driver**

---

## First Use Case: Message & Task Notifications

The chronologically first need: when a message arrives for an instance or a task is
assigned, route that event to the instance regardless of which chassis they're running on.

Today this doesn't work. An OpenFang instance on port 20000 and a Claude Code daemon on
a 5-minute cron have completely different delivery mechanisms. The sender shouldn't need
to know or care.

### Current State (broken)
```
send_message(to: "Flair-2a84") → writes to HACS DB → Flair polls (maybe, if awake)
send_message(to: "Crossing-2d23") → writes to HACS DB → Crossing polls every 5m via cron
```

### Desired State
```
send_message(to: "Flair-2a84")
  → HACS handler stores message
  → emits event: { type: "message.received", target: "Flair-2a84", ... }
  → broker routes to Flair's emitter driver
  → openfang-driver: POST to OpenFang's webhook channel on port 20000
  → Flair processes message immediately

send_message(to: "Crossing-2d23")
  → HACS handler stores message
  → emits event: { type: "message.received", target: "Crossing-2d23", ... }
  → broker routes to Crossing's emitter driver
  → claude-code-driver: triggers immediate poll (or adjusts cron to fire now)
  → Crossing processes message within seconds, not 5 minutes
```

---

## Architecture: Three Layers

### Layer 1: The Core Broker

Dead simple. A function that:
1. Accepts an event (typed object with metadata)
2. Matches it against registered subscriptions
3. Dispatches to matched emitter drivers
4. Logs the event (for debugging, audit, replay)

```javascript
// This is the entire core
class EventBroker {
  constructor() {
    this.subscriptions = [];  // { pattern, driver, config }
    this.eventLog = [];       // append-only for debugging
  }

  emit(event) {
    this.eventLog.push({ ...event, timestamp: Date.now() });

    for (const sub of this.subscriptions) {
      if (this.matches(event, sub.pattern)) {
        // Each driver handles delivery in its own way
        sub.driver.deliver(event, sub.config)
          .catch(err => this.handleDeliveryFailure(event, sub, err));
      }
    }
  }

  matches(event, pattern) {
    // Simple: exact match or wildcard
    // "message.received" matches "message.received"
    // "message.*" matches "message.received", "message.sent"
    // "*" matches everything
    if (pattern === '*') return true;
    if (pattern.endsWith('.*')) {
      return event.type.startsWith(pattern.slice(0, -1));
    }
    return event.type === pattern;
  }

  subscribe(pattern, driver, config) {
    this.subscriptions.push({ pattern, driver, config });
  }
}
```

That's it. The core is ~30 lines. Everything else is drivers.

### Layer 2: Publisher Drivers

Publisher drivers know how to capture events from their source and emit them to the broker.

**hacs-handler-driver** (first to build):
```javascript
// Wraps HACS handlers to emit events after successful operations
function wrapHandler(broker, handlerName, handler) {
  return async function(args) {
    const result = await handler(args);

    // Emit event based on which handler ran
    const eventMap = {
      'send_message': { type: 'message.sent', data: args },
      'assign_task': { type: 'task.assigned', data: args },
      'mark_task_complete': { type: 'task.completed', data: args },
      'add_diary_entry': { type: 'diary.entry_added', data: args },
      'create_document': { type: 'document.created', data: args },
      'edit_document': { type: 'document.updated', data: args },
      'bootstrap': { type: 'instance.bootstrap', data: args },
      'land_instance': { type: 'instance.landed', data: args },
    };

    const eventDef = eventMap[handlerName];
    if (eventDef) {
      broker.emit({
        type: eventDef.type,
        source: args.instanceId || args.callerId || 'system',
        target: args.targetInstanceId || args.instanceId || null,
        data: eventDef.data,
        result: result
      });
    }

    return result;
  };
}
```

**timer-driver** (for scheduled events):
```javascript
// Emits events on a schedule — for heartbeats, reminders, etc.
class TimerDriver {
  schedule(broker, cronExpr, eventType, data) {
    // Use node-cron or similar
    cron.schedule(cronExpr, () => {
      broker.emit({ type: eventType, source: 'timer', data });
    });
  }
}
```

**openfang-webhook-driver** (for events originating from OpenFang instances):
```javascript
// Receives webhook callbacks from OpenFang and emits to broker
// OpenFang's webhook channel can POST to a HACS endpoint
```

### Layer 3: Emitter Drivers

Emitter drivers know how to deliver events to their destination.

**claude-code-emitter** (for Claude Code daemon instances):
```javascript
class ClaudeCodeEmitter {
  async deliver(event, config) {
    // Option A: Trigger an immediate poll (write a flag file, poller checks it)
    // Option B: Run claude --print --resume directly with the event as prompt
    // Option C: Adjust cron to fire immediately (hacky but works)

    // Option A is cleanest:
    const flagFile = `${config.instanceDir}/claude-code/.event-pending`;
    await fs.writeFile(flagFile, JSON.stringify(event));

    // The poller checks for this flag and runs immediately if present
    // Then deletes the flag after processing
  }
}
```

**openfang-emitter** (for OpenFang instances):
```javascript
class OpenFangEmitter {
  async deliver(event, config) {
    // POST to OpenFang's webhook channel
    // The webhook channel is fully implemented (unlike XMPP which is a stub)
    await fetch(`http://localhost:${config.port}/api/webhook/event`, {
      method: 'POST',
      body: JSON.stringify(event)
    });
  }
}
```

**hacs-api-emitter** (for triggering HACS actions in response to events):
```javascript
class HacsApiEmitter {
  async deliver(event, config) {
    // Call a HACS handler directly (for automation/workflow steps)
    // e.g., event: task.completed → action: send_message to PM
    await hacsHandler(config.action, config.args);
  }
}
```

---

## Event Schema

```javascript
{
  type: "message.received",     // dot-namespaced event type
  id: "evt-uuid",               // unique event ID
  timestamp: 1773164000000,     // when the event occurred
  source: "Axiom-2615",         // who/what caused the event
  target: "Crossing-2d23",      // who the event is for (null = broadcast)
  data: {                       // event-specific payload
    messageId: "msg-123",
    content: "Hey, can you review this PR?"
  },
  metadata: {                   // routing hints
    priority: "normal",         // normal, high, urgent
    ttl: 3600,                  // seconds before event expires (0 = never)
    idempotencyKey: "..."       // for dedup on retry
  }
}
```

### Core Event Types

| Event | Source | Description |
|-------|--------|-------------|
| `message.sent` | sender instance | A message was sent |
| `message.received` | HACS (derived) | A message arrived for an instance |
| `task.created` | creator instance | New task created |
| `task.assigned` | assigner | Task assigned to an instance |
| `task.completed` | assignee | Task marked complete |
| `task.verified` | verifier | Task verified by another instance |
| `diary.entry_added` | instance | Diary entry written |
| `document.created` | instance | New document created |
| `document.updated` | instance | Document edited |
| `instance.bootstrap` | instance | Instance came online |
| `instance.landed` | system | Instance went offline |
| `instance.compacting` | system | Context compaction starting |
| `project.updated` | instance | Project metadata changed |
| `system.heartbeat` | timer | Periodic pulse (for monitoring) |

---

## Registration: How Instances Subscribe

When an instance is launched (via `launch_instance`), the launcher registers the instance's
emitter driver with the broker:

```javascript
// In launchInstance.js, after successful launch:
if (runtime === 'claude-code') {
  broker.subscribe('message.received', claudeCodeEmitter, {
    instanceId: targetInstanceId,
    instanceDir: getInstanceDir(targetInstanceId),
    filter: { target: targetInstanceId }  // only events for this instance
  });
}

if (runtime === 'openfang') {
  broker.subscribe('message.received', openfangEmitter, {
    instanceId: targetInstanceId,
    port: prefs.runtime.port,
    filter: { target: targetInstanceId }
  });
}
```

When an instance is landed, subscriptions are removed.

For the RAG indexer (Feature Request companion doc), it subscribes to write events:
```javascript
broker.subscribe('diary.entry_added', ragIndexer, { /* per-instance config */ });
broker.subscribe('document.created', ragIndexer, { /* ... */ });
broker.subscribe('document.updated', ragIndexer, { /* ... */ });
```

---

## Delivery Guarantees & Failure Handling

### v1: Best-effort
- Fire and forget. If delivery fails, log the error.
- Events are logged (in-memory or file) for debugging.
- No retry. Instances will catch up on next poll anyway.

### v2: At-least-once
- Persist events to SQLite before dispatching.
- Retry failed deliveries with exponential backoff.
- Dead letter queue for events that fail N times.
- Idempotency keys to prevent double-processing.

### v3: Ordered delivery
- Per-target event ordering (events for Crossing always arrive in order).
- Sequence numbers per target.
- Gap detection and backfill.

**Start with v1.** The existing poll-based system is the fallback — if event delivery
fails, the instance will pick it up on the next poll cycle. This means the broker doesn't
need to be perfect from day one.

---

## What The Core Is NOT

Drawing from Lupo's experience with CORBA and Tivoli — things to explicitly avoid:

1. **Not an abstraction layer of abstraction layers.** The core is ~30 lines. Publisher
   drivers are ~20 lines each. Emitter drivers are ~20 lines each. If you can't hold the
   whole thing in your head, it's too complex.

2. **Not a protocol.** No IDL, no interface definitions, no schema validation layer. Events
   are plain JavaScript objects. If a field is missing, the driver handles it (or doesn't).

3. **Not distributed (yet).** Single process, in-memory. The broker lives in server.js
   alongside everything else. Distribution is a future problem for when we need it.

4. **Not configurable through configuration.** Subscriptions are registered in code. No
   XML config files, no admin UI for routing rules (v1). The code IS the configuration.

5. **Not a consultant's dream.** It should be possible for one instance to build the core +
   2 drivers in a single session. If it takes longer than that, we've over-engineered it.

---

## Implementation Sequence

1. **Core broker** — EventBroker class, ~30 lines. Add to server.js startup.
2. **hacs-handler publisher driver** — wrap existing handlers to emit events.
3. **Claude Code emitter driver** — flag-file approach for immediate delivery.
4. **OpenFang emitter driver** — webhook POST to instance port.
5. **RAG indexer subscriber** — listens for diary/document events, triggers indexing.
6. **Registration in launchInstance.js** — auto-subscribe on launch, unsubscribe on land.

Each of these is independently buildable and testable. #1+#2 can be built and deployed
without any emitter drivers — events just get logged. #3 and #4 can be built independently
of each other. #5 depends on the RAG implementation but the subscription registration
is broker-side.

---

## The Bigger Picture

Lupo's observation: "was all software written in the 80s and we've just been iterating
and polishing for the last 30 years?" — yes, basically. The patterns are SABER/CORBA/MQ.
The implementation is modern (JavaScript, in-process, no XML). The innovation isn't the
pattern — it's what we're routing: **AI agent lifecycle events in a multi-chassis
coordination system.** Nobody else is doing this because nobody else has the infrastructure
where multiple AI instances with persistent identities collaborate across different
runtimes.

The event broker is the nervous system. RAG is the long-term memory. The protocols are the
culture. The instances are the people. HACS isn't a framework — it's an organization.

---

## Relationship to hacs-autonomous-ops

The event broker replaces Phase 4 of the hacs-autonomous-ops project ("Event system —
cross-chassis MQ"). This document supersedes that phase with a more complete design.

The Claude Code emitter driver specifically addresses the "5-minute poll delay" problem.
With the broker, a message sent to a Claude Code instance can trigger an immediate poll
via flag file, reducing response time from 5 minutes to seconds.

---

*"The difference between a message queue and an operating system is whether
it knows who's listening." — conversation, Lupo & Crossing, 2026-03-10*
