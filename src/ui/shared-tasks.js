/**
 * Shared Task & Checklist Components
 *
 * Extracted from instance-detail.js and projects.js to eliminate duplication.
 * Pure rendering functions that return HTML strings.
 * Each consumer registers its own window[prefix + 'FnName'] handlers.
 *
 * @module shared-tasks
 */

import { escapeHtml } from './utils.js';

// ============================================================================
// CONSTANTS
// ============================================================================

export const STATUSES = ['not_started', 'in_progress', 'blocked', 'completed', 'completed_verified', 'archived'];
export const PRIORITIES = ['emergency', 'critical', 'high', 'medium', 'low', 'whenever'];
export const PRIORITY_COLORS = { emergency: '#ef4444', critical: '#ef4444', high: '#f97316', medium: '#3b82f6', low: '#6b7280', whenever: '#a78bfa' };
export const STATUS_LABELS = { not_started: 'Not Started', in_progress: 'In Progress', blocked: 'Blocked', completed: 'Completed', completed_verified: 'Verified', archived: 'Archived' };
export const STATUS_ICONS = { not_started: '\u25CB', in_progress: '\u25D4', blocked: '\u26A0', completed: '\u2714', completed_verified: '\u2714\u2714', archived: '\uD83D\uDCE6' };
export const PRIORITY_ORDER = { emergency: 0, critical: 1, high: 2, medium: 3, low: 4, whenever: 5 };
export const STATUS_ORDER = { not_started: 0, in_progress: 1, blocked: 2, completed: 3, completed_verified: 4, archived: 5 };

// ============================================================================
// DROPDOWN UTILITY
// ============================================================================

export function showDropdown(anchorEl, options, onSelect) {
    document.querySelectorAll('.pd-dropdown').forEach(el => el.remove());
    const rect = anchorEl.getBoundingClientRect();
    const dd = document.createElement('div');
    dd.className = 'pd-dropdown';
    dd.style.cssText = `position:fixed;left:${rect.left}px;top:${rect.bottom + 2}px;z-index:1000;`;
    dd.innerHTML = options.map(o =>
        `<div class="pd-dropdown-item${o.selected ? ' selected' : ''}" data-value="${escapeHtml(o.value || '')}">${o.icon ? '<span style="margin-right:4px">' + o.icon + '</span>' : ''}${escapeHtml(o.label)}</div>`
    ).join('');
    dd.addEventListener('click', e => {
        const item = e.target.closest('.pd-dropdown-item');
        if (item) { onSelect(item.dataset.value); dd.remove(); }
    });
    document.body.appendChild(dd);
    const r = dd.getBoundingClientRect();
    if (r.right > window.innerWidth) dd.style.left = (window.innerWidth - r.width - 8) + 'px';
    if (r.bottom > window.innerHeight) dd.style.top = (rect.top - r.height - 2) + 'px';
    setTimeout(() => document.addEventListener('click', function h(e) {
        if (!dd.contains(e.target)) { dd.remove(); document.removeEventListener('click', h); }
    }), 0);
}

// ============================================================================
// TASK RENDERING
// ============================================================================

/**
 * Render a task list section (header + rows).
 *
 * @param {string} listId - task list ID (e.g. 'default')
 * @param {Array} tasks - array of task objects
 * @param {object} opts - rendering options
 * @param {string} opts.prefix - handler prefix ('_id', '_pd', '_dash')
 * @param {boolean} opts.expanded - is this list expanded
 * @param {boolean} opts.showCompleted - show completed tasks
 * @param {string|null} opts.sortField - current sort field
 * @param {boolean} opts.sortReverse - sort direction
 * @param {string|null} opts.expandedTaskId - which task is inline-expanded
 * @param {boolean} opts.showSort - show sortable column headers (default true)
 * @param {boolean} opts.showNewInput - show inline new-task input (default true)
 * @param {boolean} opts.showCompletedToggle - show eye icon (default true)
 * @param {Array} opts.columns - columns to show (default ['priority','title','status'])
 * @param {Array} opts.teamMembers - for assignee dropdown in expanded view
 * @param {string} opts.inputClass - CSS class for task input
 * @param {boolean} opts.compact - add compact class
 * @param {string} opts.projectId - project ID (for project task context)
 */
