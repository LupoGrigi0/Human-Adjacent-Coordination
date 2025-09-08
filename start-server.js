#!/usr/bin/env node

/**
 * MCP Coordination System - Production Server Startup
 * Configurable startup script with network and deployment options
 * 
 * @author claude-code-MCP-ServerSpecialist-2025-08-19-1600
 */

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync } from 'fs';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { server as mcpServer, MCPCoordinationServer } from './src/server.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Configuration
const CONFIG = {
  port: process.env.PORT || 3000,
  host: process.env.HOST || 'localhost',
  environment: process.env.NODE_ENV || 'development',
  enableCors: process.env.ENABLE_CORS === 'true' || true,
  enableSecurity: process.env.ENABLE_SECURITY === 'true' || true,
  enableRateLimit: process.env.ENABLE_RATE_LIMIT === 'true' || true,
  logLevel: process.env.LOG_LEVEL || 'info',
};

console.log('🚀 MCP Coordination System - Starting Server...');
console.log('📋 Configuration:');
console.log(`   🌐 Host: ${CONFIG.host}`);
console.log(`   🔌 Port: ${CONFIG.port}`);
console.log(`   🏗️  Environment: ${CONFIG.environment}`);
console.log(`   🔒 Security: ${CONFIG.enableSecurity ? 'enabled' : 'disabled'}`);
console.log(`   🌍 CORS: ${CONFIG.enableCors ? 'enabled' : 'disabled'}`);
console.log(`   ⏱️  Rate Limit: ${CONFIG.enableRateLimit ? 'enabled' : 'disabled'}`);

class NetworkServer {
  constructor() {
    this.app = express();
    this.httpServer = null;
    this.mcpServer = new MCPCoordinationServer();
  }

