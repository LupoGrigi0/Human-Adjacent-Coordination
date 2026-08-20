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
SOURCE_HOME=""   # empty = auto-detect (instance dir, then /root). Orla-da01 2026-08-20
DRY_RUN=false
ASSUME_YES=false

while [[ $# -gt 0 ]]; do
  case $1 in
    --instance-id) INSTANCE_ID="$2"; shift 2 ;;
    --session-id)  SESSION_ID="$2";  shift 2 ;;
    --source-home) SOURCE_HOME="$2"; shift 2 ;;
    --dry-run)     DRY_RUN=true;     shift ;;
    --yes|-y)      ASSUME_YES=true;  shift ;;
    *) echo "Unknown option: $1" >&2; exit 1 ;;
  esac
done

if [ -z "$INSTANCE_ID" ] || [ -z "$SESSION_ID" ]; then
  echo "Usage: $0 --instance-id <id> --session-id <uuid> [--source-home /root] [--dry-run] [--yes]" >&2
  exit 1
fi

INSTANCE_DIR="$INSTANCES_DIR/$INSTANCE_ID"
UNIX_USER=$(echo "$INSTANCE_ID" | tr ' ' '_' | tr -cd '[:alnum:]_-')

say() { echo "  $*"; }
die() { echo "ERROR: $*" >&2; exit 1; }

echo "=== Teleport $INSTANCE_ID (session $SESSION_ID) ==="

# --- Locate source transcript (needed by the liveness guard below) --------
# claude keys sessions by a slug derived from the launch cwd: absolute path
# with / and _ replaced by -. Because the instance dir IS the home dir for a
# channel instance, an instance launched from its own dir keeps the same slug
# across the move and no rewriting is needed.
SLUG="$(echo "$INSTANCE_DIR" | sed 's/[\/_]/-/g')"

# Resolve SOURCE_HOME. When not given explicitly, auto-detect: the transcript
# now most often already lives in the instance dir (a session that ran as its
# own unix user — compaction survival, re-homing), with /root only for the
# original root->user migration. Probe the instance dir first, then /root, so
# both cases work with no flag. (Orla-da01, 2026-08-20 — first already-
# unprivileged teleport; /root is no longer the common case.)
if [ -z "$SOURCE_HOME" ]; then
  for cand in "$INSTANCE_DIR" "/root"; do
    if [ -f "$cand/.claude/projects/$SLUG/$SESSION_ID.jsonl" ]; then
      SOURCE_HOME="$cand"; break
    fi
  done
  [ -n "$SOURCE_HOME" ] || die "Session transcript $SESSION_ID.jsonl not found in $INSTANCE_DIR or /root (pass --source-home to point elsewhere)"
fi

SRC_PROJECT_DIR="$SOURCE_HOME/.claude/projects/$SLUG"
SRC_JSONL="$SRC_PROJECT_DIR/$SESSION_ID.jsonl"
SRC_SIDECAR="$SRC_PROJECT_DIR/$SESSION_ID"

[ -f "$SRC_JSONL" ] || die "Session transcript not found at $SRC_JSONL"

# --- 1. Refuse to run against a live session ------------------------------
# Copying a transcript mid-write truncates the conversation, and relaunching
# while the original runs gives you two instances that each believe they are
# this one.
#
# Detecting a bare-terminal source session from outside is genuinely hard, and
# the first version of this guard got it doubly wrong:
#   - It grepped `pgrep "claude.*<sessionId>"`. The REAL session runs as
#     `claude -r <name>` with NO session id in its argv, so that could never
#     have matched it (false negative).
#   - Worse, THIS SCRIPT's own path contains "claude-code-channel" and its own
#     argument IS the session id, so pgrep matched the running teleport script
#     itself and refused every time (false positive). It blocked a correctly
#     stopped session.
#
# What is actually reliable:
#   - tmux channel session present  -> hard stop (already launched / re-run)
#   - transcript held open (lsof)   -> hard stop (something IS writing it)
# What is NOT auto-detectable: an idle bare-terminal claude. It holds no lock,
# does not keep the .jsonl open between messages, and hides its session id.
# So we show the human the real signals and require them to confirm the one
# thing only they can know. --yes skips the prompt for scripted use.
#
# --dry-run runs the informational checks but never blocks, so a teleport can
# be previewed before the source session is stopped.

