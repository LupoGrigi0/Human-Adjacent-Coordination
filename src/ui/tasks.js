/**
 * Tasks Module
 *
 * Handles task loading, task board rendering, and task detail views.
 * Source of truth: app.js implementation (board view with detail panel).
 *
 * @module tasks
 */

import { state } from './state.js';
import { escapeHtml, showToast } from './utils.js';
import api from './api.js';

// ============================================================================
// TASK LOADING
// ============================================================================

/**
 * Load tasks for the current user
 * Requires instanceId to be set
 */
export async function loadTasks() {
    if (!state.instanceId) {
        document.querySelectorAll('.task-list').forEach(list => {
            list.innerHTML = '<div class="loading-placeholder">Bootstrap to see tasks</div>';
        });
        return;
    }

    try {
        // Get all tasks for this instance (personal + project)
        let allTasks = [];
        const result = await api.getMyTasks(state.instanceId);
        if (result.personalTasks) {
            // Personal tasks may not have status field from API - default to 'pending'
            const personalWithStatus = result.personalTasks.map(task => ({
                ...task,
                status: task.status || 'pending',
                source: 'personal'
            }));
            allTasks = [...allTasks, ...personalWithStatus];
        }
        if (result.projectTasks) {
            // Project tasks have status from API
            const projectWithSource = result.projectTasks.map(task => ({
                ...task,
                source: 'project'
            }));
            allTasks = [...allTasks, ...projectWithSource];
        }

        renderTaskBoard(allTasks);
    } catch (error) {
        console.error('[Tasks] Error loading tasks:', error);
        document.querySelectorAll('.task-list').forEach(list => {
            list.innerHTML = '<div class="loading-placeholder">Error loading tasks</div>';
        });
    }
}

// ============================================================================
// TASK BOARD RENDERING
// ============================================================================

/**
 * Render the task board with columns for pending, in_progress, completed
 * @param {Array} tasks - Array of task objects
 */
export function renderTaskBoard(tasks) {
    // Store tasks for later lookup
    state.tasks = tasks;

    // Map V2 statuses to board columns:
    // - Pending column: 'pending', 'not_started', or no status
    // - In Progress column: 'in_progress', 'blocked'
    // - Completed column: 'completed', 'completed_verified', 'archived'
    const pending = tasks.filter(t => !t.status || t.status === 'pending' || t.status === 'not_started');
    const inProgress = tasks.filter(t => t.status === 'in_progress' || t.status === 'blocked');
    const completed = tasks.filter(t => t.status === 'completed' || t.status === 'completed_verified' || t.status === 'archived');

    document.getElementById('pending-count').textContent = pending.length;
    document.getElementById('progress-count').textContent = inProgress.length;
    document.getElementById('completed-count').textContent = completed.length;

    document.getElementById('pending-tasks').innerHTML = renderTaskList(pending);
    document.getElementById('progress-tasks').innerHTML = renderTaskList(inProgress);
    document.getElementById('completed-tasks').innerHTML = renderTaskList(completed);

    // Add click handlers to task items
    document.querySelectorAll('.task-item').forEach(item => {
        item.addEventListener('click', () => {
            const taskId = item.dataset.taskId;
            showTaskDetail(taskId);
        });
    });
}

/**
 * Render task items HTML
 * @param {Array} tasks - Array of task objects
 * @returns {string} HTML string
 */
function renderTaskList(tasks) {
    if (tasks.length === 0) {
        return '<div class="loading-placeholder">No tasks</div>';
    }

    return tasks.map(task => `
        <div class="task-item" data-task-id="${task.taskId || task.id}">
            <div class="task-title">${escapeHtml(task.title)}</div>
            <div class="task-meta">
                <span class="priority-badge priority-${task.priority}">${task.priority}</span>
                <span>${task.project || 'Personal'}</span>
            </div>
        </div>
    `).join('');
}

// ============================================================================
// TASK DETAIL VIEW
// ============================================================================

/**
 * Show task detail view, hiding the board
 * @param {string} taskId - The task ID to show
 * @param {string} [source='tasks'] - Where we came from: 'tasks' or 'project'
 */
