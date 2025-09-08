/**
 * Enhanced Bootstrap System - Enterprise-Grade Organizational Onboarding
 * Implements mandatory lesson learning and role-based project attachment
 * 
 * @author claude-code-BootstrapEnhancementSpecialist-Aurora-2025-09-06-0035
 * 
 * VISION: Transform bootstrap from "get started quickly" to "get started correctly with full organizational context"
 * 
 * PHASES:
 * 1. Role Registration & Hierarchy Validation
 * 2. Mandatory Lesson Learning (BLOCKS progression until completed)  
 * 3. Project Attachment & Context Loading
 * 4. Knowledge Validation & Comprehension Check
 * 5. Work Authorization & Task Access Unlock
 */

import { bootstrap as legacyBootstrap } from './bootstrap.js';
import { handlers as lessonHandlers } from './handlers/lessons.js';
import { ProjectHandler } from './handlers/projects.js';
import { InstanceHandler } from './handlers/instances.js';
import { logger } from './logger.js';

/**
 * Enhanced Role Hierarchy System
 * Implements enterprise organizational structure with clear reporting lines
 */
const ROLE_HIERARCHY = {
  'COO': {
    level: 5, // Highest authority
    authority: 'system-wide',
    reports_to: 'human',
    can_create: ['projects', 'tasks', 'instances', 'pm_assignments'],
    can_wake: ['PA', 'PM', 'Developer', 'Tester', 'Designer', 'Infrastructure', 'Architecture'],
    mandatory_lessons: ['operational-wisdom', 'critical-error-prevention', 'handoff-procedures', 'institutional-memory'],
    required_context: ['all_projects', 'team_status', 'critical_lessons', 'escalation_procedures']
  },
  'PA': {
    level: 4,
    authority: 'cross-project',
    reports_to: 'COO',
    can_create: ['tasks', 'messages', 'user_communication'],
    can_wake: ['PM', 'Developer', 'Tester', 'Designer'],
    mandatory_lessons: ['user-communication', 'priority-management', 'organizational-procedures'],
    required_context: ['assigned_projects', 'user_requests', 'priority_guidelines', 'communication_templates']
  },
  'PM': {
    level: 3,
    authority: 'project-scoped',
    reports_to: 'COO',
    can_create: ['tasks', 'project_updates', 'specialist_requests'],
    can_wake: ['Developer', 'Tester', 'Designer', 'Infrastructure', 'Architecture'],
    mandatory_lessons: ['project-management', 'timeline-management', 'quality-standards', 'specialist-coordination'],
    required_context: ['assigned_projects', 'project_plans', 'task_dependencies', 'specialist_capabilities']
  },
  'Developer': {
    level: 2,
    authority: 'implementation-scoped',
    reports_to: 'PM',
    can_create: ['code', 'technical_tasks', 'bug_reports'],
    can_wake: ['Tester'],
    mandatory_lessons: ['technical-standards', 'code-quality', 'testing-requirements', 'documentation-standards'],
    required_context: ['assigned_tasks', 'technical_specifications', 'code_standards', 'testing_requirements']
  },
  'Tester': {
    level: 2,
    authority: 'quality-scoped',
    reports_to: 'PM',
    can_create: ['test_reports', 'bug_reports', 'quality_assessments'],
    can_wake: [],
    mandatory_lessons: ['testing-methodologies', 'quality-standards', 'defect-reporting', 'validation-procedures'],
    required_context: ['test_assignments', 'quality_criteria', 'testing_frameworks', 'validation_procedures']
  },
  'Designer': {
    level: 2,
    authority: 'design-scoped',
    reports_to: 'PM',
    can_create: ['designs', 'prototypes', 'design_specifications'],
    can_wake: [],
    mandatory_lessons: ['design-principles', 'user-experience', 'design-systems', 'accessibility-standards'],
    required_context: ['design_assignments', 'design_systems', 'user_requirements', 'accessibility_guidelines']
  },
  'Infrastructure': {
    level: 2,
    authority: 'infrastructure-scoped', 
    reports_to: 'PM',
    can_create: ['deployments', 'infrastructure_tasks', 'system_monitoring'],
    can_wake: [],
    mandatory_lessons: ['deployment-procedures', 'system-monitoring', 'security-standards', 'backup-procedures'],
    required_context: ['infrastructure_assignments', 'deployment_procedures', 'monitoring_systems', 'security_protocols']
  },
  'Architecture': {
    level: 2,
    authority: 'architecture-scoped',
    reports_to: 'PM', 
    can_create: ['architectural_designs', 'system_specifications', 'technical_documentation'],
    can_wake: [],
    mandatory_lessons: ['architectural-patterns', 'system-design', 'scalability-principles', 'integration-patterns'],
    required_context: ['architecture_assignments', 'system_requirements', 'architectural_patterns', 'integration_specifications']
  }
};

