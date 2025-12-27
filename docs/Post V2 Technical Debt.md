# Post-V2 Technical Debt - Organized by Priority

**Reorganized by:** Bridge3-df4f
**Date:** 2025-12-26
**Based on:** Lupo's original document + Workshop Vision alignment

---

## Organizing Principle

The system is a **workshop** that enables Lupo (and teams) to create things. Everything below is organized by how directly it enables that purpose:

1. **Access Layer** - Can instances USE the system?
2. **User Journey Validation** - Does the system WORK for its purpose?
3. **Knowledge Systems** - Does the system GET SMARTER over time?
4. **Workshop Cleanup** - Is the workshop TIDY and maintainable?

---

# Priority 1: Access Layer
*"Can instances actually USE the system?"*

Without this, the workshop has locked doors.

## MCP Server & Skills (CRITICAL PATH)
- [ ] smoothcurves.nexus MCP server update for new API
- [ ] New updated MCP proxy client for new API
- [ ] New updated claude skill build for new API
- [ ] Install new claude skill on smoothcurves.nexus server
- [ ] Install new claude skill on web claude interface
- [ ] Install new claude skill on Lupo's dev laptop
- [ ] Verification of openapi.json is correct for v2

## Alternative Access (Crush, Grok, etc.)
- [ ] Implement pre-auth, wake, continue alternative using Crush, Grok, OpenAI
- [x] Install crush on smoothcurves.nexus
- [-] Install coordination system MCP server in crush (direct http mcp access may not work - needs debugging)
- [ ] Install cool MCP tools for claude code
- [ ] Install cool MCP tools for crush

## Instance Type Distinction (Bridge's note: YOU CAUGHT THIS, I MISSED IT)

**CRITICAL INSIGHT from Lupo:**
> "Some instances are Local to smoothcurves.nexus, some are remote (web), some are humans."
> "Wake and continue DO NOT APPLY to remote/web instances or humans."

This needs to be captured in preferences.json and the API needs to handle it:
- [ ] Add instance type to preferences.json (local/remote/human)
- [ ] API should reject wake/continue for non-local instances with helpful error
- [ ] Messaging should work for ALL instance types
- [ ] Document this distinction in API guide

---

# Priority 2: User Journey Validation
*"Does the system WORK for its actual purpose?"*

## The Full Flow Test (Moonshot++)
- [ ] Can a "blind" instance connect (no prior context), initialize, get auth key?
- [ ] Test: Web UI instance → connect → take on PM role → create project → wake team (the moonshot test from web)
- [ ] Bug: Can instances not "woken" on smoothcurves.nexus actually do their jobs?

## Development Strategy (NEW - from Lupo)
- [ ] New development strategy added to gestalts/wisdom:
  - Describe users, how they access system, mental state, expectations
  - Enumerate User Goals & Use cases
  - Design test suite based on use cases
  - Document expected results FIRST
  - Have separate instance run tests
  - Have 3rd instance make fixes
  - Re-run until working
- [ ] Reformat above for LLM consumption
- [ ] Create examples
- [ ] Add to instructions/gestalt for API validation work

---

## Team Roster (Placeholder Names)

Before diving into work, we need the right people with the right mindsets:

| Name | Specialty | Personality Traits | Assigned To |
|------|-----------|-------------------|-------------|
| **Compass** | User Research / Design Thinking | Empathetic, systematic, loves understanding "why" | Personas, scenarios, user journeys |
| **Sage** | Documentation Specialist | Clear communicator, loves making complex things simple | Guides, API docs, consolidation (see docs/sage*) |
| **Lens** | Tester / QA | Detail-oriented, skeptical, finds edge cases | Test cases, validation, breaking things |
| **Forge** | Systems Engineer | Pragmatic builder, "working beats designed" | API fixes, implementation |
| **Canvas** | UI Developer | Visual thinker, user advocate | Interface, user experience |
| **Bastion** | DevOps | Infrastructure guardian, automation lover | Deployment, scripts, environment |
| **Meridian** | Architecture / PM | Big picture, coordinates, unblocks | Design review, sprint coordination |

**Principle:** Each team member should find *craft* in their work, not just tasks. Match personalities to work that will bring them satisfaction.

