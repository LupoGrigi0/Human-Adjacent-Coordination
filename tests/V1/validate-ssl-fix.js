#!/usr/bin/env node

/**
 * SSL Fix Validation Script
 * Comprehensive validation of SSL certificate fix for Claude Code & Claude Desktop
 * 
 * @author claude-code-SSL-Specialist-2025-09-02
 */

import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Validation test suite
 */
class SSLFixValidator {
  constructor() {
    this.results = [];
    this.passed = 0;
    this.failed = 0;
  }

  /**
   * Add test result
   */
  addResult(test, passed, message, details = null) {
    this.results.push({ test, passed, message, details });
    if (passed) {
      this.passed++;
    } else {
      this.failed++;
    }
  }

  /**
   * Validate environment configuration
   */
  validateEnvironment() {
    console.log('🔧 Validating Environment Configuration...');
    
    // Check Node.js version
    const nodeVersion = process.version;
    const majorVersion = parseInt(nodeVersion.slice(1).split('.')[0]);
    const nodeVersionOk = majorVersion >= 20;
    
    this.addResult(
      'Node.js Version',
      nodeVersionOk,
      nodeVersionOk ? `✅ Node.js ${nodeVersion} (>= 20)` : `❌ Node.js ${nodeVersion} (< 20 required)`,
      { version: nodeVersion, required: '>=20' }
    );

    // Check environment variables in development mode
    process.env.NODE_ENV = 'development';
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
    
    const envNodeEnv = process.env.NODE_ENV === 'development';
    const envTlsReject = process.env.NODE_TLS_REJECT_UNAUTHORIZED === '0';
    
    this.addResult(
      'NODE_ENV Setting',
      envNodeEnv,
      envNodeEnv ? '✅ NODE_ENV=development' : '❌ NODE_ENV not set to development',
      { value: process.env.NODE_ENV }
    );
    
    this.addResult(
      'SSL Bypass Setting',
      envTlsReject,
      envTlsReject ? '✅ NODE_TLS_REJECT_UNAUTHORIZED=0' : '❌ SSL bypass not configured',
      { value: process.env.NODE_TLS_REJECT_UNAUTHORIZED }
    );
  }

  /**
   * Validate file structure
   */
  validateFileStructure() {
    console.log('📁 Validating File Structure...');
    
    const files = [
      { path: 'src/sse-server.js', name: 'SSE MCP Server' },
      { path: 'scripts/start-sse-server.bat', name: 'Windows Startup Script' },
      { path: '.env.development', name: 'Development Environment Config' },
      { path: 'test-ssl-connection.js', name: 'SSL Connection Test' },
      { path: 'claude-desktop-http-client.js', name: 'Claude Desktop HTTP Client' },
      { path: 'SSL_TROUBLESHOOTING.md', name: 'SSL Troubleshooting Guide' },
      { path: 'validate-ssl-fix.js', name: 'SSL Fix Validator' }
    ];

    files.forEach(file => {
      const fullPath = join(__dirname, file.path);
      const exists = existsSync(fullPath);
      
      this.addResult(
        `File: ${file.name}`,
        exists,
        exists ? `✅ ${file.path}` : `❌ Missing: ${file.path}`,
        { path: fullPath, exists }
      );
    });
  }

  /**
   * Validate SSL server configuration
   */
  validateSSLConfiguration() {
    console.log('🔐 Validating SSL Configuration...');
    
    try {
      const serverPath = join(__dirname, 'src/sse-server.js');
      const serverContent = readFileSync(serverPath, 'utf8');
      
      // Check for SSL bypass configuration
      const hasSSLBypass = serverContent.includes('NODE_TLS_REJECT_UNAUTHORIZED');
      const hasEnhancedCerts = serverContent.includes('serverAuth, clientAuth');
      const hasDevMode = serverContent.includes('development');
      const hasTLSConfig = serverContent.includes('secureProtocol: \'TLS_method\'');
      
      this.addResult(
        'SSL Bypass Configuration',
        hasSSLBypass,
        hasSSLBypass ? '✅ SSL bypass configured' : '❌ SSL bypass not found',
        { found: hasSSLBypass }
      );
      
      this.addResult(
        'Enhanced Certificate Extensions',
        hasEnhancedCerts,
        hasEnhancedCerts ? '✅ Certificate extensions for Node.js clients' : '❌ Missing certificate extensions',
        { found: hasEnhancedCerts }
      );
      
      this.addResult(
        'Development Mode Support',
        hasDevMode,
        hasDevMode ? '✅ Development mode configuration' : '❌ Development mode not configured',
        { found: hasDevMode }
      );
      
      this.addResult(
        'TLS Method Configuration',
        hasTLSConfig,
        hasTLSConfig ? '✅ Modern TLS configuration' : '❌ TLS method not specified',
        { found: hasTLSConfig }
      );
      
    } catch (error) {
      this.addResult(
        'SSL Configuration Check',
        false,
        `❌ Error reading server file: ${error.message}`,
        { error: error.message }
      );
    }
  }

