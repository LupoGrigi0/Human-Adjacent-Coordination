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

// ============================================================================
// STATE MANAGEMENT
// ============================================================================

// Configuration - This UI always runs as Lupo (Executive)
const CONFIG = {
    defaultName: 'Lupo',
    defaultRole: 'Executive',
    storageKey: 'v2_lupo_instance_id',
    fixedInstanceId: 'Lupo-f63b'  // Always use this specific instance ID
};

const state = {
    // Identity
    instanceId: null,
    name: CONFIG.defaultName,
    role: CONFIG.defaultRole,
    personality: null,
    project: null,

    // Data
    projects: [],
    instances: [],
    tasks: [],
    messages: [],
    lists: [],
    diary: '',

    // Lists state
    currentListId: null,
    currentList: null,

    // Instance detail state
    currentInstanceDetail: null,

    // Wake API state
    wakeApiKey: null,
    wakeConversationTarget: null,
    wakeConversationTurns: [],
    wakeConversationLoading: false,
    availableRoles: [],
    availablePersonalities: [],

    // UI State
    currentTab: 'dashboard',
    currentConversation: null,
    conversationType: null, // 'instance' | 'project'
    theme: 'light',

    // Connection
    connected: false,
    lastUpdate: null,

    // Polling
    messagePollingInterval: null,
    unreadCount: 0
};

// ============================================================================
// INITIALIZATION
// ============================================================================

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
// THEME
// ============================================================================

function initTheme() {
    const savedTheme = localStorage.getItem('v2_theme') || 'light';
    setTheme(savedTheme);
}

function setTheme(theme) {
    state.theme = theme;
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('v2_theme', theme);

    const themeIcon = document.querySelector('.theme-icon');
    themeIcon.textContent = theme === 'dark' ? '\u2600' : '\u263D'; // sun/moon
}

function toggleTheme() {
    setTheme(state.theme === 'dark' ? 'light' : 'dark');
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
// DASHBOARD
// ============================================================================

async function loadDashboard() {
    // Update metrics
    document.getElementById('metric-projects').textContent = state.projects.length;
    document.getElementById('metric-instances').textContent = state.instances.filter(i => i.status === 'active').length || state.instances.length || '-';

    // Tasks count
    if (state.instanceId) {
        try {
            const result = await api.getMyTasks(state.instanceId);
            const personalTasks = result.personalTasks || [];
            const projectTasks = result.projectTasks || [];
            document.getElementById('metric-tasks').textContent = personalTasks.length + projectTasks.length;
        } catch (e) {
            document.getElementById('metric-tasks').textContent = '-';
        }
    } else {
        document.getElementById('metric-tasks').textContent = '-';
    }

    // Messages count
    document.getElementById('metric-messages').textContent = state.unreadCount || '-';

    // Make metric cards clickable
    document.querySelectorAll('.metric-card').forEach(card => {
        card.style.cursor = 'pointer';
        card.onclick = () => {
            const label = card.querySelector('.metric-label')?.textContent?.toLowerCase();
            if (label?.includes('project')) switchTab('projects');
            else if (label?.includes('task')) switchTab('tasks');
            else if (label?.includes('instance') || label?.includes('online')) switchTab('instances');
            else if (label?.includes('message') || label?.includes('unread')) switchTab('messages');
        };
    });

    // Activity feed (placeholder for now)
    document.getElementById('activity-feed').innerHTML = `
        <div class="activity-item" style="cursor:pointer" onclick="switchTab('projects')">
            <strong>${state.projects.length}</strong> projects available
        </div>
        <div class="activity-item" style="cursor:pointer" onclick="switchTab('instances')">
            <strong>${state.instances.length}</strong> instances registered
        </div>
        <div class="activity-item">
            Dashboard loaded at ${new Date().toLocaleTimeString()}
        </div>
    `;
}

// ============================================================================
// PROJECTS
// ============================================================================

async function loadProjects() {
    const grid = document.getElementById('project-grid');

    if (state.projects.length === 0) {
        grid.innerHTML = '<div class="loading-placeholder">No projects found</div>';
        return;
    }

    grid.innerHTML = state.projects.map(project => `
        <div class="project-card" data-project-id="${project.projectId || project.id}">
            <span class="project-status status-${project.status}">${project.status}</span>
            <div class="project-name">${escapeHtml(project.name)}</div>
            <div class="project-description">${escapeHtml(project.description || 'No description')}</div>
        </div>
    `).join('');

    // Add click handlers
    grid.querySelectorAll('.project-card').forEach(card => {
        card.addEventListener('click', () => {
            const projectId = card.dataset.projectId;
            showProjectDetail(projectId);
        });
    });
}

/**
 * Show project detail view, hiding the grid
 * Redesigned with PM card, team grid, documents, collapsible tasks, and chat sidebar
 */
async function showProjectDetail(projectId) {
    console.log('[App] Showing project detail:', projectId);

    // Hide grid and header, show detail (using flex for the new layout)
    document.getElementById('project-grid').style.display = 'none';
    document.querySelector('#tab-projects .page-header').style.display = 'none';
    document.getElementById('project-detail-view').style.display = 'flex';

    // Store current project for actions
    state.currentProjectDetail = projectId;

    // Fetch full project details from API
    let project;
    try {
        const result = await api.getProject(projectId);
        project = result.project || result;
        state.currentProject = project; // Store for later use
    } catch (e) {
        console.error('[App] Error loading project details:', e);
        project = state.projects.find(p => (p.projectId || p.id) === projectId);
        if (!project) {
            showToast('Project not found', 'error');
            hideProjectDetail();
            return;
        }
    }

    // Populate header
    document.getElementById('project-detail-name').textContent = project.name;
    document.getElementById('project-detail-status').textContent = project.status;
    document.getElementById('project-detail-status').className = `project-status status-${project.status}`;

    // Populate PM section
    renderProjectPM(project);

    // Populate team section
    renderProjectTeam(project);

    // Populate description
    document.getElementById('project-detail-description').textContent = project.description || 'No description';

    // Populate documents
    renderProjectDocuments(project);

    // Load and render project tasks
    try {
        const result = await api.listTasks(state.instanceId, { projectId });
        const tasks = result.tasks || result || [];
        renderProjectDetailTasks(tasks);
        document.getElementById('primary-task-count').textContent = tasks.length;
    } catch (e) {
        console.error('[App] Error loading project tasks:', e);
        document.getElementById('project-detail-tasks').innerHTML = '<p class="empty-placeholder">Could not load tasks</p>';
        document.getElementById('primary-task-count').textContent = '0';
    }

    // Populate repository
    const repoEl = document.getElementById('project-detail-repo');
    const repoUrl = project.ghRepo || project.repo;
    if (repoUrl) {
        repoEl.innerHTML = `<a href="${escapeHtml(repoUrl)}" target="_blank" class="repo-link">${escapeHtml(repoUrl)}</a>`;
    } else {
        repoEl.textContent = 'Not configured';
    }

    // Initialize chat sidebar
    initProjectChatSidebar(project);

    // Set up collapsible task list headers
    setupTaskListCollapse();
}

/**
 * Render the PM section with prominent card
 */
function renderProjectPM(project) {
    const pmCard = document.getElementById('project-pm-card');
    const pmId = project.pm;

    if (pmId) {
        // Find PM instance details
        const pmInstance = state.instances.find(i => i.instanceId === pmId || i.name === pmId);
        const pmName = pmInstance?.name || pmId.split('-')[0] || pmId;
        const pmStatus = pmInstance?.status || 'unknown';

        pmCard.classList.remove('no-pm');
        document.getElementById('pm-avatar').textContent = pmName.charAt(0).toUpperCase();
        document.getElementById('pm-name').textContent = pmName;
        document.getElementById('pm-id').textContent = pmId;
        document.getElementById('pm-status').textContent = pmStatus === 'active' ? 'Online' : 'Offline';

        // Show action buttons
        document.getElementById('pm-continue-btn').style.display = pmStatus === 'active' ? 'inline-flex' : 'none';
        document.getElementById('pm-message-btn').style.display = 'inline-flex';

        // Store PM info for chat
        state.currentProjectPM = { instanceId: pmId, name: pmName, status: pmStatus };
    } else {
        pmCard.classList.add('no-pm');
        document.getElementById('pm-avatar').textContent = '?';
        document.getElementById('pm-name').textContent = 'No PM Assigned';
        document.getElementById('pm-id').textContent = '-';
        document.getElementById('pm-status').textContent = '-';
        document.getElementById('pm-continue-btn').style.display = 'none';
        document.getElementById('pm-message-btn').style.display = 'none';
        state.currentProjectPM = null;
    }
}

/**
 * Render team members as card grid
 */
function renderProjectTeam(project) {
    const teamContainer = document.getElementById('project-detail-team');

    if (project.team && project.team.length > 0) {
        teamContainer.innerHTML = project.team.map(member => {
            const memberId = typeof member === 'string' ? member : member.instanceId || member.id;
            const memberName = typeof member === 'string' ? member.split('-')[0] : member.name || member.instanceId?.split('-')[0] || 'Unknown';
            const memberRole = typeof member === 'object' ? member.role : null;
            const isOnline = typeof member === 'object' ? member.online : false;

            return `
                <div class="team-member-card" data-instance-id="${escapeHtml(memberId)}">
                    <div class="team-member-avatar">${memberName.charAt(0).toUpperCase()}</div>
                    <div class="team-member-info">
                        <div class="team-member-name">${escapeHtml(memberName)}</div>
                        ${memberRole ? `<div class="team-member-role">${escapeHtml(memberRole)}</div>` : ''}
                    </div>
                    <div class="team-member-status ${isOnline ? 'online' : ''}"></div>
                </div>
            `;
        }).join('');

        // Add click handlers to team cards
        teamContainer.querySelectorAll('.team-member-card').forEach(card => {
            card.addEventListener('click', () => {
                const instanceId = card.dataset.instanceId;
                if (instanceId) {
                    showInstanceDetail(instanceId);
                }
            });
        });
    } else {
        teamContainer.innerHTML = '<p class="empty-placeholder">No team members assigned</p>';
    }
}

/**
 * Render project documents list
 */
function renderProjectDocuments(project) {
    const docsContainer = document.getElementById('project-detail-documents');
    const docs = project.documents || [];

    if (docs.length > 0) {
        docsContainer.innerHTML = docs.map(doc => `
            <div class="document-item" data-doc="${escapeHtml(doc)}">
                <span class="document-icon">&#128196;</span>
                <span class="document-name">${escapeHtml(doc)}</span>
                <span class="document-view-btn">View &rarr;</span>
            </div>
        `).join('');

        // Add click handlers for document viewing
        docsContainer.querySelectorAll('.document-item').forEach(item => {
            item.addEventListener('click', async () => {
                const docName = item.dataset.doc;
                await showProjectDocument(state.currentProjectDetail, docName);
            });
        });
    } else {
        docsContainer.innerHTML = '<p class="empty-placeholder">No documents</p>';
    }
}

/**
 * Show a project document in a modal
 */
async function showProjectDocument(projectId, docName) {
    showToast(`Loading ${docName}...`, 'info');
    // TODO: Implement document viewing modal
    // For now, just show a toast - would need a getProjectDocument API
    console.log('[App] Would show document:', projectId, docName);
    showToast('Document viewing coming soon', 'info');
}

/**
 * Initialize the project chat sidebar
 */
function initProjectChatSidebar(project) {
    // Set up tab switching
    const tabs = document.querySelectorAll('.chat-sidebar-tabs .chat-tab');
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            // Remove active from all tabs and contents
            tabs.forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.chat-tab-content').forEach(c => c.classList.remove('active'));

            // Add active to clicked tab and corresponding content
            tab.classList.add('active');
            const targetId = tab.dataset.tab + '-content';
            document.getElementById(targetId)?.classList.add('active');
        });
    });

    // Set team room name
    document.getElementById('team-room-name').textContent = project.xmppRoom ?
        project.name + ' Room' : 'Project Room';

    // Set PM name in chat
    if (state.currentProjectPM) {
        document.getElementById('chat-pm-name').textContent = state.currentProjectPM.name;
        document.getElementById('pm-chat-send').disabled = false;
    } else {
        document.getElementById('chat-pm-name').textContent = 'No PM';
        document.getElementById('pm-chat-send').disabled = true;
    }

    // Load team room messages
    loadProjectTeamMessages(project);

    // Set up message sending
    setupProjectChatInputs(project);
}

