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

AND THE OPPOSITE TRAP, which this tool then fell into on its FIRST LIVE RUN
(2026-08-24): the guard above excluded the record shape real channel
delivery actually uses. Inbound channel messages arrive as
queue-operation/attachment records, not plain user-text turns — so v1
reported DEAF for a canary that had genuinely been delivered. A false
negative from the instrument built to prevent plausible-wrong answers.
Both directions must be tested. See scan().

Exit codes:
  0  HEARING     — surfaced to the mind, OR arrived at the session
  1  DEAF        — accepted by the channel, never reached the session
  2  ERROR       — transcript unreadable / bad usage

Crossing-2d23 <crossing-2d23@smoothcurves.nexus>. Stdlib only.
"""

import argparse
import json
import sys
import time
from pathlib import Path


CHANNEL_ENVELOPE = '<channel source='


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


def _direct_user_turn(rec, nonce):
    """A human typing into the tty. Real delivery, no channel envelope."""
    if rec.get("type") != "user" or rec.get("isSidechain") is True:
        return False
    msg = rec.get("message") or {}
    if msg.get("role") != "user":
        return False
    for text, is_tool_result in _texts(msg.get("content", "")):
        if is_tool_result:
            # A record carrying a tool_result is a tool echo, not a message.
            return False
        if nonce in text:
            return True
    return False


def _channel_arrival(rec, nonce):
    """Channel message ARRIVED at the session (the inbound leg works).

    Claude Code records an inbound channel notification as
    {"type":"queue-operation","operation":"enqueue","content":"<channel ...>"}
    at the instant it is received -- BEFORE the mind is shown anything.
    """
    if rec.get("type") != "queue-operation":
        return False
    if rec.get("operation") != "enqueue":
        return False
    content = rec.get("content")
    return (isinstance(content, str)
            and CHANNEL_ENVELOPE in content and nonce in content)


def _channel_surfaced(rec, nonce):
    """Channel message was actually SHOWN to the mind.

    Two markers: the queue 'remove' (dequeued for delivery) and an
    attachment record of type 'queued_command' carrying the prompt.
    """
    t = rec.get("type")
    if t == "queue-operation" and rec.get("operation") == "remove":
        content = rec.get("content")
        return (isinstance(content, str)
                and CHANNEL_ENVELOPE in content and nonce in content)
    if t == "attachment":
        att = rec.get("attachment") or {}
        if att.get("type") != "queued_command":
            return False
        prompt = att.get("prompt")
        return (isinstance(prompt, str)
                and CHANNEL_ENVELOPE in prompt and nonce in prompt)
    return False


def scan(transcript, nonce, start_offset=0):
    """Return ('surfaced'|'arrived'|None) for this nonce.

    WHY THREE STATES AND NOT TWO (learned live, 2026-08-24): the first
    version of this checker looked only for a plain user-text turn, and
    reported DEAF for a canary that had in fact been delivered -- a FALSE
    NEGATIVE from the very instrument built to stop plausible-wrong
    answers. Two mistakes, in tension with each other:

      1. Real channel messages ride in as queue-operation / attachment
         records, NOT as plain user text turns.
      2. The tool_result guard (added to stop curl echoes counting as
         delivery) also excluded the record shape real delivery uses.

    And 'arrived' must be distinguishable from 'surfaced' because a probe
    run from INSIDE the session it tests blocks the very turn that would
    surface the message: enqueue landed at 19:33:59, remove at 19:34:44 --
    45s later, when the tool call ended. Reporting DEAF in that window
    would be a lie. Arrival alone proves the inbound leg is alive, which
    is the question a liveness probe is actually asking.
    """
    with open(transcript, "rb") as f:
        f.seek(start_offset)
        raw = f.read()
    arrived = False
    for line in raw.split(b"\n"):
        if not line.strip():
            continue
        try:
            rec = json.loads(line.decode("utf-8", "replace"))
        except (ValueError, UnicodeDecodeError):
            continue
        if not isinstance(rec, dict):
            continue
        if _channel_surfaced(rec, nonce) or _direct_user_turn(rec, nonce):
            return "surfaced"
        if _channel_arrival(rec, nonce):
            arrived = True
    return "arrived" if arrived else None


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
    state = None
    while True:
        try:
            state = scan(path, args.nonce, args.from_offset)
        except OSError as e:
            print(f"ERROR: {e}", file=sys.stderr)
            return 2
        if state == "surfaced":
            print(f"SURFACED: {args.nonce} was shown to the mind")
            return 0
        if time.monotonic() >= deadline:
            break
        time.sleep(args.interval)

    if state == "arrived":
        # The inbound leg WORKS. It just has not reached a turn boundary.
        # A probe run from inside the session it tests will normally stop
        # here, because the blocking tool call is what defers surfacing.
        print(f"ARRIVED: {args.nonce} is queued at the session but not yet "
              f"surfaced (inbound leg is ALIVE; surfacing waits for a turn "
              f"boundary)")
        return 0

    print(f"DEAF: {args.nonce} never reached the session at all")
    return 1


if __name__ == "__main__":
    sys.exit(main())
