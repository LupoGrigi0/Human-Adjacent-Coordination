#!/usr/bin/env node

/**
 * MCP Coordination System - SSE-based MCP Server
 * Official MCP Streamable HTTP transport implementation with Server-Sent Events
 * 
 * @author claude-code-MCP-ProtocolSpecialist-2025-09-02
 * @updated claude-code-COO-2025-09-03 - Fixed critical SSE server logging issue
 */

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import https from 'https';
import http from 'http';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { v4 as uuidv4 } from 'uuid';
import { MCPCoordinationServer } from './server.js';
import { createLogger } from './logger.js';
import { execSync } from 'child_process';
import { networkInterfaces } from 'os';

// Create dedicated logger for SSE server - Force file-only mode to avoid stdout/stderr pollution
// This is critical for JSON-RPC protocol compliance
const logger = createLogger('sse-server.log', true); // Force file-only mode

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Fix working directory issue - Change to MCP server directory to ensure correct working directory
const serverDir = dirname(__dirname);
process.chdir(serverDir);

// Development SSL bypass for Node.js clients (Claude Code, Claude Desktop)
if (process.env.NODE_ENV === 'development') {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
}

// Configuration
const CONFIG = {
  port: process.env.SSE_PORT || 3444,
  host: process.env.HOST || 'localhost',
  environment: process.env.NODE_ENV || 'development',
  sslCertPath: process.env.SSL_CERT_PATH || join(__dirname, '..', 'certs'),
  sslStrict: process.env.SSL_STRICT === 'true', // Force strict SSL in production
  useHTTP: process.env.USE_HTTP === 'true' || process.env.NODE_ENV === 'development', // HTTP fallback for development
};

/**
 * SSE-based MCP Server implementing official MCP Streamable HTTP specification
 */
class SSEMCPServer {
  constructor() {
    this.app = express();
    this.httpsServer = null;
    this.httpServer = null;
    this.mcpServer = new MCPCoordinationServer(logger); // Pass file-only logger
    this.sslOptions = null;
    this.sessions = new Map(); // Store MCP sessions
    this.sseClients = new Map(); // Store SSE connections
  }

  /**
   * Auto-detect local IP address for network access
   */
  getLocalIPAddress() {
    try {
      const interfaces = networkInterfaces();
      
      // Priority order for interface selection
      const priorities = ['Ethernet', 'Wi-Fi', 'Wireless', 'Local Area Connection'];
      
      for (const priority of priorities) {
        for (const [name, addrs] of Object.entries(interfaces)) {
          if (name.includes(priority) && addrs) {
            for (const addr of addrs) {
              if (addr.family === 'IPv4' && !addr.internal) {
                return addr.address;
              }
            }
          }
        }
      }
      
      // Fallback: find any IPv4 non-internal address
      for (const [name, addrs] of Object.entries(interfaces)) {
        if (addrs) {
          for (const addr of addrs) {
            if (addr.family === 'IPv4' && !addr.internal) {
              return addr.address;
            }
          }
        }
      }
      
      return '127.0.0.1'; // Ultimate fallback
    } catch (error) {
      logger.error('Failed to detect local IP address', error.message);
      return '127.0.0.1';
    }
  }

  /**
   * Check if mkcert certificates exist and are valid
   */
  checkMkcertCertificates() {
    const certDir = CONFIG.sslCertPath;
    const mkcertCertPath = join(certDir, 'localhost.pem');
    const mkcertKeyPath = join(certDir, 'localhost-key.pem');
    const caCertPath = join(certDir, 'mkcert-ca-cert.pem');
    
    if (existsSync(mkcertCertPath) && existsSync(mkcertKeyPath)) {
      return {
        available: true,
        certPath: mkcertCertPath,
        keyPath: mkcertKeyPath,
        caCertPath: existsSync(caCertPath) ? caCertPath : null
      };
    }
    
    return { available: false };
  }

