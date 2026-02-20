/**
 * Projects Module
 *
 * Handles project listing, project detail panel, create project, and launch project.
 * The project detail panel is the main view for managing a project.
 *
 * @module projects
 */

import { state } from './state.js';
import { escapeHtml, showToast } from './utils.js';
import api from './api.js';
import * as uiConfig from './ui-config.js';

// Module-level state
let expandedLists = new Set();
let expandedTaskId = null;
let expandedSections = new Set(['tasks']);
let projectTasks = {};  // { listId: [tasks] }
let projectDocuments = [];
let projectVision = null;
let onlineInstances = new Set();
let chatPollInterval = null;

const STATUS_CYCLE = ['not_started', 'in_progress', 'completed'];
const PRIORITIES = ['emergency', 'critical', 'high', 'medium', 'low', 'whenever'];
const PRIORITY_COLORS = { emergency: '#ef4444', critical: '#ef4444', high: '#f97316', medium: '#3b82f6', low: '#6b7280', whenever: 'transparent' };
const STATUS_LABELS = { not_started: 'Not Started', in_progress: 'In Progress', blocked: 'Blocked', completed: 'Completed', completed_verified: 'Verified', archived: 'Archived' };

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
        return `
        <div class="project-card" data-project-id="${pid}">
            <span class="project-status status-${project.status}">${project.status}</span>
            <div class="project-name">${escapeHtml(project.name)}</div>
            <div class="project-description">${escapeHtml(project.description || 'No description')}</div>
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
    projectVision = null;

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

    // Set PM info
    const pmId = project.pm;
    let pmInstance = null;
    if (pmId) {
        pmInstance = state.instances.find(i => i.instanceId === pmId || i.name === pmId);
        state.currentProjectPM = { instanceId: pmId, name: pmInstance?.name || pmId.split('-')[0], status: pmInstance?.status || 'unknown' };
    } else {
        state.currentProjectPM = null;
    }

    // Fetch presence, tasks, documents in parallel
    const [presenceResult, tasksResult, docsResult, visionResult] = await Promise.allSettled([
        api.getPresence(),
        api.listTasks(state.instanceId, { projectId, limit: 200, full_detail: true }),
        api.listDocuments(state.instanceId, `project:${projectId}`),
        api.readDocument(state.instanceId, 'PROJECT_VISION.md', `project:${projectId}`)
    ]);

    if (presenceResult.status === 'fulfilled') {
        const users = presenceResult.value.users || presenceResult.value.onlineUsers || [];
        onlineInstances = new Set(users.map(u => typeof u === 'string' ? u : u.instanceId || u.jid?.split('@')[0]));
    }

    let allTasks = [];
    if (tasksResult.status === 'fulfilled') {
        allTasks = tasksResult.value.tasks || [];
    }

    // Group tasks by list
    projectTasks = {};
    allTasks.forEach(t => {
        const lid = t.listId || t.list || 'default';
        if (!projectTasks[lid]) projectTasks[lid] = [];
        projectTasks[lid].push(t);
    });

    if (docsResult.status === 'fulfilled') {
        projectDocuments = docsResult.value.documents || [];
    }
    if (visionResult.status === 'fulfilled') {
        projectVision = visionResult.value.content || visionResult.value.document || null;
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
                <h2>${escapeHtml(project.name)}</h2>
                <span class="status-badge status-${project.status}" data-project-id="${projectId}" onclick="window._pdCycleProjectStatus(this)">${project.status}</span>
            </div>
        </div>
        <div class="project-detail-header-meta">
            <span class="project-detail-pm" title="${escapeHtml(state.currentProjectPM?.instanceId || '')}">
                <span class="online-dot ${pmOnline ? 'online' : ''}"></span> PM: ${escapeHtml(pmName)}
            </span>
            <span class="project-detail-team-count" onclick="window._pdToggleSection('team')">${team.length} members</span>
            <span class="project-detail-progress">${completedCount}/${totalCount} done</span>
        </div>
    </div>
    <div class="project-detail-body">
        <div class="project-detail-main">
            ${renderVisionSection()}
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

function renderTasksSection(listIds, projectId) {
    const isExpanded = expandedSections.has('tasks');
    return `
    <div class="section-collapse" data-section="tasks">
        <div class="section-collapse-header" onclick="window._pdToggleSection('tasks')">
            <span class="chevron ${isExpanded ? 'expanded' : ''}">&rsaquo;</span> Tasks
        </div>
        <div class="section-collapse-body" style="display:${isExpanded ? 'block' : 'none'}">
            ${listIds.map(lid => renderTaskList(lid, projectTasks[lid] || [], projectId)).join('')}
            <button class="inline-form-btn" onclick="window._pdCreateList('${projectId}')">+ New List</button>
        </div>
    </div>`;
}

function renderTaskList(listId, tasks, projectId) {
    const isExpanded = expandedLists.has(listId);
    const completed = tasks.filter(t => ['completed', 'completed_verified'].includes(t.status)).length;
    const pct = tasks.length > 0 ? Math.round(completed / tasks.length * 100) : 0;
    const docIcon = projectDocuments.some(d => d.toLowerCase().startsWith(listId.toLowerCase())) ? ' <span class="companion-doc-icon" title="Has companion document">&#128196;</span>' : '';

    return `
    <div class="task-list-section" data-list-id="${listId}">
        <div class="task-list-header" onclick="window._pdToggleList('${listId}')">
            <span class="chevron ${isExpanded ? 'expanded' : ''}">&rsaquo;</span>
            <span class="task-list-name">${escapeHtml(listId)}${docIcon}</span>
            <span class="task-list-progress-text">${completed}/${tasks.length}</span>
            <div class="progress-bar"><div class="progress-fill" style="width:${pct}%"></div></div>
        </div>
        <div class="task-list-body" style="display:${isExpanded ? 'block' : 'none'}">
            ${tasks.filter(t => t.status !== 'completed_verified' && t.status !== 'archived').map(t => renderTaskRow(t)).join('')}
            <div class="task-list-completed-toggle">
                <button class="btn-link" onclick="window._pdToggleCompleted(this, '${listId}')">Show completed (${completed})</button>
            </div>
            <div class="task-list-completed" style="display:none">
                ${tasks.filter(t => t.status === 'completed' || t.status === 'completed_verified').map(t => renderTaskRow(t)).join('')}
            </div>
            <div class="inline-form" data-list-id="${listId}" data-project-id="${projectId}">
                <input type="text" class="inline-form-input task-create-input" placeholder="+ Add task..." data-list-id="${listId}" data-project-id="${projectId}">
            </div>
        </div>
    </div>`;
}

function renderTaskRow(task) {
    const tid = task.taskId || task.id;
    const priority = task.priority || 'medium';
    const status = task.status || 'not_started';
    const assignee = task.assigned_to || task.assignee;
    const assigneeLabel = assignee ? (assignee.split('-')[0] || '?') : '';
    const isExpanded = expandedTaskId === tid;

    let row = `
    <div class="task-row ${isExpanded ? 'task-row-expanded' : ''}" data-task-id="${tid}">
        <div class="task-row-summary">
            <span class="priority-dot priority-dot-${priority}" data-task-id="${tid}" onclick="window._pdPriorityPopover(event, '${tid}')" title="${priority}"></span>
            <span class="task-row-title" data-task-id="${tid}" onclick="window._pdExpandTask('${tid}')">${escapeHtml(task.title)}</span>
            <span class="status-badge status-${status}" data-task-id="${tid}" onclick="window._pdCycleStatus(event, '${tid}')">${STATUS_LABELS[status] || status}</span>
            ${assigneeLabel ? `<span class="task-assignee-avatar" title="${escapeHtml(assignee)}">${escapeHtml(assigneeLabel.charAt(0).toUpperCase())}</span>` : ''}
        </div>`;

    if (isExpanded) {
        row += renderTaskExpanded(task);
    }
    row += '</div>';
    return row;
}

function renderTaskExpanded(task) {
    const tid = task.taskId || task.id;
    const team = state.currentProject?.team || [];
    const isAssignee = task.assigned_to === state.instanceId || task.assignee === state.instanceId;
    const isCompleted = task.status === 'completed';
    const isVerified = task.status === 'completed_verified';

    return `
    <div class="task-detail-inline">
        <div class="task-detail-field">
            <label>Description</label>
            <textarea class="task-detail-desc" data-task-id="${tid}" onblur="window._pdSaveField('${tid}','description',this.value)">${escapeHtml(task.description || '')}</textarea>
        </div>
        <div class="task-detail-row">
            <div class="task-detail-field">
                <label>Priority</label>
                <select data-task-id="${tid}" onchange="window._pdSaveField('${tid}','priority',this.value)">
                    ${PRIORITIES.map(p => `<option value="${p}" ${p === task.priority ? 'selected' : ''}>${p}</option>`).join('')}
                </select>
            </div>
            <div class="task-detail-field">
                <label>Status</label>
                <select data-task-id="${tid}" onchange="window._pdSaveField('${tid}','status',this.value)">
                    ${Object.keys(STATUS_LABELS).map(s => `<option value="${s}" ${s === task.status ? 'selected' : ''}>${STATUS_LABELS[s]}</option>`).join('')}
                </select>
            </div>
            <div class="task-detail-field">
                <label>Assignee</label>
                <select data-task-id="${tid}" onchange="window._pdSaveField('${tid}','assigned_to',this.value)">
                    <option value="">Unassigned</option>
                    ${team.map(m => {
                        const mid = typeof m === 'string' ? m : m.instanceId || m.id;
                        const mname = typeof m === 'string' ? m.split('-')[0] : m.name || mid.split('-')[0];
                        return `<option value="${mid}" ${mid === (task.assigned_to || task.assignee) ? 'selected' : ''}>${escapeHtml(mname)}</option>`;
                    }).join('')}
                </select>
            </div>
        </div>
        <div class="task-detail-actions">
            ${!task.assigned_to && !task.assignee ? `<button class="btn-action" onclick="window._pdClaimTask('${tid}')">Claim</button>` : ''}
            ${!isCompleted && !isVerified ? `<button class="btn-action" onclick="window._pdCompleteTask('${tid}')">Complete</button>` : ''}
            ${isCompleted && !isAssignee ? `<button class="btn-action" onclick="window._pdVerifyTask('${tid}')">Verify</button>` : ''}
            ${isCompleted && isAssignee ? `<button class="btn-action btn-disabled" disabled title="Cannot verify own task">Verify</button>` : ''}
        </div>
    </div>`;
}

function renderTeamSection(project) {
    const team = project.team || [];
    const isExpanded = expandedSections.has('team');
    const pmId = project.pm;
    // Sort PM first
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
    const vitalDocs = state.currentProject?.vitalDocuments || [];
    return `
    <div class="section-collapse" data-section="documents">
        <div class="section-collapse-header" onclick="window._pdToggleSection('documents')">
            <span class="chevron ${isExpanded ? 'expanded' : ''}">&rsaquo;</span> Documents (${projectDocuments.length})
        </div>
        <div class="section-collapse-body" style="display:${isExpanded ? 'block' : 'none'}">
            ${projectDocuments.length > 0 ? projectDocuments.map(doc => {
                const docName = typeof doc === 'string' ? doc : doc.name;
                const isVital = vitalDocs.includes(docName);
                return `
                <div class="document-item" data-doc="${escapeHtml(docName)}" onclick="window._pdViewDocument('${escapeHtml(docName)}')">
                    ${isVital ? '<span class="vital-star" title="Vital document">&#9733;</span>' : '<span class="doc-icon">&#128196;</span>'}
                    <span class="document-name">${escapeHtml(docName)}</span>
                </div>`;
            }).join('') : '<p class="empty-placeholder">No documents</p>'}
            <button class="inline-form-btn" onclick="window._pdCreateDocument('${projectId}')">+ Add Document</button>
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
    // Close priority popover on outside click
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
        createInlineTask(title, listId, projectId, e.target);
    }
    if (e.key === 'Escape' && e.target.classList.contains('task-create-input')) {
        e.target.value = '';
        e.target.blur();
    }
}

