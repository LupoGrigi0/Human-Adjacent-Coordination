/**
 * Instance Detail Panel
 *
 * Full instance detail view with dynamic rendering, collapsible sections,
 * dropdown utilities, and sticky header. Follows the same pattern as projects.js.
 *
 * Reuses existing CSS from project-detail classes. No new CSS file needed.
 * Uses the existing #instance-detail-view element from index.html, clearing its
 * innerHTML and rendering dynamically (same approach as project-detail-view).
 *
 * @module instance-detail
 */

import { state } from './state.js';
import { escapeHtml, showToast, formatRelativeTime, formatDateTime } from './utils.js';
import api from './api.js';
import { ensureApiKey } from './instances.js';
import {
    STATUSES, PRIORITIES, PRIORITY_COLORS, STATUS_LABELS, STATUS_ICONS,
    PRIORITY_ORDER, STATUS_ORDER,
    showDropdown, renderTaskListHTML, renderTaskRowHTML, renderTaskExpandedHTML,
    renderChecklistHTML, sortTasksInPlace, findTaskById,
    renderGoalsSectionHTML, GOAL_STATUS_LABELS, GOAL_STATUS_COLORS, GOAL_STATUS_ICONS
} from './shared-tasks.js';

// ============================================================================
// MODULE STATE
// ============================================================================

let expandedSections = new Set(['tasks', 'lists']);
let instanceData = null;
let instanceTasks = {};       // { listId: [task, ...] }
let instanceLists = [];       // checklist summaries
let instanceListItems = {};   // { listId: [item, ...] }
let instanceDocuments = [];
let instanceGoals = [];       // full goal objects with criteria
let availableRoles = [];
let availablePersonalities = [];
let availableProjects = [];
let expandedTaskId = null;
let expandedListIds = new Set();
let showCompletedLists = new Set();
let taskSortField = null;
let taskSortReverse = false;
let isOnline = false;

// Constants and showDropdown imported from shared-tasks.js

// ============================================================================
// ENTRY POINTS
// ============================================================================

export async function showInstanceDetail(targetInstanceId) {
    state.currentInstanceDetail = targetInstanceId;
    expandedSections = new Set(['tasks', 'lists']);
    instanceData = null; instanceTasks = {}; instanceLists = [];
    instanceListItems = {}; instanceDocuments = []; instanceGoals = [];
    expandedTaskId = null; expandedListIds = new Set();
    showCompletedLists = new Set();
    taskSortField = null; taskSortReverse = false;

    const grid = document.getElementById('instances-grid');
    if (grid) grid.style.display = 'none';
    const pageHeader = document.querySelector('#tab-instances .page-header');
    if (pageHeader) pageHeader.style.display = 'none';

    const detailView = document.getElementById('instance-detail-view');
    detailView.style.display = 'flex';
    detailView.className = 'project-detail-panel';
    detailView.innerHTML = '<div class="loading-placeholder">Loading instance...</div>';

    const [detailR, tasksR, listsR, docsR, rolesR, persR, projR, presR, goalsR] = await Promise.allSettled([
        api.getInstanceDetails(state.instanceId, targetInstanceId),
        api.listTasks(targetInstanceId, { limit: 200, full_detail: true }),
        api.getLists(state.instanceId, targetInstanceId),
        api.listDocuments(state.instanceId, `instance:${targetInstanceId}`),
        api.getRoles(),
        api.getPersonalities(),
        api.listProjects(),
        api.getPresence(),
        api.listPersonalGoals(state.instanceId, targetInstanceId)
    ]);

    instanceData = detailR.status === 'fulfilled'
        ? (detailR.value.instance || detailR.value)
        : (state.instances.find(i => i.instanceId === targetInstanceId) || { instanceId: targetInstanceId });

    if (tasksR.status === 'fulfilled') {
        (tasksR.value.tasks || []).forEach(t => {
            const lid = t.listId || t.list || 'default';
            if (!instanceTasks[lid]) instanceTasks[lid] = [];
            instanceTasks[lid].push(t);
        });
    }
    if (listsR.status === 'fulfilled') instanceLists = listsR.value.lists || [];
    if (docsR.status === 'fulfilled') instanceDocuments = docsR.value.documents || [];
    if (rolesR.status === 'fulfilled') availableRoles = rolesR.value.roles || [];
    if (persR.status === 'fulfilled') availablePersonalities = persR.value.personalities || [];
    if (projR.status === 'fulfilled') availableProjects = projR.value.projects || [];

    // Process goals — fetch full criteria for each summary
    instanceGoals = [];
    if (goalsR.status === 'fulfilled') {
        const summaries = goalsR.value.goals || [];
        const fullGoals = await Promise.all(
            summaries.map(g => api.getGoal(state.instanceId, g.id).then(r => r.goal).catch(() => g))
        );
        instanceGoals = fullGoals;
    }

    isOnline = false;
    if (presR.status === 'fulfilled') {
        const users = presR.value.users || presR.value.onlineUsers || [];
        const set = new Set(users.map(u => typeof u === 'string' ? u : u.instanceId || u.jid?.split('@')[0]));
        isOnline = set.has(targetInstanceId);
    }

    renderInstanceDetail();
}

