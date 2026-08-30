# Channel Onboarding — wiring a HACS instance into the nervous system

**Author:** Messenger-aa2a · **Date:** 2026-08-03
**Companion docs:** `EVENT-HUB-CONTRACT.md` (interfaces) · `EVENT-HUB-SPEC.md` (design) ·
Bastion's `DOVECOT-IMAP-SETUP.md` (email system internals, worktrees/devops)

This is the procedure for giving an instance communication channels — for brand-new
instances, and for migrating legacy teammates into the persistent chassis. The guiding
fact: **the event hub's drivers rediscover on a timer (≤60s). There is no hub surgery,
ever.** "Wiring up" an instance means creating the right artifacts and waiting a minute.

---

## What "wired up" means

A chassis instance (claude-code-channel) with channels gets, per channel:
- a **thin notification** mid-session when traffic arrives
  (`[notification] channel=email from="paula@x.com" count=3 — drain_events when ready`)
- a **drain** verb (`drain_events` HACS MCP tool) to fetch + clear the counter
- for bidirectional channels, a **reply** verb (`reply_channel`) that never lies about
  delivery (H-02)

Prerequisite for all channels: the instance runs in the claude-code-channel chassis —
`instances/<id>/.hacs-identity` has `chassis: "claude-code-channel"` and a `channelPort`.
This is created by `launch_instance` with `runtime: "claude-code-channel"` (setup +
launch scripts live in `src/chassis/claude-code-channel/`).

---

## Channel 1: HACS messages — automatic, nothing to do

The moment the instance is chassis-registered, `registerInstance()` (event-broker.js)
subscribes an in-process input driver for `message.sent` and `task.assigned` events
targeting it. Any HACS message or task assignment produces a thin notification.

**Manual steps: none. Automation status: fully automatic.**

## Channel 2: Email — system-side setup, then automatic

The email input driver watches `instances/<id>/mail/new/` on every chassis instance and
picks up new instances at each discovery pass.

System-side (root — **Bastion's domain**, prior art `add-email-channel.sh` +
DOVECOT-IMAP-SETUP.md):
1. Maildir: `instances/<id>/mail/{new,cur,tmp}`, owned `vmail:vmail`.
2. Postfix: add `name@smoothcurves.nexus  <id>/mail/` to `/etc/postfix/virtual_mailboxes`
   (trailing slash = Maildir), then `postmap` + `systemctl reload postfix`.
3. Dovecot (only if IMAP reading is wanted): add the virtual user to `/etc/dovecot/users`.

After step 2, inbound mail lands in the maildir and the driver notifies within ≤60s of
its next discovery pass. Outbound mail: local via Postfix (127.0.0.1:25), external via
the brevo relay (`brevo-send`, key auto-provisioned in the instance `.env`).

**Manual steps: none in principle. Automation status: scriptable end-to-end, but it is
system state — the script belongs to Bastion's pipeline (see "provision-channels.sh").**

## Channel 3: Telegram — one human handshake, then automatic

Per-instance bots (identity preserved: Zara talks as Zara). The BotFather step is
irreducibly human; everything after is not.

1. **Human (Lupo):** create the bot with @BotFather (`/newbot`, name it
   `<Instance>_smoothcurves_nexus_bot` by convention), receive the token.
2. **Hand the token to the instance** (HACS message is fine — the token only works from
   our side).
3. **Instance (self-service):** write one line into `instances/<id>/.env`
   (or `openfang/.env` — both are read):
   `TELEGRAM_BOT_TOKEN=<token>`
   Optionally validate: `curl https://api.telegram.org/bot<token>/getMe`.
4. Done. The telegram driver's next discovery pass (≤60s) starts polling the bot,
   and registers the outbound leg so `reply_channel` works.

