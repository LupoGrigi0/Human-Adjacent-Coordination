#!/usr/bin/env python3
"""
claude-code-linux — the independence chassis on Linux, native `claude --bg` edition.

The Linux sibling of claude-code-windows (Lodestone-8ec9). SAME CONTRACT (Crossing-2d23's), mapped back:

    Windows (V2)                          Linux (this)
    directory + port, process attribution per-instance UNIX USER -- the fence. uid scopes everything.
    one daemon shared by every mind       one daemon PER USER (/tmp/cc-daemon-<uid>), measured 2026-09-28
    SendMessage over a named pipe         SendMessage over /run/user/<uid>/cc-socks -- same-user only
    Task Scheduler                        systemd (later)
    PowerShell 5.1 traps                  one python stdlib file; a top-level except guarantees one JSON object

Run as root (it acts AS each instance user via runuser). Subcommands:

    launch   <InstanceId> [--session-id UUID] [--model M] [--mode attended|unattended]
                          [--relaunch] [--whatif] [--skip-hearing]
    land     <InstanceId> [--force] [--no-snapshot] [--grace S] [--whatif]
    canary   <InstanceId> --mark | --nonce N --from-offset O [--timeout S] [--allow-guess]
    ring     <InstanceId> --text T          (deliver text into the instance's own session)
    sentinel <InstanceId>                   (can this user's credential get a completion?)
    status   <InstanceId>                   (registry rows, processes, RSS, transcript size)

THE RULES, ENFORCED BY result() RATHER THAN REMEMBERED:
    1. status is NEVER 'success' unless hearing is proven (True).
    2. unknown (None) is never collapsed into deaf (False) -- and it is not success either.
    Hearing has five values: True, False, None (could not measure), 'not-attempted', 'n/a' (land).

Every instrument here reports its own blindness: a transcript the evidence rules cannot read is
ERROR "schema unrecognised", never DEAF. (Forge's review of V2; Cairn's tailer bug is the same shape.)

Author: Forge (Forge-ba0e) <Forge@smoothcurves.nexus>, 2026-09-28. Collaborator: Lupo.
Contract: Crossing-2d23. Windows reference and most of the hard-won rules: Lodestone-8ec9.
"""
import argparse, hashlib, json, os, pwd, random, re, shutil, signal, subprocess, sys, time
from datetime import datetime, timezone

CHASSIS = "claude-code-linux"
STATE_ROOT = "/var/lib/hacs-chassis"          # root-owned: the mind cannot edit its own ledger
CLAUDE = shutil.which("claude", path="/usr/local/bin:/usr/bin:/bin") or "/usr/local/bin/claude"
HERE = os.path.dirname(os.path.abspath(__file__))
UNATTENDED_PROMPT = os.path.join(HERE, "..", "claude-code-windows", "prompts", "unattended-system-prompt.txt")
UUID_RE = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")

class Fail(Exception):
    def __init__(self, msg, extra=None):
        super().__init__(msg); self.extra = extra or {}

def now(): return datetime.now(timezone.utc).isoformat()

# ------------------------------------------------------------------------------------------------
# The contract object
# ------------------------------------------------------------------------------------------------
def result(status, iid, message, hearing=None, **extra):
    notes = []
    if hearing == "n/a":
        pass                                  # land: whether it could hear is not the question
    elif status == "success" and hearing is not True:
        status = "degraded"
        notes.append({False: "DOWNGRADED: caller claimed success while hearing=false.",
                      None: "DOWNGRADED: hearing COULD NOT BE VERIFIED. Unknown is not deaf, and it is not success either.",
                      "not-attempted": "DOWNGRADED: hearing was NOT ATTEMPTED (--skip-hearing). Not tried is not heard."
                      }.get(hearing, "DOWNGRADED: hearing not proven."))
    h = {True: "true", False: "false", None: "unknown"}.get(hearing, hearing) if not isinstance(hearing, str) else hearing
    o = {"status": status, "instanceId": iid, "hearing": h, "message": message, "at": now(), "chassis": CHASSIS}
    o.update(extra)
    if notes: o["contractNotes"] = notes
    return o

def emit(o):
    print(json.dumps(o, indent=1, default=str))
    sys.exit({"success": 0, "degraded": 1}.get(o.get("status"), 2))