export async function showTaskDetail(taskId, source = 'tasks') {
    // Track where we came from for back navigation
    state.taskDetailSource = source;

    // First try to find task in state
    let task = state.tasks.find(t => (t.taskId || t.id) === taskId);

    // If not found, fetch all tasks and find it
    if (!task) {
        try {
            const result = await api.getMyTasks(state.instanceId);
            // Normalize personal tasks with default status
            const personalTasks = (result.personalTasks || []).map(t => ({
                ...t,
                status: t.status || 'pending',
                source: 'personal'
            }));
            const projectTasks = (result.projectTasks || []).map(t => ({
                ...t,
                source: 'project'
            }));
            const allTasks = [...personalTasks, ...projectTasks];
            task = allTasks.find(t => (t.taskId || t.id) === taskId);
        } catch (e) {
            console.error('[Tasks] Error fetching task:', e);
            showToast('Could not load task details', 'error');
            return;
        }
    }

    if (!task) {
        showToast('Task not found', 'error');
        return;
    }

    console.log('[Tasks] Showing task detail:', taskId, task, 'source:', source);

    // If coming from project, switch to tasks tab first (task detail is in tasks tab)
    if (source === 'project') {
        // Switch to tasks tab without triggering loadTasks (we just want to show detail)
        document.querySelectorAll('.nav-item').forEach(item => {
            item.classList.toggle('active', item.dataset.tab === 'tasks');
        });
        document.querySelectorAll('.tab-content').forEach(content => {
            content.classList.toggle('active', content.id === 'tab-tasks');
        });
        state.currentTab = 'tasks';
    }

    // Hide board and header, show detail
    document.querySelector('.task-board').style.display = 'none';
    document.querySelector('.task-filters').style.display = 'none';
    document.querySelector('#tab-tasks .page-header').style.display = 'none';
    document.getElementById('task-detail-view').style.display = 'block';

    // Populate detail fields
    document.getElementById('task-detail-title').textContent = task.title;
    document.getElementById('task-detail-priority').textContent = task.priority || 'medium';
    document.getElementById('task-detail-priority').className = `priority-badge priority-${task.priority || 'medium'}`;
    document.getElementById('task-detail-status').textContent = task.status || 'pending';
    document.getElementById('task-detail-description').textContent = task.description || 'No description';
    document.getElementById('task-detail-project').textContent = task.project || task.project_id || 'Personal';
    document.getElementById('task-detail-assignee').textContent = task.assignee || task.claimed_by || 'Unassigned';

    // Format created date with creator if available
    // Check multiple field name variations for compatibility
    let createdText = '-';
    const createdDate = task.createdAt || task.created_at || task.dateCreated || task.timestamp || task.created;
    if (createdDate) {
        const date = new Date(createdDate).toLocaleString();
        const creator = task.created_by || task.creator || task.createdBy || task.author || null;
        createdText = creator ? `${date} by ${creator}` : date;
    } else {
        // Debug: Log available task fields to help identify correct field names
        console.log('[Tasks] Task has no created date. Available fields:', Object.keys(task));
    }
    document.getElementById('task-detail-created').textContent = createdText;

    // Store current task for actions
    state.currentTaskDetail = taskId;

    // Update button states based on task status
    const claimBtn = document.getElementById('task-claim-btn');
    const completeBtn = document.getElementById('task-complete-btn');

    if (task.status === 'completed') {
        claimBtn.style.display = 'none';
        completeBtn.textContent = 'Completed';
        completeBtn.disabled = true;
    } else if (task.assignee || task.claimed_by) {
        claimBtn.textContent = 'Reassign';
        claimBtn.style.display = 'inline-flex';
        completeBtn.textContent = 'Mark Complete';
        completeBtn.disabled = false;
    } else {
        claimBtn.textContent = 'Claim Task';
        claimBtn.style.display = 'inline-flex';
        completeBtn.textContent = 'Mark Complete';
        completeBtn.disabled = false;
    }

    // Update breadcrumb text based on source
    const backText = document.getElementById('task-back-text');
    if (backText) {
        if (source === 'project' && state.currentProjectDetail) {
            const project = state.projects.find(p => (p.projectId || p.id) === state.currentProjectDetail);
            backText.textContent = `Back to ${project?.name || 'Project'}`;
        } else {
            backText.textContent = 'Back to Tasks';
        }
    }
}

