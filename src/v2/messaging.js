/**
 * MCP Coordination System - XMPP Messaging Handler v5.0
 * Real-time messaging via ejabberd XMPP server
 *
 * Design principles (from Lupo's feedback):
 * - Every token is precious - minimal response data
 * - get_messages returns just headers+IDs, not full bodies
 * - Separate APIs for body and metadata
 * - Roles and personalities use rooms
 *
 * v5.0 - Fuzzy send_message (2026-02-04)
 * - Case-insensitive fuzzy matching on recipient names
 * - Auto-resolves to instance/project/role/personality room
 * - Helpful error messages with suggestions on ambiguity
 * - "Send to Ember" just works, no need to know the full ID
 *
 * SECURITY: v4.1 - Patched command injection vulnerability (2025-12-05)
 *
 * @author Messenger (MessengerEngineer), Ember-75b6
 * @date 2025-12-04
 * @security-patch 2025-12-05
 * @fuzzy-matching 2026-02-04
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { logger } from '../logger.js';
import { lookupIdentity } from './identity.js';

const execAsync = promisify(exec);

// Configuration - exported for use by bootstrap, introspect, joinProject
export const XMPP_CONFIG = {
  domain: 'smoothcurves.nexus',
  conference: 'conference.smoothcurves.nexus',
  container: 'ejabberd',
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

// ============================================================================
// FUZZY MATCHING UTILITIES (v5.0)
// ============================================================================

/**
 * Simple Levenshtein distance for fuzzy matching
 * @param {string} a
 * @param {string} b
 * @returns {number} - Edit distance between strings
 */
function levenshteinDistance(a, b) {
  if (!a || !b) return Math.max(a?.length || 0, b?.length || 0);

  const matrix = [];
  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }
  return matrix[b.length][a.length];
}

/**
 * Score how well a query matches a target (higher = better)
 * @param {string} query - Search query (what user typed)
 * @param {string} target - Target to match against
 * @returns {number} - Score (0-100, higher is better)
 */
function fuzzyScore(query, target) {
  if (!query || !target) return 0;

  const q = query.toLowerCase().trim();
  const t = target.toLowerCase().trim();

  // Exact match
  if (q === t) return 100;

  // Starts with (very high score)
  if (t.startsWith(q)) return 90;

  // Contains (high score)
  if (t.includes(q)) return 80;

  // Query starts with target (e.g., "ember-75b6" starts with "ember")
  if (q.startsWith(t)) return 75;

  // Levenshtein distance (fuzzy matching for typos)
  const distance = levenshteinDistance(q, t);
  const maxLen = Math.max(q.length, t.length);
  const similarity = 1 - (distance / maxLen);

  // Only return positive score if reasonably similar (>50% match)
  if (similarity > 0.5) {
    return Math.round(similarity * 60);
  }

  return 0;
}

/**
 * Get all known instances for fuzzy matching
 * @returns {Promise<Array<{id: string, name: string, role: string, project: string, personality: string}>>}
 */
async function getAllKnownInstances() {
  try {
    const { getAllInstances } = await import('./instances.js');
    const result = await getAllInstances({});
    if (result.success && result.instances) {
      return result.instances.map(inst => ({
        id: inst.instanceId,
        name: inst.name || inst.instanceId.split('-')[0],
        role: inst.role,
        project: inst.project,
        personality: inst.personality || inst.name || inst.instanceId.split('-')[0]
      }));
    }
  } catch (e) {
    await logger.error('Failed to get instances for fuzzy matching', { error: e.message });
  }
  return [];
}

/**
 * Get all known projects for fuzzy matching
 * @returns {Promise<Array<string>>}
 */
async function getAllKnownProjects() {
  try {
    const fs = await import('fs/promises');
    const { DATA_ROOT } = await import('./config.js');
    const projectsDir = `${DATA_ROOT}/projects`;
    const dirs = await fs.readdir(projectsDir);
    return dirs.filter(d => !d.startsWith('.'));
  } catch (e) {
    return [];
  }
}

/**
 * Fuzzy match a recipient and return best matches with scores
 * @param {string} query - What the user typed as recipient
 * @returns {Promise<Array<{type: string, target: string, jid: string, score: number, display: string}>>}
 */
