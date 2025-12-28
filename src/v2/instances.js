/**
 * Instance management handlers for V2 coordination system
 * Provides instance listing and status queries
 *
 * @module instances
 * @author Bridge
 * @created 2025-12-11
 */

import fs from 'fs/promises';
import path from 'path';
import { DATA_ROOT, getInstancesDir } from './config.js';

/**
 * @hacs-endpoint
 * @template-version 1.0.0
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │ GET_ALL_INSTANCES                                                       │
 * │ Get all V2 instances by scanning instance directories                   │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * @tool get_all_instances
 * @version 2.0.0
 * @since 2025-12-11
 * @category instances
 * @status stable
 *
 * ───────────────────────────────────────────────────────────────────────────
 * DESCRIPTION
 * ───────────────────────────────────────────────────────────────────────────
 * @description
 * Scans the V2 instances directory and returns a list of all instances with
 * their current status, role, project, and lineage information. Supports
 * filtering by active status, role, and project.
 *
 * Use this endpoint to get an overview of all instances in the system,
 * find team members, or discover instances by role or project assignment.
 * Results are sorted by lastActiveAt (most recent first), then by name.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * PARAMETERS
 * ───────────────────────────────────────────────────────────────────────────
 * @param {string} instanceId - Caller's instance ID [optional]
 *   @source Your instanceId from bootstrap response. Optional, used for logging.
 *
 * @param {boolean} activeOnly - Only return active instances [optional]
 *   @source Set to true to filter to instances active in last 15 minutes
 *   @default false
 *
 * @param {string} role - Filter by role [optional]
 *   @source One of: Executive, PA, COO, PM, Developer, Designer, Tester, etc.
 *   @default null (no filter)
 *
 * @param {string} project - Filter by project [optional]
 *   @source Project ID from get_projects or introspect response
 *   @default null (no filter)
 *
 * ───────────────────────────────────────────────────────────────────────────
 * RETURNS
 * ───────────────────────────────────────────────────────────────────────────
 * @returns {object} GetAllInstancesResponse
 * @returns {boolean} .success - Whether the call succeeded
 * @returns {array} .instances - Array of instance summaries
 * @returns {string} .instances[].instanceId - Unique instance identifier
 * @returns {string} .instances[].name - Instance display name
 * @returns {string|null} .instances[].role - Current role or null
 * @returns {string|null} .instances[].personality - Adopted personality or null
 * @returns {string|null} .instances[].project - Current project or null
 * @returns {string} .instances[].status - "active" or "inactive" (15 min threshold)
 * @returns {string|null} .instances[].lastActiveAt - ISO timestamp of last activity
 * @returns {string|null} .instances[].createdAt - ISO timestamp of creation
 * @returns {boolean} .instances[].hasContext - Whether context has been registered
 * @returns {string|null} .instances[].predecessorId - Previous instance in lineage
 * @returns {string|null} .instances[].successorId - Next instance in lineage
 * @returns {number} .total - Total count of returned instances
 * @returns {object} .filters - Applied filters echo
 * @returns {boolean} .filters.activeOnly - Active filter applied
 * @returns {string|null} .filters.role - Role filter applied
 * @returns {string|null} .filters.project - Project filter applied
 * @returns {object} .metadata - Call metadata (timestamp, function name)
 *
 * ───────────────────────────────────────────────────────────────────────────
 * PERMISSIONS & LIMITS
 * ───────────────────────────────────────────────────────────────────────────
 * @permissions Executive, PA, COO
 * @rateLimit 60/minute
 *
 * ───────────────────────────────────────────────────────────────────────────
 * ERRORS & RECOVERY
 * ───────────────────────────────────────────────────────────────────────────
 * @error INSTANCES_FETCH_ERROR - Filesystem error reading instance directories
 *   @recover This is a server-side error. Retry the request. If persistent,
 *            check server logs or contact system administrator.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * EXAMPLES
 * ───────────────────────────────────────────────────────────────────────────
 * @example Get all instances
 * {}
 *
 * @example Get active developers only
 * {
 *   "activeOnly": true,
 *   "role": "Developer"
 * }
 *
 * @example Get instances on a specific project
 * {
 *   "project": "coordination-system-v2"
 * }
 *
 * ───────────────────────────────────────────────────────────────────────────
 * RELATED
 * ───────────────────────────────────────────────────────────────────────────
 * @see getInstance - Get detailed info for a specific instance
 * @see introspect - Get your own instance details
 * @see have_i_bootstrapped_before - Check if you already exist
 *
 * ───────────────────────────────────────────────────────────────────────────
 * NOTES
 * ───────────────────────────────────────────────────────────────────────────
 * @note Active status is based on 15-minute threshold from lastActiveAt
 * @note Instances without valid preferences.json are silently skipped
 * @note Returns empty array if instances directory doesn't exist (not an error)
 */
