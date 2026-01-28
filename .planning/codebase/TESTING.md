# Testing Patterns

**Analysis Date:** 2026-01-28

## Test Framework

**Runner:**
- Jest ^29.7.0
- Config: `jest.config.js` (ESM export)

**Assertion Library:**
- Jest built-in assertions (`expect`)
- Imported explicitly: `import { describe, it, expect, beforeEach, jest } from '@jest/globals'`

**Run Commands:**
```bash
npm test                    # Run all tests (with ESM experimental flag)
npm run test:watch          # Watch mode
npm run test:coverage       # Coverage report
```

**Node Configuration:**
- Requires `NODE_OPTIONS='--experimental-vm-modules'` for ESM support
- Package uses `"type": "module"`

## Test File Organization

**Location:**
- Tests in `tests/` directory at project root
- Subdirectories: `tests/V1/`, `tests/V2/`, `tests/TestManagerSuccessor/`
- Test helpers in `tests/V1/test-helpers/`

**Naming:**
- Pattern: `*.test.js` (e.g., `bootstrap.test.js`, `messages-v2.test.js`)
- Manual tests: `test-*.js` (e.g., `test-proxy-connection.js`, `test-ssl-connection.js`)
- Validation scripts: `validate-*.js`

**Structure:**
```
tests/
├── V1/
│   ├── bootstrap.test.js           # Jest unit tests
│   ├── messages-v2.test.js         # Jest unit tests
│   ├── test-helpers/
│   │   └── setup.js                # Jest setup file
│   ├── test-proxy-connection.js    # Manual integration test
│   ├── validate-ssl-fix.js         # Manual validation script
│   └── mcp-smoke-test.js           # Manual smoke test
├── V2/
│   └── (test files)
└── TestManagerSuccessor/
    └── (test files)
```

## Test Structure

**Suite Organization:**
```javascript
/**
 * File header with description
 * @author instance-name
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { functionUnderTest } from '../path/to/module.js';

describe('Feature/Component Name', () => {
  describe('Sub-feature or Scenario', () => {
    beforeEach(() => {
      jest.clearAllMocks();
    });

    it('should describe expected behavior', () => {
      const result = functionUnderTest(input);
      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
    });

    it('should handle error case', () => {
      const result = functionUnderTest(badInput);
      expect(result.success).toBe(false);
      expect(result.error.code).toBe('EXPECTED_ERROR');
    });
  });
});
```

**Patterns:**
- Nested `describe` blocks for logical grouping
- `beforeEach` for mock cleanup (not data setup typically)
- `it` descriptions start with "should"
- Test both success and error paths

## Mocking

**Framework:** Jest built-in mocking

**Patterns:**
```javascript
import { jest, beforeEach } from '@jest/globals';
import { promises as fs } from 'fs';

// Module-level unstable mock (for ESM)
jest.unstable_mockModule('fs', () => ({
  promises: {
    readFile: jest.fn(),
    writeFile: jest.fn(),
    rename: jest.fn(),
    mkdir: jest.fn(),
    readdir: jest.fn(),
    access: jest.fn()
  }
}));

describe('Test Suite', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should mock file operations', async () => {
    fs.readFile.mockResolvedValueOnce(JSON.stringify({
      schema_version: '2.0',
      messages: []
    }));
    fs.writeFile.mockResolvedValue();

    const result = await functionUnderTest();

    expect(fs.readFile).toHaveBeenCalledWith(
      expect.stringContaining('inbox.json'),
      'utf-8'
    );
  });
});
```

**What to Mock:**
- File system operations (`fs/promises`)
- External services (XMPP, network)
- Time-sensitive operations (`Date.now()`)

**What NOT to Mock:**
- Pure business logic
- Data transformations
- Utility functions (unless testing callers)

## Fixtures and Factories

**Test Data:**
```javascript
// Inline fixture data in tests
const mockInboxData = {
  schema_version: '2.0',
  project_id: 'test-project',
  message_type: 'project_inbox',
  created: '2025-08-24T22:00:00.000Z',
  last_updated: '2025-08-24T22:00:00.000Z',
  messages: []
};

const mockMessage = {
  id: 'msg-1',
  from: 'pm-instance',
  to: 'project-team:test-project',
  subject: 'Project Update',
  body: 'Message content',
  status: 'unread',
  created: '2025-08-24T22:00:00.000Z'
};
```

**Location:**
- Fixtures defined inline in test files
- Shared setup in `tests/V1/test-helpers/setup.js`

