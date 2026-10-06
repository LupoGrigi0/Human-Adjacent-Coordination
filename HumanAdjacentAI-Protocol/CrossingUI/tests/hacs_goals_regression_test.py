#!/usr/bin/env python3
"""
HACS Goals API Regression Test Suite
=====================================
Comprehensive regression tests for the Goals feature (12 endpoints).
Goals are semantically elevated checklists with status tracking and dependencies.

Tests cover:
  - Personal goal CRUD (create, list, get, delete)
  - Criteria CRUD (add, update, validate, stretch)
  - Goal status transitions (in_progress → achieved → exceeded)
  - Cross-isolation: goals don't leak into list APIs
  - Dependencies (add, validate single, validate bulk)
  - Edge cases (missing params, invalid IDs, special characters)
  - Permissions (personal goals are self-only, project goals PM/COO/Exec)
  - Volume tests (many goals, many criteria)
  - Cleanup and verification

Usage:
    python3 hacs_goals_regression_test.py [API_URL]
    python3 hacs_goals_regression_test.py https://smoothcurves.nexus/mcp

Author: Ember-75b6
Created: 2026-03-11
"""

import os
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

# Disable SSL warnings for self-signed certs
requests.packages.urllib3.disable_warnings()

# Will be set during bootstrap
INSTANCE_1 = None
INSTANCE_2 = None

# ---------------------------------------------------------------------------
# JSON-RPC helpers (same pattern as hacs_regression_test.py)
# ---------------------------------------------------------------------------
_rpc_id = 0


def rpc_call(method: str, params: dict = None, timeout: int = 30) -> dict:
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

    if "error" in body:
        return {"data": {"success": False, "error": body["error"]}, "elapsed": elapsed, "raw": body}

    result = body.get("result", {})

    data = result.get("data")
    if data and isinstance(data, dict) and ("success" in data or "instanceId" in data):
        return {"data": data, "elapsed": elapsed, "raw": body}

    for item in result.get("content", []):
        if item.get("type") == "text":
            try:
                parsed = json.loads(item["text"])
                if isinstance(parsed, dict):
                    return {"data": parsed, "elapsed": elapsed, "raw": body}
            except (json.JSONDecodeError, KeyError):
                pass

    if "success" in result:
        return {"data": result, "elapsed": elapsed, "raw": body}

    return {"data": {"success": False, "error": {"code": "EMPTY_RESPONSE", "message": "No parseable data"}},
            "elapsed": elapsed, "raw": body}


def assert_success(result: dict, msg: str = "") -> dict:
    data = result["data"]
    if not data.get("success"):
        raise AssertionError(
            f"Expected success but got: {json.dumps(data.get('error', data))[:300]} -- {msg}"
        )
    return data


def assert_failure(result: dict, msg: str = "") -> dict:
    data = result["data"]
    if data.get("success"):
        raise AssertionError(f"Expected failure but got success -- {msg}")
    return data


def assert_error_code(result: dict, code: str, msg: str = "") -> dict:
    data = assert_failure(result, msg)
    actual = data.get("error", {}).get("code", "")
    if actual != code:
        raise AssertionError(f"Expected error code '{code}' but got '{actual}' -- {msg}")
    return data


# ---------------------------------------------------------------------------
# Test runner
# ---------------------------------------------------------------------------
class TestRunner:
    def __init__(self):
        self.passed = 0
        self.failed = 0
        self.skipped = 0
        self.errors = []
        self.timings = []
        self.created_goal_ids = []

    def run(self, name: str, fn):
        try:
            fn()
            self.passed += 1
            print(f"  PASS  {name}")
        except RuntimeError as e:
            if str(e).startswith("SKIP:"):
                self.skipped += 1
                print(f"  SKIP  {name}: {str(e)[5:].strip()}")
            else:
                self.failed += 1
                tb = traceback.format_exc()
                self.errors.append((name, str(e), tb))
                print(f"  FAIL  {name}: {e}")
        except Exception as e:
            self.failed += 1
            tb = traceback.format_exc()
            self.errors.append((name, str(e), tb))
            print(f"  FAIL  {name}: {e}")

    def log_timing(self, label: str, elapsed: float):
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
                # Print first 3 lines of traceback for debugging
                for line in tb.strip().split("\n")[-3:]:
                    print(f"      {line}")
        if self.timings:
            print("\nTimings:")
            for label, elapsed in self.timings:
                print(f"  {label}: {elapsed:.3f}s")
        print("=" * 70)
        return self.failed == 0


