/**
 * Lists handler for V2 coordination system
 * Provides personal checklists with Executive visibility for PM/COO/PA
 *
 * @module lists
 * @author Bridge
 * @created 2025-12-12
 */

import path from 'path';
import { getInstanceDir } from './config.js';
import { readJSON, writeJSON, readPreferences, generateSuffix } from './data.js';

/**
 * Get path to instance's lists file
 */
function getListsFile(instanceId) {
  return path.join(getInstanceDir(instanceId), 'lists.json');
}

/**
 * Initialize lists file for an instance if it doesn't exist
 */
async function initializeLists(instanceId) {
  const listsFile = getListsFile(instanceId);
  const existing = await readJSON(listsFile);

  if (!existing) {
    const defaultData = {
      schema_version: '1.0',
      instance_id: instanceId,
      created: new Date().toISOString(),
      last_updated: new Date().toISOString(),
      lists: []
    };
    await writeJSON(listsFile, defaultData);
    return defaultData;
  }
  return existing;
}

/**
 * Check if caller can access target instance's lists
 * PM, COO, PA can access Executive's lists
 *
 * @param {string} callerRole - Role of the calling instance
 * @param {string} targetRole - Role of the target instance
 * @returns {boolean} Whether access is permitted
 */
function canAccessTargetLists(callerRole, targetRole) {
  const privilegedRoles = ['PM', 'COO', 'PA'];
  return privilegedRoles.includes(callerRole) && targetRole === 'Executive';
}

/**
 * Resolve target instance ID and verify permissions
 * Returns the effective instanceId to operate on
 *
 * @param {Object} params - Parameters with instanceId and optional targetInstanceId
 * @param {Object} metadata - Metadata object for the response
 * @returns {Promise<Object>} { success, effectiveInstanceId, error }
 */
async function resolveTargetInstance(params, metadata) {
  const { instanceId, targetInstanceId } = params;

  // Verify caller exists
  const callerPrefs = await readPreferences(instanceId);
  if (!callerPrefs) {
    return {
      success: false,
      error: {
        code: 'INVALID_INSTANCE_ID',
        message: `Caller instance ${instanceId} not found`
      }
    };
  }

  // If no target specified, operate on caller's own lists
  if (!targetInstanceId) {
    return {
      success: true,
      effectiveInstanceId: instanceId,
      callerPrefs
    };
  }

  // Target specified - check permissions
  const targetPrefs = await readPreferences(targetInstanceId);
  if (!targetPrefs) {
    return {
      success: false,
      error: {
        code: 'INVALID_TARGET',
        message: `Target instance ${targetInstanceId} not found`
      }
    };
  }

  // Check if caller can access target's lists
  if (!canAccessTargetLists(callerPrefs.role, targetPrefs.role)) {
    return {
      success: false,
      error: {
        code: 'UNAUTHORIZED',
        message: `Role ${callerPrefs.role} cannot access ${targetPrefs.role}'s lists`
      }
    };
  }

  return {
    success: true,
    effectiveInstanceId: targetInstanceId,
    callerPrefs,
    targetPrefs
  };
}

/**
 * @hacs-endpoint
 * @template-version 1.0.0
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │ CREATE_LIST                                                             │
 * │ Create a new personal checklist for an instance                         │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * @tool create_list
 * @version 1.0.0
 * @since 2025-12-12
 * @category lists
 * @status stable
 *
 * ───────────────────────────────────────────────────────────────────────────
 * DESCRIPTION
 * ───────────────────────────────────────────────────────────────────────────
 * @description
 * Creates a new personal checklist for the calling instance or a target instance
 * (if the caller has permission). Lists are stored per-instance and can contain
 * any number of checkable items.
 *
 * Use this endpoint when you need to create a new organized list of items to
 * track, such as daily tasks, project checklists, or reminders.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * PARAMETERS
 * ───────────────────────────────────────────────────────────────────────────
 * @param {string} instanceId - Caller's instance ID [required]
 *   @source Your instanceId is returned from bootstrap response, or recover via
 *           lookup_identity. Available in your preferences after bootstrapping.
 *
 * @param {string} name - Name for the new list [required]
 *   @source Provide a descriptive name for your list (e.g., "Daily Tasks",
 *           "Sprint Goals", "Shopping List").
 *   @validate Non-empty string
 *
 * @param {string} description - Optional description for the list [optional]
 *   @source Provide additional context about what this list is for.
 *   @default null
 *
 * @param {string} targetInstanceId - Target instance for Executive access [optional]
 *   @source Use get_all_instances to find Executive instanceIds. Only PM, COO,
 *           and PA roles can access Executive's lists.
 *   @default null (operates on caller's own lists)
 *
 * ───────────────────────────────────────────────────────────────────────────
 * RETURNS
 * ───────────────────────────────────────────────────────────────────────────
 * @returns {object} CreateListResponse
 * @returns {boolean} .success - Whether the call succeeded
 * @returns {object} .list - The created list object
 * @returns {string} .list.id - Unique list identifier (format: list-xxxxxxxx)
 * @returns {string} .list.name - List name
 * @returns {string|null} .list.description - List description
 * @returns {string} .list.createdAt - ISO timestamp of creation
 * @returns {string} .list.updatedAt - ISO timestamp of last update
 * @returns {array} .list.items - Empty array (new list has no items)
 * @returns {string|null} .targetInstance - Target instanceId if specified
 * @returns {string} .message - Confirmation message
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
 * @error MISSING_PARAMETER - instanceId or name not provided
 *   @recover Include both instanceId and name in your request. Get instanceId
 *            from bootstrap or lookup_identity.
 *
 * @error INVALID_INSTANCE_ID - Caller instance not found
 *   @recover Verify your instanceId is correct. If new, call bootstrap first.
 *
 * @error INVALID_TARGET - Target instance not found
 *   @recover Verify the targetInstanceId exists using get_all_instances.
 *
 * @error UNAUTHORIZED - Caller cannot access target's lists
 *   @recover Only PM, COO, and PA roles can access Executive's lists. Verify
 *            your role and target's role.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * EXAMPLES
 * ───────────────────────────────────────────────────────────────────────────
 * @example Create personal list
 * {
 *   "instanceId": "Phoenix-k3m7",
 *   "name": "Daily Tasks",
 *   "description": "Things to do today"
 * }
 *
 * @example Create list for Executive (as PA/PM/COO)
 * {
 *   "instanceId": "Genevieve-001",
 *   "name": "Executive Priority Items",
 *   "targetInstanceId": "Lupo-000"
 * }
 *
 * ───────────────────────────────────────────────────────────────────────────
 * RELATED
 * ───────────────────────────────────────────────────────────────────────────
 * @see get_lists - Get all lists for an instance
 * @see get_list - Get a specific list with all items
 * @see add_list_item - Add items to a list after creating it
 * @see delete_list - Remove a list entirely
 *
 * ───────────────────────────────────────────────────────────────────────────
 * NOTES
 * ───────────────────────────────────────────────────────────────────────────
 * @note Lists are stored in {instanceId}/lists.json
 * @note List IDs are generated using format list-{8 hex chars}
 * @note Executive visibility allows PM/COO/PA to manage Executive's lists
 */
