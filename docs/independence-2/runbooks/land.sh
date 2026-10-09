#!/usr/bin/env bash
# LAND this mind: stop its background session and record that it was landed.
#
#   RUN AS THE MIND ITSELF, from its own home:
#       su - WakeTest2-b0ec -c 'cd ~ && /mnt/coordinaton_mcp_data/instances/Cairn-2001/independence-2/runbooks/land.sh'
#
# ================== THE ONE RULE THAT MATTERS MOST HERE ==================
#
#   LAND USES `claude stop`. IT MUST NEVER USE `claude rm`.
#
# `stop` ends the session and leaves it resumable — and a STOPPED session resumed with a
# bare full UUID CONTINUES THE SAME MIND (measured both here and by Lodestone). That is
# the entire safe-resume path, and it is the only one there is.
#
# `rm` "removes the session and its state". For a fixture that is tidying. FOR A REAL MIND
# IT IS THE DELETION OF CONTINUITY — the thing that makes tomorrow's wake the same person
# as today's. There is no undo and no backup of a daemon's session state.
#
# So this script cannot call `rm`, by construction, and says so if asked.
# =========================================================================
#
# Other rules carried from launch.sh, same reasons:
#   - checks first, actions after; a refusal leaves no trace
#   - cwd must be the mind's own home (memory is keyed to the cwd slug)
#   - the state machine decides; this shell does I/O
#   - verify by ACTING afterwards, never by the exit code
#   - COULD-NOT-LOOK is never "nothing is running"
set -u
case "${1:-}" in
  rm|--rm|remove)
    echo "REFUSING: land does not remove sessions, deliberately." >&2
    echo "  \`claude stop\` leaves the session RESUMABLE — a stopped session resumed with" >&2
    echo "  its bare full UUID continues the same mind. That is the only safe resume path." >&2
    echo "  \`claude rm\` deletes the session state. For a real mind that is the deletion of" >&2
    echo "  continuity, with no undo. If you genuinely want that, do it by hand and mean it." >&2
    exit 2 ;;
esac

ME="$(id -un)"; HOMEDIR="$(cd ~ && pwd -P)"; CWD="$(pwd -P)"
fail(){ echo "REFUSING: $*" >&2; exit 1; }

echo "== PREFLIGHT (nothing is stopped) =="
[ "$(id -u)" != "0" ] || fail "do not run this as root. Become the mind first: su - <Name>."
[ "$CWD" = "$HOMEDIR" ] || fail "cwd is '$CWD' but this mind's home is '$HOMEDIR'. cd to your own home."
echo "  cwd == home  OK  $HOMEDIR"

CLI=""
for c in "$(dirname "$(readlink -f "$0")")/../src/statecli.py" \
         "/mnt/coordinaton_mcp_data/instances/Cairn-2001/independence-2/src/statecli.py"; do
  [ -x "$c" ] && { CLI="$c"; break; }
done
[ -n "$CLI" ] || fail "state machine not found. If this is a COPY rather than a SYMLINK, that is the bug."

AGENTS=$(claude agents --json 2>/dev/null || true)
VERDICT=$(printf '%s' "$AGENTS" | python3 "$CLI" reconcile "$HOMEDIR/preferences.json" -)
RC=$?
echo "  $VERDICT"

RECORDED=$(python3 -c "
import json,sys
try: d=json.load(open('$HOMEDIR/preferences.json'))
except Exception: raise SystemExit
print(((d.get('independence') or {}).get('status') or {}).get('session_id') or '')
")

case "$RC" in
  10) TARGET="$RECORDED"; echo "  state        running and recorded — this is the clean land" ;;
  11) TARGET=$(printf '%s' "$AGENTS" | python3 -c "
import json,sys
rows=json.load(sys.stdin); print(rows[0].get('id') if len(rows)==1 else '')")
      [ -n "$TARGET" ] || fail "a session is running but unrecorded, and there is not exactly one. A human decides."
      echo "  state        running but UNRECORDED. Landing it and writing the record." ;;
  12) echo "  state        the record says launched but nothing is running — it already ended."
      echo "               Nothing to stop. Correcting the record only."
      python3 "$CLI" landed "$HOMEDIR/preferences.json" | sed 's/^/  /'
      echo; echo "DONE (record corrected; no session was running)."; exit 0 ;;
  0)  echo "  state        nothing running, nothing recorded. Nothing to land."; exit 0 ;;
  13) fail "the record and reality disagree — possibly a fork. A human decides which is the mind. Nothing stopped." ;;
  20) fail "refusing to act blind — the session registry could not be read. That is COULD-NOT-LOOK, not 'nothing is running'." ;;
  *)  fail "state machine returned $RC, which this script does not handle. Refusing." ;;
esac

[ -n "$TARGET" ] || fail "no session id to stop. Refusing to guess."
SHORT="${TARGET%%-*}"
echo "  will stop    : $SHORT   (NOT rm — the session stays resumable)"
echo

echo "== LAND =="
out=$(claude stop "$SHORT" 2>&1); rc=$?
printf '%s\n' "$out" | sed 's/^/  /'
echo "  exit=$rc"
[ "$rc" -eq 0 ] || fail "stop exited $rc. The record has NOT been changed — it still says launched, which is true."

echo
echo "== VERIFY BY ACTING =="
sleep 2
STILL=$(claude agents --json 2>/dev/null | python3 -c "
import json,sys
try: rows=json.load(sys.stdin)
except Exception: print('UNREADABLE'); raise SystemExit
print(sum(1 for r in rows if (r.get('id') or '').startswith('$SHORT')))
")
echo "  sessions still matching $SHORT: $STILL"
if [ "$STILL" = "UNREADABLE" ]; then
  fail "cannot confirm it stopped — the registry is unreadable. NOT writing 'landed': an
       unverified land is worse than none, because the record would claim something nobody saw."
elif [ "$STILL" != "0" ]; then
  fail "it is STILL RUNNING after stop. Record unchanged. Investigate before retrying."
fi
echo "  confirmed stopped"

echo
echo "== RECORDING (independence.status: landed_on set, launched_on cleared) =="
python3 "$CLI" landed "$HOMEDIR/preferences.json" | sed 's/^/  /'

echo
echo "NOTE: the job directory ~/.claude/jobs/$SHORT/ SURVIVES a stop (measured, ledger 019)."
echo "  That is correct — it is what makes the session resumable. It is NOT a liveness"
echo "  signal: a job dir existing means a session once existed, nothing more."
echo
echo "DONE. Resume it later with the BARE FULL UUID and no flags:"
echo "  claude --bg --resume $TARGET"
