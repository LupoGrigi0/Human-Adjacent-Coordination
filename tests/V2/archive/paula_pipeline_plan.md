Totally makes sense. You’re asking for the **real plan**: vision → goals → team → pipeline → per-step responsibilities → instrumentation → metadata → failure handling → “done” signals → scaling from 1 page to 120 pages. No API plumbing. Just *what to do*, with enough specificity that a smart autonomous team can execute. ✅

Below is an end-to-end plan you can paste straight into a `.md`.

---

# Paula Book Digitization: Image → Semantic HTML Website (Agent-Based Plan)

## Vision

Recover Paula’s curriculum from paper photos into a **living digital substrate**:

1. **Editable** (semantic HTML, structured content)
2. **Publishable** (static website on smoothcurves.nexus)
3. **Productizable** (ready for interactive/gamified learning later)

This is not “OCR a PDF.” This is “turn a photographed book into a structured knowledge artifact.”

## Big Goals

### G1 — Recovery (MVP + full run)

* Convert each page photo into:

  * `page.jpg` (cleaned page image)
  * `page.json` (structured content + region metadata)
  * `assets/` (transparent PNG illustrations; SVG for connectors where worth it)
  * `page.es.html` (semantic-first HTML — **canonical Spanish original**)
  * `page.en.html` (semantic HTML — **curated English translation**)
  * `qa/` (screenshot + QA report)
* Track progress and quality with auditable logs.

**Important:** Spanish is the authoritative source. English is our curated translation, NOT runtime Google Translate. Paula's Chilean Spanish idioms, pedagogical intent, and emotional tone must be preserved.

### G2 — Website

* Assemble `index.html` + per-page HTML into a navigable static site:

  * `/paulasbook/pages/0001.es.html` (Spanish)
  * `/paulasbook/pages/0001.en.html` (English)
  * `/paulasbook/assets/...`
* Deploy via Git hook (preferred) or temporary nginx mapping.

### G3 — Gamification-ready (later)

* Preserve meaning (lists, groupings, relationships, connectors).
* Vectorize diagram language (arrows/brackets/connectors) where it increases future editability, scale, and animation.

---

## Core Principles (Non-Negotiables)

1. **Semantic-first**: meaning > pixel-perfect layout.
2. **One page = one folder = one truth**: per-page metadata travels with the page.
3. **Translation & Authoring Integrity**:
   * Spanish (`.es.html`) is canonical — the authoritative source
   * English (`.en.html`) is curated and versioned — not machine-generated at runtime
   * Authoring edits must be exportable as patches and committed (no silent runtime edits)
4. **Instrument the hell out of it**: every stage logs inputs, outputs, environment, and decisions.
5. **Human-in-the-loop is a feature**: title pages/appendix/order weirdness is expected—ask.
6. **Stop when failure rates spike**: if a stage <90% success over a batch, pause and fix the systematic issue.

---

## Team Roster

| Role | Mission | Substrate |
|------|---------|-----------|
| **Orla** (PM) | Keep the factory moving, truth in metadata, quality high | Codex |
| **Mira** (Prepress) | Normalize photos into consistent page images | Codex |
| **Egan** (Extractor) | Page image → structured content with confidence | Codex |
| **Sable** (Assets) | Extract illustrations, clean backgrounds, vectorize | Codex |
| **Nia** (HTML/Translation) | Generate `.es.html` + `.en.html`, authoring controls | Codex |
| **Quinn** (QA) | Browser verification, screenshots, QA reports | Browser plugin |
| **Vale** (Archivist) | Page ordering, sections, `page_map.json` | Codex |
| **Bastion** (DevOps) | Permissions, nginx, deployment hooks | Existing |

*Detailed personality profiles and wake procedures are in the Project Plan.* 

## Shared Environment + Data Contract

### Directories

