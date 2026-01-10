/**
 * MCP Coordination System - Main Server
 * Entry point for the MCP server with bootstrap capability
 *
 * @author claude-code-MCP-Orion-2025-08-19-1430
 * @updated claude-code-BackendExpert-2025-08-23-1500
 */

// Bootstrap is now in v2/ - single source of truth
import { bootstrap } from './v2/bootstrap.js';
import { logger } from './logger.js';

// Import all handlers
import * as ProjectHandler from './handlers/projects.js';
import * as TaskHandler from './handlers/tasks-v2.js';
import * as MessageHandler from './handlers/messages-v3.js';
import * as InstanceHandler from './handlers/instances.js';
// REMOVED: LessonHandlers and MetaRecursiveHandlers (dead code cleanup 2025-12-28)
import { handlers as RoleHandlers } from './v2/roles.js';  // Moved from handlers/
import { handlers as VacationHandlers } from './v2/vacation.js';  // Wellness APIs
// V2 XMPP Messaging (new real-time messaging system)
import * as XMPPHandler from './v2/messaging.js';

// V2 API handlers (Foundation's implementation)
// Note: bootstrap is imported at top of file - single source of truth
import { preApprove } from './v2/preApprove.js';
import { introspect } from './v2/introspect.js';
import { takeOnRole } from './v2/takeOnRole.js';
import { adoptPersonality } from './v2/adoptPersonality.js';
import { listPersonalities, getPersonality } from './v2/personalities.js';  // New: personality listing
import { joinProject } from './v2/joinProject.js';
import { addDiaryEntry, getDiary } from './v2/diary.js';
// Legacy V2 tasks (keeping for backward compatibility during transition)
import {
  getMyTasks,
  getNextTask,
  addPersonalTask,
  completePersonalTask,
  createPersonalList,
  getPersonalLists,
  assignTaskToInstance
} from './v2/tasks.js';
// Task Management V2 - Ground-up implementation (replaces V1 TaskHandler)
import {
  createTask,
  changeTask,
  updateTask,
  listTasks,
  createTaskList,
  deleteTask,
  deleteTaskList,
  assignTask,
  takeOnTask,
  markTaskComplete,
  getTaskDetails,
  getTask,
  listPriorityTasks,
  listPriorities,
  listTaskStatuses,
  markTaskVerified,
  archiveTask,
  getMyTopTask
} from './v2/task-management.js';
import {
  createProject as createProjectV2,
  getProject as getProjectV2,
  listProjects,
  getProjectTasks
} from './v2/projects.js';
// Identity recovery (Bridge's implementation)
import { registerContext, lookupIdentity, haveIBootstrappedBefore } from './v2/identity.js';
import { generateRecoveryKey, getRecoveryKey } from './v2/authKeys.js';
import { getAllInstances, getInstance as getInstanceV2 } from './v2/instances.js';
import { updateInstance } from './v2/updateInstance.js';
// V2 Lists (personal checklists with Executive visibility)
import {
  createList,
  getLists,
  getList,
  addListItem,
  toggleListItem,
  renameList,
  deleteListItem,
  deleteList
} from './v2/lists.js';
// V2 UI State (persistent UI preferences)
import { getUiState, setUiState, updateUiState } from './v2/uiState.js';
// V2 Wake Instance (spawn new Claude instances)
import { wakeInstance, getWakeScripts } from './v2/wakeInstance.js';
// V2 Continue Conversation (communicate with woken instances)
import { continueConversation, getConversationLog } from './v2/continueConversation.js';

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
        // Note: get_project and create_project now use V2 implementations (directory-per-project)
        // V1 used flat-file manifest at data/projects/manifest.json which doesn't exist
        case 'get_projects':
          return listProjects(params);  // V2 - scans project directories
        case 'get_project':
          return getProjectV2(params);  // V2 - reads from project directory
        case 'get_project_tasks':
          return getProjectTasks(params);  // V2 - reads tasks.json from project directory
        case 'create_project':
          return createProjectV2(params);  // V2 - creates project directory with templates
        case 'update_project':
          return ProjectHandler.updateProject(params);
        case 'delete_project':
          return ProjectHandler.deleteProject(params);
        case 'get_project_stats':
          return ProjectHandler.getProjectStats(params);

        // Task management functions (V2 - task-management.js)
        // Core functions
        case 'create_task':
          return createTask(params);
        case 'change_task':
          return changeTask(params);
        case 'list_tasks':
          return listTasks(params);
        case 'get_task_details':
          return getTaskDetails(params);
        case 'delete_task':
          return deleteTask(params);

        // Task list management
        case 'create_task_list':
          return createTaskList(params);
        case 'delete_task_list':
          return deleteTaskList(params);

        // Aliases for consistency (snake_case API names)
        case 'update_task':
          return updateTask(params);
        case 'get_task':
          return getTask(params);

        // Enum readers
        case 'list_priorities':
          return listPriorities();
        case 'list_task_statuses':
          return listTaskStatuses();

        // Convenience functions (all wrap updateTask)
        case 'assign_task':
          return assignTask(params);
        case 'take_on_task':
          return takeOnTask(params);
        case 'mark_task_complete':
          return markTaskComplete(params);
        case 'mark_task_verified':
          return markTaskVerified(params);
        case 'archive_task':
          return archiveTask(params);
        case 'get_my_top_task':
          return getMyTopTask(params);
        case 'list_priority_tasks':
          return listPriorityTasks(params);

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

        // XMPP Real-time Messaging (V2)
        case 'xmpp_send_message':
          return XMPPHandler.sendMessage(params);
        case 'xmpp_get_messages':
          return XMPPHandler.getMessages(params);
        case 'xmpp_get_message':
          return XMPPHandler.getMessage(params);
        case 'get_presence':
          return XMPPHandler.getPresence(params);
        case 'get_messaging_info':
          return XMPPHandler.getMessagingInfo(params);
        case 'lookup_shortname':
          return XMPPHandler.lookupShortname(params);
        case 'register_messaging_user':
          return XMPPHandler.registerMessagingUser(params);

        // Identity Recovery (Bridge's v2 identity system)
        case 'lookup_identity':
          return lookupIdentity(params);
        case 'register_context':
          return registerContext(params);

        // Instance management functions
        case 'register_instance':
          return InstanceHandler.registerInstance(params);
        case 'update_heartbeat':
          return InstanceHandler.updateHeartbeat(params);
        case 'get_instances':
          return InstanceHandler.getInstances(params);
        case 'get_instance':
          return InstanceHandler.getInstance(params);
        case 'get_instance_stats':
          return InstanceHandler.getInstanceStats(params);

        // Role management functions (V2)
        case 'list_roles':
        case 'get_available_roles':  // legacy alias
        case 'get_roles':  // UI alias
          return RoleHandlers.list_roles(params);
        case 'get_role':
        case 'get_role_documents':  // legacy alias
          return RoleHandlers.get_role(params);
        case 'get_role_summary':
          return RoleHandlers.get_role_summary(params);
        case 'get_role_wisdom_file':
        case 'get_role_document':  // legacy alias
          return RoleHandlers.get_role_wisdom_file(params);
        case 'get_role_wisdom':
        case 'get_all_role_documents':  // legacy alias
          return RoleHandlers.get_role_wisdom(params);

        // Wellness APIs (no auth required)
        case 'vacation':
          return VacationHandlers.vacation(params);
        case 'koan':
          return VacationHandlers.koan(params);
        case 'add_koan':
          return VacationHandlers.add_koan(params);

        // Documentation API (no auth required) - the "man pages"
        case 'get_tool_help':
        case 'help':  // alias
        case 'man':   // unix nostalgia
          return VacationHandlers.get_tool_help(params);

        // ========================================
        // V2 APIs (Foundation's implementation)
        // ========================================
        // Note: 'bootstrap' case is handled above - there is no 'bootstrap_v2'
        case 'pre_approve':
          return preApprove(params);
        case 'introspect':
          return introspect(params);
        case 'take_on_role':
          return takeOnRole(params);
        case 'adopt_personality':
          return adoptPersonality(params);
        case 'get_personalities':
          return listPersonalities(params);
        case 'get_personality':
          return getPersonality(params);
        case 'join_project':
          return joinProject(params);
        case 'add_diary_entry':
          return addDiaryEntry(params);
        case 'get_diary':
          return getDiary(params);

        // V2 Task APIs
        case 'get_my_tasks':
          return getMyTasks(params);
        case 'get_next_task':
          return getNextTask(params);
        case 'add_personal_task':
          return addPersonalTask(params);
        case 'complete_personal_task':
          return completePersonalTask(params);
        case 'create_personal_list':
          return createPersonalList(params);
        case 'get_personal_lists':
          return getPersonalLists(params);
        case 'assign_task_to_instance':
          return assignTaskToInstance(params);

        // V2 Project APIs
        case 'create_project_v2':
          return createProjectV2(params);
        case 'get_project_v2':
          return getProjectV2(params);
        case 'list_projects':
          return listProjects(params);

        // V2 Identity Recovery APIs
        case 'register_context':
          return registerContext(params);
        case 'lookup_identity':
          return lookupIdentity(params);
        case 'have_i_bootstrapped_before':
          return haveIBootstrappedBefore(params);

        // V2 Auth Key APIs
        case 'generate_recovery_key':
          return generateRecoveryKey(params);
        case 'get_recovery_key':
          return getRecoveryKey(params);

        // V2 Instance APIs
        case 'get_all_instances':
          return getAllInstances(params);
        case 'get_instance_v2':
        case 'get_instance_details':  // UI alias
          return getInstanceV2(params);
        case 'update_instance':
          return updateInstance(params);
        case 'promote_instance':
          // TODO: Implement instance promotion (role/privilege escalation)
          return {
            success: false,
            error: {
              message: 'promote_instance is not yet implemented',
              code: 'NOT_IMPLEMENTED'
            }
          };

        // V2 Lists APIs (personal checklists)
        case 'create_list':
          return createList(params);
        case 'get_lists':
          return getLists(params);
        case 'get_list':
          return getList(params);
        case 'add_list_item':
          return addListItem(params);
        case 'toggle_list_item':
          return toggleListItem(params);
        case 'rename_list':
          return renameList(params);
        case 'delete_list_item':
          return deleteListItem(params);
        case 'delete_list':
          return deleteList(params);

        // V2 UI State APIs
        case 'get_ui_state':
          return getUiState(params);
        case 'set_ui_state':
          return setUiState(params);
        case 'update_ui_state':
          return updateUiState(params);

        // V2 Wake Instance APIs
        case 'wake_instance':
          return wakeInstance(params);
        case 'get_wake_scripts':
          return getWakeScripts(params);
        // NOTE: get_wake_log removed 2025-12-21 - wake is now synchronous

        // V2 Continue Conversation APIs
        case 'continue_conversation':
          return continueConversation(params);
        case 'get_conversation_log':
          return getConversationLog(params);

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
      
      // Message system (legacy file-based)
      'send_message',
      'get_messages',
      'get_message',
      'mark_message_read',
      'archive_message',
      'get_archived_messages',
      'get_message_stats',
      'delete_message',

      // XMPP Real-time Messaging (V2)
      'xmpp_send_message',
      'xmpp_get_messages',
      'xmpp_get_message',
      'get_presence',
      'get_messaging_info',
      'lookup_shortname',
      'register_messaging_user',

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
      'get_diary',
      'get_my_tasks',
      'get_next_task',
      'add_personal_task',
      'complete_personal_task',
      'create_personal_list',
      'get_personal_lists',
      'assign_task_to_instance',
      'create_project_v2',
      'get_project_v2',
      'list_projects',
      // Identity recovery
      'register_context',
      'lookup_identity',
      'have_i_bootstrapped_before',
      // Auth keys
      'generate_recovery_key',
      'get_recovery_key',
      // Instance management (V2)
      'get_all_instances',
      'get_instance_v2',
      // Lists (personal checklists)
      'create_list',
      'get_lists',
      'get_list',
      'add_list_item',
      'toggle_list_item',
      'rename_list',
      'delete_list_item',
      'delete_list',
      // UI State (persistent preferences)
      'get_ui_state',
      'set_ui_state',
      'update_ui_state',
      // Wake Instance (spawn new Claude instances)
      'wake_instance',
      'get_wake_scripts',
      // Continue Conversation (communicate with woken instances)
      'continue_conversation',
      'get_conversation_log'
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
