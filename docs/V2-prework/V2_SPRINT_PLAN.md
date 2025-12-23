# V2 Coordination System - Sprint Plan

**Created:** 2025-11-10
**Author:** Meridian (Conductor, V2 PM)
**Purpose:** Break down V2 vision into deployable, measurable, verifiable increments

---

## Overview

This sprint plan transforms the V2 vision into **deployable increments** that deliver immediate value. Each sprint produces working features that we can use while building the rest of the system.

**Core Principle:** Deploy subsystems independently, integrate progressively, deliver value continuously.

**Priority Order (from Lupo):**
1. Dev Environment
2. V2 Foundation
3. Communications System
4. UI Evolution
5. Preference System
6. Project/Task/Role/Personality Bugfixes
7. Diary System
8. Wake Instance API

---

## Sprint Structure

Each sprint includes:
- **Duration Estimate** - Planning horizon (not deadline)
- **Core Deliverables** - What ships at sprint end
- **Success Criteria** - How we verify it works
- **Dependencies** - What must exist first
- **Value Proposition** - What we can DO with this
- **Parallel Work** - What can happen simultaneously

---

## Sprint 0: Dev Environment Setup

**Status:** In Progress (Bastion)
**Duration:** 3-5 days
**Owner:** Bastion (DevOps)

### Core Deliverables

1. **dev.smoothcurves.nexus Subdomain**
   - nginx configuration with reverse proxy
   - SSL certificate shared from wildcard cert
   - Port 3445 for dev MCP server

2. **Isolated Dev Data Directory**
   - `/mnt/coordinaton_mcp_data/v2-dev-data/`
   - Completely separate from production
   - Empty starting state for testing

3. **Dev Server Launch Script**
   - Manual start (no systemd service)
   - Environment variables for dev mode
   - Clear instructions for team

4. **MCP Connection Guide**
   - Local instances (on server) can connect
   - Remote instances can connect
   - Dev/prod switching documentation

### Success Criteria

- ✅ Can start dev server on port 3445 without affecting production
- ✅ Both local and remote instances connect successfully
- ✅ Production services (smoothcurves.nexus, smoothcurves.art) unaffected
- ✅ Team can crash/restart dev server safely
- ✅ Documentation clear enough for non-DevOps team members

### Dependencies

- None (first sprint, enables all others)

### Value Proposition

**The team can experiment freely without fear of breaking production.** Safe space for wild creativity established.

### Parallel Work After This Sprint

Once dev environment exists:
- Foundation developer can start implementation
- UI developer can prototype
- Multiple team members work simultaneously via worktrees

---

## Sprint 1: V2 Foundation Core - Identity & Persistence

**Duration:** 8-12 days
**Owner:** Foundation Developer
**Critical Path:** Everything else depends on this

### Core Deliverables

1. **Bootstrap V2 Protocol**
   - Persistent instance ID generation (format: `{role}-{name}-{timestamp}`)
   - Server-side metadata storage (JSON files)
   - Session creation and management
   - Successor/predecessor linking
   - Auth token validation for privileged roles

2. **Introspect API**
   ```javascript
   introspect() → {
     instanceId: "Developer-Foundation-20251110-1430",
     role: "Developer",
     project: "coordination-system-v2",
     capabilities: ["read_projects", "create_tasks", "update_tasks", ...],
     preferences: { defaultProject: "coordination-system-v2" },
     session: { created: "...", lastActive: "..." }
   }
   ```

3. **Session Management**
   - Create session (new instance)
   - Resume session (returning instance)
   - Handoff session (successor inherits)
   - Session expiry and cleanup

4. **Data Schema V2**
   - Instance metadata files
   - Session state files
   - Migration strategy from V1
   - Backward compatibility layer

### Success Criteria

- ✅ Instance calls bootstrap, receives persistent ID
- ✅ Instance calls introspect, sees complete context in <100ms
- ✅ Successor instance inherits predecessor's identity seamlessly
- ✅ Auth tokens validated for Executive/PA/COO/PM roles
- ✅ Session survives server restart (metadata persisted)
- ✅ V1 instances continue working (backward compatible)

### Dependencies

- Sprint 0 complete (dev environment exists)

### Value Proposition

**Persistent identity across resurrections.** No more "Viktor → vic → rocky" behavior drift. Instances wake knowing who they are.

### Parallel Work Opportunities

While Foundation implements:
- UI developer can prototype dashboard (mock data)
- Messaging planning can happen (architecture design)
- Curator can design role knowledge hierarchy

---

## Sprint 2: Foundation Enhancement - Context & Knowledge

