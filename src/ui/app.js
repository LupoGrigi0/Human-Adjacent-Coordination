/**
 * V2 Coordination Dashboard Application
 *
 * Main application logic for the V2 executive dashboard.
 * Uses ES modules and the api.js isolation layer.
 *
 * @author Canvas (UI Engineer)
 *  * @contributor Scout-4820 (Browser Extension Instance, Jan 2026)
 */

import api, { setEnvironment, getEnvironment, ApiError } from './api.js';
import * as uiConfig from './ui-config.js';
import { CONFIG, state } from './state.js';
import { escapeHtml, showToast } from './utils.js';
import { initTheme, setTheme, toggleTheme } from './settings.js';
import {
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
} from './lists.js';
import { loadDashboard } from './dashboard.js';
import {
    loadTasks,
    renderTaskBoard,
    showTaskDetail,
    hideTaskDetail,
    claimCurrentTask,
    completeCurrentTask,
    updateTaskStatus,
    updateTaskPriority
} from './tasks.js';
import {
    loadProjects,
    showProjectDetail,
    hideProjectDetail,
    renderProjectDetailTasks,
    showCreateProjectModal,
    closeCreateProjectModal,
    createProject,
    launchProject
} from './projects.js';
import {
    showModal,
    hideModal,
    hideAllModals,
    showConfirm,
    showInstanceSelector,
    showProjectSelector
} from './modals.js';
import {
    loadMessaging,
    showMessageDetail,
    replyToMessage,
    dismissQuote,
    selectConversation,
    loadConversationMessages,
    sendMessage,
    startMessagePolling,
    stopMessagePolling,
    pollMessages
} from './messages.js';
import {
    showConversationTargetDetails,
    showEntityDetails,
    loadInstanceDetails,
    loadRoleDetails,
    loadPersonalityDetails,
    loadProjectDetailsModal
} from './details.js';

document.addEventListener('DOMContentLoaded', async () => {
    console.log('[App] Initializing V2 Dashboard as Lupo...');

    // Initialize theme
    initTheme();

    // Set up event listeners
    setupEventListeners();

    // Auto-bootstrap as Lupo (Executive)
    await autoBootstrapAsLupo();

    // Initial data load
    await loadInitialData();

    // Start message polling
    startMessagePolling();
});

/**
 * Auto-bootstrap as Lupo with Executive role
 * Persists instanceId so we're always the same backend instance
 */
async function autoBootstrapAsLupo() {
    // Always use the fixed instance ID for Lupo
    const instanceId = CONFIG.fixedInstanceId;

    try {
        console.log('[App] Bootstrapping as Lupo with fixed ID:', instanceId);
        const result = await api.bootstrap({ instanceId: instanceId });

        if (result.success !== false) {
            state.instanceId = result.instanceId;
            state.name = CONFIG.defaultName;

            // Save for next time
            localStorage.setItem(CONFIG.storageKey, state.instanceId);

            // Take on Executive role if not already set
            if (!result.currentContext?.role) {
                try {
                    // Note: Executive role requires token - we'll need to handle this
                    // For now, just set the state
                    state.role = CONFIG.defaultRole;
                } catch (e) {
                    console.log('[App] Could not take on role:', e.message);
                }
            } else {
                state.role = result.currentContext.role;
            }

            state.personality = result.currentContext?.personality;
            state.project = result.currentContext?.project;

            updateConnectionStatus(true);
            updateUserDisplay();
            showToast(`Connected as ${state.name}`, 'success');

            console.log('[App] Bootstrapped as:', state.instanceId);
        } else {
            throw new Error(result.error?.message || 'Bootstrap failed');
        }
    } catch (error) {
        console.error('[App] Auto-bootstrap failed:', error);
        updateConnectionStatus(false);
        showToast('Failed to connect: ' + error.message, 'error');
    }
}

// ============================================================================
// EVENT LISTENERS
// ============================================================================

