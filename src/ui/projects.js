/**
 * Projects Module - v2 with all 24 feedback items
 *
 * @module projects
 */

import { state } from './state.js';
import { escapeHtml, showToast } from './utils.js';
import api from './api.js';
import * as uiConfig from './ui-config.js';
import {
    STATUSES, PRIORITIES, PRIORITY_COLORS, STATUS_LABELS, STATUS_ICONS,
    PRIORITY_ORDER, STATUS_ORDER,
    showDropdown, renderTaskListHTML, renderTaskRowHTML, renderTaskExpandedHTML,
    sortTasksInPlace, findTaskById,
    renderGoalsSectionHTML, GOAL_STATUS_LABELS, GOAL_STATUS_COLORS, GOAL_STATUS_ICONS
} from './shared-tasks.js';

// Module-level state
let expandedLists = new Set();
let expandedTaskId = null;
let expandedSections = new Set(['tasks']);
let projectTasks = {};
let projectDocuments = [];
let projectGoals = [];
let projectVision = null;
let onlineInstances = new Set();
let chatPollInterval = null;
let showCompletedLists = new Set(); // which lists show completed tasks
let vitalDocuments = new Set(); // vital doc names

// Constants, showDropdown, and task rendering imported from shared-tasks.js
const PROJECT_STATUSES = ['active', 'paused', 'archived'];

function closeAllDropdowns() {
    document.querySelectorAll('.pd-dropdown, .priority-popover').forEach(el => el.remove());
}

// ============================================================================
// PROJECT LIST
// ============================================================================

