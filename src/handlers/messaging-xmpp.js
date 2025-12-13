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
import { lookupIdentity } from '../v2/identity.js';

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

  // SMART ROUTING: For instance IDs (e.g., "Messenger-7e2f"), extract the name
  // and route to their personality room. This ensures messages are readable
  // and all instances of the same name share an inbox.
  //
  // "Messenger-7e2f" → personality-messenger room
  // "Bastion-abc1" → personality-bastion room
  //
  // This avoids the direct JID problem where messages go to offline queue
  // and can't be read via the API.

  // Extract name from instance ID (everything before the dash-suffix)
  const nameMatch = to.match(/^([a-zA-Z]+)(?:-[a-z0-9]+)?$/i);
  if (nameMatch) {
    const personality = nameMatch[1].toLowerCase();
    const roomJid = `personality-${personality}@${XMPP_CONFIG.conference}`;
    return { type: 'room', personality, jid: roomJid, originalTo: to };
  }

  // Fallback: still use personality room with sanitized name
  const sanitizedName = sanitizeIdentifier(to);
  const roomJid = `personality-${sanitizedName}@${XMPP_CONFIG.conference}`;
  return { type: 'room', personality: sanitizedName, jid: roomJid, originalTo: to };
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

    // Use send_stanza for room messages (groupchat) - send_message doesn't archive properly
    // Use send_message for direct messages (chat) - works fine for 1:1
    if (msgType === 'groupchat') {
      // Build XML stanza for MUC message (properly archived)
      // Note: XML uses single quotes for attributes to avoid shell double-quote conflicts
      const stanza = `<message type='groupchat' from='${fromJid}/${sanitizedFrom}' to='${recipient.jid}'><body>${safeBody}</body>${safeSubject ? `<subject>${safeSubject}</subject>` : ''}</message>`;
      await ejabberdctl(`send_stanza "${fromJid}" "${recipient.jid}" "${stanza}"`);
    } else {
      // Direct message - use send_message
      await ejabberdctl(
        `send_message "${msgType}" "${fromJid}" "${recipient.jid}" "${safeSubject}" "${safeBody}"`
      );
    }

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
 * Parse a single message XML stanza from room history
 * @param {string} xml - The XML stanza
 * @returns {Object|null} - Parsed message or null if invalid
 */
function parseMessageXML(xml) {
  try {
    // Extract stanza ID (message ID)
    const stanzaIdMatch = xml.match(/stanza-id[^>]*id='([^']+)'/);
    const id = stanzaIdMatch ? stanzaIdMatch[1] : null;

    // Extract sender JID and get just the username
    const fromMatch = xml.match(/from='([^']+)'/);
    const fullFrom = fromMatch ? fromMatch[1] : 'unknown';
    // Extract username from JID (before @) or resource (after /)
    const from = fullFrom.includes('/')
      ? fullFrom.split('/').pop()
      : fullFrom.split('@')[0];

    // Extract subject
    const subjectMatch = xml.match(/<subject>([^<]*)<\/subject>/);
    const subject = subjectMatch ? subjectMatch[1] : '';

    // Extract body
    const bodyMatch = xml.match(/<body>([^<]*)<\/body>/);
    const body = bodyMatch ? bodyMatch[1] : '';

    // Extract timestamp
    const stampMatch = xml.match(/stamp='([^']+)'/);
    const timestamp = stampMatch ? stampMatch[1] : null;

    if (!id) return null;

    return { id, from, subject, body, timestamp };
  } catch (e) {
    return null;
  }
}

/**
 * Truncate subject to max length, preserving word boundaries
 */
function truncateSubject(subject, maxLen = 50) {
  if (!subject || subject.length <= maxLen) return subject;
  const truncated = subject.substring(0, maxLen - 3);
  const lastSpace = truncated.lastIndexOf(' ');
  return (lastSpace > maxLen/2 ? truncated.substring(0, lastSpace) : truncated) + '...';
}

