# roles.js Handler Analysis

**File:** `/mnt/coordinaton_mcp_data/worktrees/foundation/src/v2/roles.js`

## 1. Functions/Endpoints Defined

### Exported Handlers Object (`handlers`)

The module exports 4 async endpoint handlers:

1. **`get_available_roles(params = {})`**
   - No required parameters
   - Returns all available roles with metadata

2. **`get_role_documents(params = {})`**
   - Required parameter: `role_name`
   - Returns list of documents for a specific role

3. **`get_role_document(params = {})`**
   - Required parameters: `role_name`, `document_name`
   - Returns content of a specific role document

4. **`get_all_role_documents(params = {})`**
   - Required parameter: `role_name`
   - Returns all documents for a specific role with their full content

### Internal Helper Functions

1. **`loadRolesConfig()`**
   - Loads and parses roles.json configuration file
   - Throws error if file not found

2. **`getRoleDocumentList(roleName)`**
   - Returns array of .md files in a role's directory
   - Returns empty array if directory doesn't exist
   - Includes file metadata (name, size, last_modified)

3. **`getRoleDocumentContent(roleName, documentName)`**
   - Reads single document content from role directory
   - Validates document name (prevents path traversal)
   - Only supports .md files
   - Includes metadata (document_name, role_name, content, size, last_modified)

4. **`getAllRoleDocuments(roleName)`**
   - Iterates through all documents and collects their content
   - Skips documents that fail to read

5. **`getDataDir()`**
   - Returns base directory for data files
   - Checks production environment first: `/mnt/coordinaton_mcp_data/production-data`
   - Falls back to development: `{src_parent}/data`

## 2. File Structure Expected

### Directory Structure
```
{DATA_DIR}/roles/
├── roles.json                    (Configuration file)
├── {RoleName}/
│   ├── document1.md
│   ├── document2.md
│   └── ...
└── {AnotherRole}/
    └── ...
```

### roles.json Schema
The code expects the following fields in roles.json:

```json
{
  "schema_version": "<string>",
  "categories": {},
  "roles": {
    "{role_name}": {
      // Role definition object
    }
  },
  "role_combination_examples": [],    // Optional, defaults to []
  "authorization_hierarchy": [],       // Optional, defaults to []
  "overlay_system_notes": []          // Optional, defaults to []
}
```

### Role Documents
- Must be `.md` (Markdown) files
- Located in `{DATA_DIR}/roles/{RoleName}/`
- File metadata tracked: name, size, last_modified (ISO timestamp)

## 3. Pre-existing Support Analysis

**`list_roles`**: NOT supported
- No endpoint named `list_roles`
- Closest equivalent is `get_available_roles()` which returns all roles

**`get_role_summary`**: NOT supported
- No endpoint provides role summaries
- `get_available_roles()` returns full role objects from roles.json
- `get_role_documents()` returns role info + document list

## 4. Response Fields by Endpoint

### `get_available_roles()` Response

**Success Response:**
```javascript
{
  success: true,
  data: {
    schema_version: "<string>",
    categories: {},
    roles: {
      // Full role objects from roles.json
    },
    role_combinations: [],
    authorization_hierarchy: [],
    overlay_notes: []
  },
  metadata: {
    timestamp: "<ISO string>",
    function: 'get_available_roles',
    total_roles: <number>
  }
}
```

**Error Response:**
```javascript
{
  success: false,
  error: {
    message: 'Failed to retrieve available roles',
    details: "<error message>",
    timestamp: "<ISO string>"
  }
}
```

### `get_role_documents(params)` Response

**Parameters:**
- `role_name`: string (required)

**Success Response:**
```javascript
{
  success: true,
  data: {
    role_name: "<string>",
    role_info: { /* role object from roles.json */ },
    documents: [
      {
        name: "<filename>",
        size: <number>,
        last_modified: "<ISO string>"
      },
      // ... more documents
    ]
  },
  metadata: {
    timestamp: "<ISO string>",
    function: 'get_role_documents',
    document_count: <number>
  }
}
```

**Error Responses:**
- Missing role_name parameter
- Role not found (includes available_roles list)
- Failed to retrieve documents

### `get_role_document(params)` Response

**Parameters:**
- `role_name`: string (required)
- `document_name`: string (required, must end in .md)

**Success Response:**
```javascript
{
  success: true,
  data: {
    document_name: "<filename>",
    role_name: "<string>",
    content: "<full markdown content>",
    size: <number>,
    last_modified: "<ISO string>"
  },
  metadata: {
    timestamp: "<ISO string>",
    function: 'get_role_document'
  }
}
```

**Error Responses:**
- Missing role_name or document_name parameters
- Role not found
- Document not found
- Invalid document name (contains .., /, or \)
- Non-.md file requested

### `get_all_role_documents(params)` Response

**Parameters:**
- `role_name`: string (required)

**Success Response:**
```javascript
{
  success: true,
  data: {
    role_name: "<string>",
    role_info: { /* role object from roles.json */ },
    documents: [
      {
        document_name: "<filename>",
        role_name: "<string>",
        content: "<full markdown content>",
        size: <number>,
        last_modified: "<ISO string>"
      },
      // ... more documents with full content
    ]
  },
  metadata: {
    timestamp: "<ISO string>",
    function: 'get_all_role_documents',
    document_count: <number>
  }
}
```

**Error Responses:**
- Missing role_name parameter
- Role not found
- Failed to retrieve documents

## 5. Key Implementation Notes

- **Path Traversal Protection**: Document names validated to prevent `..`, `/`, or `\` characters
- **File Type Restriction**: Only .md (Markdown) files supported
- **Graceful Degradation**: Unreadable documents are skipped rather than failing entire request
- **Data Directory Logic**: Production-first strategy (checks `/mnt/coordinaton_mcp_data/production-data` before falling back to development)
- **Consistent Response Structure**: All endpoints follow standardized success/error format with metadata
- **Role Validation**: All document endpoints verify role exists in roles.json before attempting file operations
- **ISO Timestamps**: All timestamps in ISO 8601 format

## 6. Summary

**Does NOT support:**
- `list_roles` endpoint (but `get_available_roles` serves this purpose)
- `get_role_summary` endpoint (use `get_available_roles` or `get_role_documents` instead)

**Supports:**
- Full role discovery via `get_available_roles`
- Role document listing and content retrieval
- Batch document retrieval for roles
- Schema version tracking
- Role categories, combinations, and authorization hierarchy metadata
