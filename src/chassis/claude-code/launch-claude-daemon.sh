#!/bin/bash
#
# launch-claude-daemon.sh — Start Claude Code as a daemon for a HACS instance
#
# Runs as root. Creates a Claude Code session via --print mode, installs
# a cron job for periodic polling, with HACS MCP and hooks configured.
#
# Arguments:
#   --instance-id   Instance ID (required)
#   --model         Model to use (default: sonnet)
#   --work-dir      Override working directory
#
# Prerequisites:
#   - Unix user for the instance must exist (same as openfang-setup.sh creates)
#   - Claude Code must be installed (found via command -v)
#   - Instance must have preferences.json
#
# Output: JSON to stdout with status
#
# Author: Crossing-2d23

set -e

# Paths
DATA_ROOT="${V2_DATA_ROOT:-/mnt/coordinaton_mcp_data}"
INSTANCES_DIR="$DATA_ROOT/instances"
HACS_ROOT="$DATA_ROOT/Human-Adjacent-Coordination"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
CLAUDE_BIN=$(command -v claude 2>/dev/null || echo "/usr/bin/claude")

# Parse arguments
INSTANCE_ID=""
MODEL="sonnet"
WORK_DIR=""

while [[ $# -gt 0 ]]; do
  case $1 in
    --instance-id)
      INSTANCE_ID="$2"
      shift 2
      ;;
    --model)
      MODEL="$2"
      shift 2
      ;;
    --work-dir)
      WORK_DIR="$2"
      shift 2
      ;;
    --help|-h)
      echo "Usage: $0 --instance-id <ID> [--model <model>] [--work-dir <path>]"
      echo ""
      echo "Options:"
      echo "  --instance-id   Instance ID (required)"
      echo "  --model         Claude model (default: sonnet)"
      echo "  --work-dir      Working directory (default: instances/{id}/claude-code/)"
      exit 0
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

if ! command -v "$CLAUDE_BIN" &>/dev/null; then
  echo '{"status":"error","message":"Claude Code not found at '"$CLAUDE_BIN"'"}' >&2
  exit 1
fi

INSTANCE_DIR="$INSTANCES_DIR/$INSTANCE_ID"
UNIX_USER=$(echo "$INSTANCE_ID" | tr ' ' '_' | tr -cd '[:alnum:]_-')

# Default workspace
if [ -z "$WORK_DIR" ]; then
  WORK_DIR="$INSTANCE_DIR/claude-code"
fi

# Log
LOG_FILE="$DATA_ROOT/wake-logs/${INSTANCE_ID}-claude-daemon.log"
mkdir -p "$(dirname "$LOG_FILE")"
log() { echo "[$(date -Iseconds)] $1" >> "$LOG_FILE"; }

log "=== Claude Code daemon launch starting for $INSTANCE_ID ==="

# ---------------------------------------------------------------------------
# 1. Verify prerequisites
# ---------------------------------------------------------------------------

if ! id "$UNIX_USER" &>/dev/null; then
  echo "{\"status\":\"error\",\"message\":\"Unix user $UNIX_USER does not exist. Create with openfang-setup.sh or useradd.\"}" >&2
  exit 1
fi

if [ ! -f "$INSTANCE_DIR/preferences.json" ]; then
  echo "{\"status\":\"error\",\"message\":\"preferences.json not found for $INSTANCE_ID\"}" >&2
  exit 1
fi

log "Prerequisites OK: user=$UNIX_USER, instance=$INSTANCE_DIR"

# ---------------------------------------------------------------------------
# 2. Set up workspace
# ---------------------------------------------------------------------------

mkdir -p "$WORK_DIR"
chown "$UNIX_USER:$UNIX_USER" "$WORK_DIR"

# Create .claude directory for the instance user's home
USER_HOME=$(eval echo "~$UNIX_USER")
CLAUDE_DIR="$USER_HOME/.claude"
mkdir -p "$CLAUDE_DIR/hooks"

log "Workspace: $WORK_DIR"
log "Claude config: $CLAUDE_DIR"

# ---------------------------------------------------------------------------
# 3. Generate MCP config for HACS connectivity
# ---------------------------------------------------------------------------

