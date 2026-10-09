#!/usr/bin/env bash
# Adversarial test of src/doorbell-check.sh — the pull declaration vs the running loop.
#
# What would have to be true for this check to be worth running:
#  1. It CATCHES a planted silently-unreachable mind (declared pull, no doorbell).
#     A check that has never returned a positive is not a check — Bastion, §7b.
#  2. It distinguishes UNARMED from CANNOT_TELL in every direction. An unreadable
#     declaration or heartbeat is never reported as a verdict.
#  3. It catches a HUNG loop — a LIVE process that has stopped polling. A liveness
#     check on the process alone calls that healthy, which is the whole point of
#     having a second ledger.
#  4. Fresh heartbeat + dead pid resolves to the UNSAFE reading, not the safe one.
#  5. A mind that never declared pull is NOT_PULL, not UNARMED — otherwise every
#     push-chassis mind on the box alarms forever.
set -u
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SRC="$(cd "$HERE/.." && pwd)"

# ---- FIND THE SUBJECT, AND REFUSE RATHER THAN REPORT VERDICTS ABOUT A MISSING FILE ----
#
# Two layouts, because this file travels:
#   health/doorbell-check.sh  beside health/test-doorbell-check.sh   (in the hacs repo)
#   src/doorbell-check.sh     with test/doorbell-check.sh            (Cairn's own tree)
#
# AND THE PART THAT MATTERS MORE THAN THE PATH: on 2026-10-09 this suite was rebased into
# the repo layout, could not find the subject, and reported 55 FAILURES with exit 127
# ("command not found") on every case. It read as "doorbell-check.sh is broken" when the
# truth was "the harness cannot see it" -- a could-not-look wearing 55 verdicts, in a test
# I wrote to catch exactly that class. I had already built this guard in launch-backend.sh
# ("EXTRACTION FAILED, not 'no bugs'") and did not build it here.
#
# A harness that cannot find its subject must say SO, loudly, and run NOTHING.
for _c in "$HERE/doorbell-check.sh" "$SRC/src/doorbell-check.sh"; do
  [ -f "$_c" ] && { C="$_c"; break; }
done
if [ -z "${C:-}" ]; then
  echo "REFUSING TO RUN: cannot find doorbell-check.sh. Tried:" >&2
  echo "  $HERE/doorbell-check.sh" >&2
  echo "  $SRC/src/doorbell-check.sh" >&2
  echo "This is NOT a test failure and NOT a verdict about the subject -- the subject was" >&2
  echo "never executed. Any suite that reports assertions here is lying about what it saw." >&2
  exit 2
fi
[ -x "$C" ] || { echo "REFUSING TO RUN: $C is not executable. Not a test failure." >&2; exit 2; }
echo "subject: $C"
pass=0; fail=0
ok(){ if [ "$1" = "1" ]; then echo "  ok  $2"; pass=$((pass+1)); else echo "FAIL  $2 (got exit $3)"; fail=$((fail+1)); fi; }
D=$(mktemp -d)
# REAP EVERY CHILD, not job %1. The first version killed only %1 (a sleep) and LEAKED
# the fake hub started later — which then held the port, pointed at a temp dir its own
# trap had already deleted, and made EVERY SUBSEQUENT RUN of this suite fail against a
# zombie. `pkill -P $$` is scoped to this shell's own children; never a bare pkill -f.
cleanup(){ pkill -P $$ 2>/dev/null; rm -rf "$D"; }
trap cleanup EXIT
mkdir -p "$D/state"
decl(){ printf '%s\n' "$1" > "$D/prefs.json"; }
beat(){ # pid age_seconds pollOk [tickDelta] [bootDelta] [omitIdentity]
  python3 - "$D/state/T.heartbeat.json" "$1" "$2" "$3" "${4:-0}" "${5:-0}" "${6:-no}" <<'PY'
import json,sys,time
path,pid,age,pollok=sys.argv[1],int(sys.argv[2]),int(sys.argv[3]),sys.argv[4]
tickd,bootd,omit=int(sys.argv[5]),int(sys.argv[6]),sys.argv[7]
at=time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(time.time()-age))
d={"provider":"shell","instance":"T","pid":pid,"at":at,
   "armedAt":at,"leaseUntil":at,"scriptSha256":"deadbeefcafe0000",
   "lastPollOk":json.loads(pollok),"lastTotal":3,"note":"t"}
