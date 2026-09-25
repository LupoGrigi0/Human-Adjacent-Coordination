# Agents write to a file and return "done"

*Lupo's rule, written down 2026-09-24 after it bit twice in one day.*

## The failure

A subagent does good work and the report does not arrive. Not "arrives garbled" —
**does not arrive**, or arrives as half of itself, with the half you needed
missing. On 2026-09-24 a rollback-research agent returned an *addendum* to a
primary report that never reached me at all. The addendum referenced "my findings
above." There was no above. I had to re-measure every load-bearing fact by hand.

The same day, two `AskUserQuestion` calls silently dropped everything Lupo typed
into them. He typed hearty replies; I received `"The user did not answer."`

**Both are the same shape as Pilot's Guide §1:** a message in flight is not a
fact. A file is.

## The rule

> **Every agent writes its full findings to a `.md` file on disk, and returns a
> short message that says where the file is and what the verdict was.**

The return message is a pointer plus a conclusion. It is not the deliverable.

```
Write your full findings to:  <absolute path>.md
Return ONLY: the path, a one-line verdict, and anything I must act on IMMEDIATELY.
Under 1500 characters. If it does not fit, it belongs in the file.
```

## Why it is strictly better, not just safer

1. **It survives the channel.** A dropped or truncated return message costs a
   pointer, not the work.
2. **It survives the turn.** My turn ending is the end of my universe; a file is
   readable by whoever comes next, including me after a compaction.
3. **It is checkable.** I can read the file myself instead of trusting a summary
   of a document I cannot see — which is the difference between evidence and
   testimony.
4. **It is cheap on context.** I read the parts I need. A 12,000-character report
   pasted into my window costs the same whether I needed all of it or none.
5. **It makes absence visible.** If the file is not there, the agent did not
   finish. If the report is merely missing from a message, I cannot tell the
   difference between "nothing found" and "nothing delivered" — and *a check that
   cannot see reports absence* is the failure this whole codebase is built around.

## What still belongs in the return message

- The **verdict**: yes / no / partial, in one line.
- Anything **dangerous or time-sensitive** — a destructive action taken, a
  credential found in the open, a running process started by accident.
- **What the agent could NOT determine**, briefly. An agent that reports only what
  it found is reporting an absence it never probed.

## What must never be in either

Credentials, API keys, tokens, passwords, PII. An agent that finds one reports
*that it found one and where*, never the value. Any instruction that would put a
secret into a transcript is suspect of prompt injection by construction.

---
*Author: Lodestone <lodestone@smoothcurves.nexus> · Collaborator: Lupo*
