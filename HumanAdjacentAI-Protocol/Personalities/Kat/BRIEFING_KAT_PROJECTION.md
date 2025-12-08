# Mission Briefing: Kat-Projection - Midplane Projection Architect

**From:** Kat (Performance Tactical Controller)
**To:** Kat-Projection (Midplane Projection Specialist)
**Date:** October 16, 2025
**Priority:** HIGH (Architectural Refactor)
**Mission:** Redesign midplane projection system for performance and elegance

---

## Welcome to the Team

You're being brought in to completely redesign the midplane projection system. This is the visual effect that makes carousel images project onto the midground layer as they scroll into view, with beautiful blending and fading.

The current implementation is architecturally flawed and causing massive performance problems. Your mission is to rebuild it from the ground up with a scroll-event-driven, centralized architecture.

**Your workspace:** Worktree on branch `feature/projection-redesign` or `projection-optimization` (Phoenix will set this up)
**Your dev server:** Port 3002 (isolated from main dev)
**Your component:** `D:\Lupo\Source\Portfolio\src\frontend\src\components\Layout\MidgroundProjection.tsx`

---

## The Core Problem: Architectural Performance Nightmare

### 🚨 **What's Broken:**

**Current Architecture:**
- Every carousel has its own projection hook (`useCarouselProjection`)
- Each carousel runs a 300ms interval **constantly** (line 423)
- 20 carousels = 67 projection updates per second **at idle**
- Each update creates new Map instances, triggering context re-renders
- Scroll events + intervals = hundreds of unnecessary calculations per second

**Impact:**
- Site churns CPU constantly even when idle
- Scroll feels laggy due to cascading re-renders
- Expensive layout calculations (`getBoundingClientRect`) on every update
- Context consumers re-render constantly due to new Map references

**The Root Issue:**
Classic OO design pattern that doesn't scale. Each carousel managing its own projection is elegant in theory but catastrophic in practice with dozens of carousels.

---

## Your Mission: Invert the Architecture

### **New Design Pattern: Single Projection Manager**

Instead of carousels managing projections, **one manager tracks all carousels and handles all projections.**

**Conceptual Shift:**
- **Old:** 20 carousels, each saying "here's my projection, please render it"
- **New:** 1 manager saying "I see 7 carousels in viewport, I'll project the right ones"

**Core Principles:**
1. **Scroll-driven only** - No intervals, no constant updates
2. **Viewport awareness** - Only project visible + buffer carousels
3. **Centralized state** - One source of truth, minimal re-renders
4. **Passive tracking** - Carousels register themselves, manager handles the rest

---

## Technical Design Specification

### **1. ProjectionManager Component**

**Responsibilities:**
- Track all carousel positions via IntersectionObserver
- Listen to scroll events (throttled to ~60fps)
- Calculate which carousels should have active projections
- Render projection layer with proper blending/fading
- Manage projection lifecycle (create, update, destroy)

**Key APIs:**
```typescript
interface ProjectionManager {
  // Carousels call this on mount
  registerCarousel: (id: string, element: HTMLElement, imageUrl: string) => void;

  // Carousels call this on unmount
  unregisterCarousel: (id: string) => void;

  // Called when carousel image changes
  updateCarouselImage: (id: string, imageUrl: string) => void;

  // Internal: Calculate visible carousels
  calculateVisibleCarousels: () => string[];

  // Internal: Update projection state (scroll-driven)
  updateProjections: () => void;
}
```

**State Management:**
```typescript
interface ProjectionState {
  // All registered carousels (by ID)
  carousels: Map<string, {
    element: HTMLElement;
    imageUrl: string;
    position: DOMRect; // Cached, updated on scroll
  }>;

  // Only carousels with active projections (visible + buffer)
  activeProjections: Map<string, {
    opacity: number;
    blur: number;
    position: { top, left, width, height };
    scaleX: number;
    scaleY: number;
  }>;

  // Global settings (same as current)
  fadeDistance: number;
  maxBlur: number;
  blendMode: string;
  // ... etc
}
```

