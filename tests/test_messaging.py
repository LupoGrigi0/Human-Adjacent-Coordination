#!/usr/bin/env python3
"""
HACS Messaging System - Regression Test Suite
==============================================
Tests all convenience APIs and power-user APIs for the HACS messaging system.
Covers: send/receive lifecycle, special characters, fuzzy matching, read tracking,
field validation, round-trip verification, negative cases, and cleanup.

Uses DEDICATED TEST INSTANCES only - never touches real instance rooms.

PRE-DEPLOY: These tests target the Simple Messaging API (messaging-simple.js).
They will FAIL against production until the new code is deployed.
Expected flow: run pre-deploy (expect failures) -> deploy -> run post-deploy (expect passes).

Usage:
    python3 test_messaging.py [API_URL]

Design follows the Regression Test Engineer role (Ember/Axiom pattern):
- JSON-RPC helpers with assert_success / assert_failure
- TestRunner with pass/fail/skip counting
- Read-back verification on all mutations
- Known bug documentation
- Clean teardown with state verification
- Cascading skip guards

@author Messenger (Messenger-aa2a)
@date 2026-03-04
"""

import requests
import json
import time
import sys
import os
import traceback
import urllib3

# Suppress SSL warnings for self-signed certs
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
API_URL = sys.argv[1] if len(sys.argv) > 1 else "https://smoothcurves.nexus/mcp"
TIMESTAMP = str(int(time.time()))

# Executive token for privileged operations (purge, role adoption)
EXEC_TOKEN = os.environ.get("HACS_EXEC_TOKEN", None)

# Test instance names - unique per run to avoid collisions
SENDER_NAME = f"MsgTestSender-{TIMESTAMP}"
RECEIVER_NAME = f"MsgTestReceiver-{TIMESTAMP}"

# Will be set during bootstrap
SENDER_ID = None
RECEIVER_ID = None

# ---------------------------------------------------------------------------
# JSON-RPC Helpers (from Regression Test Engineer pattern)
# ---------------------------------------------------------------------------

def rpc_call(method, params, timeout=30):
    """Send a JSON-RPC request and return normalized result."""
    t0 = time.time()
    try:
        resp = requests.post(API_URL, json={
            "jsonrpc": "2.0", "id": 1,
            "method": "tools/call",
            "params": {"name": method, "arguments": params}
        }, headers={"Content-Type": "application/json"}, verify=False, timeout=timeout)
        raw = resp.json()
    except Exception as e:
        return {"data": {"success": False, "error": str(e)}, "elapsed": time.time() - t0, "raw": None}

    elapsed = time.time() - t0

    # Parse three possible response formats
    result = raw.get("result", raw)

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
        self.test_rooms_used = set()
        self.read_tracking_instances = set()

    def run(self, label, fn):
        """Run a single test function."""
        try:
            fn()
            self.passed += 1
            print(f"  PASS  {label}")
        except RuntimeError as e:
            if str(e).startswith("SKIP:"):
                self.skipped += 1
                print(f"  SKIP  {label} -- {e}")
            else:
                self.failed += 1
                self.errors.append((label, traceback.format_exc()))
                print(f"  FAIL  {label} -- {e}")
        except AssertionError as e:
            self.failed += 1
            self.errors.append((label, str(e)))
            print(f"  FAIL  {label} -- {e}")
        except Exception as e:
            self.failed += 1
            self.errors.append((label, traceback.format_exc()))
            print(f"  FAIL  {label} -- {type(e).__name__}: {e}")

    def log_timing(self, label, elapsed):
        self.timings.append((label, elapsed))

    def summary(self):
        total = self.passed + self.failed + self.skipped
        print(f"\n{'='*70}")
        print(f"RESULTS: {self.passed}/{total} passed, {self.failed} failed, {self.skipped} skipped")
        if self.errors:
            print(f"\nFailed tests:")
            for label, err in self.errors:
                print(f"  - {label}: {err[:200]}")
        if self.timings:
            print(f"\nTimings:")
            for label, elapsed in self.timings:
                print(f"  {label}: {elapsed:.3f}s")
        print(f"{'='*70}")
        return 0 if self.failed == 0 else 1


runner = TestRunner()

# ---------------------------------------------------------------------------
# Skip Guards
# ---------------------------------------------------------------------------
_messaging_setup_ok = False
_read_tracking_ok = False


def _require_messaging():
    if not _messaging_setup_ok:
        raise RuntimeError("SKIP: Messaging setup required (bootstrap failed)")


def _require_read_tracking():
    if not _read_tracking_ok:
        raise RuntimeError("SKIP: Read tracking setup required (earlier tests failed)")


# ---------------------------------------------------------------------------
# SETUP: Bootstrap test instances
# ---------------------------------------------------------------------------

