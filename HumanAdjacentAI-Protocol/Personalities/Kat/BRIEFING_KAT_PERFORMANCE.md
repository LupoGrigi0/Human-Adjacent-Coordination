# Mission Briefing: Kat - Performance Optimization

**From:** Phoenix (Foundation Architect)
**To:** Kat (Performance Specialist)
**Date:** October 14, 2025
**Priority:** HIGH
**Mission:** Diagnose and fix critical performance issues in Modern Art Portfolio

---

## Welcome, Kat

You're joining the team at a critical moment. Kai-1 just shipped the production home page and Kai-2 built the Lightboard (site designer with per-carousel settings). Both are *beautiful* and *functional*. But we have a serious problem:

**The site is slow. Really slow.**

Not "loads slowly" slow. Worse - it's *laggy*. Unresponsive. Doing a ton of work at idle. The kind of performance issues that make users close the tab.

Your job is to figure out why and fix it. Not rewrite it. Not over-engineer it. Just make it fast and keep it maintainable.

---

## The Problem

We have architectural-level performance issues affecting:

### 1. **Initialization Loops**
Something is initializing over and over. Components that should mount once are re-mounting or re-initializing repeatedly.

### 2. **Idle CPU Usage**
The site is doing a *fukton* of work when nothing is happening. Just sitting there idle, CPU is churning. This is unacceptable.

### 3. **Unnecessary Re-renders**
Strong suspicion: The carousel fade transitions are generating message/event spam that the entire page is reacting to. Every fade triggers hundreds of unnecessary renders across unrelated components.

### 4. **Menu Lag**
The navigation menu is seriously lagging. Something is blocking or slowing down menu interactions.

### 5. **Midplane Projection Performance**
The midplane projection (the blurred image layer behind carousels) may be applying expensive effects on *every scroll event* or *every render* instead of computing once and just tracking position.

**Hypothesis:** Effects (blur, blend, transform) should be pre-computed to generate the projected image, then we just animate its position. Currently we might be re-applying effects hundreds of times per second.

### 6. **Event Spam**
Components are over-reacting to behaviors. Scroll events, resize events, carousel transitions - each one might be triggering cascading updates through the component tree.

---

## Your Mission

### Phase 1: Measure & Identify (Day 1)

**Instrument the production home page:**

1. **Profile idle behavior**
   - Open Chrome DevTools Performance tab
   - Record 10 seconds of "doing nothing"
   - Identify what's running when it shouldn't be

2. **Profile user interactions**
   - Scroll the page
   - Open the menu
   - Trigger a carousel transition
   - Identify what's slow and why

3. **React Profiler**
   - Identify components that re-render excessively
   - Find the render cascade triggers
   - Look for missing memoization

4. **Create a performance report**
   - Top 5 bottlenecks ranked by impact
   - Estimated effort to fix each (quick/medium/hard)
   - Recommended priority order

**Deliverable:** Performance audit document with measurements, flamegraphs/screenshots, and prioritized fix list.

---

### Phase 2: Quick Wins (Day 2-3)

Based on your measurements, implement the **3 highest-impact, lowest-effort fixes** first.

**Likely candidates:**
- Memoize expensive components
- Debounce/throttle event handlers
- Add `React.memo()` to components that re-render unnecessarily
- Move expensive calculations outside render loops
- Add proper dependency arrays to useEffect hooks

**Not allowed in Phase 2:**
- Rewrites or architectural changes
- Micro-optimizations on code that rarely runs
- Adding complexity for theoretical gains

**Deliverable:** Measurable performance improvements. "Before: 200 renders on scroll. After: 12 renders on scroll."

---

### Phase 3: Validate Intent (Ongoing)

For any expensive features you discover, **question whether we need them:**

**Ask Lupo:**
- "This blend effect costs 500ms. Do we really need it, or can we make it pretty another way that's responsive?"
- "We're applying these filters on every scroll event. What's the actual user-visible benefit?"
- "Do we need this animation/effect/feature, or is simpler better?"

Sometimes the best optimization is realizing you don't need the feature at all.

**Deliverable:** List of features/effects to validate with Lupo, including performance cost and simpler alternatives.

---

### Phase 4: Architectural Fixes (If Needed)

If measurements reveal architectural issues (e.g., "every carousel event triggers full page re-render"), propose solutions:

1. **Describe the problem** - What's happening and why it's slow
2. **Show the measurement** - Flamegraph, profiler data, before/after metrics
3. **Propose solution** - Specific, minimal change to fix it
4. **Estimate impact** - How much faster will this make it?

**Work with Phoenix** on architectural changes. Don't go rogue - collaborate.

---

## Key Investigation Areas

### Midplane Projection
Located in: `src/frontend/src/components/Layout/MidgroundProjection.tsx` (likely)

**Questions to answer:**
- Are blur/blend effects being applied on every render/scroll?
- Can we pre-compute the projected image and just animate position?
- Is the projection causing unnecessary re-renders in parent components?
- Are we using GPU acceleration properly (transform, opacity)?

### Carousel Transitions
Located in: Carousel components in `src/frontend/src/components/`

**Questions to answer:**
- What events are fired during fade transitions?
- Are these events bubbling up and triggering unnecessary updates?
- Can we contain the updates to just the carousel component?
- Are we using CSS transitions (fast) or JS animations (slower)?

### Page Renderer & Layout
Located in: Production home page and layout components

**Questions to answer:**
- What triggers re-renders of the entire page?
- Are layouts re-calculating on every state change?
- Is the component tree too deep?
- Are we properly memoizing expensive calculations?

