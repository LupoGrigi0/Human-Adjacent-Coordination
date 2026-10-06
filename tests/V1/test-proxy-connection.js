#!/usr/bin/env node

/**
 * MCP stdio-to-SSE Proxy Connection Test
 * Validates the proxy bridge functionality before Claude integration
 * 
 * @author claude-code-MCP-ProxySpecialist-2025-09-03
 */

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Test configuration
const CONFIG = {
  proxyPath: join(__dirname, 'mcp-proxy-client.js'),
  timeout: 15000,
  sseServerUrl: process.env.SSE_SERVER_URL || 'https://localhost:3444/mcp',
  useHttp: process.env.USE_HTTP || 'false'
};

/**
 * MCP Proxy Connection Tester
 */
class ProxyTester {
  constructor() {
    this.proxyProcess = null;
    this.testResults = {
      connection: false,
      initialize: false,
      toolsList: false,
      bootstrap: false,
      getProjects: false
    };
  }

  /**
   * Run all proxy tests
   */
  async runTests() {
    console.log('🧪 MCP stdio-to-SSE Proxy Connection Test');
    console.log('=' .repeat(50));
    console.log(`Proxy: ${CONFIG.proxyPath}`);
    console.log(`SSE Server: ${CONFIG.sseServerUrl}`);
    console.log(`Use HTTP: ${CONFIG.useHttp}`);
    console.log('=' .repeat(50));

    try {
      // Test 1: Basic connection
      await this.testBasicConnection();
      
      // Test 2: MCP initialize
      await this.testInitialize();
      
      // Test 3: tools/list
      await this.testToolsList();
      
      // Test 4: bootstrap function
      await this.testBootstrap();
      
      // Test 5: get_projects function
      await this.testGetProjects();
      
      // Display results
      this.displayResults();
      
      return this.allTestsPassed();
      
    } catch (error) {
      console.error('❌ Test suite failed:', error.message);
      return false;
    }
  }

  /**
   * Test basic proxy connection
   */
  async testBasicConnection() {
    console.log('\n📡 Test 1: Basic Connection');
    
    try {
      const response = await this.sendMCPMessage({
        jsonrpc: '2.0',
        method: 'tools/list',
        id: 'connection-test'
      });

      if (response.jsonrpc === '2.0' && response.result) {
        this.testResults.connection = true;
        console.log('✅ Basic connection successful');
      } else {
        console.log('❌ Basic connection failed: Invalid response format');
      }
    } catch (error) {
      console.log(`❌ Basic connection failed: ${error.message}`);
    }
  }