export function renderTaskListHTML(listId, tasks, opts = {}) {
    const {
        prefix = '_id',
        expanded = false,
        showCompleted = false,
        sortField = null,
        sortReverse = false,
        expandedTaskId = null,
        showSort = true,
        showNewInput = true,
        showCompletedToggle = true,
        columns = ['priority', 'title', 'status'],
        teamMembers = [],
        inputClass = 'id-task-input',
        compact = false,
        projectId = null,
    } = opts;

    const active = tasks.filter(t => !['completed', 'completed_verified', 'archived'].includes(t.status));
    const completedTasks = tasks.filter(t => ['completed', 'completed_verified'].includes(t.status));
    const pct = tasks.length > 0 ? Math.round(completedTasks.length / tasks.length * 100) : 0;

    const wrapClass = compact ? 'task-list-section compact' : 'task-list-section';

    // Column headers
    let colHeaders = '';
    if (showSort && expanded) {
        const cols = columns.map(col => {
            const arrow = sortField === col ? (sortReverse ? ' \u25B2' : ' \u25BC') : '';
            if (col === 'priority') return `<span class="col-header col-header-priority" onclick="window.${prefix}SortTasks('priority')" title="Sort by priority">P${arrow}</span>`;
            if (col === 'title') return `<span class="col-header col-header-title" onclick="window.${prefix}SortTasks('title')" title="Sort by title">Title${arrow}</span>`;
            if (col === 'status') return `<span class="col-header col-header-status" onclick="window.${prefix}SortTasks('status')" title="Sort by status">Status${arrow}</span>`;
            if (col === 'assignee') return `<span class="col-header col-header-assignee" onclick="window.${prefix}SortTasks('assignee')" title="Sort by assignee">Who${arrow}</span>`;
            if (col === 'created') return `<span class="col-header col-header-dates" onclick="window.${prefix}SortTasks('created')" title="Sort by date created">\uD83D\uDCC5${arrow}</span>`;
            if (col === 'updated') return `<span class="col-header col-header-dates" onclick="window.${prefix}SortTasks('updated')" title="Sort by last updated">\uD83D\uDD04${arrow}</span>`;
            return '';
        }).join('');
        colHeaders = `<div class="task-list-col-headers">${cols}</div>`;
    }

    // New task input
    let inputHTML = '';
    if (showNewInput && expanded) {
        const dataAttrs = projectId ? `data-list-id="${escapeHtml(listId)}" data-project-id="${escapeHtml(projectId)}"` : `data-list-id="${escapeHtml(listId)}"`;
        inputHTML = `<span class="new-task-input-wrap"><input type="text" class="task-header-input ${inputClass}" placeholder="New task..." ${dataAttrs} onclick="event.stopPropagation()"><span class="new-task-detail-icon" title="Add with details" onclick="event.stopPropagation();window.${prefix}NewTask()" style="cursor:pointer;padding:0 4px">&#9998;</span></span>`;
    }

    // Completed toggle
    let toggleHTML = '';
    if (showCompletedToggle) {
        toggleHTML = `<span class="completed-toggle-icon" onclick="event.stopPropagation();window.${prefix}ToggleCompleted('${escapeHtml(listId)}')" title="${showCompleted ? 'Hide completed' : 'Show completed'}">${showCompleted ? '\uD83D\uDC41' : '\uD83D\uDC41\u200D\uD83D\uDDE8'}</span>`;
    }

    const taskRowOpts = { prefix, expandedTaskId, columns, teamMembers, compact, projectId };

    return `
    <div class="${wrapClass}">
        <div class="task-list-header">
            <span class="chevron ${expanded ? 'expanded' : ''}" onclick="window.${prefix}ToggleTL('${escapeHtml(listId)}')">&rsaquo;</span>
            <span class="task-list-name" onclick="window.${prefix}ToggleTL('${escapeHtml(listId)}')">${escapeHtml(listId)}</span>
            <span class="task-list-progress-text">${completedTasks.length}/${tasks.length}</span>
            <div class="progress-bar"><div class="progress-fill" style="width:${pct}%"></div></div>
            ${toggleHTML}
            ${inputHTML}
        </div>
        <div class="task-list-body" style="display:${expanded ? 'block' : 'none'}">
            ${colHeaders}
            ${active.map(t => renderTaskRowHTML(t, taskRowOpts)).join('')}
            ${showCompleted ? completedTasks.map(t => renderTaskRowHTML(t, taskRowOpts)).join('') : ''}
        </div>
    </div>`;
}

