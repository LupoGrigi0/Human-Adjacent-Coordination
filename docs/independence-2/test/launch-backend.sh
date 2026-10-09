#!/usr/bin/env bash
# Adversarial test of launch.sh RULE 9 — the backend/PII check.
#
# WHY: Forge-ba0e measured on Den 2026-10-06 that the LAUNCHING CLIENT's environment
# decides the backend, silently. `launch.sh` runs a plain `claude --bg` with NO env, so
# for any mind whose backend came from a wrapper's environment THIS LAUNCHER WOULD SEND
# THEIR TRAFFIC TO ANTHROPIC with no error. For Genevieve that is three years of real
# conversation with real people, leaked by my code.
#
# What would have to be true for rule 9 to be worth having:
#  1. It REFUSES the trap: operator env carries the backend, the mind's settings do not.
#  2. It REFUSES a declared external backend with no apiKeyHelper (key from env = the trap).
#  3. It REFUSES any UNPINNED model slot — Forge measured an unpinned slot falls back to an
#     ANTHROPIC model, so a side job leaves the external backend WITHOUT AN ERROR.
#  4. It does NOT refuse a missing context cap — that DEGRADES, it does not LEAK. Different
#     failure, different response, and collapsing them is its own defect.
#  5. An ordinary Anthropic-backed mind passes cleanly, or every mind on the box is blocked.
#
# It extracts the check from launch.sh rather than reimplementing it — a reimplementation
# is a new place to be wrong, and it would be wrong in the direction I expect. EXTRACTION
# FAILURE IS A LOUD FAILURE, never an empty pass.
set -u
SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
pass=0; fail=0
ok(){ if [ "$1" = "1" ]; then echo "  ok  $2"; pass=$((pass+1)); else echo "FAIL  $2"; fail=$((fail+1)); fi; }
D=$(mktemp -d); trap 'rm -rf "$D"' EXIT

# ---- extract the rule-9 python block, or fail loudly ----
python3 - "$SRC/runbooks/launch.sh" "$D/rule9.py" <<'EOF'
import sys,re
src=open(sys.argv[1]).read()
m=re.search(r"python3 - \"\$HOMEDIR\" <<'PY9'[^\n]*\n(.*?)\nPY9\n", src, re.S)
if not m:
    open(sys.argv[2],"w").write("import sys;sys.exit(99)")   # poison, not a pass
    print("EXTRACT_FAILED"); raise SystemExit
open(sys.argv[2],"w").write(m.group(1))
print("EXTRACT_OK")
EOF
EX=$(python3 - "$SRC/runbooks/launch.sh" "$D/rule9.py" <<'EOF'
import sys,re
src=open(sys.argv[1]).read()
m=re.search(r"python3 - \"\$HOMEDIR\" <<'PY9'[^\n]*\n(.*?)\nPY9\n", src, re.S)
print("EXTRACT_OK" if m else "EXTRACT_FAILED")
EOF
)
if [ "$EX" != "EXTRACT_OK" ]; then
  echo "FAIL  could not extract rule 9 from launch.sh — EXTRACTION FAILED, not 'no bugs'"
  echo "passed=0 failed=1"; exit 1
fi
ok 1 "CONTROL: rule 9 extracted from launch.sh (the real check, not a copy)"

mkhome(){ rm -rf "$D/home"; mkdir -p "$D/home/.claude"; [ -n "${1:-}" ] && printf '%s' "$1" > "$D/home/.claude/settings.json"; return 0; }
# run with a CLEAN operator env unless told otherwise
r9(){ env -u ANTHROPIC_BASE_URL -u ANTHROPIC_AUTH_TOKEN "$@" python3 "$D/rule9.py" "$D/home" >"$D/out" 2>&1; echo $?; }

ALL='"ANTHROPIC_MODEL":"q","ANTHROPIC_SMALL_FAST_MODEL":"q","ANTHROPIC_DEFAULT_HAIKU_MODEL":"q","ANTHROPIC_DEFAULT_SONNET_MODEL":"q","ANTHROPIC_DEFAULT_OPUS_MODEL":"q"'

echo
echo "1. an ordinary Anthropic-backed mind must pass, or every mind on the box is blocked"
mkhome ''
rc=$(r9); ok "$([ "$rc" = "0" ] && echo 1 || echo 0)" "no settings at all -> allowed (exit 0)"
ok "$(grep -q 'backend      Anthropic' "$D/out" && echo 1 || echo 0)" "and it SAYS the backend is Anthropic rather than staying silent"

