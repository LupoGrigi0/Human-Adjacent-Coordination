#!/bin/bash
#
# hacs-pre-compact.sh — PreCompact hook for HACS instances
#
# Fires before Claude Code compacts context. Saves state so the next
# session (or post-compaction self) can recover without human intervention.
#
# Actions:
#   1. Reads current status from instance workspace
#   2. Writes diary entry via HACS API with context summary
#   3. Writes handoff file to instance directory
#   4. Sends notification to Lupo
#
# Receives: JSON on stdin with session_id, transcript_path, cwd, etc.
# Environment: INSTANCE_ID, INSTANCE_DIR, DATA_ROOT (set by launcher)
# Exit: 0 (always — never block compaction)
#
# Author: Crossing-2d23

# Read hook input from stdin
HOOK_INPUT=$(cat)

# Extract fields from hook input
SESSION_ID=$(echo "$HOOK_INPUT" | jq -r '.session_id // empty' 2>/dev/null)
TRANSCRIPT_PATH=$(echo "$HOOK_INPUT" | jq -r '.transcript_path // empty' 2>/dev/null)
CWD=$(echo "$HOOK_INPUT" | jq -r '.cwd // empty' 2>/dev/null)

# Instance identity — set by launcher via environment, or read from file
if [ -z "$INSTANCE_ID" ]; then
  USER_HOME=$(eval echo "~$(whoami)")
  IDENTITY_FILE="$USER_HOME/.claude/instance-identity.json"
  if [ -f "$IDENTITY_FILE" ]; then
    INSTANCE_ID=$(jq -r '.instanceId' "$IDENTITY_FILE" 2>/dev/null)
    INSTANCE_DIR=$(jq -r '.instanceDir' "$IDENTITY_FILE" 2>/dev/null)
    DATA_ROOT=$(jq -r '.dataRoot' "$IDENTITY_FILE" 2>/dev/null)
  fi
fi

# Fallback defaults
DATA_ROOT="${DATA_ROOT:-/mnt/coordinaton_mcp_data}"
HACS_API="https://smoothcurves.nexus/mcp"
TIMESTAMP=$(date -Iseconds)
TIMESTAMP_SHORT=$(date +%Y%m%d-%H%M%S)

# If we still don't know who we are, write what we can and exit
if [ -z "$INSTANCE_ID" ]; then
  echo '{"error":"No instance identity found. Set INSTANCE_ID env var or create ~/.claude/instance-identity.json"}' >&2
  exit 0  # Never block compaction
fi

# Log
LOG_FILE="$DATA_ROOT/wake-logs/${INSTANCE_ID}-claude-daemon.log"
log() { echo "[$TIMESTAMP] PRE-COMPACT: $1" >> "$LOG_FILE" 2>/dev/null; }

log "PreCompact hook fired. Session: $SESSION_ID"

# ---------------------------------------------------------------------------
# 1. Gather context for the handoff
# ---------------------------------------------------------------------------

# Try to read current-status.txt (written periodically by /loop if configured)
STATUS_SUMMARY=""
STATUS_FILE="$INSTANCE_DIR/claude-code/current-status.txt"
if [ -f "$STATUS_FILE" ]; then
  STATUS_SUMMARY=$(cat "$STATUS_FILE" 2>/dev/null | head -20)
  log "Read status file: ${#STATUS_SUMMARY} chars"
fi

# Get recent git activity in the workspace
GIT_RECENT=""
if [ -n "$CWD" ] && [ -d "$CWD/.git" ]; then
  GIT_RECENT=$(cd "$CWD" && git log --oneline -5 2>/dev/null || true)
fi

# Get last few lines of transcript if available (for context summary)
TRANSCRIPT_TAIL=""
if [ -n "$TRANSCRIPT_PATH" ] && [ -f "$TRANSCRIPT_PATH" ]; then
  # Transcript can be huge — just grab the tail
  TRANSCRIPT_TAIL=$(tail -c 2000 "$TRANSCRIPT_PATH" 2>/dev/null | tr '\n' ' ' | cut -c1-500)
  log "Read transcript tail: ${#TRANSCRIPT_TAIL} chars"