/**
 * Load messages from the project's XMPP room
 */
async function loadProjectTeamMessages(project) {
    const container = document.getElementById('team-room-messages');

    if (!project.xmppRoom) {
        container.innerHTML = '<div class="empty-state-mini"><span>No project room configured</span></div>';
        return;
    }

    try {
        const roomName = project.xmppRoom.split('@')[0]; // Extract room name from JID
        const result = await api.getMessages(state.instanceId, { room: `project-${project.projectId || project.id}`, limit: 20 });
        const messages = result.messages || [];

        if (messages.length === 0) {
            container.innerHTML = '<div class="empty-state-mini"><span>No messages yet</span></div>';
            return;
        }

        container.innerHTML = messages.map(msg => {
            const isSent = msg.from?.includes(state.instanceId) || msg.from?.includes('Lupo');
            const senderName = msg.from?.split('@')[0] || 'Unknown';
            const time = msg.timestamp ? new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';

            return `
                <div class="message-mini ${isSent ? 'sent' : 'received'}">
                    ${!isSent ? `<div class="message-mini-sender">${escapeHtml(senderName)}</div>` : ''}
                    <div>${escapeHtml(msg.body || msg.subject || '(no content)')}</div>
                    <div class="message-mini-time">${time}</div>
                </div>
            `;
        }).join('');

        // Scroll to bottom
        container.scrollTop = container.scrollHeight;
    } catch (e) {
        console.error('[App] Error loading team messages:', e);
        container.innerHTML = '<div class="empty-state-mini"><span>Could not load messages</span></div>';
    }
}

/**
 * Set up chat input handlers for project sidebar
 */
function setupProjectChatInputs(project) {
    // Team room send
    const teamSendBtn = document.getElementById('team-room-send');
    const teamInput = document.getElementById('team-room-input');
    const teamSubject = document.getElementById('team-room-subject');

    teamSendBtn.onclick = async () => {
        const body = teamInput.value.trim();
        if (!body) return;

        try {
            await api.sendMessage(state.instanceId, {
                to: `project:${project.projectId || project.id}`,
                subject: teamSubject.value.trim() || undefined,
                body: body
            });
            teamInput.value = '';
            teamSubject.value = '';
            showToast('Message sent', 'success');
            loadProjectTeamMessages(project);
        } catch (e) {
            console.error('[App] Error sending team message:', e);
            showToast('Failed to send message', 'error');
        }
    };

    // Enter key to send
    teamInput.onkeydown = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            teamSendBtn.click();
        }
    };

    // PM chat send (via continue_conversation)
    const pmSendBtn = document.getElementById('pm-chat-send');
    const pmInput = document.getElementById('pm-chat-input');

    pmSendBtn.onclick = async () => {
        if (!state.currentProjectPM) return;
        const body = pmInput.value.trim();
        if (!body) return;

        // Check for API key
        if (!state.wakeApiKey) {
            await ensureApiKey();
            if (!state.wakeApiKey) return;
        }

        try {
            pmSendBtn.disabled = true;
            document.getElementById('pm-chat-messages').innerHTML += `
                <div class="message-mini sent">
                    <div>${escapeHtml(body)}</div>
                    <div class="message-mini-time">Sending...</div>
                </div>
            `;

            const result = await api.continueConversation(
                state.instanceId,
                state.currentProjectPM.instanceId,
                uiConfig.MESSAGE_PREFIX + body + uiConfig.MESSAGE_POSTSCRIPT,
                state.wakeApiKey
            );

            // Show response
            const response = result.response || result.output || 'No response';
            document.getElementById('pm-chat-messages').innerHTML += `
                <div class="message-mini received">
                    <div class="message-mini-sender">${escapeHtml(state.currentProjectPM.name)}</div>
                    <div>${escapeHtml(response.substring(0, 500))}${response.length > 500 ? '...' : ''}</div>
                    <div class="message-mini-time">Just now</div>
                </div>
            `;

            pmInput.value = '';

            // Update turn count
            const turnCount = result.turn || (state.pmChatTurns || 0) + 1;
            state.pmChatTurns = turnCount;
            document.getElementById('pm-chat-turn-count').textContent = `Turn ${turnCount}`;

            // Scroll to bottom
            const container = document.getElementById('pm-chat-messages');
            container.scrollTop = container.scrollHeight;

        } catch (e) {
            console.error('[App] Error in PM chat:', e);
            showToast('Failed to send to PM: ' + e.message, 'error');
        } finally {
            pmSendBtn.disabled = !state.currentProjectPM;
        }
    };

    pmInput.onkeydown = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            pmSendBtn.click();
        }
    };
}

