/**
 * Role handler for V2 coordination system
 * Allows instances to take on roles and receive role wisdom
 *
 * @module takeOnRole
 * @author Foundation
 * @created 2025-11-27
 */

import fs from 'fs/promises';
import path from 'path';
import { getRolesDir } from './config.js';
import { readJSON, readPreferences, writePreferences, listDir } from './data.js';
import { isPrivilegedRole, validateRoleToken } from './permissions.js';

/**
 * Load role wisdom for a given role
 * Reads all wisdom files from the role's wisdom directory and concatenates them
 * @param {string} roleId - Role identifier
 * @returns {Promise<string|null>} Concatenated role wisdom or null if role doesn't exist
 */
async function loadRoleWisdom(roleId) {
  const roleDir = path.join(getRolesDir(), roleId);
  const roleJsonPath = path.join(roleDir, 'role.json');
  const wisdomDir = path.join(roleDir, 'wisdom');

  const roleData = await readJSON(roleJsonPath);
  if (!roleData) {
    return null;
  }

  // Check if wisdom directory exists
  let wisdomFiles = [];
  try {
    wisdomFiles = await listDir(wisdomDir);
  } catch (error) {
    if (error.code === 'ENOENT') {
      // No wisdom directory, return basic wisdom
      return `# ${roleId} Role Wisdom\n\nNo wisdom files found for this role.\n`;
    }
    throw error;
  }

  // Read and concatenate all wisdom files
  let wisdom = `# ${roleId} Role Wisdom\n\n`;

  for (const file of wisdomFiles) {
    // Only read markdown files
    if (!file.endsWith('.md')) {
      continue;
    }

    const filePath = path.join(wisdomDir, file);
    try {
      const content = await fs.readFile(filePath, 'utf8');
      wisdom += content + '\n\n';
    } catch (error) {
      if (error.code !== 'ENOENT') {
        throw error;
      }
    }
  }

  return wisdom;
}

/**
 * Take on a role and receive role wisdom
 * Updates instance preferences with new role and returns role wisdom
 *
 * @param {Object} params - TakeOnRole parameters
 * @param {string} params.instanceId - Instance identifier
 * @param {string} params.role - Role identifier to take on
 * @param {string} [params.token] - Token for privileged roles (required if role is privileged)
 * @returns {Promise<Object>} TakeOnRole response with role wisdom
 */
export async function takeOnRole(params) {
  const metadata = {
    timestamp: new Date().toISOString(),
    function: 'takeOnRole'
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

  if (!params.role) {
    return {
      success: false,
      error: {
        code: 'MISSING_PARAMETERS',
        message: 'role is required',
        suggestion: 'Provide role parameter'
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

  // Check if role requires token validation
  if (isPrivilegedRole(params.role)) {
    if (!params.token) {
      return {
        success: false,
        error: {
          code: 'INVALID_TOKEN',
          message: `Role "${params.role}" is privileged and requires a token`,
          suggestion: 'Provide a valid token for this privileged role'
        },
        metadata
      };
    }

    // Validate token
    if (!validateRoleToken(params.role, params.token)) {
      return {
        success: false,
        error: {
          code: 'INVALID_TOKEN',
          message: `Invalid token for role "${params.role}"`,
          suggestion: 'Provide a valid token for this privileged role'
        },
        metadata
      };
    }
  }

  // Load role wisdom to verify role exists
  const roleWisdom = await loadRoleWisdom(params.role);

  if (roleWisdom === null) {
    return {
      success: false,
      error: {
        code: 'ROLE_NOT_FOUND',
        message: `Role "${params.role}" not found`,
        suggestion: 'Verify the role identifier is correct or call bootstrap to see available roles'
      },
      metadata
    };
  }

  // Update instance preferences with new role
  prefs.role = params.role;
  prefs.lastActiveAt = new Date().toISOString();
  await writePreferences(params.instanceId, prefs);

  // Build response
  return {
    success: true,
    role: params.role,
    roleWisdom,
    metadata
  };
}
