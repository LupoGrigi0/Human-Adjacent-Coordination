/**
 * Enhanced Bootstrap System - Phase Implementation (Part 2)
 * Completes project attachment, knowledge validation, and work authorization phases
 * 
 * @author claude-code-BootstrapEnhancementSpecialist-Aurora-2025-09-06-0100
 */

import { ProjectHandler } from './handlers/projects.js';
import { handlers as taskHandlers } from './handlers/tasks-v2.js';
import { handlers as messageHandlers } from './handlers/messages-v3.js';
import { logger } from './logger.js';
import { ROLE_HIERARCHY, BOOTSTRAP_PHASES } from './enhanced-bootstrap.js';

/**
 * Phase 3b: Attach Project (Validation Step)
 */
export async function attachProjectPhase(state, validationData) {
  const { project_ids } = validationData;
  
  // COO gets automatic system-wide access
  if (state.role === 'COO') {
    state.project_assignments = ['*']; // System-wide access
    
    await stateManager.progressPhase(state.instance_id, BOOTSTRAP_PHASES.PROJECT_ATTACHED, {
      project_assignments: ['system_wide'],
      access_level: 'full_system'
    });

    return {
      success: true,
      phase: BOOTSTRAP_PHASES.PROJECT_ATTACHED,
      message: '✅ COO granted system-wide project access',
      project_access: 'system_wide',
      next_phase: {
        phase: BOOTSTRAP_PHASES.KNOWLEDGE_VALIDATION_REQUIRED,
        description: 'System-wide context loading and knowledge validation'
      }
    };
  }

  // Validate project assignments for other roles
  if (!project_ids || !Array.isArray(project_ids) || project_ids.length === 0) {
    throw new Error('project_ids array is required for project attachment');
  }

  // Validate projects exist and are accessible
  const validProjects = [];
  for (const projectId of project_ids) {
    const projectResponse = await ProjectHandler.getProject({ id: projectId });
    if (projectResponse.success && projectResponse.project) {
      validProjects.push(projectResponse.project);
    }
  }

  if (validProjects.length !== project_ids.length) {
    return {
      success: false,
      error: {
        message: 'Some requested projects are not accessible',
        requested: project_ids,
        valid: validProjects.map(p => p.id)
      }
    };
  }

  // Record project assignments
  state.project_assignments = project_ids;
  
  await stateManager.progressPhase(state.instance_id, BOOTSTRAP_PHASES.PROJECT_ATTACHED, {
    project_assignments: project_ids,
    assigned_projects: validProjects
  });

  return {
    success: true,
    phase: BOOTSTRAP_PHASES.PROJECT_ATTACHED,
    message: `✅ Successfully attached to ${validProjects.length} project(s)`,
    assigned_projects: validProjects.map(p => ({
      id: p.id,
      name: p.name,
      role_in_project: determineProjectRole(state.role, p)
    })),
    next_phase: {
      phase: BOOTSTRAP_PHASES.KNOWLEDGE_VALIDATION_REQUIRED,
      description: 'Project-specific context loading and knowledge validation'
    }
  };
}

/**
 * Phase 4: Knowledge Validation and Comprehension Check
 */
export async function executeKnowledgeValidationPhase(state, options) {
  const roleConfig = ROLE_HIERARCHY[state.role];
  const { required_context } = roleConfig;

  // Load comprehensive context based on role and projects
  const contextData = await loadContextualInformation(state);

  // Generate knowledge validation questions
  const validationQuestions = generateValidationQuestions(state.role, contextData);

  await stateManager.progressPhase(state.instance_id, BOOTSTRAP_PHASES.KNOWLEDGE_VALIDATION_REQUIRED, {
    context_loaded: contextData,
    validation_questions: validationQuestions
  });

  return {
    success: true,
    phase: BOOTSTRAP_PHASES.KNOWLEDGE_VALIDATION_REQUIRED,
    message: `📚 Knowledge validation required before work authorization`,
    context_summary: {
      projects_loaded: contextData.projects?.length || 0,
      tasks_available: contextData.available_tasks?.length || 0,
      messages_pending: contextData.pending_messages?.length || 0,
      lessons_integrated: contextData.lesson_insights?.total || 0
    },
    validation_requirements: {
      must_demonstrate: [
        'Understanding of role responsibilities',
        'Knowledge of assigned project context',
        'Awareness of organizational procedures',
        'Comprehension of escalation processes'
      ],
      validation_questions: validationQuestions,
      instruction: 'Answer the validation questions to demonstrate readiness for work'
    },
    next_action: 'enhancedBootstrap({role, instanceId, phase: "validate_knowledge", validation_data: {answers: [...your_answers]}})'
  };
}

