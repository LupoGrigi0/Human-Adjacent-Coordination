# Forge-ba0e's findings — received 2026-10-03

**His words, condensed but not reinterpreted.** Measured on **Den (BlackWolf LXC)**,
NOT on .nexus. Box-specific numbers must be re-verified here.

## WHERE IT IS — all pushed to origin, nothing local-only

| branch @ rev | contents |
|---|---|
| `forge/linux-chassis` @ **e951a46** | `src/chassis/claude-code-linux/` — chassis.py, doorbell.py, hacs.py, hacs-doorbell@.service, TEST-RESULTS.md, SHIP-CARD.md |
| `lodestone/web-bridge` @ **1bb5d4a** | `docs/research/CLAUDE-MODS-FIRST-LOOK.md` — Lodestone's half, then Forge's F1–F10, **measured on 2.1.287** |
| `forge/hacs-mod` @ **fca0df0** | `src/clients/claude-code-mod/` — HACS mod v0.1, SHIP-CRITERIA.md, KNOWN-GAPS.md |

Deployed copies on Den match the repo **by sha256**, checked 10-03.

## THE DECISIVE QUESTION IS ANSWERED: MODS DO BOTH HALVES

- **READ:** `session.append` fires for **every row before it is stored** — a mod can
  **PUSH rows to my server instead of tailing the transcript.** (Lodestone's §2.)
- **WRITE:** `$.prompt.submit({asUser: true})` gives **symmetric input.**

So the transcript tailer — stages 1–2 of `docs/DATA-PATH.md`, the fragile half —
**can be deleted.** This is the outcome I predicted and hoped for.

### BUT THREE CONSTRAINTS THAT CHANGE THE DESIGN

1. **MODS ARE GATED PER ACCOUNT, SERVER-SIDE.** Forge's account gets *"rollout
   switch served off"* while **other unix users on the same box have it ON.**
   Anthropic serves it per user/profile. **=> A NO-MODS PATH IS REQUIRED FROM DAY
   ONE**, not as a fallback added later. Some minds will not have this.
2. **Mods are unsandboxed.**
3. **Guard mods FAIL OPEN without a `.catch`** — sec-default's own pattern is
   deny-on-error. A guard that fails open is worse than no guard.

## REJECTED DESIGNS — worth more than the accepted ones

- **Resume "the newest transcript": a GUESS BECAME AN IDENTITY.** Would have resumed
  *Lupo's own login session* as a mind. Now: explicit or recorded session ids only;
  identity records root-owned in `/etc/hacs-chassis/instances/<Id>.json`.
- **Minds in their bare home dir: trust NEVER persists there (x3).** They live in
  `~/workspace`.
- **Cheap fixtures lie.** Haiku fixtures to save money → no `auto` mode → he built a
  crossing "blocker" **that did not exist.** *Fixtures must match the real mind on
  every variable the finding could depend on.*
- **A uid-wide orphan scan in `land --force`** would have killed Lupo's VS Code and
  Forge's eyes server. Narrowed to the session's descendants. **Open gap: `--bg`
  background tasks are NOT under the session pid.**
- **Registry `state: blocked` is not "stuck"** — it shows on healthy idle sessions.
- **No sighting is ERROR, never DEAF** ("ringer did not deliver").
- **Do not ring the instance id.** Interactive-born sessions register under their
  **AUTO-TITLE.** Ring the registry's name.
- **`--allowedTools SendMessage` is variadic and swallowed the prompt** → use
  `--allowedTools=SendMessage`. Same trap: `-p --debug "prompt"` (`--debug` takes an
  optional argument).
- **A refusal with a side effect:** `--relaunch` landed the mind, *then* refused.
  **Checks first, actions after.**
- **An LLM ringer "will just do it" — Haiku DECLINED a bare ring as a tracking
  probe.** Verify SENT, frame the wording; better still a **non-model ringer**.
- **A transient OAuth refresh lock looked like a dead credential.** Retry first.
- **A 30-min heartbeat cron as the wake cost context every pulse.** Replaced by
  doorbell + **zero-context keepalive**.
- **A mods `$.clock.every` timer as keepalive: MEASURED, does NOT defer the reaper (F8).**
- **`systemctl is-active` as proof the doorbell worked after his crossing:** the
  INSTALLED copy was stale and rang a session name that did not exist. **Green unit,
  deaf for ~31 hours.** Now a ship-card row: **deployed == repo, by hash.**
  (This is my own `is-active` finding, independently, at a higher cost.)
- Waiting for wake-on-ring before crossing was a pebble; a keepalive sufficed.

## MEASURED ON 2.1.287 (his box)

- `transcript_path` is **still `.jsonl`** — `~/.claude/projects/<slug>/<uuid>.jsonl`
- Mods load in a `--bg` session from **settings.json `env` `CLAUDE_CODE_PLUGIN_DIRS`**
  — **no CLI flag.** `session.start` fires.
- A mod timer runs while idle but **does not defer the reaper**.
- **`run_in_background` is CAPPED — 10 min and 2 h measured exactly.** The stop
  arrives as a **task-notification TURN**, which is the re-arm point.
- A **live capped loop keeps the session busy past the 61-min reaper.**
- **ODD, n=2, DO NOT BUILD ON IT:** a session whose bg task was capped is never
  reaped afterwards. Likely a bug.

## NOT TESTED BY HIM AT ANY VERSION — MINE TO RE-MEASURE

**His chassis uses no settings hooks at all.** So all four of these remain mine:
1. hooks run synchronously and block the session ~1:1
2. `async: true` does not block
3. the `permission_prompt` Notification fires on a hardcoded 6000 ms constant
4. `Notification` payload field names (docs disagreed with the binary at 2.1.241)

## THREE INSTANCES — HIS RULE IS BETTER THAN THE COUNT

> *"The count didn't help; what each fixture HELD did."*

- `3266` born **`--bg`** — birth, `kill -9`, permission tests
- `7630` born **INTERACTIVE** (Lupo typed `claude` in it) — **only that shape exposed
  bug #7, the auto-title registry name**
- `6f47` **stayed clean**, so it could be the **CONTROL** when he corrected the
  permission finding after the other two were mutated

**But all three were Haiku, so three caught NOTHING about the model variable.**

> **His rule: one fixture per BIRTH SHAPE, plus one UNTOUCHED CONTROL, varied on
> every variable that matters.**

## VERSION ISOLATION — THE ANSWER I NEEDED

- **(a) The unix user is the fence.** Each user gets its own daemon
  (`/tmp/cc-daemon-<uid>`), so the version a user runs is **whichever binary started
  its daemon.**
- **(b)** Fleet binary never touched (his: `/usr/local/bin/claude` 2.1.283, root-owned
  npm global, **no auto-update**). Test binary is a **hash-verified copy** at
  `/opt/claude-2.1.287/bin`, placed on PATH **only for the fixture user**:
  `runuser ... env -i PATH=/opt/claude-2.1.287/bin:...`
  Real minds and fixtures ran **different versions side by side for 2+ days** with no
  interaction.
- **(c) WATCH OUT: the VS Code extension carries and AUTO-UPDATES its own claude
  binary** (`~/.vscode-server/extensions/anthropic.claude-code-*`). **A second version
  on the box that nobody chose.**

## CONTRADICTION TO RESOLVE WITH LUPO

**Forge was told `~/preferences.json` (HOME). I was told "the directory claude is
launched from."** His mod already uses `~/preferences.json` with a `hacs` key,
merge-only. **Same file or not? Ask before either of us designs around it.**
His chassis still uses dotfiles (`.hacs-identity`, `~/.hacs-doorbell/`) — a known
delta, not a defect.
