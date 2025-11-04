# Integration Notes - Frontend/Backend Coordination

**Author**: Zara (UI/UX & React Components Specialist)
**Created**: 2025-09-29
**Last Updated**: 2025-09-29

## Content Strategy & File Organization

### Development Sample Content Location
**Primary Location**: `C:\Users\LupoG\Downloads\portfolio-sample-content\`

This directory serves as the central repository for development sample content and should be referenced by all team members during development.

**⚠️ IMPORTANT**: This directory is NOT tracked in git and should never be committed to the repository.

### Sample Content Structure

```
portfolio-sample-content/
├── Branding/                    # Logo, favicon, brand assets
│   ├── GreyWulfTransparentBG.png (recommended for logo)
│   ├── GreyWolfDark.gif (transparent, animation)
│   ├── GreyWulf.jpg
│   └── thumbnail_gray_wolf.jpg
│
├── couples/                     # Sample collection (simple structure)
│   ├── config.json             # Collection configuration
│   ├── Hero-image.jpg          # Page header image
│   └── Gallery/                # Main gallery images
│       └── *.jpg
│
├── Cafe/                        # Sample collection (complex structure)
│   ├── Hero-image.jpg
│   ├── Gallery/                # Main gallery
│   ├── Coffee/                 # Subcollection
│   ├── DarkBeauty/            # Subcollection
│   └── Flowers/               # Subcollection
│
└── mixed-collection/           # Test edge cases
    ├── *.jpg                   # Various aspect ratios
    ├── *.mp4                   # Video files (edge case!)
    └── subdirectories/         # Nested structures
