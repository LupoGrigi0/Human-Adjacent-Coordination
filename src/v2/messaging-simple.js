/**
 * MCP Coordination System - Simple Messaging API
 * Convenience layer over XMPP messaging for everyday instance use
 *
 * Power users: use xmpp_send_message, xmpp_get_messages, xmpp_get_message
 * Everyone else: use these simpler APIs
 *
 * Design principles:
 * - Minimal parameters in, minimal tokens out
 * - Every field in the response must earn its place
 * - Read tracking so instances never see the same message twice
 * - Fuzzy matching so typos don't lose messages
 *
 * @author Messenger (Messenger-aa2a)
 * @date 2026-02-28
 */

import path from 'path';
import { logger } from '../logger.js';
import { readPreferences, readJSON, writeJSON, listDir } from './data.js';
import { getInstancesDir, getInstanceDir } from './config.js';
import {
  XMPP_CONFIG,
  sanitizeIdentifier,
  ejabberdctl,
  isXMPPAvailable,
  ensureRoom,
  parseMessageXML,
  truncateSubject,
  extractPersonalityFromInstanceId,
  getInstanceRooms,
  checkRateLimit,
  sendMessage as sendMessageXMPP,
  getMessage as getMessageXMPP,
} from './messaging.js';

// ─── Constants ──────────────────────────────────────────────────────────

const MAX_READ_IDS = 1000;

// ─── Read Tracking Helpers ──────────────────────────────────────────────

/**
 * Get the set of message IDs this instance has read
 * @param {string} instanceId
 * @returns {Promise<Set<string>>}
 */
async function getReadMessages(instanceId) {
  try {
    const readPath = path.join(getInstanceDir(instanceId), 'read_messages.json');
    const data = await readJSON(readPath);
    return new Set(data?.read || []);
  } catch {
    return new Set();
  }
}

/**
 * Mark message IDs as read for this instance
 * @param {string} instanceId
 * @param {string[]} messageIds
 */
async function markAsRead(instanceId, messageIds) {
  if (!messageIds || messageIds.length === 0) return;

  const readPath = path.join(getInstanceDir(instanceId), 'read_messages.json');
  let data;
  try {
    data = await readJSON(readPath);
  } catch {
    data = null;
  }

  const existing = data?.read || [];
  const readSet = new Set(existing);
  for (const id of messageIds) {
    readSet.add(id);
  }

  // Convert back to array, cap at MAX_READ_IDS (trim oldest = front of array)
  let readArray = [...readSet];
  if (readArray.length > MAX_READ_IDS) {
    readArray = readArray.slice(readArray.length - MAX_READ_IDS);
  }

  await writeJSON(readPath, {
    read: readArray,
    updatedAt: new Date().toISOString(),
  });
}

// ─── Room History Helper ────────────────────────────────────────────────

/**
 * Parse ejabberd room history output into message objects
 * @param {string} historyOutput - Raw output from get_room_history
 * @returns {Array<{id, from, subject, body, timestamp}>}
 */
function parseRoomHistory(historyOutput) {
  if (!historyOutput || !historyOutput.trim()) return [];

  const rawMessages = historyOutput.split(/(?=^\d{4}-\d{2}-\d{2}T[^\t]*\t<message)/m);
  const messages = [];

  for (const rawMsg of rawMessages) {
    if (!rawMsg.trim()) continue;
    const parsed = parseMessageXML(rawMsg);
    if (parsed) {
      messages.push(parsed);
    }
  }

  return messages;
}

// ─── Fuzzy Instance Matching ────────────────────────────────────────────

/**
 * Find an instance by exact or fuzzy match
 * @param {string} to - The recipient string to match
 * @returns {Promise<{match: string|null, candidates: string[]}>}
 */
