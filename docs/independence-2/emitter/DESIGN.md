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

## STATUS UPDATE 2026-10-18 — gate progressing, my half built + verified
GATE RESULTS (Forge, on Den/Blackwolf, 2.1.283 — .nexus re-run still owed):
- G6 auth: PASS. Runs on the mind's login, NOT an API key. Host MUST scrub ANTHROPIC_*/CLAUDE_CODE_*.
- G1 fork: PASS incl. the load-bearing --bg-born case. While --bg holds it, streaming resume REFUSES
  (no fork). After `claude stop`: clean resume, same id, recalls nonce. Migration REVERSIBLE per mind.
- SDK host v0 EXISTS: BlackWolf-Forge d2d96a4 scripts/sdk_gate/mind_host.py. runuser as the mind's user,
  scrubs env, requires full uuid + recorded cwd, refuses while --bg holds (unless --land-bg), launches
  `claude -p --input-format stream-json --output-format stream-json --verbose --resume <id>`, stops if
  init's session id differs, injects turns via a 0600 unix socket. My relay plugs in as
  --permission-prompt-tool + --mcp-config. E2E passed on fixture 6f47.
- Still owed: G2 (idle lifetime), G3 (sockets), G4 (--permission-prompt-tool under stream-json = MY SEAM),
  G7 (doorbell->inject), G8 (deny shape).

MY HALF BUILT + VERIFIED (claude-session-mirror, branch cairn/emitter-permissions, f434438):
the direct relay<->mirror permission path (POST /permission-request, GET /permission-verdict?id=,
POST /permission records direct verdict). Loopback round-trip GREEN. permission-relay.py updated to match.

THREE TRAPS for the .nexus coexistence checker (Forge, measured — bake these in):
1. `claude agents` without a TTY prints only a refusal; text-grep reads "not running" FOREVER.
   Use --json; unparseable == UNKNOWN, never "nothing". (This is Cairn's own WakeTest-8bc1 ghost.)
2. `claude --bg --resume <id>` on a session already running under --bg exits 0 and SILENTLY starts a
   COPY ("started a copy as ..."). A fork with a green exit. Check agents --json BEFORE any resume.
3. A HOSTED session shows in agents --json as kind "interactive" with NO job id. A kind-filtered
   land/checker skips it and reports a live mind as "nothing running". Treat interactive-with-no-job
   as a candidate hosted mind, not absence.

## GATE G4/G8/G2 — PASS on Den (Forge, 2026-10-18, 841ca7b). Relay requirements fixed.
Measured through Forge's host (stream-json, --permission-mode default, her probe as prompt tool):
- SEAM (G4): --permission-prompt-tool ROUTES under stream-json. The join between host and relay holds.
- SUBAGENT prompts route to the SAME prompt tool (G4c). Bastion's case — the reason for the SDK route —
  is solvable, not structural. MEASURED.
- G8 deny: {"behavior":"deny","message":"..."} -> action blocked, model quotes the message verbatim. My
  relay's deny return is correct.
- G2 (half): a HOSTED session with no keepalive answered an injected turn after 76 min idle (past the
  61-min --bg reaper). Hosted minds don't get reaped like --bg. (~8h token-refresh half still running.)

RELAY REQUIREMENT this fixes (would have shipped wrong):
AskUserQuestion ROUTES to the prompt tool with the full questions structure — BUT a bare allow (input
unchanged) makes the model see "the user did not answer the questions." The working shape is:
    {"behavior":"allow","updatedInput": {...input, "answers": {"<question text>":"<chosen label>"}}}
=> AskUserQuestion needs a CHOICE path, distinct from allow/deny:
   - relay detects tool_name==="AskUserQuestion", surfaces input.questions[] (question/header/options/multiSelect)
   - the mirror panel RENDERS the question + its options as selectable, not just Allow/Deny
   - the verdict carries the chosen label(s); the relay merges them into updatedInput.answers and returns allow
   The allow/deny path (Bastion's core approvals) is DONE + verified; this choice path is the next build.

Host now keeps state per-session (/run/user/<uid>/mind-host/<first8ofid>/) + --permission-mode.
probe: BlackWolf-Forge scripts/sdk_gate/g4_probe_mcp.py.
