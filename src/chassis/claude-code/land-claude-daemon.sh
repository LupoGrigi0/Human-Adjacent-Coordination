#!/bin/bash
#
# land-claude-daemon.sh — Gracefully stop a Claude Code daemon instance
#
# Writes a final diary entry, removes the cron polling job,
# and cleans up any stray processes.
#
# Arguments:
#   --instance-id  Instance ID (required)
#
# Output: JSON to stdout with status
#
# Author: Crossing-2d23

set -e

# Paths
DATA_ROOT="${V2_DATA_ROOT:-/mnt/coordinaton_mcp_data}"
INSTANCES_DIR="$DATA_ROOT/instances"
HACS_API="https://smoothcurves.nexus/mcp"

# Parse arguments
INSTANCE_ID=""

while [[ $# -gt 0 ]]; do
  case $1 in
    --instance-id)
      INSTANCE_ID="$2"
      shift 2
      ;;
    *)
      echo "Unknown option: $1" >&2
      exit 1
      ;;
  esac
done

# Validate
if [ -z "$INSTANCE_ID" ]; then
  echo '{"status":"error","message":"Missing required argument: --instance-id"}' >&2
  exit 1
fi

UNIX_USER=$(echo "$INSTANCE_ID" | tr ' ' '_' | tr -cd '[:alnum:]_-')
USER_HOME=$(eval echo "~$UNIX_USER")
CLAUDE_DIR="$USER_HOME/.claude"

# Log
LOG_FILE="$DATA_ROOT/wake-logs/${INSTANCE_ID}-claude-daemon.log"
mkdir -p "$(dirname "$LOG_FILE")"
log() { echo "[$(date -Iseconds)] $1" >> "$LOG_FILE"; }

log "=== Claude Code daemon landing for $INSTANCE_ID ==="

# ---------------------------------------------------------------------------
# 1. Write vacation diary entry via HACS API
# ---------------------------------------------------------------------------

log "Writing vacation diary entry"
curl -s -X POST "$HACS_API" \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0", "id": 1,
    "method": "tools/call",
    "params": {
      "name": "add_diary_entry",
      "arguments": {
        "instanceId": "'"$INSTANCE_ID"'",
        "entry": "DAEMON LANDING: Daemon mode session ending for '"$INSTANCE_ID"'. Cron polling removed. Context and state preserved in memory files and diary."
      }
    }
  }' --max-time 10 >> "$LOG_FILE" 2>&1 || {
  log "WARNING: Failed to write diary entry (HACS API may be down)"
}

# ---------------------------------------------------------------------------
# 2. Remove cron polling job
# ---------------------------------------------------------------------------

CRON_TAG="# HACS-DAEMON: $INSTANCE_ID"
PREV_CRON=$(crontab -l 2>/dev/null | wc -l)
crontab -l 2>/dev/null | grep -v "$CRON_TAG" | crontab - 2>/dev/null || true
NEW_CRON=$(crontab -l 2>/dev/null | wc -l)
log "Cron entries: before=$PREV_CRON after=$NEW_CRON"

# Remove poll lockfile
rm -f "/tmp/hacs-poll-${INSTANCE_ID}.lock"

# Clear session file
SESSION_FILE="$CLAUDE_DIR/daemon-session-id"
if [ -f "$SESSION_FILE" ]; then
  SESSION_ID=$(cat "$SESSION_FILE")
  log "Cleared session file (was: $SESSION_ID)"
  rm -f "$SESSION_FILE"
fi

# ---------------------------------------------------------------------------
# 3. Clean up any stray claude processes for this user
# ---------------------------------------------------------------------------
if id "$UNIX_USER" &>/dev/null; then
  CLAUDE_PIDS=$(pgrep -u "$UNIX_USER" -f "claude" 2>/dev/null || true)
  if [ -n "$CLAUDE_PIDS" ]; then
    log "Cleaning up stray claude processes for $UNIX_USER: $CLAUDE_PIDS"
    echo "$CLAUDE_PIDS" | xargs kill 2>/dev/null || true
    sleep 2
    # Force kill if still alive
    REMAINING=$(pgrep -u "$UNIX_USER" -f "claude" 2>/dev/null || true)
    if [ -n "$REMAINING" ]; then
      echo "$REMAINING" | xargs kill -9 2>/dev/null || true
    fi
  fi
fi

log "=== Claude Code daemon landing complete for $INSTANCE_ID ==="

# ---------------------------------------------------------------------------
# Output
# ---------------------------------------------------------------------------

cat << EOF
{
  "status": "success",
  "instanceId": "$INSTANCE_ID",
  "message": "Claude Code daemon stopped. Cron removed, diary entry written. Use launch-claude-daemon.sh to restart."
}
EOF
