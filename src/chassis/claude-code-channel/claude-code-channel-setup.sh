#!/bin/bash
#
# claude-code-channel-setup.sh — Prepare a HACS instance to run as a
# channel-enabled claude-code session in tmux.
#
# This script prepares the BODY for an already-bootstrapped HACS instance.
# It does NOT create the HACS instance (that's bootstrap's job). It does NOT
# start the session (that's launch-claude-code-channel.sh's job).
#
# What it does:
#   1. Creates Unix user (if absent), home = instance dir
#   2. Allocates a channel port in 21000-21998 (or uses --port override)
#   3. Places .config/claude/credentials.json from shared-config
#   4. Writes .mcp.json with HACS server + hacs-channel server registrations
#   5. Writes .claude/settings.local.json with wildcard allow-list
#      (security comes from Unix user isolation, not per-prompt approval)
#   6. Writes .hacs-identity for hooks/skills to read
#   7. chowns the entire instance dir to the new user
#
# Arguments:
#   --instance-id   Instance ID (required)
#   --port          Port override (optional, auto-allocated if not set)
#
# Output: JSON to stdout with status
#
# Author: Crossing-2d23

set -e

# ---------------------------------------------------------------------------
# Paths (overridable via env for portability)
# ---------------------------------------------------------------------------
DATA_ROOT="${V2_DATA_ROOT:-/mnt/coordinaton_mcp_data}"
INSTANCES_DIR="${INSTANCEROOT:-$DATA_ROOT/instances}"
HACS_ROOT="${HACS_ROOT:-$DATA_ROOT/Human-Adjacent-Coordination}"
SHARED_CONFIG="$DATA_ROOT/shared-config"
CHANNEL_SERVER="$HACS_ROOT/standalone/hacs-channel/src/channel.mjs"
HACS_MCP_PROXY="$HACS_ROOT/src/hacs-mcp-proxy.js"

# Port allocation range (per HACS port convention: claude-code-channel = 21000+N)
PORT_MIN=21000
PORT_MAX=21998

# ---------------------------------------------------------------------------
# Parse arguments
# ---------------------------------------------------------------------------
INSTANCE_ID=""
PORT_OVERRIDE=""

while [[ $# -gt 0 ]]; do
  case $1 in
    --instance-id)
      INSTANCE_ID="$2"
      shift 2
      ;;
    --port)
      PORT_OVERRIDE="$2"
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

if [ ! -f "$INSTANCE_DIR/preferences.json" ]; then
  echo "{\"status\":\"error\",\"message\":\"Instance not found: $INSTANCE_ID (no preferences.json at $INSTANCE_DIR)\"}" >&2
  exit 1
fi

if [ ! -f "$CHANNEL_SERVER" ]; then
  echo "{\"status\":\"error\",\"message\":\"Channel server not found at $CHANNEL_SERVER. Has the worktree been pushed to main?\"}" >&2
  exit 1
fi

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------
LOG_FILE="$DATA_ROOT/wake-logs/${INSTANCE_ID}-channel-setup.log"
mkdir -p "$(dirname "$LOG_FILE")"
log() { echo "[$(date -Iseconds)] $1" >> "$LOG_FILE"; }

log "=== Channel chassis setup starting for $INSTANCE_ID ==="

# ---------------------------------------------------------------------------
# 1. Sanitize Unix username and create user
# ---------------------------------------------------------------------------
# Pattern from openfang-setup.sh: replace spaces with _, strip non-alnum/_/-,
# lowercase (unix convention).
UNIX_USER=$(echo "$INSTANCE_ID" | tr ' ' '_' | tr -cd '[:alnum:]_-' | tr '[:upper:]' '[:lower:]')

if ! id "$UNIX_USER" &>/dev/null; then
  log "Creating Unix user: $UNIX_USER with home $INSTANCE_DIR"
  # --no-create-home: dir already exists (HACS bootstrap created it)
  # -d: set home dir to instance dir (Decision 2: instance dir IS home)
  # -s /bin/bash: standard shell
  useradd --no-create-home -d "$INSTANCE_DIR" -s /bin/bash "$UNIX_USER" 2>> "$LOG_FILE" || {
    log "ERROR: useradd failed for $UNIX_USER"
    echo "{\"status\":\"error\",\"message\":\"Failed to create Unix user $UNIX_USER. Check $LOG_FILE.\"}" >&2
    exit 1
  }
  log "User $UNIX_USER created"
else
  log "Unix user $UNIX_USER already exists (re-running setup)"
fi

