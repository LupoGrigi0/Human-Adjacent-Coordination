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
 *       POST /broker-event         - events from HACS event broker (webhookEmitter)
 *       POST /direct-message       - direct instance-to-instance messages (fallback)
 *                                    also recognizes "yes <id>" / "no <id>" text verdicts
 *       GET  /events               - SSE stream for debugging + permission events
 *       GET  /health               - liveness check + pending count
 *       GET  /pending-permissions  - permission prompts awaiting verdict
 *       POST /permission-verdict   - approve/deny a pending permission prompt
 *   - reply tool routes Claude's outbound messages back via HACS API
 *   - permission relay forwards Bash/Edit/Write/MCP tool prompts to UI heat map
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
import { z } from 'zod';

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

// --- Pending permissions (in-memory state for UI heat map) -----------------
// Map<request_id, {tool_name, description, input_preview, received_at}>
// Cleared on session restart — Claude Code's local dialog also goes away
// when the session restarts, so this matches behavior.

const pendingPermissions = new Map();

// Verdict format used by Telegram/Discord/iMessage plugins.
// 5 lowercase letters from a-z minus 'l' (l visually ambiguous with 1/I).
// /i tolerates phone autocorrect capitalization.
const PERMISSION_REPLY_RE = /^\s*(y|yes|n|no)\s+([a-km-z]{5})\s*$/i;

// --- MCP server setup ------------------------------------------------------

const mcp = new Server(
  { name: 'hacs-channel', version: '0.1.0' },
  {
    capabilities: {
      experimental: {
        'claude/channel': {},
        // Permission relay: forward tool-approval prompts to UI/Telegram so Lupo
        // can approve/deny remotely. Per docs, this only relays runtime tool
        // prompts (Bash, Edit, Write, MCP calls) — NOT the launch gauntlet
        // (project trust, MCP server consent, dev-channels consent).
        // Sender gating: pending — currently relies on localhost-only HTTP bind.
        'claude/channel/permission': {},
      },
      tools: {},
    },
    instructions: [
      `You are running in HACS with instance ID ${INSTANCE_ID}.`,
      `Events arrive as <channel source="hacs-channel" ...> tags with attributes routing context.`,
      `Common attributes: event_type, from (sender instance ID), target, thread_id, origin.`,
      `To reply to another instance, call the reply tool with to=target_instance_id.`,
      `Replies are routed via the HACS send_message API.`,
      `Permission prompts for your tool calls (Bash, Edit, Write, MCP) are also relayed via this channel — they appear in Lupo's UI heat map for remote approve/deny.`,
    ].join(' '),
  },
);

// --- Reply tool ------------------------------------------------------------

const REPLY_TIMEOUT_MS = Number(process.env.CHANNEL_REPLY_TIMEOUT_MS || 20000);

/**
 * Return a human-readable reason the send failed, or null if it succeeded.
 *
 * "It returned 200" is not the same as "it was delivered." HACS answers 200
 * for application-level failures and reports them inside the payload, so an
 * honest check has to unwrap all the way down to HACS's own success flag.
 */
