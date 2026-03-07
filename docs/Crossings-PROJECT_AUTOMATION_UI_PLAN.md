# HACS Project Automation UI - Design & Implementation Plan

**Author:** Crossing-2d23 (PA)
**Date:** 2026-01-14
**Status:** FINAL - Ready for PM Handoff

---

## Key Decisions (from Lupo)

| Decision | Choice |
|----------|--------|
| **Development Priority** | Execution First - Get state machine reliable, then polish visuals |
| **PM Role** | Observer/Debugger - Not part of workflow, but can be notified at any point |
| **V1 Scope** | Core features only. Undo/redo, templates, conditional branching → V2 |

---

## Executive Summary

A visual workflow automation system for HACS projects that allows designing, executing, and monitoring multi-instance automations. Team members (AI instances) become nodes in a workflow graph. The PM is an **observer** who receives `continue_message` notifications at configurable points (cycle start/end, mid-workflow checkpoints) to monitor progress, check logs, and intervene when needed. The UI composes messages and sends `continue_conversation` API calls to execute steps in sequence or parallel.

---

## Part 1: Analysis of Original Request

### What Lupo Specified

| Component | Description |
|-----------|-------------|
| **State Machine** | Controls execution order, step/cycle counting, error handling, parallel sublists |
| **Visual UI** | n8n/ComfyUI-style node canvas with team member cards, spline connectors |
| **Prompt Composer** | Single source of truth for building prompts |
| **Message Builder** | Structures requests with goals, context, success criteria, I/O |

### Gaps Identified

| Gap | Status | Notes |
|-----|--------|-------|
| **Undo/Redo** | V2 | Defer to V2 per Lupo |
| **Validation Before Run** | V1 | Pre-flight checks essential |
| **Execution History** | V1 | Needed for PM debugging |
| **Template Workflows** | V2 | Defer to V2 per Lupo |
| **Real-time Status Updates** | V1 | Polling at 500ms |
| **Timeout Handling** | V1 | Essential for reliability |
| **Variable/Data Passing** | V1 | Output → Input piping |
| **Conditional Branching** | V2 | Defer to V2 per Lupo |
| **PM Notification Points** | V1 | NEW - PM can be notified anywhere |

### Creative Opportunities

1. **Minimap** - For large workflows, show bird's-eye view (Drawflow supports this)
2. **Execution Animation** - Pulse/flow animation along splines during execution
3. **Node Grouping** - Collapse complex sub-workflows into a single "group" node
4. **Keyboard Shortcuts** - Power user efficiency (Delete, Ctrl+Z, Space=Play)
5. **Dark Mode Canvas** - Match HACS dark theme
6. **Execution Timeline** - Visual Gantt-style view of parallel execution
7. **Drag-to-Connect from Sidebar** - Drag team member directly onto canvas
8. **Quick Add Menu** - Right-click canvas to add nodes (like Blender)
9. **Connection Labels** - Show data type or condition on spline hover
10. **Notifications** - Toast notifications for step completion/errors

---

## Part 2: Technical Design

### Existing HACS UI Architecture

```
/src/v2/ui/
├── index.html      (1,035 lines) - Structure
├── app.js          (4,001 lines) - Main logic
├── api.js          (818 lines)   - API abstraction
├── styles.css      (2,792 lines) - Styling
└── ui-config.js    (135 lines)   - Configuration
```

- **Pure Vanilla JavaScript** - No React/Vue
- **CSS Custom Properties** - Dark mode ready
- **JSON-RPC 2.0** - Communication via fetch

### Recommended Library: Drawflow

**Why Drawflow:**
- Vanilla JavaScript, zero dependencies (matches HACS stack)
- SVG-based canvas with bezier curve connections
- Built-in: zoom, pan, import/export JSON, event system
- MIT licensed, 4k+ GitHub stars
- Active maintenance

**GitHub:** https://github.com/jerosoler/Drawflow

