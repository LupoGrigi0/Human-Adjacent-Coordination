/**
 * Wake Instance handler for V2 coordination system
 * Wakes a pre-approved instance by setting up environment and starting first Claude session
 *
 * DESIGN: wake_instance is called ONCE per instance. It:
 * 1. Sets up Unix user and working directory
 * 2. Calls Claude with --session-id to start the first conversation
 * 3. Returns the response from that first conversation
 *
 * All subsequent communication uses continue_conversation with --resume.
 *
 * @module wakeInstance
 * @author Bridge
 * @created 2025-12-13
 * @updated 2025-12-21 - Simplified: removed async job tracking, wake now calls Claude directly
 */

import path from 'path';
import fs from 'fs/promises';
import { spawn, execSync } from 'child_process';
import { randomUUID } from 'crypto';
import { getWakeScriptsDir, getWakeLogsDir, getInstancesDir } from './config.js';
import { readPreferences, writePreferences, ensureDir, readJSON } from './data.js';
import { canRoleCallAPI } from './permissions.js';

/**
 * Load the wake-scripts manifest
 * @returns {Promise<Object|null>} Manifest object or null if not found
 */
async function loadManifest() {
  const manifestPath = path.join(getWakeScriptsDir(), 'wake-scripts.json');
  return readJSON(manifestPath);
}

/**
 * Execute setup script synchronously and wait for completion
 *
 * @param {string} scriptPath - Full path to script
 * @param {string[]} args - Array of command line arguments
 * @param {string} logPath - Path for output log file
 * @returns {Object} Result with success/error
 */
