/**
 * MCP Coordination System - Message System Handler v3.0
 * Provides intelligent message routing with privacy isolation while maintaining existing API
 *
 * @author claude-code-MessagePrivacyStorageSpecialist-2025-08-25-1200
 */

import { promises as fs } from 'fs';
import { join, dirname } from 'path';
import { randomUUID } from 'crypto';
import { logger } from '../logger.js';

const DATA_DIR = 'data';
const MESSAGES_DIR = join(DATA_DIR, 'messages');

/**
 * Intelligent Message Storage Router
 * Routes messages to appropriate storage locations based on recipient
 */
class MessageStorageRouter {
  constructor() {
    this.globalInboxPath = join(MESSAGES_DIR, 'inbox', 'inbox.json');
    this.archiveDir = join(MESSAGES_DIR, 'archive');
  }

  /**
   * Analyze message recipient and determine storage route
   * @param {Object} message - The message to route
   * @returns {Object} - Storage routing information
   */
  routeMessage(message) {
    const to = message.to;
    
    if (!to || to === 'all') {
      return {
        type: 'global',
        path: this.globalInboxPath,
        description: 'Global system messages'
      };
    }
    
    if (to.startsWith('project-team:')) {
      const projectId = to.substring('project-team:'.length);
      return {
        type: 'project',
        projectId: projectId,
        path: join(MESSAGES_DIR, 'projects', projectId, 'inbox.json'),
        description: `Project team messages for ${projectId}`
      };
    }
    
    // Specific instance - private message
    return {
      type: 'instance',
      instanceId: to,
      path: join(MESSAGES_DIR, 'instances', to, 'inbox.json'),
      description: `Private messages for ${to}`
    };
  }

  /**
   * Get all possible storage paths for a given recipient filter
   * @param {string} recipientFilter - The recipient to filter by
   * @returns {Array} - Array of storage paths to check
   */
  getStoragePathsForRecipient(recipientFilter) {
    const paths = [];
    
    if (!recipientFilter || recipientFilter === 'all') {
      // Include global messages for everyone
      paths.push({
        path: this.globalInboxPath,
        type: 'global'
      });
      
      // If filtering for specific instance, also include their private messages
      if (recipientFilter && recipientFilter !== 'all') {
        paths.push({
          path: join(MESSAGES_DIR, 'instances', recipientFilter, 'inbox.json'),
          type: 'instance',
          instanceId: recipientFilter
        });
      }
    } else if (recipientFilter.startsWith('project-team:')) {
      // Project team messages
      const projectId = recipientFilter.substring('project-team:'.length);
      paths.push({
        path: join(MESSAGES_DIR, 'projects', projectId, 'inbox.json'),
        type: 'project',
        projectId: projectId
      });
    } else {
      // Specific instance - include global AND private
      paths.push({
        path: this.globalInboxPath,
        type: 'global'
      });
      paths.push({
        path: join(MESSAGES_DIR, 'instances', recipientFilter, 'inbox.json'),
        type: 'instance',
        instanceId: recipientFilter
      });
    }
    
    return paths;
  }
}

/**
 * File system utilities with atomic operations (enhanced for routing)
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
 * Message System Functions with Intelligent Routing
 */
export class MessageHandlerV3 {
  constructor() {
    this.router = new MessageStorageRouter();
  }
  
  /**
   * Initialize messages data structures if they don't exist
   */
  async initialize() {
    // Ensure directories exist
    await fs.mkdir(join(MESSAGES_DIR, 'inbox'), { recursive: true });
    await fs.mkdir(join(MESSAGES_DIR, 'archive'), { recursive: true });
    await fs.mkdir(join(MESSAGES_DIR, 'projects'), { recursive: true });
    await fs.mkdir(join(MESSAGES_DIR, 'instances'), { recursive: true });
    
    const defaultInboxData = {
      schema_version: '3.0',
      created: new Date().toISOString(),
      last_updated: new Date().toISOString(),
      messages: []
    };
    
    return await FileManager.ensureFile(this.router.globalInboxPath, defaultInboxData);
  }

