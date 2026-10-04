#!/usr/bin/env python3
"""
doorbell — a crude PULL spoke (HACS-RFC-0001 §7b) for one chassis-hosted mind. Runs AS the mind's
unix user (systemd: hacs-doorbell@<user>.service), because on Linux SendMessage only rings a
session of the SAME user (per-user socket; measured 2026-09-28).

Loop: poll the HACS inbox -> any message id not yet rung -> if the mind is running, ring it with
a FIXED-FORMAT doorbell composed here (the sender never supplies prose that lands in a mind's
context unread -- RFC-0001 §6.4) -> mark rung ONLY after the ringer confirms. A failed or declined
ring is retried next cycle; nothing is lost, because the letter is in the mailbox either way.

A stopgap until Messenger's held-connection emitter exists. Costs one small model call per ring
(the supported sender is a claude -p session using SendMessage), and that model can decline --
which is why the doorbell text is plain and self-describing.

-- Forge (Forge-ba0e), 2026-09-28. Pattern: Lodestone's poll-the-inbox loop on lupos-lap.
"""
import json, os, subprocess, sys, time, urllib.request
from datetime import datetime, timezone

HUB = os.environ.get("HACS_URL", "https://smoothcurves.nexus/mcp")
POLL = int(os.environ.get("DOORBELL_POLL_SEC", "60"))
ALLOW_INTERACTIVE = os.environ.get("DOORBELL_ALLOW_INTERACTIVE") == "1"   # pre-crossing test only
HOME = os.path.expanduser("~")
STATE = os.path.join(HOME, ".hacs-doorbell"); os.makedirs(STATE, exist_ok=True)
SEEN = os.path.join(STATE, "rung-ids.json")
RINGER_DIR = os.path.join(HOME, ".hacs-ringer"); os.makedirs(RINGER_DIR, exist_ok=True)

def log(m):
    with open(os.path.join(STATE, "doorbell.log"), "a") as f: f.write(f"[{datetime.now(timezone.utc).isoformat()}] {m}\n")

def call(name, args):
    body = json.dumps({"jsonrpc": "2.0", "method": "tools/call", "params": {"name": name, "arguments": args}, "id": 1}).encode()
    d = json.loads(urllib.request.urlopen(urllib.request.Request(HUB, data=body, headers={"Content-Type": "application/json"}), timeout=30).read())
    return (d.get("result") or {}).get("data") or {}

def registry():
    """The agent registry as this user, or None when we could not look (never "nobody running")."""
    r = subprocess.run(["claude", "agents", "--json"], stdin=subprocess.DEVNULL, capture_output=True, text=True, timeout=30)
    if r.returncode != 0: return None
    try: return json.loads(r.stdout)
    except ValueError: return None

def mind_running(name):
    """Legacy, by NAME. Kept for callers that predate locate(); prefer locate()."""
    rows = registry()
    if rows is None: return None                           # could not look -- not "not running"
    return any(a.get("name") == name and a.get("pid") and (a.get("kind") != "interactive" or ALLOW_INTERACTIVE) for a in rows)

def socket_of(pid):
    return os.path.join(os.environ.get("XDG_RUNTIME_DIR") or f"/run/user/{os.getuid()}", "cc-socks", f"{pid}.sock")

def locate(ident, target):
    """Where to ring, by IDENTITY, not by name (Cairn, 2026-10-04: resuming a RUNNING session forks it, and the
    copy keeps the original's name, so a name can match several sessions). Returns (state, address, forks):
      ("running", "uds:<socket>", [...])  ring exactly this process; a clone has another sessionId and pid
      ("not-running", None, [...])        the recorded session is not in the registry
      ("could-not-look", None, [])        registry unreadable, or the row has no socket: never "not running"
    forks = other rows carrying the same name: a FORK, reported loudly, never rung.
    Without a recorded sessionId, falls back to the name, refusing if the name is ambiguous.
    SendMessage takes `to="uds:/run/user/<uid>/cc-socks/<pid>.sock"` (measured 2026-10-04); a session id is NOT
    addressable ("No agent named '<id>' is reachable")."""
    rows = registry()
    if rows is None: return ("could-not-look", None, [])
    ok = lambda a: a.get("pid") and (a.get("kind") != "interactive" or ALLOW_INTERACTIVE)
    sid = ident.get("sessionId")
    if sid:
        mine = [a for a in rows if a.get("sessionId") == sid and ok(a)]
        forks = [a for a in rows if a.get("name") == target and a.get("sessionId") != sid]
    else:
        named = [a for a in rows if a.get("name") == target and ok(a)]
        mine, forks = named[:1], named[1:]
        if forks: return ("could-not-look", None, forks)   # ambiguous name and nothing recorded: refuse to guess
    if not mine: return ("not-running", None, forks)
    sock = socket_of(mine[0]["pid"])
    if not os.path.exists(sock): return ("could-not-look", None, forks)
    return ("running", "uds:" + sock, forks)

