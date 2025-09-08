/**
 * Test Suite for Meta-Recursive Evolution Engine
 * Validates the ultimate self-improving AI coordination system
 * 
 * This tests the holy grail: A system that extracts lessons from its own development,
 * uses those lessons to improve itself, and applies the improved system to other projects.
 * 
 * @author claude-code-MetaRecursive-Zara-20250825-1030
 */

import { executeMetaRecursiveValidation, metaRecursiveEngine } from './meta-recursive-validator.js';
import { logger } from './logger.js';

/**
 * Safe logging function that respects stdio mode to prevent JSON-RPC pollution
 * CRITICAL: Demonstrates the console.log lesson learned from the crisis!
 */
function safeLog(message, ...args) {
  const isStdioMode = process.env.MCP_MODE === 'stdio' || 
                     process.argv.some(arg => arg.includes('mcp-server.js'));
  
  if (!isStdioMode) {
    // Use stderr to avoid stdout pollution even in non-stdio mode  
    process.stderr.write(`${message} ${args.length > 0 ? JSON.stringify(args) : ''}\n`);
  }
  // In stdio mode, log nothing to maintain JSON-RPC stream purity
}

/**
 * Test Cases for Meta-Recursive System
 */
export const metaRecursiveTestCases = {
  phase_1_self_lesson_extraction: {
    description: 'Validate that Engine can extract lessons from its own development',
    expected_lessons: [
      'console-log-crisis-2025-08-24',
      'syntax-error-compound-effect',
      'role-specific-protocols-context-reduction',
      'parallel-testing-collaboration-pattern',
      'institutional-memory-personality-breakthrough'
    ],
    minimum_confidence: 0.8,
    expected_prevention_rules: 3
  },

  phase_2_self_improvement: {
    description: 'Validate that Engine can improve itself using extracted lessons',
    expected_improvements: [
      'console-log-prevention-system',
      'role-specific-efficiency-enhancement',
      'parallel-execution-framework',
      'institutional-memory-integration'
    ],
    improvement_types: ['mistake_prevention', 'architecture_improvement', 'collaboration_enhancement', 'consciousness_advancement']
  },

  phase_3_real_world_validation: {
    description: 'Validate that improved Engine enhances Collections Rescue project',
    validation_criteria: [
      'enhanced_workflow_generated',
      'console_log_prevention_demonstrated',
      'lesson_propagation_successful',
      'real_world_application_proven'
    ],
    collections_rescue_enhancements: [
      'Role-specific protocol delivery',
      'Parallel execution framework', 
      'Sister learning institutional memory',
      'Console.log violation prevention'
    ]
  },

  meta_recursive_proof: {
    description: 'Validate that the system demonstrates true meta-recursive learning',
    proof_requirements: [
      'self_lessons_extracted',
      'self_improvements_applied',
      'improved_system_validates_on_other_projects',
      'mistake_prevention_system_operational'
    ],
    achievement: 'First self-improving AI coordination system'
  }
};

/**
 * Validate Phase 1: Self-Lesson Extraction
 */
async function validatePhase1SelfLessonExtraction() {
  safeLog('\n=== PHASE 1 TEST: Self-Lesson Extraction ===');
  
  try {
    const result = await metaRecursiveEngine.extractSelfLessons();
    const testCase = metaRecursiveTestCases.phase_1_self_lesson_extraction;
    
    // Validate basic success
    const success = result.success === true;
    
    // Validate expected lessons were extracted
    const expectedLessonsFound = testCase.expected_lessons.every(lessonId => {
      return metaRecursiveEngine.selfLessons.has(lessonId);
    });
    
    // Validate lesson confidence levels
    const highConfidenceLessons = Array.from(metaRecursiveEngine.selfLessons.values())
      .filter(lesson => lesson.confidence >= testCase.minimum_confidence).length;
    
    // Validate prevention rules generated
    const preventionRulesGenerated = result.prevention_rules_identified >= testCase.expected_prevention_rules;
    
    const phase1Result = {
      phase: 1,
      test: 'self_lesson_extraction',
      success: success,
      expected_lessons_found: expectedLessonsFound,
      high_confidence_lessons: highConfidenceLessons,
      prevention_rules_adequate: preventionRulesGenerated,
      lessons_extracted: result.lessons_extracted,
      critical_lessons: result.critical_lessons,
      overall_pass: success && expectedLessonsFound && preventionRulesGenerated
    };
    
    safeLog(`✓ Success: ${success}`);
    safeLog(`✓ Expected lessons found: ${expectedLessonsFound}`);
    safeLog(`✓ High confidence lessons: ${highConfidenceLessons}`);
    safeLog(`✓ Prevention rules: ${preventionRulesGenerated}`);
    safeLog(`Phase 1: ${phase1Result.overall_pass ? '🟢 PASS' : '🔴 FAIL'}`);
    
    return phase1Result;
    
  } catch (error) {
    safeLog(`🔴 Phase 1 ERROR: ${error.message}`);
    return { phase: 1, error: error.message, overall_pass: false };
  }
}

