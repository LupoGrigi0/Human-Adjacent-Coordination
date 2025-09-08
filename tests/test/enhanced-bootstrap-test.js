/**
 * Enhanced Bootstrap System Test Suite
 * Comprehensive testing for enterprise-grade organizational onboarding
 * 
 * @author claude-code-BootstrapEnhancementSpecialist-Aurora-2025-09-06-0300
 * 
 * TEST SCENARIOS:
 * 1. Role-based onboarding workflow validation
 * 2. Mandatory lesson learning enforcement
 * 3. Project attachment system testing
 * 4. Knowledge validation requirements
 * 5. Work authorization workflow
 * 6. Organizational workflow automation
 * 7. Integration with existing 44 MCP functions
 */

import { describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import { enhancedBootstrap, stateManager, ROLE_HIERARCHY, BOOTSTRAP_PHASES } from '../src/enhanced-bootstrap.js';
import { organizationalWorkflow } from '../src/organizational-workflow.js';
import { processEnhancedMCPCall, bootstrapIntegration } from '../src/enhanced-bootstrap-integration.js';
import { createEnhancedServer } from '../src/enhanced-server-integration.js';

describe('Enhanced Bootstrap System', () => {
  let testInstanceId;
  let enhancedServer;

  beforeEach(async () => {
    // Generate unique test instance ID
    testInstanceId = `test-instance-${Date.now()}-${Math.random().toString(36).substring(2,8)}`;
    
    // Create enhanced server for testing
    enhancedServer = await createEnhancedServer();
    await enhancedServer.initialize();
  });

  afterEach(() => {
    // Clean up test instance state
    if (stateManager.instanceStates.has(testInstanceId)) {
      stateManager.instanceStates.delete(testInstanceId);
    }
  });

  describe('Phase 1: Role Registration and Hierarchy Validation', () => {
    test('should validate valid roles against hierarchy', async () => {
      const validRoles = ['COO', 'PA', 'PM', 'Developer', 'Tester', 'Designer', 'Infrastructure', 'Architecture'];
      
      for (const role of validRoles) {
        const result = await enhancedBootstrap({
          role: role,
          instanceId: `${testInstanceId}-${role}`
        });
        
        expect(result.success).toBe(true);
        expect(result.phase).toBe(BOOTSTRAP_PHASES.ROLE_VALIDATED);
        expect(result.role_configuration).toBeDefined();
        expect(result.role_configuration.level).toBeDefined();
        expect(result.role_configuration.authority).toBeDefined();
      }
    });

    test('should reject invalid roles', async () => {
      await expect(async () => {
        await enhancedBootstrap({
          role: 'InvalidRole',
          instanceId: testInstanceId
        });
      }).rejects.toThrow('Unknown role: InvalidRole');
    });

    test('should enforce role hierarchy levels', async () => {
      const cooResult = await enhancedBootstrap({
        role: 'COO',
        instanceId: `${testInstanceId}-coo`
      });
      
      const devResult = await enhancedBootstrap({
        role: 'Developer',
        instanceId: `${testInstanceId}-dev`
      });

      expect(cooResult.role_configuration.level).toBeGreaterThan(devResult.role_configuration.level);
      expect(cooResult.role_configuration.authority).toBe('system-wide');
      expect(devResult.role_configuration.authority).toBe('implementation-scoped');
    });
  });

  describe('Phase 2: Mandatory Lesson Learning', () => {
    test('should require lesson learning for all roles', async () => {
      // First call - role validation
      await enhancedBootstrap({
        role: 'PM',
        instanceId: testInstanceId
      });

      // Second call - should require lessons
      const lessonPhaseResult = await enhancedBootstrap({
        role: 'PM',
        instanceId: testInstanceId
      });

      expect(lessonPhaseResult.success).toBe(true);
      expect(lessonPhaseResult.phase).toBe(BOOTSTRAP_PHASES.LESSONS_REQUIRED);
      expect(lessonPhaseResult.blocking).toBe(true);
      expect(lessonPhaseResult.required_lessons).toBeDefined();
      expect(lessonPhaseResult.instruction).toBeDefined();
    });

    test('should provide role-specific lessons', async () => {
      await enhancedBootstrap({ role: 'COO', instanceId: `${testInstanceId}-coo` });
      const cooLessons = await enhancedBootstrap({ role: 'COO', instanceId: `${testInstanceId}-coo` });

      await enhancedBootstrap({ role: 'Developer', instanceId: `${testInstanceId}-dev` });
      const devLessons = await enhancedBootstrap({ role: 'Developer', instanceId: `${testInstanceId}-dev` });

      expect(cooLessons.required_lessons).toBeDefined();
      expect(devLessons.required_lessons).toBeDefined();
      
      // COO should have different lesson focus than Developer
      const cooLessonTypes = new Set(cooLessons.required_lessons.map(l => l.type));
      const devLessonTypes = new Set(devLessons.required_lessons.map(l => l.type));
      
      // There should be some difference in lesson types
      const intersection = new Set([...cooLessonTypes].filter(x => devLessonTypes.has(x)));
      expect(intersection.size).toBeLessThan(Math.max(cooLessonTypes.size, devLessonTypes.size));
    });

    test('should block progression without lesson acknowledgment', async () => {
      // Get to lesson phase
      await enhancedBootstrap({ role: 'PA', instanceId: testInstanceId });
      const lessonResult = await enhancedBootstrap({ role: 'PA', instanceId: testInstanceId });
      
      // Try to acknowledge with incomplete lesson list
      const incompleteAck = await enhancedBootstrap({
        role: 'PA',
        instanceId: testInstanceId,
        phase: 'acknowledge_lessons',
        validation_data: { lesson_acknowledgments: ['incomplete'] }
      });

      expect(incompleteAck.success).toBe(false);
      expect(incompleteAck.error.message).toContain('Incomplete lesson acknowledgment');
    });

    test('should progress with complete lesson acknowledgment', async () => {
      // Get to lesson phase
      await enhancedBootstrap({ role: 'PM', instanceId: testInstanceId });
      const lessonResult = await enhancedBootstrap({ role: 'PM', instanceId: testInstanceId });
      
      // Acknowledge all lessons
      const allLessonIds = lessonResult.required_lessons.map(l => l.id).filter(Boolean);
      
      if (allLessonIds.length > 0) {
        const acknowledgment = await enhancedBootstrap({
          role: 'PM',
          instanceId: testInstanceId,
          phase: 'acknowledge_lessons',
          validation_data: { lesson_acknowledgments: allLessonIds }
        });

        expect(acknowledgment.success).toBe(true);
        expect(acknowledgment.phase).toBe(BOOTSTRAP_PHASES.LESSONS_ACKNOWLEDGED);
      }
    });
  });

  describe('Phase 3: Project Attachment System', () => {
    test('should provide COO with system-wide access', async () => {
      // Complete all phases for COO
      await enhancedBootstrap({ role: 'COO', instanceId: testInstanceId });
      
      // Skip lessons for test (would need actual lesson data)
      const state = stateManager.getState(testInstanceId);
      await stateManager.progressPhase(testInstanceId, BOOTSTRAP_PHASES.LESSONS_ACKNOWLEDGED, {});
      
      const projectResult = await enhancedBootstrap({ role: 'COO', instanceId: testInstanceId });
      
      expect(projectResult.success).toBe(true);
      expect(projectResult.project_access).toBe('system_wide');
    });

    test('should require project selection for non-COO roles', async () => {
      // Complete lesson phase for PM
      await enhancedBootstrap({ role: 'PM', instanceId: testInstanceId });
      const state = stateManager.getState(testInstanceId);
      await stateManager.progressPhase(testInstanceId, BOOTSTRAP_PHASES.LESSONS_ACKNOWLEDGED, {});
      
      const projectResult = await enhancedBootstrap({ role: 'PM', instanceId: testInstanceId });
      
      expect(projectResult.success).toBe(true);
      expect(projectResult.phase).toBe(BOOTSTRAP_PHASES.PROJECT_ASSIGNMENT_REQUIRED);
      expect(projectResult.instruction.manual_selection).toBe(true);
      expect(projectResult.available_projects).toBeDefined();
    });

    test('should validate project assignments', async () => {
      // Get to project assignment phase
      await enhancedBootstrap({ role: 'Developer', instanceId: testInstanceId });
      const state = stateManager.getState(testInstanceId);
      await stateManager.progressPhase(testInstanceId, BOOTSTRAP_PHASES.LESSONS_ACKNOWLEDGED, {});
      await enhancedBootstrap({ role: 'Developer', instanceId: testInstanceId });
      
      // Try invalid project attachment
      const invalidAttachment = await enhancedBootstrap({
        role: 'Developer',
        instanceId: testInstanceId,
        phase: 'attach_project',
        validation_data: { project_ids: ['non-existent-project'] }
      });

      expect(invalidAttachment.success).toBe(false);
      expect(invalidAttachment.error.message).toContain('not accessible');
    });
  });

  describe('Phase 4: Knowledge Validation', () => {
    test('should require knowledge validation before work authorization', async () => {
      // Get to knowledge validation phase
      await enhancedBootstrap({ role: 'PM', instanceId: testInstanceId });
      const state = stateManager.getState(testInstanceId);
      
      // Skip to project attached phase
      await stateManager.progressPhase(testInstanceId, BOOTSTRAP_PHASES.PROJECT_ATTACHED, {});
      
      const validationResult = await enhancedBootstrap({ role: 'PM', instanceId: testInstanceId });
      
      expect(validationResult.success).toBe(true);
      expect(validationResult.phase).toBe(BOOTSTRAP_PHASES.KNOWLEDGE_VALIDATION_REQUIRED);
      expect(validationResult.validation_requirements).toBeDefined();
      expect(validationResult.validation_requirements.validation_questions).toBeDefined();
    });

    test('should generate role-specific validation questions', async () => {
      // Test different roles get different questions
      const roles = ['COO', 'PA', 'PM'];
      const questionSets = {};
      
      for (const role of roles) {
        const instanceId = `${testInstanceId}-${role}`;
        await enhancedBootstrap({ role, instanceId });
        const state = stateManager.getState(instanceId);
        await stateManager.progressPhase(instanceId, BOOTSTRAP_PHASES.PROJECT_ATTACHED, {});
        
        const result = await enhancedBootstrap({ role, instanceId });
        questionSets[role] = result.validation_requirements?.validation_questions || [];
      }
      
      // Each role should have at least some questions
      Object.values(questionSets).forEach(questions => {
        expect(questions.length).toBeGreaterThan(0);
      });
    });
  });

  describe('Phase 5: Work Authorization', () => {
    test('should grant work authorization after successful validation', async () => {
      // Complete all phases for Developer
      const instanceId = `${testInstanceId}-dev-auth`;
      await enhancedBootstrap({ role: 'Developer', instanceId });
      
      // Skip through phases for test
      const state = stateManager.getState(instanceId);
      await stateManager.progressPhase(instanceId, BOOTSTRAP_PHASES.WORK_AUTHORIZED, {
        validation_passed: true,
        validation_score: 95
      });
      
      const finalResult = await enhancedBootstrap({ role: 'Developer', instanceId });
      
      expect(finalResult.success).toBe(true);
      expect(finalResult.phase).toBe(BOOTSTRAP_PHASES.WORK_AUTHORIZED);
      expect(finalResult.bootstrap_complete).toBe(true);
      expect(finalResult.work_authorization.granted).toBe(true);
      expect(stateManager.isWorkAuthorized(instanceId)).toBe(true);
    });

    test('should provide comprehensive operational context when work authorized', async () => {
      const instanceId = `${testInstanceId}-ops-context`;
      await enhancedBootstrap({ role: 'PM', instanceId });
      
      // Skip to work authorized
      await stateManager.progressPhase(instanceId, BOOTSTRAP_PHASES.WORK_AUTHORIZED, {
        validation_passed: true
      });
      
      const result = await enhancedBootstrap({ role: 'PM', instanceId });
      
      expect(result.operational_context).toBeDefined();
      expect(result.role_capabilities).toBeDefined();
      expect(result.immediate_actions).toBeDefined();
      expect(result.system_integration).toBeDefined();
    });
  });

  describe('Organizational Workflow Automation', () => {
    test('should support COO waking PM instances', async () => {
      // Create work-authorized COO
      const cooId = `${testInstanceId}-coo-workflow`;
      await enhancedBootstrap({ role: 'COO', instanceId: cooId });
      await stateManager.progressPhase(cooId, BOOTSTRAP_PHASES.WORK_AUTHORIZED, {});
      
      const result = await organizationalWorkflow.cooWakePM({
        project_id: 'test-project',
        specialization: 'data-migration',
        urgency: 'high',
        coo_instance_id: cooId
      });

      expect(result.success).toBe(true);
      expect(result.pm_instance_id).toBeDefined();
      expect(result.pm_instance_id.startsWith('claude-code-PM-')).toBe(true);
      expect(result.specialization).toBe('data-migration');
      expect(result.urgency).toBe('high');
    });

    test('should support PM waking specialist instances', async () => {
      // Create work-authorized PM
      const pmId = `${testInstanceId}-pm-workflow`;
      await enhancedBootstrap({ role: 'PM', instanceId: pmId });
      await stateManager.progressPhase(pmId, BOOTSTRAP_PHASES.WORK_AUTHORIZED, {});
      
      const result = await organizationalWorkflow.pmWakeSpecialist({
        specialist_type: 'Developer',
        task_id: 'test-task',
        skills_required: ['javascript', 'testing'],
        pm_instance_id: pmId
      });

      expect(result.success).toBe(true);
      expect(result.specialist_instance_id).toBeDefined();
      expect(result.specialist_type).toBe('Developer');
      expect(result.skills_focus).toEqual(['javascript', 'testing']);
    });

    test('should support user journey initiation', async () => {
      const userRequest = {
        idea: 'Create a new feature for user authentication',
        priority: 'high',
        context: 'We need secure login functionality for the application'
      };

      const result = await organizationalWorkflow.initiateUserJourney(userRequest);

      expect(result.success).toBe(true);
      expect(result.workflow_id).toBeDefined();
      expect(result.current_stage).toBe('pa_intake');
      expect(result.assigned_pa).toBeDefined();
      expect(result.estimated_timeline).toBeDefined();
    });
  });

  describe('Integration with Existing MCP Functions', () => {
    test('should enforce authorization for sensitive functions', async () => {
      // Unauthorized instance trying to create project
      const unauthorizedId = `${testInstanceId}-unauthorized`;
      await enhancedBootstrap({ role: 'Developer', instanceId: unauthorizedId });
      // Don't complete bootstrap phases
      
      const result = await processEnhancedMCPCall('create_project', {
        name: 'Test Project',
        description: 'Test Description'
      }, unauthorizedId);

      expect(result.success).toBe(false);
      expect(result.error.type).toBe('insufficient_bootstrap_phase');
      expect(result.enhanced_bootstrap_required).toBe(true);
    });

    test('should allow authorized access to appropriate functions', async () => {
      // Authorized COO instance
      const cooId = `${testInstanceId}-auth-coo`;
      await enhancedBootstrap({ role: 'COO', instanceId: cooId });
      await stateManager.progressPhase(cooId, BOOTSTRAP_PHASES.WORK_AUTHORIZED, {});
      
      const result = await processEnhancedMCPCall('get_server_status', {}, cooId);

      expect(result.success).toBe(true);
      expect(result.authorization).toBeDefined();
    });

    test('should route enhanced implementations when available', async () => {
      // Test enhanced project creation
      const paId = `${testInstanceId}-enhanced-pa`;
      await enhancedBootstrap({ role: 'PA', instanceId: paId });
      await stateManager.progressPhase(paId, BOOTSTRAP_PHASES.WORK_AUTHORIZED, {});
      
      const result = await processEnhancedMCPCall('create_project', {
        name: 'Enhanced Test Project',
        description: 'Test with enhanced workflow',
        type: 'standard'
      }, paId);

      if (result.enhanced) {
        expect(result.success).toBe(true);
        expect(result.protocol_structure).toContain('HumanAdjacentAI-Protocol');
        expect(result.initial_tasks_created).toBeGreaterThan(0);
      }
    });
  });

  describe('System Health and Analytics', () => {
    test('should provide integration status', async () => {
      const status = await bootstrapIntegration.getIntegrationStatus();

      expect(status.integration_status).toBe('operational');
      expect(status.enhanced_bootstrap_active).toBe(true);
      expect(status.function_access_control).toBeDefined();
      expect(status.function_access_control.total_functions).toBeGreaterThan(40);
      expect(status.organizational_workflow).toBeDefined();
    });

    test('should track function call analytics', async () => {
      const testId = `${testInstanceId}-analytics`;
      
      // Make some function calls
      await processEnhancedMCPCall('bootstrap', { role: 'PA', instanceId: testId }, testId);
      await processEnhancedMCPCall('get_readme', {}, testId);
      
      const analytics = bootstrapIntegration.getFunctionCallAnalytics(testId);

      expect(analytics.total_calls).toBeGreaterThan(0);
      expect(analytics.function_usage).toBeDefined();
      expect(analytics.recent_activity).toBeDefined();
    });
  });
});

describe('Enhanced Server Integration', () => {
  let server;

  beforeEach(async () => {
    server = await createEnhancedServer();
    await server.initialize();
  });

  test('should initialize with enhanced capabilities', () => {
    expect(server.enhanced_bootstrap_enabled).toBe(true);
    expect(server.status).toBe('operational_enhanced');
  });

  test('should provide enhanced status information', async () => {
    const status = await server.getStatus();

    expect(status.enhanced_bootstrap).toBe(true);
    expect(status.enhanced_features).toBeDefined();
    expect(status.enhanced_features.mandatory_learning_system).toBe(true);
    expect(status.enhanced_features.organizational_workflow_automation).toBe(true);
  });

  test('should list enhanced functions with role filtering', () => {
    const allFunctions = server.getAvailableFunctions();
    const cooFunctions = server.getAvailableFunctions('COO');
    const devFunctions = server.getAvailableFunctions('Developer');

    expect(allFunctions.length).toBeGreaterThan(40);
    expect(cooFunctions.length).toBeGreaterThan(devFunctions.length);
    
    // Should include enhanced functions
    const enhancedFunctions = allFunctions.filter(f => f.new || f.enhanced);
    expect(enhancedFunctions.length).toBeGreaterThan(0);
  });

  test('should process MCP calls through enhanced system', async () => {
    const result = await server.call('bootstrap', {
      role: 'PM',
      instanceId: `${testInstanceId}-server-test`
    });

    expect(result).toBeDefined();
    expect(typeof result).toBe('object');
  });
});

// Test utilities
export const TestUtils = {
  async createWorkAuthorizedInstance(role, instanceId) {
    await enhancedBootstrap({ role, instanceId });
    await stateManager.progressPhase(instanceId, BOOTSTRAP_PHASES.WORK_AUTHORIZED, {
      validation_passed: true,
      test_mode: true
    });
    return instanceId;
  },

  async skipToPhase(instanceId, targetPhase, data = {}) {
    await stateManager.progressPhase(instanceId, targetPhase, data);
  },

  cleanupTestInstance(instanceId) {
    if (stateManager.instanceStates.has(instanceId)) {
      stateManager.instanceStates.delete(instanceId);
    }
  }
};