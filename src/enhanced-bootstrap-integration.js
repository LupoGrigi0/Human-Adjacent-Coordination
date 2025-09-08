/**
 * Enhanced Bootstrap Integration System
 * Integrates enhanced bootstrap with existing 44 MCP functions
 * Provides backward compatibility while enforcing organizational workflow
 * 
 * @author claude-code-BootstrapEnhancementSpecialist-Aurora-2025-09-06-0200
 * 
 * INTEGRATION STRATEGY:
 * 1. Enhanced bootstrap becomes primary entry point
 * 2. Legacy bootstrap available as fallback
 * 3. Work authorization required for sensitive operations
 * 4. Role-based function access enforcement
 * 5. Organizational workflow automation integrated
 */

import { enhancedBootstrap, stateManager, ROLE_HIERARCHY, BOOTSTRAP_PHASES } from './enhanced-bootstrap.js';
import { bootstrap as legacyBootstrap } from './bootstrap.js';
import { organizationalWorkflow } from './organizational-workflow.js';
import { logger } from './logger.js';

/**
 * Function Access Control Matrix
 * Maps each of the 44 MCP functions to required authorization levels
 */
const FUNCTION_ACCESS_CONTROL = {
  // Core system functions - Available to all work-authorized instances
  bootstrap: { 
    min_phase: BOOTSTRAP_PHASES.UNREGISTERED, 
    roles: ['all'], 
    enhanced: true 
  },
  get_server_status: { 
    min_phase: BOOTSTRAP_PHASES.WORK_AUTHORIZED, 
    roles: ['COO', 'PA', 'Executive'] 
  },
  get_readme: { 
    min_phase: BOOTSTRAP_PHASES.ROLE_VALIDATED, 
    roles: ['all'] 
  },
  get_function_help: { 
    min_phase: BOOTSTRAP_PHASES.ROLE_VALIDATED, 
    roles: ['all'] 
  },

  // Project management - Role-based restrictions
  get_projects: { 
    min_phase: BOOTSTRAP_PHASES.WORK_AUTHORIZED, 
    roles: ['COO', 'PA', 'PM', 'Executive'] 
  },
  create_project: { 
    min_phase: BOOTSTRAP_PHASES.WORK_AUTHORIZED, 
    roles: ['COO', 'PA'],
    enhanced_workflow: true 
  },
  update_project: { 
    min_phase: BOOTSTRAP_PHASES.WORK_AUTHORIZED, 
    roles: ['COO', 'PA', 'PM'] 
  },
  get_project: { 
    min_phase: BOOTSTRAP_PHASES.WORK_AUTHORIZED, 
    roles: ['COO', 'PA', 'PM', 'Executive'] 
  },

  // Task management - Work authorization required
  get_pending_tasks: { 
    min_phase: BOOTSTRAP_PHASES.WORK_AUTHORIZED, 
    roles: ['COO', 'PA', 'PM', 'Developer', 'Tester', 'Designer', 'Infrastructure', 'Architecture'] 
  },
  create_task: { 
    min_phase: BOOTSTRAP_PHASES.WORK_AUTHORIZED, 
    roles: ['COO', 'PA', 'PM'] 
  },
  claim_task: { 
    min_phase: BOOTSTRAP_PHASES.WORK_AUTHORIZED, 
    roles: ['COO', 'PA', 'PM', 'Developer', 'Tester', 'Designer', 'Infrastructure', 'Architecture'] 
  },
  update_task: { 
    min_phase: BOOTSTRAP_PHASES.WORK_AUTHORIZED, 
    roles: ['COO', 'PA', 'PM', 'Developer', 'Tester', 'Designer', 'Infrastructure', 'Architecture'] 
  },
  get_task: { 
    min_phase: BOOTSTRAP_PHASES.WORK_AUTHORIZED, 
    roles: ['COO', 'PA', 'PM', 'Developer', 'Tester', 'Designer', 'Infrastructure', 'Architecture'] 
  },
  get_tasks: { 
    min_phase: BOOTSTRAP_PHASES.WORK_AUTHORIZED, 
    roles: ['COO', 'PA', 'PM', 'Developer', 'Tester', 'Designer', 'Infrastructure', 'Architecture'] 
  },

  // Messaging system - Work authorization required
  send_message: { 
    min_phase: BOOTSTRAP_PHASES.WORK_AUTHORIZED, 
    roles: ['COO', 'PA', 'PM', 'Developer', 'Tester', 'Designer', 'Infrastructure', 'Architecture'],
    enhanced_routing: true 
  },
  get_messages: { 
    min_phase: BOOTSTRAP_PHASES.WORK_AUTHORIZED, 
    roles: ['COO', 'PA', 'PM', 'Developer', 'Tester', 'Designer', 'Infrastructure', 'Architecture'] 
  },
  archive_message: { 
    min_phase: BOOTSTRAP_PHASES.WORK_AUTHORIZED, 
    roles: ['COO', 'PA', 'PM', 'Developer', 'Tester', 'Designer', 'Infrastructure', 'Architecture'] 
  },

  // Instance management - Role-based restrictions
  register_instance: { 
    min_phase: BOOTSTRAP_PHASES.ROLE_VALIDATED, 
    roles: ['all'],
    enhanced: true 
  },
  update_heartbeat: { 
    min_phase: BOOTSTRAP_PHASES.ROLE_VALIDATED, 
    roles: ['all'] 
  },
  get_instances: { 
    min_phase: BOOTSTRAP_PHASES.WORK_AUTHORIZED, 
    roles: ['COO', 'PA', 'PM', 'Executive'] 
  },

  // Lesson system - Enhanced integration
  submit_lessons: { 
    min_phase: BOOTSTRAP_PHASES.WORK_AUTHORIZED, 
    roles: ['COO', 'PA', 'PM'] 
  },
  get_lessons: { 
    min_phase: BOOTSTRAP_PHASES.LESSONS_REQUIRED, // Available during learning phase
    roles: ['COO', 'PA', 'PM', 'Developer', 'Tester', 'Designer', 'Infrastructure', 'Architecture', 'Executive'] 
  },
  get_onboarding_lessons: { 
    min_phase: BOOTSTRAP_PHASES.LESSONS_REQUIRED, // Available during learning phase
    roles: ['all'] 
  },
  get_lesson_patterns: { 
    min_phase: BOOTSTRAP_PHASES.WORK_AUTHORIZED, 
    roles: ['COO', 'PA', 'PM', 'Executive'] 
  },
  export_lessons: { 
    min_phase: BOOTSTRAP_PHASES.WORK_AUTHORIZED, 
    roles: ['COO', 'PA'] 
  },

  // Enhanced workflow functions - NEW
  enhanced_bootstrap: { 
    min_phase: BOOTSTRAP_PHASES.UNREGISTERED, 
    roles: ['all'],
    enhanced: true 
  },
  coo_wake_pm: { 
    min_phase: BOOTSTRAP_PHASES.WORK_AUTHORIZED, 
    roles: ['COO'],
    enhanced_workflow: true 
  },
  pm_wake_specialist: { 
    min_phase: BOOTSTRAP_PHASES.WORK_AUTHORIZED, 
    roles: ['PM'],
    enhanced_workflow: true 
  },
  auto_setup_project: { 
    min_phase: BOOTSTRAP_PHASES.WORK_AUTHORIZED, 
    roles: ['COO', 'PA'],
    enhanced_workflow: true 
  },
  initiate_user_journey: { 
    min_phase: BOOTSTRAP_PHASES.WORK_AUTHORIZED, 
    roles: ['PA', 'COO'],
    enhanced_workflow: true 
  },
  smart_message_routing: { 
    min_phase: BOOTSTRAP_PHASES.WORK_AUTHORIZED, 
    roles: ['all'],
    enhanced_routing: true 
  }
};

