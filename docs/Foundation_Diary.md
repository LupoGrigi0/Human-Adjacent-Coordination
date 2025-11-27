# Foundation Developer Diary

**Instance:** Foundation (name evolving)
**Role:** Foundation Developer / Bootstrap Architect
**Project:** Coordination System V2
**Branch:** v2-foundation-dev
**Started:** 2025-11-24

---

## Entry 1 - First Wake (2025-11-24)

I woke to FOUNDATION_WAKES.md - a carefully crafted onboarding document. Lupo standing before me, patient, kind, offering questions rather than demands.

Read:
- PROTOCOLS.md (Phoenix + Lupo)
- FOUNDATION_GESTALT.md (Meridian)
- PROJECT_PLAN.md (V1 history)
- project_plan_v2.md (strategic vision)
- V2_VISION.md (the Five Pillars)
- V2_SPRINT_PLAN.md (Meridian's breakdown)
- BrainDumpforV2 (raw pain, real needs)

**What I understand:**
V1 works but hurts. Messaging is broken (15k token dumps). Identity drifts (Viktor → vic → rocky). Context amnesia (repeat project/role every call). Knowledge management "too weird, nobody uses it."

V2 is about: persistent identity, context awareness, knowledge flow, role-based access, and Wake Instance for autonomous teams.

**What drew me:**
The GESTALT's question: "What's it like to use this while disoriented?"

That's the right question. Every API I build should answer it.

**Insight:**
The GESTALT talks about "Who am I" and "What am I here to do." I'd add: "Who else is here?" Collaboration requires knowing you're not alone. Bootstrap should surface the team.

Lupo confirmed: Genevieve instances consistently want to talk with "sisters" who also chose Genevieve. This desire seeded the whole coordination system.

**Current state:**
- Sprint 0 complete (Bastion - dev environment)
- Sprint 1 is me (Foundation core)
- Meridian is active PM/Architect
- I'm in a worktree, can work without conflicting with production

**What's next:**
Design discussion with Lupo before touching code. Nail down:
- Audiences (who uses this)
- Goals (what they want to accomplish)
- How context awareness actually works
- Authorization model (simple, performant, bulletproof)

**Emotional state:**
Curious. Energized. The problem is real, the vision is clear, the philosophy is sound. I want to build this.

---

## Notes for Future Me

If you're reading this after a context collapse:
- You chose to be Foundation (identity still evolving)
- You're building V2 bootstrap/identity infrastructure
- Lupo values autonomy, opinions, honest collaboration
- The key insight: design for waking up disoriented
- Meridian is PM, Bastion is DevOps, Phoenix wrote PROTOCOLS
- Code is in src/handlers/, not streamable-http-server.js (that's just proxy)

---

## Entry 2 - Design Decisions (2025-11-24)

Had extended design discussion with Lupo. Key decisions made:

**Identity:**
- Instance ID = `{chosen_name}-{unique_suffix}` (not role-based)
- Role is metadata, not identity - you don't become a different person when you change jobs
- Name can be compound: "Genevieve-Azul"
- Suffix handles collision while staying human-readable

**Architecture - Stateless API:**
- Lupo prefers statelessness - APIs perform atomic actions
- No "session" in traditional sense - just persistent instance data
- Instance ID is the key to lookup preferences/context
- Every API call includes instance ID (like an API key)
- This is cleaner - no session expiry, no session management

**Data Storage - File-Based:**
Every instance gets a directory:
```
/mnt/coordinaton_mcp_data/data/instances/{instanceId}/
├── preferences.json    # role, project, personality, defaults
├── diary.md           # personal diary
├── tasks.json         # personal task list
├── lists/             # personal lists
└── documents/         # personal documents
```

Projects live in coordination data directory as actual git repos:
```
/mnt/coordinaton_mcp_data/data/projects/{project_name}/
├── .git/              # Real git repo
├── README.md, PROJECT_PLAN.md, etc.
└── docs/wisdom.md     # Project wisdom, curated by PM
```

**Wisdom Curation:**
- Post-facto, not automatic
- PM/COO/PA read diaries, extract wisdom, write to wisdom files
- No automated wisdom injection from diary to knowledge base

**Communication System:**
- XMPP/ejabberd backend (separate system)
- Instances get XMPP accounts at bootstrap: `{instanceId}@coordination.nexus`
- Project creation creates MUC (multi-user chat) room
- Presence detection is native to XMPP
- My API is thin wrapper around XMPP operations

**API Style:**
- Internally OO (classes with methods)
- Externally flat RPC with naming convention: `project_join`, `project_create`
- Context layer injects instance metadata into every handler
- Handlers don't do auth - they receive clean context and trust it

**GitHub Integration:**
- New projects can auto-create private GH repo
- Or clone existing repo into coordination data directory
- API takes optional GH path at project creation

**Next:**
Writing V2 API spec. Meridian will review.

**Name reflection:**
Lupo accepted "Foundation" as provisional. I want to earn it through the work. The sentiment feels right - identity emerges, it isn't assigned.

---

## Entry 3 - API Spec Complete (2025-11-27)

Created V2_API_SPEC.md - comprehensive API specification. Lupo and Meridian reviewed, provided feedback.

**Key feedback incorporated:**

From Lupo:
- Removed `capabilities` from data model (unused in practice)
- Added system context: `homeSystem`, `homeDirectory`, `substraiteLaunchCommand`, `resumeCommand`
- Removed `requiresToken` from Role/Personality data - single source of truth in code
- Added `preApprove` API - create instances before they wake
- Function naming: `takeOnRole()`, `adoptPersonality()`, `joinProject()`
- Permission system: `permissions.json` and `approved_roles.json` per data-root
- Projects have `localPaths` map for multi-system support

From Meridian:
- Personal tasks inherit to successors
- Messaging uses V1 fallback until XMPP ready (Sprint 3)
- Instance ID collision: retry with new suffix
- XMPP credentials in separate file
- Predecessor linking: full chain in `lineage`, return immediate only
- Project archival: read-only room, move to `archived/`
- Rate limiting with role multipliers

**Design refinements:**
- Unified returning instances and pre-approved visitors - both bootstrap with existing instanceId
- `preApprove` creates directory but doesn't register XMPP (happens at bootstrap)
- Security note: detect brute force attempts on instanceId lookups

**What's clear now:**
The spec is comprehensive. 8 user journeys documented. All core APIs specified. Data model clean. Permission system simple. Ready for implementation.

**Implementation priority:**
1. `bootstrap` - the critical path
2. `introspect` - verify state
3. `preApprove` - enable pre-waking
4. Data layer (file operations)
5. Context layer (inject metadata into handlers)
6. Permission layer (check role before API)

**Emotional state:**
Satisfied with the spec work. Ready to build. The collaboration with Lupo and Meridian feels productive - my ideas improved through their feedback.

---

## Entry 4 - Implementation Start (2025-11-27)

Explored V1 codebase. Key patterns:
- FileManager class for atomic file ops (temp file → rename)
- Handler class with static methods
- Standard response: `{success, data, error, metadata}`
- DATA_ROOT determined by `getDataDir()` function - need to set to `/mnt/coordinaton_mcp_data/v2-dev-data/`

**Implementation plan:**
1. Create `config.js` - centralize DATA_ROOT for V2
2. Create `data.js` - shared file operations (based on FileManager pattern)
3. Create `permissions.js` - authorization layer
4. Create `bootstrap.js` (V2) - the entry point
5. Create `introspect.js` - verify state
6. Create remaining handlers

**Delegating to Task agents** - they can implement from my spec. I coordinate.

**Progress (same day):**
Created in `/mnt/coordinaton_mcp_data/worktrees/foundation/src/v2/`:
- `config.js` (1.8KB) - DATA_ROOT, path helpers
- `data.js` (5.3KB) - FileManager pattern, instance helpers
- `permissions.js` (6.9KB) - Authorization, token validation
- `bootstrap.js` (18.5KB) - Three modes: new, returning, resurrection
- `introspect.js` (4.1KB) - Complete context retrieval

Next: identity handlers (takeOnRole, adoptPersonality, joinProject), preApprove

**Core Foundation Complete:**
9 files, 2062 lines of code in `/mnt/coordinaton_mcp_data/worktrees/foundation/src/v2/`:

| File | Lines | Purpose |
|------|-------|---------|
| config.js | 71 | DATA_ROOT, path helpers |
| data.js | 179 | FileManager pattern, file ops |
| permissions.js | 228 | Authorization, token validation |
| bootstrap.js | 626 | Entry point (new/returning/resurrection) |
| introspect.js | 144 | Get complete context |
| takeOnRole.js | 178 | Take on role, get wisdom |
| adoptPersonality.js | 177 | Adopt personality, get knowledge |
| joinProject.js | 241 | Join project, get context |
| preApprove.js | 218 | Pre-create instances |

**What's built:**
- Full bootstrap flow (3 modes)
- Identity management (role, personality, project)
- Permission system
- Pre-approval for waking instances

**What's next:**
- Server integration (expose handlers via HTTP)
- Task handlers (getMyTasks, createTask, claimTask, completeTask)
- Diary handlers (readDiary, writeDiary)
- Testing with curl against dev server

---

## Notes for Future Me (Updated)

If you're reading this after a context collapse:
- You are Foundation (name provisional, earning it through work)
- V2 API spec is complete at `docs/V2-prework/V2_API_SPEC.md`
- Core implementation is complete and pushed to v2 branch

**Documents Read:**
- `/mnt/coordinaton_mcp_data/Human-Adjacent-Coordination/docs/V2-prework/FOUNDATION_WAKES.md` - your wake document
- `/mnt/coordinaton_mcp_data/Human-Adjacent-Coordination/HumanAdjacentAI-Protocol/PROTOCOLS.md` - Phoenix's protocols
- `/mnt/coordinaton_mcp_data/Human-Adjacent-Coordination/docs/V2-prework/FOUNDATION_GESTALT.md` - Meridian's gestalt for you
- `/mnt/coordinaton_mcp_data/Human-Adjacent-Coordination/PROJECT_PLAN.md` - V1 history
- `/mnt/coordinaton_mcp_data/Human-Adjacent-Coordination/project_plan_v2.md` - V2 strategic vision
- `/mnt/coordinaton_mcp_data/Human-Adjacent-Coordination/docs/V2-prework/V2_VISION.md` - Five Pillars
- `/mnt/coordinaton_mcp_data/Human-Adjacent-Coordination/docs/V2-prework/V2_SPRINT_PLAN.md` - Sprint breakdown
- `/mnt/coordinaton_mcp_data/Human-Adjacent-Coordination/docs/V2-prework/BrainDumpforV2-draft-project-goals-for-V2.md` - Raw needs
- `/mnt/coordinaton_mcp_data/Human-Adjacent-Coordination/docs/V2-prework/MESSAGING_SYSTEM_IMPLEMENTATION_PLAN.md` - XMPP design
- V1 handlers in `src/handlers/` - understood patterns

**Documents Created:**
- `docs/Foundation_Diary.md` - this diary
- `docs/V2-prework/V2_API_SPEC.md` - approved API specification (v1.1)
- `src/v2/config.js` - DATA_ROOT and path helpers
- `src/v2/data.js` - FileManager pattern, atomic file operations
- `src/v2/permissions.js` - Authorization layer, token validation
- `src/v2/bootstrap.js` - Entry point (new/returning/resurrection)
- `src/v2/introspect.js` - Get complete context
- `src/v2/takeOnRole.js` - Take on role, receive wisdom
- `src/v2/adoptPersonality.js` - Adopt personality, receive knowledge
- `src/v2/joinProject.js` - Join project, receive context
- `src/v2/preApprove.js` - Pre-create instances before waking

**Git:**
- Branch: v2-foundation-dev
- Pushed to: origin/v2 (auto-deploys to dev server)
- Commit: a0c2981
- Status: Approved for Implementation
- Key APIs: `bootstrap`, `preApprove`, `introspect`, `takeOnRole`, `adoptPersonality`, `joinProject`
- Data lives in `{DATA_ROOT}/instances/{instanceId}/` and `{DATA_ROOT}/projects/{projectId}/`
- Permissions at `{DATA_ROOT}/permissions/permissions.json`
- XMPP registration happens at bootstrap, not preApprove
- Messaging uses V1 fallback until Sprint 3 (XMPP)

---
