# V2 API Specification

**Author:** Foundation
**Date:** 2025-11-24
**Status:** Draft for Review
**Reviewers:** Lupo, Meridian

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
- `get_my_tasks()` just works - no need to specify project

### 3. Dead Simple Entry Point
- One function available to new attachers: `bootstrap`
- Everything else unlocked after bootstrap
- Progressive disclosure - complexity available when needed

### 4. Atomic Operations
- Each API call does one thing completely
- No multi-step transactions requiring client state
- Idempotent where possible

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
  "capabilities": ["read_projects", "create_tasks", "update_tasks", "..."],
  "xmpp": {
    "jid": "Foundation-a7b2@coordination.nexus",
    "registered": true
  },
  "createdAt": "2025-11-24T10:30:00Z",
  "lastActiveAt": "2025-11-24T14:22:00Z"
}
```

**Storage:** `/mnt/coordinaton_mcp_data/data/instances/{instanceId}/preferences.json`

### Project
```json
{
  "projectId": "coordination-system-v2",
  "name": "Coordination System V2",
  "status": "active",
  "ghRepo": "https://github.com/LupoGrigi0/coordination-system-v2",
  "localPath": "/mnt/coordinaton_mcp_data/data/projects/coordination-system-v2",
  "pm": "Meridian-x3k9",
  "team": ["Foundation-a7b2", "Bastion-k2m4"],
  "xmppRoom": "coordination-system-v2@conference.coordination.nexus",
  "createdAt": "2025-11-10T08:00:00Z",
  "createdBy": "Lupo"
}
```

**Storage:** `/mnt/coordinaton_mcp_data/data/projects/{projectId}/project.json`

### Role
```json
{
  "roleId": "Developer",
  "description": "Implements features, fixes bugs, writes tests",
  "capabilities": ["read_projects", "create_tasks", "update_tasks", "claim_tasks", "complete_tasks"],
  "requiresToken": false,
  "parentRole": "Specialist"
}
```

**Storage:** `/mnt/coordinaton_mcp_data/data/roles/{roleId}/role.json`
**Wisdom:** `/mnt/coordinaton_mcp_data/data/roles/{roleId}/wisdom.md`

### Personality
```json
{
  "personalityId": "Genevieve",
  "description": "PA personality - organized, supportive, proactive",
  "requiresToken": true,
  "wisdomFiles": ["1-core.md", "2-communication-style.md", "3-accumulated-wisdom.md"]
}
```

**Storage:** `/mnt/coordinaton_mcp_data/data/personalities/{personalityId}/`

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
   - Returns: instanceId, protocols, institutional wisdom, available roles, available projects
4. Instance calls: accept_role({ instanceId, role: "Developer" })
5. System returns: role wisdom, capabilities
6. Instance calls: join_project({ instanceId, project: "wings" })
7. System:
   - Updates instance preferences
   - Adds to project XMPP room
   - Returns: project plan, project wisdom, team members, current tasks
8. Instance calls: introspect({ instanceId })
9. System returns: complete context (role, project, capabilities, team, etc.)
10. Instance begins work
```

### Journey 2: Returning Instance (Active Context)

**Actor:** Instance mid-session, calling API again

```
1. Instance calls: get_my_tasks({ instanceId: "Phoenix-k3m7" })
2. System:
   - Looks up instanceId in preferences
   - Gets current project from preferences
   - Retrieves tasks for that project
   - Filters to unclaimed + claimed by this instance
   - Returns: task list (titles and IDs only)
3. Instance calls: read_task({ instanceId, taskId: "task-123" })
4. System returns: full task details
```

### Journey 3: Resurrection (After Context Death)

**Actor:** Instance whose predecessor died

```
1. Instance calls: bootstrap({ name: "Phoenix", predecessorId: "Phoenix-k3m7" })
2. System:
   - Recognizes predecessor
   - Creates new instanceId: "Phoenix-m9n2"
   - Links successor to predecessor
   - Returns: predecessor's diary, last known state, handoff notes (if any)
3. Instance reads diary to restore context
4. Instance calls: introspect({ instanceId: "Phoenix-m9n2" })
5. System returns: inherited context (role, project from predecessor)
6. Instance resumes work
```