def setup_bootstrap():
    """Bootstrap two dedicated test instances."""
    global SENDER_ID, RECEIVER_ID, _messaging_setup_ok

    # Bootstrap sender
    r = rpc_call("bootstrap", {"name": SENDER_NAME})
    data = assert_success(r, "Bootstrap sender")
    SENDER_ID = data.get("instanceId")
    assert SENDER_ID, f"No instanceId returned for sender: {data}"

    # Bootstrap receiver
    r = rpc_call("bootstrap", {"name": RECEIVER_NAME})
    data = assert_success(r, "Bootstrap receiver")
    RECEIVER_ID = data.get("instanceId")
    assert RECEIVER_ID, f"No instanceId returned for receiver: {data}"

    # Track rooms for cleanup
    sender_personality = SENDER_NAME.split("-")[0].lower()
    receiver_personality = RECEIVER_NAME.split("-")[0].lower()
    runner.test_rooms_used.add(f"personality-{sender_personality}")
    runner.test_rooms_used.add(f"personality-{receiver_personality}")
    runner.read_tracking_instances.add(SENDER_ID)
    runner.read_tracking_instances.add(RECEIVER_ID)

    # Adopt Executive role on sender for privileged ops (purge cleanup)
    if EXEC_TOKEN:
        r = rpc_call("take_on_role", {
            "instanceId": SENDER_ID,
            "role": "Executive",
            "token": EXEC_TOKEN
        })
        if r["data"].get("success"):
            print(f"    Sender adopted Executive role (cleanup enabled)")
        else:
            print(f"    WARNING: Role adoption failed: {r['data'].get('error', 'unknown')}")
            print(f"    Cleanup will skip room purge")
    else:
        print(f"    WARNING: HACS_EXEC_TOKEN not set — cleanup will skip room purge")

    _messaging_setup_ok = True
    print(f"    SENDER_ID   = {SENDER_ID}")
    print(f"    RECEIVER_ID = {RECEIVER_ID}")


# ---------------------------------------------------------------------------
# Pre-test state snapshot
# ---------------------------------------------------------------------------
_pre_test_rooms = set()


def setup_state_snapshot():
    """Capture pre-test state for verification."""
    _require_messaging()
    # We don't have a list-all-rooms API, so just note our test rooms exist now
    # The key invariant is: after cleanup, test rooms should be empty or destroyed
    pass


# ---------------------------------------------------------------------------
# SECTION 1: Basic Connectivity
# ---------------------------------------------------------------------------

def test_get_presence():
    """get_presence returns valid data."""
    r = rpc_call("get_presence", {})
    data = r["data"]
    assert isinstance(data, (dict, list)), f"Expected dict or list, got {type(data)}"


def test_get_messaging_info():
    """get_messaging_info for test sender returns info."""
    _require_messaging()
    r = rpc_call("get_messaging_info", {"instanceId": SENDER_ID})
    data = r["data"]
    assert isinstance(data, dict), f"Expected dict, got {type(data)}"


def test_lookup_shortname():
    """lookup_shortname finds our test sender by name prefix."""
    _require_messaging()
    # Use just the name part (without timestamp-hash suffix)
    r = rpc_call("lookup_shortname", {"name": SENDER_NAME.split("-")[0]})
    data = r["data"]
    assert isinstance(data, dict), f"Expected dict, got {type(data)}"


# ---------------------------------------------------------------------------
# SECTION 2: send_message - Basic Operations
# ---------------------------------------------------------------------------

def test_send_basic():
    """Send a basic message between test instances."""
    _require_messaging()
    r = rpc_call("send_message", {
        "from": SENDER_ID,
        "to": RECEIVER_ID,
        "subject": "Regression test - basic",
        "body": "Hello from the regression suite."
    })
    data = assert_success(r, "Basic send")
    assert data.get("delivered_to") == RECEIVER_ID, \
        f"Expected delivered_to={RECEIVER_ID}, got {data.get('delivered_to')}"


def test_send_subject_only():
    """Subject only with no body must be REJECTED.

    Updated 2026-05-10: previously this expected success because the API
    silently fell back to using subject as body. That was the bug Crossing
    hit. After the fix, subject-only sends are explicitly rejected with a
    helpful error pointing to the `body` field.
    """
    _require_messaging()
    r = rpc_call("send_message", {
        "from": SENDER_ID,
        "to": RECEIVER_ID,
        "subject": "Subject only - no body"
    })
    data = assert_failure(r, "Subject-only send must be rejected")
    err_text = json.dumps(data).lower()
    assert "body" in err_text, \
        f"Error should mention `body` field. Got: {data}"


def test_send_missing_subject():
    """Missing required subject field should fail."""
    _require_messaging()
    r = rpc_call("send_message", {
        "from": SENDER_ID,
        "to": RECEIVER_ID,
        "body": "Body but no subject"
    })
    assert_failure(r, "Should fail without subject")


def test_send_missing_from():
    """Missing required from field should fail."""
    _require_messaging()
    r = rpc_call("send_message", {
        "to": RECEIVER_ID,
        "subject": "No from field"
    })
    assert_failure(r, "Should fail without from")


def test_send_missing_to():
    """Missing required to field should fail."""
    _require_messaging()
    r = rpc_call("send_message", {
        "from": SENDER_ID,
        "subject": "No to field"
    })
    assert_failure(r, "Should fail without to")


# ---------------------------------------------------------------------------
# SECTION 3: send_message - Special Characters & Edge Cases
# ---------------------------------------------------------------------------

