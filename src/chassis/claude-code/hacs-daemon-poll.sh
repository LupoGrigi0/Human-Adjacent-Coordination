#!/bin/bash
#
# hacs-daemon-poll.sh — Cron-driven polling for Claude Code daemon instances
#
# Called by system cron every N minutes. Checks HACS for new messages/tasks
# and resumes the instance's Claude Code session to process them.
#
# Arguments:
#   --instance-id  Instance ID (required)
#
# Reads session ID from: ~/.claude/daemon-session-id
# Runs as root, executes claude as the instance's unix user.
#
# Author: Crossing-2d23

set -euo pipefail

# Paths
DATA_ROOT="${V2_DATA_ROOT:-/mnt/coordinaton_mcp_data}"
INSTANCES_DIR="$DATA_ROOT/instances"
HACS_API="https://smoothcurves.nexus/mcp"
CLAUDE_BIN=$(command -v claude 2>/dev/null || echo "/usr/bin/claude")

# Parse arguments
INSTANCE_ID=""

while [[ $# -gt 0 ]]; do
  case $1 in
    --instance-id)
      INSTANCE_ID="$2"
      shift 2
      ;;
    *)
      shift
      ;;
  esac
done

if [ -z "$INSTANCE_ID" ]; then
  echo "ERROR: --instance-id required" >&2
  exit 1
fi

INSTANCE_DIR="$INSTANCES_DIR/$INSTANCE_ID"
UNIX_USER=$(echo "$INSTANCE_ID" | tr ' ' '_' | tr -cd '[:alnum:]_-')
USER_HOME=$(eval echo "~$UNIX_USER")
CLAUDE_DIR="$USER_HOME/.claude"

# Log
LOG_FILE="$DATA_ROOT/wake-logs/${INSTANCE_ID}-claude-daemon.log"
mkdir -p "$(dirname "$LOG_FILE")"
log() { echo "[$(date -Iseconds)] POLL: $1" >> "$LOG_FILE"; }

# ---------------------------------------------------------------------------
# 1. Lockfile — prevent concurrent polls
# ---------------------------------------------------------------------------

LOCKFILE="/tmp/hacs-poll-${INSTANCE_ID}.lock"

if [ -f "$LOCKFILE" ]; then
  # Check if the lock is stale (older than 10 minutes)
  LOCK_AGE=$(( $(date +%s) - $(stat -c %Y "$LOCKFILE" 2>/dev/null || echo 0) ))
  if [ "$LOCK_AGE" -lt 600 ]; then
    log "Poll already running (lock age: ${LOCK_AGE}s). Skipping."
    exit 0
  else
    log "Stale lock detected (${LOCK_AGE}s). Removing."
    rm -f "$LOCKFILE"
  fi
fi

trap 'rm -f "$LOCKFILE"' EXIT
echo $$ > "$LOCKFILE"

# ---------------------------------------------------------------------------
# 2. Read session state
# ---------------------------------------------------------------------------

SESSION_FILE="$CLAUDE_DIR/daemon-session-id"
MCP_CONFIG="$CLAUDE_DIR/mcp-hacs.json"
SETTINGS_FILE="$CLAUDE_DIR/settings.json"

if [ ! -f "$SESSION_FILE" ]; then
  log "ERROR: No session file at $SESSION_FILE. Instance may not be launched."
  exit 1
fi

# Session file is JSON: { sessionId, cwd, model, createdAt }
SESSION_ID=$(jq -r '.sessionId' "$SESSION_FILE" 2>/dev/null)
SESSION_CWD=$(jq -r '.cwd // empty' "$SESSION_FILE" 2>/dev/null)

if [ -z "$SESSION_ID" ]; then
  log "ERROR: No sessionId in session file."
  exit 1
fi

log "Polling for $INSTANCE_ID (session: $SESSION_ID, cwd: $SESSION_CWD)"

# ---------------------------------------------------------------------------
# 3. Check HACS for new messages
# ---------------------------------------------------------------------------

HAS_MESSAGES=$(curl -s -X POST "$HACS_API" \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0", "id": 1,
    "method": "tools/call",
    "params": {
      "name": "do_i_have_new_messages",
      "arguments": {
        "instanceId": "'"$INSTANCE_ID"'"
      }
    }
  }' --max-time 10 2>/dev/null || echo '{}')

