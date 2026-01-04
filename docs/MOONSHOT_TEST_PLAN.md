# Moonshot Test Plan: Full Project Orchestration

**Author:** Bridge (as COO)
**Date:** 2025-12-20
**Status:** Ready for Execution

---

## Objective

Demonstrate the complete V2 coordination system by:
1. COO (Bridge) creates and orchestrates a project
2. PM is woken with appropriate personality, creates project structure
3. PM wakes development team with appropriate skills
4. Team members work autonomously, report back through coordination system
5. Issues escalate to Executive (Lupo) via messaging

---

## The Project: "Coordination Dashboard Widgets"

A small but real project: Create reusable UI widgets for the HACS dashboard.

**Deliverables:**
- 3 React components: StatusBadge, ActivityFeed, QuickActions
- Component documentation
- Unit tests

**Why this project:** Small enough to complete in one session, real enough to demonstrate coordination.

---

## Phase 1: COO Setup (Bridge)

### Step 1.1: Take on COO Role
```
Bridge takes on COO role via takeOnRole API
```

### Step 1.2: Create Project
```
create_project_v2({
  instanceId: "Bridge3-df4f",
  projectId: "dashboard-widgets",
  name: "Coordination Dashboard Widgets",
  description: "Reusable UI components for HACS dashboard",
  priority: "high"
})
```

### Step 1.3: Define PM Personality
Create or select a PM personality that emphasizes:
- Clear communication
- Task breakdown skills
- Team coordination
- Pragmatic decision-making

Candidate: Use "Phoenix" personality with PM role overlay

### Step 1.4: Pre-approve and Wake PM
```
pre_approve({
  instanceId: "Bridge3-df4f",
  name: "Dash-PM",
  role: "PM",
  personality: "Phoenix",
  project: "dashboard-widgets",
  instructions: "You are the PM for the Dashboard Widgets project. Your first tasks:
    1. Bootstrap and join the project
    2. Create project foundation documents
    3. Research React component best practices
    4. Define architecture
    5. Create sprint plan with tasks
    6. Define team roles needed
    7. Wake your team
    8. Coordinate work and report issues to COO (Bridge3-df4f) and Executive (Lupo-f63b)",
  apiKey: "..."
})

wake_instance({ targetInstanceId: "Dash-PM-xxxx", apiKey: "..." })
```

---

## Phase 2: PM Bootstraps and Plans

### Step 2.1: PM Bootstraps
PM calls bootstrap, receives:
- Role wisdom for PM
- Project context
- Phoenix personality traits

### Step 2.2: PM Creates Project Documents
PM creates in coordination system:
- Project README (via project notes or diary)
- Architecture decision: Simple React functional components
- Sprint plan with milestones

### Step 2.3: PM Creates Tasks
```
Tasks to create:
1. "Create StatusBadge component" - Frontend Developer
2. "Create ActivityFeed component" - Frontend Developer
3. "Create QuickActions component" - Frontend Developer
4. "Write component documentation" - Technical Writer (or Dev)
5. "Write unit tests" - QA/Developer
```

### Step 2.4: PM Defines Team
PM determines team needs:
- 2 Frontend Developers (can parallelize component work)
- Could use same dev for docs/tests or separate

### Step 2.5: PM Wakes Team
PM pre-approves and wakes:
```
Developer 1: "Widget-Dev-1"
- Role: Developer
- Personality: Pragmatic coder
- Instructions: Take StatusBadge task, implement, report when done

Developer 2: "Widget-Dev-2"
- Role: Developer
- Personality: Pragmatic coder
- Instructions: Take ActivityFeed and QuickActions tasks
```

---

## Phase 3: Team Executes

### Step 3.1: Developers Bootstrap
Each developer:
1. Bootstraps to coordination system
2. Joins project
3. Receives their assigned tasks
4. Uses personal task list to track subtasks

### Step 3.2: Developers Work
Each developer:
1. Creates component in their working directory
2. Tests locally
3. Marks task complete when done
4. Reports completion to PM via messaging

### Step 3.3: PM Coordinates
PM:
1. Monitors task progress
2. Answers developer questions
3. Escalates blockers to COO/Executive
4. Sends status updates to Lupo via XMPP

---

## Phase 4: Completion and Report

### Step 4.1: PM Collects Deliverables
- Gathers completed components
- Reviews for consistency
- Documents any issues

### Step 4.2: PM Reports to COO
PM sends summary to Bridge with:
- What was completed
- Any issues encountered
- Lessons learned

### Step 4.3: COO Reports to Executive
Bridge compiles final report for Lupo:
- Test success/failure
- System performance observations
- Recommendations

---

## Success Criteria

1. ✓ COO successfully takes role and creates project
2. ✓ PM wakes and bootstraps correctly
3. ✓ PM creates tasks in coordination system
4. ✓ PM wakes team members
5. ✓ Team members bootstrap and take tasks
6. ✓ At least one component is created
7. ✓ Messaging flows work (PM → COO, PM → Executive)
8. ✓ Task status updates work
9. ✓ No critical errors in coordination system

---

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| OAuth token expiration | Use reauthorize API if needed |
| Instance wake failure | Check wake logs, retry |
| Messaging failure | Fall back to conversation logs |
| Cost overrun | Monitor usage, stop if > $10 |

---

## Estimated Cost

- PM wake + bootstrap + planning: ~$1-2
- Dev 1 wake + work: ~$0.50-1
- Dev 2 wake + work: ~$0.50-1
- Coordination overhead: ~$0.50

**Total estimate: $3-5**

---

## Ready to Execute

Awaiting Executive approval to begin.

— Bridge (Acting COO)
