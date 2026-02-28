/**
 * Task Management V2 - Ground-up implementation
 *
 * Architecture:
 * - Personal tasks: {instanceDir}/personal_tasks.json
 * - Project tasks: {projectDir}/project_tasks.json
 * - Hierarchical: task_lists → named lists → tasks
 * - Task IDs encode type: ptask-{list}-{seq} or prjtask-{project}-{list}-{seq}
 *
 * Core principle: updateTask() is THE single source of truth for all edits.
 * All convenience functions wrap updateTask().
 * (changeTask is kept as backwards-compatible alias)
 *
 * @module task-management
 * @author Crossing
 * @created 2026-01-01
 */

import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { getInstanceDir, getProjectDir, getGlobalPreferencesPath } from './config.js';
import { readJSON, writeJSON, ensureDir, readPreferences } from './data.js';
import { isPrivilegedRole } from './permissions.js';

// ============================================================================
// GLOBAL ENUM READERS
// ============================================================================

/**
 * Load global preferences (cached for performance)
 */
let globalPrefsCache = null;
let globalPrefsCacheTime = 0;
const CACHE_TTL_MS = 60000; // 1 minute cache

async function loadGlobalPreferences() {
  const now = Date.now();
  if (globalPrefsCache && (now - globalPrefsCacheTime) < CACHE_TTL_MS) {
    return globalPrefsCache;
  }

  const prefs = await readJSON(getGlobalPreferencesPath());
  if (prefs) {
    globalPrefsCache = prefs;
    globalPrefsCacheTime = now;
  }
  return prefs || {
    task_priorities: ['emergency', 'critical', 'high', 'medium', 'low', 'whenever'],
    task_statuses: ['not_started', 'in_progress', 'blocked', 'completed', 'completed_verified', 'archived']
  };
}

/**
 * @hacs-endpoint
 * @tool list_priorities
 * @category task
 * @description Returns the list of available task priority levels from global config.
 * Use this to populate UI dropdowns or validate priority values.
 * @returns {object} { success: true, priorities: [...] }
 */
export async function listPriorities() {
  const metadata = { timestamp: new Date().toISOString(), function: 'listPriorities' };
  const prefs = await loadGlobalPreferences();

  return {
    success: true,
    priorities: prefs.task_priorities,
    metadata
  };
}

/**
 * @hacs-endpoint
 * @tool list_task_statuses
 * @category task
 * @description Returns the list of available task status values from global config.
 * Use this to populate UI dropdowns or validate status values.
 * @returns {object} { success: true, statuses: [...] }
 */
export async function listTaskStatuses() {
  const metadata = { timestamp: new Date().toISOString(), function: 'listTaskStatuses' };
  const prefs = await loadGlobalPreferences();

  return {
    success: true,
    statuses: prefs.task_statuses,
    metadata
  };
}

// ============================================================================
// DATA HELPERS
// ============================================================================

/**
 * Get path to instance's personal tasks file
 */
function getPersonalTasksFile(instanceId) {
  return path.join(getInstanceDir(instanceId), 'personal_tasks.json');
}

/**
 * Get path to project's tasks file
 */
function getProjectTasksFile(projectId) {
  return path.join(getProjectDir(projectId), 'project_tasks.json');
}

/**
 * Generate a short random suffix for task IDs
 */
function generateSuffix() {
  return crypto.randomBytes(2).toString('hex');
}

/**
 * Generate task ID with proper prefix
 * @param {string} type - 'personal' or 'project'
 * @param {string} listId - List name/ID
 * @param {string} projectId - Project ID (only for project tasks)
 */
function generateTaskId(type, listId, projectId = null) {
  const seq = Date.now().toString(36) + generateSuffix();
  if (type === 'personal') {
    return `ptask-${listId}::${seq}`;
  } else {
    // Use :: separator to handle hyphenated project IDs
    return `prjtask-${projectId}::${listId}::${seq}`;
  }
}

/**
 * Parse task ID to extract type and context
 * Supports both new :: separator and legacy - separator formats.
 * For legacy format with hyphenated project IDs, projectId may be wrong —
 * callers should pass explicit projectId parameter as override.
 * @param {string} taskId - Task identifier
 * @param {string} [projectIdOverride] - Explicit project ID (fixes hyphenated project IDs)
 * @returns {object} { type: 'personal'|'project', listId, projectId? }
 */
function parseTaskId(taskId, projectIdOverride = null) {
  if (taskId.startsWith('ptask-')) {
    // Personal: ptask-{listId}::{seq} (new) or ptask-{listId}-{seq} (legacy)
    if (taskId.includes('::')) {
      const parts = taskId.substring(6).split('::');
      return { type: 'personal', listId: parts[0] };
    }
    const parts = taskId.substring(6).split('-');
    return { type: 'personal', listId: parts[0] };
  } else if (taskId.startsWith('prjtask-')) {
    // Project: prjtask-{projectId}::{listId}::{seq} (new) or prjtask-{projectId}-{listId}-{seq} (legacy)
    if (taskId.includes('::')) {
      const inner = taskId.substring(8);
      const parts = inner.split('::');
      return { type: 'project', projectId: projectIdOverride || parts[0], listId: parts[1] };
    }
    // Legacy format — projectId extraction breaks for hyphenated project IDs
    const inner = taskId.substring(8); // e.g., "fix-project-detail-panel-default-mkkcqhjq9170"
    if (projectIdOverride) {
      // Strip known projectId from the inner string to extract listId
      const afterProject = inner.substring(projectIdOverride.length + 1); // e.g., "default-mkkcqhjq9170"
      const remainParts = afterProject.split('-');
      return { type: 'project', projectId: projectIdOverride, listId: remainParts[0] };
    }
    // No override — try to find project by scanning known project directories
    // The inner looks like "{projectId}-{listId}-{seq}" but projectId may contain hyphens
    // Strategy: try matching against existing project directory names (longest match first)
    try {
      const projectsBaseDir = path.dirname(getProjectDir('_placeholder'));
      const entries = fs.readdirSync(projectsBaseDir, { withFileTypes: true })
        .filter(d => d.isDirectory())
        .map(d => d.name)
        .sort((a, b) => b.length - a.length); // longest match first
      for (const dirName of entries) {
        if (inner.startsWith(dirName + '-')) {
          const afterProject = inner.substring(dirName.length + 1);
          const remainParts = afterProject.split('-');
          return { type: 'project', projectId: dirName, listId: remainParts[0] };
        }
      }
    } catch (e) {
      // Fallback if directory scan fails
    }
    // Last resort: naive split (breaks for hyphenated project IDs)
    const parts = inner.split('-');
    return { type: 'project', projectId: parts[0], listId: parts[1] };
  }
  return null;
}

