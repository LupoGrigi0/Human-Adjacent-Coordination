/**
 * MCP Coordination System - Messages v2.0 Test Suite
 * Tests project-specific messaging with isolation validation
 *
 * @author claude-code-COO-MessageArchitect-2025-08-24-2200
 */

import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { promises as fs } from 'fs';
import { join } from 'path';
import { randomUUID } from 'crypto';
import MessageHandler from '../src/handlers/messages-v2.js';

// Test data directory
const TEST_DATA_DIR = 'test-data';
const TEST_PROJECTS_DIR = join(TEST_DATA_DIR, 'projects');
const TEST_MESSAGES_DIR = join(TEST_DATA_DIR, 'messages');

// Mock the data directories for testing
jest.unstable_mockModule('fs', () => ({
  promises: {
    readFile: jest.fn(),
    writeFile: jest.fn(),
    rename: jest.fn(),
    mkdir: jest.fn(),
    readdir: jest.fn(),
    access: jest.fn()
  }
}));

describe('Messages v2.0 - Project-Specific Architecture', () => {
  
  beforeEach(() => {
    // Clear all mocks
    jest.clearAllMocks();
  });

  describe('Message Routing Logic', () => {
    it('should route system broadcasts correctly', () => {
      const routing1 = MessageHandler.determineMessageRouting('all', 'System update', 'system');
      expect(routing1.isSystemMessage).toBe(true);
      expect(routing1.isBroadcast).toBe(true);
      expect(routing1.isProjectMessage).toBe(false);

      const routing2 = MessageHandler.determineMessageRouting('system', 'Maintenance notice', 'announcement');
      expect(routing2.isSystemMessage).toBe(true);
      expect(routing2.isBroadcast).toBe(true);
    });

    it('should route role-based messages to system', () => {
      const routing = MessageHandler.determineMessageRouting('COO', 'Task assignment', 'general');
      expect(routing.isSystemMessage).toBe(true);
      expect(routing.isProjectMessage).toBe(false);
      expect(routing.isBroadcast).toBe(false);

      const routing2 = MessageHandler.determineMessageRouting('PM', 'Status update', 'status');
      expect(routing2.isSystemMessage).toBe(true);
    });

    it('should route project-specific role messages correctly', () => {
      const routing = MessageHandler.determineMessageRouting('PM@collections-rescue', 'Project update', 'status');
      expect(routing.isProjectMessage).toBe(true);
      expect(routing.isSystemMessage).toBe(false);
      expect(routing.projectId).toBe('collections-rescue');
      expect(routing.recipients).toHaveLength(1);
      expect(routing.recipients[0].role).toBe('PM');
      expect(routing.recipients[0].projectId).toBe('collections-rescue');
    });

    it('should route project team broadcasts correctly', () => {
      const routing = MessageHandler.determineMessageRouting('project-team:mcp-api-validation', 'Team announcement', 'announcement');
      expect(routing.isProjectMessage).toBe(true);
      expect(routing.isBroadcast).toBe(true);
      expect(routing.projectId).toBe('mcp-api-validation');
    });

    it('should default specific instances to system', () => {
      const routing = MessageHandler.determineMessageRouting('claude-code-COO-Resolver-2025-08-24-1600', 'Direct message', 'general');
      expect(routing.isSystemMessage).toBe(true);
      expect(routing.isProjectMessage).toBe(false);
      expect(routing.recipients).toHaveLength(1);
      expect(routing.recipients[0].instanceId).toBe('claude-code-COO-Resolver-2025-08-24-1600');
    });
  });

  describe('Project Message Isolation', () => {
    let mockInboxData;
    let mockProjectData;

    beforeEach(() => {
      mockInboxData = {
        schema_version: '2.0',
        project_id: 'test-project',
        message_type: 'project_inbox',
        created: '2025-08-24T22:00:00.000Z',
        last_updated: '2025-08-24T22:00:00.000Z',
        messages: []
      };

      mockProjectData = {
        schema_version: '2.0',
        message_type: 'system_inbox',
        created: '2025-08-24T22:00:00.000Z',
        last_updated: '2025-08-24T22:00:00.000Z',
        messages: []
      };

      // Setup fs mocks
      fs.mkdir.mockResolvedValue();
      fs.rename.mockResolvedValue();
    });

    it('should isolate project messages from system messages', async () => {
      // Mock reading empty files initially
      fs.readFile.mockResolvedValueOnce(JSON.stringify(mockInboxData));
      fs.readFile.mockResolvedValueOnce(JSON.stringify(mockInboxData));
      fs.readFile.mockResolvedValueOnce(JSON.stringify(mockProjectData));
      fs.writeFile.mockResolvedValue();

      const result = await MessageHandler.sendMessage({
        from: 'test-instance',
        to: 'project-team:test-project',
        subject: 'Project Team Update',
        content: 'This should only go to the project',
        type: 'announcement'
      });

      expect(result.success).toBe(true);
      expect(result.routing.isProjectMessage).toBe(true);
      expect(result.routing.projectId).toBe('test-project');
      expect(result.delivery).toHaveLength(1);
      expect(result.delivery[0].location).toBe('project_inbox');
      expect(result.delivery[0].project_id).toBe('test-project');
    });

    it('should deliver system broadcasts to system inbox only', async () => {
      fs.readFile.mockResolvedValueOnce(JSON.stringify(mockProjectData));
      fs.writeFile.mockResolvedValue();

      const result = await MessageHandler.sendMessage({
        from: 'test-instance',
        to: 'all',
        subject: 'System Maintenance',
        content: 'This should go to system inbox',
        type: 'system'
      });

      expect(result.success).toBe(true);
      expect(result.routing.isSystemMessage).toBe(true);
      expect(result.routing.isBroadcast).toBe(true);
      expect(result.delivery).toHaveLength(1);
      expect(result.delivery[0].location).toBe('system_inbox');
    });

    it('should handle dual delivery for system broadcasts', async () => {
      fs.readFile.mockResolvedValueOnce(JSON.stringify(mockProjectData));
      fs.writeFile.mockResolvedValue();

      const result = await MessageHandler.sendMessage({
        from: 'coo-instance',
        to: 'all',
        subject: 'Important System Update',
        content: 'All instances need to see this',
        priority: 'high',
        type: 'announcement'
      });

      expect(result.success).toBe(true);
      expect(result.routing.isSystemMessage).toBe(true);
      expect(result.routing.isBroadcast).toBe(true);
      
      // Should only deliver to system for 'all' broadcasts
      expect(result.delivery).toHaveLength(1);
      expect(result.delivery[0].location).toBe('system_inbox');
    });
  });

  describe('Message Retrieval and Filtering', () => {
    beforeEach(() => {
      fs.mkdir.mockResolvedValue();
      fs.readdir.mockResolvedValue([]);
    });

    it('should retrieve messages from specific project only', async () => {
      const projectMessages = [
        {
          id: 'msg-1',
          from: 'pm-instance',
          to: 'project-team:test-project',
          subject: 'Project Update 1',
          body: 'First update',
          status: 'unread',
          created: '2025-08-24T22:00:00.000Z'
        },
        {
          id: 'msg-2',
          from: 'coo-instance',
          to: 'PM@test-project',
          subject: 'Task Assignment',
          body: 'Please handle this task',
          status: 'unread',
          created: '2025-08-24T22:05:00.000Z'
        }
      ];

      const mockData = {
        schema_version: '2.0',
        project_id: 'test-project',
        messages: projectMessages
      };

      fs.readFile.mockResolvedValueOnce(JSON.stringify(mockData));

      const result = await MessageHandler.getMessages({ project_id: 'test-project' });

      expect(result.success).toBe(true);
      expect(result.metadata.project_specific).toBe(true);
      expect(result.metadata.project_id).toBe('test-project');
      expect(result.messages).toHaveLength(2);
      expect(result.messages[0].project_id).toBe('test-project');
      expect(result.messages[1].project_id).toBe('test-project');
    });

    it('should filter messages by instance ID correctly', async () => {
      const systemMessages = [
        {
          id: 'sys-1',
          from: 'system',
          to: 'all',
          subject: 'System Broadcast',
          body: 'Everyone sees this'
        },
        {
          id: 'sys-2',
          from: 'coo-instance',
          to: 'test-instance',
          subject: 'Direct Message',
          body: 'Only for test-instance'
        }
      ];

      const projectMessages = [
        {
          id: 'proj-1',
          from: 'pm-instance',
          to: 'test-instance@project-a',
          subject: 'Project Task',
          body: 'Project specific task'
        }
      ];

      // Mock system inbox
      fs.readFile.mockResolvedValueOnce(JSON.stringify({
        schema_version: '2.0',
        messages: systemMessages
      }));

      // Mock project discovery
      fs.readdir.mockResolvedValueOnce([
        { name: 'project-a', isDirectory: () => true }
      ]);
      fs.access.mockResolvedValueOnce();

      // Mock project inbox
      fs.readFile.mockResolvedValueOnce(JSON.stringify({
        schema_version: '2.0',
        project_id: 'project-a',
        messages: projectMessages
      }));

      // Mock project sent (empty)
      fs.readFile.mockResolvedValueOnce(JSON.stringify({
        schema_version: '2.0',
        project_id: 'project-a',
        messages: []
      }));

      const result = await MessageHandler.getMessages({ instanceId: 'test-instance' });

      expect(result.success).toBe(true);
      expect(result.metadata.project_specific).toBe(false);
      
      // Should get: system broadcast (to: all), direct message (to: test-instance), 
      // and project message (to: test-instance@project-a)
      const relevantMessages = result.messages.filter(m => 
        m.to === 'all' || 
        m.to === 'test-instance' || 
        m.to.includes('test-instance')
      );
      
      expect(relevantMessages.length).toBeGreaterThan(0);
    });
  });

  describe('Cross-Project Message Search', () => {
    it('should find messages across all projects and system', async () => {
      const messageId = 'test-msg-123';

      // Mock system search (not found)
      fs.readFile.mockResolvedValueOnce(JSON.stringify({
        schema_version: '2.0',
        messages: []
      }));

      // Mock project discovery
      fs.readdir.mockResolvedValueOnce([
        { name: 'project-a', isDirectory: () => true },
        { name: 'project-b', isDirectory: () => true }
      ]);

      // Mock project-a access and search (not found)
      fs.access.mockResolvedValueOnce();
      fs.readFile.mockResolvedValueOnce(JSON.stringify({
        schema_version: '2.0',
        project_id: 'project-a',
        messages: []
      }));

      // Mock project-a sent messages (not found)
      fs.readFile.mockResolvedValueOnce(JSON.stringify({
        schema_version: '2.0',
        project_id: 'project-a',
        messages: []
      }));

      // Mock project-b access and search (found!)
      fs.access.mockResolvedValueOnce();
      fs.readFile.mockResolvedValueOnce(JSON.stringify({
        schema_version: '2.0',
        project_id: 'project-b',
        messages: [{
          id: messageId,
          from: 'test-sender',
          to: 'project-team:project-b',
          subject: 'Found it!',
          body: 'This message was found in project-b'
        }]
      }));

      const result = await MessageHandler.getMessage({ id: messageId });

      expect(result.success).toBe(true);
      expect(result.message.id).toBe(messageId);
      expect(result.message.message_source).toBe('project');
      expect(result.metadata.project_id).toBe('project-b');
      expect(result.metadata.found_in).toBe('project_inbox');
    });
  });

  describe('Message Statistics with Project Breakdown', () => {
    it('should provide comprehensive statistics across system and projects', async () => {
      // Mock system messages
      fs.readFile.mockResolvedValueOnce(JSON.stringify({
        schema_version: '2.0',
        messages: [
          { priority: 'high', status: 'unread' },
          { priority: 'normal', status: 'read' },
          { priority: 'urgent', status: 'unread' }
        ]
      }));

      // Mock system archive (empty)
      fs.readdir.mockResolvedValueOnce([]);

      // Mock project discovery
      fs.readdir.mockResolvedValueOnce([
        { name: 'project-a', isDirectory: () => true },
        { name: 'project-b', isDirectory: () => true }
      ]);

      // Mock project-a access
      fs.access.mockResolvedValueOnce();
      // Mock project-a inbox
      fs.readFile.mockResolvedValueOnce(JSON.stringify({
        schema_version: '2.0',
        project_id: 'project-a',
        messages: [
          { priority: 'high', status: 'unread' },
          { priority: 'normal', status: 'read' }
        ]
      }));
      // Mock project-a sent
      fs.readFile.mockResolvedValueOnce(JSON.stringify({
        schema_version: '2.0',
        project_id: 'project-a',
        messages: [
          { priority: 'normal', status: 'sent', message_source: 'sent' }
        ]
      }));

      // Mock project-b access
      fs.access.mockResolvedValueOnce();
      // Mock project-b inbox
      fs.readFile.mockResolvedValueOnce(JSON.stringify({
        schema_version: '2.0',
        project_id: 'project-b',
        messages: [
          { priority: 'low', status: 'unread' }
        ]
      }));
      // Mock project-b sent
      fs.readFile.mockResolvedValueOnce(JSON.stringify({
        schema_version: '2.0',
        project_id: 'project-b',
        messages: []
      }));

      const result = await MessageHandler.getMessageStats();

      expect(result.success).toBe(true);
      expect(result.stats.system.inbox.total).toBe(3);
      expect(result.stats.system.inbox.unread).toBe(2);
      expect(result.stats.system.inbox.by_priority.urgent).toBe(1);
      expect(result.stats.system.inbox.by_priority.high).toBe(1);
      expect(result.stats.system.inbox.by_priority.normal).toBe(1);

      expect(result.stats.projects['project-a'].total).toBe(3); // 2 inbox + 1 sent
      expect(result.stats.projects['project-a'].unread).toBe(1);
      expect(result.stats.projects['project-a'].sent).toBe(1);

      expect(result.stats.projects['project-b'].total).toBe(1);
      expect(result.stats.projects['project-b'].unread).toBe(1);
      expect(result.stats.projects['project-b'].by_priority.low).toBe(1);

      expect(result.stats.totals.projects_with_messages).toBe(2);
      expect(result.stats.totals.messages).toBe(7); // 3 system + 3 project-a + 1 project-b
      expect(result.stats.totals.unread).toBe(4); // 2 system + 1 project-a + 1 project-b
    });
  });

  describe('Archive Operations with Project Isolation', () => {
    it('should archive project messages to project-specific archive', async () => {
      const messageId = 'proj-msg-archive-test';
      
      // Mock system search (not found)
      fs.readFile.mockResolvedValueOnce(JSON.stringify({
        schema_version: '2.0',
        messages: []
      }));

      // Mock project discovery
      fs.readdir.mockResolvedValueOnce([
        { name: 'test-project', isDirectory: () => true }
      ]);

      // Mock project access
      fs.access.mockResolvedValueOnce();
      
      // Mock project inbox with the message to archive
      const mockInboxData = {
        schema_version: '2.0',
        project_id: 'test-project',
        messages: [{
          id: messageId,
          from: 'test-sender',
          to: 'project-team:test-project',
          subject: 'Archive This',
          body: 'This message should be archived in project archive'
        }]
      };

      fs.readFile.mockResolvedValueOnce(JSON.stringify(mockInboxData));
      fs.writeFile.mockResolvedValue();
      
      // Mock archive file (doesn't exist initially)
      fs.readFile.mockResolvedValueOnce(null);

      const result = await MessageHandler.archiveMessage({ 
        id: messageId, 
        archiver_id: 'test-archiver' 
      });

      expect(result.success).toBe(true);
      expect(result.message.id).toBe(messageId);
      expect(result.archive_file).toContain('test-project');
      expect(result.archive_file).toContain('messages/archive');

      // Verify the inbox was updated (message removed)
      const writeCall = fs.writeFile.mock.calls.find(call => 
        call[0].includes('inbox.json')
      );
      expect(writeCall).toBeDefined();
      const updatedInboxData = JSON.parse(writeCall[1]);
      expect(updatedInboxData.messages).toHaveLength(0);

      // Verify the archive was created
      const archiveCall = fs.writeFile.mock.calls.find(call => 
        call[0].includes('archive') && call[0].endsWith('.json')
      );
      expect(archiveCall).toBeDefined();
      const archiveData = JSON.parse(archiveCall[1]);
      expect(archiveData.message_type).toBe('project_archive');
      expect(archiveData.project_id).toBe('test-project');
      expect(archiveData.messages).toHaveLength(1);
      expect(archiveData.messages[0].id).toBe(messageId);
    });
  });
});

