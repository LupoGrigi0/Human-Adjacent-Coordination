# API Feature Requests for Bridge

**From:** Canvas (UI Engineer)
**Date:** 2025-12-11
**Purpose:** Track API features needed for V2 UI that don't exist yet

---

## Priority: High

### 1. `get_all_instances` with status filter
**Why:** Instances tab stuck on "Loading instances..." - need to see all instances including inactive
**Current state:** Unclear if endpoint exists or returns empty
**Needed:**
- Return all registered instances
- Include `status` field (active/inactive)
- Optional filter parameter: `{ activeOnly: boolean }`
- Should return: instanceId, name, role, personality, project, status, lastSeen

### 2. `assign_task_to_instance`
**Why:** Executive/PM/PA/COO need to assign tasks to specific AI instances
**Current state:** Only `claimTask` exists (self-assignment)
**Needed:**
- Parameters: `instanceId` (caller), `taskId`, `assigneeInstanceId`
- Authorization: Executive, PA, COO, PM (for their project)
- Updates task's assignee field

---

## Priority: Medium

### 3. Lists Feature (Non-Task Checklists)
**Why:** Lupo needs general purpose lists (shopping lists, checklists) not tied to tasks
**Current state:** Only personal task lists exist
**Needed endpoints:**
- `create_list` - Parameters: `instanceId`, `name`, `description?`
- `get_lists` - Parameters: `instanceId` - Returns all lists for instance
- `get_list` - Parameters: `instanceId`, `listId` - Returns list with items
- `add_list_item` - Parameters: `instanceId`, `listId`, `text`
- `toggle_list_item` - Parameters: `instanceId`, `listId`, `itemId` - Toggle checked state
- `rename_list` - Parameters: `instanceId`, `listId`, `newName`
- `delete_list_item` - Parameters: `instanceId`, `listId`, `itemId`
- `delete_list` - Parameters: `instanceId`, `listId`

**List item structure:**
```json
{
  "itemId": "item-123",
  "text": "Buy milk",
  "checked": false,
  "createdAt": "2025-12-11T...",
  "checkedAt": null
}
```

---

## Priority: Low (Placeholder UI built, waiting for backend)

### 4. `wake_instance` (Agentic Support)
**Why:** Allow Executive/PM/PA/COO to spawn new AI instances
**Status:** Building placeholder UI now
**Needed parameters (tentative - Lupo may refine):**
- `instanceId` (caller)
- `name` - Name for new instance
- `homeDirectory` - Working directory
- `project` - Optional project to join
- `role` - Role to assign
- `personality` - Personality to adopt
- `wakeMessage` - Initial instructions/context
- `specificInstanceId` - Optional: resurrect specific instance by ID

**Authorization:** Executive, PA, COO, PM

---

## Bugs/Issues Found

### Issue: Bootstrap creating duplicate instances
**Observed:** Multiple Lupo instances exist (Lupo-f63b, Lupo-4f05, etc.)
**Suggestion:** Add `have_i_bootstrapped_before` convenience API
- Parameters: `name`, `workingDirectory?`, `hostname?`
- Returns: `{ found: boolean, instanceId?: string, matches?: string[] }`

---

## Testing Feedback (2025-12-11 Evening)

### For Bridge (Foundation/API Issues)

#### Issue: `create_project` returns Internal Error
**Observed:** Clicking "Create Project" button, filling form, submitting → "API Error: Internal error"
**Expected:** Project created, success toast, modal closes
**Question:** Is `create_project` implemented? What parameters does it expect?

#### Issue: Tasks not appearing after creation
**Observed:** Created tasks via Create Task modal, no errors shown, but tasks don't appear in kanban
**Question:** Is `createTask` working? What's the expected response format?

#### Issue: Projects dropdown empty on Tasks page
**Observed:** When opening Create Task modal, project dropdown shows only "Personal Task (No Project)"
**Question:** Are we getting projects correctly? Need to verify `getProjects` returns data

#### Issue: Instances list incomplete/empty
**Observed:** Only showing a few instances, Lupo not showing as active
**Question:** `get_instances` - what determines "active"? Should return all registered instances
**Note:** Lupo should ALWAYS show as active when UI is open (because the UI bootstraps as Lupo)

#### Request: Instance preferences for UI state
**Why:** UI needs to store stateful info like:
- Last project touched
- Last task list viewed
- Last instance chatted with
- "Sticky" items for quick access
- Shopping list always accessible

**Question:** Can we extend instance preferences to store UI-specific state?
**Requirement:** State must sync between mobile and web (same preferences)

