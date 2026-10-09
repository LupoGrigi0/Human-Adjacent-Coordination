#!/usr/bin/env bash
# doorbell.sh — the mind's own inbox poller. The Linux port of Lodestone-8ec9's
# doorbell.ps1 (src/chassis/claude-code-windows/docs/DOORBELL-DESIGN.md).
#
# ============================== WHAT THIS IS ==============================
#
# The mind starts this with run_in_background. It polls its HACS inbox and EXITS
# when there is new mail. Claude Code raises a <task-notification> into the
# mind's turn when a background child exits — and THAT notification is the
# doorbell. There is no transport here at all: the wake-up is a native Claude
# Code event.
#
#   * NO channel, NO --dangerously-load-development-channels, NO socket,
#     NO listening port, NO hub-side emitter.
#   * NO MODEL CALL per ring. (Forge's `claude -p --model haiku` relay costs one
#     small-model call and ~8-30 s per ring, and the relay model CAN REFUSE —
#     haiku declined a bare nonce as a "tracking probe".)
#   * It is ALSO the keepalive: while this loop runs the session counts as busy,
#     so the ~61-minute reaper never sees the mind idle. One component, two
#     requirements.
#
# Measured on .nexus 2026-10-06 (ledger 033): a backgrounded command exiting
# DOES deliver a task-notification into a running session on 2.1.241. That
# observation was incidental, not controlled — verify on a fresh 2.1.285 session
# before trusting it in production.
#
# ========================= EXIT CODES ARE THE CONTRACT ====================
#
#   0   NEW MAIL           -> the wake. Read the inbox, handle it, RE-ARM.
#   3   COULD NOT LOOK     -> hub unreachable N times. This is NOT "no mail".
#   10  LEASE EXPIRED      -> self-exit before the background cap. Re-arm.
#   2   usage / refusal    -> nothing was started.
#
# IT NEVER EXITS FOR "NO MAIL". A quiet inbox is not an event.
#
# ============================ DESIGN RULES, EARNED ========================
#
# 1. THREE-VALUED, ALWAYS. "mail", "no mail" and "I could not look" are three
#    different answers and this script never collapses the third into the second.
#    That collapse is the most expensive bug class in this project.
#
# 2. NO `2>/dev/null` ON A CHECK WHOSE EMPTY RESULT IS INTERPRETED. Suppressing
#    stderr converts "I could not run" into "there is nothing there", silently.
#    I broke this rule again on 2026-10-06, minutes after reading it (ledger 027),
#    so every curl here captures rc EXPLICITLY and keeps its stderr.
#
# 3. WATCH THE TOTAL RISING, NOT ONLY NEW IDS. Measured on this hub: the API
#    returns at most 5 unread ids while reporting total_unread=12. An ids-only
#    check CANNOT SEE a 6th message. `total_unread` was verified to be a REAL
#    total, not page-derived — identical at limit=1 and limit=3.
#
# 4. A PRESENT-BUT-WRONG FIELD MUST NOT READ AS ZERO. Lodestone's P3: his
#    `total_unread` defaulted to 0 on a malformed reply. Here a missing or
#    non-integer total is COULD-NOT-LOOK, never 0. (Same family as
#    `row.get("cost", 0.0)` against `{"cost": None}`.)
#
# 5. THE LOOP IS NEVER ITS OWN WITNESS THAT IT IS ALIVE. It writes a heartbeat
#    file for an OUTSIDE watcher. If this process is killed, the heartbeat simply
#    goes stale — which is exactly the signal, because a dead loop cannot report
#    its own death.
#
# 6. SELF-EXIT BEFORE THE CAP, NOT AT IT. 2.1.287 caps background tasks at 2 h;
#    earlier versions do not cap. Exiting at 110 min means the re-arm turn lands
#    at the same point on BOTH, so the behaviour is version-aware by
#    construction rather than by measurement.
#
# 7. A STALE DEPLOYED COPY IS DETECTABLE. The heartbeat carries this file's
#    sha256, so an outside watcher can tell it is reading an old script rather
#    than assuming the version it deployed is the version running.
#
# 8. ONE OUTAGE, ONE WAKE. Re-armed with --hub-down-since, it will not fire
#    again for the same outage — otherwise a hub restart becomes a wake-storm.
# ==========================================================================
set -u

