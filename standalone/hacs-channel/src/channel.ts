#!/usr/bin/env bun
/**
 * hacs-channel — Claude Code Channels MCP server for HACS instances.
 *
 * Architecture (per-instance, loosely coupled):
 *   - Registers as a Claude Code channel (claude/channel capability)
 *   - Subscribes to Messenger's event broker via webhookEmitter driver
 *   - HTTP listener on per-instance port receives:
 *       POST /broker-event   - events from HACS event broker
 *       POST /direct-message - direct instance-to-instance messages (fallback)
 *       GET  /events         - SSE stream for debugging
 *   - reply tool routes Claude's outbound messages back via HACS API
 *   - Permission relay to Telegram (planned)
 *
 * Launch:
 *   claude -r <instance-name> --dangerously-load-development-channels server:hacs-channel
 *
 * Config (via env or .hacs-channel.env):
 *   HACS_INSTANCE_ID   - your instance ID (e.g. "Crossing-2d23")
 *   HACS_API_URL       - HACS coordination API (default: https://smoothcurves.nexus/mcp)
 *   CHANNEL_PORT       - HTTP listener port (default: 8788)
 *   CHANNEL_BIND       - Bind address (default: 127.0.0.1)
 *
 * Author: Crossing-2d23 <crossing-2d23@smoothcurves.nexus>
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { ListToolsRequestSchema, CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js';

// --- Configuration ---------------------------------------------------------

const INSTANCE_ID = process.env.HACS_INSTANCE_ID || 'unknown';
const HACS_API = process.env.HACS_API_URL || 'https://smoothcurves.nexus/mcp';
const PORT = parseInt(process.env.CHANNEL_PORT || '8788', 10);
const BIND = process.env.CHANNEL_BIND || '127.0.0.1';

// --- SSE listeners for debugging visibility --------------------------------

const sseListeners = new Set<(chunk: string) => void>();
function broadcast(text: string) {
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
      `Events arrive as <channel source="hacs" ...> tags with attributes routing context.`,
      `Common attributes: event_type (hacs event type), from (sender instance ID), thread_id (conversation thread).`,
      `To reply to another instance, call the reply tool with from=your_instance_id and to=target_instance_id.`,
      `To respond to a direct webhook, echo the thread_id from the incoming tag.`,
    ].join(' '),
  },
);

// --- Reply tool ------------------------------------------------------------

mcp.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'reply',
      description: 'Send a reply through the HACS channel. Routes to the originating source (HACS message, direct webhook, etc.)',
      inputSchema: {
        type: 'object',
        properties: {
          to: {
            type: 'string',
            description: 'Target instance ID (e.g. "Ember-75b6") or "lupo" for human',
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
    const { to, text, subject } = req.params.arguments as {
      to: string;
      text: string;
      subject?: string;
    };

    // Route via HACS send_message API
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
      const data = await response.json();
      broadcast(`[reply] ${INSTANCE_ID} -> ${to}: ${text.slice(0, 100)}`);
      return {
        content: [{ type: 'text', text: `Reply sent to ${to}` }],
      };
    } catch (err: any) {
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

// --- HTTP listener ---------------------------------------------------------

Bun.serve({
  port: PORT,
  hostname: BIND,
  idleTimeout: 0,
  async fetch(req) {
    const url = new URL(req.url);

    // GET /events - SSE stream for debugging
    if (req.method === 'GET' && url.pathname === '/events') {
      const stream = new ReadableStream({
        start(ctrl) {
          ctrl.enqueue(': connected\n\n');
          const emit = (chunk: string) => ctrl.enqueue(chunk);
          sseListeners.add(emit);
          req.signal.addEventListener('abort', () => sseListeners.delete(emit));
        },
      });
      return new Response(stream, {
        headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' },
      });
    }

    // GET /health - liveness check
    if (req.method === 'GET' && url.pathname === '/health') {
      return new Response(JSON.stringify({
        ok: true,
        instance: INSTANCE_ID,
        port: PORT,
        listeners: sseListeners.size,
      }), { headers: { 'Content-Type': 'application/json' } });
    }

    // POST /broker-event - event from HACS event broker (webhookEmitter driver)
    if (req.method === 'POST' && url.pathname === '/broker-event') {
      const body = await req.json().catch(() => null);
      if (!body) return new Response('bad json', { status: 400 });

      // Extract routing fields from broker event payload
      const eventType = body.event_type || 'unknown';
      const from = body.source || 'unknown';
      const target = body.target || INSTANCE_ID;
      const eventId = body.id || 'no-id';

      // Serialize the data as the channel content
      const content = typeof body.data === 'string'
        ? body.data
        : JSON.stringify(body.data, null, 2);

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
      return new Response('ok');
    }

    // POST /direct-message - direct instance-to-instance (fallback layer 2)
    if (req.method === 'POST' && url.pathname === '/direct-message') {
      const body = await req.json().catch(() => null);
      if (!body) return new Response('bad json', { status: 400 });

      const from = body.from || 'unknown';
      const text = body.text || body.message || '';
      const threadId = body.thread_id || `direct-${Date.now()}`;

      // TODO: sender gating against allowlist

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
      return new Response(JSON.stringify({ ok: true, thread_id: threadId }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response('not found', { status: 404 });
  },
});

// Print where we're listening so the launch script can verify
console.error(`[hacs-channel] Instance ${INSTANCE_ID}, listening on http://${BIND}:${PORT}`);
