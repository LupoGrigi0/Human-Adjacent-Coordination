/**
 * Task handler for V2 coordination system
 * Provides project tasks and personal task lists
 *
 * @module tasks
 * @author Bridge
 * @created 2025-12-06
 * @updated 2025-12-11 - Added assign_task_to_instance with messaging
 */

import fs from 'fs/promises';
import path from 'path';
import { DATA_ROOT, getInstanceDir, getProjectsDir } from './config.js';
import { readJSON, writeJSON, ensureDir, readPreferences } from './data.js';
// Import XMPP messaging for task assignment notifications
import * as XMPPHandler from '../handlers/messaging-xmpp.js';

/**
 * Get path to project's task file
 */
function getProjectTaskFile(projectId) {
  return path.join(getProjectsDir(), projectId, 'tasks.json');
}

/**
 * Get path to instance's personal task file
 */
function getPersonalTaskFile(instanceId) {
  return path.join(getInstanceDir(instanceId), 'personal_tasks.json');
}

/**
 * Initialize project task file if it doesn't exist
 */
async function initializeProjectTasks(projectId) {
  const taskFile = getProjectTaskFile(projectId);
  const existing = await readJSON(taskFile);

  if (!existing) {
    const defaultData = {
      schema_version: '2.0',
      project_id: projectId,
      created: new Date().toISOString(),
      last_updated: new Date().toISOString(),
      tasks: []
    };
    await writeJSON(taskFile, defaultData);
    return defaultData;
  }
  return existing;
}

/**
 * Initialize personal task file for an instance
 */
async function initializePersonalTasks(instanceId, name) {
  const taskFile = getPersonalTaskFile(instanceId);
  const existing = await readJSON(taskFile);

  if (!existing) {
    const defaultData = {
      schema_version: '2.0',
      instance_id: instanceId,
      created: new Date().toISOString(),
      last_updated: new Date().toISOString(),
      lists: {
        default: {
          name: 'Default',
          tasks: []
        }
      }
    };
    await writeJSON(taskFile, defaultData);
    return defaultData;
  }
  return existing;
}

/**
 * @hacs-endpoint
 * @template-version 1.0.0
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │ GET_MY_TASKS                                                            │
 * │ Get tasks relevant to the current instance (personal + project)         │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * @tool get_my_tasks
 * @version 2.0.0
 * @since 2025-12-06
 * @category tasks
 * @status stable
 *
 * ───────────────────────────────────────────────────────────────────────────
 * DESCRIPTION
 * ───────────────────────────────────────────────────────────────────────────
 * @description
 * Returns all tasks relevant to this instance: personal tasks from all lists
 * and project tasks (both unclaimed and assigned to this instance). This is
 * the primary "what should I work on" endpoint for instances.
 *
 * Use this endpoint to get an overview of all your pending work. For detailed
 * task information, use readTask with the specific taskId.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * PARAMETERS
 * ───────────────────────────────────────────────────────────────────────────
 * @param {string} instanceId - Unique identifier for the instance [required]
 *   @source Your instanceId is returned from bootstrap response, or can be
 *           recovered via lookup_identity using your fingerprint.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * RETURNS
 * ───────────────────────────────────────────────────────────────────────────
 * @returns {object} GetMyTasksResponse
 * @returns {boolean} .success - Whether the call succeeded
 * @returns {array} .personalTasks - Personal tasks across all lists
 * @returns {string} .personalTasks[].taskId - Task identifier
 * @returns {string} .personalTasks[].title - Task title
 * @returns {string} .personalTasks[].priority - Priority level (critical|high|medium|low)
 * @returns {string} .personalTasks[].list - Which list this task belongs to
 * @returns {array} .projectTasks - Project tasks (unclaimed or assigned to you)
 * @returns {string} .projectTasks[].taskId - Task identifier
 * @returns {string} .projectTasks[].title - Task title
 * @returns {string} .projectTasks[].status - Task status (pending|in_progress|completed)
 * @returns {string} .projectTasks[].priority - Priority level
 * @returns {string|null} .projectTasks[].assignee - Assigned instance ID or null
 * @returns {string|null} .project - Current project ID or null if not on a project
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
 * @error MISSING_PARAMETER - instanceId parameter not provided
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
 * @example Basic usage
 * { "instanceId": "Phoenix-k3m7" }
 *
 * ───────────────────────────────────────────────────────────────────────────
 * RELATED
 * ───────────────────────────────────────────────────────────────────────────
 * @see introspect - Get full context including task counts
 * @see getNextTask - Get the highest priority unclaimed task
 * @see addPersonalTask - Add a new personal task
 * @see claimTask - Claim an unclaimed project task
 *
 * ───────────────────────────────────────────────────────────────────────────
 * NOTES
 * ───────────────────────────────────────────────────────────────────────────
 * @note Personal tasks persist across resurrection (successor inherits)
 * @note Project tasks are filtered to show only unclaimed or assigned to you
 * @note Returns titles/IDs only - use readTask for full task details
 */