  /**
   * Create instance directory when an instance bootstraps
   * @param {string} instanceId - Instance identifier
   */
  async createInstanceDirectory(instanceId) {
    if (!instanceId || instanceId === 'all') {
      return; // Skip global or empty instance IDs
    }
    
    const instancePath = join(MESSAGES_DIR, 'instances', instanceId);
    await fs.mkdir(instancePath, { recursive: true });
    
    const instanceInboxPath = join(instancePath, 'inbox.json');
    const defaultData = {
      schema_version: '3.0',
      instance_id: instanceId,
      created: new Date().toISOString(),
      last_updated: new Date().toISOString(),
      messages: []
    };
    
    await FileManager.ensureFile(instanceInboxPath, defaultData);
    
    // Log the directory creation for debugging
    await logger.info(`Created instance directory for ${instanceId}`, { path: instancePath });
  }

  /**
   * Send a message to the system with intelligent routing
   */
  async sendMessage(params) {
    try {
      const { 
        from, 
        to = 'all', 
        subject, 
        content, 
        type = 'general',
        priority = 'normal',
        tags = [],
        thread_id = null
      } = params;
      
      if (!from || !subject || !content) {
        return {
          success: false,
          error: { message: 'From, subject, and content are required' }
        };
      }
      
      await this.initialize();
      
      // Route the message to appropriate storage
      const route = this.router.routeMessage({ to });
      await logger.info(`Routing message to ${route.type}`, { 
        from, 
        to, 
        route: route.description 
      });
      
      // Ensure target directory exists
      const targetDir = dirname(route.path);
      await fs.mkdir(targetDir, { recursive: true });
      
      // Load or create target inbox
      const defaultInboxData = {
        schema_version: '3.0',
        created: new Date().toISOString(),
        last_updated: new Date().toISOString(),
        messages: [],
        ...(route.type === 'project' && { project_id: route.projectId }),
        ...(route.type === 'instance' && { instance_id: route.instanceId })
      };
      
      const data = await FileManager.ensureFile(route.path, defaultInboxData);
      
      // Generate message ID
      const id = `msg-${Date.now()}-${randomUUID().substring(0, 8)}`;
      
      const now = new Date().toISOString();
      const message = {
        id,
        from,
        to,
        subject,
        body: content,
        type,
        priority: ['high', 'normal', 'low'].includes(priority) ? priority : 'normal',
        status: 'unread',
        created: now,
        metadata: {
          tags: Array.isArray(tags) ? tags : [],
          thread_id,
          routing_type: route.type,
          ...(route.type === 'project' && { project_id: route.projectId }),
          ...(route.type === 'instance' && { instance_id: route.instanceId })
        }
      };
      
      data.messages = data.messages || [];
      data.messages.push(message);
      data.last_updated = now;
      
      await FileManager.writeJSON(route.path, data);
      
      return {
        success: true,
        message,
        message_text: `Message '${subject}' sent successfully to ${route.type} storage`,
        routing_info: {
          type: route.type,
          path: route.path,
          description: route.description
        }
      };
      
    } catch (error) {
      await logger.error('Failed to send message', { error: error.message, params });
      return {
        success: false,
        error: {
          message: 'Failed to send message',
          details: error.message
        }
      };
    }
  }

