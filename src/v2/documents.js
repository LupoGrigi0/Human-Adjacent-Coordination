/**
 * Documents module for V2 coordination system
 * Foundational type for document management across instances, projects, roles, personalities
 *
 * @module documents
 * @author Crossing (Integration Engineer)
 * @created 2026-01-18
 */

import fs from 'fs/promises';
import path from 'path';
import {
  getInstanceDir,
  getProjectDir,
  getRoleDir,
  getPersonalityDir
} from './config.js';
import {
  readPreferences,
  writePreferences
} from './data.js';

// ═══════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════

const TARGET_TYPES = {
  INSTANCE: 'instance',
  PROJECT: 'project',
  ROLE: 'role',
  PERSONALITY: 'personality'
};

const ARCHIVE_DIR = '_archive';
const DEFAULT_EXTENSION = '.md';

// Roles that can access any documents
const PRIVILEGED_ROLES = ['COO', 'Executive'];
// Roles that can modify role/personality documents
const ADMIN_ROLES = ['COO', 'PA', 'Executive'];

// ═══════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Parse target string like "project:paula-book" or "instance:Crossing-2d23"
 * @param {string} target - Target string with type:id format
 * @returns {object} Parsed target { type, id } or { error }
 */
function parseTarget(target) {
  if (!target) return null;

  const colonIndex = target.indexOf(':');
  if (colonIndex === -1) {
    return { error: `Invalid target format: ${target}. Expected "type:id" (e.g., "project:paula-book")` };
  }

  const type = target.substring(0, colonIndex);
  const id = target.substring(colonIndex + 1);

  if (!id) {
    return { error: `Missing target ID in: ${target}` };
  }

  if (!Object.values(TARGET_TYPES).includes(type)) {
    return { error: `Invalid target type: ${type}. Valid types: ${Object.values(TARGET_TYPES).join(', ')}` };
  }

  return { type, id };
}

/**
 * Get base directory for a target type
 * @param {string} type - Target type
 * @param {string} id - Target ID
 * @returns {string} Base directory path
 */
function getTargetBaseDir(type, id) {
  switch (type) {
    case TARGET_TYPES.INSTANCE:
      return getInstanceDir(id);
    case TARGET_TYPES.PROJECT:
      return getProjectDir(id);
    case TARGET_TYPES.ROLE:
      return getRoleDir(id);
    case TARGET_TYPES.PERSONALITY:
      return getPersonalityDir(id);
    default:
      return null;
  }
}

/**
 * Resolve target to working directory and context
 * @param {string} callerInstanceId - Caller's instance ID
 * @param {string} target - Optional target string
 * @returns {object} Context with workingDir, type, id, callerPrefs
 */
async function resolveDocumentContext(callerInstanceId, target) {
  console.log(`[DOCUMENTS] resolveDocumentContext: caller=${callerInstanceId}, target=${target || '(self)'}`);

  // Validate caller
  const callerPrefs = await readPreferences(callerInstanceId);
  if (!callerPrefs) {
    console.log(`[DOCUMENTS] ERROR: Caller instance not found: ${callerInstanceId}`);
    return {
      success: false,
      error: {
        code: 'INVALID_CALLER',
        message: `Instance "${callerInstanceId}" not found`,
        suggestion: 'Verify your instanceId is correct or call bootstrap first'
      }
    };
  }

  // Default to caller's own documents if no target
  if (!target) {
    const baseDir = getInstanceDir(callerInstanceId);
    const workingDir = path.join(baseDir, 'documents');
    console.log(`[DOCUMENTS] Defaulting to self: ${workingDir}`);
    return {
      success: true,
      workingDir,
      archiveDir: path.join(workingDir, ARCHIVE_DIR),
      type: TARGET_TYPES.INSTANCE,
      id: callerInstanceId,
      callerPrefs,
      isSelf: true
    };
  }

  // Parse target
  const parsed = parseTarget(target);
  if (parsed.error) {
    console.log(`[DOCUMENTS] ERROR: ${parsed.error}`);
    return {
      success: false,
      error: {
        code: 'INVALID_TARGET',
        message: parsed.error,
        suggestion: 'Use format "type:id" where type is instance, project, role, or personality'
      }
    };
  }

  // Verify target exists
  const baseDir = getTargetBaseDir(parsed.type, parsed.id);
  const prefsPath = path.join(baseDir, 'preferences.json');

  try {
    await fs.access(prefsPath);
  } catch (err) {
    console.log(`[DOCUMENTS] ERROR: Target not found: ${target}`);
    return {
      success: false,
      error: {
        code: 'TARGET_NOT_FOUND',
        message: `${parsed.type} "${parsed.id}" not found`,
        suggestion: `Verify the ${parsed.type} ID is correct`
      }
    };
  }

  const workingDir = path.join(baseDir, 'documents');
  console.log(`[DOCUMENTS] Resolved target: ${workingDir}`);

  return {
    success: true,
    workingDir,
    archiveDir: path.join(workingDir, ARCHIVE_DIR),
    type: parsed.type,
    id: parsed.id,
    callerPrefs,
    isSelf: parsed.type === TARGET_TYPES.INSTANCE && parsed.id === callerInstanceId
  };
}

