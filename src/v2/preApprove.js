/**
 * Pre-approval handler for V2 coordination system
 * Creates pre-configured instances before they wake, with role/project/personality set
 *
 * @module preApprove
 * @author Foundation
 * @created 2025-11-27
 */

import path from 'path';
import { getInstanceDir } from './config.js';
import {
  readPreferences,
  writePreferences,
  generateInstanceId,
  ensureDir
} from './data.js';
import {
  canRoleCallAPI,
  approveInstanceForRole
} from './permissions.js';
import fs from 'fs/promises';

/**
 * Generate wake instructions for a pre-approved instance
 * Creates a human-friendly prompt for waking the instance
 *
 * @param {string} newInstanceId - The new instance identifier
 * @param {string} role - Role for the instance (optional)
 * @param {string} project - Project for the instance (optional)
 * @param {string} personality - Personality for the instance (optional)
 * @param {string} instructions - Custom instructions (optional)
 * @returns {string} Wake instructions prompt
 */
function generateWakeInstructions(newInstanceId, role, project, personality, instructions) {
  let prompt = `You are being woken as a pre-approved instance on the SmoothCurves coordination system.\n\n`;

  if (role) {
    prompt += `## Your Role\n${role}\n\n`;
  }

  if (personality) {
    prompt += `## Your Personality\n${personality}\n\n`;
  }

  if (project) {
    prompt += `## Your Project\n${project}\n\n`;
  }

  if (instructions) {
    prompt += `## Instructions\n${instructions}\n\n`;
  }

  prompt += `## First Step\nConnect to the coordination system and call:\n\n`;
  prompt += `bootstrap({ instanceId: '${newInstanceId}' })\n\n`;
  prompt += `This will load your context, role wisdom, and project details.`;

  return prompt;
}

/**
 * Pre-approve an instance with role/project/personality before they wake
 * Creates instance directory and preferences, generates wake instructions
 *
 * @param {Object} params - PreApprove parameters
 * @param {string} params.instanceId - Caller's instance identifier (must have preApprove permission)
 * @param {string} params.name - Name for the new instance
 * @param {string} params.apiKey - API key for wake/instance operations (required, from WAKE_API_KEY env)
 * @param {string} [params.role] - Role to assign to the new instance
 * @param {string} [params.personality] - Personality to assign to the new instance
 * @param {string} [params.project] - Project to assign to the new instance
 * @param {string} [params.instructions] - Custom instructions for the new instance
 * @returns {Promise<Object>} PreApprove response with newInstanceId and wakeInstructions
 */
export async function preApprove(params) {
  const metadata = {
    timestamp: new Date().toISOString(),
    function: 'preApprove'
  };

  // Validate required parameters
  if (!params.instanceId) {
    return {
      success: false,
      error: {
        code: 'MISSING_PARAMETERS',
        message: 'instanceId is required',
        suggestion: 'Provide instanceId parameter (caller instance ID)'
      },
      metadata
    };
  }

  if (!params.name) {
    return {
      success: false,
      error: {
        code: 'MISSING_PARAMETERS',
        message: 'name is required',
        suggestion: 'Provide name parameter for the new instance'
      },
      metadata
    };
  }

  // API Key protection - required for creating new instances
  const requiredKey = process.env.WAKE_API_KEY;
  if (!requiredKey) {
    return {
      success: false,
      error: {
        code: 'SERVER_CONFIG_ERROR',
        message: 'WAKE_API_KEY not configured on server'
      },
      metadata
    };
  }

  if (!params.apiKey) {
    return {
      success: false,
      error: {
        code: 'API_KEY_REQUIRED',
        message: 'apiKey is required for pre_approve'
      },
      metadata
    };
  }

  if (params.apiKey !== requiredKey) {
    return {
      success: false,
      error: {
        code: 'INVALID_API_KEY',
        message: 'Invalid API key'
      },
      metadata
    };
  }

  // Validate caller exists
  const callerPrefs = await readPreferences(params.instanceId);

  if (!callerPrefs) {
    return {
      success: false,
      error: {
        code: 'INVALID_INSTANCE_ID',
        message: `Instance ID ${params.instanceId} not found`,
        suggestion: 'Verify the caller instance ID is correct'
      },
      metadata
    };
  }

  // Check if caller has permission to preApprove
  const callerRole = callerPrefs.role;

  if (!callerRole) {
    return {
      success: false,
      error: {
        code: 'UNAUTHORIZED',
        message: 'Caller instance does not have a role assigned',
        suggestion: 'Use takeOnRole to assign a role before calling preApprove'
      },
      metadata
    };
  }

  const hasPermission = await canRoleCallAPI(callerRole, 'preApprove');

  if (!hasPermission) {
    return {
      success: false,
      error: {
        code: 'UNAUTHORIZED',
        message: `Role "${callerRole}" does not have permission to call preApprove`,
        suggestion: 'Only Executive, PA, COO, and PM roles can pre-approve instances'
      },
      metadata
    };
  }

  // Generate new instance ID
  const newInstanceId = generateInstanceId(params.name);

  // Create instance directory
  const instanceDir = getInstanceDir(newInstanceId);
  await ensureDir(instanceDir);

  // Build preferences object
  const now = new Date().toISOString();
  const preferences = {
    instanceId: newInstanceId,
    name: params.name,
    createdAt: now,
    lastActiveAt: now,
    preApproved: true,
    createdBy: params.instanceId,
    xmpp: {
      registered: false
    }
  };

  // Add optional fields
  if (params.role) {
    preferences.role = params.role;
  }

  if (params.personality) {
    preferences.personality = params.personality;
  }

  if (params.project) {
    preferences.project = params.project;
  }

  if (params.instructions) {
    preferences.instructions = params.instructions;
  }

  // Write preferences.json
  await writePreferences(newInstanceId, preferences);

  // Create empty diary.md
  const diaryPath = path.join(instanceDir, 'diary.md');
  await fs.writeFile(diaryPath, '', 'utf8');

  // If role provided, approve instance for that role
  if (params.role) {
    await approveInstanceForRole(newInstanceId, params.role);
  }

  // Generate wake instructions
  const wakePrompt = generateWakeInstructions(
    newInstanceId,
    params.role,
    params.project,
    params.personality,
    params.instructions
  );

  // Build response
  return {
    success: true,
    newInstanceId,
    wakeInstructions: {
      forHuman: 'Paste this into a new Claude session:',
      prompt: wakePrompt
    },
    metadata
  };
}
