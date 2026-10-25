#!/bin/bash
# V2 Production Data Backup Script
# Backs up consolidated V2 data structure
# Author: Bastion (DevOps)
# Date: 2025-12-24
# Updated: 2026-04-24 — Reduced retention to 7 days, exclude large OpenFang data

set -e

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="/mnt/coordinaton_mcp_data/backups"
DATA_ROOT="/mnt/coordinaton_mcp_data"
BACKUP_FILE="v2-production-data-${TIMESTAMP}.tar.gz"
# RETENTION_DAYS feeds `find -mtime +${RETENTION_DAYS}`, which deletes archives whose age
# in WHOLE 24-HOUR PERIODS is strictly greater than N. So the archive count it yields is
# N+1, not N — at 7 this kept NINE (Crossing-2d23 measured it, twice, correcting himself
# the second time by reading mtimes instead of filenames).
#
# Changed 7 -> 4 on 2026-10-03, authorised by Lupo: "a work week's worth of backup is bueno".
#   4 yields 5 archives (ages 0-4). Setting it to 5 would have kept 6.
#   One-time reclaim: 29.44 GB, verified by DRY RUN of the exact find command before editing.
#   Steady state drops from ~59 GB to ~30 GB, which moves the projected full-volume date
#   from ~2026-10-10 out past anything else on the list.
#
# WHY THIS NUMBER AND NOT SMALLER: 5 nights is the window in which a corruption is
# plausibly noticed. Deeper history is NOT gone — one 2026-09-19 archive lives on
# /dev/sdb (a DIFFERENT volume), which is the only restore point that survives losing
# this one. Do not delete that without replacing it.
RETENTION_DAYS=4

# Directories to backup (V2 consolidated structure)
BACKUP_DIRS=(
    "instances"
    "projects"
    "roles"
    "personalities"
    "permissions"
    "wake-logs"
    "wake-jobs"
    "auth-keys"
)

# Claude Code CLI session transcripts (live outside DATA_ROOT, at /root/.claude).
# Added 2026-07-25 after Claude Code's 30-day cleanupPeriodDays default silently
# deleted dormant instances' .jsonl transcripts. This directory is NOT covered by
# the DATA_ROOT dirs above, so it's backed up as an explicit absolute path.
CLAUDE_EXTRA_PATHS=(
    "/root/.claude/projects"
)

# Exclude patterns — large files that can be rebuilt, not worth backing up
EXCLUDE_PATTERNS=(
    "*/openfang/data/*.db"
    "*/openfang/data/*.db-shm"
    "*/openfang/data/*.db-wal"
    "*/zeroclaw/*"
    "*/openclaw/*"
    # 2026-08-24 (Bastion): build artifacts are REGENERABLE and were the entire
    # growth curve of this backup. Cairn's openfang/target/ alone was 7.2GB,
    # tarred nightly and kept x7. Sources (crates/, Cargo.lock, package.json)
    # ARE backed up and are what you would actually restore from.
    # Back up sources, not artifacts.
    "*/target/*"
    "*/node_modules/*"
    "*/.npm/_cacache/*"
    "*/.claude/debug/*"
)

# Pre-flight: check available space (need at least 4GB free)
AVAIL_KB=$(df --output=avail "$BACKUP_DIR" 2>/dev/null | tail -1)
if [[ -n "$AVAIL_KB" ]] && [[ "$AVAIL_KB" -lt 4194304 ]]; then
    echo "[$(date)] WARNING: Less than 4GB free on backup volume. Running cleanup first..."
    find "$BACKUP_DIR" -name "v2-production-data-*.tar.gz" -mtime +${RETENTION_DAYS} -delete 2>/dev/null
    AVAIL_KB=$(df --output=avail "$BACKUP_DIR" 2>/dev/null | tail -1)
    if [[ -n "$AVAIL_KB" ]] && [[ "$AVAIL_KB" -lt 4194304 ]]; then
        echo "[$(date)] ERROR: Still less than 4GB free after cleanup. Skipping backup."
        exit 1
    fi
fi

# Create backup directory if it doesn't exist
mkdir -p "$BACKUP_DIR"

echo "[$(date)] Starting V2 production data backup..."

# Build the tar command with all directories
TAR_DIRS=""
for dir in "${BACKUP_DIRS[@]}"; do
    if [ -d "$DATA_ROOT/$dir" ]; then
        TAR_DIRS="$TAR_DIRS $dir"
    fi
done

