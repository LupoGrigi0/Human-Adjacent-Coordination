/**
 * Shared Detail Panel System
 *
 * Provides detail views for tasks, instances, and documents that can be
 * opened from any context (projects, dashboard, search, etc.) with
 * breadcrumb navigation support.
 *
 * @module details
 */

import { state, pushBreadcrumb, popBreadcrumb, clearBreadcrumbs } from './state.js';
import { escapeHtml, showToast, formatDateTime, getAvatarChar, getStatusClass, getPriorityClass } from './utils.js';
import api from './api.js';

// ============================================================================
// DETAIL PANEL CONTAINER
// ============================================================================

/**
 * Get or create the shared detail panel overlay
 * @returns {HTMLElement} The detail panel container
 */
function getDetailContainer() {
    let container = document.getElementById('shared-detail-panel');
    if (!container) {
        container = document.createElement('div');
        container.id = 'shared-detail-panel';
        container.className = 'detail-overlay';
        container.innerHTML = `
            <div class="detail-panel">
                <div class="detail-header">
                    <div class="detail-breadcrumbs" id="detail-breadcrumbs"></div>
                    <button class="detail-close-btn" id="detail-close-btn">&times;</button>
                </div>
                <div class="detail-content" id="detail-content"></div>
            </div>
        `;
        document.body.appendChild(container);

        // Close button handler
        container.querySelector('#detail-close-btn').addEventListener('click', closeDetailPanel);

        // Click outside to close
        container.addEventListener('click', (e) => {
            if (e.target === container) closeDetailPanel();
        });

        // Escape key to close
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && container.classList.contains('active')) {
                closeDetailPanel();
            }
        });
    }
    return container;
}

/**
 * Close the detail panel
 */
export function closeDetailPanel() {
    const container = document.getElementById('shared-detail-panel');
    if (container) {
        container.classList.remove('active');
    }
    clearBreadcrumbs();
    state.currentTaskDetail = null;
    state.currentInstanceDetail = null;
    state.currentDocument = null;
}

/**
 * Navigate back one level in breadcrumbs
 */
export function navigateBack() {
    const prev = popBreadcrumb();
    if (!prev) {
        closeDetailPanel();
        return;
    }

    // Re-open the previous detail
    switch (prev.type) {
        case 'project':
            // Projects have their own detail panel, close shared one
            closeDetailPanel();
            // Trigger project detail if there's a handler
            if (typeof window.showProjectDetail === 'function') {
                window.showProjectDetail(prev.id);
            }
            break;
        case 'task':
            showTaskDetail(prev.id, false); // false = don't add breadcrumb
            break;
        case 'instance':
            showInstanceDetail(prev.id, false);
            break;
        case 'document':
            showDocumentDetail(prev.id, false);
            break;
    }
}

/**
 * Render breadcrumbs
 */
function renderBreadcrumbs() {
    const container = document.getElementById('detail-breadcrumbs');
    if (!container) return;

    const crumbs = state.breadcrumbs.map((crumb, idx) => {
        const isLast = idx === state.breadcrumbs.length - 1;
        if (isLast) {
            return `<span class="breadcrumb-item current">${escapeHtml(crumb.label)}</span>`;
        }
        return `<span class="breadcrumb-item clickable" data-idx="${idx}">${escapeHtml(crumb.label)}</span>`;
    });

    container.innerHTML = crumbs.join('<span class="breadcrumb-sep">/</span>');

    // Add click handlers for non-current breadcrumbs
    container.querySelectorAll('.breadcrumb-item.clickable').forEach(el => {
        el.addEventListener('click', () => {
            const idx = parseInt(el.dataset.idx, 10);
            // Pop back to that level
            while (state.breadcrumbs.length > idx + 1) {
                popBreadcrumb();
            }
            navigateBack();
        });
    });
}

// ============================================================================
// TASK DETAIL
// ============================================================================

/**
 * Show task detail panel
 * @param {string} taskId - Task ID to show
 * @param {boolean} [addBreadcrumb=true] - Whether to add to breadcrumb stack
 * @param {object} [context] - Optional context (e.g., { from: 'project', projectId: 'xxx' })
 */
