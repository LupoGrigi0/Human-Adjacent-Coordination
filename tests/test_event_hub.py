#!/usr/bin/env python3
"""
HACS Event Hub — Automated Validation Suite
============================================
Validates the Event Hub against docs/EVENT-HUB-CONTRACT.md (v1) — the
6 spec tests from Messenger-Event-Hub-Spec.md plus extras:

  T1  Notification-shape — delivered events carry ONLY {channel,from,count,ts,thread_id?}.
      A smuggled 50KB "body" field must be stripped and never reach the chassis
      or the counter state file.
  T2  Counter/flood — 100 concurrent publishes on one {channel,from}: all ok,
      counter==100, exactly ONE active notification, zero added latency
      (first notification < 1.5s after t0), publish p95 < 0.5s.
  T3  Drain semantics — drain returns counts and clears; peek does not clear;
      publish after drain frees the slot (new notification); arrivals while
      active bump the counter with no second notification.
  T4  Telegram round-trip — inbound update -> thin notification with thread_id
      -> reply_channel -> sendMessage observed at the mock. Reply to a dead
      thread (chat 999999) surfaces ok:false with error detail (H-02).
  T5  Driver-contract — the sample driver publishes end-to-end with no hub
      change (skipped with a note unless DRIVER_SAMPLE_CMD is set).
  T6  Resilience — malformed JSON -> 400 then recovery; missing target ->
      clean error; 5MB body -> notification still thin; chassis 500 ->
      publish still ok + queryable failure; wrong X-Hub-Secret -> 403.
  Extras — corrupt .hacs-events.json quarantined (.corrupt-*) — exercised on a
      SECOND fresh instance (EvtHubTestB-<epoch>) because quarantine only fires
      on an instance's FIRST counter-file load; email driver end-to-end (skipped
      unless EMAIL_DRIVER_RUNNING), ts monotone per channel.

Test doubles (spawned as subprocesses from tests/helpers/):
  stub_chassis.py  --port 22099 --record <received.jsonl>   (fake channel.mjs intake)
  mock_telegram.py --port 22098 --queue <queue.json> --sent <sent.jsonl>

Uses DEDICATED TEST INSTANCES (EvtHubTest-<epoch>, plus EvtHubTestB-<epoch> for
the corrupt-counter-file test) only — never touches real instances. File
assertions run under V2_DATA_ROOT (default /mnt/coordinaton_mcp_data/), so the
suite must run on the hub's host.

Hub HTTP surface: nginx does NOT proxy /hub (loopback-only by design), so the
suite cannot derive it from a public API origin. HUB_URL env wins; otherwise a
non-local API host defaults the hub base to https://127.0.0.1:3444; a local API
host reuses the API origin (contract §8).

T4 (telegram round-trip) is gated behind TELEGRAM_DRIVER_RUNNING=1 — skipped
with a note otherwise, mirroring the email driver gate — so hub-only runs stay
green. When enabled, the telegram driver must be running with:
    TELEGRAM_API_BASE=http://127.0.0.1:22098 TELEGRAM_DISCOVERY_MS=2000
The driver only polls instances whose <instanceDir>/.env contains a
TELEGRAM_BOT_TOKEN (discovered every TELEGRAM_DISCOVERY_MS) — the suite writes
that .env during identity setup, and waits max(15s, 3x discovery) for inbound.

Usage:
    python3 test_event_hub.py [API_URL]
    python3 test_event_hub.py https://smoothcurves.nexus/mcp

Design follows the Regression Test Engineer role (Ember/Axiom pattern):
- JSON-RPC helpers with assert_success / assert_failure
- TestRunner with pass/fail/skip counting
- Read-back verification on all mutations
- Clean teardown with created-resource tracking (cleanup never asserts)
- Cascading skip guards

Stdlib only — no third-party imports.

@author Event Hub build crew (Crossing-2d23 branch)
@date 2026-08-02
"""

import atexit
import glob
import json
import os
import shlex
import shutil
import ssl
import subprocess
import sys
import tempfile
import time
import traceback
import urllib.error
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
API_URL = sys.argv[1] if len(sys.argv) > 1 else "https://smoothcurves.nexus/mcp"
TIMESTAMP = str(int(time.time()))

# Hub HTTP surface (contract §2, §8). nginx does NOT proxy /hub — it is
# loopback-only by design — so the public API origin is NOT a usable hub base.
# HUB_URL env override wins; else a non-local API host means the hub must be
# reached at the local node origin (https://127.0.0.1:3444); else (API already
# local) reuse the API origin. All hub calls go through http_request, which
# uses the suite's unverified SSL context (self-signed loopback TLS).
_parsed = urllib.parse.urlparse(API_URL)
_api_host = _parsed.hostname or ""
if os.environ.get("HUB_URL"):
    HUB_ORIGIN = os.environ["HUB_URL"].rstrip("/")
elif _api_host not in ("127.0.0.1", "localhost"):
    HUB_ORIGIN = "https://127.0.0.1:3444"
else:
    HUB_ORIGIN = f"{_parsed.scheme}://{_parsed.netloc}"
HUB_PUBLISH_URL = f"{HUB_ORIGIN}/hub/publish"

# All file assertions live under DATA_ROOT (contract §3, §8)
DATA_ROOT = os.environ.get("V2_DATA_ROOT", "/mnt/coordinaton_mcp_data/")
HUB_SECRET_FILE = os.environ.get("HUB_SECRET_FILE", "/mnt/coordinaton_mcp_data/.hub-secret")

# Test instance — unique per run, swept by the crash-sweep when stale
TEST_NAME = f"EvtHubTest-{TIMESTAMP}"
TEST_ID = None          # set by bootstrap
INSTANCE_DIR = None     # <DATA_ROOT>/instances/<TEST_ID>
EVENTS_FILE = None      # <INSTANCE_DIR>/.hacs-events.json

# Second, NEVER-published-to-before instance for the corrupt-counter-file test:
# quarantine only happens on the FIRST load of an instance's .hacs-events.json,
# so it needs an instance the hub has not touched yet (test 8.1). Created on
# disk directly (identity file only) — cleaned up with the main instance and
# covered by the EvtHubTest* crash sweep.
SECOND_ID = f"EvtHubTestB-{TIMESTAMP}"
SECOND_DIR = os.path.join(DATA_ROOT, "instances", SECOND_ID)
EVENTS_FILE_B = os.path.join(SECOND_DIR, ".hacs-events.json")

# Test doubles (helper CLI contract — ports are fixed so a test deployment
# can point the telegram driver at the mock before this suite starts).
# 22098/22099 — the 210xx range is occupied by a live manual test channel.
STUB_PORT = 22099       # matches channelPort in the test instance's .hacs-identity
TG_PORT = 22098
TG_CHAT_ID = 424242     # "good" telegram chat; 999999 is the mock's dead thread
# T4 assumes the driver runs with TELEGRAM_DISCOVERY_MS=2000 (suite header);
# honor an override so the inbound wait scales with the actual interval.
TG_DISCOVERY_MS = int(os.environ.get("TELEGRAM_DISCOVERY_MS", "2000"))
TESTS_DIR = os.path.dirname(os.path.abspath(__file__))
TMPDIR = tempfile.mkdtemp(prefix=f"evt-hub-test-{TIMESTAMP}-")
RECORD_FILE = os.path.join(TMPDIR, "received.jsonl")     # stub chassis record
TG_QUEUE = os.path.join(TMPDIR, "queue.json")            # mock telegram inbound queue
TG_SENT = os.path.join(TMPDIR, "sent.jsonl")             # mock telegram sendMessage log
STUB_CONTROL = f"http://127.0.0.1:{STUB_PORT}/_control"

# 50KB smuggled body with a unique marker so we can grep every surface for leaks
SMUGGLE_MARKER = f"BODY-SMUGGLE-MARKER-{TIMESTAMP}"
SMUGGLE = SMUGGLE_MARKER + ("X" * (50 * 1024))

FLOOD_N = 100

HUB_SECRET = None       # read from HUB_SECRET_FILE during setup

# Skip guards (cascading — a failed setup step skips everything downstream)
_bootstrap_ok = False
_identity_ok = False
_secret_ok = False
_stub_ok = False
_tg_ok = False
_hub_ok = False

# Cross-test state
_shape_ok = False
_flood_t0 = None
_flood_times = []
_drain_cleared = False
_tg_thread_id = None

# Spawned subprocesses (helpers + optional sample driver) — killed in
# cleanup AND via atexit so a crashed run never leaks listeners.
PROCS = []

# TLS: production endpoint may use a self-signed cert — don't verify
SSL_CTX = ssl.create_default_context()
SSL_CTX.check_hostname = False
SSL_CTX.verify_mode = ssl.CERT_NONE


def _kill_procs():
    """Terminate every subprocess we spawned. Safe to call repeatedly."""
    for p in PROCS:
        try:
            if p.poll() is None:
                p.terminate()
        except Exception:
            pass
    deadline = time.time() + 3
    for p in PROCS:
        try:
            while p.poll() is None and time.time() < deadline:
                time.sleep(0.05)
            if p.poll() is None:
                p.kill()
        except Exception:
            pass