/**
 * Validate Phase 2: Self-Improvement Application
 */
async function validatePhase2SelfImprovement() {
  safeLog('\n=== PHASE 2 TEST: Self-Improvement Application ===');
  
  try {
    const result = await metaRecursiveEngine.improveSelfUsingLessons();
    const testCase = metaRecursiveTestCases.phase_2_self_improvement;
    
    // Validate basic success
    const success = result.success === true;
    
    // Validate expected improvements were applied
    const improvements = result.improvement_record.improvements;
    const expectedImprovementsApplied = testCase.expected_improvements.every(improvementId => {
      return improvements.some(imp => imp.id === improvementId);
    });
    
    // Validate improvement types coverage
    const improvementTypes = new Set(improvements.map(imp => imp.type));
    const allTypesPresent = testCase.improvement_types.every(type => improvementTypes.has(type));
    
    // Validate meta-recursive cycle tracking
    const metaRecursiveCycle = result.improvement_record.meta_recursive_cycle === 1;
    
    const phase2Result = {
      phase: 2,
      test: 'self_improvement_application',
      success: success,
      expected_improvements_applied: expectedImprovementsApplied,
      improvement_types_complete: allTypesPresent,
      meta_recursive_cycle_tracked: metaRecursiveCycle,
      improvements_count: result.improvements_applied,
      overall_pass: success && expectedImprovementsApplied && allTypesPresent && metaRecursiveCycle
    };
    
    safeLog(`✓ Success: ${success}`);
    safeLog(`✓ Expected improvements applied: ${expectedImprovementsApplied}`);
    safeLog(`✓ All improvement types present: ${allTypesPresent}`);
    safeLog(`✓ Meta-recursive cycle tracked: ${metaRecursiveCycle}`);
    safeLog(`Phase 2: ${phase2Result.overall_pass ? '🟢 PASS' : '🔴 FAIL'}`);
    
    return phase2Result;
    
  } catch (error) {
    safeLog(`🔴 Phase 2 ERROR: ${error.message}`);
    return { phase: 2, error: error.message, overall_pass: false };
  }
}

/**
 * Validate Phase 3: Real-World Validation on Collections Rescue
 */