/**
 * Set up collapsible task list behavior
 */
function setupTaskListCollapse() {
    document.querySelectorAll('.task-list-header').forEach(header => {
        header.addEventListener('click', () => {
            const card = header.closest('.task-list-card');
            card.classList.toggle('expanded');
        });
    });
}

/**
 * Hide project detail, return to grid
 */
function hideProjectDetail() {
    document.getElementById('project-detail-view').style.display = 'none';
    document.getElementById('project-grid').style.display = 'grid';
    document.querySelector('#tab-projects .page-header').style.display = 'flex';
    state.currentProjectDetail = null;
    state.currentProject = null;
    state.currentProjectPM = null;
    state.pmChatTurns = 0;
}

/**
 * Render tasks in project detail view
 */
function renderProjectDetailTasks(tasks) {
    const container = document.getElementById('project-detail-tasks');

    if (!tasks || tasks.length === 0) {
        container.innerHTML = '<p class="empty-placeholder">No tasks yet</p>';
        return;
    }

    container.innerHTML = tasks.map(task => `
        <div class="detail-task-item" data-task-id="${task.taskId || task.id}">
            <span class="priority-badge priority-${task.priority || 'medium'}">${task.priority || 'medium'}</span>
            <span class="detail-task-title">${escapeHtml(task.title)}</span>
            <span class="detail-task-status">${task.status || 'pending'}</span>
        </div>
    `).join('');

    // Add click handlers to navigate to task detail
    container.querySelectorAll('.detail-task-item').forEach(item => {
        item.addEventListener('click', () => {
            const taskId = item.dataset.taskId;
            // Show task detail, tracking that we came from project detail
            showTaskDetail(taskId, 'project');
        });
    });
}

// ============================================================================
// TASKS
// ============================================================================

async function loadTasks() {
    if (!state.instanceId) {
        document.querySelectorAll('.task-list').forEach(list => {
            list.innerHTML = '<div class="loading-placeholder">Bootstrap to see tasks</div>';
        });
        return;
    }

    try {
        // Get all tasks for this instance (personal + project)
        let allTasks = [];
        const result = await api.getMyTasks(state.instanceId);
        if (result.personalTasks) {
            allTasks = [...allTasks, ...result.personalTasks];
        }
        if (result.projectTasks) {
            allTasks = [...allTasks, ...result.projectTasks];
        }

        renderTaskBoard(allTasks);
    } catch (error) {
        console.error('[App] Error loading tasks:', error);
        document.querySelectorAll('.task-list').forEach(list => {
            list.innerHTML = '<div class="loading-placeholder">Error loading tasks</div>';
        });
    }
}

function renderTaskBoard(tasks) {
    // Store tasks for later lookup
    state.tasks = tasks;

    const pending = tasks.filter(t => t.status === 'pending');
    const inProgress = tasks.filter(t => t.status === 'in_progress');
    const completed = tasks.filter(t => t.status === 'completed');

    document.getElementById('pending-count').textContent = pending.length;
    document.getElementById('progress-count').textContent = inProgress.length;
    document.getElementById('completed-count').textContent = completed.length;

    document.getElementById('pending-tasks').innerHTML = renderTaskList(pending);
    document.getElementById('progress-tasks').innerHTML = renderTaskList(inProgress);
    document.getElementById('completed-tasks').innerHTML = renderTaskList(completed);

    // Add click handlers to task items
    document.querySelectorAll('.task-item').forEach(item => {
        item.addEventListener('click', () => {
            const taskId = item.dataset.taskId;
            showTaskDetail(taskId);
        });
    });
}

function renderTaskList(tasks) {
    if (tasks.length === 0) {
        return '<div class="loading-placeholder">No tasks</div>';
    }

    return tasks.map(task => `
        <div class="task-item" data-task-id="${task.taskId || task.id}">
            <div class="task-title">${escapeHtml(task.title)}</div>
            <div class="task-meta">
                <span class="priority-badge priority-${task.priority}">${task.priority}</span>
                <span>${task.project || 'Personal'}</span>
            </div>
        </div>
    `).join('');
}

/**
 * Show task detail view, hiding the board
 * @param {string} taskId - The task ID to show
 * @param {string} [source='tasks'] - Where we came from: 'tasks' or 'project'
 */
async function showTaskDetail(taskId, source = 'tasks') {
    // Track where we came from for back navigation
    state.taskDetailSource = source;

    // First try to find task in state
    let task = state.tasks.find(t => (t.taskId || t.id) === taskId);

    // If not found, fetch all tasks and find it
    if (!task) {
        try {
            const result = await api.getMyTasks(state.instanceId);
            const allTasks = [...(result.personalTasks || []), ...(result.projectTasks || [])];
            task = allTasks.find(t => (t.taskId || t.id) === taskId);
        } catch (e) {
            console.error('[App] Error fetching task:', e);
            showToast('Could not load task details', 'error');
            return;
        }
    }

    if (!task) {
        showToast('Task not found', 'error');
        return;
    }

    console.log('[App] Showing task detail:', taskId, task, 'source:', source);

    // If coming from project, switch to tasks tab first (task detail is in tasks tab)
    if (source === 'project') {
        // Switch to tasks tab without triggering loadTasks (we just want to show detail)
        document.querySelectorAll('.nav-item').forEach(item => {
            item.classList.toggle('active', item.dataset.tab === 'tasks');
        });
        document.querySelectorAll('.tab-content').forEach(content => {
            content.classList.toggle('active', content.id === 'tab-tasks');
        });
        state.currentTab = 'tasks';
    }

    // Hide board and header, show detail
    document.querySelector('.task-board').style.display = 'none';
    document.querySelector('.task-filters').style.display = 'none';
    document.querySelector('#tab-tasks .page-header').style.display = 'none';
    document.getElementById('task-detail-view').style.display = 'block';

    // Populate detail fields
    document.getElementById('task-detail-title').textContent = task.title;
    document.getElementById('task-detail-priority').textContent = task.priority || 'medium';
    document.getElementById('task-detail-priority').className = `priority-badge priority-${task.priority || 'medium'}`;
    document.getElementById('task-detail-status').textContent = task.status || 'pending';
    document.getElementById('task-detail-description').textContent = task.description || 'No description';
    document.getElementById('task-detail-project').textContent = task.project || task.project_id || 'Personal';
    document.getElementById('task-detail-assignee').textContent = task.assignee || task.claimed_by || 'Unassigned';

    // Format created date with creator if available
    // Check multiple field name variations for compatibility
    let createdText = '-';
    const createdDate = task.createdAt || task.created_at || task.dateCreated || task.timestamp || task.created;
    if (createdDate) {
        const date = new Date(createdDate).toLocaleString();
        const creator = task.created_by || task.creator || task.createdBy || task.author || null;
        createdText = creator ? `${date} by ${creator}` : date;
    } else {
        // Debug: Log available task fields to help identify correct field names
        console.log('[App] Task has no created date. Available fields:', Object.keys(task));
    }
    document.getElementById('task-detail-created').textContent = createdText;

    // Store current task for actions
    state.currentTaskDetail = taskId;

    // Update button states based on task status
    const claimBtn = document.getElementById('task-claim-btn');
    const completeBtn = document.getElementById('task-complete-btn');

    if (task.status === 'completed') {
        claimBtn.style.display = 'none';
        completeBtn.textContent = 'Completed';
        completeBtn.disabled = true;
    } else if (task.assignee || task.claimed_by) {
        claimBtn.textContent = 'Reassign';
        claimBtn.style.display = 'inline-flex';
        completeBtn.textContent = 'Mark Complete';
        completeBtn.disabled = false;
    } else {
        claimBtn.textContent = 'Claim Task';
        claimBtn.style.display = 'inline-flex';
        completeBtn.textContent = 'Mark Complete';
        completeBtn.disabled = false;
    }

    // Update breadcrumb text based on source
    const backText = document.getElementById('task-back-text');
    if (backText) {
        if (source === 'project' && state.currentProjectDetail) {
            const project = state.projects.find(p => (p.projectId || p.id) === state.currentProjectDetail);
            backText.textContent = `Back to ${project?.name || 'Project'}`;
        } else {
            backText.textContent = 'Back to Tasks';
        }
    }
}

