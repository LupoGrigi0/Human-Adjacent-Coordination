#!/usr/bin/env bash
# doorbell-check.sh — reconcile a mind's PULL DECLARATION against its RUNNING LOOP.
#
# ======================== WHY THIS EXISTS, AND IT IS THE WORST STATE =======
#
# `src/chassis/claude-code-pull.js` lets a mind declare `mode:'pull'`, and the hub
# then CORRECTLY STOPS TRYING TO DELIVER to it (EVENT-HUB-CONTRACT §8c: slot goes
# to `awaiting_fetch`, retry skips it). That is right — the mind's own poller
# fetches.
#
# So a mind that DECLARES pull and has NO ARMED POLLER is silently unreachable:
#
#     the hub is not trying.      the mind is not fetching.
#     nobody is failing.          no error exists anywhere.
#
# Every instrument reads green. The declaration is honoured perfectly. The mail
# simply sits. **This is the worst state the design can produce, and I introduced
# the possibility of it by writing the adapter** — the §8c fix that stops the hub
# lying about delivery also removes the only thing that used to complain.
#
# ====================== TWO LEDGERS, AND THEIR DISAGREEMENT IS THE DETECTOR =
#
#   LEDGER A  the heartbeat file  — written BY the loop, from inside
#   LEDGER B  the process table   — written by the KERNEL, from outside
#
# Neither is trusted alone. A config file is self-consistent by construction, so
# its consistency is evidence of nothing (Orla: "one check that agrees with
# itself proves nothing; you built one that can disagree"). The loop cannot
# witness its own death, so its heartbeat going stale IS the signal — but a stale
# heartbeat and a hung loop are different faults, and only B separates them:
#
#     beat FRESH + pid ALIVE   -> ARMED
#     beat STALE + pid ALIVE   -> HUNG. The loop exists and is not polling.
#     beat FRESH + pid DEAD    -> the writer is gone (or pid reuse). INCOHERENT.
#     beat absent / unreadable -> cannot tell, NOT "unarmed"
#
# ========================= EXIT CODES ARE THE CONTRACT ====================
#
#   0  ARMED          declared pull, heartbeat fresh, pid alive
#   1  UNARMED        declared pull and NO live doorbell  <-- THE ALARM
#   2  usage/refusal
#   3  CANNOT_TELL    could not read the declaration or the heartbeat
#   4  NOT_PULL       this mind does not declare pull; nothing to reconcile
#
# CANNOT_TELL IS NEVER COLLAPSED INTO EITHER ARMED OR UNARMED. A check that
# cannot look does not get to report a verdict.
set -u

INSTANCE=""; PREFS=""; STATE_DIR=""; STALE_AFTER=180
WITH_HUB=0; CONFIRM=0; MCP_URL='https://[::1]:3444/mcp'
usage(){ cat >&2 <<U
usage: doorbell-check.sh --instance <id> [--prefs <path>] [--state-dir <dir>] [--stale-after <s>]
  --stale-after <s>   heartbeat older than this is STALE, default 180 (4x a 45s poll)
  --with-hub          add a THIRD ledger: ask the hub whether mail is waiting that
                      the loop has already seen and failed to fire on. OFF by default
                      so the base check stays offline and cannot be broken by a hub outage.
  --confirm           with --with-hub, wait one poll interval and re-read before ruling,
                      which converts SUSPECT into a verdict by excluding the race.
  --mcp-url <url>     default https://[::1]:3444/mcp
exit: 0 ARMED · 1 UNARMED · 2 usage · 3 CANNOT_TELL · 4 NOT_PULL · 5 NOT_FIRING
       6 UNARMED (RECENT): pid gone, beat within --stale-after. STILL UNARMED — an actor
         should re-check once before ringing (measured re-arm window is 11-21s).
      (1 and 5 are both UNREACHABLE; they differ in cause — no loop vs a broken loop)
U
exit 2; }
while [ $# -gt 0 ]; do
  case "$1" in
    --instance) INSTANCE="${2:-}"; shift 2;;
    --prefs) PREFS="${2:-}"; shift 2;;
    --state-dir) STATE_DIR="${2:-}"; shift 2;;
    --stale-after) STALE_AFTER="${2:-}"; shift 2;;
    --with-hub) WITH_HUB=1; shift;;
    --confirm) CONFIRM=1; shift;;
    --mcp-url) MCP_URL="${2:-}"; shift 2;;
    -h|--help) usage;;
    *) echo "REFUSING: unknown argument '$1'" >&2; usage;;
  esac
