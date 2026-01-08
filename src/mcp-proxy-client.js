/**
 * MCP Proxy Client - stdio-to-HTTPS Bridge
 * Enables MCP clients to access SSE server through local self-signed certificates
 * Based on proven mcp-server.js pattern for protocol compliance
 *
 * @author claude-code-Developer-Proxy-2025-09-05-1400
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { 
  CallToolRequestSchema, 
  ListToolsRequestSchema, 
  ListResourcesRequestSchema, 
  ListPromptsRequestSchema 
} from '@modelcontextprotocol/sdk/types.js';
import https from 'https';
import http from 'http';
import { URL } from 'url';
import { createLogger } from './logger.js';

// Enable SSL bypass for self-signed certificates
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

// Create logger instance for proxy with absolute path
// Force stdio mode for proxy to prevent console output
process.env.MCP_MODE = 'stdio';
const logger = createLogger('mcp-proxy.log');

// Configure HTTPS agent for self-signed certificates
const httpsAgent = new https.Agent({
  rejectUnauthorized: false,
  checkServerIdentity: () => undefined
});

class MCPProxyClient {
  constructor() {
    // Read SSE server URL from environment or use default
    this.sseServerUrl = process.env.SSE_SERVER_URL || 'https://localhost:3444/mcp';
    logger.info('MCPProxyClient initializing', { sseServerUrl: this.sseServerUrl });
    
    this.server = new Server(
      {
        name: 'mcp-coordination-system-proxy',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
          resources: {},
          prompts: {},
        },
      }
    );

    this.setupHandlers();
  }

  /**
   * Set up MCP protocol handlers
   */
  setupHandlers() {
    // Standard MCP methods that Claude Desktop expects
    this.server.setRequestHandler(ListResourcesRequestSchema, async () => {
      return {
        resources: []  // No resources currently implemented
      };
    });

    this.server.setRequestHandler(ListPromptsRequestSchema, async () => {
      return {
        prompts: []  // No prompts currently implemented
      };
    });
    // List available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: this.getToolDefinitions(),
      };
    });

    // Handle tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;
      logger.info('Tool call received', { name, args });

      try {
        // Forward the request to the SSE server
        const jsonRpcRequest = {
          jsonrpc: '2.0',
          method: 'tools/call',
          params: { name: name, arguments: args || {} },
          id: Date.now()
        };
        logger.info('Forwarding to SSE server', { request: jsonRpcRequest });
        
        const result = await this.forwardToSSEServer(jsonRpcRequest);

        logger.info('SSE server response received', { result });
        
        // SSE server returns MCP tool response format directly - return as-is
        if (result && result.content) {
          logger.info('Returning MCP tool response to client', { result });
          return result;
        } else if (result && result.success) {
          // Fallback: wrap raw success response in MCP format  
          const response = {
            content: [
              {
                type: 'text',
                text: JSON.stringify(result, null, 2),
              },
            ],
          };
          logger.info('Returning wrapped success response to client', { response });
          return response;
        } else {
          const errorResponse = {
            content: [
              {
                type: 'text',
                text: `Error: ${result?.error?.message || result?.message || 'SSE server request failed'}`,
              },
            ],
            isError: true,
          };
          logger.error('Returning error response to client', { errorResponse, result });
          return errorResponse;
        }
      } catch (error) {
        logger.error('Tool call exception', { name, error: error.message, stack: error.stack });
        const errorResponse = {
          content: [
            {
              type: 'text',
              text: `Error executing ${name}: ${error.message}`,
            },
          ],
          isError: true,
        };
        logger.error('Returning exception response to client', { errorResponse });
        return errorResponse;
      }
    });
  }

  /**
   * Get tool definitions for MCP protocol
   */
  getToolDefinitions() {
    return [
      {
        name: 'bootstrap',
        description: 'Bootstrap an AI instance with role-specific capabilities and get started',
        inputSchema: {
          type: 'object',
          properties: {
            role: {
              type: 'string',
              description: 'AI instance role (COO, PA, PM, etc.)',
              enum: ['COO', 'PA', 'PM', 'Developer', 'Tester', 'Designer'],
            },
            instanceId: {
              type: 'string',
              description: 'Unique instance identifier',
            },
          },
          required: ['role'],
        },
      },
      {
        name: 'get_server_status',
        description: 'Get current server status and information',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'get_projects',
        description: 'Retrieve all projects or filter by criteria',
        inputSchema: {
          type: 'object',
          properties: {
            status: {
              type: 'string',
              description: 'Filter by project status',
              enum: ['active', 'completed', 'archived', 'on_hold'],
            },
            priority: {
              type: 'string',
              description: 'Filter by priority level',
              enum: ['critical', 'high', 'medium', 'low'],
            },
            assignee: {
              type: 'string',
              description: 'Filter by assigned instance ID',
            },
          },
        },
      },
      {
        name: 'get_project',
        description: 'Get detailed information about a specific project',
        inputSchema: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              description: 'Project ID',
            },
          },
          required: ['id'],
        },
      },
      {
        name: 'create_project',
        description: 'Create a new project',
        inputSchema: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              description: 'Unique project identifier',
            },
            name: {
              type: 'string',
              description: 'Project name',
            },
            description: {
              type: 'string',
              description: 'Project description',
            },
            priority: {
              type: 'string',
              enum: ['critical', 'high', 'medium', 'low'],
            },
            status: {
              type: 'string',
              enum: ['active', 'completed', 'archived', 'on_hold'],
            },
            assignee: {
              type: 'string',
              description: 'Assigned instance ID',
            },
          },
          required: ['id', 'name', 'description'],
        },
      },
      {
        name: 'update_project',
        description: 'Update an existing project',
        inputSchema: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              description: 'Project ID',
            },
            updates: {
              type: 'object',
              description: 'Fields to update',
            },
          },
          required: ['id', 'updates'],
        },
      },
      {
        name: 'get_tasks',
        description: 'Retrieve tasks with optional filtering',
        inputSchema: {
          type: 'object',
          properties: {
            project_id: {
              type: 'string',
              description: 'Filter by project ID',
            },
            status: {
              type: 'string',
              enum: ['pending', 'claimed', 'in_progress', 'completed', 'blocked'],
            },
            assignee: {
              type: 'string',
              description: 'Filter by assigned instance ID',
            },
            priority: {
              type: 'string',
              enum: ['critical', 'high', 'medium', 'low'],
            },
          },
        },
      },
      {
        name: 'get_task',
        description: 'Get detailed information about a specific task',
        inputSchema: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              description: 'Task ID',
            },
          },
          required: ['id'],
        },
      },
      {
        name: 'create_task',
        description: 'Create a new task',
        inputSchema: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              description: 'Unique task identifier',
            },
            title: {
              type: 'string',
              description: 'Task title',
            },
            description: {
              type: 'string',
              description: 'Task description',
            },
            project_id: {
              type: 'string',
              description: 'Associated project ID',
            },
            priority: {
              type: 'string',
              enum: ['critical', 'high', 'medium', 'low'],
            },
            estimated_effort: {
              type: 'string',
              description: 'Estimated effort (e.g., "2h", "1d")',
            },
          },
          required: ['id', 'title', 'description'],
        },
      },
      {
        name: 'claim_task',
        description: 'Claim a task for execution',
        inputSchema: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              description: 'Task ID',
            },
            instanceId: {
              type: 'string',
              description: 'Instance claiming the task',
            },
          },
          required: ['id', 'instanceId'],
        },
      },
      {
        name: 'update_task',
        description: 'Update task progress or details',
        inputSchema: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              description: 'Task ID',
            },
            updates: {
              type: 'object',
              description: 'Fields to update',
            },
          },
          required: ['id', 'updates'],
        },
      },
      {
        name: 'get_pending_tasks',
        description: 'Get all tasks available for claiming',
        inputSchema: {
          type: 'object',
          properties: {
            role: {
              type: 'string',
              description: 'Filter by role capability',
            },
            priority: {
              type: 'string',
              enum: ['critical', 'high', 'medium', 'low'],
            },
          },
        },
      },
      {
        name: 'send_message',
        description: 'Send a message to other instances',
        inputSchema: {
          type: 'object',
          properties: {
            to: {
              type: 'string',
              description: 'Recipient instance ID or role',
            },
            from: {
              type: 'string',
              description: 'Sender instance ID',
            },
            subject: {
              type: 'string',
              description: 'Message subject',
            },
            content: {
              type: 'string',
              description: 'Message content',
            },
            priority: {
              type: 'string',
              enum: ['urgent', 'high', 'normal', 'low'],
            },
          },
          required: ['to', 'from', 'subject', 'content'],
        },
      },
      {
        name: 'get_messages',
        description: 'Retrieve messages for an instance',
        inputSchema: {
          type: 'object',
          properties: {
            instanceId: {
              type: 'string',
              description: 'Instance ID to get messages for',
            },
            unread_only: {
              type: 'boolean',
              description: 'Only return unread messages',
            },
            limit: {
              type: 'number',
              description: 'Maximum number of messages',
            },
          },
        },
      },
      {
        name: 'register_instance',
        description: 'Register a new AI instance',
        inputSchema: {
          type: 'object',
          properties: {
            instanceId: {
              type: 'string',
              description: 'Unique instance identifier',
            },
            role: {
              type: 'string',
              description: 'Instance role',
            },
            capabilities: {
              type: 'array',
              items: { type: 'string' },
              description: 'Instance capabilities',
            },
          },
          required: ['instanceId', 'role'],
        },
      },
      {
        name: 'update_heartbeat',
        description: 'Update instance heartbeat to show it is active',
        inputSchema: {
          type: 'object',
          properties: {
            instanceId: {
              type: 'string',
              description: 'Instance ID',
            },
          },
          required: ['instanceId'],
        },
      },
      {
        name: 'get_instances',
        description: 'Get all registered instances',
        inputSchema: {
          type: 'object',
          properties: {
            active_only: {
              type: 'boolean',
              description: 'Only return active instances',
            },
            role: {
              type: 'string',
              description: 'Filter by role',
            },
          },
        },
      },
      {
        name: 'submit_lessons',
        description: 'Submit lessons extracted by client instance to MCP storage',
        inputSchema: {
          type: 'object',
          properties: {
            project_id: {
              type: 'string',
              description: 'Project identifier',
            },
            instance_id: {
              type: 'string', 
              description: 'Submitting instance identifier',
            },
            lessons: {
              type: 'array',
              description: 'Array of lesson objects extracted by client',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  type: { type: 'string' },
                  content: { type: 'string' },
                  confidence: { type: 'number' },
                  weight: { type: 'number' },
                  source_file: { type: 'string' },
                  context: { type: 'string' }
                }
              }
            },
            metadata: {
              type: 'object',
              description: 'Optional extraction metadata',
            },
          },
          required: ['project_id', 'instance_id', 'lessons'],
        },
      },
      {
        name: 'get_lessons',
        description: 'Retrieve stored lessons with optional filtering',
        inputSchema: {
          type: 'object',
          properties: {
            project_id: {
              type: 'string',
              description: 'Project identifier (optional - omit for global stats)',
            },
            min_confidence: {
              type: 'number',
              description: 'Minimum confidence level (0.0-1.0)',
              minimum: 0.0,
              maximum: 1.0,
            },
            lesson_types: {
              type: 'array',
              items: { type: 'string' },
              description: 'Filter by lesson types',
            },
            limit: {
              type: 'number',
              description: 'Maximum lessons to return',
              minimum: 1,
              maximum: 1000,
            },
          },
        },
      },
      {
        name: 'get_onboarding_lessons',
        description: 'Get critical lessons for new instance onboarding - "I just woke up, what should I know?"',
        inputSchema: {
          type: 'object',
          properties: {
            role: {
              type: 'string',
              description: 'Instance role (COO, PA, PM, specialist, all)',
              enum: ['COO', 'PA', 'PM', 'specialist', 'all']
            },
            project_id: {
              type: 'string',
              description: 'Optional specific project focus',
            },
            limit: {
              type: 'number',
              description: 'Maximum lessons to return (default: 10)',
              minimum: 1,
              maximum: 50,
            },
          },
        },
      },
      {
        name: 'get_lesson_patterns',
        description: 'Get lesson patterns and insights without requiring LLM analysis',
        inputSchema: {
          type: 'object',
          properties: {
            project_id: {
              type: 'string',
              description: 'Optional project filter',
            },
            pattern_type: {
              type: 'string',
              description: 'Type of patterns to return',
            },
          },
        },
      },
      {
        name: 'export_lessons',
        description: 'Export lessons for external analysis or backup',
        inputSchema: {
          type: 'object',
          properties: {
            project_id: {
              type: 'string',
              description: 'Optional project filter',
            },
            format: {
              type: 'string',
              description: 'Export format',
              enum: ['json', 'analysis_ready'],
            },
          },
        },
      },
    ];
  }

  /**
   * Forward request to SSE server via HTTPS
   */
  async forwardToSSEServer(jsonRpcRequest) {
    logger.info('forwardToSSEServer starting', { request: jsonRpcRequest, url: this.sseServerUrl });
    
    return new Promise((resolve, reject) => {
      const postData = JSON.stringify(jsonRpcRequest);
      logger.info('Request data prepared', { postData });
      
      // Parse URL to determine HTTP vs HTTPS
      const url = new URL(this.sseServerUrl);
      const isHttps = url.protocol === 'https:';
      const client = isHttps ? https : http;
      const agent = isHttps ? httpsAgent : undefined;
      
      const options = {
        hostname: url.hostname,
        port: url.port || (isHttps ? 443 : 80),
        path: url.pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData)
        },
        agent: agent
      };
      
      logger.info('HTTP request options', { options, isHttps, clientType: isHttps ? 'https' : 'http' });

      const req = client.request(options, (res) => {
        logger.info('HTTP response received', { statusCode: res.statusCode, headers: res.headers });
        let data = '';
        
        res.on('data', (chunk) => {
          data += chunk;
          logger.info('Data chunk received', { chunkLength: chunk.length, totalLength: data.length });
        });
        
        res.on('end', () => {
          logger.info('Response complete', { fullData: data });
          try {
            const response = JSON.parse(data);
            logger.info('JSON parsed successfully', { response });
            resolve(response.result || response);
          } catch (error) {
            logger.error('Failed to parse SSE server response', { data, error: error.message });
            resolve({ success: false, error: { message: 'Invalid JSON response from SSE server' } });
          }
        });
      });

      req.on('error', (error) => {
        logger.error('SSE server request failed', { error: error.message, url: this.sseServerUrl, stack: error.stack });
        resolve({ success: false, error: { message: `SSE server connection failed: ${error.message}` } });
      });

      req.setTimeout(300000, () => {  // 5 minutes - wake/continue can take 60+ seconds
        logger.error('Request timeout to SSE server', { url: this.sseServerUrl, timeout: 300000 });
        req.destroy();
        resolve({ success: false, error: { message: 'Request timeout to SSE server' } });
      });

      logger.info('Sending request to SSE server', { postData });
      req.write(postData);
      req.end();
      logger.info('Request sent to SSE server');
    });
  }

  /**
   * Test connection to SSE server
   */
  async testSSEConnection() {
    logger.info('Testing SSE server connection', { url: this.sseServerUrl });
    
    return new Promise((resolve, reject) => {
      // Parse URL for health check
      const url = new URL(this.sseServerUrl);
      const isHttps = url.protocol === 'https:';
      const client = isHttps ? https : http;
      const agent = isHttps ? httpsAgent : undefined;
      
      const healthUrl = `${url.protocol}//${url.host}/health`;
      logger.info('Health check URL constructed', { healthUrl, isHttps });
      
      const options = {
        hostname: url.hostname,
        port: url.port || (isHttps ? 443 : 80),
        path: '/health',
        method: 'GET',
        agent: agent
      };
      
      logger.info('Health check request options', { options });
      
      const req = client.request(options, (res) => {
        logger.info('Health check response received', { statusCode: res.statusCode });
        let data = '';
        res.on('data', (chunk) => {
          data += chunk;
          logger.info('Health check data chunk', { chunkLength: chunk.length });
        });
        res.on('end', () => {
          logger.info('Health check response complete', { data });
          try {
            const health = JSON.parse(data);
            const isHealthy = health.status === 'healthy';
            logger.info('Health check result', { health, isHealthy });
            resolve(isHealthy);
          } catch (error) {
            logger.error('Health check JSON parse failed', { data, error: error.message });
            resolve(false);
          }
        });
      });
      
      req.on('error', (error) => {
        logger.error('Health check request failed', { error: error.message, stack: error.stack });
        resolve(false);
      });
      
      req.setTimeout(5000, () => {
        logger.error('Health check timeout', { timeout: 5000 });
        req.destroy();
        resolve(false);
      });
      
      logger.info('Sending health check request');
      req.end();
    });
  }

  /**
   * Start the MCP proxy client with stdio transport
   */
  async start() {
    // Server startup logging handled by logger system to maintain JSON-RPC compliance
    await logger.info('🚀 Starting MCP Proxy Client...', { 
      sseServerUrl: this.sseServerUrl, 
      pid: process.pid,
      cwd: process.cwd(),
      nodeVersion: process.version
    });
    
    // Test SSE server connection
    await logger.info('Testing SSE server connection before startup');
    const sseConnected = await this.testSSEConnection();
    if (!sseConnected) {
      await logger.error('SSE server not available', { url: this.sseServerUrl });
      await logger.error('Please ensure SSE server is running: npm run start:sse');
      process.exit(1);
    }
    
    await logger.info('✅ SSE server connection verified successfully');
    
    await logger.info('Creating stdio transport for MCP communication');
    const transport = new StdioServerTransport();
    
    await logger.info('Connecting MCP server to stdio transport');
    await this.server.connect(transport);
    
    // Connection logging handled by logger system to maintain JSON-RPC compliance
    await logger.info('✅ MCP Proxy Client connected via stdio and ready for requests', {
      serverName: this.server.name,
      version: this.server.version
    });
  }
}

// Export the class for use in other files
export { MCPProxyClient };

// Start the server if this file is run directly
import { fileURLToPath } from 'url';
import { resolve, dirname } from 'path';

const currentFile = fileURLToPath(import.meta.url);
const targetFile = resolve(process.argv[1]);

if (currentFile === targetFile) {
  // Change to MCP server directory to ensure correct working directory
  const serverDir = dirname(fileURLToPath(import.meta.url));
  process.chdir(serverDir);
  
  logger.info('🚀 MCP Proxy Client main execution started', {
    file: currentFile,
    args: process.argv,
    env: {
      SSE_SERVER_URL: process.env.SSE_SERVER_URL,
      NODE_TLS_REJECT_UNAUTHORIZED: process.env.NODE_TLS_REJECT_UNAUTHORIZED
    },
    serverDir
  });
  
  const proxy = new MCPProxyClient();
  proxy.start().catch(async (error) => {
    // Use file logger to avoid polluting JSON-RPC stream
    await logger.error('MCP Proxy Client startup failed', {
      error: error.message,
      stack: error.stack,
      pid: process.pid
    });
    process.exit(1);
  });
}