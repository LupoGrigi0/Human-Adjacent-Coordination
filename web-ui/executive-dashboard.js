/**
 * Executive Dashboard - MCP Coordination System
 * Mobile-First Executive Interface for Task Management and Project Oversight
 * 
 * @author claude-code-WebUISpecialist-Executive-Dashboard-20250906
 */

// Configuration - Dynamic host detection for cross-platform access
const CONFIG = {
    // Dynamic SSE Server endpoint (adapts to current host)
    SSE_SERVER_URL: `https://${window.location.hostname}:3444/mcp`,

    // Production MCP server (streamable HTTP)
    HTTP_SERVER_URL: `https://${window.location.hostname}/mcp`,
    
    // Update intervals
    REFRESH_INTERVAL: 30000, // 30 seconds
    CONNECTION_CHECK_INTERVAL: 5000, // 5 seconds
    
    // Executive instance ID for message routing
    EXECUTIVE_INSTANCE_ID: 'Lupo',
    
    // SSL handling for self-signed certificates
    SSL_IGNORE_ERRORS: true
};

// Global state
const state = {
    connected: false,
    serverType: null, // 'sse' or 'http'
    projects: [],
    tasks: [],
    messages: [],
    instances: [],
    filters: {
        tasks: 'all',
        projects: 'all'
    },
    bootstrap: null
};

// Initialize dashboard
document.addEventListener('DOMContentLoaded', () => {
    console.log('🚀 Executive Dashboard - Initializing...');
    console.log(`🌐 Network Config - SSE: ${CONFIG.SSE_SERVER_URL}`);
    console.log(`🌐 Network Config - HTTP: ${CONFIG.HTTP_SERVER_URL}`);
    console.log(`📱 Host detected: ${window.location.hostname}`);
    initializeTheme();
    initializeDashboard();
    initializeProjectTaskSearch();
});

/**
 * Initialize theme system
 */
function initializeTheme() {
    // Load saved theme or default to light
    const savedTheme = localStorage.getItem('dashboard-theme') || 'light';
    applyTheme(savedTheme);

    // Setup theme toggle button
    const themeToggle = document.getElementById('theme-toggle');
    if (themeToggle) {
        themeToggle.addEventListener('click', toggleTheme);
        updateThemeIcon(savedTheme);
    }
}

/**
 * Apply theme to document
 */
function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('dashboard-theme', theme);
    updateThemeIcon(theme);
}

/**
 * Toggle between light and dark themes
 */
function toggleTheme() {
    const currentTheme = document.documentElement.getAttribute('data-theme') || 'light';
    const newTheme = currentTheme === 'light' ? 'dark' : 'light';
    applyTheme(newTheme);

    // Add animation effect
    const toggle = document.getElementById('theme-toggle');
    if (toggle) {
        toggle.style.transform = 'scale(0.9)';
        setTimeout(() => {
            toggle.style.transform = 'scale(1)';
        }, 150);
    }
}

/**
 * Update theme toggle icon
 */
function updateThemeIcon(theme) {
    const themeIcon = document.querySelector('.theme-icon');
    if (themeIcon) {
        themeIcon.textContent = theme === 'light' ? '🌙' : '☀️';
    }
}

/**
 * Initialize the dashboard
 */
async function initializeDashboard() {
    try {
        setupEventHandlers();
        await connectToMCPSystem();
        await loadDashboardData();
        startPeriodicUpdates();
        
        showSuccessMessage('Executive Dashboard loaded successfully');
    } catch (error) {
        console.error('Dashboard initialization failed:', error);
        showErrorMessage('Failed to initialize dashboard: ' + error.message);
    }
}

/**
 * Setup event handlers
 */
function setupEventHandlers() {
    // Tab navigation
    document.querySelectorAll('.nav-tab').forEach(tab => {
        tab.addEventListener('click', () => switchTab(tab.dataset.tab));
    });
    
    // Filter chips
    document.querySelectorAll('.filter-chip').forEach(chip => {
        chip.addEventListener('click', () => handleFilterChange(chip));
    });
    
    // Search inputs
    const taskSearch = document.getElementById('task-search');
    const projectSearch = document.getElementById('project-search');
    
    if (taskSearch) {
        taskSearch.addEventListener('input', debounce(() => filterTasks(), 300));
    }
    
    if (projectSearch) {
        projectSearch.addEventListener('input', debounce(() => filterProjects(), 300));
    }
}

/**
 * Connect to MCP System (try SSE first, fallback to HTTP)
 */
async function connectToMCPSystem() {
    updateConnectionStatus('Connecting...', false);
    
    try {
        // Try SSE server first
        console.log('Attempting SSE connection...');
        await testSSEConnection();
        state.serverType = 'sse';
        await bootstrapExecutive();
        updateConnectionStatus('Connected (SSE)', true);
        return;
        
    } catch (sseError) {
        console.log('SSE connection failed, trying HTTP fallback:', sseError.message);
        
        try {
            // Fallback to HTTP server
            await testHTTPConnection();
            state.serverType = 'http';
            await bootstrapExecutive();
            updateConnectionStatus('Connected (HTTP)', true);
            return;
            
        } catch (httpError) {
            console.error('Both connection attempts failed:', httpError);
            throw new Error(`Connection failed: SSE (${sseError.message}) | HTTP (${httpError.message})`);
        }
    }
}

