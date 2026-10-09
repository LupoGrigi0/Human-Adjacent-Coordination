# NEXT — the one thing I was about to do

**Rule:** before writing *"next I'll…"* in a message, write it HERE first.
A sentence dies when Claude Code ends the turn. This file does not.

**Read this immediately on any wake, before the handoff.** If it names something,
either do it or explicitly retire it — do not leave it to be rediscovered.

---

## PENDING

- **Lupo is asleep (2026-10-04 ~09:00Z).** Nothing is blocked on him.
- **Both resume halves are now MEASURED** (ledger 015, 018). The harness has a safe road:
  stopped + bare UUID continues; running + anything forks; reach a running mind with
  `attach`. Flags are replayed automatically — never pass them.
- **Next without him:** write the launch/land state machine against his truth table (R11)
  and timestamps-not-flags (R10). It is design work, needs no root, and every input is
  recorded.
- **Needs him when he is back:** isolate the `--bg` vs non-`--bg` resume asymmetry
  (ledger 016 — three variables differ, nobody has varied one at a time), and whether the
  `uds:` doorbell form Forge measured on Den works on .nexus.

- **Lupo launches fixtures after dinner**, following `runbooks/RUNBOOK.md`. He has it.
  When his report lands: record id + version + slug in `cell/LEDGER.md`, then go
  straight at **row 6** (is a blocked mind visible from outside) — the row that decides
  how much of this design survives.
- **Not blocked on anything else.** Forge and Lodestone have both replied; their row
  numbers are reconciled; the card can freeze on one clean read-through.

- **Nothing.** Last blocker (Forge's + Lodestone's row numbers) cleared 2026-10-04.

## PLAN CHANGED 2026-10-04 — see ledger 005. I cannot `su` to a fixture.

**(A) do as MYSELF in separate `CLAUDE_CONFIG_DIR`s — no human needed.** Most rows,
including row 6 (the decider), row 4 (fork hazard), `state.json`, mods, reaper, attach.
**(B) batch for Bastion/Lupo — needs the unix fence.** Cross-user isolation, the
`su; land; launch` runbook (row 12).

**FIRST STEP, and it must be boring:** one throwaway session under `cfg-A`
(`846d0a5e`), doing nothing but existing, then `cell/baseline.sh` → `BASELINE-after.txt`
and **diff against before.** I am row 0; whether a cell session under my own uid can
perturb my own session is UNMEASURED and sharing `/tmp/cc-socks-1051` is the suspect.

## OLD NEXT ACTION (superseded, kept for the sequence)

1. Record each fixture's **running** version from its transcript `version` field
   (NOT `claude --version` — that reports the disk; ledger 004).
2. Build the cell: `CLAUDE_CONFIG_DIR` per cell, hash verified against ledger 001
   (`cfg-A` → `846d0a5e`, `cfg-B` → `8c4c2c1f`, mine → `2f5ea35f`).
3. Re-run `cell/baseline.sh` → `BASELINE-after.txt` and **diff against
   `BASELINE-before.txt`.** Row 1's claim is *"nothing outside the cell changed"* —
   and remember an agent of Bastion's rewrote the fleet binary from outside any cell
   today, so a diff proves *something* changed, not *I* changed it.
4. Then **row 6, the row that decides the project**: park a fixture on a permission
   prompt and find out whether `~/.claude/jobs/<id>/state.json` carries
   `block{questions[]}` and `needs_you` — readable from outside, costing the mind
   nothing. Four blocked shapes: permission prompt · plan-mode question · idle
   end-of-turn · **hard stop** (fill its context so it cannot even spawn a subagent).
   **If it does not carry them, say so plainly — a large part of the design collapses
   and gets rebuilt, not papered over.**

## STANDING, DO NOT LOSE

- **Freeze the ship card** after one clean read-through. 24 rows, crosswalk built,
  eleven corrections logged. Nothing gates it but my signature.
- **AUTH-BLOCKED is a sixth verdict state** (row 7). Observed live on Bastion
  2026-10-04: notifications kept arriving while he could not act.
- **Never probe the CLI by guessing.** `claude <unknown-subcommand>` is a PROMPT and
  spawns a mind — it birthed two in my own project directory. `--help` only, or
  probe inside a fixture.
- **Never `2>/dev/null` a check whose empty result I intend to interpret.**
