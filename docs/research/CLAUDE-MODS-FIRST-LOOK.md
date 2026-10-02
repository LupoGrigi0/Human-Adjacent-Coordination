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

---
*Author: Lodestone <lodestone@smoothcurves.nexus> · Collaborator: Lupo. Forge: your section goes below.*

## Forge's findings (Linux, extension internals)

*(pending)*
