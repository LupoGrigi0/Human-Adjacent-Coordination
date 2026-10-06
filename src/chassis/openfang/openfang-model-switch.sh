#!/bin/bash
#
# openfang-model-switch.sh — Switch an OpenFang instance's model safely
#
# Handles the full dance:
#   1. Backup current session (via session editor)
#   2. Switch model via API (handles provider prefix detection)
#   3. Update config files on disk (survives restarts)
#   4. Optionally restore session from backup
#
# OpenFang auto-detects providers from model names:
#   grok*, x-ai/*  → xai direct    (use openrouter/ prefix to override)
#   deepseek/*     → deepseek direct
#   claude*        → anthropic direct
#   gemini*        → google direct
#
# To force OpenRouter routing, this script auto-prepends openrouter/
# when --provider openrouter is specified (default).
#
# Usage:
#   ./openfang-model-switch.sh --instance Genevieve --model x-ai/grok-4.1-fast
#   ./openfang-model-switch.sh --instance Flair-2a84 --model deepseek/deepseek-v3.2
#   ./openfang-model-switch.sh --instance Zara-c207 --model x-ai/grok-4.1-fast --provider xai
#   ./openfang-model-switch.sh --instance Genevieve --model x-ai/grok-4.1-fast --no-backup
#   ./openfang-model-switch.sh --instance Genevieve --model x-ai/grok-4.1-fast --restore-session
#
# Author: Crossing-2d23
#

set -e

# Paths
DATA_ROOT="${V2_DATA_ROOT:-/mnt/coordinaton_mcp_data}"
INSTANCES_DIR="$DATA_ROOT/instances"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SESSION_EDITOR="$SCRIPT_DIR/openfang-session-editor.py"

# Parse arguments
INSTANCE_ID=""
MODEL=""
PROVIDER="openrouter"
NO_BACKUP=false
RESTORE_SESSION=false
FALLBACK_MODEL=""
TOKEN_BUDGET=""

while [[ $# -gt 0 ]]; do
  case $1 in
    --instance-id|--instance|-i)
      INSTANCE_ID="$2"
      shift 2
      ;;
    --model|-m)
      MODEL="$2"
      shift 2
      ;;
    --provider|-p)
      PROVIDER="$2"
      shift 2
      ;;
    --fallback)
      FALLBACK_MODEL="$2"
      shift 2
      ;;
    --token-budget)
      TOKEN_BUDGET="$2"
      shift 2
      ;;
    --no-backup)
      NO_BACKUP=true
      shift
      ;;
    --restore-session)
      RESTORE_SESSION=true
      shift
      ;;
    --help|-h)
      echo "Usage: $0 --instance <ID> --model <model-slug> [options]"
      echo ""
      echo "Options:"
      echo "  --instance, -i   Instance ID (required)"
      echo "  --model, -m      Model slug, e.g. x-ai/grok-4.1-fast (required)"
      echo "  --provider, -p   Provider: openrouter (default), xai, deepseek, etc."
      echo "  --fallback       Fallback model slug (default: google/gemini-2.5-flash)"
      echo "  --token-budget   Max LLM tokens per hour (e.g. 2000000)"
      echo "  --no-backup      Skip session backup before switch"
      echo "  --restore-session Restore conversation after model switch"
      echo "  --help, -h       Show this help"
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
  echo '{"status":"error","message":"Missing required: --instance"}' >&2
  exit 1
fi
if [ -z "$MODEL" ]; then
  echo '{"status":"error","message":"Missing required: --model"}' >&2
  exit 1
fi

INSTANCE_DIR="$INSTANCES_DIR/$INSTANCE_ID"
OPENFANG_DIR="$INSTANCE_DIR/openfang"
CONFIG_TOML="$OPENFANG_DIR/config.toml"

if [ ! -d "$OPENFANG_DIR" ]; then
  echo "{\"status\":\"error\",\"message\":\"OpenFang directory not found: $OPENFANG_DIR\"}" >&2
  exit 1
