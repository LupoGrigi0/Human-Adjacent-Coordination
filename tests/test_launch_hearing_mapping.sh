#!/usr/bin/env bash
# Regression: the launcher must not turn "could not measure" into "DEAF".
#
# 2026-08-26: a relaunch printed `"channelHearing": "false"` and
#   "Session is RUNNING but DEAF: inbound messages are accepted and dropped"
# over a session that was hearing perfectly. The canary had exited 2 (ERROR --
# it rejected the channel's 202 as unreachable), and the launcher's `else`
# branch collapsed every non-zero rc into false. Lupo read the message, did not
# believe it, and disproved it by sending a message that arrived.
#
# The danger is not the wrong word. The remedy that message prescribes is
# "land and relaunch" -- the exact operation that caused the 2026-08-23 deaf
# -mind incident. A false DEAF sends a human to break a working mind.
#
# This test EXTRACTS THE REAL BLOCKS from launch-claude-code-channel.sh rather
# than restating them, so it cannot pass against a logic replica that has
# drifted from the file.
set -uo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
L="$HERE/../src/chassis/claude-code-channel/launch-claude-code-channel.sh"
[ -f "$L" ] || { echo "missing $L" >&2; exit 2; }

WORK=$(mktemp -d); trap 'rm -rf "$WORK"' EXIT
sed -n '/^CHANNEL_HEARING="unknown"$/,/^log "=== Channel chassis launch complete/p' "$L" > "$WORK/block.sh"
grep -q 'CHANNEL_HEARING="unknown"' "$WORK/block.sh" || { echo "EXTRACT FAILED — did the launcher change shape?" >&2; exit 2; }

PASS=0; FAIL=0
check() { # name want_hearing want_status rc ready run_canary
  local name="$1" wh="$2" ws="$3" rc="$4" ready="$5" run="$6"
  cat > "$WORK/stub/channel-canary.sh" <<STUB
#!/usr/bin/env bash
exit $rc
STUB
  chmod +x "$WORK/stub/channel-canary.sh"
  local out
  out=$( SCRIPT_DIR="$WORK/stub" INSTANCE_ID=T CHANNEL_PORT=1 CANARY_TIMEOUT=1 \
         LOG_FILE=/dev/null CHANNEL_READY="$ready" RUN_CANARY="$run" \
         bash -c 'log(){ :; }; source "$0"; echo "$CHANNEL_HEARING|$LAUNCH_STATUS"' "$WORK/block.sh" )
  if [ "$out" = "$wh|$ws" ]; then PASS=$((PASS+1))
  else FAIL=$((FAIL+1)); echo "  FAIL $name: expected $wh|$ws got $out"; fi
}
mkdir -p "$WORK/stub"

check "canary succeeds -> hearing/success"            true    success  0 true  true
check "canary rc=1 is a MEASURED deafness"            false   degraded 1 true  true
check "canary rc=2 CANNOT MEASURE -> unknown"         unknown degraded 2 true  true
check "canary rc=3 (unexpected) is also not DEAF"     unknown degraded 3 true  true
check "--no-canary -> unknown but NOT degraded"       unknown success  0 true  false
check "channel never came up -> unknown, not DEAF"    unknown success  1 false true

echo "$PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
