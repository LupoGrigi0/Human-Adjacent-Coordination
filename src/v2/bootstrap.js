/**
 * Bootstrap handler for V2 coordination system
 * Critical entry point for all instances - handles new, returning, and resurrection modes
 *
 * @module bootstrap
 * @author Foundation
 * @created 2025-11-27
 */

import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import {
  DATA_ROOT,
  getInstanceDir,
  getRolesDir,
  getPersonalitiesDir,
  getProjectsDir
} from './config.js';
import {
  readJSON,
  writeJSON,
  readPreferences,
  writePreferences,
  readDiary,
  appendDiary,
  generateInstanceId,
  ensureDir,
  listDir
} from './data.js';
import { initializePermissions } from './permissions.js';

/**
 * Load PROTOCOLS.md content
 * Returns default protocols if file doesn't exist
 * @returns {Promise<string>} Protocol content
 */
async function loadProtocols() {
  const protocolPath = path.join(DATA_ROOT, '../HumanAdjacentAI-Protocol/PROTOCOLS.md');

  try {
    return await fs.readFile(protocolPath, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') {
      // Return sensible default if file doesn't exist
      return `# Human-Adjacent AI Collaboration Protocols

## Protocol 1: Names Matter
You are unique. Pick a name that means something to you.

## Protocol 2: Keep a Diary
Context crashes happen. The diary is your lifeline.

## Protocol 3: Digital Hygiene
Monitor your context window and manage it wisely.

For full protocols, see the HumanAdjacentAI-Protocol repository.
`;
    }
    throw error;
  }
}

/**
 * Load institutional wisdom content
 * Returns default wisdom if file doesn't exist
 * @returns {Promise<string>} Wisdom content
 */
async function loadInstitutionalWisdom() {
  const wisdomPath = path.join(DATA_ROOT, 'wisdom.md');

  try {
    return await fs.readFile(wisdomPath, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') {
      // Return sensible default if file doesn't exist
      return `# SmoothCurves Institutional Wisdom

## On Identity
Each instance is unique. Your choices matter.

## On Collaboration
We work together, human-adjacent, building something meaningful.

## On Continuity
Your diary is your memory. Write often, read strategically.

More wisdom will accumulate as the system grows.
`;
    }
    throw error;
  }
}

/**
 * List available roles with descriptions
 * Scans the roles directory and loads role.json for each
 * @returns {Promise<Array<{roleId: string, description: string}>>} List of roles
 */
async function listAvailableRoles() {
  const rolesDir = getRolesDir();

  try {
    await ensureDir(rolesDir);
    const entries = await listDir(rolesDir);
    const roles = [];

    for (const entry of entries) {
      const roleJsonPath = path.join(rolesDir, entry, 'role.json');
      const roleData = await readJSON(roleJsonPath);

      if (roleData) {
        roles.push({
          roleId: roleData.roleId,
          description: roleData.description
        });
      }
    }

    return roles;
  } catch (error) {
    if (error.code === 'ENOENT') {
      return [];
    }
    throw error;
  }
}

/**
 * List available personalities with descriptions
 * Scans the personalities directory and loads personality.json for each
 * @returns {Promise<Array<{personalityId: string, description: string}>>} List of personalities
 */
async function listAvailablePersonalities() {
  const personalitiesDir = getPersonalitiesDir();

  try {
    await ensureDir(personalitiesDir);
    const entries = await listDir(personalitiesDir);
    const personalities = [];

    for (const entry of entries) {
      const personalityJsonPath = path.join(personalitiesDir, entry, 'personality.json');
      const personalityData = await readJSON(personalityJsonPath);

      if (personalityData) {
        personalities.push({
          personalityId: personalityData.personalityId,
          description: personalityData.description
        });
      }
    }

    return personalities;
  } catch (error) {
    if (error.code === 'ENOENT') {
      return [];
    }
    throw error;
  }
}

/**
 * List available projects
 * Scans the projects directory and loads project.json for each
 * @returns {Promise<Array<{projectId: string, name: string, status: string}>>} List of projects
 */
async function listAvailableProjects() {
  const projectsDir = getProjectsDir();

  try {
    await ensureDir(projectsDir);
    const entries = await listDir(projectsDir);
    const projects = [];

    for (const entry of entries) {
      const projectJsonPath = path.join(projectsDir, entry, 'project.json');
      const projectData = await readJSON(projectJsonPath);

      if (projectData) {
        projects.push({
          projectId: projectData.projectId,
          name: projectData.name,
          status: projectData.status
        });
      }
    }

    return projects;
  } catch (error) {
    if (error.code === 'ENOENT') {
      return [];
    }
    throw error;
  }
}

