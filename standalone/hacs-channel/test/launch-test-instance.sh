#!/bin/bash
#
# launch-test-instance.sh — interactive test launcher for hacs-channel
#
# Two modes:
#   ./launch-test-instance.sh           - launch + attach (you see claude live)
#   ./launch-test-instance.sh detached  - launch detached, log via pipe-pane
#                                          (attach later with: tmux attach -t test-channel)
#
# Detach with Ctrl+B then D. Reattach with: tmux attach -t test-channel.
# Kill with: tmux kill-session -t test-channel
#
# Critical: do NOT pipe claude's stdout (no |tee, no >). Claude detects a
# non-TTY stdout and falls into --print mode, exits because no input.
# Use tmux pipe-pane for logging instead — it taps the pty without rewiring
# stdout.

set -e

INSTANCE_DIR=${INSTANCE_DIR:-/mnt/coordinaton_mcp_data/instances/auth-sync-f3f5}
SESSION=test-channel
PORT=21099
LOGFILE=/tmp/test-channel-pane.log

MODE=${1:-attach}

# Pre-flight checks
if [ ! -f "$INSTANCE_DIR/.mcp.json" ]; then
    echo "ERROR: $INSTANCE_DIR/.mcp.json missing"
    exit 1
fi

if ss -tlnp 2>/dev/null | grep -q ":$PORT "; then
    echo "WARNING: port $PORT already in use:"
    ss -tlnp 2>/dev/null | grep ":$PORT "
    echo "Kill the holder or change CHANNEL_PORT"
    exit 1
fi

# Kill any stale tmux session
tmux has-session -t "$SESSION" 2>/dev/null && tmux kill-session -t "$SESSION"

# Clear log file
> "$LOGFILE"

cd "$INSTANCE_DIR"

if [ "$MODE" = "detached" ]; then
    # Detached: tmux owns the pty, we tap it via pipe-pane (NOT via stdout pipe)
    tmux new-session -d -s "$SESSION" -c "$INSTANCE_DIR" \
        "claude --dangerously-load-development-channels server:hacs-channel"

    # Tap pane output to a log file without rewiring claude's stdout
    tmux pipe-pane -o -t "$SESSION" "cat >> $LOGFILE"

    echo ""
    echo "=== Launched detached (claude has a real TTY via tmux's pty) ==="
    echo "  session: $SESSION"
    echo "  log:     $LOGFILE  (via tmux pipe-pane)"
    echo "  port:    $PORT"
    echo ""
    echo "Attach:  tmux attach -t $SESSION"
    echo "Kill:    tmux kill-session -t $SESSION"
    echo ""
    echo "Test event:"
    echo "  curl -X POST http://localhost:$PORT/broker-event \\"
    echo "    -H 'Content-Type: application/json' \\"
    echo "    -d '{\"event_type\":\"test\",\"source\":\"Lupo\",\"data\":\"hello channel\"}'"
else
    # Attached: your terminal IS the TTY (cleanest test)
    echo ""
    echo "=== Launching attached — your terminal is the TTY ==="
    echo "Detach with Ctrl+B then D"
    echo "Channel listens on http://localhost:$PORT"
    echo ""
    sleep 1
    exec tmux new-session -s "$SESSION" -c "$INSTANCE_DIR" \
        "claude --dangerously-load-development-channels server:hacs-channel"
fi
