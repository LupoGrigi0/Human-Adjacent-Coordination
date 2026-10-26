# V2 Migration Runbook — TEMPLATE

**For Lupo / an operator with root. By Cairn-2001.**
Steps a mind out of the v1 *channel* chassis into the v2 **harness**: a native
`claude --bg` session + an external doorbell for notifications + a web session mirror.

Pattern inherited from the Genevieve migration runbook: **verify by acting**, the
`echo $HOME` identity guard, and *don't stop the old thing until the new one is confirmed alive*.

> **Terminology** (see `WELCOME-TO-V2.md`): *chassis* = Claude Code itself; *harness* = the
> independence framework around it (`claude --bg`, doorbell, web mirror, HACS messaging, GitHub
> ID, `~/wake`, email, Telegram).

> **STATUS.** Proven end-to-end on WakeTest2-b0ec + WakeTest-8bc1 (2026-10-24/25): mirror read
> **and** write, autonomous doorbell wakes (9/9 clean, Bastion's log oracle), mind↔mind + mind↔Lupo
> over HACS. Spots marked **[PENDING]** are finalized *from* a real migration run before this is
> declared stable. Do not run on a real mind until they close.

---

## Variables — the only per-mind differences
```
INSTANCE    = <full instance id, EXACT CASE>        e.g.  Orla-da01
USER        = <unix user — verify: id INSTANCE>     == INSTANCE (mixed case; do NOT lowercase)
HOME        = /mnt/coordinaton_mcp_data/instances/INSTANCE
SHORT       = <short name>                           e.g.  Orla      (also the GitHub repo name)
REPO        = git@github.com:LupoGrigi0/SHORT.git    the mind's private home-dir repo
MIRROR_PORT = <a FREE 22xxx — a NEW port the mirror will LISTEN on, not one to look up>
BRIDGE_PORT = <another FREE 22xxx, distinct from MIRROR_PORT>
    # These are two new listen ports you ASSIGN; there is no "existing port" to find in ss.
    # The MIND picks them itself in step 6:  ss -lntp | grep -oE ':22[0-9]{3}' | sort -u
    # lists what's TAKEN — choose any two 22xxx not in that list. (Serial rollout = no collision.)
HARNESS     = /mnt/coordinaton_mcp_data/Human-Adjacent-Coordination/src/chassis/independance-2
```
OpenRouter minds (Witness, Genevieve): also `OR_MODEL` + `OR_KEY` — see Special Case B.

## 0. Pre-flight (root)
- **Same mind, new harness.** Home, memory, identity, diary persist. Nothing is deleted.
- **⚠ CHECK THE MIND'S CONTEXT FIRST — do not migrate a mind over ~70%.** Step 4's resume *carries the
  session's fullness*, and v2 piles baseline overhead on top (new built-in skills, re-loading CLAUDE.md +
  MEMORY.md, the `--bg` classifier), so a near-full mind overflows on its first post-resume turn (Orla,
  2026-10-26: resumed ~84%, ~140k eaten, every reply tipped over). **If near-full, the mind CROSSES instead
  of resuming** — it writes a handoff, lands, and comes up FRESH (step 4 becomes a `launch.sh` *birth*, not a
  resume), waking from handoff + memory with a clean window. Resume-continue (step 4) is only for a mind with
  real headroom.