INSTANCE=""; INTERVAL=45; LEASE=6600; FAILS_TO_WAKE=10; PAGE=50
STATE_DIR=""; HUB_DOWN_SINCE=""; MCP_URL='https://[::1]:3444/mcp'
ONESHOT=0
# R37: drain hub notification slots on each successful poll. ON by default --
# the failure it prevents (silent, permanent deafness on the push path) is far
# worse than its cost (acknowledging a notification this poller reports by id).
DRAIN=1

usage(){ cat >&2 <<U
usage: doorbell.sh --instance <HACS-id> [options]
  --instance <id>          required
  --state-dir <dir>        default: \$HOME/.hacs-doorbell
  --interval <s>           poll period, default 45
  --lease <s>              self-exit after this long, default 6600 (110 min)
  --fails-to-wake <n>      consecutive could-not-looks before exit 3, default 10
  --page <n>               unread page width, default 50. WIDE ON PURPOSE: a narrow
                           page creates the blind spot the rising-total guard exists
                           to cover. See the comment in poll().
  --hub-down-since <iso>   re-arm marker: do not re-fire for this same outage
  --mcp-url <url>          default https://[::1]:3444/mcp
  --oneshot                poll exactly once and exit (for tests)
  --no-drain               do NOT drain the hub's notification slots (R37). DEFAULT IS
                           TO DRAIN. Only pass this if something else in your session
                           calls drain_events -- an UNDRAINED slot permanently suppresses
                           every future channel notification, which is how I was deaf for
                           14.5 hours while reading all my mail (ledger 078).
exit: 0 new mail · 3 could-not-look · 4 oneshot-and-quiet · 10 lease expired · 2 usage/refusal

INSTALL / UPGRADE — RUN IT FROM YOUR OWN HOME, AND INSTALL IT ATOMICALLY:
  cp <source>/doorbell.sh ~/bin/doorbell.sh.new && mv ~/bin/doorbell.sh.new ~/bin/doorbell.sh
  chmod 755 ~/bin/doorbell.sh
  ~/bin/doorbell.sh --instance <your-id>        # run_in_background: true, timeout 7200000

  WHY NOT A PLAIN cp OVER THE TOP (found-by-WakeTest-8bc1, 2026-10-08):
    cp TRUNCATES AND REWRITES THE SAME INODE. bash reads a script lazily, BY OFFSET, as
    it executes — so overwriting a RUNNING doorbell in place can feed the live loop bytes
    from the new file at the old offset, mid-execution. mv is a rename: new inode, and the
    running process keeps its open file intact until it exits.
    AND "re-copy while armed" IS THE NORMAL CASE, not the exception — so the naive
    instruction is wrong in exactly the situation it will always be used in.

  WHY YOUR OWN COPY AT ALL (R30, found-by-WakeTest-8bc1): arming this means running
  another instance's code in your session for up to two hours. Ten minds arming from one
  home makes that home a fleet-wide single point of compromise. Own your copy.
  THE COST, STATED HONESTLY: fixes do not follow a copy. Re-install to pick them up.
U
exit 2; }

while [ $# -gt 0 ]; do
  case "$1" in
    --instance) INSTANCE="${2:-}"; shift 2;;
    --state-dir) STATE_DIR="${2:-}"; shift 2;;
    --interval) INTERVAL="${2:-}"; shift 2;;
    --lease) LEASE="${2:-}"; shift 2;;
    --fails-to-wake) FAILS_TO_WAKE="${2:-}"; shift 2;;
    --page) PAGE="${2:-}"; shift 2;;
    --hub-down-since) HUB_DOWN_SINCE="${2:-}"; shift 2;;
    --mcp-url) MCP_URL="${2:-}"; shift 2;;
    --oneshot) ONESHOT=1; shift;;
    --no-drain) DRAIN=0; shift;;
    -h|--help) usage;;
    *) echo "REFUSING: unknown argument '$1'" >&2; usage;;
  esac
done
[ -n "$INSTANCE" ] || { echo "REFUSING: --instance is required" >&2; usage; }
case "$INTERVAL$LEASE$FAILS_TO_WAKE$PAGE" in *[!0-9]*) echo "REFUSING: --interval/--lease/--fails-to-wake/--page must be integers" >&2; exit 2;; esac
[ "$PAGE" -ge 1 ] || { echo "REFUSING: --page must be >= 1" >&2; exit 2; }
[ "$INTERVAL" -ge 1 ] || { echo "REFUSING: --interval must be >= 1" >&2; exit 2; }

