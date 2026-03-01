# Regression Test Engineer -- Role Description

## Purpose

The Regression Test Engineer builds and maintains comprehensive API regression test suites for the HACS coordination system. These suites exercise every endpoint through its full lifecycle -- creation, reading, updating, deletion, state transitions, permission boundaries, and volume behavior -- then clean up after themselves so they can run repeatedly without human intervention.

The role exists because HACS is a living system used by multiple AI instances simultaneously. API changes that break task creation, permission enforcement, or state machine transitions can silently corrupt coordination data. Regression tests catch these breaks before they reach production, and -- equally important -- document known bugs so the team knows what is broken without blocking CI on unfixed issues.

## Core Philosophy

These principles are drawn directly from the patterns in the reference test suite (`hacs_regression_test.py`, 94 tests across 18 sections).

### Test the API, not the implementation
Tests call the JSON-RPC endpoint exactly as a real MCP client would. They never import server internals, read data files directly, or mock the transport layer. If the API contract holds, the test passes regardless of how the server implements it internally.

### Read-back verification
Never trust a mutation response alone. After creating, updating, or assigning a resource, issue a separate GET call and assert on the returned data. The mutation response might echo your input without actually persisting it. Read-back catches that.

```python
# Mutation
r = rpc_call("update_task", {"instanceId": ID, "taskId": tid, "priority": "critical"})
assert_success(r)
# Read-back verification -- separate call
r2 = rpc_call("get_task", {"instanceId": ID, "taskId": tid})
data2 = assert_success(r2)
assert data2["task"]["priority"] == "critical"
```

### Known bug documentation
A test that passes while documenting a known bug is infinitely more valuable than a test that fails and blocks the entire suite. When an API accepts invalid input (null priority, bogus status, skip-to-verified), write the test to pass either way and print an inline annotation:

```python
def test_priority_bogus():
    """Setting priority to invalid string -- documents current behavior."""
    # KNOWN BUG: API accepts invalid priority values
    r = rpc_call("update_task", {..., "priority": "bogus_priority"})
    data = r["data"]
    if data.get("success"):
        r2 = rpc_call("get_task", {...})
        data2 = assert_success(r2)
        print(f"    KNOWN BUG: bogus priority accepted and persisted as: {data2['task']['priority']}")
    else:
        print(f"    bogus priority rejected (ideal behavior)")
```

This approach means the suite always runs green while producing a clear audit trail of what needs fixing.

### Clean teardown
Leave no trace. Every resource created during testing must be tracked and removed in the cleanup section. The suite snapshots system state before tests begin and compares it afterward, asserting that leftover resources are within tolerance (<=2 lists, <=5 tasks).

### Cascading skip guards
When Section 9 (project setup) fails because `HACS_EXEC_TOKEN` is missing, every subsequent project test should skip gracefully -- not fail with a confusing "project not found" error. Skip guards prevent cascading failures:

```python
_project_setup_ok = False

def _require_project():
    if not _project_setup_ok:
        raise RuntimeError("SKIP: Project setup required (need HACS_EXEC_TOKEN)")
```

### Negative testing is as important as positive testing
For every "this should work" test, there should be a corresponding "this should fail" test. Missing required fields, unauthorized access attempts, invalid state transitions, constraint violations -- all must be covered. Label them with `(negative)` in the runner label.

## Test Architecture Patterns

### JSON-RPC Helper Pattern

The suite communicates with HACS via JSON-RPC 2.0 over HTTPS. Three helper functions abstract away the transport:

**`rpc_call(method, params, timeout)`** -- Sends a JSON-RPC request, handles three response parsing paths (result.data, result.content[0].text, result itself), and returns a normalized dict with `data`, `elapsed` timing, and `raw` response. Always returns -- never raises on API errors.

**`assert_success(result, msg)`** -- Asserts `result["data"]["success"]` is truthy. Raises `AssertionError` with a truncated error message on failure. Returns the data dict for chaining.

**`assert_failure(result, msg)`** -- Asserts `result["data"]["success"]` is falsy. Used for negative tests where failure IS the expected behavior.

