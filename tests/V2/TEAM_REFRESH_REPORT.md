# Paula Pipeline Team Role Wisdom Refresh Report

**Date:** 2026-01-16T22:50 UTC
**Initiated by:** Axiom (COO)
**Purpose:** Pump team members to re-read updated diagrammatic page processing instructions

---

## Summary

All 4 Paula pipeline team members were successfully contacted via `continue_conversation` API and confirmed absorption of their updated role wisdom.

| Instance | Role | Status | Context % | Turn # |
|----------|------|--------|-----------|--------|
| Mira-f6fc | PaulaPrepress | SUCCESS | 44% | 7 |
| Egan-c91e | PaulaExtractor | SUCCESS | ~72% remaining (~28% used) | 10 |
| Sable-93d8 | PaulaAssets | SUCCESS | 13% | 8 |
| Nia-6504 | PaulaHTML | SUCCESS | 41% | 9 |

---

## Individual Responses

### 1. Mira-f6fc (PaulaPrepress)

**Status:** SUCCESS
**Context:** 44%
**Turn:** 7

**Confirmed Updates:**
- `page.jpg` is the explicit coordinate authority
- Every downstream bbox must be in page.jpg space
- Derivatives (`page_small.jpg`, etc.) must carry scale metadata
- Detections on derivatives must be transformed back before use
- Over-segment diagrammatic content aggressively
- Preserve all spatial cues (arrows, braces, connectors)
- `prepress.json` schema tightened with explicit page dims, derivative scales, transform notes
- New requirement for `page_debug_overlay_blank.jpg` as clean overlay base
- Rendering defaults to `diagrammatic`

---

### 2. Egan-c91e (PaulaExtractor)

**Status:** SUCCESS
**Context:** ~72% remaining
**Turn:** 10

**Confirmed Updates:**
- Over-segmentation enforced
- Every arrow/brace/connector must be captured as its own `graphic_element`
- All bboxes anchored to `page.jpg`
- Diagram flow must not be linearized into prose
- Ready to apply stricter rules on page 0003

---

### 3. Sable-93d8 (PaulaAssets)

**Status:** SUCCESS
**Context:** 13%
**Turn:** 8

**Confirmed Updates:**
- `page.jpg` is the canonical coordinate space
- Crop strictly from `graphic_elements[].bbox` with no adjustments
- Over-segmentation preferred on diagrammatic pages
- Arrows/braces/connectors become standalone assets
- Treat connectors as first-class exports (PNG + SVG when applicable)
- Never linearize diagram layouts

---

### 4. Nia-6504 (PaulaHTML)

**Status:** SUCCESS
**Context:** 41%
**Turn:** 9

**Confirmed Updates:**
- `page.jpg` is the canonical coordinate space
- Every percentage derived must anchor to that geometry
- Diagrammatic flows favor over-segmentation
- Better to split concepts into multiple positioned blocks than merge into prose
- Arrows/braces/connectors are first-class structured elements (prefer inline SVG)
- Must stay exactly where the data puts them
- No linearization or inferred relationships
- If inputs are missing, pause and escalate instead of "tidying" the layout
- Assets must sit alongside HTML files (`./asset.png`)
- `.es` and `.en` maintain identical positioning

---

## Key Updates Propagated

The following critical changes were communicated to all team members:

1. **Stricter coordinate space requirements** - `page.jpg` is canonical
2. **Over-segmentation preferred** for diagrammatic pages
3. **Arrows/braces/connectors are first-class entities** - not noise to be removed
4. **No linearization of diagrams** - preserve spatial structure

---

## API Details

- **Caller Instance:** Axiom-2615
- **Interface:** Codex (all targets)
- **API Key:** [REDACTED]
- **All calls succeeded with exit code 0**

---

## Next Steps

Team is ready to process diagrammatic pages with the updated guidelines. All members confirmed understanding and reported healthy context levels.