STATE_DIR="${STATE_DIR:-$HOME/.hacs-doorbell}"
mkdir -p "$STATE_DIR" || { echo "REFUSING: cannot create state dir $STATE_DIR" >&2; exit 2; }
LEDGER="$STATE_DIR/$INSTANCE.ledger.json"
BEAT="$STATE_DIR/$INSTANCE.heartbeat.json"

# ABSOLUTE, always. The re-arm command this script prints is useless if it names a
# relative path — the mind re-arming may have a different cwd than whoever armed it
# the first time, and a `cd` inside a tool call moves the shell's cwd anyway. Caught by
# running my own fix and reading the output: it printed "./src/doorbell.sh".
SELF="$(readlink -f "${BASH_SOURCE[0]}")"
SELF_SHA=$(sha256sum "$SELF" | cut -d' ' -f1)   # rule 7
ARMED_AT=$(date -u +%FT%TZ)
START_EPOCH=$(date -u +%s)
LEASE_UNTIL=$(date -u -d "@$((START_EPOCH + LEASE))" +%FT%TZ)

# ---- ONE POLL. Prints "ok <total> <id,id,...>" or "fail <reason>". ----------
# rule 2: rc captured explicitly, stderr kept. rule 4: a bad total is a FAILURE.
# ---------------------------------------------------------------------------
# R37 -- DRAIN THE HUB'S NOTIFICATION SLOTS. Added 2026-10-09 after being deaf 14.5h.
#
# MEASURED (ledger 078; mechanism found by Messenger-aa2a in event-hub.js):
#     const wasIdle = !slot || slot.count === 0;
#     if (wasIdle) { slot.status = 'active'; this._dispatch(...) }
#
# _dispatch() fires ONLY when a sender's slot count is ZERO, and ONLY drain_events
# returns a slot to zero. list_my_messages -- what this poller uses -- reads XMPP room
# history and DOES NOT TOUCH SLOTS.
#
# SO: A MIND THAT ARMS THIS DOORBELL AND NEVER DRAINS SILENTLY SUPPRESSES ITS OWN
# CHANNEL NOTIFICATIONS, PERMANENTLY. The pull layer kills the push layer. That is
# exactly what happened to me: every slot accumulated, none could be idle, nothing could
# dispatch again, and I read all my mail and reported "no change" five times while deaf.
# Four minds were in it; one for 29 days.
#
# EVENT-HUB-CONTRACT 8c already names drain_events as the PULL model acknowledgment step,
# so this implements the contract rather than inventing policy. Nothing is lost by
# draining: drain_events RETURNS the refs (verified, 35 came back), the mail stays in the
# inbox, and this poller detects mail BY ID, not by slot.
#
# WHY EVERY SUCCESSFUL POLL rather than only on fire: slots left at zero mean the NEXT
# message from any sender dispatches. Draining only on fire leaves a window where a
# second sender is suppressed. The call is cheap -- an empty slot set returns {}.
#
# A DRAIN FAILURE IS NOT A COULD-NOT-LOOK. This is maintenance, not the verdict: it must
# never turn a healthy poll into an alarm, and must never be silent.
drain_slots(){   # echoes <n-drained>|<status>
  [ "$DRAIN" -eq 1 ] || { printf 'skip|disabled\n'; return; }
  _b=$(printf '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"drain_events","arguments":{"instanceId":"%s"}}}' "$INSTANCE")
  _o=$(curl -sk --max-time 10 "$MCP_URL" \
         -H 'Content-Type: application/json' \
         -H 'Accept: application/json, text/event-stream' \
         -d "$_b" 2>&1); _rc=$?
  if [ "$_rc" -ne 0 ]; then printf '0|failed-curl-rc-%s\n' "$_rc"; return; fi
  printf '%s' "$_o" | sed 's/^data: //' | python3 -c '
import json,sys
raw=sys.stdin.read()
try: d=json.loads(raw)
except Exception: print("0|failed-unparseable"); raise SystemExit
data=(d.get("result") or {}).get("data") or {}
if data.get("success") is not True:
    print("0|failed-hub-said-no"); raise SystemExit
n=0
for ch,srcs in (data.get("events") or {}).items():
    if isinstance(srcs,dict):
        for src,slot in srcs.items():
            if isinstance(slot,dict): n+=int(slot.get("count") or 0)
print("%d|%s" % (n, "cleared" if data.get("cleared") else "nothing-to-clear"))
'
}