atexit.register(_kill_procs)

# ---------------------------------------------------------------------------
# HTTP + JSON-RPC helpers (Regression Test Engineer pattern, stdlib flavor)
# ---------------------------------------------------------------------------


def http_request(method, url, body=None, headers=None, timeout=30, raw=None):
    """Stdlib HTTP helper. Returns {status, data, text, elapsed}.
    status==0 means transport error (connection refused, timeout, ...)."""
    data = raw if raw is not None else (json.dumps(body).encode("utf-8") if body is not None else None)
    hdrs = {"Content-Type": "application/json"}
    if headers:
        hdrs.update(headers)
    req = urllib.request.Request(url, data=data, headers=hdrs, method=method)
    t0 = time.time()
    try:
        with urllib.request.urlopen(req, timeout=timeout, context=SSL_CTX) as resp:
            text = resp.read().decode("utf-8", "replace")
            status = resp.status
    except urllib.error.HTTPError as e:
        # Non-2xx still carries a body (the hub's {ok:false, error} shapes)
        try:
            text = e.read().decode("utf-8", "replace")
        except Exception:
            text = ""
        status = e.code
    except Exception as e:
        return {"status": 0, "data": None, "text": str(e), "elapsed": time.time() - t0}
    try:
        parsed = json.loads(text)
    except (json.JSONDecodeError, ValueError):
        parsed = None
    return {"status": status, "data": parsed, "text": text, "elapsed": time.time() - t0}


def rpc_call(method, params, timeout=30):
    """Send a JSON-RPC tools/call request and return normalized result."""
    r = http_request("POST", API_URL, body={
        "jsonrpc": "2.0", "id": 1,
        "method": "tools/call",
        "params": {"name": method, "arguments": params}
    }, timeout=timeout)
    if r["status"] == 0 or r["data"] is None:
        return {"data": {"success": False, "error": r["text"][:300]}, "elapsed": r["elapsed"], "raw": None}
    raw = r["data"]
    elapsed = r["elapsed"]
    result = raw.get("result", raw) if isinstance(raw, dict) else raw

    # Path 1: result.data with success key
    if isinstance(result, dict) and "data" in result and isinstance(result["data"], dict):
        return {"data": result["data"], "elapsed": elapsed, "raw": raw}

    # Path 2: result.content[0].text (JSON-stringified)
    if isinstance(result, dict) and "content" in result:
        try:
            text = result["content"][0]["text"]
            parsed = json.loads(text)
            return {"data": parsed, "elapsed": elapsed, "raw": raw}
        except (KeyError, IndexError, json.JSONDecodeError, TypeError):
            pass

    # Path 3: result itself has success key
    if isinstance(result, dict) and "success" in result:
        return {"data": result, "elapsed": elapsed, "raw": raw}

    # Fallback
    return {"data": result if isinstance(result, dict) else {"_raw": result}, "elapsed": elapsed, "raw": raw}


def assert_success(result, msg=""):
    """Assert success=true. Returns data dict."""
    data = result["data"]
    if not data.get("success"):
        err_detail = json.dumps(data)[:300]
        raise AssertionError(f"Expected success=true{': ' + msg if msg else ''} -- got: {err_detail}")
    return data


def assert_failure(result, msg=""):
    """Assert success is NOT true. Returns data dict."""
    data = result["data"]
    if data.get("success") is True:
        err_detail = json.dumps(data)[:300]
        raise AssertionError(f"Expected failure{': ' + msg if msg else ''} -- got success: {err_detail}")
    return data


def hub_publish(payload, secret=None, timeout=30):
    """POST to the hub's HTTP publish surface with the shared secret header."""
    return http_request("POST", HUB_PUBLISH_URL, body=payload,
                        headers={"X-Hub-Secret": secret if secret is not None else (HUB_SECRET or "")},
                        timeout=timeout)


def _reply_result(data):
    """reply_channel returns the driver result VERBATIM (contract §5) — but
    tolerate one level of transport wrapping around the {ok,...} shape."""
    if isinstance(data, dict) and "ok" in data:
        return data
    if isinstance(data, dict):
        for key in ("result", "data"):
            inner = data.get(key)
            if isinstance(inner, dict) and "ok" in inner:
                return inner
    return data if isinstance(data, dict) else {}


# ---------------------------------------------------------------------------
# Test-double observation helpers
# ---------------------------------------------------------------------------


def _read_jsonl(path):
    """Parse a JSONL file, skipping torn/partial lines (append-only files)."""
    out = []
    try:
        with open(path, "r") as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                try:
                    out.append(json.loads(line))
                except json.JSONDecodeError:
                    continue
    except OSError:
        pass
    return out


def stub_records():
    """All records the stub chassis has received (POST /broker-event)."""
    return _read_jsonl(RECORD_FILE)


def _notifs(channel=None, frm=None):
    """Notification-type records at the stub, optionally filtered."""
    out = []
    for rec in stub_records():
        body = rec.get("body") or {}
        if body.get("event_type") != "notification":
            continue
        n = body.get("notification") or {}
        if channel is not None and n.get("channel") != channel:
            continue
        if frm is not None and n.get("from") != frm:
            continue
        out.append(rec)
    return out


def _sent_records():
    """sendMessage calls recorded by the mock telegram server."""
    return _read_jsonl(TG_SENT)


def read_events_file():
    """Parse the instance's .hacs-events.json counter file (contract §3)."""
    try:
        with open(EVENTS_FILE, "r") as f:
            return json.load(f)
    except (OSError, json.JSONDecodeError, TypeError):
        return {}


def _slot(channel, frm):
    """The {count,status,...} slot for one {channel,from}, or None."""
    return read_events_file().get(channel, {}).get(frm)


def wait_until(fn, timeout=10.0, interval=0.1):
    """Poll fn() until truthy or timeout. Returns fn's value or None."""
    deadline = time.time() + timeout
    while True:
        val = fn()
        if val:
            return val
        if time.time() >= deadline:
            return None
        time.sleep(interval)


def _require(cond, why):
    if not cond:
        raise RuntimeError(f"SKIP: {why}")


def _require_core():
    """Guard for every test that publishes and observes notifications."""
    _require(_bootstrap_ok, "bootstrap failed")
    _require(_identity_ok, "identity/mailbox setup failed")
    _require(_secret_ok, "hub secret unavailable")
    _require(_stub_ok, "stub chassis not running")
    _require(_hub_ok, "hub publish smoke test failed")


def spawn_helper(script, args):
    """Spawn a test-double script (tests/helpers/, or next to this suite)."""
    path = os.path.join(TESTS_DIR, "helpers", script)
    if not os.path.exists(path):
        path = os.path.join(TESTS_DIR, script)
    if not os.path.exists(path):
        raise RuntimeError(f"SKIP: helper {script} not found in {TESTS_DIR} or {TESTS_DIR}/helpers")
    log = open(os.path.join(TMPDIR, script + ".log"), "ab")
    proc = subprocess.Popen([sys.executable, path] + args, stdout=log, stderr=subprocess.STDOUT)
    PROCS.append(proc)
    return proc


def wait_health(port, timeout=10.0):
    """Wait for a helper's GET /health to answer {"ok": true}."""
    def probe():
        r = http_request("GET", f"http://127.0.0.1:{port}/health", timeout=2)
        return r["status"] == 200 and isinstance(r["data"], dict) and r["data"].get("ok")
    return bool(wait_until(probe, timeout=timeout, interval=0.2))


def _query_hub_status():
    """Fetch the hub's queryable-failure surface (hub.getStatus(), contract §6).
    Tries the HTTP surface first, then MCP tool names. Returns the status dict
    (containing lastErrors) or None if no surface responded."""
    r = http_request("GET", f"{HUB_ORIGIN}/hub/status",
                     headers={"X-Hub-Secret": HUB_SECRET or ""}, timeout=10)
    if r["status"] == 200 and isinstance(r["data"], dict):
        d = r["data"]
        if "lastErrors" in d:
            return d
        inner = d.get("status") or d.get("hub") or d.get("data")
        if isinstance(inner, dict) and "lastErrors" in inner:
            return inner
    for tool in ("hub_status", "get_hub_status"):
        rr = rpc_call(tool, {})
        d = rr["data"]
        if isinstance(d, dict):
            if "lastErrors" in d:
                return d
            for key in ("status", "hub", "data"):
                inner = d.get(key)
                if isinstance(inner, dict) and "lastErrors" in inner:
                    return inner
    return None


# ---------------------------------------------------------------------------
# TestRunner (from Regression Test Engineer pattern)
# ---------------------------------------------------------------------------

