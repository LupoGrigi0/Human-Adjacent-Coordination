/**
 * Instances Module
 *
 * Handles instance listing and instance-related operations.
 * Instance detail panel is provided by details.js for reuse.
 *
 * @module instances
 */

import { state } from './state.js';
import { escapeHtml, showToast, formatDateTime, getAvatarChar } from './utils.js';
import { showInstanceDetail } from './details.js';
import api from './api.js';

// ============================================================================
// INSTANCE LOADING
// ============================================================================

/**
 * Load all instances
 */
export async function loadInstances() {
    const grid = document.getElementById('instances-grid');
    if (!grid) return;

    grid.innerHTML = '<div class="loading-placeholder">Loading instances...</div>';

    try {
        const result = await api.getAllInstances(state.instanceId);
        state.instances = result.instances || [];

        renderInstancesGrid();
    } catch (error) {
        console.error('[Instances] Error loading instances:', error);
        grid.innerHTML = `<div class="error-placeholder">Error: ${escapeHtml(error.message)}</div>`;
    }
}

/**
 * Render instances grid
 */
export function renderInstancesGrid() {
    const grid = document.getElementById('instances-grid');
    if (!grid) return;

    if (state.instances.length === 0) {
        grid.innerHTML = '<div class="empty-placeholder">No instances found</div>';
        return;
    }

    grid.innerHTML = state.instances.map(inst => {
        const isOnline = inst.status === 'active';
        const avatarChar = getAvatarChar(inst.name);

        return `
            <div class="instance-card" data-instance-id="${escapeHtml(inst.instanceId)}">
                <div class="instance-avatar ${isOnline ? 'online' : ''}">${avatarChar}</div>
                <div class="instance-info">
                    <div class="instance-name">${escapeHtml(inst.name || 'Unknown')}</div>
                    <div class="instance-role">${escapeHtml(inst.role || 'No role')}</div>
                    <div class="instance-project">${escapeHtml(inst.project || 'No project')}</div>
                </div>
                <div class="instance-status-badge ${isOnline ? 'online' : 'offline'}">
                    ${isOnline ? 'Online' : 'Offline'}
                </div>
                <div class="project-selector" data-instance-id="${escapeHtml(inst.instanceId)}">
                    <button class="btn btn-small btn-secondary project-selector-btn">
                        ${escapeHtml(inst.project || 'Assign Project')} \u25BC
                    </button>
                    <div class="project-dropdown" style="display: none;"></div>
                </div>
            </div>
        `;
    }).join('');

    // Add click handlers for instance cards
    grid.querySelectorAll('.instance-card').forEach(card => {
        card.addEventListener('click', (e) => {
            // Don't trigger if clicking project selector
            if (e.target.closest('.project-selector')) return;

            const instanceId = card.dataset.instanceId;
            showInstanceDetail(instanceId, true);
        });
    });

    // Setup project selector dropdowns
    setupProjectSelectors();
}

/**
 * Setup project selector dropdowns
 */
function setupProjectSelectors() {
    document.querySelectorAll('.project-selector').forEach(selector => {
        const btn = selector.querySelector('.project-selector-btn');
        const dropdown = selector.querySelector('.project-dropdown');

        btn?.addEventListener('click', (e) => {
            e.stopPropagation();

            // Close other dropdowns
            document.querySelectorAll('.project-dropdown').forEach(d => {
                if (d !== dropdown) d.style.display = 'none';
            });

            // Toggle this dropdown
            if (dropdown.style.display === 'none') {
                // Populate with projects - use projectId for API, name for display
                dropdown.innerHTML = `
                    <div class="project-option" data-project="">None</div>
                    ${state.projects.map(p => {
                        const id = p.projectId || p.id;
                        const name = p.name || id;
                        return `<div class="project-option" data-project="${escapeHtml(id)}">${escapeHtml(name)}</div>`;
                    }).join('')}
                `;

                // Add click handlers for options
                dropdown.querySelectorAll('.project-option').forEach(opt => {
                    opt.addEventListener('click', async (ev) => {
                        ev.stopPropagation();
                        const targetInstanceId = selector.dataset.instanceId;
                        const projectId = opt.dataset.project;
                        const displayName = opt.textContent; // User-friendly name

                        console.log('[Instances] Assigning project to instance:', {
                            targetInstanceId,
                            projectId: projectId || '(none)'
                        });

                        try {
                            // Use joinProject API - it takes instanceId and projectId
                            await api.joinProject(targetInstanceId, projectId || null);
                            showToast(`Assigned to ${displayName}`, 'success');
                            dropdown.style.display = 'none';
                            loadInstances(); // Refresh
                        } catch (error) {
                            console.error('[Instances] Error assigning project:', {
                                targetInstanceId,
                                projectId: projectId,
                                error: error.message,
                                code: error.code
                            });
                            showToast('Failed to assign project: ' + error.message, 'error');
                        }
                    });
                });

                dropdown.style.display = 'block';
            } else {
                dropdown.style.display = 'none';
            }
        });
    });

    // Close dropdowns when clicking elsewhere
    document.addEventListener('click', () => {
        document.querySelectorAll('.project-dropdown').forEach(d => {
            d.style.display = 'none';
        });
    });
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
    loadInstances,
    renderInstancesGrid
};