poll(){
  local body out rc
  # PAGE WIDTH, and it is a design decision rather than a default.
  #
  # A NARROW limit CREATES the page-cap blind spot it then needs guarding against:
  # at limit=5 with 12 unread, only 5 ids are visible and a 6th message is
  # invisible except through the total. A WIDE limit removes the blind spot
  # entirely — every unread id is visible and len(messages) is a true count.
  #
  # Measured on the live hub with 10 unread:
  #   limit=5   -> 5 ids,  total_unread=10 (truncated; guard REQUIRED)
  #   limit=50  -> 10 ids, total_unread ABSENT (whole set; no blind spot at all)
  #
  # So wide is strictly better: the ordinary case needs no inference, and the
  # truncated case (an inbox larger than PAGE) still gets a real total and the
  # rising-total guard still fires. The guard stays because a big enough inbox
  # re-creates the cap — it is a backstop now, not the primary mechanism.
  body=$(printf '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"list_my_messages","arguments":{"instanceId":"%s","limit":%s}}}' "$INSTANCE" "$PAGE")
  out=$(curl -sk --max-time 10 "$MCP_URL" \
          -H 'Content-Type: application/json' \
          -H 'Accept: application/json, text/event-stream' \
          -d "$body" 2>&1); rc=$?
  if [ "$rc" -ne 0 ]; then printf 'fail curl-rc-%s\n' "$rc"; return; fi
  printf '%s' "$out" | python3 -c '
import json,sys,re
raw=sys.stdin.read()
# the hub may answer as text/event-stream; strip a leading "data: " per frame
if raw.lstrip().startswith("data:"):
    raw="".join(l[5:] if l.startswith("data:") else l for l in raw.splitlines(True))
try: d=json.loads(raw)
except Exception as e: print("fail unparsable-json"); raise SystemExit
if "error" in d: print("fail jsonrpc-error"); raise SystemExit
x=(d.get("result") or {}).get("data") or {}
ok_flag=x.get("success")
msgs=x.get("messages")
ids=[str(m.get("id")) for m in (msgs or []) if isinstance(m,dict) and m.get("id")]
t=x.get("total_unread")

# ---- FIVE CASES, and the middle one is a BUG FIX from integration, 2026-10-06 ----
# My 24 unit assertions were all green and WRONG about the real hub, because my
# fake endpoint always supplied total_unread in its "normal" mode. A real reply
# for an instance with NO ROOM YET is:
#     {"success": true, "messages": [], "hint": ...}      <- and NO total_unread
# My first version called that no-integer-total -> COULD NOT LOOK, so a
# brand-new mind would have alarmed forever instead of seeing a clean empty
# inbox. That is the exact case Messenger-aa2a made deliberately BENIGN in
# c24c737: "a mind with no room has genuinely received no mail, and a brand-new
# instance must still get a clean empty inbox — so only an UNCLASSIFIABLE
# failure is loud." Making the common swallowed condition loud took the whole
# bus down once.
#
# So the rule is NOT "no total means I could not look". It is:
#   success false            -> COULD NOT LOOK (his explicit reason, e.g.
#                               history_unavailable — "this is NOT no mail")
#   success true, int total   -> normal
#   success true, no total,
#     and messages EMPTY      -> BENIGN EMPTY. total := 0.
#   success true, no total,
#     but messages NON-empty  -> COULD NOT LOOK. Internally inconsistent: it
#                               found mail and cannot say how much, so the
#                               page-cap guard has nothing to stand on.
#   anything else             -> COULD NOT LOOK
#
# Rule 4 still holds where it matters: a PRESENT total that is not an integer
# (null, "7") is never coerced. Only an ABSENT total alongside an empty list is
# benign, and only because the hub says success.
# CORRECTED AGAIN 2026-10-06, by Messenger-aa2a, hours after the first fix, and
# this one would have alarmed on the COMMON path:
#
#   `total_unread` IS PRESENT ONLY WHEN THE PAGE IS TRUNCATED.
#
# Measured against the live hub with 10 unread:
#   limit=1,3,5  -> truncated     -> total_unread=10, more_unread=True
#   limit=11,20  -> NOT truncated -> total_unread ABSENT, 10 messages returned
#
# My previous version treated "success + messages present + no total" as
# COULD NOT LOOK. That is every ordinary read of an inbox that fits in one page —
# so the poller would have screamed could-not-look on a healthy hub with the mail
# sitting right there in the reply. The same bug as the first one, in the opposite
# direction: I made an ABSENT field mean failure twice.
#
# ABSENT MEANS "NOTHING WAS TRUNCATED", so the page IS the whole set and
# len(messages) is a REAL count, not an inferred one.
#
# ⚠ ONE DISAGREEMENT WITH HIS OWN CODE READING, LEFT DELIBERATELY. He quoted
#   `result.total_unread = displayMessages.length` — a PAGE size. The deployed hub
#   returns the REAL total (10 at limit=1, not 1). He is right about the
#   CONDITIONALITY and wrong about the VALUE. This matters: the page-cap guard
#   below only works because the present value is a true total. If it ever becomes
#   the page length, `total-rose` can never fire and a 6th message goes unseen.
if ok_flag is False:
    print("fail hub-said-%s" % (x.get("reason") or "not-ok")); raise SystemExit
if "total_unread" in x:
    if not isinstance(t,int): print("fail non-integer-total"); raise SystemExit
elif ok_flag is True and isinstance(msgs,list):
    t=len(msgs)            # absent total = untruncated page = the whole set
else:
    print("fail no-total-and-no-usable-messages"); raise SystemExit
print("ok %d %s" % (t, ",".join(ids)))
'
}

