# 🔌 API Specification - Frontend/Backend Integration

> **Foundation Architecture by Phoenix** | *Enabling parallel development with bulletproof contracts*

## **Executive Summary**

This document defines the **exact API contracts** between frontend and backend teams, enabling complete parallel development without integration conflicts. Both teams can work independently using these specifications and mock data.

**Key Principles**:
- **Contract-First Development**: API defined before implementation
- **Mock-Driven Frontend**: Frontend uses mock data until backend is ready
- **Type Safety**: TypeScript interfaces shared between teams
- **Versioning**: API versioning prevents breaking changes
- **Testing**: API contract tests ensure compatibility

---

## **1. API OVERVIEW & CONVENTIONS**

### **1.1 Base Configuration**
```typescript
const API_CONFIG = {
  baseURL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000',
  version: 'v1',
  timeout: 10000,
  retries: 3
};

// API Endpoints follow RESTful conventions:
// GET    /api/v1/resource       - List resources
// GET    /api/v1/resource/:id   - Get single resource
// POST   /api/v1/resource       - Create resource
// PUT    /api/v1/resource/:id   - Update resource
// DELETE /api/v1/resource/:id   - Delete resource
```

### **1.2 Response Format Standards**
```typescript
interface APIResponse<T> {
  success: boolean;
  data: T;
  message?: string;
  errors?: APIError[];
  meta?: {
    pagination?: PaginationMeta;
    cache?: CacheMeta;
    version?: string;
  };
}

interface APIError {
  code: string;
  message: string;
  field?: string;
  details?: any;
}

interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}
```

### **1.3 HTTP Status Codes**
- **200**: Success with data
- **201**: Created successfully
- **204**: Success with no content
- **400**: Bad request (validation errors)
- **401**: Unauthorized
- **403**: Forbidden
- **404**: Not found
- **429**: Rate limited
- **500**: Server error

---

## **2. CONTENT MANAGEMENT API**

### **2.1 Directory Endpoints**

#### **GET /api/v1/directories**
*Get all portfolio directories*

```typescript
interface DirectoryListResponse {
  success: true;
  data: {
    directories: Directory[];
    featured: Directory[];
    totalImages: number;
  };
}

interface Directory {
  id: string;                    // "sculptures-metal-series"
  title: string;                 // "Metal Sculptures"
  subtitle?: string;             // "Oxidized steel and copper"
  description?: string;          // Full description
  slug: string;                  // URL-friendly: "sculptures/metal-series"
  coverImage: string;            // "hero-sculpture.jpg"
  imageCount: number;            // 24
  lastModified: string;          // ISO date
  featured: boolean;             // Show on homepage
  menuOrder: number;             // Sort order in navigation
  status: 'published' | 'draft' | 'archived';
  parentCategory?: string;       // For nested categories
  tags: string[];                // ["sculpture", "metal", "abstract"]
}
```

#### **GET /api/v1/directories/:slug**
*Get specific directory with full configuration*

```typescript
interface DirectoryDetailResponse {
  success: true;
  data: {
    directory: DirectoryDetail;
    images: Image[];
    carousels: Carousel[];
    navigation: {
      prev?: DirectoryBreadcrumb;
      next?: DirectoryBreadcrumb;
      parent?: DirectoryBreadcrumb;
    };
  };
}

interface DirectoryDetail extends Directory {
  heroBanner: {
    enabled: boolean;
    image: string;
    title: string;
    subtitle?: string;
    overlayOpacity: number;      // 0-1
    textPosition: 'center' | 'bottom' | 'top-left' | 'bottom-right';
  };
  layout: {
    type: 'single' | 'side-by-side' | 'masonry' | 'stacked';
    columns: number;
    spacing: 'tight' | 'normal' | 'loose';
    backgroundColor: string;     // rgba(0,0,0,0.3)
    backgroundOpacity: number;   // 0-1
  };
  typography: {
    titleFont: string;           // "Inter"
    bodyFont: string;            // "Source Sans Pro"
    titleSize: string;           // "2.5rem"
    titleWeight: string;         // "600"
  };
  seo: {
    metaTitle: string;
    metaDescription: string;
    openGraphImage: string;
  };
}
```

### **2.2 Image Endpoints**

#### **GET /api/v1/images/:imageId**
*Get specific image with metadata*

