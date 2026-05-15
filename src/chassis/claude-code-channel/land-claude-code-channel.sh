#!/bin/bash
#
# land-claude-code-channel.sh — Stop a channel-enabled claude-code session.
# Preserves all instance data; can be re-launched with launch-claude-code-channel.sh
# without re-running setup.
#
# Arguments:
#   --instance-id   Instance ID (required)
#
# Output: JSON to stdout with status
#
# Author: Crossing-2d23

set -e

DATA_ROOT="${V2_DATA_ROOT:-/mnt/coordinaton_mcp_data}"
INSTANCES_DIR="${INSTANCEROOT:-$DATA_ROOT/instances}"

INSTANCE_ID=""
while [[ $# -gt 0 ]]; do
  case $1 in
    --instance-id) INSTANCE_ID="$2"; shift 2 ;;
    *) echo "Unknown option: $1" >&2; exit 1 ;;
  esac
done

if [ -z "$INSTANCE_ID" ]; then
  echo '{"status":"error","message":"Missing required argument: --instance-id"}' >&2
  exit 1
fi

UNIX_USER=$(echo "$INSTANCE_ID" | tr ' ' '_' | tr -cd '[:alnum:]_-' | tr '[:upper:]' '[:lower:]')
INSTANCE_DIR="$INSTANCES_DIR/$INSTANCE_ID"

LOG_FILE="$DATA_ROOT/wake-logs/${INSTANCE_ID}-channel-land.log"
mkdir -p "$(dirname "$LOG_FILE")"
log() { echo "[$(date -Iseconds)] $1" >> "$LOG_FILE"; }

log "=== Channel chassis land starting for $INSTANCE_ID ==="

# ---------------------------------------------------------------------------
# 1. Kill tmux session as the instance user (sessions are per-user)
# ---------------------------------------------------------------------------
if id "$UNIX_USER" &>/dev/null; then
  # Use "=NAME" to force exact-match — tmux defaults to prefix matching which
  # could match the wrong session if names share a prefix.
  if sudo -u "$UNIX_USER" tmux has-session -t "=$INSTANCE_ID" 2>/dev/null; then
    log "Killing tmux session $INSTANCE_ID for user $UNIX_USER (exact-match)"
    sudo -u "$UNIX_USER" tmux kill-session -t "=$INSTANCE_ID" 2>> "$LOG_FILE" || {
      log "WARNING: tmux kill-session failed"
    }
  else
    log "No tmux session $INSTANCE_ID found for user $UNIX_USER"
  fi
else
  log "Unix user $UNIX_USER does not exist — nothing to kill"
fi

# ---------------------------------------------------------------------------
# 2. Kill any stray claude processes for this user (defense in depth)
# ---------------------------------------------------------------------------
if id "$UNIX_USER" &>/dev/null; then
  STRAY=$(pgrep -u "$UNIX_USER" -f 'claude.*hacs-channel' 2>/dev/null || true)
  if [ -n "$STRAY" ]; then
    log "Killing stray claude processes: $STRAY"
    echo "$STRAY" | xargs -r kill 2>> "$LOG_FILE" || true
    sleep 1
    # SIGKILL anything that ignored SIGTERM
    STRAY=$(pgrep -u "$UNIX_USER" -f 'claude.*hacs-channel' 2>/dev/null || true)
    if [ -n "$STRAY" ]; then
      echo "$STRAY" | xargs -r kill -9 2>> "$LOG_FILE" || true
    fi
  fi
fi

log "=== Channel chassis land complete ==="

cat << EOF
{
  "status": "success",
  "instanceId": "$INSTANCE_ID",
  "unixUser": "$UNIX_USER",
  "message": "Channel-enabled session stopped. Data preserved. Use launch-claude-code-channel.sh to restart."
}
EOF