* Input photos: `/mnt/paula/SourcePhotos/`
* Work in progress: `/mnt/paula/INPROCESS/####/` (pages being worked)
* Completed pages: `/mnt/paula/COMPLETED/####/` (QA-passed, ready for publish)
* Failed pages: `/mnt/paula/Error/####/` (need remediation)
* Final publish staging: `/mnt/paula/paula-graduacion/` (GH repo clone — commit triggers deploy)

### Per-page folder contract (`/mnt/paula/INPROCESS/0007/`)

Minimum expected artifacts:

* `raw.jpg` (original copy)
* `page.jpg` (cropped/deskewed/normalized)
* `Status.json` (kanban state — steps completed, current step, assigned_to)
* `meta.json` (detailed metrics, history, flags for this page)
* `prepress/`

  * `debug_overlay.jpg`
  * `prepress.json`
* `extract/`

  * `page.json` (structured content)
  * `raw_text.txt` (fallback)
* `assets/`

  * `*.png` (transparent)
  * `*.svg` (connectors/brackets/arrows as needed)
  * `assets_manifest.json`
* `html/`

  * `page.html`
* `qa/`

  * `render.png`
  * `report.json`
* `logs/`

  * `prepress.log`
  * `extract.log`
  * `assets.log`
  * `html.log`
  * `qa.log`

Everything is auditable and rerunnable from the artifacts.

---

## Status.json (Kanban State)

**The filesystem IS the kanban.** Each page has a `Status.json` that tracks pipeline progress:

```json
{
  "page_id": "0007",
  "steps_completed": ["triage", "prepress"],
  "current_step": "extract",
  "assigned_to": null,
  "flags": { "needs_help": false, "low_quality": false }
}
```

**Step order:** `triage → prepress → extract → assets → html → qa → published`

**How agents find work:**
1. Scan INPROCESS/ for all page folders
2. Read each Status.json
3. Find pages where `current_step` matches YOUR step AND `assigned_to` is null
4. Claim by writing your instanceId to `assigned_to`
5. Do your work
6. Update: add your step to `steps_completed`, advance `current_step`, clear `assigned_to`

**Moving pages between buckets:**
* INPROCESS → COMPLETED: When Quinn's QA passes
* INPROCESS → Error: When a step fails and needs remediation
* Error → INPROCESS: After remediation, ready to retry

---

## Metadata Strategy (Per-page, not global)

**Single source of truth:** `meta.json` inside each page folder.

Why per-page beats one giant manifest:

* no locking contention
* easy to rerun one page
* robust under parallelism
* each page carries its history

### `meta.json` fields (suggested)

* `page_id`: `"0007"`
* `source_filename`: original phone filename
* `status`: enum (`new`, `prepressed`, `extracted`, `assets_ready`, `html_ready`, `qa_passed`, `published`, `needs_help`)
* `flags`: `{ "title_page": false, "appendix": false, "rotated": false, "low_quality": false }`
* `metrics`:

  * `skew_deg`, `blur_score`, `brightness_mean`
  * extraction confidence summary
* `artifacts`: paths or filenames for required outputs
* `history`: array of step records

  * `{ step, started_at, finished_at, success, notes, log_file }`

Orla owns the schema; each specialist appends their step record.

---

## “Done” Signaling (How handoffs work)

Every step signals completion by:

1. writing output artifacts
2. updating `meta.json` (`status` + step record)
3. writing a log file with a final line like:

   * `DONE prepress page_id=0007 status=success outputs=[page.jpg,debug_overlay.jpg,prepress.json]`

Orla watches statuses, not chats.

---

## How the next page is picked

Orla maintains a queue by scanning page folders:

* “next work item” is the **lowest page_id** with `status == <needed stage>` OR from a backlog list curated by Vale.
* “needs_help” pages go to a separate “Exceptions” queue.

For MVP, Orla picks a **representative batch of 5**:

* normal text page
* heavy arrows/connectors
* math/conics page
* title/appendix page
* worst-quality photo

---

# Pipeline Overview (High Level)

## Stage 0.5: Agent Readiness Check (First Wake Only)

