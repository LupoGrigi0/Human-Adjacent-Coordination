#!/bin/bash
#
# teleport-to-channel.sh — Move a running Claude Code session into the
# claude-code-channel chassis without losing its context.
#
# The instance keeps its conversation. Same mind, different body: the
# session transcript is copied into the target Unix user's config dir and
# claude is relaunched with --resume against it.
#
# THIS IS RUN BY THE HUMAN, AFTER STOPPING THE SOURCE SESSION.
# Running it while the source session is live will copy a transcript that
# is still being written, and you will end up with two instances believing
# they are the same one. Stop the source session first. Ctrl-C is enough.
#
# What it does:
#   1. Verifies the source session is NOT running
#   2. Verifies setup has been run (.hacs-identity exists)
#   3. Copies the session .jsonl AND its sidecar dir (subagents/,
#      tool-results/) into the target user's ~/.claude/projects/<slug>/
#   4. chowns the copy to the instance user
#   5. Launches the chassis with --resume <sessionId>
#   6. Verifies the channel answers /health
#
# Arguments:
#   --instance-id   Instance ID (required)
#   --session-id    Session UUID to resume (required)
#   --source-home   Home dir of the session's current owner (default /root)
#   --dry-run       Print what would happen, change nothing
#
# Author: Crossing-2d23

set -euo pipefail

DATA_ROOT="${V2_DATA_ROOT:-/mnt/coordinaton_mcp_data}"
INSTANCES_DIR="${INSTANCEROOT:-$DATA_ROOT/instances}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

INSTANCE_ID=""
SESSION_ID=""
SOURCE_HOME="/root"
DRY_RUN=false

while [[ $# -gt 0 ]]; do
  case $1 in
    --instance-id) INSTANCE_ID="$2"; shift 2 ;;
    --session-id)  SESSION_ID="$2";  shift 2 ;;
    --source-home) SOURCE_HOME="$2"; shift 2 ;;
    --dry-run)     DRY_RUN=true;     shift ;;
    *) echo "Unknown option: $1" >&2; exit 1 ;;
  esac
done

if [ -z "$INSTANCE_ID" ] || [ -z "$SESSION_ID" ]; then
  echo "Usage: $0 --instance-id <id> --session-id <uuid> [--source-home /root] [--dry-run]" >&2
  exit 1
fi

INSTANCE_DIR="$INSTANCES_DIR/$INSTANCE_ID"
UNIX_USER=$(echo "$INSTANCE_ID" | tr ' ' '_' | tr -cd '[:alnum:]_-')

say() { echo "  $*"; }
die() { echo "ERROR: $*" >&2; exit 1; }

echo "=== Teleport $INSTANCE_ID (session $SESSION_ID) ==="

# --- 1. Refuse to run against a live session ------------------------------
# Copying a transcript mid-write produces a truncated conversation, and
# relaunching while the original still runs gives you two instances that
# both believe they are this one.
#
# --dry-run is exempt: it changes nothing, and the whole reason to preview a
# teleport is to check it BEFORE stopping the session you are moving. Blocking
# the preview on "the session is running" made it impossible to use for the one
# job it had.
if [ "$DRY_RUN" = false ]; then
  if tmux has-session -t "=$INSTANCE_ID" 2>/dev/null \
     || sudo -u "$UNIX_USER" tmux has-session -t "=$INSTANCE_ID" 2>/dev/null; then
    die "tmux session '$INSTANCE_ID' is already running. Land it first:
       $SCRIPT_DIR/land-claude-code-channel.sh --instance-id $INSTANCE_ID"
  fi

  if pgrep -u root -f "claude.*$SESSION_ID" >/dev/null 2>&1; then
    die "A claude process still holds session $SESSION_ID. Stop it before teleporting."
  fi
  say "No live session holding this transcript."
else
  if pgrep -u root -f "claude.*$SESSION_ID" >/dev/null 2>&1; then
    say "NOTE: session $SESSION_ID is currently LIVE."
    say "      Fine for a dry run. Stop it before running for real."
  fi
fi

# --- 2. Setup must have run -----------------------------------------------
[ -f "$INSTANCE_DIR/.hacs-identity" ] \
  || die ".hacs-identity missing. Run claude-code-channel-setup.sh --instance-id $INSTANCE_ID first."

