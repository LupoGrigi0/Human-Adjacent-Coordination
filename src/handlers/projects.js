/**
 * MCP Coordination System - Project Management Handler
 * Provides CRUD operations for project management with JSON persistence
 *
 * @author claude-code-BackendExpert-2025-08-23-1500
 */

import { promises as fs } from 'fs';
import { join, dirname } from 'path';
import { randomUUID } from 'crypto';
import { logger } from '../logger.js';

const DATA_DIR = 'data';
const PROJECTS_FILE = join(DATA_DIR, 'projects', 'manifest.json');

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
 * Project Management Functions
 */
export class ProjectHandler {
  
  /**
   * Initialize projects data file if it doesn't exist
   */
  static async initialize() {
    const defaultData = {
      schema_version: '1.0',
      created: new Date().toISOString(),
      last_updated: new Date().toISOString(),
      projects: []
    };
    
    return await FileManager.ensureFile(PROJECTS_FILE, defaultData);
  }

  /**
   * Get all projects with optional filtering
   */
  static async getProjects(params = {}) {
    try {
      await logger.info(`Reading projects from: ${PROJECTS_FILE} (cwd: ${process.cwd()})`);
      await this.initialize();
      const data = await FileManager.readJSON(PROJECTS_FILE);
      
      let projects = data.projects || [];
      
      // Apply filters
      const { status, priority, tags } = params;
      
      if (status) {
        projects = projects.filter(p => p.status === status);
      }
      
      if (priority) {
        projects = projects.filter(p => p.priority === priority);
      }
      
      if (tags) {
        const filterTags = Array.isArray(tags) ? tags : [tags];
        projects = projects.filter(p => 
          filterTags.some(tag => p.metadata?.tags?.includes(tag))
        );
      }
      
      // Sort by priority (high, medium, low) then by created date
      const priorityOrder = { high: 3, medium: 2, low: 1 };
      projects.sort((a, b) => {
        const priorityDiff = (priorityOrder[b.priority] || 0) - (priorityOrder[a.priority] || 0);
        if (priorityDiff !== 0) return priorityDiff;
        return new Date(b.created) - new Date(a.created);
      });
      
      return {
        success: true,
        projects,
        total: projects.length,
        metadata: {
          schema_version: data.schema_version,
          last_updated: data.last_updated
        }
      };
      
    } catch (error) {
      return {
        success: false,
        error: {
          message: 'Failed to get projects',
          details: error.message
        }
      };
    }
  }

  /**
   * Get specific project by ID
   */
  static async getProject(params) {
    try {
      const { id } = params;
      
      if (!id) {
        return {
          success: false,
          error: { message: 'Project ID is required' }
        };
      }
      
      await this.initialize();
      const data = await FileManager.readJSON(PROJECTS_FILE);
      
      const project = data.projects?.find(p => p.id === id);
      
      if (!project) {
        return {
          success: false,
          error: { message: `Project '${id}' not found` }
        };
      }
      
      return {
        success: true,
        project
      };
      
    } catch (error) {
      return {
        success: false,
        error: {
          message: 'Failed to get project',
          details: error.message
        }
      };
    }
  }

  /**
   * Create a new project
   */
  static async createProject(params) {
    try {
      const { name, description, priority = 'medium', tags = [], metadata = {} } = params;
      
      if (!name || !description) {
        return {
          success: false,
          error: { message: 'Name and description are required' }
        };
      }
      
      await this.initialize();
      const data = await FileManager.readJSON(PROJECTS_FILE);
      
      // Generate ID from name (lowercase, spaces to dashes)
      const id = name.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-');
      
      // Check if project with this ID already exists
      if (data.projects?.some(p => p.id === id)) {
        return {
          success: false,
          error: { message: `Project with ID '${id}' already exists` }
        };
      }
      
      const now = new Date().toISOString();
      const project = {
        id,
        name,
        description,
        status: 'active',
        priority: ['high', 'medium', 'low'].includes(priority) ? priority : 'medium',
        created: now,
        updated: now,
        metadata: {
          tags: Array.isArray(tags) ? tags : [],
          ...metadata
        }
      };
      
      data.projects = data.projects || [];
      data.projects.push(project);
      data.last_updated = now;
      
      await FileManager.writeJSON(PROJECTS_FILE, data);
      
      return {
        success: true,
        project,
        message: `Project '${name}' created successfully`
      };
      
    } catch (error) {
      return {
        success: false,
        error: {
          message: 'Failed to create project',
          details: error.message
        }
      };
    }
  }

