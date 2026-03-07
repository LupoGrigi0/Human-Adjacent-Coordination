# Mobile UI Project Plan

**Author:** Ember-75b6
**Created:** 2026-01-28
**Updated:** 2026-01-28
**Status:** Phase 2 Complete

## Overview

Make the HACS UI usable on mobile devices. This is the #1 priority per Lupo, ahead of bug fixes.

## Context

The UI modular refactor is complete:
- app.js: 4349 → 2291 lines (47% reduction)
- 12 modules handle features
- This modular structure makes mobile easier - each module can handle its own responsive styles

## Priority Order

1. **Mobile UI pass** - THIS PROJECT
2. Bug fixes - after mobile
3. Documents tab - after bugs

## Progress

### Phase 1: Foundation - COMPLETE (Previous Session)
- [x] Add CSS media query foundation
- [x] Define breakpoints (mobile: <768px, tablet: 768-1024px, desktop: >1024px)
- [x] Add CSS variables for responsive values
- [x] Fix scrollable containers (helps both mobile AND desktop)
  - [x] Project task list scrollable
  - [x] Team member list scrollable (if > 5)

**Commit:** b5689a8 feat(ui): Add mobile CSS foundation and scrollable containers

### Phase 2: Navigation - COMPLETE (This Session)
- [x] Hamburger menu for mobile (top-left, animates to X)
- [x] Bottom nav bar (Home, Messages, Projects, Tasks, More)
- [x] "More" slide-up menu (Lists, Instances, Settings)
- [x] Collapsible sidebar with overlay backdrop
- [x] Touch-friendly menu items (44x44px minimum)
- [x] Safe area support for iPhone notches

**Commits:**
- 811b531 feat(ui): Add mobile hamburger menu with sidebar toggle
- 30adfaf feat(ui): Add mobile bottom navigation with more menu

### Typography & Branding - COMPLETE (This Session)
- [x] IBM Plex Sans for body text
- [x] IBM Plex Mono for headers/metrics/logo
- [x] Cyan accent color (#06b6d4) for badges/highlights
- [x] Dark mode accent variants

**Commit:** 6638891 feat(ui): Update typography to IBM Plex with accent colors

### Phase 3: Panels - TODO
- [ ] Projects grid → stacked cards on mobile
- [ ] Instances grid → stacked cards on mobile
- [ ] Detail panels → full-screen on mobile
- [ ] Chat sidebars → collapsible or separate view
- [ ] Messages panel back-button flow

### Phase 4: Components - TODO
- [ ] Task board responsive (currently 3-column, needs work)
- [ ] Task cards - mobile-friendly
- [ ] List items - touch-friendly
- [ ] Forms/modals - full-width on mobile
- [ ] Buttons - larger tap targets

## Key Files

```
src/ui/styles.css       # Main styles - media queries here
src/ui/app.js          # Navigation toggle logic
src/ui/projects.js     # Project grid responsive
src/ui/instances.js    # Instance grid responsive
src/ui/tasks.js        # Task board responsive
src/ui/lists.js        # Lists responsive
src/ui/messages.js     # Message badge sync
```

## Design Documents

- `MOBILE_DESIGN_DOCUMENT.md` - Full audit, persona analysis, navigation concepts, implementation plan

## UI Tasks from HACS (Related)

| TaskId | Title | Priority | Status |
|--------|-------|----------|--------|
| mkyf7poi5144 | Project task list scrollable | HIGH | DONE |
| mkyf5l5y44d4 | Team member list scrollable if > 5 | MEDIUM | DONE |
| mkyfcli6fa60 | REDESIGN Task Panel | HIGH (big) | TODO |
| mkyfh6ni3503 | REDESIGN Lists Panel | MEDIUM (big) | TODO |

## Resources

- **frontend-design skill** - Use for quality/polish
- **Open source OK** - Can use widgets/libraries for flair
- **CSS frameworks** - Consider utility classes if helpful

## Design Principles

1. **Mobile-first thinking** - Design for small screens, enhance for large
2. **Touch-friendly** - 44x44px minimum tap targets
3. **Readable** - Appropriate font sizes (IBM Plex!)
4. **Fast** - No heavy animations on mobile
5. **Usable** - Core functionality must work on phone
6. **Distinctive** - No AI slop aesthetics

## Testing

- Chrome DevTools device mode
- Real device testing (Lupo verifies on Android)
- iPhone testing for demo purposes
- Test all tabs: Dashboard, Projects, Tasks, Lists, Instances, Messages, Settings

## Recovery Instructions

After compaction, read:
1. This file: `CrossingUI/MOBILE_UI_PROJECT_PLAN.md`
2. Design doc: `CrossingUI/MOBILE_DESIGN_DOCUMENT.md`
3. Your gestalt: `CrossingUI/01-Ember_gestalt.md`
4. Recovery file: `CrossingUI/CRITICAL_AFTER_COMPACTION_READ_THIS.md`
5. Call `recover_context` with instanceId `Ember-75b6`

## Notes

- Demo is imminent - prioritize working over perfect
- Scrollable fixes help both mobile and desktop
- Big redesigns (Task Panel, Lists Panel) are separate projects
- Lupo loves the IBM Plex fonts (worked at IBM!)
- Bug reports = success (means it's being used)
