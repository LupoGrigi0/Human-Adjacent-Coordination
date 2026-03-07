# App.js Refactoring Analysis

## Overview

**File**: `/mnt/coordinaton_mcp_data/worktrees/foundation/src/ui/app.js`
**Total Lines**: 4349
**Purpose**: Main application logic for the V2 Executive Dashboard
**Current State**: Monolithic single-file architecture

---

## Current Structure (sections found)

| Line Range | Section Name | Target Module | Dependencies |
|------------|--------------|---------------|--------------|
| 14-70 | STATE MANAGEMENT | `state.js` | None (foundational) |
| 72-93 | INITIALIZATION | `app.js` (keep) | All modules |
| 145-165 | THEME | `settings.js` | `state.js` |
| 167-396 | EVENT LISTENERS | `app.js` (keep) | All modules (orchestrator) |
| 398-454 | TAB NAVIGATION | `app.js` (keep) | All modules |
| 456-496 | CONNECTION & AUTH | `state.js` or `auth.js` | `state.js` |
| 498-548 | BOOTSTRAP | `modals.js` or `auth.js` | `state.js`, `utils.js` |
| 550-584 | DATA LOADING | `app.js` (keep) | `state.js`, API |
| 586-636 | DASHBOARD | `dashboard.js` | `state.js`, `utils.js` |
| 638-1097 | PROJECTS | `projects.js` | `state.js`, `utils.js`, `tasks.js`, `messages.js` |
| 1099-1369 | TASKS | `tasks.js` | `state.js`, `utils.js`, `projects.js` |
| 1371-1488 | EDITABLE FIELDS | `utils.js` or `details.js` | `state.js`, `utils.js` |
| 1490-1559 | ASSIGN INSTANCE MODAL | `modals.js` | `state.js`, `instances.js`, `projects.js` |
| 1561-1956 | INSTANCES | `instances.js` | `state.js`, `utils.js`, `messages.js`, API |
| 1957-2495 | MESSAGING (V2 - XMPP Room-based) | `messages.js` | `state.js`, `utils.js`, `projects.js`, `instances.js` |
| 2496-2557 | DIARY | `settings.js` or `diary.js` | `state.js`, `utils.js` |
| 2559-2571 | ADMIN | `settings.js` | `state.js`, `utils.js` |
| 2573-2643 | CREATE PROJECT | `modals.js` or `projects.js` | `state.js`, `utils.js` |
| 2645-2758 | LAUNCH PROJECT | `projects.js` | `state.js`, `utils.js`, API (wake/preApprove) |
| 2760-2876 | CREATE TASK | `modals.js` or `tasks.js` | `state.js`, `utils.js`, `projects.js` |
| 2878-3165 | LISTS (Personal Checklists) | `lists.js` | `state.js`, `utils.js` |
| 3166-4046 | WAKE INSTANCE & CONVERSATION | `instances.js` or `wake.js` | `state.js`, `utils.js`, `ui-config.js` |
| 4047-4246 | ENTITY DETAILS (Instance, Role, Personality, Project) | `details.js` | `state.js`, `utils.js`, API |
| 4248-4313 | MESSAGE POLLING | `messages.js` | `state.js`, `utils.js` |
| 4315-4337 | UTILITIES | `utils.js` | None (foundational) |
| 4339-4349 | EXPORTS | `app.js` (keep) | All modules |

---

## Dependency Analysis

### Foundational Modules (No Dependencies on Other App Modules)

1. **state.js** - Shared state object and CONFIG
2. **utils.js** - Pure utility functions (escapeHtml, showToast, formatDate)

### Second Tier (Depend Only on Foundational)

3. **settings.js** - Theme, diary, admin (depends on state, utils)
4. **lists.js** - Checklist management (depends on state, utils)

### Third Tier (Multiple Dependencies)

5. **dashboard.js** - Metrics display (depends on state, utils, may reference projects/instances/tasks)
6. **projects.js** - Project listing and detail (depends on state, utils, may call instances, tasks, messages)
7. **tasks.js** - Task management (depends on state, utils, projects)
8. **instances.js** - Instance management + wake/conversation (depends on state, utils, messages)
9. **messages.js** - XMPP messaging (depends on state, utils, projects, instances)
10. **details.js** - Entity detail panels (depends on state, utils, multiple APIs)
11. **modals.js** - Modal dialogs (depends on state, utils, multiple feature modules)

### Orchestration Layer (Stays in app.js)

- Initialization
- Event listener setup
- Tab navigation
- Data loading coordination
- Exports/window globals

---

## Shared Code That Must Move First

These functions/objects are used across multiple sections and must be in their target modules first:

### To `state.js`:
```javascript
const CONFIG = { ... }           // Lines 19-24
const state = { ... }            // Lines 26-70
updateConnectionStatus()         // Lines 462-469
updateUserDisplay()              // Lines 471-485
```

### To `utils.js`:
```javascript
escapeHtml()                     // Lines 4319-4324
showToast()                      // Lines 4326-4337
enableEditMode()                 // Lines 1378-1399
disableEditMode()                // Lines 1412-1436
rpcCallDirect()                  // Lines 2854-2876
```

### Constants Used Across Modules:
```javascript
const KNOWN_TEAM_MEMBERS         // Line 2962
const PRIVILEGED_ROLES           // Lines 3256
const POLLING_INTERVAL           // Line 4252
```

---

## Recommended Refactoring Order

### Phase 1: Foundation (Do First)

1. **state.js** - Extract CONFIG, state object, updateConnectionStatus, updateUserDisplay
   - Why: Every other module needs access to state
   - Risk: LOW (pure data, no logic dependencies)