export async function showTaskDetail(taskId, addBreadcrumb = true, context = {}) {
    const container = getDetailContainer();
    const content = document.getElementById('detail-content');

    if (addBreadcrumb) {
        pushBreadcrumb('task', taskId, `Task: ${taskId.slice(0, 12)}...`);
    }

    state.currentTaskDetail = taskId;
    content.innerHTML = '<div class="loading-placeholder">Loading task...</div>';
    container.classList.add('active');
    renderBreadcrumbs();

    try {
        // Fetch task details
        const result = await api.getTask(state.instanceId, taskId);
        const task = result.task || result;

        if (!task) {
            content.innerHTML = '<div class="error-placeholder">Task not found</div>';
            return;
        }

        content.innerHTML = `
            <div class="task-detail">
                <div class="task-detail-header">
                    <h2 class="task-title">${escapeHtml(task.title)}</h2>
                    <span class="task-priority ${getPriorityClass(task.priority)}">${task.priority || 'medium'}</span>
                    <span class="task-status ${getStatusClass(task.status)}">${task.status || 'pending'}</span>
                </div>

                <div class="task-detail-meta">
                    <div class="meta-item">
                        <span class="meta-label">ID:</span>
                        <span class="meta-value">${escapeHtml(task.id || task.taskId)}</span>
                    </div>
                    <div class="meta-item">
                        <span class="meta-label">Created:</span>
                        <span class="meta-value">${formatDateTime(task.createdAt)}</span>
                    </div>
                    ${task.assignedTo ? `
                    <div class="meta-item">
                        <span class="meta-label">Assigned to:</span>
                        <span class="meta-value clickable-instance" data-instance-id="${escapeHtml(task.assignedTo)}">${escapeHtml(task.assignedTo)}</span>
                    </div>
                    ` : ''}
                    ${task.projectId ? `
                    <div class="meta-item">
                        <span class="meta-label">Project:</span>
                        <span class="meta-value">${escapeHtml(task.projectId)}</span>
                    </div>
                    ` : ''}
                </div>

                ${task.description ? `
                <div class="task-detail-description">
                    <h3>Description</h3>
                    <p>${escapeHtml(task.description)}</p>
                </div>
                ` : ''}

                <div class="task-detail-actions">
                    <button class="btn btn-primary" id="task-action-status">Change Status</button>
                    <button class="btn btn-secondary" id="task-action-priority">Change Priority</button>
                    ${!task.assignedTo ? `<button class="btn btn-secondary" id="task-action-claim">Claim Task</button>` : ''}
                </div>
            </div>
        `;

        // Add click handlers for instance links
        content.querySelectorAll('.clickable-instance').forEach(el => {
            el.addEventListener('click', () => {
                showInstanceDetail(el.dataset.instanceId, true, { from: 'task', taskId });
            });
        });

        // TODO: Wire up action buttons

    } catch (error) {
        console.error('[Details] Error loading task:', error);
        content.innerHTML = `<div class="error-placeholder">Error: ${escapeHtml(error.message)}</div>`;
    }
}

// ============================================================================
// INSTANCE DETAIL
// ============================================================================

/**
 * Show instance detail panel
 * @param {string} instanceId - Instance ID to show
 * @param {boolean} [addBreadcrumb=true] - Whether to add to breadcrumb stack
 * @param {object} [context] - Optional context
 */