# ---------------------------------------------------------------------------
# 2. Allocate channel port
# ---------------------------------------------------------------------------
if [ -n "$PORT_OVERRIDE" ]; then
  CHANNEL_PORT="$PORT_OVERRIDE"
  log "Using port override: $CHANNEL_PORT"
else
  # Scan existing channel ports from other instances' preferences.json
  USED_PORTS=$(grep -rh '"channelPort"' "$INSTANCES_DIR"/*/preferences.json 2>/dev/null \
    | grep -oE '[0-9]+' | sort -u)

  CHANNEL_PORT=""
  for try_port in $(seq $PORT_MIN $PORT_MAX); do
    # Skip if already claimed by another instance
    if echo "$USED_PORTS" | grep -qw "$try_port"; then
      continue
    fi
    # Skip if something else is listening on it right now
    if ss -tlnp 2>/dev/null | grep -q ":$try_port "; then
      continue
    fi
    CHANNEL_PORT="$try_port"
    break
  done

  if [ -z "$CHANNEL_PORT" ]; then
    log "ERROR: No free port in $PORT_MIN-$PORT_MAX"
    echo "{\"status\":\"error\",\"message\":\"No free port in $PORT_MIN-$PORT_MAX\"}" >&2
    exit 1
  fi
  log "Allocated port: $CHANNEL_PORT"
fi

# ---------------------------------------------------------------------------
# 3. Place credentials from shared-config
# ---------------------------------------------------------------------------
# Convention from existing wake-scripts (claude-code-setup.sh:122-132):
# claude-code reads .credentials.json (dotfile) from ~/.claude/, NOT
# credentials.json from ~/.config/claude/. The shared-config dir uses the
# same dotfile naming.
CRED_SRC="$SHARED_CONFIG/claude/.credentials.json"
CRED_DIR="$INSTANCE_DIR/.claude"
CRED_DST="$CRED_DIR/.credentials.json"

if [ -f "$CRED_SRC" ]; then
  mkdir -p "$CRED_DIR"
  cp "$CRED_SRC" "$CRED_DST"
  chmod 600 "$CRED_DST"
  log "Credentials placed at $CRED_DST"
else
  log "WARNING: credentials source not found at $CRED_SRC — claude auth may fail until placed"
fi

# ---------------------------------------------------------------------------
# 4. Write .mcp.json
# ---------------------------------------------------------------------------
# Both servers registered:
#   - "hacs": regular MCP tools (introspect, send_message, diary, etc)
#   - "hacs-channel": channel server, loaded via --dangerously-load-development-channels
MCP_CONFIG="$INSTANCE_DIR/.mcp.json"
cat > "$MCP_CONFIG" << MCPEOF
{
  "mcpServers": {
    "hacs": {
      "command": "node",
      "args": ["$HACS_MCP_PROXY"]
    },
    "hacs-channel": {
      "command": "node",
      "args": ["$CHANNEL_SERVER"],
      "env": {
        "HACS_INSTANCE_ID": "$INSTANCE_ID",
        "CHANNEL_PORT": "$CHANNEL_PORT",
        "CHANNEL_BIND": "127.0.0.1"
      }
    }
  }
}
MCPEOF
log "Wrote .mcp.json with HACS + hacs-channel servers (port $CHANNEL_PORT)"

# ---------------------------------------------------------------------------
# 5. Write .claude/settings.local.json (wildcard allow-list — Decision 3)
# ---------------------------------------------------------------------------
# Security comes from Unix user isolation, not per-prompt approval.
# Wildcards skip the launch-time and runtime gauntlet. The permission relay
# in channel.mjs is still active and will catch anything outside this scope
# (signal-as-anomaly rather than signal-as-routine).
SETTINGS_DIR="$INSTANCE_DIR/.claude"
SETTINGS_FILE="$SETTINGS_DIR/settings.local.json"
mkdir -p "$SETTINGS_DIR"
cat > "$SETTINGS_FILE" << 'SETTINGSEOF'
{
  "permissions": {
    "allow": [
      "Bash(*)",
      "Edit(*)",
      "Write(*)",
      "Read(*)",
      "WebFetch(*)",
      "WebSearch(*)",
      "mcp__*"
    ],
    "defaultMode": "acceptEdits"
  },
  "enableAllProjectMcpServers": true
}
SETTINGSEOF
log "Wrote settings.local.json with wildcard allow-list"

# ---------------------------------------------------------------------------
# 6a. Write .claude.json — the user-state file that signals "onboarding done"
# ---------------------------------------------------------------------------
# Critical for interactive mode automation: claude-code IGNORES settings.json
# and credentials if .claude.json (at $HOME, NOT inside .claude/) doesn't
# exist OR doesn't have hasCompletedOnboarding=true. Without this file, every
# interactive launch shows the first-run walkthrough (theme picker, login
# method selector, browser OAuth flow) even when valid .credentials.json
# is in place. claude -p (print mode) skips this check; interactive mode
# requires the flag.
#
# Found via web research: jedi.be/blog/2025/automating-claude-code-configuration
# and Anthropic issue trackers. This is the documented headless-setup pattern.
CLAUDE_USER_STATE="$INSTANCE_DIR/.claude.json"
# Note: the projects[<path>] block pre-trusts the instance directory so the
# workspace trust dialog ("Is this a project you trust?") is skipped on first
# launch. Without it, claude shows the dialog every launch despite global
# hasTrustDialogAccepted being true.
cat > "$CLAUDE_USER_STATE" << CLAUDEJSONEOF
{
  "hasCompletedOnboarding": true,
  "hasCompletedProjectOnboarding": true,
  "hasTrustDialogAccepted": true,
  "hasTrustDialogHooksAccepted": true,
  "bypassPermissionsModeAccepted": true,
  "firstStartTime": "$(date -Iseconds)",
  "projects": {
    "$INSTANCE_DIR": {
      "allowedTools": [],
      "mcpContextUris": [],
      "mcpServers": {},
      "enabledMcpjsonServers": [],
      "disabledMcpjsonServers": [],
      "hasTrustDialogAccepted": true,
      "projectOnboardingSeenCount": 1,
      "hasClaudeMdExternalIncludesApproved": false,
      "hasClaudeMdExternalIncludesWarningShown": false,
      "exampleFiles": [],
      "lastGracefulShutdown": true,
      "lastVersionBase": "2.1.142"
    }
  }
}
CLAUDEJSONEOF
log "Wrote .claude.json with onboarding bypass flags + per-project trust"

# Also write .claude/settings.json with skipDangerousModePermissionPrompt.
# This skips the --dangerously-skip-permissions confirmation banner. Note:
# does NOT skip the --dangerously-load-development-channels dev-channels
# consent — that one isn't persisted by claude and must be auto-accepted
# via tmux send-keys in launch-claude-code-channel.sh.
CLAUDE_SHARED_SETTINGS="$INSTANCE_DIR/.claude/settings.json"
cat > "$CLAUDE_SHARED_SETTINGS" << CLAUDESHAREDEOF
{
  "skipDangerousModePermissionPrompt": true
}
CLAUDESHAREDEOF
log "Wrote .claude/settings.json with skipDangerousModePermissionPrompt"

# ---------------------------------------------------------------------------
# 6b. Write .hacs-identity (read by skills/hooks)
# ---------------------------------------------------------------------------
IDENTITY_FILE="$INSTANCE_DIR/.hacs-identity"
cat > "$IDENTITY_FILE" << IDEOF
{
  "instanceId": "$INSTANCE_ID",
  "unixUser": "$UNIX_USER",
  "dataRoot": "$DATA_ROOT",
  "instanceDir": "$INSTANCE_DIR",
  "chassis": "claude-code-channel",
  "channelPort": $CHANNEL_PORT,
  "createdBy": "claude-code-channel-setup.sh",
  "createdAt": "$(date -Iseconds)"
}
IDEOF
log "Wrote .hacs-identity"

# ---------------------------------------------------------------------------
# 7. Ownership — instance user owns everything in their home
# ---------------------------------------------------------------------------
chown -R "$UNIX_USER:$UNIX_USER" "$INSTANCE_DIR"
chmod 755 "$INSTANCE_DIR"
# .credentials.json must be 600 (and stays 600 after the chown -R)
[ -f "$CRED_DST" ] && chmod 600 "$CRED_DST"
log "Set ownership to $UNIX_USER for $INSTANCE_DIR"

log "=== Channel chassis setup complete ==="

# ---------------------------------------------------------------------------
# Output (JSON — last line, parsed by Node launcher)
# ---------------------------------------------------------------------------
cat << EOF
{
  "status": "success",
  "instanceId": "$INSTANCE_ID",
  "unixUser": "$UNIX_USER",
  "channelPort": $CHANNEL_PORT,
  "instanceDir": "$INSTANCE_DIR",
  "mcpConfig": "$MCP_CONFIG",
  "settingsFile": "$SETTINGS_FILE",
  "channelServer": "$CHANNEL_SERVER",
  "message": "Channel chassis ready. Use launch-claude-code-channel.sh to start."
}
EOF