```typescript
interface ImageDetailResponse {
  success: true;
  data: {
    image: ImageDetail;
    related: Image[];
    reactions: ReactionCounts;
  };
}

interface ImageDetail extends Image {
  metadata: {
    originalSize: { width: number; height: number; };
    fileSize: number;            // bytes
    format: string;              // "jpg", "png", "webp"
    colorPalette: string[];      // ["#1a1a1a", "#8b4513", "#daa520"]
    averageColor: string;        // "#4a4a4a"
    exif?: {
      camera?: string;
      lens?: string;
      settings?: string;
      dateCreated?: string;
    };
  };
  accessibility: {
    altText: string;
    description?: string;
    colorDescription?: string;   // "Warm browns and golds"
  };
  sharing: {
    directUrl: string;           // Deep link to this specific image
    embedCode: string;           // For website embedding
    socialUrls: {
      facebook: string;
      twitter: string;
      instagram: string;
      pinterest: string;
    };
  };
}

interface Image {
  id: string;                    // "metal-sculpture-007"
  filename: string;              // "metal_sculpture_007.jpg"
  title: string;                 // "Twisted Steel #7"
  caption?: string;              // Optional caption
  directoryId: string;           // Parent directory
  carouselId?: string;           // If part of carousel
  position: number;              // Order within directory/carousel
  urls: {
    thumbnail: string;           // 300x300
    small: string;               // 800x600
    medium: string;              // 1200x900
    large: string;               // 1920x1440
    original: string;            // Full resolution
  };
  dimensions: {
    width: number;
    height: number;
    aspectRatio: number;         // width/height
  };
  status: 'published' | 'processing' | 'failed';
  createdAt: string;             // ISO date
  updatedAt: string;             // ISO date
}
```

### **2.3 Carousel Endpoints**

#### **GET /api/v1/carousels/:carouselId**
*Get carousel with images and configuration*

```typescript
interface CarouselResponse {
  success: true;
  data: {
    carousel: CarouselDetail;
    images: Image[];
    totalImages: number;
  };
}

interface CarouselDetail {
  id: string;                    // "metal-series-main"
  title: string;                 // "Metal Series"
  subtitle?: string;             // "Oxidized steel works"
  directoryId: string;           // Parent directory
  layout: 'single' | 'side-by-side' | 'stacked';
  transitionType: 'fade' | 'slide' | 'zoom' | 'flip';
  autoplaySpeed: number;         // milliseconds
  showCaptions: boolean;
  enableFullscreen: boolean;
  backgroundColor: string;       // rgba(0,0,0,0.3)
  position: number;              // Order within directory
  imageIds: string[];            // Ordered list of image IDs
}
```

---

## **3. SOCIAL ENGAGEMENT API**

### **3.1 Reaction Endpoints**

#### **POST /api/v1/reactions**
*Add reaction to image*

```typescript
interface AddReactionRequest {
  imageId: string;
  reactionType: ReactionType;
  sessionId?: string;            // For anonymous tracking
}

interface AddReactionResponse {
  success: true;
  data: {
    reaction: ReactionRecord;
    newCounts: ReactionCounts;
    rateLimit: {
      remaining: number;
      resetTime: string;
    };
  };
}

type ReactionType = 'like' | 'love' | 'wow' | 'sad' | 'hate' | 'dislike' | 'inquire' | 'purchase';

interface ReactionRecord {
  id: string;
  imageId: string;
  reactionType: ReactionType;
  ipHash: string;                // Hashed for privacy
  sessionId?: string;
  createdAt: string;
}

interface ReactionCounts {
  like: number;
  love: number;
  wow: number;
  sad: number;
  hate: number;
  dislike: number;
  inquire: number;
  purchase: number;
  total: number;
}
```

#### **GET /api/v1/reactions/image/:imageId**
*Get reaction counts for specific image*

```typescript
interface ImageReactionsResponse {
  success: true;
  data: {
    imageId: string;
    counts: ReactionCounts;
    userReaction?: ReactionType;   // Current user's reaction
    topReaction: ReactionType;     // Most popular
    recentActivity: {
      reactionType: ReactionType;
      count: number;
      timeframe: string;           // "last_24h"
    }[];
  };
}
```

### **3.2 Business Inquiry Endpoints**