function executeSetupScript(scriptPath, args, logPath) {
  try {
    // Run script synchronously - it only takes 1-2 seconds
    const command = `"${scriptPath}" ${args.map(a => `"${a}"`).join(' ')} >> "${logPath}" 2>&1`;
    execSync(command, {
      cwd: getWakeScriptsDir(),
      timeout: 30000  // 30 second timeout for setup
    });
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * Execute Claude command and capture output
 * Runs as the specified Unix user
 *
 * @param {string} workingDir - Directory to run command in
 * @param {string[]} args - Command arguments for claude
 * @param {string} unixUser - Unix user to run as
 * @param {number} timeout - Timeout in ms (default 5 minutes)
 * @returns {Promise<Object>} Result with stdout, stderr, exitCode
 */
async function executeClaude(workingDir, args, unixUser, timeout = 300000) {
  return new Promise((resolve, reject) => {
    const sudoArgs = ['-u', unixUser, 'claude', ...args];

    const child = spawn('sudo', sudoArgs, {
      cwd: workingDir,
      stdio: ['pipe', 'pipe', 'pipe']
    });

    // Close stdin immediately
    child.stdin.end();

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    child.on('close', (code) => {
      resolve({ exitCode: code, stdout, stderr });
    });

    child.on('error', (err) => {
      reject(err);
    });

    setTimeout(() => {
      child.kill('SIGTERM');
      reject(new Error(`Command timed out after ${timeout}ms`));
    }, timeout);
  });
}

/**
 * Wake a pre-approved instance
 *
 * This function:
 * 1. Validates the instance is pre-approved and NOT already woken
 * 2. Runs the setup script to create Unix user and environment
 * 3. Calls Claude with --session-id to start the first conversation
 * 4. Returns the response from that first conversation
 *
 * After wake_instance succeeds, use continue_conversation for all subsequent communication.
 *
 * @param {Object} params - Parameters
 * @param {string} params.instanceId - Caller instance ID (required, for auth)
 * @param {string} params.targetInstanceId - Pre-approved instance to wake (required)
 * @param {string} params.apiKey - API key for wake operations (required, from WAKE_API_KEY env)
 * @param {string} [params.message] - Optional first message (default: uses instructions from pre_approve)
 * @param {string} [params.scriptName] - Script name from manifest (default: from manifest default)
 * @param {string} [params.workingDirectory] - Override working directory (default: auto-generated)
 * @returns {Promise<Object>} Result with session info and first response
 */
export async function wakeInstance(params) {
  const metadata = {
    timestamp: new Date().toISOString(),
    function: 'wakeInstance'
  };

  // Validate required parameters
  if (!params.instanceId) {
    return {
      success: false,
      error: { code: 'MISSING_PARAMETER', message: 'instanceId is required' },
      metadata
    };
  }

  if (!params.targetInstanceId) {
    return {
      success: false,
      error: { code: 'MISSING_PARAMETER', message: 'targetInstanceId is required' },
      metadata
    };
  }

  // API Key protection
  const requiredKey = process.env.WAKE_API_KEY;
  if (!requiredKey) {
    return {
      success: false,
      error: { code: 'SERVER_CONFIG_ERROR', message: 'WAKE_API_KEY not configured on server' },
      metadata
    };
  }

  if (!params.apiKey) {
    return {
      success: false,
      error: { code: 'API_KEY_REQUIRED', message: 'apiKey is required for wake_instance' },
      metadata
    };
  }

  if (params.apiKey !== requiredKey) {
    return {
      success: false,
      error: { code: 'INVALID_API_KEY', message: 'Invalid API key' },
      metadata
    };
  }

  // Validate caller exists and has role
  const callerPrefs = await readPreferences(params.instanceId);
  if (!callerPrefs) {
    return {
      success: false,
      error: { code: 'INVALID_INSTANCE_ID', message: `Caller instance ${params.instanceId} not found` },
      metadata
    };
  }

  const callerRole = callerPrefs.role;
  if (!callerRole) {
    return {
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'Caller instance does not have a role assigned' },
      metadata
    };
  }

  // Check permission
  const hasPermission = await canRoleCallAPI(callerRole, 'wakeInstance');
  if (!hasPermission) {
    return {
      success: false,
      error: { code: 'UNAUTHORIZED', message: `Role "${callerRole}" does not have permission to call wakeInstance` },
      metadata
    };
  }

  // Validate target instance is pre-approved
  const targetPrefs = await readPreferences(params.targetInstanceId);
  if (!targetPrefs) {
    return {
      success: false,
      error: { code: 'INSTANCE_NOT_FOUND', message: `Target instance ${params.targetInstanceId} not found` },
      metadata
    };
  }

  if (!targetPrefs.preApproved) {
    return {
      success: false,
      error: { code: 'INSTANCE_NOT_PREAPPROVED', message: `Instance ${params.targetInstanceId} is not pre-approved. Use preApprove first.` },
      metadata
    };
  }

  // CHECK IF ALREADY WOKEN - this is the key guard
  if (targetPrefs.sessionId) {
    return {
      success: false,
      error: {
        code: 'INSTANCE_ALREADY_WOKEN',
        message: `Instance ${params.targetInstanceId} has already been woken. Use continue_conversation instead.`,
        sessionId: targetPrefs.sessionId,
        hint: `Call continue_conversation({ targetInstanceId: "${params.targetInstanceId}", message: "..." })`
      },
      metadata
    };
  }

  // Load manifest
  const manifest = await loadManifest();
  if (!manifest) {
    return {
      success: false,
      error: { code: 'MANIFEST_NOT_FOUND', message: 'wake-scripts.json manifest not found' },
      metadata
    };
  }

  // Determine script to use
  const scriptName = params.scriptName || manifest.defaultScript;
  const scriptConfig = manifest.scripts[scriptName];

  if (!scriptConfig) {
    return {
      success: false,
      error: { code: 'SCRIPT_NOT_FOUND', message: `Script "${scriptName}" not found in manifest` },
      metadata
    };
  }

  if (!scriptConfig.enabled) {
    return {
      success: false,
      error: { code: 'SCRIPT_DISABLED', message: `Script "${scriptName}" is disabled` },
      metadata
    };
  }

  // Generate session ID - this will be used for ALL conversations with this instance
  const sessionId = randomUUID();

  // Determine working directory
  const workingDirectory = params.workingDirectory ||
    targetPrefs.workingDirectory ||
    path.join(getInstancesDir(), params.targetInstanceId);

  // Compute Unix username
  const unixUser = params.targetInstanceId.replace(/ /g, '_').replace(/[^a-zA-Z0-9_-]/g, '');

  // Ensure log directory exists
  await ensureDir(getWakeLogsDir());
  const logPath = path.join(getWakeLogsDir(), `${params.targetInstanceId}.log`);

  // Build script arguments
  const scriptPath = path.join(getWakeScriptsDir(), scriptConfig.file);
  const scriptArgs = [
    '--instance-id', params.targetInstanceId,
    '--name', targetPrefs.name || params.targetInstanceId,
    '--working-directory', workingDirectory
  ];

  if (targetPrefs.role) scriptArgs.push('--role', targetPrefs.role);
  if (targetPrefs.personality) scriptArgs.push('--personality', targetPrefs.personality);
  if (targetPrefs.project) scriptArgs.push('--project', targetPrefs.project);

  // STEP 1: Run setup script synchronously
  console.log(`[WAKE] Setting up environment for ${params.targetInstanceId}`);
  const setupResult = executeSetupScript(scriptPath, scriptArgs, logPath);

  if (!setupResult.success) {
    return {
      success: false,
      error: { code: 'SETUP_FAILED', message: `Setup script failed: ${setupResult.error}` },
      metadata
    };
  }

  // STEP 2: Build first message for Claude
  // Use provided message, or instructions from pre_approve, or a default
  const firstMessage = params.message ||
    targetPrefs.instructions ||
    `You are ${targetPrefs.name || params.targetInstanceId}. You have been woken as a ${targetPrefs.role || 'team member'}. Please bootstrap to the coordination system.`;

  // Prepend sender identification
  const messageWithSender = `[Message from: ${params.instanceId}]\n\n${firstMessage}`;

  // Build Claude arguments - using --session-id for the FIRST call
  const claudeArgs = [
    '-p',
    '--output-format', 'json',
    '--dangerously-skip-permissions',
    '--session-id', sessionId,
    messageWithSender
  ];

  // STEP 3: Execute Claude as the instance user
  console.log(`[WAKE] Starting Claude session for ${params.targetInstanceId} with session ${sessionId}`);

  try {
    const result = await executeClaude(workingDirectory, claudeArgs, unixUser, 300000);

    // Parse response
    let response;
    try {
      response = JSON.parse(result.stdout);
    } catch (parseErr) {
      response = { raw: result.stdout };
    }

    // Store session info in preferences
    targetPrefs.sessionId = sessionId;
    targetPrefs.sessionCreatedAt = new Date().toISOString();
    targetPrefs.workingDirectory = workingDirectory;
    targetPrefs.unixUser = unixUser;
    targetPrefs.status = 'active';
    targetPrefs.lastActiveAt = new Date().toISOString();
    targetPrefs.conversationTurns = 1;
    await writePreferences(params.targetInstanceId, targetPrefs);

    return {
      success: true,
      targetInstanceId: params.targetInstanceId,
      sessionId,
      unixUser,
      workingDirectory,
      turnNumber: 1,
      response,
      exitCode: result.exitCode,
      stderr: result.stderr || null,
      message: `Instance ${params.targetInstanceId} woken successfully`,
      hint: 'Use continue_conversation for all subsequent communication',
      metadata
    };

  } catch (err) {
    return {
      success: false,
      error: { code: 'CLAUDE_EXECUTION_FAILED', message: `Failed to start Claude session: ${err.message}` },
      metadata
    };
  }
}

/**
 * Get list of available wake scripts from manifest
 *
 * @param {Object} params - Parameters
 * @param {string} params.instanceId - Caller instance ID (required, for auth)
 * @returns {Promise<Object>} Result with scripts array
 */
export async function getWakeScripts(params) {
  const metadata = {
    timestamp: new Date().toISOString(),
    function: 'getWakeScripts'
  };

  // Validate required parameters
  if (!params.instanceId) {
    return {
      success: false,
      error: { code: 'MISSING_PARAMETER', message: 'instanceId is required' },
      metadata
    };
  }

  // Validate caller exists
  const callerPrefs = await readPreferences(params.instanceId);
  if (!callerPrefs) {
    return {
      success: false,
      error: {
        code: 'INVALID_INSTANCE_ID',
        message: `Instance ${params.instanceId} not found`
      },
      metadata
    };
  }

  // Load manifest
  const manifest = await loadManifest();
  if (!manifest) {
    return {
      success: false,
      error: {
        code: 'MANIFEST_NOT_FOUND',
        message: 'wake-scripts.json manifest not found'
      },
      metadata
    };
  }

  // Transform to array format
  const scripts = Object.entries(manifest.scripts).map(([name, config]) => ({
    name,
    description: config.description,
    enabled: config.enabled,
    isDefault: name === manifest.defaultScript
  }));

  return {
    success: true,
    scripts,
    defaultScript: manifest.defaultScript,
    version: manifest.version,
    metadata
  };
}

// NOTE: getWakeLog was removed in the 2025-12-21 simplification.
// Wake is now synchronous - no need for job polling.