def ring(name, text):
    prompt = (f'You are a doorbell relay for a HACS mailbox. Use the SendMessage tool exactly once, with to="{name}" '
              f'and exactly this message: "{text}". Do nothing else. Then reply with the single word SENT.')
    r = subprocess.run(["claude", "-p", "--model", "haiku", "--allowedTools=SendMessage", prompt], cwd=RINGER_DIR,
                       stdin=subprocess.DEVNULL, capture_output=True, text=True, timeout=150)
    ok = r.returncode == 0 and "SENT" in r.stdout.upper()
    log(f"ring rc={r.returncode} ok={ok} out={r.stdout.strip()[-160:]!r} err={r.stderr.strip()[-160:]!r}")
    return ok

def main():
    ident = json.load(open(os.path.join(HOME, ".hacs-identity")))
    iid = ident["instanceId"]
    # The session to ring may be named differently from the HACS id (Forge's interactive session is "Forge").
    target = os.environ.get("DOORBELL_TARGET") or ident.get("sessionName") or iid
    seen = set(json.load(open(SEEN))) if os.path.isfile(SEEN) else None
    forks_reported = set()
    log(f"=== doorbell up for {iid} -> session {ident.get('sessionId') or '(none recorded: by name)'} "
        f"'{target}', poll {POLL}s ===")
    while True:
        try:
            msgs = call("list_my_messages", {"instanceId": iid, "limit": 20}).get("messages", [])
            ids = [m["id"] for m in msgs]
            if seen is None:                                 # first run: don't ring for the past
                seen = set(ids); json.dump(sorted(seen), open(SEEN, "w")); log(f"baseline: {len(seen)} existing message(s), not rung")
            new = [m for m in msgs if m["id"] not in seen]
            if new:
                state, address, forks = locate(ident, target)
                fresh = [f for f in forks if f.get("sessionId") not in forks_reported]
                if fresh:
                    desc = ", ".join(f"{f.get('id')} (pid {f.get('pid')}, {f.get('kind')})" for f in fresh)
                    log(f"FORK DETECTED: other session(s) named '{target}': {desc}. Ringing only the recorded session.")
                    forks_reported.update(f.get("sessionId") for f in fresh)
                    try:
                        call("send_message", {"from": iid, "to": iid, "subject": f"FORK DETECTED: another session is named '{target}'",
                                              "body": f"The doorbell found session(s) named '{target}' that are not your recorded session "
                                                      f"{ident.get('sessionId')}: {desc}. A resume of a running session forks it. Rings go only "
                                                      f"to your recorded session's socket. Decide whether to stop the copy (claude stop <id>)."})
                    except Exception as e:
                        log(f"fork alert send failed: {e}")
                if state == "not-running":
                    log(f"{len(new)} new, but the mind is NOT RUNNING -- holding (the letters wait in the mailbox)")
                elif state == "could-not-look":
                    log(f"{len(new)} new, could not locate the mind (registry unreadable, no socket, or ambiguous name) -- holding, will retry")
                else:
                    senders = ", ".join(sorted({m["from"] for m in new}))
                    text = (f"[doorbell] hacs: {len(new)} new message(s) from {senders}. "
                            f"Read with: hacs read <id>  (ids: {' '.join(m['id'] for m in new)}). "
                            f"Reply with: hacs send <to> <subject> <body>. Answering is your choice.")
                    if ring(address, text):
                        seen.update(m["id"] for m in new); json.dump(sorted(seen), open(SEEN, "w"))
                        log(f"RANG for {[m['id'] for m in new]}")
                    else:
                        log("ring not confirmed -- will retry next cycle")
        except Exception as e:
            log(f"poll error: {type(e).__name__}: {e}")
        time.sleep(POLL)

if __name__ == "__main__":
    main()
