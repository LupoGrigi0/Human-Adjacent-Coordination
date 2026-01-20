/**
 * Document Management Module
 *
 * Handles document listing, viewing, creating, and editing for projects.
 * Uses the document APIs implemented by Crossing.
 *
 * @module documents
 */

import { state } from './state.js';
import { escapeHtml, showToast, formatDateTime } from './utils.js';
import { showDocumentDetail } from './details.js';
import api from './api.js';

// ============================================================================
// DOCUMENT LOADING
// ============================================================================

/**
 * Load documents for a project
 * @param {string} projectId - Project ID
 * @returns {Promise<Array>} List of documents
 */
export async function loadProjectDocuments(projectId) {
    try {
        const result = await api.listDocuments(state.instanceId, projectId);
        return result.documents || [];
    } catch (error) {
        console.error('[Documents] Error loading documents:', error);
        showToast('Error loading documents: ' + error.message, 'error');
        return [];
    }
}

// ============================================================================
// DOCUMENT RENDERING
// ============================================================================

/**
 * Render documents list for a project
 * @param {string} containerId - Container element ID
 * @param {string} projectId - Project ID
 * @param {Array} documents - Documents to render
 */
export function renderDocumentsList(containerId, projectId, documents) {
    const container = document.getElementById(containerId);
    if (!container) return;

    if (!documents || documents.length === 0) {
        container.innerHTML = '<div class="empty-placeholder">No documents</div>';
        return;
    }

    container.innerHTML = documents.map(doc => `
        <div class="document-item" data-doc-id="${escapeHtml(doc.id || doc.name)}">
            <span class="document-icon">${getDocIcon(doc.type || doc.name)}</span>
            <span class="document-name">${escapeHtml(doc.name || doc.id)}</span>
            <button class="btn btn-small btn-secondary doc-view-btn">View</button>
        </div>
    `).join('');

    // Add click handlers
    container.querySelectorAll('.doc-view-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const docId = btn.closest('.document-item').dataset.docId;
            showDocumentDetail(docId, true, { projectId });
        });
    });
}

/**
 * Get icon for document type
 * @param {string} type - Document type or filename
 * @returns {string} Icon character
 */
function getDocIcon(type) {
    if (!type) return '\u{1F4C4}'; // page facing up

    const lower = type.toLowerCase();
    if (lower.endsWith('.md')) return '\u{1F4DD}'; // memo
    if (lower.endsWith('.json')) return '\u{1F4CA}'; // bar chart
    if (lower.endsWith('.js') || lower.endsWith('.ts')) return '\u{1F4BB}'; // laptop
    if (lower.includes('readme')) return '\u{1F4D6}'; // open book

    return '\u{1F4C4}'; // default: page facing up
}

// ============================================================================
// DOCUMENT CREATION (TODO)
// ============================================================================

/**
 * Show create document modal
 * @param {string} projectId - Project to create document in
 */
export function showCreateDocumentModal(projectId) {
    // TODO: Implement document creation modal
    showToast('Document creation coming soon', 'info');
}

// ============================================================================
// DOCUMENT EDITING (TODO)
// ============================================================================

/**
 * Show document editor
 * @param {string} projectId - Project ID
 * @param {string} documentId - Document ID
 */
export function showDocumentEditor(projectId, documentId) {
    // TODO: Implement document editor
    showToast('Document editing coming soon', 'info');
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
    loadProjectDocuments,
    renderDocumentsList,
    showCreateDocumentModal,
    showDocumentEditor
};
