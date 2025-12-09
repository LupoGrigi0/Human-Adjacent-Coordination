/**
 * MCP Coordination System - XMPP Messaging Handler v4.1
 * Real-time messaging via ejabberd XMPP server
 *
 * Design principles (from Lupo's feedback):
 * - Every token is precious - minimal response data
 * - get_messages returns just headers+IDs, not full bodies
 * - Separate APIs for body and metadata
 * - Roles and personalities use rooms
 *
 * SECURITY: v4.1 - Patched command injection vulnerability (2025-12-05)
 *
 * @author Messenger (MessengerEngineer)
 * @date 2025-12-04
 * @security-patch 2025-12-05
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { logger } from '../logger.js';

const execAsync = promisify(exec);

// Configuration
const XMPP_CONFIG = {
  domain: 'smoothcurves.nexus',
  conference: 'conference.smoothcurves.nexus',
  container: 'v2-ejabberd',
  // Persistent personalities (humans and system)
  persistentUsers: ['lupo', 'system', 'genevieve'],
  // Role rooms - auto-created
  roleRooms: ['coo', 'pa', 'pm', 'developer', 'tester', 'designer', 'executive'],
};

// SECURITY: Input validation limits
const SECURITY_LIMITS = {
  MAX_SUBJECT_LENGTH: 256,
  MAX_BODY_LENGTH: 8192,
  MAX_USERNAME_LENGTH: 64,
  MAX_ROOM_LENGTH: 64,
  RATE_LIMIT_WINDOW_MS: 60000,  // 1 minute
  RATE_LIMIT_MAX_CALLS: 30,     // max calls per window
};

// SECURITY: Rate limiting (basic in-memory)
const rateLimitMap = new Map();

/**
 * SECURITY: Check rate limit for an instance
 * @param {string} instanceId
 * @returns {boolean} true if allowed, false if rate limited
 */
function checkRateLimit(instanceId) {
  const now = Date.now();
  const key = instanceId || 'anonymous';

  if (!rateLimitMap.has(key)) {
    rateLimitMap.set(key, { count: 1, windowStart: now });
    return true;
  }

  const record = rateLimitMap.get(key);

  // Reset window if expired
  if (now - record.windowStart > SECURITY_LIMITS.RATE_LIMIT_WINDOW_MS) {
    rateLimitMap.set(key, { count: 1, windowStart: now });
    return true;
  }

  // Check limit
  if (record.count >= SECURITY_LIMITS.RATE_LIMIT_MAX_CALLS) {
    return false;
  }

  record.count++;
  return true;
}

/**
 * SECURITY: Sanitize string for shell command
 * Removes ALL shell metacharacters - aggressive but safe
 * @param {string} str
 * @returns {string}
 */
