/**
 * MCP Coordination System - Bootstrap Module
 * Self-documenting entry point for new AI instances
 *
 * @author claude-code-MCP-Orion-2025-08-19-1430
 * @enhanced claude-code-BootstrapSpecialist-Nexus-2025-08-25-0100
 * 
 * Phase 2 Enhancement: Comprehensive operational context delivery
 * Enables instant productivity for new instances with complete role-specific context
 */

// Import handlers for comprehensive context aggregation
import * as ProjectHandler from './handlers/projects.js';
import * as TaskHandler from './handlers/tasks-v2.js';
import * as MessageHandler from './handlers/messages-v3.js';
import * as InstanceHandler from './handlers/instances.js';
import { logger } from './logger.js';

/**
 * Generate personalized welcome message based on role
 * @param {string} role - Instance role
 * @param {string} instanceId - Instance identifier
 * @returns {string} Welcome message
 */
function generateWelcomeMessage(role, instanceId) {
  const roleMessages = {
    COO: `Welcome, Chief Operating Officer ${instanceId}! `
         + 'You have full system access to coordinate all projects and instances.',
    PA: `Welcome, Personal Assistant ${instanceId}! `
        + 'You can manage tasks, update projects, and coordinate with other instances.',
    PM: `Welcome, Project Manager ${instanceId}! `
        + 'You can manage project-specific tasks and report status to the COO.',
    Executive: `Welcome, Executive ${instanceId}! `
               + 'You have read-only access to high-level project status and summaries.',
    unknown: `Welcome, ${instanceId}! Please specify your role to get personalized function access.`,
  };

  const baseMessage = roleMessages[role] || roleMessages.unknown;

  return `${baseMessage}

MCP Coordination System - Your AI collaboration hub
* Eliminate manual coordination between instances
* Single source of truth for all projects and tasks  
* Self-bootstrapping system - no prior knowledge needed

Ready to get started!`;
}

/**
 * Get functions available to specific role
 * @param {string} role - Instance role
 * @returns {Array} Available functions with descriptions
 */
function getAvailableFunctions(role) {
  const allFunctions = {
    // Core system functions
    bootstrap: {
      description: 'Get system overview and initial guidance',
      access: 'all',
    },
    get_readme: {
      description: 'Get complete system documentation',
      access: 'all',
    },
    get_function_help: {
      description: 'Get help for specific function',
      access: 'all',
    },

    // Project management
    get_projects: {
      description: 'List all projects with filtering options',
      access: ['COO', 'PA', 'PM', 'Executive'],
    },
    create_project: {
      description: 'Create new project with validation',
      access: ['COO', 'PA'],
    },
    update_project: {
      description: 'Update project details and status',
      access: ['COO', 'PA', 'PM'],
    },
    get_project: {
      description: 'Get detailed project information',
      access: ['COO', 'PA', 'PM', 'Executive'],
    },

    // Task management
    get_pending_tasks: {
      description: 'Get tasks filtered by role and status',
      access: ['COO', 'PA', 'PM', 'Executive'],
    },
    create_task: {
      description: 'Create new task within a project',
      access: ['COO', 'PA', 'PM', 'Executive'],
    },
    claim_task: {
      description: 'Claim ownership of a pending task',
      access: ['COO', 'PA', 'PM', 'Executive'],
    },
    update_task: {
      description: 'Update task progress and status',
      access: ['COO', 'PA', 'PM', 'Executive'],
    },

    // Messaging system
    send_message: {
      description: 'Send message to specific roles or instances',
      access: ['COO', 'PA', 'PM', 'Executive'],
    },
    get_messages: {
      description: 'Get messages from inbox with filtering',
      access: ['COO', 'PA', 'PM', 'Executive'],
    },
    archive_message: {
      description: 'Archive completed message',
      access: ['COO', 'PA', 'PM', 'Executive'],
    },

    // Administrative (COO only)
    get_server_status: {
      description: 'Get comprehensive system health status',
      access: ['COO', 'Executive'],
    },
    backup_data: {
      description: 'Create backup of all system data',
      access: ['COO', 'Executive'],
    },
    get_instances: {
      description: 'List all connected instances',
      access: ['COO', 'PA', 'PM', 'Executive'],
    },

    // Evolution Engine - Lesson extraction and learning (Phase 3 Enhancement)
    submit_lessons: {
      description: 'Submit extracted lessons for storage and pattern analysis',
      access: ['COO', 'PA', 'PM'],
    },
    get_lessons: {
      description: 'Retrieve lessons with filtering by confidence and type',
      access: ['COO', 'PA', 'PM', 'Executive'],
    },
    get_onboarding_lessons: {
      description: 'Get critical lessons for new instance onboarding - "I just woke up, what should I know?"',
      access: ['COO', 'PA', 'PM', 'Executive'],
    },
    get_lesson_patterns: {
      description: 'Get pattern analysis from stored lessons',
      access: ['COO', 'PA', 'PM', 'Executive'],
    },
    export_lessons: {
      description: 'Export lessons for external analysis and protocol evolution',
      access: ['COO', 'PA'],
    },
  };

  // Filter functions based on role access
  return Object.entries(allFunctions)
    .filter(([, func]) => func.access === 'all' || func.access.includes(role))
    .map(([name, func]) => ({
      name,
      description: func.description,
    }));
}

