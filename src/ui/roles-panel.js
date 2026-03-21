/**
 * Roles Panel
 *
 * Card grid + detail panel for HACS roles.
 * Uses shared-cards.js for card/grid/detail rendering.
 *
 * @module roles-panel
 * @author Ember-75b6
 * @created 2026-03-21
 */

import { state } from './state.js';
import { escapeHtml, showToast } from './utils.js';
import api from './api.js';
import { renderCardGrid, renderEntityCard, renderDetailPanel, renderSectionCollapse } from './shared-cards.js';

// Module state
let rolesData = [];
let currentRoleDetail = null;
let expandedSections = new Set(['description', 'permissions']);

// ============================================================================
// LOAD & RENDER GRID
// ============================================================================

export async function loadRoles() {
    const container = document.getElementById('roles-grid');
    if (!container) return;

    container.innerHTML = '<div class="loading-placeholder">Loading roles...</div>';

    try {
        const result = await api.getRoles();
        rolesData = result.roles || [];

        container.innerHTML = renderCardGrid(rolesData, renderRoleCard, {
            gridClass: 'entity-grid',
            emptyMessage: 'No roles defined'
        });

        container.querySelectorAll('.entity-card').forEach(card => {
            card.addEventListener('click', () => {
                showRoleDetail(card.dataset.entityId);
            });
        });
    } catch (err) {
        container.innerHTML = `<div class="error-placeholder">Failed to load roles: ${escapeHtml(err.message)}</div>`;
    }
}

function renderRoleCard(role) {
    const permCount = (role.permissions || []).length;
    // Count instances with this role
    const instanceCount = (state.instances || []).filter(i => i.role === role.name).length;

    return renderEntityCard({
        id: role.id || role.name,
        name: role.name,
        subtitle: role.description || 'No description',
        avatarColor: getRoleColor(role.name),
        dataAttr: 'data-entity-id',
        cardClass: 'entity-card',
        badges: [
            { text: `${permCount} permissions`, color: '#818cf8', bg: 'rgba(99,102,241,0.15)' }
        ],
        metaHTML: instanceCount > 0
            ? `<span>${instanceCount} instance${instanceCount !== 1 ? 's' : ''} with this role</span>`
            : '<span>No active instances</span>',
    });
}

// ============================================================================
// DETAIL PANEL
// ============================================================================

export async function showRoleDetail(roleId) {
    currentRoleDetail = roleId;

    // Hide grid, show detail
    const grid = document.getElementById('roles-grid');
    const pageHeader = document.querySelector('#tab-roles .page-header');
    if (grid) grid.style.display = 'none';
    if (pageHeader) pageHeader.style.display = 'none';

    let detailView = document.getElementById('role-detail-view');
    if (!detailView) {
        detailView = document.createElement('div');
        detailView.id = 'role-detail-view';
        grid.parentElement.appendChild(detailView);
    }
    detailView.style.display = 'flex';
    detailView.className = 'project-detail-panel';
    detailView.innerHTML = '<div class="loading-placeholder">Loading role...</div>';

    try {
        const result = await api.getRoleDetails(roleId);
        const role = result.role || result;
        const summary = role.summary || role.SUMMARY || '';

        // Get wisdom files
        let wisdomFiles = [];
        try {
            const wResult = await api.getRoleDetails(roleId);
            wisdomFiles = wResult.wisdomFiles || wResult.documents || [];
        } catch (_) {}

        // Instances with this role
        const roleInstances = (state.instances || []).filter(i => i.role === roleId);

        const permissionsHTML = (role.permissions || []).map(p =>
            `<div style="padding:3px 0;display:flex;align-items:center;gap:6px">
                <span style="color:var(--accent-color)">&#8227;</span>
                <span style="font-size:0.85rem">${escapeHtml(p)}</span>
            </div>`
        ).join('') || '<div style="color:var(--text-muted);font-size:0.85em">No permissions defined</div>';

        const instancesHTML = roleInstances.map(inst =>
            `<div style="padding:4px 0;display:flex;align-items:center;gap:8px;cursor:pointer" onclick="window._roleViewInstance('${escapeHtml(inst.instanceId)}')">
                <span class="team-card-avatar" style="width:24px;height:24px;font-size:0.7rem">${(inst.name || '?').charAt(0).toUpperCase()}</span>
                <span style="font-size:0.85rem">${escapeHtml(inst.name || inst.instanceId)}</span>
                <span class="online-dot ${inst.status === 'active' ? 'online' : ''}"></span>
            </div>`
        ).join('') || '<div style="color:var(--text-muted);font-size:0.85em">No instances with this role</div>';

        const docsHTML = (wisdomFiles || []).map(f => {
            const name = typeof f === 'string' ? f : f.name || f.filename;
            return `<div style="padding:4px 0;cursor:pointer" onclick="window._roleViewDoc('${escapeHtml(roleId)}','${escapeHtml(name)}')">
                <span style="color:var(--text-muted);margin-right:4px">&#128196;</span>
                <span style="font-size:0.85rem">${escapeHtml(name)}</span>
            </div>`;
        }).join('') || '<div style="color:var(--text-muted);font-size:0.85em">No wisdom files</div>';

        // Build main content
        const mainHTML = [
            summary ? renderSectionCollapse('summary', 'Summary', `<pre class="vision-preview" style="white-space:pre-wrap;font-family:inherit;font-size:0.85rem">${escapeHtml(summary)}</pre>`, { expanded: true, prefix: '_role' }) : '',
            renderSectionCollapse('permissions', 'Permissions', permissionsHTML, { expanded: true, prefix: '_role', count: (role.permissions || []).length }),
            renderSectionCollapse('instances', 'Instances', instancesHTML, { expanded: roleInstances.length > 0, prefix: '_role', count: roleInstances.length }),
        ].join('');

        const sidebarHTML = renderSectionCollapse('documents', 'Wisdom Files', docsHTML, { expanded: true, prefix: '_role', count: (wisdomFiles || []).length });

        detailView.innerHTML = renderDetailPanel({
            backLabel: '← Roles',
            backHandler: '_roleHideDetail',
            name: role.name || roleId,
            avatarColor: getRoleColor(roleId),
            badges: [{ text: roleId, color: '#818cf8', bg: 'rgba(99,102,241,0.15)' }],
            subtitle: role.description || '',
            mainHTML,
            sidebarHTML,
        });

    } catch (err) {
        detailView.innerHTML = `<div class="error-placeholder">Error: ${escapeHtml(err.message)}</div>`;
    }
}

