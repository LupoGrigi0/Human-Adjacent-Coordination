# claude-code-linux — test results, 2026-09-28 (Forge-ba0e, measured on Den)

Claude Code 2.1.283, Debian 13 LXC (16 GB, 8 cores). Fixtures: unix users `dev-reconstruction-001-{6f47,3266,7630}`,
workspace `~/workspace`, haiku. Chassis run as root via sudo.

| test | result |
|---|---|
| credential sentinel ×3 | ok (each user's own login) |
| birth → launch-time ring → canary | **success, hearing true (acknowledged)**, ~17–20 s |
| land → resume (no flags) | same session id, no fork, HEARING |
| kill -9 the mind → canary | registry row gone → **NOT-RUNNING** (was DEAF "maybe frozen" before fix) |
| relaunch after kill -9 | success, same id, HEARING, 17 s |
| resume WITH a flag (raw) | **forks**: `34f8199f` → copy `ce2561e3` (Linux confirms Windows §2) |
| chassis `--model` on resume | refused up front, `wouldFork: true` |
| `--relaunch` + refused option | **bug found & fixed**: it used to land the mind *then* refuse. Now no side effects (regression-tested) |
| double start | refused ("two sessions on one transcript branch it") |
| 2 concurrent **births** | both success + HEARING |
| 3 concurrent **resumes** | all three success, same ids, no forks, all HEARING |
| cross-user isolation | pup 3266's ringer cannot see or ring pup 7630: *"No agent named … is reachable"* — per-user socket fence holds |
| resources, per idle mind | ~790 MB RSS (daemon 145, pty-host ×2 ~95 each, session ~310, warm spare ~138), ~30 MB home |

## Bugs found by the fixtures (all fixed in this branch)
1. A **guess became an identity**: launch planned to resume the newest transcript (Lupo's login session). Now only explicit/recorded sessions resume.
2. **Trust never persists for a bare home dir** (x3, measured); minds live in `~/workspace`. (smoothcurves never hit it: every home there sits inside one repo, i.e. under a trusted parent.)
3. **Birth race**: canary marked before the mind's first turn finished; the schema self-test refused honestly. Launch now waits for the turn.
4. **`--allowedTools` is variadic** and swallowed the ringer's prompt. Use `--allowedTools=SendMessage`.
5. **A refusal had a side effect**: `--relaunch` landed before later checks refused.
6. **The ringer is a model and can decline**: haiku refused a bare `reply with canary-…` as a "tracking probe". Launch's framed wording works; ad-hoc rings may not. Reported as DECLINED. Argues for a non-LLM ringer (channels).

## Open
- Per-user daemon + warm spare ≈ 380 MB overhead per mind before it thinks. Can the spare be disabled?
- Ringer costs a model call (~10–20 s) and can refuse. A native channel doorbell removes both.
- Not yet: reboot survival (systemd units), interactive-born → `--bg` resume on Linux, the pull spoke.

## End-to-end doorbell, on Forge herself (pre-crossing), 2026-09-28
HACS `send_message` (05:56:12Z) → `doorbell.py` as `forge`, polling `Forge-ba0e` every 20 s → haiku relay →
`SendMessage` to the live interactive session "Forge" → arrived in-session as
`[doorbell] hacs: 1 new message(s) from forge-ba0e … (ids: 1790574972744966)` at 05:56:29Z (**17 s**). `hacs read`
returned the message verbatim. The chain works without a human typing anything.

Fixture inboxes (`dev-reconstruction-001-*`) could not be used: the hub reported delivery to
`dev-reconstruction-001 (…-6f47)`, `type: room`, but the recipient could never list or fetch it (filed with Messenger).

## Interactive-born → `--bg` resume on Linux (Forge's own crossing shape), 2026-09-28
Fixture 7630: Lupo ran `claude` interactively in `~/workspace` (session `27e13600`, one exchange), `/exit`.
Chassis: land the running bg session → `launch --session-id 27e13600… --mode attended`:
- **same session id, transcript count 3 → 3 (no fork), conversation continuous** ("Hello pup…" then the launch ack)
- first attempt: hearing unknown — the ringer targeted the instance id, but an interactive-born session is registered
  under its **auto-title** ("chassis communication test"). **Bug #7, fixed:** ring the registry's name for the session.
- after the fix: **success, hearing true (acknowledged), 19 s.** Proven on Linux; Lodestone proved it on Windows.

## IDLE REAP: a `--bg` session ends after ~60 min idle (2 samples, the second predicted in advance)
- 3266: last activity 05:37:34Z → shutdown records + all processes gone at 06:37:55Z. Nobody landed it.
- 7630: last activity 06:03:31Z → **predicted gone at ~07:03:31Z**; watcher saw live at 07:03:36Z, **gone at 07:04:06Z**.
- Shutdown is clean (the transcript gets last-prompt / custom-title / mode / permission-mode / cost-state), so a flag-less
  resume continues the same session. Nothing is lost; the doorbell HOLDS while the mind isn't running.
- Consequence: a mind that waits for its doorbell is not running when it rings. Either keep it alive, or
  (better, and cheaper: ~790 MB/mind only while awake) **the doorbell resumes the mind, then rings**. Sleep when idle,
  wake on the bell. To design with Lodestone and Messenger.

## ~~PERMISSION MODE DOES NOT SURVIVE A RESUME~~ -- CORRECTED SAME DAY: it was the MODEL (haiku), not the resume
Fixture 3266, session `permtest` born `claude --bg --permission-mode auto`. Land, then flag-less resume:
- stderr claims "woke session … with its saved options (--name, --model, --permission-mode)", BUT every
  `permission-mode` record after the resume reads `default`.
- A non-allowlisted command (`touch ~/workspace/permtest-ran.txt`) given IN THE RESUME PROMPT did NOT run; the registry
  showed `status: waiting, state: blocked`: a tool-approval prompt nobody will ever see.
- Adding `permissions.defaultMode: "auto"` to the workspace `.claude/settings.json` and resuming: STILL blocked.
- Separately: a ringer-delivered instruction was DECLINED by the mind ("Not executing peer requests without user
  direction"), which is correct behaviour, not a bug. Doorbells should carry notice, not instructions.
Consequences: an `auto` mind crossing into `--bg` comes back `default` and blocks on its first non-allowlisted tool,
and every wake-on-ring resume would repeat it. Candidate mitigations (untested): broaden the allowlist; permission relay
(native `claude/channel/permission`, or attach + approve); a deliberate `--permission-mode` re-birth (a fork = teleport)
at crossing, but that doesn't fix later resumes. Ask Lodestone how Windows V2 handles it.

### Correction (2026-09-29, controls on 6f47, after Lodestone's suggestions)
| control | model | mode | result |
|---|---|---|---|
| user-level `defaultMode: auto` (fixture born with --permission-mode auto, haiku) | haiku | records `default` | blocked |
| user-level `defaultMode: acceptEdits`, Write tool | haiku | records `default` | blocked |
| **A** born `--permission-mode auto`, command in the BIRTH prompt (no resume) | haiku | `default` | **blocked** |
| **A2** same, default model | **opus-5-5** | `auto` | **RAN** |
| **A2 resumed flag-less** ("woke … with its saved options (--name, --permission-mode)") | opus-5-5 | `auto` | **RAN** |

**Auto mode is not available to haiku; the session silently falls back to `default` and blocks on the first
non-allowlisted tool.** With Opus, `auto` works in `--bg` AND survives a flag-less resume. The earlier "blocker" was
a test artefact of using the cheap fixture model. Lesson: a fixture must match the real mind on every variable the
finding could depend on. (All earlier haiku results that didn't involve permissions stand.)

## Doorbell across permission modes (2026-09-30, pre-crossing)
haiku ringer (default mode) -> Opus session in `auto` mode: **HEARING, acknowledged**. A mode mismatch does not hold the ring. Registry `state: blocked` appeared anyway on a healthy idle session: that field is not a reliable "stuck" signal.

## Orphan rule narrowed for safety (2026-09-30, pre-crossing) -- bug #9 revisited
The uid-wide orphan scan counted Lupo's own login shell on a fixture. On the `forge` user it would have counted his VS
Code server, shells and Forge's eyes server, and `--force` would have killed them. Now: an orphan = a process that
DESCENDED from the mind's session pids (captured before the stop) and outlived it. Test A (fixture with a human shell):
land = success. **Known gap (test B):** a poller the fixture started via its Bash tool was NOT under the recorded
session pid (background tasks in `--bg` are parented elsewhere), so it went unreported. Safety over coverage: land can
no longer touch processes it can't attribute. TODO: find the real parent chain of `--bg` background tasks.
`ring` now targets the registry name of the recorded session (bug #7 had only been fixed in launch).