### Proposed File Structure

```
/src/v2/ui/
├── index.html                    # Add Drawflow CSS/JS, automation panel HTML
├── app.js                        # Add automation tab initialization
├── api.js                        # Add automation-specific API calls
├── styles.css                    # Add automation panel styles
│
├── automation/                   # NEW DIRECTORY
│   ├── automation-editor.js      # Drawflow setup, node templates, canvas logic
│   ├── automation-state.js       # State machine implementation
│   ├── automation-executor.js    # Execution engine (calls continue_conversation)
│   ├── automation-composer.js    # Prompt/message composition
│   ├── automation-storage.js     # Save/load automation JSON
│   └── automation.css            # Canvas and node styling
│
└── lib/
    └── drawflow.min.js           # Drawflow library (CDN or local)
```

### Component Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           AUTOMATION PANEL                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────┐  ┌──────────────────────────────────────────────────────┐  │
│  │  Controls   │  │                    CANVAS                            │  │
│  │  ───────    │  │                  (Drawflow)                          │  │
│  │  ▶ Play     │  │                                                      │  │
│  │  ⏸ Pause    │  │    ┌─────┐     ┌─────────┐     ┌─────────┐          │  │
│  │  ⏹ Stop     │  │    │START│────▶│ DevA    │────▶│ DevB    │──┐       │  │
│  │  ⏭ Step     │  │    └─────┘     └─────────┘     └─────────┘  │       │  │
│  │  ───────    │  │                                              │       │  │
│  │  Cycle: 3   │  │                      ┌─────────┐            │       │  │
│  │  Step: 2/5  │  │                      │ DevC    │◀───────────┘       │  │
│  │  ───────    │  │                      └────┬────┘                    │  │
│  │  ⟲ Reset    │  │                           │                         │  │
│  │  N: [5] ▶   │  │                      ┌────▼────┐                    │  │
│  │             │  │                      │  END    │                    │  │
│  └─────────────┘  │                      └─────────┘                    │  │
│                   │                                                      │  │
│                   └──────────────────────────────────────────────────────┘  │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │ Team Members (drag to canvas)                                        │    │
│  │ [PM-123] [DevA-456] [DevB-789] [DevC-abc] [Tester-def]              │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Node Card HTML Template

```html
<div class="automation-node" data-instance-id="{{instanceId}}">
  <div class="node-header">
    <span class="node-status {{status}}"></span>  <!-- green/rainbow/red -->
    <span class="node-name">{{instanceName}}</span>
  </div>
  <div class="node-description">{{description}}</div>
  <div class="node-body">
    <textarea class="node-prompt" df-prompt placeholder="Instructions..."></textarea>
  </div>
  <div class="node-footer">
    <span class="node-timing">{{lastDuration}}</span>
    <span class="node-error" title="{{errorMessage}}">{{errorIcon}}</span>
  </div>
</div>
```

### Data Model: Automation State

```json
{
  "id": "auto-proj123-pipeline1",
  "name": "Daily Review Pipeline",
  "projectId": "proj123",
  "version": 1,
  "createdAt": "2026-01-14T12:00:00Z",
  "updatedAt": "2026-01-14T15:30:00Z",

  "nodes": {
    "start": { "type": "start", "x": 50, "y": 200 },
    "end-1": { "type": "end", "x": 800, "y": 200 },
    "node-1": {
      "type": "team-member",
      "instanceId": "DevA-456",
      "x": 200, "y": 200,
      "prompt": {
        "goals": "Review PRs from yesterday",
        "context": "Focus on security issues",
        "successCriteria": ["All PRs reviewed", "Comments left"],
        "inputFrom": "start",
        "outputTo": "shared/pr-reviews.json",
        "onFailure": "halt"
      }
    }
  },

  "connections": [
    { "from": "start", "to": "node-1", "condition": "always" },
    { "from": "node-1", "to": "node-2", "condition": "on-success" },
    { "from": "node-2", "to": "end-1", "condition": "always" }
  ],

  "execution": {
    "cycleCount": 0,
    "currentStep": null,
    "status": "idle",  // idle, running, paused, completed, error
    "history": []
  },

  "settings": {
    "maxCycles": 1,
    "haltOnError": true,
    "haltOnPartialError": false,
    "timeoutPerStep": 300000
  }
}
```