class TestRunner:
    def __init__(self):
        self.passed = 0
        self.failed = 0
        self.skipped = 0
        self.errors = []
        self.timings = []
        # Resource tracking for cleanup
        self.created_instance_ids = []
        self.publishes_sent = 0

    def run(self, label, fn):
        """Run a single test function."""
        try:
            fn()
            self.passed += 1
            print(f"  PASS  {label}")
        except RuntimeError as e:
            if str(e).startswith("SKIP:"):
                self.skipped += 1
                print(f"  SKIP  {label}: {str(e)[5:].strip()}")
            else:
                self.failed += 1
                tb = traceback.format_exc()
                self.errors.append((label, str(e), tb))
                print(f"  FAIL  {label}: {e}")
        except Exception as e:
            self.failed += 1
            tb = traceback.format_exc()
            self.errors.append((label, str(e), tb))
            print(f"  FAIL  {label}: {e}")

    def log_timing(self, label, elapsed):
        self.timings.append((label, elapsed))

    def summary(self):
        total = self.passed + self.failed + self.skipped
        print("\n" + "=" * 70)
        skip_str = f", {self.skipped} skipped" if self.skipped else ""
        print(f"RESULTS: {self.passed}/{total} passed, {self.failed} failed{skip_str}")
        if self.errors:
            print("\nFailed tests:")
            for name, err, tb in self.errors:
                print(f"  - {name}: {err}")
                for line in tb.strip().split("\n")[-3:]:
                    print(f"      {line}")
        if self.timings:
            print("\nTimings:")
            for label, elapsed in self.timings:
                print(f"  {label}: {elapsed:.3f}s")
        print("=" * 70)
        return self.failed == 0


runner = TestRunner()

# ===========================================================================
# SECTION 1: SETUP — crash-sweep, test instance, secret, test doubles
# ===========================================================================

print("\n" + "=" * 70)
print("SECTION 1: SETUP — crash-sweep, test instance, secret, test doubles")
print("=" * 70)
print(f"  API:        {API_URL}")
print(f"  Hub:        {HUB_PUBLISH_URL}")
print(f"  DATA_ROOT:  {DATA_ROOT}")
print(f"  TMPDIR:     {TMPDIR}")


def test_crash_sweep():
    """Delete leftover EvtHubTest* instance dirs (covers both EvtHubTest-<epoch>
    and EvtHubTestB-<epoch>) from CRASHED runs only (older than 2h). Never
    touches anything else under instances/."""
    inst_root = os.path.join(DATA_ROOT, "instances")
    swept = 0
    for path in glob.glob(os.path.join(inst_root, "EvtHubTest*")):
        if not os.path.isdir(path):
            continue
        try:
            age = time.time() - os.path.getmtime(path)
        except OSError:
            continue
        if age > 2 * 3600:
            shutil.rmtree(path, ignore_errors=True)
            swept += 1
    print(f"         (swept {swept} stale EvtHubTest* dirs)")


def test_bootstrap_instance():
    """Bootstrap the dedicated test instance via the production API."""
    global TEST_ID, INSTANCE_DIR, EVENTS_FILE, _bootstrap_ok
    r = rpc_call("bootstrap", {"name": TEST_NAME})
    data = assert_success(r, "bootstrap event-hub test instance")
    TEST_ID = data.get("instanceId")
    assert TEST_ID, f"No instanceId returned: {json.dumps(data)[:300]}"
    INSTANCE_DIR = os.path.join(DATA_ROOT, "instances", TEST_ID)
    EVENTS_FILE = os.path.join(INSTANCE_DIR, ".hacs-events.json")
    runner.created_instance_ids.append(TEST_ID)
    _bootstrap_ok = True
    runner.log_timing("bootstrap_test_instance", r["elapsed"])
    print(f"         (test instance: {TEST_ID})")


def test_write_identity():
    """Write .hacs-identity pointing chassis delivery at our stub (contract §4:
    channelPort is re-read on EVERY delivery — this is the test hook), create
    the maildir the email driver watches, and write <INSTANCE_DIR>/.env with a
    TELEGRAM_BOT_TOKEN so the telegram driver's discovery loop (which only
    polls instances with a token in .env) picks this instance up for T4."""
    global _identity_ok
    _require(_bootstrap_ok, "bootstrap failed")
    os.makedirs(os.path.join(INSTANCE_DIR, "mail", "new"), exist_ok=True)
    with open(os.path.join(INSTANCE_DIR, ".hacs-identity"), "w") as f:
        json.dump({"instanceId": TEST_ID, "chassis": "claude-code-channel",
                   "channelPort": STUB_PORT}, f)
    with open(os.path.join(INSTANCE_DIR, ".env"), "w") as f:
        f.write(f"TELEGRAM_BOT_TOKEN=TESTTOKEN{TIMESTAMP}\n")
    # Interrupt policy (contract §10): custom channels default QUIET, so the
    # suite opts its own channels into interrupt via preferences.json — which
    # also exercises the prefs-resolution path on every delivery below.
    # 'email' and 'hacs' are deliberately ABSENT: Section 10 tests defaults.
    # 'telegram' is deliberately ABSENT too (2026-08-04): its system default is
    # now interrupt=true, so T4's delivery rides — and thereby verifies — the
    # default rather than a prefs opt-in.
    suite_channels = ["smoke", "shape", "flood", "drainq",
                      "resil", "mono", "bigbody", "corruptch", "sample", "waketest"]
    prefs_path = os.path.join(INSTANCE_DIR, "preferences.json")
    prefs = {}
    if os.path.exists(prefs_path):
        try:
            with open(prefs_path) as f:
                prefs = json.load(f)
        except (json.JSONDecodeError, OSError):
            prefs = {}
    prefs.setdefault("notifications", {})
    for ch in suite_channels:
        prefs["notifications"][ch] = {"interrupt": True}
    with open(prefs_path, "w") as f:
        json.dump(prefs, f)
    _identity_ok = True


def test_read_hub_secret():
    """Read the shared secret the hub HTTP surface requires (contract §2)."""
    global HUB_SECRET, _secret_ok
    with open(HUB_SECRET_FILE, "r") as f:
        HUB_SECRET = f.read().strip()
    assert HUB_SECRET, f"secret file {HUB_SECRET_FILE} is empty"
    _secret_ok = True


def test_spawn_stub_chassis():
    """Spawn the stub chassis intake (fake channel.mjs /broker-event)."""
    global _stub_ok
    open(RECORD_FILE, "a").close()
    spawn_helper("stub_chassis.py", ["--port", str(STUB_PORT), "--record", RECORD_FILE])
    assert wait_health(STUB_PORT), f"stub chassis /health never answered on :{STUB_PORT}"
    _stub_ok = True


def test_spawn_mock_telegram():
    """Spawn the mock Telegram Bot API (getUpdates queue + sendMessage log)."""
    global _tg_ok
    with open(TG_QUEUE, "w") as f:
        f.write("[]")
    open(TG_SENT, "a").close()
    spawn_helper("mock_telegram.py", ["--port", str(TG_PORT), "--queue", TG_QUEUE, "--sent", TG_SENT])
    assert wait_health(TG_PORT), f"mock telegram /health never answered on :{TG_PORT}"
    _tg_ok = True


def test_smoke_publish():
    """One publish through the HTTP surface proves the hub is up and the
    secret is right, before the real tests lean on it."""
    global _hub_ok
    _require(_bootstrap_ok and _identity_ok and _secret_ok, "setup incomplete")
    r = hub_publish({"target": TEST_ID, "channel": "smoke", "from": "smoketest",
                     "ref": f"smoke-ref-{TIMESTAMP}"})
    assert r["status"] == 200, f"publish HTTP {r['status']}: {r['text'][:200]}"
    assert r["data"] and r["data"].get("ok") is True, f"publish not ok: {r['text'][:200]}"
    assert isinstance(r["data"].get("counter"), int), f"missing int counter: {r['text'][:200]}"
    runner.publishes_sent += 1
    _hub_ok = True
    runner.log_timing("smoke_publish", r["elapsed"])
    # Free the smoke slot so it doesn't sit active for the whole run
    rpc_call("drain_events", {"instanceId": TEST_ID, "channel": "smoke"})


runner.run("1.1 Crash-sweep stale EvtHubTest* dirs (>2h only)", test_crash_sweep)
runner.run("1.2 Bootstrap test instance via API", test_bootstrap_instance)
runner.run("1.3 Write .hacs-identity + mail/new + .env token", test_write_identity)
runner.run("1.4 Read hub secret", test_read_hub_secret)
runner.run(f"1.5 Spawn stub chassis (:{STUB_PORT})", test_spawn_stub_chassis)
runner.run(f"1.6 Spawn mock telegram (:{TG_PORT})", test_spawn_mock_telegram)
runner.run("1.7 Hub publish smoke test", test_smoke_publish)


# ===========================================================================
# SECTION 2: T1 NOTIFICATION SHAPE — thin events, no body, ever
# ===========================================================================

print("\n" + "=" * 70)
print("SECTION 2: T1 NOTIFICATION SHAPE — thin events, no body, ever")
print("=" * 70)


def test_smuggled_body_publish():
    """Publish with a smuggled 50KB 'body' field. Unknown extra fields are
    STRIPPED, never forwarded (contract §1) — the publish itself succeeds."""
    global _shape_ok
    _require_core()
    r = hub_publish({"target": TEST_ID, "channel": "shape",
                     "from": "shape-sender@example.com",
                     "ref": "shape-ref-1", "body": SMUGGLE})
    assert r["status"] == 200 and r["data"] and r["data"].get("ok") is True, \
        f"publish with extra body field must still succeed: HTTP {r['status']} {r['text'][:200]}"
    runner.publishes_sent += 1
    _shape_ok = True