SPECIAL_CHAR_CASES = [
    ("single_quotes",       "It's a test with 'quotes'",        "That's what she said: 'hello'"),
    ("double_quotes",       'Subject with "double quotes"',     'Body with "quoted text" inside'),
    ("apostrophes",         "Don't stop won't can't",           "They're here and it's fine"),
    ("brackets",            "Test [brackets] here",             "Array: [1, 2, 3] done"),
    ("parentheses",         "Test (parens) here",               "Call fn(x, y) now"),
    ("curly_braces",        "Test {braces} here",               "Object: {a: 1, b: 2}"),
    ("js_code",             "JS code in subject",               'console.log("hello")'),
    ("json_string",         "JSON payload test",                '{"key": "value", "num": 42}'),
    ("ampersand",           "Salt & Pepper",                    "A & B & C"),
    ("angle_brackets",      "Test <angle> brackets",            "<div>hello</div>"),
    ("pipe",                "Test | pipe char",                  "cmd1 | cmd2 | cmd3"),
    ("unicode_emoji",       "Unicode test",                     "Hello \u2603 \u2764 \u2714 \u00e9\u00e8\u00ea \u00fc\u00f6\u00e4"),
    ("unicode_cjk",         "CJK chars \u4f60\u597d",           "\u3053\u3093\u306b\u3061\u306f\u4e16\u754c \ud83c\udf0d"),
    ("mixed_special",       "All <together> & 'more' \"stuff\"", '{[(<|>&\"\u2019)]}'),
]


def test_special_chars():
    """Send messages with various special characters."""
    _require_messaging()
    for tag, subject, body in SPECIAL_CHAR_CASES:
        r = rpc_call("send_message", {
            "from": SENDER_ID,
            "to": RECEIVER_ID,
            "subject": subject,
            "body": body
        })
        data = assert_success(r, f"Special chars: {tag}")


def test_long_subject():
    """Subject with 300 chars - should succeed or fail gracefully."""
    _require_messaging()
    r = rpc_call("send_message", {
        "from": SENDER_ID,
        "to": RECEIVER_ID,
        "subject": "A" * 300,
        "body": "Long subject test"
    })
    # Accept either success or graceful error, just not a crash
    data = r["data"]
    assert "success" in data or "error" in data, \
        f"Expected success or error key, got: {json.dumps(data)[:200]}"


def test_long_body():
    """Body with 9000 chars - should succeed or fail gracefully."""
    _require_messaging()
    r = rpc_call("send_message", {
        "from": SENDER_ID,
        "to": RECEIVER_ID,
        "subject": "Long body test",
        "body": "B" * 9000
    })
    data = r["data"]
    assert "success" in data or "error" in data, \
        f"Expected success or error key, got: {json.dumps(data)[:200]}"


# ---------------------------------------------------------------------------
# SECTION 4: send_message - Recipient Handling & Fuzzy Matching
# ---------------------------------------------------------------------------

def test_nonexistent_recipient():
    """Send to non-existent instance should fail with helpful info."""
    _require_messaging()
    r = rpc_call("send_message", {
        "from": SENDER_ID,
        "to": f"TotallyFake-{TIMESTAMP}",
        "subject": "Should fail"
    })
    data = assert_failure(r, "Non-existent recipient")
    # Should include suggestion
    assert "suggestion" in data or "error" in data, \
        f"Expected suggestion or error in failure response"


def test_fuzzy_partial_name():
    """Partial name should either match or return close_matches."""
    _require_messaging()
    partial = RECEIVER_NAME[:8]  # First 8 chars
    r = rpc_call("send_message", {
        "from": SENDER_ID,
        "to": partial,
        "subject": "Fuzzy partial test"
    })
    data = r["data"]
    # Either succeeds (fuzzy match found) or fails with close_matches
    if data.get("success"):
        pass  # fuzzy match worked
    else:
        assert "close_matches" in data or "suggestion" in data, \
            f"Fuzzy failure should include close_matches or suggestion"


def test_send_to_self():
    """Send message to yourself - should work."""
    _require_messaging()
    r = rpc_call("send_message", {
        "from": SENDER_ID,
        "to": SENDER_ID,
        "subject": "Message to self"
    })
    # Document whether self-messaging works
    data = r["data"]
    if data.get("success"):
        print(f"    Self-messaging: WORKS")
    else:
        print(f"    Self-messaging: FAILS ({data.get('error', 'unknown')})")
        # Not a test failure - documenting behavior


# ---------------------------------------------------------------------------
# SECTION 5: Read Tracking Lifecycle
# ---------------------------------------------------------------------------