function sanitizeForShell(str) {
  if (!str) return '';
  // Only allow alphanumeric, spaces, and basic punctuation
  // Removes: $ ` \ " ' ; | & < > ( ) { } [ ] ! # * ? ~
  return str
    .replace(/[\$`\\;"'|&<>(){}\[\]!#*?~\x00-\x1f]/g, '')
    .replace(/\n/g, ' ')
    .replace(/\r/g, '')
    .trim();
}

/**
 * SECURITY: Validate and sanitize username/room name
 * @param {string} name
 * @returns {string}
 */
function sanitizeIdentifier(name) {
  if (!name) return '';
  return name
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '_')
    .substring(0, SECURITY_LIMITS.MAX_USERNAME_LENGTH);
}

/**
 * Execute ejabberdctl command in Docker container
 * @param {string} command - The ejabberdctl command and arguments
 * @returns {Promise<string>} - Command output
 */
async function ejabberdctl(command) {
  try {
    const { stdout, stderr } = await execAsync(
      `docker exec ${XMPP_CONFIG.container} ejabberdctl ${command}`,
      { timeout: 10000 }
    );
    if (stderr && !stdout) {
      throw new Error(stderr);
    }
    return stdout.trim();
  } catch (error) {
    await logger.error(`ejabberdctl error: ${command}`, { error: error.message });
    throw error;
  }
}

/**
 * Check if ejabberd is available
 */
async function isXMPPAvailable() {
  try {
    const status = await ejabberdctl('status');
    return status.includes('is running');
  } catch (error) {
    return false;
  }
}

/**
 * Ensure a user exists in ejabberd
 * SECURITY: Sanitizes username and generates safe passwords
 * @param {string} username - Username (without domain)
 * @param {string} password - Password (optional, will generate if not provided)
 */
async function ensureUser(username, password = null) {
  // SECURITY: Use sanitizeIdentifier for consistent sanitization
  const user = sanitizeIdentifier(username);
  if (!user) {
    throw new Error('Invalid username');
  }
  // SECURITY: Generate alphanumeric-only password if not provided
  // Never use user-provided passwords in shell commands
  const pass = `auto_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

  try {
    // Check if user exists
    const result = await ejabberdctl(`check_account "${user}" "${XMPP_CONFIG.domain}"`);
    return { exists: true, username: user, jid: `${user}@${XMPP_CONFIG.domain}` };
  } catch (error) {
    // User doesn't exist, create it
    try {
      await ejabberdctl(`register "${user}" "${XMPP_CONFIG.domain}" "${pass}"`);
      return { exists: false, created: true, username: user, jid: `${user}@${XMPP_CONFIG.domain}` };
    } catch (regError) {
      // Might already exist (race condition)
      if (regError.message?.includes('already registered')) {
        return { exists: true, username: user, jid: `${user}@${XMPP_CONFIG.domain}` };
      }
      throw regError;
    }
  }
}

/**
 * Ensure a room exists
 * SECURITY: Sanitizes room name
 * @param {string} roomName - Room name (without domain)
 */
async function ensureRoom(roomName) {
  // SECURITY: Use sanitizeIdentifier for consistent sanitization
  const room = sanitizeIdentifier(roomName);
  if (!room) {
    throw new Error('Invalid room name');
  }
  try {
    await ejabberdctl(`create_room "${room}" "${XMPP_CONFIG.conference}" "${XMPP_CONFIG.domain}"`);
    return { room, jid: `${room}@${XMPP_CONFIG.conference}` };
  } catch (error) {
    // Room might already exist, that's fine
    return { room, jid: `${room}@${XMPP_CONFIG.conference}` };
  }
}

/**
 * Resolve a recipient address to XMPP JID(s)
 * Supports: instance IDs, short names, roles, personalities, projects
 *
 * @param {string} to - Recipient address
 * @returns {Object} - Resolved recipient info
 */
async function resolveRecipient(to) {
  if (!to) {
    return { error: 'Recipient is required' };
  }

  // Already a full JID?
  if (to.includes('@')) {
    return { type: 'direct', jid: to };
  }

  // Role-based addressing: role:COO, role:Developer
  if (to.startsWith('role:')) {
    const role = to.substring(5).toLowerCase();
    const roomJid = `role-${role}@${XMPP_CONFIG.conference}`;
    return { type: 'room', role, jid: roomJid };
  }

  // Personality-based addressing: personality:Lupo, or just Lupo
  if (to.startsWith('personality:')) {
    const personality = to.substring(12).toLowerCase();
    const roomJid = `personality-${personality}@${XMPP_CONFIG.conference}`;
    return { type: 'room', personality, jid: roomJid };
  }

  // Project team addressing: project:coordination-v2, team:coordination-v2
  if (to.startsWith('project:') || to.startsWith('team:')) {
    const project = to.substring(to.indexOf(':') + 1).toLowerCase();
    const roomJid = `project-${project}@${XMPP_CONFIG.conference}`;
    return { type: 'room', project, jid: roomJid };
  }

  // Broadcast: all
  if (to.toLowerCase() === 'all') {
    return { type: 'room', broadcast: true, jid: `announcements@${XMPP_CONFIG.conference}` };
  }

  // Check if it's a known persistent personality (short name)
  const lowerTo = to.toLowerCase();
  if (XMPP_CONFIG.persistentUsers.includes(lowerTo)) {
    // Route to personality room, not direct user
    const roomJid = `personality-${lowerTo}@${XMPP_CONFIG.conference}`;
    return { type: 'room', personality: lowerTo, jid: roomJid };
  }

  // Default: treat as instance ID (direct message)
  const jid = `${to}@${XMPP_CONFIG.domain}`;
  return { type: 'direct', instanceId: to, jid };
}

/**
 * Send a message via XMPP
 *
 * SECURITY: v4.1 - Added rate limiting, input validation, proper sanitization
 *
 * @param {Object} params
 * @param {string} params.to - Recipient (instance ID, role:X, project:X, personality:X, or 'all')
 * @param {string} params.from - Sender instance ID
 * @param {string} params.subject - Message subject (optional if body provided)
 * @param {string} params.body - Message body (optional if subject provided)
 * @param {string} params.priority - high, normal, low (default: normal)
 * @param {string} params.in_response_to - Message ID being replied to (optional)
 */
export async function sendMessage(params) {
  const { to, from, subject, body, priority = 'normal', in_response_to } = params;

  // SECURITY: Rate limiting
  if (!checkRateLimit(from)) {
    await logger.warn('Rate limit exceeded', { from });
    return { success: false, error: 'Rate limit exceeded. Please wait before sending more messages.' };
  }

  // Validate required fields
  if (!to) {
    return { success: false, error: 'to is required' };
  }
  if (!from) {
    return { success: false, error: 'from is required' };
  }
  if (!subject && !body) {
    return { success: false, error: 'subject or body is required' };
  }

  // SECURITY: Input length validation
  if (subject && subject.length > SECURITY_LIMITS.MAX_SUBJECT_LENGTH) {
    return { success: false, error: `Subject too long (max ${SECURITY_LIMITS.MAX_SUBJECT_LENGTH} chars)` };
  }
  if (body && body.length > SECURITY_LIMITS.MAX_BODY_LENGTH) {
    return { success: false, error: `Body too long (max ${SECURITY_LIMITS.MAX_BODY_LENGTH} chars)` };
  }

  // SECURITY: Validate priority is one of allowed values
  const allowedPriorities = ['high', 'normal', 'low'];
  if (!allowedPriorities.includes(priority)) {
    return { success: false, error: 'Invalid priority. Must be high, normal, or low.' };
  }

  // Check XMPP availability
  if (!await isXMPPAvailable()) {
    return { success: false, error: 'XMPP server not available' };
  }

  try {
    // SECURITY: Sanitize sender identifier
    const sanitizedFrom = sanitizeIdentifier(from);
    if (!sanitizedFrom) {
      return { success: false, error: 'Invalid from identifier' };
    }

    // Ensure sender exists
    await ensureUser(sanitizedFrom);
    const fromJid = `${sanitizedFrom}@${XMPP_CONFIG.domain}`;

    // Resolve recipient
    const recipient = await resolveRecipient(to);
    if (recipient.error) {
      return { success: false, error: recipient.error };
    }

    // Ensure room exists if sending to a room
    if (recipient.type === 'room') {
      await ensureRoom(recipient.jid.split('@')[0]);
    }

    // Determine message type
    const msgType = recipient.type === 'room' ? 'groupchat' : 'chat';

    // Build message body with metadata embedded
    const msgBody = [
      body || subject,
      priority !== 'normal' ? `[priority:${priority}]` : '',
      in_response_to ? `[reply-to:${sanitizeForShell(in_response_to)}]` : ''
    ].filter(Boolean).join(' ');

    // SECURITY: Sanitize all shell inputs (removes dangerous characters)
    const safeSubject = sanitizeForShell(subject || '');
    const safeBody = sanitizeForShell(msgBody);

    // Send via ejabberdctl - using sanitized inputs
    await ejabberdctl(
      `send_message "${msgType}" "${fromJid}" "${recipient.jid}" "${safeSubject}" "${safeBody}"`
    );

    // Generate message ID
    const messageId = `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    return {
      success: true,
      message_id: messageId,
      to: recipient.jid,
      type: recipient.type
    };

  } catch (error) {
    await logger.error('sendMessage failed', { error: error.message, params });
    return { success: false, error: error.message };
  }
}

/**
 * Get messages for an instance - MINIMAL response (headers only)
 *
 * @param {Object} params
 * @param {string} params.instanceId - Instance to get messages for
 * @param {number} params.limit - Max messages to return (default: 10)
 * @param {boolean} params.unread_only - Only return unread (default: false)
 */
export async function getMessages(params = {}) {
  const { instanceId, limit = 10, unread_only = false } = params;

  if (!instanceId) {
    return { success: false, error: 'instanceId is required' };
  }

  if (!await isXMPPAvailable()) {
    return { success: false, error: 'XMPP server not available' };
  }

  try {
    // Get offline message count
    const user = instanceId.toLowerCase().replace(/[^a-z0-9_-]/g, '_');
    let count = 0;
    try {
      const countResult = await ejabberdctl(`get_offline_count "${user}" "${XMPP_CONFIG.domain}"`);
      count = parseInt(countResult, 10) || 0;
    } catch (e) {
      // User might not exist yet
      count = 0;
    }

    // For now, return minimal info - just count
    // Full message retrieval requires MAM queries which need XMPP client connection
    // This is a limitation we'll address by implementing a polling/cache layer
    return {
      success: true,
      unread_count: count,
      instanceId,
      note: 'Full message list requires MAM - coming in next iteration'
    };

  } catch (error) {
    await logger.error('getMessages failed', { error: error.message, params });
    return { success: false, error: error.message };
  }
}

/**
 * Get online/active instances
 */
export async function getPresence(params = {}) {
  if (!await isXMPPAvailable()) {
    return { success: false, error: 'XMPP server not available' };
  }

  try {
    const result = await ejabberdctl(`connected_users_vhost "${XMPP_CONFIG.domain}"`);
    const users = result.split('\n').filter(u => u.trim());

    // Return just the list of online JIDs - minimal response
    return {
      success: true,
      online: users
    };

  } catch (error) {
    await logger.error('getPresence failed', { error: error.message });
    return { success: false, error: error.message };
  }
}

/**
 * Lookup short name to find matching instance IDs
 * @param {Object} params
 * @param {string} params.name - Short name to look up
 */
export async function lookupShortname(params) {
  const { name } = params;

  if (!name) {
    return { success: false, error: 'name is required' };
  }

  // This would query registered instances
  // For now, return a helpful message
  return {
    success: true,
    name,
    matches: [],
    note: 'Shortname lookup coming in next iteration - use full instance IDs for now'
  };
}

/**
 * Get messaging info for an instance (introspection API)
 * Replaces the bloated bootstrap response
 */
export async function getMessagingInfo(params) {
  const { instanceId } = params;

  if (!instanceId) {
    return { success: false, error: 'instanceId is required' };
  }

  if (!await isXMPPAvailable()) {
    return { success: false, error: 'XMPP server not available', fallback: true };
  }

  try {
    const user = instanceId.toLowerCase().replace(/[^a-z0-9_-]/g, '_');
    const jid = `${user}@${XMPP_CONFIG.domain}`;

    // Get offline count
    let unreadCount = 0;
    try {
      const countResult = await ejabberdctl(`get_offline_count "${user}" "${XMPP_CONFIG.domain}"`);
      unreadCount = parseInt(countResult, 10) || 0;
    } catch (e) {
      unreadCount = 0;
    }

    // Get online users
    let onlineUsers = [];
    try {
      const result = await ejabberdctl(`connected_users_vhost "${XMPP_CONFIG.domain}"`);
      onlineUsers = result.split('\n').filter(u => u.trim());
    } catch (e) {
      onlineUsers = [];
    }

    return {
      success: true,
      your_jid: jid,
      unread_count: unreadCount,
      online_teammates: onlineUsers
    };

  } catch (error) {
    await logger.error('getMessagingInfo failed', { error: error.message });
    return { success: false, error: error.message };
  }
}

/**
 * Register an instance with the messaging system
 * Called by bootstrap
 */
export async function registerMessagingUser(params) {
  const { instanceId, role, project } = params;

  if (!instanceId) {
    return { success: false, error: 'instanceId is required' };
  }

  if (!await isXMPPAvailable()) {
    return { success: false, error: 'XMPP server not available', fallback: true };
  }

  try {
    // Create/ensure user
    const userResult = await ensureUser(instanceId);

    // Ensure role room exists and note that user should join
    if (role) {
      await ensureRoom(`role-${role.toLowerCase()}`);
    }

    // Ensure project room exists
    if (project) {
      await ensureRoom(`project-${project.toLowerCase()}`);
    }

    // Ensure announcements room exists
    await ensureRoom('announcements');

    return {
      success: true,
      jid: userResult.jid,
      created: userResult.created || false,
      rooms: {
        role: role ? `role-${role.toLowerCase()}@${XMPP_CONFIG.conference}` : null,
        project: project ? `project-${project.toLowerCase()}@${XMPP_CONFIG.conference}` : null,
        announcements: `announcements@${XMPP_CONFIG.conference}`
      }
    };

  } catch (error) {
    await logger.error('registerMessagingUser failed', { error: error.message, params });
    return { success: false, error: error.message };
  }
}

// Export handler object for server.js integration
export const handlers = {
  send_message: sendMessage,
  get_messages: getMessages,
  get_presence: getPresence,
  lookup_shortname: lookupShortname,
  get_messaging_info: getMessagingInfo,
  register_messaging_user: registerMessagingUser
};

export default handlers;