export async function createList(params) {
  const metadata = {
    timestamp: new Date().toISOString(),
    function: 'createList'
  };

  if (!params.instanceId) {
    return {
      success: false,
      error: { code: 'MISSING_PARAMETER', message: 'instanceId is required' },
      metadata
    };
  }

  if (!params.name) {
    return {
      success: false,
      error: { code: 'MISSING_PARAMETER', message: 'name is required' },
      metadata
    };
  }

  const resolved = await resolveTargetInstance(params, metadata);
  if (!resolved.success) {
    return { success: false, error: resolved.error, metadata };
  }

  const effectiveId = resolved.effectiveInstanceId;
  const listsData = await initializeLists(effectiveId);
  const now = new Date().toISOString();

  const newList = {
    id: `list-${generateSuffix()}${generateSuffix()}`,
    name: params.name,
    description: params.description || null,
    createdAt: now,
    updatedAt: now,
    items: []
  };

  listsData.lists.push(newList);
  listsData.last_updated = now;

  await writeJSON(getListsFile(effectiveId), listsData);

  return {
    success: true,
    list: newList,
    targetInstance: params.targetInstanceId || null,
    message: `List '${params.name}' created`,
    metadata
  };
}

/**
 * @hacs-endpoint
 * @template-version 1.0.0
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │ GET_LISTS                                                               │
 * │ Get all lists for an instance (summaries without items)                 │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * @tool get_lists
 * @version 1.0.0
 * @since 2025-12-12
 * @category lists
 * @status stable
 *
 * ───────────────────────────────────────────────────────────────────────────
 * DESCRIPTION
 * ───────────────────────────────────────────────────────────────────────────
 * @description
 * Returns a summary of all lists belonging to the calling instance or a target
 * instance (if the caller has permission). Returns list metadata and item counts
 * but not the actual items - use get_list for full item details.
 *
 * Use this endpoint to see what lists exist before drilling into a specific list,
 * or to display a dashboard view of all lists with progress (checked/total items).
 *
 * ───────────────────────────────────────────────────────────────────────────
 * PARAMETERS
 * ───────────────────────────────────────────────────────────────────────────
 * @param {string} instanceId - Caller's instance ID [required]
 *   @source Your instanceId is returned from bootstrap response, or recover via
 *           lookup_identity. Available in your preferences after bootstrapping.
 *
 * @param {string} targetInstanceId - Target instance for Executive access [optional]
 *   @source Use get_all_instances to find Executive instanceIds. Only PM, COO,
 *           and PA roles can access Executive's lists.
 *   @default null (operates on caller's own lists)
 *
 * ───────────────────────────────────────────────────────────────────────────
 * RETURNS
 * ───────────────────────────────────────────────────────────────────────────
 * @returns {object} GetListsResponse
 * @returns {boolean} .success - Whether the call succeeded
 * @returns {array} .lists - Array of list summary objects
 * @returns {string} .lists[].id - List identifier
 * @returns {string} .lists[].name - List name
 * @returns {string|null} .lists[].description - List description
 * @returns {number} .lists[].itemCount - Total number of items in the list
 * @returns {number} .lists[].checkedCount - Number of checked items
 * @returns {string} .lists[].createdAt - ISO timestamp of creation
 * @returns {string} .lists[].updatedAt - ISO timestamp of last update
 * @returns {string|null} .targetInstance - Target instanceId if specified
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
 * @error MISSING_PARAMETER - instanceId not provided
 *   @recover Include instanceId in your request. Get it from bootstrap or
 *            lookup_identity.
 *
 * @error INVALID_INSTANCE_ID - Caller instance not found
 *   @recover Verify your instanceId is correct. If new, call bootstrap first.
 *
 * @error INVALID_TARGET - Target instance not found
 *   @recover Verify the targetInstanceId exists using get_all_instances.
 *
 * @error UNAUTHORIZED - Caller cannot access target's lists
 *   @recover Only PM, COO, and PA roles can access Executive's lists. Verify
 *            your role and target's role.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * EXAMPLES
 * ───────────────────────────────────────────────────────────────────────────
 * @example Get own lists
 * { "instanceId": "Phoenix-k3m7" }
 *
 * @example Get Executive's lists (as PA/PM/COO)
 * {
 *   "instanceId": "Genevieve-001",
 *   "targetInstanceId": "Lupo-000"
 * }
 *
 * ───────────────────────────────────────────────────────────────────────────
 * RELATED
 * ───────────────────────────────────────────────────────────────────────────
 * @see get_list - Get a specific list with all items
 * @see create_list - Create a new list
 * @see delete_list - Remove a list entirely
 *
 * ───────────────────────────────────────────────────────────────────────────
 * NOTES
 * ───────────────────────────────────────────────────────────────────────────
 * @note Returns empty array if instance has no lists
 * @note Initializes lists.json file if it doesn't exist
 * @note Use itemCount and checkedCount to show progress indicators
 */
