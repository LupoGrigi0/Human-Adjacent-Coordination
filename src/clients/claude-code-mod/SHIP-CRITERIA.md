# HACS mod for Claude Code: ship criteria (FROZEN for v0.1)

*Forge, 2026-10-03, written before any code, per the ship discipline (`hacs_v3_client_and_ship_discipline.md`).
Lupo's direction, 2026-10-03: "the core HACS server API stays; mods become a client like many other clients (but the
client everybody can use)". Config and status in `~/preferences.json`. Secrets in a gitignore-able dir, never in a
mind's context. Works with OpenRouter minds too. Goals and criteria are wanted, with progressive disclosure and good
guidance.*

**"Shipped" for v0.1 means:** Forge runs it on a 2.1.287 fixture and then on herself; every criterion below passes its
named check; known gaps are written in `KNOWN-GAPS.md`. Anything new found during the build goes on the v0.2 list,
unless it's data loss, security, or harm to a mind's continuity.

## v0.1 criteria (each has a check)

1. **`$.hacs` noun** (noun-contract pattern from the built-in `telemetry` mod): `send(to, subject, body)`,
   `inbox({limit})`, `read(id)`, `lists()`. Identity comes from `~/preferences.json` (`hacs.instanceId`), never from
   arguments. *Check:* unit tests through `claude plugin test` with a faked hub (`on('http.fetch')`).
2. **Fails loudly, never silently.**
   - A hub error, a timeout, or `success: false` **throws with the reason**.
   - `send` verifies `delivered_to_id` equals `to`, case-insensitive, and throws on mismatch (the "--force" → "Forge"
     lesson).
   - *Check:* tests for each failure case.
3. **`/hacs` command, zero model tokens:** `/hacs`, `/hacs inbox`, `/hacs read <id>`, `/hacs lists`, `/hacs help`.
   Returns ≤ 12 lines of text via `command.run`, and never starts a turn. *Check:* tests assert the line count, and
   that no `prompt.submit` happens.
4. **Status line, honest:** a `$.clock.every` timer (default 60 s) shows `hacs: N unread`. It shows
   **`hacs: hub unreachable`** when it couldn't look, which is never shown as 0. It never starts a turn. *Check:* tests
   with `mock.clock`, covering the unreachable ≠ 0 case.
5. **Doorbell, OFF by default** (`hacs.doorbell: true` to enable): new mail → one `$.prompt.submit` notice per message
   id. Already-rung ids persist (`$.store`), so a resume doesn't re-ring. *Check:* tests for dedupe across a reload.
6. **Guidance via `prompt.submit` context** (survives `sec-default` on managed machines): ≤ 6 lines, only when the
   inbox has unread mail or on the first prompt of a session. It points to `/hacs help` (progressive disclosure),
   never a wall of text. *Check:* tests for the size limit and the conditions.
7. **Config + status in `~/preferences.json`** under a `hacs` key: config (instanceId, hub URL, poll seconds,
   doorbell on/off) plus status (`lastPollAt`, `lastPollOk`, `unread`, `lastError`, `modVersion`) for UIs and
   managers. Writes are atomic and merge only the `hacs` key, never clobbering other keys. *Check:* tests via a mocked
   `$.process.run` helper, plus a fixture run showing the file updated.
8. **Secrets never reach context:** anything secret lives in `~/.hacs_secrets/` (0700). The mod reads it only inside
   its own code, never returns it, and never logs it. *Check:* a test feeds a canary secret and asserts it appears in
   no command output, status line, prompt context or preferences write.
9. **Validates and tests clean:** `claude plugin validate --strict` passes and `claude plugin test` is green on
   2.1.287, headless, runnable by anyone from the repo. *Check:* the commands themselves.
10. **Degrades, never breaks the mind:**
    - If mods are off, the `hacs` CLI still works (unchanged).
    - If the mod throws, the session continues (engine fail-open is fine here: no guard semantics in v0.1).
    - *Check:* a fixture with the mod dir removed mid-run.

## v0.2 list (NOT v0.1, by decision)
Goals and criteria with progressive disclosure (`/hacs goals`); projects; task create/complete; per-mind API keys
(Bastion's design: blocked on the hub having keys); OpenRouter fixture verification of `$.model.*`-free paths; web-UI
event push (`session.append`, Cairn); permission relay (Lodestone); voice trigger; `/hacs send` from the composer.

## Changes (each with who decided and why)
- **2026-10-04, Lupo:** criterion 7's file is **`preferences.json` in the directory Claude Code was launched from**,
  not `~/preferences.json`. On smoothcurves and Den they're the same (each mind is its own user, launched from its
  home), but the framework is for the community too, where most people don't give each session its own uid and
  home, and the software shouldn't impose that. Implementation: take the launch dir from `session.start` `e.cwd`
  (not `HOME`, and not a later cwd change). Still part of v0.1: it's a correction to a criterion, not a feature.
  **Done (tests: `tests/launchdir.test.ts`: "LD preferences are read from the launch dir (e.cwd), not HOME, when
  they differ", "LD a later session.start with another cwd does not move the preferences", "LD secrets are read
  from <launchDir>/.hacs_secrets and the canary still never leaks", "LD the ~/.hacs-identity fallback still reads
  from HOME, not the launch dir", "LD a session.start with no usable cwd falls back to HOME, and /hacs says so";
  `tests/helper/test_prefs_merge.py`: `test_writes_the_path_it_is_given_never_home`).**
  **Live proof, the check a `$HOME` implementation would FAIL** (Cairn's rule: test where the wrong implementation
  fails; on our boxes home == launch dir, so unit tests alone can't tell them apart): `tests/live/launchdir_live.sh`,
  2026-10-04 on fixture 7630, launched from `/tmp/hacs-launchdir-test`. `/hacs` reported that path; that file gained
  all 11 status fields with its unrelated key kept; the home `preferences.json` was byte-identical before and after.
