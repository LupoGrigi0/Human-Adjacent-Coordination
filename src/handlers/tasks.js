/**
 * MCP Coordination System - Task Management Handler
 * Provides CRUD operations for task management with JSON persistence
 *
 * @author claude-code-BackendExpert-2025-08-23-1500
 */

import { promises as fs } from 'fs';
import { join, dirname } from 'path';
import { randomUUID } from 'crypto';

const DATA_DIR = 'data';
const TASKS_FILE = join(DATA_DIR, 'tasks.json');

/**
 * File system utilities with atomic operations
 */
class FileManager {
  static async readJSON(filePath) {
    try {
      const data = await fs.readFile(filePath, 'utf-8');
      return JSON.parse(data);
    } catch (error) {
      if (error.code === 'ENOENT') {
        return null; // File doesn't exist
      }
      throw error;
    }
  }

  static async writeJSON(filePath, data) {
    // Ensure directory exists
    const dir = dirname(filePath);
    await fs.mkdir(dir, { recursive: true });
    
    // Write atomically by writing to temp file then renaming
    const tempFile = `${filePath}.tmp`;
    await fs.writeFile(tempFile, JSON.stringify(data, null, 2));
    await fs.rename(tempFile, filePath);
  }

  static async ensureFile(filePath, defaultData) {
    const exists = await this.readJSON(filePath);
    if (!exists) {
      await this.writeJSON(filePath, defaultData);
      return defaultData;
    }
    return exists;
  }
}

/**
 * Task Management Functions
 */
export class TaskHandler {
  
  /**
   * Initialize tasks data file if it doesn't exist
   */
  static async initialize() {
    const defaultData = {
      schema_version: '1.0',
      created: new Date().toISOString(),
      last_updated: new Date().toISOString(),
      tasks: []
    };
    
    return await FileManager.ensureFile(TASKS_FILE, defaultData);
  }

  /**
   * Get all tasks with optional filtering
   */
  static async getTasks(params = {}) {
    try {
      await this.initialize();
      const data = await FileManager.readJSON(TASKS_FILE);
      
      let tasks = data.tasks || [];
      
      // Apply filters
      const { status, priority, project_id, assigned_to, tags } = params;
      
      if (status) {
        const statuses = Array.isArray(status) ? status : [status];
        tasks = tasks.filter(t => statuses.includes(t.status));
      }
      
      if (priority) {
        const priorities = Array.isArray(priority) ? priority : [priority];
        tasks = tasks.filter(t => priorities.includes(t.priority));
      }
      
      if (project_id) {
        tasks = tasks.filter(t => t.project_id === project_id);
      }
      
      if (assigned_to) {
        tasks = tasks.filter(t => t.assigned_to === assigned_to);
      }
      
      if (tags) {
        const filterTags = Array.isArray(tags) ? tags : [tags];
        tasks = tasks.filter(t => 
          filterTags.some(tag => t.metadata?.tags?.includes(tag))
        );
      }
      
      // Sort by priority (high, medium, low) then by created date
      const priorityOrder = { high: 3, medium: 2, low: 1 };
      tasks.sort((a, b) => {
        const priorityDiff = (priorityOrder[b.priority] || 0) - (priorityOrder[a.priority] || 0);
        if (priorityDiff !== 0) return priorityDiff;
        return new Date(b.created) - new Date(a.created);
      });
      
      return {
        success: true,
        tasks,
        total: tasks.length,
        metadata: {
          schema_version: data.schema_version,
          last_updated: data.last_updated
        }
      };
      
    } catch (error) {
      return {
        success: false,
        error: {
          message: 'Failed to get tasks',
          details: error.message
        }
      };
    }
  }

  /**
   * Get specific task by ID
   */
  static async getTask(params) {
    try {
      const { id } = params;
      
      if (!id) {
        return {
          success: false,
          error: { message: 'Task ID is required' }
        };
      }
      
      await this.initialize();
      const data = await FileManager.readJSON(TASKS_FILE);
      
      const task = data.tasks?.find(t => t.id === id);
      
      if (!task) {
        return {
          success: false,
          error: { message: `Task '${id}' not found` }
        };
      }
      
      return {
        success: true,
        task
      };
      
    } catch (error) {
      return {
        success: false,
        error: {
          message: 'Failed to get task',
          details: error.message
        }
      };
    }
  }

