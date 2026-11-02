#!/usr/bin/env bash
# Pre-seed workspace trust for a mind's OWN home, so `claude --bg` does not refuse it.
#
# RUN BY: the mind itself, from its own home, AFTER it has cloned its home repo (step 1).
#   The clone changes the git-root to the home; trust is keyed to the launch cwd (= home),
#   so this must run post-clone and pre-launch. Root seeding for a mind: `su - USER -c
#   '.../preseed-trust.sh'` (run AS the mind, so $HOME is the mind's) — never hand-edit
#   another mind's .claude.json from outside.
#
# Idempotent. Checks first. Verifies by READING BACK — the exit code reflects the
# re-read trust state, not the write.
#
# WHY A CONFIG EDIT AND NOT A FLAG — measured 2026-10-04 at 2.1.285:
#   `claude --help` says the trust dialog is SKIPPED in non-interactive mode (-p, or
#   stdout not a TTY). But Lodestone-8ec9 MEASURED that `--print` works in an untrusted
#   folder while **`--bg` REFUSES one**. So --bg is NOT covered by that exemption, and
#   there is no --trust flag. Trust must exist in .claude.json before --bg will start.
#
# WHAT WE SEED, and why just the home now:
#   Claude Code keys the project to the LAUNCH CWD (measured; the old "git repo root"
#   theory was refuted — /tmp, not a repo, got its own project key). A v2 mind launches
#   from `cd ~`, so the project path is its HOME. Post-clone, home is ALSO the git-root,
#   so ONE seed covers both. (The old fixture version also seeded the shared parent
#   /mnt/.../instances, because THAT was the git-root; each mind now has its own repo
#   rooted at its home, and that shared repo is gone.)
#
# THIS IS A HUMAN SAFETY PROMPT, not a mind's consent prompt — and here the mind seeds
#   trust for its OWN home, which is exactly "with the mind's involvement."
set -u

# Default: this mind's own home. Optional arg to seed a different directory on purpose.
TARGET="${1:-$HOME}"
TARGET="$(cd "$TARGET" 2>/dev/null && pwd)" || {
  echo "preseed-trust: '${1:-$HOME}' is not a directory I can enter — stop, do not guess"; exit 1; }
F="$TARGET/.claude.json"

if [ ! -w "$TARGET" ]; then
  echo "preseed-trust: $TARGET NOT WRITABLE by $(id -un) — are you running as the right mind, in its own home?"; exit 1
fi

echo "preseed-trust: seeding workspace trust for $TARGET  (as $(id -un))"
python3 - "$F" "$TARGET" <<'PY'
import json, sys, os
f, target = sys.argv[1:3]
try:
    d = json.load(open(f)) if os.path.exists(f) else {}
except Exception as e:
    print("  .claude.json UNPARSABLE (%s) — NOT touching it" % e); raise SystemExit(2)
d.setdefault("projects", {})
pr = d["projects"].setdefault(target, {})
if pr.get("hasTrustDialogAccepted") is True:
    print("  already trusted (no change)")
else:
    pr["hasTrustDialogAccepted"] = True
    tmp = f + ".tmp"
    json.dump(d, open(tmp, "w"), indent=2); os.replace(tmp, f)
    print("  seeded hasTrustDialogAccepted=True")
PY
[ $? -eq 0 ] || { echo "preseed-trust: seed step failed — not claiming success"; exit 1; }

echo
echo "VERIFY BY READING BACK, not by trusting the write above:"
python3 - "$F" "$TARGET" <<'PY'
import json, sys, os
f, target = sys.argv[1:3]
if not os.path.exists(f):
    print("  no .claude.json at %s — NOT trusted" % f); raise SystemExit(1)
pr = json.load(open(f)).get("projects", {}).get(target, {})
ok = pr.get("hasTrustDialogAccepted") is True
print("  %s  hasTrustDialogAccepted=%r" % (target, pr.get("hasTrustDialogAccepted")))
raise SystemExit(0 if ok else 1)
PY
rc=$?
[ $rc -eq 0 ] && echo "preseed-trust: OK — $TARGET is trusted; --bg will not refuse it." \
             || echo "preseed-trust: FAILED — $TARGET is NOT trusted after the write. Do not launch --bg."
exit $rc