/**
 * Hide task detail, return to where we came from
 */
export async function hideTaskDetail() {
    document.getElementById('task-detail-view').style.display = 'none';

    // Check where we came from
    if (state.taskDetailSource === 'project' && state.currentProjectDetail) {
        // Save project ID before switchTab clears it
        const projectId = state.currentProjectDetail;

        // Ensure projects are in state (fetch from API if needed)
        if (!state.projects || state.projects.length === 0) {
            try {
                const projectsResult = await api.listProjects();
                if (projectsResult.projects) {
                    state.projects = projectsResult.projects;
                }
            } catch (e) {
                console.error('[Tasks] Error loading projects:', e);
            }
        }

        // Switch to projects tab (this hides all detail views)
        // Need to call switchTab which is in app.js - use window global
        if (typeof window.switchTab === 'function') {
            window.switchTab('projects');
        }

        // Small delay to let tab switch complete, then show project detail
        if (typeof window.showProjectDetail === 'function') {
            setTimeout(() => window.showProjectDetail(projectId), 50);
        }
    } else {
        // Return to task board (default)
        document.querySelector('.task-board').style.display = 'grid';
        document.querySelector('.task-filters').style.display = 'flex';
        document.querySelector('#tab-tasks .page-header').style.display = 'flex';
    }

    state.currentTaskDetail = null;
    state.taskDetailSource = null;
}

// ============================================================================
// TASK ACTIONS
// ============================================================================

/**
 * Claim the currently displayed task (assign to self)
 */
export async function claimCurrentTask() {
    if (!state.currentTaskDetail || !state.instanceId) return;

    try {
        // Get the task's project ID if available
        const task = state.tasks.find(t => (t.id || t.taskId) === state.currentTaskDetail);
        const projectId = task?.projectId || task?.project_id || null;

        // Use assign_task_to_instance API to claim (assign to self)
        await api.assignTaskToInstance({
            instanceId: state.instanceId,
            taskId: state.currentTaskDetail,
            assigneeInstanceId: state.instanceId,
            projectId: projectId
        });
        showToast('Task claimed!', 'success');

        // Update the assignee display immediately
        document.getElementById('task-detail-assignee').textContent = state.instanceId;

        // Update button states
        const claimBtn = document.getElementById('task-claim-btn');
        claimBtn.textContent = 'Reassign';

        // Also refresh task board in background
        loadTasks();
    } catch (e) {
        console.error('[Tasks] Error claiming task:', e);
        showToast('Could not claim task: ' + e.message, 'error');
    }
}

/**
 * Mark the currently displayed task as complete
 */
export async function completeCurrentTask() {
    if (!state.currentTaskDetail) return;

    try {
        await api.completePersonalTask(state.instanceId, state.currentTaskDetail);
        showToast('Task completed!', 'success');
        hideTaskDetail();
        loadTasks(); // Refresh the task board
    } catch (e) {
        console.error('[Tasks] Error completing task:', e);
        showToast('Could not complete task: ' + e.message, 'error');
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
// WINDOW GLOBALS
// ============================================================================

// Make functions available globally for onclick handlers and cross-module calls
window.showTaskDetail = showTaskDetail;
window.hideTaskDetail = hideTaskDetail;
window.claimCurrentTask = claimCurrentTask;
window.completeCurrentTask = completeCurrentTask;

// ============================================================================
// EXPORTS
// ============================================================================

export default {
    loadTasks,
    renderTaskBoard,
    showTaskDetail,
    hideTaskDetail,
    claimCurrentTask,
    completeCurrentTask,
    updateTaskStatus,
    updateTaskPriority
};
