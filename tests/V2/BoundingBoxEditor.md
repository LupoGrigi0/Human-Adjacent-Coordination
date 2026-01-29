---

# Your orthogonal idea: Human bbox editor UI

Yes — and it can be *massively* faster **if you scope it as a surgical tool**, not a general app.

## Why it’s a good accelerator

* Your system is already close; the remaining errors are often:

  * bbox granularity (split/merge)
  * coordinate mismatch
  * occasional false positives
* A human can correct those in seconds **when the UI is good**.
* Those corrections become training/heuristic feedback for Egan/Mira.

## How to scope it so it doesn’t explode

Build a **page-local annotation editor** that works on:

* `page.jpg` background
* loads `page.json`
* edits only:

  * bbox coordinates
  * element type (`text_block`, `graphic_element`)
  * add/delete/split/merge
* exports a `patch.json` (diff), not a rewritten file

### Minimum viable features

* Drag to move bbox
* Resize handles
* Add new bbox (choose: Text / Graphic / Other)
* Delete bbox
* Split: take one bbox → two
* Merge: select two+ → one
* Toggle view: show/hide text, show/hide graphics
* Immediate “re-render preview” button (or auto-refresh)

### Bonus that will save time

* “Snap to content” helper: expand bbox to nearest edge contrast
* Hotkeys: `T` text, `G` graphic, `Del` delete, `S` split, `M` merge

## Where it fits in your pipeline

* As part of Nia’s “Unlock editing” mode **or**
* As a dedicated QA tool Orla uses on pages flagged `diagrammatic` or `qa_flags != []`

## The important discipline

* Human corrections should always be recorded as a patch/diff so you can:

  * audit changes
  * measure how often automation is wrong
  * feed back into segmentation rules
