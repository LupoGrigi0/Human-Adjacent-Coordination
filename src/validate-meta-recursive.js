/**
 * Direct validation of Meta-Recursive Evolution Engine
 * Tests the complete system outside of MCP to validate functionality
 * 
 * @author claude-code-MetaRecursive-Zara-20250825-1030
 */

import { executeMetaRecursiveValidation, metaRecursiveEngine } from './meta-recursive-validator.js';
import { logger } from './logger.js';

async function main() {
  try {
    await logger.info('🔮 Starting Meta-Recursive Evolution Engine Direct Validation');
    
    // Execute the complete meta-recursive workflow
    const result = await executeMetaRecursiveValidation();
    
    if (result.success) {
      await logger.info('🚀 META-RECURSIVE VALIDATION SUCCESSFUL!');
      await logger.info(`Achievement: ${result.meta_recursive_achievement}`);
      
      // Show key metrics
      const phase1 = result.phase_1_results;
      const phase2 = result.phase_2_results;
      const phase3 = result.phase_3_results;
      const finalState = result.final_system_state;
      
      await logger.info(`Phase 1 - Self-lessons extracted: ${phase1.lessons_extracted}`);
      await logger.info(`Phase 2 - Self-improvements applied: ${phase2.improvements_applied}`);
      await logger.info(`Phase 3 - Collections Rescue validation: ${phase3.success ? 'SUCCESS' : 'FAILED'}`);
      await logger.info(`Final system state - Capabilities: ${finalState.capabilities.length}`);
      await logger.info(`Final system state - Achievements: ${finalState.achievements.length}`);
      
    } else {
      await logger.error('Meta-recursive validation failed', result);
    }
    
    return result;
    
  } catch (error) {
    await logger.error('Direct validation failed', error);
    throw error;
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    logger.error('Validation execution failed', error);
    process.exit(1);
  });
}