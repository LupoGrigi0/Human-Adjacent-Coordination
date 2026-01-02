/**
 * Task Management V2 - Ground-up implementation
 *
 * Architecture:
 * - Personal tasks: {instanceDir}/personal_tasks.json
 * - Project tasks: {projectDir}/project_tasks.json
 * - Hierarchical: task_lists → named lists → tasks
 * - Task IDs encode type: ptask-{list}-{seq} or prjtask-{project}-{list}-{seq}
 *
 * Core principle: changeTask() is THE single source of truth for all edits.
 * All convenience functions wrap changeTask().
 *
 * @module task-management
 * @author Crossing
 * @created 2026-01-01
 */

import path from 'path';
import crypto from 'crypto';
import { getInstanceDir, getProjectDir } from './config.js';
import { readJSON, writeJSON, ensureDir, readPreferences } from './data.js';
import { isPrivilegedRole } from './permissions.js';

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
    return `ptask-${listId}-${seq}`;
  } else {
    return `prjtask-${projectId}-${listId}-${seq}`;
  }
}

/**
 * Parse task ID to extract type and context
 * @param {string} taskId - Task identifier
 * @returns {object} { type: 'personal'|'project', listId, projectId? }
 */
function parseTaskId(taskId) {
  if (taskId.startsWith('ptask-')) {
    const parts = taskId.substring(6).split('-');
    return { type: 'personal', listId: parts[0] };
  } else if (taskId.startsWith('prjtask-')) {
    const parts = taskId.substring(8).split('-');
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
 * Central permission checking - called by changeTask()
 *
 * Rules:
 * - Personal tasks: only owner can edit
 * - Project tasks:
 *   - Privileged roles can edit any task in any project
 *   - Project members can edit their own assigned tasks
 *   - Assigning to someone else requires privileged role
 *
 * @param {object} params
 * @param {string} params.callerId - Who's making the request
 * @param {string} params.callerRole - Caller's role
 * @param {object} params.task - The task being edited
 * @param {string} params.taskType - 'personal' or 'project'
 * @param {string} params.projectId - Project ID (for project tasks)
 * @param {object} params.changes - What's being changed
 * @returns {object} { allowed: boolean, reason?: string }
 */
async function checkTaskEditPermissions(params) {
  const { callerId, callerRole, task, taskType, projectId, changes } = params;

  const isPrivileged = isPrivilegedRole(callerRole);

  // Personal tasks: only owner can edit
  if (taskType === 'personal') {
    // The task is in the caller's personal file, so they own it
    return { allowed: true };
  }

  // Project tasks
  if (taskType === 'project') {
    // Privileged can do anything
    if (isPrivileged) {
      return { allowed: true };
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
 * changeTask - THE core function. All task edits go through here.
 *
 * @param {object} params
 * @param {string} params.instanceId - Caller's instance ID [required]
 * @param {string} params.taskId - Task to modify [required]
 * @param {string} params.title - New title [optional]
 * @param {string} params.description - New description [optional]
 * @param {string} params.priority - New priority [optional]
 * @param {string} params.status - New status [optional]
 * @param {string} params.assigned_to - Assignee instance ID [optional]
 */
export async function changeTask(params) {
  const metadata = { timestamp: new Date().toISOString(), function: 'changeTask' };

  // Validate required params
  if (!params.instanceId) {
    return { success: false, error: { code: 'MISSING_PARAM', message: 'instanceId is required' }, metadata };
  }
  if (!params.taskId) {
    return { success: false, error: { code: 'MISSING_PARAM', message: 'taskId is required' }, metadata };
  }

  // Parse task ID to determine type
  const parsed = parseTaskId(params.taskId);
  if (!parsed) {
    return {
      success: false,
      error: { code: 'INVALID_TASK_ID', message: 'Task ID format not recognized. Expected ptask-* or prjtask-*' },
      metadata
    };
  }

  // Get caller's role
  const callerPrefs = await readPreferences(params.instanceId);
  if (!callerPrefs) {
    return { success: false, error: { code: 'INVALID_CALLER', message: 'Caller instance not found' }, metadata };
  }
  const callerRole = callerPrefs.role || 'none';

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
 * createTask - Create a new task
 *
 * @param {object} params
 * @param {string} params.instanceId - Caller's instance ID [required]
 * @param {string} params.title - Task title [required]
 * @param {string} params.description - Task description [optional]
 * @param {string} params.priority - Priority: critical|high|medium|low [optional, default: medium]
 * @param {string} params.listId - List name [optional, default: 'default']
 * @param {string} params.projectId - Project ID for project tasks [optional]
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
 * createTaskList - Create a new named task list
 *
 * @param {object} params
 * @param {string} params.instanceId - Caller's instance ID [required]
 * @param {string} params.listId - New list name/ID [required]
 * @param {string} params.projectId - Project ID for project list [optional, privileged only]
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
 * listTasks - List tasks with pagination and filtering
 *
 * WARNING: Setting full_detail=true with high span can cause context window explosion!
 *
 * @param {object} params
 * @param {string} params.instanceId - Caller's instance ID [required]
 * @param {string} params.listId - Filter by list [optional]
 * @param {string} params.status - Filter by status [optional]
 * @param {string} params.projectId - Get project tasks [optional]
 * @param {number} params.index - Starting index [optional, default: 0]
 * @param {number} params.span - Number to return [optional, default: 10]
 * @param {boolean} params.full_detail - Include all fields [optional, default: false]
 */
export async function listTasks(params) {
  const metadata = { timestamp: new Date().toISOString(), function: 'listTasks' };

  if (!params.instanceId) {
    return { success: false, error: { code: 'MISSING_PARAM', message: 'instanceId is required' }, metadata };
  }

  const index = params.index || 0;
  const span = params.span || 10;
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
  const hasMore = total > (index + span);

  // Paginate
  const paginated = allTasks.slice(index, index + span);

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
    index,
    span,
    hasMore,
    metadata
  };

  if (hasMore) {
    response.hint = `${total - index - span} more tasks. Call with index=${index + span} to get next batch.`;
  }

  if (fullDetail && span > 20) {
    response.warning = 'CAUTION: full_detail with high span can cause context window explosion!';
  }

  return response;
}

// ============================================================================
// CONVENIENCE WRAPPERS (all call changeTask or other core functions)
// ============================================================================

/**
 * assignTask - Assign a project task to an instance (privileged only)
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
  const parsed = parseTaskId(params.taskId);
  if (!parsed || parsed.type !== 'project') {
    return {
      success: false,
      error: { code: 'INVALID_TASK', message: 'Can only assign project tasks, not personal tasks' },
      metadata
    };
  }

  return changeTask({
    instanceId: params.instanceId,
    taskId: params.taskId,
    assigned_to: params.assigneeId
  });
}

/**
 * takeOnTask - Self-assign a project task
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

  return changeTask({
    instanceId: params.instanceId,
    taskId: params.taskId,
    assigned_to: params.instanceId  // Self-assign
  });
}

/**
 * markTaskComplete - Mark a task as completed
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

  return changeTask({
    instanceId: params.instanceId,
    taskId: params.taskId,
    status: 'completed'
  });
}

/**
 * getTaskDetails - Get full details of a single task
 */
export async function getTaskDetails(params) {
  const metadata = { timestamp: new Date().toISOString(), function: 'getTaskDetails' };

  if (!params.instanceId || !params.taskId) {
    return {
      success: false,
      error: { code: 'MISSING_PARAM', message: 'instanceId and taskId are required' },
      metadata
    };
  }

  const parsed = parseTaskId(params.taskId);
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
 * deleteTask - Delete a completed personal task
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

  const parsed = parseTaskId(params.taskId);
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
 * deleteTaskList - Delete an empty or fully-completed personal task list
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
 * listPriorityTasks - Get top 5 highest priority tasks
 * Token-saver function
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
