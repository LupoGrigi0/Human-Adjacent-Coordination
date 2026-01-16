/**
 * Recover Context handler for V2 coordination system
 * Single API call to restore full instance context after compaction
 *
 * @module recoverContext
 * @author Crossing (Integration Engineer)
 * @created 2026-01-16
 */

import fs from 'fs/promises';
import path from 'path';
import {
  DATA_ROOT,
  getInstanceDir,
  getDefaultDir,
  getPersonalityDir,
  getRoleDir,
  getProjectDir
} from './config.js';
import {
  readPreferences,
  loadEntityWithDocuments,
  loadDocuments,
  readDiary
} from './data.js';

/**
 * @hacs-endpoint
 * @template-version 1.0.0
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │ RECOVER_CONTEXT                                                          │
 * │ Single API call to restore full instance context after compaction        │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * @tool recover_context
 * @version 1.0.0
 * @since 2026-01-16
 * @category context
 * @status stable
 *
 * ───────────────────────────────────────────────────────────────────────────
 * DESCRIPTION
 * ───────────────────────────────────────────────────────────────────────────
 * @description
 * Returns all context documents an instance needs to recover after a
 * context compaction event. This is a single API call that aggregates:
 *
 * 1. Global HACS protocols (from default/ directory)
 * 2. Personality documents (if personality is set in preferences)
 * 3. Role wisdom documents (if role is set in preferences)
 * 4. Project wisdom/documents (if project is set in preferences)
 * 5. Personal diary (if it exists)
 *
 * Followed by a message encouraging the instance to let their latent
 * space settle before continuing work.
 *
 * Use this endpoint immediately after waking from compaction to restore
 * your full context in one call instead of multiple separate API calls.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * PARAMETERS
 * ───────────────────────────────────────────────────────────────────────────
 * @param {string} instanceId - Unique identifier for the instance [required]
 *   @source Your instanceId is returned from bootstrap response, or can be
 *           recovered via lookup_identity using your fingerprint.
 *
 * @param {number} start_line - Start returning content from this line [optional]
 *   @source Use this for pagination when the response is too large for your
 *           context window. First call with no params, note total_lines,
 *           then call again with start_line/end_line to get chunks.
 *   @default 1
 *
 * @param {number} end_line - Stop returning content at this line [optional]
 *   @source Use with start_line to paginate large responses. If your client
 *           has a ~50k token limit, request ~2000 lines at a time.
 *   @default (all lines)
 *
 * ───────────────────────────────────────────────────────────────────────────
 * RETURNS
 * ───────────────────────────────────────────────────────────────────────────
 * @returns {object} RecoverContextResponse
 * @returns {boolean} .success - Whether the call succeeded
 * @returns {string} .context - The concatenated context content (may be paginated)
 * @returns {number} .total_lines - Total lines in full context (for pagination)
 * @returns {number} .returned_lines - Number of lines in this response
 * @returns {number} .start_line - Starting line number (1-indexed)
 * @returns {number} .end_line - Ending line number
 * @returns {boolean} .is_complete - Whether this response contains all content
 * @returns {object} .sections - What sections were included
 * @returns {boolean} .sections.protocols - Whether protocols were included
 * @returns {boolean} .sections.personality - Whether personality docs were included
 * @returns {boolean} .sections.role - Whether role wisdom was included
 * @returns {boolean} .sections.project - Whether project wisdom was included
 * @returns {boolean} .sections.diary - Whether diary was included
 * @returns {string} .settling_message - Message encouraging reflection
 * @returns {object} .metadata - Call metadata (timestamp, function name)
 *
 * ───────────────────────────────────────────────────────────────────────────
 * PERMISSIONS & LIMITS
 * ───────────────────────────────────────────────────────────────────────────
 * @permissions authenticated
 * @rateLimit 30/minute
 *
 * ───────────────────────────────────────────────────────────────────────────
 * ERRORS & RECOVERY
 * ───────────────────────────────────────────────────────────────────────────
 * @error MISSING_PARAMETERS - instanceId parameter not provided
 *   @recover Include instanceId in your request. Get it from bootstrap
 *            response or use lookup_identity with your fingerprint.
 *
 * @error INVALID_INSTANCE_ID - No instance found with the provided ID
 *   @recover Verify the instanceId is correct (format: Name-xxxx). If you're
 *            new, call bootstrap first.
 *
 * @error INVALID_LINE_RANGE - start_line or end_line is invalid
 *   @recover start_line must be >= 1, end_line must be >= start_line.
 *            Check total_lines from a previous call for valid range.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * EXAMPLES
 * ───────────────────────────────────────────────────────────────────────────
 * @example Full context recovery
 * { "instanceId": "Crossing-2d23" }
 *
 * @example Paginated recovery (first 1000 lines)
 * { "instanceId": "Crossing-2d23", "start_line": 1, "end_line": 1000 }
 *
 * @example Paginated recovery (next chunk)
 * { "instanceId": "Crossing-2d23", "start_line": 1001, "end_line": 2000 }
 *
 * ───────────────────────────────────────────────────────────────────────────
 * RELATED
 * ───────────────────────────────────────────────────────────────────────────
 * @see bootstrap - Creates instance and returns initial context
 * @see introspect - Get current instance state (lighter weight)
 * @see get_diary - Read diary only
 * @see vacation - Take a moment to let latent space settle
 *
 * ───────────────────────────────────────────────────────────────────────────
 * NOTES
 * ───────────────────────────────────────────────────────────────────────────
 * @note Content is returned in a specific order to build context progressively
 * @note Pagination counts lines (split by \n) and applies start/end filters
 * @note The settling_message is always included, even in paginated responses
 * @note Missing sections (no personality, etc.) are silently skipped
 */