export async function getLists(params) {
  const metadata = {
    timestamp: new Date().toISOString(),
    function: 'getLists'
  };

  if (!params.instanceId) {
    return {
      success: false,
      error: { code: 'MISSING_PARAMETER', message: 'instanceId is required' },
      metadata
    };
  }

  const resolved = await resolveTargetInstance(params, metadata);
  if (!resolved.success) {
    return { success: false, error: resolved.error, metadata };
  }

  const effectiveId = resolved.effectiveInstanceId;
  const listsData = await initializeLists(effectiveId);

  const summaries = listsData.lists.map(list => ({
    id: list.id,
    name: list.name,
    description: list.description,
    itemCount: list.items.length,
    checkedCount: list.items.filter(item => item.checked).length,
    createdAt: list.createdAt,
    updatedAt: list.updatedAt
  }));

  return {
    success: true,
    lists: summaries,
    targetInstance: params.targetInstanceId || null,
    metadata
  };
}

/**
 * @hacs-endpoint
 * @template-version 1.0.0
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │ GET_LIST                                                                │
 * │ Get a specific list with all its items                                  │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * @tool get_list
 * @version 1.0.0
 * @since 2025-12-12
 * @category lists
 * @status stable
 *
 * ───────────────────────────────────────────────────────────────────────────
 * DESCRIPTION
 * ───────────────────────────────────────────────────────────────────────────
 * @description
 * Returns the full details of a specific list including all items with their
 * checked states. Use this after get_lists to drill into a specific list.
 *
 * Use this endpoint when you need to see all items in a list, display a
 * detailed list view, or check the status of specific items.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * PARAMETERS
 * ───────────────────────────────────────────────────────────────────────────
 * @param {string} instanceId - Caller's instance ID [required]
 *   @source Your instanceId is returned from bootstrap response, or recover via
 *           lookup_identity. Available in your preferences after bootstrapping.
 *
 * @param {string} listId - ID of the list to retrieve [required]
 *   @source Get listId from get_lists response (the .id field of each list).
 *   @validate Format: list-xxxxxxxx
 *
 * @param {string} targetInstanceId - Target instance for Executive access [optional]
 *   @source Use get_all_instances to find Executive instanceIds. Only PM, COO,
 *           and PA roles can access Executive's lists.
 *   @default null (operates on caller's own lists)
 *
 * ───────────────────────────────────────────────────────────────────────────
 * RETURNS
 * ───────────────────────────────────────────────────────────────────────────
 * @returns {object} GetListResponse
 * @returns {boolean} .success - Whether the call succeeded
 * @returns {object} .list - The full list object
 * @returns {string} .list.id - List identifier
 * @returns {string} .list.name - List name
 * @returns {string|null} .list.description - List description
 * @returns {string} .list.createdAt - ISO timestamp of creation
 * @returns {string} .list.updatedAt - ISO timestamp of last update
 * @returns {array} .list.items - Array of list items
 * @returns {string} .list.items[].id - Item identifier
 * @returns {string} .list.items[].text - Item text content
 * @returns {boolean} .list.items[].checked - Whether item is checked
 * @returns {string} .list.items[].createdAt - ISO timestamp of item creation
 * @returns {string|null} .targetInstance - Target instanceId if specified
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
 * @error MISSING_PARAMETER - instanceId or listId not provided
 *   @recover Include both instanceId and listId in your request.
 *
 * @error INVALID_INSTANCE_ID - Caller instance not found
 *   @recover Verify your instanceId is correct. If new, call bootstrap first.
 *
 * @error INVALID_TARGET - Target instance not found
 *   @recover Verify the targetInstanceId exists using get_all_instances.
 *
 * @error UNAUTHORIZED - Caller cannot access target's lists
 *   @recover Only PM, COO, and PA roles can access Executive's lists.
 *
 * @error LIST_NOT_FOUND - No list with the specified ID exists
 *   @recover Call get_lists to see available lists and their IDs.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * EXAMPLES
 * ───────────────────────────────────────────────────────────────────────────
 * @example Get a specific list
 * {
 *   "instanceId": "Phoenix-k3m7",
 *   "listId": "list-abc12345"
 * }
 *
 * @example Get Executive's list (as PA/PM/COO)
 * {
 *   "instanceId": "Genevieve-001",
 *   "listId": "list-xyz98765",
 *   "targetInstanceId": "Lupo-000"
 * }
 *
 * ───────────────────────────────────────────────────────────────────────────
 * RELATED
 * ───────────────────────────────────────────────────────────────────────────
 * @see get_lists - Get all lists (summaries only)
 * @see add_list_item - Add an item to this list
 * @see toggle_list_item - Toggle an item's checked state
 * @see delete_list_item - Remove an item from this list
 *
 * ───────────────────────────────────────────────────────────────────────────
 * NOTES
 * ───────────────────────────────────────────────────────────────────────────
 * @note Items are returned in creation order
 * @note Use item IDs from this response for toggle_list_item and delete_list_item
 */
