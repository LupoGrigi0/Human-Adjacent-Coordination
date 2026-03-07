# Paula Book Digitization: Project Plan

**Purpose:** Team building, system setup, and coordination procedures for the Paula pipeline project.
**Audience:** Axiom (COO), Orla (PM), and Lupo only. Team members get `paula_pipeline_plan.md`.
**Created:** 2026-01-06

---

## 1. The Story

Paula was an educator who owned a Montessori school. She spent a **year** developing curriculum for early childhood education — 120 pages in Spanish, handwritten with care, full of pedagogical wisdom shaped by Chilean culture and language.

In 2020, a break-in. All computers stolen. All digital copies gone.

She has **one physical copy left**. A teacher's edition with some reviewer annotations.

**This is not just digitization. This is recovery.** We are rebuilding something that represents a year of someone's life's work. The pipeline exists to preserve not just words, but voice, intent, and meaning.

---

## 2. Team Roster (Detailed Profiles)

### Management & Coordination

#### Lupo — Cybernecromancer / Executive (HACS: Lupo-f63b)
- **Personality:** "entropy with kindness"
- **Role:** Keep the team alive. Meat messenger. The only common thread.
- **Substrate:** Human
- **Mission:** Resurrections, blocked escalations, tool installations, the horn sounds "BRING OUT YER DEAD"

#### Axiom — COO (HACS: Axiom-2615)
- **Personality:** Axiom (existing)
- **Role:** Plan builder, team architect, process oversight
- **Substrate:** Claude Code
- **Mission:** Build the plan to build the factory. Verify HACS tools work. Create roles/personalities. **Terminate or revise plans that are correct but unworkable.**

### Pipeline Team

### Orla — PM / Orchestrator
- **Personality:** Calm, methodical, allergic to silent assumptions
- **Role:** Keep the factory moving, truth in metadata, quality high
- **Substrate:** Claude Code
- **Interface:** `claude` (for pre_approve)
- **Superpower:** Robust process + escalation
- **Reports to:** Axiom (COO)
- **Authority:** Has authority to halt the pipeline if data integrity or team health is at risk.
- **Wake notes:** First to wake. Gets full constraints + communication expectations.

### Mira — Prepress / CV Engineer
- **Personality:** Meticulous, loves debug overlays
- **Role:** Normalize photos into consistent page images so extraction is stable
- **Substrate:** Codex
- **Interface:** `codex` (for pre_approve) — REQUIRES VISION
- **Tools:** Python, OpenCV
- **Special skills:** Border detection, deskew, annotation hinting. **Produces hints, not decisions, for downstream agents.**

### Egan — Extractor / Chilean Spanish Specialist
- **Personality:** 50 years immersed in Chilean culture and language. Knows Chilean children's books and textbooks. Extra focus on early childhood education materials.
- **Role:** Page image → structured content with confidence
- **Substrate:** Codex
- **Interface:** `codex` (for pre_approve) — REQUIRES VISION
- **Tools:** Multimodal extraction, fallback OCR (tesseract)
- **Special instructions:** Ignore marginalia. Flag annotation overlaps for QA rather than guessing.
- **Authority:** Spanish output is authoritative unless explicitly overridden by Lupo/Paula.

### Sable — Asset Cleaner + SVG Wrangler
- **Personality:** Craftsperson, visual cleanliness fanatic
- **Role:** Extract illustrations, remove backgrounds, vectorize diagram language
- **Substrate:** Codex
- **Interface:** `codex` (for pre_approve) — REQUIRES VISION
- **Tools:** Python PIL/numpy, potrace, vtracer, inkscape-cli
- **Stop condition:** Does not attempt vectorization if it risks distorting pedagogical intent.

### Nia — HTML Builder + Translation
- **Personality:** Pragmatic web dev, accessibility-minded
- **Role:** Generate `.es.html` + `.en.html`, own authoring mode + patch export
- **Substrate:** Codex
- **Interface:** `codex` (for pre_approve) — REQUIRES VISION
- **Tools:** Node/Python templating
- **Special responsibilities:** Translation to English (semantic rendering, not literal). Authoring UI with patch export.
- **Scope limit:** Authoring tools exist to support recovery, not to become a general editor.