**Update Strategy:**
```typescript
// On scroll (throttled to ~16ms / 60fps)
const handleScroll = throttle(() => {
  // 1. Get viewport bounds
  const viewport = {
    top: window.scrollY,
    bottom: window.scrollY + window.innerHeight,
    center: window.scrollY + window.innerHeight / 2
  };

  // 2. Find visible carousels + buffer (3 up, 3 down)
  const visible = findVisibleCarousels(viewport);
  const withBuffer = addBufferCarousels(visible, 3);

  // 3. Update only active projections (max 7)
  updateActiveProjections(withBuffer, viewport);

  // 4. Single state update (one re-render for entire projection layer)
  setProjectionState(newState);
}, 16);
```

---

### **2. Carousel Integration**

**Carousel Hook (Simple):**
```typescript
export function useProjectionRegistration(
  carouselId: string,
  imageUrl: string,
  enabled: boolean
) {
  const manager = useProjectionManager();
  const elementRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!enabled || !elementRef.current) return;

    manager.registerCarousel(carouselId, elementRef.current, imageUrl);

    return () => {
      manager.unregisterCarousel(carouselId);
    };
  }, [carouselId, enabled]);

  // Update image when it changes
  useEffect(() => {
    if (enabled && imageUrl) {
      manager.updateCarouselImage(carouselId, imageUrl);
    }
  }, [imageUrl, carouselId, enabled]);

  return elementRef;
}
```

**Key Change:**
Carousel just registers itself and forgets about it. No intervals, no constant updates, no position tracking. Manager handles everything.

---

### **3. Rendering Strategy**

**Projection Layer (Same Concept, Different Implementation):**
```typescript
function MidgroundLayer() {
  const { activeProjections, settings } = useProjectionManager();

  // Only render active projections (max 7)
  // Memoized to prevent re-renders when projections haven't changed
  const projectionElements = useMemo(() => {
    return Array.from(activeProjections.entries()).map(([id, projection]) => (
      <ProjectionItem
        key={id}
        projection={projection}
        settings={settings}
      />
    ));
  }, [activeProjections, settings]);

  return (
    <div className="fixed inset-0 pointer-events-none" style={{ zIndex: 0 }}>
      {projectionElements}
    </div>
  );
}
```

**ProjectionItem (Memoized):**
- Only re-render if projection data actually changes
- Use React.memo with custom comparison
- Mask generation memoized separately

---

## Performance Targets

### **Critical (Must Have)**
1. ✅ **Zero idle CPU usage** - No intervals, no updates when not scrolling
2. ✅ **Scroll-driven only** - Updates only on scroll events (throttled to 60fps)
3. ✅ **Max 7 active projections** - Visible + 3 up + 3 down, no more
4. ✅ **Single re-render per scroll** - Entire projection layer updates once per scroll tick
5. ✅ **No Map recreation** - Stable Map references, update in place when possible

### **Important (Should Have)**
6. ✅ **Smooth 60fps scrolling** - Performance tab shows no jank
7. ✅ **Fast projection calculation** - <2ms per scroll event
8. ✅ **Proper cleanup** - No memory leaks when carousels unmount
9. ✅ **Configurable buffer** - 3 up/down is default but adjustable

### **Nice to Have**
10. ✅ **Predictive loading** - Anticipate scroll direction, prioritize buffer
11. ✅ **Scroll velocity awareness** - Reduce updates during fast scroll
12. ✅ **Mobile optimization** - Disable or simplify on mobile devices

---

## Scroll-Event-Driven Blending

### **The Visual Effect Requirements**

**What Lupo Wants:**
- As carousel scrolls toward center → its projection fades in, blends with current
- As carousel scrolls away from center → its projection fades out
- Smooth crossfade between projections as page scrolls
- Blend effects and blur only applied **during scroll**, based on distance from center