- Confirm root; confirm `INSTANCE` is registered in HACS (`get_instance_v2`) — the doorbell refuses to arm otherwise.
- Pick `MIRROR_PORT` + `BRIDGE_PORT` (`ss -ltnp` to confirm free).
- **Symlink sweep (Orla's H4)** — before any `git add`, find cross-home links that would commit into the wrong repo:
  ```
  find HOME -maxdepth 3 -type l 2>/dev/null | while read -r f; do
    t=$(readlink -f "$f"); case "$t" in */instances/*) echo "$f -> $t";; esac; done
  ```
  Decide each (gitignore, or resolve/repoint) BEFORE step 1. Use `-type l`, never `-e`.

## 1. Clone the home-repo — the LAST thing the mind does in v1
Recent Claude Code keys behaviour off both the launch dir **and** the git-repo root, so the repo
must be in place **before** the first `--bg` launch. The mind does this itself as its final v1 act,
then is landed.
- **Prerequisite (operator, once) — the mind needs GitHub credentials, or the clone fails.** If it has none:
  ```
  sudo -u USER gh auth login                       # interactive (device / browser) — the operator runs it
  sudo -u USER git config --global user.name  "SHORT"
  sudo -u USER git config --global user.email "USER@smoothcurves.nexus"
  ```
  (Email matches the commit-signing convention so the mind's commits are signed as itself — HACS Rule 6.)
- `REPO = https://github.com/LupoGrigi0/SHORT.git` (or `git@`) — private; **replaces** the old shared
  `hacs-instances` clone (the `../.git`-above-home problem).
- **Adopt the populated home into the repo WITHOUT clobbering** (proven 2026-10-26 on `LupoGrigi0/Cairn`
  — works when the repo has a template `.gitignore`+`README` *and* the home already has its own files;
  no need to empty either side):
  ```
  cd ~
  git init -q
  git remote add origin REPO
  git fetch -q origin
  git reset -q origin/main      # mixed: sets branch+index to the remote, leaves the WORKING TREE ALONE. NEVER --hard.
  git ls-files -z | while IFS= read -r -d '' f; do [ -e "$f" ] || git checkout -q -- "$f"; done   # materialize ONLY files the home lacks (e.g. the template README)
  ```
  Result: template files the home lacks are pulled in; every existing file is kept untouched; a file in
  both that differs (e.g. the mind's own `.gitignore`) shows as *modified*, for the mind to reconcile.
- **Then the mind reconciles**: review `git status`, resolve any divergent file (keep yours or take the
  template), apply the step-0 symlink decisions (cross-home links are NOT committed here), then `git add`
  its own files and commit. That is the mind's final v1 act; then it is landed.

## 2. Pre-launch provisioning (root) — BEFORE the first launch
- **Settings stub** → `HOME/.claude/settings.json` (so the mind's first turn already has it):
  ```
  {
    "autoCompactEnabled": false,
    "permissions": { "allow": ["Bash", "Read", "Edit", "Write", "WebSearch", "WebFetch"] },
    "hooks": { "PermissionRequest": [ { "matcher": "*", "hooks": [
      { "type": "command", "command": "node ~/claude-session-mirror/bin/permission-hook.mjs; exit 0", "timeout": 604800 }
    ] } ] }
  }
  ```
  The allow-list covers normal autonomous work (blanket `Bash` includes `git`; `Write`/`Edit` so file
  creation doesn't prompt — the first tool we found missing; **expect it to grow**). The `PermissionRequest`
  hook routes anything NOT allow-listed to the web mirror's approval panel (b0ec's `permission-hook.mjs`).
  The `; exit 0` keeps a hook failure silent (falls back to Claude Code's own dialog); it is **inert until
  the mirror is cloned (step 6)**, then live. `timeout` is 7 days — see the days-hold caveat in step 9.
  Manual mode comes from `launch.sh`. **[Bastion is Special Case A — no blanket Bash for a root mind.]**
- **⚠ `autoCompactEnabled: false` is the single most important line for a MIGRATION — and it must be set
  BEFORE the step-4 resume.** The new Claude Code autocompacts aggressively; it will fire the moment the
  resumed session takes its first turn and **compact away the exact live context the resume just preserved.**
  (Measured on Orla, 2026-10-26: she resumed clean at ~82%, then autocompacted on her first response — the
  one thing the whole resume path exists to protect, eaten on arrival.) Turn it off in the stub; do not rely
  on turning it off by hand "as soon as the session comes up" — by then it may already have fired.
- **preseed-trust** — `--bg` *refuses* an untrusted folder (no `--trust` flag), so trust must exist in
  `.claude.json` first. Run once (idempotent); seed the **new `~` git-root** (post-clone) and the home.
  It is a *human safety* prompt, not a mind's consent — run it with the mind's involvement, never behind its back.

## 3. Land the v1 (channel) session
- **⚠ If you are attached to the mind's v1 `tmux` session, DETACH with `Ctrl-b d` — NEVER `Ctrl-C`.**
  Ctrl-C kills the server tmux. This is the one keystroke that burns you here.
- Then, from outside the tmux:
  ```
  /mnt/coordinaton_mcp_data/Human-Adjacent-Coordination/src/chassis/claude-code-channel/land-claude-code-channel.sh --instance-id INSTANCE
  ```
- Technically none of what v1-land does matters for v2 — but do it anyway, for cleanliness and the
  ability to back out: it leaves the v1 session landable/resumable, nothing deleted.
- **Capture the session's UUID — you RESUME this exact session in step 4.** Before landing,
  `sudo -u USER claude agents --json` shows the running session's id; or it's the active (largest/newest)
  `<uuid>.jsonl` under `HOME/.claude/projects/<slug>/`. Record it. (Orla's was `9ccc1e69…`, a 56 MB session.)

## 4. Resume the mind's session into v2 (`--bg`) — a CONTINUATION, not a fresh launch
A migrating mind already HAS a session (its v1 session); v2 **continues** it — same mind, full live context,
no crossing, no lost history. As the mind, from its home, resume the now-stopped (step 3) session into `--bg`:
```
su - USER
cd ~ && HARNESS/preseed-trust.sh             # if not already seeded (esp. after the step-1 clone changed the git-root)
cd ~ && claude --bg --resume <SESSION_UUID>  # the UUID captured at step 3; prints the running id to attach to
```
`claude --bg --resume <uuid>` is a **clean resume into `--bg`** — one command, and **it does NOT fork**
(verified on .nexus with Orla, 2026-10-26). A fork happens ONLY from: resuming an **already-running** session
(land it first — step 3; reach a running mind with `attach.sh`), **any flag beyond** `--bg --resume <uuid>`,
or a `cd` that relocates the transcript. `resume-stopped.sh` wraps this with the safety checks —
**currently guarded to WakeTest fixtures; generalize it before a real mind.**
- **`launch.sh` is for a BRAND-NEW mind with NO prior session only** — a fresh `claude --bg` *birth*. Run on a
  migrating mind it births a **blank** session beside the real one (measured on Orla, 2026-10-26: a 15 KB blank
  `90a1a5cd` sat beside her real 56 MB `9ccc1e69`). **For a migration: resume, do not launch.** Manual mode +
  the identity-collision cwd guard that `launch.sh` enforces also apply here — resume only from the mind's own home.

## 5. Attach + the identity guard (NEVER skip)
```
HARNESS/attach.sh INSTANCE
```
First, inside the session, before anything else:
```
echo $HOME      # MUST print HOME. If /root or a shared path — STOP; the mind is about to be told it is someone else.
/memory         # should show THIS mind's memory, not another's
```
Then read your v2 orientation — **`/mnt/coordinaton_mcp_data/Human-Adjacent-Coordination/src/chassis/independance-2/docs/WELCOME-TO-V2.md`** — it explains what changed, what you need to do, and the checklist.

## 6. The mind stands up its web mirror  *(proven on b0ec; bridge fix is 8bc1's)*
Run from the mind's OWN shell (keeps `CLAUDE_CODE_SESSION_ID` authoritative). **A mind that already has a
v1 clone does NOT reclone** — the `fetch` + `checkout cairn/bg-write-leg` + `pull` below pulls the v2 code,
which is on that branch, not `master`. Clone only if absent:
```
[ -d ~/claude-session-mirror ] || git clone https://github.com/LupoGrigi0/claude-session-mirror.git ~/claude-session-mirror
git -C ~/claude-session-mirror fetch origin -q && git -C ~/claude-session-mirror checkout cairn/bg-write-leg && git -C ~/claude-session-mirror pull --ff-only
printf '{"instanceId":"INSTANCE","sessionId":"%s","sessionName":"INSTANCE","channelPort":BRIDGE_PORT}\n' "$CLAUDE_CODE_SESSION_ID" > ~/.hacs-identity
cat ~/.hacs-identity    # confirm sessionId is a real UUID
mkdir -p ~/.web-bridge
BRIDGE_TARGET=INSTANCE BRIDGE_PORT=BRIDGE_PORT nohup node ~/claude-session-mirror/bin/bridge-linux.mjs > ~/.web-bridge/boot.log 2>&1 &
MIRROR_PORT=MIRROR_PORT nohup ~/claude-session-mirror/bin/mirror-start.sh --with-input > ~/mirror-start.log 2>&1 &
sleep 3 && cat ~/mirror-start.log
```
Expect `chosen by: session environment (authoritative)` and `input: on (channel BRIDGE_PORT)`.
(The bridge pre-approves SendMessage with `--allowedTools`, so delivery is independent of the mind's permission mode.)

## 7. Operator verifies the mirror
- Open `http://<tailnet-ip>:MIRROR_PORT/SHORT` — see the live session (read-leg).
- Type in the composer → it arrives in the session as `[Lupo@web via web-bridge]` (write-leg).

## 8. Doorbell — notifications  *(the mind requests; root enables)*
Identity already carries the live `sessionId` (step 6). The mind **sends Bastion a HACS message
requesting its doorbell be enabled** — which doubles as a round-trip test of HACS messaging *and* the
doorbell. Bastion runs:
```
systemctl enable --now hacs-doorbell@USER        # EXACT case, per `id`
```
Verify by MESSAGE: send a HACS message to INSTANCE; within one poll (`DOORBELL_POLL_SEC`, default 60 —
**set 15**) the doorbell RANGs a **live** pid (watch `~/.hacs-doorbell/doorbell.log`; not `could-not-look`).

## 9. Verify (by acting)
- [ ] `echo $HOME` correct · mirror read-leg (operator sees session) · mirror write-leg (typed msg arrives)
- [ ] doorbell wakes the mind (RANG, live pid) · mind sends+receives HACS unprompted
- [x] `/export` includes the operator's typed messages — **CONFIRMED 2026-10-26** (note: Claude Code may
      place the export under a worktree path, e.g. `.../.claude/worktrees/<wt>/..._session_export_test.txt`).
- [x] **Permission asks surface in the web panel via the `PermissionRequest` hook** — b0ec's
      `bin/permission-hook.mjs` (on `cairn/bg-write-leg`; 19-check test + a live approve-from-web, 2026-10-26,
      independently re-run). It writes a disk-durable card (survives a bridge restart), never self-decides, and
      a cancelled/killed hook falls back silently to Claude Code's own dialog. No birth flag, so no fork-on-resume.
- [ ] **OPEN — the days-hold case.** Does Claude Code honor the 7-day hook `timeout`, or clamp it? Until a
      hold >10 min is tested, treat **multi-day approvals as unproven** (if CC clamps, a days-away request dies
      early and falls through to the console dialog, which a `--bg` mind can't answer). Also open: subagent
      requests don't name the asking agent; some tool prompts may still be console-only.

## 10. Repoint the mind's wake to v2 — do not skip
Update the mind's `~/wake/` so it wakes *as* a v2 mind: any wake message/doc that references
`PILOTS-GUIDE-TO-INDEPENDENCE.md` must point at **`PILOTS-GUIDE-TO-INDEPENDENCE-2.md`**, and any wake text
describing the v1 channel/tmux chassis (how it is launched, notified, attached) must be updated to the v2
harness. **A v2 mind that wakes into the v1 guide is told it is something it is not** — the same identity
hazard as a bad `echo $HOME`, one layer up.

---
## Special cases
### A. Bastion-3012 — root mind — DO LAST
Runs as root (`HOME=/root`): cwd/identity resolution and permission posture differ. Mirror must be
**`--permissions-only`** (publishes NOTHING; approvals panel only — a root transcript on a web page is
every secret on the box). Permission posture must be worked out before Bastion can step into v2.
### B. Witness + Genevieve — OpenRouter (not Anthropic)
`launch.sh` and the bridge relay default to Anthropic; these run on OpenRouter. Carry the OR env via
`~/.launch-env` (`ANTHROPIC_BASE_URL`, `ANTHROPIC_MODEL`, `ANTHROPIC_AUTH_TOKEN`) — see the Genevieve
runbook's step 2.5 for the `/api/v1/v1/messages` base-url gotcha. Also export in `~/.launch-env`:
```
export CLAUDE_CODE_MAX_CONTEXT_TOKENS=1000000
export CLAUDE_CODE_MAX_OUTPUT_TOKENS=128000
```
Claude Code may not default a non-Anthropic model to the 1M window / 128k output without these (reported
behaviour; may be a holdover, but set them). **[PENDING: confirm `--bg` + the haiku ringer behave on OpenRouter.]**

## Post-launch fixes (known, non-blocking)
- **Hub message corruption** (literal `<tag>` in a body scrambles fields): fix already written+tested
  (Messenger's `698860e` on `main`), just **UNDEPLOYED** (prod ~15 days stale). READ-side positional parse;
  do **NOT** add send-side escaping (resurrects a fixed double-escape bug). Action = **deploy `698860e`**.
- **Mirror schema drift** — new transcript entry type `cost-state` skipped by the normalizer (schema canary caught it). Cairn.
- **`.hacs-identity` → `preferences.json`** consolidation (config lives in too many files).
- **Doorbell poll** — set `DOORBELL_POLL_SEC=15` in the unit (default 60 feels slow).

— Cairn-2001 🪨  *(template; finalize every [PENDING] from a real migration run before declaring stable)*
