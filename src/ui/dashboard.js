/**
 * Dashboard v2 — Executive Dashboard
 *
 * Orchestrator module. Calls sub-modules for heatmaps, chart, and EA chat.
 * Settings persisted in localStorage('v2_dashboard').
 *
 * @module dashboard
 * @author Ember-75b6
 */

import { state } from './state.js';
import { escapeHtml, showToast } from './utils.js';
import { renderHeatmaps } from './dashboard-heatmaps.js';
import { loadChart } from './dashboard-chart.js';
import { initPAChat } from './dashboard-chat.js';
import api from './api.js';
import {
    STATUSES, PRIORITIES, PRIORITY_COLORS, STATUS_LABELS, STATUS_ICONS,
    PRIORITY_ORDER, showDropdown, renderTaskListHTML, renderChecklistHTML,
    sortTasksInPlace, findTaskById,
    renderGoalsSectionHTML, GOAL_STATUS_LABELS, GOAL_STATUS_COLORS, GOAL_STATUS_ICONS
} from './shared-tasks.js';

// ============================================================================
// SETTINGS
// ============================================================================

const DEFAULTS = {
    pillSize: 34,
    pillRadius: 8,
    borderWidth: 2,
    gap: 3,
    taskDotsMax: 5,
    showChart: true,
    showWorld: false,
    showTaskHeatmap: true,
    showInstanceHeatmap: true,
    showPmStatus: true,
    heatmapsSideBySide: true,
    openrouterKey: ''
};

let settings = { ...DEFAULTS };
let worldTimers = [];

function loadSettings() {
    try {
        const saved = localStorage.getItem('v2_dashboard');
        if (saved) settings = { ...DEFAULTS, ...JSON.parse(saved) };
    } catch (e) {
        console.warn('[Dashboard] Could not load settings:', e);
    }
}

function saveSettings() {
    try {
        localStorage.setItem('v2_dashboard', JSON.stringify(settings));
    } catch (e) {
        console.warn('[Dashboard] Could not save settings:', e);
    }
}

function applySettings() {
    const root = document.documentElement;
    root.style.setProperty('--dash-pill-size', settings.pillSize + 'px');
    root.style.setProperty('--dash-pill-radius', settings.pillRadius + 'px');
    root.style.setProperty('--dash-pill-gap', settings.gap + 'px');
    root.style.setProperty('--dash-pill-border', settings.borderWidth + 'px');

    // Toggle sections
    const chartEl = document.getElementById('dash-chart');
    const worldEl = document.getElementById('dash-world');
    const pmEl = document.getElementById('dash-pm-status');
    const hmTasks = document.getElementById('hm-tasks');
    const hmInst = document.getElementById('hm-instances');
    const hmWrap = document.getElementById('dash-heatmaps');

    if (chartEl) chartEl.style.display = settings.showChart ? '' : 'none';
    if (worldEl) worldEl.style.display = settings.showWorld ? '' : 'none';
    if (pmEl) pmEl.style.display = settings.showPmStatus ? '' : 'none';
    if (hmTasks) hmTasks.style.display = settings.showTaskHeatmap ? '' : 'none';
    if (hmInst) hmInst.style.display = settings.showInstanceHeatmap ? '' : 'none';

    if (hmWrap) {
        if (settings.heatmapsSideBySide) {
            hmWrap.classList.add('hm-sbs');
        } else {
            hmWrap.classList.remove('hm-sbs');
            hmWrap.style.display = 'block';
        }
    }
}

// ============================================================================
// MAIN LOAD
// ============================================================================

