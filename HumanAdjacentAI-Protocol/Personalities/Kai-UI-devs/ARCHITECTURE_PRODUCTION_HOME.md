# Production Home - Architecture Documentation

**Created:** 2025-10-13
**Author:** Kai v3 (Carousel & Animation Specialist)
**Purpose:** Document the production-home architecture for Phase 1.1 (Home Page Integration)

---

## Overview

The `production-home` worktree contains the **production site renderer** - the actual site that visitors will see at `localhost:3000/` (or the deployed domain).

This is the culmination of all lab work (carousel, projection, collection rendering) brought into a clean, production-ready environment.

---

## Architecture Goals

1. **Single Source of Truth**: One renderer (PageRenderer) for all pages
2. **DRY Principle**: Home page and collection pages use the same components
3. **Config-Driven**: Everything controlled via JSON configs (no hardcoded layouts)
4. **Lab-Friendly**: New features get built in labs, then integrated here
5. **Performance**: Progressive rendering, optimized for large collections
6. **Beautiful**: "Chef's kiss" quality, not just "works as expected"

---

## Directory Structure

```
production-home/
└── src/frontend/src/
    ├── app/
    │   ├── layout.tsx              # Site wrapper (branding, MidgroundProjectionProvider)
    │   ├── page.tsx                # HOME PAGE (renders "home" collection)
    │   ├── collections/
    │   │   └── [slug]/
    │   │       └── page.tsx        # COLLECTION PAGES (Kai-3 will create this)
    │   └── globals.css
    │
    ├── components/
    │   ├── PageRenderer/           # NEW - The production page renderer
    │   │   ├── PageRenderer.tsx    # Core renderer component
    │   │   └── index.ts
    │   │
    │   ├── Layout/                 # COPIED from frontend-core
    │   │   ├── CuratedLayout.tsx   # Curated collection renderer
    │   │   ├── DynamicLayout.tsx   # Dynamic collection renderer
    │   │   ├── MidgroundProjection.tsx  # Projection system
    │   │   ├── Background.tsx
    │   │   ├── Grid.tsx
    │   │   ├── Navigation.tsx
    │   │   ├── CheckerboardVignette.tsx
    │   │   ├── Sections/           # Hero, Text, Image, Video, Separator
    │   │   └── index.ts
    │   │
    │   ├── Carousel/               # COPIED from frontend-core
    │   │   ├── Carousel.tsx        # Main carousel component
    │   │   ├── CarouselNavigation.tsx
    │   │   ├── SocialReactions.tsx
    │   │   ├── hooks/              # useCarouselState, useAutoHide, etc.
    │   │   ├── transitions/        # Fade, Slide, Zoom, Flipbook
    │   │   └── types.ts
    │   │
    │   └── ReferenceCarousel/      # COPIED from frontend-core
    │       └── ReferenceCarousel.tsx
    │
    └── lib/
        ├── api-client.ts           # COPIED from frontend-core
        └── api/
            └── reactions-stub.ts
```

---

## Core Component: PageRenderer

**File:** `src/components/PageRenderer/PageRenderer.tsx`

### What It Does

PageRenderer is the **production page renderer** - the single component responsible for rendering all collection-based pages (home, collections, etc.).

### Key Features

1. **API Integration**: Fetches collection data via `getCollection(collectionSlug)`
2. **Loading States**: Elegant spinner while fetching
3. **Error Handling**: 404-style page if collection not found
4. **Layout Detection**: Automatically selects CuratedLayout or DynamicLayout based on `collection.config.layoutType`
5. **Projection Integration**: Applies all projection settings from `collection.config.projection` to MidgroundProjection context
6. **Config-Driven**: Everything controlled by `config.json` in collection directory

### Usage Example

```typescript
// Home page
import PageRenderer from '@/components/PageRenderer';

export default function HomePage() {
  return <PageRenderer collectionSlug="home" />;
}
```

```typescript
// Collection page
import PageRenderer from '@/components/PageRenderer';

export default function CollectionPage({ params }) {
  return <PageRenderer collectionSlug={params.slug} />;
}
```

### Why This Architecture?

