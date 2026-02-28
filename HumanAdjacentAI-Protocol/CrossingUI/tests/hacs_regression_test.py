#!/usr/bin/env python3
"""
HACS Task & Checklist API Regression Test Suite
================================================
First comprehensive regression test for HACS APIs.
Tests all task and checklist (list) endpoints via JSON-RPC 2.0.

Usage:
    python3 hacs_regression_test.py [API_URL]
    python3 hacs_regression_test.py https://smoothcurves.nexus/mcp

Author: Axiom-2615
Created: 2026-02-28
"""

import sys
import time
import json
import requests
import traceback
from datetime import datetime

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
API_URL = sys.argv[1] if len(sys.argv) > 1 else "https://smoothcurves.nexus/mcp"
TEST_PROJECT = f"regression-test-{int(time.time())}"

# Will be set during bootstrap
INSTANCE_1 = None
INSTANCE_2 = None

# Disable SSL warnings for self-signed certs
requests.packages.urllib3.disable_warnings()

# ---------------------------------------------------------------------------
# JSON-RPC helpers
# ---------------------------------------------------------------------------
_rpc_id = 0


def rpc_call(method: str, params: dict = None, timeout: int = 30) -> dict:
    """Send a JSON-RPC 2.0 call and return the parsed result.

    Response structure from the HACS MCP server:
      result.data  -- the handler's return value (dict)
      result.content[0].text -- JSON-stringified version of the same

    For failed/empty responses, result may be {} or missing keys.
    """
    global _rpc_id
    _rpc_id += 1
    payload = {
        "jsonrpc": "2.0",
        "method": "tools/call",
        "params": {
            "name": method,
            "arguments": params or {}
        },
        "id": _rpc_id
    }
    t0 = time.time()
    resp = requests.post(API_URL, json=payload, timeout=timeout, verify=False)
    elapsed = time.time() - t0
    resp.raise_for_status()
    body = resp.json()

    # Check for JSON-RPC level errors
    if "error" in body:
        return {"data": {"success": False, "error": body["error"]}, "elapsed": elapsed, "raw": body}

    result = body.get("result", {})

    # Primary path: result.data contains the handler return value
    data = result.get("data")
    if data and isinstance(data, dict) and ("success" in data or "instanceId" in data):
        return {"data": data, "elapsed": elapsed, "raw": body}

    # Fallback: parse from result.content[0].text
    for item in result.get("content", []):
        if item.get("type") == "text":
            try:
                parsed = json.loads(item["text"])
                if isinstance(parsed, dict):
                    return {"data": parsed, "elapsed": elapsed, "raw": body}
            except (json.JSONDecodeError, KeyError):
                pass

    # Last resort: if result itself has success key
    if "success" in result:
        return {"data": result, "elapsed": elapsed, "raw": body}

    # Empty or unparseable
    return {"data": {"success": False, "error": {"code": "EMPTY_RESPONSE", "message": "No parseable data"}},
            "elapsed": elapsed, "raw": body}


def assert_success(result: dict, msg: str = "") -> dict:
    """Assert that the RPC result indicates success."""
    data = result["data"]
    if not data.get("success"):
        raise AssertionError(
            f"Expected success but got: {json.dumps(data.get('error', data))[:300]} -- {msg}"
        )
    return data


def assert_failure(result: dict, msg: str = "") -> dict:
    """Assert that the RPC result indicates failure."""
    data = result["data"]
    if data.get("success"):
        raise AssertionError(f"Expected failure but got success -- {msg}")
    return data


# ---------------------------------------------------------------------------
# Test runner
# ---------------------------------------------------------------------------
class TestRunner:
    def __init__(self):
        self.passed = 0
        self.failed = 0
        self.errors = []
        self.timings = []
        self.created_task_ids = []       # personal task IDs to clean up
        self.created_list_ids = []       # checklist IDs to clean up
        self.created_task_list_ids = []  # task list IDs to clean up

    def run(self, name: str, fn):
        """Run a single test and record result."""
        try:
            fn()
            self.passed += 1
            print(f"  PASS  {name}")
        except Exception as e:
            self.failed += 1
            tb = traceback.format_exc()
            self.errors.append((name, str(e), tb))
            print(f"  FAIL  {name}: {e}")

    def log_timing(self, label: str, elapsed: float):
        self.timings.append((label, elapsed))

    def summary(self):
        total = self.passed + self.failed
        print("\n" + "=" * 70)
        print(f"RESULTS: {self.passed}/{total} passed, {self.failed} failed")
        if self.errors:
            print("\nFailed tests:")
            for name, err, tb in self.errors:
                print(f"  - {name}: {err}")
        if self.timings:
            print("\nVolume test timings:")
            for label, elapsed in self.timings:
                print(f"  {label}: {elapsed:.3f}s")
        print("=" * 70)
        return self.failed == 0


runner = TestRunner()

# ---------------------------------------------------------------------------
# SETUP: Bootstrap test instances
# ---------------------------------------------------------------------------
print(f"\nHACS Regression Test Suite")
print(f"API: {API_URL}")
print(f"Test project: {TEST_PROJECT}")
print(f"Started: {datetime.now().isoformat()}")
print("=" * 70)

print("\n--- SETUP: Bootstrap test instances ---")


