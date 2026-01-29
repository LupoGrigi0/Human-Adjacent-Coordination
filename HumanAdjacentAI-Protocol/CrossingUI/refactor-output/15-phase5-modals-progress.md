# Phase 5: Modals Integration Progress

**Started:** 2026-01-28
**Status:** COMPLETE

## Overview
Integrating modals.js module into app.js

## Steps

### Step 1: Read modals.js exports
**Status:** COMPLETE

**modals.js exports:**
- `showModal(modalId)` - Show a modal by ID
- `hideModal(modalId)` - Hide a modal by ID
- `hideAllModals()` - Hide all modals
- `showConfirm(options)` - Promise-based confirmation dialog
- `showCreateTaskModal(options)` - Show create task modal with options
- `handleCreateTask()` - Handle task creation form submission
- `showInstanceSelector(options)` - Show instance selector modal
- `showProjectSelector(options)` - Show project selector modal

**Window globals set by modals.js:**
- `window.showModal`
- `window.hideModal`
- `window.hideAllModals`

### Step 2: Find modal-related functions in app.js
**Status:** COMPLETE

**Found in app.js:**
1. **BOOTSTRAP modal** (lines 451-500):
   - `showBootstrapModal()` - simple, shows modal and focuses input
   - `handleBootstrap()` - processes bootstrap form

2. **ASSIGN INSTANCE modal** (lines 667-735):
   - `showAssignInstanceModal()` - populates instance list, handles selection

3. **CREATE TASK modal** (lines 1754-1845):
   - `showCreateTaskModal(prefilledProject)` - populates project dropdown
   - `closeCreateTaskModal()` - hides modal
   - `createTask()` - handles task creation

4. **WAKE INSTANCE modal** (lines 1872-2149+):
   - `ensureApiKey()` - checks/prompts for API key
   - `handleApiKeySubmit()` - handles API key form
   - `showWakeInstanceModal()` - shows wake modal, populates dropdowns
   - `populateWakeDropdowns()` - fetches and populates role/personality/project
   - `toggleWakeSpecificId()` - toggle specific ID checkbox
   - `handleWakeSubmit()` - handles wake form submission

**NOT in app.js (only in modals.js):**
- `showModal()`, `hideModal()`, `hideAllModals()` - basic modal utilities
- `showConfirm()` - confirmation dialog
- `showInstanceSelector()` - reusable instance selector
- `showProjectSelector()` - reusable project selector

### Step 3: Detailed Comparison
**Status:** COMPLETE

**Task Modal Comparison:**

| Feature | app.js | modals.js | Notes |
|---------|--------|-----------|-------|
| showCreateTaskModal | YES (line 1757) | YES | DIFFERENT implementations |
| closeCreateTaskModal | YES (line 1780) | NO | app.js only |
| createTask | YES (line 1784) | YES (handleCreateTask) | DIFFERENT - app.js has project detail refresh |

**app.js showCreateTaskModal():**
- Takes `prefilledProject` parameter
- Re-enables projectSelect (if previously disabled)
- Uses `appendChild` to add options
- Focuses title input after showing

**modals.js showCreateTaskModal():**
- Takes `options` object with `projectId`, `lockProject`, `onCreated`
- Populates options with innerHTML
- Uses `state.projects` directly
- Has `_onCreated` callback support

**app.js createTask():**
- Refreshes task view if on tasks tab
- Refreshes project detail tasks if on projects tab
- Uses `renderProjectDetailTasks`

**modals.js handleCreateTask():**
- Calls `_onCreated` callback if provided
- Simpler, no view-specific refresh

**DECISION:** Keep app.js versions - they have project detail integration

**Assign Instance Modal:** Only in app.js - specific to project assignment

**Wake Instance Modal:** Only in app.js - complex wake/pre-approve flow

**Bootstrap Modal:** Only in app.js - simple inline implementation

### Step 4: Update modals.js to match app.js
**Status:** NOT NEEDED

modals.js provides utility functions not in app.js:
- showModal, hideModal, hideAllModals (generic)
- showConfirm (generic confirmation)
- showInstanceSelector (reusable)
- showProjectSelector (reusable)

The task creation in modals.js is a simpler reusable version. The app.js version is more integrated with the view system.

### Step 5: Add import statement to app.js
**Status:** COMPLETE

Added import:
```javascript
import {
    showModal,
    hideModal,
    hideAllModals,
    showConfirm,
    showInstanceSelector,
    showProjectSelector
} from './modals.js';
```

### Step 6: Verify syntax
**Status:** COMPLETE
- `node --check src/ui/app.js` passed

### Step 7: Commit
**Status:** COMPLETE
- Commit: `4dd2119 refactor(app): Import modals from modals.js module`

## Summary

**Imported from modals.js:**
- `showModal` - generic show modal
- `hideModal` - generic hide modal
- `hideAllModals` - hide all active modals
- `showConfirm` - confirmation dialog (Promise-based)
- `showInstanceSelector` - reusable instance picker
- `showProjectSelector` - reusable project picker

**Kept in app.js (view-specific implementations):**
- Bootstrap modal: `showBootstrapModal`, `handleBootstrap`
- Assign instance modal: `showAssignInstanceModal`, `assignInstanceToProject`
- Create task modal: `showCreateTaskModal`, `closeCreateTaskModal`, `createTask`
- Wake instance modal: `showWakeInstanceModal`, `handleWakeSubmit`, `populateWakeDropdowns`, etc.
- API key modal: `ensureApiKey`, `handleApiKeySubmit`

**Rationale:** The utility functions in modals.js are generic and reusable. The specific modal implementations in app.js are tightly integrated with the view system (project detail refresh, task list refresh, etc.) and should remain in app.js.

## Files Changed
- `/mnt/coordinaton_mcp_data/worktrees/foundation/src/ui/app.js` - Added modals import

## Git Commits
- `4dd2119 refactor(app): Import modals from modals.js module`