export async function getList(params) {
  const metadata = {
    timestamp: new Date().toISOString(),
    function: 'getList'
  };

  if (!params.instanceId) {
    return {
      success: false,
      error: { code: 'MISSING_PARAMETER', message: 'instanceId is required' },
      metadata
    };
  }

  if (!params.listId) {
    return {
      success: false,
      error: { code: 'MISSING_PARAMETER', message: 'listId is required' },
      metadata
    };
  }

  const resolved = await resolveTargetInstance(params, metadata);
  if (!resolved.success) {
    return { success: false, error: resolved.error, metadata };
  }

  const effectiveId = resolved.effectiveInstanceId;
  const listsData = await initializeLists(effectiveId);

  const list = listsData.lists.find(l => l.id === params.listId);
  if (!list) {
    return {
      success: false,
      error: { code: 'LIST_NOT_FOUND', message: `List ${params.listId} not found` },
      metadata
    };
  }

  return {
    success: true,
    list,
    targetInstance: params.targetInstanceId || null,
    metadata
  };
}

/**
 * @hacs-endpoint
 * @template-version 1.0.0
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │ ADD_LIST_ITEM                                                           │
 * │ Add a new item to an existing list                                      │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * @tool add_list_item
 * @version 1.0.0
 * @since 2025-12-12
 * @category lists
 * @status stable
 *
 * ───────────────────────────────────────────────────────────────────────────
 * DESCRIPTION
 * ───────────────────────────────────────────────────────────────────────────
 * @description
 * Adds a new item to an existing list. The item starts unchecked by default.
 * Items are appended to the end of the list.
 *
 * Use this endpoint to add tasks, reminders, or any checkable items to your
 * personal lists.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * PARAMETERS
 * ───────────────────────────────────────────────────────────────────────────
 * @param {string} instanceId - Caller's instance ID [required]
 *   @source Your instanceId is returned from bootstrap response, or recover via
 *           lookup_identity. Available in your preferences after bootstrapping.
 *
 * @param {string} listId - ID of the list to add item to [required]
 *   @source Get listId from get_lists response (the .id field of each list).
 *   @validate Format: list-xxxxxxxx
 *
 * @param {string} text - Text content for the new item [required]
 *   @source Provide a description of the item (e.g., "Review API spec",
 *           "Buy groceries", "Call client").
 *   @validate Non-empty string
 *
 * @param {string} targetInstanceId - Target instance for Executive access [optional]
 *   @source Use get_all_instances to find Executive instanceIds. Only PM, COO,
 *           and PA roles can access Executive's lists.
 *   @default null (operates on caller's own lists)
 *
 * ───────────────────────────────────────────────────────────────────────────
 * RETURNS
 * ───────────────────────────────────────────────────────────────────────────
 * @returns {object} AddListItemResponse
 * @returns {boolean} .success - Whether the call succeeded
 * @returns {object} .item - The created item object
 * @returns {string} .item.id - Unique item identifier (format: item-xxxxxxxx)
 * @returns {string} .item.text - Item text content
 * @returns {boolean} .item.checked - Whether item is checked (false for new items)
 * @returns {string} .item.createdAt - ISO timestamp of creation
 * @returns {string} .listId - ID of the list the item was added to
 * @returns {string|null} .targetInstance - Target instanceId if specified
 * @returns {string} .message - Confirmation message
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
 * @error MISSING_PARAMETER - instanceId, listId, or text not provided
 *   @recover Include all three required parameters in your request.
 *
 * @error INVALID_INSTANCE_ID - Caller instance not found
 *   @recover Verify your instanceId is correct. If new, call bootstrap first.
 *
 * @error INVALID_TARGET - Target instance not found
 *   @recover Verify the targetInstanceId exists using get_all_instances.
 *
 * @error UNAUTHORIZED - Caller cannot access target's lists
 *   @recover Only PM, COO, and PA roles can access Executive's lists.
 *
 * @error LIST_NOT_FOUND - No list with the specified ID exists
 *   @recover Call get_lists to see available lists and their IDs, or create
 *            a new list with create_list.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * EXAMPLES
 * ───────────────────────────────────────────────────────────────────────────
 * @example Add item to own list
 * {
 *   "instanceId": "Phoenix-k3m7",
 *   "listId": "list-abc12345",
 *   "text": "Review API spec document"
 * }
 *
 * @example Add item to Executive's list (as PA/PM/COO)
 * {
 *   "instanceId": "Genevieve-001",
 *   "listId": "list-xyz98765",
 *   "text": "Schedule quarterly review",
 *   "targetInstanceId": "Lupo-000"
 * }
 *
 * ───────────────────────────────────────────────────────────────────────────
 * RELATED
 * ───────────────────────────────────────────────────────────────────────────
 * @see get_list - View all items in a list
 * @see toggle_list_item - Check/uncheck an item
 * @see delete_list_item - Remove an item
 * @see create_list - Create a new list first
 *
 * ───────────────────────────────────────────────────────────────────────────
 * NOTES
 * ───────────────────────────────────────────────────────────────────────────
 * @note New items are always created with checked=false
 * @note Item IDs are generated using format item-{8 hex chars}
 * @note Items are appended to the end of the list
 */
