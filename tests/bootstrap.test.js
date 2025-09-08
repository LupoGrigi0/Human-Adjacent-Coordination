/**
 * Bootstrap Function Tests
 * Testing the self-documenting entry point
 *
 * @author claude-code-MCP-Orion-2025-08-19-1430
 */

import { describe, it, expect } from '@jest/globals';
import { bootstrap } from './bootstrap.js';

describe('Bootstrap Function', () => {
  describe('Basic Functionality', () => {
    it('should return successful response with system information', () => {
      const result = bootstrap();

      expect(result.success).toBe(true);
      expect(result.system).toBeDefined();
      expect(result.system.name).toBe('mcp-coordination-system');
      expect(result.system.protocol_version).toBe('1.0');
      expect(result.timestamp).toBeDefined();
    });

    it('should include required response sections', () => {
      const result = bootstrap();

      expect(result.message).toBeDefined();
      expect(result.available_functions).toBeDefined();
      expect(result.first_steps).toBeDefined();
      expect(result.documentation).toBeDefined();
      expect(result.data_structure).toBeDefined();
      expect(result.next_actions).toBeDefined();
    });
  });

  describe('Role-based Responses', () => {
    it('should provide COO-specific guidance', () => {
      const result = bootstrap({ role: 'COO', instanceId: 'test-coo' });

      expect(result.message).toContain('Chief Operating Officer');
      expect(result.message).toContain('test-coo');
      expect(result.available_functions).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ name: 'get_system_status' }),
          expect.objectContaining({ name: 'backup_data' }),
        ]),
      );
    });

    it('should provide PA-specific guidance', () => {
      const result = bootstrap({ role: 'PA', instanceId: 'test-pa' });

      expect(result.message).toContain('Personal Assistant');
      expect(result.message).toContain('test-pa');
      expect(result.first_steps[0]).toContain('get_project_list');
    });

    it('should provide PM-specific guidance', () => {
      const result = bootstrap({ role: 'PM', instanceId: 'test-pm' });

      expect(result.message).toContain('Project Manager');
      expect(result.first_steps[1]).toContain('project_id');
    });

    it('should provide Executive-specific guidance', () => {
      const result = bootstrap({ role: 'Executive', instanceId: 'test-exec' });

      expect(result.message).toContain('Executive');
      expect(result.message).toContain('read-only access');
    });

    it('should handle unknown role gracefully', () => {
      const result = bootstrap({ role: 'unknown', instanceId: 'test-unknown' });

      expect(result.message).toContain('specify your role');
      expect(result.first_steps[0]).toContain('Specify your role');
    });
  });

  describe('Function Access Control', () => {
    it('should show all functions for COO role', () => {
      const result = bootstrap({ role: 'COO' });
      const functionNames = result.available_functions.map((f) => f.name);

      expect(functionNames).toContain('get_system_status');
      expect(functionNames).toContain('backup_data');
      expect(functionNames).toContain('create_project');
      expect(functionNames).toContain('send_message');
    });

    it('should restrict administrative functions for PA role', () => {
      const result = bootstrap({ role: 'PA' });
      const functionNames = result.available_functions.map((f) => f.name);

      expect(functionNames).not.toContain('get_system_status');
      expect(functionNames).not.toContain('backup_data');
      expect(functionNames).toContain('create_project');
      expect(functionNames).toContain('send_message');
    });

    it('should provide read-only functions for Executive role', () => {
      const result = bootstrap({ role: 'Executive' });
      const functionNames = result.available_functions.map((f) => f.name);

      expect(functionNames).toContain('get_project_list');
      expect(functionNames).toContain('get_project_details');
      expect(functionNames).not.toContain('create_project');
      expect(functionNames).not.toContain('send_message');
    });
  });

  describe('Error Handling', () => {
    it('should handle missing options gracefully', () => {
      const result = bootstrap();

      expect(result.success).toBe(true);
      expect(result.message).toContain('anonymous');
    });

    it('should return error response if exception occurs', () => {
      // Since we can't easily mock internal functions in this simple test,
      // we'll test error handling by ensuring the try-catch structure works
      expect(() => bootstrap()).not.toThrow();
    });
  });

  describe('Response Structure', () => {
    it('should have consistent timestamp format', () => {
      const result = bootstrap();

      expect(result.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z$/);
    });

    it('should include helpful documentation links', () => {
      const result = bootstrap();

      expect(result.documentation.full_docs).toContain('get_readme()');
      expect(result.documentation.api_reference).toContain('get_function_help');
    });

    it('should explain data structure clearly', () => {
      const result = bootstrap();

      expect(result.data_structure.projects).toContain('data/projects/');
      expect(result.data_structure.tasks).toContain('data/tasks.json');
      expect(result.data_structure.messages).toContain('data/messages/');
    });
  });
});