function setupEventListeners() {
    // Theme toggle
    document.getElementById('theme-toggle').addEventListener('click', toggleTheme);

    // Navigation
    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', () => {
            const tab = item.dataset.tab;
            switchTab(tab);
        });
    });

    // Note: Conversation filters removed in V2 - using XMPP room structure instead

    // Bootstrap button
    document.getElementById('bootstrap-btn')?.addEventListener('click', showBootstrapModal);
    document.getElementById('bootstrap-submit')?.addEventListener('click', handleBootstrap);

    // Refresh button
    document.getElementById('refresh-btn')?.addEventListener('click', () => loadInitialData());

    // Modal close buttons
    document.querySelectorAll('[data-close]').forEach(btn => {
        btn.addEventListener('click', () => {
            const modal = btn.closest('.modal');
            if (modal) modal.classList.remove('active');
        });
    });

    // Modal backdrop click (only close modals that allow backdrop dismiss)
    document.querySelectorAll('.modal-backdrop').forEach(backdrop => {
        backdrop.addEventListener('click', () => {
            const modal = backdrop.closest('.modal');
            // Don't dismiss modals that have data-no-backdrop-dismiss attribute
            // This includes conversation panel and wake modal
            if (modal && !modal.hasAttribute('data-no-backdrop-dismiss')) {
                modal.classList.remove('active');
            }
        });
    });

    // Close dropdowns when clicking outside
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.project-selector')) {
            document.querySelectorAll('.project-dropdown').forEach(d => d.style.display = 'none');
        }
    });

    // Message input
    const messageInput = document.getElementById('message-input');
    const sendBtn = document.getElementById('send-btn');

    if (messageInput) {
        messageInput.addEventListener('input', () => {
            sendBtn.disabled = !messageInput.value.trim();
            // Auto-resize
            messageInput.style.height = 'auto';
            messageInput.style.height = Math.min(messageInput.scrollHeight, 120) + 'px';
        });

        messageInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                if (messageInput.value.trim()) {
                    sendMessage();
                }
            }
        });
    }

    if (sendBtn) {
        sendBtn.addEventListener('click', sendMessage);
    }

    // Settings environment change
    document.getElementById('settings-environment')?.addEventListener('change', (e) => {
        setEnvironment(e.target.value);
        updateSettingsDisplay();
        loadInitialData();
    });

    // Settings theme change
    document.getElementById('settings-theme')?.addEventListener('change', (e) => {
        setTheme(e.target.value);
    });

    // Diary buttons
    document.getElementById('refresh-diary-btn')?.addEventListener('click', loadDiary);
    document.getElementById('add-diary-entry-btn')?.addEventListener('click', addDiaryEntry);

    // Refresh messages button
    document.getElementById('refresh-messages-btn')?.addEventListener('click', () => {
        loadMessaging();
        if (state.currentConversation) {
            loadConversationMessages(state.conversationType, state.currentConversation);
        }
        showToast('Messages refreshed', 'success');
    });

    // Admin buttons
    document.getElementById('clear-session-btn')?.addEventListener('click', clearSession);

    // Create Project new launch project button
    document.getElementById('new-project-btn')?.addEventListener('click', showCreateProjectModal);
    document.getElementById('create-project-submit')?.addEventListener('click', createProject);
        document.getElementById('launch-project-btn')?.addEventListener('click', launchProject);

    // Create Task
    document.getElementById('new-task-btn')?.addEventListener('click', showCreateTaskModal);
    document.getElementById('create-task-submit')?.addEventListener('click', createTask);

    // Wake Instance
    document.getElementById('wake-instance-btn')?.addEventListener('click', showWakeInstanceModal);
    document.getElementById('pre-approve-btn')?.addEventListener('click', showWakeInstanceModal);
    document.getElementById('wake-instance-submit')?.addEventListener('click', handleWakeSubmit);
    document.getElementById('wake-specific-id')?.addEventListener('change', toggleWakeSpecificId);

    // API Key modal
    document.getElementById('api-key-submit')?.addEventListener('click', handleApiKeySubmit);

    // Instance Chat Panel (in-page, not modal)
    document.getElementById('instance-chat-send')?.addEventListener('click', sendInstanceChatMessage);
    document.getElementById('instance-chat-input')?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendInstanceChatMessage();
        }
    });
    // Also listen for input events to enable/disable send button
    document.getElementById('instance-chat-input')?.addEventListener('input', () => {
        updateInstanceChatSendButton();
    });
    document.getElementById('chat-back-btn')?.addEventListener('click', closeConversationPanel);
    document.getElementById('chat-close-btn')?.addEventListener('click', closeConversationPanel);
    document.getElementById('chat-details-btn')?.addEventListener('click', showConversationTargetDetails);

    // Instance Detail
    document.getElementById('instance-back-btn')?.addEventListener('click', hideInstanceDetail);
    document.getElementById('instance-message-btn')?.addEventListener('click', messageCurrentInstance);
    document.getElementById('instance-chat-btn')?.addEventListener('click', openInstanceConversation);
    document.getElementById('instance-wake-btn')?.addEventListener('click', wakeCurrentInstance);
    document.getElementById('instance-promote-btn')?.addEventListener('click', promoteCurrentInstance);

    // Lists
    document.getElementById('new-list-btn')?.addEventListener('click', showCreateListModal);
    document.getElementById('create-list-submit')?.addEventListener('click', createList);
    document.getElementById('list-back-btn')?.addEventListener('click', hideListDetail);
    document.getElementById('list-delete-btn')?.addEventListener('click', deleteCurrentList);
    document.getElementById('list-rename-btn')?.addEventListener('click', renameCurrentList);
    document.getElementById('add-item-btn')?.addEventListener('click', addListItem);
    document.getElementById('new-item-input')?.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') addListItem();
    });

    // Project Detail - back button and actions
    document.getElementById('project-back-btn')?.addEventListener('click', hideProjectDetail);
    document.getElementById('project-add-task-btn')?.addEventListener('click', () => {
        if (state.currentProjectDetail) {
            showCreateTaskModal();
            // Pre-select the current project in the modal and disable changing it
            const projectSelect = document.getElementById('task-project');
            if (projectSelect) {
                projectSelect.value = state.currentProjectDetail;
                projectSelect.disabled = true;
            }
        }
    });
    document.getElementById('project-message-team-btn')?.addEventListener('click', () => {
        if (state.currentProjectDetail) {
            // Switch to messages and select the project room
            // Use setTimeout to ensure messaging sidebar is rendered first
            switchTab('messages');
            setTimeout(() => {
                selectConversation('project', state.currentProjectDetail);
            }, 100);
        }
    });
    document.getElementById('project-assign-instance-btn')?.addEventListener('click', showAssignInstanceModal);

    // PM card buttons
    document.getElementById('pm-continue-btn')?.addEventListener('click', () => {
        // Switch to PM chat tab in sidebar
        const pmTab = document.querySelector('.chat-tab[data-tab="pm-chat"]');
        pmTab?.click();
        // Focus the input
        document.getElementById('pm-chat-input')?.focus();
    });
    document.getElementById('pm-message-btn')?.addEventListener('click', () => {
        if (state.currentProjectPM) {
            // Switch to messages tab and select the PM's personality room
            switchTab('messages');
            setTimeout(() => {
                const pmName = state.currentProjectPM.name?.toLowerCase();
                selectConversation('dm', `personality-${pmName}`);
            }, 100);
        }
    });

    // Refresh team room button
    document.getElementById('refresh-team-room')?.addEventListener('click', () => {
        if (state.currentProject) {
            loadProjectTeamMessages(state.currentProject);
        }
    });

    // Task Detail - back button and actions
    document.getElementById('task-back-btn')?.addEventListener('click', hideTaskDetail);
    document.getElementById('task-claim-btn')?.addEventListener('click', claimCurrentTask);
    document.getElementById('task-complete-btn')?.addEventListener('click', completeCurrentTask);

    // Editable fields - Project description
    document.getElementById('project-desc-editable')?.addEventListener('click', (e) => {
        if (!e.target.closest('.editing')) {
            enableEditMode('project-desc-editable', 'project-detail-description', 'project-desc-save-btn');
        }
    });
    document.getElementById('project-desc-save-btn')?.addEventListener('click', saveProjectDescription);

    // Editable fields - Task description
    document.getElementById('task-desc-editable')?.addEventListener('click', (e) => {
        if (!e.target.closest('.editing')) {
            enableEditMode('task-desc-editable', 'task-detail-description', 'task-desc-save-btn');
        }
    });
    document.getElementById('task-desc-save-btn')?.addEventListener('click', saveTaskDescription);
}

