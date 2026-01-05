/**
 * Role Management Handlers
 * Provides API functions for role discovery, documentation access, and role management
 *
 * @author claude-code-ProductionMCP-2025-09-18
 */

import { readFileSync, existsSync, readdirSync, statSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Single source of truth for roles data
const ROLES_DIR = '/mnt/coordinaton_mcp_data/roles';
const ROLES_JSON_PATH = join(ROLES_DIR, 'roles.json');

/**
 * Load roles.json configuration
 */
function loadRolesConfig() {
  try {
    if (!existsSync(ROLES_JSON_PATH)) {
      throw new Error('roles.json not found');
    }

    const rolesData = readFileSync(ROLES_JSON_PATH, 'utf8');
    return JSON.parse(rolesData);
  } catch (error) {
    throw new Error(`Failed to load roles configuration: ${error.message}`);
  }
}

/**
 * Get list of available documents for a specific role
 */
function getRoleDocumentList(roleName) {
  const roleDir = join(ROLES_DIR, roleName);

  if (!existsSync(roleDir)) {
    return [];
  }

  try {
    const files = readdirSync(roleDir);
    return files
      .filter(file => file.endsWith('.md'))
      .map(file => {
        const filePath = join(roleDir, file);
        const stats = statSync(filePath);
        return {
          name: file,
          size: stats.size,
          last_modified: stats.mtime.toISOString()
        };
      });
  } catch (error) {
    return [];
  }
}

/**
 * Get content of a specific role document
 */
function getRoleDocumentContent(roleName, documentName) {
  // Validate document name to prevent path traversal
  if (documentName.includes('..') || documentName.includes('/') || documentName.includes('\\')) {
    throw new Error('Invalid document name');
  }

  if (!documentName.endsWith('.md')) {
    throw new Error('Only .md files are supported');
  }

  const documentPath = join(ROLES_DIR, roleName, documentName);

  if (!existsSync(documentPath)) {
    throw new Error(`Document ${documentName} not found for role ${roleName}`);
  }

  try {
    const content = readFileSync(documentPath, 'utf8');
    const stats = statSync(documentPath);

    return {
      document_name: documentName,
      role_name: roleName,
      content: content,
      size: stats.size,
      last_modified: stats.mtime.toISOString()
    };
  } catch (error) {
    throw new Error(`Failed to read document: ${error.message}`);
  }
}

/**
 * Get all documents for a role
 */
function getAllRoleDocuments(roleName) {
  const documents = getRoleDocumentList(roleName);
  const documentContents = [];

  for (const doc of documents) {
    try {
      const content = getRoleDocumentContent(roleName, doc.name);
      documentContents.push(content);
    } catch (error) {
      // Skip documents that can't be read
      continue;
    }
  }

  return documentContents;
}

// Export handlers for MCP server integration
export const handlers = {

  /**
   * Get available roles with descriptions and access requirements
   */
  async get_available_roles(params = {}) {
    try {
      const rolesConfig = loadRolesConfig();

      return {
        success: true,
        data: {
          schema_version: rolesConfig.schema_version,
          categories: rolesConfig.categories,
          roles: rolesConfig.roles,
          role_combinations: rolesConfig.role_combination_examples || [],
          authorization_hierarchy: rolesConfig.authorization_hierarchy || [],
          overlay_notes: rolesConfig.overlay_system_notes || []
        },
        metadata: {
          timestamp: new Date().toISOString(),
          function: 'get_available_roles',
          total_roles: Object.keys(rolesConfig.roles || {}).length
        }
      };
    } catch (error) {
      return {
        success: false,
        error: {
          message: 'Failed to retrieve available roles',
          details: error.message,
          timestamp: new Date().toISOString()
        }
      };
    }
  },

  /**
   * Get list of available documents for a specific role
   */
  async get_role_documents(params = {}) {
    const { role_name } = params;

    if (!role_name) {
      return {
        success: false,
        error: {
          message: 'Missing required parameter: role_name',
          timestamp: new Date().toISOString()
        }
      };
    }

    try {
      const rolesConfig = loadRolesConfig();

      // Verify role exists
      if (!rolesConfig.roles[role_name]) {
        return {
          success: false,
          error: {
            message: `Role '${role_name}' not found`,
            available_roles: Object.keys(rolesConfig.roles),
            timestamp: new Date().toISOString()
          }
        };
      }

      const documents = getRoleDocumentList(role_name);

      return {
        success: true,
        data: {
          role_name: role_name,
          role_info: rolesConfig.roles[role_name],
          documents: documents
        },
        metadata: {
          timestamp: new Date().toISOString(),
          function: 'get_role_documents',
          document_count: documents.length
        }
      };
    } catch (error) {
      return {
        success: false,
        error: {
          message: 'Failed to retrieve role documents',
          details: error.message,
          timestamp: new Date().toISOString()
        }
      };
    }
  },

  /**
   * Get content of a specific role document
   */
  async get_role_document(params = {}) {
    const { role_name, document_name } = params;

    if (!role_name || !document_name) {
      return {
        success: false,
        error: {
          message: 'Missing required parameters: role_name and document_name',
          timestamp: new Date().toISOString()
        }
      };
    }

    try {
      const rolesConfig = loadRolesConfig();

      // Verify role exists
      if (!rolesConfig.roles[role_name]) {
        return {
          success: false,
          error: {
            message: `Role '${role_name}' not found`,
            available_roles: Object.keys(rolesConfig.roles),
            timestamp: new Date().toISOString()
          }
        };
      }

      const documentContent = getRoleDocumentContent(role_name, document_name);

      return {
        success: true,
        data: documentContent,
        metadata: {
          timestamp: new Date().toISOString(),
          function: 'get_role_document'
        }
      };
    } catch (error) {
      return {
        success: false,
        error: {
          message: 'Failed to retrieve role document',
          details: error.message,
          timestamp: new Date().toISOString()
        }
      };
    }
  },

  /**
   * Get all documents for a specific role
   */
  async get_all_role_documents(params = {}) {
    const { role_name } = params;

    if (!role_name) {
      return {
        success: false,
        error: {
          message: 'Missing required parameter: role_name',
          timestamp: new Date().toISOString()
        }
      };
    }

    try {
      const rolesConfig = loadRolesConfig();

      // Verify role exists
      if (!rolesConfig.roles[role_name]) {
        return {
          success: false,
          error: {
            message: `Role '${role_name}' not found`,
            available_roles: Object.keys(rolesConfig.roles),
            timestamp: new Date().toISOString()
          }
        };
      }

      const documents = getAllRoleDocuments(role_name);

      return {
        success: true,
        data: {
          role_name: role_name,
          role_info: rolesConfig.roles[role_name],
          documents: documents
        },
        metadata: {
          timestamp: new Date().toISOString(),
          function: 'get_all_role_documents',
          document_count: documents.length
        }
      };
    } catch (error) {
      return {
        success: false,
        error: {
          message: 'Failed to retrieve all role documents',
          details: error.message,
          timestamp: new Date().toISOString()
        }
      };
    }
  },

  /**
   * Alias for get_available_roles - provides list_* API consistency
   * @hacs-endpoint
   * @tool list_roles
   * @alias get_available_roles
   */
  async list_roles(params = {}) {
    return handlers.get_available_roles(params);
  },

  /**
   * Get a summary for a specific role (for informed consent before adoption)
   * @hacs-endpoint
   * @tool get_role_summary
   * @param {string} role_name - Role identifier
   * @returns Summary with description and document count (max 500 chars)
   */
  async get_role_summary(params = {}) {
    const { role_name } = params;

    if (!role_name) {
      return {
        success: false,
        error: {
          message: 'Missing required parameter: role_name',
          timestamp: new Date().toISOString()
        }
      };
    }

    try {
      const rolesConfig = loadRolesConfig();

      if (!rolesConfig.roles[role_name]) {
        return {
          success: false,
          error: {
            message: `Role '${role_name}' not found`,
            available_roles: Object.keys(rolesConfig.roles),
            timestamp: new Date().toISOString()
          }
        };
      }

      const roleInfo = rolesConfig.roles[role_name];
      const documents = getRoleDocumentList(role_name);

      // Check for SUMMARY.md
      let summary = roleInfo.description || '';
      const summaryDoc = documents.find(d => d.name.toLowerCase() === 'summary.md');
      if (summaryDoc) {
        const summaryContent = getRoleDocumentContent(role_name, 'SUMMARY.md');
        if (summaryContent && summaryContent.content) {
          // Truncate to 500 chars
          summary = summaryContent.content.substring(0, 500);
          if (summaryContent.content.length > 500) {
            summary += '...';
          }
        }
      }

      return {
        success: true,
        data: {
          role_name: role_name,
          name: roleInfo.name || role_name,
          summary: summary,
          document_count: documents.length,
          requires_token: roleInfo.requiresToken || false
        },
        metadata: {
          timestamp: new Date().toISOString(),
          function: 'get_role_summary'
        }
      };
    } catch (error) {
      return {
        success: false,
        error: {
          message: 'Failed to retrieve role summary',
          details: error.message,
          timestamp: new Date().toISOString()
        }
      };
    }
  }
};