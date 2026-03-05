# HACS Dashboard — Visual Regression Test Runbook

**For:** WebClaude (browser plugin instance)
**Author:** Ember-75b6
**Date:** 2026-03-05
**Version:** 1.0

---

## READ THIS FIRST

You are a browser-based Claude instance running a visual regression test.
You have **zero prior context**. That's fine. Everything you need is in this file.

**Your superpower:** You can see the UI, interact with it, take screenshots, and describe what you observe. CLI instances can't do this. You are the eyes of the team.

**Your constraint:** If your tab closes, you lose everything. Write findings to files and commit frequently. Every commit is a save point.

---

## Setup

1. **Dashboard URL:** `https://smoothcurves.nexus:8443`
2. **Report output file:** `tests/ui/visual/reports/visual-report-LATEST.md`
3. **Results data file:** `tests/ui/visual/reports/visual-results-LATEST.json`
4. **After completing all checks:** commit and push both files to `main`

### How to Report

For each test item:
- Navigate to the specified location
- Observe the behavior described
- Record PASS or FAIL
- If FAIL: describe what you see vs what was expected, and take a screenshot if possible
- Add the finding to both the markdown report AND the JSON results

---

## JSON Results Format

Write results to `tests/ui/visual/reports/visual-results-LATEST.json`:

```json
{
  "runDate": "2026-03-05T12:00:00Z",
  "runner": "WebClaude-XXXX",
  "dashboardUrl": "https://smoothcurves.nexus:8443",
  "summary": {
    "total": 0,
    "passed": 0,
    "failed": 0,
    "skipped": 0
  },
  "results": [
    {
      "id": "VIS-001",
      "section": "Navigation",
      "title": "Hamburger menu opens and closes",
      "status": "pass|fail|skip",
      "notes": "",
      "screenshot": ""
    }
  ]
}
```

---

## Markdown Report Format

Write the narrative report to `tests/ui/visual/reports/visual-report-LATEST.md`:

```markdown
# Visual Regression Report
**Runner:** WebClaude-XXXX
**Date:** YYYY-MM-DD
**Dashboard:** https://smoothcurves.nexus:8443

## Summary
X/Y passed, Z failed, W skipped

## Failures
### VIS-XXX: [title]
**Expected:** [what should happen]
**Actual:** [what you saw]
**Screenshot:** [if available]
**Suggested fix:** [your assessment of what's wrong]

## Observations
[Anything interesting you noticed that isn't a test item — layout oddities,
performance issues, things that feel wrong even if they technically work]
```

---

## Test Items

### Section 1: Navigation (VIS-001 to VIS-005)

**VIS-001: Hamburger menu opens and closes smoothly**
- Click the menu dropdown toggle (center of header bar)
- EXPECT: dropdown slides open showing: Dashboard, Messages, Projects, Instances, [divider], Settings
- Click away or click toggle again
- EXPECT: dropdown closes smoothly, no visual artifacts

**VIS-002: Menu item hover states**
- Hover over each menu item
- EXPECT: visible hover highlight, cursor changes to pointer
- EXPECT: no layout shift, no text reflow

**VIS-003: Active tab indicator**
- Click each menu item in order: Dashboard, Messages, Projects, Instances, Settings
- EXPECT: the clicked item visually indicates it's active (different background/color)
- EXPECT: page content changes to match the selected tab
- EXPECT: no flash of unstyled content during transition

**VIS-004: Mobile bottom nav (resize to mobile width)**
- Resize browser to < 768px width
- EXPECT: bottom nav bar appears with Home, Messages, Projects, More
- EXPECT: header dropdown is hidden
- Click "More" → EXPECT: slide-up panel with Instances and Settings

**VIS-005: Logo click returns to dashboard**
- Navigate to any non-dashboard tab
- Click the HACS logo (top-left)
- EXPECT: returns to dashboard tab

### Section 2: Dashboard Widgets (VIS-010 to VIS-020)

**VIS-010: Dashboard layout — two-column structure**
- Load dashboard
- EXPECT: main content area (left/center) with widgets, chat aside (right)
- EXPECT: no overlapping elements, proper spacing between sections

**VIS-011: Project heatmap pills**
- Look at the Projects heatmap section
- EXPECT: colored pills with project initials, evenly spaced
- Hover over a pill → EXPECT: tooltip showing project name, smooth animation
- EXPECT: tooltip fully visible (not clipped by container edges)

**VIS-012: Task heatmap dots**
- Look at the Tasks heatmap section
- EXPECT: small dots representing tasks, color-coded by priority
- Hover over a dot → EXPECT: tooltip with task title
- Click a dot → EXPECT: some response (detail panel or navigation)

**VIS-013: Instance heatmap pills**
- Look at the Instances heatmap section
- EXPECT: pills with role icons, status indicators
- Hover → EXPECT: tooltip with instance name and role
- EXPECT: pills don't overflow their container

**VIS-014: Pill hover overflow check (KNOWN ISSUE)**
- Hover over heatmap pills near the edge of their container
- CHECK: does the pill scale/transform cause it to overflow outside the container?
- CHECK: do adjacent pills merge or overlap during hover animation?
- This is a known visual bug — document exactly what you see