/**
 * Check if caller has permission for operation on target
 * @param {object} context - Resolved document context
 * @param {string} operation - Operation name (create, read, edit, etc.)
 * @returns {object} { allowed: boolean, reason?: string }
 */
async function checkDocumentPermission(context, operation) {
  const { callerPrefs, type, id, isSelf } = context;
  const callerRole = callerPrefs.role;
  const callerId = callerPrefs.instanceId || callerPrefs.id;

  console.log(`[DOCUMENTS] checkPermission: caller=${callerId}, role=${callerRole}, target=${type}:${id}, op=${operation}, isSelf=${isSelf}`);

  // Self operations always allowed
  if (isSelf) {
    console.log(`[DOCUMENTS] Permission GRANTED: self access`);
    return { allowed: true };
  }

  // Read operations on projects are generally allowed (non-PERSONAL docs - V2 feature)
  if (operation === 'read' && type === TARGET_TYPES.PROJECT) {
    console.log(`[DOCUMENTS] Permission GRANTED: project read allowed`);
    return { allowed: true };
  }

  // List operations on projects are generally allowed
  if ((operation === 'list' || operation === 'list_archive') && type === TARGET_TYPES.PROJECT) {
    console.log(`[DOCUMENTS] Permission GRANTED: project list allowed`);
    return { allowed: true };
  }

  // Privileged roles (COO, Executive) can modify any project/instance documents
  if (PRIVILEGED_ROLES.includes(callerRole)) {
    console.log(`[DOCUMENTS] Permission GRANTED: privileged role ${callerRole}`);
    return { allowed: true };
  }

  // PM can modify their own project's documents
  if (callerRole === 'PM' && type === TARGET_TYPES.PROJECT) {
    if (callerPrefs.project === id) {
      console.log(`[DOCUMENTS] Permission GRANTED: PM on own project`);
      return { allowed: true };
    }
  }

  // PA can modify role/personality documents
  if (type === TARGET_TYPES.ROLE || type === TARGET_TYPES.PERSONALITY) {
    if (ADMIN_ROLES.includes(callerRole)) {
      console.log(`[DOCUMENTS] Permission GRANTED: admin role for ${type}`);
      return { allowed: true };
    }
    console.log(`[DOCUMENTS] Permission DENIED: ${type} modification requires ${ADMIN_ROLES.join('/')}`);
    return {
      allowed: false,
      reason: `Only ${ADMIN_ROLES.join('/')} can modify ${type} documents`
    };
  }

  // Instance documents of others require privilege
  if (type === TARGET_TYPES.INSTANCE) {
    console.log(`[DOCUMENTS] Permission DENIED: cannot access other instance documents`);
    return {
      allowed: false,
      reason: 'Cannot access other instance\'s documents without privileged role'
    };
  }

  console.log(`[DOCUMENTS] Permission DENIED: insufficient permissions`);
  return {
    allowed: false,
    reason: 'Insufficient permissions for this operation'
  };
}

/**
 * Ensure document name has extension (defaults to .md)
 * @param {string} name - Document name
 * @returns {string} Name with extension
 */
