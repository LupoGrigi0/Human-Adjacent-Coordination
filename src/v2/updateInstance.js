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
  'instructions'
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
 * Update instance metadata
 *
 * Use cases:
 * 1. Instance setting their own system context (homeSystem, homeDirectory, etc.)
 * 2. Manager setting up an instance they're waking (instructions, system context)
 * 3. Manager updating system context for an instance on a different machine
 *
 * @param {Object} params - Update parameters
 * @param {string} params.instanceId - Caller's instance ID (required)
 * @param {string} [params.targetInstanceId] - Target instance to update (defaults to self)
 * @param {string} [params.homeSystem] - Home system identifier
 * @param {string} [params.homeDirectory] - Home directory path
 * @param {string} [params.substraiteLaunchCommand] - Launch command
 * @param {string} [params.resumeCommand] - Resume command
 * @param {string} [params.instructions] - Instructions for instance (typically set by managers)
 * @returns {Promise<Object>} Update result
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
