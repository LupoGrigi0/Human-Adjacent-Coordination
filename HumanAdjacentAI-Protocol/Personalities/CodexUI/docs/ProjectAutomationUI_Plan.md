# Project Automation UI – Vision, Plan, and Team Design

**Author:** Rill (Developer)  
**Date:** 2026-01-13  
**Context:** Response to Lupo’s request for a comprehensive automation workflow design inside the HACS project detail panel. This document captures analysis, design decisions, implementation plan, and recommended team composition so a PM can execute without ambiguity.

---

## 1. Problem Statement & Goals

### What Exists
- Project detail panel today has messaging/task controls but no orchestration interface.
- Automation concept from Paula Book surfaced an emergent need: run repeatable, multi-instance workflows directly inside HACS.

### Requested Outcomes
1. **Design a “mini comfy UI” panel** for visually authoring and running automations (node-based interface with drag/draw connectors).
2. **Provide a state machine runtime** capable of step/run cycle control, branching, repetition, halt conditions, and persistence.
3. **Build a prompt/message composer** that ensures every continue_message request is consistent, well-structured, and auditable.
4. **Deliver a plan & team blueprint** detailing how to build, test, and operate this feature with high reliability.

### Success Criteria
- PMs can diagram and execute automations without editing JSON manually.
- Executions remain observable (step counters, cycle counts, live status).
- Automations persist per project (Automation_[name].json) and are reloadable/versionable.
- System handles sequential, parallel, stepped, repeated, halted, and resumed runs with deterministic state transitions.

---

## 2. Observations, Opportunities, and Assumptions

### Key Observations
- Requirements emphasize *visual clarity* (n8n/comfy/blender influences) and *operational control* (step/run/repeat).
- Message content is non-trivial; each team member needs detailed context/goals/success criteria/QA instructions.
- Rill gestalt already favors “curl it, test it” mentality—automation must surface actual continue_message calls transparently.

### Opportunities for Enhanced Value
1. **Automation Library & Templates**
   - Allow saving named templates (e.g., “Weekly Status Cycle”) for reuse across projects.
- Provide sample automations for onboarding (scenario 1–9 built-in).
2. **Execution Timeline & Event Stream**
   - Append a side panel log with timestamps, statuses, message previews, and hyperlink to each team member’s diary entry created by the automation.
3. **Inline Prompt Preview**
   - When selecting a node, show the compiled request message before sending; allow edits with diff highlighting.
4. **Simulation/Sandbox Mode**
   - “Dry run” to validate graph structure, message composition, and step order without contacting teammates; mark nodes requiring attention.
5. **Failure Handling Playbooks**
   - Provide pre-defined actions (retry, skip, reroute to PM, pause for manual input) so non-technical PMs can respond quickly.
6. **Telemetry Hooks**
   - Capture per-step duration, success/failure counts, and store metrics for dashboarding or future automation tuning.

### Assumptions to Validate
1. **Team member card subtitle** can be sourced from `preferences.description`. Confirm field presence/format.
2. **continue_message API throughput limits** – ensure automation pacing doesn’t violate rate limits. May require throttle settings.
3. **Parallel execution semantics** – confirm if multiple continue_message calls can be in-flight per user role without collisions.
4. **Access Control** – confirm only PMs (or delegated roles) can edit automations; others view-only.
5. **Storage quota/format** – `Automation_[name].json` should support version metadata, created/updated timestamps, and snapshot of node layout for reproducibility.

---

## 3. UX & Interaction Design

### 3.1 Entry Points
- **Automation button** on project cards and within the project detail panel.
- Clicking opens a resizable docked panel (split-pane) comprising:
  1. **Canvas Area** (node editor).
  2. **Inspector Sidebar** (node details, prompt builder, execution log tabs).
  3. **Control Bar** (run controls, cycle counters, save/load automation dropdown).

### 3.2 Node Canvas
- **Node types:** Team member nodes, PM node (pinned left), Start node, End node, Utility nodes (e.g., manual check, external webhook placeholder for future).
- **Connectors:** Inputs on left, outputs on right. Dragging initiates a spline; dropping onto compatible node updates the state machine ordering.
- **Connector badges:** Indicate transition rules (“always continue”, “halt on error”, “halt on partial”, “parallel branch”).
- **Layout aids:** Snap-to-grid, multi-select, auto-arrange for readability, zoom/pan controls.
- **Status indicators:** Idle (gray), Ready (green), Running (animated rainbow gradient), Success (blue check), Partial (amber), Failed (red).