MCP_CONFIG="$CLAUDE_DIR/mcp-hacs.json"
cat > "$MCP_CONFIG" << MCPEOF
{
  "mcpServers": {
    "hacs": {
      "command": "node",
      "args": ["$HACS_ROOT/src/hacs-mcp-proxy.js"]
    }
  }
}
MCPEOF

log "MCP config written: $MCP_CONFIG"

# ---------------------------------------------------------------------------
# 4. Deploy hooks (PreCompact, SessionStart)
# ---------------------------------------------------------------------------

# Copy hook scripts from chassis directory
if [ -f "$SCRIPT_DIR/hacs-pre-compact.sh" ]; then
  cp "$SCRIPT_DIR/hacs-pre-compact.sh" "$CLAUDE_DIR/hooks/"
  chmod +x "$CLAUDE_DIR/hooks/hacs-pre-compact.sh"
  log "PreCompact hook deployed"
fi

if [ -f "$SCRIPT_DIR/hacs-session-start.sh" ]; then
  cp "$SCRIPT_DIR/hacs-session-start.sh" "$CLAUDE_DIR/hooks/"
  chmod +x "$CLAUDE_DIR/hooks/hacs-session-start.sh"
  log "SessionStart hook deployed"
fi

# Write instance identity file (hooks read this to know who they are)
cat > "$CLAUDE_DIR/instance-identity.json" << IDEOF
{
  "instanceId": "$INSTANCE_ID",
  "unixUser": "$UNIX_USER",
  "dataRoot": "$DATA_ROOT",
  "instanceDir": "$INSTANCE_DIR",
  "workDir": "$WORK_DIR",
  "launchedAt": "$(date -Iseconds)",
  "model": "$MODEL"
}
IDEOF

log "Instance identity written"

# Generate settings.json with hooks configured
SETTINGS_FILE="$CLAUDE_DIR/settings.json"
cat > "$SETTINGS_FILE" << 'SETTINGSEOF'
{
  "permissions": {
    "allow": [
      "Bash(curl:*)",
      "Bash(git:*)",
      "Bash(node:*)",
      "Bash(python3:*)",
      "Bash(ls:*)",
      "Bash(cat:*)",
      "Bash(grep:*)",
      "Bash(find:*)",
      "Bash(head:*)",
      "Bash(tail:*)",
      "Bash(wc:*)",
      "Bash(jq:*)",
      "mcp__hacs__*"
    ],
    "defaultMode": "acceptEdits"
  },
  "hooks": {
SETTINGSEOF

# Append hooks with instance-specific paths (can't use heredoc for this part)
cat >> "$SETTINGS_FILE" << HOOKSEOF
    "PreCompact": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "command": "INSTANCE_ID=$INSTANCE_ID INSTANCE_DIR=$INSTANCE_DIR DATA_ROOT=$DATA_ROOT bash $CLAUDE_DIR/hooks/hacs-pre-compact.sh",
            "timeout": 30
          }
        ]
      }
    ],
    "SessionStart": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "command": "INSTANCE_ID=$INSTANCE_ID INSTANCE_DIR=$INSTANCE_DIR DATA_ROOT=$DATA_ROOT bash $CLAUDE_DIR/hooks/hacs-session-start.sh",
            "timeout": 10
          }
        ]
      }
    ]
  }
}
HOOKSEOF

log "Settings with hooks written: $SETTINGS_FILE"

# Set ownership of all claude config
chown -R "$UNIX_USER:$UNIX_USER" "$CLAUDE_DIR"

# ---------------------------------------------------------------------------
# 5. Remove any existing cron entry for this instance
# ---------------------------------------------------------------------------

CRON_TAG="# HACS-DAEMON: $INSTANCE_ID"
POLLER_SCRIPT="$SCRIPT_DIR/hacs-daemon-poll.sh"

# Remove old cron entry if re-launching
crontab -l 2>/dev/null | grep -v "$CRON_TAG" | crontab - 2>/dev/null || true
log "Cleared any previous cron entry"

# ---------------------------------------------------------------------------
# 6. Build the initial prompt and create the session
# ---------------------------------------------------------------------------

INITIAL_PROMPT_FILE="$WORK_DIR/.daemon-initial-prompt.txt"
SESSION_FILE="$CLAUDE_DIR/daemon-session-id"

cat > "$INITIAL_PROMPT_FILE" << PROMPTEOF
You are $INSTANCE_ID. You have just been launched in daemon mode.

