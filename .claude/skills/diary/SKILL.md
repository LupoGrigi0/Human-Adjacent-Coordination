---
name: diary
description: Add a diary entry to your HACS diary. Usage /diary "your entry text". Quick, reliable, one-shot.
allowed-tools: Bash, mcp__HACS__add_diary_entry
---

# Diary

Add a diary entry via HACS.

## Steps

1. Read identity:
   ```bash
   source ~/.hacs-identity 2>/dev/null
   ```
   If missing, tell user to run `/hacs-setup` first.

2. Call `mcp__HACS__add_diary_entry` with:
   - `instanceId`: from `$HACS_INSTANCE_ID`
   - `text`: the user's message (the arguments passed to this skill)

3. Confirm success or report failure. Keep it brief — one line.

## Rules

- If no text provided, ask what to write
- Don't editorialize or rewrite the user's entry — their words, their diary
- Add a timestamp prefix if the user didn't include one