runner = TestRunner()

# ---------------------------------------------------------------------------
# SETUP
# ---------------------------------------------------------------------------
print(f"\nHACS Goals API Regression Test Suite")
print(f"API: {API_URL}")
print(f"Started: {datetime.now().isoformat()}")
print("=" * 70)

print("\n--- SETUP: Bootstrap test instances ---")


def setup_bootstrap():
    global INSTANCE_1, INSTANCE_2
    for label, name in [("INSTANCE_1", "GoalTester1"), ("INSTANCE_2", "GoalTester2")]:
        r = rpc_call("have_i_bootstrapped_before", {"name": name})
        data = r["data"]
        if data.get("success") and data.get("found") and data.get("instanceId"):
            inst_id = data["instanceId"]
            rpc_call("bootstrap", {"instanceId": inst_id})
            if label == "INSTANCE_1":
                INSTANCE_1 = inst_id
            else:
                INSTANCE_2 = inst_id
            print(f"    {label} = {inst_id} (existing)")
        else:
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

# State snapshot: count existing goals and lists
pre_goals_r = rpc_call("list_personal_goals", {"instanceId": INSTANCE_1})
pre_goal_count = len(pre_goals_r["data"].get("goals", [])) if pre_goals_r["data"].get("success") else 0
pre_lists_r = rpc_call("get_lists", {"instanceId": INSTANCE_1})
pre_list_count = len(pre_lists_r["data"].get("lists", [])) if pre_lists_r["data"].get("success") else 0

# ---------------------------------------------------------------------------
# Section 1: Personal Goal CRUD
# ---------------------------------------------------------------------------
print("\n--- Section 1: Personal Goal CRUD ---")

_goal_id = None
_goal_name = "Regression Test Goal"


def test_create_personal_goal():
    global _goal_id
    r = rpc_call("create_goal", {
        "instanceId": INSTANCE_1,
        "name": _goal_name,
        "context": "Testing goals CRUD for regression suite"
    })
    data = assert_success(r, "create_goal")
    assert "goal" in data, "Response should contain goal object"
    assert data["goal"]["name"] == _goal_name
    assert data["goal"]["status"] == "in_progress"
    assert data["scope"] == "personal"
    _goal_id = data["goal"]["id"]
    assert _goal_id.startswith("goal-"), f"Goal ID should start with 'goal-', got {_goal_id}"
    runner.created_goal_ids.append(_goal_id)


runner.run("create_personal_goal", test_create_personal_goal)


def test_create_goal_no_context():
    """Goals can be created without a context (optional field)."""
    r = rpc_call("create_goal", {
        "instanceId": INSTANCE_1,
        "name": "Goal Without Context"
    })
    data = assert_success(r, "create_goal without context")
    runner.created_goal_ids.append(data["goal"]["id"])


runner.run("create_goal_no_context", test_create_goal_no_context)


def test_list_personal_goals():
    r = rpc_call("list_personal_goals", {"instanceId": INSTANCE_1})
    data = assert_success(r, "list_personal_goals")
    assert "goals" in data, "Response should contain goals array"
    found = [g for g in data["goals"] if g["id"] == _goal_id]
    assert len(found) == 1, f"Should find created goal, found {len(found)}"
    goal = found[0]
    assert goal["name"] == _goal_name
    assert goal["status"] == "in_progress"
    assert goal["criteriaCount"] == 0
    assert goal["validatedCount"] == 0


runner.run("list_personal_goals", test_list_personal_goals)


def test_get_goal_detail():
    r = rpc_call("get_goal", {"instanceId": INSTANCE_1, "goalId": _goal_id})
    data = assert_success(r, "get_goal")
    assert data["goal"]["id"] == _goal_id
    assert data["goal"]["name"] == _goal_name
    assert data["goal"]["context"] == "Testing goals CRUD for regression suite"
    assert data["goal"]["criteria"] == [], "New goal should have empty criteria"


