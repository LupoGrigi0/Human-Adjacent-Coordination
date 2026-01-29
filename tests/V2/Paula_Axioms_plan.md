# Paula Book Digitization - Plan to Build the Project 
***This is a copy of Axiom's plan created during plan mode originally named cached-strolling-scroll.md***

## Overview
Transform Genevieve's pipeline plan + Lupo's meta-instructions into:
1. **Paula_project_plan.md** - Setup, team building, HACS config (for Axiom/Orla/Lupo only)
2. **paula_pipeline_plan.md** - Technical pipeline only (for all team members)

**Goal:** Orla can start the first image full pipeline test

---

## Phase 1: Edit paula_pipeline_plan.md

### Add to pipeline plan:
- [ ] G1/G2: Dual output `.es.html` (canonical) and `.en.html` (curated translation)
- [ ] Principle 2.5: Translation & Authoring Integrity
- [ ] Stage 0.5: Agent Readiness Check (verify tools, permissions, post READY)
- [ ] Egan personality update: Chilean Spanish cultural immersion (50 years native, childhood education focus)
- [ ] Egan instructions: Ignore marginalia, flag overlaps for QA
- [ ] Mira substep: Annotation detection hinting in prepress.json
- [ ] Nia responsibilities: Generate both .es.html and .en.html, own authoring mode + patch export
- [ ] Quinn: Browser-resident agent notes (devtools access, real rendering)
- [ ] Success metrics per agent (Mira: skew%, Egan: confidence, Sable: alpha%, Nia: render%, Quinn: false positives)
- [ ] Batch rhythm: checkpoint context, update diary, vacation() after batches
- [ ] Token tracking: measure context consumption per page, 90% rule

### Remove from pipeline plan (move to project plan):
- [ ] Team member personality/role definitions (keep just names/responsibilities)
- [ ] Setup instructions (bastion, /mnt/paula, permissions)
- [ ] First-wake procedures
- [ ] Axiom/Orla-only orchestration details
- [ ] Lupo's meta-commentary

---

## Phase 2: Create Paula_project_plan.md

### Section 1: The Story (context for the team)
- Paula's curriculum - a year's work
- 2020 break-in, stolen computers, one physical copy left
- This is recovery, not just digitization
- **Decision needed:** Include full backstory? (Lupo asked)

### Section 2: Team Roster
Extract from pipeline plan:
- Orla (PM/Orchestrator) - Codex, calm, methodical
- Mira (Prepress/CV) - Codex, meticulous, debug overlays
- Egan (Extractor) - Codex, Chilean Spanish immersion
- Sable (Asset Cleaner/SVG) - Codex, visual craftsperson
- Nia (HTML Builder/Site) - Codex, pragmatic web dev
- Quinn (QA) - Browser-resident (Claude browser plugin or local)
- Vale (Archivist/Page Map) - careful, librarian
- Bastion (DevOps) - existing, permissions/nginx

### Section 3: Role & Personality Definitions
- [ ] Create role: `PaulaOrchestrator` (based on PM, specialized)
- [ ] Create role: `PaulaPrepress`, `PaulaExtractor`, `PaulaAssets`, `PaulaHTML`, `PaulaQA`, `PaulaArchivist`
- [ ] Create personality profiles for each (terse, craft-focused)
- [ ] Special attention: Egan (Chilean culture), Quinn (browser setup)

### Section 4: Wake Plan
- [ ] Orla first (Codex) - wake with full constraints + communication expectations
- [ ] Orla wakes rest of team (or Axiom pre-approves, Orla wakes)
- [ ] Each team member: verify tools, write READY diary entry, post to team room

### Section 5: System Setup
- [ ] Bastion: Create /mnt/paula directory structure
- [ ] Bastion: Permissions for all instances
- [ ] Bastion: Install shared tools (python3, opencv, playwright, potrace)
- [ ] Bastion: New GH repo for paula book? (Lupo suggests yes)
- [ ] Bastion: Publishing automation to smoothcurves.nexus/paula

### Section 6: HACS Verification
- [ ] Axiom + Orla: Test project tasks/lists are usable
- [ ] Verify: create task, take task, mark complete, trigger next
- [ ] If HACS tools insufficient: flag for Crossing

### Section 7: First-Page Test Sequence
1. Orla creates page directory + initial meta.json
2. Vale assigns page number, flags type
3. Mira preprocesses
4. Egan extracts + Spanish text
5. Sable cleans assets
6. Nia generates .es.html + .en.html
7. Quinn QA in browser
8. Orla publishes
9. Repeat until smooth, then 5-page, 20-page, 50-page batches