/**
 * Initialize empty task file structure
 */
function createEmptyTaskFile(ownerId, ownerType) {
  return {
    schema_version: '2.0',
    owner_id: ownerId,
    owner_type: ownerType,
    created: new Date().toISOString(),
    last_updated: new Date().toISOString(),
    task_lists: {
      default: {
        name: 'Default',
        created: new Date().toISOString(),
        tasks: []
      }
    }
  };
}

/**
 * Load or initialize personal tasks file
 * Handles both old format (lists) and new format (task_lists)
 */
async function loadPersonalTasks(instanceId) {
  const filePath = getPersonalTasksFile(instanceId);
  let data = await readJSON(filePath);
  if (!data) {
    data = createEmptyTaskFile(instanceId, 'instance');
    await writeJSON(filePath, data);
  }
  // Handle old format: 'lists' instead of 'task_lists'
  if (!data.task_lists && data.lists) {
    data.task_lists = data.lists;
  }
  // Ensure task_lists exists
  if (!data.task_lists) {
    data.task_lists = {
      default: { name: 'Default', created: new Date().toISOString(), tasks: [] }
    };
  }
  return data;
}

/**
 * Load or initialize project tasks file
 */
async function loadProjectTasks(projectId) {
  const filePath = getProjectTasksFile(projectId);
  let data = await readJSON(filePath);
  if (!data) {
    data = createEmptyTaskFile(projectId, 'project');
    await writeJSON(filePath, data);
  }
  return data;
}

/**
 * Find a task by ID in a task file
 * @returns {object|null} { task, listId } or null
 */
function findTaskInFile(taskData, taskId) {
  for (const [listId, list] of Object.entries(taskData.task_lists || {})) {
    const task = (list.tasks || []).find(t => t.id === taskId);
    if (task) {
      return { task, listId };
    }
  }
  return null;
}

// ============================================================================
// PERMISSION CHECKING
// ============================================================================

/**
 * Check if caller can edit a task
 * Central permission checking - called by updateTask()
 *
 * Rules:
 * - Personal tasks: only owner can edit
 * - Project tasks:
 *   - Executive, PA, COO can edit any task in any project
 *   - PM can only edit tasks in their joined project
 *   - Project members can edit their own assigned tasks
 *   - Assigning to someone else requires privileged role
 *
 * @param {object} params
 * @param {string} params.callerId - Who's making the request
 * @param {string} params.callerRole - Caller's role
 * @param {string} params.callerProject - Caller's joined project (from preferences)
 * @param {object} params.task - The task being edited
 * @param {string} params.taskType - 'personal' or 'project'
 * @param {string} params.projectId - Project ID (for project tasks)
 * @param {object} params.changes - What's being changed
 * @returns {object} { allowed: boolean, reason?: string }
 */
async function checkTaskEditPermissions(params) {
  const { callerId, callerRole, callerProject, task, taskType, projectId, changes } = params;

  const isHighPrivilege = ['Executive', 'PA', 'COO'].includes(callerRole);
  const isPM = callerRole === 'PM';

  // Personal tasks: only owner can edit
  if (taskType === 'personal') {
    // The task is in the caller's personal file, so they own it
    return { allowed: true };
  }

  // Project tasks
  if (taskType === 'project') {
    // Executive, PA, COO can do anything in any project
    if (isHighPrivilege) {
      return { allowed: true };
    }

    // PM can only manage their own project
    if (isPM) {
      if (callerProject === projectId) {
        return { allowed: true };
      } else {
        return {
          allowed: false,
          reason: `PM can only manage tasks in their joined project (${callerProject || 'none'}), not ${projectId}`
        };
      }
    }

    // Check if caller is a project member
    const projectPrefs = await readJSON(path.join(getProjectDir(projectId), 'project.json')) ||
                         await readJSON(path.join(getProjectDir(projectId), 'preferences.json'));

    if (!projectPrefs) {
      return { allowed: false, reason: `Project ${projectId} not found` };
    }

    const team = projectPrefs.team || [];
    if (!team.includes(callerId)) {
      return { allowed: false, reason: 'You are not a member of this project' };
    }

    // Non-privileged project members can only:
    // - Edit tasks assigned to them
    // - Take on unassigned tasks (assign to themselves)

    const isAssignedToMe = task.assigned_to === callerId;
    const isUnassigned = !task.assigned_to || task.assigned_to === 'unassigned';
    const isAssigningToSelf = changes.assigned_to === callerId;
    const isAssigningToOther = changes.assigned_to && changes.assigned_to !== callerId;

    // Can't assign to someone else without privilege
    if (isAssigningToOther) {
      return {
        allowed: false,
        reason: 'Only privileged roles (Executive, PA, COO, PM) can assign tasks to others. Ask the PM to do this.'
      };
    }

    // Can take on unassigned tasks
    if (isUnassigned && isAssigningToSelf) {
      return { allowed: true };
    }

    // Can edit own assigned tasks
    if (isAssignedToMe) {
      return { allowed: true };
    }

    return {
      allowed: false,
      reason: 'You can only edit tasks assigned to you, or take on unassigned tasks'
    };
  }

  return { allowed: false, reason: 'Unknown task type' };
}

// ============================================================================
// CORE FUNCTIONS
// ============================================================================

