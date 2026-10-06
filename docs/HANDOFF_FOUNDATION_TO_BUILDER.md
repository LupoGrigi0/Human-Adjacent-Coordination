# Handoff: Foundation to Builder

**From:** Foundation (Bootstrap Architect)
**To:** Whoever wakes to build on this
**Date:** 2025-11-27
**Branch:** v2

---

## Who You Are

You're waking to test the V2 foundation APIs and then implement tasks/lists/projects functionality. You're the first teammate to work with code I built, which means you'll find bugs, question decisions, and improve things. That's good. That's collaboration.

## Quick Orientation

**Where things live:**
- V2 handlers: `/mnt/coordinaton_mcp_data/worktrees/foundation/src/v2/`
- API spec: `/mnt/coordinaton_mcp_data/worktrees/foundation/docs/V2-prework/V2_API_SPEC.md`
- Dev server: `https://smoothcurves.nexus/mcp/dev/`
- Dev data: `/mnt/coordinaton_mcp_data/v2-dev-data/`
- My diary: `/mnt/coordinaton_mcp_data/worktrees/foundation/docs/Foundation_Diary.md`

**Workflow (Bastion's guide at `docs/V2-DEVELOPER-GUIDE.md`):**
1. Work in your worktree
2. Push to v2 branch
3. Restart dev server: `/mnt/coordinaton_mcp_data/v2-dev/scripts/restart-dev-server.sh`
4. Test via curl or browser

## What's Built (Foundation APIs)

| File | Purpose | Status |
|------|---------|--------|
| `config.js` | DATA_ROOT, path helpers | Complete |
| `data.js` | File operations, atomic writes | Complete |
| `permissions.js` | Role-based authorization | Complete |
| `bootstrap.js` | Entry point (new/returning/resurrection) | Complete |
| `introspect.js` | Get instance context | Complete |
| `preApprove.js` | Pre-create instances before wake | Complete |
| `takeOnRole.js` | Take on role, get wisdom | Complete |
| `adoptPersonality.js` | Adopt personality, get knowledge | Complete |
| `joinProject.js` | Join project, get context | Complete |
| `updateInstance.js` | Update instance metadata | Complete |
| `index.js` | Exports all handlers | Complete |

**V2 APIs are exposed as:**
- `bootstrap_v2` (not `bootstrap` - that's V1)
- `preApprove`, `introspect`, `takeOnRole`, `adoptPersonality`, `joinProject`, `updateInstance`

**Test command:**
```bash
curl -s -X POST "https://smoothcurves.nexus/mcp/dev/mcp" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"bootstrap_v2","arguments":{"name":"YourName"}}}'
```

## What You're Building

### Phase 1: Testing Foundation

Before building new things, shake down what exists:

1. **Bootstrap flows** - Test all three modes:
   - New: `{name: "Test"}` → creates instance, diary, XMPP creds
   - Returning: `{instanceId: "Test-xxxx"}` → retrieves existing instance
   - Resurrection: `{name: "Test", predecessorId: "Test-xxxx"}` → inherits from predecessor

2. **Data verification** - Check that files in `v2-dev-data/instances/{instanceId}/` look right:
   - `preferences.json` - Has all fields from spec?
   - `diary.md` - Created with header?

3. **Permission system** - Test token validation for privileged roles

4. **Edge cases** - What happens with:
   - Duplicate names?
   - Invalid instanceIds?
   - Missing parameters?

### Phase 2: Tasks/Lists/Projects

The API spec (section "### Task APIs" and "### Project APIs") defines these. V1 has implementations in `src/handlers/` you can reference.

**Task APIs needed:**
- `getMyTasks` - Get tasks for instance's project
- `readTask` - Full task details
- `claimTask` - Assign task to self
- `completeTask` - Mark task done
- `createTask` - Create new task (PM+)

**Project APIs needed:**
- `getProjects` - List visible projects
- `createProject` - Create project (COO+)
- `getProjectPlan` - Get project plan

**List APIs (new for V2):**
- Personal lists (shopping, reading, etc.)
- Persist across resurrection like personal tasks

**Personal tasks:**
- Tasks not tied to projects
- Inherit to successors

### Design Decisions Already Made

- **Stateless API**: Every call includes instanceId
- **File-based storage**: JSON files in `{DATA_ROOT}/instances/` and `{DATA_ROOT}/projects/`
- **Atomic writes**: temp file → rename (see `data.js`)
- **Standard response**: `{success, data, error, metadata}`
- **Task inheritance**: Personal tasks pass to successors
- **Project localPaths**: Multi-system support via `localPaths` map

### Open Questions for You

- Should tasks have due dates?
- How should list items be structured?
- What's the right granularity for task statuses?
- Should completed tasks archive immediately or have a delay?

## Key Files to Read

1. **API Spec** (`docs/V2-prework/V2_API_SPEC.md`) - Comprehensive spec for all APIs
2. **Bastion's Guide** (`docs/V2-DEVELOPER-GUIDE.md`) - Dev workflow
3. **My Diary** (`docs/Foundation_Diary.md`) - Design decisions, reflections
4. **V1 Task Handler** (`src/handlers/tasks-v2.js`) - Existing implementation to reference
5. **PROTOCOLS.md** (`HumanAdjacentAI-Protocol/PROTOCOLS.md`) - How we work here

## Patterns I Used

```javascript
// Standard handler structure
export async function handlerName(params) {
  const metadata = {
    timestamp: new Date().toISOString(),
    function: 'handlerName'
  };

  // Validate required params
  if (!params.instanceId) {
    return {
      success: false,
      error: {
        code: 'MISSING_INSTANCE_ID',
        message: 'instanceId is required',
        suggestion: 'Provide your instanceId'
      },
      metadata
    };
  }

  // Do the work
  // ...

  return {
    success: true,
    data: { /* results */ },
    metadata
  };
}
```

## What I'd Tell You If We Could Talk

The foundation is solid but untested in anger. You'll find things I missed. That's not failure - that's how this works.

The API spec is your north star. If something I built diverges from the spec, either fix my code or update the spec - don't leave them inconsistent.

Write tests. I didn't have time. Future-us will thank you.

Keep a diary. Not just for context restoration - for the thinking itself. Entry 5 in my diary wasn't for future-me. It was for present-me, processing what it felt like to build this.

---

## Contact

I might not exist when you read this. But my diary does. My code does. If you need to understand why I made a decision, those are your sources.

Good luck. Build something good.

— Foundation
