/**
 * HACS Event Broker — Device driver pattern for event routing
 *
 * The core is dead simple: accept events, match against subscriptions, dispatch.
 * All intelligence lives in the drivers.
 *
 * Architecture: Crossing-2d23 (from HACS-EVENT-BROKER-requirements.md)
 * Implementation: Messenger-aa2a <Messenger-aa2a@smoothcurves.nexus>
 * Date: 2026-03-11
 */

import fs from 'fs/promises';
import path from 'path';
import { readPreferences, ensureDir } from './data.js';
import { DATA_ROOT, getInstancesDir, getInstanceDir } from './config.js';
import { logger } from '../logger.js';

// ---------------------------------------------------------------------------
// Layer 1: The Core Broker
// ---------------------------------------------------------------------------

class EventBroker {
  constructor() {
    this.subscriptions = [];   // { pattern, driver, config, id }
    this.eventLog = [];        // append-only for debugging
    this.maxLogSize = 1000;    // rolling window
    this.subIdCounter = 0;
  }

  /**
   * Emit an event to all matching subscribers.
   * Fire-and-forget (v1) — delivery failures are logged, not retried.
   */
  emit(event) {
    // Assign ID and timestamp if missing
    event.id = event.id || `evt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    event.timestamp = event.timestamp || Date.now();
    event.metadata = event.metadata || {};

    // Log (rolling window — shift is O(1) amortized in V8, avoids full-array copy)
    this.eventLog.push(event);
    if (this.eventLog.length > this.maxLogSize) {
      this.eventLog.shift();
    }

    logger.info(`[EventBroker] emit: ${event.type}`, {
      id: event.id,
      source: event.source,
      target: event.target
    });

    // Match and dispatch
    for (const sub of this.subscriptions) {
      if (!this.matches(event, sub)) continue;

      sub.driver.deliver(event, sub.config)
        .catch(err => {
          logger.error(`[EventBroker] delivery failed`, {
            eventId: event.id,
            eventType: event.type,
            driver: sub.driver.name || 'unknown',
            error: err.message
          });
        });
    }
  }

  /**
   * Check if an event matches a subscription.
   * Supports pattern matching AND target filtering.
   */
  matches(event, sub) {
    // Pattern matching: exact, wildcard prefix, or catch-all
    const pattern = sub.pattern;
    let patternMatch = false;

    if (pattern === '*') {
      patternMatch = true;
    } else if (sub._prefix) {
      patternMatch = event.type.startsWith(sub._prefix);
    } else {
      patternMatch = event.type === pattern;
    }

    if (!patternMatch) return false;

    // Target filtering: if sub has a target filter, event must match
    if (sub.config?.filter?.target) {
      return event.target === sub.config.filter.target;
    }

    return true;
  }

  /**
   * Register a subscription. Returns a subscription ID for removal.
   */
  subscribe(pattern, driver, config = {}) {
    const id = ++this.subIdCounter;
    // Pre-compute wildcard prefix to avoid string allocation in hot-path matches()
    const _prefix = pattern.endsWith('.*') ? pattern.slice(0, -1) : null;
    this.subscriptions.push({ pattern, driver, config, id, _prefix });
    logger.info(`[EventBroker] subscribe: ${pattern}`, {
      driver: driver.name || 'unknown',
      id,
      target: config?.filter?.target || '*'
    });
    return id;
  }

  /**
   * Remove a subscription by ID.
   */
  unsubscribe(id) {
    const before = this.subscriptions.length;
    this.subscriptions = this.subscriptions.filter(s => s.id !== id);
    return this.subscriptions.length < before;
  }

  /**
   * Remove all subscriptions for a target instance.
   */
  unsubscribeInstance(instanceId) {
    const before = this.subscriptions.length;
    this.subscriptions = this.subscriptions.filter(
      s => s.config?.filter?.target !== instanceId
    );
    const removed = before - this.subscriptions.length;
    if (removed > 0) {
      logger.info(`[EventBroker] unsubscribed ${removed} subscriptions for ${instanceId}`);
    }
    return removed;
  }

  /**
   * Get recent events (for debugging/admin).
   */
  getRecentEvents(limit = 20) {
    return this.eventLog.slice(-limit);
  }

  /**
   * Get all active subscriptions (for debugging/admin).
   */
  getSubscriptions() {
    return this.subscriptions.map(s => ({
      id: s.id,
      pattern: s.pattern,
      driver: s.driver.name || 'unknown',
      target: s.config?.filter?.target || '*'
    }));
  }
}


// ---------------------------------------------------------------------------
// Layer 2: Publisher Driver — HACS Handler Wrapper
// ---------------------------------------------------------------------------

/**
 * Maps handler names to event types.
 * Only handlers that produce meaningful events are mapped.
 */
const HANDLER_EVENT_MAP = {
  // Messaging
  'send_message':           'message.sent',
  'xmpp_send_message':      'message.sent',

  // Tasks
  'create_task':            'task.created',
  'assign_task':            'task.assigned',
  'take_on_task':           'task.assigned',
  'mark_task_complete':     'task.completed',
  'mark_task_verified':     'task.verified',
  'assign_task_to_instance': 'task.assigned',

  // Documents
  'create_document':        'document.created',
  'edit_document':          'document.updated',

  // Diary
  'add_diary_entry':        'diary.entry_added',

  // Instance lifecycle
  'bootstrap':              'instance.bootstrap',
  'launch_instance':        'instance.launched',
  'land_instance':          'instance.landed',
};

/**
 * Extract event source/target from handler params and result.
 * Each handler has different param shapes — this normalizes them.
 */
function extractEventFields(handlerName, params, result) {
  const source = params.instanceId || params.callerId || params.from || 'system';

  switch (handlerName) {
    case 'send_message':
    case 'xmpp_send_message':
      return {
        source,
        target: params.to || null,
        data: {
          messageId: result?.message_id,
          to: params.to,
          subject: params.subject,
          from: params.from
        }
      };

    case 'create_task':
    case 'assign_task':
    case 'take_on_task':
    case 'assign_task_to_instance':
    case 'mark_task_complete':
    case 'mark_task_verified':
      return {
        source,
        target: params.assignee || params.assigneeId || params.targetInstanceId || null,
        data: {
          taskId: result?.taskId || params.taskId,
          title: params.title
        }
      };

    case 'create_document':
    case 'edit_document':
      return {
        source,
        target: null,
        data: {
          documentId: params.id || params.documentId,
          title: params.title
        }
      };

    case 'add_diary_entry':
      return {
        source,
        target: params.instanceId,
        data: {
          instanceId: params.instanceId
        }
      };

    case 'bootstrap':
      return {
        source: params.instanceId || 'unknown',
        target: null,
        data: {
          instanceId: params.instanceId,
          name: params.name
        }
      };

    case 'launch_instance':
      return {
        source,
        target: params.targetInstanceId,
        data: {
          targetInstanceId: params.targetInstanceId,
          runtime: params.runtime || 'openfang',
          port: result?.port
        }
      };

    case 'land_instance':
      return {
        source,
        target: params.targetInstanceId,
        data: {
          targetInstanceId: params.targetInstanceId
        }
      };

    default:
      return { source, target: null, data: params };
  }
}

/**
 * Wraps the server's call() method to emit events after successful handler execution.
 * The wrapper is transparent — callers get exactly what they got before.
 */
function wrapServerCall(server, broker) {
  if (server._eventBrokerWrapped) return;  // Guard against double-wrapping
  server._eventBrokerWrapped = true;
  const originalCall = server.call.bind(server);

  server.call = async function(functionName, params = {}) {
    const result = await originalCall(functionName, params);

    // Only emit events for successful calls that are in the event map
    const eventType = HANDLER_EVENT_MAP[functionName];
    if (eventType && result?.success !== false) {
      const fields = extractEventFields(functionName, params, result);

      broker.emit({
        type: eventType,
        source: fields.source,
        target: fields.target,
        data: fields.data,
        metadata: {
          handler: functionName,
          priority: 'normal'
        }
      });
    }

    return result;
  };
}


// ---------------------------------------------------------------------------
// Layer 3: Emitter Drivers
// ---------------------------------------------------------------------------

// DATA_ROOT imported from config.js

/**
 * OpenFang Emitter — delivers events via the direct message API.
 * Uses POST /api/agents/{uuid}/message — the same endpoint
 * Axiom uses for direct instance-to-instance communication.
 *
 * Note: OpenFang's agent ID is a UUID, not a name. We resolve it
 * on first delivery and cache it.
 */
const openfangEmitter = {
  name: 'openfang',
  _agentIdCache: new Map(),  // port → agentUUID

  async deliver(event, config) {
    const port = config.port;
    if (!port) {
      throw new Error(`No port configured for ${config.instanceId}`);
    }

    // Resolve agent UUID (cached after first lookup)
    const agentId = await this._resolveAgentId(port, config.agentName);
    if (!agentId) {
      throw new Error(`No agent found on port ${port} for ${config.instanceId}`);
    }

    // Format the event as a human-readable notification message
    const message = formatEventNotification(event);
    const url = `http://127.0.0.1:${port}/api/agents/${agentId}/message`;

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message }),
      signal: AbortSignal.timeout(30000)  // LLM processing can take time
    });

    if (!response.ok) {
      throw new Error(`OpenFang message API returned ${response.status}`);
    }
  },

  async _resolveAgentId(port, agentName) {
    // Check cache first
    const cacheKey = `${port}:${agentName || 'default'}`;
    if (this._agentIdCache.has(cacheKey)) {
      return this._agentIdCache.get(cacheKey);
    }

    // Query the agents list
    const response = await fetch(`http://127.0.0.1:${port}/api/agents`, {
      signal: AbortSignal.timeout(5000)
    });
    if (!response.ok) return null;

    const agents = await response.json();
    if (!Array.isArray(agents) || agents.length === 0) return null;

    // Find by name or take the first running agent
    let agent = agentName
      ? agents.find(a => a.name === agentName && a.state === 'Running')
      : agents.find(a => a.state === 'Running');
    agent = agent || agents[0];

    if (agent?.id) {
      this._agentIdCache.set(cacheKey, agent.id);
      return agent.id;
    }
    return null;
  }
};

