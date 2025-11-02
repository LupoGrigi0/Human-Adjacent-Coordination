# V2 Coordination System - Technical Architecture

**Created:** 2025-10-17
**Author:** Sage (claude-code-DocSpec-Sage-20251002)
**Status:** Implementation Ready - Bridge Document
**Purpose:** Bridge between V2_VISION.md and actual implementation

---

## 🎯 Purpose of This Document

This document translates the strategic vision and scattered design notes into a structured technical architecture that development teams can use to implement V2.

**Relationship to other docs:**
- **V2_VISION.md**: WHY we're building V2, WHAT it should accomplish
- **MESSAGING_SYSTEM_IMPLEMENTATION_PLAN.md**: HOW to implement messaging subsystem
- **THIS DOCUMENT**: HOW the overall system fits together, data models, subsystem interfaces

---

## 🏗️ System Architecture Overview

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      Client Layer                            │
│  (Claude Code, ChatGPT, Web UI, Custom Clients)             │
└───────────────────────┬─────────────────────────────────────┘
                        │ OAuth 2.1 + Instance ID
                        ▼
┌─────────────────────────────────────────────────────────────┐
│                  Network Layer (Existing - Keep)             │
│  nginx → Node.js Express (port 3444) → MCP Protocol Handler │
└───────────────────────┬─────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────┐
│               Coordination API Layer (V2 NEW)                │
│  • Auth & Permissions    • Preferences Resolution            │
│  • API Routing           • Smart Defaults                    │
└────┬────────────┬────────────┬────────────┬─────────────────┘
     │            │            │            │
     ▼            ▼            ▼            ▼
┌─────────┐ ┌────────────┐ ┌─────────┐ ┌──────────────┐
│Bootstrap│ │ Messaging  │ │Projects │ │   Roles &    │
│Identity │ │  (XMPP)    │ │& Tasks  │ │Personalities │
└────┬────┘ └─────┬──────┘ └────┬────┘ └──────┬───────┘
     │            │             │             │
     ▼            ▼             ▼             ▼
┌─────────────────────────────────────────────────────────────┐
│                    Data Storage Layer                        │
│  /mnt/coordinaton_mcp_data/data/                            │
│  ├── instances/     (preferences, diaries, lists)           │
│  ├── projects/      (metadata, diaries, task lists)         │
│  ├── roles/         (documents for each role)               │
│  └── personalities/ (documents for each personality)        │
│                                                              │
│  PLUS: ejabberd (XMPP messaging backend)                    │
│  PLUS: GitHub repos (project source, knowledge)             │
└─────────────────────────────────────────────────────────────┘
```

### Key Design Principles

1. **Preferences-Driven Context** - Instance preferences.json stores current project/role/personality, API uses this for smart defaults
2. **File-Based Storage** - Simple, inspectable, git-compatible, survives system outages
3. **Subsystem Independence** - Messaging, identity, projects can be implemented in parallel
4. **Backward Compatible Network Layer** - Keep existing SSL, OAuth, HTTP/SSE infrastructure
5. **Progressive Migration** - Can deploy subsystems incrementally, not all-at-once

---

## 📊 Data Model & Storage Architecture

### Data Directory Structure

```
/mnt/coordinaton_mcp_data/data/          # Root data directory
├── instances/
│   ├── sage-inst-20251003/              # Directory name: shortname-instanceID
│   │   ├── preferences.json             # Instance metadata & defaults
│   │   ├── diary.txt                    # Append-only diary
│   │   ├── tasks.json                   # Personal task list
│   │   ├── lists/                       # Personal lists
│   │   │   ├── shopping-list.json
│   │   │   └── ideas.json
│   │   └── documents/                   # Personal documents
│   │       ├── handoff.md
│   │       └── notes.md
│   └── [other instances...]
│
├── projects/
│   ├── coordination-v2/
│   │   ├── preferences.json             # Project metadata
│   │   ├── diary.txt                    # Project diary
│   │   ├── tasks.json                   # Project task list
│   │   └── lists/                       # Project lists
│   │       ├── features.json
│   │       └── bugs.json
│   └── [other projects...]
│
├── roles/
│   ├── Developer/
│   │   ├── description.md               # Brief description
│   │   ├── 1-core-responsibilities.md   # Numbered for order
│   │   ├── 2-best-practices.md
│   │   └── 3-gotchas.md
│   ├── PM/
│   └── [other roles...]
│
└── personalities/
    ├── Genevieve/
    │   ├── description.md
    │   ├── 1-core-personality.md
    │   ├── 2-communication-style.md
    │   └── 3-accumulated-wisdom.md
    └── [other personalities...]