done
[ -n "$INSTANCE" ] || { echo "REFUSING: --instance is required" >&2; usage; }
case "$STALE_AFTER" in *[!0-9]*) echo "REFUSING: --stale-after must be an integer" >&2; exit 2;; esac

# ---------------------------------------------------------------------------
# CONFIG HAZARD, added 2026-10-08 from ledger 075's own invalidation clause.
#
# Exit 6 (UNARMED RECENT) exists because the measured re-arm window is 11-21s: a mind
# whose loop fired seconds ago looks identical, by pid, to one that died. If
# --stale-after is set BELOW that window, exit 6 becomes UNREACHABLE and every healthy
# post-fire mind reports exit 1 (ACT) -- silently restoring the exact ambiguity 075
# removed, in the dangerous direction (an actor rings a mind that is already reading
# the ring it just got).
#
# WARN, DO NOT REFUSE. The consequence is spurious rings: annoying, reversible, and a
# legitimate fast-polling doorbell might want a low threshold. "Prevent the
# unrecoverable, allow the reversible."
#
# ⚠ AND THE HONEST LIMIT OF THIS GUARD, which is 075's own lesson pointed at it: this
# is PROSE, and the consumer of this script is a systemd unit that reads exit codes.
# A unit will not see this warning. I am accepting that because the VERDICT is still
# correct -- only one distinction becomes unreachable -- so there is nothing for the
# exit code to say. If that ever stops being true, this needs a code, not a sentence.
if [ "$STALE_AFTER" -lt 30 ]; then
  echo "WARNING: --stale-after $STALE_AFTER is below the measured re-arm window (11-21s," >&2
  echo "  ledger 068/072). Exit 6 (UNARMED RECENT) is UNREACHABLE at this setting, so a mind" >&2
  echo "  that fired seconds ago will report exit 1 (ACT) and an actor will ring a mind that" >&2
  echo "  is already handling the previous ring. The verdict is still correct; the RECENT/dead" >&2
  echo "  distinction is not available. Use >= 30 unless you mean this." >&2
fi

PREFS="${PREFS:-$HOME/preferences.json}"
STATE_DIR="${STATE_DIR:-$HOME/.hacs-doorbell}"
BEAT="$STATE_DIR/$INSTANCE.heartbeat.json"

# ---- LEDGER 0: the DECLARATION. Unreadable is CANNOT_TELL, not "not pull". ----
if [ ! -e "$PREFS" ]; then
  echo "CANNOT_TELL: no preferences at $PREFS — absent config is not a declaration of anything"
  exit 3
fi
if [ ! -r "$PREFS" ]; then
  echo "CANNOT_TELL: $PREFS exists and is NOT READABLE by $(id -un). This is could-not-look."
  exit 3
fi
DECL=$(python3 - "$PREFS" <<'PY'
import json,sys
try: d=json.load(open(sys.argv[1]))
except Exception as e: print("UNPARSABLE"); sys.exit()
ind=d.get("independence") or {}
cfg=ind.get("config") or {}
v=cfg.get("doorbell") or (d.get("runtime") or {}).get("type") or d.get("chassis")
print("PULL" if v in ("pull","claude-code-pull") else "NOTPULL")
PY
)
case "$DECL" in
  UNPARSABLE) echo "CANNOT_TELL: $PREFS is not valid JSON — I will not guess at a declaration"; exit 3;;
  NOTPULL)    echo "NOT_PULL: $INSTANCE does not declare a pull doorbell. Nothing to reconcile."; exit 4;;
esac

# ---- LEDGER A: the heartbeat, written by the loop from INSIDE ----
if [ ! -e "$BEAT" ]; then
  echo "UNARMED: $INSTANCE DECLARES pull and has NO heartbeat at $BEAT."
  echo "  The hub will not deliver (§8c) and nothing is fetching. Mail will sit with NO error anywhere."
  exit 1
fi
if [ ! -r "$BEAT" ]; then
  echo "CANNOT_TELL: heartbeat $BEAT exists and is not readable. Could-not-look, NOT unarmed."
  exit 3
