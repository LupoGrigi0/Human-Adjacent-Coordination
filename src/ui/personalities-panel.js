/**
 * Personalities Panel
 *
 * Card grid + detail panel for HACS personalities.
 * Nearly identical to roles-panel.js — both are "bunches of files"
 * with metadata. Uses shared-cards.js for rendering.
 *
 * @module personalities-panel
 * @author Ember-75b6
 * @created 2026-03-21
 */

import { state } from './state.js';
import { escapeHtml, showToast } from './utils.js';
import api from './api.js';
import { renderCardGrid, renderEntityCard, renderDetailPanel, renderSectionCollapse } from './shared-cards.js';

// Module state
let personalitiesData = [];
let currentPersonalityDetail = null;
let expandedSections = new Set(['description', 'files']);

// ============================================================================
// LOAD & RENDER GRID
// ============================================================================

export async function loadPersonalities() {
    const container = document.getElementById('personalities-grid');
    if (!container) return;

    container.innerHTML = '<div class="loading-placeholder">Loading personalities...</div>';

    try {
        const result = await api.getPersonalities();
        personalitiesData = result.personalities || [];

        container.innerHTML = renderCardGrid(personalitiesData, renderPersonalityCard, {
            gridClass: 'entity-grid',
            emptyMessage: 'No personalities defined'
        });

        container.querySelectorAll('.entity-card').forEach(card => {
            card.addEventListener('click', () => {
                showPersonalityDetail(card.dataset.entityId);
            });
        });
    } catch (err) {
        container.innerHTML = `<div class="error-placeholder">Failed to load personalities: ${escapeHtml(err.message)}</div>`;
    }
}

function renderPersonalityCard(personality) {
    const fileCount = (personality.wisdomFiles || []).length;
    // Count instances with this personality
    const instanceCount = (state.instances || []).filter(i => i.personality === personality.name).length;
    const category = personality.category || 'standard';

    return renderEntityCard({
        id: personality.id || personality.name,
        name: personality.name,
        subtitle: personality.description ? personality.description.slice(0, 60) + (personality.description.length > 60 ? '...' : '') : 'No description',
        avatarColor: getPersonalityColor(personality.name),
        dataAttr: 'data-entity-id',
        cardClass: 'entity-card',
        badges: [
            { text: category, color: category === 'privileged' ? '#ef4444' : '#22c55e', bg: category === 'privileged' ? 'rgba(239,68,68,0.15)' : 'rgba(34,197,94,0.15)' },
            ...(personality.requiresToken ? [{ text: 'token', color: '#f97316', bg: 'rgba(249,115,22,0.15)' }] : [])
        ],
        metaHTML: `<span>${fileCount} file${fileCount !== 1 ? 's' : ''}</span>` +
            (instanceCount > 0 ? ` <span>&middot; ${instanceCount} instance${instanceCount !== 1 ? 's' : ''}</span>` : ''),
    });
}

// ============================================================================
// DETAIL PANEL
// ============================================================================

