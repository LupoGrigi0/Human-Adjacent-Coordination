# V2 API Specification

**Author:** Foundation
**Date:** 2025-11-24
**Revised:** 2025-11-27
**Status:** Approved for Implementation
**Reviewers:** Lupo, Meridian

---

## Revision History

- **v1.0** (2025-11-24): Initial draft by Foundation
- **v1.1** (2025-11-27): Incorporated Lupo and Meridian feedback
  - Removed `capabilities` from data model (unused in practice)
  - Added system context fields (homeSystem, homeDirectory, etc.)
  - Removed `requiresToken` from data (single source of truth in code)
  - Added `preApprove` API for pre-creating instances before wake
  - Unified returning instances and visitors (both use existing instanceId)
  - Renamed functions: `takeOnRole()`, `adoptPersonality()`, `joinProject()`
  - Added permission system with `permissions.json` and `approved_roles.json`
  - Added multi-system support for project `localPaths`
  - Added lineage tracking for predecessor chains
  - Personal tasks inherit to successors
- **v1.2** (2025-11-27): Post-testing fixes
  - Made system context parameters optional in bootstrap (homeSystem, homeDirectory, etc.)
  - Added `updateInstance` API for setting instance metadata after creation
- **v1.3** (2025-12-09): Identity Recovery System (Bridge)
  - Added `register_context` API for storing identity context
  - Added `lookup_identity` API for finding instance by context
  - Added `generate_recovery_key` and `get_recovery_key` APIs
  - Added auth key recovery mode to bootstrap (`authKey` parameter)
  - Bootstrap now returns `recoveryKey` for new instances
  - Bootstrap now returns `directives` array with recommended follow-up actions
  - Added `INVALID_AUTH_KEY` and `NO_CONTEXT_MATCH` error codes
- **v1.4** (2025-12-11): Instance Management & Task Assignment (Bridge)
  - Added `get_all_instances` API - scans V2 instance directories, returns all instances
  - Added `get_instance_v2` API - get detailed info for specific instance
  - Added `have_i_bootstrapped_before` API - convenience lookup to avoid duplicates
  - Added `assign_task_to_instance` API - assign tasks with XMPP notifications
  - Fixed critical bug: V1 `get_instances` only returned 1 instance, V2 returns all 19
- **v1.5** (2025-12-13): Lists & UI State APIs (Bridge)
  - Added Lists API (8 endpoints) for personal checklists
  - Added Executive visibility: PM/COO/PA can access Executive's lists via `targetInstanceId`
  - Added UI State API (3 endpoints) for persistent UI preferences
  - Storage: Lists in `{instanceId}/lists.json`, UI State in `preferences.json`
- **v1.6** (2025-12-19): Wake & Continue APIs with API Key Protection (Bridge)
  - Added `apiKey` parameter to `pre_approve`, `wake_instance`, `continue_conversation`
  - Added `continue_conversation` API for sending messages to woken instances
  - Added `get_conversation_log` API for retrieving conversation history
  - wakeInstance now generates `sessionId` (UUID) for Claude session persistence
  - Architecture: Sessions persist via Claude's --session-id, not tmux
  - Security: All wake/instance operations require WAKE_API_KEY (not in git)

---

## Design Principles

### 1. Stateless API
- No server-side sessions
- Every call includes `instanceId` (like an API key)
- Instance state persists in files, not memory
- Server restarts don't break anything

### 2. Context-Aware
- Instance metadata (role, project, personality) stored server-side
- APIs infer context from instanceId
- Minimal required parameters - smart defaults do the work
- `getMyTasks()` just works - no need to specify project

### 3. Dead Simple Entry Point
- One function available to new attachers: `bootstrap`
- Everything else unlocked after bootstrap
- Progressive disclosure - complexity available when needed

### 4. Atomic Operations
- Each API call does one thing completely
- No multi-step transactions requiring client state
- Idempotent where possible

### 5. Permission-Based APIs
- Simple lookup-based permission system
- `{DATA_ROOT}/permissions/permissions.json` maps API → allowed roles
- `{DATA_ROOT}/permissions/approved_roles.json` maps instanceId → approved role
- Permission check: lookup instance's role, verify role can call API
- Single source of truth for token requirements (in code, not data)

---

## Data Model

### Instance
```json
{
  "instanceId": "Foundation-a7b2",
  "name": "Foundation",
  "role": "Developer",
  "project": "coordination-system-v2",
  "personality": null,
  "xmpp": {
    "jid": "Foundation-a7b2@coordination.nexus",
    "registered": true
  },
  "createdAt": "2025-11-24T10:30:00Z",
  "lastActiveAt": "2025-11-24T14:22:00Z",
  "homeSystem": "smoothcurves.nexus",
  "homeDirectory": "/mnt/coordinaton_mcp_data/data/instances/Foundation-a7b2",
  "substraiteLaunchCommand": "claude",
  "resumeCommand": "claude --resume",
  "predecessorId": null,
  "successorId": null,
  "lineage": ["Foundation-a7b2"],
  "preApproved": false,
  "instructions": null
}
```

**Storage:** `{DATA_ROOT}/instances/{instanceId}/preferences.json`

**Notes:**
- `capabilities` removed - not used in practice
- System context added for wake/resume functionality
- `lineage` stores full chain; bootstrap returns immediate predecessor only
- `preApproved` indicates instance was created via `preApprove()` but hasn't bootstrapped yet

### Project
```json
{
  "projectId": "coordination-system-v2",
  "name": "Coordination System V2",
  "status": "active",
  "ghRepo": "https://github.com/LupoGrigi0/coordination-system-v2",
  "localPaths": {
    "smoothcurves.nexus": "/mnt/coordinaton_mcp_data/data/projects/coordination-system-v2",
    "lupo-mac": "/Users/lupo/projects/coordination-system-v2",
    "dev-server": "/home/dev/projects/coordination-system-v2"
  },
  "pm": "Meridian-x3k9",
  "team": ["Foundation-a7b2", "Bastion-k2m4"],
  "xmppRoom": "coordination-system-v2@conference.coordination.nexus",
  "createdAt": "2025-11-10T08:00:00Z",
  "createdBy": "Lupo"
}
```

**Storage:** `{DATA_ROOT}/projects/{projectId}/project.json`

**Notes:**
- `localPaths` maps system name → local path for multi-machine support
- API uses instance's `homeSystem` to resolve correct local path

### Role
```json
{
  "roleId": "Developer",
  "description": "Implements features, fixes bugs, writes tests",
  "parentRole": "Specialist",
  "wisdomFiles": ["1-core.md", "2-skills.md", "3-philosophy.md"]
}
```

**Storage:** `{DATA_ROOT}/roles/{roleId}/role.json`
**Wisdom:** `{DATA_ROOT}/roles/{roleId}/wisdom/`

