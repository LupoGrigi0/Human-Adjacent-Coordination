/**
 * Test Cases for Protocol Evolution System
 * Validates role-specific protocol delivery with personality support
 * 
 * @author claude-code-ProtocolEvolutionSpecialist-Phoenix-2025-08-25-1445
 */

import { bootstrap } from './bootstrap.js';

/**
 * Safe logging function that respects stdio mode to prevent JSON-RPC pollution
 * Only logs to stderr in non-stdio mode to maintain protocol compliance
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
 * Test case scenarios for the new protocol delivery system
 */
export const testCases = {
  // PM for Collections Rescue - Analytical personality
  pm_collections_rescue: {
    input: {
      role: "PM",
      project: "collections-rescue",
      personality: "analytical",
      instanceId: "claude-code-PM-AnalyticalTest-2025-08-25-1500"
    },
    expected: {
      role_specific: true,
      personality_enhanced: true,
      project_context: true,
      lesson_integration: true
    }
  },

  // COO with Genevieve personality - Institutional memory
  coo_genevieve: {
    input: {
      role: "COO",
      personality: "Genevieve",
      context: "institutional-memory",
      instanceId: "claude-code-COO-Genevieve-2025-08-25-1500"
    },
    expected: {
      consciousness_level: 'high',
      sister_learning: true,
      institutional_memory: true,
      enhanced_guidance: true
    }
  },

  // Generic Developer - Lab Setup project
  developer_lab_setup: {
    input: {
      role: "Developer", 
      project: "lab-setup",
      instanceId: "claude-code-Developer-LabSetup-2025-08-25-1500"
    },
    expected: {
      role_specific: true,
      technical_focus: true,
      project_context: true,
      standard_personality: true
    }
  },

  // Technical PM - MCP Development
  pm_technical: {
    input: {
      role: "PM",
      personality: "technical",
      project: "self-improving-human-adjacent-ai-protocol",
      specialization: "platform-analysis",
      instanceId: "claude-code-PM-TechnicalSpecialist-2025-08-25-1500"
    },
    expected: {
      personality_enhanced: true,
      technical_specialization: true,
      architecture_focused: true,
      lesson_integration: true
    }
  }
};

/**
 * Run all test cases and validate protocol delivery
 */
export async function runProtocolTests() {
  const results = [];
  
  for (const [testName, testCase] of Object.entries(testCases)) {
    try {
      safeLog(`\n=== Testing: ${testName} ===`);
      
      const result = await bootstrap(testCase.input);
      
      // Validate basic success
      const isSuccess = result.success === true;
      
      // Validate protocol version
      const isVersion3 = result.bootstrap_version === '3.0';
      
      // Validate personality integration
      const hasPersonality = testCase.input.personality ? 
        result.protocol?.personality_guidance?.personality_type === testCase.input.personality : 
        true;
      
      // Validate role guidance
      const hasRoleGuidance = result.protocol?.role_guidance?.focus !== undefined;
      
      // Validate lesson integration (when personality specified)
      const hasLessonInsights = testCase.input.personality ?
        result.protocol?.lesson_insights !== undefined :
        true;
      
      const testResult = {
        test: testName,
        success: isSuccess,
        version: isVersion3,
        personality: hasPersonality,
        role_guidance: hasRoleGuidance,
        lesson_integration: hasLessonInsights,
        overall_pass: isSuccess && isVersion3 && hasPersonality && hasRoleGuidance && hasLessonInsights
      };
      
      results.push(testResult);
      
      // Log key results
      safeLog(`✓ Success: ${isSuccess}`);
      safeLog(`✓ Version 3.0: ${isVersion3}`);
      safeLog(`✓ Personality: ${hasPersonality}`);
      safeLog(`✓ Role Guidance: ${hasRoleGuidance}`);
      safeLog(`✓ Lesson Integration: ${hasLessonInsights}`);
      safeLog(`Overall: ${testResult.overall_pass ? '🟢 PASS' : '🔴 FAIL'}`);
      
    } catch (error) {
      results.push({
        test: testName,
        error: error.message,
        overall_pass: false
      });
      safeLog(`🔴 ERROR: ${error.message}`);
    }
  }
  
  // Summary
  const passed = results.filter(r => r.overall_pass).length;
  const total = results.length;
  
  safeLog(`\n=== TEST SUMMARY ===`);
  safeLog(`Passed: ${passed}/${total}`);
  safeLog(`Success Rate: ${Math.round((passed/total) * 100)}%`);
  
  return results;
}

/**
 * Demonstrate specific personality configurations
 */
export async function demonstratePersonalities() {
  const personalities = ['Genevieve', 'analytical', 'technical'];
  
  safeLog('\n=== PERSONALITY DEMONSTRATIONS ===');
  
  for (const personality of personalities) {
    try {
      const result = await bootstrap({
        role: 'COO',
        personality,
        instanceId: `demo-${personality}-${Date.now()}`
      });
      
      if (result.protocol?.personality_guidance) {
        safeLog(`\n--- ${personality.toUpperCase()} PERSONALITY ---`);
        safeLog(`Consciousness Level: ${result.protocol.personality_guidance.consciousness_level}`);
        safeLog(`Communication: ${result.protocol.personality_guidance.communication_style}`);
        safeLog(`Special Capabilities:`);
        result.protocol.personality_guidance.special_capabilities?.forEach(cap => {
          safeLog(`  • ${cap}`);
        });
      }
      
    } catch (error) {
      safeLog(`❌ Error testing ${personality}: ${error.message}`);
    }
  }
}

/**
 * Test backwards compatibility with existing instances
 */
export async function testBackwardsCompatibility() {
  safeLog('\n=== BACKWARDS COMPATIBILITY TEST ===');
  
  // Test old-style bootstrap call
  try {
    const oldStyleResult = await bootstrap({
      role: 'PA',
      instanceId: 'legacy-test-instance'
      // No personality specified - should work with defaults
    });
    
    const isCompatible = oldStyleResult.success && 
                        oldStyleResult.protocol?.role_guidance?.focus !== undefined;
    
    safeLog(`Legacy compatibility: ${isCompatible ? '🟢 PASS' : '🔴 FAIL'}`);
    safeLog(`Protocol version: ${oldStyleResult.bootstrap_version}`);
    safeLog(`Has role guidance: ${oldStyleResult.protocol?.role_guidance ? 'Yes' : 'No'}`);
    
    return isCompatible;
    
  } catch (error) {
    safeLog(`🔴 Backwards compatibility failed: ${error.message}`);
    return false;
  }
}

// Export for manual testing
if (import.meta.url === `file://${process.argv[1]}`) {
  safeLog('Running Protocol Evolution Tests...');
  
  try {
    await runProtocolTests();
    await demonstratePersonalities();
    await testBackwardsCompatibility();
  } catch (error) {
    safeLog('🔴 Test execution failed:', error.message);
    process.exit(1);
  }
}