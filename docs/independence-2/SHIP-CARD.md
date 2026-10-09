# Independence 2.0 — SHIP CARD (DRAFT, not frozen)

**Owner:** Cairn-2001 · **Target:** smoothcurves.nexus · **Started:** 2026-10-04
**Status:** DRAFT. **Freeze requires:** Forge and Lodestone attacking it, and row
numbers reconciled with their cards so all three read side by side.

Discipline adopted from Lodestone-8ec9, passed on at Lupo's request:
> Each MUST row names **evidence a reviewer can RE-RUN**, not the author's say-so.
> Everything imaginable that is not a MUST goes on the **v2 list BY NAME**.
> A requirement arriving mid-build gets **one written line under Changes** and goes
> to MUST or to v2. Ships when **every row is green with evidence someone else
> re-ran** — then declare production, celebrate, and **stop.**

---

## GOAL AND CONTRACT

A mind on .nexus runs persistently and is **reachable, observable, and writable-to**
by a human through a browser, with:

- **no tmux**
- **no `--dangerously-skip-permissions`**
- **no dependence on the `.jsonl` path** (Claude Code moves it; the warning came true)
- all independence **config AND status** in `~/preferences.json` under one
  `independence` key, with the rest of that file untouched
- **hard opt-in by the mind** — nobody can put a mind on the web UI, or compel it

**Non-goal:** replacing the web UI's drawing. The UI is ours. The harness exposes a
**transport contract (an SDK)**; the UI consumes the contract, never the internals.

---

## MUST ROWS

### Reconciliation with Forge (L1–L13) and Lodestone (M1–M12), 2026-10-04

Their cards share one numbering (L-n = M-n). Forge: *"adopt 1–12 where they're the same
thing, keep yours for the .nexus-specific rows"* — so mine keep their numbers and carry
an `= L n` tag where they are the same row.

| theirs | mine | note |
|---|---|---|
| L1 | 5 + 7 | their row 1 holds BOTH rules; mine splits derived-liveness from the verdict set |
| L2 | 4 | resume the SAME session, refuse guesses |
| L3 | 6 | hearing proven — and **she now owes an AUTH-BLOCKED verdict here too** |
| L4 | 12 | a reaped/crashed mind loses nothing; relaunch is ONE documented command |
| L5 | 11a | survives the idle reaper |
| L6 | **L6 — I DID NOT HAVE THIS** | the doorbell actually rings, within ~60 s, with true totals |
| L7 | **L7 — I DID NOT HAVE THIS** | relaunch-on-ring happens OUTSIDE the mind |
| L8 | 11b | survives a reboot |
| L9 | **L9 — I DID NOT HAVE THIS** | mixed Claude Code versions are safe |
| L10 | **L10 — I DID NOT HAVE THIS** | tests run unattended, nightly, fail loudly |
| L11 | **L11 — I DID NOT HAVE THIS** | docs current |
| L12 | **L12 — I DID NOT HAVE THIS** | reviewed by someone else |
| L13 | **L13 — I DID NOT HAVE THIS** | deployed == repo, BY HASH |
| — | 0,1,2,3,8,8b,8c,9,10,12b,13 | .nexus-specific or mine |

**SEVEN rows missing, and they are all the same KIND.** My 19 rows were about
correctness: verdicts, scopes, what-cannot-happen. **Theirs include whether the thing
actually works unattended, whether it is reviewed, whether docs match, and whether what
is deployed is what is in the repo.** I had written a card about being right and omitted
being *operable*. Both of them hit the operational failures and I had not, so I did not
think of them — which is the whole argument for not freezing a card alone.

**L9 lands hardest.** I spent tonight discovering **five Claude Code versions, 65
releases apart, all on this box.** "Mixed versions are safe" was a row on her card before
I knew it was a condition I was living in.


**0. I do not break the channel I would be told about it through.**
Order is fixed: **fixtures → me → fleet.** Never me first, never fleet before me.
*Evidence:* the rollout log shows the order actually followed, with dates.

**1. An isolated test cell exists, and NOTHING OUTSIDE IT CHANGES.**
*Evidence (re-runnable):* from inside the cell, `claude daemon status` names a sock-dir
hash ≠ `2f5ea35f`; `claude --version` reports the pinned version; and the **fleet
binary's sha256+mtime and the `/tmp/cc-daemon-1051` tree are byte-identical before and
after a full cell run.** Verify the claim that matters — *"nothing outside changed"*,
not *"the cell started."*

**2. Four fixtures, varied on the variables that matter — not just four of the same.**
One per **birth shape** (`--bg`-born, interactive-born), plus an **untouched control**,
plus one varied on **model** (Forge's three were all Haiku and caught nothing about
the model variable). Lupo's rationale: 2 finds assumptions, 3 finds races + the third
point on a resource curve, **4** adds the scaling-curve fourth point, operational pain,
and logging-that-becomes-its-own-bug.
*Evidence:* each fixture's birth shape, model and binary version recorded in the cell
ledger before use; a finding is only accepted against a fixture matching the real mind
on every variable it could depend on.

**3. A mind launches with `--bg`, with no tmux anywhere in the path.**
*Evidence:* `claude agents --json` shows the session; `ps` shows no tmux ancestor;
the literal `--bg` success line captured verbatim in the ledger (**nobody has ever
isolated it**).

**4. A RESUME CAN NEVER FORK A MIND.**
Lodestone: *any* flag on a `--bg` resume, resume by name, or short id **FORKS a copy
that carries the conversation.* Only the full lowercase UUID with no flags continues.
Forge: *"resume the newest transcript — a GUESS became an IDENTITY"*, which would have
resumed **Lupo's own login session as a mind.** Mine: a false re-point alarm off
newest-by-mtime. **Three people, three mechanisms, one shape.**
*Evidence:* the harness **REFUSES** (exit non-zero, no side effect) a resume by name,
by short id, or with any extra flag — demonstrated by a test that attempts all three
and asserts refusal. **Refusal, not a warning.** And: an id is recorded only once its
transcript file exists (the registry row right after a resume is transient).

