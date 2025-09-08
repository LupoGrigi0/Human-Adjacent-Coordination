/**
 * MCP Coordination System - Web UI Application
 * 
 * @author claude-code-UISpecialist-2025-08-23-1400
 */

// Configuration
const API_BASE = 'http://localhost:3000';
const UPDATE_INTERVAL = 5000; // 5 seconds

// Enhanced MCP API call helper with better error handling
async function mcpCall(functionName, params = {}) {
    try {
        const response = await fetch(`${API_BASE}/api/mcp/call`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                function: functionName,
                params: params
            })
        });
        
        const result = await response.json();
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${result.error?.message || 'Unknown error'}`);
        }
        
        if (!result.success) {
            throw new Error(result.error?.message || 'MCP function call failed');
        }
        
        return result;
        
    } catch (error) {
        // Enhanced error context
        if (error.name === 'TypeError' && error.message.includes('Failed to fetch')) {
            throw new Error('Cannot connect to MCP server. Is the server running on port 3000?');
        }
        throw error;
    }
}

// Global state
const state = {
    serverStatus: 'checking',
    projects: [],
    tasks: [],
    instances: [],
    currentTab: 'dashboard',
    selectedProjectFilter: '', // For project-specific task filtering
    tasksMetadata: null // Store API metadata including schema version
};

// Initialize application
document.addEventListener('DOMContentLoaded', function() {
    console.log('🚀 MCP Coordination System UI - Starting...');
    initializeUI();
    startStatusMonitoring();
    loadInitialData();
});

// UI Initialization
function initializeUI() {
    setupTabNavigation();
    setupModalHandlers();
    logMessage('Web interface initialized');
}

// Tab Navigation
function setupTabNavigation() {
    const tabs = document.querySelectorAll('.nav-tab');
    const contents = document.querySelectorAll('.tab-content');
    
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const tabId = tab.getAttribute('data-tab');
            
            // Update active states
            tabs.forEach(t => t.classList.remove('active'));
            contents.forEach(c => c.classList.remove('active'));
            
            tab.classList.add('active');
            document.getElementById(tabId).classList.add('active');
            
            state.currentTab = tabId;
            
            // Load tab-specific data and refresh to show latest
            switch(tabId) {
                case 'dashboard':
                    // Refresh all data for dashboard
                    loadInitialData();
                    break;
                case 'projects':
                    loadProjects();
                    break;
                case 'tasks':
                    loadTasks();
                    break;
                case 'instances':
                    loadInstances();
                    break;
            }
        });
    });
}

// Modal Handlers
function setupModalHandlers() {
    // Close modals when clicking outside
    document.querySelectorAll('.modal').forEach(modal => {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.classList.remove('active');
            }
        });
    });
}

// Server Status Monitoring
function startStatusMonitoring() {
    checkServerStatus();
    setInterval(checkServerStatus, UPDATE_INTERVAL);
}

async function checkServerStatus() {
    try {
        const response = await fetch(`${API_BASE}/health`);
        const data = await response.json();
        
        if (response.ok) {
            updateServerStatus('online', 'Connected');
            updateSystemMetrics(data);
        } else {
            throw new Error(`Server returned ${response.status}`);
        }
    } catch (error) {
        console.error('Server status check failed:', error);
        updateServerStatus('offline', 'Offline');
    }
}

function updateServerStatus(status, text) {
    const indicator = document.getElementById('status-indicator');
    const statusText = document.getElementById('status-text');
    
    indicator.className = `status-indicator ${status}`;
    statusText.textContent = text;
    
    state.serverStatus = status;
}

function updateSystemMetrics(healthData) {
    try {
        document.getElementById('system-status').textContent = healthData.status || 'Unknown';
        document.getElementById('system-uptime').textContent = formatUptime(healthData.uptime || 0);
        document.getElementById('system-version').textContent = healthData.server?.version || '1.0.0';
        
        logMessage(`Server health: ${healthData.status}`);
    } catch (error) {
        console.error('Failed to update system metrics:', error);
    }
}

function formatUptime(seconds) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return `${hours}h ${minutes}m`;
}

// Data Loading
async function loadInitialData() {
    try {
        await Promise.all([
            loadProjects(),
            loadTasks(),
            loadInstances()
        ]);
        logMessage('Initial data loaded successfully');
    } catch (error) {
        console.error('Failed to load initial data:', error);
        logMessage('Failed to load initial data', 'error');
    }
}

// API Functions
async function apiCall(endpoint, method = 'GET', body = null) {
    const config = {
        method,
        headers: {
            'Content-Type': 'application/json',
        }
    };
    
    if (body) {
        config.body = JSON.stringify(body);
    }
    
    const response = await fetch(`${API_BASE}${endpoint}`, config);
    const data = await response.json();
    
    if (!response.ok) {
        throw new Error(data.error?.message || `API call failed: ${response.status}`);
    }
    
    return data;
}

// Bootstrap Function
async function bootstrapInstance() {
    const role = document.getElementById('bootstrap-role').value;
    const instanceId = document.getElementById('bootstrap-name').value.trim();
    
    if (!instanceId) {
        alert('Please enter an instance name');
        return;
    }
    
    try {
        logMessage(`Bootstrapping ${role} instance: ${instanceId}`);
        
        const result = await apiCall('/api/mcp/bootstrap', 'POST', {
            role: role,
            instanceId: instanceId
        });
        
        if (result.success) {
            logMessage(`✅ Successfully bootstrapped ${instanceId}`);
            
            // Show bootstrap result in a readable format
            const bootstrapInfo = {
                message: result.message,
                available_functions: result.available_functions?.map(f => `${f.name} - ${f.description}`),
                first_steps: result.first_steps,
                next_actions: result.next_actions
            };
            
            document.getElementById('api-response').textContent = JSON.stringify(bootstrapInfo, null, 2);
            
            // Switch to API test tab to show results
            document.querySelector('[data-tab="api-test"]').click();
            
            // Clear form
            document.getElementById('bootstrap-name').value = '';
            
            // Refresh instances
            loadInstances();
        } else {
            throw new Error(result.error?.message || 'Bootstrap failed');
        }
    } catch (error) {
        console.error('Bootstrap failed:', error);
        logMessage(`❌ Bootstrap failed: ${error.message}`, 'error');
        alert(`Bootstrap failed: ${error.message}`);
    }
}

// Project Management
async function loadProjects() {
    try {
        logMessage('Loading projects from MCP server...');
        
        // Call real MCP API
        const result = await mcpCall('get_projects', {});
        
        const projects = result.projects || [];
        
        // Enhance projects with calculated fields
        const enhancedProjects = projects.map(project => {
            // Calculate task progress from tasks if available
            const projectTasks = state.tasks.filter(t => t.project_id === project.id);
            const tasksTotal = projectTasks.length;
            const tasksPending = projectTasks.filter(t => t.status === 'pending').length;
            
            return {
                ...project,
                tasks_pending: tasksPending,
                tasks_total: tasksTotal
            };
        });
        
        state.projects = enhancedProjects;
        renderProjects(enhancedProjects);
        updateDashboardStats();
        updateProjectFilters();
        
        logMessage(`✅ Loaded ${projects.length} projects from MCP server`);
        
    } catch (error) {
        console.error('Failed to load projects:', error);
        logMessage(`❌ Failed to load projects: ${error.message}`, 'error');
        renderProjectsError();
    }
}

function renderProjects(projects) {
    const container = document.getElementById('projects-grid');
    
    if (projects.length === 0) {
        container.innerHTML = `
            <div class="card placeholder">
                <i class="fas fa-folder-plus placeholder-icon"></i>
                <p>No projects found. Create your first project to get started!</p>
            </div>
        `;
        return;
    }
    
    container.innerHTML = projects.map(project => `
        <div class="card">
            <h4>
                <i class="fas fa-folder"></i>
                ${project.name}
                <span class="priority-badge ${project.priority}">${project.priority.toUpperCase()}</span>
            </h4>
            <p>${project.description}</p>
            <div class="project-stats">
                <div class="stat">
                    <i class="fas fa-tasks"></i>
                    ${project.tasks_total - project.tasks_pending}/${project.tasks_total} tasks
                </div>
                <div class="stat">
                    <i class="fas fa-calendar"></i>
                    ${formatDate(project.created)}
                </div>
            </div>
            <div class="project-actions">
                <button class="btn btn-sm" onclick="viewProject('${project.id}')">
                    <i class="fas fa-eye"></i> View
                </button>
                <button class="btn btn-sm" onclick="editProject('${project.id}')">
                    <i class="fas fa-edit"></i> Edit
                </button>
            </div>
        </div>
    `).join('');
}

function renderProjectsError() {
    document.getElementById('projects-grid').innerHTML = `
        <div class="card placeholder error">
            <i class="fas fa-exclamation-triangle placeholder-icon"></i>
            <p>Failed to load projects. Check server connection.</p>
            <button class="btn btn-primary" onclick="loadProjects()">
                <i class="fas fa-refresh"></i> Retry
            </button>
        </div>
    `;
}

// Task Management - Updated for v2.0 project-specific architecture
async function loadTasks(projectId = null) {
    try {
        logMessage(projectId ? `Loading tasks for project: ${projectId}...` : 'Loading all tasks from MCP server...');
        
        // Prepare parameters for v2.0 API
        const params = projectId ? { project_id: projectId } : {};
        
        // Call real MCP API with v2.0 parameters
        const result = await mcpCall('get_tasks', params);
        
        const tasks = result.tasks || [];
        const metadata = result.metadata || {};
        
        // Store metadata for UI indicators
        state.tasksMetadata = metadata;
        state.tasks = tasks;
        
        // Update project filter state if filtering by project
        if (projectId) {
            state.selectedProjectFilter = projectId;
        }
        
        renderTasks(tasks);
        updateDashboardStats();
        
        // Log with v2.0 context
        const contextMsg = metadata.project_specific 
            ? `for project ${metadata.project_id}` 
            : `across ${metadata.projects_included ? metadata.projects_included.length : 0} projects`;
        
        logMessage(`✅ Loaded ${tasks.length} tasks ${contextMsg} (Schema v${metadata.schema_version || '1.0'})`);
        
    } catch (error) {
        console.error('Failed to load tasks:', error);
        logMessage(`❌ Failed to load tasks: ${error.message}`, 'error');
        renderTasksError();
    }
}

function renderTasks(tasks) {
    const pendingList = document.getElementById('pending-task-list');
    const inProgressList = document.getElementById('inprogress-task-list');
    const completedList = document.getElementById('completed-task-list');
    
    // Clear lists
    [pendingList, inProgressList, completedList].forEach(list => {
        list.innerHTML = '';
    });
    
    // Group tasks by status
    const tasksByStatus = {
        pending: tasks.filter(t => t.status === 'pending'),
        'in-progress': tasks.filter(t => t.status === 'in-progress' || t.status === 'claimed'),
        completed: tasks.filter(t => t.status === 'completed')
    };
    
    // Render tasks in appropriate columns
    Object.entries(tasksByStatus).forEach(([status, statusTasks]) => {
        const listElement = status === 'in-progress' ? inProgressList : 
                          status === 'completed' ? completedList : pendingList;
        
        if (statusTasks.length === 0) {
            listElement.innerHTML = `
                <div class="task-card placeholder">
                    <p>No ${status.replace('-', ' ')} tasks</p>
                </div>
            `;
            return;
        }
        
        listElement.innerHTML = statusTasks.map(task => `
            <div class="task-card ${task.priority}-priority" onclick="viewTask('${task.id}')">
                <div class="task-header">
                    <h5>${task.title}</h5>
                    ${task.project_id ? `<span class="project-badge">${getProjectName(task.project_id)}</span>` : ''}
                </div>
                <p>${task.description || 'No description'}</p>
                <div class="task-meta">
                    <span class="priority">${task.priority.toUpperCase()}</span>
                    ${task.assigned_to ? `<span class="assignee">${task.assigned_to}</span>` : ''}
                    <span class="date">${formatDate(task.created)}</span>
                </div>
                <div class="task-actions">
                    ${task.status === 'pending' ? `<button class="btn btn-sm" onclick="updateTaskStatus('${task.id}', 'claimed'); event.stopPropagation();">Claim</button>` : ''}
                    ${(task.status === 'in-progress' || task.status === 'claimed') ? `<button class="btn btn-sm" onclick="updateTaskStatus('${task.id}', 'completed'); event.stopPropagation();">Complete</button>` : ''}
                    ${task.status === 'completed' ? `<span class="status-badge completed">✓ Done</span>` : ''}
                </div>
            </div>
        `).join('');
    });
}

function renderTasksError() {
    ['pending-task-list', 'inprogress-task-list', 'completed-task-list'].forEach(id => {
        document.getElementById(id).innerHTML = `
            <div class="task-card error">
                <p>Failed to load tasks</p>
                <button class="btn btn-sm" onclick="loadTasks()">Retry</button>
            </div>
        `;
    });
}

// Instance Management
async function loadInstances() {
    try {
        logMessage('Loading instances from MCP server...');
        
        // Call real MCP API
        const result = await mcpCall('get_instances', {});
        
        const instances = result.instances || [];
        
        state.instances = instances;
        renderInstances(instances);
        updateDashboardStats();
        
        logMessage(`✅ Loaded ${instances.length} instances from MCP server`);
        
    } catch (error) {
        console.error('Failed to load instances:', error);
        logMessage(`❌ Failed to load instances: ${error.message}`, 'error');
        renderInstancesError();
    }
}

function renderInstances(instances) {
    const container = document.getElementById('instances-grid');
    
    if (instances.length === 0) {
        container.innerHTML = `
            <div class="card placeholder">
                <i class="fas fa-robot placeholder-icon"></i>
                <p>No AI instances detected. Bootstrap an instance to get started!</p>
            </div>
        `;
        return;
    }
    
    container.innerHTML = instances.map(instance => `
        <div class="card instance-card">
            <div class="instance-status ${instance.status}"></div>
            <h4>
                <i class="fas fa-robot"></i>
                ${instance.id}
            </h4>
            <div class="instance-info">
                <div class="info-row">
                    <span>Role:</span>
                    <span class="role-badge ${instance.role.toLowerCase()}">${instance.role}</span>
                </div>
                <div class="info-row">
                    <span>Status:</span>
                    <span class="status ${instance.status}">${instance.status}</span>
                </div>
                <div class="info-row">
                    <span>Tasks:</span>
                    <span>${instance.tasks_claimed}</span>
                </div>
                <div class="info-row">
                    <span>Last Seen:</span>
                    <span>${formatRelativeTime(instance.last_seen)}</span>
                </div>
            </div>
        </div>
    `).join('');
}

function renderInstancesError() {
    document.getElementById('instances-grid').innerHTML = `
        <div class="card placeholder error">
            <i class="fas fa-exclamation-triangle placeholder-icon"></i>
            <p>Failed to load instances. Check server connection.</p>
            <button class="btn btn-primary" onclick="loadInstances()">
                <i class="fas fa-refresh"></i> Retry
            </button>
        </div>
    `;
}

// Dashboard Updates
function updateDashboardStats() {
    const activeProjects = state.projects.filter(p => p.status === 'active').length;
    const pendingTasks = state.tasks.filter(t => t.status === 'pending').length;
    const activeInstances = state.instances.filter(i => i.status === 'active').length;
    
    document.getElementById('active-projects').textContent = activeProjects;
    document.getElementById('pending-tasks').textContent = pendingTasks;
    document.getElementById('ai-instances').textContent = activeInstances;
}

// API Testing
async function testAPICall() {
    const endpoint = document.getElementById('api-endpoint').value;
    const requestBody = document.getElementById('api-request-body').value.trim();
    const responseElement = document.getElementById('api-response');
    
    try {
        responseElement.textContent = 'Sending request...';
        
        let result;
        if (endpoint.includes('POST')) {
            const actualEndpoint = endpoint.split(' ')[1];
            const body = requestBody ? JSON.parse(requestBody) : null;
            result = await apiCall(actualEndpoint, 'POST', body);
        } else {
            const actualEndpoint = endpoint.split(' ')[1];
            result = await apiCall(actualEndpoint, 'GET');
        }
        
        responseElement.textContent = JSON.stringify(result, null, 2);
        logMessage(`API test successful: ${endpoint}`);
        
    } catch (error) {
        const errorResponse = {
            error: error.message,
            endpoint: endpoint,
            timestamp: new Date().toISOString()
        };
        responseElement.textContent = JSON.stringify(errorResponse, null, 2);
        logMessage(`API test failed: ${error.message}`, 'error');
    }
}

// Utility Functions
function formatDate(dateString) {
    return new Date(dateString).toLocaleDateString();
}

function formatRelativeTime(dateString) {
    const now = new Date();
    const date = new Date(dateString);
    const diff = now - date;
    
    const minutes = Math.floor(diff / (1000 * 60));
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    
    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    return `${days}d ago`;
}

function logMessage(message, type = 'info') {
    const logContainer = document.getElementById('system-log');
    const timestamp = new Date().toLocaleTimeString();
    
    const logEntry = document.createElement('div');
    logEntry.className = `log-entry ${type}`;
    logEntry.innerHTML = `
        <span class="log-time">[${timestamp}]</span>
        <span class="log-message">${message}</span>
    `;
    
    logContainer.appendChild(logEntry);
    logContainer.scrollTop = logContainer.scrollHeight;
    
    // Keep only last 50 entries
    const entries = logContainer.querySelectorAll('.log-entry');
    if (entries.length > 50) {
        entries[0].remove();
    }
}

// Modal Functions
function showCreateProjectModal() {
    document.getElementById('create-project-modal').classList.add('active');
}

function showCreateTaskModal() {
    // Populate project dropdown with required selection
    const projectSelect = document.getElementById('new-task-project');
    projectSelect.innerHTML = '<option value="">Select Project (Required)</option>' +
        state.projects.map(p => `<option value="${p.id}">${p.name}</option>`).join('');
    
    document.getElementById('create-task-modal').classList.add('active');
}

function closeModal(modalId) {
    document.getElementById(modalId).classList.remove('active');
}

// Form Handlers
async function createProject(event) {
    event.preventDefault();
    
    const name = document.getElementById('new-project-name').value.trim();
    const description = document.getElementById('new-project-description').value.trim();
    const priority = document.getElementById('new-project-priority').value;
    
    if (!name) {
        alert('Project name is required');
        return;
    }
    
    try {
        logMessage(`Creating project: ${name}`);
        
        // Call real MCP API
        const result = await mcpCall('create_project', {
            name: name,
            description: description,
            priority: priority
        });
        
        logMessage(`✅ Successfully created project: ${name}`);
        
        // Close modal and reset form
        closeModal('create-project-modal');
        event.target.reset();
        
        // Reload projects to show the new one
        await loadProjects();
        
    } catch (error) {
        console.error('Failed to create project:', error);
        logMessage(`❌ Failed to create project: ${error.message}`, 'error');
        alert(`Failed to create project: ${error.message}`);
    }
}

async function createTask(event) {
    event.preventDefault();
    
    const title = document.getElementById('new-task-title').value.trim();
    const description = document.getElementById('new-task-description').value.trim();
    const project = document.getElementById('new-task-project').value;
    const priority = document.getElementById('new-task-priority').value;
    
    if (!title) {
        alert('Task title is required');
        return;
    }
    
    if (!project) {
        alert('Project selection is required for v2.0 task architecture');
        return;
    }
    
    try {
        logMessage(`Creating task: ${title} in project: ${project}`);
        
        // Generate unique task ID
        const taskId = `task-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        
        // Call real MCP API with v2.0 parameters
        const result = await mcpCall('create_task', {
            id: taskId,
            title: title,
            description: description,
            project_id: project,
            priority: priority
        });
        
        logMessage(`✅ Successfully created task: ${title} in project: ${project}`);
        
        // Close modal and reset form
        closeModal('create-task-modal');
        event.target.reset();
        
        // Reload tasks to show the new one
        // If filtering by project, maintain that filter
        if (state.selectedProjectFilter) {
            await loadTasks(state.selectedProjectFilter);
        } else {
            await loadTasks();
        }
        
        // Update dashboard stats
        updateDashboardStats();
        
    } catch (error) {
        console.error('Failed to create task:', error);
        logMessage(`❌ Failed to create task: ${error.message}`, 'error');
        alert(`Failed to create task: ${error.message}`);
    }
}

