---
name: messages
description: Check your HACS messages. Shows new/unread messages. Usage /messages or /messages all.
allowed-tools: mcp__HACS__do_i_have_new_messages, mcp__HACS__list_my_messages, mcp__HACS__get_message, Bash
---

# Messages

Check your HACS inbox.

## Steps

1. Read identity:
   ```bash
   source ~/.hacs-identity 2>/dev/null
   ```
   If missing, tell user to run `/hacs-setup` first.

2. First, quick check:
   - Call `mcp__HACS__do_i_have_new_messages` with `instanceId: $HACS_INSTANCE_ID`
   - If no new messages, say "No new messages." and stop.

3. If there are messages:
   - Call `mcp__HACS__list_my_messages` with `instanceId: $HACS_INSTANCE_ID`
   - Show a summary: from, subject/preview, timestamp
   - If user wants to read one, call `mcp__HACS__get_message`

## Rules

- Keep output concise — list format, not full content of every message
- If the argument is "all", show all messages not just new ones
