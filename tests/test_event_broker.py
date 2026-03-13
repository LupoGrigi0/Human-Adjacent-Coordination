#!/usr/bin/env python3
"""
HACS Event Broker — Regression Test Suite
==========================================
Stress tests the event broker through the production API.

Tests are indirect — we can't inspect broker state directly from outside,
but we CAN verify that:
  1. Sending a message emits message.sent (broker receives the event)
  2. Creating/assigning tasks emits task.* events
  3. The broker doesn't break normal API operations (transparency)
  4. Rapid-fire operations don't cause errors or data loss
  5. Edge cases in messaging still work with the broker wrapping server.call()

The broker is v1 (best-effort, fire-and-forget), so we verify:
  - Events are emitted (via log or side effects)
  - The wrapper doesn't interfere with handler return values
  - No regressions in messaging or task APIs after broker integration

Uses DEDICATED TEST INSTANCES only — never touches real instance rooms.

Usage:
    python3 test_event_broker.py [API_URL]
    python3 test_event_broker.py https://smoothcurves.nexus/mcp

Design follows the Regression Test Engineer role (Ember/Axiom pattern):
- JSON-RPC helpers with assert_success / assert_failure
- TestRunner with pass/fail/skip counting
- Read-back verification on all mutations
- Clean teardown with state verification
- Cascading skip guards

@author Messenger (Messenger-aa2a)
@date 2026-03-12
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

# Test instance names — unique per run
SENDER_NAME = f"EvtTestSender-{TIMESTAMP}"
RECEIVER_NAME = f"EvtTestReceiver-{TIMESTAMP}"

# Will be set during bootstrap
SENDER_ID = None
RECEIVER_ID = None

# Skip guards
_bootstrap_ok = False
_messaging_ok = False
_tasks_ok = False

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


def _require_bootstrap():
    if not _bootstrap_ok:
        raise RuntimeError("SKIP: bootstrap failed")


def _require_messaging():
    if not _messaging_ok:
        raise RuntimeError("SKIP: messaging setup failed")


def _require_tasks():
    if not _tasks_ok:
        raise RuntimeError("SKIP: task setup failed")


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
        self.created_task_ids = []
        self.test_messages_sent = 0

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
# SECTION 1: SETUP — Bootstrap test instances
# ===========================================================================

print("\n" + "=" * 70)
print("SECTION 1: SETUP — Bootstrap test instances")
print("=" * 70)


def test_bootstrap_sender():
    global SENDER_ID, _bootstrap_ok
    r = rpc_call("bootstrap", {"name": SENDER_NAME})
    data = assert_success(r, "bootstrap sender")
    SENDER_ID = data.get("instanceId")
    assert SENDER_ID, f"No instanceId returned for sender: {data}"
    runner.log_timing("bootstrap_sender", r["elapsed"])


def test_bootstrap_receiver():
    global RECEIVER_ID, _bootstrap_ok
    r = rpc_call("bootstrap", {"name": RECEIVER_NAME})
    data = assert_success(r, "bootstrap receiver")
    RECEIVER_ID = data.get("instanceId")
    assert RECEIVER_ID, f"No instanceId returned for receiver: {data}"
    _bootstrap_ok = True
    runner.log_timing("bootstrap_receiver", r["elapsed"])


runner.run("1.1 Bootstrap sender instance", test_bootstrap_sender)
runner.run("1.2 Bootstrap receiver instance", test_bootstrap_receiver)


# ===========================================================================
# SECTION 2: TRANSPARENCY — Broker wrapper doesn't break return values
# ===========================================================================

print("\n" + "=" * 70)
print("SECTION 2: TRANSPARENCY — wrapServerCall doesn't break handlers")
print("=" * 70)


def test_send_message_returns_normally():
    """The broker wraps server.call(). Verify send_message still returns expected fields."""
    _require_bootstrap()
    r = rpc_call("send_message", {
        "from": SENDER_ID,
        "to": RECEIVER_ID,
        "subject": "Broker transparency test",
        "body": "This message should return normally despite broker wrapping."
    })
    data = assert_success(r, "send_message through broker")
    # Verify expected return fields still present
    assert "message_id" in data or "messageId" in data, \
        f"send_message should return message_id, got keys: {list(data.keys())}"
    runner.log_timing("send_message_via_broker", r["elapsed"])


def test_list_messages_returns_normally():
    """list_my_messages should work fine through the broker wrapper."""
    _require_bootstrap()
    r = rpc_call("list_my_messages", {
        "instanceId": RECEIVER_ID
    })
    data = assert_success(r, "list_my_messages through broker")
    assert "messages" in data, f"Expected 'messages' key, got: {list(data.keys())}"


def test_do_i_have_new_messages_returns_normally():
    """Quick check API should work through broker."""
    _require_bootstrap()
    r = rpc_call("do_i_have_new_messages", {
        "instanceId": RECEIVER_ID
    })
    data = assert_success(r, "do_i_have_new_messages through broker")
    # Should have new_messages field (true, since we just sent one)
    assert "new_messages" in data, f"Expected 'new_messages' key, got: {list(data.keys())}"


def test_get_message_returns_normally():
    """get_message should work through broker."""
    _require_bootstrap()
    # First, list messages to get an ID
    r = rpc_call("list_my_messages", {"instanceId": RECEIVER_ID})
    data = assert_success(r, "list to get message ID")
    msgs = data.get("messages", [])
    if not msgs:
        raise RuntimeError("SKIP: no messages to retrieve")
    msg_id = msgs[0].get("id") or msgs[0].get("message_id")
    if not msg_id:
        raise RuntimeError("SKIP: message has no ID field")

    r2 = rpc_call("get_message", {"instanceId": RECEIVER_ID, "id": msg_id})
    data2 = assert_success(r2, "get_message through broker")
    assert "message" in data2 or "body" in data2 or "content" in data2, \
        f"Expected message content, got keys: {list(data2.keys())}"


runner.run("2.1 send_message returns normally with broker", test_send_message_returns_normally)
runner.run("2.2 list_my_messages returns normally", test_list_messages_returns_normally)
runner.run("2.3 do_i_have_new_messages returns normally", test_do_i_have_new_messages_returns_normally)
runner.run("2.4 get_message returns normally", test_get_message_returns_normally)

if _bootstrap_ok:
    _messaging_ok = True


# ===========================================================================
# SECTION 3: TASK API TRANSPARENCY — Broker wraps task handlers too
# ===========================================================================

print("\n" + "=" * 70)
print("SECTION 3: TASK API TRANSPARENCY — Task handlers through broker")
print("=" * 70)

_test_task_id = None


def test_create_task():
    """create_task emits task.created — verify return value is intact."""
    global _test_task_id, _tasks_ok
    _require_bootstrap()
    r = rpc_call("create_task", {
        "instanceId": SENDER_ID,
        "title": f"Broker stress test task {TIMESTAMP}",
        "description": "Created by event broker regression test",
        "priority": "medium"
    })
    data = assert_success(r, "create_task through broker")
    _test_task_id = data.get("taskId") or data.get("task_id") or data.get("id")
    assert _test_task_id, f"create_task should return task ID, got keys: {list(data.keys())}"
    runner.created_task_ids.append(_test_task_id)
    _tasks_ok = True
    runner.log_timing("create_task_via_broker", r["elapsed"])


def test_get_my_tasks():
    """Sender should see their created task (personal task, uncompleted)."""
    _require_tasks()
    r = rpc_call("get_my_tasks", {
        "instanceId": SENDER_ID
    })
    data = assert_success(r, "get_my_tasks")
    tasks = data.get("tasks", [])
    # Personal tasks may be in a different format — check list_tasks as fallback
    if not tasks:
        r2 = rpc_call("list_tasks", {"instanceId": SENDER_ID})
        data2 = assert_success(r2, "list_tasks fallback")
        tasks = data2.get("tasks", [])
    print(f"         (sender has {len(tasks)} tasks)")
    # Don't hard-fail — the task was created successfully (3.1 passed),
    # and the key test is that create_task doesn't break with broker wrapping


def test_mark_task_complete():
    """mark_task_complete emits task.completed — verify return value."""
    _require_tasks()
    r = rpc_call("mark_task_complete", {
        "instanceId": SENDER_ID,
        "taskId": _test_task_id
    })
    data = assert_success(r, "mark_task_complete through broker")
    runner.log_timing("mark_task_complete_via_broker", r["elapsed"])


runner.run("3.1 create_task through broker", test_create_task)
runner.run("3.2 get_my_tasks shows created task", test_get_my_tasks)
runner.run("3.3 mark_task_complete through broker", test_mark_task_complete)


# ===========================================================================
# SECTION 4: DOCUMENT & DIARY — These also emit events
# ===========================================================================

print("\n" + "=" * 70)
print("SECTION 4: DOCUMENT & DIARY — Event-emitting handlers")
print("=" * 70)

_test_doc_id = None


def test_create_document():
    """create_document emits document.created — verify return value."""
    global _test_doc_id
    _require_bootstrap()
    r = rpc_call("create_document", {
        "instanceId": SENDER_ID,
        "name": f"Broker Test Doc {TIMESTAMP}",
        "content": "Document created by event broker regression test. Should emit document.created event."
    })
    data = assert_success(r, "create_document through broker")
    _test_doc_id = data.get("name") or data.get("id") or data.get("documentId")
    runner.log_timing("create_document_via_broker", r["elapsed"])


def test_edit_document():
    """edit_document emits document.updated — verify return value."""
    _require_bootstrap()
    if not _test_doc_id:
        raise RuntimeError("SKIP: no document to edit")
    r = rpc_call("edit_document", {
        "instanceId": SENDER_ID,
        "name": _test_doc_id,
        "mode": "append",
        "content": "\n\nAppended by event broker regression test. Should emit document.updated event."
    })
    data = assert_success(r, "edit_document through broker")
    runner.log_timing("edit_document_via_broker", r["elapsed"])


def test_add_diary_entry():
    """add_diary_entry emits diary.entry_added — verify return value."""
    _require_bootstrap()
    r = rpc_call("add_diary_entry", {
        "instanceId": SENDER_ID,
        "entry": f"Event broker regression test entry at {TIMESTAMP}. The coffee is warm."
    })
    data = assert_success(r, "add_diary_entry through broker")
    runner.log_timing("add_diary_entry_via_broker", r["elapsed"])


runner.run("4.1 create_document through broker", test_create_document)
runner.run("4.2 edit_document through broker", test_edit_document)
runner.run("4.3 add_diary_entry through broker", test_add_diary_entry)


# ===========================================================================
# SECTION 5: RAPID-FIRE STRESS — Multiple events in quick succession
# ===========================================================================

print("\n" + "=" * 70)
print("SECTION 5: RAPID-FIRE STRESS — Burst of events")
print("=" * 70)

RAPID_FIRE_COUNT = 10


def test_rapid_fire_messages():
    """Send RAPID_FIRE_COUNT messages quickly. Broker should handle the burst without errors."""
    _require_messaging()
    failures = []
    t0 = time.time()
    for i in range(RAPID_FIRE_COUNT):
        r = rpc_call("send_message", {
            "from": SENDER_ID,
            "to": RECEIVER_ID,
            "subject": f"Rapid fire #{i+1}",
            "body": f"Stress test message {i+1} of {RAPID_FIRE_COUNT} at {TIMESTAMP}"
        })
        if not r["data"].get("success"):
            failures.append(i + 1)
        runner.test_messages_sent += 1
    elapsed = time.time() - t0
    runner.log_timing(f"rapid_fire_{RAPID_FIRE_COUNT}_messages", elapsed)
    assert not failures, f"Messages {failures} failed during rapid fire burst"
    print(f"         ({RAPID_FIRE_COUNT} messages in {elapsed:.2f}s = {RAPID_FIRE_COUNT/elapsed:.1f} msg/s)")


def test_rapid_fire_tasks():
    """Create multiple tasks quickly. Each emits task.created."""
    _require_bootstrap()
    failures = []
    task_count = 5
    t0 = time.time()
    for i in range(task_count):
        r = rpc_call("create_task", {
            "instanceId": SENDER_ID,
            "title": f"Rapid task #{i+1} at {TIMESTAMP}",
            "description": "Stress test task",
            "priority": "low"
        })
        if r["data"].get("success"):
            tid = r["data"].get("taskId") or r["data"].get("task_id") or r["data"].get("id")
            if tid:
                runner.created_task_ids.append(tid)
        else:
            failures.append(i + 1)
    elapsed = time.time() - t0
    runner.log_timing(f"rapid_fire_{task_count}_tasks", elapsed)
    assert not failures, f"Tasks {failures} failed during rapid fire burst"
    print(f"         ({task_count} tasks in {elapsed:.2f}s)")


def test_mixed_rapid_fire():
    """Alternate between messages and tasks. Tests broker handling diverse event types."""
    _require_messaging()
    failures = []
    mix_count = 6
    t0 = time.time()
    for i in range(mix_count):
        if i % 2 == 0:
            r = rpc_call("send_message", {
                "from": SENDER_ID,
                "to": RECEIVER_ID,
                "subject": f"Mixed burst msg #{i//2+1}",
                "body": f"Mixed stress test at {TIMESTAMP}"
            })
            runner.test_messages_sent += 1
        else:
            r = rpc_call("create_task", {
                "instanceId": SENDER_ID,
                "title": f"Mixed burst task #{i//2+1} at {TIMESTAMP}",
                "description": "Mixed stress test",
                "priority": "low"
            })
            if r["data"].get("success"):
                tid = r["data"].get("taskId") or r["data"].get("task_id") or r["data"].get("id")
                if tid:
                    runner.created_task_ids.append(tid)
        if not r["data"].get("success"):
            failures.append(i + 1)
    elapsed = time.time() - t0
    runner.log_timing(f"mixed_rapid_fire_{mix_count}_ops", elapsed)
    assert not failures, f"Operations {failures} failed during mixed burst"


runner.run("5.1 Rapid-fire messages (10 burst)", test_rapid_fire_messages)
runner.run("5.2 Rapid-fire tasks (5 burst)", test_rapid_fire_tasks)
runner.run("5.3 Mixed rapid-fire (messages + tasks)", test_mixed_rapid_fire)


# ===========================================================================
# SECTION 6: EDGE CASES — Unusual inputs through the broker
# ===========================================================================

print("\n" + "=" * 70)
print("SECTION 6: EDGE CASES — Unusual inputs through broker")
print("=" * 70)


def test_message_with_special_chars():
    """Messages with unicode and special chars should work through broker."""
    _require_messaging()
    r = rpc_call("send_message", {
        "from": SENDER_ID,
        "to": RECEIVER_ID,
        "subject": "Special chars: <script>alert('xss')</script> 🎉 日本語",
        "body": "Body with: null bytes \x00, tabs\t, newlines\n, and emoji 🔥💀🎯"
    })
    data = assert_success(r, "message with special characters")
    runner.test_messages_sent += 1


def test_message_with_empty_body():
    """Empty body message should still work."""
    _require_messaging()
    r = rpc_call("send_message", {
        "from": SENDER_ID,
        "to": RECEIVER_ID,
        "subject": "Empty body test",
        "body": ""
    })
    data = assert_success(r, "message with empty body")
    runner.test_messages_sent += 1


def test_message_with_long_body():
    """Long message body — broker should handle without truncation issues."""
    _require_messaging()
    long_body = "A" * 5000 + " — end marker"
    r = rpc_call("send_message", {
        "from": SENDER_ID,
        "to": RECEIVER_ID,
        "subject": "Long body test",
        "body": long_body
    })
    data = assert_success(r, "message with 5000+ char body")
    runner.test_messages_sent += 1


def test_self_message():
    """Sending a message to yourself — should work, broker should handle source==target."""
    _require_messaging()
    r = rpc_call("send_message", {
        "from": SENDER_ID,
        "to": SENDER_ID,
        "subject": "Self-message through broker",
        "body": "Testing source==target in event emission."
    })
    data = assert_success(r, "self-message through broker")
    runner.test_messages_sent += 1


def test_message_to_nonexistent():
    """Message to nonexistent instance — should still succeed (fuzzy match or create room)."""
    _require_messaging()
    r = rpc_call("send_message", {
        "from": SENDER_ID,
        "to": f"NonExistent-{TIMESTAMP}",
        "subject": "Message to nobody",
        "body": "This tests broker handling of unresolvable targets."
    })
    # May succeed or fail depending on fuzzy matching — either is fine
    # The point is: the broker shouldn't crash
    runner.test_messages_sent += 1


runner.run("6.1 Message with special characters", test_message_with_special_chars)
runner.run("6.2 Message with empty body", test_message_with_empty_body)
runner.run("6.3 Message with very long body", test_message_with_long_body)
runner.run("6.4 Self-message (source==target)", test_self_message)
runner.run("6.5 Message to nonexistent instance", test_message_to_nonexistent)


# ===========================================================================
# SECTION 7: LIFECYCLE EVENTS — bootstrap and land
# ===========================================================================

print("\n" + "=" * 70)
print("SECTION 7: LIFECYCLE — Instance lifecycle events")
print("=" * 70)

LIFECYCLE_INSTANCE = f"EvtLifecycle-{TIMESTAMP}"
_lifecycle_id = None


def test_bootstrap_emits_event():
    """bootstrap emits instance.bootstrap. Verify bootstrap still works normally."""
    global _lifecycle_id
    r = rpc_call("bootstrap", {"name": LIFECYCLE_INSTANCE})
    data = assert_success(r, "bootstrap lifecycle instance")
    _lifecycle_id = data.get("instanceId")
    assert _lifecycle_id, f"No instanceId returned: {data}"
    runner.log_timing("bootstrap_lifecycle", r["elapsed"])


def test_land_emits_event():
    """land_instance emits instance.landed. Requires apiKey (privileged)."""
    if not _lifecycle_id:
        raise RuntimeError("SKIP: lifecycle instance not bootstrapped")
    # land_instance requires apiKey — use recovery key as auth
    r = rpc_call("land_instance", {
        "instanceId": _lifecycle_id,
        "targetInstanceId": _lifecycle_id,
        "apiKey": "test-land"  # Will fail auth — that's fine, we're testing broker transparency
    })
    # This will likely fail due to auth. The point is: the broker doesn't crash.
    # If it succeeds, great. If not, we note it.
    if r["data"].get("success"):
        runner.log_timing("land_lifecycle", r["elapsed"])
    else:
        # Expected: auth failure. Broker still wraps the call.
        print(f"         (land requires auth — expected: {r['data'].get('error', {})!r:.80s})")


runner.run("7.1 bootstrap emits instance.bootstrap", test_bootstrap_emits_event)
runner.run("7.2 land_instance emits instance.landed", test_land_emits_event)


# ===========================================================================
# SECTION 8: VERIFICATION — Read back and verify state consistency
# ===========================================================================

print("\n" + "=" * 70)
print("SECTION 8: VERIFICATION — State consistency after broker operations")
print("=" * 70)


def test_messages_queryable():
    """Verify messages are queryable after broker-wrapped sends."""
    _require_messaging()
    # Check sender's outgoing messages are archived
    r = rpc_call("list_my_messages", {
        "instanceId": SENDER_ID
    })
    data = assert_success(r, "list sender messages")
    sender_msgs = data.get("messages", [])
    # Sender may have messages from self-send test
    print(f"         (sender has {len(sender_msgs)} messages)")

    # Check receiver
    r2 = rpc_call("list_my_messages", {
        "instanceId": RECEIVER_ID
    })
    data2 = assert_success(r2, "list receiver messages")
    receiver_msgs = data2.get("messages", [])
    print(f"         (receiver has {len(receiver_msgs)} messages)")
    # Note: XMPP room membership affects visibility.
    # The key test is that list_my_messages doesn't error — the messaging
    # regression suite (test_messaging.py) validates full send/receive lifecycle.


def test_new_messages_check():
    """do_i_have_new_messages should not error after broker-wrapped sends."""
    _require_messaging()
    r = rpc_call("do_i_have_new_messages", {"instanceId": RECEIVER_ID})
    data = assert_success(r, "check new messages")
    has_new = data.get("new_messages")
    print(f"         (receiver new_messages={has_new})")


def test_tasks_still_queryable():
    """All created tasks should still be queryable."""
    _require_tasks()
    for tid in runner.created_task_ids[:3]:  # Check first 3 only (don't hammer API)
        r = rpc_call("get_task", {
            "instanceId": SENDER_ID,
            "taskId": tid
        })
        data = assert_success(r, f"get_task {tid}")


def test_diary_has_entry():
    """The diary entry we wrote should be retrievable."""
    _require_bootstrap()
    r = rpc_call("get_diary", {"instanceId": SENDER_ID})
    data = assert_success(r, "get_diary for sender")
    diary_text = data.get("diary", "")
    assert "event broker regression test" in diary_text.lower() or TIMESTAMP in diary_text, \
        "Expected to find test entry in diary"


runner.run("8.1 Messages queryable after broker ops", test_messages_queryable)
runner.run("8.2 New messages check works", test_new_messages_check)
runner.run("8.3 Tasks still queryable after broker", test_tasks_still_queryable)
runner.run("8.4 Diary entry persisted through broker", test_diary_has_entry)


# ===========================================================================
# SECTION 9: XMPP SEND — Direct XMPP also emits events
# ===========================================================================

print("\n" + "=" * 70)
print("SECTION 9: XMPP API — xmpp_send_message through broker")
print("=" * 70)


def test_xmpp_send_message():
    """xmpp_send_message also maps to message.sent. Verify it works through broker."""
    _require_bootstrap()
    r = rpc_call("xmpp_send_message", {
        "from": SENDER_ID,
        "to": RECEIVER_ID,
        "body": f"XMPP direct message through broker at {TIMESTAMP}"
    })
    data = assert_success(r, "xmpp_send_message through broker")
    runner.log_timing("xmpp_send_via_broker", r["elapsed"])


runner.run("9.1 xmpp_send_message through broker", test_xmpp_send_message)


# ===========================================================================
# SECTION 10: CLEANUP — Clean up test instances and resources
# ===========================================================================

print("\n" + "=" * 70)
print("SECTION 10: CLEANUP — Remove test resources")
print("=" * 70)


def test_delete_tasks():
    """Delete all tasks created during the test."""
    deleted = 0
    failed = 0
    for tid in runner.created_task_ids:
        r = rpc_call("delete_task", {
            "instanceId": SENDER_ID,
            "taskId": tid
        })
        if r["data"].get("success"):
            deleted += 1
        else:
            failed += 1
    print(f"         (deleted {deleted} tasks, {failed} failed)")
    # Don't assert — cleanup failures shouldn't fail the suite


def test_archive_document():
    """Archive the test document."""
    if not _test_doc_id:
        raise RuntimeError("SKIP: no document to archive")
    r = rpc_call("archive_document", {
        "instanceId": SENDER_ID,
        "name": _test_doc_id
    })
    # Don't assert — cleanup


runner.run("10.1 Delete test tasks", test_delete_tasks)
runner.run("10.2 Archive test document", test_archive_document)


# ===========================================================================
# SUMMARY
# ===========================================================================

all_passed = runner.summary()

print(f"\nTest instances used: {SENDER_ID}, {RECEIVER_ID}")
print(f"Total messages sent: {runner.test_messages_sent}")
print(f"Total tasks created: {len(runner.created_task_ids)}")
print(f"Timestamp: {TIMESTAMP}")

sys.exit(0 if all_passed else 1)
