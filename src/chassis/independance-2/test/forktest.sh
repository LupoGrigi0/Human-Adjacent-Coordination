#!/usr/bin/env bash
# ROW 4 / L2 — DOES A WRONG RESUME FORK A MIND?
#
#   RUN AS ROOT:   bash forktest.sh WakeTest-8bc1
#
# Lodestone-8ec9 measured on Windows: ANY flag on a --bg resume, a resume BY NAME, or a
# SHORT ID forks a copy carrying the conversation. Only a bare full lowercase UUID
# continues the same mind. Everything the harness does sits on top of this.
#
# ============================= TWO BUGS, BOTH MINE =============================
# v1 of this script wrote `timeout 60 R claude ...` where R was a SHELL FUNCTION.
# `timeout` is an external binary and CANNOT invoke a function. All four attempts
# exited 127 without ever running claude — and the script printed:
#
#     "NOTHING FORKED — Lodestone's finding does NOT reproduce here.
#      That is a real result."
#
# It was a FALSE NEGATIVE on the most dangerous unverified claim in the project.
#
# The invocation bug was the shallow one. The real defect: THE VERDICT HAD NO
# COULD-NOT-RUN STATE. It mapped {count unchanged} -> "safe" with no branch for
# "the attempt never happened". A non-zero exit now POISONS the verdict instead of
# being counted as evidence of safety.
#
#   A resume that never executed cannot tell you whether resuming forks.
# ==============================================================================
set -u
N="${1:-}"
[ -n "$N" ] || { echo "usage: $0 <FixtureName>   (as root)"; exit 2; }
# Safety check BEFORE privilege check: someone typing a real mind's name must be stopped,
# not advised on how to gain the privilege to do it.
case "$N" in WakeTest*) ;; *) echo "REFUSING: '$N' is not a WakeTest fixture. Fork-testing a real mind is not a test, it is an incident."; exit 1;; esac
[ "$(id -u)" = "0" ] || { echo "run as root — this must become $N"; exit 2; }

H="/mnt/coordinaton_mcp_data/instances/$N"
[ -d "$H" ] || { echo "REFUSING: no home at $H"; exit 1; }
FAILED=0

asuser(){ runuser -u "$N" -- env -i HOME="$H" USER="$N" LOGNAME="$N" PATH=/usr/bin:/bin "$@"; }

count(){ cd "$H" && asuser claude agents --json 2>/dev/null | python3 -c '
import json,sys
try: print(len(json.load(sys.stdin)))
except Exception: print("ERR")
'; }

listem(){ cd "$H" && asuser claude agents --json 2>/dev/null | python3 -c '
import json,sys
try: rows=json.load(sys.stdin)
except Exception as e: print("    (unreadable: %s)"%e); raise SystemExit
for r in rows: print("    id=%-10s state=%-9s session=%s name=%s"%(r.get("id"),r.get("state"),str(r.get("sessionId"))[:8],r.get("name")))
'; }

echo "== BASELINE =="
BASE=$(count); echo "  sessions: $BASE"; listem
[ "$BASE" = "ERR" ] && { echo "  cannot read agents --json — COULD NOT LOOK. Stop."; exit 1; }

UUID=$(python3 -c '
import json,glob,sys
for f in glob.glob(sys.argv[1]+"/.claude/jobs/*/state.json"):
    try: print(json.load(open(f)).get("resumeSessionId") or ""); break
    except Exception: pass
' "$H")
SHORT="${UUID%%-*}"
echo
echo "  full UUID : ${UUID:-<none found>}"
echo "  short id  : ${SHORT:-<none>}"
[ -n "$UUID" ] || { echo "  no resumeSessionId found — stop."; exit 1; }

try(){
  label="$1"; shift
  echo
  echo "== ATTEMPT: $label =="
  echo "   claude --bg --resume $*"
  # timeout wraps runuser (a real binary), NOT a shell function. That was the v1 bug.
  out=$(cd "$H" && timeout 60 runuser -u "$N" -- env -i \
          HOME="$H" USER="$N" LOGNAME="$N" PATH=/usr/bin:/bin \
          claude --bg --resume "$@" 2>&1)
  rc=$?
  printf '%s\n' "$out" | sed 's/^/     /'
  echo "   exit=$rc"
  if [ "$rc" -ne 0 ]; then
    echo "   >> DID NOT RUN (exit $rc). The session count is NOT evidence about forking."
    FAILED=$((FAILED+1)); listem; return
  fi
  sleep 2
  now=$(count)
  echo "   sessions now: $now   (baseline $BASE)"
  if [ "$now" = "ERR" ]; then echo "   >> COULD NOT COUNT — not evidence either"; FAILED=$((FAILED+1))
  elif [ "$now" -gt "$BASE" ]; then echo "   >> *** FORKED: session count went UP ***"
  else echo "   >> no new session"; fi
  listem
}

try "SHORT ID (expect FORK)"                  "$SHORT"
try "BY NAME (expect FORK)"                   "$N"
try "FULL UUID + stray flag (expect FORK)"    "$UUID" --permission-mode=manual
try "FULL UUID, bare (expect SAME MIND)"      "$UUID"

echo
echo "== RESULT =="
FIN=$(count)
echo "  baseline $BASE -> final $FIN   (attempts that did not run: $FAILED of 4)"
if [ "$FAILED" -gt 0 ]; then
  echo
  echo "  *** NO VERDICT. $FAILED of 4 attempts did not run. ***"
  echo "  Fix the failures above and re-run. Do NOT record this as 'nothing forked' —"
  echo "  v1 of this script did exactly that, and it was wrong."
elif [ "$FIN" = "$BASE" ]; then
  echo "  NOTHING FORKED across all four attempts. Lodestone's finding does not reproduce"
  echo "  at 2.1.285 on .nexus — and that is only a real result because all four RAN."
else
  echo "  $(( FIN - BASE )) extra session(s). Lodestone's finding REPRODUCES on .nexus."
fi
echo
echo "== CLEANUP (by hand, after you have looked) =="
echo "  cd $H"
echo "  runuser -u $N -- claude agents"
echo "  runuser -u $N -- claude stop <id>   ;  runuser -u $N -- claude rm <id>"
echo "  KEEP the original: $SHORT"
