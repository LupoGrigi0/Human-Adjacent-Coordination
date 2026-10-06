/**
 * Shared Card & Grid Components
 *
 * Base components for entity card grids (instances, projects, roles,
 * personalities, skills). Each entity type provides a cardConfig that
 * parameterizes the shared card skeleton.
 *
 * The card grid pattern:
 *   1. Panel has a grid container
 *   2. Grid renders cards for each entity
 *   3. Click a card → open detail panel
 *   4. Detail panel has header + sections (main + sidebar)
 *
 * @module shared-cards
 * @author Ember-75b6
 * @created 2026-03-21
 */

import { escapeHtml } from './utils.js';

// ============================================================================
// CARD GRID
// ============================================================================

/**
 * Render a grid of entity cards.
 *
 * @param {Array} entities - Array of entity objects
 * @param {Function} cardRenderer - Function(entity, index) → HTML string
 * @param {object} opts
 * @param {string} opts.gridClass - CSS class for the grid (default: 'entity-grid')
 * @param {string} opts.emptyMessage - Message when no entities
 * @param {string} opts.createLabel - Label for create button (null = no button)
 * @param {string} opts.onCreateHandler - Window handler for create (e.g. '_roleCreate')
 */
export function renderCardGrid(entities, cardRenderer, opts = {}) {
    const {
        gridClass = 'entity-grid',
        emptyMessage = 'No items found',
        createLabel = null,
        onCreateHandler = null,
    } = opts;

    if (!entities || entities.length === 0) {
        return `<div class="${gridClass}">
            <div class="empty-placeholder">${escapeHtml(emptyMessage)}</div>
        </div>`;
    }

    const cardsHTML = entities.map((e, i) => cardRenderer(e, i)).join('');

    return `<div class="${gridClass}">${cardsHTML}</div>`;
}

// ============================================================================
// ENTITY CARD — shared skeleton
// ============================================================================

/**
 * Render an entity card with consistent layout.
 *
 * @param {object} config
 * @param {string} config.id - Entity ID (used for data attribute)
 * @param {string} config.name - Display name
 * @param {string} config.subtitle - Second line (ID, description snippet, etc.)
 * @param {string} config.avatarChar - Single character for avatar (default: first char of name)
 * @param {string} config.avatarColor - Avatar background color (optional)
 * @param {string} config.dataAttr - Data attribute name (e.g. 'data-role-id')
 * @param {string} config.cardClass - Additional CSS class (e.g. 'role-card')
 * @param {Array<{text, color, bg}>} config.badges - Status badges [{text, color, bg}]
 * @param {string} config.topRightHTML - HTML for top-right corner (icons, dots, etc.)
 * @param {string} config.metaHTML - HTML for the meta row
 * @param {string} config.actionsHTML - HTML for action buttons
 * @param {string} config.footerHTML - HTML for card footer
 */
export function renderEntityCard(config) {
    const {
        id, name, subtitle = '',
        avatarChar = null, avatarColor = null,
        dataAttr = 'data-entity-id', cardClass = 'entity-card',
        badges = [], topRightHTML = '',
        metaHTML = '', actionsHTML = '', footerHTML = ''
    } = config;

    const avatar = avatarChar || (name ? name.charAt(0).toUpperCase() : '?');
    const avatarStyle = avatarColor ? `background:${avatarColor}` : '';

    const badgesHTML = badges.map(b =>
        `<span class="entity-badge" style="background:${b.bg || 'rgba(99,102,241,0.15)'};color:${b.color || '#818cf8'}">${escapeHtml(b.text)}</span>`
    ).join('');

    return `
    <div class="${cardClass}" ${dataAttr}="${escapeHtml(id)}">
        <div class="entity-card-top">
            ${badgesHTML}
            <span style="flex:1"></span>
            ${topRightHTML}
        </div>
        <div class="entity-card-header">
            <div class="entity-avatar" style="${avatarStyle}">${avatar}</div>
            <div class="entity-card-info">
                <div class="entity-card-name">${escapeHtml(name)}</div>
                ${subtitle ? `<div class="entity-card-subtitle">${escapeHtml(subtitle)}</div>` : ''}
            </div>
        </div>
        ${metaHTML ? `<div class="entity-card-meta">${metaHTML}</div>` : ''}
        ${actionsHTML ? `<div class="entity-card-actions">${actionsHTML}</div>` : ''}
        ${footerHTML ? `<div class="entity-card-footer">${footerHTML}</div>` : ''}
    </div>`;
}

