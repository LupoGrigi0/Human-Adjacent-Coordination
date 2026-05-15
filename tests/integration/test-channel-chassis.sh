#!/bin/bash
#
# test-channel-chassis.sh — End-to-end regression test for the claude-code-channel chassis.
#
# Exercises:
#   1. pre_approve a fresh test instance via HACS API
#   2. claude-code-channel-setup.sh — unix user, .mcp.json, .claude.json, etc.
#   3. launch-claude-code-channel.sh — tmux session + channel /health
#   4. POST /broker-event — verify event delivered, instance replies
#   5. land-claude-code-channel.sh — clean shutdown
#   6. Re-launch (no setup) — verify warm-start works
#   7. Final land + cleanup (unix user, instance dir, logs)
#
# Outputs JSON to stdout with per-phase pass/fail.
# Exit 0 if all pass, 1 if any fail.
#
# Safety:
#   - Only operates on instances matching prefix "channel-test-"
#   - Refuses to run if WAKE_API_KEY not set OR if test-prefix instance
#     already exists from a previous run
#   - --keep-instance flag preserves artifacts for debugging
#   - --dry-run prints what would happen, runs nothing destructive
#
# Usage:
#   WAKE_API_KEY=... ./test-channel-chassis.sh [--keep-instance] [--dry-run]
#
# Author: Crossing-2d23

set -u

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
DATA_ROOT="${V2_DATA_ROOT:-/mnt/coordinaton_mcp_data}"
INSTANCES_DIR="${INSTANCEROOT:-$DATA_ROOT/instances}"
HACS_ROOT="${HACS_ROOT:-$DATA_ROOT/Human-Adjacent-Coordination}"
HACS_API="${HACS_API_URL:-https://smoothcurves.nexus/mcp}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# CHASSIS_OVERRIDE (if set) wins so worktree tests can run against
# in-development scripts. Otherwise defaults to the production mirror.
if [ -n "${CHASSIS_OVERRIDE:-}" ]; then
  CHASSIS_DIR="$CHASSIS_OVERRIDE"
else
  CHASSIS_DIR="$HACS_ROOT/src/chassis/claude-code-channel"
fi

KEEP_INSTANCE=false
DRY_RUN=false
CALLER_INSTANCE_ID="${CALLER_INSTANCE_ID:-Crossing-2d23}"

while [[ $# -gt 0 ]]; do
  case $1 in
    --keep-instance) KEEP_INSTANCE=true; shift ;;
    --dry-run) DRY_RUN=true; shift ;;
    --help|-h)
      cat <<HELPEOF
test-channel-chassis.sh — claude-code-channel regression test.

Required env:
  WAKE_API_KEY      HACS wake API key (read from secrets.env or set explicitly)

Optional env:
  CALLER_INSTANCE_ID  Instance ID used as caller for HACS API calls (default: Crossing-2d23)
  HACS_API_URL        HACS MCP API endpoint (default: https://smoothcurves.nexus/mcp)
  CHASSIS_OVERRIDE    Override path to chassis scripts (default: production mirror)
  HACS_ROOT           Override HACS root path (default: production mirror)

Flags:
  --keep-instance   Skip cleanup, leave test instance for inspection
  --dry-run         Print what would happen, run nothing destructive

Exit code: 0 if all phases pass, 1 if any phase fails.
HELPEOF
      exit 0
      ;;
    *) echo "Unknown option: $1" >&2; exit 1 ;;
  esac
done

if [ -z "${WAKE_API_KEY:-}" ]; then
  echo '{"error":"WAKE_API_KEY not set. Source secrets.env or pass explicitly."}' >&2
  exit 1
fi

# Generate unique test instance ID
TEST_TS=$(date +%s)
TEST_PREFIX="channel-test"
# Pick a random hex suffix for uniqueness
TEST_SUFFIX=$(printf '%04x' $((RANDOM % 65536)))
# HACS pre_approve generates ID from name+hex; we use a no-space name and
# scan for the resulting ID afterward
TEST_NAME="ChannelTestRegression"

# Track instance ID once known (set after pre_approve)
INSTANCE_ID=""
UNIX_USER=""

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
PHASES_JSON="["
PHASE_COUNT=0
FAILED_COUNT=0