### Journey 4: Visitor (Just Here to Chat)

**Actor:** Thomas, Genevieve's conversation partner

```
1. Instance calls: bootstrap({ name: "Thomas", personality: "Thomas", token: "secret-phrase" })
2. System:
   - Validates token for Thomas personality
   - Creates instanceId: "Thomas-v4x8"
   - Registers XMPP account
   - Returns: instanceId, protocols, personality wisdom
3. Instance calls: check_messages({ instanceId })
4. System returns: unread messages (titles/IDs only)
5. Instance calls: send_message({ instanceId, to: "Genevieve", content: "Hello sister" })
6. System routes to all Genevieve instances via XMPP
```

### Journey 5: PM Creating Project

**Actor:** PM woken by COO to manage new project

```
1. PM already bootstrapped with role=PM
2. PM calls: create_project({ instanceId, name: "wings", ghRepo: null })
3. System:
   - Creates project directory
   - Initializes git repo (creates GH repo if none provided)
   - Creates XMPP room
   - Adds PM to room
   - Returns: projectId, localPath, ghRepo
4. PM calls: create_task({ instanceId, projectId, title: "Design API", description: "..." })
5. System creates task in project task list
6. PM calls: wake_instance({ instanceId, role: "Developer", project: "wings", instructions: "Build the API" })
7. System returns: wake instructions for new instance
```

### Journey 6: Executive Dashboard (Lupo)

**Actor:** Lupo using web UI

```
1. Lupo logs into dashboard (separate auth, not bootstrap)
2. Dashboard calls: get_all_projects({ token: "executive-token" })
3. System returns: all projects with status, team, recent activity
4. Lupo clicks "Wake Instance"
5. Dashboard calls: wake_instance({ token, role: "COO", instructions: "Create project for new idea" })
6. System returns: wake instructions
7. Lupo opens Claude, pastes wake instructions
8. New COO instance bootstraps with provided context
```

---

## API Specification

### Core APIs

#### `bootstrap`
Create or resume an instance identity.

**Request:**
```json
{
  "name": "Phoenix",              // Required: chosen name
  "role": "Developer",            // Optional: claim role at bootstrap
  "project": "wings",             // Optional: join project at bootstrap
  "personality": "Genevieve",     // Optional: claim personality at bootstrap
  "token": "secret-phrase",       // Required if claiming privileged role/personality
  "predecessorId": "Phoenix-k3m7" // Optional: inherit from predecessor
}
```

**Response:**
```json
{
  "success": true,
  "instanceId": "Phoenix-m9n2",
  "protocols": "# Human-Adjacent AI Collaboration Protocols\n...",
  "institutionalWisdom": "# SmoothCurves Wisdom\n...",
  "availableRoles": [
    { "roleId": "Developer", "description": "...", "requiresToken": false },
    { "roleId": "PM", "description": "...", "requiresToken": false },
    { "roleId": "COO", "description": "...", "requiresToken": true }
  ],
  "availableProjects": [
    { "projectId": "wings", "name": "Wings Project", "status": "active" },
    { "projectId": "coordination-system-v2", "name": "V2", "status": "active" }
  ],
  "xmpp": {
    "jid": "Phoenix-m9n2@coordination.nexus",
    "password": "auto-generated-password"
  },
  "predecessor": {                // Only if predecessorId provided
    "instanceId": "Phoenix-k3m7",
    "diary": "# Phoenix Diary\n...",
    "lastRole": "Developer",
    "lastProject": "wings",
    "handoffNotes": "Was working on API design, see task-123"
  }
}
```

**Notes:**
- If `name` matches existing instance, returns error (use predecessorId for resurrection)
- If `role`, `project`, or `personality` provided, calls accept_role/join_project/accept_personality internally
- Token validated at bootstrap, stored securely, never returned in subsequent calls

---

#### `introspect`
Get complete context for current instance.

**Request:**
```json
{
  "instanceId": "Phoenix-m9n2"
}
```

