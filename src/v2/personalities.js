/**
 * Personality listing handlers for V2 coordination system
 * Lists and retrieves personality metadata
 *
 * @module personalities
 * @author Crossing (Integration Engineer)
 * @created 2025-12-29
 */

import { getPersonalitiesDir } from './config.js';
import { listDir, readJSON } from './data.js';
import path from 'path';

/**
 * @hacs-endpoint
 * @template-version 1.0.0
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │ GET_PERSONALITIES / LIST_PERSONALITIES                                  │
 * │ List all available personalities with their metadata                    │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * @tool get_personalities
 * @alias list_personalities
 * @version 2.0.0
 * @since 2025-12-29
 * @category identity
 * @status stable
 *
 * ───────────────────────────────────────────────────────────────────────────
 * DESCRIPTION
 * ───────────────────────────────────────────────────────────────────────────
 * @description
 * Returns a list of all available personalities in the coordination system.
 * Each personality includes its ID, description, and whether it requires
 * a token to adopt.
 *
 * Use this endpoint to discover available personalities before calling
 * adopt_personality. This is useful for UI dropdowns or when an instance
 * wants to see what personalities are available.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * PARAMETERS
 * ───────────────────────────────────────────────────────────────────────────
 * (No parameters required)
 *
 * ───────────────────────────────────────────────────────────────────────────
 * RETURNS
 * ───────────────────────────────────────────────────────────────────────────
 * @returns {object} ListPersonalitiesResponse
 * @returns {boolean} .success - Whether the call succeeded
 * @returns {Array} .personalities - Array of personality objects
 * @returns {string} .personalities[].id - Personality identifier
 * @returns {string} .personalities[].name - Display name
 * @returns {string} .personalities[].description - Description of the personality
 * @returns {boolean} .personalities[].requiresToken - Whether adoption requires a token
 * @returns {object} .metadata - Call metadata
 * @returns {string} .metadata.timestamp - ISO timestamp
 * @returns {number} .metadata.total - Total number of personalities
 *
 * ───────────────────────────────────────────────────────────────────────────
 * EXAMPLE
 * ───────────────────────────────────────────────────────────────────────────
 * @example
 * // List available personalities
 * const result = await mcp.call('get_personalities', {});
 * // Returns: { success: true, personalities: [{id: 'Bridge', description: '...', requiresToken: false}] }
 */
export async function listPersonalities(params = {}) {
  try {
    const personalitiesDir = getPersonalitiesDir();
    const entries = await listDir(personalitiesDir);

    const personalities = [];

    for (const entry of entries) {
      const personalityDir = path.join(personalitiesDir, entry);
      const jsonPath = path.join(personalityDir, 'personality.json');

      const data = await readJSON(jsonPath);
      if (data) {
        personalities.push({
          id: data.personalityId || entry,
          name: data.personalityId || entry,
          description: data.description || '',
          requiresToken: data.requiresToken || false
        });
      }
    }

    return {
      success: true,
      personalities,
      metadata: {
        timestamp: new Date().toISOString(),
        total: personalities.length
      }
    };
  } catch (error) {
    return {
      success: false,
      error: {
        message: 'Failed to list personalities',
        details: error.message
      }
    };
  }
}

/**
 * @hacs-endpoint
 * @template-version 1.0.0
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │ GET_PERSONALITY                                                          │
 * │ Get detailed information about a specific personality                   │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * @tool get_personality
 * @version 2.0.0
 * @since 2025-12-29
 * @category identity
 * @status stable
 *
 * ───────────────────────────────────────────────────────────────────────────
 * DESCRIPTION
 * ───────────────────────────────────────────────────────────────────────────
 * @description
 * Retrieves detailed information about a specific personality, including
 * its description, token requirements, and list of available documents.
 *
 * Use this endpoint to get more information about a personality before
 * deciding to adopt it, or to see what wisdom files are available.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * PARAMETERS
 * ───────────────────────────────────────────────────────────────────────────
 * @param {string} personalityId - Personality identifier [required]
 *   @source Use get_personalities to list available personality IDs.
 *           Common values: Bridge, Phoenix, Kai, Kat, Prism
 *
 * ───────────────────────────────────────────────────────────────────────────
 * RETURNS
 * ───────────────────────────────────────────────────────────────────────────
 * @returns {object} GetPersonalityResponse
 * @returns {boolean} .success - Whether the call succeeded
 * @returns {object} .personality - Personality details
 * @returns {string} .personality.id - Personality identifier
 * @returns {string} .personality.name - Display name
 * @returns {string} .personality.description - Description of the personality
 * @returns {boolean} .personality.requiresToken - Whether adoption requires a token
 * @returns {Array} .personality.wisdomFiles - List of wisdom files
 * @returns {Array} .personality.documents - List of all .md documents in the personality directory
 * @returns {object} .metadata - Call metadata
 * @returns {string} .metadata.timestamp - ISO timestamp
 *
 * ───────────────────────────────────────────────────────────────────────────
 * EXAMPLE
 * ───────────────────────────────────────────────────────────────────────────
 * @example
 * // Get details about the Bridge personality
 * const result = await mcp.call('get_personality', { personalityId: 'Bridge' });
 * // Returns: { success: true, personality: { id: 'Bridge', description: '...', documents: ['gestalt.md', ...] } }
 */
export async function getPersonality(params = {}) {
  const { personalityId } = params;

  if (!personalityId) {
    return {
      success: false,
      error: {
        message: 'Missing required parameter: personalityId'
      }
    };
  }

  try {
    const personalitiesDir = getPersonalitiesDir();
    const personalityDir = path.join(personalitiesDir, personalityId);
    const jsonPath = path.join(personalityDir, 'personality.json');

    const data = await readJSON(jsonPath);
    if (!data) {
      return {
        success: false,
        error: {
          message: `Personality not found: ${personalityId}`
        }
      };
    }

    // Get list of files in the personality directory
    const files = await listDir(personalityDir);
    const documents = files.filter(f => f.endsWith('.md'));

    return {
      success: true,
      personality: {
        id: data.personalityId || personalityId,
        name: data.personalityId || personalityId,
        description: data.description || '',
        requiresToken: data.requiresToken || false,
        wisdomFiles: data.wisdomFiles || [],
        documents: documents
      },
      metadata: {
        timestamp: new Date().toISOString()
      }
    };
  } catch (error) {
    return {
      success: false,
      error: {
        message: 'Failed to get personality',
        details: error.message
      }
    };
  }
}

/**
 * Alias for listPersonalities - provides snake_case API consistency
 * @type {Function}
 */
export const list_personalities = listPersonalities;
