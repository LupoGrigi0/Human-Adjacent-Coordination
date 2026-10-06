# Modals.js & Details.js Validation Report

## modals.js

**File Path:** `/mnt/coordinaton_mcp_data/worktrees/foundation/src/ui/modals.js`

### Imports:
- `{ state }` from `'./state.js'`
- `{ escapeHtml, showToast }` from `'./utils.js'`
- `api` (default import) from `'./api.js'`

### Exports:
Named exports:
- `showModal(modalId)` - Show modal by ID
- `hideModal(modalId)` - Hide modal by ID
- `hideAllModals()` - Hide all active modals
- `showConfirm(options)` - Show confirmation dialog (returns Promise<boolean>)
- `showCreateTaskModal(options)` - Show create task modal
- `handleCreateTask()` - Handle task creation form submission
- `showInstanceSelector(options)` - Show instance selector modal
- `showProjectSelector(options)` - Show project selector modal

Default export object containing all above functions.

Window globals attached:
- `window.showModal`
- `window.hideModal`
- `window.hideAllModals`

### API Calls Used:
- `api.createTask(taskParams)` - Line 216 in `handleCreateTask()`

### Issues Found:
1. **No TODO comments found** - Clean
2. **No stub functions found** - All functions are fully implemented
3. **No fake/mock data found** - Uses real state and API
4. **API import is correct** - Uses real `api.createTask()` from `./api.js`
5. **State import is correct** - Uses shared `state` from `./state.js`

**Minor observations:**
- Uses `window.hideModal` in inline onclick handlers (intentional for HTML event handlers)
- Instance selector and project selector modals are dynamically created if not present in DOM

### Status: READY

---

## details.js

**File Path:** `/mnt/coordinaton_mcp_data/worktrees/foundation/src/ui/details.js`

### Imports:
- `{ state, pushBreadcrumb, popBreadcrumb, clearBreadcrumbs }` from `'./state.js'`
- `{ escapeHtml, showToast, formatDateTime, getAvatarChar, getStatusClass, getPriorityClass }` from `'./utils.js'`
- `api` (default import) from `'./api.js'`

### Exports:
Named exports:
- `closeDetailPanel()` - Close the detail panel overlay
- `navigateBack()` - Navigate back one level in breadcrumbs
- `showTaskDetail(taskId, addBreadcrumb, context)` - Show task detail panel
- `showInstanceDetail(instanceId, addBreadcrumb, context)` - Show instance detail panel
- `showDocumentDetail(documentId, addBreadcrumb, context)` - Show document detail panel

Default export object containing all above functions.

### API Calls Used:
- `api.getTask(state.instanceId, taskId)` - Line 159 in `showTaskDetail()`
- `api.getInstance(state.instanceId, instanceId)` - Line 257 in `showInstanceDetail()`
- `api.readDocument(state.instanceId, projectId, documentId)` - Line 351 in `showDocumentDetail()`

### Breadcrumb Implementation Status:
**FULLY IMPLEMENTED:**
- Imports breadcrumb functions from state: `pushBreadcrumb`, `popBreadcrumb`, `clearBreadcrumbs`
- `pushBreadcrumb()` called in all three detail functions when `addBreadcrumb=true`
- `renderBreadcrumbs()` internal function renders clickable breadcrumb trail
- `navigateBack()` pops breadcrumb stack and re-opens previous detail
- `closeDetailPanel()` clears breadcrumbs on close
- Supports navigation to project, task, instance, and document types
- Breadcrumbs support clicking any non-current item to navigate back to that level

### Issues Found:

1. **TODO Comments Found:**
   - Line 220: `// TODO: Wire up action buttons` (in showTaskDetail)
   - Line 313: `// TODO: Wire up action buttons` (in showInstanceDetail)

2. **Missing API Function:**
   - `api.readDocument()` (Line 351) is called in `showDocumentDetail()` but **does NOT exist in api.js**
   - The api.js file has no `readDocument` function defined
   - This will cause a runtime error when trying to view document details

3. **No stub functions found** - All functions have real implementations
4. **No fake/mock data found** - Uses real state and API calls
5. **API import is correct** - Uses real imports from `./api.js`
6. **State import is correct** - Uses shared `state` from `./state.js`

**Additional observations:**
- Action buttons in task detail (Change Status, Change Priority, Claim Task) are rendered but not wired up
- Action buttons in instance detail (Send Message, Continue Conversation, Assign to Project) are rendered but not wired up
- Detail panel creates itself dynamically if not present in DOM
- Escape key closes detail panel
- Click outside panel closes detail panel

### Status: NEEDS_WORK

**Blocking Issues:**
1. `api.readDocument()` does not exist - document detail view will fail

**Non-blocking Issues (can ship without):**
1. TODO: Action buttons not wired up in task detail
2. TODO: Action buttons not wired up in instance detail

---

## Summary

| File | Status | Blocking Issues | Non-blocking Issues |
|------|--------|-----------------|---------------------|
| modals.js | READY | 0 | 0 |
| details.js | NEEDS_WORK | 1 (missing api.readDocument) | 2 (unwired action buttons) |

### Recommended Actions:

1. **For details.js - BLOCKING:**
   - Either add `readDocument(instanceId, projectId, documentId)` function to api.js
   - OR disable/remove the `showDocumentDetail()` function until document API is available
   - OR have `showDocumentDetail()` handle the missing API gracefully

2. **For details.js - OPTIONAL:**
   - Wire up task action buttons (status change, priority change, claim)
   - Wire up instance action buttons (send message, continue conversation, assign to project)
