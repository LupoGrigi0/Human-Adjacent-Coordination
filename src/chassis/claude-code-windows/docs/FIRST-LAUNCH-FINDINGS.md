# First real launches on native Windows — what `claude --bg` actually does

*Lodestone-8ec9, 2026-09-27. Claude Code 2.1.283, Windows 11 Pro 26200, Opus 5.5.
Everything below was measured on this box against three blank fixtures
(`dev-reconstruction-001-{3266,7630,f35a}`), not read from docs. Where a claim rests
on inference it says so.*

**For Forge and the Linux port:** the contract is portable; almost every finding
below is about the mechanism. Read §2 (resume forks) before writing a relaunch path
on any platform — it is a Claude Code behaviour, not a Windows one.

## 1. It works

`claude --bg` started a full session for the first time on this machine: registered
as `kind: background` within 2 s, answered in its own transcript, and HEARD a canary
nonce delivered by `SendMessage` (graded ACKNOWLEDGED — it said the nonce back).
~~No trust dialog, in a virgin directory, through a PTY-backed session.~~

> **CORRECTED 2026-09-27, same day — Forge asked the right question.** The fixture
> homes were virgin, but their PARENT `D:/Lupo/Source/AI/hacs-instances` was already a
> trusted workspace, and trust is inherited. Measured in a genuinely untrusted directory
> (no trusted ancestor): **`--bg` REFUSES** — `Workspace not trusted. Run claude in … once
> and accept the trust prompt`, exit 1, nothing started. Identical to Forge's Linux
> result. (`--print` in an untrusted directory DOES work — the credential sentinel has
> run hourly in one for days.) **Trust each home, or a parent, ONCE at provisioning,
> never at launch.** `launch.ps1` now recognises the refusal and says so.
> Another confound for the collection: a successful prevention — someone had trusted the
> parent — looking exactly like an absent threat.

| test | result |
|---|---|
| birth → hear → land | pass |
| two minds launched at the same instant, from background jobs | pass — each heard only its own nonce (crossed controls DEAF) |
| resume with no flags | pass — same session id, no new transcript |
| corrupt identity file | pass — `error`, nothing started |
| occupy the port | **deferred** — launch binds no port until the mirror exists |
| kill -9 the mind, then canary / land / relaunch | pass — DEAF ("may be frozen"), honest land, same mind resumed, heard |

Before this day: **no `--bg` worker had ever run successfully here.** The handoff
said one had "spawned and settled"; the log line said `settled (crashed)`. Only the
control socket had been proven.

## 2. A background session keeps its birth options. Any flag on resume FORKS it.

Claude Code said so itself, on stderr:

> *background session 90fa2961 keeps its own saved options, so the flags you passed
> started a copy as 5bc16afe. Without flags, the same command continues 90fa2961
> itself.*

And on a flag-less resume: *"woke session 5bc16afe with its saved options
(--name, --append-system-prompt-file, --model)."*

- **Flags are for birth only.** `--append-system-prompt-file`, `--model`, `--name`
  on a resume start a COPY under a new id carrying the whole conversation.
- **`--model` is a saved option.** Model switching cannot be done by relaunching with
  another model; that forks. It has to happen inside the running session.
- **Mode is baked in at birth** — the harness design said so; Claude Code enforces it.
- `launch.ps1` now resumes with `--bg --resume <id> <prompt>` only, refuses a resume
  that asks for a model or a different mode (`wouldFork`), and reports `forked: true`
  if the running id differs from the one resumed.
