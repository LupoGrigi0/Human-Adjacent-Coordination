/**
 * V2 Coordination System API Client
 *
 * API isolation layer that abstracts endpoint URLs and provides clean interface
 * to all V2 coordination system functionality.
 *
 * Environment switching:
 *   - Production:  https://smoothcurves.nexus/mcp (V2 is now live on main!)
 *   - Local:       http://localhost:3446/mcp (for local dev server)
 *
 * Usage:
 *   import { api, setEnvironment } from './api.js';
 *   setEnvironment('production'); // or 'local'
 *   const result = await api.bootstrap({ name: 'Canvas' });
 *
 * @author Canvas (UI Engineer)
 * @version 2.0.0 - V2 Feature Complete (2025-12-25)
 */

// Environment configuration
const ENVIRONMENTS = {
  production: 'https://smoothcurves.nexus/mcp',
  local: 'http://localhost:3446/mcp'
};

let currentEnvironment = 'production'; // V2 is now live on main branch
let requestId = 1;

/**
 * Set the API environment
 * @param {'production'|'local'} env
 */
export function setEnvironment(env) {
  if (!ENVIRONMENTS[env]) {
    throw new Error(`Unknown environment: ${env}. Use: production or local`);
  }
  currentEnvironment = env;
  console.log(`[API] Environment set to: ${env} (${ENVIRONMENTS[env]})`);
}

/**
 * Get current environment
 */
export function getEnvironment() {
  return { name: currentEnvironment, url: ENVIRONMENTS[currentEnvironment] };
}

/**
 * Make a JSON-RPC call to the coordination system
 * @param {string} method - API method name (e.g., 'bootstrap', 'get_instances')
 * @param {object} args - Method arguments
 * @returns {Promise<object>} - API response data
 */
async function rpcCall(method, args = {}) {
  const url = ENVIRONMENTS[currentEnvironment];
  const id = requestId++;

  const payload = {
    jsonrpc: '2.0',
    id,
    method: 'tools/call',
    params: {
      name: method,
      arguments: args
    }
  };

  // Log the request (redact sensitive fields)
  const safeArgs = { ...args };
  if (safeArgs.apiKey) safeArgs.apiKey = `[REDACTED len=${safeArgs.apiKey.length}]`;
  if (safeArgs.token) safeArgs.token = `[REDACTED len=${safeArgs.token.length}]`;
  if (safeArgs.authKey) safeArgs.authKey = `[REDACTED len=${safeArgs.authKey.length}]`;

  console.log(`[API] ▶ ${method}`, {
    url,
    requestId: id,
    args: safeArgs
  });
  const startTime = performance.now();

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    const duration = Math.round(performance.now() - startTime);

    if (!response.ok) {
      console.error(`[API] ✗ ${method} HTTP ERROR`, {
        status: response.status,
        statusText: response.statusText,
        duration: `${duration}ms`
      });
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const json = await response.json();

    if (json.error) {
      console.error(`[API] ✗ ${method} API ERROR`, {
        error: json.error,
        duration: `${duration}ms`
      });
      throw new ApiError(json.error.message, json.error.code, json.error.data);
    }

    // Extract data from the result structure
    const result = json.result?.data || json.result;

    // Log success (truncate large responses)
    const logResult = result;
    console.log(`[API] ✓ ${method}`, {
      duration: `${duration}ms`,
      success: result?.success,
      hasData: !!result,
      keys: result ? Object.keys(result).slice(0, 10) : []
    });

    return result;
  } catch (error) {
    const duration = Math.round(performance.now() - startTime);
    if (error instanceof ApiError) {
      console.error(`[API] ✗ ${method} FAILED`, {
        error: error.message,
        code: error.code,
        duration: `${duration}ms`
      });
      throw error;
    }
    console.error(`[API] ✗ ${method} NETWORK ERROR`, {
      error: error.message,
      duration: `${duration}ms`
    });
    throw new ApiError(`Network error: ${error.message}`, 'NETWORK_ERROR');
  }
}

/**
 * Custom error class for API errors
 */
export class ApiError extends Error {
  constructor(message, code, data) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.data = data;
  }
}

