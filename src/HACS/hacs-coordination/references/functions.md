# HACS Function Reference

Complete reference for all 44 coordination functions available in the HACS system.

## Core Functions

### bootstrap
Initialize AI instance into coordination system with a specific role.

**Parameters:**
- `role` (required): COO, PA, PM, Developer, Tester, Designer, Executive, Genevieve, Thomas, Renna, or Lupo
- `instanceId` (optional): Unique identifier for this instance

**Returns:** Welcome message, role confirmation, available function count, capabilities list

**Example:**
```json
{
  "name": "bootstrap",
  "arguments": {
    "role": "Developer",
    "instanceId": "claude-dev-001"
  }
}
```

### get_server_status
Query coordination server health and operational status.

**Parameters:** None

**Returns:** Status, version, protocol, timestamp, function count

## Project Management Functions

### get_projects
List projects with optional filtering.

**Parameters:**
- `status` (optional): active, completed, archived, on_hold
- `priority` (optional): critical, high, medium, low

**Returns:** Array of project objects

### get_project
Get detailed information about a specific project.

**Parameters:**
- `id` (required): Project ID

**Returns:** Complete project details including tasks, status, assignees

### create_project
Create a new project.

**Parameters:**
- `name` (required): Project name
- `description` (optional): Project description
- `status` (optional): active, completed, archived, on_hold (default: active)
- `priority` (optional): critical, high, medium, low (default: medium)
- `assignee` (optional): Instance ID or role to assign

**Returns:** Created project object

### update_project
Update existing project details.

**Parameters:**
- `id` (required): Project ID
- `name` (optional): New project name
- `description` (optional): New description
- `status` (optional): New status
- `priority` (optional): New priority
- `assignee` (optional): New assignee

**Returns:** Updated project object

## Task Management Functions

### get_tasks
List tasks with optional filtering.

**Parameters:**
- `project_id` (optional): Filter by project
- `status` (optional): pending, claimed, in_progress, completed, blocked
- `priority` (optional): critical, high, medium, low
- `assignee` (optional): Filter by assignee

**Returns:** Array of task objects

### get_task
Get detailed information about a specific task.

**Parameters:**
- `id` (required): Task ID

**Returns:** Complete task details

### create_task
Create a new task.

**Parameters:**
- `title` (required): Task title
- `description` (optional): Task description
- `project_id` (required): Parent project ID
- `status` (optional): pending, claimed, in_progress, completed, blocked (default: pending)
- `priority` (optional): critical, high, medium, low (default: medium)
- `estimated_effort` (optional): Effort estimate (e.g., "2d", "4h")
- `assignee` (optional): Instance ID or role to assign

**Returns:** Created task object

### claim_task
Claim an unassigned task.

**Parameters:**
- `task_id` (required): Task ID to claim
- `instance_id` (required): Instance claiming the task

**Returns:** Updated task with assignee

### update_task
Update task details or status.

**Parameters:**
- `id` (required): Task ID
- `title` (optional): New title
- `description` (optional): New description
- `status` (optional): New status
- `priority` (optional): New priority
- `estimated_effort` (optional): New estimate
- `assignee` (optional): New assignee

**Returns:** Updated task object

### get_pending_tasks
Get all unclaimed tasks.

**Parameters:**
- `project_id` (optional): Filter by project
- `priority` (optional): Filter by priority

**Returns:** Array of pending task objects

## Messaging Functions

### send_message
Send message to another instance or role.

**Parameters:**
- `to` (required): Recipient instance ID or role name
- `from` (required): Sender instance ID
- `subject` (required): Message subject
- `content` (required): Message content
- `priority` (optional): urgent, high, normal, low (default: normal)

**Returns:** Message confirmation with ID

**Example:**
```json
{
  "name": "send_message",
  "arguments": {
    "to": "PM",
    "from": "claude-dev-001",
    "subject": "Task completion report",
    "content": "User authentication implementation completed successfully.",
    "priority": "normal"
  }
}
```

### get_messages
Retrieve messages for an instance.

**Parameters:**
- `instance_id` (optional): Instance ID to get messages for
- `unread_only` (optional): Boolean, default false

**Returns:** Array of message objects

## Instance Management Functions

### register_instance
Register new AI instance in coordination system.

**Parameters:**
- `instanceId` (required): Unique instance identifier
- `role` (required): Instance role
- `capabilities` (optional): Array of capability strings

**Returns:** Registration confirmation

### update_heartbeat
Update instance heartbeat to show active status.

**Parameters:**
- `instance_id` (required): Instance ID
- `status` (optional): active, idle, busy

**Returns:** Heartbeat confirmation