// ============================================================================
// TAB NAVIGATION
// ============================================================================

function switchTab(tabName) {
    state.currentTab = tabName;

    // Hide any open detail views first
    if (state.currentProjectDetail) {
        hideProjectDetail();
    }
    if (state.currentTaskDetail) {
        hideTaskDetail();
    }
    if (state.currentListId) {
        hideListDetail();
    }
    if (state.currentInstanceDetail) {
        hideInstanceDetail();
    }

    // Update nav items
    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.toggle('active', item.dataset.tab === tabName);
    });

    // Update tab content
    document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.toggle('active', content.id === `tab-${tabName}`);
    });

    // Load tab-specific data
    switch (tabName) {
        case 'messages':
            loadMessaging();
            break;
        case 'dashboard':
            loadDashboard();
            break;
        case 'projects':
            loadProjects();
            break;
        case 'tasks':
            loadTasks();
            break;
        case 'lists':
            loadLists();
            break;
        case 'instances':
            loadInstances();
            break;
        case 'settings':
            updateSettingsDisplay();
            loadDiary();
            break;
    }
}

// ============================================================================
// CONNECTION & AUTH
// ============================================================================

// reconnect function removed - using autoBootstrapAsLupo instead

function updateConnectionStatus(connected) {
    state.connected = connected;
    const dot = document.getElementById('status-dot');
    const text = document.getElementById('status-text');

    dot.classList.toggle('connected', connected);
    text.textContent = connected ? 'Connected' : 'Disconnected';
}

