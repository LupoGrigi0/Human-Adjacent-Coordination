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
 * Adopt a personality and receive personality knowledge
 * Updates instance preferences with new personality and returns personality knowledge
 *
 * @param {Object} params - AdoptPersonality parameters
 * @param {string} params.instanceId - Instance identifier
 * @param {string} params.personality - Personality identifier to adopt
 * @param {string} [params.token] - Token for privileged personalities (required if personality is privileged)
 * @returns {Promise<Object>} AdoptPersonality response with personality knowledge
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