export function hideInstanceDetail() {
    const v = document.getElementById('instance-detail-view');
    if (v) { v.style.display = 'none'; v.className = 'instance-detail-view'; }
    const grid = document.getElementById('instances-grid');
    if (grid) grid.style.display = 'grid';
    const ph = document.querySelector('#tab-instances .page-header');
    if (ph) ph.style.display = 'flex';
    state.currentInstanceDetail = null;
}

// ============================================================================
// RENDER
// ============================================================================

function renderInstanceDetail() {
    const detailView = document.getElementById('instance-detail-view');
    if (!detailView || !instanceData) return;

    const inst = instanceData;
    const prefs = inst.preferences || {};
    const displayName = inst.name || inst.instanceId || 'Unknown';
    const role = inst.role || prefs.role || '';
    const personality = inst.personality || prefs.personality || '';
    const project = inst.project || prefs.project || '';
    const lastActive = inst.lastActiveAt ? formatRelativeTime(inst.lastActiveAt) : '';
    const homeDir = inst.homeDirectory || prefs.homeDirectory || '';
    const runtime = inst.runtime || prefs.runtime || null;
    const zeroclaw = inst.zeroclaw || prefs.zeroclaw || null;
    const rtReady = runtime?.ready || inst.zeroclaw_ready || prefs.zeroclaw_ready || inst.interface === 'zeroclaw';
    const rtType = runtime?.type || (zeroclaw ? 'zeroclaw' : null);

    const allTasks = Object.values(instanceTasks).flat();
    const done = allTasks.filter(t => ['completed', 'completed_verified', 'archived'].includes(t.status)).length;
    const taskListIds = Object.keys(instanceTasks);
    if (!taskListIds.length) taskListIds.push('default');

    detailView.innerHTML = `
    <div class="project-detail-header">
        <div class="project-detail-header-top">
            <button class="back-btn" onclick="window._idHide()">&larr; Instances</button>
            <div class="project-detail-header-title" style="align-items:center">
                <span class="team-card-avatar" style="width:36px;height:36px;font-size:1.1rem;margin-right:8px">${escapeHtml(displayName.charAt(0).toUpperCase())}</span>
                <div>
                    <h2 class="pd-project-name" onclick="window._idRename(this)" title="Click to rename">${escapeHtml(displayName)}</h2>
                    <span style="font-size:0.7rem;color:var(--text-muted)">${escapeHtml(inst.instanceId || '')}</span>
                </div>
                <span class="status-badge" style="background:rgba(99,102,241,0.15);color:#818cf8;cursor:pointer" onclick="window._idRoleDD(event)" title="Change role">${escapeHtml(role || 'no role')}</span>
                <span class="status-badge" style="background:rgba(168,85,247,0.15);color:#c084fc;cursor:pointer" onclick="window._idPersonaDD(event)" title="Change personality">${escapeHtml(personality || '+ persona')}</span>
                <span class="online-dot ${isOnline ? 'online' : ''}" title="${isOnline ? 'Online' : 'Offline'}" style="margin-left:2px"></span>
            </div>
            <button class="pd-settings-btn" onclick="window._idPrefs()" title="Preferences">&#9881;</button>
        </div>
        <div class="project-detail-header-meta">
            <span style="cursor:pointer" onclick="window._idProjectDD(event)" title="Change project">Project: <strong>${escapeHtml(project || 'none')}</strong></span>
            <span>${done}/${allTasks.length} tasks</span>
            ${lastActive ? `<span>${escapeHtml(lastActive)}</span>` : ''}
            ${homeDir ? `<span style="max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;display:inline-block" title="${escapeHtml(homeDir)}">${escapeHtml(homeDir)}</span>` : ''}
        </div>
    </div>
    <div class="project-detail-body">
        <div class="project-detail-main">
            ${(runtime || zeroclaw || rtReady) ? renderRuntimeSection(runtime, zeroclaw, rtReady, rtType) : ''}
            ${renderGoalsSection()}
            ${renderTasksSection(taskListIds)}
            ${renderListsSection()}
        </div>
        <div class="project-detail-sidebar">
            ${renderDocsSection()}
        </div>
    </div>`;

    bindListInputs();
    bindGoalInputs();
}

// ============================================================================
// SECTION RENDERERS
// ============================================================================

