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
    EXECUTIVE_INSTANCE_ID: 'aria-ui-dev',
    
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
        tasks: 'my-tasks',
        projects: 'all'
    },
    bootstrap: null
};

// Enhanced logging system
const LOG_LEVELS = {
    DEBUG: 0,
    INFO: 1,
    WARN: 2,
    ERROR: 3
};

let currentLogLevel = LOG_LEVELS.DEBUG;
const logs = [];

function log(level, message, data = null) {
    if (level < currentLogLevel) return;

    const timestamp = new Date().toISOString();
    const levelNames = ['DEBUG', 'INFO', 'WARN', 'ERROR'];
    const logEntry = {
        timestamp,
        level: levelNames[level],
        message,
        data
    };

    logs.push(logEntry);

    // Console output with colors
    const colors = ['color: #666', 'color: #0066ff', 'color: #ff9900', 'color: #ff0000'];
    console.log(`%c[${timestamp}] ${levelNames[level]}: ${message}`, colors[level], data || '');

    // Store in localStorage for debugging
    try {
        localStorage.setItem('dashboard-debug-logs', JSON.stringify(logs.slice(-50))); // Keep last 50 entries
    } catch (e) {
        // localStorage might be full, ignore
    }

    // Keep only last 100 logs
    if (logs.length > 100) {
        logs.shift();
    }
}

/**
 * Download logs as a file for debugging
 */
function downloadLogs() {
    const logsData = {
        timestamp: new Date().toISOString(),
        instance: 'aria-ui-dev',
        total_entries: logs.length,
        logs: logs
    };

    const dataStr = JSON.stringify(logsData, null, 2);
    const dataBlob = new Blob([dataStr], {type: 'application/json'});
    const url = URL.createObjectURL(dataBlob);

    const link = document.createElement('a');
    link.href = url;
    link.download = `dashboard-logs-${new Date().toISOString().slice(0,19).replace(/:/g,'-')}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    logInfo('🗄️ Debug logs downloaded', { entries: logs.length });
}

/**
 * Create debug panel for live log viewing
 */
function createDebugPanel() {
    // Add a debug button to the header
    const header = document.querySelector('.header .header-actions');
    if (header && !document.getElementById('debug-panel-btn')) {
        const debugBtn = document.createElement('button');
        debugBtn.id = 'debug-panel-btn';
        debugBtn.className = 'btn-secondary';
        debugBtn.innerHTML = '🔍 Debug';
        debugBtn.style.cssText = 'margin-left: 10px; font-size: 0.9rem;';
        debugBtn.onclick = toggleDebugPanel;
        header.appendChild(debugBtn);
    }
}

function toggleDebugPanel() {
    let panel = document.getElementById('debug-panel');
    if (!panel) {
        panel = document.createElement('div');
        panel.id = 'debug-panel';
        panel.style.cssText = `
            position: fixed;
            top: 80px;
            right: 20px;
            width: 400px;
            height: 300px;
            background: var(--background-color);
            border: 2px solid var(--border-color);
            border-radius: 8px;
            padding: 15px;
            z-index: 1000;
            overflow-y: auto;
            box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        `;

        panel.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                <h3 style="margin: 0; color: var(--text-color);">Debug Logs</h3>
                <div>
                    <button onclick="downloadLogs()" class="btn-secondary" style="margin-right: 5px; font-size: 0.8rem;">📥 Download</button>
                    <button onclick="toggleDebugPanel()" class="btn-secondary" style="font-size: 0.8rem;">✖️</button>
                </div>
            </div>
            <div id="debug-log-content" style="font-family: monospace; font-size: 0.75rem; color: var(--text-color); line-height: 1.2;"></div>
        `;

        document.body.appendChild(panel);
        updateDebugPanel();
    } else {
        panel.remove();
    }
}

function updateDebugPanel() {
    const content = document.getElementById('debug-log-content');
    if (content) {
        const recentLogs = logs.slice(-20); // Show last 20 entries
        content.innerHTML = recentLogs.map(entry =>
            `<div style="margin-bottom: 5px; padding: 3px; border-left: 3px solid ${
                entry.level === 'ERROR' ? '#ff0000' :
                entry.level === 'WARN' ? '#ff9900' :
                entry.level === 'INFO' ? '#0066ff' : '#666'
            }; padding-left: 8px;">
                <div><strong>[${entry.timestamp.slice(11,19)}] ${entry.level}:</strong> ${entry.message}</div>
                ${entry.data ? `<div style="color: #888; font-size: 0.7rem;">${JSON.stringify(entry.data).slice(0,100)}${JSON.stringify(entry.data).length > 100 ? '...' : ''}</div>` : ''}
            </div>`
        ).join('');

        // Auto-scroll to bottom
        content.scrollTop = content.scrollHeight;
    }
}

function logDebug(message, data) { log(LOG_LEVELS.DEBUG, message, data); }
function logInfo(message, data) { log(LOG_LEVELS.INFO, message, data); }
function logWarn(message, data) { log(LOG_LEVELS.WARN, message, data); }
function logError(message, data) { log(LOG_LEVELS.ERROR, message, data); }