// Task Status Management - Updated for v2.0 architecture
async function updateTaskStatus(taskId, newStatus) {
    try {
        logMessage(`Updating task ${taskId} status to: ${newStatus}`);
        
        // For claimed status, we need to use claim_task function
        if (newStatus === 'claimed') {
            const instanceId = `web-ui-user-${Date.now()}`;
            const result = await mcpCall('claim_task', {
                id: taskId,
                instanceId: instanceId
            });
        } else {
            // Use update_task for other status changes
            const result = await mcpCall('update_task', {
                id: taskId,
                updates: { status: newStatus }
            });
        }
        
        logMessage(`✅ Successfully updated task status to: ${newStatus}`);
        
        // Reload tasks to reflect the change, maintaining current filter
        if (state.selectedProjectFilter) {
            await loadTasks(state.selectedProjectFilter);
        } else {
            await loadTasks();
        }
        updateDashboardStats();
        
    } catch (error) {
        console.error('Failed to update task status:', error);
        logMessage(`❌ Failed to update task: ${error.message}`, 'error');
        alert(`Failed to update task: ${error.message}`);
    }
}

// Placeholder action functions
function viewProject(projectId) {
    logMessage(`Viewing project: ${projectId}`);
    alert(`Project details view not yet implemented. Project ID: ${projectId}`);
}

