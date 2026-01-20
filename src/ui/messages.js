/**
 * Messages Module
 *
 * Handles XMPP messaging, conversations, and notifications.
 *
 * @module messages
 */

import { state } from './state.js';
import { escapeHtml, showToast, formatDateTime, formatRelativeTime } from './utils.js';
import api from './api.js';

// ============================================================================
// MESSAGE LOADING
// ============================================================================

/**
 * Load messages for the current user
 */
export async function loadMessages() {
    // TODO: Implement full messages module
    // This is a stub - the actual implementation is still in app.js
    console.log('[Messages] Loading messages...');
}

/**
 * Start message polling
 */
export function startMessagePolling() {
    if (state.messagePollingInterval) {
        clearInterval(state.messagePollingInterval);
    }

    state.messagePollingInterval = setInterval(async () => {
        try {
            const result = await api.getMessages(state.instanceId, { limit: 5 });
            const unread = result.unreadCount || 0;

            if (unread !== state.unreadCount) {
                state.unreadCount = unread;
                updateUnreadBadge();
            }
        } catch (error) {
            console.error('[Messages] Polling error:', error);
        }
    }, 30000); // 30 seconds
}

/**
 * Stop message polling
 */
export function stopMessagePolling() {
    if (state.messagePollingInterval) {
        clearInterval(state.messagePollingInterval);
        state.messagePollingInterval = null;
    }
}

/**
 * Update unread badge in UI
 */
function updateUnreadBadge() {
    const badge = document.getElementById('messages-unread-badge');
    if (badge) {
        badge.textContent = state.unreadCount > 0 ? state.unreadCount : '';
        badge.style.display = state.unreadCount > 0 ? 'inline-flex' : 'none';
    }
}

// ============================================================================
// SEND MESSAGE
// ============================================================================

/**
 * Send a message
 * @param {object} options - Message options
 * @param {string} options.to - Recipient (instanceId, project:id, role:name, or 'all')
 * @param {string} options.body - Message body
 * @param {string} [options.subject] - Message subject
 */
export async function sendMessage(options) {
    try {
        await api.sendMessage({
            instanceId: state.instanceId,
            from: state.instanceId,
            ...options
        });
        showToast('Message sent!', 'success');
    } catch (error) {
        showToast('Failed to send message: ' + error.message, 'error');
        throw error;
    }
}

// ============================================================================
// CONVERSATION SELECTION
// ============================================================================

/**
 * Select a conversation
 * @param {string} type - 'instance' | 'project' | 'role'
 * @param {string} id - The target ID
 */
export function selectConversation(type, id) {
    state.currentConversation = id;
    state.conversationType = type;

    // TODO: Load conversation messages
    console.log('[Messages] Selected conversation:', type, id);
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
    loadMessages,
    startMessagePolling,
    stopMessagePolling,
    sendMessage,
    selectConversation
};