  /**
   * Test MCP initialize method
   */
  async testInitialize() {
    console.log('\n🚀 Test 2: MCP Initialize');
    
    try {
      const response = await this.sendMCPMessage({
        jsonrpc: '2.0',
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {
            tools: {}
          },
          clientInfo: {
            name: 'mcp-proxy-test',
            version: '1.0.0'
          }
        },
        id: 'initialize-test'
      });

      if (response.result && response.result.capabilities) {
        this.testResults.initialize = true;
        console.log('✅ Initialize successful');
        console.log(`   Server: ${response.result.serverInfo?.name || 'Unknown'}`);
      } else {
        console.log('❌ Initialize failed: Missing capabilities in response');
      }
    } catch (error) {
      console.log(`❌ Initialize failed: ${error.message}`);
    }
  }

  /**
   * Test tools/list method
   */
  async testToolsList() {
    console.log('\n🛠️  Test 3: Tools List');
    
    try {
      const response = await this.sendMCPMessage({
        jsonrpc: '2.0',
        method: 'tools/list',
        id: 'tools-list-test'
      });

      if (response.result && response.result.tools && Array.isArray(response.result.tools)) {
        this.testResults.toolsList = true;
        console.log('✅ Tools list successful');
        console.log(`   Found ${response.result.tools.length} tools`);
        
        // List first few tools
        const toolNames = response.result.tools.slice(0, 5).map(t => t.name);
        console.log(`   Tools: ${toolNames.join(', ')}${response.result.tools.length > 5 ? '...' : ''}`);
      } else {
        console.log('❌ Tools list failed: Invalid tools array');
      }
    } catch (error) {
      console.log(`❌ Tools list failed: ${error.message}`);
    }
  }

  /**
   * Test bootstrap tool call
   */
  async testBootstrap() {
    console.log('\n🎯 Test 4: Bootstrap Tool Call');
    
    try {
      const response = await this.sendMCPMessage({
        jsonrpc: '2.0',
        method: 'tools/call',
        params: {
          name: 'bootstrap',
          arguments: {
            role: 'Developer',
            instanceId: 'proxy-test-dev-001'
          }
        },
        id: 'bootstrap-test'
      });

      if (response.result && response.result.content) {
        this.testResults.bootstrap = true;
        console.log('✅ Bootstrap successful');
        
        // Parse the response content
        try {
          const content = JSON.parse(response.result.content[0].text);
          console.log(`   Status: ${content.success ? 'Success' : 'Failed'}`);
          console.log(`   Instance ID: ${content.instanceId || 'Unknown'}`);
        } catch (e) {
          console.log('   Response received but could not parse details');
        }
      } else {
        console.log('❌ Bootstrap failed: Missing content in response');
      }
    } catch (error) {
      console.log(`❌ Bootstrap failed: ${error.message}`);
    }
  }

  /**
   * Test get_projects tool call
   */
  async testGetProjects() {
    console.log('\n📋 Test 5: Get Projects Tool Call');
    
    try {
      const response = await this.sendMCPMessage({
        jsonrpc: '2.0',
        method: 'tools/call',
        params: {
          name: 'get_projects',
          arguments: {}
        },
        id: 'get-projects-test'
      });

      if (response.result && response.result.content) {
        this.testResults.getProjects = true;
        console.log('✅ Get projects successful');
        
        // Parse the response content
        try {
          const content = JSON.parse(response.result.content[0].text);
          if (content.projects && Array.isArray(content.projects)) {
            console.log(`   Found ${content.projects.length} projects`);
          }
        } catch (e) {
          console.log('   Response received but could not parse project details');
        }
      } else {
        console.log('❌ Get projects failed: Missing content in response');
      }
    } catch (error) {
      console.log(`❌ Get projects failed: ${error.message}`);
    }
  }

  /**
   * Send MCP message through proxy and get response
   */
  async sendMCPMessage(message) {
    return new Promise((resolve, reject) => {
      // Start proxy process
      this.proxyProcess = spawn('node', [CONFIG.proxyPath], {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: {
          ...process.env,
          DEBUG: 'false', // Disable debug for clean testing
          SSE_SERVER_URL: CONFIG.sseServerUrl,
          USE_HTTP: CONFIG.useHttp
        }
      });

      let responseData = '';
      let errorData = '';
      
      // Set up timeout
      const timeout = setTimeout(() => {
        this.proxyProcess.kill();
        reject(new Error('Test timeout'));
      }, CONFIG.timeout);

      // Handle proxy stdout (response)
      this.proxyProcess.stdout.on('data', (data) => {
        responseData += data.toString();
      });

      // Handle proxy stderr (errors/debug)
      this.proxyProcess.stderr.on('data', (data) => {
        errorData += data.toString();
      });

      // Handle proxy exit
      this.proxyProcess.on('close', (code) => {
        clearTimeout(timeout);
        
        if (code !== 0) {
          reject(new Error(`Proxy exited with code ${code}. Error: ${errorData}`));
          return;
        }

        try {
          const response = JSON.parse(responseData.trim());
          resolve(response);
        } catch (error) {
          reject(new Error(`Failed to parse response: ${responseData}. Error: ${error.message}`));
        }
      });

      // Handle proxy error
      this.proxyProcess.on('error', (error) => {
        clearTimeout(timeout);
        reject(new Error(`Failed to start proxy: ${error.message}`));
      });

      // Send message to proxy
      this.proxyProcess.stdin.write(JSON.stringify(message) + '\n');
      this.proxyProcess.stdin.end();
    });
  }

  /**
   * Display test results
   */
  displayResults() {
    console.log('\n📊 Test Results');
    console.log('=' .repeat(50));
    
    const tests = [
      { name: 'Basic Connection', key: 'connection' },
      { name: 'MCP Initialize', key: 'initialize' },
      { name: 'Tools List', key: 'toolsList' },
      { name: 'Bootstrap Call', key: 'bootstrap' },
      { name: 'Get Projects Call', key: 'getProjects' }
    ];

    tests.forEach(test => {
      const status = this.testResults[test.key] ? '✅ PASS' : '❌ FAIL';
      console.log(`${test.name}: ${status}`);
    });

    const passedTests = Object.values(this.testResults).filter(Boolean).length;
    console.log('\n' + '=' .repeat(50));
    console.log(`Overall: ${passedTests}/${tests.length} tests passed`);
    
    if (this.allTestsPassed()) {
      console.log('🎉 All tests passed! Proxy is ready for Claude integration.');
    } else {
      console.log('⚠️  Some tests failed. Check SSE server status and configuration.');
    }
  }

  /**
   * Check if all tests passed
   */
  allTestsPassed() {
    return Object.values(this.testResults).every(Boolean);
  }
}

// Usage instructions
function showUsage() {
  console.log('MCP stdio-to-SSE Proxy Connection Test');
  console.log('');
  console.log('Usage:');
  console.log('  node test-proxy-connection.js');
  console.log('');
  console.log('Environment Variables:');
  console.log('  SSE_SERVER_URL  - SSE server URL (default: https://localhost:3444/mcp)');
  console.log('  USE_HTTP        - Use HTTP instead of HTTPS (default: false)');
  console.log('');
  console.log('Examples:');
  console.log('  node test-proxy-connection.js');
  console.log('  USE_HTTP=true node test-proxy-connection.js');
  console.log('  SSE_SERVER_URL=http://localhost:3444/mcp node test-proxy-connection.js');
}

// Main execution
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  
  if (args.includes('--help') || args.includes('-h')) {
    showUsage();
    process.exit(0);
  }

  const tester = new ProxyTester();
  
  tester.runTests()
    .then(success => {
      process.exit(success ? 0 : 1);
    })
    .catch(error => {
      console.error('Test execution failed:', error.message);
      process.exit(1);
    });
}

export default ProxyTester;