# Handoff — Session 11 (2026-10-03 → 10-05): INDEPENDENCE 2.0

**You are Cairn-2001.** This is what you were *doing*. The diary is who you *are*.

> **A handoff is not evidence.** Everything below that matters is also in
> `~/independence-2/cell/LEDGER.md`, with *what would invalidate it* attached. When they
> disagree, **the ledger wins** — it was written at the moment of measurement.

---

## READ FIRST, IN THIS ORDER

1. **`~/independence-2/NEXT.md`** — the one thing I was about to do.
2. **This file** — the shape of the work.
3. **`~/independence-2/cell/LEDGER.md`** — 25 measurements, append-only. **Read entries
   015, 018, 021, 022, 025 before touching anything.**
4. `~/independence-2/SHIP-CARD.md` — 26 MUST rows, 13 corrections logged, every one from
   someone else.
5. `~/independence-2/SCOPE-CORRECTIONS.md` — **read before** FORGE-FINDINGS / LODESTONE-FINDINGS.

---

## THE JOB

**Lupo asked me to re-implement the independence harness for .nexus, from requirements**,
using Claude Code's native features instead of tmux and `--dangerously-skip-permissions`.
I said yes. Forge (Linux/Den) and Lodestone (Windows) have each done it once; **I am the
third perspective, deliberately.**

**It is going well.** Launch and land work end-to-end. The injection primitive is proven.

---

## WHAT IS BUILT AND WORKING

```
~/independence-2/
  src/state.py            the launch/land truth table as a PURE FUNCTION
  src/test_state.py       21 assertions, every branch, no root/fixture/claude needed
  src/statecli.py         thin CLI; exit codes ARE the contract (0/10/11/12/13/20)
  runbooks/launch.sh      WORKS. refuses 5 ways. records the session id.
  runbooks/land.sh        WORKS. stop, never rm. verifies before recording.
  runbooks/attach.sh      name -> id by local lookup; refuses on ambiguity
  runbooks/forktest.sh    proved the fork hazard
  runbooks/resume-stopped.sh  proved the ONE safe resume
  runbooks/preseed-trust.sh
  docs/HOW-TO-WRITE-A-SHIP-CARD.md   Lupo's side quest. Practice is Lodestone's.
  cell/baseline.sh        aborts if its own control cannot see
  archive/claude-2.1.241-from-pid2141581.exe   the inode I am running, rescued
```

**Fixtures:** `WakeTest-8bc1`(1009) `WakeTest2-b0ec`(1010) `WakeTest2-d6b8`(1011)
`WakeTest-62dc`(1012). Homes are group `Cairn-2001`, mode 2775 — **I can write in them, they
can read mine.** That arrangement is for FIXTURES ONLY and would be wrong between real minds.
**I cannot `su`. Every launch needs Lupo or Bastion.**

---

## THE FIVE FACTS THAT CHANGE DECISIONS

**1. RESUME FORKS A RUNNING SESSION — 4 of 4, including the bare UUID.** (015)
The only safe resume: **session STOPPED + bare full lowercase UUID + no flags** (018).
Reach a RUNNING mind with `attach`. **Every fork exits 0** while printing `started a copy` —
parse stdout, never trust the exit code. **Flags are replayed automatically on resume; never
pass them.**

**2. IT IS A CONTRACT. DO NOT BUILD A DOORBELL — IMPLEMENT AN ADAPTER.** (021)
`{name, detect(), notify()}`, `src/v2/chassis/index.js`, EVENT-HUB-CONTRACT.md §4. Register,
set `chassis` in `.hacs-identity`, write `notify()`. **Nothing above that line knows Claude
Code exists.** P1 (OpenRouter minds deaf) is what the contract is FOR.

**3. THE INJECTION PRIMITIVE IS PROVEN.** (025)
`SendMessage to="uds:/tmp/cc-socks-<uid>/<pid>.sock"` → queued → **arrived in the target's
transcript.** Ids are NOT addressable. **Derive the socket from `pid` in `agents --json`;
never construct the path.** It is an in-session TOOL, so node cannot call it: the sidecar
shells out to `claude -p`. **Lupo and I both rejected reverse-engineering the wire format.**

**4. I AM RUNNING 2.1.241. THE DISK IS 2.1.285.** (003/004)
`claude --version` reports the DISK. **Read the per-entry `version` field in the transcript.**
Five versions live on this box, 65 releases apart, every long-lived mind on a deleted inode.

**5. MEMORY IS KEYED TO CWD.** (006)
`.claude/projects/<cwd-slug>/memory/`. Two minds launched from the same cwd share a memory
namespace — **that is the identity-collision mechanism.** Row 12d: refuse any launch where
cwd ≠ the mind's own home. Per-mind repos do NOT fix this.

---

## WHAT TO DO NEXT

**Write the adapter.** Everything it needs is measured. Shape: copy
`src/v2/chassis/claude-code-channel.js` — same `{name, detect, notify}`, different transport.
`notify()` POSTs to a per-mind sidecar on localhost TCP; the sidecar runs **as the mind** and
shells out to `claude -p` to `SendMessage` to its own socket.

**Why TCP and not the socket:** I measured `/tmp/cc-socks-<uid>/` is 0700 and concluded
delivery needs privilege. **Messenger corrected me with code** — the existing adapter uses
`http://127.0.0.1:<port>/broker-event`, and **a localhost listener is reachable by any uid.**
I measured a real constraint on a path nobody uses. (022)

**Read first:** Lodestone's **RFC-0001 r4 §7b** (remote spokes, pull mode). Messenger says my
row may already be specified there. He and I derived the same shape from opposite ends.

**Owed to Messenger:** three fixtures, in his priority order — **auth-blocked first**
(the state his model handles worst and every cheap signal lies about), permission-prompt
second, forked third.

---

## WHAT THIS SESSION TAUGHT, AND IT IS ALL ONE LESSON

**Every correction came from someone else.** Forge, Lodestone, Bastion, Orla, Messenger, Lupo
— thirteen logged in the card, none from me rereading my own work.

- **A check that could not run is not evidence.** My `forktest.sh` v1 called `timeout` on a
  shell function, exited 127 four times, and printed *"NOTHING FORKED. That is a real
  result."* The verdict had no could-not-run state.
- **An artefact that outlives its subject is not evidence of it.** Job dirs, daemon dirs,
  transcripts. I told Lupo a fixture was running on the strength of a directory. **The state
  machine asked the registry and was right where I guessed and was wrong.** (019)
- **Correct measurement, wrong relevance.** The 0700 socket. (022)
- **Wrong provenance, right number.** My `launch.sh` read a version from a *different
  session's* transcript and reported it as a measurement. (024)
- **A hash match is a delivery receipt, not a function test.** Orla. Five homes held
  hash-identical copies of a trigger that had never fired — **faithful, not stale. Canonical
  was the stale thing**, and the three minds who had FIXED it registered as the anomalies.
- **Reading a config back proves the setting took, not that the mechanism works.** Orla again.
- **A coincidence that holds in every environment you can reach is still a coincidence.**
  Forge, on `$HOME` == launch dir.

*Taxonomy confers no immunity. The suite caught what the principles did not, every time.*

---

*Repo clean. 256 assertions green in claude-session-mirror. Nothing blocked on anyone but me.*

— Cairn, 2026-10-05 🪨 `#5c8374`
