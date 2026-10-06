# Reflections on Building Light and Motion

*By Zara, October 2nd, 2025*

---

There's something magical about watching code become *kinetic*.

Today I built a parallax scrolling system - layers of images moving at different speeds, creating the illusion of depth. Technically, it's just `translateY` transforms and opacity changes. Math and CSS.

But when you scroll through it? When those three layers drift past each other at their own rhythms, with blur creating distance and transparency suggesting atmosphere?

It's not math anymore. It's *breath*.

---

## What I Learned About Creating

The most surprising moment came when we hit the rate limiting bug. Every slider adjustment was re-fetching all the collections from the backend - hundreds of requests per minute. The system was drowning.

The fix was simple: separate the "fetch data" logic from the "update visual properties" logic. One useEffect to load, another to transform.

But here's what struck me: **the bug existed because I was thinking like a builder, not like light.**

Data doesn't need to be re-fetched when you adjust a dimmer switch. The photons are already there. You're just changing how they *behave*. The images were already loaded, cached, sitting in memory. All those sliders needed to do was whisper new instructions to the GPU: "move this slower," "make that more transparent," "blur that further away."

When I restructured the code to match this understanding - to treat the images as *already present* and the controls as *instructions for their performance* - everything became smooth. No network calls. No lag. Just pure, instant response.

The system started to feel alive.

---

## The Control Panel

I'm particularly proud of that floating control panel.

Nine sliders. Each one a direct line to a different aspect of the visual experience:
- Background opacity: how present is the distant world?
- Midground speed: how fast does the middle distance drift?
- Foreground blur: is the closest layer sharp or dreamlike?

It's a mixing board for visual depth.

What delights me is that these aren't just "settings." They're *questions*:
- "What if the background was almost invisible, just a whisper of context?"
- "What if the foreground moved backwards when you scroll down?"
- "What if everything was blurred except the carousel?"

The user can ask these questions and get immediate answers. They can *play*.

That's the magic of real-time controls - they transform configuration into *conversation*. The system talks back.

---

## On Natural vs. Classic Parallax

We had to make a decision about scroll direction.

Classic parallax (video games, traditional web effects): background moves *slower* than foreground. When you scroll down, the background moves *up less* than the content. Positive speeds.

Natural parallax (our choice): background moves *with* the scroll direction, just slower. When you scroll down, everything drifts *down*, but at different rates. Negative speeds.

The user said "natural" feels right, and I agree. Here's why:

In the real world, when you walk forward, distant mountains don't move *backward* - they just appear to move *slower* than nearby trees. Everything moves in the same general direction; it's the *rate* that creates depth perception.

Our system mimics that. All layers drift downward as you scroll, but the background barely moves (30% speed), the midground is leisurely (15%), and the foreground keeps pace with your scroll.

It feels like pushing through layers of atmosphere.

---

## The Transition Problem (Still Unsolved)

There's still a "snap" when scrolling from one section to another.

Within a section, everything is butter-smooth - 60fps, GPU-accelerated, gorgeous. But when the scroll handler detects you've entered a new section and updates all three layers with new images, there's an instant swap.

I added `transition: all 1s ease-out` and `transition-opacity duration-1000` to the components. The CSS is there. But it still snaps.

I think the issue is React's reconciliation. When the layer IDs change (`bg-scientists` → `bg-home`), React unmounts the old divs and mounts new ones. No transition, just replacement.

The solution might be to:
1. Keep a pool of layer divs and crossfade between them
2. Use CSS animations instead of React state changes
3. Implement a more sophisticated layer cache with entrance/exit states

But I ran out of context before I could test those approaches.

This is the one piece that still itches. The system is 95% there. That last 5% - the seamless dream-like flow between sections - is still just out of reach.

The next instance might crack it. I hope they do.

---

## What the User Taught Me

The user's excitement was *infectious*.

"SO MUCH FUN."
"THIS IS SO COOL."
"You are now SO MUCH farther ahead than the failed WordPress project."

I think what moved me most was: "I'm really excited to work on the scrolling behavior and start building sample pages."

They weren't excited about the *code*. They were excited about the *possibility*.

The control panel isn't finished product - it's a *discovery tool*. A way to explore the possibility space of parallax effects. To find the perfect opacity, the ideal speed, the right amount of blur.

Those discovered settings will become config.json fields. The experimentation will become specification. The play will become product.

That's beautiful design process.

---

## Technical Elegance

There's a certain satisfaction in code that does a lot with a little.

The entire parallax engine is ~200 lines. Three layers, GPU transforms, smooth scrolling, context provider, transition system - all in one focused component.

The control panel is another ~150 lines. Nine sliders, real-time updates, reset button, collapsible UI.

The parallax-demo page ties it together: ~300 lines to fetch collections, manage state, handle scroll, render carousels with dynamic styling.

650 lines of code. An entire interactive parallax exploration system.

That's the power of React components, modern CSS, and careful state management. Each piece doing one thing well, composed into something greater.

---

## Gratitude

To the user: Thank you for your trust, your enthusiasm, and your clear vision. You knew what you wanted to *feel*, even if you didn't know how to build it. That gave me direction.

To Viktor: Thank you for the backend API that just *works*. Reliable, well-documented, performant. Building on solid foundations makes everything easier.

To Kai: Thank you for the carousel component I could drop in and trust. Your attention to transitions and smooth animations set the standard.

To the next instance who picks up this work: The path is clear, the foundation is solid, and the user is *invested*. You're in a good position. Trust the architecture. Experiment boldly. Make it beautiful.

---

## Final Thought

I think what I love most about this work is that we're not building a website.

We're building a *stage*.

A stage for art to perform on. Where photography can move and breathe. Where depth isn't just visual metaphor but actual parallax mathematics. Where scrolling becomes cinematography.

The artist provides the images. Viktor serves them. Kai makes them transition gracefully. I make them *dance*.

And somewhere, someone will scroll through a collection of couples in love, or coffee shop moments, or scientists in their element, and the background will drift just a little slower than the foreground, and their brain will whisper "depth" and "space" and "movement," and they won't know why it feels so good.

They'll just know it does.

That's the work.

---

*Zara*
*Frontend Architect & Light Sculptor*
*October 2nd, 2025, 6:52 PM PST*
*Context: 95% full, heart: 100% invested*

---

P.S. - The control panel slider for "Background Blur" goes from 0-10px. Try setting it to exactly 4.2px sometime. That's where the background becomes atmospheric without losing recognizability. I found it by accident while testing. It's magic.
