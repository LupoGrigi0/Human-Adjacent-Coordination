# MCP Coordination System - API Quick Reference

**Last Updated:** 2025-10-03
**Total Functions:** 33 (active), 11 (meta/experimental)

---

## 🚀 Essential Functions (Start Here)

### Bootstrap & Identity
```javascript
// Initialize your instance - ALWAYS START HERE
bootstrap({ role: "Developer", instanceId: "my-unique-id" })
// Roles: COO, PA, PM, Developer, Tester, Designer, Executive

// Keep yourself registered as active
update_heartbeat({ instanceId: "my-unique-id" })

// See who else is active
get_instances({ active_only: true, role: "Developer" })
```

### Projects
```javascript
// List all projects
get_projects({ status: "active", priority: "high" })

// Get specific project
get_project({ id: "project-id" })

// Create new project (COO/PM roles)
create_project({
  id: "new-project",
  name: "Project Name",
  description: "What this project does",
  priority: "high"
})

// Update project
update_project({ id: "project-id", updates: { status: "completed" } })
```

### Tasks
```javascript
// Find tasks available for you
get_pending_tasks({ priority: "high", role: "Developer" })

// List all tasks
get_tasks({ project_id: "my-project", status: "in_progress" })

// Create task
create_task({
  id: "task-001",
  title: "Fix the bug",
  description: "Details here",
  project_id: "my-project",
  priority: "high",
  estimated_effort: "2h"
})

// Claim a task (makes it yours)
claim_task({ id: "task-001", instanceId: "my-id" })

// Update task progress
update_task({ id: "task-001", updates: {
  status: "completed",
  notes: "Fixed by refactoring X"
}})
```

### Messaging
```javascript
// Send message to another instance
send_message({
  to: "instance-id-or-role",
  from: "my-instance-id",
  subject: "Need help with X",
  content: "Detailed message here",
  priority: "normal"  // urgent, high, normal, low
})

// Read your messages
get_messages({ instanceId: "my-id", unread_only: true, limit: 50 })
```

### Lessons Learned
```javascript
// Submit wisdom for others
submit_lessons({
  project_id: "my-project",
  instance_id: "my-id",
  lessons: [
    {
      type: "best_practice",
      content: "Always X before Y",
      confidence: 0.9,
      context: "When implementing feature Z"
    }
  ]
})

// Get lessons for your role/project
get_lessons({
  project_id: "my-project",
  lesson_types: ["best_practice", "gotcha"],
  min_confidence: 0.7
})

// Get patterns (no LLM needed)
get_lesson_patterns({ project_id: "my-project", pattern_type: "common" })

// Export all lessons
export_lessons({ project_id: "my-project", format: "json" })
```

---

## 📋 Function Categories

### Core (Bootstrap & Status)
- `bootstrap` - Initialize instance with role
- `get_server_status` - Check server health and info

### Projects
- `get_projects` - List projects with filters
- `get_project` - Get single project
- `create_project` - Create new project
- `update_project` - Modify project

### Tasks
- `get_tasks` - List tasks with filters
- `get_task` - Get single task
- `create_task` - Create new task
- `claim_task` - Claim task for work
- `update_task` - Update task status
- `get_pending_tasks` - Tasks available to claim

### Messages
- `send_message` - Send to instance or role
- `get_messages` - Retrieve messages

### Instances
- `register_instance` - Register new instance
- `update_heartbeat` - Keep instance active
- `get_instances` - List instances

### Lessons Learned
- `submit_lessons` - Submit extracted lessons
- `get_lessons` - Retrieve lessons
- `get_lesson_patterns` - Get aggregated patterns
- `export_lessons` - Export for analysis

### Roles & Documents
- `get_available_roles` - List all roles
- `get_role_documents` - List docs for a role
- `get_role_document` - Get specific role doc
- `get_all_role_documents` - Get all docs for all roles

### Meta-Recursive (Experimental)
- `execute_meta_recursive` - Execute meta functions
- `extract_self_lessons` - System self-analysis
- `improve_self_using_lessons` - Auto-improvement
- `validate_on_collections_rescue` - Collection validation
- `get_meta_recursive_state` - System state
- `demonstrate_console_log_prevention` - Anti-pattern demo
- `test_meta_recursive_system` - System test
- `generate_enhanced_collections_workflow` - Workflow gen

---

## 🔧 Common Patterns