async function createInlineTask(title, listId, projectId, inputEl) {
    try {
        await api.createTask({ instanceId: state.instanceId, title, projectId, listId, priority: 'medium' });
        inputEl.value = '';
        showToast('Task created', 'success');
        // Refresh tasks
        const result = await api.listTasks(state.instanceId, { projectId, limit: 200, full_detail: true });
        const tasks = result.tasks || [];
        projectTasks = {};
        tasks.forEach(t => {
            const lid = t.listId || t.list || 'default';
            if (!projectTasks[lid]) projectTasks[lid] = [];
            projectTasks[lid].push(t);
        });
        renderProjectDetail(state.currentProject, tasks);
        // Re-focus the input in the same list
        setTimeout(() => {
            const newInput = document.querySelector(`.task-create-input[data-list-id="${listId}"]`);
            if (newInput) newInput.focus();
        }, 50);
    } catch (err) {
        showToast('Failed to create task: ' + err.message, 'error');
    }
}

// One-touch status cycling
window._pdCycleStatus = async function(event, taskId) {
    event.stopPropagation();
    const task = findTask(taskId);
    if (!task) return;
    const currentIdx = STATUS_CYCLE.indexOf(task.status);
    const newStatus = STATUS_CYCLE[(currentIdx + 1) % STATUS_CYCLE.length];
    const oldStatus = task.status;

    // Optimistic update
    task.status = newStatus;
    const badge = event.target;
    badge.textContent = STATUS_LABELS[newStatus];
    badge.className = `status-badge status-${newStatus}`;

    try {
        if (newStatus === 'completed') {
            await api.markTaskComplete(state.instanceId, taskId);
        } else {
            await api.updateTask(state.instanceId, taskId, { status: newStatus });
        }
    } catch (err) {
        task.status = oldStatus;
        badge.textContent = STATUS_LABELS[oldStatus];
        badge.className = `status-badge status-${oldStatus}`;
        showToast('Failed to update status', 'error');
    }
};

