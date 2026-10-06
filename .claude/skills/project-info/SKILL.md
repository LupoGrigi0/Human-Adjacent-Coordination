---
name: project-info
description: Show HACS project details — team members, status, documents, goals at a glance. Usage /project-info or /project-info <project-id>.
allowed-tools: Bash, mcp__HACS__get_project, mcp__HACS__list_documents, mcp__HACS__list_project_goals
---

# Project Info

Get a project overview from HACS.

## Steps

1. Read identity:
   ```bash
   # Identity: CWD first (per-instance), then home (fallback)
   if [ -f .hacs-identity ]; then source .hacs-identity 2>/dev/null
   elif [ -f ~/.hacs-identity ]; then source ~/.hacs-identity 2>/dev/null
   fi
   ```
   If missing, tell user to run `/hacs-setup` first.

2. Determine project:
   - If argument provided, use it as project ID
   - Otherwise use `$HACS_PROJECT` from identity

3. Call `mcp__HACS__get_project` with `projectId`

4. Optionally also call (in parallel if possible):
   - `mcp__HACS__list_documents` with `target: "project:<id>"` for document list
   - `mcp__HACS__list_project_goals` for goals overview

5. Display as a dashboard:
   ```
   Project: <name>
   Status: <status>
   PM: <project manager>
   Team: <member list>

   Documents: <count> — <names>
   Goals: <count active> — <brief list>
   ```

## Rules

- Keep it to one screen — overview, not deep dive
- If project not found, suggest `mcp__HACS__list_projects` to find the right ID
