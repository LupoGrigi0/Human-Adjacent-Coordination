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
