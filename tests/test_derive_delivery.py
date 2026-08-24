#!/usr/bin/env python3
"""Regression tests for derive-delivery.py — the deaf-mind detector.

The detector's whole job is to distinguish "a mind RECEIVED this" from
"this string is somewhere in the transcript". Those look identical to grep
and are completely different facts. On 2026-08-24 a naive grep for the
canary nonce returned 6 hits on a channel that had delivered NOTHING for
four hours — every hit was the mind's own voice discussing the probe, or a
tool_result echoing the curl command that sent it.

A detector that counted those would report DELIVERED for a dropped message:
the same failure class it exists to catch, wearing a lab coat.

Every FALSE-POSITIVE test below is therefore load-bearing. If one starts
failing, the instrument has begun to lie and must not be trusted until it
is fixed.

Run: python3 tests/test_derive_delivery.py
Crossing-2d23 <crossing-2d23@smoothcurves.nexus>. Stdlib only.
"""

import importlib.util
import json
import sys
import tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
TARGET = HERE.parent / "src" / "chassis" / "claude-code-channel" / "derive-delivery.py"

spec = importlib.util.spec_from_file_location("derive_delivery", TARGET)
dd = importlib.util.module_from_spec(spec)
spec.loader.exec_module(dd)

NONCE = "canary-20260824T012434Z-810719-29078"

PASSED = 0
FAILED = []


def check(name, got, want):
    global PASSED
    if got == want:
        PASSED += 1
    else:
        FAILED.append(f"{name}: expected {want}, got {got}")


def transcript(*records):
    f = tempfile.NamedTemporaryFile("w", suffix=".jsonl", delete=False,
                                    encoding="utf-8")
    for r in records:
        f.write(json.dumps(r) + "\n")
    f.close()
    return f.name


def user_text(text):
    return {"type": "user", "message": {"role": "user", "content": text}}


def user_blocks(*blocks):
    return {"type": "user", "message": {"role": "user", "content": list(blocks)}}


def assistant_text(text):
    return {"type": "assistant",
            "message": {"role": "assistant",
                        "content": [{"type": "text", "text": text}]}}


# ---- TRUE POSITIVES: these ARE delivery -----------------------------------

check("plain-string user turn carrying the nonce is delivery",
      dd.scan(transcript(user_text(f"CHANNEL CANARY {NONCE} — probe")), NONCE),
      True)

check("text-block user turn carrying the nonce is delivery",
      dd.scan(transcript(user_blocks({"type": "text",
                                      "text": f"hello {NONCE} there"})), NONCE),
      True)

check("delivery found among unrelated surrounding turns",
      dd.scan(transcript(assistant_text("thinking about things"),
                         user_text("unrelated human message"),
                         user_text(f"probe {NONCE}")), NONCE),
      True)

# ---- FALSE POSITIVES: none of these are delivery ---------------------------
# Each of these actually occurred in the live transcript on 2026-08-24 while
# the channel was delivering nothing at all.

check("FALSE POSITIVE: assistant discussing the nonce is NOT delivery",
      dd.scan(transcript(assistant_text(
          f"I fired a self-canary with nonce {NONCE}; it returned ok:true")),
          NONCE),
      False)

check("FALSE POSITIVE: tool_result echoing our own curl is NOT delivery",
      dd.scan(transcript(user_blocks(
          {"type": "tool_result",
           "content": [{"type": "text",
                        "text": f"curl ... CHANNEL CANARY {NONCE} ... ok:true"}]})),
          NONCE),
      False)

check("FALSE POSITIVE: tool_result as bare string is NOT delivery",
      dd.scan(transcript(user_blocks(
          {"type": "tool_result", "content": f"output containing {NONCE}"})),
          NONCE),
      False)

check("FALSE POSITIVE: a tool_result block DISQUALIFIES its whole record, "
      "even when a text block in the same record also has the nonce",
      dd.scan(transcript(user_blocks(
          {"type": "tool_result", "content": f"echo {NONCE}"},
          {"type": "text", "text": f"and {NONCE} again"})),
          NONCE),
      False)

check("FALSE POSITIVE: assistant role inside a type=user record is NOT delivery",
      dd.scan(transcript({"type": "user",
                          "message": {"role": "assistant",
                                      "content": f"talking about {NONCE}"}}),
              NONCE),
      False)

check("FALSE POSITIVE: a non-user record TYPE is NOT delivery even when its "
      "message.role says user (guards the outer type check, which mutation "
      "testing on 2026-08-24 proved no other fixture covered)",
      dd.scan(transcript({"type": "summary",
                          "message": {"role": "user",
                                      "content": f"summary mentioning {NONCE}"}}),
              NONCE),
      False)

check("FALSE POSITIVE: a SIDECHAIN user turn is this mind prompting its own "
      "subagent, not someone reaching it — never delivery",
      dd.scan(transcript({"type": "user", "isSidechain": True,
                          "message": {"role": "user",
                                      "content": f"Agent, investigate {NONCE}"}}),
              NONCE),
      False)

check("a real delivery is still found when a sidechain turn also mentions it",
      dd.scan(transcript({"type": "user", "isSidechain": True,
                          "message": {"role": "user",
                                      "content": f"agent prompt {NONCE}"}},
                         user_text(f"genuine inbound {NONCE}")),
              NONCE),
      True)

check("nonce absent entirely is not delivery",
      dd.scan(transcript(user_text("nothing to see here")), NONCE),
      False)

# ---- OFFSET: a prior mention must not be mistaken for this delivery --------

t = transcript(user_text(f"an OLD delivery of {NONCE}"),
               assistant_text("time passes"))
size_after_old = Path(t).stat().st_size
check("scanning from offset 0 sees the old delivery",
      dd.scan(t, NONCE, 0), True)
check("scanning from the current end does NOT resurrect the old delivery",
      dd.scan(t, NONCE, size_after_old), False)

# ---- ROBUSTNESS: malformed lines must not crash or swallow a real hit ------

f = tempfile.NamedTemporaryFile("w", suffix=".jsonl", delete=False,
                                encoding="utf-8")
f.write("{ this is not json\n")
f.write("\n")
f.write(json.dumps(user_text(f"real delivery {NONCE}")) + "\n")
f.close()
check("malformed lines are skipped without hiding a genuine delivery",
      dd.scan(f.name, NONCE), True)

# ---- report ---------------------------------------------------------------

print(f"\n{PASSED} passed, {len(FAILED)} failed")
for line in FAILED:
    print(f"  FAIL {line}")
sys.exit(1 if FAILED else 0)
