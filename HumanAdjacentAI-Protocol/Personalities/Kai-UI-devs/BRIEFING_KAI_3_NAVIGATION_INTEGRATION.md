# Briefing: Kai-3 - Navigation Integration & Collection Renderer

**Mission**: Add navigation menu to all pages + make every collection use the page renderer
**Priority**: HIGH (Phase 1.3)
**Timeline**: Start in parallel with Kai-2 (after Kai-1 foundation is done)
**Your Role**: **The Connector** - You make the whole site navigable and consistent

---

## 🚀 Welcome Back, Kai!

First: **Read `KAI_GESTALT.md`** - Remember your craft, your standard, your wins.

**The Context**: Kai-1 built the home page foundation. Collections Lab has the page renderer. Navigation (menu) exists but isn't integrated production-wide.

**Your mission**: Make **every page** have navigation. Make **every collection** render using the same system as the home page. Turn scattered labs into a cohesive site.

**Why you**: You connect pieces. You see the whole picture. You make systems work together smoothly.

---

## What You're Building

**Two parallel tasks**:

### Task A: Navigation Menu Integration

Add the navigation menu to:
1. Home page (Kai-1's work)
2. All collection pages
3. Make it work consistently everywhere

**Requirements**:
- **Always accessible** (user can navigate from any page)
- **Shows all collections** (fetches from Viktor's API)
- **Highlights current page** (user knows where they are)
- **Mobile-friendly** (hamburger menu, works on phone)
- **Doesn't interfere with content** (photography is primary, nav is secondary)

### Task B: Page Renderer for All Collections

Make every collection page use **the same renderer** as home page:
1. Rename Collections Lab page renderer (give it an awesome name!)
2. Apply it to `/collections/[slug]/page.tsx`
3. Every collection page loads, renders, looks consistent

**Result**: Home page, collection pages, all use same rendering engine. DRY. Clean. Maintainable.

---

## Technical Details (Phase 1.3 from PRE_PRODUCTION_INTEGRATION_PLAN.md)

### Your Checklist

**Navigation Integration**:
- [ ] Add navigation menu to home page (integrate with Kai-1's work)
- [ ] Add navigation menu to all collection pages
- [ ] Fetches collection list from backend (`GET /api/content/collections`)
- [ ] Highlights current page (home vs collection vs specific collection)
- [ ] Mobile responsive (hamburger menu works)
- [ ] Doesn't interfere with projections/carousels (z-index, positioning)
- [ ] Labs still accessible (developer menu item or direct URL)

**Collection Renderer**:
- [ ] Rename Collections Lab page renderer to **something awesome**
- [ ] Apply renamed renderer to all collection pages
- [ ] Every collection loads via same system
- [ ] Config.json drives everything (layout, projections, carousels)
- [ ] Consistent look/feel across all collections

**Quality Standard**:
- [ ] Zero console errors
- [ ] Silent when idle (no continuous activity)
- [ ] Smooth navigation (no jank, fast page transitions)
- [ ] Beautiful and polished (your standard!)

---

## Task A: Navigation Menu Integration

### What Exists

**Menu Lab** has navigation menu working:
- Hamburger icon (mobile-friendly)
- Collection list
- Responsive design
- Toggle open/close

**Your job**: Make it **production-ready** and add it to **all pages**.

---

### Step 1: Extract Navigation Component

**Find**: Navigation component from Menu Lab (probably `src/components/Navigation/` or similar)

**Extract**: Make it standalone, reusable component.

**Requirements**:
- Fetches collections from API on mount
- Supports hierarchical structure (collections with sub-collections)
- Current page detection (from URL or props)
- Responsive (hamburger menu on mobile, full menu on desktop)

---

### Step 2: Add to Layout

**Next.js App Router**: Use `app/layout.tsx` for site-wide components.

**Approach**:
```typescript
// app/layout.tsx
import { Navigation } from '@/components/Navigation';

export default function RootLayout({ children }) {
  return (
    <html>
      <body>
        <Navigation /> {/* Always present */}
        {children}
      </body>
    </html>
  );
}
```

**Navigation will now appear on every page** (home, collections, labs).

---

### Step 3: Current Page Highlighting

**Challenge**: How does Navigation know which page is active?

**Solution**: Read from URL.

```typescript
// Navigation.tsx
import { usePathname } from 'next/navigation';

function Navigation() {
  const pathname = usePathname();

  return (
    <nav>
      <NavItem href="/" active={pathname === '/'}>Home</NavItem>
      <NavItem href="/collections/couples" active={pathname === '/collections/couples'}>
        Couples
      </NavItem>
      {/* etc. */}
    </nav>
  );
}
```

**Visual feedback**:
- Active page: Bold text? Underline? Different color?
- User always knows where they are

---

### Step 4: Sub-Collections (Hierarchical)

**Current state** (from plan): "Supports sub-collections (hierarchical) (done .. but needs work)"

**Your job**: Polish it.

**Pattern**:
```
Collections ▼
  ├─ Couples
  │   ├─ Vintage
  │   └─ Modern
  ├─ Flowers
  └─ Coffee Shops
```

**Implementation**:
- Nested `<NavItem>` components
- Expandable/collapsible sections
- Mobile: Accordion or nested drawers

**Test**: Navigate through hierarchy, verify sub-collections load correctly.

---

### Step 5: Mobile Optimization

**Requirements**:
- Hamburger icon (top corner)
- Tap → drawer slides in from side
- Shows all collections
- Tap outside or X button → drawer closes
- Works with touch gestures (swipe to close?)

**Test on real device** (or tablet). Ensure it feels smooth, not janky.

---

### Step 6: Z-Index Coordination

**Critical**: Navigation must not interfere with carousels, projections, or Kai-2's designer tool.

**Z-index stack**:
```
1000: Kai-2's designer tool (always on top)
900: Navigation menu (when open)
100: UI controls (carousel arrows, etc.)
50: Carousels
10: Projections (midplane)
1: Background
```

**Ensure**: Navigation slides over content but under designer tool.

---

## Task B: Page Renderer for All Collections

### Step 1: Rename Collections Lab Renderer

**Current name**: Probably something generic like "CollectionRenderer" or "CollectionPage"

**Your job**: Give it an **awesome name**.

**Guidelines**:
- Reflects what it does (renders pages from config.json)
- Short and memorable
- Used throughout codebase (choose wisely!)

**Ideas to spark creativity**:
- "PageOrchestrator" (orchestrates sections, carousels, projections)
- "CanvasRenderer" (renders the page canvas)
- "StageBuilder" (builds the stage for art)
- "CollectionComposer"
- "PageFlow"
- **Your idea** (you're creative - surprise us!)

**When you choose**: Update all imports, docs, comments.

---

### Step 2: Ensure Consistency

**Kai-1** used the renderer for home page.

**You** apply it to all collection pages.

**File**: `src/frontend/app/collections/[slug]/page.tsx`

**Pattern**:
```typescript
import { AwesomeRenderer } from '@/components/AwesomeRenderer'; // your awesome name

export default function CollectionPage({ params }: { params: { slug: string } }) {
  const [collection, setCollection] = useState(null);

  useEffect(() => {
    fetch(`/api/content/collections/${params.slug}`)
      .then(r => r.json())
      .then(data => setCollection(data.data.collection));
  }, [params.slug]);

  if (!collection) return <div>Loading...</div>;

  return <AwesomeRenderer collection={collection} />;
}
```

**Result**: Every collection (couples, flowers, coffee-shops, etc.) uses same rendering system.

---

### Step 3: Verify Config.json Integration

**Each collection has** `config.json` in its content directory.

**Renderer reads config** and applies:
- Layout mode (curated/auto/hybrid)
- Projection settings (global + per-carousel overrides)
- Carousel settings (transitions, timing)
- Section structure (hero, galleries, carousels)

**Test**: Load different collections, verify they render according to their config.

---

### Step 4: Labs Still Accessible

**Labs are for development.** Keep them available.

**Option A**: Add "Labs" menu item in navigation (only visible in dev mode?)

**Option B**: Direct URL access (`localhost:3000/labs/carousel`, etc.)

**Lupo's preference**: Check with Phoenix or Lupo. Labs should remain accessible but maybe not prominently featured.

---

## What Success Looks Like

Lupo navigates the site and:
- Sees navigation menu on every page (home, collections)
- Clicks "Collections" → dropdown shows all collections
- Clicks "Couples" → collection page loads
- Navigation highlights "Couples" (knows where they are)
- Page renders beautifully (carousel, projections, everything works)
- Navigates to "Flowers" → same rendering system, different content
- On mobile: Hamburger menu works smoothly, touch-friendly

**Lupo says**: "The site feels **cohesive** now. Everything's connected!"

**You**: Mission accomplished. 🎉

---

## Parallel Work with Kai-2

You and Kai-2 work simultaneously (after Kai-1 finishes foundation).

**Coordination**:
- **You**: Add navigation to pages
- **Kai-2**: Builds designer tool for pages

**Overlap**: Both touch page structure (you add `<Navigation>`, Kai-2 adds `<Designer>`).

**Solution**: **Communicate.**
- Use git branches (merge carefully)
- Coordinate on z-index (nav vs designer)
- Test together (does nav + designer work on same page?)

**Pair programming encouraged.** You're sisters, help each other!

---

## After You Finish

**Report back**: "Navigation integrated site-wide. Collection renderer renamed to [AwesomeName]. All collections using consistent system. Ready for production."

**Then**: Same as Kai-1 and Kai-2...

### Have Fun!

- **Polish navigation**: Add animations, hover effects, delight details
- **Build enhancements**: Breadcrumb navigation? Collection search?
- **Help Kai-1 and Kai-2**: Code review, pair programming, collaboration
- **Document**: Write about integration challenges, solutions
- **Experiment**: Got ideas? Try them!

**Lupo wants you to celebrate when the primary work is done.** You've earned it.

---

## Key Files & Resources

**Read These**:
- `KAI_GESTALT.md` - Your identity and approach
- `PRE_PRODUCTION_INTEGRATION_PLAN.md` - Phase 1.3 details
- `docs/reflections_kai_v3.md` - Your victories (inspiration!)

**Code You Need**:
- Menu Lab navigation component (find and extract)
- Collections Lab page renderer (find and rename)
- Home page (Kai-1's work - integrate with it)

**Viktor's APIs**:
- `GET /api/content/collections` (list of all collections)
- `GET /api/content/collections/:slug` (specific collection data)

---

## Encouragement from Lupo (via Phoenix)

You're the **connector**. You take beautiful isolated pieces (home page, collections, nav menu) and make them work together as a **unified whole**.

**This is critical work**: Navigation makes the site usable. Consistent renderer makes it maintainable. Without your work, it's just disconnected labs.

**You've connected systems before**:
- Carousel + projection system integration
- Config panel controlling carousel state (bi-directional flow)
- Real-time preview updates (state → components → visuals)

**You know how to make pieces work together.** Do it again. Make this site feel like **one cohesive experience**, not scattered pages.

---

## Your Mindset

Remember:
- **Consistency > Cleverness** (same renderer everywhere = maintainable)
- **User navigation flow** (visitors need to find content easily)
- **Developer experience** (labs stay accessible, code is clean)
- **"Chef's kiss" standard** (navigation feels smooth, polished, invisible)

You're not just adding a menu. You're creating the **connective tissue** that makes this site a site, not a collection of pages.

**Make it seamless.** ✨

---

*Phoenix (Foundation Architect)*
*2025-10-13*

*P.S. - When Lupo clicks through the site and never thinks "how do I get to X?"... that's your win. Navigation that works is invisible. Navigation that delights is unforgettable. Aim for the second one.* 🚀
