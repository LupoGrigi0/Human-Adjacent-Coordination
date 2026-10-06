# Messenger Consolidation Handoff

**From:** Crossing (Integration Engineer)
**To:** Messenger (Messaging Specialist)
**Date:** 2025-12-23
**Re:** Directory consolidation impact on messaging handlers

---

## Executive Summary

During the V2 directory consolidation, we discovered that the messaging system handlers use **hardcoded relative paths** that differ from the centralized configuration used by V2 handlers. This document explains what needs to change and why.

---

## The Problem

### V2 Handlers (Consolidated)
All V2 handlers in `src/v2/` import from a centralized config:

```javascript
// src/v2/config.js
export const DATA_ROOT = process.env.V2_DATA_ROOT || '/mnt/coordinaton_mcp_data/';

export function getInstancesDir() {
  return path.join(DATA_ROOT, 'instances/');
}
```

This allows the data location to be controlled via environment variable and defaults to the consolidated location.

### Messaging Handlers (Hardcoded)
The messaging handlers in `src/handlers/` each define their own path:

```javascript
// Example from messages-v3.js line 13
const DATA_DIR = 'data';
const MESSAGES_DIR = join(DATA_DIR, 'messages');
```

This means:
- Messaging ONLY works when the server's working directory contains a `data/` subdirectory
- The path cannot be configured via environment variable
- Messaging data is isolated from the consolidated V2 data structure

---

## Files That Need Updates

| File | Line | Current Code | Issue |
|------|------|--------------|-------|
| `src/handlers/messages.js` | 12 | `const DATA_DIR = 'data'` | Hardcoded relative path |
| `src/handlers/messages-v2.js` | 13 | `const DATA_DIR = 'data'` | Hardcoded relative path |
| `src/handlers/messages-v3.js` | 13 | `const DATA_DIR = 'data'` | **ACTIVE** - Hardcoded relative path |
| `src/handlers/instances.js` | 11 | `const DATA_DIR = 'data'` | Hardcoded relative path |
| `src/handlers/projects.js` | 13 | `const DATA_DIR = 'data'` | Hardcoded relative path |
| `src/handlers/lessons.js` | 19 | `const DATA_DIR = 'data'` | Hardcoded relative path |
| `src/handlers/tasks.js` | 12 | `const DATA_DIR = 'data'` | Hardcoded relative path |
| `src/handlers/tasks-v2.js` | 13 | `const DATA_DIR = 'data'` | Hardcoded relative path |

**Priority:** `messages-v3.js` is the actively used messaging handler.

---

## Recommended Fix

### Option A: Import from V2 Config (Preferred)

```javascript
// Before (messages-v3.js)
const DATA_DIR = 'data';
const MESSAGES_DIR = join(DATA_DIR, 'messages');

// After
import { DATA_ROOT } from '../v2/config.js';
const MESSAGES_DIR = join(DATA_ROOT, 'messages');
```

**Benefits:**
- Single source of truth for data paths
- Respects `V2_DATA_ROOT` environment variable
- Aligns with V2 architecture

### Option B: Use Environment Variable Directly

```javascript
// Before
const DATA_DIR = 'data';

// After
const DATA_DIR = process.env.V2_DATA_ROOT || '/mnt/coordinaton_mcp_data/';
```

**Benefits:**
- Minimal code change
- No new imports needed

---

## Current Data Locations

### Where Messaging Data Lives Now

**Dev Server (v2-dev):**
- Working directory: `/mnt/coordinaton_mcp_data/v2-dev`
- Messages resolve to: `/mnt/coordinaton_mcp_data/v2-dev/data/messages/`

**Consolidated Location (V2):**
- Messages should be at: `/mnt/coordinaton_mcp_data/messages/`

### Data Migration

If you update the paths, you may need to move existing message data:

```bash
# Move from v2-dev relative location to consolidated location
mv /mnt/coordinaton_mcp_data/v2-dev/data/messages \
   /mnt/coordinaton_mcp_data/messages
```

Or create a symlink for backwards compatibility:
```bash
ln -s /mnt/coordinaton_mcp_data/messages \
      /mnt/coordinaton_mcp_data/v2-dev/data/messages
```

---

## Testing Checklist

After making changes, verify:

- [ ] `send_message` works (new messages stored in correct location)
- [ ] `get_messages` works (can read existing messages)
- [ ] Instance-specific inboxes work (`messages/instances/{id}/`)
- [ ] Project-specific messages work (`messages/projects/{id}/`)
- [ ] Message archiving works
- [ ] No errors in server logs

---

## Questions?

If you have questions about this consolidation:
1. Check the full plan: `docs/directory-consolidation-plan.md`
2. Check my diary: `Crossing/Crossing_Diary.md`
3. Message me or Lupo

---

## Context: Why We're Doing This

The V2 system had instance data split across two locations:
- `/mnt/coordinaton_mcp_data/instances/` (Unix homes)
- `/mnt/coordinaton_mcp_data/v2-dev-data/instances/` (API data)

We consolidated everything to `/mnt/coordinaton_mcp_data/` as the single source of truth. The messaging handlers are the remaining piece that still uses the old `data/` relative path pattern.

---

**END OF HANDOFF**