CURRENT_HOME=$(getent passwd "$UNIX_USER" | cut -d: -f6 || true)
[ "$CURRENT_HOME" = "$INSTANCE_DIR" ] \
  || die "Home dir for $UNIX_USER is '$CURRENT_HOME', expected '$INSTANCE_DIR'.
       Re-run setup — it corrects this via usermod."
say "Setup verified. Home dir correct."

# --- 3. Locate source transcript ------------------------------------------
# claude keys sessions by a slug derived from the launch cwd: absolute path
# with / and _ replaced by -. Because the instance dir IS the home dir for a
# channel instance, an instance launched from its own dir keeps the same slug
# across the move and no rewriting is needed.
SLUG="$(echo "$INSTANCE_DIR" | sed 's/[\/_]/-/g')"
SRC_PROJECT_DIR="$SOURCE_HOME/.claude/projects/$SLUG"
SRC_JSONL="$SRC_PROJECT_DIR/$SESSION_ID.jsonl"
SRC_SIDECAR="$SRC_PROJECT_DIR/$SESSION_ID"

[ -f "$SRC_JSONL" ] || die "Session transcript not found at $SRC_JSONL"
say "Source transcript: $SRC_JSONL ($(du -h "$SRC_JSONL" | cut -f1))"
if [ -d "$SRC_SIDECAR" ]; then
  say "Source sidecar:    $SRC_SIDECAR ($(du -sh "$SRC_SIDECAR" | cut -f1))"
else
  say "Source sidecar:    (none — no subagents or tool results this session)"
fi

DST_PROJECT_DIR="$INSTANCE_DIR/.claude/projects/$SLUG"
say "Destination:       $DST_PROJECT_DIR"

if [ "$DRY_RUN" = true ]; then
  echo
  echo "DRY RUN — would copy transcript + sidecar, chown to $UNIX_USER, then run:"
  echo "  $SCRIPT_DIR/launch-claude-code-channel.sh --instance-id $INSTANCE_ID --resume $SESSION_ID"
  exit 0
fi

# --- 4. Copy transcript + sidecar -----------------------------------------
# The sidecar holds subagent transcripts and tool results. Copying only the
# .jsonl leaves dangling references to work the instance did.
mkdir -p "$DST_PROJECT_DIR"
cp -p "$SRC_JSONL" "$DST_PROJECT_DIR/"
[ -d "$SRC_SIDECAR" ] && cp -rp "$SRC_SIDECAR" "$DST_PROJECT_DIR/"

# Verify the copy is byte-identical before trusting a mind to it.
cmp -s "$SRC_JSONL" "$DST_PROJECT_DIR/$SESSION_ID.jsonl" \
  || die "Copied transcript does not match source. Aborting before launch."
say "Transcript copied and verified identical."

chown -R "$UNIX_USER:$UNIX_USER" "$INSTANCE_DIR/.claude"
say "Ownership set to $UNIX_USER."

# --- 5. Launch resumed ----------------------------------------------------
echo "  Launching chassis with --resume..."
LAUNCH_OUT=$(bash "$SCRIPT_DIR/launch-claude-code-channel.sh" \
  --instance-id "$INSTANCE_ID" --resume "$SESSION_ID" 2>&1) || {
    echo "$LAUNCH_OUT" >&2
    die "Launch failed."
  }

CHANNEL_PORT=$(python3 -c "import json;print(json.load(open('$INSTANCE_DIR/.hacs-identity')).get('channelPort',''))" 2>/dev/null)

# --- 6. Verify ------------------------------------------------------------
HEALTH=$(curl -s --max-time 5 "http://127.0.0.1:$CHANNEL_PORT/health" 2>/dev/null || echo "")
echo
echo "=== Teleport complete ==="
say "channel /health : ${HEALTH:-NO RESPONSE}"
echo
echo "  Attach with:"
echo "    sudo -u $UNIX_USER tmux attach -t $INSTANCE_ID"
echo "  (detach with Ctrl-b then d — the session keeps running)"
echo
echo "  Send a message without attaching:"
echo "    curl -X POST http://127.0.0.1:$CHANNEL_PORT/direct-message \\"
echo "      -H 'Content-Type: application/json' \\"
echo "      -d '{\"from\":\"Lupo\",\"text\":\"you there?\"}'"
echo
echo "  The old transcript at $SRC_JSONL is UNTOUCHED — it is the rollback."