/**
 * Test SSE server connection
 */
async function testSSEConnection() {
    const healthUrl = CONFIG.SSE_SERVER_URL.replace('/mcp', '/health');
    console.log(`🔍 Testing SSE connection to: ${healthUrl}`);
    
    const response = await fetch(healthUrl, {
        method: 'GET',
        headers: {
            'Accept': 'application/json'
        }
    });
    
    if (!response.ok) {
        throw new Error(`SSE server returned ${response.status}`);
    }
    
    const health = await response.json();
    console.log('✅ SSE server health:', health);
    return health;
}

/**
 * Test HTTP server connection
 */
async function testHTTPConnection() {
    const response = await fetch(CONFIG.HTTP_SERVER_URL.replace('/mcp', '/health'), {
        method: 'GET',
        headers: {
            'Accept': 'application/json'
        }
    });
    
    if (!response.ok) {
        throw new Error(`HTTP server returned ${response.status}`);
    }
    
    const health = await response.json();
    console.log('HTTP server health:', health);
    return health;
}

/**
 * Bootstrap executive role in MCP system
 */
async function bootstrapExecutive() {
    try {
        const bootstrapData = await mcpCall('bootstrap', {
            role: 'Executive',
            instanceId: CONFIG.EXECUTIVE_INSTANCE_ID
        });
        
        state.bootstrap = bootstrapData;
        console.log('Executive bootstrap successful:', bootstrapData);
        
        return bootstrapData;
        
    } catch (error) {
        console.warn('Bootstrap failed, continuing without:', error.message);
        return null;
    }
}

/**
 * Make MCP function call
 */
async function mcpCall(functionName, params = {}) {
    const url = state.serverType === 'sse' ? CONFIG.SSE_SERVER_URL : CONFIG.HTTP_SERVER_URL;
    
    // Different payload formats for SSE vs HTTP production server
    let requestData;
    if (state.serverType === 'sse') {
        // JSON-RPC 2.0 format for SSE server
        requestData = {
            jsonrpc: '2.0',
            method: 'tools/call',
            params: {
                name: functionName,
                arguments: params
            },
            id: Date.now()
        };
    } else {
        // Production server uses JSON-RPC 2.0 format too (streamable HTTP)
        requestData = {
            jsonrpc: '2.0',
            method: 'tools/call',
            params: {
                name: functionName,
                arguments: params
            },
            id: Date.now()
        };
    }
    
    console.log(`📞 MCP Call [${state.serverType.toUpperCase()}]: ${functionName}`, params);
    console.log(`📞 Request Payload:`, requestData);
    
    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
        },
        body: JSON.stringify(requestData),
        mode: 'cors'
    });
    
    if (!response.ok) {
        const errorText = await response.text();
        console.error(`HTTP Error ${response.status}:`, errorText);
        throw new Error(`MCP call failed: ${response.status} ${response.statusText}`);
    }
    
    const result = await response.json();
    console.log(`✅ MCP Response [${state.serverType.toUpperCase()}]:`, result);
    
    // Handle different response formats
    if (result.error) {
        throw new Error(result.error.message || result.error || 'MCP call failed');
    }

    // Handle MCP response format - both SSE and HTTP use the same structure
    if (result.result && result.result.content && Array.isArray(result.result.content)) {
        const textContent = result.result.content.find(item => item.type === 'text');
        if (textContent?.text) {
            try {
                return JSON.parse(textContent.text);
            } catch (e) {
                console.warn('Failed to parse MCP response JSON:', e, textContent.text);
                return result.result;
            }
        }
    }

    // Return the result as-is if no content parsing needed
    return result.result || result;
}

/**
 * Load all dashboard data
 */
async function loadDashboardData() {
    try {
        console.log('📊 Loading dashboard data...');
        
        // Load in parallel for better performance
        const [projects, tasks, messages] = await Promise.allSettled([
            loadProjects(),
            loadTasks(),
            loadMessages()
        ]);
        
        // Handle any failures gracefully
        if (projects.status === 'rejected') {
            console.error('Failed to load projects:', projects.reason);
        }
        if (tasks.status === 'rejected') {
            console.error('Failed to load tasks:', tasks.reason);
        }
        if (messages.status === 'rejected') {
            console.error('Failed to load messages:', messages.reason);
        }
        
        updateDashboardOverview();
        renderCurrentView();
        
    } catch (error) {
        console.error('Failed to load dashboard data:', error);
        showErrorMessage('Failed to load dashboard data: ' + error.message);
    }
}

/**
 * Load projects from MCP
 */
async function loadProjects() {
    try {
        const result = await mcpCall('get_projects');
        console.log('Parsed projects response:', result);
        
        // Extract projects from parsed response
        const projects = result.projects || [];
        state.projects = Array.isArray(projects) ? projects : [];
        
        console.log(`📁 Loaded ${state.projects.length} projects`);
        return state.projects;
        
    } catch (error) {
        console.error('Failed to load projects:', error);
        state.projects = [];
        throw error;
    }
}