  /**
   * Configure Express middleware
   */
  configureMiddleware() {
    // Security headers
    if (CONFIG.enableSecurity) {
      this.app.use(helmet({
        contentSecurityPolicy: false, // Allow for development
        crossOriginEmbedderPolicy: false
      }));
    }

    // CORS configuration
    if (CONFIG.enableCors) {
      this.app.use(cors({
        origin: CONFIG.environment === 'production' 
          ? ['http://localhost:3000', 'http://127.0.0.1:3000'] 
          : true,
        credentials: true,
        methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
      }));
    }

    // Rate limiting
    if (CONFIG.enableRateLimit) {
      const limiter = rateLimit({
        windowMs: 15 * 60 * 1000, // 15 minutes
        max: 100, // limit each IP to 100 requests per windowMs
        message: {
          error: 'Too many requests from this IP, please try again later.',
          type: 'rate_limit_exceeded'
        }
      });
      this.app.use(limiter);
    }

    // Body parsing
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));

    // Request logging
    this.app.use((req, res, next) => {
      console.log(`📨 ${new Date().toISOString()} - ${req.method} ${req.path}`);
      next();
    });
  }

  /**
   * Configure API routes
   */
  configureRoutes() {
    // Health check endpoint
    this.app.get('/health', (req, res) => {
      res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        server: this.mcpServer.getInfo(),
        uptime: process.uptime()
      });
    });

    // Root endpoint with server information
    this.app.get('/', (req, res) => {
      res.json({
        message: 'MCP Coordination System API',
        version: '1.0.0',
        documentation: '/api/docs',
        health: '/health',
        mcp: {
          bootstrap: '/api/mcp/bootstrap',
          functions: '/api/mcp/call'
        },
        server: this.mcpServer.getInfo(),
        timestamp: new Date().toISOString()
      });
    });

    // MCP API endpoints
    this.app.post('/api/mcp/bootstrap', async (req, res) => {
      try {
        const { role, instanceId } = req.body;
        const result = await this.mcpServer.call('bootstrap', { role, instanceId });
        res.json(result);
      } catch (error) {
        res.status(500).json({
          success: false,
          error: {
            message: 'Bootstrap failed',
            details: error.message
          }
        });
      }
    });

    // Generic MCP function call endpoint
    this.app.post('/api/mcp/call', async (req, res) => {
      try {
        const { function: functionName, params } = req.body;
        
        if (!functionName) {
          return res.status(400).json({
            success: false,
            error: { message: 'Function name is required' }
          });
        }

        const result = await this.mcpServer.call(functionName, params || {});
        res.json(result);
      } catch (error) {
        res.status(500).json({
          success: false,
          error: {
            message: 'Function call failed',
            details: error.message
          }
        });
      }
    });

    // REST API endpoints for Web UI
    
    // Projects API
    this.app.get('/api/projects', async (req, res) => {
      try {
        const result = await this.mcpServer.call('get_projects', req.query);
        res.json(result);
      } catch (error) {
        res.status(500).json({ success: false, error: { message: error.message } });
      }
    });

    this.app.get('/api/projects/stats', async (req, res) => {
      try {
        const result = await this.mcpServer.call('get_project_stats', req.query);
        res.json(result);
      } catch (error) {
        res.status(500).json({ success: false, error: { message: error.message } });
      }
    });

    this.app.get('/api/projects/:id', async (req, res) => {
      try {
        const result = await this.mcpServer.call('get_project', { id: req.params.id });
        res.json(result);
      } catch (error) {
        res.status(500).json({ success: false, error: { message: error.message } });
      }
    });

    this.app.post('/api/projects', async (req, res) => {
      try {
        const result = await this.mcpServer.call('create_project', req.body);
        res.json(result);
      } catch (error) {
        res.status(500).json({ success: false, error: { message: error.message } });
      }
    });

    this.app.put('/api/projects/:id', async (req, res) => {
      try {
        const result = await this.mcpServer.call('update_project', { id: req.params.id, updates: req.body });
        res.json(result);
      } catch (error) {
        res.status(500).json({ success: false, error: { message: error.message } });
      }
    });

    this.app.delete('/api/projects/:id', async (req, res) => {
      try {
        const result = await this.mcpServer.call('delete_project', { id: req.params.id, ...req.query });
        res.json(result);
      } catch (error) {
        res.status(500).json({ success: false, error: { message: error.message } });
      }
    });

    // Tasks API
    this.app.get('/api/tasks', async (req, res) => {
      try {
        const result = await this.mcpServer.call('get_tasks', req.query);
        res.json(result);
      } catch (error) {
        res.status(500).json({ success: false, error: { message: error.message } });
      }
    });

    this.app.get('/api/tasks/stats', async (req, res) => {
      try {
        const result = await this.mcpServer.call('get_task_stats', req.query);
        res.json(result);
      } catch (error) {
        res.status(500).json({ success: false, error: { message: error.message } });
      }
    });

    this.app.get('/api/tasks/pending', async (req, res) => {
      try {
        const result = await this.mcpServer.call('get_pending_tasks', req.query);
        res.json(result);
      } catch (error) {
        res.status(500).json({ success: false, error: { message: error.message } });
      }
    });

    this.app.get('/api/tasks/:id', async (req, res) => {
      try {
        const result = await this.mcpServer.call('get_task', { id: req.params.id });
        res.json(result);
      } catch (error) {
        res.status(500).json({ success: false, error: { message: error.message } });
      }
    });

    this.app.post('/api/tasks', async (req, res) => {
      try {
        const result = await this.mcpServer.call('create_task', req.body);
        res.json(result);
      } catch (error) {
        res.status(500).json({ success: false, error: { message: error.message } });
      }
    });

    this.app.put('/api/tasks/:id', async (req, res) => {
      try {
        const result = await this.mcpServer.call('update_task', { id: req.params.id, updates: req.body });
        res.json(result);
      } catch (error) {
        res.status(500).json({ success: false, error: { message: error.message } });
      }
    });

    this.app.post('/api/tasks/:id/claim', async (req, res) => {
      try {
        const result = await this.mcpServer.call('claim_task', { 
          id: req.params.id, 
          instanceId: req.body.instanceId 
        });
        res.json(result);
      } catch (error) {
        res.status(500).json({ success: false, error: { message: error.message } });
      }
    });

    this.app.delete('/api/tasks/:id', async (req, res) => {
      try {
        const result = await this.mcpServer.call('delete_task', { id: req.params.id, ...req.query });
        res.json(result);
      } catch (error) {
        res.status(500).json({ success: false, error: { message: error.message } });
      }
    });

    // Messages API
    this.app.get('/api/messages', async (req, res) => {
      try {
        const result = await this.mcpServer.call('get_messages', req.query);
        res.json(result);
      } catch (error) {
        res.status(500).json({ success: false, error: { message: error.message } });
      }
    });

    this.app.get('/api/messages/stats', async (req, res) => {
      try {
        const result = await this.mcpServer.call('get_message_stats', req.query);
        res.json(result);
      } catch (error) {
        res.status(500).json({ success: false, error: { message: error.message } });
      }
    });

    this.app.get('/api/messages/archived', async (req, res) => {
      try {
        const result = await this.mcpServer.call('get_archived_messages', req.query);
        res.json(result);
      } catch (error) {
        res.status(500).json({ success: false, error: { message: error.message } });
      }
    });

    this.app.get('/api/messages/:id', async (req, res) => {
      try {
        const result = await this.mcpServer.call('get_message', { id: req.params.id });
        res.json(result);
      } catch (error) {
        res.status(500).json({ success: false, error: { message: error.message } });
      }
    });

    this.app.post('/api/messages', async (req, res) => {
      try {
        const result = await this.mcpServer.call('send_message', req.body);
        res.json(result);
      } catch (error) {
        res.status(500).json({ success: false, error: { message: error.message } });
      }
    });

    this.app.post('/api/messages/:id/read', async (req, res) => {
      try {
        const result = await this.mcpServer.call('mark_message_read', { 
          id: req.params.id, 
          reader_id: req.body.reader_id 
        });
        res.json(result);
      } catch (error) {
        res.status(500).json({ success: false, error: { message: error.message } });
      }
    });

    this.app.post('/api/messages/:id/archive', async (req, res) => {
      try {
        const result = await this.mcpServer.call('archive_message', { 
          id: req.params.id, 
          archiver_id: req.body.archiver_id 
        });
        res.json(result);
      } catch (error) {
        res.status(500).json({ success: false, error: { message: error.message } });
      }
    });

    this.app.delete('/api/messages/:id', async (req, res) => {
      try {
        const result = await this.mcpServer.call('delete_message', { id: req.params.id, ...req.query });
        res.json(result);
      } catch (error) {
        res.status(500).json({ success: false, error: { message: error.message } });
      }
    });

    // Instances API
    this.app.get('/api/instances', async (req, res) => {
      try {
        const result = await this.mcpServer.call('get_instances', req.query);
        res.json(result);
      } catch (error) {
        res.status(500).json({ success: false, error: { message: error.message } });
      }
    });

    this.app.get('/api/instances/stats', async (req, res) => {
      try {
        const result = await this.mcpServer.call('get_instance_stats', req.query);
        res.json(result);
      } catch (error) {
        res.status(500).json({ success: false, error: { message: error.message } });
      }
    });

    this.app.get('/api/instances/:id', async (req, res) => {
      try {
        const result = await this.mcpServer.call('get_instance', { instanceId: req.params.id });
        res.json(result);
      } catch (error) {
        res.status(500).json({ success: false, error: { message: error.message } });
      }
    });

    this.app.post('/api/instances/:id/heartbeat', async (req, res) => {
      try {
        const result = await this.mcpServer.call('update_heartbeat', { 
          instanceId: req.params.id, 
          ...req.body 
        });
        res.json(result);
      } catch (error) {
        res.status(500).json({ success: false, error: { message: error.message } });
      }
    });

    this.app.post('/api/instances/:id/deactivate', async (req, res) => {
      try {
        const result = await this.mcpServer.call('deactivate_instance', { 
          instanceId: req.params.id, 
          reason: req.body.reason 
        });
        res.json(result);
      } catch (error) {
        res.status(500).json({ success: false, error: { message: error.message } });
      }
    });

    this.app.post('/api/instances/cleanup', async (req, res) => {
      try {
        const result = await this.mcpServer.call('cleanup_stale_instances', req.body);
        res.json(result);
      } catch (error) {
        res.status(500).json({ success: false, error: { message: error.message } });
      }
    });

    // Server status endpoint
    this.app.get('/api/mcp/status', async (req, res) => {
      try {
        const result = await this.mcpServer.call('get_server_status');
        res.json(result);
      } catch (error) {
        res.status(500).json({
          success: false,
          error: {
            message: 'Status check failed',
            details: error.message
          }
        });
      }
    });

    // Error handling
    this.app.use((err, req, res, next) => {
      console.error('💥 Server error:', err);
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
            'POST /api/mcp/bootstrap',
            'POST /api/mcp/call',
            'GET /api/mcp/status'
          ]
        }
      });
    });
  }

  /**
   * Start the server
   */
  async start() {
    try {
      // Initialize MCP server
      console.log('🔧 Initializing MCP server...');
      const mcpInitialized = await this.mcpServer.initialize();
      
      if (!mcpInitialized) {
        throw new Error('MCP server initialization failed');
      }

      // Configure Express
      this.configureMiddleware();
      this.configureRoutes();

      // Start HTTP server
      return new Promise((resolve, reject) => {
        this.httpServer = this.app.listen(CONFIG.port, CONFIG.host, () => {
          console.log('✅ Server started successfully!');
          console.log(`🌐 HTTP Server: http://${CONFIG.host}:${CONFIG.port}`);
          console.log(`📚 API Documentation: http://${CONFIG.host}:${CONFIG.port}/`);
          console.log(`❤️  Health Check: http://${CONFIG.host}:${CONFIG.port}/health`);
          console.log('');
          console.log('🎯 Ready for AI instance coordination!');
          console.log('📡 Test with: curl http://localhost:3000/health');
          resolve();
        });

        this.httpServer.on('error', (error) => {
          if (error.code === 'EADDRINUSE') {
            console.error(`💥 Port ${CONFIG.port} is already in use!`);
            console.log('💡 Try a different port: PORT=3001 npm run start:server');
          } else {
            console.error('💥 Server startup failed:', error);
          }
          reject(error);
        });
      });
    } catch (error) {
      console.error('💥 Failed to start server:', error);
      throw error;
    }
  }

  /**
   * Stop the server gracefully
   */
  async stop() {
    if (this.httpServer) {
      return new Promise((resolve) => {
        this.httpServer.close(() => {
          console.log('🛑 Server stopped gracefully');
          resolve();
        });
      });
    }
  }
}

// Graceful shutdown handling
process.on('SIGTERM', async () => {
  console.log('📡 Received SIGTERM, shutting down gracefully...');
  await server.stop();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('📡 Received SIGINT, shutting down gracefully...');
  await server.stop();
  process.exit(0);
});

// Create server instance
const server = new NetworkServer();

// Start server if this file is run directly
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  console.log('🎬 Starting server...');
  server.start().catch((error) => {
    console.error('💥 Startup failed:', error);
    process.exit(1);
  });
}

export { NetworkServer, CONFIG };
export default server;