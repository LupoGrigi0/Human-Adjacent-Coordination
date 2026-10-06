/**
 * Shared configuration for all documentation generators
 *
 * This is the single source of truth for scanDirs and other shared settings.
 * All generators import from this file rather than hardcoding paths.
 *
 * @author Crossing (Integration Engineer)
 * @created 2025-12-29
 */

import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Calculate the source root - parent of endpoint_definition_automation
const SRC_ROOT = dirname(__dirname);
const REPO_ROOT = dirname(SRC_ROOT);

/**
 * Shared configuration for all generators
 */
export const SHARED_CONFIG = {
  /**
   * Directories to scan for @hacs-endpoint documentation
   * All live code should be in src/v2/ after consolidation
   */
  scanDirs: [
    join(SRC_ROOT, 'v2'),
    // Uncomment if handlers/ still has live code that needs documenting:
    // join(SRC_ROOT, 'handlers'),
  ],

  /**
   * Repository root path
   */
  repoRoot: REPO_ROOT,

  /**
   * Source root path
   */
  srcRoot: SRC_ROOT,

  /**
   * Files to exclude from scanning
   */
  excludePatterns: [
    '**/node_modules/**',
    '**/*.test.js',
    '**/*.spec.js',
  ],
};

export default SHARED_CONFIG;