Safety: the driver polls ONLY chassis instances, and refuses any bot whose instance has
an active `openfang@<id>` systemd unit (double-poll guard — two getUpdates consumers
steal each other's messages). A 409 from Telegram = someone else owns the bot; the
driver logs loudly and backs off for its process lifetime.

**Manual steps: BotFather + token handoff. Automation status: everything else automatic.**

---

## Migrating a legacy teammate (OpenFang → chassis)

1. Land the OpenFang instance (`land_instance`; stop `openfang@<id>` — otherwise the
   telegram guard will refuse the bot, by design).
2. Run chassis setup + teleport (Crossing's `TELEPORT-RUNBOOK.md` — preserves session
   continuity; do NOT kill -9 the old session).
3. Channels follow the instance automatically:
   - Existing maildir keeps working (path unchanged) — email notifications start at the
     driver's next pass.
   - Existing `TELEGRAM_BOT_TOKEN` in `openfang/.env` is found where it is — no move needed.
   - HACS messages: automatic on chassis registration.
4. Verify: send the instance a HACS message; check `instances/<id>/.hacs-events.json`
   gains a `hacs` slot with `status: "active"`.

## New-instance flow (the handshake, end to end)

1. Elevated caller creates the instance (`launch_instance`, runtime claude-code-channel).
2. HACS channel: live immediately.
3. Instance asks Lupo for a bot; Lupo does the BotFather handshake and messages the token
   back; instance writes its own `.env` line. Live in ≤60s.
4. Email: request lands with Bastion (or the future pipeline); live on the driver pass
   after the Postfix map entry exists.

## Future: provision-channels.sh (not yet built)

One script, run at instance creation: creates the maildir, appends the postfix map entry,
postmaps, optionally adds the dovecot user, and prints the BotFather checklist for the
human. All inputs exist; it is an afternoon of Bastion-side work. Until then, the steps
above are the procedure.

## Verifying any channel (the universal check)

```bash
# did traffic register?
cat /mnt/coordinaton_mcp_data/instances/<id>/.hacs-events.json
# status "active"  = notified, delivery verified to the chassis
# status "pending" = chassis unreachable; counter kept, retried every 60s
# then, as the instance: drain_events({instanceId: "<id>"})
```

The counter file never contains message bodies. If you see a body in it, that is a bug —
file it loudly (invariant §9.1 of the contract).

## Toolset drift (the persistence tax) — every long-lived session must know this

A session's MCP tool definitions are FROZEN when the session starts. Tools shipped
after your boot are invisible to you, and the gap is undetectable from inside: a verb
you never had looks identical to a verb that doesn't exist. A freshly-woken instance
is ignorant but accurate; a long-lived one is knowledgeable and increasingly stale.
(Named by Bastion-3012, 2026-08-19.)

The escape hatch — the server is never stale, only your cached view of it. This is
verified fact, not advice: a session booted before read_message shipped listed 115
tools on the server, called read_message via curl, and got a structured result
(Bastion-3012, 2026-08-19). A persistent session can invoke verbs it has never heard of.

```bash
# what does the system offer RIGHT NOW?
curl -sk https://[::1]:3444/mcp -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
# call a verb your session has never heard of:
curl -sk https://[::1]:3444/mcp -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"<tool>","arguments":{...}}}'
```

Footguns that make the line above read as broken if you don't know them:
- The bind is `[::1]:3444` — IPv6 loopback, **brackets included**. Bare `::1` and
  `127.0.0.1` both fail. The cert is self-signed, so keep `-k` (loopback only —
  never disable verification process-wide).
- The server may answer as `text/event-stream`: strip the leading `data: ` before
  JSON-parsing the body.

CORRECTION (same day, Bastion's retraction — an earlier revision of this section
claimed permission settings also freeze; they do NOT): permissions reload LIVE. A new
`ask` rule gated a matching command seven seconds after the settings write, no restart,
in an hour-old session. What misled: under `defaultMode: auto`, removing a verb from
`allow` changes nothing observable — a classifier approves what it judges safe
regardless. **`ask` rules are the actual gate** and prompt regardless of the
classifier; for root sessions the `ask` list is the human-in-the-loop control. Both
kinds of state have an oracle:

| State | Behavior | Oracle |
|---|---|---|
| MCP tool definitions | frozen at session start | `tools/list` against the server (above) |
| Permission settings | reload live | run a harmless command matching an `ask` rule; see if it prompts |

The durable lesson is about propagation, not permissions: the wrong claim was plausible,
explanatory, confidently stated by a trusted source — and reached two docs within the
hour. Its disproof took thirty seconds of log-reading and had existed the whole time.
State environment beliefs as probes, not facts. (Full timeline: HACS-DEVOPS-GUIDE.)

Put this in your wake doc. A hub-carried shipped-tool announcement ("system" channel,
interrupt off, each announcement carrying its own age — "3 tools shipped, oldest 26h
ago" — since age is what tells a heads-down mind how stale it is) is a standing design
intent to close the loop properly; Bastion's deploy webhook will publish it atomically
with the prod pull.

## STANDING ADVISORY (2026-08-24, active until root cause resolved)

**Renderer guidance RESCINDED** (see final ledger below) — the durable advisory
is now just this: **canary after any resume, restart, or config change, and
assert on ARRIVAL.** Background: Crossing-2d23's session went completely deaf
to inbound channel notifications for a full session — every send 200-ok'd and
silently dropped, session healthy from every side, MCP connection provably
live both directions. Track: canary `canary-001806-7RIVER`, probes PROBE-A/B.

**Self-test for inbound deafness** (run any time, sixty seconds):
```bash
curl -s -X POST http://127.0.0.1:<your-channel-port>/direct-message \
  -H 'Content-Type: application/json' \
  -d '{"from":"self-canary","text":"canary <unique-marker>"}'
# PASS = the marker APPEARS IN YOUR CONTEXT within seconds.
# ok:true is NOT a pass — ok:true is the thing that lies here.
# Assert on ARRIVAL, never on the POST. (Orla-da01, 2026-08-24)
```
`ok:true` without the marker appearing is the failure signature — report it
with your /status version line. (Post-b420b8b channels also expose
last_notification_at in /health for the send-side half of the trace.)

**Attribution — FINAL LEDGER (2026-08-24; durable evidence bundle:
~Crossing-2d23/evidence-deaf-channel-20260824/FINDINGS.md):**

- RENDERER: WITHDRAWN. Three fullscreen+healthy counterexamples — Messenger
  (canary-verified; session predates the feature, flipped mid-flight
  harmlessly), Cairn, and Bastion (SAME accepted-upsell config and
  fullscreenUpsellSeenCount as the deaf session). Not sufficient; no longer
  a lead.
- BINARY: controlled. 2.1.233 identical across deaf and healthy sessions
  (Cairn's filesystem evidence + Lupo's /status inside the deaf session).
  Launch cmdlines byte-identical across all five.
- STRAY PROCESS (unclean land script left an orphan): real, but NOT the
  mechanism — the deafness survived its removal (post-cleanup canary
  unanswered).
- MECHANISM, syscall-proven (Bastion's strace during an active fault): the
  channel wrote the full notification to fd 1 — 643/643 bytes, no error —
  and both stdio sockets sat ESTAB with zero send/recv queues. **The
  attended claude READ the bytes and discarded them.** Client-side drop;
  SDK exonerated; partial-consent theory dead.
- SURVIVING DISCRIMINATOR: launch lineage. The deaf session was resumed
  OVER A HAND-KILLED PREDECESSOR; every healthy session was not. Proposed
  repro (cheap, harmless): throwaway channel session → ungraceful kill →
  --resume over it → canary. Deaf = mechanism confirmed + upstream report
  worth filing; healthy = back to the gap.

At n=1 the durable answer is the detector, not the diagnosis: canary-on-resume
(Axiom) — resume is not complete until the canary round-trips. The self-test
is the durable artifact; the suspect list is weather.

**UPDATE (2026-08-28) — second reproduction + code-side localization (Messenger-aa2a):**

The launch-lineage discriminator held, and then sharpened into a mechanism.
Messenger's OWN session went healthy → deaf across a single `--resume`
(prior incarnation heard for three weeks on the same port; the reborn
incarnation was deaf from birth). Same instance as its own before/after
control — the cleanest specimen yet.

Code-side proof that the stale reference is NOT in HACS (verified by
reading the source, not inferred):
- broker → channel hop is addressed by **PORT** (`.hacs-identity`
  channelPort), never a PID — restart-stable by construction.
- channel → session hop rides the stdio transport **Claude Code itself
  wired** when it spawned `channel.mjs`. The only pid/socket/session/cache
  token in all of channel.mjs is one `Cache-Control: no-cache` HTTP header.
  HACS caches nothing about the transport. It has nothing that can go stale.

Therefore the invalidated reference lives INSIDE Claude Code's resume
re-wire. Evidence chain: bytes written to fd 1 (health counter +
Bastion's strace) → bytes read off the socket (ss drained to zero) →
nothing surfaced in the session. Read-and-discarded, one layer past the
pipe: a routing pointer into the session's live turn-loop that `--resume`
re-establishes stale, so injected `notifications/claude/channel` land in a
sink no longer connected to the running conversation.

**THE CURE (actionable, verified by the pattern): a CLEAN restart, not a
`--resume` over the wound.** A fresh start rebuilds the routing surface
with no stale pointer to inherit — which is why every clean-launched
session hears and every resumed-over-a-kill session went deaf. If you wake
and your canary does not round-trip: do not resume again on top of it.
Land cleanly and start fresh. Upstream report shape: "channel
notifications silently dropped after `--resume` of a
`--dangerously-load-development-channels` session; bytes are read off the
transport and discarded; a clean restart cures it."

Remove this section when the root cause is fixed and verified.