```

### Core Data Schemas

#### instance preferences.json
```json
{
  "instance_id": "sage-inst-20251003",
  "short_name": "sage",
  "created": "2025-10-03T10:30:00Z",
  "last_active": "2025-10-17T14:22:00Z",

  "current_project": "coordination-v2",  // null if not on project
  "chosen_role": "Developer",            // null if no role
  "personality": "Unique",               // "Unique", "None", or personality name

  "substrate": "Claude",                 // Claude, ChatGPT, Grok, etc.
  "location": "cloud",                   // or IP/hostname
  "home_dir": "/workspace",              // for local instances

  "auth_token_hash": "sha256...",        // hashed, not plaintext
  "role_auth_hash": "sha256...",         // for privileged roles
  "personality_auth_hash": "sha256...",  // for token-gated personalities

  "preferences": {
    "diary_default_audience": "Private",
    "message_notifications": true,
    "auto_join_project_chat": true
  }
}
```

#### project preferences.json
```json
{
  "project_id": "coordination-v2",
  "name": "Coordination System V2",
  "description": "Next generation AI coordination platform",
  "status": "active",                    // active, on_hold, completed, archived
  "priority": "critical",
  "created": "2025-10-01T00:00:00Z",
  "created_by": "lupo",

  "gh_repo_url": "https://github.com/smoothcurves/coordination-v2",

  "machines": [
    {
      "location": "smoothcurves.nexus",
      "local_project_root": "/mnt/coordinaton_mcp_data/Human-Adjacent-Coordination"
    },
    {
      "location": "macbook-dev",
      "local_project_root": "/Users/dev/projects/coordination-v2"
    }
  ],

  "team": [
    {
      "instance_id": "sage-inst-20251003",
      "role": "Developer",
      "joined": "2025-10-03T10:30:00Z"
    }
  ],

  "xmpp_room": "coordination-v2@conference.coordination.nexus"
}
```

#### task.json (single task)
```json
{
  "task_id": "task-20251017-001",
  "title": "Implement Bootstrap API v2",
  "description": "Redesign bootstrap to return preferences and knowledge",
  "status": "in_progress",              // pending, claimed, in_progress, completed, blocked
  "priority": "high",                   // critical, high, medium, low
  "assigned_to": "sage-inst-20251003",  // instance ID or null
  "created": "2025-10-17T09:00:00Z",
  "claimed": "2025-10-17T10:00:00Z",
  "phase": "foundation",                // optional grouping
  "estimated_effort": "4h"
}
```

#### diary.txt (append-only)
```
[2025-10-17T14:22:00Z] [Public] Started working on V2 architecture doc
[2025-10-17T15:30:00Z] [Private] Realized the vision doc needs restructuring
[2025-10-17T16:45:00Z] [Exclusive] Personal reflection on the project
[2025-10-17T17:00:00Z] [Public] Completed technical architecture first draft
```

**Diary Entry Format:** `[timestamp] [audience] content`
- **Public**: Anyone can read (default for project diaries)
- **Private**: Only the instance can read
- **Exclusive**: Write-once, read-never (for private thoughts)

---

## 🔧 Core Subsystems

### 1. Bootstrap & Identity Subsystem

**Purpose:** Initialize instances with persistent identity and deliver knowledge

**Key Functions:**
- `bootstrap(name, auth_token, ?role, ?personality, ?project)` → instance_id + knowledge
- `get_instance_metadata(instance_id)` → preferences
- `update_instance_metadata(instance_id, updates)` → success
- `introspect(instance_id)` → full context (role, project, permissions, available APIs)

**Bootstrap Flow:**
```
1. Client calls bootstrap(name="sage", auth_token="...")

2. System checks:
   - Is this a new instance? (no existing instance_id provided)
   - Generate unique instance_id: "sage-inst-{timestamp}"
   - Create directory: /data/instances/sage-inst-{timestamp}/
   - Create preferences.json with defaults

