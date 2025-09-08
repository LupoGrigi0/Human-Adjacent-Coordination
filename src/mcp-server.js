/**
 * MCP Coordination System - Proper MCP JSON-RPC Server
 * Implements the official Model Context Protocol using @modelcontextprotocol/sdk
 *
 * @author claude-code-MCP-ProtocolExpert-2025-08-23-1600
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { 
  CallToolRequestSchema, 
  ListToolsRequestSchema, 
  ListResourcesRequestSchema, 
  ListPromptsRequestSchema 
} from '@modelcontextprotocol/sdk/types.js';
import { MCPCoordinationServer } from './server.js';
import { logger } from './logger.js';

class MCPJSONRPCServer {
  constructor() {
    this.mcpServer = new MCPCoordinationServer();
    this.server = new Server(
      {
        name: 'mcp-coordination-system',
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

      try {
        // Initialize our coordination server if not already done
        if (this.mcpServer.status !== 'operational') {
          await this.mcpServer.initialize();
        }

        // Call the function on our coordination server
        const result = await this.mcpServer.call(name, args || {});

        if (result.success) {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(result, null, 2),
              },
            ],
          };
        } else {
          return {
            content: [
              {
                type: 'text',
                text: `Error: ${result.error?.message || 'Unknown error'}`,
              },
            ],
            isError: true,
          };
        }
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `Error executing ${name}: ${error.message}`,
            },
          ],
          isError: true,
        };
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
   * Start the MCP server with stdio transport
   */
  async start() {
    // In stdio mode, console.log pollutes JSON-RPC stream
    // Only log to stderr or disable logging in stdio mode
    const isStdioMode = process.env.MCP_MODE === 'stdio' || process.argv[1].includes('mcp-server.js');
    
    // Server startup logging handled by logger system to maintain JSON-RPC compliance
    await logger.info('🚀 Starting MCP JSON-RPC Server...');
    
    // Initialize our coordination server
    await this.mcpServer.initialize();
    
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    
    // Connection logging handled by logger system to maintain JSON-RPC compliance
    await logger.info('✅ MCP Server connected via stdio');
  }
}

// Export the class for use in other files
export { MCPJSONRPCServer };

// Start the server if this file is run directly
import { fileURLToPath } from 'url';
import { resolve, dirname } from 'path';

const currentFile = fileURLToPath(import.meta.url);
const targetFile = resolve(process.argv[1]);

if (currentFile === targetFile) {
  // Change to MCP server directory to ensure correct working directory
  const serverDir = dirname(dirname(fileURLToPath(import.meta.url)));
  process.chdir(serverDir);
  
  const server = new MCPJSONRPCServer();
  server.start().catch(async (error) => {
    // Use file logger to avoid polluting JSON-RPC stream
    await logger.error('MCP Server startup failed:', error.message);
    process.exit(1);
  });
}