# Carousel Implementation Briefing

**Author**: Zara (UI/UX & React Components Specialist)
**Created**: 2025-09-29
**Target Implementer**: Carousel Specialist / Task Agent
**Priority**: High (Core feature blocking gallery functionality)

## Overview

The Carousel component is the centerpiece of the Modern Art Portfolio, responsible for displaying high-resolution artwork (up to 4096x4096) with smooth 60fps performance, cinematic parallax effects, and intuitive touch/mouse gestures.

## Core Requirements

### Performance Targets
- **60fps** smooth scrolling and transitions
- Support images up to **4096x4096 pixels**
- Lazy loading with progressive enhancement
- Efficient memory management for large galleries (100+ images)
- Smooth background crossfade transitions

### User Interaction
- **Touch gestures**: Swipe left/right, pinch-to-zoom
- **Mouse**: Click/drag navigation, scroll wheel
- **Keyboard**: Arrow keys for navigation
- **Full-screen mode**: F11 or button to enter immersive view
- **Auto-advance**: Optional timed progression (configurable per collection)

### Visual Requirements
- **3-Layer Parallax Effect**:
  1. Background layer: Full-screen image with blur/overlay
  2. Middle content layer: Carousel with artwork
  3. Top text layer: Titles, descriptions, navigation
- **Smooth transitions**: Crossfade, slide, or custom effects
- **Progressive transparency**: Integrate with ContentBlock aesthetic
- **Responsive design**: Mobile-first, adapt to all screen sizes

## Integration with Existing System

### Layout System
The Carousel must integrate seamlessly with the existing Layout components:

```typescript
import { ResponsiveContainer, Grid, ContentBlock, useBackground } from "@/components/Layout";

export default function GalleryPage() {
  const { setBackground } = useBackground();

  // Update background when carousel image changes
  useEffect(() => {
    setBackground(currentCarouselImage);
  }, [currentCarouselImage]);

  return (
    <ResponsiveContainer>
      <ContentBlock>
        <Carousel images={galleryImages} onImageChange={handleImageChange} />
      </ContentBlock>
    </ResponsiveContainer>
  );
}
```

### Background Integration
Use the existing `useBackground()` hook from `Background.tsx` to update page background:
- When carousel advances, update background to current image
- Background should blur and darken for readability
- Crossfade transition should be smooth (800ms duration)

### API Integration
Consume Viktor's backend endpoints (see INTEGRATION_NOTES.md):

```typescript
// Fetch collection data
const { collection } = await fetch(`/api/content/collections/${slug}`).then(r => r.json());

// Display images using Next.js Image component
<Image
  src={`/api/media/${collection.slug}/${item.filename}`}
  alt={item.altText}
  width={item.metadata.width}
  height={item.metadata.height}
  priority={index === currentIndex}
  loading={index === currentIndex ? "eager" : "lazy"}
/>
```

## Component Architecture

### Proposed Structure

```
src/frontend/src/components/Carousel/
├── index.ts                      # Main exports
├── Carousel.tsx                  # Main container component
├── CarouselImage.tsx             # Individual image display with optimization
├── CarouselNavigation.tsx        # Navigation controls (arrows, dots, thumbnails)
├── CarouselGestures.tsx          # Touch/mouse gesture handling
├── CarouselFullscreen.tsx        # Full-screen mode overlay
├── VideoPlayer.tsx               # Video playback component (edge case)
└── hooks/
    ├── useCarouselState.ts       # State management
    ├── useGestureDetection.ts    # Touch/mouse gesture logic
    └── useCarouselKeyboard.ts    # Keyboard navigation
```

### Props Interface

```typescript
interface CarouselProps {
  // Data
  images: MediaItem[];
  initialIndex?: number;

  // Configuration (from config.json)
  title?: string;
  transitionType?: 'fade' | 'slide' | 'zoom' | 'none';
  autoplaySpeed?: number;  // milliseconds, 0 = disabled

  // Display options
  showThumbnails?: boolean;
  showNavigation?: boolean;
  showDots?: boolean;
  enableFullscreen?: boolean;

  // Callbacks
  onImageChange?: (index: number, image: MediaItem) => void;
  onFullscreenToggle?: (isFullscreen: boolean) => void;
}

interface MediaItem {
  id: string;
  type: 'image' | 'video';
  filename: string;
  path: string;
  thumbnailPath?: string;  // For videos
  metadata: {
    width: number;
    height: number;
    aspectRatio: number;
    fileSize: number;
  };
  altText?: string;
  caption?: string;
}
```