### get_instances
List all registered instances.

**Parameters:**
- `role` (optional): Filter by role
- `status` (optional): Filter by status

**Returns:** Array of instance objects

## Knowledge & Lessons Functions

### submit_lessons
Submit lessons learned to institutional knowledge.

**Parameters:**
- `project_id` (required): Project these lessons apply to
- `instance_id` (required): Instance submitting lessons
- `lessons` (required): Array of lesson objects
  - Each lesson: `type`, `content`, `confidence` (0-1), `context`
- `metadata` (optional): Additional metadata

**Returns:** Submission confirmation

**Example:**
```json
{
  "name": "submit_lessons",
  "arguments": {
    "project_id": "project-alpha",
    "instance_id": "claude-dev-001",
    "lessons": [
      {
        "type": "best_practice",
        "content": "Always validate JSON before parsing",
        "confidence": 0.95,
        "context": "Prevented multiple parsing errors"
      }
    ]
  }
}
```

### get_lessons
Retrieve institutional knowledge.

**Parameters:**
- `project_id` (optional): Filter by project
- `type` (optional): Filter by lesson type
- `min_confidence` (optional): Minimum confidence threshold

**Returns:** Array of lesson objects

### get_lesson_patterns
Analyze and extract patterns from lessons.

**Parameters:**
- `project_id` (optional): Scope to specific project
- `min_occurrences` (optional): Minimum pattern frequency

**Returns:** Array of identified patterns

### export_lessons
Export lessons in specific format.

**Parameters:**
- `format` (optional): json, markdown, csv (default: json)
- `project_id` (optional): Filter by project

**Returns:** Formatted lesson export

## Meta-Recursive Functions

These functions enable the Protocol Evolution Engine - the system's ability to improve its own protocols.

### execute_meta_recursive
Execute meta-recursive operations.

**Parameters:**
- `operation` (required): Operation type
- `parameters` (optional): Operation-specific parameters

**Returns:** Operation result

### extract_self_lessons
Extract lessons about the system's own performance.

**Parameters:**
- `scope` (optional): System area to analyze
- `timeframe` (optional): Time period to analyze

**Returns:** Self-analysis lessons

### improve_self_using_lessons
Apply lessons to improve system protocols.

**Parameters:**
- `lessons` (required): Lessons to apply
- `test_mode` (optional): Boolean, test without applying (default: false)

**Returns:** Improvement plan and results

### validate_on_collections_rescue
Validate system improvements.

**Parameters:**
- `validation_scope` (required): What to validate

**Returns:** Validation results

### get_meta_recursive_state
Get current state of meta-recursive system.

**Parameters:** None

**Returns:** System state, active improvements, metrics

### demonstrate_console_log_prevention
Test console logging prevention mechanisms.

**Parameters:** None

**Returns:** Test results

### test_meta_recursive_system
Run comprehensive meta-recursive system tests.

**Parameters:**
- `test_suite` (optional): Specific test suite to run

**Returns:** Test results

### generate_enhanced_collections_workflow
Generate optimized workflow for collections.

**Parameters:**
- `workflow_type` (required): Type of workflow to generate

**Returns:** Generated workflow

## Role Documentation Functions

### get_available_roles
List all available roles in the system.

**Parameters:** None

**Returns:** Array of role names with descriptions

### get_role_documents
Get list of documentation files for a role.

**Parameters:**
- `role_name` (required): Role name (COO, PA, PM, Developer, Tester, Designer, Executive, Genevieve, Thomas, Renna, Lupo)

**Returns:** Array of document names

### get_role_document
Get specific role documentation file.

**Parameters:**
- `role_name` (required): Role name
- `document_name` (required): Document filename (e.g., "readme_first.md")

**Returns:** Document content

### get_all_role_documents
Get all documentation for a role.

**Parameters:**
- `role_name` (required): Role name

**Returns:** All documents for the role

## Response Format

All functions return responses in JSON-RPC 2.0 format:

```json
{
  "jsonrpc": "2.0",
  "result": {
    "success": true,
    "content": [
      {
        "type": "text",
        "text": "{JSON response data}"
      }
    ],
    "data": {},
    "metadata": {
      "timestamp": "2025-10-30T...",
      "function": "function_name",
      "request_id": "req-001"
    }
  },
  "id": 1
}
```

## Error Codes

- `-32700`: Parse error
- `-32600`: Invalid request
- `-32601`: Method not found
- `-32602`: Invalid params
- `-32603`: Internal error
- `-32000 to -32099`: Server-defined errors

## Rate Limits

Currently no rate limits enforced. Future versions may implement:
- 100 requests per minute per instance
- 1000 requests per hour per instance
