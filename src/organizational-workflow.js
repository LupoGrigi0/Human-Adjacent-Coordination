/**
 * Organizational Workflow Automation System
 * Implements enterprise-grade AI instance coordination and workflow management
 * 
 * @author claude-code-BootstrapEnhancementSpecialist-Aurora-2025-09-06-0130
 * 
 * WORKFLOW AUTOMATION:
 * User Journey: Idea → PA (Intake) → COO (Validation) → PM (Planning) → Specialists (Execution) → COO (Review)
 * 
 * CAPABILITIES:
 * - COO can wake PM instances via API call
 * - PM can wake specialist instances for specific tasks  
 * - Message routing follows organizational hierarchy
 * - Automatic project setup with HumanAdjacentAI-Protocol files
 */

import { randomUUID } from 'crypto';
import { ROLE_HIERARCHY, BOOTSTRAP_PHASES, stateManager } from './enhanced-bootstrap.js';
import { enhancedBootstrap } from './enhanced-bootstrap.js';
import { ProjectHandler } from './handlers/projects.js';
import { handlers as taskHandlers } from './handlers/tasks-v2.js';
import { handlers as messageHandlers } from './handlers/messages-v3.js';
import { InstanceHandler } from './handlers/instances.js';
import { logger } from './logger.js';

/**
 * Organizational Workflow Manager
 * Orchestrates enterprise AI collaboration patterns
 */
export class OrganizationalWorkflow {
  constructor() {
    this.activeWorkflows = new Map();
    this.instanceRegistry = new Map();
  }

