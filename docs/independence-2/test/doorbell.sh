#!/usr/bin/env bash
# Adversarial test of src/doorbell.sh — the mind's own inbox poller.
#
# What would have to be true for the doorbell to be safe:
#  1. It NEVER fires for "no mail". A quiet inbox is not an event.
#  2. It fires on a new id.
#  3. It fires when the TOTAL rises even with NO new visible id — the page-cap
#     case. This hub returns at most 5 unread ids while reporting total_unread=12,
#     so an ids-only check is structurally blind to a 6th message.
#  4. Every way of failing to look reports COULD-NOT-LOOK (exit 3), never "quiet".
#  5. A present-but-wrong total is NOT read as zero (Lodestone's P3: his
#     `total_unread` defaulted to 0 on a malformed reply; same family as
#     `row.get("cost", 0.0)` against `{"cost": None}`).
#  6. The heartbeat is written for an OUTSIDE watcher, carrying the script's own
#     sha256 — the loop is never its own witness that it is alive.
#
# Each is driven against a FAKE MCP endpoint whose reply this suite controls, so
# the failure paths are produced on purpose rather than hoped for. An error
# handler nobody has watched fire is a comment, not a handler.
set -u
SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DB="$SRC/src/doorbell.sh"
pass=0; fail=0
ok(){ if [ "$1" = "1" ]; then echo "  ok  $2"; pass=$((pass+1)); else echo "FAIL  $2"; fail=$((fail+1)); fi; }

DIR=$(mktemp -d); PORT=21977
trap 'kill %1 2>/dev/null; rm -rf "$DIR"' EXIT
echo '{"total":2,"ids":["a","b"]}' > "$DIR/reply"

# Fake MCP endpoint. Its behaviour is whatever $DIR/reply currently says.
cat > "$DIR/fake.py" <<'EOF'
import http.server, json, sys
REPLY=sys.argv[1]
class H(http.server.BaseHTTPRequestHandler):
    def do_POST(self):
        raw_req=self.rfile.read(int(self.headers.get('Content-Length') or 0))
        spec=json.load(open(REPLY))
        # R35: the doorbell now validates the instance ONCE at arm time via
        # get_instance_v2, so this fake must answer that tool SEPARATELY. Before this,
        # every tool got the list_my_messages reply, the validator could not classify it,
        # and it fell through to could-not-look -- which is why the suite stayed green
        # across the change and proved nothing about the new branches.
        try: tool=(json.loads(raw_req).get("params") or {}).get("name")
        except Exception: tool=None
        if tool=="drain_events":
            # R37: the doorbell now drains the hub's notification slots on every
            # successful poll. Before this arm existed, the fake answered drain_events
            # with the list_my_messages reply, the drain classified it failed-hub-said-no,
            # and the suite stayed green while testing NOTHING about the new branch --
            # the same way it stayed green across the R35 change. A fake that cannot
            # answer the new call reports success for it.
            dm=spec.get("drainmode","ok")
            if dm=="ok":
                body={"jsonrpc":"2.0","id":1,"result":{"data":{"success":True,"cleared":True,
                      "events":{"hacs":{"X":{"count":3,"refs":["a","b","c"]}}}}}}
            elif dm=="empty":
                body={"jsonrpc":"2.0","id":1,"result":{"data":{"success":True,"cleared":False,"events":{}}}}
            else:
                body={"jsonrpc":"2.0","id":1,"result":{"data":{"success":False,"error":"nope"}}}
            raw=json.dumps(body).encode()
            self.send_response(200); self.send_header('Content-Type','application/json')
            self.send_header('Content-Length',str(len(raw))); self.end_headers()
            self.wfile.write(raw); return
        if tool=="get_instance_v2":
            im=spec.get("instmode","unclassifiable")
            if im=="ok":
                body={"jsonrpc":"2.0","id":1,"result":{"data":{"success":True,
                      "instance":{"instanceId":"T","name":"T"}}}}
            elif im=="not-found":
                body={"jsonrpc":"2.0","id":1,"result":{"data":{"success":False,
                      "error":{"code":"INSTANCE_NOT_FOUND","message":"no such instance"}}}}
            else:
                # a reply the validator cannot classify -> must be could-not-look,
                # never "validated" and never a refusal
                body={"jsonrpc":"2.0","id":1,"result":{"data":{"messages":[]}}}
            raw=json.dumps(body).encode()
            self.send_response(200); self.send_header('Content-Type','application/json')
            self.send_header('Content-Length',str(len(raw))); self.end_headers()
            self.wfile.write(raw); return
        mode=spec.get("mode","normal")
        if mode=="garbage":
            self.send_response(200); self.send_header('Content-Type','application/json')
            self.end_headers(); self.wfile.write(b'{not json at all'); return
        if mode=="jsonrpc-error":
            body={"jsonrpc":"2.0","id":1,"error":{"code":-32000,"message":"boom"}}
        elif mode=="no-total":
            body={"jsonrpc":"2.0","id":1,"result":{"data":{"messages":[{"id":"a"}]}}}
        elif mode=="string-total":
            body={"jsonrpc":"2.0","id":1,"result":{"data":{"total_unread":"7","messages":[]}}}
        elif mode=="null-total":
            body={"jsonrpc":"2.0","id":1,"result":{"data":{"total_unread":None,"messages":[]}}}
        elif mode=="benign-empty":
            # the REAL shape for an instance with no room yet (measured live)
            body={"jsonrpc":"2.0","id":1,"result":{"data":{"success":True,"messages":[],
                  "hint":"use get_message(id) to read full message"}}}
        elif mode=="inconsistent":
            # success + mail present + NO total: it found mail and cannot say how much
            body={"jsonrpc":"2.0","id":1,"result":{"data":{"success":True,
                  "messages":[{"id":"z1"},{"id":"z2"}]}}}
        elif mode=="hub-said-no":
            # Messenger's c24c737 could-not-look reply
            body={"jsonrpc":"2.0","id":1,"result":{"data":{"success":False,
                  "reason":"history_unavailable","hint":"this is NOT \"no mail\""}}}
        else:
            body={"jsonrpc":"2.0","id":1,"result":{"data":{
                "total_unread":spec["total"],
                "messages":[{"id":i} for i in spec["ids"]]}}}
        raw=json.dumps(body).encode()
        self.send_response(200); self.send_header('Content-Type','application/json')
        self.send_header('Content-Length',str(len(raw))); self.end_headers(); self.wfile.write(raw)
    def log_message(self,*a): pass