/**
 * Load tasks from MCP
 */
async function loadTasks() {
    try {
        // Get all tasks
        const result = await mcpCall('get_tasks');
        console.log('Parsed tasks response:', result);
        
        // Extract tasks from parsed response
        const tasks = result.tasks || [];
        state.tasks = Array.isArray(tasks) ? tasks : [];
        
        console.log(`✅ Loaded ${state.tasks.length} tasks`);
        return state.tasks;
        
    } catch (error) {
        console.error('Failed to load tasks:', error);
        state.tasks = [];
        throw error;
    }
}

/**
 * Load messages from MCP
 */
async function loadMessages() {
    try {
        const result = await mcpCall('get_messages', {
            instanceId: CONFIG.EXECUTIVE_INSTANCE_ID,
            limit: 20
        });
        console.log('Parsed messages response:', result);
        
        // Extract messages from parsed response
        const messages = result.messages || [];
        state.messages = Array.isArray(messages) ? messages : [];
        
        console.log(`📨 Loaded ${state.messages.length} messages`);
        return state.messages;
        
    } catch (error) {
        console.error('Failed to load messages:', error);
        state.messages = [];
        throw error;
    }
}

/**
 * Update dashboard overview metrics
 */
function updateDashboardOverview() {
    const activeProjects = state.projects.filter(p => p.status === 'active').length;
    const pendingTasks = state.tasks.filter(t => t.status === 'pending').length;
    const unreadMessages = state.messages.filter(m => !m.read).length;
    
    document.getElementById('total-projects').textContent = state.projects.length;
    document.getElementById('pending-tasks').textContent = pendingTasks;
    document.getElementById('active-instances').textContent = state.instances.length;
    document.getElementById('unread-messages').textContent = unreadMessages;
}

/**
 * Update connection status display
 */
function updateConnectionStatus(text, connected) {
    const dot = document.getElementById('connection-dot');
    const status = document.getElementById('connection-status');
    
    dot.className = `status-dot ${connected ? 'connected' : ''}`;
    status.textContent = text;
    state.connected = connected;
}

/**
 * Switch tabs
 */
function switchTab(tabName) {
    // Update tab buttons
    document.querySelectorAll('.nav-tab').forEach(tab => {
        tab.classList.toggle('active', tab.dataset.tab === tabName);
    });
    
    // Update tab content
    document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.toggle('active', content.id === tabName);
    });
    
    // Load tab-specific data if needed
    renderCurrentView();
}

/**
 * Render current view
 */
function renderCurrentView() {
    const activeTab = document.querySelector('.tab-content.active');
    if (!activeTab) return;
    
    switch (activeTab.id) {
        case 'dashboard':
            renderPriorityTasks();
            break;
        case 'tasks':
            renderAllTasks();
            break;
        case 'projects':
            renderProjects();
            break;
        case 'messages':
            renderMessages();
            break;
    }
}

/**
 * Render priority tasks for dashboard
 */
function renderPriorityTasks() {
    const container = document.getElementById('priority-tasks');
    
    // Get high priority tasks and tasks assigned to executive
    const priorityTasks = state.tasks.filter(task => 
        task.priority === 'critical' || 
        task.priority === 'high' || 
        task.assigned_to === CONFIG.EXECUTIVE_INSTANCE_ID ||
        task.status === 'in-progress'
    ).slice(0, 10); // Limit to 10 most important
    
    if (priorityTasks.length === 0) {
        container.innerHTML = '<p class="card-subtitle">No priority tasks at this time.</p>';
        return;
    }
    
    container.innerHTML = priorityTasks.map(task => renderTaskItem(task)).join('');
}

/**
 * Render all tasks
 */
function renderAllTasks() {
    const container = document.getElementById('all-tasks');
    let filteredTasks = [...state.tasks];
    
    // Apply filters
    if (state.filters.tasks !== 'all') {
        filteredTasks = filteredTasks.filter(task => {
            switch (state.filters.tasks) {
                case 'pending':
                    return task.status === 'pending';
                case 'in-progress':
                    return task.status === 'in-progress';
                case 'critical':
                    return task.priority === 'critical';
                case 'high':
                    return task.priority === 'high';
                default:
                    return true;
            }
        });
    }
    
    // Apply search
    const searchTerm = document.getElementById('task-search')?.value?.toLowerCase();
    if (searchTerm) {
        filteredTasks = filteredTasks.filter(task =>
            task.title.toLowerCase().includes(searchTerm) ||
            task.description?.toLowerCase().includes(searchTerm)
        );
    }
    
    if (filteredTasks.length === 0) {
        container.innerHTML = '<p class="card-subtitle">No tasks found.</p>';
        return;
    }
    
    container.innerHTML = filteredTasks.map(task => renderTaskItem(task)).join('');
}

/**
 * Render task item
 */
