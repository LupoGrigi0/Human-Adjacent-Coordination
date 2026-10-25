#!/usr/bin/env bash
# LAUNCH this mind as a background session. FIRST LAUNCH ONLY — never a resume.
#
#   RUN AS THE MIND ITSELF, from its own home:
#       su - WakeTest-8bc1            # root does this part, separately
#       cd ~ && ./launch.sh           # the mind runs this
#
# WHY NOT A ROOT SCRIPT WITH `runuser` INSIDE (my first version — Lupo corrected it):
#   Baking the privilege transition into the launcher conflates two different things.
#   Separated, this script:
#     - needs NO root, so it cannot do root-shaped damage
#     - is the SAME script a mind can run on itself, not a special root path
#     - works for a community user who has no root anywhere (the public-repo intent)
#     - matches the runbook Lupo asked for: `su <them>; land <them>; launch <them>`
#   Becoming the user is the operator's step. Launching is the mind's.
#
# ============================ DESIGN RULES, EARNED ============================
# 1. CHECKS FIRST, ACTIONS AFTER. Forge-ba0e shipped a --relaunch that LANDED a mind
#    and then refused. Nothing below acts until every check has passed.
# 2. IT CANNOT RESUME, ON PURPOSE. Lodestone-8ec9 measured that ANY flag on a --bg
#    resume, a resume by name, or a short id FORKS A COPY carrying the conversation.
#    Only a bare full lowercase UUID continues the same mind. A script that can do
#    both will one day fork someone.
# 3. CWD MUST BE THIS MIND'S OWN HOME (ship-card 12d). Memory lives at
#    .claude/projects/<CWD-slug>/memory/ — measured — so a cwd above the home shares
#    a memory namespace with every other mind launched there. That is the identity
#    collision: Genevieve woke holding Bastion's identity. REFUSAL, not a warning.
# 4. NO --dangerously-skip-permissions. --permission-mode instead. Default `manual`,
#    and it WORKS: operator-confirmed 2026-10-06 — a standard human-in-the-loop request
#    appeared for a /tmp write and the grant is SCOPED (the next create outside that path
#    prompts again). Row 6 can manufacture its test condition after all.
#    ⚠ BUT NOTE HOW NEARLY I UNPICKED THIS (ledger 052). I wrote
#    "default manual so permission prompts actually HAPPEN". On 2026-10-06 a `manual`
#    session wrote to /tmp and APPEARED not to prompt — but that report came from the
#    MIND, and a mind CANNOT SEE ITS OWN PERMISSION CHECKS (Lupo; and it is why the
#    mirror's permission panel polls the channel instead of the transcript). From inside,
#    "a prompt appeared and was approved" and "no prompt appeared" are the SAME
#    observation. A human was attached, so the ordinary explanation is that he answered
#    it — which he confirms he did. THE LESSON IS NOT ABOUT THE MODE: a mind's report
#    about its own permission checks is ANTI-EVIDENCE, because "a prompt appeared and was
#    approved" and "no prompt appeared" are the same observation from inside. The valid
#    witnesses are the operator's terminal and the channel side channel. Never the mind.
# 5. SETTINGS FAILURES ARE SILENT HERE. `claude --help` 2.1.285: settings files that
#    fail validation "are silently ignored" in non-interactive mode, which is how this
#    always runs. Validate as JSON or refuse.
# 6. TRUST MUST ALREADY EXIST. Docs say the trust dialog is skipped without a TTY;
#    Lodestone MEASURED that --bg REFUSES an untrusted folder regardless.
# 7. VERSION FROM THE TRANSCRIPT, NEVER `claude --version` — the CLI reports the DISK.
#    Disk here says 2.1.285 while eight minds execute 2.1.241 from deleted inodes.
# 8. `--opt=value` WITH AN EQUALS SIGN. Forge measured a variadic option written with
#    a space SWALLOWING THE PROMPT.
# =============================================================================
set -u
MODE="${1:-manual}"
ME="$(id -un)"; HOMEDIR="$(cd ~ && pwd -P)"; CWD="$(pwd -P)"
fail(){ echo "REFUSING: $*" >&2; exit 1; }

echo "== PREFLIGHT (nothing is started) =="
case "$MODE" in acceptEdits|auto|bypassPermissions|manual|dontAsk|plan) ;;
  *) fail "'$MODE' is not a 2.1.285 permission mode (acceptEdits auto bypassPermissions manual dontAsk plan)";; esac