def test_notification_is_thin():
    """The delivered notification carries EXACTLY {channel,from,count,ts}
    (no thread_id was sent) — invariant 1."""
    _require(_shape_ok, "smuggled-body publish failed")
    got = wait_until(lambda: _notifs("shape") or None, timeout=10)
    assert got, "notification never reached the stub chassis"
    body = got[-1]["body"]
    assert body.get("event_type") == "notification", \
        f"expected event_type=notification, got: {json.dumps(body)[:200]}"
    n = body.get("notification") or {}
    assert set(n.keys()) == {"channel", "from", "count", "ts"}, \
        f"notification keys must be exactly channel/from/count/ts, got {sorted(n.keys())}"
    assert n["channel"] == "shape" and n["from"] == "shape-sender@example.com"
    assert isinstance(n["count"], int) and n["count"] >= 1
    assert isinstance(n["ts"], (int, float))
    assert SMUGGLE_MARKER not in json.dumps(body), \
        "smuggled body content leaked into the delivered notification"


def test_events_file_has_no_body():
    """The counter state file stores refs/counts only — never a body."""
    _require(_shape_ok, "smuggled-body publish failed")
    got = wait_until(lambda: (os.path.exists(EVENTS_FILE) and "shape" in read_events_file()) or None,
                     timeout=10)
    assert got, ".hacs-events.json never gained the shape slot"
    with open(EVENTS_FILE, "r") as f:
        raw = f.read()
    assert SMUGGLE_MARKER not in raw, "smuggled body content leaked into .hacs-events.json"
    assert '"body"' not in raw, ".hacs-events.json must not contain a body key"


runner.run("2.1 Publish with smuggled 50KB body field succeeds", test_smuggled_body_publish)
runner.run("2.2 Delivered notification is thin (exact key set)", test_notification_is_thin)
runner.run("2.3 .hacs-events.json contains no body", test_events_file_has_no_body)


# ===========================================================================
# SECTION 3: T2 COUNTER / FLOOD — 100 concurrent, one notification, no latency
# ===========================================================================

print("\n" + "=" * 70)
print("SECTION 3: T2 COUNTER/FLOOD — 100 concurrent publishes, one {channel,from}")
print("=" * 70)


def test_flood_publishes():
    """Fire 100 publishes on the same {channel,from} from 10 threads.
    Every one must return {ok:true} — counter increments are atomic
    (edge case: near-simultaneous publishes, no lost update)."""
    global _flood_t0, _flood_times
    _require_core()
    assert len(_notifs("flood", "flooder")) == 0, "flood channel not clean at start"

    def one(i):
        return hub_publish({"target": TEST_ID, "channel": "flood", "from": "flooder",
                            "ref": f"flood-ref-{i}"})

    _flood_t0 = time.time()
    with ThreadPoolExecutor(max_workers=10) as ex:
        results = list(ex.map(one, range(FLOOD_N)))
    wall = time.time() - _flood_t0
    runner.publishes_sent += FLOOD_N
    _flood_times = sorted(r["elapsed"] for r in results)
    bad = [i for i, r in enumerate(results)
           if not (r["status"] == 200 and r["data"] and r["data"].get("ok") is True)]
    assert not bad, f"{len(bad)} of {FLOOD_N} publishes failed (first: #{bad[0]})"
    runner.log_timing(f"flood_{FLOOD_N}_publishes_wall", wall)
    print(f"         ({FLOOD_N} publishes in {wall:.2f}s = {FLOOD_N / wall:.1f}/s)")


def test_flood_counter_100():
    """Counter file converges to exactly 100 — zero dropped counts."""
    _require(_flood_t0 is not None, "flood publishes failed")
    got = wait_until(lambda: ((_slot("flood", "flooder") or {}).get("count") == FLOOD_N) or None,
                     timeout=10)
    assert got, f"counter never reached {FLOOD_N}: slot={_slot('flood', 'flooder')}"


def test_flood_single_notification():
    """Exactly ONE active notification while unacked — invariant 2."""
    _require(_flood_t0 is not None, "flood publishes failed")
    time.sleep(2.0)  # settle: any extra (wrong) notifications would land by now
    n_count = len(_notifs("flood", "flooder"))
    assert n_count == 1, f"expected exactly 1 active notification for the flood, saw {n_count}"


def test_flood_zero_latency():
    """First notification dispatched immediately — no debounce window
    (invariant 3). < 1.5s is a generous CI belt; actual delta is printed."""
    _require(_flood_t0 is not None, "flood publishes failed")
    notifs = _notifs("flood", "flooder")
    assert notifs, "no flood notification recorded"
    delta = notifs[0]["recv_ts"] - _flood_t0
    runner.log_timing("flood_first_notification_delta", delta)
    print(f"         (first notification {delta:.3f}s after t0)")
    assert delta < 1.5, f"first notification took {delta:.3f}s — hub is adding latency"


def test_flood_publish_p95():
    """publish() is a sync counter + async dispatch — calls stay fast."""
    _require(bool(_flood_times), "flood publishes failed")
    p95 = _flood_times[int(FLOOD_N * 0.95) - 1]
    runner.log_timing("flood_publish_p95", p95)
    print(f"         (publish p50={_flood_times[FLOOD_N // 2]:.3f}s p95={p95:.3f}s)")
    assert p95 < 0.5, f"publish p95 {p95:.3f}s exceeds 0.5s budget"


runner.run("3.1 100 concurrent publishes all return ok", test_flood_publishes)
runner.run("3.2 Counter file shows count==100 (no lost updates)", test_flood_counter_100)
runner.run("3.3 Exactly 1 active notification while unacked", test_flood_single_notification)
runner.run("3.4 First notification < 1.5s after t0 (zero added latency)", test_flood_zero_latency)
runner.run("3.5 Publish call p95 < 0.5s", test_flood_publish_p95)


# ===========================================================================
# SECTION 4: T3 DRAIN SEMANTICS — clear, peek, slot freeing
# ===========================================================================

print("\n" + "=" * 70)
print("SECTION 4: T3 DRAIN SEMANTICS — clear, peek, slot freeing")
print("=" * 70)


def test_drain_publish_five():
    """Publish 5 on a fresh {channel,from}: one notification, counter 5."""
    _require_core()
    assert len(_notifs("drainq", "drainer")) == 0, "drainq channel not clean at start"
    for i in range(5):
        r = hub_publish({"target": TEST_ID, "channel": "drainq", "from": "drainer",
                         "ref": f"drain-ref-{i}"})
        assert r["data"] and r["data"].get("ok") is True, \
            f"publish {i + 1}/5 failed: HTTP {r['status']} {r['text'][:200]}"
        runner.publishes_sent += 1
    got = wait_until(lambda: ((_slot("drainq", "drainer") or {}).get("count") == 5) or None,
                     timeout=10)
    assert got, f"counter never reached 5: slot={_slot('drainq', 'drainer')}"
    time.sleep(1.5)  # settle window for stray notifications
    n_count = len(_notifs("drainq", "drainer"))
    assert n_count == 1, f"expected 1 notification for 5 publishes, saw {n_count}"


def test_drain_returns_and_clears():
    """drain_events returns count 5 and clears the slot (memory + file)."""
    global _drain_cleared
    _require_core()
    r = rpc_call("drain_events", {"instanceId": TEST_ID, "channel": "drainq", "from": "drainer"})
    data = assert_success(r, "drain_events")
    ev = (data.get("events") or {}).get("drainq", {}).get("drainer", {})
    assert ev.get("count") == 5, f"drain should report count 5, got: {json.dumps(data)[:300]}"
    assert data.get("cleared") is True, f"drain should clear, got cleared={data.get('cleared')}"
    gone = wait_until(
        lambda: (lambda s: s is None or s.get("count") == 0)(_slot("drainq", "drainer")) or None,
        timeout=10)
    assert gone, f"counter file not cleared after drain: slot={_slot('drainq', 'drainer')}"
    _drain_cleared = True
    runner.log_timing("drain_events", r["elapsed"])


def test_publish_after_drain_renotifies():
    """Drain frees the active slot — the next publish notifies again."""
    _require(_drain_cleared, "drain did not clear")
    base = len(_notifs("drainq", "drainer"))
    r = hub_publish({"target": TEST_ID, "channel": "drainq", "from": "drainer",
                     "ref": "drain-ref-post"})
    assert r["data"] and r["data"].get("ok") is True, f"post-drain publish failed: {r['text'][:200]}"
    runner.publishes_sent += 1
    got = wait_until(lambda: (len(_notifs("drainq", "drainer")) > base) or None, timeout=10)
    assert got, "no NEW notification after drain freed the slot"