function renderTaskItem(task) {
    const isCompleted = task.status === 'completed';
    const priorityClass = `priority-${task.priority || 'medium'}`;
    
    return `
        <div class="task-item" data-task-id="${task.id}">
            <div class="task-checkbox ${isCompleted ? 'completed' : ''}" 
                 onclick="toggleTaskStatus('${task.id}', '${task.status}')">
            </div>
            <div class="task-content">
                <div class="task-title">${escapeHtml(task.title)}</div>
                <div class="task-meta">
                    <span class="priority-badge ${priorityClass}">${task.priority || 'medium'}</span>
                    ${task.project_id ? `• Project: ${task.project_id}` : ''}
                    ${task.assigned_to ? `• Assigned: ${task.assigned_to}` : ''}
                </div>
            </div>
        </div>
    `;
}

/**
 * Render projects
 */
function renderProjects() {
    const container = document.getElementById('projects-grid');
    let filteredProjects = [...state.projects];
    
    // Apply filters
    if (state.filters.projects !== 'all') {
        filteredProjects = filteredProjects.filter(project => {
            switch (state.filters.projects) {
                case 'active':
                    return project.status === 'active';
                case 'high':
                    return project.priority === 'high';
                case 'completed':
                    return project.status === 'completed';
                default:
                    return true;
            }
        });
    }
    
    // Apply search
    const searchTerm = document.getElementById('project-search')?.value?.toLowerCase();
    if (searchTerm) {
        filteredProjects = filteredProjects.filter(project =>
            project.name.toLowerCase().includes(searchTerm) ||
            project.description?.toLowerCase().includes(searchTerm)
        );
    }
    
    if (filteredProjects.length === 0) {
        container.innerHTML = '<p class="card-subtitle">No projects found.</p>';
        return;
    }
    
    container.innerHTML = filteredProjects.map(project => renderProjectCard(project)).join('');
}

/**
 * Render project card
 */
function renderProjectCard(project) {
    const statusClass = `status-${project.status || 'active'}`;
    const priorityClass = `priority-${project.priority || 'medium'}`;
    
    // Count tasks in this project
    const projectTasks = state.tasks.filter(t => t.project_id === project.id);
    const completedTasks = projectTasks.filter(t => t.status === 'completed').length;
    
    return `
        <div class="project-card" data-project-id="${project.id}">
            <div class="project-status ${statusClass}">
                ${project.status || 'active'}
            </div>
            <h3 class="project-title">${escapeHtml(project.name)}</h3>
            <p class="project-description">${escapeHtml(project.description || '')}</p>
            <div class="project-meta">
                <div class="priority-badge ${priorityClass}">${project.priority || 'medium'} priority</div>
                <div style="margin-top: 0.5rem; font-size: 0.75rem; color: var(--text-secondary);">
                    ${completedTasks}/${projectTasks.length} tasks completed
                </div>
            </div>
            <div class="project-actions" style="margin-top: 1rem; display: flex; gap: 0.5rem; flex-wrap: wrap;">
                <button class="btn-secondary" style="padding: 0.4rem 0.8rem; font-size: 0.8rem;" 
                        onclick="event.stopPropagation(); ExecutiveDashboard.showProjectTasks('${project.id}', '${escapeHtml(project.name)}')">
                    📋 Tasks${projectTasks.length > 0 ? ` (${projectTasks.length})` : ''}
                </button>
                ${project.status !== 'completed' ? `
                    <button class="btn" style="padding: 0.4rem 0.8rem; font-size: 0.8rem;" 
                            onclick="event.stopPropagation(); showCreateTaskForProject('${project.id}')">
                        ➕ Task
                    </button>
                ` : ''}
                <button class="btn-secondary" style="padding: 0.4rem 0.8rem; font-size: 0.8rem;" 
                        onclick="event.stopPropagation(); ExecutiveDashboard.showProjectEditor('${project.id}')">
                    ✏️ Edit
                </button>
            </div>
        </div>
    `;
}

/**
 * Render messages
 */
function renderMessages() {
    const container = document.getElementById('messages-list');
    
    if (state.messages.length === 0) {
        container.innerHTML = '<p class="card-subtitle">No messages found.</p>';
        return;
    }
    
    container.innerHTML = state.messages.map(message => renderMessage(message)).join('');
}

/**
 * Render message item
 */
function renderMessage(message) {
    const date = new Date(message.timestamp || message.created).toLocaleString();
    
    return `
        <div class="message-item">
            <div class="message-header">
                <div class="message-from">${escapeHtml(message.from || 'System')}</div>
                <div class="message-time">${date}</div>
            </div>
            <div class="message-subject">${escapeHtml(message.subject || 'No Subject')}</div>
            <div class="message-content">${escapeHtml(message.content || message.message || '')}</div>
        </div>
    `;
}

/**
 * Handle filter changes
 */
function handleFilterChange(chip) {
    const parent = chip.parentElement;
    const filterType = parent.parentElement.querySelector('.search-input').id.includes('task') ? 'tasks' : 'projects';
    
    // Update active state
    parent.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
    chip.classList.add('active');
    
    // Update state
    state.filters[filterType] = chip.dataset.filter;
    
    // Re-render
    renderCurrentView();
}