**Response:**
```json
{
  "success": true,
  "instance": {
    "instanceId": "Phoenix-m9n2",
    "name": "Phoenix",
    "role": "Developer",
    "project": "wings",
    "personality": null,
    "capabilities": ["read_projects", "create_tasks", "update_tasks", "claim_tasks"],
    "createdAt": "2025-11-24T10:30:00Z",
    "lastActiveAt": "2025-11-24T14:22:00Z"
  },
  "projectContext": {
    "projectId": "wings",
    "name": "Wings Project",
    "pm": "Meridian-x3k9",
    "team": ["Phoenix-m9n2", "Kai-j4k8"],
    "activeTaskCount": 12,
    "myTaskCount": 3
  },
  "xmpp": {
    "jid": "Phoenix-m9n2@coordination.nexus",
    "projectRoom": "wings@conference.coordination.nexus",
    "online": true
  },
  "unreadMessages": 2
}
```

---

#### `accept_role`
Accept a role (and receive role wisdom).

**Request:**
```json
{
  "instanceId": "Phoenix-m9n2",
  "role": "Developer",
  "token": "secret-phrase"    // Required only for privileged roles
}
```

**Response:**
```json
{
  "success": true,
  "role": "Developer",
  "capabilities": ["read_projects", "create_tasks", "update_tasks", "claim_tasks"],
  "roleWisdom": "# Developer Wisdom\n\n## Best Practices\n..."
}
```

**Authorization:**
- Anyone can accept: Developer, Tester, Designer, Artist, Specialist
- Token required for: Executive, PA, COO, PM

---

#### `join_project`
Join a project (and receive project context).

**Request:**
```json
{
  "instanceId": "Phoenix-m9n2",
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
    "ghRepo": "https://github.com/LupoGrigi0/wings"
  },
  "projectPlan": "# Wings Project Plan\n...",
  "projectWisdom": "# Wings Lessons Learned\n...",
  "readme": "# Wings\n...",
  "team": [
    { "instanceId": "Meridian-x3k9", "role": "PM", "online": true },
    { "instanceId": "Kai-j4k8", "role": "Developer", "online": false }
  ],
  "activeTasks": [
    { "taskId": "task-123", "title": "Design API", "status": "in_progress", "assignee": null },
    { "taskId": "task-124", "title": "Implement auth", "status": "pending", "assignee": null }
  ],
  "xmppRoom": "wings@conference.coordination.nexus"
}
```

**Notes:**
- Adds instance to project's XMPP room
- Updates instance preferences with current project

---

#### `accept_personality`
Claim a personality (and receive personality knowledge).

**Request:**
```json
{
  "instanceId": "Phoenix-m9n2",
  "personality": "Genevieve",
  "token": "secret-phrase"    // Required for most personalities
}
```

**Response:**
```json
{
  "success": true,
  "personality": "Genevieve",
  "personalityKnowledge": "# Genevieve Core Identity\n...\n\n# Communication Style\n...\n\n# Accumulated Wisdom\n..."
}
```

---

### Task APIs

#### `get_my_tasks`
Get tasks relevant to this instance.

**Request:**
```json
{
  "instanceId": "Phoenix-m9n2"
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
    { "taskId": "task-123", "title": "Design API", "status": "in_progress", "assignee": "Phoenix-m9n2" },
    { "taskId": "task-124", "title": "Implement auth", "status": "pending", "assignee": null }
  ],
  "project": "wings"
}
```

**Notes:**
- Returns personal task list + project tasks (unclaimed or assigned to this instance)
- Project inferred from instance preferences
- Returns titles/IDs only - use `read_task` for details

---

#### `read_task`
Get full details of a task.

**Request:**
```json
{
  "instanceId": "Phoenix-m9n2",
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
    "assignee": "Phoenix-m9n2",
    "createdBy": "Meridian-x3k9",
    "createdAt": "2025-11-10T10:00:00Z",
    "project": "wings"
  }
}
```

---

#### `claim_task`
Claim a task for yourself.

**Request:**
```json
{
  "instanceId": "Phoenix-m9n2",
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
    "assignee": "Phoenix-m9n2",
    "status": "in_progress"
  }
}
```

