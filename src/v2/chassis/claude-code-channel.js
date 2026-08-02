/**
 * Claude Code Channel Adapter — delivers thin notifications to a persistent
 * Claude Code instance via its channel.mjs sidecar.
 *
 * The sidecar (standalone/hacs-channel/src/channel.mjs) exposes ONE hardened
 * endpoint, `POST /broker-event`, on a loopback port. That port is published
 * in `<DATA_ROOT>/instances/<id>/.hacs-identity` as `channelPort`.
 * Contract: EVENT-HUB-CONTRACT.md §4.
 *
 * IMPORTANT: channelPort is re-read from .hacs-identity on EVERY notify() call —
 * no caching. This is deliberate (test hook + instances restart on new ports).
 */

import fs from 'fs/promises';
import path from 'path';
import { getInstanceDir } from '../config.js';
import { logger } from '../../logger.js';

const NOTIFY_TIMEOUT_MS = 5000;

/**
 * Read channelPort from the instance's .hacs-identity file.
 * Returns a positive integer port, or null (missing file, corrupt JSON,
 * absent/invalid field). Never throws.
 */
async function readChannelPort(instanceId) {
  const identityPath = path.join(getInstanceDir(instanceId), '.hacs-identity');
  try {
    const identity = JSON.parse(await fs.readFile(identityPath, 'utf8'));
    const port = Number(identity?.channelPort);
    if (Number.isInteger(port) && port > 0 && port < 65536) return port;
    return null;
  } catch {
    return null;
  }
}

/**
 * The adapter object. Shape per contract §4:
 *   { name, detect(instanceId, identity, prefs), notify(instanceId, notification) }
 */
export const claudeCodeChannelAdapter = {
  name: 'claude-code-channel',

  /**
   * Does this instance run on the claude-code-channel chassis?
   * Primary signal: identity.chassis. Fallback: preferences runtime.type.
   * Sync + pure — the registry supplies identity/prefs it already read.
   */
  detect(instanceId, identity, prefs) {
    if (identity?.chassis === 'claude-code-channel') return true;
    if (prefs?.runtime?.type === 'claude-code-channel') return true;
    return false;
  },

  /**
   * Deliver a thin notification to the instance's channel sidecar.
   *
   * POSTs {event_type: 'notification', notification} to
   * http://127.0.0.1:<channelPort>/broker-event with a 5s timeout.
   *
   * @param {string} instanceId - Target instance
   * @param {object} notification - Thin payload ONLY: {channel, from, count, ts, thread_id?}
   * @returns {Promise<{ok: true} | {ok: false, error: string}>} — never throws;
   *   the hub uses the result to mark the slot active vs pending-retry.
   */
  async notify(instanceId, notification) {
    // Re-read on every call — no caching (see header note)
    const port = await readChannelPort(instanceId);
    if (port === null) {
      const error = `no channelPort in .hacs-identity for ${instanceId}`;
      logger.warn(`[claude-code-channel] ${error}`);
      return { ok: false, error };
    }

    const url = `http://127.0.0.1:${port}/broker-event`;
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event_type: 'notification', notification }),
        signal: AbortSignal.timeout(NOTIFY_TIMEOUT_MS)
      });

      if (!response.ok) {
        const error = `channel.mjs at ${url} returned ${response.status}`;
        logger.warn(`[claude-code-channel] notify failed for ${instanceId}: ${error}`);
        return { ok: false, error };
      }

      logger.debug(`[claude-code-channel] notified ${instanceId} on port ${port}`, {
        channel: notification?.channel,
        from: notification?.from,
        count: notification?.count
      });
      return { ok: true };
    } catch (err) {
      // fetch failure: connection refused, timeout (AbortError), DNS, etc.
      const error = err.message || String(err);
      logger.warn(`[claude-code-channel] notify failed for ${instanceId}: ${error}`);
      return { ok: false, error };
    }
  }
};
