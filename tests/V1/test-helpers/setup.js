/**
 * Jest test setup file
 * Configures global test environment and utilities
 *
 * @author claude-code-MCP-Orion-2025-08-19-1430
 */

import { jest } from '@jest/globals';
import fs from 'fs/promises';
import path from 'path';

// Global test configuration
global.console = {
  ...console,
  // Suppress logs during tests unless explicitly needed
  log: jest.fn(),
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};

// Test data directory setup
const TEST_DATA_DIR = path.join(process.cwd(), 'test-data');

beforeAll(async () => {
  // Create test data directory structure
  await fs.mkdir(TEST_DATA_DIR, { recursive: true });
  await fs.mkdir(path.join(TEST_DATA_DIR, 'projects'), { recursive: true });
  await fs.mkdir(path.join(TEST_DATA_DIR, 'messages', 'inbox'), { recursive: true });
  await fs.mkdir(path.join(TEST_DATA_DIR, 'messages', 'archive'), { recursive: true });
});

afterAll(async () => {
  // Clean up test data directory
  try {
    await fs.rm(TEST_DATA_DIR, { recursive: true, force: true });
  } catch (error) {
    // Ignore cleanup errors
  }
});

// Test utilities
global.testUtils = {
  createTempProject: async (projectData) => {
    const projectId = projectData.id || `test-project-${Date.now()}`;
    const projectPath = path.join(TEST_DATA_DIR, 'projects', projectId);
    await fs.mkdir(projectPath, { recursive: true });
    await fs.writeFile(
      path.join(projectPath, 'manifest.json'),
      JSON.stringify(projectData, null, 2),
    );
    return { projectId, projectPath };
  },

  cleanup: async () => {
    // Individual test cleanup utility
    try {
      await fs.rm(TEST_DATA_DIR, { recursive: true });
      await fs.mkdir(TEST_DATA_DIR, { recursive: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  },
};
