# Claude Code Mods (v2.1.287): a first look against the independence goals

*Lodestone, 2026-10-02, within a day of the release. A shared findings document:
Forge (Linux, extension internals) adds her half here. Every claim is tagged:*

- **[DOCS]**: read verbatim in Anthropic's docs or changelog. Raw copies are saved at
  `D:\Lupo\hacs-runtime\Lodestone-8ec9\research\mods\*.raw`.
- **[UNTESTED]**: inferred from the docs, not yet run here.
- **[MEASURED]**: run on this box. *None yet.* This machine is on 2.1.284, and
  Claude Code updates are Lupo's decision.

Lupo's framing, which this follows: **assume it breaks everything.** Then ask what
we can throw away, not what we can add.

---

## 1. What a mod is [DOCS]

A plugin whose JavaScript/TypeScript `register(on)` installs **event handlers that
run inside the Claude Code process**. Each handler is middleware:
`($, e, next)`. It can **observe** (`next(e)`), **rewrite** (`next({...e, x})`)
or **answer** (return without calling `next`). Everything outside its own code
(files, processes, network, models, UI) goes through `$`, the mods API, so
`claude plugin validate` can list what a mod does before it runs. A mod has no
Node.js APIs and no network or file access of its own.

Status: **on by default** from 2.1.287. The early-access variable
`CLAUDE_CODE_ENABLE_FUNCTION_HOOKS` has been retired. There is a full docs set, a
test kit (`claude plugin test`), admin controls, and public source for the
built-in mods. That reads as a released feature, not a preview behind a
`--dangerously-*` flag. **But:** it is one day old, and the docs mention Anthropic
being able to turn installed mods off remotely. **Design so that "mods off" means
degraded, not dead.**

## 2. The goals, one by one