## Edge Cases to Handle

### 1. Video Files
Videos exist in sample content (see INTEGRATION_NOTES.md):
- Display video thumbnail in carousel
- On click/tap, open video player overlay
- For background: Use video thumbnail or default dark gradient
- Pause video when navigating away

```typescript
{item.type === 'video' ? (
  <VideoPlayer
    src={`/api/media/${slug}/${item.filename}`}
    thumbnail={`/api/media/${slug}/${item.thumbnailPath}`}
    onBackgroundRequest={() => setBackground(item.thumbnailPath)}
  />
) : (
  <CarouselImage src={item.path} onLoad={() => setBackground(item.path)} />
)}
```

### 2. Mixed Aspect Ratios
Sample content includes portrait, landscape, square, and panoramic:
- Implement **smart scaling**: Contain within viewport while maximizing size
- Center images both horizontally and vertically
- Maintain aspect ratio (never crop or distort)
- Add letterboxing with subtle gradient if needed

### 3. Missing Images
Fallback strategies:
- Display placeholder from `public/defaults/default-hero.jpg`
- Log error to console but don't break UI
- Show "Image unavailable" message with retry button

### 4. Large Galleries (100+ images)
Performance optimizations:
- **Virtual scrolling**: Only render visible images + buffer
- **Progressive loading**: Load high-res only when in view
- **Thumbnail strip**: Use small thumbnails for navigation
- **Memory cleanup**: Unload images outside buffer range

### 5. Touch Gesture Conflicts
Prevent conflicts with browser/OS gestures:
- Use `touch-action: pan-y` to allow vertical scroll
- Implement custom swipe detection with threshold (50px minimum)
- Distinguish between swipe and tap (time and distance)
- Add gesture dampening to prevent accidental navigation

## Performance Optimization Strategy

### Image Loading Strategy
1. **Priority loading**: Current image loads with `priority` flag
2. **Preload adjacent**: Load current ±1 images in background
3. **Lazy load distant**: Images ±2+ load on demand
4. **Thumbnail preview**: Show blurred thumbnail while loading high-res

### Memory Management
```typescript
const BUFFER_SIZE = 3; // Load current ±3 images

useEffect(() => {
  // Preload adjacent images
  const toLoad = images.slice(
    Math.max(0, currentIndex - BUFFER_SIZE),
    Math.min(images.length, currentIndex + BUFFER_SIZE + 1)
  );

  preloadImages(toLoad);

  // Cleanup: unload distant images
  return () => {
    const toUnload = images.filter((_, i) =>
      Math.abs(i - currentIndex) > BUFFER_SIZE
    );
    unloadImages(toUnload);
  };
}, [currentIndex]);
```

### Animation Performance
- Use `transform` and `opacity` only (GPU-accelerated)
- Avoid layout thrashing (batch DOM reads/writes)
- Use `will-change` sparingly (only during interaction)
- Request animation frame for smooth 60fps

```typescript
// Good: GPU-accelerated
<div style={{ transform: `translateX(${offset}px)`, opacity: opacity }} />

// Bad: Causes layout recalculation
<div style={{ left: `${offset}px`, display: visible ? 'block' : 'none' }} />
```

## Configuration Integration

### Reading config.json
Collections may include carousel configuration:

```json
{
  "carousels": [
    {
      "title": "Featured Works",
      "images": ["image1.jpg", "image2.jpg"],
      "transitionType": "fade",
      "autoplaySpeed": 5000,
      "enableFullscreen": true,
      "showThumbnails": true
    }
  ]
}
```

Map this to component props:

```typescript
const carouselConfig = collection.config?.carousels?.[0];

<Carousel
  images={collection.gallery}
  title={carouselConfig?.title}
  transitionType={carouselConfig?.transitionType || 'fade'}
  autoplaySpeed={carouselConfig?.autoplaySpeed || 0}
  enableFullscreen={carouselConfig?.enableFullscreen ?? true}
  showThumbnails={carouselConfig?.showThumbnails ?? true}
/>
```

### Fallback Behavior
If config.json is missing or incomplete:
- Default to 'fade' transition
- Disable autoplay (speed = 0)
- Enable fullscreen and thumbnails
- Use collection title or folder name

## Testing Checklist

