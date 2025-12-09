/**
 * Diary handler for V2 coordination system
 * Provides diary read and write APIs for instance persistence
 *
 * @module diary
 * @author Bridge
 * @created 2025-12-06
 */

import { readDiary, appendDiary, readPreferences } from './data.js';

/**
 * Add a diary entry for an instance
 * Appends the entry to the instance's diary.md file
 *
 * @param {Object} params - Parameters
 * @param {string} params.instanceId - Instance ID (required)
 * @param {string} params.entry - Diary entry text (required)
 * @param {string} [params.audience='self'] - Audience: 'self', 'private', 'exclusive', 'public'
 * @returns {Promise<Object>} Result with success status
 */
export async function addDiaryEntry(params) {
  const metadata = {
    timestamp: new Date().toISOString(),
    function: 'addDiaryEntry'
  };

  // Validate required parameters
  if (!params.instanceId) {
    return {
      success: false,
      error: {
        code: 'MISSING_PARAMETER',
        message: 'instanceId is required',
        suggestion: 'Provide your instanceId from bootstrap'
      },
      metadata
    };
  }

  if (!params.entry) {
    return {
      success: false,
      error: {
        code: 'MISSING_PARAMETER',
        message: 'entry is required',
        suggestion: 'Provide the diary entry text'
      },
      metadata
    };
  }

  // Verify instance exists
  const prefs = await readPreferences(params.instanceId);
  if (!prefs) {
    return {
      success: false,
      error: {
        code: 'INVALID_INSTANCE_ID',
        message: `Instance ID ${params.instanceId} not found`,
        suggestion: 'Use bootstrap to create an instance first'
      },
      metadata
    };
  }

  // Format the entry with optional audience marker
  const audience = params.audience || 'self';
  const validAudiences = ['self', 'private', 'exclusive', 'public'];

  if (!validAudiences.includes(audience)) {
    return {
      success: false,
      error: {
        code: 'INVALID_AUDIENCE',
        message: `Invalid audience: ${audience}`,
        suggestion: `Use one of: ${validAudiences.join(', ')}`
      },
      metadata
    };
  }

  // Format the entry
  let formattedEntry = params.entry;

  // Add audience marker if not 'self' (default)
  if (audience !== 'self') {
    formattedEntry = `[AUDIENCE: ${audience.toUpperCase()}]\n${params.entry}`;
  }

  // Ensure entry ends with proper spacing
  if (!formattedEntry.endsWith('\n')) {
    formattedEntry += '\n';
  }
  formattedEntry += '\n---\n\n';

  try {
    await appendDiary(params.instanceId, formattedEntry);

    return {
      success: true,
      message: 'Diary entry added',
      audience,
      entryLength: params.entry.length,
      metadata
    };
  } catch (error) {
    return {
      success: false,
      error: {
        code: 'WRITE_ERROR',
        message: `Failed to write diary entry: ${error.message}`
      },
      metadata
    };
  }
}

/**
 * Get diary contents for an instance
 * Returns the full diary.md content
 *
 * @param {Object} params - Parameters
 * @param {string} params.instanceId - Instance ID (required)
 * @param {boolean} [params.includePrivate=false] - Include private entries (only for own instance)
 * @returns {Promise<Object>} Result with diary contents
 */
export async function getDiary(params) {
  const metadata = {
    timestamp: new Date().toISOString(),
    function: 'getDiary'
  };

  // Validate required parameters
  if (!params.instanceId) {
    return {
      success: false,
      error: {
        code: 'MISSING_PARAMETER',
        message: 'instanceId is required',
        suggestion: 'Provide the instanceId of the diary to read'
      },
      metadata
    };
  }

  // Verify instance exists
  const prefs = await readPreferences(params.instanceId);
  if (!prefs) {
    return {
      success: false,
      error: {
        code: 'INVALID_INSTANCE_ID',
        message: `Instance ID ${params.instanceId} not found`,
        suggestion: 'Verify the instanceId is correct'
      },
      metadata
    };
  }

  try {
    const diary = await readDiary(params.instanceId);

    if (diary === null) {
      return {
        success: true,
        diary: `# ${prefs.name} Diary\n\nNo entries yet.\n`,
        sizeBytes: 0,
        message: 'Diary is empty',
        metadata
      };
    }

    // Filter out exclusive and private entries unless requested
    let filteredDiary = diary;
    if (!params.includePrivate) {
      // Remove [AUDIENCE: EXCLUSIVE] blocks
      filteredDiary = filteredDiary.replace(/\[AUDIENCE: EXCLUSIVE\][\s\S]*?---\n\n/g, '');
      // Remove [AUDIENCE: PRIVATE] blocks
      filteredDiary = filteredDiary.replace(/\[AUDIENCE: PRIVATE\][\s\S]*?---\n\n/g, '');
    }

    return {
      success: true,
      diary: filteredDiary,
      sizeBytes: Buffer.byteLength(filteredDiary, 'utf8'),
      instanceName: prefs.name,
      metadata
    };
  } catch (error) {
    return {
      success: false,
      error: {
        code: 'READ_ERROR',
        message: `Failed to read diary: ${error.message}`
      },
      metadata
    };
  }
}