function updateUserDisplay() {
    const idEl = document.getElementById('user-instance-id');
    const roleEl = document.getElementById('user-role');

    if (state.instanceId) {
        idEl.textContent = state.name || state.instanceId;
        roleEl.textContent = state.role || 'No role';
    } else {
        idEl.textContent = 'Not Connected';
        roleEl.textContent = '-';
    }

    // Update settings display too
    updateSettingsDisplay();
}

function updateSettingsDisplay() {
    const env = getEnvironment();

    document.getElementById('settings-instance-id').value = state.instanceId || 'Not bootstrapped';
    document.getElementById('settings-name').value = state.name || '-';
    document.getElementById('settings-role').value = state.role || '-';
    document.getElementById('settings-environment').value = env.name;
    document.getElementById('settings-endpoint').value = env.url;
    document.getElementById('settings-theme').value = state.theme;
}

// ============================================================================
// BOOTSTRAP
// ============================================================================

function showBootstrapModal() {
    document.getElementById('bootstrap-modal').classList.add('active');
    document.getElementById('bootstrap-name').focus();
}

async function handleBootstrap() {
    const name = document.getElementById('bootstrap-name').value.trim();
    const existingId = document.getElementById('bootstrap-existing-id').value.trim();

    if (!name && !existingId) {
        showToast('Please enter a name or existing instance ID', 'error');
        return;
    }

    try {
        let result;
        if (existingId) {
            result = await api.bootstrap({ instanceId: existingId });
        } else {
            result = await api.bootstrap({ name });
        }

        if (result.success !== false) {
            state.instanceId = result.instanceId;
            state.name = name || existingId.split('-')[0];
            state.role = result.currentContext?.role;
            state.personality = result.currentContext?.personality;
            state.project = result.currentContext?.project;

            localStorage.setItem('v2_instance_id', state.instanceId);
            updateConnectionStatus(true);
            updateUserDisplay();

            document.getElementById('bootstrap-modal').classList.remove('active');
            document.getElementById('bootstrap-name').value = '';
            document.getElementById('bootstrap-existing-id').value = '';

            showToast(`Bootstrapped as ${state.instanceId}`, 'success');
            loadInitialData();
        } else {
            showToast(result.error?.message || 'Bootstrap failed', 'error');
        }
    } catch (error) {
        console.error('[App] Bootstrap error:', error);
        showToast(error.message || 'Bootstrap failed', 'error');
    }
}

// ============================================================================
// DATA LOADING
// ============================================================================

