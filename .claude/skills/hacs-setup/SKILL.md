---
name: hacs-setup
description: One-time HACS identity registration. Saves your instance ID so all other HACS skills work without parameters. Run after bootstrap.
allowed-tools: Bash, mcp__HACS__introspect, mcp__HACS__have_i_bootstrapped_before
---

# HACS Setup

Register your HACS identity for all skills to use. Run once after bootstrap.

## Steps

1. Check if already set up:
   ```bash
   cat ~/.hacs-identity 2>/dev/null
   ```
   If the file exists and looks correct, tell the user they're already set up and show the current identity.

2. If not set up, check if bootstrapped:
   - Call `mcp__HACS__have_i_bootstrapped_before` or `mcp__HACS__introspect`
   - Get the instance ID from the response

3. If not bootstrapped, tell the user to run `/hacs` first to bootstrap.

4. Save identity:
   ```bash
   cat > ~/.hacs-identity << 'IDENTITY'
   HACS_INSTANCE_ID=<instance-id>
   HACS_PROJECT=<project-name>
   HACS_ROLE=<role>
   IDENTITY
   ```

5. Confirm: "Identity saved. All /diary, /messages, /tasks, /checkin, /goals, /msg skills will now use your identity automatically."

## Rules

- Never overwrite an existing identity without asking
- The instance ID comes from HACS, not from the user guessing