/**
 * Get rooms an instance should be monitoring based on preferences
 * @param {string} instanceId - Instance ID
 * @returns {Array<string>} - List of room names
 */
async function getInstanceRooms(instanceId) {
  const rooms = ['announcements']; // Everyone gets announcements

  // Extract personality name from instance ID (e.g., "Messenger-7e2f" → "messenger")
  const nameMatch = instanceId.match(/^([a-zA-Z]+)(?:-[a-z0-9]+)?$/i);
  if (nameMatch) {
    rooms.push(`personality-${nameMatch[1].toLowerCase()}`);
  }

  // Try to read preferences for role and project
  try {
    // Dynamic import to avoid circular dependency
    const { readPreferences } = await import('../v2/data.js');
    const prefs = await readPreferences(instanceId);

    if (prefs.role) {
      rooms.push(`role-${prefs.role.toLowerCase()}`);
    }
    if (prefs.project) {
      rooms.push(`project-${prefs.project.toLowerCase()}`);
    }
    if (prefs.personality && prefs.personality.toLowerCase() !== nameMatch?.[1]?.toLowerCase()) {
      rooms.push(`personality-${prefs.personality.toLowerCase()}`);
    }
  } catch (e) {
    // Preferences not found - just use the name-based room
  }

  return [...new Set(rooms)]; // Deduplicate
}

/**
 * Get messages for an instance - SMART DEFAULTS
 *
 * Returns headers only (id, from, subject truncated) from ALL relevant rooms:
 * - personality room (based on instance name)
 * - role room (from preferences)
 * - project room (from preferences)
 * - announcements
 *
 * IDENTITY RESOLUTION: If you don't know your instanceId, you can provide:
 * - name: Your instance name (e.g., "Messenger")
 * - workingDirectory: Your pwd
 * - hostname: System hostname
 * The system will look up your instanceId automatically.
 *
 * @param {Object} params
 * @param {string} params.instanceId - Instance to get messages for (optional if identity hints provided)
 * @param {string} params.name - Instance name for identity lookup (optional)
 * @param {string} params.workingDirectory - Working directory for identity lookup (optional)
 * @param {string} params.hostname - Hostname for identity lookup (optional)
 * @param {number} params.limit - Max messages to return (default: 5)
 * @param {string} params.before_id - Pagination: get messages before this ID
 */