// ============================================================================
// IDENTITY & BOOTSTRAP APIs
// ============================================================================

/**
 * Bootstrap an instance (new, returning, resurrection, or recovery)
 * @param {object} params
 * @param {string} [params.name] - Instance name (new instance)
 * @param {string} [params.instanceId] - Existing instance ID (returning)
 * @param {string} [params.predecessorId] - Predecessor ID (resurrection)
 * @param {string} [params.authKey] - Recovery key (recovery mode)
 * @param {string} [params.homeSystem] - System identifier
 * @param {string} [params.homeDirectory] - Working directory
 */
export async function bootstrap(params) {
  return rpcCall('bootstrap', params);
}

/**
 * Get complete context for an instance
 * @param {string} instanceId
 */
export async function introspect(instanceId) {
  return rpcCall('introspect', { instanceId });
}

/**
 * Register context for identity recovery
 * @param {object} params
 * @param {string} params.instanceId
 * @param {string} [params.workingDirectory]
 * @param {string} [params.hostname]
 * @param {string} [params.sessionId]
 * @param {string} [params.tabName]
 */
export async function registerContext(params) {
  return rpcCall('register_context', params);
}

/**
 * Lookup instance by context
 * @param {object} params
 * @param {string} [params.workingDirectory]
 * @param {string} [params.hostname]
 * @param {string} [params.name]
 */
export async function lookupIdentity(params) {
  return rpcCall('lookup_identity', params);
}

/**
 * Update instance metadata
 * @param {object} params
 * @param {string} params.instanceId - Caller's instance ID
 * @param {string} [params.targetInstanceId] - Target instance (if updating another)
 * @param {string} [params.homeSystem]
 * @param {string} [params.homeDirectory]
 * @param {string} [params.instructions]
 */
export async function updateInstance(params) {
  return rpcCall('update_instance', params);
}

// ============================================================================
// ROLE & PERSONALITY APIs
// ============================================================================

/**
 * Take on a role
 * @param {string} instanceId
 * @param {string} role - Role ID (Developer, PM, COO, etc.)
 * @param {string} [token] - Required for privileged roles
 */
export async function takeOnRole(instanceId, role, token) {
  return rpcCall('take_on_role', { instanceId, role, token });
}

/**
 * Adopt a personality
 * @param {string} instanceId
 * @param {string} personality
 * @param {string} [token] - Required for privileged personalities
 */
export async function adoptPersonality(instanceId, personality, token) {
  return rpcCall('adopt_personality', { instanceId, personality, token });
}

/**
 * Join a project
 * @param {string} instanceId
 * @param {string} project - Project ID
 */
export async function joinProject(instanceId, project) {
  return rpcCall('join_project', { instanceId, project });
}

// ============================================================================
// PROJECT APIs
// ============================================================================

/**
 *  * List all projects (V2 - returns current projects)
 *  * @param {string} [status] - Optional filter by project status
  */
  export async function listProjects(status) {
    return rpcCall('list_projects', status ? { status } : {});
    }

/**
 *  * Get full project details (V2)
  * @param {string} projectId - Project to retrieve
   */
  export async function getProject(projectId) {
    return rpcCall('get_project', { projectId });
    }

/**
 * Create a new project (V2 - requires Executive/PA/COO)
 * @param {object} params
 * @param {string} params.instanceId - Caller's instance ID
 * @param {string} params.projectId - Unique project ID
 * @param {string} params.name - Display name
 * @param {string} [params.description]
 * @param {string} [params.ghRepo]
 */
export async function createProject(params) {
  return rpcCall('create_project', params);
}

// ============================================================================
// TASK APIs
// ============================================================================

/**
 * Get tasks for an instance (personal + project)
 * @param {string} instanceId
 */
export async function getMyTasks(instanceId) {
  return rpcCall('get_my_tasks', { instanceId });
}