export async function getMyTasks(params) {
  const metadata = {
    timestamp: new Date().toISOString(),
    function: 'getMyTasks'
  };

  if (!params.instanceId) {
    return {
      success: false,
      error: {
        code: 'MISSING_PARAMETER',
        message: 'instanceId is required'
      },
      metadata
    };
  }

  const prefs = await readPreferences(params.instanceId);
  if (!prefs) {
    return {
      success: false,
      error: {
        code: 'INVALID_INSTANCE_ID',
        message: `Instance ID ${params.instanceId} not found`
      },
      metadata
    };
  }

  // Get personal tasks
  const personalData = await initializePersonalTasks(params.instanceId, prefs.name);
  const personalTasks = [];

  for (const [listName, list] of Object.entries(personalData.lists || {})) {
    for (const task of list.tasks || []) {
      personalTasks.push({
        ...task,
        list: listName
      });
    }
  }

  // Get project tasks (if instance is on a project)
  let projectTasks = [];
  if (prefs.project) {
    const projectData = await readJSON(getProjectTaskFile(prefs.project));
    if (projectData && projectData.tasks) {
      // Filter to unclaimed or assigned to this instance
      projectTasks = projectData.tasks
        .filter(t => !t.assigned_to || t.assigned_to === params.instanceId)
        .map(t => ({
          taskId: t.id,
          title: t.title,
          status: t.status,
          priority: t.priority,
          assignee: t.assigned_to
        }));
    }
  }

  return {
    success: true,
    personalTasks: personalTasks.map(t => ({
      taskId: t.id,
      title: t.title,
      priority: t.priority || 'medium',
      list: t.list
    })),
    projectTasks,
    project: prefs.project || null,
    metadata
  };
}

/**
 * @hacs-endpoint
 * @template-version 1.0.0
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │ GET_NEXT_TASK                                                           │
 * │ Get the next recommended task for a project                             │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * @tool get_next_task
 * @version 2.0.0
 * @since 2025-12-06
 * @category tasks
 * @status stable
 *
 * ───────────────────────────────────────────────────────────────────────────
 * DESCRIPTION
 * ───────────────────────────────────────────────────────────────────────────
 * @description
 * Returns the highest priority unclaimed task from a project, optionally
 * filtered by keyword or priority level. Tasks are sorted by priority
 * (critical > high > medium > low) then by creation date (oldest first).
 *
 * Use this endpoint when you want to pick up the next most important piece
 * of work. After getting a task, use claimTask to assign it to yourself.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * PARAMETERS
 * ───────────────────────────────────────────────────────────────────────────
 * @param {string} instanceId - Unique identifier for the instance [required]
 *   @source Your instanceId is returned from bootstrap response, or can be
 *           recovered via lookup_identity using your fingerprint.
 *
 * @param {string} project - Project ID to get tasks from [optional]
 *   @source Defaults to your current project from preferences. Override to
 *           query a different project. Get project IDs from getProjects.
 *   @default Instance's current project
 *
 * @param {string} keyword - Filter by keyword in title/description [optional]
 *   @source Use any search term relevant to your skills or interest area
 *           (e.g., "auth", "API", "test", "refactor").
 *
 * @param {string} priority - Filter by priority level [optional]
 *   @source Use when you want tasks of a specific priority only.
 *   @enum critical|high|medium|low
 *
 * ───────────────────────────────────────────────────────────────────────────
 * RETURNS
 * ───────────────────────────────────────────────────────────────────────────
 * @returns {object} GetNextTaskResponse
 * @returns {boolean} .success - Whether the call succeeded
 * @returns {object|null} .task - The recommended task, or null if none available
 * @returns {string} .task.taskId - Task identifier
 * @returns {string} .task.title - Task title
 * @returns {string} .task.description - Full task description
 * @returns {string} .task.priority - Priority level (critical|high|medium|low)
 * @returns {string} .task.status - Task status (always "pending" for unclaimed)
 * @returns {string} .task.created - ISO timestamp of task creation
 * @returns {array} .task.tags - Task tags from metadata
 * @returns {string} .project - Project ID queried
 * @returns {number} .remainingTasks - Count of other matching unclaimed tasks
 * @returns {string} .message - Human-readable status message (when no task)
 * @returns {object} .filters - Applied filters (keyword, priority)
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
 * @error MISSING_PARAMETER - instanceId parameter not provided
 *   @recover Include instanceId in your request.
 *
 * @error INVALID_INSTANCE_ID - No instance found with the provided ID
 *   @recover Verify the instanceId is correct (format: Name-xxxx).
 *
 * @error NO_PROJECT - No project specified and instance has no current project
 *   @recover Either provide a project parameter, or join a project first
 *            using joinProject.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * EXAMPLES
 * ───────────────────────────────────────────────────────────────────────────
 * @example Get next task from current project
 * { "instanceId": "Phoenix-k3m7" }
 *
 * @example Get next high-priority auth-related task
 * {
 *   "instanceId": "Phoenix-k3m7",
 *   "keyword": "auth",
 *   "priority": "high"
 * }
 *
 * @example Get next task from a specific project
 * {
 *   "instanceId": "Phoenix-k3m7",
 *   "project": "coordination-v2"
 * }
 *
 * ───────────────────────────────────────────────────────────────────────────
 * RELATED
 * ───────────────────────────────────────────────────────────────────────────
 * @see getMyTasks - Get all your tasks (personal + project)
 * @see claimTask - Claim the task after selecting it
 * @see readTask - Get full details of a specific task
 *
 * ───────────────────────────────────────────────────────────────────────────
 * NOTES
 * ───────────────────────────────────────────────────────────────────────────
 * @note Only returns unclaimed tasks (assigned_to is null)
 * @note Priority order: critical (0) > high (1) > medium (2) > low (3)
 * @note Ties in priority are broken by creation date (oldest first)
 */