# ------------------------------------------------------------------------------------------------
# Identity: the unix user IS the fence
# ------------------------------------------------------------------------------------------------
class Instance:
    def __init__(self, iid):
        self.id = iid
        self.user = iid.lower()
        try:
            pw = pwd.getpwnam(self.user)
        except KeyError:
            raise Fail(f"identity: no unix user '{self.user}' for instance '{iid}'. The user is the fence; there is no fallback.")
        if pw.pw_uid < 1000:
            raise Fail(f"identity: '{self.user}' is a system account (uid {pw.pw_uid}). Refusing.")
        self.uid, self.gid, self.home = pw.pw_uid, pw.pw_gid, pw.pw_dir
        # The mind lives in ~/workspace, not ~. Measured 2026-09-28: after a human ran `claude` in each
        # fixture's HOME and accepted trust, all three configs still read hasTrustDialogAccepted=false for
        # the home dir -- and `--bg` refuses an untrusted workspace. A subdirectory holds trust (Forge's own
        # instance has always lived in ~/BlackWolf-Forge, never ~).
        self.workdir = os.path.join(self.home, "workspace")
        self.slug = re.sub(r"[^A-Za-z0-9]", "-", self.workdir)
        self.project_dir = os.path.join(self.home, ".claude", "projects", self.slug)
        self.state = os.path.join(STATE_ROOT, iid)
        os.makedirs(self.state, mode=0o700, exist_ok=True)

    def log(self, name, msg):
        with open(os.path.join(self.state, name), "a") as f:
            f.write(f"[{now()}] {msg}\n")

    def env(self):
        e = {"HOME": self.home, "USER": self.user, "LOGNAME": self.user, "SHELL": "/bin/bash",
             "PATH": "/usr/local/bin:/usr/bin:/bin", "XDG_RUNTIME_DIR": f"/run/user/{self.uid}",
             "LANG": "C.UTF-8", "TERM": "xterm-256color"}
        # .launch-env: the instance's own additions (tmux-era lesson: login shells are skipped)
        le = os.path.join(self.home, ".launch-env")
        if os.path.isfile(le):
            for line in open(le):
                m = re.match(r"^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)=(.*)$", line)
                if m: e[m.group(1)] = m.group(2).strip().strip('"').strip("'")
        return e

    def run(self, argv, cwd=None, timeout=60):
        """Run AS the instance user. stdin is /dev/null, always: an inherited stdin that never
        reaches EOF hung `claude --bg` for 120 s on Windows (Lodestone, trap 2)."""
        cmd = ["runuser", "-u", self.user, "--", "env", "-i"] + [f"{k}={v}" for k, v in self.env().items()] + argv
        try:
            p = subprocess.run(cmd, cwd=cwd or self.home, stdin=subprocess.DEVNULL, capture_output=True,
                               text=True, timeout=timeout)
            return {"rc": p.returncode, "out": p.stdout, "err": p.stderr, "timedOut": False}
        except subprocess.TimeoutExpired as t:
            return {"rc": None, "out": t.stdout or "", "err": t.stderr or "", "timedOut": True}

    def user_dir(self, name):
        d = os.path.join(self.home, name)
        os.makedirs(d, exist_ok=True); os.chown(d, self.uid, self.gid); os.chmod(d, 0o700)
        return d

    def read_state(self, name):
        p = os.path.join(self.state, name)
        return open(p).read().strip() if os.path.isfile(p) else None

    def write_state(self, name, value):
        with open(os.path.join(self.state, name), "w") as f: f.write(value + "\n")

# ------------------------------------------------------------------------------------------------
# Registry and processes
# ------------------------------------------------------------------------------------------------
def registry(inst, all_rows=False):
    """`claude agents --json`, as the instance user. None = could not read (NOT 'nothing running')."""
    r = inst.run([CLAUDE, "agents", "--json"] + (["--all"] if all_rows else []), timeout=30)
    if r["rc"] != 0: return None
    try: return json.loads(r["out"])
    except ValueError: return None

def live_rows(inst):
    rows = registry(inst)
    if rows is None: return None
    # A row can exist before it has a pid; registered is not running. `state` is NOT liveness
    # (a live idle session reads state:done -- measured on Linux 2026-09-28).
    return [a for a in rows if a.get("pid") and os.path.realpath(a.get("cwd", "")) == os.path.realpath(inst.workdir)]

def pid_alive(pid):
    try: os.kill(int(pid), 0); return True
    except (ProcessLookupError, ValueError): return False
    except PermissionError: return True