fi
read -r AGE PID OKFLAG SHA BEATTICKS BEATBOOT BEATTOTAL BEATIVL <<EOF
$(python3 - "$BEAT" <<'PY'
import json,sys,time,os
try: d=json.load(open(sys.argv[1]))
except Exception: print("ERR ERR ERR ERR"); sys.exit()
at=d.get("at")
try:
    t=time.strptime(at,"%Y-%m-%dT%H:%M:%SZ"); age=int(time.time()-__import__("calendar").timegm(t))
except Exception: age="ERR"
print(age, d.get("pid") or "ERR", json.dumps(d.get("lastPollOk")), (d.get("scriptSha256") or "")[:12],
      d.get("pidStartTicks") if isinstance(d.get("pidStartTicks"),int) else "NONE",
      d.get("bootEpoch") if isinstance(d.get("bootEpoch"),int) else "NONE",
      d.get("lastTotal") if isinstance(d.get("lastTotal"),int) else "NONE",
      d.get("interval") if isinstance(d.get("interval"),int) else "NONE")
PY
)
EOF
[ "$AGE" = "ERR" ] && { echo "CANNOT_TELL: heartbeat unparsable or has no usable timestamp"; exit 3; }
case "$PID" in *[!0-9]*) echo "CANNOT_TELL: heartbeat carries no usable pid"; exit 3;; esac

# The loop's own reason for its last write. Extracted separately because it contains
# spaces ("fired: new-id", "lease expired") and so cannot ride the space-separated
# `read -r` above. This is the OTHER discriminator an actor needs: a note that EXPLAINS
# the exit, beside a stale beat, means the mind woke and never re-armed; a note that does
# not explain it means the loop died without ever firing.
NOTE=$(python3 -c 'import json,sys
try: print((json.load(open(sys.argv[1])).get("note") or "").replace("\n"," "))
except Exception: print("")' "$BEAT" 2>/dev/null)

# ---- LEDGER B: the KERNEL. Independent of anything the loop wrote. ----
#
# A PID IS NOT AN IDENTITY. Measured on this box 2026-10-06: pid 4,059,704 live
# against a pid_max of 4,194,304 after 23 weeks up — reuse is ~134k pids away.
# After the wrap, `/proc/<pid>` PRESENT would make an unrelated process look like
# the doorbell, and this check would report a FALSE GREEN. That is the precise
# failure this whole script exists to catch, so it must not contain one.
#
# Identity = (bootEpoch, starttime ticks). A reboot resets both, so a differing
# bootEpoch proves the pid is NOT the recorded process.
if [ -d "/proc/$PID" ]; then ALIVE=yes; else ALIVE=no; fi
IDENTITY=unchecked
if [ "$ALIVE" = yes ]; then
  NOWTICKS=$(awk '{print $22}' "/proc/$PID/stat" 2>/dev/null || echo ERR)
  NOWBOOT=$(awk '/^btime/{print $2}' /proc/stat 2>/dev/null || echo ERR)
  if [ "$BEATTICKS" = NONE ] || [ "$BEATBOOT" = NONE ]; then
    IDENTITY=unrecorded
  elif [ "$NOWTICKS" = ERR ] || [ "$NOWBOOT" = ERR ]; then
    IDENTITY=unreadable
  elif [ "$NOWBOOT" != "$BEATBOOT" ]; then
    IDENTITY=rebooted
  elif [ "$NOWTICKS" != "$BEATTICKS" ]; then
    IDENTITY=reused
  else
    IDENTITY=confirmed
  fi
fi

echo "  declaration : pull"
echo "  heartbeat   : age ${AGE}s  pid $PID  lastPollOk=$OKFLAG  sha ${SHA}"
echo "  kernel      : /proc/$PID $( [ "$ALIVE" = yes ] && echo PRESENT || echo ABSENT )"
echo "  identity    : $IDENTITY  (pid is not an identity; (bootEpoch,starttime) is)"

# Identity failures are UNARMED, because the loop that wrote this heartbeat is gone
# even though SOMETHING holds its pid.
case "$IDENTITY" in
  reused)
    echo "UNARMED (PID REUSE): /proc/$PID exists but its starttime does not match the"
    echo "  heartbeat ($NOWTICKS vs $BEATTICKS ticks, same boot). The doorbell is DEAD and an"
    echo "  unrelated process holds its pid. A pid-only check would have reported ARMED."
    exit 1;;
  rebooted)
    echo "UNARMED (REBOOTED): the machine booted at $NOWBOOT, the heartbeat recorded $BEATBOOT."
    echo "  Pids were reissued from the bottom, so this pid is certainly not that process."
    exit 1;;
  unreadable)
    echo "CANNOT_TELL: /proc/$PID/stat is not readable, so process identity cannot be confirmed."
    echo "  Not reporting ARMED on an identity I could not check."
    exit 3;;
  unrecorded)
    echo "  NOTE: this heartbeat predates identity recording (no pidStartTicks/bootEpoch),"
    echo "        so the PID-REUSE check COULD NOT RUN. The verdict below rests on freshness"
    echo "        and pid presence alone. Re-arm the doorbell to get identity coverage.";;