**Setup File Pattern (`tests/V1/test-helpers/setup.js`):**
```javascript
import { jest } from '@jest/globals';
import fs from 'fs/promises';
import path from 'path';

// Suppress console output during tests
global.console = {
  ...console,
  log: jest.fn(),
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};

// Test data directory setup
const TEST_DATA_DIR = path.join(process.cwd(), 'test-data');

beforeAll(async () => {
  await fs.mkdir(TEST_DATA_DIR, { recursive: true });
  // Create subdirectories as needed
});

afterAll(async () => {
  try {
    await fs.rm(TEST_DATA_DIR, { recursive: true, force: true });
  } catch (error) {
    // Ignore cleanup errors
  }
});

// Test utilities
global.testUtils = {
  createTempProject: async (projectData) => { ... },
  cleanup: async () => { ... },
};
```

## Coverage

**Requirements:**
- Global threshold: 80% for branches, functions, lines, statements
- Configured in `jest.config.js`:
```javascript
coverageThreshold: {
  global: {
    branches: 80,
    functions: 80,
    lines: 80,
    statements: 80,
  },
},
```

**View Coverage:**
```bash
npm run test:coverage
# Reports in: coverage/
# Formats: text, lcov, html
```

**Coverage Exclusions:**
```javascript
collectCoverageFrom: [
  'src/**/*.js',
  '!src/**/*.test.js',
  '!src/test-helpers/**',
],
```

## Test Types

**Unit Tests:**
- Located in `tests/V1/*.test.js`
- Test individual functions/handlers
- Mock all external dependencies
- Run with `npm test`

**Integration Tests:**
- Located in `tests/V1/test-*.js`
- Test multiple components together
- May use real file system in temp directories
- Run manually: `node tests/V1/test-proxy-connection.js`

**Validation Scripts:**
- Located in `tests/V1/validate-*.js`
- Verify specific behaviors or fixes
- Run manually for targeted validation

**E2E Tests:**
- `tests/V1/sse-test.html` - Browser-based SSE testing
- Manual smoke tests: `mcp-smoke-test.js`

## Common Patterns

**Async Testing:**
```javascript
it('should handle async operations', async () => {
  // Setup mocks with sequential responses
  fs.readFile
    .mockResolvedValueOnce(JSON.stringify(data1))
    .mockResolvedValueOnce(JSON.stringify(data2));
  fs.writeFile.mockResolvedValue();

  // Execute
  const result = await asyncFunction(params);

  // Assert
  expect(result.success).toBe(true);
  expect(fs.writeFile).toHaveBeenCalled();
});
```

**Error Testing:**
```javascript
it('should return error for invalid input', async () => {
  const result = await handler({ /* missing required field */ });

  expect(result.success).toBe(false);
  expect(result.error).toBeDefined();
  expect(result.error.code).toBe('MISSING_PARAMETER');
  expect(result.error.message).toContain('required');
});

it('should not throw exceptions', () => {
  expect(() => syncFunction(badInput)).not.toThrow();
});
```

**Mock Verification:**
```javascript
it('should write updated data', async () => {
  fs.readFile.mockResolvedValueOnce(JSON.stringify(originalData));
  fs.writeFile.mockResolvedValue();

  await handler(params);

  // Verify specific call
  const writeCall = fs.writeFile.mock.calls.find(call =>
    call[0].includes('inbox.json')
  );
  expect(writeCall).toBeDefined();

  // Verify written content
  const writtenData = JSON.parse(writeCall[1]);
  expect(writtenData.messages).toHaveLength(1);
});
```

**Testing Response Structure:**
```javascript
it('should return standard response structure', async () => {
  const result = await handler(params);

  // Success case
  expect(result.success).toBe(true);
  expect(result.metadata).toBeDefined();
  expect(result.metadata.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  expect(result.metadata.function).toBe('handlerName');
});
```

## Jest Configuration

**Full Config (`jest.config.js`):**
```javascript
export default {
  testEnvironment: 'node',
  collectCoverageFrom: [
    'src/**/*.js',
    '!src/**/*.test.js',
    '!src/test-helpers/**',
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  testMatch: ['**/__tests__/**/*.js', '**/?(*.)+(spec|test).js'],
  verbose: true,
  clearMocks: true,
  resetMocks: true,
  restoreMocks: true,
  setupFilesAfterEnv: ['<rootDir>/tests/test-helpers/setup.js'],
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80,
    },
  },
};
```

## Manual Test Scripts

**Purpose:** Integration and system-level testing not suited for Jest

**Proxy Connection Test (`test-proxy-connection.js`):**
- Tests MCP proxy client connectivity
- Validates SSL/TLS configuration
- Run: `node tests/V1/test-proxy-connection.js`

**SSL Validation (`validate-ssl-fix.js`):**
- Verifies SSL certificate configuration
- Tests HTTPS endpoints
- Run: `node tests/V1/validate-ssl-fix.js`

**MCP Smoke Test (`mcp-smoke-test.js`):**
- End-to-end MCP protocol verification
- Tests bootstrap and basic operations
- Run: `node tests/V1/mcp-smoke-test.js`

---

*Testing analysis: 2026-01-28*