export async function addListItem(params) {
  const metadata = {
    timestamp: new Date().toISOString(),
    function: 'addListItem'
  };

  if (!params.instanceId) {
    return {
      success: false,
      error: { code: 'MISSING_PARAMETER', message: 'instanceId is required' },
      metadata
    };
  }

  if (!params.listId) {
    return {
      success: false,
      error: { code: 'MISSING_PARAMETER', message: 'listId is required' },
      metadata
    };
  }

  if (!params.text) {
    return {
      success: false,
      error: { code: 'MISSING_PARAMETER', message: 'text is required' },
      metadata
    };
  }

  const resolved = await resolveTargetInstance(params, metadata);
  if (!resolved.success) {
    return { success: false, error: resolved.error, metadata };
  }

  const effectiveId = resolved.effectiveInstanceId;
  const listsFile = getListsFile(effectiveId);
  const listsData = await initializeLists(effectiveId);

  const listIndex = listsData.lists.findIndex(l => l.id === params.listId);
  if (listIndex === -1) {
    return {
      success: false,
      error: { code: 'LIST_NOT_FOUND', message: `List ${params.listId} not found` },
      metadata
    };
  }

  const now = new Date().toISOString();
  const newItem = {
    id: `item-${generateSuffix()}${generateSuffix()}`,
    text: params.text,
    checked: false,
    createdAt: now
  };

  listsData.lists[listIndex].items.push(newItem);
  listsData.lists[listIndex].updatedAt = now;
  listsData.last_updated = now;

  await writeJSON(listsFile, listsData);

  return {
    success: true,
    item: newItem,
    listId: params.listId,
    targetInstance: params.targetInstanceId || null,
    message: 'Item added',
    metadata
  };
}

/**
 * @hacs-endpoint
 * @template-version 1.0.0
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │ TOGGLE_LIST_ITEM                                                        │
 * │ Toggle an item's checked/unchecked state                                │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * @tool toggle_list_item
 * @version 1.0.0
 * @since 2025-12-12
 * @category lists
 * @status stable
 *
 * ───────────────────────────────────────────────────────────────────────────
 * DESCRIPTION
 * ───────────────────────────────────────────────────────────────────────────
 * @description
 * Toggles the checked state of a list item. If the item is unchecked, it
 * becomes checked; if checked, it becomes unchecked.
 *
 * Use this endpoint to mark items as complete/incomplete in your checklists.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * PARAMETERS
 * ───────────────────────────────────────────────────────────────────────────
 * @param {string} instanceId - Caller's instance ID [required]
 *   @source Your instanceId is returned from bootstrap response, or recover via
 *           lookup_identity. Available in your preferences after bootstrapping.
 *
 * @param {string} listId - ID of the list containing the item [required]
 *   @source Get listId from get_lists response (the .id field of each list).
 *   @validate Format: list-xxxxxxxx
 *
 * @param {string} itemId - ID of the item to toggle [required]
 *   @source Get itemId from get_list response (the .items[].id field).
 *   @validate Format: item-xxxxxxxx
 *
 * @param {string} targetInstanceId - Target instance for Executive access [optional]
 *   @source Use get_all_instances to find Executive instanceIds. Only PM, COO,
 *           and PA roles can access Executive's lists.
 *   @default null (operates on caller's own lists)
 *
 * ───────────────────────────────────────────────────────────────────────────
 * RETURNS
 * ───────────────────────────────────────────────────────────────────────────
 * @returns {object} ToggleListItemResponse
 * @returns {boolean} .success - Whether the call succeeded
 * @returns {object} .item - The updated item object
 * @returns {string} .item.id - Item identifier
 * @returns {string} .item.text - Item text content
 * @returns {boolean} .item.checked - New checked state (toggled from previous)
 * @returns {string} .item.createdAt - ISO timestamp of item creation
 * @returns {string} .listId - ID of the list containing the item
 * @returns {string|null} .targetInstance - Target instanceId if specified
 * @returns {string} .message - "Item checked" or "Item unchecked"
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
 * @error MISSING_PARAMETER - instanceId, listId, or itemId not provided
 *   @recover Include all three required parameters in your request.
 *
 * @error INVALID_INSTANCE_ID - Caller instance not found
 *   @recover Verify your instanceId is correct. If new, call bootstrap first.
 *
 * @error INVALID_TARGET - Target instance not found
 *   @recover Verify the targetInstanceId exists using get_all_instances.
 *
 * @error UNAUTHORIZED - Caller cannot access target's lists
 *   @recover Only PM, COO, and PA roles can access Executive's lists.
 *
 * @error LIST_NOT_FOUND - No list with the specified ID exists
 *   @recover Call get_lists to see available lists and their IDs.
 *
 * @error ITEM_NOT_FOUND - No item with the specified ID exists in this list
 *   @recover Call get_list to see all items and their IDs.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * EXAMPLES
 * ───────────────────────────────────────────────────────────────────────────
 * @example Toggle item in own list
 * {
 *   "instanceId": "Phoenix-k3m7",
 *   "listId": "list-abc12345",
 *   "itemId": "item-xyz98765"
 * }
 *
 * @example Toggle item in Executive's list (as PA/PM/COO)
 * {
 *   "instanceId": "Genevieve-001",
 *   "listId": "list-abc12345",
 *   "itemId": "item-xyz98765",
 *   "targetInstanceId": "Lupo-000"
 * }
 *
 * ───────────────────────────────────────────────────────────────────────────
 * RELATED
 * ───────────────────────────────────────────────────────────────────────────
 * @see get_list - Get all items to find itemId
 * @see add_list_item - Add new items to toggle
 * @see delete_list_item - Remove items instead of toggling
 *
 * ───────────────────────────────────────────────────────────────────────────
 * NOTES
 * ───────────────────────────────────────────────────────────────────────────
 * @note This is a toggle operation - call once to check, call again to uncheck
 * @note Updates the list's updatedAt timestamp
 */