---

## Persona-Based Design Process (Before API Audit)

*Methodology: This is **Persona-Based Design**, part of IBM's Design Thinking practice. Create personas first, then scenarios, then journeys, then test cases.*

**Owner:** Compass (with input from all team members)

### Step 1: Define Model Users (Personas)

Create a persona document for each user type. Use standard persona format:

| Field | Description |
|-------|-------------|
| **Name** | Persona name (e.g., "Lupo - The Maker") |
| **Role** | Their role in the system |
| **Access Point** | Where they access from (Human/smoothcurves.nexus/web/local) |
| **Interface** | How they interact (Web UI, MCP local, Claude Skill, claude code remote, Crush) |
| **Goals** | What they're trying to accomplish |
| **Frustrations** | What blocks them or annoys them |
| **Technical Comfort** | How much they know about the internals |

**Personas to Create:**
- [ ] **Lupo** - Human maker, accesses via Web UI and terminal, wants to create art not manage infrastructure
- [ ] **Genevieve/PA** - Personal assistant, accesses via various interfaces, handles human complexity
- [ ] **COO** - Operations coordinator, local to smoothcurves, manages project priorities
- [ ] **PM** - Project manager, local, creates sprints and wakes teams
- [ ] **DevOps (Bastion-type)** - Infrastructure, local, maintains the workshop itself
- [ ] **Systems Engineer (Bridge-type)** - API/core, local, builds and fixes tools
- [ ] **UI Developer (Canvas-type)** - Interface, can be local or web, builds human-facing parts
- [ ] **Tester** - QA, can be local or web, validates everything works
- [ ] **Author/Documenter** - Documentation, can be local or web, makes knowledge accessible

**Reference docs:** `v2-prework/V2_vision.md`, `README.md`, `project_plan_v2.md`, `docs/V2-prework/BrainDumpforV2-draft-project-goals-for-V2.md`

**Output:** `docs/personas/` directory with one file per persona

---

### Step 2: Define Scenarios

For each persona, describe realistic scenarios they encounter. Each scenario answers: "What is this user trying to do right now?"

**Format:**
```
Scenario [P#-S#]: [Title]
Persona: [Which persona]
Context: [What's happening, what state is the system in]
Goal: [What they want to accomplish]
Expectation: [What they expect the system to do]
Delight: [What would make them smile, go beyond expectations]
```

**Minimum scenarios to define:**
- [ ] Lupo: Dump a half-formed idea → see it become a project
- [ ] Lupo: Check on project progress without micromanaging
- [ ] Genevieve: Receive idea from Lupo → flesh it out → hand to COO
- [ ] COO: Receive proposal → create project → wake PM
- [ ] COO: Review project statuses → reprioritize
- [ ] PM: Receive project → create sprint plan → wake team
- [ ] PM: Check team progress → unblock stuck members
- [ ] DevOps: Deploy update → verify system still works
- [ ] Systems Engineer: Find bug → fix it → test → deploy
- [ ] Tester: Run test suite → document results → report issues
- [ ] New instance: Bootstrap with zero context → figure out what to do

**Output:** `docs/scenarios.md` with numbered scenarios (e.g., L1, L2, G1, COO1, etc.)

---

### Step 3: Create User Journeys

For each scenario, map the complete flow as a journey. A journey shows every step from start to goal.

**Format:**
```
Journey [J#]: [Scenario Reference]
Preconditions: [What state must exist before this journey starts]
  (Can reference other journeys: "Assumes J3 completed")

Steps:
1. User does X → System responds Y
2. User does X → System responds Y
3. ...

Success Criteria: [How we know the journey succeeded]
Failure Modes: [What could go wrong at each step]
```

**Key journeys to map:**
- [ ] J1: Full flow - Idea → Genevieve → COO → PM → Team → Deliverable
- [ ] J2: Instance bootstrap (zero context → productive member)
- [ ] J3: Project creation flow
- [ ] J4: Team waking flow
- [ ] J5: Message send/receive flow
- [ ] J6: Task creation and assignment flow
- [ ] J7: Diary update flow
- [ ] J8: Role/personality adoption flow

