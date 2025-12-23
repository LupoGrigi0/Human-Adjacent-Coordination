/**
 * Introspect handler for V2 coordination system
 * Returns complete context for an instance
 *
 * @module introspect
 * @author Foundation
 * @created 2025-11-27
 */

import path from 'path';
import { getInstanceDir, getProjectDir } from './config.js';
import { readJSON, readPreferences } from './data.js';

/**
 * Get complete context for current instance
 * Returns instance data, project context, XMPP info, and task counts
 *
 * @param {Object} params - Introspect parameters
 * @param {string} params.instanceId - Instance identifier
 * @returns {Promise<Object>} Introspect response with complete instance context
 */
export async function introspect(params) {
  const metadata = {
    timestamp: new Date().toISOString(),
    function: 'introspect'
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

  // Load instance preferences
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

  // Build instance data
  const instance = {
    instanceId: prefs.instanceId,
    name: prefs.name,
    role: prefs.role,
    project: prefs.project,
    personality: prefs.personality,
    homeSystem: prefs.homeSystem,
    createdAt: prefs.createdAt,
    lastActiveAt: prefs.lastActiveAt,
    predecessorId: prefs.predecessorId,
    lineage: prefs.lineage
  };

  // Initialize project context (null if no project)
  let projectContext = null;

  // Load project context if instance has a project
  if (prefs.project) {
    const projectDir = getProjectDir(prefs.project);
    const projectJsonPath = path.join(projectDir, 'project.json');
    const projectData = await readJSON(projectJsonPath);

    if (projectData) {
      // Load project tasks to count active tasks
      const tasksJsonPath = path.join(projectDir, 'tasks.json');
      const tasksData = await readJSON(tasksJsonPath);

      let activeTaskCount = 0;
      let myTaskCount = 0;

      if (tasksData && tasksData.tasks) {
        // Count active tasks (status != "completed")
        activeTaskCount = tasksData.tasks.filter(task => task.status !== 'completed').length;

        // Count tasks assigned to this instance
        myTaskCount = tasksData.tasks.filter(
          task => task.assignedTo === params.instanceId && task.status !== 'completed'
        ).length;
      }

      // Resolve localPath for instance's homeSystem
      const localPath = projectData.localPaths?.[prefs.homeSystem] || null;

      projectContext = {
        projectId: projectData.projectId,
        name: projectData.name,
        pm: projectData.pm,
        team: projectData.team,
        activeTaskCount,
        myTaskCount,
        localPath
      };
    }
  }

  // Build XMPP info
  const xmpp = {
    jid: `${params.instanceId}@coordination.nexus`,
    projectRoom: prefs.project ? `${prefs.project}@conference.coordination.nexus` : null,
    online: true // placeholder - messaging is Sprint 3
  };

  // Count personal tasks
  let personalTaskCount = 0;
  const instanceDir = getInstanceDir(params.instanceId);
  const personalTasksPath = path.join(instanceDir, 'personal_tasks.json');
  const personalTasksData = await readJSON(personalTasksPath);

  if (personalTasksData && personalTasksData.tasks) {
    personalTaskCount = personalTasksData.tasks.filter(
      task => task.status !== 'completed'
    ).length;
  }

  // Count unread messages (placeholder for Sprint 3)
  const unreadMessages = 0;

  // Build response
  return {
    success: true,
    instance,
    projectContext,
    xmpp,
    unreadMessages,
    personalTaskCount,
    metadata
  };
}
