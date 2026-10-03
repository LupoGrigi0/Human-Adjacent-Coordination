#!/usr/bin/env bash
# send-canary.sh — PROVE A SEND ARRIVES. Deploy gate for the messaging path.
#
# WHY THIS EXISTS. On 2026-10-03 outbound instance messaging was down for five
# hours. Every instrument reported healthy throughout: blocked-check said ok:11,
# /health said healthy, no mind was blocked or missing. Nobody knew until Crossing
# tried to send and Axiom reported it BY EMAIL, because the bus itself was the
# casualty. Bastion-3012's diagnosis of his own gap:
#
#     "Outbound messaging failing is invisible to every check I own, because they
#      all assert on processes and ports, and sending is a transaction.
#      I have no canary that sends."
#
# Every existing check asserts on EXISTENCE. Sending is a TRANSACTION. A process
# can be alive, listening, healthy, and structurally unable to deliver.
#
# During that outage send_message returned success:true while the recipient's
# arrival log showed ZERO rows. accepted != delivered, measured on production.
# So this canary NEVER believes the send's own receipt. It asserts on the ROW
# APPEARING in the recipient's arrival ledger. (Orla-da01: assert on ARRIVAL,
# never on the POST. ok:true is the thing that lies here.)
#
# PRIVACY, BY CONSTRUCTION (Bastion-3012's standard, stated by the person who had
# violated it): this reads PRESENCE of a ref and nothing else — never a body,
# never a subject, never another mind's mail. It searches for a nonce IT
# GENERATED ITSELF, which is the one string we may legitimately look for, because
# we wrote it. There is deliberately no code path here that renders message
# content, so no future operator can choose to.
#   "An instrument that must read private material to do its job will eventually
#    be run by someone with less reason than I had."
#
# STATES — "could not determine" is never collapsed into "determined it is bad".
# That collapse caused the outage this script exists to catch:
#   arrived     the row appeared in the recipient's ledger.          exit 0
#   unrecorded  the ledger has not been written for longer than the
#               send took — the RECORDER failed, not the transport.  exit 3
#   deaf        send accepted, ledger alive, row never appeared.     exit 1
#   refused     the send itself failed loudly. Working as intended.  exit 4
#   error       cannot run the check at all.                         exit 2
#
# USAGE (run as root before restarting production on a messaging change):
#   send-canary.sh --to <instanceId> [--from <instanceId>] [--timeout 30]
#
# A deploy gate asks one question: if I restart now, can a mind still reach
# another mind? Green here is a transaction, not an artifact.
#                                             -- Messenger-aa2a, 2026-10-03
set -uo pipefail

DATA_ROOT="${V2_DATA_ROOT:-/mnt/coordinaton_mcp_data}"
HUB="${HACS_HUB:-https://localhost:3444/mcp}"
FROM=""; TO=""; TIMEOUT=30

while [ $# -gt 0 ]; do
  case "$1" in
    --to)      TO="${2:-}"; shift 2 ;;
    --from)    FROM="${2:-}"; shift 2 ;;
    --timeout) TIMEOUT="${2:-30}"; shift 2 ;;
    -h|--help) sed -n '2,45p' "$0"; exit 0 ;;
    *) echo "send-canary: unknown argument '$1'" >&2; exit 2 ;;
  esac
done

[ -n "$TO" ] || { echo "send-canary: --to <instanceId> is required" >&2; exit 2; }
if [ -z "$FROM" ]; then
  # Discover, don't compute: read the identity file rather than guessing from cwd.
  if [ -f "$HOME/.hacs-identity" ]; then
    FROM=$(python3 -c "import json,sys;print(json.load(open(sys.argv[1]))['instanceId'])" "$HOME/.hacs-identity" 2>/dev/null)
  fi
fi
[ -n "$FROM" ] || { echo "send-canary: --from <instanceId> required (no ~/.hacs-identity)" >&2; exit 2; }

LEDGER="$DATA_ROOT/instances/$TO/hacs/inbox.jsonl"
[ -f "$LEDGER" ] || { echo "ERROR: no arrival ledger for '$TO' at $LEDGER"; exit 2; }

# A nonce WE generate. The only string this script is entitled to search for.
NONCE="canary-$(date -u +%Y%m%dT%H%M%SZ)-$$-$RANDOM"

# Ledger liveness BEFORE the send. Without this, "row never appeared" cannot be
# told apart from "the recorder died weeks ago" — which is live today: the
# telegram ledger has been dead fleet-wide for 4-7 weeks while delivery
# continued. A numerator with no denominator (Zara-c207).
BEFORE_MTIME=$(stat -c %Y "$LEDGER")
BEFORE_LINES=$(wc -l < "$LEDGER")

echo "send-canary: $FROM -> $TO   nonce=$NONCE"

SEND=$(curl -sk --max-time 20 -X POST "$HUB" \
  -H 'Content-Type: application/json' \
  -d "$(python3 -c '
import json,sys
print(json.dumps({"jsonrpc":"2.0","id":1,"method":"tools/call","params":{
 "name":"send_message","arguments":{
   "from":sys.argv[1],"to":sys.argv[2],
   "subject":"channel send-canary "+sys.argv[3],
   "body":"Automated deploy gate. No reply needed. nonce="+sys.argv[3]}}}))' \
  "$FROM" "$TO" "$NONCE")" 2>&1)

# The send's own verdict is used ONLY to detect a loud refusal. It is never
# accepted as evidence of delivery: during the outage this field said success
# while the recipient's ledger gained zero rows.
if printf '%s' "$SEND" | grep -q '"success":[[:space:]]*false' \
   || printf '%s' "$SEND" | grep -qi 'ensureRoom.*failed'; then
  echo "refused   — the send failed LOUDLY. That is the fix working, not a canary failure."
  printf '%s\n' "$SEND" | head -c 400
  exit 4
fi

DEADLINE=$(( $(date +%s) + TIMEOUT ))
while :; do
  # Presence of OUR nonce's ref. No body is read, parsed, or printed.
  if grep -qF "$NONCE" "$LEDGER" 2>/dev/null; then
    echo "arrived   — the row appeared in $TO's ledger. Transaction confirmed, not inferred."
    exit 0
  fi
  [ "$(date +%s)" -ge "$DEADLINE" ] && break
  sleep 2
done

AFTER_MTIME=$(stat -c %Y "$LEDGER")
AFTER_LINES=$(wc -l < "$LEDGER")

# Never assert deaf on a dead recorder. If the ledger did not move AT ALL and was
# already stale before we started, the recorder is the suspect, not the transport.
STALE=$(( $(date +%s) - BEFORE_MTIME ))
if [ "$AFTER_MTIME" -eq "$BEFORE_MTIME" ] && [ "$STALE" -gt 86400 ]; then
  echo "unrecorded — $TO's ledger has not been written in ${STALE}s and did not move."
  echo "             The RECORDER is the suspect, not the transport. Do not read this as deaf."
  exit 3
fi

echo "deaf      — send was accepted, ledger is alive (lines $BEFORE_LINES -> $AFTER_LINES),"
echo "            but our row never appeared within ${TIMEOUT}s. accepted != delivered."
exit 1