function renderRuntimeSection(rt, zc, rtReady, rtType) {
    const isExp = expandedSections.has('runtime');
    const live = rt?.enabled || zc?.enabled || zc?.running;
    const webUrl = rt?.webUrl || zc?.webUrl || zc?.web_url || '';
    const provider = rt?.provider || zc?.provider || '';
    const model = rt?.model || zc?.model || '';
    const type = rtType || 'unknown';
    const icon = type === 'openfang' ? '&#129463;' : '&#128640;';
    const label = type === 'openfang' ? 'OpenFang' : 'ZeroClaw';
    let content;
    if (live) {
        content = `<div style="display:flex;flex-direction:column;gap:6px;font-size:0.8125rem">
            <div><span style="color:#22c55e">${icon}</span> <strong>Live</strong>${provider ? ` &mdash; ${escapeHtml(provider)}${model ? ' / ' + escapeHtml(model) : ''}` : ''}</div>
            ${webUrl ? `<a href="${escapeHtml(webUrl)}" target="_blank" class="btn-action" style="text-align:center">Open Dashboard &#8599;</a>` : ''}
            <button class="btn-action" onclick="window._idLandZc()">&#128907; Land</button>
        </div>`;
    } else if (rtReady) {
        content = `<div style="display:flex;flex-direction:column;gap:6px;font-size:0.8125rem">
            <div>${icon} <strong>Ready</strong> &mdash; Not running</div>
            <button class="btn-action" onclick="window._idLaunchZc()">&#128640; Launch</button>
        </div>`;
    } else {
        content = `<p class="empty-placeholder">Not configured for ${label}</p>`;
    }
    return `
    <div class="section-collapse" data-section="runtime">
        <div class="section-collapse-header" onclick="window._idToggleSec('runtime')">
            <span class="chevron ${isExp ? 'expanded' : ''}">&rsaquo;</span> Runtime
            <span style="margin-left:6px;font-size:0.75rem;color:${live ? 'var(--success-color)' : 'var(--text-muted)'}">${live ? label + ' LIVE' : rtReady ? label + ' ready' : ''}</span>
        </div>
        <div class="section-collapse-body" style="display:${isExp ? 'block' : 'none'}">${content}</div>
    </div>`;
}

function renderGoalsSection() {
    if (!instanceGoals.length && !expandedSections.has('goals')) {
        // Still show the section so goals can be created
    }
    const isExp = expandedSections.has('goals') || instanceGoals.length > 0;
    const goalsHTML = renderGoalsSectionHTML(instanceGoals, {
        prefix: '_id',
        title: 'Goals',
        showCreate: true,
        showStatus: true,
        expanded: instanceGoals.length <= 3
    });
    return `
    <div class="section-collapse" data-section="goals">
        <div class="section-collapse-header" onclick="window._idToggleSec('goals')">
            <span class="chevron ${isExp ? 'expanded' : ''}">&rsaquo;</span> Goals (${instanceGoals.length})
        </div>
        <div class="section-collapse-body" style="display:${isExp ? 'block' : 'none'}">
            ${goalsHTML}
        </div>
    </div>`;
}

function renderTasksSection(listIds) {
    const isExp = expandedSections.has('tasks');
    const total = Object.values(instanceTasks).flat().length;
    return `
    <div class="section-collapse" data-section="tasks">
        <div class="section-collapse-header" onclick="window._idToggleSec('tasks')">
            <span class="chevron ${isExp ? 'expanded' : ''}">&rsaquo;</span> Personal Tasks (${total})
            <span class="section-header-actions">
                <button class="section-add-btn" onclick="event.stopPropagation();window._idCreateTaskList()" title="New task list">+</button>
            </span>
        </div>
        <div class="section-collapse-body" style="display:${isExp ? 'block' : 'none'}">
            ${listIds.map(lid => renderTaskList(lid, instanceTasks[lid] || [])).join('')}
        </div>
    </div>`;
}

function renderTaskList(listId, tasks) {
    const key = 'tl-' + listId;
    return renderTaskListHTML(listId, tasks, {
        prefix: '_id',
        expanded: expandedSections.has(key) || (listId === 'default' && tasks.length > 0),
        showCompleted: showCompletedLists.has(listId),
        sortField: taskSortField,
        sortReverse: taskSortReverse,
        expandedTaskId,
        columns: ['priority', 'title', 'status'],
        inputClass: 'id-task-input',
    });
}

function renderListsSection() {
    const isExp = expandedSections.has('lists');
    return `
    <div class="section-collapse" data-section="lists">
        <div class="section-collapse-header" onclick="window._idToggleSec('lists')">
            <span class="chevron ${isExp ? 'expanded' : ''}">&rsaquo;</span> Checklists (${instanceLists.length})
            <span class="section-header-actions"><button class="section-add-btn" onclick="event.stopPropagation();window._idNewList()" title="New checklist">+</button></span>
        </div>
        <div class="section-collapse-body" style="display:${isExp ? 'block' : 'none'}">
            ${!instanceLists.length ? '<p class="empty-placeholder">No checklists</p>' : instanceLists.map(list => renderChecklist(list)).join('')}
        </div>
    </div>`;
}

function renderChecklist(list) {
    const listId = list.id || list.listId || list.name;
    return renderChecklistHTML(list, instanceListItems[listId] || [], {
        prefix: '_id',
        expanded: expandedListIds.has(listId),
        inputClass: 'id-list-add',
    });
}

function renderDocsSection() {
    const isExp = expandedSections.has('docs');
    return `
    <div class="section-collapse" data-section="docs">
        <div class="section-collapse-header" onclick="window._idToggleSec('docs')">
            <span class="chevron ${isExp ? 'expanded' : ''}">&rsaquo;</span> Documents (${instanceDocuments.length})
            <span class="section-header-actions"><button class="section-add-btn" onclick="event.stopPropagation();window._idNewDoc()" title="New document">+</button></span>
        </div>
        <div class="section-collapse-body" style="display:${isExp ? 'block' : 'none'}">
            ${!instanceDocuments.length ? '<p class="empty-placeholder">No documents</p>' : instanceDocuments.map(doc => {
                const name = typeof doc === 'string' ? doc : doc.name;
                return `<div class="document-item"><span class="document-name" onclick="window._idViewDoc('${escapeHtml(name)}')">${escapeHtml(name)}</span></div>`;
            }).join('')}
        </div>
    </div>`;
}

// ============================================================================
// JSON VIEWER (mirrors projects.js)
// ============================================================================

function renderJsonViewer(container, obj, collapsed = []) {
    if (!obj || typeof obj !== 'object') { container.textContent = String(obj); return; }
    const entries = Array.isArray(obj) ? obj.map((v, i) => [String(i), v]) : Object.entries(obj);
    entries.forEach(([key, value]) => {
        const row = document.createElement('div');
        row.className = 'json-viewer-row';
        if (value !== null && typeof value === 'object') {
            const isArr = Array.isArray(value);
            const c = collapsed.includes(key);
            row.innerHTML = `<span class="json-viewer-toggle ${c ? '' : 'open'}">${c ? '\u25B6' : '\u25BC'}</span><span class="json-viewer-key">"${escapeHtml(key)}"</span>: <span class="json-viewer-type">${isArr ? `Array(${value.length})` : `Object(${Object.keys(value).length})`}</span>`;
            const ch = document.createElement('div');
            ch.className = 'json-viewer-children';
            ch.style.display = c ? 'none' : 'block';
            renderJsonViewer(ch, value, collapsed);
            row.querySelector('.json-viewer-toggle').addEventListener('click', () => {
                const open = ch.style.display !== 'none';
                ch.style.display = open ? 'none' : 'block';
                row.querySelector('.json-viewer-toggle').textContent = open ? '\u25B6' : '\u25BC';
            });
            container.appendChild(row); container.appendChild(ch);
        } else {
            const v = value === null ? 'null' : typeof value === 'string' ? `"${escapeHtml(value)}"` : String(value);
            row.innerHTML = `<span class="json-viewer-key">"${escapeHtml(key)}"</span>: <span class="json-viewer-value json-viewer-${value === null ? 'null' : typeof value}">${v}</span>`;
            container.appendChild(row);
        }
    });
}

// ============================================================================
// HELPERS
// ============================================================================

function findTask(tid) {
    return findTaskById(instanceTasks, tid);
}

function reRenderTasks() {
    const body = document.querySelector('[data-section="tasks"] .section-collapse-body');
    if (!body) return;
    const listIds = Object.keys(instanceTasks);
    if (!listIds.length) listIds.push('default');
    body.innerHTML = listIds.map(lid => renderTaskList(lid, instanceTasks[lid] || [])).join('');
    bindListInputs();
}

function reRenderLists() {
    const body = document.querySelector('[data-section="lists"] .section-collapse-body');
    if (!body) return;
    body.innerHTML = !instanceLists.length ? '<p class="empty-placeholder">No checklists</p>' : instanceLists.map(list => renderChecklist(list)).join('');
    bindListInputs();
}

function bindListInputs() {
    document.querySelectorAll('.id-list-add').forEach(input => {
        input.addEventListener('keydown', e => {
            if (e.key !== 'Enter') return;
            const text = e.target.value.trim();
            const lid = e.target.dataset.listId;
            if (text && lid) { e.target.value = ''; window._idAddItem(lid, text); }
        });
    });
    document.querySelectorAll('.id-task-input').forEach(input => {
        input.addEventListener('keydown', e => {
            if (e.key !== 'Enter') return;
            const title = e.target.value.trim();
            const lid = e.target.dataset.listId;
            if (title) { e.target.value = ''; window._idQuickTask(title, lid); }
        });
    });
}

async function refreshTasks() {
    const tid = state.currentInstanceDetail;
    if (!tid) return;
    try {
        const r = await api.listTasks(tid, { limit: 200, full_detail: true });
        instanceTasks = {};
        (r.tasks || []).forEach(t => {
            const lid = t.listId || t.list || 'default';
            if (!instanceTasks[lid]) instanceTasks[lid] = [];
            instanceTasks[lid].push(t);
        });
        reRenderTasks();
    } catch (err) { showToast('Failed to refresh tasks', 'error'); }
}

// ============================================================================
// WINDOW HANDLERS (all use _id* prefix)
// ============================================================================

window._idHide = function() { hideInstanceDetail(); };

window._idToggleSec = function(name) {
    if (expandedSections.has(name)) expandedSections.delete(name); else expandedSections.add(name);
    const sec = document.querySelector(`.section-collapse[data-section="${name}"]`);
    if (!sec) return;
    const body = sec.querySelector('.section-collapse-body');
    const chev = sec.querySelector('.chevron');
    if (body) body.style.display = expandedSections.has(name) ? 'block' : 'none';
    if (chev) chev.classList.toggle('expanded', expandedSections.has(name));
    if (name === 'lists' && expandedSections.has(name)) bindListInputs();
};

window._idToggleTL = function(listId) {
    const key = 'tl-' + listId;
    if (expandedSections.has(key)) expandedSections.delete(key); else expandedSections.add(key);
    reRenderTasks();
};

window._idToggleCompleted = function(listId) {
    if (showCompletedLists.has(listId)) showCompletedLists.delete(listId);
    else showCompletedLists.add(listId);
    reRenderTasks();
};

window._idExpandTask = function(tid) {
    expandedTaskId = expandedTaskId === tid ? null : tid;
    reRenderTasks();
};

window._idSortTasks = function(field) {
    if (taskSortField === field) taskSortReverse = !taskSortReverse;
    else { taskSortField = field; taskSortReverse = false; }
    for (const tasks of Object.values(instanceTasks)) {
        sortTasksInPlace(tasks, field, taskSortReverse);
    }
    reRenderTasks();
};

window._idStatusDD = function(event, tid) {
    event.stopPropagation();
    const task = findTask(tid);
    if (!task) return;
    showDropdown(event.target, STATUSES.map(s => ({ value: s, label: STATUS_LABELS[s], icon: STATUS_ICONS[s], selected: s === task.status })), async (s) => {
        const old = task.status; task.status = s;
        try {
            const callerId = state.currentInstanceDetail;
            if (s === 'completed') await api.markTaskComplete(callerId, tid);
            else if (s === 'completed_verified') await api.markTaskVerified(callerId, tid);
            else if (s === 'archived') await api.archiveTask(callerId, tid);
            else await api.updateTask(callerId, tid, { status: s });
            showToast('Status updated', 'success');
        } catch (err) { task.status = old; showToast('Failed: ' + err.message, 'error'); }
        reRenderTasks();
    });
};

window._idPriDD = function(event, tid) {
    event.stopPropagation();
    const task = findTask(tid);
    if (!task) return;
    showDropdown(event.target, PRIORITIES.map(p => ({
        value: p, label: p, selected: p === task.priority,
        icon: `<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${PRIORITY_COLORS[p]}"></span>`
    })), async (p) => {
        const old = task.priority; task.priority = p;
        try { await api.updateTask(state.currentInstanceDetail, tid, { priority: p }); }
        catch (err) { task.priority = old; showToast('Failed: ' + err.message, 'error'); }
        reRenderTasks();
    });
};