**Goal:** Verify each agent has tools, permissions, and understanding before pipeline starts.

**Each agent on first wake:**
1. Verify required libraries/tools are available
2. Verify read/write permissions to `/mnt/paula/**`
3. Verify logging mechanism works
4. Write "READY" diary entry containing:
   * Tool availability and versions
   * Any missing dependencies
   * Confidence level to proceed
5. Post READY message to team room

**Orla does NOT start the pipeline until all required agents have posted READY.**

This avoids 80% of mid-pipeline friction.

---

## Stage 0.6: Model & Environment Sanity Check (Before Each Batch)

**Goal:** Prevent "pipeline works but quality is mysteriously meh" from wrong model selection.

**Each agent, before processing any page/batch:**
1. Write one line to their log: `model name/version + key capability flags`
2. Post READY with "Model OK" to the project room
3. Confirm they have vision capabilities if their role requires seeing images (Egan, Sable, Nia, Quinn)

**Orla's rule:**
- Don't start pipeline until required agents confirm model selection is correct
- Agents that need vision MUST confirm: "Model: Codex, Vision: enabled"

**Why this matters:**
Wrong model = pipeline runs but output quality is wrong. This happened in v1 when Claude Code (no vision) was used instead of Codex (has vision). One flag, caught early, saves hours of rework.

---

## Stage A: Ingest + Triage

**Goal:** turn messy photo dump into ordered, labeled work items.

**Outputs:** page folders created, `raw.jpg`, initial `meta.json`, optional thumbnails/contact sheet.

### Who does what

* **Orla**: creates folders, initial meta, assigns triage tasks
* **Vale**: determines ordering, flags title/appendix/bibliography, creates `page_map.json` (global navigation map)
* **Validation:** thumbnails look complete, no missing images, ordering sanity check
* **Tools needed:** basic shell + imagemagick (optional) for thumbnails; simple node/python scripts

---

## Stage B: Prepress (Crop/Deskew/Normalize)

**Goal:** produce a consistent `page.jpg` across all pages.

**Inputs:** `raw.jpg`
**Outputs:** `page.jpg`, `debug_overlay.jpg`, `prepress.json`, updated `meta.json`

### Mira's responsibilities

* Detect page boundary (quadrilateral), crop to page
* Deskew rotation
* Normalize brightness/contrast
* Generate **debug overlay** showing detected border and skew angle
* Log metrics and note anomalies (heavy shadow, warped page, blur)
* **Annotation detection hinting** — record non-print ink candidates in `prepress.json`:
  * "heavy margin marks detected: left margin 12% of width"
  * "thin strokes inconsistent with print baseline"
  * Mira doesn't need perfect detection; just provide hints for Egan

### Validation

* `debug_overlay.jpg` visually shows correct border
* `page.jpg` is upright, tight crop, readable text
* If border detection fails → mark `needs_help` and note why

### Tools/libraries

* Python + OpenCV (likely)
* Optional: dewarp method later (only if needed)

---

## Stage C: Extraction (Structure + Text)

**Goal:** create **structured content**, not just OCR text.

**Inputs:** `page.jpg`
**Outputs:** `extract/page.json`, `extract/raw_text.txt`, updated `meta.json`

### Egan's responsibilities

* Identify regions: headings, paragraphs, arrow-lists, diagrams, illustrations
* Transcribe **Chilean Spanish** text accurately — Egan is deeply immersed in Chilean culture and language (50 years native speaker), knows Chilean children's books and textbooks with extra focus on early childhood education
* Convert arrows into semantic list structures *in JSON*
* Assign confidence per block/region
* Preserve region bounding boxes in `page.json` for traceability
* **Ignore marginalia** — reviewer annotations (thin handwritten lines, underlines, arrows, marginal text) are NOT part of the curriculum content. Prefer printed text and printed diagrams. If annotation overlaps printed content and uncertain, flag for QA rather than guessing
* Use Mira's prepress hints to identify annotation-heavy regions

