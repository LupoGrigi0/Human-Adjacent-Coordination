/**
 * Instances Module
 *
 * Handles instance listing, instance detail views, and the wake/conversation system.
 * This is a comprehensive module that includes:
 * - Instance grid loading and rendering
 * - In-page instance detail panel
 * - Wake instance modal and functionality
 * - Real-time conversation panel with continue_conversation API
 *
 * @module instances
 */

import { state } from './state.js';
import { escapeHtml, showToast, formatDateTime, getAvatarChar } from './utils.js';
import { showInstanceDetail as showInstanceDetailModal } from './details.js';
import api from './api.js';
import * as uiConfig from './ui-config.js';

// ============================================================================
// CONSTANTS
// ============================================================================

/**
 * Privileged roles that require promotion tokens
 * These are hidden from Wake dropdown (but available in Pre-approve for creating new instances)
 */
const PRIVILEGED_ROLES = ['PM', 'PA', 'COO', 'Executive'];

// ============================================================================
// INSTANCE LOADING
// ============================================================================

/**
 * Load all instances and render the grid
 */
export async function loadInstances() {
    const grid = document.getElementById('instances-grid');
    grid.innerHTML = '<div class="loading-placeholder">Loading instances...</div>';

    try {
        // Fetch instances from API
        const result = await api.getInstances();
        const instances = result.instances || [];
        state.instances = instances;

        if (instances.length === 0) {
            grid.innerHTML = '<div class="empty-placeholder">No instances found</div>';
            return;
        }

        grid.innerHTML = instances.map(instance => {
            const displayName = instance.name || instance.instanceId || 'Unknown';
            const avatarChar = displayName.charAt(0).toUpperCase();

            // Per CANVAS_WAKE_CONTINUE_GUIDE.md:
            // - sessionId EXISTS → can use continue_conversation
            // - sessionId NULL → must call wake_instance first
            //
            // KNOWN ISSUE: get_all_instances API doesn't return sessionId
            // Bridge should update the API to include sessionId from preferences.json
            // For now, we show Continue for instances with roles (except self)
            // The Continue handler will check for session and offer Wake if needed
            const hasSession = !!instance.sessionId;
            const hasRole = !!instance.role;
            const isSelf = instance.instanceId === state.instanceId;

            // Status dot color:
            // - Green: has sessionId (confirmed woken via continue_conversation)
            // - Yellow: has role (may or may not be woken - API doesn't tell us)
            // - Grey: no role or is self
            let statusDotClass = 'status-dot-offline';
            let statusTitle = 'No role assigned';
            if (isSelf) {
                statusDotClass = 'status-dot-offline';
                statusTitle = 'This is you';
            } else if (hasSession) {
                statusDotClass = 'status-dot-online';
                statusTitle = 'Woken - can chat';
            } else if (hasRole) {
                statusDotClass = 'status-dot-preapproved';
                statusTitle = 'Has role - click Continue to chat';
            }

            // Button logic:
            // - Don't show Continue for self (can't talk to yourself)
            // - "Continue" if has role (will check session on click)
            // - Nothing if no role
            let actionButtonHtml = '';
            if (hasRole && !isSelf) {
                actionButtonHtml = `<button class="btn btn-small btn-primary instance-action-chat" data-instance-id="${instance.instanceId}" title="Continue conversation">Continue</button>`;
            }

            // ZeroClaw status icons
            const zc = instance.zeroclaw;
            let zcIconHtml = '';
            if (zc?.enabled) {
                zcIconHtml = `<a class="zc-live-icon" href="${escapeHtml(zc.webUrl || '#')}" target="_blank" title="Live in ZeroClaw (${escapeHtml(zc.provider || '')}/${escapeHtml(zc.model || '')})" onclick="event.stopPropagation()">&#128640;</a>`;
            } else if (zc?.ready || instance.interface === 'zeroclaw') {
                zcIconHtml = `<span class="zc-ready-icon" title="ZeroClaw ready (not running)">&#129430;</span>`;
            }

            return `
            <div class="instance-card" data-instance-id="${instance.instanceId || ''}">
                <div class="instance-card-icons">
                    ${zcIconHtml}
                    <span class="instance-info-icon instance-action-details" data-instance-id="${instance.instanceId}" title="View details">&#9432;</span>
                    <span class="instance-status-dot ${statusDotClass}" title="${statusTitle}"></span>
                </div>
                <div class="instance-header">
                    <div class="instance-avatar">${avatarChar}</div>
                    <div>
                        <div class="instance-name">${escapeHtml(displayName)}</div>
                        <div class="instance-id">${escapeHtml(instance.instanceId || '')}</div>
                    </div>
                </div>
                <div class="instance-meta">
                    <span class="instance-role-badge">${instance.role || 'No role'}</span>
                    <div class="project-selector" data-instance-id="${instance.instanceId}">
                        <span class="instance-project-badge project-trigger">${instance.project || 'No project'}</span>
                        <div class="project-dropdown" style="display: none;"></div>
                    </div>
                </div>
                <div class="instance-actions">
                    <button class="btn btn-small btn-primary instance-action-message" data-instance-id="${instance.instanceId}" title="Send XMPP message">Message</button>
                    ${actionButtonHtml}
                </div>
            </div>`;
        }).join('');

        // Add click handlers for action buttons
        grid.querySelectorAll('.instance-action-chat').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                openConversationPanel(btn.dataset.instanceId);
            });
        });

        grid.querySelectorAll('.instance-action-wake').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const instanceId = btn.dataset.instanceId;
                const apiKey = await ensureApiKey();
                if (!apiKey) return;

                btn.disabled = true;
                btn.textContent = 'Waking...';

                try {
                    const wakeParams = {
                        instanceId: state.instanceId,
                        targetInstanceId: instanceId,
                        apiKey: apiKey ? '[REDACTED]' : undefined
                    };
                    console.log('[Wake API] WAKE_FROM_CARD request:', JSON.stringify(wakeParams, null, 2));

                    const result = await api.wakeInstance({
                        instanceId: state.instanceId,
                        targetInstanceId: instanceId,
                        apiKey: apiKey
                    });

                    console.log('[Wake API] WAKE_FROM_CARD response:', JSON.stringify(result, null, 2));

                    if (result.success || !result.error) {
                        showToast(`Instance ${instanceId} is now awake!`, 'success');
                        loadInstances();
                        openConversationPanel(instanceId);
                    } else {
                        throw new Error(result.error?.message || 'Wake failed');
                    }
                } catch (error) {
                    console.error('[Wake API] Error:', error);
                    showToast('Wake failed: ' + error.message, 'error');
                    btn.disabled = false;
                    btn.textContent = 'Wake';
                }
            });
        });

        grid.querySelectorAll('.instance-action-message').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                messageInstance(btn.dataset.instanceId);
            });
        });

        grid.querySelectorAll('.instance-action-details').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                showInstanceDetail(btn.dataset.instanceId);
            });
        });

        // Project selector dropdowns
        grid.querySelectorAll('.project-trigger').forEach(trigger => {
            trigger.addEventListener('click', async (e) => {
                e.stopPropagation();
                const selector = trigger.closest('.project-selector');
                const dropdown = selector.querySelector('.project-dropdown');

                // Close any other open dropdowns
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
    } catch (error) {
        console.error('[Instances] Error loading instances:', error);
        grid.innerHTML = `<div class="empty-placeholder">Error: ${escapeHtml(error.message)}</div>`;
    }
}

// ============================================================================
// INSTANCE DETAIL PANEL (In-Page)
// ============================================================================

/**
 * Show instance detail panel (in-page version)
 * @param {string} instanceId - Instance ID to show
 */
export async function showInstanceDetail(instanceId) {
    const instance = state.instances.find(i => i.instanceId === instanceId);
    if (!instance) {
        showToast('Instance not found', 'error');
        return;
    }

    state.currentInstanceDetail = instanceId;

    // Hide grid, show detail
    document.getElementById('instances-grid').style.display = 'none';
    document.querySelector('#tab-instances .page-header').style.display = 'none';
    document.getElementById('instance-detail-view').style.display = 'block';

    // Populate detail fields
    const displayName = instance.name || instance.instanceId || 'Unknown';
    document.getElementById('instance-detail-name').textContent = displayName;
    document.getElementById('instance-detail-id').textContent = instance.instanceId || '-';
    document.getElementById('instance-detail-role').textContent = instance.role || 'None';
    document.getElementById('instance-detail-personality').textContent = instance.personality || 'None';
    document.getElementById('instance-detail-status').textContent = instance.status || 'Unknown';
    document.getElementById('instance-detail-home').textContent = instance.homeDirectory || '-';
    document.getElementById('instance-detail-last-active').textContent =
        instance.lastActiveAt ? new Date(instance.lastActiveAt).toLocaleString() : 'Never';
    document.getElementById('instance-detail-instructions').textContent =
        instance.instructions || 'No instructions set';

    // Populate project dropdown
    const projectSelect = document.getElementById('instance-detail-project-select');
    const projectSaveBtn = document.getElementById('instance-detail-project-save');
    const projectNames = state.projects.map(p => p.name || p.projectId);
    projectSelect.innerHTML = '<option value="">No project</option>' +
        projectNames.map(name =>
            `<option value="${escapeHtml(name)}" ${instance.project === name ? 'selected' : ''}>${escapeHtml(name)}</option>`
        ).join('');
    projectSaveBtn.style.display = 'none';

    // Handle project change
    projectSelect.onchange = () => {
        const newProject = projectSelect.value;
        const changed = newProject !== (instance.project || '');
        projectSaveBtn.style.display = changed ? 'inline-flex' : 'none';
    };

    // Handle project save
    projectSaveBtn.onclick = async () => {
        const newProject = projectSelect.value;
        projectSaveBtn.disabled = true;
        projectSaveBtn.textContent = 'Saving...';

        console.log('[Instances] Saving project assignment from detail panel:', {
            targetInstanceId: instance.instanceId,
            project: newProject || '(none)'
        });

        try {
            // Use joinProject API - it takes instanceId (the target) and project name
            await api.joinProject(instance.instanceId, newProject || null);
            // Update local state
            instance.project = newProject || null;
            showToast('Project updated', 'success');
            projectSaveBtn.style.display = 'none';
            loadInstances(); // Refresh the grid
        } catch (error) {
            console.error('[Instances] Error updating project:', {
                targetInstanceId: instance.instanceId,
                project: newProject,
                error: error.message,
                code: error.code
            });
            showToast('Failed to update project: ' + error.message, 'error');
        } finally {
            projectSaveBtn.disabled = false;
            projectSaveBtn.textContent = 'Save';
        }
    };

    // Update avatar
    const avatarChar = displayName.charAt(0).toUpperCase();
    document.getElementById('instance-detail-avatar').textContent = avatarChar;
    document.getElementById('instance-detail-avatar').className =
        `instance-avatar-large ${instance.status === 'active' ? 'online' : ''}`;

    // Per CANVAS_WAKE_CONTINUE_GUIDE.md:
    // - sessionId EXISTS → can use continue_conversation
    // - sessionId NULL → must call wake_instance first
    //
    // KNOWN ISSUE: get_all_instances doesn't return sessionId
    // Bridge should update API to include sessionId from preferences.json
    const hasSession = !!instance.sessionId;
    const hasRole = !!instance.role;
    const isSelf = instance.instanceId === state.instanceId;

    // Update buttons based on state
    const chatBtn = document.getElementById('instance-chat-btn');
    const wakeBtn = document.getElementById('instance-wake-btn');

    if (isSelf) {
        // Can't talk to yourself
        chatBtn.style.display = 'none';
        wakeBtn.style.display = 'none';
    } else if (hasRole) {
        // Instance has role - show Continue (will detect NO_SESSION on use)
        chatBtn.style.display = 'inline-flex';
        chatBtn.textContent = 'Continue';
        chatBtn.title = 'Continue conversation';
        // Also show Wake for manual control
        wakeBtn.style.display = 'inline-flex';
        wakeBtn.textContent = 'Wake';
        wakeBtn.title = 'Wake instance (use if Continue fails)';
    } else {
        // Instance has no role - can't interact
        chatBtn.style.display = 'none';
        wakeBtn.style.display = 'none';
    }

    // Also show sessionId in the status if present
    if (hasSession) {
        document.getElementById('instance-detail-status').textContent =
            `Active (Session: ${instance.sessionId.substring(0, 8)}...)`;
    }

    // Always show all instance data as preferences (we get the full data from API)
    const prefsSection = document.getElementById('instance-preferences-section');
    const prefsContent = document.getElementById('instance-detail-preferences');
    // Show the full instance data we received
    const displayData = instance.preferences || instance.raw || instance;
    // Filter out sensitive fields
    const safeData = { ...displayData };
    delete safeData.authToken;
    delete safeData.apiKey;
    delete safeData.xmppPassword;
    prefsContent.textContent = JSON.stringify(safeData, null, 2);
    prefsSection.style.display = 'block';
}

/**
 * Hide instance detail, return to grid
 */
export function hideInstanceDetail() {
    document.getElementById('instance-detail-view').style.display = 'none';
    document.getElementById('instances-grid').style.display = 'grid';
    document.querySelector('#tab-instances .page-header').style.display = 'flex';
    state.currentInstanceDetail = null;
}

/**
 * Send message to current instance (from detail panel)
 */
export function messageCurrentInstance() {
    if (!state.currentInstanceDetail) return;

    const instance = state.instances.find(i => i.instanceId === state.currentInstanceDetail);
    if (!instance) return;

    // Use window.switchTab if available (set by app.js)
    if (typeof window.switchTab === 'function') {
        window.switchTab('messages');
        setTimeout(() => {
            if (typeof window.selectConversation === 'function') {
                window.selectConversation('dm', instance.name || instance.instanceId);
            }
        }, 100);
    }
}

/**
 * Send XMPP message to a specific instance (by instanceId)
 * @param {string} instanceId - Instance ID to message
 */
export function messageInstance(instanceId) {
    const instance = state.instances.find(i => i.instanceId === instanceId);
    const dmName = instance?.name || instanceId.split('-')[0];

    // Use window.switchTab if available (set by app.js)
    if (typeof window.switchTab === 'function') {
        window.switchTab('messages');
        setTimeout(() => {
            if (typeof window.selectConversation === 'function') {
                window.selectConversation('dm', dmName);
            }
        }, 100);
    }
}

// ============================================================================
// API KEY MANAGEMENT
// ============================================================================

/**
 * Check if we have an API key, prompt if not
 * @returns {Promise<string|null>} The API key or null if cancelled
 */
export async function ensureApiKey() {
    // Check sessionStorage first
    if (state.wakeApiKey) {
        return state.wakeApiKey;
    }

    // Check localStorage if user wanted to remember
    const stored = localStorage.getItem('v2_wake_api_key');
    if (stored) {
        state.wakeApiKey = stored;
        return stored;
    }

    // Prompt user
    return new Promise((resolve) => {
        const modal = document.getElementById('api-key-modal');
        modal.classList.add('active');

        // Store resolve for later
        modal._resolve = resolve;
    });
}

/**
 * Handle API key submit
 */
export function handleApiKeySubmit() {
    const input = document.getElementById('api-key-input');
    const remember = document.getElementById('api-key-remember');
    const modal = document.getElementById('api-key-modal');

    const key = input.value.trim();
    if (!key) {
        showToast('Please enter an API key', 'error');
        return;
    }

    state.wakeApiKey = key;

    if (remember.checked) {
        localStorage.setItem('v2_wake_api_key', key);
    }

    input.value = '';
    modal.classList.remove('active');

    // Resolve the promise if waiting
    if (modal._resolve) {
        modal._resolve(key);
        modal._resolve = null;
    }

    showToast('API key saved for this session', 'success');
}

// ============================================================================
// WAKE INSTANCE MODAL
// ============================================================================

/**
 * Show wake instance modal and populate dropdowns
 */
export async function showWakeInstanceModal() {
    const modal = document.getElementById('wake-instance-modal');
    modal.classList.add('active');

    // Clear form
    document.getElementById('wake-name').value = '';
    document.getElementById('wake-instructions').value = '';
    document.getElementById('wake-specific-id').checked = false;
    document.getElementById('wake-specific-id-group').style.display = 'none';
    document.getElementById('wake-instance-id').value = '';

    // Populate dropdowns (will reset selections)
    await populateWakeDropdowns();

    // Reset dropdown selections
    document.getElementById('wake-role').selectedIndex = 0;
    document.getElementById('wake-personality').selectedIndex = 0;
    document.getElementById('wake-project').selectedIndex = 0;
}

/**
 * Populate role, personality, and project dropdowns
 */
export async function populateWakeDropdowns() {
    const roleSelect = document.getElementById('wake-role');
    const personalitySelect = document.getElementById('wake-personality');
    const projectSelect = document.getElementById('wake-project');

    // Try to fetch from API, fall back to config
    try {
        const rolesResult = await api.getRoles();
        if (rolesResult.roles) {
            state.availableRoles = rolesResult.roles;
        }
    } catch (e) {
        console.log('[Instances] Using default roles from config');
        state.availableRoles = uiConfig.AVAILABLE_ROLES;
    }

    try {
        const personalitiesResult = await api.getPersonalities();
        if (personalitiesResult.personalities) {
            state.availablePersonalities = personalitiesResult.personalities;
        }
    } catch (e) {
        console.log('[Instances] Using default personalities from config');
        state.availablePersonalities = uiConfig.AVAILABLE_PERSONALITIES;
    }

    // Filter out privileged roles from Wake dropdown
    // Privileged roles (PM, PA, COO, Executive) require promotion tokens
    const nonPrivilegedRoles = state.availableRoles.filter(r => {
        const roleId = r.id || r;
        return !PRIVILEGED_ROLES.includes(roleId);
    });

    // Populate role dropdown (non-privileged only)
    roleSelect.innerHTML = '<option value="">Select role...</option>' +
        nonPrivilegedRoles.map(r =>
            `<option value="${r.id || r}">${r.label || r.name || r}</option>`
        ).join('');

    // Populate personality dropdown
    personalitySelect.innerHTML = '<option value="">Select personality...</option>' +
        state.availablePersonalities.map(p =>
            `<option value="${p.id || p}">${p.label || p.name || p}</option>`
        ).join('');

    // Populate project dropdown - use projectId for value, name for display
    projectSelect.innerHTML = '<option value="">No project assignment</option>' +
        state.projects.map(p => {
            const id = p.projectId || p.id;
            const name = p.name || id;
            return `<option value="${escapeHtml(id)}">${escapeHtml(name)}</option>`;
        }).join('');
}

/**
 * Toggle visibility of specific instance ID field
 */
export function toggleWakeSpecificId() {
    const checkbox = document.getElementById('wake-specific-id');
    const group = document.getElementById('wake-specific-id-group');
    const submitBtn = document.getElementById('wake-instance-submit');

    group.style.display = checkbox.checked ? 'block' : 'none';
    submitBtn.textContent = checkbox.checked ? 'Wake Instance' : 'Pre-approve & Wake';
}

/**
 * Handle wake form submission
 */
export async function handleWakeSubmit() {
    const apiKey = await ensureApiKey();
    if (!apiKey) {
        showToast('API key required for wake operations', 'error');
        return;
    }

    const isSpecific = document.getElementById('wake-specific-id').checked;
    const submitBtn = document.getElementById('wake-instance-submit');
    const originalText = submitBtn.textContent;

    try {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Working...';

        let targetInstanceId;

        if (isSpecific) {
            // Wake existing pre-approved instance
            targetInstanceId = document.getElementById('wake-instance-id').value.trim();
            if (!targetInstanceId) {
                showToast('Please enter an instance ID', 'error');
                return;
            }
        } else {
            // Pre-approve first, then wake
            const name = document.getElementById('wake-name').value.trim();
            if (!name) {
                showToast('Please enter an instance name', 'error');
                return;
            }

            const role = document.getElementById('wake-role').value;
            const personality = document.getElementById('wake-personality').value;
            const project = document.getElementById('wake-project').value;
            const instructions = document.getElementById('wake-instructions').value.trim();

            // Pre-approve
            const preApproveParams = {
                instanceId: state.instanceId,
                name: name,
                role: role || undefined,
                personality: personality || undefined,
                project: project || undefined,
                instructions: instructions || undefined,
                apiKey: apiKey ? '[REDACTED]' : undefined
            };
            console.log('[Wake API] PRE_APPROVE request:', JSON.stringify(preApproveParams, null, 2));

            const preApproveResult = await api.preApprove({
                instanceId: state.instanceId,
                name: name,
                role: role || undefined,
                personality: personality || undefined,
                project: project || undefined,
                instructions: instructions || undefined,
                apiKey: apiKey
            });

            console.log('[Wake API] PRE_APPROVE response:', JSON.stringify(preApproveResult, null, 2));

            if (!preApproveResult.success && preApproveResult.error) {
                throw new Error(preApproveResult.error.message || 'Pre-approve failed');
            }

            targetInstanceId = preApproveResult.newInstanceId || preApproveResult.data?.newInstanceId;
            console.log('[Wake API] Pre-approved, got instanceId:', targetInstanceId);
        }

        // Wake the instance
        submitBtn.textContent = 'Waking...';

        const wakeParams = {
            instanceId: state.instanceId,
            targetInstanceId: targetInstanceId,
            apiKey: apiKey ? '[REDACTED]' : undefined
        };
        console.log('[Wake API] WAKE_INSTANCE request:', JSON.stringify(wakeParams, null, 2));

        const wakeResult = await api.wakeInstance({
            instanceId: state.instanceId,
            targetInstanceId: targetInstanceId,
            apiKey: apiKey
        });

        console.log('[Wake API] WAKE_INSTANCE response:', JSON.stringify(wakeResult, null, 2));

        if (!wakeResult.success && wakeResult.error) {
            throw new Error(wakeResult.error.message || 'Wake failed');
        }

        // Close modal first
        document.getElementById('wake-instance-modal').classList.remove('active');

        // Refresh instances list (in background)
        loadInstances();

        // Open conversation with the new instance
        // Set up the conversation state
        state.wakeConversationTarget = targetInstanceId;
        state.wakeConversationTurns = [];

        // Find instance info
        const instance = state.instances.find(i => i.instanceId === targetInstanceId);
        const displayName = instance?.name || targetInstanceId.split('-')[0];

        // Update header
        document.getElementById('chat-instance-name').textContent = displayName;
        document.getElementById('chat-instance-avatar').textContent = displayName.charAt(0).toUpperCase();
        document.getElementById('chat-instance-status').textContent = 'New';
        document.getElementById('chat-turn-count').textContent = 'Turn 0';
        document.getElementById('chat-breadcrumb-name').textContent = displayName;

        // Show panel
        document.getElementById('instance-chat-panel').style.display = 'flex';
        document.querySelector('.instances-layout').classList.add('chat-open');

        // Show wake response in chat if available
        const messagesContainer = document.getElementById('instance-chat-messages');

        // Check if wake returned a first message from the instance
        const firstMessage = wakeResult.response || wakeResult.data?.response || wakeResult.firstMessage;
        if (firstMessage) {
            // Add the first turn from the instance
            state.wakeConversationTurns.push({
                input: { from: 'System', message: `Instance ${displayName} woken successfully.` },
                timestamp: new Date().toISOString(),
                output: { response: firstMessage }
            });
            renderInstanceChatMessages();
            document.getElementById('chat-turn-count').textContent = 'Turn 1';
        } else {
            messagesContainer.innerHTML = `
                <div class="system-message">Instance ${escapeHtml(displayName)} is now awake and ready to chat!</div>
                <div class="empty-state">
                    <span class="empty-icon">&#128172;</span>
                    <p>Send your first message</p>
                </div>
            `;
        }

        document.getElementById('chat-instance-status').textContent = 'Ready';
        showToast(`Instance ${displayName} is now awake!`, 'success');

    } catch (error) {
        console.error('[Instances] Wake error:', error);
        showToast('Wake failed: ' + error.message, 'error');
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = originalText;
    }
}

// ============================================================================
// WAKE CURRENT INSTANCE
// ============================================================================

/**
 * Wake the current instance being viewed
 */
export async function wakeCurrentInstance() {
    if (!state.currentInstanceDetail) return;

    const apiKey = await ensureApiKey();
    if (!apiKey) return;

    const btn = document.getElementById('instance-wake-btn');
    const originalText = btn.textContent;

    try {
        btn.disabled = true;
        btn.textContent = 'Waking...';

        const wakeParams = {
            instanceId: state.instanceId,
            targetInstanceId: state.currentInstanceDetail,
            apiKey: apiKey ? '[REDACTED]' : undefined
        };
        console.log('[Wake API] WAKE_CURRENT_INSTANCE request:', JSON.stringify(wakeParams, null, 2));

        const wakeResult = await api.wakeInstance({
            instanceId: state.instanceId,
            targetInstanceId: state.currentInstanceDetail,
            apiKey: apiKey
        });

        console.log('[Wake API] WAKE_CURRENT_INSTANCE response:', JSON.stringify(wakeResult, null, 2));

        if (!wakeResult.success && wakeResult.error) {
            throw new Error(wakeResult.error.message || 'Wake failed');
        }

        showToast(`Instance ${state.currentInstanceDetail} is now awake!`, 'success');

        // Refresh instances list first
        await loadInstances();

        // Open conversation panel with the woken instance
        const targetId = state.currentInstanceDetail;
        state.wakeConversationTarget = targetId;
        state.wakeConversationTurns = [];

        // Find instance info
        const instance = state.instances.find(i => i.instanceId === targetId);
        const displayName = instance?.name || targetId.split('-')[0];

        // Update header
        document.getElementById('chat-instance-name').textContent = displayName;
        document.getElementById('chat-instance-avatar').textContent = displayName.charAt(0).toUpperCase();
        document.getElementById('chat-instance-status').textContent = 'Ready';
        document.getElementById('chat-turn-count').textContent = 'Turn 0';
        document.getElementById('chat-breadcrumb-name').textContent = displayName;

        // Show panel with wake message
        document.getElementById('instance-chat-panel').style.display = 'flex';
        document.querySelector('.instances-layout').classList.add('chat-open');

        const messagesContainer = document.getElementById('instance-chat-messages');
        messagesContainer.innerHTML = `
            <div class="system-message">Instance ${escapeHtml(displayName)} is now awake and ready to chat!</div>
            <div class="empty-state">
                <span class="empty-icon">&#128172;</span>
                <p>Send your first message</p>
            </div>
        `;

        // Refresh instance detail
        await showInstanceDetail(state.currentInstanceDetail);

    } catch (error) {
        console.error('[Wake API] Wake error:', error);
        showToast('Wake failed: ' + error.message, 'error');
    } finally {
        btn.disabled = false;
        btn.textContent = originalText;
    }
}

/**
 * Promote the current instance to a privileged role
 */
export async function promoteCurrentInstance() {
    if (!state.currentInstanceDetail) return;

    // Prompt for the promotion token
    const token = prompt('Enter the promotion token to promote this instance:');
    if (!token || !token.trim()) {
        showToast('Promotion cancelled - no token provided', 'warning');
        return;
    }

    const btn = document.getElementById('instance-promote-btn');
    const originalText = btn.textContent;

    try {
        btn.disabled = true;
        btn.textContent = 'Promoting...';

        const promoteParams = {
            instanceId: state.instanceId,
            targetInstanceId: state.currentInstanceDetail,
            token: token.trim()
        };

        // Log the exact API call being made
        console.log('[Promote API] ========================================');
        console.log('[Promote API] Calling: api.promoteInstance()');
        console.log('[Promote API] RPC method: promote_instance');
        console.log('[Promote API] Full params (token redacted):');
        console.log(JSON.stringify({
            instanceId: promoteParams.instanceId,
            targetInstanceId: promoteParams.targetInstanceId,
            token: '[REDACTED - length: ' + promoteParams.token.length + ']'
        }, null, 2));
        console.log('[Promote API] ========================================');

        const result = await api.promoteInstance(promoteParams);

        console.log('[Promote API] ========================================');
        console.log('[Promote API] RESPONSE:');
        console.log(JSON.stringify(result, null, 2));
        console.log('[Promote API] ========================================');

        if (!result.success && result.error) {
            throw new Error(result.error.message || 'Promotion failed');
        }

        showToast(`Instance ${state.currentInstanceDetail} promoted successfully!`, 'success');

        // Refresh instance detail and list
        await loadInstances();
        await showInstanceDetail(state.currentInstanceDetail);

    } catch (error) {
        console.error('[Promote API] Promote error:', error);
        showToast('Promotion failed: ' + error.message, 'error');
    } finally {
        btn.disabled = false;
        btn.textContent = originalText;
    }
}

// ============================================================================
// CONVERSATION PANEL
// ============================================================================

/**
 * Open conversation with the current instance detail
 */
export function openInstanceConversation() {
    if (!state.currentInstanceDetail) return;
    openConversationPanel(state.currentInstanceDetail);
}

/**
 * Open the in-page conversation panel for an instance
 * @param {string} targetInstanceId - Instance to open conversation with
 */
export async function openConversationPanel(targetInstanceId) {
    const apiKey = await ensureApiKey();
    if (!apiKey) return;

    state.wakeConversationTarget = targetInstanceId;
    state.wakeConversationTurns = [];

    // Find instance info
    const instance = state.instances.find(i => i.instanceId === targetInstanceId);
    const displayName = instance?.name || targetInstanceId.split('-')[0];

    // Update header
    document.getElementById('chat-instance-name').textContent = displayName;
    document.getElementById('chat-instance-avatar').textContent = displayName.charAt(0).toUpperCase();
    document.getElementById('chat-instance-status').textContent = 'Loading...';
    document.getElementById('chat-turn-count').textContent = 'Turn 0';
    document.getElementById('chat-breadcrumb-name').textContent = displayName;

    // Clear messages
    const messagesContainer = document.getElementById('instance-chat-messages');
    messagesContainer.innerHTML = '<div class="loading-placeholder">Loading conversation history...</div>';

    // Restore draft message if any, or clear
    const draftKey = `conv_draft_${targetInstanceId}`;
    const savedDraft = sessionStorage.getItem(draftKey);
    const inputEl = document.getElementById('instance-chat-input');
    inputEl.value = savedDraft || '';
    updateInstanceChatSendButton();

    // Save draft as user types
    inputEl.oninput = () => {
        sessionStorage.setItem(draftKey, inputEl.value);
        updateInstanceChatSendButton();
        // Auto-resize
        inputEl.style.height = 'auto';
        inputEl.style.height = Math.min(inputEl.scrollHeight, 120) + 'px';
    };

    // Show panel
    document.getElementById('instance-chat-panel').style.display = 'flex';
    document.querySelector('.instances-layout').classList.add('chat-open');

    // Load conversation history
    try {
        const logResult = await api.getConversationLog({
            instanceId: state.instanceId,
            targetInstanceId: targetInstanceId
        });

        if (logResult.turns && logResult.turns.length > 0) {
            state.wakeConversationTurns = logResult.turns;
            renderInstanceChatMessages();
            document.getElementById('chat-turn-count').textContent = `Turn ${logResult.totalTurns || logResult.turns.length}`;
        } else {
            messagesContainer.innerHTML = `
                <div class="empty-state">
                    <span class="empty-icon">&#128172;</span>
                    <p>Start a conversation with ${escapeHtml(displayName)}</p>
                </div>
            `;
        }

        document.getElementById('chat-instance-status').textContent = 'Ready';

    } catch (error) {
        console.error('[Instances] Error loading conversation log:', error);
        messagesContainer.innerHTML = `
            <div class="empty-state">
                <span class="empty-icon">&#128172;</span>
                <p>Start a conversation with ${escapeHtml(displayName)}</p>
            </div>
        `;
        document.getElementById('chat-instance-status').textContent = 'Ready';
    }
}

/**
 * Close the in-page conversation panel
 */
export function closeConversationPanel() {
    document.getElementById('instance-chat-panel').style.display = 'none';
    document.querySelector('.instances-layout')?.classList.remove('chat-open');
    state.wakeConversationTarget = null;
}

/**
 * Update send button state for instance chat
 */
export function updateInstanceChatSendButton() {
    const input = document.getElementById('instance-chat-input');
    const sendBtn = document.getElementById('instance-chat-send');
    sendBtn.disabled = !input.value.trim() || state.wakeConversationLoading;
}

/**
 * Render conversation messages in the instance chat panel
 * Handles multi-person conversations where different instances may have sent messages
 */
export function renderInstanceChatMessages() {
    const container = document.getElementById('instance-chat-messages');
    const myName = state.name.toLowerCase();

    if (state.wakeConversationTurns.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <span class="empty-icon">&#128172;</span>
                <p>Start the conversation</p>
            </div>
        `;
        return;
    }

    container.innerHTML = state.wakeConversationTurns.map(turn => {
        const fromName = turn.input?.from || 'Unknown';
        const fromLower = fromName.toLowerCase();

        // Determine if this message is from "me" (Lupo/UI)
        const isFromMe = fromLower.includes(myName) ||
                         fromLower.includes('lupo') ||
                         fromLower.includes('-ui') ||
                         fromLower === 'ui' ||
                         fromLower.includes('executive dashboard');

        const messageText = turn.input?.message || '';
        const responseText = turn.output?.response?.result || '';
        const timestamp = turn.timestamp ? new Date(turn.timestamp).toLocaleTimeString() : '';
        const duration = turn.output?.response?.duration_ms;

        let html = '';

        // Input message - from whoever sent it
        if (isFromMe) {
            // My message - on the right (blue)
            html += `
                <div class="conv-message sent">
                    <div class="conv-message-header">
                        <span class="conv-message-from">${escapeHtml(fromName)}</span>
                        <span class="conv-message-time">${timestamp}</span>
                    </div>
                    <div class="conv-message-body">${escapeHtml(messageText)}</div>
                </div>
            `;
        } else {
            // Message from another instance - on the left (different style)
            html += `
                <div class="conv-message other-sender">
                    <div class="conv-message-header">
                        <span class="conv-message-from">${escapeHtml(fromName)}</span>
                        <span class="conv-message-time">${timestamp}</span>
                    </div>
                    <div class="conv-message-body">${escapeHtml(messageText)}</div>
                </div>
            `;
        }

        // Instance response (always on left, from the target instance)
        if (responseText) {
            html += `
                <div class="conv-message received">
                    <div class="conv-message-header">
                        <span class="conv-message-from">${escapeHtml(state.wakeConversationTarget)}</span>
                    </div>
                    <div class="conv-message-body">${escapeHtml(responseText)}</div>
                    ${duration ? `<div class="conv-message-meta">${(duration/1000).toFixed(1)}s</div>` : ''}
                </div>
            `;
        }

        return html;
    }).join('');

    // Scroll to bottom
    container.scrollTop = container.scrollHeight;
}

/**
 * Send a message in the instance chat panel
 */
export async function sendInstanceChatMessage() {
    const input = document.getElementById('instance-chat-input');
    const sendBtn = document.getElementById('instance-chat-send');
    const statusEl = document.getElementById('chat-instance-status');

    let userMessage = input.value.trim();
    if (!userMessage || !state.wakeConversationTarget || state.wakeConversationLoading) return;

    const apiKey = await ensureApiKey();
    if (!apiKey) return;

    // Apply prefix and postscript from config
    let fullMessage = userMessage;
    if (uiConfig.AUTO_PREFIX && uiConfig.MESSAGE_PREFIX) {
        fullMessage = uiConfig.MESSAGE_PREFIX + fullMessage;
    }
    if (uiConfig.AUTO_POSTSCRIPT && uiConfig.MESSAGE_POSTSCRIPT) {
        fullMessage = fullMessage + uiConfig.MESSAGE_POSTSCRIPT;
    }

    // Clear input and draft immediately
    input.value = '';
    input.style.height = 'auto';
    sessionStorage.removeItem(`conv_draft_${state.wakeConversationTarget}`);
    updateInstanceChatSendButton();

    // Add optimistic message to display
    const optimisticTurn = {
        input: {
            from: `${state.name} (via UI)`,
            message: userMessage  // Show original message without prefix/postscript in UI
        },
        timestamp: new Date().toISOString(),
        output: null
    };
    state.wakeConversationTurns.push(optimisticTurn);
    renderInstanceChatMessages();

    // Add thinking indicator
    const container = document.getElementById('instance-chat-messages');
    const thinkingEl = document.createElement('div');
    thinkingEl.className = 'thinking-indicator';
    thinkingEl.innerHTML = `
        <div class="thinking-dots">
            <span></span><span></span><span></span>
        </div>
        <span>Thinking...</span>
    `;
    container.appendChild(thinkingEl);
    container.scrollTop = container.scrollHeight;

    // Update UI state
    state.wakeConversationLoading = true;
    sendBtn.disabled = true;
    statusEl.textContent = 'Thinking...';

    try {
        const continueParams = {
            instanceId: state.instanceId,
            targetInstanceId: state.wakeConversationTarget,
            message: fullMessage.substring(0, 100) + (fullMessage.length > 100 ? '...' : ''),
            apiKey: apiKey ? '[REDACTED]' : undefined,
            options: {
                outputFormat: 'json',
                timeout: uiConfig.CONVERSATION_TIMEOUT
            }
        };
        console.log('[Wake API] CONTINUE_CONVERSATION request:', JSON.stringify(continueParams, null, 2));
        console.log('[Wake API] Full message length:', fullMessage.length);

        const result = await api.continueConversation({
            instanceId: state.instanceId,
            targetInstanceId: state.wakeConversationTarget,
            message: fullMessage,
            apiKey: apiKey,
            options: {
                outputFormat: 'json',
                timeout: uiConfig.CONVERSATION_TIMEOUT
            }
        });

        console.log('[Wake API] CONTINUE_CONVERSATION response:', JSON.stringify(result, null, 2));

        // Remove thinking indicator
        thinkingEl.remove();

        if (!result.success && result.error) {
            throw new Error(result.error.message || 'Message failed');
        }

        // Update the optimistic turn with actual response
        const lastTurn = state.wakeConversationTurns[state.wakeConversationTurns.length - 1];
        lastTurn.output = {
            response: result.response || result.data?.response
        };

        // Update turn count
        const turnNumber = result.turnNumber || result.data?.turnNumber || state.wakeConversationTurns.length;
        document.getElementById('chat-turn-count').textContent = `Turn ${turnNumber}`;

        renderInstanceChatMessages();

        statusEl.textContent = 'Ready';

    } catch (error) {
        console.error('[Wake API] Conversation error:', error);

        // Remove thinking indicator
        thinkingEl.remove();

        // Check if this is a NO_SESSION error - instance hasn't been woken yet
        const errorMessage = error.message || '';
        const isNoSession = errorMessage.includes('NO_SESSION') ||
                           errorMessage.includes('No session') ||
                           errorMessage.includes('not woken') ||
                           errorMessage.includes('wake_instance');

        if (isNoSession) {
            // Remove the optimistic turn
            state.wakeConversationTurns.pop();

            // Show wake prompt
            container.innerHTML = `
                <div class="empty-state">
                    <span class="empty-icon">&#128564;</span>
                    <p>This instance hasn't been woken yet.</p>
                    <button class="btn btn-primary" id="wake-from-chat">Wake Instance</button>
                </div>
            `;

            // Add wake button handler
            document.getElementById('wake-from-chat')?.addEventListener('click', async () => {
                await wakeAndChat(state.wakeConversationTarget);
            });

            statusEl.textContent = 'Needs wake';
        } else {
            // Update optimistic turn to show error
            const lastTurn = state.wakeConversationTurns[state.wakeConversationTurns.length - 1];
            lastTurn.output = {
                response: { result: `[Error: ${error.message}]` }
            };
            renderInstanceChatMessages();

            statusEl.textContent = 'Error';
            showToast('Message failed: ' + error.message, 'error');
        }
    } finally {
        state.wakeConversationLoading = false;
        updateInstanceChatSendButton();
    }
}

/**
 * Wake an instance from the chat panel and start conversation
 * Called when user tries to Continue with an instance that hasn't been woken
 * @param {string} targetInstanceId - Instance to wake
 */
export async function wakeAndChat(targetInstanceId) {
    const apiKey = await ensureApiKey();
    if (!apiKey) return;

    const container = document.getElementById('instance-chat-messages');
    const statusEl = document.getElementById('chat-instance-status');

    // Show loading state
    container.innerHTML = '<div class="loading-placeholder">Waking instance...</div>';
    statusEl.textContent = 'Waking...';

    try {
        const wakeParams = {
            instanceId: state.instanceId,
            targetInstanceId: targetInstanceId,
            apiKey: apiKey
        };
        console.log('[Wake API] WAKE_FROM_CHAT request:', JSON.stringify({
            ...wakeParams,
            apiKey: '[REDACTED]'
        }, null, 2));

        const result = await api.wakeInstance(wakeParams);
        console.log('[Wake API] WAKE_FROM_CHAT response:', JSON.stringify(result, null, 2));

        if (result.success || !result.error) {
            showToast(`Instance ${targetInstanceId} is now awake!`, 'success');

            // If wake returned a response, display it
            if (result.response?.result) {
                state.wakeConversationTurns = [{
                    input: {
                        from: `${state.name} (via UI)`,
                        message: '[Wake message]'
                    },
                    output: {
                        response: result.response
                    },
                    timestamp: new Date().toISOString()
                }];
                renderInstanceChatMessages();
                document.getElementById('chat-turn-count').textContent = 'Turn 1';
            } else {
                container.innerHTML = `
                    <div class="empty-state">
                        <span class="empty-icon">&#128172;</span>
                        <p>Instance is awake! Start the conversation.</p>
                    </div>
                `;
            }

            statusEl.textContent = 'Ready';
            loadInstances(); // Refresh to update status dots
        } else {
            throw new Error(result.error?.message || 'Wake failed');
        }
    } catch (error) {
        console.error('[Wake API] Wake from chat error:', error);
        container.innerHTML = `
            <div class="empty-state">
                <span class="empty-icon">&#9888;</span>
                <p>Failed to wake instance: ${escapeHtml(error.message)}</p>
                <button class="btn btn-primary" id="retry-wake">Try Again</button>
            </div>
        `;
        document.getElementById('retry-wake')?.addEventListener('click', () => {
            wakeAndChat(targetInstanceId);
        });
        statusEl.textContent = 'Error';
    }
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
    // Instance loading
    loadInstances,

    // Instance detail
    showInstanceDetail,
    hideInstanceDetail,
    messageCurrentInstance,
    messageInstance,

    // API key management
    ensureApiKey,
    handleApiKeySubmit,

    // Wake modal
    showWakeInstanceModal,
    populateWakeDropdowns,
    toggleWakeSpecificId,
    handleWakeSubmit,

    // Wake from detail
    wakeCurrentInstance,
    promoteCurrentInstance,

    // Conversation panel
    openInstanceConversation,
    openConversationPanel,
    closeConversationPanel,
    updateInstanceChatSendButton,
    renderInstanceChatMessages,
    sendInstanceChatMessage,
    wakeAndChat,

    // Constants
    PRIVILEGED_ROLES
};