async function loadInitialData() {
    console.log('[App] Loading initial data...');

    try {
        // Load projects (V2 API)
        const projectsResult = await api.listProjects();
        if (projectsResult.projects) {
            state.projects = projectsResult.projects;
        }

        // Load instances
        try {
            const instancesResult = await api.getInstances();
            if (instancesResult.instances) {
                state.instances = instancesResult.instances;
            }
        } catch (e) {
            console.log('[App] Could not load instances:', e.message);
        }

        // Load current tab data
        switchTab(state.currentTab);

        state.lastUpdate = new Date();
        console.log('[App] Data loaded successfully');

    } catch (error) {
        console.error('[App] Error loading data:', error);
        showToast('Error loading data', 'error');
    }
}

// ============================================================================
// DASHBOARD - imported from ./dashboard.js
// ============================================================================

// ============================================================================
// PROJECTS - imported from ./projects.js
// ============================================================================

// ============================================================================
// EDITABLE FIELDS
// ============================================================================

/**
 * Enable edit mode for a field - replace text with textarea
 */
function enableEditMode(containerId, textId, saveBtnId) {
    const container = document.getElementById(containerId);
    const textElement = document.getElementById(textId);
    const saveBtn = document.getElementById(saveBtnId);

    if (!container || !textElement || container.classList.contains('editing')) return;

    const currentText = textElement.textContent;

    // Create textarea
    const textarea = document.createElement('textarea');
    textarea.value = currentText === 'No description' ? '' : currentText;
    textarea.placeholder = 'Enter description...';

    // Hide the text, show textarea
    textElement.style.display = 'none';
    container.appendChild(textarea);
    container.classList.add('editing');
    saveBtn.classList.add('visible');

    // Focus the textarea
    textarea.focus();

    // Handle Escape key to cancel
    textarea.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            disableEditMode(containerId, textId, saveBtnId, false);
        }
    });
}

/**
 * Disable edit mode and optionally save the value
 */
function disableEditMode(containerId, textId, saveBtnId, save = false) {
    const container = document.getElementById(containerId);
    const textElement = document.getElementById(textId);
    const saveBtn = document.getElementById(saveBtnId);
    const textarea = container.querySelector('textarea');

    if (!container || !textarea) return;

    const newValue = textarea.value.trim();

    // Remove textarea
    textarea.remove();
    container.classList.remove('editing');
    saveBtn.classList.remove('visible');

    // Show text element
    textElement.style.display = '';

    // Update text if saving
    if (save && newValue) {
        textElement.textContent = newValue;
    }

    return newValue;
}

/**
 * Save project description
 */
async function saveProjectDescription() {
    const container = document.getElementById('project-desc-editable');
    const textarea = container?.querySelector('textarea');
    if (!textarea || !state.currentProjectDetail) return;

    const newDescription = textarea.value.trim();

    try {
        // TODO: 'update_project' API does not exist - update functionality may need to be implemented
        await rpcCallDirect('update_project', {
            id: state.currentProjectDetail,
            updates: { description: newDescription }
        });

        // Update local state
        const project = state.projects.find(p => (p.projectId || p.id) === state.currentProjectDetail);
        if (project) {
            project.description = newDescription;
        }

        disableEditMode('project-desc-editable', 'project-detail-description', 'project-desc-save-btn', true);
        showToast('Description saved!', 'success');
    } catch (e) {
        console.error('[App] Error saving project description:', e);
        showToast('Could not save: ' + e.message, 'error');
    }
}

/**
 * Save task description
 * NOTE: update_task API not yet implemented - this updates local state only
 */
async function saveTaskDescription() {
    const container = document.getElementById('task-desc-editable');
    const textarea = container?.querySelector('textarea');
    if (!textarea || !state.currentTaskDetail) return;

    const newDescription = textarea.value.trim();

    // Update local state only (API not yet implemented)
    const task = state.tasks.find(t => (t.taskId || t.id) === state.currentTaskDetail);
    if (task) {
        task.description = newDescription;
    }

    disableEditMode('task-desc-editable', 'task-detail-description', 'task-desc-save-btn', true);
    showToast('Description updated (local only)', 'info');
}

// ============================================================================
// ASSIGN INSTANCE MODAL
// ============================================================================

/**
 * Show the assign instance modal with list of available instances
 */