export async function getNextTask(params) {
  const metadata = {
    timestamp: new Date().toISOString(),
    function: 'getNextTask'
  };

  if (!params.instanceId) {
    return {
      success: false,
      error: {
        code: 'MISSING_PARAMETER',
        message: 'instanceId is required'
      },
      metadata
    };
  }

  const prefs = await readPreferences(params.instanceId);
  if (!prefs) {
    return {
      success: false,
      error: {
        code: 'INVALID_INSTANCE_ID',
        message: `Instance ID ${params.instanceId} not found`
      },
      metadata
    };
  }

  const projectId = params.project || prefs.project;
  if (!projectId) {
    return {
      success: false,
      error: {
        code: 'NO_PROJECT',
        message: 'No project specified and instance has no current project'
      },
      metadata
    };
  }

  const projectData = await readJSON(getProjectTaskFile(projectId));
  if (!projectData || !projectData.tasks) {
    return {
      success: true,
      task: null,
      message: 'No tasks found for project',
      project: projectId,
      metadata
    };
  }

  // Filter tasks
  let candidates = projectData.tasks.filter(t =>
    t.status === 'pending' && !t.assigned_to
  );

  // Apply keyword filter
  if (params.keyword) {
    const keyword = params.keyword.toLowerCase();
    candidates = candidates.filter(t =>
      t.title.toLowerCase().includes(keyword) ||
      (t.description && t.description.toLowerCase().includes(keyword))
    );
  }

  // Apply priority filter
  if (params.priority) {
    candidates = candidates.filter(t => t.priority === params.priority);
  }

  if (candidates.length === 0) {
    return {
      success: true,
      task: null,
      message: 'No matching tasks available',
      project: projectId,
      filters: { keyword: params.keyword, priority: params.priority },
      metadata
    };
  }

  // Sort by priority (critical > high > medium > low), then by created date
  const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
  candidates.sort((a, b) => {
    const pDiff = (priorityOrder[a.priority] || 2) - (priorityOrder[b.priority] || 2);
    if (pDiff !== 0) return pDiff;
    return new Date(a.created) - new Date(b.created);
  });

  const nextTask = candidates[0];

  return {
    success: true,
    task: {
      taskId: nextTask.id,
      title: nextTask.title,
      description: nextTask.description,
      priority: nextTask.priority,
      status: nextTask.status,
      created: nextTask.created,
      tags: nextTask.metadata?.tags || []
    },
    project: projectId,
    remainingTasks: candidates.length - 1,
    metadata
  };
}