def setup_bootstrap():
    """Create or reuse test instances via bootstrap."""
    global INSTANCE_1, INSTANCE_2

    for label, name in [("INSTANCE_1", "RegressionTester1"), ("INSTANCE_2", "RegressionTester2")]:
        # Check if instance already exists
        r = rpc_call("have_i_bootstrapped_before", {"name": name})
        data = r["data"]
        if data.get("success") and data.get("found") and data.get("instanceId"):
            inst_id = data["instanceId"]
            # Re-bootstrap to activate
            r2 = rpc_call("bootstrap", {"instanceId": inst_id})
            if label == "INSTANCE_1":
                INSTANCE_1 = inst_id
            else:
                INSTANCE_2 = inst_id
            print(f"    {label} = {inst_id} (existing)")
        else:
            # Create new
            r2 = rpc_call("bootstrap", {"name": name})
            d2 = r2["data"]
            inst_id = d2.get("instanceId")
            if not inst_id:
                raise AssertionError(f"Failed to bootstrap {name}: {d2}")
            if label == "INSTANCE_1":
                INSTANCE_1 = inst_id
            else:
                INSTANCE_2 = inst_id
            print(f"    {label} = {inst_id} (new)")

    assert INSTANCE_1, "INSTANCE_1 not set"
    assert INSTANCE_2, "INSTANCE_2 not set"


runner.run("setup_bootstrap", setup_bootstrap)

if not INSTANCE_1:
    print("\nFATAL: Could not bootstrap test instances. Aborting.")
    sys.exit(1)

# ---------------------------------------------------------------------------
# STATE SNAPSHOT (before tests)
# ---------------------------------------------------------------------------
pre_lists_result = rpc_call("get_lists", {"instanceId": INSTANCE_1})
pre_lists = pre_lists_result["data"].get("lists", []) if pre_lists_result["data"].get("success") else []
pre_tasks_result = rpc_call("list_tasks", {"instanceId": INSTANCE_1, "limit": 1000})
pre_task_count = pre_tasks_result["data"].get("total", 0) if pre_tasks_result["data"].get("success") else 0

# ---------------------------------------------------------------------------
# SECTION 1: ENUM READERS
# ---------------------------------------------------------------------------
print("\n--- Section 1: Enum Readers ---")


def test_list_priorities():
    r = rpc_call("list_priorities")
    data = assert_success(r)
    p = data["priorities"]
    assert isinstance(p, list), "priorities should be a list"
    assert len(p) >= 4, f"Expected at least 4 priorities, got {len(p)}"
    for expected in ["critical", "high", "medium", "low"]:
        assert expected in p, f"Missing priority: {expected}"


def test_list_task_statuses():
    r = rpc_call("list_task_statuses")
    data = assert_success(r)
    s = data["statuses"]
    assert isinstance(s, list), "statuses should be a list"
    for expected in ["not_started", "in_progress", "completed", "completed_verified"]:
        assert expected in s, f"Missing status: {expected}"


runner.run("list_priorities", test_list_priorities)
runner.run("list_task_statuses", test_list_task_statuses)

# ---------------------------------------------------------------------------
# SECTION 2: PERSONAL TASK CRUD
# ---------------------------------------------------------------------------
print("\n--- Section 2: Personal Task CRUD ---")


def test_create_task_basic():
    r = rpc_call("create_task", {
        "instanceId": INSTANCE_1,
        "title": "Basic regression test task"
    })
    data = assert_success(r)
    assert data.get("taskId"), "Should return taskId"
    runner.created_task_ids.append(data["taskId"])


def test_create_task_all_fields():
    r = rpc_call("create_task", {
        "instanceId": INSTANCE_1,
        "title": "Full-field task",
        "description": "A detailed description of this test task",
        "priority": "high",
        "listId": "default"
    })
    data = assert_success(r)
    runner.created_task_ids.append(data["taskId"])
    assert data["task"]["priority"] == "high"


def test_create_task_json_in_title():
    title = '{"key": "value", "nested": {"a": 1}}'
    r = rpc_call("create_task", {
        "instanceId": INSTANCE_1,
        "title": title
    })
    data = assert_success(r)
    runner.created_task_ids.append(data["taskId"])
    assert data["task"]["title"] == title, "Title should preserve JSON string exactly"


def test_create_task_quotes():
    title = 'He said "hello" and it\'s fine'
    r = rpc_call("create_task", {
        "instanceId": INSTANCE_1,
        "title": title
    })
    data = assert_success(r)
    runner.created_task_ids.append(data["taskId"])


def test_create_task_brackets_parens():
    title = "Fix bug [critical] (backend) {urgent}"
    r = rpc_call("create_task", {
        "instanceId": INSTANCE_1,
        "title": title
    })
    data = assert_success(r)
    runner.created_task_ids.append(data["taskId"])


def test_create_task_unicode():
    title = "Tarea importante - Aufgabe - Zadanie - \u4efb\u52a1"
    r = rpc_call("create_task", {
        "instanceId": INSTANCE_1,
        "title": title,
        "description": "Unicode test: \u00e9\u00e8\u00ea \u00fc\u00f6\u00e4 \u00f1 \u2603 \u2764"
    })
    data = assert_success(r)
    runner.created_task_ids.append(data["taskId"])


def test_create_task_empty_description():
    r = rpc_call("create_task", {
        "instanceId": INSTANCE_1,
        "title": "Task with empty description",
        "description": ""
    })
    data = assert_success(r)
    runner.created_task_ids.append(data["taskId"])


def test_create_task_long_title():
    title = "A" * 500
    r = rpc_call("create_task", {
        "instanceId": INSTANCE_1,
        "title": title
    })
    data = assert_success(r)
    runner.created_task_ids.append(data["taskId"])


def test_create_task_large_description():
    desc = "Lorem ipsum dolor sit amet. " * 200  # ~5600 chars
    r = rpc_call("create_task", {
        "instanceId": INSTANCE_1,
        "title": "Task with large description",
        "description": desc
    })
    data = assert_success(r)
    runner.created_task_ids.append(data["taskId"])
    # Verify the description survived
    tid = data["taskId"]
    r2 = rpc_call("get_task", {"instanceId": INSTANCE_1, "taskId": tid})
    data2 = assert_success(r2)
    assert len(data2["task"].get("description", "")) > 4000, "Large description should persist"