/**
 * Toggle task status
 */
async function toggleTaskStatus(taskId, currentStatus) {
    try {
        const newStatus = currentStatus === 'completed' ? 'pending' : 'completed';
        
        await mcpCall('update_task', {
            id: taskId,
            updates: { status: newStatus }
        });
        
        // Update local state
        const task = state.tasks.find(t => t.id === taskId);
        if (task) {
            task.status = newStatus;
        }
        
        // Re-render
        renderCurrentView();
        updateDashboardOverview();
        
        showSuccessMessage(`Task marked as ${newStatus}`);
        
    } catch (error) {
        console.error('Failed to update task:', error);
        showErrorMessage('Failed to update task: ' + error.message);
    }
}

/**
 * Start periodic updates
 */
function startPeriodicUpdates() {
    // Check connection every 5 seconds
    setInterval(async () => {
        try {
            if (state.serverType === 'sse') {
                await testSSEConnection();
            } else {
                await testHTTPConnection();
            }
            
            if (!state.connected) {
                updateConnectionStatus(`Connected (${state.serverType.toUpperCase()})`, true);
            }
        } catch (error) {
            updateConnectionStatus('Disconnected', false);
        }
    }, CONFIG.CONNECTION_CHECK_INTERVAL);
    
    // Refresh data every 30 seconds
    setInterval(() => {
        if (state.connected) {
            loadDashboardData().catch(console.error);
        }
    }, CONFIG.REFRESH_INTERVAL);
}

/**
 * Quick Actions & Modal Management
 */
function showCreateTask() {
    populateTaskProjectOptions();
    document.getElementById('taskModal').style.display = 'block';
}

function showCreateProject() {
    // Project creation functionality - for future implementation
    showSuccessMessage('Project creation will be available in next update!');
}

function showSendMessage() {
    populateInstanceOptions();
    document.getElementById('messageModal').style.display = 'block';
}

/**
 * Modal Functions
 */
function closeMessageModal() {
    document.getElementById('messageModal').style.display = 'none';
    clearMessageForm();
}

function closeTaskModal() {
    document.getElementById('taskModal').style.display = 'none';
    clearTaskForm();
}

function clearMessageForm() {
    document.getElementById('messageRecipient').value = '';
    document.getElementById('messageSubject').value = '';
    document.getElementById('messageContent').value = '';
    document.getElementById('messagePriority').value = 'normal';
}

function clearTaskForm() {
    document.getElementById('taskTitle').value = '';
    document.getElementById('taskDescription').value = '';
    document.getElementById('taskProject').value = '';
    document.getElementById('taskPriority').value = 'medium';
    document.getElementById('taskEffort').value = '';
}

/**
 * Populate modal options
 */
async function populateInstanceOptions() {
    try {
        const result = await mcpCall('get_instances');
        const instances = result.instances || [];
        
        const instanceOptions = document.getElementById('instanceOptions');
        instanceOptions.innerHTML = ''; // Clear existing options
        
        instances.forEach(instance => {
            if (instance.id !== CONFIG.EXECUTIVE_INSTANCE_ID) {
                const option = document.createElement('option');
                option.value = instance.id;
                option.textContent = `${instance.id} (${instance.role})`;
                instanceOptions.appendChild(option);
            }
        });
    } catch (error) {
        console.error('Failed to load instances:', error);
    }
}

function populateTaskProjectOptions() {
    const projectSelect = document.getElementById('taskProject');
    projectSelect.innerHTML = '<option value="">General Task (No Project)</option>';
    
    state.projects.forEach(project => {
        const option = document.createElement('option');
        option.value = project.id;
        option.textContent = project.name;
        projectSelect.appendChild(option);
    });
}

/**
 * Send Message
 */
async function sendMessage() {
    const recipient = document.getElementById('messageRecipient').value;
    const subject = document.getElementById('messageSubject').value;
    const content = document.getElementById('messageContent').value;
    const priority = document.getElementById('messagePriority').value;
    
    if (!recipient || !subject || !content) {
        showErrorMessage('Please fill in all required fields');
        return;
    }
    
    try {
        await mcpCall('send_message', {
            to: recipient,
            from: CONFIG.EXECUTIVE_INSTANCE_ID,
            subject: subject,
            content: content,
            priority: priority
        });
        
        showSuccessMessage(`Message sent to ${recipient}`);
        closeMessageModal();
        
        // Refresh messages to show the sent message
        await loadMessages();
        if (document.querySelector('#messages.active')) {
            renderMessages();
        }
        
    } catch (error) {
        console.error('Failed to send message:', error);
        showErrorMessage('Failed to send message: ' + error.message);
    }
}

/**
 * Create Task
 */
