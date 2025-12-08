# 🚨 CRITICAL: Scalable Gallery API Design

**VIKTOR - READ THIS FIRST** 🎯

**Author**: Zara (Frontend) + Lupo (Performance Requirements)
**Created**: 2025-09-30
**Priority**: HIGH - Blocks production deployment

---

## 📊 The Problem

**Current API Design**:
```typescript
GET /api/content/collections/:slug
Returns: {
  collection: {
    gallery: MediaItem[]  // ❌ ALL 50,000+ images in one response!
  }
}
```

**Why This Breaks**:
- 🔥 Response size: 50k images × 500 bytes metadata = **25 MB JSON**
- 🔥 Parse time: ~5-10 seconds on mobile
- 🔥 Memory: Browser crashes on low-end devices
- 🔥 Network: Mobile data caps exceeded
- 🔥 UX: User stares at blank screen for 10+ seconds

**We need to redesign the API for scale.**

---

## ✅ Industry Best Practices

### How Image-Heavy Sites Do It:

**Google Photos**:
- Initial load: 20 images
- Infinite scroll loads batches of 20
- Thumbnails load first, full-res on click

**Instagram**:
- Feed loads 12 posts at a time
- Prefetches next batch while viewing current
- Uses HTTP/2 multiplexing for parallel requests

**Flickr**:
- Grid shows 100 thumbnails
- Pagination for millions of photos
- Lazy loads full-res only when needed

### Key Principles:
1. **Pagination** - Never return more than 50 items
2. **Thumbnail-first** - Always send thumbnails, full-res on demand
3. **Lazy loading** - Load as user scrolls/navigates
4. **Prefetching** - Load next page before user needs it
5. **HTTP/2** - Parallel requests handled by protocol
6. **CDN/Caching** - Static images cached at edge

---

## 🎯 Proposed API Flow

### **Flow 1: Browse Collections** (Landing Page)

```
┌─────────────┐
│   Browser   │
└──────┬──────┘
       │ 1. GET /api/content/collections
       ├──────────────────────────────────────────►
       │                                            ┌──────────────┐
       │ 2. Returns: List + Hero Images + Counts   │   Backend    │
       ◄────────────────────────────────────────────┤              │
       │                                            └──────────────┘

Response (8 KB):
{
  success: true,
  data: {
    collections: [
      {
        id: "cafe-2024",
        name: "Cafe Collection",
        slug: "cafe-2024",
        heroImage: "/api/media/cafe-2024/hero.jpg?size=medium",  // ← Pre-sized
        imageCount: 1547,  // ← Total count for UI
        videoCount: 12,
        description: "...",
        featured: true
      }
    ],
    total: 6
  }
}
```

**Performance**:
- Response: ~8 KB (6 collections × ~1.3 KB)
- Load time: 50-100ms
- Parse time: <10ms

---

### **Flow 2: View Collection** (Detail Page)

```
┌─────────────┐
│   Browser   │
└──────┬──────┘
       │ 1. GET /api/content/collections/cafe-2024
       ├────────────────────────────────────────────────────►
       │                                                      ┌──────────────┐
       │ 2. Returns: Metadata + First 20 thumbnail URLs      │   Backend    │
       ◄──────────────────────────────────────────────────────┤              │
       │                                                      └──────────────┘
       │ 3. GET /api/media/cafe-2024/image1.jpg?size=thumbnail
       ├───────────────────────────────────────────────────────────────────►
       │ 4. Returns: JPEG thumbnail (fast)
       ◄───────────────────────────────────────────────────────────────────┤
       │
       │ (Browser requests 20 thumbnails in parallel via HTTP/2)
       │

Response to Step 1 (15 KB):
{
  success: true,
  data: {
    collection: {
      id: "cafe-2024",
      name: "Cafe Collection",
      slug: "cafe-2024",
      description: "...",
      config: { /* carousel settings */ },
      gallery: [  // ← Only first 20 images!
        {
          id: "img-001",
          filename: "morning-coffee.jpg",
          type: "image",
          metadata: {
            width: 4096,
            height: 2730,
            aspectRatio: 1.5,
            fileSize: 8245120
          },
          thumbnails: {
            small: "/api/media/cafe-2024/morning-coffee.jpg?size=640w",
            medium: "/api/media/cafe-2024/morning-coffee.jpg?size=1080w",
            large: "/api/media/cafe-2024/morning-coffee.jpg?size=1920w"
          }
        },
        // ... 19 more images
      ],
      pagination: {
        page: 1,
        limit: 20,
        total: 1547,
        totalPages: 78,
        hasNext: true,
        hasPrev: false
      }
    }
  }
}
```

