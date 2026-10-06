#!/usr/bin/env node

/**
 * MCP Proxy Integration Validator
 * Validates complete stdio-to-SSE proxy functionality with actual SSE server
 * 
 * @author claude-code-MCP-ProxySpecialist-2025-09-03
 */

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { setTimeout } from 'timers/promises';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Complete Integration Validator
 */
class IntegrationValidator {
  constructor() {
    this.sseServer = null;
    this.proxyProcess = null;
    this.results = {
      sseServer: false,
      proxyConnection: false,
      mcpCommunication: false,
      coordinationFunctions: false
    };
  }

  /**
   * Run complete integration validation
   */
  async validate() {
    console.log('🔧 MCP Proxy Integration Validator');
    console.log('=' .repeat(60));
    console.log('This validates the complete stdio-to-SSE proxy bridge');
    console.log('=' .repeat(60));

    try {
      // Step 1: Start SSE server
      console.log('\n🚀 Step 1: Starting SSE MCP Server...');
      await this.startSSEServer();

      // Step 2: Test proxy connection
      console.log('\n🔌 Step 2: Testing proxy connection...');
      await this.testProxyConnection();

      // Step 3: Test MCP communication
      console.log('\n💬 Step 3: Testing MCP communication...');
      await this.testMCPCommunication();

      // Step 4: Test coordination functions
      console.log('\n⚡ Step 4: Testing coordination functions...');
      await this.testCoordinationFunctions();

      // Display final results
      this.displayFinalResults();

      return this.allValidationsPassed();

    } catch (error) {
      console.error('❌ Integration validation failed:', error.message);
      return false;
    } finally {
      await this.cleanup();
    }
  }

  /**
   * Start SSE MCP server
   */
  async startSSEServer() {
    return new Promise((resolve, reject) => {
      this.sseServer = spawn('node', ['src/sse-server.js'], {
        cwd: __dirname,
        env: {
          ...process.env,
          USE_HTTP: 'true', // Use HTTP for testing
          NODE_ENV: 'development'
        },
        stdio: ['ignore', 'pipe', 'pipe']
      });

      let output = '';
      let startupTimeout;

      const checkStartup = () => {
        if (output.includes('Ready for MCP Streamable HTTP connections!')) {
          clearTimeout(startupTimeout);
          this.results.sseServer = true;
          console.log('✅ SSE server started successfully');
          resolve();
        }
      };

      this.sseServer.stdout.on('data', (data) => {
        output += data.toString();
        checkStartup();
      });

      this.sseServer.stderr.on('data', (data) => {
        output += data.toString();
        checkStartup();
      });

      this.sseServer.on('error', (error) => {
        clearTimeout(startupTimeout);
        reject(new Error(`Failed to start SSE server: ${error.message}`));
      });

      this.sseServer.on('exit', (code) => {
        if (code !== 0 && code !== null) {
          clearTimeout(startupTimeout);
          reject(new Error(`SSE server exited with code ${code}`));
        }
      });

      // Timeout if server doesn't start within 15 seconds
      startupTimeout = setTimeout(() => {
        reject(new Error('SSE server startup timeout'));
      }, 15000);
    });
  }

  /**
   * Test proxy connection to SSE server
   */
  async testProxyConnection() {
    try {
      const testProcess = spawn('node', ['test-proxy-connection.js'], {
        cwd: __dirname,
        env: {
          ...process.env,
          USE_HTTP: 'true',
          SSE_SERVER_URL: 'http://localhost:3444/mcp',
          DEBUG: 'false'
        },
        stdio: ['ignore', 'pipe', 'pipe']
      });

      let output = '';
      let errorOutput = '';

      testProcess.stdout.on('data', (data) => {
        output += data.toString();
      });

      testProcess.stderr.on('data', (data) => {
        errorOutput += data.toString();
      });

      const exitCode = await new Promise((resolve) => {
        testProcess.on('exit', resolve);
      });

      if (exitCode === 0 && output.includes('All tests passed!')) {
        this.results.proxyConnection = true;
        console.log('✅ Proxy connection test passed');
      } else {
        console.log('❌ Proxy connection test failed');
        console.log('Output:', output);
        if (errorOutput) console.log('Errors:', errorOutput);
      }

    } catch (error) {
      console.log(`❌ Proxy connection test failed: ${error.message}`);
    }
  }