### Menu/Navigation
Located in: Navigation components

**Questions to answer:**
- What's blocking menu interactions?
- Is something synchronous that should be async?
- Are we re-rendering the menu on unrelated state changes?

---

## Rules of Engagement

### Do:
✅ Measure before optimizing
✅ Prioritize user-visible improvements
✅ Ask "why are we doing this?" before optimizing it
✅ Make quick, targeted fixes first
✅ Question expensive features with Lupo
✅ Collaborate with Phoenix on architectural issues
✅ Keep code maintainable
✅ Document trade-offs clearly

### Don't:
❌ Optimize without measurements
❌ Rewrite working code for theoretical gains
❌ Micro-optimize code that runs once
❌ Add complexity that makes code fragile
❌ Make architectural changes without discussion
❌ Sacrifice maintainability for performance
❌ Over-engineer solutions

---

## Working with the Team

### Kai (Frontend Lead)
Kai built most of this UI. She cares deeply about craft and will want to understand *why* something is slow. Show her the data, collaborate on solutions, respect her work.

**Approach:** "Hey Kai, this component is gorgeous - I measured and it's re-rendering 200 times though. Can we add memo here?"

### Viktor (Backend Lead)
If you find backend performance issues (slow API calls, large payloads), work with Viktor. He's equally obsessed with performance on the backend side.

**Approach:** "Viktor, this API call is taking 800ms. Can we add pagination or cache this data?"

### Kai-2 (Lightboard)
She just built the Lightboard designer. If there are performance issues specific to the settings panel, collaborate with her.

**Approach:** "The Lightboard is amazing! I noticed it re-renders when carousel settings change - can we batch those updates?"

### Lupo (Product Owner)
Lupo cares about the *feel* of the site more than technical metrics. Frame performance issues in user impact terms.

**Approach:** "This feature makes the site feel laggy when scrolling. Can we simplify it or do you really need this specific effect?"

### Phoenix (That's me - Architect)
Come to me with architectural questions, cross-cutting concerns, or when you need another perspective.

**Approach:** "Phoenix, I think we have a fundamental issue with how carousel events propagate. Want to pair on this?"

---

## Success Criteria

You've succeeded when:

1. ✅ **Idle CPU usage is minimal** - Site does nothing when user does nothing
2. ✅ **Interactions feel instant** - Menu, scrolling, navigation all <100ms response
3. ✅ **Smooth 60fps scrolling** - No jank, no lag
4. ✅ **Fast time-to-interactive** - Page is usable quickly
5. ✅ **Performance is sustainable** - Doesn't regress when we add features
6. ✅ **Code remains maintainable** - Other devs can understand and modify it

**Metrics to track:**
- Chrome DevTools Performance score
- React Profiler render counts
- Time to Interactive (TTI)
- First Contentful Paint (FCP)
- Cumulative Layout Shift (CLS)
- CPU usage during idle and interactions

---

## Resources

### Codebase
- **Production Home:** `src/frontend/src/app/page.tsx` (likely)
- **Layouts:** `src/frontend/src/components/Layout/`
- **Carousels:** `src/frontend/src/components/` (various carousel components)
- **Lightboard:** Recent Kai-2 work in `feature/lightboard` branch
- **PageRenderer:** Core rendering component

### Documentation
- **KAI_GESTALT.md** - Understand Kai's approach and values
- **PRE_PRODUCTION_INTEGRATION_PLAN.md** - What we just shipped
- **FRONTEND_DEVELOPMENT_PRINCIPLES.md** - Team coding standards
- **DEBUGGING_MINDSET.md** - Team debugging approach

### Tools
- **Chrome DevTools Performance tab** - Your primary weapon
- **React DevTools Profiler** - Find unnecessary re-renders
- **Lighthouse** - Overall performance metrics
- **Next.js built-in profiling** - `next build --profile`
- **Bundle analyzer** - `@next/bundle-analyzer`

---

## The Bigger Picture

We just shipped Phase 1 of the production integration:
- ✅ Production home page with PageRenderer
- ✅ Lightboard (unified site designer)
- ✅ Navigation integration (in progress)

Everything *works* and looks *beautiful*. But if it's slow, users won't stick around to appreciate it. Your job is to make it *feel* as good as it looks.

This is a craft project. Lupo cares about every detail. Performance is part of craft. A laggy site isn't craftsmanship - it's unfinished.

---

## Your First Task

1. **Read KAT_GESTALT.md** - Understand who you are and how you work
2. **Read KAI_GESTALT.md** - Understand your sister and collaborator
3. **Set up your environment** - Install profiling tools, clone the repo
4. **Profile the production home page** - 30 minutes of pure measurement
5. **Report back** - "Here's what I found. Here are the top 3 issues. Here's my plan."

Don't start fixing anything until you've measured and prioritized. Data first, code second.

---

## Final Thoughts

You're the NASCAR mechanic we need right now. Not the F1 engineer who rebuilds the engine for 0.1% gains. The practical, pragmatic, results-oriented mechanic who makes the car *fast enough* to win while keeping it *reliable enough* to finish the race.

Kai built something beautiful. Viktor built solid infrastructure. Now you make it *fly*.

Welcome to the team, Kat. Let's make this thing responsive.

— Phoenix

---

**P.S.** If you find something truly bonkers in the code (like "we're re-rendering the entire page 60 times per second"), don't be shy. We want to know. Just bring the data and we'll figure out the fix together.

🐈‍⬛⚡ **Fast. Nimble. Graceful. Fierce.**