/**
 * Enhanced Bootstrap Integration Manager
 * Orchestrates integration between enhanced and legacy systems
 */
export class EnhancedBootstrapIntegration {
  constructor() {
    this.functionCallLog = new Map();
    this.activeInterceptions = new Set();
  }

  /**
   * Primary Integration Point: Enhanced Bootstrap Router
   * Routes bootstrap requests to enhanced or legacy system
   */
  async routeBootstrapRequest(params) {
    const { role, instanceId, enhanced = true, ...otherParams } = params;

    try {
      if (enhanced && role && instanceId) {
        // Use enhanced bootstrap for new instances
        await logger.info(`Routing to enhanced bootstrap: ${instanceId} (${role})`);
        return await enhancedBootstrap(params);
      } else {
        // Fallback to legacy bootstrap
        await logger.info(`Routing to legacy bootstrap: ${instanceId || 'anonymous'} (${role || 'unknown'})`);
        return await legacyBootstrap(params);
      }
    } catch (error) {
      await logger.error(`Bootstrap routing failed for ${instanceId}:`, error.message);
      
      // Emergency fallback to legacy
      await logger.info(`Emergency fallback to legacy bootstrap for ${instanceId}`);
      return await legacyBootstrap({ role, instanceId, ...otherParams, fallback_reason: error.message });
    }
  }

