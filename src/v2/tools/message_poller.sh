#!/bin/bash
#
# message_poller.sh - Poll for new V2 coordination messages
#
# A reusable script for polling messages with last-seen tracking.
# Works around the lack of read tracking by maintaining state locally.
#
# Usage:
#   ./message_poller.sh <instance_id> [--timeout 300] [--interval 5] [--state-file /path/to/state]
#
# When a new message is detected (ID greater than last seen), outputs JSON and exits.
# The calling process can then read the message, reply, and restart the poller.
#
# Author: Bastion (DevOps)
# Created: 2025-12-14
#

set -e

# Defaults
INSTANCE_ID=""
TIMEOUT=300
INTERVAL=5
STATE_DIR="/tmp/v2-message-poller"
MCP_URL="http://localhost:3446/mcp"

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --timeout)
            TIMEOUT="$2"
            shift 2
            ;;
        --interval)
            INTERVAL="$2"
            shift 2
            ;;
        --state-file)
            STATE_FILE="$2"
            shift 2
            ;;
        --url)
            MCP_URL="$2"
            shift 2
            ;;
        --help)
            echo "Usage: $0 <instance_id> [--timeout 300] [--interval 5] [--state-file /path] [--url http://...]"
            echo ""
            echo "Options:"
            echo "  --timeout    Maximum seconds to wait (default: 300)"
            echo "  --interval   Seconds between polls (default: 5)"
            echo "  --state-file File to store last-seen message ID (default: /tmp/v2-message-poller/<instance_id>.last)"
            echo "  --url        MCP endpoint URL (default: http://localhost:3446/mcp)"
            exit 0
            ;;
        *)
            if [[ -z "$INSTANCE_ID" ]]; then
                INSTANCE_ID="$1"
            fi
            shift
            ;;
    esac
done

if [[ -z "$INSTANCE_ID" ]]; then
    echo "Error: instance_id is required" >&2
    echo "Usage: $0 <instance_id> [--timeout 300] [--interval 5]" >&2
    exit 1
fi

# Setup state file
mkdir -p "$STATE_DIR"
STATE_FILE="${STATE_FILE:-$STATE_DIR/${INSTANCE_ID}.last}"

# Read last seen message ID (default to 0 if not exists)
if [[ -f "$STATE_FILE" ]]; then
    LAST_SEEN=$(cat "$STATE_FILE")
else
    LAST_SEEN="0"
fi

echo "[poller] Instance: $INSTANCE_ID" >&2
echo "[poller] Last seen: $LAST_SEEN" >&2
echo "[poller] Timeout: ${TIMEOUT}s, Interval: ${INTERVAL}s" >&2
echo "[poller] State file: $STATE_FILE" >&2

START_TIME=$(date +%s)
POLL_COUNT=0

while true; do
    CURRENT_TIME=$(date +%s)
    ELAPSED=$((CURRENT_TIME - START_TIME))

    if [[ $ELAPSED -ge $TIMEOUT ]]; then
        echo "[poller] Timeout after $POLL_COUNT polls" >&2
        echo '{"success": false, "reason": "timeout", "polls": '$POLL_COUNT', "elapsed": '$ELAPSED'}'
        exit 0
    fi

    POLL_COUNT=$((POLL_COUNT + 1))

    # Poll for messages
    RESULT=$(curl -s -X POST "$MCP_URL" \
        -H "Content-Type: application/json" \
        -d '{
            "jsonrpc": "2.0",
            "id": 1,
            "method": "tools/call",
            "params": {
                "name": "xmpp_get_messages",
                "arguments": {
                    "instanceId": "'"$INSTANCE_ID"'",
                    "limit": 5
                }
            }
        }' 2>/dev/null)

    if [[ -z "$RESULT" ]]; then
        echo "[poller] Network error on poll $POLL_COUNT" >&2
        sleep "$INTERVAL"
        continue
    fi

    # Extract the latest message ID using grep (portable, no jq dependency)
    LATEST_ID=$(echo "$RESULT" | grep -o '"id":"[0-9]*"' | head -1 | grep -o '[0-9]*' || echo "0")

    if [[ -n "$LATEST_ID" && "$LATEST_ID" != "0" ]]; then
        # Compare as strings (they're numeric strings, lexicographic works for same-length)
        if [[ "$LATEST_ID" > "$LAST_SEEN" ]]; then
            echo "[poller] New message detected: $LATEST_ID (was: $LAST_SEEN)" >&2

            # Update state file
            echo "$LATEST_ID" > "$STATE_FILE"

            # Output the new messages (IDs greater than LAST_SEEN)
            # For simplicity, output the full result - caller can parse
            echo '{"success": true, "new_message_id": "'"$LATEST_ID"'", "previous_last_seen": "'"$LAST_SEEN"'", "polls": '$POLL_COUNT', "elapsed": '$ELAPSED', "raw_result": '"$RESULT"'}'
            exit 0
        fi
    fi

    # Status update every 10 polls
    if [[ $((POLL_COUNT % 10)) -eq 0 ]]; then
        REMAINING=$((TIMEOUT - ELAPSED))
        echo "[poller] Poll $POLL_COUNT, ${REMAINING}s remaining, latest: $LATEST_ID" >&2
    fi

    sleep "$INTERVAL"
done