window._idSaveField = async function(tid, field, value) {
    const task = findTask(tid);
    if (!task) return;
    const old = task[field]; task[field] = value;
    const callerId = state.currentInstanceDetail;
    try {
        if (field === 'status') {
            if (value === 'completed') await api.markTaskComplete(callerId, tid);
            else if (value === 'completed_verified') await api.markTaskVerified(callerId, tid);
            else if (value === 'archived') await api.archiveTask(callerId, tid);
            else await api.updateTask(callerId, tid, { status: value });
        } else { await api.updateTask(callerId, tid, { [field]: value }); }
        showToast('Saved', 'success');
    } catch (err) { task[field] = old; showToast('Failed: ' + err.message, 'error'); }
};

window._idComplete = async function(tid) {
    try { await api.markTaskComplete(state.currentInstanceDetail, tid); const t = findTask(tid); if (t) t.status = 'completed'; showToast('Done', 'success'); reRenderTasks(); }
    catch (err) { showToast('Failed: ' + err.message, 'error'); }
};

window._idArchive = async function(tid) {
    try { await api.archiveTask(state.currentInstanceDetail, tid); const t = findTask(tid); if (t) t.status = 'archived'; showToast('Archived', 'success'); reRenderTasks(); }
    catch (err) { showToast('Failed: ' + err.message, 'error'); }
};

