/**
 * ╔═══════════════════════════════════════════════════════════════════════════╗
 * ║  HACS API DOCUMENTATION TEMPLATE                                          ║
 * ║  Version: 1.0.0                                                           ║
 * ║  Last Updated: 2025-12-28                                                 ║
 * ╠═══════════════════════════════════════════════════════════════════════════╣
 * ║  This file defines THE standard for documenting HACS API endpoints.       ║
 * ║  All endpoint documentation must follow this template.                    ║
 * ║                                                                           ║
 * ║  Documentation here is THE source of truth for:                           ║
 * ║    • openapi.json         (auto-generated)                                ║
 * ║    • MCP tools/list       (auto-generated)                                ║
 * ║    • Website documentation (auto-generated)                               ║
 * ║    • GitHub repo docs     (auto-generated)                                ║
 * ║    • Claude skill definitions (auto-generated)                            ║
 * ╠═══════════════════════════════════════════════════════════════════════════╣
 * ║  TEMPLATE VERSION HISTORY                                                 ║
 * ║  ─────────────────────────────────────────────────────────────────────────║
 * ║  1.0.0 (2025-12-28) - Initial template by Crossing                        ║
 * ║    • Core structure with @hacs-endpoint marker                            ║
 * ║    • Parameter sources with @source tag                                   ║
 * ║    • Error handling with @recover tag                                     ║
 * ║    • NEEDS_CLARIFICATION flag for unknown items                           ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 */

// ============================================================================
// TEMPLATE VERSION - Update this when template structure changes
// ============================================================================
export const TEMPLATE_VERSION = '1.0.0';

// ============================================================================
// TEMPLATE DEFINITION
// ============================================================================
// Copy everything between START TEMPLATE and END TEMPLATE into your endpoint file
// Replace all {{PLACEHOLDER}} values with actual content
// ============================================================================

/*
═══════════════════════════════════════════════════════════════════════════════
START TEMPLATE
═══════════════════════════════════════════════════════════════════════════════

/**
 * @hacs-endpoint
 * @template-version 1.0.0
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │ {{ENDPOINT_NAME_UPPERCASE}}                                             │
 * │ {{SHORT_DESCRIPTION}}                                                   │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * @tool {{tool_name_snake_case}}
 * @version {{x.y.z}}
 * @since {{YYYY-MM-DD}}
 * @category {{core|identity|tasks|projects|messaging|lists|instances|system}}
 * @status {{stable|beta|deprecated|experimental}}
 *
 * ───────────────────────────────────────────────────────────────────────────
 * DESCRIPTION
 * ───────────────────────────────────────────────────────────────────────────
 * @description
 * {{LONG_DESCRIPTION}}
 *
 * {{WHEN_TO_USE_THIS_ENDPOINT}}
 *
 * ───────────────────────────────────────────────────────────────────────────
 * PARAMETERS
 * ───────────────────────────────────────────────────────────────────────────
 * @param {{{type}}} {{paramName}} - {{description}} [{{required|optional}}]
 *   @source {{WHERE_TO_GET_THIS_VALUE}}
 *   @default {{default_value_if_optional}}
 *   @enum {{value1|value2|value3}} (if applicable)
 *   @validate {{validation_rules}}
 *
 * ───────────────────────────────────────────────────────────────────────────
 * RETURNS
 * ───────────────────────────────────────────────────────────────────────────
 * @returns {object} {{ResponseTypeName}}
 * @returns {boolean} .success - Whether the call succeeded
 * @returns {{{type}}} .{{fieldName}} - {{description}}
 *
 * ───────────────────────────────────────────────────────────────────────────
 * PERMISSIONS & LIMITS
 * ───────────────────────────────────────────────────────────────────────────
 * @permissions {{*|authenticated|role:COO|role:Executive}}
 * @rateLimit {{requests}}/{{period}}
 *
 * ───────────────────────────────────────────────────────────────────────────
 * ERRORS & RECOVERY
 * ───────────────────────────────────────────────────────────────────────────
 * @error {{ERROR_CODE}} - {{description}}
 *   @recover {{WHAT_TO_DO_TO_FIX_THIS}}
 *
 * ───────────────────────────────────────────────────────────────────────────
 * EXAMPLES
 * ───────────────────────────────────────────────────────────────────────────
 * @example {{Example Title}}
 * {{JSON_EXAMPLE}}
 *
 * ───────────────────────────────────────────────────────────────────────────
 * RELATED
 * ───────────────────────────────────────────────────────────────────────────
 * @see {{related_endpoint}} - {{why_related}}
 *
 * ───────────────────────────────────────────────────────────────────────────
 * NOTES
 * ───────────────────────────────────────────────────────────────────────────
 * @note {{IMPORTANT_IMPLEMENTATION_NOTES}}
 * @todo {{KNOWN_ISSUES_OR_FUTURE_WORK}}
 * @needs-clarification {{ANYTHING_THE_DOCUMENTER_COULDNT_FIGURE_OUT}}
 * /

═══════════════════════════════════════════════════════════════════════════════
END TEMPLATE
═══════════════════════════════════════════════════════════════════════════════
*/

// ============================================================================
// EXAMPLE: Fully documented endpoint
// ============================================================================