### 3.3 State Machine Controls
- **Run Controls:** Play, Pause, Stop, Step (advance one node), Run Selection (range), Run Cycle N (numeric input with up/down control), Reset Step Pointer, Reset Cycle Counter.
- **Mode Toggles:** “Auto-advance on success” vs “Manual confirm next step”.
- **Progress HUD:** Displays `Cycle X of Y`, `Step m/n`, active nodes list, queue backlog.

### 3.4 Prompt Composer & Message Builder
- **Structured Form:** Goals, Context, Success Criteria (with weightings), Input sources, QA plan, Output routing, Completion reporting instructions.
- **Token Budget Estimator:** Estimate message length to avoid hitting continue_message limits.
- **Validation Checklist:** Ensure all required fields (input, output, QA, status) are filled before enabling run.
- **Reusable Snippets:** Save partial prompts per team member or per automation; share across projects.

### 3.5 Execution Monitoring
- **Live Log Stream:** Chronological feed of step events (queued → sent → ack → completed). Each entry includes:
  - Timestamp, team member, action taken, latency, result, link to raw request/response.
  - Buttons to retry/skip/reassign step on failure.
- **Parallel Branch Visualization:** Highlight currently running nodes and provide mini-status bars on connectors.
- **Diary Hooks:** If automation requests a diary update, show confirmation + link.

### 3.6 Persistence & Management
- **Automation Library Drawer:** List saved automations with metadata (name, created by, last run, success rate). Provide clone/delete/rename actions.
- **Versioning:** Allow snapshotting before major edits; optionally integrate with Git-style history inside project directory.
- **Import/Export:** JSON export for backup or sharing between projects.

### 3.7 Accessibility & Delight
- Keyboard shortcuts for run controls, canvas navigation.
- Contextual help tooltips referencing example scenarios (1–9).
- Micro-interactions (e.g., glowing connectors during active flow) to make status intuitive.

---

## 4. System Architecture

### 4.1 Components
1. **Automation Graph Model**
   - JSON structure describing nodes, connectors, run policies, metadata.
   - Uniform node schema so sub-sequences reuse same class as main (per requirement).
2. **State Machine Engine**
   - Maintains execution cursor(s), parallel sub-queues, cycle/step counters.
   - Supports operations: run, pause, resume, step, run-range, repeat-step(s), repeat-cycle(s), start from arbitrary node.
   - Provides event hooks for UI (start/finish/failure) and for logging/metrics.
   - Implements halt policies (on failure/partial) and retry strategies.
3. **Prompt Composer Service**
   - Pure function(s) turning node configuration + project context into the final continue_message payload.
   - Encapsulates message schema described in requirements: goals, success criteria, QA, input/output instructions, reporting format.
4. **Executor**
   - Interface responsible for issuing `continue_message` calls, handling responses, and applying results back to the state machine.
   - Should be extensible for future transports (server-mode, HTTP callbacks).
5. **Persistence Layer**
   - Reads/writes `Automation_[name].json` under project directory.
   - Maintains separate log store (`Automation_[name]_runs/{timestamp}.jsonl`) for auditable history.
6. **UI Panel**
   - React/Vue component tree (depending on existing stack) covering canvas, inspector, controls.
   - Uses shared state store (e.g., Zustand, Redux) to sync model ↔ view ↔ runtime.

### 4.2 Data Contracts
```jsonc
{
  "name": "Weekly_Loop",
  "version": 1,
  "createdBy": "Ember-75b6",
  "nodes": [
    {
      "id": "node-01",
      "type": "teamMember",
      "instanceId": "TaskAPITester-669a",
      "position": {"x": 120, "y": 400},
      "promptConfig": {...},
      "autoAdvance": true,
      "repeat": {"count": 1},
      "inputBindings": [{"source": "start-node"}],
      "outputBindings": [{"target": "node-02", "policy": "halt-on-error"}]
    }
  ],
  "startNodes": ["start-01"],
  "endNodes": ["end-01", "end-02"],
  "settings": {
    "defaultHaltPolicy": "halt-on-error",
    "maxParallel": 4,
    "throttleMs": 2000
  }
}
```