// Priority popover
window._pdPriorityPopover = function(event, taskId) {
    event.stopPropagation();
    document.querySelectorAll('.priority-popover').forEach(p => p.remove());
    const rect = event.target.getBoundingClientRect();
    const popover = document.createElement('div');
    popover.className = 'priority-popover';
    popover.style.position = 'fixed';
    popover.style.left = rect.left + 'px';
    popover.style.top = (rect.bottom + 4) + 'px';
    popover.style.zIndex = '1000';
    popover.innerHTML = PRIORITIES.map(p => `<div class="priority-option" data-priority="${p}" onclick="window._pdSetPriority('${taskId}','${p}')"><span class="priority-dot priority-dot-${p}"></span> ${p}</div>`).join('');
    document.body.appendChild(popover);
};

window._pdSetPriority = async function(taskId, priority) {
    document.querySelectorAll('.priority-popover').forEach(p => p.remove());
    const task = findTask(taskId);
    if (!task) return;
    const old = task.priority;
    task.priority = priority;
    const dot = document.querySelector(`.priority-dot[data-task-id="${taskId}"]`);
    if (dot) dot.className = `priority-dot priority-dot-${priority}`;
    try {
        await api.updateTask(state.instanceId, taskId, { priority });
    } catch (err) {
        task.priority = old;
        if (dot) dot.className = `priority-dot priority-dot-${old}`;
        showToast('Failed to update priority', 'error');
    }
};