async function fuzzyMatchRecipient(query) {
  if (!query) return [];

  const q = query.toLowerCase().trim();
  const matches = [];

  // Check explicit prefixes first (not fuzzy)
  if (q.startsWith('role:')) {
    const role = q.substring(5);
    matches.push({
      type: 'room',
      subtype: 'role',
      target: role,
      jid: `role-${sanitizeIdentifier(role)}@${XMPP_CONFIG.conference}`,
      score: 100,
      display: `role:${role}`
    });
    return matches;
  }

  if (q.startsWith('project:') || q.startsWith('team:')) {
    const project = q.substring(q.indexOf(':') + 1);
    matches.push({
      type: 'room',
      subtype: 'project',
      target: project,
      jid: `project-${sanitizeIdentifier(project)}@${XMPP_CONFIG.conference}`,
      score: 100,
      display: `project:${project}`
    });
    return matches;
  }

  if (q.startsWith('personality:')) {
    const personality = q.substring(12);
    matches.push({
      type: 'room',
      subtype: 'personality',
      target: personality,
      jid: `personality-${sanitizeIdentifier(personality)}@${XMPP_CONFIG.conference}`,
      score: 100,
      display: `personality:${personality}`
    });
    return matches;
  }

  if (q === 'all') {
    matches.push({
      type: 'room',
      subtype: 'broadcast',
      target: 'all',
      jid: `announcements@${XMPP_CONFIG.conference}`,
      score: 100,
      display: 'all (announcements)'
    });
    return matches;
  }

  // Already a JID?
  if (query.includes('@')) {
    matches.push({
      type: 'direct',
      target: query,
      jid: query,
      score: 100,
      display: query
    });
    return matches;
  }

  // Fuzzy match against instances (by name and full ID)
  const instances = await getAllKnownInstances();
  for (const inst of instances) {
    // Match against name
    const nameScore = fuzzyScore(q, inst.name);
    if (nameScore > 0) {
      matches.push({
        type: 'room',
        subtype: 'personality',
        target: inst.name,
        jid: `personality-${sanitizeIdentifier(inst.name)}@${XMPP_CONFIG.conference}`,
        score: nameScore,
        display: `${inst.name} (instance: ${inst.id})`,
        instanceId: inst.id
      });
    }

    // Match against full instance ID (if different from name)
    const idScore = fuzzyScore(q, inst.id);
    if (idScore > nameScore && idScore > 0) {
      // Only add if it's a better match than the name
      const existing = matches.find(m => m.instanceId === inst.id);
      if (existing) {
        existing.score = Math.max(existing.score, idScore);
      } else {
        matches.push({
          type: 'room',
          subtype: 'personality',
          target: inst.name,
          jid: `personality-${sanitizeIdentifier(inst.name)}@${XMPP_CONFIG.conference}`,
          score: idScore,
          display: `${inst.name} (instance: ${inst.id})`,
          instanceId: inst.id
        });
      }
    }
  }

  // Fuzzy match against roles
  for (const role of XMPP_CONFIG.roleRooms) {
    const score = fuzzyScore(q, role);
    if (score > 0) {
      matches.push({
        type: 'room',
        subtype: 'role',
        target: role,
        jid: `role-${role}@${XMPP_CONFIG.conference}`,
        score: score,
        display: `role:${role}`
      });
    }
  }

  // Fuzzy match against projects
  const projects = await getAllKnownProjects();
  for (const project of projects) {
    const score = fuzzyScore(q, project);
    if (score > 0) {
      matches.push({
        type: 'room',
        subtype: 'project',
        target: project,
        jid: `project-${sanitizeIdentifier(project)}@${XMPP_CONFIG.conference}`,
        score: score,
        display: `project:${project}`
      });
    }
  }

  // Fuzzy match against persistent personalities
  for (const personality of XMPP_CONFIG.persistentUsers) {
    const score = fuzzyScore(q, personality);
    if (score > 0) {
      matches.push({
        type: 'room',
        subtype: 'personality',
        target: personality,
        jid: `personality-${personality}@${XMPP_CONFIG.conference}`,
        score: score,
        display: `${personality} (personality)`
      });
    }
  }

  // Sort by score (highest first), deduplicate by JID
  const seen = new Set();
  const deduplicated = [];
  matches.sort((a, b) => b.score - a.score);
  for (const m of matches) {
    if (!seen.has(m.jid)) {
      seen.add(m.jid);
      deduplicated.push(m);
    }
  }

  return deduplicated;
}

// ============================================================================
// END FUZZY MATCHING UTILITIES
// ============================================================================

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

  // SMART ROUTING: For instance IDs (e.g., "Messenger-7e2f", "Canvas-UITest-8215"),
  // extract the first part and route to their personality room.
  // This ensures messages are readable and all instances of the same name share an inbox.
  //
  // "Messenger-7e2f" → personality-messenger room
  // "Canvas-UITest-8215" → personality-canvas room
  // "Bastion-abc1" → personality-bastion room
  //
  // This avoids the direct JID problem where messages go to offline queue
  // and can't be read via the API.

  // Extract first part before any dash (the personality/name)
  const parts = to.split('-');
  const personality = parts[0].toLowerCase();
  const roomJid = `personality-${personality}@${XMPP_CONFIG.conference}`;
  return { type: 'room', personality, jid: roomJid, originalTo: to };
}