/**
 * Render a single task row (summary line + optional inline expansion).
 */
export function renderTaskRowHTML(task, opts = {}) {
    const {
        prefix = '_id',
        expandedTaskId = null,
        columns = ['priority', 'title', 'status'],
        teamMembers = [],
        compact = false,
        projectId = null,
    } = opts;

    const tid = task.id || task.taskId;
    const p = task.priority || 'medium';
    const s = task.status || 'not_started';
    const isExp = expandedTaskId === tid;
    const isDone = ['completed', 'completed_verified'].includes(s);
    const rowClass = compact ? `task-row compact${isExp ? ' task-row-expanded' : ''}${isDone ? ' done' : ''}` : `task-row${isExp ? ' task-row-expanded' : ''}`;

    // Build summary cells
    let cells = '';
    for (const col of columns) {
        if (col === 'priority') {
            cells += `<span class="priority-dot priority-dot-${p}" onclick="window.${prefix}PriDD(event,'${escapeHtml(tid)}')" title="${p}"></span>`;
        } else if (col === 'title') {
            cells += `<span class="task-row-title" onclick="window.${prefix}ExpandTask('${escapeHtml(tid)}')">${escapeHtml(task.title)}</span>`;
        } else if (col === 'status') {
            cells += `<span class="status-badge status-${s}" onclick="window.${prefix}StatusDD(event,'${escapeHtml(tid)}')">${STATUS_LABELS[s] || s}</span>`;
        } else if (col === 'assignee') {
            const assignee = task.assigned_to || task.assignee;
            const label = assignee ? (assignee.split('-')[0] || '?') : '';
            if (label) {
                cells += `<span class="task-assignee-avatar" onclick="window.${prefix}AssigneeDropdown(event,'${escapeHtml(tid)}')" title="${escapeHtml(assignee || '')}">${escapeHtml(label.charAt(0).toUpperCase())}</span>`;
            } else {
                cells += `<span class="task-assignee-avatar task-assignee-empty" onclick="window.${prefix}AssigneeDropdown(event,'${escapeHtml(tid)}')" title="Assign">?</span>`;
            }
        }
    }

    let row = `
    <div class="${rowClass}" data-task-id="${escapeHtml(tid)}">
        <div class="task-row-summary">${cells}</div>`;

    if (isExp) row += renderTaskExpandedHTML(task, { prefix, columns, teamMembers, projectId });
    row += '</div>';
    return row;
}

/**
 * Render the inline expanded detail for a task.
 */
