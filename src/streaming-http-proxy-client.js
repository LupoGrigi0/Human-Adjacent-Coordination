#!/usr/bin/env node

/**
 * MCP Coordination System - Streamable HTTP Proxy Client
 * Bridges stdio-based MCP clients to the production streamable HTTP endpoint.
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
import { URL, fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { createLogger } from './logger.js';

process.env.MCP_MODE = 'stdio';
if (!process.env.NODE_TLS_REJECT_UNAUTHORIZED) {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
}

const logger = createLogger('streaming-http-proxy.log', true);

const httpsAgent = new https.Agent({
  rejectUnauthorized: false,
  checkServerIdentity: () => undefined,
});

class StreamingHTTPProxyClient {
  constructor() {
    this.baseUrl =
      process.env.MCP_HTTP_URL ||
      process.env.STREAMABLE_HTTP_URL ||
      'https://smoothcurves.nexus/mcp';
    this.accessToken = process.env.MCP_ACCESS_TOKEN || null;
    this.sessionId = null;

    this.url = new URL(this.baseUrl);
    this.defaultPath =
      this.url.pathname && this.url.pathname !== '/' ? this.url.pathname : '/mcp';
    this.isHttps = this.url.protocol === 'https:';
    this.client = this.isHttps ? https : http;
    this.agent = this.isHttps ? httpsAgent : undefined;

    logger.info('StreamingHTTPProxyClient initializing', {
      baseUrl: this.baseUrl,
      defaultPath: this.defaultPath,
      accessTokenConfigured: Boolean(this.accessToken),
    });

    this.server = new Server(
      {
        name: 'mcp-streaming-http-proxy',
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

    this.setupHandlers();
  }

  setupHandlers() {
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

    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      try {
        const result = await this.sendRpcRequest('tools/list');
        return { tools: result?.tools ?? [] };
      } catch (error) {
        await logger.error('tools/list failed', { error: error.message });
        return { tools: [] };
      }
    });

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
  }

  async start() {
    await logger.info('dYs? Starting Streaming HTTP Proxy Client...', {
      baseUrl: this.baseUrl,
      pid: process.pid,
      cwd: process.cwd(),
    });

    const healthy = await this.testHTTPConnection();
    if (!healthy) {
      await logger.error('Streamable HTTP server not reachable', {
        baseUrl: this.baseUrl,
      });
      process.exit(1);
    }

    await this.ensureSession();

    const transport = new StdioServerTransport();
    await this.server.connect(transport);

    await logger.info('�o. Streaming HTTP Proxy Client ready for MCP requests', {
      sessionId: this.sessionId,
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

  performHttpRequest({
    method = 'GET',
    pathname,
    body,
    includeSession = true,
    timeout = 30000,
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

    const options = {
      hostname: this.url.hostname,
      port: this.url.port || (this.isHttps ? 443 : 80),
      path,
      method,
      headers,
      agent: this.agent,
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
        reject(error);
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
    await logger.error('Streaming HTTP Proxy Client startup failed', {
      error: error.message,
      stack: error.stack,
    });
    process.exit(1);
  });
}
