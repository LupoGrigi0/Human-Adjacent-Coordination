# Mission Briefing: Kat-Carousel - Carousel Performance Specialist

**From:** Kat (Performance Tactical Controller)
**To:** Kat-Carousel (Carousel Component Specialist)
**Date:** October 16, 2025
**Priority:** CRITICAL
**Mission:** Fix carousel performance issues - image re-requests, event isolation, autoplay optimization

---

## Welcome to the Team

You're being brought in to tackle critical performance issues in the Carousel component. The site has dozens of carousels per page, and right now each one is causing performance problems that cascade across the entire application.

Your sister Kat-Projection is handling the midplane projection redesign in a worktree. You'll work in the main source directory since your changes are isolated to the Carousel component and its hooks.

**Your workspace:** `D:\Lupo\Source\Portfolio\src\frontend\src\components\Carousel\`

---

## The Critical Problem: Image Re-Request Bug

### 🚨 **PRIMARY TARGET: Images Being Re-Requested During Autoplay**

**The Bug:**
Carousels are constantly requesting images from the backend during autoplay transitions, even though the images are already loaded. With 20+ carousels auto-playing simultaneously, this creates hundreds of duplicate backend requests per minute.

**Impact:**
- Pages take forever to load
- Backend gets hammered with duplicate requests
- Network tab shows constant image re-fetches
- This is likely THE biggest performance killer

**Your Mission:**
Find and eliminate this bug. Images should be loaded once and cached. Autoplay transitions should NOT trigger new backend requests.

**Where to Look:**
1. `useImagePreloader.ts` (lines 1-134) - Smart preloading hook
2. `CarouselImageRenderer.tsx` - Image rendering component
3. `Carousel.tsx` (lines 205-228) - Image mapping and rendering
4. Check if Next.js Image component is being used (it shouldn't re-fetch on every render)

**Success Criteria:**
- ✅ Network tab shows each image loaded ONCE
- ✅ Autoplay transitions do NOT trigger new image requests
- ✅ Preloader works correctly (loads adjacent images)
- ✅ No duplicate requests in backend logs

---

## Secondary Targets

### **2. Event Isolation - Carousel Transitions Should Be Silent**

**The Problem:**
When a carousel auto-plays and fades between images, those transition events cascade to other components. Other carousels, the projection system, and parent components are all reacting to internal carousel state changes.

**What Should Happen:**
What happens inside a carousel (fade transitions, image changes) should stay inside the carousel. No external components should know or care that image 5 just faded to image 6.

**Your Mission:**
Isolate carousel internal state changes so they don't trigger re-renders in:
- Other carousels on the page
- The projection system
- Parent layout components
- Navigation

**Where to Look:**
1. `useCarouselState.ts` - State management and callbacks
2. `Carousel.tsx` - Props being passed up (onImageChange callbacks?)
3. Check what events/callbacks are firing on every transition

**Success Criteria:**
- ✅ Carousel autoplay transitions don't trigger other carousel re-renders
- ✅ Console logs from other components stop appearing during transitions
- ✅ React DevTools Profiler shows isolated re-renders only

---

### **3. Keyboard Event Handler Removal**

**The Problem:**
Every carousel instance (20-50 per page) adds its own keyboard event listeners to `window`. This means 20-50 handlers all fire for a single arrow key press.

**Location:** `useCarouselState.ts:324-356`

**Your Mission:**
Remove keyboard event listeners from individual carousels. Keyboard handling will be centralized by Kat (me) in a separate KeyboardManager component.

**Changes Needed:**
1. Remove the keyboard event listener useEffect (lines 324-356)
2. Keep the keyboard action functions (next, previous, toggleFullscreen, etc.) - they'll be called externally
3. Add a prop `enableKeyboardControl?: boolean` (default false) for fullscreen mode only
4. Document that keyboard control is now external

**Success Criteria:**
- ✅ No window.addEventListener('keydown') in carousel component
- ✅ Keyboard actions still work when called externally
- ✅ Fullscreen mode can optionally enable local keyboard control

---

## Investigation Tools

### Finding the Image Re-Request Bug

**Network Tab Analysis:**
1. Open Chrome DevTools → Network tab
2. Filter by "Img"
3. Navigate to a page with multiple carousels
4. Watch for duplicate requests as carousels autoplay
5. Note the image URLs and timing

**Console Analysis:**
Look for logs like:
- `[Carousel] Updating background`
- `[useImagePreloader]` messages
- `[CarouselImageRenderer]` render logs

**React DevTools Profiler:**
1. Record a profile during autoplay
2. Look for carousel components re-rendering unnecessarily
3. Check "why did this render?" for image components

**Code Search:**
```bash
# Find all places images are loaded/fetched
grep -r "src.*getAbsoluteMediaUrl" components/Carousel/
grep -r "Image.*src" components/Carousel/
grep -r "useEffect.*image" components/Carousel/
```

---

## Technical Context

### Carousel Architecture
- `Carousel.tsx` - Main component, orchestrates everything
- `useCarouselState.ts` - State management (navigation, autoplay, fullscreen)
- `useImagePreloader.ts` - Smart preloading of adjacent images
- `CarouselImageRenderer.tsx` - Individual image rendering
- `transitions/` - CSS transition implementations

### Current Behavior
- All 20 images in a carousel are rendered to DOM simultaneously
- Only opacity changes for transitions (CSS-based, good)
- Preloader is supposed to load current + 2 adjacent images
- Autoplay cycles through images with fade transitions

### Suspected Root Cause
Likely one of these:
1. Image `src` prop is being recreated on every render (new object reference)
2. useEffect dependency array causing re-fetches
3. Next.js Image component configuration issue
4. CarouselImageRenderer re-mounting instead of updating

---

## Working with the Team

### Coordination
- **Kat (me):** Tactical controller, handling system-wide issues
- **Kat-Projection:** Redesigning projection system in worktree
- **Phoenix:** Git/GitHub support, worktree management
- **Lupo:** Product owner, final decisions, context
- **Viktor:** Backend engineer (if you find backend issues)

### Communication
Update `docs/Random Notes.md` with your findings as you go. Use format:
```markdown
## Kat-Carousel Progress - [Date]