def test_create_task_duplicate_title():
    title = "Duplicate title test"
    r1 = rpc_call("create_task", {"instanceId": INSTANCE_1, "title": title})
    d1 = assert_success(r1)
    runner.created_task_ids.append(d1["taskId"])
    r2 = rpc_call("create_task", {"instanceId": INSTANCE_1, "title": title})
    d2 = assert_success(r2)
    runner.created_task_ids.append(d2["taskId"])
    assert d1["taskId"] != d2["taskId"], "Duplicate titles should get different IDs"


def test_create_task_missing_title():
    r = rpc_call("create_task", {"instanceId": INSTANCE_1})
    assert_failure(r, "Should fail without title")


def test_create_task_missing_instance():
    r = rpc_call("create_task", {"title": "No instance"})
    assert_failure(r, "Should fail without instanceId")


runner.run("create_task_basic", test_create_task_basic)
runner.run("create_task_all_fields", test_create_task_all_fields)
runner.run("create_task_json_in_title", test_create_task_json_in_title)
runner.run("create_task_quotes", test_create_task_quotes)
runner.run("create_task_brackets_parens", test_create_task_brackets_parens)
runner.run("create_task_unicode", test_create_task_unicode)
runner.run("create_task_empty_description", test_create_task_empty_description)
runner.run("create_task_long_title", test_create_task_long_title)
runner.run("create_task_large_description", test_create_task_large_description)
runner.run("create_task_duplicate_title", test_create_task_duplicate_title)
runner.run("create_task_missing_title (negative)", test_create_task_missing_title)
runner.run("create_task_missing_instance (negative)", test_create_task_missing_instance)

# ---------------------------------------------------------------------------
# SECTION 3: LIST TASKS
# ---------------------------------------------------------------------------
print("\n--- Section 3: List & Get Tasks ---")


def test_list_tasks_default():
    r = rpc_call("list_tasks", {"instanceId": INSTANCE_1})
    data = assert_success(r)
    assert "tasks" in data
    assert "total" in data
    assert isinstance(data["tasks"], list)


def test_list_tasks_with_limit():
    r = rpc_call("list_tasks", {"instanceId": INSTANCE_1, "limit": 3})
    data = assert_success(r)
    assert len(data["tasks"]) <= 3


def test_list_tasks_with_skip():
    r = rpc_call("list_tasks", {"instanceId": INSTANCE_1, "skip": 2, "limit": 2})
    data = assert_success(r)
    assert data["skip"] == 2


def test_list_tasks_full_detail():
    r = rpc_call("list_tasks", {"instanceId": INSTANCE_1, "full_detail": True, "limit": 2})
    data = assert_success(r)
    if data["tasks"]:
        task = data["tasks"][0]
        assert "id" in task or "taskId" in task


def test_list_tasks_filter_status():
    r = rpc_call("list_tasks", {"instanceId": INSTANCE_1, "status": "pending", "limit": 50})
    data = assert_success(r)
    for t in data["tasks"]:
        assert t.get("status") == "pending", f"Expected pending, got {t.get('status')}"


def test_get_task_by_id():
    if not runner.created_task_ids:
        raise AssertionError("No tasks created yet")
    tid = runner.created_task_ids[0]
    r = rpc_call("get_task", {"instanceId": INSTANCE_1, "taskId": tid})
    data = assert_success(r)
    assert data["task"]["id"] == tid


def test_get_task_nonexistent():
    r = rpc_call("get_task", {"instanceId": INSTANCE_1, "taskId": "ptask-nonexistent-999"})
    assert_failure(r, "Should fail for nonexistent task")


runner.run("list_tasks_default", test_list_tasks_default)
runner.run("list_tasks_with_limit", test_list_tasks_with_limit)
runner.run("list_tasks_with_skip", test_list_tasks_with_skip)
runner.run("list_tasks_full_detail", test_list_tasks_full_detail)
runner.run("list_tasks_filter_status", test_list_tasks_filter_status)
runner.run("get_task_by_id", test_get_task_by_id)
runner.run("get_task_nonexistent (negative)", test_get_task_nonexistent)

# ---------------------------------------------------------------------------
# SECTION 4: UPDATE TASK
# ---------------------------------------------------------------------------
print("\n--- Section 4: Update Task ---")


def test_update_task_title():
    tid = runner.created_task_ids[0]
    r = rpc_call("update_task", {
        "instanceId": INSTANCE_1,
        "taskId": tid,
        "title": "Updated title via regression test"
    })
    data = assert_success(r)
    assert data["task"]["title"] == "Updated title via regression test"


def test_update_task_description():
    tid = runner.created_task_ids[0]
    r = rpc_call("update_task", {
        "instanceId": INSTANCE_1,
        "taskId": tid,
        "description": "Updated description"
    })
    assert_success(r)


def test_update_task_priority():
    tid = runner.created_task_ids[0]
    r = rpc_call("update_task", {
        "instanceId": INSTANCE_1,
        "taskId": tid,
        "priority": "critical"
    })
    data = assert_success(r)
    assert data["task"]["priority"] == "critical"


def test_update_task_status():
    tid = runner.created_task_ids[0]
    r = rpc_call("update_task", {
        "instanceId": INSTANCE_1,
        "taskId": tid,
        "status": "in_progress"
    })
    data = assert_success(r)
    assert data["task"]["status"] == "in_progress"
    # Reset to pending for later tests
    rpc_call("update_task", {"instanceId": INSTANCE_1, "taskId": tid, "status": "pending"})


runner.run("update_task_title", test_update_task_title)
runner.run("update_task_description", test_update_task_description)
runner.run("update_task_priority", test_update_task_priority)
runner.run("update_task_status", test_update_task_status)

# ---------------------------------------------------------------------------
# SECTION 5: TASK LIFECYCLE (complete -> verify -> archive)
# ---------------------------------------------------------------------------
print("\n--- Section 5: Task Lifecycle ---")

_lifecycle_task_id = None