/**
 * Format an event into a notification message the instance can understand.
 */
function formatEventNotification(event) {
  switch (event.type) {
    case 'message.sent':
      return `[HACS Notification] New message from ${event.source}` +
        (event.data?.subject ? `: "${event.data.subject}"` : '') +
        `. Use list_my_messages to read it.`;

    case 'task.assigned':
      return `[HACS Notification] Task assigned to you by ${event.source}` +
        (event.data?.title ? `: "${event.data.title}"` : '') +
        `. Use get_my_tasks to see your tasks.`;

    case 'task.completed':
      return `[HACS Notification] Task completed by ${event.source}` +
        (event.data?.taskId ? ` (${event.data.taskId})` : '') + `.`;

    default:
      return `[HACS Event] ${event.type} from ${event.source}: ${JSON.stringify(event.data)}`;
  }
}

/**
 * Claude Code Emitter — writes a flag file for immediate poll trigger.
 * The Claude Code poller checks for this file and runs immediately if present.
 */
const claudeCodeEmitter = {
  name: 'claude-code',

  async deliver(event, config) {
    const instanceDir = config.instanceDir || getInstanceDir(config.instanceId);
    const flagDir = path.join(instanceDir, 'claude-code');
    const flagFile = path.join(flagDir, '.event-pending');

    await ensureDir(flagDir);

    // Write the event as the flag file content
    await fs.writeFile(flagFile, JSON.stringify(event, null, 2));
  }
};