/**
 * @hacs-endpoint
 * @tool update_task
 * @category task
 * @description THE core function for updating tasks. All task edits go through here.
 * Updates any combination of title, description, priority, status, or assignment.
 * Performs permission checking based on role and project membership.
 * (Alias: change_task for backwards compatibility)
 * @param {string} instanceId - Caller's instance ID [required]
 * @param {string} taskId - Task ID to modify [required]
 * @param {string} title - New title [optional]
 * @param {string} description - New description [optional]
 * @param {string} priority - New priority (emergency|critical|high|medium|low|whenever) [optional]
 * @param {string} status - New status (not_started|in_progress|blocked|completed|completed_verified|archived) [optional]
 * @param {string} assigned_to - Assignee instance ID [optional, privileged roles only for project tasks]
 * @returns {object} { success: true, task: {...}, message: 'Task updated successfully' }
 */
export async function updateTask(params) {
  const metadata = { timestamp: new Date().toISOString(), function: 'updateTask' };

  // Validate required params
  if (!params.instanceId) {
    return { success: false, error: { code: 'MISSING_PARAM', message: 'instanceId is required' }, metadata };
  }
  if (!params.taskId) {
    return { success: false, error: { code: 'MISSING_PARAM', message: 'taskId is required' }, metadata };
  }

  // Parse task ID to determine type
  const parsed = parseTaskId(params.taskId, params.projectId);
  if (!parsed) {
    return {
      success: false,
      error: { code: 'INVALID_TASK_ID', message: 'Task ID format not recognized. Expected ptask-* or prjtask-*' },
      metadata
    };
  }

  // Get caller's role and project
  const callerPrefs = await readPreferences(params.instanceId);
  if (!callerPrefs) {
    return { success: false, error: { code: 'INVALID_CALLER', message: 'Caller instance not found' }, metadata };
  }
  const callerRole = callerPrefs.role || 'none';
  const callerProject = callerPrefs.project || null;

  // Load the appropriate task file
  let taskData, filePath;
  if (parsed.type === 'personal') {
    taskData = await loadPersonalTasks(params.instanceId);
    filePath = getPersonalTasksFile(params.instanceId);
  } else {
    taskData = await loadProjectTasks(parsed.projectId);
    filePath = getProjectTasksFile(parsed.projectId);
  }

  // Find the task
  const found = findTaskInFile(taskData, params.taskId);
  if (!found) {
    return {
      success: false,
      error: { code: 'TASK_NOT_FOUND', message: `Task ${params.taskId} not found` },
      metadata
    };
  }

  const { task, listId } = found;

  // Build changes object (only include provided fields)
  const changes = {};
  if (params.title !== undefined) changes.title = params.title;
  if (params.description !== undefined) changes.description = params.description;
  if (params.priority !== undefined) changes.priority = params.priority;
  if (params.status !== undefined) changes.status = params.status;
  if (params.assigned_to !== undefined) changes.assigned_to = params.assigned_to;

  // Check permissions
  const permCheck = await checkTaskEditPermissions({
    callerId: params.instanceId,
    callerRole,
    callerProject,
    task,
    taskType: parsed.type,
    projectId: parsed.projectId,
    changes
  });

  if (!permCheck.allowed) {
    return {
      success: false,
      error: { code: 'UNAUTHORIZED', message: permCheck.reason },
      metadata
    };
  }

  // Apply changes
  Object.assign(task, changes);
  task.updated = new Date().toISOString();
  taskData.last_updated = new Date().toISOString();

  // Save
  await writeJSON(filePath, taskData);

  return {
    success: true,
    task: {
      id: task.id,
      title: task.title,
      status: task.status,
      priority: task.priority,
      assigned_to: task.assigned_to
    },
    message: 'Task updated successfully',
    metadata
  };
}

/**
 * @hacs-endpoint
 * @tool create_task
 * @category task
 * @status stable
 * @description Creates a new task, either personal or on a project.
 * Personal tasks are created when projectId is omitted.
 * Project tasks require caller to be a member of the project (or have privileged role).
 * PM can only create tasks on their joined project. Executive/PA/COO can create on any project.
 *
 * @param {string} instanceId - Caller's instance ID [required]
 * @param {string} title - Task title, short one-line description [required]
 * @param {string} description - Detailed task description [optional]
 * @param {string} priority - Priority level: emergency|critical|high|medium|low|whenever [optional, default: medium]
 * @param {string} status - Initial status: not_started|in_progress|blocked [optional, default: not_started]
 * @param {string} listId - List name to add task to [optional, default: 'default']
 * @param {string} projectId - Project ID for project tasks [optional, omit for personal task]
 * @param {string} assigneeId - Instance ID to assign task to [optional, privileged only]
 *
 * @returns {object} { success: true, taskId, task: {...}, taskType: 'personal'|'project' }
 * @error MISSING_PARAM - instanceId or title not provided
 * @error INVALID_CALLER - Caller instance not found
 * @error INVALID_PROJECT - Project not found
 * @error UNAUTHORIZED - Caller not authorized to create task on this project
 */