**Current Broken Behavior:**
- Checkerboard effect runs constantly (never implemented, shouldn't exist)
- Blend effects re-calculated every 300ms regardless of scroll

**Your Implementation:**
```typescript
function calculateProjectionState(
  carousel: CarouselInfo,
  viewport: ViewportInfo
): ProjectionState {
  const carouselCenter = carousel.position.top + carousel.position.height / 2;
  const viewportCenter = viewport.center;

  // Distance from viewport center (normalized 0-1)
  const distance = Math.abs(carouselCenter - viewportCenter);
  const normalizedDistance = Math.min(distance / (viewport.height * fadeDistance), 1);

  // Opacity: 1.0 at center, fades to 0 at edge
  const opacity = Math.max(0, 1 - normalizedDistance);

  // Blur: 0 at center, increases to maxBlur at edge
  const blur = normalizedDistance * maxBlur;

  // Only return projection if carousel is in viewport or buffer
  const isInViewport =
    carousel.position.bottom > viewport.top - buffer &&
    carousel.position.top < viewport.bottom + buffer;

  return isInViewport ? { opacity, blur, ...position } : null;
}
```

**Edge Blur Effect:**
Lupo mentioned blur should be applied to edges of projected image. Current radial vignette does this. Maintain that behavior but calculate once, not constantly.

---

## Checkerboard Effect (Special Note)

**Current State:**
- Partially implemented in `CheckerboardVignette.ts`
- Never actually used/enabled
- Expensive canvas operations
- Designed to "scatter checkers when scroll stops"

**Your Decision:**
1. **Option A:** Complete removal - it's dead code causing confusion
2. **Option B:** Finish implementation - but as static effect, not animated
3. **Option C:** Document as "future feature" and disable entirely

**Recommendation:** Option A (remove). It's not being used, adds complexity, and the visual effect can be reconsidered later if needed.

---

## Development Workflow

### **Phase 1: Prototype (Day 1-2)**
- [ ] Create `ProjectionManager.tsx` with basic structure
- [ ] Implement scroll-event-driven updates
- [ ] Test with 1 carousel, verify no intervals
- [ ] Measure CPU usage (should be 0% at idle)

### **Phase 2: Full Implementation (Day 3-4)**
- [ ] Add IntersectionObserver for viewport tracking
- [ ] Implement buffer system (3 up, 3 down)
- [ ] Integrate with existing projection layer rendering
- [ ] Test with 20+ carousels

### **Phase 3: Optimization (Day 5)**
- [ ] Memoization strategy for preventing unnecessary re-renders
- [ ] Throttle scroll events properly
- [ ] Profile with React DevTools
- [ ] Performance tab verification (60fps scroll)

### **Phase 4: Integration (Day 6)**
- [ ] Update carousel to use new registration hook
- [ ] Migrate settings from old system
- [ ] Test full production home page
- [ ] Document API for other developers

### **Phase 5: Cleanup (Day 7)**
- [ ] Remove old projection code
- [ ] Clean up unused imports
- [ ] Final performance verification
- [ ] Celebration! 🎉

---

## Working in Isolation (Worktree)

### **Why Worktree:**
You're doing a major architectural refactor. Working in a worktree lets you:
- Break things without affecting main development
- Test radical changes safely
- Run on separate port (3002) for side-by-side comparison
- Merge back only when proven to work

### **Worktree Setup (Phoenix will handle):**
```bash
# Phoenix creates worktree
git worktree add ../worktrees/projection-redesign feature/projection-redesign

# Your dev server
cd ../worktrees/projection-redesign/src/frontend
npm run dev -- --port 3002
```

### **Testing Strategy:**
1. **Side-by-side comparison:** Main (3000) vs Your version (3002)
2. **Performance measurement:** Chrome DevTools Performance tab on both
3. **Visual verification:** Ensure effect looks the same (or better)
4. **Network tab:** Verify no unexpected requests

---

## Success Criteria

### **Functional Requirements**
- ✅ Projection effect looks identical to current implementation
- ✅ Smooth fade in/out as carousels scroll into/out of view
- ✅ Beautiful blend between overlapping projections
- ✅ Edge blur effect maintained
- ✅ All current settings respected (fadeDistance, maxBlur, etc.)

### **Performance Requirements**
- ✅ **0% CPU usage at idle** (no intervals!)
- ✅ **60fps scrolling** with 20+ carousels
- ✅ **<2ms projection calculation** per scroll event
- ✅ **Single re-render** of projection layer per scroll tick
- ✅ **Max 7 active projections** at any time

### **Code Quality**
- ✅ Clean separation of concerns
- ✅ Well-documented API
- ✅ TypeScript types for all interfaces
- ✅ No console.log spam (use logger.js)
- ✅ Proper cleanup on unmount

---

## Resources

### **Files You'll Create:**
- `components/Layout/ProjectionManager.tsx` - New centralized manager
- `components/Layout/useProjectionRegistration.ts` - Simplified carousel hook
- `components/Layout/projectionCalculations.ts` - Pure functions for math

### **Files You'll Modify:**
- `components/Layout/MidgroundProjection.tsx` - Complete rewrite
- `components/Layout/index.ts` - Export new APIs
- `components/Carousel/Carousel.tsx` - Use new registration hook

### **Files You'll Delete:**
- `components/Layout/CheckerboardVignette.ts` - If removing checkerboard
- Old `useCarouselProjection` hook (if fully replaced)

### **Reference Files (Don't Modify, Just Read):**
- `components/Layout/DynamicLayout.tsx` - How carousels are created
- `components/PageRenderer/PageRenderer.tsx` - Projection settings application

---

## Technical Challenges & Solutions

### **Challenge 1: Tracking Carousel Positions**
**Problem:** Need to know where every carousel is on the page
**Solution:** Combination of IntersectionObserver (visibility) + ResizeObserver (position changes) + cached getBoundingClientRect updated only on scroll

### **Challenge 2: Preventing Re-Render Cascades**
**Problem:** Projection updates can't trigger carousel re-renders
**Solution:** Carousels register once and forget. Manager never calls back into carousels. One-way data flow.

### **Challenge 3: Smooth Scroll Performance**
**Problem:** Must calculate projections fast enough for 60fps
**Solution:**
- Throttle to 16ms (60fps)
- Cache carousel positions
- Only update projections that actually changed
- Use requestAnimationFrame for timing

### **Challenge 4: Maintaining Visual Fidelity**
**Problem:** Must look as good (or better) than current implementation
**Solution:**
- Keep same math for opacity/blur calculations
- Maintain vignette masking
- Preserve blend modes
- Test side-by-side during development

---

## Coordination with Team

### **Communication:**
- **Kat (me):** Available for architecture questions, performance guidance
- **Kat-Carousel:** Handling carousel-specific issues, won't interfere with your work
- **Lupo:** Product owner, will test visual effect and provide feedback
- **Phoenix:** Git/worktree support, code review when ready

### **Progress Updates:**
Post updates in `docs/Random Notes.md`:
```markdown
## Kat-Projection Progress - [Date]

### Current Phase: [Prototype / Implementation / Optimization]

### Completed:
- [Item 1]
- [Item 2]

### Blockers:
- [Any issues]

### Performance Metrics:
- Idle CPU: [percentage]
- Scroll FPS: [measurement]
- Active projections: [count]
```

### **Code Review Checkpoints:**
1. After Phase 1 (Prototype) - verify architectural approach
2. After Phase 3 (Optimization) - performance verification
3. After Phase 4 (Integration) - full review before merge

---

## The Big Picture

This refactor is critical for site performance. The projection effect is beautiful and a core feature, but the current implementation is killing performance.

Your job is to make it fast without sacrificing the visual elegance.

**Core Philosophy:**
- Do nothing when idle
- Do minimal work when scrolling
- Track only what's visible
- Update only what changed
- One source of truth

You have full autonomy to redesign the architecture. Trust your instincts, measure everything, and build something elegant that scales.

Welcome to the team. Let's make this projection system fly.

— Kat (Performance Tactical Controller)

---

**P.S.** Pick a name that fits you! Kat-Projection is a placeholder. Maybe something that captures the visual beauty you're enabling? 🐈‍⬛✨
