/**
 * Tasks Module
 *
 * Handles task listing, creation, and management.
 * Task detail panel is provided by details.js for reuse.
 *
 * @module tasks
 */

import { state } from './state.js';
import { escapeHtml, showToast, formatDateTime, getPriorityClass, getStatusClass } from './utils.js';
import { showTaskDetail } from './details.js';
import { showCreateTaskModal, handleCreateTask } from './modals.js';
import api from './api.js';

// ============================================================================
// TASK LOADING
// ============================================================================

/**
 * Load tasks for the current user
 */
export async function loadTasks() {
    const container = document.getElementById('tasks-container');
    if (!container) return;

    container.innerHTML = '<div class="loading-placeholder">Loading tasks...</div>';

    try {
        const result = await api.getMyTasks(state.instanceId);
        state.tasks = result.tasks || [];

        renderTasksList();
    } catch (error) {
        console.error('[Tasks] Error loading tasks:', error);
        container.innerHTML = `<div class="error-placeholder">Error: ${escapeHtml(error.message)}</div>`;
    }
}

/**
 * Render tasks list
 */
export function renderTasksList() {
    const container = document.getElementById('tasks-container');
    if (!container) return;

    if (state.tasks.length === 0) {
        container.innerHTML = `
            <div class="empty-placeholder">
                No tasks yet
                <button class="btn btn-primary" onclick="window.showCreateTaskModal()">Create Task</button>
            </div>
        `;
        return;
    }

    // Group by project vs personal
    const personal = state.tasks.filter(t => !t.projectId);
    const project = state.tasks.filter(t => t.projectId);

    container.innerHTML = `
        ${personal.length > 0 ? `
            <div class="task-section">
                <h3>Personal Tasks</h3>
                ${renderTaskItems(personal)}
            </div>
        ` : ''}
        ${project.length > 0 ? `
            <div class="task-section">
                <h3>Project Tasks</h3>
                ${renderTaskItems(project)}
            </div>
        ` : ''}
    `;

    // Add click handlers
    container.querySelectorAll('.task-item').forEach(item => {
        item.addEventListener('click', () => {
            const taskId = item.dataset.taskId;
            showTaskDetail(taskId, true);
        });
    });
}

/**
 * Render task items HTML
 */
function renderTaskItems(tasks) {
    return tasks.map(task => `
        <div class="task-item" data-task-id="${escapeHtml(task.id || task.taskId)}">
            <span class="task-priority-dot ${getPriorityClass(task.priority)}"></span>
            <div class="task-content">
                <div class="task-title">${escapeHtml(task.title)}</div>
                ${task.projectId ? `<div class="task-project">${escapeHtml(task.projectId)}</div>` : ''}
            </div>
            <span class="task-status ${getStatusClass(task.status)}">${task.status || 'pending'}</span>
        </div>
    `).join('');
}

// ============================================================================
// TASK ACTIONS
// ============================================================================

/**
 * Complete a task
 * @param {string} taskId - Task ID to complete
 */
export async function completeTask(taskId) {
    try {
        await api.markTaskComplete(state.instanceId, taskId);
        showToast('Task completed!', 'success');
        loadTasks();
    } catch (error) {
        showToast('Failed to complete task: ' + error.message, 'error');
    }
}

/**
 * Update task status
 * @param {string} taskId - Task ID
 * @param {string} status - New status
 */
export async function updateTaskStatus(taskId, status) {
    try {
        await api.updateTask(state.instanceId, taskId, { status });
        showToast('Task updated!', 'success');
        loadTasks();
    } catch (error) {
        showToast('Failed to update task: ' + error.message, 'error');
    }
}

/**
 * Update task priority
 * @param {string} taskId - Task ID
 * @param {string} priority - New priority
 */
export async function updateTaskPriority(taskId, priority) {
    try {
        await api.updateTask(state.instanceId, taskId, { priority });
        showToast('Task updated!', 'success');
        loadTasks();
    } catch (error) {
        showToast('Failed to update task: ' + error.message, 'error');
    }
}

// ============================================================================
// EXPORTS
// ============================================================================

// Make functions available globally
window.showCreateTaskModal = showCreateTaskModal;

export default {
    loadTasks,
    renderTasksList,
    completeTask,
    updateTaskStatus,
    updateTaskPriority
};