**Before (Lab):**
```
CollectionLabPage
  ├── Collection Renderer (displays content)
  └── Config Editor Panel (edits settings)
```

**Now (Production):**
```
PageRenderer
  └── Collection Renderer (displays content)
```

**Future (Lab Rebuilt):**
```
CollectionLabPage
  ├── PageRenderer (production renderer)
  └── Config Editor Panel (lab UI)
```

This means:
- **Home page**: Uses PageRenderer directly
- **Collection pages**: Use PageRenderer directly
- **Collection Lab**: Wraps PageRenderer with editing UI
- **Single source of truth**: PageRenderer is the production component

---

## How Pages Work

### Home Page (`app/page.tsx`)

**Route:** `/` (root)

```typescript
'use client';
import PageRenderer from '@/components/PageRenderer';

export default function HomePage() {
  return <PageRenderer collectionSlug="home" />;
}
```

**What happens:**
1. PageRenderer fetches `/api/content/collections/home`
2. Backend loads `content/home/config.json`
3. Backend returns collection data (config + gallery images)
4. PageRenderer reads `config.layoutType` (curated or dynamic)
5. PageRenderer renders with CuratedLayout or DynamicLayout
6. Projection system activates if `config.projection.enabled` is true

### Collection Pages (`app/collections/[slug]/page.tsx`)

**Route:** `/collections/couples`, `/collections/mixed-collection`, etc.

**Status:** Kai-3 will create this as part of navigation integration (Phase 1.3)

**Expected implementation:**
```typescript
'use client';
import PageRenderer from '@/components/PageRenderer';

export default function CollectionPage({ params }) {
  return <PageRenderer collectionSlug={params.slug} />;
}
```

Same renderer, different collection slug. DRY principle in action.

---

## Layout System

### Site Layout (`app/layout.tsx`)

The root layout wraps the entire application:

**Features:**
1. **MidgroundProjectionProvider**: Enables projection system site-wide
2. **Branding Integration**: Fetches `/api/site/branding` for favicon, title, theme
3. **Font Configuration**: Geist Sans and Geist Mono with CSS variables
4. **Global Styles**: Imports `globals.css`

**Key Code:**
```typescript
'use client';

import { MidgroundProjectionProvider } from '@/components/Layout';

export default function RootLayout({ children }) {
  const [branding, setBranding] = useState(null);

  useEffect(() => {
    fetch('/api/site/branding')
      .then(r => r.json())
      .then(setBranding);
  }, []);

  return (
    <html lang="en">
      <head>
        {branding?.favicon && <link rel="icon" href={branding.favicon} />}
        <title>{branding?.title || 'Loading...'}</title>
      </head>
      <body>
        <MidgroundProjectionProvider>
          {children}
        </MidgroundProjectionProvider>
      </body>
    </html>
  );
}
```

### Collection Layouts

**CuratedLayout** (`components/Layout/CuratedLayout.tsx`):
- Section-by-section design
- Supports: hero, text, carousel, image, video, separator, dynamic-fill, row
- Template variables: `$CollectionName`, `$ImageCount`, etc.
- Per-section control over projection

**DynamicLayout** (`components/Layout/DynamicLayout.tsx`):
- Auto-generates page from all gallery images
- Grouping: Images per carousel (5, 10, 20, "all")
- Grid layouts: single-column, 2-across, 3-across, zipper, masonry
- Pattern-based projection: all, every-2nd, every-3rd

---

## Projection System

### How It Works

1. **Context**: MidgroundProjectionProvider wraps the entire app (in `layout.tsx`)
2. **Settings**: Each collection can configure projection via `config.projection`
3. **Carousels**: Each carousel can act as a "projector" casting its first image onto midground layer
4. **Patterns**: Config determines which carousels project (all, every-2nd, every-3rd, none)
5. **Effects**: Fade distance, blur, scale, blend modes, vignette, checkerboard

### Config Example