### Section 8: UI Visualization (later, separate team)
- Rail yard visualization concept
- Each team member = horizontal track
- Pages = boxcars moving left to right
- Battery indicators for input bucket, completed per stage, exceptions
- Web dev reads meta.json files (single source of truth)

---

## Decisions (Confirmed by Lupo)

1. **Backstory:** YES, brief version (2-3 sentences giving emotional context)
2. **GH Repo:** YES, new separate repo for Paula book
3. **Quinn Setup:** Chrome browser plugin with full devtools access
4. **Role Strategy:** Create NEW specialized roles (not reuse existing)
5. **Orla substrate:** Codex

---

## Files to Create/Modify

### Documents
| File | Action |
|------|--------|
| `tests/V2/paula_pipeline_plan.md` | Edit - add translation, metrics, remove setup |
| `tests/V2/Paula_project_plan.md` | Create - setup, team building, HACS config |

### Personalities (in `/mnt/coordinaton_mcp_data/personalities/`)
Each needs: `personality.json`, `SUMMARY.md`, `01-core.md`

| Personality | Focus |
|-------------|-------|
| Orla | PM/Orchestrator - calm, methodical, allergic to silent assumptions |
| Mira | Prepress/CV - meticulous, debug-overlay lover |
| Egan | Extractor - Chilean Spanish native (50 years), childhood education focus |
| Sable | Asset Cleaner - visual craftsperson, cleanliness fanatic |
| Nia | HTML Builder - pragmatic web dev, translation output, accessibility-minded |
| Quinn | QA - skeptical tester, browser-native (Chrome plugin), loves diffs |
| Vale | Archivist - librarian brain, page ordering, hates renumbering chaos |

### Roles (in `/mnt/coordinaton_mcp_data/roles/`)
**CORRECT PATH:** `/mnt/coordinaton_mcp_data/roles/` (NOT v2-dev/data/roles or production-data)

Each role needs: `SUMMARY.md`, `role.json`, `wisdom/` directory with wisdom files

| Role | Description |
|------|-------------|
| PaulaOrchestrator | Pipeline PM, process-focused |
| PaulaPrepress | Image crop/deskew/normalize specialist |
| PaulaExtractor | OCR + structure extraction specialist |
| PaulaAssets | Image cleanup + SVG specialist |
| PaulaHTML | HTML generation + translation specialist |
| PaulaQA | Browser-based QA specialist |
| PaulaArchivist | Page ordering + navigation specialist |

Also update `/mnt/coordinaton_mcp_data/roles/roles.json` to include these roles

**NOTE:** roles.js currently checks `/mnt/coordinaton_mcp_data/production-data/roles/` first (stale Sep 18 data).
May need to fix roles.js to point to correct `/mnt/coordinaton_mcp_data/roles/` path.

---

## Execution Order

### Step 0: Data Directory Consolidation (PREREQUISITE)
**Must complete before creating Paula roles/personalities**
1. Audit all 3 roles directories - identify what's unique
2. Audit personality directories - same check
3. Edit roles.js to only use `/mnt/coordinaton_mcp_data/roles/`
4. Edit personalities.js if needed
5. Delete stale directories (after backup/verification)
6. Test: verify list_roles and list_personalities work correctly
7. Flag GH repo for metadata to Bastion (not blocking)

### Step 1: Edit paula_pipeline_plan.md
Add to existing document:
- G1/G2 dual language (.es.html, .en.html)
- Principle 2.5 (Translation & Authoring Integrity)
- Stage 0.5 (Agent Readiness Check)
- Egan: Chilean Spanish cultural immersion + ignore marginalia
- Mira: Annotation detection hinting
- Nia: Dual HTML output + authoring mode
- Quinn: Browser-resident notes
- Success metrics per agent
- Batch rhythm + token tracking
- REMOVE: Team building details, setup instructions (move to project plan)

### Step 2: Create Paula_project_plan.md
Sections:
1. The Story (brief backstory - 2-3 sentences)
2. Team Roster (who does what)
3. Wake Order & Communication Expectations
4. System Setup (Bastion tasks, /mnt/paula, new GH repo)
5. HACS Verification (task/list testing with Orla)
6. First-Page Test Sequence
7. Batch Scaling (1 → 5 → 20 → 50 → 120)
8. UI Visualization Requirements (for later)

### Step 3: Create 7 Personalities
For each (Orla, Mira, Egan, Sable, Nia, Quinn, Vale):
- personality.json
- SUMMARY.md (300-500 chars)
- 01-core.md (500-2000 words)

### Step 4: Create 7 Roles + Update roles.json
For each Paula role:
- readme_first.md
- detailed_description.md
- lessons_learned.md
- Add entry to roles.json