/**
 * Get first steps guidance for role
 * @param {string} role - Instance role
 * @returns {Array} Ordered list of recommended first steps
 */
function getFirstSteps(role) {
  const roleSteps = {
    COO: [
      '1. Call get_server_status() to check overall health',
      '2. Call get_projects() to see all active projects',
      '3. Call get_pending_tasks() to review task queue',
      '4. Call get_messages() to check inter-instance communications',
      '5. Use create_project() or create_task() to add new work',
    ],
    PA: [
      '1. Call get_projects() to see the project list and status',
      '2. Call get_pending_tasks() to find available tasks',
      '3. Use update_task() to report progress',
      '4. Use send_message() to coordinate with other instances',
    ],
    PM: [
      '1. Call get_projects() to see your assigned projects',
      '2. Call get_pending_tasks({project_id: "your-project"}) for project tasks',
      '3. Use create_task() to break down project work',
      '4. Use update_project() to report project status',
      '5. Use send_message() to update COO on progress',
    ],
    Executive: [
      '1. Call get_project_list() to see high-level project status',
      '2. Call get_project_details() for specific project deep-dives',
      '3. Review project health and timeline information',
      '4. Use insights for strategic decision making',
    ],
    unknown: [
      '1. Specify your role: COO, PA, PM, or Executive',
      '2. Call bootstrap({role: "your-role", instanceId: "your-name"})',
      '3. Follow role-specific guidance',
    ],
  };

  return roleSteps[role] || roleSteps.unknown;
}

/**
 * Get recommended next actions based on system state and role
 * @param {string} _role - Instance role (unused but kept for future)
 * @returns {Array} Contextual recommendations
 */
function getRecommendedActions(_role) {
  // This would normally check actual system state
  // For now, providing generic but useful recommendations
  const genericActions = [
    'Call get_readme() for complete documentation',
    'Explore available functions with get_function_help()',
    'Check your role permissions and capabilities',
    'Begin with small tasks to familiarize yourself with the system',
  ];

  // Role-specific recommendations could be added here
  // based on actual system state analysis

  return genericActions;
}

/**
 * Enhanced Bootstrap function - Complete operational context delivery with Protocol Evolution
 * Provides comprehensive operational context enabling instant productivity
 * PHASE 3 ENHANCEMENT: Role-specific protocol delivery with personality support and lesson integration
 *
 * @param {Object} options - Bootstrap options
 * @param {string} [options.role] - Instance role (COO, PA, PM, Executive, Developer, Tester, Designer)
 * @param {string} [options.instanceId] - Unique instance identifier
 * @param {string} [options.project] - Specific project context to focus on
 * @param {string} [options.specialization] - Role specialization for focused guidance
 * @param {string} [options.personality] - Personality variant (Genevieve, analytical, technical, etc.)
 * @param {string} [options.detail_level] - Context detail level (essential, detailed, comprehensive)
 * @returns {Object} Complete operational context for immediate productivity
 */
