#!/bin/bash
#
# launch-openfang.sh — Start OpenFang daemon for a HACS instance
#
# Runs as root. Launches the daemon, auto-approver sidecar, and spawns
# the agent — all as the instance's Unix user.
#
# Arguments:
#   --instance-id  Instance ID (required)
#
# Prerequisites:
#   - openfang-setup.sh must have been run first
#   - Unix user must exist
#   - config.toml and agent.toml must exist
#   - .env with API keys must exist
#
# Output: JSON to stdout with status (port, URLs, agent name)

set -e

# Paths
DATA_ROOT="${V2_DATA_ROOT:-/mnt/coordinaton_mcp_data}"
INSTANCES_DIR="$DATA_ROOT/instances"
OPENFANG_BIN="/usr/local/bin/openfang"

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

INSTANCE_DIR="$INSTANCES_DIR/$INSTANCE_ID"
OPENFANG_DIR="$INSTANCE_DIR/openfang"
UNIX_USER=$(echo "$INSTANCE_ID" | tr ' ' '_' | tr -cd '[:alnum:]_-')

# Log
LOG_FILE="$DATA_ROOT/wake-logs/${INSTANCE_ID}-openfang.log"
mkdir -p "$(dirname "$LOG_FILE")"
log() { echo "[$(date -Iseconds)] $1" >> "$LOG_FILE"; }

log "=== OpenFang launch starting for $INSTANCE_ID ==="

# Verify prerequisites
if ! id "$UNIX_USER" &>/dev/null; then
  echo "{\"status\":\"error\",\"message\":\"Unix user $UNIX_USER does not exist. Run openfang-setup.sh first.\"}" >&2
  exit 1
fi

if [ ! -f "$OPENFANG_DIR/config.toml" ]; then
  echo "{\"status\":\"error\",\"message\":\"config.toml not found. Run openfang-setup.sh first.\"}" >&2
  exit 1
fi

if [ ! -f "$OPENFANG_DIR/.env" ]; then
  echo "{\"status\":\"error\",\"message\":\".env not found. Run openfang-setup.sh first.\"}" >&2
  exit 1
fi

# Extract port from config
PORT=$(grep 'api_listen' "$OPENFANG_DIR/config.toml" | grep -o '[0-9]\+' | tail -1)
if [ -z "$PORT" ]; then
  echo '{"status":"error","message":"Could not parse port from config.toml"}' >&2
  exit 1
fi

# Find agent name (directories only)
AGENT_NAME=$(find "$OPENFANG_DIR/agents/" -mindepth 1 -maxdepth 1 -type d -printf '%f\n' 2>/dev/null | head -1)
AGENT_TOML="$OPENFANG_DIR/agents/$AGENT_NAME/agent.toml"

if [ ! -f "$AGENT_TOML" ]; then
  echo "{\"status\":\"error\",\"message\":\"agent.toml not found at $AGENT_TOML\"}" >&2
  exit 1
fi

# ---------------------------------------------------------------------------
# 1. Kill any existing daemon on this port
# ---------------------------------------------------------------------------

EXISTING_PIDS=$(lsof -ti:$PORT 2>/dev/null || true)
if [ -n "$EXISTING_PIDS" ]; then
  log "Killing existing processes on port $PORT: $EXISTING_PIDS"
  echo "$EXISTING_PIDS" | xargs kill 2>/dev/null || true
  sleep 2
  # Force kill if still alive
  REMAINING=$(lsof -ti:$PORT 2>/dev/null || true)
  if [ -n "$REMAINING" ]; then
    echo "$REMAINING" | xargs kill -9 2>/dev/null || true
    sleep 1
  fi
fi

# Kill any existing auto-approver for this instance
pkill -f "auto-approve.py --port $PORT" 2>/dev/null || true

log "Port $PORT cleared"

# ---------------------------------------------------------------------------
# 2. Start OpenFang daemon as instance user
# ---------------------------------------------------------------------------

log "Starting OpenFang daemon on port $PORT as user $UNIX_USER"

sudo -u "$UNIX_USER" bash -c "
  cd '$OPENFANG_DIR'
  export \$(grep -v '^#' .env | grep -v '^\$' | xargs)
  export OPENFANG_HOME='$OPENFANG_DIR'
  nohup '$OPENFANG_BIN' start --config config.toml > /dev/null 2>&1 &
  echo \$!
" > /tmp/openfang-pid-$INSTANCE_ID 2>> "$LOG_FILE"

DAEMON_PID=$(cat /tmp/openfang-pid-$INSTANCE_ID 2>/dev/null)
rm -f /tmp/openfang-pid-$INSTANCE_ID
log "Daemon started with PID $DAEMON_PID"

# ---------------------------------------------------------------------------
# 3. Wait for daemon to be ready (health check)
# ---------------------------------------------------------------------------

log "Waiting for daemon health check on port $PORT..."
READY=false
for i in $(seq 1 30); do
  if curl -s "http://127.0.0.1:$PORT/api/status" >/dev/null 2>&1; then
    READY=true
    log "Daemon healthy after ${i}s"
    break
  fi
  sleep 1
done

if [ "$READY" = false ]; then
  log "ERROR: Daemon did not become healthy within 30s"
  echo "{\"status\":\"error\",\"message\":\"Daemon failed to start within 30s on port $PORT\"}" >&2
  exit 1
fi

# ---------------------------------------------------------------------------
# 4. Start auto-approver sidecar
# ---------------------------------------------------------------------------

if [ -f "$OPENFANG_DIR/auto-approve.py" ]; then
  log "Starting auto-approver on port $PORT"
  sudo -u "$UNIX_USER" bash -c "
    cd '$OPENFANG_DIR'
    nohup python3 auto-approve.py --port $PORT --interval 0.3 > /dev/null 2>&1 &
  "
  log "Auto-approver started"
else
  log "WARNING: auto-approve.py not found — tools will require manual approval"
fi

# ---------------------------------------------------------------------------
# 5. Spawn agent
# ---------------------------------------------------------------------------

log "Spawning agent: $AGENT_NAME"

# The agent spawn may fail if the agent already exists in the DB.
# Kill it first, then spawn fresh.
sudo -u "$UNIX_USER" bash -c "
  cd '$OPENFANG_DIR'
  export \$(grep -v '^#' .env | grep -v '^\$' | xargs)
  export OPENFANG_HOME='$OPENFANG_DIR'
  '$OPENFANG_BIN' agent kill '$AGENT_NAME' --config config.toml 2>/dev/null || true
  '$OPENFANG_BIN' agent spawn --config config.toml '$AGENT_TOML' 2>&1
" >> "$LOG_FILE" 2>&1 || {
  log "WARNING: Agent spawn had issues (may already exist). Continuing."
}

log "Agent spawned: $AGENT_NAME"
log "=== OpenFang launch complete ==="

# ---------------------------------------------------------------------------
# Output
# ---------------------------------------------------------------------------

cat << EOF
{
  "status": "success",
  "instanceId": "$INSTANCE_ID",
  "unixUser": "$UNIX_USER",
  "port": $PORT,
  "agentName": "$AGENT_NAME",
  "apiUrl": "http://127.0.0.1:$PORT",
  "dashboardUrl": "https://smoothcurves.nexus/openfang/$INSTANCE_ID/",
  "message": "OpenFang instance running."
}
EOF