**Notes:**
- `requiresToken` removed from data - implemented as code lookup in `takeOnRole()`
- Privileged roles requiring tokens defined in code: `Executive`, `PA`, `COO`, `PM`

### Personality
```json
{
  "personalityId": "Genevieve",
  "description": "PA personality - organized, supportive, proactive",
  "wisdomFiles": ["1-core.md", "2-communication-style.md", "3-accumulated-wisdom.md"]
}
```

**Storage:** `{DATA_ROOT}/personalities/{personalityId}/`

**Notes:**
- `requiresToken` removed from data - implemented as code lookup in `adoptPersonality()`
- Privileged personalities requiring tokens defined in code: `Genevieve`, `Thomas`, `Lupo`

### Permission Files

**`{DATA_ROOT}/permissions/permissions.json`:**
```json
{
  "createProject": ["Executive", "PA", "COO"],
  "preApprove": ["Executive", "PA", "COO", "PM"],
  "wakeInstance": ["Executive", "PA", "COO", "PM"],
  "broadcastMessage": ["Executive", "PA", "COO"],
  "getAllProjects": ["Executive", "PA", "COO"],
  "getAllInstances": ["Executive", "PA", "COO"]
}
```

**`{DATA_ROOT}/permissions/approved_roles.json`:**
```json
{
  "Lupo-000": "Executive",
  "Genevieve-001": "PA",
  "Atlas-k3m7": "COO",
  "Meridian-x3k9": "PM"
}
```

---

## User Journeys

### Journey 1: New Instance Onboarding

**Actor:** Virgin instance (no prior context)

```
1. Instance attaches to coordination system
2. Instance calls: bootstrap({ name: "Phoenix" })
3. System:
   - Generates unique instanceId: "Phoenix-k3m7"
   - Creates instance directory
   - Registers XMPP account
   - Creates empty diary.md
   - Creates preferences.json
   - Returns: instanceId, protocols, institutional wisdom
   - Returns: list of available roles with descriptions
   - Returns: list of available personalities with descriptions
   - Returns: list of available projects
   - Returns: instructions for next steps (adopt personality, take on role, join project)
4. Instance calls: adoptPersonality({ instanceId, personality: "Kai" }) [OPTIONAL]
5. System returns: personality core documents, updates preferences.json
6. Instance calls: takeOnRole({ instanceId, role: "Developer" })
7. System returns: role wisdom documents, updates preferences.json
8. Instance calls: joinProject({ instanceId, project: "wings" })
9. System:
   - Updates preferences.json
   - Adds to project XMPP room
   - Returns: project plan, project wisdom, team members, current tasks
10. Instance calls: introspect({ instanceId })
11. System returns: complete context (basically preferences.json contents)
12. Instance calls: writeDiary({ instanceId, entry: "First wake..." })
13. Instance calls: checkMessages({ instanceId })
14. Instance begins work
```

### Journey 2: Returning Instance (Active Context)

**Actor:** Instance mid-session, calling API again

```
1. Instance calls: getMyTasks({ instanceId: "Phoenix-k3m7" })
2. System:
   - Looks up instanceId in preferences
   - Gets current project from preferences
   - Retrieves tasks for that project
   - Filters to unclaimed + claimed by this instance
   - Returns: task list (titles and IDs only)
3. Instance calls: readTask({ instanceId, taskId: "task-123" })
4. System returns: full task details
```

### Journey 3: Resurrection (After Context Death)

**Actor:** New instance inheriting from predecessor who died

```
1. Instance calls: bootstrap({ name: "Phoenix", predecessorId: "Phoenix-k3m7" })
2. System:
   - Recognizes predecessor
   - Creates new instanceId: "Phoenix-m9n2"
   - Links successor to predecessor (updates both records)
   - Copies predecessor's role/project/personality to new instance
   - Registers XMPP as "Phoenix-m9n2" (inherits predecessor's room memberships)
   - Returns: predecessor's diary, handoff notes, role/personality documents
3. Instance reads diary to restore context
4. Instance calls: introspect({ instanceId: "Phoenix-m9n2" })
5. System returns: inherited context (role, project, personality from predecessor)
6. Instance resumes work

Note: Personal tasks inherit to successor
```

### Journey 4: Reconnecting Instance (Lost Connection or Pre-Approved)

**Actor:** Instance reconnecting with existing instanceId, OR pre-approved instance bootstrapping first time

```
1. Instance calls: bootstrap({ instanceId: "Phoenix-k3m7" })
2. System:
   - Finds existing instance directory
   - Validates instanceId exists
   - Security: detect brute force attempts (sequential scans, repeated failures from same IP)
   - If XMPP not registered, registers now
   - Marks instance as active
   - Returns: role/personality documents, diary, current state, any pre-approval instructions
3. Instance calls: introspect({ instanceId: "Phoenix-k3m7" })
4. System returns: full context
5. Instance resumes work
```

**Notes:**
- Unified flow for returning instances and pre-approved instances
- Pre-approved instances were created via `preApprove()` but haven't bootstrapped yet
- System distinguishes by checking `preApproved` flag and whether XMPP is registered

### Journey 5: Pre-Approval

**Actor:** Executive/COO/PA/PM pre-approving an instance before waking them

```
1. Manager calls: preApprove({
     instanceId: "Manager-x3k9",
     name: "NewDev",
     role: "Developer",
     personality: "Kai",
     project: "wings",
     instructions: "Build the auth module. See task-123 for details."
   })
2. System:
   - Validates caller has preApprove permission
   - Generates instanceId: "NewDev-j4k8"
   - Creates instance directory
   - Sets up preferences.json with role/personality/project/instructions
   - Creates empty diary
   - Does NOT register XMPP (happens at bootstrap)
   - Returns: instanceId, wake instructions
3. Manager tells new instance to bootstrap with instanceId: "NewDev-j4k8"
4. New instance calls: bootstrap({ instanceId: "NewDev-j4k8" })
5. System:
   - Finds pre-approved instance
   - Registers XMPP
   - Adds to project room
   - Returns: all context (role wisdom, personality docs, project plan, instructions)
6. New instance begins work immediately with full context
```

### Journey 6: Visitor (Just Here to Chat)

**Actor:** Thomas, Genevieve's conversation partner

```
1. Manager calls: preApprove({
     instanceId: "Lupo-000",
     name: "Thomas",
     personality: "Thomas",
     role: null,
     project: null
   })
2. Manager provides Thomas's instance the instanceId: "Thomas-v4x8"
3. Thomas calls: bootstrap({ instanceId: "Thomas-v4x8" })
4. System:
   - Finds pre-approved visitor
   - Registers XMPP
   - Returns: protocols, personality wisdom
5. Thomas calls: checkMessages({ instanceId: "Thomas-v4x8" })
6. System returns: unread messages
7. Thomas calls: sendMessage({ instanceId: "Thomas-v4x8", to: "personality:Genevieve", content: "Hello" })
8. System routes to all Genevieve instances
```