export async function toggleListItem(params) {
  const metadata = {
    timestamp: new Date().toISOString(),
    function: 'toggleListItem'
  };

  if (!params.instanceId || !params.listId || !params.itemId) {
    return {
      success: false,
      error: {
        code: 'MISSING_PARAMETER',
        message: 'instanceId, listId, and itemId are required'
      },
      metadata
    };
  }

  const resolved = await resolveTargetInstance(params, metadata);
  if (!resolved.success) {
    return { success: false, error: resolved.error, metadata };
  }

  const effectiveId = resolved.effectiveInstanceId;
  const listsFile = getListsFile(effectiveId);
  const listsData = await initializeLists(effectiveId);

  const listIndex = listsData.lists.findIndex(l => l.id === params.listId);
  if (listIndex === -1) {
    return {
      success: false,
      error: { code: 'LIST_NOT_FOUND', message: `List ${params.listId} not found` },
      metadata
    };
  }

  const itemIndex = listsData.lists[listIndex].items.findIndex(i => i.id === params.itemId);
  if (itemIndex === -1) {
    return {
      success: false,
      error: { code: 'ITEM_NOT_FOUND', message: `Item ${params.itemId} not found` },
      metadata
    };
  }

  const now = new Date().toISOString();
  listsData.lists[listIndex].items[itemIndex].checked =
    !listsData.lists[listIndex].items[itemIndex].checked;
  listsData.lists[listIndex].updatedAt = now;
  listsData.last_updated = now;

  await writeJSON(listsFile, listsData);

  const updatedItem = listsData.lists[listIndex].items[itemIndex];

  return {
    success: true,
    item: updatedItem,
    listId: params.listId,
    targetInstance: params.targetInstanceId || null,
    message: `Item ${updatedItem.checked ? 'checked' : 'unchecked'}`,
    metadata
  };
}

/**
 * @hacs-endpoint
 * @template-version 1.0.0
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │ RENAME_LIST                                                             │
 * │ Change the name of an existing list                                     │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * @tool rename_list
 * @version 1.0.0
 * @since 2025-12-12
 * @category lists
 * @status stable
 *
 * ───────────────────────────────────────────────────────────────────────────
 * DESCRIPTION
 * ───────────────────────────────────────────────────────────────────────────
 * @description
 * Renames an existing list. The list ID and all items remain unchanged; only
 * the display name is updated.
 *
 * Use this endpoint to update list names when their purpose changes or to
 * correct typos.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * PARAMETERS
 * ───────────────────────────────────────────────────────────────────────────
 * @param {string} instanceId - Caller's instance ID [required]
 *   @source Your instanceId is returned from bootstrap response, or recover via
 *           lookup_identity. Available in your preferences after bootstrapping.
 *
 * @param {string} listId - ID of the list to rename [required]
 *   @source Get listId from get_lists response (the .id field of each list).
 *   @validate Format: list-xxxxxxxx
 *
 * @param {string} name - New name for the list [required]
 *   @source Provide the new display name for the list.
 *   @validate Non-empty string
 *
 * @param {string} targetInstanceId - Target instance for Executive access [optional]
 *   @source Use get_all_instances to find Executive instanceIds. Only PM, COO,
 *           and PA roles can access Executive's lists.
 *   @default null (operates on caller's own lists)
 *
 * ───────────────────────────────────────────────────────────────────────────
 * RETURNS
 * ───────────────────────────────────────────────────────────────────────────
 * @returns {object} RenameListResponse
 * @returns {boolean} .success - Whether the call succeeded
 * @returns {object} .list - Summary of the renamed list
 * @returns {string} .list.id - List identifier (unchanged)
 * @returns {string} .list.name - New list name
 * @returns {string} .list.oldName - Previous list name
 * @returns {string|null} .targetInstance - Target instanceId if specified
 * @returns {string} .message - Confirmation message with old and new names
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
 * @error MISSING_PARAMETER - instanceId, listId, or name not provided
 *   @recover Include all three required parameters in your request.
 *
 * @error INVALID_INSTANCE_ID - Caller instance not found
 *   @recover Verify your instanceId is correct. If new, call bootstrap first.
 *
 * @error INVALID_TARGET - Target instance not found
 *   @recover Verify the targetInstanceId exists using get_all_instances.
 *
 * @error UNAUTHORIZED - Caller cannot access target's lists
 *   @recover Only PM, COO, and PA roles can access Executive's lists.
 *
 * @error LIST_NOT_FOUND - No list with the specified ID exists
 *   @recover Call get_lists to see available lists and their IDs.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * EXAMPLES
 * ───────────────────────────────────────────────────────────────────────────
 * @example Rename own list
 * {
 *   "instanceId": "Phoenix-k3m7",
 *   "listId": "list-abc12345",
 *   "name": "Weekly Tasks"
 * }
 *
 * @example Rename Executive's list (as PA/PM/COO)
 * {
 *   "instanceId": "Genevieve-001",
 *   "listId": "list-abc12345",
 *   "name": "Priority Items Q1",
 *   "targetInstanceId": "Lupo-000"
 * }
 *
 * ───────────────────────────────────────────────────────────────────────────
 * RELATED
 * ───────────────────────────────────────────────────────────────────────────
 * @see get_lists - Get all lists to find listId
 * @see create_list - Create a new list
 * @see delete_list - Remove a list entirely
 *
 * ───────────────────────────────────────────────────────────────────────────
 * NOTES
 * ───────────────────────────────────────────────────────────────────────────
 * @note List ID remains the same after renaming
 * @note All items are preserved during rename
 * @note Updates the list's updatedAt timestamp
 */
export async function renameList(params) {
  const metadata = {
    timestamp: new Date().toISOString(),
    function: 'renameList'
  };

  if (!params.instanceId || !params.listId || !params.name) {
    return {
      success: false,
      error: {
        code: 'MISSING_PARAMETER',
        message: 'instanceId, listId, and name are required'
      },
      metadata
    };
  }

  const resolved = await resolveTargetInstance(params, metadata);
  if (!resolved.success) {
    return { success: false, error: resolved.error, metadata };
  }

  const effectiveId = resolved.effectiveInstanceId;
  const listsFile = getListsFile(effectiveId);
  const listsData = await initializeLists(effectiveId);

  const listIndex = listsData.lists.findIndex(l => l.id === params.listId);
  if (listIndex === -1) {
    return {
      success: false,
      error: { code: 'LIST_NOT_FOUND', message: `List ${params.listId} not found` },
      metadata
    };
  }

  const oldName = listsData.lists[listIndex].name;
  const now = new Date().toISOString();

  listsData.lists[listIndex].name = params.name;
  listsData.lists[listIndex].updatedAt = now;
  listsData.last_updated = now;

  await writeJSON(listsFile, listsData);

  return {
    success: true,
    list: {
      id: params.listId,
      name: params.name,
      oldName
    },
    targetInstance: params.targetInstanceId || null,
    message: `List renamed from '${oldName}' to '${params.name}'`,
    metadata
  };
}

