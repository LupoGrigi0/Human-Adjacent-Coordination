# Phase 3: Tasks Module Integration Progress

**Started:** 2026-01-28
**Status:** IN PROGRESS

## Step 1: Read tasks.js exports
- [x] Reading tasks.js to understand what it exports

### tasks.js exports:
- `loadTasks()` - Basic version with container.innerHTML update
- `renderTasksList()` - Groups by personal/project
- `renderTaskItems()` - Internal helper (not exported)
- `completeTask(taskId)` - Uses api.markTaskComplete
- `updateTaskStatus(taskId, status)` - Uses api.updateTask
- `updateTaskPriority(taskId, priority)` - Uses api.updateTask
- Window global: `window.showCreateTaskModal`

## Step 2: Read app.js TASKS section
- [x] Find and analyze TASKS section in app.js

### app.js TASKS section (lines 1031-1302):
- `loadTasks()` - More complex, handles multiple task lists
- `renderTaskBoard(tasks)` - Board view with pending/in_progress/completed
- `renderTaskList(tasks)` - Internal helper
- `showTaskDetail(taskId, source)` - Full task detail panel
- `hideTaskDetail()` - Returns to board/project
- `claimCurrentTask()` - Claim task for self
- `completeCurrentTask()` - Complete via api.completePersonalTask

## Step 3: Compare functions
- [x] Document what tasks.js exports vs what app.js has

### Comparison:

| Function | tasks.js | app.js | Notes |
|----------|----------|--------|-------|
| loadTasks | Simple | Complex | app.js handles board, instanceId check |
| renderTasksList | Groups personal/project | N/A | Different approach |
| renderTaskBoard | N/A | Yes | app.js has board columns |
| renderTaskList | renderTaskItems | Yes | Similar purpose |
| showTaskDetail | Calls details.js | Full implementation | app.js has full detail view |
| hideTaskDetail | N/A | Yes | Missing in tasks.js |
| completeTask | Yes | completeCurrentTask | Different approach |
| claimCurrentTask | N/A | Yes | Missing in tasks.js |
| updateTaskStatus | Yes | N/A | Only in tasks.js |
| updateTaskPriority | Yes | N/A | Only in tasks.js |

**CRITICAL:** app.js has very different implementation than tasks.js!
- app.js uses a board view with columns (pending, in_progress, completed)
- app.js has full task detail view implementation
- tasks.js delegates detail to details.js
- Need to decide: Which is source of truth?

Per instructions: **app.js is source of truth** - need to update tasks.js to match.

## Step 4: Update tasks.js if needed
- [x] Add missing functions from app.js to tasks.js
  - Rewrote tasks.js to match app.js implementation completely
  - Added: loadTasks, renderTaskBoard, renderTaskList, showTaskDetail, hideTaskDetail
  - Added: claimCurrentTask, completeCurrentTask
  - Kept: updateTaskStatus, updateTaskPriority (useful utilities)
  - Added window globals for cross-module calls

## Step 5: Add import statement
- [x] Add import for tasks.js exports to app.js
  - Added 8 function imports from tasks.js

## Step 6: Delete duplicate functions
- [x] Remove task functions from app.js
  - Removed entire TASKS section (lines 994-1265)
  - Functions removed: loadTasks, renderTaskBoard, renderTaskList, showTaskDetail
  - Functions removed: hideTaskDetail, claimCurrentTask, completeCurrentTask

## Step 7: Verify syntax
- [x] node --check src/ui/app.js - PASSED
- [x] node --check src/ui/tasks.js - PASSED

## Step 8: Git commit
- [x] Commit changes
  - Commit: 5cb03aa "refactor(app): Import tasks from tasks.js module"
  - 2 files changed, 282 insertions(+), 337 deletions(-)
  - Net reduction: 55 lines from app.js

## Step 9: Final status
- [x] COMPLETE

---

## COMPLETED: 2026-01-28

### Summary
Successfully integrated tasks.js module into app.js.

### Files Modified
1. `/mnt/coordinaton_mcp_data/worktrees/foundation/src/ui/tasks.js` - Completely rewritten to match app.js
2. `/mnt/coordinaton_mcp_data/worktrees/foundation/src/ui/app.js` - Import added, TASKS section removed

### Functions Now in tasks.js
- `loadTasks()` - Load tasks for current user
- `renderTaskBoard(tasks)` - Board view with columns
- `renderTaskList(tasks)` - Internal helper
- `showTaskDetail(taskId, source)` - Full task detail view
- `hideTaskDetail()` - Return to board/project
- `claimCurrentTask()` - Claim task for self
- `completeCurrentTask()` - Mark task complete
- `updateTaskStatus(taskId, status)` - Update status
- `updateTaskPriority(taskId, priority)` - Update priority

### Window Globals Added
- `window.showTaskDetail`
- `window.hideTaskDetail`
- `window.claimCurrentTask`
- `window.completeCurrentTask`

### Key Decision
app.js was used as source of truth. The original tasks.js had a different approach (delegating to details.js), but app.js had the full inline implementation with board view. The tasks.js module was completely rewritten to match.