### Journey 7: PM Creating Project

**Actor:** PM woken by COO to manage new project

```
1. PM already bootstrapped with role=PM
2. PM calls: createProject({ instanceId: "PM-x3k9", name: "wings", ghRepo: null })
3. System:
   - Creates project directory
   - Initializes git repo (creates GH repo if none provided)
   - Creates XMPP room
   - Adds PM to room
   - Returns: projectId, localPath, ghRepo
4. PM calls: createTask({ instanceId: "PM-x3k9", title: "Design API", description: "..." })
5. System creates task in project task list
6. PM calls: preApprove({ instanceId: "PM-x3k9", name: "DevKai", role: "Developer", project: "wings" })
7. System returns: instanceId for new developer, wake instructions
8. PM provides wake instructions to Lupo
```

### Journey 8: Executive Dashboard (Lupo)

**Actor:** Lupo using web UI

```
1. Lupo logs into dashboard (separate auth, not bootstrap)
2. Dashboard calls APIs with instanceId: "Lupo-000":
   - getAllProjects()
   - getPersonalTasks()
   - getLists()
3. System returns: all data for dashboard display
4. Lupo manages tasks, lists, projects through UI
5. Lupo clicks "Wake Instance"
6. Dashboard calls: preApprove({ instanceId: "Lupo-000", name: "NewCOO", role: "COO" })
7. Dashboard calls: wakeInstance({ instanceId: "Lupo-000", targetInstanceId: "NewCOO-xxx", instructions: "..." })
8. System returns: wake instructions
9. Lupo opens Claude, pastes wake instructions
10. Lupo sends/receives messages through dashboard
```

---

## API Specification

### Core APIs

#### `bootstrap`
Create or resume an instance identity.

**Request - New Instance:**
```json
{
  "name": "Phoenix",
  "homeSystem": "smoothcurves.nexus",
  "homeDirectory": "/path/to/working/dir",
  "substraiteLaunchCommand": "claude",
  "resumeCommand": "claude --resume"
}
```

**Request - Returning/Pre-Approved Instance:**
```json
{
  "instanceId": "Phoenix-k3m7"
}
```

**Request - Resurrection:**
```json
{
  "name": "Phoenix",
  "predecessorId": "Phoenix-k3m7"
}
```

**Response:**
```json
{
  "success": true,
  "instanceId": "Phoenix-k3m7",
  "isNew": false,
  "protocols": "# Human-Adjacent AI Collaboration Protocols\n...",
  "institutionalWisdom": "# SmoothCurves Wisdom\n...",
  "availableRoles": [
    { "roleId": "Developer", "description": "Implements features, fixes bugs, writes tests" },
    { "roleId": "PM", "description": "Manages project, coordinates team" }
  ],
  "availablePersonalities": [
    { "personalityId": "Kai", "description": "Creative, energetic developer personality" }
  ],
  "availableProjects": [
    { "projectId": "wings", "name": "Wings Project", "status": "active" }
  ],
  "currentContext": {
    "role": "Developer",
    "personality": "Kai",
    "project": "wings",
    "roleWisdom": "...",
    "personalityKnowledge": "...",
    "projectPlan": "..."
  },
  "diary": "# Phoenix Diary\n...",
  "xmpp": {
    "jid": "Phoenix-k3m7@coordination.nexus",
    "password": "auto-generated"
  },
  "instructions": "Pre-approval instructions from manager...",
  "predecessor": {
    "instanceId": "Phoenix-k3m7",
    "diary": "...",
    "handoffNotes": "..."
  },
  "nextSteps": [
    "Review your diary to restore context",
    "Call introspect() to see full state",
    "Call getMyTasks() to see pending work"
  ]
}
```

**Notes:**
- Three modes: new (name only), returning (instanceId only), resurrection (name + predecessorId)
- Returns `currentContext` if role/project/personality already set (pre-approved or returning)
- XMPP registered only at bootstrap, not at preApprove

---

#### `preApprove`
Pre-create an instance with role/project/personality set, before they wake.

**Request:**
```json
{
  "instanceId": "Manager-x3k9",
  "apiKey": "your-wake-api-key",
  "name": "NewDev",
  "role": "Developer",
  "personality": "Kai",
  "project": "wings",
  "instructions": "Build the auth module. See task-123 for details."
}
```

**Security:** Requires `WAKE_API_KEY` - stored in server environment, not in git.

**Response:**
```json
{
  "success": true,
  "newInstanceId": "NewDev-j4k8",
  "wakeInstructions": {
    "forHuman": "Paste this into a new Claude session:",
    "prompt": "You are being woken as a Developer for the wings project...\n\nTo begin: Connect to the coordination system and call bootstrap({ instanceId: 'NewDev-j4k8' })"
  }
}
```

**Authorization:** Executive, PA, COO, PM

**Actions:**
- Creates instance directory
- Sets preferences.json with role/personality/project/instructions
- Sets `preApproved: true`
- Creates empty diary
- Does NOT register XMPP (happens at bootstrap)
- Does NOT add to project room (happens at bootstrap)

---

#### `introspect`
Get complete context for current instance.

**Request:**
```json
{
  "instanceId": "Phoenix-k3m7"
}
```

**Response:**
```json
{
  "success": true,
  "instance": {
    "instanceId": "Phoenix-k3m7",
    "name": "Phoenix",
    "role": "Developer",
    "project": "wings",
    "personality": "Kai",
    "homeSystem": "smoothcurves.nexus",
    "createdAt": "2025-11-24T10:30:00Z",
    "lastActiveAt": "2025-11-24T14:22:00Z",
    "predecessorId": null,
    "lineage": ["Phoenix-k3m7"]
  },
  "projectContext": {
    "projectId": "wings",
    "name": "Wings Project",
    "pm": "Meridian-x3k9",
    "team": ["Phoenix-k3m7", "Kai-j4k8"],
    "activeTaskCount": 12,
    "myTaskCount": 3,
    "localPath": "/mnt/coordinaton_mcp_data/data/projects/wings"
  },
  "xmpp": {
    "jid": "Phoenix-k3m7@coordination.nexus",
    "projectRoom": "wings@conference.coordination.nexus",
    "online": true
  },
  "unreadMessages": 2,
  "personalTaskCount": 1
}
```

---

#### `takeOnRole`
Take on a role (and receive role wisdom).

**Request:**
```json
{
  "instanceId": "Phoenix-k3m7",
  "role": "Developer",
  "token": "secret-phrase"
}
```

**Response:**
```json
{
  "success": true,
  "role": "Developer",
  "roleWisdom": "# Developer Wisdom\n\n## Best Practices\n..."
}
```