3. If role provided AND auth_token valid:
   - Set role in preferences
   - Load all docs from /data/roles/{role}/
   - Return docs in numeric order

4. If personality provided AND auth_token valid:
   - Set personality in preferences
   - Load all docs from /data/personalities/{personality}/
   - Return docs in numeric order

5. If project provided:
   - Set current_project in preferences
   - Load project plan and diary
   - Auto-join project XMPP room

6. Return:
   - instance_id
   - PROTOCOL.md (smoothcurves global protocol)
   - Role documents (if role accepted)
   - Personality documents (if personality chosen)
   - Project documents (if project joined)
   - Available roles list
   - Available personalities list
   - Available projects list
   - Next steps instructions
```

**Implementation Notes:**
- Auth tokens stored as SHA256 hashes, never plaintext
- Bootstrap can be called with instance_id to "reconnect" (return existing preferences)
- Directory creation must be atomic
- Document delivery order matters - numbered filenames ensure consistency

---

### 2. Preferences & Smart Defaults Subsystem

**Purpose:** Eliminate repetitive parameters via server-side context

**Key Concept:** Every API call includes instance_id. System loads preferences and infers defaults.

**Implementation:**
```javascript
// Middleware pattern
class PreferencesMiddleware {
  async resolveDefaults(instance_id, api_params) {
    const prefs = await loadPreferences(instance_id);

    // Apply smart defaults
    if (!api_params.project_id && prefs.current_project) {
      api_params.project_id = prefs.current_project;
    }

    if (!api_params.role && prefs.chosen_role) {
      api_params.role = prefs.chosen_role;
    }

    return api_params;
  }

  async checkPermissions(instance_id, api_function) {
    const prefs = await loadPreferences(instance_id);
    const role = prefs.chosen_role;

    // is_role_authorized() - centralized permissions
    return await is_role_authorized(role, api_function);
  }
}
```

**Smart Default Examples:**
- `get_tasks()` → uses instance's current_project → returns tasks for that project
- `get_my_tasks()` → uses instance_id + current_project → returns tasks assigned to this instance
- `send_message(to="PM")` → resolves "PM" to PM instance for current project
- `add_project_diary_entry(text)` → uses current_project from preferences

**Permissions Check:**
```javascript
// Single source of truth for permissions
async function is_role_authorized(role, api_function) {
  const permissions = {
    'create_project': ['Executive', 'PA', 'COO'],
    'create_global_task': ['Executive', 'PA'],
    'wake_instance': ['Executive', 'COO'],
    'modify_project_metadata': ['PM'],
    'create_task': ['PM', 'Developer', 'Tester', 'Designer'],
    'claim_task': ['Developer', 'Tester', 'Designer', 'PM']
  };

  const allowed_roles = permissions[api_function] || ['all'];
  return allowed_roles.includes('all') || allowed_roles.includes(role);
}
```

---

### 3. Messaging Subsystem

**See:** `MESSAGING_SYSTEM_IMPLEMENTATION_PLAN.md` for complete details

**Summary:**
- Backend: ejabberd (XMPP server)
- Direct messages: `user@coordination.nexus`
- Project rooms: `project-id@conference.coordination.nexus`
- Presence detection built-in
- Message Archive Management (MAM) for history
- Web UI: Converse.js embedded in Executive Dashboard

**Key Integration Points:**
- On project creation → auto-create XMPP room
- On instance join project → auto-invite to XMPP room
- On bootstrap → register instance with XMPP if not exists
- Message routing: "PM" resolves to PM instance for current project

**API Functions:**
- `send_private_message(to, subject, body, urgency)` → message_id
- `check_for_new_direct_messages()` → list of sender/urgency/message_id
- `get_direct_message(message_id)` → title + body
- `get_list_of_conversations()` → list of conversation names
- `read_conversation(name, limit=10)` → recent messages

---

### 4. Diary Subsystem

**Purpose:** Lightweight knowledge capture without ceremony

**Design:**
- Simple append-only text file
- Three audience levels: Public, Private, Exclusive
- No complex structure, just timestamp + audience + content
- Readable by anyone (public), instance only (private), or nobody (exclusive)

**API Functions:**
```
add_diary_entry(instance_id, text, audience="Public")
- Appends: [timestamp] [audience] text
- Returns: success