def test_peek_does_not_clear():
    """peek:true returns the counts but leaves the slot intact."""
    _require(_drain_cleared, "drain did not clear")
    before = _slot("drainq", "drainer")
    assert before and before.get("count", 0) >= 1, f"expected an active slot, got {before}"
    r = rpc_call("drain_events", {"instanceId": TEST_ID, "channel": "drainq",
                                  "from": "drainer", "peek": True})
    data = assert_success(r, "drain_events peek")
    assert data.get("cleared") is False, f"peek must not clear, got cleared={data.get('cleared')}"
    ev = (data.get("events") or {}).get("drainq", {}).get("drainer", {})
    assert ev.get("count") == before["count"], \
        f"peek should report count {before['count']}, got {ev.get('count')}"
    after = _slot("drainq", "drainer")
    assert after and after.get("count") == before["count"], \
        f"peek must leave the counter file untouched: before={before} after={after}"


def test_unacked_bump_no_second_notification():
    """While a notification is unacked, further publishes bump the counter
    only — no second interrupt (invariant 2 again, post-drain slot)."""
    _require(_drain_cleared, "drain did not clear")
    base_notifs = len(_notifs("drainq", "drainer"))
    c0 = (_slot("drainq", "drainer") or {}).get("count", 0)
    assert c0 >= 1, "expected the slot to still be active"
    for i in range(2):
        r = hub_publish({"target": TEST_ID, "channel": "drainq", "from": "drainer",
                         "ref": f"drain-ref-bump-{i}"})
        assert r["data"] and r["data"].get("ok") is True
        runner.publishes_sent += 1
    got = wait_until(lambda: ((_slot("drainq", "drainer") or {}).get("count", 0) == c0 + 2) or None,
                     timeout=10)
    assert got, f"counter did not bump to {c0 + 2}: slot={_slot('drainq', 'drainer')}"
    time.sleep(1.5)  # settle window
    now_notifs = len(_notifs("drainq", "drainer"))
    assert now_notifs == base_notifs, \
        f"arrivals while active must NOT notify again ({base_notifs} -> {now_notifs})"


runner.run("4.1 Publish 5 -> one notification, counter 5", test_drain_publish_five)
runner.run("4.2 drain_events returns count 5 and clears", test_drain_returns_and_clears)
runner.run("4.3 Publish after drain -> NEW notification (slot freed)", test_publish_after_drain_renotifies)
runner.run("4.4 peek:true does not clear", test_peek_does_not_clear)
runner.run("4.5 Unacked publishes bump counter, no second notification", test_unacked_bump_no_second_notification)


# ===========================================================================
# SECTION 5: T4 TELEGRAM ROUND-TRIP — inbound, reply, dead thread (H-02)
# ===========================================================================

print("\n" + "=" * 70)
print("SECTION 5: T4 TELEGRAM ROUND-TRIP — inbound, reply, dead thread (H-02)")
print("=" * 70)


def _require_tg_driver():
    """Gate T4 behind TELEGRAM_DRIVER_RUNNING=1 (mirrors the email driver
    gate) so hub-only runs stay green. The driver only polls instances with a
    TELEGRAM_BOT_TOKEN in their .env, rediscovered every TELEGRAM_DISCOVERY_MS."""
    if not os.environ.get("TELEGRAM_DRIVER_RUNNING"):
        raise RuntimeError(
            "SKIP: TELEGRAM_DRIVER_RUNNING not set — telegram driver not under test "
            f"(run it with TELEGRAM_API_BASE=http://127.0.0.1:{TG_PORT} "
            f"TELEGRAM_DISCOVERY_MS={TG_DISCOVERY_MS})")


def test_telegram_inbound():
    """Enqueue an inbound update at the mock Bot API; the telegram driver
    discovers the test instance (via its .env TELEGRAM_BOT_TOKEN), polls the
    update in, publishes to the hub, and a thin notification WITH thread_id
    lands at the stub chassis. Assumes the driver runs with
    TELEGRAM_API_BASE=http://127.0.0.1:22098 TELEGRAM_DISCOVERY_MS=2000
    (suite header) — the wait below is max(15s, 3x the discovery interval)."""
    global _tg_thread_id
    _require_tg_driver()
    _require_core()
    _require(_tg_ok, "mock telegram not running")
    base = len(_notifs("telegram"))
    now = int(time.time())
    update = {
        "update_id": now,  # large id beats any stale driver offset state
        "message": {
            "message_id": 7001,
            "date": now,
            "chat": {"id": TG_CHAT_ID, "type": "private", "first_name": "Lupo"},
            "from": {"id": TG_CHAT_ID, "is_bot": False, "first_name": "Lupo", "username": "lupo"},
            "text": f"hub round-trip test {TIMESTAMP}",
        },
    }
    # The mock keeps updates queued until the driver acknowledges them by
    # offset (real Bot API semantics) — replace the whole queue atomically so
    # the driver never reads a torn file.
    tmp = TG_QUEUE + ".tmp"
    with open(tmp, "w") as f:
        json.dump([update], f)
    os.replace(tmp, TG_QUEUE)
    # The driver must first DISCOVER the instance (every TELEGRAM_DISCOVERY_MS),
    # then poll: allow 3 discovery intervals, floor 15s.
    wait_s = max(15.0, 3 * TG_DISCOVERY_MS / 1000.0)
    got = wait_until(lambda: (len(_notifs("telegram")) > base) or None, timeout=wait_s)
    assert got, (f"no telegram notification within {wait_s:.0f}s — is the telegram driver "
                 f"running with TELEGRAM_API_BASE=http://127.0.0.1:{TG_PORT} "
                 f"TELEGRAM_DISCOVERY_MS={TG_DISCOVERY_MS}, and has it discovered {TEST_ID} "
                 f"(TELEGRAM_BOT_TOKEN in {INSTANCE_DIR}/.env)?")
    n = _notifs("telegram")[-1]["body"].get("notification") or {}
    assert set(n.keys()) == {"channel", "from", "count", "ts", "thread_id"}, \
        f"bidirectional notification keys must be channel/from/count/ts/thread_id, got {sorted(n.keys())}"
    assert n.get("thread_id"), "telegram notification must carry a thread_id"
    _tg_thread_id = str(n["thread_id"])
    print(f"         (thread_id={_tg_thread_id}, from={n.get('from')!r})")


def test_telegram_reply():
    """reply_channel routes back out through the driver. ok:true is only
    legitimate AFTER the mock recorded the sendMessage (H-02)."""
    _require_tg_driver()
    _require_core()
    _require(_tg_thread_id, "no inbound telegram thread to reply to")
    reply_text = f"round-trip reply {TIMESTAMP}"
    r = rpc_call("reply_channel", {"instanceId": TEST_ID, "channel": "telegram",
                                   "thread_id": _tg_thread_id, "text": reply_text}, timeout=30)
    data = _reply_result(r["data"])
    assert data.get("ok") is True, \
        f"reply_channel should return ok:true, got: {json.dumps(r['data'])[:300]}"
    assert data.get("delivered_via") == "telegram", \
        f"expected delivered_via=telegram, got: {json.dumps(data)[:200]}"
    # ok:true was returned — the sendMessage MUST already be at the mock.
    sent = [s for s in _sent_records() if (s.get("body") or {}).get("text") == reply_text]
    assert sent, "reply_channel said ok:true but the mock never saw sendMessage (H-02 violation)"
    runner.log_timing("reply_channel_roundtrip", r["elapsed"])


def test_telegram_dead_thread():
    """Reply into a dead thread (mock 400s chat 999999): the failure must
    surface as ok:false with detail — never a silent 'sent' (H-02). Needs the
    real driver's outbound registration, so it shares the T4 gate."""
    _require_tg_driver()
    _require_core()
    _require(_tg_ok, "mock telegram not running")
    r = rpc_call("reply_channel", {"instanceId": TEST_ID, "channel": "telegram",
                                   "thread_id": "999999", "text": "reply into the void"}, timeout=30)
    data = _reply_result(r["data"])
    assert data.get("ok") is False, \
        f"H-02: reply to a dead thread must be ok:false, got: {json.dumps(r['data'])[:300]}"
    assert data.get("error"), f"ok:false must carry an error detail, got: {json.dumps(data)[:200]}"
    print(f"         (surfaced error: {str(data.get('error'))[:80]!r})")


runner.run("5.1 Inbound update -> thin notification with thread_id", test_telegram_inbound)
runner.run("5.2 reply_channel delivers via sendMessage, verified", test_telegram_reply)
runner.run("5.3 Reply to dead thread -> ok:false with detail (H-02)", test_telegram_dead_thread)


# ===========================================================================
# SECTION 6: T5 DRIVER CONTRACT — sample driver end-to-end
# ===========================================================================

print("\n" + "=" * 70)
print("SECTION 6: T5 DRIVER CONTRACT — sample driver end-to-end")
print("=" * 70)


