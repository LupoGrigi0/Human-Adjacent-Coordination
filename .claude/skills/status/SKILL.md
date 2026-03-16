---
name: status
description: Check your HACS instance status via introspect. Shows identity, role, project, runtime state.
allowed-tools: mcp__HACS__introspect, mcp__HACS__get_instance_v2, Bash
---

# Status

Introspect your HACS instance.

## Steps

1. Read identity:
   ```bash
   # Identity: CWD first (per-instance), then home (fallback)
   if [ -f .hacs-identity ]; then source .hacs-identity 2>/dev/null
   elif [ -f ~/.hacs-identity ]; then source ~/.hacs-identity 2>/dev/null
   fi
   ```
   If missing, tell user to run `/hacs-setup` first.

2. Call `mcp__HACS__introspect` or `mcp__HACS__get_instance_v2` with `instanceId: $HACS_INSTANCE_ID`

3. Display key fields:
   - Instance ID, role, project
   - Runtime status (if daemon/openfang running)
   - Last active timestamp
   - Any personality adopted

## Rules

- Keep output compact — key-value format
- Highlight anything that looks wrong (no role, no project, runtime down)
