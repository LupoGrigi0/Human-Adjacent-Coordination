/**
 * Shared State Management
 *
 * Central state object for the V2 Dashboard.
 * All modules import this to access/modify shared state.
 *
 * @module state
 */

// Configuration - This UI always runs as Lupo (Executive)
export const CONFIG = {
    defaultName: 'Lupo',
    defaultRole: 'Executive',
    storageKey: 'v2_lupo_instance_id',
    fixedInstanceId: 'Lupo-f63b'  // Always use this specific instance ID
};

/**
 * Global application state
 * Shared across all modules
 */
export const state = {
    // Identity
    instanceId: null,
    name: CONFIG.defaultName,
    role: CONFIG.defaultRole,
    personality: null,
    project: null,

    // Data
    projects: [],
    instances: [],
    tasks: [],
    messages: [],
    lists: [],
    diary: '',

    // Lists state
    currentListId: null,
    currentList: null,

    // Instance detail state
    currentInstanceDetail: null,

    // Project detail state
    currentProjectDetail: null,
    currentProject: null,
    currentProjectPM: null,
    pmChatTurns: 0,

    // Task detail state
    currentTaskDetail: null,

    // Document state
    currentDocument: null,

    // Wake API state
    wakeApiKey: null,
    wakeConversationTarget: null,
    wakeConversationTurns: [],
    wakeConversationLoading: false,
    availableRoles: [],
    availablePersonalities: [],

    // UI State
    currentTab: 'dashboard',
    currentConversation: null,
    conversationType: null, // 'instance' | 'project'
    theme: 'light',

    // Navigation breadcrumb stack for detail panels
    // e.g., [{type: 'project', id: 'hacs'}, {type: 'task', id: 'task-123'}]
    breadcrumbs: [],

    // Connection
    connected: false,
    lastUpdate: null,

    // Polling
    messagePollingInterval: null,
    unreadCount: 0
};

/**
 * Push a breadcrumb for navigation
 * @param {string} type - 'project' | 'instance' | 'task' | 'document'
 * @param {string} id - The entity ID
 * @param {string} [label] - Display label
 */
export function pushBreadcrumb(type, id, label) {
    state.breadcrumbs.push({ type, id, label: label || id });
}

/**
 * Pop the last breadcrumb and return it
 * @returns {object|null} The popped breadcrumb or null
 */
export function popBreadcrumb() {
    return state.breadcrumbs.pop() || null;
}

/**
 * Clear all breadcrumbs
 */
export function clearBreadcrumbs() {
    state.breadcrumbs = [];
}

/**
 * Get the current breadcrumb (top of stack)
 * @returns {object|null}
 */
export function getCurrentBreadcrumb() {
    return state.breadcrumbs[state.breadcrumbs.length - 1] || null;
}

export default state;