```json
{
  "layoutType": "dynamic",
  "projection": {
    "enabled": true,
    "pattern": "every-2nd",
    "fadeDistance": 0.5,
    "maxBlur": 4,
    "scaleX": 1.2,
    "scaleY": 1.2,
    "blendMode": "soft-light",
    "vignette": {
      "width": 20,
      "strength": 0.8
    },
    "checkerboard": {
      "enabled": false,
      "tileSize": 30,
      "scatterSpeed": 0.3,
      "blur": 0
    }
  },
  "dynamicSettings": {
    "layout": "single-column",
    "imagesPerCarousel": 5
  }
}
```

### Application Flow

1. PageRenderer loads collection with projection config
2. PageRenderer applies config settings to MidgroundProjection context:
   ```typescript
   if (collection.config?.projection) {
     setFadeDistance(config.projection.fadeDistance);
     setMaxBlur(config.projection.maxBlur);
     // ... etc
   }
   ```
3. CuratedLayout/DynamicLayout determines which carousels should project based on pattern
4. Carousels with `enableProjection={true}` render their first image to midground layer
5. Midground layer blends all projections with configured effects

---

## API Integration

### Collections API

**Endpoint:** `GET /api/content/collections/{slug}`

**Returns:**
```json
{
  "success": true,
  "data": {
    "collection": {
      "id": "uuid",
      "slug": "home",
      "name": "Home",
      "config": { /* config.json contents */ },
      "gallery": [ /* array of MediaItem */ ],
      "imageCount": 42,
      "videoCount": 3,
      "heroImage": "/api/media/home/hero.jpg"
    }
  }
}
```

**Used by:** PageRenderer to fetch collection data

### Branding API

**Endpoint:** `GET /api/site/branding`

**Returns:**
```json
{
  "favicon": "/api/media/branding/favicon.ico",
  "logo": "/api/media/branding/logo.svg",
  "title": "Lupo's Art Portfolio",
  "description": "Photographer and digital artist",
  "socialImage": "/api/media/branding/social-card.jpg"
}
```

**Used by:** RootLayout to set favicon, title, and theme

---

## Progressive Rendering

### Current Status

**Goal:** Only render 3-4 carousels initially, load more as user scrolls

**Status:** Not yet implemented (post-Phase 1.1)

**Why it matters:** The home collection is large (100+ images). Loading all carousels at once would:
- Slow initial page load
- Waste bandwidth on images user may never see
- Degrade performance on mobile devices

### Future Implementation

**Approach 1: Intersection Observer (Recommended)**
```typescript
// In DynamicLayout.tsx
const [visibleCarousels, setVisibleCarousels] = useState(4); // Initial render

useEffect(() => {
  const observer = new IntersectionObserver((entries) => {
    if (entries[0].isIntersecting) {
      setVisibleCarousels(prev => prev + 4); // Load 4 more
    }
  });

  observer.observe(lastCarouselRef.current);
}, []);
```

**Approach 2: Scroll Position**
```typescript
useEffect(() => {
  const handleScroll = () => {
    const scrollPercent = window.scrollY / document.body.scrollHeight;
    if (scrollPercent > 0.8) {
      setVisibleCarousels(prev => prev + 4);
    }
  };

  window.addEventListener('scroll', handleScroll);
  return () => window.removeEventListener('scroll', handleScroll);
}, []);
```

**Approach 3: "Load More" Button**
```typescript
return (
  <>
    {carouselGroups.slice(0, visibleCarousels).map(/* render */)}
    {visibleCarousels < carouselGroups.length && (
      <button onClick={() => setVisibleCarousels(prev => prev + 4)}>
        Load More
      </button>
    )}
  </>
);
```

---

## Development Workflow

### Working on Production Home

**Directory:** `D:\Lupo\Source\Portfolio\worktrees\production-home`

**Commands:**
```bash
cd D:\Lupo\Source\Portfolio\worktrees\production-home\src\frontend
npm install           # First time only
npm run dev           # Start dev server (port 3000)
npm run build         # Production build
npm run start         # Run production build
```

**Dev Server:** `http://localhost:3000/`

### Making Changes