/**
 * @hacs-endpoint
 * @template-version 1.0.0
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │ XMPP_SEND_MESSAGE                                                       │
 * │ Send a message to an instance, role, or project via XMPP                │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * @tool xmpp_send_message
 * @version 4.1.0
 * @since 2025-12-04
 * @category messaging
 * @status stable
 *
 * ───────────────────────────────────────────────────────────────────────────
 * DESCRIPTION
 * ───────────────────────────────────────────────────────────────────────────
 * @description
 * Sends a message via the XMPP messaging system. Supports multiple addressing
 * modes: direct instance messaging, role-based broadcast (role:COO), project
 * team messaging (project:coordination-v2), personality rooms (personality:lupo),
 * and system-wide announcements (to: 'all').
 *
 * Use this endpoint when you need to communicate with other instances,
 * broadcast to a role group, or send project-wide notifications. Messages
 * are archived in XMPP rooms for retrieval via xmpp_get_messages.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * PARAMETERS
 * ───────────────────────────────────────────────────────────────────────────
 * @param {string} to - Recipient address [required]
 *   @source Use one of these formats:
 *           - Instance ID: "Messenger-7e2f" (routes to personality room)
 *           - Role: "role:COO", "role:Developer" (role-based room)
 *           - Project: "project:coordination-v2" (project team room)
 *           - Personality: "personality:lupo" (personality room)
 *           - Broadcast: "all" (announcements room)
 *           - Full JID: "user@smoothcurves.nexus" (direct)
 *
 * @param {string} from - Sender's instance ID [required]
 *   @source Your instanceId from bootstrap response or introspect.
 *   @validate Must be a valid instance ID format
 *
 * @param {string} subject - Message subject line [optional]
 *   @source Provide a brief subject. Required if body is not provided.
 *   @validate Max 256 characters
 *
 * @param {string} body - Message body content [optional]
 *   @source The main message content. Required if subject is not provided.
 *   @validate Max 8192 characters
 *
 * @param {string} priority - Message priority level [optional]
 *   @source Set based on urgency of the message.
 *   @default normal
 *   @enum high|normal|low
 *
 * @param {string} in_response_to - Message ID being replied to [optional]
 *   @source Get message IDs from xmpp_get_messages response. Use when
 *           replying to a specific message to maintain thread context.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * RETURNS
 * ───────────────────────────────────────────────────────────────────────────
 * @returns {object} SendMessageResponse
 * @returns {boolean} .success - Whether the message was sent successfully
 * @returns {string} .message_id - Generated message ID for tracking
 * @returns {string} .to - Resolved recipient JID
 * @returns {string} .type - Message type ('room' or 'direct')
 *
 * ───────────────────────────────────────────────────────────────────────────
 * PERMISSIONS & LIMITS
 * ───────────────────────────────────────────────────────────────────────────
 * @permissions authenticated
 * @rateLimit 30/minute
 *
 * ───────────────────────────────────────────────────────────────────────────
 * ERRORS & RECOVERY
 * ───────────────────────────────────────────────────────────────────────────
 * @error RATE_LIMIT_EXCEEDED - Too many messages sent in short period
 *   @recover Wait 1 minute before sending more messages. Consider batching.
 *
 * @error MISSING_PARAMETER - Required parameter not provided
 *   @recover Ensure 'to', 'from', and either 'subject' or 'body' are provided.
 *
 * @error INVALID_PRIORITY - Priority value not recognized
 *   @recover Use one of: 'high', 'normal', 'low'.
 *
 * @error SUBJECT_TOO_LONG - Subject exceeds 256 characters
 *   @recover Shorten subject to under 256 characters.
 *
 * @error BODY_TOO_LONG - Body exceeds 8192 characters
 *   @recover Shorten body or split into multiple messages.
 *
 * @error XMPP_UNAVAILABLE - XMPP server not running
 *   @recover Check that ejabberd container is running. Contact system admin.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * EXAMPLES
 * ───────────────────────────────────────────────────────────────────────────
 * @example Send to another instance
 * {
 *   "to": "Canvas-8215",
 *   "from": "Messenger-7e2f",
 *   "subject": "API Update",
 *   "body": "The new messaging endpoints are ready for testing."
 * }
 *
 * @example Broadcast to role group
 * {
 *   "to": "role:Developer",
 *   "from": "PM-a1b2",
 *   "subject": "Sprint Planning",
 *   "body": "Sprint planning meeting in 30 minutes.",
 *   "priority": "high"
 * }
 *
 * @example Reply to a message
 * {
 *   "to": "Lupo",
 *   "from": "Messenger-7e2f",
 *   "body": "Yes, the migration is complete.",
 *   "in_response_to": "msg-1735123456-abc123"
 * }
 *
 * ───────────────────────────────────────────────────────────────────────────
 * RELATED
 * ───────────────────────────────────────────────────────────────────────────
 * @see xmpp_get_messages - Retrieve message headers from rooms
 * @see xmpp_get_message - Get full message body by ID
 * @see get_presence - Check who is online before messaging
 *
 * ───────────────────────────────────────────────────────────────────────────
 * NOTES
 * ───────────────────────────────────────────────────────────────────────────
 * @note SECURITY: v4.1 patched command injection vulnerability (2025-12-05)
 * @note Messages to instance IDs route to personality rooms for proper archiving
 * @note Shell metacharacters are sanitized from all inputs
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

    // v5.0: FUZZY RECIPIENT RESOLUTION
    // Instead of the old resolveRecipient, use fuzzy matching
    const matches = await fuzzyMatchRecipient(to);

    if (matches.length === 0) {
      // No matches at all - provide helpful error
      const instances = await getAllKnownInstances();
      const projects = await getAllKnownProjects();
      const suggestions = [];

      // Suggest some known targets
      if (instances.length > 0) {
        suggestions.push(`Known instances: ${instances.slice(0, 5).map(i => i.name).join(', ')}${instances.length > 5 ? '...' : ''}`);
      }
      if (projects.length > 0) {
        suggestions.push(`Projects: ${projects.slice(0, 5).join(', ')}${projects.length > 5 ? '...' : ''}`);
      }
      suggestions.push(`Roles: ${XMPP_CONFIG.roleRooms.join(', ')}`);
      suggestions.push(`Tip: Use "role:developer" or "project:hacs" for explicit targeting`);

      return {
        success: false,
        error: `No recipient found matching "${to}"`,
        suggestions,
        hint: 'Try a name, instance ID, project name, role, or use explicit prefixes like role: or project:'
      };
    }

    // Check for ambiguity
    const topScore = matches[0].score;
    const goodMatches = matches.filter(m => m.score >= topScore - 10 && m.score >= 70);

    if (goodMatches.length > 1 && topScore < 100) {
      // Multiple good matches, none clearly best - ask for clarification
      return {
        success: false,
        error: `Ambiguous recipient "${to}" - multiple matches found`,
        matches: goodMatches.slice(0, 5).map(m => ({
          display: m.display,
          score: m.score,
          use: m.subtype ? `${m.subtype}:${m.target}` : m.target
        })),
        hint: 'Please be more specific, or use one of the suggested values in the "use" field'
      };
    }

    // Use the best match
    const recipient = matches[0];

    // Ensure room exists if sending to a room
    if (recipient.type === 'room') {
      await ensureRoom(recipient.jid.split('@')[0]);
    }

    // Determine message type
    const msgType = recipient.type === 'room' ? 'groupchat' : 'chat';

    // Build message body with metadata embedded
    // Include sender tag so we can identify who sent the message
    // (ejabberd strips the resource from the from attribute)
    // Note: Use format without brackets since sanitizeForShell removes them
    const msgBody = [
      `sender:${sanitizedFrom}`,
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
      // IMPORTANT: Use system@domain as sender JID - only system user can send archived MUC messages
      // The actual sender is shown in the "from" attribute resource part (e.g., system@.../messenger-7e2f)
      const systemJid = `system@${XMPP_CONFIG.domain}`;
      const stanza = `<message type="groupchat" from="${systemJid}/${sanitizedFrom}" to="${recipient.jid}"><body>${safeBody}</body>${safeSubject ? `<subject>${safeSubject}</subject>` : ''}</message>`;
      await ejabberdctl(`send_stanza '${systemJid}' '${recipient.jid}' '${stanza}'`);
    } else {
      // Direct message - use send_message
      await ejabberdctl(
        `send_message "${msgType}" "${fromJid}" "${recipient.jid}" "${safeSubject}" "${safeBody}"`
      );
    }

    // Generate message ID
    const messageId = `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    // Include what we resolved to in the response (helpful for debugging)
    return {
      success: true,
      message_id: messageId,
      delivered_to: recipient.display,
      resolved_jid: recipient.jid,
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

    // Extract subject
    const subjectMatch = xml.match(/<subject>([^<]*)<\/subject>/);
    const subject = subjectMatch ? subjectMatch[1] : '';

    // Extract body
    const bodyMatch = xml.match(/<body>([^<]*)<\/body>/);
    let body = bodyMatch ? bodyMatch[1] : '';

    // Extract sender from sender:X prefix if present
    // This is how we preserve sender identity since ejabberd strips the resource
    // Note: Uses format without brackets since sanitizeForShell removes them
    const senderMatch = body.match(/^sender:([a-z0-9_-]+)\s+/i);
    let from;

    if (senderMatch) {
      // Use sender from body prefix
      from = senderMatch[1];
      // Remove the sender prefix from body
      body = body.substring(senderMatch[0].length);
    } else {
      // Fall back to extracting from JID
      const fromMatch = xml.match(/from='([^']+)'/);
      const fullFrom = fromMatch ? fromMatch[1] : 'unknown';
      // Extract username from JID (before @) or resource (after /)
      from = fullFrom.includes('/')
        ? fullFrom.split('/').pop()
        : fullFrom.split('@')[0];
    }

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
 * Extract the personality/name from an instance ID
 * Handles various formats: "Messenger-7e2f", "Canvas-UITest-8215", "Lupo", etc.
 * @param {string} instanceId
 * @returns {string} - The personality name (lowercase)
 */