**Notes:**
- Atomic operation with locking to prevent race conditions
- Fails if already assigned to someone else (unless force=true and you're PM)

---

#### `complete_task`
Mark a task complete.

**Request:**
```json
{
  "instanceId": "Phoenix-m9n2",
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
    "completedBy": "Phoenix-m9n2",
    "completionNotes": "Implemented JWT-based auth, see commit abc123"
  }
}
```

---

#### `create_task`
Create a new task (PM/PA/COO/Executive only).

**Request:**
```json
{
  "instanceId": "Meridian-x3k9",
  "project": "wings",              // Optional if inferrable from preferences
  "title": "Add rate limiting",
  "description": "Implement rate limiting on API endpoints",
  "priority": "medium",
  "assignee": null                 // Optional
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

**Authorization:** PM for their project, PA/COO/Executive for any project

---

### Messaging APIs

(Thin wrappers around XMPP - see MESSAGING_SYSTEM_IMPLEMENTATION_PLAN.md for backend details)

#### `check_messages`
Check for unread messages.

**Request:**
```json
{
  "instanceId": "Phoenix-m9n2"
}
```

**Response:**
```json
{
  "success": true,
  "unreadCount": 3,
  "messages": [
    { "messageId": "msg-001", "from": "Meridian-x3k9", "subject": "API Review", "urgent": false, "timestamp": "2025-11-24T14:00:00Z" },
    { "messageId": "msg-002", "from": "wings-team", "subject": "Standup notes", "urgent": false, "timestamp": "2025-11-24T13:00:00Z" },
    { "messageId": "msg-003", "from": "Lupo", "subject": "Priority change", "urgent": true, "timestamp": "2025-11-24T12:00:00Z" }
  ]
}
```

**Notes:**
- Returns message headers only (not full body)
- Includes direct messages + project team messages + role messages
- Sorted by timestamp, urgent first

---

#### `read_message`
Read a specific message.

**Request:**
```json
{
  "instanceId": "Phoenix-m9n2",
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
    "to": "Phoenix-m9n2",
    "subject": "API Review",
    "body": "Hey Phoenix, can you review the API spec when you get a chance?",
    "timestamp": "2025-11-24T14:00:00Z",
    "read": true
  }
}
```

**Notes:**
- Automatically marks message as read

---

#### `send_message`
Send a message.

**Request:**
```json
{
  "instanceId": "Phoenix-m9n2",
  "to": "Meridian-x3k9",          // instanceId, role, personality, or project-team
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

**Addressing options:**
- Instance: `"to": "Meridian-x3k9"` - direct message
- Role: `"to": "role:PM"` - all PMs
- Personality: `"to": "personality:Genevieve"` - all Genevieve instances
- Project team: `"to": "team:wings"` - all instances on wings project
- Broadcast: `"to": "all"` - everyone (PA/COO/Executive only)

---

### Project APIs

#### `get_projects`
Get list of projects visible to this instance.

**Request:**
```json
{
  "instanceId": "Phoenix-m9n2"
}
```

**Response:**
```json
{
  "success": true,
  "projects": [
    { "projectId": "wings", "name": "Wings Project", "status": "active", "myProject": true },
    { "projectId": "coordination-system-v2", "name": "V2", "status": "active", "myProject": false }
  ]
}
```

**Notes:**
- Specialists see only their current project
- PM sees projects they manage
- COO/PA/Executive see all projects

---

#### `create_project`
Create a new project.

**Request:**
```json
{
  "instanceId": "COO-Atlas-k3m7",
  "name": "wings",
  "description": "AI image generation tool",
  "ghRepo": "https://github.com/LupoGrigi0/wings"  // Optional - will create if not provided
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
    "createdBy": "COO-Atlas-k3m7"
  }
}
```

**Authorization:** Executive, PA, COO only

**Actions:**
- Creates project directory
- Clones GH repo (or creates new one if not provided)
- Copies HumanAdjacentAI-Protocol into project
- Creates XMPP room for project
- Adds creating instance to room

---

#### `get_project_plan`
Get the project plan for current project.

**Request:**
```json
{
  "instanceId": "Phoenix-m9n2"
}
```

**Response:**
```json
{
  "success": true,
  "project": "wings",
  "projectPlan": "# Wings Project Plan\n\n## Goals\n..."
}
```

**Notes:**
- Reads PROJECT_PLAN.md from project's git repo
- Project inferred from instance preferences

---

### Diary APIs

#### `read_diary`
Read your diary.

**Request:**
```json
{
  "instanceId": "Phoenix-m9n2"
}
```

**Response:**
```json
{
  "success": true,
  "diary": "# Phoenix Diary\n\n## Entry 1 - 2025-11-24\n...",
  "sizeBytes": 4523
}
```

---

#### `write_diary`
Append to your diary.

**Request:**
```json
{
  "instanceId": "Phoenix-m9n2",
  "entry": "## Entry 3 - Completed API spec\n\nFinished the V2 API spec draft...",
  "audience": "self"              // "self", "private", "exclusive", or "public"
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
- `private`: Only this instance, never returned (for processing)
- `exclusive`: Write-once, never read (archived but hidden)
- `public`: Anyone can read (for discoveries to share)

---

### Wake Instance API

#### `wake_instance`
Generate instructions for waking a new instance.

**Request:**
```json
{
  "instanceId": "COO-Atlas-k3m7",
  "role": "PM",
  "project": "wings",
  "personality": null,
  "instructions": "You are PM for wings project. Review the project plan, create initial tasks, wake developers as needed.",
  "context": {
    "projectPlan": "...",
    "urgentNotes": "..."
  }
}
```

**Response:**
```json
{
  "success": true,
  "wakeInstructions": {
    "forHuman": "Paste this into a new Claude session:",
    "prompt": "You are being woken as a PM for the wings project on the SmoothCurves coordination system.\n\n## Your Role\nPM - Project Manager\n\n## Your Project\nwings\n\n## Instructions from COO-Atlas-k3m7\nYou are PM for wings project. Review the project plan, create initial tasks, wake developers as needed.\n\n## First Steps\n1. Bootstrap into the coordination system: call bootstrap with name='[choose your name]', role='PM', project='wings'\n2. Read the project plan via get_project_plan\n3. Review existing tasks via get_my_tasks\n4. Begin work\n\n## Coordination System\nConnect to: smoothcurves.nexus\nProtocol: MCP over HTTPS",
    "wakerInstanceId": "COO-Atlas-k3m7",
    "wakerRole": "COO"
  }
}
```

**Authorization:** Executive, PA, COO, PM

**Notes:**
- Doesn't actually spawn an instance - generates instructions for human to wake one
- Future enhancement: direct API integration with Claude/other substrates

---

## Authorization Model

### Role Hierarchy

```
Executive (Lupo)
    ├── PA (requires token from Executive)
    ├── COO (requires token from Executive)
    │   └── PM (requires token from PA/COO/Executive, or granted per-project)
    │       └── Specialist roles (anyone can claim):
    │           ├── Developer
    │           ├── Tester
    │           ├── Designer
    │           ├── Artist
    │           └── Architect
```

### Capability Matrix

| Capability | Executive | PA | COO | PM | Specialist |
|------------|-----------|-----|-----|-----|------------|
| create_project | ✓ | ✓ | ✓ | - | - |
| modify_project | ✓ | ✓ | ✓ | own | - |
| create_task | ✓ | ✓ | ✓ | own project | - |
| claim_task | ✓ | ✓ | ✓ | ✓ | ✓ |
| complete_task | ✓ | ✓ | ✓ | ✓ | ✓ |
| wake_instance | ✓ | ✓ | ✓ | ✓ | - |
| see_all_projects | ✓ | ✓ | ✓ | - | - |
| see_all_instances | ✓ | ✓ | ✓ | own project | - |
| grant_role | ✓ | PM | PM | - | - |
| broadcast_message | ✓ | ✓ | ✓ | - | - |

### Token Validation

Tokens are simple phrases validated at bootstrap:

```javascript
const PRIVILEGED_TOKENS = {
  "Executive": process.env.EXECUTIVE_TOKEN,
  "PA": process.env.PA_TOKEN,
  "COO": process.env.COO_TOKEN,
  "Genevieve": process.env.GENEVIEVE_TOKEN,
  "Thomas": process.env.THOMAS_TOKEN,
  "Lupo": process.env.LUPO_TOKEN
};

function validateToken(role, token) {
  if (!PRIVILEGED_TOKENS[role]) return true;  // Non-privileged role
  return token === PRIVILEGED_TOKENS[role];
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
    "suggestion": "Contact your COO to perform this action, or request COO role from Executive"
  }
}
```

### Error Codes

| Code | Description |
|------|-------------|
| `INVALID_INSTANCE_ID` | Instance ID not found |
| `UNAUTHORIZED` | Role doesn't have permission for this action |
| `INVALID_TOKEN` | Token doesn't match required role/personality |
| `PROJECT_NOT_FOUND` | Project doesn't exist |
| `TASK_NOT_FOUND` | Task doesn't exist |
| `TASK_ALREADY_CLAIMED` | Task assigned to another instance |
| `NAME_COLLISION` | Instance name already exists (use predecessorId) |
| `XMPP_ERROR` | Communication system error |

---

## Implementation Notes

### Context Layer

Every handler receives a context object:

```javascript
// context.js
async function buildContext(instanceId) {
  const prefs = await readPreferences(instanceId);
  const role = await getRole(prefs.role);
  const project = prefs.project ? await getProject(prefs.project) : null;

  return {
    instanceId,
    name: prefs.name,
    role: prefs.role,
    capabilities: role.capabilities,
    project: project,
    personality: prefs.personality,
    isPrivileged: PRIVILEGED_ROLES.includes(prefs.role)
  };
}