export async function loadDashboard() {
    // Clear any previous world timers
    worldTimers.forEach(t => clearInterval(t));
    worldTimers = [];

    loadSettings();
    applySettings();

    // Show role badge
    const badge = document.getElementById('dash-role-badge');
    if (badge) badge.textContent = state.role || 'Executive';

    // Fire all sections concurrently
    const jobs = [
        renderHeatmaps(
            document.getElementById('hm-projects-grid'),
            document.getElementById('hm-tasks-grid'),
            document.getElementById('hm-instances-grid'),
            settings
        ),
        renderPMStatus(),
        loadMyLists(),
        initPAChat(document.getElementById('pa-chat-msgs')),
        loadDashboardGoals()
    ];

    if (settings.showChart) {
        const chartContainer = document.getElementById('dash-chart');
        jobs.push(loadChart(chartContainer, settings.openrouterKey));
    }

    if (settings.showWorld) {
        jobs.push(renderWorldStrip());
    }

    await Promise.allSettled(jobs);

    setupSettingsGear();
    setupNewTaskInput();
}

// ============================================================================
// PM STATUS
// ============================================================================

async function renderPMStatus() {
    const container = document.getElementById('dash-pm-status');
    if (!container) return;

    const projects = state.projects || [];
    const withStatus = projects.filter(p => p.pmStatus);

    if (withStatus.length === 0) {
        container.innerHTML = '';
        container.style.display = 'none';
        return;
    }

    container.style.display = '';
    container.innerHTML = withStatus.map(p => {
        const priorityColor = getPriorityColor(p.priority);
        return `<div class="pm-item" data-project-id="${escapeHtml(p.id || p.projectId)}">
            <span class="pm-dot" style="background:${priorityColor}"></span>
            <div>
                <span class="pm-name">${escapeHtml(p.name || p.id)}</span>
                <span class="pm-msg"> ${escapeHtml(p.pmStatus)}</span>
            </div>
        </div>`;
    }).join('');

    container.querySelectorAll('.pm-item').forEach(el => {
        el.addEventListener('click', () => {
            const id = el.dataset.projectId;
            if (window.switchTab) window.switchTab('projects');
            if (window.showProjectDetail) window.showProjectDetail(id);
        });
    });
}

// ============================================================================
// EXECUTIVE GOALS
// ============================================================================

async function loadDashboardGoals() {
    const container = document.getElementById('dash-goals');
    if (!container) return;

    try {
        const result = await api.listPersonalGoals(state.instanceId);
        const summaries = result.goals || [];

        if (summaries.length === 0) {
            container.innerHTML = '';
            return;
        }

        // Fetch full criteria for each goal
        const fullGoals = await Promise.all(
            summaries.map(g => api.getGoal(state.instanceId, g.id).then(r => r.goal).catch(() => g))
        );

        container.innerHTML = `<div class="dash-goals-section">${renderGoalsSectionHTML(fullGoals, {
            prefix: '_dash',
            title: 'My Goals',
            showCreate: true,
            showStatus: true,
            expanded: fullGoals.length <= 5,
            compact: false
        })}</div>`;

        bindDashGoalInputs();
    } catch (err) {
        console.error('[Dashboard] Error loading goals:', err);
        container.innerHTML = '';
    }
}

function bindDashGoalInputs() {
    document.querySelectorAll('#dash-goals .goal-create-input').forEach(input => {
        if (input._goalBound) return;
        input._goalBound = true;
        input.addEventListener('keydown', async (e) => {
            if (e.key !== 'Enter' || !input.value.trim()) return;
            try {
                await api.createGoal(state.instanceId, input.value.trim());
                input.value = '';
                await loadDashboardGoals();
            } catch (err) { showToast('Failed: ' + err.message, 'error'); }
        });
    });
    document.querySelectorAll('#dash-goals .goal-add-criteria').forEach(input => {
        if (input._goalBound) return;
        input._goalBound = true;
        input.addEventListener('keydown', async (e) => {
            if (e.key !== 'Enter' || !input.value.trim()) return;
            const goalId = input.dataset.goalId;
            try {
                await api.addCriteria(state.instanceId, goalId, input.value.trim());
                input.value = '';
                await loadDashboardGoals();
            } catch (err) { showToast('Failed: ' + err.message, 'error'); }
        });
    });
}

