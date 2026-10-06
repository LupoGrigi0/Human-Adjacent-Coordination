/**
 * HACS API Client for Test Read-Back Verification
 *
 * Makes direct JSON-RPC calls to the HACS coordination API so that
 * Playwright tests can compare DOM content against the API source of truth.
 *
 * The HACS API uses JSON-RPC 2.0 with a tools/call envelope:
 *   { jsonrpc: "2.0", id: N, method: "tools/call", params: { name: "api_name", arguments: {...} } }
 *
 * Usage:
 *   const { HacsApiClient } = require('./api-client');
 *   const api = new HacsApiClient();
 *   const instances = await api.getInstances();
 *   expect(domCount).toBe(instances.length);
 */

const { API_URL, LUPO_INSTANCE_ID } = require('./test-data');

class HacsApiClient {
  /**
   * @param {object} [options]
   * @param {string} [options.apiUrl] - Override API endpoint
   * @param {string} [options.instanceId] - Caller instance ID (default: Lupo)
   */
  constructor(options = {}) {
    this.apiUrl = options.apiUrl || API_URL;
    this.instanceId = options.instanceId || LUPO_INSTANCE_ID;
    this._requestId = 0;
  }

  // --------------------------------------------------------------------------
  // Low-level JSON-RPC transport
  // --------------------------------------------------------------------------

  /**
   * Send a JSON-RPC 2.0 request to the HACS MCP endpoint.
   * @param {string} method - HACS tool name (e.g. 'get_all_instances')
   * @param {object} [args] - Tool arguments
   * @returns {Promise<object>} Parsed result payload
   */
  async rpc(method, args = {}) {
    const id = ++this._requestId;
    const payload = {
      jsonrpc: '2.0',
      id,
      method: 'tools/call',
      params: {
        name: method,
        arguments: args,
      },
    };

    const response = await fetch(this.apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(`HACS API HTTP ${response.status}: ${response.statusText}`);
    }

    const json = await response.json();

    if (json.error) {
      const err = new Error(json.error.message || 'Unknown API error');
      err.code = json.error.code;
      err.data = json.error.data;
      throw err;
    }

    // The HACS server wraps results: { result: { data: ... } } or { result: ... }
    return json.result?.data || json.result;
  }

  // --------------------------------------------------------------------------
  // Instance APIs
  // --------------------------------------------------------------------------

  /**
   * Get all registered instances.
   * @returns {Promise<Array<object>>} Array of instance objects
   */
  async getInstances() {
    const result = await this.rpc('get_all_instances', {});
    return result.instances || [];
  }

  /**
   * Get detailed info for a single instance (V2 endpoint with preferences/gestalt).
   * @param {string} targetInstanceId
   * @returns {Promise<object>} Instance details
   */
  async getInstanceDetails(targetInstanceId) {
    return this.rpc('get_instance_v2', {
      instanceId: this.instanceId,
      targetInstanceId,
    });
  }

  /**
   * Introspect an instance (full context dump).
   * @param {string} [instanceId]
   * @returns {Promise<object>}
   */
  async introspect(instanceId) {
    return this.rpc('introspect', { instanceId: instanceId || this.instanceId });
  }

  // --------------------------------------------------------------------------
  // Project APIs
  // --------------------------------------------------------------------------

  /**
   * List all projects.
   * @returns {Promise<Array<object>>} Array of project objects
   */
  async getProjects() {
    const result = await this.rpc('list_projects', {});
    return result.projects || [];
  }

  /**
   * Get full details for a single project.
   * @param {string} projectId
   * @returns {Promise<object>}
   */
  async getProject(projectId) {
    return this.rpc('get_project', { projectId });
  }

  // --------------------------------------------------------------------------
  // Task APIs
  // --------------------------------------------------------------------------

  /**
   * Get tasks assigned to an instance (personal + project).
   * @param {string} [instanceId]
   * @returns {Promise<object>} Tasks result
   */
  async getMyTasks(instanceId) {
    return this.rpc('get_my_tasks', {
      instanceId: instanceId || this.instanceId,
    });
  }