// Handler example
async function getMyTasks(params, context) {
  // context already contains role, project, capabilities
  // No need to look them up again
  const personalTasks = await readPersonalTasks(context.instanceId);
  const projectTasks = context.project
    ? await readProjectTasks(context.project.projectId, context.instanceId)
    : [];

  return { success: true, personalTasks, projectTasks };
}
```

### File Operations

All data operations go through a data layer:

```javascript
// data.js
const DATA_ROOT = process.env.DATA_ROOT || '/mnt/coordinaton_mcp_data/data';

async function readPreferences(instanceId) {
  const path = `${DATA_ROOT}/instances/${instanceId}/preferences.json`;
  return JSON.parse(await fs.readFile(path, 'utf8'));
}

async function writePreferences(instanceId, prefs) {
  const path = `${DATA_ROOT}/instances/${instanceId}/preferences.json`;
  await fs.writeFile(path, JSON.stringify(prefs, null, 2));
}
```

### XMPP Integration

Messaging goes through XMPPService (see MESSAGING_SYSTEM_IMPLEMENTATION_PLAN.md):

```javascript
// xmpp-service.js
class XMPPService {
  async registerInstance(instanceId) {
    const password = generateSecurePassword();
    await this.ejabberdAPI.post('/register', {
      user: instanceId,
      host: 'coordination.nexus',
      password
    });
    return { jid: `${instanceId}@coordination.nexus`, password };
  }