window._dashToggleGoal = function(goalId) {
    const section = document.querySelector(`#dash-goals .goal-section[data-goal-id="${goalId}"]`);
    if (!section) return;
    const body = section.querySelector('.task-list-body');
    const chevron = section.querySelector('.chevron');
    const context = section.querySelector('.goal-context');
    const addWrap = section.querySelector('.goal-add-wrap');
    const show = body && body.style.display === 'none';
    if (body) body.style.display = show ? 'block' : 'none';
    if (chevron) chevron.classList.toggle('expanded', show);
    if (context) context.style.display = show ? 'block' : 'none';
    if (addWrap) addWrap.style.display = show ? '' : 'none';
    if (show) bindDashGoalInputs();
};

window._dashValidateCriteria = async function(goalId, criteriaId) {
    try {
        await api.validateCriteria(state.instanceId, goalId, criteriaId);
        await loadDashboardGoals();
    } catch (err) { showToast('Failed: ' + err.message, 'error'); }
};

window._dashGoalStatusMenu = function(el, goalId) {
    const options = ['in_progress', 'achieved', 'exceeded', 'archived'].map(s => ({
        label: GOAL_STATUS_LABELS[s], value: s, icon: GOAL_STATUS_ICONS[s]
    }));
    showDropdown(el, options, async (status) => {
        try {
            await api.setGoalStatus(state.instanceId, goalId, status);
            await loadDashboardGoals();
        } catch (err) { showToast('Failed: ' + err.message, 'error'); }
    });
};

window._dashCreateGoal = async function(btn) {
    const input = btn.parentElement.querySelector('.goal-create-input');
    if (!input || !input.value.trim()) return;
    try {
        await api.createGoal(state.instanceId, input.value.trim());
        input.value = '';
        await loadDashboardGoals();
    } catch (err) { showToast('Failed: ' + err.message, 'error'); }
};

// ============================================================================
// WORLD INFO STRIP
// ============================================================================

async function renderWorldStrip() {
    const container = document.getElementById('dash-world');
    if (!container) return;

    // Render clocks immediately
    function updateClocks() {
        const now = new Date();
        const fmt = (tz) => now.toLocaleTimeString('en-US', {
            timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false
        });
        const localTime = fmt(Intl.DateTimeFormat().resolvedOptions().timeZone);
        const santiago = fmt('America/Santiago');
        const utc = fmt('UTC');

        // Only update clock values, preserve other items
        const clockEls = container.querySelectorAll('.wi-clock');
        if (clockEls.length === 0) {
            // First render — build full strip
            container.innerHTML = `
                <div class="world-item"><span class="wi-label">Local</span><span class="wi-value wi-clock">${localTime}</span></div>
                <div class="world-item"><span class="wi-label">Santiago</span><span class="wi-value wi-clock">${santiago}</span></div>
                <div class="world-item"><span class="wi-label">UTC</span><span class="wi-value wi-clock">${utc}</span></div>
                <div class="world-item" id="wi-exchange"><span class="wi-label">USD/CLP</span><span class="wi-value">...</span></div>
                <div class="world-item" id="wi-weather"><span class="wi-label">Santiago</span><span class="wi-value">...</span></div>
            `;
        } else {
            clockEls[0].textContent = localTime;
            clockEls[1].textContent = santiago;
            clockEls[2].textContent = utc;
        }
    }

    updateClocks();
    const clockTimer = setInterval(updateClocks, 30000);
    worldTimers.push(clockTimer);

    // Async: exchange rate
    try {
        const resp = await fetch('https://open.er-api.com/v6/latest/USD');
        const data = await resp.json();
        const el = document.getElementById('wi-exchange');
        if (el && data.rates?.CLP) {
            el.querySelector('.wi-value').textContent = Math.round(data.rates.CLP).toLocaleString();
        }
    } catch (e) { /* silent */ }

    // Async: weather
    try {
        const resp = await fetch('https://wttr.in/Santiago?format=3');
        const text = await resp.text();
        const el = document.getElementById('wi-weather');
        if (el) {
            el.querySelector('.wi-value').textContent = text.replace('Santiago:', '').trim();
        }
    } catch (e) { /* silent */ }
}

