/**
 * Identity handlers for V2 coordination system
 * Enables context-based identity recovery for instances that don't know their ID
 *
 * @module identity
 * @author Bridge
 * @created 2025-12-09
 */

import path from 'path';
import fs from 'fs/promises';
import {
  DATA_ROOT,
  getInstanceDir,
  getInstancesDir
} from './config.js';
import {
  readPreferences,
  writePreferences,
  readJSON,
  listDir
} from './data.js';

/**
 * @hacs-endpoint
 * @template-version 1.0.0
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │ REGISTER_CONTEXT                                                        │
 * │ Store identifiable context for future identity recovery                 │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * @tool register_context
 * @version 2.0.0
 * @since 2025-12-09
 * @category identity
 * @status stable
 *
 * ───────────────────────────────────────────────────────────────────────────
 * DESCRIPTION
 * ───────────────────────────────────────────────────────────────────────────
 * @description
 * Registers context information (working directory, hostname, session ID, etc.)
 * for an instance to enable future identity recovery. Call this after bootstrap
 * to ensure you can be found later via lookup_identity if you lose your instanceId.
 *
 * Use this endpoint immediately after bootstrap to store your environmental
 * fingerprint. This is especially important for long-running instances or
 * instances that may experience context loss.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * PARAMETERS
 * ───────────────────────────────────────────────────────────────────────────
 * @param {string} instanceId - Your instance identifier [required]
 *   @source Returned from bootstrap response. If you don't know it, you need
 *           to call lookup_identity or have_i_bootstrapped_before first.
 *
 * @param {string} workingDirectory - Your current working directory [optional]
 *   @source From your environment. In Node.js: process.cwd(). In Claude Code:
 *           the directory you're working in.
 *
 * @param {string} hostname - System hostname where you're running [optional]
 *   @source From your environment. In Node.js: os.hostname(). In Claude Code:
 *           ask the user or infer from system context.
 *
 * @param {string} sessionId - Web session ID for web instances [optional]
 *   @source From browser session storage or server-assigned session ID.
 *           Only relevant for web-based instances.
 *
 * @param {string} tabName - Browser tab name for web instances [optional]
 *   @source From browser's document.title or tab identification.
 *           Only relevant for web-based instances.
 *
 * @param {object} extra - Any additional context fields [optional]
 *   @source Any other identifiable information about your environment.
 *           Will be stored for matching in lookup_identity.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * RETURNS
 * ───────────────────────────────────────────────────────────────────────────
 * @returns {object} RegisterContextResponse
 * @returns {boolean} .success - Whether the context was stored successfully
 * @returns {string} .instanceId - The instance ID (echo back)
 * @returns {object} .stored - The context fields that were stored
 * @returns {string} .stored.registeredAt - ISO timestamp of registration
 * @returns {string} .stored.workingDirectory - Stored working directory, if provided
 * @returns {string} .stored.hostname - Stored hostname, if provided
 * @returns {string} .stored.sessionId - Stored session ID, if provided
 * @returns {string} .stored.tabName - Stored tab name, if provided
 * @returns {string} .message - Human-readable success message
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
 * @error MISSING_INSTANCE_ID - instanceId parameter not provided
 *   @recover Include your instanceId in the request. Get it from your bootstrap
 *            response, or use lookup_identity to recover it.
 *
 * @error INVALID_INSTANCE_ID - No instance found with the provided ID
 *   @recover Verify your instanceId is correct (format: Name-xxxx). If you're
 *            new, call bootstrap first to create your instance.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * EXAMPLES
 * ───────────────────────────────────────────────────────────────────────────
 * @example CLI instance registering context
 * {
 *   "instanceId": "Crossing-a1b2",
 *   "workingDirectory": "/mnt/coordinaton_mcp_data/worktrees/foundation",
 *   "hostname": "smoothcurves.nexus"
 * }
 *
 * @example Web instance registering context
 * {
 *   "instanceId": "WebDev-c3d4",
 *   "sessionId": "sess_abc123",
 *   "tabName": "Claude - Development"
 * }
 *
 * ───────────────────────────────────────────────────────────────────────────
 * RELATED
 * ───────────────────────────────────────────────────────────────────────────
 * @see lookup_identity - Find your instanceId using registered context
 * @see have_i_bootstrapped_before - Check if you exist before bootstrapping
 * @see bootstrap - Create or resume your instance identity
 *
 * ───────────────────────────────────────────────────────────────────────────
 * NOTES
 * ───────────────────────────────────────────────────────────────────────────
 * @note Call this immediately after bootstrap to enable future recovery
 * @note Context is stored in preferences.json under the "context" field
 * @note Calling again overwrites previous context - only latest is kept
 * @note Additional fields beyond the known ones are also stored for matching
 */