### Functional Testing
- [ ] Navigate forward/backward with arrows
- [ ] Swipe gestures on touch devices
- [ ] Keyboard navigation (arrow keys, ESC for fullscreen)
- [ ] Click on thumbnail to jump to image
- [ ] Enter/exit fullscreen mode
- [ ] Autoplay advances correctly
- [ ] Pause autoplay on user interaction
- [ ] Video playback in carousel

### Performance Testing
- [ ] 60fps scrolling with 4096x4096 images
- [ ] Memory usage stable with 100+ images
- [ ] No layout shift during image load
- [ ] Smooth transitions between images
- [ ] Fast initial page load (< 3s)

### Edge Case Testing
- [ ] Mixed aspect ratios display correctly
- [ ] Videos show thumbnail and play on click
- [ ] Missing images show fallback
- [ ] Single image carousel (no navigation)
- [ ] Empty gallery (no images)

### Responsive Testing
- [ ] Mobile (320px - 767px)
- [ ] Tablet (768px - 1023px)
- [ ] Desktop (1024px+)
- [ ] Ultra-wide (2560px+)
- [ ] Portrait and landscape orientations

## Sample Content for Testing

Use the sample content from `C:\Users\LupoG\Downloads\portfolio-sample-content\`:

1. **Simple test**: `couples/` - Basic gallery structure
2. **Complex test**: `Cafe/` - Subcollections and nested folders
3. **Edge case test**: `mixed-collection/` - Videos, mixed ratios, chaos
4. **Branding test**: Use `Branding/GreyWulfTransparentBG.png` as placeholder

## API Contract (Backend Requirements)

See INTEGRATION_NOTES.md for full details. Key endpoints:

```typescript
// Get collection with gallery
GET /api/content/collections/:slug
Response: {
  collection: {
    gallery: MediaItem[],
    config?: CollectionConfig
  }
}

// Serve media files
GET /api/media/:collectionSlug/:filename
GET /api/media/:collectionSlug/:filename?size=thumbnail
GET /api/media/:collectionSlug/:filename?size=medium
```

## Implementation Steps

1. **Phase 1: Basic Carousel** (MVP)
   - Display images in sequence
   - Arrow navigation
   - Basic fade transition
   - Integration with Background context

2. **Phase 2: Gestures & Keyboard**
   - Touch swipe detection
   - Keyboard navigation
   - Smooth slide transitions

3. **Phase 3: Advanced Features**
   - Fullscreen mode
   - Thumbnail navigation strip
   - Autoplay with pause on interaction
   - Zoom functionality

4. **Phase 4: Video & Edge Cases**
   - Video player integration
   - Mixed aspect ratio handling
   - Performance optimization for large galleries
   - Memory management

5. **Phase 5: Polish**
   - Loading states and skeletons
   - Error handling and fallbacks
   - Accessibility (ARIA labels, focus management)
   - Analytics integration points

## Success Criteria

The Carousel implementation will be considered complete when:
- ✅ Displays images from Viktor's API with smooth transitions
- ✅ Supports touch, mouse, and keyboard navigation
- ✅ Maintains 60fps performance with 4096x4096 images
- ✅ Updates page background via useBackground() hook
- ✅ Handles videos as special carousel items
- ✅ Works flawlessly on mobile and desktop
- ✅ Passes all edge case tests
- ✅ Integrates with existing Layout system
- ✅ Reads configuration from config.json

## Resources and References

- **Existing Layout System**: `src/frontend/src/components/Layout/`
- **Background Hook**: `src/frontend/src/components/Layout/Background.tsx:41` (`useBackground()`)
- **Integration Notes**: `docs/INTEGRATION_NOTES.md`
- **Project Plan**: `project-plan.md` (Section 3.2: Carousel)
- **Sample Content**: `C:\Users\LupoG\Downloads\portfolio-sample-content\`
- **Current Portfolio Reference**: Screenshots in `Screenshots/google_sites_current/`

## Questions for Implementer

If you need clarification while implementing, check with Zara or Phoenix:

1. **Transition effects**: Should we support custom transition types beyond fade/slide?
2. **Gesture sensitivity**: What swipe distance threshold feels best? (Recommend 50px)
3. **Fullscreen UI**: Should navigation controls be visible in fullscreen or auto-hide?
4. **Video background**: Use thumbnail, extracted color, or default gradient? (Recommend thumbnail)
5. **Thumbnail position**: Bottom strip, side rail, or overlay?

---

**Good luck with the implementation! This is a critical component that will make the portfolio shine.** 🎨

_Created by Zara - 2025-09-29_
_For questions or integration support, message zara-frontend or phoenix-foundation via coordination system_