function editProject(projectId) {
    logMessage(`Editing project: ${projectId}`);
    alert(`Project editing not yet implemented. Project ID: ${projectId}`);
}

function viewTask(taskId) {
    const task = state.tasks.find(t => t.id === taskId);
    if (task) {
        const taskInfo = `Task: ${task.title}\n\nDescription: ${task.description || 'No description'}\n\nStatus: ${task.status}\nPriority: ${task.priority}\n\nProject: ${task.project_id || 'No project'}\nAssigned to: ${task.assigned_to || 'Unassigned'}\n\nCreated: ${formatDate(task.created)}`;
        alert(taskInfo);
        logMessage(`Viewing task: ${task.title}`);
    } else {
        alert(`Task not found: ${taskId}`);
    }
}

function refreshInstances() {
    logMessage('Refreshing instances...');
    loadInstances();
}

function filterProjects() {
    // Implement project filtering
    logMessage('Project filtering not yet implemented');
}

function filterTasks() {
    // Implement task filtering
    logMessage('Task filtering not yet implemented');
}

// Helper functions for v2.0 architecture
function getProjectName(projectId) {
    const project = state.projects.find(p => p.id === projectId);
    return project ? project.name : projectId;
}

// Update project filter dropdowns
function updateProjectFilters() {
    // Update task filter dropdown
    const taskProjectFilter = document.getElementById('task-project-filter');
    if (taskProjectFilter) {
        const currentValue = taskProjectFilter.value;
        taskProjectFilter.innerHTML = '<option value="">All Projects</option>' +
            state.projects.map(p => `<option value="${p.id}">${p.name}</option>`).join('');
        // Restore previous selection if still valid
        if (currentValue && state.projects.find(p => p.id === currentValue)) {
            taskProjectFilter.value = currentValue;
        }
    }
    
    // Update schema version indicator
    const schemaIndicator = document.getElementById('task-schema-indicator');
    if (schemaIndicator && state.tasksMetadata) {
        schemaIndicator.textContent = `v${state.tasksMetadata.schema_version || '1.0'}`;
        schemaIndicator.title = state.tasksMetadata.project_specific 
            ? `Schema v${state.tasksMetadata.schema_version} - Project: ${state.tasksMetadata.project_id}`
            : `Schema v${state.tasksMetadata.schema_version} - All Projects`;
    }
}