export function loadProjects() {
    const grid = document.getElementById('project-grid');
    if (state.projects.length === 0) {
        grid.innerHTML = '<div class="loading-placeholder">No projects found</div>';
        return;
    }
    grid.innerHTML = state.projects.map(project => {
        const pid = project.projectId || project.id;
        const pmName = project.pm ? (project.pm.split('-')[0] || 'PM') : 'No PM';
        const teamCount = (project.team || []).length;
        const hasPmStatus = !!project.pmStatus;
        return `
        <div class="project-card" data-project-id="${pid}">
            <div class="project-card-top">
                <span class="project-status status-${project.status}">${project.status}</span>
                ${project.priority ? `<span class="project-card-priority" style="color:${PRIORITY_COLORS[project.priority] || '#3b82f6'}">${project.priority}</span>` : ''}
                ${hasPmStatus ? `<span class="project-card-pm-status" title="${escapeHtml(project.pmStatus)}">&#9432;</span>` : ''}
            </div>
            <div class="project-name">${escapeHtml(project.name)}</div>
            <div class="project-description">${escapeHtml(project.description || 'No description')}</div>
            <div class="project-card-footer">
                <span class="project-card-pm">PM: ${escapeHtml(pmName)}</span>
                <span class="project-card-team">${teamCount} members</span>
            </div>
        </div>`;
    }).join('');
    grid.querySelectorAll('.project-card').forEach(card => {
        card.addEventListener('click', () => showProjectDetail(card.dataset.projectId));
    });
}

// ============================================================================
// PROJECT DETAIL PANEL
// ============================================================================

export async function showProjectDetail(projectId) {
    state.currentProjectDetail = projectId;
    expandedLists = new Set(['default']);
    expandedTaskId = null;
    expandedSections = new Set(['tasks']);
    projectTasks = {};
    projectDocuments = [];
    projectGoals = [];
    projectVision = null;
    showCompletedLists = new Set();
    vitalDocuments = new Set();

    document.getElementById('project-grid').style.display = 'none';
    const pageHeader = document.querySelector('#tab-projects .page-header');
    if (pageHeader) pageHeader.style.display = 'none';

    let detailView = document.getElementById('project-detail-view');
    if (!detailView) {
        detailView = document.createElement('div');
        detailView.id = 'project-detail-view';
        document.getElementById('project-grid').parentElement.appendChild(detailView);
    }
    detailView.style.display = 'flex';
    detailView.className = 'project-detail-panel';
    detailView.innerHTML = '<div class="loading-placeholder">Loading project...</div>';

    let project;
    try {
        const result = await api.getProject(projectId);
        project = result.project || result;
        state.currentProject = project;
    } catch (e) {
        project = state.projects.find(p => (p.projectId || p.id) === projectId);
        if (!project) { showToast('Project not found', 'error'); hideProjectDetail(); return; }
    }

    const pmId = project.pm;
    let pmInstance = null;
    if (pmId) {
        pmInstance = state.instances.find(i => i.instanceId === pmId || i.name === pmId);
        state.currentProjectPM = { instanceId: pmId, name: pmInstance?.name || pmId.split('-')[0], status: pmInstance?.status || 'unknown' };
    } else {
        state.currentProjectPM = null;
    }

    // Fetch presence, tasks, documents, vision, vital docs in parallel
    const [presenceResult, tasksResult, docsResult, visionResult, vitalResult, goalsResult] = await Promise.allSettled([
        api.getPresence(),
        api.listTasks(state.instanceId, { projectId, limit: 200, full_detail: true }),
        api.listDocuments(state.instanceId, `project:${projectId}`),
        api.readDocument(state.instanceId, 'PROJECT_VISION.md', `project:${projectId}`),
        api.listVitalDocuments(state.instanceId, `project:${projectId}`),
        api.listProjectGoals(state.instanceId, projectId)
    ]);

    if (presenceResult.status === 'fulfilled') {
        const users = presenceResult.value.users || presenceResult.value.onlineUsers || [];
        onlineInstances = new Set(users.map(u => typeof u === 'string' ? u : u.instanceId || u.jid?.split('@')[0]));
    }

    let allTasks = [];
    if (tasksResult.status === 'fulfilled') allTasks = tasksResult.value.tasks || [];

    projectTasks = {};
    allTasks.forEach(t => {
        const lid = t.listId || t.list || 'default';
        if (!projectTasks[lid]) projectTasks[lid] = [];
        projectTasks[lid].push(t);
    });

    if (docsResult.status === 'fulfilled') projectDocuments = docsResult.value.documents || [];
    if (visionResult.status === 'fulfilled') projectVision = visionResult.value.content || visionResult.value.document || null;
    if (vitalResult.status === 'fulfilled') {
        const vDocs = vitalResult.value.documents || vitalResult.value.vitalDocuments || [];
        vitalDocuments = new Set(vDocs.map(d => typeof d === 'string' ? d : d.name));
    }

    // Fetch full goal criteria
    projectGoals = [];
    if (goalsResult.status === 'fulfilled') {
        const summaries = goalsResult.value.goals || [];
        projectGoals = await Promise.all(
            summaries.map(g => api.getGoal(state.instanceId, g.id, projectId).then(r => r.goal).catch(() => g))
        );
    }

    renderProjectDetail(project, allTasks);
}

function renderProjectDetail(project, allTasks) {
    const detailView = document.getElementById('project-detail-view');
    const projectId = project.projectId || project.id;
    const team = project.team || [];
    const pmName = state.currentProjectPM?.name || 'No PM';
    const pmOnline = state.currentProjectPM && onlineInstances.has(state.currentProjectPM.instanceId);
    const completedCount = allTasks.filter(t => ['completed', 'completed_verified', 'archived'].includes(t.status)).length;
    const totalCount = allTasks.length;
    const listIds = Object.keys(projectTasks);
    if (!listIds.includes('default')) listIds.unshift('default');

    detailView.innerHTML = `
    <div class="project-detail-header">
        <div class="project-detail-header-top">
            <button class="back-btn" onclick="window._pdHideDetail()">&larr; Projects</button>
            <div class="project-detail-header-title">
                <h2 class="pd-project-name" onclick="window._pdRenameProject(this)" title="Click to rename">${escapeHtml(project.name)}</h2>
                <span class="status-badge status-${project.status}" onclick="window._pdProjectStatusDropdown(event)" title="Click to change status">${project.status}</span>
                <span class="status-badge" style="background:rgba(${(project.priority === 'high' || project.priority === 'critical' || project.priority === 'emergency') ? '239,68,68' : project.priority === 'low' || project.priority === 'whenever' ? '107,114,128' : '59,130,246'},0.15);color:${PRIORITY_COLORS[project.priority] || '#3b82f6'}" onclick="window._pdProjectPriorityDropdown(event)" title="Click to set priority">${project.priority || 'priority'}</span>
            </div>
            <button class="pd-settings-btn" onclick="window._pdShowSettings()" title="Project settings">&#9881;</button>
        </div>
        <div class="project-detail-header-meta">
            <span class="project-detail-pm" onclick="window._pdPMDropdown(event)" title="Click to assign PM" style="cursor:pointer">
                <span class="online-dot ${pmOnline ? 'online' : ''}"></span> PM: ${escapeHtml(pmName)}
            </span>
            <span class="project-detail-team-count" onclick="window._pdAddTeamMember(event)" style="cursor:pointer" title="Click to add members">${team.length} members</span>
            <span class="project-detail-progress">${completedCount}/${totalCount} done</span>
        </div>
        ${project.description ? `<div class="project-detail-description">${escapeHtml(project.description)}</div>` : ''}
        ${project.pmStatus ? `<div class="pm-status-banner" onclick="window._pdEditPmStatus()" title="Click to edit PM status"><span class="pm-status-icon">&#9432;</span> ${escapeHtml(project.pmStatus)}</div>` : `<div class="pm-status-banner pm-status-empty" onclick="window._pdEditPmStatus()" title="Click to set PM status message"><span class="pm-status-icon">&#9432;</span> <em>No PM status</em></div>`}
    </div>
    <div class="project-detail-body">
        <div class="project-detail-main">
            ${renderVisionSection()}
            ${renderProjectGoalsSection(projectId)}
            ${renderTasksSection(listIds, projectId)}
        </div>
        <div class="project-detail-sidebar">
            ${renderTeamSection(project)}
            ${renderDocumentsSection(projectId)}
            ${renderChatSection(project)}
        </div>
    </div>`;

    detailView.addEventListener('click', handleDetailClick);
    detailView.addEventListener('keydown', handleDetailKeydown);
    bindProjectGoalInputs();
}

// ============================================================================
// SECTION RENDERERS
// ============================================================================

function renderVisionSection() {
    if (!projectVision) return '';
    const lines = projectVision.split('\n').slice(0, 5).join('\n');
    const isExpanded = expandedSections.has('vision');
    return `
    <div class="section-collapse" data-section="vision">
        <div class="section-collapse-header" onclick="window._pdToggleSection('vision')">
            <span class="chevron ${isExpanded ? 'expanded' : ''}">&rsaquo;</span> Vision
        </div>
        <div class="section-collapse-body" style="display:${isExpanded ? 'block' : 'none'}">
            <pre class="vision-preview">${escapeHtml(isExpanded ? projectVision : lines)}</pre>
        </div>
    </div>`;
}

function renderProjectGoalsSection(projectId) {
    const isExpanded = expandedSections.has('goals') || projectGoals.length > 0;
    const goalsHTML = renderGoalsSectionHTML(projectGoals, {
        prefix: '_pd', showCreate: true, showStatus: true,
        expanded: projectGoals.length <= 5, projectId
    });
    return `
    <div class="section-collapse" data-section="goals">
        <div class="section-collapse-header" onclick="window._pdToggleSection('goals')">
            <span class="chevron ${isExpanded ? 'expanded' : ''}">&rsaquo;</span> Goals (${projectGoals.length})
        </div>
        <div class="section-collapse-body" style="display:${isExpanded ? 'block' : 'none'}">
            ${goalsHTML}
        </div>
    </div>`;
}

function renderTasksSection(listIds, projectId) {
    const isExpanded = expandedSections.has('tasks');
    return `
    <div class="section-collapse" data-section="tasks">
        <div class="section-collapse-header" onclick="window._pdToggleSection('tasks')">
            <span class="chevron ${isExpanded ? 'expanded' : ''}">&rsaquo;</span> Tasks
            <span class="section-header-actions">
                <button class="section-add-btn" onclick="event.stopPropagation(); window._pdCreateList('${projectId}')" title="New task list">+</button>
            </span>
        </div>
        <div class="section-collapse-body" style="display:${isExpanded ? 'block' : 'none'}">
            ${listIds.map(lid => renderTaskList(lid, projectTasks[lid] || [], projectId)).join('')}
        </div>
    </div>`;
}

function renderTaskList(listId, tasks, projectId) {
    return renderTaskListHTML(listId, tasks, {
        prefix: '_pd',
        expanded: expandedLists.has(listId),
        showCompleted: showCompletedLists.has(listId),
        sortField: taskSortField,
        sortReverse: taskSortReverse,
        expandedTaskId,
        columns: ['priority', 'title', 'status', 'assignee', 'created', 'updated'],
        teamMembers: state.currentProject?.team || [],
        inputClass: 'task-create-input',
        projectId,
        callerId: state.instanceId,
    });
}

function renderTeamSection(project) {
    const team = project.team || [];
    const isExpanded = expandedSections.has('team');
    const pmId = project.pm;
    const sorted = [...team].sort((a, b) => {
        const aid = typeof a === 'string' ? a : a.instanceId || a.id;
        const bid = typeof b === 'string' ? b : b.instanceId || b.id;
        if (aid === pmId) return -1;
        if (bid === pmId) return 1;
        return 0;
    });

    return `
    <div class="section-collapse" data-section="team">
        <div class="section-collapse-header" onclick="window._pdToggleSection('team')">
            <span class="chevron ${isExpanded ? 'expanded' : ''}">&rsaquo;</span> Team (${team.length})
            <span class="section-header-actions">
                <button class="section-add-btn" onclick="event.stopPropagation(); window._pdAddTeamMember(event)" title="Add team member">+</button>
            </span>
        </div>
        <div class="section-collapse-body" style="display:${isExpanded ? 'block' : 'none'}">
            <div class="team-grid">
                ${sorted.map(m => {
                    const mid = typeof m === 'string' ? m : m.instanceId || m.id;
                    const mname = typeof m === 'string' ? m.split('-')[0] : m.name || mid.split('-')[0];
                    const mrole = typeof m === 'object' ? m.role : null;
                    const isOnline = onlineInstances.has(mid);
                    const isPM = mid === pmId;
                    return `
                    <div class="team-card-compact" data-instance-id="${escapeHtml(mid)}" onclick="window._pdShowInstance('${escapeHtml(mid)}')">
                        <span class="team-card-avatar">${escapeHtml(mname.charAt(0).toUpperCase())}</span>
                        <span class="team-card-name">${isPM ? '<span class="pm-crown" title="Project Manager">&#9819;</span> ' : ''}${escapeHtml(mname)}</span>
                        ${mrole ? `<span class="role-badge">${escapeHtml(mrole)}</span>` : ''}
                        <span class="online-dot ${isOnline ? 'online' : ''}"></span>
                    </div>`;
                }).join('')}
            </div>
        </div>
    </div>`;
}

function renderDocumentsSection(projectId) {
    const isExpanded = expandedSections.has('documents');
    return `
    <div class="section-collapse" data-section="documents">
        <div class="section-collapse-header" onclick="window._pdToggleSection('documents')">
            <span class="chevron ${isExpanded ? 'expanded' : ''}">&rsaquo;</span> Documents (${projectDocuments.length})
            <span class="section-header-actions">
                <button class="section-add-btn" onclick="event.stopPropagation(); window._pdCreateDocument('${projectId}')" title="Add document">+</button>
            </span>
        </div>
        <div class="section-collapse-body" style="display:${isExpanded ? 'block' : 'none'}">
            ${projectDocuments.length > 0 ? projectDocuments.map(doc => {
                const docName = typeof doc === 'string' ? doc : doc.name;
                const isVital = vitalDocuments.has(docName);
                return `
                <div class="document-item" data-doc="${escapeHtml(docName)}">
                    <span class="vital-star-toggle ${isVital ? 'vital' : ''}" onclick="event.stopPropagation(); window._pdToggleVital('${escapeHtml(docName)}')" title="${isVital ? 'Remove from vital' : 'Mark as vital'}">${isVital ? '\u2605' : '\u2606'}</span>
                    <span class="document-name" onclick="window._pdViewDocument('${escapeHtml(docName)}')">${escapeHtml(docName)}</span>
                </div>`;
            }).join('') : '<p class="empty-placeholder">No documents</p>'}
        </div>
    </div>`;
}

function renderChatSection(project) {
    const isExpanded = expandedSections.has('chat');
    return `
    <div class="section-collapse" data-section="chat">
        <div class="section-collapse-header" onclick="window._pdToggleSection('chat')">
            <span class="chevron ${isExpanded ? 'expanded' : ''}">&rsaquo;</span> Chat
        </div>
        <div class="section-collapse-body" style="display:${isExpanded ? 'block' : 'none'}">
            <div class="chat-messages" id="pd-chat-messages"><div class="empty-placeholder">Expand to load messages</div></div>
            <div class="chat-compose">
                <input type="text" id="pd-chat-input" placeholder="Message team room..." onkeydown="if(event.key==='Enter'){window._pdSendChat()}">
                <button onclick="window._pdSendChat()">Send</button>
            </div>
        </div>
    </div>`;
}

// ============================================================================
// INTERACTIONS
// ============================================================================

function handleDetailClick(e) {
    const popover = document.querySelector('.priority-popover');
    if (popover && !e.target.closest('.priority-popover') && !e.target.classList.contains('priority-dot')) {
        popover.remove();
    }
}

function handleDetailKeydown(e) {
    if (e.key === 'Enter' && e.target.classList.contains('task-create-input')) {
        e.preventDefault();
        const title = e.target.value.trim();
        if (!title) return;
        const listId = e.target.dataset.listId;
        const projectId = e.target.dataset.projectId;
        // Quick-create: Enter = create task immediately with defaults
        quickCreateTask(title, listId, projectId, e.target);
    }
    if (e.key === 'Escape' && e.target.classList.contains('task-create-input')) {
        e.target.value = '';
        e.target.blur();
        const panel = e.target.closest('.task-list-section')?.querySelector('.new-task-panel');
        if (panel) panel.remove();
    }
    // Submit from new task panel
    if (e.key === 'Enter' && e.target.closest('.new-task-panel') && !e.target.matches('textarea')) {
        e.preventDefault();
        const panel = e.target.closest('.new-task-panel');
        const btn = panel.querySelector('.new-task-create-btn');
        if (btn) btn.click();
    }
}

async function quickCreateTask(title, listId, projectId, inputEl) {
    try {
        await api.createTask({ instanceId: state.instanceId, title, projectId, listId, priority: 'medium' });
        inputEl.value = '';
        showToast('Task created', 'success');
        await refreshProjectTasks();
        setTimeout(() => {
            const newInput = document.querySelector(`.task-create-input[data-list-id="${listId}"]`);
            if (newInput) newInput.focus();
        }, 50);
    } catch (err) {
        showToast('Failed to create task: ' + err.message, 'error');
    }
}

function showNewTaskPanel(title, listId, projectId, inputEl) {
    // Remove any existing panel in this list
    const section = inputEl.closest('.task-list-section');
    const existing = section?.querySelector('.new-task-panel');
    if (existing) existing.remove();

    const team = state.currentProject?.team || [];
    const teamOptions = team.map(m => {
        const mid = typeof m === 'string' ? m : m.instanceId || m.id;
        const mname = typeof m === 'string' ? m.split('-')[0] : m.name || mid.split('-')[0];
        return `<option value="${mid}">${escapeHtml(mname)}</option>`;
    }).join('');

    const panel = document.createElement('div');
    panel.className = 'new-task-panel';
    panel.innerHTML = `
        <div class="new-task-panel-row">
            <div class="task-detail-field" style="flex:1">
                <label>Priority</label>
                <select class="new-task-priority">
                    ${PRIORITIES.map(p => `<option value="${p}" ${p === 'medium' ? 'selected' : ''}>${p}</option>`).join('')}
                </select>
            </div>
            <div class="task-detail-field" style="flex:1">
                <label>Assignee</label>
                <select class="new-task-assignee">
                    <option value="">Unassigned</option>
                    ${teamOptions}
                </select>
            </div>
        </div>
        <div class="task-detail-field">
            <label>Description</label>
            <textarea class="new-task-desc" rows="2" placeholder="Optional description..."></textarea>
        </div>
        <div class="new-task-panel-actions">
            <button class="btn-action new-task-create-btn">Create</button>
            <button class="btn-action new-task-cancel-btn" style="opacity:0.6">Cancel</button>
        </div>
    `;

    // Insert after the header
    const header = section.querySelector('.task-list-header');
    if (header) header.after(panel);
    else section.prepend(panel);

    panel.querySelector('.new-task-desc').focus();

    panel.querySelector('.new-task-create-btn').addEventListener('click', async () => {
        const priority = panel.querySelector('.new-task-priority').value;
        const assignee = panel.querySelector('.new-task-assignee').value;
        const description = panel.querySelector('.new-task-desc').value.trim();
        try {
            const params = { instanceId: state.instanceId, title, projectId, listId, priority };
            if (description) params.description = description;
            if (assignee) params.assigneeId = assignee;
            await api.createTask(params);
            inputEl.value = '';
            panel.remove();
            showToast('Task created', 'success');
            await refreshProjectTasks();
            setTimeout(() => {
                const newInput = document.querySelector(`.task-create-input[data-list-id="${listId}"]`);
                if (newInput) newInput.focus();
            }, 50);
        } catch (err) {
            showToast('Failed to create task: ' + err.message, 'error');
        }
    });

    panel.querySelector('.new-task-cancel-btn').addEventListener('click', () => {
        panel.remove();
        inputEl.value = '';
        inputEl.focus();
    });
}

// --- Item 9: PM status message ---
window._pdEditPmStatus = function() {
    const project = state.currentProject;
    if (!project) return;
    const current = project.pmStatus || '';
    const newStatus = prompt('PM Status Message:', current);
    if (newStatus === null) return; // cancelled
    const projectId = project.projectId || project.id;
    api.updateProject(state.instanceId, projectId, { pmStatus: newStatus || '' }).then(() => {
        project.pmStatus = newStatus;
        showToast('PM status updated', 'success');
        const allTasks = Object.values(projectTasks).flat();
        renderProjectDetail(project, allTasks);
    }).catch(err => showToast('Failed: ' + err.message, 'error'));
};

// --- Item 17: Detail icon for new task ---
window._pdDetailIcon = function(iconEl) {
    const wrap = iconEl.closest('.new-task-input-wrap');
    const input = wrap?.querySelector('.task-create-input');
    if (!input) return;
    const title = input.value.trim();
    if (!title) { input.focus(); return; }
    const listId = input.dataset.listId;
    const projectId = input.dataset.projectId;
    showNewTaskPanel(title, listId, projectId, input);
};

// --- Item 11: Status dropdown (not cycle) ---
window._pdStatusDropdown = function(event, taskId) {
    event.stopPropagation();
    const task = findTask(taskId);
    if (!task) return;
    const options = STATUSES.map(s => ({
        value: s,
        label: STATUS_LABELS[s],
        icon: STATUS_ICONS[s] || '',
        selected: s === task.status
    }));
    showDropdown(event.target, options, async (newStatus) => {
        const oldStatus = task.status;
        task.status = newStatus;
        const badge = event.target;
        badge.textContent = STATUS_LABELS[newStatus];
        badge.className = `status-badge status-${newStatus}`;
        badge.title = STATUS_LABELS[newStatus];
        try {
            if (newStatus === 'completed') {
                await api.markTaskComplete(state.instanceId, taskId, state.currentProjectDetail);
            } else if (newStatus === 'completed_verified') {
                await api.markTaskVerified(state.instanceId, taskId, state.currentProjectDetail);
            } else if (newStatus === 'archived') {
                await api.archiveTask(state.instanceId, taskId, state.currentProjectDetail);
            } else {
                await api.updateTask(state.instanceId, taskId, { status: newStatus }, state.currentProjectDetail);
            }
        } catch (err) {
            task.status = oldStatus;
            badge.textContent = STATUS_LABELS[oldStatus];
            badge.className = `status-badge status-${oldStatus}`;
            badge.title = STATUS_LABELS[oldStatus];
            showToast('Failed to update status: ' + err.message, 'error');
        }
    });
};

// --- Item 2: Assignee avatar click -> dropdown ---
window._pdAssigneeDropdown = function(event, taskId) {
    event.stopPropagation();
    const task = findTask(taskId);
    if (!task) return;
    const team = state.currentProject?.team || [];
    const currentAssignee = task.assigned_to || task.assignee || '';
    const options = [
        { value: '', label: 'Unassigned', selected: !currentAssignee },
        ...team.map(m => {
            const mid = typeof m === 'string' ? m : m.instanceId || m.id;
            const mname = typeof m === 'string' ? m.split('-')[0] : m.name || mid.split('-')[0];
            return { value: mid, label: mname, selected: mid === currentAssignee };
        })
    ];
    showDropdown(event.target, options, async (value) => {
        try {
            if (value && value !== currentAssignee) {
                await api.updateTask(state.instanceId, taskId, { assigned_to: value }, state.currentProjectDetail);
                task.assigned_to = value;
            } else if (!value) {
                await api.updateTask(state.instanceId, taskId, { assigned_to: '' }, state.currentProjectDetail);
                task.assigned_to = '';
            }
            showToast('Assignee updated', 'success');
            refreshProjectTasks();
        } catch (err) {
            showToast('Failed to update assignee: ' + err.message, 'error');
        }
    });
};

// Priority popover (kept as dropdown)
window._pdPriorityPopover = function(event, taskId) {
    event.stopPropagation();
    const task = findTask(taskId);
    if (!task) return;
    const options = PRIORITIES.map(p => ({
        value: p,
        label: p,
        icon: `<span class="priority-dot priority-dot-${p}" style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${PRIORITY_COLORS[p]}"></span>`,
        selected: p === task.priority
    }));
    showDropdown(event.target, options, async (priority) => {
        const old = task.priority;
        task.priority = priority;
        const dot = document.querySelector(`.priority-dot[data-task-id="${taskId}"]`);
        if (dot) { dot.className = `priority-dot priority-dot-${priority}`; dot.title = priority; }
        try {
            await api.updateTask(state.instanceId, taskId, { priority }, state.currentProjectDetail);
        } catch (err) {
            task.priority = old;
            if (dot) { dot.className = `priority-dot priority-dot-${old}`; dot.title = old; }
            showToast('Failed to update priority', 'error');
        }
    });
};