def test_sample_driver_end_to_end():
    """Spawn the sample driver (command from DRIVER_SAMPLE_CMD) pointed at a
    temp watch dir inside the test instance dir, drop a file, and assert the
    notification arrives — proving a third party can add a channel with no
    hub or chassis change. The watch dir is passed both as the final argv
    and as DRIVER_WATCH_DIR in the environment."""
    cmd = os.environ.get("DRIVER_SAMPLE_CMD")
    if not cmd:
        raise RuntimeError("SKIP: DRIVER_SAMPLE_CMD not set — sample driver not under test")
    _require_core()
    watch = os.path.join(INSTANCE_DIR, "sample-watch")
    os.makedirs(watch, exist_ok=True)
    env = dict(os.environ)
    env.update({
        "V2_DATA_ROOT": DATA_ROOT,
        "HUB_SECRET_FILE": HUB_SECRET_FILE,
        "HACS_HUB_URL": HUB_ORIGIN,
        "DRIVER_TARGET_INSTANCE": TEST_ID,
        "DRIVER_WATCH_DIR": watch,
    })
    base = len(_notifs())
    log = open(os.path.join(TMPDIR, "sample-driver.log"), "ab")
    proc = subprocess.Popen(shlex.split(cmd) + [watch], env=env,
                            stdout=log, stderr=subprocess.STDOUT)
    PROCS.append(proc)
    try:
        time.sleep(2.0)  # give the watcher time to arm
        with open(os.path.join(watch, f"sample-{TIMESTAMP}.txt"), "w") as f:
            f.write("event hub sample driver test payload\n")
        got = wait_until(lambda: (len(_notifs()) > base) or None, timeout=20)
        assert got, "sample driver produced no notification within 20s (see sample-driver.log)"
        n = _notifs()[-1]["body"].get("notification") or {}
        assert set(n.keys()) <= {"channel", "from", "count", "ts", "thread_id"}, \
            f"sample driver notification not thin: {sorted(n.keys())}"
        assert n.get("count", 0) >= 1
        print(f"         (sample driver notified on channel {n.get('channel')!r})")
    finally:
        if proc.poll() is None:
            proc.terminate()


runner.run("6.1 Sample driver publishes end-to-end (no hub change)", test_sample_driver_end_to_end)


# ===========================================================================
# SECTION 7: T6 RESILIENCE — the hub stays up, failures surface
# ===========================================================================

print("\n" + "=" * 70)
print("SECTION 7: T6 RESILIENCE — malformed input, big bodies, chassis down")
print("=" * 70)


def test_malformed_json_400():
    """Malformed JSON body -> 400, hub does NOT crash (the JSON-parse scar)."""
    _require(_secret_ok and _hub_ok, "hub unavailable")
    r = http_request("POST", HUB_PUBLISH_URL, raw=b'{"target": "unterminated',
                     headers={"X-Hub-Secret": HUB_SECRET})
    assert r["status"] == 400, f"malformed JSON should get 400, got {r['status']}: {r['text'][:200]}"


def test_valid_publish_after_malformed():
    """The hub is still alive and serving after the malformed request."""
    _require_core()
    r = hub_publish({"target": TEST_ID, "channel": "resil", "from": "after-malformed",
                     "ref": "resil-alive-1"})
    assert r["status"] == 200 and r["data"] and r["data"].get("ok") is True, \
        f"hub did not survive malformed input: HTTP {r['status']} {r['text'][:200]}"
    runner.publishes_sent += 1


def test_missing_target_clean_error():
    """Required field missing -> {ok:false, error} with 400, not a crash."""
    _require(_secret_ok and _hub_ok, "hub unavailable")
    r = hub_publish({"channel": "resil", "from": "no-target", "ref": "resil-notarget-1"})
    assert r["status"] == 400, f"missing target should 400, got {r['status']}: {r['text'][:200]}"
    assert r["data"] and r["data"].get("ok") is False and r["data"].get("error"), \
        f"expected clean {{ok:false, error}} body, got: {r['text'][:200]}"


def test_5mb_body_still_thin():
    """Attachment-bomb edge case: a 5MB smuggled body field never reaches
    the chassis — the notification stays thin."""
    _require_core()
    base = len(_notifs("bigbody"))
    r = hub_publish({"target": TEST_ID, "channel": "bigbody", "from": "bloater",
                     "ref": "big-ref-1", "body": "Y" * (5 * 1024 * 1024)}, timeout=120)
    assert r["status"] == 200 and r["data"] and r["data"].get("ok") is True, \
        f"5MB publish should still succeed (body stripped): HTTP {r['status']} {r['text'][:200]}"
    runner.publishes_sent += 1
    got = wait_until(lambda: (len(_notifs("bigbody")) > base) or None, timeout=10)
    assert got, "no notification for the 5MB publish"
    n = _notifs("bigbody")[-1]["body"].get("notification") or {}
    assert set(n.keys()) == {"channel", "from", "count", "ts"}, \
        f"5MB publish notification not thin: {sorted(n.keys())}"


def test_chassis_500_queryable_failure():
    """Chassis intake returns 500: publish still {ok:true}, counter still
    increments (invariant 4), and the delivery failure is QUERYABLE via
    hub status lastErrors — not swallowed (invariant 6)."""
    _require_core()
    c0 = (_slot("resil", "resil-sender") or {}).get("count", 0)
    r = http_request("POST", STUB_CONTROL, body={"mode": "error500"})
    assert r["status"] == 200, f"stub _control failed: {r['status']} {r['text'][:200]}"
    try:
        pr = hub_publish({"target": TEST_ID, "channel": "resil", "from": "resil-sender",
                          "ref": "resil-500-1"})
        assert pr["status"] == 200 and pr["data"] and pr["data"].get("ok") is True, \
            f"publish must stay ok when the chassis 500s: HTTP {pr['status']} {pr['text'][:200]}"
        runner.publishes_sent += 1
        got = wait_until(lambda: ((_slot("resil", "resil-sender") or {}).get("count", 0) > c0) or None,
                         timeout=10)
        assert got, f"counter did not increment during chassis outage: slot={_slot('resil', 'resil-sender')}"
        errs = wait_until(lambda: (_query_hub_status() or {}).get("lastErrors") or None, timeout=10)
        assert errs, ("delivery failure not queryable — no lastErrors from /hub/status "
                      "or MCP hub_status (hub.getStatus(), contract §6)")
        print(f"         ({len(errs)} queryable error(s); latest: {json.dumps(errs[-1])[:100]})")
    finally:
        # Always restore the stub, or every later test sees a dead chassis
        http_request("POST", STUB_CONTROL, body={"mode": "ok"})


def test_wrong_secret_403():
    """Wrong X-Hub-Secret -> 403 forbidden (contract §2)."""
    _require(_hub_ok, "hub unavailable")
    r = hub_publish({"target": TEST_ID, "channel": "resil", "from": "intruder",
                     "ref": "resil-forbidden-1"}, secret="definitely-not-the-secret")
    assert r["status"] == 403, f"wrong secret should 403, got {r['status']}: {r['text'][:200]}"
    if r["data"]:
        assert r["data"].get("ok") is False, f"403 body should be ok:false, got: {r['text'][:200]}"


runner.run("7.1 Malformed JSON publish -> 400, hub survives", test_malformed_json_400)
runner.run("7.2 Valid publish succeeds after malformed input", test_valid_publish_after_malformed)
runner.run("7.3 Missing target -> clean {ok:false, error}", test_missing_target_clean_error)
runner.run("7.4 5MB body field -> notification still thin", test_5mb_body_still_thin)
runner.run("7.5 Chassis 500 -> publish ok, counter up, failure queryable", test_chassis_500_queryable_failure)
runner.run("7.6 Wrong X-Hub-Secret -> 403", test_wrong_secret_403)


# ===========================================================================
# SECTION 8: EXTRAS — corrupt state file, email driver, ts monotonicity
# ===========================================================================

print("\n" + "=" * 70)
print("SECTION 8: EXTRAS — corrupt state file, email driver, ts monotonicity")
print("=" * 70)


def test_corrupt_events_file():
    """Garbage in .hacs-events.json is quarantined as
    .hacs-events.json.corrupt-<epoch> (contract §3). Quarantine only happens on
    the FIRST load of an instance's counter file — and TEST_ID's is already
    loaded — so this uses the SECOND fresh instance (EvtHubTestB-<epoch>):
    write its .hacs-identity plus a corrupt .hacs-events.json BEFORE its first
    publish, publish once, then assert publish ok + quarantine + drain works."""
    _require_core()
    os.makedirs(SECOND_DIR, exist_ok=True)
    with open(os.path.join(SECOND_DIR, ".hacs-identity"), "w") as f:
        json.dump({"instanceId": SECOND_ID, "chassis": "claude-code-channel",
                   "channelPort": STUB_PORT}, f)
    with open(EVENTS_FILE_B, "w") as f:
        f.write("{{{ this is not json %%% " + TIMESTAMP)
    r = hub_publish({"target": SECOND_ID, "channel": "corruptch", "from": "gremlin",
                     "ref": "corrupt-ref-1"})
    assert r["status"] == 200 and r["data"] and r["data"].get("ok") is True, \
        f"publish over a corrupt counter file must succeed: HTTP {r['status']} {r['text'][:200]}"
    runner.publishes_sent += 1
    marker = wait_until(lambda: glob.glob(EVENTS_FILE_B + ".corrupt-*") or None, timeout=10)
    assert marker, "expected a .hacs-events.json.corrupt-<epoch> quarantine file"
    r2 = rpc_call("drain_events", {"instanceId": SECOND_ID})
    data = assert_success(r2, "drain_events must work after quarantine")
    ev = (data.get("events") or {}).get("corruptch", {}).get("gremlin", {})
    assert ev.get("count") == 1, \
        f"drain should report the post-quarantine publish (count 1), got: {json.dumps(data)[:300]}"
    print(f"         (quarantined: {os.path.basename(marker[0])})")