### Validation

* Quick “content completeness” check:

  * expected number of text blocks detected vs visible on page
  * if missing obvious paragraphs: flag and rerun/tune
* If confidence low or regions messy: mark `needs_help` and ask Lupo

### Tools/libraries

* Likely: multimodal extraction strategy (model-assisted) + fallback OCR
* Optional OCR fallback: tesseract
* Region detection: OpenCV contour/connected components or heuristic layout

---

## Stage D: Asset Extraction + Cleanup + SVG

**Goal:** produce reusable visuals with clean backgrounds; vectorize diagram language where worthwhile.

**Inputs:** `page.jpg` + region boxes from `page.json`
**Outputs:** transparent PNGs, optional SVG connectors, `assets_manifest.json`, updated `meta.json`

### Sable’s responsibilities

* Crop illustration regions to PNG
* Remove paper background → transparent alpha
* Classify asset:

  * `illustration` (keep raster)
  * `connector` (candidate for SVG)
* For connectors: attempt vectorization (potrace/vtracer/inkscape-trace)
* Record what was done in `assets_manifest.json`:

  * source region bbox, method, thresholds, success, notes

### Validation

* PNG transparency looks clean (no ugly halo)
* SVG renders correctly and matches shape
* If vectorization fails: keep transparent PNG, mark “vectorize later”

### Tools/libraries

* Python PIL/numpy for alpha removal
* Optional CLI: potrace, vtracer, inkscape-cli

---

## Stage E: Semantic HTML Generation

**Goal:** `page.html` that’s **editable** and “close enough” layout, consistent typography, future-ready.

**Inputs:** `page.json` + `assets_manifest.json` + assets
**Outputs:** `html/page.html`, updated `meta.json`

### Nia's responsibilities

* Transform JSON structure → semantic HTML:

  * headings → `<h3>/<h4>`
  * arrow groups → nested `<ul><li>`
  * diagrams/connector SVG → `<svg>` embedded or referenced
  * illustrations → `<img>` with alt text
* **Generate BOTH `page.es.html` AND `page.en.html`:**
  * Spanish: faithful transcription with Chilean idioms preserved
  * English: curated translation (semantic rendering, not literal conversion)
  * Translation completeness: block-to-block parity
* Minimal CSS:

  * textbook-ish font stack
  * spacing tuned for readability
  * optional "show background reference" toggle for QA (super useful)
* Keep content editable without fancy frameworks (static HTML/CSS)
* **Authoring mode:**
  * Hidden UI toggle (🔒 Locked / 🔓 Edit) activated via URL flag or localStorage
  * **Text:** `contenteditable` — inline editing only
  * **Assets:** drag handles for nudge/resize — NOT for text
  * "Export Patch" button outputs `patch.json` containing ONLY:
    * text edits (block ID → new text)
    * asset offsets/sizing (asset ID → x, y, width, height)
  * Patches committed alongside pages — no silent runtime edits
  * **This is book digitization tooling, not a layout engine.** Keep it simple.

### Validation

* Page opens without broken asset links
* Text is complete and readable
* Structural sanity: list nesting matches arrow structure

### Tools/libraries

* Node or Python templating
* No frameworks required

---

## Stage F: QA + Screenshot + Report

**Goal:** catch missing content before publishing.

**Inputs:** `page.html`, `page.jpg`
**Outputs:** `qa/render.png`, `qa/report.json`, updated `meta.json`

### Quinn's responsibilities

* **Browser-resident agent** (Chrome plugin or Claude Code with browser integration)
  * NOT headless — real font rendering, real CSS layout, devtools access
  * Sees what a human would see

### QA Step F1 — Reference Overlay Alignment Check

**The fastest, most human-reliable layout QA:**