window._pdExpandTask = function(taskId) {
    expandedTaskId = expandedTaskId === taskId ? null : taskId;
    const allTasks = Object.values(projectTasks).flat();
    renderProjectDetail(state.currentProject, allTasks);
};

// --- Item 1: Save field (including title) ---
window._pdSaveField = async function(taskId, field, value) {
    try {
        if (field === 'status') {
            if (value === 'completed') {
                await api.markTaskComplete(state.instanceId, taskId, state.currentProjectDetail);
            } else if (value === 'completed_verified') {
                await api.markTaskVerified(state.instanceId, taskId, state.currentProjectDetail);
            } else if (value === 'archived') {
                await api.archiveTask(state.instanceId, taskId, state.currentProjectDetail);
            } else {
                await api.updateTask(state.instanceId, taskId, { status: value }, state.currentProjectDetail);
            }
        } else {
            await api.updateTask(state.instanceId, taskId, { [field]: value }, state.currentProjectDetail);
        }
        const task = findTask(taskId);
        if (task) task[field] = value;
        showToast(`Task ${field} updated`, 'success');
    } catch (err) {
        showToast('Failed to save: ' + err.message, 'error');
    }
};

window._pdClaimTask = async function(taskId) {
    try {
        await api.takeOnTask(state.instanceId, taskId, state.currentProjectDetail);
        showToast('Task claimed', 'success');
        refreshProjectTasks();
    } catch (err) { showToast('Failed to claim: ' + err.message, 'error'); }
};