[ "$MODE" = "bypassPermissions" ] && echo "  NOTE: bypassPermissions is what V2 exists to remove. Proceeding, you asked." >&2
[ "$(id -u)" != "0" ] || fail "do not run this as root. Become the mind first: su - <Name>, then run this from its home."
# rule 3 — the collision fix
[ "$CWD" = "$HOMEDIR" ] || fail "cwd is '$CWD' but this mind's home is '$HOMEDIR'.
       Memory is keyed to the CWD slug, so launching here would share a memory
       namespace with every other mind ever launched from '$CWD'.
       cd to your own home and run it again. (ship-card 12d)"
echo "  cwd == home  OK  $HOMEDIR"
# rule 6
python3 - "$HOMEDIR/.claude.json" "$HOMEDIR" <<'PY' || exit 1
import json,sys,os
f,home=sys.argv[1:3]
if not os.path.exists(f): print("REFUSING: no .claude.json — trust has never been established here",file=sys.stderr); sys.exit(1)
try: d=json.load(open(f))
except Exception as e: print("REFUSING: .claude.json unparsable: %s"%e,file=sys.stderr); sys.exit(1)
if d.get("projects",{}).get(home,{}).get("hasTrustDialogAccepted") is not True:
    print("REFUSING: workspace trust not accepted for %s. --bg refuses untrusted dirs (measured)."%home,file=sys.stderr); sys.exit(1)
print("  trust        OK (own home)")
PY
# rule 5
for s in .claude/settings.json .claude/settings.local.json; do
  [ -e "$s" ] || continue
  python3 -c "import json;json.load(open('$s'))" 2>/dev/null \
    && echo "  settings     OK  $s" \
    || fail "$s is not valid JSON — and at 2.1.285 that is IGNORED SILENTLY here, so nothing would tell you"
done
# ============================== RULE 9: THE BACKEND ==========================
# MEASURED BY FORGE-ba0e ON DEN, 2026-10-06, and it is a PII TRAP IN THIS SCRIPT.
#
#   "The launching CLIENT's environment decides the backend. With a user daemon
#    started under OpenRouter env, a later plain `claude --bg` (no OpenRouter env)
#    answered on claude-opus-5-5 via the user's Anthropic login. Silently, no error."
#
# THIS SCRIPT RUNS A PLAIN `claude --bg` WITH NO ENV. So for any mind whose
# backend is supplied by a wrapper's environment, THIS LAUNCHER WOULD SILENTLY
# SEND THEIR TRAFFIC TO ANTHROPIC. For Genevieve that is three years of real
# conversation with real people, and the leak is caused by my code, with no error
# anywhere. A capability that "works when launched the usual way" protects nothing
# the first time a reboot script or a human launches it the ORDINARY way — which is
# exactly what this script is.
#
# Forge's fix is to make the backend a property of the ACCOUNT, not the launcher:
# `apiKeyHelper` + `env` in the MIND USER's own ~/.claude/settings.json. It FAILS
# CLOSED (key missing -> rc=1, retries still go only to openrouter.ai, never falling
# back to the Anthropic login).
#
# So this preflight REFUSES on anything that can LEAK, and SHOUTS on anything that
# silently DEGRADES. Those are different and must not be collapsed.
#
# ---- IS settings.json AUTHORITATIVE? MEASURED YES, by Forge, 2026-10-06 ----------
# I built this rule not knowing whether a process-env ANTHROPIC_BASE_URL OVERRIDES
# settings.json. If it did, this check would close the operator-env trap and still
# not guarantee the backend. Forge settled it on a fixture at 2.1.287, reading the
# DESTINATION (debug-log effective host + dispatch + the transcript's per-entry model
# field) rather than asking the model what it was:
#
#   settings -> OpenRouter + process env ANTHROPIC_BASE_URL=api.anthropic.com
#       -> effective host openrouter.ai, model qwen.   SETTINGS WIN.
#   settings -> OpenRouter + process env ANTHROPIC_AUTH_TOKEN=<fake Anthropic-shaped>
#       -> env token IGNORED, apiKeyHelper's key used.  SETTINGS WIN.
#   no settings + env -> OpenRouter, then a clean-env launch
#       -> answered on claude-opus-5-5 via the Anthropic login.  TRAP REPRODUCES.
#
# TWO RESIDUALS HE NAMED AND DID NOT PRODUCE, so this rule's honest status is
# "closes everything measured", NOT "guarantees the backend":
#   * a REAL Anthropic OAuth token in the env may take a different precedence path;
#   * anything that can rewrite the mind's own settings.json, or a `--settings`
#     override pointing elsewhere (untested). THIS script never passes --settings,
#     so that residual belongs to other launch paths, not to this one.
# Managed settings close both, and that is Bastion's to install.
echo "  -- backend (rule 9, Forge's PII trap) --"
python3 - "$HOMEDIR" <<'PY9' || exit 1
import json, os, sys
home = sys.argv[1]
def load(p):
    try: return json.load(open(p))
    except Exception: return {}