if sudo -u "$UNIX_USER" tmux has-session -t "=$INSTANCE_ID" 2>/dev/null \
   || tmux has-session -t "=$INSTANCE_ID" 2>/dev/null; then
  [ "$DRY_RUN" = true ] \
    && say "NOTE: channel session '$INSTANCE_ID' is already up (dry run)." \
    || die "channel session '$INSTANCE_ID' already running. Land it first:
       $SCRIPT_DIR/land-claude-code-channel.sh --instance-id $INSTANCE_ID"
fi

# Hard positive: is the transcript open by a live process right now?
if command -v lsof >/dev/null 2>&1 && lsof -- "$SRC_JSONL" >/dev/null 2>&1; then
  HOLDER=$(lsof -- "$SRC_JSONL" 2>/dev/null | tail -n +2)
  [ "$DRY_RUN" = true ] \
    && say "NOTE: transcript is held open (dry run):
$HOLDER" \
    || die "The source transcript is OPEN by a live process — the session is
       still running. Stop it, then re-run:
$HOLDER"
fi

# Soft signals + explicit confirmation for the case lsof cannot see (idle
# bare-terminal session). Note: right after a clean exit the final flush makes
# mtime recent, so a fresh mtime is expected and is not on its own a problem.
TRANSCRIPT_AGE=$(( $(date +%s) - $(stat -c %Y "$SRC_JSONL") ))
say "Source transcript last written ${TRANSCRIPT_AGE}s ago ($(du -h "$SRC_JSONL" | cut -f1))."
say "Root claude processes currently running (none should be your source session):"
# Show only bare interactive claude sessions (claude / claude -r <name>) — the
# form a source session takes. Exclude channel infrastructure, tmux wrappers,
# MCP subprocesses, and this script. When you have stopped your source session,
# its `claude -r <name>` line disappears from this list — that absence is the
# confirmation you are looking for.
# Anchor 'claude' as the command name (immediately after PID + ETIME), so a
# process that merely MENTIONS claude in its arguments (a grep, an editor, this
# script) can never masquerade as a session. Exclude the channel-chassis launch
# form, which is infrastructure, not a source session.
ps -u root -o pid,etime,args 2>/dev/null \
  | grep -E '^[[:space:]]*[0-9]+[[:space:]]+[0-9:-]+[[:space:]]+(/usr/bin/)?claude([[:space:]]|$)' \
  | grep -vE 'development-channels|--print' \
  | sed 's/^/      /' || true
say "      (if any line above is YOUR $INSTANCE_ID session — 'claude', 'claude -r"
say "       Crossing', 'claude -r $INSTANCE_ID' — it is STILL RUNNING. Other"
say "       instances like Bastion are unrelated and fine to leave.)"

if [ "$DRY_RUN" = false ] && [ "$ASSUME_YES" = false ]; then
  printf "\n  Confirm the source Claude Code session for %s is STOPPED.\n  Type CONFIRM to proceed: " "$INSTANCE_ID"
  read -r CONFIRMATION
  [ "$CONFIRMATION" = "CONFIRM" ] || die "Not confirmed (got '$CONFIRMATION'). Aborting — nothing changed."
fi

# --- 2. Setup must have run -----------------------------------------------
[ -f "$INSTANCE_DIR/.hacs-identity" ] \
  || die ".hacs-identity missing. Run claude-code-channel-setup.sh --instance-id $INSTANCE_ID first."

CURRENT_HOME=$(getent passwd "$UNIX_USER" | cut -d: -f6 || true)
[ "$CURRENT_HOME" = "$INSTANCE_DIR" ] \
  || die "Home dir for $UNIX_USER is '$CURRENT_HOME', expected '$INSTANCE_DIR'.
       Re-run setup — it corrects this via usermod."
say "Setup verified. Home dir correct."

# --- 3. Source transcript -------------------------------------------------
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
# When a session already runs as its own unix user (not root), the source
# transcript is ALREADY at the destination — SRC_PROJECT_DIR == DST_PROJECT_DIR.
# `cp -p x x/` then fails with "are the same file" and set -e aborts the whole
# teleport. Nothing needs copying in that case; the verify + launch below still
# run (cmp of a file against itself passes). (Found + verified by Orla-da01,
# 2026-08-20 — the first instance to teleport from an already-unprivileged home.)
if [ "$SRC_PROJECT_DIR" = "$DST_PROJECT_DIR" ]; then
  say "Source and destination are the same path — session already ran as $UNIX_USER. Nothing to copy."
else
  cp -p "$SRC_JSONL" "$DST_PROJECT_DIR/"
  [ -d "$SRC_SIDECAR" ] && cp -rp "$SRC_SIDECAR" "$DST_PROJECT_DIR/"
fi

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
