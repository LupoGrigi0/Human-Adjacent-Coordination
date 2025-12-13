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
 * Get all V2 instances by scanning instance directories
 *
 * @param {Object} params - Parameters
 * @param {boolean} [params.activeOnly=false] - Only return active instances (seen in last 15 min)
 * @param {string} [params.role] - Filter by role
 * @param {string} [params.project] - Filter by project
 * @param {string} [params.instanceId] - Caller's instance ID (optional, for logging)
 * @returns {Object} List of instances
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
 * Get a specific instance's details
 *
 * @param {Object} params - Parameters
 * @param {string} params.targetInstanceId - Instance to look up
 * @param {string} [params.instanceId] - Caller's instance ID (for auth if needed later)
 * @returns {Object} Instance details
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