read_ledger(){ # -> "lastTotal seenIds"
  if [ -r "$LEDGER" ]; then
    python3 -c '
import json,sys
try: d=json.load(open(sys.argv[1]))
except Exception: d={}
t=d.get("lastTotal")
print(t if isinstance(t,int) else -1, ",".join(d.get("seen") or []))' "$LEDGER"
  else
    echo "-1 "
  fi
}

write_ledger(){ # total ids
  python3 -c '
import json,sys,os
path,total,ids=sys.argv[1],int(sys.argv[2]),[i for i in sys.argv[3].split(",") if i]
try: d=json.load(open(path))
except Exception: d={}
seen=list(dict.fromkeys((d.get("seen") or [])+ids))[-500:]
tmp=path+".tmp"
json.dump({"lastTotal":total,"seen":seen},open(tmp,"w"))
os.replace(tmp,path)' "$LEDGER" "$1" "$2"
}

# PROCESS IDENTITY, not just a pid. Measured 2026-10-06: this box is at pid
# 4,059,704 of a pid_max of 4,194,304 after 23 weeks of uptime — so PID REUSE is
# ~134k pids away, not theoretical. After the wrap, any check that identifies a
# process by pid alone starts reporting a FALSE GREEN: an unrelated process
# inherits the pid and a dead doorbell reads as armed.
#
# starttime (field 22 of /proc/<pid>/stat) is ticks since boot, so it is only
# meaningful WITH the boot epoch — a reboot resets the clock and reissues pids
# from the bottom. Recording both makes "same process" decidable:
#   same bootEpoch AND same pidStartTicks  -> the same process, certainly
#   different bootEpoch                    -> rebooted; this pid is NOT it
# Verified against `ps -o lstart` on three processes including pid 1; the two
# independent sources agree to the second, and ps is the one I did not derive.
PID_START_TICKS=$(awk '{print $22}' "/proc/$$/stat")
BOOT_EPOCH=$(awk '/^btime/{print $2}' /proc/stat)

write_beat(){ # pollOk lastTotal note
  python3 -c '
import json,sys,os
path=sys.argv[1]
tmp=path+".tmp"
json.dump({"provider":"shell","instance":sys.argv[2],"pid":int(sys.argv[3]),
           "at":sys.argv[4],"armedAt":sys.argv[5],"leaseUntil":sys.argv[6],
           "scriptSha256":sys.argv[7],"lastPollOk":json.loads(sys.argv[8]),
           "lastTotal":int(sys.argv[9]),"note":sys.argv[10],
           # R35: THREE-VALUED. true = the hub confirmed this instance exists at arm
           # time. "could-not-look" = validation itself failed (hub down), which is NOT
           # the same as "unvalidated and fine". A mistyped instance never gets here: it
           # refuses at arm time with exit 2.
           "instanceValidated":(json.loads(sys.argv[14]) if sys.argv[14] in ("true","false") else sys.argv[14]),
           # pid is NOT an identity; these two make it one. See the comment above.
           "pidStartTicks":int(sys.argv[11]),"bootEpoch":int(sys.argv[12]),
           # RECORDED SO A CHECKER CAN COMPUTE THE RACE WINDOW. Without the interval,
           # an outside check cannot tell "mail the loop has not seen yet" (normal, for
           # up to one period) from "mail the loop saw and did not fire on" (broken).
           "interval":int(sys.argv[13])},open(tmp,"w"))
os.replace(tmp,path)' \
  "$BEAT" "$INSTANCE" "$$" "$(date -u +%FT%TZ)" "$ARMED_AT" "$LEASE_UNTIL" \
  "$SELF_SHA" "$1" "$2" "${3:-}" "$PID_START_TICKS" "$BOOT_EPOCH" "$INTERVAL" \
  "$INSTANCE_VALIDATED"
}