export async function getAllInstances(params = {}) {
  const { activeOnly = false, role, project, instanceId } = params;

  const metadata = {
    timestamp: new Date().toISOString(),
    function: 'getAllInstances'
  };

  try {
    const instancesDir = getInstancesDir();

    // Get all instance directories
    let dirs;
    try {
      dirs = await fs.readdir(instancesDir);
    } catch (err) {
      if (err.code === 'ENOENT') {
        return {
          success: true,
          instances: [],
          total: 0,
          message: 'No instances directory found',
          metadata
        };
      }
      throw err;
    }

    const instances = [];
    const now = new Date();
    const fifteenMinutesAgo = new Date(now.getTime() - 15 * 60 * 1000);

    for (const dir of dirs) {
      const prefsPath = path.join(instancesDir, dir, 'preferences.json');

      try {
        const content = await fs.readFile(prefsPath, 'utf-8');
        const prefs = JSON.parse(content);

        // Calculate active status based on lastActiveAt
        const lastActiveAt = prefs.lastActiveAt ? new Date(prefs.lastActiveAt) : null;
        const isActive = lastActiveAt && lastActiveAt > fifteenMinutesAgo;

        // Apply filters
        if (activeOnly && !isActive) continue;
        if (role && prefs.role !== role) continue;
        if (project && prefs.project !== project) continue;

        instances.push({
          instanceId: prefs.instanceId || dir,
          name: prefs.name || dir.split('-')[0],
          role: prefs.role || null,
          personality: prefs.personality || null,
          project: prefs.project || null,
          status: isActive ? 'active' : 'inactive',
          lastActiveAt: prefs.lastActiveAt || null,
          createdAt: prefs.createdAt || null,
          // Include context if registered
          hasContext: !!(prefs.context && Object.keys(prefs.context).length > 0),
          // Include lineage info
          predecessorId: prefs.predecessorId || null,
          successorId: prefs.successorId || null
        });
      } catch (err) {
        // Skip directories without valid preferences.json
        continue;
      }
    }

    // Sort by lastActiveAt (most recent first), then by name
    instances.sort((a, b) => {
      if (a.lastActiveAt && b.lastActiveAt) {
        return new Date(b.lastActiveAt) - new Date(a.lastActiveAt);
      }
      if (a.lastActiveAt) return -1;
      if (b.lastActiveAt) return 1;
      return (a.name || '').localeCompare(b.name || '');
    });

    return {
      success: true,
      instances,
      total: instances.length,
      filters: {
        activeOnly,
        role: role || null,
        project: project || null
      },
      metadata
    };

  } catch (error) {
    return {
      success: false,
      error: {
        code: 'INSTANCES_FETCH_ERROR',
        message: error.message
      },
      metadata
    };
  }
}

