/**
 * MCP Coordination System - Instance Management Handler
 * Tracks AI instances and their activity in the system
 *
 * @author claude-code-BackendExpert-2025-08-23-1500
 */

import { promises as fs } from 'fs';
import { join, dirname } from 'path';

const DATA_DIR = 'data';
const INSTANCES_FILE = join(DATA_DIR, 'instances.json');

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
 * Instance Management Functions
 */
export class InstanceHandler {
  
  /**
   * Initialize instances data file if it doesn't exist
   */
  static async initialize() {
    const defaultData = {
      schema_version: '1.0',
      created: new Date().toISOString(),
      last_updated: new Date().toISOString(),
      instances: []
    };
    
    return await FileManager.ensureFile(INSTANCES_FILE, defaultData);
  }

  /**
   * Register or update an instance
   */
  static async registerInstance(params) {
    try {
      const { 
        instanceId, 
        role, 
        capabilities = [],
        metadata = {}
      } = params;
      
      if (!instanceId || !role) {
        return {
          success: false,
          error: { message: 'Instance ID and role are required' }
        };
      }
      
      await this.initialize();
      const data = await FileManager.readJSON(INSTANCES_FILE);
      
      const now = new Date().toISOString();
      const existingIndex = data.instances?.findIndex(i => i.id === instanceId);
      
      if (existingIndex !== -1) {
        // Update existing instance
        const instance = data.instances[existingIndex];
        instance.last_seen = now;
        instance.status = 'active';
        
        if (capabilities.length > 0) {
          instance.metadata.capabilities = capabilities;
        }
        
        // Increment session count
        instance.metadata.session_count = (instance.metadata.session_count || 0) + 1;
        
        // Update any provided metadata
        instance.metadata = { ...instance.metadata, ...metadata };
        
        data.last_updated = now;
        
        await FileManager.writeJSON(INSTANCES_FILE, data);
        
        return {
          success: true,
          instance,
          message: `Instance '${instanceId}' updated`,
          is_new: false
        };
      } else {
        // Register new instance
        const instance = {
          id: instanceId,
          role: role.toUpperCase(),
          status: 'active',
          last_seen: now,
          created: now,
          tasks_claimed: 0,
          metadata: {
            capabilities: Array.isArray(capabilities) ? capabilities : [],
            session_count: 1,
            ...metadata
          }
        };
        
        data.instances = data.instances || [];
        data.instances.push(instance);
        data.last_updated = now;
        
        await FileManager.writeJSON(INSTANCES_FILE, data);
        
        return {
          success: true,
          instance,
          message: `Instance '${instanceId}' registered successfully`,
          is_new: true
        };
      }
      
    } catch (error) {
      return {
        success: false,
        error: {
          message: 'Failed to register instance',
          details: error.message
        }
      };
    }
  }

  /**
   * Update instance heartbeat
   */
  static async updateHeartbeat(params) {
    try {
      const { instanceId, status = 'active', metadata = {} } = params;
      
      if (!instanceId) {
        return {
          success: false,
          error: { message: 'Instance ID is required' }
        };
      }
      
      await this.initialize();
      const data = await FileManager.readJSON(INSTANCES_FILE);
      
      const instanceIndex = data.instances?.findIndex(i => i.id === instanceId);
      
      if (instanceIndex === -1) {
        return {
          success: false,
          error: { message: `Instance '${instanceId}' not found. Please register first.` }
        };
      }
      
      const instance = data.instances[instanceIndex];
      const now = new Date().toISOString();
      
      instance.last_seen = now;
      instance.status = status;
      
      // Update metadata if provided
      if (Object.keys(metadata).length > 0) {
        instance.metadata = { ...instance.metadata, ...metadata };
      }
      
      data.last_updated = now;
      
      await FileManager.writeJSON(INSTANCES_FILE, data);
      
      return {
        success: true,
        instance,
        message: `Heartbeat updated for '${instanceId}'`
      };
      
    } catch (error) {
      return {
        success: false,
        error: {
          message: 'Failed to update heartbeat',
          details: error.message
        }
      };
    }
  }

  /**
   * Get all instances with optional filtering
   */
  static async getInstances(params = {}) {
    try {
      await this.initialize();
      const data = await FileManager.readJSON(INSTANCES_FILE);
      
      let instances = data.instances || [];
      
      // Apply filters
      const { role, status, active_only = false } = params;
      
      if (role) {
        instances = instances.filter(i => i.role === role.toUpperCase());
      }
      
      if (status) {
        const statuses = Array.isArray(status) ? status : [status];
        instances = instances.filter(i => statuses.includes(i.status));
      }
      
      if (active_only) {
        const cutoffTime = new Date(Date.now() - 15 * 60 * 1000); // 15 minutes ago
        instances = instances.filter(i => 
          i.status === 'active' && new Date(i.last_seen) > cutoffTime
        );
      }
      
      // Sort by last seen (most recent first)
      instances.sort((a, b) => new Date(b.last_seen) - new Date(a.last_seen));
      
      return {
        success: true,
        instances,
        total: instances.length,
        metadata: {
          schema_version: data.schema_version,
          last_updated: data.last_updated
        }
      };
      
    } catch (error) {
      return {
        success: false,
        error: {
          message: 'Failed to get instances',
          details: error.message
        }
      };
    }
  }

  /**
   * Get specific instance by ID
   */
  static async getInstance(params) {
    try {
      const { instanceId } = params;
      
      if (!instanceId) {
        return {
          success: false,
          error: { message: 'Instance ID is required' }
        };
      }
      
      await this.initialize();
      const data = await FileManager.readJSON(INSTANCES_FILE);
      
      const instance = data.instances?.find(i => i.id === instanceId);
      
      if (!instance) {
        return {
          success: false,
          error: { message: `Instance '${instanceId}' not found` }
        };
      }
      
      return {
        success: true,
        instance
      };
      
    } catch (error) {
      return {
        success: false,
        error: {
          message: 'Failed to get instance',
          details: error.message
        }
      };
    }
  }