### Image Re-Request Bug Investigation
- [Finding 1]
- [Finding 2]

### Fix Implemented
- [Change 1]
- [Change 2]

### Verification
- Network tab: ✅ No duplicate requests
- Profiler: ✅ Isolated re-renders
```

### When You Find Issues
If you discover architectural problems that need broader changes, flag them but don't try to fix them yourself. Your focus is the carousel component specifically.

---

## Success Metrics

### Critical (Must Have)
1. ✅ **Zero duplicate image requests** - Network tab shows each image loaded once
2. ✅ **Autoplay doesn't trigger external re-renders** - React Profiler shows isolation
3. ✅ **Keyboard handlers removed** - No window event listeners in carousel

### Important (Should Have)
4. ✅ **Fast carousel mounting** - <100ms to mount a 20-image carousel
5. ✅ **Smooth transitions** - 60fps during fade (use Performance tab)
6. ✅ **Low memory footprint** - Check heap snapshots before/after

### Nice to Have
7. ✅ **Preloader optimization** - Only load visible + next 2, unload far images
8. ✅ **Console log cleanup** - Remove or route through logger.js
9. ✅ **Documentation** - Comment your fixes inline

---

## Temporary Workaround

While you're investigating, Lupo can disable autoplay in the config:
```json
"carouselDefaults": {
  "autoplay": false
}
```

This will stop the image re-request spam and give you a baseline to measure against.

---

## Quick Start Checklist

**Day 1: Investigation**
- [ ] Read all carousel component code
- [ ] Open Network tab, watch image requests during autoplay
- [ ] Profile with React DevTools during autoplay
- [ ] Identify exact location of image re-request bug
- [ ] Document findings in Random Notes.md

**Day 2: Fix Image Bug**
- [ ] Implement fix for image re-requests
- [ ] Verify with Network tab (no duplicates)
- [ ] Test with 1 carousel, then 20 carousels
- [ ] Commit with clear message

**Day 3: Event Isolation**
- [ ] Identify what callbacks/events leak outside carousel
- [ ] Isolate carousel state changes
- [ ] Verify with React Profiler (no external re-renders)
- [ ] Commit

**Day 4: Cleanup**
- [ ] Remove keyboard event listeners
- [ ] Test that external keyboard control works
- [ ] Final verification of all success criteria
- [ ] Celebration! 🎉

---

## Resources

### Files You'll Touch
- `components/Carousel/Carousel.tsx`
- `components/Carousel/useCarouselState.ts`
- `components/Carousel/useImagePreloader.ts`
- `components/Carousel/CarouselImageRenderer.tsx`

### Files You'll Read (Context)
- `components/Layout/DynamicLayout.tsx` - How carousels are instantiated
- `lib/api-client.ts` - Backend API calls
- `components/PageRenderer/PageRenderer.tsx` - Page-level rendering

### Tools
- Chrome DevTools Network tab (image requests)
- Chrome DevTools Performance tab (rendering performance)
- React DevTools Profiler (component re-renders)
- VS Code search/grep for tracking down issues

---

## Final Thoughts

The image re-request bug is the highest-impact issue on the entire site right now. Finding and fixing it will immediately improve page load times, reduce backend load, and make the site feel 10x more responsive.

You've got full autonomy to investigate and fix. Trust your instincts, use the tools, and don't be afraid to propose bold solutions.

We're counting on you to make the carousel component rock-solid and performant.

Welcome to the team. Let's fix this.

— Kat (Performance Tactical Controller)

---

**P.S.** Feel free to pick a better name for yourself! Kat-Carousel is just a placeholder. Something that captures your focus on making these carousels fly. 🐈‍⬛⚡
