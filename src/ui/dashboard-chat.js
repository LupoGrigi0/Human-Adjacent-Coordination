/**
 * Dashboard PA Chat — Genevieve chat panel
 *
 * Fetches messages from XMPP, renders bubble list,
 * sends messages to Genevieve.
 *
 * @module dashboard-chat
 * @author Ember-75b6
 */

import { state } from './state.js';
import { escapeHtml } from './utils.js';
import api from './api.js';

// ============================================================================
// MAIN EXPORT
// ============================================================================

export async function initPAChat(container) {
    if (!container) return;

    try {
        // Fetch messages, filter to Genevieve
        const result = await api.getMessages(state.instanceId, { limit: 30 });
        const headers = result?.messages || result || [];
        const allHeaders = Array.isArray(headers) ? headers : [];

        // Filter for Genevieve-related messages
        const genevieves = allHeaders.filter(m => {
            const from = (m.from || '').toLowerCase();
            const to = (m.to || '').toLowerCase();
            const room = (m.room || '').toLowerCase();
            return from.includes('genevieve') || to.includes('genevieve') || room.includes('genevieve');
        });

        if (genevieves.length === 0) {
            container.innerHTML = '<div style="padding:20px;text-align:center;font-size:12px;color:var(--text-muted)">No messages with Genevieve yet</div>';
            return;
        }

        // Fetch bodies for recent messages (limit to save API calls)
        const recent = genevieves.slice(0, 15);
        const messages = [];

        for (const header of recent) {
            try {
                const body = await api.getMessageBody(state.instanceId, header.id, header.room);
                messages.push({
                    id: header.id,
                    from: header.from || '',
                    body: body?.body || body?.content || header.subject || '(no content)',
                    timestamp: header.timestamp || header.date,
                    isFromPA: (header.from || '').toLowerCase().includes('genevieve')
                });
            } catch (e) {
                messages.push({
                    id: header.id,
                    from: header.from || '',
                    body: header.subject || '(could not load)',
                    timestamp: header.timestamp,
                    isFromPA: (header.from || '').toLowerCase().includes('genevieve')
                });
            }
        }

        // Render messages (oldest first)
        messages.reverse();
        container.innerHTML = messages.map(m => {
            const cls = m.isFromPA ? 'pa' : 'ex';
            const time = m.timestamp ? formatTime(m.timestamp) : '';
            return `<div class="cmsg ${cls}">
                ${escapeHtml(m.body)}
                ${time ? `<div class="meta">${time}</div>` : ''}
            </div>`;
        }).join('');

        // Scroll to bottom
        container.scrollTop = container.scrollHeight;

    } catch (error) {
        console.error('[PAChat] Error loading messages:', error);
        container.innerHTML = '<div style="padding:20px;text-align:center;font-size:12px;color:var(--text-muted)">Could not load messages</div>';
    }

    // Setup send
    setupSend(container);
}

// ============================================================================
// SEND MESSAGE
// ============================================================================

function setupSend(chatContainer) {
    const input = document.getElementById('pa-chat-input');
    const sendBtn = document.getElementById('pa-chat-send');
    if (!input || !sendBtn) return;

    async function send() {
        const text = input.value.trim();
        if (!text) return;

        input.disabled = true;
        sendBtn.disabled = true;

        try {
            await api.sendMessage({
                from: state.instanceId,
                to: 'Genevieve',
                body: text
            });

            // Add sent message to UI
            const msgEl = document.createElement('div');
            msgEl.className = 'cmsg ex';
            msgEl.innerHTML = `${escapeHtml(text)}<div class="meta">just now</div>`;
            chatContainer.appendChild(msgEl);
            chatContainer.scrollTop = chatContainer.scrollHeight;

            input.value = '';
        } catch (error) {
            console.error('[PAChat] Send failed:', error);
        } finally {
            input.disabled = false;
            sendBtn.disabled = false;
            input.focus();
        }
    }

    sendBtn.addEventListener('click', send);
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            send();
        }
    });
}

// ============================================================================
// HELPERS
// ============================================================================

function formatTime(ts) {
    try {
        const d = new Date(ts);
        if (isNaN(d.getTime())) return '';
        const now = new Date();
        const diff = now - d;

        if (diff < 60000) return 'just now';
        if (diff < 3600000) return Math.floor(diff / 60000) + 'm ago';
        if (diff < 86400000) return Math.floor(diff / 3600000) + 'h ago';

        return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    } catch (e) {
        return '';
    }
}