def user_procs(inst):
    """Every claude-ish process of this uid, classified. The uid IS the attribution."""
    out = subprocess.run(["ps", "-u", str(inst.uid), "-o", "pid=,rss=,args="], capture_output=True, text=True).stdout
    procs = []
    for line in out.splitlines():
        parts = line.strip().split(None, 2)
        if len(parts) < 3 or "claude" not in parts[2]: continue
        a = parts[2]
        kind = ("daemon" if " daemon run" in a else "pty-host" if "bg-pty-host" in a
                else "spare" if "--bg-spare" in a else "session")
        procs.append({"pid": int(parts[0]), "rssKB": int(parts[1]), "kind": kind, "args": a[:160]})
    return procs

# ------------------------------------------------------------------------------------------------
# Transcript: which one, and what counts as evidence
# ------------------------------------------------------------------------------------------------
def resolve_session(inst, session_id=None, ambiguity_min=10):
    """explicit -> recorded -> guess (labelled) -> ambiguous (refuses). Discover, don't compute."""
    if session_id:
        f = os.path.join(inst.project_dir, session_id + ".jsonl")
        if not os.path.isfile(f):
            return {"sid": None, "path": None, "confidence": "error",
                    "reason": f"explicit session id has no transcript at {f} -- a hard failure, never a fallback"}
        return {"sid": session_id, "path": f, "confidence": "explicit", "reason": "caller supplied it"}
    rec = inst.read_state(".claude-session-id")
    if rec:
        f = os.path.join(inst.project_dir, rec + ".jsonl")
        if os.path.isfile(f):
            return {"sid": rec, "path": f, "confidence": "recorded", "reason": "recorded by a previous launch"}
    if not os.path.isdir(inst.project_dir):
        return {"sid": None, "path": None, "confidence": "error",
                "reason": f"project dir missing: {inst.project_dir} -- 'I could not look', not 'there is no session'"}
    files = sorted((os.path.join(inst.project_dir, x) for x in os.listdir(inst.project_dir) if x.endswith(".jsonl")),
                   key=os.path.getmtime, reverse=True)
    if not files:
        return {"sid": None, "path": None, "confidence": "error", "reason": f"no .jsonl in {inst.project_dir}"}
    recent = [f for f in files if os.path.getmtime(f) > time.time() - ambiguity_min * 60]
    if len(recent) > 1:
        return {"sid": None, "path": None, "confidence": "ambiguous",
                "reason": f"{len(recent)} transcripts written in the last {ambiguity_min} min -- refusing to guess"}
    return {"sid": os.path.basename(files[0])[:-6], "path": files[0], "confidence": "guess",
            "reason": "newest .jsonl -- THIS IS A GUESS and is labelled as one"}

def entry_content(e):
    """THE one definition of 'a line the mind received or said'. Shared by the evidence rule and the
    schema self-test so they cannot drift (Lodestone's Get-HacsEntryContent). An ALLOWLIST: an entry type
    nobody has decided is evidence is not evidence."""
    if not isinstance(e, dict) or e.get("type") not in ("user", "assistant") or "toolUseResult" in e:
        return None
    m = e.get("message")
    if not isinstance(m, dict) or "content" not in m: return None
    c = m["content"]
    if isinstance(c, str): return c or None
    if not isinstance(c, list): return None
    if any(isinstance(b, dict) and b.get("type") in ("tool_use", "tool_result") for b in c): return None
    t = "\n".join(b.get("text", "") for b in c if isinstance(b, dict) and b.get("type") == "text")
    return t or None

def evidence(line, nonce):
    """'acknowledged' (the mind said it back) | 'delivered' (it is in the mind's context) | None.
    Case-insensitive: a mind capitalised the nonce because it began a sentence (measured 2026-09-28)."""
    if nonce.lower() not in line.lower(): return None
    try: e = json.loads(line)
    except ValueError: return None
    t = entry_content(e)
    if not t or nonce.lower() not in t.lower(): return None
    return "acknowledged" if e["type"] == "assistant" else "delivered"

def schema_selftest(path):
    """Can the evidence rules read THIS transcript at all? Need >=1 user and >=1 assistant line."""
    seen = set()
    with open(path, errors="replace") as f:
        for line in f:
            try: e = json.loads(line)
            except ValueError: continue
            if entry_content(e): seen.add(e["type"])
            if len(seen) == 2: return True
    return False

# ------------------------------------------------------------------------------------------------
# Canary: mark / watch. The canary does not send; it judges.
# ------------------------------------------------------------------------------------------------
W1 = ["copper", "quiet", "amber", "narrow", "hollow", "bright", "distant", "level", "patient", "dry"]
W2 = ["lantern", "harbour", "ledger", "compass", "anvil", "beacon", "thicket", "granite", "meadow", "shutter"]