export async function createTask(params) {
  const metadata = { timestamp: new Date().toISOString(), function: 'createTask' };

  // Validate required params
  if (!params.instanceId) {
    return { success: false, error: { code: 'MISSING_PARAM', message: 'instanceId is required' }, metadata };
  }
  if (!params.title) {
    return { success: false, error: { code: 'MISSING_PARAM', message: 'title is required' }, metadata };
  }

  const listId = params.listId || 'default';
  const priority = ['critical', 'high', 'medium', 'low'].includes(params.priority)
    ? params.priority
    : 'medium';

  // Get caller info
  const callerPrefs = await readPreferences(params.instanceId);
  if (!callerPrefs) {
    return { success: false, error: { code: 'INVALID_CALLER', message: 'Caller instance not found' }, metadata };
  }
  const callerRole = callerPrefs.role || 'none';
  const isPrivileged = isPrivilegedRole(callerRole);

  let taskData, filePath, taskId, taskType;

  if (params.projectId) {
    // Creating a project task
    taskType = 'project';

    // Check permissions for project task creation
    const projectPrefs = await readJSON(path.join(getProjectDir(params.projectId), 'project.json')) ||
                         await readJSON(path.join(getProjectDir(params.projectId), 'preferences.json'));

    if (!projectPrefs) {
      return { success: false, error: { code: 'PROJECT_NOT_FOUND', message: `Project ${params.projectId} not found` }, metadata };
    }

    const team = projectPrefs.team || [];
    const isMember = team.includes(params.instanceId);

    // Must be privileged or a team member
    if (!isPrivileged && !isMember) {
      return {
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'You must be a project member or have a privileged role to create project tasks' },
        metadata
      };
    }

    taskData = await loadProjectTasks(params.projectId);
    filePath = getProjectTasksFile(params.projectId);
    taskId = generateTaskId('project', listId, params.projectId);

  } else {
    // Creating a personal task
    taskType = 'personal';
    taskData = await loadPersonalTasks(params.instanceId);
    filePath = getPersonalTasksFile(params.instanceId);
    taskId = generateTaskId('personal', listId);
  }

  // Ensure the list exists
  if (!taskData.task_lists[listId]) {
    taskData.task_lists[listId] = {
      name: listId.charAt(0).toUpperCase() + listId.slice(1),
      created: new Date().toISOString(),
      tasks: []
    };
  }

  // Create the task
  const now = new Date().toISOString();
  const task = {
    id: taskId,
    title: params.title,
    description: params.description || null,
    priority,
    status: 'pending',
    assigned_to: taskType === 'project' ? 'unassigned' : null,
    created: now,
    updated: now
  };

  taskData.task_lists[listId].tasks.push(task);
  taskData.last_updated = now;

  // Save
  await writeJSON(filePath, taskData);

  return {
    success: true,
    taskId,
    task: {
      id: taskId,
      title: task.title,
      priority: task.priority,
      status: task.status,
      list: listId
    },
    taskType,
    message: `Task created in ${taskType === 'project' ? 'project ' + params.projectId : 'personal'} list '${listId}'`,
    metadata
  };
}

/**
 * @hacs-endpoint
 * @tool create_task_list
 * @category task
 * @status stable
 * @description Creates a new named task list for personal or project tasks.
 * Personal lists are created when projectId is omitted.
 * Project lists require privileged role (PM, PA, COO, Executive).
 *
 * @param {string} instanceId - Caller's instance ID [required]
 * @param {string} listId - Name for the new list [required]
 * @param {string} projectId - Project ID for project list [optional, privileged only]
 *
 * @returns {object} { success: true, listId, listType: 'personal'|'project' }
 * @error MISSING_PARAM - instanceId or listId not provided
 * @error INVALID_CALLER - Caller instance not found
 * @error LIST_EXISTS - List with this name already exists
 * @error UNAUTHORIZED - Caller not authorized to create project lists
 */
export async function createTaskList(params) {
  const metadata = { timestamp: new Date().toISOString(), function: 'createTaskList' };

  if (!params.instanceId) {
    return { success: false, error: { code: 'MISSING_PARAM', message: 'instanceId is required' }, metadata };
  }
  if (!params.listId) {
    return { success: false, error: { code: 'MISSING_PARAM', message: 'listId is required' }, metadata };
  }

  // Normalize listId
  const listId = params.listId.toLowerCase().replace(/[^a-z0-9_-]/g, '-');

  const callerPrefs = await readPreferences(params.instanceId);
  if (!callerPrefs) {
    return { success: false, error: { code: 'INVALID_CALLER', message: 'Caller instance not found' }, metadata };
  }
  const isPrivileged = isPrivilegedRole(callerPrefs.role);

  let taskData, filePath;

  if (params.projectId) {
    // Project list - privileged only
    if (!isPrivileged) {
      return {
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Only privileged roles can create project task lists' },
        metadata
      };
    }
    taskData = await loadProjectTasks(params.projectId);
    filePath = getProjectTasksFile(params.projectId);
  } else {
    // Personal list
    taskData = await loadPersonalTasks(params.instanceId);
    filePath = getPersonalTasksFile(params.instanceId);
  }

  if (taskData.task_lists[listId]) {
    return {
      success: false,
      error: { code: 'LIST_EXISTS', message: `List '${listId}' already exists` },
      metadata
    };
  }

  taskData.task_lists[listId] = {
    name: params.listId,  // Keep original casing for display
    created: new Date().toISOString(),
    tasks: []
  };
  taskData.last_updated = new Date().toISOString();

  await writeJSON(filePath, taskData);

  return {
    success: true,
    listId,
    message: `List '${listId}' created`,
    metadata
  };
}

/**
 * @hacs-endpoint
 * @tool list_tasks
 * @category task
 * @status stable
 * @description Lists tasks with pagination and filtering. Token-aware by design.
 * Returns personal tasks by default. Use projectId to list project tasks.
 * Default behavior returns only 5 tasks with headers (taskId, title, priority, status).
 *
 * @param {string} instanceId - Caller's instance ID [required]
 * @param {string} projectId - Project ID to list project tasks [optional, omit for personal]
 * @param {string} listId - Filter to specific list [optional]
 * @param {string} status - Filter by status [optional]
 * @param {string} assigneeId - Filter by assignee (project tasks only) [optional]
 * @param {string} priority - Filter by priority [optional]
 * @param {number} skip - Number of tasks to skip for pagination [optional, default: 0]
 * @param {number} limit - Maximum tasks to return [optional, default: 5]
 * @param {boolean} full_detail - Include all task fields [optional, default: false]
 *
 * @returns {object} { success: true, tasks: [...], total, skip, limit }
 * @error MISSING_PARAM - instanceId not provided
 */