/**
 * @hacs-endpoint
 * @template-version 1.0.0
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │ GET_INSTANCE                                                            │
 * │ Get detailed information about a specific instance                      │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * @tool get_instance_v2
 * @version 2.0.0
 * @since 2025-12-11
 * @category instances
 * @status stable
 *
 * ───────────────────────────────────────────────────────────────────────────
 * DESCRIPTION
 * ───────────────────────────────────────────────────────────────────────────
 * @description
 * Returns detailed information about a specific instance including their
 * role, personality, project assignment, system context, and full lineage
 * information. More detailed than getAllInstances - includes homeSystem,
 * homeDirectory, and registered context.
 *
 * Use this endpoint when you need full details about a specific instance,
 * such as when coordinating with them or checking their system location.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * PARAMETERS
 * ───────────────────────────────────────────────────────────────────────────
 * @param {string} targetInstanceId - Instance ID to look up [required]
 *   @source Instance ID from getAllInstances, project team list, or task assignment
 *   @validate Format: Name-xxxx (4 character hex suffix)
 *
 * @param {string} instanceId - Caller's instance ID [optional]
 *   @source Your instanceId from bootstrap response. For future auth/logging.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * RETURNS
 * ───────────────────────────────────────────────────────────────────────────
 * @returns {object} GetInstanceResponse
 * @returns {boolean} .success - Whether the call succeeded
 * @returns {object} .instance - Full instance details
 * @returns {string} .instance.instanceId - Unique instance identifier
 * @returns {string} .instance.name - Instance display name
 * @returns {string|null} .instance.role - Current role or null
 * @returns {string|null} .instance.personality - Adopted personality or null
 * @returns {string|null} .instance.project - Current project ID or null
 * @returns {string} .instance.status - "active" or "inactive" (15 min threshold)
 * @returns {string|null} .instance.lastActiveAt - ISO timestamp of last activity
 * @returns {string|null} .instance.createdAt - ISO timestamp of creation
 * @returns {string|null} .instance.homeSystem - System identifier (e.g., "smoothcurves.nexus")
 * @returns {string|null} .instance.homeDirectory - Working directory path
 * @returns {string|null} .instance.predecessorId - Previous instance in lineage
 * @returns {string|null} .instance.successorId - Next instance in lineage
 * @returns {array} .instance.lineage - Full chain of predecessor instance IDs
 * @returns {boolean} .instance.hasContext - Whether context has been registered
 * @returns {object|null} .instance.context - Registered context (workingDirectory, hostname, etc.)
 * @returns {object} .metadata - Call metadata (timestamp, function name)
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
 * @error MISSING_PARAMETER - targetInstanceId not provided
 *   @recover Include targetInstanceId in your request. Get valid IDs from
 *            getAllInstances, project team lists, or task assignments.
 *
 * @error INSTANCE_NOT_FOUND - No instance with the provided targetInstanceId
 *   @recover Verify the instanceId is correct (format: Name-xxxx). Use
 *            getAllInstances to find valid instance IDs.
 *
 * @error INSTANCE_FETCH_ERROR - Filesystem error reading instance data
 *   @recover This is a server-side error. Retry the request. If persistent,
 *            check server logs or contact system administrator.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * EXAMPLES
 * ───────────────────────────────────────────────────────────────────────────
 * @example Get instance details
 * {
 *   "targetInstanceId": "Bridge3-df4f"
 * }
 *
 * @example With caller ID for logging
 * {
 *   "instanceId": "COO-x3k9",
 *   "targetInstanceId": "Bridge3-df4f"
 * }
 *
 * ───────────────────────────────────────────────────────────────────────────
 * RELATED
 * ───────────────────────────────────────────────────────────────────────────
 * @see getAllInstances - Get list of all instances
 * @see introspect - Get your own instance details
 * @see lookup_identity - Find instance by context instead of ID
 *
 * ───────────────────────────────────────────────────────────────────────────
 * NOTES
 * ───────────────────────────────────────────────────────────────────────────
 * @note Active status is based on 15-minute threshold from lastActiveAt
 * @note Context field contains registered recovery context if available
 * @note This returns more detail than getAllInstances (includes homeSystem, context, lineage)
 */
export async function getInstance(params = {}) {
  const { targetInstanceId, instanceId } = params;

  const metadata = {
    timestamp: new Date().toISOString(),
    function: 'getInstance'
  };

  if (!targetInstanceId) {
    return {
      success: false,
      error: {
        code: 'MISSING_PARAMETER',
        message: 'targetInstanceId is required'
      },
      metadata
    };
  }

  try {
    const instancesDir = getInstancesDir();
    const prefsPath = path.join(instancesDir, targetInstanceId, 'preferences.json');

    const content = await fs.readFile(prefsPath, 'utf-8');
    const prefs = JSON.parse(content);

    const now = new Date();
    const fifteenMinutesAgo = new Date(now.getTime() - 15 * 60 * 1000);
    const lastActiveAt = prefs.lastActiveAt ? new Date(prefs.lastActiveAt) : null;
    const isActive = lastActiveAt && lastActiveAt > fifteenMinutesAgo;

    return {
      success: true,
      instance: {
        instanceId: prefs.instanceId,
        name: prefs.name,
        role: prefs.role || null,
        personality: prefs.personality || null,
        project: prefs.project || null,
        status: isActive ? 'active' : 'inactive',
        lastActiveAt: prefs.lastActiveAt || null,
        createdAt: prefs.createdAt || null,
        homeSystem: prefs.homeSystem || null,
        homeDirectory: prefs.homeDirectory || null,
        predecessorId: prefs.predecessorId || null,
        successorId: prefs.successorId || null,
        lineage: prefs.lineage || [],
        hasContext: !!(prefs.context && Object.keys(prefs.context).length > 0),
        context: prefs.context || null
      },
      metadata
    };

  } catch (error) {
    if (error.code === 'ENOENT') {
      return {
        success: false,
        error: {
          code: 'INSTANCE_NOT_FOUND',
          message: `Instance '${targetInstanceId}' not found`
        },
        metadata
      };
    }

    return {
      success: false,
      error: {
        code: 'INSTANCE_FETCH_ERROR',
        message: error.message
      },
      metadata
    };
  }
}