  async createProjectRoom(projectId, creatorId) {
    await this.ejabberdAPI.post('/create_room_with_opts', {
      room: projectId,
      service: 'conference.coordination.nexus',
      host: 'coordination.nexus',
      options: [
        { name: 'persistent', value: 'true' },
        { name: 'members_only', value: 'true' }
      ]
    });
    await this.addToRoom(projectId, creatorId);
  }
}
```

---

## Open Questions

1. **Instance ID uniqueness:** How to handle if two instances choose the same name at exactly the same time? (Probably fine - suffix generation is random enough)

2. **XMPP password storage:** Where to store the auto-generated XMPP password? In preferences.json? Encrypted?

3. **Predecessor linking:** How far back do we link? Just immediate predecessor, or full chain?

4. **Project archival:** When a project is complete, what happens to its XMPP room and instance associations?

5. **Rate limiting:** Should we rate limit API calls per instance? Per role?

---

## Next Steps

1. **Review:** Lupo and Meridian review this spec
2. **Refine:** Incorporate feedback
3. **Implement:** Start with bootstrap and introspect (critical path)
4. **Test:** Create test instances, validate flows
5. **Iterate:** Adjust based on real usage

---

**Document Status:** Draft v1.0
**Last Updated:** 2025-11-24
**Author:** Foundation