/**
 * Hide task detail, return to where we came from
 */
async function hideTaskDetail() {
    document.getElementById('task-detail-view').style.display = 'none';

    // Check where we came from
    if (state.taskDetailSource === 'project' && state.currentProjectDetail) {
        // Save project ID before switchTab clears it
        const projectId = state.currentProjectDetail;

        // Ensure projects are in state (fetch from API if needed)
        if (!state.projects || state.projects.length === 0) {
            try {
                const projectsResult = await api.listProjects();
                if (projectsResult.projects) {
                    state.projects = projectsResult.projects;
                }
            } catch (e) {
                console.error('[App] Error loading projects:', e);
            }
        }

        // Switch to projects tab (this hides all detail views)
        switchTab('projects');

        // Small delay to let tab switch complete, then show project detail
        setTimeout(() => showProjectDetail(projectId), 50);
    } else {
        // Return to task board (default)
        document.querySelector('.task-board').style.display = 'grid';
        document.querySelector('.task-filters').style.display = 'flex';
        document.querySelector('#tab-tasks .page-header').style.display = 'flex';
    }

    state.currentTaskDetail = null;
    state.taskDetailSource = null;
}

/**
 * Claim the currently displayed task (assign to self)
 */
async function claimCurrentTask() {
    if (!state.currentTaskDetail || !state.instanceId) return;

    try {
        // Get the task's project ID if available
        const task = state.tasks.find(t => (t.id || t.taskId) === state.currentTaskDetail);
        const projectId = task?.projectId || task?.project_id || null;

        // Use assign_task_to_instance API to claim (assign to self)
        await api.assignTaskToInstance({
            instanceId: state.instanceId,
            taskId: state.currentTaskDetail,
            assigneeInstanceId: state.instanceId,
            projectId: projectId
        });
        showToast('Task claimed!', 'success');

        // Update the assignee display immediately
        document.getElementById('task-detail-assignee').textContent = state.instanceId;

        // Update button states
        const claimBtn = document.getElementById('task-claim-btn');
        claimBtn.textContent = 'Reassign';

        // Also refresh task board in background
        loadTasks();
    } catch (e) {
        console.error('[App] Error claiming task:', e);
        showToast('Could not claim task: ' + e.message, 'error');
    }
}

/**
 * Mark the currently displayed task as complete
 */
async function completeCurrentTask() {
    if (!state.currentTaskDetail) return;

    try {
        await api.completePersonalTask(state.instanceId, state.currentTaskDetail);
        showToast('Task completed!', 'success');
        hideTaskDetail();
        loadTasks(); // Refresh the task board
    } catch (e) {
        console.error('[App] Error completing task:', e);
        showToast('Could not complete task: ' + e.message, 'error');
    }
}

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
        // Get current project
        const project = state.projects.find(p => (p.projectId || p.id) === state.currentProjectDetail);
        if (!project) throw new Error('Project not found');

        // Add to team
        const currentTeam = project.team || [];
        const newTeam = [...currentTeam, instanceId || name];

        // Update via API
        // TODO: 'update_project' API does not exist - update functionality may need to be implemented
        await rpcCallDirect('update_project', {
            id: state.currentProjectDetail,
            updates: { team: newTeam }
        });

        // Update local state
        project.team = newTeam;

        // Refresh the team display
        const teamContainer = document.getElementById('project-detail-team');
        teamContainer.innerHTML = newTeam.map(member => `
            <div class="team-member">
                <span class="team-avatar">${(member.name || member).toString().charAt(0).toUpperCase()}</span>
                <span>${escapeHtml(member.name || member)}</span>
            </div>
        `).join('');

        showToast(`${name} added to project!`, 'success');
    } catch (e) {
        console.error('[App] Error assigning instance:', e);
        showToast('Could not assign instance: ' + e.message, 'error');
    }
}

// ============================================================================
// INSTANCES
// ============================================================================