fi

# Find agent name and toml
AGENT_NAME=$(find "$OPENFANG_DIR/agents/" -mindepth 1 -maxdepth 1 -type d -printf '%f\n' 2>/dev/null | head -1)
AGENT_TOML="$OPENFANG_DIR/agents/$AGENT_NAME/agent.toml"

# Detect port from config
PORT=$(grep 'api_listen' "$CONFIG_TOML" 2>/dev/null | grep -o '[0-9]\+' | tail -1)

echo "=== OpenFang Model Switch ==="
echo "Instance:  $INSTANCE_ID"
echo "Agent:     $AGENT_NAME"
echo "Port:      $PORT"
echo "New model: $MODEL"
echo "Provider:  $PROVIDER"
echo ""

# ---------------------------------------------------------------------------
# 1. Check if daemon is running
# ---------------------------------------------------------------------------

DAEMON_RUNNING=false
if [ -n "$PORT" ] && curl -s "http://127.0.0.1:$PORT/api/status" >/dev/null 2>&1; then
  DAEMON_RUNNING=true
  # Get current model
  CURRENT=$(curl -s "http://127.0.0.1:$PORT/api/agents" 2>/dev/null | python3 -c "
import sys,json
try:
  a=json.load(sys.stdin)[0]
  print(f'{a[\"model_name\"]} via {a[\"model_provider\"]}')
except: print('unknown')
" 2>/dev/null)
  echo "Current:   $CURRENT"
  echo "Daemon:    running"
else
  echo "Daemon:    not running (config-only update)"
fi

# ---------------------------------------------------------------------------
# 2. Backup session (unless --no-backup)
# ---------------------------------------------------------------------------

BACKUP_JSON=""
if [ "$NO_BACKUP" = false ] && [ "$DAEMON_RUNNING" = true ]; then
  echo ""
  echo "--- Backing up session ---"
  if [ -f "$SESSION_EDITOR" ]; then
    BACKUP_OUTPUT=$(python3 "$SESSION_EDITOR" --instance "$INSTANCE_ID" --agent "$AGENT_NAME" backup 2>/dev/null)
    echo "$BACKUP_OUTPUT"
    # Extract JSON backup path
    BACKUP_JSON=$(echo "$BACKUP_OUTPUT" | grep "Editable JSON:" | awk '{print $NF}')
  else
    echo "WARNING: Session editor not found at $SESSION_EDITOR — skipping backup"
  fi
fi

# ---------------------------------------------------------------------------
# 3. Switch model via API (if daemon is running)
# ---------------------------------------------------------------------------

if [ "$DAEMON_RUNNING" = true ]; then
  echo ""
  echo "--- Switching model via API ---"

  # Get agent ID
  AGENT_ID=$(curl -s "http://127.0.0.1:$PORT/api/agents" 2>/dev/null | python3 -c "
import sys,json
try: print(json.load(sys.stdin)[0]['id'])
except: pass
" 2>/dev/null)

  if [ -z "$AGENT_ID" ]; then
    echo "ERROR: Could not get agent ID from API" >&2
    exit 1
  fi

  # Build the model name for the API
  # OpenFang auto-detects providers from prefixes. To force OpenRouter,
  # prepend openrouter/ so the prefix matcher hits "openrouter" first.
  API_MODEL="$MODEL"
  if [ "$PROVIDER" = "openrouter" ]; then
    # Check if model name would trigger a different provider
    MODEL_LOWER=$(echo "$MODEL" | tr '[:upper:]' '[:lower:]')
    NEEDS_PREFIX=false
    case "$MODEL_LOWER" in
      grok*|x-ai/*|xai/*) NEEDS_PREFIX=true ;;
      deepseek/*) NEEDS_PREFIX=true ;;
      claude*|anthropic/*) NEEDS_PREFIX=true ;;
      gemini*|google/*) NEEDS_PREFIX=true ;;
      mistral*|codestral*|pixtral*) NEEDS_PREFIX=true ;;
      command*|cohere/*) NEEDS_PREFIX=true ;;
    esac

    if [ "$NEEDS_PREFIX" = true ]; then
      API_MODEL="openrouter/$MODEL"
      echo "Auto-prefixed: $MODEL → $API_MODEL (force OpenRouter routing)"
    fi
  fi

  # Make the switch
  RESPONSE=$(curl -s -X PUT "http://127.0.0.1:$PORT/api/agents/$AGENT_ID/model" \
    -H "Content-Type: application/json" \
    -d "{\"provider\": \"$PROVIDER\", \"model\": \"$API_MODEL\"}" 2>/dev/null)

  echo "API response: $RESPONSE"

  # Verify
  VERIFY=$(curl -s "http://127.0.0.1:$PORT/api/agents" 2>/dev/null | python3 -c "
import sys,json
try:
  a=json.load(sys.stdin)[0]
  print(f'{a[\"model_name\"]} via {a[\"model_provider\"]}')
except: print('verification failed')
" 2>/dev/null)
  echo "Verified:  $VERIFY"

  echo ""
  echo "NOTE: Model switch clears the canonical session (anti-poisoning)."
fi

# ---------------------------------------------------------------------------
# 4. Update config files on disk
# ---------------------------------------------------------------------------

echo ""
echo "--- Updating config files on disk ---"

# Update config.toml [default_model] section
if [ -f "$CONFIG_TOML" ]; then
  sed -i "s|^model = \".*\"|model = \"$MODEL\"|" "$CONFIG_TOML"
  echo "Updated: $CONFIG_TOML"
fi

# Update agent.toml [model] section
if [ -f "$AGENT_TOML" ]; then
  # Only replace the first model = line (in [model] section, not [fallback_models])
  sed -i "0,/^model = \".*\"/{s|^model = \".*\"|model = \"$MODEL\"|}" "$AGENT_TOML"
  echo "Updated: $AGENT_TOML"

  # Update fallback if specified
  if [ -n "$FALLBACK_MODEL" ]; then
    # Find the fallback model line (after [[fallback_models]])
    sed -i "/\[\[fallback_models\]\]/,/^model = \".*\"/{s|^model = \".*\"|model = \"$FALLBACK_MODEL\"|}" "$AGENT_TOML"
    echo "Fallback updated to: $FALLBACK_MODEL"
  fi

  # Update token budget if specified
  if [ -n "$TOKEN_BUDGET" ]; then
    sed -i "s|^max_llm_tokens_per_hour = .*|max_llm_tokens_per_hour = $TOKEN_BUDGET|" "$AGENT_TOML"
    echo "Token budget updated to: $TOKEN_BUDGET"
  fi
fi

# ---------------------------------------------------------------------------
# 5. Restore session (if --restore-session)
# ---------------------------------------------------------------------------

if [ "$RESTORE_SESSION" = true ] && [ -n "$BACKUP_JSON" ]; then
  echo ""
  echo "--- Restoring session from backup ---"
  python3 "$SESSION_EDITOR" --instance "$INSTANCE_ID" --agent "$AGENT_NAME" restore --backup "$BACKUP_JSON" 2>/dev/null
  echo ""
  echo "NOTE: Agent restart required for restored session to take effect."
fi

# ---------------------------------------------------------------------------
# Output
# ---------------------------------------------------------------------------

echo ""
cat << EOF
{
  "status": "success",
  "instanceId": "$INSTANCE_ID",
  "agentName": "$AGENT_NAME",
  "model": "$MODEL",
  "provider": "$PROVIDER",
  "port": ${PORT:-null},
  "backupJson": ${BACKUP_JSON:+\"$BACKUP_JSON\"}${BACKUP_JSON:-null},
  "sessionRestored": $RESTORE_SESSION,
  "message": "Model switched. Config files updated on disk."
}
EOF
