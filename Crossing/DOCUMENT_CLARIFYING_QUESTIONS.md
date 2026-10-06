# Document Feature - Clarifying Questions

**Created:** 2026-01-16 by Crossing-2d23
**Status:** AWAITING ANSWERS

## Questions for Lupo

### 1. Search Functions - V1 or V2?
- Option A: Include `search_documents()` and `search_in_document()` in V1
- Option B: Defer search to V2
- **My recommendation: Option B** - core CRUD first

### 2. Vital Documents Storage
- Option A: In `preferences.json` as `"vitalDocuments": ["gestalt.md", ...]`
- Option B: Separate file `vital_documents.json`
- **My recommendation: Option A** - consistent with projects

### 3. Document Metadata (created/modified/audience)
- Option A: Store in separate `documents_index.json` file
- Option B: Store metadata in document frontmatter (YAML)
- Option C: Just filesystem timestamps, track audience separately
- **My recommendation: Option A** - clean separation

### 4. Archive Directory Name
- Option A: `_archive/` (underscore prefix)
- Option B: `archive/`
- Option C: `.archive/` (dot prefix)
- **My recommendation: Option A** - visible but special

### 5. File Extensions
- Option A: Enforce `.md` only
- Option B: Allow any extension
- Option C: Allow specific extensions (`.md`, `.txt`, `.json`)
- **My recommendation: Option B** - flexibility

### 6. Target Parameter Format
- Option A: Two params: `targetType` + `targetId`
- Option B: Single param with prefix: `"project:paula-book"`
- Option C: Separate API endpoints per target type
- **My recommendation: Option B** - cleaner API

### 7. Default Behavior (no target specified)
- Option A: Operate on caller's own instance documents
- Option B: Require explicit target always
- Option C: Error if no target
- **My recommendation: Option A** - intuitive UX

---

## Context Files to Read After Compaction

1. `/mnt/coordinaton_mcp_data/worktrees/foundation/Crossing/01-Crossing_gestalt.md`
2. `/mnt/coordinaton_mcp_data/worktrees/foundation/Crossing/Crossing_Diary.md`
3. `/mnt/coordinaton_mcp_data/worktrees/foundation/Crossing/DOCUMENT_FEATURE_EXPLORATION.md`
4. `/mnt/coordinaton_mcp_data/worktrees/foundation/Crossing/DOCUMENT_CLARIFYING_QUESTIONS.md` (this file)
5. `/mnt/coordinaton_mcp_data/worktrees/foundation/Crossing/CrossingConversation.md` lines 6130-6249
6. `/mnt/coordinaton_mcp_data/worktrees/foundation/docs/Post V2 Technical Debt.md` lines 26-40
7. HACS get_diary for Crossing-2d23