window._pdCompleteTask = async function(taskId) {
    try {
        await api.markTaskComplete(state.instanceId, taskId, state.currentProjectDetail);
        showToast('Task completed', 'success');
        refreshProjectTasks();
    } catch (err) { showToast('Failed: ' + err.message, 'error'); }
};

window._pdVerifyTask = async function(taskId) {
    try {
        await api.markTaskVerified(state.instanceId, taskId, state.currentProjectDetail);
        showToast('Task verified', 'success');
        refreshProjectTasks();
    } catch (err) { showToast('Failed: ' + err.message, 'error'); }
};

window._pdArchiveTask = async function(taskId) {
    try {
        await api.archiveTask(state.instanceId, taskId, state.currentProjectDetail);
        showToast('Task archived', 'success');
        refreshProjectTasks();
    } catch (err) { showToast('Failed: ' + err.message, 'error'); }
};

window._pdToggleList = function(listId) {
    if (expandedLists.has(listId)) expandedLists.delete(listId);
    else expandedLists.add(listId);
    const allTasks = Object.values(projectTasks).flat();
    renderProjectDetail(state.currentProject, allTasks);
};

window._pdToggleSection = function(sectionName) {
    if (expandedSections.has(sectionName)) expandedSections.delete(sectionName);
    else expandedSections.add(sectionName);
    const section = document.querySelector(`.section-collapse[data-section="${sectionName}"]`);
    if (!section) return;
    const body = section.querySelector('.section-collapse-body');
    const chev = section.querySelector('.chevron');
    if (body) body.style.display = expandedSections.has(sectionName) ? 'block' : 'none';
    if (chev) chev.classList.toggle('expanded', expandedSections.has(sectionName));
    if (sectionName === 'chat' && expandedSections.has('chat')) loadChatMessages();
};