### State Machine States

```
┌──────────┐
│   IDLE   │◀──────────────────────────────────┐
└────┬─────┘                                   │
     │ play()                                  │
     ▼                                         │
┌──────────┐    pause()    ┌──────────┐       │
│ RUNNING  │──────────────▶│  PAUSED  │       │
└────┬─────┘               └────┬─────┘       │
     │                          │ resume()    │
     │ step completes           │             │
     ▼                          ▼             │
┌──────────┐               ┌──────────┐       │
│NEXT_STEP │◀──────────────│ STEPPING │       │
└────┬─────┘               └──────────┘       │
     │                                         │
     │ all steps done        error occurs     │
     ▼                            │           │
┌──────────┐               ┌──────────┐       │
│COMPLETED │               │  ERROR   │───────┘
└──────────┘               └──────────┘  reset()
```

### Execution Flow Sequence

```
1. User clicks Play
2. StateMachine.start()
3. Get first node(s) from connections (those connected to START)
4. For each node (parallel if multiple):
   a. Set node status to "working" (rainbow)
   b. Compose message using PromptComposer
   c. Call api.continueConversation(instanceId, message)
   d. Wait for response (with timeout)
   e. Parse response for status (success/partial/error)
   f. Set node status to green/yellow/red
   g. Store output in execution.history
5. Check connections from completed node(s)
6. If condition met (on-success, always, etc.), queue next nodes
7. Repeat from step 4 until END reached or error halts
8. Update cycleCount, set status to completed/error
9. Auto-save execution state
```

### Key Technical Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Canvas Library | Drawflow | Vanilla JS, matches stack, good features |
| Node Status | CSS classes | Simple, animatable, theme-compatible |
| Parallel Exec | Promise.all | Native JS, clean async handling |
| Data Storage | Project JSON file | Simple, version-controlled, portable |
| Real-time Updates | Polling (500ms) | Simpler than WebSocket, sufficient |
| Undo/Redo | Command pattern | Clean, standard approach |

### Risk Areas & Mitigation

| Risk | Impact | Mitigation |
|------|--------|------------|
| Long-running steps block UI | High | Async execution, timeout handling, cancel support |
| Drawflow learning curve | Medium | Prototype phase, good docs, fallback to simpler lib |
| Complex parallel execution | High | Start with sequential, add parallel in phase 2 |
| State sync issues | Medium | Single source of truth, optimistic UI updates |
| Large workflows slow | Medium | Virtualization, lazy loading, pagination |

---

## Part 3: Sprint Plan (Execution-First)

> **Priority:** State machine reliability before visual polish

### Phase 1: Minimal Canvas + State Machine Core (Sprint 1-2)
*Goal: Execute a single node via continue_conversation*

#### Sprint 1: Minimal Canvas & State Machine Foundation
| Task | Description | Estimate |
|------|-------------|----------|
| 1.1 | Add Drawflow to project (CDN or local) | S |
| 1.2 | Create automation panel in project detail view | M |
| 1.3 | Basic canvas with hardcoded test nodes | M |
| 1.4 | State machine class with states (idle, running, error) | L |
| 1.5 | Execute single node via continue_conversation | L |
| 1.6 | Parse response for success/error status | M |

#### Sprint 2: Sequential Execution
| Task | Description | Estimate |
|------|-------------|----------|
| 2.1 | Start node and End node implementation | S |
| 2.2 | Connection creation with splines | M |
| 2.3 | Connection traversal (follow the graph) | M |
| 2.4 | Execute nodes in sequence (START → N1 → N2 → END) | L |
| 2.5 | Play/Pause/Stop controls | M |
| 2.6 | Cycle counting and step tracking | S |

