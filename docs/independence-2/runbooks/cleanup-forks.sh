#!/usr/bin/env bash
# Remove the fork sessions created by forktest.sh. KEEPS the original.
#
#   RUN AS ROOT:   bash cleanup-forks.sh WakeTest-8bc1 65435e07
#
# Deliberately takes the KEEP id as an explicit argument rather than inferring it.
# Four sessions now share the name "WakeTest-8bc1" (ledger 015), so ANY inference from
# name would be a coin toss — and the thing being cleaned up is precisely a
# name-collision incident. Checks first, actions after.
set -u
N="${1:-}"; KEEP="${2:-}"
[ -n "$N" ] && [ -n "$KEEP" ] || { echo "usage: $0 <FixtureName> <KEEP-short-id>   (as root)"; exit 2; }
case "$N" in WakeTest*) ;; *) echo "REFUSING: '$N' is not a WakeTest fixture."; exit 1;; esac
[ "$(id -u)" = "0" ] || { echo "run as root"; exit 2; }
H="/mnt/coordinaton_mcp_data/instances/$N"
asuser(){ runuser -u "$N" -- env -i HOME="$H" USER="$N" LOGNAME="$N" PATH=/usr/bin:/bin "$@"; }

echo "== BEFORE =="
cd "$H" && asuser claude agents --json | python3 -c '
import json,sys
rows=json.load(sys.stdin)
for r in rows: print("  id=%-10s state=%-9s name=%s"%(r.get("id"),r.get("state"),r.get("name")))
print("  total: %d"%len(rows))
'
IDS=$(cd "$H" && asuser claude agents --json | python3 -c '
import json,sys
keep=sys.argv[1]
print(" ".join(r.get("id") for r in json.load(sys.stdin) if r.get("id") and r.get("id")!=keep))
' "$KEEP")
[ -n "$IDS" ] || { echo; echo "nothing to remove (only $KEEP present)"; exit 0; }
echo
echo "== WILL REMOVE: $IDS    (keeping $KEEP) =="
for id in $IDS; do
  echo "  -- $id"
  cd "$H" && asuser claude stop "$id" 2>&1 | sed 's/^/     stop: /'
  cd "$H" && asuser claude rm   "$id" 2>&1 | sed 's/^/     rm  : /'
done
echo
echo "== AFTER — verified by re-reading, not by the exit codes above =="
cd "$H" && asuser claude agents --json | python3 -c '
import json,sys
keep=sys.argv[1]
rows=json.load(sys.stdin)
for r in rows: print("  id=%-10s state=%-9s name=%s"%(r.get("id"),r.get("state"),r.get("name")))
print("  total: %d"%len(rows))
ids=[r.get("id") for r in rows]
if ids==[keep]: print("  OK — only the original remains")
else: print("  *** NOT CLEAN: expected only %s, got %s"%(keep,ids))
' "$KEEP"