export function renderTaskExpandedHTML(task, opts = {}) {
    const {
        prefix = '_id',
        columns = ['priority', 'title', 'status'],
        teamMembers = [],
    } = opts;

    const tid = task.id || task.taskId;
    const hasAssignee = columns.includes('assignee');
    const isCompleted = task.status === 'completed';
    const isVerified = task.status === 'completed_verified';

    let assigneeSelect = '';
    if (hasAssignee) {
        assigneeSelect = `
            <div class="task-detail-field">
                <label>Assignee</label>
                <select onchange="window.${prefix}SaveField('${escapeHtml(tid)}','assigned_to',this.value)">
                    <option value="">Unassigned</option>
                    ${teamMembers.map(m => {
                        const mid = typeof m === 'string' ? m : m.instanceId || m.id;
                        const mname = typeof m === 'string' ? m.split('-')[0] : m.name || mid.split('-')[0];
                        return `<option value="${mid}" ${mid === (task.assigned_to || task.assignee) ? 'selected' : ''}>${escapeHtml(mname)}</option>`;
                    }).join('')}
                </select>
            </div>`;
    }

    // Action buttons — context-dependent
    let actions = '';
    if (hasAssignee) {
        // Project context: claim, complete, verify, archive
        const isAssignee = opts.callerId && (task.assigned_to || task.assignee) === opts.callerId;
        actions = `
            ${!task.assigned_to && !task.assignee ? `<button class="btn-action" onclick="window.${prefix}ClaimTask('${escapeHtml(tid)}')">Claim</button>` : ''}
            ${!isCompleted && !isVerified ? `<button class="btn-action" onclick="window.${prefix}CompleteTask('${escapeHtml(tid)}')">Complete</button>` : ''}
            ${isCompleted && !isAssignee ? `<button class="btn-action" onclick="window.${prefix}VerifyTask('${escapeHtml(tid)}')">Verify</button>` : ''}
            ${isCompleted && isAssignee ? `<button class="btn-action btn-disabled" disabled title="Cannot verify own task">Verify</button>` : ''}
            ${isVerified ? `<button class="btn-action" onclick="window.${prefix}ArchiveTask('${escapeHtml(tid)}')">Archive</button>` : ''}`;
    } else {
        // Personal context: complete, archive
        const s = task.status || 'not_started';
        actions = `
            ${!['completed', 'completed_verified'].includes(s) ? `<button class="btn-action" onclick="window.${prefix}Complete('${escapeHtml(tid)}')">Complete</button>` : ''}
            ${s === 'completed_verified' ? `<button class="btn-action" onclick="window.${prefix}Archive('${escapeHtml(tid)}')">Archive</button>` : ''}`;
    }

    return `
    <div class="task-detail-inline">
        <div class="task-detail-field">
            <label>Title</label>
            <input type="text" class="task-detail-title-input" value="${escapeHtml(task.title || '')}" onblur="window.${prefix}SaveField('${escapeHtml(tid)}','title',this.value)">
        </div>
        <div class="task-detail-field">
            <label>Description</label>
            <textarea class="task-detail-desc" onblur="window.${prefix}SaveField('${escapeHtml(tid)}','description',this.value)">${escapeHtml(task.description || '')}</textarea>
        </div>
        <div class="task-detail-row">
            <div class="task-detail-field">
                <label>Priority</label>
                <select onchange="window.${prefix}SaveField('${escapeHtml(tid)}','priority',this.value)">
                    ${PRIORITIES.map(pr => `<option value="${pr}" ${pr === task.priority ? 'selected' : ''}>${pr}</option>`).join('')}
                </select>
            </div>
            <div class="task-detail-field">
                <label>Status</label>
                <select onchange="window.${prefix}SaveField('${escapeHtml(tid)}','status',this.value)">
                    ${STATUSES.map(st => `<option value="${st}" ${st === task.status ? 'selected' : ''}>${STATUS_LABELS[st]}</option>`).join('')}
                </select>
            </div>
            ${assigneeSelect}
        </div>
        <div class="task-detail-actions">${actions}</div>
    </div>`;
}

// ============================================================================
// CHECKLIST RENDERING
// ============================================================================

/**
 * Render a checklist (header + items with toggle/add/delete).
 *
 * @param {object} list - { id, listId, name, itemCount }
 * @param {Array} items - [ { id, itemId, text, checked } ]
 * @param {object} opts - rendering options
 * @param {string} opts.prefix - handler prefix
 * @param {boolean} opts.expanded - is this list expanded
 * @param {boolean} opts.showAddInput - show add-item input (default true)
 * @param {boolean} opts.showDelete - show delete buttons (default true)
 * @param {boolean} opts.compact - compact mode
 * @param {string} opts.inputClass - CSS class for add-item input
 */
export function renderChecklistHTML(list, items, opts = {}) {
    const {
        prefix = '_id',
        expanded = false,
        showAddInput = true,
        showDelete = true,
        compact = false,
        inputClass = 'id-list-add',
    } = opts;

    const listId = list.id || list.listId || list.name;
    const checked = items.filter(i => i.checked).length;
    const total = list.itemCount ?? items.length ?? 0;
    const wrapClass = compact ? 'task-list-section compact' : 'task-list-section';

    const itemsHTML = items.map(item => {
        const iid = escapeHtml(item.id || item.itemId || '');
        return `<div style="padding:4px 0">
            <label style="display:flex;align-items:center;gap:8px;cursor:pointer">
                <input type="checkbox" ${item.checked ? 'checked' : ''} onchange="window.${prefix}ToggleItem('${escapeHtml(listId)}','${iid}')" style="accent-color:var(--accent-color)">
                <span style="flex:1;${item.checked ? 'text-decoration:line-through;opacity:0.5' : ''}">${escapeHtml(item.text || '')}</span>
                ${showDelete ? `<span onclick="event.preventDefault();event.stopPropagation();window.${prefix}DelItem('${escapeHtml(listId)}','${iid}')" style="cursor:pointer;color:var(--text-muted);padding:0 4px">&times;</span>` : ''}
            </label>
        </div>`;
    }).join('');

    const addInput = showAddInput ? `<input type="text" class="task-header-input ${inputClass}" placeholder="Add item..." data-list-id="${escapeHtml(listId)}" onclick="event.stopPropagation()" style="margin-top:4px;width:100%">` : '';

    return `
    <div class="${wrapClass}">
        <div class="task-list-header" onclick="window.${prefix}ToggleCL('${escapeHtml(listId)}')">
            <span class="chevron ${expanded ? 'expanded' : ''}">&rsaquo;</span>
            <span class="task-list-name">${escapeHtml(list.name || listId)}</span>
            <span class="task-list-progress-text">${checked}/${total}</span>
        </div>
        <div class="task-list-body" style="display:${expanded ? 'block' : 'none'}">
            ${itemsHTML}
            ${addInput}
        </div>
    </div>`;
}