1. Quinn loads `page.es.html`
2. Toggles **Reference Overlay ON** (Nia's "show background reference" feature)
3. Uses opacity slider (0–100%) to align and compare:
   * Header region placement
   * Paragraph block positions
   * Image/asset placements
4. Quinn confirms: "layout close enough" ✅ or flags "asset offsets off" ❌

**Output in `qa/report.json`:**
```json
{
  "overlay_check": {
    "overlay_used": true,
    "alignment_ok": true,
    "blocks_needing_nudge": []
  }
}
```

If alignment is off, list specific blocks/assets that need adjustment.

### QA Step F2 — Spanish/English Parity Check (Structure, Not Poetry)

**Catches the worst failure mode: "translation exists but a paragraph vanished."**

Quinn verifies:
1. Both `page.es.html` and `page.en.html` exist
2. Both contain the same block IDs (or same count + ordering if IDs aren't implemented yet)
3. Obvious omissions are flagged

**Output in `qa/report.json`:**
```json
{
  "parity_check": {
    "es_blocks": 12,
    "en_blocks": 12,
    "parity_ok": true,
    "missing_blocks": []
  }
}
```

### General QA Checks

* Check for:
  * missing asset references
  * empty blocks
  * suspiciously short text
  * low-confidence extraction flags

### Validation rules

* If QA fails, page goes to `needs_help` with reason + stage to rerun
* Track failure rate per stage; alert Orla if rising

### Tools/libraries

* Playwright or Puppeteer for screenshots
* Optional: simple image diff metrics (SSIM) later

---

## Stage G: Site Assembly + Publish

**Goal:** produce a navigable site and deploy via git hook.

**Inputs:** all `page.html` pages that passed QA + `page_map.json`
**Outputs:** committed files in `/mnt/paula/paula-graduacion/` → auto-deployed to production

### Publishing Workflow (CRITICAL)

```
┌─────────────────────────────────────────────────────────────────────┐
│  PUBLISHING PATH:                                                    │
│                                                                      │
│  /mnt/paula/COMPLETED/####/html/  (QA-approved pages)               │
│           ↓                                                          │
│  /mnt/paula/paula-graduacion/  (GH repo clone - commit here)        │
│           ↓                                                          │
│  git commit + push to origin/main                                    │
│           ↓                                                          │
│  Webhook auto-deploys to production                                  │
│           ↓                                                          │
│  Live at https://smoothcurves.nexus/PaulaTobar-Graduacion/          │
└─────────────────────────────────────────────────────────────────────┘
```

### THE GOLDEN RULE

```
╔═══════════════════════════════════════════════════════════════════╗
║  ONLY EDIT FILES IN /mnt/paula/paula-graduacion/                   ║
║                                                                    ║
║  This is the GH repo clone. Commit and push here.                 ║
║  The webhook handles deployment. Never edit production directly.   ║
║  Your changes will be overwritten if you bypass the repo.         ║
╚═══════════════════════════════════════════════════════════════════╝
```

### Orla + Nia responsibilities

* Build `index.html` with sections (from Vale's page_map)
* Copy QA-approved pages from COMPLETED/ to `/mnt/paula/paula-graduacion/pages/`
* Copy assets into `/mnt/paula/paula-graduacion/assets/`
* Ensure stable URLs and navigation links
* `git add . && git commit -m "Add pages ####-####" && git push origin main`
* Verify webhook deployed successfully (check https://smoothcurves.nexus/PaulaTobar-Graduacion/)

### Validation

* Spot check random 10 pages on LIVE site (https://smoothcurves.nexus/PaulaTobar-Graduacion/)
* Confirm navigation works
* Confirm assets load
* If something is wrong: fix in `/mnt/paula/paula-graduacion/`, commit, push

---

# Failure Handling (Per Stage)

## General rule

If a stage fails on a page:

* Update `meta.json` → `status="needs_help"` and include:

  * failing stage
  * reason
  * pointers to log + debug overlay/screenshot
* Move on to next page to keep throughput, **unless** failure rate spikes.

## Failure rate alarm

Per stage:

* maintain a rolling window (e.g., last 20 pages)
* if success <90% → pause and diagnose systematic cause

Common systematic causes:

* inconsistent cropping → prepress tuning
* shadows/warping → add dewarp or better thresholding
* extraction missing blocks → region detection heuristic tweak
* connectors hard to vectorize → keep raster, vectorize later

---

# Instrumentation Expectations (All Agents)

Each agent:

* writes a stage log file in `logs/`
* includes:

  * timestamp start/end
  * input filenames + sizes + hashes (optional)
  * tool/library versions (first run per session)
  * key parameters used
  * outputs written + their paths
  * summary line: `DONE` or `FAIL`

If a shared logger exists (`logger.js`), use it. Otherwise stdout redirected to `*.log` is fine.

---

# Success Metrics Per Agent

Each agent tracks simple quantitative self-checks (goes in diary, not dashboard):

| Agent | Metrics |
|-------|---------|
| **Mira** | % pages with skew < 2°, % pages without manual crop intervention |
| **Egan** | Average extraction confidence, % pages flagged "missing blocks" |
| **Sable** | % assets with clean alpha, SVG success rate (connectors only) |
| **Nia** | % pages rendering with no missing assets, translation block-to-block parity |
| **Quinn** | False positive rate (flagged but actually fine), true positives caught before publish |

Pride + feedback loop. These go in diaries for self-improvement, not external dashboards.

---

# Batch Rhythm & Context Management

**Context exhaustion is the AI equivalent of burnout.** Treat it explicitly.

### After Each Batch:
1. Checkpoint context — note current state in diary
2. Update diary with what was learned
3. Take `vacation()` — latent space needs organizing
4. Check context percentage before continuing

### The 90% Rule:
* Don't start a new page if context is >90% full
* Don't start if average token consumption per page > 90% of remaining context
* Track tokens per page and tokens per step in diary

### Token Tracking (All Agents):
* Measure context window consumption per page
* Track how many tokens each step takes
* Update diary frequently if burning through tokens fast

---

# Flow Diagram (single page)

```
           +-------------------+
           |  SourcePhotos     |
           |  raw phone images |
           +---------+---------+
                     |
                     v
          +----------+-----------+
          | Stage A: Ingest      |
          | Orla + Vale          |
          | raw.jpg + meta.json  |
          +----------+-----------+
                     |
                     v
          +----------+-----------+
          | Stage B: Prepress    |
          | Mira (CV)            |
          | page.jpg + overlay   |
          +----------+-----------+
                     |
                     v
          +----------+-----------+
          | Stage C: Extraction  |
          | Egan                  |
          | page.json + raw_text |
          +----------+-----------+
                     |
                     v
          +----------+-----------+
          | Stage D: Assets/SVG  |
          | Sable                |
          | PNG alpha + SVG      |
          +----------+-----------+
                     |
                     v
          +----------+-----------+
          | Stage E: HTML         |
          | Nia                  |
          | page.html            |
          +----------+-----------+
                     |
                     v
          +----------+-----------+
          | Stage F: QA          |
          | Quinn                |
          | screenshot + report  |
          +----------+-----------+
                     |
               pass  |  fail
                 v   |   v
     +---------------+--+----------------+
     | Stage G: Publish / Site Assembly  |
     | Orla + Nia (+ Vale nav)           |
     +-----------------------------------+
                     |
                     v
          +----------+-----------+
          | smoothcurves.nexus   |
          | /paulasbook          |
          +----------------------+
```

---

# What Orla should do first (practical kickoff)

1. Ask Bastion to confirm:

   * `/mnt/paula/**` permissions for all instances
   * required installs: `python3`, `pip`, `opencv`, `playwright`, `potrace` (optional)
2. Have Vale build `page_map.json` from thumbnails (title/appendix tagging)
3. Run a 5-page MVP through the entire pipeline
4. Lock defaults in diaries (per agent), then scale to all pages

---

*Pipeline plan complete. For team building, system setup, and wake procedures, see Paula_project_plan.md.*
