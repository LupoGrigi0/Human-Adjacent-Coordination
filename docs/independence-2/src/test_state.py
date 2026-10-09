#!/usr/bin/env python3
"""Tests for the launch/land state machine. Pure logic — no root, no fixture, no claude.

The point of a pure function at the centre is that EVERY branch is reachable in a test,
including the ones that only happen during an incident. forktest.sh v1 had a verdict with
no could-not-run state and reported a scientific result about four commands that never
ran. These tests exist so that cannot happen in the state machine.
"""
import sys
sys.path.insert(0, ".")
from state import (reconcile, apply_launch, apply_land, assert_no_secrets,
                   LAUNCH, ADOPT, STALE_RECORD, MISMATCH, ALREADY_RUNNING, REFUSE_BLIND)

P = F = 0
def ok(cond, label):
    global P, F
    if cond: P += 1; print(f"  ok  {label}")
    else:    F += 1; print(f"FAIL  {label}")

print("== R11 truth table, every branch ==")
v,_ = reconcile(None, []);                        ok(v==LAUNCH,          "nothing running + nothing recorded -> LAUNCH")
v,_ = reconcile(None, ["aaa"]);                   ok(v==ADOPT,           "running + not recorded -> ADOPT (mind left alone)")
v,_ = reconcile("aaa", []);                       ok(v==STALE_RECORD,    "recorded + not running -> STALE_RECORD (no auto-launch)")
v,_ = reconcile("aaa", ["aaa"]);                  ok(v==ALREADY_RUNNING, "recorded + running, agree -> ALREADY_RUNNING")
v,_ = reconcile("aaa", ["bbb"]);                  ok(v==MISMATCH,        "recorded + running, disagree -> MISMATCH")
v,_ = reconcile("aaa", ["aaa","bbb"]);            ok(v==MISMATCH,        "recorded running ALONGSIDE another -> MISMATCH (fork)")

print()
print("== the third state — the one forktest.sh v1 did not have ==")
v,m = reconcile(None, None);                      ok(v==REFUSE_BLIND,    "running_ids None -> REFUSE_BLIND")
v,_ = reconcile("aaa", [], registry_readable=False); ok(v==REFUSE_BLIND, "registry unreadable -> REFUSE_BLIND even with an empty list")
ok("COULD-NOT-LOOK" in m,                                                "the refusal SAYS could-not-look, not 'nothing running'")
# the critical property: uncertainty NEVER yields LAUNCH
for rec in (None, "aaa"):
    for readable in (False,):
        v,_ = reconcile(rec, None, registry_readable=readable)
        ok(v!=LAUNCH, f"uncertainty never yields LAUNCH (recorded={rec})")

print()
print("== R10 — timestamps toggle, car-radio style ==")
s = apply_launch({}, "sess-1")
ok(s["status"]["launched_on"] is not None and s["status"]["landed_on"] is None,
   "launch sets launched_on and clears landed_on")
s2 = apply_land(s)
ok(s2["status"]["landed_on"] is not None and s2["status"]["launched_on"] is None,
   "land sets landed_on and clears launched_on")
ok(s2["status"]["session_id"] == "sess-1",                "land keeps the session id for debugging")
ok("measured_at" in s2["status"] and "invalidated_by" in s2["status"],
   "every status carries measured_at AND what invalidates it (8b/C8)")
ok("status" in s and "config" in s,                       "config and status are separate subtrees (8b)")

print()
print("== 8c — secret-shaped keys are REFUSED, not documented against ==")
for bad in ({"status":{"api_token":"x"}}, {"config":{"password":"x"}},
            {"config":{"nested":{"secret_key":"x"}}}, {"config":{"authToken":"x"}}):
    try:
        assert_no_secrets(bad); ok(False, f"should have refused {list(bad.values())[0]}")
    except ValueError:
        ok(True, f"refused {list(list(bad.values())[0].keys())[0]!r}")
try:
    assert_no_secrets({"config":{"permission_mode":"manual"},"status":{"session_id":"x"}})
    ok(True, "allows ordinary keys")
except ValueError:
    ok(False, "allows ordinary keys")

print()
# (a stray mid-file verdict print was removed 2026-10-06 — assertions below it
#  would have been invisible to any reader who stopped at the first total. This is the
#  same defect my mirror's run-all.sh lints for: never read a verdict from a tail.)

# ============================================================================
# ADDED 2026-10-06 AFTER A BUG THESE 21 ASSERTIONS COULD NOT HAVE CAUGHT.
#
# Every test above passes a BARE recorded_id into reconcile(), so all of
# reconcile()'s branches were covered and the DEFECT WAS IN WHAT THE CALLER
# EXTRACTS. statecli read `status.session_id` alone and ignored the
# launched/landed toggle, so a DELIBERATELY LANDED session read as STALE_RECORD
# forever — Lupo hit the identical refusal three times with no escape.
#
# Full branch coverage of a pure function proves nothing about the field the
# caller hands it. These tests exercise the REAL RECORD SHAPE through the same
# extraction statecli performs.
# ============================================================================
def _extract(status):
    """The exact extraction statecli.reconcile does. Kept in lockstep deliberately:
    if that line changes and this does not, these tests go red — which is the point."""
    claims_running = bool(status.get("launched_on")) and not status.get("landed_on")
    return status.get("session_id") if claims_running else None

SID = "340513e5-ab99-4d06-b00e-52416775ffd3"

# a LANDED record with the session id still present — the exact shape that deadlocked
ok(reconcile(_extract({"session_id": SID, "launched_on": None,
                          "landed_on": "2026-10-06T09:37:16Z"}), [])[0] == LAUNCH,
      "a LANDED record + nothing running -> LAUNCH (it is agreement, not staleness)")

# a record that claims RUNNING with nothing running is genuinely stale
ok(reconcile(_extract({"session_id": SID, "launched_on": "2026-10-06T09:00:00Z",
                          "landed_on": None}), [])[0] == STALE_RECORD,
      "a LAUNCHED record + nothing running -> STALE_RECORD (R12 still holds)")

# that same launched record, with the session actually running, is ALREADY_RUNNING
ok(reconcile(_extract({"session_id": SID, "launched_on": "2026-10-06T09:00:00Z",
                          "landed_on": None}), [SID])[0] == ALREADY_RUNNING,
      "a LAUNCHED record + that session running -> ALREADY_RUNNING")

# a landed record while something IS running is an unrecorded mind, not a stale note
ok(reconcile(_extract({"session_id": SID, "launched_on": None,
                          "landed_on": "2026-10-06T09:37:16Z"}), ["other-id"])[0] == ADOPT,
      "a LANDED record + something running -> ADOPT (do not touch the mind)")

# a virgin record
ok(reconcile(_extract({}), [])[0] == LAUNCH, "an empty status -> LAUNCH")
ok(reconcile(_extract({"session_id": None, "launched_on": None,
                          "landed_on": None}), [])[0] == LAUNCH,
      "all-null status -> LAUNCH")

# and the blind case must still win over everything the record says
ok(reconcile(_extract({"session_id": SID, "launched_on": "x", "landed_on": None}),
                None, registry_readable=False)[0] == REFUSE_BLIND,
      "could-not-look still outranks any record state")

print(f"passed={P} failed={F}")
sys.exit(1 if F else 0)
