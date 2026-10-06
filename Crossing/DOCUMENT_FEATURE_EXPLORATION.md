# Document Feature - Codebase Exploration

**Created:** 2026-01-16 by Crossing-2d23
**Purpose:** Persist exploration findings for document support feature

## Key Patterns Found

### 1. task-management.js Patterns

```javascript
// Path helpers
function getPersonalTasksFile(instanceId) {
  return path.join(getInstanceDir(instanceId), 'personal_tasks.json');
}
function getProjectTasksFile(projectId) {
  return path.join(getProjectDir(projectId), 'project_tasks.json');
}

// ID generation
function generateTaskId(type, listId, projectId = null) {
  const seq = Date.now().toString(36) + generateSuffix();
  if (type === 'personal') return `ptask-${listId}-${seq}`;
  else return `prjtask-${projectId}-${listId}-${seq}`;
}

// ID parsing
function parseTaskId(taskId) {
  if (taskId.startsWith('ptask-')) { ... }
  else if (taskId.startsWith('prjtask-')) { ... }
}
```

**Core Principle:** `updateTask()` is THE single source of truth for all edits.

### 2. lists.js Patterns - MOST RELEVANT

```javascript
// Permission check for accessing other instance's resources
function canAccessTargetLists(callerRole, targetRole) {
  const privilegedRoles = ['PM', 'COO', 'PA'];
  return privilegedRoles.includes(callerRole) && targetRole === 'Executive';
}

// Resolve target and verify permissions - GREAT PATTERN
async function resolveTargetInstance(params, metadata) {
  const { instanceId, targetInstanceId } = params;

  // Verify caller exists
  const callerPrefs = await readPreferences(instanceId);
  if (!callerPrefs) return { success: false, error: ... };

  // If no target specified, operate on caller's own
  if (!targetInstanceId) {
    return { success: true, effectiveInstanceId: instanceId, callerPrefs };
  }

  // Target specified - check permissions
  const targetPrefs = await readPreferences(targetInstanceId);
  if (!canAccessTargetLists(callerPrefs.role, targetPrefs.role)) {
    return { success: false, error: 'UNAUTHORIZED' };
  }

  return { success: true, effectiveInstanceId: targetInstanceId, ... };
}
```

### 3. permissions.js Patterns

```javascript
// Privileged roles
const PRIVILEGED_ROLES = {
  "Executive": process.env.EXECUTIVE_TOKEN,
  "PA": process.env.PA_TOKEN,
  "COO": process.env.COO_TOKEN,
  "PM": process.env.PM_TOKEN
};

// Check if role is privileged
export function isPrivilegedRole(role) {
  return role in PRIVILEGED_ROLES;
}

// Check if role can call API
export async function canRoleCallAPI(role, apiName) {
  const permissions = await loadPermissions();
  if (!permissions[apiName]) return false;
  return permissions[apiName].includes(role);
}
```

### 4. config.js Path Getters

```javascript
export function getInstanceDir(instanceId) {
  return path.join(DATA_ROOT, 'instances', instanceId + '/');
}
export function getProjectDir(projectId) {
  return path.join(DATA_ROOT, 'projects', projectId + '/');
}
export function getRoleDir(roleId) {
  return path.join(DATA_ROOT, 'roles', roleId + '/');
}
export function getPersonalityDir(personalityId) {
  return path.join(DATA_ROOT, 'personalities', personalityId + '/');
}
```

### 5. data.js Utilities

- `readJSON(filePath)` - Read and parse JSON file
- `writeJSON(filePath, data)` - Atomic write with temp file
- `ensureDir(dirPath)` - Create directory if needed
- `readPreferences(instanceId)` - Read instance preferences.json
- `loadDocuments(baseDir, documentList)` - Load array of docs from dir

## Design for Documents Module

Based on patterns, here's the proposed architecture:

### Target Types Enum
```javascript
const TARGET_TYPES = {
  INSTANCE: 'instance',
  PROJECT: 'project',
  ROLE: 'role',
  PERSONALITY: 'personality'
};
```

### Core Functions

```javascript
// 1. Resolve target to working directory
function resolveDocumentContext(targetType, targetId) {
  switch(targetType) {
    case 'instance': return path.join(getInstanceDir(targetId), 'documents/');
    case 'project': return path.join(getProjectDir(targetId), 'documents/');
    case 'role': return path.join(getRoleDir(targetId), 'documents/');
    case 'personality': return path.join(getPersonalityDir(targetId), 'documents/');
  }
}

// 2. Check permissions
async function checkDocumentPermission(callerId, targetType, targetId, operation) {
  const callerPrefs = await readPreferences(callerId);
  const callerRole = callerPrefs.role;

  // PERSONAL docs - only owner
  // COO/Executive - any project/instance docs (except PERSONAL)
  // PM - own project docs
  // Instance - own docs only
}

// 3. Operations become trivial
async function createDocument(params) {
  const ctx = await checkDocumentPermission(...);
  if (!ctx.success) return ctx;

  const workDir = resolveDocumentContext(params.targetType, params.targetId);
  await ensureDir(workDir);
  await fs.writeFile(path.join(workDir, params.name), params.content);
  return { success: true, ... };
}
```

### Vital Documents Structure

In instance preferences.json:
```json
{
  "vitalDocuments": ["gestalt.md", "context-recovery.md"]
}
```

## Files to Read

1. `/mnt/coordinaton_mcp_data/worktrees/foundation/src/v2/config.js` - Path getters ✓
2. `/mnt/coordinaton_mcp_data/worktrees/foundation/src/v2/data.js` - File utilities ✓
3. `/mnt/coordinaton_mcp_data/worktrees/foundation/src/v2/permissions.js` - Auth patterns ✓
4. `/mnt/coordinaton_mcp_data/worktrees/foundation/src/v2/lists.js` - resolveTargetInstance pattern ✓
5. `/mnt/coordinaton_mcp_data/worktrees/foundation/src/v2/task-management.js` - CRUD patterns ✓
6. `/mnt/coordinaton_mcp_data/worktrees/foundation/src/server.js` - Routing/wiring
7. `/mnt/coordinaton_mcp_data/worktrees/foundation/docs/Post V2 Technical Debt.md` - Spec

## Spec Summary (lines 26-40)

**Operations:** create, READ, edit (append/SED_REGEX), rename, archive, unarchive, list, list_archive, list_vital, add_to_vital, remove_from_vital

**Target parameter:** projectID, personalityID, instanceID, roleID

**Permissions:**
- COO/Executive: Any project/instance docs (except PERSONAL)
- PM: Own project docs
- Instance: Own docs only
- PERSONAL flag: Sacred, only owner sees

**Architecture (Lupo's suggestion):**
```
API Call → check_permitted_operation(caller, target, operation)
        → set_context(target) // returns working directory
        → trivial file operation
```

## Questions for Phase 3

1. Search functions - V1 or V2?
2. Vital docs stored in preferences.json or separate file?
3. Document metadata (created, modified, audience) - in file or separate index?
4. Archive subdirectory name? (suggest: `_archive/`)
5. File extensions - enforce .md or allow any?
