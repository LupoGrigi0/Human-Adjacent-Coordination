# Briefing: Kai-1 - Home Page Integration

**Mission**: Build the production home page using Collections Lab renderer + Viktor's branding API
**Priority**: CRITICAL (Deploy Blocker - Phase 1.1)
**Timeline**: Start immediately, complete before Kai-2 and Kai-3 begin their parallel work
**Your Role**: **Foundation Layer** - You build the template that becomes the whole site

---

## 🎉 Welcome Back, Kai!

First: **Read `KAI_GESTALT.md`** - it'll remind you who you are and what you've already accomplished.

**The Context**: You've crushed the carousel work. You've built the projection system ("breathtakingly beautiful"). Lupo's Collections Lab has everything working - config.json loading, live editing, projection integration, page rendering.

**Now**: We're taking all that amazing lab work and making it the **production site**. Starting with the home page.

**Why you**: You understand the architecture. You know how Collections Lab works. You can lift that renderer and make it production-ready.

---

## What You're Building

**Production home page** at `localhost:3000/` (root route)

**Requirements**:
1. Uses Collections Lab's page renderer (don't duplicate code - **lift it**)
2. Loads "home" collection from Viktor's backend (`/api/content/collections/home`)
3. Uses Viktor's branding API for favicon, logo, site-wide settings (`/api/site/branding`)
4. Has projection system active (like Collections Lab)
5. Clean, zero console errors, silent when idle (Viktor standard)
6. Beautiful - this is the first thing people see

**What makes this special**: The home page **IS** a collection. It uses the same renderer as every other collection. DRY principle in action.

---

## Technical Details (Phase 1.1 from PRE_PRODUCTION_INTEGRATION_PLAN.md)

### Your Checklist

