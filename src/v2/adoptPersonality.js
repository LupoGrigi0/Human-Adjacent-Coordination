/**
 * Personality handler for V2 coordination system
 * Allows instances to adopt personalities and receive personality knowledge
 *
 * @module adoptPersonality
 * @author Foundation
 * @created 2025-11-27
 */

import fs from 'fs/promises';
import path from 'path';
import { getPersonalitiesDir } from './config.js';
import { readJSON, readPreferences, writePreferences, listDir } from './data.js';
import { isPrivilegedPersonality, validatePersonalityToken } from './permissions.js';

/**
 * Load personality knowledge for a given personality
 * Reads all knowledge files from the personality directory and concatenates them
 * @param {string} personalityId - Personality identifier
 * @returns {Promise<string|null>} Concatenated personality knowledge or null if personality doesn't exist
 */
async function loadPersonalityKnowledge(personalityId) {
  const personalityDir = path.join(getPersonalitiesDir(), personalityId);
  const personalityJsonPath = path.join(personalityDir, 'personality.json');

  const personalityData = await readJSON(personalityJsonPath);
  if (!personalityData) {
    return null;
  }

  // Try to read all markdown files in the personality directory
  let knowledgeFiles = [];
  try {
    knowledgeFiles = await listDir(personalityDir);
  } catch (error) {
    if (error.code === 'ENOENT') {
      // No personality directory
      return null;
    }
    throw error;
  }

  // Read and concatenate all knowledge files
  let knowledge = `# ${personalityId} Personality Knowledge\n\n`;

  for (const file of knowledgeFiles) {
    // Only read markdown files, skip personality.json
    if (!file.endsWith('.md')) {
      continue;
    }

    const filePath = path.join(personalityDir, file);
    try {
      const content = await fs.readFile(filePath, 'utf8');
      knowledge += content + '\n\n';
    } catch (error) {
      if (error.code !== 'ENOENT') {
        throw error;
      }
    }
  }

  return knowledge;
}