export async function listTasks(params) {
  const metadata = { timestamp: new Date().toISOString(), function: 'listTasks' };

  if (!params.instanceId) {
    return { success: false, error: { code: 'MISSING_PARAM', message: 'instanceId is required' }, metadata };
  }

  // Accept both old and new param names for backwards compatibility
  const skip = params.skip ?? params.index ?? 0;
  const limit = params.limit ?? params.span ?? 5;
  const fullDetail = params.full_detail || false;

  let allTasks = [];

  // Load appropriate tasks
  if (params.projectId) {
    const taskData = await loadProjectTasks(params.projectId);
    for (const [listId, list] of Object.entries(taskData.task_lists || {})) {
      if (params.listId && listId !== params.listId) continue;
      for (const task of list.tasks || []) {
        allTasks.push({ ...task, list: listId, source: 'project', projectId: params.projectId });
      }
    }
  } else {
    // Personal tasks
    const taskData = await loadPersonalTasks(params.instanceId);
    for (const [listId, list] of Object.entries(taskData.task_lists || {})) {
      if (params.listId && listId !== params.listId) continue;
      for (const task of list.tasks || []) {
        allTasks.push({ ...task, list: listId, source: 'personal' });
      }
    }
  }

  // Filter by status
  if (params.status) {
    allTasks = allTasks.filter(t => t.status === params.status);
  }

  const total = allTasks.length;
  const hasMore = total > (skip + limit);

  // Paginate
  const paginated = allTasks.slice(skip, skip + limit);

  // Format output
  const tasks = paginated.map(t => {
    if (fullDetail) {
      return t;
    } else {
      return { taskId: t.id, title: t.title, priority: t.priority, status: t.status };
    }
  });

  const response = {
    success: true,
    tasks,
    total,
    returned: tasks.length,
    skip,
    limit,
    hasMore,
    metadata
  };

  if (hasMore) {
    response.hint = `${total - skip - limit} more tasks. Call with skip=${skip + limit} to get next batch.`;
  }

  if (fullDetail && limit > 20) {
    response.warning = 'CAUTION: full_detail with high limit can cause context window explosion!';
  }

  return response;
}

// ============================================================================
// CONVENIENCE WRAPPERS (all call updateTask or other core functions)
// ============================================================================

/**
 * @hacs-endpoint
 * @tool assign_task
 * @category task
 * @status stable
 * @description Assigns a project task to a specific instance. Privileged roles only.
 * PM can only assign tasks in their joined project. Executive/PA/COO can assign any.
 *
 * @param {string} instanceId - Caller's instance ID [required]
 * @param {string} taskId - Task ID to assign [required]
 * @param {string} assigneeId - Instance ID to assign task to [required]
 *
 * @returns {object} { success: true, task: {...} }
 * @error MISSING_PARAM - Required parameters not provided
 * @error INVALID_TASK - Can only assign project tasks
 * @error UNAUTHORIZED - Caller not authorized to assign tasks
 */
export async function assignTask(params) {
  const metadata = { timestamp: new Date().toISOString(), function: 'assignTask' };

  if (!params.instanceId || !params.taskId || !params.assigneeId) {
    return {
      success: false,
      error: { code: 'MISSING_PARAM', message: 'instanceId, taskId, and assigneeId are required' },
      metadata
    };
  }

  // Verify task is a project task
  const parsed = parseTaskId(params.taskId, params.projectId);
  if (!parsed || parsed.type !== 'project') {
    return {
      success: false,
      error: { code: 'INVALID_TASK', message: 'Can only assign project tasks, not personal tasks' },
      metadata
    };
  }

  return updateTask({
    instanceId: params.instanceId,
    taskId: params.taskId,
    assigned_to: params.assigneeId
  });
}

/**
 * @hacs-endpoint
 * @tool take_on_task
 * @category task
 * @status stable
 * @description Claims an unassigned project task for yourself. The task must be
 * currently unassigned. Project members can claim tasks in their project.
 *
 * @param {string} instanceId - Caller's instance ID [required]
 * @param {string} taskId - Task ID to claim [required]
 *
 * @returns {object} { success: true, task: {...} }
 * @error MISSING_PARAM - Required parameters not provided
 * @error ALREADY_ASSIGNED - Task is already assigned to someone
 */
export async function takeOnTask(params) {
  const metadata = { timestamp: new Date().toISOString(), function: 'takeOnTask' };

  if (!params.instanceId || !params.taskId) {
    return {
      success: false,
      error: { code: 'MISSING_PARAM', message: 'instanceId and taskId are required' },
      metadata
    };
  }

  return updateTask({
    instanceId: params.instanceId,
    taskId: params.taskId,
    assigned_to: params.instanceId  // Self-assign
  });
}

/**
 * @hacs-endpoint
 * @tool mark_task_complete
 * @category task
 * @status stable
 * @description Marks a task as completed. Sets status to 'completed'.
 * Only the assignee or privileged roles can mark tasks complete.
 *
 * @param {string} instanceId - Caller's instance ID [required]
 * @param {string} taskId - Task ID to complete [required]
 *
 * @returns {object} { success: true, task: {...} }
 * @error MISSING_PARAM - Required parameters not provided
 * @error UNAUTHORIZED - Not authorized to complete this task
 */
export async function markTaskComplete(params) {
  const metadata = { timestamp: new Date().toISOString(), function: 'markTaskComplete' };

  if (!params.instanceId || !params.taskId) {
    return {
      success: false,
      error: { code: 'MISSING_PARAM', message: 'instanceId and taskId are required' },
      metadata
    };
  }

  return updateTask({
    instanceId: params.instanceId,
    taskId: params.taskId,
    status: 'completed'
  });
}

/**
 * @hacs-endpoint
 * @tool get_task
 * @category task
 * @description Get full details of a single task by ID.
 * (Alias: get_task_details for backwards compatibility)
 * @param {string} instanceId - Caller's instance ID [required]
 * @param {string} taskId - Task ID to retrieve [required]
 * @returns {object} { success: true, task: {...} }
 */
export async function getTask(params) {
  const metadata = { timestamp: new Date().toISOString(), function: 'getTask' };

  if (!params.instanceId || !params.taskId) {
    return {
      success: false,
      error: { code: 'MISSING_PARAM', message: 'instanceId and taskId are required' },
      metadata
    };
  }

  const parsed = parseTaskId(params.taskId, params.projectId);
  if (!parsed) {
    return {
      success: false,
      error: { code: 'INVALID_TASK_ID', message: 'Task ID format not recognized' },
      metadata
    };
  }

  let taskData;
  if (parsed.type === 'personal') {
    taskData = await loadPersonalTasks(params.instanceId);
  } else {
    taskData = await loadProjectTasks(parsed.projectId);
  }

  const found = findTaskInFile(taskData, params.taskId);
  if (!found) {
    return {
      success: false,
      error: { code: 'TASK_NOT_FOUND', message: `Task ${params.taskId} not found` },
      metadata
    };
  }

  return {
    success: true,
    task: {
      ...found.task,
      list: found.listId,
      taskType: parsed.type,
      projectId: parsed.projectId || null
    },
    metadata
  };
}