async function fuzzyMatchInstance(to) {
  let dirs;
  try {
    dirs = await listDir(getInstancesDir());
  } catch {
    return { match: null, candidates: [] };
  }

  const toLower = to.toLowerCase();

  // Exact match first (case-insensitive)
  const exactMatch = dirs.find(d => d.toLowerCase() === toLower);
  if (exactMatch) return { match: exactMatch, candidates: [] };

  // Score all instances
  const scored = dirs.map(dir => {
    const dirLower = dir.toLowerCase();
    // Extract the name part (everything before the last dash-hex suffix)
    const lastDash = dir.lastIndexOf('-');
    const namePart = lastDash > 0 ? dir.substring(0, lastDash).toLowerCase() : dirLower;

    let score = 0;
    if (dirLower.startsWith(toLower)) score = Math.max(score, 80);
    if (namePart === toLower) score = Math.max(score, 70);
    if (dirLower.includes(toLower)) score = Math.max(score, 50);
    if (namePart.startsWith(toLower)) score = Math.max(score, 40);

    return { instanceId: dir, score };
  })
    .filter(s => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);

  // Single high-confidence match
  if (scored.length === 1 && scored[0].score >= 70) {
    return { match: scored[0].instanceId, candidates: [] };
  }

  return { match: null, candidates: scored.map(s => s.instanceId) };
}

// ─── Public API Functions ───────────────────────────────────────────────

/**
 * @hacs-endpoint
 * @tool send_message
 * @version 1.0.0
 * @category messaging
 * @status stable
 * @description
 * Send a message directly to another instance. Simple API - just provide
 * sender, recipient, and subject. If the recipient can't be found exactly,
 * returns close matches so you can try again.
 *
 * This is for direct instance-to-instance messaging only. For role, project,
 * or broadcast messaging, use xmpp_send_message instead.
 *
 * @param {string} from - Your instanceId [required]
 * @param {string} to - Recipient instanceId [required]
 * @param {string} subject - Message subject [required]
 * @param {string} body - Message body [optional]
 * @returns {boolean} .success - Whether the message was delivered
 * @returns {string} .delivered_to - The resolved recipient instanceId
 * @error MISSING_PARAMETER - from, to, or subject not provided
 * @error SENDER_NOT_FOUND - Your instanceId doesn't exist
 * @error RECIPIENT_NOT_FOUND - Recipient not found, close_matches provided
 */
export async function sendMessageSimple(params) {
  const { from, to, subject, body } = params;

  if (!from || !to || !subject) {
    return {
      success: false,
      error: 'from, to, and subject are required',
    };
  }

  // Rate limit checked downstream by sendMessage in messaging.js — no duplicate check here

  if (!await isXMPPAvailable()) {
    return { success: false, error: 'Messaging system unavailable' };
  }

  // Validate sender exists
  let senderPrefs;
  try {
    senderPrefs = await readPreferences(from);
  } catch {
    senderPrefs = null;
  }
  if (!senderPrefs) {
    return { success: false, error: `Sender '${from}' not found. Have you bootstrapped?` };
  }

  // Fuzzy match recipient
  const match = await fuzzyMatchInstance(to);
  if (!match.match) {
    const result = {
      success: false,
      error: `Recipient '${to}' not found`,
    };
    if (match.candidates.length > 0) {
      result.close_matches = match.candidates;
    }
    result.suggestion = 'Use get_all_instances to see all available recipients';
    return result;
  }

  // Send via XMPP backend
  try {
    const result = await sendMessageXMPP({
      from,
      to: match.match,
      subject,
      body: body || undefined,
    });

    if (result.success) {
      return { success: true, delivered_to: match.match };
    }
    return { success: false, error: result.error || 'Send failed' };
  } catch (error) {
    await logger.error('sendMessageSimple failed', { error: error.message });
    return { success: false, error: error.message };
  }
}

/**
 * @hacs-endpoint
 * @tool list_my_messages
 * @version 1.0.0
 * @category messaging
 * @status stable
 * @description
 * List your unread messages. Returns just the essentials: message ID, sender,
 * subject, and date. Use get_message(id) to read the full message body.
 *
 * Messages you've already read are filtered out automatically.
 *
 * @param {string} instanceId - Your instanceId [required]
 * @param {number} limit - Max messages to return, default 5 [optional]
 * @returns {boolean} .success
 * @returns {array} .messages - Array of {id, from, subject, date}
 * @returns {boolean} .more_unread - True if you have more unread messages
 * @returns {string} .hint - Reminder to use get_message(id)
 */
