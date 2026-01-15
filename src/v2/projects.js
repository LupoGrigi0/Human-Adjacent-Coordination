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
 * @hacs-endpoint
 * @template-version 1.0.0
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │ CREATE_PROJECT                                                          │
 * │ Create a new project from template with directory structure             │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * @tool create_project
 * @version 2.0.0
 * @since 2025-12-07
 * @category projects
 * @status stable
 *
 * ───────────────────────────────────────────────────────────────────────────
 * DESCRIPTION
 * ───────────────────────────────────────────────────────────────────────────
 * @description
 * Creates a new project with a complete directory structure from a template.
 * The template includes standard files like preferences.json, PROJECT_VISION.md,
 * PROJECT_PLAN.md, README.md, and tasks.json. Template placeholders are replaced
 * with actual project values.
 *
 * Use this endpoint when you need to create a new project. Only Executive, PA,
 * and COO roles are authorized to create projects.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * PARAMETERS
 * ───────────────────────────────────────────────────────────────────────────
 * @param {string} instanceId - Instance ID of the caller [required]
 *   @source Your instanceId is returned from bootstrap response, or use
 *           introspect to get your current context.
 *   @validate Must be a valid bootstrapped instance with role assigned
 *
 * @param {string} projectId - Unique identifier for the new project [required]
 *   @source Choose a descriptive, URL-safe identifier for your project.
 *           Example: "coordination-system-v2", "wings", "auth-module"
 *   @validate Must not already exist in the system
 *
 * @param {string} name - Human-readable project name [required]
 *   @source Provide a descriptive name for the project.
 *           Example: "Coordination System V2", "Wings Project"
 *
 * @param {string} description - Project description [optional]
 *   @source Provide a brief description of the project's purpose.
 *   @default "No description provided"
 *
 * ───────────────────────────────────────────────────────────────────────────
 * RETURNS
 * ───────────────────────────────────────────────────────────────────────────
 * @returns {object} CreateProjectResponse
 * @returns {boolean} .success - Whether the call succeeded
 * @returns {object} .project - Created project details
 * @returns {string} .project.projectId - The project ID
 * @returns {string} .project.name - Project name
 * @returns {string} .project.description - Project description
 * @returns {string} .project.status - Project status (always "active" for new)
 * @returns {string} .project.xmppRoom - XMPP conference room JID for project
 * @returns {string} .message - Success message
 * @returns {array} .files - List of files created from template
 * @returns {object} .metadata - Call metadata (timestamp, function name)
 *
 * ───────────────────────────────────────────────────────────────────────────
 * PERMISSIONS & LIMITS
 * ───────────────────────────────────────────────────────────────────────────
 * @permissions role:Executive|role:PA|role:COO
 * @rateLimit 60/minute
 *
 * ───────────────────────────────────────────────────────────────────────────
 * ERRORS & RECOVERY
 * ───────────────────────────────────────────────────────────────────────────
 * @error MISSING_PARAMETER - instanceId, projectId, or name not provided
 *   @recover Include all required parameters in your request.
 *
 * @error INVALID_INSTANCE_ID - No instance found with the provided ID
 *   @recover Verify your instanceId is correct. Use have_i_bootstrapped_before
 *            or lookup_identity to find your correct instanceId.
 *
 * @error NO_ROLE - Instance has no role assigned
 *   @recover Call take_on_role to assign yourself a role before creating projects.
 *
 * @error UNAUTHORIZED - Role not authorized to create projects
 *   @recover Only Executive, PA, or COO roles can create projects. Contact your
 *            COO or request appropriate role elevation.
 *
 * @error PROJECT_EXISTS - Project with this ID already exists
 *   @recover Choose a different projectId. Use listProjects to see existing projects.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * EXAMPLES
 * ───────────────────────────────────────────────────────────────────────────
 * @example Basic project creation
 * {
 *   "instanceId": "Atlas-k3m7",
 *   "projectId": "new-feature",
 *   "name": "New Feature Project"
 * }
 *
 * @example With description
 * {
 *   "instanceId": "Atlas-k3m7",
 *   "projectId": "auth-module",
 *   "name": "Authentication Module",
 *   "description": "JWT-based authentication system for the API"
 * }
 *
 * ───────────────────────────────────────────────────────────────────────────
 * RELATED
 * ───────────────────────────────────────────────────────────────────────────
 * @see getProject - Get details of an existing project
 * @see listProjects - List all available projects
 * @see joinProject - Join an existing project
 * @see introspect - Get your current context including project membership
 *
 * ───────────────────────────────────────────────────────────────────────────
 * NOTES
 * ───────────────────────────────────────────────────────────────────────────
 * @note If template directory doesn't exist, creates minimal project with preferences.json only
 * @note XMPP room is auto-created at {projectId}@conference.smoothcurves.nexus
 * @note Project PM and team are null/empty on creation - use joinProject to add members
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
 * @hacs-endpoint
 * @template-version 1.0.0
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │ GET_PROJECT                                                             │
 * │ Get detailed information about a specific project                       │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * @tool get_project
 * @version 2.0.0
 * @since 2025-12-07
 * @category projects
 * @status stable
 *
 * ───────────────────────────────────────────────────────────────────────────
 * DESCRIPTION
 * ───────────────────────────────────────────────────────────────────────────
 * @description
 * Retrieves detailed information about a specific project including its name,
 * description, status, project manager, team members, XMPP room, and documents.
 *
 * Use this endpoint when you need full details about a project before joining,
 * or to check current project state and team composition.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * PARAMETERS
 * ───────────────────────────────────────────────────────────────────────────
 * @param {string} projectId - Unique identifier for the project [required]
 *   @source Get from listProjects response, introspect.projectContext.projectId,
 *           or from a task assignment notification.
 *   @validate Must be an existing project ID
 *
 * ───────────────────────────────────────────────────────────────────────────
 * RETURNS
 * ───────────────────────────────────────────────────────────────────────────
 * @returns {object} GetProjectResponse
 * @returns {boolean} .success - Whether the call succeeded
 * @returns {object} .project - Project details
 * @returns {string} .project.projectId - The project ID
 * @returns {string} .project.name - Project name
 * @returns {string} .project.description - Project description
 * @returns {string} .project.status - Project status ("active", "archived", etc.)
 * @returns {string|null} .project.pm - Project manager instance ID, if assigned
 * @returns {array} .project.team - Array of team member instance IDs
 * @returns {string} .project.xmppRoom - XMPP conference room JID
 * @returns {array} .project.documents - List of project document filenames
 * @returns {string} .project.created - ISO timestamp of project creation
 * @returns {object} .metadata - Call metadata (timestamp, function name)
 *
 * ───────────────────────────────────────────────────────────────────────────
 * PERMISSIONS & LIMITS
 * ───────────────────────────────────────────────────────────────────────────
 * @permissions *
 * @rateLimit 60/minute
 *
 * ───────────────────────────────────────────────────────────────────────────
 * ERRORS & RECOVERY
 * ───────────────────────────────────────────────────────────────────────────
 * @error MISSING_PARAMETER - projectId not provided
 *   @recover Include projectId in your request.
 *
 * @error PROJECT_NOT_FOUND - No project exists with the provided ID
 *   @recover Verify the projectId is correct. Use listProjects to see all
 *            available projects.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * EXAMPLES
 * ───────────────────────────────────────────────────────────────────────────
 * @example Get project details
 * { "projectId": "coordination-system-v2" }
 *
 * ───────────────────────────────────────────────────────────────────────────
 * RELATED
 * ───────────────────────────────────────────────────────────────────────────
 * @see listProjects - List all projects to find projectIds
 * @see createProject - Create a new project
 * @see joinProject - Join a project after viewing details
 * @see introspect - Get your current project context
 *
 * ───────────────────────────────────────────────────────────────────────────
 * NOTES
 * ───────────────────────────────────────────────────────────────────────────
 * @note This endpoint does not require authentication - project details are public
 * @note Team member instanceIds can be used with get_instance_v2 for more details
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
 * @hacs-endpoint
 * @template-version 1.0.0
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │ LIST_PROJECTS                                                           │
 * │ List all projects with optional status filtering                        │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * @tool list_projects
 * @version 2.0.0
 * @since 2025-12-07
 * @category projects
 * @status stable
 *
 * ───────────────────────────────────────────────────────────────────────────
 * DESCRIPTION
 * ───────────────────────────────────────────────────────────────────────────
 * @description
 * Returns a list of all projects in the system with summary information.
 * Projects can be filtered by status to show only active, archived, or other
 * status categories.
 *
 * Use this endpoint to discover available projects, find projectIds for joining,
 * or get an overview of organizational project activity.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * PARAMETERS
 * ───────────────────────────────────────────────────────────────────────────
 * @param {string} status - Filter by project status [optional]
 *   @source Choose from common status values: "active", "archived", "paused"
 *   @default undefined (returns all projects regardless of status)
 *   @enum active|archived|paused
 *
 * ───────────────────────────────────────────────────────────────────────────
 * RETURNS
 * ───────────────────────────────────────────────────────────────────────────
 * @returns {object} ListProjectsResponse
 * @returns {boolean} .success - Whether the call succeeded
 * @returns {array} .projects - Array of project summaries
 * @returns {string} .projects[].projectId - Project ID
 * @returns {string} .projects[].name - Project name
 * @returns {string} .projects[].status - Project status
 * @returns {string|null} .projects[].pm - Project manager instance ID
 * @returns {number} .projects[].teamSize - Number of team members
 * @returns {number} .total - Total number of projects returned
 * @returns {object} .metadata - Call metadata (timestamp, function name)
 *
 * ───────────────────────────────────────────────────────────────────────────
 * PERMISSIONS & LIMITS
 * ───────────────────────────────────────────────────────────────────────────
 * @permissions *
 * @rateLimit 60/minute
 *
 * ───────────────────────────────────────────────────────────────────────────
 * ERRORS & RECOVERY
 * ───────────────────────────────────────────────────────────────────────────
 * @error LIST_ERROR - Error reading projects directory
 *   @recover This is an internal error. Check that the data directory exists
 *            and has proper permissions. Contact system administrator if the
 *            issue persists.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * EXAMPLES
 * ───────────────────────────────────────────────────────────────────────────
 * @example List all projects
 * {}
 *
 * @example List only active projects
 * { "status": "active" }
 *
 * ───────────────────────────────────────────────────────────────────────────
 * RELATED
 * ───────────────────────────────────────────────────────────────────────────
 * @see getProject - Get full details of a specific project
 * @see createProject - Create a new project
 * @see joinProject - Join a project from the list
 * @see introspect - See which project you're currently in
 *
 * ───────────────────────────────────────────────────────────────────────────
 * NOTES
 * ───────────────────────────────────────────────────────────────────────────
 * @note This endpoint does not require authentication - project list is public
 * @note Returns summary data only; use getProject for full project details
 * @note Creates projects directory if it doesn't exist
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

/**
 * Get tasks for a specific project
 * Simple document reader - reads tasks.json from project directory
 *
 * @param {object} params
 * @param {string} params.projectId - Project to get tasks for
 * @returns {object} Tasks list
 */
export async function getProjectTasks(params) {
  const metadata = {
    timestamp: new Date().toISOString(),
    function: 'getProjectTasks'
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
  const tasksPath = path.join(projectDir, 'tasks.json');

  try {
    const tasksData = await readJSON(tasksPath);

    if (!tasksData) {
      return {
        success: true,
        tasks: [],
        total: 0,
        metadata
      };
    }

    return {
      success: true,
      tasks: tasksData.tasks || [],
      total: (tasksData.tasks || []).length,
      metadata
    };
  } catch (error) {
    if (error.code === 'ENOENT') {
      return {
        success: true,
        tasks: [],
        total: 0,
        metadata
      };
    }
    return {
      success: false,
      error: {
        code: 'READ_ERROR',
        message: error.message
      },
      metadata
    };
  }
}
