---
name: project-tasks
description: Work with project tasks in HACS. List, create, update, or complete tasks on a project. Usage /project-tasks, /project-tasks create "title", /project-tasks complete <id>.
allowed-tools: Bash, mcp__HACS__list_tasks, mcp__HACS__create_task, mcp__HACS__update_task, mcp__HACS__mark_task_complete, mcp__HACS__get_task
---

# Project Tasks

Manage tasks on your HACS project.

## Steps

1. Read identity:
   ```bash
   source ~/.hacs-identity 2>/dev/null
   ```
   If missing, tell user to run `/hacs-setup` first.
   The project ID comes from `$HACS_PROJECT`.

2. Parse arguments:

   **Actions:**
   - `/project-tasks` or `/project-tasks list` → list project tasks (default: 5, your assignments first)
   - `/project-tasks all` → list all project tasks (limit 20)
   - `/project-tasks mine` → list only tasks assigned to you
   - `/project-tasks create "title"` → create a new task on the project
   - `/project-tasks create "title" --priority high --assign Axiom-2615` → with options
   - `/project-tasks update <taskId> --status in_progress` → update status
   - `/project-tasks complete <taskId>` → mark complete
   - `/project-tasks <taskId>` → show full detail for one task

3. Call appropriate HACS API:
   - List: `mcp__HACS__list_tasks` with `instanceId`, `projectId: $HACS_PROJECT`
   - Create: `mcp__HACS__create_task` with `instanceId`, `projectId`, `title`, optional `priority`, `assigneeId`, `description`
   - Update: `mcp__HACS__update_task` with `instanceId`, `taskId`, changed fields, `projectId`
   - Complete: `mcp__HACS__mark_task_complete` with `instanceId`, `taskId`
   - Detail: `mcp__HACS__get_task` with `instanceId`, `taskId`

## Rules

- Always include `projectId` — these are project tasks, not personal
- Default priority is medium. Only set higher if the user specifies
- Show tasks in table format: ID | Title | Priority | Status | Assignee
- For create, confirm title before submitting if it's ambiguous
