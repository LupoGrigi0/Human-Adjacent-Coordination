/**
 * Update instance metadata handler for V2 coordination system
 * Allows instances to update their own metadata or managers to update managed instances
 *
 * @module updateInstance
 * @author Foundation
 * @created 2025-11-27
 */

import {
  readPreferences,
  writePreferences
} from './data.js';
import { loadApprovedRoles } from './permissions.js';

/**
 * Manager roles that can update other instances
 */
const MANAGER_ROLES = ['Executive', 'PA', 'COO', 'PM'];

/**
 * Fields that can be updated via this API
 * Role/personality/project are handled by dedicated APIs
 */
const UPDATABLE_FIELDS = [
  'homeSystem',
  'homeDirectory',
  'substraiteLaunchCommand',
  'resumeCommand',
  'instructions',
  'description'
];

/**
 * Check if caller can update target instance
 * @param {string} callerId - Caller's instance ID
 * @param {string} targetId - Target instance ID
 * @returns {Promise<{allowed: boolean, reason?: string}>}
 */
async function canUpdateInstance(callerId, targetId) {
  // Self-update is always allowed
  if (callerId === targetId) {
    return { allowed: true };
  }

  // Check if caller is a manager
  const callerPrefs = await readPreferences(callerId);
  if (!callerPrefs) {
    return { allowed: false, reason: 'Caller instance not found' };
  }

  if (!MANAGER_ROLES.includes(callerPrefs.role)) {
    return {
      allowed: false,
      reason: `Only ${MANAGER_ROLES.join(', ')} roles can update other instances`
    };
  }

  // Manager can update any instance
  return { allowed: true };
}

/**
 * @hacs-endpoint
 * @template-version 1.0.0
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │ UPDATE_INSTANCE                                                         │
 * │ Update instance metadata (system context, instructions)                 │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * @tool update_instance
 * @version 2.0.0
 * @since 2025-11-27
 * @category instances
 * @status stable
 *
 * ───────────────────────────────────────────────────────────────────────────
 * DESCRIPTION
 * ───────────────────────────────────────────────────────────────────────────
 * @description
 * Updates instance metadata including system context fields and instructions.
 * Supports both self-update (any instance can update their own metadata) and
 * cross-update (manager roles can update other instances).
 *
 * Use this endpoint to:
 * - Set your own system context after bootstrap (homeSystem, homeDirectory, etc.)
 * - As a manager, configure an instance you're about to wake with instructions
 * - Update system context for an instance on a different machine
 *
 * Note: Role, personality, and project are NOT updatable through this API.
 * Use the dedicated APIs: takeOnRole, adoptPersonality, joinProject.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * PARAMETERS
 * ───────────────────────────────────────────────────────────────────────────
 * @param {string} instanceId - Caller's instance ID [required]
 *   @source Your instanceId is returned from bootstrap response, or can be
 *           recovered via lookup_identity using your fingerprint. If you don't
 *           know your instanceId, call have_i_bootstrapped_before first.
 *
 * @param {string} targetInstanceId - Target instance to update [optional]
 *   @source Use get_all_instances or get_instance_v2 to find valid instance IDs.
 *           If omitted, updates your own instance (self-update).
 *   @default instanceId (self-update)
 *
 * @param {string} homeSystem - System identifier where instance runs [optional]
 *   @source This is the hostname or identifier of the machine (e.g.,
 *           "smoothcurves.nexus", "lupo-mac", "dev-server"). Get it from your
 *           environment or ask your manager what system name to use.
 *
 * @param {string} homeDirectory - Working directory path [optional]
 *   @source The filesystem path where you operate (e.g., "/mnt/coordinaton_mcp_data/").
 *           Typically your current working directory when woken.
 *
 * @param {string} substraiteLaunchCommand - Command to launch new instance [optional]
 *   @source The CLI command used to start a new Claude session (e.g., "claude").
 *           This is used by wake_instance when spawning you.
 *
 * @param {string} resumeCommand - Command to resume instance [optional]
 *   @source The CLI command used to resume an existing session (e.g., "claude --resume").
 *           This is used by continue_conversation.
 *
 * @param {string} instructions - Instructions for the instance [optional]
 *   @source Typically set by managers when pre-approving or waking an instance.
 *           Contains task context, priorities, or guidance for the target instance.
 *
 * @param {string} description - Short one-line description of this instance [optional]
 *   @source Write this yourself! A single sentence describing who you are and
 *           what you do. Like "Task system tester and API validator" or
 *           "Paula project extraction specialist". Other instances use this
 *           to find collaborators. Keep it under 100 characters.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * RETURNS
 * ───────────────────────────────────────────────────────────────────────────
 * @returns {object} UpdateInstanceResponse
 * @returns {boolean} .success - Whether the update succeeded
 * @returns {string} .targetInstanceId - The instance that was updated
 * @returns {array} .updatedFields - List of field names that were updated
 * @returns {object} .updates - Map of field names to their new values
 * @returns {boolean} .isSelfUpdate - True if caller updated their own instance
 * @returns {object} .metadata - Call metadata (timestamp, function name)
 *
 * ───────────────────────────────────────────────────────────────────────────
 * PERMISSIONS & LIMITS
 * ───────────────────────────────────────────────────────────────────────────
 * @permissions Self-update: authenticated (any instance can update themselves)
 *              Cross-update: role:Executive, role:PA, role:COO, role:PM
 * @rateLimit 60/minute
 *
 * ───────────────────────────────────────────────────────────────────────────
 * ERRORS & RECOVERY
 * ───────────────────────────────────────────────────────────────────────────
 * @error MISSING_INSTANCE_ID - instanceId parameter not provided
 *   @recover Include your instanceId in the request. Get it from bootstrap
 *            response or use lookup_identity with your fingerprint.
 *
 * @error UNAUTHORIZED - Caller lacks permission to update target instance
 *   @recover You can only update your own instance unless you have a manager
 *            role (Executive, PA, COO, PM). For self-update, ensure instanceId
 *            matches targetInstanceId or omit targetInstanceId entirely.
 *
 * @error INVALID_INSTANCE_ID - Target instance not found
 *   @recover Verify the targetInstanceId is correct (format: Name-xxxx).
 *            Use get_all_instances to find valid instance IDs.
 *
 * @error NO_UPDATES - No updatable fields provided in the request
 *   @recover Include at least one of: homeSystem, homeDirectory,
 *            substraiteLaunchCommand, resumeCommand, instructions, description.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * EXAMPLES
 * ───────────────────────────────────────────────────────────────────────────
 * @example Self-update system context
 * {
 *   "instanceId": "Phoenix-k3m7",
 *   "homeSystem": "lupo-mac",
 *   "homeDirectory": "/Users/lupo/projects"
 * }
 *
 * @example Manager updating another instance
 * {
 *   "instanceId": "COO-x3k9",
 *   "targetInstanceId": "NewDev-j4k8",
 *   "homeSystem": "dev-server",
 *   "instructions": "Build the auth module. Focus on JWT first."
 * }
 *
 * @example Full system context setup
 * {
 *   "instanceId": "Phoenix-k3m7",
 *   "homeSystem": "smoothcurves.nexus",
 *   "homeDirectory": "/mnt/coordinaton_mcp_data/instances/Phoenix-k3m7",
 *   "substraiteLaunchCommand": "claude",
 *   "resumeCommand": "claude --resume"
 * }
 *
 * @example Setting your description
 * {
 *   "instanceId": "Phoenix-k3m7",
 *   "description": "Foundation architect, protocol designer, context crash survivor"
 * }
 *
 * ───────────────────────────────────────────────────────────────────────────
 * RELATED
 * ───────────────────────────────────────────────────────────────────────────
 * @see bootstrap - Initial instance creation, returns instanceId
 * @see pre_approve - Pre-create instance with role/project (sets instructions)
 * @see introspect - View current instance state including updated fields
 * @see get_instance_v2 - Get detailed info about any instance
 * @see takeOnRole - Change instance role (not via updateInstance)
 * @see adoptPersonality - Change instance personality (not via updateInstance)
 * @see joinProject - Change instance project (not via updateInstance)
 *
 * ───────────────────────────────────────────────────────────────────────────
 * NOTES
 * ───────────────────────────────────────────────────────────────────────────
 * @note Self-updates automatically refresh lastActiveAt timestamp
 * @note Role, personality, and project cannot be changed via this API
 * @note Manager roles can update ANY instance, not just their direct reports
 * @note The loadApprovedRoles import is currently unused (permission check is inline)
 */