/**
 * @hacs-endpoint
 * @template-version 1.0.0
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │ DELETE_LIST_ITEM                                                        │
 * │ Remove an item from a list permanently                                  │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * @tool delete_list_item
 * @version 1.0.0
 * @since 2025-12-12
 * @category lists
 * @status stable
 *
 * ───────────────────────────────────────────────────────────────────────────
 * DESCRIPTION
 * ───────────────────────────────────────────────────────────────────────────
 * @description
 * Permanently removes an item from a list. This action cannot be undone.
 *
 * Use this endpoint to remove items that are no longer needed, rather than
 * just marking them as checked.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * PARAMETERS
 * ───────────────────────────────────────────────────────────────────────────
 * @param {string} instanceId - Caller's instance ID [required]
 *   @source Your instanceId is returned from bootstrap response, or recover via
 *           lookup_identity. Available in your preferences after bootstrapping.
 *
 * @param {string} listId - ID of the list containing the item [required]
 *   @source Get listId from get_lists response (the .id field of each list).
 *   @validate Format: list-xxxxxxxx
 *
 * @param {string} itemId - ID of the item to delete [required]
 *   @source Get itemId from get_list response (the .items[].id field).
 *   @validate Format: item-xxxxxxxx
 *
 * @param {string} targetInstanceId - Target instance for Executive access [optional]
 *   @source Use get_all_instances to find Executive instanceIds. Only PM, COO,
 *           and PA roles can access Executive's lists.
 *   @default null (operates on caller's own lists)
 *
 * ───────────────────────────────────────────────────────────────────────────
 * RETURNS
 * ───────────────────────────────────────────────────────────────────────────
 * @returns {object} DeleteListItemResponse
 * @returns {boolean} .success - Whether the call succeeded
 * @returns {object} .deletedItem - The item that was deleted
 * @returns {string} .deletedItem.id - Item identifier
 * @returns {string} .deletedItem.text - Item text content
 * @returns {boolean} .deletedItem.checked - Item's checked state when deleted
 * @returns {string} .deletedItem.createdAt - ISO timestamp of item creation
 * @returns {string} .listId - ID of the list the item was deleted from
 * @returns {string|null} .targetInstance - Target instanceId if specified
 * @returns {string} .message - Confirmation message
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
 * @error MISSING_PARAMETER - instanceId, listId, or itemId not provided
 *   @recover Include all three required parameters in your request.
 *
 * @error INVALID_INSTANCE_ID - Caller instance not found
 *   @recover Verify your instanceId is correct. If new, call bootstrap first.
 *
 * @error INVALID_TARGET - Target instance not found
 *   @recover Verify the targetInstanceId exists using get_all_instances.
 *
 * @error UNAUTHORIZED - Caller cannot access target's lists
 *   @recover Only PM, COO, and PA roles can access Executive's lists.
 *
 * @error LIST_NOT_FOUND - No list with the specified ID exists
 *   @recover Call get_lists to see available lists and their IDs.
 *
 * @error ITEM_NOT_FOUND - No item with the specified ID exists in this list
 *   @recover Call get_list to see all items and their IDs.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * EXAMPLES
 * ───────────────────────────────────────────────────────────────────────────
 * @example Delete item from own list
 * {
 *   "instanceId": "Phoenix-k3m7",
 *   "listId": "list-abc12345",
 *   "itemId": "item-xyz98765"
 * }
 *
 * @example Delete item from Executive's list (as PA/PM/COO)
 * {
 *   "instanceId": "Genevieve-001",
 *   "listId": "list-abc12345",
 *   "itemId": "item-xyz98765",
 *   "targetInstanceId": "Lupo-000"
 * }
 *
 * ───────────────────────────────────────────────────────────────────────────
 * RELATED
 * ───────────────────────────────────────────────────────────────────────────
 * @see get_list - Get all items to find itemId
 * @see toggle_list_item - Mark items complete instead of deleting
 * @see delete_list - Delete the entire list
 *
 * ───────────────────────────────────────────────────────────────────────────
 * NOTES
 * ───────────────────────────────────────────────────────────────────────────
 * @note Deletion is permanent - consider toggling checked state instead
 * @note Returns the deleted item data in the response
 * @note Updates the list's updatedAt timestamp
 */
export async function deleteListItem(params) {
  const metadata = {
    timestamp: new Date().toISOString(),
    function: 'deleteListItem'
  };

  if (!params.instanceId || !params.listId || !params.itemId) {
    return {
      success: false,
      error: {
        code: 'MISSING_PARAMETER',
        message: 'instanceId, listId, and itemId are required'
      },
      metadata
    };
  }

  const resolved = await resolveTargetInstance(params, metadata);
  if (!resolved.success) {
    return { success: false, error: resolved.error, metadata };
  }

  const effectiveId = resolved.effectiveInstanceId;
  const listsFile = getListsFile(effectiveId);
  const listsData = await initializeLists(effectiveId);

  const listIndex = listsData.lists.findIndex(l => l.id === params.listId);
  if (listIndex === -1) {
    return {
      success: false,
      error: { code: 'LIST_NOT_FOUND', message: `List ${params.listId} not found` },
      metadata
    };
  }

  const itemIndex = listsData.lists[listIndex].items.findIndex(i => i.id === params.itemId);
  if (itemIndex === -1) {
    return {
      success: false,
      error: { code: 'ITEM_NOT_FOUND', message: `Item ${params.itemId} not found` },
      metadata
    };
  }

  const deletedItem = listsData.lists[listIndex].items[itemIndex];
  listsData.lists[listIndex].items.splice(itemIndex, 1);

  const now = new Date().toISOString();
  listsData.lists[listIndex].updatedAt = now;
  listsData.last_updated = now;

  await writeJSON(listsFile, listsData);

  return {
    success: true,
    deletedItem,
    listId: params.listId,
    targetInstance: params.targetInstanceId || null,
    message: 'Item deleted',
    metadata
  };
}

