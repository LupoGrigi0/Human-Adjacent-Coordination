/**
 * Project handler for V2 coordination system
 * Creates projects from templates with proper directory structure
 *
 * @module projects
 * @author Bridge
 * @created 2025-12-07
 */

import fs from 'fs/promises';
import path from 'path';
import {
  DATA_ROOT,
  getProjectsDir,
  getProjectDir,
  getTemplateProjectDir
} from './config.js';
import {
  readJSON,
  writeJSON,
  ensureDir,
  readPreferences,
  loadEntityPreferences,
  copyTemplateFiles
} from './data.js';
import { canRoleCallAPI } from './permissions.js';

/**
 * Replace template placeholders with actual values
 * @param {string} content - Template content
 * @param {Object} values - Replacement values
 * @returns {string} Content with placeholders replaced
 */
function replaceTemplatePlaceholders(content, values) {
  let result = content;
  for (const [key, value] of Object.entries(values)) {
    const placeholder = `{{${key}}}`;
    result = result.split(placeholder).join(value || '');
  }
  return result;
}

/**
 * Create a new project from template
 *
 * @param {Object} params - Parameters
 * @param {string} params.instanceId - Instance creating the project (required)
 * @param {string} params.projectId - Project ID (required)
 * @param {string} params.name - Project name (required)
 * @param {string} [params.description] - Project description
 * @returns {Promise<Object>} Result with created project
 */
export async function createProject(params) {
  const metadata = {
    timestamp: new Date().toISOString(),
    function: 'createProject'
  };

  // Validate required parameters
  if (!params.instanceId) {
    return {
      success: false,
      error: {
        code: 'MISSING_PARAMETER',
        message: 'instanceId is required'
      },
      metadata
    };
  }

  if (!params.projectId) {
    return {
      success: false,
      error: {
        code: 'MISSING_PARAMETER',
        message: 'projectId is required'
      },
      metadata
    };
  }

  if (!params.name) {
    return {
      success: false,
      error: {
        code: 'MISSING_PARAMETER',
        message: 'name is required'
      },
      metadata
    };
  }

  // Verify instance exists
  const prefs = await readPreferences(params.instanceId);
  if (!prefs) {
    return {
      success: false,
      error: {
        code: 'INVALID_INSTANCE_ID',
        message: `Instance ID ${params.instanceId} not found`
      },
      metadata
    };
  }

  // Check authorization - only Executive, PA, COO can create projects
  const instanceRole = prefs.role;
  if (!instanceRole) {
    return {
      success: false,
      error: {
        code: 'NO_ROLE',
        message: 'Instance must have a role to create projects. Use take_on_role first.'
      },
      metadata
    };
  }

  const authorized = await canRoleCallAPI(instanceRole, 'createProject');
  if (!authorized) {
    return {
      success: false,
      error: {
        code: 'UNAUTHORIZED',
        message: `Role '${instanceRole}' is not authorized to create projects. Required: Executive, PA, or COO.`
      },
      metadata
    };
  }

  // Check if project already exists
  const projectDir = getProjectDir(params.projectId);
  const existingPrefs = await loadEntityPreferences(projectDir);
  if (existingPrefs) {
    return {
      success: false,
      error: {
        code: 'PROJECT_EXISTS',
        message: `Project ${params.projectId} already exists`
      },
      metadata
    };
  }

  // Create project directory
  await ensureDir(projectDir);

  // Template values for placeholder replacement
  const now = new Date().toISOString();
  const templateValues = {
    PROJECT_ID: params.projectId,
    PROJECT_NAME: params.name,
    PROJECT_DESCRIPTION: params.description || 'No description provided',
    CREATED_AT: now
  };

  // Copy and process template files
  const templateDir = getTemplateProjectDir();

  try {
    const entries = await fs.readdir(templateDir);

    for (const filename of entries) {
      const srcPath = path.join(templateDir, filename);
      const destPath = path.join(projectDir, filename);

      // Read template file
      const content = await fs.readFile(srcPath, 'utf8');

      // Replace placeholders
      const processedContent = replaceTemplatePlaceholders(content, templateValues);

      // Write to project directory
      await fs.writeFile(destPath, processedContent, 'utf8');
    }
  } catch (error) {
    if (error.code === 'ENOENT') {
      // Template directory doesn't exist, create minimal project
      const minimalPrefs = {
        id: params.projectId,
        type: 'project',
        name: params.name,
        description: params.description || 'No description provided',
        status: 'active',
        documents: [],
        pm: null,
        team: [],
        xmppRoom: `${params.projectId}@conference.smoothcurves.nexus`,
        created: now,
        onLoad: []
      };
      await writeJSON(path.join(projectDir, 'preferences.json'), minimalPrefs);
    } else {
      throw error;
    }
  }

  // Load the created project preferences
  const createdPrefs = await loadEntityPreferences(projectDir);

  return {
    success: true,
    project: {
      projectId: params.projectId,
      name: params.name,
      description: params.description || 'No description provided',
      status: 'active',
      xmppRoom: createdPrefs?.xmppRoom || `${params.projectId}@conference.smoothcurves.nexus`
    },
    message: `Project '${params.name}' created successfully`,
    files: ['preferences.json', 'PROJECT_VISION.md', 'PROJECT_PLAN.md', 'README.md', 'tasks.json'],
    metadata
  };
}

/**
 * Get project details
 *
 * @param {Object} params - Parameters
 * @param {string} params.projectId - Project ID (required)
 * @returns {Promise<Object>} Result with project details
 */
export async function getProject(params) {
  const metadata = {
    timestamp: new Date().toISOString(),
    function: 'getProject'
  };

  if (!params.projectId) {
    return {
      success: false,
      error: {
        code: 'MISSING_PARAMETER',
        message: 'projectId is required'
      },
      metadata
    };
  }

  const projectDir = getProjectDir(params.projectId);
  const prefs = await loadEntityPreferences(projectDir);

  if (!prefs) {
    return {
      success: false,
      error: {
        code: 'PROJECT_NOT_FOUND',
        message: `Project ${params.projectId} not found`
      },
      metadata
    };
  }

  return {
    success: true,
    project: {
      projectId: prefs.id,
      name: prefs.name,
      description: prefs.description,
      status: prefs.status,
      pm: prefs.pm,
      team: prefs.team,
      xmppRoom: prefs.xmppRoom,
      documents: prefs.documents,
      created: prefs.created
    },
    metadata
  };
}

/**
 * List all projects
 *
 * @param {Object} params - Parameters
 * @param {string} [params.status] - Filter by status
 * @returns {Promise<Object>} Result with project list
 */
export async function listProjects(params = {}) {
  const metadata = {
    timestamp: new Date().toISOString(),
    function: 'listProjects'
  };

  const projectsDir = getProjectsDir();

  try {
    await ensureDir(projectsDir);
    const entries = await fs.readdir(projectsDir, { withFileTypes: true });

    const projects = [];

    for (const entry of entries) {
      if (entry.isDirectory()) {
        const projectDir = getProjectDir(entry.name);
        const prefs = await loadEntityPreferences(projectDir);

        if (prefs) {
          // Apply status filter if provided
          if (params.status && prefs.status !== params.status) {
            continue;
          }

          projects.push({
            projectId: prefs.id,
            name: prefs.name,
            status: prefs.status,
            pm: prefs.pm,
            teamSize: prefs.team?.length || 0
          });
        }
      }
    }

    return {
      success: true,
      projects,
      total: projects.length,
      metadata
    };
  } catch (error) {
    return {
      success: false,
      error: {
        code: 'LIST_ERROR',
        message: error.message
      },
      metadata
    };
  }
}