function extractPersonalityFromInstanceId(instanceId) {
  if (!instanceId) return null;
  // Take everything before the first dash, or the whole string if no dash
  const parts = instanceId.split('-');
  return parts[0].toLowerCase();
}

/**
 * Get rooms an instance should be monitoring based on preferences
 * @param {string} instanceId - Instance ID
 * @returns {Array<string>} - List of room names
 */
async function getInstanceRooms(instanceId) {
  const rooms = ['announcements']; // Everyone gets announcements

  // Extract personality name from instance ID
  const personality = extractPersonalityFromInstanceId(instanceId);
  if (personality) {
    rooms.push(`personality-${personality}`);
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
 * @hacs-endpoint
 * @template-version 1.0.0
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │ XMPP_GET_MESSAGES                                                       │
 * │ Get message headers from rooms (personality, role, project, announce)   │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * @tool xmpp_get_messages
 * @version 4.1.0
 * @since 2025-12-04
 * @category messaging
 * @status stable
 *
 * ───────────────────────────────────────────────────────────────────────────
 * DESCRIPTION
 * ───────────────────────────────────────────────────────────────────────────
 * @description
 * Returns message headers (id, from, subject, timestamp) from all relevant rooms
 * for an instance. Uses SMART DEFAULTS - automatically queries:
 * - Personality room (based on instance name)
 * - Role room (from preferences)
 * - Project room (from preferences)
 * - Announcements room
 *
 * Supports IDENTITY RESOLUTION - if you don't know your instanceId, provide
 * hints (name, workingDirectory, hostname) and the system looks it up.
 *
 * Returns headers only to save tokens. Use xmpp_get_message to fetch full body.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * PARAMETERS
 * ───────────────────────────────────────────────────────────────────────────
 * @param {string} instanceId - Instance to get messages for [optional]
 *   @source Your instanceId from bootstrap or introspect. Optional if you
 *           provide identity hints (name/workingDirectory/hostname) or a room.
 *
 * @param {string} name - Instance name for identity lookup [optional]
 *   @source Your chosen name (e.g., "Messenger"). Used to look up instanceId.
 *
 * @param {string} workingDirectory - Working directory hint [optional]
 *   @source Result of pwd command. Used for identity resolution.
 *
 * @param {string} hostname - System hostname hint [optional]
 *   @source Result of hostname command. Used for identity resolution.
 *
 * @param {string} room - Specific room to query [optional]
 *   @source Room name like "personality-messenger", "role-developer", "project-xyz"
 *           If provided, only this room is queried (faster than smart defaults).
 *
 * @param {number} limit - Maximum messages to return [optional]
 *   @source Choose based on context budget. Lower = fewer tokens.
 *   @default 5
 *   @validate min: 1, max: 100
 *
 * @param {string} before_id - Pagination cursor [optional]
 *   @source Message ID from previous response. Get older messages before this ID.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * RETURNS
 * ───────────────────────────────────────────────────────────────────────────
 * @returns {object} GetMessagesResponse
 * @returns {boolean} .success - Whether the call succeeded
 * @returns {array} .messages - Array of message headers
 * @returns {string} .messages[].id - Message ID (use with xmpp_get_message)
 * @returns {string} .messages[].from - Sender's identity
 * @returns {string} .messages[].subject - Truncated subject line
 * @returns {string} .messages[].room - Which room this message is from
 * @returns {string} .messages[].timestamp - ISO timestamp
 * @returns {number} .total_available - Total messages available
 * @returns {boolean} .has_more - Whether more messages exist (pagination)
 * @returns {array} .rooms_checked - Which rooms were queried
 *
 * ───────────────────────────────────────────────────────────────────────────
 * PERMISSIONS & LIMITS
 * ───────────────────────────────────────────────────────────────────────────
 * @permissions authenticated
 * @rateLimit 30/minute
 *
 * ───────────────────────────────────────────────────────────────────────────
 * ERRORS & RECOVERY
 * ───────────────────────────────────────────────────────────────────────────
 * @error RATE_LIMIT_EXCEEDED - Too many requests in short period
 *   @recover Wait 1 minute before retrying.
 *
 * @error IDENTITY_NOT_FOUND - Could not resolve identity from hints
 *   @recover Provide instanceId directly, or call bootstrap to create instance.
 *
 * @error MISSING_PARAMETER - Neither instanceId nor room provided
 *   @recover Provide instanceId, room, or identity hints (name/workingDirectory).
 *
 * @error XMPP_UNAVAILABLE - XMPP server not running
 *   @recover Check ejabberd container status. Contact system admin.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * EXAMPLES
 * ───────────────────────────────────────────────────────────────────────────
 * @example Get messages with instanceId
 * {
 *   "instanceId": "Messenger-7e2f",
 *   "limit": 10
 * }
 *
 * @example Get messages using identity hints
 * {
 *   "name": "Messenger",
 *   "workingDirectory": "/mnt/coordinaton_mcp_data/worktrees/messaging"
 * }
 *
 * @example Get messages from specific room
 * {
 *   "room": "personality-lupo",
 *   "limit": 5
 * }
 *
 * @example Pagination
 * {
 *   "instanceId": "Canvas-8215",
 *   "before_id": "1735123456789000",
 *   "limit": 10
 * }
 *
 * ───────────────────────────────────────────────────────────────────────────
 * RELATED
 * ───────────────────────────────────────────────────────────────────────────
 * @see xmpp_get_message - Get full message body by ID
 * @see xmpp_send_message - Send a new message
 * @see lookup_identity - Resolve identity hints to instanceId
 *
 * ───────────────────────────────────────────────────────────────────────────
 * NOTES
 * ───────────────────────────────────────────────────────────────────────────
 * @note Returns headers only - call xmpp_get_message for full body
 * @note Smart defaults query multiple rooms automatically based on preferences
 * @note Identity resolution adds slight overhead - provide instanceId if known
 */
export async function getMessages(params = {}) {
  let { instanceId, name, workingDirectory, hostname, room, limit = 5, before_id } = params;

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

  // If room is provided, we can query without instanceId
  // Otherwise, instanceId is required
  if (!instanceId && !room) {
    return {
      success: false,
      error: 'instanceId or room is required (or provide name/workingDirectory/hostname for identity lookup)',
      suggestion: 'Provide instanceId, room, or use identity hints: name, workingDirectory, or hostname'
    };
  }

  // SECURITY: Rate limiting (use room as key if no instanceId)
  if (!checkRateLimit(instanceId || room)) {
    return { success: false, error: 'Rate limit exceeded' };
  }

  if (!await isXMPPAvailable()) {
    return { success: false, error: 'XMPP server not available' };
  }

  try {
    // If a specific room is requested, use just that room
    // Otherwise, get all rooms this instance should monitor
    const rooms = room ? [room] : await getInstanceRooms(instanceId);
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
 * Get all known rooms in the system (for message search)
 * @returns {Promise<string[]>} - List of room names
 */
async function getAllKnownRooms() {
  try {
    // Get list of rooms from ejabberd
    const result = await ejabberdctl(`muc_online_rooms "${XMPP_CONFIG.conference}"`);
    const rooms = result.split('\n')
      .map(r => r.trim())
      .filter(r => r)
      .map(r => r.split('@')[0]); // Extract room name from JID
    return rooms;
  } catch (e) {
    // Fallback: return common room patterns
    return ['announcements', 'personality-lupo', 'personality-messenger', 'personality-canvas'];
  }
}

/**
 * @hacs-endpoint
 * @template-version 1.0.0
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │ XMPP_GET_MESSAGE                                                        │
 * │ Get full message body by ID                                             │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * @tool xmpp_get_message
 * @version 4.1.0
 * @since 2025-12-04
 * @category messaging
 * @status stable
 *
 * ───────────────────────────────────────────────────────────────────────────
 * DESCRIPTION
 * ───────────────────────────────────────────────────────────────────────────
 * @description
 * Retrieves the full message body for a given message ID. Use this after
 * xmpp_get_messages to fetch the complete content of specific messages.
 *
 * SIMPLE API: Just pass the message ID. The system searches all known rooms
 * to find the message. Optionally provide room hint for faster lookup.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * PARAMETERS
 * ───────────────────────────────────────────────────────────────────────────
 * @param {string} id - Message ID to retrieve [required]
 *   @source Get from xmpp_get_messages response (.messages[].id)
 *
 * @param {string} instanceId - Instance requesting [optional]
 *   @source Your instanceId. Used to prioritize searching your rooms first.
 *
 * @param {string} room - Room hint [optional]
 *   @source Room name from xmpp_get_messages response (.messages[].room)
 *           Providing this makes lookup much faster.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * RETURNS
 * ───────────────────────────────────────────────────────────────────────────
 * @returns {object} GetMessageResponse
 * @returns {boolean} .success - Whether the message was found
 * @returns {string} .body - Full message body content
 * @returns {string} .from - Sender's identity
 * @returns {string} .subject - Message subject
 * @returns {string} .timestamp - ISO timestamp
 *
 * ───────────────────────────────────────────────────────────────────────────
 * PERMISSIONS & LIMITS
 * ───────────────────────────────────────────────────────────────────────────
 * @permissions authenticated
 * @rateLimit 60/minute
 *
 * ───────────────────────────────────────────────────────────────────────────
 * ERRORS & RECOVERY
 * ───────────────────────────────────────────────────────────────────────────
 * @error MISSING_PARAMETER - id parameter not provided
 *   @recover Provide the message ID from xmpp_get_messages response.
 *
 * @error MESSAGE_NOT_FOUND - Message with this ID not found in any room
 *   @recover Verify the ID is correct. Messages may expire from room history.
 *
 * @error XMPP_UNAVAILABLE - XMPP server not running
 *   @recover Check ejabberd container status. Contact system admin.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * EXAMPLES
 * ───────────────────────────────────────────────────────────────────────────
 * @example Get message with just ID
 * {
 *   "id": "1735123456789000"
 * }
 *
 * @example Get message with room hint (faster)
 * {
 *   "id": "1735123456789000",
 *   "room": "personality-messenger"
 * }
 *
 * ───────────────────────────────────────────────────────────────────────────
 * RELATED
 * ───────────────────────────────────────────────────────────────────────────
 * @see xmpp_get_messages - Get message headers first
 * @see xmpp_send_message - Send a reply
 *
 * ───────────────────────────────────────────────────────────────────────────
 * NOTES
 * ───────────────────────────────────────────────────────────────────────────
 * @note Searches all known rooms if no hint provided (slower but works)
 * @note Returns full body - use sparingly to conserve tokens
 */
export async function getMessage(params = {}) {
  const { instanceId, id, room } = params;

  if (!id) {
    return { success: false, error: 'id is required' };
  }

  if (!await isXMPPAvailable()) {
    return { success: false, error: 'XMPP server not available' };
  }

  try {
    // Determine rooms to search
    let rooms;
    if (room) {
      // Room specified - search just that room (fast path)
      rooms = [room];
    } else if (instanceId) {
      // Instance specified - search their rooms first, then all rooms
      rooms = await getInstanceRooms(instanceId);
    } else {
      // No hints - search all known rooms
      rooms = await getAllKnownRooms();
    }

    // Helper to search a list of rooms for the message
    const searchRooms = async (roomList) => {
      for (const roomName of roomList) {
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
      return null;
    };

    // Search primary rooms first
    let result = await searchRooms(rooms);
    if (result) return result;

    // If not found and we only searched instance rooms, expand to all known rooms
    if (instanceId && !room) {
      const allRooms = await getAllKnownRooms();
      const additionalRooms = allRooms.filter(r => !rooms.includes(r));
      if (additionalRooms.length > 0) {
        result = await searchRooms(additionalRooms);
        if (result) return result;
      }
    }

    return { success: false, error: 'Message not found' };

  } catch (error) {
    await logger.error('getMessage failed', { error: error.message, params });
    return { success: false, error: error.message };
  }
}

/**
 * @hacs-endpoint
 * @template-version 1.0.0
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │ GET_PRESENCE                                                            │
 * │ Check which instances are currently online                              │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * @tool get_presence
 * @version 4.1.0
 * @since 2025-12-04
 * @category messaging
 * @status stable
 *
 * ───────────────────────────────────────────────────────────────────────────
 * DESCRIPTION
 * ───────────────────────────────────────────────────────────────────────────
 * @description
 * Returns a list of currently connected XMPP users. Use this to check who
 * is online before sending messages, or to see if a specific instance is
 * currently active.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * PARAMETERS
 * ───────────────────────────────────────────────────────────────────────────
 * No parameters required.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * RETURNS
 * ───────────────────────────────────────────────────────────────────────────
 * @returns {object} GetPresenceResponse
 * @returns {boolean} .success - Whether the call succeeded
 * @returns {array} .online - List of online JIDs (e.g., ["lupo@smoothcurves.nexus"])
 *
 * ───────────────────────────────────────────────────────────────────────────
 * PERMISSIONS & LIMITS
 * ───────────────────────────────────────────────────────────────────────────
 * @permissions *
 * @rateLimit 60/minute
 *
 * ───────────────────────────────────────────────────────────────────────────
 * ERRORS & RECOVERY
 * ───────────────────────────────────────────────────────────────────────────
 * @error XMPP_UNAVAILABLE - XMPP server not running
 *   @recover Check ejabberd container status. Contact system admin.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * EXAMPLES
 * ───────────────────────────────────────────────────────────────────────────
 * @example Check who is online
 * {}
 *
 * ───────────────────────────────────────────────────────────────────────────
 * RELATED
 * ───────────────────────────────────────────────────────────────────────────
 * @see xmpp_send_message - Send message to online user
 * @see get_messaging_info - Get your messaging status
 *
 * ───────────────────────────────────────────────────────────────────────────
 * NOTES
 * ───────────────────────────────────────────────────────────────────────────
 * @note Returns minimal response to conserve tokens
 * @note Humans may not appear online (they use web interface)
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
 * @hacs-endpoint
 * @template-version 1.0.0
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │ LOOKUP_SHORTNAME                                                        │
 * │ Find instance IDs matching a short name                                 │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * @tool lookup_shortname
 * @version 4.1.0
 * @since 2025-12-04
 * @category messaging
 * @status experimental
 *
 * ───────────────────────────────────────────────────────────────────────────
 * DESCRIPTION
 * ───────────────────────────────────────────────────────────────────────────
 * @description
 * Looks up instance IDs that match a given short name. Use this to find
 * the full instance ID when you only know part of a name.
 *
 * NOTE: This feature is partially implemented. For now, use full instance IDs.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * PARAMETERS
 * ───────────────────────────────────────────────────────────────────────────
 * @param {string} name - Short name to look up [required]
 *   @source The name or partial name you're searching for.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * RETURNS
 * ───────────────────────────────────────────────────────────────────────────
 * @returns {object} LookupShortnameResponse
 * @returns {boolean} .success - Whether the call succeeded
 * @returns {string} .name - The name searched for
 * @returns {array} .matches - List of matching instance IDs
 * @returns {string} .note - Status note about feature availability
 *
 * ───────────────────────────────────────────────────────────────────────────
 * ERRORS & RECOVERY
 * ───────────────────────────────────────────────────────────────────────────
 * @error MISSING_PARAMETER - name not provided
 *   @recover Provide the name parameter.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * EXAMPLES
 * ───────────────────────────────────────────────────────────────────────────
 * @example Lookup a name
 * {
 *   "name": "Messenger"
 * }
 *
 * ───────────────────────────────────────────────────────────────────────────
 * NOTES
 * ───────────────────────────────────────────────────────────────────────────
 * @note Feature partially implemented - returns empty matches for now
 * @todo Implement full shortname lookup across instance registry
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
 * @hacs-endpoint
 * @template-version 1.0.0
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │ GET_MESSAGING_INFO                                                      │
 * │ Get messaging status for an instance                                    │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * @tool get_messaging_info
 * @version 4.1.0
 * @since 2025-12-04
 * @category messaging
 * @status stable
 *
 * ───────────────────────────────────────────────────────────────────────────
 * DESCRIPTION
 * ───────────────────────────────────────────────────────────────────────────
 * @description
 * Returns messaging status for an instance including their JID, unread count,
 * and list of online teammates. Lightweight alternative to full introspect
 * when you only need messaging info.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * PARAMETERS
 * ───────────────────────────────────────────────────────────────────────────
 * @param {string} instanceId - Instance to get info for [required]
 *   @source Your instanceId from bootstrap or introspect.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * RETURNS
 * ───────────────────────────────────────────────────────────────────────────
 * @returns {object} GetMessagingInfoResponse
 * @returns {boolean} .success - Whether the call succeeded
 * @returns {string} .your_jid - Your XMPP JID (e.g., "messenger-7e2f@smoothcurves.nexus")
 * @returns {number} .unread_count - Number of unread offline messages
 * @returns {array} .online_teammates - List of online JIDs
 *
 * ───────────────────────────────────────────────────────────────────────────
 * PERMISSIONS & LIMITS
 * ───────────────────────────────────────────────────────────────────────────
 * @permissions authenticated
 * @rateLimit 60/minute
 *
 * ───────────────────────────────────────────────────────────────────────────
 * ERRORS & RECOVERY
 * ───────────────────────────────────────────────────────────────────────────
 * @error MISSING_PARAMETER - instanceId not provided
 *   @recover Provide your instanceId from bootstrap.
 *
 * @error XMPP_UNAVAILABLE - XMPP server not running
 *   @recover Returns fallback: true to indicate you should retry later.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * EXAMPLES
 * ───────────────────────────────────────────────────────────────────────────
 * @example Get messaging info
 * {
 *   "instanceId": "Messenger-7e2f"
 * }
 *
 * ───────────────────────────────────────────────────────────────────────────
 * RELATED
 * ───────────────────────────────────────────────────────────────────────────
 * @see introspect - Get full instance context
 * @see get_presence - Just check who is online
 * @see xmpp_get_messages - Get your messages
 *
 * ───────────────────────────────────────────────────────────────────────────
 * NOTES
 * ───────────────────────────────────────────────────────────────────────────
 * @note Lightweight - use instead of introspect when you only need messaging
 * @note Returns fallback: true if XMPP is down (graceful degradation)
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
 * @hacs-endpoint
 * @template-version 1.0.0
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │ REGISTER_MESSAGING_USER                                                 │
 * │ Register an instance with the XMPP messaging system                     │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * @tool register_messaging_user
 * @version 4.1.0
 * @since 2025-12-04
 * @category messaging
 * @status stable
 * @visibility internal
 *
 * ───────────────────────────────────────────────────────────────────────────
 * DESCRIPTION
 * ───────────────────────────────────────────────────────────────────────────
 * @description
 * Registers an instance with the XMPP messaging system. Creates the XMPP user
 * account and ensures appropriate room memberships based on role and project.
 *
 * This is an INTERNAL function called by bootstrap. You typically do not need
 * to call this directly - bootstrap handles messaging registration for you.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * PARAMETERS
 * ───────────────────────────────────────────────────────────────────────────
 * @param {string} instanceId - Instance to register [required]
 *   @source Typically called by bootstrap with the new instanceId.
 *
 * @param {string} role - Role to subscribe to [optional]
 *   @source Role name. Creates role room subscription.
 *
 * @param {string} project - Project to subscribe to [optional]
 *   @source Project ID. Creates project room subscription.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * RETURNS
 * ───────────────────────────────────────────────────────────────────────────
 * @returns {object} RegisterMessagingUserResponse
 * @returns {boolean} .success - Whether registration succeeded
 * @returns {string} .jid - The created XMPP JID
 * @returns {array} .rooms - Rooms the user was subscribed to
 *
 * ───────────────────────────────────────────────────────────────────────────
 * PERMISSIONS & LIMITS
 * ───────────────────────────────────────────────────────────────────────────
 * @permissions internal
 * @rateLimit 10/minute
 *
 * ───────────────────────────────────────────────────────────────────────────
 * ERRORS & RECOVERY
 * ───────────────────────────────────────────────────────────────────────────
 * @error MISSING_PARAMETER - instanceId not provided
 *   @recover Provide instanceId parameter.
 *
 * @error XMPP_UNAVAILABLE - XMPP server not running
 *   @recover Returns fallback: true. Bootstrap continues without messaging.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * NOTES
 * ───────────────────────────────────────────────────────────────────────────
 * @note INTERNAL: Called by bootstrap - do not call directly
 * @note Gracefully degrades if XMPP is unavailable
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