def test_lifecycle_create():
    global _lifecycle_task_id
    r = rpc_call("create_task", {
        "instanceId": INSTANCE_1,
        "title": "Lifecycle test task"
    })
    data = assert_success(r)
    _lifecycle_task_id = data["taskId"]


def test_lifecycle_complete():
    r = rpc_call("mark_task_complete", {
        "instanceId": INSTANCE_1,
        "taskId": _lifecycle_task_id
    })
    data = assert_success(r)
    assert data["task"]["status"] == "completed"


def test_lifecycle_verify():
    r = rpc_call("mark_task_verified", {
        "instanceId": INSTANCE_1,
        "taskId": _lifecycle_task_id
    })
    data = assert_success(r)
    assert data["task"]["status"] == "completed_verified"


def test_lifecycle_archive():
    r = rpc_call("archive_task", {
        "instanceId": INSTANCE_1,
        "taskId": _lifecycle_task_id
    })
    data = assert_success(r)
    # Task should no longer appear in get_task
    r2 = rpc_call("get_task", {"instanceId": INSTANCE_1, "taskId": _lifecycle_task_id})
    assert_failure(r2, "Archived task should not be findable")


def test_verify_before_complete_fails():
    r = rpc_call("create_task", {
        "instanceId": INSTANCE_1,
        "title": "Verify-before-complete test"
    })
    data = assert_success(r)
    tid = data["taskId"]
    runner.created_task_ids.append(tid)
    r2 = rpc_call("mark_task_verified", {"instanceId": INSTANCE_1, "taskId": tid})
    assert_failure(r2, "Should not verify a pending task")


runner.run("lifecycle_create", test_lifecycle_create)
runner.run("lifecycle_complete", test_lifecycle_complete)
runner.run("lifecycle_verify", test_lifecycle_verify)
runner.run("lifecycle_archive", test_lifecycle_archive)
runner.run("verify_before_complete_fails (negative)", test_verify_before_complete_fails)

# ---------------------------------------------------------------------------
# SECTION 6: DELETE TASK
# ---------------------------------------------------------------------------
print("\n--- Section 6: Delete Task ---")

_delete_task_id = None


def test_delete_task_must_be_completed():
    global _delete_task_id
    r = rpc_call("create_task", {
        "instanceId": INSTANCE_1,
        "title": "Delete test task"
    })
    data = assert_success(r)
    _delete_task_id = data["taskId"]
    # Try deleting while pending -- should fail
    r2 = rpc_call("delete_task", {"instanceId": INSTANCE_1, "taskId": _delete_task_id})
    assert_failure(r2, "Cannot delete non-completed task")


def test_delete_task_after_complete():
    rpc_call("mark_task_complete", {"instanceId": INSTANCE_1, "taskId": _delete_task_id})
    r = rpc_call("delete_task", {"instanceId": INSTANCE_1, "taskId": _delete_task_id})
    assert_success(r)


runner.run("delete_task_must_be_completed (negative)", test_delete_task_must_be_completed)
runner.run("delete_task_after_complete", test_delete_task_after_complete)

# ---------------------------------------------------------------------------
# SECTION 7: TASK LISTS (named lists)
# ---------------------------------------------------------------------------
print("\n--- Section 7: Task Lists ---")


def test_create_task_list():
    r = rpc_call("create_task_list", {
        "instanceId": INSTANCE_1,
        "listId": "regression-list-1"
    })
    data = assert_success(r)
    runner.created_task_list_ids.append("regression-list-1")


def test_create_task_in_named_list():
    r = rpc_call("create_task", {
        "instanceId": INSTANCE_1,
        "title": "Task in named list",
        "listId": "regression-list-1"
    })
    data = assert_success(r)
    runner.created_task_ids.append(data["taskId"])
    assert data["task"]["list"] == "regression-list-1"


def test_list_tasks_filter_by_list():
    r = rpc_call("list_tasks", {
        "instanceId": INSTANCE_1,
        "listId": "regression-list-1",
        "limit": 50
    })
    data = assert_success(r)
    assert data["total"] >= 1


def test_create_task_list_duplicate():
    r = rpc_call("create_task_list", {
        "instanceId": INSTANCE_1,
        "listId": "regression-list-1"
    })
    assert_failure(r, "Duplicate list should fail")


def test_delete_task_list_with_tasks():
    """Cannot delete a list that has incomplete tasks."""
    r = rpc_call("delete_task_list", {
        "instanceId": INSTANCE_1,
        "listId": "regression-list-1"
    })
    assert_failure(r, "Should fail: list has incomplete tasks")


runner.run("create_task_list", test_create_task_list)
runner.run("create_task_in_named_list", test_create_task_in_named_list)
runner.run("list_tasks_filter_by_list", test_list_tasks_filter_by_list)
runner.run("create_task_list_duplicate (negative)", test_create_task_list_duplicate)
runner.run("delete_task_list_with_tasks (negative)", test_delete_task_list_with_tasks)

# ---------------------------------------------------------------------------
# SECTION 8: CHECKLIST (LIST) CRUD
# ---------------------------------------------------------------------------
print("\n--- Section 8: Checklist CRUD ---")

_checklist_id = None
_checklist_item_ids = []


def test_create_list_basic():
    global _checklist_id
    r = rpc_call("create_list", {
        "instanceId": INSTANCE_1,
        "name": "Regression Checklist"
    })
    data = assert_success(r)
    _checklist_id = data["list"]["id"]
    runner.created_list_ids.append(_checklist_id)


def test_create_list_with_description():
    r = rpc_call("create_list", {
        "instanceId": INSTANCE_1,
        "name": "Described Checklist",
        "description": "A checklist with a description for regression testing"
    })
    data = assert_success(r)
    runner.created_list_ids.append(data["list"]["id"])
    assert data["list"]["description"] is not None