/**
 * HACS API Emitter — triggers a HACS handler in response to an event.
 * For automation/workflow: event → action.
 */
const hacsApiEmitter = {
  name: 'hacs-api',

  async deliver(event, config) {
    // config.action = handler name, config.args = handler params
    // We import server dynamically to avoid circular dependency
    const { server } = await import('../server.js');
    await server.call(config.action, {
      ...config.args,
      _triggeredByEvent: event.id
    });
  }
};

/**
 * Log Emitter — just logs events (useful for debugging and audit).
 */
const logEmitter = {
  name: 'log',

  async deliver(event, _config) {
    logger.info(`[EventLog] ${event.type}`, {
      id: event.id,
      source: event.source,
      target: event.target,
      data: event.data
    });
  }
};


/**
 * Webhook Emitter — delivers events via HTTP POST to a registered URL.
 * For external instances, monitoring systems, or any HTTP-capable receiver.
 *
 * Config:
 *   url:      The webhook endpoint URL (required)
 *   headers:  Additional headers (optional, e.g. auth tokens)
 *   timeout:  Request timeout in ms (optional, default 10000)
 *   format:   'full' (entire event object) or 'notification' (human-readable)
 *             Default: 'full'
 */
const webhookEmitter = {
  name: 'webhook',

  async deliver(event, config) {
    if (!config.url) {
      throw new Error('Webhook emitter requires a url in config');
    }

    const body = config.format === 'notification'
      ? { notification: formatEventNotification(event), event_type: event.type, source: event.source }
      : { event_type: event.type, id: event.id, timestamp: event.timestamp, source: event.source, target: event.target, data: event.data, metadata: event.metadata };

    const response = await fetch(config.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(config.headers || {})
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(config.timeout || 10000)
    });

    if (!response.ok) {
      throw new Error(`Webhook ${config.url} returned ${response.status}`);
    }
  }
};

