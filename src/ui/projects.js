/**
 * Projects Module
 *
 * Handles project listing and project detail panel.
 * The project detail panel is the main view for managing a project.
 *
 * @module projects
 */

import { state, pushBreadcrumb, clearBreadcrumbs } from './state.js';
import { escapeHtml, showToast, formatDateTime, getAvatarChar } from './utils.js';
import { showTaskDetail, showInstanceDetail } from './details.js';
import { showCreateTaskModal, showInstanceSelector } from './modals.js';
import { loadProjectDocuments, renderDocumentsList } from './documents.js';
import api from './api.js';

// ============================================================================
// PROJECT LIST
// ============================================================================

/**
 * Load and display all projects
 */
export async function loadProjects() {
    const grid = document.getElementById('project-grid');
    if (!grid) return;

    grid.innerHTML = '<div class="loading-placeholder">Loading projects...</div>';

    try {
        const result = await api.listProjects();
        state.projects = result.projects || [];

        renderProjectsGrid();
    } catch (error) {
        console.error('[Projects] Error loading projects:', error);
        grid.innerHTML = `<div class="error-placeholder">Error: ${escapeHtml(error.message)}</div>`;
    }
}

/**
 * Render the projects grid
 */
export function renderProjectsGrid() {
    const grid = document.getElementById('project-grid');
    if (!grid) return;

    if (state.projects.length === 0) {
        grid.innerHTML = '<div class="empty-placeholder">No projects found</div>';
        return;
    }

    grid.innerHTML = state.projects.map(project => `
        <div class="project-card" data-project-id="${project.projectId || project.id}">
            <span class="project-status status-${project.status}">${project.status}</span>
            <div class="project-name">${escapeHtml(project.name)}</div>
            <div class="project-description">${escapeHtml(project.description || 'No description')}</div>
        </div>
    `).join('');

    // Add click handlers
    grid.querySelectorAll('.project-card').forEach(card => {
        card.addEventListener('click', () => {
            const projectId = card.dataset.projectId;
            showProjectDetail(projectId);
        });
    });
}

// ============================================================================
// PROJECT DETAIL PANEL
// ============================================================================

/**
 * Show project detail panel
 * @param {string} projectId - Project ID to show
 */
export async function showProjectDetail(projectId) {
    console.log('[Projects] Showing project detail:', projectId);

    // Hide grid and header, show detail (using flex for the new layout)
    document.getElementById('project-grid').style.display = 'none';
    document.querySelector('#tab-projects .page-header').style.display = 'none';
    document.getElementById('project-detail-view').style.display = 'flex';

    // Store current project for actions
    state.currentProjectDetail = projectId;
    clearBreadcrumbs();

    // Fetch full project details from API
    let project;
    try {
        const result = await api.getProject(projectId);
        project = result.project || result;
        state.currentProject = project;
    } catch (e) {
        console.error('[Projects] Error loading project details:', e);
        project = state.projects.find(p => (p.projectId || p.id) === projectId);
        if (!project) {
            showToast('Project not found', 'error');
            hideProjectDetail();
            return;
        }
    }

    // Populate header
    document.getElementById('project-detail-name').textContent = project.name;
    document.getElementById('project-detail-status').textContent = project.status;
    document.getElementById('project-detail-status').className = `project-status status-${project.status}`;

    // Populate PM section
    renderProjectPM(project);

    // Populate team section
    renderProjectTeam(project);

    // Populate description
    document.getElementById('project-detail-description').textContent = project.description || 'No description';

    // Populate documents
    renderProjectDocuments(project);

    // Load and render project tasks (request up to 100, API defaults to 5)
    try {
        const result = await api.listTasks(state.instanceId, { projectId, limit: 100 });
        const tasks = result.tasks || result || [];
        renderProjectDetailTasks(tasks);
        document.getElementById('primary-task-count').textContent = tasks.length;
    } catch (e) {
        console.error('[Projects] Error loading project tasks:', e);
        document.getElementById('project-detail-tasks').innerHTML = '<p class="empty-placeholder">Could not load tasks</p>';
        document.getElementById('primary-task-count').textContent = '0';
    }

    // Populate repository
    const repoEl = document.getElementById('project-detail-repo');
    const repoUrl = project.ghRepo || project.repo;
    if (repoUrl) {
        repoEl.innerHTML = `<a href="${escapeHtml(repoUrl)}" target="_blank" class="repo-link">${escapeHtml(repoUrl)}</a>`;
    } else {
        repoEl.textContent = 'Not configured';
    }

    // Initialize chat sidebar
    initProjectChatSidebar(project);

    // Set up collapsible task list headers
    setupTaskListCollapse();
}

/**
 * Hide project detail and return to grid
 */
export function hideProjectDetail() {
    document.getElementById('project-detail-view').style.display = 'none';
    document.getElementById('project-grid').style.display = 'grid';
    document.querySelector('#tab-projects .page-header').style.display = 'flex';
    state.currentProjectDetail = null;
    state.currentProject = null;
    state.currentProjectPM = null;
    state.pmChatTurns = 0;
}

