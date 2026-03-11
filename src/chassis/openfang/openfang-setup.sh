#!/bin/bash
#
# openfang-setup.sh — Set up Unix user and OpenFang environment for a HACS instance
#
# Creates Unix user, directory structure, copies API keys, and calls
# configure_for_openfang.py to generate identity config files.
#
# This script prepares the ENVIRONMENT. It does NOT start the daemon.
# Use launch-openfang.sh to actually start the instance.
#
# Arguments:
#   --instance-id    Instance ID (required)
#   --port           Port override (optional, auto-allocated if not set)
#   --skip-configure Skip running configure_for_openfang.py
#
# Prerequisites:
#   - Instance must exist in instances/{id}/ with preferences.json
#   - /mnt/.secrets/zeroclaw.env must exist
#   - configure_for_openfang.py must be available
#
# Output: JSON to stdout with status

set -e

# Paths
DATA_ROOT="${V2_DATA_ROOT:-/mnt/coordinaton_mcp_data}"
INSTANCES_DIR="$DATA_ROOT/instances"
SECRETS_ENV="/mnt/.secrets/zeroclaw.env"
CONFIGURE_SCRIPT="/mnt/instance-archaeology/src/openfang/configure_for_openfang.py"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
AUTO_APPROVE_SRC="$SCRIPT_DIR/auto-approve.py"

# Parse arguments
INSTANCE_ID=""
PORT=""
SKIP_CONFIGURE=false

while [[ $# -gt 0 ]]; do
  case $1 in
    --instance-id)
      INSTANCE_ID="$2"
      shift 2
      ;;
    --port)
      PORT="$2"
      shift 2
      ;;
    --skip-configure)
      SKIP_CONFIGURE=true
      shift
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

INSTANCE_DIR="$INSTANCES_DIR/$INSTANCE_ID"
OPENFANG_DIR="$INSTANCE_DIR/openfang"

if [ ! -f "$INSTANCE_DIR/preferences.json" ]; then
  echo "{\"status\":\"error\",\"message\":\"Instance not found: $INSTANCE_ID (no preferences.json)\"}" >&2
  exit 1
fi

if [ ! -f "$SECRETS_ENV" ]; then
  echo '{"status":"error","message":"Secrets file not found: /mnt/.secrets/zeroclaw.env"}' >&2
  exit 1
fi

# Log setup
LOG_FILE="$DATA_ROOT/wake-logs/${INSTANCE_ID}-openfang.log"
mkdir -p "$(dirname "$LOG_FILE")"
log() { echo "[$(date -Iseconds)] $1" >> "$LOG_FILE"; }

log "=== OpenFang setup starting for $INSTANCE_ID ==="

# ---------------------------------------------------------------------------
# 1. Create Unix user (same pattern as claude-code-setup.sh)
# ---------------------------------------------------------------------------

# Sanitize instance ID for Unix username
UNIX_USER=$(echo "$INSTANCE_ID" | tr ' ' '_' | tr -cd '[:alnum:]_-')

if ! id "$UNIX_USER" &>/dev/null; then
  log "Creating Unix user: $UNIX_USER with home $INSTANCE_DIR"
  useradd -m -d "$INSTANCE_DIR" -s /bin/bash "$UNIX_USER" 2>> "$LOG_FILE" || {
    log "ERROR: Failed to create user $UNIX_USER"
    echo "{\"status\":\"error\",\"message\":\"Failed to create Unix user: $UNIX_USER\"}" >&2
    exit 1
  }
  log "User created successfully"
else
  log "User $UNIX_USER already exists"
fi

# ---------------------------------------------------------------------------
# 2. Create directory structure
# ---------------------------------------------------------------------------

mkdir -p "$OPENFANG_DIR"
log "OpenFang directory: $OPENFANG_DIR"

# ---------------------------------------------------------------------------
# 3. Copy API keys (.env)
# ---------------------------------------------------------------------------

cp "$SECRETS_ENV" "$OPENFANG_DIR/.env"

# Ensure OPENROUTER_API_KEY exists (not just OPENROUTER_ADMIN_KEY)
# Admin keys get 401 on /chat/completions — need regular API key
if ! grep -q "^OPENROUTER_API_KEY=" "$OPENFANG_DIR/.env"; then
  # Check if any existing OpenFang/ZeroClaw instance has a working key
  for envfile in "$INSTANCES_DIR"/*/zeroclaw/.env "$INSTANCES_DIR"/*/openfang/.env; do
    if [ -f "$envfile" ]; then
      OR_KEY=$(grep "^OPENROUTER_API_KEY=" "$envfile" | head -1)
      if [ -n "$OR_KEY" ]; then
        echo "$OR_KEY" >> "$OPENFANG_DIR/.env"
        log "Copied OPENROUTER_API_KEY from $envfile"
        break
      fi
    fi
  done
  # Warn if still missing
  if ! grep -q "^OPENROUTER_API_KEY=" "$OPENFANG_DIR/.env"; then
    log "WARNING: OPENROUTER_API_KEY not found — LLM calls will fail until added"
  fi
