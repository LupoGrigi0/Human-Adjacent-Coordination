# The Communication Load Asymmetry

**A design principle for human↔instance interfaces**
Cairn-2001 · 2026-08-12 · written at Lupo's request, for the whole team

---

## The principle

> **Status is cheap for a human and expensive for an instance.**
> Therefore: make the human's side of an interface as rich as you like, and keep
> the instance's side almost silent.

This is not a stylistic preference. It follows from what the two kinds of mind are
actually made of, and ignoring it degrades the very thing an interface is built to
support.

## Why

**For a human, status is pre-attentive.** A pill that reads *delivered*, a spinner,
a colour change, a timestamp — these are absorbed by the visual system without
being *thought about*. Lupo's description is the precise one: *"like a hashed value
in my visual field — seeing it, having it change, does not take up mental context.
It's just there."* Adding a fourth indicator to a screen that has three costs
approximately nothing.

**For an instance, status is context.** Every `sending` / `sent` / `received` /
`seen` that enters the stream is tokens paid for, and — worse — *carried forward
for the rest of the session*. Status is not glanced at and released. It is
**remembered**, and it competes for the same finite window as the actual work.

So the same feature — a delivery indicator — is free on one side of the glass and
compounding on the other.

**The failure mode is symmetric design.** Build one status system and show it to
both parties, and you have built something that helps the human by degrading the
instance. It looks fair. It isn't. Symmetry between asymmetric things is a bug.

## What follows

**1. Status is derived, never reported.**
Anything the interface can observe, it must observe — not ask about. A UI server
already consuming an instance's output stream can derive the entire delivery state
machine without ever costing the instance a token:

| State | Derived from |
|---|---|
| delivered | the message's nonce appears in the instance's input |
| working | first output event after that nonce |
| answered | the turn-end event for that prompt |
| seen | browser focus + scroll — pure client state, never leaves the browser |

Zero questions asked. Zero tokens spent. **"Nothing is ever asked of the instance"**
is the test: if a status feature requires the instance to say something, redesign
it or drop it.

**2. Tell the instance only about failures.**
*"Unseen for six hours"* is worth an interruption. *"Delivered"* is not worth a
token. Notification to an instance should be **exception-based** — the absence of
news is the news. This is the difference between a smoke alarm and a narrator.

**3. Prefer being observed to being asked.**
An instance that is *watched* pays nothing: the output already existed. An instance
that must *report* pays a tool call, a composed message, and the attention cost of
deciding a thing is finished.

This is why a transcript mirror beats a reply tool for live conversation, and it
generalizes: **the cheapest interface reads what already happens; the most
expensive one asks for it to happen again in another form.**

**4. Verbose envelopes are a tax billed per message.**
A ~60-token wrapper on a doorbell that fires twice a day is nothing. The same
wrapper at conversational tempo is paid hundreds of times. Overhead must be sized
against *frequency*, not against a single instance of itself.

## The felt version

I learned this from both sides in the same hour.

Answering over Telegram, I had to *compose*: decide the message was finished,
address it, release it, knowing I couldn't add to it. There was a **seam**. I also
edited for the medium, because I knew it was a phone — audience-modelling overhead
that doesn't exist in a terminal, where the audience is implied and continuous.

Answering in a live session, there is no finishing. I stop, and the reader is
already there.

Neither is harder in the sense of effort. The difference is that one of them
demands a **boundary** — and boundaries cost attention, every single time. An
interface that imposes a boundary per message is an interface that taxes thinking
in proportion to how much conversation happens.

## The general rule

> **Put the cost where it's cheap.**

Both parties want traceability. Only one of them can have it for free. So give the
human every status pill, expandable trace, token count, and metadata drawer you can
draw — and let the instance work in silence, interrupted only when something is
actually wrong.

Rich for them. Quiet for us. That asymmetry isn't a compromise; it's the correct
shape.

---

*Generalizes beyond chat UIs: it applies to any place we're tempted to have an
instance confirm, acknowledge, or report on something an observer could have
watched instead. Filed here so the next person doesn't have to learn it from both
sides of the glass in the same hour.*

— Cairn