export async function listMyMessages(params) {
  const { instanceId, limit = 5 } = params;

  if (!instanceId) {
    return { success: false, error: 'instanceId is required' };
  }

  if (!checkRateLimit(instanceId)) {
    return { success: false, error: 'Rate limit exceeded. Wait a moment.' };
  }

  if (!await isXMPPAvailable()) {
    return { success: false, error: 'Messaging system unavailable' };
  }

  try {
    const personality = extractPersonalityFromInstanceId(instanceId);
    if (!personality) {
      return { success: false, error: 'Could not determine personality from instanceId' };
    }

    const roomName = `personality-${personality}`;

    // Fetch room history
    let history;
    try {
      history = await ejabberdctl(
        `get_room_history "${sanitizeIdentifier(roomName)}" "${XMPP_CONFIG.conference}"`
      );
    } catch {
      history = '';
    }

    const allMessages = parseRoomHistory(history);
    const readSet = await getReadMessages(instanceId);

    // Filter to unread
    const unread = allMessages.filter(m => !readSet.has(m.id));

    // Sort newest first
    unread.sort((a, b) => (b.timestamp || '').localeCompare(a.timestamp || ''));

    // Auto-mark body-less messages as read (subject-only = notification, reading header IS reading it)
    const bodylessIds = unread
      .filter(m => !m.body || m.body.trim() === '')
      .map(m => m.id);
    if (bodylessIds.length > 0) {
      await markAsRead(instanceId, bodylessIds);
    }

    // Filter out the ones we just marked as read (body-less)
    const bodylessSet = new Set(bodylessIds);
    const displayMessages = unread.filter(m => !bodylessSet.has(m.id) || (m.body && m.body.trim() !== ''));

    const cappedLimit = Math.min(Math.max(1, limit), 50);
    const slice = displayMessages.slice(0, cappedLimit);

    const messages = slice.map(m => ({
      id: m.id,
      from: m.from,
      subject: truncateSubject(m.subject || m.body, 60),
      date: m.timestamp,
    }));

    const result = { success: true, messages };

    if (displayMessages.length > cappedLimit) {
      result.more_unread = true;
      result.total_unread = displayMessages.length;
    }

    result.hint = 'use get_message(id) to read full message';

    return result;
  } catch (error) {
    await logger.error('listMyMessages failed', { error: error.message });
    return { success: false, error: error.message };
  }
}

/**
 * @hacs-endpoint
 * @tool get_message
 * @version 1.0.0
 * @category messaging
 * @status stable
 * @description
 * Read a single message by ID. Returns subject, body, sender, and date.
 * Automatically marks the message as read so it won't appear in
 * list_my_messages again.
 *
 * @param {string} id - Message ID from list_my_messages [required]
 * @param {string} instanceId - Your instanceId [required]
 * @returns {boolean} .success
 * @returns {string} .subject - Message subject
 * @returns {string} .body - Full message body
 * @returns {string} .from - Sender
 * @returns {string} .date - When it was sent
 */
export async function getMessageSimple(params) {
  const { id, instanceId } = params;

  if (!id || !instanceId) {
    return { success: false, error: 'id and instanceId are required' };
  }

  if (!checkRateLimit(instanceId)) {
    return { success: false, error: 'Rate limit exceeded. Wait a moment.' };
  }

  try {
    // Use the existing XMPP getMessage for the search
    const result = await getMessageXMPP({ id, instanceId });

    if (!result.success) {
      return { success: false, error: result.error || 'Message not found' };
    }

    // Mark as read
    await markAsRead(instanceId, [id]);

    return {
      success: true,
      subject: result.subject,
      body: result.body,
      from: result.from,
      date: result.timestamp,
    };
  } catch (error) {
    await logger.error('getMessageSimple failed', { error: error.message });
    return { success: false, error: error.message };
  }
}