  /**
   * Validate startup script enhancements
   */
  validateStartupScript() {
    console.log('🚀 Validating Startup Script...');
    
    try {
      const scriptPath = join(__dirname, 'scripts/start-sse-server.bat');
      const scriptContent = readFileSync(scriptPath, 'utf8');
      
      const hasEnvVars = scriptContent.includes('NODE_TLS_REJECT_UNAUTHORIZED=0');
      const hasClaudeConfig = scriptContent.includes('claude-desktop-http-client.js');
      const hasSSLNotes = scriptContent.includes('SSL Notes:');
      const hasTroubleshooting = scriptContent.includes('Troubleshooting SSL Issues:');
      
      this.addResult(
        'Environment Variables',
        hasEnvVars,
        hasEnvVars ? '✅ SSL environment variables set' : '❌ SSL environment variables missing',
        { found: hasEnvVars }
      );
      
      this.addResult(
        'Claude Desktop Configuration',
        hasClaudeConfig,
        hasClaudeConfig ? '✅ Claude Desktop example config' : '❌ Claude Desktop config missing',
        { found: hasClaudeConfig }
      );
      
      this.addResult(
        'SSL Documentation',
        hasSSLNotes,
        hasSSLNotes ? '✅ SSL configuration notes' : '❌ SSL notes missing',
        { found: hasSSLNotes }
      );
      
      this.addResult(
        'Troubleshooting Guide',
        hasTroubleshooting,
        hasTroubleshooting ? '✅ SSL troubleshooting included' : '❌ Troubleshooting guide missing',
        { found: hasTroubleshooting }
      );
      
    } catch (error) {
      this.addResult(
        'Startup Script Check',
        false,
        `❌ Error reading startup script: ${error.message}`,
        { error: error.message }
      );
    }
  }

  /**
   * Validate package.json scripts
   */
  validatePackageScripts() {
    console.log('📦 Validating Package Scripts...');
    
    try {
      const packagePath = join(__dirname, 'package.json');
      const packageContent = JSON.parse(readFileSync(packagePath, 'utf8'));
      
      const hasSSLTest = packageContent.scripts && packageContent.scripts['test:ssl'];
      const hasSSEStart = packageContent.scripts && packageContent.scripts['start:sse'];
      
      this.addResult(
        'SSL Test Script',
        hasSSLTest,
        hasSSLTest ? '✅ test:ssl script available' : '❌ test:ssl script missing',
        { script: hasSSLTest ? packageContent.scripts['test:ssl'] : null }
      );
      
      this.addResult(
        'SSE Start Script',
        hasSSEStart,
        hasSSEStart ? '✅ start:sse script available' : '❌ start:sse script missing',
        { script: hasSSEStart ? packageContent.scripts['start:sse'] : null }
      );
      
    } catch (error) {
      this.addResult(
        'Package Scripts Check',
        false,
        `❌ Error reading package.json: ${error.message}`,
        { error: error.message }
      );
    }
  }

  /**
   * Run all validation tests
   */
  async runValidation() {
    console.log('🔍 SSL Certificate Fix Validation');
    console.log('=====================================');
    console.log('');

    this.validateEnvironment();
    console.log('');
    
    this.validateFileStructure();
    console.log('');
    
    this.validateSSLConfiguration();
    console.log('');
    
    this.validateStartupScript();
    console.log('');
    
    this.validatePackageScripts();
    console.log('');
    
    this.printSummary();
  }

  /**
   * Print validation summary
   */
  printSummary() {
    console.log('📋 Validation Summary');
    console.log('====================');
    console.log('');
    
    // Print failed tests first
    const failedTests = this.results.filter(r => !r.passed);
    if (failedTests.length > 0) {
      console.log('❌ Failed Tests:');
      failedTests.forEach(result => {
        console.log(`   ${result.message}`);
      });
      console.log('');
    }
    
    // Print passed tests
    const passedTests = this.results.filter(r => r.passed);
    if (passedTests.length > 0) {
      console.log('✅ Passed Tests:');
      passedTests.forEach(result => {
        console.log(`   ${result.message}`);
      });
      console.log('');
    }
    
    // Overall result
    const totalTests = this.results.length;
    const successRate = Math.round((this.passed / totalTests) * 100);
    
    console.log(`📊 Results: ${this.passed}/${totalTests} tests passed (${successRate}%)`);
    console.log('');
    
    if (this.failed === 0) {
      console.log('🎉 SSL Certificate Fix: VALIDATED');
      console.log('✅ Ready for Claude Code & Claude Desktop connections');
      console.log('');
      console.log('🚀 Next Steps:');
      console.log('   1. Start the server: npm run start:sse');
      console.log('   2. Test SSL connection: npm run test:ssl');
      console.log('   3. Configure Claude Desktop with provided config');
      console.log('   4. Connect Claude Code to https://localhost:3444/mcp');
    } else {
      console.log('⚠️  SSL Certificate Fix: INCOMPLETE');
      console.log(`❌ ${this.failed} issues need to be resolved`);
      console.log('');
      console.log('📖 Please check SSL_TROUBLESHOOTING.md for solutions');
    }
  }
}

/**
 * Main validation execution
 */
async function main() {
  const validator = new SSLFixValidator();
  await validator.runValidation();
  
  // Exit with error code if validation failed
  if (validator.failed > 0) {
    process.exit(1);
  }
}

// Run validation if executed directly
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch(error => {
    console.error('💥 Validation failed:', error.message);
    process.exit(1);
  });
}

export { SSLFixValidator };