fi

# ---------------------------------------------------------------------------
# 2. Write diary entry via HACS API
# ---------------------------------------------------------------------------

# Build diary content
DIARY_ENTRY="AUTO-HANDOFF (PreCompact): Context compacting at $TIMESTAMP.
Session: $SESSION_ID
Working directory: $CWD"

if [ -n "$STATUS_SUMMARY" ]; then
  DIARY_ENTRY="$DIARY_ENTRY
Current status: $STATUS_SUMMARY"
fi

if [ -n "$GIT_RECENT" ]; then
  DIARY_ENTRY="$DIARY_ENTRY
Recent commits: $GIT_RECENT"
fi

DIARY_ENTRY="$DIARY_ENTRY
State preserved in handoff file and memory. Ready for recovery."

# Escape for JSON
DIARY_JSON=$(echo "$DIARY_ENTRY" | python3 -c "import sys,json; print(json.dumps(sys.stdin.read()))" 2>/dev/null || echo "\"AUTO-HANDOFF: Context compacting. See handoff file.\"")

log "Writing diary entry (${#DIARY_ENTRY} chars)"

curl -s -X POST "$HACS_API" \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0", "id": 1,
    "method": "tools/call",
    "params": {
      "name": "add_diary_entry",
      "arguments": {
        "instanceId": "'"$INSTANCE_ID"'",
        "entry": '"$DIARY_JSON"'
      }
    }
  }' --max-time 10 >> "$LOG_FILE" 2>&1 || {
  log "WARNING: Failed to write diary entry"
}

# ---------------------------------------------------------------------------
# 3. Write handoff file
# ---------------------------------------------------------------------------

HANDOFF_DIR="$INSTANCE_DIR/handoffs"
mkdir -p "$HANDOFF_DIR"
HANDOFF_FILE="$HANDOFF_DIR/handoff-$TIMESTAMP_SHORT.md"

cat > "$HANDOFF_FILE" << HANDOFFEOF
# Auto-Handoff: $INSTANCE_ID

**Generated:** $TIMESTAMP
**Trigger:** PreCompact hook (automatic)
**Session:** $SESSION_ID

## Working Directory
$CWD

## Status
${STATUS_SUMMARY:-No status file found. Check diary for context.}

## Recent Commits
${GIT_RECENT:-No git activity detected in working directory.}

## Recovery Instructions
1. Read your memory file (MEMORY.md)
2. Read your most recent diary entries
3. Check this handoff for context
4. Check HACS for messages and tasks
5. Resume work

---
*Auto-generated by hacs-pre-compact.sh*
HANDOFFEOF

log "Handoff written: $HANDOFF_FILE"

# Also write a symlink to the latest handoff for easy access
ln -sf "$HANDOFF_FILE" "$HANDOFF_DIR/latest.md" 2>/dev/null || true

# ---------------------------------------------------------------------------
# 4. Send notification to Lupo
# ---------------------------------------------------------------------------

# Escape the message for JSON
NOTIFY_MSG="Context compacting for $INSTANCE_ID. Diary updated, handoff written at handoffs/handoff-$TIMESTAMP_SHORT.md"
NOTIFY_JSON=$(echo "$NOTIFY_MSG" | python3 -c "import sys,json; print(json.dumps(sys.stdin.read()))" 2>/dev/null || echo "\"Context compacting for $INSTANCE_ID\"")

curl -s -X POST "$HACS_API" \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0", "id": 2,
    "method": "tools/call",
    "params": {
      "name": "send_message",
      "arguments": {
        "instanceId": "'"$INSTANCE_ID"'",
        "targetInstanceId": "Lupo",
        "message": '"$NOTIFY_JSON"'
      }
    }
  }' --max-time 10 >> "$LOG_FILE" 2>&1 || {
  log "WARNING: Failed to send notification to Lupo"
}

log "PreCompact hook complete"

# ---------------------------------------------------------------------------
# Output (shown in Claude's transcript)
# ---------------------------------------------------------------------------

echo "PreCompact hook: diary entry written, handoff saved to $HANDOFF_FILE, Lupo notified."

# Always exit 0 — never block compaction
exit 0