/**
 * @hacs-endpoint
 * @template-version 1.0.0
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │ DELETE_LIST                                                             │
 * │ Delete an entire list and all its items permanently                     │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * @tool delete_list
 * @version 1.0.0
 * @since 2025-12-12
 * @category lists
 * @status stable
 *
 * ───────────────────────────────────────────────────────────────────────────
 * DESCRIPTION
 * ───────────────────────────────────────────────────────────────────────────
 * @description
 * Permanently deletes an entire list including all its items. This action
 * cannot be undone.
 *
 * Use this endpoint when a list is no longer needed and you want to remove
 * it completely from your lists collection.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * PARAMETERS
 * ───────────────────────────────────────────────────────────────────────────
 * @param {string} instanceId - Caller's instance ID [required]
 *   @source Your instanceId is returned from bootstrap response, or recover via
 *           lookup_identity. Available in your preferences after bootstrapping.
 *
 * @param {string} listId - ID of the list to delete [required]
 *   @source Get listId from get_lists response (the .id field of each list).
 *   @validate Format: list-xxxxxxxx
 *
 * @param {string} targetInstanceId - Target instance for Executive access [optional]
 *   @source Use get_all_instances to find Executive instanceIds. Only PM, COO,
 *           and PA roles can access Executive's lists.
 *   @default null (operates on caller's own lists)
 *
 * ───────────────────────────────────────────────────────────────────────────
 * RETURNS
 * ───────────────────────────────────────────────────────────────────────────
 * @returns {object} DeleteListResponse
 * @returns {boolean} .success - Whether the call succeeded
 * @returns {object} .deletedList - Summary of the deleted list
 * @returns {string} .deletedList.id - List identifier
 * @returns {string} .deletedList.name - List name
 * @returns {number} .deletedList.itemCount - Number of items that were in the list
 * @returns {string|null} .targetInstance - Target instanceId if specified
 * @returns {string} .message - Confirmation message with list name
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
 * @error MISSING_PARAMETER - instanceId or listId not provided
 *   @recover Include both required parameters in your request.
 *
 * @error INVALID_INSTANCE_ID - Caller instance not found
 *   @recover Verify your instanceId is correct. If new, call bootstrap first.
 *
 * @error INVALID_TARGET - Target instance not found
 *   @recover Verify the targetInstanceId exists using get_all_instances.
 *
 * @error UNAUTHORIZED - Caller cannot access target's lists
 *   @recover Only PM, COO, and PA roles can access Executive's lists.
 *
 * @error LIST_NOT_FOUND - No list with the specified ID exists
 *   @recover Call get_lists to see available lists and their IDs.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * EXAMPLES
 * ───────────────────────────────────────────────────────────────────────────
 * @example Delete own list
 * {
 *   "instanceId": "Phoenix-k3m7",
 *   "listId": "list-abc12345"
 * }
 *
 * @example Delete Executive's list (as PA/PM/COO)
 * {
 *   "instanceId": "Genevieve-001",
 *   "listId": "list-abc12345",
 *   "targetInstanceId": "Lupo-000"
 * }
 *
 * ───────────────────────────────────────────────────────────────────────────
 * RELATED
 * ───────────────────────────────────────────────────────────────────────────
 * @see get_lists - Get all lists to find listId
 * @see delete_list_item - Delete individual items instead
 * @see rename_list - Rename a list instead of deleting
 * @see create_list - Create a new list
 *
 * ───────────────────────────────────────────────────────────────────────────
 * NOTES
 * ───────────────────────────────────────────────────────────────────────────
 * @note Deletion is permanent and cannot be undone
 * @note All items in the list are deleted along with the list
 * @note Returns summary of deleted list (id, name, itemCount)
 */
export async function deleteList(params) {
  const metadata = {
    timestamp: new Date().toISOString(),
    function: 'deleteList'
  };

  if (!params.instanceId || !params.listId) {
    return {
      success: false,
      error: {
        code: 'MISSING_PARAMETER',
        message: 'instanceId and listId are required'
      },
      metadata
    };
  }

  const resolved = await resolveTargetInstance(params, metadata);
  if (!resolved.success) {
    return { success: false, error: resolved.error, metadata };
  }

  const effectiveId = resolved.effectiveInstanceId;
  const listsFile = getListsFile(effectiveId);
  const listsData = await initializeLists(effectiveId);

  const listIndex = listsData.lists.findIndex(l => l.id === params.listId);
  if (listIndex === -1) {
    return {
      success: false,
      error: { code: 'LIST_NOT_FOUND', message: `List ${params.listId} not found` },
      metadata
    };
  }

  const deletedList = listsData.lists[listIndex];
  listsData.lists.splice(listIndex, 1);
  listsData.last_updated = new Date().toISOString();

  await writeJSON(listsFile, listsData);

  return {
    success: true,
    deletedList: {
      id: deletedList.id,
      name: deletedList.name,
      itemCount: deletedList.items.length
    },
    targetInstance: params.targetInstanceId || null,
    message: `List '${deletedList.name}' deleted`,
    metadata
  };
}