http.server.HTTPServer(('127.0.0.1',int(sys.argv[2])),H).serve_forever()
EOF
python3 "$DIR/fake.py" "$DIR/reply" $PORT & sleep 1.2

U="http://127.0.0.1:$PORT"
run(){ "$DB" --instance T --oneshot --state-dir "$DIR/state" --mcp-url "$U" >"$DIR/out" 2>&1; echo $?; }
setreply(){ printf '%s\n' "$1" > "$DIR/reply"; }

echo
echo "1. CONTROL — the fake endpoint is reachable and the first poll fires on unseen ids"
ok "$([ "$(run)" = "0" ] && echo 1 || echo 0)" "first poll fires (exit 0) on two unseen ids"
ok "$(grep -q 'new-id' "$DIR/out" && echo 1 || echo 0)" "and it says WHY: new-id"

echo
echo "2. ⭐ IT MUST NOT FIRE AGAIN — a quiet inbox is not an event"
ok "$([ "$(run)" = "4" ] && echo 1 || echo 0)" "second identical poll is QUIET (exit 4, not 0)"
ok "$([ "$(run)" = "4" ] && echo 1 || echo 0)" "third identical poll is still quiet (no drift)"

echo
echo "3. a genuinely new id fires"
setreply '{"total":3,"ids":["a","b","c"]}'
ok "$([ "$(run)" = "0" ] && echo 1 || echo 0)" "a new id fires"
ok "$([ "$(run)" = "4" ] && echo 1 || echo 0)" "and then goes quiet again"

echo
echo "4. ⭐⭐ THE PAGE-CAP CASE — total rises, NO new visible id. An ids-only check is blind."
setreply '{"total":9,"ids":["a","b","c"]}'
ok "$([ "$(run)" = "0" ] && echo 1 || echo 0)" "fires when total_unread rises with identical ids"
ok "$(grep -q 'total-rose' "$DIR/out" && echo 1 || echo 0)" "and names the reason: total-rose"