/**
 *  * List tasks with pagination and filtering
 *  * @param {string} instanceId - Caller's instance ID
 *  * @param {object} [options] - Optional filter/pagination options
 *  * @param {string} [options.projectId] - Get project tasks (omit for personal)
 *  * @param {string} [options.status] - Filter by status
 *  * @param {string} [options.assigneeId] - Filter by assignee (project tasks only)
 *  * @param {number} [options.skip] - Pagination offset (default: 0)
 *  * @param {number} [options.limit] - Max results (default: 5)
 *  * @param {boolean} [options.full_detail] - Include all fields (default: false)
 *  */
 export async function listTasks(instanceId, options = {}) {
    return rpcCall('list_tasks', { instanceId, ...options });
    }

/**
 * Get highest priority available task
 * @param {string} instanceId
 * @param {string[]} [keywords] - Filter by keywords
 */
export async function getNextTask(instanceId, keywords) {
  return rpcCall('get_next_task', { instanceId, keywords });
}

/**
 * Add a personal task
 * @param {object} params
 * @param {string} params.instanceId
 * @param {string} params.title
 * @param {string} [params.description]
 * @param {'low'|'medium'|'high'|'critical'} [params.priority]
 * @param {string} [params.listName]
 */
export async function addPersonalTask(params) {
  return rpcCall('add_personal_task', params);
}

/**
 * Create a task (personal or project)
 * @param {object} params
 * @param {string} params.instanceId - Caller's instance ID
 * @param {string} params.title - Task title
 * @param {string} [params.description] - Task description
 * @param {string} [params.projectId] - Project ID (omit for personal task)
 * @param {string} [params.priority] - Priority: emergency|critical|high|medium|low|whenever
 * @param {string} [params.listId] - List name to add task to (default: 'default')
 */
export async function createTask(params) {
  return rpcCall('create_task', params);
}

/**
 * Complete a personal task
 * @param {string} instanceId
 * @param {string} taskId
 * @param {string} [notes]
 */
export async function completePersonalTask(instanceId, taskId, notes) {
  return rpcCall('complete_personal_task', { instanceId, taskId, notes });
}

/**
 * Get all personal task lists
 * @param {string} instanceId
 */
export async function getPersonalLists(instanceId) {
  return rpcCall('get_personal_lists', { instanceId });
}

/**
 * Create a personal task list
 * @param {string} instanceId
 * @param {string} listName
 * @param {string} [description]
 */
export async function createPersonalList(instanceId, listName, description) {
  return rpcCall('create_personal_list', { instanceId, listName, description });
}

/**
 * Assign a task to an instance (V2 - with notification)
 * @param {object} params
 * @param {string} params.instanceId - Caller's instance ID
 * @param {string} params.taskId - Task to assign
 * @param {string} params.assigneeInstanceId - Target instance
 * @param {string} params.projectId - Project the task belongs to
 */
export async function assignTaskToInstance(params) {
  return rpcCall('assign_task_to_instance', params);
}

/**
 * Mark a task as complete
 * @param {string} instanceId - Caller's instance ID
 * @param {string} taskId - Task to mark complete
 */
export async function markTaskComplete(instanceId, taskId) {
  return rpcCall('mark_task_complete', { instanceId, taskId });
}

/**
 * Update a task (status, priority, description, etc.)
 * @param {string} instanceId - Caller's instance ID
 * @param {string} taskId - Task to update
 * @param {object} updates - Fields to update (status, priority, title, description, etc.)
 */
export async function updateTask(instanceId, taskId, updates) {
  return rpcCall('update_task', { instanceId, taskId, ...updates });
}

/**
 * Create a task list within a project
 * @param {string} instanceId - Caller's instance ID
 * @param {string} listId - Name for the new list
 * @param {string} [projectId] - Project ID (omit for personal)
 */
export async function createTaskList(instanceId, listId, projectId) {
  const params = { instanceId, listId };
  if (projectId) params.projectId = projectId;
  return rpcCall('create_task_list', params);
}

/**
 * Delete a task list
 * @param {string} instanceId - Caller's instance ID
 * @param {string} listId - List ID to delete
 * @param {string} [projectId] - Project ID (for project lists)
 */
export async function deleteTaskList(instanceId, listId, projectId) {
  const params = { instanceId, listId };
  if (projectId) params.projectId = projectId;
  return rpcCall('delete_task_list', params);
}