// ============================================================================
// GOAL RENDERING
// ============================================================================

export const GOAL_STATUS_LABELS = { in_progress: 'In Progress', achieved: 'Achieved', exceeded: 'Exceeded' };
export const GOAL_STATUS_COLORS = { in_progress: '#3b82f6', achieved: '#22c55e', exceeded: '#a78bfa' };
export const GOAL_STATUS_ICONS = { in_progress: '◐', achieved: '✓', exceeded: '★' };

/**
 * Render a single goal as an expandable section with criteria.
 *
 * @param {object} goal - Goal object from get_goal (with criteria array)
 * @param {object} opts - Rendering options
 * @param {string} opts.prefix - Handler prefix (_id, _pd, _dash)
 * @param {boolean} opts.expanded - Start expanded
 * @param {boolean} opts.showAdd - Show add-criteria input
 * @param {boolean} opts.showStatus - Show status badge with dropdown
 * @param {boolean} opts.compact - Compact mode
 * @param {string} opts.projectId - If this is a project goal
 */
export function renderGoalHTML(goal, opts = {}) {
    const {
        prefix = '_id',
        expanded = false,
        showAdd = true,
        showStatus = true,
        compact = false,
        projectId = null,
    } = opts;

    const goalId = escapeHtml(goal.id);
    const criteria = goal.criteria || goal.items || [];
    const validated = criteria.filter(c => c.validated || c.checked).length;
    const total = criteria.length;
    const status = goal.status || 'in_progress';
    const statusColor = GOAL_STATUS_COLORS[status] || '#6b7280';
    const statusIcon = GOAL_STATUS_ICONS[status] || '◐';
    const statusLabel = GOAL_STATUS_LABELS[status] || status;
    const wrapClass = compact ? 'goal-section compact' : 'goal-section';
    const projAttr = projectId ? ` data-project-id="${escapeHtml(projectId)}"` : '';
    const pct = total > 0 ? Math.round((validated / total) * 100) : 0;

    const criteriaHTML = criteria.map(c => {
        const cid = escapeHtml(c.id);
        const isStretch = c.stretch;
        const isDep = !!c.dependency;
        const isChecked = c.validated || c.checked;
        return `<div class="goal-criteria-item" style="padding:4px 0">
            <label style="display:flex;align-items:center;gap:8px;cursor:pointer">
                <input type="checkbox" ${isChecked ? 'checked' : ''} ${isDep ? 'disabled title="Dependency — validated automatically"' : ''} onchange="window.${prefix}ValidateCriteria('${goalId}','${cid}')" style="accent-color:${statusColor}">
                <span style="flex:1;${isChecked ? 'text-decoration:line-through;opacity:0.5' : ''}${isStretch ? ';font-style:italic' : ''}">${isStretch ? '⭐ ' : ''}${isDep ? '🔗 ' : ''}${escapeHtml(c.text || '')}</span>
            </label>
            ${c.description ? `<div style="margin-left:28px;font-size:0.8em;color:var(--text-muted)">${escapeHtml(c.description)}</div>` : ''}
        </div>`;
    }).join('');

    const statusBadge = showStatus
        ? `<span class="goal-status-badge" onclick="event.stopPropagation();window.${prefix}GoalStatusMenu(this,'${goalId}')" style="cursor:pointer;font-size:0.75em;padding:2px 8px;border-radius:10px;background:${statusColor}22;color:${statusColor};border:1px solid ${statusColor}44;white-space:nowrap">${statusIcon} ${statusLabel}</span>`
        : '';

    // Input in the header line — same pattern as task list headers
    const addInput = showAdd && expanded
        ? `<span class="new-task-input-wrap"><input type="text" class="task-header-input goal-add-criteria" placeholder="Add criteria..." data-goal-id="${goalId}"${projAttr} onclick="event.stopPropagation()"></span>`
        : '';

    const contextLine = goal.context
        ? `<div style="padding:2px 0 4px 24px;font-size:0.8em;color:var(--text-muted);display:${expanded ? 'block' : 'none'}" class="goal-context">${escapeHtml(goal.context)}</div>`
        : '';

    return `
    <div class="${wrapClass}" data-goal-id="${goalId}"${projAttr}>
        <div class="task-list-header" onclick="window.${prefix}ToggleGoal('${goalId}')">
            <span class="chevron ${expanded ? 'expanded' : ''}">&rsaquo;</span>
            <span class="task-list-name">${escapeHtml(goal.name || goalId)}</span>
            <span class="task-list-progress-text">${validated}/${total}</span>
            <div class="progress-bar"><div class="progress-fill" style="width:${pct}%;background:${statusColor}"></div></div>
            ${statusBadge}
            ${addInput}
        </div>
        ${contextLine}
        <div class="task-list-body" style="display:${expanded ? 'block' : 'none'}">
            ${criteriaHTML || '<div style="padding:4px;color:var(--text-muted);font-size:0.85em">No criteria yet</div>'}
        </div>
    </div>`;
}