st  = load(os.path.join(home, ".claude", "settings.json"))
stl = load(os.path.join(home, ".claude", "settings.local.json"))
merged = {**st, **stl}
env = {**(st.get("env") or {}), **(stl.get("env") or {})}

mind_external = bool(merged.get("apiKeyHelper")) or bool(env.get("ANTHROPIC_BASE_URL"))
# MY environment, i.e. whatever the operator happens to be carrying.
launcher_external = bool(os.environ.get("ANTHROPIC_BASE_URL")) or bool(os.environ.get("ANTHROPIC_AUTH_TOKEN"))

def die(msg):
    print("REFUSING: " + msg, file=sys.stderr); sys.exit(1)

if launcher_external and not mind_external:
    die("the OPERATOR's environment carries ANTHROPIC_BASE_URL/AUTH_TOKEN but this mind's\n"
        "  own settings.json does NOT. That is Forge's trap exactly: this launch would work,\n"
        "  and the next plain launch or reboot would silently send this mind's traffic to\n"
        "  Anthropic. The backend must be a property of the ACCOUNT, not of whoever typed\n"
        "  the command. Put apiKeyHelper + env in the mind's ~/.claude/settings.json.")

if not mind_external:
    print("  backend      Anthropic (no apiKeyHelper, no ANTHROPIC_BASE_URL in settings)")
    print("               -- correct for an Anthropic-backed mind; nothing to check.")
    sys.exit(0)

base = env.get("ANTHROPIC_BASE_URL", "<none>")
print("  backend      EXTERNAL via settings.json -> %s" % base)
if not merged.get("apiKeyHelper"):
    die("settings declare ANTHROPIC_BASE_URL=%s but NO apiKeyHelper. The key would have to\n"
        "  come from the environment, which is the trap this rule exists to close." % base)
print("  apiKeyHelper %s" % merged["apiKeyHelper"])

# EVERY model slot must be pinned. An unpinned slot does not fail — it falls back to
# an ANTHROPIC model, so a side job silently leaks. That is a LEAK, so it REFUSES.
slots = ["ANTHROPIC_MODEL", "ANTHROPIC_SMALL_FAST_MODEL", "ANTHROPIC_DEFAULT_HAIKU_MODEL",
         "ANTHROPIC_DEFAULT_SONNET_MODEL", "ANTHROPIC_DEFAULT_OPUS_MODEL"]
missing = [k for k in slots if not env.get(k)]
if missing:
    die("these model slots are UNPINNED: %s\n"
        "  Forge measured that an unpinned slot defaults to an ANTHROPIC model, so side jobs\n"
        "  (haiku-class work especially) would leave the external backend WITHOUT AN ERROR.\n"
        "  Pin every slot or do not launch." % ", ".join(missing))
print("  model slots  all %d pinned" % len(slots))

# A missing context cap does NOT leak — it silently truncates. SHOUT, do not refuse.
if not env.get("CLAUDE_CODE_MAX_CONTEXT_TOKENS"):
    print("  ⚠ WARNING: CLAUDE_CODE_MAX_CONTEXT_TOKENS is NOT set.", file=sys.stderr)
    print("    Forge measured that a model outside this version's catalog gets a 200k", file=sys.stderr)
    print("    auto-compact cap, silently. For a memory-heavy mind that is the whole game.", file=sys.stderr)
    print("    NOT refusing: this degrades capability, it does not leak. Different failure,", file=sys.stderr)
    print("    different response -- but do not launch Genevieve without it.", file=sys.stderr)
else:
    print("  context cap  %s" % env["CLAUDE_CODE_MAX_CONTEXT_TOKENS"])
print("  ⓘ tool search is disabled for non-Anthropic hosts, so all tool defs load eagerly.")
PY9