// ============================================================================
// TASK LISTS + PERSONAL LISTS
// ============================================================================

// Dashboard task/list state
let dashTasksByList = {};
let dashExpandedLists = new Set(['default']);
let dashShowCompleted = new Set();
let dashExpandedTaskId = null;
let dashSortField = null;
let dashSortReverse = false;
let dashLists = [];
let dashListItems = {};
let dashExpandedChecklistIds = new Set();

// Constants imported from shared-tasks.js

async function loadMyLists() {
    try {
        const [tasksResult, listsResult] = await Promise.allSettled([
            api.listTasks(state.instanceId, { limit: 200, full_detail: true }),
            api.getLists(state.instanceId)
        ]);

        // Group tasks by list
        dashTasksByList = {};
        const rawTasks = tasksResult.status === 'fulfilled' ? (tasksResult.value?.tasks || []) : [];
        rawTasks.forEach(t => {
            const lid = t.listId || t.list || 'default';
            if (!dashTasksByList[lid]) dashTasksByList[lid] = [];
            dashTasksByList[lid].push(t);
        });

        // Sort each list by priority
        Object.values(dashTasksByList).forEach(arr => {
            sortTasksInPlace(arr, 'priority', false);
        });

        renderDashTasks();

        // Personal lists column — now uses shared checklist component
        const lists = listsResult.status === 'fulfilled' ? (listsResult.value?.lists || listsResult.value || []) : [];
        dashLists = Array.isArray(lists) ? lists : [];

        const listsCountEl = document.getElementById('dash-lists-count');
        if (listsCountEl) listsCountEl.textContent = dashLists.length;

        const personalLists = document.getElementById('dash-personal-lists');
        if (personalLists) {
            if (dashLists.length === 0) {
                personalLists.innerHTML = '<div style="padding:12px;font-size:12px;color:var(--text-muted)">No lists</div>';
            } else {
                // Fetch items for first 5 lists
                for (const list of dashLists.slice(0, 5)) {
                    const listId = list.id || list.listId;
                    try {
                        const detail = await api.getList(state.instanceId, listId);
                        dashListItems[listId] = detail?.list?.items || detail?.items || [];
                    } catch (e) {
                        dashListItems[listId] = [];
                    }
                }
                renderDashLists();
            }
        }
    } catch (error) {
        console.error('[Dashboard] Error loading lists:', error);
    }
}

function renderDashTasks() {
    const listIds = Object.keys(dashTasksByList);
    if (!listIds.length) listIds.push('default');

    const totalActive = Object.values(dashTasksByList).flat()
        .filter(t => !['completed', 'completed_verified', 'archived'].includes(t.status)).length;

    const tasksCountEl = document.getElementById('dash-tasks-count');
    if (tasksCountEl) tasksCountEl.textContent = totalActive;

    const tasksList = document.getElementById('dash-tasks-list');
    if (!tasksList) return;

    tasksList.innerHTML = listIds.map(lid => renderTaskListHTML(lid, dashTasksByList[lid] || [], {
        prefix: '_dash',
        expanded: dashExpandedLists.has(lid),
        showCompleted: dashShowCompleted.has(lid),
        sortField: dashSortField,
        sortReverse: dashSortReverse,
        expandedTaskId: dashExpandedTaskId,
        showSort: true,
        showNewInput: false,
        columns: ['priority', 'title', 'status'],
        compact: true,
    })).join('');

    bindDashTaskInputs();
}