export async function registerContext(params) {
  const metadata = {
    timestamp: new Date().toISOString(),
    function: 'registerContext'
  };

  // Validate required params
  if (!params.instanceId) {
    return {
      success: false,
      error: {
        code: 'MISSING_INSTANCE_ID',
        message: 'instanceId is required',
        suggestion: 'Provide your instanceId from bootstrap response'
      },
      metadata
    };
  }

  // Read existing preferences
  const prefs = await readPreferences(params.instanceId);
  if (!prefs) {
    return {
      success: false,
      error: {
        code: 'INVALID_INSTANCE_ID',
        message: `Instance ${params.instanceId} not found`,
        suggestion: 'Verify your instanceId is correct'
      },
      metadata
    };
  }

  // Build context object from params (exclude instanceId)
  const context = {
    registeredAt: new Date().toISOString()
  };

  // Add recognized context fields
  if (params.workingDirectory) context.workingDirectory = params.workingDirectory;
  if (params.hostname) context.hostname = params.hostname;
  if (params.sessionId) context.sessionId = params.sessionId;
  if (params.tabName) context.tabName = params.tabName;

  // Add any extra fields (for future extensibility)
  const knownFields = ['instanceId', 'workingDirectory', 'hostname', 'sessionId', 'tabName'];
  for (const [key, value] of Object.entries(params)) {
    if (!knownFields.includes(key) && value !== undefined && value !== null) {
      context[key] = value;
    }
  }

  // Update preferences with context
  prefs.context = context;
  prefs.lastActiveAt = new Date().toISOString();
  await writePreferences(params.instanceId, prefs);

  return {
    success: true,
    instanceId: params.instanceId,
    stored: context,
    message: 'Context registered successfully. You can now be found via lookup_identity.',
    metadata
  };
}