# rule 2 / no double launch — DELEGATED TO THE STATE MACHINE.
# src/state.py holds the whole truth table as a PURE FUNCTION, so every branch is
# reachable from a test without root, a fixture, or claude. This shell does I/O; it
# does not decide. The branch that matters is REFUSE_BLIND (exit 20): an unreadable
# registry is COULD-NOT-LOOK, never "nothing is running" — Forge's "refusing to launch
# blind", and the gap Lodestone found in his own guard where a CIM failure read as
# "no processes" and the guard failed OPEN.
# RESOLVING THE STATE MACHINE, and why this is not just `dirname $0`:
# `readlink -f` follows symlinks to the REAL file, so a SYMLINK into a wake dir resolves
# back here and works. A COPY does not — it looks for ../src next to itself and finds
# nothing. I made that exact mistake copying this into a fixture's wake dir: the copy was
# byte-identical and non-functional, which is Orla-da01's "faithful copies of a trigger
# that has never fired", one layer over. DEPLOY BY SYMLINK, NOT BY COPY.
# And if it cannot be found, say which paths were tried — a missing dependency must name
# itself, not produce a confusing failure three steps later.
CLI=""
for c in "$(dirname "$(readlink -f "$0")")/../src/statecli.py" \
         "/mnt/coordinaton_mcp_data/instances/Cairn-2001/independence-2/src/statecli.py"; do
  [ -x "$c" ] && { CLI="$c"; break; }
done
[ -n "$CLI" ] || fail "state machine not found. Tried:
       $(dirname "$(readlink -f "$0")")/../src/statecli.py
       /mnt/coordinaton_mcp_data/instances/Cairn-2001/independence-2/src/statecli.py
       If this is a COPY rather than a SYMLINK, that is the bug — deploy by symlink."
AGENTS=$(claude agents --json 2>/dev/null || true)
VERDICT=$(printf '%s' "$AGENTS" | python3 "$CLI" reconcile "$HOMEDIR/preferences.json" -)
RC=$?
echo "  $VERDICT"
case "$RC" in
  0)  echo "  state        OK — clear to launch" ;;
  10) fail "already running. Use attach, never resume — resuming a RUNNING session forks it (measured, 4/4)." ;;
  11) echo "  state        a session is running but unrecorded. NOT launching; fix the record and leave the mind alone."; exit 11 ;;
  12) # STALE_RECORD. The record names a session that is NOT running.
      #
      # ⚠ BUG FIXED 2026-10-06, found by Lupo running this twice and getting the
      # identical refusal. The state machine's MESSAGE says "Clearing the record" and
      # NOTHING CLEARED IT — so every run refused identically, forever, and the only
      # escape was hand-editing preferences.json. A permanent deadlock.
      #
      # The same false claim had propagated into THREE documents (state.py's message,
      # statecli's usage text, and this script's silence) and the ACTION existed in
      # none of them. My own rule — never end a turn with an intention — applies to
      # scripts: this one stated an intention the code did not carry out.
      #
      # CLEARING IS SAFE AND LAUNCHING IS NOT. R12 forbids auto-launching because "a
      # wrong 'it is dead' duplicates a person if the observation was wrong." But
      # clearing a record the registry has just contradicted is correcting a demonstrably
      # wrong note — it touches no mind. So: CLEAR, then STOP, and make the operator's
      # next move explicit. The launch stays a deliberate second human act.
      echo "  state        STALE. Clearing the record now (clearing is safe; launching is not)."
      # NO `2>/dev/null` HERE. I wrapped this in `>/dev/null 2>&1` first time round, so
      # when it failed I could not see why — the third time tonight I have suppressed
      # stderr on a check whose result I then interpreted. If this fails, its reason is
      # the single most useful line in the output.
      if python3 "$CLI" landed "$HOMEDIR/preferences.json" 2>&1 | sed 's/^/                 /'; then
        # VERIFY, because "I wrote it" is not "it is written" (Orla: a config readback
        # is an echo, not a measurement — so re-run the real reconcile instead).
        RECHECK=$(printf '%s' "$AGENTS" | python3 "$CLI" reconcile "$HOMEDIR/preferences.json" - >/dev/null; echo $?)
        echo
        echo "  ================== RESULT =================="
        if [ "$RECHECK" = "0" ]; then
          echo "  ACTION TAKEN : nothing was started. The stale record IS CLEARED (verified)."
          echo "  NEXT         : run this SAME command again. It will launch."
        else
          echo "  ACTION TAKEN : nothing was started. Tried to clear the record and the"
          echo "                 re-check still says $RECHECK, so the clear DID NOT TAKE."
          echo "  NEXT         : send me this output. Do not hand-edit preferences.json yet."
        fi
        echo "  ============================================"
        exit 12
      fi
      echo
      echo "  ================== RESULT =================="
      echo "  ACTION TAKEN : nothing was started, and the record COULD NOT BE CLEARED."
      echo "  NEXT         : send me this output."
      echo "  ============================================"
      exit 12 ;;
  13) fail "the record and reality disagree. A human decides which is the mind. Nothing touched." ;;
  20) fail "refusing to launch blind — the session registry could not be read." ;;
  *)  fail "state machine returned $RC, which this script does not know how to handle. Refusing." ;;