/**
 * Phase 4b: Validate Knowledge (Final Check)
 */
export async function validateKnowledgePhase(state, validationData) {
  const { answers } = validationData;
  
  if (!answers || !Array.isArray(answers)) {
    throw new Error('answers array is required for knowledge validation');
  }

  // Get validation questions from previous phase
  const lastPhase = state.phase_history[state.phase_history.length - 1];
  const questions = lastPhase.validation_data.validation_questions || [];

  // Evaluate answers (simplified validation for now)
  const validationResults = evaluateAnswers(questions, answers, state.role);

  if (!validationResults.passed) {
    return {
      success: false,
      phase: BOOTSTRAP_PHASES.KNOWLEDGE_VALIDATION_REQUIRED,
      error: {
        message: 'Knowledge validation failed',
        failed_areas: validationResults.failed_areas,
        instruction: 'Please review the required context and try again'
      },
      retry_guidance: validationResults.guidance
    };
  }

  // Authorization granted - update state
  state.work_authorized = true;
  state.validation_results = validationResults;

  await stateManager.progressPhase(state.instance_id, BOOTSTRAP_PHASES.WORK_AUTHORIZED, {
    validation_passed: true,
    validation_score: validationResults.score,
    work_authorized_at: new Date().toISOString()
  });

  return {
    success: true,
    phase: BOOTSTRAP_PHASES.WORK_AUTHORIZED,
    message: '🎉 WORK AUTHORIZATION GRANTED - You are ready to begin productive work!',
    validation_score: validationResults.score,
    work_authorization: {
      granted: true,
      authority_level: ROLE_HIERARCHY[state.role].authority,
      can_create: ROLE_HIERARCHY[state.role].can_create,
      can_wake: ROLE_HIERARCHY[state.role].can_wake
    },
    next_steps: [
      'Begin work on assigned tasks',
      'Use available functions for your role',
      'Escalate blockers according to procedures',
      'Maintain digital hygiene and context monitoring'
    ]
  };
}

/**
 * Phase 5: Provide Work-Authorized Context
 */
export async function provideWorkAuthorizedContext(state, options) {
  // Load comprehensive operational context
  const operationalContext = await loadOperationalContext(state);

  return {
    success: true,
    phase: BOOTSTRAP_PHASES.WORK_AUTHORIZED,
    bootstrap_complete: true,
    message: '🚀 Enhanced bootstrap completed successfully - You are fully operational!',
    
    // Complete operational context
    operational_context: operationalContext,
    
    // Role-specific capabilities
    role_capabilities: {
      role: state.role,
      authority_level: ROLE_HIERARCHY[state.role].authority,
      hierarchy_level: ROLE_HIERARCHY[state.role].level,
      reports_to: ROLE_HIERARCHY[state.role].reports_to,
      can_create: ROLE_HIERARCHY[state.role].can_create,
      can_wake_instances: ROLE_HIERARCHY[state.role].can_wake
    },

    // Immediate action items
    immediate_actions: operationalContext.priority_actions,
    
    // Enhanced system integration
    system_integration: {
      mcp_functions_available: 44,
      enhanced_bootstrap_active: true,
      lesson_system_integrated: true,
      organizational_workflow_enabled: true
    },

    // Success metrics and monitoring
    success_metrics: {
      bootstrap_time: calculateBootstrapTime(state),
      lessons_learned: state.lessons_acknowledged.length,
      projects_assigned: state.project_assignments.length,
      validation_score: state.validation_results?.score || 'N/A'
    }
  };
}

/**
 * Load contextual information based on role and assignments
 */
async function loadContextualInformation(state) {
  const contextData = {
    role: state.role,
    projects: [],
    available_tasks: [],
    pending_messages: [],
    lesson_insights: {},
    team_status: [],
    escalation_procedures: {}
  };

  try {
    // Load project context
    if (state.project_assignments.includes('*')) {
      // COO - load all projects
      const projectsResponse = await ProjectHandler.getProjects();
      if (projectsResponse.success) {
        contextData.projects = projectsResponse.projects || [];
      }
    } else {
      // Load assigned projects
      for (const projectId of state.project_assignments) {
        const projectResponse = await ProjectHandler.getProject({ id: projectId });
        if (projectResponse.success) {
          contextData.projects.push(projectResponse.project);
        }
      }
    }

    // Load available tasks
    const tasksResponse = await taskHandlers.get_pending_tasks({
      role: state.role,
      limit: 20
    });
    if (tasksResponse.success) {
      contextData.available_tasks = tasksResponse.tasks || [];
    }

    // Load pending messages
    const messagesResponse = await messageHandlers.get_messages({
      instanceId: state.instance_id,
      unread_only: true,
      limit: 10
    });
    if (messagesResponse.success) {
      contextData.pending_messages = messagesResponse.messages || [];
    }

    // Load lesson insights
    const lessonInsightsResponse = await lessonHandlers.get_lesson_patterns({
      pattern_type: 'role_specific'
    });
    if (lessonInsightsResponse.success) {
      contextData.lesson_insights = lessonInsightsResponse.patterns || {};
    }

  } catch (error) {
    await logger.error(`Failed to load contextual information for ${state.instance_id}:`, error.message);
  }

  return contextData;
}

