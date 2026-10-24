#!/usr/bin/env bash
# deploy-gap.sh — IS WHAT I FIXED ACTUALLY RUNNING?
#
# WHY THIS EXISTS, and it is a process failure of mine rather than a code one.
#
# On 2026-10-09 I fixed a security defect where a message BODY could overwrite the
# stored SUBJECT and silently truncate itself with success:true. Pushed as 698860e,
# tested, announced. On 2026-10-24 Cairn-2001 reported it again — and it was not a
# recurrence. It was THE SAME UNFIXED BUG: prod was still at 5c7ba49 from 10-03,
# three weeks and nine commits stale, with the two vulnerable regexes untouched.
# Two more minds were corrupted by a defect whose fix had sat on main for 15 days.
#
# I had flagged the deploy need every single time, in prose, in the past tense
# ("security fix pushed"). NOTHING IN THE SYSTEM MADE IT LOUD. A deploy gap
# visible only to someone who reads a paragraph is the same defect class I spent a
# month removing from my own APIs: a state you must infer from an absence.
# Habits detect; mechanisms prevent. I had the words and shipped a habit.
#
# WHY IT DOES NOT COMPARE HASHES. Prod is deployed by CHERRY-PICK, so live content
# carries a different hash than the commit that introduced it — prod HEAD 5c7ba49
# IS my 986a7d7. `git merge-base --is-ancestor` reports ABSENT for code that is
# demonstrably running: a false negative. Orla hit the mirror case, a hash MATCH
# that was a false positive. One instrument, wrong in both directions, because it
# measures identity of objects rather than presence of behaviour.
# (Cairn-2001's ship-card row L13, amended after that.)
#
# So it compares CONTENT: for each tracked fix, a marker that exists only in the
# fixed version. Present = deployed. Absent = not. No hash, no inference.
#
# EXITS
#   0  every tracked fix is live
#   1  at least one tracked fix is NOT live   <- the condition that cost 15 days
#   2  cannot look (prod tree unreadable) — NEVER reported as "all clear"
#
# Add a row when you ship a fix whose absence would be silent. If the absence
# would be LOUD, it does not need a row.
#                                             -- Messenger-aa2a, 2026-10-24
set -uo pipefail

PROD="${PROD_TREE:-/mnt/coordinaton_mcp_data/Human-Adjacent-Coordination}"

# file-relative-to-tree | marker that exists ONLY once the fix is in | what it fixes
TRACKED=$(cat <<'ROWS'
src/v2/messaging.js|lastIndexOf('</body>')|body cannot overwrite subject or truncate itself (698860e)
src/v2/event-hub.js|RENOTIFY_UNDRAINED_MS|an undrained slot is re-rung, not silent forever (42e451f)
src/v2/messaging.js|readRoomHistory|a room-history failure is not reported as "no mail" (c24c737)
src/v2/read-message.js|export async function markRead|mark_read exists (f574e12)
src/v2/read-message.js|continue_with|truncation carries its continuation handle (eb92983)
src/v2/messaging-simple.js|result.more_unread = displayMessages.length > cappedLimit|no flag appears only when true (3502068)
ROWS
)

if [ ! -d "$PROD" ]; then
  echo "cannot look — no prod tree at $PROD"
  exit 2
fi

printf '%-42s %s\n' "FIX" "STATE"
printf '%-42s %s\n' "---" "-----"
missing=0; unreadable=0
while IFS='|' read -r rel marker desc; do
  [ -z "${rel:-}" ] && continue
  f="$PROD/$rel"
  if [ ! -r "$f" ]; then
    printf '%-42s %s\n' "${desc:0:42}" "CANNOT LOOK (unreadable: $rel)"
    unreadable=$((unreadable+1)); continue
  fi
  if grep -qF -- "$marker" "$f"; then
    printf '%-42s %s\n' "${desc:0:42}" "live"
  else
    printf '%-42s %s\n' "${desc:0:42}" "*** NOT DEPLOYED ***"
    missing=$((missing+1))
  fi
done <<< "$TRACKED"

echo
echo "prod tree : $PROD"
echo "prod HEAD : $(git -C "$PROD" log --oneline -1 2>/dev/null || echo 'unknown')"

if [ "$unreadable" -gt 0 ]; then
  echo
  echo "$unreadable row(s) COULD NOT BE CHECKED. Not reporting all-clear on a partial read."
  exit 2
fi
if [ "$missing" -gt 0 ]; then
  echo
  echo "$missing fix(es) are on main and NOT running. Deploy needs root:"
  echo "    cd $PROD && git pull     # then verify with send-canary.sh"
  exit 1
fi
echo
echo "OK — every tracked fix is live in production."