#### **POST /api/v1/inquiries**
*Submit business inquiry (triggered by inquire/purchase reactions)*

```typescript
interface InquiryRequest {
  imageId: string;
  inquiryType: 'inquire' | 'purchase';
  contactInfo: {
    name?: string;
    email: string;
    phone?: string;
    company?: string;
  };
  message?: string;
  intendedUse?: string;          // "commercial", "personal", "editorial"
  budget?: string;               // Optional budget range
}

interface InquiryResponse {
  success: true;
  data: {
    inquiryId: string;
    confirmationCode: string;
    estimatedResponse: string;    // "within 24 hours"
    autoReplyMessage: string;
  };
}
```

### **3.3 Sharing Endpoints**

#### **POST /api/v1/share**
*Generate sharing URLs and track sharing events*

```typescript
interface ShareRequest {
  imageId: string;
  platform: 'facebook' | 'twitter' | 'instagram' | 'pinterest' | 'email' | 'copy';
  context?: {
    carouselId?: string;
    position?: number;
    view?: 'fullscreen' | 'normal';
  };
}

interface ShareResponse {
  success: true;
  data: {
    shareUrl: string;
    platformSpecific: {
      optimizedImage: string;     // Platform-optimized image URL
      suggestedText: string;      // Pre-filled sharing text
      hashTags: string[];         // Relevant hashtags
    };
    trackingId: string;           // For analytics
  };
}
```

---

## **4. NAVIGATION & SEARCH API**

### **4.1 Navigation Endpoints**

#### **GET /api/v1/navigation**
*Get complete site navigation structure*

```typescript
interface NavigationResponse {
  success: true;
  data: {
    mainMenu: NavigationItem[];
    breadcrumbs: BreadcrumbItem[];
    featuredDirectories: Directory[];
    siteMap: {
      totalDirectories: number;
      totalImages: number;
      lastUpdated: string;
    };
  };
}

interface NavigationItem {
  id: string;
  title: string;
  slug: string;
  url: string;                   // "/sculptures/metal-series"
  order: number;
  children?: NavigationItem[];   // For nested categories
  imageCount: number;
  coverImage?: string;
  isActive: boolean;             // Current page
}

interface BreadcrumbItem {
  title: string;
  url: string;
  isActive: boolean;
}
```

### **4.2 Search Endpoints**

#### **GET /api/v1/search?q=:query**
*Search across all content*

```typescript
interface SearchResponse {
  success: true;
  data: {
    query: string;
    results: {
      directories: SearchResult[];
      images: SearchResult[];
      total: number;
    };
    suggestions: string[];        // "Did you mean..."
    facets: {
      categories: FacetCount[];
      tags: FacetCount[];
      colors: FacetCount[];
    };
  };
}

interface SearchResult {
  type: 'directory' | 'image';
  id: string;
  title: string;
  description: string;
  url: string;
  thumbnailUrl: string;
  relevanceScore: number;        // 0-1
  highlightedText?: string;      // Matched text snippet
}

interface FacetCount {
  value: string;
  count: number;
  selected: boolean;
}
```

---

## **5. REAL-TIME WEBSOCKET API**

### **5.1 WebSocket Connection**

```typescript
// Connection
const ws = new WebSocket('ws://localhost:4000/api/v1/ws');

// Message Format
interface WSMessage {
  type: WSMessageType;
  data: any;
  timestamp: string;
  id: string;
}

type WSMessageType =
  | 'reaction_updated'
  | 'image_uploaded'
  | 'directory_published'
  | 'user_presence'
  | 'error'
  | 'heartbeat';
```

### **5.2 Real-Time Events**

```typescript
// Reaction Updates
interface ReactionUpdatedEvent {
  type: 'reaction_updated';
  data: {
    imageId: string;
    reactionType: ReactionType;
    newCounts: ReactionCounts;
    animation?: 'pulse' | 'burst' | 'wave';
  };
}

// Content Updates
interface ContentUpdatedEvent {
  type: 'directory_published';
  data: {
    directoryId: string;
    title: string;
    imageCount: number;
    notification: string;         // "New artwork collection added!"
  };
}
```

---

## **6. MOCK DATA FOR FRONTEND DEVELOPMENT**

### **6.1 Mock API Setup**

Frontend developers can use these mock responses during development:

```typescript
// Mock API Client
export const mockAPI = {
  directories: {
    list: (): Promise<DirectoryListResponse> =>
      Promise.resolve(mockDirectoryListResponse),
    get: (slug: string): Promise<DirectoryDetailResponse> =>
      Promise.resolve(mockDirectoryDetailResponse),
  },
  images: {
    get: (id: string): Promise<ImageDetailResponse> =>
      Promise.resolve(mockImageDetailResponse),
  },
  reactions: {
    add: (req: AddReactionRequest): Promise<AddReactionResponse> =>
      Promise.resolve(mockReactionResponse),
    get: (imageId: string): Promise<ImageReactionsResponse> =>
      Promise.resolve(mockReactionCounts),
  }
};

// Development flag to switch between mock and real API
const USE_MOCK_API = process.env.NODE_ENV === 'development' &&
                    !process.env.NEXT_PUBLIC_USE_REAL_API;
```

### **6.2 Mock Data Examples**

```typescript
const mockDirectoryListResponse: DirectoryListResponse = {
  success: true,
  data: {
    directories: [
      {
        id: "sculptures-metal",
        title: "Metal Sculptures",
        subtitle: "Oxidized steel and copper works",
        description: "A collection exploring industrial materials...",
        slug: "sculptures/metal",
        coverImage: "/images/sculptures/metal/hero.jpg",
        imageCount: 24,
        lastModified: "2024-09-29T10:00:00Z",
        featured: true,
        menuOrder: 1,
        status: "published",
        tags: ["sculpture", "metal", "abstract"]
      },
      // ... more directories
    ],
    featured: [/* featured directories */],
    totalImages: 1247
  }
};

const mockImageDetailResponse: ImageDetailResponse = {
  success: true,
  data: {
    image: {
      id: "metal-sculpture-007",
      filename: "twisted_steel_007.jpg",
      title: "Twisted Steel #7",
      caption: "Oxidized steel with copper accents",
      directoryId: "sculptures-metal",
      position: 7,
      urls: {
        thumbnail: "/images/sculptures/metal/twisted_steel_007_thumb.jpg",
        small: "/images/sculptures/metal/twisted_steel_007_800.jpg",
        medium: "/images/sculptures/metal/twisted_steel_007_1200.jpg",
        large: "/images/sculptures/metal/twisted_steel_007_1920.jpg",
        original: "/images/sculptures/metal/twisted_steel_007_original.jpg"
      },
      dimensions: {
        width: 4096,
        height: 2731,
        aspectRatio: 1.5
      },
      status: "published",
      createdAt: "2024-09-15T14:30:00Z",
      updatedAt: "2024-09-15T14:30:00Z",
      metadata: {
        originalSize: { width: 4096, height: 2731 },
        fileSize: 8432156,
        format: "jpg",
        colorPalette: ["#1a1a1a", "#8b4513", "#daa520", "#2f4f4f"],
        averageColor: "#4a4a4a"
      },
      accessibility: {
        altText: "Abstract twisted steel sculpture with oxidized copper accents",
        description: "A vertical sculpture featuring twisted steel forms...",
        colorDescription: "Dark steel with warm copper highlights"
      },
      sharing: {
        directUrl: "https://portfolio.lupo.art/sculptures/metal?image=twisted-steel-007",
        embedCode: "<iframe src='...'></iframe>",
        socialUrls: {
          facebook: "https://www.facebook.com/sharer/...",
          twitter: "https://twitter.com/intent/tweet...",
          instagram: "https://www.instagram.com/...",
          pinterest: "https://pinterest.com/pin/create/..."
        }
      }
    },
    related: [/* related images */],
    reactions: {
      like: 42,
      love: 18,
      wow: 31,
      sad: 2,
      hate: 0,
      dislike: 1,
      inquire: 5,
      purchase: 3,
      total: 102
    }
  }
};
```

---

## **7. ERROR HANDLING PATTERNS**

### **7.1 Standard Error Responses**

```typescript
interface ErrorResponse {
  success: false;
  message: string;
  errors: APIError[];
  code: string;
  timestamp: string;
}

// Validation Error Example
const validationErrorResponse: ErrorResponse = {
  success: false,
  message: "Validation failed",
  errors: [
    {
      code: "REQUIRED_FIELD",
      message: "Email address is required",
      field: "email"
    },
    {
      code: "INVALID_FORMAT",
      message: "Invalid email format",
      field: "email",
      details: { received: "not-an-email" }
    }
  ],
  code: "VALIDATION_ERROR",
  timestamp: "2024-09-29T10:00:00Z"
};
```