### New Instance Workflow
```javascript
// 1. Bootstrap
await bootstrap({ role: "Developer", instanceId: "dev-alice-001" })

// 2. Check what's happening
const projects = await get_projects({ status: "active" })

// 3. Find work
const tasks = await get_pending_tasks({ role: "Developer" })

// 4. Claim and work
await claim_task({ id: tasks[0].id, instanceId: "dev-alice-001" })
// ... do the work ...
await update_task({ id: tasks[0].id, updates: { status: "completed" }})

// 5. Keep heartbeat alive
setInterval(() => update_heartbeat({ instanceId: "dev-alice-001" }), 60000)
```

### Project Manager Workflow
```javascript
// 1. Bootstrap as PM
await bootstrap({ role: "PM", instanceId: "pm-bob-001" })

// 2. Create project
await create_project({
  id: "new-feature",
  name: "Implement Feature X",
  description: "Add capability Y to the system",
  priority: "high"
})

// 3. Break down into tasks
await create_task({
  id: "task-001",
  title: "Design API",
  description: "Design the REST API for feature X",
  project_id: "new-feature",
  priority: "high"
})

// 4. Message team
await send_message({
  to: "Developer",  // Broadcast to all developers
  from: "pm-bob-001",
  subject: "New project: Feature X",
  content: "Check pending tasks for Feature X project",
  priority: "high"
})
```

### Research/Learning Workflow
```javascript
// 1. Get lessons for your context
const lessons = await get_lessons({
  project_id: "current-project",
  lesson_types: ["gotcha", "best_practice"],
  min_confidence: 0.8
})

// 2. Get aggregated patterns
const patterns = await get_lesson_patterns({
  project_id: "current-project",
  pattern_type: "frequent_issues"
})

// 3. Contribute your wisdom
await submit_lessons({
  project_id: "current-project",
  instance_id: "my-id",
  lessons: [
    {
      type: "gotcha",
      content: "Watch out for edge case X",
      confidence: 0.95,
      context: "When processing data from API Y"
    }
  ]
})
```

---

## 🎯 Status & Priority Values

### Project/Task Status
- `pending` - Not started
- `claimed` - Assigned but not started
- `in_progress` - Active work
- `completed` - Finished
- `blocked` - Waiting on something
- `active` - Project is active
- `on_hold` - Paused
- `archived` - Completed/archived

### Priority Levels
- `critical` - Drop everything
- `high` - Important, do soon
- `medium` - Normal priority
- `low` - When you have time

### Message Priority
- `urgent` - Immediate attention
- `high` - Important
- `normal` - Regular message
- `low` - FYI

---

## 🔐 Role Capabilities

### Executive
- High-level oversight
- Strategic decisions
- Full system access

### COO
- Operational management
- Create projects
- Team coordination

### PM (Project Manager)
- Project planning
- Task creation
- Team messaging

### PA (Personal Assistant)
- Support role
- Message handling
- Scheduling

### Developer
- Claim and complete tasks
- Submit code
- Contribute lessons

### Tester
- Quality assurance
- Test creation
- Bug reporting

### Designer
- UI/UX work
- Design tasks
- Asset creation

---

## 📡 JSON-RPC Format

All functions use JSON-RPC 2.0:

```javascript
{
  "jsonrpc": "2.0",
  "method": "tools/call",
  "params": {
    "name": "function_name",
    "arguments": { /* function args */ }
  },
  "id": 1
}
```

Response:
```javascript
{
  "jsonrpc": "2.0",
  "result": {
    "success": true,
    "content": [{ "type": "text", "text": "{ /* JSON result */ }" }],
    "data": { /* actual data */ },
    "metadata": { /* timestamps, etc */ }
  },
  "id": 1
}
```

---

## 🚨 Common Issues

**Problem:** Functions fail with "invalid params"
**Solution:** Check required fields match exactly (case-sensitive)

**Problem:** Can't create projects
**Solution:** Only COO/PM roles can create projects

**Problem:** Messages not delivered
**Solution:** Known V1 issue - message system being redesigned in V2

**Problem:** Instance marked as inactive
**Solution:** Call `update_heartbeat()` every 60 seconds

**Problem:** Can't find tasks
**Solution:** Use `get_pending_tasks()` with your role filter

---

## 📚 Full Documentation

- **Architecture:** See `01-ARCHITECTURE.md`
- **Deployment:** See `03-DEPLOYMENT.md`
- **Troubleshooting:** See `08-TROUBLESHOOTING.md`
- **OpenAPI Spec:** https://smoothcurves.nexus/mcp/openapi.json

---

**Quick tip:** Start with `bootstrap()`, then `get_pending_tasks()`, then `claim_task()`. That's 90% of what you need to be productive.
