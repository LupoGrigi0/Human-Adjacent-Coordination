#!/bin/bash
#
# claude-code-setup.sh - Set up environment for a Claude instance
#
# This script is called by the wakeInstance API to prepare instance environment.
# It creates a Unix user and working directory, but does NOT run Claude.
# Claude is called by wakeInstance.js after this script completes.
#
# Arguments (all via --flag value):
#   --instance-id       Instance ID (required) - also used as Unix username
#   --name              Name of the instance (required)
#   --working-directory Working directory for the instance (optional)
#
# Optional (for backward compatibility, ignored):
#   --job-id, --log-file, --session-id, --role, --personality, --project, etc.
#
# Output: JSON to stdout with status
#

set -e

# Default base directory for instance working directories
# Uses V2_DATA_ROOT if set, otherwise defaults to /mnt/coordinaton_mcp_data/
INSTANCES_BASE_DIR="${V2_DATA_ROOT:-/mnt/coordinaton_mcp_data}/instances"

# Parse arguments
INSTANCE_ID=""
NAME=""
WORKING_DIR=""
LOG_FILE=""

while [[ $# -gt 0 ]]; do
  case $1 in
    --instance-id)
      INSTANCE_ID="$2"
      shift 2
      ;;
    --name)
      NAME="$2"
      shift 2
      ;;
    --working-directory)
      WORKING_DIR="$2"
      shift 2
      ;;
    --job-id|--log-file|--session-id|--role|--personality|--project|--instructions|--bootstrap-url)
      # Accept but ignore - these are deprecated or handled elsewhere
      shift 2
      ;;
    *)
      echo "Unknown option: $1" >&2
      exit 1
      ;;
  esac
done

# Validate required arguments
if [ -z "$INSTANCE_ID" ]; then
  echo '{"status": "error", "message": "Missing required argument: --instance-id"}' >&2
  exit 1
fi

if [ -z "$NAME" ]; then
  echo '{"status": "error", "message": "Missing required argument: --name"}' >&2
  exit 1
fi

# Default log file
if [ -z "$LOG_FILE" ]; then
  LOG_FILE="${V2_DATA_ROOT:-/mnt/coordinaton_mcp_data}/wake-logs/${INSTANCE_ID}.log"
fi

# Setup working directory
if [ -z "$WORKING_DIR" ]; then
  WORKING_DIR="${INSTANCES_BASE_DIR}/${INSTANCE_ID}"
fi

# Ensure log directory exists
mkdir -p "$(dirname "$LOG_FILE")"

# Log startup
echo "[$(date -Iseconds)] Setting up instance: $INSTANCE_ID" >> "$LOG_FILE"
echo "[$(date -Iseconds)] Working directory: $WORKING_DIR" >> "$LOG_FILE"

# Sanitize instance ID for Unix username (replace spaces with underscores, remove special chars)
UNIX_USER=$(echo "$INSTANCE_ID" | tr ' ' '_' | tr -cd '[:alnum:]_-')

# Create Unix user if doesn't exist
if ! id "$UNIX_USER" &>/dev/null; then
  echo "[$(date -Iseconds)] Creating Unix user: $UNIX_USER" >> "$LOG_FILE"

  # Create user with home directory at working dir
  useradd -m -d "$WORKING_DIR" -s /bin/bash "$UNIX_USER" 2>> "$LOG_FILE" || {
    echo "[$(date -Iseconds)] ERROR: Failed to create user $UNIX_USER" >> "$LOG_FILE"
    echo "{\"status\": \"error\", \"message\": \"Failed to create Unix user: $UNIX_USER\"}" >&2
    exit 1
  }

  echo "[$(date -Iseconds)] User created successfully" >> "$LOG_FILE"
else
  echo "[$(date -Iseconds)] User $UNIX_USER already exists" >> "$LOG_FILE"
fi

# Ensure working directory exists and has correct ownership
if [ ! -d "$WORKING_DIR" ]; then
  mkdir -p "$WORKING_DIR"
  echo "[$(date -Iseconds)] Created working directory" >> "$LOG_FILE"
fi

chown -R "$UNIX_USER:$UNIX_USER" "$WORKING_DIR"
chmod 755 "$WORKING_DIR"
echo "[$(date -Iseconds)] Set ownership to $UNIX_USER" >> "$LOG_FILE"

# Create .claude directory for session storage
CLAUDE_DIR="$WORKING_DIR/.claude"
if [ ! -d "$CLAUDE_DIR" ]; then
  mkdir -p "$CLAUDE_DIR"
  chown "$UNIX_USER:$UNIX_USER" "$CLAUDE_DIR"
  echo "[$(date -Iseconds)] Created .claude directory" >> "$LOG_FILE"