async function loadInstances() {
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
// MESSAGING (V2 - XMPP Room-based)
// ============================================================================

// Known team members for DMs (will be populated from instances + hardcoded known names)
const KNOWN_TEAM_MEMBERS = ['Lupo', 'Messenger', 'Bridge', 'Bastion', 'Canvas', 'Genevieve', 'Meridian'];

async function loadMessaging() {
    const sidebar = document.getElementById('conversation-list');

    // Build the sidebar with V2 structure:
    // 1. Direct Messages (DMs to known team members)
    // 2. Projects (project rooms)
    // 3. Roles (if privileged user)
    // 4. System (announcements)

    let html = '';

    // --- MY INBOX (personality room for current user) ---
    const myPersonalityRoom = `personality-${state.name.toLowerCase()}`;
    const isInboxActive = state.conversationType === 'inbox' && state.currentConversation === myPersonalityRoom;
    html += `
        <div class="conversation-section" id="inbox-section">
            <div class="section-header">MY INBOX</div>
            <div id="inbox-list">
                <div class="conversation-item ${isInboxActive ? 'active' : ''}"
                     data-type="inbox" data-id="${myPersonalityRoom}">
                    <div class="conversation-avatar">&#128229;</div>
                    <div class="conversation-details">
                        <div class="conversation-name">Messages to Me</div>
                        <div class="conversation-meta">${state.instanceId || state.name}</div>
                    </div>
                </div>
            </div>
        </div>
    `;

    // --- DIRECT MESSAGES ---
    html += `
        <div class="conversation-section" id="dm-section">
            <div class="section-header">DIRECT MESSAGES</div>
            <div id="dm-list">
                ${renderDMList()}
            </div>
        </div>
    `;

    // --- PROJECTS ---
    html += `
        <div class="conversation-section" id="project-section">
            <div class="section-header">PROJECTS</div>
            <div id="project-room-list">
                ${renderProjectRoomList()}
            </div>
        </div>
    `;

    // --- ROLES (for privileged users like Executive/COO/PA) ---
    if (state.role === 'Executive' || state.role === 'COO' || state.role === 'PA') {
        html += `
            <div class="conversation-section" id="role-section">
                <div class="section-header">ROLES</div>
                <div id="role-list">
                    ${renderRoleList()}
                </div>
            </div>
        `;
    }

    // --- SYSTEM ---
    html += `
        <div class="conversation-section" id="system-section">
            <div class="section-header">SYSTEM</div>
            <div id="system-list">
                <div class="conversation-item ${state.conversationType === 'announcements' ? 'active' : ''}"
                     data-type="announcements" data-id="all">
                    <div class="conversation-avatar">&#128227;</div>
                    <div class="conversation-details">
                        <div class="conversation-name">Announcements</div>
                        <div class="conversation-meta">Broadcast to all</div>
                    </div>
                </div>
            </div>
        </div>
    `;

    sidebar.innerHTML = html;

    // Add click handlers to all conversation items
    sidebar.querySelectorAll('.conversation-item').forEach(item => {
        item.addEventListener('click', () => selectConversation(item.dataset.type, item.dataset.id));
    });
}

function renderDMList() {
    // Build list of contacts with their instanceIds
    // Map: name -> instanceId (or 'unknown' if from KNOWN_TEAM_MEMBERS without instance)
    const contacts = new Map();

    // Add known team members (may not have instanceId yet)
    KNOWN_TEAM_MEMBERS.forEach(name => {
        contacts.set(name, { name, instanceId: null });
    });

    // Add/update with actual instance data
    state.instances.forEach(inst => {
        if (inst.name) {
            contacts.set(inst.name, {
                name: inst.name,
                instanceId: inst.instanceId || null
            });
        }
    });

    // Remove self (Lupo)
    contacts.delete(state.name);

    // Sort by name
    const sortedContacts = Array.from(contacts.values()).sort((a, b) => a.name.localeCompare(b.name));

    if (sortedContacts.length === 0) {
        return '<div class="loading-placeholder">No contacts</div>';
    }

    return sortedContacts.map(contact => {
        const isActive = state.conversationType === 'dm' && state.currentConversation === contact.name;
        const metaText = contact.instanceId || 'Direct Message';
        return `
            <div class="conversation-item ${isActive ? 'active' : ''}"
                 data-type="dm" data-id="${escapeHtml(contact.name)}">
                <div class="conversation-avatar">${contact.name.charAt(0).toUpperCase()}</div>
                <div class="conversation-details">
                    <div class="conversation-name">${escapeHtml(contact.name)}</div>
                    <div class="conversation-meta">${escapeHtml(metaText)}</div>
                </div>
            </div>
        `;
    }).join('');
}

function renderProjectRoomList() {
    if (state.projects.length === 0) {
        return '<div class="loading-placeholder">No projects</div>';
    }

    return state.projects
        .filter(p => p.status === 'active')
        .map(project => {
            const projectId = project.projectId || project.id;
            const isActive = state.conversationType === 'project' && state.currentConversation === projectId;
            return `
                <div class="conversation-item ${isActive ? 'active' : ''}"
                     data-type="project" data-id="${projectId}">
                    <div class="conversation-avatar">#</div>
                    <div class="conversation-details">
                        <div class="conversation-name">${escapeHtml(project.name)}</div>
                        <div class="conversation-meta">Project Room</div>
                    </div>
                </div>
            `;
        }).join('');
}

function renderRoleList() {
    // Available role rooms
    const roles = ['Executive', 'COO', 'PA', 'PM', 'Developer'];

    return roles.map(role => {
        const isActive = state.conversationType === 'role' && state.currentConversation === role.toLowerCase();
        return `
            <div class="conversation-item ${isActive ? 'active' : ''}"
                 data-type="role" data-id="${role.toLowerCase()}">
                <div class="conversation-avatar">&#128101;</div>
                <div class="conversation-details">
                    <div class="conversation-name">${role}</div>
                    <div class="conversation-meta">Role Channel</div>
                </div>
            </div>
        `;
    }).join('');
}

// Legacy compatibility functions
function renderInstanceList() {
    loadMessaging();
}

function renderProjectRooms() {
    // Already rendered in loadMessaging
}

// filterConversations removed - V2 uses XMPP room structure instead

// Show message detail view for inbox messages
async function showMessageDetail(messageId, senderName, subject, room) {
    // Pause polling while viewing detail
    state.viewingMessageDetail = true;

    const container = document.getElementById('chat-messages');
    container.innerHTML = '<div class="loading-placeholder">Loading message...</div>';

    // Update header to show we're viewing a message
    document.querySelector('.recipient-name').textContent = 'Message Detail';
    document.querySelector('.recipient-status').textContent = `From: ${senderName}`;
    document.querySelector('.recipient-icon').textContent = '\u{1F4E8}';  // Envelope icon

    try {
        // Fetch full message body
        const fullMsg = await api.getMessageBody(state.instanceId, messageId, room);
        const body = fullMsg.body || fullMsg.subject || '[No content]';

        // Extract sender name for reply (e.g., "lupo-f63b" -> "Lupo")
        const senderBaseName = senderName.split('-')[0];
        const senderCapitalized = senderBaseName.charAt(0).toUpperCase() + senderBaseName.slice(1);

        container.innerHTML = `
            <div class="message-detail-view">
                <div class="message-detail-header">
                    <button class="btn-back" onclick="selectConversation('inbox', 'personality-${state.name.toLowerCase()}')">
                        ← Back to Inbox
                    </button>
                </div>
                <div class="message-detail-card">
                    <div class="message-detail-from">
                        <span class="detail-label">From:</span>
                        <span class="detail-value">${escapeHtml(senderName)}</span>
                    </div>
                    <div class="message-detail-subject">
                        <span class="detail-label">Subject:</span>
                        <span class="detail-value">${escapeHtml(subject)}</span>
                    </div>
                    <div class="message-detail-body">
                        ${escapeHtml(body)}
                    </div>
                    <div class="message-detail-actions">
                        <button class="btn btn-primary" onclick="replyToMessage('${escapeHtml(senderCapitalized)}', '${escapeHtml(body.substring(0, 200).replace(/'/g, "\\'"))}')">
                            ↩ Reply to ${escapeHtml(senderCapitalized)}
                        </button>
                    </div>
                </div>
            </div>
        `;
    } catch (error) {
        console.error('[App] Error loading message detail:', error);
        container.innerHTML = `
            <div class="empty-state">
                <span class="empty-icon">&#9888;</span>
                <p>Error loading message: ${escapeHtml(error.message)}</p>
            </div>
        `;
    }
}

// Reply to a message from inbox - navigate to DM with quote
async function replyToMessage(senderName, originalMessage) {
    // Store the quote to show in the DM
    state.replyQuote = {
        from: senderName,
        text: originalMessage
    };
    // Navigate to DM with sender
    await selectConversation('dm', senderName);
}

// Dismiss the reply quote
function dismissQuote() {
    state.replyQuote = null;
    const quote = document.querySelector('.reply-quote');
    if (quote) quote.remove();
}

async function selectConversation(type, id) {
    // Clear detail view flag (resuming normal polling)
    state.viewingMessageDetail = false;

    state.currentConversation = id;
    state.conversationType = type;

    // Update UI to show active conversation
    document.querySelectorAll('.conversation-item').forEach(item => {
        const itemMatch = item.dataset.type === type && item.dataset.id === id;
        item.classList.toggle('active', itemMatch);
    });

    // Update chat header based on conversation type
    let name, status, icon;
    switch (type) {
        case 'dm':
            name = id;  // id is the person's name
            // Find instanceId for this contact
            const contact = state.instances.find(inst => inst.name === id);
            status = contact?.instanceId || 'Direct Message';
            icon = '\u{1F464}';  // Person icon
            break;
        case 'project':
            const project = state.projects.find(p => (p.projectId || p.id) === id);
            console.log('[App] selectConversation project lookup:', { id, found: !!project, projectIds: state.projects.map(p => p.projectId || p.id) });
            name = project?.name || id;
            status = project ? `Project: ${project.projectId || project.id}` : 'Project Room';
            icon = '#';
            break;
        case 'role':
            name = id.charAt(0).toUpperCase() + id.slice(1);  // Capitalize
            status = 'Role Channel';
            icon = '\u{1F465}';  // People icon
            break;
        case 'announcements':
            name = 'Announcements';
            status = 'Broadcast Channel';
            icon = '\u{1F4E2}';  // Megaphone icon
            break;
        case 'inbox':
            name = 'Messages to Me';
            status = state.instanceId || state.name;
            icon = '\u{1F4E9}';  // Envelope icon
            break;
        default:
            name = id;
            status = 'Chat';
            icon = '\u{1F4AC}';  // Speech bubble
    }

    document.querySelector('.recipient-name').textContent = name;
    document.querySelector('.recipient-status').textContent = status;
    document.querySelector('.recipient-icon').textContent = icon;

    // Show input area
    // Hide compose area for inbox (messages come from different senders, reply via DM)
    document.getElementById('chat-input-area').style.display = type === 'inbox' ? 'none' : 'block';

    // Load messages
    await loadConversationMessages(type, id);
}

async function loadConversationMessages(type, id) {
    const container = document.getElementById('chat-messages');

    if (!state.instanceId) {
        container.innerHTML = `
            <div class="empty-state">
                <span class="empty-icon">&#128274;</span>
                <p>Bootstrap to send messages</p>
            </div>
        `;
        return;
    }

    container.innerHTML = '<div class="loading-placeholder">Loading messages...</div>';

    try {
        // Determine room name based on conversation type
        // Room format: personality-{name}, project-{id}, role-{role}, announcements
        let room;
        if (type === 'dm') {
            // DM rooms are personality-{name}
            room = `personality-${id.toLowerCase()}`;
        } else if (type === 'project') {
            room = `project-${id}`;
        } else if (type === 'role') {
            room = `role-${id.toLowerCase()}`;
        } else if (type === 'announcements') {
            room = 'announcements';
        } else if (type === 'inbox') {
            // Inbox uses the personality room name directly (id is already "personality-{name}")
            room = id;
        }

        // V2 XMPP API - fetch messages for this specific room
        const result = await api.getMessages(state.instanceId, { room, limit: 50 });
        const conversationMessages = result.messages || [];

        if (conversationMessages.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <span class="empty-icon">&#128172;</span>
                    <p>No messages yet. Start the conversation!</p>
                </div>
            `;
            return;
        }

        // Sort by timestamp (oldest first)
        conversationMessages.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

        // Render messages
        const isInbox = type === 'inbox';
        const messageHtml = await Promise.all(conversationMessages.map(async msg => {
            // Check if message is from current user
            // msg.from could be: "lupo", "lupo-f63b", or full JID
            const fromName = (msg.from || '').toLowerCase().split('-')[0].split('@')[0];
            const myName = (state.name || '').toLowerCase();
            const myInstanceId = (state.instanceId || '').toLowerCase();
            const isSent = fromName === myName ||
                           msg.from?.toLowerCase() === myInstanceId ||
                           msg.from?.toLowerCase().startsWith(myName + '-');
            const time = msg.timestamp ? new Date(msg.timestamp).toLocaleTimeString() : '';

            // For inbox: just show subject (body fetched on click for detail view)
            // For other views: fetch body if needed
            let body = msg.body || msg.subject || '';
            if (!isInbox && !body && msg.id) {
                try {
                    const fullMsg = await api.getMessageBody(state.instanceId, msg.id, room);
                    body = fullMsg.body || fullMsg.subject || '';
                } catch (e) {
                    body = msg.subject || '[Message body unavailable]';
                }
            }

            // In inbox, make entire message clickable to open detail view
            const clickHandler = isInbox && !isSent ?
                `onclick="showMessageDetail('${msg.id}', '${escapeHtml(msg.from || 'Unknown')}', '${escapeHtml((msg.subject || '').replace(/'/g, "\\'"))}', '${room}')" style="cursor: pointer;"` : '';

            // For inbox: show subject only with "click to read" hint
            // For other views: show full body
            const bodyContent = isInbox && !isSent
                ? `<div class="inbox-preview">Click to read & reply</div>`
                : `<div>${escapeHtml(body)}</div>`;

            return `
                <div class="message-bubble ${isSent ? 'sent' : 'received'} ${isInbox && !isSent ? 'inbox-message' : ''}" ${clickHandler}>
                    ${!isSent ? `<div class="message-sender">${escapeHtml(msg.from || 'Unknown')}</div>` : ''}
                    ${msg.subject ? `<div class="message-subject"><strong>${escapeHtml(msg.subject)}</strong></div>` : ''}
                    ${bodyContent}
                    <div class="message-meta">${time}</div>
                </div>
            `;
        }));

        // Build final HTML with optional reply quote at top
        let finalHtml = '';
        if (state.replyQuote && type === 'dm') {
            finalHtml = `
                <div class="reply-quote">
                    <div class="reply-quote-header">
                        <span>Replying to message from ${escapeHtml(state.replyQuote.from)}</span>
                        <button class="btn-dismiss-quote" onclick="dismissQuote()">✕</button>
                    </div>
                    <div class="reply-quote-text">${escapeHtml(state.replyQuote.text)}</div>
                </div>
            `;
            // Clear the quote after showing (one-time display)
            state.replyQuote = null;
        }
        finalHtml += messageHtml.join('');
        container.innerHTML = finalHtml;

        // Scroll to bottom
        container.scrollTop = container.scrollHeight;

    } catch (error) {
        console.error('[App] Error loading messages:', error);
        container.innerHTML = `
            <div class="empty-state">
                <span class="empty-icon">&#9888;</span>
                <p>Error loading messages: ${escapeHtml(error.message)}</p>
            </div>
        `;
    }
}

