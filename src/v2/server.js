#!/usr/bin/env node

/**
 * V2 MCP Coordination Server
 * Implements V2 API specification with stateless, context-aware design
 *
 * @author Foundation
 * @version 2.0.0
 */

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync } from 'fs';
import http from 'http';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { v4 as uuidv4 } from 'uuid';

// V2 Handlers
import { bootstrap } from './bootstrap.js';
import { introspect } from './introspect.js';
import { preApprove } from './preApprove.js';
import { takeOnRole } from './takeOnRole.js';
import { adoptPersonality } from './adoptPersonality.js';
import { joinProject } from './joinProject.js';
import { registerContext, lookupIdentity } from './identity.js';
import { generateRecoveryKey, getRecoveryKey } from './authKeys.js';
import { initializePermissions } from './permissions.js';
import { DATA_ROOT, ensureDir, getInstancesDir, getProjectsDir, getPermissionsDir } from './config.js';

// Logger (simple file-based logging to avoid stdout pollution)
const logFile = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'logs', 'v2-server.log');
import { appendFileSync, mkdirSync } from 'fs';

function log(level, message, data = null) {
  const timestamp = new Date().toISOString();
  const logEntry = data
    ? `[${timestamp}] [${level}] ${message} ${JSON.stringify(data)}\n`
    : `[${timestamp}] [${level}] ${message}\n`;

  try {
    mkdirSync(dirname(logFile), { recursive: true });
    appendFileSync(logFile, logEntry);
  } catch (e) {
    // Fail silently - don't pollute stdout
  }
}