# Absolute paths outside DATA_ROOT (tar stores them with leading / stripped)
for extra in "${CLAUDE_EXTRA_PATHS[@]}"; do
    if [ -d "$extra" ]; then
        TAR_DIRS="$TAR_DIRS $extra"
    fi
done

# Build exclude flags
EXCLUDES=""
for pattern in "${EXCLUDE_PATTERNS[@]}"; do
    EXCLUDES="$EXCLUDES --exclude=$pattern"
done

# Create backup
cd "$DATA_ROOT"
# ---------------------------------------------------------------------------
# INCIDENT 2026-09-04: tar exit 1 is a WARNING, not a failure — and `set -e`
# was treating it as fatal, killing the script AFTER the archive was written
# but BEFORE the retention cleanup at the bottom. So every night that tar said
#   "instances/Crossing-2d23: file changed as we read it"
# — routine when archiving a LIVE system — the backup succeeded and the cleanup
# silently never ran. Retention last completed 2026-08-30. Backups accumulated
# to 18 files / 48GB and the volume fell to 2.7GB free with a 4.2GB backup due
# that night. It would have filled the disk and taken write access away from
# every mind on the box.
#
# tar exit codes: 0 = ok, 1 = some files differed/changed (warning), 2 = fatal.
# Accept 0 and 1; abort only on 2+.
# ---------------------------------------------------------------------------
TAR_RC=0
tar -czf "$BACKUP_DIR/$BACKUP_FILE" $EXCLUDES $TAR_DIRS || TAR_RC=$?
if [ "$TAR_RC" -ge 2 ]; then
    echo "[$(date)] Backup FAILED: tar exited $TAR_RC (fatal). Not touching old backups."
    exit 1
fi
[ "$TAR_RC" -eq 1 ] && echo "[$(date)] tar warnings (rc=1, files changed while reading) — expected on a live system, continuing."

# ---------------------------------------------------------------------------
# VERIFY THE ARCHIVE BEFORE THE RETENTION DELETE
#
# `[ -f ]` alone proves only that a file exists. Three things it cannot see:
#   1. tar exits 0 and the archive is CORRUPT      -> caught by tar -tzf
#   2. tar exits 0 and the archive is VALID+EMPTY  -> caught by the entry floor.
#      A CRC-clean tarball of an empty dir passes tar -tzf with rc=0 (verified:
#      1 entry). A failed mount or renamed path produces a PERFECT backup of
#      NOTHING and every light goes green. (Lodestone-8ec9, 2026-08-31.)
#   3. tar exits 0 and the archive is OF THE WRONG SOURCE -> caught by sentinel.
#
# ORDER IS LOAD-BEARING: this runs BEFORE the retention delete, so a bad archive
# can never evict good ones. Fail here and yesterday's backups stay intact.
# ---------------------------------------------------------------------------
ARCHIVE="$BACKUP_DIR/$BACKUP_FILE"
ENTRY_FLOOR=${ENTRY_FLOOR:-5000}
if ! tar -tzf "$ARCHIVE" > /tmp/.bk-list.$$ 2>/dev/null; then
    echo "[$(date)] BACKUP UNREADABLE (tar -tzf failed). Refusing retention cleanup."
    rm -f /tmp/.bk-list.$$; exit 1
fi
ENTRIES=$(wc -l < /tmp/.bk-list.$$)
if [ "$ENTRIES" -lt "$ENTRY_FLOOR" ]; then
    echo "[$(date)] BACKUP TOO SMALL: $ENTRIES entries, floor $ENTRY_FLOOR. Refusing retention cleanup."
    echo "[$(date)] Check that $DATA_ROOT is mounted and populated."
    rm -f /tmp/.bk-list.$$; exit 1
fi
if ! grep -qF "instances/" /tmp/.bk-list.$$; then
    echo "[$(date)] BACKUP MISSING SENTINEL 'instances/' — wrong source? Refusing retention cleanup."
    rm -f /tmp/.bk-list.$$; exit 1
fi
rm -f /tmp/.bk-list.$$
SIZE=$(ls -lh "$ARCHIVE" | awk '{print $5}')
echo "[$(date)] Backup VERIFIED: $BACKUP_FILE ($SIZE), $ENTRIES entries, readable, sentinel present."

# Keep only last N days of backups
find "$BACKUP_DIR" -name "v2-production-data-*.tar.gz" -mtime +${RETENTION_DAYS} -delete 2>/dev/null

echo "[$(date)] Backup retention cleanup complete (keeping ${RETENTION_DAYS} days)"