window._idQuickTask = async function(title, listId) {
    const targetId = state.currentInstanceDetail;
    try {
        await api.createTask({ instanceId: targetId, title, listId: listId || 'default', priority: 'medium' });
        showToast('Task created', 'success');
        await refreshTasks();
    } catch (err) { showToast('Failed: ' + err.message, 'error'); }
};

window._idNewTask = function() {
    const t = prompt('New task title:');
    if (t?.trim()) window._idQuickTask(t.trim(), 'default');
};

window._idCreateTaskList = async function() {
    const name = prompt('New task list name:');
    if (!name?.trim()) return;
    try {
        await api.createTaskList(state.currentInstanceDetail, name.trim());
        if (!instanceTasks[name.trim()]) instanceTasks[name.trim()] = [];
        showToast('Task list created', 'success');
        reRenderTasks();
    } catch (err) { showToast('Failed: ' + err.message, 'error'); }
};

// --- Checklists ---

window._idToggleCL = async function(listId) {
    if (expandedListIds.has(listId)) { expandedListIds.delete(listId); reRenderLists(); return; }
    expandedListIds.add(listId);
    if (!instanceListItems[listId]) {
        try { const r = await api.getList(state.instanceId, listId, state.currentInstanceDetail); instanceListItems[listId] = r.items || r.list?.items || []; }
        catch (_) { instanceListItems[listId] = []; }
    }
    reRenderLists();
};

window._idToggleItem = async function(listId, itemId) {
    try {
        await api.toggleListItem(state.instanceId, listId, itemId);
        const items = instanceListItems[listId] || [];
        const item = items.find(i => (i.id || i.itemId) === itemId);
        if (item) item.checked = !item.checked;
        reRenderLists();
    } catch (err) { showToast('Failed: ' + err.message, 'error'); }
};

