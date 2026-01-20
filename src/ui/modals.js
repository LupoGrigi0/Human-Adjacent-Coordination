/**
 * Shared Modal System
 *
 * Provides modal dialogs that can be used from any module.
 * Includes task creation, instance assignment, confirmations, etc.
 *
 * @module modals
 */

import { state } from './state.js';
import { escapeHtml, showToast } from './utils.js';
import api from './api.js';

// ============================================================================
// MODAL MANAGEMENT
// ============================================================================

/**
 * Show a modal by ID
 * @param {string} modalId - The modal element ID
 */
export function showModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.add('active');
    }
}

/**
 * Hide a modal by ID
 * @param {string} modalId - The modal element ID
 */
export function hideModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.remove('active');
    }
}

/**
 * Hide all modals
 */
export function hideAllModals() {
    document.querySelectorAll('.modal.active').forEach(modal => {
        modal.classList.remove('active');
    });
}

// ============================================================================
// CONFIRMATION MODAL
// ============================================================================

/**
 * Show a confirmation dialog
 * @param {object} options - Dialog options
 * @param {string} options.title - Dialog title
 * @param {string} options.message - Dialog message
 * @param {string} [options.confirmText='Confirm'] - Confirm button text
 * @param {string} [options.cancelText='Cancel'] - Cancel button text
 * @param {string} [options.type='info'] - Dialog type: 'info' | 'warning' | 'danger'
 * @returns {Promise<boolean>} True if confirmed, false if cancelled
 */
export function showConfirm(options) {
    return new Promise((resolve) => {
        const {
            title = 'Confirm',
            message = 'Are you sure?',
            confirmText = 'Confirm',
            cancelText = 'Cancel',
            type = 'info'
        } = options;

        // Create or get confirm modal
        let modal = document.getElementById('confirm-modal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'confirm-modal';
            modal.className = 'modal';
            modal.innerHTML = `
                <div class="modal-content">
                    <div class="modal-header">
                        <h3 id="confirm-title"></h3>
                    </div>
                    <div class="modal-body">
                        <p id="confirm-message"></p>
                    </div>
                    <div class="modal-footer">
                        <button class="btn btn-secondary" id="confirm-cancel"></button>
                        <button class="btn" id="confirm-ok"></button>
                    </div>
                </div>
            `;
            document.body.appendChild(modal);
        }

        // Populate content
        modal.querySelector('#confirm-title').textContent = title;
        modal.querySelector('#confirm-message').textContent = message;
        modal.querySelector('#confirm-cancel').textContent = cancelText;

        const okBtn = modal.querySelector('#confirm-ok');
        okBtn.textContent = confirmText;
        okBtn.className = `btn btn-${type === 'danger' ? 'danger' : 'primary'}`;

        // Show modal
        modal.classList.add('active');

        // Handle buttons
        const handleConfirm = () => {
            modal.classList.remove('active');
            cleanup();
            resolve(true);
        };

        const handleCancel = () => {
            modal.classList.remove('active');
            cleanup();
            resolve(false);
        };

        const cleanup = () => {
            okBtn.removeEventListener('click', handleConfirm);
            modal.querySelector('#confirm-cancel').removeEventListener('click', handleCancel);
        };

        okBtn.addEventListener('click', handleConfirm);
        modal.querySelector('#confirm-cancel').addEventListener('click', handleCancel);
    });
}

// ============================================================================
// TASK CREATION MODAL
// ============================================================================

/**
 * Show the create task modal
 * @param {object} [options] - Options
 * @param {string} [options.projectId] - Pre-select project
 * @param {boolean} [options.lockProject=false] - Lock project selection
 * @param {Function} [options.onCreated] - Callback after task created
 */
export function showCreateTaskModal(options = {}) {
    const modal = document.getElementById('create-task-modal');
    if (!modal) {
        console.warn('[Modals] Create task modal not found');
        return;
    }

    // Reset form
    const form = modal.querySelector('form') || modal;
    const titleInput = document.getElementById('task-title');
    const descInput = document.getElementById('task-description');
    const projectSelect = document.getElementById('task-project');
    const prioritySelect = document.getElementById('task-priority');

    if (titleInput) titleInput.value = '';
    if (descInput) descInput.value = '';
    if (prioritySelect) prioritySelect.value = 'medium';

    // Populate project dropdown
    if (projectSelect) {
        projectSelect.innerHTML = '<option value="">Personal Task</option>' +
            state.projects.map(p => {
                const id = p.projectId || p.id;
                const name = p.name || id;
                return `<option value="${escapeHtml(id)}">${escapeHtml(name)}</option>`;
            }).join('');

        if (options.projectId) {
            projectSelect.value = options.projectId;
        }
        projectSelect.disabled = options.lockProject || false;
    }

    // Store callback
    modal._onCreated = options.onCreated;

    modal.classList.add('active');

    // Focus title
    if (titleInput) {
        setTimeout(() => titleInput.focus(), 100);
    }
}

/**
 * Handle task creation form submission
 * Called by the modal's submit button
 */