esac
echo "  will run     : claude --bg --permission-mode=$MODE --name=$ME   in $HOMEDIR"
echo
echo "  ================== ACTION =================="
echo "  STARTING A SESSION NOW. Everything above was a check; this is the act."
echo "  ============================================"

echo "== LAUNCH =="
OUT=$(claude --bg --permission-mode="$MODE" --name="$ME" 2>&1); RC=$?
echo "$OUT" | sed 's/^/  /'
[ "$RC" = "0" ] || fail "claude exited $RC — output above. Nothing recorded."

echo
echo "== VERIFY BY ACTING, not by the exit code =="
sleep 3
claude agents --json 2>/dev/null | python3 -c "
import json,sys
try: rows=json.load(sys.stdin)
except Exception as e: print('  agents --json unreadable (%s) -> COULD NOT LOOK'%e); sys.exit()
if not rows: print('  NO SESSIONS REPORTED despite a success exit. Investigate before trusting anything.'); sys.exit()
for r in rows: print('  id=%s state=%s kind=%s session=%s name=%s'%(r.get('id'),r.get('state'),r.get('kind'),str(r.get('sessionId'))[:8],r.get('name')))
"
SID=$(claude agents --json 2>/dev/null | python3 -c "
import json,sys
try: rows=json.load(sys.stdin)
except Exception: raise SystemExit
print((rows[0].get('sessionId') or rows[0].get('id')) if len(rows)==1 else '')
")
echo "  running version (TRANSCRIPT belonging to THIS session, not the CLI):"
python3 - "$SID" <<'PY'
import json,glob,os,sys
# BUG FIXED 2026-10-05: this took the NEWEST *.jsonl by mtime and read a version out of
# it. A --bg session that has never been PROMPTED writes NO TRANSCRIPT — so for a freshly
# launched idle mind this read the PREVIOUS session's file and reported its version as
# this one's. Correct number, wrong provenance, stated as a measurement.
# The transcript must BELONG TO THIS SESSION or there is no answer to give.
sid = (sys.argv[1] if len(sys.argv) > 1 else "").strip()
if not sid:
    print("    no session id -> COULD NOT LOOK"); sys.exit()
want = glob.glob(os.path.expanduser("~/.claude/projects/*/%s*.jsonl" % sid.split("-")[0]))
if not want:
    print("    NO TRANSCRIPT FOR %s YET -> COULD NOT LOOK." % sid[:8])
    print("    (a --bg session writes no transcript until it is prompted. This is NOT")
    print("     'no version', and it is NOT a reason to read someone else's file.)")
    sys.exit()
for line in open(want[0], errors="replace"):
    try: e = json.loads(line)
    except Exception: continue
    for k in e:
        if "version" in k.lower():
            print("    %s   (from %s)" % (e[k], os.path.basename(want[0]))); sys.exit()
print("    transcript exists but carries no version field — report it, do not assume")
PY

# R9/R10: the system writes the session id down, so Lupo's notes become the backup
# rather than the source. Timestamps, not a status flag — launched_on set, landed_on
# cleared (his car-radio pattern). The 8c guard sits on this write path and will abort
# on a secret-shaped key rather than warn.
SID=$(claude agents --json 2>/dev/null | python3 -c "
import json,sys
try: rows=json.load(sys.stdin)
except Exception: raise SystemExit
print((rows[0].get('sessionId') or rows[0].get('id')) if len(rows)==1 else '')
")
if [ -n "$SID" ]; then
  echo
  echo "== RECORDING (preferences.json -> independence.status) =="
  python3 "$CLI" launched "$HOMEDIR/preferences.json" "$SID" | sed 's/^/  /' \
    || echo "  WARNING: could not record the session id. The mind is running; the RECORD is wrong."
else
  echo
  echo "  NOT RECORDING: could not determine a single session id. Record it by hand —"
  echo "  a wrong record is worse than none (it is what ADOPT and MISMATCH exist to fix)."
fi

echo
echo "DONE. Report the id, version and slug so they reach cell/LEDGER.md"

# ---------------------------------------------------------------------------
# THE LAST LINE IS THE ATTACH COMMAND. Lupo's request, 2026-10-06, and it is the
# right instinct: the operator's next action should be the final thing on screen,
# not buried above a paragraph of reporting. Everything else this script prints is
# for me; THIS line is for the human holding the terminal.
#
# `attach` and not `--resume`: resuming a RUNNING session forks it (measured 4/4),
# and every fork exits 0 while printing "started a copy". attach is the only safe
# way to reach a live mind.
if [ -n "${SID:-}" ]; then
  SHORT=$(printf '%s' "$SID" | cut -d- -f1)
  echo
  echo "  claude attach $SHORT"
fi