  /**
   * Get messages from multiple storage locations with filtering
   */
  async getMessages(params = {}) {
    try {
      await this.initialize();
      
      const { 
        to, 
        from, 
        status, 
        type, 
        priority, 
        tags, 
        unread_only = false,
        limit = null,
        instanceId = null // For instance-specific filtering
      } = params;
      
      // Determine which storage locations to check
      const targetRecipient = instanceId || to;
      const storagePaths = this.router.getStoragePathsForRecipient(targetRecipient);
      
      let allMessages = [];
      
      // Collect messages from all relevant storage locations
      for (const storageInfo of storagePaths) {
        const data = await FileManager.readJSON(storageInfo.path);
        if (data && data.messages) {
          // Add storage metadata to messages
          const messagesWithStorage = data.messages.map(msg => ({
            ...msg,
            _storage_info: {
              type: storageInfo.type,
              path: storageInfo.path,
              ...(storageInfo.projectId && { project_id: storageInfo.projectId }),
              ...(storageInfo.instanceId && { instance_id: storageInfo.instanceId })
            }
          }));
          allMessages = allMessages.concat(messagesWithStorage);
        }
      }
      
      // Apply filters (same logic as original)
      if (to && to !== 'all') {
        allMessages = allMessages.filter(m => m.to === to || m.to === 'all');
      }
      
      if (from) {
        allMessages = allMessages.filter(m => m.from === from);
      }
      
      if (status) {
        const statuses = Array.isArray(status) ? status : [status];
        allMessages = allMessages.filter(m => statuses.includes(m.status));
      }
      
      if (type) {
        const types = Array.isArray(type) ? type : [type];
        allMessages = allMessages.filter(m => types.includes(m.type));
      }
      
      if (priority) {
        const priorities = Array.isArray(priority) ? priority : [priority];
        allMessages = allMessages.filter(m => priorities.includes(m.priority));
      }
      
      if (tags) {
        const filterTags = Array.isArray(tags) ? tags : [tags];
        allMessages = allMessages.filter(m => 
          filterTags.some(tag => m.metadata?.tags?.includes(tag))
        );
      }
      
      if (unread_only) {
        allMessages = allMessages.filter(m => m.status === 'unread');
      }
      
      // Sort by priority (high, normal, low) then by created date (newest first)
      const priorityOrder = { high: 3, normal: 2, low: 1 };
      allMessages.sort((a, b) => {
        const priorityDiff = (priorityOrder[b.priority] || 0) - (priorityOrder[a.priority] || 0);
        if (priorityDiff !== 0) return priorityDiff;
        return new Date(b.created) - new Date(a.created);
      });
      
      // Apply limit if specified
      if (limit && limit > 0) {
        allMessages = allMessages.slice(0, limit);
      }
      
      return {
        success: true,
        messages: allMessages,
        total: allMessages.length,
        metadata: {
          schema_version: '3.0',
          storage_locations: storagePaths.length,
          routing_info: storagePaths.map(s => ({ type: s.type, path: s.path })),
          last_updated: new Date().toISOString()
        }
      };
      
    } catch (error) {
      await logger.error('Failed to get messages', { error: error.message, params });
      return {
        success: false,
        error: {
          message: 'Failed to get messages',
          details: error.message
        }
      };
    }
  }

  /**
   * Get specific message by ID (search across all storage locations)
   */
  async getMessage(params) {
    try {
      const { id, instanceId = null } = params;
      
      if (!id) {
        return {
          success: false,
          error: { message: 'Message ID is required' }
        };
      }
      
      await this.initialize();
      
      // Search across all possible storage locations
      const searchPaths = [
        this.router.globalInboxPath,
        ...(instanceId ? [join(MESSAGES_DIR, 'instances', instanceId, 'inbox.json')] : [])
      ];
      
      // Also search project directories if no instanceId specified
      if (!instanceId) {
        try {
          const projectsDir = join(MESSAGES_DIR, 'projects');
          const projects = await fs.readdir(projectsDir, { withFileTypes: true });
          for (const project of projects) {
            if (project.isDirectory()) {
              searchPaths.push(join(projectsDir, project.name, 'inbox.json'));
            }
          }
        } catch (error) {
          // Projects directory might not exist
        }
        
        try {
          const instancesDir = join(MESSAGES_DIR, 'instances');
          const instances = await fs.readdir(instancesDir, { withFileTypes: true });
          for (const instance of instances) {
            if (instance.isDirectory()) {
              searchPaths.push(join(instancesDir, instance.name, 'inbox.json'));
            }
          }
        } catch (error) {
          // Instances directory might not exist
        }
      }
      
      // Search for the message
      for (const path of searchPaths) {
        const data = await FileManager.readJSON(path);
        if (data && data.messages) {
          const message = data.messages.find(m => m.id === id);
          if (message) {
            return {
              success: true,
              message: {
                ...message,
                _storage_info: {
                  path: path,
                  type: path.includes('/projects/') ? 'project' : 
                        path.includes('/instances/') ? 'instance' : 'global'
                }
              }
            };
          }
        }
      }
      
      return {
        success: false,
        error: { message: `Message '${id}' not found` }
      };
      
    } catch (error) {
      await logger.error('Failed to get message', { error: error.message, params });
      return {
        success: false,
        error: {
          message: 'Failed to get message',
          details: error.message
        }
      };
    }
  }

