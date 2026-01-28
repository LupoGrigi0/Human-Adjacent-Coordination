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
// ENTITY DETAILS MODAL (Instance, Role, Personality, Project)
// ============================================================================

/**
 * Show entity details modal for the current conversation target
 * @description Shows instance details for the current wake conversation target
 */
export function showConversationTargetDetails() {
    if (!state.wakeConversationTarget) return;
    showEntityDetails('instance', state.wakeConversationTarget);
}

/**
 * Show entity details in the modal
 * @param {string} type - 'instance' | 'role' | 'personality' | 'project'
 * @param {string} id - The entity ID
 * @description Router function that shows entity details in a modal popup
 */
export async function showEntityDetails(type, id) {
    const modal = document.getElementById('entity-details-modal');
    const title = document.getElementById('entity-details-title');
    const loading = document.querySelector('.entity-details-loading');

    // Hide all views
    document.querySelectorAll('.entity-view').forEach(v => v.style.display = 'none');
    loading.style.display = 'block';

    // Set title and show modal
    const typeNames = {
        instance: 'Instance Details',
        role: 'Role Details',
        personality: 'Personality Details',
        project: 'Project Details'
    };
    title.textContent = typeNames[type] || 'Details';
    modal.classList.add('active');

    try {
        switch (type) {
            case 'instance':
                await loadInstanceDetails(id);
                break;
            case 'role':
                await loadRoleDetails(id);
                break;
            case 'personality':
                await loadPersonalityDetails(id);
                break;
            case 'project':
                await loadProjectDetailsModal(id);
                break;
        }
    } catch (error) {
        console.error(`[Details] Error loading ${type} details:`, error);
        showToast(`Could not load ${type} details: ${error.message}`, 'error');
    } finally {
        loading.style.display = 'none';
    }
}

/**
 * Load and display instance details in entity modal
 * @param {string} instanceId - The instance ID to load
 * @description Populates the entity-details-modal with instance information
 */
export async function loadInstanceDetails(instanceId) {
    const view = document.getElementById('instance-details-view');

    // First try to get from cached instances
    let instance = state.instances.find(i => i.instanceId === instanceId);

    // Try to fetch detailed info from API
    try {
        const result = await api.getInstanceDetails(state.instanceId, instanceId);
        if (result.success || result.instance) {
            instance = { ...instance, ...(result.instance || result.data?.instance || result) };

            // Handle preferences
            const prefs = result.preferences || result.data?.preferences || result.instance?.preferences;
            if (prefs) {
                document.getElementById('entity-instance-prefs').textContent = JSON.stringify(prefs, null, 2);
            }

            // Handle gestalt
            const gestalt = result.gestalt || result.data?.gestalt || result.instance?.gestalt;
            if (gestalt) {
                document.getElementById('entity-instance-gestalt').textContent = gestalt;
                document.getElementById('entity-instance-gestalt-section').style.display = 'block';
            } else {
                document.getElementById('entity-instance-gestalt-section').style.display = 'none';
            }
        }
    } catch (e) {
        console.log('[Details] Could not fetch detailed instance info, using cached data:', e.message);
        document.getElementById('entity-instance-prefs').textContent = JSON.stringify(instance || {}, null, 2);
        document.getElementById('entity-instance-gestalt-section').style.display = 'none';
    }

    if (!instance) {
        instance = { instanceId };
    }

    // Populate fields
    document.getElementById('entity-instance-id').textContent = instance.instanceId || '-';
    document.getElementById('entity-instance-name').textContent = instance.name || '-';
    document.getElementById('entity-instance-role').textContent = instance.role || '-';
    document.getElementById('entity-instance-personality').textContent = instance.personality || '-';
    document.getElementById('entity-instance-home').textContent = instance.homeDirectory || instance.home || '-';
    document.getElementById('entity-instance-workdir').textContent = instance.workingDirectory || instance.workDir || '-';
    document.getElementById('entity-instance-session').textContent = instance.sessionId || '-';
    document.getElementById('entity-instance-status').textContent = instance.status || instance.wokenStatus || '-';
    document.getElementById('entity-instance-lastactive').textContent =
        instance.lastActiveAt ? new Date(instance.lastActiveAt).toLocaleString() : '-';
    document.getElementById('entity-instance-instructions').textContent = instance.instructions || '-';

    view.style.display = 'block';
}

