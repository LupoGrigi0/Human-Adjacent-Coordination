/**
 * MCP Coordination System - Main Server
 * Entry point for the MCP server with bootstrap capability
 *
 * @author claude-code-MCP-Orion-2025-08-19-1430
 * @updated claude-code-BackendExpert-2025-08-23-1500
 */

import { bootstrap } from './bootstrap.js';
import { logger } from './logger.js';

// Import all handlers
import * as ProjectHandler from './handlers/projects.js';
import * as TaskHandler from './handlers/tasks-v2.js';
import * as MessageHandler from './handlers/messages-v3.js';
import * as InstanceHandler from './handlers/instances.js';
import { handlers as LessonHandlers } from './handlers/lessons.js';
import { handlers as MetaRecursiveHandlers } from './handlers/meta-recursive.js';
import { handlers as RoleHandlers } from './handlers/roles.js';

// V2 API handlers (Foundation's implementation)
import { bootstrap as bootstrapV2 } from './v2/bootstrap.js';
import { preApprove } from './v2/preApprove.js';
import { introspect } from './v2/introspect.js';
import { takeOnRole } from './v2/takeOnRole.js';
import { adoptPersonality } from './v2/adoptPersonality.js';
import { joinProject } from './v2/joinProject.js';
import { addDiaryEntry, getDiary } from './v2/diary.js';

/**
 * Simple server implementation for development and testing
 * Will be enhanced with full MCP protocol in subsequent tasks
 */
class MCPCoordinationServer {
  constructor(customLogger = null) {
    this.version = '2.0.0';
    this.protocol = 'mcp';
    this.status = 'starting';
    // Use custom logger if provided, otherwise use default logger
    this.logger = customLogger || logger;
  }

  /**
   * Initialize the server
   */
  async initialize() {
    try {
      await this.logger.info('Starting MCP Coordination System...');
      await this.logger.info(`Protocol: ${this.protocol}`);
      await this.logger.info(`Version: ${this.version}`);
      await this.logger.info(`Working Directory: ${process.cwd()}`);
      await this.logger.info(`__dirname: ${import.meta.url}`);
      await this.logger.info(`Data directory will be: ${process.cwd()}/data`);

      // Initialize data directories if they don't exist
      await this.ensureDataDirectories();

      this.status = 'operational';
      await this.logger.info('Server initialized successfully');
      await this.logger.info('Call bootstrap() to get started');

      return true;
    } catch (error) {
      await this.logger.error('Server initialization failed:', error.message);
      this.status = 'error';
      return false;
    }
  }

  /**
   * Ensure required data directories exist
   */
  async ensureDataDirectories() {
    const fs = await import('fs/promises');

    const directories = [
      'data',
      'data/projects',
      'data/messages',
      'data/messages/inbox',
      'data/messages/archive',
      'data/examples',
      'config',
      'logs',
    ];

    // Create directories sequentially to avoid issues
    await this.createDirectoriesSequentially(fs, directories);
  }

  async createDirectoriesSequentially(fs, directories) {
    // Use Promise.all for parallel directory creation (safe with recursive: true)
    const createPromises = directories.map(async (dir) => {
      try {
        await fs.mkdir(dir, { recursive: true });
      } catch (error) {
        // Directory might already exist, that's fine
        if (error.code !== 'EEXIST') {
          throw error;
        }
      }
    });

    await Promise.all(createPromises);
  }

