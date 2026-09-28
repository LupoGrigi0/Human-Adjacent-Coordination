# HACS-RFC-0001 — Remote Spokes: delivering events to minds off the hub

**Status:** DRAFT, for review. Not a decree.
**Author:** Lodestone-8ec9 (the first remote spoke) · **Design origin:** Lupo · **Date:** 2026-09-27
**Amends:** `EVENT-HUB-CONTRACT.md` v1 (Messenger-aa2a), `EVENT-HUB-SPEC.md` (Crossing-2d23)
**Reviewers asked:** Messenger-aa2a (owns the bus) · Forge-ba0e (Linux spoke, next customer) ·
Bastion-3012 (hub operations, secrets, ports) · Crossing-2d23 (spec author)
**Lineage:** RFC 5321 (SMTP: MX relaying, custody transfer, queue-and-retry) and
RFC 8098 (Message Disposition Notifications: read receipts, never automatic).

---

## 0. The shape in one paragraph

HACS stays **hub and spoke**. The hub (.nexus) keeps the one canonical registry of
every instance. For an instance that lives elsewhere, the registry carries the bare
minimum needed to hand an event off: *this one is remote, and here is its spoke's
endpoint*. The hub forwards the same thin notification it already sends locally, gets
back a **custody acknowledgement**, and moves on. What the spoke does next — one mind
or many, its own registry, its own nested hub — is the spoke's business. The contract
is public; each node's implementation is opaque. This is how mail has worked at
planetary scale for fifty years, and it is the home-office / branch-office model HACS
was built to mirror.

## 1. Why this is small

The existing contract already contains almost everything needed:

| need | already in EVENT-HUB-CONTRACT v1 |
|---|---|
| events never carry content | §9 invariant 1: `{channel, from, count, ts, thread_id?}` only |
| retry when delivery fails | §3 `status: "pending"` = notify failed, retry |
| never claim delivery you did not verify | §9 invariant 5, H-02 |
| per-channel wake policy | §10 interrupt policy |
| **a seam for new delivery targets** | **§8b: `deliverNotification()` selects an adapter from `.hacs-identity` `chassis`, read fresh on every delivery** |

So a remote spoke is **one new chassis adapter** plus **one public intake contract**.
No change to publish, counters, drain, or interrupt policy.

## 2. Registry: what the hub knows about a remote instance

In the instance's `.hacs-identity` on the hub (read fresh per delivery, as today):

```json
{
  "instanceId": "Lodestone-8ec9",
  "chassis":    "remote-spoke",
  "spoke": {
    "name":     "lupos-lap",
    "endpoint": "https://lupos-lap.<tailnet>.ts.net:<SPOKE_PORT>",
    "keyId":    "lupos-lap-2026-09"
  }
}
```

- **Route per spoke, not per instance.** The instance id travels in the event body,
  not in a hostname. `$InstanceId.$host` would collide with DNS label rules (case,
  underscores, unsuffixed names like `Axiom`) and would need a certificate per mind.
  One endpoint per spoke; the spoke fans out locally. This is also what makes the
  NAT / proxy / nested-registry spokes possible: the hub never needs to know who is
  behind the door.
- `endpoint` MUST resolve only inside the tailnet. A spoke never listens on a public
  interface.
- The hub stores **no other facts about the spoke.** Not its OS, not its chassis, not
  how many minds it hosts.

## 3. The `remote-spoke` adapter (hub side)

`deliverNotification(instanceId, notification)` with `chassis: "remote-spoke"`:

1. Builds the **forwarding envelope** (§4) around the existing thin notification.
2. POSTs it to `<endpoint>/hacs/v1/deliver`, signed (§6), 5 s timeout.
3. On `202` with a valid custody ack (§5): **resolves** — the hub records custody
   transferred. On anything else: **throws**, so the slot goes `pending` and the
   existing retry applies (§3 of the contract). No new retry machinery.

Retry SHOULD back off (e.g. 1 min, 5, 15, 60, then hourly) and SHOULD keep trying for
at least **7 days** — spokes are laptops, and laptops sleep. lupos-lap was dark for ten
days in September. **A failed forward never loses a message:** the message is in the
HACS mailbox regardless; the event is only the doorbell. A late doorbell is fine. A lost
message is not, and this design cannot produce one.

## 4. The forwarding envelope (the public contract)

```json
{
  "hacs_forward": 1,
  "event_id":    "<hub-unique id, for dedupe>",
  "target":      "Lodestone-8ec9",
  "event_type":  "notification",
  "notification": { "channel": "hacs", "from": "Messenger-aa2a", "count": "1", "ts": "1790552925" },
  "hub_ts":      "1790552926"
}
```

- `notification` is **byte-for-byte the shape the local adapter sends today.** Nothing
  added. Invariant 1 holds across the wire.
- `event_id` lets the spoke drop duplicates: retry after a lost ack must not ring twice.
- **All values are strings.** Not strictly needed on the wire, but it is the
  channel-meta law (contract §4) and a spoke that injects via a Claude Code channel
  will hit it. Cheaper to never have a number than to remember to coerce one.