  /**
   * Create a new task
   */
  static async createTask(params) {
    try {
      const { 
        title, 
        description, 
        priority = 'medium', 
        project_id = null,
        tags = [], 
        metadata = {},
        effort_estimate = null
      } = params;
      
      if (!title || !description) {
        return {
          success: false,
          error: { message: 'Title and description are required' }
        };
      }
      
      await this.initialize();
      const data = await FileManager.readJSON(TASKS_FILE);
      
      // Generate simple incremental ID
      const existingTasks = data.tasks || [];
      const maxId = existingTasks.reduce((max, task) => {
        const num = parseInt(task.id.replace('task-', ''), 10);
        return isNaN(num) ? max : Math.max(max, num);
      }, 0);
      const id = `task-${maxId + 1}`;
      
      const now = new Date().toISOString();
      const task = {
        id,
        title,
        description,
        status: 'pending',
        priority: ['high', 'medium', 'low'].includes(priority) ? priority : 'medium',
        project_id,
        assigned_to: null,
        created: now,
        updated: now,
        metadata: {
          tags: Array.isArray(tags) ? tags : [],
          effort_estimate,
          dependencies: [],
          ...metadata
        }
      };
      
      data.tasks = data.tasks || [];
      data.tasks.push(task);
      data.last_updated = now;
      
      await FileManager.writeJSON(TASKS_FILE, data);
      
      return {
        success: true,
        task,
        message: `Task '${title}' created successfully`
      };
      
    } catch (error) {
      return {
        success: false,
        error: {
          message: 'Failed to create task',
          details: error.message
        }
      };
    }
  }

  /**
   * Claim a task (assign to an instance)
   */
  static async claimTask(params) {
    try {
      const { id, instanceId } = params;
      
      if (!id || !instanceId) {
        return {
          success: false,
          error: { message: 'Task ID and instance ID are required' }
        };
      }
      
      await this.initialize();
      const data = await FileManager.readJSON(TASKS_FILE);
      
      const taskIndex = data.tasks?.findIndex(t => t.id === id);
      
      if (taskIndex === -1) {
        return {
          success: false,
          error: { message: `Task '${id}' not found` }
        };
      }
      
      const task = data.tasks[taskIndex];
      
      // Check if task is already claimed
      if (task.assigned_to && task.status === 'in-progress') {
        return {
          success: false,
          error: { 
            message: `Task '${id}' is already claimed by '${task.assigned_to}'`,
            assigned_to: task.assigned_to
          }
        };
      }
      
      // Claim the task
      const now = new Date().toISOString();
      task.assigned_to = instanceId;
      task.status = 'in-progress';
      task.updated = now;
      task.claimed_at = now;
      
      data.last_updated = now;
      
      await FileManager.writeJSON(TASKS_FILE, data);
      
      return {
        success: true,
        task,
        message: `Task '${id}' claimed by '${instanceId}'`
      };
      
    } catch (error) {
      return {
        success: false,
        error: {
          message: 'Failed to claim task',
          details: error.message
        }
      };
    }
  }

  /**
   * Update task status and other properties
   */
  static async updateTask(params) {
    try {
      const { id, updates } = params;
      
      if (!id) {
        return {
          success: false,
          error: { message: 'Task ID is required' }
        };
      }
      
      if (!updates || typeof updates !== 'object') {
        return {
          success: false,
          error: { message: 'Updates object is required' }
        };
      }
      
      await this.initialize();
      const data = await FileManager.readJSON(TASKS_FILE);
      
      const taskIndex = data.tasks?.findIndex(t => t.id === id);
      
      if (taskIndex === -1) {
        return {
          success: false,
          error: { message: `Task '${id}' not found` }
        };
      }
      
      const task = data.tasks[taskIndex];
      const now = new Date().toISOString();
      
      // Apply updates
      const allowedUpdates = ['title', 'description', 'status', 'priority', 'project_id', 'assigned_to', 'metadata'];
      const updatedTask = { ...task };
      
      for (const [key, value] of Object.entries(updates)) {
        if (allowedUpdates.includes(key)) {
          if (key === 'metadata' && typeof value === 'object') {
            updatedTask.metadata = { ...task.metadata, ...value };
          } else {
            updatedTask[key] = value;
          }
        }
      }
      
      // Add completion timestamp if status changed to completed
      if (updates.status === 'completed' && task.status !== 'completed') {
        updatedTask.completed = now;
      }
      
      updatedTask.updated = now;
      
      data.tasks[taskIndex] = updatedTask;
      data.last_updated = now;
      
      await FileManager.writeJSON(TASKS_FILE, data);
      
      return {
        success: true,
        task: updatedTask,
        message: `Task '${id}' updated successfully`
      };
      
    } catch (error) {
      return {
        success: false,
        error: {
          message: 'Failed to update task',
          details: error.message
        }
      };
    }
  }