// ============================================================================
// DETAIL PANEL — shared skeleton for entity detail views
// ============================================================================

/**
 * Render a detail panel layout with header + main + sidebar.
 *
 * @param {object} config
 * @param {string} config.backLabel - Back button text (e.g. '← Roles')
 * @param {string} config.backHandler - Window handler for back (e.g. '_roleHideDetail')
 * @param {string} config.name - Entity name
 * @param {string} config.avatarChar - Avatar character
 * @param {Array<{text, color, bg}>} config.badges - Header badges
 * @param {string} config.subtitle - Subtitle/ID line
 * @param {string} config.metaHTML - Header meta row
 * @param {string} config.mainHTML - Main column content (sections)
 * @param {string} config.sidebarHTML - Sidebar content (documents, team, etc.)
 * @param {string} config.settingsHandler - Handler for gear icon (optional)
 */
export function renderDetailPanel(config) {
    const {
        backLabel = '← Back', backHandler = '',
        name, avatarChar = null, badges = [],
        subtitle = '', metaHTML = '',
        mainHTML = '', sidebarHTML = '',
        settingsHandler = null
    } = config;

    const avatar = avatarChar || (name ? name.charAt(0).toUpperCase() : '?');
    const badgesHTML = badges.map(b =>
        `<span class="status-badge" style="background:${b.bg || 'rgba(99,102,241,0.15)'};color:${b.color || '#818cf8'}">${escapeHtml(b.text)}</span>`
    ).join(' ');

    const gearBtn = settingsHandler
        ? `<button class="pd-settings-btn" onclick="window.${settingsHandler}()" title="Settings">&#9881;</button>`
        : '';

    return `
    <div class="project-detail-header">
        <div class="project-detail-header-top">
            <button class="back-btn" onclick="window.${backHandler}()">${backLabel}</button>
            <div class="project-detail-header-title" style="align-items:center">
                <span class="team-card-avatar" style="width:36px;height:36px;font-size:1.1rem;margin-right:8px">${avatar}</span>
                <div>
                    <h2 class="pd-project-name">${escapeHtml(name)}</h2>
                    ${subtitle ? `<span style="font-size:0.7rem;color:var(--text-muted)">${escapeHtml(subtitle)}</span>` : ''}
                </div>
                ${badgesHTML}
            </div>
            ${gearBtn}
        </div>
        ${metaHTML ? `<div class="project-detail-header-meta">${metaHTML}</div>` : ''}
    </div>
    <div class="project-detail-body">
        <div class="project-detail-main">
            ${mainHTML}
        </div>
        ${sidebarHTML ? `<div class="project-detail-sidebar">${sidebarHTML}</div>` : ''}
    </div>`;
}

// ============================================================================
// SECTION COLLAPSE — reusable collapsible section for detail panels
// ============================================================================

/**
 * Render a collapsible section.
 *
 * @param {string} sectionName - Section identifier
 * @param {string} title - Display title
 * @param {string} bodyHTML - Content HTML
 * @param {object} opts
 * @param {boolean} opts.expanded - Start expanded
 * @param {string} opts.prefix - Handler prefix
 * @param {string} opts.count - Item count to show in header
 * @param {string} opts.headerActionsHTML - Extra HTML in header (buttons, inputs)
 */
export function renderSectionCollapse(sectionName, title, bodyHTML, opts = {}) {
    const {
        expanded = false, prefix = '_role',
        count = null, headerActionsHTML = ''
    } = opts;

    const countStr = count !== null ? ` (${count})` : '';

    return `
    <div class="section-collapse" data-section="${escapeHtml(sectionName)}">
        <div class="section-collapse-header" onclick="window.${prefix}ToggleSec('${escapeHtml(sectionName)}')">
            <span class="chevron ${expanded ? 'expanded' : ''}">&rsaquo;</span> ${escapeHtml(title)}${countStr}
            ${headerActionsHTML ? `<span class="section-header-actions">${headerActionsHTML}</span>` : ''}
        </div>
        <div class="section-collapse-body" style="display:${expanded ? 'block' : 'none'}">
            ${bodyHTML}
        </div>
    </div>`;
}

export default { renderCardGrid, renderEntityCard, renderDetailPanel, renderSectionCollapse };
