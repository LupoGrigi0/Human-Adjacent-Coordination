/**
 * MCP Coordination System - Message System Handler
 * Provides inter-instance messaging with inbox/archive functionality
 *
 * @author claude-code-BackendExpert-2025-08-23-1500
 */

import { promises as fs } from 'fs';
import { join, dirname } from 'path';
import { randomUUID } from 'crypto';

const DATA_DIR = 'data';
const MESSAGES_DIR = join(DATA_DIR, 'messages');
const INBOX_FILE = join(MESSAGES_DIR, 'inbox', 'inbox.json');
const ARCHIVE_DIR = join(MESSAGES_DIR, 'archive');

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
 * Message System Functions
 */
export class MessageHandler {
  
  /**
   * Initialize messages data structures if they don't exist
   */
  static async initialize() {
    // Ensure directories exist
    await fs.mkdir(join(MESSAGES_DIR, 'inbox'), { recursive: true });
    await fs.mkdir(join(MESSAGES_DIR, 'archive'), { recursive: true });
    
    const defaultInboxData = {
      schema_version: '1.0',
      created: new Date().toISOString(),
      last_updated: new Date().toISOString(),
      messages: []
    };
    
    return await FileManager.ensureFile(INBOX_FILE, defaultInboxData);
  }

  /**
   * Send a message to the system
   */
  static async sendMessage(params) {
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
      const data = await FileManager.readJSON(INBOX_FILE);
      
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
          thread_id
        }
      };
      
      data.messages = data.messages || [];
      data.messages.push(message);
      data.last_updated = now;
      
      await FileManager.writeJSON(INBOX_FILE, data);
      
      return {
        success: true,
        message,
        message_text: `Message '${subject}' sent successfully`
      };
      
    } catch (error) {
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
   * Get messages from inbox with optional filtering
   */
  static async getMessages(params = {}) {
    try {
      await this.initialize();
      const data = await FileManager.readJSON(INBOX_FILE);
      
      let messages = data.messages || [];
      
      // Apply filters
      const { 
        to, 
        from, 
        status, 
        type, 
        priority, 
        tags, 
        unread_only = false,
        limit = null
      } = params;
      
      if (to && to !== 'all') {
        messages = messages.filter(m => m.to === to || m.to === 'all');
      }
      
      if (from) {
        messages = messages.filter(m => m.from === from);
      }
      
      if (status) {
        const statuses = Array.isArray(status) ? status : [status];
        messages = messages.filter(m => statuses.includes(m.status));
      }
      
      if (type) {
        const types = Array.isArray(type) ? type : [type];
        messages = messages.filter(m => types.includes(m.type));
      }
      
      if (priority) {
        const priorities = Array.isArray(priority) ? priority : [priority];
        messages = messages.filter(m => priorities.includes(m.priority));
      }
      
      if (tags) {
        const filterTags = Array.isArray(tags) ? tags : [tags];
        messages = messages.filter(m => 
          filterTags.some(tag => m.metadata?.tags?.includes(tag))
        );
      }
      
      if (unread_only) {
        messages = messages.filter(m => m.status === 'unread');
      }
      
      // Sort by priority (high, normal, low) then by created date (newest first)
      const priorityOrder = { high: 3, normal: 2, low: 1 };
      messages.sort((a, b) => {
        const priorityDiff = (priorityOrder[b.priority] || 0) - (priorityOrder[a.priority] || 0);
        if (priorityDiff !== 0) return priorityDiff;
        return new Date(b.created) - new Date(a.created);
      });
      
      // Apply limit if specified
      if (limit && limit > 0) {
        messages = messages.slice(0, limit);
      }
      
      return {
        success: true,
        messages,
        total: messages.length,
        metadata: {
          schema_version: data.schema_version,
          last_updated: data.last_updated
        }
      };
      
    } catch (error) {
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
   * Get specific message by ID
   */
  static async getMessage(params) {
    try {
      const { id } = params;
      
      if (!id) {
        return {
          success: false,
          error: { message: 'Message ID is required' }
        };
      }
      
      await this.initialize();
      const data = await FileManager.readJSON(INBOX_FILE);
      
      const message = data.messages?.find(m => m.id === id);
      
      if (!message) {
        return {
          success: false,
          error: { message: `Message '${id}' not found` }
        };
      }
      
      return {
        success: true,
        message
      };
      
    } catch (error) {
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
   * Mark message as read
   */
  static async markMessageRead(params) {
    try {
      const { id, reader_id } = params;
      
      if (!id) {
        return {
          success: false,
          error: { message: 'Message ID is required' }
        };
      }
      
      await this.initialize();
      const data = await FileManager.readJSON(INBOX_FILE);
      
      const messageIndex = data.messages?.findIndex(m => m.id === id);
      
      if (messageIndex === -1) {
        return {
          success: false,
          error: { message: `Message '${id}' not found` }
        };
      }
      
      const message = data.messages[messageIndex];
      message.status = 'read';
      message.read_at = new Date().toISOString();
      if (reader_id) {
        message.read_by = reader_id;
      }
      
      data.last_updated = new Date().toISOString();
      
      await FileManager.writeJSON(INBOX_FILE, data);
      
      return {
        success: true,
        message,
        message_text: `Message '${id}' marked as read`
      };
      
    } catch (error) {
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
   * Archive a message (move from inbox to archive)
   */
  static async archiveMessage(params) {
    try {
      const { id, archiver_id } = params;
      
      if (!id) {
        return {
          success: false,
          error: { message: 'Message ID is required' }
        };
      }
      
      await this.initialize();
      const inboxData = await FileManager.readJSON(INBOX_FILE);
      
      const messageIndex = inboxData.messages?.findIndex(m => m.id === id);
      
      if (messageIndex === -1) {
        return {
          success: false,
          error: { message: `Message '${id}' not found in inbox` }
        };
      }
      
      // Remove from inbox
      const message = inboxData.messages.splice(messageIndex, 1)[0];
      message.archived_at = new Date().toISOString();
      if (archiver_id) {
        message.archived_by = archiver_id;
      }
      
      inboxData.last_updated = new Date().toISOString();
      
      // Save updated inbox
      await FileManager.writeJSON(INBOX_FILE, inboxData);
      
      // Create monthly archive file
      const archiveDate = new Date().toISOString().substring(0, 7); // YYYY-MM
      const archiveFile = join(ARCHIVE_DIR, `${archiveDate}.json`);
      
      // Load or create archive file
      let archiveData = await FileManager.readJSON(archiveFile);
      if (!archiveData) {
        archiveData = {
          schema_version: '1.0',
          archive_month: archiveDate,
          created: new Date().toISOString(),
          last_updated: new Date().toISOString(),
          messages: []
        };
      }
      
      // Add message to archive
      archiveData.messages.push(message);
      archiveData.last_updated = new Date().toISOString();
      
      await FileManager.writeJSON(archiveFile, archiveData);
      
      return {
        success: true,
        message,
        archive_file: archiveFile,
        message_text: `Message '${id}' archived successfully`
      };
      
    } catch (error) {
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
   * Get archived messages
   */
  static async getArchivedMessages(params = {}) {
    try {
      const { month, limit = 50 } = params;
      
      await fs.mkdir(ARCHIVE_DIR, { recursive: true });
      
      let archiveFiles = [];
      
      if (month) {
        // Specific month requested
        const archiveFile = join(ARCHIVE_DIR, `${month}.json`);
        const data = await FileManager.readJSON(archiveFile);
        if (data) {
          archiveFiles.push({ file: archiveFile, data });
        }
      } else {
        // Get all archive files
        const files = await fs.readdir(ARCHIVE_DIR);
        const jsonFiles = files.filter(f => f.endsWith('.json')).sort().reverse(); // Latest first
        
        for (const file of jsonFiles) {
          const data = await FileManager.readJSON(join(ARCHIVE_DIR, file));
          if (data) {
            archiveFiles.push({ file: join(ARCHIVE_DIR, file), data });
          }
        }
      }
      
      // Combine all messages
      let allMessages = [];
      archiveFiles.forEach(({ data }) => {
        allMessages = allMessages.concat(data.messages || []);
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
   * Get message statistics
   */
  static async getMessageStats(params = {}) {
    try {
      await this.initialize();
      const inboxData = await FileManager.readJSON(INBOX_FILE);
      
      const messages = inboxData.messages || [];
      
      const stats = {
        inbox: {
          total: messages.length,
          unread: messages.filter(m => m.status === 'unread').length,
          read: messages.filter(m => m.status === 'read').length,
          by_priority: {
            high: messages.filter(m => m.priority === 'high').length,
            normal: messages.filter(m => m.priority === 'normal').length,
            low: messages.filter(m => m.priority === 'low').length
          },
          by_type: {}
        },
        archive: {
          total: 0,
          files: 0
        }
      };
      
      // Count messages by type
      messages.forEach(message => {
        const type = message.type || 'general';
        stats.inbox.by_type[type] = (stats.inbox.by_type[type] || 0) + 1;
      });
      
      // Count archived messages
      try {
        const archiveFiles = await fs.readdir(ARCHIVE_DIR);
        stats.archive.files = archiveFiles.filter(f => f.endsWith('.json')).length;
        
        for (const file of archiveFiles) {
          if (file.endsWith('.json')) {
            const archiveData = await FileManager.readJSON(join(ARCHIVE_DIR, file));
            if (archiveData && archiveData.messages) {
              stats.archive.total += archiveData.messages.length;
            }
          }
        }
      } catch (error) {
        // Archive directory might not exist or be empty
      }
      
      return {
        success: true,
        stats,
        timestamp: new Date().toISOString()
      };
      
    } catch (error) {
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
   * Delete a message permanently (use with caution)
   */
  static async deleteMessage(params) {
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
      
      // Hard delete - remove permanently
      await this.initialize();
      const data = await FileManager.readJSON(INBOX_FILE);
      
      const messageIndex = data.messages?.findIndex(m => m.id === id);
      
      if (messageIndex === -1) {
        return {
          success: false,
          error: { message: `Message '${id}' not found` }
        };
      }
      
      const removed = data.messages.splice(messageIndex, 1)[0];
      data.last_updated = new Date().toISOString();
      
      await FileManager.writeJSON(INBOX_FILE, data);
      
      return {
        success: true,
        message: removed,
        message_text: `Message '${id}' permanently deleted`
      };
      
    } catch (error) {
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
export const sendMessage = (params) => MessageHandler.sendMessage(params);
export const getMessages = (params) => MessageHandler.getMessages(params);
export const getMessage = (params) => MessageHandler.getMessage(params);
export const markMessageRead = (params) => MessageHandler.markMessageRead(params);
export const archiveMessage = (params) => MessageHandler.archiveMessage(params);
export const getArchivedMessages = (params) => MessageHandler.getArchivedMessages(params);
export const getMessageStats = (params) => MessageHandler.getMessageStats(params);
export const deleteMessage = (params) => MessageHandler.deleteMessage(params);

export default MessageHandler;