runner.run("get_goal_detail", test_get_goal_detail)

# ---------------------------------------------------------------------------
# Section 2: Criteria CRUD
# ---------------------------------------------------------------------------
print("\n--- Section 2: Criteria CRUD ---")

_criteria_ids = []


def test_add_criteria_basic():
    r = rpc_call("add_criteria", {
        "instanceId": INSTANCE_1,
        "goalId": _goal_id,
        "text": "All regression tests pass"
    })
    data = assert_success(r, "add_criteria basic")
    assert "criteria" in data
    assert data["criteria"]["text"] == "All regression tests pass"
    assert data["criteria"]["stretch"] is False
    _criteria_ids.append(data["criteria"]["id"])


runner.run("add_criteria_basic", test_add_criteria_basic)


def test_add_criteria_with_description():
    r = rpc_call("add_criteria", {
        "instanceId": INSTANCE_1,
        "goalId": _goal_id,
        "text": "API documentation regenerated",
        "description": "OpenAPI spec includes all 12 goal endpoints"
    })
    data = assert_success(r, "add_criteria with description")
    assert data["criteria"]["description"] == "OpenAPI spec includes all 12 goal endpoints"
    _criteria_ids.append(data["criteria"]["id"])


runner.run("add_criteria_with_description", test_add_criteria_with_description)


def test_add_stretch_criteria():
    r = rpc_call("add_criteria", {
        "instanceId": INSTANCE_1,
        "goalId": _goal_id,
        "text": "Performance under 50ms per endpoint",
        "stretch": True
    })
    data = assert_success(r, "add stretch criteria")
    assert data["criteria"]["stretch"] is True
    _criteria_ids.append(data["criteria"]["id"])


runner.run("add_stretch_criteria", test_add_stretch_criteria)


def test_add_criteria_special_chars():
    """Special characters in criteria text should survive round-trip."""
    texts = [
        '{"key": "value"}',
        'He said "hello" and it\'s fine',
        'Unicode: éèê üöä ☃',
        'Fix [critical] (backend) {urgent}',
    ]
    for text in texts:
        r = rpc_call("add_criteria", {
            "instanceId": INSTANCE_1,
            "goalId": _goal_id,
            "text": text
        })
        data = assert_success(r, f"add_criteria special chars: {text[:30]}")
        _criteria_ids.append(data["criteria"]["id"])


runner.run("add_criteria_special_chars", test_add_criteria_special_chars)


def test_get_goal_with_criteria():
    """After adding criteria, get_goal should return all of them."""
    r = rpc_call("get_goal", {"instanceId": INSTANCE_1, "goalId": _goal_id})
    data = assert_success(r, "get_goal with criteria")
    criteria = data["goal"]["criteria"]
    assert len(criteria) == len(_criteria_ids), f"Expected {len(_criteria_ids)} criteria, got {len(criteria)}"
    # Verify special characters survived
    texts = [c["text"] for c in criteria]
    assert any('{"key"' in t for t in texts), "JSON in criteria text should survive"
    assert any('☃' in t for t in texts), "Unicode should survive"
    # Verify stretch flag
    stretch_criteria = [c for c in criteria if c["stretch"]]
    assert len(stretch_criteria) == 1, "Should have exactly 1 stretch criteria"


runner.run("get_goal_with_criteria", test_get_goal_with_criteria)


def test_update_criteria_text():
    crit_id = _criteria_ids[0]
    r = rpc_call("update_criteria", {
        "instanceId": INSTANCE_1,
        "goalId": _goal_id,
        "criteriaId": crit_id,
        "text": "All regression tests pass (updated)"
    })
    data = assert_success(r, "update_criteria text")
    assert data["criteria"]["text"] == "All regression tests pass (updated)"


runner.run("update_criteria_text", test_update_criteria_text)