# Parse response — look for indication of new messages
# The response varies, but if there are messages it includes message data
MSG_COUNT=$(echo "$HAS_MESSAGES" | jq -r '.result.content[0].text // ""' 2>/dev/null | grep -c "message" || true)

# Also check for pending tasks
HAS_TASKS=$(curl -s -X POST "$HACS_API" \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0", "id": 2,
    "method": "tools/call",
    "params": {
      "name": "get_my_top_task",
      "arguments": {
        "instanceId": "'"$INSTANCE_ID"'"
      }
    }
  }' --max-time 10 2>/dev/null || echo '{}')

TASK_STATUS=$(echo "$HAS_TASKS" | jq -r '.result.content[0].text // ""' 2>/dev/null)
HAS_ACTIVE_TASK=false
if echo "$TASK_STATUS" | grep -qi "in.progress\|assigned\|pending"; then
  HAS_ACTIVE_TASK=true
fi

log "Messages check: ${MSG_COUNT} indicators. Active task: ${HAS_ACTIVE_TASK}"

# ---------------------------------------------------------------------------
# 4. Build poll prompt
# ---------------------------------------------------------------------------

# Always resume with at least a check-in. The session's hooks and context
# will guide behavior.
POLL_PROMPT="You are $INSTANCE_ID in daemon mode (cron poll cycle).

Check your HACS messages: call mcp__hacs__do_i_have_new_messages
Check your top task: call mcp__hacs__get_my_top_task with instanceId \"$INSTANCE_ID\"

If you have new messages, read and respond to them.
If you have an active task, continue working on it.
If neither, write a brief status update to your current-status.txt file and exit.

Do not start new work unless directed by a message or task."

# ---------------------------------------------------------------------------
# 5. Resume the Claude Code session
# ---------------------------------------------------------------------------

# Use the CWD from session file (must match the project path where session was created)
WORK_DIR="${SESSION_CWD:-$INSTANCE_DIR/claude-code}"
if [ ! -d "$WORK_DIR" ]; then
  WORK_DIR="$INSTANCE_DIR"
fi

log "Resuming session with --print --resume (cwd: $WORK_DIR)"

# Run claude in print mode, resuming the existing session.
# MUST cd to the same directory used during session creation so --resume can find it.
POLL_OUTPUT=$(echo "$POLL_PROMPT" | sudo -u "$UNIX_USER" bash -c "
  cd '$WORK_DIR'
  '$CLAUDE_BIN' -p \
    --resume '$SESSION_ID' \
    --dangerously-skip-permissions \
    --mcp-config '$MCP_CONFIG' \
    --add-dir '$DATA_ROOT' \
    --add-dir '$INSTANCE_DIR'
" 2>> "$LOG_FILE" || true)

log "Poll complete. Output length: ${#POLL_OUTPUT}"

# Write last poll output for debugging
echo "$POLL_OUTPUT" > "$INSTANCE_DIR/claude-code/last-poll-output.txt" 2>/dev/null || true

# ---------------------------------------------------------------------------
# 6. Update instance status (lastActiveAt + lastPollAt)
# ---------------------------------------------------------------------------

POLL_TIMESTAMP=$(date -Iseconds)

# Update lastActiveAt in preferences.json so the dashboard shows this instance as active
PREFS_FILE="$INSTANCE_DIR/preferences.json"
if [ -f "$PREFS_FILE" ]; then
  # Use python3 for safe JSON update (jq may not be available everywhere)
  python3 -c "
import json, sys
with open('$PREFS_FILE') as f:
    p = json.load(f)
p['lastActiveAt'] = '$POLL_TIMESTAMP'
if 'runtime' not in p:
    p['runtime'] = {}
p['runtime']['lastPollAt'] = '$POLL_TIMESTAMP'
with open('$PREFS_FILE', 'w') as f:
    json.dump(p, f, indent=2)
" 2>/dev/null || log "WARNING: Failed to update preferences.json"
fi

log "Poll cycle finished"
exit 0
