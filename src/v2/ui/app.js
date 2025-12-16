/**
 * V2 Coordination Dashboard Application
 *
 * Main application logic for the V2 executive dashboard.
 * Uses ES modules and the api.js isolation layer.
 *
 * @author Canvas (UI Engineer)
 */

import api, { setEnvironment, getEnvironment, ApiError } from './api.js';

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

    // UI State
    currentTab: 'messages',
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

    // Modal backdrop click
    document.querySelectorAll('.modal-backdrop').forEach(backdrop => {
        backdrop.addEventListener('click', () => {
            backdrop.closest('.modal').classList.remove('active');
        });
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

    // Create Project
    document.getElementById('new-project-btn')?.addEventListener('click', showCreateProjectModal);
    document.getElementById('create-project-submit')?.addEventListener('click', createProject);

    // Create Task
    document.getElementById('new-task-btn')?.addEventListener('click', showCreateTaskModal);
    document.getElementById('create-task-submit')?.addEventListener('click', createTask);

    // Wake Instance (placeholder)
    document.getElementById('wake-instance-btn')?.addEventListener('click', showWakeInstanceModal);

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
            // Pre-select the current project in the modal
            const projectSelect = document.getElementById('task-project');
            if (projectSelect) {
                projectSelect.value = state.currentProjectDetail;
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
        const projectsResult = await api.listProjects(state.instanceId);
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
            const result = await rpcCallDirect('get_tasks', {});
            const tasks = result.tasks || result || [];
            document.getElementById('metric-tasks').textContent = Array.isArray(tasks) ? tasks.length : '-';
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
 */
async function showProjectDetail(projectId) {
    const project = state.projects.find(p => (p.projectId || p.id) === projectId);
    if (!project) {
        showToast('Project not found', 'error');
        return;
    }

    console.log('[App] Showing project detail:', projectId);

    // Hide grid and header, show detail
    document.getElementById('project-grid').style.display = 'none';
    document.querySelector('#tab-projects .page-header').style.display = 'none';
    document.getElementById('project-detail-view').style.display = 'block';

    // Populate detail fields
    document.getElementById('project-detail-name').textContent = project.name;
    document.getElementById('project-detail-status').textContent = project.status;
    document.getElementById('project-detail-status').className = `project-status status-${project.status}`;
    document.getElementById('project-detail-description').textContent = project.description || 'No description';
    document.getElementById('project-detail-repo').textContent = project.ghRepo || project.repo || 'Not configured';

    // Store current project for actions
    state.currentProjectDetail = projectId;

    // Load project tasks
    try {
        const result = await rpcCallDirect('get_tasks', { project_id: projectId });
        const tasks = result.tasks || result || [];
        renderProjectDetailTasks(tasks);
    } catch (e) {
        console.error('[App] Error loading project tasks:', e);
        document.getElementById('project-detail-tasks').innerHTML = '<p class="empty-placeholder">Could not load tasks</p>';
    }

    // Load team members (if available)
    const teamContainer = document.getElementById('project-detail-team');
    if (project.team && project.team.length > 0) {
        teamContainer.innerHTML = project.team.map(member => `
            <div class="team-member">
                <span class="team-avatar">${(member.name || member).charAt(0).toUpperCase()}</span>
                <span>${escapeHtml(member.name || member)}</span>
            </div>
        `).join('');
    } else {
        teamContainer.innerHTML = '<p class="empty-placeholder">No team members assigned</p>';
    }
}

/**
 * Hide project detail, return to grid
 */
function hideProjectDetail() {
    document.getElementById('project-detail-view').style.display = 'none';
    document.getElementById('project-grid').style.display = 'grid';
    document.querySelector('#tab-projects .page-header').style.display = 'flex';
    state.currentProjectDetail = null;
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
        // Try to get tasks via get_tasks API
        let allTasks = [];

        // Get all tasks (no filter returns all)
        const result = await rpcCallDirect('get_tasks', {});
        if (result.tasks) {
            allTasks = result.tasks;
        } else if (Array.isArray(result)) {
            allTasks = result;
        }

        // Also try personal tasks
        try {
            const personalResult = await api.getMyTasks(state.instanceId);
            if (personalResult.personalTasks) {
                allTasks = [...allTasks, ...personalResult.personalTasks];
            }
            if (personalResult.projectTasks) {
                allTasks = [...allTasks, ...personalResult.projectTasks];
            }
        } catch (e) {
            console.log('[App] Could not load personal tasks:', e.message);
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

    // If not found, try to fetch from API
    if (!task) {
        try {
            const result = await rpcCallDirect('get_task', { id: taskId });
            task = result.task || result;
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
    document.getElementById('task-detail-created').textContent = task.createdAt ? new Date(task.createdAt).toLocaleString() : '-';

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
        // Return to project detail view
        switchTab('projects');
        // Ensure projects are loaded before showing detail
        if (!state.projects || state.projects.length === 0) {
            await loadProjects();
        }
        // Small delay to let tab switch complete, then show project detail
        setTimeout(() => showProjectDetail(state.currentProjectDetail), 50);
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
 * Claim the currently displayed task
 */
async function claimCurrentTask() {
    if (!state.currentTaskDetail || !state.instanceId) return;

    try {
        await rpcCallDirect('claim_task', {
            id: state.currentTaskDetail,
            instanceId: state.instanceId
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
        await rpcCallDirect('update_task', {
            id: state.currentTaskDetail,
            updates: { status: 'completed' }
        });
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
 */
async function saveTaskDescription() {
    const container = document.getElementById('task-desc-editable');
    const textarea = container?.querySelector('textarea');
    if (!textarea || !state.currentTaskDetail) return;

    const newDescription = textarea.value.trim();

    try {
        await rpcCallDirect('update_task', {
            id: state.currentTaskDetail,
            updates: { description: newDescription }
        });

        // Update local state
        const task = state.tasks.find(t => (t.taskId || t.id) === state.currentTaskDetail);
        if (task) {
            task.description = newDescription;
        }

        disableEditMode('task-desc-editable', 'task-detail-description', 'task-desc-save-btn', true);
        showToast('Description saved!', 'success');
    } catch (e) {
        console.error('[App] Error saving task description:', e);
        showToast('Could not save: ' + e.message, 'error');
    }
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

    if (state.instances.length === 0) {
        grid.innerHTML = '<div class="loading-placeholder">No instances found</div>';
        return;
    }

    grid.innerHTML = state.instances.map(instance => {
        const displayName = instance.name || instance.instanceId || 'Unknown';
        const avatarChar = displayName.charAt(0).toUpperCase();
        return `
        <div class="instance-card" data-instance-id="${instance.instanceId || ''}">
            <div class="instance-header">
                <div class="instance-avatar">${avatarChar}</div>
                <div>
                    <div class="instance-name">${escapeHtml(displayName)}</div>
                    <div class="instance-id">${escapeHtml(instance.instanceId || '')}</div>
                </div>
            </div>
            <div class="instance-details">
                <div class="instance-detail">
                    <span>Role</span>`;
    }).map((html, i) => {
        const instance = state.instances[i];
        return html + `
                    <span>${instance.role || 'None'}</span>
                </div>
                <div class="instance-detail">
                    <span>Project</span>
                    <span>${instance.project || 'None'}</span>
                </div>
                <div class="instance-detail">
                    <span>Status</span>
                    <span>${instance.status || 'Unknown'}</span>
                </div>
            </div>
        </div>`;
    }).join('');
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
            const isSent = msg.from?.toLowerCase() === state.name?.toLowerCase() ||
                           msg.from?.toLowerCase() === 'lupo';
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
    const body = input.value.trim();

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

        // Use first part of message as subject for better display
        const subject = body.length > 50 ? body.substring(0, 50) + '...' : body;
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
                <div>${escapeHtml(body)}</div>
                <div class="message-meta">${new Date().toLocaleTimeString()}</div>
            </div>
        `;

        // Scroll to bottom
        container.scrollTop = container.scrollHeight;

        // Clear input
        input.value = '';
        input.style.height = 'auto';

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
            const projectsResult = await api.listProjects(state.instanceId);
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
// CREATE TASK
// ============================================================================

function showCreateTaskModal(prefilledProject = null) {
    // Populate project dropdown
    const projectSelect = document.getElementById('task-project');
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
        let result;

        if (projectId) {
            // Project task - use create_task API with required fields
            const taskId = `task-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`;
            result = await rpcCallDirect('create_task', {
                id: taskId,
                title: title,
                description: description || 'No description',
                project_id: projectId,
                priority: priority
            });
        } else {
            // Personal task - use addPersonalTask
            result = await api.addPersonalTask({
                instanceId: state.instanceId,
                title: title,
                description: description || undefined,
                priority: priority
            });
        }

        if (result.success !== false && !result.error) {
            showToast(`Task "${title}" created!`, 'success');
            closeCreateTaskModal();

            // Refresh tasks view
            if (state.currentTab === 'tasks') {
                loadTasks();
            }

            // Also refresh project detail if we're viewing a project and the task was for it
            if (state.currentTab === 'projects' && state.currentProjectDetail && projectId === state.currentProjectDetail) {
                // Refresh the project detail tasks list
                try {
                    const result = await rpcCallDirect('get_tasks', { project_id: projectId });
                    const tasks = result.tasks || result || [];
                    renderProjectDetailTasks(tasks);
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
    const url = 'https://smoothcurves.nexus/mcp/dev/mcp';
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

    try {
        await api.toggleListItem(state.instanceId, state.currentListId, itemId);
        // Refresh the list to show updated state
        await showListDetail(state.currentListId);
    } catch (error) {
        console.error('[App] Error toggling item:', error);
        showToast('Could not update item: ' + error.message, 'error');
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
        // Refresh the list
        await showListDetail(state.currentListId);
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
        // Refresh the list
        await showListDetail(state.currentListId);
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
// WAKE INSTANCE (Placeholder)
// ============================================================================

function showWakeInstanceModal() {
    document.getElementById('wake-instance-modal').classList.add('active');
    showToast('Wake Instance feature coming soon! API not yet implemented.', 'info');
}

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
