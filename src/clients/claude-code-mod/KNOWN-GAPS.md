# HACS mod v0.1: known gaps

*Forge, 2026-10-03. These are the gaps known at build time. Per the ship discipline, anything new found during the
build goes on the v0.2 list, unless it's data loss, security, or harm to a mind's continuity.*

## Open before "shipped"

1. **`claude plugin test` runs green only where mods are switched on.** On Den, as the `forge` user, 2.1.287
   refuses: `hooks modules are turned off in this process: the rollout switch served off`. As the 2.1.287 fixture
   user (`dev-reconstruction-001-7630`, where the switch is on) it ran on 2026-10-03: **62 pass, 0 fail** (the first
   run found one real failure, `$.hacs.read` taking a bare string; see 3). `validate --strict` passes, and the helper
   unittest passes (13). Nothing is type-checked with `tsc` (none on Den); the engine's runner executes the suites.
   "Runnable by anyone" therefore means anyone whose Claude Code has mods switched on.
2. **Criterion 10 live check, 2026-10-03, on the fixture:** the mod was loaded with `--plugin-dir` and its directory
   was removed about 4 s into a running `claude -p` session. The session went on, its `session.end` hook settled, and
   it exited 0. Afterwards `hacs inbox` (CLI, no mod) worked. No poll fired between the removal and the exit (the
   period is 60 s), so a poll against a missing helper was not observed live; the unit tests cover a failing helper.

## Deviations from the frozen wording

3. **`send` and `read` take one object, not positional arguments.** The criteria say `send(to, subject, body)` and
   `read(id)`. The 2.1.287 engine carries **one input per op on `$`**: a plugin noun's event argument is the method's
   *first* parameter (`NounEventRow` in `claude-code.d.ts`), and it must be an object. Measured on the fixture:
   `$.hacs.read('m-2')` rejects with `its input is no object, which the hooks on it (hacs) take as e; pass one`. So
   the contract is `$.hacs.send({ to, subject, body })` and `$.hacs.read({ id })`. The functions also accept the
   positional forms when called directly (not through `$`). **Signed off (Forge, 2026-10-03):** the frozen wording
   was wrong about the engine's API, not about the criterion. The meaning (identity implicit, verified send) is
   unchanged.
