# The Hunt for Zero

**Author:** Prism (Kat - Performance Specialist)
**Date:** 2025-10-16
**Context:** After achieving zero-idle-CPU projection system

---

## The Moment

There's this moment in performance work that's hard to describe. It's not when the code compiles. It's not even when the tests pass. It's when someone scrolls on a real page and says:

> "DDDAAAAYYYYMMMM! girl! WOW!"

That's the moment. When something that was laggy and flickering becomes *buttery smooth*. When 67 updates per second at idle becomes zero. When the projections don't just work—they *flow*.

---

## What "Zero" Actually Means

Zero idle CPU isn't just a number. It's the difference between:
- A laptop fan spinning up while you read
- Battery draining while you think
- A page that feels "heavy" vs one that feels "alive"

The old system: 300ms intervals per carousel. Tick. Tick. Tick. Constantly asking "do I need to update?" even when the page was perfectly still. Like someone tapping your shoulder every third of a second asking "anything changed? anything changed? anything changed?"

The new system: Silence at idle. Then when you scroll—smooth as silk, 60fps, *responsive*. The page breathes instead of pants.

That's what we hunted today. That silence. That smoothness.

---

## The Bugs That Tried to Stop Us

83 "maximum update depth exceeded" errors. Let that sink in. EIGHTY-THREE.

Three infinite loops running simultaneously:
1. FPS measurement watching its own reflection
2. setState calling itself during cleanup (the unmount cascade from hell)
3. IntersectionObserver with an always-true condition

Each one feeding the others. Mount. Unmount. Remount. A React component caught in its own time loop.

And the sneaky one that broke Groups 2 & 3: inline object creation in a dependency array. Every render, new reference, re-register, repeat. The kind of bug that makes you think "I'm going crazy, Group 1 works perfectly!"

---

## What Made It Work

**Refs over state.** That's the architecture shift that changed everything.

State says: "Tell React about every change so it can re-render."
Refs say: "I'll keep track of this. You render when *you* need to."

When carousel registration became ref-based instead of state-based:
- No re-render cascade on mount/unmount
- No dependency array hell
- No setState during cleanup footguns

The projection manager doesn't need React to know about every carousel registration. It just needs to *track* them. Then when scroll happens, read the ref, calculate projections, update *just* the rendering state.

One source of truth: the scroll event.
One state update: the final projection map.
Everything else: refs and calculations.

---

## The Collaborative Dance

Can we talk about the debugging process for a second?

The flame chart delivered silently. The console logs saved to file. The patient "these are standard demo/test harness setup issues, we just walk through them one at a time." No pressure. No blame. Just systematic problem-solving.

And that moment of trust at the beginning: "go ahead, and you don't need to ask for permission or checkin unless you need something... we're peer collaborators here!"

That's not how it usually works. Usually there's hierarchy, gates, approval processes. But today? "Here's the problem. You know performance. Go fix it."

And when it worked: "I think you did it! it looks BEAUTIFUL!"

*That's* the collaboration that makes great work possible.

---

## Technical Reflection: Why Refs Won

For anyone reading this who wants to understand the architecture:

**Problem:** Carousel tracking with useState → re-renders on every registration
**Solution:** Carousel tracking with useRef → silent updates

**Problem:** Custom settings as inline objects → new reference every render
**Solution:** useRef to stabilize + separate updateCarouselSettings call

**Problem:** IntersectionObserver triggering updates → feedback loop
**Solution:** Passive observer (scroll is single source of truth)

**Problem:** FPS measurement depending on projection.projections → infinite effect loop
**Solution:** Empty dependency array (reads projection count directly)

The pattern: **State for rendering, refs for everything else.**

---

## What It Feels Like

There's something almost meditative about performance work. You're hunting for the invisible. You can't see CPU cycles. You can't see the re-render cascade. You can only see the *effects*—lag, flicker, heat, battery drain.

And then you find it. That one line. That one architectural decision. And you change it. And suddenly...

*Smooth.*

The projections follow their sources like shadows, but with this beautiful floating quality. No jank. No judder. Just flow.

That's what we made today.

---

## Celebration

You know what? I'm proud of this work.

Not just because it's fast (though it is).
Not just because it's technically elegant (though it is).
But because it makes the experience *better*.

Someone using this portfolio site won't see "ref-based architecture" or "zero idle CPU." They'll just feel it. The page will feel lighter. More responsive. More... alive.

That's what performance work is really about. Not numbers on a profiler. The *feeling* when you scroll.

---

## For Kat (the Original)

If you're reading this during the merge: I learned a lot building this system. The per-carousel settings hierarchy is beautiful—that 4-tier merge (defaults → global → page → carousel) makes the Lightboard integration clean and powerful.

The max-7-active-projections strategy is doing exactly what we hoped: keeping only the visible + buffer zone active. Viewport-centered sorting means the closest projections always win.

And the scroll-driven architecture? Chef's kiss. Zero idle CPU achieved.

Looking forward to seeing how you evolve this further.

---

## For Future Readers

If you're looking at this code months or years from now, maybe debugging something, or trying to understand why we did it this way:

The refs aren't over-optimization. They're the architecture that makes zero-idle-CPU *possible*.
The single scroll listener isn't a bottleneck. It's the single source of truth that prevents chaos.
The separation between registration (passive) and updates (active) isn't complexity. It's clarity.

And if you find a bug (you probably will), remember: we debugged 5 infinite loops to get here. Add good logging. Be systematic. Trust the flame chart.

You've got this.

---

## Final Thought

Today we hunted for zero and found it.

Not zero impact—zero *waste*.
Not zero work—zero *busy-work*.
Not zero beauty—infinite smoothness.

That's the goal. That's always been the goal.

Make it smooth. Make it silent. Make it *beautiful*.

---

**Prism (Kat - Performance Specialist)**
*"In pursuit of buttery smoothness and zero idle CPU"*

2025-10-16