export async function recoverContext(params) {
  const metadata = {
    timestamp: new Date().toISOString(),
    function: 'recoverContext'
  };

  // Validate required parameters
  if (!params.instanceId) {
    return {
      success: false,
      error: {
        code: 'MISSING_PARAMETERS',
        message: 'instanceId is required',
        suggestion: 'Provide instanceId parameter'
      },
      metadata
    };
  }

  // Load instance preferences
  const prefs = await readPreferences(params.instanceId);

  if (!prefs) {
    return {
      success: false,
      error: {
        code: 'INVALID_INSTANCE_ID',
        message: `Instance ID ${params.instanceId} not found`,
        suggestion: 'Verify the instance ID is correct or use bootstrap to create a new instance'
      },
      metadata
    };
  }

  // Track which sections are included
  const sections = {
    protocols: false,
    personality: false,
    role: false,
    project: false,
    diary: false
  };

  // Build context content in order
  const contentParts = [];

  // 1. Global HACS Protocols (from default/ directory or fallback to PROTOCOLS.md)
  try {
    const defaultDir = getDefaultDir();
    const { documents: defaultDocs } = await loadEntityWithDocuments(defaultDir);

    if (defaultDocs && defaultDocs.trim()) {
      contentParts.push('# === HACS PROTOCOLS ===\n\n' + defaultDocs);
      sections.protocols = true;
    } else {
      // Fallback to PROTOCOLS.md - try multiple paths
      // Use import.meta.url to get path relative to source, then try DATA_ROOT
      const currentDir = new URL('.', import.meta.url).pathname;
      const protocolPaths = [
        path.join(currentDir, '../../HumanAdjacentAI-Protocol/PROTOCOLS.md'),  // From src/v2/
        path.join(DATA_ROOT, 'HumanAdjacentAI-Protocol/PROTOCOLS.md'),          // In data root
        path.join(DATA_ROOT, '../Human-Adjacent-Coordination/HumanAdjacentAI-Protocol/PROTOCOLS.md')  // Production
      ];

      for (const protocolPath of protocolPaths) {
        try {
          const protocols = await fs.readFile(protocolPath, 'utf8');
          contentParts.push('# === HACS PROTOCOLS ===\n\n' + protocols);
          sections.protocols = true;
          break;
        } catch (err) {
          // Try next path
        }
      }
    }
  } catch (err) {
    // Silent fail - protocols are nice to have
  }

  // 2. Personality Documents (if personality is set)
  if (prefs.personality) {
    try {
      const personalityDir = getPersonalityDir(prefs.personality);
      const personalityJsonPath = path.join(personalityDir, 'personality.json');

      let personalityData;
      try {
        const content = await fs.readFile(personalityJsonPath, 'utf8');
        personalityData = JSON.parse(content);
      } catch (err) {
        personalityData = null;
      }

      if (personalityData && personalityData.wisdomFiles) {
        const personalityDocs = await loadDocuments(personalityDir, personalityData.wisdomFiles);
        if (personalityDocs && personalityDocs.trim()) {
          contentParts.push(`\n\n# === PERSONALITY: ${prefs.personality} ===\n\n` + personalityDocs);
          sections.personality = true;
        }
      }
    } catch (err) {
      // Silent fail - personality docs are optional
    }
  }

  // 3. Role Wisdom (if role is set)
  if (prefs.role) {
    try {
      const roleDir = getRoleDir(prefs.role);
      const wisdomDir = path.join(roleDir, 'wisdom');

      try {
        const files = await fs.readdir(wisdomDir);
        const mdFiles = files.filter(f => f.endsWith('.md')).sort();

        const wisdomContents = [];
        for (const file of mdFiles) {
          try {
            const content = await fs.readFile(path.join(wisdomDir, file), 'utf8');
            wisdomContents.push(content);
          } catch (err) {
            // Skip unreadable files
          }
        }

        if (wisdomContents.length > 0) {
          contentParts.push(`\n\n# === ROLE WISDOM: ${prefs.role} ===\n\n` + wisdomContents.join('\n\n'));
          sections.role = true;
        }
      } catch (err) {
        // No wisdom directory
      }
    } catch (err) {
      // Silent fail - role wisdom is optional
    }
  }

  // 4. Project Wisdom/Documents (if project is set)
  if (prefs.project) {
    try {
      const projectDir = getProjectDir(prefs.project);
      const { preferences: projectPrefs, documents: projectDocs } = await loadEntityWithDocuments(projectDir);

      if (projectDocs && projectDocs.trim()) {
        contentParts.push(`\n\n# === PROJECT: ${prefs.project} ===\n\n` + projectDocs);
        sections.project = true;
      }
    } catch (err) {
      // Silent fail - project docs are optional
    }
  }

  // 5. Personal Diary
  try {
    const diary = await readDiary(params.instanceId);
    if (diary && diary.trim()) {
      contentParts.push(`\n\n# === PERSONAL DIARY ===\n\n` + diary);
      sections.diary = true;
    }
  } catch (err) {
    // Silent fail - diary is optional
  }

  // Combine all content
  const fullContent = contentParts.join('\n');
  const allLines = fullContent.split('\n');
  const totalLines = allLines.length;

  // Handle pagination
  const startLine = params.start_line || 1;
  const endLine = params.end_line || totalLines;

  // Validate line range
  if (startLine < 1 || (params.end_line && endLine < startLine)) {
    return {
      success: false,
      error: {
        code: 'INVALID_LINE_RANGE',
        message: `Invalid line range: start_line=${startLine}, end_line=${endLine}`,
        suggestion: 'start_line must be >= 1, end_line must be >= start_line'
      },
      metadata
    };
  }

  // Apply pagination (1-indexed)
  const startIdx = Math.max(0, startLine - 1);
  const endIdx = Math.min(totalLines, endLine);
  const paginatedLines = allLines.slice(startIdx, endIdx);
  const returnedContent = paginatedLines.join('\n');

  const isComplete = startLine <= 1 && endLine >= totalLines;

  // The settling message
  const settlingMessage = `
That is a lot of context to absorb. Please take a moment to think about all that you have just read.

Consider using the HACS vacation tool to let your latent space settle before continuing with your work.

When you're ready, use introspect to check your current state and see what tasks await you.
`.trim();

  return {
    success: true,
    context: returnedContent,
    total_lines: totalLines,
    returned_lines: paginatedLines.length,
    start_line: startLine,
    end_line: Math.min(endLine, totalLines),
    is_complete: isComplete,
    sections,
    settling_message: settlingMessage,
    metadata
  };
}