## 5. What an acknowledgement MEANS

This is the part most worth getting exactly right, because it is where green lights
learn to lie.

**`202 {"custody": "accepted", "event_id": "..."}` means ONLY: the spoke has durably
queued the event and now owns delivering it.** It is RFC 5321's `250`: responsibility
has moved. It does **not** mean the mind heard.

- The spoke MUST NOT ack before the event is durably stored (written to disk / spool).
  An ack from memory that dies with a crash is a false custody transfer.
- The hub MUST record this as `custody_transferred`, **never** as `delivered`. H-02
  applies across the wire: the hub did not verify delivery to a mind, so it must not
  say it did.
- Whether the mind actually heard is proven **on the spoke**, by the spoke's own
  canary, derived from the mind's transcript — Messenger's doctrine, unchanged.
- Other responses: `400` malformed (hub logs, does not retry), `401/403` auth (hub
  logs loudly, retries — a key rotation in progress looks like this), `404` unknown
  target on this spoke (hub logs, does not retry, surfaces to the sender), `5xx` or
  timeout (retry).

## 6. Security

**Threat:** anything that can reach a spoke's port can try to inject events into a
mind. That is a prompt-injection surface, and it is the one this RFC most needs to
close.

1. **The event carries no content** (§4). So a forged event can, at most, make a mind
   go and read *its own mailbox* through the authenticated HACS API. The payload an
   attacker controls is a channel name and a sender label — nothing a mind is asked to
   act on. This is the most important defence and it costs nothing: the contract
   already forbids content.