/**
 * Enhanced Bootstrap State Machine
 * Tracks progression through mandatory phases
 */
const BOOTSTRAP_PHASES = {
  UNREGISTERED: 'unregistered',
  ROLE_VALIDATED: 'role_validated',
  LESSONS_REQUIRED: 'lessons_required', 
  LESSONS_ACKNOWLEDGED: 'lessons_acknowledged',
  PROJECT_ASSIGNMENT_REQUIRED: 'project_assignment_required',
  PROJECT_ATTACHED: 'project_attached',
  KNOWLEDGE_VALIDATION_REQUIRED: 'knowledge_validation_required',
  WORK_AUTHORIZED: 'work_authorized'
};

/**
 * Bootstrap State Manager
 * Tracks instance progression through onboarding phases
 */
class BootstrapStateManager {
  constructor() {
    this.instanceStates = new Map();
  }

  /**
   * Initialize or get bootstrap state for instance
   */
  async initializeState(instanceId, role) {
    if (!this.instanceStates.has(instanceId)) {
      const state = {
        instance_id: instanceId,
        role: role,
        current_phase: BOOTSTRAP_PHASES.UNREGISTERED,
        started_at: new Date().toISOString(),
        phase_history: [],
        lessons_acknowledged: [],
        project_assignments: [],
        validation_results: {},
        work_authorized: false
      };
      this.instanceStates.set(instanceId, state);
    }
    return this.instanceStates.get(instanceId);
  }

  /**
   * Progress instance to next phase with validation
   */
  async progressPhase(instanceId, newPhase, validationData = {}) {
    const state = this.instanceStates.get(instanceId);
    if (!state) {
      throw new Error(`Instance ${instanceId} not found in bootstrap state`);
    }

    // Record phase transition
    state.phase_history.push({
      from: state.current_phase,
      to: newPhase,
      timestamp: new Date().toISOString(),
      validation_data: validationData
    });

    state.current_phase = newPhase;
    state.last_updated = new Date().toISOString();

    await logger.info(`Bootstrap phase progression: ${instanceId} -> ${newPhase}`);
    return state;
  }

  /**
   * Check if instance is authorized for work
   */
  isWorkAuthorized(instanceId) {
    const state = this.instanceStates.get(instanceId);
    return state && state.current_phase === BOOTSTRAP_PHASES.WORK_AUTHORIZED;
  }

  /**
   * Get current bootstrap state
   */
  getState(instanceId) {
    return this.instanceStates.get(instanceId);
  }
}

// Singleton state manager
const stateManager = new BootstrapStateManager();

/**
 * Enhanced Bootstrap Function - Enterprise Grade Onboarding
 * Implements mandatory phases with knowledge validation
 * 
 * @param {Object} options - Bootstrap options
 * @param {string} options.role - Instance role (required)
 * @param {string} options.instanceId - Instance identifier (required)
 * @param {string} options.phase - Specific phase to execute (optional)
 * @param {Object} options.validation_data - Phase-specific validation data
 * @returns {Object} Bootstrap response with phase progression
 */