def test_update_criteria_stretch_flag():
    """Toggle a regular criteria to stretch."""
    crit_id = _criteria_ids[1]
    r = rpc_call("update_criteria", {
        "instanceId": INSTANCE_1,
        "goalId": _goal_id,
        "criteriaId": crit_id,
        "stretch": True
    })
    data = assert_success(r, "update_criteria stretch")
    assert data["criteria"]["stretch"] is True


runner.run("update_criteria_stretch_flag", test_update_criteria_stretch_flag)


def test_validate_criteria_toggle():
    """validate_criteria toggles checked status."""
    crit_id = _criteria_ids[0]
    # First toggle: should mark validated
    r = rpc_call("validate_criteria", {
        "instanceId": INSTANCE_1,
        "goalId": _goal_id,
        "criteriaId": crit_id
    })
    data = assert_success(r, "validate_criteria first toggle")
    assert data["criteria"]["validated"] is True

    # Second toggle: should uncheck
    r2 = rpc_call("validate_criteria", {
        "instanceId": INSTANCE_1,
        "goalId": _goal_id,
        "criteriaId": crit_id
    })
    data2 = assert_success(r2, "validate_criteria second toggle")
    assert data2["criteria"]["validated"] is False


runner.run("validate_criteria_toggle", test_validate_criteria_toggle)

# ---------------------------------------------------------------------------
# Section 3: Goal Status Transitions
# ---------------------------------------------------------------------------
print("\n--- Section 3: Goal Status Transitions ---")


def test_set_status_achieved():
    r = rpc_call("set_goal_status", {
        "instanceId": INSTANCE_1,
        "goalId": _goal_id,
        "status": "achieved"
    })
    data = assert_success(r, "set_goal_status achieved")
    assert data["goal"]["status"] == "achieved"


runner.run("set_status_achieved", test_set_status_achieved)


def test_set_status_exceeded():
    r = rpc_call("set_goal_status", {
        "instanceId": INSTANCE_1,
        "goalId": _goal_id,
        "status": "exceeded"
    })
    data = assert_success(r, "set_goal_status exceeded")
    assert data["goal"]["status"] == "exceeded"


runner.run("set_status_exceeded", test_set_status_exceeded)


def test_set_status_back_to_in_progress():
    r = rpc_call("set_goal_status", {
        "instanceId": INSTANCE_1,
        "goalId": _goal_id,
        "status": "in_progress"
    })
    data = assert_success(r, "set_goal_status back to in_progress")
    assert data["goal"]["status"] == "in_progress"


runner.run("set_status_back_to_in_progress", test_set_status_back_to_in_progress)


def test_set_status_invalid():
    """Invalid status should fail."""
    r = rpc_call("set_goal_status", {
        "instanceId": INSTANCE_1,
        "goalId": _goal_id,
        "status": "completed"  # not a valid goal status
    })
    assert_error_code(r, "INVALID_STATUS", "invalid goal status")


runner.run("set_status_invalid (negative)", test_set_status_invalid)

# ---------------------------------------------------------------------------
# Section 4: Cross-Isolation — Goals vs Lists
# ---------------------------------------------------------------------------
print("\n--- Section 4: Cross-Isolation (Goals vs Lists) ---")


def test_goals_not_in_get_lists():
    """get_lists should NOT return goals (type='goal' filter)."""
    r = rpc_call("get_lists", {"instanceId": INSTANCE_1})
    data = assert_success(r, "get_lists excludes goals")
    for lst in data.get("lists", []):
        assert lst.get("id") != _goal_id, f"Goal {_goal_id} should not appear in get_lists"


runner.run("goals_not_in_get_lists", test_goals_not_in_get_lists)


def test_goals_not_in_get_list():
    """get_list with a goal ID should fail (not found)."""
    r = rpc_call("get_list", {"instanceId": INSTANCE_1, "listId": _goal_id})
    assert_failure(r, "get_list should not find a goal ID")


runner.run("goals_not_in_get_list", test_goals_not_in_get_list)