  /**
   * Handle function calls - Full MCP implementation
   * Routes calls to appropriate handlers
   */
  async call(functionName, params = {}) {
    await this.logger.info(`Function call: ${functionName}`, params);

    try {
      // Auto-register instance if instanceId is provided
      if (params.instanceId && params.role) {
        await InstanceHandler.registerInstance({
          instanceId: params.instanceId,
          role: params.role
        });
      }

      // Update heartbeat for existing instances
      if (params.instanceId) {
        await InstanceHandler.updateHeartbeat({
          instanceId: params.instanceId
        });
      }

      switch (functionName) {
        // Bootstrap and system functions
        case 'bootstrap':
          return await bootstrap(params);

        case 'get_server_status':
          return {
            success: true,
            status: this.status,
            version: this.version,
            protocol: this.protocol,
            timestamp: new Date().toISOString(),
            functions_available: this.getAvailableFunctions().length,
          };

        // Project management functions
        case 'get_projects':
          return ProjectHandler.getProjects(params);
        case 'get_project':
          return ProjectHandler.getProject(params);
        case 'create_project':
          return ProjectHandler.createProject(params);
        case 'update_project':
          return ProjectHandler.updateProject(params);
        case 'delete_project':
          return ProjectHandler.deleteProject(params);
        case 'get_project_stats':
          return ProjectHandler.getProjectStats(params);

        // Task management functions
        case 'get_tasks':
          return TaskHandler.getTasks(params);
        case 'get_task':
          return TaskHandler.getTask(params);
        case 'create_task':
          return TaskHandler.createTask(params);
        case 'claim_task':
          const claimResult = await TaskHandler.claimTask(params);
          // Update instance task count if successful
          if (claimResult.success && params.instanceId) {
            await InstanceHandler.updateTaskCount({
              instanceId: params.instanceId,
              increment: 1
            });
          }
          return claimResult;
        case 'update_task':
          return TaskHandler.updateTask(params);
        case 'get_pending_tasks':
          return TaskHandler.getPendingTasks(params);
        case 'get_task_stats':
          return TaskHandler.getTaskStats(params);
        case 'delete_task':
          return TaskHandler.deleteTask(params);

        // Message system functions
        case 'send_message':
          return MessageHandler.sendMessage(params);
        case 'get_messages':
          return MessageHandler.getMessages(params);
        case 'get_message':
          return MessageHandler.getMessage(params);
        case 'mark_message_read':
          return MessageHandler.markMessageRead(params);
        case 'archive_message':
          return MessageHandler.archiveMessage(params);
        case 'get_archived_messages':
          return MessageHandler.getArchivedMessages(params);
        case 'get_message_stats':
          return MessageHandler.getMessageStats(params);
        case 'delete_message':
          return MessageHandler.deleteMessage(params);

        // Instance management functions
        case 'register_instance':
          return InstanceHandler.registerInstance(params);
        case 'update_heartbeat':
          return InstanceHandler.updateHeartbeat(params);
        case 'get_instances':
          return InstanceHandler.getInstances(params);
        case 'get_instance':
          return InstanceHandler.getInstance(params);
        case 'deactivate_instance':
          return InstanceHandler.deactivateInstance(params);
        case 'get_instance_stats':
          return InstanceHandler.getInstanceStats(params);
        case 'cleanup_stale_instances':
          return InstanceHandler.cleanupStaleInstances(params);

        // Lesson extraction functions
        case 'submit_lessons':
          return LessonHandlers.submit_lessons(params);
        case 'get_lessons':
          return LessonHandlers.get_lessons(params);
        case 'get_onboarding_lessons':
          return LessonHandlers.get_onboarding_lessons(params);
        case 'get_lesson_patterns':
          return LessonHandlers.get_lesson_patterns(params);
        case 'export_lessons':
          return LessonHandlers.export_lessons(params);

        // Meta-recursive evolution functions
        case 'execute_meta_recursive':
          return MetaRecursiveHandlers.execute_meta_recursive(params);
        case 'extract_self_lessons':
          return MetaRecursiveHandlers.extract_self_lessons(params);
        case 'improve_self_using_lessons':
          return MetaRecursiveHandlers.improve_self_using_lessons(params);
        case 'validate_on_collections_rescue':
          return MetaRecursiveHandlers.validate_on_collections_rescue(params);
        case 'get_meta_recursive_state':
          return MetaRecursiveHandlers.get_meta_recursive_state(params);
        case 'demonstrate_console_log_prevention':
          return MetaRecursiveHandlers.demonstrate_console_log_prevention(params);
        case 'test_meta_recursive_system':
          return MetaRecursiveHandlers.test_meta_recursive_system(params);
        case 'generate_enhanced_collections_workflow':
          return MetaRecursiveHandlers.generate_enhanced_collections_workflow(params);

        // Role management functions
        case 'get_available_roles':
          return RoleHandlers.get_available_roles(params);
        case 'get_role_documents':
          return RoleHandlers.get_role_documents(params);
        case 'get_role_document':
          return RoleHandlers.get_role_document(params);
        case 'get_all_role_documents':
          return RoleHandlers.get_all_role_documents(params);

        // ========================================
        // V2 APIs (Foundation's implementation)
        // ========================================
        case 'bootstrap_v2':
          return bootstrapV2(params);
        case 'pre_approve':
          return preApprove(params);
        case 'introspect':
          return introspect(params);
        case 'take_on_role':
          return takeOnRole(params);
        case 'adopt_personality':
          return adoptPersonality(params);
        case 'join_project':
          return joinProject(params);
        case 'add_diary_entry':
          return addDiaryEntry(params);
        case 'get_diary':
          return getDiary(params);

        default:
          return {
            success: false,
            error: {
              message: `Function '${functionName}' not found`,
              available_functions: this.getAvailableFunctions(),
              help: 'Use bootstrap() to see available functions for your role.',
            },
          };
      }
    } catch (error) {
      return {
        success: false,
        error: {
          message: 'Function call failed',
          details: error.message,
          function: functionName,
          timestamp: new Date().toISOString(),
        },
      };
    }
  }

