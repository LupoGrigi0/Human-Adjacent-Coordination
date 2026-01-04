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
 * @hacs-endpoint
 * @template-version 1.0.0
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │ GET_UI_STATE                                                            │
 * │ Retrieve persistent UI preferences for an instance                      │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * @tool get_ui_state
 * @version 2.0.0
 * @since 2025-12-12
 * @category ui
 * @status stable
 *
 * ───────────────────────────────────────────────────────────────────────────
 * DESCRIPTION
 * ───────────────────────────────────────────────────────────────────────────
 * @description
 * Retrieves the UI state object for an instance. UI state is stored as a
 * free-form object in the instance's preferences.json file under the
 * `uiState` field.
 *
 * Use this endpoint when loading a UI to restore the user's previous
 * preferences like theme, sidebar state, selected project, etc.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * PARAMETERS
 * ───────────────────────────────────────────────────────────────────────────
 * @param {string} instanceId - Unique identifier for the instance [required]
 *   @source Your instanceId is returned from bootstrap response, or can be
 *           recovered via lookup_identity using your fingerprint.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * RETURNS
 * ───────────────────────────────────────────────────────────────────────────
 * @returns {object} GetUiStateResponse
 * @returns {boolean} .success - Whether the call succeeded
 * @returns {object} .uiState - The UI state object (empty {} if never set)
 * @returns {string} .instanceId - The instance ID (echo back)
 * @returns {object} .metadata - Call metadata (timestamp, function name)
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
 * @error MISSING_PARAMETER - instanceId parameter not provided
 *   @recover Include instanceId in your request. Get it from bootstrap response
 *            or use lookup_identity with your fingerprint to recover it.
 *
 * @error INVALID_INSTANCE_ID - No instance found with the provided ID
 *   @recover Verify the instanceId is correct (format: Name-xxxx). If you're
 *            new, call bootstrap first. If recovering, use lookup_identity.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * EXAMPLES
 * ───────────────────────────────────────────────────────────────────────────
 * @example Get UI state
 * { "instanceId": "Lupo-f63b" }
 *
 * ───────────────────────────────────────────────────────────────────────────
 * RELATED
 * ───────────────────────────────────────────────────────────────────────────
 * @see set_ui_state - Replace entire UI state
 * @see update_ui_state - Merge updates into existing UI state
 * @see introspect - Get full instance context including UI state
 *
 * ───────────────────────────────────────────────────────────────────────────
 * NOTES
 * ───────────────────────────────────────────────────────────────────────────
 * @note UI state is stored in preferences.json, not a separate file
 * @note Returns empty object {} if uiState has never been set
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
 * @hacs-endpoint
 * @template-version 1.0.0
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │ SET_UI_STATE                                                            │
 * │ Replace entire UI state for an instance                                 │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * @tool set_ui_state
 * @version 2.0.0
 * @since 2025-12-12
 * @category ui
 * @status stable
 *
 * ───────────────────────────────────────────────────────────────────────────
 * DESCRIPTION
 * ───────────────────────────────────────────────────────────────────────────
 * @description
 * Replaces the entire UI state object for an instance. This completely
 * overwrites any existing uiState - use update_ui_state if you want to
 * merge changes instead.
 *
 * Use this endpoint when you need to reset UI state to a known configuration,
 * or when initializing UI state for the first time.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * PARAMETERS
 * ───────────────────────────────────────────────────────────────────────────
 * @param {string} instanceId - Unique identifier for the instance [required]
 *   @source Your instanceId is returned from bootstrap response, or can be
 *           recovered via lookup_identity using your fingerprint.
 *
 * @param {object} uiState - Complete UI state object to set [required]
 *   @source Create this object with your desired UI preferences. Common
 *           fields: theme, sidebarCollapsed, selectedProject, lastViewedTask
 *   @validate Must be a non-null, non-array object
 *
 * ───────────────────────────────────────────────────────────────────────────
 * RETURNS
 * ───────────────────────────────────────────────────────────────────────────
 * @returns {object} SetUiStateResponse
 * @returns {boolean} .success - Whether the call succeeded
 * @returns {object} .uiState - The new UI state object
 * @returns {string} .instanceId - The instance ID (echo back)
 * @returns {string} .message - "UI state replaced"
 * @returns {object} .metadata - Call metadata (timestamp, function name)
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
 * @error MISSING_PARAMETER - instanceId or uiState parameter not provided
 *   @recover Include both instanceId and uiState in your request.
 *
 * @error INVALID_PARAMETER - uiState is not a valid object (null or array)
 *   @recover Ensure uiState is a plain object like { theme: "dark" }.
 *            Arrays and null values are not allowed.
 *
 * @error INVALID_INSTANCE_ID - No instance found with the provided ID
 *   @recover Verify the instanceId is correct (format: Name-xxxx). If you're
 *            new, call bootstrap first. If recovering, use lookup_identity.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * EXAMPLES
 * ───────────────────────────────────────────────────────────────────────────
 * @example Set UI state
 * {
 *   "instanceId": "Lupo-f63b",
 *   "uiState": {
 *     "sidebarCollapsed": true,
 *     "theme": "light"
 *   }
 * }
 *
 * ───────────────────────────────────────────────────────────────────────────
 * RELATED
 * ───────────────────────────────────────────────────────────────────────────
 * @see get_ui_state - Retrieve UI state
 * @see update_ui_state - Merge updates into existing UI state (preferred)
 *
 * ───────────────────────────────────────────────────────────────────────────
 * NOTES
 * ───────────────────────────────────────────────────────────────────────────
 * @note This completely replaces the uiState - use update_ui_state for merging
 * @note Also updates lastUpdated timestamp in preferences.json
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
 * @hacs-endpoint
 * @template-version 1.0.0
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │ UPDATE_UI_STATE                                                         │
 * │ Merge updates into existing UI state for an instance                    │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * @tool update_ui_state
 * @version 2.0.0
 * @since 2025-12-12
 * @category ui
 * @status stable
 *
 * ───────────────────────────────────────────────────────────────────────────
 * DESCRIPTION
 * ───────────────────────────────────────────────────────────────────────────
 * @description
 * Performs a shallow merge of the provided updates into the existing UI state.
 * New values overwrite existing at the top level, but nested objects are
 * replaced entirely, not deep-merged.
 *
 * This is the preferred method for updating UI state as it preserves existing
 * settings that you don't explicitly change.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * PARAMETERS
 * ───────────────────────────────────────────────────────────────────────────
 * @param {string} instanceId - Unique identifier for the instance [required]
 *   @source Your instanceId is returned from bootstrap response, or can be
 *           recovered via lookup_identity using your fingerprint.
 *
 * @param {object} updates - Partial UI state object to merge [required]
 *   @source Create an object with only the fields you want to update.
 *           Example: { theme: "dark" } to only change the theme
 *   @validate Must be a non-null, non-array object
 *
 * ───────────────────────────────────────────────────────────────────────────
 * RETURNS
 * ───────────────────────────────────────────────────────────────────────────
 * @returns {object} UpdateUiStateResponse
 * @returns {boolean} .success - Whether the call succeeded
 * @returns {object} .uiState - The complete merged UI state object
 * @returns {string} .instanceId - The instance ID (echo back)
 * @returns {array} .updatedFields - List of field names that were updated
 * @returns {string} .message - "UI state updated"
 * @returns {object} .metadata - Call metadata (timestamp, function name)
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
 * @error MISSING_PARAMETER - instanceId or updates parameter not provided
 *   @recover Include both instanceId and updates in your request.
 *
 * @error INVALID_PARAMETER - updates is not a valid object (null or array)
 *   @recover Ensure updates is a plain object like { theme: "dark" }.
 *            Arrays and null values are not allowed.
 *
 * @error INVALID_INSTANCE_ID - No instance found with the provided ID
 *   @recover Verify the instanceId is correct (format: Name-xxxx). If you're
 *            new, call bootstrap first. If recovering, use lookup_identity.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * EXAMPLES
 * ───────────────────────────────────────────────────────────────────────────
 * @example Update specific fields
 * {
 *   "instanceId": "Lupo-f63b",
 *   "updates": {
 *     "selectedProject": "new-project",
 *     "lastViewedTask": "task-123"
 *   }
 * }
 *
 * ───────────────────────────────────────────────────────────────────────────
 * RELATED
 * ───────────────────────────────────────────────────────────────────────────
 * @see get_ui_state - Retrieve UI state
 * @see set_ui_state - Replace entire UI state (use sparingly)
 *
 * ───────────────────────────────────────────────────────────────────────────
 * NOTES
 * ───────────────────────────────────────────────────────────────────────────
 * @note This is a SHALLOW merge - nested objects are replaced, not deep merged
 * @note Use updatedFields in response to confirm which fields changed
 * @note Also updates lastUpdated timestamp in preferences.json
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
