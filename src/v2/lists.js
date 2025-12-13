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
 * Create a new list
 *
 * @param {Object} params - Parameters
 * @param {string} params.instanceId - Caller's instance ID (required)
 * @param {string} params.name - List name (required)
 * @param {string} [params.description] - List description
 * @param {string} [params.targetInstanceId] - Target instance for Executive access
 * @returns {Promise<Object>} Result with created list
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
 * Get all lists (summaries without items)
 *
 * @param {Object} params - Parameters
 * @param {string} params.instanceId - Caller's instance ID (required)
 * @param {string} [params.targetInstanceId] - Target instance for Executive access
 * @returns {Promise<Object>} Result with list summaries
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
 * Get a specific list with all items
 *
 * @param {Object} params - Parameters
 * @param {string} params.instanceId - Caller's instance ID (required)
 * @param {string} params.listId - List ID (required)
 * @param {string} [params.targetInstanceId] - Target instance for Executive access
 * @returns {Promise<Object>} Result with full list and items
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
 * Add an item to a list
 *
 * @param {Object} params - Parameters
 * @param {string} params.instanceId - Caller's instance ID (required)
 * @param {string} params.listId - List ID (required)
 * @param {string} params.text - Item text (required)
 * @param {string} [params.targetInstanceId] - Target instance for Executive access
 * @returns {Promise<Object>} Result with new item
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
 * Toggle an item's checked state
 *
 * @param {Object} params - Parameters
 * @param {string} params.instanceId - Caller's instance ID (required)
 * @param {string} params.listId - List ID (required)
 * @param {string} params.itemId - Item ID (required)
 * @param {string} [params.targetInstanceId] - Target instance for Executive access
 * @returns {Promise<Object>} Result with updated item
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
 * Rename a list
 *
 * @param {Object} params - Parameters
 * @param {string} params.instanceId - Caller's instance ID (required)
 * @param {string} params.listId - List ID (required)
 * @param {string} params.name - New list name (required)
 * @param {string} [params.targetInstanceId] - Target instance for Executive access
 * @returns {Promise<Object>} Result with updated list
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
 * Delete an item from a list
 *
 * @param {Object} params - Parameters
 * @param {string} params.instanceId - Caller's instance ID (required)
 * @param {string} params.listId - List ID (required)
 * @param {string} params.itemId - Item ID (required)
 * @param {string} [params.targetInstanceId] - Target instance for Executive access
 * @returns {Promise<Object>} Result
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
 * Delete a list entirely
 *
 * @param {Object} params - Parameters
 * @param {string} params.instanceId - Caller's instance ID (required)
 * @param {string} params.listId - List ID (required)
 * @param {string} [params.targetInstanceId] - Target instance for Executive access
 * @returns {Promise<Object>} Result
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
