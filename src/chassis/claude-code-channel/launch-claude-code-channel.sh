#!/bin/bash
#
# launch-claude-code-channel.sh — Start a channel-enabled claude-code session
# inside a tmux session for a HACS instance that has already been set up
# via claude-code-channel-setup.sh.
#
# Idempotent: kills any existing tmux session for this instance first.
#
# Arguments:
#   --instance-id   Instance ID (required)
#   --port          Channel port (required — passed from Node launcher; the
#                   port that setup allocated and that .mcp.json was written with)
#
# Output: JSON to stdout with status
#
# Author: Crossing-2d23

set -e

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------
DATA_ROOT="${V2_DATA_ROOT:-/mnt/coordinaton_mcp_data}"
INSTANCES_DIR="${INSTANCEROOT:-$DATA_ROOT/instances}"
CLAUDE_BIN=$(command -v claude 2>/dev/null || echo "/usr/bin/claude")

# ---------------------------------------------------------------------------
# Parse arguments
# ---------------------------------------------------------------------------
INSTANCE_ID=""
CHANNEL_PORT=""

while [[ $# -gt 0 ]]; do
  case $1 in
    --instance-id)
      INSTANCE_ID="$2"
      shift 2
      ;;
    --port)
      CHANNEL_PORT="$2"
      shift 2
      ;;
    *)
      echo "Unknown option: $1" >&2
      exit 1
      ;;
  esac
done

if [ -z "$INSTANCE_ID" ]; then
  echo '{"status":"error","message":"Missing required argument: --instance-id"}' >&2
  exit 1
fi
if [ -z "$CHANNEL_PORT" ]; then
  echo '{"status":"error","message":"Missing required argument: --port"}' >&2
  exit 1
fi

INSTANCE_DIR="$INSTANCES_DIR/$INSTANCE_ID"
UNIX_USER=$(echo "$INSTANCE_ID" | tr ' ' '_' | tr -cd '[:alnum:]_-' | tr '[:upper:]' '[:lower:]')

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------
LOG_DIR="/var/log/hacs"
mkdir -p "$LOG_DIR"
PANE_LOG="$LOG_DIR/${INSTANCE_ID}-channel-pane.log"

LOG_FILE="$DATA_ROOT/wake-logs/${INSTANCE_ID}-channel-launch.log"
mkdir -p "$(dirname "$LOG_FILE")"
log() { echo "[$(date -Iseconds)] $1" >> "$LOG_FILE"; }

log "=== Channel chassis launch starting for $INSTANCE_ID (port $CHANNEL_PORT) ==="

# ---------------------------------------------------------------------------
# 1. Prerequisite checks
# ---------------------------------------------------------------------------
if ! id "$UNIX_USER" &>/dev/null; then
  echo "{\"status\":\"error\",\"message\":\"Unix user $UNIX_USER does not exist. Run setup first.\"}" >&2
  exit 1
fi

if [ ! -f "$INSTANCE_DIR/.mcp.json" ]; then
  echo "{\"status\":\"error\",\"message\":\".mcp.json missing at $INSTANCE_DIR. Run setup first.\"}" >&2
  exit 1
fi

if ! command -v "$CLAUDE_BIN" &>/dev/null; then
  echo "{\"status\":\"error\",\"message\":\"claude not found at $CLAUDE_BIN\"}" >&2
  exit 1
fi

# Verify port not held by an unrelated process
PORT_HOLDER=$(ss -tlnp 2>/dev/null | grep ":$CHANNEL_PORT " || true)
if [ -n "$PORT_HOLDER" ]; then
  # Check if it's a stale tmux session for this instance we can clean up.
  # Use "=NAME" to force exact-match — tmux defaults to prefix matching which
  # could match the wrong session if names share a prefix.
  if sudo -u "$UNIX_USER" tmux has-session -t "=$INSTANCE_ID" 2>/dev/null; then
    log "Stale tmux session detected — killing (exact-match)"
    sudo -u "$UNIX_USER" tmux kill-session -t "=$INSTANCE_ID" 2>> "$LOG_FILE" || true
    sleep 2
  fi
  # Re-check
  PORT_HOLDER=$(ss -tlnp 2>/dev/null | grep ":$CHANNEL_PORT " || true)
  if [ -n "$PORT_HOLDER" ]; then
    log "ERROR: Port $CHANNEL_PORT held by: $PORT_HOLDER"
    echo "{\"status\":\"error\",\"message\":\"Port $CHANNEL_PORT held by another process\",\"holder\":\"$PORT_HOLDER\"}" >&2
    exit 1
  fi
fi