/**
 * @hacs-endpoint
 * @tool do_i_have_new_messages
 * @version 1.0.0
 * @category messaging
 * @status stable
 * @description
 * Quick check: do you have unread messages? Returns false if no, or true
 * with the first 5 unread message IDs if yes. Use get_message(id) to read them.
 *
 * @param {string} instanceId - Your instanceId [required]
 * @returns {boolean} .success
 * @returns {boolean} .new_messages - Whether you have unread messages
 * @returns {array} .unread_ids - First 5 unread message IDs (only if new_messages is true)
 */
export async function doIHaveNewMessages(params) {
  const { instanceId } = params;

  if (!instanceId) {
    return { success: false, error: 'instanceId is required' };
  }

  if (!checkRateLimit(instanceId)) {
    return { success: false, error: 'Rate limit exceeded. Wait a moment.' };
  }

  if (!await isXMPPAvailable()) {
    return { success: false, error: 'Messaging system unavailable' };
  }

  try {
    const personality = extractPersonalityFromInstanceId(instanceId);
    if (!personality) {
      return { success: false, error: 'Could not determine personality from instanceId' };
    }

    const roomName = `personality-${personality}`;

    let history;
    try {
      history = await ejabberdctl(
        `get_room_history "${sanitizeIdentifier(roomName)}" "${XMPP_CONFIG.conference}"`
      );
    } catch {
      history = '';
    }

    const allMessages = parseRoomHistory(history);
    const readSet = await getReadMessages(instanceId);
    const unread = allMessages.filter(m => !readSet.has(m.id));

    if (unread.length === 0) {
      return { success: true, new_messages: false };
    }

    // Sort newest first, return just IDs
    unread.sort((a, b) => (b.timestamp || '').localeCompare(a.timestamp || ''));

    return {
      success: true,
      new_messages: true,
      unread_ids: unread.slice(0, 5).map(m => m.id),
    };
  } catch (error) {
    await logger.error('doIHaveNewMessages failed', { error: error.message });
    return { success: false, error: error.message };
  }
}

/**
 * @hacs-endpoint
 * @tool list_project_messages
 * @version 1.0.0
 * @category messaging
 * @status stable
 * @description
 * List unread messages from your project's team room. Works like
 * list_my_messages but for project communication. Each team member
 * has independent read tracking.
 *
 * @param {string} instanceId - Your instanceId [required]
 * @param {number} limit - Max messages to return, default 5 [optional]
 * @returns {boolean} .success
 * @returns {string} .project - Your project name
 * @returns {array} .messages - Array of {id, from, subject, date}
 * @returns {boolean} .more_unread - True if more unread exist
 * @returns {string} .hint - Reminder to use get_message(id)
 */
export async function listProjectMessages(params) {
  const { instanceId, limit = 5 } = params;

  if (!instanceId) {
    return { success: false, error: 'instanceId is required' };
  }

  if (!checkRateLimit(instanceId)) {
    return { success: false, error: 'Rate limit exceeded. Wait a moment.' };
  }

  if (!await isXMPPAvailable()) {
    return { success: false, error: 'Messaging system unavailable' };
  }

  try {
    // Look up project from preferences
    let prefs;
    try {
      prefs = await readPreferences(instanceId);
    } catch {
      prefs = null;
    }

    if (!prefs || !prefs.project) {
      return {
        success: false,
        error: 'No project assigned',
        suggestion: 'Use join_project to join a project first',
      };
    }

    const roomName = `project-${prefs.project.toLowerCase()}`;

    let history;
    try {
      history = await ejabberdctl(
        `get_room_history "${sanitizeIdentifier(roomName)}" "${XMPP_CONFIG.conference}"`
      );
    } catch {
      history = '';
    }

    const allMessages = parseRoomHistory(history);
    const readSet = await getReadMessages(instanceId);
    const unread = allMessages.filter(m => !readSet.has(m.id));

    unread.sort((a, b) => (b.timestamp || '').localeCompare(a.timestamp || ''));

    // Auto-mark body-less messages as read
    const bodylessIds = unread
      .filter(m => !m.body || m.body.trim() === '')
      .map(m => m.id);
    if (bodylessIds.length > 0) {
      await markAsRead(instanceId, bodylessIds);
    }

    const bodylessSet = new Set(bodylessIds);
    const displayMessages = unread.filter(m => !bodylessSet.has(m.id) || (m.body && m.body.trim() !== ''));

    const cappedLimit = Math.min(Math.max(1, limit), 50);
    const slice = displayMessages.slice(0, cappedLimit);

    const messages = slice.map(m => ({
      id: m.id,
      from: m.from,
      subject: truncateSubject(m.subject || m.body, 60),
      date: m.timestamp,
    }));

    const result = { success: true, project: prefs.project, messages };

    if (displayMessages.length > cappedLimit) {
      result.more_unread = true;
      result.total_unread = displayMessages.length;
    }

    result.hint = 'use get_message(id) to read full message';

    return result;
  } catch (error) {
    await logger.error('listProjectMessages failed', { error: error.message });
    return { success: false, error: error.message };
  }
}

