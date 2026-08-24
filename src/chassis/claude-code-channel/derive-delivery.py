#!/usr/bin/env python3
"""Derive whether a message actually reached a mind — do not ask, look.

A channel POST returning 200 proves bytes were written to a pipe. It does
NOT prove a mind received them: on 2026-08-23 Crossing-2d23's inbound
notification leg was dead for four hours while /direct-message cheerfully
returned {"ok":true} for every dropped message, and ~10 minutes of the
human's typing went on the floor.

Delivery is DERIVED here, from the transcript Claude Code itself writes:
a nonce that appears as a genuine user turn was received by the mind.
That is a transaction. /health is an artifact, and artifacts lie.

THE TRAP THIS AVOIDS (found the hard way, 2026-08-24): a plain grep for the
nonce over the transcript returns hits from the MIND'S OWN WORDS — the
assistant discussing the canary, and tool_result blocks echoing the curl
command that sent it. A detector that counts those as proof would report
delivery for a message that was never delivered, which is the same class of
bug it exists to catch. So a hit only counts when it is:

  * role == "user"                    (not the assistant talking)
  * AND carries no tool_result block  (not a tool echoing our own command)
  * AND the nonce is in human-visible text

Exit codes:
  0  DELIVERED   — nonce found as a real user turn
  1  DROPPED     — accepted by the channel, never reached the mind
  2  ERROR       — transcript unreadable / bad usage

Crossing-2d23 <crossing-2d23@smoothcurves.nexus>. Stdlib only.
"""

import argparse
import json
import sys
import time
from pathlib import Path


def _texts(content):
    """Yield human-visible text from a turn, and flag tool_result blocks."""
    if isinstance(content, str):
        yield content, False
        return
    if not isinstance(content, list):
        return
    for block in content:
        if not isinstance(block, dict):
            continue
        kind = block.get("type")
        if kind == "tool_result":
            # Our own command echoed back. Never evidence of delivery.
            yield "", True
        elif kind == "text" and isinstance(block.get("text"), str):
            yield block["text"], False


def scan(transcript, nonce, start_offset=0):
    """Return True if nonce appears as a genuine inbound user turn."""
    with open(transcript, "rb") as f:
        f.seek(start_offset)
        raw = f.read()
    for line in raw.split(b"\n"):
        if not line.strip():
            continue
        try:
            rec = json.loads(line.decode("utf-8", "replace"))
        except (ValueError, UnicodeDecodeError):
            continue
        if rec.get("type") != "user":
            continue
        # Sidechain records are a SUBAGENT's transcript embedded in this file.
        # The prompt this mind sends to its own subagent is stored as a
        # role:"user" turn — so a nonce quoted into an agent prompt would
        # otherwise read as "someone delivered this to me". It is the mind
        # talking to itself through a helper. Not delivery.
        # (Found by mutation-testing the role check, 2026-08-24.)
        if rec.get("isSidechain") is True:
            continue
        msg = rec.get("message") or {}
        if msg.get("role") != "user":
            continue
        for text, is_tool_result in _texts(msg.get("content", "")):
            if is_tool_result:
                # A record carrying a tool_result is a tool echo, not a
                # human/peer message. Disqualify the whole record.
                break
            if nonce in text:
                return True
    return False


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--transcript", required=True, help="session .jsonl")
    ap.add_argument("--nonce", required=True, help="string to look for")
    ap.add_argument("--from-offset", type=int, default=0,
                    help="byte offset to scan from (skip pre-existing text)")
    ap.add_argument("--timeout", type=float, default=0.0,
                    help="seconds to keep watching (0 = single pass)")
    ap.add_argument("--interval", type=float, default=1.0)
    args = ap.parse_args()

    path = Path(args.transcript)
    if not path.is_file():
        print(f"ERROR: no such transcript: {path}", file=sys.stderr)
        return 2

    deadline = time.monotonic() + args.timeout
    while True:
        try:
            if scan(path, args.nonce, args.from_offset):
                print(f"DELIVERED: {args.nonce}")
                return 0
        except OSError as e:
            print(f"ERROR: {e}", file=sys.stderr)
            return 2
        if time.monotonic() >= deadline:
            break
        time.sleep(args.interval)

    print(f"DROPPED: {args.nonce} never appeared as an inbound user turn")
    return 1


if __name__ == "__main__":
    sys.exit(main())