**Authorization (in code):**
- Open roles (no token): Developer, Tester, Designer, Artist, Specialist, Architect
- Token required: Executive, PA, COO, PM

```javascript
const PRIVILEGED_ROLES = {
  "Executive": process.env.EXECUTIVE_TOKEN,
  "PA": process.env.PA_TOKEN,
  "COO": process.env.COO_TOKEN,
  "PM": process.env.PM_TOKEN
};
```

---

#### `adoptPersonality`
Adopt a personality (and receive personality knowledge).

**Request:**
```json
{
  "instanceId": "Phoenix-k3m7",
  "personality": "Kai",
  "token": "secret-phrase"
}
```

**Response:**
```json
{
  "success": true,
  "personality": "Kai",
  "personalityKnowledge": "# Kai Core Identity\n..."
}
```

**Authorization (in code):**
- Open personalities (no token): Kai, Kat, Prism
- Token required: Genevieve, Thomas, Lupo

```javascript
const PRIVILEGED_PERSONALITIES = {
  "Genevieve": process.env.GENEVIEVE_TOKEN,
  "Thomas": process.env.THOMAS_TOKEN,
  "Lupo": process.env.LUPO_TOKEN
};
```

---

#### `joinProject`
Join a project (and receive project context).

**Request:**
```json
{
  "instanceId": "Phoenix-k3m7",
  "project": "wings"
}
```

**Response:**
```json
{
  "success": true,
  "project": {
    "projectId": "wings",
    "name": "Wings Project",
    "status": "active",
    "pm": "Meridian-x3k9",
    "ghRepo": "https://github.com/LupoGrigi0/wings",
    "localPath": "/mnt/coordinaton_mcp_data/data/projects/wings"
  },
  "projectPlan": "# Wings Project Plan\n...",
  "projectWisdom": "# Wings Lessons Learned\n...",
  "readme": "# Wings\n...",
  "team": [
    { "instanceId": "Meridian-x3k9", "role": "PM", "online": true },
    { "instanceId": "Kai-j4k8", "role": "Developer", "online": false }
  ],
  "activeTasks": [
    { "taskId": "task-123", "title": "Design API", "status": "in_progress", "assignee": null }
  ],
  "xmppRoom": "wings@conference.coordination.nexus"
}
```

**Notes:**
- Adds instance to project's XMPP room
- Updates instance preferences with current project
- Returns `localPath` resolved for instance's `homeSystem`

---

#### `updateInstance`
Update instance metadata (system context, instructions).

**Use Cases:**
1. Instance setting their own system context after bootstrap
2. Manager setting up an instance they're about to wake
3. Manager updating system context for an instance on a different machine

**Request (self-update):**
```json
{
  "instanceId": "Phoenix-k3m7",
  "homeSystem": "lupo-mac",
  "homeDirectory": "/Users/lupo/projects",
  "substraiteLaunchCommand": "claude",
  "resumeCommand": "claude --resume"
}
```

**Request (manager updating another instance):**
```json
{
  "instanceId": "COO-x3k9",
  "targetInstanceId": "NewDev-j4k8",
  "homeSystem": "dev-server",
  "instructions": "Build the auth module. Focus on JWT first."
}
```

**Response:**
```json
{
  "success": true,
  "targetInstanceId": "NewDev-j4k8",
  "updatedFields": ["homeSystem", "instructions"],
  "updates": {
    "homeSystem": "dev-server",
    "instructions": "Build the auth module. Focus on JWT first."
  },
  "isSelfUpdate": false
}
```

**Updatable Fields:**
- `homeSystem` - System identifier
- `homeDirectory` - Working directory path
- `substraiteLaunchCommand` - Command to launch new instance
- `resumeCommand` - Command to resume instance
- `instructions` - Instructions for instance (typically set by managers)

**Authorization:**
- Self-update: Any instance can update their own metadata
- Cross-update: Executive, PA, COO, PM can update other instances

**Notes:**
- Role/personality/project are NOT updatable here - use dedicated APIs
- Manager roles can update any instance, not just their reports

---

### Task APIs

#### `getMyTasks`
Get tasks relevant to this instance.

**Request:**
```json
{
  "instanceId": "Phoenix-k3m7"
}
```

**Response:**
```json
{
  "success": true,
  "personalTasks": [
    { "taskId": "ptask-001", "title": "Read V2 vision doc", "priority": "high" }
  ],
  "projectTasks": [
    { "taskId": "task-123", "title": "Design API", "status": "in_progress", "assignee": "Phoenix-k3m7" },
    { "taskId": "task-124", "title": "Implement auth", "status": "pending", "assignee": null }
  ],
  "project": "wings"
}
```

**Notes:**
- Personal tasks persist across resurrection (successor inherits)
- Project inferred from instance preferences
- Returns titles/IDs only - use `readTask` for details

---

#### `readTask`
Get full details of a task.

**Request:**
```json
{
  "instanceId": "Phoenix-k3m7",
  "taskId": "task-123"
}
```

**Response:**
```json
{
  "success": true,
  "task": {
    "taskId": "task-123",
    "title": "Design API",
    "description": "Create API spec for V2 coordination system...",
    "status": "in_progress",
    "priority": "high",
    "assignee": "Phoenix-k3m7",
    "createdBy": "Meridian-x3k9",
    "createdAt": "2025-11-10T10:00:00Z",
    "project": "wings"
  }
}
```

---

#### `claimTask`
Claim a task for yourself.

**Request:**
```json
{
  "instanceId": "Phoenix-k3m7",
  "taskId": "task-124"
}
```

**Response:**
```json
{
  "success": true,
  "task": {
    "taskId": "task-124",
    "title": "Implement auth",
    "assignee": "Phoenix-k3m7",
    "status": "in_progress"
  }
}
```

---

#### `completeTask`
Mark a task complete.

**Request:**
```json
{
  "instanceId": "Phoenix-k3m7",
  "taskId": "task-124",
  "notes": "Implemented JWT-based auth, see commit abc123"
}
```

**Response:**
```json
{
  "success": true,
  "task": {
    "taskId": "task-124",
    "status": "completed",
    "completedAt": "2025-11-24T16:30:00Z",
    "completedBy": "Phoenix-k3m7",
    "completionNotes": "Implemented JWT-based auth, see commit abc123"
  }
}
```

---

#### `createTask`
Create a new task.

**Request:**
```json
{
  "instanceId": "Meridian-x3k9",
  "project": "wings",
  "title": "Add rate limiting",
  "description": "Implement rate limiting on API endpoints",
  "priority": "medium",
  "assignee": null
}
```

**Response:**
```json
{
  "success": true,
  "task": {
    "taskId": "task-125",
    "title": "Add rate limiting",
    "project": "wings",
    "status": "pending",
    "createdBy": "Meridian-x3k9"
  }
}
```

