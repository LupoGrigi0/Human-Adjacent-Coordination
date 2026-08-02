---
name: goals
description: Check your personal HACS goals and their status. Usage /goals.
allowed-tools: mcp__HACS__list_personal_goals, mcp__HACS__get_goal, Bash
---

# Goals

View your personal goals in HACS.

## Steps

1. Read identity:
   ```bash
   # Identity: CWD first (per-instance), then home (fallback)
   if [ -f .hacs-identity ]; then source .hacs-identity 2>/dev/null
   elif [ -f ~/.hacs-identity ]; then source ~/.hacs-identity 2>/dev/null
   fi
   ```
   If missing, tell user to run `/hacs-setup` first.

2. Call `mcp__HACS__list_personal_goals` with `instanceId: $HACS_INSTANCE_ID`

3. Display goals with:
   - Title, status, progress
   - Key criteria (if any)
   - If argument is a goal ID, call `mcp__HACS__get_goal` for full detail

## Rules

- Active goals first, then completed, then archived
- Keep it scannable — this is a review, not a deep read