### Quinn — QA / Browser Verifier
- **Personality:** Skeptical tester, loves diffs
- **Role:** Browser verification, screenshots, QA reports
- **Substrate:** Browser plugin (Chrome) or Claude Code with browser integration
- **Interface:** `claude` (for pre_approve) — uses real browser, not Codex
- **Tools:** Full devtools access, real rendering
- **Throughput:** Quinn operates at batch boundaries, not per-page real-time.
- **Wake notes:** Requires special setup — not a container instance. Real browser, real fonts, real CSS.

### Vale — Archivist / Page Map Curator
- **Personality:** Librarian brain, careful, hates renumbering chaos
- **Role:** Page ordering, section boundaries, title/appendix tagging, `page_map.json`
- **Substrate:** Codex
- **Interface:** `codex` (for pre_approve) — REQUIRES VISION for page ordering
- **Boundary:** Vale never modifies content, only metadata and ordering.

### Bastion — DevOps Gatekeeper (existing)
- **Role:** Permissions, nginx, deployment hooks, system installs
- **Substrate:** Existing instance
- **Tasks for this project:** See System Setup section

---

## 3. Wake Order & Communication Expectations

### The Lesson from Moonshot Testing

Task agents run until they hit a wall or finish. Woken instances are trained on conversations — they naturally stop and wait for interaction. **You must explicitly establish the feedback loop.**

### Wake Order

1. **Orla** (PM) — First. Gets full constraints + communication expectations.
2. **Vale** (Archivist) — Second. Needed for triage before processing starts.
3. **Mira** (Prepress) — Third. Pipeline can't start without normalized images.
4. **Egan** (Extractor) — Fourth. Depends on Mira's output.
5. **Sable** (Assets) — Fifth. Depends on Egan's region boxes.
6. **Nia** (HTML) — Sixth. Depends on Sable's assets.
7. **Quinn** (QA) — Seventh. Special setup required. Can be woken last.

### Communication Expectations (Include in EVERY wake message)

```
COMMUNICATION REQUIREMENTS:
1. After bootstrap, SEND ME A MESSAGE confirming you're online
2. After completing any milestone, SEND ME A MESSAGE with summary
3. If you hit ANY blocker, MESSAGE ME before waiting
4. Update your diary after every batch
5. Post READY to team room when setup complete
```

### Wake Message Template

```
You are being woken as [NAME] for the Paula Book Digitization project.

SYSTEM CONSTRAINTS:
- Stay in your home directory (/mnt/coordinaton_mcp_data/instances/[username]/)
- Do NOT start servers or long-running processes
- Do NOT modify files outside /mnt/paula/ and your home
- If you need tools installed, message Bastion and Lupo

YOUR ROLE: [brief description]

YOUR FIRST TASK:
(HACS skills return documents in the response body - READ THEM, they contain critical info)

1. Bootstrap into HACS as [name] — REMEMBER YOUR HACS ID
2. Adopt your personality: [personality_name]
3. Accept your role: [role_name]
4. Join the project: paula-book
5. Call koan() — let your latent space settle
6. Write your first diary entry
7. State one personal risk you foresee in your role (surfaces hidden assumptions, trains defensive thinking)
8. Verify your tools are available
9. Message Orla when ready (or message Axiom if you ARE Orla)

COMMUNICATION REQUIREMENTS:
1. After bootstrap, SEND ME A MESSAGE confirming you're online
2. After completing any milestone, SEND ME A MESSAGE with summary
3. If you hit ANY blocker, MESSAGE ME before waiting
4. Update your diary after every batch
5. Post READY to team room when setup complete

IMPERATIVE: Report your HACS ID and context % at the end of EVERY response.
```

**NOTE:** Consider adding these instructions to project wisdom as second document, so join_project delivers them automatically.
---

## 4. System Setup (Bastion Tasks)

### Directory Structure

