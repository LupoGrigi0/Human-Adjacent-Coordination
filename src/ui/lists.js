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

    if (!state.instanceId) {
        grid.innerHTML = '<div class="empty-placeholder">Bootstrap to see lists</div>';
        return;
    }

    grid.innerHTML = '<div class="loading-placeholder">Loading lists...</div>';

    try {
        const result = await api.getLists(state.instanceId);
        const lists = result.lists || [];
        state.lists = lists;

        if (lists.length === 0) {
            grid.innerHTML = `
                <div class="empty-placeholder">
                    <p>No lists yet. Create your first list!</p>
                </div>
            `;
            return;
        }

        grid.innerHTML = lists.map(list => {
            const itemCount = list.itemCount || list.items?.length || 0;
            const completedCount = list.completedCount || 0;
            return `
                <div class="list-card" data-list-id="${list.id || list.listId}">
                    <div class="list-card-name">${escapeHtml(list.name)}</div>
                    <div class="list-card-description">${escapeHtml(list.description || 'No description')}</div>
                    <div class="list-card-stats">
                        <span>&#128203; ${itemCount} items</span>
                        ${completedCount > 0 ? `<span>&#9745; ${completedCount} done</span>` : ''}
                    </div>
                </div>
            `;
        }).join('');

        // Add click handlers
        grid.querySelectorAll('.list-card').forEach(card => {
            card.addEventListener('click', () => {
                showListDetail(card.dataset.listId);
            });
        });
    } catch (error) {
        console.error('[App] Error loading lists:', error);
        grid.innerHTML = `<div class="empty-placeholder">Error loading lists: ${escapeHtml(error.message)}</div>`;
    }
}

// ============================================================================
// LIST DETAIL
// ============================================================================

/**
 * Show list detail panel with items
 * @param {string} listId - List ID
 */
export async function showListDetail(listId) {
    state.currentListId = listId;

    // Hide grid, show detail panel
    document.getElementById('lists-grid').parentElement.style.display = 'none';
    document.getElementById('list-detail-panel').style.display = 'flex';

    const nameEl = document.getElementById('list-detail-name');
    const descEl = document.getElementById('list-detail-description');
    const itemsEl = document.getElementById('list-items');

    nameEl.textContent = 'Loading...';
    descEl.textContent = '';
    itemsEl.innerHTML = '<div class="loading-placeholder">Loading items...</div>';

    try {
        const result = await api.getList(state.instanceId, listId);
        const list = result.list || result;
        state.currentList = list;

        nameEl.textContent = list.name;
        descEl.textContent = list.description || 'No description';

        renderListItems(list.items || []);
    } catch (error) {
        console.error('[App] Error loading list:', error);
        itemsEl.innerHTML = `<div class="empty-placeholder">Error: ${escapeHtml(error.message)}</div>`;
    }
}

/**
 * Render list items
 * @param {Array} items - Array of list items
 */
function renderListItems(items) {
    const container = document.getElementById('list-items');

    if (!items || items.length === 0) {
        container.innerHTML = '<div class="empty-placeholder">No items yet. Add one above!</div>';
        return;
    }

    container.innerHTML = items.map(item => `
        <div class="list-item ${item.completed ? 'completed' : ''}" data-item-id="${item.id || item.itemId}">
            <input type="checkbox" class="list-item-checkbox"
                   ${item.completed ? 'checked' : ''}
                   onchange="toggleListItem('${item.id || item.itemId}')">
            <span class="list-item-text">${escapeHtml(item.text)}</span>
            <button class="list-item-delete" onclick="deleteListItem('${item.id || item.itemId}')" title="Delete item">
                &#128465;
            </button>
        </div>
    `).join('');
}

/**
 * Hide list detail, return to grid
 */
export function hideListDetail() {
    document.getElementById('list-detail-panel').style.display = 'none';
    document.getElementById('lists-grid').parentElement.style.display = 'flex';
    state.currentListId = null;
    state.currentList = null;
}

// ============================================================================
// LIST ITEM ACTIONS
// ============================================================================

/**
 * Toggle a list item's completed state
 * @param {string} itemId - Item ID
 */
export async function toggleListItem(itemId) {
    if (!state.currentListId || !state.instanceId) return;

    // Optimistic UI update - toggle locally first
    if (state.currentList && state.currentList.items) {
        const item = state.currentList.items.find(i => (i.id || i.itemId) === itemId);
        if (item) {
            item.completed = !item.completed;
            renderListItems(state.currentList.items);
        }
    }

    try {
        const result = await api.toggleListItem(state.instanceId, state.currentListId, itemId);
        console.log('[App] Toggle result:', result);
        // Refresh grid counts in background
        loadLists();
    } catch (error) {
        console.error('[App] Error toggling item:', error);
        showToast('Could not update item: ' + error.message, 'error');
        // Revert optimistic update on error
        await showListDetail(state.currentListId);
    }
}

/**
 * Delete a list item
 * @param {string} itemId - Item ID
 */
export async function deleteListItem(itemId) {
    if (!state.currentListId || !state.instanceId) return;

    try {
        await api.deleteListItem(state.instanceId, state.currentListId, itemId);
        showToast('Item deleted', 'success');
        // Refresh the list and grid counts
        await showListDetail(state.currentListId);
        loadLists();
    } catch (error) {
        console.error('[App] Error deleting item:', error);
        showToast('Could not delete item: ' + error.message, 'error');
    }
}

/**
 * Add a new item to the current list
 */
export async function addListItem() {
    const input = document.getElementById('new-item-input');
    const text = input.value.trim();

    if (!text || !state.currentListId || !state.instanceId) return;

    try {
        await api.addListItem(state.instanceId, state.currentListId, text);
        input.value = '';
        showToast('Item added!', 'success');
        // Refresh the list and grid counts
        await showListDetail(state.currentListId);
        loadLists();
    } catch (error) {
        console.error('[App] Error adding item:', error);
        showToast('Could not add item: ' + error.message, 'error');
    }
}

// ============================================================================
// LIST MANAGEMENT
// ============================================================================

/**
 * Show create list modal
 */
export function showCreateListModal() {
    document.getElementById('create-list-modal').classList.add('active');
    document.getElementById('list-name').value = '';
    document.getElementById('list-description').value = '';
    document.getElementById('list-name').focus();
}

/**
 * Close create list modal
 */
export function closeCreateListModal() {
    document.getElementById('create-list-modal').classList.remove('active');
}

/**
 * Create a new list
 */
export async function createList() {
    const name = document.getElementById('list-name').value.trim();
    const description = document.getElementById('list-description').value.trim();

    if (!name) {
        showToast('Please enter a list name', 'error');
        return;
    }

    if (!state.instanceId) {
        showToast('Not connected', 'error');
        return;
    }

    try {
        const result = await api.createList(state.instanceId, name, description || undefined);

        if (result.success !== false && !result.error) {
            showToast(`List "${name}" created!`, 'success');
            closeCreateListModal();
            loadLists();
        } else {
            showToast(result.error?.message || 'Failed to create list', 'error');
        }
    } catch (error) {
        console.error('[App] Create list error:', error);
        showToast('Error creating list: ' + error.message, 'error');
    }
}

/**
 * Delete the current list
 */
export async function deleteCurrentList() {
    if (!state.currentListId || !state.instanceId) return;

    const listName = state.currentList?.name || 'this list';
    if (!confirm(`Are you sure you want to delete "${listName}"? This cannot be undone.`)) {
        return;
    }

    try {
        await api.deleteList(state.instanceId, state.currentListId);
        showToast('List deleted', 'success');
        hideListDetail();
        loadLists();
    } catch (error) {
        console.error('[App] Error deleting list:', error);
        showToast('Could not delete list: ' + error.message, 'error');
    }
}

/**
 * Rename the current list
 */
export async function renameCurrentList() {
    if (!state.currentListId || !state.instanceId) return;

    const currentName = state.currentList?.name || '';
    const newName = prompt('Enter new name:', currentName);

    if (!newName || newName.trim() === currentName) return;

    try {
        await api.renameList(state.instanceId, state.currentListId, newName.trim());
        showToast('List renamed', 'success');
        document.getElementById('list-detail-name').textContent = newName.trim();
        loadLists(); // Refresh sidebar
    } catch (error) {
        console.error('[App] Error renaming list:', error);
        showToast('Could not rename list: ' + error.message, 'error');
    }
}

// ============================================================================
// WINDOW GLOBALS
// ============================================================================

// Make functions globally accessible for onclick handlers
window.toggleListItem = toggleListItem;
window.deleteListItem = deleteListItem;

// ============================================================================
// DEFAULT EXPORT
// ============================================================================

export default {
    loadLists,
    showListDetail,
    hideListDetail,
    toggleListItem,
    deleteListItem,
    addListItem,
    showCreateListModal,
    closeCreateListModal,
    createList,
    deleteCurrentList,
    renameCurrentList
};