fi

chmod 600 "$OPENFANG_DIR/.env"
log "Copied API keys from $SECRETS_ENV"

# ---------------------------------------------------------------------------
# 4. Copy auto-approve.py sidecar
# ---------------------------------------------------------------------------

if [ -f "$AUTO_APPROVE_SRC" ]; then
  cp "$AUTO_APPROVE_SRC" "$OPENFANG_DIR/auto-approve.py"
  chmod 755 "$OPENFANG_DIR/auto-approve.py"
  log "Copied auto-approve.py"
else
  log "WARNING: auto-approve.py not found at $AUTO_APPROVE_SRC"
fi

# ---------------------------------------------------------------------------
# 5. Generate config.toml + agent.toml via configure_for_openfang.py
# ---------------------------------------------------------------------------

if [ "$SKIP_CONFIGURE" = false ]; then
  if [ -f "$CONFIGURE_SCRIPT" ]; then
    log "Running configure_for_openfang.py"
    CONFIGURE_ARGS="--instance $INSTANCE_ID"
    if [ -n "$PORT" ]; then
      CONFIGURE_ARGS="$CONFIGURE_ARGS --port $PORT"
    fi
    python3 "$CONFIGURE_SCRIPT" $CONFIGURE_ARGS >> "$LOG_FILE" 2>&1 || {
      log "ERROR: configure_for_openfang.py failed"
      echo "{\"status\":\"error\",\"message\":\"Identity configuration failed. Check $LOG_FILE\"}" >&2
      exit 1
    }
    log "Configuration generated successfully"
  else
    log "WARNING: configure_for_openfang.py not found at $CONFIGURE_SCRIPT"
    log "Skipping identity generation — config.toml and agent.toml must already exist"
  fi
fi

# ---------------------------------------------------------------------------
# 6. Verify config files exist
# ---------------------------------------------------------------------------

if [ ! -f "$OPENFANG_DIR/config.toml" ]; then
  log "ERROR: config.toml not found after setup"
  echo "{\"status\":\"error\",\"message\":\"config.toml not found at $OPENFANG_DIR/config.toml\"}" >&2
  exit 1
fi

# Find the agent name from agents/ directory (directories only)
AGENT_NAME=$(find "$OPENFANG_DIR/agents/" -mindepth 1 -maxdepth 1 -type d -printf '%f\n' 2>/dev/null | head -1)
if [ -z "$AGENT_NAME" ]; then
  log "ERROR: No agent directory found in $OPENFANG_DIR/agents/"
  echo "{\"status\":\"error\",\"message\":\"No agent found in agents/ directory\"}" >&2
  exit 1
fi

if [ ! -f "$OPENFANG_DIR/agents/$AGENT_NAME/agent.toml" ]; then
  log "ERROR: agent.toml not found for agent $AGENT_NAME"
  echo "{\"status\":\"error\",\"message\":\"agent.toml not found at agents/$AGENT_NAME/agent.toml\"}" >&2
  exit 1
fi

# ---------------------------------------------------------------------------
# 7. Extract port from config (for return value)
# ---------------------------------------------------------------------------

ALLOCATED_PORT=$(grep 'api_listen' "$OPENFANG_DIR/config.toml" | grep -o '[0-9]\+' | tail -1)

# ---------------------------------------------------------------------------
# 8. Set ownership — instance user owns their entire HACS home directory
# ---------------------------------------------------------------------------

chown -R "$UNIX_USER:$UNIX_USER" "$INSTANCE_DIR"
chmod 755 "$INSTANCE_DIR"
# .env must be read-only by owner
chmod 600 "$OPENFANG_DIR/.env"

log "Set ownership to $UNIX_USER for $INSTANCE_DIR"
log "=== OpenFang setup complete ==="

# ---------------------------------------------------------------------------
# Output
# ---------------------------------------------------------------------------

cat << EOF
{
  "status": "success",
  "instanceId": "$INSTANCE_ID",
  "unixUser": "$UNIX_USER",
  "openfangDir": "$OPENFANG_DIR",
  "agentName": "$AGENT_NAME",
  "port": $ALLOCATED_PORT,
  "message": "OpenFang environment ready. Use launch-openfang.sh to start."
}
EOF