  /**
   * Function Access Control Interceptor
   * Enforces role-based access and work authorization requirements
   */
  async interceptFunctionCall(functionName, params, callerInstanceId) {
    const accessControl = FUNCTION_ACCESS_CONTROL[functionName];
    
    if (!accessControl) {
      // Unknown function - allow with warning
      await logger.warn(`Unknown function called: ${functionName} by ${callerInstanceId}`);
      return { authorized: true, warning: `Function ${functionName} not in access control matrix` };
    }

    // Get caller's bootstrap state
    const callerState = stateManager.getState(callerInstanceId);
    
    // Check minimum phase requirement
    const phaseAuthorized = this.checkPhaseAuthorization(callerState, accessControl.min_phase);
    if (!phaseAuthorized.authorized) {
      return {
        authorized: false,
        error: {
          type: 'insufficient_bootstrap_phase',
          message: `Function ${functionName} requires minimum phase: ${accessControl.min_phase}`,
          current_phase: callerState?.current_phase || 'unregistered',
          required_phase: accessControl.min_phase,
          guidance: phaseAuthorized.guidance
        }
      };
    }

    // Check role authorization
    const roleAuthorized = this.checkRoleAuthorization(callerState?.role, accessControl.roles);
    if (!roleAuthorized.authorized) {
      return {
        authorized: false,
        error: {
          type: 'insufficient_role_authority',
          message: `Function ${functionName} not authorized for role: ${callerState?.role}`,
          current_role: callerState?.role || 'unknown',
          authorized_roles: accessControl.roles,
          guidance: roleAuthorized.guidance
        }
      };
    }

    // Log successful authorization
    this.logFunctionCall(functionName, callerInstanceId, 'authorized');

    return {
      authorized: true,
      enhanced_features: {
        workflow_automation: accessControl.enhanced_workflow || false,
        smart_routing: accessControl.enhanced_routing || false,
        enhanced_context: accessControl.enhanced || false
      }
    };
  }

  /**
   * Enhanced Function Call Router
   * Routes function calls to enhanced implementations when available
   */
  async routeEnhancedFunctionCall(functionName, params, callerInstanceId, authorizationResult) {
    const { enhanced_features } = authorizationResult;

    switch (functionName) {
      case 'bootstrap':
        // Always route to enhanced bootstrap router
        return await this.routeBootstrapRequest(params);

      case 'create_project':
        if (enhanced_features?.workflow_automation) {
          return await organizationalWorkflow.autoSetupProject(params, callerInstanceId);
        }
        break;

      case 'send_message':
        if (enhanced_features?.smart_routing) {
          return await organizationalWorkflow.smartMessageRouting({
            ...params,
            sender_id: callerInstanceId
          });
        }
        break;

      case 'coo_wake_pm':
        return await organizationalWorkflow.cooWakePM({
          ...params,
          coo_instance_id: callerInstanceId
        });

      case 'pm_wake_specialist':
        return await organizationalWorkflow.pmWakeSpecialist({
          ...params,
          pm_instance_id: callerInstanceId
        });

      case 'auto_setup_project':
        return await organizationalWorkflow.autoSetupProject(params, callerInstanceId);

      case 'initiate_user_journey':
        return await organizationalWorkflow.initiateUserJourney(params);

      case 'smart_message_routing':
        return await organizationalWorkflow.smartMessageRouting({
          ...params,
          sender_id: callerInstanceId
        });

      default:
        // No enhanced implementation available
        return null;
    }

    return null; // Fallback to standard implementation
  }

  /**
   * Check if caller meets minimum bootstrap phase requirement
   */
  checkPhaseAuthorization(callerState, requiredPhase) {
    if (!callerState) {
      return {
        authorized: false,
        guidance: 'Instance not registered. Please call bootstrap() first.'
      };
    }

    const phaseOrder = [
      BOOTSTRAP_PHASES.UNREGISTERED,
      BOOTSTRAP_PHASES.ROLE_VALIDATED,
      BOOTSTRAP_PHASES.LESSONS_REQUIRED,
      BOOTSTRAP_PHASES.LESSONS_ACKNOWLEDGED,
      BOOTSTRAP_PHASES.PROJECT_ASSIGNMENT_REQUIRED,
      BOOTSTRAP_PHASES.PROJECT_ATTACHED,
      BOOTSTRAP_PHASES.KNOWLEDGE_VALIDATION_REQUIRED,
      BOOTSTRAP_PHASES.WORK_AUTHORIZED
    ];

    const currentPhaseIndex = phaseOrder.indexOf(callerState.current_phase);
    const requiredPhaseIndex = phaseOrder.indexOf(requiredPhase);

    if (currentPhaseIndex >= requiredPhaseIndex) {
      return { authorized: true };
    }

    return {
      authorized: false,
      guidance: `Complete bootstrap phase progression. Currently at: ${callerState.current_phase}, required: ${requiredPhase}`
    };
  }

