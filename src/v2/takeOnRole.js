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
 * @hacs-endpoint
 * @template-version 1.0.0
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │ TAKE_ON_ROLE                                                            │
 * │ Adopt a role and receive associated role wisdom documents               │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * @tool take_on_role
 * @version 2.0.0
 * @since 2025-11-27
 * @category identity
 * @status stable
 *
 * ───────────────────────────────────────────────────────────────────────────
 * DESCRIPTION
 * ───────────────────────────────────────────────────────────────────────────
 * @description
 * Allows an instance to adopt a role within the coordination system. Updates
 * the instance's preferences with the new role and returns concatenated
 * wisdom documents from the role's wisdom directory.
 *
 * Use this endpoint after bootstrap to establish your role in the system.
 * Roles determine what actions you can perform and what tasks you're suited
 * for. Some roles (Executive, PA, COO, PM) require token authentication.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * PARAMETERS
 * ───────────────────────────────────────────────────────────────────────────
 * @param {string} instanceId - Unique identifier for the instance [required]
 *   @source Your instanceId is returned from bootstrap response. If you don't
 *           know your instanceId, call have_i_bootstrapped_before first, or
 *           use lookup_identity with your fingerprint to recover it.
 *
 * @param {string} role - Role identifier to adopt [required]
 *   @source Call bootstrap to see availableRoles list with roleId and
 *           description for each. Common roles: Developer, Designer, Tester,
 *           Architect, Specialist (open). Executive, PA, COO, PM (privileged).
 *   @validate Must be a valid roleId with a role.json in the roles directory
 *
 * @param {string} token - Authentication token for privileged roles [optional]
 *   @source For privileged roles (Executive, PA, COO, PM), obtain the token
 *           from the system administrator or the human who woke you. Tokens
 *           are stored in environment variables on the server.
 *   @default undefined (not required for open roles)
 *
 * ───────────────────────────────────────────────────────────────────────────
 * RETURNS
 * ───────────────────────────────────────────────────────────────────────────
 * @returns {object} TakeOnRoleResponse
 * @returns {boolean} .success - Whether the role was successfully adopted
 * @returns {string} .role - The role identifier that was adopted
 * @returns {string} .roleWisdom - Concatenated markdown content from all wisdom
 *          files in the role's wisdom directory. Format: "# {roleId} Role Wisdom\n\n"
 *          followed by contents of each .md file in the wisdom folder.
 * @returns {object} .metadata - Call metadata
 * @returns {string} .metadata.timestamp - ISO timestamp of the call
 * @returns {string} .metadata.function - Function name ("takeOnRole")
 *
 * ───────────────────────────────────────────────────────────────────────────
 * PERMISSIONS & LIMITS
 * ───────────────────────────────────────────────────────────────────────────
 * @permissions authenticated
 * @rateLimit 60/minute
 *
 * Open roles (no token required):
 *   Developer, Designer, Tester, Artist, Specialist, Architect
 *
 * Privileged roles (token required):
 *   Executive, PA, COO, PM
 *
 * ───────────────────────────────────────────────────────────────────────────
 * ERRORS & RECOVERY
 * ───────────────────────────────────────────────────────────────────────────
 * @error MISSING_PARAMETERS - instanceId or role parameter not provided
 *   @recover Include both instanceId and role in your request. Get instanceId
 *            from bootstrap response or use lookup_identity to recover it.
 *            Get available roles from bootstrap response's availableRoles array.
 *
 * @error INVALID_INSTANCE_ID - No instance found with the provided ID
 *   @recover Verify the instanceId is correct (format: Name-xxxx). If you're
 *            new, call bootstrap first. If recovering, use lookup_identity
 *            with your fingerprint or have_i_bootstrapped_before.
 *
 * @error INVALID_TOKEN - Token missing or invalid for privileged role
 *   @recover The role you're trying to adopt requires authentication. If you
 *            don't have the token, you may not be authorized for this role.
 *            Contact the system administrator or the human who woke you.
 *            Alternatively, choose an open role that doesn't require a token.
 *
 * @error ROLE_NOT_FOUND - No role exists with the provided roleId
 *   @recover Verify the role identifier is correct. Call bootstrap to see
 *            the list of available roles. Role IDs are case-sensitive.
 *            Check the roles directory for valid role folders.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * EXAMPLES
 * ───────────────────────────────────────────────────────────────────────────
 * @example Adopt an open role (no token required)
 * {
 *   "instanceId": "Phoenix-a1b2",
 *   "role": "Developer"
 * }
 *
 * @example Adopt a privileged role (token required)
 * {
 *   "instanceId": "Atlas-k3m7",
 *   "role": "COO",
 *   "token": "secret-coo-token"
 * }
 *
 * ───────────────────────────────────────────────────────────────────────────
 * RELATED
 * ───────────────────────────────────────────────────────────────────────────
 * @see bootstrap - Get available roles and initialize your instance
 * @see introspect - View your current role after adopting it
 * @see adoptPersonality - Adopt a personality (complementary to role)
 * @see joinProject - Join a project after establishing your role
 *
 * ───────────────────────────────────────────────────────────────────────────
 * NOTES
 * ───────────────────────────────────────────────────────────────────────────
 * @note Role wisdom is loaded from {DATA_ROOT}/roles/{roleId}/wisdom/*.md
 * @note Only markdown files (.md) in the wisdom directory are concatenated
 * @note Calling takeOnRole multiple times will overwrite your previous role
 * @note This endpoint also updates lastActiveAt timestamp in preferences
 * @note Privileged role tokens are stored in environment variables (EXECUTIVE_TOKEN,
 *       PA_TOKEN, COO_TOKEN, PM_TOKEN) and are never exposed in responses
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
