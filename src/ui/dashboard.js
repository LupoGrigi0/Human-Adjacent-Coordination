/**
 * Dashboard v2 — Executive Dashboard
 *
 * Orchestrator module. Calls sub-modules for heatmaps, chart, and PA chat.
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
        initPAChat(document.getElementById('pa-chat-msgs'))
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
            if (window.showProjectDetail) window.showProjectDetail(id);
        });
    });
}

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

async function loadMyLists() {
    try {
        const [tasksResult, listsResult] = await Promise.allSettled([
            api.getMyTasks(state.instanceId),
            api.getLists(state.instanceId)
        ]);

        // Tasks column
        const tasks = tasksResult.status === 'fulfilled' ? (tasksResult.value?.tasks || tasksResult.value || []) : [];
        const allTasks = Array.isArray(tasks) ? tasks : [];
        const pendingTasks = allTasks.filter(t => t.status !== 'completed' && t.status !== 'completed_verified' && t.status !== 'archived');

        const tasksCountEl = document.getElementById('dash-tasks-count');
        if (tasksCountEl) tasksCountEl.textContent = pendingTasks.length;

        const tasksList = document.getElementById('dash-tasks-list');
        if (tasksList) {
            if (pendingTasks.length === 0) {
                tasksList.innerHTML = '<div style="padding:12px;font-size:12px;color:var(--text-muted)">No pending tasks</div>';
            } else {
                tasksList.innerHTML = pendingTasks.slice(0, 15).map(t => {
                    const id = t.id || t.taskId;
                    const assignee = t.assigned_to ? t.assigned_to.split('-')[0] : '';
                    return `<div class="dash-task-row" data-task-id="${escapeHtml(id)}">
                        <span class="pdot pdot-${t.priority || 'medium'}"></span>
                        <span class="dash-task-text">${escapeHtml(t.title)}</span>
                        ${assignee ? `<span class="dash-task-assignee">${escapeHtml(assignee)}</span>` : ''}
                    </div>`;
                }).join('');

                tasksList.querySelectorAll('.dash-task-row').forEach(el => {
                    el.addEventListener('click', () => {
                        const taskId = el.dataset.taskId;
                        if (window.showTaskDetail) window.showTaskDetail(taskId, true);
                    });
                });
            }
        }

        // Personal lists column
        const lists = listsResult.status === 'fulfilled' ? (listsResult.value?.lists || listsResult.value || []) : [];
        const allLists = Array.isArray(lists) ? lists : [];

        const listsCountEl = document.getElementById('dash-lists-count');
        if (listsCountEl) listsCountEl.textContent = allLists.length;

        const personalLists = document.getElementById('dash-personal-lists');
        if (personalLists) {
            if (allLists.length === 0) {
                personalLists.innerHTML = '<div style="padding:12px;font-size:12px;color:var(--text-muted)">No lists</div>';
            } else {
                // Show first 3 lists with item previews
                const listPreviews = [];
                for (const list of allLists.slice(0, 3)) {
                    try {
                        const detail = await api.getList(state.instanceId, list.id || list.listId);
                        const items = detail?.items || [];
                        listPreviews.push({ ...list, items });
                    } catch (e) {
                        listPreviews.push({ ...list, items: [] });
                    }
                }

                personalLists.innerHTML = listPreviews.map(list => {
                    const header = `<div class="col-header" style="font-size:12px;padding:6px 12px;">
                        <span>${escapeHtml(list.name || list.id)}</span>
                        <span class="col-count">${list.items.length}</span>
                    </div>`;
                    const items = list.items.slice(0, 5).map(item => {
                        const checked = item.checked ? 'checked' : '';
                        return `<div class="dash-list-item" data-list-id="${escapeHtml(list.id || list.listId)}" data-item-id="${escapeHtml(item.id)}">
                            <span class="li-check ${checked}">${checked ? '\u2713' : ''}</span>
                            <span class="li-text ${checked}">${escapeHtml(item.text)}</span>
                        </div>`;
                    }).join('');
                    return header + items;
                }).join('');

                // Toggle items on click
                personalLists.querySelectorAll('.dash-list-item').forEach(el => {
                    el.addEventListener('click', async () => {
                        const listId = el.dataset.listId;
                        const itemId = el.dataset.itemId;
                        try {
                            await api.toggleListItem(state.instanceId, listId, itemId);
                            const check = el.querySelector('.li-check');
                            const text = el.querySelector('.li-text');
                            const isNowChecked = !check.classList.contains('checked');
                            check.classList.toggle('checked');
                            text.classList.toggle('checked');
                            check.textContent = isNowChecked ? '\u2713' : '';
                        } catch (e) {
                            console.error('[Dashboard] Toggle failed:', e);
                        }
                    });
                });
            }
        }
    } catch (error) {
        console.error('[Dashboard] Error loading lists:', error);
    }
}

// ============================================================================
// NEW TASK INPUT
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
            // Refresh tasks
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