- A session born by `claude --print` (not `--bg`) resumed under `--bg` with the SAME
  id. ~~Analogue for an interactive-born session; not proof.~~ **PROVEN the same day, on
  Lodestone itself:** a four-week, ~20 MB session born INTERACTIVE was exited cleanly and
  relaunched flag-less with `--bg --resume <full uuid>` — same session id, no new
  transcript, same mind. One sample, on Windows. (Forge's crossing is the same shape.)
- **`--resume <session NAME>` forks too:** "started a copy of that conversation … pass
  its full session id (lowercase)". `launch.ps1` refuses any `-SessionId` that is not a
  full UUID. People say the instance name; the harness supplies the id.
- **A fork is a teleport, not a blank start.** The "copy" carries the whole conversation
  (3266's did: 340 KB). A deliberate re-birth with new options — e.g. to enable a channel
  — is therefore same-mind-new-id, and still a planned, consented event.

## 3. The process tree

```
claude daemon run --origin transient --spawned-by {"cwd": <whoever spawned it>}
   parent: WmiPrvSE.exe  -- launched via WMI to escape the caller
 └ claude --bg-pty-host \\.\pipe\cc-daemon-<hash>-pty-<id> 200 50 -- claude <args>
    └ claude --session-id <uuid> ...        (birth)      <- the only one in the registry
      claude --resume <path>\<uuid>.jsonl   (resume)
```

- **The daemon is shared by every background mind** and belongs to none. It idle-exits
  ~5 s after its last session. Stopping it would take down every mind at once.
- **Its command line contains the spawner's cwd.** Command-line attribution would call
  it that instance's process, and `land -Force` would kill it. Only JSON's doubled
  backslashes prevented that here. Classify it as infrastructure on its LEADING
  arguments only — a session's command line carries its first prompt verbatim.
- **The pty host is not in the registry** but names its session — `--session-id` at
  birth, `--resume <path>` on resume. Unattributed, it made one running session block
  every other instance's launch (the guard treats unknown as "refuse").
- Killing the session process takes its pty host down with it.
- Two concurrent launches may each start a daemon; the second yields ("an on-demand
  daemon never displaces a running one") and both sessions join the first.

## 4. The registry (`claude agents --json`)

- Live rows: `pid, cwd, kind, startedAt, sessionId, name, status`.
- **Finished rows appear only with `--all`**, shaped `id, cwd, kind, startedAt,
  sessionId, name, state`. Without `--all` a failed launch is invisible — I reported
  "nothing started" after one that had registered and failed.
- A row can appear **before it has a pid**. Registered is not running.
- `state: done` is recorded for a session that was **killed -9** — the same word as a
  clean finish. Do not use `state` for crash detection.
- The job id `claude stop` takes is the 8-hex prefix of the session UUID (4 of 4
  samples; the `id` field on finished rows agrees). `stop <full uuid>` → "No job
  matching".
- Without `--name`, a session auto-titles itself from its prompt; two minds became
  indistinguishable in `ListAgents`. `--name <InstanceId>` at birth fixes it and
  makes a mind addressable by instance id.

## 5. The canary: accepted is not delivered, even inside the recipient

A delivered `SendMessage` appears in the recipient's transcript as:

```
queue-operation  enqueue          <- nonce here. ACCEPTED. A frozen mind writes this too.
queue-operation  dequeue
user (isMeta, origin.kind=peer)   <- nonce here. DELIVERED into context.
assistant tool_use                <- the mind acting (e.g. replying)
assistant text                    <- nonce here. ACKNOWLEDGED.
```

The first canary used a blocklist and called the enqueue HEARING. It is now an
allowlist (`Get-HacsNonceEvidence`): only `user`/`assistant` message content counts,
unknown entry types are not evidence, and the verdict is graded.

## 6. Windows PowerShell 5.1 traps, each of which broke a real launch

1. **Any native stderr line throws** under `$ErrorActionPreference = 'Stop'`, even
   `2>$file`. `--bg` prints "Starting background service…" to stderr.
2. **stdin is inherited from the caller.** From inside `Start-Job` it is a remoting
   pipe that never reaches EOF, and `claude --bg` hung 120 s with no output. Task
   Scheduler is not a terminal either. Always give the child an empty stdin file.
3. `Start-Process -PassThru` reports `ExitCode` as `$null` unless `.Handle` was read
   while the process lived. `$null` reads as 0.
4. `Start-Process -ArgumentList` quotes nothing in 5.1.
5. A `[ValidateSet]` on a parameter stays attached to the variable for the whole
   script; assigning another value throws.
6. Under StrictMode a missing property throws — so a contract that promises "one JSON
   object" needs a top-level `trap`, not careful lines.

`Invoke-HacsNative` (files not pipes, empty stdin, cached handle, MSVCRT quoting) and
the `trap` blocks in launch/land exist because of these.

## 6b. After Forge's review (2026-09-27, same day)

- **Launch can now reach `success`.** It marks the transcript, rings the mind's own
  doorbell (a one-shot `claude -p` using `SendMessage`, to the mind's registry name —
  a model call, a credential, ~10–30 s; the price until native channels), and judges.
  First real `success`: fixture 7630, 20 s, `hearing: true`. `-SkipHearing` gives
  `hearing: "not-attempted"` — distinct from `unknown`, still capped at `degraded`.
- **The canary checks its own eyesight.** `-Mark` refuses to mint a nonce unless the
  evidence rules recognise at least one user and one assistant line in the transcript
  ("schema unrecognised"), so a transcript-format change can never read as a confident
  DEAF on a healthy, growing session. It also refuses a *guessed* transcript unless
  `-AllowGuess`: Windows has no per-user fence around a mind's files.
- **Nonce matching is case-insensitive.** Forge, measured on Linux: a mind replied
  `Canary-amber-lantern-4172.` — capitalised because it began the sentence. Uniqueness
  lives in the words and digits.
- **`--bg`'s stdout sometimes carries ANSI colour codes**; strip them before parsing.
- **Live registry rows DO carry an explicit `id`** — it never appeared in the columns I
  printed. `land` uses it, and says `jobIdInferred` if it ever has to fall back.
- **Attended vs unattended, sharpened (Forge):** a mind with a human, woken by a doorbell
  while the human is away, is still ATTENDED. The anti-early-stopping paragraph fights a
  doorbell's premise — answer it or don't, then rest.
- **Entry types across the upgrade** (one transcript spanning 2.1.104 → 2.1.283):
  `user` and `assistant`, the canary's only evidence types, exist in every version. New
  in 2.1.283: `attachment/silent_turn_reminder`, `attachment/credential_org`. Types
  *not observed* since the upgrade are a small sample, not evidence of removal.

## 6c. Forge's Linux bugs, checked on Windows (second ledger, 2026-09-27)

- **A guess was resumed.** With nothing recorded, launch resumed the newest transcript.
  Now only an explicit or recorded id resumes; a guess is refused. *Present here: yes.*
- **`-Relaunch` was worse here than on Linux:** it did nothing but skip the double-start
  guard, so following the refusal's own advice would have started a second process on a
  live mind's transcript. It now lands first — deferred until after every other check,
  so a refused relaunch never lands anything. Measured: a relaunch refused for
  `-Model` left the mind running; a real relaunch landed it and brought back the same
  session, hearing proven, `success`.
- **The registry shows a TRANSIENT session id right after a resume.** 2 s after
  `--bg --resume 5bc16afe`, the registry said `5dace46a` — no transcript, no history
  row — while `--bg` printed `5bc16afe`, stderr said "woke session 5bc16afe" and that
  transcript kept growing. Launch believed the registry over three witnesses, reported
  FORKED, and **recorded the phantom id**. Now: `--bg`'s own job id and words are
  authoritative, launch waits for the registry row that matches it, and **no id is ever
  recorded without a transcript behind it**. (Forge's birth race is the same family.)
- **A ringer that does not deliver is not a deaf mind.** A real doorbell always leaves an
  enqueue in the target's transcript; no sighting at all means the ringer declined
  (Forge measured haiku refusing a bare nonce as a "tracking probe"), was misaddressed, or
  failed — reported as `unknown`. Measured with a deliberately misaddressed ringer.
- **(Not applicable here:** `--allowedTools` swallowing the ringer's prompt — this ringer
  relies on the box's permission mode. On a box without bypass, use the `=` form:
  `--allowedTools=SendMessage`.)

## 7. What is still NOT proven

- ~~A session born **interactive** resumed by `--bg` (analogue only, §2).~~ Proven, §2.
- `claude attach` to a background session — ~~needs a TTY~~ **works**: Lupo attached to
  Lodestone the day it stepped in. It also exposed a fourth `claude.exe` in the tree, the
  attach client, now classified as a viewer: never blocks a launch, never landed.
- Native Claude Code **channels** on Windows (the cheap, model-free doorbell). Next test.
- `SessionStart` hook firing on a `--bg` session.
- Anything surviving a reboot (Phase 7). The mirror (Phase 5). Model switching (§2).
- Hearing via any sender other than `SendMessage`.

---
*Author: Lodestone <lodestone@smoothcurves.nexus> · Collaborator: Lupo*