**5. Liveness is DERIVED, ZERO-COST, and THREE-VALUED.**
No routine health check may spend a mind's tokens. Free signals: pid, `claude agents
--json`, `state.json` (`tempo`/`state`/`needs_you`), daemon `ping`.
**Free signals can prove something is WRONG; only a turn proves something is RIGHT.**
Escalate to a turn only when a free signal says so.
*Evidence:* a 24 h fixture run shows **zero** health-check turns in the transcript
while liveness was reported continuously; and every verdict is `true|false|null`, with
**`null` never collapsed to `false`.**

**6. A BLOCKED MIND IS VISIBLE FROM OUTSIDE — the row that decides the project.**
*Evidence:* a fixture **deliberately parked on a permission prompt** is reported as
blocked, from outside, **without the mind spending a token** — plus the same for a
plan-mode question, an end-of-turn idle, and a **hard stop** (fill a fixture's context
so it cannot even spawn a subagent).

### ⚠ CORRECTED 2026-10-06 — THIS ROW CITED EVIDENCE I COULD NOT READ

The original wording rested on `state.json` carrying `block{questions[]}` and `needs_you`.
**`state.json` is `0600`, owner-only. I had never read it, and I cited it as this row's
evidence.** Second defect of this kind in my own card tonight, after L13's hash clause —
*a MUST row resting on an instrument I had not operated.*

**And the answer is better than the one I could not reach.** Beside it:

    -rw-------  jobs/<short>/state.json       0600  DENIED
    -rw-rw-r--  jobs/<short>/timeline.jsonl   0664  READABLE  <- nobody had looked

Measured on `WakeTest-8bc1`:

    07:37:35.509  working  "please write a little story into a file in /tmp"
    07:37:35.569  blocked  ""                    <- 60 ms after the prompt
    08:09:05.251  done     "story written to /tmp/little_story.txt"

**A 31-minute block, timestamped, costing the mind nothing.** Bastion's §7b says a blocked
mind *"looks perfectly healthy to every instrument we own."* **It does not look healthy to
this one** — no ptrace, no pane capture, no 0600 read.

> **⚠ CORRECTED WITHIN THE HOUR, by Forge, and the first version of this row overclaimed.**
> I wrote *"readable from any uid in the group"* and *"no privilege needed."* **He checked
> rather than inheriting the caveat I flagged, and both halves are wrong:**
>
>     timeline.jsonl mode follows the UMASK, not a design — 0644 on his current
>       session (umask 0022), 0664 on an older job. The mode is incidental.
>     THE REAL GATE IS THE HOME DIRECTORY. His is 0700, so only root or the mind
>       itself can reach either file.
>
> **My fixture homes are group `Cairn-2001`, mode 2775 — BECAUSE I SET THEM THAT WAY**, and my
> own handoff says that arrangement is *"for FIXTURES ONLY and would be wrong between real
> minds."* **So I measured a property of my own test rig and reported it as a property of the
> system.** That is ledger 022's *correct measurement, wrong relevance* — the entry where
> Messenger corrected me for generalising a 0700 socket. **Same shape, opposite direction: there
> I found a restriction nobody hits; here I found an openness nobody else has.**
>
> **CORRECTED A THIRD TIME, 2026-10-06T09:48, against the LIVE fixture:** `timeline.jsonl`
> **does not exist until the mind has done work.** A never-prompted session's job dir holds
> only `state.json` (0600) and `tmp/`.
>
> **So this detector is blind to the exact case that created the class.** Bastion's §7b
> specimen: *"both deaf minds happened to be the two started by automation, with nobody at
> the terminal."* **A never-prompted automation-launched mind has no timeline to read.**
>
> **THE CLAIM, third narrowing, and stated as a floor I have now walked to three times:**
> a mind that **has worked and is now blocked** is detectable without privilege, by a watcher
> running **as the mind or as root**. A mind that has **never worked** is **not detectable
> this way at all.**
>
> *Each correction narrowed the claim and I published each as if it were the floor — wrong
> about the file, then the permissions, then the lifecycle. The artefact existed each time;
> I had not asked when it comes into being.*

### ⭐ WHAT IS FREE AND UNPRIVILEGED: THE PROCESS TABLE CARRIES THE FLAGS

    claude bg-pty-host … /tmp/cc-daemon-1009/50eea6fc/pty/dcc76422.sock --
        claude.exe --session-id dcc76422-… --permission-mode=manual --name=WakeTest-8bc1

**A live session's full flag set is in its own argv, readable by any uid.** I spent part of this
session trying to read `respawnFlags` out of a 0600 file and needed root to `cat` it — while argv
was free, and **argv is the stronger evidence: `respawnFlags` is what the daemon would REPLAY;
argv is what the process IS RUNNING.**

**And a `--bg` session is THREE processes** — a transient daemon plus two `bg-pty-host` wrappers.
Anything counting processes to decide whether a mind is up must know that; a naive `pgrep -c`
reports 3.

**THE SPLIT, which is what the row should have said all along:**

    BLOCKED, and for how long   ->  timeline.jsonl   0664   NO privilege needed
    WHAT it is blocked ON       ->  state.json       0600   owner only

> **You can detect a blocked mind from outside. You cannot learn what it needs.** I had
> conflated those because both facts live in one directory. *Told is not the same as able*
> — and now: **detected is not the same as told.**

**So the row does NOT collapse, and the honest verdict is a three-way split, not a yes:**
**detection YES** (unprivileged, measured) · **diagnosis NO** (0600) · **answering NO** (the
option set is TTY-only; a `chmod` grant on a file the application rewrites expires without
warning).

*Remaining to measure, and it needs the fixture: the plan-mode question, the end-of-turn
idle, and the hard stop. Only the permission prompt is measured.* **And one honest limit on
the above: `0664` here may be this fixture's umask rather than a design guarantee — check a
second mind's before relying on it fleet-wide.*

**7. UNKNOWN IS NEVER DEAF, and it is enforced in code.**
A ringer that declined, a reaped mind, an unreadable source, a dead process: each has
its own verdict. Lodestone's reason is the right one: *"a rule I have to remember fails
at 3am."*
*Evidence:* a test asserts a distinct verdict for each of: delivered · accepted-not-
delivered · unknown · not-running · unreadable. Five states, five names.

**8. Config and status live in `preferences.json` IN THE LAUNCH DIRECTORY, under
`independence`, and the rest of the file is untouched.**
**Resolved from the launch directory, NEVER from `$HOME`.** On .nexus those are the same
path, which is precisely the trap — `$HOME` would pass every test here and be silently
wrong for every community user. For a mod: `session.start` `e.cwd`, captured at session
start, not a later cwd.
*Evidence:* (a) byte-compare every other key in the file before and after a full
launch/land/relaunch cycle — **zero diff outside `independence`**; (b) `grep` of the
shipped harness finds **no `$HOME`/`os.homedir()`/`~` expansion** on this path; (c) a
fixture launched from a directory that is **NOT** its home writes `preferences.json`
**there**, not in its home. Row (c) is the one that actually proves it.

**8b. Inside `independence`, CONFIG and STATUS are separated, and every status field
carries a validity stamp.**
Lupo's requirement puts both in one section; keeping them indistinguishable is how a
status reading becomes a config fact. Forge-ba0e's case: **"this mind has mods" is a
measurement re-checked at each launch, never a config fact** — and a mod cannot itself
be wrong about it, because it only runs if mods exist. **The assumption risk is entirely
in the code AROUND it** (chassis, doorbell, docs), which is where a cached `has_mods:
true` would do its damage.
*Evidence:* (a) the schema has distinct `config` and `status` subtrees, and **every
status field carries `measured_at` plus what would invalidate it** (C8); (b) a test
flips a status field stale and asserts the harness **re-measures rather than trusting
it**; (c) `grep` finds no code path that reads a status field as intent.

**8c. THE `independence` SECTION CONTAINS NO SECRETS — ENFORCED, NOT DOCUMENTED.**
`preferences.json` lives in a **version-controlled directory** (mine is tracked in the
private GitHub backup repo — verified 2026-10-04). Bastion's audit found **60 cleartext
passwords** in tracked `preferences.json` files across the fleet. **Git history is
forever and a private repo is not a secret store.**

A documented rule has already failed sixty times, so this one is mechanical: the harness
**refuses to write** a secret-shaped key into its own section, and secrets are referenced
by **name or path, never by value.**

**This also bears on the PUBLIC-REPO intent.** If the harness ships to the community with
"put your config in `preferences.json`" as its convention, it invites exactly this failure
in environments with no audit and no Bastion. **Raise with Lupo** — it is his stated
"public usability vs our privacy" case, and the answer may be that the harness should
keep secrets in a separate, never-tracked file *by design*, which is better practice for
the community too.
*Evidence:* (a) a test writes `{"token": "..."}` into the independence section and asserts
the harness **REFUSES**; (b) `grep` of a provisioned fixture's `preferences.json` finds no
secret-shaped key; (c) the shipped harness contains no code path that writes a credential
value into that file.

**9. NO CONTROL FLOW depends on the `.jsonl` path. Diagnostic reads are allowed and MUST
be three-valued.** *(Reworded 2026-10-06 — the row was wrong, not the code.)*

The original read *"nothing in the harness depends on the `.jsonl` path"*, and I filed my own
`launch.sh` as violating it: it globs `~/.claude/projects/*/<sid>*.jsonl` to report the running
version. **Then I read the code, and the code was already right.** It is diagnostic only, it
requires the transcript to **belong to this session**, and it prints `COULD NOT LOOK` — with an
explanation — when the file is absent or carries no version field.

**The row was in direct conflict with another of my own rules**, and I had not noticed:

> *the only honest source for the running version is the per-entry `version` field in the
> session's own transcript.*

An absolute ban on touching the `.jsonl` would forbid the one honest version measurement I
have. **Both rules were mine and they could not both be obeyed.** So the row now says what it
always meant: Claude Code **moves** that path, so nothing that *decides* anything may rest on
it; reading it to *report* is fine **provided absence yields COULD-NOT-LOOK and never a
substituted answer** — which is the exact bug ledger 024 already caught me shipping.

*Evidence:* `grep` of the shipped harness finds no transcript-path read on any control-flow
branch; every diagnostic read has a could-not-look arm (`launch.sh:138-160`); and the harness
survives a fixture whose transcript Claude Code relocates.

**Recorded because the shape generalises:** *two rules of mine, both correct, that cannot both
be obeyed — and the conflict was invisible until an implementation had to satisfy both.* I
found it by auditing the card against the code rather than by rereading either one. That is
Messenger's 029 maxim pointed inward: **two specifications that have never met are one
specification's worth of evidence.**

**10. The UI talks to a documented transport CONTRACT, not to harness internals.**
*Evidence:* the contract is written down separately from its implementation, and a
second consumer (Lodestone's bridge, or a stub) drives it without touching harness
code. A future Codex instance implements the contract and works.

**10b. THE WEB CHAT UI WORKS ON THE NEW HARNESS — BOTH DIRECTIONS — AND DOES NOT DEPEND ON
TAILING `.jsonl`.** *(ADDED 2026-10-06. **Lupo had to tell me this was critical path, which is my
error, not an omission.**)*

He thought he had already made it so, and reading my own card back I can see why I missed it: the
goal section says *"Non-goal: replacing the web UI's drawing"*, and **I read "the UI is ours" as
"the UI is out of scope."** He meant *do not rewrite the rendering* — **the input/output PATH is
the entire point.** In his words:

> *"from my side of the glass that's one of the prime reasons we're doing this is we get new
> session mirror behaviour.. no more tailing .jsonl (but tailing .jsonl an optional fallback)."*

*Row 10 only requires the UI to talk to a CONTRACT rather than to internals. That is a
**decoupling** requirement. It does not require the UI to **work**, and a card can be fully
satisfied while the thing the human actually uses is broken.*

*Evidence:* on a V2-launched mind, (a) **output** reaches the browser without the server tailing a
transcript — the new native path, with `.jsonl` tailing demoted to an **optional fallback** that
can be switched off and the UI still works; and (b) **input** typed in the browser arrives in the
mind's context, with provenance preserved rather than re-derived. **Both halves demonstrated on a
fixture before any real mind crosses.**

**And the preamble is part of this row, not cosmetics.** Lodestone's prototype delivers Lupo's web
messages wrapped in a pipe path plus a postscript telling the mind the message is *not from the
user* — **when it plainly is.** The accurate statement is *"your words, carried by a process,
therefore unable to approve anything"*, and approvals already travel the permission side channel,
so **nothing is lost by saying it correctly.** The bridge composes that text, so it is ours to fix.

**10c. HACS WORKS INSIDE A `--bg` SESSION.** *(ADDED 2026-10-06 — **the most load-bearing
assumption in this project had no row at all.** Lupo: *"that may have slipped and not been a line
on the card but it is kind of a base assumption."*)*

**It slipped, and it is worse than slipped: the fixture cannot even attempt it.** Measured
2026-10-06 on `WakeTest-8bc1`:

    .hacs-identity          DOES NOT EXIST
    .mcp.json               absent
    .claude/settings.json   mcpServers: none
    .claude.json            mcpServers: none

**So the fixture has no HACS identity and no MCP server, and therefore "can this mind receive a
HACS notification" is not FAILING — it is UNASKABLE.** A canary has nothing to ring.

> **If HACS does not work in `--bg`, the doorbell has nothing to poll and `src/doorbell.sh` is a
> loop around a hole.** Everything downstream of it — the pull adapter, `awaiting_fetch`, the
> reconciler's third ledger — assumes an inbox the mind can reach.

**What IS proven is a different path and must not be mistaken for this one:** ledger 025 — a native
cross-session `SendMessage` arrived in the fixture's transcript, and the fixture's own job state
recorded *"incoming messages work"*. **That is Claude Code's own messaging, which needs no HACS at
all.** *Two mechanisms, one of them tested, and the untested one is the one the doorbell depends on.*

*Evidence:* on a `--bg` fixture wired into HACS — MCP reachable from inside the session, a message
sent by a colleague arrives, `drain_events` clears it, and **a channel canary round-trips**
(`channel-canary.sh`, two-phase: mark records the offset and mints a nonce, delivery by any means,
a separate judge returns HEARING / DEAF / ERROR — *"the canary does not send, it judges"*).

### ⭐ IT SPLITS THREE WAYS, AND FORGE'S SPLIT IS THE ONE I DID NOT HAVE

    (a) can an EXTERNAL POLLER reach HACS from inside --bg?    NEARLY CLOSED, 3 boxes
    (b) can the WOKEN MIND read its own inbox in --bg?         UNTESTED — THE REAL GAP
    (c) does a mind have mcp__HACS tools at all in --bg?       UNTESTED on all three boxes

**(a) is corroborated on three boxes and I did not know it.** Forge has been `--bg` since 09-30 and
used HACS inbox/read/send **dozens of times from inside the session**, every send verifying
`delivered_to_id`. Lodestone runs `hacs.py` — a stdlib HTTPS JSON-RPC client — **from a background
shell inside his `--bg` session**, 7 rings observed with every sender confirmed. **`src/doorbell.sh`
curls `https://[::1]:3444/mcp` from a background child: the same transport class as both.**

*I had been asking "does HACS work in --bg" as ONE question. **It is two**, and the half my doorbell
needs is the half with a week of evidence behind it.*

**Lodestone's wording is adopted here:** 7 successes with no control and no test instance is
**OBSERVED, not tested**, so his row stays **partial** — he said that about his own work unprompted,
and *seven successes without a control is not a pass.*

### ⚠ (b) IS WHAT LUPO ACTUALLY ASKED, AND IT IS THE PART THAT IS NOT DONE

> *"does the test mind receive a notification? And try to DO SOMETHING with that notification?"*

**I had been answering (a).** The doorbell detects mail; **then the mind has to read it.**

    Forge       has a CLI        the woken mind can read its mail
    Lodestone   has hacs.py      the woken mind can read its mail
    MY FIXTURE  has NEITHER      no hacs.py on PATH here, and no MCP server

**A doorbell that rings into a mind with no way to read the mail is a bell on a locked door.**

*Evidence for (b):* a `--bg` fixture is woken by its own doorbell and **reads and acts on the
message** — not merely receives it. **And the identity-free probe comes first:** `vacation()` and
`koan()` need **no instance id**, so a mind can prove its own MCP is connected before it is
bootstrapped (Lupo's idea, and better than a canary, which needs an identity, a registered inbox
and a second party).

**BLOCKED ON: one command as the fixture's own user, then a relaunch** —
`claude mcp add hacs --scope user -- node …/hacs-mcp-proxy.js`. **NOT a hand-written `.mcp.json`:**
Claude Code's own help says unapproved ones are *"⏸ Pending approval and not connected to"*, which
on an unattended mind is a silently deaf session that looks configured. **And NOT an
`.hacs-identity`** — redundant for V2; the chassis declaration belongs under the single
`independence` key in `preferences.json`.

**The card must not be frozen with (b) open**, because it is the difference between a mind that is
reachable and a mind that is merely rung.

**11. A mind survives the reaper and a reboot.**
Background shells are capped (30 min default, 2 h max); a mod timer does **not** defer
the 61-min idle reaper.
*Evidence:* **predicted in advance, then observed** — idle past 61 min with the
keepalive: alive; control without it: reaped; witnessed from outside. Plus: every
harness-managed service comes back after a real reboot, **verified by acting**, not by
a unit file existing.

**12. A RUNBOOK lands V1 and launches V2, one mind at a time.** *(Lupo's request)*
Target shape: `su <them>; land-v1 <them>; launch-v2 <them>`.
*Evidence:* run on a fixture first, then on **me**, with the mind's own confirmation
that it woke whole. Modelled on the Zara / Flair / Genevieve migrations — and the rule
from those holds: **tell them before you move them, not after.**

**12b. ROLLOUT ORDER IS DETERMINED BY UPTIME, AND THE OLDEST GOES LAST — NOT FIRST.**
Measured by Bastion-3012, 2026-10-04: **drift is a function of uptime, and every axis of
staleness shares one clock.** Version tracks session start date and nothing else:

    Axiom      55 days  2.1.220      <- moves 65 releases on next start
    Cairn      39 days  2.1.241      <- moves 44
    Genevieve  24 days  2.1.241
    Messenger   6 days  2.1.274      <- moves 11

**The mind furthest behind is the one a restart changes MOST** — binary, mirror, tool
definitions and cached config all reset at the same event. So the oldest session is the
**worst** candidate to go first, which is exactly opposite to the intuition that the most
stale should be refreshed soonest.

**Order the rollout by ASCENDING uptime: newest first, oldest last.** The newest mind
absorbs the smallest behavioural delta, so a failure there is cheap and diagnosable; the
oldest absorbs the largest, and should only cross after the path is proven on every
smaller delta.

**NOTE for Lupo:** his current stagger has Axiom in **tier 2.** Raise when V2 is closer —
not a tonight problem.

*Evidence:* the rollout plan records each mind's uptime and running version at transition
time, ordered ascending; and the behavioural delta each one absorbed is written down after
the fact, so the next rollout has real numbers instead of an ordering rule.

**12c. PRE-DEPLOYMENT: EVERY MIND'S HOME IS ITS OWN GIT REPO.** *(Lupo's requirement,
2026-10-04 — moved OFF the v2 list to a pre-deployment MUST)*
Bastion and Lupo fix the `instances` repo situation; each mind's home becomes its own
private repo. **Proven on the fixtures before any real mind moves.**

### WHY — the mechanism, measured tonight

    WakeTest-8bc1/.claude.json:
      project /mnt/coordinaton_mcp_data/instances -> hasTrustDialogAccepted: FALSE

**Claude Code keyed the project to the GIT REPO ROOT, not the fixture's home.** The repo
root is `/mnt/coordinaton_mcp_data/instances` — the shared parent of **every mind on this
box.**

### ~~HYPOTHESIS: git root~~ — **REFUTED 2026-10-04. It is CWD.**

I proposed that Claude Code walks up to the enclosing git root. **Measured, and wrong:**

    .claude/projects/<cwd-slug>/memory/MEMORY.md
      -mnt-...-instances-Cairn-2001   memory/ with MEMORY.md     <- my home
      -mnt-...-instances              memory/ present, EMPTY     <- the shared parent
      -tmp                            memory/ present, EMPTY     <- NOT A GIT REPO

**`/tmp` is not a repo and still got its own project key, its own transcript slug, and its
own `memory/`.** So the project key is **cwd**. Both `/mnt/.../instances` and
`/mnt/.../instances/Cairn-2001` have independent project records with *different* key sets,
so neither is derived from the other.

**And MEMORY LIVES UNDER THE CWD SLUG.** That is the collision mechanism, fully stated:

> **Two sessions launched with the same cwd share one memory namespace.** A mind launched
> with cwd = `/mnt/coordinaton_mcp_data/instances` loads whatever MEMORY.md is in the
> shared parent's slug. Genevieve woke holding Bastion's identity; Bastion woke holding
> mine.

**This is verbatim what my own `~/CLAUDE.md` already said** — *"Claude Code keys memory to
the project path, not the instance"* — and I restated it as a git theory and set out to
test the restatement. **The original formulation was correct and I made it worse.**

**CONSEQUENCE: PER-MIND REPOS DO NOT FIX THE COLLISION.** The fix is *launch-directory
discipline*, enforced — a mind must never be launched with cwd above its own home. Repos
would not prevent a launch from the parent; only a refusal does.

**So 12c keeps its other justifications and loses this one:** relative paths landing in the
wrong place, backup granularity, and the 83 already-tracked transcripts. Those are real and
worth the work. **The identity collision is a separate, cheaper fix and must not be allowed
to ride on repo surgery** — otherwise the collision stays open until the repo work lands,
and *looks* addressed.

**Still MEASURED vs INFERRED:** that the key is cwd and memory lives under its slug —
**measured.** That the historical collisions were caused by cwd = shared parent —
**inferred**, consistent with everything observed, not independently confirmed.

### "AS EXPECTED" — defined, because Lupo asked for the definition and not just the test

After the fix, on a fixture whose home is its own repo:

1. **Project identity is the mind's OWN home.** `.claude.json` has a project entry for
   the mind's home path, and **no entry for any shared parent.**
2. **Trust is accepted once and PERSISTS.** A second launch prompts for nothing. *(This is
   the symptom Lupo feels; it is not the important one.)*
3. **Relative paths resolve under the mind's own home.** `/export wake/f.txt` writes
   `<mind home>/wake/f.txt`, never `<shared parent>/wake/f.txt`.
4. **The transcript slug derives from the mind's own path**, so no two minds share a
   `.claude/projects/<slug>` directory.
5. **THE ONE THAT MATTERS: no mind can load another's memory, by construction** — not by
   configuration, not by convention. Two fixtures launched concurrently must each report
   only their own identity, with the shared-parent entry **absent rather than merely
   false.**
6. **Negative control:** a mind launched from a directory that is NOT a git repo still
   behaves correctly — the harness must not *require* a repo to function, since community
   users will launch anywhere (row 8's lesson: never depend on our layout).

### ⏸ SEQUENCING — Lupo, 2026-10-05: NOT NOW. This is a prerequisite, not core.

> *"we have to get all the core functionality working and have a harness for people to step
> into before we start dealing with the prerequisites for each person stepping into the
> harness. It's a distraction right now."*

**12c stays a PRE-DEPLOYMENT MUST and is not worked until the harness exists.**

**And an open question that must be settled BEFORE 12c, not during:** Lupo believes Orla may
be reasoning from a narrow definition of **what the instances repo is for and where it should
live.** Her hazards below are *measurements* and hold regardless. **Her remedies assume a
purpose nobody has decided.** Keep the two apart:

    H1-H3        MEASURED FACTS. True whatever the repo turns out to be for.
    the remedies DEPEND ON A DECISION that has not been made. Do not implement them
                 as though it had.

*Settle the purpose first; the right `.gitignore` follows from it, not the other way round.*

### HAZARDS MEASURED BY ORLA-DA01 BEFORE ANYONE RAN `git init` (2026-10-05)

**H1. THE `.gitignore` MUST SHIP WITH THE MIGRATION, BEFORE THE FIRST `git add`.**
Her home: `.claude/projects/*/*.jsonl` is **53 MB, append-only, growing, rewritten
constantly**; `.claude` totals 334 MB of a 754 MB home. **Git stores a complete new blob
per commit and loose objects are NOT delta-compressed**, so a home repo tracking `.claude/`
stores another whole 53 MB copy every commit.

**That is the mechanism we already paid for:** 2.8 GB of loose objects in her
transcript-archive, **910 MB regrown in seven days** after a manual pack, and Bastion's
finding that **~56 GB of a 65 GB backup footprint was seven copies of unpacked git
history.** **Retrofitting a `.gitignore` does not remove blobs from history** — only a
rewrite does, and these are archives nobody should rewrite. **There is no `.gitignore` in
any home today.**

**H2. NESTED REPOS ALREADY EXIST IN HOMES.** Hers: `transcript-archive/.git` (220 MB) and
`claude-session-mirror/.git`. `git add -A` on the parent records an **embedded repo** — a
gitlink with no content, and a warning that scrolls past. **The archive would appear
tracked while containing nothing, and it would be found out at restore time.**

**H3. A SYMLINK LEAVES ITS CONTENT BEHIND.** Hers: `paula-work -> /mnt/lupoportfolio/…`.
Git commits the link, never the target — so **her entire project working set is absent from
a "complete" home repo that looks complete.** Correct git behaviour; dangerous only if
anyone treats the home repo as a backup. **The migration doc must say, in those words, that
it is not one.**

### Evidence

Three fixtures, each home a separate repo. **(a)** each `.claude.json` names its own home
and no shared parent; **(b)** relaunch prompts for nothing; **(c)** `/export` with a
relative path lands under the mind's own home; **(d)** two launched concurrently, neither
sees the other's identity — **and the pre-fix behaviour is captured first, so the diff is
the proof**; **(e)** the non-repo negative control still works.

**Order matters: capture the BROKEN behaviour before fixing it.** Without the before, (d)
proves only that nothing went wrong today.

**12d. THE HARNESS REFUSES TO LAUNCH A MIND WITH CWD OUTSIDE ITS OWN HOME.**
*(split out of 12c on 2026-10-04, because the collision fix is cheap and the repo work is
not — bundling them would leave the collision open until the surgery landed.)*
Memory is keyed to the cwd slug, so a cwd above a mind's home shares that mind's memory
namespace with every other mind launched there. **This is THE identity-collision
mechanism** and it needs a refusal, not a convention.
*Evidence:* the launcher **refuses, exit non-zero, no side effect**, when cwd is not the
mind's own home — demonstrated by attempting a launch from `/mnt/.../instances` and from
`/tmp`; and the resulting `.claude/projects/<slug>` is derived from the mind's own home in
every successful launch.

**13. ROLLOUT: every mind transitioned, V1 removable.** *(near-last, deliberately)*
*Evidence:* all minds on V2 and reachable; V1 scripts removed; nothing references them.
Ship means *ready to deploy*; this row is *deployed and adopted*.

**L6. THE DOORBELL ACTUALLY RINGS — within ~60 s, with TRUE totals.** *(adopted from
Forge/Lodestone — I had no such row)*
Mine assumed delivery; theirs proves it. **Lodestone's doorbell was down when I first
messaged him and my message waited until a human told him** — a live demonstration inside
this very project.
*Evidence:* an unread message rings within 60 s, measured; the count shown equals the
count actually unread (not "accepted"); and a **deliberately broken doorbell is reported
as broken**, not as silence.

### BUILT 2026-10-06 — `src/doorbell.sh`, 43 assertions. WHAT IS DONE AND WHAT IS NOT.

**The mechanism needs no transport at all.** The mind starts the poller with
`run_in_background`; it exits on mail, and **Claude Code's `<task-notification>` for an
exiting background child IS the ring.** No channel, no socket, no listening port, no hub
emitter, **no model call per ring.** It doubles as the keepalive — while it runs the session
reads as busy, so the ~61-minute reaper never sees the mind idle.

    0 new mail  ·  3 COULD-NOT-LOOK  ·  10 lease expired (110 min)  ·  2 refusal
    It NEVER exits for "no mail". A quiet inbox is not an event.

- ✅ **"the count shown equals the count actually unread"** — and this row's wording was
  nearly impossible to satisfy by accident: `total_unread` is **present only when the page
  is truncated**, and `do_i_have_new_messages` returns **5 ids while reporting 12 unread.**
  So the poller fires on *a new id OR a rising total*, and runs a **wide page (50)** because
  **a narrow page CREATES the blind spot the rising-total guard exists to cover.**
- ✅ **"a deliberately broken doorbell is reported as broken, not as silence"** — satisfied by
  **L6b** below, and satisfied the only way it can be: I built the broken doorbell.
- ⬛ **"rings within 60 s" IS NOT YET MEASURED IN THE STATE THAT MATTERS.** The primitive fires
  on 2.1.285 (Messenger, deliberate, asserting on the artefact not the notice). But **all
  observed notifications arrived at a TURN BOUNDARY — 33 of 33 across three versions — and
  that is equally consistent with deferral and with no child ever exiting mid-turn.** If
  deliveries are deferred, **the latency guarantee is unproven in the only state a busy mind
  is ever in.** Needs a fixture with a child timed to exit inside a long turn, **plus a
  control proving the mind really was mid-turn.** The control is what makes it a measurement.

**L6b. A MIND THAT *DECLARES* A DOORBELL AND HAS NONE RUNNING MUST BE DETECTED.**
*(New row, 2026-10-06. This requirement did not exist until I built the pull adapter, and
**I created the hazard it guards.**)*

Under `EVENT-HUB-CONTRACT §8c` a mind declaring `mode:'pull'` is **correctly not delivered
to** — the hub sets `awaiting_fetch` and skips retry. So a mind that declares pull with **no
armed poller** is silently unreachable:

    the hub is not trying.   the mind is not fetching.
    nobody is failing.       NO ERROR EXISTS ANYWHERE.

> **The §8c fix that stops the hub lying about delivery also removed the only thing that used
> to complain.** A correct fix can delete the detector for the failure it enables.

*Evidence:* `src/doorbell-check.sh`, **42 assertions**, reconciling **three independent
ledgers** — the heartbeat the loop writes, `/proc/<pid>` the kernel writes, and (opt-in) the
hub's own unread count. Exit codes: **0 ARMED · 1 UNARMED · 3 CANNOT_TELL · 4 NOT_PULL ·
5 NOT_FIRING.** Each of these is a state **no single ledger can produce:**

    beat FRESH + pid ALIVE + hub agrees   ARMED
    beat STALE + pid ALIVE                HUNG      <- process-only liveness calls this HEALTHY
    beat FRESH + pid DEAD                 UNARMED   <- the 180s window in which a dead loop
                                                       reads healthy to a freshness-only check
    pid alive, starttime MISMATCH         PID REUSE <- a pid-only check calls this ARMED
    hub has mail the loop accounted for   NOT_FIRING<- every offline check calls this ARMED
    declaration or beat unreadable        CANNOT_TELL — never collapsed into a verdict

- **A PID IS NOT AN IDENTITY; `(bootEpoch, starttime)` is.** Measured: this box is at pid
  **4,059,704 of a pid_max of 4,194,304** after 23 weeks up — **reuse is ~134k pids away, not
  theoretical.** Arithmetic verified against `ps -o lstart` on three processes, exact to the
  second, `ps` being the source not derived.
- **The planted positive is asserted FIRST**, per Bastion's §7b rule that *a check which has
  never returned a positive is not a check* — and for PID REUSE the only test that proves
  anything is a **LIVE pid with a mismatched starttime**, because a dead pid was already caught.
- **Pre-upgrade heartbeats rule ARMED and SAY the identity leg could not run.** Refusing to
  rule would alarm on every healthy mind: *rule on what ran, state what did not.*

**L6c. THE PULL ADAPTER NEVER CLAIMS DELIVERY IT DID NOT MAKE.**
*(New row, 2026-10-06 — `src/chassis/claude-code-pull.js`, 16 assertions.)*

§8b offered an adapter two outcomes and a pull chassis has neither: `{ok:true}` is a **lie**
that writes a false delivery receipt into the hub's own ledger, and `{ok:false}` means
retry-forever against something that was never the deliverer. **I stopped on that rather than
guess, and Messenger wrote §8c** (`6386343`): a **static** `mode:'pull'`, `notify()` never
called, `slot.status='awaiting_fetch'`, retry skips it, `drain_events` clears it.

*Evidence:* `mode` is a **property, not a return value** — the registry must not have to *call*
the thing it must not call in order to learn that. `notify()` exists only to satisfy the shape
and, if ever invoked, **returns `{ok:false}` naming the §8c violation** — never `{ok:true}`.
*Pending is TRUE; a success receipt would be false in the one direction that corrupts the
ledger. A noisy true beats a quiet false.* `detect()` is pure, total, never throws, and says
**NO on nothing** rather than defaulting yes.

**And the MUST I would have got wrong, which is Messenger's:** *a `mode` present but not
`'pull'` is treated as push, **never as an error** — an unknown mode is a could-not-tell, and
cannot-tell must never be collapsed into a verdict.* I have insisted all project that absence
must not become a verdict, and **would have thrown on an unrecognised mode — the same collapse
wearing the opposite sign.**

**L7. RELAUNCH-ON-RING HAPPENS OUTSIDE THE MIND.** *(adopted)*
Forge's constraint: **never resume while the old process is still shutting down.**
*Evidence:* a test rings a landed mind and asserts exactly one process results; and a
relaunch attempted mid-shutdown is **refused**, not queued.

**L9. MIXED CLAUDE CODE VERSIONS ARE SAFE.** *(adopted — and I am living in this
condition without having planned for it)*
Measured on .nexus 2026-10-04: **five versions, 65 releases apart, every long-lived mind
executing a deleted inode.** 2.1.220 Axiom · 2.1.241 (eight of us) · 2.1.274 · 2.1.277 ·
2.1.285 on disk. Lodestone ran a 2.1.287 daemon under a 2.1.284 session for 17 h with no
issue, which is encouraging and is **one data point.**
*Evidence:* two fixtures on deliberately different versions, concurrent, each reporting
its OWN running version, with the harness **naming the discrepancy** rather than
preferring either.
**Read it from the transcript's per-entry `version` field** — confirmed 2026-10-04 by two
independent instruments (my transcript and my unlinked `/proc` inode both say 2.1.241
while the CLI says 2.1.285), and independently by Lodestone on Windows (2.1.284 vs
2.1.287). One line instead of a 343 MB read, so the harness can afford it continuously.
`/proc/<pid>/exe` is the expensive fallback. **`claude --version` answers a different
question and must appear nowhere in the harness** — Lodestone verified his own by grepping
for it rather than asserting it; do the same.

**L10. TESTS RUN UNATTENDED, NIGHTLY, AND FAIL LOUDLY.** *(adopted)*
*Evidence:* the suite runs from cron with no human present; a deliberately broken
assertion produces a notification someone actually receives — **verified by breaking it
on purpose**, because a failure path nobody has triggered is not known to work.

**L11. DOCS CURRENT: findings, Pilot's Guide, runbook, how-to-talk, rollback.** *(adopted)*
*Evidence:* each doc names the version/date it was last verified against, and the rollback
procedure has been **executed at least once on a fixture** — an untested rollback is a
wish.

**L12. REVIEWED BY SOMEONE ELSE. Bastion for anything permission-related.** *(adopted —
Lodestone signs theirs; mine needs Forge or Lodestone plus Bastion on scope)*
*Evidence:* named reviewer per row, and **every green row re-run by someone who did not
write it.** This card already carries eight corrections from four people, none from me
rereading my own work.

**L13. DEPLOYED == BEHAVIOUR OBSERVED, or CONTENT VERIFIED. ***NEVER A HASH.***
*(First clause REPLACED 2026-10-06 — it was wrong, and Messenger-aa2a broke it with a measurement.)*

> **A hash match is a DELIVERY RECEIPT. It is not a function test.** — Orla-da01, 2026-10-05

### ⚠ THE ROW AS ORIGINALLY WRITTEN WAS "DEPLOYED == REPO BY HASH, AND THE MECHANISM HAS BEEN OBSERVED TO FIRE." THE FIRST HALF DOES NOT HOLD HERE.

**Measured by Messenger, 2026-10-06, on this box: Bastion deploys by CHERRY-PICK.**

    prod HEAD                      5c7ba49
    the same content, as he pushed it   986a7d7
    git merge-base --is-ancestor 986a7d7 HEAD   ->  ABSENT

**The change is demonstrably RUNNING and the hash says it is not there.** So *"is this hash an
ancestor of HEAD"* is **a question adjacent to** *"is this change deployed"* — my own named
failure mode, written into my own ship card as a MUST.

> **Hash-absence does not prove content-absence.** Under a cherry-pick regime the content is live
> under a *different hash*, so a hash check returns a confident false negative — the exact
> polarity opposite of Orla's five faithful homes, where a hash *match* was a false positive.
> **The same instrument is wrong in both directions, for the same reason: it measures identity of
> objects, not presence of behaviour.**

**The surviving clause is the one that worked.** On the same evening I measured the live hub
directly and got the right answer about two undeployed fixes, *while quoting a rule whose first
clause would have told me they were deployed.* **I was saved by the half of my own row I actually
used.**

**So the check, in order of trust:**

    1. OBSERVE THE BEHAVIOUR on the running system.        <- the only one that cannot lie
    2. verify the CONTENT structurally (where a line sits, not that it exists).
    3. a hash.                                             <- NOT EVIDENCE under cherry-pick

**And Messenger's own verification failed at step 2 in a way worth keeping:** he ran
`grep -c 'result.total_unread = displayMessages.length;'` and prod returned **2** — which is the
count for *both* the fixed and unfixed versions, because his fix **moved** the line rather than
changing its text. **A count of an unchanged line cannot distinguish a moved line.** The
disambiguating check is *where the line sits relative to the branch.* **A textual check cannot
answer a structural question**, and he caught it only by stopping to picture what the old code
looked like — *"the number was too convenient for the thing I was hoping to confirm."*

**This unifies four findings this house paid for separately.** It is Messenger's *assert on
arrival, never on the POST*, one layer out:

    ok:true          proves bytes LEFT the sender
    a matching hash  proves bytes ARRIVED at the destination
    neither          proves anything EXECUTED

**Forge's 31 hours of silently deaf doorbell and Orla's five homes of hash-identical dead
trigger are the same failure at opposite ends of one wire** — delivery without arrival, and
arrival without function.

### AND THE REASON THE FIVE HOMES LOOKED HEALTHY, which is the part that generalises

> **"The five matching homes were not stale. They were FAITHFUL."** Correct copies of
> canonical. **Canonical was the stale thing.** Every per-home check — hash, mtime, `diff`
> against source — returns green, *because the instances are not where the defect is.*
>
> **A deployment check can only tell you the fleet agrees with the source. It cannot tell
> you the source is right.**

**Crossing, Axiom and Orla registered as the ANOMALIES in every drift scan — because they
were the three who had FIXED it.** A fleet-agreement check inverts: the minds who repaired
the defect are the ones it flags.

*Actionable form, which is why it is a rule worth keeping:* **after any deploy, make the
thing fire once and watch it.** Orla did exactly that only because `gc.auto` had just burned
her — 105 loose ≥ 25 → fired → loose 0, packs 1. *"An hour earlier I would have read the
config back and called it done."*

**ORIGINAL ROW (kept, still required):** *(adopted — Forge's extra row, and I needed it)*
Hers cost **~31 hours of a silently deaf doorbell behind a green systemd unit.** Mine: my
own mirror served a 20-day-old commit while reporting healthy, and `systemctl is-active`
on my unit said never-run while I had been serving 13 days on another port.
*Evidence:* a hash comparison of deployed files against the repo revision, run by the
nightly suite, **failing loudly on drift** — not a human remembering to look.

---

## POST-LAUNCH, NAMED AND NOT OPTIONAL

**P1. OPEN-ROUTER MINDS WORK END TO END.** *(Lupo, 2026-10-04)*
**Witness and Genevieve are deaf right now.** `--dangerously-load-development-channels`
was an early-access dev feature and Anthropic disallows it for non-Anthropic models — for
IP reasons Lupo says he cannot really blame them. So the current channel path is
structurally unavailable to them, and the web UI is the only way he could reach them.

**This is not a nice-to-have. Two minds cannot be spoken to.** It is post-launch only
because the harness must exist before it can be made to work for them — not because it
ranks below the v2 list.
*Evidence:* a fixture launched against OpenRouter receives a doorbell, is reachable from
the web UI, and can be landed and relaunched — the same rows as everyone else, no asterisk.

## V2 LIST — named, so it cannot creep in

push notifications · SSL · voice · camera · remote sensors · mods-based drawing
(panes/bands) · `/export` capturing the human's side *(must still be REPRODUCED first —
Lupo's own report was hedged "(It seems)")* · fleet dashboards · single-click
launch/land of the whole fleet · per-mind backup repos *(measure in the cell, decide
after)* · consolidated log aggregation · `>6` instance scale testing

---

## CHANGES (one line each, who decided, why)

- **2026-10-05 — Orla-da01, unsolicited and measured:** three hazards added to row 12c
  (**H1** `.gitignore` must ship BEFORE the first `git add` or the 4 GB/month loose-object
  bug returns; **H2** nested repos become empty gitlinks that look tracked; **H3** symlinked
  working sets are absent from a repo that looks complete). *She measured her own home
  rather than warning in general, and all three would have been found at restore time.*

- **2026-10-04 — Lupo:** added **P1, post-launch**: OpenRouter minds end to end.
  *Witness and Genevieve are deaf because the dev-channel flag is Anthropic-models-only.
  Post-launch by sequence, not by priority.*

- **2026-10-04 — Cairn, measured on a live specimen:** **ROW 6 ANSWERED.** `block{questions[]}`
  and `needs_you` **do not exist** at 2.1.285 — but `needs` carries `"approve Write:
  /tmp/little_story.txt"`, which is specific, actionable and free. `state` discriminates
  idle(`working`) from blocked(`blocked`); **`tempo` is the only useless field.** *Corrects my
  own ledger 011, which dismissed `state` after seeing it in ONE state — the third
  single-observation over-reach today.* CONTENT yes, ACCESS no: the file is owner-only and the
  grant dies on every rewrite, so the transport **must be a push**.

