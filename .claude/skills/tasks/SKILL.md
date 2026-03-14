---
name: tasks
description: Check your HACS tasks. Shows assigned and in-progress tasks. Usage /tasks.
allowed-tools: mcp__HACS__get_my_tasks, mcp__HACS__get_my_top_task, mcp__HACS__get_task, Bash
---

# Tasks

Check your HACS task queue.

## Steps

1. Read identity:
   ```bash
   source ~/.hacs-identity 2>/dev/null
   ```
   If missing, tell user to run `/hacs-setup` first.

2. Call `mcp__HACS__get_my_tasks` with `instanceId: $HACS_INSTANCE_ID`

3. Display as a compact list:
   - Task title, status, priority
   - If argument is a task ID, call `mcp__HACS__get_task` for details

## Rules

- Sort by priority/status — in-progress first, then assigned, then backlog
- Keep output scannable — table or bullet format