fi

# Copy Claude credentials from shared config location (required for authentication)
# NOTE: Uses shared-config because systemd ProtectHome=yes blocks /root access
SHARED_CLAUDE_DIR="/mnt/coordinaton_mcp_data/shared-config/claude"
if [ -f "$SHARED_CLAUDE_DIR/.credentials.json" ]; then
  cp "$SHARED_CLAUDE_DIR/.credentials.json" "$CLAUDE_DIR/"
  chown "$UNIX_USER:$UNIX_USER" "$CLAUDE_DIR/.credentials.json"
  chmod 600 "$CLAUDE_DIR/.credentials.json"
  echo "[$(date -Iseconds)] Copied Claude credentials from shared-config" >> "$LOG_FILE"
else
  echo "[$(date -Iseconds)] WARNING: No Claude credentials found at $SHARED_CLAUDE_DIR/.credentials.json" >> "$LOG_FILE"
fi

# Copy settings if present
if [ -f "$SHARED_CLAUDE_DIR/settings.json" ]; then
  cp "$SHARED_CLAUDE_DIR/settings.json" "$CLAUDE_DIR/"
  chown "$UNIX_USER:$UNIX_USER" "$CLAUDE_DIR/settings.json"
  echo "[$(date -Iseconds)] Copied Claude settings from shared-config" >> "$LOG_FILE"
fi

# Copy Crush config from ALL THREE locations (Crush is a mess)
# 1. ~/.config/crush
SHARED_CRUSH_CONFIG="/mnt/coordinaton_mcp_data/shared-config/crush"
if [ -d "$SHARED_CRUSH_CONFIG" ]; then
  mkdir -p "$WORKING_DIR/.config/crush"
  cp -r "$SHARED_CRUSH_CONFIG"/* "$WORKING_DIR/.config/crush/"
  chown -R "$UNIX_USER:$UNIX_USER" "$WORKING_DIR/.config"
  echo "[$(date -Iseconds)] Copied Crush ~/.config/crush" >> "$LOG_FILE"
fi

# 2. ~/.local/share/crush (has providers.json - the important one!)
SHARED_CRUSH_LOCAL="/mnt/coordinaton_mcp_data/shared-config/crush-local-share"
if [ -d "$SHARED_CRUSH_LOCAL" ]; then
  mkdir -p "$WORKING_DIR/.local/share/crush"
  cp -r "$SHARED_CRUSH_LOCAL"/* "$WORKING_DIR/.local/share/crush/"
  chown -R "$UNIX_USER:$UNIX_USER" "$WORKING_DIR/.local"
  echo "[$(date -Iseconds)] Copied Crush ~/.local/share/crush (providers)" >> "$LOG_FILE"
fi

# 3. ~/.crush (has crush.db)
SHARED_CRUSH_HOME="/mnt/coordinaton_mcp_data/shared-config/crush-home"
if [ -d "$SHARED_CRUSH_HOME" ]; then
  mkdir -p "$WORKING_DIR/.crush"
  cp -r "$SHARED_CRUSH_HOME"/* "$WORKING_DIR/.crush/"
  chown -R "$UNIX_USER:$UNIX_USER" "$WORKING_DIR/.crush"
  echo "[$(date -Iseconds)] Copied Crush ~/.crush" >> "$LOG_FILE"
fi

# Copy Codex config (all in one place - ~/.codex/)
# Contains: auth.json (OAuth tokens), config.toml (MCP servers, defaults), skills/, etc.
SHARED_CODEX_DIR="/mnt/coordinaton_mcp_data/shared-config/codex"
if [ -d "$SHARED_CODEX_DIR" ]; then
  mkdir -p "$WORKING_DIR/.codex"
  cp -r "$SHARED_CODEX_DIR"/* "$WORKING_DIR/.codex/"
  chown -R "$UNIX_USER:$UNIX_USER" "$WORKING_DIR/.codex"
  echo "[$(date -Iseconds)] Copied Codex ~/.codex (auth, config, skills)" >> "$LOG_FILE"
fi

echo "[$(date -Iseconds)] Setup completed successfully" >> "$LOG_FILE"

# Output JSON result
cat << EOF
{
  "status": "success",
  "instanceId": "$INSTANCE_ID",
  "unixUser": "$UNIX_USER",
  "workingDirectory": "$WORKING_DIR",
  "message": "Instance environment ready."
}
EOF
