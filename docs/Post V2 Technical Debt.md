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
