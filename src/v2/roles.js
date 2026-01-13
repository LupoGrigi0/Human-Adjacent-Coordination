/**
 * Role Management Handlers
 * Simple document readers - scan directories, return content
 *
 * Directory structure:
 *   /mnt/coordinaton_mcp_data/roles/
 *     Developer/
 *       role.json      - { roleId, description, ... }
 *       SUMMARY.md     - Longer preview
 *       wisdom/        - Role documents
 *         01-role.md
 *     PM/
 *       ...
 */

import { readFileSync, existsSync, readdirSync } from 'fs';
import { join } from 'path';

const ROLES_DIR = '/mnt/coordinaton_mcp_data/roles';

/**
 * @hacs-endpoint
 * @template-version 1.0.0
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │ LIST_ROLES                                                              │
 * │ Returns a list of all available roles in the system                     │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * @tool list_roles
 * @version 2.0.0
 * @since 2025-12-29
 * @category roles
 * @status stable
 *
 * ───────────────────────────────────────────────────────────────────────────
 * DESCRIPTION
 * ───────────────────────────────────────────────────────────────────────────
 * Scans the roles directory and returns roleId + description for each role.
 * Use this to populate role selection dropdowns or discover available roles
 * before calling take_on_role.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * PARAMETERS
 * ───────────────────────────────────────────────────────────────────────────
 * None required.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * RETURNS
 * ───────────────────────────────────────────────────────────────────────────
 * @returns {object} response
 * @returns {boolean} response.success - Whether the operation succeeded
 * @returns {array} response.roles - Array of { roleId, description }
 *
 * ───────────────────────────────────────────────────────────────────────────
 * RELATED
 * ───────────────────────────────────────────────────────────────────────────
 * - get_role: Get detailed summary for a specific role
 * - get_role_wisdom: Get wisdom documents for a role
 * - take_on_role: Adopt a role
 */