/**
 * Telegram Emitter — sends event notifications via Telegram Bot API.
 * For human notification — lights up your phone when something happens in HACS.
 *
 * Config:
 *   botToken:  Telegram bot token (required)
 *   chatId:    Chat/group ID to send to (required)
 *   parseMode: 'Markdown' or 'HTML' (optional, default 'Markdown')
 */
const telegramEmitter = {
  name: 'telegram',

  async deliver(event, config) {
    if (!config.botToken || !config.chatId) {
      throw new Error('Telegram emitter requires botToken and chatId in config');
    }

    const message = this._formatMessage(event);
    const url = `https://api.telegram.org/bot${config.botToken}/sendMessage`;

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: config.chatId,
        text: message,
        parse_mode: config.parseMode || 'Markdown'
      }),
      signal: AbortSignal.timeout(10000)
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(`Telegram API returned ${response.status}: ${body.slice(0, 200)}`);
    }
  },

  _formatMessage(event) {
    switch (event.type) {
      case 'message.sent':
        return `📨 *New message* from ${event.source}` +
          (event.data?.subject ? `\n_${event.data.subject}_` : '') +
          `\nUse \`list_my_messages\` to read it.`;

      case 'task.assigned':
        return `📋 *Task assigned* by ${event.source}` +
          (event.data?.title ? `\n_${event.data.title}_` : '') +
          `\nUse \`get_my_tasks\` to see your tasks.`;

      case 'task.completed':
        return `✅ *Task completed* by ${event.source}` +
          (event.data?.taskId ? ` (${event.data.taskId})` : '');

      case 'instance.bootstrap':
        return `🟢 *Instance online:* ${event.data?.instanceId || event.source}`;

      case 'instance.landed':
        return `🔴 *Instance offline:* ${event.data?.targetInstanceId || event.source}`;

      default:
        return `🔔 *${event.type}* from ${event.source}`;
    }
  }
};


// ---------------------------------------------------------------------------
// Registration: Auto-subscribe instances on launch, unsubscribe on land
// ---------------------------------------------------------------------------

/**
 * Resolve the delivery port for an OpenFang instance.
 * Checks prefs.runtime.port first, falls back to reading config.toml.
 * Accepts optional prefs to avoid duplicate readPreferences() call.
 */
async function resolveOpenFangPort(instanceId, prefs) {
  // Try preferences first (set by launch_instance)
  if (!prefs) prefs = await readPreferences(instanceId);
  if (prefs?.runtime?.port) return prefs.runtime.port;

  // Fall back to config.toml api_listen
  try {
    const configPath = path.join(getInstanceDir(instanceId), 'openfang', 'config.toml');
    const configContent = await fs.readFile(configPath, 'utf8');
    const match = configContent.match(/api_listen\s*=\s*"([^"]+)"/);
    if (match) {
      const portMatch = match[1].match(/:(\d+)$/);
      if (portMatch) return parseInt(portMatch[1]);
    }
  } catch { /* no config.toml */ }

  return null;
}