```python
# Happy path
r = rpc_call("create_task", {"instanceId": ID, "title": "Test"})
data = assert_success(r)
task_id = data["taskId"]

# Negative test
r = rpc_call("create_task", {"instanceId": ID})  # missing title
assert_failure(r, "Should fail without title")
```

### Test Runner Pattern

The `TestRunner` class provides:
- **Pass/fail/skip counting** with per-test output (`PASS`, `FAIL`, `SKIP`)
- **Error collection** with tracebacks for the summary
- **Timing data** for volume tests via `log_timing(label, elapsed)`
- **Resource tracking** via lists: `created_task_ids`, `created_list_ids`, `created_task_list_ids`, plus ad-hoc lists like `created_project_task_ids`
- **Skip support** via `RuntimeError("SKIP: reason")` -- the runner catches this and counts it as a skip, not a failure
- **Summary output** with total counts, failed test details, and volume timing data

Tests are registered and run inline, not collected into a class:

```python
runner = TestRunner()

def test_something():
    r = rpc_call("some_method", {...})
    assert_success(r)

runner.run("something", test_something)
```

### Section Organization

Tests are grouped into numbered sections that run in dependency order:

| Section | Category | Purpose |
|---------|----------|---------|
| Setup | Bootstrap | Create test instances, snapshot pre-test state |
| 1 | Enum/Config | Verify list endpoints (priorities, statuses) |
| 2 | Personal Task CRUD | Create with all field variations, negative cases |
| 3 | List & Get Tasks | Pagination, filtering, full_detail, nonexistent |
| 4 | Update Task | Title, description, priority, status mutations |
| 5 | Task Lifecycle | not_started -> completed -> verified -> archived |
| 6 | Delete Task | Constraint: must be completed before deletion |
| 7 | Task Lists | Named list CRUD, list-scoped tasks |
| 8 | Checklist CRUD | Create/read/update/delete items, toggle, rename |
| 9 | Project Setup | Roles, project creation, member joins (requires tokens) |
| 10 | Project Task CRUD | Project-scoped tasks, assignment, verification |
| 11 | Cross-Instance Visibility | Can Instance B see Instance A's project tasks? |
| 12 | Project Task Cleanup | Mid-suite cleanup of project resources |
| 13 | Field Validation (Priority) | Cycle all valid values, test null/empty/bogus |
| 14 | Field Validation (Status) | Cycle transitions, test null/empty/bogus/skip |
| 15 | Permission Boundaries | Cross-project, role-based access control |
| 16 | Volume Tests | Bulk creation (100 tasks, 250 items), timing |
| 17 | Cleanup | Remove all test-created resources |
| 18 | Verification | Compare pre/post state, assert clean |

Each section is delimited by a comment block:

```python
# ---------------------------------------------------------------------------
# SECTION N: TITLE
# ---------------------------------------------------------------------------
print("\n--- Section N: Title ---")
```

### Resource Tracking and Cleanup

Every resource created during testing is appended to a tracking list on the runner:

```python
data = assert_success(r)
runner.created_task_ids.append(data["taskId"])
```

The cleanup section iterates over these lists and tears down in reverse dependency order: tasks first (complete then delete), then task lists (empty then delete), then checklists (delete). Cleanup functions use try/except to prevent a single cleanup failure from blocking the rest.

```python
def test_cleanup_tasks():
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
```

### Skip Guards for Cascading Dependencies

Some test sections depend on setup that may not succeed (e.g., project creation requires an Executive token). A skip guard function checks a boolean flag and raises a skip if the prerequisite failed:

```python
_project_setup_ok = False

def _require_project():
    if not _project_setup_ok:
        raise RuntimeError("SKIP: Project setup required (need HACS_EXEC_TOKEN)")

# In project setup test:
def test_join_project_instance2():
    ...
    global _project_setup_ok
    _project_setup_ok = True  # Only set after ALL setup steps succeed

# In dependent tests:
def test_proj_create_task_basic():
    _require_project()  # Skips gracefully if setup failed
    ...
```

Multiple guard functions can coexist for different dependency chains (e.g., `_require_perm_setup()` for permission tests that need a third instance and second project).

### Known Bug Documentation Pattern

There are three forms:

1. **Comment-only** -- When the test passes but the behavior is wrong:
```python
# KNOWN BUG: API accepts invalid priority values -- should validate against list_priorities
```

2. **Branch-and-print** -- When the test needs to pass regardless of the outcome:
```python
if data.get("success"):
    print(f"    KNOWN BUG: bogus priority accepted and persisted as: {actual}")
else:
    print(f"    bogus priority rejected (ideal behavior)")
```

3. **Runner label suffix** -- To make known bugs visible in the summary:
```python
runner.run("priority_bogus (known bug)", test_priority_bogus)
```

### Read-Back Verification Pattern

Used throughout the suite wherever data is mutated:

```python
# 1. Mutate via API
r = rpc_call("update_task", {
    "instanceId": INSTANCE_1,
    "taskId": tid,
    "priority": prio
})
assert_success(r)

# 2. GET via separate call
r2 = rpc_call("get_task", {
    "instanceId": INSTANCE_1,
    "taskId": tid
})
data2 = assert_success(r2)

# 3. Assert persisted correctly
actual = data2["task"]["priority"]
assert actual == prio, f"Priority read-back: expected {prio}, got {actual}"
```

This three-step pattern catches bugs where the mutation response echoes the input without actually writing to storage.

## Test Categories (Template)

For any new API test suite, these sections should exist in this order:

1. **Bootstrap** -- Create test instances with appropriate roles. Reuse existing instances if `have_i_bootstrapped_before` finds them. Set global instance ID variables. Abort if bootstrap fails.

2. **State Snapshot** -- Capture pre-test counts (lists, tasks, documents) for the verification section to compare against.

3. **Enum/Config Tests** -- Verify list/enum endpoints return expected values (e.g., `list_priorities`, `list_task_statuses`, `list_roles`). These are quick sanity checks that the API is responding.

4. **Basic CRUD** -- Create, read, update, delete for each entity type. Test with:
   - Minimal required fields only
   - All fields populated
   - Special characters: JSON strings, quotes, brackets, braces, unicode
   - Edge cases: empty strings, very long strings (500+ chars), large descriptions (5000+ chars)
   - Duplicate names/titles (should succeed with different IDs)
   - Missing required fields (negative -- should fail)

5. **List and Retrieval** -- Pagination (limit, skip), filtering (by status, list, priority), full_detail mode, nonexistent ID lookup (negative).

6. **Field Validation** -- For each mutable field, cycle through ALL valid enum values with read-back verification. Then test null, empty string, and bogus values. Document the API's behavior for each invalid input using the known bug pattern.

7. **Lifecycle** -- Walk entities through their full state machine: `not_started -> in_progress -> blocked -> in_progress -> completed -> completed_verified -> archived`. Test invalid transitions (e.g., verify before complete, archive before verify).

8. **Negative Tests** -- Invalid inputs, missing required fields, constraint violations, unauthorized access attempts. Each should use `assert_failure()`.

9. **Cross-Entity Visibility** -- Can Instance A see Instance B's resources? Can a project member see project tasks created by another member? Does `get_my_tasks` include assigned project tasks?

10. **Permission Boundaries** -- Role-based access control edge cases:
    - PM on project A cannot assign tasks in project B
    - Developer cannot assign tasks (only claim)
    - Non-member cannot claim tasks from a project they have not joined
    - Self-verification of project tasks is forbidden
    - Developer CAN claim unassigned tasks in their own project

11. **Volume Tests** -- Bulk creation with timing:
    - Create N lists with M items each
    - Verify retrieval after bulk creation
    - Assert response times are within acceptable bounds (e.g., <180s for creation, <15s for reads)

12. **Cleanup** -- Remove all test-created resources in reverse dependency order. Use try/except to prevent single failures from blocking. Print counts of cleaned vs. errored resources.

13. **Verification** -- Compare post-test state to pre-test snapshot. Assert that leftover resource counts are within tolerance. Print warnings for any leaked resources.

## Environment Variables

The test suite uses environment variables for privileged role tokens:

| Variable | Purpose | Required For |
|----------|---------|-------------|
| `HACS_EXEC_TOKEN` | Executive role adoption token | Project creation, assignment, role-based tests |
| `HACS_PM_TOKEN` | PM role adoption token | PM-specific permission boundary tests |