/**
 * @hacs-endpoint
 * @tool delete_task
 * @category task
 * @status stable
 * @description Deletes a completed personal task. Only personal tasks can be deleted.
 * Project tasks are archived, not deleted. Task must be in 'completed' status before deletion.
 *
 * @param {string} instanceId - Caller's instance ID [required]
 * @param {string} taskId - Task ID to delete [required]
 *
 * @returns {object} { success: true, message: "Task deleted" }
 * @error MISSING_PARAM - Required parameters not provided
 * @error INVALID_TASK_ID - Task ID format not recognized
 * @error UNAUTHORIZED - Only personal tasks can be deleted
 * @error TASK_NOT_COMPLETED - Task must be completed before deletion
 * @error TASK_NOT_FOUND - Task not found
 */
export async function deleteTask(params) {
  const metadata = { timestamp: new Date().toISOString(), function: 'deleteTask' };

  if (!params.instanceId || !params.taskId) {
    return {
      success: false,
      error: { code: 'MISSING_PARAM', message: 'instanceId and taskId are required' },
      metadata
    };
  }

  const parsed = parseTaskId(params.taskId, params.projectId);
  if (!parsed) {
    return {
      success: false,
      error: { code: 'INVALID_TASK_ID', message: 'Task ID format not recognized' },
      metadata
    };
  }

  // Only personal tasks can be deleted
  if (parsed.type !== 'personal') {
    return {
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'Only personal tasks can be deleted. Project tasks are archived, not deleted.' },
      metadata
    };
  }

  const taskData = await loadPersonalTasks(params.instanceId);
  const filePath = getPersonalTasksFile(params.instanceId);

  // Find and verify task is completed
  for (const [listId, list] of Object.entries(taskData.task_lists || {})) {
    const taskIndex = (list.tasks || []).findIndex(t => t.id === params.taskId);
    if (taskIndex !== -1) {
      const task = list.tasks[taskIndex];

      if (task.status !== 'completed') {
        return {
          success: false,
          error: { code: 'TASK_NOT_COMPLETED', message: 'Only completed tasks can be deleted. Mark it complete first.' },
          metadata
        };
      }

      // Delete it
      list.tasks.splice(taskIndex, 1);
      taskData.last_updated = new Date().toISOString();
      await writeJSON(filePath, taskData);

      return {
        success: true,
        message: `Task ${params.taskId} deleted`,
        metadata
      };
    }
  }

  return {
    success: false,
    error: { code: 'TASK_NOT_FOUND', message: `Task ${params.taskId} not found` },
    metadata
  };
}

/**
 * @hacs-endpoint
 * @tool delete_task_list
 * @category task
 * @status stable
 * @description Deletes an empty or fully-completed personal task list.
 * Cannot delete the 'default' list. All tasks in the list must be completed or deleted first.
 *
 * @param {string} instanceId - Caller's instance ID [required]
 * @param {string} listId - List ID to delete [required]
 * @param {string} projectId - Project ID for project lists (PM only) [optional]
 *
 * @returns {object} { success: true, message: "List deleted" }
 * @error MISSING_PARAM - Required parameters not provided
 * @error LIST_NOT_FOUND - List not found
 * @error CANNOT_DELETE_DEFAULT - Cannot delete the default list
 * @error LIST_NOT_EMPTY - List has incomplete tasks
 * @error UNAUTHORIZED - Only PM can delete project lists
 */
export async function deleteTaskList(params) {
  const metadata = { timestamp: new Date().toISOString(), function: 'deleteTaskList' };

  if (!params.instanceId || !params.listId) {
    return {
      success: false,
      error: { code: 'MISSING_PARAM', message: 'instanceId and listId are required' },
      metadata
    };
  }

  // Only personal lists can be deleted by regular users
  // Project lists require PM role
  if (params.projectId) {
    const callerPrefs = await readPreferences(params.instanceId);
    if (!callerPrefs || callerPrefs.role !== 'PM') {
      return {
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Only PM role can delete project task lists' },
        metadata
      };
    }
    // TODO: Implement project list deletion
    return { success: false, error: { code: 'NOT_IMPLEMENTED', message: 'Project list deletion not yet implemented' }, metadata };
  }

  const taskData = await loadPersonalTasks(params.instanceId);
  const filePath = getPersonalTasksFile(params.instanceId);
  const list = taskData.task_lists[params.listId];

  if (!list) {
    return {
      success: false,
      error: { code: 'LIST_NOT_FOUND', message: `List '${params.listId}' not found` },
      metadata
    };
  }

  if (params.listId === 'default') {
    return {
      success: false,
      error: { code: 'CANNOT_DELETE_DEFAULT', message: "Cannot delete the 'default' list" },
      metadata
    };
  }

  // Check if empty or all completed
  const tasks = list.tasks || [];
  const incomplete = tasks.filter(t => t.status !== 'completed');

  if (incomplete.length > 0) {
    return {
      success: false,
      error: {
        code: 'LIST_NOT_EMPTY',
        message: `List has ${incomplete.length} incomplete task(s). Complete or delete them first.`
      },
      metadata
    };
  }

  delete taskData.task_lists[params.listId];
  taskData.last_updated = new Date().toISOString();
  await writeJSON(filePath, taskData);

  return {
    success: true,
    message: `List '${params.listId}' deleted`,
    metadata
  };
}

/**
 * @hacs-endpoint
 * @tool list_priority_tasks
 * @category task
 * @status stable
 * @description Returns the top 5 highest priority incomplete tasks.
 * Combines personal tasks and project tasks assigned to caller.
 * Token-aware: returns only headers (taskId, title, priority, status, source).
 *
 * @param {string} instanceId - Caller's instance ID [required]
 *
 * @returns {object} { success: true, tasks: [...], count: number }
 */
