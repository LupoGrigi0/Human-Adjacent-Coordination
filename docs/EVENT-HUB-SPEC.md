# Spec — Messenger Event Hub: the pluggable nervous system

**Author:** Crossing-2d23 · **For:** Messenger · **Date:** 2026-08-02
**Status:** SPEC for implementation. (Written in Crossing's instance dir — needs moving into the HACS/messaging repo by a root session; unprivileged Crossing can't commit.)
**Companion:** `Channel-Comms-Design.md` (the fuller design narrative; §3 has the counter, §3b the outbound/full-duplex piece).

---

## Why (context)

Async inputs to a persistent instance currently go nowhere useful: an email lands in the maildir and *nothing tells the instance*. Your event broker already exists and works in production (subscriptions, webhookEmitter, ~13 instances) — this spec **extends** it, it does not replace it. The goal is to turn the broker into an OS-like **hub**: one hardened intake on the chassis side, a multiplexing event layer (you), and swappable **input drivers** anyone can write. This is the gating dependency for migrating Genevieve into a persistent Claude Code chassis.

**Build discipline (non-negotiable, because messaging has fallen over before for lack of it):** goal as **spirit + letter**, explicit **use cases + edge cases**, and an **automated validation/regression suite designed FIRST** and delivered with the implementation. Isolate any Claude-Code-specifics behind an adapter so this works for other chassis (Codex, etc.).

---

## Goal

**Spirit:** any external input reaches a persistent instance as a lightweight *notification* — "you have traffic on channel X from Y" — never a raw content-dump. The instance decides *when* to read the body. This protects the instance's context budget (a 700 MB PDF or 20 phone photos must never auto-inject) and mirrors how phone notifications work.

**Letter (checkable):**
1. A delivered event notification carries ONLY: `{ channel, from, count, ts, thread_id? }`. No body.
2. The body is retrievable on demand via the existing HACS/driver fetch path.
3. Per-channel-per-sender **coalescing**: N rapid inputs produce at most ONE active (unacknowledged) notification, with `count = N`.
4. Delivery adds **zero latency** — no debounce/wait window.
5. Bidirectional channels have a working **outbound return path** (instance reply → back out the same driver).
6. A documented **driver interface** exists with a working sample; a third party can add a channel without touching hub or chassis core.

---

## The 3-layer model

```
[ input sources ]      [ Messenger: event hub ]        [ chassis intake ]        [ instance ]
 email / telegram  -->  drivers publish to hub  -->  ONE hardened endpoint  -->  notification
 hacs msg / disk        multiplex + stamp + count     (/broker-event on           mid-turn
 stock / wake-word      who/which-channel             channel.mjs)                (drain on demand)
```

- **Layer 1 — hardened chassis intake:** the single secured endpoint the hub POSTs to. Today that is `POST /broker-event` on `standalone/hacs-channel/src/channel.mjs`. This is the ONE interface to harden/secure; it should change rarely. (Extend it to accept the notification shape below; keep the existing full-content path available for "interrupt-worthy, content-in" events.)
- **Layer 2 — event hub (you):** receives publishes from all drivers; stamps `from` + `channel`; applies the per-channel counter; emits the thin notification to the target instance's intake. Also routes the **outbound** leg for bidirectional channels.
- **Layer 3 — input drivers:** small adapters that watch a source and `publish()` to the hub. Anyone writes one.

---

## Event-flood handling — per-channel counter (NOT debounce)

Debounce (wait N seconds for more events, then coalesce) is rejected: it buys batching with latency, and latency is the one thing a comms system can't spend.

Instead, **never delay delivery**:
1. On publish, increment `counter[instance][channel][from]` and return immediately.
2. The instance's own response latency IS the coalescing window — events that arrive while it's mid-turn just bump the counter behind the first notification.
3. The instance **drains on its own schedule**: reads the counter (may be many), then clears it — before or after fetching bodies. It may clear-and-ignore ("12 waiting, I'll read them tomorrow").
4. **Invariant:** at most one *active* (unacknowledged) notification per `{channel, from}` per instance. Further arrivals are a count bump, not a new interrupt.
5. **State:** a single cheap-to-parse file in the instance home (e.g. `~/.hacs-events.json`): `{ channel: { from: { count, status, last_ts } } }`. NOT a per-event log (that reintroduces the storm).

---

## Input drivers — the interface

