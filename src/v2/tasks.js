/**
 * Task handler for V2 coordination system
 * Provides project tasks and personal task lists
 *
 * @module tasks
 * @author Bridge
 * @created 2025-12-06
 */

import fs from 'fs/promises';
import path from 'path';
import { DATA_ROOT, getInstanceDir, getProjectsDir } from './config.js';
import { readJSON, writeJSON, ensureDir, readPreferences } from './data.js';

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
 * Get tasks for my current context (project + personal)
 *
 * @param {Object} params - Parameters
 * @param {string} params.instanceId - Instance ID (required)
 * @returns {Promise<Object>} Result with personal and project tasks
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
 * Get the next recommended task for a project
 * Returns highest priority unclaimed task, optionally filtered by keyword
 *
 * @param {Object} params - Parameters
 * @param {string} params.instanceId - Instance ID (required)
 * @param {string} [params.project] - Project ID (defaults to instance's current project)
 * @param {string} [params.keyword] - Filter by keyword in title/description
 * @param {string} [params.priority] - Filter by priority level
 * @returns {Promise<Object>} Result with next recommended task
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
 * Add a task to a personal list
 *
 * @param {Object} params - Parameters
 * @param {string} params.instanceId - Instance ID (required)
 * @param {string} params.title - Task title (required)
 * @param {string} [params.description] - Task description
 * @param {string} [params.priority='medium'] - Priority level
 * @param {string} [params.list='default'] - List name to add to
 * @returns {Promise<Object>} Result with created task
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
 * Complete a personal task
 *
 * @param {Object} params - Parameters
 * @param {string} params.instanceId - Instance ID (required)
 * @param {string} params.taskId - Task ID to complete (required)
 * @returns {Promise<Object>} Result
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
 * Create a new personal task list
 *
 * @param {Object} params - Parameters
 * @param {string} params.instanceId - Instance ID (required)
 * @param {string} params.listName - Name for the new list (required)
 * @returns {Promise<Object>} Result
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
 * Get all personal task lists
 *
 * @param {Object} params - Parameters
 * @param {string} params.instanceId - Instance ID (required)
 * @returns {Promise<Object>} Result with lists
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