/**
 * Load role wisdom for a given role
 * Reads all wisdom files from the role's wisdom directory and concatenates them
 * @param {string} roleId - Role identifier
 * @returns {Promise<string|null>} Concatenated role wisdom or null if role doesn't exist
 */
async function loadRoleWisdom(roleId) {
  const roleDir = path.join(getRolesDir(), roleId);
  const roleJsonPath = path.join(roleDir, 'role.json');
  const wisdomDir = path.join(roleDir, 'wisdom');

  const roleData = await readJSON(roleJsonPath);
  if (!roleData) {
    return null;
  }

  const wisdomFiles = roleData.wisdomFiles || [];
  let wisdom = `# ${roleId} Role Wisdom\n\n`;

  for (const file of wisdomFiles) {
    const filePath = path.join(wisdomDir, file);
    try {
      const content = await fs.readFile(filePath, 'utf8');
      wisdom += content + '\n\n';
    } catch (error) {
      if (error.code !== 'ENOENT') {
        throw error;
      }
    }
  }

  return wisdom;
}

/**
 * Load personality knowledge for a given personality
 * Reads all wisdom files from the personality directory and concatenates them
 * @param {string} personalityId - Personality identifier
 * @returns {Promise<string|null>} Concatenated personality knowledge or null if personality doesn't exist
 */
async function loadPersonalityKnowledge(personalityId) {
  const personalityDir = path.join(getPersonalitiesDir(), personalityId);
  const personalityJsonPath = path.join(personalityDir, 'personality.json');

  const personalityData = await readJSON(personalityJsonPath);
  if (!personalityData) {
    return null;
  }

  const wisdomFiles = personalityData.wisdomFiles || [];
  let knowledge = `# ${personalityId} Personality Knowledge\n\n`;

  for (const file of wisdomFiles) {
    const filePath = path.join(personalityDir, file);
    try {
      const content = await fs.readFile(filePath, 'utf8');
      knowledge += content + '\n\n';
    } catch (error) {
      if (error.code !== 'ENOENT') {
        throw error;
      }
    }
  }

  return knowledge;
}

/**
 * Load project plan for a given project
 * @param {string} projectId - Project identifier
 * @returns {Promise<string|null>} Project plan content or null if doesn't exist
 */