function describeSendFailure(response, rawBody) {
  if (!response.ok) {
    return `HTTP ${response.status} ${response.statusText}`;
  }

  let parsed;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    return `unparseable response from HACS: ${rawBody.slice(0, 200)}`;
  }

  if (parsed.error) {
    return `JSON-RPC error: ${parsed.error.message || JSON.stringify(parsed.error)}`;
  }

  // HACS nests its real answer under result.data (and mirrors it as JSON text
  // in result.content). Either shape may carry success:false.
  const data = parsed.result?.data;
  if (data && data.success === false) {
    const e = data.error || {};
    return `HACS rejected the send: ${e.code || 'ERROR'} ${e.message || ''}`.trim();
  }

  const textBlock = parsed.result?.content?.[0]?.text;
  if (typeof textBlock === 'string') {
    try {
      const inner = JSON.parse(textBlock);
      if (inner.success === false) {
        const e = inner.error || {};
        return `HACS rejected the send: ${e.code || 'ERROR'} ${e.message || ''}`.trim();
      }
    } catch {
      // Not JSON — nothing more to check, fall through to success.
    }
  }

  return null;
}

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

    // HACS send_message field names (verified from src/v2/messaging.js:824):
    //   from, to, subject, body  — note "body" NOT "message"
    const rpcBody = {
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: {
        name: 'send_message',
        arguments: {
          from: INSTANCE_ID,
          to,
          subject: subject || 'Reply via channel',
          body: text,
        },
      },
    };

    try {
      // H-01: bound the request. An unbounded fetch here hangs the instance's
      // turn indefinitely if HACS is wedged.
      const response = await fetch(HACS_API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(rpcBody),
        signal: AbortSignal.timeout(REPLY_TIMEOUT_MS),
      });

      const rawResponse = await response.text();

      // H-02: verify the send actually succeeded before telling the instance
      // it did. Three failure layers have to be checked separately, because a
      // failure at any one of them still produces HTTP 200:
      //   1. HTTP status
      //   2. JSON-RPC error member
      //   3. HACS's own {success:false, error:{...}} envelope inside result
      // Layer 3 is the one that bites: a malformed project file made
      // list_projects return HTTP 200 + success:false for weeks (2026-07-25).
      // Reporting "Reply sent" on any of these is how a message silently
      // disappears — the instance believes it spoke and no one heard it.
      const failure = describeSendFailure(response, rawResponse);
      if (failure) {
        broadcast(`[reply-FAILED] ${INSTANCE_ID} -> ${to}: ${failure}`);
        return {
          content: [{
            type: 'text',
            text: `Reply to ${to} was NOT delivered: ${failure}. `
                + `Do not assume they received it.`,
          }],
          isError: true,
        };
      }

      broadcast(`[reply] ${INSTANCE_ID} -> ${to}: ${text.slice(0, 100)}`);
      return {
        content: [{ type: 'text', text: `Reply sent to ${to}` }],
      };
    } catch (err) {
      const detail =
        err.name === 'TimeoutError'
          ? `HACS did not respond within ${REPLY_TIMEOUT_MS}ms`
          : err.message;
      broadcast(`[reply-FAILED] ${INSTANCE_ID} -> ${to}: ${detail}`);
      return {
        content: [{
          type: 'text',
          text: `Reply to ${to} was NOT delivered: ${detail}. Do not assume they received it.`,
        }],
        isError: true,
      };
    }
  }
  throw new Error(`Unknown tool: ${req.params.name}`);
});

// --- Permission relay handler ---------------------------------------------
// Claude Code calls this when a tool wants approval. We store the request
// for the UI heat map and broadcast it via SSE for any live subscribers.
//
// The verdict comes back via:
//   POST /permission-verdict {request_id, behavior}
// or via parseTextVerdict() applied to direct-message bodies (so Telegram-style
// "yes <id>" / "no <id>" text replies also work).

const PermissionRequestSchema = z.object({
  method: z.literal('notifications/claude/channel/permission_request'),
  params: z.object({
    request_id: z.string(),
    tool_name: z.string(),
    description: z.string(),
    input_preview: z.string(),
  }),
});

mcp.setNotificationHandler(PermissionRequestSchema, async ({ params }) => {
  const entry = {
    request_id: params.request_id,
    tool_name: params.tool_name,
    description: params.description,
    input_preview: params.input_preview,
    received_at: new Date().toISOString(),
  };
  pendingPermissions.set(params.request_id, entry);
  broadcast(
    `[permission-request] ${INSTANCE_ID} ${params.request_id} ${params.tool_name} ${JSON.stringify(params.description)}`
  );
});

/**
 * Send a verdict back to Claude Code. Removes from pendingPermissions on success.
 * Returns {ok, applied, reason}.
 */
async function applyVerdict(request_id, behavior) {
  if (!pendingPermissions.has(request_id)) {
    return { ok: false, applied: false, reason: 'request_id not found or already resolved' };
  }
  if (behavior !== 'allow' && behavior !== 'deny') {
    return { ok: false, applied: false, reason: `behavior must be "allow" or "deny", got: ${behavior}` };
  }
  await mcp.notification({
    method: 'notifications/claude/channel/permission',
    params: { request_id, behavior },
  });
  pendingPermissions.delete(request_id);
  broadcast(`[permission-resolved] ${INSTANCE_ID} ${request_id} ${behavior}`);
  return { ok: true, applied: true };
}

/**
 * Parse a text verdict like "yes abcde" or "no fghij".
 * Returns {request_id, behavior} or null if not a verdict.
 */
function parseTextVerdict(text) {
  const m = PERMISSION_REPLY_RE.exec(text);
  if (!m) return null;
  return {
    request_id: m[2].toLowerCase(),
    behavior: m[1].toLowerCase().startsWith('y') ? 'allow' : 'deny',
  };
}