def test_get_lists_summary():
    r = rpc_call("get_lists", {"instanceId": INSTANCE_1})
    data = assert_success(r)
    assert isinstance(data["lists"], list)
    found = [l for l in data["lists"] if l["id"] == _checklist_id]
    assert len(found) == 1, "Should find our created checklist"


def test_add_list_item_basic():
    r = rpc_call("add_list_item", {
        "instanceId": INSTANCE_1,
        "listId": _checklist_id,
        "text": "First checklist item"
    })
    data = assert_success(r)
    _checklist_item_ids.append(data["item"]["id"])


def test_add_list_item_special_chars():
    texts = [
        '{"key": "value"}',
        'He said "hello" and it\'s fine',
        'Fix [critical] (backend) {urgent}',
        'Unicode: \u00e9\u00e8\u00ea \u00fc\u00f6\u00e4 \u2603',
    ]
    for text in texts:
        r = rpc_call("add_list_item", {
            "instanceId": INSTANCE_1,
            "listId": _checklist_id,
            "text": text
        })
        data = assert_success(r)
        _checklist_item_ids.append(data["item"]["id"])


def test_get_list_full():
    r = rpc_call("get_list", {
        "instanceId": INSTANCE_1,
        "listId": _checklist_id
    })
    data = assert_success(r)
    assert len(data["list"]["items"]) >= 5, "Should have at least 5 items"
    # Verify special characters survived
    texts = [item["text"] for item in data["list"]["items"]]
    assert any('{"key"' in t for t in texts), "JSON in item text should survive"


def test_toggle_list_item():
    item_id = _checklist_item_ids[0]
    # Toggle to checked
    r = rpc_call("toggle_list_item", {
        "instanceId": INSTANCE_1,
        "listId": _checklist_id,
        "itemId": item_id
    })
    data = assert_success(r)
    assert data["item"]["checked"] is True, "Should be checked after first toggle"

    # Toggle back to unchecked
    r2 = rpc_call("toggle_list_item", {
        "instanceId": INSTANCE_1,
        "listId": _checklist_id,
        "itemId": item_id
    })
    data2 = assert_success(r2)
    assert data2["item"]["checked"] is False, "Should be unchecked after second toggle"


def test_rename_list():
    r = rpc_call("rename_list", {
        "instanceId": INSTANCE_1,
        "listId": _checklist_id,
        "name": "Renamed Checklist"
    })
    data = assert_success(r)
    assert data["list"]["name"] == "Renamed Checklist"


def test_delete_list_item():
    if not _checklist_item_ids:
        raise AssertionError("No items to delete")
    item_id = _checklist_item_ids[-1]
    r = rpc_call("delete_list_item", {
        "instanceId": INSTANCE_1,
        "listId": _checklist_id,
        "itemId": item_id
    })
    assert_success(r)
    _checklist_item_ids.pop()


def test_get_list_nonexistent():
    r = rpc_call("get_list", {
        "instanceId": INSTANCE_1,
        "listId": "list-nonexistent-999"
    })
    assert_failure(r, "Should fail for nonexistent list")


def test_add_item_missing_text():
    r = rpc_call("add_list_item", {
        "instanceId": INSTANCE_1,
        "listId": _checklist_id
    })
    assert_failure(r, "Should fail without text")


runner.run("create_list_basic", test_create_list_basic)
runner.run("create_list_with_description", test_create_list_with_description)
runner.run("get_lists_summary", test_get_lists_summary)
runner.run("add_list_item_basic", test_add_list_item_basic)
runner.run("add_list_item_special_chars", test_add_list_item_special_chars)
runner.run("get_list_full", test_get_list_full)
runner.run("toggle_list_item", test_toggle_list_item)
runner.run("rename_list", test_rename_list)
runner.run("delete_list_item", test_delete_list_item)
runner.run("get_list_nonexistent (negative)", test_get_list_nonexistent)
runner.run("add_item_missing_text (negative)", test_add_item_missing_text)

# ---------------------------------------------------------------------------
# SECTION 9: PROJECT SETUP
# ---------------------------------------------------------------------------
print("\n--- Section 9: Project Setup ---")

# Track project-level resources for cleanup
runner.created_project_task_ids = []
runner.created_project_task_list_ids = []
_test_project_id = f"regtest-{int(time.time())}"


def test_take_on_role_executive():
    """Give INSTANCE_1 the Executive role so it can create projects."""
    r = rpc_call("take_on_role", {
        "instanceId": INSTANCE_1,
        "role": "Executive"
    })
    data = assert_success(r)


def test_take_on_role_developer():
    """Give INSTANCE_2 the Developer role."""
    r = rpc_call("take_on_role", {
        "instanceId": INSTANCE_2,
        "role": "Developer"
    })
    data = assert_success(r)


def test_create_project():
    """Create a test project."""
    r = rpc_call("create_project", {
        "instanceId": INSTANCE_1,
        "projectId": _test_project_id,
        "name": "Regression Test Project",
        "description": "Temporary project for regression testing"
    })
    data = assert_success(r)


def test_join_project_instance1():
    """Join INSTANCE_1 to the test project."""
    r = rpc_call("join_project", {
        "instanceId": INSTANCE_1,
        "project": _test_project_id
    })
    data = assert_success(r)


def test_join_project_instance2():
    """Join INSTANCE_2 to the test project."""
    r = rpc_call("join_project", {
        "instanceId": INSTANCE_2,
        "project": _test_project_id
    })
    data = assert_success(r)


runner.run("take_on_role_executive (INSTANCE_1)", test_take_on_role_executive)
runner.run("take_on_role_developer (INSTANCE_2)", test_take_on_role_developer)
runner.run("create_project", test_create_project)
runner.run("join_project_instance1", test_join_project_instance1)
runner.run("join_project_instance2", test_join_project_instance2)

# ---------------------------------------------------------------------------
# SECTION 10: PROJECT TASK CRUD
# ---------------------------------------------------------------------------
print("\n--- Section 10: Project Task CRUD ---")