async function sendMessage() {
    const input = document.getElementById('message-input');
    const subjectInput = document.getElementById('message-subject');
    const body = input.value.trim();
    const userSubject = subjectInput?.value.trim() || '';

    if (!body || !state.instanceId || !state.currentConversation) {
        return;
    }

    const sendBtn = document.getElementById('send-btn');
    sendBtn.disabled = true;

    try {
        // V2 XMPP addressing format:
        // - DM to person: just the name (e.g., "Messenger")
        // - Project room: "project:{projectId}"
        // - Role room: "role:{role}"
        // - Everyone: "all"
        let to;
        if (state.conversationType === 'dm') {
            // Direct message - just use name
            to = state.currentConversation;
        } else if (state.conversationType === 'project') {
            // Project room
            to = `project:${state.currentConversation}`;
        } else if (state.conversationType === 'role') {
            // Role room
            to = `role:${state.currentConversation}`;
        } else if (state.conversationType === 'announcements') {
            // Broadcast
            to = 'all';
        } else {
            // Fallback - treat as DM
            to = state.currentConversation;
        }

        // Use user-provided subject if available, otherwise use body preview
        const subject = userSubject || (body.length > 50 ? body.substring(0, 50) + '...' : body);
        await api.sendMessage({
            from: state.instanceId,
            to,
            subject: subject,
            body: body
        });

        // Add message to UI
        const container = document.getElementById('chat-messages');
        const emptyState = container.querySelector('.empty-state');
        if (emptyState) {
            container.innerHTML = '';
        }

        container.innerHTML += `
            <div class="message-bubble sent">
                ${userSubject ? `<div class="message-subject"><strong>${escapeHtml(userSubject)}</strong></div>` : ''}
                <div>${escapeHtml(body)}</div>
                <div class="message-meta">${new Date().toLocaleTimeString()}</div>
            </div>
        `;

        // Scroll to bottom
        container.scrollTop = container.scrollHeight;

        // Clear inputs
        input.value = '';
        input.style.height = 'auto';
        if (subjectInput) subjectInput.value = '';

        showToast('Message sent', 'success');
    } catch (error) {
        console.error('[App] Error sending message:', error);
        showToast('Failed to send message: ' + error.message, 'error');
    }

    sendBtn.disabled = !input.value.trim();
}

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
// CREATE PROJECT
// ============================================================================

function showCreateProjectModal() {
    document.getElementById('create-project-modal').classList.add('active');
    document.getElementById('project-name').value = '';
    document.getElementById('project-description').value = '';
    document.getElementById('project-gh-repo').value = '';
    document.getElementById('project-name').focus();
}

function closeCreateProjectModal() {
    document.getElementById('create-project-modal').classList.remove('active');
}

async function createProject() {
    const name = document.getElementById('project-name').value.trim();
    const description = document.getElementById('project-description').value.trim();
    const ghRepo = document.getElementById('project-gh-repo').value.trim();

    if (!name) {
        showToast('Please enter a project name', 'error');
        return;
    }

    if (!state.instanceId) {
        showToast('Not connected', 'error');
        return;
    }

    try {
        // V2 API requires projectId - generate from name
        const projectId = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

        const params = {
            instanceId: state.instanceId,
            projectId: projectId,
            name: name
        };

        if (description) params.description = description;
        if (ghRepo) params.ghRepo = ghRepo;

        const result = await api.createProject(params);

        if (result.success !== false) {
            showToast(`Project "${name}" created!`, 'success');
            closeCreateProjectModal();

            // Refresh projects (V2 API)
            const projectsResult = await api.listProjects();
            if (projectsResult.projects) {
                state.projects = projectsResult.projects;
            }

            // Refresh current view
            if (state.currentTab === 'projects') {
                loadProjects();
            }
            if (state.currentTab === 'messages') {
                renderProjectRooms();
            }
        } else {
            showToast(result.error?.message || 'Failed to create project', 'error');
        }
    } catch (error) {
        console.error('[App] Create project error:', error);
        showToast('Error creating project: ' + error.message, 'error');
    }
}