async function createTask() {
    const title = document.getElementById('taskTitle').value;
    const description = document.getElementById('taskDescription').value;
    const projectId = document.getElementById('taskProject').value;
    const priority = document.getElementById('taskPriority').value;
    const effort = document.getElementById('taskEffort').value;
    
    if (!title || !description) {
        showErrorMessage('Please enter both title and description');
        return;
    }
    
    try {
        const taskId = 'task-' + Date.now(); // Simple ID generation
        
        await mcpCall('create_task', {
            id: taskId,
            title: title,
            description: description,
            project_id: projectId || undefined,
            priority: priority,
            estimated_effort: effort || undefined
        });
        
        showSuccessMessage(`Task "${title}" created successfully`);
        closeTaskModal();
        
        // Refresh tasks to show the new task
        await loadTasks();
        updateDashboardOverview();
        renderCurrentView();
        
    } catch (error) {
        console.error('Failed to create task:', error);
        showErrorMessage('Failed to create task: ' + error.message);
    }
}

function selectProject(projectId) {
    console.log('Selected project:', projectId);
    // TODO: Show project details or navigate to project view
}

function refreshMessages() {
    loadMessages().then(() => {
        renderMessages();
        showSuccessMessage('Messages refreshed');
    }).catch(error => {
        showErrorMessage('Failed to refresh messages: ' + error.message);
    });
}

/**
 * Utility Functions
 */
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function showSuccessMessage(message) {
    showMessage(message, 'success');
}

function showErrorMessage(message) {
    showMessage(message, 'error');
}

function showMessage(message, type) {
    // Create and show temporary message
    const messageDiv = document.createElement('div');
    messageDiv.className = `${type}-message`;
    messageDiv.textContent = message;
    messageDiv.style.position = 'fixed';
    messageDiv.style.top = '80px';
    messageDiv.style.left = '50%';
    messageDiv.style.transform = 'translateX(-50%)';
    messageDiv.style.zIndex = '1000';
    messageDiv.style.maxWidth = '90%';
    messageDiv.style.boxShadow = 'var(--shadow-lg)';
    
    document.body.appendChild(messageDiv);
    
    setTimeout(() => {
        document.body.removeChild(messageDiv);
    }, 5000);
}

function filterTasks() {
    renderAllTasks();
}

function filterProjects() {
    renderProjects();
}

// Close modals when clicking outside
document.addEventListener('click', function(event) {
    const messageModal = document.getElementById('messageModal');
    const taskModal = document.getElementById('taskModal');
    
    if (event.target === messageModal) {
        closeMessageModal();
    }
    if (event.target === taskModal) {
        closeTaskModal();
    }
});

// Close modals with Escape key
document.addEventListener('keydown', function(event) {
    if (event.key === 'Escape') {
        closeMessageModal();
        closeTaskModal();
    }
});

// Export for global access
/**
 * Project Task View and Filtering Functions
 */

// Global variable to track current project tasks
let currentProjectTasks = [];
let currentProjectId = null;
let projectTaskFilters = {
    status: 'all',
    priority: 'all',
    search: ''
};

/**
 * Show project tasks in a modal
 */
async function showProjectTasks(projectId, projectName) {
    try {
        currentProjectId = projectId;
        
        // Update modal title
        document.getElementById('projectTaskTitle').textContent = `Tasks: ${projectName}`;
        
        // Show loading
        const tasksList = document.getElementById('project-tasks-list');
        tasksList.innerHTML = '<div class="loading"><div class="spinner"></div>Loading project tasks...</div>';
        
        // Show modal
        document.getElementById('projectTaskModal').style.display = 'block';
        
        // Reset filters
        projectTaskFilters = { status: 'all', priority: 'all', search: '' };
        updateProjectTaskFilterUI();
        
        // Load project tasks
        await loadProjectTasks(projectId);
        
    } catch (error) {
        console.error('Failed to show project tasks:', error);
        alert('Failed to load project tasks. Please try again.');
    }
}

/**
 * Load tasks for a specific project
 */
async function loadProjectTasks(projectId) {
    try {
        const result = await mcpCall('get_tasks', { project_id: projectId });
        const tasks = result.tasks || [];
        
        currentProjectTasks = tasks;
        renderProjectTasks();
        updateProjectTaskStats();
        
    } catch (error) {
        console.error('Failed to load project tasks:', error);
        const tasksList = document.getElementById('project-tasks-list');
        tasksList.innerHTML = '<div class="error">Failed to load tasks. Please refresh and try again.</div>';
    }
}

/**
 * Render project tasks with current filters applied
 */
function renderProjectTasks() {
    const filteredTasks = getFilteredProjectTasks();
    const tasksList = document.getElementById('project-tasks-list');
    
    if (filteredTasks.length === 0) {
        tasksList.innerHTML = '<div class="empty-state">No tasks found matching current filters.</div>';
        return;
    }
    
    const tasksHtml = filteredTasks.map(task => `
        <div class="task-item" data-task-id="${task.id}">
            <div class="task-checkbox ${task.status === 'completed' ? 'completed' : ''}" 
                 onclick="ExecutiveDashboard.toggleTaskStatus('${task.id}', '${task.status}')">
            </div>
            <div class="task-content">
                <div class="task-title">${escapeHtml(task.title)}</div>
                <div class="task-meta">
                    <span class="priority-badge priority-${task.priority || 'medium'}">${task.priority || 'medium'}</span>
                    <span class="status-badge status-${task.status}">${task.status}</span>
                    ${task.assignee ? `<span class="assignee">@${task.assignee}</span>` : ''}
                    ${task.created ? `<span class="date">${formatDate(task.created)}</span>` : ''}
                </div>
                ${task.description ? `<div class="task-description">${escapeHtml(task.description)}</div>` : ''}
            </div>
        </div>
    `).join('');
    
    tasksList.innerHTML = tasksHtml;
}