export async function handleCreateTask() {
    const title = document.getElementById('task-title')?.value?.trim();
    const description = document.getElementById('task-description')?.value?.trim();
    const projectId = document.getElementById('task-project')?.value;
    const priority = document.getElementById('task-priority')?.value || 'medium';

    if (!title) {
        showToast('Please enter a task title', 'error');
        return;
    }

    if (!state.instanceId) {
        showToast('Not connected', 'error');
        return;
    }

    try {
        const taskParams = {
            instanceId: state.instanceId,
            title,
            priority
        };

        if (description) taskParams.description = description;
        if (projectId) taskParams.projectId = projectId;

        const result = await api.createTask(taskParams);

        if (result.success !== false && !result.error) {
            const taskType = projectId ? 'project' : 'personal';
            showToast(`Task "${title}" created (${taskType})!`, 'success');
            hideModal('create-task-modal');

            // Call callback if provided
            const modal = document.getElementById('create-task-modal');
            if (modal?._onCreated) {
                modal._onCreated(result);
            }
        } else {
            showToast(result.error?.message || 'Failed to create task', 'error');
        }
    } catch (error) {
        console.error('[Modals] Create task error:', error);
        showToast('Error creating task: ' + error.message, 'error');
    }
}

// ============================================================================
// INSTANCE SELECTOR MODAL
// ============================================================================

/**
 * Show instance selector modal
 * @param {object} options - Options
 * @param {string} options.title - Modal title
 * @param {string[]} [options.excludeIds] - Instance IDs to exclude
 * @param {string} [options.filterRole] - Only show instances with this role
 * @param {Function} options.onSelect - Callback with selected instance
 */
export function showInstanceSelector(options) {
    const { title = 'Select Instance', excludeIds = [], filterRole, onSelect } = options;

    let modal = document.getElementById('instance-selector-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'instance-selector-modal';
        modal.className = 'modal';
        modal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h3 id="instance-selector-title">Select Instance</h3>
                    <button class="modal-close" onclick="window.hideModal('instance-selector-modal')">&times;</button>
                </div>
                <div class="modal-body">
                    <div class="instance-list" id="instance-selector-list"></div>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
    }

    modal.querySelector('#instance-selector-title').textContent = title;

    // Filter and render instances
    let instances = state.instances.filter(i => !excludeIds.includes(i.instanceId));
    if (filterRole) {
        instances = instances.filter(i => i.role === filterRole);
    }

    const list = modal.querySelector('#instance-selector-list');
    if (instances.length === 0) {
        list.innerHTML = '<div class="empty-placeholder">No instances available</div>';
    } else {
        list.innerHTML = instances.map(inst => `
            <div class="instance-select-item" data-instance-id="${inst.instanceId}">
                <div class="instance-avatar">${(inst.name || 'U').charAt(0).toUpperCase()}</div>
                <div class="instance-select-info">
                    <div class="instance-select-name">${escapeHtml(inst.name || 'Unknown')}</div>
                    <div class="instance-select-meta">${escapeHtml(inst.role || 'No role')} ${inst.status === 'active' ? '(Online)' : ''}</div>
                </div>
            </div>
        `).join('');

        // Add click handlers
        list.querySelectorAll('.instance-select-item').forEach(item => {
            item.addEventListener('click', () => {
                const instanceId = item.dataset.instanceId;
                const instance = instances.find(i => i.instanceId === instanceId);
                hideModal('instance-selector-modal');
                if (onSelect) onSelect(instance);
            });
        });
    }

    modal.classList.add('active');
}

// ============================================================================
// PROJECT SELECTOR MODAL
// ============================================================================

/**
 * Show project selector modal
 * @param {object} options - Options
 * @param {string} options.title - Modal title
 * @param {Function} options.onSelect - Callback with selected project
 */
export function showProjectSelector(options) {
    const { title = 'Select Project', onSelect } = options;

    let modal = document.getElementById('project-selector-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'project-selector-modal';
        modal.className = 'modal';
        modal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h3 id="project-selector-title">Select Project</h3>
                    <button class="modal-close" onclick="window.hideModal('project-selector-modal')">&times;</button>
                </div>
                <div class="modal-body">
                    <div class="project-list" id="project-selector-list"></div>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
    }

    modal.querySelector('#project-selector-title').textContent = title;

    const list = modal.querySelector('#project-selector-list');
    if (state.projects.length === 0) {
        list.innerHTML = '<div class="empty-placeholder">No projects available</div>';
    } else {
        list.innerHTML = state.projects.map(proj => `
            <div class="project-select-item" data-project-id="${proj.projectId || proj.id}">
                <div class="project-select-name">${escapeHtml(proj.name)}</div>
                <div class="project-select-meta">${escapeHtml(proj.status || 'active')}</div>
            </div>
        `).join('');

        list.querySelectorAll('.project-select-item').forEach(item => {
            item.addEventListener('click', () => {
                const projectId = item.dataset.projectId;
                const project = state.projects.find(p => (p.projectId || p.id) === projectId);
                hideModal('project-selector-modal');
                if (onSelect) onSelect(project);
            });
        });
    }

    modal.classList.add('active');
}

// ============================================================================
// EXPORTS
// ============================================================================

// Make functions available globally for inline handlers
window.showModal = showModal;
window.hideModal = hideModal;
window.hideAllModals = hideAllModals;

export default {
    showModal,
    hideModal,
    hideAllModals,
    showConfirm,
    showCreateTaskModal,
    handleCreateTask,
    showInstanceSelector,
    showProjectSelector
};