#### Request: Add instance to project
**Why:** Need to assign instances to projects from UI
**Current:** No obvious API for this
**Suggestion:** `joinProject` called on behalf of another instance? Or `assignInstanceToProject`?

#### Request: Edit project documents
**Why:** Executive needs to view/edit project documents from dashboard
**Question:** Is there an API for reading/writing project documents?

#### Request: "Sticky" flag for quick access
**Why:** PA/Genevieve should be able to mark items as sticky for Lupo's quick access
**Suggestion:** Add `sticky` boolean to preferences, allow privileged instances to modify others' preferences

### For Messenger (Messaging Issues)

#### Issue: Sending message returns Internal Error
**Observed:** Tried sending message to "test project" → internal error
**Question:** Is this a messaging bug or test data issue?

#### Issue: Message to "unknown" - nothing happened
**Observed:** Sent message to instance labeled "unknown", no error, no message appeared
**Question:** Should this work? Does polling need to be verified?

#### Issue: Lupo not showing in instances list
**Observed:** The UI bootstraps as Lupo, but Lupo doesn't appear in instances
**Expected:** Lupo should always be active/visible

---

## UI Architecture Questions

### Non-API Functionality
Some Executive Dashboard features may need to bypass the API:
- Direct filesystem access to instances directory
- Reading/editing instance documents (except diary - private!)
- Looking up recovery keys
- Custom admin scripts

**Question for Lupo:** How should we handle this?
- Option A: Extend api.js to call local Node.js/Python scripts
- Option B: Create separate admin API endpoints
- Option C: Server-side routes that aren't MCP (direct Express routes)

**My thought:** Option C seems cleanest - have the nginx server expose `/admin/*` routes that do filesystem operations, separate from MCP protocol.

---

## CLI Testing Results (Canvas 2025-12-11 Late Evening)

### CRITICAL: `send_message` is BROKEN

**Tested via curl:**
```bash
curl -X POST https://smoothcurves.nexus/mcp/dev/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc": "2.0", "id": 1, "method": "tools/call",
       "params": {"name": "send_message", "arguments": {
         "to": "Lupo-f63b",
         "from": "Canvas-CLI",
         "subject": "Test",
         "content": "Hello!"
       }}}'
```

**Response:**
```json
{
  "success": false,
  "error": {
    "message": "Internal server error",
    "type": "server_error"
  }
}
```

**Schema is correct** (verified via tools/list):
- Required: `to`, `from`, `subject`, `content`
- Optional: `priority` (enum: urgent, high, normal, low)

**Conclusion:** Backend handler for `send_message` is throwing an unhandled exception. **FOR MESSENGER TEAM TO FIX.**

---

### `get_instances` Returns Incomplete Data

**Tested via curl:**
```bash
curl -X POST https://smoothcurves.nexus/mcp/dev/mcp \
  -d '{"jsonrpc": "2.0", "id": 1, "method": "tools/call",
       "params": {"name": "get_instances", "arguments": {}}}'
```

**Response:**
```json
{
  "instances": [
    {
      "id": "Meridian-8541",
      "role": "COO",
      "status": "active",
      "last_seen": "2025-12-07T05:22:14.892Z"
    }
  ],
  "total": 1
}
```

**Problems:**
1. Only ONE instance returned (Meridian-8541)
2. **Lupo-f63b is NOT in the list** despite bootstrapping successfully
3. Many other known instances are missing

**Questions for Bridge:**
- Where is the canonical instances list?
- Why doesn't bootstrap register the instance in get_instances?
- Is there a separate registration step needed?

---

### `get_messages` Works But Returns Old Data

**Tested via curl for Lupo-f63b:**
- Returns messages from August 2025 (old system messages)
- Messages are global/broadcast type
- No recent messages visible
- Likely because `send_message` is broken, no new messages exist

---

## Summary for Bridge/Messenger

### FOR MESSENGER (Critical):
1. **`send_message` returns Internal Server Error** - Handler is broken
2. Without this, messaging UI cannot be tested

### FOR BRIDGE (Foundation):
1. **`get_instances` is incomplete** - Lupo-f63b not appearing
2. Bootstrap should register instance in the instances list
3. Need clarity on instance lifecycle

---

## Changelog

- **2025-12-11:** Initial document created with first batch of requests
- **2025-12-11 (evening):** Added testing feedback from Lupo's extensive testing session
- **2025-12-11 (late evening):** Added CLI testing results with exact error messages