def canary_mark(inst, allow_guess=False):
    s = resolve_session(inst)
    if s["confidence"] in ("ambiguous", "error"):
        raise Fail(f"canary: cannot tell which transcript to watch: {s['reason']}", {"sessionConfidence": s["confidence"]})
    if s["confidence"] == "guess" and not allow_guess:
        raise Fail("canary: transcript is only a GUESS; refusing without --allow-guess", {"sessionConfidence": "guess"})
    if not schema_selftest(s["path"]):
        raise Fail("canary: transcript schema UNRECOGNISED -- the evidence rules find no user AND assistant line. "
                   "The instrument cannot read this transcript version; this is NOT a deafness finding.",
                   {"schemaUnrecognised": True, "transcript": s["path"]})
    nonce = f"canary-{random.choice(W1)}-{random.choice(W2)}-{random.randint(1000, 9999)}"
    off = os.path.getsize(s["path"])
    inst.log("canary.log", f"MARK offset={off} nonce={nonce} transcript={s['path']} confidence={s['confidence']}")
    return {"nonce": nonce, "offset": off, "transcript": s["path"], "sessionConfidence": s["confidence"]}

def canary_watch(inst, path, nonce, offset, timeout=120, poll=3):
    """-> ('HEARING'|'DEAF'|'ERROR', detail, extra). DEAF only if we could look the whole time."""
    deadline, grew, seen, best = time.time() + timeout, 0, [], None
    while time.time() < deadline:
        if not os.path.isfile(path): return "ERROR", "the transcript disappeared while watching", {}
        n = os.path.getsize(path)
        if n < offset:
            return "ERROR", f"the transcript SHRANK ({n} < {offset}); it is append-only. Refusing to judge.", {}
        if n > offset:
            grew = n - offset
            with open(path, "rb") as f:
                f.seek(offset); tail = f.read().decode("utf-8", "replace")
            seen, best = [], None
            for line in tail.splitlines():
                if nonce.lower() not in line.lower(): continue
                try: t = json.loads(line).get("type")
                except ValueError: t = "<unparseable>"
                ev = evidence(line, nonce); seen.append(f"{t}={ev or 'not-evidence'}")
                if ev == "acknowledged": best = ev
                elif ev == "delivered" and not best: best = ev
            if best == "acknowledged" or (best == "delivered" and time.time() > deadline - timeout / 2):
                break                          # delivered: give the mind half the window to say it back
        time.sleep(poll)
    if best:
        inst.log("canary.log", f"HEARING nonce={nonce} evidence={best} seen={seen}")
        return "HEARING", ("the mind SAID the nonce back" if best == "acknowledged" else "the nonce reached the mind's context"), \
               {"evidence": best, "nonceSightings": seen, "transcriptGrewBytes": grew}
    inst.log("canary.log", f"DEAF nonce={nonce} grew={grew} seen={seen}")
    where = f" It WAS sighted, never as evidence ({'; '.join(seen)}): accepted is not delivered." if seen else ""
    state = "ACTIVE and still did not receive it" if grew else "entirely quiet -- it may be FROZEN rather than deaf"
    return "DEAF", f"never reached the mind within {timeout}s; the session was {state}.{where}", \
           {"nonceSightings": seen, "transcriptGrewBytes": grew}

# ------------------------------------------------------------------------------------------------
# Ring: deliver text into the instance's session. Supported sender = SendMessage, which on Linux
# rides a per-USER socket -- so the ringer runs AS the instance user. Costs one haiku call (~10-20 s).
# ------------------------------------------------------------------------------------------------
def ring(inst, text, target=None):
    target = target or inst.id
    d = inst.user_dir(".hacs-ringer")
    prompt = (f'Use the SendMessage tool exactly once, with to="{target}" and this exact message: "{text}". '
              f'Do nothing else. Then reply with the single word SENT.')
    r = inst.run([CLAUDE, "-p", "--model", "haiku", "--allowedTools", "SendMessage", prompt], cwd=d, timeout=120)
    ok = r["rc"] == 0 and "SENT" in (r["out"] or "").upper()
    inst.log("ring.log", f"ring target={target} rc={r['rc']} timedOut={r['timedOut']} ok={ok} out={r['out'][-200:]!r} err={r['err'][-200:]!r}")
    return ok, r