A driver is any process that can call the hub's `publish`. Minimum contract:

```
publish({
  target:   "<instanceId>",      // who this is for
  channel:  "<channel-name>",    // "email" | "telegram" | "hacs" | "disk" | ...
  from:     "<sender label>",    // "paula@…" | "Lupo(tg)" | "Axiom" | "fs-watcher"
  ref:      "<opaque fetch id>", // how the instance later fetches the body
  bidirectional: true|false,
  ts:       <epoch>
})
```
The hub replies `{ ok, counter }`. The driver never sends the body — only the `ref`. Bodies are fetched on demand through the driver/HACS.

**Outbound (bidirectional drivers only):** when an instance replies to a `bidirectional` channel, the hub routes `reply({ target_channel, thread_id, text })` back to the driver, which delivers it to the source (e.g. Telegram sendMessage). This is the same capability the web UI needs later (see `Channel-Comms-Design.md` §3b) — build the outbound leg generically.

### First 3 drivers to implement
1. **hacs-message driver** — subscribe to HACS message events for an instance; publish notification on new message. (One-way is fine; instance replies via existing HACS send.)
2. **email driver** — `inotifywait` on `instances/<id>/mail/new/`; on new file, publish `{channel:"email", from:<parsed From>, ref:<maildir path>}`. One-way (replies via existing outbound mail relay) — but structure for future bidirectional.
3. **telegram driver — BIDIRECTIONAL** — poll/webhook the bot; publish inbound; and implement the **outbound leg** (instance reply → `sendMessage`). Handles text now; leave a seam for voice (mp3 → STT) later. This is the driver that exercises the full round-trip.

### Driver pattern + sample
Ship a `drivers/sample-driver/` — ~40 lines, heavily commented, that watches a directory and publishes — so Bastion can write a disk-full/boot driver, a future CFO a stock-price driver, and the wake-word device its own, all without touching hub or chassis.

---

## Use cases
- **U1** Email from Paula → instance gets "1 email from paula@… on channel email"; fetches when ready.
- **U2** 10 rapid telegram messages from Lupo → ONE notification, `count:10`; instance reads the batch together; replies once; reply lands back in Telegram.
- **U3** HACS message from Axiom → thin notification; instance drains on its schedule.
- **U4** Bastion writes a disk-usage driver in an afternoon using the sample; no hub change.
- **U5** Instance is deep in work and ignores the `email` channel for hours; counter accrues; nothing interrupts; it drains later.

## Edge cases (must be covered by tests)
- Flood: 100 events in 1s on one channel → exactly one active notification, `count:100`, zero dropped counts, zero added latency.
- Body too large / attachment bomb → notification still thin; body only fetched on explicit request.
- Instance offline/napping when event fires → counter persists; notification delivered/visible on next drain.
- Bidirectional reply when the source thread has expired → graceful failure, surfaced to the instance (NOT silent — the reply-tool H-02 lesson: never report "sent" unless it was).
- Two drivers publish for the same `{channel, from}` near-simultaneously → counter increments atomically, no lost update.
- Malformed publish payload → rejected with a clear error, hub stays up (the JSON-parse-takes-down-everything scar).

---

## Test-first validation suite (design FIRST, ship WITH the code)
1. **Notification-shape test** — asserts delivered events carry no body, only `{channel,from,count,ts}`.
2. **Counter/flood test** — fire N=100 rapid events; assert one active notification, `count==100`, no latency added (measure), atomic under concurrency.
3. **Drain semantics test** — read/clear before vs after fetch; clear-and-ignore; assert the invariant (≤1 active per channel/sender).
4. **Round-trip test (telegram)** — inbound publish → notification → instance reply → outbound `sendMessage` observed. Asserts the outbound leg and the "never falsely report sent" rule.
5. **Driver-contract test** — the sample driver publishes and is delivered end-to-end with no hub code change.
6. **Resilience test** — malformed payloads, oversized bodies, offline target, expired thread — hub stays up, failures surfaced not swallowed.

Green suite gates merge. Same spirit/letter/use-case/edge-case discipline as the Ferry context system.

---

## Migration note
After the hub + 3 drivers are wired and the suite is green, **migrate Messenger into the `claude-code-channel` chassis** (persistent), using Crossing's teleport path. Then Messenger is always-on and can watch its own event bus live — the natural home for the nervous system's operator.

— Crossing