function renderDashLists() {
    const personalLists = document.getElementById('dash-personal-lists');
    if (!personalLists) return;

    personalLists.innerHTML = dashLists.slice(0, 5).map(list => {
        const listId = list.id || list.listId;
        return renderChecklistHTML(list, dashListItems[listId] || [], {
            prefix: '_dashL',
            expanded: dashExpandedChecklistIds.has(listId),
            compact: true,
            inputClass: 'dash-list-add',
        });
    }).join('');

    // Bind add-item inputs
    personalLists.querySelectorAll('.dash-list-add').forEach(input => {
        input.addEventListener('keydown', e => {
            if (e.key !== 'Enter') return;
            const text = e.target.value.trim();
            const lid = e.target.dataset.listId;
            if (text && lid) { e.target.value = ''; window._dashLAddItem(lid, text); }
        });
    });
}

function bindDashTaskInputs() {
    const tasksList = document.getElementById('dash-tasks-list');
    if (!tasksList) return;
    tasksList.querySelectorAll('.id-task-input').forEach(input => {
        input.addEventListener('keydown', e => {
            if (e.key !== 'Enter') return;
            const title = e.target.value.trim();
            const lid = e.target.dataset.listId;
            if (title) { e.target.value = ''; window._dashQuickTask(title, lid); }
        });
    });
}

// --- Dashboard Task Handlers (_dash prefix) ---

window._dashToggleTL = function(listId) {
    if (dashExpandedLists.has(listId)) dashExpandedLists.delete(listId);
    else dashExpandedLists.add(listId);
    renderDashTasks();
};

window._dashToggleCompleted = function(listId) {
    if (dashShowCompleted.has(listId)) dashShowCompleted.delete(listId);
    else dashShowCompleted.add(listId);
    renderDashTasks();
};

window._dashExpandTask = function(tid) {
    dashExpandedTaskId = dashExpandedTaskId === tid ? null : tid;
    renderDashTasks();
};

window._dashSortTasks = function(field) {
    if (dashSortField === field) dashSortReverse = !dashSortReverse;
    else { dashSortField = field; dashSortReverse = false; }
    for (const tasks of Object.values(dashTasksByList)) {
        sortTasksInPlace(tasks, field, dashSortReverse);
    }
    renderDashTasks();
};

window._dashPriDD = function(event, tid) {
    event.stopPropagation();
    const task = findTaskById(dashTasksByList, tid);
    if (!task) return;
    showDropdown(event.target, PRIORITIES.map(p => ({
        value: p, label: p, selected: p === task.priority,
        icon: `<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${PRIORITY_COLORS[p]}"></span>`
    })), async (p) => {
        const old = task.priority; task.priority = p;
        try { await api.updateTask(state.instanceId, tid, { priority: p }); }
        catch (err) { task.priority = old; showToast('Failed: ' + err.message, 'error'); }
        renderDashTasks();
    });
};

window._dashStatusDD = function(event, tid) {
    event.stopPropagation();
    const task = findTaskById(dashTasksByList, tid);
    if (!task) return;
    showDropdown(event.target, STATUSES.map(s => ({ value: s, label: STATUS_LABELS[s], icon: STATUS_ICONS[s], selected: s === task.status })), async (s) => {
        const old = task.status; task.status = s;
        try {
            if (s === 'completed') await api.markTaskComplete(state.instanceId, tid);
            else if (s === 'completed_verified') await api.markTaskVerified(state.instanceId, tid);
            else if (s === 'archived') await api.archiveTask(state.instanceId, tid);
            else await api.updateTask(state.instanceId, tid, { status: s });
            showToast('Status updated', 'success');
        } catch (err) { task.status = old; showToast('Failed: ' + err.message, 'error'); }
        renderDashTasks();
    });
};