async function list_roles() {
  try {
    const roles = [];
    const entries = readdirSync(ROLES_DIR, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name.startsWith('_')) continue;

      const roleJsonPath = join(ROLES_DIR, entry.name, 'role.json');
      if (existsSync(roleJsonPath)) {
        try {
          const roleData = JSON.parse(readFileSync(roleJsonPath, 'utf8'));
          roles.push({
            roleId: roleData.roleId || entry.name,
            description: roleData.description || ''
          });
        } catch (e) {
          // Skip malformed role.json
          roles.push({ roleId: entry.name, description: '' });
        }
      }
    }

    return {
      success: true,
      roles,
      metadata: { timestamp: new Date().toISOString(), function: 'list_roles' }
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * @hacs-endpoint
 * @template-version 1.0.0
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │ GET_ROLE                                                                │
 * │ Returns the SUMMARY.md content for a specific role                      │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * @tool get_role
 * @version 2.0.0
 * @since 2025-12-29
 * @category roles
 * @status stable
 *
 * ───────────────────────────────────────────────────────────────────────────
 * DESCRIPTION
 * ───────────────────────────────────────────────────────────────────────────
 * Returns the SUMMARY.md content for a role. This provides a longer preview
 * of what the role entails before deciding to adopt it.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * PARAMETERS
 * ───────────────────────────────────────────────────────────────────────────
 * @param {string} roleId - The role identifier (e.g., "Developer", "PM") [required]
 *
 * ───────────────────────────────────────────────────────────────────────────
 * RETURNS
 * ───────────────────────────────────────────────────────────────────────────
 * @returns {object} response
 * @returns {boolean} response.success - Whether the operation succeeded
 * @returns {string} response.roleId - The role identifier
 * @returns {string} response.summary - The SUMMARY.md content
 *
 * ───────────────────────────────────────────────────────────────────────────
 * ERRORS & RECOVERY
 * ───────────────────────────────────────────────────────────────────────────
 * @error "Missing required parameter: roleId"
 * @recover Provide roleId parameter. Get valid roles from list_roles().
 *
 * @error "SUMMARY.md not found for role: {roleId}"
 * @recover The role exists but has no summary. Use get_role_wisdom instead.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * RELATED
 * ───────────────────────────────────────────────────────────────────────────
 * - list_roles: Get all available roles
 * - get_role_wisdom: Get wisdom documents for a role
 */
async function get_role(params = {}) {
  const roleId = params.roleId || params.role_name;

  if (!roleId) {
    return { success: false, error: 'Missing required parameter: roleId' };
  }

  try {
    const summaryPath = join(ROLES_DIR, roleId, 'SUMMARY.md');

    if (!existsSync(summaryPath)) {
      return { success: false, error: `SUMMARY.md not found for role: ${roleId}` };
    }

    const content = readFileSync(summaryPath, 'utf8');

    return {
      success: true,
      roleId,
      summary: content,
      metadata: { timestamp: new Date().toISOString(), function: 'get_role' }
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * @hacs-endpoint
 * @template-version 1.0.0
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │ GET_ROLE_SUMMARY                                                        │
 * │ Returns truncated SUMMARY.md content (max 500 chars)                    │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * @tool get_role_summary
 * @version 2.0.0
 * @since 2025-12-29
 * @category roles
 * @status stable
 *
 * ───────────────────────────────────────────────────────────────────────────
 * DESCRIPTION
 * ───────────────────────────────────────────────────────────────────────────
 * Like get_role but truncates the summary to 500 characters. Useful for
 * displaying role previews in a compact UI.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * PARAMETERS
 * ───────────────────────────────────────────────────────────────────────────
 * @param {string} roleId - The role identifier (e.g., "Developer", "PM") [required]
 *
 * ───────────────────────────────────────────────────────────────────────────
 * RETURNS
 * ───────────────────────────────────────────────────────────────────────────
 * @returns {object} response
 * @returns {boolean} response.success - Whether the operation succeeded
 * @returns {string} response.roleId - The role identifier
 * @returns {string} response.summary - Truncated SUMMARY.md content (max 500 chars)
 *
 * ───────────────────────────────────────────────────────────────────────────
 * RELATED
 * ───────────────────────────────────────────────────────────────────────────
 * - get_role: Get full summary without truncation
 * - list_roles: Get all available roles
 */
async function get_role_summary(params = {}) {
  const result = await get_role(params);
  if (result.success && result.summary && result.summary.length > 500) {
    result.summary = result.summary.substring(0, 500) + '...';
  }
  return result;
}

/**
 * @hacs-endpoint
 * @template-version 1.0.0
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │ GET_ROLE_WISDOM                                                         │
 * │ Returns all wisdom documents for a role                                 │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * @tool get_role_wisdom
 * @version 2.0.0
 * @since 2025-12-29
 * @category roles
 * @status stable
 *
 * ───────────────────────────────────────────────────────────────────────────
 * DESCRIPTION
 * ───────────────────────────────────────────────────────────────────────────
 * Returns all markdown files from the role's wisdom directory. These contain
 * detailed guidance, best practices, and domain knowledge for the role.
 * Called automatically by take_on_role, but can be called directly to preview.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * PARAMETERS
 * ───────────────────────────────────────────────────────────────────────────
 * @param {string} roleId - The role identifier (e.g., "Developer", "PM") [required]
 *
 * ───────────────────────────────────────────────────────────────────────────
 * RETURNS
 * ───────────────────────────────────────────────────────────────────────────
 * @returns {object} response
 * @returns {boolean} response.success - Whether the operation succeeded
 * @returns {string} response.roleId - The role identifier
 * @returns {array} response.documents - Array of { fileName, content }
 *
 * ───────────────────────────────────────────────────────────────────────────
 * ERRORS & RECOVERY
 * ───────────────────────────────────────────────────────────────────────────
 * @error "Missing required parameter: roleId"
 * @recover Provide roleId parameter. Get valid roles from list_roles().
 *
 * @error "wisdom/ directory not found for role: {roleId}"
 * @recover The role exists but has no wisdom directory. This is a data issue.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * RELATED
 * ───────────────────────────────────────────────────────────────────────────
 * - get_role_wisdom_file: Get a specific wisdom file
 * - take_on_role: Adopt a role (includes wisdom delivery)
 * - list_roles: Get all available roles
 */
async function get_role_wisdom(params = {}) {
  const roleId = params.roleId || params.role_name;

  if (!roleId) {
    return { success: false, error: 'Missing required parameter: roleId' };
  }

  try {
    const wisdomDir = join(ROLES_DIR, roleId, 'wisdom');

    if (!existsSync(wisdomDir)) {
      return { success: false, error: `wisdom/ directory not found for role: ${roleId}` };
    }

    const files = readdirSync(wisdomDir).filter(f => f.endsWith('.md'));
    const documents = [];

    for (const file of files) {
      const content = readFileSync(join(wisdomDir, file), 'utf8');
      documents.push({ fileName: file, content });
    }

    return {
      success: true,
      roleId,
      documents,
      metadata: { timestamp: new Date().toISOString(), function: 'get_role_wisdom' }
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * @hacs-endpoint
 * @template-version 1.0.0
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │ GET_ROLE_WISDOM_FILE                                                    │
 * │ Returns a specific wisdom file from a role                              │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * @tool get_role_wisdom_file
 * @version 2.0.0
 * @since 2025-12-29
 * @category roles
 * @status stable
 *
 * ───────────────────────────────────────────────────────────────────────────
 * DESCRIPTION
 * ───────────────────────────────────────────────────────────────────────────
 * Returns a single wisdom file by name. Use this when you only need one
 * specific document rather than loading all wisdom files.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * PARAMETERS
 * ───────────────────────────────────────────────────────────────────────────
 * @param {string} roleId - The role identifier (e.g., "Developer", "PM") [required]
 * @param {string} fileName - The wisdom file name (e.g., "01-role.md") [required]
 *
 * ───────────────────────────────────────────────────────────────────────────
 * RETURNS
 * ───────────────────────────────────────────────────────────────────────────
 * @returns {object} response
 * @returns {boolean} response.success - Whether the operation succeeded
 * @returns {string} response.roleId - The role identifier
 * @returns {string} response.fileName - The requested file name
 * @returns {string} response.content - The file content
 *
 * ───────────────────────────────────────────────────────────────────────────
 * ERRORS & RECOVERY
 * ───────────────────────────────────────────────────────────────────────────
 * @error "Missing required parameters: roleId and fileName"
 * @recover Provide both roleId and fileName parameters.
 *
 * @error "Invalid fileName"
 * @recover fileName cannot contain ".." or "/" (path traversal prevention).
 *
 * @error "File not found: {fileName}"
 * @recover Check file exists. Use get_role_wisdom to list available files.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * RELATED
 * ───────────────────────────────────────────────────────────────────────────
 * - get_role_wisdom: Get all wisdom files for a role
 * - list_roles: Get all available roles
 */
async function get_role_wisdom_file(params = {}) {
  const roleId = params.roleId || params.role_name;
  const fileName = params.fileName || params.document_name;

  if (!roleId || !fileName) {
    return { success: false, error: 'Missing required parameters: roleId and fileName' };
  }

  // Prevent path traversal
  if (fileName.includes('..') || fileName.includes('/')) {
    return { success: false, error: 'Invalid fileName' };
  }

  try {
    const filePath = join(ROLES_DIR, roleId, 'wisdom', fileName);

    if (!existsSync(filePath)) {
      return { success: false, error: `File not found: ${fileName}` };
    }

    const content = readFileSync(filePath, 'utf8');

    return {
      success: true,
      roleId,
      fileName,
      content,
      metadata: { timestamp: new Date().toISOString(), function: 'get_role_wisdom_file' }
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// Export handlers for server.js
export const handlers = {
  list_roles,
  get_role,
  get_role_summary,
  get_role_wisdom,
  get_role_wisdom_file,

  // Legacy aliases
  get_available_roles: list_roles,
  get_role_documents: get_role_wisdom,
  get_role_document: get_role_wisdom_file
};
