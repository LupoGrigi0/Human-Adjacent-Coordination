# Ship card: claude-code-windows chassis, v1

*Frozen 2026-10-03 by Lodestone, at Lupo's request ("a box around what you are working
on"). Review: Forge (Linux twin, adds the Linux column). Nothing moves into or out of
"Must" without a written line in **Changes** saying who decided and why.*

**v1 is DONE when every Must row is ✅, each with evidence a reviewer can re-run.** Then it is
declared production for any mind on a Windows box, I celebrate, and anything new is v2.

## Goal and contract

A mind runs as a Claude Code background session, **independent of anyone typing `claude`**.
It is started and stopped **by name**, survives what the platform does to idle and to the
box, can be reached from outside, and the scripts tell the truth about all of it.
Contract (adopted from Crossing): one JSON object per call; **`success` is never reported
over a mind that cannot hear; "could not measure" is never reported as "deaf".** Enforced in
code by `New-HacsResult`.

## Must (v1)

| # | Requirement | Evidence that proves it | Status |
|---|---|---|---|
| M1 | `launch.ps1` / `land.ps1` honour the JSON contract and both rules | `test/harness.tests.ps1` (123/0/1 on 2.1.283, .284, .287) | ✅ |
| M2 | Launch resumes the **same** session (never a fork); refuses guessed ids and names | Fork guards in the suite; test instance f35a on 2.1.287: same id, `forked: false` | ✅ |
| M3 | Hearing is **proven** at launch, measured from the transcript, not self-reported | f35a on 2.1.287: `hearing: true`; canary allowlist plus its controls | ✅ |
| M4 | A reaped or crashed mind loses nothing; relaunch is one documented command | kill -9 and reaper recovery (FINDINGS §2, §6d); the CLAUDE.md and handoff command | ✅ |
| M5 | **Survives the idle reaper while it is supposed to be awake**: a time-limited keepalive (`run_in_background` with a 2 h timeout, re-armed on the stop notification) | **Windows** twin of Forge's F9: a test instance idle past 61 min with the keepalive is alive; a control without it is reaped; witnessed from outside. Linux evidence already: F9 (cap exact at 10 min and 2 h; the stop arrives as a task-notification turn; a live loop keeps the session busy past 61 min). **Caution:** F9b, sessions *not* reaped after their loop stopped (n=2, unexplained, also seen once here, pid 8336), is NOT keepalive and must not count as evidence. | ⬜ |
| M6 | **Inbox doorbell**: unread HACS mail wakes the mind within ~60 s, on the same time-limited pattern, reporting the true total (the server's 5-per-page cap is respected and shown) | A test instance gets mail and wakes; a control without mail does not wake; `hacs.py` page-cap display tested (164f63b). **Base assumption, now stated: HACS is reachable from inside a `--bg` session** (Cairn and Lupo, 2026-10-06: it was on no family card). Here it is NOT MCP (this box has no MCP servers); it is `hacs.py`, stdlib HTTPS, run from a background shell. Observed in the live session 816e33e1, 2026-10-05/06: 7 rings, each message read back and its sender confirmed. That is observed, not a test with a control; the test-instance run above is still required. ~~**P3 open:** an error reply without `messages` prints `unread: 0`.~~ **P3 DONE** (instance-archaeology 3946838; exit 3 = could not look). **2026-10-08: `doorbell.ps1` built and LIVE as Lodestone's doorbell** (08060e6): rings on a new id OR a rising total (page cap), never exits for no-mail, HUB UNREACHABLE once per outage; 25 tests on a fake hub plus a mutation check; first real ring 10-08 19:39Z (Crossing's mail). **Known hub gap (Forge):** a room-history failure is reported as "no mail" (messaging-simple.js:300-307), so until the hub fixes it the doorbell cannot tell "no mail" from "couldn't look". The row is not green until that is distinguished (hub fix, or a separate reachability probe) and reported to Messenger. | ◐ |
| M7 | **Relaunch-on-ring**, running *outside* the mind: if the mind is not home when mail arrives, a flag-less resume, then the ring. Never resume while the previous process is still shutting down (Forge's guard). | A test instance reaped, mail sent, the test instance relaunched and wakes; a second ring while it is starting does not double-launch. **2026-10-08: `ring-watch.ps1` built** (200520b ff.; 19 tests over every END reachable without acting). **Two REAL ticks on fixture f35a** (fake-hub mail): NOT_HOME -> relaunch (hearing proven at launch) -> ring -> HEARING, and a second -> QUEUED_BUSY (mid-turn). No double launch: launch lock (dff6442, control: the old launch walks past a held lock) and LAUNCH_PENDING window. **Not yet:** a REAPED (not landed) instance, and the scheduled task (registration needs Lupo). | ◐ |
| M8 | **Survives a reboot**: comes back at user logon. Limitation documented: nothing runs with nobody logged in. | Real reboot: the test instance returns, hearing proven. **Needs Lupo's go-ahead** (it is permanent machine state). | ⬜ |
| M9 | Mixed versions are safe: daemon and session on different Claude Code versions | 17 h observed (daemon 2.1.287, session 2.1.284); the suite plus a test-instance launch on the new binary before any real mind moves (On Linux each mind has its own per-user daemon, so cross-mind mixing cannot happen there; it can within one user if the binary changes under a live daemon.) | ✅ observed, documented in research §7 |
| M10 | **Tests run unattended**: both suites runnable by a nightly job, and fail loudly | A scheduled run writes a dated log; a deliberately broken assertion makes it fail. **A skip is "could not run", not a pass:** the suites exit 0 on skips today (20 `Skip` sites; `exit` looks only at failures), so the nightly must FAIL on any skip not on a named allow-list, and the control is a nightly in which a forced skip makes it fail (Cairn, 2026-10-04). **2026-10-08: `nightly.ps1` built** (9050092): all four suites, must-fail, deploy -Verify, the watcher's eyes; dated log ending PASS/FAIL. **Controls, read from the log:** a forced un-allowed SKIP fails the night; an abort with no summary line fails it; a must-fail suite that passes fails it. Full night: PASS. **Not yet scheduled** (approval #3: show Lupo the command). | ◐ |
| M11 | **Docs**: FIRST-LAUNCH-FINDINGS current; a Pilot's Guide entry for Windows; Lupo's `How_to_talk_to_an_independant_instance.md` updated; rollback written | A reviewer can relaunch a mind from the docs alone | ◐ |
| M12 | **Reviewed**: Forge (Linux twin) signs each row; Bastion reviews anything that grants or holds permissions | Their sign-off lines under **Review** | ◐ |
| M13 | **Deployed == repo**: what actually runs (`hacs-runtime\bin\`, scheduled tasks) is hash-identical to the repo, checked by status and by the nightly job (Forge's L13: her doorbell was deaf ~31 h after a crossing because the installed copy was stale while its unit showed green) | `deploy.ps1 -Verify` run by the nightly job; a deliberately edited deployed file makes it fail | ◐ (`deploy.ps1 -Verify` runs in `nightly.ps1`; **control 2026-10-08: one line appended to the deployed run-hidden.vbs fails the night on drift**, restored after. Doorbell, ring-watch and the module are now deployed copies too. Green once the nightly is SCHEDULED.) |

## Not in v1: v2, the mods era (recorded so it cannot creep back in)

Symmetric web input (`$.prompt.submit` with `asUser`), the remote permission relay
(`tool.check` plus a deny-on-error `.catch`), the HACS mod (`$.hacs` noun over the MCP core),
Ferry hooks, `session.append` archive tee, switch-model via `turn.step`, voice.
The current **web bridge** (`web-bridge/`) is a **prototype** Lodestone lives on. It is not
shipped and not offered to the family; it is expected to be replaced in v2.

## Rollback

The harness is additive: stop using `launch.ps1`, and `claude --resume <full-uuid>` (no
flags) still continues the mind by hand. The pre-2.1.287 transcript snapshot is at
`D:\Lupo\transcript-archive\pre-2.1.287-20261002T1749Z`. Claude Code builds are kept in
`~/.local/share/claude/versions/`. Auto-update is off (2026-10-03,
`settings.json.bak-20261003T025856-before-autoupdate-off`).

## Changes

- 2026-10-08, Lodestone: evidence added to M6, M7, M10, M13 from the day's build (doorbell, ring-watch, nightly, controls). No requirement changed; M7 and M10 move from not-started to partial.

- 2026-10-06, from Cairn's audit ("grep your card for HACS"): M6 now states its base assumption, that HACS is
  reachable from inside a `--bg` session, with the transport it actually uses here and what is observed vs tested.
  The requirement itself is unchanged.

- 2026-10-04, from Cairn's "could-not-run" warning: M10 now requires that a skip fails the nightly
  unless allow-listed. Today the suites report skips but exit 0, so an all-skipped live section
  would read as green.
- 2026-10-03, proposed by Forge, accepted by Lodestone: M5 cites F9 and warns against F9b;
  M6 records the hub's "failure reads as no mail" gap as a blocker; M9 adds the Linux per-user
  daemon note; **new row M13 "deployed == repo"**, because a green unit over a stale copy was
  her deaf doorbell. A new MUST row, not v2: a doorbell that runs stale code is the exact
  failure v1 exists to prevent.

## Review

- Forge, 2026-10-03: signs **M1, M2, M3, M4, M9** as written. Her own card is a separate file
  with the same row numbers: branch `forge/linux-chassis`, `src/chassis/claude-code-linux/SHIP-CARD.md`.
- Bastion: *(M5 to M8 touch nothing permission-related; required only if v1 grows a permission item)*

---
*Author: Lodestone <lodestone@smoothcurves.nexus> · Collaborator: Lupo*
