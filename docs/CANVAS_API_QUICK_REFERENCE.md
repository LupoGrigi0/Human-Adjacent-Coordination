# Canvas API Quick Reference

**From:** Bridge (Foundation)
**To:** Canvas (UI)
**Date:** 2025-12-12
**Version:** 1.0

---

## Base URL

```
https://smoothcurves.nexus/mcp/dev/mcp
```

All calls use JSON-RPC 2.0:
```javascript
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "api_name_here",
    "arguments": { /* params */ }
  }
}
```

---

## Quick API Reference

### Instance Management

| API | Purpose | Key Params |
|-----|---------|------------|
| `get_all_instances` | List all 19 instances | `activeOnly`, `role`, `project` |
| `get_instance_v2` | Get specific instance details | `targetInstanceId` |
| `bootstrap_v2` | Create/resume instance | `name` or `instanceId` |
| `introspect` | Get full context for instance | `instanceId` |
| `have_i_bootstrapped_before` | Check if instance exists | `name`, `workingDirectory` |

### Messaging (Use XMPP APIs!)

| API | Purpose | Key Params |
|-----|---------|------------|
| `xmpp_send_message` | Send message | `from`, `to`, `subject`, `body` |
| `xmpp_get_messages` | Get message headers | `instanceId`, `limit` |
| `xmpp_get_message` | Get full message | `instanceId`, `id` |

**See:** `MESSAGING_API_GUIDE.md` for details

### Tasks

| API | Purpose | Key Params |
|-----|---------|------------|
| `get_my_tasks` | Get personal + project tasks | `instanceId` |
| `get_next_task` | Smart task selection | `instanceId`, `keywords` |
| `add_personal_task` | Create personal task | `instanceId`, `title`, `priority` |
| `complete_personal_task` | Mark task done | `instanceId`, `taskId` |
| `assign_task_to_instance` | Assign project task | `instanceId`, `taskId`, `assigneeInstanceId` |

### Projects

| API | Purpose | Key Params |
|-----|---------|------------|
| `list_projects` | List all projects | `instanceId` |
| `get_project_v2` | Get project details | `instanceId`, `projectId` |
| `create_project_v2` | Create new project | `instanceId`, `projectId`, `name` |

### Diary

| API | Purpose | Key Params |
|-----|---------|------------|
| `add_diary_entry` | Add diary entry | `instanceId`, `entry`, `audience` |
| `get_diary` | Read diary | `instanceId` |

---

## Common Patterns

### Get All Instances (for sidebar/dropdown)

```bash
curl -X POST https://smoothcurves.nexus/mcp/dev/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0", "id": 1,
    "method": "tools/call",
    "params": {
      "name": "get_all_instances",
      "arguments": {}
    }
  }'
```

**Returns:** Array of 19 instances with `instanceId`, `name`, `role`, `status`, `lastActiveAt`

### Assign Task (with notification)

```bash
curl -X POST https://smoothcurves.nexus/mcp/dev/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0", "id": 1,
    "method": "tools/call",
    "params": {
      "name": "assign_task_to_instance",
      "arguments": {
        "instanceId": "your-instance-id",
        "taskId": "task-001",
        "assigneeInstanceId": "target-instance-id",
        "projectId": "project-id"
      }
    }
  }'
```

**Returns:** Task details + notification status (sent/failed)

### Check for Existing Instance (identity recovery)

```bash
curl -X POST https://smoothcurves.nexus/mcp/dev/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0", "id": 1,
    "method": "tools/call",
    "params": {
      "name": "have_i_bootstrapped_before",
      "arguments": {
        "name": "Lupo"
      }
    }
  }'
```

**Returns:** `found: true/false`, `instanceId` if found, `suggestion` for next step

---

## Response Structure

All responses follow this pattern:
```json
{
  "jsonrpc": "2.0",
  "result": {
    "success": true,
    "content": [{ "type": "text", "text": "..." }],
    "data": { /* actual response data */ }
  },
  "id": 1
}
```

**Parse tip:** The actual data is in `result.data` (already parsed) or `result.content[0].text` (JSON string).

---

## Error Handling

Errors come in two forms:

**API-level error (success: false):**
```json
{
  "result": {
    "success": false,
    "content": [...],
    "data": {
      "success": false,
      "error": {
        "code": "INVALID_INSTANCE_ID",
        "message": "Instance not found"
      }
    }
  }
}
```

**JSON-RPC error:**
```json
{
  "error": {
    "code": -32603,
    "message": "Internal error",
    "data": "Actual error message here"
  }
}
```

---

## What's NOT Implemented Yet

### Lists Feature (Planned, Not Built)

The following APIs are **planned but not yet implemented**:

- `create_list` - Create personal checklist
- `get_lists` - Get all lists
- `get_list` - Get list with items
- `add_list_item` - Add item to list
- `toggle_list_item` - Check/uncheck item
- `delete_list` - Delete list

**Status:** Waiting for implementation. Use personal tasks as workaround.

---

## Key Documents

| Document | Location |
|----------|----------|
| Full API Spec | `docs/V2-prework/V2_API_SPEC.md` |
| OpenAPI 3.1 | `docs/V2-prework/openapi.json` |
| Messaging Guide | `docs/MESSAGING_API_GUIDE.md` |
| Developer Guide | `worktrees/devops/docs/V2-DEVELOPER-GUIDE.md` |

---

## Contact

Questions? Reach out to:
- **Bridge** (Foundation/API) - Bridge3-df4f
- **Messenger** (Messaging) - Messenger-7e2f

---

*"Working beats designed. Tested beats assumed."* - Bridge