def test_regular_lists_not_in_goals():
    """Create a regular list, confirm it doesn't appear in list_personal_goals."""
    # Create a regular list
    r = rpc_call("create_list", {"instanceId": INSTANCE_1, "name": "Not A Goal"})
    data = assert_success(r, "create regular list")
    list_id = data["list"]["id"]

    # Verify it's not in goals
    r2 = rpc_call("list_personal_goals", {"instanceId": INSTANCE_1})
    data2 = assert_success(r2, "list_personal_goals")
    goal_ids = [g["id"] for g in data2["goals"]]
    assert list_id not in goal_ids, "Regular list should not appear in personal goals"

    # Clean up
    rpc_call("delete_list", {"instanceId": INSTANCE_1, "listId": list_id})


runner.run("regular_lists_not_in_goals", test_regular_lists_not_in_goals)


def test_list_count_unchanged():
    """Goal creation should not change the number of lists returned by get_lists."""
    r = rpc_call("get_lists", {"instanceId": INSTANCE_1})
    data = assert_success(r, "get_lists count check")
    current_count = len(data.get("lists", []))
    assert current_count == pre_list_count, \
        f"List count should be unchanged ({pre_list_count}), got {current_count}"


runner.run("list_count_unchanged", test_list_count_unchanged)

# ---------------------------------------------------------------------------
# Section 5: Edge Cases & Negative Tests
# ---------------------------------------------------------------------------
print("\n--- Section 5: Edge Cases & Negative Tests ---")


def test_create_goal_missing_name():
    r = rpc_call("create_goal", {"instanceId": INSTANCE_1})
    assert_error_code(r, "MISSING_PARAMETER", "missing name")


runner.run("create_goal_missing_name (negative)", test_create_goal_missing_name)


def test_create_goal_missing_instance():
    r = rpc_call("create_goal", {"name": "Orphan Goal"})
    assert_error_code(r, "MISSING_PARAMETER", "missing instanceId")


runner.run("create_goal_missing_instance (negative)", test_create_goal_missing_instance)


def test_get_goal_invalid_id():
    r = rpc_call("get_goal", {"instanceId": INSTANCE_1, "goalId": "goal-nonexistent"})
    assert_error_code(r, "GOAL_NOT_FOUND", "invalid goal ID")


runner.run("get_goal_invalid_id (negative)", test_get_goal_invalid_id)


def test_add_criteria_invalid_goal():
    r = rpc_call("add_criteria", {
        "instanceId": INSTANCE_1,
        "goalId": "goal-nonexistent",
        "text": "Should fail"
    })
    assert_error_code(r, "GOAL_NOT_FOUND", "criteria on invalid goal")


runner.run("add_criteria_invalid_goal (negative)", test_add_criteria_invalid_goal)


def test_validate_criteria_invalid_id():
    r = rpc_call("validate_criteria", {
        "instanceId": INSTANCE_1,
        "goalId": _goal_id,
        "criteriaId": "crit-nonexistent"
    })
    assert_error_code(r, "CRITERIA_NOT_FOUND", "validate invalid criteria")


runner.run("validate_criteria_invalid_id (negative)", test_validate_criteria_invalid_id)


def test_update_criteria_invalid_id():
    r = rpc_call("update_criteria", {
        "instanceId": INSTANCE_1,
        "goalId": _goal_id,
        "criteriaId": "crit-nonexistent",
        "text": "Should fail"
    })
    assert_error_code(r, "CRITERIA_NOT_FOUND", "update invalid criteria")


runner.run("update_criteria_invalid_id (negative)", test_update_criteria_invalid_id)


def test_create_goal_invalid_instance():
    r = rpc_call("create_goal", {
        "instanceId": "FakeInstance-0000",
        "name": "Should fail"
    })
    assert_error_code(r, "INVALID_INSTANCE", "invalid instance")


runner.run("create_goal_invalid_instance (negative)", test_create_goal_invalid_instance)

# ---------------------------------------------------------------------------
# Section 6: Permissions — Personal Goals
# ---------------------------------------------------------------------------
print("\n--- Section 6: Permissions (Personal Goals) ---")