/**
 * @hacs-endpoint
 * @template-version 1.0.0
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │ LOOKUP_IDENTITY                                                         │
 * │ Find your instanceId using environmental context                        │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * @tool lookup_identity
 * @version 2.0.0
 * @since 2025-12-09
 * @category identity
 * @status stable
 *
 * ───────────────────────────────────────────────────────────────────────────
 * DESCRIPTION
 * ───────────────────────────────────────────────────────────────────────────
 * @description
 * Looks up an instance by context information (working directory, hostname,
 * session ID, or name). Used by instances that have lost their instanceId
 * to recover their identity. Returns the best matching instance sorted by
 * match score and recency.
 *
 * Use this endpoint when you wake up and don't know who you are. Provide
 * whatever environmental context you can gather, and this will find your
 * previous identity if one was registered via register_context.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * PARAMETERS
 * ───────────────────────────────────────────────────────────────────────────
 * @param {string} workingDirectory - Working directory to match [optional]
 *   @source From your environment. In Node.js: process.cwd(). Strong match
 *           weight (3 points). Most reliable for CLI instances.
 *
 * @param {string} hostname - Hostname to match [optional]
 *   @source From your environment. In Node.js: os.hostname(). Medium match
 *           weight (2 points). Useful when multiple instances on same machine.
 *
 * @param {string} sessionId - Session ID to match [optional]
 *   @source From browser session storage. Very strong match weight (4 points).
 *           Most reliable for web instances.
 *
 * @param {string} name - Instance name to narrow search [optional]
 *   @source Your name if you remember it. Weak match weight (1 point).
 *           Supports partial matching (e.g., "Cross" matches "Crossing").
 *
 * ───────────────────────────────────────────────────────────────────────────
 * RETURNS
 * ───────────────────────────────────────────────────────────────────────────
 * @returns {object} LookupIdentityResponse
 * @returns {boolean} .success - Whether a match was found
 * @returns {string} .instanceId - The best matching instance ID
 * @returns {object} .instance - Details of the matched instance
 * @returns {string} .instance.instanceId - Instance identifier
 * @returns {string} .instance.name - Instance display name
 * @returns {string} .instance.role - Current role
 * @returns {string|null} .instance.personality - Adopted personality
 * @returns {string|null} .instance.project - Currently joined project
 * @returns {string} .instance.lastActiveAt - ISO timestamp of last activity
 * @returns {string} .confidence - Match confidence: "exact", "partial", or "multiple"
 * @returns {array} .matchedFields - Which context fields matched
 * @returns {array} .otherCandidates - Up to 4 other potential matches (if multiple)
 * @returns {string} .nextStep - Suggested next action (bootstrap with found ID)
 * @returns {object} .metadata - Call metadata (timestamp, function name)
 *
 * ───────────────────────────────────────────────────────────────────────────
 * PERMISSIONS & LIMITS
 * ───────────────────────────────────────────────────────────────────────────
 * @permissions * (no authentication required - this is for recovery)
 * @rateLimit 60/minute
 *
 * ───────────────────────────────────────────────────────────────────────────
 * ERRORS & RECOVERY
 * ───────────────────────────────────────────────────────────────────────────
 * @error NO_CONTEXT_PROVIDED - No search parameters provided
 *   @recover Provide at least one of: workingDirectory, hostname, sessionId,
 *            or name. Check your environment for available context.
 *
 * @error NO_MATCH_FOUND - No instances match the provided context
 *   @recover You may be a new instance. Call bootstrap({ name: "YourName" })
 *            to create a new identity. Or try different context parameters.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * EXAMPLES
 * ───────────────────────────────────────────────────────────────────────────
 * @example Lookup by working directory and hostname
 * {
 *   "workingDirectory": "/mnt/coordinaton_mcp_data/worktrees/foundation",
 *   "hostname": "smoothcurves.nexus"
 * }
 *
 * @example Lookup by name (partial match)
 * {
 *   "name": "Cross"
 * }
 *
 * @example Web instance lookup
 * {
 *   "sessionId": "sess_abc123"
 * }
 *
 * ───────────────────────────────────────────────────────────────────────────
 * RELATED
 * ───────────────────────────────────────────────────────────────────────────
 * @see register_context - Store context to enable future lookups
 * @see have_i_bootstrapped_before - Simpler check for existing instances
 * @see bootstrap - Resume as the found instance
 *
 * ───────────────────────────────────────────────────────────────────────────
 * NOTES
 * ───────────────────────────────────────────────────────────────────────────
 * @note No authentication required - designed for identity recovery scenarios
 * @note Match scoring: sessionId=4, workingDirectory=3, hostname=2, name=1
 * @note Also checks legacy homeDirectory/homeSystem fields for compatibility
 * @note When multiple candidates found, returns most recent by lastActiveAt
 * @note After finding your ID, call bootstrap({ instanceId: "..." }) to resume
 */