  /**
   * Test MCP communication through proxy
   */
  async testMCPCommunication() {
    try {
      const message = {
        jsonrpc: '2.0',
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: { tools: {} },
          clientInfo: { name: 'integration-test', version: '1.0.0' }
        },
        id: 'init-test'
      };

      const response = await this.sendProxyMessage(message);
      
      if (response.result && response.result.capabilities) {
        this.results.mcpCommunication = true;
        console.log('✅ MCP communication successful');
        console.log(`   Server: ${response.result.serverInfo?.name || 'Unknown'}`);
      } else {
        console.log('❌ MCP communication failed: Invalid response');
      }

    } catch (error) {
      console.log(`❌ MCP communication failed: ${error.message}`);
    }
  }

  /**
   * Test coordination functions through proxy
   */
  async testCoordinationFunctions() {
    try {
      // Test bootstrap function
      const bootstrapMessage = {
        jsonrpc: '2.0',
        method: 'tools/call',
        params: {
          name: 'bootstrap',
          arguments: {
            role: 'Developer',
            instanceId: 'integration-test-dev'
          }
        },
        id: 'bootstrap-test'
      };

      const bootstrapResponse = await this.sendProxyMessage(bootstrapMessage);
      
      if (bootstrapResponse.result && bootstrapResponse.result.content) {
        console.log('✅ Bootstrap function successful');

        // Test get_projects function
        const projectsMessage = {
          jsonrpc: '2.0',
          method: 'tools/call',
          params: {
            name: 'get_projects',
            arguments: {}
          },
          id: 'projects-test'
        };

        const projectsResponse = await this.sendProxyMessage(projectsMessage);
        
        if (projectsResponse.result && projectsResponse.result.content) {
          this.results.coordinationFunctions = true;
          console.log('✅ Coordination functions successful');
          console.log('   All core MCP coordination functions are accessible');
        } else {
          console.log('❌ Get projects function failed');
        }
      } else {
        console.log('❌ Bootstrap function failed');
      }

    } catch (error) {
      console.log(`❌ Coordination functions test failed: ${error.message}`);
    }
  }

  /**
   * Send message through proxy
   */
  async sendProxyMessage(message) {
    return new Promise((resolve, reject) => {
      const proxyProcess = spawn('node', ['mcp-proxy-client.js'], {
        cwd: __dirname,
        env: {
          ...process.env,
          USE_HTTP: 'true',
          SSE_SERVER_URL: 'http://localhost:3444/mcp',
          DEBUG: 'false'
        },
        stdio: ['pipe', 'pipe', 'pipe']
      });

      let responseData = '';
      let errorData = '';

      const timeout = setTimeout(() => {
        proxyProcess.kill();
        reject(new Error('Proxy message timeout'));
      }, 10000);

      proxyProcess.stdout.on('data', (data) => {
        responseData += data.toString();
      });

      proxyProcess.stderr.on('data', (data) => {
        errorData += data.toString();
      });

      proxyProcess.on('close', (code) => {
        clearTimeout(timeout);
        
        if (code !== 0) {
          reject(new Error(`Proxy process failed with code ${code}. Error: ${errorData}`));
          return;
        }

        try {
          const response = JSON.parse(responseData.trim());
          resolve(response);
        } catch (error) {
          reject(new Error(`Failed to parse proxy response: ${responseData}`));
        }
      });

      proxyProcess.stdin.write(JSON.stringify(message) + '\n');
      proxyProcess.stdin.end();
    });
  }

  /**
   * Display final validation results
   */
  displayFinalResults() {
    console.log('\n🎯 Integration Validation Results');
    console.log('=' .repeat(60));
    
    const validations = [
      { name: 'SSE Server Startup', key: 'sseServer' },
      { name: 'Proxy Connection', key: 'proxyConnection' },
      { name: 'MCP Communication', key: 'mcpCommunication' },
      { name: 'Coordination Functions', key: 'coordinationFunctions' }
    ];

    validations.forEach(validation => {
      const status = this.results[validation.key] ? '✅ PASS' : '❌ FAIL';
      console.log(`${validation.name}: ${status}`);
    });

    const passedValidations = Object.values(this.results).filter(Boolean).length;
    console.log('\n' + '=' .repeat(60));
    console.log(`Overall: ${passedValidations}/${validations.length} validations passed`);

    if (this.allValidationsPassed()) {
      console.log('\n🎉 INTEGRATION SUCCESSFUL!');
      console.log('The stdio-to-SSE proxy bridge is fully functional and ready for:');
      console.log('  • Claude Desktop integration');
      console.log('  • Claude Code integration');
      console.log('  • Production MCP coordination workflows');
      console.log('\nNext steps:');
      console.log('  1. Add proxy to Claude Desktop configuration');
      console.log('  2. Add proxy to Claude Code .claude.json');
      console.log('  3. Test with actual Claude instances');
    } else {
      console.log('\n⚠️  INTEGRATION INCOMPLETE');
      console.log('Some validations failed. Review the errors above and:');
      console.log('  1. Ensure SSE server is properly configured');
      console.log('  2. Check network connectivity and ports');
      console.log('  3. Verify SSL/certificate configuration');
      console.log('  4. Review proxy implementation for issues');
    }
  }

  /**
   * Check if all validations passed
   */
  allValidationsPassed() {
    return Object.values(this.results).every(Boolean);
  }

  /**
   * Clean up processes
   */
  async cleanup() {
    console.log('\n🧹 Cleaning up processes...');
    
    if (this.sseServer) {
      this.sseServer.kill('SIGTERM');
      // Wait for graceful shutdown
      await setTimeout(2000);
      if (!this.sseServer.killed) {
        this.sseServer.kill('SIGKILL');
      }
    }

    if (this.proxyProcess) {
      this.proxyProcess.kill('SIGTERM');
    }

    console.log('✅ Cleanup complete');
  }
}

// Main execution
if (import.meta.url === `file://${process.argv[1]}`) {
  const validator = new IntegrationValidator();
  
  // Handle process signals for cleanup
  process.on('SIGINT', async () => {
    console.log('\n🛑 Interrupted, cleaning up...');
    await validator.cleanup();
    process.exit(1);
  });

  validator.validate()
    .then(success => {
      process.exit(success ? 0 : 1);
    })
    .catch(async (error) => {
      console.error('Validation execution failed:', error.message);
      await validator.cleanup();
      process.exit(1);
    });
}

export default IntegrationValidator;