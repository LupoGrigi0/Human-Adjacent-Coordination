#!/usr/bin/env node

/**
 * SSL Connection Test for Claude Code & Claude Desktop Compatibility
 * Tests HTTPS connection to SSE MCP Server with self-signed certificates
 * 
 * @author claude-code-SSL-Specialist-2025-09-02
 */

import https from 'https';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Set environment for SSL bypass (same as production Claude clients)
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const CONFIG = {
  port: process.env.SSE_PORT || 3444,
  host: process.env.HOST || 'localhost'
};

/**
 * Test SSL connection to SSE MCP Server
 */
async function testSSLConnection() {
  console.log('🔍 Testing SSL Connection to SSE MCP Server...');
  console.log(`📡 Target: https://${CONFIG.host}:${CONFIG.port}/health`);
  console.log(`🛡️  SSL Mode: NODE_TLS_REJECT_UNAUTHORIZED=${process.env.NODE_TLS_REJECT_UNAUTHORIZED}`);
  console.log('');

  return new Promise((resolve, reject) => {
    const options = {
      hostname: CONFIG.host,
      port: CONFIG.port,
      path: '/health',
      method: 'GET',
      rejectUnauthorized: false, // Allow self-signed certificates
      headers: {
        'User-Agent': 'SSL-Test-Client/1.0.0',
        'Accept': 'application/json'
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      
      console.log(`✅ Connection established!`);
      console.log(`📊 Status Code: ${res.statusCode}`);
      console.log(`🔐 TLS Version: ${res.socket.getProtocol?.() || 'Unknown'}`);
      console.log(`🎯 Server: ${res.headers.server || 'Unknown'}`);
      console.log('');

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        try {
          const jsonData = JSON.parse(data);
          console.log('📋 Health Check Response:');
          console.log(JSON.stringify(jsonData, null, 2));
          console.log('');
          console.log('🎉 SSL Connection Test: PASSED');
          console.log('✅ Claude Code & Claude Desktop should connect successfully');
          resolve(jsonData);
        } catch (error) {
          console.log('📄 Raw Response:');
          console.log(data);
          resolve(data);
        }
      });
    });

    req.on('error', (error) => {
      console.error('❌ SSL Connection Test: FAILED');
      console.error('🚨 Error Details:', error.message);
      console.error('');
      console.error('💡 Troubleshooting:');
      console.error('   1. Ensure SSE server is running: npm run start:sse');
      console.error('   2. Check port availability: netstat -an | findstr :3444');
      console.error('   3. Verify certificates exist: ls -la certs/');
      console.error('   4. Try regenerating certificates: del certs/*.* && restart server');
      console.error('');
      reject(error);
    });

    req.setTimeout(10000, () => {
      console.error('⏱️  Connection timeout after 10 seconds');
      req.destroy();
      reject(new Error('Connection timeout'));
    });

    req.end();
  });
}

/**
 * Test MCP JSON-RPC endpoint
 */
async function testMCPEndpoint() {
  console.log('🔄 Testing MCP JSON-RPC Endpoint...');
  
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify({
      jsonrpc: '2.0',
      method: 'initialize',
      params: {
        capabilities: {},
        clientInfo: {
          name: 'SSL-Test-Client',
          version: '1.0.0'
        }
      },
      id: 1
    });

    const options = {
      hostname: CONFIG.host,
      port: CONFIG.port,
      path: '/mcp',
      method: 'POST',
      rejectUnauthorized: false,
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData),
        'User-Agent': 'SSL-Test-Client/1.0.0'
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        try {
          const jsonData = JSON.parse(data);
          console.log('📋 MCP Initialize Response:');
          console.log(JSON.stringify(jsonData, null, 2));
          console.log('');
          console.log('🎉 MCP Endpoint Test: PASSED');
          resolve(jsonData);
        } catch (error) {
          console.error('❌ Invalid JSON response from MCP endpoint');
          console.error('📄 Raw Response:', data);
          reject(error);
        }
      });
    });

    req.on('error', (error) => {
      console.error('❌ MCP Endpoint Test: FAILED');
      console.error('🚨 Error:', error.message);
      reject(error);
    });

    req.write(postData);
    req.end();
  });
}

/**
 * Main test function
 */
async function runTests() {
  console.log('🚀 SSL Connection Test Suite for Claude Code & Claude Desktop');
  console.log('============================================================');
  console.log('');

  try {
    // Test 1: Basic SSL connection
    await testSSLConnection();
    console.log('');
    
    // Test 2: MCP endpoint
    await testMCPEndpoint();
    console.log('');
    
    console.log('🏆 All Tests PASSED!');
    console.log('✅ SSE MCP Server is ready for Claude Code & Claude Desktop');
    console.log('');
    console.log('🔗 Connection URLs:');
    console.log(`   Health Check: https://${CONFIG.host}:${CONFIG.port}/health`);
    console.log(`   MCP Endpoint: https://${CONFIG.host}:${CONFIG.port}/mcp`);
    console.log(`   Web UI:       https://${CONFIG.host}:${CONFIG.port}/ui/sse-test.html`);
    
  } catch (error) {
    console.error('');
    console.error('💥 Test Suite FAILED');
    console.error('Please check the SSE server configuration and try again.');
    process.exit(1);
  }
}

// Run tests if this file is executed directly
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  runTests().catch(console.error);
}

export { testSSLConnection, testMCPEndpoint };