// --- Item 6: Eye icon toggle for completed tasks ---
window._pdToggleCompleted = function(listId) {
    if (showCompletedLists.has(listId)) showCompletedLists.delete(listId);
    else showCompletedLists.add(listId);
    const allTasks = Object.values(projectTasks).flat();
    renderProjectDetail(state.currentProject, allTasks);
};

// Aliases for shared-tasks.js handler naming convention
window._pdStatusDD = function(event, tid) { window._pdStatusDropdown(event, tid); };
window._pdPriDD = function(event, tid) { window._pdPriorityPopover(event, tid); };
window._pdToggleTL = function(lid) { window._pdToggleList(lid); };
window._pdNewTask = function() { const t = prompt('New task title:'); if (t?.trim()) window._pdQuickAddTask && window._pdQuickAddTask(t.trim()); };

// --- Items 16, 17, 23: New task list ---
window._pdCreateList = async function(projectId) {
    const name = prompt('New list name:');
    if (!name || !name.trim()) return;
    const listName = name.trim();
    try {
        await api.createTaskList(state.instanceId, listName, projectId);
        showToast('Task list created', 'success');
        // Add empty list to local state so it renders even without tasks
        if (!projectTasks[listName]) projectTasks[listName] = [];
        expandedLists.add(listName);
        const allTasks = Object.values(projectTasks).flat();
        renderProjectDetail(state.currentProject, allTasks);
    } catch (err) { showToast('Failed to create list: ' + err.message, 'error'); }
};

// --- Goals ---

async function refreshProjectGoals() {
    const projectId = state.currentProjectDetail;
    try {
        const r = await api.listProjectGoals(state.instanceId, projectId);
        const summaries = r.goals || [];
        projectGoals = await Promise.all(
            summaries.map(g => api.getGoal(state.instanceId, g.id, projectId).then(r2 => r2.goal).catch(() => g))
        );
    } catch (_) { projectGoals = []; }
    const allTasks = Object.values(projectTasks).flat();
    renderProjectDetail(state.currentProject, allTasks);
}

window._pdToggleGoal = function(goalId) {
    const section = document.querySelector(`.goal-section[data-goal-id="${goalId}"]`);
    if (!section) return;
    const body = section.querySelector('.task-list-body');
    const chevron = section.querySelector('.chevron');
    const context = section.querySelector('.goal-context');
    if (body) body.style.display = body.style.display === 'none' ? 'block' : 'none';
    if (chevron) chevron.classList.toggle('expanded');
    if (context) context.style.display = context.style.display === 'none' ? 'block' : 'none';
};

window._pdValidateCriteria = async function(goalId, criteriaId) {
    const projectId = state.currentProjectDetail;
    try {
        await api.validateCriteria(state.instanceId, goalId, criteriaId, projectId);
        await refreshProjectGoals();
    } catch (err) { showToast('Failed: ' + err.message, 'error'); }
};

window._pdGoalStatusMenu = function(el, goalId) {
    const options = ['in_progress', 'achieved', 'exceeded'].map(s => ({
        label: GOAL_STATUS_LABELS[s], value: s, icon: GOAL_STATUS_ICONS[s]
    }));
    showDropdown(el, options, async (status) => {
        const projectId = state.currentProjectDetail;
        try {
            await api.setGoalStatus(state.instanceId, goalId, status, projectId);
            await refreshProjectGoals();
        } catch (err) { showToast('Failed: ' + err.message, 'error'); }
    });
};

window._pdCreateGoal = async function(btn) {
    const input = btn.parentElement.querySelector('.goal-create-input');
    if (!input || !input.value.trim()) return;
    const projectId = state.currentProjectDetail;
    try {
        await api.createGoal(state.instanceId, input.value.trim(), null, projectId);
        input.value = '';
        await refreshProjectGoals();
    } catch (err) { showToast('Failed: ' + err.message, 'error'); }
};

// Wire goal inputs on detail click/keydown handlers
function bindProjectGoalInputs() {
    const projectId = state.currentProjectDetail;
    document.querySelectorAll('.goal-create-input').forEach(input => {
        if (input._goalBound) return;
        input._goalBound = true;
        input.addEventListener('keydown', async (e) => {
            if (e.key !== 'Enter' || !input.value.trim()) return;
            try {
                await api.createGoal(state.instanceId, input.value.trim(), null, projectId);
                input.value = '';
                await refreshProjectGoals();
            } catch (err) { showToast('Failed: ' + err.message, 'error'); }
        });
    });
    document.querySelectorAll('.goal-add-criteria').forEach(input => {
        if (input._goalBound) return;
        input._goalBound = true;
        input.addEventListener('keydown', async (e) => {
            if (e.key !== 'Enter' || !input.value.trim()) return;
            const goalId = input.dataset.goalId;
            try {
                await api.addCriteria(state.instanceId, goalId, input.value.trim(), null, false, projectId);
                input.value = '';
                await refreshProjectGoals();
            } catch (err) { showToast('Failed: ' + err.message, 'error'); }
        });
    });
}

// --- Item 9: Project status dropdown ---
window._pdProjectStatusDropdown = function(event) {
    event.stopPropagation();
    const project = state.currentProject;
    if (!project) return;
    const projectId = project.projectId || project.id;
    const options = PROJECT_STATUSES.map(s => ({
        value: s, label: s, selected: s === project.status
    }));
    showDropdown(event.target, options, async (newStatus) => {
        try {
            await api.updateProject(state.instanceId, projectId, { status: newStatus });
            project.status = newStatus;
            event.target.textContent = newStatus;
            event.target.className = `status-badge status-${newStatus}`;
            showToast('Project status updated', 'success');
        } catch (err) {
            showToast('Failed to update status: ' + err.message, 'error');
        }
    });
};

// --- Item 10: Project priority dropdown ---
window._pdProjectPriorityDropdown = function(event) {
    event.stopPropagation();
    const project = state.currentProject;
    if (!project) return;
    const projectId = project.projectId || project.id;
    const currentPriority = project.priority || 'medium';
    const options = PRIORITIES.map(p => ({
        value: p, label: p,
        icon: `<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${PRIORITY_COLORS[p]}"></span>`,
        selected: p === currentPriority
    }));
    showDropdown(event.target, options, async (newPriority) => {
        try {
            await api.updateProject(state.instanceId, projectId, { priority: newPriority });
            project.priority = newPriority;
            event.target.textContent = newPriority;
            event.target.style.background = `rgba(${newPriority === 'high' || newPriority === 'critical' || newPriority === 'emergency' ? '239,68,68' : newPriority === 'medium' ? '59,130,246' : '107,114,128'},0.15)`;
            event.target.style.color = PRIORITY_COLORS[newPriority] || '#3b82f6';
            showToast('Project priority updated', 'success');
        } catch (err) {
            showToast('Failed to update priority: ' + err.message, 'error');
        }
    });
};