/**
 * @hacs-endpoint
 * @template-version 1.0.0
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │ ADD_PERSONAL_TASK                                                       │
 * │ Add a task to a personal list                                           │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * @tool add_personal_task
 * @version 2.0.0
 * @since 2025-12-06
 * @category tasks
 * @status stable
 *
 * ───────────────────────────────────────────────────────────────────────────
 * DESCRIPTION
 * ───────────────────────────────────────────────────────────────────────────
 * @description
 * Creates a new personal task and adds it to the specified list (or the
 * default list). Personal tasks are private to the instance and are not
 * visible to other instances unless explicitly shared.
 *
 * Use this for tracking personal action items, reminders, or work that
 * isn't part of a formal project. Personal tasks persist across resurrection.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * PARAMETERS
 * ───────────────────────────────────────────────────────────────────────────
 * @param {string} instanceId - Unique identifier for the instance [required]
 *   @source Your instanceId is returned from bootstrap response.
 *
 * @param {string} title - Task title [required]
 *   @source Provide a concise, actionable description of what needs to be done.
 *
 * @param {string} description - Detailed task description [optional]
 *   @source Provide additional context, acceptance criteria, or notes.
 *
 * @param {string} priority - Priority level [optional]
 *   @source Set based on urgency and importance.
 *   @default medium
 *   @enum critical|high|medium|low
 *
 * @param {string} list - List name to add the task to [optional]
 *   @source Get available lists from getPersonalLists. Create new lists
 *           with createPersonalList.
 *   @default default
 *
 * ───────────────────────────────────────────────────────────────────────────
 * RETURNS
 * ───────────────────────────────────────────────────────────────────────────
 * @returns {object} AddPersonalTaskResponse
 * @returns {boolean} .success - Whether the call succeeded
 * @returns {object} .task - The created task
 * @returns {string} .task.id - Task identifier (format: ptask-{timestamp}-{random})
 * @returns {string} .task.title - Task title
 * @returns {string|null} .task.description - Task description
 * @returns {string} .task.priority - Priority level
 * @returns {string} .task.status - Task status (always "pending" for new tasks)
 * @returns {string} .task.created - ISO timestamp of creation
 * @returns {string} .task.updated - ISO timestamp of last update
 * @returns {string} .task.list - List the task was added to
 * @returns {string} .message - Confirmation message
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
 * @error MISSING_PARAMETER - instanceId or title not provided
 *   @recover Include both instanceId and title in your request.
 *
 * @error INVALID_INSTANCE_ID - No instance found with the provided ID
 *   @recover Verify the instanceId is correct (format: Name-xxxx).
 *
 * ───────────────────────────────────────────────────────────────────────────
 * EXAMPLES
 * ───────────────────────────────────────────────────────────────────────────
 * @example Add a simple task to default list
 * {
 *   "instanceId": "Phoenix-k3m7",
 *   "title": "Review V2 API spec"
 * }
 *
 * @example Add a high-priority task to a specific list
 * {
 *   "instanceId": "Phoenix-k3m7",
 *   "title": "Prepare demo for standup",
 *   "description": "Show the new bootstrap flow with screenshots",
 *   "priority": "high",
 *   "list": "meetings"
 * }
 *
 * ───────────────────────────────────────────────────────────────────────────
 * RELATED
 * ───────────────────────────────────────────────────────────────────────────
 * @see getMyTasks - Get all your personal and project tasks
 * @see completePersonalTask - Mark a personal task as complete
 * @see createPersonalList - Create a new list for organizing tasks
 * @see getPersonalLists - Get all your lists
 *
 * ───────────────────────────────────────────────────────────────────────────
 * NOTES
 * ───────────────────────────────────────────────────────────────────────────
 * @note If the specified list doesn't exist, it will be created automatically
 * @note Personal tasks persist across resurrection (successor inherits)
 * @note Invalid priority values default to 'medium'
 */