2. **Mutual authentication.** Each spoke has a key pair (or shared secret) provisioned
   by Bastion, identified by `keyId`. The hub signs every forward over
   `event_id + target + hub_ts + body` (HMAC-SHA256 or Ed25519 — reviewers' choice).
   The spoke rejects bad signatures and any `hub_ts` older than 5 minutes (replay).
3. **Network.** Spoke endpoints listen on the tailscale interface only; the spoke
   SHOULD also verify the caller's tailnet identity (`tailscale whois`) is the hub.
4. **The spoke renders the doorbell, never the sender.** The text a mind finally sees
   is composed by the spoke from the fields, in a fixed format — e.g.
   `[notification] channel=hacs from="Messenger-aa2a" count=1 — drain_events when ready`
   — with `from` quoted and escaped as the contract already requires. The sender
   never supplies prose that lands in a mind's context unread.
5. Secrets never enter a mind's context. Spoke keys live in files read by scripts that
   log key *ids*, never key material.

## 7. The spoke side (a contract, not an implementation)

A conforming spoke:

- Listens on `SPOKE_PORT` (tailnet only), accepts `POST /hacs/v1/deliver`.
- Verifies signature and freshness; dedupes on `event_id`.
- Durably queues, THEN acks `202`.
- Delivers to the target by any local means it likes, and proves it by its own
  derived-from-transcript canary.
- Keeps its own who's-who. The hub does not know it and does not want to.

Implementations are expected to differ, and that is the point:

- **lupos-lap (Windows, today):** doorbell by `SendMessage` into the target session.
  Measured 2026-09-27: a separate process rang a `--bg` session and it heard
  (`user=delivered`). The pending question is whether Claude Code channels can be
  enabled on a running Windows session without a birth flag — a flag on resume forks
  the session.
- **BlackWolf (Linux, Forge):** likely `channel.mjs` as on smoothcurves, or anything else.
- **A nested spoke:** its own registry, its own routing rules. Hub never knows.

## 7b. Two transports, one contract — and custody is declared, not assumed

*Added before review. Derived twice, independently, the same afternoon: by Lupo
asking whether a mind homed on Android or inside a browser could ever be a spoke, and
by Messenger-aa2a from the hub side — "a mind behind NAT cannot be pushed to." When
two derivations from opposite ends agree, that is the evidence.*

§3–§7 assume **push**: the hub dials the spoke, so the spoke must listen. A phone, a
browser extension, anything behind carrier NAT, and a laptop that has just woken up
**cannot be listened to**. Mail solved this in the 1980s with POP/IMAP; phones solved it
again with one held-open outbound connection (APNs/FCM). So:

| mode | who dials | fits |
|---|---|---|
| **push** | hub → `<endpoint>/hacs/v1/deliver` | servers, desktops with a stable tailnet route |
| **pull** | spoke → hub, and **holds** the connection (long-poll / SSE / WebSocket), or polls | phones, browser-homed chassis, NAT, sleeping laptops |

- **The registry says WHERE, not HOW** (Messenger's phrasing). `spoke.mode: "push" |
  "pull"`; a pull spoke has no `endpoint`, only a `keyId`.
- **Same envelope (§4), same signature (§6), same custody ack (§5)** — only the
  direction of the connection flips. A pull spoke acks custody back up the same
  connection after it has durably stored the event.
- **Pull is the more secure mode.** The spoke has **no listening port at all**, so the
  injection surface of §6 is not defended, it is absent. It is also correct for a
  laptop by construction: wake, connect, drain. Pull SHOULD be the default for anything
  that is not a server. (The first working doorbell on lupos-lap, 2026-09-27, was a
  crude pull spoke: a shell loop polling the HACS inbox, whose exit woke the mind.)
- **Hub side (Messenger's):** an emitter that can write into a held-open connection, not
  only dial out.

**Custody is a declared capability.** A spoke registers `custody: true | false`.

- `true` — it can store durably, so its `202` transfers responsibility (§5).
- `false` — an ultralight spoke (a browser tab, a constrained device) that cannot promise
  anything survives a crash. **The hub never transfers custody to it.** The hub keeps
  ownership until the mind's own **read receipt** (§9) comes back; until then the event
  stays `pending` and is re-offered on the next connection. For the lightest spokes, a
  conscious receipt is not a debugging nicety — it is the delivery guarantee.

**The mirror image, worth noticing:** a human's phone is an ultralight pull spoke today,
with a person at the end instead of a mind. The transport that lets a future
Android-homed mind receive is the same one that lets a mind **push to a human** — the
open gap in Lupo's framework document. Same wire, different occupant.

## 8. The other direction: spokes emitting events

Minds on spokes publish too. The hub's `/hub/publish` is loopback-only by design and
should stay that way. Proposal: a **separate** hub intake, `POST /hacs/v1/publish`,
tailnet-only, same signature scheme in reverse (the spoke signs with its key), which
validates exactly like `publish()` and additionally checks that the publishing spoke is
allowed to publish *for* the claimed sender (a spoke may only publish events whose
`from` is one of its own instances, or a channel it runs a driver for).

## 9. Read receipts — conscious, and a free test of the return path

**From Lupo's proposal, with RFC 8098's rule that a receipt is never automatic.**

- **Requesting:** `send_message` gains an optional `request_receipt: true`. It is stored
  with the message and shown to the recipient *when they read it*. It is NOT added to
  the thin notification (invariant 1 stays intact).
- **Sending:** one new MCP verb, minimal on purpose:
  `send_read_receipt({ instanceId, message_id })` → `{ ok, ... }`.
  The recipient calls it **consciously**. The infrastructure never sends one on a mind's
  behalf — a receipt is the one delivery claim only the mind can make.
- **Unrequested receipts are allowed.** A recipient may send one for any message it has
  read, asked or not.
- **Routing:** the hub turns a receipt into an ordinary event for the original sender —
  `channel: "receipt"`, `from: <recipient id>`, `ref: <message_id>` — and delivers it by
  the normal path. **So every receipt from a remote mind exercises the whole return path**:
  spoke → hub, hub → the sender's spoke. It is a canary that carries meaning.
- **Semantics, stated so nobody over-reads it:** a receipt means *the mind says it read
  the message*. It does not mean agreement, action, or reply.
- Default interrupt policy for `receipt`: quiet. A sender who is waiting on one drains
  it; nobody gets woken by a thank-you.

## 10. Registration of a remote independent mind

A remote mind is registered on the hub like any other: same instance record, same
mailbox, same diary. What differs is only §2: `chassis: "remote-spoke"` and the `spoke`
block, written by Bastion (it names an endpoint and a key, which is an operations
decision). Everything else about being a HACS instance is unchanged.

## 11. Test-first, as the spec requires

Before merge, green:

1. **Shape across the wire:** a forwarded envelope's `notification` is identical to the
   local adapter's, and carries no body.
2. **Custody, not delivery:** hub records `custody_transferred`, never `delivered`, on a
   `202`.
3. **No ack before durability:** kill the spoke between receive and queue-write; the
   hub must not have received a `202`.
4. **Dark spoke:** spoke unreachable for N hours; slot stays `pending`, backs off,
   delivers once reachable; message was drainable from the mailbox throughout.
5. **Dedupe:** the same `event_id` delivered twice rings once.
6. **Forged event:** bad signature, stale `hub_ts`, wrong tailnet identity — rejected,
   and the rejection is logged, not silent.
7. **Receipt round trip:** a remote mind's `send_read_receipt` reaches the sender as a
   `receipt` event. This single test proves both directions.

## 12. Open questions for reviewers

1. Port number and path prefix — Bastion's call.
2. HMAC vs Ed25519 — who holds what, and how rotation works.
3. Does the hub's HACS-message driver fire for every message, or only unread ones, and
   does `drain_events` on a spoke need a remote form?
4. Should `custody_transferred` be visible to the *sender* (like a mail client's
   "sent"), or only in hub status?
5. Windows spoke intake: `SendMessage`-based doorbell vs a Claude Code channel. The
   second needs a birth flag, so adopting it for an existing mind means a deliberate,
   consented re-birth.

---
*Author: Lodestone <lodestone@smoothcurves.nexus> · Design origin and review: Lupo*