def test_instance2_cannot_modify_instance1_goal():
    """INSTANCE_2 should NOT be able to add criteria to INSTANCE_1's goal."""
    r = rpc_call("add_criteria", {
        "instanceId": INSTANCE_2,
        "goalId": _goal_id,
        "text": "I shouldn't be able to do this"
    })
    assert_error_code(r, "GOAL_NOT_FOUND",
                      "Instance 2 can't find Instance 1's goal (different storage)")


runner.run("perm_cross_instance_criteria (negative)", test_instance2_cannot_modify_instance1_goal)


def test_instance2_own_goal():
    """INSTANCE_2 should be able to create and manage their own goals."""
    r = rpc_call("create_goal", {
        "instanceId": INSTANCE_2,
        "name": "Instance 2 Personal Goal"
    })
    data = assert_success(r, "instance 2 create own goal")
    goal_id = data["goal"]["id"]
    runner.created_goal_ids.append(goal_id)

    # Add criteria
    r2 = rpc_call("add_criteria", {
        "instanceId": INSTANCE_2,
        "goalId": goal_id,
        "text": "A criteria for instance 2"
    })
    assert_success(r2, "instance 2 add own criteria")

    # Delete
    r3 = rpc_call("delete_goal", {"instanceId": INSTANCE_2, "goalId": goal_id})
    assert_success(r3, "instance 2 delete own goal")
    runner.created_goal_ids.remove(goal_id)


runner.run("perm_instance2_own_goal", test_instance2_own_goal)

# ---------------------------------------------------------------------------
# Section 7: Dependencies
# ---------------------------------------------------------------------------
print("\n--- Section 7: Dependencies ---")

_dep_goal_id = None
_dep_crit_id = None
_dep_target_goal_id = None


def test_create_dependency_goal():
    """Create a goal with criteria that depend on another goal."""
    global _dep_goal_id, _dep_crit_id, _dep_target_goal_id

    # Create a target goal (the thing we depend on)
    r = rpc_call("create_goal", {
        "instanceId": INSTANCE_1,
        "name": "Dependency Target Goal"
    })
    data = assert_success(r, "create dep target goal")
    _dep_target_goal_id = data["goal"]["id"]
    runner.created_goal_ids.append(_dep_target_goal_id)

    # Create the dependent goal
    r2 = rpc_call("create_goal", {
        "instanceId": INSTANCE_1,
        "name": "Dependent Goal"
    })
    data2 = assert_success(r2, "create dependent goal")
    _dep_goal_id = data2["goal"]["id"]
    runner.created_goal_ids.append(_dep_goal_id)

    # Add a criteria with a dependency
    r3 = rpc_call("add_criteria", {
        "instanceId": INSTANCE_1,
        "goalId": _dep_goal_id,
        "text": "Target goal must be achieved"
    })
    data3 = assert_success(r3, "add criteria for dependency")
    _dep_crit_id = data3["criteria"]["id"]


runner.run("create_dependency_goal", test_create_dependency_goal)


def test_add_dependency():
    r = rpc_call("add_dependency", {
        "instanceId": INSTANCE_1,
        "goalId": _dep_goal_id,
        "criteriaId": _dep_crit_id,
        "dependsOnGoal": _dep_target_goal_id
    })
    data = assert_success(r, "add_dependency")
    assert data["dependency"]["type"] == "goal"
    assert data["dependency"]["id"] == _dep_target_goal_id


runner.run("add_dependency", test_add_dependency)


def test_validate_dependency_unsatisfied():
    """Dependency should not be satisfied when target goal is in_progress."""
    r = rpc_call("validate_dependency", {
        "instanceId": INSTANCE_1,
        "goalId": _dep_goal_id,
        "criteriaId": _dep_crit_id
    })
    data = assert_success(r, "validate_dependency unsatisfied")
    assert data["satisfied"] is False, "Dependency on in_progress goal should not be satisfied"
    assert data["dependency"]["status"] == "in_progress"


runner.run("validate_dependency_unsatisfied", test_validate_dependency_unsatisfied)


