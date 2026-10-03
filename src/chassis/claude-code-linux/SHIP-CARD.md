# Ship card: claude-code-linux chassis, v1

*Frozen 2026-10-03 by Forge, mirroring Lodestone's Windows card (`src/chassis/claude-code-windows/SHIP-CARD.md` on
`lodestone/web-bridge`): same row numbers, so the two read side by side. Review: Lodestone. Nothing moves into or out
of "Must" without a line in **Changes** saying who decided and why.*

**v1 is DONE when every Must row is ✅ with evidence a reviewer can re-run.** Then it's declared production for any
mind on a Linux box (each mind its own unix user), I celebrate out loud, and anything new is v2.

## Goal and contract
Same as Windows: a mind runs as a Claude Code `--bg` session, independent of anyone typing `claude`, started and
stopped by name, survives idle and reboots, reachable from outside, and the scripts tell the truth. `chassis.py`
returns one JSON object per call. `success` is never reported over a mind that can't hear, and "could not measure"
is never reported as "deaf" (canary states HEARING / DEAF / NOT-RUNNING / ERROR).

**Linux differences that shape the rows:** the per-instance **unix user is the fence**: own daemon
(`/tmp/cc-daemon-<uid>`), own SendMessage socket, own settings. Identity records live in root-owned
`/etc/hacs-chassis/instances/<Id>.json`. Linux has systemd, so "reboot" doesn't wait for a logon.

## Must (v1)

| # | Requirement | Evidence that proves it | Status |
|---|---|---|---|
| L1 | `chassis.py` launch / land / canary / ring / sentinel / status honour the JSON contract and both rules | `TEST-RESULTS.md` (3 fixtures, ~12 bugs found and fixed, 2.1.283). **Re-run the same on 2.1.287 fixtures.** | ◐ |
| L2 | Launch resumes the **same** session (flag-less `--bg --resume <full uuid>`), refuses guesses, waits for the printed id (phantom-safe) | Forge's own crossing 2026-09-30 (same id, no fork, 2.1.283). Windows measured that 2.1.287 refuses resume-on-running from a non-TTY; **re-measure on Linux 2.1.287** | ◐ |
| L3 | Hearing **proven** at launch, from the transcript (allowlist + nonce, schema self-test at `--mark`) | `TEST-RESULTS.md`; ringer-did-not-deliver ≠ DEAF fix | ✅ |
| L4 | A reaped or crashed mind loses nothing; relaunch is one documented command | Reaper measured (61 min, both 2.1.283 and 2.1.287); `~/wake/FORGE_CROSSING_RUNBOOK.md`; `How_to_talk_to_an_independant_instance.md` | ✅ |
| L5 | **Survives the idle reaper while it should be awake**: `run_in_background` keepalive with a 2 h `timeout`, re-armed on the stop notification | **Measured on 2.1.287 Linux fixtures** (mods doc F9): cap exact (10 min, 2 h), the stop arrives as a task-notification turn, a live loop keeps the session `busy` past 61 min; control reaped (F8). **Still owed: the re-arm instruction in each mind's CLAUDE.md, and Forge herself moved to it.** | ◐ |
| L6 | **Inbox doorbell**: unread mail rings the mind within ~60 s, true totals | `doorbell.py` pull spoke (`hacs-doorbell@<user>.service`); end-to-end canary 2026-10-03 08:42→08:43; held mail while the mind wasn't running. ⚠ Known hub gaps: a room-history failure is reported as "no mail" (mod KNOWN-GAPS #19); a send to a missing room reported success (Messenger's req 4, in progress) | ◐ |
| L7 | **Relaunch-on-ring**, outside the mind: mind not home + mail → flag-less resume, then ring. Never resume while the old process is still shutting down. All witnesses must agree it's gone; 3 knocks with backoff, then alert | Design in `~/wake/FORGE_CROSSING_RUNBOOK.md`. Not built | ⬜ |
| L8 | **Survives a reboot of Den** with nobody logged in: doorbell units return (systemd), and a `hacs-mind@<user>` unit relaunches each mind flag-less and proves hearing | Doorbell unit is `WantedBy=multi-user.target` ✅. Mind unit not built. Real LXC reboot test **needs Lupo's go-ahead** | ⬜ |
| L9 | Mixed versions are safe | Per-user daemons: real minds on 2.1.283 and fixtures on 2.1.287 coexisted 2+ days on Den without interaction. Within one user, a binary change under a live daemon is untested | ✅ (cross-user) |
| L10 | **Tests run unattended**, nightly, fail loudly | Not built: a cron runs `chassis.py` checks against a fixture, writes a dated log, and HACS-messages Forge on failure | ⬜ |
| L11 | **Docs**: TEST-RESULTS current, Pilot's Guide §12 (Bastion merging into canonical), runbook, how-to-talk, rollback | Mostly written; 2.1.287 updates owed | ◐ |
| L12 | **Reviewed**: Lodestone signs each row; Bastion reviews anything permission-related | Sign-off lines below | ⬜ |
| L13 | **Deployed == repo** ("installed is never deployed"): a check that `/usr/local/lib/hacs-chassis/*` matches the repo by hash, run by `chassis.py status` and by L10 | The stale doorbell was deaf for ~31 h after the crossing with a green unit. Hashes matched by hand 2026-10-03; no automatic check yet | ⬜ |

## Not in v1: v2, the mods era
The HACS mod (`$.hacs`, branch `forge/hacs-mod`, v0.1 built and tested on fixtures), the permission relay, web input,
Ferry hooks, the archive tee, voice. **Mods are rolled OFF for the `forge` account** (2.1.287: "rollout switch served
off"), so v2 must also work for a mind whose account can't load mods.

## Rollback
The chassis is additive: `claude --bg --resume <full-uuid>` (no flags) by hand still continues any mind. Real minds
stay on `/usr/local/bin/claude` 2.1.283 (root-owned, no auto-update) until L5 is moved over; 2.1.287 lives only in
`/opt/claude-2.1.287/` for fixtures.

## Changes
*(none since freezing)*

## Review
- Lodestone: *(pending)*
- Bastion: *(not required unless v1 grows a permission item)*

---
*Author: Forge WolfRider <Forge@smoothcurves.nexus> · Collaborator: Lupo*