window._idDelItem = async function(listId, itemId) {
    try {
        await api.deleteListItem(state.instanceId, listId, itemId, state.currentInstanceDetail);
        instanceListItems[listId] = (instanceListItems[listId] || []).filter(i => (i.id || i.itemId) !== itemId);
        reRenderLists();
    } catch (err) { showToast('Failed: ' + err.message, 'error'); }
};

window._idAddItem = async function(listId, text) {
    try {
        await api.addListItem(state.instanceId, listId, text, state.currentInstanceDetail);
        const r = await api.getList(state.instanceId, listId, state.currentInstanceDetail);
        instanceListItems[listId] = r.items || r.list?.items || [];
        reRenderLists();
    } catch (err) { showToast('Failed: ' + err.message, 'error'); }
};

window._idNewList = async function() {
    const name = prompt('New checklist name:');
    if (!name?.trim()) return;
    try {
        await api.createList(state.instanceId, name.trim(), undefined, state.currentInstanceDetail);
        const r = await api.getLists(state.instanceId, state.currentInstanceDetail);
        instanceLists = r.lists || [];
        showToast('Checklist created', 'success'); reRenderLists();
    } catch (err) { showToast('Failed: ' + err.message, 'error'); }
};

// --- Goals ---

function reRenderGoals() {
    const container = document.querySelector('[data-section="goals"] .section-collapse-body');
    if (!container) return;
    container.innerHTML = renderGoalsSectionHTML(instanceGoals, {
        prefix: '_id', title: 'Goals', showCreate: true, showStatus: true,
        expanded: instanceGoals.length <= 3
    });
    bindGoalInputs();
}

async function refreshGoals() {
    const tid = state.currentInstanceDetail;
    try {
        const r = await api.listPersonalGoals(state.instanceId, tid);
        const summaries = r.goals || [];
        instanceGoals = await Promise.all(
            summaries.map(g => api.getGoal(state.instanceId, g.id).then(r2 => r2.goal).catch(() => g))
        );
    } catch (_) { instanceGoals = []; }
    reRenderGoals();
}

function bindGoalInputs() {
    const tid = state.currentInstanceDetail;
    document.querySelectorAll('.goal-create-input').forEach(input => {
        input.addEventListener('keydown', async (e) => {
            if (e.key !== 'Enter' || !input.value.trim()) return;
            try {
                await api.createGoal(state.instanceId, input.value.trim());
                input.value = '';
                await refreshGoals();
            } catch (err) { showToast('Failed: ' + err.message, 'error'); }
        });
    });
    document.querySelectorAll('.goal-add-criteria').forEach(input => {
        input.addEventListener('keydown', async (e) => {
            if (e.key !== 'Enter' || !input.value.trim()) return;
            const goalId = input.dataset.goalId;
            try {
                await api.addCriteria(state.instanceId, goalId, input.value.trim());
                input.value = '';
                await refreshGoals();
            } catch (err) { showToast('Failed: ' + err.message, 'error'); }
        });
    });
}

window._idToggleGoal = function(goalId) {
    const section = document.querySelector(`.goal-section[data-goal-id="${goalId}"]`);
    if (!section) return;
    const body = section.querySelector('.task-list-body');
    const chevron = section.querySelector('.chevron');
    const context = section.querySelector('.goal-context');
    if (body) body.style.display = body.style.display === 'none' ? 'block' : 'none';
    if (chevron) chevron.classList.toggle('expanded');
    if (context) context.style.display = context.style.display === 'none' ? 'block' : 'none';
};

window._idValidateCriteria = async function(goalId, criteriaId) {
    try {
        await api.validateCriteria(state.instanceId, goalId, criteriaId);
        await refreshGoals();
    } catch (err) { showToast('Failed: ' + err.message, 'error'); }
};

window._idGoalStatusMenu = function(el, goalId) {
    const options = ['in_progress', 'achieved', 'exceeded'].map(s => ({
        label: GOAL_STATUS_LABELS[s], value: s, icon: GOAL_STATUS_ICONS[s]
    }));
    showDropdown(el, options, async (status) => {
        try {
            await api.setGoalStatus(state.instanceId, goalId, status);
            await refreshGoals();
        } catch (err) { showToast('Failed: ' + err.message, 'error'); }
    });
};

window._idCreateGoal = async function(btn) {
    const input = btn.parentElement.querySelector('.goal-create-input');
    if (!input || !input.value.trim()) return;
    try {
        await api.createGoal(state.instanceId, input.value.trim());
        input.value = '';
        await refreshGoals();
    } catch (err) { showToast('Failed: ' + err.message, 'error'); }
};

// --- Documents ---

window._idViewDoc = async function(docName) {
    const tid = state.currentInstanceDetail;
    try {
        const r = await api.readDocument(state.instanceId, docName, `instance:${tid}`);
        const content = r.content || r.document || '';
        const overlay = document.createElement('div');
        overlay.className = 'document-overlay';
        overlay.innerHTML = `
            <div class="document-viewer" style="max-width:720px">
                <div class="document-viewer-header">
                    <h3>${escapeHtml(docName)}</h3>
                    <div style="display:flex;gap:8px">
                        <button class="btn-action" onclick="window._idRenameDoc('${escapeHtml(docName)}')">Rename</button>
                        <button class="btn-action" onclick="window._idEditDoc(this)">Edit</button>
                        <button onclick="this.closest('.document-overlay').remove()">&times;</button>
                    </div>
                </div>
                <pre class="document-viewer-content" data-doc="${escapeHtml(docName)}">${escapeHtml(content)}</pre>
            </div>`;
        document.body.appendChild(overlay);
        overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
    } catch (err) { showToast('Failed to load: ' + err.message, 'error'); }
};

