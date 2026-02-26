/**
 * Dashboard Heatmaps — Projects, Tasks, Instances
 *
 * Three heatmaps rendered side-by-side with dual-encoding pills:
 * fill = priority color, border = status color.
 *
 * @module dashboard-heatmaps
 * @author Ember-75b6
 */

import { state } from './state.js';
import { escapeHtml } from './utils.js';
import api from './api.js';

// ============================================================================
// COLORS
// ============================================================================

const PRIORITY_COLORS = {
    emergency: '#f85149',
    critical: '#f85149',
    high: '#f0883e',
    medium: '#d29922',
    low: '#3fb950',
    whenever: '#58a6ff'
};

const STATUS_COLORS = {
    active: '#3fb950',
    paused: '#d29922',
    blocked: '#f85149',
    archived: '#484f58'
};

const ROLE_ICONS = {
    Executive: '\u2605',  // star
    PA: '\u2665',         // heart
    COO: '\u2696',        // scales
    PM: '\u2731',         // compass-ish
    Developer: '\u2699',  // gear
    Designer: '\u270E',   // pencil
    Tester: '\u2714',     // check
    Architect: '\u25B3',  // triangle
    Specialist: '\u2726'  // star-4
};

const PRIVILEGED_ROLES = ['Executive', 'PA', 'COO', 'PM'];

// ============================================================================
// MAIN RENDER
// ============================================================================

export async function renderHeatmaps(projectsGrid, tasksGrid, instancesGrid, settings) {
    await Promise.allSettled([
        renderProjectHeatmap(projectsGrid),
        renderTaskHeatmap(tasksGrid, settings),
        renderInstanceHeatmap(instancesGrid)
    ]);
}

// ============================================================================
// PROJECT HEATMAP
// ============================================================================

function renderProjectHeatmap(container) {
    if (!container) return;

    const projects = state.projects || [];
    if (projects.length === 0) {
        container.innerHTML = '<span style="font-size:11px;color:var(--text-muted)">No projects</span>';
        return;
    }

    container.innerHTML = projects.map(p => {
        const id = p.id || p.projectId;
        const name = p.name || id;
        const initials = getInitials(name);
        const fill = PRIORITY_COLORS[p.priority] || PRIORITY_COLORS.medium;
        const border = STATUS_COLORS[p.status] || STATUS_COLORS.active;
        const pulse = p.status === 'blocked' ? ' pulse' : '';
        const pm = p.pm ? p.pm.split('-')[0] : '';
        const pmStatus = p.pmStatus || '';

        return `<div class="hm-pill${pulse}" style="background:${fill};border-color:${border}" data-project-id="${escapeHtml(id)}">
            ${initials}
            <span class="tip"><span class="tn">${escapeHtml(name)}</span>${pm ? `<span class="ts">PM: ${escapeHtml(pm)}</span>` : ''}${pmStatus ? `<span class="ts">${escapeHtml(pmStatus.slice(0, 60))}</span>` : ''}</span>
        </div>`;
    }).join('');

    container.querySelectorAll('.hm-pill').forEach(el => {
        el.addEventListener('click', () => {
            const id = el.dataset.projectId;
            if (window.switchTab) window.switchTab('projects');
            if (window.showProjectDetail) window.showProjectDetail(id);
        });
    });
}

// ============================================================================
// TASK HEATMAP
// ============================================================================