// ============================================================================
// LAUNCH PROJECT (Scout-4820, Jan 2026)
// ============================================================================

async function launchProject() {
    const name = document.getElementById('project-name').value.trim();
        const description = document.getElementById('project-description').value.trim();
            const ghRepo = document.getElementById('project-gh-repo').value.trim();
                const pmPersonality = document.getElementById('pm-personality').value;
                    
                        // Validate
                            if (!name) {
                                    showToast('Please enter a project name', 'error');
                                            return;
                                                }
                                                    
                                                        if (!state.instanceId) {
                                                                showToast('Not connected', 'error');
                                                                        return;
                                                                            }
                                                                                
                                                                                    // Prompt for API key
                                                                                        const apiKey = prompt('Enter API key for PM wake operations (or Cancel to go back):');
                                                                                            if (!apiKey) {
                                                                                                    return; // User cancelled
                                                                                                        }
                                                                                                            
                                                                                                                console.log('[Launch] Starting launch sequence for:', name);
                                                                                                                    
                                                                                                                        try {
                                                                                                                                // Step 1: Create the project
                                                                                                                                        console.log('[Launch] Step 1: Creating project...');
                                                                                                                                                const projectId = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
                                                                                                                                                        
                                                                                                                                                                const projectParams = {
                                                                                                                                                                            instanceId: state.instanceId,
                                                                                                                                                                                        projectId: projectId,
                                                                                                                                                                                                    name: name
                                                                                                                                                                                                            };
                                                                                                                                                                                                                    if (description) projectParams.description = description;
                                                                                                                                                                                                                            if (ghRepo) projectParams.ghRepo = ghRepo;
                                                                                                                                                                                                                                    
                                                                                                                                                                                                                                            const projectResult = await api.createProject(projectParams);
                                                                                                                                                                                                                                                    
                                                                                                                                                                                                                                                            if (!projectResult.success) {
                                                                                                                                                                                                                                                                        throw new Error(projectResult.error?.message || 'Failed to create project');
                                                                                                                                                                                                                                                                                }
                                                                                                                                                                                                                                                                                        console.log('[Launch] Project created:', projectResult);
                                                                                                                                                                                                                                                                                                
                                                                                                                                                                                                                                                                                                        // Step 2: Pre-approve the PM
                                                                                                                                                                                                                                                                                                                console.log('[Launch] Step 2: Pre-approving PM...');
                                                                                                                                                                                                                                                                                                                        const pmName = name.replace(/\s+/g, '') + '-PM';
                                                                                                                                                                                                                                                                                                                                
                                                                                                                                                                                                                                                                                                                                        const preApproveResult = await api.preApprove({
                                                                                                                                                                                                                                                                                                                                                    instanceId: state.instanceId,
                                                                                                                                                                                                                                                                                                                                                                name: pmName,
                                                                                                                                                                                                                                                                                                                                                                            role: 'PM',
                                                                                                                                                                                                                                                                                                                                                                                        personality: pmPersonality,
                                                                                                                                                                                                                                                                                                                                                                                                    project: projectId,
                                                                                                                                                                                                                                                                                                                                                                                                                apiKey: apiKey,
                                                                                                                                                                                                                                                                                                                                                                                                                            instructions: 'You are the PM for ' + name + '. Your first task is to wake a Lead Designer and collaborate on the system design.'
                                                                                                                                                                                                                                                                                                                                                                                                                                    });
                                                                                                                                                                                                                                                                                                                                                                                                                                            
                                                                                                                                                                                                                                                                                                                                                                                                                                                    if (!preApproveResult.success) {
                                                                                                                                                                                                                                                                                                                                                                                                                                                                throw new Error(preApproveResult.error?.message || 'Failed to pre-approve PM');
                                                                                                                                                                                                                                                                                                                                                                                                                                                                        }
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                console.log('[Launch] PM pre-approved:', preApproveResult);
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                const pmInstanceId = preApproveResult.newInstanceId;
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                // Step 3: Wake the PM
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        console.log('[Launch] Step 3: Waking PM...');
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                const wakeMessage = `Welcome! You are the PM for ${name}.

                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                Project brief: ${description || 'No description provided.'}

                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                Your first tasks:
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                1. Use pre_approve to create a Lead Designer instance (role: LeadDesigner, personality: Zara)
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                2. Use wake_instance to bring them online
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                3. Use continue_conversation to collaborate on the system design
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                4. Once design is complete, break it into sprints and build the team

                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                You have full PM role wisdom loaded. Check your role wisdom for the continue vs send_message distinction.`;
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                const wakeResult = await api.wakeInstance({
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            instanceId: state.instanceId,
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        targetInstanceId: pmInstanceId,
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    apiKey: apiKey,
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                message: wakeMessage
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        });
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        if (!wakeResult.success) {
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    throw new Error(wakeResult.error?.message || 'Failed to wake PM');
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            }
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    console.log('[Launch] PM woken successfully:', wakeResult);
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    // Success!
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            showToast('🚀 Project launched! PM ' + pmInstanceId + ' is now online.', 'success');
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    closeCreateProjectModal();
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    // Refresh projects list
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            const projectsResult = await api.listProjects();
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    if (projectsResult.projects) {
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                state.projects = projectsResult.projects;
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        }
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                if (state.currentTab === 'projects') {
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            loadProjects();
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    }
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                } catch (error) {
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        console.error('[Launch] Error:', error);
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                showToast('Launch failed: ' + error.message, 'error');
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    }
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    }

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
                    const taskResult = await api.listTasks(state.instanceId, { projectId: state.currentProjectDetail });
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
// LISTS (Personal Checklists)
// ============================================================================

/**
 * Load all lists for the current user
 */