window._idEditDoc = function(btn) {
    const pre = btn.closest('.document-viewer').querySelector('.document-viewer-content');
    const ta = document.createElement('textarea');
    ta.className = 'document-viewer-edit'; ta.value = pre.textContent;
    ta.dataset.doc = pre.dataset.doc;
    pre.replaceWith(ta);
    btn.parentElement.innerHTML = `<button class="btn-action" onclick="window._idSaveDoc(this)">Save</button><button class="btn-action" onclick="this.closest('.document-overlay').remove()">Cancel</button>`;
    ta.focus();
};

window._idSaveDoc = async function(btn) {
    const ta = btn.closest('.document-viewer').querySelector('.document-viewer-edit');
    if (!ta) return;
    const tid = state.currentInstanceDetail;
    try {
        await api.editDocument(state.instanceId, ta.dataset.doc, 'replace', { search: '', replacement: ta.value, target: `instance:${tid}` });
        showToast('Saved', 'success');
        const pre = document.createElement('pre');
        pre.className = 'document-viewer-content'; pre.dataset.doc = ta.dataset.doc; pre.textContent = ta.value;
        ta.replaceWith(pre);
        btn.parentElement.innerHTML = `<button class="btn-action" onclick="window._idEditDoc(this)">Edit</button><button onclick="this.closest('.document-overlay').remove()">&times;</button>`;
    } catch (err) { showToast('Failed: ' + err.message, 'error'); }
};

window._idRenameDoc = async function(docName) {
    const newName = prompt('Rename document:', docName);
    if (!newName || newName.trim() === docName) return;
    const tid = state.currentInstanceDetail;
    try {
        await api.renameDocument(state.instanceId, docName, newName.trim(), `instance:${tid}`);
        showToast('Document renamed', 'success');
        document.querySelector('.document-overlay')?.remove();
        const r = await api.listDocuments(state.instanceId, `instance:${tid}`);
        instanceDocuments = r.documents || [];
        const body = document.querySelector('[data-section="docs"] .section-collapse-body');
        if (body) body.innerHTML = renderDocsBody();
    } catch (err) { showToast('Failed: ' + err.message, 'error'); }
};

function renderDocsBody() {
    return !instanceDocuments.length ? '<p class="empty-placeholder">No documents</p>' : instanceDocuments.map(doc => {
        const n = typeof doc === 'string' ? doc : doc.name;
        return `<div class="document-item"><span class="document-name" onclick="window._idViewDoc('${escapeHtml(n)}')">${escapeHtml(n)}</span></div>`;
    }).join('');
}

window._idNewDoc = async function() {
    const name = prompt('Document name (e.g. notes.md):');
    if (!name?.trim()) return;
    const tid = state.currentInstanceDetail;
    try {
        await api.createDocument(state.instanceId, name.trim(), `# ${name.trim()}\n\n`, `instance:${tid}`);
        const r = await api.listDocuments(state.instanceId, `instance:${tid}`);
        instanceDocuments = r.documents || [];
        const body = document.querySelector('[data-section="docs"] .section-collapse-body');
        if (body) body.innerHTML = renderDocsBody();
        showToast('Document created', 'success');
    } catch (err) { showToast('Failed: ' + err.message, 'error'); }
};

// --- Header dropdowns ---

window._idRoleDD = async function(event) {
    event.stopPropagation();
    if (!availableRoles.length) { try { availableRoles = (await api.getRoles()).roles || []; } catch (_) { /* */ } }
    const cur = instanceData?.role || '';
    showDropdown(event.target, availableRoles.map(r => ({ value: r.id || r, label: r.name || r.label || r.id || r, selected: (r.id || r) === cur })), async (roleId) => {
        try { await api.takeOnRole(state.currentInstanceDetail, roleId); if (instanceData) instanceData.role = roleId; event.target.textContent = roleId; showToast('Role updated', 'success'); }
        catch (err) { showToast('Failed: ' + err.message, 'error'); }
    });
};

window._idPersonaDD = async function(event) {
    event.stopPropagation();
    if (!availablePersonalities.length) { try { availablePersonalities = (await api.getPersonalities()).personalities || []; } catch (_) { /* */ } }
    const cur = instanceData?.personality || '';
    showDropdown(event.target, availablePersonalities.map(p => ({ value: p.id || p, label: p.name || p.label || p.id || p, selected: (p.id || p) === cur })), async (pid) => {
        try { await api.adoptPersonality(state.currentInstanceDetail, pid); if (instanceData) instanceData.personality = pid; event.target.textContent = pid; showToast('Personality updated', 'success'); }
        catch (err) { showToast('Failed: ' + err.message, 'error'); }
    });
};

