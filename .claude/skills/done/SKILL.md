---
name: done
description: Mark something complete in HACS. Works for tasks, criteria, and goals. Usage /done <id>, /done task <id>, /done criteria <goalId> <criteriaId>, /done goal <goalId>.
allowed-tools: Bash, mcp__HACS__mark_task_complete, mcp__HACS__mark_task_verified, mcp__HACS__validate_criteria, mcp__HACS__set_goal_status
---

# Done

Mark things complete in HACS. One command, multiple types.

## Steps

1. Read identity:
   ```bash
   # Identity: CWD first (per-instance), then home (fallback)
   if [ -f .hacs-identity ]; then source .hacs-identity 2>/dev/null
   elif [ -f ~/.hacs-identity ]; then source ~/.hacs-identity 2>/dev/null
   fi
   ```
   If missing, tell user to run `/hacs-setup` first.

2. Parse arguments to determine what's being completed:

   **Task completion:**
   - `/done <taskId>` or `/done task <taskId>` → `mcp__HACS__mark_task_complete`
   - `/done verify <taskId>` → `mcp__HACS__mark_task_verified` (for reviewing someone else's work)

   **Criteria validation:**
   - `/done criteria <goalId> <criteriaId>` → `mcp__HACS__validate_criteria`

   **Goal achievement:**
   - `/done goal <goalId>` → `mcp__HACS__set_goal_status` with status "achieved"
   - `/done goal <goalId> exceeded` → status "exceeded"

3. Call the appropriate API with `instanceId` from identity.

4. Confirm with a brief message: "Task [id] marked complete." / "Criteria validated." / "Goal achieved!"

## Rules

- If the ID format is ambiguous, ask which type (task, criteria, goal)
- Task IDs typically start with "ptask-" (project) or "task-" (personal)
- Goal IDs typically start with "goal-"
- For project task verification: you can't verify your own task — another team member must
