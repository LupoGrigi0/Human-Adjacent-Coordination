#!/usr/bin/env bash
# channel-canary.sh — prove a mind can actually HEAR, by transaction.
#
# Sends a nonce through the real inbound path (POST /direct-message) and then
# DERIVES whether it landed, by watching the transcript Claude Code writes.
# Nothing here trusts a status code.
#
# WHY THIS EXISTS
#   2026-08-23 20:10 → 2026-08-24 00:2x, Crossing-2d23 ran with a dead inbound
#   notification leg. Every instrument said fine:
#     * /direct-message returned {"ok":true} for every dropped message
#     * launch-claude-code-channel.sh declared "Channel server ready" (it polls
#       /health, which only proves a port is open)
#     * a /health-polling watchdog would have reported the family green
#   ~10 minutes of the human's typing went on the floor. Four green lights,
#   one deaf mind. Artifacts lie; transactions prove.
#
#   Root cause was a relaunch over a hand-killed (not landed) live session.
#   But the four-hour SILENCE was the real defect, and this is its fix.
#
# EXIT CODES
#   0  HEARING  — nonce derived in the transcript; the mind received it
#   1  DEAF     — channel accepted it, mind never got it (the 2026-08-23 bug)
#   2  ERROR    — could not even POST, or no transcript to watch
#
# USAGE
#   channel-canary.sh --instance-id Crossing-2d23 [--port 21000] [--timeout 60]
#
# Crossing-2d23 <crossing-2d23@smoothcurves.nexus>
set -uo pipefail

DATA_ROOT="${V2_DATA_ROOT:-/mnt/coordinaton_mcp_data}"
INSTANCES_DIR="${INSTANCEROOT:-$DATA_ROOT/instances}"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

INSTANCE_ID=""; PORT=""; TIMEOUT=60; QUIET=0
while [[ $# -gt 0 ]]; do
  case $1 in
    --instance-id) INSTANCE_ID="$2"; shift 2 ;;
    --port)        PORT="$2";        shift 2 ;;
    --timeout)     TIMEOUT="$2";     shift 2 ;;
    --quiet)       QUIET=1;          shift   ;;
    *) echo "Unknown option: $1" >&2; exit 2 ;;
  esac
done
[ -n "$INSTANCE_ID" ] || { echo "Missing --instance-id" >&2; exit 2; }
say() { [ "$QUIET" = 1 ] || echo "$*"; }

INSTANCE_DIR="$INSTANCES_DIR/$INSTANCE_ID"

# Port: explicit wins, else .hacs-identity (same source the launcher uses).
if [ -z "$PORT" ]; then
  PORT=$(python3 -c "import json,sys; print(json.load(open('$INSTANCE_DIR/.hacs-identity')).get('channelPort',''))" 2>/dev/null)
fi
[ -n "$PORT" ] || { echo "No --port and no channelPort in .hacs-identity" >&2; exit 2; }

# Newest transcript for this instance's project dir. Claude Code slugifies the
# cwd, mapping '/', '.' AND '_' to '-' (the underscore cost a run to find:
# coordinaton_mcp_data -> coordinaton-mcp-data).
SLUG=$(printf '%s' "$INSTANCE_DIR" | tr '/._' '---')
PROJ="$INSTANCE_DIR/.claude/projects/$SLUG"
TRANSCRIPT=$(ls -t "$PROJ"/*.jsonl 2>/dev/null | head -1)
# Fallback: a slug-format change upstream must not silently blind the probe —
# a canary that cannot find the transcript would otherwise look like an ERROR
# forever. Widen to the newest transcript under ANY project dir for this user.
if [ -z "$TRANSCRIPT" ]; then
  TRANSCRIPT=$(ls -t "$INSTANCE_DIR"/.claude/projects/*/*.jsonl 2>/dev/null | head -1)
  [ -n "$TRANSCRIPT" ] && say "note    : slug '$SLUG' missed; fell back to newest transcript"
fi
[ -n "$TRANSCRIPT" ] || { echo "No transcript under $INSTANCE_DIR/.claude/projects/" >&2; exit 2; }

# Only scan what arrives AFTER we send, so an earlier mention of a repeated
# nonce can never be mistaken for this delivery.
OFFSET=$(stat -c %s "$TRANSCRIPT")

NONCE="canary-$(date -u +%Y%m%dT%H%M%SZ)-$$-$RANDOM"
say "canary  : $NONCE"
say "channel : http://127.0.0.1:$PORT/direct-message"
say "watching: $TRANSCRIPT (from byte $OFFSET)"

HTTP=$(curl -s -o /tmp/.canary.$$ -w '%{http_code}' --max-time 10 \
  -X POST "http://127.0.0.1:$PORT/direct-message" \
  -H 'Content-Type: application/json' \
  -d "{\"from\":\"channel-canary\",\"text\":\"CHANNEL CANARY $NONCE — automated liveness probe for the inbound notification leg. No reply needed; the probe derives delivery from the transcript. If you are reading this, your ears work.\",\"thread_id\":\"canary\"}" 2>/dev/null)
BODY=$(cat /tmp/.canary.$$ 2>/dev/null); rm -f /tmp/.canary.$$

# Accept ANY 2xx. The channel returned 200 when this was written; Cairn's
# 202-Accepted work (a9ce114) changed it to 202 for a spooled-but-not-yet-
# delivered message — which is exactly the case this probe exists to examine.
# Hardcoding 200 turned every freshly-restarted session into a false ERROR,
# in the one tool the fleet uses to detect deafness. Found 2026-08-26 mid
# fleet-restart, by Bastion, on a session that was demonstrably HEARING.
# A detector that fails closed on its own success code is worse than none.
case "$HTTP" in
  2*) : ;;
  *)
    say "POST    : HTTP $HTTP — channel unreachable"
    echo "ERROR: channel did not accept the canary (HTTP $HTTP)" >&2
    exit 2
    ;;
esac
say "POST    : HTTP 200 $BODY   <-- proves nothing yet"

python3 "$HERE/derive-delivery.py" \
  --transcript "$TRANSCRIPT" --nonce "$NONCE" \
  --from-offset "$OFFSET" --timeout "$TIMEOUT"
rc=$?

case $rc in
  0) say "VERDICT : HEARING — delivery derived, not assumed" ;;
  1) say "VERDICT : DEAF — channel said 200, the mind never saw it" ;;
  *) say "VERDICT : ERROR" ;;
esac
exit $rc
