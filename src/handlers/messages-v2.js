/**
 * MCP Coordination System - Message System Handler v2.0
 * Project-Specific Message Collections Architecture
 * Implements project-scoped messaging with backward compatibility
 *
 * @author claude-code-COO-MessageArchitect-2025-08-24-2200
 */

import { promises as fs } from 'fs';
import { join, dirname } from 'path';
import { randomUUID } from 'crypto';

const DATA_DIR = 'data';
const PROJECTS_DIR = join(DATA_DIR, 'projects');
const SYSTEM_MESSAGES_DIR = join(DATA_DIR, 'messages');
const SYSTEM_INBOX_FILE = join(SYSTEM_MESSAGES_DIR, 'inbox', 'inbox.json');

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
 * Message System Functions - Project-Specific Architecture
 */
export class MessageHandler {
  
  /**
   * Get path to project's message directories
   */
  static getProjectMessageDir(projectId) {
    return join(PROJECTS_DIR, projectId, 'messages');
  }

  static getProjectInboxFile(projectId) {
    return join(this.getProjectMessageDir(projectId), 'inbox', 'inbox.json');
  }

  static getProjectSentFile(projectId) {
    return join(this.getProjectMessageDir(projectId), 'sent', 'sent.json');
  }

  static getProjectArchiveDir(projectId) {
    return join(this.getProjectMessageDir(projectId), 'archive');
  }

  /**
   * Initialize project message directories if they don't exist
   */
  static async initializeProject(projectId) {
    const messageDir = this.getProjectMessageDir(projectId);
    const inboxFile = this.getProjectInboxFile(projectId);
    const sentFile = this.getProjectSentFile(projectId);
    const archiveDir = this.getProjectArchiveDir(projectId);
    
    // Create directories
    await fs.mkdir(join(messageDir, 'inbox'), { recursive: true });
    await fs.mkdir(join(messageDir, 'sent'), { recursive: true });
    await fs.mkdir(archiveDir, { recursive: true });
    
    const defaultInboxData = {
      schema_version: '2.0',
      project_id: projectId,
      message_type: 'project_inbox',
      created: new Date().toISOString(),
      last_updated: new Date().toISOString(),
      messages: []
    };

    const defaultSentData = {
      schema_version: '2.0',
      project_id: projectId,
      message_type: 'project_sent',
      created: new Date().toISOString(),
      last_updated: new Date().toISOString(),
      messages: []
    };
    
    await FileManager.ensureFile(inboxFile, defaultInboxData);
    await FileManager.ensureFile(sentFile, defaultSentData);
    
    return { inbox: inboxFile, sent: sentFile, archive: archiveDir };
  }

  /**
   * Initialize system-level messages (backward compatibility)
   */
  static async initializeSystemMessages() {
    await fs.mkdir(join(SYSTEM_MESSAGES_DIR, 'inbox'), { recursive: true });
    await fs.mkdir(join(SYSTEM_MESSAGES_DIR, 'archive'), { recursive: true });
    
    const defaultInboxData = {
      schema_version: '2.0',
      message_type: 'system_inbox',
      created: new Date().toISOString(),
      last_updated: new Date().toISOString(),
      messages: []
    };
    
    return await FileManager.ensureFile(SYSTEM_INBOX_FILE, defaultInboxData);
  }

  /**
   * Get all projects that have message directories
   */
  static async getProjectsWithMessages() {
    try {
      const projects = [];
      const projectDirs = await fs.readdir(PROJECTS_DIR, { withFileTypes: true });
      
      for (const dir of projectDirs) {
        if (dir.isDirectory()) {
          const messageDir = this.getProjectMessageDir(dir.name);
          try {
            await fs.access(messageDir);
            projects.push(dir.name);
          } catch {
            // Project has no messages directory yet
          }
        }
      }
      
      return projects;
    } catch (error) {
      return []; // No projects directory yet
    }
  }