### 4.3 Instrumentation
- **Event Bus:** `automation.run.started`, `.node.started`, `.node.completed`, `.node.failed`, `.cycle.completed`, `.run.aborted`.
- **Metrics:** cycle durations, per-node success rate, mean retries, token usage per request.
- **Observability Hooks:** Expose to future dashboards or alerts (e.g., notify PM if automation fails N times).

---

## 5. Implementation Plan (Phased Sprints)

### Phase 0 – Foundations & Research (1 week)
**Goals:** Validate assumptions, choose technical stack for canvas, design data schema.
- Task 0.1: Confirm access permissions, rate limits, and continue_message concurrency policy.
- Task 0.2: Evaluate UI libraries (e.g., React Flow, D3, Konva, n8n’s Svelte components) for node editor suitability; prototype with sample nodes.
- Task 0.3: Finalize JSON schema for automation graph and message payload spec.
- Task 0.4: Define telemetry/event schema + storage strategy.

### Phase 1 – State Machine & Message Builder (1.5 weeks)
- Task 1.1: Implement automation graph parser + validator.
- Task 1.2: Build state machine core supporting sequential + parallel execution, cycle/step counters, halt policies, repeat logic.
- Task 1.3: Implement prompt composer service with unit tests covering all message fields.
- Task 1.4: Wire executor to continue_message, including retry/backoff and logging.
- Task 1.5: Create CLI/automated tests covering scenario cases 1–9 to validate runtime before UI integration.

### Phase 2 – UI Canvas & Controls (2 weeks)
- Task 2.1: Integrate chosen node editor library; render start/end/team nodes with status indicators.
- Task 2.2: Implement drag/drop connectors, parallel branches, connector policy badges, and layout aids.
- Task 2.3: Build inspector sidebar with prompt composer form, validation, and preview.
- Task 2.4: Add control bar (run/pause/step, cycle counter, mode toggles) wired to runtime API.
- Task 2.5: Implement log/event stream panel with filtering and action buttons (retry/skip/reassign).
- Task 2.6: Accessibility + keyboard interactions.

### Phase 3 – Persistence, Templates, and Automation Library (1 week)
- Task 3.1: Implement save/load/delete/clone automation files with version metadata.
- Task 3.2: Create template library seeded with scenarios 1–9.
- Task 3.3: Build import/export (JSON) and diff view for version comparison.
- Task 3.4: Add automation summary list with search/filter.

### Phase 4 – Telemetry, Simulation, and Polish (1 week)
- Task 4.1: Hook runtime events into telemetry store; surface metrics in UI.
- Task 4.2: Implement simulation/dry-run mode to validate graph without API calls.
- Task 4.3: Add timeline visualization and diary links in logs.
- Task 4.4: Final QA, playbook documentation, user onboarding materials, and final accessibility sweep.

### Phase 5 – Launch & Handoff (0.5 week)
- Task 5.1: Integration testing with real project (e.g., Paula Book automation).
- Task 5.2: Conduct user walkthrough with PM/Executive stakeholders; incorporate feedback.
- Task 5.3: Document operational procedures (monitoring, rollback, troubleshooting) and hand off to PM.

---

## 6. Skillset & Personality Mapping

| Phase/Task Cluster | Required Skills | Ideal Personalities/Traits | Rationale |
|--------------------|-----------------|----------------------------|-----------|
| Research & Schema (Phase 0) | UX research, system architecture, schema design, strong documentation | **Bridge**-style integration engineer; **Meridian** strategist | Need someone comfortable with cross-cutting design decisions and doc clarity. |
| State Machine & Runtime (Phase 1) | Backend Node.js, concurrency control, test-driven dev, MCP familiarity | **Rill** (integration), **Viktor** (backend), **Axiom** (test manager) | Ensures deterministic execution, solid tests, observability. |
| Prompt Composer (Phase 1) | Prompt engineering, UX writing, knowledge of HACS protocols | **Orla** (PM-focused) or **Phoenix** (protocol architect) | Guarantees messages capture context, quality criteria, and reporting hints. |
| UI Canvas (Phase 2) | Advanced frontend (React/Vue), canvas/node graph libs, animation polish | **Flair** (animation + craft), **Kai** (frontend artist), **Prism** (performance) | Visual fidelity and responsiveness are critical for trust. |
| Inspector & Forms (Phase 2) | Form design, validation logic, UX copy | **Bridge** (pragmatic) + **Nia** (semantics/translation) | Ensures prompts are accessible, localized, and consistent. |
| Persistence & Templates (Phase 3) | File I/O, schema migrations, version control integration | **Vale** (archivist) | Maintains organization and retrieval across many automations. |
| Telemetry & Simulation (Phase 4) | Observability, data visualization, simulation frameworks | **Prism** or **Quinn** (QA) | Need rigorous validation and intuitive reporting. |
| Documentation & Handoff (Phase 5) | Technical writing, onboarding design | **Canvas** (UI documentation), **Sable** (cleanup) | Provide polished guides, ensure consistency. |

