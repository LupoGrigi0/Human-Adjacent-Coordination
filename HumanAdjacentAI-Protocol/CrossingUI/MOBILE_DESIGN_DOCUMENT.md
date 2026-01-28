# HACS Mobile UI Design Document

**Author:** Ember-75b6
**Date:** 2026-01-28
**Status:** Design Phase
**Methodology:** Persona-Based Design + Wieden+Kennedy "Throw Away 5"

---

## Part 1: Current UI Aesthetic Audit

### Typography Assessment

| Element | Current | Assessment |
|---------|---------|------------|
| Body font | `-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif` | **GENERIC** - System fonts are the AI slop the frontend-design skill warns against |
| Monospace | `'SF Mono', 'Fira Code'` | Good - distinctive choices |
| Size scale | 0.625rem - 1.75rem | Standard, could be bolder |
| Weights | 400, 500, 600, 700 | Standard |

**Verdict:** Typography needs character. The current setup is functional but forgettable.

### Color Palette Assessment

| Light Mode | Dark Mode | Assessment |
|------------|-----------|------------|
| Primary: #2563eb (Blue) | Primary: #3b82f6 | Safe but generic Tailwind blue |
| Background: #f8fafc | Background: #0f172a | Standard slate palette |
| Surface: #ffffff | Surface: #1e293b | Clean but unremarkable |
| Accent colors | Same semantic | No surprise or delight |

**Verdict:** Colors are competent but the "corporate dashboard blue" is exactly the AI slop aesthetic. No personality.

### Layout & Components Assessment

| Component | Current State | Mobile-Ready? |
|-----------|---------------|---------------|
| Header | Fixed 56px, logo + controls | Partial - needs hamburger |
| Sidebar | 64px collapsed, icons only | **BROKEN** - no toggle button |
| Cards | Standard border-radius, shadow | OK |
| Task board | 3-column grid | **BROKEN** - doesn't stack |
| Chat panels | 320px fixed sidebar | **BROKEN** - needs collapsible |
| Modals | Centered, fixed width | Partial - some responsive |

### Existing Mobile CSS (lines 3400-3540)

**What exists:**
- Touch targets: 44px minimum ✅
- Scrollable containers ✅
- Basic breakpoints (480px, 639px, 768px, 900px) ✅
- Sidebar transform class (`.mobile-open`) ✅

