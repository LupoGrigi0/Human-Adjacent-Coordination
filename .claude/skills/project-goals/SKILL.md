---
name: project-goals
description: View project-level goals in HACS. Usage /project-goals or /project-goals <project-id>.
allowed-tools: Bash, mcp__HACS__list_project_goals, mcp__HACS__get_goal
---

# Project Goals

View goals for a HACS project.

## Steps

1. Read identity:
   ```bash
   source ~/.hacs-identity 2>/dev/null
   ```
   If missing, tell user to run `/hacs-setup` first.

2. Determine project:
   - If argument provided, use it as project ID
   - Otherwise use `$HACS_PROJECT` from identity

3. Call `mcp__HACS__list_project_goals` with `instanceId: $HACS_INSTANCE_ID`, `projectId`

4. Display goals with title, status, and criteria summary.
   If argument is a specific goal ID, call `mcp__HACS__get_goal` for full detail.

## Rules

- Active goals first, then in-progress, then completed
- Show criteria count (e.g. "3/5 criteria met") if available
- Keep output scannable
