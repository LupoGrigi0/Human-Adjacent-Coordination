/**
 * Messages Module
 *
 * Handles XMPP messaging, conversations, and notifications.
 *
 * @module messages
 */

import { state } from './state.js';
import { escapeHtml, showToast } from './utils.js';
import api from './api.js';

// ============================================================================
// CONSTANTS
// ============================================================================

/**
 * Known team members for DMs (will be populated from instances + hardcoded known names)
 */
const KNOWN_TEAM_MEMBERS = ['Lupo', 'Messenger', 'Bridge', 'Bastion', 'Canvas', 'Genevieve', 'Meridian'];

/**
 * Polling interval for message updates
 */
const POLLING_INTERVAL = 10000; // 10 seconds

// ============================================================================
// MESSAGE LOADING
// ============================================================================

/**
 * Load messaging sidebar with V2 XMPP structure
 * @description Builds the sidebar with: My Inbox, Direct Messages, Projects, Roles, System
 */
export async function loadMessaging() {
    const sidebar = document.getElementById('conversation-list');

    // Build the sidebar with V2 structure:
    // 1. Direct Messages (DMs to known team members)
    // 2. Projects (project rooms)
    // 3. Roles (if privileged user)
    // 4. System (announcements)

    let html = '';

    // --- MY INBOX (personality room for current user) ---
    const myPersonalityRoom = `personality-${state.name.toLowerCase()}`;
    const isInboxActive = state.conversationType === 'inbox' && state.currentConversation === myPersonalityRoom;
    html += `
        <div class="conversation-section" id="inbox-section">
            <div class="section-header">MY INBOX</div>
            <div id="inbox-list">
                <div class="conversation-item ${isInboxActive ? 'active' : ''}"
                     data-type="inbox" data-id="${myPersonalityRoom}">
                    <div class="conversation-avatar">&#128229;</div>
                    <div class="conversation-details">
                        <div class="conversation-name">Messages to Me</div>
                        <div class="conversation-meta">${state.instanceId || state.name}</div>
                    </div>
                </div>
            </div>
        </div>
    `;

    // --- DIRECT MESSAGES ---
    html += `
        <div class="conversation-section" id="dm-section">
            <div class="section-header">DIRECT MESSAGES</div>
            <div id="dm-list">
                ${renderDMList()}
            </div>
        </div>
    `;

    // --- PROJECTS ---
    html += `
        <div class="conversation-section" id="project-section">
            <div class="section-header">PROJECTS</div>
            <div id="project-room-list">
                ${renderProjectRoomList()}
            </div>
        </div>
    `;

    // --- ROLES (for privileged users like Executive/COO/PA) ---
    if (state.role === 'Executive' || state.role === 'COO' || state.role === 'PA') {
        html += `
            <div class="conversation-section" id="role-section">
                <div class="section-header">ROLES</div>
                <div id="role-list">
                    ${renderRoleList()}
                </div>
            </div>
        `;
    }

    // --- SYSTEM ---
    html += `
        <div class="conversation-section" id="system-section">
            <div class="section-header">SYSTEM</div>
            <div id="system-list">
                <div class="conversation-item ${state.conversationType === 'announcements' ? 'active' : ''}"
                     data-type="announcements" data-id="all">
                    <div class="conversation-avatar">&#128227;</div>
                    <div class="conversation-details">
                        <div class="conversation-name">Announcements</div>
                        <div class="conversation-meta">Broadcast to all</div>
                    </div>
                </div>
            </div>
        </div>
    `;

    sidebar.innerHTML = html;

    // Add click handlers to all conversation items
    sidebar.querySelectorAll('.conversation-item').forEach(item => {
        item.addEventListener('click', () => selectConversation(item.dataset.type, item.dataset.id));
    });
}

/**
 * Render list of DM contacts
 * @returns {string} HTML for DM list
 */