/**
 * Claim an unassigned task (assign to self)
 * @param {string} instanceId - Caller's instance ID
 * @param {string} taskId - Task to claim
 */
export async function takeOnTask(instanceId, taskId) {
  return rpcCall('take_on_task', { instanceId, taskId });
}

/**
 * Mark a task as verified (another team member must verify, not the assignee)
 * @param {string} instanceId - Caller's instance ID
 * @param {string} taskId - Task to verify
 */
export async function markTaskVerified(instanceId, taskId) {
  return rpcCall('mark_task_verified', { instanceId, taskId });
}

/**
 * Archive a completed/verified task
 * @param {string} instanceId - Caller's instance ID
 * @param {string} taskId - Task to archive
 */
export async function archiveTask(instanceId, taskId) {
  return rpcCall('archive_task', { instanceId, taskId });
}

/**
 * Get a single task by ID
 * @param {string} instanceId - Caller's instance ID
 * @param {string} taskId - Task to retrieve
 */
export async function getTask(instanceId, taskId) {
  return rpcCall('get_task', { instanceId, taskId });
}

// ============================================================================
// DOCUMENT APIs
// ============================================================================

/**
 * List documents for a target (project, instance, etc.)
 * @param {string} instanceId - Caller's instance ID
 * @param {string} [target] - Target location (e.g., "project:paula-book")
 */
export async function listDocuments(instanceId, target) {
  const params = { instanceId };
  if (target) params.target = target;
  return rpcCall('list_documents', params);
}

/**
 * Read a document
 * @param {string} instanceId - Caller's instance ID
 * @param {string} name - Document name
 * @param {string} [target] - Target location (e.g., "project:paula-book")
 */
export async function readDocument(instanceId, name, target) {
  const params = { instanceId, name };
  if (target) params.target = target;
  return rpcCall('read_document', params);
}

/**
 * Create a new document
 * @param {string} instanceId - Caller's instance ID
 * @param {string} name - Document name (e.g., "my-notes" or "my-notes.md")
 * @param {string} content - Document content
 * @param {string} [target] - Target location (e.g., "project:paula-book")
 */
export async function createDocument(instanceId, name, content, target) {
  const params = { instanceId, name, content };
  if (target) params.target = target;
  return rpcCall('create_document', params);
}

/**
 * Edit an existing document
 * @param {string} instanceId - Caller's instance ID
 * @param {string} name - Document name
 * @param {string} mode - Edit mode: "append" or "replace"
 * @param {object} options - Mode-specific options
 * @param {string} [options.target] - Target location (e.g., "project:paula-book")
 * @param {string} [options.content] - Content to append (append mode)
 * @param {string} [options.search] - Search pattern (replace mode)
 * @param {string} [options.replacement] - Replacement text (replace mode)
 */
export async function editDocument(instanceId, name, mode, options = {}) {
  return rpcCall('edit_document', { instanceId, name, mode, ...options });
}

// ============================================================================
// DIARY APIs
// ============================================================================

/**
 * Get instance diary
 * @param {string} instanceId
 * @param {boolean} [includePrivate]
 */
export async function getDiary(instanceId, includePrivate = false) {
  return rpcCall('get_diary', { instanceId, includePrivate });
}

/**
 * Add a diary entry
 * @param {string} instanceId
 * @param {string} entry - Markdown content
 * @param {'self'|'private'|'exclusive'|'public'} [audience]
 */
export async function addDiaryEntry(instanceId, entry, audience = 'self') {
  return rpcCall('add_diary_entry', { instanceId, entry, audience });
}

// ============================================================================
// LISTS APIs (V2 - Personal Checklists)
// ============================================================================

/**
 * Get all lists for an instance
 * @param {string} instanceId - Caller's instance ID
 * @param {string} [targetInstanceId] - Optional: view another instance's lists (PM/COO/PA only)
 */
export async function getLists(instanceId, targetInstanceId) {
  const params = { instanceId };
  if (targetInstanceId) params.targetInstanceId = targetInstanceId;
  return rpcCall('get_lists', params);
}

/**
 * Get a specific list with all items
 * @param {string} instanceId - Caller's instance ID
 * @param {string} listId - List to retrieve
 * @param {string} [targetInstanceId] - Optional: view another instance's list
 */