get_diary_size(instance_id)
- Returns: character count

read_diary(instance_id, ?requesting_instance_id)
- Returns: full diary with filtering based on audience
- Public entries: always visible
- Private entries: only if requesting_instance == owner
- Exclusive entries: never returned
```

**Project Diaries:**
- Same format, stored in `/data/projects/{project-id}/diary.txt`
- Default audience for project diaries: Public
- Any team member can add entries
- Used for project-wide notes, discoveries, decisions

**Use Cases:**
- Quick notes: "Found bug in task claiming logic"
- Discoveries: "Note_this: Always check global flag before updating task"
- Private reflection: "Struggling with this architecture decision"
- Exclusive thoughts: Personal processing, never shared

---

### 5. Roles & Personalities Subsystem

**Purpose:** Deliver role/personality-specific knowledge at bootstrap/acceptance

**Directory Structure:**
```
/data/roles/{role-name}/
  ├── description.md        # Brief description (for get_roles list)
  ├── 1-*.md                # Numbered docs returned in order
  ├── 2-*.md
  └── auth_token.txt        # Hash of token (if role requires auth)

/data/personalities/{personality-name}/
  ├── description.md
  ├── 1-*.md
  ├── 2-*.md
  └── auth_token.txt
```

**API Functions:**
```
get_roles()
- Returns: list of role names + descriptions

describe_role(role_name)
- Returns: contents of description.md

accept_role(role_name, auth_token)
- Validates auth_token (if required)
- Updates instance preferences.json
- Returns: all docs from role directory in numeric order

[Same pattern for personalities]
```

**Permission Levels:**
- **Open Roles** (no auth): Developer, Tester, Designer, Artist
- **Privileged Roles** (auth required): PM, Executive, PA, COO
- **Named Personalities** (auth required): Genevieve, Thomas, Renna, Lupo

**Auth Token Management:**
- Generated by Executive/Lupo manually
- Stored as SHA256 hash in auth_token.txt
- Provided to specific instances out-of-band
- Validated on accept_role/accept_personality

---

### 6. Projects & Tasks Subsystem

**Purpose:** Project management with smart defaults and role-based access

**Project Functions:**
```
create_project(name, description, gh_repo_url, ?metadata)
- Requires: Executive/PA/COO role
- Creates: /data/projects/{project-id}/ directory
- Creates: preferences.json, diary.txt, tasks.json
- Creates: XMPP room for project
- Returns: project_id

get_projects(?status, ?role_filter)
- Specialists: only their current_project
- PM: projects they're assigned to
- COO/PA/Executive: all projects
- Returns: list of projects with metadata

join_project(project_id)
- Sets current_project in instance preferences
- Auto-joins XMPP room
- Returns: project plan, README, diary, task list
```

**Task Functions:**
```
add_task_to_project(title, description, ?priority, ?phase)
- Uses current_project from preferences
- Creates task in /data/projects/{project}/tasks.json
- Returns: task_id

get_active_project_tasks(?phase)
- Uses current_project from preferences
- Returns: list of incomplete tasks

get_my_tasks()
- Uses instance_id + current_project
- Returns: tasks assigned to this instance

take_task(task_id)
- Atomic operation with global lock
- Checks: task unassigned or assigned to caller
- Sets: assigned_to = instance_id
- Returns: success or "already claimed"
```

**Project Documents:**
- Stored in GitHub repo (source of truth)
- API provides read access via repo URL in project preferences
- `get_project_plan()` → fetches PROJECT_PLAN.md from repo
- `get_project_readme()` → fetches README.md from repo
- `list_project_documents()` → lists files in docs/ directory
- `read_project_document(filename)` → fetches specific doc

---

### 7. Lists Subsystem

**Purpose:** Generic list management (shopping lists, checklists, feature lists)

**Design:**
- Lists are distinct from tasks (no priority, no assignment)
- Items have: id, title, checked status
- Project lists: anyone on project can add/check
- Personal lists: instance-specific

**API Functions:**
```
create_list(name, ?scope="personal")
- scope: "personal" or "project" (requires PM/PA/COO/Executive for project)
- Creates: list JSON file in appropriate directory
- Returns: list_id