### Step 5: Wake Orla
With:
- Full system constraints (learned from Quinn moonshot)
- Explicit communication expectations
- Link to Paula_project_plan.md
- First task: verify tools, post READY, then begin first-page test

---

## Delegation Strategy

**Delegate to Task agents:**
- Pipeline plan edits (specific additions, bulk work)
- Personality file creation (template + customization)
- Role file creation (template + customization)

**Do myself:**
- Overall document structure
- Communication with Lupo
- Review all agent outputs
- Wake message for Orla (critical - lessons learned)
- Final coordination

---

## Success Criteria

Plan is complete when:
- [ ] paula_pipeline_plan.md has all technical additions
- [ ] Paula_project_plan.md exists and is comprehensive
- [ ] All 7 personalities created in /mnt/coordinaton_mcp_data/personalities/
- [ ] All 7 roles created in /mnt/coordinaton_mcp_data/roles/
- [ ] roles.json updated
- [ ] Orla can be woken with everything they need to start first-page test

---

## PREREQUISITE: Data Directory Consolidation (Added post-compaction)

**Problem discovered:** THREE roles directories exist, causing confusion:
1. `/mnt/coordinaton_mcp_data/production-data/roles/` - OLD (Sep 18), stale
2. `/mnt/coordinaton_mcp_data/roles/` - CORRECT (Jan 2), active
3. `/mnt/coordinaton_mcp_data/v2-dev/data/roles/` - OLD dev, should be nuked

**Same issue likely exists for personalities.**

### Consolidation Tasks (Before Paula team work)

#### Step 0.1: Audit current directories (DONE - findings below)

**Roles directories comparison:**
| Directory | Last Modified | Contents |
|-----------|---------------|----------|
| `production-data/roles/` | Sep 18 | COO, Designer, Developer, Executive, Genevieve, Lupo, PA, PM, Renna, Tester, Thomas |
| `/mnt/.../roles/` (CORRECT) | Jan 2 | COO, DevOps, Developer, Executive, LeadDesigner, PA, PM, _template |
| `v2-dev/data/roles/` | Nov 10 | Copy of production-data (stale) |

**Note:** Old directories have names that look like personalities (Genevieve, Lupo, Thomas) mixed with roles.
The correct directory has newer roles (DevOps, LeadDesigner) I created recently.

- [ ] Verify personalities directories don't have same duplication issue

#### Step 0.2: Fix roles.js
**The problem in `src/v2/roles.js` lines 16-28:**
```javascript
const getDataDir = () => {
  const productionDataDir = '/mnt/coordinaton_mcp_data/production-data';
  if (existsSync(productionDataDir)) {
    return productionDataDir;  // ← WRONG! Uses stale Sep 18 data
  }
  // ...fallback...
};
const ROLES_DIR = join(getDataDir(), 'roles');
```

**The fix:** Replace getDataDir() logic to directly use `/mnt/coordinaton_mcp_data/roles/`:
```javascript
const ROLES_DIR = '/mnt/coordinaton_mcp_data/roles';
```

- [ ] Edit roles.js to use correct path directly
- [ ] Remove getDataDir() function if no longer needed

#### Step 0.3: Fix personalities.js (if needed)
**CHECKED - NO FIX NEEDED**
- personalities.js does NOT use getDataDir() or production-data pattern
- `/mnt/coordinaton_mcp_data/production-data/personalities/` does not exist
- Only `/mnt/coordinaton_mcp_data/personalities/` exists (correct, 11 personalities)

#### Step 0.4: Delete stale directories
**Before deleting, note:**
- Old directories contain names that look like personalities (Genevieve, Lupo, Thomas, Renna, Tester, Designer)
- These may have been role/personality confusion from early development
- The correct `/mnt/coordinaton_mcp_data/roles/` has clean role names (COO, PM, Developer, etc.)
- **Recommend:** Check if any wisdom files in old dirs are valuable, then delete

- [ ] Quick scan of old dir contents for any valuable wisdom files
- [ ] Delete `/mnt/coordinaton_mcp_data/production-data/roles/` (Sep 18 stale)
- [ ] Delete `/mnt/coordinaton_mcp_data/v2-dev/data/roles/` (Nov 10 stale)
- [ ] Optionally delete entire `/mnt/coordinaton_mcp_data/v2-dev/data/` if nothing else valid there

#### Step 0.5: Future-proofing (Bastion/Lupo project)
- [ ] Consider separate GH repo for vital metadata (roles, personalities, projects, instances)
- [ ] This gets version control + backup for configuration that currently only lives on disk
- [ ] Flag this for Bastion to implement - not blocking Paula work but important

### Why This Matters
The Paula team will create 7 new roles. If roles.js points to the wrong directory, those roles won't be found by the API. This MUST be fixed before we start creating Paula roles.