  /**
   * Mark message as read (updates in original storage location)
   */
  async markMessageRead(params) {
    try {
      const { id, reader_id } = params;
      
      if (!id) {
        return {
          success: false,
          error: { message: 'Message ID is required' }
        };
      }
      
      // First find the message to get its storage location
      const messageResult = await this.getMessage({ id });
      if (!messageResult.success) {
        return messageResult;
      }
      
      const message = messageResult.message;
      const storagePath = message._storage_info.path;
      
      // Load the storage file
      const data = await FileManager.readJSON(storagePath);
      const messageIndex = data.messages?.findIndex(m => m.id === id);
      
      if (messageIndex === -1) {
        return {
          success: false,
          error: { message: `Message '${id}' not found in storage` }
        };
      }
      
      // Update the message
      data.messages[messageIndex].status = 'read';
      data.messages[messageIndex].read_at = new Date().toISOString();
      if (reader_id) {
        data.messages[messageIndex].read_by = reader_id;
      }
      
      data.last_updated = new Date().toISOString();
      
      await FileManager.writeJSON(storagePath, data);
      
      return {
        success: true,
        message: data.messages[messageIndex],
        message_text: `Message '${id}' marked as read`
      };
      
    } catch (error) {
      await logger.error('Failed to mark message as read', { error: error.message, params });
      return {
        success: false,
        error: {
          message: 'Failed to mark message as read',
          details: error.message
        }
      };
    }
  }

  /**
   * Archive a message (move from inbox to archive - maintains routing aware)
   */
  async archiveMessage(params) {
    try {
      const { id, archiver_id } = params;
      
      if (!id) {
        return {
          success: false,
          error: { message: 'Message ID is required' }
        };
      }
      
      // First find the message to get its storage location
      const messageResult = await this.getMessage({ id });
      if (!messageResult.success) {
        return messageResult;
      }
      
      const message = messageResult.message;
      const storagePath = message._storage_info.path;
      
      // Load the storage file
      const data = await FileManager.readJSON(storagePath);
      const messageIndex = data.messages?.findIndex(m => m.id === id);
      
      if (messageIndex === -1) {
        return {
          success: false,
          error: { message: `Message '${id}' not found in storage` }
        };
      }
      
      // Remove from inbox
      const archivedMessage = data.messages.splice(messageIndex, 1)[0];
      archivedMessage.archived_at = new Date().toISOString();
      if (archiver_id) {
        archivedMessage.archived_by = archiver_id;
      }
      
      data.last_updated = new Date().toISOString();
      
      // Save updated inbox
      await FileManager.writeJSON(storagePath, data);
      
      // Create monthly archive file (in same directory structure)
      const archiveDate = new Date().toISOString().substring(0, 7); // YYYY-MM
      const storageDir = dirname(storagePath);
      const archiveFile = join(storageDir, 'archive', `${archiveDate}.json`);
      
      // Ensure archive directory exists
      await fs.mkdir(dirname(archiveFile), { recursive: true });
      
      // Load or create archive file
      let archiveData = await FileManager.readJSON(archiveFile);
      if (!archiveData) {
        archiveData = {
          schema_version: '3.0',
          archive_month: archiveDate,
          storage_type: message._storage_info.type,
          created: new Date().toISOString(),
          last_updated: new Date().toISOString(),
          messages: []
        };
      }
      
      // Add message to archive
      archiveData.messages.push(archivedMessage);
      archiveData.last_updated = new Date().toISOString();
      
      await FileManager.writeJSON(archiveFile, archiveData);
      
      return {
        success: true,
        message: archivedMessage,
        archive_file: archiveFile,
        message_text: `Message '${id}' archived successfully`
      };
      
    } catch (error) {
      await logger.error('Failed to archive message', { error: error.message, params });
      return {
        success: false,
        error: {
          message: 'Failed to archive message',
          details: error.message
        }
      };
    }
  }