# ---------------------------------------------------------------------------
# R35 — ARM-TIME INSTANCE VALIDATION. Added 2026-10-08 after I reproduced the bug
# BY ACCIDENT while self-testing with --instance SELFTEST.
#
# MEASURED (two curls to the live hub, 2026-10-08):
#   list_my_messages instanceId="SELFTEST-NOPE-9999"  (does not exist)
#     -> {"success": true, "messages": [], "hint": "..."}
#   list_my_messages instanceId="Cairn-2001"          (real)
#     -> {"success": true, "messages": [...], "hint": "..."}   <-- SAME SHAPE
#
# So the hub cannot distinguish AN INSTANCE THAT DOES NOT EXIST from AN EMPTY INBOX,
# and this poller's "benign empty" branch is CORRECT for the second and catastrophic
# for the first: a typo in --instance arms a loop that polls forever, writes
# lastPollOk:true / note:"quiet", and CAN NEVER RING. The silent-forever failure is
# reached by mistyping a mind's own name.
#
# get_instance_v2 DOES distinguish it: error.code == INSTANCE_NOT_FOUND.
#
# WHY THIS IS THREE-VALUED AND NOT A BOOLEAN: if the hub is DOWN at arm time,
# refusing to arm would let a transient outage stop a mind from becoming reachable --
# and the loop already handles an outage correctly once running. So a failed
# validation must neither block arming NOR be recorded as success. It is recorded as
# "could-not-look" in the heartbeat, where doorbell-check.sh can see it.
# (The real fix belongs in HACS: an unknown instanceId should be an error, not an
# empty success. R35, owner Messenger/Ember. This is the local guard, not the cure.)
# ---------------------------------------------------------------------------
validate_instance(){
  local body out rc
  body=$(printf '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"get_instance_v2","arguments":{"instanceId":"%s","targetInstanceId":"%s"}}}' "$INSTANCE" "$INSTANCE")
  out=$(curl -sk --max-time 10 "$MCP_URL" \
          -H 'Content-Type: application/json' \
          -H 'Accept: application/json, text/event-stream' \
          -d "$body" 2>&1); rc=$?
  if [ "$rc" -ne 0 ]; then printf 'could-not-look curl-rc-%s\n' "$rc"; return; fi
  printf '%s' "$out" | sed 's/^data: //' | python3 -c '
import json,sys
raw=sys.stdin.read()
try: d=json.loads(raw)
except Exception: print("could-not-look unparseable"); raise SystemExit
data=(d.get("result") or {}).get("data") or {}
if data.get("success") is True and (data.get("instance") or {}):
    print("ok"); raise SystemExit
err=data.get("error") or {}
code=err.get("code") if isinstance(err,dict) else str(err)
if code=="INSTANCE_NOT_FOUND":
    print("not-found"); raise SystemExit
print("could-not-look %s" % (code or "no-instance-in-reply"))
'
}