export async function showPersonalityDetail(personalityId) {
    currentPersonalityDetail = personalityId;

    const grid = document.getElementById('personalities-grid');
    const pageHeader = document.querySelector('#tab-personalities .page-header');
    if (grid) grid.style.display = 'none';
    if (pageHeader) pageHeader.style.display = 'none';

    let detailView = document.getElementById('personality-detail-view');
    if (!detailView) {
        detailView = document.createElement('div');
        detailView.id = 'personality-detail-view';
        grid.parentElement.appendChild(detailView);
    }
    detailView.style.display = 'flex';
    detailView.className = 'project-detail-panel';
    detailView.innerHTML = '<div class="loading-placeholder">Loading personality...</div>';

    try {
        const result = await api.getPersonalityDetails(personalityId);
        const personality = result.personality || result;

        const wisdomFiles = personality.wisdomFiles || [];
        const category = personality.category || 'standard';

        // Instances with this personality
        const persInstances = (state.instances || []).filter(i => i.personality === personalityId);

        const descHTML = personality.description
            ? `<p style="font-size:0.9rem;line-height:1.5">${escapeHtml(personality.description)}</p>`
            : '<div style="color:var(--text-muted);font-size:0.85em">No description</div>';

        const instancesHTML = persInstances.map(inst =>
            `<div style="padding:4px 0;display:flex;align-items:center;gap:8px;cursor:pointer" onclick="window._persViewInstance('${escapeHtml(inst.instanceId)}')">
                <span class="team-card-avatar" style="width:24px;height:24px;font-size:0.7rem">${(inst.name || '?').charAt(0).toUpperCase()}</span>
                <span style="font-size:0.85rem">${escapeHtml(inst.name || inst.instanceId)}</span>
                <span style="font-size:0.75rem;color:var(--text-muted)">${escapeHtml(inst.role || '')}</span>
                <span class="online-dot ${inst.status === 'active' ? 'online' : ''}"></span>
            </div>`
        ).join('') || '<div style="color:var(--text-muted);font-size:0.85em">No instances with this personality</div>';

        const docsHTML = wisdomFiles.map(f => {
            const name = typeof f === 'string' ? f : f.name || f.filename;
            return `<div style="padding:4px 0;cursor:pointer" onclick="window._persViewDoc('${escapeHtml(personalityId)}','${escapeHtml(name)}')">
                <span style="color:var(--text-muted);margin-right:4px">&#128196;</span>
                <span style="font-size:0.85rem">${escapeHtml(name)}</span>
            </div>`;
        }).join('') || '<div style="color:var(--text-muted);font-size:0.85em">No wisdom files</div>';

        // Origin info
        let originHTML = '';
        if (personality.origin) {
            const o = personality.origin;
            originHTML = `<div style="font-size:0.8rem;color:var(--text-muted);margin-top:8px">
                ${o.createdBy ? `<div>Created by: ${escapeHtml(o.createdBy)}</div>` : ''}
                ${o.createdFrom ? `<div>${escapeHtml(o.createdFrom)}</div>` : ''}
                ${o.createdAt ? `<div>Date: ${new Date(o.createdAt).toLocaleDateString()}</div>` : ''}
            </div>`;
        }

        const mainHTML = [
            renderSectionCollapse('description', 'Description', descHTML + originHTML, { expanded: true, prefix: '_pers' }),
            renderSectionCollapse('instances', 'Instances', instancesHTML, { expanded: persInstances.length > 0, prefix: '_pers', count: persInstances.length }),
        ].join('');

        const sidebarHTML = renderSectionCollapse('files', 'Identity Files', docsHTML, { expanded: true, prefix: '_pers', count: wisdomFiles.length });

        const badges = [
            { text: category, color: category === 'privileged' ? '#ef4444' : '#22c55e', bg: category === 'privileged' ? 'rgba(239,68,68,0.15)' : 'rgba(34,197,94,0.15)' },
            ...(personality.requiresToken ? [{ text: 'requires token', color: '#f97316', bg: 'rgba(249,115,22,0.15)' }] : [])
        ];

        detailView.innerHTML = renderDetailPanel({
            backLabel: '← Personalities',
            backHandler: '_persHideDetail',
            name: personality.name || personalityId,
            avatarColor: getPersonalityColor(personalityId),
            badges,
            subtitle: personalityId,
            mainHTML,
            sidebarHTML,
        });

    } catch (err) {
        detailView.innerHTML = `<div class="error-placeholder">Error: ${escapeHtml(err.message)}</div>`;
    }
}

export function hidePersonalityDetail() {
    currentPersonalityDetail = null;
    const detailView = document.getElementById('personality-detail-view');
    if (detailView) detailView.style.display = 'none';
    const grid = document.getElementById('personalities-grid');
    const pageHeader = document.querySelector('#tab-personalities .page-header');
    if (grid) grid.style.display = '';
    if (pageHeader) pageHeader.style.display = '';
}

// ============================================================================
// WINDOW HANDLERS
// ============================================================================

window._persHideDetail = function() { hidePersonalityDetail(); };

window._persToggleSec = function(name) {
    if (expandedSections.has(name)) expandedSections.delete(name);
    else expandedSections.add(name);
    const section = document.querySelector(`#personality-detail-view .section-collapse[data-section="${name}"]`);
    if (!section) return;
    const body = section.querySelector('.section-collapse-body');
    const chev = section.querySelector('.chevron');
    if (body) body.style.display = expandedSections.has(name) ? 'block' : 'none';
    if (chev) chev.classList.toggle('expanded', expandedSections.has(name));
};

window._persViewInstance = function(instanceId) {
    if (window.switchTab) window.switchTab('instances');
    if (window.showInstanceDetailPanel) window.showInstanceDetailPanel(instanceId);
};

window._persViewDoc = async function(personalityId, docName) {
    try {
        const result = await api.getPersonalityDetails(personalityId);
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

function getPersonalityColor(name) {
    // Generate a consistent color from the name
    let hash = 0;
    for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
    const hue = Math.abs(hash) % 360;
    return `hsl(${hue}, 60%, 45%)`;
}

export default { loadPersonalities, showPersonalityDetail, hidePersonalityDetail };