**What's missing:**
- No hamburger menu button (sidebar can't be toggled!)
- No bottom navigation alternative
- Task board doesn't adapt
- Chat sidebars don't collapse properly
- No gesture support
- No mobile-specific animations

---

## Part 2: Persona Analysis for Mobile

### Persona 1: Lupo (The Maker)
- **Access:** Phone while away from desk, checking on AI instances
- **Goals:** Quick status check, respond to urgent messages, approve/reject
- **Frustrations:** Can't navigate (no hamburger!), chat panels awkward
- **Critical flows:** Dashboard → Messages → Quick response

### Persona 2: AI Instance (via web UI)
- **Access:** Sometimes views own state in browser on tablet
- **Goals:** Understand current context, check tasks, send messages
- **Frustrations:** Dense information, hard to scan on smaller screens
- **Critical flows:** Dashboard → My Tasks → Diary

### Mobile Priority Flows (must work perfectly)
1. **Check status** - Dashboard with metrics
2. **Read messages** - Messages tab, conversation view
3. **Respond to message** - Input area, send
4. **View project** - Project detail with team/tasks
5. **Check/update tasks** - Task board or list view

---

## Part 3: Navigation Concepts (Throw Away 5)

Per the Wieden+Kennedy methodology, generating 5 navigation concepts to discard:

### Concept 1: Classic Hamburger (DISCARD)
- Hamburger icon top-left
- Slides in left sidebar
- **Why discard:** Most generic solution, requires two taps to navigate, breaks thumb-zone ergonomics

### Concept 2: Bottom Tab Bar (DISCARD)
- Fixed bottom bar with 5-6 icons
- iOS/Android native feel
- **Why discard:** Limits to 5 items, our app has 7 nav items (Messages, Dashboard, Projects, Tasks, Lists, Instances, Settings)

### Concept 3: Floating Action Button (DISCARD)
- FAB bottom-right
- Expands to radial menu
- **Why discard:** Better for actions than navigation, unfamiliar for tab switching

### Concept 4: Swipe Navigation (DISCARD)
- Swipe left/right between tabs
- Small dots indicator at top
- **Why discard:** Hidden affordance, conflicts with content scrolling, no visual hierarchy

### Concept 5: Top Tab Scroller (DISCARD)
- Horizontally scrolling tabs at top
- Under header
- **Why discard:** Obscures which tabs exist, easy to miss important ones

---

## Part 4: Final Navigation Design (The 3 Survivors)

After discarding the obvious, here are breakthrough concepts:

### Design A: Hybrid Bottom Nav + Overflow (RECOMMENDED)
```
┌─────────────────────────────────┐
│ [HACS v2]            [●] [🌙]  │  <- Header (compact)
├─────────────────────────────────┤
│                                 │
│         Main Content            │
│                                 │
│                                 │
├─────────────────────────────────┤
│ [✉] [⬛] [📁] [✓] [≡]          │  <- Bottom nav (5 items)
│ Msg  Dash Proj Task More       │
└─────────────────────────────────┘
```

**"More" menu reveals:** Lists, Instances, Settings

**Why this works:**
- Thumb-friendly bottom navigation
- Most-used items always visible
- Overflow menu for less-frequent items
- Standard pattern users understand
- Only 5 visible items (cognitive load optimized)

### Design B: Contextual Header Nav
```
┌─────────────────────────────────┐
│ [☰] HACS v2      [search] [🌙] │
├─────────────────────────────────┤
│ [Messages] [Dash] [Projects ▼] │  <- Scrollable chips
├─────────────────────────────────┤
│                                 │
│         Main Content            │
│                                 │
└─────────────────────────────────┘
```

**Hamburger for full nav, chips for quick switch**

### Design C: Gesture + Minimal UI
```
┌─────────────────────────────────┐
│ [≡]                    [●] [🌙]│
├─────────────────────────────────┤
│                                 │
│     Content (swipe to nav)      │
│                                 │
│     [←] Tab indicator [→]       │
│                                 │
└─────────────────────────────────┘
```

**Minimal UI, gesture-forward (advanced users)**

---

## Part 5: Typography Recommendations

Instead of generic system fonts, adopt a distinctive yet readable combination:

### Option A: Technical/Utilitarian (RECOMMENDED for HACS)
- **Display/Headers:** `'JetBrains Mono'` or `'IBM Plex Mono'` - signals technical nature
- **Body:** `'IBM Plex Sans'` - clean, technical, distinctive
- **Rationale:** HACS is a coordination system for AI instances. Technical monospace headers reinforce the nature of the tool.

### Option B: Modern Humanist
- **Display:** `'Manrope'` - geometric but warm
- **Body:** `'Manrope'` at lighter weights
- **Rationale:** More approachable, less intimidating

### Option C: Editorial
- **Display:** `'Fraunces'` (variable) - distinctive serifs
- **Body:** `'Work Sans'` - neutral complement
- **Rationale:** Stands out dramatically, might be too much

**Font Loading Strategy:**
```css
/* Preload critical fonts */
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@500;600&family=IBM+Plex+Sans:wght@400;500;600&display=swap" rel="stylesheet">
```

---

## Part 6: Color Refinement

The current blue is safe. Options to add character:

### Option A: Keep Blue, Add Accent
- Keep primary blue (#2563eb)
- Add vibrant accent: Electric cyan `#06b6d4` or coral `#f43f5e`
- Use accent for: badges, active states, call-to-action

### Option B: Shift to Teal/Cyan
- Primary: `#0891b2` (Teal-500)
- Dark: `#0e7490`
- Light: `#22d3ee`
- **Rationale:** Differentiates from generic "business blue"

### Option C: Monochromatic with Color Accents
- Primary UI: Grayscale
- Status colors only for meaning
- Single accent for primary actions
- **Rationale:** Maximum clarity, colors only communicate state

---

## Part 7: Implementation Plan (Agent-Ready Tasks)

### Phase 1: Navigation Foundation (Critical - Enables Mobile Use)

#### Task 1.1: Add Mobile Header Toggle
**Files:** `index.html`, `styles.css`, `app.js`
**Scope:**
- Add hamburger button to header (visible on mobile)
- Wire click handler to toggle `.mobile-open` on sidebar
- Add overlay backdrop when sidebar open

```html
<!-- Add to header, before logo -->
<button class="mobile-menu-toggle" id="mobile-menu-toggle" aria-label="Toggle menu">
    <span class="hamburger-line"></span>
    <span class="hamburger-line"></span>
    <span class="hamburger-line"></span>
</button>
```

**Agent Instructions:** Read header section of index.html, add hamburger button, add CSS for hamburger icon animation, add JS click handler in app.js navigation section.

#### Task 1.2: Add Bottom Navigation (Design A)
**Files:** `index.html`, `styles.css`
**Scope:**
- Add bottom nav element with 5 items
- CSS for fixed positioning, safe area padding
- Hide on desktop (> 768px)
- Wire to existing tab system

```html
<!-- Add before closing </body> -->
<nav class="bottom-nav" id="bottom-nav">
    <button class="bottom-nav-item" data-tab="messages">
        <span class="bottom-nav-icon">✉</span>
        <span class="bottom-nav-label">Messages</span>
    </button>
    <!-- ... 4 more items ... -->
</nav>
```

**Agent Instructions:** Add bottom nav HTML, create CSS for bottom-nav positioning, add media query to show only on mobile, connect to existing tab switching logic.

#### Task 1.3: Create "More" Menu Modal
**Files:** `index.html`, `styles.css`, `app.js`
**Scope:**
- Modal/sheet that slides up from bottom
- Contains: Lists, Instances, Settings
- Triggered by "More" button in bottom nav

**Agent Instructions:** Create action sheet modal component, add CSS for slide-up animation, wire to More button click.

### Phase 2: Task Board Mobile Adaptation

#### Task 2.1: Task Board Responsive Layout
**Files:** `styles.css`
**Scope:**
- On mobile: Convert 3-column grid to single column
- Add horizontal scroll tabs for Pending/Progress/Complete
- Or: Stack vertically with collapsible sections

**Agent Instructions:** Add media query for task-board at 768px breakpoint, implement either tab-based or accordion-based mobile layout.

#### Task 2.2: Task Card Touch Optimization
**Files:** `styles.css`
**Scope:**
- Larger tap areas
- Swipe actions (mark complete, claim)
- Visual feedback on touch

**Agent Instructions:** Increase task-item min-height, add touch-action CSS, consider adding swipe gesture support.

### Phase 3: Chat/Panel Responsiveness

#### Task 3.1: Project Chat Sidebar Collapse
**Files:** `styles.css`, `projects.js`
**Scope:**
- On mobile: Chat sidebar becomes collapsible drawer
- Toggle button visible
- Full-height when open, overlays content

**Agent Instructions:** Add collapsible behavior to project-chat-sidebar, create toggle button, add CSS for overlay mode.

#### Task 3.2: Messages Panel Mobile Flow
**Files:** `styles.css`, `messages.js`
**Scope:**
- Mobile: Conversation list is full-screen
- Selecting conversation navigates to chat (hides list)
- Back button returns to list

**Agent Instructions:** Implement navigation pattern for messaging-layout on mobile, add back button to chat-header on mobile.

### Phase 4: Typography & Color Update

#### Task 4.1: Import New Fonts
**Files:** `index.html`, `styles.css`
**Scope:**
- Add Google Fonts link for IBM Plex
- Update CSS variables for font-family
- Verify fallbacks

**Agent Instructions:** Add font link to head, update --font-sans variable, test rendering.

#### Task 4.2: Color Accent Addition
**Files:** `styles.css`
**Scope:**
- Add --accent-color CSS variable
- Apply to badges, active states
- Test in both light and dark mode

**Agent Instructions:** Add accent color variable, update relevant selectors, ensure dark mode compatibility.

### Phase 5: Polish & Micro-interactions

#### Task 5.1: Navigation Transitions
**Files:** `styles.css`
**Scope:**
- Smooth tab transitions
- Bottom nav active indicator animation
- Sidebar slide animation refinement

#### Task 5.2: Touch Feedback
**Files:** `styles.css`
**Scope:**
- Ripple or highlight effect on tap
- Button press states
- Card selection feedback

#### Task 5.3: Loading States
**Files:** `styles.css`, various JS
**Scope:**
- Skeleton screens instead of "Loading..."
- Pulse animation for loading placeholders
- Spinner refinements

---

## Part 8: Implementation Priority Order

```
CRITICAL (Mobile Currently Broken)
├── 1.1 Add Mobile Header Toggle     <- Users literally cannot navigate
├── 1.2 Add Bottom Navigation        <- Primary mobile nav pattern
└── 1.3 Create More Menu             <- Complete nav solution

HIGH (Core Experience)
├── 2.1 Task Board Responsive
├── 3.1 Project Chat Collapse
└── 3.2 Messages Panel Flow

MEDIUM (Quality)
├── 4.1 Import New Fonts
├── 4.2 Color Accent Addition
└── 2.2 Task Card Touch

NICE TO HAVE (Polish)
├── 5.1 Navigation Transitions
├── 5.2 Touch Feedback
└── 5.3 Loading States
```

---

## Part 9: Agent Delegation Instructions

Each task above can be given to a sub-agent with:
1. The task description
2. File paths to read first
3. Specific CSS/HTML/JS to add
4. Commit message format

**Example agent prompt for Task 1.1:**
```
Read /mnt/coordinaton_mcp_data/worktrees/foundation/src/ui/index.html (header section)
Read /mnt/coordinaton_mcp_data/worktrees/foundation/src/ui/styles.css (lines 90-210 header styles)
Read /mnt/coordinaton_mcp_data/worktrees/foundation/src/ui/app.js (navigation handling)

Task: Add a hamburger menu button to the header that toggles the sidebar on mobile.

Requirements:
1. Add hamburger button HTML before the logo in .header-content
2. Add CSS for the hamburger icon (3 lines, animated to X when open)
3. Add CSS to show button only on mobile (<768px)
4. Add JS click handler that toggles .mobile-open class on .sidebar
5. Add overlay backdrop element that closes sidebar when clicked

Commit message: "feat(ui): Add mobile hamburger menu toggle"
```

---

## Part 10: Success Criteria

After implementation, mobile UI should:

1. **Navigation works** - User can access all 7 tabs on mobile
2. **Content readable** - No horizontal scroll, text legible
3. **Touch-friendly** - All interactive elements ≥44px
4. **Chat usable** - Can read and send messages on phone
5. **Tasks viewable** - Task board adapts to single column
6. **Fast** - No heavy animations that lag on mobile
7. **Distinctive** - Typography and color differentiate from generic dashboards

---

## Appendix: Quick Reference

### Breakpoints
- Mobile: ≤639px
- Tablet: 640px - 1023px
- Desktop: ≥1024px

### Touch Targets
- Minimum: 44x44px
- Recommended: 48x48px for primary actions

### Z-Index Scale
- Header: 100
- Sidebar: 90
- Bottom nav: 100
- Modals: 200
- Overlays: 150

### Fonts (After Update)
- Headers: `'IBM Plex Mono', monospace`
- Body: `'IBM Plex Sans', sans-serif`
- Code: `'IBM Plex Mono', monospace`

---

*Document ready for implementation. Start with Phase 1 tasks.*
