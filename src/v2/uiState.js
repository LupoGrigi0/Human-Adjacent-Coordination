/**
 * UI State handler for V2 coordination system
 * Provides persistent storage for UI preferences in instance preferences
 *
 * @module uiState
 * @author Bridge
 * @created 2025-12-12
 */

import { readPreferences, writePreferences } from './data.js';

/**
 * Get UI state for an instance
 *
 * @param {Object} params - Parameters
 * @param {string} params.instanceId - Instance ID (required)
 * @returns {Promise<Object>} Result with uiState object
 */
export async function getUiState(params) {
  const metadata = {
    timestamp: new Date().toISOString(),
    function: 'getUiState'
  };

  if (!params.instanceId) {
    return {
      success: false,
      error: { code: 'MISSING_PARAMETER', message: 'instanceId is required' },
      metadata
    };
  }

  const prefs = await readPreferences(params.instanceId);
  if (!prefs) {
    return {
      success: false,
      error: {
        code: 'INVALID_INSTANCE_ID',
        message: `Instance ${params.instanceId} not found`
      },
      metadata
    };
  }

  return {
    success: true,
    uiState: prefs.uiState || {},
    instanceId: params.instanceId,
    metadata
  };
}

/**
 * Set UI state for an instance (replaces entire uiState object)
 *
 * @param {Object} params - Parameters
 * @param {string} params.instanceId - Instance ID (required)
 * @param {Object} params.uiState - Complete uiState object to set (required)
 * @returns {Promise<Object>} Result with updated uiState
 */
export async function setUiState(params) {
  const metadata = {
    timestamp: new Date().toISOString(),
    function: 'setUiState'
  };

  if (!params.instanceId) {
    return {
      success: false,
      error: { code: 'MISSING_PARAMETER', message: 'instanceId is required' },
      metadata
    };
  }

  if (params.uiState === undefined) {
    return {
      success: false,
      error: { code: 'MISSING_PARAMETER', message: 'uiState is required' },
      metadata
    };
  }

  if (typeof params.uiState !== 'object' || params.uiState === null || Array.isArray(params.uiState)) {
    return {
      success: false,
      error: { code: 'INVALID_PARAMETER', message: 'uiState must be an object' },
      metadata
    };
  }

  const prefs = await readPreferences(params.instanceId);
  if (!prefs) {
    return {
      success: false,
      error: {
        code: 'INVALID_INSTANCE_ID',
        message: `Instance ${params.instanceId} not found`
      },
      metadata
    };
  }

  prefs.uiState = params.uiState;
  prefs.lastUpdated = new Date().toISOString();

  await writePreferences(params.instanceId, prefs);

  return {
    success: true,
    uiState: prefs.uiState,
    instanceId: params.instanceId,
    message: 'UI state replaced',
    metadata
  };
}

/**
 * Update UI state for an instance (shallow merge with existing uiState)
 *
 * @param {Object} params - Parameters
 * @param {string} params.instanceId - Instance ID (required)
 * @param {Object} params.updates - Partial uiState object to merge (required)
 * @returns {Promise<Object>} Result with merged uiState
 */
export async function updateUiState(params) {
  const metadata = {
    timestamp: new Date().toISOString(),
    function: 'updateUiState'
  };

  if (!params.instanceId) {
    return {
      success: false,
      error: { code: 'MISSING_PARAMETER', message: 'instanceId is required' },
      metadata
    };
  }

  if (params.updates === undefined) {
    return {
      success: false,
      error: { code: 'MISSING_PARAMETER', message: 'updates is required' },
      metadata
    };
  }

  if (typeof params.updates !== 'object' || params.updates === null || Array.isArray(params.updates)) {
    return {
      success: false,
      error: { code: 'INVALID_PARAMETER', message: 'updates must be an object' },
      metadata
    };
  }

  const prefs = await readPreferences(params.instanceId);
  if (!prefs) {
    return {
      success: false,
      error: {
        code: 'INVALID_INSTANCE_ID',
        message: `Instance ${params.instanceId} not found`
      },
      metadata
    };
  }

  // Shallow merge: new values overwrite existing at top level
  const existingUiState = prefs.uiState || {};
  prefs.uiState = { ...existingUiState, ...params.updates };
  prefs.lastUpdated = new Date().toISOString();

  await writePreferences(params.instanceId, prefs);

  return {
    success: true,
    uiState: prefs.uiState,
    instanceId: params.instanceId,
    updatedFields: Object.keys(params.updates),
    message: 'UI state updated',
    metadata
  };
}