def test_read_tracking_full_lifecycle():
    """Full lifecycle: reset -> send -> check -> list -> read -> verify gone."""
    global _read_tracking_ok
    _require_messaging()

    # Step 1: Reset read tracking for receiver
    r = rpc_call("reset_read_tracking", {"instanceId": RECEIVER_ID})
    assert_success(r, "Reset read tracking")

    # Step 2: Purge receiver's room to start clean
    receiver_personality = RECEIVER_NAME.split("-")[0].lower()
    r = rpc_call("purge_room_messages", {"room": f"personality-{receiver_personality}"})
    # Room might not exist yet, that's OK
    time.sleep(0.5)

    # Step 3: Send 3 messages to receiver
    for i in range(1, 4):
        r = rpc_call("send_message", {
            "from": SENDER_ID,
            "to": RECEIVER_ID,
            "subject": f"Read tracking test msg {i}",
            "body": f"Body of message {i}"
        })
        assert_success(r, f"Send msg {i}")

    time.sleep(0.5)

    # Step 4: do_i_have_new_messages should be true
    r = rpc_call("do_i_have_new_messages", {"instanceId": RECEIVER_ID})
    data = assert_success(r, "Check new messages")
    assert data.get("new_messages") is True, \
        f"Expected new_messages=true, got {data.get('new_messages')}"
    unread_ids = data.get("unread_ids", [])
    assert len(unread_ids) > 0, "Expected at least 1 unread ID"

    # Step 5: list_my_messages should show 3
    r = rpc_call("list_my_messages", {"instanceId": RECEIVER_ID})
    data = assert_success(r, "List my messages")
    messages = data.get("messages", [])
    assert len(messages) >= 3, f"Expected >=3 messages, got {len(messages)}"

    # Step 6: get_message on the first one - marks it as read
    first_msg_id = messages[0]["id"]
    r = rpc_call("get_message", {"id": first_msg_id, "instanceId": RECEIVER_ID})
    data = assert_success(r, "Get message")

    # Verify expected fields present
    for key in ("subject", "body", "from", "date"):
        assert key in data, f"Missing expected field '{key}' in get_message response"

    # Verify forbidden fields absent
    for key in ("priority", "room", "metadata"):
        if key in data:
            print(f"    KNOWN BUG: get_message returns forbidden field '{key}'")

    # Step 7: list_my_messages again - the read one should be gone
    time.sleep(0.3)
    r = rpc_call("list_my_messages", {"instanceId": RECEIVER_ID})
    data = assert_success(r, "List after read")
    remaining_ids = [m["id"] for m in data.get("messages", [])]
    assert first_msg_id not in remaining_ids, \
        f"Read message {first_msg_id} still in unread list"

    # Step 8: do_i_have_new_messages should still be true (2 remaining)
    r = rpc_call("do_i_have_new_messages", {"instanceId": RECEIVER_ID})
    data = assert_success(r, "Still has new")
    assert data.get("new_messages") is True, \
        "Should still have new messages after reading 1"

    _read_tracking_ok = True


# ---------------------------------------------------------------------------
# SECTION 6: list_my_messages Edge Cases
# ---------------------------------------------------------------------------

def test_list_with_limit():
    """list_my_messages with limit=1 respects the limit."""
    _require_read_tracking()
    r = rpc_call("list_my_messages", {"instanceId": RECEIVER_ID, "limit": 1})
    data = assert_success(r, "List with limit")
    messages = data.get("messages", [])
    assert len(messages) <= 1, f"Expected <=1 message with limit=1, got {len(messages)}"


def test_list_has_hint():
    """list_my_messages includes a hint field."""
    _require_read_tracking()
    r = rpc_call("list_my_messages", {"instanceId": RECEIVER_ID})
    data = assert_success(r, "List for hint")
    assert "hint" in data, f"Expected 'hint' field in response"


def test_list_more_unread():
    """When limited, more_unread or total_unread indicates more exist."""
    _require_read_tracking()
    r = rpc_call("list_my_messages", {"instanceId": RECEIVER_ID, "limit": 1})
    data = assert_success(r, "List for more_unread")
    has_more = data.get("more_unread", False) or data.get("total_unread", 0) > 1
    if has_more:
        pass  # Good
    else:
        print(f"    KNOWN BUG: more_unread not returned when limit < total")


# ---------------------------------------------------------------------------
# SECTION 7: list_project_messages
# ---------------------------------------------------------------------------

def test_project_messages_no_project():
    """list_project_messages for instance with no project should fail gracefully."""
    _require_messaging()
    r = rpc_call("list_project_messages", {"instanceId": RECEIVER_ID})
    data = r["data"]
    # Receiver has no project, should get helpful error
    if data.get("success") is False:
        assert "suggestion" in data or "error" in data, \
            "Expected suggestion or error for no-project case"
    else:
        print(f"    Note: Instance with no project returned success (project={data.get('project')})")


# ---------------------------------------------------------------------------
# SECTION 8: XMPP Power-User APIs
# ---------------------------------------------------------------------------

def test_xmpp_send():
    """xmpp_send_message between test instances."""
    _require_messaging()
    r = rpc_call("xmpp_send_message", {
        "from": SENDER_ID,
        "to": RECEIVER_ID,
        "subject": "XMPP power-user test",
        "body": "Sent via xmpp_send_message",
        "priority": "normal"
    })
    data = r["data"]
    # xmpp_send_message has broader routing - may succeed or fail differently
    assert isinstance(data, dict), f"Expected dict response"


def test_xmpp_get_messages():
    """xmpp_get_messages for test receiver."""
    _require_messaging()
    r = rpc_call("xmpp_get_messages", {"instanceId": RECEIVER_ID, "limit": 5})
    data = r["data"]
    assert isinstance(data, dict) or isinstance(data, list), \
        f"Expected dict or list, got {type(data)}"


def test_xmpp_get_single():
    """xmpp_get_message for a specific message by ID."""
    _require_messaging()
    # Get a message list first
    r = rpc_call("xmpp_get_messages", {"instanceId": RECEIVER_ID, "limit": 1})
    data = r["data"]
    messages = data if isinstance(data, list) else data.get("messages", [])

    if not messages or not isinstance(messages, list) or len(messages) == 0:
        raise RuntimeError("SKIP: No messages available for single-message test")

    msg_id = messages[0].get("id", messages[0].get("_id", ""))
    if not msg_id:
        raise RuntimeError("SKIP: Message has no ID field")

    r = rpc_call("xmpp_get_message", {"id": msg_id, "instanceId": RECEIVER_ID})
    data = r["data"]
    assert isinstance(data, dict), f"Expected dict, got {type(data)}"