  /**
   * Update an existing project
   */
  static async updateProject(params) {
    try {
      const { id, updates } = params;
      
      if (!id) {
        return {
          success: false,
          error: { message: 'Project ID is required' }
        };
      }
      
      if (!updates || typeof updates !== 'object') {
        return {
          success: false,
          error: { message: 'Updates object is required' }
        };
      }
      
      await this.initialize();
      const data = await FileManager.readJSON(PROJECTS_FILE);
      
      const projectIndex = data.projects?.findIndex(p => p.id === id);
      
      if (projectIndex === -1) {
        return {
          success: false,
          error: { message: `Project '${id}' not found` }
        };
      }
      
      const project = data.projects[projectIndex];
      const now = new Date().toISOString();
      
      // Apply updates
      const allowedUpdates = ['name', 'description', 'status', 'priority', 'metadata'];
      const updatedProject = { ...project };
      
      for (const [key, value] of Object.entries(updates)) {
        if (allowedUpdates.includes(key)) {
          if (key === 'metadata' && typeof value === 'object') {
            updatedProject.metadata = { ...project.metadata, ...value };
          } else {
            updatedProject[key] = value;
          }
        }
      }
      
      updatedProject.updated = now;
      
      data.projects[projectIndex] = updatedProject;
      data.last_updated = now;
      
      await FileManager.writeJSON(PROJECTS_FILE, data);
      
      return {
        success: true,
        project: updatedProject,
        message: `Project '${id}' updated successfully`
      };
      
    } catch (error) {
      return {
        success: false,
        error: {
          message: 'Failed to update project',
          details: error.message
        }
      };
    }
  }

  /**
   * Delete a project (soft delete by changing status to 'archived')
   */
  static async deleteProject(params) {
    try {
      const { id, hard_delete = false } = params;
      
      if (!id) {
        return {
          success: false,
          error: { message: 'Project ID is required' }
        };
      }
      
      await this.initialize();
      const data = await FileManager.readJSON(PROJECTS_FILE);
      
      const projectIndex = data.projects?.findIndex(p => p.id === id);
      
      if (projectIndex === -1) {
        return {
          success: false,
          error: { message: `Project '${id}' not found` }
        };
      }
      
      if (hard_delete) {
        // Actually remove from array
        const removed = data.projects.splice(projectIndex, 1)[0];
        data.last_updated = new Date().toISOString();
        
        await FileManager.writeJSON(PROJECTS_FILE, data);
        
        return {
          success: true,
          message: `Project '${id}' permanently deleted`,
          project: removed
        };
      } else {
        // Soft delete - change status to archived
        data.projects[projectIndex].status = 'archived';
        data.projects[projectIndex].updated = new Date().toISOString();
        data.last_updated = new Date().toISOString();
        
        await FileManager.writeJSON(PROJECTS_FILE, data);
        
        return {
          success: true,
          message: `Project '${id}' archived`,
          project: data.projects[projectIndex]
        };
      }
      
    } catch (error) {
      return {
        success: false,
        error: {
          message: 'Failed to delete project',
          details: error.message
        }
      };
    }
  }

  /**
   * Get project statistics
   */
  static async getProjectStats(params = {}) {
    try {
      await this.initialize();
      const data = await FileManager.readJSON(PROJECTS_FILE);
      
      const projects = data.projects || [];
      
      const stats = {
        total: projects.length,
        active: projects.filter(p => p.status === 'active').length,
        completed: projects.filter(p => p.status === 'completed').length,
        archived: projects.filter(p => p.status === 'archived').length,
        by_priority: {
          high: projects.filter(p => p.priority === 'high').length,
          medium: projects.filter(p => p.priority === 'medium').length,
          low: projects.filter(p => p.priority === 'low').length
        }
      };
      
      return {
        success: true,
        stats,
        timestamp: new Date().toISOString()
      };
      
    } catch (error) {
      return {
        success: false,
        error: {
          message: 'Failed to get project statistics',
          details: error.message
        }
      };
    }
  }
}

// Export individual functions for MCP server integration
export const getProjects = (params) => ProjectHandler.getProjects(params);
export const getProject = (params) => ProjectHandler.getProject(params);
export const createProject = (params) => ProjectHandler.createProject(params);
export const updateProject = (params) => ProjectHandler.updateProject(params);
export const deleteProject = (params) => ProjectHandler.deleteProject(params);
export const getProjectStats = (params) => ProjectHandler.getProjectStats(params);

export default ProjectHandler;