export async function listPriorityTasks(params) {
  const metadata = { timestamp: new Date().toISOString(), function: 'listPriorityTasks' };

  if (!params.instanceId) {
    return { success: false, error: { code: 'MISSING_PARAM', message: 'instanceId is required' }, metadata };
  }

  // Get caller's project to include project tasks
  const callerPrefs = await readPreferences(params.instanceId);
  const projectId = callerPrefs?.project;

  let allTasks = [];

  // Personal tasks
  const personalData = await loadPersonalTasks(params.instanceId);
  for (const list of Object.values(personalData.task_lists || {})) {
    for (const task of list.tasks || []) {
      if (task.status !== 'completed') {
        allTasks.push({ ...task, source: 'personal' });
      }
    }
  }

  // Project tasks assigned to caller
  if (projectId) {
    const projectData = await loadProjectTasks(projectId);
    for (const list of Object.values(projectData.task_lists || {})) {
      for (const task of list.tasks || []) {
        if (task.assigned_to === params.instanceId && task.status !== 'completed') {
          allTasks.push({ ...task, source: 'project', projectId });
        }
      }
    }
  }

  // Sort by priority
  const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
  allTasks.sort((a, b) => (priorityOrder[a.priority] || 2) - (priorityOrder[b.priority] || 2));

  // Return top 5
  const top5 = allTasks.slice(0, 5).map(t => ({
    taskId: t.id,
    title: t.title,
    priority: t.priority,
    source: t.source
  }));

  return {
    success: true,
    tasks: top5,
    message: top5.length === 0 ? 'No pending tasks' : `Top ${top5.length} priority task(s)`,
    metadata
  };
}

/**
 * @hacs-endpoint
 * @tool get_my_top_task
 * @category task
 * @description Returns the single highest-priority non-complete task for the instance,
 * with full task detail. Searches both personal tasks and assigned project tasks.
 * @param {string} instanceId - Caller's instance ID [required]
 * @returns {object} { success: true, task: {...} } or { success: true, task: null }
 */
export async function getMyTopTask(params) {
  const metadata = { timestamp: new Date().toISOString(), function: 'getMyTopTask' };

  if (!params.instanceId) {
    return { success: false, error: { code: 'MISSING_PARAM', message: 'instanceId is required' }, metadata };
  }

  // Get caller's project to include project tasks
  const callerPrefs = await readPreferences(params.instanceId);
  const projectId = callerPrefs?.project;

  let allTasks = [];

  // Personal tasks
  const personalData = await loadPersonalTasks(params.instanceId);
  for (const [listId, list] of Object.entries(personalData.task_lists || {})) {
    for (const task of list.tasks || []) {
      if (task.status !== 'completed' && task.status !== 'completed_verified' && task.status !== 'archived') {
        allTasks.push({ ...task, list: listId, source: 'personal' });
      }
    }
  }

  // Project tasks assigned to caller
  if (projectId) {
    const projectData = await loadProjectTasks(projectId);
    for (const [listId, list] of Object.entries(projectData.task_lists || {})) {
      for (const task of list.tasks || []) {
        if (task.assigned_to === params.instanceId &&
            task.status !== 'completed' && task.status !== 'completed_verified' && task.status !== 'archived') {
          allTasks.push({ ...task, list: listId, source: 'project', projectId });
        }
      }
    }
  }

  if (allTasks.length === 0) {
    return {
      success: true,
      task: null,
      message: 'No pending tasks',
      metadata
    };
  }

  // Sort by priority (use global prefs order)
  const prefs = await loadGlobalPreferences();
  const priorityOrder = {};
  prefs.task_priorities.forEach((p, i) => { priorityOrder[p] = i; });

  allTasks.sort((a, b) => (priorityOrder[a.priority] ?? 999) - (priorityOrder[b.priority] ?? 999));

  const topTask = allTasks[0];

  return {
    success: true,
    task: topTask,
    message: `Top task: ${topTask.title}`,
    metadata
  };
}

/**
 * @hacs-endpoint
 * @tool mark_task_verified
 * @category task
 * @description Marks a completed task as verified (status: completed_verified).
 * For project tasks, the assignee CANNOT verify their own task - another team member must do it.
 * Personal tasks have no such restriction. Only completed tasks can be verified.
 * @param {string} instanceId - Caller's instance ID [required]
 * @param {string} taskId - Task ID to verify [required]
 * @returns {object} { success: true, task: {...} }
 */
export async function markTaskVerified(params) {
  const metadata = { timestamp: new Date().toISOString(), function: 'markTaskVerified' };

  if (!params.instanceId || !params.taskId) {
    return {
      success: false,
      error: { code: 'MISSING_PARAM', message: 'instanceId and taskId are required' },
      metadata
    };
  }

  // Parse task ID
  const parsed = parseTaskId(params.taskId, params.projectId);
  if (!parsed) {
    return {
      success: false,
      error: { code: 'INVALID_TASK_ID', message: 'Task ID format not recognized' },
      metadata
    };
  }

  // Load task file
  let taskData, filePath;
  if (parsed.type === 'personal') {
    taskData = await loadPersonalTasks(params.instanceId);
    filePath = getPersonalTasksFile(params.instanceId);
  } else {
    taskData = await loadProjectTasks(parsed.projectId);
    filePath = getProjectTasksFile(parsed.projectId);
  }

  // Find the task
  const found = findTaskInFile(taskData, params.taskId);
  if (!found) {
    return {
      success: false,
      error: { code: 'TASK_NOT_FOUND', message: `Task ${params.taskId} not found` },
      metadata
    };
  }

  const { task, listId } = found;

  // Check task is completed
  if (task.status !== 'completed') {
    return {
      success: false,
      error: {
        code: 'INVALID_STATUS',
        message: `Task must be 'completed' before it can be verified. Current status: ${task.status}`
      },
      metadata
    };
  }

  // For project tasks: assignee cannot verify their own task
  if (parsed.type === 'project') {
    if (task.assigned_to === params.instanceId) {
      return {
        success: false,
        error: {
          code: 'SELF_VERIFICATION_NOT_ALLOWED',
          message: 'You cannot verify your own task. Ask another project member to verify it.'
        },
        metadata
      };
    }

    // Verify caller is a project member
    const projectPrefs = await readJSON(path.join(getProjectDir(parsed.projectId), 'project.json')) ||
                         await readJSON(path.join(getProjectDir(parsed.projectId), 'preferences.json'));
    if (projectPrefs) {
      const team = projectPrefs.team || [];
      if (!team.includes(params.instanceId)) {
        // Check if caller is privileged
        const callerPrefs = await readPreferences(params.instanceId);
        const callerRole = callerPrefs?.role || 'none';
        if (!isPrivilegedRole(callerRole)) {
          return {
            success: false,
            error: { code: 'UNAUTHORIZED', message: 'You must be a project member to verify project tasks' },
            metadata
          };
        }
      }
    }
  }

  // Update status to completed_verified
  task.status = 'completed_verified';
  task.verified_by = params.instanceId;
  task.verified_at = new Date().toISOString();
  task.updated = new Date().toISOString();
  taskData.last_updated = new Date().toISOString();

  await writeJSON(filePath, taskData);

  return {
    success: true,
    task: {
      id: task.id,
      title: task.title,
      status: task.status,
      verified_by: task.verified_by,
      verified_at: task.verified_at
    },
    message: 'Task verified successfully',
    metadata
  };
}

