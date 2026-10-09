#!/usr/bin/env python3
"""Thin CLI over state.py so shell scripts do I/O and state.py decides.

    statecli.py reconcile <prefs.json> <agents.json|->   -> verdict on stdout, exit code
    statecli.py launched  <prefs.json> <session_id>      -> writes status, R10 toggle
    statecli.py landed    <prefs.json>                   -> writes status, R10 toggle

Exit codes are the contract, because the shell branches on them:
    0 LAUNCH           go
    10 ALREADY_RUNNING  refuse, politely
    11 ADOPT            a session runs unrecorded. CALLER must record it; mind left alone
    12 STALE_RECORD     the record names a dead session. CALLER must clear it via `landed`
    13 MISMATCH         record and reality disagree. A HUMAN decides; touch nothing

    ⚠ CORRECTED 2026-10-06: these three lines used to read "record fixed" / "record
    cleared", which was FALSE — `reconcile` is a PURE READ and writes nothing. The same
    false claim sat in state.py's own message text and in launch.sh's silence, so a stale
    record deadlocked every run forever while three documents said it had been cleared.
    An exit code describes a VERDICT. It never describes an action the caller has not
    taken yet.
    20 REFUSE_BLIND     could not look. refuse.
    2  usage/IO error
"""
import json, sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from state import (reconcile, apply_launch, apply_land, assert_no_secrets,
                   LAUNCH, ADOPT, STALE_RECORD, MISMATCH, ALREADY_RUNNING, REFUSE_BLIND)

CODES = {LAUNCH: 0, ALREADY_RUNNING: 10, ADOPT: 11,
         STALE_RECORD: 12, MISMATCH: 13, REFUSE_BLIND: 20}


def load_prefs(path):
    if not os.path.exists(path):
        return {}
    with open(path) as f:
        return json.load(f)


def save_prefs(path, data):
    assert_no_secrets(data.get("independence", {}))
    tmp = path + ".tmp"
    with open(tmp, "w") as f:
        json.dump(data, f, indent=2)
    os.replace(tmp, path)


def main(argv):
    if len(argv) < 3:
        print(__doc__, file=sys.stderr); return 2
    cmd, prefs_path = argv[1], argv[2]

    if cmd == "reconcile":
        src = argv[3] if len(argv) > 3 else "-"
        # UNREADABLE AGENTS OUTPUT IS NOT AN EMPTY LIST. This is the whole point.
        try:
            raw = sys.stdin.read() if src == "-" else open(src).read()
            rows = json.loads(raw)
            running = [r.get("sessionId") or r.get("id") for r in rows]
            running = [x for x in running if x]
            readable = True
        except Exception as e:
            running, readable = None, False
            print(f"  (agents output unreadable: {e})", file=sys.stderr)
        try:
            prefs = load_prefs(prefs_path)
        except Exception as e:
            print(f"REFUSING: preferences.json unparsable: {e}", file=sys.stderr); return 2
        # ⚠ BUG FIXED 2026-10-06 — this line read `session_id` alone and ignored the
        # launched/landed toggle, so a DELIBERATELY LANDED session read as a STALE
        # RECORD forever. Lupo hit the identical refusal three times in a row with no
        # escape but hand-editing the file.
        #
        # `apply_land` is the car-radio toggle (R10): it sets `landed_on`, clears
        # `launched_on`, and KEEPS `session_id` on purpose — so you can still see WHICH
        # session landed. It was never a "clear", and launch.sh calling it as one was my
        # second mistake on top of this first one.
        #
        # THE SEMANTIC THAT WAS MISSING: "nothing is running" is only STALE if the record
        # CLAIMS the session is running. If the record says it landed, then nothing
        # running is AGREEMENT, and the verdict is LAUNCH.
        #
        # state.py stays a pure function over (recorded_id, running_ids). The defect was
        # here, in what the caller EXTRACTS — which is why 21 green assertions over every
        # branch of reconcile() never saw it: they all passed a bare recorded_id and never
        # the real record shape.
        _st = ((prefs.get("independence") or {}).get("status") or {})
        _claims_running = bool(_st.get("launched_on")) and not _st.get("landed_on")
        rec = _st.get("session_id") if _claims_running else None
        verdict, why = reconcile(rec, running, registry_readable=readable)
        print(f"{verdict}: {why}")
        return CODES[verdict]

    if cmd in ("launched", "landed"):
        try:
            prefs = load_prefs(prefs_path)
        except Exception as e:
            print(f"REFUSING: preferences.json unparsable: {e}", file=sys.stderr); return 2
        sec = prefs.get("independence") or {}
        if cmd == "launched":
            if len(argv) < 4:
                print("launched needs a session id", file=sys.stderr); return 2
            sec = apply_launch(sec, argv[3])
        else:
            sec = apply_land(sec)
        prefs["independence"] = sec
        try:
            save_prefs(prefs_path, prefs)
        except ValueError as e:          # 8c guard
            print(f"REFUSING: {e}", file=sys.stderr); return 2
        print(json.dumps(sec["status"], indent=2))
        return 0

    print(__doc__, file=sys.stderr); return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv))