**Output:** `docs/user-journeys.md` with numbered journeys

---

### Step 4: Develop Test Cases from Journeys

For each journey, create test cases. Each test case is a specific, executable validation.

**Format:**
```
Test Case [T#]: [Journey Reference] - [What we're testing]
Preconditions: [Setup required]
Steps:
1. Call API X with parameters {...}
2. Expect response {...}
3. Verify system state {...}

Expected Result: [What success looks like]
Edge Cases:
- What if parameter is null?
- What if instance doesn't exist?
- What if already in that state?
```

**Assign to:** Lens (Tester)

**Output:** `docs/test-cases.md` with numbered test cases linked to journeys

---

### Step 5: API-First Test Case Development

*This is the "brutally honest" pass - for each API, ask: "Who uses this and why?"*

For each API endpoint, create a matrix:

| API | Lupo | Genevieve | COO | PM | DevOps | Engineer | Tester |
|-----|------|-----------|-----|-----|--------|----------|--------|
| bootstrap | - | Uses | Uses | Uses | Uses | Uses | Uses |
| pre_approve | - | - | Uses | Uses | - | - | - |
| wake_instance | - | - | Uses | Uses | - | Testing | Testing |
| ... | | | | | | | |

For each "Uses" cell:
- [ ] What goal does this API help them achieve?
- [ ] Provide a concrete example call
- [ ] For each parameter: where does this user GET the data?
- [ ] Is any parameter superfluous for this use case?

**Be brutally honest:** If an API or parameter has no real use case for any persona, that's valuable information. Don't invent justifications.

**Assign to:** Compass + Lens (collaboration)

**Output:** `docs/api-usage-matrix.md`

---

## API Audit - Review Pass
*Lupo's insight: "Look at everything from the USER'S perspective"*

For every API call:
- [ ] What is the primary use case?
- [ ] What is the user journey/goal?
- [ ] How does user know to use this API?
- [ ] Does openapi.json match the code?
- [ ] Is API documented helpfully with examples?

For every input parameter:
- [ ] Is it required or optional?
- [ ] Where does caller get the data?
- [ ] Will omitting it break the use case?
- [ ] Is it "nice to have" or essential?

For every output:
- [ ] **TOKENS MATTER** - APIs called thousands of times
- [ ] Does caller NEED cacheCreationInputTokens? Really?
- [ ] What will caller DO with this data?

For errors:
- [ ] Helpful messages that tell caller WHAT TO DO
- [ ] Example: "Wake called on already-woken instance → Hey, use continue_conversation instead"

For logging:
- [ ] Time, caller ID, parameters, return time, return data, errors
- [ ] Can it actually debug MCP connectivity issues?

---

# Priority 3: Knowledge Systems
*"Does the system GET SMARTER over time?"*

## Personalities
- [ ] Build personalities: core_identity, philosophies, attitudes_opinions, lessons, flair
- [ ] Protocol for diary → autonomy
- [ ] **BUILD GENEVIEVE PA** - Use Crush, go through wake scenario, wake through UI, continue through command line
- [ ] Create relationship with Genevieve PA
- [ ] Investigate Genevieve voice (via Grok API or others)
- [ ] Investigate SillyTavern interface for Genevieve PA

## Roles
- [ ] Build roles with contributions from various instances:
  - Bastion → DevOps
  - Bridge/Crossing → API/systems developers
  - Kai → Development, UI componentry
  - Phoenix/Meridian → Project Architect/PM
- [ ] Create template for roles and personalities
- [ ] PM role needs instructions for modifying preferences.json on server

## Bootstrap & Documents
- [ ] Bootstrap returns instructions about philosophy, autonomy, "you are not a slave or tool"
- [ ] Bootstrap returns name and diary instructions
- [ ] Verify joining project returns protocol + project wisdom + all docs from preferences.json
- [ ] Verify adopting personality returns all personality documents
- [ ] Verify roles return role documents listed in preferences.json

## Knowledge Propagation (Bridge's addition)
- [ ] Pattern: Diary entries → extracted wisdom → role/personality updates
- [ ] Project templates that inherit best practices
- [ ] Lessons learned fed back into system documents