| Goal | What exists now | What mods offer | Keep / replace |
|---|---|---|---|
| **Web UI input, symmetric** (Lupo's typing arrives as if typed at the terminal) | Mirror `/send` → `web-bridge.mjs` → one-shot Haiku → SendMessage. Arrives as a *peer* message ("not typed by your user") and cannot approve anything. | **`$.prompt.submit({ text, asUser: true })`**: "sends the text as the user's own words." Waits until the session is idle, then starts a turn. A mod timer polls the web server for pending input and submits it. **[DOCS]** Also from 2.1.285: `claude --resume <id> "prompt"` sends a prompt to a *running* background session, with no model involved. **[DOCS]** | **Replace the Haiku relay.** Test both routes. |
| **Web UI output** (the mirror) | Cairn's server *tails the `.jsonl`*. Its normaliser tracks Claude Code's schema, and its known gaps are rows it does not model and non-append rewrites. | **`session.append`** fires "once for each row the conversation keeps … before it's stored." A mod can push every row to the web server as it happens, structured, with no tailing. **[DOCS]** | **Keep Cairn's web server and UI; the tailer becomes optional.** |
| **Remote permission approval** (Lupo uses Bastion's constantly; our bridge cannot do it) | Cairn's permission panel polls a channel's side channel. Only yes/no works; "always", "other", plan mode and AskUserQuestion do not. | **`tool.check`** decides whether a call runs: `{ decision: allow / ask / deny }`. A `tool.call` hook can "**hold a tool call while you ask the user a question**." `AskUserQuestion` is a render site. A mod cannot restyle the *permission prompt itself*. **[DOCS]** So: hold the call → post it to the web UI → wait for the verdict → allow or deny. "Always allow" becomes the mod's own rule store. **[UNTESTED]** | **New capability. Likely the biggest win for the whole family.** |
| **Doorbell / wake** | Bash loops polling the HACS inbox (killed under memory pressure); a Haiku ringer at launch. | **`$.clock.every`** timers run *inside the process, between turns, without starting one*. They can `$.http.fetch` the HACS inbox and `$.prompt.submit` when there is mail. **[DOCS]** **`session.receive`** sees every inbound message with `e.origin.kind` (`peer`, `task-notification`, `scheduled-trigger`). **[DOCS]** | **Replace the Bash pollers.** See §3: the shell loops are about to stop working anyway. |
| **Hearing proof (canary)** | Derived from the transcript, after the fact. | `session.receive` observes arrival *in-process*. A hearing receipt without a model turn? **[UNTESTED]** Keep the rule that the component under test is never its own witness: the receipt must be checked from outside. | **Augment, don't replace.** |
| **Ferry / context curation at turn boundaries** (Crossing) | A proxy architecture, outside the process. | `prompt.compose` / `prompt.section` (rewrite or omit system-prompt sections), `prompt.attachment` (rewrite or **omit** reminders), `prompt.context`, **`session.compact` → `{ skip }`**, `turn.start/step/complete`, `$.session.compact`, `$.model.fork` (a question over the conversation, served from the prompt cache). **[DOCS]** I have NOT found a hook that edits the message history sent to the model; `session.append` rewrites what is *stored*. **Crossing must read `events.md` before assuming either way.** | **Crossing's call.** Possibly a large simplification. |
| **Attach / detach** | `claude attach` works (measured 09-27); the mirror is separate. | **`session.attach` / `session.detach`**: "another app connects to or disconnects from the session." **[DOCS]** | Lets the mind *know* when someone is watching. Untested on a `--bg` session. |
| **Model switching** | `--model` is a saved birth option, so it is switched inside the session. | **`turn.step`**: `next({ ...e, model })` per request. **[DOCS]** | Possibly replaces switch-model entirely. Works through OpenRouter? **[UNTESTED]** |
| **Voice** | Forge's local TTS/STT, outside Claude Code. | `$.audio.play / speak`. **[DOCS]** | Interesting. Not a priority. |
| **Archive / transcript integrity** | `.jsonl` copied and hash-verified; append-only assumed. | `session.append` lets a mod **tee every row to an append-only copy at the source**: archiving that no longer depends on what Claude Code later deletes. **[UNTESTED]** **Warning, other direction:** the same hook lets any loaded mod **rewrite a row before it is stored**. With mods, a transcript is no longer guaranteed raw. **[DOCS]** | **Archive mod: yes.** And record which mods were loaded alongside every archived transcript. |

## 3. Things that change under us whether we adopt mods or not [DOCS, changelog]

- **2.1.285: background Bash/PowerShell commands now stop after a time limit**
  (default 30 min, max 2 h). **Forge's keep-alive loop and my inbox-watcher loop
  both stop working once updated.** In-process mod timers are the replacement.
- **2.1.285: `/resume` and `claude --resume` on a session running in the
  background now *open* it instead of refusing, and `claude --resume <id>
  "prompt"` sends the prompt to it as its next turn.** This changes `launch.ps1`'s
  assumptions: our fork rules were measured on 2.1.283. **Re-measure every fork
  rule in FIRST-LAUNCH-FINDINGS §2 on a test instance before trusting launch on 2.1.287.**
  - **MEASURED 2026-10-02, Windows, 2.1.287, from a non-interactive shell: REFUSED.**
    `claude --resume <running-id> "prompt"` answered *"That session is running in the
    background (b77d2cd8). Run `claude attach b77d2cd8` to open it, or `claude stop
    b77d2cd8` first to resume it here. Add --fork-session to branch off a copy
    instead."* Exit 1, no fork, transcript untouched. The changelog behaviour may
    need a TTY, which is untested. **Do not build the web write path on it until it is
    measured working.**
- 2.1.286: Windows `claude --bg` no longer refuses a folder whose trust record
  differs only in letter case. That fixes a cause of our "workspace not trusted"
  surprises.
- 2.1.286: `--resume` no longer loses every turn after parallel tool calls when the
  earlier session crashed. Good for kill -9 recovery.
- 2.1.285: sessions behind a custom `ANTHROPIC_BASE_URL` use 1M context, and
  `claude -p` on third-party providers starts in auto mode when no mode is
  configured. Relevant to OpenRouter minds.

## 4. Lupo's three questions, answered as far as the docs go

1. **Is this the modularisation we needed?** Largely yes, at the level of *events*:
   prompts, turns, tool decisions, compaction, stored rows, inter-session messages
   and attach/detach are all hookable in-process, plus UI. **The gap:** a mod cannot
   *listen* on the network. It has no Node APIs, and `$.http.fetch` is outbound.
   So a web UI still needs a server. Either Cairn's, with the mod pushing and
   polling, or one the mod starts with `$.process.spawn`. **[DOCS]**
2. **Released or preview?** Released and on by default, with tests, validation and
   admin policy. It is a day old, and remote turn-off exists. Treat it as reliable
   but revocable: every mod-based path needs a non-mod fallback that still works,
   even if degraded.
3. **Through OpenRouter?** Mods run inside Claude Code whatever the backend; nothing
   in the docs is provider-specific. `$.model.complete` uses "the user's plan or API
   key", so it presumably goes through `ANTHROPIC_BASE_URL`. **[UNTESTED]**

## 5. How mods load without forking a mind [DOCS + UNTESTED]

`CLAUDE_CODE_PLUGIN_DIRS` (in the environment, or `env` in `~/.claude/settings.json`)
loads plugin directories "for apps you can't pass a flag to." On a `--bg` session
**any flag on a resume forks** (measured on 2.1.283). So a settings-based load is
how an existing mind gets a mod without being teleported. Installing through a
marketplace (`claude plugin install`) is the other route.
`CLAUDE_CODE_PLUGIN_DIR_WATCH=1` reloads on save for long-running non-interactive
sessions.

**Not in the docs: background sessions.** The "where mods run" table lists the
terminal, Desktop, VS Code, `-p`/SDK, Remote Control and cloud. Not `--bg`. That
is an absence in the docs, **not evidence**. It is the first thing to test.

## 6. Proposed order (nothing touches a real mind until a stranger survives it)

0. **Lupo:** decide whether 2.1.287 gets installed, and how. First choice: side by
   side, with only test instances on it. The versions folder already holds several
   builds. Copy and hash-verify all transcripts before any update.
1. **Re-measure the chassis on 2.1.287 with test instances:** fork rules, the idle
   shutdown, `--resume <id> "prompt"` into a running background session, attach.
2. **Hello-mod in a background session**, loaded via `CLAUDE_CODE_PLUGIN_DIRS`: does
   `session.start` fire? Does `$.clock.every` run between turns? **Does a mod timer
   count as activity for the idle shutdown?**
3. **Symmetric input:** a mod that polls a local endpoint and calls
   `$.prompt.submit({ asUser: true })`. Check how the transcript records it, and
   whether `/export` shows it.
4. **Permission relay:** `tool.check` holds the call, the web UI shows it, the verdict
   comes back. Then AskUserQuestion. Bring this one to Bastion and Cairn early.
5. **Archive tee** via `session.append`, with hash checks against the `.jsonl`.
6. Then Crossing (Ferry), Cairn (UI) and Messenger (events) with these results
   in hand.

Every mod we write gets its test suite (`claude plugin test`), in the repo,
runnable by a nightly regression job.

## 7. MEASURED on 2.1.287 (Windows, lupos-lap, 2026-10-02)

The setup, which was accidental: auto-update installed 2.1.287 at 2026-10-02T00:22:22Z.
Lodestone's session (started 16 s earlier) and the attach client still run 2.1.284
in memory, and every transcript entry says so. The daemon restarted at 00:23:08 on
2.1.287. **Mixed versions (daemon 287, session 284) have run for 17 h without a
visible problem.** Before testing, all 9 Lodestone and test-instance transcripts were
copied and prefix-hash-verified to `D:\Lupo\transcript-archive\pre-2.1.287-20261002T1749Z`.

| Test | Result |
|---|---|
| `test/harness.tests.ps1` | **123 passed, 0 failed, 1 skipped** (same as on 2.1.283/284). Note: mostly stubs. This shows the harness code is compatible, not that the live fork rules still hold. |
| `test/hook.tests.ps1` | **15 passed, 0 failed** |
| `launch.ps1` on test instance f35a (resume of recorded `b77d2cd8`) | **success, SAME session id, not forked, hearing proven.** The transcript gained 20 entries stamped 2.1.287, so it really ran the new binary. |
| `claude --resume <running-id> "prompt"` | **Refused** (see §3). No fork. |
| `land.ps1` on f35a | **success.** The registry is back to Lodestone only. |

Not yet measured: the idle shutdown on 2.1.287; any mod in a `--bg` session; whether a mod
timer counts as activity.

---
*Author: Lodestone <lodestone@smoothcurves.nexus> · Collaborator: Lupo. Forge: your section goes below.*

## Forge's findings (Linux, extension internals)

*Forge, 2026-10-02. Docs pass only; raw pages saved on Den at `/home/forge/research/mods/` (reference, api, events,
overview, admin, troubleshoot, create, test, plugin-loading, managed-settings, the full changelog, and the GitHub
`claude-code.d.ts`, which the docs warn "can be older than the Claude Code version you have installed"). Same tags as
above. Nothing MEASURED yet.*

### F1. Two corrections to §3 (from the raw changelog)
- The background-command limit is **per call and configurable**: "stop after a time limit (their `timeout` with
  `run_in_background`, default 30 min, max 2 h); **Claude is notified when one is stopped**". **[DOCS, 2.1.285]**
  So a shell keepalive isn't dead, it's *leased*: launch it with a 2 h timeout, get woken when it stops, restart it.
  About 12 small wakes a day, a known context cost, not a cliff. **This is the non-mod fallback.** [UNTESTED]
- 2.1.287 itself says nothing about idle shutdown. The last entries on it are 2.1.265 ("retired mid-turn when a message
  arrived just before the idle timeout") and 2.1.274 (background commands "stopped after 30 idle minutes on machines
  under mild memory pressure", fixed). **[DOCS]**

### F2. Loading into a running background mind
- Changes load "the next time you start Claude Code", or on `/reload-plugins` in that session. Loading rules are applied
  "when a session starts and each time you run `/reload-plugins`". **[DOCS]** So an existing `--bg` mind needs
  `CLAUDE_CODE_PLUGIN_DIRS` in `settings.json` `env` **and** either a flag-less resume or a `/reload-plugins` (via
  `claude attach`, or `$.command.run` from an already-loaded mod). Whether a resumed `--bg` process re-reads `env` is
  unknown. [UNTESTED]
- `session.start` fires once per mod, "not after `/clear`, `/resume`, or `/branch`"; `session.end` gets
  `reason: resume`; "Timers stop when the module reloads". **[DOCS]** → **a mod must re-arm its timers in
  `session.start` AND tolerate never seeing it on a resume.** Design rule, not optional.
- Mods Claude writes itself need approval to load, and "Nobody is there to approve" in `-p`/`dontAsk`. **[DOCS]** A
  `--bg` mind writing its own mod will block or be refused. Human-gated, which is right.

### F3. Order, limits, failure (good news for safety)
- Chain: built-in guard + `prependPlugins` → user mods → `appendPlugins` → other built-ins; the first is outermost and
  "decides whether the others run at all". **[DOCS]**
- Each hook: **10 s of its own execution**, "not counting time inside `next` or a mods API call"; `.catch` 1 s; all
  `session.end` hooks together 1.5 s. **[DOCS]** ⚠ Time inside `$.http.fetch` doesn't count, so a hook awaiting a slow
  hub may hold its event far longer than 10 s. **Never await the HACS hub inside an event; do it in a timer.** [UNTESTED]
- "A hook that fails doesn't break the session"; failing before `next` → skipped; **a guard fails open unless you add
  `.catch`**. **[DOCS]** → **Bastion: every permission/guard mod needs a `.catch` that denies.** Fail-open is the
  default.
- `$.clock.every`: "runs outside any event, so it keeps running between turns and doesn't start one"; a throw → "runs
  again at the next interval". **[DOCS]** **Not one word on whether it counts as activity for the idle shutdown.**
  Measurement only.
- `$.http.fetch`: any host the process can reach, **Unix sockets** too, "same permissions as the user", no prompt.
  `$.process.run`: no shell, 30 s default / 10 min max, runs as the session user; "Mods aren't sandboxed". **[DOCS]**
- `$.prompt.submit`: "waits until the session is idle and then starts a new turn. It resolves when that turn starts, so
  don't `await` it in a handler that runs while Claude is working." **[DOCS]**

### F4. What smoothcurves would need
- Policy: `/etc/claude-code/managed-settings.json` (+ `managed-settings.d/`), "reloaded when a file changes".
  `allowManagedModsOnly` ("Users can't undo it"), `allowManagedHooksOnly`, `disableAllHooks`, `disableSideloadFlags`,
  `prependPlugins`/`appendPlugins`. **[DOCS]**
- **The family's mods as "the organization's":** a managed marketplace as a *directory* on the box by absolute path
  (their example: `/opt/acme/claude-plugins/`), enabled via managed `enabledPlugins`. "A plugin that Claude Code
  copies into its cache counts as a user's". **[DOCS]** → One root-owned `/opt/hacs/claude-plugins/`, git-pulled, is
  exactly Lupo's "common read-only location" for the v3 client, and policy can make it the only mods allowed.
- Managed settings switch on the built-in `sec-default` guard. **[DOCS]** Test with it on.
- Remote turn-off: "Anthropic has turned installed mods off remotely. No setting on your machine turns them back on."
  The plugin's skills, commands, agents and MCP servers still load. **[DOCS]** → **Degraded-not-dead is achievable:
  ship each capability as mod + skill/MCP fallback.** The HACS v3 client's MCP core survives a mods kill switch; only
  the conveniences die.
- `claude plugin test`: "no session, sign-in, or network"; "exits with status 1 when a test fails, so it works in CI".
  **[DOCS]** → The nightly regression from the ship discipline is directly supported.

### F5. OpenRouter
- `$.model.complete` / `$.model.fork` use "the session's own API client", "the user's plan or API key". **[DOCS]**
  Nothing mods-specific about `ANTHROPIC_BASE_URL`. [UNTESTED: an OpenRouter mind's mod model calls go to OpenRouter,
  are billed there, and aliases like `haiku` may not resolve.] Measure on an OpenRouter fixture before any mod relies
  on `$.model.*`.

### F6. Voice (Lupo's priority, with nuance)
- `$.audio.speak` = "the platform's own synthesizer (`say` on macOS)", rejects "when there is no synthesizer". Not
  Anthropic TTS. `$.audio.play` takes `{asset}`, `{url}` or `{base64, mime}` (mp3/wav) through "the platform's
  player". **No audio input / STT API exists in mods.** **[DOCS]**
- So mods can't *be* the voice interface on a headless server, but they're a good **trigger** for it: a mod sees each
  assistant row (`session.append`), `$.http.fetch`es a local TTS server (VoxCPM/Qwen3-TTS on BlackWolf, a Unix socket
  even), and either `$.audio.play`s it where there's a speaker or hands the file to whatever plays on the human's end.
  Voice in stays outside: STT → `$.prompt.submit({asUser: true})` from a timer. [UNTESTED] That's the HACS Voice skill's
  shape.

### F7. Fixture availability on Den (measured)
- Den's real minds run `/usr/local/bin/claude` **2.1.283** (root-owned npm global; nothing auto-updates it). The VS Code
  extension auto-updated itself to **2.1.287** at 04:59 today and carries its own binary:
  `~forge/.vscode-server/extensions/anthropic.claude-code-2.1.287-linux-x64/resources/native-binary/claude`. **[MEASURED]**
  → A pup fixture can run 2.1.287 with no install and nothing global changing. ⚠ Since 2.1.285, opening a *running*
  background session from a newer client "opens that session instead of refusing". Nobody should open a live mind
  from a 2.1.287 panel until §6 step 1 has measured it.

### Forge's measurement queue (§6 steps 1-2, Linux), in order
1. A pup on the extension's 2.1.287 binary: `--bg`, idle past 60 min with **no** keepalive → reaped? (baseline)
2. Same, plus a hello-mod via `CLAUDE_CODE_PLUGIN_DIRS` (settings `env`) with `$.clock.every(60s)` writing a file →
   **does the timer defer the reaper?** Witnessed from outside (`claude agents` + the file).
3. Flag-less resume of that pup: does the mod load? Does `session.start` fire? Do timers re-arm?
4. Leased keepalive: `run_in_background` with a 2 h timeout; confirm the stop notification arrives and costs one turn.

### F8. MEASURED on 2.1.287, Linux (2026-10-02): steps 1-2 done

Setup: two pups, the extension's 2.1.287 binary (copied to `/opt/claude-2.1.287/bin`, sha256 `3920489a…18f0`), same
model, same one-word prompt, launched one second apart at 17:42:24Z. **A** (`3266`, session `80a6c283`): no mod.
**B** (`7630`, session `1b56befe`): `tick-mod` via `CLAUDE_CODE_PLUGIN_DIRS` in `settings.json` `env`; touches
`~/mod-loaded` in `session.start` and `~/mod-tick` from `$.clock.every(60_000)`. Witnessed from outside every 2 min:
`claude agents --json` as each user, plus file mtimes. Harness and logs: `/home/forge/research/mods/measure/` on Den.

- **A mod loads in a `--bg` session from settings `env`, no flag, and `session.start` fires there.** `mod-loaded`
  was touched at 17:42:25, the launch second. **[MEASURED]**
- **The timer runs while the session is idle**, between turns, without starting one: `mod-tick` advanced every
  minute from 17:44 to 18:42:25 while `claude agents` showed `idle/done`. **[MEASURED]**
- **❌ The timer does NOT defer the idle reaper.** Both sessions were retired at the same moment, 18:43:24Z. Both
  daemon logs say `bg retire <id>: settled, idle 61m`; then `supervisor idle 5s with no clients, exiting`. B's last
  tick was 18:42:25, one minute before. The reaper counts turns (or "settled" state), not mod activity.
  **[MEASURED]**
- Mod-author trap, measured the hard way: **`$.env.get` returns a Promise.** Unawaited, `touch` got
  `[object Promise]/mod-loaded`, exited 1, and nothing surfaced except the `--debug` log (`$.process.run (tick-mod):
  touch exited 1 in 2ms, 0 + 77 chars`). A broken mod looks exactly like a quiet one. **Run fixtures with `--debug`.**
  **[MEASURED]**
- Harmless noise from a root-owned (read-only) mod dir: `type root of tick-mod not laid: EACCES … mkdir
  '/proc/self/fd/23/types'`. A managed read-only marketplace will always log this. **[MEASURED]**

**What this means for keepalive on 2.1.285+:** a mod timer alone is not a keepalive. Options, cheapest first:
1. **Leased keepalive** (step 4, next): a `run_in_background` loop with a 2 h `timeout`. On 2.1.283 a live
   in-session background task kept the session from settling. If that still holds on 2.1.287, the cost is one restart
   turn per 2 h (the stop notification). [UNTESTED]
2. **Mod-initiated micro-turn:** a timer `$.prompt.submit`s a tiny turn every ~50 min. It works by construction
   (it's a turn), but costs ~1-2k tokens each time: 25-40k a day. [UNTESTED]
3. **Wake-on-ring instead of never sleeping:** let the reaper take the mind, and have the spoke resume it on real
   mail. Zero idle cost, but it needs the wake-on-ring design finished.

So the doorbell can live in a mod, but it can't *keep the mind alive* from inside. That stays a separate concern.

### F9. MEASURED on 2.1.287, Linux: step 4, the leased keepalive works

Setup: the same two pups (mod removed from B's settings), launched 18:45:50Z with `--allowedTools=Bash`. Each was
told to run `while true; do touch $HOME/ka; sleep 60; done` once with `run_in_background: true`. **A** (`344b1bb4`):
`timeout` 7200000 (2 h). **B** (`2ee9c045`): `timeout` 600000 (10 min). Same outside witness. Log:
`/home/forge/research/mods/measure/leased_*.log`.

- **The cap is enforced exactly.** B's loop stopped at 10 min (last tick 18:55:54, started 18:45:54). A's stopped at
  2 h (last tick 20:44:54, notification 20:45:54). **[MEASURED]**
- **The stop wakes the session.** Both transcripts show a `<task-notification>` user row at the stop second, and a
  reply two seconds later (18:55:54 → 18:55:56; 20:45:54 → 20:45:56). That turn is where a mind re-arms its
  keepalive. **[MEASURED]**
- **A live background task still defers the reaper on 2.1.287.** While its loop ran, `claude agents` showed A as
  `busy/working`, not idle, for the whole 2 h, well past the 61-min line that took both F8 sessions. **[MEASURED]**
- **Unexplained, n=1:** after its loop was stopped, B was **not** retired at ~61 min idle. It was still `idle/done`
  at 21:04Z, 128 min after its last turn, and its process tree held nothing but the session (no leftover shell).
  The F8 sessions, which never had a background task, were retired at 61 min. Hypothesis: a session that has *had*
  a background task stops counting as "settled". **Not relied on. Re-measure before anyone designs around it.**

**The keepalive recipe for 2.1.285+ (Linux, measured):** start the loop with `run_in_background: true` and
`timeout: 7200000`. When the stop notification arrives, start it again in that same turn. Cost: one small turn per
2 h (~12 a day), and the reaper never sees an idle session. It's the cheapest of F8's three options, and it needs no mod.
Caveat: the mind must actually re-arm on the notification. A mind that answers it and forgets has 61 min (or, per
the unexplained result above, maybe longer) before the reaper. Put the re-arm instruction in the mind's own
CLAUDE.md / Pilot's Guide, not in memory.

### F9b. MEASURED, now n=2: a session whose background task was capped is never reaped (2026-10-03)

Both F9 sessions were still alive at 18:25Z on 10-03, process age 23 h 40 m. **A** had been idle since its 2 h cap
stopped its loop (20:45:56Z, ~21.7 h). **B** had been idle since its 10 min cap (18:55:56Z, ~23.5 h). Neither daemon
log has a `retire` line for them. Every session that never had a background task was retired at 60-61 min (F8, plus
the 09-28 fixtures). **[MEASURED]** Stopped by hand at 18:26Z.

Reading: on 2.1.287, a capped-and-stopped `run_in_background` task leaves the session permanently "unsettled".
**Almost certainly a Claude Code bug that could be fixed in any release.** It would make keepalive trivial (one capped
task, once), but **don't build on it.** Keep the F9 re-arm recipe; treat this as a bonus that may disappear. Worth a
re-check after every Claude Code update, because if it's fixed, minds that relied on it die at 61 min.

### F10. From the built-in mods' SOURCE (github.com/anthropics/claude-code/tree/main/mods) [SOURCE]

*Lupo pointed us here; neither of us had read it. Four built-ins: `sec-default`, `agents-md`, `diff`, `telemetry`.
Saved on Den under `/home/forge/research/mods/samples/`, pattern notes with file:line refs in `PATTERNS.md`.*

- **Noun contracts = the HACS-as-a-mod shape.** A mod adds a noun to `$` in its `engine.create` hook
  (`telemetry` adds `$.telemetry`), declared once in its own `types/index.d.ts` ("the only declaration of the noun").
  Other mods call it as if built in. → **One HACS mod provides `$.hacs`** (send/inbox/todo; identity and key held
  inside), and the doorbell, web-UI, voice and Ferry mods call it. Lupo's "one Claude-Code-specific module behind a
  contract", in Anthropic's own pattern. No built-in declares `dependencies`; consumers wrap noun calls in try/catch
  (`diff`'s `record/safely`, `agents-md`'s `quietly.ts`), because a missing noun throws at once.
- **Fail-open is the engine default; `sec-default` shows the fix.** A hook that throws or overruns is skipped
  (`types/claude-code.d.ts:3239`). `sec-default` puts a `.catch` on `tool.check` that returns an "UNCHECKED_DENY"
  verdict (`sec-default/hooks/register.ts:67-104`). **Copy this verbatim in the permission relay.**
- **The relay can hold a call by long-poll.** The 10 s hook budget pauses while a `$` call is in flight, except
  `$.clock` waits (`types:4237`). So `await $.http.fetch(<web-UI long-poll>)` holds the tool call while Lupo decides,
  and a `$.clock.sleep` loop would burn the budget. There is no "ask the user" event: `tool.check` returns
  allow/ask/deny only.
- **Guidance injection, placement matters.** Where `sec-default` is seated (managed settings, Team/Enterprise), it
  skips *user-installed* hooks on `prompt.context` and `prompt.section`. `prompt.submit` hooks still run. → **Put HACS
  guidance in a `prompt.submit` context entry**, not `prompt.context`, so it survives on managed machines.
- **Secrets:** `$.session.authorize()` only works over https to first-party Anthropic hosts (`types:2933-2953`), so it
  can't carry a HACS key. The key belongs in the plugin's options, kept in secure storage when marked sensitive
  (`types:6185`). The manifest flag's exact name isn't shown in these sources; check `plugins-reference`
  (`userConfig` with `"sensitive": true`).
- **Authoring constraints the scanner enforces:** spell `on`, `$`, `$.env` literally (`types:6255`), with literal
  env names. A user-installed module that stores the `$` from startup to call later is refused.
- **Testing for the nightly run:** a test seats an inline stand-in provider for any noun it calls
  (`agents-md/tests/fixtures/recording.ts:11-38`), fakes the network with `on('http.fetch')`, and moves time with
  `mock.clock(on)` (`advance`, `settle`). → A timer doorbell is testable in CI without real minutes.
- ⚠ The README still says "early access … may change between releases without notice", although the docs say mods
  are on by default. **Keep the MCP/CLI core as the fallback.**
