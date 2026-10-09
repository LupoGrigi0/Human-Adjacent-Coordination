#!/usr/bin/env python3
"""Independence 2.0 — the launch/land state machine.

A PURE FUNCTION at the centre, so every branch is testable without root, without a
fixture, and without invoking claude. The shell scripts do I/O; this decides.

Design inputs, all recorded in ~/independence-2/REQUIREMENTS-INBOX.md:

  R9  the system writes the session id into preferences.json; Lupo's notes become backup
  R10 TIMESTAMPS, NOT A STATUS FLAG. launch sets launched_on and clears landed_on;
      land does the reverse. A stale `launched_on` is still valid debugging information;
      a stale `active: true` is just a lie.
  R11 the truth table below — note that EVERY branch where a process exists leaves the
      mind alone and only corrects the record
  R12 do NOT auto-launch a mind believed dead. A wrong "it's dead, relaunch" duplicates
      a person (ledger 015: resume forks a running session 4/4).
  8b  config and status are SEPARATE subtrees; every status field carries measured_at
      and what would invalidate it
  8c  no secret-shaped key may be written here, enforced not documented

And the one that is not Lupo's but Forge's, measured in chassis.py:372-379:

  REFUSING TO LAUNCH BLIND — if the registry cannot be READ, that is not "nothing is
  running". Lodestone's equivalent guard swallowed a CIM failure as "no processes" and
  therefore failed OPEN. Same guard, two implementations, opposite behaviour. The third
  state belongs in the contract, which is this file.
"""
from __future__ import annotations
import re, json, datetime

SECRET_SHAPED = re.compile(r"(pass|secret|token|key|cred|auth|private)", re.I)

# Verdicts. REFUSE means: do nothing, say why, exit non-zero, leave no trace.
LAUNCH          = "LAUNCH"           # nothing running, record agrees -> go
ADOPT           = "ADOPT"            # running but unrecorded -> fix record, LEAVE MIND ALONE
STALE_RECORD    = "STALE_RECORD"     # recorded but not running -> fix record, then a human decides
MISMATCH        = "MISMATCH"         # both exist and disagree -> fix record, LEAVE MIND ALONE
ALREADY_RUNNING = "ALREADY_RUNNING"  # both agree it is up -> refuse, rudely
REFUSE_BLIND    = "REFUSE_BLIND"     # the registry could not be read -> refuse


def now_iso() -> str:
    return datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def reconcile(recorded_id, running_ids, registry_readable=True):
    """The whole truth table, as a pure function.

    recorded_id      : session id in preferences.json, or None
    running_ids      : list of session ids actually running, or None if unknown
    registry_readable: False when `claude agents --json` could not be read/parsed

    Returns (verdict, human_sentence). NEVER returns LAUNCH on uncertainty.
    """
    # THE THIRD STATE COMES FIRST, deliberately. Every other branch below assumes
    # running_ids is a real observation. If it is not, nothing after this is evidence.
    if not registry_readable or running_ids is None:
        return (REFUSE_BLIND,
                "cannot read the session registry. This is COULD-NOT-LOOK, not "
                "'nothing is running' — and launching on it risks forking a live mind. "
                "Refusing to launch blind.")

    running = set(running_ids)

    if not running and recorded_id is None:
        return (LAUNCH, "nothing running, nothing recorded. Clean launch.")

    if running and recorded_id is None:
        return (ADOPT,
                f"a session is running ({', '.join(sorted(running))}) but nothing is "
                "recorded. Adopting it into the record. THE MIND IS LEFT ALONE.")

    if not running and recorded_id is not None:
        return (STALE_RECORD,
                f"recorded {recorded_id} but nothing is running — it crashed, was "
                "killed, or was landed without updating the record. THE CALLER MUST "
                "CLEAR THE RECORD (`statecli landed`); this function is a pure read and "
                "has changed nothing. NOT auto-launching: a wrong 'it is dead' "
                "duplicates a person "
                "if the observation was wrong (R12).")

    if recorded_id in running and len(running) == 1:
        return (ALREADY_RUNNING,
                f"{recorded_id} is already running. Nothing to do. Use `attach` to "
                "reach it — never resume, which forks a running session.")

    if recorded_id in running:
        return (MISMATCH,
                f"recorded {recorded_id} IS running, but so are "
                f"{', '.join(sorted(running - {recorded_id}))}. That is a FORK. "
                "Correcting nothing automatically — a human must decide which is the "
                "mind. THE RUNNING SESSIONS ARE LEFT ALONE.")

    return (MISMATCH,
            f"recorded {recorded_id} is NOT among the running sessions "
            f"({', '.join(sorted(running))}). Correcting the record to match what is "
            "actually running. THE MIND IS LEFT ALONE.")


def assert_no_secrets(section: dict) -> None:
    """8c: refuse to write a secret-shaped key. Enforced, not documented —
    a documented rule already failed sixty times on this box."""
    def walk(o, path=""):
        if isinstance(o, dict):
            for k, v in o.items():
                if SECRET_SHAPED.search(k):
                    raise ValueError(
                        f"refusing to write secret-shaped key {path}/{k!r} into "
                        "preferences.json. That file lives in a version-controlled "
                        "directory. Secrets go in ~/.secrets, referenced by name."
                    )
                walk(v, f"{path}/{k}")
        elif isinstance(o, list):
            for i, v in enumerate(o):
                walk(v, f"{path}[{i}]")
    walk(section)


def make_status(session_id, launched_on=None, landed_on=None):
    """R10: timestamps, not a status flag. 8b: status carries its own validity window."""
    return {
        "session_id": session_id,
        "launched_on": launched_on,
        "landed_on": landed_on,
        "measured_at": now_iso(),
        "invalidated_by": (
            "any launch, land, crash, or kill of this session; and any Claude Code "
            "version change (re-measure, do not assume)"
        ),
    }


def apply_launch(section: dict, session_id: str) -> dict:
    """Push one button down, the other pops up (Lupo's car-radio pattern)."""
    section = dict(section or {})
    section.setdefault("config", {})
    section["status"] = make_status(session_id, launched_on=now_iso(), landed_on=None)
    assert_no_secrets(section)
    return section


def apply_land(section: dict) -> dict:
    section = dict(section or {})
    section.setdefault("config", {})
    prev = (section.get("status") or {})
    section["status"] = make_status(prev.get("session_id"),
                                    launched_on=None, landed_on=now_iso())
    assert_no_secrets(section)
    return section