window._pdExpandTask = function(taskId) {
    expandedTaskId = expandedTaskId === taskId ? null : taskId;
    const allTasks = Object.values(projectTasks).flat();
    renderProjectDetail(state.currentProject, allTasks);
};

window._pdSaveField = async function(taskId, field, value) {
    try {
        await api.updateTask(state.instanceId, taskId, { [field]: value });
        const task = findTask(taskId);
        if (task) task[field] = value;
    } catch (err) {
        showToast('Failed to save: ' + err.message, 'error');
    }
};

window._pdClaimTask = async function(taskId) {
    try {
        await api.takeOnTask(state.instanceId, taskId);
        showToast('Task claimed', 'success');
        refreshProjectTasks();
    } catch (err) { showToast('Failed to claim: ' + err.message, 'error'); }
};

window._pdCompleteTask = async function(taskId) {
    try {
        await api.markTaskComplete(state.instanceId, taskId);
        showToast('Task completed', 'success');
        refreshProjectTasks();
    } catch (err) { showToast('Failed: ' + err.message, 'error'); }
};

window._pdVerifyTask = async function(taskId) {
    try {
        await api.markTaskVerified(state.instanceId, taskId);
        showToast('Task verified', 'success');
        refreshProjectTasks();
    } catch (err) { showToast('Failed: ' + err.message, 'error'); }
};

