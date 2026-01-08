#!/usr/bin/env node

/**
 * MCP Coordination System - Streamable HTTP Proxy Client (DEVELOPMENT)
 * Bridges stdio-based MCP clients to the DEVELOPMENT streamable HTTP endpoint.
 * Connects to: https://smoothcurves.nexus/mcp/dev (port 3446)
 * Keeps JSON-RPC traffic compliant while handling session and auth headers.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ListPromptsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import https from 'https';
import http from 'http';
import dns from 'dns';
import { URL, fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { createLogger } from './logger.js';

process.env.MCP_MODE = 'stdio';
if (!process.env.NODE_TLS_REJECT_UNAUTHORIZED) {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
}

const logger = createLogger('streaming-http-proxy-dev.log', true);

const httpsAgent = new https.Agent({
  rejectUnauthorized: false,
  checkServerIdentity: () => undefined,
});

class StreamingHTTPProxyClient {
  constructor() {
    this.baseUrl =
      process.env.MCP_HTTP_URL ||
      process.env.STREAMABLE_HTTP_URL ||
      'https://smoothcurves.nexus/mcp/dev';
    this.accessToken = process.env.MCP_ACCESS_TOKEN || null;
    this.sessionId = null;

    this.url = new URL(this.baseUrl);
    this.defaultPath =
      this.url.pathname && this.url.pathname !== '/' ? this.url.pathname : '/mcp/dev';
    this.isHttps = this.url.protocol === 'https:';
    this.client = this.isHttps ? https : http;
    this.agent = this.isHttps ? httpsAgent : undefined;

    // DNS resolution cache and fallback
    this.resolvedIP = null;
    this.lastDNSResolve = null;

    logger.info('StreamingHTTPProxyClient (DEV) initializing', {
      baseUrl: this.baseUrl,
      defaultPath: this.defaultPath,
      accessTokenConfigured: Boolean(this.accessToken),
      environment: 'DEVELOPMENT',
    });

    this.server = new Server(
      {
        name: 'mcp-streaming-http-proxy-dev',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
          resources: {},
          prompts: {},
        },
      },
    );

    // Setup will be done after connection test
    // this.setupHandlers();
  }

  /**
   * Resolve DNS with fallback mechanism to handle EAI_FAIL errors
   * Uses multiple DNS servers and caches results
   */
  async resolveDNSWithFallback(hostname) {
    // Use cached IP if available and recent (5 minutes)
    if (this.resolvedIP && this.lastDNSResolve &&
        (Date.now() - this.lastDNSResolve < 300000)) {
      return this.resolvedIP;
    }

    // Multiple DNS resolution strategies
    const strategies = [
      // Strategy 1: Default Node.js DNS
      () => new Promise((resolve, reject) => {
        dns.lookup(hostname, { family: 4 }, (err, address) => {
          if (err) reject(err);
          else resolve(address);
        });
      }),

      // Strategy 2: Alternative DNS (Google DNS)
      () => new Promise((resolve, reject) => {
        const resolver = new dns.Resolver();
        resolver.setServers(['8.8.8.8', '8.8.4.4']);
        resolver.resolve4(hostname, (err, addresses) => {
          if (err) reject(err);
          else resolve(addresses[0]);
        });
      }),

      // Strategy 3: Cloudflare DNS
      () => new Promise((resolve, reject) => {
        const resolver = new dns.Resolver();
        resolver.setServers(['1.1.1.1', '1.0.0.1']);
        resolver.resolve4(hostname, (err, addresses) => {
          if (err) reject(err);
          else resolve(addresses[0]);
        });
      })
    ];

    for (const [index, strategy] of strategies.entries()) {
      try {
        const ip = await strategy();
        logger.info(`DNS resolution successful using strategy ${index + 1}`, {
          hostname,
          resolvedIP: ip
        });

        this.resolvedIP = ip;
        this.lastDNSResolve = Date.now();
        return ip;
      } catch (error) {
        logger.warn(`DNS strategy ${index + 1} failed for ${hostname}`, {
          error: error.message
        });

        if (index === strategies.length - 1) {
          // Last strategy failed, check if we have a cached IP
          if (this.resolvedIP) {
            logger.info(`Using stale cached IP for ${hostname}`, {
              resolvedIP: this.resolvedIP
            });
            return this.resolvedIP;
          }
          throw error;
        }
      }
    }
  }

  /**
   * Set up dynamic MCP handlers by discovering available endpoints from the development server
   * This ensures the proxy exposes all available functions without hardcoding
   */
  async setupDynamicHandlers() {
    try {
      // Get available tools from development server first
      logger.info('Discovering available tools from DEVELOPMENT server...');
      const toolsResult = await this.sendRpcRequest('tools/list');
      const availableTools = toolsResult?.tools || [];

      logger.info(`Discovered ${availableTools.length} tools from DEVELOPMENT server`, {
        toolNames: availableTools.map(t => t.name).slice(0, 10), // Log first 10 for brevity
        totalCount: availableTools.length
      });

      // Set up standard MCP handlers with dynamic forwarding
      this.server.setRequestHandler(ListResourcesRequestSchema, async () => {
        try {
          const result = await this.sendRpcRequest('resources/list');
          return { resources: result?.resources ?? [] };
        } catch (error) {
          await logger.error('resources/list failed', { error: error.message });
          return { resources: [] };
        }
      });

      this.server.setRequestHandler(ListPromptsRequestSchema, async () => {
        try {
          const result = await this.sendRpcRequest('prompts/list');
          return { prompts: result?.prompts ?? [] };
        } catch (error) {
          await logger.error('prompts/list failed', { error: error.message });
          return { prompts: [] };
        }
      });

      // Dynamic tools/list handler - returns actual available tools from server
      this.server.setRequestHandler(ListToolsRequestSchema, async () => {
        try {
          const result = await this.sendRpcRequest('tools/list');
          logger.info(`Returning ${result?.tools?.length || 0} tools to client`);
          return { tools: result?.tools ?? [] };
        } catch (error) {
          await logger.error('tools/list failed', { error: error.message });
          return { tools: [] };
        }
      });

      // Dynamic tools/call handler - forwards any tool call to development server
      this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
        const { name, arguments: args } = request.params;
        await logger.info('Tool call received', { name, args });

        try {
          const result = await this.sendRpcRequest('tools/call', {
            name,
            arguments: args || {},
          });

          if (result && result.content) {
            return result;
          }

          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(result, null, 2),
              },
            ],
          };
        } catch (error) {
          await logger.error('Tool call failed', {
            name,
            error: error.message,
          });

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

      logger.info('✅ Dynamic MCP handlers configured successfully (DEV)', {
        totalTools: availableTools.length,
        serverEndpoint: this.baseUrl,
        environment: 'DEVELOPMENT',
        proxyMode: 'dynamic-passthrough'
      });

      return true;

    } catch (error) {
      logger.error('❌ Failed to set up dynamic handlers, falling back to basic setup', {
        error: error.message
      });

      // Fallback to basic handlers if dynamic discovery fails
      this.setupBasicHandlers();
      return false;
    }
  }

  /**
   * Fallback basic handlers if dynamic discovery fails
   */
  setupBasicHandlers() {
    logger.warn('Setting up basic fallback handlers');

    this.server.setRequestHandler(ListResourcesRequestSchema, async () => {
      return { resources: [] };
    });

    this.server.setRequestHandler(ListPromptsRequestSchema, async () => {
      return { prompts: [] };
    });

    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return { tools: [] };
    });

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      return {
        content: [
          {
            type: 'text',
            text: 'Error: Dynamic discovery failed, proxy in fallback mode. Please check server connectivity.',
          },
        ],
        isError: true,
      };
    });
  }

  async start() {
    await logger.info('Starting Streaming HTTP Proxy Client (DEVELOPMENT)...', {
      baseUrl: this.baseUrl,
      pid: process.pid,
      cwd: process.cwd(),
      environment: 'DEVELOPMENT',
    });

    const healthy = await this.testHTTPConnection();
    if (!healthy) {
      await logger.error('DEVELOPMENT server not reachable', {
        baseUrl: this.baseUrl,
      });
      process.exit(1);
    }

    await this.ensureSession();

    // Set up dynamic handlers after successful connection
    logger.info('Setting up dynamic MCP handlers for DEV server...');
    const dynamicSetupSuccess = await this.setupDynamicHandlers();

    const transport = new StdioServerTransport();
    await this.server.connect(transport);

    await logger.info('✅ Streaming HTTP Proxy Client (DEV) ready for MCP requests', {
      sessionId: this.sessionId,
      environment: 'DEVELOPMENT',
      serverEndpoint: this.baseUrl,
      dynamicDiscovery: dynamicSetupSuccess ? 'enabled' : 'fallback',
      mode: dynamicSetupSuccess ? 'dynamic-passthrough' : 'basic-fallback'
    });
  }

  async sendRpcRequest(method, params = {}) {
    const jsonRpcRequest = {
      jsonrpc: '2.0',
      method,
      params,
      id: Date.now(),
    };

    return this.forwardToHTTPServer(jsonRpcRequest);
  }

  async forwardToHTTPServer(jsonRpcRequest) {
    await this.ensureSession();

    const response = await this.performHttpRequest({
      method: 'POST',
      pathname: this.defaultPath,
      body: jsonRpcRequest,
      includeSession: true,
    });

    this.updateSessionFromResponse(response.headers, response.body);

    if (response.statusCode >= 400) {
      throw new Error(
        `HTTP ${response.statusCode} from MCP server: ${response.body}`,
      );
    }

    let parsed;
    try {
      parsed = response.body ? JSON.parse(response.body) : {};
    } catch (error) {
      throw new Error(`Invalid JSON response from MCP server: ${error.message}`);
    }

    if (parsed.error) {
      const message =
        parsed.error?.message ||
        parsed.error?.data ||
        'Unknown error from MCP server';
      throw new Error(message);
    }

    return parsed.result ?? parsed;
  }

  async ensureSession() {
    if (this.sessionId) {
      return this.sessionId;
    }

    const response = await this.performHttpRequest({
      method: 'GET',
      pathname: this.defaultPath,
      includeSession: false,
    });

    this.updateSessionFromResponse(response.headers, response.body);

    if (!this.sessionId) {
      throw new Error('Failed to establish MCP session');
    }

    return this.sessionId;
  }

  updateSessionFromResponse(headers, body) {
    const headerSession = headers?.['mcp-session-id'];
    if (headerSession) {
      this.sessionId = headerSession;
    } else if (!this.sessionId && body) {
      try {
        const parsed = JSON.parse(body);
        const bodySession = parsed?.result?.session?.id;
        if (bodySession) {
          this.sessionId = bodySession;
        }
      } catch {
        // Ignore body parse errors when only looking for session ID
      }
    }
  }

  async testHTTPConnection() {
    try {
      const response = await this.performHttpRequest({
        method: 'GET',
        pathname: '/health',
        includeSession: false,
      });

      if (response.statusCode !== 200 || !response.body) {
        await logger.warn('Health check returned unexpected result', {
          statusCode: response.statusCode,
          body: response.body,
        });
        return false;
      }

      const parsed = JSON.parse(response.body);
      return parsed?.status === 'healthy';
    } catch (error) {
      await logger.error('Health check failed', { error: error.message });
      return false;
    }
  }

  async performHttpRequest({
    method = 'GET',
    pathname,
    body,
    includeSession = true,
    timeout = 300000,  // 5 minutes - wake/continue can take 60+ seconds
  }) {
    const path =
      typeof pathname === 'string' && pathname.length > 0
        ? pathname
        : this.defaultPath;

    const headers = this.buildHeaders(includeSession);
    headers['Accept'] = 'application/json';

    let payload = null;
    if (body !== undefined && body !== null) {
      payload = typeof body === 'string' ? body : JSON.stringify(body);
      headers['Content-Type'] = 'application/json';
      headers['Content-Length'] = Buffer.byteLength(payload);
    }

    // Resolve hostname to IP with fallback to handle EAI_FAIL errors
    let resolvedHostname;
    try {
      resolvedHostname = await this.resolveDNSWithFallback(this.url.hostname);
      logger.info(`Using resolved IP for request`, {
        hostname: this.url.hostname,
        resolvedIP: resolvedHostname
      });
    } catch (error) {
      logger.warn(`DNS resolution failed, using hostname directly`, {
        hostname: this.url.hostname,
        error: error.message
      });
      resolvedHostname = this.url.hostname;
    }

    const options = {
      hostname: resolvedHostname,
      port: this.url.port || (this.isHttps ? 443 : 80),
      path,
      method,
      headers,
      agent: this.agent,
      // Include the original hostname for SNI (SSL certificate validation)
      servername: this.url.hostname,
    };

    return new Promise((resolve, reject) => {
      const req = this.client.request(options, (res) => {
        let data = '';

        res.on('data', (chunk) => {
          data += chunk;
        });

        res.on('end', () => {
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            body: data,
          });
        });
      });

      req.on('error', (error) => {
        // If we get EAI_FAIL and we used an IP, try with hostname directly
        if (error.code === 'EAI_FAIL' && resolvedHostname !== this.url.hostname) {
          logger.info(`EAI_FAIL with IP, retrying with hostname`, {
            originalHostname: this.url.hostname,
            usedIP: resolvedHostname
          });

          // Retry with original hostname
          const retryOptions = { ...options, hostname: this.url.hostname };
          const retryReq = this.client.request(retryOptions, (res) => {
            let data = '';
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => {
              resolve({
                statusCode: res.statusCode,
                headers: res.headers,
                body: data,
              });
            });
          });

          retryReq.on('error', (retryError) => {
            reject(retryError);
          });

          retryReq.setTimeout(timeout, () => {
            retryReq.destroy(new Error('Request timed out'));
          });

          if (payload) {
            retryReq.write(payload);
          }
          retryReq.end();
        } else {
          reject(error);
        }
      });

      req.setTimeout(timeout, () => {
        req.destroy(new Error('Request timed out'));
      });

      if (payload) {
        req.write(payload);
      }

      req.end();
    });
  }

  buildHeaders(includeSession) {
    const headers = {};

    if (this.accessToken) {
      headers['Authorization'] = `Bearer ${this.accessToken}`;
    }

    if (includeSession && this.sessionId) {
      headers['Mcp-Session-Id'] = this.sessionId;
    }

    return headers;
  }
}

const currentFile = fileURLToPath(import.meta.url);
const currentDir = dirname(currentFile);
process.chdir(currentDir);

export { StreamingHTTPProxyClient };
export default StreamingHTTPProxyClient;

const entryFile = process.argv[1] ? resolve(process.argv[1]) : null;
if (entryFile && currentFile === entryFile) {
  const proxy = new StreamingHTTPProxyClient();
  proxy.start().catch(async (error) => {
    await logger.error('Streaming HTTP Proxy Client (DEV) startup failed', {
      error: error.message,
      stack: error.stack,
    });
    process.exit(1);
  });
}