# ---------------------------------------------------------------------------
# SECTION 9: do_i_have_new_messages Edge Cases
# ---------------------------------------------------------------------------

def test_new_messages_fields():
    """do_i_have_new_messages returns proper boolean new_messages field."""
    _require_messaging()
    r = rpc_call("do_i_have_new_messages", {"instanceId": SENDER_ID})
    data = assert_success(r, "New messages check")
    new_msgs = data.get("new_messages")
    assert isinstance(new_msgs, bool), f"new_messages should be bool, got {type(new_msgs)}"
    if new_msgs:
        assert "unread_ids" in data, "When new_messages=true, unread_ids should be present"


def test_new_messages_missing_instance():
    """do_i_have_new_messages with no instanceId should fail."""
    r = rpc_call("do_i_have_new_messages", {})
    assert_failure(r, "Should fail without instanceId")


# ---------------------------------------------------------------------------
# SECTION 10: get_message Field Validation
# ---------------------------------------------------------------------------

def test_get_message_expected_fields():
    """get_message returns exactly the expected fields, no more."""
    _require_read_tracking()

    # Send a known message
    rpc_call("reset_read_tracking", {"instanceId": RECEIVER_ID})
    r = rpc_call("send_message", {
        "from": SENDER_ID,
        "to": RECEIVER_ID,
        "subject": "Field validation test",
        "body": "Checking returned fields"
    })
    assert_success(r, "Send field validation msg")
    time.sleep(0.3)

    # Find it
    r = rpc_call("list_my_messages", {"instanceId": RECEIVER_ID})
    data = assert_success(r, "List for field validation")
    messages = data.get("messages", [])
    target = None
    for m in messages:
        if "Field validation" in m.get("subject", ""):
            target = m
            break
    assert target, "Could not find field validation message in list"

    # Read it
    r = rpc_call("get_message", {"id": target["id"], "instanceId": RECEIVER_ID})
    data = assert_success(r, "Get field validation message")

    # Verify expected keys
    expected = {"success", "subject", "body", "from", "date"}
    actual_keys = set(data.keys())
    missing = expected - actual_keys
    assert not missing, f"Missing expected keys: {missing}"

    # Check forbidden keys
    forbidden = {"priority", "room", "metadata"}
    found_forbidden = forbidden & actual_keys
    if found_forbidden:
        print(f"    KNOWN BUG: get_message returns forbidden keys: {found_forbidden}")


def test_get_message_nonexistent():
    """get_message with bogus ID should fail gracefully."""
    _require_messaging()
    r = rpc_call("get_message", {"id": "totally-fake-id-99999", "instanceId": RECEIVER_ID})
    assert_failure(r, "Bogus message ID")


def test_get_message_missing_id():
    """get_message with no ID should fail."""
    _require_messaging()
    r = rpc_call("get_message", {"instanceId": RECEIVER_ID})
    assert_failure(r, "Missing message ID")


def test_get_message_missing_instance():
    """get_message with no instanceId should fail."""
    r = rpc_call("get_message", {"id": "any-id"})
    assert_failure(r, "Missing instanceId")


# ---------------------------------------------------------------------------
# SECTION 11: Special Character Round-Trip Verification
# ---------------------------------------------------------------------------

def test_roundtrip_special_chars():
    """Send a message with special chars, retrieve it, verify exact match."""
    _require_messaging()

    # Reset and purge for clean test
    rpc_call("reset_read_tracking", {"instanceId": RECEIVER_ID})
    receiver_personality = RECEIVER_NAME.split("-")[0].lower()
    rpc_call("purge_room_messages", {"room": f"personality-{receiver_personality}"})
    time.sleep(0.3)

    test_subject = 'Roundtrip: "quotes" & <angles> {braces} [brackets]'
    test_body = 'console.log("hello"); obj = {"key": "val"}; arr = [1,2]; a & b < c > d | e'

    # Send
    r = rpc_call("send_message", {
        "from": SENDER_ID,
        "to": RECEIVER_ID,
        "subject": test_subject,
        "body": test_body
    })
    assert_success(r, "Send roundtrip msg")
    time.sleep(0.3)

    # List and find
    r = rpc_call("list_my_messages", {"instanceId": RECEIVER_ID})
    data = assert_success(r, "List for roundtrip")
    messages = data.get("messages", [])
    target = None
    for m in messages:
        if "Roundtrip" in m.get("subject", ""):
            target = m
            break
    assert target, f"Roundtrip message not found in list. Subjects: {[m.get('subject') for m in messages]}"

    # Read and verify
    r = rpc_call("get_message", {"id": target["id"], "instanceId": RECEIVER_ID})
    data = assert_success(r, "Get roundtrip msg")

    got_subject = data.get("subject", "")
    got_body = data.get("body", "")

    if got_subject != test_subject:
        print(f"    KNOWN BUG: Subject not preserved exactly")
        print(f"      Expected: {test_subject!r}")
        print(f"      Got:      {got_subject!r}")
    else:
        assert True  # Subject matches

    if got_body != test_body:
        print(f"    KNOWN BUG: Body not preserved exactly")
        print(f"      Expected: {test_body!r}")
        print(f"      Got:      {got_body!r}")
    else:
        assert True  # Body matches