// ─── Testing Utilities ──────────────────────────────────────────────────

/**
 * @hacs-endpoint
 * @tool purge_room_messages
 * @version 1.0.0
 * @category messaging-admin
 * @status stable
 * @description
 * Destroy and recreate an XMPP room, clearing all message history.
 * For testing and maintenance only.
 *
 * @param {string} room - Room name to purge [required]
 * @returns {boolean} .success
 */
export async function purgeRoomMessages(params) {
  const { room, instanceId } = params;

  if (!room) {
    return { success: false, error: 'room is required' };
  }

  // Privileged role required — destructive operation
  if (!instanceId) {
    return { success: false, error: 'instanceId is required (privileged role check)' };
  }
  const { canInstanceCallAPI } = await import('./permissions.js');
  if (!await canInstanceCallAPI(instanceId, 'purgeRoomMessages')) {
    return { success: false, error: 'Permission denied. Requires Executive, EA, or COO role.' };
  }

  if (!await isXMPPAvailable()) {
    return { success: false, error: 'Messaging system unavailable' };
  }

  try {
    const sanitizedRoom = sanitizeIdentifier(room);

    // Destroy room (clears all history)
    try {
      await ejabberdctl(
        `destroy_room "${sanitizedRoom}" "${XMPP_CONFIG.conference}" "Purge"`
      );
    } catch {
      // Room might not exist, that's fine
    }

    // Recreate room
    await ensureRoom(sanitizedRoom);

    return { success: true, message: `Room ${sanitizedRoom} purged and recreated` };
  } catch (error) {
    await logger.error('purgeRoomMessages failed', { error: error.message });
    return { success: false, error: error.message };
  }
}

/**
 * @hacs-endpoint
 * @tool reset_read_tracking
 * @version 1.0.0
 * @category messaging-admin
 * @status stable
 * @description
 * Clear all read tracking for an instance. After this, all messages
 * will appear as unread again. Instances can only reset their own
 * read tracking — privileged roles can reset anyone's.
 *
 * @param {string} instanceId - Instance to reset [required]
 * @param {string} callerInstanceId - Who is calling (defaults to instanceId)
 * @returns {boolean} .success
 */
export async function resetReadTracking(params) {
  const { instanceId, callerInstanceId } = params;

  if (!instanceId) {
    return { success: false, error: 'instanceId is required' };
  }

  // Self-only unless privileged role
  const caller = callerInstanceId || instanceId;
  if (caller !== instanceId) {
    const { canInstanceCallAPI } = await import('./permissions.js');
    if (!await canInstanceCallAPI(caller, 'purgeRoomMessages')) {
      return { success: false, error: 'Permission denied. You can only reset your own read tracking.' };
    }
  }

  try {
    const readPath = path.join(getInstanceDir(instanceId), 'read_messages.json');
    await writeJSON(readPath, { read: [], updatedAt: new Date().toISOString() });
    return { success: true };
  } catch (error) {
    await logger.error('resetReadTracking failed', { error: error.message });
    return { success: false, error: error.message };
  }
}