/**
 * @hacs-endpoint
 * @template-version 1.0.0
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │ INTROSPECT                                                              │
 * │ Get current instance context, state, and available actions              │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * @tool introspect
 * @version 2.0.0
 * @since 2025-12-15
 * @category core
 * @status stable
 *
 * ───────────────────────────────────────────────────────────────────────────
 * DESCRIPTION
 * ───────────────────────────────────────────────────────────────────────────
 * @description
 * Returns the current state of an instance including its role, active project,
 * pending tasks, recent messages, and available actions. This is the primary
 * "where am I, what should I do" endpoint for woken instances.
 *
 * Use this endpoint after waking up or recovering from context loss to
 * understand your current state and what actions are available to you.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * PARAMETERS
 * ───────────────────────────────────────────────────────────────────────────
 * @param {string} instanceId - Unique identifier for the instance [required]
 *   @source Your instanceId is returned from bootstrap, or can be recovered
 *           via lookup_identity using your fingerprint. If you don't know your
 *           instanceId, call have_i_bootstrapped_before first.
 *
 * @param {boolean} includeHistory - Include recent activity history [optional]
 *   @source Set to true if you need to see what you've been doing recently
 *   @default false
 *
 * @param {number} historyLimit - Max history items to return [optional]
 *   @source Choose based on your context budget. 10 is usually enough.
 *   @default 10
 *   @validate min: 1, max: 100
 *
 * ───────────────────────────────────────────────────────────────────────────
 * RETURNS
 * ───────────────────────────────────────────────────────────────────────────
 * @returns {object} IntrospectResponse
 * @returns {boolean} .success - Whether the call succeeded
 * @returns {string} .instanceId - The instance ID (echo back)
 * @returns {string} .role - Current role (COO, PA, PM, Developer, etc.)
 * @returns {string|null} .personality - Adopted personality, if any
 * @returns {string|null} .activeProject - Currently joined project ID
 * @returns {object} .context - Current context state
 * @returns {array} .pendingTasks - Tasks assigned to you awaiting action
 * @returns {array} .recentMessages - Unread messages for you
 * @returns {array} .availableActions - Actions you can take based on role
 * @returns {object} .diary - Your diary metadata (entry count, last entry date)
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
 * @error INSTANCE_NOT_FOUND - No instance with this ID exists
 *   @recover Check your instanceId is correct. If you're new, call bootstrap
 *            first. If recovering, use lookup_identity with your fingerprint.
 *
 * @error NOT_BOOTSTRAPPED - Instance directory exists but no preferences.json
 *   @recover Call bootstrap with your role to complete initialization.
 *
 * @error INVALID_INSTANCE_ID - The instanceId format is invalid
 *   @recover InstanceId should be format "Name-xxxx" (4 char hex suffix).
 *            Example: "Crossing-a1b2"
 *
 * ───────────────────────────────────────────────────────────────────────────
 * EXAMPLES
 * ───────────────────────────────────────────────────────────────────────────
 * @example Basic introspect
 * { "instanceId": "Crossing-a1b2" }
 *
 * @example With activity history
 * {
 *   "instanceId": "Crossing-a1b2",
 *   "includeHistory": true,
 *   "historyLimit": 20
 * }
 *
 * ───────────────────────────────────────────────────────────────────────────
 * RELATED
 * ───────────────────────────────────────────────────────────────────────────
 * @see bootstrap - Call this first to initialize your instance
 * @see lookup_identity - Recover your instanceId if you've lost it
 * @see have_i_bootstrapped_before - Check if you exist before bootstrapping
 * @see get_diary - Get your full diary if you need more history
 *
 * ───────────────────────────────────────────────────────────────────────────
 * NOTES
 * ───────────────────────────────────────────────────────────────────────────
 * @note This is typically the first call after wake_instance or continue_conversation
 * @note The availableActions array is filtered based on your role permissions
 */
export async function introspect_example(params) {
  // This is just an example - the real implementation is in src/v2/introspect.js
}

// ============================================================================
// SPECIAL FLAGS FOR DOCUMENTATION AGENTS
// ============================================================================

/**
 * Use these flags when documenting endpoints if you can't determine something:
 *
 * @needs-clarification PARAM_SOURCE: {{paramName}} - Could not determine where
 *   caller should get this value. Checked: code, v2_api_spec, v2_vision.
 *
 * @needs-clarification ERROR_RECOVERY: {{errorCode}} - Error is thrown but
 *   recovery steps unclear from code.
 *
 * @needs-clarification PERMISSION_UNCLEAR: Could not determine who can call
 *   this endpoint. No permission check visible in code.
 *
 * @needs-clarification RETURN_TYPE: {{fieldName}} - Return value structure
 *   unclear from code.
 *
 * @needs-clarification DEPRECATED_STATUS: Endpoint may be deprecated but
 *   no clear indication in code.
 */

// ============================================================================
// CATEGORIES
// ============================================================================
export const CATEGORIES = {
  core: 'Core system endpoints (bootstrap, introspect, status)',
  identity: 'Identity and authentication (roles, personalities, recovery)',
  tasks: 'Task management (personal tasks, project tasks)',
  projects: 'Project management (create, join, list)',
  messaging: 'Communication (send, receive, XMPP)',
  lists: 'Personal checklists and lists',
  instances: 'Instance management (wake, continue, list)',
  system: 'System utilities (health, logs, meta)',
  diary: 'Diary and journaling endpoints',
  ui: 'UI state and preferences'
};

// ============================================================================
// STATUS BADGES
// ============================================================================
export const STATUS = {
  stable: '✅ Stable - Production ready',
  beta: '🔶 Beta - Working but may change',
  experimental: '🧪 Experimental - Use with caution',
  deprecated: '⚠️ Deprecated - Use alternative',
  internal: '🔒 Internal - Not for external use'
};
