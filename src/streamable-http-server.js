#!/usr/bin/env node

/**
 * MCP Coordination System - Streamable HTTP MCP Server
 * Official MCP Streamable HTTP transport implementation (SSE deprecated 2025-03-26)
 * 
 * @author claude-code-MCP-ProtocolSpecialist-2025-09-02
 * @updated claude-code-COO-2025-09-03 - Fixed critical SSE server logging issue
 * @converted claude-code-Developer-ProtocolMigration-2025-09-11-1500 - SSE → Streamable HTTP
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
const logger = createLogger('sreamableHttp-server.log', true); // Force file-only mode

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
  host: process.env.SSE_HOST || process.env.HOST || 'localhost',
  environment: process.env.NODE_ENV || 'development',
  sslCertPath: process.env.SSL_CERT_PATH || join(__dirname, '..', 'certs'),
  sslStrict: process.env.SSL_STRICT === 'true', // Force strict SSL in production
  useHTTP: process.env.USE_HTTP === 'true' || process.env.NODE_ENV === 'development', // HTTP fallback for development
};

/**
 * Streamable HTTP MCP Server implementing official MCP Streamable HTTP specification
 * (SSE transport deprecated 2025-03-26, replaced with JSON responses)
 */
class StreamableHTTPMCPServer {
  constructor() {
    this.app = express();
    this.httpsServer = null;
    this.httpServer = null;
    this.mcpServer = new MCPCoordinationServer(logger); // Pass file-only logger
    this.sslOptions = null;
    this.sessions = new Map(); // Store MCP sessions
    this.sseClients = new Map(); // Kept for compatibility, but unused in Streamable HTTP
    
    // Start session cleanup for HTTP pattern
    this.startSessionCleanup();
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
   * Session cleanup for Streamable HTTP pattern
   * Clean up inactive sessions periodically
   */
  startSessionCleanup() {
    setInterval(() => {
      const now = new Date();
      for (const [sessionId, session] of this.sessions.entries()) {
        // Remove sessions inactive for more than 1 hour
        if (now - session.lastActivity > 3600000) {
          this.sessions.delete(sessionId);
          logger.info(`Cleaned up inactive session: ${sessionId}`);
        }
      }
    }, 300000); // Check every 5 minutes
    
    logger.info('Session cleanup started (5 min intervals, 1 hour timeout)');
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
      let keyPath, certPath;
      
      // Priority 1: Let's Encrypt certificates (production)
      const letsEncryptCert = '/etc/letsencrypt/live/smoothcurves.nexus/fullchain.pem';
      const letsEncryptKey = '/etc/letsencrypt/live/smoothcurves.nexus/privkey.pem';
      
      if (existsSync(letsEncryptCert) && existsSync(letsEncryptKey)) {
        await logger.info('Let\'s Encrypt certificates found - using for production');
        await logger.info(`LE cert: ${letsEncryptCert}`);
        await logger.info(`LE key: ${letsEncryptKey}`);
        
        keyPath = letsEncryptKey;
        certPath = letsEncryptCert;
      }
      // Priority 2: mkcert certificates (development)
      else {
        const mkcertStatus = this.checkMkcertCertificates();
        
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
   * Verbose authentication logging middleware
   */
  logAuthDetails(req, res, next) {
    if (process.env.AUTH_DEBUG === 'true') {
      logger.info('=== AUTH DEBUG - Request Details ===');
      logger.info(`Method: ${req.method}`);
      logger.info(`URL: ${req.originalUrl}`);
      logger.info(`Headers:`, JSON.stringify(req.headers, null, 2));
      logger.info(`Query:`, JSON.stringify(req.query, null, 2));
      logger.info(`Body:`, JSON.stringify(req.body, null, 2));
      logger.info(`IP: ${req.ip}`);
      logger.info(`User-Agent: ${req.get('User-Agent')}`);
      logger.info('=== END AUTH DEBUG ===');
    }
    next();
  }

  /**
   * OAuth Bearer token validation middleware
   */
  validateBearerToken(req, res, next) {
    const authHeader = req.get('Authorization');
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      // For development/local access, allow requests without auth
      if (CONFIG.environment === 'development' || req.ip === '127.0.0.1' || req.ip === '::1') {
        return next();
      }
      
      return res.status(401).json({
        error: 'unauthorized',
        error_description: 'Bearer token required',
        www_authenticate: `Bearer realm="MCP Server", error="invalid_token"`
      });
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix
    
    // Simple token validation (in production, verify JWT or check database)
    if (token.startsWith('mcp_access_token_')) {
      req.user = { token, authorized: true };
      return next();
    }
    
    res.status(401).json({
      error: 'invalid_token',
      error_description: 'Invalid access token'
    });
  }

  /**
   * Configure Express middleware
   */
  configureMiddleware() {
    // Trust nginx proxy for rate limiting (localhost only for security)
    this.app.set('trust proxy', 'loopback');
    
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
    this.app.post('/mcp', this.logAuthDetails.bind(this), this.validateBearerToken.bind(this), async (req, res) => {
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
            logger.info(`Initialize params received:`, JSON.stringify(params, null, 2));
            result = await this.handleInitialize(params, session);
            logger.info(`Initialize response:`, JSON.stringify(result, null, 2));
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

        // Note: Streamable HTTP uses polling pattern - no push notifications needed
        // Clients poll the server for updates instead of receiving SSE events

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
   * Configure Streamable HTTP endpoint
   */
  configureStreamableHTTPEndpoint() {
    // Add HEAD support for Claude Desktop preflight checks
    this.app.head('/mcp', this.logAuthDetails.bind(this), (req, res) => {
      res.status(200).end();
    });
    
    this.app.get('/mcp', this.logAuthDetails.bind(this), this.validateBearerToken.bind(this), (req, res) => {
      const sessionId = req.get('Mcp-Session-Id') || uuidv4();
      const session = this.getOrCreateSession(sessionId);

      // Set JSON headers for Streamable HTTP (not SSE)
      res.set({
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Mcp-Session-Id, Authorization',
        'Mcp-Session-Id': session.id
      });

      logger.info(`Streamable HTTP MCP client connected: ${sessionId}`);
      
      // Return JSON response with session info (Streamable HTTP pattern)
      // Claude Desktop 2025 expects JSON response, not streaming events
      res.json({
        jsonrpc: '2.0',
        result: {
          transport: 'streamable-http',
          session: {
            id: session.id,
            created: session.created,
            lastActivity: session.lastActivity
          },
          capabilities: {
            tools: true,
            resources: false,
            prompts: false
          },
          status: 'connected'
        },
        id: 'connection-info'
      });
    });
  }

  /**
   * Configure OAuth 2.1 authentication endpoints for Claude Desktop
   * Implements MCP authorization specification requirements
   */
  configureOAuthEndpoints() {
    // OAuth 2.0 Protected Resource Metadata (RFC 9728)  
    // Support both base path and /mcp path for Claude Desktop compatibility
    const protectedResourceHandler = this.logAuthDetails.bind(this);
    const protectedResourceResponse = (req, res) => {
      res.json({
        resource: `https://${req.get('host')}/mcp`,
        authorization_servers: [`https://${req.get('host')}`],
        jwks_uri: `https://${req.get('host')}/.well-known/jwks`,
        scopes_supported: ['mcp:read', 'mcp:write'],
        response_types_supported: ['token'],
        bearer_methods_supported: ['header'],
        resource_documentation: 'https://spec.modelcontextprotocol.io/'
      });
    };
    
    this.app.get('/.well-known/oauth-protected-resource', protectedResourceHandler, protectedResourceResponse);
    this.app.get('/.well-known/oauth-protected-resource/mcp', protectedResourceHandler, protectedResourceResponse);

    // OAuth 2.0 Authorization Server Metadata (RFC 8414)
    // Support both base path and /mcp path for Claude Desktop compatibility
    const authServerHandler = this.logAuthDetails.bind(this);
    const authServerResponse = (req, res) => {
      const baseUrl = `https://${req.get('host')}`;
      res.json({
        issuer: baseUrl,
        authorization_endpoint: `${baseUrl}/authorize`,
        token_endpoint: `${baseUrl}/token`,
        registration_endpoint: `${baseUrl}/register`,
        jwks_uri: `${baseUrl}/.well-known/jwks`,
        scopes_supported: ['mcp:read', 'mcp:write'],
        response_types_supported: ['code'],
        response_modes_supported: ['query', 'fragment'],
        grant_types_supported: ['authorization_code', 'client_credentials'],
        token_endpoint_auth_methods_supported: ['client_secret_basic', 'client_secret_post', 'none'],
        code_challenge_methods_supported: ['S256'],
        service_documentation: 'https://spec.modelcontextprotocol.io/'
      });
    };
    
    this.app.get('/.well-known/oauth-authorization-server', authServerHandler, authServerResponse);
    this.app.get('/.well-known/oauth-authorization-server/mcp', authServerHandler, authServerResponse);

    // Authorization endpoint - OAuth 2.1 authorization code flow
    this.app.get('/authorize', this.logAuthDetails.bind(this), (req, res) => {
      // For now, implement a simple demo flow
      // In production, this would redirect to proper auth UI
      const { 
        client_id, 
        redirect_uri, 
        response_type, 
        state, 
        code_challenge, 
        code_challenge_method,
        scope 
      } = req.query;

      // Log the authorization request
      if (process.env.AUTH_DEBUG === 'true') {
        logger.info('=== OAUTH AUTHORIZE REQUEST ===');
        logger.info(`client_id: ${client_id}`);
        logger.info(`redirect_uri: ${redirect_uri}`);
        logger.info(`response_type: ${response_type}`);
        logger.info(`state: ${state}`);
        logger.info(`code_challenge: ${code_challenge}`);
        logger.info(`code_challenge_method: ${code_challenge_method}`);
        logger.info(`scope: ${scope}`);
        logger.info('=== END OAUTH AUTHORIZE ===');
      }

      // Validate redirect URI - Claude Desktop uses specific callback URLs
      const validRedirectUris = [
        'https://claude.ai/api/mcp/auth_callback',
        'https://claude.com/api/mcp/auth_callback',
        'claude://claude.ai/new'  // Custom protocol handler
      ];
      
      // Basic validation
      if (!client_id || !redirect_uri || response_type !== 'code') {
        return res.status(400).json({
          error: 'invalid_request',
          error_description: 'Missing or invalid required parameters'
        });
      }
      
      // Validate redirect URI for security
      const redirectHostValid = validRedirectUris.some(validUri => 
        redirect_uri.startsWith(validUri) || redirect_uri.startsWith('https://localhost')
      );
      
      if (!redirectHostValid) {
        logger.warn(`Invalid redirect URI attempted: ${redirect_uri}`);
        return res.status(400).json({
          error: 'invalid_request', 
          error_description: 'Invalid redirect_uri'
        });
      }

      // Generate authorization code (demo - in production use crypto.randomBytes)
      const authCode = 'demo_auth_code_' + Date.now();
      
      // Store authorization details (in production use Redis/database)
      this.authCodes = this.authCodes || new Map();
      this.authCodes.set(authCode, {
        client_id,
        redirect_uri,
        code_challenge,
        code_challenge_method,
        scope,
        expires: Date.now() + 10 * 60 * 1000 // 10 minutes
      });

      // Redirect with auth code
      const redirectUrl = new URL(redirect_uri);
      redirectUrl.searchParams.set('code', authCode);
      if (state) redirectUrl.searchParams.set('state', state);
      
      res.redirect(redirectUrl.toString());
    });

    // Token endpoint - Exchange auth code for access token
    this.app.post('/token', express.json(), this.logAuthDetails.bind(this), (req, res) => {
      const { 
        grant_type, 
        code, 
        redirect_uri, 
        client_id, 
        code_verifier 
      } = req.body;

      if (grant_type === 'authorization_code') {
        // Validate authorization code
        this.authCodes = this.authCodes || new Map();
        const authData = this.authCodes.get(code);
        
        if (!authData || authData.expires < Date.now()) {
          return res.status(400).json({
            error: 'invalid_grant',
            error_description: 'Authorization code is invalid or expired'
          });
        }

        // In production, validate PKCE code_verifier
        // Generate access token (demo - use JWT in production)
        const accessToken = 'mcp_access_token_' + Date.now();
        
        // Clean up used auth code
        this.authCodes.delete(code);
        
        res.json({
          access_token: accessToken,
          token_type: 'Bearer',
          expires_in: 3600,
          scope: authData.scope || 'mcp:read mcp:write'
        });
      } else {
        res.status(400).json({
          error: 'unsupported_grant_type',
          error_description: 'Only authorization_code grant type is supported'
        });
      }
    });

    // Dynamic client registration (optional)
    this.app.post('/register', express.json(), this.logAuthDetails.bind(this), (req, res) => {
      // Simple demo client registration
      const clientId = 'mcp_client_' + Date.now();
      
      res.status(201).json({
        client_id: clientId,
        client_secret: 'demo_secret_' + Date.now(),
        registration_access_token: 'reg_token_' + Date.now(),
        registration_client_uri: `https://${req.get('host')}/register/${clientId}`,
        redirect_uris: req.body.redirect_uris || [],
        token_endpoint_auth_method: 'client_secret_basic'
      });
    });

    // JWKS endpoint for token verification (placeholder)
    this.app.get('/.well-known/jwks', (req, res) => {
      res.json({
        keys: []  // In production, provide actual JWK keys
      });
    });

    // MCP-specific discovery endpoint (required by Claude Desktop)
    this.app.get('/.well-known/mcp', this.logAuthDetails.bind(this), (req, res) => {
      const baseUrl = `https://${req.get('host')}`;
      res.json({
        mcpVersion: '2025-06-18',
        capabilities: {
          tools: {},
          resources: {},
          prompts: {}
        },
        serverInfo: {
          name: 'mcp-coordination-system-streamable-http',
          version: '1.0.0'
        },
        instructions: 'This server implements the MCP Coordination System with 44+ functions for AI instance coordination.',
        endpoints: {
          mcp: `${baseUrl}/mcp`,
          health: `${baseUrl}/health`
        },
        authentication: {
          required: true,
          type: 'oauth2',
          discovery: `${baseUrl}/.well-known/oauth-protected-resource`,
          authorization_endpoint: `${baseUrl}/authorize`,
          token_endpoint: `${baseUrl}/token`,
          registration_endpoint: `${baseUrl}/register`
        }
      });
    });

    logger.info('OAuth 2.1 endpoints configured for Claude Desktop authentication');
  }

  /**
   * Log events for Streamable HTTP pattern (no push notifications)
   * In Streamable HTTP, clients poll for updates instead of receiving push events
   */
  logEvent(type, data) {
    logger.info(`MCP Event: ${type}`, {
      timestamp: new Date().toISOString(),
      ...data
    });
    // Note: Streamable HTTP doesn't push events - clients poll for status updates
  }

  /**
   * Handle MCP initialize request
   */
  async handleInitialize(params, session) {
    const { protocolVersion, capabilities: clientCaps, clientInfo } = params;
    
    logger.info(`Client protocol version: ${protocolVersion}`);
    logger.info(`Client info:`, JSON.stringify(clientInfo, null, 2));
    
    // Validate protocol version - support both 2025-03-26 and 2025-06-18
    const supportedVersions = ['2025-03-26', '2025-06-18'];
    if (!supportedVersions.includes(protocolVersion)) {
      throw new Error(`Unsupported protocol version: ${protocolVersion}. Supported: ${supportedVersions.join(', ')}`);
    }

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
    session.protocolVersion = protocolVersion;

    return {
      protocolVersion,  // Echo back the protocol version
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
        server: 'Streamable HTTP MCP Coordination System',
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
          oauth_discovery: '/.well-known/oauth-protected-resource',
          oauth_auth_server: '/.well-known/oauth-authorization-server',
          authorize: '/authorize',
          token: '/token',
          register: '/register',
          documentation: 'https://spec.modelcontextprotocol.io/specification/'
        },
        sessions: this.sessions.size,
        sseClients: this.sseClients.size,
        timestamp: new Date().toISOString()
      });
    });

    // Configure MCP endpoints
    this.configureMCPEndpoint();
    this.configureStreamableHTTPEndpoint();
    
    // Configure OAuth 2.1 authentication endpoints for Claude Desktop
    this.configureOAuthEndpoints();

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
            'GET /mcp (Streamable HTTP)',
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
      await logger.info('Starting MCP Coordination System - Streamable HTTP Server...');
      await logger.info(`Working directory set to: ${process.cwd()}`);
      
      // Log development mode settings
      if (CONFIG.environment === 'development') {
        await logger.info('Development Mode Configuration:');
        await logger.info(`  - Use HTTP: ${CONFIG.useHTTP}`);
        await logger.info(`  - SSL Strict: ${CONFIG.sslStrict}`);
        await logger.info(`  - NODE_TLS_REJECT_UNAUTHORIZED: ${process.env.NODE_TLS_REJECT_UNAUTHORIZED}`);
        await logger.info('  - Ready for Claude Code & Claude Desktop connections');
      }

      // Initialize MCP server (non-blocking for HTTP server startup)
      await logger.info('Initializing MCP server...');
      this.mcpServer.initialize().catch(error => {
        logger.error('MCP server initialization failed', error.message);
      });

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
      
      this.httpServer.listen(CONFIG.port, CONFIG.host, async () => {
        // Log server startup (async logging won't block server availability)
        try {
          await logger.info('HTTP MCP Server started successfully!');
          await logger.info(`HTTP Server: http://${CONFIG.host}:${CONFIG.port}`);
          await logger.info(`Health Check: http://${CONFIG.host}:${CONFIG.port}/health`);
          await logger.info(`MCP POST: http://${CONFIG.host}:${CONFIG.port}/mcp`);
          await logger.info(`SSE Stream: GET http://${CONFIG.host}:${CONFIG.port}/mcp`);
          await logger.info(`Web UI: http://${CONFIG.host}:${CONFIG.port}/ui/sse-test.html`);
          
          await logger.info('\n✅ HTTP MCP Server Benefits:');
          await logger.info('  - No SSL certificate issues with Claude Code');
          await logger.info('  - Direct compatibility with Claude Desktop');
          await logger.info('  - Recommended for local MCP development');
          await logger.info('  - Better performance and reliability\n');
          
          await logger.info('Ready for MCP Streamable HTTP connections!');
        } catch (error) {
          // Don't let logging errors affect server startup
        }
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
const server = new StreamableHTTPMCPServer();

// Export for testing
export { StreamableHTTPMCPServer, CONFIG };

// Start server if this file is run directly
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  server.start().catch((error) => {
    logger.error('Startup failed', error.message);
    process.exit(1);
  });
}

export default server;