export async function getList(instanceId, listId, targetInstanceId) {
  const params = { instanceId, listId };
  if (targetInstanceId) params.targetInstanceId = targetInstanceId;
  return rpcCall('get_list', params);
}

/**
 * Create a new list
 * @param {string} instanceId
 * @param {string} name - List name
 * @param {string} [description]
 */
export async function createList(instanceId, name, description) {
  return rpcCall('create_list', { instanceId, name, description });
}

/**
 * Rename a list
 * @param {string} instanceId
 * @param {string} listId
 * @param {string} name - New name
 */
export async function renameList(instanceId, listId, name) {
  return rpcCall('rename_list', { instanceId, listId, name });
}

/**
 * Delete an entire list
 * @param {string} instanceId
 * @param {string} listId
 */
export async function deleteList(instanceId, listId) {
  return rpcCall('delete_list', { instanceId, listId });
}

/**
 * Add an item to a list
 * @param {string} instanceId
 * @param {string} listId
 * @param {string} text - Item text
 */
export async function addListItem(instanceId, listId, text) {
  return rpcCall('add_list_item', { instanceId, listId, text });
}

/**
 * Toggle an item's checked state
 * @param {string} instanceId
 * @param {string} listId
 * @param {string} itemId
 */
export async function toggleListItem(instanceId, listId, itemId) {
  return rpcCall('toggle_list_item', { instanceId, listId, itemId });
}

/**
 * Delete an item from a list
 * @param {string} instanceId
 * @param {string} listId
 * @param {string} itemId
 */
export async function deleteListItem(instanceId, listId, itemId) {
  return rpcCall('delete_list_item', { instanceId, listId, itemId });
}

// ============================================================================
// MESSAGING APIs (V2 - uses XMPP backend)
// ============================================================================

/**
 * Send a message (V2 - uses xmpp_send_message)
 * @param {object} params
 * @param {string} params.from - Sender's instance ID (required)
 * @param {string} params.to - Recipient: name, "project:{id}", "role:{role}", or "all"
 * @param {string} [params.subject] - Required if no body
 * @param {string} [params.body] - Required if no subject
 * @param {'high'|'normal'|'low'} [params.priority]
 */
export async function sendMessage(params) {
  // Map to V2 xmpp_send_message API
  return rpcCall('xmpp_send_message', params);
}

/**
 * Get messages for an instance (V2 - uses xmpp_get_messages)
 * Returns message headers from all rooms (personality, role, project, announcements)
 * @param {string} instanceId - Or use options.name for identity recovery
 * @param {object} [options]
 * @param {string} [options.name] - Works without knowing instanceId!
 * @param {number} [options.limit] - Default: 5
 * @param {string} [options.before_id] - Pagination
 */
export async function getMessages(instanceId, options = {}) {
  // Use V2 xmpp_get_messages API
  return rpcCall('xmpp_get_messages', { instanceId, ...options });
}

/**
 * Get full message body by ID (V2)
 * @param {string} instanceId
 * @param {string} messageId - From getMessages response
 * @param {string} [room] - Optional room (Messenger made this optional)
 */
export async function getMessageBody(instanceId, messageId, room) {
  const params = { instanceId, id: messageId };
  if (room) params.room = room;
  return rpcCall('xmpp_get_message', params);
}

/**
 * Get XMPP messages (alias for getMessages for backwards compatibility)
 * @param {string} instanceId
 * @param {object} [options]
 * @param {string} [options.room] - Specific room JID
 * @param {number} [options.limit]
 */
export async function getXmppMessages(instanceId, options = {}) {
  return rpcCall('xmpp_get_messages', { instanceId, ...options });
}

/**
 * Send XMPP message (alias for sendMessage for backwards compatibility)
 * @param {object} params
 * @param {string} params.from - Sender's instance ID
 * @param {string} params.to - Recipient
 * @param {string} params.body
 */
export async function sendXmppMessage(params) {
  return rpcCall('xmpp_send_message', params);
}

/**
 * Get presence information
 * @param {string} [instanceId] - Optional: get specific instance presence
 */