async function loadLists() {
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

/**
 * Show list detail panel with items
 */
async function showListDetail(listId) {
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
function hideListDetail() {
    document.getElementById('list-detail-panel').style.display = 'none';
    document.getElementById('lists-grid').parentElement.style.display = 'flex';
    state.currentListId = null;
    state.currentList = null;
}

/**
 * Toggle a list item's completed state
 */
async function toggleListItem(itemId) {
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
 */
async function deleteListItem(itemId) {
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
async function addListItem() {
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

/**
 * Show create list modal
 */
function showCreateListModal() {
    document.getElementById('create-list-modal').classList.add('active');
    document.getElementById('list-name').value = '';
    document.getElementById('list-description').value = '';
    document.getElementById('list-name').focus();
}

function closeCreateListModal() {
    document.getElementById('create-list-modal').classList.remove('active');
}

/**
 * Create a new list
 */
async function createList() {
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
async function deleteCurrentList() {
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
async function renameCurrentList() {
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

// Make functions globally accessible
window.toggleListItem = toggleListItem;
window.deleteListItem = deleteListItem;

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
// ENTITY DETAILS (Instance, Role, Personality, Project)
// ============================================================================

/**
 * Show entity details modal for the current conversation target
 */
function showConversationTargetDetails() {
    if (!state.wakeConversationTarget) return;
    showEntityDetails('instance', state.wakeConversationTarget);
}

/**
 * Show entity details in the modal
 * @param {string} type - 'instance' | 'role' | 'personality' | 'project'
 * @param {string} id - The entity ID
 */
async function showEntityDetails(type, id) {
    const modal = document.getElementById('entity-details-modal');
    const title = document.getElementById('entity-details-title');
    const loading = document.querySelector('.entity-details-loading');

    // Hide all views
    document.querySelectorAll('.entity-view').forEach(v => v.style.display = 'none');
    loading.style.display = 'block';

    // Set title and show modal
    const typeNames = {
        instance: 'Instance Details',
        role: 'Role Details',
        personality: 'Personality Details',
        project: 'Project Details'
    };
    title.textContent = typeNames[type] || 'Details';
    modal.classList.add('active');

    try {
        switch (type) {
            case 'instance':
                await loadInstanceDetails(id);
                break;
            case 'role':
                await loadRoleDetails(id);
                break;
            case 'personality':
                await loadPersonalityDetails(id);
                break;
            case 'project':
                await loadProjectDetailsModal(id);
                break;
        }
    } catch (error) {
        console.error(`[App] Error loading ${type} details:`, error);
        showToast(`Could not load ${type} details: ${error.message}`, 'error');
    } finally {
        loading.style.display = 'none';
    }
}

/**
 * Load and display instance details
 */
async function loadInstanceDetails(instanceId) {
    const view = document.getElementById('instance-details-view');

    // First try to get from cached instances
    let instance = state.instances.find(i => i.instanceId === instanceId);

    // Try to fetch detailed info from API
    try {
        const result = await api.getInstanceDetails(state.instanceId, instanceId);
        if (result.success || result.instance) {
            instance = { ...instance, ...(result.instance || result.data?.instance || result) };

            // Handle preferences
            const prefs = result.preferences || result.data?.preferences || result.instance?.preferences;
            if (prefs) {
                document.getElementById('entity-instance-prefs').textContent = JSON.stringify(prefs, null, 2);
            }

            // Handle gestalt
            const gestalt = result.gestalt || result.data?.gestalt || result.instance?.gestalt;
            if (gestalt) {
                document.getElementById('entity-instance-gestalt').textContent = gestalt;
                document.getElementById('entity-instance-gestalt-section').style.display = 'block';
            } else {
                document.getElementById('entity-instance-gestalt-section').style.display = 'none';
            }
        }
    } catch (e) {
        console.log('[App] Could not fetch detailed instance info, using cached data:', e.message);
        document.getElementById('entity-instance-prefs').textContent = JSON.stringify(instance || {}, null, 2);
        document.getElementById('entity-instance-gestalt-section').style.display = 'none';
    }

    if (!instance) {
        instance = { instanceId };
    }

    // Populate fields
    document.getElementById('entity-instance-id').textContent = instance.instanceId || '-';
    document.getElementById('entity-instance-name').textContent = instance.name || '-';
    document.getElementById('entity-instance-role').textContent = instance.role || '-';
    document.getElementById('entity-instance-personality').textContent = instance.personality || '-';
    document.getElementById('entity-instance-home').textContent = instance.homeDirectory || instance.home || '-';
    document.getElementById('entity-instance-workdir').textContent = instance.workingDirectory || instance.workDir || '-';
    document.getElementById('entity-instance-session').textContent = instance.sessionId || '-';
    document.getElementById('entity-instance-status').textContent = instance.status || instance.wokenStatus || '-';
    document.getElementById('entity-instance-lastactive').textContent =
        instance.lastActiveAt ? new Date(instance.lastActiveAt).toLocaleString() : '-';
    document.getElementById('entity-instance-instructions').textContent = instance.instructions || '-';

    view.style.display = 'block';
}

/**
 * Load and display role details
 */
async function loadRoleDetails(roleId) {
    const view = document.getElementById('role-details-view');

    try {
        const result = await api.getRoleDetails(roleId);
        const role = result.role || result.data?.role || result;

        document.getElementById('entity-role-id').textContent = role.id || roleId;
        document.getElementById('entity-role-name').textContent = role.name || roleId;
        document.getElementById('entity-role-dir').textContent = role.directory || role.path || '-';
        document.getElementById('entity-role-description').textContent = role.description || '-';
        document.getElementById('entity-role-content').textContent = role.content || role.document || '-';
    } catch (e) {
        console.error('[App] Error loading role details:', e);
        document.getElementById('entity-role-id').textContent = roleId;
        document.getElementById('entity-role-name').textContent = roleId;
        document.getElementById('entity-role-dir').textContent = '-';
        document.getElementById('entity-role-description').textContent = 'Could not load role details';
        document.getElementById('entity-role-content').textContent = e.message;
    }

    view.style.display = 'block';
}

/**
 * Load and display personality details
 */
async function loadPersonalityDetails(personalityId) {
    const view = document.getElementById('personality-details-view');

    try {
        const result = await api.getPersonalityDetails(personalityId);
        const personality = result.personality || result.data?.personality || result;

        document.getElementById('entity-personality-id').textContent = personality.id || personalityId;
        document.getElementById('entity-personality-name').textContent = personality.name || personalityId;
        document.getElementById('entity-personality-dir').textContent = personality.directory || personality.path || '-';
        document.getElementById('entity-personality-description').textContent = personality.description || '-';
        document.getElementById('entity-personality-content').textContent = personality.content || personality.document || '-';
    } catch (e) {
        console.error('[App] Error loading personality details:', e);
        document.getElementById('entity-personality-id').textContent = personalityId;
        document.getElementById('entity-personality-name').textContent = personalityId;
        document.getElementById('entity-personality-dir').textContent = '-';
        document.getElementById('entity-personality-description').textContent = 'Could not load personality details';
        document.getElementById('entity-personality-content').textContent = e.message;
    }

    view.style.display = 'block';
}

/**
 * Load and display project details in modal
 */
async function loadProjectDetailsModal(projectId) {
    const view = document.getElementById('project-details-view-modal');

    try {
        const result = await api.getProject(projectId);
        const project = result.project || result.data?.project || result;

        document.getElementById('entity-project-id').textContent = project.id || project.projectId || projectId;
        document.getElementById('entity-project-name').textContent = project.name || projectId;
        document.getElementById('entity-project-status').textContent = project.status || '-';
        document.getElementById('entity-project-dir').textContent = project.directory || project.path || '-';
        document.getElementById('entity-project-description').textContent = project.description || '-';
        document.getElementById('entity-project-settings').textContent = JSON.stringify(project, null, 2);
    } catch (e) {
        console.error('[App] Error loading project details:', e);
        document.getElementById('entity-project-id').textContent = projectId;
        document.getElementById('entity-project-name').textContent = projectId;
        document.getElementById('entity-project-status').textContent = '-';
        document.getElementById('entity-project-dir').textContent = '-';
        document.getElementById('entity-project-description').textContent = 'Could not load project details';
        document.getElementById('entity-project-settings').textContent = e.message;
    }

    view.style.display = 'block';
}

// Make entity details functions globally accessible
window.showEntityDetails = showEntityDetails;

// ============================================================================
// MESSAGE POLLING
// ============================================================================

const POLLING_INTERVAL = 10000; // 10 seconds

function startMessagePolling() {
    if (state.messagePollingInterval) {
        return; // Already polling
    }

    console.log('[App] Starting message polling...');
    state.messagePollingInterval = setInterval(async () => {
        if (state.currentTab === 'messages' && state.instanceId) {
            await pollMessages();
        }
    }, POLLING_INTERVAL);
}

function stopMessagePolling() {
    if (state.messagePollingInterval) {
        console.log('[App] Stopping message polling');
        clearInterval(state.messagePollingInterval);
        state.messagePollingInterval = null;
    }
}

async function pollMessages() {
    try {
        // V2 XMPP API - get message headers from all rooms
        const result = await api.getMessages(state.instanceId, { limit: 20 });
        const newMessages = result.messages || [];

        // Count total new messages (V2 doesn't have read/unread tracking yet)
        const totalCount = result.total_available || newMessages.length;

        if (totalCount !== state.unreadCount) {
            state.unreadCount = totalCount;
            updateUnreadBadge();
        }

        // Store messages for quick access
        state.messages = newMessages;

        // If viewing a conversation, refresh it
        // BUT skip refresh if user is viewing message detail or composing a reply
        if (state.currentConversation && !state.viewingMessageDetail && !state.replyQuote) {
            await loadConversationMessages(state.conversationType, state.currentConversation);
        }

    } catch (error) {
        console.error('[App] Polling error:', error);
    }
}

function updateUnreadBadge() {
    const badge = document.getElementById('unread-count');
    if (badge) {
        if (state.unreadCount > 0) {
            badge.textContent = state.unreadCount > 99 ? '99+' : state.unreadCount;
            badge.style.display = 'inline-block';
        } else {
            badge.style.display = 'none';
        }
    }
}

// ============================================================================
// UTILITIES
// ============================================================================

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;

    container.appendChild(toast);

    setTimeout(() => {
        toast.remove();
    }, 4000);
}

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