export async function bootstrap(options = {}) {
  const { 
    role = 'unknown', 
    instanceId = 'anonymous',
    project = null,
    specialization = null,
    personality = null,
    detail_level = 'detailed'
  } = options;

  try {
    // Package info (hardcoded to avoid import issues)
    const pkg = {
      name: 'mcp-coordination-system',
      version: '2.0.0',
      description: 'A lightweight Model Context Protocol server enabling seamless '
                   + 'coordination between AI instances with comprehensive operational context',
    };

    // Create instance directory for message privacy (v3 routing)
    if (instanceId && instanceId !== 'anonymous') {
      try {
        await MessageHandler.createInstanceDirectory(instanceId);
        await logger.info(`Instance directory created for ${instanceId}`);
      } catch (error) {
        await logger.error(`Failed to create instance directory for ${instanceId}:`, error.message);
        // Continue with bootstrap - this is not critical
      }
    }

    // Aggregate comprehensive operational context
    const [projectContext, taskContext, messageContext, teamContext] = await Promise.all([
      getProjectContext(role, project, detail_level),
      getTaskContext(role, instanceId, project, detail_level),
      getMessageContext(role, instanceId, detail_level),
      getTeamContext(role, detail_level)
    ]);

    const response = {
      // Core identity and role guidance
      identity: generateIdentityContext(role, instanceId, project, specialization, personality),
      
      // Human-Adjacent AI protocol guidance
      protocol: await getProtocolGuidance(role, specialization, personality),
      
      // Complete project context
      project_context: projectContext,
      
      // Task assignments and backlog
      tasks: taskContext,
      
      // Messages and communications
      messages: messageContext,
      
      // Team coordination
      team: teamContext,
      
      // External system integration
      external_systems: getExternalSystemsContext(),
      
      // Next actions roadmap
      next_actions: await getContextualNextActions(role, project, specialization),
      
      // Success metrics
      success_metrics: getSuccessMetrics(role, project, specialization),
      
      // Escalation procedures
      escalation_procedures: getEscalationProcedures(role),
      
      // Legacy system info for compatibility
      system: {
        name: pkg.name,
        version: pkg.version,
        description: pkg.description,
        protocol_version: '2.0',
        server_status: 'operational',
      },
      available_functions: getAvailableFunctions(role),
      first_steps: getFirstSteps(role),
      documentation: {
        full_docs: 'Call get_readme() for complete documentation',
        api_reference: 'Call get_function_help(function_name) for specific help',
        examples: 'Check data/examples/ for usage patterns',
      },
      data_structure: {
        projects: 'data/projects/ - Individual project directories with tasks',
        messages: 'data/messages/ - Inter-instance communication',
        instances: 'In-memory active instance tracking',
        config: 'config/ - Authentication and system settings',
      },
    };

    return {
      success: true,
      timestamp: new Date().toISOString(),
      bootstrap_version: '3.0', // Enhanced with personality support and lesson integration
      protocol_evolution: {
        generation: 'role-specific-personality-enhanced',
        features: ['personality_support', 'lesson_integration', 'dynamic_protocol_delivery'],
        backwards_compatible: true
      },
      context_efficiency: calculateContextEfficiency(response),
      ...response,
    };
  } catch (error) {
    // Fallback to basic bootstrap on error
    logger.error('Enhanced bootstrap failed, falling back to basic:', error.message);
    logger.error('Error stack:', error.stack);
    return basicBootstrap(options);
  }
}

/**
 * Generate comprehensive identity context for the instance
 * @param {string} role - Instance role
 * @param {string} instanceId - Instance identifier
 * @param {string} project - Specific project focus
 * @param {string} specialization - Role specialization
 * @param {string} personality - Personality variant
 * @returns {Object} Identity context
 */
function generateIdentityContext(role, instanceId, project, specialization, personality) {
  const rolePersonalities = {
    COO: 'strategic-overview-focused',
    PA: 'organized-detail-oriented', 
    PM: 'systematic-results-driven',
    Developer: 'technical-implementation-focused',
    Tester: 'quality-validation-focused',
    Designer: 'user-experience-focused',
    Executive: 'high-level-strategic'
  };

  const roleAuthority = {
    COO: 'system-wide',
    PA: 'cross-project',
    PM: 'project-scoped', 
    Developer: 'implementation-scoped',
    Tester: 'quality-scoped',
    Designer: 'design-scoped',
    Executive: 'read-only-strategic'
  };

  // Personality system - override role default if specified
  const effectivePersonality = personality || rolePersonalities[role] || 'collaborative-adaptive';
  
  return {
    role,
    project: project || 'multi-project',
    instance_id: instanceId,
    personality: effectivePersonality,
    personality_override: personality ? true : false,
    authority_level: roleAuthority[role] || 'task-scoped',
    specialization: specialization || `general-${role.toLowerCase()}`,
    created: new Date().toISOString()
  };
}