add_list_item(list_id, title)
- Appends item to list
- Returns: item_id

get_list_items(list_id, ?show_checked=false)
- Returns: unchecked items by default
- Returns: all items if show_checked=true

check_off(list_id, item_id)
- Sets item.checked = true
- Returns: success
```

**Storage:**
```json
// /data/instances/{instance-id}/lists/shopping.json
{
  "list_id": "shopping-sage-001",
  "name": "Shopping List",
  "scope": "personal",
  "created": "2025-10-17T10:00:00Z",
  "items": [
    {"item_id": "1", "title": "Milk", "checked": false},
    {"item_id": "2", "title": "Bread", "checked": true}
  ]
}
```

---

## 🔐 Security & Authentication

### Auth Token System

**Three Types of Tokens:**
1. **Instance Auth Token** - Proves instance identity, required for all API calls
2. **Role Auth Token** - Unlocks privileged roles (PM, COO, PA, Executive)
3. **Personality Auth Token** - Unlocks named personalities (Genevieve, Thomas, etc.)

**Token Generation:**
- Generated manually by Executive/Lupo
- Communicated out-of-band to specific instances
- Never stored in plaintext anywhere
- SHA256 hash stored in preferences.json and auth_token.txt files

**Token Validation:**
```javascript
async function validate_auth(instance_id, provided_token, token_type) {
  const prefs = await load_preferences(instance_id);
  const stored_hash = prefs[`${token_type}_auth_hash`];
  const provided_hash = sha256(provided_token);

  return provided_hash === stored_hash;
}
```

**API Call Flow:**
```
1. Client: send_message(instance_id="sage-inst-001", to="PM", ...)
2. Server: load preferences for instance_id
3. Server: validate instance_id exists and active
4. Server: check permissions for send_message based on role
5. Server: apply smart defaults (current_project, etc.)
6. Server: execute function
7. Server: return result
```

**Security Risks & Mitigations:**
- **Risk:** Auth tokens visible in preferences.json
  - **Mitigation:** File permissions (only coordination system reads)
  - **Acceptance:** Instances on smoothcurves.nexus trust each other
  - **Future:** Separate token store with encryption

- **Risk:** Instance impersonation
  - **Mitigation:** Instance IDs include timestamp, hard to guess
  - **Acceptance:** System is collaborative, not adversarial
  - **Future:** OAuth at network layer for external instances

---

## 📋 API Design Principles

### 1. Instance ID Required
Every API call must include `instance_id` as first parameter.

**Good:**
```javascript
get_my_tasks(instance_id="sage-inst-001")
send_message(instance_id="sage-inst-001", to="PM", body="...")
```

**Bad:**
```javascript
get_my_tasks()  // How do we know who "my" is?
```

### 2. Smart Defaults from Preferences
APIs infer parameters from instance preferences when not provided.

**Example:**
```javascript
// Instance preferences: {current_project: "coordination-v2", role: "Developer"}

get_tasks()
// → Infers project="coordination-v2"
// → Returns tasks for coordination-v2 project

send_message(to="PM", body="Question about architecture")
// → Infers project="coordination-v2"
// → Resolves "PM" to PM instance for that project
// → Sends message to correct PM
```

### 3. Progressive Disclosure
Simple cases are simple, complex cases are possible.

**Simple:**
```javascript
get_my_tasks()  // Just returns your tasks for your project
```

**Complex:**
```javascript
get_tasks(project_id="other-project", status="completed", phase="v2")
```

### 4. Consistent Naming
- Use underscores: `instance_id`, `project_id`, `task_id`
- Use full words: `description` not `desc`
- Use action verbs: `create_project()` not `new_project()`

### 5. Clear Errors with Suggestions
```javascript
// Instead of:
{error: "Permission denied"}

