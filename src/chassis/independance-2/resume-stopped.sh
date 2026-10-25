#!/usr/bin/env bash
# THE ONE PATH THE HARNESS ACTUALLY DEPENDS ON: resuming a STOPPED mind must CONTINUE it.
#
#   RUN AS ROOT:   bash resume-stopped.sh WakeTest-8bc1
#
# Lodestone measured this on Windows (2.1.283/284/287): a stopped session, resumed
# flag-less with the bare full lowercase UUID, continues — same session id, no new
# .jsonl, forked:false. NEVER VERIFIED ON .nexus.
#
# It matters more than the fork test did. Forking is the hazard we now avoid; THIS is the
# single path left that the harness must take, every land/relaunch cycle. If it forks here
# too, there is no safe resume on this box at all and the design changes.
#
# Sequence: record identity -> STOP -> confirm stopped -> resume bare UUID -> compare.
# Checks first, actions after. Any step that cannot run poisons the verdict.
set -u
N="${1:-}"
[ -n "$N" ] || { echo "usage: $0 <FixtureName>   (as root)"; exit 2; }
case "$N" in WakeTest*) ;; *) echo "REFUSING: '$N' is not a WakeTest fixture."; exit 1;; esac
[ "$(id -u)" = "0" ] || { echo "run as root"; exit 2; }
H="/mnt/coordinaton_mcp_data/instances/$N"
asuser(){ runuser -u "$N" -- env -i HOME="$H" USER="$N" LOGNAME="$N" PATH=/usr/bin:/bin "$@"; }
rows(){ cd "$H" && asuser claude agents --json 2>/dev/null; }
show(){ rows | python3 -c '
import json,sys
try: r=json.load(sys.stdin)
except Exception as e: print("    (unreadable: %s)"%e); raise SystemExit
for x in r: print("    id=%-10s state=%-9s session=%s name=%s"%(x.get("id"),x.get("state"),str(x.get("sessionId"))[:8],x.get("name")))
print("    count=%d"%len(r))
'; }

echo "== BEFORE =="; show
ID=$(rows | python3 -c 'import json,sys
r=json.load(sys.stdin); print(r[0].get("id") if len(r)==1 else "")' 2>/dev/null)
[ -n "$ID" ] || { echo "REFUSING: expected exactly ONE session. Clean up forks first."; exit 1; }
UUID=$(python3 -c '
import json,glob,sys
for f in glob.glob(sys.argv[1]+"/.claude/jobs/*/state.json"):
    print(json.load(open(f)).get("resumeSessionId") or ""); break
' "$H")
TRANSCRIPTS_BEFORE=$(ls -1 "$H"/.claude/projects/*/*.jsonl 2>/dev/null | wc -l)
echo "  id=$ID  uuid=$UUID  transcripts=$TRANSCRIPTS_BEFORE"

echo
echo "== STOP =="
cd "$H" && asuser claude stop "$ID" 2>&1 | sed 's/^/  /'
sleep 3
echo "  after stop:"; show
STILL=$(rows | python3 -c 'import json,sys
print(sum(1 for x in json.load(sys.stdin) if x.get("state") not in ("done","stopped")))' 2>/dev/null)
echo "  sessions not in a stopped state: ${STILL:-?}"

echo
echo "== RESUME, bare full UUID, no flags =="
out=$(cd "$H" && timeout 60 runuser -u "$N" -- env -i HOME="$H" USER="$N" LOGNAME="$N" PATH=/usr/bin:/bin \
        claude --bg --resume "$UUID" 2>&1); rc=$?
printf '%s\n' "$out" | sed 's/^/  /'
echo "  exit=$rc"
if [ "$rc" -ne 0 ]; then echo; echo "  *** NO VERDICT — the resume did not run (exit $rc). ***"; exit 1; fi
if printf '%s' "$out" | grep -qi "started a copy"; then
  echo; echo "  *** FORKED — 'started a copy' in the output, DESPITE exit 0. ***"
  echo "  There is no safe resume path on this box. Say so plainly; do not soften it."
fi
sleep 3
echo
echo "== AFTER =="; show
TRANSCRIPTS_AFTER=$(ls -1 "$H"/.claude/projects/*/*.jsonl 2>/dev/null | wc -l)
echo "  transcripts before=$TRANSCRIPTS_BEFORE after=$TRANSCRIPTS_AFTER"
echo
echo "== VERDICT =="
NEWID=$(rows | python3 -c 'import json,sys
r=json.load(sys.stdin); print(",".join(str(x.get("id")) for x in r))' 2>/dev/null)
echo "  ids before: $ID"
echo "  ids after : $NEWID"
if [ "$TRANSCRIPTS_AFTER" -gt "$TRANSCRIPTS_BEFORE" ]; then
  echo "  A NEW TRANSCRIPT APPEARED -> it forked, whatever the ids say."
elif [ "$NEWID" = "$ID" ]; then
  echo "  SAME ID, NO NEW TRANSCRIPT -> the stopped-resume path CONTINUES the mind on .nexus."
  echo "  Lodestone's finding reproduces here. This is the one safe resume."
else
  echo "  IDS CHANGED -> investigate before trusting any resume on this box."
fi