// ============================================================================
// PROJECT DETAIL COMPONENTS
// ============================================================================

/**
 * Render the PM section with prominent card
 */
function renderProjectPM(project) {
    const pmCard = document.getElementById('project-pm-card');
    const pmId = project.pm;

    if (pmId) {
        const pmInstance = state.instances.find(i => i.instanceId === pmId || i.name === pmId);
        const pmName = pmInstance?.name || pmId.split('-')[0] || pmId;
        const pmStatus = pmInstance?.status || 'unknown';

        state.currentProjectPM = pmId;

        pmCard.classList.remove('no-pm');
        document.getElementById('pm-avatar').textContent = pmName.charAt(0).toUpperCase();
        document.getElementById('pm-name').textContent = pmName;
        document.getElementById('pm-id').textContent = pmId;
        document.getElementById('pm-status').textContent = pmStatus === 'active' ? 'Online' : 'Offline';

        document.getElementById('pm-continue-btn').style.display = pmStatus === 'active' ? 'inline-flex' : 'none';
        document.getElementById('pm-message-btn').style.display = 'inline-flex';
    } else {
        state.currentProjectPM = null;
        pmCard.classList.add('no-pm');
        document.getElementById('pm-avatar').textContent = '?';
        document.getElementById('pm-name').textContent = 'No PM Assigned';
        document.getElementById('pm-id').textContent = '-';
        document.getElementById('pm-status').textContent = '-';
        document.getElementById('pm-continue-btn').style.display = 'none';
        document.getElementById('pm-message-btn').style.display = 'none';
    }
}

/**
 * Render team members grid
 */
function renderProjectTeam(project) {
    const teamGrid = document.getElementById('project-team-grid');
    const team = project.team || [];

    if (team.length === 0) {
        teamGrid.innerHTML = '<div class="empty-placeholder">No team members</div>';
        return;
    }

    teamGrid.innerHTML = team.map(memberId => {
        const member = state.instances.find(i => i.instanceId === memberId || i.name === memberId);
        const name = member?.name || memberId.split('-')[0] || memberId;
        const isOnline = member?.status === 'active';

        return `
            <div class="team-member-card" data-instance-id="${escapeHtml(memberId)}">
                <div class="team-avatar">${getAvatarChar(name)}</div>
                <span class="team-name">${escapeHtml(name)}</span>
                <span class="team-status-dot ${isOnline ? 'online' : 'offline'}"></span>
            </div>
        `;
    }).join('');

    // Add click handlers to open instance detail
    teamGrid.querySelectorAll('.team-member-card').forEach(card => {
        card.addEventListener('click', () => {
            const instanceId = card.dataset.instanceId;
            showInstanceDetail(instanceId, true, { from: 'project', projectId: state.currentProjectDetail });
        });
    });
}

/**
 * Render project documents
 */
async function renderProjectDocuments(project) {
    const docsContainer = document.getElementById('project-detail-documents');
    const projectId = project.projectId || project.id;

    docsContainer.innerHTML = '<div class="loading-placeholder">Loading...</div>';

    const documents = await loadProjectDocuments(projectId);
    renderDocumentsList('project-detail-documents', projectId, documents);
}

/**
 * Render project tasks in collapsible lists
 */
function renderProjectDetailTasks(tasks) {
    const container = document.getElementById('project-detail-tasks');

    if (!tasks || tasks.length === 0) {
        container.innerHTML = '<p class="empty-placeholder">No tasks yet</p>';
        return;
    }

    // Group tasks by list
    const tasksByList = {};
    tasks.forEach(task => {
        const listName = task.list || 'default';
        if (!tasksByList[listName]) tasksByList[listName] = [];
        tasksByList[listName].push(task);
    });

    // Render each list as collapsible
    const listNames = Object.keys(tasksByList);
    container.innerHTML = listNames.map((listName, idx) => {
        const listTasks = tasksByList[listName];
        const isExpanded = idx === 0;

        return `
            <div class="task-list-card ${isExpanded ? 'expanded' : ''}" data-list="${escapeHtml(listName)}">
                <div class="task-list-header">
                    <span class="collapse-icon">\u25BC</span>
                    <span class="list-name">${escapeHtml(listName === 'default' ? 'Tasks' : listName)}</span>
                    <span class="task-count">${listTasks.length}</span>
                </div>
                <div class="task-list-content">
                    ${listTasks.map(task => `
                        <div class="detail-task-item" data-task-id="${escapeHtml(task.id || task.taskId)}">
                            <span class="task-priority-dot priority-${task.priority || 'medium'}"></span>
                            <span class="detail-task-title">${escapeHtml(task.title)}</span>
                            <span class="detail-task-status">${task.status || 'pending'}</span>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    }).join('');

    // Add click handlers for tasks
    container.querySelectorAll('.detail-task-item').forEach(item => {
        item.addEventListener('click', () => {
            const taskId = item.dataset.taskId;
            showTaskDetail(taskId, true, { from: 'project', projectId: state.currentProjectDetail });
        });
    });
}