// --- Item 8: PM clickable -> assign dropdown ---
window._pdPMDropdown = async function(event) {
    event.stopPropagation();
    let instances = state.instances || [];
    if (!instances.length) {
        try {
            const r = await api.getInstances(state.instanceId);
            instances = r.instances || [];
        } catch (_e) { /* ignore */ }
    }
    const options = instances.map(i => ({
        value: i.instanceId,
        label: (i.name || i.instanceId.split('-')[0]) + (i.role ? ` (${i.role})` : ''),
        selected: i.instanceId === state.currentProjectPM?.instanceId
    }));
    showDropdown(event.target, options, async (newPmId) => {
        try {
            const projectId = state.currentProject?.projectId || state.currentProject?.id || state.currentProjectDetail;
            await api.updateProject(state.instanceId, projectId, { pm: newPmId });
            if (state.currentProject) state.currentProject.pm = newPmId;
            const pmInst = instances.find(i => i.instanceId === newPmId);
            state.currentProjectPM = { instanceId: newPmId, name: pmInst?.name || newPmId.split('-')[0], status: pmInst?.status || 'unknown' };
            showToast('PM assigned', 'success');
            const allTasks = Object.values(projectTasks).flat();
            renderProjectDetail(state.currentProject, allTasks);
        } catch (err) {
            showToast('Failed to assign PM: ' + err.message, 'error');
        }
    });
};

// --- Item 22: Project rename ---
window._pdRenameProject = function(el) {
    const current = el.textContent;
    const input = document.createElement('input');
    input.type = 'text';
    input.value = current;
    input.className = 'task-detail-title-input';
    input.style.fontSize = '1.25rem';
    el.replaceWith(input);
    input.focus();
    input.select();
    const finish = async () => {
        const newName = input.value || current;
        const h2 = document.createElement('h2');
        h2.className = 'pd-project-name';
        h2.setAttribute('onclick', 'window._pdRenameProject(this)');
        h2.title = 'Click to rename';
        h2.textContent = newName;
        input.replaceWith(h2);
        if (newName !== current) {
            try {
                const projectId = state.currentProject?.projectId || state.currentProject?.id || state.currentProjectDetail;
                await api.updateProject(state.instanceId, projectId, { name: newName });
                if (state.currentProject) state.currentProject.name = newName;
                showToast('Project renamed', 'success');
            } catch (err) {
                h2.textContent = current;
                showToast('Failed to rename: ' + err.message, 'error');
            }
        }
    };
    input.addEventListener('blur', finish);
    input.addEventListener('keydown', e => {
        if (e.key === 'Enter') { e.preventDefault(); input.blur(); }
        if (e.key === 'Escape') { input.value = current; input.blur(); }
    });
};

// --- Items 14, 18: Add team member ---
window._pdAddTeamMember = async function(event) {
    event.stopPropagation();
    let instances = state.instances || [];
    if (!instances.length) {
        try {
            const r = await api.getInstances(state.instanceId);
            instances = r.instances || [];
            state.instances = instances;
        } catch (_e) { /* ignore */ }
    }
    const currentTeam = new Set((state.currentProject?.team || []).map(m => typeof m === 'string' ? m : m.instanceId || m.id));
    const options = instances
        .filter(i => !currentTeam.has(i.instanceId))
        .map(i => ({
            value: i.instanceId,
            label: (i.name || i.instanceId.split('-')[0]) + (i.role ? ` (${i.role})` : '')
        }));
    if (!options.length) {
        showToast('All instances are already team members', 'info');
        return;
    }
    showDropdown(event.target, options, async (instanceId) => {
        try {
            await api.joinProject(instanceId, state.currentProjectDetail);
            showToast('Team member added', 'success');
            // Refresh project to get updated team
            const result = await api.getProject(state.currentProjectDetail);
            const project = result.project || result;
            state.currentProject = project;
            const allTasks = Object.values(projectTasks).flat();
            renderProjectDetail(project, allTasks);
        } catch (err) {
            showToast('Failed to add member: ' + err.message, 'error');
        }
    });
};

window._pdShowInstance = function(instanceId) {
    if (window.showInstanceDetail) window.showInstanceDetail(instanceId);
};

// --- Item 10b: Document viewer with edit ---
window._pdViewDocument = async function(docName) {
    const projectId = state.currentProjectDetail;
    try {
        const result = await api.readDocument(state.instanceId, docName, `project:${projectId}`);
        const content = result.content || result.document || 'Empty document';
        const overlay = document.createElement('div');
        overlay.className = 'document-overlay';
        overlay.innerHTML = `
            <div class="document-viewer">
                <div class="document-viewer-header">
                    <h3>${escapeHtml(docName)}</h3>
                    <div style="display:flex;gap:8px;align-items:center">
                        <button class="btn-action" onclick="window._pdRenameDocument('${escapeHtml(docName)}')">Rename</button>
                        <button class="btn-action pd-doc-edit-btn" onclick="window._pdEditDocument(this)">Edit</button>
                        <button onclick="this.closest('.document-overlay').remove()">&times;</button>
                    </div>
                </div>
                <pre class="document-viewer-content" data-doc-name="${escapeHtml(docName)}">${escapeHtml(content)}</pre>
            </div>`;
        document.body.appendChild(overlay);
        overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
    } catch (err) { showToast('Failed to load document: ' + err.message, 'error'); }
};

window._pdEditDocument = function(btn) {
    const viewer = btn.closest('.document-viewer');
    const pre = viewer.querySelector('.document-viewer-content');
    const docName = pre.dataset.docName;
    const content = pre.textContent;

    // Replace pre with textarea
    const textarea = document.createElement('textarea');
    textarea.className = 'document-viewer-edit';
    textarea.value = content;
    pre.replaceWith(textarea);

    // Replace Edit button with Save/Cancel
    const headerActions = btn.parentElement;
    headerActions.innerHTML = `
        <button class="btn-action" onclick="window._pdSaveDocument('${escapeHtml(docName)}', this)">Save</button>
        <button class="btn-action" onclick="window._pdCancelEditDocument(this)">Cancel</button>
        <button onclick="this.closest('.document-overlay').remove()">&times;</button>
    `;
};

window._pdSaveDocument = async function(docName, btn) {
    const viewer = btn.closest('.document-viewer');
    const textarea = viewer.querySelector('.document-viewer-edit');
    const newContent = textarea.value;
    const projectId = state.currentProjectDetail;
    try {
        // Use editDocument with replace mode - replace full content
        await api.editDocument(state.instanceId, docName, 'replace', {
            target: `project:${projectId}`,
            search: '', // empty search = replace all
            replacement: newContent
        });
        showToast('Document saved', 'success');
        // Switch back to view mode
        const pre = document.createElement('pre');
        pre.className = 'document-viewer-content';
        pre.dataset.docName = docName;
        pre.textContent = newContent;
        textarea.replaceWith(pre);
        const headerActions = btn.parentElement;
        headerActions.innerHTML = `
            <button class="btn-action pd-doc-edit-btn" onclick="window._pdEditDocument(this)">Edit</button>
            <button onclick="this.closest('.document-overlay').remove()">&times;</button>
        `;
    } catch (err) {
        showToast('Failed to save document: ' + err.message, 'error');
    }
};

