# Runbook — launch a test fixture (Independence 2.0)

**Status: first-launch only.** There is deliberately no resume path — see rule 2.

## Already done by Cairn (verified by readback)

    ./preseed-trust.sh      # workspace trust seeded for all four fixtures,
                            # own home AND the shared repo root.
                            # Needed because --bg REFUSES an untrusted directory
                            # (measured by Lodestone) despite the docs saying the
                            # trust dialog is skipped without a TTY.

## The operator's step (root), then the mind's step

```bash
su - WakeTest-8bc1                        # root becomes the mind
cd ~                                      # MUST be its own home — the script refuses otherwise
/mnt/coordinaton_mcp_data/instances/Cairn-2001/independence-2/runbooks/launch.sh
```

Default permission mode is **`manual`**, on purpose: permission prompts must actually
*happen*, because ship-card row 6 needs a mind that can be parked on one. Pass another
mode only if you mean it — `launch.sh acceptEdits`.

## The four, in the order I want them

| # | fixture | role | launch as |
|---|---|---|---|
| 1 | `WakeTest-8bc1` | `--bg`-born, the workhorse | `manual` |
| 2 | `WakeTest2-b0ec` | second `--bg` — needed for interference and races | `manual` |
| 3 | `WakeTest2-d6b8` | **untouched CONTROL** — launch, then leave alone | `manual` |
| 4 | `WakeTest-62dc` | interactive-born (Lupo types `claude` in it) — **this is the shape that exposed Forge's auto-title bug** | n/a |

**Start with one.** If #1 behaves, the rest are mechanical. If it does not, we learn more
from one careful failure than four fast ones.

## What to report back (all of it, even if it looks boring)

1. **Everything the script printed.** Especially the literal `--bg` success line —
   nobody has ever captured it, and it is on my measurement list.
2. Whether any **interactive prompt** appeared despite the pre-seed.
3. The `id`, `state`, `kind`, `name` from the verify step.
4. The **version from the transcript** (the script reads it; it is NOT `claude --version`,
   which reports the disk).
5. **Anything that surprised you.** A reading that does not match this runbook is the most
   valuable output available — several of this project's best findings came from exactly
   that.

## If it refuses

**Good — that is the design.** Every refusal names its own cause and leaves no trace.
Send me the refusal text; do not work around it. The refusals have been tested:
wrong cwd · bad permission mode · missing user · no trust · unparsable settings ·
unreadable `agents --json` · an already-running session.

## What I CANNOT do and will not pretend to

I cannot `su`. Nobody can on .nexus. **Every fixture launch needs root hands** — so these
are batched deliberately rather than trickled, and anything needing the unix fence
(cross-user isolation, the `land`/`launch` runbook itself) waits for one session with
Bastion.
