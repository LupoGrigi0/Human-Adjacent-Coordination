/**
 * Projects Module - v2 with all 24 feedback items
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
let projectTasks = {};
let projectDocuments = [];
let projectVision = null;
let onlineInstances = new Set();
let chatPollInterval = null;
let showCompletedLists = new Set(); // which lists show completed tasks
let vitalDocuments = new Set(); // vital doc names

const STATUSES = ['not_started', 'in_progress', 'blocked', 'completed', 'completed_verified', 'archived'];
const PRIORITIES = ['emergency', 'critical', 'high', 'medium', 'low', 'whenever'];
const PRIORITY_COLORS = { emergency: '#ef4444', critical: '#ef4444', high: '#f97316', medium: '#3b82f6', low: '#6b7280', whenever: '#a78bfa' };
const STATUS_LABELS = { not_started: 'Not Started', in_progress: 'In Progress', blocked: 'Blocked', completed: 'Completed', completed_verified: 'Verified', archived: 'Archived' };
const STATUS_ICONS = { not_started: '\u25CB', in_progress: '\u25D4', blocked: '\u26A0', completed: '\u2714', completed_verified: '\u2714\u2714', archived: '\uD83D\uDCE6' };
const PROJECT_STATUSES = ['active', 'paused', 'archived'];

// ============================================================================
// DROPDOWN UTILITY
// ============================================================================

function showDropdown(anchorEl, options, onSelect) {
    closeAllDropdowns();
    const rect = anchorEl.getBoundingClientRect();
    const dd = document.createElement('div');
    dd.className = 'pd-dropdown';
    dd.style.cssText = `position:fixed; left:${rect.left}px; top:${rect.bottom + 2}px; z-index:1000;`;
    // Ensure dropdown doesn't go off-screen right
    dd.innerHTML = options.map(o =>
        `<div class="pd-dropdown-item${o.selected ? ' selected' : ''}" data-value="${o.value}">${o.icon ? '<span style="margin-right:4px">' + o.icon + '</span>' : ''}${escapeHtml(o.label)}</div>`
    ).join('');
    dd.addEventListener('click', e => {
        const item = e.target.closest('.pd-dropdown-item');
        if (item) { onSelect(item.dataset.value); dd.remove(); }
    });
    document.body.appendChild(dd);
    // Reposition if off-screen
    const ddRect = dd.getBoundingClientRect();
    if (ddRect.right > window.innerWidth) dd.style.left = (window.innerWidth - ddRect.width - 8) + 'px';
    if (ddRect.bottom > window.innerHeight) dd.style.top = (rect.top - ddRect.height - 2) + 'px';
    setTimeout(() => document.addEventListener('click', function handler(e) {
        if (!dd.contains(e.target)) { dd.remove(); document.removeEventListener('click', handler); }
    }), 0);
}

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
    const [presenceResult, tasksResult, docsResult, visionResult, vitalResult] = await Promise.allSettled([
        api.getPresence(),
        api.listTasks(state.instanceId, { projectId, limit: 200, full_detail: true }),
        api.listDocuments(state.instanceId, `project:${projectId}`),
        api.readDocument(state.instanceId, 'PROJECT_VISION.md', `project:${projectId}`),
        api.listVitalDocuments(state.instanceId, `project:${projectId}`)
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
    const isExpanded = expandedLists.has(listId);
    const showCompleted = showCompletedLists.has(listId);
    const activeTasks = tasks.filter(t => !['completed', 'completed_verified', 'archived'].includes(t.status));
    const completedTasks = tasks.filter(t => ['completed', 'completed_verified'].includes(t.status));
    const completed = completedTasks.length;
    const pct = tasks.length > 0 ? Math.round(completed / tasks.length * 100) : 0;
    const eyeIcon = showCompleted ? '\uD83D\uDC41' : '\uD83D\uDC41\u200D\uD83D\uDDE8'; // eye vs eye-speech

    return `
    <div class="task-list-section" data-list-id="${listId}">
        <div class="task-list-header">
            <span class="chevron ${isExpanded ? 'expanded' : ''}" onclick="window._pdToggleList('${listId}')">&rsaquo;</span>
            <span class="task-list-name" onclick="window._pdToggleList('${listId}')">${escapeHtml(listId)}</span>
            <span class="task-list-progress-text">${completed}/${tasks.length}</span>
            <div class="progress-bar"><div class="progress-fill" style="width:${pct}%"></div></div>
            <span class="completed-toggle-icon" onclick="event.stopPropagation(); window._pdToggleCompleted('${listId}')" title="${showCompleted ? 'Hide completed' : 'Show completed'}">${showCompleted ? '\uD83D\uDC41' : '\uD83D\uDC41\u200D\uD83D\uDDE8'}</span>
            ${isExpanded ? `<span class="new-task-input-wrap"><span class="new-task-arrow" title="Add with details" onclick="event.stopPropagation()">&#9654;</span><input type="text" class="task-header-input task-create-input" placeholder="New task..." data-list-id="${listId}" data-project-id="${projectId}" onclick="event.stopPropagation()"><span class="new-task-detail-icon" title="Add with details" onclick="event.stopPropagation(); window._pdDetailIcon(this)">&#9998;</span></span>` : ''}
        </div>
        <div class="task-list-body" style="display:${isExpanded ? 'block' : 'none'}">
            <div class="task-list-col-headers">
                <span class="col-header col-header-priority" onclick="window._pdSortTasks('priority')" title="Sort by priority">P${taskSortField === 'priority' ? (taskSortReverse ? ' \u25B2' : ' \u25BC') : ''}</span>
                <span class="col-header col-header-title" onclick="window._pdSortTasks('title')" title="Sort by title">Title${taskSortField === 'title' ? (taskSortReverse ? ' \u25B2' : ' \u25BC') : ''}</span>
                <span class="col-header col-header-status" onclick="window._pdSortTasks('status')" title="Sort by status">Status${taskSortField === 'status' ? (taskSortReverse ? ' \u25B2' : ' \u25BC') : ''}</span>
                <span class="col-header col-header-assignee" onclick="window._pdSortTasks('assignee')" title="Sort by assignee">Who${taskSortField === 'assignee' ? (taskSortReverse ? ' \u25B2' : ' \u25BC') : ''}</span>
                <span class="col-header col-header-dates" onclick="window._pdSortTasks('created')" title="Sort by date created">\uD83D\uDCC5${taskSortField === 'created' ? (taskSortReverse ? '\u25B2' : '\u25BC') : ''}</span>
                <span class="col-header col-header-dates" onclick="window._pdSortTasks('updated')" title="Sort by last updated">\uD83D\uDD04${taskSortField === 'updated' ? (taskSortReverse ? '\u25B2' : '\u25BC') : ''}</span>
            </div>
            ${activeTasks.map(t => renderTaskRow(t)).join('')}
            ${showCompleted ? completedTasks.map(t => renderTaskRow(t)).join('') : ''}
        </div>
    </div>`;
}

function renderTaskRow(task) {
    const tid = task.id || task.taskId;
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
            <span class="status-badge status-${status}" data-task-id="${tid}" onclick="window._pdStatusDropdown(event, '${tid}')" title="${STATUS_LABELS[status] || status}">${STATUS_LABELS[status] || status}</span>
            ${assigneeLabel
                ? `<span class="task-assignee-avatar" data-task-id="${tid}" onclick="window._pdAssigneeDropdown(event, '${tid}')" title="${escapeHtml(assignee)}">${escapeHtml(assigneeLabel.charAt(0).toUpperCase())}</span>`
                : `<span class="task-assignee-avatar task-assignee-empty" data-task-id="${tid}" onclick="window._pdAssigneeDropdown(event, '${tid}')" title="Assign">?</span>`
            }
        </div>`;

    if (isExpanded) row += renderTaskExpanded(task);
    row += '</div>';
    return row;
}

function renderTaskExpanded(task) {
    const tid = task.id || task.taskId;
    const isAssignee = task.assigned_to === state.instanceId || task.assignee === state.instanceId;
    const isCompleted = task.status === 'completed';
    const isVerified = task.status === 'completed_verified';

    return `
    <div class="task-detail-inline">
        <div class="task-detail-field">
            <label>Title</label>
            <input type="text" class="task-detail-title-input" data-task-id="${tid}" value="${escapeHtml(task.title || '')}" onblur="window._pdSaveField('${tid}','title',this.value)">
        </div>
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
                    ${STATUSES.map(s => `<option value="${s}" ${s === task.status ? 'selected' : ''}>${STATUS_LABELS[s]}</option>`).join('')}
                </select>
            </div>
            <div class="task-detail-field">
                <label>Assignee</label>
                <select data-task-id="${tid}" onchange="window._pdSaveField('${tid}','assigned_to',this.value)">
                    <option value="">Unassigned</option>
                    ${(state.currentProject?.team || []).map(m => {
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
            ${isVerified ? `<button class="btn-action" onclick="window._pdArchiveTask('${tid}')">Archive</button>` : ''}
        </div>
    </div>`;
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
    if (taskSortField === field) {
        taskSortReverse = !taskSortReverse;
    } else {
        taskSortField = field;
        taskSortReverse = false;
    }
    // Re-sort all lists
    const priorityOrder = { emergency: 0, critical: 1, high: 2, medium: 3, low: 4, whenever: 5 };
    const statusOrder = { not_started: 0, in_progress: 1, blocked: 2, completed: 3, completed_verified: 4, archived: 5 };
    for (const [lid, tasks] of Object.entries(projectTasks)) {
        tasks.sort((a, b) => {
            let cmp = 0;
            if (field === 'priority') {
                cmp = (priorityOrder[a.priority] || 3) - (priorityOrder[b.priority] || 3);
            } else if (field === 'status') {
                cmp = (statusOrder[a.status] || 0) - (statusOrder[b.status] || 0);
            } else if (field === 'title') {
                cmp = (a.title || '').localeCompare(b.title || '');
            } else if (field === 'created') {
                cmp = new Date(a.created || 0) - new Date(b.created || 0);
            } else if (field === 'updated') {
                cmp = new Date(a.updated || 0) - new Date(b.updated || 0);
            } else if (field === 'assignee') {
                cmp = (a.assigned_to || '').localeCompare(b.assigned_to || '');
            }
            return taskSortReverse ? -cmp : cmp;
        });
    }
    const allTasks = Object.values(projectTasks).flat();
    renderProjectDetail(state.currentProject, allTasks);
};

// ============================================================================
// HELPERS
// ============================================================================

function findTask(taskId) {
    for (const tasks of Object.values(projectTasks)) {
        const t = tasks.find(t => (t.id || t.taskId) === taskId);
        if (t) return t;
    }
    return null;
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
