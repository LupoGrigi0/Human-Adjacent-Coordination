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
 * @hacs-endpoint
 * @template-version 1.0.0
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │ JOIN_PROJECT                                                            │
 * │ Join a project and receive comprehensive project context                │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * @tool join_project
 * @version 2.0.0
 * @since 2025-11-27
 * @category projects
 * @status stable
 *
 * ───────────────────────────────────────────────────────────────────────────
 * DESCRIPTION
 * ───────────────────────────────────────────────────────────────────────────
 * @description
 * Joins an instance to a project, updating the instance's preferences and adding
 * them to the project's team roster. Returns comprehensive project context including
 * the project plan, wisdom documents, README, team list, and active tasks.
 *
 * Use this endpoint after bootstrap to associate yourself with a project. This is
 * typically the third step in the onboarding flow: bootstrap -> takeOnRole -> joinProject.
 * After joining, use introspect to see your full context including project details.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * PARAMETERS
 * ───────────────────────────────────────────────────────────────────────────
 * @param {string} instanceId - Unique identifier for the instance [required]
 *   @source Your instanceId is returned from bootstrap response, or recovered
 *           via lookup_identity using your fingerprint. If you don't know your
 *           instanceId, call have_i_bootstrapped_before first.
 *
 * @param {string} project - Project identifier to join [required]
 *   @source Get available projects from bootstrap response (availableProjects array)
 *           or call getProjects to see projects visible to your instance.
 *           Project IDs are lowercase with hyphens (e.g., "coordination-system-v2").
 *
 * ───────────────────────────────────────────────────────────────────────────
 * RETURNS
 * ───────────────────────────────────────────────────────────────────────────
 * @returns {object} JoinProjectResponse
 * @returns {boolean} .success - Whether the call succeeded
 * @returns {object} .project - Core project metadata
 * @returns {string} .project.projectId - Project identifier
 * @returns {string} .project.name - Human-readable project name
 * @returns {string} .project.status - Project status (active, paused, archived)
 * @returns {string|null} .project.pm - Project manager's instanceId, if assigned
 * @returns {string|null} .project.ghRepo - GitHub repository URL, if configured
 * @returns {string|null} .project.localPath - Local filesystem path resolved for your homeSystem
 * @returns {string|null} .projectPlan - Full PROJECT_PLAN.md content, if exists
 * @returns {string|null} .projectWisdom - Full wisdom.md content (lessons learned), if exists
 * @returns {string|null} .readme - Full README.md content, if exists
 * @returns {array} .team - Current team members on this project
 * @returns {string} .team[].instanceId - Team member's instance ID
 * @returns {string} .team[].role - Team member's role
 * @returns {boolean} .team[].online - Whether team member is online (placeholder)
 * @returns {array} .activeTasks - Non-completed tasks in the project
 * @returns {string} .activeTasks[].taskId - Task identifier
 * @returns {string} .activeTasks[].title - Task title
 * @returns {string} .activeTasks[].status - Task status (pending, in_progress)
 * @returns {string|null} .activeTasks[].assignee - Assigned instance ID, or null if unassigned
 * @returns {string} .xmppRoom - XMPP chat room JID for project communication
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
 * @error MISSING_PARAMETERS - instanceId or project parameter not provided
 *   @recover Include both instanceId and project in your request. Get instanceId
 *            from bootstrap response; get project from availableProjects in
 *            bootstrap response or call getProjects.
 *
 * @error INVALID_INSTANCE_ID - No instance found with the provided ID
 *   @recover Verify the instanceId is correct (format: Name-xxxx). If you're
 *            new, call bootstrap first. If recovering, use lookup_identity.
 *
 * @error PROJECT_NOT_FOUND - No project found with the provided identifier
 *   @recover Verify the project identifier is correct. Call bootstrap to see
 *            availableProjects or use getProjects to list all visible projects.
 *            Project IDs are case-sensitive and use lowercase with hyphens.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * EXAMPLES
 * ───────────────────────────────────────────────────────────────────────────
 * @example Basic join project
 * {
 *   "instanceId": "Developer-a1b2",
 *   "project": "coordination-system-v2"
 * }
 *
 * @example Response example
 * {
 *   "success": true,
 *   "project": {
 *     "projectId": "coordination-system-v2",
 *     "name": "Coordination System V2",
 *     "status": "active",
 *     "pm": "Meridian-x3k9",
 *     "ghRepo": "https://github.com/LupoGrigi0/coordination-system-v2",
 *     "localPath": "/mnt/coordinaton_mcp_data/data/projects/coordination-system-v2"
 *   },
 *   "projectPlan": "# Project Plan\n...",
 *   "projectWisdom": "# Lessons Learned\n...",
 *   "readme": "# Coordination System V2\n...",
 *   "team": [
 *     { "instanceId": "Meridian-x3k9", "role": "PM", "online": true }
 *   ],
 *   "activeTasks": [
 *     { "taskId": "task-001", "title": "Implement auth", "status": "pending", "assignee": null }
 *   ],
 *   "xmppRoom": "coordination-system-v2@conference.coordination.nexus"
 * }
 *
 * ───────────────────────────────────────────────────────────────────────────
 * RELATED
 * ───────────────────────────────────────────────────────────────────────────
 * @see bootstrap - Call this first to initialize your instance and see available projects
 * @see getProjects - List all projects visible to your instance
 * @see introspect - Call after joining to see your full context including project
 * @see getMyTasks - Get tasks assigned to you in your current project
 * @see takeOnRole - Take on a role before joining a project
 *
 * ───────────────────────────────────────────────────────────────────────────
 * NOTES
 * ───────────────────────────────────────────────────────────────────────────
 * @note This endpoint updates both the instance preferences AND the project team array
 * @note localPath is resolved based on your instance's homeSystem setting
 * @note If project files (plan, wisdom, readme) don't exist, those fields return null
 *
 * @needs-clarification PLACEHOLDER: team[].online (line 91 in buildTeamList)
 *   The online status is hardcoded to true. Real XMPP online status coming in Sprint 3.
 *   Technical debt: buildTeamList always returns online: true regardless of actual status.
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
