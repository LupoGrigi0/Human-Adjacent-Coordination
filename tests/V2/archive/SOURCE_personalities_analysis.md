# Personalities.js Handler Analysis

## Overview
The `personalities.js` module in `/mnt/coordinaton_mcp_data/worktrees/foundation/src/v2/personalities.js` provides handlers for listing and retrieving personality metadata in the V2 coordination system.

**Module Created:** 2025-12-29
**Author:** Crossing (Integration Engineer)

---

## Functions/Endpoints Defined

### 1. `listPersonalities(params = {})`
- **HACS Tool Name:** `get_personalities`
- **Version:** 2.0.0
- **Category:** identity
- **Status:** stable
- **Parameters:** None required
- **Purpose:** Returns a list of all available personalities in the coordination system

### 2. `getPersonality(params = {})`
- **HACS Tool Name:** `get_personality`
- **Version:** 2.0.0
- **Category:** identity
- **Status:** stable
- **Parameters:**
  - `personalityId` (string, required) - Personality identifier
- **Purpose:** Retrieves detailed information about a specific personality

---

## Expected File Structure

### Directory Layout
```
<personalitiesDir>/
├── <personalityId>/
│   ├── personality.json
│   └── *.md (wisdom files and documents)
```

### personality.json Schema

The module expects each personality directory to contain a `personality.json` file with the following fields:

| Field | Type | Required | Default | Purpose |
|-------|------|----------|---------|---------|
| `personalityId` | string | Yes | Entry directory name | Unique identifier for the personality |
| `description` | string | No | Empty string | Human-readable description of the personality |
| `requiresToken` | boolean | No | false | Whether adoption requires authentication token |
| `wisdomFiles` | array | No | Empty array | List of wisdom files available in the personality |

**Example structure:**
```json
{
  "personalityId": "Bridge",
  "description": "Integration-focused personality for coordination",
  "requiresToken": false,
  "wisdomFiles": ["gestalt.md", "protocols.md"]
}
```

### Wisdom Directory
- Personality directories contain Markdown files (`.md`)
- These files are discovered dynamically by the `getPersonality` function
- The `wisdomFiles` field in personality.json should reference key documents
- All `.md` files in the directory are returned in the `documents` array

---

## Existing Summary/Detail Endpoints

**YES** - The module already supports detailed personality retrieval:

- **`getPersonality()`** serves as a comprehensive detail endpoint
  - Returns full personality metadata
  - Lists all available documents/wisdom files
  - Indicates token requirements
  - Includes descriptions

**No separate `get_personality_summary`** exists - the `listPersonalities()` endpoint provides summary information, while `getPersonality()` provides full details.

---

## listPersonalities Return Fields

### Response Structure
```javascript
{
  success: boolean,
  personalities: [
    {
      id: string,           // Personality identifier
      name: string,         // Display name (same as id)
      description: string,  // Description of the personality
      requiresToken: boolean // Whether token is required for adoption
    },
    // ... more personality objects
  ],
  metadata: {
    timestamp: string,  // ISO format timestamp
    total: number       // Total count of personalities
  }
}
```

### Error Response
```javascript
{
  success: false,
  error: {
    message: string,  // Error message
    details: string   // Additional error details (if applicable)
  }
}
```

---

## getPersonality Return Fields

### Success Response
```javascript
{
  success: true,
  personality: {
    id: string,              // Personality identifier
    name: string,            // Display name
    description: string,     // Description
    requiresToken: boolean,  // Token requirement flag
    wisdomFiles: array,      // Wisdom files from personality.json
    documents: array         // All .md files in the personality directory
  },
  metadata: {
    timestamp: string  // ISO format timestamp
  }
}
```

### Error Response
```javascript
{
  success: false,
  error: {
    message: string,  // Error message
    details: string   // Additional error details (if applicable)
  }
}
```

---

## Key Implementation Details

1. **Directory Scanning:** Uses `listDir()` utility to discover personality directories
2. **JSON Parsing:** Uses `readJSON()` utility to load personality.json files
3. **Fallback Handling:** Uses directory name as fallback for `personalityId` and `name` if not in JSON
4. **Document Discovery:** Dynamically scans for `.md` files in each personality directory
5. **Error Handling:** Wraps both functions with try-catch and returns success/error responses
6. **Metadata Tracking:** Includes ISO timestamps and counts in responses

---

## Dependencies

- **Imports:**
  - `getPersonalitiesDir` from `./config.js`
  - `listDir`, `readJSON` from `./data.js`
  - `path` (Node.js built-in)

---

## Notes

- No authentication/authorization logic in these handlers - validation happens at HACS level
- Both functions use async/await pattern
- Graceful handling of missing JSON files (returns null from readJSON)
- Directory-based discovery allows for easy addition of new personalities without code changes