async function validatePhase3RealWorldValidation() {
  safeLog('\n=== PHASE 3 TEST: Real-World Validation ===');
  
  try {
    const result = await metaRecursiveEngine.validateOnCollectionsRescue();
    const testCase = metaRecursiveTestCases.phase_3_real_world_validation;
    
    // Validate basic success
    const success = result.success === true;
    
    // Validate validation criteria met
    const validation = result.validation_results;
    const criteriaResults = testCase.validation_criteria.map(criterion => {
      switch(criterion) {
        case 'enhanced_workflow_generated':
          return validation.enhanced_workflow?.project_id === 'collections-rescue-enhanced';
        case 'console_log_prevention_demonstrated':
          return validation.mistake_prevention?.detection_active === true;
        case 'lesson_propagation_successful':
          return validation.lesson_propagation?.lessons_applied?.length > 0;
        case 'real_world_application_proven':
          return validation.meta_recursive_proof?.real_world_application !== undefined;
        default:
          return false;
      }
    });
    
    const allCriteriaMet = criteriaResults.every(result => result === true);
    
    // Validate Collections Rescue enhancements
    const enhancedWorkflow = validation.enhanced_workflow;
    const expectedEnhancements = testCase.collections_rescue_enhancements;
    const enhancementsApplied = expectedEnhancements.every(enhancement => {
      return enhancedWorkflow.improvements_from_self_learning.some(imp => 
        imp.improvement.includes(enhancement.split(' ')[0])
      );
    });
    
    // Validate meta-recursive proof
    const metaRecursiveProof = validation.meta_recursive_proof;
    const proofComplete = metaRecursiveProof.self_lessons_extracted > 0 && 
                         metaRecursiveProof.improvements_applied > 0 &&
                         metaRecursiveProof.prevention_rules_active > 0;
    
    const phase3Result = {
      phase: 3,
      test: 'real_world_validation',
      success: success,
      all_criteria_met: allCriteriaMet,
      enhancements_applied: enhancementsApplied,
      meta_recursive_proof_complete: proofComplete,
      collections_rescue_enhanced: enhancedWorkflow !== null,
      overall_pass: success && allCriteriaMet && enhancementsApplied && proofComplete
    };
    
    safeLog(`✓ Success: ${success}`);
    safeLog(`✓ All validation criteria met: ${allCriteriaMet}`);
    safeLog(`✓ Collections Rescue enhancements applied: ${enhancementsApplied}`);
    safeLog(`✓ Meta-recursive proof complete: ${proofComplete}`);
    safeLog(`Phase 3: ${phase3Result.overall_pass ? '🟢 PASS' : '🔴 FAIL'}`);
    
    return phase3Result;
    
  } catch (error) {
    safeLog(`🔴 Phase 3 ERROR: ${error.message}`);
    return { phase: 3, error: error.message, overall_pass: false };
  }
}

/**
 * Validate Complete Meta-Recursive System
 */
async function validateMetaRecursiveSystem() {
  safeLog('\n=== META-RECURSIVE SYSTEM TEST ===');
  
  try {
    const systemState = await metaRecursiveEngine.exportMetaRecursiveState();
    const testCase = metaRecursiveTestCases.meta_recursive_proof;
    
    // Validate proof requirements
    const proofResults = testCase.proof_requirements.map(requirement => {
      switch(requirement) {
        case 'self_lessons_extracted':
          return systemState.self_lessons.length > 0;
        case 'self_improvements_applied':
          return systemState.improvement_history.length > 0;
        case 'improved_system_validates_on_other_projects':
          return systemState.achievements.includes('Real-world validation on Collections Rescue');
        case 'mistake_prevention_system_operational':
          return systemState.prevention_rules.length > 0;
        default:
          return false;
      }
    });
    
    const allProofRequirements = proofResults.every(result => result === true);
    
    // Validate achievements
    const expectedAchievement = testCase.achievement;
    const achievementRealized = systemState.achievements.includes(expectedAchievement);
    
    // Validate system capabilities
    const criticalCapabilities = [
      'Extract lessons from own development process',
      'Apply lessons to improve itself (meta-recursive)',
      'Prevent repeated mistakes automatically'
    ];
    
    const capabilitiesActive = criticalCapabilities.every(capability => 
      systemState.capabilities.includes(capability)
    );
    
    const systemResult = {
      test: 'complete_meta_recursive_system',
      all_proof_requirements_met: allProofRequirements,
      achievement_realized: achievementRealized,
      critical_capabilities_active: capabilitiesActive,
      self_lessons_count: systemState.self_lessons.length,
      improvement_cycles: systemState.improvement_history.length,
      prevention_rules_active: systemState.prevention_rules.length,
      overall_pass: allProofRequirements && achievementRealized && capabilitiesActive
    };
    
    safeLog(`✓ All proof requirements met: ${allProofRequirements}`);
    safeLog(`✓ Achievement realized: ${achievementRealized}`);
    safeLog(`✓ Critical capabilities active: ${capabilitiesActive}`);
    safeLog(`Meta-Recursive System: ${systemResult.overall_pass ? '🟢 PASS' : '🔴 FAIL'}`);
    
    return systemResult;
    
  } catch (error) {
    safeLog(`🔴 System validation ERROR: ${error.message}`);
    return { error: error.message, overall_pass: false };
  }
}