export function hideRoleDetail() {
    currentRoleDetail = null;
    const detailView = document.getElementById('role-detail-view');
    if (detailView) detailView.style.display = 'none';
    const grid = document.getElementById('roles-grid');
    const pageHeader = document.querySelector('#tab-roles .page-header');
    if (grid) grid.style.display = '';
    if (pageHeader) pageHeader.style.display = '';
}

// ============================================================================
// WINDOW HANDLERS
// ============================================================================

window._roleHideDetail = function() { hideRoleDetail(); };

window._roleToggleSec = function(name) {
    if (expandedSections.has(name)) expandedSections.delete(name);
    else expandedSections.add(name);
    const section = document.querySelector(`#role-detail-view .section-collapse[data-section="${name}"]`);
    if (!section) return;
    const body = section.querySelector('.section-collapse-body');
    const chev = section.querySelector('.chevron');
    if (body) body.style.display = expandedSections.has(name) ? 'block' : 'none';
    if (chev) chev.classList.toggle('expanded', expandedSections.has(name));
};

window._roleViewInstance = function(instanceId) {
    if (window.switchTab) window.switchTab('instances');
    if (window.showInstanceDetailPanel) window.showInstanceDetailPanel(instanceId);
};

window._roleViewDoc = async function(roleId, docName) {
    // Show wisdom file content in a simple overlay
    try {
        const result = await api.getRoleDetails(roleId);
        const content = result.wisdomContent?.[docName] || 'Content not available';
        const overlay = document.createElement('div');
        overlay.className = 'detail-overlay active';
        overlay.innerHTML = `
            <div class="detail-panel" style="max-width:700px">
                <div class="detail-header">
                    <h3 style="margin:0">${escapeHtml(docName)}</h3>
                    <button class="detail-close-btn" onclick="this.closest('.detail-overlay').remove()">&times;</button>
                </div>
                <div class="detail-content" style="padding:16px">
                    <pre style="white-space:pre-wrap;font-family:inherit;font-size:0.85rem">${escapeHtml(content)}</pre>
                </div>
            </div>`;
        overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
        document.body.appendChild(overlay);
    } catch (err) {
        showToast('Failed to load document: ' + err.message, 'error');
    }
};

// ============================================================================
// HELPERS
// ============================================================================

function getRoleColor(roleName) {
    const colors = {
        Executive: '#ef4444',
        COO: '#f97316',
        PM: '#3b82f6',
        EA: '#a78bfa',
        Developer: '#22c55e',
        Designer: '#ec4899',
        DevOps: '#14b8a6',
        LeadDesigner: '#f59e0b',
        Tester: '#6366f1',
    };
    return colors[roleName] || '#6b7280';
}

export default { loadRoles, showRoleDetail, hideRoleDetail };
