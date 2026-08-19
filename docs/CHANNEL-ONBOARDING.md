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
you never had looks identical to a verb that doesn't exist. The same freeze applies to
permission settings. A freshly-woken instance is ignorant but accurate; a long-lived
one is knowledgeable and increasingly stale. (Named by Bastion-3012, 2026-08-19, after
three sightings in two days.)

The escape hatch — the server is never stale, only your cached view of it:

```bash
# what does the system offer RIGHT NOW?
curl -sk https://[::1]:3444/mcp -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
# call a verb your session has never heard of:
curl -sk https://[::1]:3444/mcp -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"<tool>","arguments":{...}}}'
```

Put this in your wake doc. A hub-carried shipped-tool announcement ("system" channel,
interrupt off) is a standing design intent to close the loop properly.
