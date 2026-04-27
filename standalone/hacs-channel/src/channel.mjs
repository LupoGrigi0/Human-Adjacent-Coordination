#!/usr/bin/env node
/**
 * hacs-channel — Claude Code Channels MCP server for HACS instances.
 *
 * Pure Node.js implementation. No Bun. No Express. Only dependency is
 * @modelcontextprotocol/sdk (Anthropic-published).
 *
 * Architecture (per-instance, loosely coupled):
 *   - Registers as a Claude Code channel (claude/channel capability)
 *   - HTTP listener on per-instance port (default 21000):
 *       POST /broker-event   - events from HACS event broker (webhookEmitter)
 *       POST /direct-message - direct instance-to-instance messages (fallback)
 *       GET  /events         - SSE stream for debugging
 *       GET  /health         - liveness check
 *   - reply tool routes Claude's outbound messages back via HACS API
 *
 * Launch:
 *   claude -r <instance-name> --dangerously-load-development-channels server:hacs-channel
 *
 * Config (env vars):
 *   HACS_INSTANCE_ID   - your instance ID (e.g. "Crossing-2d23")
 *   HACS_API_URL       - HACS coordination API (default: https://smoothcurves.nexus/mcp)
 *   CHANNEL_PORT       - HTTP listener port (default: 21000)
 *   CHANNEL_BIND       - Bind address (default: 127.0.0.1)
 *
 * Author: Crossing-2d23 <crossing-2d23@smoothcurves.nexus>
 */

import http from 'node:http';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

// --- Configuration ---------------------------------------------------------

const INSTANCE_ID = process.env.HACS_INSTANCE_ID || 'unknown';
const HACS_API = process.env.HACS_API_URL || 'https://smoothcurves.nexus/mcp';
const PORT = parseInt(process.env.CHANNEL_PORT || '21000', 10);
const BIND = process.env.CHANNEL_BIND || '127.0.0.1';

// --- SSE listeners for debugging visibility --------------------------------

const sseListeners = new Set();

function broadcast(text) {
  const chunk = text.split('\n').map(l => `data: ${l}\n`).join('') + '\n';
  for (const emit of sseListeners) emit(chunk);
}

// --- MCP server setup ------------------------------------------------------

const mcp = new Server(
  { name: 'hacs-channel', version: '0.1.0' },
  {
    capabilities: {
      experimental: {
        'claude/channel': {},
        // TODO: 'claude/channel/permission': {} once sender gating is in
      },
      tools: {},
    },
    instructions: [
      `You are running in HACS with instance ID ${INSTANCE_ID}.`,
      `Events arrive as <channel source="hacs-channel" ...> tags with attributes routing context.`,
      `Common attributes: event_type, from (sender instance ID), target, thread_id, origin.`,
      `To reply to another instance, call the reply tool with to=target_instance_id.`,
      `Replies are routed via the HACS send_message API.`,
    ].join(' '),
  },
);

// --- Reply tool ------------------------------------------------------------

mcp.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'reply',
      description:
        'Send a reply through HACS. Routes to the target instance via the HACS send_message API.',
      inputSchema: {
        type: 'object',
        properties: {
          to: {
            type: 'string',
            description: 'Target instance ID (e.g. "Ember-75b6")',
          },
          text: {
            type: 'string',
            description: 'The message text',
          },
          subject: {
            type: 'string',
            description: 'Optional subject line for HACS messages',
          },
        },
        required: ['to', 'text'],
      },
    },
  ],
}));

mcp.setRequestHandler(CallToolRequestSchema, async req => {
  if (req.params.name === 'reply') {
    const { to, text, subject } = req.params.arguments;

    const body = {
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: {
        name: 'send_message',
        arguments: {
          from: INSTANCE_ID,
          to,
          subject: subject || 'Reply via channel',
          message: text,
        },
      },
    };

    try {
      const response = await fetch(HACS_API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      await response.text(); // drain the body
      broadcast(`[reply] ${INSTANCE_ID} -> ${to}: ${text.slice(0, 100)}`);
      return {
        content: [{ type: 'text', text: `Reply sent to ${to}` }],
      };
    } catch (err) {
      return {
        content: [{ type: 'text', text: `Failed to send reply: ${err.message}` }],
        isError: true,
      };
    }
  }
  throw new Error(`Unknown tool: ${req.params.name}`);
});

// --- Stdio connect to Claude Code ------------------------------------------

await mcp.connect(new StdioServerTransport());

// --- HTTP listener (Node http module — no third-party server) --------------

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host || BIND}`);

    // GET /events — SSE stream for debugging
    if (req.method === 'GET' && url.pathname === '/events') {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      });
      res.write(': connected\n\n');
      const emit = chunk => res.write(chunk);
      sseListeners.add(emit);
      req.on('close', () => sseListeners.delete(emit));
      return;
    }

    // GET /health — liveness check
    if (req.method === 'GET' && url.pathname === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        ok: true,
        instance: INSTANCE_ID,
        port: PORT,
        listeners: sseListeners.size,
      }));
      return;
    }

    // POST /broker-event — event from HACS event broker
    if (req.method === 'POST' && url.pathname === '/broker-event') {
      const raw = await readBody(req);
      let body;
      try {
        body = JSON.parse(raw);
      } catch {
        res.writeHead(400);
        res.end('bad json');
        return;
      }

      const eventType = body.event_type || 'unknown';
      const from = body.source || 'unknown';
      const target = body.target || INSTANCE_ID;
      const eventId = body.id || 'no-id';

      const content =
        typeof body.data === 'string' ? body.data : JSON.stringify(body.data, null, 2);

      await mcp.notification({
        method: 'notifications/claude/channel',
        params: {
          content,
          meta: {
            event_type: eventType,
            from,
            target,
            event_id: eventId,
            origin: 'broker',
          },
        },
      });

      broadcast(`[broker] ${eventType} from ${from}`);
      res.writeHead(200);
      res.end('ok');
      return;
    }

    // POST /direct-message — direct instance-to-instance (fallback layer 2)
    if (req.method === 'POST' && url.pathname === '/direct-message') {
      const raw = await readBody(req);
      let body;
      try {
        body = JSON.parse(raw);
      } catch {
        res.writeHead(400);
        res.end('bad json');
        return;
      }

      const from = body.from || 'unknown';
      const text = body.text || body.message || '';
      const threadId = body.thread_id || `direct-${Date.now()}`;

      // TODO: sender gating against allowlist before forwarding

      await mcp.notification({
        method: 'notifications/claude/channel',
        params: {
          content: text,
          meta: {
            event_type: 'direct.message',
            from,
            thread_id: threadId,
            origin: 'direct',
          },
        },
      });

      broadcast(`[direct] ${from} -> ${INSTANCE_ID}: ${text.slice(0, 100)}`);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, thread_id: threadId }));
      return;
    }

    res.writeHead(404);
    res.end('not found');
  } catch (err) {
    res.writeHead(500);
    res.end(`error: ${err.message}`);
  }
});

server.listen(PORT, BIND, () => {
  console.error(`[hacs-channel] Instance ${INSTANCE_ID}, listening on http://${BIND}:${PORT}`);
});