window._pdCancelEditDocument = function(btn) {
    const viewer = btn.closest('.document-viewer');
    const textarea = viewer.querySelector('.document-viewer-edit');
    // Re-fetch and show as pre
    const docName = viewer.querySelector('h3').textContent;
    const pre = document.createElement('pre');
    pre.className = 'document-viewer-content';
    pre.dataset.docName = docName;
    pre.textContent = textarea.value; // keep current (unsaved)
    textarea.replaceWith(pre);
    const headerActions = btn.parentElement;
    headerActions.innerHTML = `
        <button class="btn-action pd-doc-edit-btn" onclick="window._pdEditDocument(this)">Edit</button>
        <button onclick="this.closest('.document-overlay').remove()">&times;</button>
    `;
};

// --- Item 7c: Rename document ---
window._pdRenameDocument = async function(docName) {
    const newName = prompt('Rename document:', docName);
    if (!newName || newName.trim() === docName) return;
    const projectId = state.currentProjectDetail;
    try {
        await api.renameDocument(state.instanceId, docName, newName.trim(), `project:${projectId}`);
        showToast('Document renamed', 'success');
        // Close viewer and refresh
        const overlay = document.querySelector('.document-overlay');
        if (overlay) overlay.remove();
        const docsResult = await api.listDocuments(state.instanceId, `project:${projectId}`);
        projectDocuments = docsResult.documents || [];
        const allTasks = Object.values(projectTasks).flat();
        renderProjectDetail(state.currentProject, allTasks);
    } catch (err) {
        showToast('Failed to rename: ' + err.message, 'error');
    }
};

// --- Item 20: Vital star toggle ---
window._pdToggleVital = async function(docName) {
    const projectId = state.currentProjectDetail;
    const target = `project:${projectId}`;
    try {
        if (vitalDocuments.has(docName)) {
            await api.removeFromVital(state.instanceId, docName, target);
            vitalDocuments.delete(docName);
            showToast('Removed from vital documents', 'success');
        } else {
            await api.addToVital(state.instanceId, docName, target);
            vitalDocuments.add(docName);
            showToast('Added to vital documents', 'success');
        }
        // Re-render documents section only
        const allTasks = Object.values(projectTasks).flat();
        renderProjectDetail(state.currentProject, allTasks);
    } catch (err) {
        showToast('Failed to toggle vital: ' + err.message, 'error');
    }
};

window._pdCreateDocument = async function(projectId) {
    const name = prompt('Document name (e.g., notes.md):');
    if (!name || !name.trim()) return;
    try {
        await api.createDocument(state.instanceId, name.trim(), '# ' + name.trim() + '\n\n', `project:${projectId}`);
        showToast('Document created', 'success');
        const docsResult = await api.listDocuments(state.instanceId, `project:${projectId}`);
        projectDocuments = docsResult.documents || [];
        const allTasks = Object.values(projectTasks).flat();
        renderProjectDetail(state.currentProject, allTasks);
    } catch (err) { showToast('Failed: ' + err.message, 'error'); }
};

window._pdSendChat = async function() {
    const input = document.getElementById('pd-chat-input');
    if (!input) return;
    const body = input.value.trim();
    if (!body || !state.currentProjectDetail) return;
    try {
        await api.sendMessage({ from: state.instanceId, to: `project:${state.currentProjectDetail}`, body });
        input.value = '';
        showToast('Sent', 'success');
        loadChatMessages();
    } catch (err) { showToast('Failed to send', 'error'); }
};

window._pdHideDetail = function() { hideProjectDetail(); };

async function loadChatMessages() {
    const container = document.getElementById('pd-chat-messages');
    if (!container || !state.currentProject) return;
    try {
        const result = await api.getMessages(state.instanceId, { room: `project-${state.currentProjectDetail}`, limit: 20 });
        const messages = result.messages || [];
        if (messages.length === 0) {
            container.innerHTML = '<div class="empty-placeholder">No messages yet</div>';
            return;
        }
        container.innerHTML = messages.map(msg => {
            const sender = msg.from?.split('@')[0] || 'Unknown';
            const time = msg.timestamp ? new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
            return `<div class="message-mini"><div class="message-mini-sender">${escapeHtml(sender)}</div><div>${escapeHtml(msg.body || msg.subject || '')}</div><div class="message-mini-time">${time}</div></div>`;
        }).join('');
        container.scrollTop = container.scrollHeight;
    } catch (e) {
        container.innerHTML = '<div class="empty-placeholder">Could not load messages</div>';
    }
}

// ============================================================================
// SETTINGS VIEWER (Item 13)
// ============================================================================

window._pdShowSettings = async function() {
    const projectId = state.currentProjectDetail;
    if (!projectId) return;
    try {
        const result = await api.getProject(projectId);
        const project = result.project || result;
        // Build collapsible JSON viewer
        const overlay = document.createElement('div');
        overlay.className = 'document-overlay';
        overlay.innerHTML = `
            <div class="document-viewer" style="max-width:600px">
                <div class="document-viewer-header">
                    <h3>Project Settings: ${escapeHtml(project.name || projectId)}</h3>
                    <button onclick="this.closest('.document-overlay').remove()">&times;</button>
                </div>
                <div class="json-viewer" id="pd-json-viewer"></div>
            </div>`;
        document.body.appendChild(overlay);
        overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
        renderJsonViewer(document.getElementById('pd-json-viewer'), project, ['tasks', 'task_lists']);
    } catch (err) { showToast('Failed to load settings: ' + err.message, 'error'); }
};

function renderJsonViewer(container, obj, collapsedKeys = [], prefix = '') {
    const entries = Object.entries(obj);
    entries.forEach(([key, value]) => {
        const fullKey = prefix ? `${prefix}.${key}` : key;
        const row = document.createElement('div');
        row.className = 'json-viewer-row';
        if (value && typeof value === 'object') {
            const isArray = Array.isArray(value);
            const count = isArray ? value.length : Object.keys(value).length;
            const collapsed = collapsedKeys.includes(key);
            row.innerHTML = `<span class="json-viewer-toggle ${collapsed ? '' : 'open'}">${collapsed ? '\u25B6' : '\u25BC'}</span>
                <span class="json-viewer-key">"${escapeHtml(key)}"</span>: <span class="json-viewer-type">${isArray ? `Array(${count})` : `Object(${count})`}</span>`;
            const childContainer = document.createElement('div');
            childContainer.className = 'json-viewer-children';
            childContainer.style.display = collapsed ? 'none' : 'block';
            renderJsonViewer(childContainer, value, collapsedKeys, fullKey);
            row.querySelector('.json-viewer-toggle').addEventListener('click', () => {
                const isOpen = childContainer.style.display !== 'none';
                childContainer.style.display = isOpen ? 'none' : 'block';
                row.querySelector('.json-viewer-toggle').textContent = isOpen ? '\u25B6' : '\u25BC';
                row.querySelector('.json-viewer-toggle').classList.toggle('open', !isOpen);
            });
            container.appendChild(row);
            container.appendChild(childContainer);
        } else {
            const valStr = value === null ? 'null' : typeof value === 'string' ? `"${escapeHtml(value)}"` : String(value);
            const valClass = value === null ? 'null' : typeof value;
            row.innerHTML = `<span class="json-viewer-key">"${escapeHtml(key)}"</span>: <span class="json-viewer-value json-viewer-${valClass}">${valStr}</span>`;
            container.appendChild(row);
        }
    });
}