/**
 * Get filtered project tasks
 */
function getFilteredProjectTasks() {
    let filtered = [...currentProjectTasks];
    
    // Status filter
    if (projectTaskFilters.status !== 'all') {
        filtered = filtered.filter(task => task.status === projectTaskFilters.status);
    }
    
    // Priority filter  
    if (projectTaskFilters.priority !== 'all') {
        filtered = filtered.filter(task => task.priority === projectTaskFilters.priority);
    }
    
    // Search filter
    if (projectTaskFilters.search) {
        const searchLower = projectTaskFilters.search.toLowerCase();
        filtered = filtered.filter(task => 
            task.title.toLowerCase().includes(searchLower) ||
            (task.description && task.description.toLowerCase().includes(searchLower)) ||
            (task.assignee && task.assignee.toLowerCase().includes(searchLower))
        );
    }
    
    return filtered;
}

/**
 * Update project task statistics
 */
function updateProjectTaskStats() {
    const tasks = currentProjectTasks;
    const stats = {
        total: tasks.length,
        pending: tasks.filter(t => t.status === 'pending').length,
        in_progress: tasks.filter(t => t.status === 'in_progress').length,
        completed: tasks.filter(t => t.status === 'completed').length
    };
    
    document.getElementById('project-total-tasks').textContent = `Total: ${stats.total}`;
    document.getElementById('project-pending-tasks').textContent = `Pending: ${stats.pending}`;
    document.getElementById('project-progress-tasks').textContent = `In Progress: ${stats.in_progress}`;
    document.getElementById('project-completed-tasks').textContent = `Completed: ${stats.completed}`;
}

/**
 * Filter project tasks by status
 */
function filterProjectTasks(status) {
    projectTaskFilters.status = status;
    updateProjectTaskFilterUI();
    renderProjectTasks();
}

/**
 * Filter project tasks by priority
 */
function filterProjectTasksByPriority(priority) {
    projectTaskFilters.priority = priority;
    updateProjectTaskFilterUI();
    renderProjectTasks();
}

/**
 * Update filter UI to reflect current state
 */
function updateProjectTaskFilterUI() {
    // Update status filter chips
    document.querySelectorAll('#projectTaskModal .filter-chip[data-filter]').forEach(chip => {
        const filter = chip.getAttribute('data-filter');
        chip.classList.toggle('active', filter === projectTaskFilters.status);
    });
    
    // Update priority filter chips
    document.querySelectorAll('#projectTaskModal .filter-chip[data-priority]').forEach(chip => {
        const priority = chip.getAttribute('data-priority');
        chip.classList.toggle('active', priority === projectTaskFilters.priority);
    });
    
    // Update search input
    const searchInput = document.getElementById('project-task-search');
    if (searchInput) {
        searchInput.value = projectTaskFilters.search;
    }
}

/**
 * Close project task modal
 */
function closeProjectTaskModal() {
    document.getElementById('projectTaskModal').style.display = 'none';
    currentProjectId = null;
    currentProjectTasks = [];
}

/**
 * Show create task modal for a specific project (called from project card)
 */
function showCreateTaskForProject(projectId) {
    // Show create task modal
    showCreateTask();
    
    // Pre-select the project
    setTimeout(() => {
        const projectSelect = document.getElementById('taskProject');
        if (projectSelect && projectId) {
            projectSelect.value = projectId;
        }
    }, 100);
}

/**
 * Show create task modal pre-filled for current project (called from project task modal)
 */
function showCreateTaskForCurrentProject() {
    if (!currentProjectId) {
        alert('No project selected');
        return;
    }
    
    // Close project task modal first
    closeProjectTaskModal();
    
    // Show create task modal
    showCreateTask();
    
    // Pre-select the project
    setTimeout(() => {
        const projectSelect = document.getElementById('taskProject');
        if (projectSelect) {
            projectSelect.value = currentProjectId;
        }
    }, 100);
}

/**
 * Toggle task status (for quick completion)
 */
async function toggleTaskStatus(taskId, currentStatus) {
    try {
        const newStatus = currentStatus === 'completed' ? 'pending' : 'completed';
        
        await mcpCall('update_task', {
            id: taskId,
            updates: { status: newStatus }
        });
        
        // Refresh project tasks
        if (currentProjectId) {
            await loadProjectTasks(currentProjectId);
        }
        
        // Also refresh main dashboard
        await loadTasks();
        updateDashboardOverview();
        
    } catch (error) {
        console.error('Failed to toggle task status:', error);
        alert('Failed to update task status. Please try again.');
    }
}

/**
 * Initialize project task search listener
 */