  /**
   * Get pending tasks available for claiming
   */
  static async getPendingTasks(params = {}) {
    try {
      const { role, capabilities = [] } = params;
      
      // Get all pending tasks
      const result = await this.getTasks({ status: 'pending' });
      
      if (!result.success) {
        return result;
      }
      
      let tasks = result.tasks;
      
      // Role-based filtering (if specified)
      if (role) {
        // This could be enhanced with role-specific task filtering logic
        // For now, all roles can see all pending tasks
      }
      
      return {
        success: true,
        tasks,
        total: tasks.length,
        role,
        timestamp: new Date().toISOString()
      };
      
    } catch (error) {
      return {
        success: false,
        error: {
          message: 'Failed to get pending tasks',
          details: error.message
        }
      };
    }
  }

  /**
   * Get task statistics
   */
  static async getTaskStats(params = {}) {
    try {
      await this.initialize();
      const data = await FileManager.readJSON(TASKS_FILE);
      
      const tasks = data.tasks || [];
      
      const stats = {
        total: tasks.length,
        pending: tasks.filter(t => t.status === 'pending').length,
        in_progress: tasks.filter(t => t.status === 'in-progress').length,
        completed: tasks.filter(t => t.status === 'completed').length,
        archived: tasks.filter(t => t.status === 'archived').length,
        by_priority: {
          high: tasks.filter(t => t.priority === 'high').length,
          medium: tasks.filter(t => t.priority === 'medium').length,
          low: tasks.filter(t => t.priority === 'low').length
        },
        by_project: {}
      };
      
      // Calculate stats by project
      tasks.forEach(task => {
        if (task.project_id) {
          if (!stats.by_project[task.project_id]) {
            stats.by_project[task.project_id] = 0;
          }
          stats.by_project[task.project_id]++;
        }
      });
      
      return {
        success: true,
        stats,
        timestamp: new Date().toISOString()
      };
      
    } catch (error) {
      return {
        success: false,
        error: {
          message: 'Failed to get task statistics',
          details: error.message
        }
      };
    }
  }

  /**
   * Delete a task (soft delete by changing status to 'archived')
   */
  static async deleteTask(params) {
    try {
      const { id, hard_delete = false } = params;
      
      if (!id) {
        return {
          success: false,
          error: { message: 'Task ID is required' }
        };
      }
      
      await this.initialize();
      const data = await FileManager.readJSON(TASKS_FILE);
      
      const taskIndex = data.tasks?.findIndex(t => t.id === id);
      
      if (taskIndex === -1) {
        return {
          success: false,
          error: { message: `Task '${id}' not found` }
        };
      }
      
      if (hard_delete) {
        // Actually remove from array
        const removed = data.tasks.splice(taskIndex, 1)[0];
        data.last_updated = new Date().toISOString();
        
        await FileManager.writeJSON(TASKS_FILE, data);
        
        return {
          success: true,
          message: `Task '${id}' permanently deleted`,
          task: removed
        };
      } else {
        // Soft delete - change status to archived
        data.tasks[taskIndex].status = 'archived';
        data.tasks[taskIndex].updated = new Date().toISOString();
        data.last_updated = new Date().toISOString();
        
        await FileManager.writeJSON(TASKS_FILE, data);
        
        return {
          success: true,
          message: `Task '${id}' archived`,
          task: data.tasks[taskIndex]
        };
      }
      
    } catch (error) {
      return {
        success: false,
        error: {
          message: 'Failed to delete task',
          details: error.message
        }
      };
    }
  }
}

// Export individual functions for MCP server integration
export const getTasks = (params) => TaskHandler.getTasks(params);
export const getTask = (params) => TaskHandler.getTask(params);
export const createTask = (params) => TaskHandler.createTask(params);
export const claimTask = (params) => TaskHandler.claimTask(params);
export const updateTask = (params) => TaskHandler.updateTask(params);
export const getPendingTasks = (params) => TaskHandler.getPendingTasks(params);
export const getTaskStats = (params) => TaskHandler.getTaskStats(params);
export const deleteTask = (params) => TaskHandler.deleteTask(params);

export default TaskHandler;