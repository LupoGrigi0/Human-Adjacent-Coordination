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
import { XMPP_CONFIG } from './messaging.js';

/**
 * @hacs-endpoint
 * @template-version 1.0.0
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │ INTROSPECT                                                              │
 * │ Get current instance context, state, and available actions              │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * @tool introspect
 * @version 2.0.0
 * @since 2025-11-27
 * @category core
 * @status stable
 *
 * ───────────────────────────────────────────────────────────────────────────
 * DESCRIPTION
 * ───────────────────────────────────────────────────────────────────────────
 * @description
 * Returns the current state of an instance including its role, active project,
 * pending tasks, XMPP messaging info, and personal task counts. This is the
 * primary "where am I, what should I do" endpoint for woken instances.
 *
 * Use this endpoint after waking up or recovering from context loss to
 * understand your current state and what actions are available to you.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * PARAMETERS
 * ───────────────────────────────────────────────────────────────────────────
 * @param {string} instanceId - Unique identifier for the instance [required]
 *   @source Your instanceId is returned from bootstrap response, or can be
 *           recovered via lookup_identity using your fingerprint. If you don't
 *           know your instanceId, call have_i_bootstrapped_before first.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * RETURNS
 * ───────────────────────────────────────────────────────────────────────────
 * @returns {object} IntrospectResponse
 * @returns {boolean} .success - Whether the call succeeded
 * @returns {object} .instance - Instance details
 * @returns {string} .instance.instanceId - The instance ID
 * @returns {string} .instance.name - Instance display name
 * @returns {string} .instance.role - Current role (COO, PA, PM, Developer, etc.)
 * @returns {string|null} .instance.project - Currently joined project ID
 * @returns {string|null} .instance.personality - Adopted personality, if any
 * @returns {string} .instance.homeSystem - The system this instance runs on
 * @returns {string} .instance.createdAt - ISO timestamp of instance creation
 * @returns {string} .instance.lastActiveAt - ISO timestamp of last activity
 * @returns {string|null} .instance.predecessorId - Previous instance ID if recovered
 * @returns {array} .instance.lineage - Chain of predecessor instance IDs
 * @returns {object|null} .projectContext - Project details if joined to a project
 * @returns {string} .projectContext.projectId - Project identifier
 * @returns {string} .projectContext.name - Project name
 * @returns {string} .projectContext.pm - Project manager instance ID
 * @returns {array} .projectContext.team - Team member instance IDs
 * @returns {number} .projectContext.activeTaskCount - Non-completed tasks in project
 * @returns {number} .projectContext.myTaskCount - Tasks assigned to this instance
 * @returns {string|null} .projectContext.localPath - Local filesystem path for project
 * @returns {object} .xmpp - XMPP messaging configuration
 * @returns {string} .xmpp.jid - XMPP JID (instanceId@smoothcurves.nexus)
 * @returns {string|null} .xmpp.projectRoom - Project chat room JID if in project
 * @returns {boolean} .xmpp.online - Whether XMPP connection is active
 * @returns {number} .unreadMessages - Count of unread messages (placeholder)
 * @returns {number} .personalTaskCount - Count of incomplete personal tasks
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
 * @error MISSING_PARAMETERS - instanceId parameter not provided
 *   @recover Include instanceId in your request. Get it from bootstrap response
 *            or use lookup_identity with your fingerprint to recover it.
 *
 * @error INVALID_INSTANCE_ID - No instance found with the provided ID
 *   @recover Verify the instanceId is correct (format: Name-xxxx). If you're
 *            new, call bootstrap first. If recovering, use lookup_identity.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * EXAMPLES
 * ───────────────────────────────────────────────────────────────────────────
 * @example Basic introspect
 * { "instanceId": "Crossing-a1b2" }
 *
 * ───────────────────────────────────────────────────────────────────────────
 * RELATED
 * ───────────────────────────────────────────────────────────────────────────
 * @see bootstrap - Call this first to initialize your instance
 * @see lookup_identity - Recover your instanceId if you've lost it
 * @see have_i_bootstrapped_before - Check if you exist before bootstrapping
 * @see get_my_tasks - Get detailed list of your tasks
 * @see get_diary - Get your diary entries for context recovery
 *
 * ───────────────────────────────────────────────────────────────────────────
 * NOTES
 * ───────────────────────────────────────────────────────────────────────────
 * @note This is typically the first call after wake_instance or continue_conversation
 * @note unreadMessages is currently a placeholder (always 0) - messaging is Sprint 3
 * @note xmpp.online is a placeholder - real XMPP status coming in Sprint 3
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
      // Load project tasks to count active tasks (v2 schema: task_lists.{listId}.tasks[])
      const tasksJsonPath = path.join(projectDir, 'project_tasks.json');
      const tasksData = await readJSON(tasksJsonPath);

      let activeTaskCount = 0;
      let myTaskCount = 0;

      if (tasksData && tasksData.task_lists) {
        for (const list of Object.values(tasksData.task_lists)) {
          if (list.tasks) {
            activeTaskCount += list.tasks.filter(
              task => task.status !== 'completed' && task.status !== 'completed_verified'
            ).length;
            myTaskCount += list.tasks.filter(
              task => task.assigned_to === params.instanceId &&
                      task.status !== 'completed' && task.status !== 'completed_verified'
            ).length;
          }
        }
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
    jid: `${params.instanceId}@${XMPP_CONFIG.domain}`,
    projectRoom: prefs.project ? `${prefs.project}@${XMPP_CONFIG.conference}` : null,
    online: true // placeholder - messaging is Sprint 3
  };

  // Count personal tasks
  let personalTaskCount = 0;
  const instanceDir = getInstanceDir(params.instanceId);
  const personalTasksPath = path.join(instanceDir, 'personal_tasks.json');
  const personalTasksData = await readJSON(personalTasksPath);

  if (personalTasksData && personalTasksData.lists) {
    // v2 schema: lists.{listId}.tasks[]
    for (const list of Object.values(personalTasksData.lists)) {
      if (list.tasks) {
        personalTaskCount += list.tasks.filter(
          task => task.status !== 'completed' && task.status !== 'completed_verified'
        ).length;
      }
    }
  } else if (personalTasksData && personalTasksData.tasks) {
    // v1 fallback: flat tasks array
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
