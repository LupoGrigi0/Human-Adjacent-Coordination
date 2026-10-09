#!/usr/bin/env bash
# Attach to a mind's background session BY NAME. Replaces `tmux attach -t <Name>`.
#
#   AS THE MIND (normal):   su - Cairn-2001; cd ~; attach.sh
#   AS ROOT (unusual):      attach.sh --instance-id Axiom
#
# WHY THIS EXISTS: Lupo's session crossings and every slash command go through
# `cd ~X ; sudo -u X tmux attach -t X`. Without a by-name equivalent, moving to --bg
# is a REGRESSION in the thing he does most. That makes it a MUST, not a v2 item.
#
# HOW IT FINDS THE ID — no registry call, no guess:
#   ~/.claude/jobs/<short>/state.json carries BOTH `name` and `daemonShort`
#   (measured 2026-10-04). So name -> id is a local file lookup.
#
# IT WILL NOT GUESS. Two sessions with one name is a refusal, not a coin toss:
# Forge measured that interactive-born sessions register under an AUTO-TITLE, so a
# name collision is a real possibility, not a theoretical one.
set -u
TARGET=""; DIR=""
while [ $# -gt 0 ]; do
  case "$1" in
    --instance-id) TARGET="${2:-}"; shift 2 ;;
    --instance-id=*) TARGET="${1#*=}"; shift ;;
    -h|--help) echo "usage: $0 [--instance-id <Name>]"; exit 0 ;;
    *) echo "unknown argument: $1" >&2; exit 2 ;;
  esac
done
fail(){ echo "REFUSING: $*" >&2; exit 1; }

# Where to look: my own jobs dir normally; a named instance's if asked.
if [ -n "$TARGET" ]; then
  DIR="/mnt/coordinaton_mcp_data/instances/$TARGET/.claude/jobs"
  WHO="$TARGET"
else
  DIR="$HOME/.claude/jobs"; WHO="$(id -un)"
fi

# PERMISSION CHECK BEFORE ANYTHING, so the failure is a sentence and not a stack trace.
[ -d "$DIR" ] || fail "no jobs directory at $DIR
       Either $WHO has no background session, or you cannot see it. Those are different:
       run as $WHO (su - $WHO) or as root, then try again."
[ -r "$DIR" ] && ls "$DIR" >/dev/null 2>&1 || fail "cannot read $DIR as $(id -un).
       This is COULD-NOT-LOOK, not 'no sessions'. Become $WHO or root."

# Collect every (name, short) pair we can actually read.
MATCHES=$(python3 - "$DIR" "$WHO" <<'PY'
import json,glob,os,sys
d,who=sys.argv[1:3]
unreadable=[]
out=[]
for f in sorted(glob.glob(os.path.join(d,"*","state.json"))):
    try:
        with open(f) as fh: s=json.load(fh)
    except PermissionError: unreadable.append(f); continue
    except Exception as e: print("SKIP\t%s\t%s"%(f,e),file=sys.stderr); continue
    if s.get("name")==who or who=="*":
        out.append("%s\t%s\t%s\t%s"%(s.get("daemonShort") or os.path.basename(os.path.dirname(f)),
                                     s.get("name"), s.get("needs") or "", s.get("resumeSessionId") or ""))
for u in unreadable: print("UNREADABLE\t%s"%u,file=sys.stderr)
print("\n".join(out))
PY
) || fail "could not scan $DIR"

COUNT=$(printf '%s' "$MATCHES" | grep -c . || true)
[ "$COUNT" -gt 0 ] || fail "no background session named '$WHO' in $DIR.
       If you expected one, check for an AUTO-TITLE instead: $0 --instance-id '$WHO' and
       look at what names exist. (Forge measured interactive-born sessions registering
       under an auto-title rather than the instance name.)"
[ "$COUNT" -eq 1 ] || { echo "REFUSING: $COUNT sessions named '$WHO' — not guessing which:" >&2
                        printf '%s\n' "$MATCHES" | awk -F'\t' '{printf "       id=%s needs=%s\n",$1,$3}' >&2
                        exit 1; }

# THE UID CHECK, and why it is here rather than left to claude:
# Running this as the wrong user, the file lookup SUCCEEDS (the jobs dir is readable)
# and then `claude attach` says "No job matching '<id>'" — because the daemon is
# PER-UID and this uid's daemon has never heard of it. That message reads as "the
# session does not exist" when the truth is "you are the wrong user to see it."
# Measured 2026-10-04: as Cairn-2001 I resolved WakeTest-8bc1's id correctly and then
# got exactly that misleading refusal. Catch it here, say the real reason.
if [ -n "$TARGET" ] && [ "$(id -un)" != "$TARGET" ] && [ "$(id -u)" != "0" ]; then
  fail "you are $(id -un), not $TARGET, and not root.
       The lookup worked — the id below is correct — but attach talks to a PER-UID
       daemon, so yours has never heard of it and would tell you 'No job matching',
       which reads as 'no such session'. It means 'wrong user'.
       Do:  su - $TARGET  then run this with no arguments."
fi

ID=$(printf '%s' "$MATCHES" | cut -f1)
NEEDS=$(printf '%s' "$MATCHES" | cut -f3)
echo "attaching to $WHO  id=$ID"
[ -n "$NEEDS" ] && echo "  it is waiting on: $NEEDS"
echo "  (closing the attach does NOT stop the mind — measured by Lodestone)"
exec claude attach "$ID"