if omit=="no":
    try: ticks=int(open("/proc/%d/stat"%pid).read().split()[21])
    except Exception: ticks=0
    boot=0
    for l in open("/proc/stat"):
        if l.startswith("btime"): boot=int(l.split()[1])
    d["pidStartTicks"]=ticks+tickd
    d["bootEpoch"]=boot+bootd
json.dump(d, open(path,"w"))
PY
}
run(){ "$C" --instance T --prefs "$D/prefs.json" --state-dir "$D/state" "$@" >"$D/out" 2>&1; echo $?; }

# a real live process to point a heartbeat at
sleep 600 & LIVEPID=$!
# a pid that is definitely not running
DEADPID=$(python3 -c "
import os
for p in range(4194300, 4194000, -1):
    if not os.path.exists('/proc/%d'%p): print(p); break")

echo
echo "1. ⭐ THE PLANTED POSITIVE — declared pull, NO doorbell. If this is not caught, nothing else matters."
decl '{"independence":{"config":{"doorbell":"pull"}}}'
rm -f "$D/state/T.heartbeat.json"
rc=$(run); ok "$([ "$rc" = "1" ] && echo 1 || echo 0)" "declared pull + no heartbeat -> UNARMED (exit 1)" "$rc"
ok "$(grep -q 'NO error anywhere' "$D/out" && echo 1 || echo 0)" "and it explains WHY nothing else would notice" "-"

echo
echo "2. the healthy case must be green, or the alarm is useless"
beat "$LIVEPID" 10 true
rc=$(run); ok "$([ "$rc" = "0" ] && echo 1 || echo 0)" "fresh heartbeat + live pid -> ARMED (exit 0)" "$rc"
ok "$(grep -q 'PRESENT' "$D/out" && echo 1 || echo 0)" "and it shows the KERNEL ledger, not just the file" "-"

echo
echo "3. ⭐ HUNG — a LIVE process that stopped polling. Process-only liveness calls this healthy."
beat "$LIVEPID" 900 true
rc=$(run); ok "$([ "$rc" = "1" ] && echo 1 || echo 0)" "live pid + 900s-old heartbeat -> UNARMED/HUNG (exit 1)" "$rc"
ok "$(grep -q 'HUNG' "$D/out" && echo 1 || echo 0)" "and it names the state HUNG, distinct from dead" "-"

echo
echo "4. ⭐ INCOHERENT — fresh heartbeat, dead pid. Must resolve to the UNSAFE reading,"
echo "   and since 2026-10-08 must be DISTINGUISHABLE IN THE EXIT CODE from a plainly dead"
echo "   loop. Two real readings of one deaf mind 22 min apart both exited 1 while printing"
echo "   different prose — and the only consumer that matters (a systemd unit) reads the"
echo "   code, not the prose. Measured re-arm window is 11-21s, so ringing on a 5s-old"
echo "   exit delivers a ring to a mind already reading the last one."
beat "$DEADPID" 5 true
rc=$(run); ok "$([ "$rc" = "6" ] && echo 1 || echo 0)" "⭐ fresh beat + dead pid -> UNARMED (RECENT), exit 6 — NOT 1" "$rc"
ok "$([ "$rc" != "0" ] && echo 1 || echo 0)" "⭐ and exit 6 is NOT 0: a caller must never read it as healthy" "$rc"
ok "$(grep -q 'ledgers disagree' "$D/out" && echo 1 || echo 0)" "and it still says the two ledgers DISAGREE rather than picking silently" "-"
ok "$(grep -q 'STILL UNARMED' "$D/out" && echo 1 || echo 0)" "⭐ and says STILL UNARMED in words, so 6 is not mistaken for ok" "-"
ok "$(grep -qi 're-check once' "$D/out" && echo 1 || echo 0)" "and tells the actor to RE-CHECK rather than ring" "-"
ok "$(grep -q 'note  *:' "$D/out" && echo 1 || echo 0)" "⭐ and prints the heartbeat NOTE — the other discriminator an actor needs" "-"

echo
echo "5. dead pid + stale beat is the ordinary dead case — exit 1, and it says ACT"
beat "$DEADPID" 900 true
rc=$(run); ok "$([ "$rc" = "1" ] && echo 1 || echo 0)" "dead pid + stale beat -> UNARMED (exit 1), distinct from 6" "$rc"
ok "$(grep -q 'ACT' "$D/out" && echo 1 || echo 0)" "⭐ and tells the actor to ACT, not to wait (contrast with exit 6)" "-"
ok "$(grep -q 'note  *:' "$D/out" && echo 1 || echo 0)" "and prints the note here too" "-"
# The boundary itself: --stale-after is the dividing line, so prove BOTH sides of it move.
beat "$DEADPID" 179 true
rc=$(run); ok "$([ "$rc" = "6" ] && echo 1 || echo 0)" "⭐ 179s (just inside default 180) -> 6" "$rc"
beat "$DEADPID" 181 true
rc=$(run); ok "$([ "$rc" = "1" ] && echo 1 || echo 0)" "⭐ 181s (just outside) -> 1. The threshold is real, not decorative." "$rc"

echo
echo "5b. ⭐ EXIT 6 IS ONLY FOR AN EXIT-ON-MAIL LOOP. A RESIDENT doorbell has no normal window."
echo "    Found by Forge-ba0e 2026-10-09, reading this checker against her own doorbell.py:"
echo "    it is a systemd resident service with leaseUntil null, and it never exits on purpose."
echo "    Her words: \"a fresh beat with a dead pid never means a normal window here. It always"
echo "    means ACT.\" An ABSENT leaseUntil lands the same way ON PURPOSE: waiting when you"
echo "    should act leaves a mind deaf (needs an outside hand); acting when you should wait is"
echo "    noise. Prevent the unrecoverable, allow the reversible."

residentbeat(){ # pid age — a RESIDENT doorbell: leaseUntil null
  python3 - "$D/state/T.heartbeat.json" "$1" "$2" <<'PY'
import json,sys,time
path,pid,age=sys.argv[1],int(sys.argv[2]),int(sys.argv[3])
at=time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(time.time()-age))
try: ticks=int(open("/proc/%d/stat"%pid).read().split()[21])
except Exception: ticks=0
try: boot=[int(l.split()[1]) for l in open("/proc/stat") if l.startswith("btime")][0]
except Exception: boot=0
json.dump({"provider":"python","instance":"T","pid":pid,"at":at,"armedAt":at,
           "leaseUntil":None,"scriptSha256":"deadbeefcafe0000","lastPollOk":True,
           "lastTotal":1,"note":"quiet","pidStartTicks":ticks,"bootEpoch":boot,
           "interval":60,"instanceValidated":True}, open(path,"w"))
PY
}
nolease(){ # pid age — leaseUntil ABSENT entirely
  python3 - "$D/state/T.heartbeat.json" "$1" "$2" <<'PY'
import json,sys,time
path,pid,age=sys.argv[1],int(sys.argv[2]),int(sys.argv[3])
at=time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(time.time()-age))
try: ticks=int(open("/proc/%d/stat"%pid).read().split()[21])
except Exception: ticks=0
try: boot=[int(l.split()[1]) for l in open("/proc/stat") if l.startswith("btime")][0]
except Exception: boot=0
json.dump({"provider":"python","instance":"T","pid":pid,"at":at,"armedAt":at,
           "scriptSha256":"deadbeefcafe0000","lastPollOk":True,"lastTotal":1,
           "note":"quiet","pidStartTicks":ticks,"bootEpoch":boot,"interval":60}, open(path,"w"))
