# Coding Conventions

**Analysis Date:** 2026-01-28

## Naming Patterns

**Files:**
- Source files: `kebab-case.js` (e.g., `task-management.js`, `git-operations.js`)
- Test files: `*.test.js` co-located or in `tests/` directory
- Handler files: named by domain (e.g., `messages.js`, `instances.js`, `tasks.js`)
- Config files: simple names (e.g., `config.js`, `data.js`, `logger.js`)

**Functions:**
- camelCase for all functions: `getMyTasks`, `readPreferences`, `writeJSON`
- Async handlers use `async function` declaration style
- Export functions individually: `export async function functionName(params)`
- Factory functions use `create` prefix: `createLogger()`

**Variables:**
- camelCase for variables and parameters
- UPPER_SNAKE_CASE for constants: `DATA_ROOT`, `XMPP_CONFIG`, `SECURITY_LIMITS`
- Destructured params pattern: `const { instanceId, name, ...rest } = params`

**Types/Classes:**
- PascalCase for classes: `MCPCoordinationServer`, `MessageHandler`, `FileManager`, `Logger`
- Classes use static methods for handlers: `static async sendMessage(params)`

## Code Style

**Formatting:**
- Prettier configured (version ^3.1.1)
- Run: `npm run format` to format `src/`

**Linting:**
- ESLint 8.x with Airbnb base config
- Plugins: `eslint-plugin-import`
- Run: `npm run lint` or `npm run lint:fix`

**Key Style Rules:**
- 2-space indentation
- Single quotes for strings (from Airbnb config)
- Trailing commas in multiline
- No semicolons (varies by file, some inconsistency exists)

## Import Organization

**Order:**
1. Node.js built-ins: `import fs from 'fs/promises'`, `import path from 'path'`
2. External packages: `import express from 'express'`, `import { randomUUID } from 'crypto'`
3. Internal modules (relative paths): `import { getInstanceDir } from './config.js'`

**Path Aliases:**
- No aliases configured - all relative paths
- V2 modules import from `./` (same directory) or `../` (parent)

**ES Modules:**
- Project uses `"type": "module"` in package.json
- All imports use ESM syntax: `import/export`
- File extensions required: `import { foo } from './bar.js'`

## Error Handling

**Patterns:**
- All API handlers return `{ success: boolean, ... }` response objects
- Errors wrapped in `{ success: false, error: { code, message, suggestion? } }`
- Error codes use UPPER_SNAKE_CASE: `INVALID_INSTANCE_ID`, `MISSING_PARAMETER`
- Try/catch at handler boundaries, not internal functions

**Example Pattern:**
```javascript
export async function someHandler(params) {
  const metadata = {
    timestamp: new Date().toISOString(),
    function: 'someHandler'
  };

  if (!params.requiredField) {
    return {
      success: false,
      error: {
        code: 'MISSING_PARAMETER',
        message: 'requiredField is required'
      },
      metadata
    };
  }

  try {
    // ... operation
    return {
      success: true,
      data: result,
      metadata
    };
  } catch (error) {
    return {
      success: false,
      error: {
        code: 'OPERATION_FAILED',
        message: error.message
      },
      metadata
    };
  }
}
```

**File Operations:**
- `ENOENT` errors return null instead of throwing
- Atomic writes: temp file + rename pattern
- Directory creation uses `{ recursive: true }`

## Logging

**Framework:** Winston (^3.11.0) with custom `Logger` class in `src/logger.js`

**Patterns:**
- Logger methods are async: `await logger.info('message')`
- Supports stdio mode (file-only logging) for MCP protocol compliance
- Factory function: `createLogger(logFileName, forceFileOnly)`
- Default singleton: `export const logger = new Logger()`

**Log Levels:**
- `info` - Normal operation
- `warn` - Unexpected but recoverable
- `error` - Operation failures
- `debug` - Detailed debugging (often suppressed)

## Comments

**When to Comment:**
- File headers: Author, date, module purpose
- Security patches: Date and description
- Complex logic: Explain "why" not "what"
- API endpoints: Full JSDoc-style documentation

**JSDoc/TSDoc:**
- Extensive JSDoc for API endpoints using `@hacs-endpoint` template
- Required tags: `@tool`, `@version`, `@category`, `@description`, `@param`, `@returns`
- Optional tags: `@example`, `@error`, `@note`, `@see`, `@deprecated`

**@hacs-endpoint Template:**
```javascript
/**
 * @hacs-endpoint
 * @template-version 1.0.0
 * @tool function_name
 * @version 2.0.0
 * @since YYYY-MM-DD
 * @category category
 * @status stable
 *
 * @description
 * Multi-line description of what this endpoint does.
 *
 * @param {string} paramName - Description [required/optional]
 * @returns {object} ResponseType
 */
```

## Function Design

**Size:**
- Handler functions can be long (100-300 lines) with full documentation
- Utility functions kept short (10-50 lines)
- Complex operations split into helper functions

**Parameters:**
- Single `params` object for all API handlers
- Destructure at function start
- Use defaults: `const { field = 'default' } = params`

**Return Values:**
- API handlers always return objects with `success` boolean
- Include `metadata` with timestamp and function name
- Include human-readable `message` field for confirmations

## Module Design

**Exports:**
- Named exports for functions: `export async function handler(params)`
- Constants exported inline: `export const CONFIG = {...}`
- Default export for classes/main handlers: `export default MessageHandler`

**Barrel Files:**
- Not used - import directly from specific module files
- Entry points (`src/server.js`, `src/v2/index.js`) aggregate imports

**Handler Module Pattern:**
```javascript
// Option 1: Class with static methods + individual exports
class MessageHandler {
  static async sendMessage(params) { ... }
}
export const sendMessage = (params) => MessageHandler.sendMessage(params);
export default MessageHandler;

// Option 2: Pure functions (V2 style)
export async function bootstrap(params) { ... }
export async function introspect(params) { ... }
```

## API Response Structure

**Success Response:**
```javascript
{
  success: true,
  // Domain-specific data
  instanceId: '...',
  message: 'Human-readable confirmation',
  metadata: {
    timestamp: '2026-01-28T...',
    function: 'functionName'
  }
}
```

**Error Response:**
```javascript
{
  success: false,
  error: {
    code: 'ERROR_CODE',
    message: 'Human-readable error',
    suggestion: 'How to fix it'  // optional
  },
  metadata: {
    timestamp: '2026-01-28T...',
    function: 'functionName'
  }
}
```

## Security Patterns

**Input Validation:**
- Joi (^17.11.0) available but not universally used
- Manual validation at handler entry points
- Sanitization for shell commands: `sanitizeForShell()`, `sanitizeIdentifier()`

**Rate Limiting:**
- In-memory rate limit maps for sensitive operations
- `express-rate-limit` (^7.1.5) available for HTTP endpoints

**File Path Safety:**
- Always use `path.join()` for path construction
- Validate entity IDs before constructing paths

---

*Convention analysis: 2026-01-28*