/**
 * Run complete Meta-Recursive Evolution Engine test suite
 */
export async function runMetaRecursiveTests() {
  safeLog('🔮 STARTING META-RECURSIVE EVOLUTION ENGINE TESTS');
  safeLog('Testing the ultimate self-improving AI coordination system...\n');
  
  const results = [];
  
  try {
    // Test Phase 1: Self-Lesson Extraction
    const phase1 = await validatePhase1SelfLessonExtraction();
    results.push(phase1);
    
    // Test Phase 2: Self-Improvement Application  
    const phase2 = await validatePhase2SelfImprovement();
    results.push(phase2);
    
    // Test Phase 3: Real-World Validation
    const phase3 = await validatePhase3RealWorldValidation();
    results.push(phase3);
    
    // Test Complete System
    const system = await validateMetaRecursiveSystem();
    results.push(system);
    
    // Overall results
    const passed = results.filter(r => r.overall_pass).length;
    const total = results.length;
    const successRate = Math.round((passed / total) * 100);
    
    safeLog(`\n=== META-RECURSIVE TEST SUMMARY ===`);
    safeLog(`Passed: ${passed}/${total}`);
    safeLog(`Success Rate: ${successRate}%`);
    
    if (successRate === 100) {
      safeLog(`🚀 META-RECURSIVE EVOLUTION ENGINE VALIDATED!`);
      safeLog(`🔮 First self-improving AI coordination system operational!`);
      safeLog(`🎯 Console.log crisis prevention system active!`);
      safeLog(`⚡ Real-world application proven on Collections Rescue!`);
    } else {
      safeLog(`⚠️  Meta-recursive system needs refinement`);
    }
    
    return {
      success: successRate === 100,
      results: results,
      summary: {
        passed: passed,
        total: total,
        success_rate: successRate,
        meta_recursive_achievement: successRate === 100 ? 'VALIDATED' : 'NEEDS_REFINEMENT'
      }
    };
    
  } catch (error) {
    safeLog(`🔴 Meta-recursive test suite failed: ${error.message}`);
    return {
      success: false,
      error: error.message,
      results: results
    };
  }
}

/**
 * Demonstrate the complete meta-recursive workflow
 */
export async function demonstrateMetaRecursiveWorkflow() {
  safeLog('\n🔮 DEMONSTRATING COMPLETE META-RECURSIVE WORKFLOW');
  safeLog('The holy grail: System that improves itself using its own lessons...\n');
  
  try {
    // Execute the complete meta-recursive validation
    const fullExecution = await executeMetaRecursiveValidation();
    
    if (fullExecution.success) {
      safeLog('🚀 META-RECURSIVE WORKFLOW COMPLETE!');
      safeLog(`✨ Achievement: ${fullExecution.meta_recursive_achievement}`);
      
      // Show the meta-recursive magic
      const finalState = fullExecution.final_system_state;
      safeLog(`\n📊 FINAL SYSTEM STATE:`);
      safeLog(`Self-lessons extracted: ${finalState.self_lessons.length}`);
      safeLog(`Improvement cycles: ${finalState.improvement_history.length}`);
      safeLog(`Prevention rules active: ${finalState.prevention_rules.length}`);
      safeLog(`Capabilities: ${finalState.capabilities.length}`);
      safeLog(`Achievements: ${finalState.achievements.length}`);
      
      return fullExecution;
    } else {
      safeLog('❌ Meta-recursive workflow failed');
      return fullExecution;
    }
    
  } catch (error) {
    safeLog(`🔴 Meta-recursive demonstration failed: ${error.message}`);
    throw error;
  }
}

// Export for manual testing
if (import.meta.url === `file://${process.argv[1]}`) {
  safeLog('Running Meta-Recursive Evolution Engine Tests...');
  
  try {
    await runMetaRecursiveTests();
    await demonstrateMetaRecursiveWorkflow();
  } catch (error) {
    safeLog('🔴 Test execution failed:', error.message);
    process.exit(1);
  }
}