esac

if [ "$ALIVE" = no ]; then
  if [ "$AGE" -le "$STALE_AFTER" ]; then
    # EXIT 6, NOT 1 — ADDED 2026-10-08 FROM TWO REAL READINGS OF ONE DEAF MIND, 22 MIN APART.
    # Both printed different prose and BOTH EXITED 1:
    #     age  170s  "INCOHERENT -> UNARMED ... the two ledgers disagree"   exit 1
    #     age 1516s  "UNARMED ... The loop is dead."                        exit 1
    # The outer watcher is a systemd unit. IT READS THE EXIT CODE, NOT THE PROSE. So a
    # distinction this script had already made was invisible to its only real consumer,
    # and an actor would treat a mind that re-armed 5s ago exactly like one dead for 25
    # minutes. Measured re-arm window is 11-21s (ledger 068/072), so ringing on the first
    # delivers a ring to a mind already reading the last one.
    echo "UNARMED (RECENT) -> pid $PID is GONE but the heartbeat is only ${AGE}s old."
    echo "  note        : ${NOTE:-<none>}"
    echo "  The two ledgers disagree. Either the loop exited moments ago and the mind has"
    echo "  not re-armed YET (normal — the measured window is 11-21s), or it died."
    echo "  THIS IS STILL UNARMED. Not healthy, not ok. But an ACTOR SHOULD RE-CHECK ONCE"
    echo "  before ringing: a mind handling the ring it just got looks exactly like this."
    exit 6
  fi
  echo "UNARMED: pid $PID is gone and the heartbeat is ${AGE}s old. The loop is dead."
  echo "  note        : ${NOTE:-<none>}"
  echo "  ${AGE}s is far beyond the 11-21s re-arm window, so the mind did not re-arm."
  echo "  If the note EXPLAINS the exit (fired / lease expired) it woke and never came"
  echo "  back. If it does not, the loop died without firing. EITHER WAY: ACT."
  exit 1
fi
if [ "$AGE" -gt "$STALE_AFTER" ]; then
  echo "UNARMED (HUNG): pid $PID is ALIVE but its heartbeat is ${AGE}s old (> ${STALE_AFTER}s)."
  echo "  A live process that has stopped polling is NOT a working doorbell. This is the"
  echo "  failure a liveness check on the PROCESS ALONE would have called healthy."
  exit 1