  /**
   * Get archived messages (searches across all storage locations)
   */
  async getArchivedMessages(params = {}) {
    try {
      const { month, limit = 50, instanceId = null } = params;
      
      await this.initialize();
      
      // Determine archive directories to search
      const archiveDirs = [];
      
      if (instanceId) {
        // Search specific instance archives
        archiveDirs.push(join(MESSAGES_DIR, 'instances', instanceId, 'archive'));
      } else {
        // Search all archive directories
        archiveDirs.push(join(MESSAGES_DIR, 'inbox', 'archive')); // Legacy global archive
        archiveDirs.push(join(MESSAGES_DIR, 'archive')); // Main archive
        
        // Add project archives
        try {
          const projectsDir = join(MESSAGES_DIR, 'projects');
          const projects = await fs.readdir(projectsDir, { withFileTypes: true });
          for (const project of projects) {
            if (project.isDirectory()) {
              archiveDirs.push(join(projectsDir, project.name, 'archive'));
            }
          }
        } catch (error) {
          // Projects directory might not exist
        }
        
        // Add instance archives
        try {
          const instancesDir = join(MESSAGES_DIR, 'instances');
          const instances = await fs.readdir(instancesDir, { withFileTypes: true });
          for (const instance of instances) {
            if (instance.isDirectory()) {
              archiveDirs.push(join(instancesDir, instance.name, 'archive'));
            }
          }
        } catch (error) {
          // Instances directory might not exist
        }
      }
      
      let archiveFiles = [];
      
      for (const archiveDir of archiveDirs) {
        try {
          await fs.mkdir(archiveDir, { recursive: true });
          
          if (month) {
            // Specific month requested
            const archiveFile = join(archiveDir, `${month}.json`);
            const data = await FileManager.readJSON(archiveFile);
            if (data) {
              archiveFiles.push({ file: archiveFile, data, archiveDir });
            }
          } else {
            // Get all archive files
            const files = await fs.readdir(archiveDir);
            const jsonFiles = files.filter(f => f.endsWith('.json')).sort().reverse(); // Latest first
            
            for (const file of jsonFiles) {
              const data = await FileManager.readJSON(join(archiveDir, file));
              if (data) {
                archiveFiles.push({ file: join(archiveDir, file), data, archiveDir });
              }
            }
          }
        } catch (error) {
          // Archive directory might not exist, skip
        }
      }
      
      // Combine all messages
      let allMessages = [];
      archiveFiles.forEach(({ data, archiveDir }) => {
        const messagesWithStorage = (data.messages || []).map(msg => ({
          ...msg,
          _storage_info: {
            archive_path: archiveDir,
            storage_type: data.storage_type || 'global'
          }
        }));
        allMessages = allMessages.concat(messagesWithStorage);
      });
      
      // Sort by archived date (newest first)
      allMessages.sort((a, b) => new Date(b.archived_at || b.created) - new Date(a.archived_at || a.created));
      
      // Apply limit
      if (limit > 0) {
        allMessages = allMessages.slice(0, limit);
      }
      
      return {
        success: true,
        messages: allMessages,
        total: allMessages.length,
        archive_files: archiveFiles.length,
        timestamp: new Date().toISOString()
      };
      
    } catch (error) {
      await logger.error('Failed to get archived messages', { error: error.message, params });
      return {
        success: false,
        error: {
          message: 'Failed to get archived messages',
          details: error.message
        }
      };
    }
  }