  /**
   * Determine message routing based on recipients and content
   */
  static determineMessageRouting(to, content, type) {
    const routing = {
      isSystemMessage: false,
      isProjectMessage: false,
      isBroadcast: false,
      projectId: null,
      recipients: []
    };

    // System-wide broadcasts
    if (to === 'all' || to === 'system') {
      routing.isSystemMessage = true;
      routing.isBroadcast = true;
      return routing;
    }

    // Role-based system messages
    if (['COO', 'PM', 'PA', 'Developer', 'Tester', 'Designer'].includes(to)) {
      routing.isSystemMessage = true;
      return routing;
    }

    // Project-specific routing
    const projectMatch = to.match(/^(.+)@(.+)$/);
    if (projectMatch) {
      const [, role, projectId] = projectMatch;
      routing.isProjectMessage = true;
      routing.projectId = projectId;
      routing.recipients.push({ role, projectId });
      return routing;
    }

    // Project team broadcast
    const teamMatch = to.match(/^project-team:(.+)$/);
    if (teamMatch) {
      routing.isProjectMessage = true;
      routing.isBroadcast = true;
      routing.projectId = teamMatch[1];
      return routing;
    }

    // Specific instance ID - could be system or project
    routing.isSystemMessage = true; // Default to system for specific instances
    routing.recipients.push({ instanceId: to });
    return routing;
  }

  /**
   * Send a message with project-aware routing
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
        thread_id = null,
        project_id = null // Explicit project context
      } = params;
      
      if (!from || !subject || !content) {
        return {
          success: false,
          error: { message: 'From, subject, and content are required' }
        };
      }
      
      // Determine routing
      const routing = this.determineMessageRouting(to, content, type);
      const finalProjectId = project_id || routing.projectId;

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
        priority: ['urgent', 'high', 'normal', 'low'].includes(priority) ? priority : 'normal',
        status: 'unread',
        created: now,
        metadata: {
          tags: Array.isArray(tags) ? tags : [],
          thread_id,
          project_id: finalProjectId,
          routing_type: routing.isProjectMessage ? 'project' : 'system',
          is_broadcast: routing.isBroadcast
        }
      };

      const deliveryResults = [];

      // Project-specific delivery
      if (routing.isProjectMessage && finalProjectId) {
        await this.initializeProject(finalProjectId);
        const inboxFile = this.getProjectInboxFile(finalProjectId);
        const inboxData = await FileManager.readJSON(inboxFile);
        
        inboxData.messages = inboxData.messages || [];
        inboxData.messages.push(message);
        inboxData.last_updated = now;
        
        await FileManager.writeJSON(inboxFile, inboxData);
        
        deliveryResults.push({
          location: 'project_inbox',
          project_id: finalProjectId,
          file: inboxFile
        });

        // Also store in sender's sent messages if project context
        const sentFile = this.getProjectSentFile(finalProjectId);
        const sentData = await FileManager.readJSON(sentFile);
        
        const sentMessage = { ...message, status: 'sent', sent_at: now };
        sentData.messages = sentData.messages || [];
        sentData.messages.push(sentMessage);
        sentData.last_updated = now;
        
        await FileManager.writeJSON(sentFile, sentData);
      }

      // System-wide delivery (including backward compatibility)
      if (routing.isSystemMessage || routing.isBroadcast) {
        await this.initializeSystemMessages();
        const systemData = await FileManager.readJSON(SYSTEM_INBOX_FILE);
        
        systemData.messages = systemData.messages || [];
        systemData.messages.push(message);
        systemData.last_updated = now;
        
        await FileManager.writeJSON(SYSTEM_INBOX_FILE, systemData);
        
        deliveryResults.push({
          location: 'system_inbox',
          file: SYSTEM_INBOX_FILE
        });
      }
      
      return {
        success: true,
        message,
        delivery: deliveryResults,
        routing: routing,
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
   * Get messages from a specific project
   */
  static async getProjectMessages(projectId, filters = {}) {
    try {
      const inboxFile = this.getProjectInboxFile(projectId);
      const inboxData = await FileManager.readJSON(inboxFile);
      
      if (!inboxData) return [];
      
      let messages = inboxData.messages || [];
      
      // Apply filters
      const { 
        from, 
        status, 
        type, 
        priority, 
        tags, 
        unread_only = false,
        limit = null,
        include_sent = false
      } = filters;
      
      // Include sent messages if requested
      if (include_sent) {
        const sentFile = this.getProjectSentFile(projectId);
        const sentData = await FileManager.readJSON(sentFile);
        if (sentData && sentData.messages) {
          messages = messages.concat(sentData.messages.map(m => ({ ...m, message_source: 'sent' })));
        }
      }
      
      // Apply filters
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
      
      if (tags && tags.length > 0) {
        messages = messages.filter(m => 
          tags.some(tag => m.metadata?.tags?.includes(tag))
        );
      }
      
      if (unread_only) {
        messages = messages.filter(m => m.status === 'unread');
      }
      
      // Sort by created date (newest first)
      messages.sort((a, b) => new Date(b.created) - new Date(a.created));
      
      // Apply limit
      if (limit && limit > 0) {
        messages = messages.slice(0, limit);
      }
      
      // Add project_id back to each message for API compatibility
      return messages.map(message => ({
        ...message,
        project_id: projectId
      }));
    } catch (error) {
      return [];
    }
  }