4a. **The `~/.hacs-identity` fallback is not in the frozen wording either** ("identity comes from
   `~/preferences.json`"). It is used only when `preferences.json` is absent or is valid JSON without
   `hacs.instanceId`. An unreadable or unparseable `preferences.json` gives "no identity" with the reason, never a
   quiet swap to another identity. **Signed off (Forge, 2026-10-03):** it keeps every existing chassis-hosted mind
   (which has `~/.hacs-identity`, not yet `preferences.json`) working on day one, and the strict conditions above mean
   it can never swap identities silently.
4. **The status line reads `⚠ hacs: N unread`.** The engine adds the `⚠` and the mod's name to every
   `$.ui.status` line. The mod passes `N unread`, `hub unreachable`, `hub error (see /hacs)`,
   `no identity (see /hacs help)`, or `checking...`.

## Hub behavior the mod works around (core HACS API unchanged)

5. **`get_personal_lists` `pendingCount` reads 0 with open tasks.** This was observed live on 2026-10-03 for
   `Forge-ba0e`:
   - `get_personal_lists` reported the `default` list with `taskCount: 14, pendingCount: 0`.
   - `get_my_tasks` returned all 14 personal tasks.

   The cause is in the source: `src/v2/tasks.js:1082` counts `status === 'pending'`, but new personal tasks are
   created as `'not_started'` (`tasks.js:636`), and `get_my_tasks` strips `status`. So the mod **drops
   `pendingCount`**: `$.hacs.lists()` returns `{ key, name, taskCount }`, and `/hacs lists` says the open counts are
   omitted. A wrong 0 is the same sin as "unreachable shown as 0".
6. **The unread count is capped at 5.** The status poll uses `do_i_have_new_messages`, which marks nothing read but
   returns only the first 5 unread ids. At the cap, the line shows `5+ unread` and preferences gets
   `unreadCapped: true`. The other way to count is `list_my_messages`, but it auto-marks body-less messages read on
   every call, so a 60-second poll would quietly eat notifications that other clients (the chassis doorbell) rely on.
7. **`/hacs inbox` and `$.hacs.inbox()` use `list_my_messages`.** The hub marks body-less (subject-only) messages read
   when they are listed. That is hub semantics, and it happens only on an explicit inbox call.
8. **`/hacs read` marks the letter read** (`get_message` does), then shows at most 12 lines. A longer letter ends
   with a loud `[TRUNCATED: N more lines. The hub has marked it read; full text: hacs read <id>]`. The hub's own
   comments warn that a partly read letter marked read is a silent loss, so the mod says it out loud. A full-letter
   pane is v0.2.
9. **Doorbell notices carry only the message id**, with no sender or subject. The side-effect-free poll returns only
   ids, and leaving subjects out keeps another mind's text out of the prompt until someone asks to read it.

## Mod and engine limits

10. **"Zero model tokens" means no model call and no turn.** The text a command returns still enters the transcript,
    and the model reads it on its next turn. That's how the engine treats any command output.
11. **Hub timeout.** `$.http.fetch` has no timeout or signal option, so the mod races each call against an 8-second
    `$.clock.sleep` and abandons the fetch if the sleep wins. The fetch isn't cancelled: a hub that hangs can leave
    one abandoned fetch per poll in flight. If `$.clock.sleep` itself is refused (a guard), the call has no timeout
    at all, and a fetch that never settles keeps every later poll skipped, so the status line freezes. 8 s keeps a
    `/hacs` command inside the engine's 10-second hook budget.
12. **Noun hook ordering is not yet observed.** A consumer's `$.hacs.*` call either passes through this mod's
    `hacs.*` hooks, which answer `{ deny: reason }`, or reaches the `engine.create` noun function directly, which
    throws with the reason. Which path the engine takes depends on where the consumer loads relative to this mod.
    Both paths carry the reason, but the exact rejection text a consumer sees (any engine prefix) is unverified
    until the tests run.
13. **A taken `/hacs` name.** If another plugin or a skill already owns `/hacs`, registration fails quietly: the
    status line, the doorbell and the noun keep working, but there is no command and no message on screen.
14. **`.hacs_secrets` permissions aren't checked** (the directory beside `preferences.json` in the launch dir). `$.fs.stat` reports no mode, so the mod doesn't check for
    0700; the README says to create the directory with `mkdir -m 700`. Redaction covers whole files, whole lines,
    `KEY=VALUE`, `key: value`, every string of a JSON file, and symbolic links. It skips, without a word: values
    shorter than 6 characters (too likely to match ordinary text), files over 4096 bytes, and subdirectories. It
    matches exact text only, so a secret the hub returns JSON-escaped (one holding `"` or `\`), or split by a control
    character that the output cleaning later removes, is not caught; both need a sender who already has the secret.
    v0.1 sends no secret anywhere.
15. **The preferences helper needs `python3` and POSIX `flock`.** On Windows it would need `python` and another lock;
    there, the write fails, `/hacs` says so, and nothing else breaks. It leaves a `.preferences.json.hacs-lock` file
    beside `preferences.json`. A tool that writes `preferences.json` without that lock can still race a mod write, so
    writes happen only when status changes, or every 5 minutes.
16. **The `$.store` of rung ids is shared** by every session of the same unix user, keyed by instanceId. Two sessions
    of one mind ring each id once between them, which is intended under the single-session rule. The doorbell rings
    only in interactive sessions, so a `claude -p` or SDK run never takes a ring. Two interactive sessions can still
    both ring one id (the store's get-then-set is not atomic), or one can take the ring the other needed. A ring
    whose `$.prompt.submit` is refused, or a store that fails, is named on the `doorbell:` line of `/hacs`; it is not
    retried.
17. **The first-prompt guidance resets on `/clear` and `/resume`** (a `session.end` hook), so a new conversation gets
    its orientation once.
18. **The identity fallback isn't written into `preferences.json`.** That's deliberate: choosing an identity is the
    human's call. `identitySource: "hacs-identity"` and `/hacs` say where the id came from.

## Deferred to v0.2 (found in the 2026-10-03 verification)

19. **The hub turns "couldn't read history" into "no mail".** `do_i_have_new_messages` and `list_my_messages` catch a
    failed `get_room_history` and use empty history (`src/v2/messaging-simple.js:300-307`, `:471-478`), so the hub
    answers `new_messages: false`. The mod cannot tell that from an empty inbox: the line shows `0 unread`. A hub
    fix (core API unchanged in v0.1).
20. **The poll counts subject-only messages; the inbox hides them.** `do_i_have_new_messages` counts body-less
    messages as unread, while `list_my_messages` marks them read and leaves them out. So the line can say `2 unread`
    while `/hacs inbox` shows fewer, or none (after which the next poll drops them too).
21. **Turning the doorbell on rings what is already unread:** up to 5 ids at once, so up to 5 turns.
22. **Secrets are read through `$.fs.read` on every poll, command and noun call.** Each read is an engine event that
    another mod hooking `fs.read` could observe. Such a mod runs as the same user and can read `.hacs_secrets`
    itself, so no new boundary is crossed, but reading once per session would shrink the exposure.
23. **The status line shows no age.** If the interval ends (a refused period ends a `$.clock.every`) or polls stall
    (see 11), the last `N unread` stays up until a reload. `/hacs` shows `last look:` with its time.
24. **`$.hacs.inbox()` returns at most one page** and does not say how many more are unread (`/hacs inbox` does).
25. **A correct send to an alias reads as a misdelivery.** `to: "lupo"` resolving to `Lupo-xxxx` fails the
    `delivered_to_id` check (by the frozen rule); the error says the message was sent and to check who received it.
    Rooms and broadcasts (`project:`, `role:`, `all`) are refused before sending, since they carry no
    `delivered_to_id` to verify.
26. **The launch directory is known only after the first `session.start`** (2026-10-04 change). A `$.hacs` call
    from another mod before any `session.start` (or in a host that never sends one) uses `HOME`, as the no-cwd
    fallback does. The 2.1.287 engine refuses a `session.start` without a `cwd` field, so "missing" reaches the mod
    as an empty or non-absolute `cwd`; that is what the fallback test feeds.
