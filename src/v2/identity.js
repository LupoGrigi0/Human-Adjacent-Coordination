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
 * Register context information for an instance
 * Called by instances after bootstrap to store identifiable context
 * This enables later recovery via lookupIdentity
 *
 * @param {Object} params - Registration parameters
 * @param {string} params.instanceId - Instance identifier (required)
 * @param {string} [params.workingDirectory] - Instance's working directory
 * @param {string} [params.hostname] - System hostname
 * @param {string} [params.sessionId] - Web session ID (for web instances)
 * @param {string} [params.tabName] - Browser tab name (for web instances)
 * @param {Object} [params.extra] - Any additional context fields
 * @returns {Promise<Object>} Registration result
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
 * Look up an instance by context information
 * Used by instances that don't know their ID to recover their identity
 * Returns the most recent matching instance by lastActiveAt
 *
 * @param {Object} params - Lookup parameters
 * @param {string} [params.workingDirectory] - Working directory to match
 * @param {string} [params.hostname] - Hostname to match
 * @param {string} [params.sessionId] - Session ID to match (web instances)
 * @param {string} [params.name] - Instance name to narrow search
 * @returns {Promise<Object>} Lookup result with matching instance
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
 * Check if an instance with this name/context has bootstrapped before
 * Convenience API to avoid creating duplicates
 *
 * @param {Object} params - Search parameters
 * @param {string} params.name - Instance name to search for
 * @param {string} [params.workingDirectory] - Working directory to match
 * @param {string} [params.hostname] - Hostname to match
 * @returns {Promise<Object>} Search result
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