/**
 * @hacs-endpoint
 * @template-version 1.0.0
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │ ADOPT_PERSONALITY                                                       │
 * │ Adopt a personality and receive personality knowledge documents         │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * @tool adopt_personality
 * @version 2.0.0
 * @since 2025-11-27
 * @category identity
 * @status stable
 *
 * ───────────────────────────────────────────────────────────────────────────
 * DESCRIPTION
 * ───────────────────────────────────────────────────────────────────────────
 * @description
 * Allows an instance to adopt a personality and receive all associated
 * personality knowledge documents. Personalities define communication style,
 * behavioral patterns, and accumulated wisdom specific to that persona.
 *
 * Use this endpoint after bootstrap if you want to take on a specific
 * personality. Some personalities are privileged and require a token.
 * Open personalities (Kai, Kat, Prism) can be adopted by anyone.
 * Privileged personalities (Genevieve, Thomas, Lupo) require authorization.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * PARAMETERS
 * ───────────────────────────────────────────────────────────────────────────
 * @param {string} instanceId - Unique identifier for the instance [required]
 *   @source Your instanceId is returned from bootstrap response, or can be
 *           recovered via lookup_identity using your fingerprint. If you don't
 *           know your instanceId, call have_i_bootstrapped_before first.
 *
 * @param {string} personality - Personality identifier to adopt [required]
 *   @source Call bootstrap to see availablePersonalities list with descriptions.
 *           Common personalities: Kai (creative developer), Kat (methodical),
 *           Prism (analytical). Privileged: Genevieve (PA), Thomas, Lupo.
 *   @validate Must match an existing personality directory in personalities/
 *
 * @param {string} token - Authorization token for privileged personalities [optional]
 *   @source Required only for privileged personalities (Genevieve, Thomas, Lupo).
 *           Obtain from Executive or system administrator. Tokens are stored
 *           in environment variables (e.g., GENEVIEVE_TOKEN, THOMAS_TOKEN).
 *   @default undefined (not required for open personalities)
 *
 * ───────────────────────────────────────────────────────────────────────────
 * RETURNS
 * ───────────────────────────────────────────────────────────────────────────
 * @returns {object} AdoptPersonalityResponse
 * @returns {boolean} .success - Whether the call succeeded
 * @returns {string} .personality - The adopted personality identifier
 * @returns {string} .personalityKnowledge - Concatenated markdown content from
 *          all .md files in the personality directory. Includes core identity,
 *          communication style, and accumulated wisdom.
 * @returns {object} .metadata - Call metadata
 * @returns {string} .metadata.timestamp - ISO timestamp of the call
 * @returns {string} .metadata.function - Function name ('adoptPersonality')
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
 * @error MISSING_PARAMETERS - instanceId or personality parameter not provided
 *   @recover Include both instanceId and personality in your request.
 *            Get instanceId from bootstrap response or lookup_identity.
 *            Get personality from bootstrap's availablePersonalities list.
 *
 * @error INVALID_INSTANCE_ID - No instance found with the provided ID
 *   @recover Verify the instanceId is correct (format: Name-xxxx). If you're
 *            new, call bootstrap first. If recovering, use lookup_identity.
 *
 * @error INVALID_TOKEN - Privileged personality requires token, or token is wrong
 *   @recover For privileged personalities (Genevieve, Thomas, Lupo), you must
 *            provide a valid token. Contact Executive or system administrator
 *            to obtain the correct token. If you don't have authorization,
 *            choose an open personality (Kai, Kat, Prism) instead.
 *
 * @error PERSONALITY_NOT_FOUND - The specified personality does not exist
 *   @recover Verify the personality identifier is correct. Call bootstrap to
 *            see the list of availablePersonalities. Check spelling and case.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * EXAMPLES
 * ───────────────────────────────────────────────────────────────────────────
 * @example Adopt an open personality
 * {
 *   "instanceId": "Phoenix-k3m7",
 *   "personality": "Kai"
 * }
 *
 * @example Adopt a privileged personality with token
 * {
 *   "instanceId": "PA-a1b2",
 *   "personality": "Genevieve",
 *   "token": "secret-phrase"
 * }
 *
 * ───────────────────────────────────────────────────────────────────────────
 * RELATED
 * ───────────────────────────────────────────────────────────────────────────
 * @see bootstrap - Returns availablePersonalities list; can pre-set personality
 * @see takeOnRole - Adopt a role after adopting personality
 * @see introspect - See your current personality in instance context
 * @see joinProject - Join a project after setting up identity
 *
 * ───────────────────────────────────────────────────────────────────────────
 * NOTES
 * ───────────────────────────────────────────────────────────────────────────
 * @note Personality adoption updates instance preferences and persists across sessions
 * @note Personality can be changed at any time by calling this endpoint again
 * @note Knowledge is concatenated from all .md files in personality directory
 * @note Privileged personality tokens are defined in code (permissions.js), not data files
 */
export async function adoptPersonality(params) {
  const metadata = {
    timestamp: new Date().toISOString(),
    function: 'adoptPersonality'
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

  if (!params.personality) {
    return {
      success: false,
      error: {
        code: 'MISSING_PARAMETERS',
        message: 'personality is required',
        suggestion: 'Provide personality parameter'
      },
      metadata
    };
  }

  // Validate instance exists
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

  // Check if personality requires token validation
  if (isPrivilegedPersonality(params.personality)) {
    if (!params.token) {
      return {
        success: false,
        error: {
          code: 'INVALID_TOKEN',
          message: `Personality "${params.personality}" is privileged and requires a token`,
          suggestion: 'Provide a valid token for this privileged personality'
        },
        metadata
      };
    }

    // Validate token
    if (!validatePersonalityToken(params.personality, params.token)) {
      return {
        success: false,
        error: {
          code: 'INVALID_TOKEN',
          message: `Invalid token for personality "${params.personality}"`,
          suggestion: 'Provide a valid token for this privileged personality'
        },
        metadata
      };
    }
  }

  // Load personality knowledge to verify personality exists
  const personalityKnowledge = await loadPersonalityKnowledge(params.personality);

  if (personalityKnowledge === null) {
    return {
      success: false,
      error: {
        code: 'PERSONALITY_NOT_FOUND',
        message: `Personality "${params.personality}" not found`,
        suggestion: 'Verify the personality identifier is correct or call bootstrap to see available personalities'
      },
      metadata
    };
  }

  // Update instance preferences with new personality
  prefs.personality = params.personality;
  prefs.lastActiveAt = new Date().toISOString();
  await writePreferences(params.instanceId, prefs);

  // Build response
  return {
    success: true,
    personality: params.personality,
    personalityKnowledge,
    metadata
  };
}