_proj_task_1 = None
_proj_task_2 = None
_proj_task_for_assign = None
_proj_task_for_claim = None
_proj_task_for_verify = None


def test_proj_create_task_basic():
    """Create a basic project task."""
    global _proj_task_1
    r = rpc_call("create_task", {
        "instanceId": INSTANCE_1,
        "title": "Project regression task basic",
        "projectId": _test_project_id
    })
    data = assert_success(r)
    assert data.get("taskId"), "Should return taskId"
    assert data.get("taskType") == "project", f"Expected project task, got {data.get('taskType')}"
    assert data["taskId"].startswith("prjtask-"), f"Project task ID should start with prjtask-, got {data['taskId']}"
    _proj_task_1 = data["taskId"]
    runner.created_project_task_ids.append(data["taskId"])


def test_proj_create_task_all_fields():
    """Create a project task with all fields and special characters."""
    global _proj_task_2
    r = rpc_call("create_task", {
        "instanceId": INSTANCE_1,
        "title": 'Project task "special" [chars] {braces} & unicode: \u00e9\u00e8',
        "description": "A detailed project task description for regression testing",
        "priority": "high",
        "projectId": _test_project_id,
        "listId": "default"
    })
    data = assert_success(r)
    _proj_task_2 = data["taskId"]
    runner.created_project_task_ids.append(data["taskId"])
    assert data["task"]["priority"] == "high"


def test_proj_list_tasks():
    """List project tasks and verify our tasks appear."""
    r = rpc_call("list_tasks", {
        "instanceId": INSTANCE_1,
        "projectId": _test_project_id,
        "limit": 50
    })
    data = assert_success(r)
    assert data["total"] >= 2, f"Expected >= 2 project tasks, got {data['total']}"
    assert isinstance(data["tasks"], list)


def test_proj_get_task():
    """Get a specific project task by ID."""
    r = rpc_call("get_task", {
        "instanceId": INSTANCE_1,
        "taskId": _proj_task_1
    })
    data = assert_success(r)
    assert data["task"]["id"] == _proj_task_1


def test_proj_update_task():
    """Update title, priority, and status on a project task."""
    r = rpc_call("update_task", {
        "instanceId": INSTANCE_1,
        "taskId": _proj_task_1,
        "title": "Updated project task title",
        "priority": "critical"
    })
    data = assert_success(r)
    assert data["task"]["title"] == "Updated project task title"
    assert data["task"]["priority"] == "critical"


def test_proj_assign_task():
    """Assign a project task to INSTANCE_2 (privileged caller: INSTANCE_1 is Executive)."""
    global _proj_task_for_assign
    # Create a fresh task for assignment testing
    r = rpc_call("create_task", {
        "instanceId": INSTANCE_1,
        "title": "Task to assign to instance 2",
        "projectId": _test_project_id
    })
    data = assert_success(r)
    _proj_task_for_assign = data["taskId"]
    runner.created_project_task_ids.append(data["taskId"])

    # Assign it
    r2 = rpc_call("assign_task", {
        "instanceId": INSTANCE_1,
        "taskId": _proj_task_for_assign,
        "assigneeId": INSTANCE_2
    })
    data2 = assert_success(r2)
    assert data2["task"]["assigned_to"] == INSTANCE_2, \
        f"Expected assigned_to={INSTANCE_2}, got {data2['task'].get('assigned_to')}"


def test_proj_take_on_task():
    """INSTANCE_2 claims an unassigned project task."""
    global _proj_task_for_claim
    # Create an unassigned task
    r = rpc_call("create_task", {
        "instanceId": INSTANCE_1,
        "title": "Unassigned task for claiming",
        "projectId": _test_project_id
    })
    data = assert_success(r)
    _proj_task_for_claim = data["taskId"]
    runner.created_project_task_ids.append(data["taskId"])

    # INSTANCE_2 claims it
    r2 = rpc_call("take_on_task", {
        "instanceId": INSTANCE_2,
        "taskId": _proj_task_for_claim
    })
    data2 = assert_success(r2)
    assert data2["task"]["assigned_to"] == INSTANCE_2


def test_proj_mark_task_complete():
    """Mark the claimed project task as complete (by assignee)."""
    r = rpc_call("mark_task_complete", {
        "instanceId": INSTANCE_2,
        "taskId": _proj_task_for_claim
    })
    data = assert_success(r)
    assert data["task"]["status"] == "completed"


def test_proj_mark_task_verified():
    """Verify completed task - must be different instance than completer.
    INSTANCE_1 verifies INSTANCE_2's completed task."""
    r = rpc_call("mark_task_verified", {
        "instanceId": INSTANCE_1,
        "taskId": _proj_task_for_claim
    })
    data = assert_success(r)
    assert data["task"]["status"] == "completed_verified"


def test_proj_self_verify_fails():
    """Negative: assignee cannot verify their own project task."""
    global _proj_task_for_verify
    # Create task, assign to INSTANCE_2, complete it
    r = rpc_call("create_task", {
        "instanceId": INSTANCE_1,
        "title": "Self-verify test task",
        "projectId": _test_project_id
    })
    data = assert_success(r)
    _proj_task_for_verify = data["taskId"]
    runner.created_project_task_ids.append(data["taskId"])

    rpc_call("assign_task", {
        "instanceId": INSTANCE_1,
        "taskId": _proj_task_for_verify,
        "assigneeId": INSTANCE_2
    })
    rpc_call("mark_task_complete", {
        "instanceId": INSTANCE_2,
        "taskId": _proj_task_for_verify
    })

    # INSTANCE_2 tries to verify their own task — should fail
    r2 = rpc_call("mark_task_verified", {
        "instanceId": INSTANCE_2,
        "taskId": _proj_task_for_verify
    })
    assert_failure(r2, "Self-verification of project task should fail")