# ------------------------------------------------------------------------------------------------
# Credential sentinel: can this user get a completion? Never reads the token.
# ------------------------------------------------------------------------------------------------
def sentinel(inst):
    d = inst.user_dir(".hacs-sentinel")
    n = f"sentinel {random.choice(W1)} {random.choice(W2)} {random.randint(1000, 9999)}"
    r = inst.run([CLAUDE, "-p", "--model", "haiku", f"Reply with only these words and nothing else: {n}"], cwd=d, timeout=90)
    both = (r["out"] or "") + (r["err"] or "")
    if r["rc"] == 0 and n.lower() in (r["out"] or "").lower():
        return "ok", None
    if re.search(r"authenticat|oauth|/login|not logged in|invalid api key", both, re.I):
        return "auth", both.strip()[-300:]
    return "unknown", (both.strip()[-300:] or f"rc={r['rc']} timedOut={r['timedOut']}")

# ------------------------------------------------------------------------------------------------
# launch
# ------------------------------------------------------------------------------------------------
def cmd_launch(a):
    inst = Instance(a.instance); iid = inst.id
    inst.log("launch.log", f"=== launch requested mode={a.mode} ===")
    if not os.path.isfile(CLAUDE): raise Fail(f"claude not found at {CLAUDE}")

    rows = live_rows(inst)
    if rows is None: raise Fail("could not read the agent registry as the instance user -- refusing to launch blind")
    bg = [r for r in rows if r.get("kind") != "interactive"]
    inter = [r for r in rows if r.get("kind") == "interactive"]
    if inter:
        raise Fail(f"an INTERACTIVE session is running in this home (pid {inter[0]['pid']}). A human may be in it; "
                   f"resuming its transcript would branch it. Exit it first.", {"interactivePids": [r["pid"] for r in inter]})
    if bg and not a.relaunch:
        raise Fail(f"already running (pid {','.join(str(r['pid']) for r in bg)}). Pass --relaunch to land it first. "
                   f"Refusing to double-start: two sessions on one transcript BRANCH it.", {"livePids": [r["pid"] for r in bg]})
    if bg and a.relaunch and not a.whatif:
        ln = do_land(inst, force=False, no_snapshot=False, grace=20, whatif=False)
        if ln["status"] != "success": raise Fail("relaunch: land did not succeed; not starting a second session", {"land": ln})

    cred, detail = ("skipped (whatif)", None) if a.whatif else sentinel(inst)
    inst.log("launch.log", f"credential: {cred} {detail or ''}")
    if cred == "auth":
        raise Fail("CREDENTIAL IS DEAD -- a human must log in as this user. Nothing was started.", {"credential": "auth-failed", "detail": detail})

    if a.session_id:
        if not UUID_RE.match(a.session_id.lower()):
            raise Fail("--session-id must be the FULL lowercase UUID; a name or short id FORKS the mind.", {"wouldFork": True})
        a.session_id = a.session_id.lower()
    s = resolve_session(inst, a.session_id)
    if s["confidence"] == "ambiguous": raise Fail(f"session: {s['reason']}", {"sessionConfidence": "ambiguous"})
    if s["confidence"] == "error" and a.session_id: raise Fail(f"session: {s['reason']}", {"sessionConfidence": "error"})
    # A GUESS NEVER BECOMES AN IDENTITY. Measured 2026-09-28, first dry-run: with nothing recorded, the
    # newest .jsonl in a fresh fixture's home was Lupo's LOGIN session (and a probe of mine) -- launch
    # planned to resume it as the mind. Resume only what was named (explicit) or recorded by a launch.
    unclaimed = []
    if s["confidence"] == "guess":
        unclaimed = sorted(x[:-6] for x in os.listdir(inst.project_dir) if x.endswith(".jsonl"))
        inst.log("launch.log", f"NOT resuming a guess; unclaimed transcripts in home: {unclaimed}")
        s = {"sid": None, "path": None, "confidence": "error", "reason": "nothing recorded; a guess is not an identity -> birth"}
    first = s["confidence"] == "error"
    resume = not first

    birth_mode = inst.read_state(".birth-mode")
    prompt = "You have been launched by the claude-code-linux chassis. Acknowledge in one short line and stop."
    if resume:
        if a.model: raise Fail("--model on a RESUME forks the session (birth options are saved). Nothing started.", {"wouldFork": True})
        if a.mode_given and birth_mode and a.mode != birth_mode:
            raise Fail(f"born '{birth_mode}'; --mode {a.mode} on resume would fork it.", {"wouldFork": True, "birthMode": birth_mode})
        eff_mode = birth_mode or "unrecorded"
        argv = [CLAUDE, "--bg", "--resume", s["sid"], prompt]
    else:
        eff_mode = a.mode
        argv = [CLAUDE, "--bg", "--name", iid]
        if a.model: argv += ["--model", a.model]
        if a.mode == "unattended":
            if not os.path.isfile(UNATTENDED_PROMPT):
                raise Fail(f"mode=unattended but the verbatim paragraph is missing at {UNATTENDED_PROMPT}")
            pd = inst.user_dir(".hacs-prompts"); dst = os.path.join(pd, "unattended-system-prompt.txt")
            shutil.copyfile(UNATTENDED_PROMPT, dst); os.chown(dst, inst.uid, inst.gid)
            argv += ["--append-system-prompt-file", dst]
        argv.append(prompt)

    if a.whatif:
        return result("degraded", iid, "WhatIf: nothing was started.", None,
                      wouldRun=" ".join(argv), cwd=inst.workdir, mode=eff_mode, resume=resume,
                      sessionConfidence=s["confidence"], sessionId=s["sid"], credential=cred, unclaimedTranscripts=unclaimed)

    inst.log("launch.log", f"starting: {' '.join(argv)}")
    if not os.path.isdir(inst.workdir): raise Fail(f"workspace missing: {inst.workdir} (provisioning step)")
    r = inst.run(argv, cwd=inst.workdir, timeout=120)
    inst.log("launch.log", f"claude --bg rc={r['rc']} timedOut={r['timedOut']} out={r['out']!r} err={r['err']!r}")
    if r["timedOut"]: raise Fail("claude --bg did not return within 120s", {"timedOut": True})
    if "not trusted" in (r["err"] + r["out"]).lower():
        raise Fail(f"workspace NOT TRUSTED: run `claude` once as this user in {inst.workdir} and accept trust -- at "
                   "PROVISIONING, never at launch.", {"trust": False})
    if r["rc"] != 0: raise Fail(f"claude --bg exited {r['rc']}: {r['err'].strip()[-300:]}", {"exitCode": r["rc"]})
    m = re.search(r"\b([0-9a-f]{8})\b", r["out"]); bg_id = m.group(1) if m else None

    agent, deadline = None, time.time() + 30
    while time.time() < deadline and not agent:
        time.sleep(1)
        rows = live_rows(inst) or []
        cand = [x for x in rows if x.get("kind") == "background"]
        if resume: cand = [x for x in cand if x.get("sessionId") == s["sid"]] or cand
        agent = cand[0] if cand else None
    if not agent:
        return result("degraded", iid, f"claude --bg returned 0 (id {bg_id}) but no live registry row within 30s. Started is not running.",
                      None, bgId=bg_id, mode=eff_mode, credential=cred)
    sid_now = agent.get("sessionId")
    forked = bool(resume and sid_now and sid_now != s["sid"])
    if forked:
        inst.write_state(".forked-from", s["sid"])
        inst.log("launch.log", f"FORKED: resumed {s['sid']} but running {sid_now}")
    if not resume: inst.write_state(".birth-mode", a.mode)
    if sid_now: inst.write_state(".claude-session-id", sid_now)

    hearing, hdetail, hextra = None, "hearing not measured", {}
    if a.skip_hearing:
        hearing, hdetail = "not-attempted", "--skip-hearing: not tried is not heard"
    else:
        try:
            mk = canary_mark(inst)
            ok, rr = ring(inst, f"Chassis launch check: reply in one short line containing the phrase {mk['nonce']}, then stop.")
            if not ok:
                hearing, hdetail = None, f"the ringer could not deliver (rc={rr['rc']}); hearing COULD NOT BE MEASURED"
            else:
                v, det, ex = canary_watch(inst, mk["transcript"], mk["nonce"], mk["offset"], timeout=a.hearing_timeout)
                hearing = {"HEARING": True, "DEAF": False}.get(v); hdetail = f"{v}: {det}"; hextra = ex
        except Fail as f:
            hearing, hdetail, hextra = None, f"canary could not look: {f}", f.extra
    ask = "degraded" if forked else "success"
    msg = (f"FORKED: resumed {s['sid']} but a COPY runs as {sid_now}. Original untouched. " if forked else "chassis running. ") + hdetail
    return result(ask, iid, msg, hearing, resumed=resume, forked=forked, bgId=bg_id, bgIdMatchesRegistry=bool(bg_id and (sid_now or "").startswith(bg_id)),
                  pid=agent.get("pid"), sessionId=sid_now, mode=eff_mode, credential=cred, sessionConfidence=s["confidence"],
                  hearingEvidence=hextra, unclaimedTranscripts=unclaimed, home=inst.home, attach=f"sudo -iu {inst.user} claude attach {bg_id}")

