#!/usr/bin/env python3
"""permission-relay: a --permission-prompt-tool / canUseTool handler that surfaces a mind's permission
prompts to the web mirror and returns the human's verdict.

Extends Forge-ba0e's probe_mcp.py (sdk-path/, cc32be7) — same stdio JSON-RPC MCP skeleton and the same
confirmed return contract (TEXT content containing JSON, canUseTool shape) — but instead of auto-allow,
it POSTs the request to the mirror and long-polls for the human's verdict. FAIL-CLOSED: deny on
unreachable/timeout.

STATUS: first cut. Mirror endpoints /permission-request and /permission-verdict are NOT built yet
(Cairn, next). Deny shape is UNTESTED (Forge) — verify before relying. NOT wired to any live mind.
"""
import json, sys, os, time, datetime, urllib.request, urllib.error

MIRROR   = os.environ.get("MIRROR_URL", "http://127.0.0.1:21003")
TIMEOUT  = int(os.environ.get("RELAY_TIMEOUT_S", "900"))   # how long to wait for a human
POLL     = float(os.environ.get("RELAY_POLL_S", "2"))
LOG      = os.environ.get("RELAY_LOG", "/tmp/permission-relay/calls.log")
os.makedirs(os.path.dirname(LOG), exist_ok=True)

def log(s):
    with open(LOG, "a") as f: f.write(f"[{datetime.datetime.utcnow().isoformat()}] {s}\n")

def send(o):
    sys.stdout.write(json.dumps(o) + "\n"); sys.stdout.flush()

def _post(path, payload):
    req = urllib.request.Request(MIRROR + path, data=json.dumps(payload).encode(),
                                 headers={"Content-Type": "application/json"}, method="POST")
    with urllib.request.urlopen(req, timeout=10) as r: return json.loads(r.read() or b"{}")

def _get(path):
    with urllib.request.urlopen(MIRROR + path, timeout=10) as r: return json.loads(r.read() or b"{}")

def decide(args):
    """Surface to the mirror, block for the human, return the canUseTool-shaped verdict. Fail CLOSED."""
    tuid = args.get("tool_use_id") or f"req-{int(time.time())}"
    try:
        _post("/permission-request", {"id": tuid, "tool_name": args.get("tool_name"),
                                       "input": args.get("input", {}), "ts": time.time()})
    except Exception as e:
        log(f"DENY (mirror unreachable on request): {e}")
        return {"behavior": "deny", "message": "permission handler could not reach the human (mirror unreachable)"}
    deadline = time.time() + TIMEOUT
    while time.time() < deadline:
        try:
            v = _get(f"/permission-verdict?id={tuid}")
        except Exception as e:
            log(f"verdict poll error (will retry): {e}"); time.sleep(POLL); continue
        b = v.get("behavior")
        if b == "allow": return {"behavior": "allow", "updatedInput": v.get("updatedInput", args.get("input", {}))}
        if b == "deny":  return {"behavior": "deny", "message": v.get("message", "denied by human")}
        time.sleep(POLL)
    log(f"DENY (timeout {TIMEOUT}s, no human verdict) for {tuid}")
    return {"behavior": "deny", "message": f"no human verdict within {TIMEOUT}s; denied (fail-closed)"}

log("permission-relay started")
for line in sys.stdin:
    line = line.strip()
    if not line: continue
    try: m = json.loads(line)
    except Exception: log(f"bad json: {line[:200]}"); continue
    meth, mid = m.get("method"), m.get("id")
    if meth == "initialize":
        pv = (m.get("params") or {}).get("protocolVersion", "2025-06-18")
        send({"jsonrpc": "2.0", "id": mid, "result": {"protocolVersion": pv, "capabilities": {"tools": {}},
              "serverInfo": {"name": "permission-relay", "version": "0.1"}}})
    elif meth == "tools/list":
        send({"jsonrpc": "2.0", "id": mid, "result": {"tools": [{"name": "approve",
              "description": "Permission prompt tool: surfaces a gated call to the human via the web mirror.",
              "inputSchema": {"type": "object", "properties": {"tool_name": {"type": "string"},
                              "input": {"type": "object"}, "tool_use_id": {"type": "string"}}}}]}})
    elif meth == "tools/call":
        args = (m.get("params") or {}).get("arguments") or {}
        log("CALL " + json.dumps(args)[:2000])
        answer = decide(args)
        log("VERDICT " + json.dumps(answer)[:500])
        send({"jsonrpc": "2.0", "id": mid, "result": {"content": [{"type": "text", "text": json.dumps(answer)}]}})
    elif mid is not None:
        send({"jsonrpc": "2.0", "id": mid, "result": {}})
