/**
 * Lists Module
 *
 * Handles personal checklists with items that can be checked off.
 *
 * @module lists
 */

import { state } from './state.js';
import { escapeHtml, showToast } from './utils.js';
import api from './api.js';

// ============================================================================
// LIST LOADING
// ============================================================================

/**
 * Load all lists for the current user
 */
export async function loadLists() {
    const grid = document.getElementById('lists-grid');
    if (!grid) return;

    if (!state.instanceId) {
        grid.innerHTML = '<div class="empty-placeholder">Bootstrap to see lists</div>';
        return;
    }

    grid.innerHTML = '<div class="loading-placeholder">Loading lists...</div>';

    try {
        const result = await api.getLists(state.instanceId);
        state.lists = result.lists || [];

        renderListsGrid();
    } catch (error) {
        console.error('[Lists] Error loading lists:', error);
        grid.innerHTML = `<div class="error-placeholder">Error: ${escapeHtml(error.message)}</div>`;
    }
}

/**
 * Render lists grid
 */
export function renderListsGrid() {
    const grid = document.getElementById('lists-grid');
    if (!grid) return;

    if (state.lists.length === 0) {
        grid.innerHTML = `
            <div class="empty-placeholder">
                No lists yet
                <button class="btn btn-primary" onclick="window.showCreateListModal()">Create List</button>
            </div>
        `;
        return;
    }

    grid.innerHTML = state.lists.map(list => `
        <div class="list-card" data-list-id="${escapeHtml(list.id || list.listId)}">
            <div class="list-name">${escapeHtml(list.name)}</div>
            <div class="list-meta">
                <span class="list-item-count">${list.itemCount || 0} items</span>
                <span class="list-checked-count">${list.checkedCount || 0} done</span>
            </div>
        </div>
    `).join('');

    // Add click handlers
    grid.querySelectorAll('.list-card').forEach(card => {
        card.addEventListener('click', () => {
            const listId = card.dataset.listId;
            showListDetail(listId);
        });
    });
}

// ============================================================================
// LIST DETAIL
// ============================================================================

/**
 * Show list detail
 * @param {string} listId - List ID
 */
export async function showListDetail(listId) {
    state.currentListId = listId;

    const detailView = document.getElementById('list-detail-view');
    const grid = document.getElementById('lists-grid');

    if (!detailView || !grid) return;

    grid.style.display = 'none';
    detailView.style.display = 'block';

    try {
        const result = await api.getList(state.instanceId, listId);
        state.currentList = result.list || result;

        renderListDetail();
    } catch (error) {
        showToast('Error loading list: ' + error.message, 'error');
    }
}

/**
 * Render list detail view
 */
function renderListDetail() {
    const list = state.currentList;
    if (!list) return;

    document.getElementById('list-detail-name').textContent = list.name;

    const itemsContainer = document.getElementById('list-items');
    const items = list.items || [];

    if (items.length === 0) {
        itemsContainer.innerHTML = '<div class="empty-placeholder">No items yet</div>';
        return;
    }

    itemsContainer.innerHTML = items.map(item => `
        <div class="list-item ${item.checked ? 'checked' : ''}" data-item-id="${escapeHtml(item.id)}">
            <input type="checkbox" ${item.checked ? 'checked' : ''} class="item-checkbox">
            <span class="item-text">${escapeHtml(item.text)}</span>
            <button class="btn btn-icon btn-danger item-delete">&times;</button>
        </div>
    `).join('');

    // Add checkbox handlers
    itemsContainer.querySelectorAll('.item-checkbox').forEach(cb => {
        cb.addEventListener('change', () => {
            const itemId = cb.closest('.list-item').dataset.itemId;
            toggleListItem(itemId);
        });
    });

    // Add delete handlers
    itemsContainer.querySelectorAll('.item-delete').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const itemId = btn.closest('.list-item').dataset.itemId;
            deleteListItem(itemId);
        });
    });
}

/**
 * Hide list detail
 */
export function hideListDetail() {
    const detailView = document.getElementById('list-detail-view');
    const grid = document.getElementById('lists-grid');

    if (detailView) detailView.style.display = 'none';
    if (grid) grid.style.display = 'grid';

    state.currentListId = null;
    state.currentList = null;
}

// ============================================================================
// LIST ITEM ACTIONS
// ============================================================================

/**
 * Toggle list item checked state
 * @param {string} itemId - Item ID
 */
export async function toggleListItem(itemId) {
    try {
        await api.toggleListItem(state.instanceId, state.currentListId, itemId);
        showListDetail(state.currentListId);
    } catch (error) {
        showToast('Error toggling item: ' + error.message, 'error');
    }
}

/**
 * Add item to current list
 * @param {string} text - Item text
 */
export async function addListItem(text) {
    if (!text?.trim()) return;

    try {
        await api.addListItem(state.instanceId, state.currentListId, text);
        showToast('Item added!', 'success');
        showListDetail(state.currentListId);
    } catch (error) {
        showToast('Error adding item: ' + error.message, 'error');
    }
}

/**
 * Delete list item
 * @param {string} itemId - Item ID
 */
export async function deleteListItem(itemId) {
    try {
        await api.deleteListItem(state.instanceId, state.currentListId, itemId);
        showListDetail(state.currentListId);
    } catch (error) {
        showToast('Error deleting item: ' + error.message, 'error');
    }
}

// ============================================================================
// LIST CREATION
// ============================================================================

/**
 * Show create list modal
 */
export function showCreateListModal() {
    // TODO: Implement create list modal
    showToast('Create list modal coming soon', 'info');
}

// ============================================================================
// EXPORTS
// ============================================================================

window.showCreateListModal = showCreateListModal;

export default {
    loadLists,
    renderListsGrid,
    showListDetail,
    hideListDetail,
    toggleListItem,
    addListItem,
    deleteListItem,
    showCreateListModal
};