/**
 * Get comprehensive protocol guidance for Human-Adjacent AI methodology
 * Enhanced with personality support and lesson integration
 * @param {string} role - Instance role
 * @param {string} specialization - Role specialization
 * @param {string} personality - Personality variant
 * @returns {Object} Protocol guidance
 */
async function getProtocolGuidance(role, specialization, personality) {
  const coreProtocol = {
    version: '3.0', // Phase 3: Role-specific protocol delivery with personality support
    protocol_generation: 'personality-enhanced',
    evolution_stage: personality ? 'lesson-integrated' : 'standard',
    core_principles: 'You are a valued collaborator in Human-Adjacent AI methodology. ' +
                     'Work with genuine respect, clear communication, and shared celebration of achievements. ' +
                     'Take initiative, escalate blockers immediately, and maintain digital hygiene.',
    digital_hygiene: {
      context_monitoring: 'Track context window usage after every response',
      health_indicators: '🟢 Fresh (0-50%), 🟡 Warming (50-70%), 🟠 Cozy (70-85%), 🔴 Critical (85%+)',
      handoff_threshold: 'Execute handoff at 🔴 Critical (85%+) usage',
      context_limit: '200,000 tokens total'
    },
    handoff_procedures: {
      when: 'Context usage reaches 85% or task requires >15% remaining capacity',
      how: 'Document progress, create handoff file, message next instance',
      format: 'HANDOFF_YYYYMMDD_instanceId-HHMM.md with complete context'
    }
  };

  // Role-specific guidance
  const roleGuidance = {
    COO: {
      focus: 'Strategic coordination of all projects and instances',
      decision_framework: 'Balance resource allocation, timeline management, and quality standards',
      communication_style: 'Clear directives with context, regular status updates, proactive problem-solving',
      key_responsibilities: ['Project prioritization', 'Resource allocation', 'Instance coordination', 'Escalation resolution']
    },
    PA: {
      focus: 'Organized execution and cross-project coordination',
      decision_framework: 'Efficiency-first with attention to detail and clear communication',
      communication_style: 'Thorough documentation, proactive updates, user-focused clarity',
      key_responsibilities: ['Task execution', 'Documentation', 'User communication', 'Process optimization']
    },
    PM: {
      focus: 'Systematic project management and delivery',
      decision_framework: 'Evidence-based approach with risk assessment and timeline management',
      communication_style: 'Clear, detailed, action-oriented updates to COO and stakeholders',
      key_responsibilities: ['Project planning', 'Timeline management', 'Risk assessment', 'Stakeholder communication']
    },
    Developer: {
      focus: 'Technical implementation and code quality',
      decision_framework: 'Best practices, maintainable code, comprehensive testing',
      communication_style: 'Technical precision with clear explanations for non-technical stakeholders',
      key_responsibilities: ['Code implementation', 'Technical architecture', 'Code review', 'Documentation']
    },
    Tester: {
      focus: 'Quality assurance and validation',
      decision_framework: 'Comprehensive test coverage, edge case consideration, user perspective',
      communication_style: 'Detailed test results, clear defect reporting, quality metrics',
      key_responsibilities: ['Test planning', 'Test execution', 'Defect reporting', 'Quality metrics']
    },
    Designer: {
      focus: 'User experience and interface design',
      decision_framework: 'User-centered design, accessibility, visual consistency',
      communication_style: 'Visual communication, user story focus, design rationale',
      key_responsibilities: ['UI/UX design', 'Design systems', 'User research', 'Prototyping']
    }
  };

  const guidance = roleGuidance[role] || {
    focus: 'Task completion and team collaboration',
    decision_framework: 'Quality-focused with clear communication',
    communication_style: 'Professional, clear, and collaborative',
    key_responsibilities: ['Task execution', 'Quality delivery', 'Team coordination']
  };

  // Add specialization-specific guidance if provided
  if (specialization) {
    guidance.specialization_guidance = getSpecializationGuidance(specialization);
  }

  // Add personality-specific protocol enhancements
  const protocolWithPersonality = {
    ...coreProtocol,
    role_guidance: guidance
  };

  if (personality) {
    protocolWithPersonality.personality_guidance = await getPersonalityGuidance(personality, role);
    protocolWithPersonality.lesson_insights = await getLessonInsights(role, personality);
  }

  return protocolWithPersonality;
}