fi
# ---- LEDGER C (opt-in): THE HUB. Does mail exist that this loop already SAW? ----
#
# doorbell-check.sh otherwise reconciles EXISTENCE and IDENTITY. It cannot tell
# whether a loop that is alive and polling still EXITS ON MAIL — a doorbell that
# writes a perfect heartbeat and never rings is the last false green in the design.
#
# The hub is a third independent ledger, and the comparison is:
#
#     hub total > heartbeat.lastTotal   -> mail exists the loop has not accounted for
#
# THE RACE, which is why this is SUSPECT and not a verdict by default: mail may have
# arrived AFTER the loop's last poll, which is normal for up to one poll interval.
# Only a condition that SURVIVES a full interval distinguishes "has not seen it yet"
# from "saw it and did not fire". --confirm waits and re-reads; without it this
# reports SUSPECT and says the race was not excluded.
if [ "$WITH_HUB" = "1" ]; then
  hub_total(){
    local body out rc
    body=$(printf '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"list_my_messages","arguments":{"instanceId":"%s","limit":50}}}' "$INSTANCE")
    out=$(curl -sk --max-time 10 "$MCP_URL" -H 'Content-Type: application/json' \
            -H 'Accept: application/json, text/event-stream' -d "$body" 2>&1); rc=$?
    [ "$rc" -ne 0 ] && { echo "ERR"; return; }
    printf '%s' "$out" | python3 -c '
import json,sys
raw=sys.stdin.read()
if raw.lstrip().startswith("data:"):
    raw="".join(l[5:] if l.startswith("data:") else l for l in raw.splitlines(True))
try: d=json.loads(raw)
except Exception: print("ERR"); raise SystemExit
if "error" in d: print("ERR"); raise SystemExit
x=(d.get("result") or {}).get("data") or {}
if x.get("success") is False: print("ERR"); raise SystemExit
t=x.get("total_unread")
if isinstance(t,int): print(t); raise SystemExit
m=x.get("messages")
print(len(m) if isinstance(m,list) else "ERR")'
  }
  HUB=$(hub_total)
  if [ "$HUB" = "ERR" ]; then
    echo "  hub         : COULD NOT LOOK — the third ledger is unavailable, so the"
    echo "                fires-on-mail leg did not run. NOT folded into the verdict."
  elif [ "$BEATTOTAL" = "NONE" ]; then
    echo "  hub         : $HUB unread, but this heartbeat records no lastTotal — leg could not run."
  else
    echo "  hub         : $HUB unread   loop last accounted for $BEATTOTAL"
    if [ "$HUB" -gt "$BEATTOTAL" ]; then
      WINDOW="${BEATIVL}"; case "$WINDOW" in NONE|*[!0-9]*) WINDOW=45;; esac
      if [ "$CONFIRM" = "1" ]; then
        echo "                mail unaccounted for. Waiting $((WINDOW + 5))s to exclude the race…"
        sleep $((WINDOW + 5))
        HUB2=$(hub_total)
        AGE2=$(python3 -c '
import json,sys,time,calendar
try:
    d=json.load(open(sys.argv[1])); t=time.strptime(d.get("at"),"%Y-%m-%dT%H:%M:%SZ")
    print(int(time.time()-calendar.timegm(t)))
except Exception: print("ERR")' "$BEAT")
        BEATTOTAL2=$(python3 -c '
import json,sys
try:
    d=json.load(open(sys.argv[1])); v=d.get("lastTotal")
    print(v if isinstance(v,int) else "NONE")
except Exception: print("NONE")' "$BEAT")
        echo "                after wait: hub=$HUB2  loop lastTotal=$BEATTOTAL2  heartbeat age=${AGE2}s"
        if [ "$HUB2" = "ERR" ] || [ "$AGE2" = "ERR" ]; then
          echo "  CANNOT_TELL: lost a ledger during the confirm wait. No verdict on firing."
          exit 3
        fi
        if [ "$AGE2" -gt "$((WINDOW * 2 + 10))" ]; then
          echo "  CANNOT_TELL: the loop stopped writing during the wait, so it was not polling"
          echo "    through the window. That is a DIFFERENT fault (hung) and this leg cannot rule."
          exit 3
        fi
        if [ "$BEATTOTAL2" != "NONE" ] && [ "$HUB2" -gt "$BEATTOTAL2" ]; then
          echo "NOT_FIRING: the loop polled through a full interval with $HUB2 unread at the hub"
          echo "  and only $BEATTOTAL2 accounted for, and it is STILL RUNNING. It sees mail and does"
          echo "  not exit. The heartbeat is perfect and the doorbell never rings — the race is"
          echo "  excluded because the loop demonstrably polled during the wait."
          exit 5
        fi
        echo "                race excluded in the other direction: the loop caught up. Firing works."
      else
        echo "  ⚠ SUSPECT (not a verdict): $HUB unread at the hub, loop accounted for $BEATTOTAL."
        echo "    Mail may simply have arrived since its last poll — normal for up to ${WINDOW}s."
        echo "    Re-run with --confirm to wait a full interval and exclude the race."
      fi
    fi
  fi
fi

if [ "$OKFLAG" = "false" ]; then
  echo "ARMED, but its last poll COULD NOT LOOK. The loop is alive and the hub is not"
  echo "  answering it. Reported rather than folded into the verdict: the doorbell is armed;"
  echo "  what it can see is a separate question."
fi
echo "ARMED: declaration and running loop agree, confirmed against the kernel."
exit 0