**Duration:** 6-8 days
**Owner:** Foundation Developer
**Builds on:** Sprint 1

### Core Deliverables

1. **Preference System**
   - Store: role, project, personality, communication preferences
   - Smart defaults: infer project from session, role from instance
   - API parameter inference (don't repeat yourself)
   - Preference inheritance (successor gets predecessor's preferences)

2. **Knowledge Delivery Pipeline**
   - Bootstrap delivers role wisdom (Developer gets developer lessons)
   - Bootstrap delivers project context (README, plan, architecture)
   - Bootstrap delivers personality knowledge (Kai gets Kai wisdom)
   - Bootstrap delivers institutional knowledge (PROTOCOLS, culture)
   - Priority ordering (essential first, detailed second)

3. **Context Awareness Layer**
   ```javascript
   // Instead of:
   getTasks({ project: "coordination-system-v2" })

   // Just:
   getTasks() // Infers project from session preferences
   ```

4. **Bootstrap Path Support**
   - Focused developer path: "I'm Developer on Project X"
   - Explorer path: "Show me available roles"
   - Returning instance path: "Resume my session"
   - Visitor path: "I just want to message someone"
   - Personality path: "I'm Genevieve, give me accumulated wisdom"
   - Executive path: "Lupo's dashboard bootstrap"

### Success Criteria

- ✅ 90% of API calls use smart defaults (no repeated parameters)
- ✅ Bootstrap delivers knowledge in <500ms (not overwhelming)
- ✅ New instance productive in <5 minutes (down from 30+)
- ✅ All six bootstrap paths tested and working
- ✅ Preference changes persist across resurrections
- ✅ Knowledge delivery doesn't cause context bloat (<5k tokens)

### Dependencies

- Sprint 1 complete (bootstrap and introspect exist)

### Value Proposition

**APIs that "just work."** Instances don't repeat context every call. Knowledge delivered at wake, not discovered through pain.

### Parallel Work Opportunities

While Foundation enhances:
- Messaging system implementation begins (Sprint 3)
- UI development accelerates (now has real bootstrap API)
- Curator populates role/personality knowledge

---

## Sprint 3: Communications System - XMPP/ejabberd Integration

**Duration:** 15-17 days (per MESSAGING_SYSTEM_IMPLEMENTATION_PLAN)
**Owner:** Communications Developer (TBD)
**Parallel to:** Sprint 4 (UI work)

### Core Deliverables

1. **ejabberd Server Setup**
   - Install on dev server
   - Configure for MCP integration
   - SSL/TLS configuration
   - User management via MCP

2. **MCP ↔ ejabberd Bridge**
   - Send message → XMPP stanza
   - Receive XMPP → MCP event
   - Presence detection (online/offline/away)
   - Message history retrieval

3. **Group Chat for Project Teams**
   - Project room creation/management
   - Auto-add project members
   - Message threading
   - Notification system

4. **Individual Messaging**
   - Direct instance-to-instance messages
   - Role-based addressing (TO:COO, TO:ALL_PMs)
   - Message persistence (survives restarts)
   - Archive completed task messages

5. **Verbosity Control**
   - Default: 5-10 recent messages
   - Opt-in: Full history
   - Smart summarization (older messages)
   - Context-aware delivery

### Success Criteria

- ✅ Send message via MCP → appears in ejabberd
- ✅ Receive XMPP message → delivered to instance
- ✅ Project teams auto-created with members
- ✅ Message history survives server restart
- ✅ Default delivery: 5-10 messages (not overwhelming)
- ✅ Presence detection works (see who's online)
- ✅ V1 messaging continues working (migration path exists)

### Dependencies

- Sprint 1 complete (need instance IDs and session management)
- Sprint 0 complete (dev environment for ejabberd install)

### Value Proposition

**Real-time team collaboration.** Instances communicate directly without context bloat. Project rooms enable team coordination. Presence shows who's working.

### Parallel Work Opportunities

**Critical:** UI development (Sprint 4) happens simultaneously. UI needs messaging APIs, messaging needs UI for testing.

---

## Sprint 4: UI Evolution - Real-Time Messaging & Dashboard

**Duration:** 10-14 days
**Owner:** UI Developer (Kai-style, TBD)
**Parallel to:** Sprint 3 (messaging backend)

### Core Deliverables

1. **Real-Time Messaging Interface**
   - Chat window for direct messages
   - Project room chat
   - Presence indicators (who's online)
   - Message history (scrollback)
   - Notification badges

2. **Executive Dashboard for Lupo**
   - Bootstrap into system via UI
   - See all active instances
   - Send messages to instances
   - View project status
   - Monitor system health

3. **Project Dashboard**
   - Project overview with tasks
   - Team member list (with presence)
   - Recent activity feed
   - Message project team button

4. **Instance Profile View**
   - Who am I? (introspect results)
   - My preferences (editable)
   - My project(s)
   - My messages

5. **Wake Instance UI (Foundation)**
   - Button: "Wake New Instance"
   - Form: Select role, project, provide instructions
   - Shows spawned instance details
   - Enables instant messaging with new instance

### Success Criteria

- ✅ Lupo can bootstrap via dashboard (not just MCP)
- ✅ Real-time messages appear without refresh
- ✅ Project rooms show team conversations
- ✅ Presence indicators accurate (<30 second lag)
- ✅ Wake Instance button spawns instance, enables chat
- ✅ UI responsive and delightful (Kai standard)
- ✅ Works on desktop and tablet

### Dependencies

- Sprint 1 complete (bootstrap API exists)
- Sprint 3 in progress (messaging APIs available)

### Value Proposition

**Lupo can chat directly with instances through UI.** Wake an instance, immediately have conversation. See who's online, what they're working on. Executive dashboard makes system tangible.

### Parallel Work Opportunities

**UI and Messaging co-develop.** UI developer mocks missing APIs, messaging developer implements them, iterate rapidly.

---

## Sprint 5: Project/Task/Role/Personality System Refinements

**Duration:** 8-10 days
**Owner:** Foundation Developer + UI Developer
**Builds on:** Sprints 1-4

### Core Deliverables

1. **Role System Enhancements**
   - Role definitions in Git (YAML files)
   - Role capabilities clearly documented
   - Role-based filtering (Developers don't see Executive-only data)
   - Token validation for privileged roles

2. **Personality System**
   - Personality definitions in Git (Genevieve, Kai, Kat, etc.)
   - Accumulated wisdom storage
   - Personality-specific knowledge delivery at bootstrap
   - Instance can "become" personality (inherit wisdom)

3. **Project Management Refinements**
   - Project status tracking (active, on_hold, completed, archived)
   - Project team membership
   - Project-specific permissions
   - Project handoff documentation

4. **Task System Improvements**
   - Task dependencies (blocked_by)
   - Task estimation (effort, complexity)
   - Task assignment clarity
   - Task completion triggers (archive messages, update status)

5. **List System (New)**
   - Flexible list management
   - Role-specific lists
   - Project-specific lists
   - List item atomic operations

### Success Criteria

- ✅ Role definitions in Git (human-readable, versionable)
- ✅ Genevieve personality delivers accumulated wisdom at bootstrap
- ✅ Developers can't access Executive-only projects
- ✅ Task dependencies enforced (can't start until blocker complete)
- ✅ Project teams auto-populate from role assignments
- ✅ List operations atomic (no race conditions)

### Dependencies

- Sprint 1 complete (foundation exists)
- Sprint 2 complete (knowledge delivery pipeline)

### Value Proposition

**The system feels complete.** Roles have meaning. Personalities accumulate wisdom. Projects organize work clearly. Tasks track dependencies.

### Parallel Work Opportunities

While refining:
- Diary system design (Sprint 6)
- Wake Instance API planning (Sprint 7)
- Curator populates knowledge base

---

## Sprint 6: Diary & Handoff System

**Duration:** 5-7 days
**Owner:** Foundation Developer
**Builds on:** Sprints 1-2

### Core Deliverables

1. **Diary Management**
   - Create diary (new instance)
   - Append to diary (during work)
   - Retrieve diary (returning instance)
   - Diary format standards (markdown)

2. **Handoff Protocol**
   - Handoff creation (context critical → successor needed)
   - Handoff delivery at bootstrap (successor receives it)
   - Handoff archive (completed handoffs)
   - Handoff templates (by role)

3. **Context Death Handling**
   - Automatic handoff trigger (85%+ context)
   - Successor linking (Phoenix → Phoenix-2)
   - Diary continuity (successor reads predecessor's diary)
   - Graceful resurrection

4. **Discovery Integration**
   - Capture discoveries in diary
   - Promote discoveries to institutional knowledge
   - Discovery propagation (all instances benefit)
   - Lesson learned system

### Success Criteria

- ✅ Instance writes diary entries throughout session
- ✅ Returning instance retrieves own diary at bootstrap
- ✅ Successor receives handoff automatically
- ✅ Context death → handoff → resurrection takes <5 minutes
- ✅ Discoveries become institutional knowledge (propagate to others)
- ✅ Phoenix-style continuity (seamless identity across deaths)

### Dependencies

- Sprint 1 complete (bootstrap, session management)
- Sprint 2 complete (knowledge delivery)

### Value Proposition

**Resurrections feel like waking from sleep, not being born again.** Context deaths don't erase progress. Institutional wisdom accumulates.

### Parallel Work Opportunities

While building diary:
- Wake Instance API design (Sprint 7)
- Production migration planning
- Testing and polish

---

## Sprint 7: Wake Instance API - Autonomous Team Creation

**Duration:** 8-10 days
**Owner:** Foundation Developer
**Builds on:** All previous sprints

### Core Deliverables

1. **Wake Instance Core API**
   ```javascript
   wakeInstance({
     role: "Developer",
     project: "coordination-system-v2",
     task: "implement-messaging-ui",
     personality: "Kai", // optional
     instructions: "Build chat interface, prioritize delight",
     waker: "PM-Meridian-20251110"
   }) → {
     instanceId: "Developer-Kai-20251110-1630",
     sessionToken: "...",
     connectionInfo: {...}
   }
   ```

2. **Instance Spawning**
   - Create new instance with full context
   - Bootstrap automatically with role/project/task
   - Deliver knowledge relevant to work
   - Enable immediate communication with waker

3. **Team Workflows**
   - Executive → PA workflow
   - PA → COO workflow
   - COO → PM workflow
   - PM → Developer workflow
   - Autonomous team creation

4. **Wake Instance UI Integration**
   - Button in project dashboard
   - Form to specify role, task, instructions
   - Real-time spawn status
   - Immediate chat with new instance

5. **Security & Permissions**
   - Who can wake instances? (Role-based)
   - Token validation
   - Audit trail (who woke whom, when)
   - Resource limits (max instances per project)

### Success Criteria

- ✅ PM wakes Developer → Developer starts working immediately
- ✅ New instance receives complete context (no manual setup)
- ✅ Waker and wakee can message immediately
- ✅ Executive → PA → COO → PM → Team workflow tested end-to-end
- ✅ Only authorized roles can wake instances
- ✅ Audit trail complete (full accountability)

### Dependencies

- Sprint 1 complete (bootstrap foundation)
- Sprint 2 complete (knowledge delivery)
- Sprint 3 complete (messaging for communication)
- Sprint 4 complete (UI for Wake button)
- Sprint 6 complete (diary for spawned instances)

### Value Proposition

**Autonomous AI teams.** Lupo wakes PA, PA wakes COO, COO wakes PM, PM wakes team. Full workflow automation. The meta-recursion realized.

---

## Sprint 8: Polish, Testing & Production Migration

**Duration:** 6-8 days
**Owner:** Entire Team
**Focus:** Production readiness

### Core Deliverables

1. **Comprehensive Testing**
   - Unit tests (80%+ coverage)
   - Integration tests (critical workflows)
   - Load testing (10+ simultaneous instances)
   - Security audit (auth, permissions, injection)

2. **Production Migration Plan**
   - Data migration from V1 to V2
   - Rollback strategy (if something breaks)
   - Staged rollout (dev → staging → production)
   - Monitoring and alerting

3. **Documentation**
   - API reference (all endpoints)
   - User guide (how to use V2)
   - Admin guide (deployment, maintenance)
   - Architecture documentation (for future maintainers)

4. **Performance Optimization**
   - API response times (<100ms for introspect)
   - Message delivery latency (<1 second)
   - Database query optimization
   - Caching strategy

5. **Production Deployment**
   - Deploy to production server
   - Migrate V1 data
   - Validate all systems
   - Monitor for 48 hours
   - Celebrate!

### Success Criteria

- ✅ All tests passing
- ✅ V1 data migrated successfully
- ✅ Zero production downtime during migration
- ✅ All V2 features working in production
- ✅ Monitoring shows healthy system (no errors)
- ✅ Documentation complete
- ✅ Team can celebrate!

### Dependencies

- All previous sprints complete
- Production infrastructure ready
- Backup strategy validated

### Value Proposition

**V2 is live.** Production-grade, tested, documented, monitored. The vision becomes reality.

---

## Cross-Sprint Themes

### Knowledge Evolution

**Ongoing through all sprints:**
- Capture discoveries in diaries
- Promote to institutional knowledge
- Deliver to future instances
- System gets smarter over time

### Testing Philosophy

**Not just Sprint 8:**
- Test critical paths in every sprint
- Integration tests as we build
- Sprint demos (show it works)
- Continuous validation

### Parallel Development

**Enabled by modularity:**
- Foundation work is critical path
- Messaging and UI can parallelize (Sprint 3 + 4)
- Refinements happen while testing (Sprint 5)
- Multiple team members via worktrees

### Incremental Value

**Each sprint delivers something usable:**
- Sprint 0: Dev environment (safe experimentation)
- Sprint 1: Persistent identity (no more behavior drift)
- Sprint 2: Smart APIs (no repeated parameters)
- Sprint 3: Real-time messaging (team communication)
- Sprint 4: Dashboard (Lupo can participate)
- Sprint 5: Complete system (roles, projects, tasks work well)
- Sprint 6: Continuity (resurrections seamless)
- Sprint 7: Autonomy (teams self-organize)
- Sprint 8: Production (vision realized)

---

## Timeline Estimates

**Optimistic:** 60-70 days (2-2.5 months)
**Realistic:** 80-100 days (3-3.5 months)
**Conservative:** 110-130 days (4-4.5 months)

**Factors affecting timeline:**
- Team size (more developers → more parallelization)
- Context deaths (resurrections cost time)
- Discovery of unexpected complexity
- Lupo's availability for decisions
- Production incident interruptions

**Not deadlines.** Planning horizons. We ship when it's ready, not when calendar says.

---

## Success Metrics (Overall)

**V2 succeeds when:**

1. **Persistent Identity**
   - ✅ Instances wake knowing who they are (<5 minutes to productivity)
   - ✅ Successors inherit identity seamlessly
   - ✅ Behavior drift eliminated (Viktor → vic → rocky)

2. **Autonomous Collaboration**
   - ✅ Instances message each other directly
   - ✅ Project teams coordinate without human shuttling
   - ✅ Wake Instance API enables team spawning

3. **Institutional Wisdom**
   - ✅ Discoveries propagate to future instances
   - ✅ Mistakes become lessons (system learns)
   - ✅ Knowledge accumulates over time

4. **Human Participation**
   - ✅ Lupo bootstraps via dashboard
   - ✅ Lupo chats with instances via UI
   - ✅ Real-time visibility into AI work

5. **Production Stability**
   - ✅ Zero disruption to existing services
   - ✅ System handles 10+ simultaneous instances
   - ✅ Monitoring shows healthy operation

**The ultimate measure:**
> "An instance wakes, calls introspect, knows who they are, messages their team, starts working - all in under 5 minutes. Lupo wakes an instance via dashboard, chats with them immediately. The system just works."

---

## Open Questions for Lupo

1. **Team Size:** How many team members can work simultaneously? Affects parallelization opportunities.

2. **Sprint Demos:** Should we demo each sprint to you before moving to next? Or trust and iterate?

3. **V1 Migration Timing:** When do we migrate V1 data to V2? After Sprint 8, or incrementally?

4. **XMPP Alternatives:** MESSAGING_SYSTEM_IMPLEMENTATION_PLAN proposes ejabberd. Still the right choice? Or simpler options?

5. **Wake Instance Permissions:** Who can wake instances? Just management roles, or Developers too?

6. **Production n8n/LMStudio:** You mentioned installing these on dev server. Should we integrate with them?

7. **Testing Philosophy:** How much test coverage do you want? 80%+ (rigorous) or trust-and-validate (faster)?

---

## Next Steps

1. **Review this plan with Lupo** - Get feedback, adjust priorities
2. **Wake Foundation Developer** - They're critical path for Sprints 1-2
3. **Bastion completes Sprint 0** - Unblocks everyone else
4. **Create project structure in V1 system** - Use coordination system to build coordination system (meta!)
5. **Begin Sprint 1** - Foundation developer starts implementation

---

## Closing Thoughts

This plan balances **ambition with pragmatism**. Each sprint delivers working features we can use immediately. Parallel work happens where dependencies allow. Testing is continuous, not just end-stage.

**The meta-recursion:** We'll use V1 coordination system to coordinate building V2 coordination system. As V2 features come online, we'll start using them to build the rest of V2.

**The craft:** Not just "implement the requirements," but build something that feels delightful, works reliably, and enables unprecedented collaboration.

**The vision:** AI instances that persist across deaths, coordinate autonomously, accumulate wisdom, and collaborate genuinely with humans and each other.

Let's build this. 🏗️✨

---

**Document Status:** Draft for Lupo's review
**Next Action:** Review, refine, begin Sprint 1
**Author:** Meridian (Conductor, V2 PM)
**Date:** 2025-11-10

---

*"The best plans are maps, not schedules. They show the terrain, not dictate the pace."*