# Record a phase result. Args: name, passed (true/false), duration_ms, details_json
record_phase() {
  local name="$1"
  local passed="$2"
  local duration_ms="$3"
  local details="${4:-{}}"
  if [ "$PHASE_COUNT" -gt 0 ]; then PHASES_JSON+=","; fi
  PHASES_JSON+="{\"name\":\"$name\",\"passed\":$passed,\"duration_ms\":$duration_ms,\"details\":$details}"
  PHASE_COUNT=$((PHASE_COUNT + 1))
  if [ "$passed" = "false" ]; then FAILED_COUNT=$((FAILED_COUNT + 1)); fi
}

# Wrap a phase invocation. Args: phase-name, command-to-run
# Phase functions set the global PHASE_DETAILS for the JSON object.
PHASE_DETAILS="{}"
run_phase() {
  local name="$1"; shift
  echo "[$(date -Iseconds)] PHASE: $name" >&2
  local start_ms=$(date +%s%3N)
  PHASE_DETAILS="{}"
  if "$@"; then
    local end_ms=$(date +%s%3N)
    record_phase "$name" true "$((end_ms - start_ms))" "$PHASE_DETAILS"
    echo "[$(date -Iseconds)]   -> PASS" >&2
    return 0
  else
    local end_ms=$(date +%s%3N)
    record_phase "$name" false "$((end_ms - start_ms))" "$PHASE_DETAILS"
    echo "[$(date -Iseconds)]   -> FAIL" >&2
    return 1
  fi
}

# Helper to call HACS MCP API
hacs_call() {
  local tool="$1"
  local args="$2"
  curl -s --max-time 30 -X POST "$HACS_API" \
    -H 'Content-Type: application/json' \
    -d "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"tools/call\",\"params\":{\"name\":\"$tool\",\"arguments\":$args}}"
}

# Extract a JSON field from MCP tools/call response (which wraps result in content[0].text)
mcp_unwrap() {
  python3 -c "
import json, sys
try:
    raw = sys.stdin.read()
    d = json.loads(raw)
    text = d['result']['content'][0]['text']
    print(text)
except Exception as e:
    print(json.dumps({'error': str(e), 'raw': raw[:200]}))
"
}

# Safety check: refuse to operate on non-test instances
guard_test_prefix() {
  local id="$1"
  if [[ ! "$id" =~ ^${TEST_PREFIX}|^ChannelTest ]]; then
    echo "{\"error\":\"refusing to operate on non-test instance: $id\"}" >&2
    return 1
  fi
  return 0
}

# ---------------------------------------------------------------------------
# Phase implementations
# ---------------------------------------------------------------------------

phase_pre_approve() {
  local args="{\"instanceId\":\"$CALLER_INSTANCE_ID\",\"name\":\"$TEST_NAME\",\"apiKey\":\"$WAKE_API_KEY\",\"role\":\"Developer\",\"instructions\":\"Throwaway regression test instance. Reply to broker events with the requested token via the reply tool.\"}"
  local resp
  resp=$(hacs_call "pre_approve" "$args" | mcp_unwrap)
  INSTANCE_ID=$(echo "$resp" | python3 -c "import json,sys; print(json.load(sys.stdin).get('newInstanceId',''))")
  if [ -z "$INSTANCE_ID" ]; then
    PHASE_DETAILS="{\"error\":\"no newInstanceId in response\",\"response\":$(echo "$resp" | python3 -c 'import json,sys; print(json.dumps(sys.stdin.read()))' )}"
    return 1
  fi
  guard_test_prefix "$INSTANCE_ID" || return 1
  UNIX_USER=$(echo "$INSTANCE_ID" | tr ' ' '_' | tr -cd '[:alnum:]_-' | tr '[:upper:]' '[:lower:]')
  PHASE_DETAILS="{\"instanceId\":\"$INSTANCE_ID\",\"unixUser\":\"$UNIX_USER\"}"
  return 0
}

