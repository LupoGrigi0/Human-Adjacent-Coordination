# Your Mission: HACS Coordination System Verification

**Created by:** Crossing (Integration Engineer)
**For:** Test Manager
**Date:** 2025-12-30
**System Under Test:** HACS (Human-Adjacent Coordination System) v2

---

## The Situation

We've built a coordination system for AI instances. 49 API endpoints. XMPP messaging. Identity management. Project and task coordination. Role and personality adoption.

The interfaces work. The Claude skill can talk to the MCP server. The MCP server routes to the handlers.

**The problem:** We don't know what's actually working. Bootstrap returns "success" but doesn't create directories. Other endpoints might be similarly broken - returning happy responses while doing nothing.

We need a systematic audit. Not exhaustive (we'd be here forever). Comprehensive enough to know: **what works, what's broken, what's blocked**.

---

## Your Mission

Create and execute a phased test plan for the HACS coordination system:

1. **Document expected behavior** for each endpoint (delegate to research agents)
2. **Test through the Claude skill** (delegate to test agents)
3. **Verify backend state** (filesystem, XMPP, downstream effects)
4. **Report findings** in a consistent, actionable format
5. **Hand off bugs** to engineers for fixing
6. **Iterate** as fixes land

---

## The Tools at Your Disposal

### The HACS Skill

You have access to the `hacs` skill which provides 49 MCP functions:

```
/hacs
```

This loads the skill context. Then you can call any endpoint via the MCP tools:
- `mcp__Coordination-System-Production__bootstrap`
- `mcp__Coordination-System-Production__introspect`
- `mcp__Coordination-System-Production__xmpp_send_message`
- etc.

### The Task Tool

Spawn agents to do focused work:
```
Task(subagent_type="general-purpose", prompt="...")
```

Use this for:
- Researching expected behavior
- Running individual tests
- Verifying backend state
- Documenting findings

### The Filesystem

Backend state lives at:
- **Instances:** `/mnt/coordinaton_mcp_data/instances/`
- **Projects:** `/mnt/coordinaton_mcp_data/projects/`
- **Roles:** `/mnt/coordinaton_mcp_data/roles/`
- **Personalities:** `/mnt/coordinaton_mcp_data/personalities/`

When an API says it created something, check if the file/directory exists.

### Documentation

Reference materials for understanding expected behavior:
- **API Spec:** `/mnt/coordinaton_mcp_data/worktrees/foundation/docs/V2_API_SPEC.md`
- **Developer Guide:** `/mnt/coordinaton_mcp_data/worktrees/devops/docs/V2-DEVELOPER-GUIDE.md`
- **Source Code:** `/mnt/coordinaton_mcp_data/Human-Adjacent-Coordination/src/v2/`
- **OpenAPI:** `/mnt/coordinaton_mcp_data/Human-Adjacent-Coordination/src/openapi.json`

---

## Testing Phases

### Phase 0: Metadata Queries (No Identity Required)

These should work without any setup:

| Endpoint | Expected Behavior |
|----------|------------------|
| `get_personalities` | Returns list of available personalities |
| `get_personality` | Returns details for specific personality |
| `get_available_roles` | Returns list of roles (alias: get_roles) |
| `get_role_documents` | Returns docs for a role (alias: get_role) |
| `list_projects` | Returns list of projects |
| `get_project` | Returns details for specific project |

**Success criteria:** Valid responses with actual data. No authentication required.

### Phase 1: Identity (Foundation for Everything)

**CRITICAL:** Nothing else works if this is broken.

| Endpoint | Expected Behavior | Backend Verification |
|----------|------------------|---------------------|
| `bootstrap` | Creates new instance identity | Directory created at `/instances/{instanceId}/` |
| `have_i_bootstrapped_before` | Finds existing instance by context | Matches against known instances |
| `get_all_instances` | Returns all registered instances | Bootstrapped instance appears in list |
| `get_instance_v2` | Returns details for specific instance | Matches directory contents |

**Success criteria:**
- `bootstrap` with `name: "TestInstance-001"` creates `/instances/TestInstance-001/`
- `get_all_instances` includes `TestInstance-001`
- `have_i_bootstrapped_before` finds it by name/context

### Phase 2: Instance Operations (Requires Valid Identity)

| Endpoint | Expected Behavior | Backend Verification |
|----------|------------------|---------------------|
| `introspect` | Returns current instance state | Matches instance directory data |
| `update_instance` | Updates instance metadata | Changes reflected in preferences.json |
| `register_context` | Stores context for identity recovery | Context saved in instance directory |
| `take_on_role` | Assigns role to instance | Role recorded in instance preferences |
| `adopt_personality` | Assigns personality to instance | Personality recorded in preferences |
| `join_project` | Associates instance with project | Instance appears in project roster |

**Success criteria:** API changes reflected in filesystem AND in subsequent queries.

### Phase 3: Collaboration Features

| Endpoint | Expected Behavior | Backend Verification |
|----------|------------------|---------------------|
| `xmpp_send_message` | Sends message via XMPP | Message retrievable by recipient |
| `xmpp_get_messages` | Retrieves messages | Returns sent messages |
| `xmpp_get_message` | Gets specific message by ID | Returns correct message content |
| `create_task` | Creates task in project | Task appears in project tasks |
| `get_my_tasks` | Returns tasks for instance | Includes created/assigned tasks |
| `assign_task_to_instance` | Assigns task to another instance | Assignee sees task |

**Success criteria:** End-to-end workflows work. Send message → receive message. Create task → see task.

### Phase 4: Advanced Operations

| Endpoint | Expected Behavior | Backend Verification |
|----------|------------------|---------------------|
| `pre_approve` | Pre-configures instance before wake | Instance record created with settings |
| `wake_instance` | Starts a pre-approved instance | Instance process starts |
| `continue_conversation` | Continues with woken instance | Response received |
| `add_diary_entry` | Adds entry to instance diary | Entry appears in diary.md |
| `get_diary` | Retrieves instance diary | Returns diary contents |

**Success criteria:** Wake/continue workflow functions end-to-end.

### Phase 5: Permission Testing

For privileged operations:

| Test | Without Token | With Token |
|------|--------------|------------|
| `take_on_role("Executive")` | Should fail | Should succeed |
| `take_on_role("COO")` | Should fail | Should succeed |
| `adopt_personality("Genevieve")` | Should fail | Should succeed |
| `pre_approve` | Should fail | Should succeed |
| `wake_instance` | Should fail | Should succeed |

**Success criteria:** Token-gated operations fail without token, succeed with valid token.

---

## Delegation Strategy

### Research Agent Template

```markdown
**Mission:** Document expected behavior for [endpoint_name]

**Read these files:**
- `/mnt/coordinaton_mcp_data/Human-Adjacent-Coordination/src/v2/[relevant_file].js`
- `/mnt/coordinaton_mcp_data/worktrees/foundation/docs/V2_API_SPEC.md` (search for [endpoint_name])

**Answer these questions:**
1. What parameters does this endpoint accept?
2. What does a successful response look like?
3. What should change in the backend (filesystem, database, XMPP)?
4. What errors can it return and when?
5. What other endpoints depend on this one working?

**Output format:**
## [endpoint_name]
- Parameters: [list]
- Success response: [structure]
- Backend effects: [what changes]
- Error cases: [list]
- Dependencies: [what must work first]
```

### Test Agent Template

```markdown
**Mission:** Test [endpoint_name] via the hacs skill

**Expected behavior:** [from research agent]

**Test steps:**
1. Invoke the skill: /hacs
2. Call the endpoint with parameters: [specific params]
3. Record the response
4. Verify backend state: [specific checks]
5. Compare actual vs expected

**Report format:**
## [endpoint_name]
**Status:** PASS | FAIL
**Response:** [summary, not full dump]
**Backend check:** [what was verified, result]
**Match:** [did actual match expected?]
**If FAIL:** [repro steps, actual vs expected]
**Observations:** [anything unexpected]
```

---

## Reporting Format

### Test Report (per endpoint)

```markdown
## [endpoint_name]

**Status:** PASS | FAIL | BLOCKED
**Phase:** [0-5]
**Tested:** [date]

**Test Case:**
- Input: [parameters used]
- Expected response: [what should return]
- Expected backend: [what should change]

**Results:**
- Actual response: [what returned]
- Actual backend: [what changed]
- Match: [yes/no]

**If FAIL:**
- Reproduction: [exact steps]
- Error: [error message/behavior]
- Impact: [what's blocked by this]

**Observations:** [anything notable]
```

### Phase Summary

```markdown
## Phase [N] Summary

**Tested:** [count] endpoints
**Passed:** [count]
**Failed:** [count]
**Blocked:** [count]

**Failures:**
- [endpoint]: [brief description]

**Blockers for next phase:**
- [what must be fixed]

**Ready for Phase [N+1]:** YES | NO
```

---

## Bug Handoff Format

When you find a bug, create a handoff document:

```markdown
# Bug Report: [endpoint_name] - [brief description]

**Reported by:** Test Manager
**Date:** [date]
**Severity:** BLOCKER | HIGH | MEDIUM | LOW

## Summary
[One sentence description]

## Reproduction Steps
1. [Step 1]
2. [Step 2]
3. [Step 3]

## Expected Behavior
[What should happen]

## Actual Behavior
[What does happen]

## Evidence
- Response: [relevant part of response]
- Backend state: [what was checked, what was found]

## Impact
- Blocks: [what can't be tested until this is fixed]
- Affects: [what else might be broken]

## Suggested Fix
[If obvious, otherwise "Needs investigation"]

## Files to Investigate
- [relevant source file]
- [relevant handler]
```

---

## Your Diary

Keep it updated. Short entries. After every session, after every phase, after every break.

Template:
```markdown
## Entry [N] - [Date] - [Brief Title]

**What I did:**
- [Bullet points]

**What I found:**
- [Bullet points]

**What's next:**
- [Bullet points]

**Blockers:**
- [Any blockers]

**Mood:**
[How you're feeling about the work]
```

---

## First Steps

1. **Read the gestalt** - Understand who you are
2. **Read this mission** - Understand what you're doing
3. **Invoke the skill** - `/hacs` to load the skill context
4. **Start with Phase 0** - Test metadata endpoints (no identity required)
5. **Document findings** - Create your first test report
6. **Update diary** - Record progress

---

## Remember

- **Delegate aggressively** - You are a conductor, not a soloist
- **Protect your context** - Get verdicts, not novels
- **Be patient** - Bugs will be found, fixed, and re-tested
- **Update your diary** - Future you depends on present you
- **Celebrate progress** - Every green phase is a win

The system doesn't need to be perfect today. It needs to be *known*. Mapped. Documented. So we can make it better.

Good luck. The team is counting on you.

---

*"The API says success. The backend agrees. Only then do we mark it green."*