function renderDMList() {
    // Build list of contacts with their instanceIds
    // Map: name -> instanceId (or 'unknown' if from KNOWN_TEAM_MEMBERS without instance)
    const contacts = new Map();

    // Add known team members (may not have instanceId yet)
    KNOWN_TEAM_MEMBERS.forEach(name => {
        contacts.set(name, { name, instanceId: null });
    });

    // Add/update with actual instance data
    state.instances.forEach(inst => {
        if (inst.name) {
            contacts.set(inst.name, {
                name: inst.name,
                instanceId: inst.instanceId || null
            });
        }
    });

    // Remove self (Lupo)
    contacts.delete(state.name);

    // Sort by name
    const sortedContacts = Array.from(contacts.values()).sort((a, b) => a.name.localeCompare(b.name));

    if (sortedContacts.length === 0) {
        return '<div class="loading-placeholder">No contacts</div>';
    }

    return sortedContacts.map(contact => {
        const isActive = state.conversationType === 'dm' && state.currentConversation === contact.name;
        const metaText = contact.instanceId || 'Direct Message';
        return `
            <div class="conversation-item ${isActive ? 'active' : ''}"
                 data-type="dm" data-id="${escapeHtml(contact.name)}">
                <div class="conversation-avatar">${contact.name.charAt(0).toUpperCase()}</div>
                <div class="conversation-details">
                    <div class="conversation-name">${escapeHtml(contact.name)}</div>
                    <div class="conversation-meta">${escapeHtml(metaText)}</div>
                </div>
            </div>
        `;
    }).join('');
}

/**
 * Render list of project rooms
 * @returns {string} HTML for project room list
 */
function renderProjectRoomList() {
    if (state.projects.length === 0) {
        return '<div class="loading-placeholder">No projects</div>';
    }

    return state.projects
        .filter(p => p.status === 'active')
        .map(project => {
            const projectId = project.projectId || project.id;
            const isActive = state.conversationType === 'project' && state.currentConversation === projectId;
            return `
                <div class="conversation-item ${isActive ? 'active' : ''}"
                     data-type="project" data-id="${projectId}">
                    <div class="conversation-avatar">#</div>
                    <div class="conversation-details">
                        <div class="conversation-name">${escapeHtml(project.name)}</div>
                        <div class="conversation-meta">Project Room</div>
                    </div>
                </div>
            `;
        }).join('');
}

/**
 * Render list of role channels
 * @returns {string} HTML for role list
 */
function renderRoleList() {
    // Available role rooms
    const roles = ['Executive', 'COO', 'PA', 'PM', 'Developer'];

    return roles.map(role => {
        const isActive = state.conversationType === 'role' && state.currentConversation === role.toLowerCase();
        return `
            <div class="conversation-item ${isActive ? 'active' : ''}"
                 data-type="role" data-id="${role.toLowerCase()}">
                <div class="conversation-avatar">&#128101;</div>
                <div class="conversation-details">
                    <div class="conversation-name">${role}</div>
                    <div class="conversation-meta">Role Channel</div>
                </div>
            </div>
        `;
    }).join('');
}

// Legacy compatibility functions
function renderInstanceList() {
    loadMessaging();
}

function renderProjectRooms() {
    // Already rendered in loadMessaging
}

// ============================================================================
// MESSAGE DETAIL VIEW
// ============================================================================

/**
 * Show message detail view for inbox messages
 * @param {string} messageId - Message ID
 * @param {string} senderName - Sender name
 * @param {string} subject - Message subject
 * @param {string} room - XMPP room
 */
export async function showMessageDetail(messageId, senderName, subject, room) {
    // Pause polling while viewing detail
    state.viewingMessageDetail = true;

    const container = document.getElementById('chat-messages');
    container.innerHTML = '<div class="loading-placeholder">Loading message...</div>';

    // Update header to show we're viewing a message
    document.querySelector('.recipient-name').textContent = 'Message Detail';
    document.querySelector('.recipient-status').textContent = `From: ${senderName}`;
    document.querySelector('.recipient-icon').textContent = '\u{1F4E8}';  // Envelope icon

    try {
        // Fetch full message body
        const fullMsg = await api.getMessageBody(state.instanceId, messageId, room);
        const body = fullMsg.body || fullMsg.subject || '[No content]';

        // Extract sender name for reply (e.g., "lupo-f63b" -> "Lupo")
        const senderBaseName = senderName.split('-')[0];
        const senderCapitalized = senderBaseName.charAt(0).toUpperCase() + senderBaseName.slice(1);

        container.innerHTML = `
            <div class="message-detail-view">
                <div class="message-detail-header">
                    <button class="btn-back" onclick="selectConversation('inbox', 'personality-${state.name.toLowerCase()}')">
                        ← Back to Inbox
                    </button>
                </div>
                <div class="message-detail-card">
                    <div class="message-detail-from">
                        <span class="detail-label">From:</span>
                        <span class="detail-value">${escapeHtml(senderName)}</span>
                    </div>
                    <div class="message-detail-subject">
                        <span class="detail-label">Subject:</span>
                        <span class="detail-value">${escapeHtml(subject)}</span>
                    </div>
                    <div class="message-detail-body">
                        ${escapeHtml(body)}
                    </div>
                    <div class="message-detail-actions">
                        <button class="btn btn-primary" onclick="replyToMessage('${escapeHtml(senderCapitalized)}', '${escapeHtml(body.substring(0, 200).replace(/'/g, "\\'"))}')">
                            ↩ Reply to ${escapeHtml(senderCapitalized)}
                        </button>
                    </div>
                </div>
            </div>
        `;
    } catch (error) {
        console.error('[App] Error loading message detail:', error);
        container.innerHTML = `
            <div class="empty-state">
                <span class="empty-icon">&#9888;</span>
                <p>Error loading message: ${escapeHtml(error.message)}</p>
            </div>
        `;
    }
}