  /**
   * Get message statistics (aggregated across all storage locations)
   */
  async getMessageStats(params = {}) {
    try {
      const { instanceId = null } = params;
      
      await this.initialize();
      
      let totalStats = {
        inbox: {
          total: 0,
          unread: 0,
          read: 0,
          by_priority: { high: 0, normal: 0, low: 0 },
          by_type: {},
          by_storage: { global: 0, project: 0, instance: 0 }
        },
        archive: { total: 0, files: 0 }
      };
      
      // Get messages and aggregate stats
      const messagesResult = await this.getMessages({ instanceId });
      if (messagesResult.success) {
        const messages = messagesResult.messages;
        
        totalStats.inbox.total = messages.length;
        totalStats.inbox.unread = messages.filter(m => m.status === 'unread').length;
        totalStats.inbox.read = messages.filter(m => m.status === 'read').length;
        
        // Priority stats
        messages.forEach(message => {
          const priority = message.priority || 'normal';
          totalStats.inbox.by_priority[priority] = (totalStats.inbox.by_priority[priority] || 0) + 1;
          
          const type = message.type || 'general';
          totalStats.inbox.by_type[type] = (totalStats.inbox.by_type[type] || 0) + 1;
          
          if (message._storage_info) {
            const storageType = message._storage_info.type;
            totalStats.inbox.by_storage[storageType] = (totalStats.inbox.by_storage[storageType] || 0) + 1;
          }
        });
      }
      
      // Get archive stats
      const archiveResult = await this.getArchivedMessages({ instanceId });
      if (archiveResult.success) {
        totalStats.archive.total = archiveResult.total;
        totalStats.archive.files = archiveResult.archive_files;
      }
      
      return {
        success: true,
        stats: totalStats,
        timestamp: new Date().toISOString(),
        metadata: {
          schema_version: '3.0',
          routing_enabled: true,
          instance_filter: instanceId || 'all'
        }
      };
      
    } catch (error) {
      await logger.error('Failed to get message statistics', { error: error.message, params });
      return {
        success: false,
        error: {
          message: 'Failed to get message statistics',
          details: error.message
        }
      };
    }
  }

  /**
   * Delete a message permanently (routing-aware)
   */
  async deleteMessage(params) {
    try {
      const { id, hard_delete = false } = params;
      
      if (!id) {
        return {
          success: false,
          error: { message: 'Message ID is required' }
        };
      }
      
      if (!hard_delete) {
        // Soft delete - just archive the message
        return await this.archiveMessage(params);
      }
      
      // Hard delete - find and remove permanently
      const messageResult = await this.getMessage({ id });
      if (!messageResult.success) {
        return messageResult;
      }
      
      const message = messageResult.message;
      const storagePath = message._storage_info.path;
      
      // Load the storage file
      const data = await FileManager.readJSON(storagePath);
      const messageIndex = data.messages?.findIndex(m => m.id === id);
      
      if (messageIndex === -1) {
        return {
          success: false,
          error: { message: `Message '${id}' not found in storage` }
        };
      }
      
      const removed = data.messages.splice(messageIndex, 1)[0];
      data.last_updated = new Date().toISOString();
      
      await FileManager.writeJSON(storagePath, data);
      
      return {
        success: true,
        message: removed,
        message_text: `Message '${id}' permanently deleted`
      };
      
    } catch (error) {
      await logger.error('Failed to delete message', { error: error.message, params });
      return {
        success: false,
        error: {
          message: 'Failed to delete message',
          details: error.message
        }
      };
    }
  }
}

// Export individual functions for MCP server integration
const messageHandlerV3 = new MessageHandlerV3();

export const sendMessage = (params) => messageHandlerV3.sendMessage(params);
export const getMessages = (params) => messageHandlerV3.getMessages(params);
export const getMessage = (params) => messageHandlerV3.getMessage(params);
export const markMessageRead = (params) => messageHandlerV3.markMessageRead(params);
export const archiveMessage = (params) => messageHandlerV3.archiveMessage(params);
export const getArchivedMessages = (params) => messageHandlerV3.getArchivedMessages(params);
export const getMessageStats = (params) => messageHandlerV3.getMessageStats(params);
export const deleteMessage = (params) => messageHandlerV3.deleteMessage(params);

// Export the router for bootstrap integration
export const createInstanceDirectory = (instanceId) => messageHandlerV3.createInstanceDirectory(instanceId);

export default MessageHandlerV3;