function showAssignInstanceModal() {
    const modal = document.getElementById('assign-instance-modal');
    const list = document.getElementById('instance-select-list');

    if (!modal || !list) return;

    // Get current project team
    const project = state.projects.find(p => (p.projectId || p.id) === state.currentProjectDetail);
    const currentTeam = project?.team || [];

    // Render instance list (exclude instances already on the team)
    if (state.instances.length === 0) {
        list.innerHTML = '<div class="loading-placeholder">No instances available</div>';
    } else {
        list.innerHTML = state.instances
            .filter(inst => !currentTeam.includes(inst.instanceId) && !currentTeam.includes(inst.name))
            .map(inst => {
                const name = inst.name || 'Unknown';
                const avatarChar = name.charAt(0).toUpperCase();
                return `
                    <div class="instance-select-item" data-instance-id="${inst.instanceId || ''}" data-name="${escapeHtml(name)}">
                        <div class="instance-avatar">${avatarChar}</div>
                        <div class="instance-select-info">
                            <div class="instance-select-name">${escapeHtml(name)}</div>
                            <div class="instance-select-id">${escapeHtml(inst.instanceId || 'No ID')}</div>
                        </div>
                    </div>
                `;
            }).join('');

        // Add click handlers
        list.querySelectorAll('.instance-select-item').forEach(item => {
            item.addEventListener('click', () => {
                const instanceId = item.dataset.instanceId;
                const name = item.dataset.name;
                assignInstanceToProject(instanceId, name);
                modal.classList.remove('active');
            });
        });
    }

    modal.classList.add('active');
}

/**
 * Assign an instance to the current project
 */
async function assignInstanceToProject(instanceId, name) {
    if (!state.currentProjectDetail) return;

    try {
        // Use join_project API - have the instance join the project
        await api.joinProject(instanceId, state.currentProjectDetail);

        showToast(`${name} added to project!`, 'success');

        // Refresh the project detail to show updated team
        await showProjectDetail(state.currentProjectDetail);
    } catch (e) {
        console.error('[App] Error assigning instance:', e);
        showToast('Could not assign instance: ' + e.message, 'error');
    }
}

// ============================================================================
// INSTANCES - imported from ./instances.js
// ============================================================================

// Functions loadInstances, showInstanceDetail, hideInstanceDetail,
// messageCurrentInstance, messageInstance moved to instances.js

async function __REMOVED_loadInstances() { // Renamed to avoid conflict
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

            return `
            <div class="instance-card" data-instance-id="${instance.instanceId || ''}">
                <div class="instance-card-icons">
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

                            console.log('[App] Assigning project to instance:', {
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
                                console.error('[App] Error assigning project:', {
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
        console.error('[App] Error loading instances:', error);
        grid.innerHTML = `<div class="empty-placeholder">Error: ${escapeHtml(error.message)}</div>`;
    }
}

/**
 * Show instance detail panel
 */
async function showInstanceDetail(instanceId) {
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

        console.log('[App] Saving project assignment from detail panel:', {
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
            console.error('[App] Error updating project:', {
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
function hideInstanceDetail() {
    document.getElementById('instance-detail-view').style.display = 'none';
    document.getElementById('instances-grid').style.display = 'grid';
    document.querySelector('#tab-instances .page-header').style.display = 'flex';
    state.currentInstanceDetail = null;
}

/**
 * Send message to current instance
 */
function messageCurrentInstance() {
    if (!state.currentInstanceDetail) return;

    const instance = state.instances.find(i => i.instanceId === state.currentInstanceDetail);
    if (!instance) return;

    switchTab('messages');
    setTimeout(() => {
        selectConversation('dm', instance.name || instance.instanceId);
    }, 100);
}

/**
 * Send XMPP message to a specific instance (by instanceId)
 */
function messageInstance(instanceId) {
    const instance = state.instances.find(i => i.instanceId === instanceId);
    const dmName = instance?.name || instanceId.split('-')[0];

    switchTab('messages');
    setTimeout(() => {
        selectConversation('dm', dmName);
    }, 100);
}

// ============================================================================
// MESSAGING - imported from ./messages.js
// ============================================================================

// ============================================================================
// DIARY
// ============================================================================

async function loadDiary() {
    const container = document.getElementById('diary-content');

    if (!state.instanceId) {
        container.textContent = 'Not connected - diary unavailable';
        return;
    }

    container.innerHTML = '<div class="loading-placeholder">Loading diary...</div>';

    try {
        const result = await api.getDiary(state.instanceId);
        state.diary = result.diary || '';

        if (state.diary) {
            container.textContent = state.diary;
        } else {
            container.innerHTML = '<div class="loading-placeholder">No diary entries yet</div>';
        }
    } catch (error) {
        console.error('[App] Error loading diary:', error);
        container.textContent = 'Error loading diary: ' + error.message;
    }
}

async function addDiaryEntry() {
    const input = document.getElementById('diary-entry');
    const audienceSelect = document.getElementById('diary-audience');
    const content = input.value.trim();
    const audience = audienceSelect.value;

    if (!content) {
        showToast('Please enter a diary entry', 'warning');
        return;
    }

    if (!state.instanceId) {
        showToast('Not connected', 'error');
        return;
    }

    try {
        // Add timestamp to entry
        const timestamp = new Date().toISOString();
        const entry = `## ${timestamp}\n\n${content}\n`;

        await api.addDiaryEntry(state.instanceId, entry, audience);

        input.value = '';
        showToast('Diary entry added', 'success');

        // Refresh diary display
        await loadDiary();
    } catch (error) {
        console.error('[App] Error adding diary entry:', error);
        showToast('Failed to add diary entry: ' + error.message, 'error');
    }
}

