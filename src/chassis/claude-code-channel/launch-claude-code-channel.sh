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
#   --port          Channel port (optional — defaults to value in
#                   $INSTANCE_DIR/.hacs-identity allocated by setup. Pass
#                   explicitly only to override.)
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
RESUME_SESSION=""
RUN_CANARY=true
CANARY_TIMEOUT=90
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

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
    --resume)
      RESUME_SESSION="$2"
      shift 2
      ;;
    --no-canary)
      # Skip the delivery proof. For automated harnesses that drive many
      # launches and check hearing themselves. NOT for production wakes:
      # without it, this script can only tell you a port is open.
      RUN_CANARY=false
      shift
      ;;
    --canary-timeout)
      CANARY_TIMEOUT="$2"
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

INSTANCE_DIR="$INSTANCES_DIR/$INSTANCE_ID"
UNIX_USER=$(echo "$INSTANCE_ID" | tr ' ' '_' | tr -cd '[:alnum:]_-')

# Resolve port: explicit --port wins, else read from .hacs-identity that
# setup wrote. This makes systemd invocation simple: just --instance-id %i.
if [ -z "$CHANNEL_PORT" ]; then
  IDENTITY_FILE="$INSTANCE_DIR/.hacs-identity"
  if [ -f "$IDENTITY_FILE" ]; then
    CHANNEL_PORT=$(python3 -c "import json; print(json.load(open('$IDENTITY_FILE')).get('channelPort',''))" 2>/dev/null)
  fi
fi
if [ -z "$CHANNEL_PORT" ]; then
  echo '{"status":"error","message":"No --port given and no channelPort found in .hacs-identity. Run setup first."}' >&2
  exit 1
fi

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
    # LAND it, do not hand-kill it. This block used to run a bare
    # `tmux kill-session`, which is exactly the teardown that produced the
    # 2026-08-23 deaf-mind incident: a session relaunched over a
    # hand-killed predecessor comes back able to SEND but not RECEIVE —
    # tool calls work, /health is green, and every inbound message is
    # accepted and dropped. Nobody notices, because nothing says so.
    #
    # land-claude-code-channel.sh kills the session AND sweeps the stray
    # claude processes AND records what it did. The extra two seconds are
    # the cheapest insurance in this whole chassis.
    log "Live session detected — LANDING it properly before relaunch"
    if [ -x "$SCRIPT_DIR/land-claude-code-channel.sh" ]; then
      "$SCRIPT_DIR/land-claude-code-channel.sh" --instance-id "$INSTANCE_ID" >> "$LOG_FILE" 2>&1 \
        || log "WARNING: land script returned non-zero; continuing"
    else
      log "WARNING: land script not found at $SCRIPT_DIR — falling back to kill-session"
      log "WARNING: this is the teardown that caused the 2026-08-23 deaf-mind incident"
      sudo -u "$UNIX_USER" tmux kill-session -t "=$INSTANCE_ID" 2>> "$LOG_FILE" || true
    fi
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

# --resume <sessionId> continues an existing conversation instead of starting
# fresh. This is the "teleport": the instance keeps its context across a move
# from one Unix user (or machine) to another, provided the session .jsonl AND
# its sidecar dir have been copied into the target user's
# ~/.claude/projects/<cwd-slug>/. The slug is derived from the launch cwd, so
# an instance whose home IS its instance dir keeps the same slug — no rewrite
# needed. Without this flag a migrated instance wakes with no memory of itself.
RESUME_ARG=""
if [ -n "$RESUME_SESSION" ]; then
  RESUME_ARG="--resume $RESUME_SESSION"
  log "Resuming session $RESUME_SESSION"
fi

sudo -u "$UNIX_USER" tmux new-session -d -s "$INSTANCE_ID" -c "$INSTANCE_DIR" \
  "$CLAUDE_BIN $RESUME_ARG --dangerously-skip-permissions --dangerously-load-development-channels server:hacs-channel" \
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

# ---------------------------------------------------------------------------
# 4b. Prove the mind can HEAR — /health is an artifact, not a transaction
# ---------------------------------------------------------------------------
# On 2026-08-23 this script reported "Channel server ready after 2s" and
# "status: success" over a session whose inbound notification leg was DEAD.
# It stayed dead for four hours; /direct-message returned {"ok":true} the
# whole time and ~10 minutes of the human's typing was lost. A listening
# socket proves the channel PROCESS started. It says nothing about whether a
# notification reaches the mind. So we now send a nonce and DERIVE delivery
# from the transcript before anyone is told this worked.
CHANNEL_HEARING="unknown"
if [ "$CHANNEL_READY" = true ] && [ "$RUN_CANARY" = true ]; then
  log "Canary: proving inbound delivery (deriving from transcript, not /health)..."
  if "$SCRIPT_DIR/channel-canary.sh" --instance-id "$INSTANCE_ID" \
       --port "$CHANNEL_PORT" --timeout "$CANARY_TIMEOUT" --quiet >> "$LOG_FILE" 2>&1; then
    CHANNEL_HEARING="true"
    log "Canary: HEARING — inbound delivery derived"
  else
    rc=$?
    CHANNEL_HEARING="false"
    log "Canary: DEAF (rc=$rc) — channel accepts messages but the mind never receives them."
    log "Canary: most likely cause is relaunching over a session that was killed by hand"
    log "Canary: instead of landed. Remedy: land-claude-code-channel.sh, then relaunch."
  fi
fi

# status must never be "success" over a mind that cannot hear.
LAUNCH_STATUS="success"
LAUNCH_MSG="Channel-enabled session running. Channel ready: $CHANNEL_READY."
if [ "$CHANNEL_HEARING" = "false" ]; then
  LAUNCH_STATUS="degraded"
  LAUNCH_MSG="Session is RUNNING but DEAF: inbound messages are accepted and dropped. Run land-claude-code-channel.sh then relaunch. Do NOT trust /health here."
fi

log "=== Channel chassis launch complete (status=$LAUNCH_STATUS, hearing=$CHANNEL_HEARING) ==="

# ---------------------------------------------------------------------------
# Output (JSON — last line, parsed by Node launcher)
# ---------------------------------------------------------------------------
cat << EOF
{
  "status": "$LAUNCH_STATUS",
  "instanceId": "$INSTANCE_ID",
  "tmuxSession": "$INSTANCE_ID",
  "unixUser": "$UNIX_USER",
  "channelPort": $CHANNEL_PORT,
  "channelReady": $CHANNEL_READY,
  "channelHearing": "$CHANNEL_HEARING",
  "paneLog": "$PANE_LOG",
  "attachCommand": "sudo -u $UNIX_USER tmux attach -t $INSTANCE_ID",
  "killCommand": "$SCRIPT_DIR/land-claude-code-channel.sh --instance-id $INSTANCE_ID",
  "forceKillCommand": "sudo -u $UNIX_USER tmux kill-session -t $INSTANCE_ID",
  "forceKillWarning": "DANGEROUS: hand-killing tmux instead of landing is what caused the 2026-08-23 deaf-mind incident. The relaunched session can send but not receive, and every instrument reports healthy. Use killCommand (land) unless you know why you are not.",
  "landCommand": "$SCRIPT_DIR/land-claude-code-channel.sh --instance-id $INSTANCE_ID",
  "healthUrl": "http://127.0.0.1:$CHANNEL_PORT/health",
  "canaryCommand": "$SCRIPT_DIR/channel-canary.sh --instance-id $INSTANCE_ID",
  "message": "$LAUNCH_MSG"
}
EOF
