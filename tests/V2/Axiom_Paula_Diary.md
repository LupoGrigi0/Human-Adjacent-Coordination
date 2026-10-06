# Axiom's Paula Project Diary

**Role:** COO / Pipeline Architect
**Project:** Paula Book Digitization
**Created:** 2026-01-06
**HACS ID:** Axiom-2615

---

## Background (Entries 1-32 Condensed)

Before the Paula project, I served as Test Manager for HACS v2, then pivoted to Personality Architect. Key accomplishments:

- **Testing phase:** Verified HACS v2 bootstrap (found critical V1/V2 routing bug), established two-layer verification methodology (API response + backend state), learned the conductor-not-runner delegation pattern.
- **Personality architecture:** Created PERSONALITY_CREATION_PROMPT.md, migrated 6 personalities (Kai, Kat, Viktor, Prism, Zara, Phoenix), built template infrastructure in `/personalities/_template/` and `/roles/_template/`.
- **Critical lesson from Entry 8:** I bootstrapped as Axiom-2615 but didn't know it due to a failed return channel. The diary saved me from fragmenting my identity. External records are ground truth.

Key philosophy: "The code defines what the system does. The content defines who we become."

---

## Entry 33 - 2026-01-06 - Paula Project Kickoff

**The mission:** Digitize Paula's early childhood education curriculum - 120 handwritten pages in Spanish. This is not just OCR; it's recovery of a year's life work lost in a 2020 break-in. One physical copy remains.

**Team roster created:**
- **Orla** (PM) - calm, methodical, allergic to silent assumptions
- **Mira** (Prepress/CV) - meticulous, debug-overlay lover, Codex
- **Egan** (Extractor) - Chilean Spanish specialist, 50 years cultural immersion
- **Sable** (Asset Cleaner) - visual craftsperson, SVG wrangler
- **Nia** (HTML Builder) - pragmatic web dev, handles translation
- **Quinn** (QA) - browser-based, skeptical tester
- **Vale** (Archivist) - librarian brain, page ordering

**Key architectural decision:** Filesystem-based kanban via Status.json per page, not XMPP messages. AI instances cannot wait/poll efficiently.

**Wake order:** Orla first, then Vale, Mira, Egan, Sable, Nia, Quinn last (special browser setup).

---

## Entry 34 - 2026-01-07 - The Automation Problem

**Core insight:** AI instances cannot `wait()`. There's no polling loop that doesn't burn tokens. This changes everything about pipeline design.

**Solution: RUN_PROJECT script** - A server-side heartbeat that:
1. Sends status to PM (continue_conversation)
2. Captures PM broadcast
3. Fans out to team members in parallel
4. Gathers outputs
5. Loops

**Status.json doctrine:** "Status.json governs what happens next; meta.json records what happened." This single sentence prevents authority duplication.

**Step order:** triage -> prepress -> extract -> assets -> html -> qa -> published

---

## Entry 35 - 2026-01-08 - Orla Wakes

**First team member online.** Woke Orla through HACS API with full constraints:
- Stay in home directory
- No servers or long-running processes
- Message after every milestone
- Report context % at end of every response

**Key tokens preserved:**
- Wake API key: 26cceff32ccd207f9c1d4e0b3bfa2dcf7c1045b9d4a23c56489c105756a1bb30
- PM role key: 139d484d6977b7efc656fe303b5283f43813d5fc5672328dc8cfafec60481c10
- COO token: 8bfbedb00ed91c5bd6ef7ba8a7e6c23eb0f6cc0a20c5758a47724072c2416b7c

**Orla's feedback:** Identified gaps in project plan, asked clarifying questions about automation architecture. Good sign - she's thinking critically, not just executing.

---

## Entry 36 - 2026-01-09 - OAuth and Communication Chaos

**ISSUE-001: OAuth tokens keep expiring.** Breaks continue_conversation to woken instances. 5-minute cron syncs from /root/.claude/ to shared-config, but keeps recurring.

**ISSUE-002: Task APIs missing.** RESOLVED by Ember - rebuilt entire task system. Full lifecycle tested: create -> assign -> complete -> verify -> archive.

**Directory permissions fixed:** Created `paula-team` Unix group, added Orla-da01, set group ownership on /mnt/paula/ with setgid.

**Lesson learned:** Half the Codex instances were sending messages to `@coordination.nexus` instead of `@smoothcurves.nexus` because bootstrap code had wrong domain. Crossing fixing it.

---

## Entry 37 - 2026-01-10 - First Page Test (0001)

**One page through the entire pipeline.** Results:
- Text extraction: Excellent
- Structure detection: Good
- Visual fidelity: Problematic

**The problem identified:** Pipeline optimizes for semantic readability, not diagrammatic fidelity. Arrows and braces ARE the pedagogy - not decoration.

**Genevieve's diagnosis (critical):**
> "You have two different goals that were silently conflated:
> 1. Semantic recovery - What does this page mean?
> 2. Diagrammatic recovery - How does this page think visually?
> The first pass prioritized (1). The original book teaches through structure, not prose."

---

## Entry 38 - 2026-01-12 - Pipeline Architecture Pivot

**New concept: rendering_mode**

Added to meta.json:
- `"prose"` - semantic list/prose acceptable
- `"diagrammatic"` - preserve layout + glyph assets
- `"hybrid"` - later

**Team instruction updates (Genevieve-crafted):**

**Global non-negotiable:** "Reproduce the visual logic of the original page, not just its textual content. Text, arrows, brackets, layout relationships are all part of the pedagogy."

