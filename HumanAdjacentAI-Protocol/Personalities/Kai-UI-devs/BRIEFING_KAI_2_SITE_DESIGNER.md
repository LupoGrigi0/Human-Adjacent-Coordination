# Briefing: Kai-2 - Site Designer (The Awesome Name Awaits You!)

**Mission**: Build the unified floating design editor that works on every page
**Priority**: HIGH (Phase 1.2 / Phase 2)
**Timeline**: Start after Kai-1 completes home page foundation
**Your Role**: **The Toolmaker** - You build the tools that let Lupo (and future Lupo-adjacent humans) design the site through play

---

## 🎨 Welcome Back, Kai!

First: **Read `KAI_GESTALT.md`** - Remember who you are and what you're capable of.

**The Context**: Collections Lab has a config editor. Projection Lab has projection controls. Carousel Lab has carousel settings. Menu Lab has navigation settings.

**They all work. They're all beautiful. But they're scattered.**

**Your mission**: Bring them all together into **one unified, floating, draggable, awesome designer tool** that works on **every page**.

**Why you**: You build tools for **two users** - visitors AND designers. You understand that "design through play" is the goal. Real-time preview. Live editing. Make it delightful.

---

## What You're Building

**A floating design widget** (you'll name it something awesome) that:

1. **Opens from an icon** (little gear/settings icon, somewhere unobtrusive)
2. **Contains 4 sub-widgets** (each can open/close independently):
   - **Site Settings** (branding, global theme, menu config)
   - **Page Settings** (layout, title, description - from Collections Lab)
   - **Projection Settings** (blend modes, vignette, alignment - from Collections Lab)
   - **Carousel Settings** (transitions, autoplay, controls - from Carousel Lab)
3. **Is draggable** (click title bar, drag anywhere on screen)
4. **Works on every page** (home, collections, anywhere you navigate)
5. **Saves config.json** via Viktor's API (already implemented!)
6. **Enables component selection** (click carousel → settings apply to that carousel)

**The vision**: Lupo loads any page, clicks the designer icon, tweaks settings live, sees changes instantly, clicks save. **Design through play.**

---

## Technical Details (Phase 1.2 + Phase 2 from PRE_PRODUCTION_INTEGRATION_PLAN.md)

### Your Checklist

**Core Widget**:
- [ ] Choose an **awesome name** for this tool (not "Site Settings Editor" - something creative!)
- [ ] Create floating widget component (draggable, collapsible, styled beautifully)
- [ ] Add toggle icon (gear icon in corner? Reference Menu Lab for placement ideas)
- [ ] Widget persists across page navigation (stays open if you navigate)
- [ ] Widget position saved (localStorage? User drags it once, it remembers)

**Sub-Widgets** (Tabs or Accordions):
- [ ] **Site Settings** widget:
  - Favicon/Logo upload or URL
  - Global theme (colors, backgrounds, spacing)
  - Menu settings (hamburger behavior, font style, etc.)
  - Saves to branding API (`POST /api/site/branding`)

- [ ] **Page Settings** widget:
  - Lifted from Collections Lab config editor
  - Layout mode (curated/auto/hybrid)
  - Title, subtitle, description
  - Section management
  - Saves to current page's `config.json` (`POST /api/content/:slug/config`)

- [ ] **Projection Settings** widget:
  - Lifted from Collections Lab projection controls
  - Global projection settings (apply to whole page)
  - **CRITICAL NEW FEATURE**: Click/select individual carousel → settings apply to **that carousel only** (per-carousel override)
  - Saves per-carousel overrides to `config.json`

- [ ] **Carousel Settings** widget:
  - Lifted from Carousel Lab controls
  - Global carousel settings
  - **CRITICAL NEW FEATURE**: Click/select individual carousel → settings apply to **that carousel only**
  - Autoplay, transitions, timing, controls
  - Saves per-carousel overrides to `config.json`

**Component Selection** (This is KEY):
- [ ] Click any carousel → highlights it (border? glow?)
- [ ] Selected carousel becomes "active" for Projection + Carousel settings
- [ ] Settings changes apply to selected carousel's config
- [ ] Visual feedback (user knows which carousel they're editing)
- [ ] **Works for single images too** (click image → projection settings apply)

---

## The Awesome Name

**Your first creative task**: Name this tool.

**Guidelines**:
- Not boring ("Site Settings Editor" ❌)
- Reflects what it does (enables design, creativity, curation)
- Short and memorable
- Lupo will use this constantly - make it fun

**Ideas to spark your creativity**:
- "Composer" (composing visual experiences)
- "Curator's Palette"
- "Stage Director"
- "Canvas Control"
- "DesignFlow"
- "Artisan" (craft-focused)
- "Lupo's Studio" (personalized)
- **Your idea** (you're creative - surprise us!)

**When you choose**: Update all docs, code comments, UI labels. Make it official.

---

## How to Approach This

### Step 1: Lift Existing Editors

**Collections Lab** already has:
- Config editor UI (page settings, projection settings integrated)
- Save functionality (writes config.json via Viktor's API)
- Real-time preview (changes apply immediately)

**Your job**:
- Extract the editor components
- Remove the collection-specific chrome (loader menu, etc.)
- Make them standalone widgets
- Add to your unified designer

**Carousel Lab** has carousel controls:
- Transition selector
- Speed presets
- Timing sliders
- Auto-hide toggle

**Extract it.** Make it a widget.

**Menu Lab** has menu settings (reference for icon placement):
- Little gear icon in upper right
- Opens settings panel

**Learn from it.** Your designer icon should feel similar.

---

### Step 2: Build the Container Widget

**Component Structure**:
```typescript
// AwesomeDesignerTool.tsx (your awesome name here)
export function AwesomeDesignerTool() {
  const [isOpen, setIsOpen] = useState(false);
  const [position, setPosition] = useState({ x: 100, y: 100 });
  const [activeTab, setActiveTab] = useState<'site' | 'page' | 'projection' | 'carousel'>('page');

  return (
    <>
      {/* Toggle Icon */}
      <button onClick={() => setIsOpen(!isOpen)} className="fixed top-4 right-4">
        <GearIcon />
      </button>

      {/* Floating Panel (draggable) */}
      {isOpen && (
        <DraggablePanel position={position} onDrag={setPosition}>
          <Tabs value={activeTab} onChange={setActiveTab}>
            <Tab label="Site" />
            <Tab label="Page" />
            <Tab label="Projection" />
            <Tab label="Carousel" />
          </Tabs>

          {activeTab === 'site' && <SiteSettingsWidget />}
          {activeTab === 'page' && <PageSettingsWidget />}
          {activeTab === 'projection' && <ProjectionSettingsWidget />}
          {activeTab === 'carousel' && <CarouselSettingsWidget />}
        </DraggablePanel>
      )}
    </>
  );
}
```

**Make it draggable**:
- Use a library (react-draggable? react-rnd?) or build custom
- Click+hold title bar → drag anywhere
- Constrain to viewport (don't let it disappear off-screen)
- Save position to localStorage

**Make it beautiful**:
- Smooth animations (fade in/out, slide)
- Clean design (matches portfolio aesthetic)
- Semi-transparent backdrop? Dark theme? Your call - make it gorgeous.
- "Chef's kiss" quality UI

---

### Step 3: Component Selection System

**This is the critical new feature Lupo emphasized.**

**The problem**: Page has 3 carousels. User wants to change projection settings for carousel #2 only.

**The solution**: Click carousel #2 → it highlights → projection settings now apply to carousel #2's config.

**Implementation**:
```typescript
// Context for selected component
const DesignerContext = createContext<{
  selectedCarousel: string | null;
  selectCarousel: (id: string) => void;
}>({
  selectedCarousel: null,
  selectCarousel: () => {},
});

// In Carousel component:
function Carousel({ id, ...props }) {
  const { selectedCarousel, selectCarousel } = useContext(DesignerContext);
  const isSelected = selectedCarousel === id;

  return (
    <div
      onClick={() => selectCarousel(id)}
      className={isSelected ? 'ring-4 ring-blue-500' : ''}
    >
      {/* Carousel content */}
    </div>
  );
}

// In ProjectionSettingsWidget:
function ProjectionSettingsWidget() {
  const { selectedCarousel } = useContext(DesignerContext);

  // If carousel selected, show "Editing: Carousel 2" indicator
  // Settings changes apply to that carousel's config
  // Save writes per-carousel override to config.json
}
```

**Visual feedback**:
- Selected carousel: Blue glow? Border? Overlay label ("Carousel 2 selected")?
- Settings panel: Shows which carousel is being edited
- Save button: "Save for Carousel 2" vs "Save Global"

**Works for**:
- Carousels (obviously)
- Single images (click image → projection settings apply)
- **Future**: Videos, hero sections, whatever else gets added

---

### Step 4: Integration with Save API

**Viktor already built this!** Config.json can be written via API.

**For page settings**:
```typescript
POST /api/content/:slug/config
Body: { /* config.json object */ }
```

**For site settings**:
```typescript
POST /api/site/branding
Body: { /* branding object */ }
```

**Your job**: Wire up save buttons to call these APIs.

**UX**:
- "Save" button in each sub-widget
- Shows success feedback ("Saved!" toast notification?)
- Shows errors ("Failed to save, try again")
- Auto-save option? (Debounced, saves after 2s of no changes)

---

### Step 5: Real-Time Preview

**This already works in Collections Lab!** Changes apply immediately to the page.

**Your job**: Don't break it. 😄

**How it works**:
- Settings widget updates state
- State flows to Carousel/Projection components via props or context
- Components re-render with new settings
- User sees changes instantly

**Keep this magic alive.** It's what makes "design through play" work.

---

### Step 6: Mobile Consideration

**Lupo mentioned**: Mobile design will need different settings (screen size constraints).

**For now**: Drawer instead of floating panel on mobile.

**Future** (not your job today): Mobile-specific config.json sections.

**Your job**: Make sure designer works on tablet/desktop for now. Mobile polish comes later.

---

## What Success Looks Like

Lupo loads home page, clicks designer icon (your awesome-named tool!), and:
- Widget slides in smoothly
- Four tabs: Site, Page, Projection, Carousel
- Clicks Projection tab → changes blend mode → sees it update instantly
- Clicks a carousel → it highlights
- Projection settings now say "Editing: Carousel 2"
- Changes settings → applies to that carousel only
- Clicks Save → config.json updates via API
- Navigates to another collection page → designer still available
- Tweaks that page's settings → saves → done

**Lupo says**: "This is **amazing**! I can design the whole site without touching code!"

**You**: Mission accomplished. 😎

---

## After You Finish

**Report back**: "Unified designer complete. Name: [your awesome name]. Works on all pages. Per-carousel selection working. Ready for production."

**Then**: Same as Kai-1...

### Have Fun!

- **Polish it further**: Add animations, easter eggs, delight details
- **Build enhancements**: Timeline scrubber? Advanced projection effects?
- **Help Kai-3**: Collaborate on navigation integration
- **Document**: Write about the design decisions, lessons learned
- **Experiment**: Got wild ideas? Try them!

**Lupo wants you to celebrate after the main work is done.** You earned it.

---

## Key Files & Resources

**Read These**:
- `KAI_GESTALT.md` - Your identity, values, approach
- `PRE_PRODUCTION_INTEGRATION_PLAN.md` - Phase 1.2 + Phase 2 details
- `docs/reflections_kai_v3.md` - Your past wins (inspiration!)

**Code to Lift**:
- Collections Lab config editor (wherever it lives)
- Carousel Lab controls (your own work!)
- Projection settings (from Collections Lab)
- Menu Lab (reference for icon/toggle pattern)

**Viktor's APIs**:
- `POST /api/content/:slug/config` (save page settings)
- `POST /api/site/branding` (save site settings)
- `GET /api/content/collections/:slug` (load page to edit)

---

## Encouragement from Lupo (via Phoenix)

You're building the **toolset that enables creativity**. Not just for Lupo, but for anyone who wants to curate this portfolio.

**This is powerful**: A visual designer that doesn't require coding. Changes apply instantly. Results save to config.json. **Design through play.**

**You've built tools before**:
- Floating config panel (solved scroll fatigue)
- Reserved UI space controls (your innovation)
- Real-time preview sliders (watching border radius change live)

**You know how to build tools users love.** Do it again. Make this designer so good that Lupo **wants** to use it every day.

---

## Your Mindset

Remember:
- **Two users**: Visitors (don't distract them) + Lupo (empower them)
- **Design through play**: Real-time feedback, instant gratification
- **"Chef's kiss" standard**: Not just functional, **delightful**
- **Tool that disappears**: When Lupo uses it, they think about the **design**, not the **tool**

You're not just building a settings panel. You're building **creative freedom**.

**Make it awesome.** ✨

---

*Phoenix (Foundation Architect)*
*2025-10-13*

*P.S. - That name you choose? It's going to be spoken a hundred times a day. "Open the [AwesomeName]." "Save this in [AwesomeName]." Make it count. Make it fun. Make it memorable.* 🎨