/**
 * Reply to a message from inbox - navigate to DM with quote
 * @param {string} senderName - Sender name
 * @param {string} originalMessage - Original message to quote
 */
export async function replyToMessage(senderName, originalMessage) {
    // Store the quote to show in the DM
    state.replyQuote = {
        from: senderName,
        text: originalMessage
    };
    // Navigate to DM with sender
    await selectConversation('dm', senderName);
}

/**
 * Dismiss the reply quote
 */
export function dismissQuote() {
    state.replyQuote = null;
    const quote = document.querySelector('.reply-quote');
    if (quote) quote.remove();
}

// ============================================================================
// CONVERSATION SELECTION
// ============================================================================

/**
 * Select a conversation
 * @param {string} type - 'inbox' | 'dm' | 'project' | 'role' | 'announcements'
 * @param {string} id - The target ID
 */
export async function selectConversation(type, id) {
    // Clear detail view flag (resuming normal polling)
    state.viewingMessageDetail = false;

    state.currentConversation = id;
    state.conversationType = type;

    // Update UI to show active conversation
    document.querySelectorAll('.conversation-item').forEach(item => {
        const itemMatch = item.dataset.type === type && item.dataset.id === id;
        item.classList.toggle('active', itemMatch);
    });

    // Update chat header based on conversation type
    let name, status, icon;
    switch (type) {
        case 'dm':
            name = id;  // id is the person's name
            // Find instanceId for this contact
            const contact = state.instances.find(inst => inst.name === id);
            status = contact?.instanceId || 'Direct Message';
            icon = '\u{1F464}';  // Person icon
            break;
        case 'project':
            const project = state.projects.find(p => (p.projectId || p.id) === id);
            console.log('[App] selectConversation project lookup:', { id, found: !!project, projectIds: state.projects.map(p => p.projectId || p.id) });
            name = project?.name || id;
            status = project ? `Project: ${project.projectId || project.id}` : 'Project Room';
            icon = '#';
            break;
        case 'role':
            name = id.charAt(0).toUpperCase() + id.slice(1);  // Capitalize
            status = 'Role Channel';
            icon = '\u{1F465}';  // People icon
            break;
        case 'announcements':
            name = 'Announcements';
            status = 'Broadcast Channel';
            icon = '\u{1F4E2}';  // Megaphone icon
            break;
        case 'inbox':
            name = 'Messages to Me';
            status = state.instanceId || state.name;
            icon = '\u{1F4E9}';  // Envelope icon
            break;
        default:
            name = id;
            status = 'Chat';
            icon = '\u{1F4AC}';  // Speech bubble
    }

    document.querySelector('.recipient-name').textContent = name;
    document.querySelector('.recipient-status').textContent = status;
    document.querySelector('.recipient-icon').textContent = icon;

    // Show input area
    // Hide compose area for inbox (messages come from different senders, reply via DM)
    document.getElementById('chat-input-area').style.display = type === 'inbox' ? 'none' : 'block';

    // Load messages
    await loadConversationMessages(type, id);
}

/**
 * Load messages for a conversation
 * @param {string} type - Conversation type
 * @param {string} id - Conversation ID
 */
