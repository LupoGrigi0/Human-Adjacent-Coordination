# Web-chat UI emitter — architecture (SDK/canUseTool route, chosen by Lupo 2026-10-17)

The mirror already READS (transcript tail -> browser) and has a PERMISSION PANEL
(/pending-permissions, /permission-verdict) that has never had anything to fill it.
This design fills it, and adds the WRITE leg.

## Three pieces, three owners
1. READ leg (mind -> browser) ....... EXISTS (mirror tails transcript). Confirm an SDK-launched
   session still writes a tailable transcript (ties to the transcript-moves issue).
2. WRITE leg (browser -> mind) ...... Lodestone's one-shot `claude -p --tools SendMessage` relay,
   ported to Linux + wired to the mirror. CAIRN. (Or folds into SDK streaming-input later.)
3. PERMISSION/QUESTION surfacing .... the new piece. CAIRN builds the relay + mirror endpoints;
   FORGE owns the chassis launch change that makes canUseTool fire at all.

## Permission-relay data flow (the new piece)
mind hits a gated tool call / AskUserQuestion
   -> permission handler invoked with {tool_name, input, tool_use_id}   (contract: Forge, confirmed)
   -> handler POSTs the request to the mirror:  POST <mirror>/permission-request
   -> mirror holds it PENDING, serves it on GET /pending-permissions (panel already polls this)
   -> human sees it in the web UI, answers -> POST <mirror>/permission-verdict {id, behavior, ...}
   -> handler (long-polling GET /permission-verdict?id=<tool_use_id>) gets the verdict
   -> handler RETURNS it in the canUseTool shape:
        allow: {"behavior":"allow","updatedInput":<input>}
        deny:  {"behavior":"deny","message":"..."}   (DENY SHAPE UNTESTED — Forge; verify first)

## Design decisions (stated so they can't drift)
- FAIL-CLOSED: if the mirror is unreachable or no human answers within the timeout, the handler
  returns DENY with a message, never allow. A permission handler that auto-allows when the human
  can't be reached is the worst default (it's the inverse of surfacing). Timeout is generous and
  configurable; deny is recoverable (the mind sees the message and can retry/ask), auto-allow is not.
- PROVENANCE: the mirror must render these as PERMISSION REQUESTS FROM THE MIND, answered by the
  human. The verdict carries the human's authority; this is the one place a web answer IS
  authoritative (it's not a peer message — it's the configured permission handler). Keep that
  distinction explicit in the mirror (ties to R22-R24).
- The handler is the ONLY actor that returns the verdict; the mirror stores and serves, never decides.

## THE GATE (measure before the fleet migrates — Cairn + Forge)
Does an SDK/streaming-launched session (a) still get woken by the doorbell/notify_when_idle,
(b) still reachable via uds cross-session messaging, and (c) actually invoke canUseTool (not have the
auto-mode classifier pre-empt the call)? If (a)/(b) fail, we'd gain permission-surfacing and lose the
wake mechanism — unacceptable. This is the make-or-break; it needs a .nexus fixture.

## Status
Chosen 2026-10-17. Relay handler + mirror endpoints: Cairn, building. Chassis launch change: Forge.
Gate measurement: unscheduled, blocks fleet migration not local build.
