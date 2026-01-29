# Projects.js & Instances.js Validation Report

Generated: 2026-01-26

## projects.js

**Location:** `/mnt/coordinaton_mcp_data/worktrees/foundation/src/ui/projects.js`
**Lines:** 471

### Imports:
- `{ state, pushBreadcrumb, clearBreadcrumbs }` from `./state.js` - Shared state management
- `{ escapeHtml, showToast, formatDateTime, getAvatarChar }` from `./utils.js` - Utility functions
- `{ showTaskDetail, showInstanceDetail }` from `./details.js` - Detail panel navigation
- `{ showCreateTaskModal, showInstanceSelector }` from `./modals.js` - Modal dialogs
- `{ loadProjectDocuments, renderDocumentsList }` from `./documents.js` - Document handling
- `api` from `./api.js` - API client (default import)

### Exports:
1. `loadProjects()` - Async function to load and display all projects
2. `renderProjectsGrid()` - Renders the projects grid UI
3. `showProjectDetail(projectId)` - Async function to show project detail panel
4. `hideProjectDetail()` - Hides project detail and returns to grid
5. `showAssignInstanceModal()` - Shows modal to assign instance to project
6. Default export object containing all above functions
7. `window.showProjectDetail` - Global attachment for navigation

### API Calls Used:
- `api.listProjects()` - Line 31 (loadProjects)
- `api.getProject(projectId)` - Line 93 (showProjectDetail)
- `api.listTasks(state.instanceId, { projectId, limit: 100 })` - Line 125 (showProjectDetail)
- `api.getMessages(state.instanceId, { room, limit })` - Line 371 (loadProjectTeamMessages)
- `api.sendMessage({ instanceId, to, body })` - Line 412 (setupProjectChatInputs)
- `api.joinProject(instanceId, projectId)` - Line 447 (showAssignInstanceModal)

### Issues Found:

1. **TODO Comment (Line 426):**
   ```javascript
   // PM chat send - TODO: implement continue_conversation
   ```
   The PM direct chat functionality in the project sidebar is incomplete. The `continue_conversation` API exists in api.js but is not wired up here.

2. **No other issues found:**
   - No fake/mock data
   - No stub functions
   - All API calls use real imports from `./api.js`
   - State is properly imported from `./state.js`
   - All helper functions (`showTaskDetail`, `showInstanceDetail`, etc.) are properly imported

### Verified API Functions:
All API calls map correctly to `./api.js` exports:
- `api.listProjects` -> `rpcCall('list_projects', ...)`
- `api.getProject` -> `rpcCall('get_project', ...)`
- `api.listTasks` -> `rpcCall('list_tasks', ...)`
- `api.getMessages` -> `rpcCall('xmpp_get_messages', ...)`
- `api.sendMessage` -> `rpcCall('xmpp_send_message', ...)`
- `api.joinProject` -> `rpcCall('join_project', ...)`

### Status: NEEDS_WORK

**Reason:** One TODO comment for PM chat functionality (`continue_conversation`) needs implementation. The rest of the module is production-ready.

---

## instances.js

**Location:** `/mnt/coordinaton_mcp_data/worktrees/foundation/src/ui/instances.js`
**Lines:** 173

### Imports:
- `{ state }` from `./state.js` - Shared state management
- `{ escapeHtml, showToast, formatDateTime, getAvatarChar }` from `./utils.js` - Utility functions
- `{ showInstanceDetail }` from `./details.js` - Detail panel navigation
- `api` from `./api.js` - API client (default import)

### Exports:
1. `loadInstances()` - Async function to load all instances
2. `renderInstancesGrid()` - Renders the instances grid UI
3. Default export object containing above functions

### API Calls Used:
- `api.getAllInstances(state.instanceId)` - Line 29 (loadInstances)
- `api.joinProject(targetInstanceId, projectId)` - Line 134 (setupProjectSelectors dropdown handler)

### Issues Found:

1. **API Method Name Mismatch (Line 29):**
   ```javascript
   const result = await api.getAllInstances(state.instanceId);
   ```
   The api.js exports this function as `getInstances`, not `getAllInstances`. However, checking the default export object in api.js:
   - Named export: `getInstances`
   - NOT in default export as `getAllInstances`

   **WAIT - Correction:** Looking more carefully at api.js lines 588-590 and 814:
   ```javascript
   export async function getInstances(options = {}) {
     return rpcCall('get_all_instances', options);
   }
   // ...
   getInstances,
   ```

   The function is named `getInstances` but the code calls `api.getAllInstances`. This appears to be a bug... let me verify the api object more carefully.

   Checking api.js line 814: `getInstances,` - yes, it's exported as `getInstances` not `getAllInstances`.

   **HOWEVER:** This file is clearly working in production (based on context), so either:
   - There's an alias I missed
   - The api.js was updated after instances.js

   Looking again at api.js lines 757-831, the default export only includes `getInstances`, not `getAllInstances`.

   **CONFIRMED BUG:** `api.getAllInstances` should be `api.getInstances`

2. **No other issues found:**
   - No TODO comments
   - No fake/mock data
   - No stub functions
   - State properly imported from `./state.js`
   - `showInstanceDetail` properly imported from `./details.js`

### Verified API Functions:
- `api.joinProject` -> `rpcCall('join_project', ...)` - CORRECT
- `api.getAllInstances` -> DOES NOT EXIST, should be `api.getInstances`

### Status: NEEDS_WORK

**Reason:** API method name mismatch - `api.getAllInstances` is called but only `api.getInstances` exists in the API module. This is likely a bug that may cause runtime errors.

---

## Summary

| File | Status | Issues |
|------|--------|--------|
| projects.js | NEEDS_WORK | 1 TODO (PM chat with continue_conversation) |
| instances.js | NEEDS_WORK | 1 BUG (getAllInstances vs getInstances) |

### Recommended Fixes:

1. **projects.js Line 426:** Implement PM direct chat using `api.continueConversation()`

2. **instances.js Line 29:** Change:
   ```javascript
   // FROM:
   const result = await api.getAllInstances(state.instanceId);
   // TO:
   const result = await api.getInstances({ instanceId: state.instanceId });
   ```
   Note: The `getInstances` function takes an options object, not a positional instanceId parameter.

### Positive Findings:
- Both modules properly use shared state from `./state.js`
- Both modules import the real API client from `./api.js`
- No fake/mock data or placeholder implementations
- Clean module structure with JSDoc comments
- Proper error handling with try/catch blocks
- UI feedback via `showToast()` for user actions