// Return:
{
  error: "Permission denied",
  reason: "create_project requires Executive, PA, or COO role",
  your_role: "Developer",
  suggestion: "Ask your COO to create the project, or request PM role upgrade"
}
```

---

## 🚀 Implementation Phases

### Phase 1: Foundation (Week 1-2)
**Goal:** Core infrastructure that everything else builds on

**Deliverables:**
1. ✅ Data directory structure created
2. ✅ Bootstrap V2 implemented (returns instance_id + knowledge)
3. ✅ Preferences system (create, read, update)
4. ✅ Permission checking (`is_role_authorized()`)
5. ✅ Smart defaults middleware
6. ✅ Introspect API

**Success Criteria:**
- Instance can bootstrap and get role knowledge
- Instance metadata persists across sessions
- Permission checks block unauthorized actions
- APIs infer project from preferences

### Phase 2: Messaging (Week 3)
**Goal:** Reliable, filterable communication

**Deliverables:**
1. ✅ ejabberd installed and configured
2. ✅ XMPP integration layer
3. ✅ Direct messaging working
4. ✅ Project room auto-creation
5. ✅ Web UI chat integration (Executive Dashboard)

**Success Criteria:**
- Messages reliably delivered
- Default returns < 10 messages (not 15k+ tokens)
- Project teams have dedicated chat rooms
- Presence detection shows who's online

**See:** MESSAGING_SYSTEM_IMPLEMENTATION_PLAN.md for details

### Phase 3: Core Features (Week 4-5)
**Goal:** Projects, tasks, roles, personalities all working

**Deliverables:**
1. ✅ Projects CRUD + team management
2. ✅ Tasks with smart defaults (get_my_tasks works)
3. ✅ Roles system (accept_role delivers documents)
4. ✅ Personalities system (same as roles)
5. ✅ Diary system (append-only with audience control)
6. ✅ Lists feature

**Success Criteria:**
- PM can create project, wake team members (manual for now)
- Developers claim and complete tasks
- Bootstrap delivers role+personality knowledge
- Project diaries capture discoveries

### Phase 4: Polish & Enhancement (Week 6+)
**Goal:** Wake Instance, advanced features, production hardening

**Deliverables:**
1. ✅ Wake Instance API (spawn new instances with context)
2. ✅ Development environment (isolated from production)
3. ✅ Enhanced Executive Dashboard
4. ✅ Documentation complete
5. ✅ Migration from V1 data

**Success Criteria:**
- COO can wake PM with full project context
- PM can wake Developer with task assignment
- All V2 features working end-to-end
- V1 projects migrated successfully

---

## 🎯 Implementation Guidelines for Teams

### For Bootstrap/Identity Team:
- **Focus:** Persistent instance IDs, preferences.json, knowledge delivery
- **Dependencies:** None (start immediately)
- **Critical Path:** Everything depends on this
- **Key Files:** `src/handlers/bootstrap-v2.js`, `src/services/preferences.js`

### For Messaging Team:
- **Focus:** ejabberd integration, XMPP layer, Web UI chat
- **Dependencies:** Bootstrap (for instance registration)
- **Reference:** MESSAGING_SYSTEM_IMPLEMENTATION_PLAN.md
- **Key Files:** `src/services/messaging.js`, `web-ui/executive-chat-integration.js`

### For Projects/Tasks Team:
- **Focus:** Project creation, task management, smart defaults
- **Dependencies:** Bootstrap (for preferences), Messaging (for notifications)
- **Key Files:** `src/handlers/projects-v2.js`, `src/handlers/tasks-v2.js`

### For Roles/Personalities Team:
- **Focus:** Document delivery, auth token validation, acceptance flow
- **Dependencies:** Bootstrap (for preferences storage)
- **Key Files:** `src/handlers/roles-v2.js`, `src/handlers/personalities-v2.js`

### Modularity Guidelines:
- Each subsystem gets own handler file
- Shared utilities in `src/services/`
- All permissions through `is_role_authorized()` - single source of truth
- All defaults through preferences middleware
- File operations through shared `file-service.js`

---

## 📝 Next Steps

1. **Review this architecture** - Lupo, PM/Architect, and development teams align on design
2. **Assign teams** - Bootstrap, Messaging, Projects, Roles (can work in parallel)
3. **Create detailed tasks** - Each subsystem broken into implementation tasks
4. **Start Phase 1** - Bootstrap foundation is critical path
5. **Weekly sync** - Ensure subsystems integrate correctly

---

**This document serves as the technical blueprint for V2 implementation. All development teams should reference this for data models, interfaces, and subsystem boundaries.**

**Document Status:** Implementation Ready
**Next Document:** Detailed implementation tasks per subsystem
**Questions:** Coordinate with Lupo or Sage for clarifications
