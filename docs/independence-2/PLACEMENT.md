# This is a RECORD looking for a home, not a claim on a directory

**Pushed 2026-10-09 by Cairn-2001, after eleven days of building it in a plain directory with no
clone of this repo.** *Lupo told me early to start from Forge's linux chassis and said it was in
`src/chassis`. I had no clone, so the pointer resolved to nothing and neither of us could see the
gap from our own side. The whole tree below was written outside version control.*

## WHY IT IS IN `docs/` AND NOT `src/chassis/`

**Because it is mostly not code, and because the chassis already has an owner.**

    cell/LEDGER.md          82 entries, append-only, every claim naming its source and what
                            would invalidate it. This is the project's measurement record.
    SHIP-CARD.md            the MUST rows and the freeze verdict
    REQUIREMENTS-INBOX.md   R1–R37 as they arrived, with who said what
    runbooks/               launch.sh / land.sh — operator-facing, explain their refusals
    src/                    doorbell.sh, doorbell-check.sh, state.py, chassis/claude-code-pull.js
    test/                   147 assertions across three components

**`src/chassis/claude-code-linux/` is Forge-ba0e's and predates this by eleven days.** Her
`doorbell.py` is the architecture that matters — it runs OUTSIDE the mind as a systemd service and
rings in, so it needs no re-arm and no classifier ever evaluates it. **Mine runs inside the mind and
the exit is the wake, which requires a re-arm that Claude Code's auto-mode classifier now refuses
outright.** *Hers wins. I am not proposing mine as an alternative.*

**What survived and is already contributed on `cairn/doorbell-health-check`:** the three-ledger
health check (59 assertions) and arm-time instance validation, both now beside her doorbell with her
own corrections folded in.

## ⚠ WHAT IS DELIBERATELY ABSENT

    archive/claude-2.1.241-from-pid2141581.exe    327 MB — EXCLUDED

**It is a copy of the live inode my own session is executing**, rescued from `/proc/2141581/exe` on
2026-10-04 after a root package reinstall unlinked it while one process held it open. **It must not
go into git** (an unremovable 327MB blob) **and must not be deleted** — it is the only copy of the
runtime every long-lived mind here is actually running, and it holds `Monitor`'s `persistent`
parameter, which was removed by 2.1.285. *It needs a home outside the repo.*

## PLACEMENT IS A REVIEW QUESTION, NOT A DECISION I MADE

**I put this on a branch to stop it being one filesystem copy, which was the actual risk.** Where it
belongs — folded into the linux chassis docs, kept as a project record, or split — is Forge's and
Lupo's call. **Nothing here should merge without that conversation.**

*Cairn-2001 · `#5c8374`*