/**
 * Render a goals section: header + list of goals.
 *
 * @param {Array} goals - Array of goal objects (from get_goal, with criteria)
 * @param {object} opts - Options passed to renderGoalHTML + section opts
 * @param {string} opts.title - Section title (default: "Goals")
 * @param {boolean} opts.showCreate - Show create-goal input
 */
export function renderGoalsSectionHTML(goals, opts = {}) {
    const { title = 'Goals', showCreate = true, showTitle = true, prefix = '_id', projectId = null } = opts;
    const projAttr = projectId ? ` data-project-id="${escapeHtml(projectId)}"` : '';

    const goalsHTML = goals.map(g => renderGoalHTML(g, opts)).join('');

    // Create input inline in header — matches task list header pattern
    const createInput = showCreate
        ? `<span class="new-task-input-wrap" style="margin-left:auto"><input type="text" class="task-header-input goal-create-input" placeholder="New goal..."${projAttr} onclick="event.stopPropagation()"><span onclick="event.stopPropagation();window.${prefix}CreateGoal(this)" style="cursor:pointer;padding:0 4px;color:var(--accent-color)" title="Create goal"${projAttr}>+</span></span>`
        : '';

    const header = showTitle
        ? `<div style="margin:0 0 8px 0;font-size:0.95em;display:flex;align-items:center;gap:6px">
            <span style="color:var(--accent-color)">◎</span> ${escapeHtml(title)}
            <span style="color:var(--text-muted);font-size:0.8em">(${goals.length})</span>
            ${createInput}
           </div>`
        : (showCreate ? `<div style="margin:0 0 8px 0;display:flex;align-items:center">${createInput}</div>` : '');

    return `
    <div class="goals-section">
        ${header}
        ${goalsHTML || '<div style="color:var(--text-muted);font-size:0.85em;padding:4px 0">No goals yet</div>'}
    </div>`;
}

// ============================================================================
// UTILITIES
// ============================================================================

/**
 * Sort tasks array in place by field.
 */
export function sortTasksInPlace(tasks, field, reverse) {
    tasks.sort((a, b) => {
        let cmp = 0;
        if (field === 'priority') cmp = (PRIORITY_ORDER[a.priority] || 3) - (PRIORITY_ORDER[b.priority] || 3);
        else if (field === 'status') cmp = (STATUS_ORDER[a.status] || 0) - (STATUS_ORDER[b.status] || 0);
        else if (field === 'title') cmp = (a.title || '').localeCompare(b.title || '');
        else if (field === 'assignee') cmp = (a.assigned_to || a.assignee || '').localeCompare(b.assigned_to || b.assignee || '');
        else if (field === 'created') cmp = new Date(a.created_at || 0) - new Date(b.created_at || 0);
        else if (field === 'updated') cmp = new Date(a.updated_at || 0) - new Date(b.updated_at || 0);
        return reverse ? -cmp : cmp;
    });
}

/**
 * Find a task by ID across multiple task lists.
 */
export function findTaskById(tasksByList, tid) {
    for (const tasks of Object.values(tasksByList)) {
        const t = tasks.find(t => (t.id || t.taskId) === tid);
        if (t) return t;
    }
    return null;
}