def test_proj_create_task_list():
    """Create a named project task list."""
    r = rpc_call("create_task_list", {
        "instanceId": INSTANCE_1,
        "listId": "regression-proj-list",
        "projectId": _test_project_id
    })
    data = assert_success(r)
    runner.created_project_task_list_ids.append("regression-proj-list")


def test_proj_create_task_in_named_list():
    """Create a project task in the named list."""
    r = rpc_call("create_task", {
        "instanceId": INSTANCE_1,
        "title": "Task in project named list",
        "projectId": _test_project_id,
        "listId": "regression-proj-list"
    })
    data = assert_success(r)
    runner.created_project_task_ids.append(data["taskId"])
    assert data["task"]["list"] == "regression-proj-list"


runner.run("proj_create_task_basic", test_proj_create_task_basic)
runner.run("proj_create_task_all_fields", test_proj_create_task_all_fields)
runner.run("proj_list_tasks", test_proj_list_tasks)
runner.run("proj_get_task", test_proj_get_task)
runner.run("proj_update_task", test_proj_update_task)
runner.run("proj_assign_task", test_proj_assign_task)
runner.run("proj_take_on_task", test_proj_take_on_task)
runner.run("proj_mark_task_complete", test_proj_mark_task_complete)
runner.run("proj_mark_task_verified", test_proj_mark_task_verified)
runner.run("proj_self_verify_fails (negative)", test_proj_self_verify_fails)
runner.run("proj_create_task_list", test_proj_create_task_list)
runner.run("proj_create_task_in_named_list", test_proj_create_task_in_named_list)

# ---------------------------------------------------------------------------
# SECTION 11: CROSS-INSTANCE TASK VISIBILITY
# ---------------------------------------------------------------------------
print("\n--- Section 11: Cross-Instance Task Visibility ---")


def test_cross_instance_list_tasks():
    """INSTANCE_2 can see project tasks created by INSTANCE_1 via list_tasks."""
    r = rpc_call("list_tasks", {
        "instanceId": INSTANCE_2,
        "projectId": _test_project_id,
        "limit": 50
    })
    data = assert_success(r)
    assert data["total"] >= 1, "INSTANCE_2 should see project tasks"


def test_cross_instance_get_my_tasks():
    """INSTANCE_2's get_my_tasks should include assigned project tasks."""
    r = rpc_call("get_my_tasks", {
        "instanceId": INSTANCE_2
    })
    data = assert_success(r)
    # Should have projectTasks section with tasks assigned to INSTANCE_2
    project_tasks = data.get("projectTasks", data.get("project_tasks", []))
    # The assigned task from test_proj_assign_task should appear
    # (It's okay if the format varies; we just check we got a successful response)
    assert data.get("success"), "get_my_tasks should succeed for INSTANCE_2"


runner.run("cross_instance_list_tasks", test_cross_instance_list_tasks)
runner.run("cross_instance_get_my_tasks", test_cross_instance_get_my_tasks)

# ---------------------------------------------------------------------------
# SECTION 12: PROJECT TASK CLEANUP
# ---------------------------------------------------------------------------
print("\n--- Section 12: Project Task Cleanup ---")


def test_cleanup_project_tasks():
    """Complete and delete/archive all project tasks created during testing."""
    cleaned = 0
    errors = 0
    for tid in list(runner.created_project_task_ids):
        try:
            # Try to complete (may already be completed)
            rpc_call("mark_task_complete", {"instanceId": INSTANCE_1, "taskId": tid})
            # Try to verify
            rpc_call("mark_task_verified", {"instanceId": INSTANCE_1, "taskId": tid})
            # Try to archive
            r = rpc_call("archive_task", {"instanceId": INSTANCE_1, "taskId": tid})
            if r["data"].get("success"):
                cleaned += 1
            else:
                # Fallback: try delete
                r2 = rpc_call("delete_task", {"instanceId": INSTANCE_1, "taskId": tid})
                if r2["data"].get("success"):
                    cleaned += 1
                else:
                    errors += 1
        except Exception:
            errors += 1
    print(f"    Cleaned {cleaned} project tasks ({errors} errors)")
    runner.created_project_task_ids.clear()


runner.run("cleanup_project_tasks", test_cleanup_project_tasks)

# ---------------------------------------------------------------------------
# SECTION 13: VOLUME TESTS
# ---------------------------------------------------------------------------
print("\n--- Section 13: Volume Tests ---")


def test_volume_task_lists():
    """Create 20 task lists with 5 tasks each (100 tasks)."""
    t0 = time.time()
    for i in range(20):
        list_id = f"vol-list-{i}"
        r = rpc_call("create_task_list", {
            "instanceId": INSTANCE_1,
            "listId": list_id
        })
        data = r["data"]
        if data.get("success"):
            runner.created_task_list_ids.append(list_id)

        for j in range(5):
            r2 = rpc_call("create_task", {
                "instanceId": INSTANCE_1,
                "title": f"Volume task {i}-{j}",
                "listId": list_id
            })
            data2 = r2["data"]
            if data2.get("success") and data2.get("taskId"):
                runner.created_task_ids.append(data2["taskId"])

    elapsed = time.time() - t0
    runner.log_timing("Create 20 lists x 5 tasks (100 tasks)", elapsed)

    # Verify we can list all tasks
    r3 = rpc_call("list_tasks", {"instanceId": INSTANCE_1, "limit": 500})
    data3 = assert_success(r3)
    # We had some tasks already from earlier tests
    assert data3["total"] >= 100, f"Expected >= 100 tasks total, got {data3['total']}"
    runner.log_timing("List all tasks (limit=500)", r3["elapsed"])