/**
 * Load and display role details in entity modal
 * @param {string} roleId - The role ID to load
 * @description Populates the entity-details-modal with role information
 */
export async function loadRoleDetails(roleId) {
    const view = document.getElementById('role-details-view');

    try {
        const result = await api.getRoleDetails(roleId);
        const role = result.role || result.data?.role || result;

        document.getElementById('entity-role-id').textContent = role.id || roleId;
        document.getElementById('entity-role-name').textContent = role.name || roleId;
        document.getElementById('entity-role-dir').textContent = role.directory || role.path || '-';
        document.getElementById('entity-role-description').textContent = role.description || '-';
        document.getElementById('entity-role-content').textContent = role.content || role.document || '-';
    } catch (e) {
        console.error('[Details] Error loading role details:', e);
        document.getElementById('entity-role-id').textContent = roleId;
        document.getElementById('entity-role-name').textContent = roleId;
        document.getElementById('entity-role-dir').textContent = '-';
        document.getElementById('entity-role-description').textContent = 'Could not load role details';
        document.getElementById('entity-role-content').textContent = e.message;
    }

    view.style.display = 'block';
}

/**
 * Load and display personality details in entity modal
 * @param {string} personalityId - The personality ID to load
 * @description Populates the entity-details-modal with personality information
 */
export async function loadPersonalityDetails(personalityId) {
    const view = document.getElementById('personality-details-view');

    try {
        const result = await api.getPersonalityDetails(personalityId);
        const personality = result.personality || result.data?.personality || result;

        document.getElementById('entity-personality-id').textContent = personality.id || personalityId;
        document.getElementById('entity-personality-name').textContent = personality.name || personalityId;
        document.getElementById('entity-personality-dir').textContent = personality.directory || personality.path || '-';
        document.getElementById('entity-personality-description').textContent = personality.description || '-';
        document.getElementById('entity-personality-content').textContent = personality.content || personality.document || '-';
    } catch (e) {
        console.error('[Details] Error loading personality details:', e);
        document.getElementById('entity-personality-id').textContent = personalityId;
        document.getElementById('entity-personality-name').textContent = personalityId;
        document.getElementById('entity-personality-dir').textContent = '-';
        document.getElementById('entity-personality-description').textContent = 'Could not load personality details';
        document.getElementById('entity-personality-content').textContent = e.message;
    }

    view.style.display = 'block';
}

/**
 * Load and display project details in entity modal
 * @param {string} projectId - The project ID to load
 * @description Populates the entity-details-modal with project information
 */
export async function loadProjectDetailsModal(projectId) {
    const view = document.getElementById('project-details-view-modal');

    try {
        const result = await api.getProject(projectId);
        const project = result.project || result.data?.project || result;

        document.getElementById('entity-project-id').textContent = project.id || project.projectId || projectId;
        document.getElementById('entity-project-name').textContent = project.name || projectId;
        document.getElementById('entity-project-status').textContent = project.status || '-';
        document.getElementById('entity-project-dir').textContent = project.directory || project.path || '-';
        document.getElementById('entity-project-description').textContent = project.description || '-';
        document.getElementById('entity-project-settings').textContent = JSON.stringify(project, null, 2);
    } catch (e) {
        console.error('[Details] Error loading project details:', e);
        document.getElementById('entity-project-id').textContent = projectId;
        document.getElementById('entity-project-name').textContent = projectId;
        document.getElementById('entity-project-status').textContent = '-';
        document.getElementById('entity-project-dir').textContent = '-';
        document.getElementById('entity-project-description').textContent = 'Could not load project details';
        document.getElementById('entity-project-settings').textContent = e.message;
    }

    view.style.display = 'block';
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
    // Shared detail panel functions
    showTaskDetail,
    showInstanceDetail,
    showDocumentDetail,
    closeDetailPanel,
    navigateBack,
    // Entity details modal functions
    showConversationTargetDetails,
    showEntityDetails,
    loadInstanceDetails,
    loadRoleDetails,
    loadPersonalityDetails,
    loadProjectDetailsModal
};