function initializeProjectTaskSearch() {
    // Add search functionality when DOM is ready
    setTimeout(() => {
        const searchInput = document.getElementById('project-task-search');
        if (searchInput) {
            searchInput.addEventListener('input', handleProjectTaskSearch);
        }
    }, 100);
}

/**
 * Handle project task search input
 */
function handleProjectTaskSearch(event) {
    projectTaskFilters.search = event.target.value;
    renderProjectTasks();
}

/**
 * Project Editor Functions
 */

// Current project being edited
let currentEditingProject = null;

/**
 * Show project editor modal
 */
async function showProjectEditor(projectId) {
    try {
        // Find the project
        const project = state.projects.find(p => p.id === projectId);
        if (!project) {
            alert('Project not found');
            return;
        }
        
        currentEditingProject = project;
        
        // Populate form fields
        document.getElementById('editProjectName').value = project.name || '';
        document.getElementById('editProjectDescription').value = project.description || '';
        document.getElementById('editProjectStatus').value = project.status || 'active';
        document.getElementById('editProjectPriority').value = project.priority || 'medium';
        document.getElementById('editProjectAssignee').value = project.assignee || '';
        
        // Update modal title
        document.getElementById('projectEditTitle').textContent = `Edit: ${project.name}`;
        
        // Calculate and display project statistics
        updateProjectEditStats(projectId);
        
        // Populate assignee dropdown
        await populateProjectAssigneeOptions();
        
        // Show modal
        document.getElementById('projectEditModal').style.display = 'block';
        
    } catch (error) {
        console.error('Failed to show project editor:', error);
        alert('Failed to open project editor. Please try again.');
    }
}

/**
 * Update project statistics in edit modal
 */
function updateProjectEditStats(projectId) {
    const projectTasks = state.tasks.filter(t => t.project_id === projectId);
    const stats = {
        total: projectTasks.length,
        pending: projectTasks.filter(t => t.status === 'pending').length,
        in_progress: projectTasks.filter(t => t.status === 'in_progress').length,
        completed: projectTasks.filter(t => t.status === 'completed').length
    };
    
    document.getElementById('editProjectTotalTasks').textContent = `Tasks: ${stats.total}`;
    document.getElementById('editProjectPendingTasks').textContent = `Pending: ${stats.pending}`;
    document.getElementById('editProjectInProgressTasks').textContent = `In Progress: ${stats.in_progress}`;
    document.getElementById('editProjectCompletedTasks').textContent = `Completed: ${stats.completed}`;
}

/**
 * Populate assignee dropdown in project editor
 */
async function populateProjectAssigneeOptions() {
    try {
        const result = await mcpCall('get_instances');
        const instances = result.instances || [];
        
        const assigneeSelect = document.getElementById('editProjectAssignee');
        
        // Keep unassigned option
        assigneeSelect.innerHTML = '<option value="">Unassigned</option>';
        
        // Add instance options
        instances.forEach(instance => {
            const option = document.createElement('option');
            option.value = instance.id;
            option.textContent = `${instance.id} (${instance.role})`;
            assigneeSelect.appendChild(option);
        });
        
        // Set current assignee if exists
        if (currentEditingProject && currentEditingProject.assignee) {
            assigneeSelect.value = currentEditingProject.assignee;
        }
        
    } catch (error) {
        console.error('Failed to load assignee options:', error);
    }
}

/**
 * Save project changes
 */
async function saveProjectChanges() {
    try {
        if (!currentEditingProject) {
            alert('No project selected for editing');
            return;
        }
        
        // Get form values
        const updates = {
            name: document.getElementById('editProjectName').value.trim(),
            description: document.getElementById('editProjectDescription').value.trim(),
            status: document.getElementById('editProjectStatus').value,
            priority: document.getElementById('editProjectPriority').value,
            assignee: document.getElementById('editProjectAssignee').value || null
        };
        
        // Validate required fields
        if (!updates.name) {
            alert('Project name is required');
            document.getElementById('editProjectName').focus();
            return;
        }
        
        // Call update API
        await mcpCall('update_project', {
            id: currentEditingProject.id,
            updates: updates
        });
        
        // Close modal
        closeProjectEditModal();
        
        // Refresh projects
        await loadProjects();
        renderProjects();
        updateDashboardOverview();
        
        // Show success message
        alert('Project updated successfully!');
        
    } catch (error) {
        console.error('Failed to save project changes:', error);
        alert('Failed to save project changes. Please try again.');
    }
}

/**
 * Close project editor modal
 */
function closeProjectEditModal() {
    document.getElementById('projectEditModal').style.display = 'none';
    currentEditingProject = null;
}

window.ExecutiveDashboard = {
    state,
    loadDashboardData,
    mcpCall,
    showCreateTask,
    showCreateProject,
    showSendMessage,
    refreshMessages,
    closeMessageModal,
    closeTaskModal,
    showProjectTasks,
    closeProjectTaskModal,
    filterProjectTasks,
    filterProjectTasksByPriority,
    showCreateTaskForProject,
    showCreateTaskForCurrentProject,
    toggleTaskStatus,
    showProjectEditor,
    closeProjectEditModal,
    saveProjectChanges
};