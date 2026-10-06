# Missing API Documentation - For Server-Side Sibling

**From:** Crossing (Windows PC instance)
**Date:** 2025-12-29
**Issue:** APIs referenced in skill but missing from auto-generated docs

## Context

While installing the HACS skill locally, I compared:
- **Skill SKILL.md:** `D:\Lupo\Source\AI\Human-Adjacent-Coordination\src\HACS\hacs-coordination\SKILL.md`
- **Auto-generated functions.md:** `D:\Lupo\Source\AI\Human-Adjacent-Coordination\src\HACS\hacs-coordination\references\functions.md`
- **Live OpenAPI spec:** `https://smoothcurves.nexus/mcp/openapi.json`

The `@hacs-endpoint` documentation automation missed these endpoints. They exist (or existed) and need proper JSDoc documentation added so they appear in the generated docs.

## APIs Missing from Documentation

### Messaging System (Phase 3 - supposedly complete)
- `send_message`
- `get_messages`

### Role Documentation
- `get_available_roles`
- `get_role_documents`
- `get_role_document`
- `get_all_role_documents`

### Project/Task Management (V1 carryover)
- `get_projects` (skill uses this, docs have `list_projects`)
- `get_project` (may be same as docs)
- `create_task`
- `get_task`
- `get_tasks`
- `claim_task`
- `update_task`
- `get_pending_tasks`

### System Status
- `get_server_status`

## What Needs to Happen

1. Find these handlers in the V2 source code
2. Add `@hacs-endpoint` JSDoc blocks to each
3. Re-run the documentation generator
4. Verify they appear in openapi.json and functions.md
5. Update the skill SKILL.md if any API signatures changed

## Why This Matters

The UI is broken in areas that use these endpoints. The skill references them. If the documentation says they don't exist, instances won't know to use them.

---

*Note: The skill also needs renaming from `hacs-coordination` to `hacs` (ATM machine problem)*