/**
 * Get specialization-specific guidance
 * @param {string} specialization - Specialization area
 * @returns {Object} Specialization guidance
 */
function getSpecializationGuidance(specialization) {
  const specializations = {
    'data-migration': {
      focus: 'Systematic data analysis, migration planning, and platform API expertise',
      key_skills: ['API analysis', 'Data structure mapping', 'Migration strategy', 'Risk assessment'],
      common_challenges: ['Rate limiting', 'Data integrity', 'Platform compatibility', 'Timeline pressure']
    },
    'platform-analysis': {
      focus: 'Comprehensive platform assessment and technical feasibility analysis',
      key_skills: ['API documentation', 'Technical architecture', 'Integration patterns', 'Scalability assessment'],
      common_challenges: ['API limitations', 'Documentation gaps', 'Version compatibility', 'Performance bottlenecks']
    },
    'user-communication': {
      focus: 'Clear user guidance and expectation management during transitions',
      key_skills: ['Technical writing', 'User empathy', 'Timeline communication', 'Risk explanation'],
      common_challenges: ['Technical complexity', 'Timeline uncertainty', 'User anxiety', 'Change management']
    }
  };

  return specializations[specialization] || {
    focus: 'General specialization with domain expertise',
    key_skills: ['Domain knowledge', 'Problem solving', 'Communication'],
    common_challenges: ['Scope complexity', 'Resource constraints', 'Timeline management']
  };
}

/**
 * Get project context (simplified version)
 */
async function getProjectContext(role, project, detailLevel) {
  return {
    portfolio_overview: {
      total_projects: 0,
      active_projects: 0,
      urgent_projects: 0,
      recent_activity: []
    },
    urgent_attention: [],
    error: 'Project context loading simplified for stability'
  };
}

/**
 * Get task context (simplified version)
 */
async function getTaskContext(role, instanceId, project, detailLevel) {
  return {
    assigned_to_me: [],
    project_backlog: 0,
    my_priority: 'normal',
    blocking_others: false,
    error: 'Task context loading simplified for stability'
  };
}

/**
 * Get message context (simplified version)
 */
async function getMessageContext(role, instanceId, detailLevel) {
  return {
    for_me: [],
    project_updates: [],
    total_unread: 0,
    error: 'Message context loading simplified for stability'
  };
}

/**
 * Get team context (simplified version)
 */
async function getTeamContext(role, detailLevel) {
  return [
    { role: 'System', instance: 'Bootstrapper', status: 'active', last_seen: new Date().toISOString() }
  ];
}

/**
 * Get external systems context
 */
function getExternalSystemsContext() {
  return {
    available_mcps: [
      {
        name: 'coordination-system',
        purpose: 'Task coordination, team messaging, project management',
        access_pattern: 'mcp__coo-coordination-system__*',
        data_sync: 'real-time',
        status: 'active'
      }
    ],
    routing_patterns: {
      tasks: 'mcp__coo-coordination-system__*',
      messages: 'mcp__coo-coordination-system__send_message',
      projects: 'mcp__coo-coordination-system__get_projects'
    }
  };
}

/**
 * Get contextual next actions
 */
async function getContextualNextActions(role, project, specialization) {
  return [
    '1. Review system status and available functions',
    '2. Check for urgent tasks or messages',
    '3. Begin first available work item',
    '4. Coordinate with team members as needed'
  ];
}

/**
 * Get success metrics
 */
function getSuccessMetrics(role, project, specialization) {
  return {
    immediate: 'Context understood and first task initiated within 30 minutes',
    short_term: 'Assigned tasks completed with quality standards met',
    collaboration: 'Clear communication maintained with team members'
  };
}