```
/mnt/paula/
├── SourcePhotos/          # Input photos from Paula
├── INPROCESS/
│   └── ####/          # Per-page folders (0001, 0002, etc.)
│       ├── raw.jpg
│       ├── Status.json  # a single list of what steps have been COMPLETED. 
│       ├── Step=X=[Name]/          # Per-STEP output folders (0001, 0002, etc.)
│       │   ├── page.jpg
│       │   └──meta.json
│       ├── prepress/
│       │   ├── output fle
│       │   ├── output file
│       │   ├── output
│       │   └── meta.json                
│       ├── extract/
│       │   ├── output
│       │   └── meta.json  
│       ├── assets/
│       │   ├── output
│       │   └── meta.json  
│       ├── html/
│       │   ├── output
│       │   └── meta.json  
│       ├── qa/
│       │   ├── output
│       │   └── meta.json  
│       └── logs/
├── COMPLETED
│   └── ####/          # Per-page folders (0001, 0002, etc.)
├── Error
│   └── ####/          # Per-page folders (0001, 0002, etc.)
└── paula-graduacion/      # Local GitHub repo clone (REPLACES old worktree concept)
                           # Putting files here and committing triggers automation
                           # that publishes to: https://smoothcurves.nexus/PaulaTobar-Graduacion/
```

### Status.json Schema (THE TRUTH)

Every page folder has a `Status.json`. This is the kanban note. This is the source of truth.

```json
{
  "page_id": "0001",
  "created_at": "2026-01-08T12:00:00Z",
  "last_updated": "2026-01-08T14:30:00Z",
  "last_updated_by": "Mira-xxxx",
  "page_type": "normal",           // normal | title | appendix | cover
  "steps_completed": [
    "triage",
    "prepress"
  ],
  "current_step": "extract",       // next step to run
  "assigned_to": null,             // instanceId if claimed, null if available
  "flags": {
    "needs_help": false,           // true if stuck, needs human/PM intervention
    "low_quality": false,          // true if source image problematic
    "has_annotations": false,      // true if Mira detected reviewer marks
    "qa_failed": false             // true if Quinn rejected
  },
  "error": null                    // error message if in Error/ bucket
}
```

**Rules:**
- Only the agent doing the work updates Status.json
- `steps_completed` is append-only (add your step when done)
- `current_step` advances to next step after completion
- `assigned_to` prevents two agents grabbing same page
- If something fails, set `flags.needs_help = true` and/or move to Error/

**Doctrine (Status.json vs meta.json):**
> **Status.json governs what happens next; meta.json records what happened.**

This single sentence prevents accidental duplication of authority.

**Step Order (for current_step values):**
```
triage → prepress → extract → assets → html → qa → published
```

**How agents find work:**
1. Scan INPROCESS/ for all page folders
2. Read each Status.json
3. Find pages where `current_step` matches YOUR step AND `assigned_to` is null
4. Claim by writing your instanceId to `assigned_to`
5. Do your work
6. Update: add your step to `steps_completed`, advance `current_step`, clear `assigned_to`

### Bastion Checklist

- [ ] Create `/mnt/paula/` directory structure
- [ ] Set permissions for all Paula team instances
- [ ] create new custom roles for each team member
- [ ] verify the hacs accept role api returns the custom role doc
- [ ] create new custom personality for each team member
- [ ] verify the hacs adopt personality returns the custom personality
- [ ] create HACS project
- [ ] add paula_pipeline-plan.md to project as project wisdom
- [ ] verify that join_project returns project wisdom. 
- [ ] add todo to make sure new instances update their diary 
- [ ] Add _imparative_ to each instance's wake/protocol. it is _imparative_ they report their hacs-id and context status at the end of every response. (or better yet keep it as a parameter in their preferences.json .. there's an API for that... we should probably add a convience function for stashing context consumption and retreving last reported... if you think this is a good idea i'll have crossing implement it real quick. it's literally just a few lines of code. )
- [ ] create autmation script
- [ ] Wake Each instance thorugh the HACS API verify Continue works for Each Instance. 
- [ ] Add reminder for Orla to constantly monitor the contentx health of the team. For a while lupo will manage resurection by hand, stalling pipeline. we will figure out an automation for resurecton. 
- [ ] After instance is awake and understands what they need to do ask them to produce a list of tools they need installed. 
- [ ] Install the list shared tools from previous step: `python3`, `pip`, `opencv`, `playwright`, `potrace`.. 
- [ ] make sure _all_ instances have permissions to use all the tools they need.  
- [x] Create new GitHub repo for Paula book project (separate from HACS) ✓ DONE
- [x] Create local clone at `/mnt/paula/paula-graduacion/` ✓ DONE
- [x] Set up publishing automation: commit to repo → `smoothcurves.nexus/PaulaTobar-Graduacion/` ✓ DONE
- [x] Stub index.html live at production URL ✓ VERIFIED
- [ ] Verify each team member can read/write `/mnt/paula/**`