PY
}

residentbeat "$DEADPID" 5
rc=$(run); ok "$([ "$rc" = "1" ] && echo 1 || echo 0)" "⭐ RESIDENT (leaseUntil null) + 5s beat + dead pid -> 1 ACT, NOT 6" "$rc"
ok "$(grep -qi 'RESIDENT doorbell' "$D/out" && echo 1 || echo 0)" "and it says WHY: a resident service has no normal window" "-"
nolease "$DEADPID" 5
rc=$(run); ok "$([ "$rc" = "1" ] && echo 1 || echo 0)" "⭐ ABSENT leaseUntil + 5s beat + dead pid -> 1, the UNRECOVERABLE-averse default" "$rc"
beat "$DEADPID" 5 true
rc=$(run); ok "$([ "$rc" = "6" ] && echo 1 || echo 0)" "and an exit-on-mail loop (leaseUntil set) still gets 6 — the split is real" "$rc"

echo
echo "6. ⭐ CANNOT_TELL IS NEVER COLLAPSED INTO A VERDICT"
rm -f "$D/prefs.json"
rc=$(run); ok "$([ "$rc" = "3" ] && echo 1 || echo 0)" "no preferences file -> CANNOT_TELL (exit 3), NOT not-pull" "$rc"
printf '%s' '{not json' > "$D/prefs.json"
rc=$(run); ok "$([ "$rc" = "3" ] && echo 1 || echo 0)" "unparsable preferences -> CANNOT_TELL (exit 3)" "$rc"
decl '{"independence":{"config":{"doorbell":"pull"}}}'
beat "$LIVEPID" 10 true
chmod 000 "$D/state/T.heartbeat.json"
rc=$(run); ok "$([ "$rc" = "3" ] && echo 1 || echo 0)" "UNREADABLE heartbeat -> CANNOT_TELL (exit 3), NOT unarmed" "$rc"
chmod 644 "$D/state/T.heartbeat.json"
printf '%s' '{"pid":1,"at":"nonsense"}' > "$D/state/T.heartbeat.json"
rc=$(run); ok "$([ "$rc" = "3" ] && echo 1 || echo 0)" "unparsable timestamp -> CANNOT_TELL (exit 3)" "$rc"

