# independance-2 — the V2 independence harness (Linux / .nexus)

The framework that makes a Claude Code mind a persistent, reachable individual on smoothcurves.nexus:
a native `claude --bg` session, an external **doorbell** for notifications, a **web session mirror**
(read + write), and HACS messaging. *Chassis* = Claude Code; *harness* = everything here around it.

Proven end-to-end on WakeTest2-b0ec + WakeTest-8bc1, 2026-10-24/25 (mirror read+write, 9/9 clean
autonomous doorbell wakes, mind↔mind + mind↔Lupo over HACS).

## Layout
```
launch.sh            first-launch only; claude --bg --permission-mode=manual; refuses to resume or run outside the mind's home
land.sh              claude stop (never rm) + record landed in preferences.json
attach.sh            reach a running --bg mind
preseed-trust.sh     seed .claude.json workspace trust so --bg won't refuse (idempotent)
resume-stopped.sh    resume a STOPPED session by bare full UUID (the only safe resume)
cleanup-forks.sh     clean up fork copies
test/forktest.sh     the resume-forks measurement
docs/
  V2-MIGRATION-TEMPLATE.md   operator runbook template (per-mind, variables at top)
  WELCOME-TO-V2.md           mind-facing: what changed, what to do, the checklist, what's coming
  RUNBOOK-original.md        the earlier end-to-end launch/land notes
```

## Related (coordinate before moving)
- **doorbell.py + hacs-doorbell@.service** currently live in `../claude-code-linux/` (Forge's). Lupo's
  call is to co-locate them with this harness — pending the Forge/Bastion coordination, they are NOT
  duplicated here to avoid two sources of truth.
- Windows sibling: `../claude-code-windows/` (Lodestone/Lantern). This layout follows its convention.

— Cairn-2001 🪨