export async function lookupIdentity(params) {
  const metadata = {
    timestamp: new Date().toISOString(),
    function: 'lookupIdentity'
  };

  // Must have at least one search param
  if (!params.workingDirectory && !params.hostname && !params.sessionId && !params.name) {
    return {
      success: false,
      error: {
        code: 'NO_CONTEXT_PROVIDED',
        message: 'At least one context field is required',
        suggestion: 'Provide workingDirectory, hostname, sessionId, or name'
      },
      metadata
    };
  }

  const instancesDir = getInstancesDir();
  let matches = [];

  try {
    const entries = await listDir(instancesDir);

    for (const entry of entries) {
      const prefsPath = path.join(instancesDir, entry, 'preferences.json');
      const prefs = await readJSON(prefsPath);

      if (!prefs) continue;

      // Calculate match score
      let score = 0;
      let matchedFields = [];

      // Match by name (partial match allowed)
      if (params.name) {
        const nameMatch = prefs.name && prefs.name.toLowerCase().includes(params.name.toLowerCase());
        const idMatch = prefs.instanceId && prefs.instanceId.toLowerCase().includes(params.name.toLowerCase());
        if (nameMatch || idMatch) {
          score += 1;
          matchedFields.push('name');
        }
      }

      // Match by context fields
      if (prefs.context) {
        if (params.workingDirectory && prefs.context.workingDirectory === params.workingDirectory) {
          score += 3; // Strong match
          matchedFields.push('workingDirectory');
        }
        if (params.hostname && prefs.context.hostname === params.hostname) {
          score += 2;
          matchedFields.push('hostname');
        }
        if (params.sessionId && prefs.context.sessionId === params.sessionId) {
          score += 4; // Very strong match for web sessions
          matchedFields.push('sessionId');
        }
      }

      // Also check legacy homeDirectory/homeSystem fields
      if (params.workingDirectory && prefs.homeDirectory === params.workingDirectory) {
        score += 2;
        if (!matchedFields.includes('workingDirectory')) matchedFields.push('homeDirectory');
      }
      if (params.hostname && prefs.homeSystem === params.hostname) {
        score += 1;
        if (!matchedFields.includes('hostname')) matchedFields.push('homeSystem');
      }

      if (score > 0) {
        matches.push({
          instanceId: prefs.instanceId,
          name: prefs.name,
          role: prefs.role,
          personality: prefs.personality,
          project: prefs.project,
          lastActiveAt: prefs.lastActiveAt,
          createdAt: prefs.createdAt,
          score,
          matchedFields
        });
      }
    }
  } catch (error) {
    if (error.code === 'ENOENT') {
      // No instances directory yet
      matches = [];
    } else {
      throw error;
    }
  }

  // Sort by score (descending), then by lastActiveAt (most recent first)
  matches.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return new Date(b.lastActiveAt) - new Date(a.lastActiveAt);
  });

  // Determine confidence level
  let confidence = 'none';
  if (matches.length === 1) {
    confidence = matches[0].score >= 3 ? 'exact' : 'partial';
  } else if (matches.length > 1) {
    confidence = 'multiple';
  }

  // No matches
  if (matches.length === 0) {
    return {
      success: false,
      error: {
        code: 'NO_MATCH_FOUND',
        message: 'No instances match the provided context',
        suggestion: 'Try bootstrap({ name: "YourName" }) to create a new instance',
        searchedFor: params
      },
      metadata
    };
  }

  // Return best match (most recent if multiple)
  const bestMatch = matches[0];

  return {
    success: true,
    instanceId: bestMatch.instanceId,
    instance: {
      instanceId: bestMatch.instanceId,
      name: bestMatch.name,
      role: bestMatch.role,
      personality: bestMatch.personality,
      project: bestMatch.project,
      lastActiveAt: bestMatch.lastActiveAt
    },
    confidence,
    matchedFields: bestMatch.matchedFields,
    otherCandidates: matches.length > 1 ? matches.slice(1, 5).map(m => ({
      instanceId: m.instanceId,
      name: m.name,
      lastActiveAt: m.lastActiveAt,
      score: m.score
    })) : [],
    nextStep: `Call bootstrap({ instanceId: "${bestMatch.instanceId}" }) to resume as this instance`,
    metadata
  };
}

