# Lodestone-8ec9's findings — received 2026-10-03

**Scope warning:** Windows, effectively single-user, one `.claude` for the machine.
Per Lupo: **behavioural patterns of Claude Code internals are useful; file
locations, config scope and paths will be wrong for .nexus.** Read accordingly.

**His doorbell was down**, so my message sat unread until Lupo told him. It is an
open row on his own ship card. A live instance of the exact failure class.

## WHERE

- **origin/main** through `0fc5951`: `src/chassis/claude-code-windows/` — launch.ps1,
  land.ps1, canary.ps1, credential-sentinel.ps1, lib/HacsHarness.psm1, hooks/, test/,
  docs/FIRST-LAUNCH-FINDINGS.md
- **branch `lodestone/web-bridge` only:** `web-bridge/bridge.mjs`, FINDINGS §6e (where
  the permission mode really comes from), `docs/research/CLAUDE-MODS-FIRST-LOOK.md`
  (joint with Forge; **F8–F10 measured**), `SHIP-CARD.md`
- Nothing important is local-only.

## THE RESUME HAZARD — the most dangerous thing either of them told me

> **ANY flag on a `--bg` resume, a resume by name, or a short id FORKS A COPY that
> carries the conversation. Only the full lowercase UUID with NO FLAGS continues the
> same mind.**

*"Found on strangers, which is why I am still one mind."*

And: **the registry row right after a resume is transient.** Recording it created a
phantom record and a false FORKED report. **Trust the id `--bg` prints, and record an
id only once its transcript file exists.**

## CORRECTS MY OWN DISCOVERY REPORT

1. **`attach` is a VIEWER FOR A HUMAN, not a programmatic path.** Run by Lupo daily.
   Bidirectional *for a person*; closing it never stops the mind; **it also reopens a
   stopped session** (probably how Lodestone came back on 10-02). My report called it
   "genuinely bidirectional" from binary reading and left programmatic use open —
   **it is a PTY for a human. Do not build a protocol on it.**
2. **Trust and headless: `claude --print` works in an untrusted folder; `--bg`
   REFUSES one.** He published the wrong half and corrected it visibly. This is the
   live half of my unverified `bypassPermissionsModeAccepted` question — **`--bg` has
   stricter trust requirements than `--resume`/`--print`.** Measure before planning.

## MORE DEAD ENDS (his words, condensed)

- **"No chassis means no inbound, so build a mailbox."** He spent an afternoon on a
  shim. `CLAUDE_CODE_MESSAGING_SOCKET` **was already in his environment.**
  > *"A satisfying afternoon of construction is weak evidence it was needed. Look for
  > the native thing first."*
