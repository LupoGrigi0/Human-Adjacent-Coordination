/**
 * Project handler for V2 coordination system
 * Allows instances to join projects and receive project context
 *
 * @module joinProject
 * @author Foundation
 * @created 2025-11-27
 */

import fs from 'fs/promises';
import path from 'path';
import { getProjectDir, getInstancesDir } from './config.js';
import { readJSON, writeJSON, readPreferences, writePreferences, listDir } from './data.js';

/**
 * Load project plan for a given project
 * @param {string} projectId - Project identifier
 * @returns {Promise<string|null>} Project plan content or null if doesn't exist
 */
async function loadProjectPlan(projectId) {
  const projectDir = getProjectDir(projectId);
  const planPath = path.join(projectDir, 'PROJECT_PLAN.md');

  try {
    return await fs.readFile(planPath, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

/**
 * Load project wisdom for a given project
 * @param {string} projectId - Project identifier
 * @returns {Promise<string|null>} Project wisdom content or null if doesn't exist
 */
async function loadProjectWisdom(projectId) {
  const projectDir = getProjectDir(projectId);
  const wisdomPath = path.join(projectDir, 'wisdom.md');

  try {
    return await fs.readFile(wisdomPath, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

/**
 * Load project README for a given project
 * @param {string} projectId - Project identifier
 * @returns {Promise<string|null>} Project README content or null if doesn't exist
 */
async function loadProjectReadme(projectId) {
  const projectDir = getProjectDir(projectId);
  const readmePath = path.join(projectDir, 'README.md');

  try {
    return await fs.readFile(readmePath, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

/**
 * Build team list by scanning instances that have this project
 * @param {string} projectId - Project identifier
 * @returns {Promise<Array>} Team members list with online status
 */
async function buildTeamList(projectId) {
  const instancesDir = getInstancesDir();
  const team = [];

  try {
    const instances = await listDir(instancesDir);

    for (const instanceId of instances) {
      const prefs = await readPreferences(instanceId);

      if (prefs && prefs.project === projectId) {
        team.push({
          instanceId: prefs.instanceId,
          role: prefs.role,
          online: true // Placeholder - actual online status in Sprint 3
        });
      }
    }
  } catch (error) {
    if (error.code !== 'ENOENT') {
      throw error;
    }
  }

  return team;
}

/**
 * Join a project and receive project context
 * Updates instance preferences with project and returns comprehensive project data
 *
 * @param {Object} params - JoinProject parameters
 * @param {string} params.instanceId - Instance identifier
 * @param {string} params.project - Project identifier to join
 * @returns {Promise<Object>} JoinProject response with project context
 */
export async function joinProject(params) {
  const metadata = {
    timestamp: new Date().toISOString(),
    function: 'joinProject'
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

  if (!params.project) {
    return {
      success: false,
      error: {
        code: 'MISSING_PARAMETERS',
        message: 'project is required',
        suggestion: 'Provide project parameter'
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

  // Validate project exists
  const projectDir = getProjectDir(params.project);
  const projectJsonPath = path.join(projectDir, 'project.json');
  const projectData = await readJSON(projectJsonPath);

  if (!projectData) {
    return {
      success: false,
      error: {
        code: 'PROJECT_NOT_FOUND',
        message: `Project "${params.project}" not found`,
        suggestion: 'Verify the project identifier is correct or call bootstrap to see available projects'
      },
      metadata
    };
  }

  // Load project files
  const projectPlan = await loadProjectPlan(params.project);
  const projectWisdom = await loadProjectWisdom(params.project);
  const readme = await loadProjectReadme(params.project);

  // Load project tasks and filter to active
  const tasksJsonPath = path.join(projectDir, 'tasks.json');
  const tasksData = await readJSON(tasksJsonPath);

  let activeTasks = [];
  if (tasksData && tasksData.tasks) {
    activeTasks = tasksData.tasks.filter(task => task.status !== 'completed').map(task => ({
      taskId: task.taskId,
      title: task.title,
      status: task.status,
      assignee: task.assignedTo || null
    }));
  }

  // Build team list
  const team = await buildTeamList(params.project);

  // Resolve localPath for instance's homeSystem
  const localPath = projectData.localPaths?.[prefs.homeSystem] || null;

  // Build project object
  const project = {
    projectId: projectData.projectId,
    name: projectData.name,
    status: projectData.status,
    pm: projectData.pm,
    ghRepo: projectData.ghRepo || null,
    localPath
  };

  // Update instance preferences with project
  prefs.project = params.project;
  prefs.lastActiveAt = new Date().toISOString();
  await writePreferences(params.instanceId, prefs);

  // Add instance to project's team array if not already present
  if (!projectData.team) {
    projectData.team = [];
  }

  if (!projectData.team.includes(params.instanceId)) {
    projectData.team.push(params.instanceId);
    await writeJSON(projectJsonPath, projectData);
  }

  // Build XMPP room name
  const xmppRoom = `${params.project}@conference.coordination.nexus`;

  // Build response
  return {
    success: true,
    project,
    projectPlan,
    projectWisdom,
    readme,
    team,
    activeTasks,
    xmppRoom,
    metadata
  };
}