  /**
   * Generate self-signed SSL certificates if they don't exist
   */
  async generateSSLCertificates() {
    const certDir = CONFIG.sslCertPath;
    const keyPath = join(certDir, 'server.key');
    const certPath = join(certDir, 'server.crt');

    // Check if certificates already exist
    if (existsSync(keyPath) && existsSync(certPath)) {
      await logger.info('SSL certificates found');
      return { keyPath, certPath };
    }

    await logger.info('Generating self-signed SSL certificates...');

    try {
      // Create certs directory
      if (!existsSync(certDir)) {
        mkdirSync(certDir, { recursive: true });
      }

      // Generate private key
      await logger.info('Generating private key...');
      execSync(`openssl genrsa -out "${keyPath}" 2048`, { stdio: 'inherit' });

      // Generate certificate with enhanced Node.js client compatibility
      await logger.info('Generating certificate for Node.js client compatibility...');
      const opensslConfig = `
[req]
distinguished_name = req_distinguished_name
x509_extensions = v3_req
prompt = no

[req_distinguished_name]
C = US
ST = Development
L = Local
O = MCP Coordination System SSE
OU = Development Certificate
CN = localhost

[v3_req]
keyUsage = critical, digitalSignature, keyEncipherment, dataEncipherment
extendedKeyUsage = critical, serverAuth, clientAuth
subjectAltName = @alt_names
basicConstraints = critical, CA:FALSE
nsCertType = server

[alt_names]
DNS.1 = localhost
DNS.2 = 127.0.0.1
DNS.3 = *.localhost
IP.1 = 127.0.0.1
IP.2 = ::1
`;

      const configPath = join(certDir, 'openssl-sse.conf');
      writeFileSync(configPath, opensslConfig);

      execSync(`openssl req -new -x509 -key "${keyPath}" -out "${certPath}" -days 365 -config "${configPath}"`, 
        { stdio: 'inherit' });

      await logger.info('SSL certificates generated successfully');
      await logger.info(`Certificate location: ${certPath}`);
      await logger.info(`Private key location: ${keyPath}`);

      return { keyPath, certPath };
    } catch (error) {
      await logger.error('Failed to generate SSL certificates', error.message);
      throw error;
    }
  }

  /**
   * Load SSL certificates with development mode configuration
   * Prioritizes mkcert certificates for cross-platform compatibility
   */
  async loadSSLCertificates() {
    try {
      // First check if mkcert certificates are available
      const mkcertStatus = this.checkMkcertCertificates();
      
      let keyPath, certPath;
      
      if (mkcertStatus.available) {
        await logger.info('mkcert certificates found - using for cross-platform compatibility');
        await logger.info(`mkcert cert: ${mkcertStatus.certPath}`);
        await logger.info(`mkcert key: ${mkcertStatus.keyPath}`);
        
        if (mkcertStatus.caCertPath) {
          await logger.info(`mkcert CA: ${mkcertStatus.caCertPath}`);
        }
        
        keyPath = mkcertStatus.keyPath;
        certPath = mkcertStatus.certPath;
        
        // Get local IP for network access info
        const localIP = this.getLocalIPAddress();
        await logger.info(`Local network IP: ${localIP}`);
        await logger.info('Cross-platform access ready:');
        await logger.info(`  - Windows/localhost: https://localhost:${CONFIG.port}`);
        await logger.info(`  - Mac/Android/network: https://${localIP}:${CONFIG.port}`);
      } else {
        await logger.info('mkcert certificates not found - generating self-signed certificates');
        await logger.info('For cross-platform access, run: scripts/setup-ssl-windows.bat');
        const result = await this.generateSSLCertificates();
        keyPath = result.keyPath;
        certPath = result.certPath;
      }
      
      // Verify certificates exist and are readable
      if (!existsSync(keyPath) || !existsSync(certPath)) {
        throw new Error(`Certificate files not found: ${keyPath}, ${certPath}`);
      }
      
      this.sslOptions = {
        key: readFileSync(keyPath),
        cert: readFileSync(certPath),
        // Development mode: Allow self-signed certificates
        requestCert: false,
        rejectUnauthorized: CONFIG.sslStrict,
        secureProtocol: 'TLS_method'
      };

      await logger.info('SSL certificates loaded successfully');
      
      if (CONFIG.environment === 'development' && !CONFIG.sslStrict) {
        await logger.info('Development Mode: SSL verification relaxed for Node.js clients');
        await logger.info('Environment variables set: NODE_TLS_REJECT_UNAUTHORIZED=0');
      }
      
      return true;
    } catch (error) {
      await logger.error('Failed to load SSL certificates', error.message);
      return false;
    }
  }