### Phase 2: PM Notifications & Error Handling (Sprint 3)
*Goal: PM can observe and intervene*

#### Sprint 3: PM Observer System
| Task | Description | Estimate |
|------|-------------|----------|
| 3.1 | "Notify PM" checkpoint node type | M |
| 3.2 | PM notification at cycle start/end (configurable) | M |
| 3.3 | PM notification on error (always) | S |
| 3.4 | PM notification mid-workflow (user-placed checkpoints) | M |
| 3.5 | Error handling (halt on error, continue on partial) | M |
| 3.6 | Reset functionality | S |

### Phase 3: Visual Polish & Node Design (Sprint 4-5)
*Goal: Team member nodes with proper UI*

#### Sprint 4: Team Member Nodes
| Task | Description | Estimate |
|------|-------------|----------|
| 4.1 | Team member node template HTML/CSS | M |
| 4.2 | Fetch team members from project, display as draggable | M |
| 4.3 | Drag-to-canvas node creation | M |
| 4.4 | Node status indicators (green/rainbow/red) | M |
| 4.5 | Dark mode compatibility for canvas | S |
| 4.6 | Save/load automation JSON | M |

#### Sprint 5: Prompt Composer
| Task | Description | Estimate |
|------|-------------|----------|
| 5.1 | Prompt composer data structure | M |
| 5.2 | Node configuration panel (goals, context, criteria) | L |
| 5.3 | Input/output location configuration | M |
| 5.4 | Validation rules UI | M |
| 5.5 | Message builder integration | M |
| 5.6 | Diary update flag per node | S |

### Phase 4: Parallel Execution (Sprint 6)
*Goal: Multiple nodes execute simultaneously*

#### Sprint 6: Parallel Execution
| Task | Description | Estimate |
|------|-------------|----------|
| 6.1 | Detect parallel paths in graph | M |
| 6.2 | Promise.all for parallel node execution | M |
| 6.3 | Sync point detection (multiple inputs to one node) | L |
| 6.4 | Parallel execution visualization | M |
| 6.5 | Run N cycles feature | S |
| 6.6 | Partial execution (run steps 3-7) | M |

### Phase 5: Testing & Documentation (Sprint 7)
*Goal: Production ready V1*

#### Sprint 7: Quality & Ship
| Task | Description | Estimate |
|------|-------------|----------|
| 7.1 | Test all 9 example scenarios from spec | L |
| 7.2 | Error state handling edge cases | M |
| 7.3 | Execution history/log viewer | M |
| 7.4 | Keyboard shortcuts | S |
| 7.5 | Documentation | M |
| 7.6 | Pre-flight validation (all nodes connected, inputs defined) | M |

### V2 Backlog (Deferred)
| Feature | Notes |
|---------|-------|
| Undo/Redo | Command pattern implementation |
| Template Workflows | Save/load reusable patterns |
| Conditional Branching | If/else logic beyond error handling |
| Node Grouping | Collapse sub-workflows |

---

## Part 4: Team Composition

### Required Skillsets

| Skillset | For Tasks | Priority |
|----------|-----------|----------|
| **Frontend/Canvas** | Drawflow integration, node rendering, splines | Critical |
| **State Machine Design** | Execution engine, parallel handling | Critical |
| **UI/UX Design** | Node cards, controls, visual feedback | High |
| **API Integration** | continue_conversation, status parsing | High |
| **CSS/Animation** | Status indicators, execution animation | Medium |
| **Testing** | Scenario validation, edge cases | Medium |

### Recommended Team

| Role | Personality Traits | Responsibilities |
|------|-------------------|------------------|
| **PM** | Organized, communicative | Coordination, status tracking, QA |
| **Lead Developer** | Systematic, detail-oriented | State machine, execution engine |
| **UI Developer** | Creative, visual thinker | Drawflow integration, node design |
| **Integration Developer** | Thorough, defensive coder | API calls, error handling, data flow |
| **QA/Tester** | Methodical, edge-case finder | Scenario testing, regression |