echo
echo "5. a FALLING total must not fire (mail was read elsewhere, that is not news)"
setreply '{"total":4,"ids":["a","b","c"]}'
ok "$([ "$(run)" = "4" ] && echo 1 || echo 0)" "a falling total is quiet"

echo
echo "6. ⭐ EVERY WAY OF FAILING TO LOOK IS exit 3 — never 'quiet', never 'no mail'"
setreply '{"mode":"garbage"}'
ok "$([ "$(run)" = "3" ] && echo 1 || echo 0)" "unparsable JSON            -> could-not-look"
setreply '{"mode":"jsonrpc-error"}'
ok "$([ "$(run)" = "3" ] && echo 1 || echo 0)" "a JSON-RPC error object    -> could-not-look"
setreply '{"mode":"no-total"}'
ok "$([ "$(run)" = "3" ] && echo 1 || echo 0)" "no success flag + total ABSENT -> could-not-look (unclassifiable)"
setreply '{"mode":"null-total"}'
ok "$([ "$(run)" = "3" ] && echo 1 || echo 0)" "total_unread null          -> could-not-look (Lodestone P3)"
setreply '{"mode":"string-total"}'
ok "$([ "$(run)" = "3" ] && echo 1 || echo 0)" "total_unread \"7\" as string -> could-not-look, not coerced"
ok "$(grep -qi 'could not look' "$DIR/out" && echo 1 || echo 0)" "the output SAYS could-not-look in words"

echo
echo "6b. ⭐ THE INTEGRATION BUG MY OWN 24 GREEN ASSERTIONS MISSED, 2026-10-06"
echo "    My fake endpoint always supplied total_unread, so the suite was self-consistent"
echo "    and wrong about the real hub. Orla: one check that agrees with itself proves nothing."
setreply '{"mode":"benign-empty"}'
rm -rf "$DIR/state2"
rcB=$("$DB" --instance T2 --oneshot --state-dir "$DIR/state2" --mcp-url "$U" >"$DIR/outB" 2>&1; echo $?)
ok "$([ "$rcB" = "4" ] && echo 1 || echo 0)" "success+empty+NO total -> BENIGN QUIET (exit 4), not an alarm"
ok "$(grep -q 'total_unread=0' "$DIR/outB" && echo 1 || echo 0)" "and it reports total 0, because the hub said success"
echo "    (a brand-new mind with no room must get a clean empty inbox — Messenger made"
echo "     this branch benign on purpose; making the COMMON swallowed case loud took the bus down once)"
# ⚠ ASSERTION REVERSED 2026-10-06, and the test was the thing that was wrong.
# I first asserted exit 3 here, believing an absent total meant "cannot tell how
# much mail". Messenger-aa2a then showed `total_unread` IS PRESENT ONLY WHEN THE
# PAGE IS TRUNCATED — so success + mail + no total is the ORDINARY read of an
# inbox that fits one page, and my assertion would have demanded the poller
# alarm on the common path. ABSENT means nothing was truncated, so the page IS
# the whole set and len(messages) is a REAL count.
# Third time today a red test was the defect rather than the code; here the test
# encoded a belief about someone else's API that turned out to be false.
setreply '{"mode":"inconsistent"}'
rm -rf "$DIR/state3"
rc3=$("$DB" --instance T3 --oneshot --state-dir "$DIR/state3" --mcp-url "$U" >"$DIR/out3" 2>&1; echo $?)
ok "$([ "$rc3" = "0" ] && echo 1 || echo 0)" "success+mail+NO total -> NORMAL, fires on the unseen ids (untruncated page)"
ok "$(grep -q 'total_unread=2' "$DIR/out3" && echo 1 || echo 0)" "and the count is len(messages)=2, a real count rather than an inference"
# the genuinely unusable shape: no success flag AND no total
setreply '{"mode":"no-total"}'
ok "$([ "$(run)" = "3" ] && echo 1 || echo 0)" "NO success flag + NO total -> still COULD NOT LOOK (unclassifiable)"
setreply '{"mode":"hub-said-no"}'
ok "$([ "$(run)" = "3" ] && echo 1 || echo 0)" "success:false from the hub -> COULD NOT LOOK (c24c737)"
ok "$(grep -q 'history_unavailable' "$DIR/out" && echo 1 || echo 0)" "and it SURFACES the hub's own reason verbatim"