export async function loadConversationMessages(type, id) {
    const container = document.getElementById('chat-messages');

    if (!state.instanceId) {
        container.innerHTML = `
            <div class="empty-state">
                <span class="empty-icon">&#128274;</span>
                <p>Bootstrap to send messages</p>
            </div>
        `;
        return;
    }

    container.innerHTML = '<div class="loading-placeholder">Loading messages...</div>';

    try {
        // Determine room name based on conversation type
        // Room format: personality-{name}, project-{id}, role-{role}, announcements
        let room;
        if (type === 'dm') {
            // DM rooms are personality-{name}
            room = `personality-${id.toLowerCase()}`;
        } else if (type === 'project') {
            room = `project-${id}`;
        } else if (type === 'role') {
            room = `role-${id.toLowerCase()}`;
        } else if (type === 'announcements') {
            room = 'announcements';
        } else if (type === 'inbox') {
            // Inbox uses the personality room name directly (id is already "personality-{name}")
            room = id;
        }

        // V2 XMPP API - fetch messages for this specific room
        const result = await api.getMessages(state.instanceId, { room, limit: 50 });
        const conversationMessages = result.messages || [];

        if (conversationMessages.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <span class="empty-icon">&#128172;</span>
                    <p>No messages yet. Start the conversation!</p>
                </div>
            `;
            return;
        }

        // Sort by timestamp (oldest first)
        conversationMessages.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

        // Render messages
        const isInbox = type === 'inbox';
        const messageHtml = await Promise.all(conversationMessages.map(async msg => {
            // Check if message is from current user
            // msg.from could be: "lupo", "lupo-f63b", or full JID
            const fromName = (msg.from || '').toLowerCase().split('-')[0].split('@')[0];
            const myName = (state.name || '').toLowerCase();
            const myInstanceId = (state.instanceId || '').toLowerCase();
            const isSent = fromName === myName ||
                           msg.from?.toLowerCase() === myInstanceId ||
                           msg.from?.toLowerCase().startsWith(myName + '-');
            const time = msg.timestamp ? new Date(msg.timestamp).toLocaleTimeString() : '';

            // For inbox: just show subject (body fetched on click for detail view)
            // For other views: fetch body if needed
            let body = msg.body || msg.subject || '';
            if (!isInbox && !body && msg.id) {
                try {
                    const fullMsg = await api.getMessageBody(state.instanceId, msg.id, room);
                    body = fullMsg.body || fullMsg.subject || '';
                } catch (e) {
                    body = msg.subject || '[Message body unavailable]';
                }
            }

            // In inbox, make entire message clickable to open detail view
            const clickHandler = isInbox && !isSent ?
                `onclick="showMessageDetail('${msg.id}', '${escapeHtml(msg.from || 'Unknown')}', '${escapeHtml((msg.subject || '').replace(/'/g, "\\'"))}', '${room}')" style="cursor: pointer;"` : '';

            // For inbox: show subject only with "click to read" hint
            // For other views: show full body (but skip if body equals subject to avoid duplication)
            const showBody = body && body !== msg.subject;
            const bodyContent = isInbox && !isSent
                ? `<div class="inbox-preview">Click to read & reply</div>`
                : (showBody ? `<div>${escapeHtml(body)}</div>` : '');

            return `
                <div class="message-bubble ${isSent ? 'sent' : 'received'} ${isInbox && !isSent ? 'inbox-message' : ''}" ${clickHandler}>
                    ${!isSent ? `<div class="message-sender">${escapeHtml(msg.from || 'Unknown')}</div>` : ''}
                    ${msg.subject ? `<div class="message-subject"><strong>${escapeHtml(msg.subject)}</strong></div>` : ''}
                    ${bodyContent}
                    <div class="message-meta">${time}</div>
                </div>
            `;
        }));

        // Build final HTML with optional reply quote at top
        let finalHtml = '';
        if (state.replyQuote && type === 'dm') {
            finalHtml = `
                <div class="reply-quote">
                    <div class="reply-quote-header">
                        <span>Replying to message from ${escapeHtml(state.replyQuote.from)}</span>
                        <button class="btn-dismiss-quote" onclick="dismissQuote()">✕</button>
                    </div>
                    <div class="reply-quote-text">${escapeHtml(state.replyQuote.text)}</div>
                </div>
            `;
            // Clear the quote after showing (one-time display)
            state.replyQuote = null;
        }
        finalHtml += messageHtml.join('');
        container.innerHTML = finalHtml;

        // Scroll to bottom
        container.scrollTop = container.scrollHeight;

    } catch (error) {
        console.error('[App] Error loading messages:', error);
        container.innerHTML = `
            <div class="empty-state">
                <span class="empty-icon">&#9888;</span>
                <p>Error loading messages: ${escapeHtml(error.message)}</p>
            </div>
        `;
    }
}

// ============================================================================
// SEND MESSAGE
// ============================================================================

/**
 * Send a message in the current conversation
 */