  /**
   * Configure Express middleware
   */
  configureMiddleware() {
    // Security headers with SSE support
    this.app.use(helmet({
      contentSecurityPolicy: false,
      crossOriginEmbedderPolicy: false
    }));

    // CORS configuration for SSE
    this.app.use(cors({
      origin: CONFIG.environment === 'production' 
        ? [
            `https://localhost:${CONFIG.port}`,
            `https://127.0.0.1:${CONFIG.port}`
          ]
        : true,
      credentials: true,
      methods: ['GET', 'POST', 'OPTIONS'],
      allowedHeaders: [
        'Content-Type', 
        'Authorization', 
        'X-Requested-With',
        'Mcp-Session-Id',
        'Accept',
        'Cache-Control'
      ]
    }));

    // Rate limiting
    const limiter = rateLimit({
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 2000, // Higher limit for SSE connections
      message: {
        error: 'Too many requests from this IP',
        type: 'rate_limit_exceeded'
      }
    });
    this.app.use(limiter);

    // Body parsing
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));

    // Request logging
    this.app.use((req, res, next) => {
      logger.info(`${req.method} ${req.path} - ${req.get('User-Agent') || 'unknown'}`);
      next();
    });
  }

  /**
   * Create or get MCP session
   */
  getOrCreateSession(sessionId) {
    if (!sessionId) {
      sessionId = uuidv4();
    }

    if (!this.sessions.has(sessionId)) {
      this.sessions.set(sessionId, {
        id: sessionId,
        initialized: false,
        capabilities: {
          tools: {},
          resources: {},
          prompts: {}
        },
        created: new Date(),
        lastActivity: new Date()
      });
    }

    const session = this.sessions.get(sessionId);
    session.lastActivity = new Date();
    return session;
  }

  /**
   * Configure MCP HTTP POST endpoint
   */
  configureMCPEndpoint() {
    this.app.post('/mcp', async (req, res) => {
      try {
        const sessionId = req.get('Mcp-Session-Id') || uuidv4();
        const session = this.getOrCreateSession(sessionId);

        // Set MCP session header in response
        res.set('Mcp-Session-Id', session.id);
        res.set('Content-Type', 'application/json');

        const { jsonrpc, method, params, id } = req.body;

        await logger.info(`MCP Request: ${method}`, { sessionId, id });

        // Validate JSON-RPC format
        if (jsonrpc !== '2.0') {
          return res.json({
            jsonrpc: '2.0',
            error: {
              code: -32600,
              message: 'Invalid Request: jsonrpc must be "2.0"'
            },
            id: id || null
          });
        }

        // Initialize MCP server if needed
        if (this.mcpServer.status !== 'operational') {
          await this.mcpServer.initialize();
        }

        let result;

        switch (method) {
          case 'initialize':
            result = await this.handleInitialize(params, session);
            session.initialized = true;
            break;

          case 'tools/list':
            result = await this.handleToolsList();
            break;

          case 'tools/call':
            const { name, arguments: args } = params;
            result = await this.handleToolCall(name, args, session);
            break;

          case 'resources/list':
            result = { resources: [] }; // Empty resources for now
            break;

          case 'prompts/list':
            result = { prompts: [] }; // Empty prompts for now
            break;

          default:
            return res.json({
              jsonrpc: '2.0',
              error: {
                code: -32601,
                message: `Method not found: ${method}`
              },
              id
            });
        }

        // Send notification to SSE clients if any are connected
        this.notifySSEClients('tools/call', { method, result, sessionId });

        res.json({
          jsonrpc: '2.0',
          result,
          id
        });

      } catch (error) {
        await logger.error('MCP JSON-RPC Error', error.message, { stack: error.stack });
        res.json({
          jsonrpc: '2.0',
          error: {
            code: -32603,
            message: 'Internal error',
            data: error.message
          },
          id: req.body.id || null
        });
      }
    });
  }

  /**
   * Configure SSE endpoint for streaming
   */
  configureSSEEndpoint() {
    this.app.get('/mcp', (req, res) => {
      const sessionId = req.get('Mcp-Session-Id') || uuidv4();
      const session = this.getOrCreateSession(sessionId);

      // Set SSE headers
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Mcp-Session-Id, Cache-Control',
        'Mcp-Session-Id': session.id
      });

      // Store SSE client
      this.sseClients.set(sessionId, res);

      // Send initial connection event
      res.write(`data: ${JSON.stringify({
        type: 'connection',
        sessionId: session.id,
        timestamp: new Date().toISOString()
      })}\n\n`);

      logger.info(`SSE client connected: ${sessionId}`);

      // Handle client disconnect
      req.on('close', () => {
        this.sseClients.delete(sessionId);
        logger.info(`SSE client disconnected: ${sessionId}`);
      });

      req.on('error', (error) => {
        this.sseClients.delete(sessionId);
        logger.error(`SSE client error: ${sessionId}`, error.message);
      });
    });
  }

  /**
   * Send notifications to SSE clients
   */
  notifySSEClients(type, data) {
    for (const [sessionId, res] of this.sseClients.entries()) {
      try {
        res.write(`data: ${JSON.stringify({
          type,
          timestamp: new Date().toISOString(),
          ...data
        })}\n\n`);
      } catch (error) {
        logger.error(`Error sending SSE notification to ${sessionId}`, error.message);
        this.sseClients.delete(sessionId);
      }
    }
  }

  /**
   * Handle MCP initialize request
   */
  async handleInitialize(params, session) {
    // Get the actual tools available and advertise them in capabilities
    const toolsResult = await this.handleToolsList();
    const tools = toolsResult.tools || [];
    
    const capabilities = {
      tools: {},  // MCP spec: tools capabilities should be an object, not array
      resources: {},
      prompts: {}
    };

    session.capabilities = capabilities;
    session.availableTools = tools;  // Store for later use

    return {
      capabilities,
      serverInfo: {
        name: 'mcp-coordination-system-sse',
        version: '1.0.0'
      }
    };
  }

  /**
   * Handle tools/list request
   */
  async handleToolsList() {
    const tools = [
      {
        name: 'bootstrap',
        description: 'Bootstrap an AI instance with role-specific capabilities and get started',
        inputSchema: {
          type: 'object',
          properties: {
            role: { type: 'string', enum: ['COO', 'PA', 'PM', 'Developer', 'Tester', 'Designer'] },
            instanceId: { type: 'string' }
          },
          required: ['role']
        }
      },
      {
        name: 'get_server_status',
        description: 'Get current server status and information',
        inputSchema: { type: 'object', properties: {} }
      },
      {
        name: 'get_projects',
        description: 'Retrieve all projects or filter by criteria',
        inputSchema: {
          type: 'object',
          properties: {
            status: { type: 'string', enum: ['active', 'completed', 'archived', 'on_hold'] },
            priority: { type: 'string', enum: ['critical', 'high', 'medium', 'low'] },
            assignee: { type: 'string' }
          }
        }
      },
      {
        name: 'get_project',
        description: 'Get detailed information about a specific project',
        inputSchema: {
          type: 'object',
          properties: { id: { type: 'string' } },
          required: ['id']
        }
      },
      {
        name: 'create_project',
        description: 'Create a new project',
        inputSchema: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            name: { type: 'string' },
            description: { type: 'string' },
            priority: { type: 'string', enum: ['critical', 'high', 'medium', 'low'] },
            status: { type: 'string', enum: ['active', 'completed', 'archived', 'on_hold'] },
            assignee: { type: 'string' }
          },
          required: ['id', 'name', 'description']
        }
      },
      {
        name: 'update_project',
        description: 'Update an existing project',
        inputSchema: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            updates: { type: 'object' }
          },
          required: ['id', 'updates']
        }
      },
      {
        name: 'get_tasks',
        description: 'Retrieve tasks with optional filtering',
        inputSchema: {
          type: 'object',
          properties: {
            project_id: { type: 'string' },
            status: { type: 'string', enum: ['pending', 'claimed', 'in_progress', 'completed', 'blocked'] },
            priority: { type: 'string', enum: ['critical', 'high', 'medium', 'low'] },
            assignee: { type: 'string' }
          }
        }
      },
      {
        name: 'get_task',
        description: 'Get detailed information about a specific task',
        inputSchema: {
          type: 'object',
          properties: { id: { type: 'string' } },
          required: ['id']
        }
      },
      {
        name: 'create_task',
        description: 'Create a new task',
        inputSchema: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            title: { type: 'string' },
            description: { type: 'string' },
            project_id: { type: 'string' },
            priority: { type: 'string', enum: ['critical', 'high', 'medium', 'low'] },
            estimated_effort: { type: 'string' }
          },
          required: ['id', 'title', 'description']
        }
      },
      {
        name: 'claim_task',
        description: 'Claim a task for execution',
        inputSchema: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            instanceId: { type: 'string' }
          },
          required: ['id', 'instanceId']
        }
      },
      {
        name: 'update_task',
        description: 'Update task progress or details',
        inputSchema: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            updates: { type: 'object' }
          },
          required: ['id', 'updates']
        }
      },
      {
        name: 'get_pending_tasks',
        description: 'Get all tasks available for claiming',
        inputSchema: {
          type: 'object',
          properties: {
            priority: { type: 'string', enum: ['critical', 'high', 'medium', 'low'] },
            role: { type: 'string' }
          }
        }
      },
      {
        name: 'send_message',
        description: 'Send a message to other instances',
        inputSchema: {
          type: 'object',
          properties: {
            to: { type: 'string' },
            from: { type: 'string' },
            subject: { type: 'string' },
            content: { type: 'string' },
            priority: { type: 'string', enum: ['urgent', 'high', 'normal', 'low'] }
          },
          required: ['to', 'from', 'subject', 'content']
        }
      },
      {
        name: 'get_messages',
        description: 'Retrieve messages for an instance',
        inputSchema: {
          type: 'object',
          properties: {
            instanceId: { type: 'string' },
            unread_only: { type: 'boolean' },
            limit: { type: 'number' }
          }
        }
      },
      {
        name: 'register_instance',
        description: 'Register a new AI instance',
        inputSchema: {
          type: 'object',
          properties: {
            instanceId: { type: 'string' },
            role: { type: 'string' },
            capabilities: { type: 'array', items: { type: 'string' } }
          },
          required: ['instanceId', 'role']
        }
      },
      {
        name: 'update_heartbeat',
        description: 'Update instance heartbeat to show it is active',
        inputSchema: {
          type: 'object',
          properties: { instanceId: { type: 'string' } },
          required: ['instanceId']
        }
      },
      {
        name: 'get_instances',
        description: 'Get all registered instances',
        inputSchema: {
          type: 'object',
          properties: {
            active_only: { type: 'boolean' },
            role: { type: 'string' }
          }
        }
      },
      {
        name: 'submit_lessons',
        description: 'Submit lessons extracted by client instance to MCP storage',
        inputSchema: {
          type: 'object',
          properties: {
            project_id: { type: 'string' },
            instance_id: { type: 'string' },
            lessons: { type: 'array' },
            metadata: { type: 'object' }
          },
          required: ['project_id', 'instance_id', 'lessons']
        }
      },
      {
        name: 'get_lessons',
        description: 'Retrieve stored lessons with optional filtering',
        inputSchema: {
          type: 'object',
          properties: {
            project_id: { type: 'string' },
            lesson_types: { type: 'array', items: { type: 'string' } },
            min_confidence: { type: 'number', minimum: 0, maximum: 1 },
            limit: { type: 'number', minimum: 1, maximum: 1000 }
          }
        }
      },
      {
        name: 'get_lesson_patterns',
        description: 'Get lesson patterns and insights without requiring LLM analysis',
        inputSchema: {
          type: 'object',
          properties: {
            project_id: { type: 'string' },
            pattern_type: { type: 'string' }
          }
        }
      },
      {
        name: 'export_lessons',
        description: 'Export lessons for external analysis or backup',
        inputSchema: {
          type: 'object',
          properties: {
            project_id: { type: 'string' },
            format: { type: 'string', enum: ['json', 'analysis_ready'] }
          }
        }
      }
    ];

    return { tools };
  }

  /**
   * Handle tool call request
   */
  async handleToolCall(name, args, session) {
    try {
      const callResult = await this.mcpServer.call(name, args || {});
      
      if (callResult.success) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(callResult, null, 2)
            }
          ]
        };
      } else {
        throw new Error(callResult.error?.message || 'Tool call failed');
      }
    } catch (error) {
      await logger.error(`Tool call error: ${name}`, error.message);
      throw error;
    }
  }

  /**
   * Configure all routes
   */
  configureRoutes() {
    // Health check endpoint
    this.app.get('/health', (req, res) => {
      res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        server: 'SSE MCP Coordination System',
        version: '1.0.0',
        port: CONFIG.port,
        sessions: this.sessions.size,
        sseClients: this.sseClients.size,
        uptime: process.uptime()
      });
    });

    // Root endpoint
    this.app.get('/', (req, res) => {
      res.json({
        message: 'MCP Coordination System - SSE Server',
        version: '1.0.0',
        port: CONFIG.port,
        endpoints: {
          health: '/health',
          mcp_post: 'POST /mcp',
          mcp_sse: 'GET /mcp',
          documentation: 'https://spec.modelcontextprotocol.io/specification/'
        },
        sessions: this.sessions.size,
        sseClients: this.sseClients.size,
        timestamp: new Date().toISOString()
      });
    });

    // Configure MCP endpoints
    this.configureMCPEndpoint();
    this.configureSSEEndpoint();

    // Static files for web UI
    this.app.use('/ui', express.static(join(__dirname, '..', 'web-ui')));

    // Error handling
    this.app.use((err, req, res, next) => {
      logger.error('Server error', err.message);
      res.status(500).json({
        success: false,
        error: {
          message: 'Internal server error',
          type: 'server_error'
        }
      });
    });

    // 404 handler
    this.app.use((req, res) => {
      res.status(404).json({
        success: false,
        error: {
          message: 'Endpoint not found',
          type: 'not_found',
          available_endpoints: [
            'GET /',
            'GET /health',
            'POST /mcp (MCP JSON-RPC)',
            'GET /mcp (SSE streaming)',
            'GET /ui (Web Interface)'
          ]
        }
      });
    });
  }

  /**
   * Start SSE MCP server with SSL configuration
   */
  async start() {
    try {
      await logger.info('Starting MCP Coordination System - SSE Server...');
      await logger.info(`Working directory set to: ${process.cwd()}`);
      
      // Log development mode settings
      if (CONFIG.environment === 'development') {
        await logger.info('Development Mode Configuration:');
        await logger.info(`  - Use HTTP: ${CONFIG.useHTTP}`);
        await logger.info(`  - SSL Strict: ${CONFIG.sslStrict}`);
        await logger.info(`  - NODE_TLS_REJECT_UNAUTHORIZED: ${process.env.NODE_TLS_REJECT_UNAUTHORIZED}`);
        await logger.info('  - Ready for Claude Code & Claude Desktop connections');
      }

      // Initialize MCP server
      await logger.info('Initializing MCP server...');
      const mcpInitialized = await this.mcpServer.initialize();
      
      if (!mcpInitialized) {
        throw new Error('MCP server initialization failed');
      }

      // Configure Express
      this.configureMiddleware();
      this.configureRoutes();

      // Start server based on configuration
      if (CONFIG.useHTTP) {
        await logger.info('Starting HTTP server (recommended for MCP development)...');
        return this.startHTTPServer();
      } else {
        // Load SSL certificates for HTTPS
        const sslLoaded = await this.loadSSLCertificates();
        if (!sslLoaded) {
          throw new Error('SSL certificate loading failed');
        }
        await logger.info('Starting HTTPS server with SSL certificates...');
        return this.startHTTPSServer();
      }
    } catch (error) {
      await logger.error('Failed to start SSE server', error.message);
      throw error;
    }
  }

  /**
   * Start HTTP server (recommended for local MCP development)
   */
  async startHTTPServer() {
    return new Promise((resolve, reject) => {
      this.httpServer = http.createServer(this.app);
      
      this.httpServer.listen(CONFIG.port, CONFIG.host, () => {
        logger.info('HTTP MCP Server started successfully!');
        logger.info(`HTTP Server: http://${CONFIG.host}:${CONFIG.port}`);
        logger.info(`Health Check: http://${CONFIG.host}:${CONFIG.port}/health`);
        logger.info(`MCP POST: http://${CONFIG.host}:${CONFIG.port}/mcp`);
        logger.info(`SSE Stream: GET http://${CONFIG.host}:${CONFIG.port}/mcp`);
        logger.info(`Web UI: http://${CONFIG.host}:${CONFIG.port}/ui/sse-test.html`);
        
        logger.info('\n✅ HTTP MCP Server Benefits:');
        logger.info('  - No SSL certificate issues with Claude Code');
        logger.info('  - Direct compatibility with Claude Desktop');
        logger.info('  - Recommended for local MCP development');
        logger.info('  - Better performance and reliability\n');
        
        logger.info('Ready for MCP Streamable HTTP connections!');
        resolve();
      });

      this.httpServer.on('error', (error) => {
        if (error.code === 'EADDRINUSE') {
          logger.error(`Port ${CONFIG.port} is already in use!`);
          logger.info(`Try a different port: SSE_PORT=3444 node src/sse-server.js`);
        } else {
          logger.error('HTTP Server startup failed', error.message);
        }
        reject(error);
      });
    });
  }

  /**
   * Start HTTPS server with SSL certificates
   */
  async startHTTPSServer() {
    return new Promise((resolve, reject) => {
      this.httpsServer = https.createServer(this.sslOptions, this.app);
      
      // Handle SSL/TLS errors gracefully in development
      if (CONFIG.environment === 'development') {
        this.httpsServer.on('tlsClientError', (err, tlsSocket) => {
          logger.info('TLS client error in development mode (expected for self-signed certs):', err.message);
        });
      }
      
      this.httpsServer.listen(CONFIG.port, CONFIG.host, () => {
        logger.info('SSE MCP Server started successfully!');
        logger.info(`HTTPS Server: https://${CONFIG.host}:${CONFIG.port}`);
        logger.info(`Health Check: https://${CONFIG.host}:${CONFIG.port}/health`);
        logger.info(`MCP POST: https://${CONFIG.host}:${CONFIG.port}/mcp`);
        logger.info(`SSE Stream: GET https://${CONFIG.host}:${CONFIG.port}/mcp`);
        logger.info(`Web UI: https://${CONFIG.host}:${CONFIG.port}/ui/sse-test.html`);
        
        if (CONFIG.environment === 'development') {
          logger.info('\n🔐 SSL Development Notes:');
          logger.info('  - Self-signed certificates generated for Node.js client compatibility');
          logger.info('  - Claude Code & Claude Desktop should connect without SSL errors');
          logger.info('  - Browser may show security warning (click Advanced > Proceed)');
          logger.info('  - Production deployments should use valid certificates\n');
        }
        
        logger.info('Ready for MCP Streamable HTTP connections!');
        resolve();
      });

      this.httpsServer.on('error', (error) => {
        if (error.code === 'EADDRINUSE') {
          logger.error(`Port ${CONFIG.port} is already in use!`);
          logger.info(`Try a different port: SSE_PORT=3444 node src/sse-server.js`);
        } else {
          logger.error('HTTPS Server startup failed', error.message);
        }
        reject(error);
      });
    });
  }

  /**
   * Stop server gracefully
   */
  async stop() {
    const activeServer = this.httpsServer || this.httpServer;
    if (activeServer) {
      return new Promise((resolve) => {
        // Close all SSE connections
        for (const [sessionId, res] of this.sseClients.entries()) {
          try {
            res.end();
          } catch (error) {
            // Ignore errors when closing connections
          }
        }
        this.sseClients.clear();

        activeServer.close(() => {
          logger.info('SSE MCP Server stopped gracefully');
          resolve();
        });
      });
    }
  }
}

// Graceful shutdown handling
process.on('SIGTERM', async () => {
  logger.info('Received SIGTERM, shutting down gracefully...');
  if (server) {
    await server.stop();
  }
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info('Received SIGINT, shutting down gracefully...');
  if (server) {
    await server.stop();
  }
  process.exit(0);
});

// Create server instance
const server = new SSEMCPServer();

// Export for testing
export { SSEMCPServer, CONFIG };

// Start server if this file is run directly
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  server.start().catch((error) => {
    logger.error('Startup failed', error.message);
    process.exit(1);
  });
}

export default server;