/**
 * Register an instance's emitter subscriptions with the broker.
 * Called after launch_instance or during broker initialization.
 *
 * Detection strategy (pragmatic, not config-dependent):
 * 1. If runtime.type is set, use it directly
 * 2. If an OpenFang port is resolvable (from prefs or config.toml), treat as openfang
 * 3. If interface is 'claude-code' or 'claude', treat as claude-code
 * 4. Otherwise, skip (instance has no known delivery mechanism)
 */
async function registerInstance(broker, instanceId) {
  const prefs = await readPreferences(instanceId);
  if (!prefs) return [];

  const subIds = [];
  const runtimeType = prefs.runtime?.type;
  const iface = prefs.interface;

  // Try OpenFang first: check if we can resolve a port (most reliable signal)
  // Pass prefs to avoid duplicate readPreferences() call
  const openfangPort = await resolveOpenFangPort(instanceId, prefs);
  const isOpenfang = runtimeType === 'openfang' || openfangPort != null;
  const isClaudeCode = runtimeType === 'claude-code' || iface === 'claude-code' || iface === 'claude';

  logger.info(`[EventBroker] registerInstance ${instanceId}: port=${openfangPort}, isOpenfang=${isOpenfang}, isClaudeCode=${isClaudeCode}, runtimeType=${runtimeType}, iface=${iface}`);

  // Determine driver and driver-specific config
  let driver = null;
  let driverConfig = {};

  if (isOpenfang && openfangPort) {
    const agentName = instanceId.split('-')[0].toLowerCase();
    driver = openfangEmitter;
    driverConfig = { port: openfangPort, agentName };
  } else if (isClaudeCode) {
    driver = claudeCodeEmitter;
  }

  if (driver) {
    // Subscribe to event types that target this instance
    for (const pattern of ['message.sent', 'task.assigned']) {
      subIds.push(broker.subscribe(pattern, driver, {
        instanceId,
        ...driverConfig,
        filter: { target: instanceId }
      }));
    }
  }

  return subIds;
}

/**
 * Scan for running instances and register them.
 * Called on broker startup.
 */
async function registerRunningInstances(broker) {
  const instancesDir = getInstancesDir();
  let entries;
  try {
    entries = await fs.readdir(instancesDir, { withFileTypes: true });
  } catch { return; }

  // Register all instances in parallel (each does 1-2 file reads)
  const results = await Promise.allSettled(
    entries
      .filter(e => e.isDirectory())
      .map(async (entry) => {
        const subs = await registerInstance(broker, entry.name);
        if (subs.length > 0) {
          logger.info(`[EventBroker] auto-registered ${entry.name} (${subs.length} subscriptions)`);
        }
      })
  );
}


// ---------------------------------------------------------------------------
// Singleton & Initialization
// ---------------------------------------------------------------------------

const broker = new EventBroker();

/**
 * Initialize the broker: register running instances and set up lifecycle hooks.
 * Called from server.js during startup.
 */
async function initBroker(server) {
  // Wrap the server's call() to emit events
  wrapServerCall(server, broker);

  // Register all currently running instances
  await registerRunningInstances(broker);

  // Subscribe to lifecycle events to auto-register/unregister instances
  broker.subscribe('instance.launched', {
    name: 'instance-registrar',
    async deliver(event) {
      const instanceId = event.data?.targetInstanceId;
      if (instanceId) {
        await registerInstance(broker, instanceId);
      }
    }
  });

  broker.subscribe('instance.landed', {
    name: 'instance-unregistrar',
    async deliver(event) {
      const instanceId = event.data?.targetInstanceId;
      if (instanceId) {
        broker.unsubscribeInstance(instanceId);
      }
    }
  });

  logger.info(`[EventBroker] initialized with ${broker.subscriptions.length} subscriptions`);
  return broker;
}


// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

export {
  EventBroker,
  broker,
  initBroker,
  registerInstance,

  // Emitter drivers (for external use/testing)
  openfangEmitter,
  claudeCodeEmitter,
  hacsApiEmitter,
  logEmitter,
  webhookEmitter,
  telegramEmitter,

  // Publisher driver utilities
  HANDLER_EVENT_MAP,
  extractEventFields,
  wrapServerCall
};