export async function showInstanceDetail(instanceId, addBreadcrumb = true, context = {}) {
    const container = getDetailContainer();
    const content = document.getElementById('detail-content');

    // Get instance name for breadcrumb
    const cachedInstance = state.instances.find(i => i.instanceId === instanceId);
    const displayName = cachedInstance?.name || instanceId.split('-')[0] || instanceId;

    if (addBreadcrumb) {
        pushBreadcrumb('instance', instanceId, displayName);
    }

    state.currentInstanceDetail = instanceId;
    content.innerHTML = '<div class="loading-placeholder">Loading instance...</div>';
    container.classList.add('active');
    renderBreadcrumbs();

    try {
        // Fetch instance details
        const result = await api.getInstance(state.instanceId, instanceId);
        const instance = result.instance || result;

        if (!instance) {
            content.innerHTML = '<div class="error-placeholder">Instance not found</div>';
            return;
        }

        const isOnline = instance.status === 'active';
        const avatarChar = getAvatarChar(instance.name);

        content.innerHTML = `
            <div class="instance-detail">
                <div class="instance-detail-header">
                    <div class="instance-avatar large">${avatarChar}</div>
                    <div class="instance-info">
                        <h2 class="instance-name">${escapeHtml(instance.name || 'Unknown')}</h2>
                        <span class="instance-id">${escapeHtml(instance.instanceId)}</span>
                        <span class="instance-status ${isOnline ? 'online' : 'offline'}">${isOnline ? 'Online' : 'Offline'}</span>
                    </div>
                </div>

                <div class="instance-detail-meta">
                    <div class="meta-item">
                        <span class="meta-label">Role:</span>
                        <span class="meta-value">${escapeHtml(instance.role || 'None')}</span>
                    </div>
                    <div class="meta-item">
                        <span class="meta-label">Personality:</span>
                        <span class="meta-value">${escapeHtml(instance.personality || 'None')}</span>
                    </div>
                    <div class="meta-item">
                        <span class="meta-label">Project:</span>
                        <span class="meta-value">${escapeHtml(instance.project || 'None')}</span>
                    </div>
                    <div class="meta-item">
                        <span class="meta-label">Last Active:</span>
                        <span class="meta-value">${formatDateTime(instance.lastActiveAt)}</span>
                    </div>
                </div>

                ${instance.description ? `
                <div class="instance-detail-description">
                    <h3>Description</h3>
                    <p>${escapeHtml(instance.description)}</p>
                </div>
                ` : ''}

                <div class="instance-detail-actions">
                    <button class="btn btn-primary" id="instance-action-message">Send Message</button>
                    ${isOnline ? `<button class="btn btn-secondary" id="instance-action-continue">Continue Conversation</button>` : ''}
                    <button class="btn btn-secondary" id="instance-action-assign">Assign to Project</button>
                </div>
            </div>
        `;

        // TODO: Wire up action buttons

    } catch (error) {
        console.error('[Details] Error loading instance:', error);
        content.innerHTML = `<div class="error-placeholder">Error: ${escapeHtml(error.message)}</div>`;
    }
}

// ============================================================================
// DOCUMENT DETAIL
// ============================================================================

/**
 * Show document detail panel
 * @param {string} documentId - Document ID to show
 * @param {boolean} [addBreadcrumb=true] - Whether to add to breadcrumb stack
 * @param {object} [context] - Optional context (e.g., { projectId: 'xxx' })
 */
export async function showDocumentDetail(documentId, addBreadcrumb = true, context = {}) {
    const container = getDetailContainer();
    const content = document.getElementById('detail-content');

    if (addBreadcrumb) {
        pushBreadcrumb('document', documentId, `Doc: ${documentId.slice(0, 20)}...`);
    }

    state.currentDocument = documentId;
    content.innerHTML = '<div class="loading-placeholder">Loading document...</div>';
    container.classList.add('active');
    renderBreadcrumbs();

    try {
        // Fetch document - context.projectId tells us which project
        const projectId = context.projectId || state.currentProjectDetail;
        if (!projectId) {
            throw new Error('Project context required for documents');
        }

        const result = await api.readDocument(state.instanceId, projectId, documentId);
        const doc = result.document || result;

        if (!doc) {
            content.innerHTML = '<div class="error-placeholder">Document not found</div>';
            return;
        }

        content.innerHTML = `
            <div class="document-detail">
                <div class="document-detail-header">
                    <h2 class="document-title">${escapeHtml(doc.name || documentId)}</h2>
                    <span class="document-type">${escapeHtml(doc.type || 'unknown')}</span>
                </div>

                <div class="document-detail-meta">
                    <div class="meta-item">
                        <span class="meta-label">Created:</span>
                        <span class="meta-value">${formatDateTime(doc.createdAt)}</span>
                    </div>
                    <div class="meta-item">
                        <span class="meta-label">Updated:</span>
                        <span class="meta-value">${formatDateTime(doc.updatedAt)}</span>
                    </div>
                </div>

                <div class="document-content">
                    <pre>${escapeHtml(doc.content || 'No content')}</pre>
                </div>
            </div>
        `;

    } catch (error) {
        console.error('[Details] Error loading document:', error);
        content.innerHTML = `<div class="error-placeholder">Error: ${escapeHtml(error.message)}</div>`;
    }
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
    showTaskDetail,
    showInstanceDetail,
    showDocumentDetail,
    closeDetailPanel,
    navigateBack
};