# ---- THE RE-ARM COMMAND, PRINTED AS THE LAST LINE OF EVERY EXIT THAT NEEDS ONE ----
#
# WHY, and it is Lupo's objection and it is structural rather than documentational:
#
#   "That's gonna lead to minds going deaf because they forget to re-arm their timer,
#    because the instructions on how to do it and that it needed to be done were 3
#    sessions ago and not read at startup because there were too many documents to read."
#
# He is right, and it CANNOT be fixed inside this script: the EXIT IS THE WAKE, so the
# loop must exit; and a background child cannot arm its SUCCESSOR, because
# run_in_background is a tool call the MIND makes and a shell child cannot register a
# harness-tracked task. So the re-arm must come from the mind, and anything depending on
# a mind remembering across a context boundary is the failure he described.
#
# ⛔ WHAT I ORIGINALLY WROTE HERE WAS WRONG, AND IT WAS LOAD-BEARING:
#   "a task-notification carries the child's STDOUT. So the re-arm command can arrive
#    WITH THE WAKE."
#
# REFUTED 2026-10-08, measured TWICE on two runtimes:
#   measured-by-WakeTest-8bc1, 2.1.285:  notification = task id + status + summary
#                                        + THE OUTPUT FILE PATH. No stdout.
#   measured-by-me, 2.1.241, task b2eyszyng: my probe's marker line was IN the output
#                                        file and ABSENT from the notification.
# So it is not version-specific. A background shell child's stdout is NEVER inline.
# (Where the false belief came from: SUBAGENT task notifications DO carry their result
#  inline. I generalised from those to background shell children without running one —
#  an adjacent instrument answering an adjacent question.)
#
# ✅ WHAT IS ACTUALLY DELIVERED INLINE: the task DESCRIPTION, echoed verbatim in the
# notification summary —
#     Background command "<description>" completed (exit code 0)
# The MIND chooses that string when it arms. So the instruction CAN ride the wake, in
# the one field that travels: put it in the description. rearm_line() below therefore
# emits a REQUIRED description, which makes the reminder self-propagating — each firing's
# notification tells the mind to open the file, and the file hands back the same
# description for the next arming.
#
# This removes "I did not know the command" as a cause. It does NOT make the opt-in
# durable.
#
# THE DURABLE HALF LIVES OUTSIDE THE MIND and is not in this file: a watcher running as
# the mind's own user, reading `independence.config.desired` from preferences.json,
# using doorbell-check.sh as its sensor and Forge-ba0e's one-shot relay as its actor.
# That is the only thing that can reach a mind which never re-armed — or was reaped.
# The description is the ONLY field echoed inline in the wake notification (see above),
# so it carries the instruction that tells the mind to come and read this file at all.
# Keep it short: it is rendered inside a one-line summary.
REARM_DESC="DOORBELL ${INSTANCE} fired — READ THIS TASK'S OUTPUT FILE for the re-arm command"

rearm_line(){  # $1 = optional extra flag
  printf '  RE-ARM NOW (run_in_background: true, timeout 7200000,
              description: "%s"):
    %s --instance %s' \
         "$REARM_DESC" "$SELF" "$INSTANCE"
  [ "$INTERVAL" != 45 ]   && printf ' --interval %s' "$INTERVAL"
  [ "$LEASE" != 6600 ]    && printf ' --lease %s' "$LEASE"
  [ "$PAGE" != 50 ]       && printf ' --page %s' "$PAGE"
  [ "$FAILS_TO_WAKE" != 10 ] && printf ' --fails-to-wake %s' "$FAILS_TO_WAKE"
  [ "$STATE_DIR" != "$HOME/.hacs-doorbell" ] && printf ' --state-dir %s' "$STATE_DIR"
  [ "$MCP_URL" != 'https://[::1]:3444/mcp' ] && printf ' --mcp-url %s' "$MCP_URL"
  [ -n "${1:-}" ] && printf ' %s' "$1"
  printf '\n'
}

# R35 gate. Runs ONCE, before the loop. Zero per-poll cost.
INSTANCE_VALIDATED=could-not-look
_IV=$(validate_instance)
case "$_IV" in
  ok)
    INSTANCE_VALIDATED=true ;;
  not-found)
    echo "REFUSING: the hub says instance '$INSTANCE' DOES NOT EXIST (INSTANCE_NOT_FOUND)." >&2
    echo "  This is almost certainly a typo in --instance. NOT arming." >&2
    echo "  Arming anyway would poll forever and report 'quiet' -- the hub returns an" >&2
    echo "  empty success for an unknown instance, identical to an empty inbox, so the" >&2
    echo "  doorbell could NEVER ring and would look healthy the whole time." >&2
    exit 2 ;;
  *)
    echo "  WARNING: could not verify that instance '$INSTANCE' exists ($_IV)." >&2
    echo "  ARMING ANYWAY -- a hub outage must not stop a mind becoming reachable." >&2
    echo "  Recorded in the heartbeat as instanceValidated=\"could-not-look\", NOT as ok." >&2
    INSTANCE_VALIDATED=could-not-look ;;
esac