/**
 * Setup collapsible task list headers
 */
function setupTaskListCollapse() {
    document.querySelectorAll('.task-list-header').forEach(header => {
        header.addEventListener('click', () => {
            const card = header.closest('.task-list-card');
            card.classList.toggle('expanded');
        });
    });
}

// ============================================================================
// PROJECT CHAT SIDEBAR
// ============================================================================

/**
 * Initialize project chat sidebar
 */
function initProjectChatSidebar(project) {
    // Set room name
    const roomNameEl = document.getElementById('project-room-name');
    if (roomNameEl) {
        roomNameEl.textContent = `${project.name} Room`;
    }

    // Set PM name
    const pmNameEl = document.getElementById('pm-chat-name');
    if (pmNameEl) {
        if (state.currentProjectPM) {
            const pmInstance = state.instances.find(i => i.instanceId === state.currentProjectPM);
            pmNameEl.textContent = pmInstance?.name || state.currentProjectPM.split('-')[0];
        } else {
            pmNameEl.textContent = 'No PM';
        }
    }

    // Load team room messages
    loadProjectTeamMessages(project);

    // Setup tab switching
    document.querySelectorAll('.chat-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.chat-tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.chat-tab-content').forEach(c => c.classList.remove('active'));

            tab.classList.add('active');
            const tabId = tab.dataset.tab;
            document.getElementById(`${tabId}-content`)?.classList.add('active');
        });
    });

    // Setup chat input handlers
    setupProjectChatInputs(project);
}

/**
 * Load team room messages
 */
async function loadProjectTeamMessages(project) {
    const messagesContainer = document.getElementById('team-room-messages');
    if (!messagesContainer) return;

    messagesContainer.innerHTML = '<div class="loading-placeholder">Loading messages...</div>';

    try {
        const projectId = project.projectId || project.id;
        const result = await api.getMessages(state.instanceId, { room: `project:${projectId}`, limit: 20 });
        const messages = result.messages || [];

        if (messages.length === 0) {
            messagesContainer.innerHTML = '<div class="empty-state-mini">No messages yet</div>';
            return;
        }

        messagesContainer.innerHTML = messages.map(msg => {
            const isMe = msg.from === state.instanceId || msg.from?.includes(state.name);
            return `
                <div class="message-mini ${isMe ? 'sent' : 'received'}">
                    ${!isMe ? `<div class="message-mini-sender">${escapeHtml(msg.from?.split('-')[0] || 'Unknown')}</div>` : ''}
                    <div class="message-mini-body">${escapeHtml(msg.subject || msg.body || '')}</div>
                    <div class="message-mini-time">${formatDateTime(msg.timestamp)}</div>
                </div>
            `;
        }).join('');

        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    } catch (error) {
        console.error('[Projects] Error loading team messages:', error);
        messagesContainer.innerHTML = '<div class="error-placeholder">Could not load messages</div>';
    }
}

/**
 * Setup chat input handlers
 */
function setupProjectChatInputs(project) {
    // Team room send
    const teamSendBtn = document.getElementById('team-send-btn');
    const teamInput = document.getElementById('team-message-input');

    if (teamSendBtn && teamInput) {
        teamSendBtn.addEventListener('click', async () => {
            const message = teamInput.value.trim();
            if (!message) return;

            try {
                const projectId = project.projectId || project.id;
                await api.sendMessage({
                    instanceId: state.instanceId,
                    to: `project:${projectId}`,
                    body: message
                });

                teamInput.value = '';
                loadProjectTeamMessages(project);
            } catch (error) {
                showToast('Failed to send message', 'error');
            }
        });
    }

    // PM chat send - TODO: implement continue_conversation
}

// ============================================================================
// ASSIGN INSTANCE TO PROJECT
// ============================================================================

/**
 * Show modal to assign instance to current project
 */
export function showAssignInstanceModal() {
    if (!state.currentProjectDetail) return;

    const project = state.projects.find(p => (p.projectId || p.id) === state.currentProjectDetail);
    const currentTeam = project?.team || [];

    showInstanceSelector({
        title: 'Add Team Member',
        excludeIds: currentTeam,
        onSelect: async (instance) => {
            try {
                await api.joinProject(instance.instanceId, state.currentProjectDetail);
                showToast(`${instance.name} added to project!`, 'success');
                await showProjectDetail(state.currentProjectDetail);
            } catch (error) {
                showToast('Could not assign instance: ' + error.message, 'error');
            }
        }
    });
}

// ============================================================================
// EXPORTS
// ============================================================================

// Make showProjectDetail available globally for navigation
window.showProjectDetail = showProjectDetail;

export default {
    loadProjects,
    renderProjectsGrid,
    showProjectDetail,
    hideProjectDetail,
    showAssignInstanceModal
};