// Export logs function for debugging
window.getDashboardLogs = () => logs;
window.clearDashboardLogs = () => logs.length = 0;
window.downloadLogs = () => {
    const blob = new Blob([JSON.stringify(logs, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `dashboard-logs-${new Date().toISOString()}.json`;
    a.click();
    URL.revokeObjectURL(url);
};

// Utility function for date formatting
function formatDate(dateString) {
    if (!dateString) return '';
    try {
        const date = new Date(dateString);
        return date.toLocaleString();
    } catch (error) {
        logWarn('Invalid date format', { dateString, error });
        return dateString;
    }
}

// Initialize dashboard
document.addEventListener('DOMContentLoaded', () => {
    logInfo('🚀 Executive Dashboard - Starting initialization');
    logInfo(`🌐 Network Config - SSE: ${CONFIG.SSE_SERVER_URL}`);
    logInfo(`🌐 Network Config - HTTP: ${CONFIG.HTTP_SERVER_URL}`);
    logInfo(`📱 Host detected: ${window.location.hostname}`);
    logInfo(`🔧 Current URL: ${window.location.href}`);
    logInfo(`📊 User agent: ${navigator.userAgent}`);

    try {
        initializeTheme();
        logInfo('✅ Theme system initialized');

        loadUserIdentity();
        logInfo('✅ User identity loaded');

        initializeDashboard();
        logInfo('✅ Dashboard initialization started');

        initializeProjectTaskSearch();
        logInfo('✅ Search system initialized');

    } catch (error) {
        logError('❌ Critical initialization error', error);
    }
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
        createDebugPanel(); // Add debug panel button

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
    logInfo('🔌 Starting MCP connection process');
    updateConnectionStatus('Connecting...', false);

    try {
        // Try SSE server first
        logInfo('🔄 Attempting SSE connection...', { url: CONFIG.SSE_SERVER_URL });
        await testSSEConnection();
        state.serverType = 'sse';
        logInfo('✅ SSE connection successful');

        await bootstrapExecutive();
        updateConnectionStatus('Connected (SSE)', true);
        logInfo('🚀 MCP system connected via SSE');
        return;

    } catch (sseError) {
        logWarn('⚠️ SSE connection failed, trying HTTP fallback', sseError);

        try {
            // Fallback to HTTP server
            logInfo('🔄 Attempting HTTP connection...', { url: CONFIG.HTTP_SERVER_URL });
            await testHTTPConnection();
            state.serverType = 'http';
            logInfo('✅ HTTP connection successful');

            await bootstrapExecutive();
            updateConnectionStatus('Connected (HTTP)', true);
            logInfo('🚀 MCP system connected via HTTP');
            return;

        } catch (httpError) {
            logError('❌ Both connection attempts failed', {
                sseError: sseError.message,
                httpError: httpError.message
            });
            updateConnectionStatus('Connection Failed', false);
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
    
    logInfo(`📞 MCP Call [${state.serverType.toUpperCase()}]: ${functionName}`, { params, url });
    logDebug(`📞 Request Payload:`, requestData);

    // Special detailed logging for send_message
    if (functionName === 'send_message') {
        logInfo('🔍 DETAILED MESSAGE DEBUG:', {
            function: functionName,
            serverType: state.serverType,
            endpoint: url,
            payload: JSON.stringify(requestData, null, 2)
        });
    }
    
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
    logInfo(`✅ MCP Response [${state.serverType.toUpperCase()}]:`, result);

    // Special detailed logging for send_message responses
    if (functionName === 'send_message') {
        logInfo('📩 DETAILED MESSAGE RESPONSE:', {
            httpStatus: response.status,
            httpStatusText: response.statusText,
            responseBody: JSON.stringify(result, null, 2),
            hasError: !!result.error,
            errorMessage: result.error?.message || result.error,
            success: !result.error
        });
    }
    
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
        const [projects, tasks, messages, systemStatus] = await Promise.allSettled([
            loadProjects(),
            loadTasks(),
            loadMessages(),
            loadSystemStatus()
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
        if (systemStatus.status === 'rejected') {
            console.error('Failed to load system status:', systemStatus.reason);
        }

        updateDashboardOverview();
        renderCurrentView();

        // Auto-register if no identity is saved
        if (!currentUser.isRegistered) {
            logInfo('🔄 Attempting auto-registration after connection established');
            attemptAutoRegistration();
        }

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
        logInfo('🔍 Loading messages for multiple sources...');

        // Load messages for current instance
        const instanceResult = await mcpCall('get_messages', {
            instanceId: CONFIG.EXECUTIVE_INSTANCE_ID,
            limit: 20
        });

        // Load messages sent to ALL
        const allResult = await mcpCall('get_messages', {
            instanceId: 'ALL',
            limit: 20
        });

        console.log('Parsed instance messages response:', instanceResult);
        console.log('Parsed ALL messages response:', allResult);

        // Combine messages from both sources
        const instanceMessages = instanceResult.messages || [];
        const allMessages = allResult.messages || [];

        // Merge and deduplicate by message ID
        const allMessagesMap = new Map();
        [...instanceMessages, ...allMessages].forEach(msg => {
            if (msg && msg.id) {
                allMessagesMap.set(msg.id, msg);
            }
        });

        // Convert back to array and sort by creation date (newest first)
        state.messages = Array.from(allMessagesMap.values()).sort((a, b) =>
            new Date(b.created || b.timestamp) - new Date(a.created || a.timestamp)
        );

        logInfo(`📨 Loaded ${instanceMessages.length} instance messages + ${allMessages.length} ALL messages = ${state.messages.length} total`);
        return state.messages;

    } catch (error) {
        logError('Failed to load messages', error);
        state.messages = [];
        throw error;
    }
}

/**
 * Update dashboard overview metrics
 */
function updateDashboardOverview() {
    const pendingTasks = state.tasks.filter(t => t.status === 'pending').length;
    const unreadMessages = state.messages.filter(m => m.status === 'unread').length;
    
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
    
    // Get tasks relevant to current user (My Tasks focus)
    const relevantTasks = state.tasks.filter(task =>
        // Primary: tasks assigned to current user
        task.assigned_to === currentUser.instanceId ||
        // Secondary: high priority unassigned tasks (available to claim)
        (task.assigned_to === null && (task.priority === 'critical' || task.priority === 'high'))
    ).slice(0, 10); // Limit to 10 most important
    
    if (relevantTasks.length === 0) {
        container.innerHTML = '<p class="card-subtitle">No tasks assigned to you. Check the Tasks tab to claim available work!</p>';
        return;
    }

    container.innerHTML = relevantTasks.map(task => renderTaskItem(task)).join('');
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
                case 'my-tasks':
                    // Show tasks assigned to current user
                    return task.assigned_to === currentUser.instanceId;
                case 'pending':
                    return task.status === 'pending';
                case 'in-progress':
                    return task.status === 'in-progress';
                case 'completed':
                    return task.status === 'completed';
                case 'active':
                    return task.status !== 'completed';
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
        const message = state.filters.tasks === 'my-tasks'
            ? 'No tasks assigned to you yet. Switch to "All" to see available tasks to claim!'
            : 'No tasks found.';
        container.innerHTML = `<p class="card-subtitle">${message}</p>`;
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
            <div class="task-content" onclick="showTaskDetail('${task.id}')">
                <div class="task-title"
                     ondblclick="event.stopPropagation(); toggleTitleEdit('${task.id}', '${escapeHtml(task.title).replace(/'/g, '\\\'')}')"
                     id="title-${task.id}">${escapeHtml(task.title)}</div>
                <div class="task-meta">
                    <span class="priority-badge ${priorityClass}"
                          onclick="event.stopPropagation(); togglePriorityEdit('${task.id}', '${task.priority || 'medium'}')"
                          data-task-id="${task.id}"
                          id="priority-${task.id}">${task.priority || 'medium'}</span>
                    ${task.project_id ? `• Project: ${task.project_id}` : ''}
                    ${task.assigned_to ? `• Assigned: ${task.assigned_to}` : ''}
                    ${getTaskCreatedInfo(task)}
                </div>
            </div>
        </div>
    `;
}

/**
 * Toggle priority inline editing
 */
function togglePriorityEdit(taskId, currentPriority) {
    const priorityElement = document.getElementById(`priority-${taskId}`);
    if (!priorityElement) return;

    // Check if already editing
    const existingSelect = document.querySelector(`#priority-select-${taskId}`);
    if (existingSelect) {
        return; // Already editing
    }

    // Create dropdown
    const select = document.createElement('select');
    select.id = `priority-select-${taskId}`;
    select.className = 'priority-select-inline';
    select.style.cssText = `
        font-size: 0.75rem;
        padding: 2px 4px;
        border-radius: 4px;
        border: 1px solid var(--border-color);
        background: var(--background-color);
        min-width: 80px;
        cursor: pointer;
    `;

    // Add options
    const priorities = [
        { value: 'low', label: 'Low' },
        { value: 'medium', label: 'Medium' },
        { value: 'high', label: 'High' },
        { value: 'critical', label: 'Critical' }
    ];

    priorities.forEach(priority => {
        const option = document.createElement('option');
        option.value = priority.value;
        option.textContent = priority.label;
        if (priority.value === currentPriority) {
            option.selected = true;
        }
        select.appendChild(option);
    });

    // Handle selection change
    select.addEventListener('change', async function() {
        const newPriority = this.value;
        await updateTaskPriority(taskId, newPriority);
        restorePriorityBadge(taskId, newPriority);
    });

    // Handle click outside to cancel
    select.addEventListener('blur', function() {
        restorePriorityBadge(taskId, currentPriority);
    });

    // Handle escape key
    select.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') {
            restorePriorityBadge(taskId, currentPriority);
        }
    });

    // Replace badge with dropdown
    priorityElement.style.display = 'none';
    priorityElement.parentNode.insertBefore(select, priorityElement);
    select.focus();
}

function restorePriorityBadge(taskId, priority) {
    const priorityElement = document.getElementById(`priority-${taskId}`);
    const selectElement = document.getElementById(`priority-select-${taskId}`);

    if (selectElement) {
        selectElement.remove();
    }

    if (priorityElement) {
        // Update the badge content and class
        priorityElement.textContent = priority;
        priorityElement.className = `priority-badge priority-${priority}`;
        priorityElement.style.display = '';
    }
}

async function updateTaskPriority(taskId, newPriority) {
    try {
        logInfo('Updating task priority', { taskId, newPriority });

        const result = await mcpCall('update_task', {
            id: taskId,
            updates: { priority: newPriority }
        });

        if (result && result.success !== false) {
            // Update local state
            const task = state.tasks.find(t => t.id === taskId);
            if (task) {
                task.priority = newPriority;
            }

            showSuccessMessage(`Task priority updated to ${newPriority}`);

            // Refresh current view to reflect changes
            renderCurrentView();
            updateDashboardOverview();
        } else {
            showErrorMessage('Failed to update task priority: ' + (result?.error?.message || 'Unknown error'));
        }

    } catch (error) {
        logError('Error updating task priority', error);
        showErrorMessage('Error updating task priority: ' + error.message);
    }
}

/**
 * Toggle title inline editing
 */
function toggleTitleEdit(taskId, currentTitle) {
    const titleElement = document.getElementById(`title-${taskId}`);
    if (!titleElement) return;

    // Check if already editing
    const existingInput = document.querySelector(`#title-input-${taskId}`);
    if (existingInput) {
        return; // Already editing
    }

    // Create input field
    const input = document.createElement('input');
    input.id = `title-input-${taskId}`;
    input.type = 'text';
    input.value = currentTitle;
    input.style.cssText = `
        font-size: inherit;
        font-weight: inherit;
        padding: 2px 4px;
        border: 1px solid var(--primary-color);
        border-radius: 4px;
        background: var(--background-color);
        color: var(--text-color);
        width: 100%;
        margin: -2px -4px;
        box-sizing: border-box;
    `;

    // Handle Enter key to save
    input.addEventListener('keydown', function(e) {
        if (e.key === 'Enter') {
            e.preventDefault();
            const newTitle = this.value.trim();
            if (newTitle && newTitle !== currentTitle) {
                updateTaskTitle(taskId, newTitle);
                restoreTaskTitle(taskId, newTitle);
            } else {
                restoreTaskTitle(taskId, currentTitle);
            }
        } else if (e.key === 'Escape') {
            e.preventDefault();
            restoreTaskTitle(taskId, currentTitle);
        }
    });

    // Handle blur to save/cancel
    input.addEventListener('blur', function() {
        const newTitle = this.value.trim();
        if (newTitle && newTitle !== currentTitle) {
            updateTaskTitle(taskId, newTitle);
            restoreTaskTitle(taskId, newTitle);
        } else {
            restoreTaskTitle(taskId, currentTitle);
        }
    });

    // Replace title with input
    titleElement.style.display = 'none';
    titleElement.parentNode.insertBefore(input, titleElement);
    input.focus();
    input.select();
}

function restoreTaskTitle(taskId, title) {
    const titleElement = document.getElementById(`title-${taskId}`);
    const inputElement = document.getElementById(`title-input-${taskId}`);

    if (inputElement) {
        inputElement.remove();
    }

    if (titleElement) {
        titleElement.textContent = title;
        titleElement.style.display = '';
    }
}

async function updateTaskTitle(taskId, newTitle) {
    try {
        logInfo('Updating task title', { taskId, newTitle });

        const result = await mcpCall('update_task', {
            id: taskId,
            updates: { title: newTitle }
        });

        if (result && result.success !== false) {
            // Update local state
            const task = state.tasks.find(t => t.id === taskId);
            if (task) {
                task.title = newTitle;
            }

            showSuccessMessage('Task title updated successfully');

            // Refresh current view to reflect changes
            renderCurrentView();
            updateDashboardOverview();
        } else {
            showErrorMessage('Failed to update task title: ' + (result?.error?.message || 'Unknown error'));
        }

    } catch (error) {
        logError('Error updating task title', error);
        showErrorMessage('Error updating task title: ' + error.message);
    }
}

/**
 * Toggle project description inline editing
 */
function toggleProjectDescriptionEdit(projectId, currentDescription) {
    const descElement = document.getElementById(`description-${projectId}`);
    if (!descElement) return;

    // Check if already editing
    const existingTextarea = document.querySelector(`#description-textarea-${projectId}`);
    if (existingTextarea) {
        return; // Already editing
    }

    // Create textarea for multi-line editing
    const textarea = document.createElement('textarea');
    textarea.id = `description-textarea-${projectId}`;
    textarea.value = currentDescription || '';
    textarea.placeholder = 'Enter project description...';
    textarea.style.cssText = `
        font-size: inherit;
        font-family: inherit;
        padding: 8px;
        border: 1px solid var(--primary-color);
        border-radius: 4px;
        background: var(--background-color);
        color: var(--text-color);
        width: 100%;
        min-height: 60px;
        resize: vertical;
        margin: -4px 0;
        box-sizing: border-box;
    `;

    // Handle keyboard shortcuts
    textarea.addEventListener('keydown', function(e) {
        if (e.key === 'Enter' && e.ctrlKey) {
            // Ctrl+Enter to save
            e.preventDefault();
            const newDescription = this.value.trim();
            updateProjectDescription(projectId, newDescription);
            restoreProjectDescription(projectId, newDescription);
        } else if (e.key === 'Escape') {
            e.preventDefault();
            restoreProjectDescription(projectId, currentDescription);
        }
    });

    // Handle blur to save
    textarea.addEventListener('blur', function() {
        const newDescription = this.value.trim();
        if (newDescription !== currentDescription) {
            updateProjectDescription(projectId, newDescription);
        }
        restoreProjectDescription(projectId, newDescription || currentDescription);
    });

    // Replace description with textarea
    descElement.style.display = 'none';
    descElement.parentNode.insertBefore(textarea, descElement);
    textarea.focus();
    textarea.select();
}

function restoreProjectDescription(projectId, description) {
    const descElement = document.getElementById(`description-${projectId}`);
    const textareaElement = document.getElementById(`description-textarea-${projectId}`);

    if (textareaElement) {
        textareaElement.remove();
    }

    if (descElement) {
        descElement.textContent = description || 'Click to add description...';
        descElement.style.display = '';
    }
}

async function updateProjectDescription(projectId, newDescription) {
    try {
        logInfo('Updating project description', { projectId, newDescription });

        const result = await mcpCall('update_project', {
            id: projectId,
            updates: { description: newDescription }
        });

        if (result && result.success !== false) {
            // Update local state
            const project = state.projects.find(p => p.id === projectId);
            if (project) {
                project.description = newDescription;
            }

            showSuccessMessage('Project description updated successfully');

            // Refresh current view to reflect changes
            renderCurrentView();
            updateDashboardOverview();
        } else {
            showErrorMessage('Failed to update project description: ' + (result?.error?.message || 'Unknown error'));
        }

    } catch (error) {
        logError('Error updating project description', error);
        showErrorMessage('Error updating project description: ' + error.message);
    }
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
            <p class="project-description"
               ondblclick="event.stopPropagation(); toggleProjectDescriptionEdit('${project.id}', '${escapeHtml(project.description || '').replace(/'/g, '\\\'')}')"
               id="description-${project.id}">${escapeHtml(project.description || 'Click to add description...')}</p>
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
    const isUnread = message.status === 'unread';
    const priorityClass = `priority-${message.priority || 'normal'}`;

    // Truncate content for preview
    const content = message.body || message.content || message.message || '';
    const preview = content.length > 100 ? content.substring(0, 100) + '...' : content;

    return `
        <div class="message-item ${isUnread ? 'unread' : 'read'}"
             onclick="showMessageDetail('${message.id}')"
             style="cursor: pointer; transition: all 0.2s; ${isUnread ? 'font-weight: bold; border-left: 4px solid var(--primary-color);' : ''}"
             onmouseover="this.style.background='var(--background-secondary)'"
             onmouseout="this.style.background='var(--background-color)'">
            <div class="message-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                <div class="message-from" style="font-weight: ${isUnread ? 'bold' : 'normal'};">
                    ${isUnread ? '🔵 ' : ''}${escapeHtml(message.from || 'System')}
                </div>
                <div style="display: flex; align-items: center; gap: 10px; font-size: 0.8rem; color: var(--text-secondary);">
                    <span class="priority-badge ${priorityClass}" style="font-size: 0.7rem; padding: 2px 6px;">
                        ${message.priority || 'normal'}
                    </span>
                    <div class="message-time">${date}</div>
                </div>
            </div>
            <div class="message-subject" style="font-weight: ${isUnread ? 'bold' : 'normal'}; margin-bottom: 5px; color: var(--text-color);">
                ${escapeHtml(message.subject || 'No Subject')}
            </div>
            <div class="message-content" style="color: var(--text-secondary); font-size: 0.9rem; line-height: 1.4;">
                ${escapeHtml(preview)}
            </div>
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
/**
 * Toggle custom recipient input visibility
 */
function toggleCustomRecipient() {
    const select = document.getElementById('messageRecipient');
    const customGroup = document.getElementById('customRecipientGroup');

    if (select.value === 'custom') {
        customGroup.style.display = 'block';
        document.getElementById('customRecipient').focus();
    } else {
        customGroup.style.display = 'none';
        document.getElementById('customRecipient').value = '';
    }
}

async function sendMessage() {
    let recipient = document.getElementById('messageRecipient').value;
    const subject = document.getElementById('messageSubject').value;
    const content = document.getElementById('messageContent').value;
    const priority = document.getElementById('messagePriority').value;

    // Handle custom recipient
    if (recipient === 'custom') {
        const customRecipient = document.getElementById('customRecipient').value.trim();
        if (!customRecipient) {
            showErrorMessage('Please enter a custom recipient name');
            return;
        }
        recipient = customRecipient;
    }

    if (!recipient || !subject || !content) {
        showErrorMessage('Please fill in all required fields');
        return;
    }

    logInfo('🚀 ATTEMPTING TO SEND MESSAGE', {
        to: recipient,
        from: CONFIG.EXECUTIVE_INSTANCE_ID,
        subject,
        content: content.substring(0, 50) + '...',
        priority,
        actualInstanceId: 'aria-ui-dev'
    });

    try {
        const messagePayload = {
            to: recipient,
            from: CONFIG.EXECUTIVE_INSTANCE_ID,
            subject: subject,
            content: content,
            priority: priority
        };

        logInfo('📤 Message payload being sent to MCP:', messagePayload);

        const result = await mcpCall('send_message', messagePayload);

        logInfo('📨 Send message MCP result:', result);

        if (result && result.success !== false) {
            showSuccessMessage(`✅ Message sent successfully to ${recipient}!`);
            logInfo('✅ Message confirmed sent successfully');
        } else {
            logError('❌ Send message failed - server returned error:', result);
            showErrorMessage('Failed to send message: ' + (result?.error?.message || result?.message || 'Unknown server error'));
            return;
        }
        closeMessageModal();

        // Clear form
        document.getElementById('messageRecipient').value = '';
        document.getElementById('messageSubject').value = '';
        document.getElementById('messageContent').value = '';
        document.getElementById('messagePriority').value = 'normal';
        document.getElementById('customRecipient').value = '';
        document.getElementById('customRecipientGroup').style.display = 'none';

        // Refresh messages to show the sent message
        await loadMessages();
        if (document.querySelector('#messages.active')) {
            renderMessages();
        }

    } catch (error) {
        logError('Failed to send message', error);
        showErrorMessage('Failed to send message: ' + error.message);
    }
}

/**
 * Create Project Modal Functions
 */
function showCreateProject() {
    document.getElementById('createProjectModal').style.display = 'block';
    // Auto-generate a project ID based on the current timestamp
    document.getElementById('projectId').value = '';
    document.getElementById('projectName').focus();
}

function closeCreateProjectModal() {
    document.getElementById('createProjectModal').style.display = 'none';
    // Clear form
    document.getElementById('projectId').value = '';
    document.getElementById('projectName').value = '';
    document.getElementById('projectDescription').value = '';
    document.getElementById('projectPriority').value = 'medium';
    document.getElementById('projectAssignee').value = '';
}

async function createProject() {
    try {
        const projectId = document.getElementById('projectId').value.trim();
        const projectName = document.getElementById('projectName').value.trim();
        const projectDescription = document.getElementById('projectDescription').value.trim();
        const projectPriority = document.getElementById('projectPriority').value;
        const projectAssignee = document.getElementById('projectAssignee').value.trim();

        // Validation
        if (!projectId) {
            showErrorMessage('Please enter a project ID');
            return;
        }

        if (!projectName) {
            showErrorMessage('Please enter a project name');
            return;
        }

        if (!projectDescription) {
            showErrorMessage('Please enter a project description');
            return;
        }

        // Validate project ID format (lowercase, hyphens, no spaces)
        if (!/^[a-z0-9-]+$/.test(projectId)) {
            showErrorMessage('Project ID must be lowercase letters, numbers, and hyphens only');
            return;
        }

        logInfo('Creating new project', { projectId, projectName, projectPriority });

        const result = await mcpCall('create_project', {
            id: projectId,
            name: projectName,
            description: projectDescription,
            priority: projectPriority,
            assignee: projectAssignee || undefined,
            status: 'active'
        });

        if (result.success) {
            showSuccessMessage(`Project "${projectName}" created successfully!`);
            closeCreateProjectModal();

            // Refresh projects display
            await loadProjects();
            if (document.querySelector('#projects.active')) {
                renderProjects();
            }
        } else {
            showErrorMessage('Failed to create project: ' + (result.error?.message || 'Unknown error'));
        }

    } catch (error) {
        logError('Error creating project', error);
        showErrorMessage('Error creating project: ' + error.message);
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

/**
 * Get task creation information for display
 */
function getTaskCreatedInfo(task) {
    if (!task.created) return '';

    const createdDate = new Date(task.created);
    const timeAgo = getTimeAgo(createdDate);

    // Check for creator in metadata (API limitation - no direct creator field)
    const creator = task.metadata?.created_by ||
                   task.metadata?.creator ||
                   (task.created && getCreatorFromTaskId(task.id));

    if (creator) {
        return ` • Created by ${creator} ${timeAgo}`;
    } else {
        return ` • Created ${timeAgo}`;
    }
}

/**
 * Try to infer creator from task ID pattern (fallback method)
 */
function getCreatorFromTaskId(taskId) {
    // Some tasks have creator info in the ID pattern
    if (taskId.includes('ui-task-')) return 'Genevieve';
    if (taskId.includes('cs-task-')) return 'Genevieve';
    if (taskId.includes('docs-')) return 'Genevieve';
    return null;
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

/**
 * Task Detail Modal Functions
 */
function showTaskDetail(taskId) {
    const task = state.tasks.find(t => t.id === taskId);
    if (!task) {
        showErrorMessage('Task not found');
        return;
    }

    // Populate the modal with task data
    document.getElementById('taskDetailTitle').textContent = `Task: ${task.title}`;
    document.getElementById('detailTaskTitle').value = task.title || '';
    document.getElementById('detailTaskDescription').value = task.description || '';
    document.getElementById('detailTaskPriority').value = task.priority || 'medium';
    document.getElementById('detailTaskStatus').value = task.status || 'pending';
    document.getElementById('detailTaskProject').value = task.project_id || '';
    document.getElementById('detailTaskAssignee').value = task.assigned_to || '';
    document.getElementById('detailTaskEffort').value = task.estimated_effort || '';
    document.getElementById('detailTaskCreated').value = task.created_at ? formatDate(task.created_at) : '';
    document.getElementById('detailTaskId').value = task.id || '';

    // Store current task ID for saving
    document.getElementById('taskDetailModal').dataset.taskId = taskId;

    // Show the modal
    document.getElementById('taskDetailModal').style.display = 'block';
}

function closeTaskDetailModal() {
    document.getElementById('taskDetailModal').style.display = 'none';
    // Reset form states
    document.getElementById('saveTaskBtn').style.display = 'none';
    resetTaskDetailForm();
}

function resetTaskDetailForm() {
    // Make all fields readonly again
    document.getElementById('detailTaskTitle').readOnly = true;
    document.getElementById('detailTaskDescription').readOnly = true;
    document.getElementById('detailTaskPriority').disabled = true;

    // Hide save button
    document.getElementById('saveTaskBtn').style.display = 'none';
}

function enableTaskTitleEdit() {
    document.getElementById('detailTaskTitle').readOnly = false;
    document.getElementById('detailTaskTitle').focus();
    document.getElementById('saveTaskBtn').style.display = 'inline-block';
}

function enableTaskDescriptionEdit() {
    document.getElementById('detailTaskDescription').readOnly = false;
    document.getElementById('detailTaskDescription').focus();
    document.getElementById('saveTaskBtn').style.display = 'inline-block';
}

// Add event listener for priority changes
document.addEventListener('DOMContentLoaded', function() {
    const prioritySelect = document.getElementById('detailTaskPriority');
    if (prioritySelect) {
        prioritySelect.addEventListener('change', function() {
            document.getElementById('detailTaskPriority').disabled = false;
            document.getElementById('saveTaskBtn').style.display = 'inline-block';
        });
    }

    const statusSelect = document.getElementById('detailTaskStatus');
    if (statusSelect) {
        statusSelect.addEventListener('change', function() {
            document.getElementById('saveTaskBtn').style.display = 'inline-block';
        });
    }
});

async function saveTaskDetails() {
    const taskId = document.getElementById('taskDetailModal').dataset.taskId;
    if (!taskId) {
        showErrorMessage('No task selected');
        return;
    }

    try {
        const updates = {
            title: document.getElementById('detailTaskTitle').value.trim(),
            description: document.getElementById('detailTaskDescription').value.trim(),
            priority: document.getElementById('detailTaskPriority').value,
            status: document.getElementById('detailTaskStatus').value
        };

        logInfo('Saving task details', { taskId, updates });

        const result = await mcpCall('update_task', {
            id: taskId,
            updates: updates
        });

        if (result && result.success !== false) {
            showSuccessMessage('Task updated successfully!');
            closeTaskDetailModal();

            // Refresh tasks to show updated data
            await loadTasks();
            renderCurrentView();
        } else {
            showErrorMessage('Failed to update task: ' + (result?.error?.message || 'Unknown error'));
        }

    } catch (error) {
        logError('Error updating task', error);
        showErrorMessage('Error updating task: ' + error.message);
    }
}

/**
 * Message Detail Modal Functions
 */
let currentMessageId = null;

function showMessageDetail(messageId) {
    const message = state.messages.find(m => m.id === messageId);
    if (!message) {
        showErrorMessage('Message not found');
        return;
    }

    currentMessageId = messageId;

    // Populate modal with message data
    document.getElementById('messageDetailSubject').textContent = message.subject || 'No Subject';
    document.getElementById('messageDetailFrom').textContent = message.from || 'System';
    document.getElementById('messageDetailTo').textContent = message.to || 'Unknown';
    document.getElementById('messageDetailDate').textContent = new Date(message.created || message.timestamp).toLocaleString();
    document.getElementById('messageDetailId').textContent = message.id;

    // Set priority badge
    const priorityElement = document.getElementById('messageDetailPriority');
    priorityElement.textContent = message.priority || 'normal';
    priorityElement.className = `priority-badge priority-${message.priority || 'normal'}`;

    // Set message body
    document.getElementById('messageDetailBody').textContent = message.body || message.content || message.message || 'No content';

    // Show/hide mark as read button based on current status
    const markReadBtn = document.getElementById('markReadBtn');
    if (message.status === 'unread') {
        markReadBtn.style.display = 'inline-block';
        markReadBtn.textContent = '✓ Mark as Read';
    } else {
        markReadBtn.style.display = 'none';
    }

    // Show modal
    document.getElementById('messageDetailModal').style.display = 'block';

    logInfo('📧 Opened message detail', { messageId, subject: message.subject });
}

function closeMessageDetailModal() {
    document.getElementById('messageDetailModal').style.display = 'none';
    currentMessageId = null;
}

function replyToMessage() {
    const message = state.messages.find(m => m.id === currentMessageId);
    if (!message) {
        showErrorMessage('Message not found for reply');
        return;
    }

    // Close detail modal
    closeMessageDetailModal();

    // Open send message modal with pre-filled data
    document.getElementById('messageRecipient').value = message.from;
    document.getElementById('messageSubject').value = `Re: ${message.subject || 'No Subject'}`;
    document.getElementById('messageContent').value = `\n\n--- Original Message ---\nFrom: ${message.from}\nDate: ${new Date(message.created || message.timestamp).toLocaleString()}\nSubject: ${message.subject}\n\n${message.body || message.content || message.message || ''}`;
    document.getElementById('messageContent').focus();

    // Show send message modal
    showSendMessage();

    logInfo('📧 Replying to message', { originalId: currentMessageId, replyTo: message.from });
}

async function markMessageAsRead() {
    if (!currentMessageId) {
        showErrorMessage('No message selected');
        return;
    }

    try {
        logInfo('📧 Marking message as read', { messageId: currentMessageId });

        // Use the newly implemented mark_message_read function
        const result = await mcpCall('mark_message_read', {
            id: currentMessageId
        });

        if (result && result.success !== false) {
            showSuccessMessage('Message marked as read');

            // Update local state
            const message = state.messages.find(m => m.id === currentMessageId);
            if (message) {
                message.status = 'read';
            }

            // Refresh messages and close modal
            await loadMessages();
            renderMessages();
            closeMessageDetailModal();

        } else {
            showErrorMessage('Failed to mark message as read: ' + (result?.error?.message || 'Unknown error'));
        }

    } catch (error) {
        logError('Error marking message as read', error);
        showErrorMessage('Error marking message as read: ' + error.message);
    }
}

// ============================================================================
// USER REGISTRATION AND IDENTITY MANAGEMENT
// ============================================================================

let currentUser = {
    instanceId: null,
    role: null,
    isRegistered: false
};

/**
 * Load current user identity from localStorage
 */
function loadUserIdentity() {
    try {
        const saved = localStorage.getItem('mcp-user-identity');
        if (saved) {
            currentUser = { ...currentUser, ...JSON.parse(saved) };
            updateUserStatusDisplay();

            // Update CONFIG with current user
            if (currentUser.instanceId) {
                CONFIG.EXECUTIVE_INSTANCE_ID = currentUser.instanceId;
            }
        } else {
            // No saved identity - will attempt auto-registration after MCP connection
            logInfo('ℹ️ No saved identity found, will auto-register after connection');
        }
    } catch (error) {
        logError('Failed to load user identity', error);
    }
}

/**
 * Attempt auto-registration with default values
 */
async function attemptAutoRegistration() {
    try {
        logInfo('🔄 Attempting auto-registration as Lupo/Executive');

        const result = await mcpCall('register_instance', {
            instanceId: 'Lupo',
            role: 'Executive',
            capabilities: ['project_management', 'system_oversight', 'communication']
        });

        if (result && result.success !== false) {
            logInfo('✅ Auto-registration successful', result);

            currentUser = {
                instanceId: 'Lupo',
                role: 'Executive',
                capabilities: ['project_management', 'system_oversight', 'communication'],
                isRegistered: true
            };

            CONFIG.EXECUTIVE_INSTANCE_ID = 'Lupo';
            saveUserIdentity();
            showSuccessMessage('Auto-registered as Lupo (Executive)');

        } else {
            logWarn('Auto-registration failed, user can register manually', result);
        }

    } catch (error) {
        logWarn('Auto-registration failed, user can register manually', error);
        // Don't show error message - this is expected for first-time users
    }
}

/**
 * Save current user identity to localStorage
 */
function saveUserIdentity() {
    try {
        localStorage.setItem('mcp-user-identity', JSON.stringify(currentUser));
        updateUserStatusDisplay();
    } catch (error) {
        logError('Failed to save user identity', error);
    }
}

/**
 * Update the user status display in header
 */
function updateUserStatusDisplay() {
    const userIdElement = document.getElementById('current-user-id');
    const userRoleElement = document.getElementById('current-user-role');
    const registerBtn = document.getElementById('register-btn');

    if (currentUser.isRegistered && currentUser.instanceId) {
        userIdElement.textContent = currentUser.instanceId;
        userRoleElement.textContent = currentUser.role || '';
        registerBtn.textContent = 'Change Identity';
    } else {
        userIdElement.textContent = 'Not Registered';
        userRoleElement.textContent = '';
        registerBtn.textContent = 'Register/Change Identity';
    }
}

/**
 * Show registration modal
 */
function showRegistrationModal() {
    const modal = document.getElementById('registrationModal');
    const instanceIdInput = document.getElementById('instanceId');
    const roleSelect = document.getElementById('instanceRole');

    // Pre-populate with current values
    if (currentUser.instanceId) {
        instanceIdInput.value = currentUser.instanceId;
    }
    if (currentUser.role) {
        roleSelect.value = currentUser.role;
    }

    modal.style.display = 'block';
}

/**
 * Close registration modal
 */
function closeRegistrationModal() {
    document.getElementById('registrationModal').style.display = 'none';
}

/**
 * Register/update instance with MCP server
 */
async function registerInstance() {
    const instanceId = document.getElementById('instanceId').value.trim();
    const role = document.getElementById('instanceRole').value;
    const capabilitiesStr = document.getElementById('instanceCapabilities').value.trim();

    if (!instanceId) {
        showErrorMessage('Instance ID is required');
        return;
    }

    try {
        logInfo('🔄 Registering instance', { instanceId, role });

        const capabilities = capabilitiesStr ?
            capabilitiesStr.split(',').map(c => c.trim()).filter(c => c) :
            [];

        const result = await mcpCall('register_instance', {
            instanceId: instanceId,
            role: role,
            capabilities: capabilities
        });

        if (result && result.success !== false) {
            logInfo('✅ Instance registered successfully', result);

            // Update current user state
            currentUser = {
                instanceId: instanceId,
                role: role,
                capabilities: capabilities,
                isRegistered: true
            };

            // Update global config
            CONFIG.EXECUTIVE_INSTANCE_ID = instanceId;

            saveUserIdentity();
            closeRegistrationModal();
            showSuccessMessage(`Successfully registered as ${instanceId} (${role})`);

            // Refresh system data
            refreshSystemStatus();
            loadMessages();

        } else {
            logError('Registration failed', result);
            showErrorMessage('Registration failed: ' + (result?.error?.message || 'Unknown error'));
        }

    } catch (error) {
        logError('Error during registration', error);
        showErrorMessage('Registration error: ' + error.message);
    }
}

// ============================================================================
// SYSTEM STATUS AND INSTANCES MANAGEMENT
// ============================================================================

/**
 * Load and display instances and roles
 */
async function loadSystemStatus() {
    try {
        logInfo('🔄 Loading system status');

        const instancesResult = await mcpCall('get_instances', { active_only: false });

        logInfo('🔍 Instances result received', instancesResult);

        if (instancesResult && instancesResult.success !== false) {
            // Handle different response formats
            const instances = instancesResult.instances || instancesResult.data?.instances || instancesResult.data || [];

            if (Array.isArray(instances)) {
                displayInstances(instances);
                displayRoles(instances);
                logInfo('✅ System status loaded', {
                    total: instances.length,
                    instances: instances.length
                });
            } else {
                logError('Instances data is not an array', { instances, instancesResult });
                showErrorMessage('Invalid instances data format');
            }
        } else {
            logError('Failed to load instances', instancesResult);
            showErrorMessage('Failed to load system status: ' + (instancesResult?.error?.message || 'Unknown error'));
        }

    } catch (error) {
        logError('Error loading system status', error);
        showErrorMessage('Error loading system status: ' + error.message);
    }
}

/**
 * Display instances list
 */
function displayInstances(instances) {
    const container = document.getElementById('instances-list');

    if (!instances || instances.length === 0) {
        container.innerHTML = '<div class="loading-placeholder">No instances found</div>';
        return;
    }

    // Sort: active first, then by last seen
    const sortedInstances = [...instances].sort((a, b) => {
        if (a.status === 'active' && b.status !== 'active') return -1;
        if (b.status === 'active' && a.status !== 'active') return 1;
        return new Date(b.last_seen) - new Date(a.last_seen);
    });

    let html = '';
    let lastWasActive = true;

    sortedInstances.forEach((instance) => {
        const isActive = instance.status === 'active';

        // Add separator between active and inactive
        if (lastWasActive && !isActive) {
            html += '<div style="border-top: 1px solid var(--border-color); margin: 1rem 0; padding-top: 1rem; font-size: 0.75rem; color: var(--text-secondary); text-align: center;">Inactive Instances</div>';
        }
        lastWasActive = isActive;

        const lastSeen = new Date(instance.last_seen);
        const timeAgo = getTimeAgo(lastSeen);

        html += `
            <div class="instance-item ${isActive ? 'active' : 'inactive'}"
                 onclick="selectInstanceForMessage('${instance.id}')"
                 title="Click to send message to ${instance.id}">
                <div class="instance-info">
                    <div class="instance-id">${instance.id}</div>
                    <div class="instance-role">${instance.role}</div>
                </div>
                <div class="instance-status">
                    <div class="status-indicator ${isActive ? 'active' : ''}"></div>
                    <span>${timeAgo}</span>
                </div>
            </div>
        `;
    });

    container.innerHTML = html;
}

/**
 * Display roles with counts
 */
function displayRoles(instances) {
    const container = document.getElementById('roles-list');
    const badge = document.getElementById('total-instances-badge');

    // Count roles
    const roleCounts = {};
    instances.forEach(instance => {
        const role = instance.role || 'Unknown';
        roleCounts[role] = (roleCounts[role] || 0) + 1;
    });

    // Update total badge
    badge.textContent = `${instances.length} Total`;

    // Sort roles by count (descending)
    const sortedRoles = Object.entries(roleCounts).sort((a, b) => b[1] - a[1]);

    let html = '';
    sortedRoles.forEach(([role, count]) => {
        html += `
            <div class="role-item">
                <div class="role-name">${role}</div>
                <div class="role-count">${count}</div>
            </div>
        `;
    });

    container.innerHTML = html || '<div class="loading-placeholder">No roles found</div>';
}

/**
 * Select instance for messaging
 */
function selectInstanceForMessage(instanceId) {
    logInfo('📧 Selecting instance for message', { instanceId });

    // Open message modal with instance pre-selected
    showSendMessage();

    // Pre-populate recipient
    const recipientSelect = document.getElementById('messageRecipient');

    // Try to find the instance in the dropdown options
    let optionFound = false;
    for (let option of recipientSelect.options) {
        if (option.value === instanceId) {
            option.selected = true;
            optionFound = true;
            break;
        }
    }

    // If not found in dropdown, use custom option
    if (!optionFound) {
        recipientSelect.value = 'custom';
        toggleCustomRecipient();
        document.getElementById('customRecipient').value = instanceId;
    }
}

/**
 * Refresh system status
 */
async function refreshSystemStatus() {
    logInfo('🔄 Refreshing system status');
    await loadSystemStatus();
}

/**
 * Get human readable time ago string
 */
function getTimeAgo(date) {
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${diffDays}d ago`;
}

// Expose functions globally for onclick handlers
window.showRegistrationModal = showRegistrationModal;
window.closeRegistrationModal = closeRegistrationModal;
window.registerInstance = registerInstance;
window.refreshSystemStatus = refreshSystemStatus;
window.selectInstanceForMessage = selectInstanceForMessage;

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
    saveProjectChanges,
    showTaskDetail,
    closeTaskDetailModal,
    enableTaskTitleEdit,
    enableTaskDescriptionEdit,
    saveTaskDetails,
    togglePriorityEdit,
    updateTaskPriority,
    toggleTitleEdit,
    updateTaskTitle,
    toggleProjectDescriptionEdit,
    updateProjectDescription,
    downloadLogs,
    toggleDebugPanel,
    showMessageDetail,
    closeMessageDetailModal,
    replyToMessage,
    markMessageAsRead
};