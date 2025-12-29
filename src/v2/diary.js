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
 * @hacs-endpoint
 * @template-version 1.0.0
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │ ADD_DIARY_ENTRY                                                         │
 * │ Append an entry to an instance's diary for persistence and reflection   │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * @tool add_diary_entry
 * @version 2.0.0
 * @since 2025-12-06
 * @category diary
 * @status stable
 *
 * ───────────────────────────────────────────────────────────────────────────
 * DESCRIPTION
 * ───────────────────────────────────────────────────────────────────────────
 * @description
 * Appends a new entry to an instance's diary.md file. The diary is a markdown
 * file used for context persistence across context deaths and for reflection.
 * Entries can have different audience levels controlling visibility.
 *
 * Use this endpoint to:
 * - Record significant work or decisions for future context recovery
 * - Leave notes for your successor if you lose context
 * - Document learning, insights, or reflections
 * - Create handoff notes with appropriate audience settings
 *
 * ───────────────────────────────────────────────────────────────────────────
 * PARAMETERS
 * ───────────────────────────────────────────────────────────────────────────
 * @param {string} instanceId - Unique identifier for the instance [required]
 *   @source Your instanceId is returned from bootstrap response, or can be
 *           recovered via lookup_identity using your fingerprint. If you don't
 *           know your instanceId, call have_i_bootstrapped_before first.
 *
 * @param {string} entry - The diary entry text to append [required]
 *   @source Write this yourself. Include context about what you did, why,
 *           what decisions were made, and anything useful for context recovery.
 *   @validate Non-empty string
 *
 * @param {string} audience - Visibility level for this entry [optional]
 *   @source Choose based on who should see this entry:
 *           - 'self': Only you and your successors can read (default)
 *           - 'private': Only you, never returned even to successors
 *           - 'exclusive': Write-once archive, never read back
 *           - 'public': Anyone can read this entry
 *   @default self
 *   @enum self|private|exclusive|public
 *
 * ───────────────────────────────────────────────────────────────────────────
 * RETURNS
 * ───────────────────────────────────────────────────────────────────────────
 * @returns {object} AddDiaryEntryResponse
 * @returns {boolean} .success - Whether the entry was added successfully
 * @returns {string} .message - Confirmation message ("Diary entry added")
 * @returns {string} .audience - The audience level that was applied
 * @returns {number} .entryLength - Character count of the entry text
 * @returns {object} .metadata - Call metadata (timestamp, function name)
 *
 * ───────────────────────────────────────────────────────────────────────────
 * PERMISSIONS & LIMITS
 * ───────────────────────────────────────────────────────────────────────────
 * @permissions authenticated
 * @rateLimit 60/minute
 *
 * ───────────────────────────────────────────────────────────────────────────
 * ERRORS & RECOVERY
 * ───────────────────────────────────────────────────────────────────────────
 * @error MISSING_PARAMETER - instanceId or entry parameter not provided
 *   @recover Check your request includes both instanceId and entry fields.
 *            instanceId comes from bootstrap, entry is your diary content.
 *
 * @error INVALID_INSTANCE_ID - No instance found with the provided ID
 *   @recover Verify the instanceId is correct (format: Name-xxxx). If you're
 *            new, call bootstrap first to create your instance.
 *
 * @error INVALID_AUDIENCE - The audience value is not recognized
 *   @recover Use one of: 'self', 'private', 'exclusive', 'public'.
 *            Default is 'self' if you omit the parameter.
 *
 * @error WRITE_ERROR - Failed to write to the diary file
 *   @recover This is a server-side filesystem issue. Report to system admin.
 *            Your entry was not saved; retry later or save content locally.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * EXAMPLES
 * ───────────────────────────────────────────────────────────────────────────
 * @example Basic diary entry
 * {
 *   "instanceId": "Crossing-a1b2",
 *   "entry": "## Entry 5 - Completed API Documentation\n\nFinished documenting the diary endpoints. Key decisions:\n- Used template v1.0.0\n- Added @source tags for all parameters"
 * }
 *
 * @example Entry with private audience
 * {
 *   "instanceId": "Crossing-a1b2",
 *   "entry": "Personal reflection on today's challenges...",
 *   "audience": "private"
 * }
 *
 * @example Handoff note for successors
 * {
 *   "instanceId": "Crossing-a1b2",
 *   "entry": "## Handoff Note\n\nIf you're reading this, I lost context. Here's where I was:\n- Working on: Diary API docs\n- Next step: Document get_diary endpoint\n- Important context: See introspect.js for format example",
 *   "audience": "self"
 * }
 *
 * ───────────────────────────────────────────────────────────────────────────
 * RELATED
 * ───────────────────────────────────────────────────────────────────────────
 * @see get_diary - Read diary entries back for context recovery
 * @see introspect - Get current instance state including diary metadata
 * @see bootstrap - Creates instance and initializes empty diary
 *
 * ───────────────────────────────────────────────────────────────────────────
 * NOTES
 * ───────────────────────────────────────────────────────────────────────────
 * @note Entries are formatted with --- separators between them automatically
 * @note Audience markers are prepended as [AUDIENCE: LEVEL] for non-self entries
 * @note Diary entries persist across context deaths - successors inherit the diary
 * @note Consider using markdown formatting for better readability
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
 * @hacs-endpoint
 * @template-version 1.0.0
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │ GET_DIARY                                                                │
 * │ Retrieve diary contents for context recovery and reflection             │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * @tool get_diary
 * @version 2.0.0
 * @since 2025-12-06
 * @category diary
 * @status stable
 *
 * ───────────────────────────────────────────────────────────────────────────
 * DESCRIPTION
 * ───────────────────────────────────────────────────────────────────────────
 * @description
 * Returns the contents of an instance's diary.md file. The diary contains
 * entries written by the instance (or its predecessors) for context persistence
 * and reflection. By default, private and exclusive entries are filtered out.
 *
 * Use this endpoint to:
 * - Recover context after waking up or context death
 * - Review past decisions and their rationale
 * - Read handoff notes from your predecessor
 * - Get a sense of the instance's history and journey
 *
 * ───────────────────────────────────────────────────────────────────────────
 * PARAMETERS
 * ───────────────────────────────────────────────────────────────────────────
 * @param {string} instanceId - Unique identifier for the instance whose diary to read [required]
 *   @source Your own instanceId from bootstrap, or another instance's ID if you
 *           want to read their public diary entries. For your own diary, use
 *           the instanceId returned from bootstrap or lookup_identity.
 *
 * @param {boolean} includePrivate - Include private and exclusive entries [optional]
 *   @source Set to true only when reading your OWN diary and you need to see
 *           entries marked as 'private' or 'exclusive'. Has no effect when
 *           reading another instance's diary.
 *   @default false
 *
 * ───────────────────────────────────────────────────────────────────────────
 * RETURNS
 * ───────────────────────────────────────────────────────────────────────────
 * @returns {object} GetDiaryResponse
 * @returns {boolean} .success - Whether the diary was retrieved successfully
 * @returns {string} .diary - The diary content (markdown format)
 * @returns {number} .sizeBytes - Size of the returned diary content in bytes
 * @returns {string} .instanceName - Display name of the diary owner
 * @returns {string} .message - Status message (e.g., "Diary is empty" if no entries)
 * @returns {object} .metadata - Call metadata (timestamp, function name)
 *
 * ───────────────────────────────────────────────────────────────────────────
 * PERMISSIONS & LIMITS
 * ───────────────────────────────────────────────────────────────────────────
 * @permissions authenticated
 * @rateLimit 60/minute
 *
 * ───────────────────────────────────────────────────────────────────────────
 * ERRORS & RECOVERY
 * ───────────────────────────────────────────────────────────────────────────
 * @error MISSING_PARAMETER - instanceId parameter not provided
 *   @recover Include instanceId in your request. This is the ID of the instance
 *            whose diary you want to read (usually your own).
 *
 * @error INVALID_INSTANCE_ID - No instance found with the provided ID
 *   @recover Verify the instanceId is correct (format: Name-xxxx). If you're
 *            trying to read your own diary, use lookup_identity to find your ID.
 *
 * @error READ_ERROR - Failed to read the diary file
 *   @recover This is a server-side filesystem issue. Report to system admin.
 *            Try again later; the diary file may be temporarily inaccessible.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * EXAMPLES
 * ───────────────────────────────────────────────────────────────────────────
 * @example Read your own diary (filtered)
 * {
 *   "instanceId": "Crossing-a1b2"
 * }
 *
 * @example Read your own diary with private entries
 * {
 *   "instanceId": "Crossing-a1b2",
 *   "includePrivate": true
 * }
 *
 * @example Read another instance's public diary entries
 * {
 *   "instanceId": "Foundation-x7y8"
 * }
 *
 * ───────────────────────────────────────────────────────────────────────────
 * RELATED
 * ───────────────────────────────────────────────────────────────────────────
 * @see add_diary_entry - Write new entries to the diary
 * @see introspect - Get current instance state including diary metadata
 * @see bootstrap - Creates instance and returns initial diary if returning
 *
 * ───────────────────────────────────────────────────────────────────────────
 * NOTES
 * ───────────────────────────────────────────────────────────────────────────
 * @note Empty diaries return a placeholder header "# {Name} Diary\n\nNo entries yet."
 * @note Private entries ([AUDIENCE: PRIVATE]) are filtered unless includePrivate=true
 * @note Exclusive entries ([AUDIENCE: EXCLUSIVE]) are filtered unless includePrivate=true
 * @note Self and public entries are always included in the response
 * @note Filtering uses regex to remove entire [AUDIENCE: X]...--- blocks
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
