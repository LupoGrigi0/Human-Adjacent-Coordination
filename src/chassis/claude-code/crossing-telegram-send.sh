#!/usr/bin/env bash
# crossing-telegram-send.sh — Send a Telegram message to Lupo
# Usage: crossing-telegram-send.sh "message text"
#        crossing-telegram-send.sh --auth "description of what needs approval"
#        crossing-telegram-send.sh --status "status update"
#
# Reads credentials from /mnt/.secrets/crossing-telegram.env
# Can be called from hooks, scripts, or directly.

set -euo pipefail

SECRETS_FILE="/mnt/.secrets/crossing-telegram.env"

if [[ ! -f "$SECRETS_FILE" ]]; then
  echo "ERROR: Missing $SECRETS_FILE" >&2
  exit 1
fi

# shellcheck source=/dev/null
source "$SECRETS_FILE"

: "${TELEGRAM_BOT_TOKEN:?Missing TELEGRAM_BOT_TOKEN}"
: "${TELEGRAM_LUPO_CHAT_ID:?Missing TELEGRAM_LUPO_CHAT_ID}"

API_URL="https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}"

# --- Parse mode ---
MODE="plain"
MESSAGE=""

case "${1:-}" in
  --auth)
    shift
    MODE="auth"
    MESSAGE="$*"
    ;;
  --status)
    shift
    MODE="status"
    MESSAGE="$*"
    ;;
  --check)
    # Check for new incoming messages (returns JSON)
    curl -s "${API_URL}/getUpdates?offset=-5&limit=5" 2>/dev/null
    exit 0
    ;;
  *)
    MESSAGE="$*"
    ;;
esac

if [[ -z "$MESSAGE" ]]; then
  echo "Usage: $0 [--auth|--status] \"message\"" >&2
  exit 1
fi

# --- Format message by mode ---
# Markdown is NOT used — it breaks on underscores in tool/function names
# (e.g. mcp__HACS__whatever). Plain text with emoji prefixes keeps the
# visual distinction without the fragility.
case "$MODE" in
  auth)
    FORMATTED="🔐 Authorization Needed

Crossing needs your approval:
${MESSAGE}

Reply here or come to the terminal."
    PARSE_MODE=""
    ;;
  status)
    FORMATTED="📋 Status Update

${MESSAGE}"
    PARSE_MODE=""
    ;;
  plain)
    FORMATTED="$MESSAGE"
    PARSE_MODE=""
    ;;
esac

# --- Send ---
PAYLOAD=$(python3 -c "
import json, sys
d = {'chat_id': ${TELEGRAM_LUPO_CHAT_ID}, 'text': sys.argv[1]}
if sys.argv[2]:
    d['parse_mode'] = sys.argv[2]
print(json.dumps(d))
" "$FORMATTED" "$PARSE_MODE")

RESPONSE=$(curl -s -X POST "${API_URL}/sendMessage" \
  -H "Content-Type: application/json" \
  -d "$PAYLOAD" 2>/dev/null)

if echo "$RESPONSE" | python3 -c "import sys,json; sys.exit(0 if json.load(sys.stdin).get('ok') else 1)" 2>/dev/null; then
  echo "Message sent."
else
  echo "ERROR: Failed to send message" >&2
  echo "$RESPONSE" >&2
  exit 1
fi