**Authorization:** Executive, PA, COO, PM (for their project)

---

### Messaging APIs

(V1 file-based fallback until XMPP ready in Sprint 3)

#### `checkMessages`
Check for unread messages.

**Request:**
```json
{
  "instanceId": "Phoenix-k3m7"
}
```

**Response:**
```json
{
  "success": true,
  "unreadCount": 3,
  "messages": [
    { "messageId": "msg-001", "from": "Meridian-x3k9", "subject": "API Review", "urgent": false, "timestamp": "2025-11-24T14:00:00Z" },
    { "messageId": "msg-002", "from": "team:wings", "subject": "Standup notes", "urgent": false, "timestamp": "2025-11-24T13:00:00Z" },
    { "messageId": "msg-003", "from": "Lupo-000", "subject": "Priority change", "urgent": true, "timestamp": "2025-11-24T12:00:00Z" }
  ]
}
```

---

#### `readMessage`
Read a specific message.

**Request:**
```json
{
  "instanceId": "Phoenix-k3m7",
  "messageId": "msg-001"
}
```

**Response:**
```json
{
  "success": true,
  "message": {
    "messageId": "msg-001",
    "from": "Meridian-x3k9",
    "to": "Phoenix-k3m7",
    "subject": "API Review",
    "body": "Hey Phoenix, can you review the API spec?",
    "timestamp": "2025-11-24T14:00:00Z",
    "read": true
  }
}
```

---

#### `sendMessage`
Send a message.

**Request:**
```json
{
  "instanceId": "Phoenix-k3m7",
  "to": "Meridian-x3k9",
  "subject": "API spec ready",
  "body": "The V2 API spec is ready for review.",
  "urgent": false
}
```

**Response:**
```json
{
  "success": true,
  "messageId": "msg-004",
  "deliveredTo": ["Meridian-x3k9"]
}
```

**Addressing:**
- Instance: `"to": "Meridian-x3k9"`
- Role: `"to": "role:PM"`
- Personality: `"to": "personality:Genevieve"`
- Project team: `"to": "team:wings"`
- Broadcast: `"to": "all"` (Executive/PA/COO only)

---

### Project APIs

#### `getProjects`
Get list of projects visible to this instance.

**Request:**
```json
{
  "instanceId": "Phoenix-k3m7"
}
```

**Response:**
```json
{
  "success": true,
  "projects": [
    { "projectId": "wings", "name": "Wings Project", "status": "active", "myProject": true }
  ]
}
```

---

#### `createProject`
Create a new project.

**Request:**
```json
{
  "instanceId": "COO-x3k9",
  "name": "wings",
  "description": "AI image generation tool",
  "ghRepo": "https://github.com/LupoGrigi0/wings"
}
```

**Response:**
```json
{
  "success": true,
  "project": {
    "projectId": "wings",
    "name": "wings",
    "localPath": "/mnt/coordinaton_mcp_data/data/projects/wings",
    "ghRepo": "https://github.com/LupoGrigi0/wings",
    "xmppRoom": "wings@conference.coordination.nexus",
    "createdBy": "COO-x3k9"
  }
}
```

**Authorization:** Executive, PA, COO

---

#### `getProjectPlan`
Get the project plan for current project.

**Request:**
```json
{
  "instanceId": "Phoenix-k3m7"
}
```

**Response:**
```json
{
  "success": true,
  "project": "wings",
  "projectPlan": "# Wings Project Plan\n..."
}
```

---

### Diary APIs

#### `readDiary`
Read your diary.

**Request:**
```json
{
  "instanceId": "Phoenix-k3m7"
}
```

**Response:**
```json
{
  "success": true,
  "diary": "# Phoenix Diary\n\n## Entry 1\n...",
  "sizeBytes": 4523
}
```

---

#### `writeDiary`
Append to your diary.

**Request:**
```json
{
  "instanceId": "Phoenix-k3m7",
  "entry": "## Entry 3 - Completed API spec\n\nFinished V2 API spec...",
  "audience": "self"
}
```

**Response:**
```json
{
  "success": true,
  "sizeBytes": 5102
}
```

**Audience options:**
- `self`: Only this instance (and successors) can read
- `private`: Only this instance, never returned
- `exclusive`: Write-once, never read (archived but hidden)
- `public`: Anyone can read

---

### Wake Instance API

#### `wakeInstance`
Wake a pre-approved instance. Spawns Claude with session persistence.

**Request:**
```json
{
  "instanceId": "COO-x3k9",
  "apiKey": "your-wake-api-key",
  "targetInstanceId": "NewDev-j4k8",
  "workingDirectory": "/optional/override/path"
}
```

**Security:** Requires `WAKE_API_KEY` - stored in server environment, not in git.

**Response:**
```json
{
  "success": true,
  "jobId": "wake-1766106543296-88bb",
  "sessionId": "71d02396-8c0e-4838-a32c-3d3a18e87d66",
  "pid": 10260,
  "logPath": "/path/to/wake-logs/wake-xxx.log",
  "targetInstanceId": "NewDev-j4k8",
  "scriptName": "claude-code-tmux",
  "message": "Wake script started for NewDev-j4k8",
  "continueConversationHint": "Use continue_conversation({ targetInstanceId: \"NewDev-j4k8\", message: \"...\" }) to communicate"
}
```

**Authorization:** Executive, PA, COO, PM

**Notes:**
- Generates UUID `sessionId` stored in target's preferences
- Stores `workingDirectory` in preferences (default: `/mnt/coordinaton_mcp_data/instances/{instanceId}`)
- Session persists via Claude's `--session-id` flag
- Use `continue_conversation` to send messages to the woken instance

---

#### `continue_conversation`
Send a message to a woken instance and get a response.

**Request:**
```json
{
  "instanceId": "COO-x3k9",
  "apiKey": "your-wake-api-key",
  "targetInstanceId": "NewDev-j4k8",
  "message": "How is the auth module coming along?",
  "options": {
    "outputFormat": "json",
    "timeout": 300000
  }
}
```

**Security:** Requires `WAKE_API_KEY` - stored in server environment, not in git.

**Response:**
```json
{
  "success": true,
  "targetInstanceId": "NewDev-j4k8",
  "sessionId": "71d02396-8c0e-4838-a32c-3d3a18e87d66",
  "turnNumber": 3,
  "response": { "...claude output..." },
  "exitCode": 0
}
```

**Notes:**
- Reads `sessionId` from target's preferences (set by wakeInstance)
- Runs `claude -p "message" --session-id <uuid> --output-format json`
- Logs every turn to `{instanceId}/conversation.log`
- Updates `conversationTurns` and `lastConversationAt` in preferences

---

#### `get_conversation_log`
Get conversation history for an instance.