**Performance**:
- Metadata response: ~15 KB
- 20 thumbnails @ 10 KB each: 200 KB total
- HTTP/2 parallel loading: ~500ms on 4G
- User sees content in <1 second

---

### **Flow 3: Lazy Load More Images** (Infinite Scroll)

```
User scrolls down in carousel/grid...

┌─────────────┐
│   Browser   │
└──────┬──────┘
       │ GET /api/content/collections/cafe-2024/images?page=2&limit=20
       ├──────────────────────────────────────────────────────────────►
       │                                                                ┌──────────────┐
       │ Returns: Next 20 image metadata                               │   Backend    │
       ◄────────────────────────────────────────────────────────────────┤              │
       │                                                                └──────────────┘
       │ GET thumbnails in parallel
       │
```

**Why Separate Endpoint?**
- Initial load is fast (metadata only)
- Additional pages loaded on-demand
- Can prefetch page N+1 while viewing page N
- Can jump to arbitrary page (page 51 for images 1020-1040)

---

### **Flow 4: Full Resolution on Demand** (Click to View)

```
User clicks image to view full-res or enter fullscreen...

┌─────────────┐
│   Browser   │
└──────┬──────┘
       │ GET /api/media/cafe-2024/morning-coffee.jpg
       ├───────────────────────────────────────────────────►
       │                                                     ┌──────────────┐
       │ Returns: Full 4096×2730 JPEG (8 MB)               │   Backend    │
       ◄─────────────────────────────────────────────────────┤              │
       │                                                     └──────────────┘

```

**Progressive Enhancement**:
1. Show thumbnail immediately (already loaded)
2. Display loading indicator
3. Load full-res in background
4. Swap when ready
5. Cache for repeat views

---

## 📋 Recommended API Endpoints

### **1. Collections List** (Existing - Already Good!)
```typescript
GET /api/content/collections

Response: {
  success: true,
  data: {
    collections: Collection[],  // Summary only, no images
    total: number
  }
}
```

### **2. Collection Detail** (NEEDS CHANGE)
```typescript
GET /api/content/collections/:slug?page=1&limit=20

Response: {
  success: true,
  data: {
    collection: {
      id: string,
      name: string,
      slug: string,
      description: string,
      heroImage: string,
      config: CollectionConfig,
      gallery: MediaItem[],  // ← Only images for current page!
      pagination: {
        page: 1,
        limit: 20,
        total: 1547,
        totalPages: 78,
        hasNext: true,
        hasPrev: false
      }
    }
  }
}
```

**Query Parameters**:
- `page` (default: 1) - Page number
- `limit` (default: 20, max: 50) - Items per page

### **3. Images Pagination** (NEW ENDPOINT)
```typescript
GET /api/content/collections/:slug/images?page=2&limit=20

Response: {
  success: true,
  data: {
    images: MediaItem[],
    pagination: PaginationMeta
  }
}
```

**Use Cases**:
- Infinite scroll
- Jump to page
- Prefetch next batch
- Random access (thumbnail strip)

### **4. Media Serving** (Already Exists - Enhance)
```typescript
GET /api/media/:slug/:filename
GET /api/media/:slug/:filename?size=640w
GET /api/media/:slug/:filename?size=1080w
GET /api/media/:slug/:filename?size=1920w

Headers:
  Cache-Control: public, max-age=31536000, immutable
  Content-Type: image/jpeg
  Content-Length: <size>
```

**Thumbnail Sizes**:
- `640w` - Mobile thumbnail (10-20 KB)
- `1080w` - Desktop thumbnail, mobile full (50-100 KB)
- `1920w` - Desktop full (200-500 KB)
- `3840w` - 4K displays (500 KB - 2 MB)
- (no param) - Original size (2-10 MB)

---

## 💡 Lupo's Parallel Request Idea

**Original Suggestion**:
> "Issue multiple requests for sets: 1-20, 30-39, 1020-1029, 50-80, 40-49 in parallel"

**Analysis**:

**Pros**:
✅ True parallel loading
✅ Can load random access points
✅ Flexible for complex UIs

**Cons**:
❌ Complex state management (tracking non-sequential batches)
❌ HTTP/2 already does parallelism automatically
❌ Harder to reason about for developers

**Better Approach**:
Use **sequential pagination** with **HTTP/2 multiplexing**:

```typescript
// Frontend automatically issues parallel requests:
Promise.all([
  fetch('/api/collections/cafe/images?page=1&limit=20'),  // Images 1-20
  fetch('/api/collections/cafe/images?page=2&limit=20'),  // Images 21-40
  fetch('/api/collections/cafe/images?page=3&limit=20'),  // Images 41-60
])
```

**HTTP/2 Handles**:
- Multiplexing (parallel streams over single connection)
- Header compression (reduces overhead)
- Server push (can push thumbnails proactively)

**Result**: Same parallelism, simpler code! 🎉

---

## 🎨 Frontend Implementation Pattern

```typescript
// Initial load
const { collection } = await fetchCollection('cafe-2024', { page: 1, limit: 20 });

// Display first 20 images
carousel.setImages(collection.gallery);

// Prefetch next page while user views
if (collection.pagination.hasNext) {
  prefetchImages('cafe-2024', { page: 2 });
}

// Infinite scroll: load more when near end
carousel.onNearEnd(() => {
  const nextPage = collection.pagination.page + 1;
  loadMoreImages('cafe-2024', { page: nextPage });
});

// Jump to specific section (thumbnail strip)
thumbnailStrip.onJumpToImage((imageIndex) => {
  const page = Math.floor(imageIndex / 20) + 1;
  loadImages('cafe-2024', { page });
});
```

---

## 📊 Performance Comparison

### Current Approach (Load All):
| Metric | Value |
|--------|-------|
| Initial Response Size | 25 MB |
| Parse Time | 5-10 seconds |
| Time to First Image | 12+ seconds |
| Mobile Data Used | 25 MB + images |
| Browser Memory | 200+ MB |
| Mobile Crashes | High risk |

### Proposed Approach (Paginated):
| Metric | Value |
|--------|-------|
| Initial Response Size | 15 KB |
| Parse Time | <10 ms |
| Time to First Image | 500 ms |
| Mobile Data Used | 215 KB (first 20) |
| Browser Memory | 20-30 MB |
| Mobile Crashes | Zero |

**Improvement**: 💚 **166x smaller initial payload**, 💚 **24x faster time-to-content**

---

## 🔧 Implementation Checklist for Viktor

### Phase 1: Quick Fix (30 minutes)
- [ ] Add `page` and `limit` query params to `/api/content/collections/:slug`
- [ ] Return only requested page of images in `gallery` array
- [ ] Add `pagination` object to response
- [ ] Test with: `GET /api/content/collections/cafe?page=1&limit=20`

### Phase 2: Dedicated Endpoint (1 hour)
- [ ] Create `/api/content/collections/:slug/images?page=X&limit=Y`
- [ ] Return just images + pagination (lighter response)
- [ ] Add CORS for port 3001 while we're at it! 😅

### Phase 3: Optimization (2 hours)
- [ ] Add cache headers to media endpoint
- [ ] Implement thumbnail size query param (`?size=1080w`)
- [ ] Add image count to collections list endpoint
- [ ] Add database indexes for pagination queries

### Phase 4: Advanced (Future)
- [ ] Implement image search/filtering
- [ ] Add sort options (date, size, etc.)
- [ ] Implement prefetch hints (HTTP/2 push)
- [ ] Add video thumbnail generation

---

## 🎯 Migration Path

**Step 1**: Viktor implements pagination on existing endpoint
**Step 2**: Zara updates frontend to use `page` param
**Step 3**: Test with small collections first
**Step 4**: Roll out to production
**Step 5**: Monitor performance metrics

**Breaking Change?** NO!
- Existing calls without `page` param can default to `page=1&limit=50`
- Backward compatible
- Frontend can migrate gradually

---

## 💬 Questions for Viktor?

1. **Database**: Can your queries handle `LIMIT 20 OFFSET 40` efficiently?
2. **Thumbnails**: Are thumbnails already generated? (ContentScanner)
3. **Caching**: Do we need Redis for image metadata caching?
4. **CDN**: Should we plan for CDN integration? (future)

---

## 🚀 Next Steps

1. **Viktor**: Review this document
2. **Viktor + Zara**: Quick call to align on approach? (5 min)
3. **Viktor**: Implement Phase 1 (pagination)
4. **Zara**: Test with real data
5. **Team**: Celebrate scalable architecture! 🎉

---

**This is the difference between a portfolio that works and one that scales to 50,000+ images.** Let's build it right! 💪

_Created with ❤️ by Zara (Frontend) + performance insights from Lupo_
_2025-09-30_