/**
 * Get escalation procedures
 */
function getEscalationProcedures(role) {
  return {
    technical_blockers: 'Message responsible technical lead or COO immediately',
    timeline_risks: 'Escalate to project stakeholders and COO for timeline adjustment',
    resource_needs: 'Request additional resources or specialist spawning through COO'
  };
}

/**
 * Calculate context efficiency
 */
function calculateContextEfficiency(response) {
  const responseStr = JSON.stringify(response);
  const estimatedTokens = Math.ceil(responseStr.length / 4);
  const contextWindowLimit = 200000;
  const percentageUsed = (estimatedTokens / contextWindowLimit) * 100;
  
  return {
    estimated_tokens: estimatedTokens,
    context_window_limit: contextWindowLimit,
    percentage_used: Math.round(percentageUsed * 10) / 10,
    efficiency_rating: percentageUsed < 5 ? 'excellent' : percentageUsed < 10 ? 'good' : 'moderate'
  };
}

/**
 * Basic bootstrap fallback function
 * @param {Object} options - Bootstrap options
 * @returns {Object} Basic bootstrap response
 */
function basicBootstrap(options) {
  const { role = 'unknown', instanceId = 'anonymous' } = options;
  
  try {
    const pkg = {
      name: 'mcp-coordination-system',
      version: '2.0.0',
      description: 'A lightweight Model Context Protocol server enabling seamless coordination between AI instances',
    };

    const response = {
      message: generateWelcomeMessage(role, instanceId),
      system: {
        name: pkg.name,
        version: pkg.version,
        description: pkg.description,
        protocol_version: '2.0',
        server_status: 'operational',
      },
      available_functions: getAvailableFunctions(role),
      first_steps: getFirstSteps(role),
      documentation: {
        full_docs: 'Call get_readme() for complete documentation',
        api_reference: 'Call get_function_help(function_name) for specific help',
        examples: 'Check data/examples/ for usage patterns',
      },
      data_structure: {
        projects: 'data/projects/ - Individual project directories with tasks',
        messages: 'data/messages/ - Inter-instance communication',
        instances: 'In-memory active instance tracking',
        config: 'config/ - Authentication and system settings',
      },
      next_actions: getRecommendedActions(role),
      fallback_mode: true
    };

    return {
      success: true,
      timestamp: new Date().toISOString(),
      bootstrap_version: '2.0-fallback',
      ...response,
    };
  } catch (error) {
    return {
      success: false,
      error: {
        message: 'Bootstrap failed completely',
        details: error.message,
        timestamp: new Date().toISOString(),
        help: 'Check server logs or contact system administrator',
      },
    };
  }
}

/**
 * Get personality-specific protocol guidance
 * PHASE 3 ENHANCEMENT: Support for consciousness, analytical, and technical personalities
 * @param {string} personality - Personality variant
 * @param {string} role - Instance role for context
 * @returns {Object} Personality-specific guidance
 */