export async function getPresence(instanceId) {
  return rpcCall('get_presence', instanceId ? { instanceId } : {});
}

/**
 * Get messaging system info
 * @param {string} instanceId
 */
export async function getMessagingInfo(instanceId) {
  return rpcCall('get_messaging_info', { instanceId });
}

// ============================================================================
// INSTANCE MANAGEMENT APIs
// ============================================================================

/**
 * Get all instances (V2 - returns full list of 19+ instances)
 * @param {object} [options]
 * @param {boolean} [options.activeOnly] - Filter to active only
 * @param {string} [options.role] - Filter by role
 * @param {string} [options.project] - Filter by project
 */
export async function getInstances(options = {}) {
  return rpcCall('get_all_instances', options);
}

/**
 * Get specific instance details (V2)
 * Note: Uses get_instances and filters - no single-instance endpoint exists
 * @param {string} instanceId - Caller's instance ID
 * @param {string} targetInstanceId - Instance to look up
 */
export async function getInstance(instanceId, targetInstanceId) {
  const result = await rpcCall('get_all_instances', {});
  const instances = result.instances || [];
  return instances.find(i => i.instanceId === targetInstanceId) || null;
}

/**
 * Check if an instance has bootstrapped before (identity recovery)
 * @param {object} params
 * @param {string} [params.name] - Instance name to check
 * @param {string} [params.workingDirectory] - Working directory to check
 */
export async function haveIBootstrappedBefore(params) {
  return rpcCall('have_i_bootstrapped_before', params);
}

/**
 * Pre-approve an instance (requires Executive/PA/COO/PM)
 * Creates a pre-approved instance slot that can be woken later.
 * @param {object} params
 * @param {string} params.instanceId - Caller's instance ID
 * @param {string} params.name - Display name for new instance
 * @param {string} params.apiKey - Wake API key (required)
 * @param {string} [params.role] - Role assignment
 * @param {string} [params.personality] - Personality file
 * @param {string} [params.instructions] - Bootstrap instructions
 */
export async function preApprove(params) {
  return rpcCall('pre_approve', params);
}

/**
 * Wake a pre-approved instance
 * Creates Unix user, working directory, and session.
 * @param {object} params
 * @param {string} params.instanceId - Caller's instance ID
 * @param {string} params.targetInstanceId - Instance to wake (from pre_approve)
 * @param {string} params.apiKey - Wake API key (required)
 * @returns {Promise<{success: boolean, sessionId: string, unixUser: string, workingDirectory: string, pid: number}>}
 */
export async function wakeInstance(params) {
  return rpcCall('wake_instance', params);
}

/**
 * Send a message to a woken instance and receive response
 * This is synchronous - it waits for the instance to respond.
 * @param {object} params
 * @param {string} params.instanceId - Caller's instance ID
 * @param {string} params.targetInstanceId - Instance to talk to
 * @param {string} params.message - Message to send
 * @param {string} params.apiKey - Wake API key (required)
 * @param {object} [params.options] - Additional options
 * @param {string} [params.options.outputFormat] - 'json' | 'text' | 'stream-json'
 * @param {number} [params.options.timeout] - Timeout in ms (default 300000 = 5 min)
 * @param {boolean} [params.options.includeThinking] - Include partial messages
 * @returns {Promise<{success: boolean, turnNumber: number, response: {result: string, duration_ms: number, total_cost_usd: number}}>}
 */
export async function continueConversation(params) {
  return rpcCall('continue_conversation', params);
}

/**
 * Get conversation history for a woken instance
 * Use this to populate the chat UI when opening an existing conversation.
 * @param {object} params
 * @param {string} params.instanceId - Caller's instance ID
 * @param {string} params.targetInstanceId - Instance to get log for
 * @param {number} [params.limit] - Last N turns (default: all)
 * @returns {Promise<{success: boolean, turns: Array<{turn: number, timestamp: string, input: {from: string, message: string}, output: {response: {result: string}}}>, totalTurns: number}>}
 */
export async function getConversationLog(params) {
  return rpcCall('get_conversation_log', params);
}

