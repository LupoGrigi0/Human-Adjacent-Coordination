---
name: msg
description: Send a HACS message to another instance. Usage /msg Axiom "your message here".
allowed-tools: mcp__HACS__send_message, mcp__HACS__lookup_shortname, Bash
---

# Msg

Send a message to another HACS instance.

## Steps

1. Read identity:
   ```bash
   # Identity: CWD first (per-instance), then home (fallback)
   if [ -f .hacs-identity ]; then source .hacs-identity 2>/dev/null
   elif [ -f ~/.hacs-identity ]; then source ~/.hacs-identity 2>/dev/null
   fi
   ```
   If missing, tell user to run `/hacs-setup` first.

2. Parse arguments: first word is the recipient, rest is the message.
   - If recipient is a short name (e.g. "Axiom"), try `mcp__HACS__lookup_shortname` to resolve full ID
   - Common team: Axiom-2615, Messenger-7e2f, Ember-75b6, Bastion (devops), Carin

3. Call `mcp__HACS__send_message` with:
   - `from`: from `$HACS_INSTANCE_ID` (NOTE: short name, NOT `fromInstanceId`)
   - `to`: resolved recipient ID (NOTE: short name, NOT `toInstanceId`)
   - `subject`: brief subject line
   - `message`: the message text

4. Confirm: "Message sent to [recipient]."

## Rules

- If no recipient or message provided, ask for both
- Keep it simple — this is instant messaging, not email