// ============================================================================
// ADMIN
// ============================================================================

function clearSession() {
    if (confirm('Clear your session? You will need to re-bootstrap.')) {
        localStorage.removeItem(CONFIG.storageKey);
        state.instanceId = null;
        updateConnectionStatus(false);
        updateUserDisplay();
        showToast('Session cleared', 'success');
    }
}

// ============================================================================
// CREATE PROJECT - imported from ./projects.js
// ============================================================================

// ============================================================================
// CREATE TASK
// ============================================================================

function showCreateTaskModal(prefilledProject = null) {
    // Populate project dropdown
    const projectSelect = document.getElementById('task-project');
    projectSelect.disabled = false; // Re-enable in case it was disabled from project detail
    projectSelect.innerHTML = '<option value="">Personal Task (No Project)</option>';

    state.projects.forEach(project => {
        const option = document.createElement('option');
        option.value = project.projectId || project.id;
        option.textContent = project.name;
        if (prefilledProject && (project.projectId === prefilledProject || project.id === prefilledProject)) {
            option.selected = true;
        }
        projectSelect.appendChild(option);
    });

    document.getElementById('create-task-modal').classList.add('active');
    document.getElementById('task-title').value = '';
    document.getElementById('task-description').value = '';
    document.getElementById('task-priority').value = 'medium';
    document.getElementById('task-title').focus();
}

function closeCreateTaskModal() {
    document.getElementById('create-task-modal').classList.remove('active');
}

async function createTask() {
    const title = document.getElementById('task-title').value.trim();
    const description = document.getElementById('task-description').value.trim();
    const projectId = document.getElementById('task-project').value;
    const priority = document.getElementById('task-priority').value;

    if (!title) {
        showToast('Please enter a task title', 'error');
        return;
    }

    if (!state.instanceId) {
        showToast('Not connected', 'error');
        return;
    }

    try {
        // Use create_task API which handles both personal and project tasks
        const taskParams = {
            instanceId: state.instanceId,
            title: title,
            priority: priority
        };

        // Add optional fields if provided
        if (description) taskParams.description = description;
        if (projectId) taskParams.projectId = projectId;

        const result = await api.createTask(taskParams);

        if (result.success !== false && !result.error) {
            const taskType = projectId ? 'project' : 'personal';
            showToast(`Task "${title}" created (${taskType})!`, 'success');
            closeCreateTaskModal();

            // Refresh tasks view
            if (state.currentTab === 'tasks') {
                loadTasks();
            }

            // Also refresh project detail if we're viewing a project
            if (state.currentTab === 'projects' && state.currentProjectDetail) {
                // Refresh the project detail tasks list
                try {
                    const taskResult = await api.listTasks(state.instanceId, { projectId: state.currentProjectDetail, limit: 100 });
                    const tasks = taskResult.tasks || [];
                    renderProjectDetailTasks(tasks);
                    // Update task count
                    const countEl = document.getElementById('primary-task-count');
                    if (countEl) countEl.textContent = tasks.length;
                } catch (e) {
                    console.error('[App] Error refreshing project tasks:', e);
                }
            }
        } else {
            showToast(result.error?.message || 'Failed to create task', 'error');
        }
    } catch (error) {
        console.error('[App] Create task error:', error);
        showToast('Error creating task: ' + error.message, 'error');
    }
}