export async function enhancedBootstrap(options = {}) {
  const { role, instanceId, phase = null, validation_data = {} } = options;

  if (!role || !instanceId) {
    throw new Error('Role and instanceId are required for enhanced bootstrap');
  }

  try {
    // Initialize bootstrap state
    const state = await stateManager.initializeState(instanceId, role);
    await logger.info(`Enhanced bootstrap initiated: ${instanceId} (${role}) - Phase: ${state.current_phase}`);

    // Execute appropriate phase
    switch (state.current_phase) {
      case BOOTSTRAP_PHASES.UNREGISTERED:
        return await executeRoleValidationPhase(state, options);
      
      case BOOTSTRAP_PHASES.ROLE_VALIDATED:
        return await executeMandatoryLessonsPhase(state, options);
      
      case BOOTSTRAP_PHASES.LESSONS_REQUIRED:
        if (phase === 'acknowledge_lessons') {
          return await acknowledgeLessonsPhase(state, validation_data);
        }
        return await showRequiredLessons(state);
      
      case BOOTSTRAP_PHASES.LESSONS_ACKNOWLEDGED:
        return await executeProjectAttachmentPhase(state, options);
      
      case BOOTSTRAP_PHASES.PROJECT_ASSIGNMENT_REQUIRED:
        if (phase === 'attach_project') {
          return await attachProjectPhase(state, validation_data);
        }
        return await showProjectSelectionPhase(state);
      
      case BOOTSTRAP_PHASES.PROJECT_ATTACHED:
        return await executeKnowledgeValidationPhase(state, options);
      
      case BOOTSTRAP_PHASES.KNOWLEDGE_VALIDATION_REQUIRED:
        if (phase === 'validate_knowledge') {
          return await validateKnowledgePhase(state, validation_data);
        }
        return await showKnowledgeValidationRequirements(state);
      
      case BOOTSTRAP_PHASES.WORK_AUTHORIZED:
        return await provideWorkAuthorizedContext(state, options);
      
      default:
        throw new Error(`Unknown bootstrap phase: ${state.current_phase}`);
    }

  } catch (error) {
    await logger.error(`Enhanced bootstrap failed for ${instanceId}:`, error.message);
    
    // Fallback to legacy bootstrap on error
    await logger.info(`Falling back to legacy bootstrap for ${instanceId}`);
    return await legacyBootstrap(options);
  }
}

/**
 * Phase 1: Role Validation and Hierarchy Registration
 */
async function executeRoleValidationPhase(state, options) {
  const { role, instanceId } = options;

  // Validate role exists in hierarchy
  if (!ROLE_HIERARCHY[role]) {
    throw new Error(`Unknown role: ${role}. Valid roles: ${Object.keys(ROLE_HIERARCHY).join(', ')}`);
  }

  const roleConfig = ROLE_HIERARCHY[role];
  
  // Register instance in system
  await InstanceHandler.registerInstance({
    instanceId,
    role,
    capabilities: roleConfig.can_create,
    metadata: {
      authority_level: roleConfig.authority,
      hierarchy_level: roleConfig.level,
      reports_to: roleConfig.reports_to,
      bootstrap_phase: BOOTSTRAP_PHASES.ROLE_VALIDATED
    }
  });

  // Progress to next phase
  await stateManager.progressPhase(instanceId, BOOTSTRAP_PHASES.ROLE_VALIDATED, {
    role_config: roleConfig
  });

  return {
    success: true,
    phase: BOOTSTRAP_PHASES.ROLE_VALIDATED,
    message: `Role ${role} validated successfully. Proceeding to mandatory lesson learning.`,
    role_configuration: roleConfig,
    next_phase: {
      phase: BOOTSTRAP_PHASES.LESSONS_REQUIRED,
      description: 'Mandatory lesson learning phase',
      required_lessons: roleConfig.mandatory_lessons,
      blocking: true,
      instruction: 'You must read and acknowledge all mandatory lessons before proceeding.'
    }
  };
}