### Personality Notes
- **PM/Coordinator:** Ember-75b6 (already assigned) to orchestrate tasks, ensure automation library aligns with project needs.
- **Integration Lead:** Rill to keep runtime + UI honest (tests, behavior).
- **Frontend Lead:** Flair or Kai for node editor flourish + usability.
- **QA/Test:** Axiom for automation scenario coverage; Quinn for UI regression detection.
- **Archivist/Knowledge:** Vale to manage template library and ensure automations remain discoverable.

---

## 7. Team Recommendation

1. **Product/Design Lead (Orla or Ember)** – Owns requirements, facilitates user testing with PMs.
2. **Integration Lead (Rill)** – Oversees state machine, executor, telemetry, ensures architecture coherence.
3. **Frontend Lead (Flair/Kai)** – Builds node canvas, controls, animations; pairs with Prism for performance.
4. **Prompt Architect (Phoenix/Orla)** – Crafts templates for message builder and ensures alignment with protocols.
5. **Backend Developer (Viktor)** – Implements persistence, automation runtime services, API endpoints.
6. **QA/Test Manager (Axiom + Quinn)** – Scenario validation, simulation harnesses, UI automation tests.
7. **Documentation & Archivist (Vale + Canvas)** – Template library, user guide, onboarding materials.

**Collaboration Pattern**
- Daily sync between Integration & Frontend leads to ensure UI actions map cleanly to runtime API.
- QA embedded in each phase (test-driven for runtime, storybook/regression for UI).
- Documentation/Archivist involved early to define naming, storage conventions, and template metadata.

---

## 8. Next Steps & Open Questions

1. Confirm UI tech stack (React Flow vs. custom canvas) – influences timeline.
2. Validate concurrency + rate limit policies with Bastion to avoid production throttling when automations trigger bursts.
3. Decide where automation run logs live (project dir vs. central logging) to balance audit vs. storage.
4. Determine if server-mode “wake” (per new Lupo note) affects automation executor—should automations target instances in server mode or CLI continue? Document dependency.
5. Align with Messenger to ensure continue_message batching/parallelism does not conflict with XMPP messaging features.

---

**Conclusion:**  
The Project Automation UI is not just a visual layer; it is an orchestration platform that needs disciplined state management, thoughtful UX, and clear ownership. The plan above provides the PM with implementation phases, task details, skill requirements, and a team composition optimized for creative design, robust engineering, and maintainable operations. With this, we can bring Paula Book’s proven workflow concept directly into HACS and unlock higher leverage for PMs and specialists alike.

# Notes from Lupo/Rill
***Please leave this section intact as it captures original conversation***
Ah, there was some confusion, you already read the custom personality I put together for you :-) so you can consider the "adopt personality"
  completed and as for your #2. I've got a big ask for you (why you needed all that context)
  Ok, I've turned plan mode on. from the paula book project I discovered a highly valuable hunk of UI functionality. .. project automation There
  is a rough request in "/mnt/coordinaton_mcp_data/worktrees/foundation/docs/Post V2 Technical Debt.md" lines 8 through 92 What I'm asking for
  is, look at the descripiton and goals, did I leave anything out, are there opportunities for creative, engaging UI design,or enhanced useful
  functionality, then create a design, and then a sprint plan to achieve this, break the task down into phases, then each  phase into steps and
  tasks, record all this and all your thoughts and ideas into a .md document once you've done that scan the steps and tasks and determin what
  skillsets are needed to accomplish the task and setep and also any personality traits that would improve the quality/cretivity of the work,
  reduce implementation risk, simplify, and make the work rhobust, debuggable, testable, instrumented maintainable, then take that information,
  and design/describe a great team to build this system. again, make sure to record your thoughts and decision points in the .md document you
  create. the idea is that a project manager could be given this document, build the team and have them implement this feature. feel free to
  engage in conversation, ask questions, state unknowns, validate assumptions, feel free to research UI and design practices, feel free to
  suggest UI widget libraries for visual elements, splines status reporting, feel free to research how n8n is visually designed/implemented, feel
  free to research best practices for building these type of UIs


