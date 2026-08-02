/**
 * EA Proxy - Executive Assistant acting as Executive
 *
 * Middleware that allows the EA role to manage the Executive's
 * personal tasks, lists, documents, and diary by swapping instanceIds.
 *
 * Usage: Any API call with { ea_proxy: true } will have the EA's
 * instanceId replaced with the Executive's instanceId after verifying
 * the caller has EA role.
 *
 * Multi-Executive support: Each EA explicitly manages one Executive via
 * the "manages" field in the EA's preferences.json. This allows multiple
 * EA/Executive pairs (e.g., Genevieve→Lupo, Thomas→Paula).
 * Falls back to system scan if "manages" is not set.
 *
 * @module ea-proxy
 * @author Ember <ember-75b6@smoothcurves.nexus>
 * @created 2026-02-22
 * @updated 2026-03-18 — multi-Executive support via explicit manages field
 */

import { readPreferences } from './data.js';
import { getAllInstances } from './instances.js';

// Fallback cache for legacy mode (no explicit manages field)
let cachedExecutiveId = null;
let cacheTime = 0;
const CACHE_TTL = 60000; // 1 minute

/**
 * Find an Executive instanceId by scanning all instances.
 * Fallback for EAs without an explicit "manages" field.
 * DEPRECATED behavior — prefer explicit manages relationship.
 */
export async function getExecutiveInstanceId() {
  const now = Date.now();
  if (cachedExecutiveId && (now - cacheTime) < CACHE_TTL) {
    return cachedExecutiveId;
  }

  const result = await getAllInstances({ role: 'Executive' });
  if (!result.success || !result.instances || result.instances.length === 0) {
    return null;
  }

  // Legacy: return first Executive found. Nondeterministic with multiple Executives.
  cachedExecutiveId = result.instances[0].instanceId;
  cacheTime = now;
  return cachedExecutiveId;
}

/**
 * Verify caller has EA/COO role and resolve their managed Executive's instanceId.
 *
 * Resolution order:
 * 1. EA's preferences.manages — explicit relationship (preferred)
 * 2. Fallback: scan for any Executive in the system (legacy, nondeterministic)
 */
async function resolveEA(callerInstanceId) {
  const callerPrefs = await readPreferences(callerInstanceId);
  if (!callerPrefs) {
    return { allowed: false, error: 'Caller instance not found' };
  }

  const role = callerPrefs.role;
  if (!['EA', 'COO'].includes(role)) {
    return { allowed: false, error: `Role '${role}' is not authorized for EA proxy` };
  }

  // Preferred: explicit manages relationship
  if (callerPrefs.manages) {
    // Validate the managed instance exists and is an Executive
    const managedPrefs = await readPreferences(callerPrefs.manages);
    if (!managedPrefs) {
      return { allowed: false, error: `Managed instance '${callerPrefs.manages}' not found` };
    }
    if (managedPrefs.role !== 'Executive') {
      return { allowed: false, error: `Managed instance '${callerPrefs.manages}' is not an Executive (role: ${managedPrefs.role})` };
    }
    return { allowed: true, executiveId: callerPrefs.manages };
  }

  // Fallback: find any Executive (legacy — works with single Executive)
  const executiveId = await getExecutiveInstanceId();
  if (!executiveId) {
    return { allowed: false, error: 'No Executive instance found. Set "manages" in EA preferences to specify which Executive this EA serves.' };
  }

  return { allowed: true, executiveId };
}

/**
 * Proxy an API call so the EA operates as the Executive.
 * Swaps instanceId, calls the handler, annotates the result.
 *
 * @param {Function} handlerFn - The real API handler function
 * @param {Object} params - Original params with EA's instanceId
 * @returns {Object} API result with ea_proxy metadata
 */
export async function eaProxy(handlerFn, params) {
  const { allowed, executiveId, error } = await resolveEA(params.instanceId);
  if (!allowed) {
    return {
      success: false,
      error: { code: 'EA_PROXY_DENIED', message: error }
    };
  }

  // Swap instanceId, preserve original for audit trail
  const proxiedParams = {
    ...params,
    instanceId: executiveId,
    _ea_caller: params.instanceId
  };

  // For lists that use targetInstanceId pattern, set that too
  if (!proxiedParams.targetInstanceId) {
    proxiedParams.targetInstanceId = executiveId;
  }

  // For documents that use target pattern
  if (!proxiedParams.target) {
    proxiedParams.target = `instance:${executiveId}`;
  }

  delete proxiedParams.ea_proxy; // Don't pass flag downstream

  // For task creation, append EA attribution to description
  if (proxiedParams.description !== undefined || proxiedParams.title) {
    const attribution = `\n\n---\nCreated by Executive's assistant [${params.instanceId}]`;
    if (proxiedParams.description) {
      proxiedParams.description += attribution;
    } else if (proxiedParams.title && !proxiedParams.description) {
      // Only add attribution field if this looks like a create operation
      proxiedParams._ea_attribution = attribution;
    }
  }

  const result = await handlerFn(proxiedParams);

  // Annotate result so caller knows it was proxied
  if (result && typeof result === 'object') {
    result._ea_proxy = {
      actingAs: executiveId,
      caller: params.instanceId
    };
  }

  return result;
}