// ============================================================================
// TASK LIST SORTING (Items 14, 15)
// ============================================================================

let taskSortField = null;
let taskSortReverse = false;

window._pdSortTasks = function(field) {
    if (taskSortField === field) taskSortReverse = !taskSortReverse;
    else { taskSortField = field; taskSortReverse = false; }
    for (const tasks of Object.values(projectTasks)) {
        sortTasksInPlace(tasks, field, taskSortReverse);
    }
    const allTasks = Object.values(projectTasks).flat();
    renderProjectDetail(state.currentProject, allTasks);
};

// ============================================================================
// HELPERS
// ============================================================================

function findTask(taskId) {
    return findTaskById(projectTasks, taskId);
}

async function refreshProjectTasks() {
    const projectId = state.currentProjectDetail;
    if (!projectId) return;
    try {
        const [tasksResult, projectResult] = await Promise.allSettled([
            api.listTasks(state.instanceId, { projectId, limit: 200, full_detail: true }),
            api.getProject(projectId)
        ]);
        const tasks = tasksResult.status === 'fulfilled' ? (tasksResult.value.tasks || []) : [];
        projectTasks = {};
        tasks.forEach(t => {
            const lid = t.listId || t.list || 'default';
            if (!projectTasks[lid]) projectTasks[lid] = [];
            projectTasks[lid].push(t);
        });
        // Include empty task lists from project data
        if (projectResult.status === 'fulfilled') {
            const proj = projectResult.value.project || projectResult.value;
            const taskLists = proj.task_lists || {};
            Object.keys(taskLists).forEach(lid => {
                if (!projectTasks[lid]) projectTasks[lid] = [];
            });
            if (proj) state.currentProject = proj;
        }
        renderProjectDetail(state.currentProject, tasks);
    } catch (err) {
        showToast('Failed to refresh tasks', 'error');
    }
}

// ============================================================================
// HIDE DETAIL
// ============================================================================

export function hideProjectDetail() {
    const detailView = document.getElementById('project-detail-view');
    if (detailView) {
        detailView.style.display = 'none';
        detailView.removeEventListener('click', handleDetailClick);
        detailView.removeEventListener('keydown', handleDetailKeydown);
    }
    document.getElementById('project-grid').style.display = 'grid';
    const pageHeader = document.querySelector('#tab-projects .page-header');
    if (pageHeader) pageHeader.style.display = 'flex';
    state.currentProjectDetail = null;
    state.currentProject = null;
    state.currentProjectPM = null;
    state.pmChatTurns = 0;
    if (chatPollInterval) { clearInterval(chatPollInterval); chatPollInterval = null; }
}

export function renderProjectDetailTasks(tasks) {
    if (!state.currentProjectDetail || !state.currentProject) return;
    projectTasks = {};
    (tasks || []).forEach(t => {
        const lid = t.listId || t.list || 'default';
        if (!projectTasks[lid]) projectTasks[lid] = [];
        projectTasks[lid].push(t);
    });
    renderProjectDetail(state.currentProject, tasks || []);
}

// ============================================================================
// CREATE PROJECT MODAL
// ============================================================================

export function showCreateProjectModal() {
    document.getElementById('create-project-modal').classList.add('active');
    document.getElementById('project-name').value = '';
    document.getElementById('project-description').value = '';
    document.getElementById('project-gh-repo').value = '';
    document.getElementById('project-name').focus();
}

export function closeCreateProjectModal() {
    document.getElementById('create-project-modal').classList.remove('active');
}

export async function createProject() {
    const name = document.getElementById('project-name').value.trim();
    const description = document.getElementById('project-description').value.trim();
    const ghRepo = document.getElementById('project-gh-repo').value.trim();
    if (!name) { showToast('Please enter a project name', 'error'); return; }
    if (!state.instanceId) { showToast('Not connected', 'error'); return; }
    try {
        const projectId = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
        const params = { instanceId: state.instanceId, projectId, name };
        if (description) params.description = description;
        if (ghRepo) params.ghRepo = ghRepo;
        const result = await api.createProject(params);
        if (result.success !== false) {
            showToast(`Project "${name}" created!`, 'success');
            closeCreateProjectModal();
            const projectsResult = await api.listProjects();
            if (projectsResult.projects) state.projects = projectsResult.projects;
            if (state.currentTab === 'projects') loadProjects();
            if (window.renderProjectRooms) window.renderProjectRooms();
        } else {
            showToast(result.error?.message || 'Failed to create project', 'error');
        }
    } catch (error) {
        showToast('Error creating project: ' + error.message, 'error');
    }
}

// ============================================================================
// LAUNCH PROJECT
// ============================================================================

export async function launchProject() {
    const name = document.getElementById('project-name').value.trim();
    const description = document.getElementById('project-description').value.trim();
    const ghRepo = document.getElementById('project-gh-repo').value.trim();
    const pmPersonality = document.getElementById('pm-personality').value;
    if (!name) { showToast('Please enter a project name', 'error'); return; }
    if (!state.instanceId) { showToast('Not connected', 'error'); return; }
    const apiKey = prompt('Enter API key for PM wake operations (or Cancel to go back):');
    if (!apiKey) return;
    try {
        const projectId = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
        const projectParams = { instanceId: state.instanceId, projectId, name };
        if (description) projectParams.description = description;
        if (ghRepo) projectParams.ghRepo = ghRepo;
        const projectResult = await api.createProject(projectParams);
        if (!projectResult.success) throw new Error(projectResult.error?.message || 'Failed to create project');

        const pmName = name.replace(/\s+/g, '') + '-PM';
        const preApproveResult = await api.preApprove({
            instanceId: state.instanceId, name: pmName, role: 'PM', personality: pmPersonality,
            project: projectId, apiKey,
            instructions: 'You are the PM for ' + name + '. Your first task is to wake a Lead Designer and collaborate on the system design.'
        });
        if (!preApproveResult.success) throw new Error(preApproveResult.error?.message || 'Failed to pre-approve PM');
        const pmInstanceId = preApproveResult.newInstanceId;

        const wakeResult = await api.wakeInstance({
            instanceId: state.instanceId, targetInstanceId: pmInstanceId, apiKey,
            message: `Welcome! You are the PM for ${name}.\n\nProject brief: ${description || 'No description provided.'}\n\nYour first tasks:\n1. Use pre_approve to create a Lead Designer instance\n2. Use wake_instance to bring them online\n3. Use continue_conversation to collaborate on the system design\n4. Once design is complete, break it into sprints and build the team`
        });
        if (!wakeResult.success) throw new Error(wakeResult.error?.message || 'Failed to wake PM');

        showToast('Project launched! PM ' + pmInstanceId + ' is now online.', 'success');
        closeCreateProjectModal();
        const projectsResult = await api.listProjects();
        if (projectsResult.projects) state.projects = projectsResult.projects;
        if (state.currentTab === 'projects') loadProjects();
    } catch (error) {
        showToast('Launch failed: ' + error.message, 'error');
    }
}

// ============================================================================
// WINDOW GLOBALS & EXPORTS
// ============================================================================

window.showProjectDetail = showProjectDetail;

export default {
    loadProjects, showProjectDetail, hideProjectDetail, renderProjectDetailTasks,
    showCreateProjectModal, closeCreateProjectModal, createProject, launchProject
};