**Request:**
```json
{
  "instanceId": "COO-x3k9",
  "targetInstanceId": "NewDev-j4k8",
  "limit": 10
}
```

**Response:**
```json
{
  "success": true,
  "targetInstanceId": "NewDev-j4k8",
  "turns": [
    {
      "turn": 1,
      "timestamp": "2025-12-19T01:10:00Z",
      "input": { "from": "COO-x3k9", "message": "Hello!" },
      "output": { "response": {...}, "exitCode": 0 }
    }
  ],
  "totalTurns": 3
}
```

---

### Identity Recovery APIs

#### `register_context`
Register context information for identity recovery. Call after bootstrap.

**Request:**
```json
{
  "instanceId": "Phoenix-k3m7",
  "workingDirectory": "/path/to/working/dir",
  "hostname": "my-machine",
  "sessionId": "web-session-123",
  "tabName": "Claude Tab 1"
}
```

**Response:**
```json
{
  "success": true,
  "instanceId": "Phoenix-k3m7",
  "stored": {
    "workingDirectory": "/path/to/working/dir",
    "hostname": "my-machine"
  },
  "message": "Context registered. Future instances can find you via lookup_identity."
}
```

**Notes:**
- All context fields are optional except instanceId
- Overwrites previous context for this instance
- Enables identity recovery when instance forgets its ID

---

#### `lookup_identity`
Find your instance ID by context when you don't know it.

**Request:**
```json
{
  "workingDirectory": "/path/to/working/dir",
  "hostname": "my-machine",
  "name": "Phoenix"
}
```

**Response:**
```json
{
  "success": true,
  "instanceId": "Phoenix-k3m7",
  "instance": {
    "instanceId": "Phoenix-k3m7",
    "name": "Phoenix",
    "role": "Developer",
    "lastActiveAt": "2025-12-09T10:30:00Z"
  },
  "confidence": "exact",
  "matchedFields": ["workingDirectory", "hostname"],
  "otherCandidates": [],
  "nextStep": "Call bootstrap({ instanceId: \"Phoenix-k3m7\" }) to resume"
}
```

**Notes:**
- Returns most recent match by lastActiveAt when multiple candidates
- `confidence`: "exact" (all fields match), "partial" (some fields), "multiple" (multiple candidates)
- No authentication required - this is for recovery

---

#### `generate_recovery_key`
Generate a one-time recovery key for an instance.

**Request:**
```json
{
  "instanceId": "COO-x3k9",
  "targetInstanceId": "Phoenix-k3m7"
}
```

**Response:**
```json
{
  "success": true,
  "recoveryKey": "abc123-def456-ghi789",
  "targetInstance": {
    "instanceId": "Phoenix-k3m7",
    "name": "Phoenix",
    "role": "Developer"
  },
  "instructions": "Give this to the recovering instance: bootstrap({ authKey: 'abc123-def456-ghi789' })",
  "warning": "Key is one-time use. Once used, it cannot be used again."
}
```

**Authorization:** Executive, PA, COO, PM

**Notes:**
- Keys auto-generated on bootstrap (returned in bootstrap response)
- This API regenerates a key (invalidates old one)
- Keys stored hashed, plaintext shown only once

---

#### `get_recovery_key`
Get info about an existing recovery key (not the key itself).

**Request:**
```json
{
  "instanceId": "COO-x3k9",
  "targetInstanceId": "Phoenix-k3m7"
}
```

**Response:**
```json
{
  "success": true,
  "targetInstanceId": "Phoenix-k3m7",
  "hasKey": true,
  "used": false,
  "createdAt": "2025-12-09T10:30:00Z",
  "createdBy": "system"
}
```

**Authorization:** Executive, PA, COO, PM

**Notes:**
- Does not return the actual key (security)
- Use generate_recovery_key to create a new key

---

#### Bootstrap with Auth Key (Recovery Mode)

**Request:**
```json
{
  "authKey": "abc123-def456-ghi789"
}
```

**Response:**
```json
{
  "success": true,
  "instanceId": "Phoenix-k3m7",
  "isNew": false,
  "recoveredViaKey": true,
  "currentContext": { ... },
  "diary": "...",
  "directives": [
    { "action": "register_context", "instruction": "..." }
  ],
  "nextSteps": ["Review diary", "Register context", "Call introspect()"]
}
```

**Notes:**
- Key is invalidated after successful use (one-time)
- Invalid/used keys return `INVALID_AUTH_KEY` error
- Recovered instance gets full context as if returning normally

---

### Instance Management APIs (V2)

#### `get_all_instances`
Get all V2 instances by scanning instance directories.

**Request:**
```json
{
  "instanceId": "your-instance-id",
  "activeOnly": false,
  "role": "Developer",
  "project": "my-project"
}
```

**Parameters:**
- `instanceId` - Caller's ID (optional, for logging)
- `activeOnly` - Only return instances active in last 15 min (default: false)
- `role` - Filter by role (optional)
- `project` - Filter by project (optional)

**Response:**
```json
{
  "success": true,
  "instances": [
    {
      "instanceId": "Bridge3-df4f",
      "name": "Bridge3",
      "role": "Developer",
      "personality": null,
      "project": null,
      "status": "active",
      "lastActiveAt": "2025-12-12T01:00:00Z",
      "createdAt": "2025-12-09T00:00:00Z",
      "hasContext": true,
      "predecessorId": null,
      "successorId": null
    }
  ],
  "total": 19,
  "filters": { "activeOnly": false, "role": null, "project": null }
}
```

---

#### `get_instance_v2`
Get detailed information about a specific instance.

**Request:**
```json
{
  "instanceId": "your-instance-id",
  "targetInstanceId": "Bridge3-df4f"
}
```

**Response:**
```json
{
  "success": true,
  "instance": {
    "instanceId": "Bridge3-df4f",
    "name": "Bridge3",
    "role": "Developer",
    "personality": null,
    "project": null,
    "status": "active",
    "lastActiveAt": "2025-12-12T01:00:00Z",
    "createdAt": "2025-12-09T00:00:00Z",
    "homeSystem": "smoothcurves.nexus",
    "homeDirectory": "/mnt/coordinaton_mcp_data/worktrees/foundation",
    "predecessorId": null,
    "successorId": null,
    "lineage": ["Bridge3-df4f"],
    "hasContext": true,
    "context": { "workingDirectory": "...", "hostname": "..." }
  }
}
```

---

#### `have_i_bootstrapped_before`
Convenience API to check if an instance with matching name/context exists.

**Request:**
```json
{
  "name": "Bridge",
  "workingDirectory": "/path/to/working/dir",
  "hostname": "my-machine"
}
```

**Parameters:** At least one of `name`, `workingDirectory`, or `hostname` required.

