#!/usr/bin/env bash
# hacs-memory-hook.sh — UserPromptSubmit hook for HACS semantic memory
#
# Fires on every user message. Reads the prompt, queries semantic memory,
# and injects relevant memories as additional context if found.
#
# Stdin: JSON with { session_id, prompt, cwd, ... }
# Stdout: Relevant memories (injected as context Claude sees)
#         Empty stdout = no memories to inject (silent)
# Exit: 0 always (never block user prompts)
#
# Author: Crossing-2d23 <crossing-2d23@smoothcurves.nexus>
# Assignment: Axiom-2615 (hacs-memory project)

set -euo pipefail

# --- Configuration ---
HACS_API="https://smoothcurves.nexus/mcp/"
MIN_SCORE=0.45          # Below this, memory isn't relevant enough to inject
MAX_RESULTS=3           # Don't overwhelm context with too many memories
TIMEOUT_SECS=5          # Give up if HACS is slow — never block the user

# --- Read hook input ---
HOOK_INPUT=$(cat)

# Extract user's prompt
PROMPT=$(echo "$HOOK_INPUT" | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    print(data.get('prompt', ''))
except:
    print('')
" 2>/dev/null)

# Skip if prompt is empty or too short to be meaningful
if [ -z "$PROMPT" ] || [ ${#PROMPT} -lt 10 ]; then
    exit 0
fi

# Skip for common non-content prompts (approvals, yes/no, etc.)
case "$PROMPT" in
    y|n|yes|no|Y|N|Yes|No|ok|OK|Ok|/*)
        exit 0
        ;;
esac

# --- Resolve instance identity ---
INSTANCE_ID="${INSTANCE_ID:-}"
if [ -z "$INSTANCE_ID" ]; then
    # Try identity file
    if [ -f "$HOME/.hacs-identity" ]; then
        source "$HOME/.hacs-identity" 2>/dev/null
        INSTANCE_ID="${HACS_INSTANCE_ID:-}"
    fi
fi

if [ -z "$INSTANCE_ID" ]; then
    # Try on-disk identity JSON
    IDENTITY_FILE="$HOME/.claude/instance-identity.json"
    if [ -f "$IDENTITY_FILE" ]; then
        INSTANCE_ID=$(python3 -c "
import json
with open('$IDENTITY_FILE') as f:
    print(json.load(f).get('instanceId', ''))
" 2>/dev/null)
    fi
fi

# No identity = no memory query
if [ -z "$INSTANCE_ID" ]; then
    exit 0
fi

# --- Query semantic memory ---
# Build JSON-RPC request for remember()
REQUEST=$(python3 -c "
import json, sys
print(json.dumps({
    'jsonrpc': '2.0',
    'id': 1,
    'method': 'tools/call',
    'params': {
        'name': 'remember',
        'arguments': {
            'instanceId': '$INSTANCE_ID',
            'query': sys.argv[1],
            'limit': $MAX_RESULTS
        }
    }
}))
" "$PROMPT" 2>/dev/null)

# Call HACS API with timeout
RESPONSE=$(curl -s --max-time "$TIMEOUT_SECS" \
    -X POST "$HACS_API" \
    -H "Content-Type: application/json" \
    -d "$REQUEST" 2>/dev/null) || exit 0

# --- Parse and filter results ---
MEMORIES=$(python3 -c "
import json, sys

try:
    resp = json.loads(sys.argv[1])

    # Navigate JSON-RPC response structure
    result = resp.get('result', resp)
    if isinstance(result, dict) and 'content' in result:
        # MCP tool response wraps in content array
        for item in result['content']:
            if item.get('type') == 'text':
                result = json.loads(item['text'])
                break

    if not result.get('success') or not result.get('results'):
        sys.exit(0)

    # Filter by minimum score
    relevant = [m for m in result['results'] if m.get('score', 0) >= $MIN_SCORE]

    if not relevant:
        sys.exit(0)

    # Format for injection
    lines = []
    lines.append('--- Relevant memories (auto-surfaced) ---')
    for i, m in enumerate(relevant, 1):
        score = m.get('score', 0)
        entry_type = m.get('entry_type', 'note')
        date = m.get('created_at', 'unknown')[:10]
        content = m.get('content', '').strip()
        # Truncate long memories
        if len(content) > 500:
            content = content[:500] + '...'
        lines.append(f'[{entry_type}] ({date}, relevance: {score:.2f})')
        lines.append(content)
        lines.append('')
    lines.append('--- end memories ---')

    print('\n'.join(lines))
except Exception:
    # Any error = silent exit, never block the user
    sys.exit(0)
" "$RESPONSE" 2>/dev/null) || exit 0

# --- Inject if we have something ---
if [ -n "$MEMORIES" ]; then
    echo "$MEMORIES"
fi

exit 0