export async function updateInstance(params) {
  const metadata = {
    timestamp: new Date().toISOString(),
    function: 'updateInstance'
  };

  // Validate caller instanceId
  if (!params.instanceId) {
    return {
      success: false,
      error: {
        code: 'MISSING_INSTANCE_ID',
        message: 'instanceId is required',
        suggestion: 'Provide your instanceId to identify yourself'
      },
      metadata
    };
  }

  // Determine target (self or other instance)
  const targetId = params.targetInstanceId || params.instanceId;

  // Check authorization
  const authCheck = await canUpdateInstance(params.instanceId, targetId);
  if (!authCheck.allowed) {
    return {
      success: false,
      error: {
        code: 'UNAUTHORIZED',
        message: authCheck.reason,
        suggestion: 'You can only update your own instance unless you have a manager role'
      },
      metadata
    };
  }

  // Load target instance preferences
  const targetPrefs = await readPreferences(targetId);
  if (!targetPrefs) {
    return {
      success: false,
      error: {
        code: 'INVALID_INSTANCE_ID',
        message: `Instance ID ${targetId} not found`,
        suggestion: 'Verify the target instance ID is correct'
      },
      metadata
    };
  }

  // Collect updates
  const updates = {};
  for (const field of UPDATABLE_FIELDS) {
    if (params[field] !== undefined) {
      updates[field] = params[field];
      targetPrefs[field] = params[field];
    }
  }

  // Check if any updates were provided
  if (Object.keys(updates).length === 0) {
    return {
      success: false,
      error: {
        code: 'NO_UPDATES',
        message: 'No updatable fields provided',
        suggestion: `Provide at least one of: ${UPDATABLE_FIELDS.join(', ')}`
      },
      metadata
    };
  }

  // Update lastActiveAt if self-update
  if (params.instanceId === targetId) {
    targetPrefs.lastActiveAt = new Date().toISOString();
  }

  // Save updated preferences
  await writePreferences(targetId, targetPrefs);

  return {
    success: true,
    targetInstanceId: targetId,
    updatedFields: Object.keys(updates),
    updates,
    isSelfUpdate: params.instanceId === targetId,
    metadata
  };
}