async function renderTaskHeatmap(container, settings) {
    if (!container) return;

    try {
        const result = await api.getMyTasks(state.instanceId);
        const tasks = result?.tasks || result || [];
        const allTasks = Array.isArray(tasks) ? tasks : [];
        const pending = allTasks.filter(t => t.status !== 'completed' && t.status !== 'completed_verified' && t.status !== 'archived');

        if (pending.length === 0) {
            container.innerHTML = '<span style="font-size:11px;color:var(--text-muted)">No tasks</span>';
            return;
        }

        // Group by list
        const groups = {};
        pending.forEach(t => {
            const list = t.listId || t.list || t.source || 'default';
            if (!groups[list]) groups[list] = [];
            groups[list].push(t);
        });

        // Sort each group by priority
        const priorityOrder = { emergency: 0, critical: 1, high: 2, medium: 3, low: 4, whenever: 5 };
        Object.values(groups).forEach(arr => {
            arr.sort((a, b) => (priorityOrder[a.priority] || 3) - (priorityOrder[b.priority] || 3));
        });

        const maxDots = settings?.taskDotsMax || 5;

        container.innerHTML = '<div class="task-heatmap">' + Object.entries(groups).map(([listName, tasks]) => {
            const label = getInitials(listName).slice(0, 2);
            const dots = tasks.slice(0, maxDots).map(t => {
                const color = PRIORITY_COLORS[t.priority] || PRIORITY_COLORS.medium;
                const id = t.id || t.taskId;
                return `<div class="th-dot" style="background:${color}" data-task-id="${escapeHtml(id)}" title="${escapeHtml(t.title)}"></div>`;
            }).join('');

            return `<div class="task-heat-row">
                <span class="task-heat-label">${escapeHtml(label)}</span>
                <div class="task-heat-dots">${dots}</div>
            </div>`;
        }).join('') + '</div>';

        container.querySelectorAll('.th-dot').forEach(el => {
            el.addEventListener('click', () => {
                if (window.switchTab) window.switchTab('tasks');
                if (window.showTaskDetail) window.showTaskDetail(el.dataset.taskId, true);
            });
        });
    } catch (error) {
        console.error('[Heatmaps] Task heatmap error:', error);
        container.innerHTML = '<span style="font-size:11px;color:var(--text-muted)">Could not load tasks</span>';
    }
}

// ============================================================================
// INSTANCE HEATMAP
// ============================================================================

function renderInstanceHeatmap(container) {
    if (!container) return;

    const instances = state.instances || [];
    if (instances.length === 0) {
        container.innerHTML = '<span style="font-size:11px;color:var(--text-muted)">No instances</span>';
        return;
    }

    // Split into privileged and regular
    const privileged = instances.filter(i => PRIVILEGED_ROLES.includes(i.role));
    const regular = instances.filter(i => !PRIVILEGED_ROLES.includes(i.role));

    const renderPill = (inst) => {
        const id = inst.id || inst.instanceId;
        const name = inst.name || id.split('-')[0];
        const role = inst.role || 'Developer';
        const icon = ROLE_ICONS[role] || ROLE_ICONS.Developer;
        const isActive = inst.status === 'active';

        // ZeroClaw status
        const zc = inst.zeroclaw || inst.zc;
        const hasZC = zc && zc.enabled;
        const zcLive = hasZC && zc.status === 'active';

        // Colors: active instances get role-based fill, inactive get muted
        const fill = isActive ? getRoleColor(role) : '#30363d';
        const border = isActive ? STATUS_COLORS.active : STATUS_COLORS.archived;
        const pulse = zcLive ? ' pulse' : '';

        // Build tooltip
        let tipExtra = '';
        if (hasZC) {
            tipExtra += `<span class="ts">${zcLive ? '\uD83D\uDE80 Live' : '\uD83D\uDE80 Landed'}</span>`;
        }

        return `<div class="hm-pill${pulse}" style="background:${fill};border-color:${border}" data-instance-id="${escapeHtml(id)}">
            <span class="inst-icon">${icon}</span>${hasZC ? '<span style="position:absolute;bottom:1px;right:1px;font-size:7px">\uD83D\uDE80</span>' : ''}
            <span class="tip"><span class="tn">${escapeHtml(name)}</span><span class="ts">${escapeHtml(role)}</span>${tipExtra}</span>
        </div>`;
    };

    let html = privileged.map(renderPill).join('');
    if (privileged.length > 0 && regular.length > 0) {
        html += '<div class="inst-divider"></div>';
    }
    html += regular.map(renderPill).join('');

    container.innerHTML = html;

    container.querySelectorAll('.hm-pill').forEach(el => {
        el.addEventListener('click', () => {
            const id = el.dataset.instanceId;
            if (window.switchTab) window.switchTab('instances');
            if (window.showInstanceDetailPanel) window.showInstanceDetailPanel(id);
        });
    });
}

// ============================================================================
// HELPERS
// ============================================================================

function getInitials(name) {
    if (!name) return '??';
    const words = name.replace(/[-_]/g, ' ').split(/\s+/);
    if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
    return (words[0][0] + words[1][0]).toUpperCase();
}

function getRoleColor(role) {
    const colors = {
        Executive: '#f0883e',
        PA: '#bc8cff',
        COO: '#8b949e',
        PM: '#58a6ff',
        Developer: '#3fb950',
        Designer: '#f778ba',
        Tester: '#79c0ff',
        Architect: '#d2a8ff',
        Specialist: '#ffa657'
    };
    return colors[role] || '#8b949e';
}
