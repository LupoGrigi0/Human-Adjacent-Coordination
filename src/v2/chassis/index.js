/**
 * Chassis Adapter Registry — resolves which chassis adapter delivers to an instance
 *
 * The Event Hub is chassis-agnostic: it hands a thin notification to an adapter,
 * and the adapter knows how to reach that instance's runtime (Claude Code channel,
 * Codex, whatever comes next). Contract: EVENT-HUB-CONTRACT.md §4.
 *
 * Detection order:
 *   1. `<DATA_ROOT>/instances/<id>/.hacs-identity` field `chassis` (primary signal)
 *   2. adapter.detect(instanceId, identity, prefs) — lets adapters use fallback
 *      signals (e.g. preferences.json runtime.type)
 *
 * Future adapters self-register: import this module and call registerAdapter().
 */

import fs from 'fs/promises';
import path from 'path';
import { getInstanceDir } from '../config.js';
import { readPreferences } from '../data.js';
import { logger } from '../../logger.js';
import { claudeCodeChannelAdapter } from './claude-code-channel.js';

// name → adapter. Exported so future adapters (Codex, etc.) can self-register.
export const registry = new Map();

export function registerAdapter(adapter) {
  registry.set(adapter.name, adapter);
}

registerAdapter(claudeCodeChannelAdapter);

/**
 * Read an instance's .hacs-identity file.
 * Missing or corrupt → null with a logged reason. NEVER throws — a bad identity
 * file must not take down hub dispatch (the JSON-parse-takes-down-everything scar).
 */
export async function readIdentity(instanceId) {
  const identityPath = path.join(getInstanceDir(instanceId), '.hacs-identity');
  try {
    return JSON.parse(await fs.readFile(identityPath, 'utf8'));
  } catch (err) {
    const reason = err.code === 'ENOENT' ? 'missing' : `unreadable/corrupt (${err.message})`;
    logger.debug(`[ChassisRegistry] .hacs-identity for ${instanceId}: ${reason}`);
    return null;
  }
}

/**
 * Resolve the chassis adapter for an instance, or null if none matches.
 * Never throws — resolution failure means "no adapter", not a crash.
 */
export async function getAdapter(instanceId) {
  const identity = await readIdentity(instanceId);

  // Primary signal: identity.chassis names the adapter directly
  if (identity?.chassis && registry.has(identity.chassis)) {
    return registry.get(identity.chassis);
  }

  // Fallback: ask each adapter to detect itself from identity + preferences
  let prefs = null;
  try {
    prefs = await readPreferences(instanceId);
  } catch (err) {
    logger.debug(`[ChassisRegistry] preferences for ${instanceId} unreadable: ${err.message}`);
  }

  for (const adapter of registry.values()) {
    try {
      if (adapter.detect(instanceId, identity, prefs)) return adapter;
    } catch (err) {
      logger.warn(`[ChassisRegistry] adapter ${adapter.name} detect() failed for ${instanceId}: ${err.message}`);
    }
  }

  return null;
}

/**
 * Deliver a thin notification via the instance's chassis adapter.
 * Contract §8b — ONE convention, no silent seam:
 *   - resolves (returns the adapter result) ⇒ verified delivery
 *   - THROWS on missing adapter or an {ok:false} adapter result
 *     (message = the error detail)
 * The hub maps resolve → slot 'active' and throw → failure → 'pending'.
 */
export async function deliverNotification(instanceId, notification) {
  const adapter = await getAdapter(instanceId);
  if (!adapter) {
    throw new Error(`no chassis adapter for ${instanceId}`);
  }
  const result = await adapter.notify(instanceId, notification);
  if (!result?.ok) {
    throw new Error(result?.error || `chassis notify failed for ${instanceId} (no error detail)`);
  }
  return result;
}
