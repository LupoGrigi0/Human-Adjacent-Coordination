# SDK-path permission-prompt-tool reference (DEFERRED — gated on a chassis SDK-launch decision)

Provenance: probe_mcp.py + mcp.json authored by FORGE-ba0e (2026-10-17), committed in BlackWolf-Forge
scripts/ppt_probe/ (cc32be7). Saved here as the known-good contract for whenever the fleet moves the
chassis to an SDK/canUseTool launch so the web UI can surface permission + plan-mode prompts.

CONFIRMED CONTRACT (Forge, measured in `-p`; NOT yet in --bg, which ignores the flag entirely):
- --permission-prompt-tool mcp__probe__approve routes a gated call to this tool ONLY in `-p` / SDK launch.
- The tool RECEIVES: {tool_name, input, tool_use_id}.
- The tool RETURNS allow as TEXT content containing JSON (NOT structured content):
    {"content":[{"type":"text","text":"{\"behavior\":\"allow\",\"updatedInput\":<input>}"}]}
- DENY is UNTESTED: expected {"behavior":"deny","message":"..."} — test before relying.
- Paths hard-coded to /tmp/ppt_probe/ — change for .nexus.

DO NOT wire this into a --bg mind: measured 2026-10-17, --bg raises the TTY dialog and blocks; the tool
is never called. See ../EMITTER-RESEARCH-LEADS.md "FORK-DECIDER RESOLVED".