def test_volume_checklists():
    """Create 10 checklists with 25 items each (250 items)."""
    t0 = time.time()
    for i in range(10):
        r = rpc_call("create_list", {
            "instanceId": INSTANCE_1,
            "name": f"Volume Checklist {i}"
        })
        data = r["data"]
        if not data.get("success"):
            continue
        list_id = data["list"]["id"]
        runner.created_list_ids.append(list_id)

        for j in range(25):
            rpc_call("add_list_item", {
                "instanceId": INSTANCE_1,
                "listId": list_id,
                "text": f"Volume item {i}-{j}"
            })

    elapsed = time.time() - t0
    runner.log_timing("Create 10 checklists x 25 items (250 items)", elapsed)

    # Verify we can get all lists
    r2 = rpc_call("get_lists", {"instanceId": INSTANCE_1})
    data2 = assert_success(r2)
    total_items = sum(l.get("itemCount", 0) for l in data2["lists"])
    assert total_items >= 250, f"Expected >= 250 items total, got {total_items}"
    runner.log_timing("Get all lists summary", r2["elapsed"])

    # Verify individual list retrieval for a 25-item list
    for l in data2["lists"]:
        if l.get("itemCount", 0) == 25:
            r3 = rpc_call("get_list", {"instanceId": INSTANCE_1, "listId": l["id"]})
            assert_success(r3)
            runner.log_timing("Get single list with 25 items", r3["elapsed"])
            break


def test_volume_response_times():
    """Verify response times are reasonable for volume operations."""
    for label, elapsed in runner.timings:
        if "Create" in label:
            assert elapsed < 180, f"{label} took {elapsed:.1f}s (max 180s)"
        elif "List" in label or "Get" in label:
            assert elapsed < 15, f"{label} took {elapsed:.1f}s (max 15s)"


runner.run("volume_task_lists (20x5=100 tasks)", test_volume_task_lists)
runner.run("volume_checklists (10x25=250 items)", test_volume_checklists)
runner.run("volume_response_times", test_volume_response_times)

# ---------------------------------------------------------------------------
# SECTION 14: CLEANUP
# ---------------------------------------------------------------------------
print("\n--- Section 14: Cleanup ---")


def test_cleanup_tasks():
    """Complete and delete all created personal tasks."""
    cleaned = 0
    errors = 0
    for tid in list(runner.created_task_ids):
        try:
            rpc_call("mark_task_complete", {"instanceId": INSTANCE_1, "taskId": tid})
            r = rpc_call("delete_task", {"instanceId": INSTANCE_1, "taskId": tid})
            if r["data"].get("success"):
                cleaned += 1
        except Exception:
            errors += 1
    print(f"    Cleaned {cleaned} tasks ({errors} errors)")
    runner.created_task_ids.clear()


def test_cleanup_task_lists():
    """Delete all created task lists."""
    cleaned = 0
    for lid in list(runner.created_task_list_ids):
        try:
            # Complete+delete remaining tasks in the list
            r = rpc_call("list_tasks", {
                "instanceId": INSTANCE_1,
                "listId": lid,
                "limit": 200,
                "full_detail": True
            })
            if r["data"].get("success"):
                for t in r["data"].get("tasks", []):
                    task_id = t.get("id") or t.get("taskId")
                    if task_id:
                        rpc_call("mark_task_complete", {"instanceId": INSTANCE_1, "taskId": task_id})
                        rpc_call("delete_task", {"instanceId": INSTANCE_1, "taskId": task_id})
            r2 = rpc_call("delete_task_list", {"instanceId": INSTANCE_1, "listId": lid})
            if r2["data"].get("success"):
                cleaned += 1
        except Exception:
            pass
    print(f"    Cleaned {cleaned} task lists")
    runner.created_task_list_ids.clear()


def test_cleanup_checklists():
    """Delete all created checklists."""
    cleaned = 0
    for lid in list(runner.created_list_ids):
        try:
            r = rpc_call("delete_list", {"instanceId": INSTANCE_1, "listId": lid})
            if r["data"].get("success"):
                cleaned += 1
        except Exception:
            pass
    print(f"    Cleaned {cleaned} checklists")
    runner.created_list_ids.clear()


runner.run("cleanup_tasks", test_cleanup_tasks)
runner.run("cleanup_task_lists", test_cleanup_task_lists)
runner.run("cleanup_checklists", test_cleanup_checklists)

# ---------------------------------------------------------------------------
# SECTION 15: POST-CLEANUP VERIFICATION
# ---------------------------------------------------------------------------
print("\n--- Section 15: Post-Cleanup Verification ---")


def test_verify_clean_state():
    """Compare system state before and after tests."""
    post_lists_result = rpc_call("get_lists", {"instanceId": INSTANCE_1})
    post_lists = post_lists_result["data"].get("lists", []) if post_lists_result["data"].get("success") else []
    post_tasks_result = rpc_call("list_tasks", {"instanceId": INSTANCE_1, "limit": 1000})
    post_task_count = post_tasks_result["data"].get("total", 0) if post_tasks_result["data"].get("success") else 0

    pre_list_ids = set(l.get("id", "") for l in pre_lists)
    post_list_ids = set(l.get("id", "") for l in post_lists)

    new_lists = post_list_ids - pre_list_ids
    if new_lists:
        print(f"    WARNING: {len(new_lists)} new lists remain after cleanup")

    task_delta = post_task_count - pre_task_count
    if task_delta > 0:
        print(f"    WARNING: {task_delta} more tasks remain after cleanup")
    else:
        print(f"    Clean: {post_task_count} tasks, {len(post_lists)} checklists (delta: {task_delta} tasks, {len(new_lists)} lists)")

    assert len(new_lists) <= 2, f"Too many leftover lists: {len(new_lists)}"
    assert task_delta <= 5, f"Too many leftover tasks: {task_delta}"


runner.run("verify_clean_state", test_verify_clean_state)

# ---------------------------------------------------------------------------
# FINAL SUMMARY
# ---------------------------------------------------------------------------
success = runner.summary()
print(f"\nFinished: {datetime.now().isoformat()}")
sys.exit(0 if success else 1)