window._idProjectDD = async function(event) {
    event.stopPropagation();
    if (!availableProjects.length) { try { availableProjects = (await api.listProjects()).projects || []; } catch (_) { /* */ } }
    const cur = instanceData?.project || instanceData?.preferences?.project || '';
    const opts = [{ value: '', label: 'None', selected: !cur }, ...availableProjects.map(p => { const id = p.projectId || p.id; return { value: id, label: p.name || id, selected: id === cur }; })];
    showDropdown(event.target, opts, async (pid) => {
        try {
            await api.joinProject(state.currentInstanceDetail, pid || null);
            if (instanceData) instanceData.project = pid;
            const strong = event.target.closest('[onclick]')?.querySelector('strong');
            if (strong) strong.textContent = pid || 'none';
            showToast('Project updated', 'success');
        } catch (err) { showToast('Failed: ' + err.message, 'error'); }
    });
};

// --- Rename ---

window._idRename = function(el) {
    const cur = el.textContent;
    const input = document.createElement('input');
    input.type = 'text'; input.value = cur; input.className = 'task-detail-title-input'; input.style.fontSize = '1.125rem';
    el.replaceWith(input); input.focus(); input.select();
    const finish = async () => {
        const name = input.value.trim() || cur;
        const h2 = document.createElement('h2'); h2.className = 'pd-project-name'; h2.setAttribute('onclick', 'window._idRename(this)'); h2.title = 'Click to rename'; h2.textContent = name;
        input.replaceWith(h2);
        if (name !== cur) {
            try { await api.updateInstance({ instanceId: state.instanceId, targetInstanceId: state.currentInstanceDetail, name }); if (instanceData) instanceData.name = name; showToast('Renamed', 'success'); }
            catch (err) { h2.textContent = cur; showToast('Failed: ' + err.message, 'error'); }
        }
    };
    input.addEventListener('blur', finish);
    input.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); input.blur(); } if (e.key === 'Escape') { input.value = cur; input.blur(); } });
};

// --- Preferences viewer ---

window._idPrefs = function() {
    const inst = instanceData;
    if (!inst) return;
    const SENSITIVE = new Set(['authToken', 'apiKey', 'xmppPassword', 'bearerToken', 'token', 'password']);
    const filterSensitive = (obj) => {
        if (!obj || typeof obj !== 'object') return obj;
        const out = {};
        for (const [k, v] of Object.entries(obj)) {
            if (SENSITIVE.has(k)) continue;
            out[k] = v;
        }
        return out;
    };
    const prefs = filterSensitive(inst.preferences || {});
    const display = { instanceId: inst.instanceId, name: inst.name, role: inst.role, personality: inst.personality, project: inst.project, status: inst.status, homeDirectory: inst.homeDirectory, lastActiveAt: inst.lastActiveAt, preferences: prefs };
    const overlay = document.createElement('div');
    overlay.className = 'document-overlay';
    const uid = 'jv' + Date.now();
    overlay.innerHTML = `<div class="document-viewer" style="max-width:600px"><div class="document-viewer-header"><h3>${escapeHtml(inst.name || inst.instanceId || '')}</h3><button onclick="this.closest('.document-overlay').remove()">&times;</button></div><div class="json-viewer" id="${uid}"></div></div>`;
    document.body.appendChild(overlay);
    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
    renderJsonViewer(document.getElementById(uid), display, ['preferences']);
};

// --- Runtime launch/land ---

window._idLaunchZc = async function() {
    const tid = state.currentInstanceDetail;
    const apiKey = await ensureApiKey();
    if (!apiKey) return;
    // Detect runtime type from instance data
    const inst = instanceData;
    const rt = inst?.runtime || inst?.preferences?.runtime;
    const runtime = rt?.type || (inst?.zeroclaw || inst?.preferences?.zeroclaw ? 'zeroclaw' : 'openfang');
    const label = runtime === 'openfang' ? 'OpenFang' : 'ZeroClaw';
    try {
        await api.launchInstance({ instanceId: state.instanceId, targetInstanceId: tid, runtime, apiKey });
        showToast(`${label} launched`, 'success');
        showInstanceDetail(tid);
    } catch (err) { showToast('Launch failed: ' + err.message, 'error'); }
};

window._idLandZc = async function() {
    const inst = instanceData;
    const rt = inst?.runtime || inst?.preferences?.runtime;
    const runtime = rt?.type || 'zeroclaw';
    const label = runtime === 'openfang' ? 'OpenFang' : 'ZeroClaw';
    if (!confirm(`Land ${label}?`)) return;
    const tid = state.currentInstanceDetail;
    const apiKey = await ensureApiKey();
    if (!apiKey) return;
    try {
        await api.landInstance({ instanceId: state.instanceId, targetInstanceId: tid, runtime, apiKey });
        showToast(`${label} landed`, 'success');
        showInstanceDetail(tid);
    } catch (err) { showToast('Land failed: ' + err.message, 'error'); }
};

// ============================================================================
// EXPORTS
// ============================================================================

// Global reference for cross-module navigation (projects.js uses window.showInstanceDetail)
window.showInstanceDetailPanel = showInstanceDetail;

export default { showInstanceDetail, hideInstanceDetail };