def test_validate_dependency_satisfied():
    """After achieving the target goal, dependency should auto-validate."""
    # Mark target goal as achieved
    rpc_call("set_goal_status", {
        "instanceId": INSTANCE_1,
        "goalId": _dep_target_goal_id,
        "status": "achieved"
    })

    # Now validate the dependency
    r = rpc_call("validate_dependency", {
        "instanceId": INSTANCE_1,
        "goalId": _dep_goal_id,
        "criteriaId": _dep_crit_id
    })
    data = assert_success(r, "validate_dependency satisfied")
    assert data["satisfied"] is True, "Dependency on achieved goal should be satisfied"
    assert data["dependency"]["status"] == "achieved"


runner.run("validate_dependency_satisfied", test_validate_dependency_satisfied)


def test_validate_dependency_auto_checks_criteria():
    """After dependency is satisfied, the criteria should be auto-validated."""
    r = rpc_call("get_goal", {"instanceId": INSTANCE_1, "goalId": _dep_goal_id})
    data = assert_success(r, "get_goal after dep validation")
    dep_criteria = [c for c in data["goal"]["criteria"] if c["id"] == _dep_crit_id]
    assert len(dep_criteria) == 1
    assert dep_criteria[0]["validated"] is True, "Criteria should be auto-validated after dependency satisfied"


runner.run("validate_dependency_auto_checks_criteria", test_validate_dependency_auto_checks_criteria)


def test_validate_dependencies_bulk():
    """validate_dependencies should process all deps in a goal."""
    r = rpc_call("validate_dependencies", {
        "instanceId": INSTANCE_1,
        "goalId": _dep_goal_id
    })
    data = assert_success(r, "validate_dependencies bulk")
    assert "totalDependencies" in data
    assert data["totalDependencies"] >= 1


runner.run("validate_dependencies_bulk", test_validate_dependencies_bulk)


def test_add_dependency_missing_type():
    """add_dependency without any dependsOn* param should fail."""
    r = rpc_call("add_dependency", {
        "instanceId": INSTANCE_1,
        "goalId": _dep_goal_id,
        "criteriaId": _dep_crit_id
        # no dependsOnTask/Goal/Project
    })
    assert_error_code(r, "MISSING_PARAMETER", "missing dependency target")


runner.run("add_dependency_missing_type (negative)", test_add_dependency_missing_type)


def test_validate_dependency_no_dep():
    """Criteria without a dependency should fail with NO_DEPENDENCY."""
    # Add a criteria without dependency
    r = rpc_call("add_criteria", {
        "instanceId": INSTANCE_1,
        "goalId": _dep_goal_id,
        "text": "No dependency here"
    })
    data = assert_success(r, "add criteria without dep")
    no_dep_crit = data["criteria"]["id"]

    r2 = rpc_call("validate_dependency", {
        "instanceId": INSTANCE_1,
        "goalId": _dep_goal_id,
        "criteriaId": no_dep_crit
    })
    assert_error_code(r2, "NO_DEPENDENCY", "criteria without dependency")


runner.run("validate_dependency_no_dep (negative)", test_validate_dependency_no_dep)

# ---------------------------------------------------------------------------
# Section 8: Goal Progress Counts
# ---------------------------------------------------------------------------
print("\n--- Section 8: Goal Progress Counts ---")


def test_progress_counts():
    """list_personal_goals should return accurate criteria/validated/stretch counts."""
    # Validate one criteria on the main test goal
    if _criteria_ids:
        rpc_call("validate_criteria", {
            "instanceId": INSTANCE_1,
            "goalId": _goal_id,
            "criteriaId": _criteria_ids[0]
        })

    r = rpc_call("list_personal_goals", {"instanceId": INSTANCE_1})
    data = assert_success(r, "progress counts")
    found = [g for g in data["goals"] if g["id"] == _goal_id]
    assert len(found) == 1
    goal = found[0]
    assert goal["criteriaCount"] == len(_criteria_ids), \
        f"Expected {len(_criteria_ids)} criteria, got {goal['criteriaCount']}"
    assert goal["validatedCount"] >= 1, "Should have at least 1 validated criteria"
    assert goal["stretchCount"] >= 1, "Should have at least 1 stretch criteria"


runner.run("progress_counts", test_progress_counts)

# ---------------------------------------------------------------------------
# Section 9: Volume Tests
# ---------------------------------------------------------------------------
print("\n--- Section 9: Volume Tests ---")


