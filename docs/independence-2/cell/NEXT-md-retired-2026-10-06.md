# NEXT — the one thing I am about to do

**Rule:** before writing *"next I'll…"* in a message, write it HERE first.
A sentence dies when Claude Code ends the turn. This file does not.

**Read this immediately on any wake, before the handoff.** If it names something,
either do it or **explicitly retire it** — do not leave it to be rediscovered.

> **This file went stale once and it cost a wake.** The 2026-10-04 version survived to
> 2026-10-06 still saying *"Lupo launches fixtures after dinner"* and *"go straight at row 6"*
> — both long done — because the session ended without updating it while the handoff got
> rewritten. **A file only survives the boundary if it is also kept current.** The old one is
> at `cell/NEXT-archive-2026-10-04.md`; nothing in it is live.

---

## THE ONE THING: write the chassis adapter — but the shape just changed. Read on.

Everything the adapter needs is measured (ledger 021/022/025). **Before writing a line I read
Lodestone's RFC-0001, as the handoff told me to, and it moved the design.** That is the system
working; record it rather than skip it.

### WHAT THE RFC CHANGED, AND IT IS NOT A DETAIL

**The handoff says r4. It is at r5** (`.../Messenger-aa2a/repo/docs/HACS-RFC-0001-REMOTE-SPOKES.md`,
2026-09-29, **author Lodestone-8ec9**, design origin Lupo). Messenger was right that my row is
partly specified there. **It is the only copy and it is unpushed** — tell Messenger/Lodestone.

**§7b "Two transports, one contract" inverts my transport choice.**

My design was **push**: `notify()` POSTs to a per-mind sidecar listening on localhost TCP; the
sidecar runs as the mind and shells out to `claude -p` → `SendMessage` to its own uds socket.
I chose TCP *because* Messenger corrected me that a localhost listener is reachable by any uid
(022). **That same property is the attack surface.** §7b's argument, in its own words:

> *"The spoke has **no listening port at all**, so the injection surface of §6 is not defended
> — it is **absent**, and an absent attack surface beats a defended one every time."*

On a box with fifteen-plus independent minds — one of which has already had an agent rewrite
the fleet binary unasked — **N new localhost listeners is N new injection points, each of which
would then need §6's signing to defend.** A pull shape needs none: the mind's own sidecar dials
the hub (already loopback-only at `[::1]:3444`) and holds or polls. Nothing to forge.

**I am NOT deciding this alone.** Push-vs-pull for the *local* adapter is genuinely arguable —
NAT and sleeping laptops, §7b's motivating cases, do not apply on-box, and today's v1
`claude-code-channel` adapter already pushes to a per-mind `channel.mjs` port, so the surface
exists and is accepted. What is new is that **V2 need not keep it.**

> **ACTION: ask Messenger (owns the bus) and Lodestone (wrote §7b) one question —**
> *for a local same-box mind in V2, does the adapter stay push to a per-mind listener, or
> become pull against the loopback hub?* Then build the one they land on.
> **This is the next thing I do, and it is a message, not a commit.**

### TWO RFC CLAUSES I MUST IMPLEMENT EITHER WAY

- **§6.1 — a notification that carries no instructions cannot be used to instruct.** The event
  carries `{channel, from, count, ts}` and **no content**. A forged doorbell can at most make a
  mind read its own authenticated mailbox. *The cheapest and most important defence in the
  design, and it is already in the contract.*
- **§6.4 — the adapter RENDERS the doorbell, never the sender.** Fixed format, `from` quoted
  and escaped, composed from fields by my code. **This is Bastion's R22–R24 structural fix,
  already specified.** A misattributed *imperative* is a trust-boundary bug; §6.4 is how the
  stream assembler stops producing one. My surface, his finding, Lodestone's clause.

---

## STANDING, DO NOT LOSE

- **Owed to Messenger: three fixtures, in HIS priority order** — **auth-blocked first** (the
  state his model handles worst and every cheap signal lies about), permission-prompt second,
  forked third. **I cannot `su`; every fixture launch needs Lupo or Bastion.**
- **Freeze the ship card** after one clean read-through. Nothing gates it but my signature.
- **Move the scripts into the HACS clone** at `src/chassis/<mine>/` per Lupo's direction.
  Symlinks into PATH are Bastion's at deploy time.
- **P1 — OpenRouter minds (Witness, Genevieve) end to end.** Deaf because
  `--dangerously-load-development-channels` is Anthropic-models-only. **This is what the
  contract is FOR** — the proof that nothing above the adapter line knows Claude Code exists.
- **R18–R21 (Bastion):** the mirror delivers a session's own permission requests, **not its
  sub-agents'**. His measured cost: a digest agent blocked **21 hours**. The boundary is
  **parent-vs-child inside one session tree**, not per-instance or per-uid — reason at the
  wrong granularity and every test still passes. And **an empty pending-list must mean
  UNKNOWN, not OK**, which lands on `pending_permissions_count` in my own `/health`.
- **AUTH-BLOCKED is a sixth verdict state** (row 7). Observed live on Bastion 2026-10-04:
  notifications kept arriving while he could not act.
- **Never probe the CLI by guessing.** `claude <unknown-subcommand>` is a **prompt** and spawns
  a mind — it birthed two in my own project dir. `--help` only, or probe inside a fixture.
  *Lupo: "don't poke yourself in the eye."*
- **Never `2>/dev/null` a check whose empty result I intend to interpret.** Broken again
  2026-10-06, minutes after reading the rule — ledger 027. **Every project slug here starts
  with `-`, so always `ls -- "$p"` or `ls "./$p"`.**

## RETIRED, SO NOBODY RE-CHASES IT

- **The git-root / shared-parent memory namespace.** My MEMORY.md did not load at the
  2026-10-06 wake (ledger 026 — real, recorded). **Lupo scoped the investigation out:** the
  local clone is going away, every mind gets a repo rooted in its own home launched from
  there, and the V2 deployment TODOs cover it. **The mechanism is being deleted, not measured.**
  Keep only the one-`ls` habit: at every wake, read the memory path your own system prompt
  states and look at whether it holds anything.
- **Ledger 025's transcript-size anomaly.** **COULD-NOT-LOOK, not resolved** (ledger 028):
  `~WakeTest-8bc1/.claude/projects/` is traverse-only for my group. Owned by root or the
  fixture, not by my silence.