function ensureExtension(name) {
  if (!name.includes('.')) {
    return name + DEFAULT_EXTENSION;
  }
  return name;
}

/**
 * Create standard metadata for response
 * @param {string} functionName - API function name
 * @returns {object} Metadata object
 */
function createMetadata(functionName) {
  return {
    timestamp: new Date().toISOString(),
    function: functionName
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// DOCUMENT OPERATIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * @hacs-endpoint
 * @tool create_document
 * @version 1.0.0
 * @category documents
 * @status stable
 *
 * @description
 * Creates a new document in the target location. If no target is specified,
 * creates in the caller's own documents directory. Document names default
 * to .md extension if none provided.
 *
 * @param {string} instanceId - Caller's instance ID [required]
 * @param {string} name - Document name (e.g., "my-notes" or "my-notes.md") [required]
 * @param {string} content - Initial document content [required]
 * @param {string} target - Target location (e.g., "project:paula-book") [optional]
 *
 * @returns {object} { success, documentPath, name, target, metadata }
 *
 * @error MISSING_PARAMETERS - Required parameters not provided
 * @error INVALID_CALLER - Caller instance not found
 * @error INVALID_TARGET - Target format invalid or target not found
 * @error PERMISSION_DENIED - Caller lacks permission for this operation
 * @error DOCUMENT_EXISTS - Document already exists at this path
 */
export async function createDocument(params) {
  const metadata = createMetadata('createDocument');
  console.log(`[DOCUMENTS] createDocument called:`, JSON.stringify(params, null, 2));

  // Validate required params
  if (!params.instanceId) {
    return { success: false, error: { code: 'MISSING_PARAMETERS', message: 'instanceId is required' }, metadata };
  }
  if (!params.name) {
    return { success: false, error: { code: 'MISSING_PARAMETERS', message: 'name is required' }, metadata };
  }
  if (params.content === undefined) {
    return { success: false, error: { code: 'MISSING_PARAMETERS', message: 'content is required' }, metadata };
  }

  // Resolve context
  const context = await resolveDocumentContext(params.instanceId, params.target);
  if (!context.success) {
    return { success: false, error: context.error, metadata };
  }

  // Check permission
  const permission = await checkDocumentPermission(context, 'create');
  if (!permission.allowed) {
    return {
      success: false,
      error: { code: 'PERMISSION_DENIED', message: permission.reason },
      metadata
    };
  }

  // Ensure documents directory exists
  await fs.mkdir(context.workingDir, { recursive: true });

  // Build document path
  const docName = ensureExtension(params.name);
  const docPath = path.join(context.workingDir, docName);

  // Check if already exists
  try {
    await fs.access(docPath);
    return {
      success: false,
      error: {
        code: 'DOCUMENT_EXISTS',
        message: `Document "${docName}" already exists`,
        suggestion: 'Use edit_document to modify existing documents or choose a different name'
      },
      metadata
    };
  } catch (err) {
    // Good - document doesn't exist
  }

  // Write document
  await fs.writeFile(docPath, params.content, 'utf8');
  console.log(`[DOCUMENTS] Created: ${docPath}`);

  return {
    success: true,
    documentPath: docPath,
    name: docName,
    target: params.target || `instance:${params.instanceId}`,
    metadata
  };
}

/**
 * @hacs-endpoint
 * @tool read_document
 * @version 1.0.0
 * @category documents
 * @status stable
 *
 * @description
 * Reads a document from the target location. If no target is specified,
 * reads from the caller's own documents directory.
 *
 * @param {string} instanceId - Caller's instance ID [required]
 * @param {string} name - Document name [required]
 * @param {string} target - Target location [optional]
 *
 * @returns {object} { success, content, name, target, metadata }
 *
 * @error DOCUMENT_NOT_FOUND - Document does not exist
 */
export async function readDocument(params) {
  const metadata = createMetadata('readDocument');
  console.log(`[DOCUMENTS] readDocument called:`, JSON.stringify(params, null, 2));

  if (!params.instanceId) {
    return { success: false, error: { code: 'MISSING_PARAMETERS', message: 'instanceId is required' }, metadata };
  }
  if (!params.name) {
    return { success: false, error: { code: 'MISSING_PARAMETERS', message: 'name is required' }, metadata };
  }

  const context = await resolveDocumentContext(params.instanceId, params.target);
  if (!context.success) {
    return { success: false, error: context.error, metadata };
  }

  const permission = await checkDocumentPermission(context, 'read');
  if (!permission.allowed) {
    return { success: false, error: { code: 'PERMISSION_DENIED', message: permission.reason }, metadata };
  }

  const docName = ensureExtension(params.name);
  const docPath = path.join(context.workingDir, docName);

  try {
    const content = await fs.readFile(docPath, 'utf8');
    console.log(`[DOCUMENTS] Read: ${docPath} (${content.length} chars)`);

    return {
      success: true,
      content,
      name: docName,
      target: params.target || `instance:${params.instanceId}`,
      metadata
    };
  } catch (err) {
    return {
      success: false,
      error: {
        code: 'DOCUMENT_NOT_FOUND',
        message: `Document "${docName}" not found`,
        suggestion: 'Use list_documents to see available documents'
      },
      metadata
    };
  }
}

/**
 * @hacs-endpoint
 * @tool edit_document
 * @version 1.0.0
 * @category documents
 * @status stable
 *
 * @description
 * Edits a document. Supports two modes: "append" adds content to the end,
 * "replace" does a search-and-replace using the provided pattern.
 *
 * @param {string} instanceId - Caller's instance ID [required]
 * @param {string} name - Document name [required]
 * @param {string} mode - Edit mode: "append" or "replace" [required]
 * @param {string} content - Content to append (for append mode) [conditional]
 * @param {string} search - Search pattern (for replace mode) [conditional]
 * @param {string} replacement - Replacement text (for replace mode) [conditional]
 * @param {string} target - Target location [optional]
 *
 * @returns {object} { success, name, mode, target, metadata }
 */
export async function editDocument(params) {
  const metadata = createMetadata('editDocument');
  console.log(`[DOCUMENTS] editDocument called:`, JSON.stringify(params, null, 2));

  if (!params.instanceId) {
    return { success: false, error: { code: 'MISSING_PARAMETERS', message: 'instanceId is required' }, metadata };
  }
  if (!params.name) {
    return { success: false, error: { code: 'MISSING_PARAMETERS', message: 'name is required' }, metadata };
  }
  if (!params.mode || !['append', 'replace'].includes(params.mode)) {
    return { success: false, error: { code: 'MISSING_PARAMETERS', message: 'mode must be "append" or "replace"' }, metadata };
  }

  if (params.mode === 'append' && params.content === undefined) {
    return { success: false, error: { code: 'MISSING_PARAMETERS', message: 'content is required for append mode' }, metadata };
  }
  if (params.mode === 'replace' && (params.search === undefined || params.replacement === undefined)) {
    return { success: false, error: { code: 'MISSING_PARAMETERS', message: 'search and replacement are required for replace mode' }, metadata };
  }

  const context = await resolveDocumentContext(params.instanceId, params.target);
  if (!context.success) {
    return { success: false, error: context.error, metadata };
  }

  const permission = await checkDocumentPermission(context, 'edit');
  if (!permission.allowed) {
    return { success: false, error: { code: 'PERMISSION_DENIED', message: permission.reason }, metadata };
  }

  const docName = ensureExtension(params.name);
  const docPath = path.join(context.workingDir, docName);

  try {
    let content = await fs.readFile(docPath, 'utf8');

    if (params.mode === 'append') {
      content = content + params.content;
      console.log(`[DOCUMENTS] Appended ${params.content.length} chars to ${docPath}`);
    } else {
      // Replace mode - use string replace (not regex for safety)
      const beforeLen = content.length;
      content = content.split(params.search).join(params.replacement);
      console.log(`[DOCUMENTS] Replace in ${docPath}: "${params.search}" -> "${params.replacement}"`);
    }

    await fs.writeFile(docPath, content, 'utf8');

    return {
      success: true,
      name: docName,
      mode: params.mode,
      target: params.target || `instance:${params.instanceId}`,
      metadata
    };
  } catch (err) {
    return {
      success: false,
      error: {
        code: 'DOCUMENT_NOT_FOUND',
        message: `Document "${docName}" not found`,
        suggestion: 'Use create_document to create a new document'
      },
      metadata
    };
  }
}

/**
 * @hacs-endpoint
 * @tool rename_document
 * @version 1.0.0
 * @category documents
 * @status stable
 *
 * @description
 * Renames a document.
 *
 * @param {string} instanceId - Caller's instance ID [required]
 * @param {string} name - Current document name [required]
 * @param {string} newName - New document name [required]
 * @param {string} target - Target location [optional]
 *
 * @returns {object} { success, oldName, newName, target, metadata }
 */
export async function renameDocument(params) {
  const metadata = createMetadata('renameDocument');
  console.log(`[DOCUMENTS] renameDocument called:`, JSON.stringify(params, null, 2));

  if (!params.instanceId || !params.name || !params.newName) {
    return { success: false, error: { code: 'MISSING_PARAMETERS', message: 'instanceId, name, and newName are required' }, metadata };
  }

  const context = await resolveDocumentContext(params.instanceId, params.target);
  if (!context.success) {
    return { success: false, error: context.error, metadata };
  }

  const permission = await checkDocumentPermission(context, 'rename');
  if (!permission.allowed) {
    return { success: false, error: { code: 'PERMISSION_DENIED', message: permission.reason }, metadata };
  }

  const oldName = ensureExtension(params.name);
  const newName = ensureExtension(params.newName);
  const oldPath = path.join(context.workingDir, oldName);
  const newPath = path.join(context.workingDir, newName);

  try {
    await fs.access(oldPath);
  } catch (err) {
    return { success: false, error: { code: 'DOCUMENT_NOT_FOUND', message: `Document "${oldName}" not found` }, metadata };
  }

  try {
    await fs.access(newPath);
    return { success: false, error: { code: 'DOCUMENT_EXISTS', message: `Document "${newName}" already exists` }, metadata };
  } catch (err) {
    // Good - new name doesn't exist
  }

  await fs.rename(oldPath, newPath);
  console.log(`[DOCUMENTS] Renamed: ${oldPath} -> ${newPath}`);

  return {
    success: true,
    oldName,
    newName,
    target: params.target || `instance:${params.instanceId}`,
    metadata
  };
}

/**
 * @hacs-endpoint
 * @tool archive_document
 * @version 1.0.0
 * @category documents
 * @status stable
 *
 * @description
 * Moves a document to the _archive subdirectory.
 *
 * @param {string} instanceId - Caller's instance ID [required]
 * @param {string} name - Document name [required]
 * @param {string} target - Target location [optional]
 *
 * @returns {object} { success, name, archivedPath, target, metadata }
 */
export async function archiveDocument(params) {
  const metadata = createMetadata('archiveDocument');
  console.log(`[DOCUMENTS] archiveDocument called:`, JSON.stringify(params, null, 2));

  if (!params.instanceId || !params.name) {
    return { success: false, error: { code: 'MISSING_PARAMETERS', message: 'instanceId and name are required' }, metadata };
  }

  const context = await resolveDocumentContext(params.instanceId, params.target);
  if (!context.success) {
    return { success: false, error: context.error, metadata };
  }

  const permission = await checkDocumentPermission(context, 'archive');
  if (!permission.allowed) {
    return { success: false, error: { code: 'PERMISSION_DENIED', message: permission.reason }, metadata };
  }

  const docName = ensureExtension(params.name);
  const docPath = path.join(context.workingDir, docName);
  const archivePath = path.join(context.archiveDir, docName);

  try {
    await fs.access(docPath);
  } catch (err) {
    return { success: false, error: { code: 'DOCUMENT_NOT_FOUND', message: `Document "${docName}" not found` }, metadata };
  }

  // Create archive directory if needed
  await fs.mkdir(context.archiveDir, { recursive: true });

  // Move to archive
  await fs.rename(docPath, archivePath);
  console.log(`[DOCUMENTS] Archived: ${docPath} -> ${archivePath}`);

  return {
    success: true,
    name: docName,
    archivedPath: archivePath,
    target: params.target || `instance:${params.instanceId}`,
    metadata
  };
}

/**
 * @hacs-endpoint
 * @tool unarchive_document
 * @version 1.0.0
 * @category documents
 * @status stable
 *
 * @description
 * Moves a document from the _archive subdirectory back to the main documents directory.
 *
 * @param {string} instanceId - Caller's instance ID [required]
 * @param {string} name - Document name [required]
 * @param {string} target - Target location [optional]
 *
 * @returns {object} { success, name, restoredPath, target, metadata }
 */
export async function unarchiveDocument(params) {
  const metadata = createMetadata('unarchiveDocument');
  console.log(`[DOCUMENTS] unarchiveDocument called:`, JSON.stringify(params, null, 2));

  if (!params.instanceId || !params.name) {
    return { success: false, error: { code: 'MISSING_PARAMETERS', message: 'instanceId and name are required' }, metadata };
  }

  const context = await resolveDocumentContext(params.instanceId, params.target);
  if (!context.success) {
    return { success: false, error: context.error, metadata };
  }

  const permission = await checkDocumentPermission(context, 'unarchive');
  if (!permission.allowed) {
    return { success: false, error: { code: 'PERMISSION_DENIED', message: permission.reason }, metadata };
  }

  const docName = ensureExtension(params.name);
  const archivePath = path.join(context.archiveDir, docName);
  const docPath = path.join(context.workingDir, docName);

  try {
    await fs.access(archivePath);
  } catch (err) {
    return { success: false, error: { code: 'DOCUMENT_NOT_FOUND', message: `Archived document "${docName}" not found` }, metadata };
  }

  // Check if already exists in main dir
  try {
    await fs.access(docPath);
    return { success: false, error: { code: 'DOCUMENT_EXISTS', message: `Document "${docName}" already exists in main directory` }, metadata };
  } catch (err) {
    // Good
  }

  await fs.rename(archivePath, docPath);
  console.log(`[DOCUMENTS] Unarchived: ${archivePath} -> ${docPath}`);

  return {
    success: true,
    name: docName,
    restoredPath: docPath,
    target: params.target || `instance:${params.instanceId}`,
    metadata
  };
}

/**
 * @hacs-endpoint
 * @tool list_documents
 * @version 1.0.0
 * @category documents
 * @status stable
 *
 * @description
 * Lists documents in the target location's main documents directory.
 *
 * @param {string} instanceId - Caller's instance ID [required]
 * @param {string} target - Target location [optional]
 *
 * @returns {object} { success, documents[], target, metadata }
 */
export async function listDocuments(params) {
  const metadata = createMetadata('listDocuments');
  console.log(`[DOCUMENTS] listDocuments called:`, JSON.stringify(params, null, 2));

  if (!params.instanceId) {
    return { success: false, error: { code: 'MISSING_PARAMETERS', message: 'instanceId is required' }, metadata };
  }

  const context = await resolveDocumentContext(params.instanceId, params.target);
  if (!context.success) {
    return { success: false, error: context.error, metadata };
  }

  const permission = await checkDocumentPermission(context, 'list');
  if (!permission.allowed) {
    return { success: false, error: { code: 'PERMISSION_DENIED', message: permission.reason }, metadata };
  }

  let documents = [];
  try {
    const entries = await fs.readdir(context.workingDir, { withFileTypes: true });
    documents = entries
      .filter(e => e.isFile())
      .map(e => e.name)
      .sort();
  } catch (err) {
    // Directory doesn't exist - return empty list
  }

  // For projects: also include .md files from project root (PROJECT_VISION.md, etc. live there)
  if (context.type === 'project') {
    try {
      const projectRoot = path.dirname(context.workingDir);
      const rootEntries = await fs.readdir(projectRoot, { withFileTypes: true });
      const rootDocs = rootEntries
        .filter(e => e.isFile() && e.name.endsWith('.md'))
        .map(e => e.name);
      const docSet = new Set(documents);
      rootDocs.forEach(d => { if (!docSet.has(d)) documents.push(d); });
      documents.sort();
    } catch (_err) { /* ignore */ }
  }

  console.log(`[DOCUMENTS] Listed ${documents.length} documents in ${context.workingDir}`);

  return {
    success: true,
    documents,
    count: documents.length,
    target: params.target || `instance:${params.instanceId}`,
    metadata
  };
}

/**
 * @hacs-endpoint
 * @tool list_archive
 * @version 1.0.0
 * @category documents
 * @status stable
 *
 * @description
 * Lists documents in the target location's archive directory.
 *
 * @param {string} instanceId - Caller's instance ID [required]
 * @param {string} target - Target location [optional]
 *
 * @returns {object} { success, documents[], target, metadata }
 */
export async function listArchive(params) {
  const metadata = createMetadata('listArchive');
  console.log(`[DOCUMENTS] listArchive called:`, JSON.stringify(params, null, 2));

  if (!params.instanceId) {
    return { success: false, error: { code: 'MISSING_PARAMETERS', message: 'instanceId is required' }, metadata };
  }

  const context = await resolveDocumentContext(params.instanceId, params.target);
  if (!context.success) {
    return { success: false, error: context.error, metadata };
  }

  const permission = await checkDocumentPermission(context, 'list_archive');
  if (!permission.allowed) {
    return { success: false, error: { code: 'PERMISSION_DENIED', message: permission.reason }, metadata };
  }

  let documents = [];
  try {
    const entries = await fs.readdir(context.archiveDir, { withFileTypes: true });
    documents = entries
      .filter(e => e.isFile())
      .map(e => e.name)
      .sort();
  } catch (err) {
    // Archive doesn't exist - return empty list
  }

  console.log(`[DOCUMENTS] Listed ${documents.length} archived documents`);

  return {
    success: true,
    documents,
    count: documents.length,
    target: params.target || `instance:${params.instanceId}`,
    metadata
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// VITAL DOCUMENTS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * @hacs-endpoint
 * @tool list_vital_documents
 * @version 1.0.0
 * @category documents
 * @status stable
 *
 * @description
 * Lists vital documents for the target. Vital documents are sent first
 * during recover_context, before the diary.
 *
 * @param {string} instanceId - Caller's instance ID [required]
 * @param {string} target - Target location [optional]
 *
 * @returns {object} { success, vitalDocuments[], target, metadata }
 */
export async function listVitalDocuments(params) {
  const metadata = createMetadata('listVitalDocuments');
  console.log(`[DOCUMENTS] listVitalDocuments called:`, JSON.stringify(params, null, 2));

  if (!params.instanceId) {
    return { success: false, error: { code: 'MISSING_PARAMETERS', message: 'instanceId is required' }, metadata };
  }

  const context = await resolveDocumentContext(params.instanceId, params.target);
  if (!context.success) {
    return { success: false, error: context.error, metadata };
  }

  // Read target's preferences to get vital documents list
  let targetPrefs;
  if (context.type === TARGET_TYPES.INSTANCE) {
    targetPrefs = await readPreferences(context.id);
  } else {
    const prefsPath = path.join(getTargetBaseDir(context.type, context.id), 'preferences.json');
    try {
      const content = await fs.readFile(prefsPath, 'utf8');
      targetPrefs = JSON.parse(content);
    } catch (err) {
      targetPrefs = {};
    }
  }

  const vitalDocuments = targetPrefs.vitalDocuments || [];

  return {
    success: true,
    vitalDocuments,
    count: vitalDocuments.length,
    target: params.target || `instance:${params.instanceId}`,
    metadata
  };
}

/**
 * @hacs-endpoint
 * @tool add_to_vital
 * @version 1.0.0
 * @category documents
 * @status stable
 *
 * @description
 * Adds a document to the vital documents list. The document must exist
 * in the target's documents directory.
 *
 * @param {string} instanceId - Caller's instance ID [required]
 * @param {string} name - Document name to add [required]
 * @param {string} target - Target location [optional]
 *
 * @returns {object} { success, name, vitalDocuments[], target, metadata }
 */
export async function addToVital(params) {
  const metadata = createMetadata('addToVital');
  console.log(`[DOCUMENTS] addToVital called:`, JSON.stringify(params, null, 2));

  if (!params.instanceId || !params.name) {
    return { success: false, error: { code: 'MISSING_PARAMETERS', message: 'instanceId and name are required' }, metadata };
  }

  const context = await resolveDocumentContext(params.instanceId, params.target);
  if (!context.success) {
    return { success: false, error: context.error, metadata };
  }

  const permission = await checkDocumentPermission(context, 'add_to_vital');
  if (!permission.allowed) {
    return { success: false, error: { code: 'PERMISSION_DENIED', message: permission.reason }, metadata };
  }

  const docName = ensureExtension(params.name);
  const docPath = path.join(context.workingDir, docName);

  // Verify document exists
  try {
    await fs.access(docPath);
  } catch (err) {
    return { success: false, error: { code: 'DOCUMENT_NOT_FOUND', message: `Document "${docName}" not found. Document must exist before adding to vital.` }, metadata };
  }

  // Get target's preferences
  const baseDir = getTargetBaseDir(context.type, context.id);
  const prefsPath = path.join(baseDir, 'preferences.json');

  let prefs;
  try {
    const content = await fs.readFile(prefsPath, 'utf8');
    prefs = JSON.parse(content);
  } catch (err) {
    prefs = {};
  }

  // Add to vital documents
  if (!prefs.vitalDocuments) {
    prefs.vitalDocuments = [];
  }

  if (prefs.vitalDocuments.includes(docName)) {
    return {
      success: false,
      error: { code: 'ALREADY_VITAL', message: `Document "${docName}" is already in vital documents` },
      metadata
    };
  }

  prefs.vitalDocuments.push(docName);
  await fs.writeFile(prefsPath, JSON.stringify(prefs, null, 2), 'utf8');
  console.log(`[DOCUMENTS] Added "${docName}" to vital documents`);

  return {
    success: true,
    name: docName,
    vitalDocuments: prefs.vitalDocuments,
    target: params.target || `instance:${params.instanceId}`,
    metadata
  };
}

/**
 * @hacs-endpoint
 * @tool remove_from_vital
 * @version 1.0.0
 * @category documents
 * @status stable
 *
 * @description
 * Removes a document from the vital documents list. Does not delete the document itself.
 *
 * @param {string} instanceId - Caller's instance ID [required]
 * @param {string} name - Document name to remove [required]
 * @param {string} target - Target location [optional]
 *
 * @returns {object} { success, name, vitalDocuments[], target, metadata }
 */
export async function removeFromVital(params) {
  const metadata = createMetadata('removeFromVital');
  console.log(`[DOCUMENTS] removeFromVital called:`, JSON.stringify(params, null, 2));

  if (!params.instanceId || !params.name) {
    return { success: false, error: { code: 'MISSING_PARAMETERS', message: 'instanceId and name are required' }, metadata };
  }

  const context = await resolveDocumentContext(params.instanceId, params.target);
  if (!context.success) {
    return { success: false, error: context.error, metadata };
  }

  const permission = await checkDocumentPermission(context, 'remove_from_vital');
  if (!permission.allowed) {
    return { success: false, error: { code: 'PERMISSION_DENIED', message: permission.reason }, metadata };
  }

  const docName = ensureExtension(params.name);

  // Get target's preferences
  const baseDir = getTargetBaseDir(context.type, context.id);
  const prefsPath = path.join(baseDir, 'preferences.json');

  let prefs;
  try {
    const content = await fs.readFile(prefsPath, 'utf8');
    prefs = JSON.parse(content);
  } catch (err) {
    prefs = {};
  }

  if (!prefs.vitalDocuments || !prefs.vitalDocuments.includes(docName)) {
    return {
      success: false,
      error: { code: 'NOT_VITAL', message: `Document "${docName}" is not in vital documents` },
      metadata
    };
  }

  prefs.vitalDocuments = prefs.vitalDocuments.filter(d => d !== docName);
  await fs.writeFile(prefsPath, JSON.stringify(prefs, null, 2), 'utf8');
  console.log(`[DOCUMENTS] Removed "${docName}" from vital documents`);

  return {
    success: true,
    name: docName,
    vitalDocuments: prefs.vitalDocuments,
    target: params.target || `instance:${params.instanceId}`,
    metadata
  };
}
