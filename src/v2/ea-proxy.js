/**
 * EA Proxy - Executive Assistant acting as Executive
 *
 * Middleware that allows the EA/PA role to manage the Executive's
 * personal tasks, lists, documents, and diary by swapping instanceIds.
 *
 * Usage: Any API call with { ea_proxy: true } will have the EA's
 * instanceId replaced with the Executive's instanceId after verifying
 * the caller has EA/PA role.
 *
 * @module ea-proxy
 * @author Ember <ember-75b6@smoothcurves.nexus>
 * @created 2026-02-22
 */

import { readPreferences } from './data.js';
import { getAllInstances } from './instances.js';

let cachedExecutiveId = null;
let cacheTime = 0;
const CACHE_TTL = 60000; // 1 minute

/**
 * Find the Executive's instanceId by scanning all instances.
 * Cached for 1 minute since Executive identity rarely changes.
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

  // HACS v2: exactly one Executive
  cachedExecutiveId = result.instances[0].instanceId;
  cacheTime = now;
  return cachedExecutiveId;
}

/**
 * Verify caller has EA/PA role and resolve the Executive's instanceId.
 */
async function resolveEA(callerInstanceId) {
  const callerPrefs = await readPreferences(callerInstanceId);
  if (!callerPrefs) {
    return { allowed: false, error: 'Caller instance not found' };
  }

  const role = callerPrefs.role;
  if (!['PA', 'EA', 'COO'].includes(role)) {
    return { allowed: false, error: `Role '${role}' is not authorized for EA proxy` };
  }

  const executiveId = await getExecutiveInstanceId();
  if (!executiveId) {
    return { allowed: false, error: 'No Executive instance found in system' };
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