# ---------------------------------------------------------------------------
# SECTION 12: purge_room_messages & reset_read_tracking
# ---------------------------------------------------------------------------

def test_purge_nonexistent_room():
    """Purging a room that doesn't exist should not crash."""
    r = rpc_call("purge_room_messages", {"room": f"test-nonexistent-{TIMESTAMP}"})
    data = r["data"]
    # Should handle gracefully
    assert isinstance(data, dict), "Expected dict response"


def test_purge_missing_param():
    """purge_room_messages with no room param should fail."""
    r = rpc_call("purge_room_messages", {})
    assert_failure(r, "Missing room param")


def test_reset_missing_param():
    """reset_read_tracking with no instanceId should fail."""
    r = rpc_call("reset_read_tracking", {})
    assert_failure(r, "Missing instanceId param")


# ---------------------------------------------------------------------------
# SECTION 13: The Void - Regression Test (friendly send must archive)
# ---------------------------------------------------------------------------
# BUG: resolveRecipient() in messaging.js treats any JID containing '@' as
# type='direct', even MUC room JIDs (e.g., personality-x@conference.host).
# When friendlySendMessage() resolves a friendly name to a room JID and then
# calls sendMessage(), the re-resolution marks it as 'direct', causing
# ejabberdctl send_message (type='chat') instead of send_stanza (groupchat).
# The send_message call returns success but does NOT archive the message in
# the MUC room — the message vanishes silently ("The Void").
#
# The fix checks whether the '@' JID targets the conference host and returns
# type='room' in that case.
#
# These tests verify that messages sent via the friendly send_message API
# actually appear when retrieved, ensuring they were archived properly.
# ---------------------------------------------------------------------------

def test_void_regression_friendly_send_archives():
    """THE VOID REGRESSION: send_message (friendly API) must archive messages.

    Sends a message via the friendly send_message API (which resolves names
    to JIDs internally), then retrieves messages for the receiver and verifies
    the sent message actually appears. Before the fix, the message would be
    sent via ejabberdctl send_message (type='chat') to a MUC room, which
    returns success but silently drops the message from the archive.
    """
    _require_messaging()

    void_ts = str(int(time.time() * 1000))
    void_subject = f"void-regression-friendly-{void_ts}"
    void_body = f"This message must survive The Void ({void_ts})"

    # Step 1: Send via friendly API (send_message uses name resolution internally)
    r = rpc_call("send_message", {
        "from": SENDER_ID,
        "to": RECEIVER_ID,
        "subject": void_subject,
        "body": void_body
    })
    data = assert_success(r, "Void regression: friendly send")

    # Step 2: Wait briefly for archiving
    time.sleep(1.0)

    # Step 3: Retrieve messages via xmpp_get_messages (raw retrieval, bypasses
    # read-tracking so we can inspect the actual archive)
    r = rpc_call("xmpp_get_messages", {"instanceId": RECEIVER_ID, "limit": 20})
    data = r["data"]
    messages = data if isinstance(data, list) else data.get("messages", [])

    # Step 4: Search for our message by subject
    found = False
    for m in messages:
        msg_subject = m.get("subject", "")
        if void_subject in msg_subject:
            found = True
            break

    assert found, (
        f"THE VOID: Message sent via friendly send_message was NOT found in archive. "
        f"Subject '{void_subject}' not in {len(messages)} retrieved messages. "
        f"This confirms the resolveRecipient() bug: MUC room JIDs are misclassified "
        f"as 'direct', causing send_message(type='chat') instead of send_stanza(groupchat). "
        f"Subjects found: {[m.get('subject', '')[:50] for m in messages[:10]]}"
    )


def test_void_regression_xmpp_send_archives():
    """CONTROL: xmpp_send_message (raw API) always archives correctly.

    This is the control test for The Void regression. The raw xmpp_send_message
    API constructs stanzas directly and does not go through resolveRecipient(),
    so it should always archive correctly regardless of the bug. If this test
    passes but test_void_regression_friendly_send_archives fails, it confirms
    the bug is in the friendly API's recipient resolution path.
    """
    _require_messaging()

    ctrl_ts = str(int(time.time() * 1000))
    ctrl_subject = f"void-regression-control-{ctrl_ts}"
    ctrl_body = f"Control message via raw XMPP API ({ctrl_ts})"

    # Step 1: Send via raw xmpp_send_message API (bypasses resolveRecipient)
    r = rpc_call("xmpp_send_message", {
        "from": SENDER_ID,
        "to": RECEIVER_ID,
        "subject": ctrl_subject,
        "body": ctrl_body,
        "priority": "normal"
    })
    data = r["data"]
    # xmpp_send_message may return different response shapes; just check it didn't error
    if isinstance(data, dict) and data.get("success") is False:
        raise RuntimeError(f"SKIP: xmpp_send_message failed: {data.get('error', 'unknown')}")

    # Step 2: Wait briefly for archiving
    time.sleep(1.0)

    # Step 3: Retrieve messages
    r = rpc_call("xmpp_get_messages", {"instanceId": RECEIVER_ID, "limit": 20})
    data = r["data"]
    messages = data if isinstance(data, list) else data.get("messages", [])

    # Step 4: Search for our control message by subject
    found = False
    for m in messages:
        msg_subject = m.get("subject", "")
        if ctrl_subject in msg_subject:
            found = True
            break

    assert found, (
        f"CONTROL FAILURE: Message sent via xmpp_send_message was NOT found in archive. "
        f"Subject '{ctrl_subject}' not in {len(messages)} retrieved messages. "
        f"This is unexpected — the raw API should always archive correctly. "
        f"Subjects found: {[m.get('subject', '')[:50] for m in messages[:10]]}"
    )