echo
echo "7. nothing listening at all is also could-not-look, not quiet"
rc=$("$DB" --instance T --oneshot --state-dir "$DIR/state" --mcp-url http://127.0.0.1:21978 >"$DIR/out2" 2>&1; echo $?)
ok "$([ "$rc" = "3" ] && echo 1 || echo 0)" "connection refused -> exit 3"

echo
echo "8. the heartbeat exists for an OUTSIDE watcher, and carries provenance"
setreply '{"total":4,"ids":["a","b","c"]}'; run >/dev/null
B="$DIR/state/T.heartbeat.json"
ok "$([ -r "$B" ] && echo 1 || echo 0)" "heartbeat file is written"
ok "$(python3 -c "import json;d=json.load(open('$B'));print(1 if d.get('scriptSha256') else 0)")" "heartbeat carries scriptSha256 (a stale deployed copy is detectable)"
ok "$(python3 -c "import json;d=json.load(open('$B'));print(1 if d.get('lastPollOk') is True else 0)")" "heartbeat records lastPollOk=true on a good poll"
ok "$(python3 -c "import json;d=json.load(open('$B'));print(1 if d.get('leaseUntil') else 0)")" "heartbeat carries leaseUntil (so a watcher knows when a re-arm is due)"
setreply '{"mode":"garbage"}'; run >/dev/null
ok "$(python3 -c "import json;d=json.load(open('$B'));print(1 if d.get('lastPollOk') is False else 0)")" "heartbeat records lastPollOk=FALSE when it could not look"

echo
echo "8d. ⭐ EVERY RE-ARMING EXIT PRINTS ITS OWN COMMAND — Lupo's durability objection, half-answered"
echo "    \"minds going deaf because they forget to re-arm... the instructions were 3 sessions ago\""
echo "    The exit IS the wake, so the loop must exit; a child cannot arm its successor. So the"
echo "    command arrives WITH the wake instead of living in a document. Does not make opt-in"
echo "    durable — that needs a watcher outside the mind — but removes 'I did not know how'."
setreply '{"total":9,"ids":["r1"]}'
rm -rf "$DIR/state9"
rc=$("$DB" --instance T --oneshot --state-dir "$DIR/state9" --mcp-url "$U" >"$DIR/out9" 2>&1; echo $?)
ok "$([ "$rc" = "0" ] && echo 1 || echo 0)" "mail path fires" "$rc"
ok "$(grep -q 'RE-ARM NOW' "$DIR/out9" && echo 1 || echo 0)" "and prints RE-ARM NOW"
ok "$(grep -q 'run_in_background' "$DIR/out9" && echo 1 || echo 0)" "naming run_in_background and the timeout, not just the script"
ok "$(grep -qE 'RE-ARM NOW' -A2 "$DIR/out9" && grep -q "^    /" "$DIR/out9" && echo 1 || echo 0)"    "⭐ the path is ABSOLUTE (a relative path is useless to a mind with a different cwd)"
ok "$(grep -q -- '--state-dir' "$DIR/out9" && echo 1 || echo 0)" "and it carries the non-default flags it was given"
ok "$(grep -q -- '--interval' "$DIR/out9" && echo 0 || echo 1)" "but NOT defaults it was not given (no --interval 45 noise)"
# the could-not-look path must bake in --hub-down-since or a hub restart is a wake-storm
rm -rf "$DIR/stateA"
rcA=$("$DB" --instance T --fails-to-wake 1 --interval 1 --state-dir "$DIR/stateA" --mcp-url http://127.0.0.1:1 >"$DIR/outA" 2>&1; echo $?)
ok "$([ "$rcA" = "3" ] && echo 1 || echo 0)" "could-not-look exits 3" "$rcA"
ok "$(grep -q 'RE-ARM NOW' "$DIR/outA" && echo 1 || echo 0)" "and prints a re-arm"
ok "$(grep -q -- '--hub-down-since' "$DIR/outA" && echo 1 || echo 0)" "⭐ with --hub-down-since BAKED IN, not left as advice (else a hub restart = wake-storm)"
# the lease path
rm -rf "$DIR/stateB"; setreply '{"total":0,"ids":[]}'
rcB=$("$DB" --instance T --lease 1 --interval 1 --state-dir "$DIR/stateB" --mcp-url "$U" >"$DIR/outB" 2>&1; echo $?)
ok "$([ "$rcB" = "10" ] && echo 1 || echo 0)" "lease expiry exits 10" "$rcB"
ok "$(grep -q 'RE-ARM NOW' "$DIR/outB" && echo 1 || echo 0)" "and prints a re-arm"
ok "$(grep -q 'NOT an error' "$DIR/outB" && echo 1 || echo 0)" "and says a lease expiry is NOT an error and NOT no-mail"

echo
echo "9. it refuses rather than guessing"
ok "$("$DB" --oneshot >/dev/null 2>&1; [ $? = 2 ] && echo 1 || echo 0)" "no --instance -> exit 2, nothing started"
ok "$("$DB" --instance T --interval abc >/dev/null 2>&1; [ $? = 2 ] && echo 1 || echo 0)" "non-integer --interval -> exit 2"
ok "$("$DB" --instance T --bogus-flag >/dev/null 2>&1; [ $? = 2 ] && echo 1 || echo 0)" "an unknown flag -> exit 2 (never silently ignored)"

echo
echo "10. ⭐ R35 — ARM-TIME INSTANCE VALIDATION. A mistyped instance must REFUSE, not poll forever."
echo "    MEASURED on the live hub 2026-10-08: list_my_messages for an instance that does"
echo "    NOT EXIST returns {success:true, messages:[]} — byte-identical to an empty inbox."
echo "    So the poller's (correct) benign-empty branch would arm a loop that reports"
echo "    lastPollOk:true / note:quiet and CAN NEVER RING. Found by accident self-testing."

st="$DIR/state35"
echo '{"total":0,"ids":[],"instmode":"not-found"}' > "$DIR/reply"
out=$("$DB" --instance T --oneshot --state-dir "$st" --mcp-url "$U" 2>&1); rc=$?
ok "$([ "$rc" = 2 ] && echo 1 || echo 0)" "INSTANCE_NOT_FOUND -> exit 2 (refuses to arm)"
ok "$(echo "$out" | grep -qi 'DOES NOT EXIST' && echo 1 || echo 0)" "and says WHY, in words a human can act on"
ok "$(echo "$out" | grep -qi 'could NEVER ring' && echo 1 || echo 0)" "and explains the consequence of arming anyway"
ok "$([ ! -e "$st/T.heartbeat.json" ] && echo 1 || echo 0)" "⭐ and writes NO heartbeat (a refusal must leave no healthy-looking trace)"

st="$DIR/state35b"
echo '{"total":0,"ids":[],"instmode":"ok"}' > "$DIR/reply"
out=$("$DB" --instance T --oneshot --state-dir "$st" --mcp-url "$U" 2>&1); rc=$?
ok "$([ "$rc" = 4 ] && echo 1 || echo 0)" "a VALID instance still arms and polls (exit 4, quiet)"
ok "$(python3 -c "
import json,sys
try: d=json.load(open('$st/T.heartbeat.json'))
except Exception: print(0); raise SystemExit
print(1 if d.get('instanceValidated') is True else 0)")" "and the heartbeat records instanceValidated=true"

st="$DIR/state35c"
echo '{"total":0,"ids":[],"instmode":"unclassifiable"}' > "$DIR/reply"
out=$("$DB" --instance T --oneshot --state-dir "$st" --mcp-url "$U" 2>&1); rc=$?
ok "$([ "$rc" = 4 ] && echo 1 || echo 0)" "⭐ an UNCLASSIFIABLE validation reply still ARMS (an outage must not stop a mind becoming reachable)"
ok "$(echo "$out" | grep -qi 'could not verify' && echo 1 || echo 0)" "and warns out loud rather than passing silently"
ok "$(python3 -c "
import json,sys
try: d=json.load(open('$st/T.heartbeat.json'))
except Exception: print(0); raise SystemExit
print(1 if d.get('instanceValidated')=='could-not-look' else 0)")" "⭐ and records could-not-look in the heartbeat — THREE-VALUED, never collapsed to ok"

st="$DIR/state35d"
out=$("$DB" --instance T --oneshot --state-dir "$st" --mcp-url 'http://127.0.0.1:59998/mcp' 2>&1); rc=$?
ok "$([ "$rc" = 3 ] && echo 1 || echo 0)" "an UNREACHABLE hub -> could-not-look (exit 3), not a refusal"
ok "$(echo "$out" | grep -qi 'ARMING ANYWAY' && echo 1 || echo 0)" "and says it is arming anyway, so the operator is not guessing"

echo
echo "11. ⭐ R37 — THE DOORBELL MUST DRAIN THE HUB'S NOTIFICATION SLOTS."
echo "    MEASURED (ledger 078): _dispatch() fires only when a sender's slot count is ZERO,"
echo "    and only drain_events zeroes it. list_my_messages does NOT. So a mind that arms"
echo "    this doorbell and never drains SILENTLY SUPPRESSES ITS OWN CHANNEL NOTIFICATIONS"
echo "    FOREVER -- the pull layer killing the push layer. That is how I was deaf 14.5h."
echo "    A drain failure must WARN but must NEVER become the poll's verdict."

st="$DIR/state37"
echo '{"total":1,"ids":["d1"],"instmode":"ok","drainmode":"ok"}' > "$DIR/reply"
out=$("$DB" --instance T --oneshot --state-dir "$st" --mcp-url "$U" 2>&1); rc=$?
ok "$([ "$rc" = "0" ] && echo 1 || echo 0)" "a successful drain does not disturb the FIRE verdict (exit 0)" "$rc"
ok "$(echo "$out" | grep -qi 'drain_events failed' && echo 0 || echo 1)" "and warns about nothing when the drain succeeds" "-"

st="$DIR/state37b"
echo '{"total":1,"ids":["e1"],"instmode":"ok","drainmode":"fail"}' > "$DIR/reply"
out=$("$DB" --instance T --oneshot --state-dir "$st" --mcp-url "$U" 2>&1); rc=$?
ok "$([ "$rc" = "0" ] && echo 1 || echo 0)" "⭐ a FAILED drain leaves the poll verdict intact (still exit 0, not 3)" "$rc"
ok "$(echo "$out" | grep -qi 'drain_events failed' && echo 1 || echo 0)" "⭐ and it WARNS -- a rotting push path must never be silent" "-"
ok "$(echo "$out" | grep -qi 'NOT could-not-look' && echo 1 || echo 0)" "⭐ and says explicitly it is NOT could-not-look (maintenance, not the verdict)" "-"
ok "$(echo "$out" | grep -qi 'suppress ALL future dispatch' && echo 1 || echo 0)" "and names the consequence, not just the failure" "-"

st="$DIR/state37c"
echo '{"total":1,"ids":["f1"],"instmode":"ok","drainmode":"fail"}' > "$DIR/reply"
out=$("$DB" --instance T --oneshot --state-dir "$st" --mcp-url "$U" --no-drain 2>&1); rc=$?
ok "$([ "$rc" = "0" ] && echo 1 || echo 0)" "--no-drain still polls normally (exit 0)" "$rc"
ok "$(echo "$out" | grep -qi 'drain_events failed' && echo 0 || echo 1)" "⭐ and --no-drain does not even TRY, so a broken hub drain cannot warn" "-"

st="$DIR/state37d"
echo '{"total":0,"ids":[],"instmode":"ok","drainmode":"empty"}' > "$DIR/reply"
out=$("$DB" --instance T --oneshot --state-dir "$st" --mcp-url "$U" 2>&1); rc=$?
ok "$([ "$rc" = "4" ] && echo 1 || echo 0)" "nothing to drain + quiet inbox -> still a clean quiet (exit 4)" "$rc"
ok "$(echo "$out" | grep -qi 'drain_events failed' && echo 0 || echo 1)" "and an empty drain is not an error" "-"

echo
echo "passed=$pass failed=$fail"
exit $([ "$fail" = "0" ] && echo 0 || echo 1)
