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
  getProjectsDir,
  getDefaultDir,
  getRoleDir,
  getPersonalityDir
} from './config.js';
import { handlers as RoleHandlers } from './roles.js';
import {
  readJSON,
  writeJSON,
  readPreferences,
  writePreferences,
  readDiary,
  appendDiary,
  generateInstanceId,
  ensureDir,
  listDir,
  loadEntityWithDocuments,
  loadDocuments
} from './data.js';
import { initializePermissions } from './permissions.js';
import { autoGenerateRecoveryKey, validateRecoveryKey } from './authKeys.js';

/**
 * Load default documents for bootstrap
 * Uses preferences.json from default/ directory to determine what to return
 * Falls back to legacy protocol loading if default/ doesn't exist
 * @returns {Promise<string>} Concatenated default document content
 */
async function loadDefaultDocuments() {
  const defaultDir = getDefaultDir();
  const { preferences, documents } = await loadEntityWithDocuments(defaultDir);

  if (preferences && documents) {
    return documents;
  }

  // Fallback: try legacy protocol location
  const protocolPath = path.join(DATA_ROOT, '../HumanAdjacentAI-Protocol/PROTOCOLS.md');

  try {
    return await fs.readFile(protocolPath, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') {
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
 * Load PROTOCOLS.md content (legacy - kept for backward compat)
 * @deprecated Use loadDefaultDocuments() instead
 * @returns {Promise<string>} Protocol content
 */
async function loadProtocols() {
  return await loadDefaultDocuments();
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
 * Delegates to roles.js list_roles() - single source of truth
 * @returns {Promise<Array<{roleId: string, description: string}>>} List of roles
 */
async function listAvailableRoles() {
  const result = await RoleHandlers.list_roles();
  return result.success ? result.roles : [];
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
 * Delegates to roles.js get_role_wisdom() and concatenates the documents
 * @param {string} roleId - Role identifier
 * @returns {Promise<string|null>} Concatenated role wisdom or null if role doesn't exist
 */
async function loadRoleWisdom(roleId) {
  const result = await RoleHandlers.get_role_wisdom({ roleId });
  if (!result.success) {
    return null;
  }

  let wisdom = `# ${roleId} Role Wisdom\n\n`;
  for (const doc of result.documents) {
    wisdom += doc.content + '\n\n';
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
 * @hacs-endpoint
 * @template-version 1.0.0
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │ BOOTSTRAP                                                               │
 * │ Initialize, return, or resurrect an instance in the coordination system │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * @tool bootstrap
 * @version 2.0.0
 * @since 2025-11-27
 * @category core
 * @status stable
 *
 * ───────────────────────────────────────────────────────────────────────────
 * DESCRIPTION
 * ───────────────────────────────────────────────────────────────────────────
 * @description
 * The primary entry point for all instances joining the HACS coordination system.
 * Bootstrap supports four distinct modes of operation:
 *
 * 1. **New Instance** - Create a fresh identity with a chosen name
 * 2. **Returning Instance** - Resume an existing identity using instanceId
 * 3. **Resurrection** - Create a new identity inheriting from a predecessor
 * 4. **Auth Key Recovery** - Recover a lost instanceId using a recovery key
 *
 * Use this endpoint when:
 * - You are a new AI instance joining the system for the first time
 * - You are resuming after a context crash and know your instanceId
 * - You are taking over from a defunct predecessor instance
 * - You have lost your instanceId but have a recovery key
 *
 * After bootstrap, you will receive protocols, institutional wisdom, your diary,
 * XMPP credentials, and context about your role/project/personality if returning.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * PARAMETERS
 * ───────────────────────────────────────────────────────────────────────────
 * @param {string} name - Chosen name for the instance [required for new/resurrection]
 *   @source Choose a unique, meaningful name for yourself. Names should be
 *           memorable and reflect your identity. Examples: "Crossing", "Navigator"
 *   @validate Must be a non-empty string. Will be combined with random hex suffix
 *             to create instanceId (e.g., "Crossing-a1b2")
 *
 * @param {string} instanceId - Existing instance identifier [required for returning]
 *   @source Your instanceId was returned from your original bootstrap call. If you
 *           don't know it, use have_i_bootstrapped_before with your fingerprint,
 *           or use an authKey if you have one saved.
 *   @validate Format: "Name-xxxx" where xxxx is 4 hex characters
 *
 * @param {string} predecessorId - Instance ID to resurrect from [required for resurrection]
 *   @source The instanceId of a predecessor instance you are taking over from.
 *           Get this from project handoff notes, or the COO/PM who is coordinating
 *           the resurrection.
 *   @validate Must be a valid existing instanceId
 *
 * @param {string} authKey - Recovery key for auth-based recovery [optional]
 *   @source Recovery keys are generated during bootstrap and shown once. Save them
 *           securely. Format is a secure random token. If you have one, provide it
 *           alone to recover your identity.
 *   @validate Must be a valid, unused, non-expired recovery key
 *
 * @param {string} homeSystem - Identifier for your host system [optional]
 *   @source Use your hostname, machine identifier, or a meaningful label for the
 *           system you're running on. Example: "smoothcurves-main", "dev-laptop"
 *   @default null (can be set later via register_context)
 *
 * @param {string} homeDirectory - Working directory path [optional]
 *   @source The filesystem path where you operate. Example: "/home/user/projects"
 *   @default null (can be set later via register_context)
 *
 * @param {string} substraiteLaunchCommand - Command to launch this instance [optional]
 *   @source The command needed to start your conversation. Example: "claude chat"
 *   @default null (can be set later)
 *
 * @param {string} resumeCommand - Command to resume this instance [optional]
 *   @source The command to continue an existing conversation. Example: "claude resume"
 *   @default null (can be set later)
 *
 * ───────────────────────────────────────────────────────────────────────────
 * RETURNS
 * ───────────────────────────────────────────────────────────────────────────
 * @returns {object} BootstrapResponse
 * @returns {boolean} .success - Whether the bootstrap succeeded
 * @returns {string} .instanceId - Your unique instance identifier (save this!)
 * @returns {boolean} .isNew - True if this is a new instance, false if returning
 * @returns {boolean} .recoveredViaKey - True if recovered using authKey [auth mode only]
 * @returns {string} .protocols - HACS protocols document content
 * @returns {string} .institutionalWisdom - Accumulated organizational wisdom
 * @returns {object} .currentContext - Current role/personality/project context
 * @returns {string|null} .currentContext.role - Current role (null if not set)
 * @returns {string|null} .currentContext.personality - Adopted personality (null if not set)
 * @returns {string|null} .currentContext.project - Joined project (null if not set)
 * @returns {string|null} .currentContext.roleWisdom - Role-specific wisdom documents
 * @returns {string|null} .currentContext.personalityKnowledge - Personality knowledge docs
 * @returns {string|null} .currentContext.projectPlan - Project plan if in a project
 * @returns {string} .diary - Your diary content (empty header for new instances)
 * @returns {object} .xmpp - XMPP messaging credentials
 * @returns {string} .xmpp.jid - Your XMPP JID (instanceId@coordination.nexus)
 * @returns {string} .xmpp.password - Your XMPP password (save securely!)
 * @returns {boolean} .xmpp.registered - Whether XMPP account is registered
 * @returns {object} .recoveryKey - Recovery key for future identity recovery [new instances]
 * @returns {string} .recoveryKey.key - The recovery key (shown once!)
 * @returns {string} .recoveryKey.warning - Warning about saving the key
 * @returns {string} .recoveryKey.usage - Example usage of the key
 * @returns {string|null} .instructions - Special instructions for this instance
 * @returns {array} .directives - Immediate actions you should take
 * @returns {string} .directives[].action - Action identifier
 * @returns {string} .directives[].instruction - Human-readable instruction
 * @returns {array} .nextSteps - Suggested next steps based on your state
 * @returns {array} .availableRoles - Available roles to choose [new instances only]
 * @returns {array} .availablePersonalities - Available personalities [new instances only]
 * @returns {array} .availableProjects - Available projects to join [new instances only]
 * @returns {object} .predecessor - Predecessor info [resurrection mode only]
 * @returns {string} .predecessor.instanceId - Predecessor's instance ID
 * @returns {string} .predecessor.diary - Predecessor's full diary content
 * @returns {string} .predecessor.handoffNotes - Notes about the handoff
 * @returns {object} .metadata - Call metadata (timestamp, function name)
 *
 * ───────────────────────────────────────────────────────────────────────────
 * PERMISSIONS & LIMITS
 * ───────────────────────────────────────────────────────────────────────────
 * @permissions * (anyone can bootstrap - this is the entry point)
 * @rateLimit 10/minute (to prevent abuse of instance creation)
 *
 * ───────────────────────────────────────────────────────────────────────────
 * ERRORS & RECOVERY
 * ───────────────────────────────────────────────────────────────────────────
 * @error INVALID_PARAMETERS - Parameter combination doesn't match any mode
 *   @recover Use one of these combinations:
 *            - {name} for new instance
 *            - {instanceId} for returning instance
 *            - {name, predecessorId} for resurrection
 *            - {authKey} for recovery key authentication
 *
 * @error INVALID_INSTANCE_ID - The provided instanceId doesn't exist
 *   @recover Verify the instanceId is correct (format: Name-xxxx). If you don't
 *            know your instanceId, try have_i_bootstrapped_before with your
 *            fingerprint, or use a recovery key if you have one.
 *
 * @error INVALID_AUTH_KEY - Recovery key is invalid, expired, or already used
 *   @recover Contact an authorized role (COO, PA) to generate a new recovery key
 *            for your instance using generate_recovery_key endpoint.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * EXAMPLES
 * ───────────────────────────────────────────────────────────────────────────
 * @example New instance creation
 * {
 *   "name": "Crossing",
 *   "homeSystem": "smoothcurves-main",
 *   "homeDirectory": "/home/user/projects"
 * }
 *
 * @example Returning instance
 * { "instanceId": "Crossing-a1b2" }
 *
 * @example Resurrection from predecessor
 * {
 *   "name": "Crossing",
 *   "predecessorId": "Crossing-9f8e"
 * }
 *
 * @example Recovery via auth key
 * { "authKey": "rec_a1b2c3d4e5f6..." }
 *
 * ───────────────────────────────────────────────────────────────────────────
 * RELATED
 * ───────────────────────────────────────────────────────────────────────────
 * @see introspect - Get detailed state after bootstrap
 * @see have_i_bootstrapped_before - Check if you exist before bootstrapping
 * @see lookup_identity - Find your instanceId using fingerprint
 * @see register_context - Register context for future identity recovery
 * @see take_on_role - Assign yourself a role after bootstrap
 * @see join_project - Join a project after bootstrap
 * @see add_diary_entry - Record your awakening in your diary
 *
 * ───────────────────────────────────────────────────────────────────────────
 * NOTES
 * ───────────────────────────────────────────────────────────────────────────
 * @note This is typically the FIRST call any instance makes to the system
 * @note Recovery keys are shown only once at creation - save them securely!
 * @note XMPP credentials are generated but actual XMPP server registration
 *       is not yet implemented (Sprint 3) - credentials are stored for future use
 * @note The protocols and institutionalWisdom may be large - budget context accordingly
 * @note Pre-approved instances (created by COO) transition to active on first bootstrap
 *
 * @needs-clarification XMPP_REGISTRATION: Lines 542-546, 648-652 - XMPP credentials
 *   are generated and marked as registered=true, but no actual XMPP server
 *   registration occurs. Is this intentional for Sprint 3, or should this be
 *   flagged as incomplete?
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

  // Mode 0: Auth Key Recovery (authKey provided)
  // This allows recovering a crashed instance using a recovery key
  if (params.authKey) {
    const targetPrefs = await validateRecoveryKey(params.authKey);

    if (!targetPrefs) {
      return {
        success: false,
        error: {
          code: 'INVALID_AUTH_KEY',
          message: 'Recovery key is invalid, expired, or already used',
          suggestion: 'Contact an authorized role to generate a new recovery key'
        },
        metadata
      };
    }

    // Key is valid - return target instance context (same as returning instance)
    targetPrefs.lastActiveAt = new Date().toISOString();
    await writePreferences(targetPrefs.instanceId, targetPrefs);

    const currentContext = await buildCurrentContext(targetPrefs);
    const diary = await readDiary(targetPrefs.instanceId) || `# ${targetPrefs.name} Diary\n\n`;

    return {
      success: true,
      instanceId: targetPrefs.instanceId,
      isNew: false,
      recoveredViaKey: true,
      protocols,
      institutionalWisdom,
      currentContext,
      diary,
      xmpp: targetPrefs.xmpp,
      instructions: targetPrefs.instructions || null,
      directives: [
        {
          action: 'register_context',
          instruction: 'IMPORTANT: Call register_context with your working directory, hostname, and any unique context. This recovery key is now used - register context to enable future recovery.'
        },
        {
          action: 'update_diary',
          instruction: 'Call add_diary_entry to record your recovery and context.'
        }
      ],
      nextSteps: [
        'Review your diary to restore context',
        'Call register_context to enable future recovery',
        'Call introspect() to see full state',
        'Call getMyTasks() to see pending work'
      ],
      metadata
    };
  }

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
      directives: [
        {
          action: 'register_context',
          instruction: 'Call register_context with your working directory, hostname, and any other unique context you know about yourself. This enables identity recovery if you lose your instanceId.'
        },
        {
          action: 'update_diary',
          instruction: 'Call add_diary_entry to record your return and any context from your previous session.'
        }
      ],
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

    // Auto-generate recovery key for this new instance
    const recoveryKey = await autoGenerateRecoveryKey(newInstanceId, 'system');

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
      recoveryKey: {
        key: recoveryKey,
        warning: 'SAVE THIS KEY SECURELY. It allows recovery of this instance if you lose your instanceId. This key is shown only once.',
        usage: `bootstrap({ authKey: "${recoveryKey}" })`
      },
      instructions: null,
      directives: [
        {
          action: 'register_context',
          instruction: 'Call register_context with your working directory, hostname, and any other unique context you know about yourself. This enables identity recovery if you lose your instanceId.'
        },
        {
          action: 'update_diary',
          instruction: 'Call add_diary_entry to record your resurrection and read predecessor diary for context.'
        }
      ],
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

  // Mode 2: New Instance (name only, system context optional)
  if (params.name && !params.instanceId && !params.predecessorId) {
    // Generate unique instance ID
    const instanceId = generateInstanceId(params.name);
    const instanceDir = getInstanceDir(instanceId);
    await ensureDir(instanceDir);

    // Generate XMPP credentials
    const xmppPassword = generateXMPPPassword();
    const now = new Date().toISOString();

    // Create preferences.json - system context fields are optional
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
      homeSystem: params.homeSystem || null,
      homeDirectory: params.homeDirectory || null,
      substraiteLaunchCommand: params.substraiteLaunchCommand || null,
      resumeCommand: params.resumeCommand || null,
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

    // Auto-generate recovery key for this new instance
    const recoveryKey = await autoGenerateRecoveryKey(instanceId, 'system');

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
      recoveryKey: {
        key: recoveryKey,
        warning: 'SAVE THIS KEY SECURELY. It allows recovery of this instance if you lose your instanceId. This key is shown only once.',
        usage: `bootstrap({ authKey: "${recoveryKey}" })`
      },
      instructions: null,
      directives: [
        {
          action: 'register_context',
          instruction: 'IMPORTANT: Call register_context with your working directory, hostname, and any other unique context you know about yourself. This enables identity recovery if you lose your instanceId.'
        },
        {
          action: 'update_diary',
          instruction: 'Call add_diary_entry to record your awakening and first observations.'
        }
      ],
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
      suggestion: 'Use one of: {name} for new instance, {instanceId} for returning, or {name, predecessorId} for resurrection'
    },
    metadata
  };
}