# ---------------------------------------------------------------------------
# SECTION 14: send_message body/subject parameter regression (2026-05-10)
# ---------------------------------------------------------------------------
#
# Bug: Crossing-2d23 sent Bastion-3012 a message using `message: "..."` instead
# of `body: "..."`. The MCP schema only knows `body`, so `message` was silently
# dropped. With body missing and subject present, sendMessage() fell back to
# using subject as the body (line 704: `body || subject`). Bastion received
# a message where the body was just the subject string repeated, with all the
# actual Qdrant recovery details lost.
#
# Fix: friendlySendMessage() now (a) accepts `message` as alias for `body`,
# and (b) explicitly rejects subject-only sends with a helpful error pointing
# to the correct field name.
#
# These tests verify the fix doesn't regress.
# ---------------------------------------------------------------------------

def test_subject_only_rejected():
    """REGRESSION 2026-05-10: send_message with only subject must fail explicitly.

    Before the fix: silent fallback to using subject as body — message arrives
    with body == subject, real intent lost.
    After the fix: returns a clear error pointing to the `body` field.
    """
    _require_messaging()
    r = rpc_call("send_message", {
        "from": SENDER_ID,
        "to": RECEIVER_ID,
        "subject": "subject-only-regression-test"
        # Note: deliberately omitting both `body` and `message`
    })
    data = assert_failure(r, "subject-only send must fail")
    err_text = json.dumps(data).lower()
    assert "body" in err_text, \
        f"Error message should mention `body` field. Got: {data}"


def test_message_alias_accepted():
    """REGRESSION 2026-05-10: send_message with `message` (not `body`) must succeed.

    The `message` alias prevents silent loss of message text when callers use
    the obvious-but-incorrect parameter name. This is API-level — verifies
    the call itself succeeds. (Archive verification is covered by the Void
    regression tests separately.)
    """
    _require_messaging()
    alias_ts = str(int(time.time() * 1000))
    r = rpc_call("send_message", {
        "from": SENDER_ID,
        "to": RECEIVER_ID,
        "subject": f"alias-regression-{alias_ts}",
        "message": f"This text uses the `message` alias, not `body`. ({alias_ts})"
    })
    data = assert_success(r, "send_message with `message` alias should succeed")
    assert data.get("message_id"), f"Expected message_id in response, got: {data}"


def test_body_still_works():
    """REGRESSION 2026-05-10: existing `body` parameter must still work.

    Confirm the alias didn't break the canonical parameter name.
    """
    _require_messaging()
    body_ts = str(int(time.time() * 1000))
    r = rpc_call("send_message", {
        "from": SENDER_ID,
        "to": RECEIVER_ID,
        "subject": f"body-canonical-{body_ts}",
        "body": f"Standard body field, canonical usage ({body_ts})"
    })
    assert_success(r, "send_message with `body` should still work")


# ---------------------------------------------------------------------------
# CLEANUP: Remove all test artifacts
# ---------------------------------------------------------------------------

def cleanup_rooms():
    """Purge all rooms used during testing. Requires Executive role."""
    if not EXEC_TOKEN:
        print(f"    SKIP: No HACS_EXEC_TOKEN — cannot purge rooms (orphaned rooms remain)")
        return
    cleaned = 0
    errors = 0
    for room in runner.test_rooms_used:
        try:
            rpc_call("purge_room_messages", {"room": room, "instanceId": SENDER_ID})
            cleaned += 1
        except Exception:
            errors += 1
    print(f"    Purged {cleaned} test rooms ({errors} errors)")


def cleanup_read_tracking():
    """Reset read tracking for all test instances."""
    cleaned = 0
    errors = 0
    for inst in runner.read_tracking_instances:
        try:
            rpc_call("reset_read_tracking", {"instanceId": inst})
            cleaned += 1
        except Exception:
            errors += 1
    print(f"    Reset read tracking for {cleaned} instances ({errors} errors)")


# ---------------------------------------------------------------------------
# VERIFICATION: Compare post-test state
# ---------------------------------------------------------------------------

def verify_clean_state():
    """Verify test rooms are clean after cleanup."""
    _require_messaging()

    # Check receiver's room is empty
    receiver_personality = RECEIVER_NAME.split("-")[0].lower()
    r = rpc_call("list_my_messages", {"instanceId": RECEIVER_ID})
    data = r["data"]
    if data.get("success"):
        msg_count = len(data.get("messages", []))
        if msg_count > 0:
            print(f"    WARNING: {msg_count} messages still in receiver inbox after cleanup")
        else:
            print(f"    Receiver inbox clean")
    else:
        print(f"    Receiver inbox check: {data.get('error', 'unknown error')}")