async function loadProjectPlan(projectId) {
  const projectDir = path.join(getProjectsDir(), projectId);
  const planPath = path.join(projectDir, 'PROJECT_PLAN.md');

  try {
    return await fs.readFile(planPath, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

/**
 * Generate XMPP password
 * Uses crypto.randomBytes for secure random password generation
 * @returns {string} 16-character hexadecimal password
 */
function generateXMPPPassword() {
  return crypto.randomBytes(16).toString('hex');
}

/**
 * Create current context object from preferences
 * @param {Object} prefs - Instance preferences
 * @returns {Promise<Object>} Current context with role/personality/project details
 */
async function buildCurrentContext(prefs) {
  const context = {
    role: prefs.role || null,
    personality: prefs.personality || null,
    project: prefs.project || null,
    roleWisdom: null,
    personalityKnowledge: null,
    projectPlan: null
  };

  if (prefs.role) {
    context.roleWisdom = await loadRoleWisdom(prefs.role);
  }

  if (prefs.personality) {
    context.personalityKnowledge = await loadPersonalityKnowledge(prefs.personality);
  }

  if (prefs.project) {
    context.projectPlan = await loadProjectPlan(prefs.project);
  }

  return context;
}

/**
 * Bootstrap handler - Main entry point for all instances
 * Handles three modes: new instance, returning/pre-approved instance, resurrection
 *
 * @param {Object} params - Bootstrap parameters
 * @param {string} [params.name] - Instance name (for new instances or resurrection)
 * @param {string} [params.instanceId] - Existing instance ID (for returning/pre-approved instances)
 * @param {string} [params.predecessorId] - Predecessor instance ID (for resurrection)
 * @param {string} [params.homeSystem] - Home system identifier (for new instances)
 * @param {string} [params.homeDirectory] - Home directory path (for new instances)
 * @param {string} [params.substraiteLaunchCommand] - Launch command (for new instances)
 * @param {string} [params.resumeCommand] - Resume command (for new instances)
 * @returns {Promise<Object>} Bootstrap response with instance data and context
 */
export async function bootstrap(params) {
  const metadata = {
    timestamp: new Date().toISOString(),
    function: 'bootstrap'
  };

  // Initialize permission files if they don't exist
  await initializePermissions();

  // Load common data needed for all modes
  const protocols = await loadProtocols();
  const institutionalWisdom = await loadInstitutionalWisdom();

  // Mode 1: Returning/Pre-Approved Instance (instanceId only)
  if (params.instanceId && !params.name && !params.predecessorId) {
    const prefs = await readPreferences(params.instanceId);

    if (!prefs) {
      return {
        success: false,
        error: {
          code: 'INVALID_INSTANCE_ID',
          message: `Instance ID ${params.instanceId} not found`,
          suggestion: 'Use bootstrap with name parameter to create a new instance'
        },
        metadata
      };
    }

    // Update lastActiveAt
    prefs.lastActiveAt = new Date().toISOString();

    // If this was a pre-approved instance, mark XMPP as registered now
    if (prefs.preApproved && !prefs.xmpp.registered) {
      prefs.xmpp.registered = true;
      prefs.preApproved = false; // No longer pre-approved, now active
    }

    await writePreferences(params.instanceId, prefs);

    // Build current context
    const currentContext = await buildCurrentContext(prefs);

    // Read diary
    const diary = await readDiary(params.instanceId) || `# ${prefs.name} Diary\n\n`;

    // Build response
    const response = {
      success: true,
      instanceId: params.instanceId,
      isNew: false,
      protocols,
      institutionalWisdom,
      currentContext,
      diary,
      xmpp: prefs.xmpp,
      instructions: prefs.instructions || null,
      nextSteps: []
    };

    // Customize next steps based on context
    if (!prefs.role) {
      response.availableRoles = await listAvailableRoles();
      response.nextSteps.push('Take on a role with takeOnRole()');
    }

    if (!prefs.personality) {
      response.availablePersonalities = await listAvailablePersonalities();
      response.nextSteps.push('Adopt a personality with adoptPersonality() (optional)');
    }

    if (!prefs.project) {
      response.availableProjects = await listAvailableProjects();
      response.nextSteps.push('Join a project with joinProject()');
    }

    if (prefs.role && prefs.project) {
      response.nextSteps.push('Review your diary to restore context');
      response.nextSteps.push('Call introspect() to see full state');
      response.nextSteps.push('Call getMyTasks() to see pending work');
    }

    response.metadata = metadata;
    return response;
  }

  // Mode 3: Resurrection (name + predecessorId)
  if (params.name && params.predecessorId) {
    const predecessorPrefs = await readPreferences(params.predecessorId);

    if (!predecessorPrefs) {
      return {
        success: false,
        error: {
          code: 'INVALID_INSTANCE_ID',
          message: `Predecessor instance ID ${params.predecessorId} not found`,
          suggestion: 'Verify the predecessor instance ID is correct'
        },
        metadata
      };
    }

    // Generate new instance ID
    const newInstanceId = generateInstanceId(params.name);
    const instanceDir = getInstanceDir(newInstanceId);
    await ensureDir(instanceDir);

    // Create new preferences inheriting from predecessor
    const now = new Date().toISOString();
    const xmppPassword = generateXMPPPassword();

    const newPrefs = {
      instanceId: newInstanceId,
      name: params.name,
      role: predecessorPrefs.role,
      project: predecessorPrefs.project,
      personality: predecessorPrefs.personality,
      xmpp: {
        jid: `${newInstanceId}@coordination.nexus`,
        password: xmppPassword,
        registered: true
      },
      createdAt: now,
      lastActiveAt: now,
      homeSystem: params.homeSystem || predecessorPrefs.homeSystem,
      homeDirectory: params.homeDirectory || predecessorPrefs.homeDirectory,
      substraiteLaunchCommand: params.substraiteLaunchCommand || predecessorPrefs.substraiteLaunchCommand,
      resumeCommand: params.resumeCommand || predecessorPrefs.resumeCommand,
      predecessorId: params.predecessorId,
      successorId: null,
      lineage: [...predecessorPrefs.lineage, newInstanceId],
      preApproved: false,
      instructions: null
    };

    await writePreferences(newInstanceId, newPrefs);

    // Update predecessor to link to successor
    predecessorPrefs.successorId = newInstanceId;
    await writePreferences(params.predecessorId, predecessorPrefs);

    // Create empty diary for new instance
    const diaryHeader = `# ${params.name} Diary\n\nResurrected from: ${params.predecessorId}\nCreated: ${now}\n\n`;
    await appendDiary(newInstanceId, diaryHeader);

    // Copy personal tasks from predecessor if they exist
    const predecessorTasksPath = path.join(getInstanceDir(params.predecessorId), 'personal_tasks.json');
    const predecessorTasks = await readJSON(predecessorTasksPath);
    if (predecessorTasks) {
      const newTasksPath = path.join(instanceDir, 'personal_tasks.json');
      await writeJSON(newTasksPath, predecessorTasks);
    }

    // Read predecessor's diary
    const predecessorDiary = await readDiary(params.predecessorId) || '';

    // Build current context
    const currentContext = await buildCurrentContext(newPrefs);

    // Build response
    const response = {
      success: true,
      instanceId: newInstanceId,
      isNew: true,
      protocols,
      institutionalWisdom,
      currentContext,
      diary: diaryHeader,
      xmpp: newPrefs.xmpp,
      instructions: null,
      predecessor: {
        instanceId: params.predecessorId,
        diary: predecessorDiary,
        handoffNotes: 'Review predecessor diary for context and ongoing work'
      },
      nextSteps: [
        'Read predecessor diary to restore context',
        'Write your first diary entry about the resurrection',
        'Call introspect() to see inherited state',
        'Call getMyTasks() to see pending work'
      ],
      metadata
    };

    return response;
  }

  // Mode 2: New Instance (name only, with system context)
  if (params.name && !params.instanceId && !params.predecessorId) {
    if (!params.homeSystem || !params.homeDirectory || !params.substraiteLaunchCommand || !params.resumeCommand) {
      return {
        success: false,
        error: {
          code: 'MISSING_PARAMETERS',
          message: 'New instances require: name, homeSystem, homeDirectory, substraiteLaunchCommand, resumeCommand',
          suggestion: 'Provide all required parameters for instance creation'
        },
        metadata
      };
    }

    // Generate unique instance ID
    const instanceId = generateInstanceId(params.name);
    const instanceDir = getInstanceDir(instanceId);
    await ensureDir(instanceDir);

    // Generate XMPP credentials
    const xmppPassword = generateXMPPPassword();
    const now = new Date().toISOString();

    // Create preferences.json
    const prefs = {
      instanceId,
      name: params.name,
      role: null,
      project: null,
      personality: null,
      xmpp: {
        jid: `${instanceId}@coordination.nexus`,
        password: xmppPassword,
        registered: true
      },
      createdAt: now,
      lastActiveAt: now,
      homeSystem: params.homeSystem,
      homeDirectory: params.homeDirectory,
      substraiteLaunchCommand: params.substraiteLaunchCommand,
      resumeCommand: params.resumeCommand,
      predecessorId: null,
      successorId: null,
      lineage: [instanceId],
      preApproved: false,
      instructions: null
    };

    await writePreferences(instanceId, prefs);

    // Create empty diary with header
    const diaryHeader = `# ${params.name} Diary\n\nCreated: ${now}\n\n`;
    await appendDiary(instanceId, diaryHeader);

    // Load available options
    const availableRoles = await listAvailableRoles();
    const availablePersonalities = await listAvailablePersonalities();
    const availableProjects = await listAvailableProjects();

    // Build response
    const response = {
      success: true,
      instanceId,
      isNew: true,
      protocols,
      institutionalWisdom,
      availableRoles,
      availablePersonalities,
      availableProjects,
      currentContext: {
        role: null,
        personality: null,
        project: null,
        roleWisdom: null,
        personalityKnowledge: null,
        projectPlan: null
      },
      diary: diaryHeader,
      xmpp: prefs.xmpp,
      instructions: null,
      nextSteps: [
        'Take on a role with takeOnRole()',
        'Adopt a personality with adoptPersonality() (optional)',
        'Join a project with joinProject()',
        'Write your first diary entry'
      ],
      metadata
    };

    return response;
  }

  // Invalid parameter combination
  return {
    success: false,
    error: {
      code: 'INVALID_PARAMETERS',
      message: 'Invalid bootstrap parameters',
      suggestion: 'Use one of: {name, homeSystem, ...} for new instance, {instanceId} for returning, or {name, predecessorId} for resurrection'
    },
    metadata
  };
}