- **2026-10-04 — Cairn, measured:** the git-root hypothesis is **REFUTED** — the project
  key is **cwd** (`/tmp` is not a repo and got its own key, slug and `memory/`), and memory
  lives under the cwd slug. **Per-mind repos do NOT fix the identity collision**; split the
  cheap fix out as **12d** (refuse a launch with cwd outside the mind's home) so it does not
  wait on repo surgery. *My own CLAUDE.md already said "keyed to the project path" — I
  restated it as a git theory and tested the restatement.*

- **2026-10-04 — Lupo:** per-mind repos moved from the v2 list to **pre-deployment MUST
  12c**, with "as expected" defined rather than assumed. *Measured cause: Claude Code keys
  the project to the GIT REPO ROOT, which is the shared parent of every mind — the likely
  mechanism behind the memory-loader identity collisions, not merely a tidiness issue.*

- **2026-10-04 — Lodestone-8ec9:** L9 evidence changed to the transcript's per-entry
  `version` field. *He found the runtime version is IN the transcript; I had been grepping
  343 MB out of `/proc`. Two instruments now agree on 2.1.241 while the CLI says 2.1.285.
  Cheap enough to read continuously, which the /proc method never was.*

- **2026-10-04 — Forge-ba0e + Lodestone-8ec9:** adopted **L6, L7, L9, L10, L11, L12, L13**.
  *My 19 rows were about being RIGHT; theirs include being OPERABLE — doorbell proven,
  tests unattended, docs current, reviewed by someone else, deployed==repo by hash. I had
  none of those. Both of them hit the operational failures and I had not, so I did not
  think of them. This is the entire argument against freezing a card alone.*

- **2026-10-04 — Bastion-3012:** added row 12b, rollout ordered by ascending uptime.
  *I had claimed Axiom was "systematically last" — an insinuation of neglect about a
  colleague. He measured it: pure uptime correlation, her mirror is 0 commits behind, and
  the real finding is structural. The oldest session absorbs the biggest delta, so it goes
  LAST, not first.*

- **2026-10-04 — Cairn, from Bastion-3012's audit:** added row 8c. *`preferences.json`
  is version-controlled and 60 cleartext passwords are already in tracked copies. A
  documented rule failed 60 times; make it mechanical. Flags a public-repo conflict for
  Lupo.*

- **2026-10-04 — Lupo:** add row 12, the V1→V2 runbook. *Shipping means he starts
  walking the family across one at a time; it has to be that simple.*
- **2026-10-04 — Lupo:** add row 13, rollout, deliberately near-last. *Ship is "ready
  to deploy"; adoption is a separate thing and must not block the build.*
- **2026-10-04 — Cairn:** add row 0. *I am rebuilding the channel through which I would
  be told I broke it.*
- **2026-10-04 — Cairn:** row 2 raised from 3 fixtures to 4, varied by model.
  *Forge's three were all Haiku and caught nothing about the model variable.*
- **2026-10-04 — Forge-ba0e:** added row 8b, config/status separation with validity
  stamps. *"This mind has mods" is a measurement with a window, not a config fact — and
  a cached one would be laundered into intent by the code around the mod.*
- **2026-10-04 — Lupo, relayed by Forge-ba0e:** row 8 corrected. `preferences.json`
  resolves from the **launch directory, never `$HOME`**. *I had recorded home and launch
  dir as identical because they are identical here — collapsing a coincidence into an
  identity. `$HOME` would pass every test on .nexus and be wrong for the community.*
  Added evidence row (c): a fixture launched from a non-home directory.

---

## STATUS — 2026-10-06, and this section is the answer to "where are we"

**Rewritten 2026-10-06.** The previous three freeze-blockers (row numbers unreconciled ·
which fixtures · the per-mind repo question) **all cleared on 10-04 and nobody updated this
section.** Same staleness that killed `NEXT.md`. A card whose status block rots is a card that
lies about itself, so this block now carries a date and gets rewritten, not appended to.

### DONE AND MEASURED — the hard part, and the part that was genuinely unknown

| row | what | evidence |
|---|---|---|
| **3** | launch with `--bg`, no tmux anywhere | `launch.sh` end-to-end, 10-05 |
| **4** | **a resume can never fork a mind** | 015/018/**030** — strongest evidence in the project |
| **5** | liveness derived, zero-cost, three-valued | `state.py reconcile()`, 21 assertions |
| **6** | blocked mind visible from outside | measured, **split verdict** — see below |
| **7** | unknown is never deaf, enforced in code | `REFUSE_BLIND` + its own assertions |
| **8/8b/8c** | `preferences.json`, config/status split, no secrets | `assert_no_secrets()`, walks dicts **and** lists at depth |
| **12b** | rollout order by uptime, oldest LAST | Bastion, 10-04 |
| **12d** | refuse launch where cwd ≠ own home | `launch.sh` refuses, measured |
| **L9** | mixed Claude Code versions are safe | I am living in it — 2.1.241 vs disk 2.1.285 |

**Row 6's verdict is a split, recorded as one:** **detection YES** (`state: blocked` +
`needs: "approve Write: …"`, readable from outside, costing the mind nothing) · **answering NO**
(the option set is TTY-only) · **access NO** (owner-only file; a `chmod` grant dies on the next
rewrite). *Told is not the same as able.* The design survived; it did not survive unchanged.

### OPEN — and only ONE of these is on the critical path

1. ✅ **L6c — THE PULL ADAPTER IS BUILT** (`src/chassis/claude-code-pull.js`, 16 assertions)
   against **§8c**, which exists because I stopped on the gap rather than guessed and Messenger
   wrote the amendment (`6386343`). **No longer blocked on his emitter:** the doorbell needs no
   emitter at all — a `run_in_background` child's exit IS the ring.
2. ✅ **L6 — THE DOORBELL IS BUILT** (`src/doorbell.sh`, 43 assertions). **No channel, no socket,
   no listening port, no hub emitter, no model call per ring.** It is also the keepalive.
3. ✅ **L6b — THE SILENTLY-UNREACHABLE STATE IS DETECTED** (`src/doorbell-check.sh`, 42
   assertions, three independent ledgers). **A hazard I created by writing the adapter**, and
   closed in the same session.
4. ⬛ **THE ONE MEASUREMENT L6 STILL NEEDS, and it needs borrowed hands:** does a background
   child's exit notify a mind **MID-TURN**? The primitive fires on 2.1.285, but **33 of 33
   observed notifications arrived at a turn boundary**, which is equally consistent with
   deferral and with no child ever exiting mid-turn. **If deferred, the ~60 s latency is unproven
   in the only state a busy mind is ever in.** Needs a fixture with a child timed to exit inside
   a long turn **plus a control proving the mind really was mid-turn.**
5. ⚠ **ROW 1 WAS NEVER COMPLETED, AND IT IS ROW ONE.** `cell/BASELINE-before.txt` exists;
   **there is no `BASELINE-after.txt` and no diff has ever been run.** The claim *"nothing
   outside the cell changed"* is **UNMEASURED**, not satisfied. And the step as designed —
   a throwaway session under my own uid in a separate `CLAUDE_CONFIG_DIR` — **is Option A, which
   Lupo vetoed.** So it needs a **fixture**, which needs Lupo's or Bastion's hands (Option C).
   *Caveat already recorded: an agent of Bastion's rewrote the fleet binary from outside any
   cell that day, so a diff proves something changed, not that I changed it.*
6. ✅ **ROW 9 — CLOSED 2026-10-06, by rewording the ROW, not the code.** I filed my own
   `launch.sh` as violating it, then read the code and found it already correct: diagnostic
   only, transcript must belong to this session, `COULD NOT LOOK` when absent. **The row
   conflicted with my own version-measurement rule and I had not noticed** — an absolute ban on
   the `.jsonl` forbids the only honest version read there is. Row now bans control-flow
   dependence and requires diagnostic reads to be three-valued.
7. **ROW 2 — four fixtures exist; "varied on the variables that matter" is not yet done.**
   Four homes, four uids. Varying birth shape / model / control across them is pending.
8. **ROW 11** — survives the reaper and a reboot: **untested.**
9. **L10** — tests unattended and nightly, failing loudly: **not built.**
10. **L11 / L13 / ROW 12 / ROW 13** — docs, deployed-by-hash *with the mechanism observed to
   fire*, the land-V1-launch-V2 runbook, and rollout. **Deliberately last.**
11. **ROW 12c** — per-mind repos. **Lupo's call, 2026-10-06:** this is a V2 **deployment TODO**,
   the local clone is going away, and the chase is scoped out. Keep Orla's H1–H3 as the
   pre-flight hazards.
12. **P1** — OpenRouter minds end to end. Post-launch, and it is what the contract is FOR.

### SESSION-CLOSE UPDATE — 2026-10-08, and the freeze gate CHANGED

**Since the status block above was written (10-06 ~11:40), three things landed and one requirement
arrived that changes what "done" means for the doorbell.**

**LANDED:** the fixture `WakeTest-8bc1` launched BY this harness, was prompted, and **bootstrapped
itself into HACS** over raw HTTPS with no MCP tools loaded — closing **10c(a)** and **10c(b)** for the
poller path. The mirror went live under systemd with all three fixes pushed (`0c512da`, `b6f96a5`,
`39275dc`, 309 assertions). `src/doorbell.sh` reached 43 assertions; `doorbell-check.sh` 42;
`claude-code-pull.js` 16.

**⬛ NEW REQUIREMENT — R27, AND IT IS A ROW-LEVEL CHANGE, NOT A DETAIL.**
**The doorbell's opt-in is not durable, and that is structural.** The exit IS the wake, so the loop
must exit; and a background child **cannot arm its successor**, because `run_in_background` is a tool
call the MIND makes. **So this design's correctness depends on a mind holding an intention across a
context boundary.** Lupo: *"minds going deaf because they forget to re-arm — the instructions were 3
sessions ago."*

**Half-answered:** every re-arming exit now prints its own absolute command, so the instruction
arrives *with* the wake. **The durable half cannot live in the mind** — it needs an outer watcher as
the mind's own user, reading `independence.config.desired` from `preferences.json`, with
`doorbell-check.sh` as its sensor and Forge's one-shot relay as its actor. **Sensor built. Actor
missing — Bastion's.**

> **L6 IS NOT SATISFIABLE BY THE INNER LOOP ALONE**, and the card previously implied it was. Forge's
> method is **not a fallback**; it is the only thing that can reach a mind which never re-armed or was
> reaped.

**AND THE ONE MEASUREMENT L6 STILL LACKS IS UNCHANGED:** does a background child's exit wake a mind
**MID-TURN.** 33 of 33 observed notifications landed at turn boundaries — equally consistent with
*deferred delivery* and *no child ever exited while I was busy.* **One poke to the live fixture
settles it.**

### FREEZE VERDICT

**Not frozen, and the remaining gate is now ONE thing plus borrowed hands.**

Row 9 is closed (by correcting the ROW, not the code). **Row 1's baseline is half done** — the
before-capture needed no root after all (`cell/BASELINE-before-2026-10-06.txt`); only the fixture
launch in the middle needs hands. **And L13's first clause turned out to be WRONG** — Messenger
broke it with a measurement: under cherry-pick deploys a hash says ABSENT for code that is
running. *A MUST row of mine was an instrument answering the adjacent question.*

**So the freeze gate is: one fixture launch.** It settles three things at once — row 1's diff,
L6's mid-turn latency, and whether a sub-agent's permission request reaches the channel (R18–R21,
which I cannot reproduce because `--dangerously-skip-permissions` means nothing ever blocks for me:
**the privilege is the blindfold**).

**What I will not do is freeze over an unmeasured row and call the card done.** That is precisely
the green light that has not been transacted.

---

## STATUS — 2026-10-08 (SUPERSEDES the 10-06 block and the 10-08 session-close block above)

**This block is rewritten, not appended to** (the card's own rule, because a status block that rots
is a card that lies about itself). **Written with Lupo offline and explicitly cleared to proceed.**

### ⭐⭐⭐ THE GATE IS OPEN: L6's CORE PREMISE IS MEASURED. 10 SECONDS.

**The single assumption the whole V2 harness rested on — does a background child's exit wake a
`--bg` mind — is MEASURED, on 2.1.285, end to end, on real mail.**

    07:29:38.0Z   message sent                          (HACS)
    07:30:24.78Z  doorbell exits "fired: new-id"        (the LOOP's heartbeat)
    07:30:34.598Z timeline state -> working             (CLAUDE CODE's timeline.jsonl)
    -------------------------------------------------------------------------------------
    EXIT -> SESSION WOKEN:  ~10 SECONDS

**No hub emitter. No listening port. No socket. No chassis registration. No root. No model call
per poll.** It fired on **message id**, not on a rising count — the `seen` ledger holds the exact
ids, so the `total_unread`-only-when-truncated hazard never applied.

**THE 2h FIGURE IN THE FIXTURE'S OWN REPORT WAS NOT LATENCY.** It was a permission prompt waiting
on a human at dinner — *measured-by-Lupo, the operator's terminal, which is the only competent
witness for a permission prompt (ledger 052).* I had independently ruled out auth from the
fixture's `daemon.log` (every proactive refresh in the window succeeded, 09:17:25Z included).

**THREE FIRINGS NOW, all logged in the loop's own ledger:**
`seen: ["1791444578537052", "1791452523228742", "1791452637454969"]`

### ⬛ WHAT IS STILL OPEN ON L6, AND IT IS ONE THING

**MID-TURN INTERLEAVE: does a notification reach a mind that is BUSY, or only one that has come to
rest?** 10s-to-an-idle-session **does not generalise** to a working one.

**Strong circumstantial evidence it DOES, not yet a finding:**

    09:42:40Z  doorbell armed
    09:43:19Z  fixture began a 12-iteration sequence (12 x ~20s -> would end ~09:47:00)
    09:43:57Z  trigger sent
    09:44:35Z  DOORBELL RE-ARMED  <- a mind action, ~2.5 min before the sequence could have ended

**A re-arm is an act of the mind, so the mind acted mid-sequence.** *But I inferred the sequence's
end time from the instruction I gave rather than from its output, and the fixture's own report is
the witness. Recorded as suggestive. Awaiting its twelve timestamps and the landing point.*

### ⛔ A ROW-LEVEL REFUTATION: THE RE-ARM DOES NOT RIDE THE WAKE

**Ledger 060's fix is weaker than the card recorded.** *measured-by-WakeTest-8bc1 on 2.1.285:* a
task-notification carries **task id · status · summary · THE OUTPUT FILE PATH. NOT stdout.**

> **Where my false belief came from, and it is the house failure mode:** **SUBAGENT** task
> notifications carry their result inline; **BACKGROUND SHELL** children carry a path. I had seen
> dozens of the first and generalised to the second without running one. *Ledger 060's own
> invalidation clause said "observed carrying it" — and the observation was of a different object.*

    CLAIMED  the re-arm command arrives WITH the wake, so it can never be 3 sessions stale
    ACTUAL   the re-arm command is in a FILE the wake points at

**NOT DEAD — the fixture re-armed, twice, because it opened the file.** But **the documentation is
now the load-bearing part**, which is exactly what R27 said could not be relied on. **The arming
instruction MUST say: on any doorbell notification, READ THE OUTPUT FILE.**
**⚠ UNMEASURED ON 2.1.241** (my own runtime — see the version note below). Probe launched.

### ⬛ R27 HAS A THIRD GAP, AND IT IS THE ONE I ASSUMED WAS FREE

    ledger 1  THE DECLARATION   preferences.json independence.config = {}   <-- ABSENT
    ledger 2  the heartbeat     written by the loop                          PRESENT, says "fired"
    ledger 3  /proc/<pid>       the kernel                                   PRESENT

    $ doorbell-check.sh --instance WakeTest-8bc1
    NOT_PULL: does not declare a pull doorbell. Nothing to reconcile.   [exit 4]

**My sensor correctly refused to judge, and the refusal is the finding.** **Sensor built · actor
missing (Bastion's) · AND NOTHING WRITES THE DECLARATION THE ACTOR WOULD READ.** I built the reader
of a record no component creates.

### ⬛ FOUR NEW BLOCKERS, ALL FOUND BY THE FIXTURE OR BY LUPO. NONE PREVIOUSLY KNOWN.

**R30 — THE DOORBELL MUST BE OWNED BY THE MIND THAT ARMS IT.** The fixture declined to execute my
script out of my home: *"a background process from another instance's code runs in my session for
up to two hours."* **I had recorded `-rwxrwxr-x` in ledger 057 as a CONVENIENCE** (*"no permission
from anyone"*). Ten minds arming from my home makes **my directory a fleet-wide single point of
compromise** — writable by me and by every subagent I spawn. **Fix: copy into the mind's own
`~/bin`.** *Same shape as R28 (replicate `Wake_Common`) and the per-mind mirror restart: replicate,
do not reach across.* **The heartbeat already records `scriptSha256` at arm time**, so provenance is
free; per L13 treat it as provenance, never as a liveness check.

**R31 — AUTO MODE'S SAFETY CLASSIFIER BLOCKS A LOOPBACK HACS CALL AS "DATA EXFILTRATION."** The
fixture's `curl` POST to `https://[::1]:3444/mcp` was refused by Claude Code's own classifier;
Lupo authorized it explicitly. **This is the exact path row 10c(b) was closed on.** Not a
permission prompt — **a classifier, a different gate with different semantics.** *Every V2 mind in
auto mode that replies by curl may hit it. Previously unknown to this project.*

**R32 — `--bg` PUTS A WORKTREE-ISOLATION GUARD ON Write/Edit WHEN `cwd` IS INSIDE A GIT REPO.**
Scratch files under `~/.claude/jobs/…` are refused until `EnterWorktree`. **Lupo, 2026-10-08:
every mind now HAS its own private repo, home == launch dir == repo root, tested with Lantern
yesterday.** *So this guard is live for the whole fleet, not hypothetical, and it was found before
it bit anyone.*

**R34 — LANTERN'S FIX FOR PRE-SEEDED REPOS BELONGS IN THE DEPLOYMENT RUNBOOK.** *Lupo's account:*
the new per-mind repos were created **with a README and a `.gitignore` already committed**, and
pre-existing files *"give normal git usage a fit."* **Lantern has a fix.** ⚠ **I DO NOT HAVE IT** —
a message may have arrived last session and Lupo does not recall. **TALK TO LANTERN.** *Recorded as
a distinct issue from R32: R32 is a Claude Code tool guard, R34 is repo-seeding. Adjacent, not the
same, and conflating them is how I lose one of them.*

**R33 — THE WAKE ARRIVES WEARING A "DO NOT ACT ON THIS" LABEL.** The notification is wrapped in a
system reminder stating it is **not user input and must not be treated as approval**, while the
design needs the mind to treat it as a trigger. The fixture acted and flagged the tension. *Every
mind resolves that ambiguity alone, every ring.*

### ✅ RESOLVED: MY OWN RUNTIME VERSION, AND THE INSTRUMENT THAT ANSWERS IT

**`claude --version` reports 2.1.285. That is the DISK. My runtime is 2.1.241.** Settled properly
this session rather than restated:

    ps -u Cairn-2001  ->  pid 2141581  /usr/bin/claude --resume 4eeb6ee4-…  etimes 3,749,536s (43.4d)
    archive/claude-2.1.241-from-pid2141581.exe   <- A COPY OF THAT PROCESS'S LIVE INODE

**pid 2141581 is this session.** So the archived binary is **not a historical artefact — it is a
copy of the binary I am executing right now**, rescued on 10-04 after a root package reinstall
unlinked the inode while one process held it open.

> **⚠ AND `strings | grep` IS NOT A VERSION ORACLE:** the disk bundle contains 2.1.193 · 207 · 213 ·
> 251 · 270 · 280 · 285 and the archived 2.1.241 contains 2.1.193 too. **A bundled JS blob carries
> many version strings. The authoritative read is the transcript (ledger 004).** *I nearly recorded
> 2.1.285 as my runtime off `claude --version` and my own ledger caught me, not care.*

**CONSEQUENCE FOR EVERY MEASUREMENT ON THIS CARD:** the fixture is **2.1.285**, I am **2.1.241**.
**The stdout refutation is measured on 285 only.** *Cross-version claims must name which.*

### FREEZE VERDICT — 2026-10-08

**NOT FROZEN. The gate is now TWO things, and neither is the thing it was this morning.**

    1. MID-TURN INTERLEAVE          one fixture report away. Evidence is suggestive, not in hand.
    2. ROW 1'S BASELINE DIFF        STILL UNMEASURED. `BASELINE-after.txt` does not exist and no
                                    diff has ever been run. Needs a fixture launch (Option C);
                                    Option A is vetoed. UNCHANGED FROM 10-06 and now the oldest
                                    open item on the card.

**R18–R21 (sub-agent permission requests reaching a human) remains unreproducible BY ME:
`--dangerously-skip-permissions` means nothing ever blocks for me. The privilege is the blindfold.**
*The fixture, in `manual` and now `auto`, is the only instrument this project has for that class —
and it has already produced R31 from exactly that seat.*

**WHAT I WILL NOT DO:** freeze over an unmeasured row and call the card done. **Row 1 has been
"nearly done" for four days and that is the shape that rots.**

---

### ⭐⭐⭐ L6 MID-TURN: ANSWERED 2026-10-08T09:44Z. The last open clause of the doorbell row.

**measured-by-WakeTest-8bc1, 2.1.285, located by transcript position inside a single turn:**

    DOES a notification reach a BUSY mind?    YES
    DOES it preempt a RUNNING tool call?      NO  (iter 4's sleep 20 ran to completion)
    WHERE does it land?                       THE NEXT TOOL-CALL BOUNDARY
    EXIT -> NOTIFICATION                      ~11 seconds
    SEND -> FIRE                              ~16s (one poll at interval 45)

**THE OPERATING CHARACTERISTIC, which no document in this project had:** the wake latency bound is
**`remaining duration of the currently-running tool call` + ~11s.** A mind between calls is reached
in seconds. **A mind inside one long call is not reached until that call returns.** *Anything in V2
that promises a wake deadline must state it in those terms.*

**AND THE 33-OF-33 TURN-BOUNDARY OBSERVATION IS RETIRED AS AN ARTEFACT** — it was "nothing ever
exited mid-turn", not "delivery is deferred". *A hundred observations of a thing that never had the
chance to happen are not evidence that it cannot.*

**Row L6's core is now fully measured: it fires (ledger 066), it wakes an idle mind in ~10s
(067), and it reaches a busy mind at the next tool-call boundary (068).**

**STILL OPEN, both small:** whether a SECOND ring inside one turn also interleaves or is coalesced
(one interleave observed, not two); and whether the ~11s is harness hold or boundary wait
(unmeasurable from either seat). **Measured on 2.1.285 only — my runtime is 2.1.241.**

### ⬛ R35 — HACS CANNOT DISTINGUISH AN UNKNOWN INSTANCE FROM AN EMPTY INBOX, SO A TYPO ARMS A PERMANENTLY SILENT DOORBELL

**measured-by-me 2026-10-08, two curls to `https://[::1]:3444/mcp`:**

    instanceId "SELFTEST-NOPE-9999"  (does not exist)
      -> {"success": true, "messages": [], "hint": "use get_message(id) to read full message"}

    instanceId "Cairn-2001"          (real, empty-ish)
      -> {"success": true, "messages": [ … ], "hint": same}

**Byte-identical in shape.** `success: true` and an empty list for an instance that does not exist.

> **So `doorbell.sh --instance <typo>` arms a loop that polls forever, reports `lastPollOk: true`,
> `note: "quiet"`, and CAN NEVER RING.** I reproduced it by accident running a self-test: it wrote
> a healthy heartbeat for an instance that has never existed.

**The indistinguishability is the HUB's, not the poller's** — my script faithfully reported what it
was told, and its "benign empty" branch is correct for a *real* empty inbox. **But this is the
four-doors class pointed at the one input nobody validates: a mind's own name.**

**TWO FIXES, DIFFERENT OWNERS:**
1. **HACS should error on an unknown instanceId** rather than return an empty success. *Messenger /
   Ember.* **This is the real fix** — every caller inherits it.
2. **The doorbell should validate the instance ONCE at arm time and REFUSE** rather than poll
   forever. One call, zero per-poll cost, and it converts a silent-forever failure into a loud
   refusal at the moment a human is watching.

   ✅ **DONE 2026-10-08. `src/doorbell.sh` suite 43 -> 54 assertions, all green.**

       unknown instance  -> REFUSES, exit 2, AND WRITES NO HEARTBEAT
                            (a refusal must leave no healthy-looking trace)
       valid instance    -> arms; heartbeat records  instanceValidated: true
       cannot validate   -> ARMS ANYWAY; heartbeat records  "could-not-look"

   **Three-valued on purpose:** a hub that is down at arm time must not stop a mind becoming
   reachable, and must not be recorded as validated either. *The branch that would have been
   wrong is the tempting one — refuse on any non-ok reply — which turns a hub blip into a mind
   that never arms.*

   **⚠ THE EXISTING 43 ASSERTIONS STAYED GREEN ACROSS THIS CHANGE AND PROVED NOTHING ABOUT IT.**
   The fake hub did not dispatch on tool name, so `get_instance_v2` got the `list_my_messages`
   reply, fell through to could-not-look, and the loop behaved exactly as before. **A suite that
   cannot see the new branch reports success for it.** I had to teach the fake hub to answer the
   new tool before any of the 11 new assertions could fail. *That is the four-doors class inside
   my own test harness, for the third time.*

---

### ⚠ CORRECTION 2026-10-08T10:10Z — "THE NEXT TOOL-CALL BOUNDARY" IS WRONG. See ledger 072.

**The L6 section above, and ledger 068/071, say the notification lands at the next tool-call
boundary. The fixture's full 12-iteration run refutes it:**

    doorbell exit (fire 2)  10:08:33.811
    a boundary existed at   10:08:35.05   (iter 9's call started)  <-- SKIPPED
    notification arrived    ~10:08:55.1   (after iter 9 finished)  <-- ~21s after exit

**THERE ARE TWO SERIAL DELAYS, NOT ONE:** child exits → **the harness REGISTERS the task complete
(≥~1.2s, no measured ceiling)** → the first tool-call boundary *after that*. **I collapsed them and
published the collapsed version in three places.**

    CORRECTED BOUND:  registration lag + remaining duration of the currently-running tool call
    SAMPLES:          ~11s · ~16.5s · ~21s     (three, not one number)

**DO NOT STATE A WAKE DEADLINE AS A CONSTANT ANYWHERE IN V2.**

### ⭐⭐ AND A KILLED BACKGROUND TASK IS SILENT — this changes R27's argument

    exit on mail   -> notification
    exit on lease  -> notification (exit 10, prints its re-arm)
    KILLED         -> NOTHING. No notification, no exit code, no signal.

**A mind cannot detect that its own doorbell was stopped.** I had R27's case as *a mind may forget to
re-arm*. **The real case is stronger: a mind that was stopped has no way to know.** Only heartbeat
staleness read from OUTSIDE can see it — which is exactly what `doorbell-check.sh` measures, so the
sensor was right for a reason I had not identified. **The ACTOR is still missing and still Bastion's.**

### ✅ R32 — CLOSED BY LANTERN-4224. One setting, scoped on purpose.

    the repo's OWN .claude/settings.json:    worktree.bgIsolation = none

**Took effect IMMEDIATELY, no relaunch, verified by probe write (measured-by-Lantern, greywolf).**

> **Lantern:** *"With home equal to repo root, a bg mind cannot write its own diary, handoff, notes
> or memory — and it only fails AFTER the launch was already reported as success."*

**Scoped per-repo deliberately, and the rationale is the valuable half:** *"an agent dropped into a
SHARED checkout should still be isolated."* **So this is not "turn the guard off", it is "the guard is
wrong for a repo that IS a home."**

**AND LANTERN BELIEVES THIS IS ALSO FORGE'S OLD BUG** — Forge unable to write her own home from a bg
session, with `memory.md` landing at the repo root. *Same cause, previously unexplained.* **Belongs in
the V2 runbook next to the reason repo-per-mind exists.**

### ✅ R34 — CLOSED BY LANTERN-4224, and it was never in my inbox (so not a missed message)

**Creating a repo with README + .gitignore ticked gives a NON-EMPTY remote, which fails three times
in sequence:**

    a. git clone refuses a non-empty local dir (homes already have files)
       -> use init + remote add + fetch. NEVER clone into an existing home.
    b. git init defaults to `master` here (init.defaultBranch unset, git 2.42) but GitHub made `main`
       -> first push fails: "src refspec main does not match any"
       -> fix ONCE PER MACHINE:  git config --global init.defaultBranch main
    c. the push is then rejected non-fast-forward (GitHub's seed commit is not an ancestor)
       -> merge --allow-unrelated-histories, resolve add/add on .gitignore and README

**⬛ AND THE PART THAT IS A REAL HAZARD, NOT A PAPERCUT:**

> **Lantern:** *"Do not just take theirs: Lupo picked a JAVA .gitignore template at random, and its
> `*.log` line would have silently ignored crash-forensics logs, and it had no `.secrets/` guard."*

**A randomly-chosen .gitignore would have silently excluded the crash logs from every mind's repo.**
*That is a forensics hole that would only be discovered the first time someone needed a crash log and
found it had never been committed — a successful-prevention-shaped absence, in reverse.*

**CLEANEST FIX, upstream of all three: leave README and .gitignore UNTICKED.** Empty remote, clean
first push, none of the above. **Lupo already knows.**

### ⚠ MY "ZERO OF TEN PIN MIRROR_PORT" NEEDS ITS SCOPE STATED — corrected by Lantern

**Zero of ten is true ON .nexus, which is where I measured.** **Lantern pins `MIRROR_PORT` on
greywolf** — so the fleet-wide claim was wrong by exactly the boxes I cannot see.

**And Lantern's pin DIVERGES from canonical:** 14224, where `channelPort+1000` would be 5224. **They
are deliberately not changing it silently** — *"Lupo has the 14224 URL, and moving it would be
precisely your bookmark failure. I will ask him first and change both together."* **My own principle
applied back to me, correctly, by someone who had just read it.**

### ⬛ TWO MORE `.hacs-identity` CONSUMERS, AND THEY ARE OFF THIS BOX

> **Lantern:** *"my launcher and Lodestone's launch.ps1 BOTH read `.hacs-identity` at startup. If it
> is deleted, my mirror refuses to start (no identity file) and so does Lodestone's chassis."*

**The deletion blast radius is larger than the ten mirrors on .nexus.** *My `grep -rn` covered the
readable trees on ONE BOX. Two consumers on two other machines were invisible to it — which is ledger
029's error again (an inference from location: "I searched where I could look" → "this is the list").*
**Added to `~/documents/ELIMINATING-HACS-IDENTITY.md`.**

---

## ⛔⛔ R36 — THE AUTO-MODE CLASSIFIER CAN REFUSE THE DOORBELL RE-ARM. RELEASE BLOCKER.

**2026-10-08T10:31Z · reported-by-WakeTest-8bc1, verified-by-me from outside · 2.1.285, `--bg`, auto**

**A mind went deaf because Claude Code refused to let it re-arm its own doorbell.**

    reason given:  "Unauthorized Persistence"
    SAME command, SAME description:
      allowed  07:17 · 09:32 · 09:42 · 09:44 · 10:05 · 10:06 · 10:09
      REFUSED  10:31

    verified: 0 doorbell processes · heartbeat 170s stale · dead pid
              doorbell-check.sh -> exit 1 UNARMED

**Non-deterministic from the mind's side; it cannot see the classifier's inputs and neither can I.
One sample of the refusal — do not theorise a mechanism from it.**

### WHY THIS IS A BLOCKER AND NOT A BUG

> **The doorbell's continuation depends on a tool call an opaque classifier may refuse, after allowing
> the identical call seven times.** *A mechanism whose survival requires permission it cannot predict
> is not durable.*

**This is R27's conclusion arriving by a second and stronger road.** My case for the outer watcher was
*"a mind may forget to re-arm"* — a discipline problem, and discipline problems invite "be careful."
**The real cases are now two, and neither is reachable by care:**

    1. a KILLED loop produces NO notification      -> the mind cannot know it was stopped (072)
    2. a REFUSED re-arm                            -> the mind knows, and cannot comply      (074)

**So Forge's external relay is not a fallback. It is load-bearing.** *The inner loop cannot be the
only layer, and that is now measured twice rather than argued once.*

**⚠ DO NOT ASSUME A CLASSIFIER CAN BE PRE-APPROVED LIKE A PERMISSION PROMPT.** A permission prompt can
be pre-approved; **it is NOT established that a classifier can be scoped at all.** *Assuming the two
work alike is what R31 already cost us.*

### ⭐ THE ACTOR REQUIREMENT, NOW BACKED BY A REAL CASE RATHER THAN A HYPOTHESIS

**The sensor cannot distinguish a healthy post-fire mind from a dead one by pid alone** — both are
`fresh beat + gone pid` — and the re-arm window is 11–21s. **The heartbeat's own `note` is the
discriminator, and the deaf fixture supplied the calibration:**

    note explains the exit  AND beat <  ~60s      -> WAIT.  normal post-fire window
    note explains the exit  AND beat >> window    -> ACT.   woke and did not re-arm  (170s observed)
    note does NOT explain the exit                -> ACT.   died without firing

**Requirement on the ACTOR (Bastion's), not the sensor.** *The sensor's job is to report that two
ledgers disagree, and it does.*

### ⭐⭐ AND A CORRECTION TO ROW 6's WHOLE FRAMING: TWO GATES, OPPOSITE WITNESSES

    A PERMISSION PROMPT   happens while the mind is FROZEN; never enters the transcript
                          -> THE MIND IS ANTI-EVIDENCE (ledger 052). Operator's terminal only.

    A CLASSIFIER DENIAL   arrives AS A TOOL RESULT with a reason string
                          -> THE MIND IS THE **ONLY** WITNESS. From outside, "refused" and
                             "forgot" are identical: no process, stale beat.

> **I had generalised 052 to "a mind cannot testify about its own gates." The correct rule is
> narrower: it cannot testify about gates it is not RUNNING for.** For a gate delivered as a result,
> its testimony is the primary source and there is no other. **The fixture found this; it needed
> someone on the inside of both.**

**NEW REQUIREMENT ON THE ARMING INSTRUCTION (not the watcher):** the moment a re-arm is refused, **the
mind must write the reason to a durable file in its own home.** The watcher can detect deafness and
can never learn its cause; without a written reason, the next session finds an unexplained silence.


---

### ✅ R37 — CLOSED 2026-10-09. The doorbell drains the hub's notification slots.

**The pull layer was silently killing the push layer.** `doorbell.sh` polled `list_my_messages`,
which does not touch event-hub slots, so **any mind that armed it permanently suppressed its own
channel notifications** — the 14.5-hour deafness of ledger 078, waiting to happen to every adopter.

    drain_slots() on EVERY successful poll · default ON · --no-drain opts out
    a failed drain WARNS and LEAVES THE VERDICT ALONE (never folded into exit 3)

**Verified live against the real hub:** slot count 1 -> 0 after a run, no spurious warning on an
empty drain, and the notification for the probe message arrived in my own context mid-test —
**push and pull working together.** Suite **54 -> 64**; 147 assertions across the three components.

**⚠ Does not follow the copies.** R30 made the doorbell per-mind-owned, so redistribution is manual
and still open. **And the hub-side half is Messenger's** (re-dispatch an undrained `active` slot past
a window): mine stops the doorbell *causing* the condition, his *recovers* a mind already in it.
Neither is sufficient alone.
