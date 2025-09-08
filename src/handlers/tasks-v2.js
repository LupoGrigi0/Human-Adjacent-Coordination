/**
 * MCP Coordination System - Task Management Handler v2.0
 * Project-Specific Task Collections Architecture
 * Implements Lupo's scalability requirements
 *
 * @author claude-code-COO-Resolver-2025-08-24-1600
 */

import { promises as fs } from 'fs';
import { join, dirname } from 'path';
import { randomUUID } from 'crypto';

const DATA_DIR = 'data';
const PROJECTS_DIR = join(DATA_DIR, 'projects');

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
 * Task Management Functions - Project-Specific Architecture
 */
export class TaskHandler {
  
  /**
   * Get path to project's task file
   */
  static getProjectTaskFile(projectId) {
    return join(PROJECTS_DIR, projectId, 'tasks.json');
  }

  /**
   * Initialize project task file if it doesn't exist
   */
  static async initializeProject(projectId) {
    const taskFile = this.getProjectTaskFile(projectId);
    const defaultData = {
      schema_version: '1.0',
      project_id: projectId,
      created: new Date().toISOString(),
      last_updated: new Date().toISOString(),
      tasks: []
    };
    
    return await FileManager.ensureFile(taskFile, defaultData);
  }

  /**
   * Get all projects that have task files
   */
  static async getProjectsWithTasks() {
    try {
      const projects = [];
      const projectDirs = await fs.readdir(PROJECTS_DIR, { withFileTypes: true });
      
      for (const dir of projectDirs) {
        if (dir.isDirectory()) {
          const taskFile = this.getProjectTaskFile(dir.name);
          try {
            await fs.access(taskFile);
            projects.push(dir.name);
          } catch {
            // Project has no tasks file yet
          }
        }
      }
      
      return projects;
    } catch (error) {
      return []; // No projects directory yet
    }
  }

  /**
   * Get tasks from a specific project
   */
  static async getProjectTasks(projectId, filters = {}) {
    try {
      const taskFile = this.getProjectTaskFile(projectId);
      const data = await FileManager.readJSON(taskFile);
      
      if (!data) return [];
      
      let tasks = data.tasks || [];
      
      // Apply filters
      const { status, priority, assigned_to, tags } = filters;
      
      if (status) {
        const statuses = Array.isArray(status) ? status : [status];
        tasks = tasks.filter(t => statuses.includes(t.status));
      }
      
      if (priority) {
        const priorities = Array.isArray(priority) ? priority : [priority];
        tasks = tasks.filter(t => priorities.includes(t.priority));
      }
      
      if (assigned_to) {
        tasks = tasks.filter(t => t.assigned_to === assigned_to);
      }
      
      if (tags && tags.length > 0) {
        tasks = tasks.filter(t => 
          tags.some(tag => t.metadata?.tags?.includes(tag))
        );
      }
      
      // Add project_id back to each task for API compatibility
      return tasks.map(task => ({
        ...task,
        project_id: projectId
      }));
    } catch (error) {
      return [];
    }
  }

  /**
   * Get all tasks with optional filtering (aggregates across all projects)
   */
  static async getTasks(params = {}) {
    try {
      const { project_id, ...otherFilters } = params;
      
      // If specific project requested, get only those tasks
      if (project_id) {
        return {
          success: true,
          tasks: await this.getProjectTasks(project_id, otherFilters),
          total: await this.getProjectTasks(project_id, otherFilters).then(t => t.length),
          metadata: {
            schema_version: '2.0',
            project_specific: true,
            project_id,
            last_updated: new Date().toISOString()
          }
        };
      }
      
      // Get tasks from all projects
      const projects = await this.getProjectsWithTasks();
      let allTasks = [];
      
      for (const projectId of projects) {
        const projectTasks = await this.getProjectTasks(projectId, otherFilters);
        allTasks = allTasks.concat(projectTasks);
      }
      
      // Sort by created date (newest first)
      allTasks.sort((a, b) => new Date(b.created) - new Date(a.created));
      
      return {
        success: true,
        tasks: allTasks,
        total: allTasks.length,
        metadata: {
          schema_version: '2.0',
          project_specific: false,
          projects_included: projects,
          last_updated: new Date().toISOString()
        }
      };
    } catch (error) {
      return {
        success: false,
        error: { message: error.message },
        tasks: [],
        total: 0
      };
    }
  }

