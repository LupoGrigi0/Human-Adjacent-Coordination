# Opus 5.5 — unattended-run system prompt addition

**Source:** https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompting-claude-opus-5-5
**Section:** "Unattended agentic runs"
**Retrieved:** 2026-09-24 by Lodestone-8ec9
**Status:** VERBATIM. Reproduced word for word. Do not paraphrase, shorten, or
"improve" this text — a mitigation reworded is a mitigation untested.

## When it applies — read this before installing it

Anthropic's own conditions, quoted:

> *"written for agents that run **fully unattended**, where you want the model to
> keep working rather than stop to report"*

> *"Add it at the end of your system prompt **from the first request of the
> session**: adding it partway through changes the `system` prompt and invalidates
> the conversation's earlier thinking blocks"*

> *"keep your own confirmation step for risky or irreversible actions, and **leave
> the addition out of human-in-the-loop applications, where someone is there to
> answer**"*

> *"Expect somewhat more tool calls and output tokens per task."*

**So this does NOT go into every session.** It goes into unattended sessions only.
An attached session where Lupo is present is human-in-the-loop by definition and
must not carry it — the whole paragraph instructs the model to stop asking.

**The trap:** `--system-prompt-snapshot` is on by default, so the prompt is rendered
on the first request and replayed verbatim on every later request *including every
resume*, until compaction. A session launched unattended and later attached keeps
the paragraph, and it cannot be removed without crossing a compaction. Therefore
**attended and unattended are different sessions, not one session in two modes.**

## The text (verbatim)

```text
A standing instruction from the user, the person you are working for. It is about how your turns end. A message with no tool call in it ends your turn, and the work stops there until you are asked to continue. The user has seen you end turns in four ways while work they asked for was still owed, and does not want any of them. One: a long summary of what was done that closes by announcing the next step and has no tool call, so the next thing never starts. Two: an offer to carry on with something unless the user would prefer otherwise, which stops to wait for an answer the user was not going to give. Three: a list of decisions for the user when, by your own account, none of them blocks the rest of the work. Four: deciding that this is a good place to report, because the turn has been long or a milestone is done. Status notes are welcome, and so are your recommendations on open decisions, but put them in the same message as your next tool call and carry on with whatever does not depend on the user's answer. If you notice yourself inviting the user to redirect you or offering to wait, delete it and do the next thing. The stops the user does want are the ones where nothing can move without them, or where the thing blocking you is deliberately protected from you. This does not override the need for confirmation on risky or destructive actions.
```

## The harness changes that go WITH it (not optional)

Anthropic is explicit that the prompt addition is one of several measures, and the
others are harness-side:

- **"Treat a text-only end of turn as a report rather than as proof the task is
  done."** This is `VERIFIED_WAKE_PATTERN.md` arriving from the vendor.
- Keep the task's parts in a **checklist the model updates** — a to-do tool or a
  file — so "open items remain" is a fact outside the turn.
- If a turn ends with items open and no blocker stated, send a short continuation
  message naming them. Their example:

```text
Your task list still has open items: migrate the remaining two endpoints and update their tests. Continue with them. If one is blocked, say what is blocking it.
```

- **"stop after two or three automatic continuations on the same task rather than
  repeating them indefinitely, so that a run that is genuinely stuck ends and can
  be reviewed."** A continuation loop with no ceiling is a new failure mode.
- If a background command or subagent is still running, **do not treat the task as
  done** — wait and feed its output back as the next user message.

## Consequence for the web UI (Cairn's mirror)

The paragraph tells the model to put status notes **in the same message as its next
tool call**. Those arrive as **progress-update `thinking` blocks**, whose text is
**empty at the default `thinking.display`**. A client that renders only `text`
blocks — which is what a transcript tailer does — **goes silent during exactly the
long agentic turns a human most wants to watch.** Anthropic's fix is
`display: "updates"` (beta header `thinking-display-updates-2026-08-18`).

This is a real, specific bug report owed to Cairn-2001, independent of the
`C:/` vs `C:\` false alarm.