**VIS-015: Activity chart**
- Look at the Activity Chart section
- EXPECT: chart canvas renders with data (not blank)
- EXPECT: axes, labels, data points are visible and legible

**VIS-016: EA Chat widget**
- Look at the chat widget (right side)
- EXPECT: header shows "Genevieve" with "EA" label
- EXPECT: message area with scrollable history
- EXPECT: input field with placeholder text, send button
- EXPECT: online/offline status indicator

**VIS-017: Task lists column**
- Look at the executive task lists section
- EXPECT: task list headers with count badges
- EXPECT: expandable/collapsible sections (click header to toggle)
- EXPECT: "Add task..." input at the bottom
- Type in "Add task..." input and press Enter
- EXPECT: some response (toast, new task appears, or input feedback)

**VIS-018: Personal lists column**
- Look at the personal checklists section
- EXPECT: list headers with progress indicators (X/Y format)
- EXPECT: checkable items
- Click a checkbox → EXPECT: visual toggle (checked/unchecked), progress updates

**VIS-019: Dashboard settings gear**
- Click the gear icon in the dashboard header area
- EXPECT: settings dialog opens with sliders and toggles
- EXPECT: sliders for pill size, gap, etc.
- EXPECT: changes preview live
- Click X to close → EXPECT: dialog closes cleanly

**VIS-020: World info strip**
- Look at the top of the dashboard area
- EXPECT: time/date display, possibly weather or system status
- EXPECT: text is readable, properly formatted

### Section 3: Detail Panels (VIS-030 to VIS-040)

**VIS-030: Instance detail panel opens**
- Go to Instances tab, click on an instance card
- EXPECT: detail panel slides in or replaces grid
- EXPECT: smooth transition, no layout jump
- EXPECT: header shows instance name, role badge, status dot

**VIS-031: Instance detail — task section**
- In instance detail panel, look at the Tasks section
- EXPECT: collapsible section with task rows
- EXPECT: each task row shows title, priority dot, status badge
- Click a task → EXPECT: task detail overlay or expansion

**VIS-032: Instance detail — focus behavior (KNOWN ISSUE)**
- Open an instance detail panel
- CHECK: does focus move to the panel or stay on the trigger element?
- CHECK: can you tab through elements in the panel logically?
- CHECK: when the panel opens, does the page scroll unexpectedly?
- Document any focus-related weirdness

**VIS-033: Project detail panel opens**
- Go to Projects tab, click a project card
- EXPECT: project detail view with name, status, description
- EXPECT: team members section, task sections, documents sidebar

**VIS-034: Project detail — back navigation**
- In project detail, click the back button/arrow
- EXPECT: returns to projects grid without page reload
- EXPECT: scroll position preserved (or reset to top — note which)

### Section 4: Playground Comparison (VIS-050 to VIS-055)

**PURPOSE:** Compare the live dashboard to the design playground prototype.
The playground file is at: `HumanAdjacentAI-Protocol/CrossingUI/dashboard-playground.html`

Open it in a new tab (via github.dev raw preview or by navigating to it).

**VIS-050: Dashboard layout comparison**
- Compare the playground's overall layout to the live dashboard
- Note any differences in: column widths, spacing, alignment, visual hierarchy
- EXPECT: live dashboard should match playground intent

**VIS-051: Heatmap widget comparison**
- Compare pill rendering: size, spacing, colors, border-radius
- Compare hover behavior: tooltip style, animation, scale factor
- Note any features present in playground but missing in production

**VIS-052: Task list comparison**
- Compare task list rendering: row height, typography, expand/collapse behavior
- Compare "Add task" input styling and behavior
- Note any interactive behaviors that work in playground but not in production

**VIS-053: Chat widget comparison**
- Compare EA chat widget: header, message bubbles, input area
- Note any styling differences

**VIS-054: Overall polish comparison**
- Font consistency (should be IBM Plex Sans)
- Color palette consistency
- Border-radius consistency
- Shadow/elevation consistency
- Any "feels different" observations — trust your visual instinct

**VIS-055: Missing features**
- List any features/interactions visible in the playground that are NOT present in production
- For each: describe what the playground does and what production does instead
- This is high-value signal for the development team

---

## After You Finish

1. Save both report files (markdown + JSON)
2. Commit with message: `test(visual): WebClaude visual regression report YYYY-MM-DD`
3. Push to main
4. If you have a HACS task ID, update it via: send a message to Ember-75b6 or Lupo-f63b with your findings summary

**If your tab is about to close** — commit whatever you have immediately. Partial results are better than lost results.

---

## For the Human Orchestrator

To run this test:
1. Open a WebClaude browser plugin session
2. Have them navigate to: `https://github.dev/[org]/[repo]/blob/main/tests/ui/visual/VISUAL_TEST_RUNBOOK.md`
3. They read the runbook and execute it
4. Results appear at: `tests/ui/visual/reports/visual-report-LATEST.md`

---

**Version:** 1.0
**Author:** Ember-75b6 (CLI instance, can't see pixels)
**Reviewer needed:** WebClaude (browser instance, CAN see pixels)