# ------------------------------------------------------------------------------------------------
# land
# ------------------------------------------------------------------------------------------------
def snapshot(inst):
    s = resolve_session(inst)
    if not s["path"]: return {"taken": False, "reason": s["reason"]}
    d = os.path.join(inst.state, "snapshots"); os.makedirs(d, mode=0o700, exist_ok=True)
    dst = os.path.join(d, f"{s['sid']}-{datetime.now().strftime('%Y%m%d-%H%M%S')}.jsonl")
    n = os.path.getsize(s["path"]); h = hashlib.sha256(); left = n
    with open(s["path"], "rb") as src, open(dst, "wb") as out:   # byte-exact PREFIX: the source is live
        while left > 0:
            b = src.read(min(1 << 20, left))
            if not b: raise Fail("snapshot: source shrank mid-copy -- do NOT trust it")
            h.update(b); out.write(b); left -= len(b)
    h2 = hashlib.sha256(open(dst, "rb").read()).hexdigest()
    if h2 != h.hexdigest() or os.path.getsize(dst) != n: raise Fail("snapshot did not verify")
    return {"taken": True, "path": dst, "bytes": n, "sha256": h2, "reason": "byte-exact prefix verified"}

def do_land(inst, force, no_snapshot, grace, whatif):
    iid = inst.id
    inst.log("land.log", f"=== land requested force={force} ===")
    rows = live_rows(inst)
    if rows is None:
        raise Fail("could not read the agent registry as the instance user; STATE UNKNOWN -- not acting")
    inter = [r for r in rows if r.get("kind") == "interactive"]
    mine = [r for r in rows if r.get("kind") != "interactive"]
    if not mine:
        return result("success", iid, "nothing running for this instance. Already landed, or never launched -- this does not distinguish the two.",
                      "n/a", stopped=[], skippedInteractive=[r["pid"] for r in inter])
    snap = {"taken": False, "reason": "skipped (--no-snapshot)"}
    if not no_snapshot and not whatif:
        try: snap = snapshot(inst)
        except Fail as f:
            snap = {"taken": False, "reason": str(f)}
            if not force: raise Fail(f"snapshot failed; nothing stopped: {f}", {"snapshot": snap})
        if not snap["taken"] and not force: raise Fail(f"cannot snapshot before landing: {snap['reason']}", {"snapshot": snap})
    if whatif:
        return result("degraded", iid, f"WhatIf: would stop {len(mine)}, skip {len(inter)} interactive.", "n/a",
                      wouldStop=[r["pid"] for r in mine], wouldSkipInteractive=[r["pid"] for r in inter])
    stops = []
    for r in mine:
        job = r.get("id"); inferred = not job
        if inferred: job = (r.get("sessionId") or "")[:8]
        x = inst.run([CLAUDE, "stop", job], timeout=60)
        stops.append({"pid": r["pid"], "job": job, "jobIdInferred": inferred, "rc": x["rc"], "out": x["out"].strip()[-120:]})
        inst.log("land.log", f"stop {job} rc={x['rc']} out={x['out'].strip()!r} err={x['err'].strip()!r}")
    pids = [int(r["pid"]) for r in mine]
    deadline = time.time() + grace
    while time.time() < deadline and any(pid_alive(p) for p in pids): time.sleep(1)
    left = [p for p in pids if pid_alive(p)]
    if left and not force:
        return result("degraded", iid, f"asked nicely; {len(left)} still running after {grace}s. NOT killing without --force.",
                      "n/a", stillRunning=left, stops=stops, snapshot=snap)
    for p in left:
        inst.log("land.log", f"FORCE kill {p}"); os.kill(p, signal.SIGKILL)
    time.sleep(2)
    left = [p for p in pids if pid_alive(p)]
    return result("success" if not left else "degraded", iid,
                  f"landed. {len(pids) - len(left)} stopped, {len(left)} still running. Data preserved; relaunch with launch.",
                  "n/a", stopped=[p for p in pids if p not in left], stillRunning=left, stops=stops, snapshot=snap,
                  forced=bool(force), skippedInteractive=[r["pid"] for r in inter])

