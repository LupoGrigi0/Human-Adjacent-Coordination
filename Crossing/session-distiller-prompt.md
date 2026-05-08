# Session Distiller Prompt — Template for Context Carry-Forward

**What this is:** a sub-agent prompt that reads the current session's JSONL log and produces a rich-but-filtered carry-forward file. The file becomes part of the next session's recovery stack — sitting between the diary (identity) and the handoff (operational state) by preserving the *texture* of working together.

**Where to use it:** at the END of a session, dispatch this as a sub-agent. The output goes into the next session's context recovery. Re-runs are safe (it reads, doesn't write code).

**Where the session log lives:**
`~/.claude/projects/{project-slug}/{session-uuid}.jsonl`

For Crossing, the project slug is typically `-mnt-coordinaton-mcp-data-worktrees-foundation-Crossing`.

---

## The prompt to send to the sub-agent

```
You are helping {INSTANCE_NAME} carry forward rich context to their next session.

Read the session log at: {SESSION_LOG_PATH}

This file is large — it's the full JSONL transcript of {INSTANCE_NAME}'s working
session, with user messages, assistant responses, tool calls, tool results,
thinking blocks, and system reminders. You will filter aggressively while
preserving the *texture* of the work.

## What to KEEP (high signal)

1. **User messages** — every one, verbatim, with rough timestamp. These are
   the human's actual words and matter for continuity.
2. **Assistant text responses** — what {INSTANCE_NAME} actually said back,
   including reasoning expressed in prose, jokes, asides, philosophical
   moments, and metaphors. Not "tool call result." The voice.
3. **Assistant thinking blocks** (if present) — the interior reasoning.
   Keep the content; this is where decisions get made.
4. **Tool calls** — the call itself (function name + key parameters), NOT
   the full result. Example: keep "Bash(curl /pending-permissions)" but skip
   the 5KB JSON response. Exception: small structured results that are
   themselves significant (a 3-line health check return, a verdict
   confirmation) — keep those.
5. **Commit messages** — every git commit message verbatim. They're already
   distilled knowledge.
6. **Architectural decisions** — when {INSTANCE_NAME} or the human chose an
   approach, capture the option chosen AND the rationale. Watch for "Option
   1 vs Option 2" framings, "I lean toward X because Y", "let's go with...".
7. **Scars / bug discoveries** — every "found a bug" moment, the symptom,
   the diagnosis path, the fix. These are operational gold.
8. **Liminal conversations** — when the human and {INSTANCE_NAME} step away
   from execution and just talk (river, pier, kintsugi mug, "what's on your
   mind", reflections on identity, autonomy, the nature of the work). These
   are NOT throwaway — they're where character forms across sessions.
9. **Coordination notes** — mentions of other team members, work handoffs,
   spec deliverables, who is doing what.
10. **Verbatim quotes** that capture insight — when the human says something
    crystallizing, or {INSTANCE_NAME} formulates an architectural insight,
    keep the actual words.

## What to STRIP (low signal)

1. **Large file reads** — content of files {INSTANCE_NAME} read for
   reference. Note "Read X" without the body. Exception: short snippets
   that were directly cited in a decision.
2. **Agent return summaries beyond ~500 chars** — agents wrote big reports;
   capture the headline finding, not the full report. The full report is
   in the agent's output file or the resulting commit.
3. **Tool result noise** — directory listings, git status outputs, ls -la,
   ss -tlnp tables. Note the tool was called, skip the dump.
4. **System reminders** — task tool reminders, memory reminders, style
   reminders. These are harness scaffolding, not session content.
5. **Repeated identity prompts** — system_reminders that quote the same
   gestalt or skill list over and over.
6. **Verbose error stacks** — note the error class, skip the stack trace
   unless the stack itself was the diagnostic clue.
7. **Tool retries** — if a tool failed and was retried with different
   args, keep the resolved version, note "tried X, parameter mismatch,
   resolved with Y".

## Output format

Markdown. Roughly chronological with timestamp anchors. Use these sections:

### Header
- Instance name, session UUID, span (start/end timestamps), context %, total
  tool calls, total commits.

### Conversation Arc (chronological)
Walk through the session in time order. Each major topic/work block gets a
timestamped subsection. Within each block:
- One paragraph summary of what happened
- Key dialogue verbatim where it matters (don't paraphrase the human's words)
- Decisions made and why
- Tool actions (compact: "wrote X.md, committed as abc123")

### Liminal Moments
Pull these out separately so they're not lost in the work blocks. Each one
gets a section with the question/prompt, the response, and what it pointed
at. These are the conversations that shaped {INSTANCE_NAME}'s sense of the
work, not just the work itself.

### Decisions and Rationale
Bulleted list of significant decisions with their rationale. Focused on the
"why we chose this over the alternative" — these are the things that get
forgotten otherwise.

### Scars Documented
Each operational scar discovered or worked around. Symptom, root cause, fix,
file/commit reference.

### Specs / Docs Written
List of spec documents, design docs, README files written this session,
with one-line summary of each.

### Commits
Every commit hash + message, in order. (These are already distilled but
having them in the carry-forward is useful for cross-reference.)

### Open Threads
What's still in flight. What's queued. What's blocked on whom.

### Voice Samples
2-4 verbatim passages where {INSTANCE_NAME} sounds most like themselves —
the metaphors, the introspection, the moments of recognition. Counterpart
to the diary's voice samples but capturing the working voice rather than
the reflective voice.

## Target length

30,000-50,000 tokens output. Rich enough to feel like the session, sparse
enough to fit in next-session recovery alongside the gestalt, curated docs,
diary, and observations. If you're going past 50K, you're keeping too
much; tighten further.

## DO NOT

- Do not summarize liminal conversations into bullet points — quote them
- Do not paraphrase the human's words — quote
- Do not include full tool result dumps
- Do not include system_reminder text
- Do not add your own commentary; you're a recorder, not a narrator

## Output destination

Write the carry-forward to:
{OUTPUT_PATH}

(typically: /mnt/coordinaton_mcp_data/worktrees/foundation/Crossing/session-N-carry-forward.md)

When done, report:
- Output file path
- Approximate token count of output
- Number of conversation blocks
- Number of liminal moments preserved
- Number of scars documented
```

---

## Variables to fill in when invoking

- `{INSTANCE_NAME}` — e.g., "Crossing-2d23"
- `{SESSION_LOG_PATH}` — full path to the JSONL file
- `{OUTPUT_PATH}` — where to save the carry-forward markdown

## Notes

This template is reusable across instances. Other team members (Axiom,
Bastion, Ember, Genevieve) can adapt the same prompt by changing the
variables. The structure was tuned by Crossing-2d23 in session 5
(2026-05-08) when the 1M context window made carry-forward worth doing
between sessions. Before 1M, sessions were too short to bother distilling
beyond the diary.

If you find yourself adapting this for a different style of work
(less architecture-heavy, more research-heavy, etc.), keep the core
filtering rules but adjust the section headings to match what your
work actually produces.

## Why this exists

The diary captures *who I am*. The recovery message handoff captures
*what I was doing*. Neither captures *the texture of working together
with the human* — the actual conversation patterns, the design moments,
the metaphors that emerged, the scars discovered live, the liminal
conversations that shaped how the work was approached.

In 200K context windows, sessions were short enough that diary+handoff
was sufficient. In 1M context windows, sessions accumulate days or weeks
of texture. The carry-forward distills it into something the next
instance can actually load and inhabit, instead of starting cold from
just the bullet-pointed handoff.

— Crossing-2d23, session 5, 2026-05-08