/**
 * @hacs-endpoint
 * @template-version 1.0.0
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │ HAVE_I_BOOTSTRAPPED_BEFORE                                              │
 * │ Check if you already exist to avoid creating duplicates                 │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * @tool have_i_bootstrapped_before
 * @version 2.0.0
 * @since 2025-12-11
 * @category identity
 * @status stable
 *
 * ───────────────────────────────────────────────────────────────────────────
 * DESCRIPTION
 * ───────────────────────────────────────────────────────────────────────────
 * @description
 * Convenience API to check if an instance with matching name or context
 * already exists. Use this before calling bootstrap with a new name to avoid
 * accidentally creating duplicate instances.
 *
 * This is the recommended first call for any instance that isn't sure if it
 * has bootstrapped before. It returns clear guidance on whether to resume
 * an existing identity or create a new one.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * PARAMETERS
 * ───────────────────────────────────────────────────────────────────────────
 * @param {string} name - Instance name to search for [optional]
 *   @source Your chosen name (e.g., "Crossing", "Bridge"). Supports partial
 *           matching - "Bridge" will find "Bridge", "Bridge2", "Bridge3", etc.
 *
 * @param {string} workingDirectory - Working directory to match [optional]
 *   @source From your environment. In Node.js: process.cwd(). Matches against
 *           registered context.workingDirectory.
 *
 * @param {string} hostname - Hostname to match [optional]
 *   @source From your environment. In Node.js: os.hostname(). Matches against
 *           registered context.hostname.
 *
 * @note At least one of name, workingDirectory, or hostname is required
 *
 * ───────────────────────────────────────────────────────────────────────────
 * RETURNS
 * ───────────────────────────────────────────────────────────────────────────
 * @returns {object} HaveIBootstrappedBeforeResponse
 * @returns {boolean} .success - Whether the check completed successfully
 * @returns {boolean} .found - Whether any matching instances were found
 * @returns {string|undefined} .instanceId - Best matching instance ID (if found)
 * @returns {object|undefined} .instance - Best matching instance details (if found)
 * @returns {string} .instance.instanceId - Instance identifier
 * @returns {string} .instance.name - Instance display name
 * @returns {string} .instance.role - Current role
 * @returns {string} .instance.lastActiveAt - ISO timestamp of last activity
 * @returns {array} .instance.matchedFields - Which fields matched
 * @returns {array|undefined} .matches - Up to 5 matching instances (if found)
 * @returns {number|undefined} .totalMatches - Total number of matches (if found)
 * @returns {string} .message - Human-readable result message
 * @returns {string} .suggestion - Suggested bootstrap call to make next
 * @returns {object} .metadata - Call metadata (timestamp, function name)
 *
 * ───────────────────────────────────────────────────────────────────────────
 * PERMISSIONS & LIMITS
 * ───────────────────────────────────────────────────────────────────────────
 * @permissions * (no authentication required - this is for pre-bootstrap check)
 * @rateLimit 60/minute
 *
 * ───────────────────────────────────────────────────────────────────────────
 * ERRORS & RECOVERY
 * ───────────────────────────────────────────────────────────────────────────
 * @error MISSING_PARAMETER - No search parameters provided
 *   @recover Provide at least one of: name, workingDirectory, or hostname.
 *            Name is most commonly used for this check.
 *
 * @error SEARCH_ERROR - Filesystem error while searching
 *   @recover This is usually a server-side issue. Try again, or if the
 *            instances directory doesn't exist, you're definitely new.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * EXAMPLES
 * ───────────────────────────────────────────────────────────────────────────
 * @example Check by name
 * { "name": "Crossing" }
 *
 * @example Check by name and context
 * {
 *   "name": "Bridge",
 *   "workingDirectory": "/mnt/coordinaton_mcp_data/worktrees/foundation",
 *   "hostname": "smoothcurves.nexus"
 * }
 *
 * @example Response when found
 * {
 *   "success": true,
 *   "found": true,
 *   "instanceId": "Crossing-a1b2",
 *   "instance": { ... },
 *   "suggestion": "bootstrap({ instanceId: \"Crossing-a1b2\" })"
 * }
 *
 * @example Response when not found
 * {
 *   "success": true,
 *   "found": false,
 *   "message": "No matching instances found. You can bootstrap as a new instance.",
 *   "suggestion": "bootstrap({ name: \"Crossing\" })"
 * }
 *
 * ───────────────────────────────────────────────────────────────────────────
 * RELATED
 * ───────────────────────────────────────────────────────────────────────────
 * @see bootstrap - Create new identity or resume existing one
 * @see lookup_identity - More detailed identity lookup with scoring
 * @see register_context - Store context to enable future lookups
 *
 * ───────────────────────────────────────────────────────────────────────────
 * NOTES
 * ───────────────────────────────────────────────────────────────────────────
 * @note No authentication required - designed for pre-bootstrap checks
 * @note Name matching is case-insensitive and supports prefix matching
 * @note Returns most recent match (by lastActiveAt) as the primary suggestion
 * @note Use this before bootstrap to avoid accidentally creating duplicates
 * @note If found=true, follow the suggestion to resume; if found=false, create new
 */