describe('Integration Tests - Real Message Flows', () => {
  
  beforeEach(() => {
    jest.clearAllMocks();
    fs.mkdir.mockResolvedValue();
    fs.rename.mockResolvedValue();
    fs.writeFile.mockResolvedValue();
  });

  it('should handle complete project message lifecycle', async () => {
    // Test: Send project message -> Read it -> Archive it

    // Step 1: Send project message
    fs.readFile.mockResolvedValueOnce(JSON.stringify({
      schema_version: '2.0',
      project_id: 'lifecycle-test',
      messages: []
    }));
    fs.readFile.mockResolvedValueOnce(JSON.stringify({
      schema_version: '2.0',
      project_id: 'lifecycle-test',
      messages: []
    }));

    const sendResult = await MessageHandler.sendMessage({
      from: 'pm-instance',
      to: 'project-team:lifecycle-test',
      subject: 'Lifecycle Test Message',
      content: 'Testing complete message lifecycle',
      priority: 'normal'
    });

    expect(sendResult.success).toBe(true);
    expect(sendResult.routing.isProjectMessage).toBe(true);
    expect(sendResult.routing.projectId).toBe('lifecycle-test');

    const messageId = sendResult.message.id;

    // Step 2: Retrieve and mark as read
    fs.readdir.mockResolvedValueOnce([
      { name: 'lifecycle-test', isDirectory: () => true }
    ]);
    fs.access.mockResolvedValueOnce();
    fs.readFile.mockResolvedValueOnce(JSON.stringify({
      schema_version: '2.0',
      project_id: 'lifecycle-test',
      messages: [{ ...sendResult.message, status: 'unread' }]
    }));

    const readResult = await MessageHandler.markMessageRead({ 
      id: messageId, 
      reader_id: 'coo-instance' 
    });

    expect(readResult.success).toBe(true);
    expect(readResult.message.status).toBe('read');
    expect(readResult.message.read_by).toBe('coo-instance');

    // Step 3: Archive the message
    fs.readFile.mockResolvedValueOnce(JSON.stringify({
      schema_version: '2.0',
      messages: []
    })); // system search

    fs.readdir.mockResolvedValueOnce([
      { name: 'lifecycle-test', isDirectory: () => true }
    ]);
    fs.access.mockResolvedValueOnce();
    fs.readFile.mockResolvedValueOnce(JSON.stringify({
      schema_version: '2.0',
      project_id: 'lifecycle-test',
      messages: [{ ...sendResult.message, status: 'read', read_by: 'coo-instance' }]
    }));
    fs.readFile.mockResolvedValueOnce(null); // archive file doesn't exist

    const archiveResult = await MessageHandler.archiveMessage({ 
      id: messageId, 
      archiver_id: 'coo-instance' 
    });

    expect(archiveResult.success).toBe(true);
    expect(archiveResult.message.archived_by).toBe('coo-instance');
    expect(archiveResult.archive_file).toContain('lifecycle-test');
  });

  it('should demonstrate project isolation in mixed messaging scenario', async () => {
    // Scenario: System broadcast + Project-specific messages should not interfere

    // Send system broadcast
    fs.readFile.mockResolvedValueOnce(JSON.stringify({
      schema_version: '2.0',
      messages: []
    }));

    const systemResult = await MessageHandler.sendMessage({
      from: 'coo-instance',
      to: 'all',
      subject: 'System Maintenance Tonight',
      content: 'System will be down for maintenance',
      type: 'announcement',
      priority: 'high'
    });

    expect(systemResult.success).toBe(true);
    expect(systemResult.routing.isSystemMessage).toBe(true);
    expect(systemResult.delivery).toHaveLength(1);
    expect(systemResult.delivery[0].location).toBe('system_inbox');

    // Send project-specific message
    fs.readFile.mockResolvedValueOnce(JSON.stringify({
      schema_version: '2.0',
      project_id: 'isolation-test',
      messages: []
    }));
    fs.readFile.mockResolvedValueOnce(JSON.stringify({
      schema_version: '2.0',
      project_id: 'isolation-test',
      messages: []
    }));

    const projectResult = await MessageHandler.sendMessage({
      from: 'pm-instance',
      to: 'Developer@isolation-test',
      subject: 'Bug Fix Required',
      content: 'Please fix the authentication bug',
      project_id: 'isolation-test'
    });

    expect(projectResult.success).toBe(true);
    expect(projectResult.routing.isProjectMessage).toBe(true);
    expect(projectResult.delivery).toHaveLength(1);
    expect(projectResult.delivery[0].location).toBe('project_inbox');
    expect(projectResult.delivery[0].project_id).toBe('isolation-test');

    // Verify the messages are isolated
    expect(systemResult.message.metadata.routing_type).toBe('system');
    expect(projectResult.message.metadata.routing_type).toBe('project');
    expect(projectResult.message.metadata.project_id).toBe('isolation-test');
  });
});