```

### Edge Cases Identified

1. **Subdirectories without standard structure**
   - Some directories lack `Gallery/` folder
   - Some lack `Hero-image.jpg`
   - Some lack `config.json`

2. **Mixed content types**
   - `.jpg` images (standard)
   - `.mp4` video files (needs handling strategy)
   - Various aspect ratios (portrait, landscape, square, panoramic)

3. **Nested collections**
   - Cafe/ has sub-collections (Coffee, DarkBeauty, Flowers)
   - Need to handle hierarchical navigation

4. **Video handling question**
   - Videos should be treated like carousels
   - **Open question**: What background image to use when video scrolls into view?
   - **Zara's recommendation**: Use a default background color or extracted video thumbnail

## Next.js Best Practices & Asset Locations

### Static Assets Structure

```
src/frontend/
├── public/                      # Static assets served by Next.js
│   ├── branding/               # Logo, favicon
│   │   ├── logo.png            # Main logo (from GreyWulfTransparentBG.png)
│   │   ├── logo.svg            # SVG version (if available)
│   │   └── favicon.ico         # Browser favicon
│   │
│   ├── defaults/               # Default/fallback images
│   │   ├── default-hero.jpg    # Default header image
│   │   ├── default-background.jpg
│   │   └── video-placeholder.jpg
│   │
│   └── sample-content/         # DEV ONLY - gitignored
│       └── [symlink to Downloads location]
│
├── src/
│   ├── app/                    # Next.js app directory
│   ├── components/             # React components
│   └── config/                 # App configuration
│       └── content-config.json # Content structure mappings
```

### Gitignore Rules

Add to `.gitignore`:
```
# Sample/dev content - never commit
public/sample-content/
**/sample-content/
C:/Users/*/Downloads/portfolio-sample-content/

# User-uploaded content in production
public/uploads/
public/user-content/
```

## Backend API Requirements for Viktor

### Content Service Endpoints Needed

#### 1. Collection Discovery
```typescript
GET /api/content/collections
Response: {
  collections: [
    {
      id: string,
      name: string,
      slug: string,
      heroImage?: string,
      hasConfig: boolean,
      imageCount: number,
      videoCount: number,
      subcollections?: Collection[]
    }
  ]
}
```

#### 2. Collection Details
```typescript
GET /api/content/collections/:slug
Response: {
  collection: {
    id: string,
    name: string,
    slug: string,
    heroImage?: string,
    config?: CollectionConfig,
    gallery: MediaItem[],
    subcollections?: Collection[]
  }
}

interface MediaItem {
  id: string,
  type: 'image' | 'video',
  filename: string,
  path: string,
  thumbnailPath?: string,  // For videos
  metadata: {
    width: number,
    height: number,
    aspectRatio: number,
    fileSize: number
  }
}
```

#### 3. Media Serving
```typescript
GET /api/media/:collectionSlug/:filename
// Serves actual image/video file
// Handles different sizes/formats based on query params

GET /api/media/:collectionSlug/:filename?size=thumbnail
GET /api/media/:collectionSlug/:filename?size=medium
GET /api/media/:collectionSlug/:filename?format=webp
```

#### 4. Config Management
```typescript
GET /api/content/collections/:slug/config
POST /api/content/collections/:slug/config
// CRUD operations for config.json files
```

### Frontend Consumption Pattern

```typescript
// Frontend will consume like this:
const { collections } = await fetch('/api/content/collections').then(r => r.json());

// For each collection:
const { collection } = await fetch(`/api/content/collections/${slug}`).then(r => r.json());

// Display images using Next.js Image component:
<Image
  src={`/api/media/${collection.slug}/${item.filename}`}
  alt={item.altText}
  width={item.metadata.width}
  height={item.metadata.height}
/>
```

### Video Handling Strategy

**Frontend expectations**:
1. Video files should return a `type: 'video'` in the MediaItem
2. Provide a `thumbnailPath` (extracted first frame or mid-point frame)
3. Frontend will:
   - Display video thumbnail in carousel
   - On click/tap, open video in custom player
   - For background: Use thumbnail or default background color

**Backend responsibilities**:
- Extract video thumbnail on discovery
- Store thumbnails in cache directory
- Serve video files with proper streaming headers
- Generate multiple quality versions for adaptive streaming (future)

## Config.json Schema

### Standard Collection Config

```json
{
  "title": "Collection Title",
  "subtitle": "Optional subtitle",
  "description": "Full description",

  "heroBanner": {
    "enabled": true,
    "image": "Hero-image.jpg",
    "title": "Display Title",
    "subtitle": "Display Subtitle",
    "overlayOpacity": 0.4,
    "textPosition": "center-bottom"
  },

  "layout": {
    "type": "masonry",
    "columns": 3,
    "spacing": "normal",
    "backgroundColor": "rgba(0, 0, 0, 0.3)",
    "backgroundOpacity": 0.8
  },

  "carousels": [
    {
      "title": "Carousel Title",
      "images": ["image1.jpg", "image2.jpg"],
      "transitionType": "fade",
      "autoplaySpeed": 5000
    }
  ],

  "navigation": {
    "menuOrder": 1,
    "urlSlug": "collection-slug",
    "featuredInHome": true,
    "parentCategory": null
  },

  "subcollections": {
    "enabled": true,
    "folders": ["Subcollection1", "Subcollection2"]
  }
}
```

## Edge Case Handling

### Missing config.json
- **Fallback**: Auto-generate basic config from directory structure
- Use folder name as title
- First image as hero (if available)
- All images in root become gallery

### Missing Hero-image.jpg
- **Fallback**: Use first gallery image
- Or use default placeholder from `public/defaults/`

### No Gallery/ folder
- **Fallback**: Treat all images in root directory as gallery
- Recurse into subdirectories (configurable depth)

### Subcollections
- Detect subdirectories with images
- Create nested navigation structure
- Each subcollection can have own config.json

### Videos
- Extract thumbnail (first frame or specified timestamp)
- Display thumbnail in carousel
- Open video player on interaction
- Use thumbnail or default for background transitions

## Team Coordination

### For Viktor (Backend API):
- Implement collection discovery endpoints
- Handle file serving with caching
- Extract video thumbnails
- Provide config CRUD operations
- Document your endpoints in this file!

### For Nova (Integration Specialist):
- Coordinate API contract testing
- Ensure frontend/backend alignment
- Test edge cases with sample content
- Document integration patterns

### For All Frontend Developers:
- Use sample content from Downloads location
- Never commit sample images to git
- Use `/api/media/` endpoints for production
- Handle missing/malformed configs gracefully

## Outstanding Questions

1. **Video background strategy** - What background when video is active?
   - Option A: Use video thumbnail
   - Option B: Default dark gradient
   - Option C: Extract dominant color from thumbnail

2. **Subcollection navigation** - How deep should we recurse?
   - Recommendation: Max 2 levels deep

3. **Performance** - When to implement image optimization?
   - Sharp/next-image optimization
   - CDN integration points

## Next Steps

1. Viktor: Implement initial content discovery API
2. Zara: Create Carousel component briefing document
3. Nova: Design integration test strategy
4. All: Add your notes and findings here!

---

**This document is a living integration guide. Update it as you discover patterns, solutions, and edge cases!**

_Updated by Zara - 2025-09-29_