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
 * List all available personalities
 * @returns {Promise<{success: boolean, personalities: Array}>}
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
 * Get details for a specific personality
 * @param {object} params
 * @param {string} params.personalityId - Personality ID to retrieve
 * @returns {Promise<{success: boolean, personality: object}>}
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