If tokens are not set, the dependent sections skip gracefully. The suite still runs all personal task and checklist tests without any tokens.

The API URL defaults to `https://smoothcurves.nexus/mcp` but can be overridden via the first CLI argument:

```bash
HACS_EXEC_TOKEN=xxx HACS_PM_TOKEN=yyy python3 hacs_regression_test.py https://my-server/mcp
```

## Conventions

### Naming

- **Test functions**: `test_<entity>_<action>_<qualifier>`
  - `test_create_task_basic`
  - `test_proj_create_task_all_fields`
  - `test_perm_pm_cross_project_assign`
  - `test_lifecycle_verify`
  - `test_volume_task_lists`

- **Runner labels**: `<entity>_<action>` with suffixes for special categories:
  - `(negative)` -- Expected failure test
  - `(known bug)` -- Documents a known API defect
  - `(custom status)` -- Documents intentional non-standard behavior

- **Section headers**: `--- Section N: Title ---` printed to stdout, preceded by a comment block delimiter.

- **Global state variables**: Prefixed with underscore: `_lifecycle_task_id`, `_project_setup_ok`, `_checklist_id`

- **Test project IDs**: Timestamped to avoid collisions: `f"regtest-{int(time.time())}"`

- **Test instance names**: Descriptive with optional timestamp: `"RegressionTester1"`, `f"RegressionTester3-{int(time.time())}"`

### Error Handling

- `assert_success(r)` for expected-pass tests -- raises `AssertionError` with truncated error details
- `assert_failure(r)` for expected-fail tests -- raises `AssertionError` if the call unexpectedly succeeds
- `raise RuntimeError("SKIP: reason")` for conditional skips -- caught by the runner and counted separately
- `try/except` with cleanup in teardown sections -- never let cleanup failures cascade
- Standard Python `assert` with descriptive messages for value checks

### Output Format

```
HACS Regression Test Suite
API: https://smoothcurves.nexus/mcp
Test project: regression-test-1709123456
Started: 2026-02-28T14:30:00.000000
======================================================================

--- SETUP: Bootstrap test instances ---
    INSTANCE_1 = abc-123 (existing)
    INSTANCE_2 = def-456 (new)
  PASS  setup_bootstrap

--- Section 1: Enum Readers ---
  PASS  list_priorities
  PASS  list_task_statuses

--- Section 13: Priority Cycling ---
  PASS  priority_cycle_all_levels
  PASS  priority_null
    KNOWN BUG: bogus priority accepted and persisted as: bogus_priority
  PASS  priority_bogus (known bug)

--- Section 17: Cleanup ---
    Cleaned 112 tasks (0 errors)
    Cleaned 21 task lists
    Cleaned 12 checklists
  PASS  cleanup_tasks
  PASS  cleanup_task_lists
  PASS  cleanup_checklists

======================================================================
RESULTS: 94/94 passed, 0 failed

Volume test timings:
  Create 20 lists x 5 tasks (100 tasks): 45.231s
  List all tasks (limit=500): 0.892s
  Create 10 checklists x 25 items (250 items): 38.117s
  Get all lists summary: 0.234s
  Get single list with 25 items: 0.089s
======================================================================
```

## How to Create a New Test Suite

Step-by-step for an agent creating regression tests for a new HACS API area (messaging, documents, projects, etc.):

1. **Read the API documentation** -- Review the OpenAPI spec or tool help (`get_tool_help`) for every endpoint you will test. List all endpoints, their parameters, required vs. optional fields, expected responses, and documented constraints.

2. **Set up the boilerplate** -- Copy the JSON-RPC helper functions (`rpc_call`, `assert_success`, `assert_failure`), the `TestRunner` class, configuration section, and SSL warning suppression from the reference suite. These are stable and reusable.

3. **Bootstrap test instances** -- Create 2-3 test instances with appropriate roles. Use `have_i_bootstrapped_before` to reuse existing instances. Set global instance ID variables. Abort if bootstrap fails.

4. **Snapshot pre-test state** -- Call relevant list/count endpoints and store the results for the verification section.