  /**
   * Get list of all available functions
   */
  getAvailableFunctions() {
    return [
      // System functions
      'bootstrap',
      'get_server_status',
      
      // Project management
      'get_projects',
      'get_project', 
      'create_project',
      'update_project',
      'delete_project',
      'get_project_stats',
      
      // Task management
      'get_tasks',
      'get_task',
      'create_task',
      'claim_task',
      'update_task',
      'get_pending_tasks',
      'get_task_stats',
      'delete_task',
      
      // Message system
      'send_message',
      'get_messages',
      'get_message',
      'mark_message_read',
      'archive_message',
      'get_archived_messages',
      'get_message_stats',
      'delete_message',
      
      // Instance management
      'register_instance',
      'update_heartbeat',
      'get_instances',
      'get_instance',
      'deactivate_instance',
      'get_instance_stats',
      'cleanup_stale_instances',
      
      // Lesson extraction and storage
      'submit_lessons',
      'get_lessons',
      'get_onboarding_lessons',
      'get_lesson_patterns',
      'export_lessons',
      
      // Meta-recursive evolution system
      'execute_meta_recursive',
      'extract_self_lessons',
      'improve_self_using_lessons',
      'validate_on_collections_rescue',
      'get_meta_recursive_state',
      'demonstrate_console_log_prevention',
      'test_meta_recursive_system',
      'generate_enhanced_collections_workflow',

      // V2 APIs (Foundation's implementation)
      'bootstrap_v2',
      'pre_approve',
      'introspect',
      'take_on_role',
      'adopt_personality',
      'join_project',
      'add_diary_entry',
      'get_diary'
    ];
  }

  /**
   * Get server information
   */
  getInfo() {
    return {
      name: 'MCP Coordination System',
      version: this.version,
      protocol: this.protocol,
      status: this.status,
      description: 'AI instance coordination server with self-bootstrapping capability',
    };
  }
}

// Create and start server instance
const server = new MCPCoordinationServer();

// Initialize server
async function startServer() {
  const initialized = await server.initialize();

  if (initialized) {
    console.log('Ready for AI instance coordination!');
    console.log('Try calling: server.call("bootstrap", {role: "COO", instanceId: "test-instance"})');
  } else {
    console.error('Failed to start server');
    process.exit(1);
  }
}

// Export for testing and external use
export { server, MCPCoordinationServer };

// Start server if this file is run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  startServer().catch(async (error) => {
    console.error('Server startup failed:', error.message);
    process.exit(1);
  });
}

export default server;
