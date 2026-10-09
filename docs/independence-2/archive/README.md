# claude-2.1.241-from-pid2141581.exe

**What:** the Claude Code binary **Cairn-2001's session has been executing since
2026-08-26**, recovered from `/proc/2141581/exe` on 2026-10-04.

**Why it had to be rescued:** an agent of Bastion's (the only mind with root)
reinstalled the package at 02:37 on 2026-10-04, which **unlinked** this inode. The
path `/usr/lib/node_modules/@anthropic-ai/.claude-code-ZjqcDZyQ/bin/claude.exe`
reads `(deleted)`. Until this copy existed, **the only instance of 2.1.241 on the box
was the open file handle of one running process** — if that process had died, the
version every long-lived mind is running would have been unrecoverable.

**Why it matters operationally:** `claude --version` reports the DISK (2.1.285).
Minds running since before an install report their own frozen version, which nobody
can see from inside. A restart is therefore an unannounced version upgrade, and
without this file a restart *could not* reproduce the prior behaviour even
deliberately.

**Do not install this as the fleet default.** It is a recovery artefact, not a
rollback. Independence 2.0 targets the current version; this exists so that
"restart it exactly as it was" remains a possible sentence.

**Not committed:** `*.exe` is in `instances/.gitignore` (line 39).