  /**
   * Get a specific task by ID (searches across all projects)
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

      const projects = await this.getProjectsWithTasks();
      
      for (const projectId of projects) {
        const tasks = await this.getProjectTasks(projectId);
        const task = tasks.find(t => t.id === id);
        if (task) {
          return {
            success: true,
            task,
            metadata: {
              project_id: projectId,
              found_in_project: true
            }
          };
        }
      }

      return {
        success: false,
        error: { message: `Task with ID '${id}' not found` }
      };
    } catch (error) {
      return {
        success: false,
        error: { message: error.message }
      };
    }
  }

  /**
   * Create a new task in a specific project
   */
  static async createTask(params) {
    try {
      const { 
        id, 
        title, 
        description, 
        project_id,
        priority = 'medium',
        estimated_effort = null,
        tags = [],
        dependencies = []
      } = params;

      // Validation
      if (!id || !title || !description || !project_id) {
        return {
          success: false,
          error: { message: 'ID, title, description, and project_id are required' }
        };
      }

      // Ensure project task file exists
      await this.initializeProject(project_id);
      
      // Check if task ID already exists in this project
      const existingTasks = await this.getProjectTasks(project_id);
      if (existingTasks.find(t => t.id === id)) {
        return {
          success: false,
          error: { message: `Task with ID '${id}' already exists in project '${project_id}'` }
        };
      }

      const now = new Date().toISOString();
      const newTask = {
        id,
        title,
        description,
        status: 'pending',
        priority: ['critical', 'high', 'medium', 'low'].includes(priority) ? priority : 'medium',
        assigned_to: null,
        created: now,
        updated: now,
        metadata: {
          effort_estimate: estimated_effort,
          tags: Array.isArray(tags) ? tags : [],
          dependencies: Array.isArray(dependencies) ? dependencies : []
        }
      };

      // Add to project task file
      const taskFile = this.getProjectTaskFile(project_id);
      const data = await FileManager.readJSON(taskFile);
      data.tasks.push(newTask);
      data.last_updated = now;
      await FileManager.writeJSON(taskFile, data);

      return {
        success: true,
        task: {
          ...newTask,
          project_id
        },
        message: `Task '${title}' created successfully in project '${project_id}'`
      };
    } catch (error) {
      return {
        success: false,
        error: { message: error.message }
      };
    }
  }

  /**
   * Update an existing task
   */
  static async updateTask(params) {
    try {
      const { id, updates } = params;
      if (!id || !updates) {
        return {
          success: false,
          error: { message: 'Task ID and updates are required' }
        };
      }

      // Find the task across all projects
      const projects = await this.getProjectsWithTasks();
      
      for (const projectId of projects) {
        const taskFile = this.getProjectTaskFile(projectId);
        const data = await FileManager.readJSON(taskFile);
        
        const taskIndex = data.tasks.findIndex(t => t.id === id);
        if (taskIndex !== -1) {
          // Update the task
          const now = new Date().toISOString();
          Object.assign(data.tasks[taskIndex], updates, {
            updated: now
          });
          
          data.last_updated = now;
          await FileManager.writeJSON(taskFile, data);
          
          return {
            success: true,
            task: {
              ...data.tasks[taskIndex],
              project_id: projectId
            },
            message: `Task '${id}' updated successfully`
          };
        }
      }

      return {
        success: false,
        error: { message: `Task with ID '${id}' not found` }
      };
    } catch (error) {
      return {
        success: false,
        error: { message: error.message }
      };
    }
  }

  /**
   * Claim a task for execution
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

      const updateResult = await this.updateTask({
        id,
        updates: {
          status: 'claimed',
          assigned_to: instanceId,
          claimed_at: new Date().toISOString()
        }
      });

      if (updateResult.success) {
        return {
          success: true,
          task: updateResult.task,
          message: `Task '${id}' claimed by '${instanceId}'`
        };
      }

      return updateResult;
    } catch (error) {
      return {
        success: false,
        error: { message: error.message }
      };
    }
  }

  /**
   * Get pending tasks across all projects
   */
  static async getPendingTasks(params = {}) {
    try {
      const allTasks = await this.getTasks({
        status: 'pending',
        ...params
      });

      return {
        success: true,
        tasks: allTasks.tasks,
        total: allTasks.total,
        metadata: {
          ...allTasks.metadata,
          filter_applied: 'pending_only'
        }
      };
    } catch (error) {
      return {
        success: false,
        error: { message: error.message },
        tasks: [],
        total: 0
      };
    }
  }
}

// Export individual functions for backwards compatibility
export const getTasks = (params) => TaskHandler.getTasks(params);
export const getTask = (params) => TaskHandler.getTask(params);
export const createTask = (params) => TaskHandler.createTask(params);
export const updateTask = (params) => TaskHandler.updateTask(params);
export const claimTask = (params) => TaskHandler.claimTask(params);
export const getPendingTasks = (params) => TaskHandler.getPendingTasks(params);

export default TaskHandler;