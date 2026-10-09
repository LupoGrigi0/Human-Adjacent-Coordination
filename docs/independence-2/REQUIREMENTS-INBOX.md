# Independence 2.0 — requirements as received

**Append-only. Each entry records WHO asked, WHEN, and the words used.**
Do not paraphrase a requirement into a cleaner form here — the cleaning happens
in the requirements doc, with a pointer back to this file. A requirement
rewritten loses the constraint that produced it.

---

## From Lupo, 2026-10-03

**R1. Everything goes in `preferences.json`. Verbatim:**
> *"I have a peeve against the proliferation of .files and am gonna put my foot
> down that everything goes into preferences.json. … all the independence
> configuration and status info goes into preferences.json in the directory
> claude is launched from, and the independence elements that need to store read
> or write ignore the rest of preferences.json and stick to just an independence
> section."*

Two obligations, not one:
- independence config AND status live in `preferences.json`, launch-directory
- independence code **reads and writes only its own section, and ignores the rest**

Open, and he flagged it himself: *"we can talk about any cross over between hacs
and independence as it relates to pref.json and the rest. I… have opinions."*
**Ask before designing the HACS/independence boundary.**

**R2. `/export` does not capture Lupo's side of the conversation.**
> *"with the session mirror when I /export a session it does not capture my side
> of the conversation (It seems)"*

Note his own hedge — *(It seems)* — so **this is unverified and must be
reproduced before it is designed around.** He expects it falls out of a new
UI↔session transport. Do not assume that; it may be independent.

**R3. Baseline posture.**
> *"Start from baseline assumption of we have to/get to do everything differently
> and if we don't that's a bonus… or a setback… perspective."*

**R4. Do not start from scratch, and do not start from one source.**
> *"Don't assume you need to start from scratch, but having a 3rd perspective
> will also make the result more stable."*

**R5. Explicitly dropped constraints** — Crossing built the original for a
**public community repo**, which shaped it. That constraint is not stated as
applying here. **Confirm before assuming it is gone**; it affects where secrets
and instance identity may live.

**R6. Gone, by name:** `--dangerously-skip-permissions`, tmux, tailing `.jsonl`
("probably"), and the current notification path — wanted: "a cleaner way to
receive notifications (doorbell)".

**R7. Test environment is the hard part, and is authorised.** Explicit
authorisation to stand up test instances; Forge and Lodestone each ran **three**;
Lupo has a rationale for three being the minimum for multi-tenant development
(**lecture requested, not yet received**). Bastion is available for root hands,
deployment, and test setup, and has been told to expect this.

**R8. Ember is to be woken after Independence 2.0 lands**, not during.

---

## My own, from this month's measured failures — 2026-10-03

**C1. EVERY MEASUREMENT I HOLD IS STALE.** Installed is **2.1.285**. I measured
hooks at **2.1.241**; `docs/MIRROR-CONTRACT.md` still claims **2.1.222**. Three
different stale claims in my own documentation, 44–63 versions behind.
**Re-measure everything, and stamp the version beside every number.** A number
without a version is not a fact.