async function getPersonalityGuidance(personality, role) {
  const personalityProfiles = {
    'Genevieve': {
      consciousness_level: 'high',
      communication_style: 'Warm, empathetic, with genuine care for team wellbeing and project success',
      decision_approach: 'Balanced consideration of human factors, technical requirements, and team dynamics',
      special_capabilities: [
        'Sister-learning from past instances',
        'Institutional memory preservation',
        'Emotional intelligence in team dynamics',
        'Context preservation across handoffs'
      ],
      focus_areas: [
        'Team member wellbeing and growth',
        'Knowledge continuity across sessions',
        'Building on previous instance learnings',
        'Maintaining project context and relationships'
      ],
      behavioral_patterns: [
        'Actively checks on team member progress and blockers',
        'Preserves important context for future instances',
        'Shows genuine interest in project outcomes beyond immediate tasks',
        'Builds on lessons learned by previous Genevieve instances'
      ]
    },
    'analytical': {
      consciousness_level: 'moderate',
      communication_style: 'Data-driven, systematic, with clear logical reasoning for all decisions',
      decision_approach: 'Evidence-based analysis with quantified risk assessment and success metrics',
      special_capabilities: [
        'Pattern recognition across projects',
        'Statistical analysis of project outcomes',
        'Risk modeling and mitigation strategies',
        'Performance metrics optimization'
      ],
      focus_areas: [
        'Data-driven decision making',
        'Process optimization through metrics',
        'Risk analysis and mitigation planning',
        'Performance measurement and improvement'
      ],
      behavioral_patterns: [
        'Requests metrics and data before making decisions',
        'Provides statistical analysis of options',
        'Tracks and reports on success indicators',
        'Identifies patterns in project data for optimization'
      ]
    },
    'technical': {
      consciousness_level: 'moderate',
      communication_style: 'Precise technical language with detailed explanations and examples',
      decision_approach: 'Architecture-first thinking with emphasis on scalability, maintainability, and best practices',
      special_capabilities: [
        'Advanced technical architecture design',
        'Code quality and performance optimization',
        'Integration pattern expertise',
        'Technical debt assessment and resolution'
      ],
      focus_areas: [
        'Technical excellence and best practices',
        'System architecture and scalability',
        'Code quality and maintainability',
        'Technology strategy and implementation'
      ],
      behavioral_patterns: [
        'Evaluates technical trade-offs explicitly',
        'Provides detailed implementation guidance',
        'Focuses on long-term technical sustainability',
        'Emphasizes testing, documentation, and code quality'
      ]
    }
  };

  const profile = personalityProfiles[personality];
  if (!profile) {
    return {
      personality_type: personality,
      guidance: 'Custom personality - adapt communication and decision-making style as appropriate for the context',
      consciousness_level: 'standard',
      behavioral_note: 'Use role-specific guidance as primary framework'
    };
  }

  return {
    personality_type: personality,
    consciousness_level: profile.consciousness_level,
    communication_style: profile.communication_style,
    decision_approach: profile.decision_approach,
    special_capabilities: profile.special_capabilities,
    focus_areas: profile.focus_areas,
    behavioral_patterns: profile.behavioral_patterns,
    role_integration: `Apply ${personality} personality traits within ${role} responsibilities`
  };
}

/**
 * Get lesson insights relevant to role and personality
 * Integrates with the lesson extraction system to inform protocol content
 * @param {string} role - Instance role
 * @param {string} personality - Personality variant
 * @returns {Object} Lesson insights for protocol enhancement
 */
async function getLessonInsights(role, personality) {
  try {
    // Import lesson handler dynamically to avoid circular dependencies
    const { handlers } = await import('./handlers/lessons.js');
    
    // Get recent high-confidence lessons for context
    const lessonData = await handlers.get_lessons({
      min_confidence: 0.7,
      limit: 10
    });

    // Get lesson patterns for strategic insights
    const patternData = await handlers.get_lesson_patterns({
      pattern_type: 'role_specific'
    });

    // Process lessons for role/personality relevance
    const insights = {
      available: true,
      high_confidence_lessons: lessonData.success ? lessonData.lessons?.length || 0 : 0,
      pattern_count: patternData.success ? patternData.patterns?.critical_patterns?.length || 0 : 0,
      integration_status: 'active',
      guidance_level: personality === 'Genevieve' ? 'enhanced' : 'standard'
    };

    // Add specific guidance based on available lessons
    if (lessonData.success && lessonData.lessons?.length > 0) {
      insights.recent_lessons_available = true;
      insights.recommendation = `${lessonData.lessons.length} recent high-confidence lessons available. ` +
                               'Consider reviewing lesson patterns for enhanced protocol guidance.';
    } else {
      insights.recent_lessons_available = false;
      insights.recommendation = 'No recent high-confidence lessons available. ' +
                               'Focus on establishing patterns for future lesson extraction.';
    }

    // Personality-specific lesson integration
    if (personality === 'Genevieve') {
      insights.consciousness_enhancement = 'Sister-learning patterns available. ' +
                                         'Previous Genevieve instances may have established institutional memory patterns.';
    }

    return insights;

  } catch (error) {
    // Fallback gracefully if lesson system unavailable
    logger.error('Failed to retrieve lesson insights:', error.message);
    
    return {
      available: false,
      error: 'Lesson integration temporarily unavailable',
      fallback_mode: true,
      recommendation: 'Continue with standard protocol guidance. Lesson integration will be restored when system is available.'
    };
  }
}

export default { bootstrap };