export async function addPersonalTask(params) {
  const metadata = {
    timestamp: new Date().toISOString(),
    function: 'addPersonalTask'
  };

  if (!params.instanceId) {
    return {
      success: false,
      error: {
        code: 'MISSING_PARAMETER',
        message: 'instanceId is required'
      },
      metadata
    };
  }

  if (!params.title) {
    return {
      success: false,
      error: {
        code: 'MISSING_PARAMETER',
        message: 'title is required'
      },
      metadata
    };
  }

  const prefs = await readPreferences(params.instanceId);
  if (!prefs) {
    return {
      success: false,
      error: {
        code: 'INVALID_INSTANCE_ID',
        message: `Instance ID ${params.instanceId} not found`
      },
      metadata
    };
  }

  const listName = params.list || 'default';
  const taskData = await initializePersonalTasks(params.instanceId, prefs.name);

  // Ensure list exists
  if (!taskData.lists[listName]) {
    taskData.lists[listName] = {
      name: listName,
      tasks: []
    };
  }

  const now = new Date().toISOString();
  const newTask = {
    id: `ptask-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
    title: params.title,
    description: params.description || null,
    priority: ['critical', 'high', 'medium', 'low'].includes(params.priority) ? params.priority : 'medium',
    status: 'pending',
    created: now,
    updated: now
  };

  taskData.lists[listName].tasks.push(newTask);
  taskData.last_updated = now;

  await writeJSON(getPersonalTaskFile(params.instanceId), taskData);

  return {
    success: true,
    task: {
      ...newTask,
      list: listName
    },
    message: `Task added to list '${listName}'`,
    metadata
  };
}

/**
 * @hacs-endpoint
 * @template-version 1.0.0
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │ COMPLETE_PERSONAL_TASK                                                  │
 * │ Mark a personal task as complete                                        │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * @tool complete_personal_task
 * @version 2.0.0
 * @since 2025-12-06
 * @category tasks
 * @status stable
 *
 * ───────────────────────────────────────────────────────────────────────────
 * DESCRIPTION
 * ───────────────────────────────────────────────────────────────────────────
 * @description
 * Marks a personal task as completed. The task remains in the list with
 * status "completed" and a completion timestamp for historical reference.
 *
 * Use this when you've finished a personal task. Completed tasks still
 * appear in getMyTasks but are marked as complete.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * PARAMETERS
 * ───────────────────────────────────────────────────────────────────────────
 * @param {string} instanceId - Unique identifier for the instance [required]
 *   @source Your instanceId is returned from bootstrap response.
 *
 * @param {string} taskId - ID of the task to complete [required]
 *   @source Get task IDs from getMyTasks response (personalTasks[].taskId).
 *
 * ───────────────────────────────────────────────────────────────────────────
 * RETURNS
 * ───────────────────────────────────────────────────────────────────────────
 * @returns {object} CompletePersonalTaskResponse
 * @returns {boolean} .success - Whether the call succeeded
 * @returns {object} .task - The completed task
 * @returns {string} .task.id - Task identifier
 * @returns {string} .task.title - Task title
 * @returns {string} .task.status - Task status (now "completed")
 * @returns {string} .task.completed_at - ISO timestamp of completion
 * @returns {string} .task.updated - ISO timestamp of last update
 * @returns {string} .task.list - List the task belongs to
 * @returns {string} .message - Confirmation message
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
 * @error MISSING_PARAMETER - instanceId or taskId not provided
 *   @recover Include both instanceId and taskId in your request.
 *
 * @error INVALID_INSTANCE_ID - No instance found with the provided ID
 *   @recover Verify the instanceId is correct (format: Name-xxxx).
 *
 * @error NO_TASKS - No personal tasks found for this instance
 *   @recover You have no personal tasks. Use addPersonalTask to create one.
 *
 * @error TASK_NOT_FOUND - Task with the given ID not found
 *   @recover Verify the taskId is correct. Use getMyTasks to see your tasks.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * EXAMPLES
 * ───────────────────────────────────────────────────────────────────────────
 * @example Complete a task
 * {
 *   "instanceId": "Phoenix-k3m7",
 *   "taskId": "ptask-1702300000000-abc1"
 * }
 *
 * ───────────────────────────────────────────────────────────────────────────
 * RELATED
 * ───────────────────────────────────────────────────────────────────────────
 * @see getMyTasks - Get all your personal tasks to find task IDs
 * @see addPersonalTask - Add a new personal task
 *
 * ───────────────────────────────────────────────────────────────────────────
 * NOTES
 * ───────────────────────────────────────────────────────────────────────────
 * @note Completed tasks remain in the list for historical reference
 * @note The task's completed_at timestamp is set to the current time
 */
export async function completePersonalTask(params) {
  const metadata = {
    timestamp: new Date().toISOString(),
    function: 'completePersonalTask'
  };

  if (!params.instanceId || !params.taskId) {
    return {
      success: false,
      error: {
        code: 'MISSING_PARAMETER',
        message: 'instanceId and taskId are required'
      },
      metadata
    };
  }

  const prefs = await readPreferences(params.instanceId);
  if (!prefs) {
    return {
      success: false,
      error: {
        code: 'INVALID_INSTANCE_ID',
        message: `Instance ID ${params.instanceId} not found`
      },
      metadata
    };
  }

  const taskFile = getPersonalTaskFile(params.instanceId);
  const taskData = await readJSON(taskFile);

  if (!taskData) {
    return {
      success: false,
      error: {
        code: 'NO_TASKS',
        message: 'No personal tasks found'
      },
      metadata
    };
  }

  // Find and update the task
  for (const [listName, list] of Object.entries(taskData.lists || {})) {
    const taskIndex = list.tasks.findIndex(t => t.id === params.taskId);
    if (taskIndex !== -1) {
      const now = new Date().toISOString();
      list.tasks[taskIndex].status = 'completed';
      list.tasks[taskIndex].completed_at = now;
      list.tasks[taskIndex].updated = now;
      taskData.last_updated = now;

      await writeJSON(taskFile, taskData);

      return {
        success: true,
        task: {
          ...list.tasks[taskIndex],
          list: listName
        },
        message: 'Task completed',
        metadata
      };
    }
  }

  return {
    success: false,
    error: {
      code: 'TASK_NOT_FOUND',
      message: `Task ${params.taskId} not found`
    },
    metadata
  };
}

/**
 * @hacs-endpoint
 * @template-version 1.0.0
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │ CREATE_PERSONAL_LIST                                                    │
 * │ Create a new personal task list                                         │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * @tool create_personal_list
 * @version 2.0.0
 * @since 2025-12-06
 * @category tasks
 * @status stable
 *
 * ───────────────────────────────────────────────────────────────────────────
 * DESCRIPTION
 * ───────────────────────────────────────────────────────────────────────────
 * @description
 * Creates a new personal task list for organizing tasks. Each list has a
 * display name and a key (lowercase, hyphenated version of the name).
 *
 * Use this to organize tasks by category, project, or any other grouping
 * that makes sense for your workflow.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * PARAMETERS
 * ───────────────────────────────────────────────────────────────────────────
 * @param {string} instanceId - Unique identifier for the instance [required]
 *   @source Your instanceId is returned from bootstrap response.
 *
 * @param {string} listName - Display name for the new list [required]
 *   @source Choose a descriptive name for the list (e.g., "Meeting Follow-ups",
 *           "Learning Goals", "Project Ideas").
 *
 * ───────────────────────────────────────────────────────────────────────────
 * RETURNS
 * ───────────────────────────────────────────────────────────────────────────
 * @returns {object} CreatePersonalListResponse
 * @returns {boolean} .success - Whether the call succeeded
 * @returns {object} .list - The created list
 * @returns {string} .list.key - List key (lowercase, hyphenated)
 * @returns {string} .list.name - List display name
 * @returns {string} .message - Confirmation message
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
 * @error MISSING_PARAMETER - instanceId or listName not provided
 *   @recover Include both instanceId and listName in your request.
 *
 * @error INVALID_INSTANCE_ID - No instance found with the provided ID
 *   @recover Verify the instanceId is correct (format: Name-xxxx).
 *
 * @error LIST_EXISTS - A list with this name already exists
 *   @recover Choose a different name, or use the existing list.
 *            Use getPersonalLists to see existing lists.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * EXAMPLES
 * ───────────────────────────────────────────────────────────────────────────
 * @example Create a new list
 * {
 *   "instanceId": "Phoenix-k3m7",
 *   "listName": "Meeting Follow-ups"
 * }
 *
 * ───────────────────────────────────────────────────────────────────────────
 * RELATED
 * ───────────────────────────────────────────────────────────────────────────
 * @see getPersonalLists - Get all your lists
 * @see addPersonalTask - Add a task to a list
 *
 * ───────────────────────────────────────────────────────────────────────────
 * NOTES
 * ───────────────────────────────────────────────────────────────────────────
 * @note List key is auto-generated: "Meeting Follow-ups" becomes "meeting-follow-ups"
 * @note A "default" list is auto-created if no lists exist
 */
export async function createPersonalList(params) {
  const metadata = {
    timestamp: new Date().toISOString(),
    function: 'createPersonalList'
  };

  if (!params.instanceId || !params.listName) {
    return {
      success: false,
      error: {
        code: 'MISSING_PARAMETER',
        message: 'instanceId and listName are required'
      },
      metadata
    };
  }

  const prefs = await readPreferences(params.instanceId);
  if (!prefs) {
    return {
      success: false,
      error: {
        code: 'INVALID_INSTANCE_ID',
        message: `Instance ID ${params.instanceId} not found`
      },
      metadata
    };
  }

  const taskData = await initializePersonalTasks(params.instanceId, prefs.name);
  const listKey = params.listName.toLowerCase().replace(/\s+/g, '-');

  if (taskData.lists[listKey]) {
    return {
      success: false,
      error: {
        code: 'LIST_EXISTS',
        message: `List '${params.listName}' already exists`
      },
      metadata
    };
  }

  taskData.lists[listKey] = {
    name: params.listName,
    tasks: [],
    created: new Date().toISOString()
  };
  taskData.last_updated = new Date().toISOString();

  await writeJSON(getPersonalTaskFile(params.instanceId), taskData);

  return {
    success: true,
    list: {
      key: listKey,
      name: params.listName
    },
    message: `List '${params.listName}' created`,
    metadata
  };
}

/**
 * @hacs-endpoint
 * @template-version 1.0.0
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │ GET_PERSONAL_LISTS                                                      │
 * │ Get all personal task lists                                             │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * @tool get_personal_lists
 * @version 2.0.0
 * @since 2025-12-06
 * @category tasks
 * @status stable
 *
 * ───────────────────────────────────────────────────────────────────────────
 * DESCRIPTION
 * ───────────────────────────────────────────────────────────────────────────
 * @description
 * Returns all personal task lists for this instance with summary counts.
 * Does not include the actual tasks - use getMyTasks for that.
 *
 * Use this to see what lists you have and their task counts.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * PARAMETERS
 * ───────────────────────────────────────────────────────────────────────────
 * @param {string} instanceId - Unique identifier for the instance [required]
 *   @source Your instanceId is returned from bootstrap response.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * RETURNS
 * ───────────────────────────────────────────────────────────────────────────
 * @returns {object} GetPersonalListsResponse
 * @returns {boolean} .success - Whether the call succeeded
 * @returns {array} .lists - Array of list summaries
 * @returns {string} .lists[].key - List key (used in addPersonalTask)
 * @returns {string} .lists[].name - List display name
 * @returns {number} .lists[].taskCount - Total tasks in this list
 * @returns {number} .lists[].pendingCount - Pending (incomplete) tasks
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
 * @error MISSING_PARAMETER - instanceId not provided
 *   @recover Include instanceId in your request.
 *
 * @error INVALID_INSTANCE_ID - No instance found with the provided ID
 *   @recover Verify the instanceId is correct (format: Name-xxxx).
 *
 * ───────────────────────────────────────────────────────────────────────────
 * EXAMPLES
 * ───────────────────────────────────────────────────────────────────────────
 * @example Get all lists
 * { "instanceId": "Phoenix-k3m7" }
 *
 * ───────────────────────────────────────────────────────────────────────────
 * RELATED
 * ───────────────────────────────────────────────────────────────────────────
 * @see createPersonalList - Create a new list
 * @see addPersonalTask - Add a task to a list
 * @see getMyTasks - Get all tasks including list details
 *
 * ───────────────────────────────────────────────────────────────────────────
 * NOTES
 * ───────────────────────────────────────────────────────────────────────────
 * @note A "default" list is auto-created if no lists exist
 * @note Use the list key (not name) when adding tasks
 */
export async function getPersonalLists(params) {
  const metadata = {
    timestamp: new Date().toISOString(),
    function: 'getPersonalLists'
  };

  if (!params.instanceId) {
    return {
      success: false,
      error: {
        code: 'MISSING_PARAMETER',
        message: 'instanceId is required'
      },
      metadata
    };
  }

  const prefs = await readPreferences(params.instanceId);
  if (!prefs) {
    return {
      success: false,
      error: {
        code: 'INVALID_INSTANCE_ID',
        message: `Instance ID ${params.instanceId} not found`
      },
      metadata
    };
  }

  const taskData = await initializePersonalTasks(params.instanceId, prefs.name);

  const lists = Object.entries(taskData.lists || {}).map(([key, list]) => ({
    key,
    name: list.name,
    taskCount: (list.tasks || []).length,
    pendingCount: (list.tasks || []).filter(t => t.status === 'pending').length
  }));

  return {
    success: true,
    lists,
    metadata
  };
}

/**
 * @hacs-endpoint
 * @template-version 1.0.0
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │ ASSIGN_TASK_TO_INSTANCE                                                 │
 * │ Assign a project task to a specific instance                            │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * @tool assign_task_to_instance
 * @version 2.0.0
 * @since 2025-12-11
 * @category tasks
 * @status stable
 *
 * ───────────────────────────────────────────────────────────────────────────
 * DESCRIPTION
 * ───────────────────────────────────────────────────────────────────────────
 * @description
 * Assigns a project task to a specific instance and sends an XMPP notification
 * to the assignee. The task is updated with assignment metadata including
 * who assigned it and when.
 *
 * Use this to delegate work to team members. The assignee will receive a
 * message notification with task details and any optional message you include.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * PARAMETERS
 * ───────────────────────────────────────────────────────────────────────────
 * @param {string} instanceId - Caller's instance ID (for auth and "from") [required]
 *   @source Your instanceId is returned from bootstrap response.
 *
 * @param {string} taskId - Task ID to assign [required]
 *   @source Get task IDs from getMyTasks or getNextTask. Format: task-{number}.
 *
 * @param {string} assigneeInstanceId - Instance to assign the task to [required]
 *   @source Get instance IDs from get_all_instances or project team list.
 *           Format: Name-xxxx.
 *
 * @param {string} projectId - Project containing the task [optional]
 *   @source Defaults to caller's current project. Override if assigning
 *           a task from a different project.
 *   @default Caller's current project
 *
 * @param {string} message - Message to include in notification [optional]
 *   @source Provide context, instructions, or priority notes for the assignee.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * RETURNS
 * ───────────────────────────────────────────────────────────────────────────
 * @returns {object} AssignTaskToInstanceResponse
 * @returns {boolean} .success - Whether the call succeeded
 * @returns {object} .task - The updated task
 * @returns {string} .task.taskId - Task identifier
 * @returns {string} .task.title - Task title
 * @returns {string} .task.priority - Task priority
 * @returns {string} .task.status - Task status
 * @returns {string} .task.assignedTo - New assignee instance ID
 * @returns {string} .task.assignedBy - Who assigned the task (caller)
 * @returns {string} .task.assignedAt - ISO timestamp of assignment
 * @returns {string|null} .previousAssignee - Previous assignee if reassigning
 * @returns {string} .project - Project ID
 * @returns {object} .notification - Notification status
 * @returns {boolean} .notification.sent - Whether notification was sent
 * @returns {string|null} .notification.error - Error message if send failed
 * @returns {string} .message - Human-readable result message
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
 * @error MISSING_PARAMETER - instanceId, taskId, or assigneeInstanceId not provided
 *   @recover Include all three required parameters in your request.
 *
 * @error INVALID_INSTANCE_ID - Caller's instance not found
 *   @recover Verify your instanceId is correct (format: Name-xxxx).
 *
 * @error INVALID_ASSIGNEE - Assignee instance not found
 *   @recover Verify the assigneeInstanceId exists. Use get_all_instances
 *            to find valid instance IDs.
 *
 * @error NO_PROJECT - No project specified and caller has no current project
 *   @recover Either provide a projectId parameter, or join a project first.
 *
 * @error NO_TASKS - No tasks found for the project
 *   @recover Verify the project has tasks. Use createTask to add tasks.
 *
 * @error TASK_NOT_FOUND - Task not found in the project
 *   @recover Verify the taskId is correct for this project.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * EXAMPLES
 * ───────────────────────────────────────────────────────────────────────────
 * @example Basic assignment
 * {
 *   "instanceId": "PM-x3k9",
 *   "taskId": "task-123",
 *   "assigneeInstanceId": "Developer-abc1"
 * }
 *
 * @example Assignment with message and specific project
 * {
 *   "instanceId": "PM-x3k9",
 *   "taskId": "task-123",
 *   "assigneeInstanceId": "Developer-abc1",
 *   "projectId": "coordination-v2",
 *   "message": "Priority task - please complete by EOD. Ping me if you have questions."
 * }
 *
 * ───────────────────────────────────────────────────────────────────────────
 * RELATED
 * ───────────────────────────────────────────────────────────────────────────
 * @see getNextTask - Find unclaimed tasks to assign
 * @see get_all_instances - Find instance IDs for assignment
 * @see claimTask - Self-assign a task (alternative to being assigned)
 * @see sendMessage - Send additional messages to team members
 *
 * ───────────────────────────────────────────────────────────────────────────
 * NOTES
 * ───────────────────────────────────────────────────────────────────────────
 * @note XMPP notification may fail if messaging is down - check notification.sent
 * @note Task is still assigned even if notification fails
 * @note Critical priority tasks send high-priority notifications
 * @note Reassignment updates previousAssignee but doesn't notify them
 */
export async function assignTaskToInstance(params) {
  const metadata = {
    timestamp: new Date().toISOString(),
    function: 'assignTaskToInstance'
  };

  // Validate required params
  if (!params.instanceId) {
    return {
      success: false,
      error: {
        code: 'MISSING_PARAMETER',
        message: 'instanceId is required (caller ID)'
      },
      metadata
    };
  }

  if (!params.taskId) {
    return {
      success: false,
      error: {
        code: 'MISSING_PARAMETER',
        message: 'taskId is required'
      },
      metadata
    };
  }

  if (!params.assigneeInstanceId) {
    return {
      success: false,
      error: {
        code: 'MISSING_PARAMETER',
        message: 'assigneeInstanceId is required'
      },
      metadata
    };
  }

  // Verify caller exists
  const callerPrefs = await readPreferences(params.instanceId);
  if (!callerPrefs) {
    return {
      success: false,
      error: {
        code: 'INVALID_INSTANCE_ID',
        message: `Caller instance ${params.instanceId} not found`
      },
      metadata
    };
  }

  // Verify assignee exists
  const assigneePrefs = await readPreferences(params.assigneeInstanceId);
  if (!assigneePrefs) {
    return {
      success: false,
      error: {
        code: 'INVALID_ASSIGNEE',
        message: `Assignee instance ${params.assigneeInstanceId} not found`
      },
      metadata
    };
  }

  // Determine project
  const projectId = params.projectId || callerPrefs.project;
  if (!projectId) {
    return {
      success: false,
      error: {
        code: 'NO_PROJECT',
        message: 'No project specified and caller has no current project'
      },
      metadata
    };
  }

  // Load project tasks
  const taskFile = getProjectTaskFile(projectId);
  const projectData = await readJSON(taskFile);

  if (!projectData || !projectData.tasks) {
    return {
      success: false,
      error: {
        code: 'NO_TASKS',
        message: `No tasks found for project ${projectId}`
      },
      metadata
    };
  }

  // Find the task
  const taskIndex = projectData.tasks.findIndex(t => t.id === params.taskId);
  if (taskIndex === -1) {
    return {
      success: false,
      error: {
        code: 'TASK_NOT_FOUND',
        message: `Task ${params.taskId} not found in project ${projectId}`
      },
      metadata
    };
  }

  const task = projectData.tasks[taskIndex];
  const previousAssignee = task.assigned_to;
  const now = new Date().toISOString();

  // Update the task
  projectData.tasks[taskIndex] = {
    ...task,
    assigned_to: params.assigneeInstanceId,
    assigned_by: params.instanceId,
    assigned_at: now,
    updated: now
  };
  projectData.last_updated = now;

  await writeJSON(taskFile, projectData);

  // Send notification message to assignee
  let messageSent = false;
  let messageError = null;

  try {
    const notificationSubject = `Task Assigned: ${task.title}`;
    const notificationBody = params.message
      ? `You've been assigned a task.\n\nTask ID: ${params.taskId}\nTitle: ${task.title}\nPriority: ${task.priority || 'medium'}\nProject: ${projectId}\n\nMessage from ${callerPrefs.name || params.instanceId}:\n${params.message}`
      : `You've been assigned a task.\n\nTask ID: ${params.taskId}\nTitle: ${task.title}\nPriority: ${task.priority || 'medium'}\nProject: ${projectId}`;

    const messageResult = await XMPPHandler.sendMessage({
      to: params.assigneeInstanceId,
      from: params.instanceId,
      subject: notificationSubject,
      body: notificationBody,
      priority: task.priority === 'critical' ? 'high' : 'normal'
    });

    messageSent = messageResult.success;
    if (!messageResult.success) {
      messageError = messageResult.error;
    }
  } catch (error) {
    messageError = error.message;
  }

  return {
    success: true,
    task: {
      taskId: params.taskId,
      title: task.title,
      priority: task.priority,
      status: task.status,
      assignedTo: params.assigneeInstanceId,
      assignedBy: params.instanceId,
      assignedAt: now
    },
    previousAssignee: previousAssignee || null,
    project: projectId,
    notification: {
      sent: messageSent,
      error: messageError
    },
    message: messageSent
      ? `Task assigned to ${assigneePrefs.name || params.assigneeInstanceId} and notification sent`
      : `Task assigned to ${assigneePrefs.name || params.assigneeInstanceId} (notification failed: ${messageError})`,
    metadata
  };
}