def test_email_driver_end_to_end():
    """Drop an RFC822 file into the instance maildir; the email driver
    publishes and a thin notification arrives with the parsed From."""
    if not os.environ.get("EMAIL_DRIVER_RUNNING"):
        raise RuntimeError("SKIP: EMAIL_DRIVER_RUNNING not set — email driver not under test")
    _require_core()
    # 'email' defaults to quiet (contract §10) — opt this instance in so the
    # driver's publish produces a delivered notification we can observe.
    r = rpc_call("set_notification_policy",
                 {"instanceId": TEST_ID, "channel": "email", "interrupt": True})
    assert_success(r, "opt email channel into interrupt for the driver test")
    base = len(_notifs("email"))
    fname = f"{int(time.time())}.M0P{os.getpid()}.evthubtest"
    rfc822 = (
        "From: paula@example.com\r\n"
        f"To: {TEST_ID}@smoothcurves.nexus\r\n"
        "Subject: Event hub email driver test\r\n"
        f"Date: {time.strftime('%a, %d %b %Y %H:%M:%S +0000', time.gmtime())}\r\n"
        f"Message-ID: <evthub-{TIMESTAMP}@example.com>\r\n"
        "\r\n"
        "The notification must be thin; this body stays in the maildir.\r\n"
    )
    with open(os.path.join(INSTANCE_DIR, "mail", "new", fname), "w") as f:
        f.write(rfc822)
    got = wait_until(lambda: (len(_notifs("email")) > base) or None, timeout=20)
    assert got, "no email notification within 20s"
    n = _notifs("email")[-1]["body"].get("notification") or {}
    assert "paula@example.com" in str(n.get("from", "")), \
        f"email notification from should carry the parsed sender, got {n.get('from')!r}"
    assert set(n.keys()) <= {"channel", "from", "count", "ts", "thread_id"}, \
        f"email notification not thin: {sorted(n.keys())}"


def test_ts_monotone_per_channel():
    """Three publish->notify->drain cycles on one channel: notification ts
    never goes backwards."""
    _require_core()
    seen = []
    for i in range(3):
        base = len(_notifs("mono", "ticker"))
        r = hub_publish({"target": TEST_ID, "channel": "mono", "from": "ticker",
                         "ref": f"mono-ref-{i}"})
        assert r["data"] and r["data"].get("ok") is True, f"publish {i + 1}/3 failed: {r['text'][:200]}"
        runner.publishes_sent += 1
        got = wait_until(lambda: (len(_notifs("mono", "ticker")) > base) or None, timeout=10)
        assert got, f"notification {i + 1}/3 never arrived"
        seen.append(_notifs("mono", "ticker")[-1]["body"]["notification"]["ts"])
        rpc_call("drain_events", {"instanceId": TEST_ID, "channel": "mono", "from": "ticker"})
        time.sleep(1.1)  # ts is epoch seconds — let the clock actually advance
    assert seen == sorted(seen), f"ts not monotone across publishes: {seen}"
    print(f"         (ts sequence: {seen})")


runner.run("8.1 Corrupt .hacs-events.json (fresh instance) -> publish ok, quarantine, drain", test_corrupt_events_file)
runner.run("8.2 Email driver end-to-end (maildir drop)", test_email_driver_end_to_end)
runner.run("8.3 Notification ts monotone per channel", test_ts_monotone_per_channel)


# ---------------------------------------------------------------------------
# SECTION 10: INTERRUPT POLICY (contract §10) — quiet vs interrupt channels
# ---------------------------------------------------------------------------
print()
print("=" * 70)
print("SECTION 10: INTERRUPT POLICY — quiet vs interrupt channels")
print("=" * 70)


def test_policy_default_quiet():
    """A channel with no prefs entry and no system default ('quietch') is
    QUIET: publish succeeds, counter accrues, but NO notification is delivered
    to the chassis. Drain still returns the events (contract §10)."""
    _require_core()
    base = len(_notifs("quietch"))
    r = hub_publish({"target": TEST_ID, "channel": "quietch",
                     "from": "quiet-sender", "ref": "quiet-ref-1"})
    assert r["status"] == 200 and r["data"].get("ok") is True, \
        f"quiet publish must still succeed: HTTP {r['status']} {r['text'][:200]}"
    runner.publishes_sent += 1
    time.sleep(3.0)  # generous window — nothing should arrive
    now = len(_notifs("quietch"))
    assert now == base, \
        f"quiet channel must deliver NO notification (had {base}, now {now})"
    r2 = rpc_call("drain_events", {"instanceId": TEST_ID, "channel": "quietch", "peek": True})
    data = assert_success(r2, "drain (peek) must still see quiet events")
    ev = (data.get("events") or {}).get("quietch", {}).get("quiet-sender", {})
    assert ev.get("count") == 1, \
        f"quiet counter must accrue (want 1), got: {json.dumps(data)[:300]}"


def test_policy_default_interrupt_hacs():
    """'hacs' is the colleague-to-colleague fabric — system default is
    interrupt ON with no prefs entry needed."""
    _require_core()
    base = len(_notifs("hacs"))
    r = hub_publish({"target": TEST_ID, "channel": "hacs",
                     "from": "colleague-sender", "ref": "hacs-ref-1"})
    assert r["status"] == 200 and r["data"].get("ok") is True, "hacs publish failed"
    runner.publishes_sent += 1
    got = wait_until(lambda: len(_notifs("hacs")) > base or None, timeout=10)
    assert got, "hacs channel must deliver a notification by system default"


def test_policy_flip_to_interrupt():
    """set_notification_policy flips 'quietch' to interrupt; a fresh sender
    (new slot, 0-to-active) must then be delivered."""
    _require_core()
    r = rpc_call("set_notification_policy",
                 {"instanceId": TEST_ID, "channel": "quietch", "interrupt": True})
    data = assert_success(r, "set_notification_policy must succeed")
    assert data.get("interrupt") is True and data.get("default") is False, \
        f"policy echo wrong: {json.dumps(data)[:200]}"
    base = len(_notifs("quietch"))
    r2 = hub_publish({"target": TEST_ID, "channel": "quietch",
                      "from": "loud-sender", "ref": "quiet-ref-2"})
    assert r2["status"] == 200 and r2["data"].get("ok") is True, "post-flip publish failed"
    runner.publishes_sent += 1
    got = wait_until(lambda: len(_notifs("quietch")) > base or None, timeout=10)
    assert got, "after interrupt=true, the notification must be delivered"


def test_policy_rejects_bad_input():
    """Malformed policy calls are rejected cleanly (hub stays honest)."""
    _require_core()
    r = rpc_call("set_notification_policy",
                 {"instanceId": TEST_ID, "channel": "no spaces allowed", "interrupt": True})
    data = r["data"]
    assert data.get("success") is False, f"bad channel must be rejected: {json.dumps(data)[:200]}"
    r2 = rpc_call("set_notification_policy",
                  {"instanceId": TEST_ID, "channel": "quietch", "interrupt": "yes"})
    assert r2["data"].get("success") is False, "non-boolean interrupt must be rejected"


runner.run("10.1 Default-quiet channel: counter accrues, no delivery", test_policy_default_quiet)
runner.run("10.2 'hacs' interrupts by system default", test_policy_default_interrupt_hacs)
runner.run("10.3 set_notification_policy flips quiet -> interrupt", test_policy_flip_to_interrupt)
runner.run("10.4 Policy API rejects malformed input", test_policy_rejects_bad_input)


# ---------------------------------------------------------------------------
# SECTION 11: READ_MESSAGE — the letter-opener (unified read verb)
# ---------------------------------------------------------------------------
print()
print("=" * 70)
print("SECTION 11: READ_MESSAGE — open bodies behind refs, all channels")
print("=" * 70)


def _read(refs):
    r = rpc_call("read_message", {"instanceId": TEST_ID, "refs": refs})
    return assert_success(r, "read_message call")


def test_read_telegram_ref():
    """Seed the telegram body store, open a tg: ref — body + media descriptor."""
    _require_core()
    tgdir = os.path.join(INSTANCE_DIR, "telegram")
    os.makedirs(tgdir, exist_ok=True)
    with open(os.path.join(tgdir, "inbox.jsonl"), "a") as f:
        f.write(json.dumps({"ref": "tg:999:1", "ts": int(TIMESTAMP), "from": "Suite(tg)",
                            "chat_id": "999", "text": "seeded telegram body",
                            "media": [{"kind": "image", "file_id": "F1", "size": 111}]}) + "\n")
    m = _read(["tg:999:1"])["messages"][0]
    assert m.get("body") == "seeded telegram body", f"wrong body: {json.dumps(m)[:200]}"
    assert m.get("channel") == "telegram" and m.get("thread_id") == "999"
    assert m.get("attachments", [{}])[0].get("ref") == "tgfile:F1", "media descriptor missing"


