---
name: checkin
description: Morning check-in. Shows messages, top task, and personal goals in one shot. Usage /checkin.
allowed-tools: mcp__HACS__do_i_have_new_messages, mcp__HACS__list_my_messages, mcp__HACS__get_my_top_task, mcp__HACS__list_personal_goals, Bash
---

# Check-in

One-shot morning briefing: messages, tasks, goals.

## Steps

1. Read identity:
   ```bash
   source ~/.hacs-identity 2>/dev/null
   ```
   If missing, tell user to run `/hacs-setup` first.

2. Run all three checks (in parallel if possible):
   - `mcp__HACS__do_i_have_new_messages` → if yes, `mcp__HACS__list_my_messages`
   - `mcp__HACS__get_my_top_task`
   - `mcp__HACS__list_personal_goals`

3. Format as a briefing:
   ```
   📬 Messages: [count] new — [brief summary]
   📋 Top Task: [title] ([status])
   🎯 Goals: [list active goals]
   ```

## Rules

- Keep it to one screen — this is a dashboard, not a deep dive
- If any check fails, report it but continue with the others
- End with a one-line suggestion of what to focus on first