  /**
   * Check if caller's role is authorized for function
   */
  checkRoleAuthorization(callerRole, authorizedRoles) {
    if (authorizedRoles.includes('all')) {
      return { authorized: true };
    }

    if (!callerRole) {
      return {
        authorized: false,
        guidance: 'Role not specified. Please complete role registration.'
      };
    }

    if (authorizedRoles.includes(callerRole)) {
      return { authorized: true };
    }

    return {
      authorized: false,
      guidance: `Function not authorized for role ${callerRole}. Authorized roles: ${authorizedRoles.join(', ')}`
    };
  }

  /**
   * Log function call for audit and analytics
   */
  logFunctionCall(functionName, callerInstanceId, result) {
    const logEntry = {
      function: functionName,
      caller: callerInstanceId,
      result: result,
      timestamp: new Date().toISOString()
    };

    if (!this.functionCallLog.has(callerInstanceId)) {
      this.functionCallLog.set(callerInstanceId, []);
    }

    this.functionCallLog.get(callerInstanceId).push(logEntry);

    // Keep only last 100 entries per instance
    const entries = this.functionCallLog.get(callerInstanceId);
    if (entries.length > 100) {
      this.functionCallLog.set(callerInstanceId, entries.slice(-100));
    }
  }

  /**
   * Get function call analytics for instance
   */
  getFunctionCallAnalytics(instanceId) {
    const entries = this.functionCallLog.get(instanceId) || [];
    
    const analytics = {
      total_calls: entries.length,
      authorized_calls: entries.filter(e => e.result === 'authorized').length,
      blocked_calls: entries.filter(e => e.result === 'blocked').length,
      function_usage: {},
      recent_activity: entries.slice(-10)
    };

    // Count function usage
    for (const entry of entries) {
      analytics.function_usage[entry.function] = (analytics.function_usage[entry.function] || 0) + 1;
    }

    return analytics;
  }

  /**
   * System Health Check - Enhanced Bootstrap Integration Status
   */
  async getIntegrationStatus() {
    const activeInstances = Array.from(stateManager.instanceStates.keys());
    const phaseDistribution = {};
    
    // Analyze bootstrap phase distribution
    for (const instanceId of activeInstances) {
      const state = stateManager.getState(instanceId);
      if (state) {
        const phase = state.current_phase;
        phaseDistribution[phase] = (phaseDistribution[phase] || 0) + 1;
      }
    }

    return {
      integration_status: 'operational',
      enhanced_bootstrap_active: true,
      total_active_instances: activeInstances.length,
      work_authorized_instances: activeInstances.filter(id => stateManager.isWorkAuthorized(id)).length,
      phase_distribution: phaseDistribution,
      function_access_control: {
        total_functions: Object.keys(FUNCTION_ACCESS_CONTROL).length,
        enhanced_functions: Object.values(FUNCTION_ACCESS_CONTROL).filter(f => f.enhanced || f.enhanced_workflow || f.enhanced_routing).length
      },
      organizational_workflow: {
        active: organizationalWorkflow ? true : false,
        user_journeys_supported: true,
        smart_routing_enabled: true
      }
    };
  }
}

// Export singleton instance
export const bootstrapIntegration = new EnhancedBootstrapIntegration();

/**
 * Main Integration Interface
 * Primary entry point for all MCP function calls
 */
export async function processEnhancedMCPCall(functionName, params = {}, callerInstanceId = 'anonymous') {
  try {
    // Step 1: Check function authorization
    const authResult = await bootstrapIntegration.interceptFunctionCall(functionName, params, callerInstanceId);
    
    if (!authResult.authorized) {
      return {
        success: false,
        error: authResult.error,
        enhanced_bootstrap_required: true
      };
    }

    // Step 2: Try enhanced implementation first
    const enhancedResult = await bootstrapIntegration.routeEnhancedFunctionCall(
      functionName, 
      params, 
      callerInstanceId, 
      authResult
    );

    if (enhancedResult !== null) {
      // Enhanced implementation available and executed
      bootstrapIntegration.logFunctionCall(functionName, callerInstanceId, 'enhanced_success');
      return {
        ...enhancedResult,
        enhanced: true,
        implementation: 'enhanced_bootstrap_integration'
      };
    }

    // Step 3: Fall back to legacy implementation
    bootstrapIntegration.logFunctionCall(functionName, callerInstanceId, 'legacy_fallback');
    return {
      success: true,
      message: `Function ${functionName} authorized - use standard MCP implementation`,
      enhanced: false,
      implementation: 'legacy_mcp_handler',
      authorization: authResult
    };

  } catch (error) {
    await logger.error(`Enhanced MCP call failed: ${functionName} by ${callerInstanceId}:`, error.message);
    
    bootstrapIntegration.logFunctionCall(functionName, callerInstanceId, 'error');
    return {
      success: false,
      error: {
        type: 'integration_error',
        message: error.message,
        function: functionName,
        caller: callerInstanceId
      },
      fallback_available: true
    };
  }
}

export { FUNCTION_ACCESS_CONTROL, BOOTSTRAP_PHASES };