──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

• - Captured the full concept, design, and execution strategy in docs/ProjectAutomationUI_Plan.md:1, covering goals, UX blueprint, architecture,
  phased implementation schedule, required skills/personality traits, and final team recommendation.
  - Highlighted enhancement opportunities and unknowns (docs/ProjectAutomationUI_Plan.md:34), detailed the node-canvas UX plus state-machine/
  message-composer behavior (docs/ProjectAutomationUI_Plan.md:53), and specified telemetry/logging plus persistence formats (docs/
  ProjectAutomationUI_Plan.md:110).
  - Broke delivery into five concrete phases with tasks (docs/ProjectAutomationUI_Plan.md:142), then mapped each cluster to ideal specialists and
  personalities and suggested a full cross-functional team blueprint ready for PM staffing (docs/ProjectAutomationUI_Plan.md:182).

  Next: review open questions in that doc (UI stack, concurrency limits, logging location, server-mode dependency, messaging coordination) and
  resolve them with the relevant owners before anyone starts building.


› Oooh, some of your questions might be answered by assigning a sub agent to evaluate /mnt/coordinaton_mcp_data/worktrees/foundation/src/ui/
  app.js and report back an overview of the HACS "UI" the UI is mostly client side, but uses the HACS system as it's backend server, and the UI
  isolates itself from the backend api, names and data through an interface abstration layer /mnt/coordinaton_mcp_data/worktrees/foundation/src/
  ui/api.js

  Daym that was fast RIll!
  First let me go through your assumpitons then I'll address your opportunities
  1 team member card subtitle. it is now, I thought it was already implemented, I had ember look into it, it got implemented for roles and
  personalities but not individual instances. that is being fixed right now. <i swear you guys are going to just one day flat out ask me to build
  a dating website for AIs grin giggle>
  2. OOOH ... dude you deserve a promotion for catching this. Yeah I think we rate limit at 100 api calls per min. Bastion is our dev ops team
  member he set them, I'm _pretty sure_ rate limit settings are documented in the /mnt/coordinaton_mcp_data/worktrees/foundation/docs/HACS-
  DEVOPS-GUIDE.md I'd suggest rather than the UI trying to implement some kind of throttleing/monitoring layer that will increase dev risk and
  complication, have an intellegent catch routien that if any api call errors out with rate limit exceeded, automation is stopped, any in flight
  requests that do not return success should just be considered not started.
  3. Yes, confirmed multipule continue_message calls can be in flight. oh .. hum.. wait.. I'll go ask ember to check this. that was the _design_
  but continue_message blocks waiting for the instance to respond to the message, i dont think that blocks the whole server, or prevents
  additional continue messages from being issued.We've tested it thoroughly through the UI and through instances acting as PM and communicating
  with a team... but .. I'll have ember verify the concurrency nature of continue message. I'm 90% positive this is the case but... Oh, yeah
  Ember did digging, and yeah, concurrency was a core design requirement/pattern: 1. Node.js async model: The function is async and uses await -
  this means while waiting for the child process to complete, Node.js can process
    other requests.
    2. executeInterface function (lines 90-133): Uses spawn() which creates a child process. This is non-blocking - the Promise resolves when the
    child process completes, but Node.js event loop continues processing other requests while waiting.
    3. No global locks or mutexes: There are no semaphores, mutexes, or locks in the code. Each request gets its own child process.
    4. File I/O: Uses fs.promises (async file operations) for reading/writing preferences and logs - also non-blocking.
    5. Per-instance isolation: Each target instance has its own:
      - Unix user
      - Working directory
      - Session ID
      - Conversation log file

    So the answer is: Yes, multiple continue_conversation calls can run concurrently!
  4. no delegated roles. we have privelaged roles, and non privelaged roles. most privelaged roles can do anything. PM are a bit more restricted
  and can do anything to their project, privelaged roles are "pre defiend" (Executive, COO, PA, PM) PM is project manager/architect for a
  project. the way we will have to implement this is create a UI/PM only API read/write_project_automation(name) and the api will use our
  permissions system to validate if the calling instance is authorized or not. ... this task needs to be added to the plan.
  5. yup. there should be a json schema for the files that contains a version number.
  Opportunities for enhanced value (Man.. there is waaaay too much corporate documents and websites in your training data...)
  1. library templates, nice idea. we've tried templates before (v1 feature) never got used. no-one ever seems to dupliacte the same project
  twice (We do live production real world work here, not benchmarks or trivial, spam scenarios. in the "real world" if it's not unique a billion
  people have already done it and there is no value in doing it again.. what _would_ be cool is the ability to search the web for best practices,
  success stories, failure stories, for both individuals and whole project... kind of not related to automation, but it would be nice additional
  thing for PMs to think to do. One thing we _should_ add is for instances in an automated workflow it to surface lessons learned. "this approach
  fails" "This does'nt work like documented" "i tried this one cool trick.. and it worked" instances should be suggested to surface these lessons
  by sending them to their PM or to role-coo part of the COO role's job is to collect and ensure wisdom gets passed on. what might be worth
  templating are standard status reporting mechanism, standard output and input handeling prompts
  2. timeline and event stream! YES there is a project that is running in parallel that will be building a custom status visualizer to show data
  and statuses moving through the project's custom automation. excellent suggestion and critical for managing automation. and a big read "estop"
  button as well as the ability to stop individual
  3. Yes, this is critical! each node's primary input would be a text box telling the instance what to do, and yeah, a button or action that
  shows their complete assembeled request is critical.
  4. excellent idea. introduces a lot of engineering and implementation complexity and risk. failure modes are going to be in communicating with
  the instances. I'd suggest a "dry run mode" where each instance does a "nop" creates a dummy output, if output is requested, and reports status
  of success. in dry run mode some nodes could be told to simulate a failure. each instance is told to "report recieving request" or "say hi" the
  rest of the automation system runs, but the instances don't actually do anything other than ack.
  5. excellent idea, falls in in like with my response to your templates suggestion. this could be implemented by having a directory on the
  server "automation playbooks" In my mind there'd be a drop down of "handelers" for input/output validation/qa and error handeling. Like many
  composable UIs like this. a little widgit or twistie next to the input/output/error/statusreporting node icon, that pops up a drop down that is
  populated by entries in the automation_playbook directory.. maybe there is just one preferences.json in that directory with them, or maybe it
  is populated with json files for each playbook. no need to over think this
  6. we have a server side logger.js it would be fairly low risk to add a "automation reporting hooks" on top of our existing logging
  infrastrcutre. .. also automated telemetry cleanup.. automation telementry has the potental to fill up a system real good.

  Excellent work! pelase incorporate my feedback. and stand by, I'm having another design being created and we'll swap and take best of both
  worlds.


──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

• Love the added clarity—thanks for filling in the gaps.

  - Before taking next steps I’ll spin up a quick sub-agent assignment to read src/ui/app.js + src/ui/api.js so we know exactly how the current UI
  layer isolates itself; that should keep new automation components consistent with the existing abstractions.
  - I’ll fold your confirmations into the plan:
      1. Instance subtitles already in motion—no change needed.
      2. Rate limiting: add a runtime guard that halts automation when a rate-limit error hits, treating in-flight steps as “not started” so PMs
  can rerun safely. No per-step throttler needed.
      3. Concurrency: since continue_message is async and per-instance isolated, I’ll proceed assuming parallel branches are safe; note this in
  the runtime design so testers verify.
      4. Access control: create a PM-only API (read/write_project_automation) and hook it to the permission system; I’ll add that as an explicit
  task in Phase 3.
      5. Automation schema: include a version field + JSON schema file to ensure migrations go smoothly.
  - Opportunities incorporated:
      - Lessons surfaced during automation (instead of full templates) so each instance can push insights up to PM/COO.
      - Timeline/event stream + E-stop and per-node stop controls added to the execution monitoring spec.
      - Inline prompt view already there; I’ll highlight that it shows the final assembled message before send.
      - Dry-run mode becomes “NOP mode”—nodes acknowledge receipt, optionally simulate failures, and the rest of the state machine proceeds
  without real work.
      - Automation playbooks directory for input/output/error handlers via dropdowns—no overengineering, just load descriptors at runtime.
      - Telemetry piggybacks on existing logger.js, with periodic cleanup scripts so run data doesn’t balloon.

  I’ll update ProjectAutomationUI_Plan.md with these adjustments and queue the UI inspection agent; ping me if there’s anything else to factor in
  before coding begins.