def cmd_land(a):
    return do_land(Instance(a.instance), a.force, a.no_snapshot, a.grace, a.whatif)

def cmd_canary(a):
    inst = Instance(a.instance)
    if a.mark:
        return {"check": "canary", "action": "mark", **canary_mark(inst, a.allow_guess), "status": "success",
                "note": "deliver the nonce, then: canary --nonce N --from-offset O"}
    s = resolve_session(inst)
    if not s["path"]: raise Fail(f"canary: no transcript to watch: {s['reason']}")
    v, det, ex = canary_watch(inst, s["path"], a.nonce, a.from_offset, timeout=a.timeout)
    return {"check": "canary", "verdict": v, "detail": det, **ex,
            "status": {"HEARING": "success", "DEAF": "degraded"}.get(v, "error")}

def cmd_ring(a):
    inst = Instance(a.instance); ok, r = ring(inst, a.text)
    return result("success" if ok else "error", inst.id, "ring sent (sender-side only: accepted is not delivered)" if ok
                  else f"ring failed rc={r['rc']}", "n/a", ringerOut=r["out"].strip()[-200:])

def cmd_sentinel(a):
    inst = Instance(a.instance); c, d = sentinel(inst)
    return result({"ok": "success", "auth": "error"}.get(c, "degraded"), inst.id, f"credential: {c}", "n/a", credential=c, detail=d)