window._pdToggleList = function(listId) {
    if (expandedLists.has(listId)) expandedLists.delete(listId);
    else expandedLists.add(listId);
    const section = document.querySelector(`.task-list-section[data-list-id="${listId}"]`);
    if (!section) return;
    const body = section.querySelector('.task-list-body');
    const chev = section.querySelector('.chevron');
    if (body) body.style.display = expandedLists.has(listId) ? 'block' : 'none';
    if (chev) chev.classList.toggle('expanded', expandedLists.has(listId));
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

window._pdToggleCompleted = function(btn, listId) {
    const section = btn.closest('.task-list-body');
    const container = section.querySelector('.task-list-completed');
    if (container) {
        const showing = container.style.display !== 'none';
        container.style.display = showing ? 'none' : 'block';
        btn.textContent = showing ? `Show completed` : 'Hide completed';
    }
};

window._pdCreateList = async function(projectId) {
    const name = prompt('New list name:');
    if (!name || !name.trim()) return;
    try {
        await api.createTaskList(state.instanceId, name.trim(), projectId);
        showToast('List created', 'success');
        expandedLists.add(name.trim());
        refreshProjectTasks();
    } catch (err) { showToast('Failed: ' + err.message, 'error'); }
};

window._pdCycleProjectStatus = function(el) {
    // Only for Executive role
    showToast('Project status change not yet implemented', 'info');
};

window._pdShowInstance = function(instanceId) {
    if (window.showInstanceDetail) window.showInstanceDetail(instanceId);
};

window._pdViewDocument = async function(docName) {
    const projectId = state.currentProjectDetail;
    try {
        const result = await api.readDocument(state.instanceId, docName, `project:${projectId}`);
        const content = result.content || result.document || 'Empty document';
        // Show inline in a simple overlay
        const overlay = document.createElement('div');
        overlay.className = 'document-overlay';
        overlay.innerHTML = `
            <div class="document-viewer">
                <div class="document-viewer-header">
                    <h3>${escapeHtml(docName)}</h3>
                    <button onclick="this.closest('.document-overlay').remove()">&times;</button>
                </div>
                <pre class="document-viewer-content">${escapeHtml(content)}</pre>
            </div>`;
        document.body.appendChild(overlay);
        overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
    } catch (err) { showToast('Failed to load document: ' + err.message, 'error'); }
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
// HELPERS
// ============================================================================

function findTask(taskId) {
    for (const tasks of Object.values(projectTasks)) {
        const t = tasks.find(t => (t.taskId || t.id) === taskId);
        if (t) return t;
    }
    return null;
}

async function refreshProjectTasks() {
    const projectId = state.currentProjectDetail;
    if (!projectId) return;
    try {
        const result = await api.listTasks(state.instanceId, { projectId, limit: 200, full_detail: true });
        const tasks = result.tasks || [];
        projectTasks = {};
        tasks.forEach(t => {
            const lid = t.listId || t.list || 'default';
            if (!projectTasks[lid]) projectTasks[lid] = [];
            projectTasks[lid].push(t);
        });
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
    // Legacy compat - called from app.js
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