/**
 * Phase 2: Mandatory Lesson Learning (BLOCKING)
 */
async function executeMandatoryLessonsPhase(state, options) {
  const roleConfig = ROLE_HIERARCHY[state.role];
  const { mandatory_lessons } = roleConfig;

  // Get role-specific lessons from lesson system
  const lessonsResponse = await lessonHandlers.get_onboarding_lessons({
    role: state.role,
    limit: 50 // Get comprehensive lesson set
  });

  let requiredLessons = [];
  if (lessonsResponse.success && lessonsResponse.lessons) {
    // Filter lessons by mandatory categories
    requiredLessons = lessonsResponse.lessons.filter(lesson => 
      mandatory_lessons.some(category => 
        lesson.type?.includes(category) || 
        lesson.context?.toLowerCase().includes(category.toLowerCase())
      )
    );
  }

  // Add institutional lessons for all roles
  const institutionalLessons = await lessonHandlers.get_lessons({
    lesson_types: ['institutional-memory', 'critical-error-prevention'],
    min_confidence: 0.7,
    limit: 20
  });

  if (institutionalLessons.success && institutionalLessons.lessons) {
    requiredLessons = [...requiredLessons, ...institutionalLessons.lessons];
  }

  // Remove duplicates by content
  requiredLessons = requiredLessons.filter((lesson, index, arr) => 
    arr.findIndex(l => l.content === lesson.content) === index
  );

  // Progress to lessons required phase
  await stateManager.progressPhase(state.instance_id, BOOTSTRAP_PHASES.LESSONS_REQUIRED, {
    required_lessons: requiredLessons,
    lesson_categories: mandatory_lessons
  });

  return {
    success: true,
    phase: BOOTSTRAP_PHASES.LESSONS_REQUIRED,
    blocking: true,
    message: `🔒 MANDATORY LEARNING PHASE - You must read ${requiredLessons.length} critical lessons before proceeding.`,
    required_lessons: requiredLessons.map(lesson => ({
      id: lesson.id,
      type: lesson.type,
      content: lesson.content,
      confidence: lesson.confidence,
      context: lesson.context,
      importance: lesson.type?.includes('critical') ? 'CRITICAL' : 'HIGH'
    })),
    instruction: {
      step1: 'Read all lessons carefully - they contain critical operational knowledge',
      step2: 'When finished, call enhancedBootstrap with phase: "acknowledge_lessons"',
      step3: 'Include lesson_acknowledgments array with lesson IDs you have read',
      warning: '⚠️ You CANNOT proceed to work without completing this phase'
    },
    next_action: 'enhancedBootstrap({role, instanceId, phase: "acknowledge_lessons", validation_data: {lesson_acknowledgments: [...lesson_ids]}})'
  };
}

/**
 * Phase 2b: Acknowledge Lessons (Validation Step)
 */