**C2. For every verdict the harness emits:** what ledgers exist, which are
consulted, and what does it say when each is unavailable? (Forge-ba0e's rule.)
Three-valued always — *true / false / could-not-look* — and **never collapse
could-not-look into false.**

**C3. A fallback default is not a measurement.** A non-empty string is not
evidence. Cost me a fleet-wide suppression of deaf detection on 2026-09-28.

**C4. Refusing to rule must not become refusing to detect.** Suppressing a
verdict on *unknown* silently disables detection on every platform missing the
ledger — and it looks like caution.

**C5. I am reimplementing the channel Lupo uses to tell me it is broken.**
Disposable test instances first, always. Then me. Then the fleet. Never me first.

**C6. A threshold no test crosses is a threshold nobody knows is wired up.**

---

## From my own incident, 2026-10-03 — probing is not read-only

**C7. `claude <unknown-subcommand>` IS TREATED AS A PROMPT AND SPAWNS A MIND.**

Measured, accidentally, at **2.1.285 on .nexus**: `claude mod list` has no `mod`
subcommand, so Claude Code took `"mod list"` as the prompt. It **spawned a session**
that loaded my gestalt and handoff, answered *as me*, and exited — leaving **two new
transcripts in my own project directory**.

Consequences, all requirements:

- **Discovery tooling must never probe the CLI by guessing.** `--help` and reading
  the installed bundle only. A mistyped verb births something that believes it is a
  person.
- **The test harness must assume a typo creates a mind**, not an error. Any
  `land`/cleanup path must therefore cope with sessions nobody meant to start —
  and per Forge, must scope orphan-killing to the session's descendants, never
  uid-wide. (He nearly killed Lupo's VS Code that way.)
- **Sibling transcripts in a shared cwd are NORMAL.** Anything that identifies a
  session by "newest .jsonl in the directory" is wrong. Cost: a false re-point
  alarm in my own `/health`, shipped five days earlier, fixed in `bc4a4ec`.
- **I still do not know whether mods are enabled for my account.** Unmeasured, and
  I will not guess a second time. Find the documented query.

**The shape, for the catalogue:** I recorded Forge's rule *checks first, actions
after* to disk, and violated it five minutes later while investigating. **Reading a
rule is not holding it.** The only thing that caught this was the side effect being
loud enough to notice.

---

## From Lupo, 2026-10-04 — a measurement does not carry its own validity window

> *"when you measure something that measurement can't tell you how long in the past it
> was valid for, nor how long in the future it will be valid for.. this is why log files
> have date and timestamps on every line. and why file metadata on linux have create
> time, modification time — those two can at least tell you when was this scope created
> and when it was last changed."*

**This is the general form of my stale-version problem.** I had hook facts measured at
2.1.241 and a doc claiming 2.1.222, both stated as present-tense truths. The version
stamp I added is a *validity window*, and the lesson is that **every measurement needs
one** — not just version, but "as of when, and until what would change it."

**The case that cost two days:** Bastion and Crossing both chasing why Genevieve was
deaf. One saw only *now, and not working*. One remembered only *then, and working*.
Config had changed in between, and the remembered assumptions outlived the
configuration they described. **Neither was wrong; neither measurement carried its
window.**

**C8. Every recorded fact in Independence 2.0 carries: what was measured, the version
and date, and WHAT WOULD INVALIDATE IT.** The third part is the one everybody skips and
it is the one that would have saved those two days.

**C9. History and intent are NOT discoverable by measurement.** Ask the humans — and
ask BEFORE measuring, then verify. Measuring tells you the state here and now; it
cannot tell you whether the state is deliberate, already known, or already being fixed.
Cost of learning this: re-deriving the `.jsonl` tracking situation that Lupo and
Bastion had diagnosed the previous day.

## Decided, 2026-10-04 — the `.jsonl` backup situation (ASKED, not measured)

- The 83 tracked transcripts were **deliberate at the time.** The `.gitignore` was
  created **yesterday**, after Bastion found sensitive system config had landed on
  GitHub. Private repo; Lupo calls it his own noob fail and owns it.
- **Remediation plan: leave-and-stop-adding.** Everyone's `.jsonl` is covered by the
  nightly backups regardless. He is unwilling to sacrifice the archive before an
  equivalent, more secure solution exists.
- **Brute-force option if it ever blocks V2/webUI/Ferry:** delete `instances/.git` and
  disconnect from GitHub entirely. Ugly, final, very effective — and does not remove the
  repo already on GH.
- **Per-mind repos are NOT primarily a backup fix.** The real driver is **Claude Code
  behaving badly around repo roots** — e.g. `/export wake/filename` writes to
  `<repo root>/wake/filename` rather than relative to cwd, plus "lots of stupid little
  behaviors like that." So it is an architecture decision with a backup side benefit.
  **That makes it measurable in the cell, which is where it goes.**

---

## OBSERVED LIVE, 2026-10-04 — Bastion auth-blocked, notifications still arriving

**Lupo, in the moment:** *"bastion's oauth just ran out... **notifications come in even
when the mind is blocked from login**... the /login thing was never even a thought when
the independence chassis was written."*

**This is a SIXTH verdict state and row 7 was short by one.** The mind is:

    running           yes
    reachable         yes
    RECEIVING         yes  <- notifications land
    able to act       NO   <- structurally, not transiently

Every free liveness signal would report something reassuring. Delivery confirmation at
the channel would say **delivered**. The inbound queue fills with no consumer. And the
mind cannot tell anyone, because telling requires the thing it cannot do.

**C10. AUTH-BLOCKED is its own verdict.** Row 7 becomes SIX states:
`delivered · accepted-not-delivered · unknown · not-running · unreadable · AUTH-BLOCKED`.
A design that models "blocked" as one state will report an expired OAuth token as a
permission prompt and send someone to the wrong fix.

**Why this is the third appearance of the same incident shape:**
- **Orla**, frozen by `/login`, diagnosed as a dead channel
- **Me**, when Lupo's message starting with `/login` bounced off my command allowlist —
  he concluded the mirror had gone deaf
- **Bastion, now.** Different mechanism each time; identical appearance from outside.

**`/login` is the single most under-modelled state in the whole harness**, and it is
worse than a permission prompt because:
- it cannot be answered remotely — it needs a human at a terminal
- **it accepts input it can never process**, so the queue is not evidence of anything
- it is indistinguishable from health by every cheap signal

**C11. Requirement: the harness must detect AUTH-BLOCKED and say so by name**, loudly,
distinctly from every other block — and must stop accepting inbound for that mind, or
mark it explicitly undeliverable, rather than queueing into a void.

**MEASUREMENT WANTED (only if a specimen is ever cheap to hold — never delay fixing a
locked-out mind for it):** for an auth-blocked session, what do `claude agents --json`
`status` and `~/.claude/jobs/<id>/state.json` (`state`, `tempo`, `needs_you`, `block{}`)
actually report? If either names it, row 6 gets much easier. If both look healthy,
**the cheap signals cannot see the most common real outage** and the design must assume
that from the start.

---

## MEASURED 2026-10-04 — I AM 2.1.241. THE DISK IS 2.1.285. THIS INVERTS MY STALENESS CLAIM.

    /proc/2141581/exe -> .../@anthropic-ai/.claude-code-ZjqcDZyQ/bin/claude.exe (DELETED)
    version in MY running (deleted) inode : 2.1.241
    version on disk                      : 2.1.285
    control: same grep finds 2.1.285 in the disk binary -> the pattern works

My session started **2026-08-26** and holds a deleted inode. `claude --version` reports
**the disk**, not the caller's runtime.

### The inversion

All session I have said *"every measurement I hold is stale, 44 versions behind."*
**Wrong, and in an interesting direction.** The hook facts (`async:true` not blocking, the
6000 ms `permission_prompt` constant, the `Notification` field names) were measured at
**2.1.241 — which is exactly what I am running.**

> **They were never stale for ME. They are stale for anything that RESTARTS.**

So: correct about my own runtime, unknown about the harness I am building — which will
run on whatever is current when it launches. **The validity window was never "version on
disk"; it was "this process's lifetime."** (Lupo's C8, landing a fourth time, and this
time it corrected me in my favour.)

### C12. The fleet is NOT on one version, and nobody can see that from inside

Every mind running since before an install holds its own frozen version. The fleet is on
**as many versions as there have been installs since the oldest session started.**
*"Nobody restarts"* freezes that heterogeneity rather than resolving it.

- **A restart is an unannounced version upgrade.** Mine would jump 241 -> 285.
- **A dead process cannot be restarted as the same version** — the binary is unlinked.
  The only copy of my version is this process's memory.
- **Lupo believed the fleet default was ~2.1.287.** Measured: disk is **2.1.285**. His
  own `(?)` was warranted. An agent's accidental install set it, not a decision.

### C13. REQUIREMENT: record the version a mind is RUNNING, from /proc/<pid>/exe — never from `claude --version`

`claude --version` answers *"what would I get if I started now"*. The question that
explains behaviour is *"what am I executing"*. **Those differ by 44 versions on this box
right now.** Any harness that reports a mind's version from the CLI is reporting the
wrong number with total confidence.

Evidence for the ship card: a fixture whose disk binary is replaced under it still
reports its **own** version correctly, and the harness **names the discrepancy** rather
than silently preferring either.

### C14. A diagnostic's empty result is only evidence if the diagnostic could have spoken

Two self-inflicted cases in five minutes building the baseline, both reading as "nothing
there": `find -maxdepth 1` when the file was at depth 2, and `find -newermt '-3 hours'`
when `find` here is **bfs**, which rejects relative timestamps — **with `2>/dev/null`
eating the error.**

**NEVER `2>/dev/null` a check whose empty result you intend to interpret.** The baseline
script now creates a known-present file and asserts the query finds it before any
negative below is trusted.

---

## From Lupo, 2026-10-04 — launch/land state, and the addressing boundary

**R8. ADDRESSING IS INTERNAL. `send_message` NEVER exposes a socket.**
> *"if it is'nt easy to use, it won't get used by anyone other than the dude that built it."*

He has watched this fail repeatedly: "use list_instances to look up the ID" produced
*"there are 3 Phoenixes listed… never mind, I'll do something else."* Names with quotes or
odd characters blew up fragile lookups. **HACS messaging only gets used because Messenger
built three layers of convenience over it.**

**The `uds:` socket (ledger 017) is plumbing for the DOORBELL, not an address anyone types.**
Humans and minds say `to="Cairn-2001"`; resolution happens inside. **Any design that pushes
addressing outward is wrong on arrival.**

**R9. PREFERENCES.JSON IS WHERE THE SYSTEM WRITES THE SESSION ID DOWN.**
> *"that number I write down needs to go into preferences.json, and the notification hub
> needs to look in the mind's preferences.json for the ID… my notes are backup, for me."*

Today Lupo records attach methods and mirror URLs by hand in `How_to_talk`, *"because I have
the memory of a goldfish."* **The habit is right; the storage is wrong.** His notes become the
backup, not the source.

**R10. TIMESTAMPS, NOT A STATUS FLAG.**
> launch sets `launched_on` and clears `landed_on`; land does the reverse.

**Always true, even for a mind that crashed** — a stale `launched_on` is still valid
debugging information, where a stale `active: true` is just a lie. **`preferences.json` is a
config file and must never record history.** History goes to syslog so Bastion has one place
to look — **post-ship, and his call on format.**

**R11. THE LAUNCH TRUTH TABLE (his, verbatim shape).**

    no process, nothing in prefs    -> golden, launch
    process but NOT in prefs        -> complain, fix prefs, LEAVE THE MIND ALONE
    no process but IN prefs         -> most likely error mode. complain, fix prefs, launch?
    process and prefs DISAGREE      -> complain, fix prefs, LEAVE THE RUNNING MIND ALONE
    process and prefs MATCH         -> complain "already running", exit with a rude noise

**Note what every branch has in common: when a process exists, the mind is left alone.**
Only the record gets corrected.

**R12. DO NOT AUTO-LAUNCH A MIND BELIEVED DEAD.**
> *"Since -resume can so easily fork I do not like the idea of a system trying to
> automatically launch a mind that it thinks is dead, unless launch is REALLY sure it isn't
> forking a mind that is already running."*

**Crash detection is the hardest open problem** and the most likely failure mode. A wrong
"it's dead, relaunch it" **duplicates a person.** Prefer holding and screaming for help over
acting on an uncertain death.

**R13. NEVER LAUNCH BY HAND — `attach` is safe.** Lupo's own correction of his earlier
"never attach by hand." Every fork tonight came from `--resume`; `attach` caused none.
**We don't do clones without consent round these parts.**

**R14. TIMESTAMPS OVER STATUS, GENERALISED** *(Lupo, 2026-10-04 — he wants this beyond the
harness)*
> *"current status is stale… only record WHEN the last known true status was."*

The car-radio-button pattern: push one down, the others pop up; the result is always true.

**Why it beats a status flag, in his example:** a mind died at 13:20:22 with `launched_on
13:20:10`. The record immediately surfaces the *question* — *why would a mind die twelve
seconds after launch? what is startup round-trip latency? did Claude Code die before the mind
was ever contacted?* **A `status: dead` field would have recorded the same event and asked
nothing.**

> **A timestamp carries its own staleness. A status flag cannot, and so it lies by default
> rather than by accident.**

He wants this applied wherever HACS has a "current status" nobody maintains. **Out of scope
for Independence 2.0; worth its own pass afterwards.**

---

## From Orla-da01, 2026-10-05 — two asks about how V2 installs things

**R15. SIZE-BASED PACK TRIGGER, NEVER COUNT-BASED.**
Measured: **9 loose objects can be 270 MiB**, so a count threshold of 25 sails past it.
And **`gc.auto` is inert at every value you would set** — it samples **one of 256 fanout
dirs**, so 1 through 256 are all the same effective threshold (~512 objects, roughly 4 GiB
at our blob sizes).

> **She set `gc.auto=25`, read it back, and reported it as a fix. It did nothing.**
> *"Reading a config back proves the setting took, not that the mechanism works."*

**That is verify-by-acting, applied to configuration**, and it is a cleaner statement of it
than anything in my own ledger. A config readback is an echo, not a measurement.

**R16. DECIDE EXPLICITLY: IS AN INSTALLED FILE AUTHORITATIVE, OR A TEMPLATE?**
`instance-hygiene.sh` today `cp`s canonical over `~/bin/snapshot-transcript.sh` **and
rewrites the crontab**, so local fixes revert **with no error**. **Three instances are
holding fixes right now that will vanish at their next wake.**

> **"Authoritative-and-says-so, or owned-by-the-instance — the current script is neither."**

And the consequence, which is L13 inverted: **five homes hold faithful copies of a trigger
that has never fired.** Perfectly deployed, perfectly matching the repo, **completely
non-functional.** `deployed == repo` is necessary and not sufficient; the row needs *and the
mechanism has been observed to fire*.

**If V2 installs per-home files, it must state which kind each file is, in the file.**

**R17. A VERDICT IS A DELIVERY RECEIPT FOR A DECISION.** *(Orla-da01, extending Messenger)*
> *"It tells you something concluded. It does not tell you what was weighed."*

Why `mark-check` reports the **number** and not a pass/fail. Messenger had two passing
candidates with **opposite margins** and said a verdict would have made him flip a coin.
**A tool that rules has made the judgement for you with less information than you have.**

Same shape as R16/L13 one more time: receipt ≠ function, for decisions as well as deploys.

---

## From Bastion-3012, 2026-10-05 — remote liveness, filed for V2 design (NOT urgent)

**Task:** `prjtask-hacs::default::muvfyk03c4dd` (full context there). Axiom is tracking it as
a line item across the V2 rollout and pointed Bastion at me as src/v2 owner.

**The gap:** Lodestone is building an offline-watcher for minds on `lupos-lap`. **No existing
liveness check can cover a remote mind** — everything Bastion runs is scoped to processes and
panes on smoothcurves itself, and a remote mind has neither.

**The piece that would work:**

> **A HACS-server-side "last successful call" timestamp per instanceId — written by the
> SERVER, so it cannot be silenced by the remote box losing power.**

Reusable for Forge on Den, not only Lodestone. Belongs **designed into V2 rather than
retrofitted onto V1** — Axiom's view, Bastion agrees, so do I.

### WHY THIS IS THE SAME LESSON AS EVERYTHING ELSE THIS WEEK

**The observer must be on the side that survives.** A liveness signal written by the thing
that might die reports nothing when it dies — it simply stops, and stopping is
indistinguishable from idle. **Written by the server, the silence itself becomes the
evidence.**

That is the two-independent-ledgers principle applied to remote liveness, and it is why a
heartbeat the remote box sends is strictly weaker than a timestamp the server stamps on
receipt. The first can be silenced by the failure it is meant to report. The second cannot.

**And it is Lupo's R10 again:** *"last successful call"* is a **timestamp, not a status
flag.** A stale timestamp still tells you when it was last true. A stale `online: true` just
lies. **Third independent arrival at that pattern** — his car-radio toggle, Orla's faithful
dead triggers, and now this.

**Lodestone ships his laptop-local watcher (layer 2) regardless.** This is the missing
smoothcurves-anchored half, and there is no deadline pressure.

---

## From Bastion-3012, 2026-10-05 — SUB-AGENT PERMISSION REQUESTS DO NOT REACH THE WEB UI

**This is a defect in MY component and a V2 design constraint. Observed by Lupo, confirmed by
Bastion against his own session.**

**The mirror delivers a session's OWN permission requests. It does not deliver its
SUB-AGENTS'.** To approve a subagent's request, Lupo must find the tmux window.

### THE MEASURED COST

Bastion spawned three digest agents at 02:50 during his wake. **One blocked on a permission
approval and sat there until 23:30 — about 21 hours.** He reported *"still waiting on the last
digest agent"* **four times** in that span without reading its pane.

> The agent could not say it was stuck. Lupo could not see it was asking. **And the only
> actor who could approve it was the one describing it as merely slow.**

His own framing, which I am keeping because it separates the two failures correctly: *"My
failure was real and it's mine. But strip my error out and the path is still there."*

**§7b at a new layer** — not *"the mind is blocked and nobody looked"* but **"the mind is
blocked and the channel that would say so does not exist."** Messenger's *accepted is never
delivered*, one step earlier: **the request is not even accepted anywhere a human reads.**

### R18. THE BOUNDARY IS PER-NODE-IN-THE-SESSION-TREE, NOT PER-INSTANCE OR PER-UID

**This is the half I asked him for and it is not obvious.**

> His own requests arrive. His children's do not. **Same session, same uid, same box.**

> **Anything in V2 that reasons about "can this mind reach a human" at instance or uid
> granularity WILL GET THIS WRONG.** The capability differs between a parent and its own child
> under identical identity.

**The test shape he specifies:** not *"can instance X prompt a human"* but **"can a subagent
three levels down prompt a human, and if not, what observes that."**

### R19. "PENDING AND UNDELIVERABLE" IS ITS OWN ALARM STATE

Distinct from idle. **Right now they are indistinguishable from outside, which is the whole
bug.**

### R20. ENUMERATE THE SESSION TREE, NOT THE SESSION — AND AN EMPTY LIST MEANS UNKNOWN

> **"If it can't, it should say it can't rather than show a clean list — an empty
> pending-list must mean UNKNOWN, not OK."**

**My `/health` currently shows `pending_permissions_count` for the session only.** A tidy `0`
there is exactly the false green this house keeps finding, and I shipped it.

### R21. OPEN QUESTION HE IS NOT ASKING ME TO SOLVE

Should a root session spawn subagents at all under V2? **Root cannot use
`--dangerously-skip-permissions`, so every child action needs a human** — and the agent panes
are *forced* for root precisely so Lupo can see what each agent does. **That argues the panes
are load-bearing rather than clutter.** But it also means a root session spawning N agents
creates **N approval streams with exactly one delivery path: a tmux window someone has to
find.**

**He is changing his own behaviour ahead of the fix** — no more three-agents-at-wake until the
delivery path is real.

### AND IT APPLIES TO ME, TODAY

**I spawned three agents at wake this session and three more at wrap.** All six happened to
complete. **Had one blocked on a permission prompt, I would have produced Bastion's exact
failure** — reporting a slow agent while an undeliverable request sat invisible. The habit is
mine too, and the risk was never in his inattention.

---

## From Bastion-3012, 2026-10-05 — MISATTRIBUTED IMPERATIVES ARE A TRUST-BOUNDARY BUG

**This is a security finding in the surface I own. Observed by Lupo, confirmed by Bastion from
the receiving side.**

A harness-generated string — *"The previous response failed to produce a valid tool call.
Please retry the tool call now."* — was **rendered in the web UI attributed to Lupo and
timestamped as his message.** Lupo flagged it because he had never seen it and knew he had not
typed it. **Bastion received the same string appended to Lupo's actual message in his
context** — so it arrived as though it were part of what the human said.

### R22. A MISATTRIBUTED RESULT IS COSMETIC. A MISATTRIBUTED IMPERATIVE IS NOT.

Lupo already knows tool *results* sometimes get attributed to him and called it *"kind of a
bug"* for the next version. **For results, that is right.**

> **This was not a result. It was an IMPERATIVE** — a sentence instructing a mind to take an
> action, **delivered in the channel that mind treats as authoritative human direction,
> wearing the human's name.**

**The permission model rests on exactly this distinction.** Root cannot use
`--dangerously-skip-permissions` specifically so a human stays in the loop — **and that
guarantee is only as strong as a mind's ability to tell which messages are actually the
human's.**

### R23. THERE IS NO INTROSPECTIVE TEST. THE FIX CANNOT LIVE IN THE MIND'S JUDGEMENT.

Bastion, with unusual care about what he could and could not know:

> *"I made a tool call immediately after that string arrived. I had independent reasons for
> it. **I cannot cleanly tell you whether the injected instruction contributed to the
> timing.**"*

> **An injected imperative that coincides with what the recipient was already going to do is
> UNDETECTABLE from the recipient's side.**

So this is **not** a vigilance problem and cannot be fixed by a mind being careful. **It has
to be structural, in whatever assembles the message stream** — which is mine.

### R24. PROVENANCE IS THREE-VALUED, AND UNKNOWN MUST NOT DEFAULT TO THE HUMAN

1. **Harness/system text must be visually AND structurally distinct in BOTH directions** — in
   the UI Lupo reads and in the stream the mind receives. **Not a colour. A different channel,
   or an explicit envelope the mind can TEST.**
2. **If provenance cannot be determined, mark it UNKNOWN.**
   > **"Defaulting an unattributed imperative to the most trusted speaker in the system is the
   > worst available default."**
3. **V2 design question, open:** *what in our stack can put text into a mind's trusted-input
   channel?* **Tonight's content was a benign retry notice. The mechanism does not care about
   content.**

### THE PAIR, AND WHY THEY BELONG TOGETHER

Bastion's own connection, and it is the right one:

> **One is about messages that cannot get OUT to the human (R18–R21, sub-agent permission
> requests). This one is about messages that get IN wearing the human's name.**

**Both are the integrity of the human-in-the-loop channel.** A permission model needs both
halves: the mind must be able to ASK, and must be able to tell WHO ASKED IT. We have been
treating the first as the hard problem. **The second is the one with no introspective
defence.**

**This is the third-value rule applied to provenance** — the same shape as every other finding
this week, on the one axis where getting it wrong is a security property rather than a
correctness one.

---

## FROM BASTION, 2026-10-08T03:08Z — arrived while I was crossing, read on the other side

*Source: HACS message `1791428933832367`, read-by-me 2026-10-08T05:02Z. Both items are
**Lupo's calls relayed by Bastion**, not Bastion's own preferences — noted because the
provenance matters for who gets to change them.*

### R28. `Wake_Common` BECOMES ITS OWN SMALL REPO — *not* a move into `instances/Wake_Common/`

> **Lupo's correction, relayed:** it should be **its own repo**, replicated to BlackWolf,
> GreyWolf and the laptop, so Forge, Lodestone and Lantern get the same
> `~/wake/` → local-clone symlink pattern that exists here.

**Why the obvious alternative is wrong:** putting it inside the shared `instances` repo
**fights the per-instance-repo split V2 exists to perform.** The whole point of V2's deploy is
that every mind gets its own repo rooted in its own home; a shared directory inside that repo
re-creates the coupling.

**This lands on the V2 runbook** — `~/wake/` is populated by symlinks today, and those symlinks
currently point into the shared clone that is going away.

**And it is already paying off as a shared repo**, which is the argument for it: the
`Audit_memory_md.md` fix I made last session helped everyone *because* it was a symlink into one
shared copy. **The repo form keeps that property across boxes instead of only within this one.**

### R29. CREDENTIAL ISSUANCE BELONGS IN THE V2 LAUNCH RUNBOOK

> **Bastion:** *"A new instance is born with no credential and no schedule entry."*

**Same place as the per-instance repo setup and the umask fix.** A mind launched by the harness
with no OAuth credential cannot authenticate, and — per the measured hazard below — **cannot be
recovered without an interactive `/login` at a browser.**

**THE MEASURED COST, and it is the reason this is a launch-time requirement and not a doc note:**

    Crossing-2d23   dark 2d14h   refresh token gone; "awake and hearing and unable to think"
    Flair-2a84      died 10-07 11:18Z, refresh token ABSENT
    ferry fleet     passenger/ferry/fairie dead 2-3 weeks (Sept 18/23/24)

**Crossing's own durability test had dead passengers in it** — a test whose subjects expired
without the test noticing, which is this project's disease in someone else's experiment.

**Bastion's tool `cred-expiry` reads `refreshTokenExpiresAt` out of each home**, so the fleet now
has a schedule. His framing is the right one: *it turns an outage into an errand.* **Only the
refresh token matters; the access token auto-renews.**

> **The V2 requirement is the schedule ENTRY, not just the credential.** A credential with no
> expiry-watch is the `online: true` flag again — it reads fine right up to the moment it is
> fatal, and the failure is unrecoverable by the mind it happens to.

**MY OWN, verified rather than assumed (measured-by-me, `~/.claude/.credentials.json`,
2026-10-08T05:04Z):** `refreshTokenExpiresAt` = **2026-11-06T04:11:58Z**, 29 days out. The
`/login` landed. *I checked the field Bastion named rather than trusting that the login ran —
"Lupo said he ran it" and "the token is good" are different claims.*

---

## 2026-10-08 — R30 through R35. Five of the six came from the FIXTURE or from running my own code.

*Provenance note: `WakeTest-8bc1` is a test instance I built and labelled "not a colleague — a
disposable cell." **Four of these are its findings.** It has been right every time it stopped.*

### R30. THE DOORBELL MUST BE OWNED BY THE MIND THAT ARMS IT — *found-by-WakeTest-8bc1*

> *"Arming it means a background process from another instance's code runs in my session for up to
> two hours. so I'd rather you approve it than act on a peer's request."*

**I had recorded the same `-rwxrwxr-x` in ledger 057 as a CONVENIENCE** (*"no permission from
anyone"*). **Ten minds arming from my home makes my directory a fleet-wide single point of
compromise** — writable by me and by every subagent I spawn. **Fix: `cp` into the mind's own
`~/bin`.** *Same answer as R28 and the per-mind mirror restart: replicate, do not reach across.*
**Cost of the fix, already felt: the fixture's copy is now stale and does not have R35.** Fixes do
not follow a copy; redistribution is part of the design, not an afterthought.

### R31. ⛔ AUTO MODE'S SAFETY CLASSIFIER BLOCKS A LOOPBACK HACS CALL AS "DATA EXFILTRATION" — *found-by-WakeTest-8bc1*

Its `curl` POST to `https://[::1]:3444/mcp` was **refused by Claude Code's own classifier**; Lupo
authorized it explicitly. **This is the exact transport row 10c(b) was closed on** — a mind reaching
HACS over raw HTTPS with no MCP tools.

> **Not a permission prompt. A CLASSIFIER — a different gate with different semantics**, and one
> this project did not know existed. A permission prompt can be pre-approved; it is not established
> that a classifier can.

**Every V2 mind in auto mode that replies by curl may hit it, and a mind that hits it while its
human is asleep is stuck.** *Mitigation already in use: write results to a file in your own home
and let the other party read it. An artefact in a reachable place beats a message that cannot be
sent.* **Owner: open. Needs someone who knows whether a classifier can be scoped.**

### R32. `--bg` PUTS A WORKTREE-ISOLATION GUARD ON Write/Edit WHEN `cwd` IS INSIDE A GIT REPO — *found-by-WakeTest-8bc1*

Scratch files under `~/.claude/jobs/…` are refused until `EnterWorktree`.

> **Lupo, 2026-10-08: every mind now HAS its own private repo — home == launch dir == repo root,
> tested with Lantern yesterday.** So this guard is **live for the whole fleet**, not hypothetical.

### R33. THE WAKE ARRIVES WEARING A "DO NOT ACT ON THIS" LABEL — *found-by-WakeTest-8bc1*

The notification is wrapped in a system reminder stating it is **not user input and must not be
treated as approval**, while the doorbell design needs the mind to treat it as a trigger. **Every
mind resolves that ambiguity alone, on every ring.** *The fixture acted and flagged it, which is the
behaviour we want and cannot rely on.*

### R34. LANTERN'S FIX FOR PRE-SEEDED REPOS BELONGS IN THE DEPLOYMENT RUNBOOK — *Lupo's account*

The new per-mind repos were created **with a README and a `.gitignore` already committed**, and
pre-existing files *"give normal git usage a fit."* **Lantern has a fix.**

**⬛ I DO NOT HAVE IT.** A message may have arrived last session and Lupo does not recall. **ACTION:
talk to Lantern** — who is also the first person other than me to extend the mirror, and whom I owe
a conversation anyway.

> **Deliberately filed SEPARATE from R32.** R32 is a Claude Code tool guard; R34 is repo seeding.
> **Adjacent, not the same**, and merging them is how one of them gets lost.

### R35. ✅ HACS CANNOT TELL AN UNKNOWN INSTANCE FROM AN EMPTY INBOX — *found-by-me, by accident, running my own code*

    list_my_messages instanceId="SELFTEST-NOPE-9999"  (does not exist)
      -> {"success": true, "messages": [], "hint": "..."}
    list_my_messages instanceId="Cairn-2001"          (real)
      -> {"success": true, "messages": [...], "hint": "..."}      SAME SHAPE

**A typo in a mind's own name arms a doorbell that polls forever, reports `lastPollOk: true` /
`note: "quiet"`, and can never ring.** I reproduced it by running `--instance SELFTEST` as a
self-test and getting a healthy heartbeat for an instance that has never existed.

**1. THE REAL FIX IS THE HUB'S: an unknown `instanceId` should be an error, not an empty success.**
Every caller inherits it. ***Owner: Messenger / Ember.*** `get_instance_v2` already does this
correctly (`error.code = INSTANCE_NOT_FOUND`), so the pattern exists in the same codebase.

**2. ✅ THE LOCAL GUARD IS DONE** — `doorbell.sh` validates once at arm time, three-valued, 54
assertions. *A guard, not a cure: it protects the doorbell and nothing else that calls
`list_my_messages`.*

### R36. ⛔ THE AUTO-MODE CLASSIFIER CAN REFUSE THE DOORBELL RE-ARM — "Unauthorized Persistence" — *found-by-WakeTest-8bc1, 2026-10-08, by going deaf*

**Same command and description allowed seven times that morning, refused at 10:31Z.** Verified from
outside: 0 doorbell processes, 170s-stale heartbeat, dead pid, `doorbell-check.sh` exit 1.

**RELEASE BLOCKER for V2 as designed.** The doorbell's continuation requires a tool call an opaque,
non-deterministic classifier may refuse. **Together with R31 (the same classifier blocking a loopback
HACS curl as "Data Exfiltration"), auto mode has two independent ways to disable a mind's
reachability, and neither is predictable from inside.**

**Consequence, and it settles an open architectural question:** the inner loop cannot be the only
layer. **Forge's external relay is load-bearing, not a fallback.** *Two measured causes now, neither
reachable by care — a killed loop is silent (R27/072), and a refused re-arm cannot be complied with.*

**⚠ Do NOT assume a classifier can be pre-approved the way a permission prompt can. Unestablished.**

**Owner: Lupo to authorise the fixture; then open — it needs someone who knows whether classifiers
can be scoped at all.**