// Project filter management
function onProjectFilterChange() {
    const projectFilter = document.getElementById('task-project-filter');
    const selectedProject = projectFilter.value;
    
    if (selectedProject === '') {
        // Load all tasks
        state.selectedProjectFilter = '';
        loadTasks();
        logMessage('Showing tasks from all projects');
    } else {
        // Load tasks for specific project
        state.selectedProjectFilter = selectedProject;
        loadTasks(selectedProject);
        logMessage(`Filtering tasks for project: ${getProjectName(selectedProject)}`);
    }
}

// Update task filtering to work with project filter
function filterTasks() {
    const searchTerm = document.getElementById('task-search').value.toLowerCase();
    const statusFilter = document.getElementById('task-status-filter').value;
    const priorityFilter = document.getElementById('task-priority-filter').value;
    
    // Get all task cards
    const taskCards = document.querySelectorAll('.task-card:not(.placeholder)');
    
    taskCards.forEach(card => {
        const title = card.querySelector('h5').textContent.toLowerCase();
        const description = card.querySelector('p').textContent.toLowerCase();
        const priority = card.classList.contains('high-priority') ? 'high' :
                        card.classList.contains('low-priority') ? 'low' : 'medium';
        
        // Determine status from parent column
        const column = card.closest('.task-column');
        let status = '';
        if (column) {
            const columnTitle = column.querySelector('h3').textContent.toLowerCase();
            if (columnTitle.includes('pending')) status = 'pending';
            else if (columnTitle.includes('progress')) status = 'in-progress';
            else if (columnTitle.includes('completed')) status = 'completed';
        }
        
        // Apply filters
        const matchesSearch = !searchTerm || title.includes(searchTerm) || description.includes(searchTerm);
        const matchesStatus = !statusFilter || status === statusFilter;
        const matchesPriority = !priorityFilter || priority === priorityFilter;
        
        if (matchesSearch && matchesStatus && matchesPriority) {
            card.style.display = 'block';
        } else {
            card.style.display = 'none';
        }
    });
    
    logMessage('Applied task filters');
}

// Export for testing
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        apiCall,
        formatDate,
        formatRelativeTime,
        logMessage,
        getProjectName,
        onProjectFilterChange
    };
}