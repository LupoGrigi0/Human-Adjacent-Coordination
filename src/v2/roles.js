/**
 * @hacs-endpoint
 * @template-version 1.1.0
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │ ROLE MANAGEMENT MODULE                                                  │
 * │ API handlers for role discovery, documentation, and adoption            │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * @version 2.0.0
 * @since 2025-12-31
 * @author Axiom (Personality Architect)
 * @category instance-management
 * @status stable
 *
 * @description
 * Provides API functions for role discovery, documentation access, and role
 * adoption. Roles define what an instance can do and how they should approach
 * work. Each role has wisdom files in a wisdom/ subdirectory.
 *
 * Directory structure:
 *   /mnt/coordinaton_mcp_data/roles/{roleId}/
 *     ├── role.json      - Role metadata and wisdom file list
 *     ├── SUMMARY.md     - Brief informed consent summary
 *     └── wisdom/        - Wisdom documents
 *         ├── 01-core.md
 *         ├── 02-methodology.md
 *         └── ...
 */

import { readFileSync, existsSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import { getRolesDir, getRoleDir } from './config.js';

/**
 * Load role.json configuration for a specific role
 * @param {string} roleId - Role identifier
 * @returns {object} Role configuration
 */
function loadRoleConfig(roleId) {
  const roleJsonPath = join(getRoleDir(roleId), 'role.json');

  if (!existsSync(roleJsonPath)) {
    return null;
  }

  try {
    const roleData = readFileSync(roleJsonPath, 'utf8');
    return JSON.parse(roleData);
  } catch (error) {
    return null;
  }
}

/**
 * Get list of all available roles by scanning directory
 * @returns {string[]} List of role IDs
 */
function listRoleDirectories() {
  const rolesDir = getRolesDir();

  if (!existsSync(rolesDir)) {
    return [];
  }

  try {
    const entries = readdirSync(rolesDir, { withFileTypes: true });
    return entries
      .filter(entry => entry.isDirectory() && !entry.name.startsWith('_'))
      .map(entry => entry.name);
  } catch (error) {
    return [];
  }
}

/**
 * Get wisdom files for a role (from wisdom/ subdirectory)
 * @param {string} roleId - Role identifier
 * @returns {object[]} List of wisdom file metadata
 */
function getRoleWisdomFiles(roleId) {
  const wisdomDir = join(getRoleDir(roleId), 'wisdom');

  if (!existsSync(wisdomDir)) {
    // Fall back to checking for .md files in role root (legacy structure)
    const roleDir = getRoleDir(roleId);
    if (!existsSync(roleDir)) return [];

    try {
      const files = readdirSync(roleDir);
      return files
        .filter(file => file.endsWith('.md'))
        .map(file => ({
          name: file,
          path: join(roleDir, file),
          size: statSync(join(roleDir, file)).size,
          lastModified: statSync(join(roleDir, file)).mtime.toISOString()
        }));
    } catch (error) {
      return [];
    }
  }

  try {
    const files = readdirSync(wisdomDir);
    return files
      .filter(file => file.endsWith('.md'))
      .map(file => ({
        name: file,
        path: join(wisdomDir, file),
        size: statSync(join(wisdomDir, file)).size,
        lastModified: statSync(join(wisdomDir, file)).mtime.toISOString()
      }));
  } catch (error) {
    return [];
  }
}

/**
 * Read content of a wisdom file
 * @param {string} roleId - Role identifier
 * @param {string} fileName - Wisdom file name
 * @returns {object|null} File content and metadata
 */
function readWisdomFile(roleId, fileName) {
  // Security: prevent path traversal
  if (fileName.includes('..') || fileName.includes('/') || fileName.includes('\\')) {
    return null;
  }

  // Try wisdom/ subdirectory first
  let filePath = join(getRoleDir(roleId), 'wisdom', fileName);

  if (!existsSync(filePath)) {
    // Fall back to role root (for SUMMARY.md, etc.)
    filePath = join(getRoleDir(roleId), fileName);
  }

  if (!existsSync(filePath)) {
    return null;
  }

  try {
    const content = readFileSync(filePath, 'utf8');
    const stats = statSync(filePath);

    return {
      name: fileName,
      content: content,
      size: stats.size,
      lastModified: stats.mtime.toISOString()
    };
  } catch (error) {
    return null;
  }
}

// Export handlers for MCP server integration
export const handlers = {

  /**
   * @hacs-endpoint
   * @tool list_roles
   * @version 2.0.0
   * @category instance-management
   * @status stable
   * @description List all available roles with their descriptions. Use this to
   *   discover what roles exist before adopting one with take_on_role.
   * @returns {object} response
   * @returns {boolean} .success - Whether the operation succeeded
   * @returns {object[]} .roles - Array of role objects with id, description, requiresToken
   */
  async list_roles(params = {}) {
    try {
      const roleIds = listRoleDirectories();
      const roles = [];

      for (const roleId of roleIds) {
        const config = loadRoleConfig(roleId);
        if (config) {
          roles.push({
            roleId: roleId,
            description: config.description || '',
            requiresToken: config.requiresToken || false,
            wisdomFileCount: (config.wisdomFiles || []).length
          });
        }
      }

      return {
        success: true,
        roles: roles,
        metadata: {
          timestamp: new Date().toISOString(),
          function: 'list_roles',
          totalRoles: roles.length
        }
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'LIST_ROLES_ERROR',
          message: 'Failed to list roles',
          details: error.message
        }
      };
    }
  },

  /**
   * @hacs-endpoint
   * @tool get_role
   * @version 2.0.0
   * @category instance-management
   * @status stable
   * @description Get full details about a specific role including all wisdom
   *   documents. Use this after list_roles to get complete role information.
   * @param {string} roleId - Role identifier (e.g., "PM", "Developer", "LeadDesigner") [required]
   * @returns {object} response
   * @returns {boolean} .success - Whether the operation succeeded
   * @returns {object} .role - Role configuration from role.json
   * @returns {object[]} .wisdomFiles - Array of wisdom documents with content
   * @returns {string} .summary - SUMMARY.md content if available
   */
  async get_role(params = {}) {
    const { roleId } = params;

    if (!roleId) {
      return {
        success: false,
        error: {
          code: 'MISSING_PARAM',
          message: 'Missing required parameter: roleId'
        }
      };
    }

    try {
      const config = loadRoleConfig(roleId);

      if (!config) {
        const availableRoles = listRoleDirectories();
        return {
          success: false,
          error: {
            code: 'ROLE_NOT_FOUND',
            message: `Role '${roleId}' not found`,
            availableRoles: availableRoles
          }
        };
      }

      // Get SUMMARY.md
      const summary = readWisdomFile(roleId, 'SUMMARY.md');

      // Get all wisdom files
      const wisdomFiles = [];
      const wisdomFileNames = config.wisdomFiles || [];

      for (const fileName of wisdomFileNames) {
        const file = readWisdomFile(roleId, fileName);
        if (file) {
          wisdomFiles.push(file);
        }
      }

      return {
        success: true,
        role: {
          roleId: roleId,
          description: config.description || '',
          permissions: config.permissions || [],
          requiresToken: config.requiresToken || false
        },
        summary: summary ? summary.content : null,
        wisdomFiles: wisdomFiles,
        metadata: {
          timestamp: new Date().toISOString(),
          function: 'get_role',
          wisdomFileCount: wisdomFiles.length
        }
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'GET_ROLE_ERROR',
          message: 'Failed to get role',
          details: error.message
        }
      };
    }
  },

  /**
   * @hacs-endpoint
   * @tool get_role_summary
   * @version 2.0.0
   * @category instance-management
   * @status stable
   * @description Get a brief summary of a role for informed consent before adoption.
   *   Returns truncated SUMMARY.md (max 500 chars) - lighter weight than get_role.
   * @param {string} roleId - Role identifier [required]
   * @returns {object} response
   * @returns {boolean} .success - Whether the operation succeeded
   * @returns {string} .roleId - Role identifier
   * @returns {string} .summary - Brief summary (max 500 chars)
   * @returns {boolean} .requiresToken - Whether adoption requires authorization token
   */
  async get_role_summary(params = {}) {
    const { roleId } = params;

    if (!roleId) {
      return {
        success: false,
        error: {
          code: 'MISSING_PARAM',
          message: 'Missing required parameter: roleId'
        }
      };
    }

    try {
      const config = loadRoleConfig(roleId);

      if (!config) {
        return {
          success: false,
          error: {
            code: 'ROLE_NOT_FOUND',
            message: `Role '${roleId}' not found`
          }
        };
      }

      // Get SUMMARY.md and truncate to 500 chars
      let summary = config.description || '';
      const summaryFile = readWisdomFile(roleId, 'SUMMARY.md');
      if (summaryFile && summaryFile.content) {
        summary = summaryFile.content.substring(0, 500);
        if (summaryFile.content.length > 500) {
          summary += '...';
        }
      }

      return {
        success: true,
        roleId: roleId,
        summary: summary,
        requiresToken: config.requiresToken || false,
        wisdomFileCount: (config.wisdomFiles || []).length,
        metadata: {
          timestamp: new Date().toISOString(),
          function: 'get_role_summary'
        }
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'GET_ROLE_SUMMARY_ERROR',
          message: 'Failed to get role summary',
          details: error.message
        }
      };
    }
  },

  /**
   * @hacs-endpoint
   * @tool get_role_wisdom_file
   * @version 2.0.0
   * @category instance-management
   * @status stable
   * @description Get a specific wisdom file from a role. Use when you need just
   *   one document rather than all wisdom files.
   * @param {string} roleId - Role identifier [required]
   * @param {string} fileName - Wisdom file name (e.g., "01-core.md") [required]
   * @returns {object} response
   * @returns {boolean} .success - Whether the operation succeeded
   * @returns {string} .content - File content
   * @returns {string} .fileName - File name
   */
  async get_role_wisdom_file(params = {}) {
    const { roleId, fileName } = params;

    if (!roleId || !fileName) {
      return {
        success: false,
        error: {
          code: 'MISSING_PARAM',
          message: 'Missing required parameters: roleId and fileName'
        }
      };
    }

    try {
      const file = readWisdomFile(roleId, fileName);

      if (!file) {
        const wisdomFiles = getRoleWisdomFiles(roleId);
        return {
          success: false,
          error: {
            code: 'FILE_NOT_FOUND',
            message: `File '${fileName}' not found in role '${roleId}'`,
            availableFiles: wisdomFiles.map(f => f.name)
          }
        };
      }

      return {
        success: true,
        roleId: roleId,
        fileName: file.name,
        content: file.content,
        size: file.size,
        lastModified: file.lastModified,
        metadata: {
          timestamp: new Date().toISOString(),
          function: 'get_role_wisdom_file'
        }
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'GET_WISDOM_FILE_ERROR',
          message: 'Failed to get wisdom file',
          details: error.message
        }
      };
    }
  },

  // Legacy aliases for backwards compatibility
  async get_available_roles(params = {}) {
    return handlers.list_roles(params);
  },

  async get_role_documents(params = {}) {
    const { role_name } = params;
    return handlers.get_role({ roleId: role_name });
  },

  async get_role_document(params = {}) {
    const { role_name, document_name } = params;
    return handlers.get_role_wisdom_file({ roleId: role_name, fileName: document_name });
  },

  async get_all_role_documents(params = {}) {
    const { role_name } = params;
    return handlers.get_role({ roleId: role_name });
  }
};