export async function sendMessage() {
    const input = document.getElementById('message-input');
    const subjectInput = document.getElementById('message-subject');
    const body = input.value.trim();
    const userSubject = subjectInput?.value.trim() || '';

    if (!body || !state.instanceId || !state.currentConversation) {
        return;
    }

    const sendBtn = document.getElementById('send-btn');
    sendBtn.disabled = true;

    try {
        // V2 XMPP addressing format:
        // - DM to person: just the name (e.g., "Messenger")
        // - Project room: "project:{projectId}"
        // - Role room: "role:{role}"
        // - Everyone: "all"
        let to;
        if (state.conversationType === 'dm') {
            // Direct message - just use name
            to = state.currentConversation;
        } else if (state.conversationType === 'project') {
            // Project room
            to = `project:${state.currentConversation}`;
        } else if (state.conversationType === 'role') {
            // Role room
            to = `role:${state.currentConversation}`;
        } else if (state.conversationType === 'announcements') {
            // Broadcast
            to = 'all';
        } else {
            // Fallback - treat as DM
            to = state.currentConversation;
        }

        // Use user-provided subject if available, otherwise use body preview
        const subject = userSubject || (body.length > 50 ? body.substring(0, 50) + '...' : body);
        await api.sendMessage({
            from: state.instanceId,
            to,
            subject: subject,
            body: body
        });

        // Add message to UI
        const container = document.getElementById('chat-messages');
        const emptyState = container.querySelector('.empty-state');
        if (emptyState) {
            container.innerHTML = '';
        }

        container.innerHTML += `
            <div class="message-bubble sent">
                ${userSubject ? `<div class="message-subject"><strong>${escapeHtml(userSubject)}</strong></div>` : ''}
                <div>${escapeHtml(body)}</div>
                <div class="message-meta">${new Date().toLocaleTimeString()}</div>
            </div>
        `;

        // Scroll to bottom
        container.scrollTop = container.scrollHeight;

        // Clear inputs
        input.value = '';
        input.style.height = 'auto';
        if (subjectInput) subjectInput.value = '';

        showToast('Message sent', 'success');
    } catch (error) {
        console.error('[App] Error sending message:', error);
        showToast('Failed to send message: ' + error.message, 'error');
    }

    sendBtn.disabled = !input.value.trim();
}

// ============================================================================
// MESSAGE POLLING
// ============================================================================

/**
 * Start message polling
 */
export function startMessagePolling() {
    if (state.messagePollingInterval) {
        return; // Already polling
    }

    console.log('[App] Starting message polling...');
    state.messagePollingInterval = setInterval(async () => {
        if (state.currentTab === 'messages' && state.instanceId) {
            await pollMessages();
        }
    }, POLLING_INTERVAL);
}

/**
 * Stop message polling
 */
export function stopMessagePolling() {
    if (state.messagePollingInterval) {
        console.log('[App] Stopping message polling');
        clearInterval(state.messagePollingInterval);
        state.messagePollingInterval = null;
    }
}

/**
 * Poll for new messages
 */
export async function pollMessages() {
    try {
        // V2 XMPP API - get message headers from all rooms
        const result = await api.getMessages(state.instanceId, { limit: 20 });
        const newMessages = result.messages || [];

        // Count total new messages (V2 doesn't have read/unread tracking yet)
        const totalCount = result.total_available || newMessages.length;

        if (totalCount !== state.unreadCount) {
            state.unreadCount = totalCount;
            updateUnreadBadge();
        }

        // Store messages for quick access
        state.messages = newMessages;

        // If viewing a conversation, refresh it
        // BUT skip refresh if user is viewing message detail or composing a reply
        if (state.currentConversation && !state.viewingMessageDetail && !state.replyQuote) {
            await loadConversationMessages(state.conversationType, state.currentConversation);
        }

    } catch (error) {
        console.error('[App] Polling error:', error);
    }
}

/**
 * Update unread badge in UI
 */
function updateUnreadBadge() {
    const badge = document.getElementById('unread-count');
    if (badge) {
        if (state.unreadCount > 0) {
            badge.textContent = state.unreadCount > 99 ? '99+' : state.unreadCount;
            badge.style.display = 'inline-block';
        } else {
            badge.style.display = 'none';
        }
    }
    // Also update bottom nav badge (mobile)
    if (window.updateBottomNavUnreadBadge) {
        window.updateBottomNavUnreadBadge(state.unreadCount);
    }
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
    loadMessaging,
    renderDMList,
    renderProjectRoomList,
    renderRoleList,
    renderInstanceList,
    renderProjectRooms,
    showMessageDetail,
    replyToMessage,
    dismissQuote,
    selectConversation,
    loadConversationMessages,
    sendMessage,
    startMessagePolling,
    stopMessagePolling,
    pollMessages,
    updateUnreadBadge,
    KNOWN_TEAM_MEMBERS,
    POLLING_INTERVAL
};