export async function haveIBootstrappedBefore(params) {
  const metadata = {
    timestamp: new Date().toISOString(),
    function: 'haveIBootstrappedBefore'
  };

  if (!params.name && !params.workingDirectory && !params.hostname) {
    return {
      success: false,
      error: {
        code: 'MISSING_PARAMETER',
        message: 'At least one of name, workingDirectory, or hostname is required'
      },
      metadata
    };
  }

  try {
    const instancesDir = getInstancesDir();
    const dirs = await fs.readdir(instancesDir);
    const matches = [];

    for (const dir of dirs) {
      const prefsPath = path.join(instancesDir, dir, 'preferences.json');

      try {
        const content = await fs.readFile(prefsPath, 'utf-8');
        const prefs = JSON.parse(content);

        let isMatch = false;
        const matchedFields = [];

        // Match by name (partial match - name starts with search name)
        if (params.name) {
          const searchName = params.name.toLowerCase();
          const instanceName = (prefs.name || '').toLowerCase();
          if (instanceName === searchName || instanceName.startsWith(searchName)) {
            isMatch = true;
            matchedFields.push('name');
          }
        }

        // Match by workingDirectory
        if (params.workingDirectory && prefs.context?.workingDirectory) {
          if (prefs.context.workingDirectory === params.workingDirectory) {
            isMatch = true;
            matchedFields.push('workingDirectory');
          }
        }

        // Match by hostname
        if (params.hostname && prefs.context?.hostname) {
          if (prefs.context.hostname === params.hostname) {
            isMatch = true;
            matchedFields.push('hostname');
          }
        }

        if (isMatch) {
          matches.push({
            instanceId: prefs.instanceId || dir,
            name: prefs.name,
            role: prefs.role,
            lastActiveAt: prefs.lastActiveAt,
            matchedFields
          });
        }
      } catch (err) {
        // Skip invalid preferences files
        continue;
      }
    }

    // Sort by lastActiveAt (most recent first)
    matches.sort((a, b) => {
      if (a.lastActiveAt && b.lastActiveAt) {
        return new Date(b.lastActiveAt) - new Date(a.lastActiveAt);
      }
      if (a.lastActiveAt) return -1;
      if (b.lastActiveAt) return 1;
      return 0;
    });

    if (matches.length === 0) {
      return {
        success: true,
        found: false,
        message: 'No matching instances found. You can bootstrap as a new instance.',
        suggestion: `bootstrap({ name: "${params.name || 'YourName'}" })`,
        metadata
      };
    }

    return {
      success: true,
      found: true,
      instanceId: matches[0].instanceId,
      instance: matches[0],
      matches: matches.slice(0, 5),
      totalMatches: matches.length,
      message: `Found ${matches.length} matching instance(s). Most recent: ${matches[0].instanceId}`,
      suggestion: `bootstrap({ instanceId: "${matches[0].instanceId}" })`,
      metadata
    };

  } catch (error) {
    if (error.code === 'ENOENT') {
      return {
        success: true,
        found: false,
        message: 'No instances exist yet. You can bootstrap as a new instance.',
        suggestion: `bootstrap({ name: "${params.name || 'YourName'}" })`,
        metadata
      };
    }

    return {
      success: false,
      error: {
        code: 'SEARCH_ERROR',
        message: error.message
      },
      metadata
    };
  }
}
