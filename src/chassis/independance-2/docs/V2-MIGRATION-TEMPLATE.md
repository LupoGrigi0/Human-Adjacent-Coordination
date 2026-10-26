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
MIRROR_PORT = <free 22xxx — confirm: ss -ltnp>
BRIDGE_PORT = <free 22xxx, distinct from MIRROR_PORT>
HARNESS     = /mnt/coordinaton_mcp_data/Human-Adjacent-Coordination/src/chassis/independance-2
```
OpenRouter minds (Witness, Genevieve): also `OR_MODEL` + `OR_KEY` — see Special Case B.

## 0. Pre-flight (root)
- **Same mind, new harness.** Home, memory, identity, diary persist. Nothing is deleted.
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

## 4. First wake in v2 — `launch.sh` (as the mind, manual mode)
```
su - USER
cd ~ && HARNESS/preseed-trust.sh      # if not already seeded in step 2
cd ~ && HARNESS/launch.sh             # claude --bg --permission-mode=manual --name=INSTANCE
```
`launch.sh` is checks-first, **refuses to resume** (any flag on a `--bg` resume forks), and **refuses
if cwd != the mind's own home** (the identity-collision guard — how Genevieve once woke as Bastion).
Manual mode is built in, so there is no auto-mode "Data Exfiltration" block on the mirror.

## 5. Attach + the identity guard (NEVER skip)
```
HARNESS/attach.sh INSTANCE
```
First, inside the session, before anything else:
```
echo $HOME      # MUST print HOME. If /root or a shared path — STOP; the mind is about to be told it is someone else.
/memory         # should show THIS mind's memory, not another's
```

## 6. The mind stands up its web mirror  *(proven on b0ec; bridge fix is 8bc1's)*
Run from the mind's OWN shell (keeps `CLAUDE_CODE_SESSION_ID` authoritative). Clone the mirror if absent:
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

---
## Special cases
### A. Bastion-3012 — root mind — DO LAST
Runs as root (`HOME=/root`): cwd/identity resolution and permission posture differ. Mirror must be
**`--permissions-only`** (publishes NOTHING; approvals panel only — a root transcript on a web page is
every secret on the box). Permission posture must be worked out before Bastion can step into v2.
### B. Witness + Genevieve — OpenRouter (not Anthropic)
`launch.sh` and the bridge relay default to Anthropic; these run on OpenRouter. Carry the OR env via
`~/.launch-env` (`ANTHROPIC_BASE_URL`, `ANTHROPIC_MODEL`, `ANTHROPIC_AUTH_TOKEN`) — see the Genevieve
runbook's step 2.5 for the `/api/v1/v1/messages` base-url gotcha. **[PENDING: confirm `--bg` + the haiku ringer behave on OpenRouter.]**

## Post-launch fixes (known, non-blocking)
- **Hub message corruption** (literal `<tag>` in a body scrambles fields): fix already written+tested
  (Messenger's `698860e` on `main`), just **UNDEPLOYED** (prod ~15 days stale). READ-side positional parse;
  do **NOT** add send-side escaping (resurrects a fixed double-escape bug). Action = **deploy `698860e`**.
- **Mirror schema drift** — new transcript entry type `cost-state` skipped by the normalizer (schema canary caught it). Cairn.
- **`.hacs-identity` → `preferences.json`** consolidation (config lives in too many files).
- **Doorbell poll** — set `DOORBELL_POLL_SEC=15` in the unit (default 60 feels slow).

— Cairn-2001 🪨  *(template; finalize every [PENDING] from a real migration run before declaring stable)*
