/**
 * Projects Module
 *
 * Handles project listing, project detail panel, create project, and launch project.
 * The project detail panel is the main view for managing a project.
 *
 * @module projects
 */

import { state } from './state.js';
import { escapeHtml, showToast } from './utils.js';
import api from './api.js';
import * as uiConfig from './ui-config.js';

// ============================================================================
// PROJECT LIST
// ============================================================================

/**
 * Render the projects grid from state.projects
 * Note: Projects are loaded into state by loadInitialData() in app.js
 */
export function loadProjects() {
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

// ============================================================================
// PROJECT DETAIL PANEL
// ============================================================================

/**
 * Show project detail view, hiding the grid
 * Redesigned with PM card, team grid, documents, collapsible tasks, and chat sidebar
 * @param {string} projectId - Project ID to show
 */
export async function showProjectDetail(projectId) {
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

    // Load and render project tasks (request up to 100, API defaults to 5)
    try {
        const result = await api.listTasks(state.instanceId, { projectId, limit: 100 });
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
 * Hide project detail, return to grid
 */
export function hideProjectDetail() {
    document.getElementById('project-detail-view').style.display = 'none';
    document.getElementById('project-grid').style.display = 'grid';
    document.querySelector('#tab-projects .page-header').style.display = 'flex';
    state.currentProjectDetail = null;
    state.currentProject = null;
    state.currentProjectPM = null;
    state.pmChatTurns = 0;
}

// ============================================================================
// PROJECT DETAIL COMPONENTS
// ============================================================================

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
 * Render tasks in project detail view
 */
export function renderProjectDetailTasks(tasks) {
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

// ============================================================================
// PROJECT CHAT SIDEBAR
// ============================================================================

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

// ============================================================================
// CREATE PROJECT MODAL
// ============================================================================

/**
 * Show the create project modal
 */
export function showCreateProjectModal() {
    document.getElementById('create-project-modal').classList.add('active');
    document.getElementById('project-name').value = '';
    document.getElementById('project-description').value = '';
    document.getElementById('project-gh-repo').value = '';
    document.getElementById('project-name').focus();
}

/**
 * Close the create project modal
 */
export function closeCreateProjectModal() {
    document.getElementById('create-project-modal').classList.remove('active');
}

/**
 * Create a new project
 */
export async function createProject() {
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

/**
 * Launch a project with PM auto-creation
 */
export async function launchProject() {
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
        showToast('Project launched! PM ' + pmInstanceId + ' is now online.', 'success');
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
// HELPER FUNCTIONS (referenced but defined elsewhere - must be available)
// ============================================================================

// These functions are called from projects.js but defined in app.js
// They will be available at runtime since app.js loads them

/**
 * Show instance detail - called from team member cards
 * This is defined in app.js and will be available at runtime
 */
function showInstanceDetail(instanceId) {
    // This function exists in app.js - we reference window version
    if (window.showInstanceDetail) {
        window.showInstanceDetail(instanceId);
    } else {
        console.warn('[Projects] showInstanceDetail not available');
    }
}

/**
 * Show task detail - called from task items
 * This is defined in app.js and will be available at runtime
 */
function showTaskDetail(taskId, source) {
    // This function exists in app.js - we reference window version
    if (window.showTaskDetail) {
        window.showTaskDetail(taskId, source);
    } else {
        console.warn('[Projects] showTaskDetail not available');
    }
}

/**
 * Ensure API key is set for wake operations
 * This is defined in app.js and will be available at runtime
 */
function ensureApiKey() {
    // This function exists in app.js - we reference window version
    if (window.ensureApiKey) {
        return window.ensureApiKey();
    } else {
        console.warn('[Projects] ensureApiKey not available');
        return Promise.resolve();
    }
}

/**
 * Render project rooms in messages tab
 * This is defined in app.js and will be available at runtime
 */
function renderProjectRooms() {
    // This function exists in app.js - we reference window version
    if (window.renderProjectRooms) {
        window.renderProjectRooms();
    } else {
        console.warn('[Projects] renderProjectRooms not available');
    }
}

// ============================================================================
// EXPORTS
// ============================================================================

// Make showProjectDetail available globally for navigation
window.showProjectDetail = showProjectDetail;

export default {
    loadProjects,
    showProjectDetail,
    hideProjectDetail,
    renderProjectDetailTasks,
    showCreateProjectModal,
    closeCreateProjectModal,
    createProject,
    launchProject
};