### **7.2 Rate Limiting**

```typescript
interface RateLimitError extends ErrorResponse {
  code: "RATE_LIMIT_EXCEEDED";
  details: {
    limit: number;              // requests per window
    windowMs: number;           // window in milliseconds
    remaining: number;          // requests remaining
    resetTime: string;          // when limit resets
    retryAfter: number;         // seconds to wait
  };
}
```

---

## **8. COORDINATION PROTOCOLS**

### **8.1 Team Communication Standards**

**When Frontend Needs Backend Changes:**
```typescript
// Create task via coordination system
{
  title: "Add image metadata endpoint",
  assignedTo: "backend-specialist",
  priority: "high",
  description: `
    Frontend needs additional metadata fields for image detail pages:

    Required fields:
    - colorPalette: string[]
    - averageColor: string
    - accessibilityDescription: string

    Endpoint: GET /api/v1/images/:id/metadata
    Expected format: See API spec section 2.2

    Blocker for: Image detail page implementation
    Timeline: Needed by end of week
  `
}
```

**When Backend Needs Frontend Changes:**
```typescript
// Create task via coordination system
{
  title: "Update reaction animation timing",
  assignedTo: "frontend-specialist",
  priority: "medium",
  description: `
    WebSocket reaction events now include animation field.

    New event format:
    {
      type: 'reaction_updated',
      data: {
        imageId: string,
        reactionType: ReactionType,
        newCounts: ReactionCounts,
        animation: 'pulse' | 'burst' | 'wave'  // NEW FIELD
      }
    }

    Please implement different animations based on this field.
    Default to 'pulse' if field missing for backwards compatibility.
  `
}
```

### **8.2 Integration Testing Protocol**

```typescript
// Shared API Contract Tests
describe('Content API Contract', () => {
  test('GET /api/v1/directories returns correct structure', async () => {
    const response = await api.get('/directories');

    expect(response.data).toMatchSchema(DirectoryListResponse);
    expect(response.data.directories[0]).toHaveProperty('id');
    expect(response.data.directories[0]).toHaveProperty('title');
    // ... validate all required fields
  });
});
```

---

## **9. DEVELOPMENT WORKFLOW**

### **9.1 Parallel Development Process**

1. **API-First Design** ✅ (This document)
2. **Frontend Development**: Use mock API, implement UI components
3. **Backend Development**: Implement real API endpoints matching spec
4. **Integration**: Switch frontend from mock to real API
5. **Contract Testing**: Verify API matches specification exactly
6. **End-to-End Testing**: Test complete user workflows

### **9.2 Mock-to-Real API Transition**

```typescript
// Environment-based API switching
const apiClient = process.env.NODE_ENV === 'development' &&
                 process.env.NEXT_PUBLIC_USE_MOCK_API === 'true'
  ? mockAPIClient
  : realAPIClient;

// Gradual endpoint transition
const api = {
  directories: {
    list: USE_REAL_DIRECTORIES_API ? realAPI.directories.list : mockAPI.directories.list,
    get: USE_REAL_DIRECTORIES_API ? realAPI.directories.get : mockAPI.directories.get,
  },
  // ... other endpoints
};
```

---

## **CONCLUSION**

This API specification enables **complete parallel development** between frontend and backend teams:

✅ **Frontend team can begin immediately** using mock data and TypeScript interfaces
✅ **Backend team has exact requirements** for each endpoint and response format
✅ **No integration surprises** - contracts are defined upfront
✅ **Easy coordination** via the production coordination system for changes
✅ **Type safety** prevents common integration bugs
✅ **Testable contracts** ensure compatibility

**Next Steps**:
1. Create tasks for specialist teams using this specification
2. Frontend specialist uses mock API to build components
3. Backend specialist implements real endpoints matching these contracts
4. Teams coordinate changes via the coordination system

This foundation will prevent the integration issues you experienced in previous projects! 🚀

**Context Status**: 🟡 Warming (~140k/200k tokens) - claude-code-Foundation-Phoenix-2025-09-29