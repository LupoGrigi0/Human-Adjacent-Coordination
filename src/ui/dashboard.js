/**
 * Dashboard Module
 *
 * Handles the main dashboard view with metrics, quick actions,
 * and summary widgets.
 *
 * @module dashboard
 */

import { state } from './state.js';
import { escapeHtml, formatRelativeTime } from './utils.js';
import { showTaskDetail, showInstanceDetail } from './details.js';
import api from './api.js';

// ============================================================================
// DASHBOARD LOADING
// ============================================================================

/**
 * Load dashboard data and render
 */
export async function loadDashboard() {
    renderMetrics();
    await loadRecentActivity();
    await loadQuickTasks();
}

/**
 * Render metrics cards
 */
function renderMetrics() {
    // Active instances
    const activeInstances = state.instances.filter(i => i.status === 'active').length;
    const instancesEl = document.getElementById('metric-instances');
    if (instancesEl) instancesEl.textContent = activeInstances;

    // Active projects
    const activeProjects = state.projects.filter(p => p.status === 'active').length;
    const projectsEl = document.getElementById('metric-projects');
    if (projectsEl) projectsEl.textContent = activeProjects;

    // Pending tasks
    const pendingTasks = state.tasks.filter(t => t.status !== 'completed').length;
    const tasksEl = document.getElementById('metric-tasks');
    if (tasksEl) tasksEl.textContent = pendingTasks;

    // Unread messages
    const messagesEl = document.getElementById('metric-messages');
    if (messagesEl) messagesEl.textContent = state.unreadCount || 0;
}

/**
 * Load recent activity
 */
async function loadRecentActivity() {
    const container = document.getElementById('recent-activity');
    if (!container) return;

    container.innerHTML = '<div class="loading-placeholder">Loading...</div>';

    try {
        // Combine recent data from various sources
        const activities = [];

        // Recent messages
        const msgResult = await api.getMessages(state.instanceId, { limit: 5 });
        const messages = msgResult.messages || [];
        messages.forEach(msg => {
            activities.push({
                type: 'message',
                text: `Message from ${msg.from?.split('-')[0] || 'Unknown'}`,
                time: msg.timestamp,
                id: msg.id
            });
        });

        // Sort by time
        activities.sort((a, b) => new Date(b.time) - new Date(a.time));

        if (activities.length === 0) {
            container.innerHTML = '<div class="empty-placeholder">No recent activity</div>';
            return;
        }

        container.innerHTML = activities.slice(0, 10).map(act => `
            <div class="activity-item" data-type="${act.type}" data-id="${escapeHtml(act.id || '')}">
                <span class="activity-icon">${getActivityIcon(act.type)}</span>
                <span class="activity-text">${escapeHtml(act.text)}</span>
                <span class="activity-time">${formatRelativeTime(act.time)}</span>
            </div>
        `).join('');

    } catch (error) {
        console.error('[Dashboard] Error loading activity:', error);
        container.innerHTML = '<div class="error-placeholder">Could not load activity</div>';
    }
}

/**
 * Load quick tasks (top priority)
 */
async function loadQuickTasks() {
    const container = document.getElementById('quick-tasks');
    if (!container) return;

    const topTasks = state.tasks
        .filter(t => t.status !== 'completed')
        .sort((a, b) => {
            const priorityOrder = { emergency: 0, critical: 1, high: 2, medium: 3, low: 4, whenever: 5 };
            return (priorityOrder[a.priority] || 3) - (priorityOrder[b.priority] || 3);
        })
        .slice(0, 5);

    if (topTasks.length === 0) {
        container.innerHTML = '<div class="empty-placeholder">No pending tasks</div>';
        return;
    }

    container.innerHTML = topTasks.map(task => `
        <div class="quick-task-item" data-task-id="${escapeHtml(task.id || task.taskId)}">
            <span class="task-priority-dot priority-${task.priority || 'medium'}"></span>
            <span class="task-title">${escapeHtml(task.title)}</span>
        </div>
    `).join('');

    // Add click handlers
    container.querySelectorAll('.quick-task-item').forEach(item => {
        item.addEventListener('click', () => {
            const taskId = item.dataset.taskId;
            showTaskDetail(taskId, true);
        });
    });
}

/**
 * Get icon for activity type
 */
function getActivityIcon(type) {
    switch (type) {
        case 'message': return '\u{2709}'; // envelope
        case 'task': return '\u{2713}'; // check
        case 'project': return '\u{1F4C1}'; // folder
        case 'instance': return '\u{1F464}'; // person
        default: return '\u{2022}'; // bullet
    }
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
    loadDashboard,
    renderMetrics
};