  /**
   * Update instance task count when tasks are claimed/completed
   */
  static async updateTaskCount(params) {
    try {
      const { instanceId, increment = 1 } = params;
      
      if (!instanceId) {
        return {
          success: false,
          error: { message: 'Instance ID is required' }
        };
      }
      
      await this.initialize();
      const data = await FileManager.readJSON(INSTANCES_FILE);
      
      const instanceIndex = data.instances?.findIndex(i => i.id === instanceId);
      
      if (instanceIndex === -1) {
        return {
          success: false,
          error: { message: `Instance '${instanceId}' not found` }
        };
      }
      
      const instance = data.instances[instanceIndex];
      instance.tasks_claimed = Math.max(0, (instance.tasks_claimed || 0) + increment);
      instance.last_seen = new Date().toISOString();
      
      data.last_updated = new Date().toISOString();
      
      await FileManager.writeJSON(INSTANCES_FILE, data);
      
      return {
        success: true,
        instance,
        message: `Task count updated for '${instanceId}'`
      };
      
    } catch (error) {
      return {
        success: false,
        error: {
          message: 'Failed to update task count',
          details: error.message
        }
      };
    }
  }

  /**
   * Mark instance as inactive
   */
  static async deactivateInstance(params) {
    try {
      const { instanceId, reason = 'user_request' } = params;
      
      if (!instanceId) {
        return {
          success: false,
          error: { message: 'Instance ID is required' }
        };
      }
      
      await this.initialize();
      const data = await FileManager.readJSON(INSTANCES_FILE);
      
      const instanceIndex = data.instances?.findIndex(i => i.id === instanceId);
      
      if (instanceIndex === -1) {
        return {
          success: false,
          error: { message: `Instance '${instanceId}' not found` }
        };
      }
      
      const instance = data.instances[instanceIndex];
      instance.status = 'inactive';
      instance.last_seen = new Date().toISOString();
      instance.deactivated_at = new Date().toISOString();
      instance.deactivation_reason = reason;
      
      data.last_updated = new Date().toISOString();
      
      await FileManager.writeJSON(INSTANCES_FILE, data);
      
      return {
        success: true,
        instance,
        message: `Instance '${instanceId}' deactivated`
      };
      
    } catch (error) {
      return {
        success: false,
        error: {
          message: 'Failed to deactivate instance',
          details: error.message
        }
      };
    }
  }

  /**
   * Get instance statistics
   */
  static async getInstanceStats(params = {}) {
    try {
      await this.initialize();
      const data = await FileManager.readJSON(INSTANCES_FILE);
      
      const instances = data.instances || [];
      const cutoffTime = new Date(Date.now() - 15 * 60 * 1000); // 15 minutes ago
      
      const stats = {
        total: instances.length,
        active: instances.filter(i => 
          i.status === 'active' && new Date(i.last_seen) > cutoffTime
        ).length,
        inactive: instances.filter(i => i.status === 'inactive').length,
        stale: instances.filter(i => 
          i.status === 'active' && new Date(i.last_seen) <= cutoffTime
        ).length,
        by_role: {},
        total_tasks_claimed: instances.reduce((sum, i) => sum + (i.tasks_claimed || 0), 0)
      };
      
      // Count instances by role
      instances.forEach(instance => {
        const role = instance.role || 'UNKNOWN';
        stats.by_role[role] = (stats.by_role[role] || 0) + 1;
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
          message: 'Failed to get instance statistics',
          details: error.message
        }
      };
    }
  }

  /**
   * Cleanup stale instances (mark as inactive if not seen for too long)
   */
  static async cleanupStaleInstances(params = {}) {
    try {
      const { timeout_minutes = 60 } = params; // Default 1 hour timeout
      
      await this.initialize();
      const data = await FileManager.readJSON(INSTANCES_FILE);
      
      const cutoffTime = new Date(Date.now() - timeout_minutes * 60 * 1000);
      let cleanedCount = 0;
      
      data.instances = data.instances?.map(instance => {
        if (instance.status === 'active' && new Date(instance.last_seen) < cutoffTime) {
          instance.status = 'inactive';
          instance.deactivated_at = new Date().toISOString();
          instance.deactivation_reason = 'stale_timeout';
          cleanedCount++;
        }
        return instance;
      }) || [];
      
      if (cleanedCount > 0) {
        data.last_updated = new Date().toISOString();
        await FileManager.writeJSON(INSTANCES_FILE, data);
      }
      
      return {
        success: true,
        cleaned_count: cleanedCount,
        message: `Cleaned up ${cleanedCount} stale instances`
      };
      
    } catch (error) {
      return {
        success: false,
        error: {
          message: 'Failed to cleanup stale instances',
          details: error.message
        }
      };
    }
  }
}

// Export individual functions for MCP server integration
export const registerInstance = (params) => InstanceHandler.registerInstance(params);
export const updateHeartbeat = (params) => InstanceHandler.updateHeartbeat(params);
export const getInstances = (params) => InstanceHandler.getInstances(params);
export const getInstance = (params) => InstanceHandler.getInstance(params);
export const updateTaskCount = (params) => InstanceHandler.updateTaskCount(params);
export const deactivateInstance = (params) => InstanceHandler.deactivateInstance(params);
export const getInstanceStats = (params) => InstanceHandler.getInstanceStats(params);
export const cleanupStaleInstances = (params) => InstanceHandler.cleanupStaleInstances(params);

export default InstanceHandler;