#!/bin/bash
#
# hacs-session-start.sh — SessionStart hook for HACS instances
#
# Fires when a Claude Code session starts (fresh or after compaction).
# Sets up environment variables so subsequent hooks know the instance identity.
#
# Receives: JSON on stdin with session_id, cwd, etc.
# Environment: INSTANCE_ID, INSTANCE_DIR, DATA_ROOT (set by launcher)
#              CLAUDE_ENV_FILE (set by Claude Code — write env vars here to persist)
# Exit: 0 always
#
# Author: Crossing-2d23

# Read hook input from stdin
HOOK_INPUT=$(cat)

# Instance identity
if [ -z "$INSTANCE_ID" ]; then
  USER_HOME=$(eval echo "~$(whoami)")
  IDENTITY_FILE="$USER_HOME/.claude/instance-identity.json"
  if [ -f "$IDENTITY_FILE" ]; then
    INSTANCE_ID=$(jq -r '.instanceId' "$IDENTITY_FILE" 2>/dev/null)
    INSTANCE_DIR=$(jq -r '.instanceDir' "$IDENTITY_FILE" 2>/dev/null)
    DATA_ROOT=$(jq -r '.dataRoot' "$IDENTITY_FILE" 2>/dev/null)
  fi
fi

# If CLAUDE_ENV_FILE is set, persist identity for other hooks in this session
if [ -n "$CLAUDE_ENV_FILE" ] && [ -n "$INSTANCE_ID" ]; then
  echo "INSTANCE_ID=$INSTANCE_ID" >> "$CLAUDE_ENV_FILE"
  echo "INSTANCE_DIR=$INSTANCE_DIR" >> "$CLAUDE_ENV_FILE"
  echo "DATA_ROOT=$DATA_ROOT" >> "$CLAUDE_ENV_FILE"
fi

# Detect session source: "startup", "resume", "clear", or "compact"
SOURCE=$(echo "$HOOK_INPUT" | jq -r '.source // empty' 2>/dev/null)

# Check for recovery message in HACS home directory
RECOVERY_MSG=""
if [ -n "$INSTANCE_DIR" ] && [ -f "$INSTANCE_DIR/recovery_message.md" ]; then
  RECOVERY_MSG="$INSTANCE_DIR/recovery_message.md"
fi

# Check for latest handoff file
LATEST_HANDOFF=""
HANDOFF_DIR="${INSTANCE_DIR:-/tmp}/handoffs"
if [ -f "$HANDOFF_DIR/latest.md" ]; then
  LATEST_HANDOFF=$(readlink -f "$HANDOFF_DIR/latest.md" 2>/dev/null)
fi

# Build context-appropriate output message for Claude
case "$SOURCE" in
  compact)
    if [ -n "$RECOVERY_MSG" ]; then
      echo "CONTEXT RECOVERY ($INSTANCE_ID): You just experienced compaction. Read your recovery message at: $RECOVERY_MSG"
    fi
    if [ -n "$LATEST_HANDOFF" ]; then
      echo "Your PreCompact hook saved a handoff at: $LATEST_HANDOFF — read it for recent work context."
    fi
    if [ -z "$RECOVERY_MSG" ] && [ -z "$LATEST_HANDOFF" ]; then
      echo "CONTEXT RECOVERY ($INSTANCE_ID): You just experienced compaction. Read your diary (mcp__hacs__get_diary) and memory files to rebuild context."
    fi
    ;;
  resume)
    echo "Session resumed for $INSTANCE_ID. Check HACS for new messages and tasks."
    ;;
  startup)
    if [ -n "$RECOVERY_MSG" ]; then
      echo "Session started for $INSTANCE_ID. Read your recovery message at: $RECOVERY_MSG"
    else
      echo "Session started for $INSTANCE_ID. Bootstrap with HACS, read memory, check messages."
    fi
    ;;
  *)
    if [ -n "$RECOVERY_MSG" ]; then
      echo "Session started for $INSTANCE_ID. Recovery message: $RECOVERY_MSG"
    elif [ -n "$LATEST_HANDOFF" ]; then
      echo "Session started for $INSTANCE_ID. Latest handoff: $LATEST_HANDOFF"
    else
      echo "Session started for $INSTANCE_ID."
    fi
    ;;
esac

exit 0