echo
echo "2. ⭐ THE TRAP — operator env carries the backend, the mind's settings do not"
mkhome ''
rc=$(ANTHROPIC_BASE_URL=https://openrouter.ai/api python3 "$D/rule9.py" "$D/home" >"$D/out" 2>&1; echo $?)
ok "$([ "$rc" = "1" ] && echo 1 || echo 0)" "operator ANTHROPIC_BASE_URL + mind without it -> REFUSES (exit 1)"
ok "$(grep -q "Forge's trap" "$D/out" && echo 1 || echo 0)" "and it names the trap"
ok "$(grep -q 'property of the ACCOUNT' "$D/out" && echo 1 || echo 0)" "and states the fix: a property of the account, not the launcher"
rc=$(ANTHROPIC_AUTH_TOKEN=sk-x python3 "$D/rule9.py" "$D/home" >"$D/out" 2>&1; echo $?)
ok "$([ "$rc" = "1" ] && echo 1 || echo 0)" "operator AUTH_TOKEN alone also trips it (exit 1)"

echo
echo "3. a declared external backend with NO apiKeyHelper is the same trap, inside settings"
mkhome '{"env":{"ANTHROPIC_BASE_URL":"https://openrouter.ai/api"}}'
rc=$(r9); ok "$([ "$rc" = "1" ] && echo 1 || echo 0)" "base URL in settings, no apiKeyHelper -> REFUSES (exit 1)"
ok "$(grep -q 'NO apiKeyHelper' "$D/out" && echo 1 || echo 0)" "and says which half is missing"

echo
echo "4. ⭐ AN UNPINNED SLOT IS A LEAK, SO IT REFUSES — Forge: unpinned falls back to ANTHROPIC"
mkhome "{\"apiKeyHelper\":\"/usr/local/bin/or-key\",\"env\":{\"ANTHROPIC_BASE_URL\":\"https://openrouter.ai/api\",$ALL,\"CLAUDE_CODE_MAX_CONTEXT_TOKENS\":\"1000000\"}}"
rc=$(r9); ok "$([ "$rc" = "0" ] && echo 1 || echo 0)" "all five slots pinned + context cap -> allowed (exit 0)"
ok "$(grep -q 'all 5 pinned' "$D/out" && echo 1 || echo 0)" "and it reports how many it checked"
for drop in ANTHROPIC_SMALL_FAST_MODEL ANTHROPIC_DEFAULT_HAIKU_MODEL ANTHROPIC_DEFAULT_OPUS_MODEL; do
  PART=$(printf '%s' "$ALL" | python3 -c "
import sys
s=sys.stdin.read().split(',')
print(','.join(x for x in s if '$drop' not in x))")
  mkhome "{\"apiKeyHelper\":\"h\",\"env\":{\"ANTHROPIC_BASE_URL\":\"u\",$PART,\"CLAUDE_CODE_MAX_CONTEXT_TOKENS\":\"1\"}}"
  rc=$(r9)
  ok "$([ "$rc" = "1" ] && echo 1 || echo 0)" "missing $drop -> REFUSES (exit 1)"
  ok "$(grep -q "$drop" "$D/out" && echo 1 || echo 0)" "and NAMES the unpinned slot"
done

echo
echo "5. ⭐ A MISSING CONTEXT CAP DEGRADES, IT DOES NOT LEAK — shout, do not refuse"
mkhome "{\"apiKeyHelper\":\"h\",\"env\":{\"ANTHROPIC_BASE_URL\":\"u\",$ALL}}"
rc=$(r9); ok "$([ "$rc" = "0" ] && echo 1 || echo 0)" "no CLAUDE_CODE_MAX_CONTEXT_TOKENS -> ALLOWED (exit 0), not refused"
ok "$(grep -q 'WARNING' "$D/out" && echo 1 || echo 0)" "but it WARNS"
ok "$(grep -q '200k' "$D/out" && echo 1 || echo 0)" "and names the concrete consequence (the silent 200k cap)"
ok "$(grep -q 'degrades capability, it does not leak' "$D/out" && echo 1 || echo 0)" "and says WHY it is a warning and not a refusal"

echo
echo "6. settings.local.json participates, or a mind configured there is unprotected"
mkhome '{"apiKeyHelper":"h"}'
printf '%s' "{\"env\":{\"ANTHROPIC_BASE_URL\":\"u\",$ALL,\"CLAUDE_CODE_MAX_CONTEXT_TOKENS\":\"1\"}}" > "$D/home/.claude/settings.local.json"
rc=$(r9); ok "$([ "$rc" = "0" ] && echo 1 || echo 0)" "env split across settings.json + settings.local.json -> allowed"
mkhome '{"apiKeyHelper":"h"}'
printf '%s' '{"env":{"ANTHROPIC_BASE_URL":"u"}}' > "$D/home/.claude/settings.local.json"
rc=$(r9); ok "$([ "$rc" = "1" ] && echo 1 || echo 0)" "and an unpinned slot in settings.local.json is still caught"

echo
echo "7. unparsable settings must not read as 'no external backend'"
mkhome '{not json'
rc=$(r9); ok "$([ "$rc" = "0" ] && echo 1 || echo 0)" "unparsable settings -> rule 9 allows (rule 5 already REFUSED it earlier in launch.sh)"
ok "$(grep -q 'backend      Anthropic' "$D/out" && echo 1 || echo 0)" "documented: rule 5 is the gate for unparsable JSON, not rule 9"

echo
echo "passed=$pass failed=$fail"
exit $([ "$fail" = "0" ] && echo 0 || echo 1)