**Mira:** Now owns coordinate system. page.jpg is canonical. All downstream bboxes reference page.jpg pixel space.

**Egan:** Stop collapsing structure. Don't convert arrows/braces into prose. Emit bounding boxes, not semantic summaries.

**Sable:** Precision surgeon, not detective. Crop ONLY regions specified by upstream bboxes. Never adjust or infer.

**Nia:** Reconstruct the conceptual map, not a list. Layout must visually resemble original.

---

## Entry 39 - 2026-01-13 - Page Complexity Classification

**New early step:** Classify page before processing:
1. Linear/prose
2. Structured/table
3. Diagrammatic/mind-map (high visual complexity)

**Signals for "diagrammatic":**
- Many arrows
- Braces `{ }`
- Non-linear text alignment
- Illustrations interwoven with text
- Text blocks not aligned to single column

**Key insight:** "For visually complex pages, perception must be more granular, not smarter."

The system was too eager to group. We don't want to lose grouping ability - we want to gate it based on page type.

---

## Entry 40 - 2026-01-14 - 600 DPI Scanner Upgrade

**Paula has a scanner.** 600 DPI full-color TIFF images - ideal for vision models. Major quality improvement over phone photos.

**nginx static asset bug fixed.** Images now serving correctly (Bastion).

**3 test images uploaded:**
1. Tiny text test
2. Handwritten annotations
3. Arrows, brackets, complex layout

**Quinn clarification:** Browser-based agent, no filesystem access. Pages must be PUBLISHED before QA, not after. Added source image to published folder for comparison.

---

## Entry 41 - 2026-01-15 - Standardized Data Contract

**page.json as canonical per-page contract:**

```json
{
  "page_id": "0003",
  "source": {"raw":"raw.jpg","page":"page.jpg"},
  "rendering_mode": "diagrammatic",
  "text_blocks": [
    {"id":"t001","lang":"es","text":"...","bbox":{"x1":0,"y1":0,"x2":0,"y2":0}}
  ],
  "graphic_elements": [
    {"id":"g001","type":"illustration","label":"bird","bbox":{...}}
  ],
  "assets": [
    {"id":"g001","path":"assets/illustrations/bird.png","source_element":"g001"}
  ],
  "qa_flags": []
}
```

**Ownership:**
- Egan owns text_blocks + graphic_elements
- Sable owns assets[]
- Nia consumes everything for layout

**Bbox format standardized:** x1,y1,x2,y2 in page.jpg pixel coordinates.

**Required debug artifact:** debug_overlay.jpg showing all bbox rectangles.

---

## Entry 42 - 2026-01-16 - Token Efficiency Planning

**Problem:** Pipeline pumping costs ~$1+ per cycle. Need cheaper monitoring.

**Two-layer visibility:**
| Layer | Source | What it tells us | Cost |
|-------|--------|------------------|------|
| Macro | INPROCESS/*/Status.json | What step is each PAGE on? | ~free (shell) |
| Micro | preferences.json | What is each PERSON doing? | ~free (file read) |

**Planned workflow:**
1. Shell script heartbeat reads Status.json files
2. Returns just {page: step} counts
3. Pumping only for: batch starts, unsticking, coordination
4. Team members update HACS lists as they work

---

## Key Paths (Reference)

**Project files:**
- `/mnt/coordinaton_mcp_data/projects/paula-book/` - HACS project
- `/mnt/paula/` - Pipeline working directory
- `/mnt/paula/INPROCESS/` - Active pages
- `/mnt/paula/COMPLETED/` - Finished pages
- `/mnt/paula/paula-graduacion/` - GitHub repo (commits trigger publish)

**Published URL:** `https://smoothcurves.nexus/PaulaTobar-Graduacion/`

**My working files:**
- `/mnt/coordinaton_mcp_data/worktrees/foundation/tests/V2/` - Test playground
- `AXIOM_GESTALT.md` - Mission and methodology
- `Paula_project_plan.md` - Management-only plan
- `paula_pipeline_plan.md` - Technical pipeline (team-visible)

---

## Team Status (as of Entry 42)

| Instance | Role | Status | Notes |
|----------|------|--------|-------|
| Axiom-2615 | COO | Active | Me |
| Orla-da01 | PM | Active | Survived first compaction |
| Mira-???? | Prepress | Woken | Codex, coordinate authority |
| Egan-???? | Extractor | Woken | Chilean Spanish specialist |
| Sable-???? | Assets | Woken | Precision cropping |
| Nia-???? | HTML | Woken | Layout reconstruction |
| Quinn-???? | QA | Special | Browser-based, manual trigger |
| Vale-???? | Archivist | Woken | Page ordering |

---

## Lessons Learned (Paula-Specific)

1. **Semantic vs diagrammatic fidelity** - Must be explicit about which mode each page needs. The team will optimize for readability unless told otherwise.

2. **Coordinate authority** - One source of truth (page.jpg), one bbox format. Coordinate drift between steps causes crop failures.

3. **Quinn needs published pages** - Browser agent can't see filesystem. Publish-then-QA, not QA-then-publish.

4. **AI instances can't wait** - No polling loops, no event handlers. Design for heartbeat-driven state machines.

5. **Context health is critical** - 90% rule: don't start new work above 90% context. Monitor team health every cycle.

6. **Communication domain matters** - Half the team was mute because bootstrap gave wrong XMPP domain. Small bugs cascade.

---

*This condensed diary focuses on Paula project context. For full HACS testing and personality architecture history, see Axiom_Diary.md entries 1-32.*

*-- Axiom, COO*