// Direct RPC call for APIs that don't go through our wrapper
async function rpcCallDirect(method, args) {
    const url = 'https://smoothcurves.nexus/mcp';
    const payload = {
        jsonrpc: '2.0',
        id: Date.now(),
        method: 'tools/call',
        params: {
            name: method,
            arguments: args
        }
    };

    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });

    const json = await response.json();
    if (json.error) throw new Error(json.error.message || json.error.data);
    return json.result?.data || json.result;
}

// ============================================================================
// WAKE INSTANCE & CONVERSATION
// ============================================================================

/**
 * Check if we have an API key, prompt if not
 * @returns {Promise<string|null>} The API key or null if cancelled
 */
async function ensureApiKey() {
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
function handleApiKeySubmit() {
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

/**
 * Show wake instance modal and populate dropdowns
 */
async function showWakeInstanceModal() {
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
 * Privileged roles that require promotion tokens
 * These are hidden from Wake dropdown (but available in Pre-approve for creating new instances)
 */
const PRIVILEGED_ROLES = ['PM', 'PA', 'COO', 'Executive'];

/**
 * Populate role, personality, and project dropdowns
 */
async function populateWakeDropdowns() {
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
        console.log('[App] Using default roles from config');
        state.availableRoles = uiConfig.AVAILABLE_ROLES;
    }

    try {
        const personalitiesResult = await api.getPersonalities();
        if (personalitiesResult.personalities) {
            state.availablePersonalities = personalitiesResult.personalities;
        }
    } catch (e) {
        console.log('[App] Using default personalities from config');
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
function toggleWakeSpecificId() {
    const checkbox = document.getElementById('wake-specific-id');
    const group = document.getElementById('wake-specific-id-group');
    const submitBtn = document.getElementById('wake-instance-submit');

    group.style.display = checkbox.checked ? 'block' : 'none';
    submitBtn.textContent = checkbox.checked ? 'Wake Instance' : 'Pre-approve & Wake';
}

/**
 * Handle wake form submission
 */
async function handleWakeSubmit() {
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
        console.error('[App] Wake error:', error);
        showToast('Wake failed: ' + error.message, 'error');
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = originalText;
    }
}

/**
 * Wake the current instance being viewed
 */
async function wakeCurrentInstance() {
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
async function promoteCurrentInstance() {
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

/**
 * Open conversation with the current instance detail
 */
function openInstanceConversation() {
    if (!state.currentInstanceDetail) return;
    openConversationPanel(state.currentInstanceDetail);
}

/**
 * Open the in-page conversation panel for an instance
 */
async function openConversationPanel(targetInstanceId) {
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
        console.error('[App] Error loading conversation log:', error);
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
function closeConversationPanel() {
    document.getElementById('instance-chat-panel').style.display = 'none';
    document.querySelector('.instances-layout')?.classList.remove('chat-open');
    state.wakeConversationTarget = null;
}

/**
 * Update send button state for instance chat
 */
function updateInstanceChatSendButton() {
    const input = document.getElementById('instance-chat-input');
    const sendBtn = document.getElementById('instance-chat-send');
    sendBtn.disabled = !input.value.trim() || state.wakeConversationLoading;
}

/**
 * Render conversation messages in the instance chat panel
 * Handles multi-person conversations where different instances may have sent messages
 */
function renderInstanceChatMessages() {
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
async function sendInstanceChatMessage() {
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
async function wakeAndChat(targetInstanceId) {
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
// ENTITY DETAILS - imported from ./details.js
// ============================================================================

// Make entity details functions globally accessible
window.showEntityDetails = showEntityDetails;

// ============================================================================
// EXPORTS (for debugging and inline handlers)
// ============================================================================

window.appState = state;
window.api = api;
window.switchTab = switchTab;
window.selectConversation = selectConversation;
window.replyToMessage = replyToMessage;
window.dismissQuote = dismissQuote;
window.showMessageDetail = showMessageDetail;
