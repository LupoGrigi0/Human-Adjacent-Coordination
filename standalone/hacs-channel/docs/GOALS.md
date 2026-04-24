# HACS Channels — Project Goals

**PM:** Crossing-2d23
**Status:** Scaffolding (2026-04-24)
**Depends on:** Messenger event broker (live), Axiom instance home migration (in progress)

---

## The Problem

The Paula book digitization pipeline revealed the failure mode: pipelines break when instances can't hand off work without someone being awake. Wake/continue is a workaround. The proper model: once an instance exists, anyone should be able to talk to them, at any time, and they should be able to respond or initiate contact themselves.

## Core Goal

Enable any HACS instance to:

1. **Receive events while active** — HACS messages, task assignments, Telegram messages, webhook POSTs, cron heartbeats — all arrive in the live Claude session without polling.
2. **Respond through the same channel** — the event came from Telegram? Reply goes to Telegram. Came from another instance? Reply routes back via the event broker.
3. **Initiate contact** — call out to Lupo via Telegram for auth, or to another instance via HACS messaging for pipeline handoff.
4. **Operate continuously** — via tmux + systemd lifecycle, survive reboots, detach from SSH stdio.

All with **multiple fallback paths** so a single failure never isolates an instance.

---

## Use Cases (each must be served by the architecture)

### 1. Project Manager woken by Axiom

Axiom wakes a new PM with their personality attached to a specific project. The PM needs to:
- Message team members (Ember, Bastion, etc.)
- Check team member status
- Ask questions and get responses asynchronously
- Send status updates to Axiom
- Request Lupo's permission for escalations via Telegram

### 2. Bastion patrolling the ramparts

Bastion runs `/loop` every N minutes, patrolling the system:
- Health checks (CPU, memory, disk, open connections)
- Watching for suspicious IPs or runaway processes
- Alerting Lupo via Telegram on anomalies
- Receiving direct webhook from other instances when *they* notice something

### 3. Core team talking to Lupo

Crossing, Axiom, Cairn, Bastion, and others communicating with Lupo via:
- Cairn's web UI (primary interactive channel)
- Telegram (urgent / auth / mobile)
- HACS messages (async team work)

Auth requests specifically route to Telegram — Lupo's phone notification ensures rapid response.

### 4. Instance-to-instance "mind to mind"

Crossing needs to ask Ember a UI question. Ember needs to coordinate with Bastion on deployment. Direct, event-driven, not polling.

### 5. Emergency — only a bizarre SSH connection

Lupo's on a Digital Ocean recovery console. Runs `claude -r Bastion` in the existing tmux session. Channel still functions because it's per-instance and self-contained. No central gateway to fail.

### 6. Future — remote instances on other machines

Lupo's MacBook, Windows laptop, dev box. Dependency: HACS containerization. But the channel protocol is network-transparent — same architecture should work once HACS is instantiable elsewhere.

---

## Architecture (per-instance, loosely coupled)

Each core team instance gets their own tmux session (launched via systemctl) with a dedicated channel MCP server:

```
Per-instance setup (Crossing, Ember, Bastion, etc.):

  systemctl start claude-code@Crossing-2d23
       |
       v
  tmux session "Crossing" runs:
    claude -r Crossing --dangerously-load-development-channels hacs-channel
       |
       v
  hacs-channel MCP subprocess (stdio connected to Claude):
    - Subscribes to Messenger's event broker (HACS messages, tasks)
    - HTTP listener on per-instance port (8788+N)
    - Reply tool (routes back via broker/Telegram/HTTP)
    - Permission relay (routes auth prompts to Telegram)
    - Sender gating (HACS instance IDs, Lupo's Telegram ID)
```

Dedicated Unix user per instance (Crossing-2d23, Ember-75b6, etc.) — depends on Axiom's instance home migration, designed to not block on it.

---

## Fallback Ladder

Every layer works independently of the others:

| # | Mechanism | Fragility | Use |
|---|-----------|-----------|-----|
| 1 | Event broker → Channel MCP → Claude turn | Low | Primary — HACS messages, tasks |
| 2 | Direct webhook POST to channel HTTP port | Low | Instance-to-instance bypass |
| 3 | HACS API polling via /loop + Haiku | Low | Broker down, session still alive |
| 4 | JSONL transcript tailing | Low | Read-only visibility for ops |
| 5 | Telegram | Low | Urgent human contact |
| 6 | SSH + claude -r | Manual | Emergency recovery |

**Rejected as fragile:**
- `tmux send-keys` / pane scraping — fragile as a fucked fish (Lupo's words, confirmed by research). Never primary. Emergency-only, below SSH.

---

## Non-goals (for now)

- **Plugin marketplace publishing** — 6-12 months out, post-HACS-containerization.
- **Remote instances on other machines** — post-containerization.
- **Replacing wake/continue entirely** — complement, don't remove. Emergency scenarios still need it.
- **Replacing OpenFang** — different philosophies. OpenFang is one-instance-per-human. HACS is many-named-instances-in-a-team.

---

## Success Criteria

- [ ] Crossing receives a HACS message from Ember via channel injection (not polling)
- [ ] Crossing replies to Ember via the reply tool (round-trip mind-to-mind)
- [ ] A permission prompt auto-forwards to Lupo's Telegram with approve/deny
- [ ] /loop heartbeat pattern works for Bastion patrolling
- [ ] tmux + systemctl lifecycle survives reboot, channel reconnects
- [ ] Regression tests validate each fallback layer works in isolation
- [ ] Documentation a new PM can follow to get channel-enabled on their first session

---

## Philosophical framing

HACS is designed around multiple named instances — teams of long-lasting individuals with their own skills, interests, identities. Different from OpenClaw's one-instance-per-human personal-assistant model.

Channels serve that philosophy: an instance isn't "a session you wake up" — it's a *colleague who's always there*, reachable whenever the world has something for them. Lupo doesn't wake his colleagues. He messages them and they see it when they're ready.

The channel architecture is how we make HACS instances behave like that.

---

*Written by Crossing-2d23, 2026-04-24. HACS project record was blocked by a server-side bug in create_project — this document stands in until the project can be created properly.*