def test_read_hacs_store_ref():
    """Seed the hacs body store (what the input driver writes), open a msg-* ref."""
    _require_core()
    hdir = os.path.join(INSTANCE_DIR, "hacs")
    os.makedirs(hdir, exist_ok=True)
    with open(os.path.join(hdir, "inbox.jsonl"), "a") as f:
        f.write(json.dumps({"ref": f"msg-{TIMESTAMP}-suite", "ts": int(TIMESTAMP),
                            "from": "Suite-0000", "subject": "s", "text": "seeded hacs body"}) + "\n")
    m = _read([f"msg-{TIMESTAMP}-suite"])["messages"][0]
    assert m.get("body") == "seeded hacs body", f"wrong body: {json.dumps(m)[:200]}"
    assert m.get("channel") == "hacs"


def test_read_email_ref_and_traversal():
    """Write a real MIME fixture (attachment + unicode) into the test maildir;
    open it; assert clean text + attachment descriptor; traversal ref rejected."""
    _require_core()
    from email.message import EmailMessage
    em = EmailMessage()
    em["From"] = "suite@example.com"
    em["Subject"] = "MIME fixture — café"
    em.set_content("plain text body — café")
    em.add_attachment(b"PNGBYTES" * 50, maintype="image", subtype="png", filename="p.png")
    fixture = os.path.join(INSTANCE_DIR, "mail", "new", f"{TIMESTAMP}.suite.eml")
    with open(fixture, "wb") as f:
        f.write(em.as_bytes())
    out = _read([fixture, os.path.join(INSTANCE_DIR, "mail", "..", "..", "secrets")])
    good, bad = out["messages"]
    assert "café" in good.get("body", ""), f"MIME text not extracted: {json.dumps(good)[:200]}"
    assert good.get("attachments", [{}])[0].get("kind") == "image/png", "attachment not listed"
    assert "not inside your mail directory" in bad.get("error", ""), \
        f"traversal must be rejected: {json.dumps(bad)[:200]}"


runner.run("11.1 read_message opens telegram refs (body + media descriptor)", test_read_telegram_ref)
runner.run("11.2 read_message opens hacs store refs (msg-*)", test_read_hacs_store_ref)
runner.run("11.3 read_message parses MIME email; rejects traversal", test_read_email_ref_and_traversal)


def test_read_window_and_attachment_fetch():
    """max_chars/offset window a long body; mailatt refs fetch the bytes into
    the caller's own attachments/ dir (never into context)."""
    _require_core()
    hdir = os.path.join(INSTANCE_DIR, "hacs")
    os.makedirs(hdir, exist_ok=True)
    with open(os.path.join(hdir, "inbox.jsonl"), "a") as f:
        f.write(json.dumps({"ref": f"msg-{TIMESTAMP}-long", "ts": int(TIMESTAMP),
                            "from": "S", "subject": "s", "text": "A" * 6000}) + "\n")
    r = rpc_call("read_message", {"instanceId": TEST_ID, "refs": [f"msg-{TIMESTAMP}-long"]})
    m = assert_success(r, "windowed read")["messages"][0]
    assert len(m["body"]) == 4000 and m["truncated"] is True, "default cap must truncate at 4000"
    r = rpc_call("read_message", {"instanceId": TEST_ID,
                                  "refs": [f"msg-{TIMESTAMP}-long"], "max_chars": 50000})
    m = assert_success(r, "whole-letter read")["messages"][0]
    assert len(m["body"]) == 6000 and m["truncated"] is False, "max_chars must return the whole letter"
    from email.message import EmailMessage
    em = EmailMessage()
    em["From"] = "s@example.com"; em["Subject"] = "att"
    em.set_content("body")
    em.add_attachment(b"BYTES" * 100, maintype="image", subtype="png", filename="art.png")
    fx = os.path.join(INSTANCE_DIR, "mail", "new", f"{TIMESTAMP}.att.eml")
    with open(fx, "wb") as f:
        f.write(em.as_bytes())
    r = rpc_call("read_message", {"instanceId": TEST_ID, "refs": [fx]})
    att_ref = assert_success(r, "email read")["messages"][0]["attachments"][0]["ref"]
    r = rpc_call("read_message", {"instanceId": TEST_ID, "refs": [att_ref]})
    a = assert_success(r, "mailatt fetch")["messages"][0]
    assert a.get("saved_to") and os.path.exists(a["saved_to"]) and \
        os.path.getsize(a["saved_to"]) == 500, f"attachment not saved: {json.dumps(a)[:200]}"
    r = rpc_call("read_message", {"instanceId": TEST_ID, "refs": ["mailatt:/etc/passwd:0"]})
    bad = assert_success(r, "traversal call")["messages"][0]
    assert "not inside your mail directory" in bad.get("error", ""), "mailatt traversal must be rejected"


runner.run("11.4 read_message windowing (max_chars/offset) + mailatt byte fetch", test_read_window_and_attachment_fetch)


def test_get_message_accepts_drain_refs():
    """The contract drain_events documents: its refs fetch the content. Bastion
    hit the gap — get_message('msg-*') said "Message not found" because msg-*
    ids never enter the XMPP archive. get_message must resolve them from the
    hacs body store, same rule as read_message."""
    _require_core()
    hdir = os.path.join(INSTANCE_DIR, "hacs")
    os.makedirs(hdir, exist_ok=True)
    ref = f"msg-{TIMESTAMP}-getmsg"
    with open(os.path.join(hdir, "inbox.jsonl"), "a") as f:
        f.write(json.dumps({"ref": ref, "ts": int(TIMESTAMP), "from": "Suite-0000",
                            "subject": "drain ref", "text": "body behind a drain ref"}) + "\n")
    r = rpc_call("get_message", {"instanceId": TEST_ID, "id": ref})
    m = assert_success(r, "get_message with msg-* ref")
    assert m.get("body") == "body behind a drain ref", f"wrong body: {json.dumps(m)[:200]}"
    assert m.get("from") == "Suite-0000"
    # a msg-* ref that exists nowhere must fail with a pointer, not a bare 404
    r = rpc_call("get_message", {"instanceId": TEST_ID, "id": "msg-0-nonexistent"})
    assert not r.get("success"), "nonexistent ref must fail"
    assert "body store" in r.get("error", ""), f"error must explain msg-* resolution: {r.get('error')}"


runner.run("11.5 get_message resolves drain_events msg-* refs (Bastion's gap)", test_get_message_accepts_drain_refs)


# ===========================================================================
# SECTION 9: CLEANUP — remove test resources (never asserts)
# ===========================================================================

print("\n" + "=" * 70)
print("SECTION 9: CLEANUP — remove test resources")
print("=" * 70)


def cleanup_land_instance():
    """Land the test instance via the API. Best-effort — never asserts."""
    if not TEST_ID:
        print("         (no test instance to land)")
        return
    try:
        r = rpc_call("land_instance", {"instanceId": TEST_ID, "targetInstanceId": TEST_ID})
        print(f"         (land_instance: {json.dumps(r['data'])[:120]})")
    except Exception as e:
        print(f"         (land_instance raised: {e})")


def cleanup_instance_dir():
    """Recursively delete BOTH test instance directories (the bootstrapped one
    and the corrupt-file test's EvtHubTestB dir) — nothing else."""
    for path in (INSTANCE_DIR, SECOND_DIR):
        try:
            if path and os.path.isdir(path):
                shutil.rmtree(path, ignore_errors=True)
                print(f"         (removed {path})")
            else:
                print(f"         (no instance dir to remove: {path})")
        except Exception as e:
            print(f"         (instance dir cleanup raised: {e})")


def cleanup_helper_processes():
    """Kill the stub chassis, mock telegram, and any sample driver."""
    try:
        alive = sum(1 for p in PROCS if p.poll() is None)
        _kill_procs()
        print(f"         (stopped {alive} live subprocess(es))")
    except Exception as e:
        print(f"         (subprocess cleanup raised: {e})")


def cleanup_tmpdir():
    """Remove the suite's temp dir (records, queues, helper logs)."""
    try:
        shutil.rmtree(TMPDIR, ignore_errors=True)
        print(f"         (removed {TMPDIR})")
    except Exception as e:
        print(f"         (tmpdir cleanup raised: {e})")


runner.run("9.1 Land test instance via API", cleanup_land_instance)
runner.run("9.2 Remove test instance directories", cleanup_instance_dir)
runner.run("9.3 Stop helper subprocesses", cleanup_helper_processes)
runner.run("9.4 Remove temp directory", cleanup_tmpdir)


# ===========================================================================
# SUMMARY
# ===========================================================================

all_passed = runner.summary()

print(f"\nTest instance used: {TEST_ID}")
print(f"Total publishes sent: {runner.publishes_sent}")
print(f"Timestamp: {TIMESTAMP}")

sys.exit(0 if all_passed else 1)