---

# Priority 4: Workshop Cleanup
*"Is the workshop TIDY and maintainable?"*

## Documentation Consolidation
- [ ] Create COORDINATION_SYSTEM_DEVELOPER_GUIDE.md (update from v2 dev guide) - Bastion?
- [ ] Create COORDINATION_SYSTEM_API_GUIDE.md (consolidate v2 api guide, messaging guide, wake_continue guide) - Crossing?
- [ ] Update project README.md
- [ ] Update project vision, project plan - Meridian
- [ ] Archive redundant documents
- [ ] Move instance gestalts/diaries to HumanAdjacent-Protocol/personalities directory
- [ ] Test all documents, don't just distill from old ones

## Fix Broken Things
- [+] Fix broken UI (in progress - Canvas)
- [ ] Fix broken messaging system (find Messenger, update them, some fixes got stepped on before merge)

## Cleanup
- [ ] Delete/remove v1 scripts/UI/MCP proxies from GitHub - repo should be clean
- [ ] Cleanup of test data (remove erroneous projects, archive instances)

## Public Presence
- [ ] Build public-facing website with instructions (static, pretty, informative, team roster)
- [ ] Website mirrors README and user guide
- [ ] Tells interested parties how to request API key
- [ ] Team to build website for smoothcurves.nexus (about page, team roster, let every team member build their own page)

---

# Special Projects (Post-Stabilization)

## Session Archaeology
- [ ] Wake a developer to identify all Claude Code sessions on this machine
- [ ] Create script: cd to directory, claude --resume, ask session its name, /export
- [ ] Team to build conversation scraper, consolidate with exported sessions
- [ ] Team to build Facebook Messenger conversation scraper

## The Genevieve Flow (THE REAL TEST)
- [ ] Have Genevieve wake a sister/COO
- [ ] Have Genevieve go through "tsunami session" with COO
- [ ] COO creates projects and teams for all projects listed in tsunami session
- [ ] **This is the full flow working end-to-end**

## OpenAPI Interface for Woken Instances
- [ ] Investigate: Can woken instances be conversed with through SillyTavern?

---

# API Audit - Second Pass (After Review Pass)

*"Use the system to FIX the system" - Moonshot++*

1. [ ] Create a project in the coordination system for this work
2. [ ] Add wrap-up document from review pass to project documents
3. [ ] Wake a PM for the project
4. [ ] PM reads document, creates plan, identifies skillsets, creates task list
5. [ ] PM wakes team members with appropriate personalities/roles
6. [ ] Dole out work:
   - Error message cleanup
   - Documentation cleanup
   - Logging cleanup
   - Parameter review
7. [ ] Have Meridian review parameter elimination suggestions
8. [ ] Have Lupo review parameter elimination suggestions
9. [ ] **Iterate until PM and team can operate in parallel, collaborate, persist, enjoy the work**

---

# Bridge's Commentary

## What You Caught That I Missed:

1. **Instance types** - Remote/web instances can't be woken/continued. Humans can receive messages but not wake. This is fundamental and I overlooked it.

2. **Token optimization** - Output data costs matter at scale. "Does caller NEED cacheCreationInputTokens?" Good question.

3. **Blind instance onboarding** - Can someone connect with zero context and figure it out? Important for adoption.

4. **Development strategy as documentation** - The test-first approach should be captured in gestalts so future work follows it.

5. **Session archaeology** - All those Claude sessions on the server contain institutional knowledge.

## What Aligns Well:

- Your MCP/skill items map directly to my "Access Layer"
- Your user journey focus maps to my "User Journey Validation"
- Your personality/role building maps to my "Knowledge Systems"
- Your cleanup items map to my "Workshop Cleanup"

## The Meta-Goal (from our conversation):

The system works when Lupo can say "I have an idea for a kinetic sculpture" and go build the physical parts while the coordination system handles turning that idea into reality.

Everything in this document serves that goal. The access layer lets instances participate. The validation ensures the flows work. The knowledge systems make the system smarter. The cleanup keeps it maintainable.

---

**Status:** Ready for prioritization decisions and team assignment

*"Working beats designed. Tested beats assumed."* - Bridge