  /**
   * Get messages with optional filtering (aggregates across system and projects)
   */
  static async getMessages(params = {}) {
    try {
      const { project_id, instanceId, ...otherFilters } = params;
      
      // If specific project requested, get only those messages
      if (project_id) {
        const projectMessages = await this.getProjectMessages(project_id, otherFilters);
        return {
          success: true,
          messages: projectMessages,
          total: projectMessages.length,
          metadata: {
            schema_version: '2.0',
            project_specific: true,
            project_id,
            last_updated: new Date().toISOString()
          }
        };
      }

      // Get messages from all sources
      let allMessages = [];

      // System messages (backward compatibility)
      await this.initializeSystemMessages();
      const systemData = await FileManager.readJSON(SYSTEM_INBOX_FILE);
      if (systemData && systemData.messages) {
        // Filter system messages by recipient if instanceId provided
        let systemMessages = systemData.messages;
        if (instanceId) {
          systemMessages = systemMessages.filter(m => 
            m.to === instanceId || 
            m.to === 'all' || 
            (m.from === instanceId && otherFilters.include_sent)
          );
        }
        systemMessages = systemMessages.map(m => ({ ...m, message_source: 'system' }));
        allMessages = allMessages.concat(systemMessages);
      }

      // Project messages
      const projects = await this.getProjectsWithMessages();
      for (const projectId of projects) {
        const projectMessages = await this.getProjectMessages(projectId, {
          ...otherFilters,
          include_sent: instanceId ? true : otherFilters.include_sent
        });
        // Filter project messages by instanceId if provided
        if (instanceId) {
          const filteredProjectMessages = projectMessages.filter(m =>
            m.to === instanceId || 
            m.to === `project-team:${projectId}` ||
            m.to.includes(`@${projectId}`) ||
            (m.from === instanceId && otherFilters.include_sent)
          );
          allMessages = allMessages.concat(filteredProjectMessages.map(m => ({ ...m, message_source: 'project' })));
        } else {
          allMessages = allMessages.concat(projectMessages.map(m => ({ ...m, message_source: 'project' })));
        }
      }

      // Apply additional filters
      const { 
        from, 
        status, 
        type, 
        priority, 
        tags, 
        unread_only = false,
        limit = null
      } = otherFilters;
      
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
      
      if (tags && tags.length > 0) {
        allMessages = allMessages.filter(m => 
          tags.some(tag => m.metadata?.tags?.includes(tag))
        );
      }
      
      if (unread_only) {
        allMessages = allMessages.filter(m => m.status === 'unread');
      }
      
      // Sort by priority then by created date (newest first)
      const priorityOrder = { urgent: 4, high: 3, normal: 2, low: 1 };
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
          schema_version: '2.0',
          project_specific: false,
          projects_included: projects,
          includes_system_messages: true,
          last_updated: new Date().toISOString()
        }
      };
    } catch (error) {
      return {
        success: false,
        error: { message: error.message },
        messages: [],
        total: 0
      };
    }
  }

  /**
   * Get a specific message by ID (searches across all projects and system)
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

      // Search system messages first
      await this.initializeSystemMessages();
      const systemData = await FileManager.readJSON(SYSTEM_INBOX_FILE);
      if (systemData && systemData.messages) {
        const systemMessage = systemData.messages.find(m => m.id === id);
        if (systemMessage) {
          return {
            success: true,
            message: { ...systemMessage, message_source: 'system' },
            metadata: {
              found_in: 'system_inbox'
            }
          };
        }
      }

      // Search project messages
      const projects = await this.getProjectsWithMessages();
      
      for (const projectId of projects) {
        // Check inbox
        const inboxMessages = await this.getProjectMessages(projectId);
        const inboxMessage = inboxMessages.find(m => m.id === id);
        if (inboxMessage) {
          return {
            success: true,
            message: { ...inboxMessage, message_source: 'project' },
            metadata: {
              project_id: projectId,
              found_in: 'project_inbox'
            }
          };
        }

        // Check sent messages
        const sentFile = this.getProjectSentFile(projectId);
        const sentData = await FileManager.readJSON(sentFile);
        if (sentData && sentData.messages) {
          const sentMessage = sentData.messages.find(m => m.id === id);
          if (sentMessage) {
            return {
              success: true,
              message: { ...sentMessage, message_source: 'project' },
              metadata: {
                project_id: projectId,
                found_in: 'project_sent'
              }
            };
          }
        }
      }

      return {
        success: false,
        error: { message: `Message with ID '${id}' not found` }
      };
    } catch (error) {
      return {
        success: false,
        error: { message: error.message }
      };
    }
  }

  /**
   * Mark message as read (searches across all locations)
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

      const now = new Date().toISOString();
      
      // Try system messages first
      await this.initializeSystemMessages();
      const systemData = await FileManager.readJSON(SYSTEM_INBOX_FILE);
      if (systemData && systemData.messages) {
        const messageIndex = systemData.messages.findIndex(m => m.id === id);
        if (messageIndex !== -1) {
          systemData.messages[messageIndex].status = 'read';
          systemData.messages[messageIndex].read_at = now;
          if (reader_id) {
            systemData.messages[messageIndex].read_by = reader_id;
          }
          systemData.last_updated = now;
          
          await FileManager.writeJSON(SYSTEM_INBOX_FILE, systemData);
          
          return {
            success: true,
            message: systemData.messages[messageIndex],
            message_text: `Message '${id}' marked as read`
          };
        }
      }

      // Try project messages
      const projects = await this.getProjectsWithMessages();
      
      for (const projectId of projects) {
        const inboxFile = this.getProjectInboxFile(projectId);
        const inboxData = await FileManager.readJSON(inboxFile);
        
        if (inboxData && inboxData.messages) {
          const messageIndex = inboxData.messages.findIndex(m => m.id === id);
          if (messageIndex !== -1) {
            inboxData.messages[messageIndex].status = 'read';
            inboxData.messages[messageIndex].read_at = now;
            if (reader_id) {
              inboxData.messages[messageIndex].read_by = reader_id;
            }
            inboxData.last_updated = now;
            
            await FileManager.writeJSON(inboxFile, inboxData);
            
            return {
              success: true,
              message: inboxData.messages[messageIndex],
              message_text: `Message '${id}' marked as read`
            };
          }
        }
      }

      return {
        success: false,
        error: { message: `Message '${id}' not found` }
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

      const now = new Date().toISOString();
      const archiveDate = now.substring(0, 7); // YYYY-MM
      
      // Try system messages first
      await this.initializeSystemMessages();
      const systemData = await FileManager.readJSON(SYSTEM_INBOX_FILE);
      if (systemData && systemData.messages) {
        const messageIndex = systemData.messages.findIndex(m => m.id === id);
        if (messageIndex !== -1) {
          const message = systemData.messages.splice(messageIndex, 1)[0];
          message.archived_at = now;
          if (archiver_id) {
            message.archived_by = archiver_id;
          }
          
          systemData.last_updated = now;
          await FileManager.writeJSON(SYSTEM_INBOX_FILE, systemData);
          
          // Save to system archive
          const archiveFile = join(SYSTEM_MESSAGES_DIR, 'archive', `${archiveDate}.json`);
          let archiveData = await FileManager.readJSON(archiveFile);
          if (!archiveData) {
            archiveData = {
              schema_version: '2.0',
              message_type: 'system_archive',
              archive_month: archiveDate,
              created: now,
              last_updated: now,
              messages: []
            };
          }
          
          archiveData.messages.push(message);
          archiveData.last_updated = now;
          await FileManager.writeJSON(archiveFile, archiveData);
          
          return {
            success: true,
            message,
            archive_file: archiveFile,
            message_text: `Message '${id}' archived successfully`
          };
        }
      }

      // Try project messages
      const projects = await this.getProjectsWithMessages();
      
      for (const projectId of projects) {
        const inboxFile = this.getProjectInboxFile(projectId);
        const inboxData = await FileManager.readJSON(inboxFile);
        
        if (inboxData && inboxData.messages) {
          const messageIndex = inboxData.messages.findIndex(m => m.id === id);
          if (messageIndex !== -1) {
            const message = inboxData.messages.splice(messageIndex, 1)[0];
            message.archived_at = now;
            if (archiver_id) {
              message.archived_by = archiver_id;
            }
            
            inboxData.last_updated = now;
            await FileManager.writeJSON(inboxFile, inboxData);
            
            // Save to project archive
            const archiveDir = this.getProjectArchiveDir(projectId);
            const archiveFile = join(archiveDir, `${archiveDate}.json`);
            let archiveData = await FileManager.readJSON(archiveFile);
            if (!archiveData) {
              archiveData = {
                schema_version: '2.0',
                message_type: 'project_archive',
                project_id: projectId,
                archive_month: archiveDate,
                created: now,
                last_updated: now,
                messages: []
              };
            }
            
            archiveData.messages.push(message);
            archiveData.last_updated = now;
            await FileManager.writeJSON(archiveFile, archiveData);
            
            return {
              success: true,
              message,
              archive_file: archiveFile,
              message_text: `Message '${id}' archived successfully`
            };
          }
        }
      }

      return {
        success: false,
        error: { message: `Message '${id}' not found` }
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
   * Get message statistics
   */
  static async getMessageStats(params = {}) {
    try {
      await this.initializeSystemMessages();
      const systemData = await FileManager.readJSON(SYSTEM_INBOX_FILE);
      
      const stats = {
        system: {
          inbox: {
            total: systemData?.messages?.length || 0,
            unread: systemData?.messages?.filter(m => m.status === 'unread').length || 0,
            read: systemData?.messages?.filter(m => m.status === 'read').length || 0,
            by_priority: {
              urgent: systemData?.messages?.filter(m => m.priority === 'urgent').length || 0,
              high: systemData?.messages?.filter(m => m.priority === 'high').length || 0,
              normal: systemData?.messages?.filter(m => m.priority === 'normal').length || 0,
              low: systemData?.messages?.filter(m => m.priority === 'low').length || 0
            }
          },
          archive: { total: 0, files: 0 }
        },
        projects: {},
        totals: {
          messages: 0,
          unread: 0,
          projects_with_messages: 0
        }
      };

      // Count system messages
      stats.totals.messages += stats.system.inbox.total;
      stats.totals.unread += stats.system.inbox.unread;

      // Count system archive
      try {
        const archiveFiles = await fs.readdir(join(SYSTEM_MESSAGES_DIR, 'archive'));
        stats.system.archive.files = archiveFiles.filter(f => f.endsWith('.json')).length;
        
        for (const file of archiveFiles) {
          if (file.endsWith('.json')) {
            const archiveData = await FileManager.readJSON(join(SYSTEM_MESSAGES_DIR, 'archive', file));
            if (archiveData && archiveData.messages) {
              stats.system.archive.total += archiveData.messages.length;
              stats.totals.messages += archiveData.messages.length;
            }
          }
        }
      } catch (error) {
        // Archive directory might not exist
      }

      // Count project messages
      const projects = await this.getProjectsWithMessages();
      stats.totals.projects_with_messages = projects.length;

      for (const projectId of projects) {
        const projectMessages = await this.getProjectMessages(projectId, { include_sent: true });
        const projectStats = {
          total: projectMessages.length,
          unread: projectMessages.filter(m => m.status === 'unread').length,
          read: projectMessages.filter(m => m.status === 'read').length,
          sent: projectMessages.filter(m => m.message_source === 'sent').length,
          by_priority: {
            urgent: projectMessages.filter(m => m.priority === 'urgent').length,
            high: projectMessages.filter(m => m.priority === 'high').length,
            normal: projectMessages.filter(m => m.priority === 'normal').length,
            low: projectMessages.filter(m => m.priority === 'low').length
          }
        };

        stats.projects[projectId] = projectStats;
        stats.totals.messages += projectStats.total;
        stats.totals.unread += projectStats.unread;
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
}

// Export individual functions for backwards compatibility and MCP server integration
export const sendMessage = (params) => MessageHandler.sendMessage(params);
export const getMessages = (params) => MessageHandler.getMessages(params);
export const getMessage = (params) => MessageHandler.getMessage(params);
export const markMessageRead = (params) => MessageHandler.markMessageRead(params);
export const archiveMessage = (params) => MessageHandler.archiveMessage(params);
export const getMessageStats = (params) => MessageHandler.getMessageStats(params);

export default MessageHandler;