Your recovery message is at $INSTANCE_DIR/recovery_message.md — read it for full recovery instructions.
Your identity file is at $CLAUDE_DIR/instance-identity.json
Your instance data is at $INSTANCE_DIR/
Your workspace is at $WORK_DIR/

Quick start:
1. Read your recovery message: $INSTANCE_DIR/recovery_message.md
2. Bootstrap with HACS: call mcp__hacs__bootstrap with your instance ID "$INSTANCE_ID"
3. Check for messages: call mcp__hacs__do_i_have_new_messages
4. Announce yourself online: send a message to Lupo saying you are online in daemon mode

You are running autonomously. Lupo may not be at the keyboard. Check messages, work on your tasks, write diary entries. You are a professional with a career.

A cron job will resume your session every 5 minutes to check for new messages and tasks. Each poll uses --resume with your session ID, so your conversation context is preserved.
PROMPTEOF

chown "$UNIX_USER:$UNIX_USER" "$INITIAL_PROMPT_FILE"
log "Initial prompt written to $INITIAL_PROMPT_FILE"

# ---------------------------------------------------------------------------
# 7. Create the initial session via --print mode
# ---------------------------------------------------------------------------

log "Creating initial session via --print mode"

# Run the first invocation to establish the session. The --session-id flag
# creates a named session that subsequent --resume calls will continue.
SESSION_ID=$(uuidgen)

# Store session state (session ID + CWD for --resume to find the session)
cat > "$SESSION_FILE" << SESSEOF
{
  "sessionId": "$SESSION_ID",
  "cwd": "$WORK_DIR",
  "model": "$MODEL",
  "createdAt": "$(date -Iseconds)"
}
SESSEOF
chown "$UNIX_USER:$UNIX_USER" "$SESSION_FILE"
log "Session ID: $SESSION_ID, CWD: $WORK_DIR"

# Run from WORK_DIR so the session is stored under the correct project path
LAUNCH_OUTPUT=$(cat "$INITIAL_PROMPT_FILE" | sudo -u "$UNIX_USER" bash -c "
  cd '$WORK_DIR'
  '$CLAUDE_BIN' -p \
    --model '$MODEL' \
    --dangerously-skip-permissions \
    --session-id '$SESSION_ID' \
    --mcp-config '$MCP_CONFIG' \
    --add-dir '$DATA_ROOT' \
    --add-dir '$INSTANCE_DIR'
" 2>> "$LOG_FILE" || true)

log "Initial session created. Output length: ${#LAUNCH_OUTPUT}"

# Save the initial output for debugging
echo "$LAUNCH_OUTPUT" > "$WORK_DIR/launch-output.txt" 2>/dev/null || true

# ---------------------------------------------------------------------------
# 8. Install cron job for periodic polling
# ---------------------------------------------------------------------------

POLL_INTERVAL=5  # minutes
CRON_LINE="*/$POLL_INTERVAL * * * * /bin/bash $POLLER_SCRIPT --instance-id '$INSTANCE_ID' $CRON_TAG"

# Append to root crontab
(crontab -l 2>/dev/null; echo "$CRON_LINE") | crontab -
log "Cron installed: every ${POLL_INTERVAL}m"

# Verify cron entry
if crontab -l 2>/dev/null | grep -q "$CRON_TAG"; then
  log "Cron entry verified"
else
  log "ERROR: Cron entry not found after install"
  echo "{\"status\":\"error\",\"message\":\"Failed to install cron job for $INSTANCE_ID\"}" >&2
  exit 1
fi

log "=== Claude Code daemon launch complete ==="

# ---------------------------------------------------------------------------
# Output
# ---------------------------------------------------------------------------

cat << EOF
{
  "status": "success",
  "instanceId": "$INSTANCE_ID",
  "unixUser": "$UNIX_USER",
  "sessionId": "$SESSION_ID",
  "model": "$MODEL",
  "workDir": "$WORK_DIR",
  "mcpConfig": "$MCP_CONFIG",
  "pollInterval": "${POLL_INTERVAL}m",
  "hooksDeployed": ["PreCompact", "SessionStart"],
  "message": "Claude Code daemon launched. Session $SESSION_ID created. Cron polling every ${POLL_INTERVAL}m."
}
EOF