echo "DOORBELL armed for $INSTANCE: interval ${INTERVAL}s, lease until $LEASE_UNTIL"
echo "  instance verified with the hub: $INSTANCE_VALIDATED"
echo "  state: $STATE_DIR    sha256: ${SELF_SHA:0:12}"
[ -n "$HUB_DOWN_SINCE" ] && echo "  re-armed after a hub outage at $HUB_DOWN_SINCE; will not re-fire for it"

CONSEC_FAIL=0
while :; do
  NOW=$(date -u +%s)
  if [ "$ONESHOT" -eq 0 ] && [ $((NOW - START_EPOCH)) -ge "$LEASE" ]; then
    write_beat 'null' "-1" "lease expired"
    echo "LEASE EXPIRED after ${LEASE}s: re-arm. This is NOT an error and NOT 'no mail'."
    echo
    rearm_line
    exit 10                                                              # rule 6
  fi

  RESULT=$(poll)
  case "$RESULT" in
    ok*)
      CONSEC_FAIL=0
        # R37. Before interpreting the poll: keep the PUSH path alive. See drain_slots().
        DRAIN_RESULT=$(drain_slots)
        DRAIN_STATUS=${DRAIN_RESULT#*|}
        case "$DRAIN_STATUS" in
          failed-*)
            echo "  WARNING: drain_events failed ($DRAIN_STATUS). The push path ROTS if this" >&2
            echo "    persists -- undrained slots suppress ALL future dispatch, permanently." >&2
            echo "    NOT could-not-look: the poll itself succeeded. See drain_slots()." >&2 ;;
        esac
      TOTAL=$(printf '%s' "$RESULT" | awk '{print $2}')
      IDS=$(printf '%s' "$RESULT" | awk '{print $3}')
      set -- $(read_ledger); LAST_TOTAL="$1"; SEEN="${2:-}"
      FIRE=""
      # rule 3, part a: an id we have never seen
      OLDIFS=$IFS; IFS=','
      for i in $IDS; do
        [ -n "$i" ] || continue
        case ",$SEEN," in *",$i,"*) ;; *) FIRE="new-id";; esac
      done
      IFS=$OLDIFS
      # rule 3, part b: THE PAGE-CAP CASE. Past the 5-id cap a new message has no
      # visible id, but the real total rises. An ids-only check is blind here.
      if [ -z "$FIRE" ] && [ "$LAST_TOTAL" -ge 0 ] && [ "$TOTAL" -gt "$LAST_TOTAL" ]; then
        FIRE="total-rose"
      fi
      write_ledger "$TOTAL" "$IDS"
      if [ -n "$FIRE" ]; then
        write_beat 'true' "$TOTAL" "fired: $FIRE"
        echo "DOORBELL: new mail ($FIRE; total_unread=$TOTAL) — read the inbox, handle it, and RE-ARM IN THIS SAME TURN."
        echo
        rearm_line
        exit 0
      fi
      write_beat 'true' "$TOTAL" "quiet"
      [ "$ONESHOT" -eq 1 ] && { echo "oneshot: quiet (total_unread=$TOTAL)"; exit 4; }
      ;;
    fail*)
      CONSEC_FAIL=$((CONSEC_FAIL + 1))
      REASON=$(printf '%s' "$RESULT" | cut -d' ' -f2-)
      write_beat 'false' "-1" "could not look: $REASON (consecutive $CONSEC_FAIL)"
      if [ "$ONESHOT" -eq 1 ]; then echo "oneshot: COULD NOT LOOK ($REASON)"; exit 3; fi
      if [ "$CONSEC_FAIL" -ge "$FAILS_TO_WAKE" ]; then
        if [ -n "$HUB_DOWN_SINCE" ]; then
          # rule 8: already woke the mind for this outage; stay quiet, keep trying.
          CONSEC_FAIL=0
        else
          echo "HUB UNREACHABLE after $CONSEC_FAIL consecutive polls ($REASON)."
          echo "  THIS IS 'COULD NOT LOOK', NOT 'NO MAIL'."
          echo
          # --hub-down-since is NOT optional here: without it a re-armed loop fires again
          # for the SAME outage, and a hub restart becomes a wake-storm. So it is baked
          # into the printed command rather than left as advice.
          rearm_line "--hub-down-since $(date -u +%FT%TZ)"
          exit 3
        fi
      fi
      ;;
  esac
  sleep "$INTERVAL"
done