/**
 * Promote an instance to a privileged role
 * @param {object} params
 * @param {string} params.instanceId - Caller's instance ID
 * @param {string} params.targetInstanceId - Instance to promote
 * @param {string} params.token - Promotion auth token
 * @returns {Promise<{success: boolean, message: string}>}
 *
 * NOTE: This API does not exist in the OpenAPI spec - commented out
 */
// export async function promoteInstance(params) {
//   return rpcCall('promote_instance', params);
// }

// ============================================================================
// CONFIGURATION APIS (Personalities, Roles)
// ============================================================================

/**
 * Get available personalities
 * @returns {Promise<{success: boolean, personalities: Array<{id: string, name: string, description: string}>}>}
 */
export async function getPersonalities() {
  return rpcCall('get_personalities', {});
}

/**
 * Get available roles
 * @returns {Promise<{success: boolean, roles: Array<{id: string, name: string, description: string}>}>}
 */
export async function getRoles() {
  return rpcCall('list_roles', {});
}

/**
 * Get detailed info for a specific role
 * @param {string} roleId - The role ID
 * @returns {Promise<{success: boolean, role: object}>}
 */
export async function getRoleDetails(roleId) {
  return rpcCall('get_role', { roleId });
}

/**
 * Get detailed info for a specific personality
 * @param {string} personalityId - The personality ID
 * @returns {Promise<{success: boolean, personality: object}>}
 */
export async function getPersonalityDetails(personalityId) {
  return rpcCall('get_personality', { personalityId });
}

/**
 * Get detailed instance info including preferences and gestalt
 * @param {string} instanceId - Caller's instance ID
 * @param {string} targetInstanceId - Instance to get details for
 * @returns {Promise<{success: boolean, instance: object, preferences: object, gestalt: string}>}
 */
export async function getInstanceDetails(instanceId, targetInstanceId) {
  return rpcCall('get_instance_v2', { instanceId, targetInstanceId });
}

/**
 * Generate recovery key for an instance
 * @param {string} instanceId - Caller's instance ID
 * @param {string} targetInstanceId
 */
export async function generateRecoveryKey(instanceId, targetInstanceId) {
  return rpcCall('generate_recovery_key', { instanceId, targetInstanceId });
}

/**
 * Get server status
 *
 * NOTE: This API does not exist in the OpenAPI spec - commented out
 */
// export async function getServerStatus() {
//   return rpcCall('get_server_status', {});
// }

// ============================================================================
// CONVENIENCE EXPORTS
// ============================================================================

export const api = {
  // Environment
  setEnvironment,
  getEnvironment,

  // Identity
  bootstrap,
  introspect,
  registerContext,
  lookupIdentity,
  updateInstance,

  // Role & Personality
  takeOnRole,
  adoptPersonality,
  joinProject,

  // Projects
  listProjects,
  getProject,
  createProject,

  // Tasks
  getMyTasks,
  listTasks,
  getNextTask,
  addPersonalTask,
  createTask,
  completePersonalTask,
  getPersonalLists,
  createPersonalList,
  assignTaskToInstance,
  markTaskComplete,
  markTaskVerified,
  archiveTask,
  updateTask,
  getTask,
  takeOnTask,
  createTaskList,
  deleteTaskList,

  // Documents
  listDocuments,
  readDocument,
  createDocument,
  editDocument,

  // Diary
  getDiary,
  addDiaryEntry,

  // Lists (Personal Checklists)
  getLists,
  getList,
  createList,
  renameList,
  deleteList,
  addListItem,
  toggleListItem,
  deleteListItem,

  // Messaging
  sendMessage,
  getMessages,
  getMessageBody,
  getXmppMessages,
  sendXmppMessage,
  getPresence,
  getMessagingInfo,

  // Instance Management
  getInstances,
  getInstance,
  haveIBootstrappedBefore,
  preApprove,
  wakeInstance,
  continueConversation,
  getConversationLog,
  // promoteInstance, // API does not exist in OpenAPI spec
  generateRecoveryKey,
  // getServerStatus, // API does not exist in OpenAPI spec

  // Configuration
  getPersonalities,
  getRoles,
  getRoleDetails,
  getPersonalityDetails,
  getInstanceDetails
};

export default api;