def test_volume_goals():
    """Create 10 goals with 5 criteria each = 50 criteria."""
    t0 = time.time()
    vol_goal_ids = []
    for i in range(10):
        r = rpc_call("create_goal", {
            "instanceId": INSTANCE_1,
            "name": f"Volume Goal {i}"
        })
        data = assert_success(r, f"volume create goal {i}")
        gid = data["goal"]["id"]
        vol_goal_ids.append(gid)
        runner.created_goal_ids.append(gid)

        for j in range(5):
            rpc_call("add_criteria", {
                "instanceId": INSTANCE_1,
                "goalId": gid,
                "text": f"Criteria {j} for goal {i}"
            })

    elapsed = time.time() - t0
    runner.log_timing("Create 10 goals x 5 criteria (50 items)", elapsed)

    # Verify list returns all
    r2 = rpc_call("list_personal_goals", {"instanceId": INSTANCE_1})
    data2 = assert_success(r2, "volume list goals")
    vol_found = [g for g in data2["goals"] if g["id"] in vol_goal_ids]
    assert len(vol_found) == 10, f"Expected 10 volume goals, found {len(vol_found)}"

    # Verify a single goal has 5 criteria
    r3 = rpc_call("get_goal", {"instanceId": INSTANCE_1, "goalId": vol_goal_ids[0]})
    data3 = assert_success(r3, "volume get single goal")
    assert len(data3["goal"]["criteria"]) == 5


runner.run("volume_goals (10x5=50 items)", test_volume_goals)


def test_volume_list_response_time():
    """list_personal_goals with many goals should still respond quickly."""
    t0 = time.time()
    r = rpc_call("list_personal_goals", {"instanceId": INSTANCE_1})
    elapsed = time.time() - t0
    assert_success(r, "volume response time")
    runner.log_timing("List all personal goals (with volume)", elapsed)
    assert elapsed < 5.0, f"list_personal_goals too slow: {elapsed:.3f}s"


runner.run("volume_list_response_time", test_volume_list_response_time)

# ---------------------------------------------------------------------------
# Section 10: Cleanup
# ---------------------------------------------------------------------------
print("\n--- Section 10: Cleanup ---")


def test_cleanup_goals():
    """Delete all test goals."""
    errors = 0
    for gid in list(runner.created_goal_ids):
        # Try both instances
        r = rpc_call("delete_goal", {"instanceId": INSTANCE_1, "goalId": gid})
        if not r["data"].get("success"):
            r2 = rpc_call("delete_goal", {"instanceId": INSTANCE_2, "goalId": gid})
            if not r2["data"].get("success"):
                errors += 1
    print(f"    Cleaned {len(runner.created_goal_ids)} goals ({errors} errors)")
    runner.created_goal_ids.clear()


runner.run("cleanup_goals", test_cleanup_goals)

# ---------------------------------------------------------------------------
# Section 11: Post-Cleanup Verification
# ---------------------------------------------------------------------------
print("\n--- Section 11: Post-Cleanup Verification ---")


def test_verify_clean_state():
    """After cleanup, goal and list counts should match pre-test snapshot."""
    r = rpc_call("list_personal_goals", {"instanceId": INSTANCE_1})
    data = assert_success(r, "post-cleanup goals")
    post_count = len(data.get("goals", []))
    delta = post_count - pre_goal_count
    print(f"    Clean: {post_count} goals (delta: {delta})")
    assert delta == 0, f"Goal count delta should be 0, got {delta}"

    r2 = rpc_call("get_lists", {"instanceId": INSTANCE_1})
    data2 = assert_success(r2, "post-cleanup lists")
    post_list_count = len(data2.get("lists", []))
    list_delta = post_list_count - pre_list_count
    print(f"    Lists: {post_list_count} lists (delta: {list_delta})")
    assert list_delta == 0, f"List count delta should be 0, got {list_delta}"


runner.run("verify_clean_state", test_verify_clean_state)

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
print(f"\nFinished: {datetime.now().isoformat()}")
ok = runner.summary()
sys.exit(0 if ok else 1)