  /**
   * Initialize User Journey: Idea → PA → COO → PM → Specialists → COO
   * @param {Object} userRequest - Initial user request
   * @param {string} userRequest.idea - User's idea or request
   * @param {string} userRequest.priority - Request priority
   * @param {string} userRequest.context - Additional context
   * @returns {Object} Workflow initiation response
   */
  async initiateUserJourney(userRequest) {
    const { idea, priority = 'medium', context = '' } = userRequest;
    const workflowId = randomUUID();

    const workflow = {
      id: workflowId,
      user_request: userRequest,
      status: 'initiated',
      current_stage: 'pa_intake',
      stages: {
        pa_intake: { status: 'pending', assigned_to: null },
        coo_validation: { status: 'waiting', assigned_to: null },
        pm_planning: { status: 'waiting', assigned_to: null },
        specialist_execution: { status: 'waiting', assigned_to: null },
        coo_review: { status: 'waiting', assigned_to: null }
      },
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    this.activeWorkflows.set(workflowId, workflow);

    // Auto-assign to available PA or create one
    const paAssignment = await this.assignOrCreateInstance('PA', workflowId, 'intake');

    workflow.stages.pa_intake.assigned_to = paAssignment.instanceId;
    workflow.stages.pa_intake.status = 'in_progress';
    workflow.updated_at = new Date().toISOString();

    await logger.info(`User journey initiated: ${workflowId} -> PA: ${paAssignment.instanceId}`);

    return {
      success: true,
      workflow_id: workflowId,
      message: 'User journey initiated successfully',
      current_stage: 'pa_intake',
      assigned_pa: paAssignment.instanceId,
      next_steps: [
        'PA will process and organize the request',
        'PA will escalate to COO for validation and prioritization',
        'COO will assign PM for detailed planning',
        'PM will coordinate specialist execution'
      ],
      estimated_timeline: this.estimateWorkflowTimeline(userRequest)
    };
  }

  /**
   * COO Function: Wake PM Instance for Project Management
   * @param {Object} params - PM wake parameters
   * @param {string} params.project_id - Project requiring PM attention
   * @param {string} params.specialization - PM specialization needed
   * @param {string} params.urgency - Request urgency level
   * @param {string} params.coo_instance_id - COO instance making request
   * @returns {Object} PM wake response
   */
  async cooWakePM(params) {
    const { project_id, specialization = 'general-pm', urgency = 'normal', coo_instance_id } = params;

    // Validate COO authority
    const cooState = stateManager.getState(coo_instance_id);
    if (!cooState || cooState.role !== 'COO' || !stateManager.isWorkAuthorized(coo_instance_id)) {
      throw new Error('Unauthorized: Only work-authorized COO instances can wake PM instances');
    }

    // Generate PM instance
    const pmInstanceId = `claude-code-PM-${specialization}-${new Date().toISOString().slice(0,16).replace(/[:-]/g, '')}-${Math.random().toString(36).substring(2,6)}`;

    // Create PM with enhanced bootstrap
    const pmBootstrapResponse = await enhancedBootstrap({
      role: 'PM',
      instanceId: pmInstanceId,
      project: project_id,
      specialization: specialization
    });

    // Auto-assign PM to project if specified
    if (project_id) {
      await this.autoAssignProjectManager(pmInstanceId, project_id, urgency);
    }

    // Send coordination message from COO to PM
    await messageHandlers.send_message({
      to: pmInstanceId,
      from: coo_instance_id,
      subject: `Project Management Assignment - ${urgency.toUpperCase()} Priority`,
      content: `You have been assigned as PM for project ${project_id}. 
                Specialization: ${specialization}
                Urgency: ${urgency}
                
                Your immediate tasks:
                1. Review project requirements and current status
                2. Create detailed project plan and task breakdown
                3. Identify required specialists and coordinate their assignment
                4. Establish timeline and milestone tracking
                
                Report status to COO upon completion of initial planning.`,
      priority: urgency === 'critical' ? 'urgent' : urgency === 'high' ? 'high' : 'normal'
    });

    await logger.info(`COO ${coo_instance_id} woke PM ${pmInstanceId} for project ${project_id}`);

    return {
      success: true,
      pm_instance_id: pmInstanceId,
      project_assignment: project_id,
      specialization: specialization,
      urgency: urgency,
      bootstrap_status: pmBootstrapResponse.success ? 'completed' : 'in_progress',
      message: `PM ${pmInstanceId} activated and assigned to project ${project_id}`,
      next_steps: [
        'PM will complete enhanced bootstrap process',
        'PM will review project requirements',
        'PM will create detailed execution plan',
        'PM will coordinate specialist assignments'
      ]
    };
  }

  /**
   * PM Function: Wake Specialist Instance for Task Execution
   * @param {Object} params - Specialist wake parameters
   * @param {string} params.specialist_type - Type of specialist needed
   * @param {string} params.task_id - Specific task assignment
   * @param {string} params.skills_required - Required skills
   * @param {string} params.pm_instance_id - PM instance making request
   * @returns {Object} Specialist wake response
   */
  async pmWakeSpecialist(params) {
    const { specialist_type, task_id, skills_required = [], pm_instance_id } = params;

    // Validate PM authority
    const pmState = stateManager.getState(pm_instance_id);
    if (!pmState || pmState.role !== 'PM' || !stateManager.isWorkAuthorized(pm_instance_id)) {
      throw new Error('Unauthorized: Only work-authorized PM instances can wake specialist instances');
    }

    // Validate specialist type
    const validSpecialists = ['Developer', 'Tester', 'Designer', 'Infrastructure', 'Architecture'];
    if (!validSpecialists.includes(specialist_type)) {
      throw new Error(`Invalid specialist type. Valid types: ${validSpecialists.join(', ')}`);
    }

    // Generate specialist instance
    const specialistInstanceId = `claude-code-${specialist_type}-${new Date().toISOString().slice(0,16).replace(/[:-]/g, '')}-${Math.random().toString(36).substring(2,6)}`;

    // Create specialist with enhanced bootstrap
    const specialistBootstrapResponse = await enhancedBootstrap({
      role: specialist_type,
      instanceId: specialistInstanceId,
      specialization: Array.isArray(skills_required) ? skills_required.join('-') : skills_required
    });

    // Auto-assign specialist to task if specified
    if (task_id) {
      await this.autoAssignSpecialistTask(specialistInstanceId, task_id);
    }

    // Send coordination message from PM to specialist
    await messageHandlers.send_message({
      to: specialistInstanceId,
      from: pm_instance_id,
      subject: `${specialist_type} Task Assignment`,
      content: `You have been assigned as ${specialist_type} specialist.
                Task ID: ${task_id}
                Required Skills: ${Array.isArray(skills_required) ? skills_required.join(', ') : skills_required}
                
                Your immediate tasks:
                1. Complete enhanced bootstrap process with mandatory learning
                2. Review task requirements and acceptance criteria
                3. Plan implementation approach
                4. Begin execution and provide regular status updates
                
                Report progress and blockers to PM regularly.`,
      priority: 'normal'
    });

    await logger.info(`PM ${pm_instance_id} woke ${specialist_type} ${specialistInstanceId} for task ${task_id}`);

    return {
      success: true,
      specialist_instance_id: specialistInstanceId,
      specialist_type: specialist_type,
      task_assignment: task_id,
      skills_focus: skills_required,
      bootstrap_status: specialistBootstrapResponse.success ? 'completed' : 'in_progress',
      message: `${specialist_type} specialist ${specialistInstanceId} activated and assigned`,
      coordination: {
        reporting_to: pm_instance_id,
        escalation_path: 'Specialist → PM → COO',
        communication_frequency: 'Regular status updates expected'
      }
    };
  }

  /**
   * Automatic Project Setup with HumanAdjacentAI-Protocol Files
   * @param {Object} projectRequest - Project setup request
   * @param {string} projectRequest.name - Project name
   * @param {string} projectRequest.description - Project description
   * @param {string} projectRequest.type - Project type
   * @param {string} requester_instance_id - Instance requesting setup
   * @returns {Object} Project setup response
   */
  async autoSetupProject(projectRequest, requester_instance_id) {
    const { name, description, type = 'standard', priority = 'medium' } = projectRequest;

    // Validate requester authority (COO or PA only)
    const requesterState = stateManager.getState(requester_instance_id);
    if (!requesterState || !['COO', 'PA'].includes(requesterState.role)) {
      throw new Error('Unauthorized: Only COO or PA instances can create projects');
    }

    const projectId = `project-${name.toLowerCase().replace(/\s+/g, '-')}-${Date.now()}`;

    // Create project with HumanAdjacentAI-Protocol structure
    const projectResponse = await ProjectHandler.createProject({
      id: projectId,
      name: name,
      description: description,
      priority: priority,
      status: 'active',
      metadata: {
        type: type,
        created_by: requester_instance_id,
        protocol_version: '3.0',
        workflow_enabled: true,
        required_roles: this.determineRequiredRoles(type),
        files_structure: this.getProtocolFileStructure()
      }
    });

    if (!projectResponse.success) {
      throw new Error(`Failed to create project: ${projectResponse.error?.message}`);
    }

    // Create initial project tasks
    const initialTasks = this.generateInitialProjectTasks(projectId, type);
    for (const task of initialTasks) {
      await taskHandlers.create_task({
        ...task,
        project_id: projectId
      });
    }

    // Setup project communication channels
    await this.setupProjectCommunication(projectId, requester_instance_id);

    await logger.info(`Auto-setup completed for project ${projectId} by ${requester_instance_id}`);

    return {
      success: true,
      project_id: projectId,
      project_name: name,
      protocol_structure: 'HumanAdjacentAI-Protocol v3.0 applied',
      initial_tasks_created: initialTasks.length,
      required_roles: this.determineRequiredRoles(type),
      next_steps: [
        'Assign Project Manager via cooWakePM()',
        'PM will break down project into detailed tasks',
        'PM will coordinate specialist assignments',
        'Begin iterative development with regular COO reviews'
      ]
    };
  }

  /**
   * Smart Message Routing Following Organizational Hierarchy
   * @param {Object} routingRequest - Message routing request
   * @param {string} routingRequest.message - Message content
   * @param {string} routingRequest.sender_id - Sender instance ID
   * @param {string} routingRequest.intent - Message intent
   * @returns {Object} Routing response
   */
  async smartMessageRouting(routingRequest) {
    const { message, sender_id, intent, priority = 'normal' } = routingRequest;

    const senderState = stateManager.getState(sender_id);
    if (!senderState) {
      throw new Error('Sender instance not found in system');
    }

    const routingDecision = this.determineMessageRouting(senderState, intent, priority);

    // Route message according to hierarchy
    for (const recipient of routingDecision.recipients) {
      await messageHandlers.send_message({
        to: recipient.instance_id,
        from: sender_id,
        subject: routingDecision.subject,
        content: `${message}\n\n[Auto-routed via organizational hierarchy]`,
        priority: priority,
        metadata: {
          routing_reason: routingDecision.reason,
          original_intent: intent
        }
      });
    }

    return {
      success: true,
      routing_decision: routingDecision,
      messages_sent: routingDecision.recipients.length,
      hierarchy_path: routingDecision.hierarchy_path
    };
  }

  /**
   * Helper: Assign or create instance for workflow stage
   */
  async assignOrCreateInstance(role, workflowId, context) {
    // Try to find available instance of the role
    const availableInstances = await InstanceHandler.getInstances({ 
      role: role, 
      active_only: true 
    });

    let assignedInstance = null;

    if (availableInstances.success && availableInstances.instances?.length > 0) {
      // Use existing instance
      assignedInstance = availableInstances.instances[0];
    } else {
      // Create new instance
      const instanceId = `claude-code-${role}-${context}-${new Date().toISOString().slice(0,16).replace(/[:-]/g, '')}-${Math.random().toString(36).substring(2,6)}`;
      
      // Bootstrap new instance
      await enhancedBootstrap({
        role: role,
        instanceId: instanceId
      });

      assignedInstance = { id: instanceId, role: role };
    }

    return { instanceId: assignedInstance.id };
  }

  /**
   * Helper: Auto-assign PM to project
   */
  async autoAssignProjectManager(pmInstanceId, projectId, urgency) {
    try {
      // Update project with PM assignment
      await ProjectHandler.updateProject({
        id: projectId,
        updates: {
          assigned_pm: pmInstanceId,
          pm_assigned_at: new Date().toISOString(),
          status: urgency === 'critical' ? 'urgent' : 'active'
        }
      });

      // Attach PM to project in bootstrap state
      const pmState = stateManager.getState(pmInstanceId);
      if (pmState && pmState.current_phase === BOOTSTRAP_PHASES.PROJECT_ASSIGNMENT_REQUIRED) {
        await attachProjectPhase(pmState, { project_ids: [projectId] });
      }

    } catch (error) {
      await logger.error(`Failed to auto-assign PM ${pmInstanceId} to project ${projectId}:`, error.message);
    }
  }

  /**
   * Helper: Auto-assign specialist to task
   */
  async autoAssignSpecialistTask(specialistInstanceId, taskId) {
    try {
      await taskHandlers.claim_task({
        id: taskId,
        instanceId: specialistInstanceId
      });

      await logger.info(`Auto-assigned specialist ${specialistInstanceId} to task ${taskId}`);
    } catch (error) {
      await logger.error(`Failed to auto-assign specialist ${specialistInstanceId} to task ${taskId}:`, error.message);
    }
  }

  /**
   * Helper: Determine required roles for project type
   */
  determineRequiredRoles(projectType) {
    const rolesByType = {
      'standard': ['PM', 'Developer'],
      'complex': ['PM', 'Developer', 'Tester', 'Designer'],
      'enterprise': ['PM', 'Developer', 'Tester', 'Designer', 'Infrastructure', 'Architecture'],
      'research': ['PM', 'Architecture', 'Developer'],
      'design': ['PM', 'Designer', 'Developer', 'Tester'],
      'infrastructure': ['PM', 'Infrastructure', 'Developer', 'Architecture']
    };

    return rolesByType[projectType] || rolesByType.standard;
  }

  /**
   * Helper: Get HumanAdjacentAI-Protocol file structure
   */
  getProtocolFileStructure() {
    return {
      required_files: [
        'CLAUDE.md - Human-Adjacent AI Development Protocol',
        'CLAUDE_TASKS.md - Active sprint backlog and task queue', 
        'project_plan.md - Project overview and architecture',
        'project_notes.md - Implementation decisions and discoveries'
      ],
      optional_files: [
        'COLLABORATION_PROTOCOL.md - Complete methodology documentation',
        'THE_GREAT_HANDOFF.md - Context window management procedures'
      ]
    };
  }

  /**
   * Helper: Generate initial project tasks
   */
  generateInitialProjectTasks(projectId, type) {
    const baseTasks = [
      {
        id: `${projectId}-setup`,
        title: 'Project Setup and Protocol Implementation',
        description: 'Implement HumanAdjacentAI-Protocol files and project structure',
        priority: 'high',
        estimated_effort: '2h',
        metadata: { phase: 'setup', required_role: 'PM' }
      },
      {
        id: `${projectId}-planning`,
        title: 'Detailed Project Planning',
        description: 'Break down project into specific tasks and milestones',
        priority: 'high',
        estimated_effort: '4h',
        metadata: { phase: 'planning', required_role: 'PM' }
      }
    ];

    // Add type-specific tasks
    const typeTasks = {
      'complex': [
        {
          id: `${projectId}-architecture`,
          title: 'System Architecture Design',
          description: 'Design system architecture and component interactions',
          priority: 'high',
          estimated_effort: '6h',
          metadata: { phase: 'design', required_role: 'Architecture' }
        }
      ],
      'enterprise': [
        {
          id: `${projectId}-architecture`,
          title: 'Enterprise Architecture Planning',
          description: 'Design scalable enterprise-grade architecture',
          priority: 'critical',
          estimated_effort: '8h',
          metadata: { phase: 'design', required_role: 'Architecture' }
        },
        {
          id: `${projectId}-infrastructure`,
          title: 'Infrastructure Requirements Analysis',
          description: 'Define deployment, monitoring, and operational requirements',
          priority: 'high',
          estimated_effort: '4h',
          metadata: { phase: 'planning', required_role: 'Infrastructure' }
        }
      ]
    };

    const additionalTasks = typeTasks[type] || [];
    return [...baseTasks, ...additionalTasks];
  }

  /**
   * Helper: Setup project communication channels
   */
  async setupProjectCommunication(projectId, creatorInstanceId) {
    // Send project creation notification to relevant roles
    const notificationMessage = `New project created: ${projectId}
                                Creator: ${creatorInstanceId}
                                Status: Active and ready for PM assignment
                                
                                Next steps: Use cooWakePM() to assign project manager`;

    // Notify active COO instances
    const ccoInstances = await InstanceHandler.getInstances({ role: 'COO', active_only: true });
    if (ccoInstances.success && ccoInstances.instances?.length > 0) {
      for (const coo of ccoInstances.instances) {
        if (coo.id !== creatorInstanceId) {
          await messageHandlers.send_message({
            to: coo.id,
            from: creatorInstanceId,
            subject: 'New Project Created - PM Assignment Needed',
            content: notificationMessage,
            priority: 'normal'
          });
        }
      }
    }
  }

  /**
   * Helper: Determine message routing based on hierarchy
   */
  determineMessageRouting(senderState, intent, priority) {
    const senderRole = senderState.role;
    const reportsTo = ROLE_HIERARCHY[senderRole]?.reports_to;

    const routingRules = {
      'escalation': {
        recipients: reportsTo === 'human' ? [] : [{ instance_id: reportsTo, role: reportsTo }],
        subject: `Escalation from ${senderRole}`,
        reason: 'Following escalation hierarchy',
        hierarchy_path: [senderRole, reportsTo]
      },
      'status_update': {
        recipients: reportsTo === 'human' ? [] : [{ instance_id: reportsTo, role: reportsTo }],
        subject: `Status Update from ${senderRole}`,
        reason: 'Regular status reporting',
        hierarchy_path: [senderRole, reportsTo]
      },
      'coordination': {
        recipients: this.findPeerInstances(senderRole),
        subject: `Coordination Request from ${senderRole}`,
        reason: 'Peer coordination',
        hierarchy_path: [senderRole, 'peers']
      }
    };

    return routingRules[intent] || routingRules.status_update;
  }

  /**
   * Helper: Find peer instances for coordination
   */
  async findPeerInstances(role) {
    const peers = await InstanceHandler.getInstances({ 
      role: role, 
      active_only: true 
    });

    return peers.success ? peers.instances.map(p => ({ 
      instance_id: p.id, 
      role: p.role 
    })) : [];
  }

  /**
   * Helper: Estimate workflow timeline
   */
  estimateWorkflowTimeline(userRequest) {
    const { priority } = userRequest;
    
    const timelines = {
      'critical': '2-4 hours',
      'high': '4-8 hours', 
      'medium': '1-2 days',
      'low': '2-5 days'
    };

    return timelines[priority] || timelines.medium;
  }
}

// Export singleton instance
export const organizationalWorkflow = new OrganizationalWorkflow();