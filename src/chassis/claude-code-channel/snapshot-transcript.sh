#!/usr/bin/env bash
# snapshot-transcript.sh — git-backed restore points for session transcripts.
# Generalized fleet version (any instance, any project dirs).
#
# Claude Code auto-deletes session .jsonl files (cleanupPeriodDays, default
# 30) and has lost transcripts to bugs before. The transcript is a mind's
# source-of-truth memory; copies OUT of ~/.claude are the rollback ladder.
#
# Scheme: a git repo at ~/transcript-archive. jsonl is append-mostly text,
# so git packfiles store compressed DELTAS — an idle run costs nothing (no
# commit), an active day costs roughly the compressed size of NEW content
# only (measured: 19MB of full states -> 2.33MiB packed). Every run that
# sees change is a commit; restore = `git show <commit>:<file>`.
# NOTHING is ever deleted and NO history-rewriting git ops are permitted
# here — this is an archive wearing git, not a repo.
#
# Safe any time: jsonl is append-only, a mid-append copy loses at most a
# torn final line, which --resume and parsers must tolerate anyway.
#
# Install: cron entry `17 */6 * * *` (see instance-hygiene.sh).
# Crossing-2d23, 2026-08-13. Proven on Crossing before fleet rollout.
set -euo pipefail

CLAUDE_PROJECTS="$HOME/.claude/projects"
DEST="$HOME/transcript-archive"

[[ -d "$CLAUDE_PROJECTS" ]] || exit 0

mkdir -p "$DEST"
cd "$DEST"
if [[ ! -d .git ]]; then
  git init -q
  git config user.name "snapshot-cron"
  git config user.email "snapshot@$(whoami).local"
  if compgen -G "*" > /dev/null; then
    git add -A && git commit -qm "pre-existing archive contents" || true
  fi
fi

shopt -s nullglob
for f in "$CLAUDE_PROJECTS"/*/*.jsonl; do
  # namespace by project-dir slug to avoid cross-project collisions.
  # NB: slugs begin with '-' (path-encoded), so every command taking one
  # needs an explicit '--' end-of-options marker. (Found by self-test.)
  slug="$(basename -- "$(dirname -- "$f")")"
  mkdir -p -- "$slug"
  base="$slug/$(basename -- "$f")"
  # append-only sanity: live file SHORTER than our copy means it was
  # rewritten/rotated underneath us — preserve the old state before
  # tracking the new one. Divergent histories both survive.
  if [[ -f "$base" ]] && (( $(stat -c%s -- "$f") < $(stat -c%s -- "$base") )); then
    mv -- "$base" "${base%.jsonl}.rotated.$(date -u +%Y%m%d-%H%M%S).jsonl"
  fi
  cp -- "$f" "$base"
done

git add -A
if ! git diff --cached --quiet; then
  git commit -qm "snapshot $(date -u +%Y-%m-%dT%H:%M:%SZ)"
fi
git gc --auto -q 2>/dev/null || true