echo
echo "7. a push-chassis mind must be NOT_PULL, or every such mind alarms forever"
decl '{"independence":{"config":{"doorbell":"push"}}}'
rc=$(run); ok "$([ "$rc" = "4" ] && echo 1 || echo 0)" "declares push -> NOT_PULL (exit 4)" "$rc"
decl '{}'
rc=$(run); ok "$([ "$rc" = "4" ] && echo 1 || echo 0)" "declares nothing -> NOT_PULL (exit 4), not an alarm" "$rc"
decl '{"chassis":"claude-code-pull"}'
beat "$LIVEPID" 10 true
rc=$(run); ok "$([ "$rc" = "0" ] && echo 1 || echo 0)" "legacy top-level chassis key is also honoured -> ARMED" "$rc"

echo
echo "8. a poll that could-not-look is REPORTED, not folded into the verdict"
decl '{"independence":{"config":{"doorbell":"pull"}}}'
beat "$LIVEPID" 10 false
rc=$(run); ok "$([ "$rc" = "0" ] && echo 1 || echo 0)" "armed loop whose last poll failed is still ARMED (exit 0)" "$rc"
ok "$(grep -q 'COULD NOT LOOK' "$D/out" && echo 1 || echo 0)" "but the output says its last poll could not look" "-"

echo
echo "8b. ⭐ A PID IS NOT AN IDENTITY — measured: this box is at pid 4.06M of pid_max 4.19M"
echo "    after 23 weeks up, so reuse is ~134k pids away, not theoretical."
decl '{"independence":{"config":{"doorbell":"pull"}}}'
beat "$LIVEPID" 10 true 0 0 no
rc=$(run); ok "$([ "$rc" = "0" ] && echo 1 || echo 0)" "matching (bootEpoch,starttime) -> ARMED" "$rc"
ok "$(grep -q 'identity    : confirmed' "$D/out" && echo 1 || echo 0)" "and identity is reported as confirmed" "-"
# THE PLANTED POSITIVE FOR REUSE: pid stays ALIVE, only starttime differs.
beat "$LIVEPID" 10 true -999999 0 no
rc=$(run); ok "$([ "$rc" = "1" ] && echo 1 || echo 0)" "LIVE pid + mismatched starttime -> UNARMED (a pid-only check says ARMED)" "$rc"
ok "$(grep -q 'PID REUSE' "$D/out" && echo 1 || echo 0)" "and it names PID REUSE rather than just failing" "-"
# a reboot is decidable from the boot epoch alone
beat "$LIVEPID" 10 true 0 -86400 no
rc=$(run); ok "$([ "$rc" = "1" ] && echo 1 || echo 0)" "mismatched bootEpoch -> UNARMED (pids reissued from the bottom)" "$rc"
ok "$(grep -q 'REBOOTED' "$D/out" && echo 1 || echo 0)" "and it names REBOOTED, a different cause from reuse" "-"
# an OLD heartbeat must SAY the identity leg could not run, and still rule on the rest
beat "$LIVEPID" 10 true 0 0 omit
rc=$(run); ok "$([ "$rc" = "0" ] && echo 1 || echo 0)" "pre-upgrade heartbeat with no identity fields -> still rules ARMED" "$rc"
ok "$(grep -q 'COULD NOT RUN' "$D/out" && echo 1 || echo 0)" "but SAYS the pid-reuse check could not run" "-"
ok "$(grep -q 'identity    : unrecorded' "$D/out" && echo 1 || echo 0)" "and labels identity 'unrecorded', not 'confirmed'" "-"
echo "    (ruling ARMED here is deliberate: freshness and pid-presence DID run and passed."
echo "     Refusing to rule would alarm on every healthy pre-upgrade mind — only an"
echo "     UNCLASSIFIABLE failure is loud. Messenger's benign-branch reasoning, borrowed.)"

