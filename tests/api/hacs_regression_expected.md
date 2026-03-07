# HACS Regression Test - Expected Results

## Overview
This document describes the expected behavior for each test in `hacs_regression_test.py`.

## Test Instance Setup
- **Tester-0001** and **Tester-0002** must exist (created via `bootstrap` if needed)
- Both should be valid instances that pass `introspect`

---

## Section 1: Enum Readers

| Test | Method | Expected |
|------|--------|----------|
| list_priorities | `list_priorities` | Returns `success: true` with array containing at least: `emergency`, `critical`, `high`, `medium`, `low`, `whenever` |
| list_task_statuses | `list_task_statuses` | Returns `success: true` with array containing at least: `not_started`, `in_progress`, `blocked`, `completed`, `completed_verified`, `archived` |

## Section 2: Personal Task CRUD

| Test | Method | Params | Expected |
|------|--------|--------|----------|
| create_task_basic | `create_task` | instanceId, title | `success: true`, returns `taskId` starting with `ptask-` |
| create_task_all_fields | `create_task` | instanceId, title, description, priority=high, listId=default | `success: true`, task.priority == "high" |
| create_task_json_in_title | `create_task` | title=`{"key":"value"}` | `success: true`, title preserved exactly |
| create_task_quotes | `create_task` | title with double quotes and apostrophes | `success: true` |
| create_task_brackets_parens | `create_task` | title=`Fix bug [critical] (backend) {urgent}` | `success: true` |
| create_task_unicode | `create_task` | title with unicode chars | `success: true` |
| create_task_empty_description | `create_task` | description="" | `success: true` |
| create_task_long_title | `create_task` | title = 500 x "A" | `success: true` |
| create_task_large_description | `create_task` | description ~5600 chars | `success: true`, description persists fully (verified via get_task) |
| create_task_duplicate_title | `create_task` x2 | same title | Both succeed with different taskIds |
| create_task_missing_title | `create_task` | no title | `success: false`, error code MISSING_PARAM |
| create_task_missing_instance | `create_task` | no instanceId | `success: false`, error code MISSING_PARAM |

## Section 3: List & Get Tasks

| Test | Method | Expected |
|------|--------|----------|
| list_tasks_default | `list_tasks` | `success: true`, returns `tasks` array and `total` count |
| list_tasks_with_limit | `list_tasks` limit=3 | Returns at most 3 tasks |
| list_tasks_with_skip | `list_tasks` skip=2 | Response `skip` field == 2 |
| list_tasks_full_detail | `list_tasks` full_detail=true | Tasks include all fields (id, description, created, etc.) |
| get_task_by_id | `get_task` | Returns the exact task matching the ID |
| get_task_nonexistent | `get_task` | `success: false`, TASK_NOT_FOUND |

## Section 4: Update Task

| Test | Method | Expected |
|------|--------|----------|
| update_task_title | `update_task` | `success: true`, title updated |
| update_task_description | `update_task` | `success: true` |
| update_task_priority | `update_task` priority=critical | task.priority == "critical" |
| update_task_status | `update_task` status=in_progress | task.status == "in_progress" |

## Section 5: Task Lifecycle

| Test | Expected |
|------|----------|
| lifecycle_create | Task created with status pending |
| lifecycle_complete | `mark_task_complete` sets status to "completed" |
| lifecycle_verify | `mark_task_verified` sets status to "completed_verified" |
| lifecycle_archive | `archive_task` succeeds; task no longer findable via `get_task` |
| verify_before_complete_fails | `mark_task_verified` on pending task returns `success: false` with INVALID_STATUS |

## Section 6: Delete Task

| Test | Expected |
|------|----------|
| delete_task_must_be_completed | `delete_task` on pending task returns `success: false` with TASK_NOT_COMPLETED |
| delete_task_after_complete | After `mark_task_complete`, `delete_task` succeeds |

## Section 7: Task Lists

| Test | Expected |
|------|----------|
| create_task_list | `create_task_list` with listId returns success |
| create_task_in_named_list | Task created in named list, task.list matches listId |
| list_tasks_filter_by_list | `list_tasks` with listId filter returns only tasks in that list |
| create_task_list_duplicate | Creating duplicate list returns `success: false`, LIST_EXISTS |

## Section 8: Checklist CRUD

| Test | Method | Expected |
|------|--------|----------|
| create_list_basic | `create_list` | Returns list with generated ID |
| create_list_with_description | `create_list` | Description field is non-null |
| get_lists_summary | `get_lists` | Returns array of list summaries with itemCount |
| add_list_item_basic | `add_list_item` | Returns item with generated ID, checked=false |
| add_list_item_special_chars | `add_list_item` | JSON, quotes, brackets, unicode all preserved |
| get_list_full | `get_list` | Returns list with all items (>= 5) |
| toggle_list_item | `toggle_list_item` | First call: checked=true; second call: checked=false |
| rename_list | `rename_list` | list.name updated |
| delete_list_item | `delete_list_item` | success: true |
| get_list_nonexistent | `get_list` | `success: false`, LIST_NOT_FOUND |

## Section 9: Volume Tests

| Test | Expected |
|------|----------|
| volume_task_lists | 20 lists x 5 tasks = 100 tasks created. `list_tasks` shows total >= 100. Creation < 120s. |
| volume_checklists | 10 checklists x 25 items = 250 items. `get_lists` total itemCount >= 250. Creation < 120s. |
| volume_response_times | All read operations < 10s. All creation batches < 120s. |

## Section 10: Cleanup

| Test | Expected |
|------|----------|
| cleanup_tasks | All created tasks are completed then deleted |
| cleanup_task_lists | All created task lists emptied then deleted |
| cleanup_checklists | All created checklists deleted |

## Section 11: Post-Cleanup Verification

| Test | Expected |
|------|----------|
| verify_clean_state | No more than 2 leftover lists and 5 leftover tasks compared to pre-test snapshot |

---

## Exit Codes
- **0** - All tests passed
- **1** - One or more tests failed

## API Protocol
All calls use JSON-RPC 2.0 via POST to the MCP endpoint:
```json
{
  "jsonrpc": "2.0",
  "method": "tools/call",
  "params": { "name": "METHOD_NAME", "arguments": {...} },
  "id": 1
}
```

Response structure:
```json
{
  "jsonrpc": "2.0",
  "result": {
    "data": { "success": true|false, ... },
    "content": [{ "type": "text", "text": "..." }]
  },
  "id": 1
}
```