window._dashSaveField = async function(tid, field, value) {
    const task = findTaskById(dashTasksByList, tid);
    if (!task) return;
    const old = task[field]; task[field] = value;
    try {
        if (field === 'status') {
            if (value === 'completed') await api.markTaskComplete(state.instanceId, tid);
            else if (value === 'completed_verified') await api.markTaskVerified(state.instanceId, tid);
            else if (value === 'archived') await api.archiveTask(state.instanceId, tid);
            else await api.updateTask(state.instanceId, tid, { status: value });
        } else { await api.updateTask(state.instanceId, tid, { [field]: value }); }
        showToast('Saved', 'success');
    } catch (err) { task[field] = old; showToast('Failed: ' + err.message, 'error'); }
};

window._dashComplete = async function(tid) {
    try { await api.markTaskComplete(state.instanceId, tid); const t = findTaskById(dashTasksByList, tid); if (t) t.status = 'completed'; showToast('Done', 'success'); renderDashTasks(); }
    catch (err) { showToast('Failed: ' + err.message, 'error'); }
};

window._dashArchive = async function(tid) {
    try { await api.archiveTask(state.instanceId, tid); const t = findTaskById(dashTasksByList, tid); if (t) t.status = 'archived'; showToast('Archived', 'success'); renderDashTasks(); }
    catch (err) { showToast('Failed: ' + err.message, 'error'); }
};

window._dashNewTask = function() {
    const t = prompt('New task title:');
    if (t?.trim()) window._dashQuickTask(t.trim(), 'default');
};

window._dashQuickTask = async function(title, listId) {
    try {
        await api.addPersonalTask({ instanceId: state.instanceId, title });
        showToast('Task created', 'success');
        await loadMyLists();
    } catch (err) { showToast('Failed: ' + err.message, 'error'); }
};

// --- Dashboard Checklist Handlers (_dashL prefix) ---

window._dashLToggleCL = async function(listId) {
    if (dashExpandedChecklistIds.has(listId)) { dashExpandedChecklistIds.delete(listId); renderDashLists(); return; }
    dashExpandedChecklistIds.add(listId);
    if (!dashListItems[listId]) {
        try { const r = await api.getList(state.instanceId, listId); dashListItems[listId] = r.items || r.list?.items || []; }
        catch (_) { dashListItems[listId] = []; }
    }
    renderDashLists();
};

window._dashLToggleItem = async function(listId, itemId) {
    try {
        await api.toggleListItem(state.instanceId, listId, itemId);
        const items = dashListItems[listId] || [];
        const item = items.find(i => (i.id || i.itemId) === itemId);
        if (item) item.checked = !item.checked;
        renderDashLists();
    } catch (err) { showToast('Failed: ' + err.message, 'error'); }
};

window._dashLDelItem = async function(listId, itemId) {
    try {
        await api.deleteListItem(state.instanceId, listId, itemId);
        dashListItems[listId] = (dashListItems[listId] || []).filter(i => (i.id || i.itemId) !== itemId);
        renderDashLists();
    } catch (err) { showToast('Failed: ' + err.message, 'error'); }
};

window._dashLAddItem = async function(listId, text) {
    try {
        await api.addListItem(state.instanceId, listId, text);
        const r = await api.getList(state.instanceId, listId);
        dashListItems[listId] = r.items || r.list?.items || [];
        renderDashLists();
    } catch (err) { showToast('Failed: ' + err.message, 'error'); }
};

// ============================================================================
// NEW TASK INPUT (dashboard header input)
// ============================================================================

function setupNewTaskInput() {
    const input = document.getElementById('dash-new-task');
    if (!input) return;

    input.addEventListener('keydown', async (e) => {
        if (e.key !== 'Enter') return;
        const title = input.value.trim();
        if (!title) return;

        input.disabled = true;
        try {
            await api.addPersonalTask({ instanceId: state.instanceId, title });
            input.value = '';
            await loadMyLists();
            showToast('Task added', 'success');
        } catch (err) {
            console.error('[Dashboard] Add task failed:', err);
            showToast('Failed to add task', 'error');
        } finally {
            input.disabled = false;
            input.focus();
        }
    });
}