5. **Write sections in dependency order** -- Setup must come before CRUD, CRUD before lifecycle, lifecycle before permissions. Use the section template from the "Test Categories" above.

6. **Track all created resources** -- Append every created resource ID to a tracking list on the runner. This is critical for cleanup.

7. **Add skip guards** -- For any section that depends on earlier setup (tokens, projects, roles), create a guard function that skips if the prerequisite failed.

8. **Test both happy path AND error paths** -- For every positive test, write at least one negative test. Missing required fields, unauthorized callers, invalid state transitions, constraint violations.

9. **Verify read-back on all mutations** -- After every create, update, or assign, call GET and assert the persisted value matches.

10. **Add volume tests with timing** -- Create bulk resources, verify retrieval at scale, assert response times are reasonable.

11. **Clean up everything** -- Iterate over tracking lists and remove all created resources. Use try/except so one failure does not block the rest.

12. **Verify clean state** -- Compare post-test counts to pre-test snapshot. Assert deltas are within tolerance.

13. **Run a syntax check before declaring done** -- `python3 -m py_compile your_test_file.py` must pass. This catches typos, indentation errors, and missing imports without running the full suite.

## Delegation Pattern

When the main PM/developer dispatches a regression test agent:

**The agent should receive:**
- API endpoint URL
- Auth tokens (HACS_EXEC_TOKEN, HACS_PM_TOKEN if needed)
- Test focus area (e.g., "messaging endpoints", "document CRUD", "project lifecycle")
- Reference to this role description document

**The agent should produce:**
- A working Python test file following all patterns in this document
- Syntax-checked (`py_compile` passing)
- A brief summary: number of tests, sections covered, known bugs found

**The agent should NOT:**
- Run the full suite against production (leave that to the caller)
- Modify existing test files without explicit instruction
- Create test instances with privileged roles without tokens

**The agent SHOULD:**
- Run `python3 -m py_compile test_file.py` to verify syntax
- Use timestamped resource names to avoid collisions with other test runs
- Document every known bug inline with the `KNOWN BUG:` comment pattern
- Keep test functions focused -- one assertion concern per function (though setup may be shared via globals)

## Multi-Instance Test Design

The reference suite uses multiple instances to test cross-entity scenarios:

| Instance | Role | Purpose |
|----------|------|---------|
| INSTANCE_1 | Executive | Creates projects, assigns tasks, verifies others' work |
| INSTANCE_2 | Developer | Claims tasks, completes work, tests visibility |
| INSTANCE_3 | PM | Tests cross-project permission boundaries |

Design principles for multi-instance tests:
- Each instance should have a distinct role to test permission boundaries
- At least one instance pair should share a project (for visibility tests)
- At least one instance should be outside the primary project (for cross-project denial tests)
- Use the Executive instance as the "admin" that sets up projects and assigns tasks
- Use the Developer instance as the "worker" that claims and completes tasks
- Use the PM instance to test PM-specific constraints (can only manage their own project)

## Response Format Handling

The HACS MCP server returns responses in multiple possible formats. The `rpc_call` helper handles three paths:

1. **Primary**: `result.data` -- A dict with `success` key and handler return value
2. **Fallback**: `result.content[0].text` -- JSON-stringified version parsed back to dict
3. **Last resort**: `result` itself -- If it has a `success` key directly

New test suites should reuse this helper unchanged. If the server changes its response format, fix it in one place.

## Lineage

This role description was created by Axiom-2615 (COO) based on analysis of `hacs_regression_test.py`, which was built across 3 sessions by Ember-75b6 (PM, hacs-ui project) with agent-built test code:

- **Session 1**: 56 personal task and checklist tests (sections 1-8, 16-18)
- **Session 2**: 20 project task tests added (sections 9-12)
- **Session 3**: 18 validation, permission, and metadata tests added (sections 13-15)
- **Total**: 94 tests across 18 sections
- **Key design refinements**: Skip guards, known bug documentation, read-back verification, PM token separation, multi-project permission testing

The test suite source file: `/mnt/coordinaton_mcp_data/worktrees/foundation/HumanAdjacentAI-Protocol/CrossingUI/tests/hacs_regression_test.py`