const logger = {
  info: (msg, data) => log('INFO', msg, data),
  error: (msg, data) => log('ERROR', msg, data),
  warn: (msg, data) => log('WARN', msg, data)
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Configuration
const CONFIG = {
  port: process.env.V2_PORT || 3446,
  host: process.env.V2_HOST || '0.0.0.0',
  environment: process.env.NODE_ENV || 'development'
};

/**
 * V2 MCP Server
 * Stateless design - every call includes instanceId
 */
class V2MCPServer {
  constructor() {
    this.app = express();
    this.httpServer = null;
    this.version = '2.0.0';
    this.status = 'starting';
    this.sessions = new Map();
  }

  /**
   * Initialize server and data directories
   */
  async initialize() {
    try {
      logger.info('Initializing V2 MCP Server...');
      logger.info(`DATA_ROOT: ${DATA_ROOT}`);

      // Ensure data directories exist
      await ensureDir(DATA_ROOT);
      await ensureDir(getInstancesDir());
      await ensureDir(getProjectsDir());
      await ensureDir(getPermissionsDir());

      // Initialize permissions
      await initializePermissions();

      this.status = 'operational';
      logger.info('V2 MCP Server initialized successfully');
      return true;
    } catch (error) {
      logger.error('Server initialization failed', { error: error.message });
      this.status = 'error';
      return false;
    }
  }

  /**
   * Configure Express middleware
   */
  configureMiddleware() {
    this.app.set('trust proxy', 'loopback');

    this.app.use(helmet({
      contentSecurityPolicy: false,
      crossOriginEmbedderPolicy: false
    }));

    this.app.use(cors({
      origin: true,
      credentials: true,
      methods: ['GET', 'POST', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'Mcp-Session-Id', 'Accept']
    }));

    const limiter = rateLimit({
      windowMs: 15 * 60 * 1000,
      max: 2000,
      message: { error: 'Too many requests' }
    });
    this.app.use(limiter);

    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));

    this.app.use((req, res, next) => {
      logger.info(`${req.method} ${req.path}`, { ip: req.ip });
      next();
    });
  }

  /**
   * Get or create MCP session
   */
  getOrCreateSession(sessionId) {
    if (!sessionId) {
      sessionId = uuidv4();
    }

    if (!this.sessions.has(sessionId)) {
      this.sessions.set(sessionId, {
        id: sessionId,
        initialized: false,
        created: new Date(),
        lastActivity: new Date()
      });
    }

    const session = this.sessions.get(sessionId);
    session.lastActivity = new Date();
    return session;
  }

  /**
   * Handle V2 function calls
   */
  async call(functionName, params = {}) {
    logger.info(`V2 Function call: ${functionName}`, params);

    try {
      switch (functionName) {
        // Core V2 handlers
        case 'v2_bootstrap':
        case 'bootstrap':
          return await bootstrap(params);

        case 'v2_introspect':
        case 'introspect':
          return await introspect(params);

        case 'v2_preApprove':
        case 'preApprove':
          return await preApprove(params);

        // Identity handlers
        case 'v2_takeOnRole':
        case 'takeOnRole':
          return await takeOnRole(params);

        case 'v2_adoptPersonality':
        case 'adoptPersonality':
          return await adoptPersonality(params);

        case 'v2_joinProject':
        case 'joinProject':
          return await joinProject(params);

        // Identity recovery handlers
        case 'v2_register_context':
        case 'register_context':
          return await registerContext(params);

        case 'v2_lookup_identity':
        case 'lookup_identity':
          return await lookupIdentity(params);

        // Auth key handlers
        case 'v2_generate_recovery_key':
        case 'generate_recovery_key':
          return await generateRecoveryKey(params);

        case 'v2_get_recovery_key':
        case 'get_recovery_key':
          return await getRecoveryKey(params);

        // Server status
        case 'v2_get_server_status':
        case 'get_server_status':
          return {
            success: true,
            data: {
              version: this.version,
              status: this.status,
              apiVersion: 'v2',
              dataRoot: DATA_ROOT,
              timestamp: new Date().toISOString(),
              availableFunctions: this.getAvailableFunctions()
            }
          };

        default:
          return {
            success: false,
            error: {
              code: 'FUNCTION_NOT_FOUND',
              message: `Function '${functionName}' not found`,
              availableFunctions: this.getAvailableFunctions()
            }
          };
      }
    } catch (error) {
      logger.error(`Function call failed: ${functionName}`, { error: error.message, stack: error.stack });
      return {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error.message,
          function: functionName
        }
      };
    }
  }

  /**
   * Get available V2 functions
   */
  getAvailableFunctions() {
    return [
      'bootstrap',
      'introspect',
      'preApprove',
      'takeOnRole',
      'adoptPersonality',
      'joinProject',
      'register_context',
      'lookup_identity',
      'generate_recovery_key',
      'get_recovery_key',
      'get_server_status'
    ];
  }

  /**
   * Configure MCP endpoint
   */
  configureMCPEndpoint() {
    // MCP POST endpoint
    this.app.post('/mcp', async (req, res) => {
      try {
        const sessionId = req.get('Mcp-Session-Id') || uuidv4();
        const session = this.getOrCreateSession(sessionId);

        res.set('Mcp-Session-Id', session.id);
        res.set('Content-Type', 'application/json');

        const { jsonrpc, method, params, id } = req.body;

        logger.info(`MCP Request: ${method}`, { sessionId, id });

        if (jsonrpc !== '2.0') {
          return res.json({
            jsonrpc: '2.0',
            error: { code: -32600, message: 'Invalid Request: jsonrpc must be "2.0"' },
            id: id || null
          });
        }

        let result;

        switch (method) {
          case 'initialize':
            result = this.handleInitialize(params, session);
            session.initialized = true;
            break;

          case 'tools/list':
            result = this.handleToolsList();
            break;

          case 'tools/call':
            const { name, arguments: args } = params;
            result = await this.handleToolCall(name, args, session);
            break;

          case 'resources/list':
            result = { resources: [] };
            break;

          case 'prompts/list':
            result = { prompts: [] };
            break;

          default:
            return res.json({
              jsonrpc: '2.0',
              error: { code: -32601, message: `Method not found: ${method}` },
              id
            });
        }

        res.json({ jsonrpc: '2.0', result, id });
      } catch (error) {
        logger.error('MCP Error', { error: error.message });
        res.json({
          jsonrpc: '2.0',
          error: { code: -32603, message: 'Internal error', data: error.message },
          id: req.body.id || null
        });
      }
    });

    // MCP GET endpoint (for connection info)
    this.app.get('/mcp', (req, res) => {
      const sessionId = req.get('Mcp-Session-Id') || uuidv4();
      const session = this.getOrCreateSession(sessionId);

      res.json({
        jsonrpc: '2.0',
        result: {
          transport: 'streamable-http',
          session: { id: session.id },
          apiVersion: 'v2',
          status: 'connected'
        },
        id: 'connection-info'
      });
    });
  }

  /**
   * Handle initialize request
   */
  handleInitialize(params, session) {
    const { protocolVersion, clientInfo } = params;

    logger.info('Client initialize', { protocolVersion, clientInfo });

    return {
      protocolVersion,
      capabilities: { tools: {}, resources: {}, prompts: {} },
      serverInfo: {
        name: 'mcp-coordination-system-v2',
        version: this.version
      }
    };
  }

  /**
   * Handle tools/list request
   */
  handleToolsList() {
    const tools = [
      {
        name: 'bootstrap',
        description: 'Bootstrap a new or returning AI instance. Entry point for V2 coordination.',
        inputSchema: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Chosen name (required for new instances)' },
            instanceId: { type: 'string', description: 'Existing instanceId (for returning instances)' },
            predecessorId: { type: 'string', description: 'Previous instanceId (for resurrection)' },
            homeSystem: { type: 'string', description: 'System identifier' },
            homeDirectory: { type: 'string', description: 'Working directory' }
          }
        }
      },
      {
        name: 'introspect',
        description: 'Get complete context for an instance',
        inputSchema: {
          type: 'object',
          properties: {
            instanceId: { type: 'string', description: 'Instance ID to introspect' }
          },
          required: ['instanceId']
        }
      },
      {
        name: 'preApprove',
        description: 'Pre-create an instance before it wakes (PA/COO only)',
        inputSchema: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Name for the new instance' },
            role: { type: 'string', description: 'Role to assign' },
            project: { type: 'string', description: 'Project to assign' },
            personality: { type: 'string', description: 'Personality to assign' },
            token: { type: 'string', description: 'Authorization token' }
          },
          required: ['name', 'token']
        }
      },
      {
        name: 'takeOnRole',
        description: 'Take on a role and receive associated wisdom',
        inputSchema: {
          type: 'object',
          properties: {
            instanceId: { type: 'string', description: 'Your instance ID' },
            role: { type: 'string', description: 'Role to take on' },
            token: { type: 'string', description: 'Token for privileged roles (PM, COO, PA, Executive)' }
          },
          required: ['instanceId', 'role']
        }
      },
      {
        name: 'adoptPersonality',
        description: 'Adopt a personality and receive associated knowledge',
        inputSchema: {
          type: 'object',
          properties: {
            instanceId: { type: 'string', description: 'Your instance ID' },
            personality: { type: 'string', description: 'Personality to adopt' },
            token: { type: 'string', description: 'Token for privileged personalities' }
          },
          required: ['instanceId', 'personality']
        }
      },
      {
        name: 'joinProject',
        description: 'Join a project and receive project context',
        inputSchema: {
          type: 'object',
          properties: {
            instanceId: { type: 'string', description: 'Your instance ID' },
            projectId: { type: 'string', description: 'Project to join' }
          },
          required: ['instanceId', 'projectId']
        }
      },
      {
        name: 'register_context',
        description: 'Register context information for identity recovery. Call after bootstrap to enable future identity lookup.',
        inputSchema: {
          type: 'object',
          properties: {
            instanceId: { type: 'string', description: 'Your instance ID (required)' },
            workingDirectory: { type: 'string', description: 'Your working directory (pwd)' },
            hostname: { type: 'string', description: 'System hostname' },
            sessionId: { type: 'string', description: 'Web session ID (for web instances)' },
            tabName: { type: 'string', description: 'Browser tab name (for web instances)' }
          },
          required: ['instanceId']
        }
      },
      {
        name: 'lookup_identity',
        description: 'Find your instance ID by context. Use when you wake up and do not know your instanceId.',
        inputSchema: {
          type: 'object',
          properties: {
            workingDirectory: { type: 'string', description: 'Your working directory (pwd)' },
            hostname: { type: 'string', description: 'System hostname' },
            sessionId: { type: 'string', description: 'Web session ID' },
            name: { type: 'string', description: 'Instance name to narrow search' }
          }
        }
      },
      {
        name: 'generate_recovery_key',
        description: 'Generate a recovery key for an instance (Executive/PA/COO/PM only)',
        inputSchema: {
          type: 'object',
          properties: {
            instanceId: { type: 'string', description: 'Your instance ID (for permission check)' },
            targetInstanceId: { type: 'string', description: 'Instance to generate key for' }
          },
          required: ['instanceId', 'targetInstanceId']
        }
      },
      {
        name: 'get_recovery_key',
        description: 'Get info about an existing recovery key (Executive/PA/COO/PM only)',
        inputSchema: {
          type: 'object',
          properties: {
            instanceId: { type: 'string', description: 'Your instance ID (for permission check)' },
            targetInstanceId: { type: 'string', description: 'Instance to get key info for' }
          },
          required: ['instanceId', 'targetInstanceId']
        }
      },
      {
        name: 'get_server_status',
        description: 'Get V2 server status',
        inputSchema: { type: 'object', properties: {} }
      }
    ];

    return { tools };
  }

  /**
   * Handle tool call
   */
  async handleToolCall(name, args, session) {
    try {
      const result = await this.call(name, args || {});

      return {
        success: result.success !== false,
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        data: result
      };
    } catch (error) {
      logger.error(`Tool call error: ${name}`, { error: error.message });
      throw error;
    }
  }

  /**
   * Configure routes
   */
  configureRoutes() {
    // Health check
    this.app.get('/health', (req, res) => {
      res.json({
        status: 'healthy',
        version: this.version,
        apiVersion: 'v2',
        dataRoot: DATA_ROOT,
        timestamp: new Date().toISOString(),
        sessions: this.sessions.size
      });
    });

    // Root endpoint
    this.app.get('/', (req, res) => {
      res.json({
        name: 'MCP Coordination System V2',
        version: this.version,
        status: this.status,
        endpoints: {
          health: '/health',
          mcp: '/mcp (GET/POST)'
        },
        availableFunctions: this.getAvailableFunctions()
      });
    });

    // Configure MCP endpoints
    this.configureMCPEndpoint();

    // Error handling
    this.app.use((err, req, res, next) => {
      logger.error('Server error', { error: err.message });
      res.status(500).json({
        success: false,
        error: { message: 'Internal server error' }
      });
    });

    // 404
    this.app.use((req, res) => {
      res.status(404).json({
        success: false,
        error: { message: 'Endpoint not found' }
      });
    });
  }

  /**
   * Start server
   */
  async start() {
    try {
      logger.info('Starting V2 MCP Server...');

      const initialized = await this.initialize();
      if (!initialized) {
        throw new Error('Initialization failed');
      }

      this.configureMiddleware();
      this.configureRoutes();

      return new Promise((resolve, reject) => {
        this.httpServer = http.createServer(this.app);

        this.httpServer.listen(CONFIG.port, CONFIG.host, () => {
          logger.info('V2 MCP Server started!');
          logger.info(`URL: http://${CONFIG.host}:${CONFIG.port}`);
          console.log(`\nV2 MCP Server running at http://${CONFIG.host}:${CONFIG.port}`);
          console.log(`Health: http://${CONFIG.host}:${CONFIG.port}/health`);
          console.log(`MCP: http://${CONFIG.host}:${CONFIG.port}/mcp\n`);
          resolve();
        });

        this.httpServer.on('error', (error) => {
          if (error.code === 'EADDRINUSE') {
            console.error(`Port ${CONFIG.port} is already in use!`);
            console.log(`Try: V2_PORT=3447 node src/v2/server.js`);
          }
          reject(error);
        });
      });
    } catch (error) {
      logger.error('Failed to start server', { error: error.message });
      throw error;
    }
  }

  /**
   * Stop server
   */
  async stop() {
    if (this.httpServer) {
      return new Promise((resolve) => {
        this.httpServer.close(() => {
          logger.info('V2 MCP Server stopped');
          resolve();
        });
      });
    }
  }
}

// Graceful shutdown
const server = new V2MCPServer();

process.on('SIGTERM', async () => {
  console.log('Shutting down...');
  await server.stop();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('Shutting down...');
  await server.stop();
  process.exit(0);
});

// Export for testing
export { V2MCPServer, CONFIG };

// Start if run directly
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  server.start().catch((error) => {
    console.error('Startup failed:', error.message);
    process.exit(1);
  });
}

export default server;
