# Tasks.js & Lists.js Validation Report

**Date:** 2026-01-26
**Validator:** Claude Opus 4.5
**Status:** RESEARCH ONLY - No edits made

---

## tasks.js

**File Path:** `/mnt/coordinaton_mcp_data/worktrees/foundation/src/ui/tasks.js`
**Lines:** 163

### Imports:
- `{ state }` from `'./state.js'` - Shared state object
- `{ escapeHtml, showToast, formatDateTime, getPriorityClass, getStatusClass }` from `'./utils.js'`
- `{ showTaskDetail }` from `'./details.js'`
- `{ showCreateTaskModal, handleCreateTask }` from `'./modals.js'`
- `api` from `'./api.js'` - Default import (uses api.method() pattern)

### Exports:
Named exports:
- `loadTasks()` - Async, loads tasks for current user
- `renderTasksList()` - Renders the task list UI
- `completeTask(taskId)` - Async, marks task complete
- `updateTaskStatus(taskId, status)` - Async, updates task status
- `updateTaskPriority(taskId, priority)` - Async, updates task priority

Default export object with same functions:
- `loadTasks`
- `renderTasksList`
- `completeTask`
- `updateTaskStatus`
- `updateTaskPriority`

Global window exports:
- `window.showCreateTaskModal` (re-exported from modals.js)

### API Calls Used:
1. `api.getMyTasks(state.instanceId)` - Line 30 - **EXISTS in api.js**
2. `api.markTaskComplete(state.instanceId, taskId)` - Line 111 - **MISSING from api.js**
3. `api.updateTask(state.instanceId, taskId, { status })` - Line 126 - **MISSING from api.js**
4. `api.updateTask(state.instanceId, taskId, { priority })` - Line 141 - **MISSING from api.js**

### Issues Found:
1. **CRITICAL: Missing API methods** - `api.markTaskComplete()` and `api.updateTask()` are called but do NOT exist in api.js
   - `markTaskComplete` should likely call the `mark_task_complete` RPC method
   - `updateTask` should likely call the `update_task` RPC method
   - These exist as HACS MCP tools but are not wrapped in api.js

2. **Unused import** - `handleCreateTask` is imported from modals.js but never used in this file

3. **Unused import** - `formatDateTime` is imported from utils.js but never used in this file

### Status: **NEEDS_WORK**

**Required fixes:**
1. Add `markTaskComplete` function to api.js that calls `mark_task_complete` RPC
2. Add `updateTask` function to api.js that calls `update_task` RPC
3. Remove unused imports (`handleCreateTask`, `formatDateTime`) or use them

---

## lists.js

**File Path:** `/mnt/coordinaton_mcp_data/worktrees/foundation/src/ui/lists.js`
**Lines:** 238

### Imports:
- `{ state }` from `'./state.js'` - Shared state object
- `{ escapeHtml, showToast }` from `'./utils.js'`
- `api` from `'./api.js'` - Default import

### Exports:
Named exports:
- `loadLists()` - Async, loads all lists for current user
- `renderListsGrid()` - Renders the lists grid UI
- `showListDetail(listId)` - Async, shows detail view for a list
- `hideListDetail()` - Hides detail view, returns to grid
- `toggleListItem(itemId)` - Async, toggles item checked state
- `addListItem(text)` - Async, adds item to current list
- `deleteListItem(itemId)` - Async, deletes an item
- `showCreateListModal()` - Shows create list modal (stub)

Default export object with same functions:
- `loadLists`
- `renderListsGrid`
- `showListDetail`
- `hideListDetail`
- `toggleListItem`
- `addListItem`
- `deleteListItem`
- `showCreateListModal`

Global window exports:
- `window.showCreateListModal`

### API Calls Used:
1. `api.getLists(state.instanceId)` - Line 32 - **EXISTS in api.js**
2. `api.getList(state.instanceId, listId)` - Line 98 - **EXISTS in api.js**
3. `api.toggleListItem(state.instanceId, state.currentListId, itemId)` - Line 174 - **EXISTS in api.js**
4. `api.addListItem(state.instanceId, state.currentListId, text)` - Line 189 - **EXISTS in api.js**
5. `api.deleteListItem(state.instanceId, state.currentListId, itemId)` - Line 203 - **EXISTS in api.js**

### Issues Found:
1. **TODO Comment** - Line 218: `// TODO: Implement create list modal`
   - `showCreateListModal()` is a stub that only shows a toast: `'Create list modal coming soon'`
   - This is a known incomplete feature, not a blocking issue

2. **Missing modal implementation** - The create list functionality is not complete
   - api.js has `createList(instanceId, name, description)` available
   - Just needs the modal UI implementation

### Status: **READY** (with minor TODO)

**Notes:**
- All API calls are properly using real imports from api.js
- State is properly imported from state.js
- The only incomplete item is the create list modal, which is a feature gap not a code quality issue
- All list CRUD operations are fully implemented and wired to real APIs

---

## Summary

| File | Status | Critical Issues | Minor Issues |
|------|--------|-----------------|--------------|
| tasks.js | NEEDS_WORK | 2 missing API methods | 2 unused imports |
| lists.js | READY | 0 | 1 TODO stub |

### Recommended Actions:

**For tasks.js (Priority: HIGH):**
1. Add to api.js:
   ```javascript
   export async function markTaskComplete(instanceId, taskId) {
     return rpcCall('mark_task_complete', { instanceId, taskId });
   }

   export async function updateTask(instanceId, taskId, updates) {
     return rpcCall('update_task', { instanceId, taskId, ...updates });
   }
   ```
2. Add these to the `api` default export object
3. Clean up unused imports

**For lists.js (Priority: LOW):**
1. Implement `showCreateListModal()` when ready (not blocking)
2. The modal should call `api.createList(instanceId, name, description)`

---

*Report generated by validation script*