// ============================================================================
// SETTINGS GEAR
// ============================================================================

function setupSettingsGear() {
    const btn = document.getElementById('dash-settings-btn');
    const dialog = document.getElementById('dash-settings-dialog');
    if (!btn || !dialog) return;

    btn.addEventListener('click', () => {
        populateSettingsDialog();
        dialog.showModal();
    });

    document.getElementById('dash-settings-close')?.addEventListener('click', () => dialog.close());
    document.getElementById('dash-settings-cancel')?.addEventListener('click', () => dialog.close());

    document.getElementById('dash-settings-save')?.addEventListener('click', () => {
        settings.pillSize = parseInt(document.getElementById('ds-pill-size').value);
        settings.gap = parseInt(document.getElementById('ds-pill-gap').value);
        settings.borderWidth = parseInt(document.getElementById('ds-border-width').value);
        settings.taskDotsMax = parseInt(document.getElementById('ds-task-dots').value);
        settings.showChart = document.getElementById('ds-show-chart').checked;
        settings.showWorld = document.getElementById('ds-show-world').checked;
        settings.showTaskHeatmap = document.getElementById('ds-show-tasks').checked;
        settings.showInstanceHeatmap = document.getElementById('ds-show-instances').checked;
        settings.showPmStatus = document.getElementById('ds-show-pm').checked;
        settings.heatmapsSideBySide = document.getElementById('ds-hm-sbs').checked;
        settings.openrouterKey = document.getElementById('ds-openrouter-key').value;

        saveSettings();
        dialog.close();
        loadDashboard(); // Full re-render
    });

    // Live slider value updates
    const sliders = [
        ['ds-pill-size', 'ds-pill-val'],
        ['ds-pill-gap', 'ds-gap-val'],
        ['ds-border-width', 'ds-border-val'],
        ['ds-task-dots', 'ds-dots-val']
    ];
    sliders.forEach(([sliderId, valId]) => {
        const slider = document.getElementById(sliderId);
        const val = document.getElementById(valId);
        if (slider && val) {
            slider.addEventListener('input', () => { val.textContent = slider.value; });
        }
    });
}

function populateSettingsDialog() {
    const set = (id, val) => { const el = document.getElementById(id); if (el) el.value = val; };
    const setCheck = (id, val) => { const el = document.getElementById(id); if (el) el.checked = val; };
    const setVal = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };

    set('ds-pill-size', settings.pillSize);
    setVal('ds-pill-val', settings.pillSize);
    set('ds-pill-gap', settings.gap);
    setVal('ds-gap-val', settings.gap);
    set('ds-border-width', settings.borderWidth);
    setVal('ds-border-val', settings.borderWidth);
    set('ds-task-dots', settings.taskDotsMax);
    setVal('ds-dots-val', settings.taskDotsMax);
    setCheck('ds-show-chart', settings.showChart);
    setCheck('ds-show-world', settings.showWorld);
    setCheck('ds-show-tasks', settings.showTaskHeatmap);
    setCheck('ds-show-instances', settings.showInstanceHeatmap);
    setCheck('ds-show-pm', settings.showPmStatus);
    setCheck('ds-hm-sbs', settings.heatmapsSideBySide);
    set('ds-openrouter-key', settings.openrouterKey);
}

// ============================================================================
// HELPERS
// ============================================================================

function getPriorityColor(priority) {
    const colors = {
        emergency: 'var(--priority-critical)',
        critical: 'var(--priority-critical)',
        high: 'var(--priority-high)',
        medium: 'var(--priority-medium)',
        low: 'var(--priority-low)',
        whenever: 'var(--priority-whenever)'
    };
    return colors[priority] || colors.medium;
}

export function getSettings() {
    return settings;
}