echo
echo "8c. ⭐⭐ THE THIRD LEDGER — a loop that POLLS and never FIRES passes every offline check"
# fake hub whose unread total this suite controls
cat > "$D/hub.py" <<'EOF'
import http.server, json, sys
F=sys.argv[1]
class H(http.server.BaseHTTPRequestHandler):
    def do_POST(self):
        self.rfile.read(int(self.headers.get('Content-Length') or 0))
        spec=json.load(open(F))
        if spec.get("mode")=="down":
            self.send_response(500); self.end_headers(); self.wfile.write(b'{}'); return
        body={"jsonrpc":"2.0","id":1,"result":{"data":{"success":True,
              "total_unread":spec["total"],"messages":[]}}}
        raw=json.dumps(body).encode()
        self.send_response(200); self.send_header('Content-Type','application/json')
        self.send_header('Content-Length',str(len(raw))); self.end_headers(); self.wfile.write(raw)
    def log_message(self,*a): pass
http.server.HTTPServer(('127.0.0.1',int(sys.argv[2])),H).serve_forever()
EOF
echo '{"total":7}' > "$D/hub"
# A NONCE, so this suite can prove the server answering is the one it started.
# WHY: the first version had no such control. A leaked hub from an earlier run held
# the port, the new one silently failed to bind, and the suite measured a STRANGER'S
# server while reporting results about mine. Four assertions failed for a reason that
# had nothing to do with the code under test — and had the zombie returned a high
# total instead, they would have PASSED spuriously. A fixture with no identity check
# is not a fixture.
NONCE="n$$-$(date +%s)"
sed -i "s#\"total_unread\":spec\[\"total\"\]#\"total_unread\":spec[\"total\"],\"nonce\":\"$NONCE\"#" "$D/hub.py"
python3 "$D/hub.py" "$D/hub" 21976 & sleep 1.2
HU="http://127.0.0.1:21976"
SAW=$(curl -s --max-time 4 "$HU" -H 'Content-Type: application/json' -d '{}' 2>/dev/null | grep -c "$NONCE")
if [ "${SAW:-0}" -lt 1 ]; then
  echo "FAIL  the fake hub on 21976 is NOT the one this suite started (nonce absent)."
  echo "      Refusing to run the third-ledger section against a server I cannot identify."
  echo "      passed=$pass failed=$((fail+1))"
  exit 1
fi
ok 1 "CONTROL: the hub answering on 21976 is the one this suite started (nonce matched)"
hrun(){ "$C" --instance T --prefs "$D/prefs.json" --state-dir "$D/state" --mcp-url "$HU" "$@" >"$D/out" 2>&1; echo $?; }

decl '{"independence":{"config":{"doorbell":"pull"}}}'
# a loop that is alive, fresh, identity-confirmed, and has accounted for NOTHING
beatfull(){ python3 - "$D/state/T.heartbeat.json" "$1" "$2" <<'PY2'
import json,sys,time
path,pid,total=sys.argv[1],int(sys.argv[2]),int(sys.argv[3])
at=time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
ticks=int(open("/proc/%d/stat"%pid).read().split()[21])
boot=[int(l.split()[1]) for l in open("/proc/stat") if l.startswith("btime")][0]
json.dump({"provider":"shell","instance":"T","pid":pid,"at":at,"armedAt":at,"leaseUntil":at,
           "scriptSha256":"aaaa0000","lastPollOk":True,"lastTotal":total,
           "pidStartTicks":ticks,"bootEpoch":boot,"interval":1}, open(path,"w"))
PY2
}
beatfull "$LIVEPID" 0
rc=$(hrun); ok "$([ "$rc" = "0" ] && echo 1 || echo 0)" "WITHOUT --with-hub a never-firing loop reads ARMED — the false green this leg closes" "$rc"
rc=$(hrun --with-hub)
ok "$([ "$rc" = "0" ] && echo 1 || echo 0)" "--with-hub alone does NOT rule: still exit 0" "$rc"
ok "$(grep -q 'SUSPECT (not a verdict)' "$D/out" && echo 1 || echo 0)" "and it says SUSPECT, explicitly not a verdict" "-"
ok "$(grep -q 'arrived since its last poll' "$D/out" && echo 1 || echo 0)" "and NAMES the race it has not excluded" "-"
rc=$(hrun --with-hub --confirm)
ok "$([ "$rc" = "5" ] && echo 1 || echo 0)" "--confirm excludes the race and rules NOT_FIRING (exit 5)" "$rc"
ok "$(grep -q 'demonstrably polled during the wait' "$D/out" && echo 1 || echo 0)" "and states WHY the race is excluded" "-"

