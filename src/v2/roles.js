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
 * list_roles - Scan roles directories, return roleId + description from role.json
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
 * get_role - Return SUMMARY.md content for a role
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
 * get_role_summary - Alias for get_role (truncated to 500 chars)
 */
async function get_role_summary(params = {}) {
  const result = await get_role(params);
  if (result.success && result.summary && result.summary.length > 500) {
    result.summary = result.summary.substring(0, 500) + '...';
  }
  return result;
}

/**
 * get_role_wisdom - Return all wisdom files for a role
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
 * get_role_wisdom_file - Return a specific wisdom file
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