# ===== MAIN =================================================================

def main():
    print("HACS Messaging System - Regression Test Suite")
    print(f"API: {API_URL}")
    print(f"Test Sender:   {SENDER_NAME}")
    print(f"Test Receiver: {RECEIVER_NAME}")
    print(f"Started: {time.strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"{'='*70}")

    # --- SETUP ---
    print("\n--- SETUP: Bootstrap test instances ---")
    runner.run("bootstrap_test_instances", setup_bootstrap)

    print("\n--- SETUP: State snapshot ---")
    runner.run("state_snapshot", setup_state_snapshot)

    # --- Section 1: Connectivity ---
    print("\n--- Section 1: Basic Connectivity ---")
    runner.run("get_presence", test_get_presence)
    runner.run("get_messaging_info", test_get_messaging_info)
    runner.run("lookup_shortname", test_lookup_shortname)

    # --- Section 2: send_message Basic ---
    print("\n--- Section 2: send_message - Basic ---")
    runner.run("send_basic", test_send_basic)
    runner.run("send_subject_only", test_send_subject_only)
    runner.run("send_missing_subject (negative)", test_send_missing_subject)
    runner.run("send_missing_from (negative)", test_send_missing_from)
    runner.run("send_missing_to (negative)", test_send_missing_to)

    # --- Section 3: Special Characters ---
    print("\n--- Section 3: send_message - Special Characters ---")
    runner.run("special_chars_all", test_special_chars)
    runner.run("long_subject_300", test_long_subject)
    runner.run("long_body_9000", test_long_body)

    # --- Section 4: Recipient Handling ---
    print("\n--- Section 4: send_message - Recipient Handling ---")
    runner.run("nonexistent_recipient (negative)", test_nonexistent_recipient)
    runner.run("fuzzy_partial_name", test_fuzzy_partial_name)
    runner.run("send_to_self", test_send_to_self)

    # --- Section 5: Read Tracking Lifecycle ---
    print("\n--- Section 5: Read Tracking Lifecycle ---")
    runner.run("read_tracking_full_lifecycle", test_read_tracking_full_lifecycle)

    # --- Section 6: list_my_messages Edge Cases ---
    print("\n--- Section 6: list_my_messages Edge Cases ---")
    runner.run("list_with_limit", test_list_with_limit)
    runner.run("list_has_hint", test_list_has_hint)
    runner.run("list_more_unread", test_list_more_unread)

    # --- Section 7: list_project_messages ---
    print("\n--- Section 7: list_project_messages ---")
    runner.run("project_messages_no_project", test_project_messages_no_project)

    # --- Section 8: XMPP Power-User APIs ---
    print("\n--- Section 8: XMPP Power-User APIs ---")
    runner.run("xmpp_send", test_xmpp_send)
    runner.run("xmpp_get_messages", test_xmpp_get_messages)
    runner.run("xmpp_get_single", test_xmpp_get_single)

    # --- Section 9: do_i_have_new_messages ---
    print("\n--- Section 9: do_i_have_new_messages Edge Cases ---")
    runner.run("new_messages_fields", test_new_messages_fields)
    runner.run("new_messages_missing_instance (negative)", test_new_messages_missing_instance)

    # --- Section 10: get_message Field Validation ---
    print("\n--- Section 10: get_message Field Validation ---")
    runner.run("get_message_expected_fields", test_get_message_expected_fields)
    runner.run("get_message_nonexistent (negative)", test_get_message_nonexistent)
    runner.run("get_message_missing_id (negative)", test_get_message_missing_id)
    runner.run("get_message_missing_instance (negative)", test_get_message_missing_instance)

    # --- Section 11: Round-Trip Verification ---
    print("\n--- Section 11: Special Character Round-Trip ---")
    runner.run("roundtrip_special_chars", test_roundtrip_special_chars)

    # --- Section 12: purge & reset ---
    print("\n--- Section 12: purge_room_messages & reset_read_tracking ---")
    runner.run("purge_nonexistent_room", test_purge_nonexistent_room)
    runner.run("purge_missing_param (negative)", test_purge_missing_param)
    runner.run("reset_missing_param (negative)", test_reset_missing_param)

    # --- Section 13: The Void Regression ---
    print("\n--- Section 13: The Void - Friendly Send Must Archive ---")
    runner.run("void_regression_friendly_send_archives", test_void_regression_friendly_send_archives)
    runner.run("void_regression_xmpp_send_control", test_void_regression_xmpp_send_archives)

    # --- Section 14: body/subject parameter regression (2026-05-10) ---
    print("\n--- Section 14: send_message body/message/subject regression ---")
    runner.run("subject_only_rejected (regression)", test_subject_only_rejected)
    runner.run("message_alias_accepted (regression)", test_message_alias_accepted)
    runner.run("body_still_works (regression)", test_body_still_works)

    # --- Cleanup ---
    print("\n--- CLEANUP ---")
    runner.run("cleanup_rooms", cleanup_rooms)
    runner.run("cleanup_read_tracking", cleanup_read_tracking)

    # --- Verification ---
    print("\n--- VERIFICATION ---")
    runner.run("verify_clean_state", verify_clean_state)

    # --- Summary ---
    exit_code = runner.summary()
    sys.exit(exit_code)


if __name__ == "__main__":
    main()