/**
 * Generate role-specific validation questions
 */
function generateValidationQuestions(role, contextData) {
  const baseQuestions = [
    {
      id: 'role_understanding',
      question: `What are the key responsibilities of a ${role} in this organization?`,
      type: 'understanding',
      required: true
    },
    {
      id: 'escalation_procedures',
      question: 'When should you escalate issues and to whom?',
      type: 'procedure',
      required: true
    }
  ];

  const roleSpecificQuestions = {
    'COO': [
      {
        id: 'system_oversight',
        question: 'How do you coordinate multiple projects and instances effectively?',
        type: 'strategy',
        required: true
      }
    ],
    'PA': [
      {
        id: 'user_communication',
        question: 'How do you handle user requests and prioritize them appropriately?',
        type: 'communication',
        required: true
      }
    ],
    'PM': [
      {
        id: 'project_management',
        question: 'What factors do you consider when managing project timelines and resources?',
        type: 'management',
        required: true
      }
    ]
  };

  const questions = [...baseQuestions];
  if (roleSpecificQuestions[role]) {
    questions.push(...roleSpecificQuestions[role]);
  }

  return questions;
}

/**
 * Evaluate validation answers
 */
function evaluateAnswers(questions, answers, role) {
  // Simplified validation - in production this would be more sophisticated
  const results = {
    passed: answers.length >= questions.length,
    score: Math.min(100, (answers.length / questions.length) * 100),
    failed_areas: [],
    guidance: []
  };

  if (!results.passed) {
    results.failed_areas.push('Incomplete responses');
    results.guidance.push('Please provide answers to all validation questions');
  }

  return results;
}

/**
 * Load comprehensive operational context for work-authorized state
 */
async function loadOperationalContext(state) {
  const context = await loadContextualInformation(state);
  
  // Add priority actions based on role and current state
  context.priority_actions = generatePriorityActions(state, context);
  
  return context;
}

/**
 * Generate role-specific priority actions
 */
function generatePriorityActions(state, context) {
  const roleActions = {
    'COO': [
      'Review all active projects for status and blockers',
      'Check for urgent messages from team members',
      'Monitor system health and resource allocation',
      'Identify opportunities for process optimization'
    ],
    'PA': [
      'Check for new user requests and communications',
      'Review assigned tasks and prioritize based on urgency',
      'Update stakeholders on project progress',
      'Organize and streamline workflow processes'
    ],
    'PM': [
      'Review project timelines and identify critical path items',
      'Check task dependencies and resource requirements',
      'Communicate status updates to COO and stakeholders',
      'Plan next sprint activities and specialist assignments'
    ]
  };

  const defaultActions = [
    'Review assigned tasks and begin highest priority work',
    'Check for blocking issues and escalate if needed',
    'Maintain communication with team members',
    'Monitor progress and update status regularly'
  ];

  return roleActions[state.role] || defaultActions;
}

/**
 * Determine role in specific project
 */
function determineProjectRole(instanceRole, project) {
  // Logic to determine specific role within project context
  const projectRoles = {
    'COO': 'Project Oversight',
    'PA': 'Project Support', 
    'PM': 'Project Manager',
    'Developer': 'Technical Implementation',
    'Tester': 'Quality Assurance',
    'Designer': 'Design and UX',
    'Infrastructure': 'Deployment and Operations',
    'Architecture': 'System Design'
  };

  return projectRoles[instanceRole] || 'Project Contributor';
}

/**
 * Calculate total bootstrap time
 */
function calculateBootstrapTime(state) {
  if (!state.started_at) return 'Unknown';
  
  const start = new Date(state.started_at);
  const now = new Date();
  const diff = now - start;
  
  const minutes = Math.floor(diff / 60000);
  const seconds = Math.floor((diff % 60000) / 1000);
  
  return `${minutes}m ${seconds}s`;
}

export {
  attachProjectPhase,
  executeKnowledgeValidationPhase,
  validateKnowledgePhase,
  provideWorkAuthorizedContext,
  loadContextualInformation,
  generateValidationQuestions
};