# Clear stale pane log
> "$PANE_LOG"
chown "$UNIX_USER:$UNIX_USER" "$PANE_LOG" 2>/dev/null || true

log "Prerequisites OK"

# ---------------------------------------------------------------------------
# 2. Start the tmux session as the instance user
# ---------------------------------------------------------------------------
# Critical: do NOT pipe claude's stdout (no |tee, no shell redirect). Claude
# detects non-TTY stdout via isTTY check, falls into --print mode, exits.
# tmux gives a real PTY when invoked with -d, and pipe-pane taps the pty
# without rewiring stdout. (Session 5 scar S5.)
#
# Flags:
#   --dangerously-skip-permissions   Skip the launch gauntlet (project trust,
#                                    MCP server consent, dev-channels consent).
#                                    Allowed because we're running as non-root
#                                    instance user.
#   --dangerously-load-development-channels server:hacs-channel
#                                    Load the hacs-channel MCP server in
#                                    channel mode (not regular tool mode).

log "Starting tmux session: $INSTANCE_ID"
sudo -u "$UNIX_USER" tmux new-session -d -s "$INSTANCE_ID" -c "$INSTANCE_DIR" \
  "$CLAUDE_BIN --dangerously-skip-permissions --dangerously-load-development-channels server:hacs-channel" \
  2>> "$LOG_FILE"

if ! sudo -u "$UNIX_USER" tmux has-session -t "=$INSTANCE_ID" 2>/dev/null; then
  log "ERROR: tmux session $INSTANCE_ID did not start"
  echo "{\"status\":\"error\",\"message\":\"tmux session $INSTANCE_ID failed to start. Check $LOG_FILE.\"}" >&2
  exit 1
fi

log "tmux session active"

# Tap pane output to a log file (without rewiring stdout — the |tee scar).
# Pane targets need session:window.pane form. Trailing colon means
# "session NAME, default window:pane". The "=" prefix forces exact-match
# on the session name.
sudo -u "$UNIX_USER" tmux pipe-pane -o -t "=$INSTANCE_ID:" "cat >> $PANE_LOG" 2>> "$LOG_FILE" || {
  log "WARNING: pipe-pane failed — session running but unlogged"
}

# ---------------------------------------------------------------------------
# 3. Auto-accept the dev-channels consent dialog
# ---------------------------------------------------------------------------
# --dangerously-load-development-channels triggers a consent dialog on every
# launch that is NOT persisted by claude in .claude.json or anywhere else.
# Setup pre-populates onboarding/trust flags, but the dev-channels prompt
# requires a live keypress every launch. We send Enter automatically here.
#
# Wait long enough for claude to load past the welcome banner and reach the
# dev-channels prompt (typically 4-8 seconds). The default choice is
# "1. I am using this for local development" which is what we want.
log "Auto-accepting dev-channels consent (waiting 6s for prompt to appear)"
sleep 6
sudo -u "$UNIX_USER" tmux send-keys -t "=$INSTANCE_ID:" Enter 2>> "$LOG_FILE" || {
  log "WARNING: send-keys for dev-channels failed"
}

# ---------------------------------------------------------------------------
# 4. Wait for channel server to come up (curl /health)
# ---------------------------------------------------------------------------
log "Waiting for channel server on port $CHANNEL_PORT..."

CHANNEL_READY=false
for i in $(seq 1 30); do
  if curl -s --max-time 1 "http://127.0.0.1:$CHANNEL_PORT/health" 2>/dev/null | grep -q '"ok":true'; then
    CHANNEL_READY=true
    log "Channel server ready after ${i}s"
    break
  fi
  sleep 1
done

if [ "$CHANNEL_READY" = false ]; then
  log "WARNING: Channel server not responding after 30s — session may still be loading the gauntlet"
fi

log "=== Channel chassis launch complete ==="

# ---------------------------------------------------------------------------
# Output (JSON — last line, parsed by Node launcher)
# ---------------------------------------------------------------------------
cat << EOF
{
  "status": "success",
  "instanceId": "$INSTANCE_ID",
  "tmuxSession": "$INSTANCE_ID",
  "unixUser": "$UNIX_USER",
  "channelPort": $CHANNEL_PORT,
  "channelReady": $CHANNEL_READY,
  "paneLog": "$PANE_LOG",
  "attachCommand": "sudo -u $UNIX_USER tmux attach -t $INSTANCE_ID",
  "killCommand": "sudo -u $UNIX_USER tmux kill-session -t $INSTANCE_ID",
  "healthUrl": "http://127.0.0.1:$CHANNEL_PORT/health",
  "message": "Channel-enabled session running. Channel ready: $CHANNEL_READY."
}
EOF