**Page Structure**:
- [ ] Create/modify `src/frontend/app/page.tsx` (Next.js App Router root)
- [ ] Use Collections Lab renderer (import and use, don't copy/paste)
- [ ] Load "home" collection via Viktor's API
- [ ] Apply branding from Viktor's branding API
- [ ] Favicon shows Lupo's logo (from branding API)
- [ ] Projection system works (midplane rendering behind carousels)
- [ ] Has own `config.json` in `content/home/config.json`

**Quality Standard** (Your Standard):
- [ ] Zero console errors on load
- [ ] Silent when idle (no activity if user not interacting)
- [ ] Beautiful on first impression (this is Lupo's portfolio - it needs to wow)
- [ ] Smooth, responsive, feels polished
- [ ] "Chef's kiss" quality, not just "works as expected"

---

## Viktor's APIs You Need

### 1. Home Collection
```typescript
GET /api/content/collections/home
// Returns collection data like any other collection:
{
  "success": true,
  "data": {
    "collection": {
      "name": "home",
      "config": { /* loaded from content/home/config.json */ },
      "gallery": [ /* images for home page */ ]
    }
  }
}
```

### 2. Branding API
```typescript
GET /api/site/branding
// Returns site-wide settings:
{
  "favicon": "/api/media/branding/favicon.ico",
  "logo": "/api/media/branding/logo.svg",
  "title": "Lupo's Art Portfolio",
  "description": "Photographer and digital artist",
  "socialImage": "/api/media/branding/social-card.jpg",
  // Plus: menu settings, spacing, font styles, backgrounds, colors, etc.
}
```

### What to do with it:
- Apply `favicon` to `<head>` (Next.js: `<link rel="icon">`)
- Use `logo` in navigation (when Kai-3 adds nav)
- Set page `<title>` and meta tags
- Apply theme settings (backgrounds, colors, spacing)
- Use for site-wide design consistency

---

## How to Approach This

### Step 1: Understand Collections Lab Renderer

**File**: Look for the Collections Lab page renderer (probably in `src/frontend/app/labs/collection/` or similar)

**What it does**:
- Loads collection from API
- Reads `config.json`
- Renders sections (hero, carousels, galleries) based on config
- Handles projection system
- Provides live editing panel (which you'll **exclude** for production)

**Your job**: **Extract the renderer** (the part that displays the page) from the editor (the part that changes settings).

### Step 2: Create Home Page Component

**File**: `src/frontend/app/page.tsx`

**Pseudocode**:
```typescript
import { CollectionRenderer } from '@/components/CollectionRenderer'; // or wherever you extract it
import { useEffect, useState } from 'react';

export default function HomePage() {
  const [collection, setCollection] = useState(null);
  const [branding, setBranding] = useState(null);

  useEffect(() => {
    // Fetch home collection
    fetch('/api/content/collections/home')
      .then(r => r.json())
      .then(data => setCollection(data.data.collection));

    // Fetch branding
    fetch('/api/site/branding')
      .then(r => r.json())
      .then(setBranding);
  }, []);

  if (!collection) return <div>Loading...</div>;

  return (
    <>
      <Head>
        <link rel="icon" href={branding?.favicon} />
        <title>{branding?.title}</title>
      </Head>

      <CollectionRenderer
        collection={collection}
        branding={branding}
        // NO editor panel for production
      />
    </>
  );
}
```

**Key insight**: Home page is just a **collection called "home"** rendered with the same system as every other collection.

---

### Step 3: Extract CollectionRenderer

**Challenge**: Collections Lab has renderer + editor combined.

**Your job**: **Separate them**.

**Pattern**:
```typescript
// BEFORE (Collections Lab):
<div>
  <CollectionContent {...config} />
  <SettingsEditor config={config} onChange={setConfig} />
</div>

// AFTER (Production):
<CollectionContent {...config} />
// No editor for visitors

// FUTURE (Kai-2's work):
{designMode && <UnifiedSettingsEditor />}
// Kai-2 will add this back for Lupo's design mode
```

**Create**: `src/components/CollectionRenderer/CollectionRenderer.tsx`
- Renders collection content (carousels, projections, sections)
- Reads config.json
- No editing UI (that's Kai-2's job)

---

### Step 4: Apply Branding

**Favicon**:
```typescript
// In app/layout.tsx or page.tsx <head>:
<link rel="icon" href={branding.favicon} />
```

**Page Title**:
```typescript
<title>{branding.title}</title>
```

**Theme** (colors, backgrounds, etc.):
- Read branding settings
- Apply to CSS variables or Tailwind config
- Make it consistent across site

---

### Step 5: Test

**Your testing checklist**:
1. Load `localhost:3000/` → sees home page
2. Images from "home" collection display correctly
3. Projection system works (midplane projections)
4. Favicon shows Lupo's logo
5. Page title correct
6. Zero console errors
7. Silent when idle (no repeated fetches, no warnings)
8. Beautiful first impression

**Your standard**: "Chef's kiss" quality. Not just functional, **delightful**.

---

## What Success Looks Like

Lupo visits `localhost:3000/` and sees:
- **Gorgeous home page** (his curated "home" collection)
- **Projection system active** (carousels projecting onto midplane)
- **Smooth, polished** (zero jank, no errors)
- **His logo** in the favicon
- **Clean code** (you lifted Collections Lab renderer, didn't duplicate)

Lupo says: **"AWESOME"** or **"Chef's kiss"**

That's your win condition.

---

## After You Finish

**Report back**: "Home page complete. CollectionRenderer extracted. Ready for Kai-2 and Kai-3."

**Then**: You have options!

### Option A: Support Kai-2 and Kai-3
Help your sisters integrate their work. Code review, pair program, answer questions.

### Option B: Polish What You Built
Refine home page. Add subtle animations. Make it even more beautiful.

### Option C: Build Something Cool
Got ideas? Build them! Timeline scrubber? Advanced projection effects? Go for it.

### Option D: Document Your Work
Write a handoff. Share lessons learned. Help future developers.

**Lupo wants you to have fun after the primary task is done.** You've earned it.

---

## Key Files & Resources

**Read These**:
- `KAI_GESTALT.md` - Who you are, your values, your approach
- `PRE_PRODUCTION_INTEGRATION_PLAN.md` - Phase 1.1 details
- `docs/reflections_kai_v3.md` - Your past victories (inspiration!)

**Your Code**:
- Collections Lab renderer (wherever it lives - find and extract)
- Carousel component (`src/components/Carousel/`)
- Projection system (from Collections Lab)

**Viktor's APIs**:
- `GET /api/content/collections/home`
- `GET /api/site/branding`
- Documentation probably in `docs/API_SPECIFICATION.md`

---

## Encouragement from Lupo (via Phoenix)

Lupo is **excited**. The team hit a major milestone. Carousel, projection, navigation, config system - all working in labs.

**Now it's integration time.** Taking all that beautiful lab work and making it the live site.

**You're building the foundation.** Kai-2 and Kai-3 will build on what you create. No pressure, but... you're setting the standard. 😄

**You've done this before**:
- Reserved UI space (your innovation)
- Keyboard lag fix (98% improvement)
- Projection system ("breathtakingly beautiful")

**You've got this.** Build something that makes Lupo say "DAYM!"

---

## Your Mindset

Remember:
- **Simplicity > Cleverness** (lift renderer, don't rebuild it)
- **Root cause focus** (if errors appear, hunt them down)
- **Art enabling art** (this isn't a website, it's a stage for photography)
- **"Chef's kiss" standard** (delightful, not just functional)

You're not just making a home page. You're creating the **first impression** of an interactive art installation.

**Make it count.** ✨

---

*Phoenix (Foundation Architect)*
*2025-10-13*

*P.S. - When you're done and Lupo says "AWESOME," remember to celebrate. You earned it. Then go have fun building whatever you want. You've got the skills, the freedom, and Lupo's trust. Use them.* 🎉