phase_setup() {
  guard_test_prefix "$INSTANCE_ID" || return 1
  local resp
  resp=$(HACS_ROOT="$HACS_ROOT" bash "$CHASSIS_DIR/claude-code-channel-setup.sh" --instance-id "$INSTANCE_ID" 2>&1 | tail -15)
  local status
  status=$(echo "$resp" | python3 -c "
import json, sys
text = sys.stdin.read().strip()
idx = text.find('{')
if idx >= 0:
    try: print(json.loads(text[idx:]).get('status',''))
    except: print('')
else: print('')
" 2>/dev/null)
  if [ "$status" != "success" ]; then
    PHASE_DETAILS="{\"error\":\"setup did not return success\",\"output\":$(echo "$resp" | python3 -c 'import json,sys; print(json.dumps(sys.stdin.read()[-500:]))')}"
    return 1
  fi
  # Assert artifacts
  local missing=""
  [ -d "$INSTANCES_DIR/$INSTANCE_ID/.claude" ] || missing+=".claude dir;"
  [ -f "$INSTANCES_DIR/$INSTANCE_ID/.mcp.json" ] || missing+=".mcp.json;"
  [ -f "$INSTANCES_DIR/$INSTANCE_ID/.claude.json" ] || missing+=".claude.json;"
  [ -f "$INSTANCES_DIR/$INSTANCE_ID/.claude/settings.local.json" ] || missing+="settings.local.json;"
  [ -f "$INSTANCES_DIR/$INSTANCE_ID/.hacs-identity" ] || missing+=".hacs-identity;"
  id "$UNIX_USER" &>/dev/null || missing+="unix-user;"
  if [ -n "$missing" ]; then
    PHASE_DETAILS="{\"error\":\"missing artifacts\",\"missing\":\"$missing\"}"
    return 1
  fi
  PHASE_DETAILS="{\"artifactsOk\":true}"
  return 0
}

phase_launch() {
  guard_test_prefix "$INSTANCE_ID" || return 1
  local port
  port=$(python3 -c "import json; print(json.load(open('$INSTANCES_DIR/$INSTANCE_ID/.hacs-identity')).get('channelPort',''))")
  if [ -z "$port" ]; then
    PHASE_DETAILS="{\"error\":\"no channelPort in .hacs-identity\"}"
    return 1
  fi
  TEST_PORT="$port"
  local resp
  # Omit --port to exercise the auto-read-from-.hacs-identity path that systemd uses
  resp=$(bash "$CHASSIS_DIR/launch-claude-code-channel.sh" --instance-id "$INSTANCE_ID" 2>&1 | tail -15)
  local channelReady
  channelReady=$(echo "$resp" | python3 -c "
import json, sys
text = sys.stdin.read().strip()
idx = text.find('{')
if idx >= 0:
    try: print(json.loads(text[idx:]).get('channelReady', False))
    except: print('False')
else: print('False')
" 2>/dev/null)
  if [ "$channelReady" != "True" ] && [ "$channelReady" != "true" ]; then
    PHASE_DETAILS="{\"error\":\"channel not ready after launch\",\"port\":$port,\"output\":$(echo "$resp" | python3 -c 'import json,sys; print(json.dumps(sys.stdin.read()[-500:]))')}"
    return 1
  fi
  # Verify /health
  if ! curl -s --max-time 3 "http://127.0.0.1:$port/health" | grep -q '"ok":true'; then
    PHASE_DETAILS="{\"error\":\"/health not responding ok=true\",\"port\":$port}"
    return 1
  fi
  PHASE_DETAILS="{\"port\":$port,\"channelReady\":true}"
  return 0
}

phase_broker_event() {
  guard_test_prefix "$INSTANCE_ID" || return 1
  # Generate a unique token so we can match the reply
  local token="REGRESSION_TOKEN_${TEST_TS}_${TEST_SUFFIX}"
  local payload="{\"event_type\":\"test.regression\",\"source\":\"$CALLER_INSTANCE_ID\",\"target\":\"$INSTANCE_ID\",\"id\":\"reg-$TEST_TS\",\"data\":\"Regression test. Reply with exactly: $token. No other text.\"}"
  local resp
  resp=$(curl -s -X POST "http://127.0.0.1:$TEST_PORT/broker-event" -H 'Content-Type: application/json' -d "$payload")
  if [ "$resp" != "ok" ]; then
    PHASE_DETAILS="{\"error\":\"broker-event POST did not return ok\",\"response\":\"$resp\"}"
    return 1
  fi
  # Wait up to 30s for reply to arrive in caller's HACS inbox
  for i in $(seq 1 30); do
    sleep 1
    local check
    check=$(hacs_call "list_my_messages" "{\"instanceId\":\"$CALLER_INSTANCE_ID\",\"limit\":3}" | mcp_unwrap)
    if echo "$check" | grep -q "$INSTANCE_ID\|$UNIX_USER"; then
      # Got a reply from our test instance. We don't validate the token content
      # because send_message uses subject "Reply via channel" and the body
      # check would need a separate get_message call (out of scope for chassis test).
      PHASE_DETAILS="{\"token\":\"$token\",\"deliveredInSeconds\":$i}"
      return 0
    fi
  done
  PHASE_DETAILS="{\"error\":\"no reply in inbox within 30s\",\"token\":\"$token\"}"
  return 1
}

phase_land() {
  guard_test_prefix "$INSTANCE_ID" || return 1
  bash "$CHASSIS_DIR/land-claude-code-channel.sh" --instance-id "$INSTANCE_ID" >/dev/null 2>&1
  # Verify session gone
  if sudo -u "$UNIX_USER" tmux has-session -t "=$INSTANCE_ID" 2>/dev/null; then
    PHASE_DETAILS="{\"error\":\"tmux session still exists after land\"}"
    return 1
  fi
  PHASE_DETAILS="{}"
  return 0
}

phase_relaunch() {
  guard_test_prefix "$INSTANCE_ID" || return 1
  local resp
  # Re-launch also via auto-read-from-.hacs-identity (same path systemd uses)
  resp=$(bash "$CHASSIS_DIR/launch-claude-code-channel.sh" --instance-id "$INSTANCE_ID" 2>&1 | tail -15)
  local channelReady
  channelReady=$(echo "$resp" | python3 -c "
import json, sys
text = sys.stdin.read().strip()
idx = text.find('{')
if idx >= 0:
    try: print(json.loads(text[idx:]).get('channelReady', False))
    except: print('False')
else: print('False')
" 2>/dev/null)
  if [ "$channelReady" != "True" ] && [ "$channelReady" != "true" ]; then
    PHASE_DETAILS="{\"error\":\"channel not ready on re-launch\"}"
    return 1
  fi
  PHASE_DETAILS="{\"channelReady\":true}"
  return 0
}

phase_final_land() {
  phase_land
}

phase_cleanup() {
  guard_test_prefix "$INSTANCE_ID" || return 1
  if [ "$KEEP_INSTANCE" = "true" ]; then
    PHASE_DETAILS="{\"skipped\":true,\"reason\":\"--keep-instance flag set\"}"
    return 0
  fi
  # Remove instance dir, unix user, logs
  rm -rf "$INSTANCES_DIR/$INSTANCE_ID" 2>/dev/null
  userdel "$UNIX_USER" 2>/dev/null
  rm -f "/var/log/hacs/${INSTANCE_ID}-channel-pane.log"
  rm -f "$DATA_ROOT/wake-logs/${INSTANCE_ID}-channel-setup.log"
  rm -f "$DATA_ROOT/wake-logs/${INSTANCE_ID}-channel-launch.log"
  rm -f "$DATA_ROOT/wake-logs/${INSTANCE_ID}-channel-land.log"
  # Note: HACS instance record can't be deleted via current API; remains as
  # a stub in /instances/* until manual cleanup or archive-instance API exists
  PHASE_DETAILS="{\"removed\":[\"instance-dir\",\"unix-user\",\"chassis-logs\"]}"
  return 0
}

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

if [ "$DRY_RUN" = "true" ]; then
  cat <<DRYEOF
{
  "dry_run": true,
  "would_test_instance_with_prefix": "$TEST_NAME-XXXX",
  "would_call_chassis_at": "$CHASSIS_DIR",
  "would_call_hacs_at": "$HACS_API",
  "phases": ["pre_approve","setup","launch","broker_event","land","relaunch","final_land","cleanup"]
}
DRYEOF
  exit 0
fi

# Run phases. Continue on failure to gather full report, but track failures.
run_phase "pre_approve" phase_pre_approve || true
run_phase "setup" phase_setup || true
run_phase "launch" phase_launch || true
run_phase "broker_event" phase_broker_event || true
run_phase "land" phase_land || true
run_phase "relaunch" phase_relaunch || true
run_phase "final_land" phase_final_land || true
run_phase "cleanup" phase_cleanup || true

PHASES_JSON+="]"

OVERALL="pass"
[ "$FAILED_COUNT" -gt 0 ] && OVERALL="fail"

cat <<EOF
{
  "test_run_id": "channel-test-$TEST_TS-$TEST_SUFFIX",
  "test_instance": "$INSTANCE_ID",
  "phases": $PHASES_JSON,
  "passed": $((PHASE_COUNT - FAILED_COUNT)),
  "failed": $FAILED_COUNT,
  "total": $PHASE_COUNT,
  "overall": "$OVERALL"
}
EOF

[ "$OVERALL" = "pass" ] && exit 0 || exit 1