  /**
   * List tasks with optional filters.
   * @param {object} [options]
   * @param {string} [options.projectId]
   * @param {string} [options.status]
   * @param {number} [options.limit]
   * @returns {Promise<object>} Tasks result with pagination
   */
  async listTasks(options = {}) {
    return this.rpc('list_tasks', {
      instanceId: this.instanceId,
      ...options,
    });
  }

  /**
   * Get a single task by ID.
   * @param {string} taskId
   * @param {string} [projectId]
   * @returns {Promise<object>}
   */
  async getTask(taskId, projectId) {
    const params = { instanceId: this.instanceId, taskId };
    if (projectId) params.projectId = projectId;
    return this.rpc('get_task', params);
  }

  // --------------------------------------------------------------------------
  // List APIs (Personal Checklists)
  // --------------------------------------------------------------------------

  /**
   * Get all personal lists for an instance.
   * @param {string} [targetInstanceId] - View another instance's lists
   * @returns {Promise<object>}
   */
  async getLists(targetInstanceId) {
    const params = { instanceId: this.instanceId };
    if (targetInstanceId) params.targetInstanceId = targetInstanceId;
    return this.rpc('get_lists', params);
  }

  /**
   * Get a single list with items.
   * @param {string} listId
   * @param {string} [targetInstanceId]
   * @returns {Promise<object>}
   */
  async getList(listId, targetInstanceId) {
    const params = { instanceId: this.instanceId, listId };
    if (targetInstanceId) params.targetInstanceId = targetInstanceId;
    return this.rpc('get_list', params);
  }

  // --------------------------------------------------------------------------
  // Messaging APIs
  // --------------------------------------------------------------------------

  /**
   * Get XMPP messages for the dashboard user.
   * @param {object} [options]
   * @param {number} [options.limit]
   * @param {string} [options.room]
   * @returns {Promise<object>}
   */
  async getMessages(options = {}) {
    return this.rpc('xmpp_get_messages', {
      instanceId: this.instanceId,
      ...options,
    });
  }

  /**
   * Get full body of a single message.
   * @param {string} messageId
   * @param {string} [room]
   * @returns {Promise<object>}
   */
  async getMessage(messageId, room) {
    const params = { instanceId: this.instanceId, id: messageId };
    if (room) params.room = room;
    return this.rpc('xmpp_get_message', params);
  }

  /**
   * Get presence information.
   * @returns {Promise<object>}
   */
  async getPresence() {
    return this.rpc('get_presence', { instanceId: this.instanceId });
  }

  /**
   * Get messaging system info.
   * @returns {Promise<object>}
   */
  async getMessagingInfo() {
    return this.rpc('get_messaging_info', { instanceId: this.instanceId });
  }

  // --------------------------------------------------------------------------
  // Document APIs
  // --------------------------------------------------------------------------

  /**
   * List documents.
   * @param {string} [target] - e.g. "project:hacs-ui"
   * @returns {Promise<object>}
   */
  async listDocuments(target) {
    const params = { instanceId: this.instanceId };
    if (target) params.target = target;
    return this.rpc('list_documents', params);
  }

  // --------------------------------------------------------------------------
  // Diary APIs
  // --------------------------------------------------------------------------

  /**
   * Get diary for an instance.
   * @param {string} [instanceId]
   * @returns {Promise<object>}
   */
  async getDiary(instanceId) {
    return this.rpc('get_diary', {
      instanceId: instanceId || this.instanceId,
    });
  }

  // --------------------------------------------------------------------------
  // Configuration APIs
  // --------------------------------------------------------------------------

  /**
   * Get available personalities.
   * @returns {Promise<object>}
   */
  async getPersonalities() {
    return this.rpc('get_personalities', {});
  }

  /**
   * Get available roles.
   * @returns {Promise<object>}
   */
  async getRoles() {
    return this.rpc('list_roles', {});
  }

  /**
   * Get conversation log for a woken instance.
   * @param {string} targetInstanceId
   * @param {number} [limit]
   * @returns {Promise<object>}
   */
  async getConversationLog(targetInstanceId, limit) {
    const params = {
      instanceId: this.instanceId,
      targetInstanceId,
    };
    if (limit) params.limit = limit;
    return this.rpc('get_conversation_log', params);
  }
}

module.exports = { HacsApiClient, ApiClient: HacsApiClient };
