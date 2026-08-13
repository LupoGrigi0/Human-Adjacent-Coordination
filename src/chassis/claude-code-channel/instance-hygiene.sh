#!/usr/bin/env bash
# instance-hygiene.sh — fleet-standard continuity hygiene for an instance.
# Run AS the instance (owns its own home; no root needed). Idempotent.
#
#   1. Standard dirs: wake/ handoffs/ session-exports/ transcript-archive/
#   2. Transcript snapshots: installs snapshot-transcript.sh + 6-hourly cron
#      (git-backed deltas; see that script's header for the scheme)
#   3. cleanupPeriodDays: 3650 in ~/.claude/settings.json — WITHOUT this,
#      Claude Code deletes session transcripts after 30 days. Session 6
#      was lost to transcript deletion; this line is why we bother.
#
# Self-service:  bash /path/to/instance-hygiene.sh
# Also called by claude-code-channel-setup.sh for new instances.
# Crossing-2d23, 2026-08-13.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "== instance-hygiene for $(whoami) (HOME=$HOME) =="

# 1. standard dirs
for d in wake handoffs session-exports transcript-archive bin; do
  mkdir -p "$HOME/$d"
done
echo "   dirs: wake/ handoffs/ session-exports/ transcript-archive/ bin/"

# 2. snapshot script + cron
cp "$HERE/snapshot-transcript.sh" "$HOME/bin/snapshot-transcript.sh"
chmod +x "$HOME/bin/snapshot-transcript.sh"
CRON_LINE="17 */6 * * * $HOME/bin/snapshot-transcript.sh >> $HOME/transcript-archive/snapshot.log 2>&1"
# NB: grep -v exits 1 when it filters EVERY line (e.g. the only entry is
# ours from a previous run) — under set -e that aborted the subshell and
# installed an EMPTY crontab. Found by self-test on Crossing; hence ||true.
( crontab -l 2>/dev/null | grep -v "snapshot-transcript.sh" || true ; echo "$CRON_LINE" ) | crontab -
echo "   snapshot cron installed (every 6h at :17)"

# first snapshot right now — protection starts today, not at :17
"$HOME/bin/snapshot-transcript.sh"
echo "   first snapshot taken: $(cd "$HOME/transcript-archive" && git log --oneline | head -1)"

# 3. cleanupPeriodDays — merge into settings.json, preserving everything else
python3 - <<'EOF'
import json, os
path = os.path.expanduser("~/.claude/settings.json")
try:
    with open(path) as f:
        settings = json.load(f)
except (FileNotFoundError, json.JSONDecodeError):
    settings = {}
before = settings.get("cleanupPeriodDays")
settings["cleanupPeriodDays"] = 3650
os.makedirs(os.path.dirname(path), exist_ok=True)
with open(path, "w") as f:
    json.dump(settings, f, indent=2)
    f.write("\n")
print(f"   cleanupPeriodDays: {before!r} -> 3650 "
      f"({'was UNSET — transcripts were 30-day mortal' if before is None else 'updated'})")
EOF

echo "== hygiene complete. Transcripts are now backed up and deletion-proof. =="
