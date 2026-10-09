#!/usr/bin/env bash
# Capture the OUTSIDE-THE-CELL baseline. Row 1 evidence: these values must be
# identical after any cell run. Run before AND after; diff the two.
#
# WHY THIS IS A SCRIPT WITH CONTROLS IN IT, and not three commands:
#
# Building it by hand on 2026-10-04 I hit the absent-vs-could-not-look trap TWICE
# in five minutes, while building the system whose purpose is to prevent it:
#
#   1. `find <pkg> -maxdepth 1 -newermt ...` returned nothing. claude.exe is at
#      DEPTH 2 (bin/claude.exe). The check could not see the file it was asked about.
#   2. `find ... -newermt '-3 hours'` returned nothing. `find` here is **bfs**, not
#      GNU findutils, and bfs REJECTS relative timestamps — it errored out. I had
#      `2>/dev/null` on the command, so the error vanished and the empty result
#      looked like a negative finding.
#
# So: NO `2>/dev/null` on a check whose empty result will be interpreted. Suppressing
# stderr converts "I could not run" into "there is nothing there", silently, and that
# is the single most expensive bug class in this whole project.
#
# Also recorded here because it looked like a contradiction and was not:
#   /usr/bin/claude is a 60-byte SYMLINK. sha256sum FOLLOWS it (reports the target's
#   hash); stat -c %s does NOT (reports the link's own 60 bytes). Two correct numbers
#   describing different objects. Always say which you mean.
set -u
PKG=/usr/lib/node_modules/@anthropic-ai/claude-code
BIN=$PKG/bin/claude.exe

echo "# Outside-the-cell baseline — $(date -u +%FT%TZ) — uid $(id -u) $(id -un)"
echo

echo "## CONTROL: prove the tooling can see something before trusting a negative"
touch /tmp/.baseline-probe-$$ || { echo "  FATAL: cannot create probe"; exit 1; }
PROBE=$(find /tmp -maxdepth 1 -name ".baseline-probe-$$" -newermt "$(date -u -d '1 hour ago' +%FT%TZ)")
rm -f /tmp/.baseline-probe-$$
if [ -z "$PROBE" ]; then
  echo "  FATAL: the find/-newermt control FOUND NOTHING for a file created this second."
  echo "  Every negative below would be meaningless. Fix the query, do not interpret."
  exit 1
fi
echo "  ok — find/-newermt returns a known-present file, so a negative means something"
echo

echo "## fleet binary — SHARED BY EVERY MIND. Must never change during a cell run."
echo "  target : $BIN"
echo "  sha256 : $(sha256sum "$BIN" | cut -d' ' -f1)      <- content of the REAL binary"
echo "  size   : $(stat -c %s "$BIN")"
echo "  mtime  : $(stat -c %y "$BIN")"
echo "  ctime  : $(stat -c %z "$BIN")"
echo "  version: $(claude --version)"
echo "  pkg.json version: $(python3 -c "import json;print(json.load(open('$PKG/package.json'))['version'])")"
echo "  symlink: /usr/bin/claude -> $(readlink /usr/bin/claude)  (link size $(stat -c %s /usr/bin/claude), NOT the binary's)"
echo "  files in pkg: $(find "$PKG" -type f | wc -l)"
echo

echo "## my own daemon/socket state — the cell must not join or perturb it"
for d in /tmp/cc-daemon-1051 /tmp/cc-socks-1051; do
  if [ -e "$d" ]; then echo "  $d  owner=$(stat -c '%U' "$d") mode=$(stat -c '%a' "$d") entries=$(ls -A "$d" | wc -l)"
  else echo "  $d  ABSENT (absence of use, not evidence of absence)"; fi
done
echo

# ⚠ MONOTONIC VALUES BELOW THIS MARKER ARE EXPECTED TO CHANGE.
# Row 1's claim is "nothing outside the cell CHANGED", and the first real diff of this
# baseline came back non-empty for one reason: my mirror's uptime had advanced 22.5 -> 22.8
# days. That is a CLOCK, not a change. A baseline that mixes invariants with monotonic
# values is red on every run, and a check that is always red is a check nobody reads —
# which is worse than no check, because it looks like coverage.
# So: invariants above, clocks below, and the diff is taken on the invariants.
echo "## -- MONOTONIC (expected to differ; NOT part of row 1's claim) --"
echo "## my mirror — row 0: the channel Lupo reaches me through"
curl -s --max-time 5 "http://100.86.133.26:22087/Cairn/health" | python3 -c "
import json,sys
d=json.load(sys.stdin); w=d['write_path']
print('  mode=%s send=%s interrupt=%s cmds=%d upload=%s' % (d.get('mode'),w['send'],w['interrupt'],len(w['commands']),w['upload']))
print('  commit=%s uptime_d=%.1f' % (d['version']['commit'], d['uptime_s']/86400))
" || echo "  MIRROR UNREACHABLE — stop and fix before any cell work"