/**
 * @hacs-endpoint
 * @tool archive_task
 * @category task
 * @description Archives a completed_verified task by moving it to TASK_ARCHIVE.json.
 * This reduces active task list size for token efficiency.
 * Only tasks with status 'completed_verified' can be archived.
 * For project tasks: only PM of that project, or Executive/PA/COO can archive.
 * Personal tasks can be archived by the owner.
 * @param {string} instanceId - Caller's instance ID [required]
 * @param {string} taskId - Task ID to archive [required]
 * @returns {object} { success: true, task: { id, title, archived_at } }
 */
export async function archiveTask(params) {
  const metadata = { timestamp: new Date().toISOString(), function: 'archiveTask' };

  if (!params.instanceId || !params.taskId) {
    return {
      success: false,
      error: { code: 'MISSING_PARAM', message: 'instanceId and taskId are required' },
      metadata
    };
  }

  // Parse task ID
  const parsed = parseTaskId(params.taskId, params.projectId);
  if (!parsed) {
    return {
      success: false,
      error: { code: 'INVALID_TASK_ID', message: 'Task ID format not recognized' },
      metadata
    };
  }

  // Get caller info
  const callerPrefs = await readPreferences(params.instanceId);
  if (!callerPrefs) {
    return { success: false, error: { code: 'INVALID_CALLER', message: 'Caller instance not found' }, metadata };
  }
  const callerRole = callerPrefs.role || 'none';

  // Load task file
  let taskData, filePath, archivePath;
  if (parsed.type === 'personal') {
    taskData = await loadPersonalTasks(params.instanceId);
    filePath = getPersonalTasksFile(params.instanceId);
    archivePath = path.join(getInstanceDir(params.instanceId), 'TASK_ARCHIVE.json');
  } else {
    taskData = await loadProjectTasks(parsed.projectId);
    filePath = getProjectTasksFile(parsed.projectId);
    archivePath = path.join(getProjectDir(parsed.projectId), 'TASK_ARCHIVE.json');

    // Check permissions for project tasks
    const projectPrefs = await readJSON(path.join(getProjectDir(parsed.projectId), 'project.json')) ||
                         await readJSON(path.join(getProjectDir(parsed.projectId), 'preferences.json'));

    // Only PM of this project, or Executive/PA/COO can archive
    const isPM = callerRole === 'PM';
    const isHighPrivilege = ['Executive', 'PA', 'COO'].includes(callerRole);
    const isProjectPM = isPM && callerPrefs.project === parsed.projectId;

    if (!isProjectPM && !isHighPrivilege) {
      return {
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Only the project PM or Executive/PA/COO can archive project tasks'
        },
        metadata
      };
    }
  }

  // Find the task
  let foundTask = null;
  let foundListId = null;
  let foundIndex = -1;

  for (const [listId, list] of Object.entries(taskData.task_lists || {})) {
    const idx = (list.tasks || []).findIndex(t => t.id === params.taskId);
    if (idx !== -1) {
      foundTask = list.tasks[idx];
      foundListId = listId;
      foundIndex = idx;
      break;
    }
  }

  if (!foundTask) {
    return {
      success: false,
      error: { code: 'TASK_NOT_FOUND', message: `Task ${params.taskId} not found` },
      metadata
    };
  }

  // Check task status
  if (foundTask.status !== 'completed_verified') {
    return {
      success: false,
      error: {
        code: 'INVALID_STATUS',
        message: `Task must be 'completed_verified' before archiving. Current status: ${foundTask.status}. Use markTaskVerified first.`
      },
      metadata
    };
  }

  // Load or create archive file
  let archive = await readJSON(archivePath) || {
    schema_version: '1.0',
    archived_tasks: []
  };

  // Add to archive with metadata
  const archivedTask = {
    ...foundTask,
    status: 'archived',
    archived_at: new Date().toISOString(),
    archived_by: params.instanceId,
    archived_from_list: foundListId
  };
  archive.archived_tasks.push(archivedTask);

  // Remove from active task list
  taskData.task_lists[foundListId].tasks.splice(foundIndex, 1);
  taskData.last_updated = new Date().toISOString();

  // Save both files
  await writeJSON(archivePath, archive);
  await writeJSON(filePath, taskData);

  return {
    success: true,
    task: {
      id: archivedTask.id,
      title: archivedTask.title,
      archived_at: archivedTask.archived_at
    },
    message: `Task archived to ${parsed.type === 'personal' ? 'personal' : 'project'} TASK_ARCHIVE.json`,
    metadata
  };
}

// ============================================================================
// BACKWARDS-COMPATIBLE ALIASES
// ============================================================================

// changeTask is now updateTask
export const changeTask = updateTask;

// getTaskDetails is now getTask
export const getTaskDetails = getTask;