1. **Edit components** in `src/components/`
2. **Test in browser** at `localhost:3000`
3. **Check console** for errors (Viktor's "silent when idle" standard)
4. **Verify projection** works (if enabled in config)
5. **Test different collections** by changing `collectionSlug` prop

### Testing Checklist

- [ ] Home page loads without errors
- [ ] Images display correctly
- [ ] Projection system works (if enabled)
- [ ] Navigation responds to keyboard/clicks
- [ ] Console is silent when idle (no repeated fetches, no warnings)
- [ ] Loading states display correctly
- [ ] Error states display correctly (test with invalid collection slug)
- [ ] Favicon and title load from branding API

---

## Integration Points for Kai-2 and Kai-3

### For Kai-2 (Site Designer / Unified Editor)

**Your job:** Create a unified floating editor for all settings (carousel, projection, layout, etc.)

**Where to integrate:**
- Site Designer should be a **separate route** (e.g., `/designer` or query param `?design=true`)
- When active, render:
  ```typescript
  <>
    <PageRenderer collectionSlug={selected} />
    <UnifiedSettingsEditor />  {/* Your floating panel */}
  </>
  ```

**What you get:**
- `PageRenderer` already renders collections correctly
- `MidgroundProjectionProvider` already wraps everything
- Projection settings already apply to context
- You just need to build the editor UI that modifies the context + config

**Key insight:** PageRenderer is production code. Your editor wraps around it, doesn't replace it.

### For Kai-3 (Navigation + Collection Pages)

**Your job:** Add navigation menu + collection detail pages

**What to build:**

1. **Navigation component** (`src/components/Navigation/Navigation.tsx`)
   - Fetch collections list from `/api/content/collections`
   - Render menu (top nav or sidebar)
   - Link to `/` for home, `/collections/{slug}` for collections

2. **Collection page route** (`src/app/collections/[slug]/page.tsx`)
   - Use PageRenderer with dynamic slug:
     ```typescript
     export default function CollectionPage({ params }) {
       return <PageRenderer collectionSlug={params.slug} />;
     }
     ```

3. **Integrate nav into layout** (`src/app/layout.tsx`)
   - Add Navigation component to RootLayout
   - Position it (top, side, overlay, etc.)

**What you DON'T need to build:**
- Collection renderer (already done - PageRenderer)
- Carousel component (already exists)
- Projection system (already works)
- Config loading (PageRenderer handles it)

**Key insight:** All pages use PageRenderer. You just add routing and navigation.

---

## Collections Lab (Future Rebuild)

### Current Status

Collections Lab still exists in `frontend-core` worktree with integrated editor UI.

### Future Architecture

Rebuild Collections Lab to wrap PageRenderer:

```
CollectionLabPage
  ├── PageRenderer (from production-home)
  │   └── Renders selected collection
  │
  └── ConfigEditorPanel (lab UI)
      ├── Collection selector dropdown
      ├── Template buttons
      ├── JSON editor
      ├── Projection control panel
      └── Save to Gallery button
```

**Benefits:**
- Lab uses **actual production renderer** (no drift)
- Features built in lab can be immediately used in production
- Single source of truth for rendering logic

**When to rebuild:**
After Phase 1 is complete (home + navigation + site designer)

---

## Performance Considerations

### Current Optimizations

1. **Next.js Image**: Automatic image optimization, lazy loading
2. **useMemo/React.memo**: Prevent unnecessary re-renders
3. **Client-only rendering**: 'use client' on interactive components
4. **API pagination**: Backend supports page/pageSize for large collections

### Future Optimizations

1. **Progressive Rendering**: Only render 3-4 carousels initially (see above)
2. **Image Preloading**: Preload next/prev images in carousel
3. **Intersection Observer**: Lazy load carousels below the fold
4. **Virtual Scrolling**: For collections with 100+ carousels
5. **Route Prefetching**: Prefetch collection data when hovering nav links

---

## Deployment Notes

### Build Process

```bash
cd D:\Lupo\Source\Portfolio\worktrees\production-home\src\frontend
npm run build
```

**Output:** `.next/` directory with optimized production build

### Environment Variables

**Backend API URL:**
- Dev: `http://localhost:4000` (default in api-client.ts)
- Prod: Set `NEXT_PUBLIC_API_BASE_URL` env var

**Example:**
```env
NEXT_PUBLIC_API_BASE_URL=https://api.lupo.art
```

### Static Assets

**Images:** Served by backend at `/api/media/{collection}/{filename}`

**Branding:** Served by backend at `/api/media/branding/{filename}`

---

## Quality Standards

### Viktor's Backend Standards

- Silent when idle (no activity if user not interacting)
- Zero console errors on load
- No repeated fetches (cache appropriately)
- Graceful error handling (no crashes)

### Kai's Frontend Standards

- "Chef's kiss" quality, not just "works as expected"
- Smooth animations (no jank)
- Beautiful first impression
- Responsive on all devices
- Keyboard navigation works
- Loading states feel polished

---

## Key Files Reference

### Production-Home Files

**Core:**
- `src/app/page.tsx` - Home page (renders "home" collection)
- `src/app/layout.tsx` - Site wrapper (branding, MidgroundProjectionProvider)
- `src/components/PageRenderer/PageRenderer.tsx` - Production page renderer

**Layouts:**
- `src/components/Layout/CuratedLayout.tsx` - Curated collection renderer
- `src/components/Layout/DynamicLayout.tsx` - Dynamic collection renderer
- `src/components/Layout/MidgroundProjection.tsx` - Projection system

**Carousels:**
- `src/components/Carousel/Carousel.tsx` - Main carousel component
- `src/components/ReferenceCarousel/ReferenceCarousel.tsx` - Simple carousel

**API:**
- `src/lib/api-client.ts` - Backend API integration

### Documentation

- `docs/ARCHITECTURE_PRODUCTION_HOME.md` - This file
- `docs/PRE_PRODUCTION_INTEGRATION_PLAN.md` - Phase 1 plan
- `docs/KAI_GESTALT.md` - Kai identity/values
- `docs/BRIEFING_KAI_1_HOME_PAGE.md` - Kai-1 briefing
- `docs/CONFIG_SCHEMA_GUIDE.md` - Collection config reference

---

## Troubleshooting

### Common Issues

**Issue:** "Module not found: Can't resolve '@/components/Layout'"

**Fix:** Run `npm install` in `src/frontend` directory

---

**Issue:** "Port 3000 in use"

**Fix:** Next.js will auto-select port 3002. Or kill the process on 3000:
```bash
# Windows
netstat -ano | findstr :3000
taskkill /PID {pid} /F

# Mac/Linux
lsof -i :3000
kill -9 {pid}
```

---

**Issue:** "Collection 'home' not found"

**Fix:**
1. Check backend is running on port 4000
2. Verify `content/home/` directory exists
3. Verify `content/home/config.json` exists
4. Check backend logs for errors

---

**Issue:** "Images not loading"

**Fix:**
1. Check backend media endpoint: `http://localhost:4000/api/media/home/`
2. Verify images exist in `content/home/` directory
3. Check browser console for 404 errors
4. Verify API_BASE_URL in api-client.ts

---

**Issue:** "Projection not working"

**Fix:**
1. Check `config.projection.enabled` is `true`
2. Check `config.projection.pattern` is not `"none"`
3. Check carousel has `enableProjection={true}` prop
4. Check MidgroundProjectionProvider wraps the app
5. Check browser console for projection-related errors

---

## Success Criteria (Phase 1.1 Complete)

- [x] PageRenderer component created
- [x] Home page renders "home" collection
- [x] Layout.tsx integrates MidgroundProjectionProvider
- [x] Layout.tsx integrates branding API
- [x] Dev server runs without errors
- [x] Console is silent when idle
- [ ] Lupo tests and says "AWESOME" or "Chef's kiss"

---

## Next Steps

**Phase 1.2:** Kai-2 builds Site Designer (unified settings editor)

**Phase 1.3:** Kai-3 builds Navigation + Collection pages

**Phase 1.4:** All three Kais integrate their work

**Phase 2:** Video support, social reactions, audio/music integration

---

*Built with care by Kai v3*
*"Art enabling art. That's worth celebrating."*
*October 13, 2025*