async function acknowledgeLessonsPhase(state, validationData) {
  const { lesson_acknowledgments } = validationData;
  
  if (!lesson_acknowledgments || !Array.isArray(lesson_acknowledgments)) {
    throw new Error('lesson_acknowledgments array is required');
  }

  // Get required lessons from previous phase
  const lastPhase = state.phase_history[state.phase_history.length - 1];
  const requiredLessons = lastPhase.validation_data.required_lessons || [];
  const requiredIds = new Set(requiredLessons.map(l => l.id).filter(Boolean));

  // Validate acknowledgments
  const acknowledgedIds = new Set(lesson_acknowledgments);
  const missingAcknowledgments = [...requiredIds].filter(id => !acknowledgedIds.has(id));

  if (missingAcknowledgments.length > 0) {
    return {
      success: false,
      phase: BOOTSTRAP_PHASES.LESSONS_REQUIRED,
      error: {
        message: 'Incomplete lesson acknowledgment',
        missing_lessons: missingAcknowledgments,
        instruction: 'Please acknowledge all required lessons before proceeding'
      }
    };
  }

  // Record lesson acknowledgments
  state.lessons_acknowledged = lesson_acknowledgments;
  
  // Progress to project attachment phase
  await stateManager.progressPhase(state.instance_id, BOOTSTRAP_PHASES.LESSONS_ACKNOWLEDGED, {
    acknowledged_lessons: lesson_acknowledgments,
    acknowledgment_timestamp: new Date().toISOString()
  });

  return {
    success: true,
    phase: BOOTSTRAP_PHASES.LESSONS_ACKNOWLEDGED,
    message: `✅ Lessons acknowledged successfully. Proceeding to project attachment phase.`,
    acknowledged_count: lesson_acknowledgments.length,
    next_phase: {
      phase: BOOTSTRAP_PHASES.PROJECT_ASSIGNMENT_REQUIRED,
      description: 'Project attachment and context loading',
      instruction: 'You will now be assigned to projects based on your role and current needs.'
    }
  };
}

/**
 * Phase 3: Project Attachment and Context Loading
 */
async function executeProjectAttachmentPhase(state, options) {
  const roleConfig = ROLE_HIERARCHY[state.role];
  
  // Get available projects based on role authority
  const projectsResponse = await ProjectHandler.getProjects({
    status: 'active'
  });

  let availableProjects = [];
  if (projectsResponse.success) {
    availableProjects = projectsResponse.projects || [];
  }

  // Role-based project filtering
  if (state.role === 'PM' || state.role === 'Developer' || state.role === 'Tester' || state.role === 'Designer') {
    // Specialists should be assigned to specific projects
    availableProjects = availableProjects.filter(project => 
      project.status === 'active' && project.priority !== 'archived'
    );
  }

  // Progress to project assignment required
  await stateManager.progressPhase(state.instance_id, BOOTSTRAP_PHASES.PROJECT_ASSIGNMENT_REQUIRED, {
    available_projects: availableProjects,
    role_authority: roleConfig.authority
  });

  return {
    success: true,
    phase: BOOTSTRAP_PHASES.PROJECT_ASSIGNMENT_REQUIRED,
    message: `Project assignment required for ${state.role}`,
    available_projects: availableProjects.map(project => ({
      id: project.id,
      name: project.name,
      description: project.description,
      priority: project.priority,
      status: project.status,
      required_roles: project.metadata?.required_roles || []
    })),
    role_guidance: getRoleProjectGuidance(state.role),
    instruction: {
      automatic: state.role === 'COO' ? 'COO has access to all projects automatically' : false,
      manual_selection: state.role !== 'COO',
      next_action: state.role === 'COO' ? 
        'Proceeding automatically with system-wide access' : 
        'enhancedBootstrap({role, instanceId, phase: "attach_project", validation_data: {project_ids: [...selected_project_ids]}})'
    }
  };
}

/**
 * Get role-specific project guidance
 */
function getRoleProjectGuidance(role) {
  const guidance = {
    'COO': 'You have access to all projects and can create new ones. Focus on strategic oversight.',
    'PA': 'Select projects where you can assist with organization and user communication.',
    'PM': 'Choose projects that need active management and coordination.',
    'Developer': 'Select projects with active development tasks.',
    'Tester': 'Choose projects that need quality assurance and testing.',
    'Designer': 'Select projects requiring design work or user experience improvements.',
    'Infrastructure': 'Choose projects needing deployment, monitoring, or infrastructure work.',
    'Architecture': 'Select projects requiring system design or architectural planning.'
  };

  return guidance[role] || 'Select projects that match your expertise and availability.';
}

/**
 * Enhanced bootstrap function state manager and role hierarchy 
 * Continue in next part due to length...
 */

export { stateManager, ROLE_HIERARCHY, BOOTSTRAP_PHASES };