2. **utils.js** - Extract escapeHtml, showToast, enableEditMode, disableEditMode, rpcCallDirect
   - Why: Pure utility functions used everywhere
   - Risk: LOW (no state dependencies)

### Phase 2: Independent Features

3. **settings.js** - Extract theme functions (initTheme, setTheme, toggleTheme), diary (loadDiary, addDiaryEntry), admin (clearSession), updateSettingsDisplay
   - Why: Self-contained, few dependencies
   - Risk: LOW

4. **lists.js** - Extract all list-related functions (loadLists through renameCurrentList)
   - Why: Self-contained feature, only depends on state/utils
   - Risk: LOW

### Phase 3: Core Features

5. **dashboard.js** - Extract loadDashboard
   - Why: Simple section, primarily renders metrics
   - Risk: LOW

6. **tasks.js** - Extract loadTasks, renderTaskBoard, renderTaskList, showTaskDetail, hideTaskDetail, claimCurrentTask, completeCurrentTask, renderProjectDetailTasks
   - Why: Well-defined boundary, some cross-reference with projects
   - Risk: MEDIUM (task detail navigation)

7. **projects.js** - Extract loadProjects, showProjectDetail, hideProjectDetail, renderProjectPM, renderProjectTeam, renderProjectDocuments, showProjectDocument, initProjectChatSidebar, loadProjectTeamMessages, setupProjectChatInputs, setupTaskListCollapse, createProject, launchProject
   - Why: Large section but well-contained
   - Risk: MEDIUM (complex PM chat integration)

### Phase 4: Complex Features

8. **instances.js** - Extract loadInstances, showInstanceDetail, hideInstanceDetail, messageCurrentInstance, messageInstance + all wake/conversation functions (ensureApiKey through wakeAndChat)
   - Why: Large section with external API calls
   - Risk: MEDIUM-HIGH (wake API integration complexity)

9. **messages.js** - Extract loadMessaging, renderDMList, renderProjectRoomList, renderRoleList, selectConversation, loadConversationMessages, sendMessage, showMessageDetail, replyToMessage, dismissQuote, pollMessages, startMessagePolling, stopMessagePolling, updateUnreadBadge
   - Why: Complex messaging subsystem
   - Risk: MEDIUM (polling integration)

### Phase 5: Supporting Features

10. **details.js** - Extract showConversationTargetDetails, showEntityDetails, loadInstanceDetails, loadRoleDetails, loadPersonalityDetails, loadProjectDetailsModal
    - Why: Shared detail viewing functionality
    - Risk: LOW

11. **modals.js** - Extract showBootstrapModal, handleBootstrap, showCreateProjectModal, closeCreateProjectModal, showCreateTaskModal, closeCreateTaskModal, createTask, showWakeInstanceModal, populateWakeDropdowns, toggleWakeSpecificId, handleWakeSubmit, handleApiKeySubmit, showAssignInstanceModal, assignInstanceToProject, showCreateListModal, closeCreateListModal
    - Why: UI helper functions for modals
    - Risk: LOW (mostly DOM manipulation)

---

## Estimated Complexity

### Low Risk Areas
- state.js extraction (pure data)
- utils.js extraction (pure functions)
- settings.js (isolated feature)
- lists.js (isolated feature)
- dashboard.js (simple rendering)
- details.js (view-only)

### Medium Risk Areas
- tasks.js (bidirectional navigation with projects)
- projects.js (large section, PM chat integration)
- messages.js (polling, multiple conversation types)
- modals.js (callbacks to many features)

### High Risk Areas
- instances.js + wake/conversation system (complex async flows, external API, session management)
- Event listener setup in app.js (must wire all modules correctly)

---

## Key Considerations

### Circular Dependencies to Avoid
- `projects.js` <-> `tasks.js` (project detail shows tasks, task detail navigates back to project)
- `instances.js` <-> `messages.js` (instance cards have message button, messages reference instances)
- `projects.js` <-> `messages.js` (project detail has chat sidebar, messages show project rooms)

**Solution**: Use event-based communication or have app.js orchestrate cross-module calls.

### Global Window Exports
Lines 4343-4349 export functions to window. These must continue working:
```javascript
window.appState = state;
window.api = api;
window.switchTab = switchTab;
window.selectConversation = selectConversation;
window.replyToMessage = replyToMessage;
window.dismissQuote = dismissQuote;
window.showMessageDetail = showMessageDetail;
window.toggleListItem = toggleListItem;
window.deleteListItem = deleteListItem;
window.showEntityDetails = showEntityDetails;
```

### Inline Event Handlers
Several sections use inline onclick handlers in rendered HTML (e.g., `onclick="toggleListItem('${item.id}')"`). These require global function access.

---

## File Size Estimates (Post-Refactor)

| Module | Estimated Lines | Status |
|--------|-----------------|--------|
| state.js | ~100 | Foundational |
| utils.js | ~100 | Foundational |
| settings.js | ~150 | Small |
| lists.js | ~300 | Medium |
| dashboard.js | ~75 | Small |
| tasks.js | ~350 | Medium |
| projects.js | ~500 | Large |
| instances.js | ~700 | Large (includes wake system) |
| messages.js | ~600 | Large |
| details.js | ~200 | Medium |
| modals.js | ~400 | Medium |
| app.js (remaining) | ~500 | Orchestration |

**Total**: ~4000 lines (same content, better organized)

---

## Next Steps

1. Create `state.js` with CONFIG and state object
2. Create `utils.js` with utility functions
3. Update app.js to import from these modules
4. Test that application still works
5. Proceed with remaining modules in order

Each module migration should be a separate commit for easy rollback if issues arise.
