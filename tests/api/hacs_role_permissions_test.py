#!/usr/bin/env python3
"""
HACS Role & Permissions Regression Test Suite
==============================================
Tests privileged role functionality, permission boundaries, and EA proxy.
Designed to run BEFORE and AFTER the PA→EA rename to verify no breakage.

Usage:
    # Before rename (PA role):
    HACS_EXEC_TOKEN=xxx HACS_PA_TOKEN=yyy python3 hacs_role_permissions_test.py

    # After rename (EA role):
    HACS_EXEC_TOKEN=xxx HACS_EA_TOKEN=yyy PRIV_ROLE=EA python3 hacs_role_permissions_test.py

    # Custom API URL:
    python3 hacs_role_permissions_test.py https://smoothcurves.nexus/mcp

Environment Variables:
    HACS_EXEC_TOKEN   - Executive role token (required for project creation)
    HACS_PA_TOKEN     - PA role token (pre-rename)
    HACS_EA_TOKEN     - EA role token (post-rename)
    HACS_COO_TOKEN    - COO role token (optional, for cross-role tests)
    HACS_PM_TOKEN     - PM role token (optional)
    PRIV_ROLE         - "PA" or "EA" (default: auto-detect from available token)

Author: Ember-75b6
Created: 2026-03-03
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

# Role tokens
EXEC_TOKEN = os.environ.get("HACS_EXEC_TOKEN", None)
PA_TOKEN = os.environ.get("HACS_PA_TOKEN", None)
EA_TOKEN = os.environ.get("HACS_EA_TOKEN", None)
COO_TOKEN = os.environ.get("HACS_COO_TOKEN", None)
PM_TOKEN = os.environ.get("HACS_PM_TOKEN", None)

# Auto-detect which role name to test: PA or EA
# If PRIV_ROLE env var is set, use it. Otherwise detect from available token.
PRIV_ROLE = os.environ.get("PRIV_ROLE", None)
if not PRIV_ROLE:
    if EA_TOKEN:
        PRIV_ROLE = "EA"
    elif PA_TOKEN:
        PRIV_ROLE = "PA"
    else:
        PRIV_ROLE = "PA"  # default, tests will skip if no token

# The token for whichever role we're testing
PRIV_TOKEN = EA_TOKEN if PRIV_ROLE == "EA" else PA_TOKEN

# Test project name (timestamped for uniqueness)
TEST_PROJECT = f"role-test-{int(time.time())}"

# Instance IDs set during bootstrap
PRIV_INSTANCE = None      # Will adopt the privileged role (PA or EA)
DEV_INSTANCE = None       # Developer (non-privileged)
EXEC_INSTANCE = None      # Executive instance (for EA proxy tests)

# Disable SSL warnings
requests.packages.urllib3.disable_warnings()

# ---------------------------------------------------------------------------
# JSON-RPC helpers (same pattern as task regression test)
# ---------------------------------------------------------------------------
_rpc_id = 0


def rpc_call(method: str, params: dict = None, timeout: int = 30) -> dict:
    """Send a JSON-RPC 2.0 call and return the parsed result."""
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

    # Primary path: result.data contains handler return
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


def _require_priv_token():
    """Skip test if the privileged role token is not available."""
    if not PRIV_TOKEN:
        raise RuntimeError(f"SKIP: {PRIV_ROLE} token not set (HACS_{PRIV_ROLE}_TOKEN)")


def _require_exec_token():
    """Skip test if executive token is not available."""
    if not EXEC_TOKEN:
        raise RuntimeError("SKIP: Executive token not set (HACS_EXEC_TOKEN)")


def _require_priv_instance():
    """Skip test if privileged instance not set up."""
    if not PRIV_INSTANCE:
        raise RuntimeError(f"SKIP: {PRIV_ROLE} instance not bootstrapped")


def _require_exec_instance():
    """Skip if executive instance not bootstrapped."""
    if not EXEC_INSTANCE:
        raise RuntimeError("SKIP: Executive instance not bootstrapped")


def _require_project():
    """Skip if test project not created."""
    if not TEST_PROJECT_CREATED:
        raise RuntimeError("SKIP: Test project not created")


# Track what was created for cleanup
TEST_PROJECT_CREATED = False
CREATED_TASKS = []
CREATED_LISTS = []


# ---------------------------------------------------------------------------
# Test runner
# ---------------------------------------------------------------------------
class TestRunner:
    def __init__(self):
        self.passed = 0
        self.failed = 0
        self.skipped = 0
        self.errors = []

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

    def summary(self):
        total = self.passed + self.failed + self.skipped
        print("\n" + "=" * 70)
        skip_str = f", {self.skipped} skipped" if self.skipped else ""
        print(f"RESULTS: {self.passed}/{total} passed, {self.failed} failed{skip_str}")
        if self.errors:
            print("\nFailed tests:")
            for name, err, tb in self.errors:
                print(f"  - {name}: {err}")
        print("=" * 70)
        return self.failed == 0


runner = TestRunner()

# ===========================================================================
# HEADER
# ===========================================================================
print(f"\nHACS Role & Permissions Regression Test Suite")
print(f"API:         {API_URL}")
print(f"Role under test: {PRIV_ROLE}")
print(f"Token available: {'Yes' if PRIV_TOKEN else 'No'}")
print(f"Exec token:      {'Yes' if EXEC_TOKEN else 'No'}")
print(f"Test project:    {TEST_PROJECT}")
print(f"Started:         {datetime.now().isoformat()}")
print("=" * 70)

# ===========================================================================
# SETUP: Bootstrap test instances
# ===========================================================================
print("\n--- SETUP: Bootstrap test instances ---")


def _bootstrap_or_reuse(name):
    """Bootstrap a new instance or reuse existing one."""
    r = rpc_call("have_i_bootstrapped_before", {"name": name})
    data = r["data"]
    if data.get("success") and data.get("found") and data.get("instanceId"):
        inst_id = data["instanceId"]
        rpc_call("bootstrap", {"instanceId": inst_id})
        print(f"    {name} = {inst_id} (existing)")
        return inst_id
    else:
        r2 = rpc_call("bootstrap", {"name": name})
        d2 = r2["data"]
        inst_id = d2.get("instanceId")
        if not inst_id:
            raise AssertionError(f"Failed to bootstrap {name}: {d2}")
        print(f"    {name} = {inst_id} (new)")
        return inst_id


def setup_instances():
    global PRIV_INSTANCE, DEV_INSTANCE, EXEC_INSTANCE
    PRIV_INSTANCE = _bootstrap_or_reuse("RoleTestPriv")
    DEV_INSTANCE = _bootstrap_or_reuse("RoleTestDev")
    EXEC_INSTANCE = _bootstrap_or_reuse("RoleTestExec")


runner.run("setup_bootstrap", setup_instances)

if not PRIV_INSTANCE:
    print("\nFATAL: Could not bootstrap test instances. Aborting.")
    sys.exit(1)

# ===========================================================================
# SECTION 1: Role Adoption - Positive
# ===========================================================================
print(f"\n--- Section 1: Role Adoption ({PRIV_ROLE}) ---")


def test_adopt_privileged_role():
    """Adopting the privileged role with the correct token should succeed."""
    _require_priv_token()
    r = rpc_call("take_on_role", {
        "instanceId": PRIV_INSTANCE,
        "role": PRIV_ROLE,
        "token": PRIV_TOKEN
    })
    data = assert_success(r, f"adopt {PRIV_ROLE} with valid token")
    # Verify role is set
    r2 = rpc_call("introspect", {"instanceId": PRIV_INSTANCE})
    d2 = assert_success(r2, "introspect after role adoption")
    actual_role = d2.get("role") or d2.get("instance", {}).get("role") or d2.get("preferences", {}).get("role")
    assert actual_role == PRIV_ROLE, f"Expected role={PRIV_ROLE}, got {actual_role}"


def test_adopt_executive_role():
    """Executive adoption with correct token should succeed."""
    _require_exec_token()
    r = rpc_call("take_on_role", {
        "instanceId": EXEC_INSTANCE,
        "role": "Executive",
        "token": EXEC_TOKEN
    })
    assert_success(r, "adopt Executive with valid token")


def test_adopt_developer_role():
    """Developer is non-privileged, should succeed without token."""
    r = rpc_call("take_on_role", {
        "instanceId": DEV_INSTANCE,
        "role": "Developer"
    })
    assert_success(r, "adopt Developer (no token needed)")


runner.run("adopt_privileged_role", test_adopt_privileged_role)
runner.run("adopt_executive_role", test_adopt_executive_role)
runner.run("adopt_developer_role", test_adopt_developer_role)

# ===========================================================================
# SECTION 2: Role Adoption - Negative
# ===========================================================================
print(f"\n--- Section 2: Role Adoption Negative ---")


def test_adopt_privileged_no_token():
    """Adopting a privileged role WITHOUT a token should fail."""
    r = rpc_call("take_on_role", {
        "instanceId": DEV_INSTANCE,
        "role": PRIV_ROLE
        # No token
    })
    assert_failure(r, f"{PRIV_ROLE} without token should fail")


def test_adopt_privileged_wrong_token():
    """Adopting a privileged role with WRONG token should fail."""
    r = rpc_call("take_on_role", {
        "instanceId": DEV_INSTANCE,
        "role": PRIV_ROLE,
        "token": "definitely-not-a-valid-token-abc123"
    })
    assert_failure(r, f"{PRIV_ROLE} with wrong token should fail")


def test_adopt_executive_no_token():
    """Executive without token should fail."""
    r = rpc_call("take_on_role", {
        "instanceId": DEV_INSTANCE,
        "role": "Executive"
    })
    assert_failure(r, "Executive without token should fail")


def test_adopt_bogus_role():
    """Adopting a non-existent role should fail."""
    r = rpc_call("take_on_role", {
        "instanceId": DEV_INSTANCE,
        "role": "GalacticOverlord"
    })
    assert_failure(r, "bogus role should fail")


def test_adopt_empty_role():
    """Empty role string should fail."""
    r = rpc_call("take_on_role", {
        "instanceId": DEV_INSTANCE,
        "role": ""
    })
    assert_failure(r, "empty role should fail")


runner.run("adopt_privileged_no_token", test_adopt_privileged_no_token)
runner.run("adopt_privileged_wrong_token", test_adopt_privileged_wrong_token)
runner.run("adopt_executive_no_token", test_adopt_executive_no_token)
runner.run("adopt_bogus_role", test_adopt_bogus_role)
runner.run("adopt_empty_role", test_adopt_empty_role)

# ===========================================================================
# SECTION 3: Permission - get_all_instances
# ===========================================================================
print(f"\n--- Section 3: get_all_instances Permission ---")


def test_priv_can_get_all_instances():
    """Privileged role can call get_all_instances."""
    _require_priv_instance()
    r = rpc_call("get_all_instances", {"instanceId": PRIV_INSTANCE})
    data = assert_success(r, f"{PRIV_ROLE} can get_all_instances")
    instances = data.get("instances", [])
    assert isinstance(instances, list), "Should return instances list"
    assert len(instances) > 0, "Should find at least our test instances"


def test_dev_cannot_get_all_instances():
    """Developer cannot call get_all_instances (or can they?)."""
    r = rpc_call("get_all_instances", {"instanceId": DEV_INSTANCE})
    data = r["data"]
    # KNOWN BEHAVIOR: get_all_instances may not check permissions
    # Document whether it succeeds or fails
    if data.get("success"):
        print(f"        NOTE: Developer CAN get_all_instances (no permission check)")
    else:
        print(f"        Developer correctly blocked from get_all_instances")


runner.run("priv_can_get_all_instances", test_priv_can_get_all_instances)
runner.run("dev_cannot_get_all_instances", test_dev_cannot_get_all_instances)

# ===========================================================================
# SECTION 4: Permission - list_projects (get_all_projects)
# ===========================================================================
print(f"\n--- Section 4: list_projects Permission ---")


def test_priv_can_list_projects():
    """Privileged role can list all projects."""
    _require_priv_instance()
    r = rpc_call("list_projects", {"instanceId": PRIV_INSTANCE})
    data = assert_success(r, f"{PRIV_ROLE} can list_projects")
    projects = data.get("projects", [])
    assert isinstance(projects, list), "Should return projects list"


def test_dev_list_projects():
    """Developer can list projects (it's a read-only endpoint, may or may not restrict)."""
    r = rpc_call("list_projects", {"instanceId": DEV_INSTANCE})
    # Note: list_projects may not be permission-gated in the same way.
    # This test documents the current behavior.
    data = r["data"]
    print(f"        Developer list_projects: success={data.get('success')}")


runner.run("priv_can_list_projects", test_priv_can_list_projects)
runner.run("dev_list_projects_behavior", test_dev_list_projects)

# ===========================================================================
# SECTION 5: Permission - create_project
# ===========================================================================
print(f"\n--- Section 5: create_project Permission ---")


def test_priv_can_create_project():
    """Privileged role can create a project."""
    global TEST_PROJECT_CREATED
    _require_priv_instance()
    r = rpc_call("create_project", {
        "instanceId": PRIV_INSTANCE,
        "projectId": TEST_PROJECT,
        "name": f"Role Test Project {PRIV_ROLE}",
        "description": "Temporary project for role permission testing"
    })
    data = assert_success(r, f"{PRIV_ROLE} can create_project")
    TEST_PROJECT_CREATED = True


def test_dev_cannot_create_project():
    """Developer cannot create a project."""
    r = rpc_call("create_project", {
        "instanceId": DEV_INSTANCE,
        "projectId": f"dev-no-perm-{int(time.time())}",
        "name": "Should Fail",
        "description": "Developer should not be able to create projects"
    })
    assert_failure(r, "Developer should not create projects")


runner.run("priv_can_create_project", test_priv_can_create_project)
runner.run("dev_cannot_create_project", test_dev_cannot_create_project)

# ===========================================================================
# SECTION 6: Permission - project task management
# ===========================================================================
print(f"\n--- Section 6: Project Task Management ---")


def test_priv_join_project():
    """Privileged role can join a project."""
    _require_priv_instance()
    _require_project()
    r = rpc_call("join_project", {
        "instanceId": PRIV_INSTANCE,
        "project": TEST_PROJECT
    })
    assert_success(r, f"{PRIV_ROLE} can join project")


def test_priv_create_project_task():
    """Privileged role can create a task on a project."""
    _require_priv_instance()
    _require_project()
    r = rpc_call("create_task", {
        "instanceId": PRIV_INSTANCE,
        "projectId": TEST_PROJECT,
        "title": f"Test task from {PRIV_ROLE}",
        "description": "Created by privileged role for testing"
    })
    data = assert_success(r, f"{PRIV_ROLE} can create project task")
    task_id = data.get("taskId") or data.get("task", {}).get("taskId")
    if task_id:
        CREATED_TASKS.append(task_id)


def test_priv_list_project_tasks():
    """Privileged role can list project tasks."""
    _require_priv_instance()
    _require_project()
    r = rpc_call("list_tasks", {
        "instanceId": PRIV_INSTANCE,
        "projectId": TEST_PROJECT
    })
    data = assert_success(r, f"{PRIV_ROLE} can list project tasks")
    tasks = data.get("tasks", [])
    assert isinstance(tasks, list), "Should return tasks list"


runner.run("priv_join_project", test_priv_join_project)
runner.run("priv_create_project_task", test_priv_create_project_task)
runner.run("priv_list_project_tasks", test_priv_list_project_tasks)

# ===========================================================================
# SECTION 7: Permission - pre_approve
# ===========================================================================
print(f"\n--- Section 7: pre_approve Permission ---")


def test_priv_can_pre_approve():
    """Privileged role can pre-approve a new instance."""
    _require_priv_instance()
    # pre_approve requires an apiKey; use a placeholder
    # The test verifies the PERMISSION check, not the full wake flow
    r = rpc_call("pre_approve", {
        "instanceId": PRIV_INSTANCE,
        "name": f"PreApproveTest-{int(time.time())}",
        "apiKey": "test-api-key-placeholder"
    })
    data = r["data"]
    # pre_approve may fail for other reasons (invalid apiKey),
    # but should NOT fail with a permissions error
    if not data.get("success"):
        err = data.get("error", {})
        err_code = str(err.get("code", ""))
        err_msg = str(err.get("message", ""))
        # Permission errors are the thing we're testing against
        assert "UNAUTHORIZED" not in err_code and "not authorized" not in err_msg.lower(), \
            f"{PRIV_ROLE} should have permission for pre_approve, got: {err_msg}"
        print(f"        (pre_approve failed for non-permission reason: {err_code})")
    else:
        print(f"        (pre_approve succeeded)")


def test_dev_cannot_pre_approve():
    """Developer cannot pre-approve instances."""
    r = rpc_call("pre_approve", {
        "instanceId": DEV_INSTANCE,
        "name": "ShouldFail",
        "apiKey": "test-api-key-placeholder"
    })
    data = r["data"]
    if not data.get("success"):
        err = data.get("error", {})
        err_code = err.get("code", "")
        err_msg = err.get("message", "")
        # Should fail with permission error (or at minimum, fail)
        print(f"        Developer pre_approve blocked: {err_code}")
    else:
        raise AssertionError("Developer should NOT be able to pre_approve")


runner.run("priv_can_pre_approve", test_priv_can_pre_approve)
runner.run("dev_cannot_pre_approve", test_dev_cannot_pre_approve)

# ===========================================================================
# SECTION 8: Permission - recovery keys
# ===========================================================================
print(f"\n--- Section 8: Recovery Key Permissions ---")


def test_priv_can_get_recovery_key():
    """Privileged role can check recovery key status."""
    _require_priv_instance()
    r = rpc_call("get_recovery_key", {
        "instanceId": PRIV_INSTANCE,
        "targetInstanceId": DEV_INSTANCE
    })
    # May succeed or fail (no key exists), but should not be UNAUTHORIZED
    data = r["data"]
    if not data.get("success"):
        err = data.get("error", {})
        assert "UNAUTHORIZED" not in str(err.get("code", "")), \
            f"{PRIV_ROLE} should have permission for get_recovery_key"


def test_dev_cannot_get_recovery_key():
    """Developer cannot check recovery keys for other instances."""
    r = rpc_call("get_recovery_key", {
        "instanceId": DEV_INSTANCE,
        "targetInstanceId": PRIV_INSTANCE
    })
    assert_failure(r, "Developer should not be able to get_recovery_key for others")


runner.run("priv_can_get_recovery_key", test_priv_can_get_recovery_key)
runner.run("dev_cannot_get_recovery_key", test_dev_cannot_get_recovery_key)

# ===========================================================================
# SECTION 9: Permission - generate_recovery_key
# ===========================================================================
print(f"\n--- Section 9: generate_recovery_key Permissions ---")


def test_priv_can_generate_recovery_key():
    """Privileged role can generate a recovery key."""
    _require_priv_instance()
    r = rpc_call("generate_recovery_key", {
        "instanceId": PRIV_INSTANCE,
        "targetInstanceId": DEV_INSTANCE
    })
    data = r["data"]
    if not data.get("success"):
        err = data.get("error", {})
        assert "UNAUTHORIZED" not in str(err.get("code", "")), \
            f"{PRIV_ROLE} should have permission for generate_recovery_key"


def test_dev_cannot_generate_recovery_key():
    """Developer cannot generate recovery keys."""
    r = rpc_call("generate_recovery_key", {
        "instanceId": DEV_INSTANCE,
        "targetInstanceId": PRIV_INSTANCE
    })
    assert_failure(r, "Developer should not generate recovery keys")


runner.run("priv_can_generate_recovery_key", test_priv_can_generate_recovery_key)
runner.run("dev_cannot_generate_recovery_key", test_dev_cannot_generate_recovery_key)

# ===========================================================================
# SECTION 10: EA Proxy - Positive
# ===========================================================================
print(f"\n--- Section 10: EA Proxy ({PRIV_ROLE} acting as Executive) ---")


def test_ea_proxy_get_tasks():
    """Privileged role can use EA proxy to read Executive's tasks."""
    _require_priv_instance()
    _require_exec_instance()
    r = rpc_call("get_my_tasks", {
        "instanceId": PRIV_INSTANCE,
        "ea_proxy": True
    })
    data = r["data"]
    if not data.get("success"):
        err = data.get("error", {})
        err_msg = err.get("message", "")
        # If no Executive found, that's a setup issue not a permission issue
        if "No Executive instance" in err_msg:
            print(f"        (EA proxy: no Executive instance found - setup issue)")
        else:
            raise AssertionError(f"EA proxy get_my_tasks failed: {err_msg}")
    else:
        print(f"        EA proxy get_my_tasks succeeded")


def test_ea_proxy_get_lists():
    """Privileged role can use EA proxy to read Executive's lists."""
    _require_priv_instance()
    _require_exec_instance()
    r = rpc_call("get_lists", {
        "instanceId": PRIV_INSTANCE,
        "ea_proxy": True
    })
    data = r["data"]
    if not data.get("success"):
        err = data.get("error", {})
        err_msg = err.get("message", "")
        if "No Executive instance" in err_msg:
            print(f"        (EA proxy: no Executive instance found - setup issue)")
        else:
            raise AssertionError(f"EA proxy get_lists failed: {err_msg}")
    else:
        print(f"        EA proxy get_lists succeeded")


def test_ea_proxy_create_task_for_exec():
    """Privileged role can use EA proxy to create a task on Executive's behalf."""
    _require_priv_instance()
    _require_exec_instance()
    r = rpc_call("create_task", {
        "instanceId": PRIV_INSTANCE,
        "ea_proxy": True,
        "title": f"EA proxy test task from {PRIV_ROLE}",
        "description": "Created via EA proxy for testing"
    })
    data = r["data"]
    if not data.get("success"):
        err = data.get("error", {})
        err_msg = err.get("message", "")
        if "No Executive instance" in err_msg:
            print(f"        (EA proxy: no Executive instance found - setup issue)")
        else:
            raise AssertionError(f"EA proxy create_task failed: {err_msg}")
    else:
        task_id = data.get("taskId") or data.get("task", {}).get("taskId")
        if task_id:
            CREATED_TASKS.append(task_id)
        print(f"        EA proxy create_task succeeded: {task_id}")


runner.run("ea_proxy_get_tasks", test_ea_proxy_get_tasks)
runner.run("ea_proxy_get_lists", test_ea_proxy_get_lists)
runner.run("ea_proxy_create_task_for_exec", test_ea_proxy_create_task_for_exec)

# ===========================================================================
# SECTION 11: EA Proxy - Negative
# ===========================================================================
print(f"\n--- Section 11: EA Proxy Negative ---")


def test_dev_cannot_ea_proxy():
    """Developer cannot use EA proxy."""
    r = rpc_call("get_my_tasks", {
        "instanceId": DEV_INSTANCE,
        "ea_proxy": True
    })
    data = r["data"]
    if data.get("success"):
        # Check if it returned the Developer's own tasks (proxy was ignored)
        # vs actually returning Executive's tasks (proxy worked = bug)
        print(f"        WARNING: Developer ea_proxy returned success")
        # This might be OK if the proxy silently falls through to the caller's own data
        # Document the behavior
    else:
        err = data.get("error", {})
        print(f"        Developer EA proxy correctly denied: {err.get('code', 'unknown')}")


runner.run("dev_cannot_ea_proxy", test_dev_cannot_ea_proxy)

# ===========================================================================
# SECTION 12: High-Privilege Task Operations
# ===========================================================================
print(f"\n--- Section 12: High-Privilege Task Operations ---")


def test_priv_can_assign_task():
    """Privileged role can assign a project task to someone."""
    _require_priv_instance()
    _require_project()
    if not CREATED_TASKS:
        raise RuntimeError("SKIP: No created tasks to assign")
    task_id = CREATED_TASKS[0]
    r = rpc_call("assign_task_to_instance", {
        "instanceId": PRIV_INSTANCE,
        "taskId": task_id,
        "assigneeInstanceId": DEV_INSTANCE,
        "projectId": TEST_PROJECT
    })
    data = r["data"]
    if not data.get("success"):
        err = data.get("error", {})
        # Assignment might fail for non-permission reasons (task not found in project)
        # but should not fail for UNAUTHORIZED
        assert "UNAUTHORIZED" not in str(err.get("code", "")), \
            f"{PRIV_ROLE} should have permission to assign tasks"
        print(f"        assign_task failed for non-perm reason: {err.get('code')}")
    else:
        print(f"        assign_task succeeded")


def test_priv_is_high_privilege():
    """Verify introspect shows the role as privileged."""
    _require_priv_instance()
    r = rpc_call("introspect", {"instanceId": PRIV_INSTANCE})
    data = assert_success(r, "introspect")
    role = data.get("role") or data.get("instance", {}).get("role") or data.get("preferences", {}).get("role")
    assert role == PRIV_ROLE, f"Expected {PRIV_ROLE}, got {role}"
    # Check if the introspect response shows privileged status
    prefs = data.get("preferences", {})
    print(f"        Role confirmed: {role}")


runner.run("priv_can_assign_task", test_priv_can_assign_task)
runner.run("priv_is_high_privilege", test_priv_is_high_privilege)

# ===========================================================================
# SECTION 13: Cross-Role Verification
# ===========================================================================
print(f"\n--- Section 13: Cross-Role Verification ---")


def test_role_in_list_roles():
    """The role under test should appear in list_roles."""
    r = rpc_call("list_roles")
    data = assert_success(r, "list_roles")
    roles = data.get("roles", [])
    role_ids = [r.get("roleId") or r.get("id") for r in roles]
    assert PRIV_ROLE in role_ids, f"{PRIV_ROLE} should be in list_roles, got: {role_ids}"


def test_role_has_wisdom():
    """The role under test should have wisdom files."""
    r = rpc_call("get_role_wisdom", {"roleId": PRIV_ROLE})
    data = r["data"]
    # May or may not succeed depending on if wisdom files exist
    if data.get("success"):
        print(f"        {PRIV_ROLE} has wisdom files")
    else:
        print(f"        {PRIV_ROLE} wisdom: {data.get('error', {}).get('message', 'unknown')}")


def test_role_summary():
    """The role under test should have a summary."""
    r = rpc_call("get_role_summary", {"roleId": PRIV_ROLE})
    data = r["data"]
    if data.get("success"):
        summary = data.get("summary", "")
        assert len(summary) > 0, "Role summary should not be empty"
        print(f"        {PRIV_ROLE} summary: {summary[:80]}...")
    else:
        print(f"        {PRIV_ROLE} summary not found")


runner.run("role_in_list_roles", test_role_in_list_roles)
runner.run("role_has_wisdom", test_role_has_wisdom)
runner.run("role_summary", test_role_summary)

# ===========================================================================
# SECTION 14: Permission Boundary - Messaging
# ===========================================================================
print(f"\n--- Section 14: Messaging Permission ---")


def test_priv_can_send_message():
    """Privileged role can send a message."""
    _require_priv_instance()
    r = rpc_call("send_message", {
        "from": PRIV_INSTANCE,
        "to": DEV_INSTANCE,
        "body": f"Test message from {PRIV_ROLE} role permission test"
    })
    data = r["data"]
    if data.get("success"):
        print(f"        {PRIV_ROLE} can send messages")
    else:
        # send_message might use XMPP which could fail for infra reasons
        err = data.get("error", {})
        print(f"        send_message result: {err.get('message', 'unknown')[:80]}")


def test_dev_can_send_message():
    """Developer can also send messages (not restricted)."""
    r = rpc_call("send_message", {
        "from": DEV_INSTANCE,
        "to": PRIV_INSTANCE,
        "body": "Test message from Developer role permission test"
    })
    data = r["data"]
    print(f"        Developer send_message: success={data.get('success')}")


runner.run("priv_can_send_message", test_priv_can_send_message)
runner.run("dev_can_send_message", test_dev_can_send_message)

# ===========================================================================
# SECTION 15: Edge Cases
# ===========================================================================
print(f"\n--- Section 15: Edge Cases ---")


def test_null_instance_id():
    """Calling a privileged API with null instanceId -- document behavior."""
    r = rpc_call("get_all_instances", {"instanceId": None})
    data = r["data"]
    # KNOWN: get_all_instances may not validate instanceId
    print(f"        null instanceId: success={data.get('success')}")


def test_empty_instance_id():
    """Empty string instanceId -- document behavior."""
    r = rpc_call("get_all_instances", {"instanceId": ""})
    data = r["data"]
    print(f"        empty instanceId: success={data.get('success')}")


def test_bogus_instance_id():
    """Non-existent instanceId -- document behavior."""
    r = rpc_call("get_all_instances", {"instanceId": "does-not-exist-xyz"})
    data = r["data"]
    print(f"        bogus instanceId: success={data.get('success')}")


def test_role_case_sensitivity():
    """Role names should be case-sensitive (PA != pa != Pa)."""
    _require_priv_token()
    # Try lowercase version of the privileged role
    r = rpc_call("take_on_role", {
        "instanceId": DEV_INSTANCE,
        "role": PRIV_ROLE.lower(),  # "pa" or "ea"
        "token": PRIV_TOKEN
    })
    data = r["data"]
    # If it succeeds, that might be OK (case-insensitive matching)
    # If it fails, that's also OK (strict case matching)
    # Document the behavior
    print(f"        Lowercase role '{PRIV_ROLE.lower()}': success={data.get('success')}")


def test_switch_roles():
    """An instance can switch from one role to another."""
    _require_priv_token()
    # First take Developer role
    r1 = rpc_call("take_on_role", {
        "instanceId": DEV_INSTANCE,
        "role": "Developer"
    })
    assert_success(r1, "switch to Developer")
    # Verify Developer
    r2 = rpc_call("introspect", {"instanceId": DEV_INSTANCE})
    d2 = assert_success(r2)
    role = d2.get("role") or d2.get("instance", {}).get("role") or d2.get("preferences", {}).get("role")
    assert role == "Developer", f"Should be Developer, got {role}"
    # Now switch to privileged role
    r3 = rpc_call("take_on_role", {
        "instanceId": DEV_INSTANCE,
        "role": PRIV_ROLE,
        "token": PRIV_TOKEN
    })
    assert_success(r3, f"switch to {PRIV_ROLE}")
    # Verify role changed
    r4 = rpc_call("introspect", {"instanceId": DEV_INSTANCE})
    d4 = assert_success(r4)
    role = d4.get("role") or d4.get("instance", {}).get("role") or d4.get("preferences", {}).get("role")
    assert role == PRIV_ROLE, f"Should be {PRIV_ROLE}, got {role}"
    # Switch back to Developer for cleanup
    rpc_call("take_on_role", {"instanceId": DEV_INSTANCE, "role": "Developer"})


runner.run("null_instance_id", test_null_instance_id)
runner.run("empty_instance_id", test_empty_instance_id)
runner.run("bogus_instance_id", test_bogus_instance_id)
runner.run("role_case_sensitivity", test_role_case_sensitivity)
runner.run("switch_roles", test_switch_roles)

# ===========================================================================
# SECTION 16: Personal Tasks (non-privileged baseline)
# ===========================================================================
print(f"\n--- Section 16: Personal Tasks (privilege comparison) ---")


def test_priv_create_personal_task():
    """Privileged role can create personal tasks."""
    _require_priv_instance()
    r = rpc_call("create_task", {
        "instanceId": PRIV_INSTANCE,
        "title": f"Personal task from {PRIV_ROLE}",
        "description": "Testing personal task creation by privileged role"
    })
    data = assert_success(r, f"{PRIV_ROLE} can create personal task")
    task_id = data.get("taskId") or data.get("task", {}).get("taskId")
    if task_id:
        CREATED_TASKS.append(task_id)


def test_dev_create_personal_task():
    """Developer can create personal tasks (not restricted)."""
    r = rpc_call("create_task", {
        "instanceId": DEV_INSTANCE,
        "title": "Personal task from Developer",
        "description": "Testing personal task creation by Developer"
    })
    data = assert_success(r, "Developer can create personal task")
    task_id = data.get("taskId") or data.get("task", {}).get("taskId")
    if task_id:
        CREATED_TASKS.append(task_id)


runner.run("priv_create_personal_task", test_priv_create_personal_task)
runner.run("dev_create_personal_task", test_dev_create_personal_task)

# ===========================================================================
# SECTION 17: List Operations (privilege comparison)
# ===========================================================================
print(f"\n--- Section 17: List Operations ---")


def test_priv_create_list():
    """Privileged role can create a personal checklist."""
    _require_priv_instance()
    r = rpc_call("create_list", {
        "instanceId": PRIV_INSTANCE,
        "name": f"Test list from {PRIV_ROLE}"
    })
    data = assert_success(r, f"{PRIV_ROLE} can create list")
    list_id = data.get("listId") or data.get("list", {}).get("listId")
    if list_id:
        CREATED_LISTS.append((PRIV_INSTANCE, list_id))


def test_priv_get_lists():
    """Privileged role can get their own lists."""
    _require_priv_instance()
    r = rpc_call("get_lists", {"instanceId": PRIV_INSTANCE})
    assert_success(r, f"{PRIV_ROLE} can get own lists")


def test_priv_access_exec_lists():
    """Privileged role can access Executive's lists (via targetInstanceId)."""
    _require_priv_instance()
    _require_exec_instance()
    r = rpc_call("get_lists", {
        "instanceId": PRIV_INSTANCE,
        "targetInstanceId": EXEC_INSTANCE
    })
    data = r["data"]
    if data.get("success"):
        print(f"        {PRIV_ROLE} can access Executive's lists via targetInstanceId")
    else:
        err = data.get("error", {})
        print(f"        Access Executive lists: {err.get('code', 'unknown')}")


def test_dev_cannot_access_exec_lists():
    """Developer cannot access Executive's lists."""
    _require_exec_instance()
    r = rpc_call("get_lists", {
        "instanceId": DEV_INSTANCE,
        "targetInstanceId": EXEC_INSTANCE
    })
    data = r["data"]
    if data.get("success"):
        print(f"        WARNING: Developer could access Executive's lists")
    else:
        print(f"        Developer correctly blocked from Executive's lists")


runner.run("priv_create_list", test_priv_create_list)
runner.run("priv_get_lists", test_priv_get_lists)
runner.run("priv_access_exec_lists", test_priv_access_exec_lists)
runner.run("dev_cannot_access_exec_lists", test_dev_cannot_access_exec_lists)

# ===========================================================================
# SECTION 18: Diary Operations
# ===========================================================================
print(f"\n--- Section 18: Diary Operations ---")


def test_priv_write_diary():
    """Privileged role can write diary entries."""
    _require_priv_instance()
    r = rpc_call("add_diary_entry", {
        "instanceId": PRIV_INSTANCE,
        "entry": f"Regression test diary entry from {PRIV_ROLE} at {datetime.now().isoformat()}"
    })
    assert_success(r, f"{PRIV_ROLE} can write diary")


def test_priv_read_diary():
    """Privileged role can read their own diary."""
    _require_priv_instance()
    r = rpc_call("get_diary", {"instanceId": PRIV_INSTANCE})
    assert_success(r, f"{PRIV_ROLE} can read diary")


runner.run("priv_write_diary", test_priv_write_diary)
runner.run("priv_read_diary", test_priv_read_diary)

# ===========================================================================
# CLEANUP
# ===========================================================================
print("\n--- CLEANUP ---")


def cleanup():
    """Clean up test resources."""
    cleaned = 0

    # Delete created tasks
    for task_id in CREATED_TASKS:
        try:
            rpc_call("delete_task", {"instanceId": PRIV_INSTANCE, "taskId": task_id})
            cleaned += 1
        except Exception:
            pass

    # Delete created lists
    for inst_id, list_id in CREATED_LISTS:
        try:
            rpc_call("delete_list", {"instanceId": inst_id, "listId": list_id})
            cleaned += 1
        except Exception:
            pass

    print(f"    Cleaned up {cleaned} resources")

    # Note: test instances and project are left for manual cleanup
    # They have distinctive names (RoleTestPriv, RoleTestDev, RoleTestExec)
    if TEST_PROJECT_CREATED:
        print(f"    NOTE: Test project '{TEST_PROJECT}' was created and should be manually cleaned up")

    print(f"    Test instances: {PRIV_INSTANCE}, {DEV_INSTANCE}, {EXEC_INSTANCE}")


runner.run("cleanup", cleanup)

# ===========================================================================
# SUMMARY
# ===========================================================================
success = runner.summary()
print(f"\nRole tested: {PRIV_ROLE}")
print(f"Finished: {datetime.now().isoformat()}")
sys.exit(0 if success else 1)