export async function getMessages(params = {}) {
  let { instanceId, name, workingDirectory, hostname, limit = 5, before_id } = params;

  // Identity resolution: if no instanceId but have hints, look it up
  if (!instanceId && (name || workingDirectory || hostname)) {
    try {
      const lookupResult = await lookupIdentity({ name, workingDirectory, hostname });
      if (lookupResult.success && lookupResult.instanceId) {
        instanceId = lookupResult.instanceId;
        // Log successful identity resolution
        await logger.info('Identity resolved for messaging', {
          resolved: instanceId,
          matchedFields: lookupResult.matchedFields,
          confidence: lookupResult.confidence
        });
      } else {
        return {
          success: false,
          error: 'Could not resolve identity from provided hints',
          suggestion: 'Call bootstrap({ name: "YourName" }) to create a new instance, or provide instanceId directly',
          searchedFor: { name, workingDirectory, hostname }
        };
      }
    } catch (e) {
      await logger.error('Identity lookup failed', { error: e.message });
      return { success: false, error: `Identity lookup failed: ${e.message}` };
    }
  }

  if (!instanceId) {
    return {
      success: false,
      error: 'instanceId is required (or provide name/workingDirectory/hostname for identity lookup)',
      suggestion: 'Provide instanceId, or use identity hints: name, workingDirectory, or hostname'
    };
  }

  // SECURITY: Rate limiting
  if (!checkRateLimit(instanceId)) {
    return { success: false, error: 'Rate limit exceeded' };
  }

  if (!await isXMPPAvailable()) {
    return { success: false, error: 'XMPP server not available' };
  }

  try {
    // Get all rooms this instance should monitor
    const rooms = await getInstanceRooms(instanceId);
    const allMessages = [];

    // Query each room for history
    for (const roomName of rooms) {
      try {
        const history = await ejabberdctl(
          `get_room_history "${sanitizeIdentifier(roomName)}" "${XMPP_CONFIG.conference}"`
        );

        if (history && history.trim()) {
          // Split by message boundaries (timestamp at line start + tab + <message)
          const rawMessages = history.split(/(?=^\d{4}-\d{2}-\d{2}T[^\t]*\t<message)/m);

          for (const rawMsg of rawMessages) {
            if (!rawMsg.trim()) continue;
            const parsed = parseMessageXML(rawMsg);
            if (parsed) {
              allMessages.push({
                ...parsed,
                room: roomName
              });
            }
          }
        }
      } catch (e) {
        // Room might not exist or be empty, that's fine
      }
    }

    // Sort by timestamp (newest first)
    allMessages.sort((a, b) => {
      if (!a.timestamp) return 1;
      if (!b.timestamp) return -1;
      return b.timestamp.localeCompare(a.timestamp);
    });

    // Apply pagination if before_id specified
    let startIndex = 0;
    if (before_id) {
      const idx = allMessages.findIndex(m => m.id === before_id);
      if (idx !== -1) {
        startIndex = idx + 1;
      }
    }

    // Get the requested slice
    const slice = allMessages.slice(startIndex, startIndex + limit);

    // Return headers only (id, from, subject truncated, room)
    const messages = slice.map(m => ({
      id: m.id,
      from: m.from,
      subject: truncateSubject(m.subject || m.body, 50),
      room: m.room,
      timestamp: m.timestamp
    }));

    return {
      success: true,
      messages,
      total_available: allMessages.length,
      has_more: startIndex + limit < allMessages.length,
      rooms_checked: rooms
    };

  } catch (error) {
    await logger.error('getMessages failed', { error: error.message, params });
    return { success: false, error: error.message };
  }
}

/**
 * Get full message body by ID
 *
 * @param {Object} params
 * @param {string} params.instanceId - Instance requesting (for room access check)
 * @param {string} params.id - Message ID to retrieve
 * @param {string} params.room - Room hint (optional, speeds up lookup)
 */
export async function getMessage(params = {}) {
  const { instanceId, id, room } = params;

  if (!id) {
    return { success: false, error: 'id is required' };
  }
  if (!instanceId) {
    return { success: false, error: 'instanceId is required' };
  }

  if (!await isXMPPAvailable()) {
    return { success: false, error: 'XMPP server not available' };
  }

  try {
    // Get rooms to search
    const rooms = room ? [room] : await getInstanceRooms(instanceId);

    for (const roomName of rooms) {
      try {
        const history = await ejabberdctl(
          `get_room_history "${sanitizeIdentifier(roomName)}" "${XMPP_CONFIG.conference}"`
        );

        if (history && history.includes(id)) {
          // Found the room with this message, parse it
          const rawMessages = history.split(/(?=^\d{4}-\d{2}-\d{2}T[^\t]*\t<message)/m);

          for (const rawMsg of rawMessages) {
            if (!rawMsg.includes(id)) continue;
            const parsed = parseMessageXML(rawMsg);
            if (parsed && parsed.id === id) {
              // Return just the body (every token is precious!)
              return {
                success: true,
                body: parsed.body,
                from: parsed.from,
                subject: parsed.subject,
                timestamp: parsed.timestamp
              };
            }
          }
        }
      } catch (e) {
        // Continue to next room
      }
    }

    return { success: false, error: 'Message not found' };

  } catch (error) {
    await logger.error('getMessage failed', { error: error.message, params });
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
  get_message: getMessage,
  get_presence: getPresence,
  lookup_shortname: lookupShortname,
  get_messaging_info: getMessagingInfo,
  register_messaging_user: registerMessagingUser
};

export default handlers;