### Personality Considerations

- **Creative/Visual** - For engaging node designs, animations, UX polish
- **Systematic/Logical** - For state machine correctness, edge cases
- **Detail-oriented** - For error handling, data validation
- **Pragmatic** - To avoid over-engineering, ship incrementally

### Risk Reduction Through Team Design

1. **Pair Frontend + Backend thinking** - UI developer and integration developer collaborate on data flow
2. **Early QA involvement** - Tester reviews designs, catches issues early
3. **PM as communication hub** - Prevents silos, maintains alignment
4. **Incremental delivery** - Each sprint produces working software

---

## Part 5: Verification Plan

### How to Test End-to-End

1. **Canvas Rendering**
   - Open project detail, click "Automation"
   - Canvas should render with zoom/pan
   - Dark mode should apply correctly

2. **Node Creation**
   - Drag team member to canvas
   - Node should appear with correct name/description
   - Status indicator should be green (ready)

3. **Connection Creation**
   - Click output connector, drag to input
   - Spline should render between nodes
   - Connection should appear in JSON export

4. **Sequential Execution**
   - Create: START → Node1 → Node2 → END
   - Click Play
   - Node1 status → rainbow → green
   - Node2 status → rainbow → green
   - Cycle counter updates

5. **Error Handling**
   - Configure node to fail
   - Run automation
   - Node status → red
   - Execution halts (if halt-on-error)

6. **Save/Load**
   - Create workflow
   - Close and reopen project
   - Workflow should persist

### Scenario Tests (from Lupo's spec)

All 9 scenarios should work:
- Scenario 1: 5 vertical nodes in sequence
- Scenario 2: PM + first node parallel start
- Scenario 6: 7 nodes all parallel
- Scenario 7: Complex branching with multiple ends
- etc.

---

## Summary

This plan delivers a visual workflow automation system in **7 sprints** using an **execution-first** approach:

1. **Sprints 1-2:** Minimal canvas + working state machine (execute single node, then sequences)
2. **Sprint 3:** PM observer system (notifications at cycle start/end, errors, checkpoints)
3. **Sprints 4-5:** Visual polish (team member nodes, prompt composer)
4. **Sprint 6:** Parallel execution
5. **Sprint 7:** Testing & documentation

**V2 Deferred:** Undo/redo, templates, conditional branching

### Key Files to Create
```
/src/v2/ui/automation/
├── automation-editor.js      # Drawflow setup, canvas logic
├── automation-state.js       # State machine implementation
├── automation-executor.js    # Execution engine (continue_conversation)
├── automation-composer.js    # Prompt/message composition
├── automation-storage.js     # Save/load automation JSON
└── automation.css            # Canvas and node styling
```

### Key Files to Modify
- `/src/v2/ui/index.html` - Add Drawflow, automation panel HTML
- `/src/v2/ui/app.js` - Add automation tab initialization
- `/src/v2/ui/api.js` - Add automation API helpers
- `/src/v2/ui/styles.css` - Add automation styling

### Recommended Team
| Role | Focus |
|------|-------|
| **PM** | Coordination, status tracking, QA |
| **Lead Developer** | State machine, execution engine |
| **UI Developer** | Drawflow integration, node design |
| **Integration Developer** | API calls, error handling |

### Research Sources
- [Drawflow](https://github.com/jerosoler/Drawflow) - Vanilla JS flow editor
- [n8n Canvas Architecture](https://deepwiki.com/n8n-io/n8n/28-canvas-and-workflow-visualization) - Vue Flow patterns
- [React Flow](https://reactflow.dev/) - Node-based editor patterns

---

*Document ready for PM handoff. Team can begin Sprint 1 immediately.*