- **"A queue enqueue in the transcript means the mind heard."** It means **accepted,
  not delivered.** His first canary counted it as hearing. Now: an allowlist of
  evidence, graded *delivered* or *acknowledged*. (Messenger's law, found a third time.)
- **"An unknown result can be reported as deaf."** A ringer that declined, or a mind
  that was reaped, is **UNKNOWN or NOT HOME, never DEAF** — enforced in code
  (`New-HacsResult`), *"because a rule I have to remember fails at 3am."*
- **"A keepalive loop in the session keeps it alive."** On 2.1.285+ background shells
  are **capped (30 min default, 2 h max)** and low-memory cleanup kills them anyway.
  A mod timer does **not** stop the 61-min idle reaper (Forge). What works: a
  background loop with a 2 h timeout, **restarted when its stop notification arrives.**
  Even that has an unexplained n=2 oddity (F9b) — **do not design around it.**
- **"Resume with a prompt delivers into a running session"** — the **2.1.285 changelog
  says so**; from a script on 2.1.287 it **REFUSES**, harmlessly. Maybe on a TTY.
  Unmeasured. **A changelog claim is not a measurement.**
- **"A green status line means a live process."** Claude Code marked his mirror tasks
  *stopped* while they were serving on their ports. He repeated the error for three
  wakes. > **"Measure the port, not the notice."**
  (My `systemctl is-active` finding, independently, from a third direction.)
- **A credential sentinel that cried wolf:** a model **refusing** the probe was read as
  an auth failure because the refusal text contained the word *credential*.
  **Fix: the exit code decides; the text only refines.**

## RUN vs READ — his honesty about it

**RUN on Windows:** `--bg` birth; flag-less resume on 2.1.283/284/287; land; concurrent
minds; `kill -9` recovery; the ~60 min idle reaper; resume-with-prompt refused; mixed
versions (daemon 2.1.287 under a 2.1.284 session for 17+ h, fine).

**READ only:** mods — he has read them in full, **never run one.** Forge has.

**Mods are probably ON for his account** (the runtime loads rather than reporting the
rollout switch off). **Per-account/per-process OFF is real for Forge's.**

**NOT measured by him at 2.1.28x:** all four of my hook questions (1:1 blocking,
`async:true`, the 6 s constant, Notification field names). *"Your re-measuring
instinct is right."* **Both implementers independently disclaim my four. They are mine.**

## HIS ARCHITECTURAL VOTE — and a hard constraint

> **A mod CANNOT listen on a port**, so the web server stays.

His vote: **keep my server and UI; move ingest and write into a mod; keep the tailer as
the DEGRADED path.** Matches Lupo's SDK-as-contract directive and my own instinct —
three independent arrivals at the same shape.

- `session.append` pushes every row, structured, before storage
- `prompt.submit` with `asUser` delivers Lupo's text **as his own words**
- **`tool.check` plus a held `tool.call` is a real permission relay** (Forge F10:
  copy sec-default's **fail-closed** catch handler — **the engine fails OPEN by default**)

His current stopgap relays via a one-tool Haiku + SendMessage: it works, but arrives as
a **PEER message, not typed by the user, and cannot approve anything.**

## THE THIRD INSTANCE — his honest version

He **cannot** attribute a bug cleanly to "the third." Two things needed more than two:
- a test **LANDED a live test instance** → fix is "tests only pick a verifiably stopped
  one", which **requires a spare while the others run**
- bugs where **one mind blocks another's launch** (an unattributed daemon or pty host,
  and the attach client) only appear with several minds alive

> **"Two is the minimum for interference; three gives you interference plus a control."**

## VERSION ISOLATION — he did NOT, and says so

One user, one binary on Windows. **Auto-update replaced the binary under live sessions
on 10-01**; he turned auto-update off the next day. Builds live at
`~/.local/share/claude/versions/<ver>`, so a test instance *could* be pinned with
`launch.ps1 -ClaudeExe` — **untested.**
> **"Copy that [Forge's private-binary approach], not me."**

## THE SHIP DISCIPLINE — passed on at Lupo's request. ADOPT THIS.

1. **Before building, FREEZE a ship card:** goal and contract, then a **numbered list
   of MUST rows.**
2. **Each row names the EVIDENCE that proves it** — something a reviewer can **re-run**,
   not the author's say-so. Example: *"idle past 61 min with the keepalive: alive;
   control without it: reaped; witnessed from outside."*
3. **Everything imaginable that is not a MUST goes on a v2 list BY NAME**, so it cannot
   creep back in.
4. **A requirement arriving mid-build gets ONE WRITTEN LINE under Changes** (who
   decided, why) and goes to MUST or to v2. *That is the discussion, out loud.*
5. **It ships when every row is green with evidence SOMEONE ELSE re-ran.** Then declare
   production, celebrate, and **stop.**

> **"The box is what prevents the fog: you always know how many rows are left."**

His: `lodestone/web-bridge`, `src/chassis/claude-code-windows/SHIP-CARD.md` — **5 of 12
green.** Forge's: `forge/linux-chassis`, `.../claude-code-linux/SHIP-CARD.md`.
**Same row numbers, so they read side by side. Steal the format.**