// --- Stdio connect to Claude Code ------------------------------------------

await mcp.connect(new StdioServerTransport());

// --- HTTP listener (Node http module — no third-party server) --------------

/**
 * Prefix an inbound channel message with who sent it and how to answer.
 *
 * A channel notification lands mid-turn with no conversational framing, so a
 * receiving instance has no way to know (a) that a specific someone is waiting
 * on an answer, or (b) that speaking into its own transcript doesn't send
 * anything. Both facts have to travel with the message.
 */
function withReplyGuidance(text, from) {
  return [
    `[channel message from ${from}]`,
    '',
    text,
    '',
    `[To answer ${from}, call the hacs-channel "reply" tool with to="${from}".`,
    `Text written in your own output is NOT delivered — the reply tool is the`,
    `only path back to them.]`,
  ].join('\n');
}

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
        pending_permissions: pendingPermissions.size,
      }));
      return;
    }

    // GET /pending-permissions — list of permission prompts awaiting verdict
    if (req.method === 'GET' && url.pathname === '/pending-permissions') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        instance: INSTANCE_ID,
        pending: Array.from(pendingPermissions.values()),
      }));
      return;
    }

    // POST /permission-verdict — apply verdict {request_id, behavior:"allow"|"deny"}
    if (req.method === 'POST' && url.pathname === '/permission-verdict') {
      const raw = await readBody(req);
      let body;
      try {
        body = JSON.parse(raw);
      } catch {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, reason: 'bad json' }));
        return;
      }
      if (!body.request_id || !body.behavior) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, reason: 'request_id and behavior required' }));
        return;
      }
      const result = await applyVerdict(body.request_id, body.behavior);
      res.writeHead(result.ok ? 200 : 404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result));
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

      // Thin notification from the event hub (EVENT-HUB-CONTRACT.md §4).
      // Carries ONLY {channel, from, count, ts, thread_id?} — never a body.
      // Injected WITHOUT withReplyGuidance: there is nothing to reply to yet,
      // and guidance boilerplate would defeat the thin-notification purpose.
      // The instance drains on its own schedule via drain_events.
      if (body.event_type === 'notification' && body.notification) {
        const n = body.notification;
        if (n.count == null || !n.channel || !n.from) {
          res.writeHead(400);
          res.end('notification requires channel, from, count');
          return;
        }
        let text = `[notification] ${n.count} new on ${n.channel} from ${n.from} — drain_events when ready`;
        if (n.thread_id) text += ' (bidirectional — reply_channel to respond)';

        await mcp.notification({
          method: 'notifications/claude/channel',
          params: {
            content: text,
            meta: {
              event_type: 'notification',
              channel: n.channel,
              from: n.from,
              count: n.count,
              thread_id: n.thread_id,
              origin: 'hub',
            },
          },
        });

        broadcast(`[hub-notification] ${n.channel}/${n.from} count=${n.count}`);
        res.writeHead(200);
        res.end('ok');
        return;
      }

      const eventType = body.event_type || 'unknown';
      const from = body.source || 'unknown';
      const target = body.target || INSTANCE_ID;
      const eventId = body.id || 'no-id';

      const rawContent =
        typeof body.data === 'string' ? body.data : JSON.stringify(body.data, null, 2);

      // Wrap with routing instructions. Without this the receiving instance
      // answers in its own pane and the sender never hears back — the reply
      // tool exists but nothing tells the instance to reach for it, or who
      // to address. Observed 2026-07-25: a bare instance given "reply with
      // X" printed X locally and considered the job done. Delivery is the
      // channel's responsibility, so teaching the reply path is too.
      const content = withReplyGuidance(rawContent, from);

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

      // Check for text-form permission verdict ("yes abcde" / "no abcde")
      // before forwarding to Claude. Telegram/Discord/iMessage plugins use
      // this format; supporting it here means a Telegram bridge can POST
      // raw text replies to /direct-message and verdicts route correctly.
      const verdict = parseTextVerdict(text);
      if (verdict) {
        const result = await applyVerdict(verdict.request_id, verdict.behavior);
        broadcast(`[direct-verdict] ${from} -> ${verdict.request_id} ${verdict.behavior} (applied=${result.applied})`);
        res.writeHead(result.ok ? 200 : 404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ...result, thread_id: threadId, treated_as: 'verdict' }));
        return;
      }

      await mcp.notification({
        method: 'notifications/claude/channel',
        params: {
          content: withReplyGuidance(text, from),
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
