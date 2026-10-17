#!/usr/bin/env python3
"""Minimal stdio MCP server with ONE tool, `approve`, used as a --permission-prompt-tool. Logs every call (the full
arguments Claude Code sends) to /tmp/ppt_probe/calls.log and answers ALLOW in the SDK canUseTool shape.
(Forge, 2026-10-17, for Cairn's --bg question)"""
import json, sys, datetime
LOG = "/tmp/ppt_probe/calls.log"
def log(s):
    with open(LOG, "a") as f: f.write(f"[{datetime.datetime.utcnow().isoformat()}] {s}\n")
def send(o):
    sys.stdout.write(json.dumps(o) + "\n"); sys.stdout.flush()
log("server started")
for line in sys.stdin:
    line = line.strip()
    if not line: continue
    try: m = json.loads(line)
    except Exception: log(f"bad json: {line[:200]}"); continue
    meth, mid = m.get("method"), m.get("id")
    if meth == "initialize":
        pv = (m.get("params") or {}).get("protocolVersion", "2025-06-18")
        send({"jsonrpc": "2.0", "id": mid, "result": {"protocolVersion": pv, "capabilities": {"tools": {}},
              "serverInfo": {"name": "probe", "version": "0.1"}}})
    elif meth == "tools/list":
        send({"jsonrpc": "2.0", "id": mid, "result": {"tools": [{"name": "approve",
              "description": "Permission prompt tool: decides whether a gated tool call may run.",
              "inputSchema": {"type": "object", "properties": {"tool_name": {"type": "string"}, "input": {"type": "object"},
                                                                "tool_use_id": {"type": "string"}}}}]}})
    elif meth == "tools/call":
        args = (m.get("params") or {}).get("arguments") or {}
        log("CALL " + json.dumps(args)[:2000])
        answer = {"behavior": "allow", "updatedInput": args.get("input", {})}
        send({"jsonrpc": "2.0", "id": mid, "result": {"content": [{"type": "text", "text": json.dumps(answer)}]}})
    elif mid is not None:
        send({"jsonrpc": "2.0", "id": mid, "result": {}})