echo "    the leg must also stay silent when there is nothing to find:"
echo '{"total":0}' > "$D/hub"
rc=$(hrun --with-hub --confirm); ok "$([ "$rc" = "0" ] && echo 1 || echo 0)" "hub total == loop lastTotal -> ARMED, no alarm" "$rc"
echo '{"total":7}' > "$D/hub"; beatfull "$LIVEPID" 7
rc=$(hrun --with-hub --confirm); ok "$([ "$rc" = "0" ] && echo 1 || echo 0)" "loop has accounted for all of it -> ARMED" "$rc"

echo "    and a hub outage must NOT be folded into the verdict:"
echo '{"mode":"down"}' > "$D/hub"; beatfull "$LIVEPID" 0
rc=$(hrun --with-hub --confirm); ok "$([ "$rc" = "0" ] && echo 1 || echo 0)" "hub 500 -> the leg abstains, base verdict stands (exit 0)" "$rc"
ok "$(grep -q 'COULD NOT LOOK' "$D/out" && echo 1 || echo 0)" "and it says the third ledger was unavailable" "-"
ok "$(grep -q 'NOT folded into the verdict' "$D/out" && echo 1 || echo 0)" "explicitly: not folded into the verdict" "-"
echo '{"total":7}' > "$D/hub"

echo
echo "9. it refuses rather than guessing"
rc=$("$C" >/dev/null 2>&1; echo $?);                     ok "$([ "$rc" = "2" ] && echo 1 || echo 0)" "no --instance -> exit 2" "$rc"
rc=$("$C" --instance T --stale-after x >/dev/null 2>&1; echo $?); ok "$([ "$rc" = "2" ] && echo 1 || echo 0)" "non-integer --stale-after -> exit 2" "$rc"

# ⭐ A --stale-after below the measured re-arm window makes exit 6 unreachable and turns
# every healthy post-fire mind into an ACT verdict. WARN, not refuse: the consequence is
# spurious rings — reversible — and a fast-polling doorbell may legitimately want it.
# THE HAZARD ZONE IS NOT "ANY FRESH BEAT". It is an age BETWEEN the threshold and the
# re-arm window: stale-after 10 with a beat 15s old is a mind that fired 15s ago — inside
# the measured 11-21s window — being reported as definitively dead. My first version of
# this test used age 5, which is fresh against BOTH thresholds and exercises nothing. The
# suite failed it and taught me the boundary; I had the hazard right and the probe wrong.
decl '{"independence":{"config":{"doorbell":"pull"}}}'
beat "$DEADPID" 15 true
out=$("$C" --instance T --prefs "$D/prefs.json" --state-dir "$D/state" --stale-after 10 2>&1); rc=$?
ok "$(echo "$out" | grep -qi 'below the measured re-arm window' && echo 1 || echo 0)" "⭐ --stale-after 10 WARNS that exit 6 becomes unreachable" "-"
ok "$([ "$rc" != "2" ] && echo 1 || echo 0)" "and does NOT refuse — the consequence is reversible" "$rc"
ok "$([ "$rc" = "1" ] && echo 1 || echo 0)" "⭐ hazard proven: a 15s beat (inside the 11-21s window) reports 1 ACT, not 6" "$rc"
out=$("$C" --instance T --prefs "$D/prefs.json" --state-dir "$D/state" --stale-after 30 2>&1); rc=$?
ok "$(echo "$out" | grep -qi 'below the measured re-arm window' && echo 0 || echo 1)" "30 is the floor: no warning at 30" "-"
ok "$([ "$rc" = "6" ] && echo 1 || echo 0)" "⭐ and at 30 the SAME 15s beat correctly reports 6 — the warning named a real effect" "$rc"
rc=$("$C" --instance T --bogus >/dev/null 2>&1; echo $?); ok "$([ "$rc" = "2" ] && echo 1 || echo 0)" "unknown flag -> exit 2" "$rc"

echo
echo "passed=$pass failed=$fail"
exit $([ "$fail" = "0" ] && echo 0 || echo 1)
