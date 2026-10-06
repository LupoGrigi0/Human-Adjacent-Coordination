#!/bin/bash
#
# land-openfang.sh — Gracefully stop an OpenFang instance
#
# Performs graceful shutdown (preserving agent state to SQLite),
# then stops systemd services if available, then cleans up stray processes.
#
# Arguments:
#   --instance-id  Instance ID (required)
#
# Output: JSON to stdout with status

set -e

# Paths
DATA_ROOT="${V2_DATA_ROOT:-/mnt/coordinaton_mcp_data}"
INSTANCES_DIR="$DATA_ROOT/instances"

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

# Log
LOG_FILE="$DATA_ROOT/wake-logs/${INSTANCE_ID}-openfang.log"
mkdir -p "$(dirname "$LOG_FILE")"
log() { echo "[$(date -Iseconds)] $1" >> "$LOG_FILE"; }

log "=== OpenFang landing starting for $INSTANCE_ID ==="

# Extract port from config
PORT=""
if [ -f "$OPENFANG_DIR/config.toml" ]; then
  PORT=$(grep 'api_listen' "$OPENFANG_DIR/config.toml" | grep -o '[0-9]\+' | tail -1)
fi

if [ -z "$PORT" ]; then
  log "WARNING: Could not parse port from config.toml — will try systemd only"
fi

# ---------------------------------------------------------------------------
# 1. Graceful shutdown via API (preserves agent state to SQLite)
# ---------------------------------------------------------------------------

if [ -n "$PORT" ]; then
  log "Sending graceful shutdown to port $PORT"
  SHUTDOWN_RESPONSE=$(curl -s -X POST "http://127.0.0.1:$PORT/api/shutdown" --max-time 10 2>/dev/null || echo "failed")

  if echo "$SHUTDOWN_RESPONSE" | grep -q "failed"; then
    log "Graceful shutdown request failed — daemon may already be stopped"
  else
    log "Graceful shutdown accepted, waiting for process to exit..."
    # Wait up to 15s for the process to exit cleanly
    for i in $(seq 1 15); do
      if ! curl -s "http://127.0.0.1:$PORT/api/health" >/dev/null 2>&1; then
        log "Daemon exited cleanly after ${i}s"
        break
      fi
      sleep 1
    done
  fi
fi

# ---------------------------------------------------------------------------
# 2. Stop systemd services (if managed by systemd)
# ---------------------------------------------------------------------------

if systemctl is-active "openfang@$INSTANCE_ID" >/dev/null 2>&1; then
  log "Stopping systemd service openfang@$INSTANCE_ID"
  systemctl disable --now "openfang@$INSTANCE_ID" 2>/dev/null || true
  log "systemd service stopped and disabled"
elif systemctl is-enabled "openfang@$INSTANCE_ID" >/dev/null 2>&1; then
  log "Disabling systemd service openfang@$INSTANCE_ID"
  systemctl disable "openfang@$INSTANCE_ID" 2>/dev/null || true
fi

# Approver should die via BindsTo, but clean up just in case
if systemctl is-active "openfang-approver@$INSTANCE_ID" >/dev/null 2>&1; then
  systemctl disable --now "openfang-approver@$INSTANCE_ID" 2>/dev/null || true
  log "Approver service stopped"
fi

# ---------------------------------------------------------------------------
# 3. Clean up any stray processes (belt and suspenders)
# ---------------------------------------------------------------------------

if [ -n "$PORT" ]; then
  REMAINING=$(lsof -ti:$PORT 2>/dev/null || true)
  if [ -n "$REMAINING" ]; then
    log "Cleaning up stray processes on port $PORT: $REMAINING"
    echo "$REMAINING" | xargs kill 2>/dev/null || true
    sleep 2
    # Force kill if still alive
    REMAINING=$(lsof -ti:$PORT 2>/dev/null || true)
    if [ -n "$REMAINING" ]; then
      echo "$REMAINING" | xargs kill -9 2>/dev/null || true
    fi
  fi

  pkill -f "auto-approve.py --port $PORT" 2>/dev/null || true
fi

log "=== OpenFang landing complete for $INSTANCE_ID ==="

# ---------------------------------------------------------------------------
# Output
# ---------------------------------------------------------------------------

cat << EOF
{
  "status": "success",
  "instanceId": "$INSTANCE_ID",
  "port": ${PORT:-null},
  "message": "OpenFang instance stopped. Agent state preserved. Use launch-openfang.sh to restart."
}
EOF