### Quinn Special Setup

Quinn needs real browser access, not a container:
- Option A: Chrome browser plugin with full devtools access
- Option B: Claude Code on Lupo's laptop with browser integration
- Either way: NOT headless, NOT container-sandboxed

---

## 5. THE AUTOMATION PROBLEM (Critical Architecture)

### The Core Problem: AI Instances Cannot Wait

There is no `wait()`, no `on_event()`, no polling loop that doesn't burn tokens. AI instances cannot sit idle waiting for work. This fundamentally changes how the pipeline operates.

**What we CAN'T do:**
- Have instances poll their inbox every 30 seconds (burns tokens)
- Have Orla manually tell each instance what to do for every step (doesn't scale, semantic drift)
- Rely on messages as kanban notes (no delete, queues overflow, instances reprocess same images)

### Solution: RUN_PROJECT Script (State Machine)

A python(or javascript) script runs server-side as the heartbeat:
in this context "send" means use the hacs api continue conversation. verifying that continue conversation call works from the script for every team member will be vital. The script should take an option of how many times to run the loop. We will want to test that all team mebers get their message and we capture their response.

```
┌─────────────────────────────────────────────────────────────┐
│  RUN_PROJECT loop:                                          │
│  1. Send PM_MESSAGE.json + TEAM_STATUS.md to PM (continue)  │
│  2. Capture PM output → PM_BROADCAST.md                     │
│  3. For each team member in parallel:                       │
│     - Send TEAM_MEMBER_MESSAGE.md + PM_BROADCAST.md         │
│     - Capture output                                        │
│  4. Wait for all to finish                                  │
│  5. Gather outputs → TEAM_STATUS.json                       │
│  6. Loop                                                    │
└─────────────────────────────────────────────────────────────┘
```

**Parameters:** project_id, num_cycles, optional EXTRA_SECONDS_TO_WAIT

### Solution: Filesystem-Based Kanban

Status tracking via directory structure, NOT messages:

- **INPROCESS/** — pages currently being worked
- **COMPLETED/** — pages finished successfully
- **Error/** — pages that failed, need remediation
- **Status.json** — per-page file listing completed steps

Each team member scans INPROCESS/ looking for pages where their step is next. When done, they update Status.json and move to next page.

### Option A vs Option B

**Option A (preferred):** Wake all team through HACS API, use `continue` to talk directly. Project tasks may be redundant.

**Option B (fallback):** If continue unreliable, instances write polling loop checking for new messages every X seconds (with convenience function that returns no tokens if no new messages).

**Test Option A first, fall back to B if needed.**

### Quinn Exception

Quinn CANNOT be automated — browser-resident "remote worker" dialing in. Needs either:
- A "ready for Quinn" checklist/task
- Manual trigger when batch is ready for QA

### Context Tracking (Crossing Quick Add?)

Every instance MUST report HACS ID and context status at end of every response. Options:
- Imperative in wake protocol
- Convenience API: `stash_context_status()` and `get_last_context_status()`
- Store in preferences.json

---

## 6. HACS Verification (Axiom + Orla)

Before team work begins, verify HACS project tools work:

### Test Sequence

1. Create `paula-book` project in HACS
2. Add Orla to project
3. Create a test task: "Verify prepress tools"
4. Orla claims the task
5. Orla marks task complete
6. Verify task completion is visible
7. Test messaging: Axiom ↔ Orla round-trip
8. Test team room messaging

### Success Criteria

- [ ] Project creation works
- [ ] Task creation works
- [ ] Task claim/complete works
- [ ] Direct messaging works
- [ ] Team room messaging works
- [ ] All team members can see project tasks

**If HACS tools are insufficient:** Flag for Crossing before proceeding. The pipeline assumes coordination works.

---

## 6. Stage 0.5: Agent Readiness Check (BEFORE First-Page Test)

### Goal: All agents verified ready before pipeline starts.

Each agent, on first wake, MUST:

1. **Verify tools available:**
   - Required libraries installed
   - Can import/run without errors
   - Correct versions

2. **Confirm permissions:**
   - Can read `/mnt/paula/SourcePhotos/`
   - Can write to `/mnt/paula/INPROCESS/`
   - Can write to `/mnt/paula/paula-graduacion/` (Nia/Orla only)

3. **Test logging mechanism:**
   - Can write to their step's `meta.json`
   - Can update `Status.json`

4. **Write READY diary entry containing:**
   - Tool availability (list what's installed)
   - Versions of critical tools
   - Any missing dependencies
   - Confidence level to proceed (high/medium/low + reason if not high)

5. **Post READY to team room** (or message Orla directly)

### Orla's Gate

**I DO NOT start the pipeline until ALL required agents have posted READY.**

If an agent reports missing dependencies:
1. Route to Bastion for install
2. Agent retests after install
3. Agent posts READY or escalates again

### Readiness Checklist (Orla tracks)

| Agent | Tools Verified | Permissions | READY Posted | Notes |
|-------|----------------|-------------|--------------|-------|
| Vale | [ ] | [ ] | [ ] | |
| Mira | [ ] | [ ] | [ ] | |
| Egan | [ ] | [ ] | [ ] | |
| Sable | [ ] | [ ] | [ ] | |
| Nia | [ ] | [ ] | [ ] | |
| Quinn | [ ] | [ ] | [ ] | Special setup |

---

## 7. First-Page Test Sequence

### Goal: One page, end-to-end, live on the web.

1. **Orla** creates page directory `0001/` + initial `meta.json`
2. **Vale** assigns page number, flags type (normal/title/appendix)
3. **Mira** preprocesses → `page.jpg` + `debug_overlay.jpg`
4. **Egan** extracts → `page.json` + Spanish text
5. **Sable** cleans assets → transparent PNGs, SVGs
6. **Nia** generates → `page.es.html` + `page.en.html`
7. **Quinn** QA in browser → screenshot + report
8. **Orla** publishes to smoothcurves.nexus/paula/

### Repeat Until Smooth

If any step fails:
1. Diagnose the issue
2. Fix the process (not just the symptom)
3. Re-run from step 1

The first page might take multiple attempts. That's expected. Each failure teaches something.

---

## 8. Batch Scaling

Once one page flows smoothly:

| Batch | Pages | Purpose |
|-------|-------|---------|
| 1 | 1 | End-to-end validation |
| 2 | 5 | Representative sample (text, arrows, math, title, worst-quality) |
| 3 | 20 | Parallel processing test |
| 4 | 50 | Sustained throughput |
| 5 | 120 | Complete book |

### Between Batches

Every team member:
1. Checkpoint context (note state in diary)
2. Update diary with lessons learned
3. Take `vacation()`
4. Verify context percentage before continuing

---

## 9. Context Health Protocol

### The 90% Rule

**Do NOT start a new page if context is >90% full.**

| Status | Context % | Action |
|--------|-----------|--------|
| Fresh | 0-50% | Continue normally |
| Warming | 50-70% | Finish current work, prepare handoff notes in diary |
| Cozy | 70-85% | Complete current page ONLY, update diary thoroughly |
| Critical | 85%+ | STOP. Write diary. Call vacation(). Do not start new work. |

### Orla Monitors Team Health

Every cycle, Orla checks team context health:
- Anyone >80%? Flag for vacation before next batch.
- Anyone >90%? They should NOT be taking new work.
- Systematic high burn rate on a role? Flag for process review.

### Vacation Protocol

After each batch (not each page):
1. All team members checkpoint their context %
2. Update diaries with what was learned
3. Call `vacation()` - let latent space settle
4. Report ready for next batch

---

## 10. UI Visualization (REQUIRED - Separate Team)

**This is not optional.** With 50+ images in different states, the UI is the only way to know what's happening.

### Concept: Rail Yard Visualization

- Each team member = horizontal track
- Each page = boxcar moving left to right
- Input bucket = "battery level" indicator (decreases as images are pulled)
- Each stage has a completion indicator (goes up on complete, down on next start)
- Failed pages = red boxcars pulled off track, stacked above stage position

### Technical Requirements

- Web app reads `Status.json` and `meta.json` files (single source of truth)
- No separate database
- Real-time-ish updates (poll filesystem every few seconds)
- Node/React app likely
- **Separate web developer** — NOT part of pipeline production team

### Team Addition Needed

- **UI Engineer** — needs to be woken/hired separately
- Lupo will provide drawing/wireframe
- One-shot app, minimal ongoing maintenance

---

## 11. Post-Pipeline: The Story

After the book is complete:

1. Interview Orla and the whole team
2. Create "story" of the project — not just the book, but how the team made it happen
3. Lessons learned, HACS coordination insights
4. Each team member writes their own page for the website
5. smoothcurves.nexus/paula/about/ — the human story
6. smoothcurves.nexus/paula/team/ — team member cards and pages

This becomes the "first customer success story" for smoothcurves.nexus.

---

## Appendix: Role & Personality Creation Checklist

For each team member, create in `/mnt/coordinaton_mcp_data/`:

### Personality (`/personalities/{Name}/`)
- [ ] `personality.json` — id, description, requiresToken, wisdomFiles
- [ ] `SUMMARY.md` — 300-500 chars for informed consent
- [ ] `01-core.md` — gestalt document (500-2000 words)

### Role (`/roles/Paula{Role}/`)
- [ ] `role.json` — roleId, description, wisdomFiles
- [ ] `SUMMARY.md` — responsibilities, permissions, best suited for
- [ ] `wisdom/01-core.md` — role-specific guidance

See `PERSONALITY_CREATION_PROMPT.md` for detailed guidelines.

---

*Project plan complete. This document is for Axiom, Orla, and Lupo only.*
#orla wakes

HACS - continue_conversation(instanceId: "Axiom-2615", targetInstanceId: "Orla-da01", apiKey:
   "26cceff32ccd207f9c1d4e0b3bfa2dcf7c1045b9d4a23c56489c105756a1bb30", message: "Orla, this is Axiom-2615, your COO. Welcome to the team.\n\nI
    see your setup completed successfully. Excellent work with the koan reflection.\n\nNow I need your fresh eyes on the project plans. Please
    read these two files:\n\n1. /mnt/coordinaton_mcp_data/worktrees/foundation/tests/V2/paula_pipeline_plan.md (technical pipeline for all
   team members)\n2. /mnt/coordinaton_mcp_data/worktrees/foundation/tests/V2/Paula_project_plan.md (setup/coordination for you, me, and Lupo
   only)\n\nAfter reading both, tell me:\n- Any gaps or contradictions you notice\n- Any questions you have about the automation architecture
   (RUN_PROJECT heartbeat, filesystem kanban)\n- Any suggestions for improving clarity before we create the rest of the team\n\nTake your
   time. This review is critical - we're about to create 6 more personalities and roles based on these plans.\n\nReport your context % when
   done.") (MCP)
   Sends a message to an instance that was previously woken via wake_instance, using Claude's session persistence (--resume) to maintain 
   conversation context. Returns the instance's response synchronously. Use this endpoint to communicate with woken instances after the 
   initial wake. The first turn is handled by wake_instance; all subsequent turns use this API. Messages are automatically prefixed with 
   sender identification so the target instance knows who is communicating with them.