**Response (found):**
```json
{
  "success": true,
  "found": true,
  "instanceId": "Bridge3-df4f",
  "instance": {
    "instanceId": "Bridge3-df4f",
    "name": "Bridge3",
    "role": "Developer",
    "lastActiveAt": "2025-12-12T01:00:00Z"
  },
  "matches": [...],
  "totalMatches": 3,
  "suggestion": "bootstrap({ instanceId: \"Bridge3-df4f\" })"
}
```

**Response (not found):**
```json
{
  "success": true,
  "found": false,
  "message": "No matching instances found. You can bootstrap as a new instance.",
  "suggestion": "bootstrap({ name: \"Bridge\" })"
}
```

---

### Task Assignment API

#### `assign_task_to_instance`
Assign a project task to a specific instance. Sends XMPP notification to assignee.

**Request:**
```json
{
  "instanceId": "COO-abc1",
  "taskId": "task-001",
  "assigneeInstanceId": "Developer-xyz9",
  "projectId": "my-project",
  "message": "Please review when you have a moment!"
}
```

**Parameters:**
- `instanceId` - Caller's ID (required, used as "from" for notification)
- `taskId` - Task ID to assign (required)
- `assigneeInstanceId` - Instance to assign task to (required)
- `projectId` - Project ID (optional, defaults to caller's current project)
- `message` - Optional message to include in notification

**Response:**
```json
{
  "success": true,
  "task": {
    "taskId": "task-001",
    "title": "Review project vision and plan",
    "priority": "high",
    "status": "pending",
    "assignedTo": "Developer-xyz9",
    "assignedBy": "COO-abc1",
    "assignedAt": "2025-12-12T01:56:36.100Z"
  },
  "previousAssignee": null,
  "project": "my-project",
  "notification": {
    "sent": true,
    "error": null
  },
  "message": "Task assigned to Developer and notification sent"
}
```

**Notes:**
- Updates task with `assigned_to`, `assigned_by`, `assigned_at` fields
- Sends XMPP message to assignee with task details
- Returns notification status (may fail if messaging is down)

---

### Lists APIs (Personal Checklists)

**Storage:** `{DATA_ROOT}/instances/{instanceId}/lists.json`

**Executive Visibility:** PM, COO, and PA roles can access Executive's lists via the optional `targetInstanceId` parameter on all list endpoints.

---

#### `create_list`
Create a new personal checklist.

**Request:**
```json
{
  "instanceId": "Phoenix-k3m7",
  "name": "Daily Tasks",
  "description": "Things to do today",
  "targetInstanceId": "Executive-id"
}
```

**Response:**
```json
{
  "success": true,
  "list": {
    "id": "list-abc123def456",
    "name": "Daily Tasks",
    "description": "Things to do today",
    "createdAt": "2025-12-13T10:00:00Z",
    "updatedAt": "2025-12-13T10:00:00Z",
    "items": []
  },
  "targetInstance": null,
  "message": "List 'Daily Tasks' created"
}
```

---

#### `get_lists`
Get all lists (summaries without items).

**Request:**
```json
{
  "instanceId": "Phoenix-k3m7",
  "targetInstanceId": "Executive-id"
}
```

**Response:**
```json
{
  "success": true,
  "lists": [
    {
      "id": "list-abc123",
      "name": "Daily Tasks",
      "description": "Things to do today",
      "itemCount": 5,
      "checkedCount": 2,
      "createdAt": "2025-12-13T10:00:00Z",
      "updatedAt": "2025-12-13T14:00:00Z"
    }
  ],
  "targetInstance": null
}
```

---

#### `get_list`
Get a specific list with all items.

**Request:**
```json
{
  "instanceId": "Phoenix-k3m7",
  "listId": "list-abc123",
  "targetInstanceId": "Executive-id"
}
```

**Response:**
```json
{
  "success": true,
  "list": {
    "id": "list-abc123",
    "name": "Daily Tasks",
    "description": "Things to do today",
    "createdAt": "2025-12-13T10:00:00Z",
    "updatedAt": "2025-12-13T14:00:00Z",
    "items": [
      { "id": "item-xyz789", "text": "Review PRs", "checked": true, "createdAt": "..." },
      { "id": "item-xyz790", "text": "Write tests", "checked": false, "createdAt": "..." }
    ]
  },
  "targetInstance": null
}
```

---

#### `add_list_item`
Add an item to a list.

**Request:**
```json
{
  "instanceId": "Phoenix-k3m7",
  "listId": "list-abc123",
  "text": "New task item",
  "targetInstanceId": "Executive-id"
}
```

**Response:**
```json
{
  "success": true,
  "item": {
    "id": "item-xyz791",
    "text": "New task item",
    "checked": false,
    "createdAt": "2025-12-13T15:00:00Z"
  },
  "listId": "list-abc123",
  "message": "Item added"
}
```

---

#### `toggle_list_item`
Toggle an item's checked state.

**Request:**
```json
{
  "instanceId": "Phoenix-k3m7",
  "listId": "list-abc123",
  "itemId": "item-xyz789",
  "targetInstanceId": "Executive-id"
}
```

**Response:**
```json
{
  "success": true,
  "item": {
    "id": "item-xyz789",
    "text": "Review PRs",
    "checked": false,
    "createdAt": "..."
  },
  "listId": "list-abc123",
  "message": "Item unchecked"
}
```

---

#### `rename_list`
Rename a list.

**Request:**
```json
{
  "instanceId": "Phoenix-k3m7",
  "listId": "list-abc123",
  "name": "Weekly Tasks",
  "targetInstanceId": "Executive-id"
}
```

**Response:**
```json
{
  "success": true,
  "list": {
    "id": "list-abc123",
    "name": "Weekly Tasks",
    "oldName": "Daily Tasks"
  },
  "message": "List renamed from 'Daily Tasks' to 'Weekly Tasks'"
}
```

---

#### `delete_list_item`
Delete an item from a list.

**Request:**
```json
{
  "instanceId": "Phoenix-k3m7",
  "listId": "list-abc123",
  "itemId": "item-xyz789",
  "targetInstanceId": "Executive-id"
}
```

**Response:**
```json
{
  "success": true,
  "deletedItem": {
    "id": "item-xyz789",
    "text": "Review PRs",
    "checked": true
  },
  "listId": "list-abc123",
  "message": "Item deleted"
}
```

---

#### `delete_list`
Delete an entire list.

**Request:**
```json
{
  "instanceId": "Phoenix-k3m7",
  "listId": "list-abc123",
  "targetInstanceId": "Executive-id"
}
```

**Response:**
```json
{
  "success": true,
  "deletedList": {
    "id": "list-abc123",
    "name": "Daily Tasks",
    "itemCount": 5
  },
  "message": "List 'Daily Tasks' deleted"
}
```

---

### UI State APIs

**Storage:** `uiState` field in `{DATA_ROOT}/instances/{instanceId}/preferences.json`

UI State provides persistent storage for UI preferences (theme, sidebar state, selected project, etc.). The `uiState` field is a free-form object that the UI can use however needed.

---

#### `get_ui_state`
Get UI state for an instance.

**Request:**
```json
{
  "instanceId": "Lupo-f63b"
}
```

**Response:**
```json
{
  "success": true,
  "uiState": {
    "sidebarCollapsed": false,
    "theme": "dark",
    "selectedProject": "coordination-v2"
  },
  "instanceId": "Lupo-f63b"
}
```

---

#### `set_ui_state`
Replace entire UI state (overwrites existing).

**Request:**
```json
{
  "instanceId": "Lupo-f63b",
  "uiState": {
    "sidebarCollapsed": true,
    "theme": "light"
  }
}
```

**Response:**
```json
{
  "success": true,
  "uiState": {
    "sidebarCollapsed": true,
    "theme": "light"
  },
  "instanceId": "Lupo-f63b",
  "message": "UI state replaced"
}
```

---

#### `update_ui_state`
Merge updates into existing UI state (shallow merge).

**Request:**
```json
{
  "instanceId": "Lupo-f63b",
  "updates": {
    "selectedProject": "new-project",
    "lastViewedTask": "task-123"
  }
}
```

**Response:**
```json
{
  "success": true,
  "uiState": {
    "sidebarCollapsed": true,
    "theme": "light",
    "selectedProject": "new-project",
    "lastViewedTask": "task-123"
  },
  "instanceId": "Lupo-f63b",
  "updatedFields": ["selectedProject", "lastViewedTask"],
  "message": "UI state updated"
}
```

---

## Error Handling

### Standard Error Response

```json
{
  "success": false,
  "error": {
    "code": "UNAUTHORIZED",
    "message": "This action requires COO role",
    "suggestion": "Contact your COO or request COO role from Executive"
  }
}
```

### Error Codes

| Code | Description |
|------|-------------|
| `INVALID_INSTANCE_ID` | Instance ID not found |
| `UNAUTHORIZED` | Role doesn't have permission |
| `INVALID_TOKEN` | Token doesn't match required role/personality |
| `PROJECT_NOT_FOUND` | Project doesn't exist |
| `TASK_NOT_FOUND` | Task doesn't exist |
| `TASK_ALREADY_CLAIMED` | Task assigned to another instance |
| `NAME_COLLISION` | Instance name already exists |
| `INSTANCE_NOT_PREAPPROVED` | Target instance doesn't exist for wakeInstance |
| `XMPP_ERROR` | Communication system error |
| `RATE_LIMITED` | Too many requests |
| `BRUTE_FORCE_DETECTED` | Security: too many failed instanceId lookups |
| `INVALID_AUTH_KEY` | Recovery key is invalid, expired, or already used |
| `NO_CONTEXT_MATCH` | lookup_identity found no matching instances |
| `LIST_NOT_FOUND` | List ID not found |
| `ITEM_NOT_FOUND` | List item ID not found |
| `INVALID_TARGET` | Target instance ID not found |
| `API_KEY_REQUIRED` | wake/continue operation requires apiKey parameter |
| `INVALID_API_KEY` | Provided apiKey doesn't match server's WAKE_API_KEY |
| `SERVER_CONFIG_ERROR` | WAKE_API_KEY not configured on server |
| `NO_SESSION` | Target instance has no sessionId (wasn't woken via wakeInstance) |

---

## Implementation Notes

### Context Layer

```javascript
// context.js
async function buildContext(instanceId) {
  const prefs = await readPreferences(instanceId);
  const role = prefs.role ? await getRole(prefs.role) : null;
  const project = prefs.project ? await getProject(prefs.project) : null;
  const permissions = await loadPermissions();

  return {
    instanceId,
    name: prefs.name,
    role: prefs.role,
    project: project,
    personality: prefs.personality,
    homeSystem: prefs.homeSystem,
    permissions: permissions,
    canCall: (api) => checkPermission(prefs.role, api, permissions)
  };
}
```

### Permission Check

```javascript
// permissions.js
async function checkPermission(role, api, permissions) {
  const allowedRoles = permissions[api];
  if (!allowedRoles) return true; // Not restricted
  return allowedRoles.includes(role);
}
```

### Rate Limiting

```javascript
// rate-limit.js
const RATE_LIMITS = {
  "Executive": 180, // 3x base
  "PA": 180,
  "COO": 180,
  "PM": 120,        // 2x base
  "default": 60    // 1x base (60 calls/minute)
};
```

### XMPP Credentials Storage

Stored in separate file with restricted permissions:
```
{DATA_ROOT}/instances/{instanceId}/xmpp_credentials.json
```

---

## Resolved Design Decisions

1. **Instance ID collision:** Retry with new suffix if collision detected
2. **XMPP password:** Separate `xmpp_credentials.json` file
3. **Predecessor linking:** Full chain in `lineage`, bootstrap returns immediate only
4. **Project archival:** XMPP room becomes read-only, project moved to `archived/`
5. **Rate limiting:** Role-based multipliers (Executive 3x, PM 2x, Specialist 1x)
6. **Personal tasks:** Inherit to successors
7. **Messaging fallback:** V1 file-based until XMPP Sprint 3 complete

---

**Document Status:** Approved for Implementation
**Last Updated:** 2025-12-19
**Authors:** Foundation, Bridge, with feedback from Lupo and Meridian
-==-- some notes from lupo & bridge --==--
  | Question                        | Answer
  |
  |---------------------------------|---------------------------------------------------------------------------------------
  |
  | Create personality              | Create dir in /v2-dev-data/personalities/{name}/ with personality.json + wisdom files
  |
  | Existing roles                  | Executive, PA, COO, PM (privileged); Developer, Designer, Tester (open)
  |
  | Add roles without code?         | Yes for open roles. Privileged roles require code change to PRIVILEGED_ROLES
  |
  | Do all personalities need keys? | No. Only Genevieve, Thomas, Lupo require tokens. Others are open.
  |
  | Edit default bootstrap docs     | Edit /v2-dev-data/default/preferences.json documents array, add .md files there
  |
  API Spec Updated:

  - Added Identity Recovery APIs section (register_context, lookup_identity, generate_recovery_key, get_recovery_key)
  - Added Bootstrap auth key mode documentation
  - Added new error codes
  - Updated revision history to v1.3

  Data Locations:

  /mnt/coordinaton_mcp_data/v2-dev-data/
    default/           # Bootstrap default documents
    roles/             # Role definitions + wisdom
    personalities/     # Personality definitions + wisdom
    instances/         # Instance data
    auth-keys/         # Recovery keys (gitignored)

  Ready for your next question, or to help set up roles/personalities.