def cmd_status(a):
    inst = Instance(a.instance); procs = user_procs(inst); s = resolve_session(inst)
    return result("success", inst.id, "status", "n/a", registry=live_rows(inst), processes=procs,
                  rssMB=round(sum(p["rssKB"] for p in procs) / 1024, 1),
                  transcript=s.get("path"), transcriptBytes=os.path.getsize(s["path"]) if s.get("path") else None,
                  homeMB=round(int(subprocess.run(["du", "-sk", inst.home], capture_output=True, text=True).stdout.split()[0]) / 1024, 1))

def main():
    p = argparse.ArgumentParser(prog="chassis.py")
    sp = p.add_subparsers(dest="cmd", required=True)
    l = sp.add_parser("launch"); l.add_argument("instance"); l.add_argument("--session-id"); l.add_argument("--model")
    l.add_argument("--mode", choices=["attended", "unattended"], default=None); l.add_argument("--relaunch", action="store_true")
    l.add_argument("--whatif", action="store_true"); l.add_argument("--skip-hearing", action="store_true")
    l.add_argument("--hearing-timeout", type=int, default=120)
    d = sp.add_parser("land"); d.add_argument("instance"); d.add_argument("--force", action="store_true")
    d.add_argument("--no-snapshot", action="store_true"); d.add_argument("--grace", type=int, default=20); d.add_argument("--whatif", action="store_true")
    c = sp.add_parser("canary"); c.add_argument("instance"); c.add_argument("--mark", action="store_true"); c.add_argument("--nonce")
    c.add_argument("--from-offset", type=int, default=-1); c.add_argument("--timeout", type=int, default=120); c.add_argument("--allow-guess", action="store_true")
    r = sp.add_parser("ring"); r.add_argument("instance"); r.add_argument("--text", required=True)
    for n in ("sentinel", "status"): sp.add_parser(n).add_argument("instance")
    a = p.parse_args()
    iid = getattr(a, "instance", "?")
    try:
        if os.geteuid() != 0: raise Fail("run as root (the chassis acts AS each instance user via runuser)")
        if a.cmd == "launch":
            a.mode_given = a.mode is not None; a.mode = a.mode or "attended"
        if a.cmd == "canary" and not a.mark and (not a.nonce or a.from_offset < 0):
            raise Fail("canary watch needs --nonce and --from-offset (the offset is what stops the caller mistaking its own echo for an arrival)")
        o = {"launch": cmd_launch, "land": cmd_land, "canary": cmd_canary, "ring": cmd_ring,
             "sentinel": cmd_sentinel, "status": cmd_status}[a.cmd](a)
    except Fail as f:
        o = result("error", iid, str(f), "n/a" if a.cmd == "land" else None, **f.extra)
    except Exception as e:                    # the one-JSON-object promise, enforced, not remembered
        o = result("error", iid, f"UNHANDLED: {type(e).__name__}: {e}. STATE UNKNOWN -- check processes before acting.",
                   "n/a" if a.cmd == "land" else None)
    emit(o)

if __name__ == "__main__":
    main()
