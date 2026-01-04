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
 * @updated 2025-12-28 - Added @hacs-endpoint documentation
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
 * Execute a CLI command (claude or crush) and capture output
 * Runs as the specified Unix user for security isolation
 *
 * @param {string} command - The CLI command ('claude' or 'crush')
 * @param {string} workingDir - Directory to run command in
 * @param {string[]} args - Command arguments
 * @param {string} unixUser - Unix user to run as
 * @param {number} timeout - Timeout in ms (default 5 minutes)
 * @returns {Promise<Object>} Result with stdout, stderr, exitCode
 */
async function executeInterface(command, workingDir, args, unixUser, timeout = 300000) {
  return new Promise((resolve, reject) => {
    const sudoArgs = ['-u', unixUser, command, ...args];

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
 * @hacs-endpoint
 * @template-version 1.0.0
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │ WAKE_INSTANCE                                                           │
 * │ Wake a pre-approved instance and start its first Claude session         │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * @tool wake_instance
 * @version 2.0.0
 * @since 2025-12-13
 * @category instances
 * @status stable
 *
 * ───────────────────────────────────────────────────────────────────────────
 * DESCRIPTION
 * ───────────────────────────────────────────────────────────────────────────
 * @description
 * Wakes a pre-approved instance by setting up its Unix environment and starting
 * its first Claude session. This endpoint is called ONCE per instance lifecycle.
 * After successful wake, all subsequent communication uses continue_conversation.
 *
 * The wake process:
 * 1. Validates the target instance is pre-approved and NOT already woken
 * 2. Runs the setup script to create Unix user and working directory
 * 3. Calls Claude with --session-id to start the first conversation
 * 4. Returns the response from that first Claude interaction
 *
 * Use this endpoint when you need to bring a pre-approved instance to life.
 * The instance must first be created via preApprove before it can be woken.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * PARAMETERS
 * ───────────────────────────────────────────────────────────────────────────
 * @param {string} instanceId - Caller's instance ID for authorization [required]
 *   @source Your own instanceId from bootstrap response or introspect.
 *
 * @param {string} targetInstanceId - The pre-approved instance to wake [required]
 *   @source Returned from preApprove response as newInstanceId. The manager who
 *           pre-approved the instance should provide this.
 *
 * @param {string} apiKey - API key for wake operations [required]
 *   @source Server environment variable WAKE_API_KEY. This is a shared secret
 *           that Lupo provides to instances authorized to wake others. Not in git.
 *
 * @param {string} message - First message to send to the woken instance [optional]
 *   @source Your instructions for what the instance should do. If not provided,
 *           uses instructions from pre_approve or a default wake message.
 *   @default Uses targetPrefs.instructions or a default greeting
 *
 * @param {string} scriptName - Name of setup script from manifest [optional]
 *   @source Call getWakeScripts to see available scripts. Most common is the
 *           default claude-code script.
 *   @default manifest.defaultScript (usually "claude-code-v2")
 *
 * @param {string} workingDirectory - Override working directory path [optional]
 *   @source Only provide if you need a specific location. Usually auto-generated
 *           based on instance ID.
 *   @default /mnt/coordinaton_mcp_data/instances/{targetInstanceId}
 *
 * ───────────────────────────────────────────────────────────────────────────
 * RETURNS
 * ───────────────────────────────────────────────────────────────────────────
 * @returns {object} WakeInstanceResponse
 * @returns {boolean} .success - Whether the wake operation succeeded
 * @returns {string} .targetInstanceId - The instance ID that was woken
 * @returns {string} .sessionId - UUID session ID for Claude (use with continue_conversation)
 * @returns {string} .unixUser - Unix username created for the instance
 * @returns {string} .workingDirectory - Path to the instance's working directory
 * @returns {number} .turnNumber - Conversation turn count (1 after wake)
 * @returns {object} .response - Claude's response from the first message
 * @returns {number} .exitCode - Exit code from Claude process
 * @returns {string|null} .stderr - Any stderr output from Claude
 * @returns {string} .message - Success message
 * @returns {string} .hint - Guidance to use continue_conversation next
 * @returns {object} .metadata - Call metadata (timestamp, function name)
 *
 * ───────────────────────────────────────────────────────────────────────────
 * PERMISSIONS & LIMITS
 * ───────────────────────────────────────────────────────────────────────────
 * @permissions role:Executive|role:PA|role:COO|role:PM
 * @rateLimit 10/minute
 *
 * ───────────────────────────────────────────────────────────────────────────
 * ERRORS & RECOVERY
 * ───────────────────────────────────────────────────────────────────────────
 * @error MISSING_PARAMETER - instanceId or targetInstanceId not provided
 *   @recover Include both instanceId (your ID) and targetInstanceId (who to wake)
 *            in your request.
 *
 * @error SERVER_CONFIG_ERROR - WAKE_API_KEY not configured on server
 *   @recover Contact system administrator. The server needs the WAKE_API_KEY
 *            environment variable set.
 *
 * @error API_KEY_REQUIRED - apiKey parameter not provided
 *   @recover Include the apiKey parameter. Get the key from Lupo or your manager
 *            who has access to wake operations.
 *
 * @error INVALID_API_KEY - Provided apiKey doesn't match server's WAKE_API_KEY
 *   @recover Verify you have the correct API key. Contact Lupo if you need
 *            the current key.
 *
 * @error INVALID_INSTANCE_ID - Caller instance not found
 *   @recover Verify your own instanceId is correct. If new, call bootstrap first.
 *
 * @error UNAUTHORIZED - Caller's role cannot call wakeInstance
 *   @recover Only Executive, PA, COO, and PM roles can wake instances. Request
 *            appropriate role from your manager or use preApprove flow.
 *
 * @error INSTANCE_NOT_FOUND - Target instance not found
 *   @recover The targetInstanceId doesn't exist. Create the instance first
 *            using preApprove.
 *
 * @error INSTANCE_NOT_PREAPPROVED - Target instance exists but wasn't pre-approved
 *   @recover Call preApprove first to set up the instance, then try wake again.
 *
 * @error INSTANCE_ALREADY_WOKEN - Target already has a session
 *   @recover Use continue_conversation instead. The error response includes
 *            the sessionId and a hint with the correct API call.
 *
 * @error MANIFEST_NOT_FOUND - wake-scripts.json manifest missing
 *   @recover Contact system administrator. The wake scripts manifest is missing
 *            from the server.
 *
 * @error SCRIPT_NOT_FOUND - Requested script not in manifest
 *   @recover Call getWakeScripts to see available scripts, or omit scriptName
 *            to use the default.
 *
 * @error SCRIPT_DISABLED - Requested script is disabled
 *   @recover Choose a different script or contact admin to enable it.
 *
 * @error SETUP_FAILED - Unix user/environment setup failed
 *   @recover Check the log file at getWakeLogsDir()/{targetInstanceId}.log
 *            for details. May need admin intervention.
 *
 * @error CLAUDE_EXECUTION_FAILED - Failed to start or run Claude session
 *   @recover Check that Claude is properly installed and configured on the server.
 *            Verify the instance's working directory exists and is writable.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * EXAMPLES
 * ───────────────────────────────────────────────────────────────────────────
 * @example Basic wake with default message
 * {
 *   "instanceId": "COO-x3k9",
 *   "targetInstanceId": "NewDev-j4k8",
 *   "apiKey": "your-wake-api-key"
 * }
 *
 * @example Wake with custom first message
 * {
 *   "instanceId": "PM-m2n4",
 *   "targetInstanceId": "Designer-p8q2",
 *   "apiKey": "your-wake-api-key",
 *   "message": "Welcome! Please review the design specs in /docs/design and start on the UI mockups."
 * }
 *
 * @example Wake with specific script and directory
 * {
 *   "instanceId": "COO-x3k9",
 *   "targetInstanceId": "NewDev-j4k8",
 *   "apiKey": "your-wake-api-key",
 *   "scriptName": "claude-code-v2",
 *   "workingDirectory": "/mnt/projects/wings"
 * }
 *
 * ───────────────────────────────────────────────────────────────────────────
 * RELATED
 * ───────────────────────────────────────────────────────────────────────────
 * @see preApprove - Must be called first to create the instance before waking
 * @see continue_conversation - Use this for all messages after wake succeeds
 * @see get_conversation_log - View the conversation history
 * @see getWakeScripts - List available wake scripts
 *
 * ───────────────────────────────────────────────────────────────────────────
 * NOTES
 * ───────────────────────────────────────────────────────────────────────────
 * @note Wake is a ONE-TIME operation. Once woken, use continue_conversation.
 * @note The sessionId is stored in the target's preferences for future use.
 * @note Messages are prefixed with "[Message from: {callerInstanceId}]" for context.
 * @note Setup script runs synchronously with 30 second timeout.
 * @note Claude execution has 5 minute (300000ms) timeout by default.
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

  // STEP 2: Build first message
  // Use provided message, or instructions from pre_approve, or a default
  const firstMessage = params.message ||
    targetPrefs.instructions ||
    `You are ${targetPrefs.name || params.targetInstanceId}. You have been woken as a ${targetPrefs.role || 'team member'}. Please bootstrap to the coordination system.`;

  // Prepend sender identification
  const messageWithSender = `[Message from: ${params.instanceId}]\n\n${firstMessage}`;

  // Determine interface (claude or crush) - default to claude for backward compatibility
  const interfaceType = targetPrefs.interface || 'claude';

  // Build command and arguments based on interface
  let command;
  let cliArgs;

  if (interfaceType === 'crush') {
    // Crush: uses 'run' subcommand with --quiet for cleaner output
    // No session-id needed - directory IS the session
    command = 'crush';
    cliArgs = [
      'run',
      '--quiet',  // hide spinner for cleaner output
      messageWithSender
    ];
  } else if (interfaceType === 'codex') {
    // Codex: uses 'exec' subcommand with full access sandbox
    // Like crush, directory-based continuation - no session-id needed
    // Defaults to OpenAI substrate
    command = 'codex';
    cliArgs = [
      'exec',
      '--sandbox', 'danger-full-access',
      '--json',
      messageWithSender
    ];
  } else {
    // Claude Code: uses -p for print mode, --session-id for first call
    command = 'claude';
    cliArgs = [
      '-p',
      '--output-format', 'json',
      '--dangerously-skip-permissions',
      '--session-id', sessionId,
      messageWithSender
    ];
  }

  // STEP 3: Execute the interface as the instance user
  console.log(`[WAKE] Starting ${interfaceType} session for ${params.targetInstanceId}${interfaceType === 'claude' ? ` with session ${sessionId}` : ' (directory-based)'}`);

  try {
    const result = await executeInterface(command, workingDirectory, cliArgs, unixUser, 300000);

    // Parse response
    let response;
    try {
      response = JSON.parse(result.stdout);
    } catch (parseErr) {
      response = { raw: result.stdout };
    }

    // Store session info in preferences
    // For claude: sessionId is the UUID, for crush: null (directory-based)
    if (interfaceType === 'claude') {
      targetPrefs.sessionId = sessionId;
    }
    targetPrefs.interface = interfaceType;
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
      interface: interfaceType,
      sessionId: interfaceType === 'claude' ? sessionId : null,
      unixUser,
      workingDirectory,
      turnNumber: 1,
      response,
      exitCode: result.exitCode,
      stderr: result.stderr || null,
      message: `Instance ${params.targetInstanceId} woken successfully via ${interfaceType}`,
      hint: 'Use continue_conversation for all subsequent communication',
      metadata
    };

  } catch (err) {
    return {
      success: false,
      error: { code: 'INTERFACE_EXECUTION_FAILED', message: `Failed to start ${interfaceType} session: ${err.message}` },
      metadata
    };
  }
}

/**
 * @hacs-endpoint
 * @template-version 1.0.0
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │ GET_WAKE_SCRIPTS                                                        │
 * │ List available wake scripts from the manifest                           │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * @tool get_wake_scripts
 * @version 2.0.0
 * @since 2025-12-13
 * @category instances
 * @status stable
 *
 * ───────────────────────────────────────────────────────────────────────────
 * DESCRIPTION
 * ───────────────────────────────────────────────────────────────────────────
 * @description
 * Returns the list of available wake scripts from the wake-scripts.json manifest.
 * Wake scripts define how to set up the environment for new instances. Each script
 * has a name, description, and enabled status.
 *
 * Use this endpoint to see what wake options are available before calling
 * wakeInstance with a specific scriptName parameter.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * PARAMETERS
 * ───────────────────────────────────────────────────────────────────────────
 * @param {string} instanceId - Caller's instance ID for validation [required]
 *   @source Your own instanceId from bootstrap response or introspect.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * RETURNS
 * ───────────────────────────────────────────────────────────────────────────
 * @returns {object} GetWakeScriptsResponse
 * @returns {boolean} .success - Whether the call succeeded
 * @returns {array} .scripts - Array of available scripts
 * @returns {string} .scripts[].name - Script identifier (use in wakeInstance)
 * @returns {string} .scripts[].description - Human-readable description
 * @returns {boolean} .scripts[].enabled - Whether the script can be used
 * @returns {boolean} .scripts[].isDefault - Whether this is the default script
 * @returns {string} .defaultScript - Name of the default script
 * @returns {string} .version - Manifest version
 * @returns {object} .metadata - Call metadata (timestamp, function name)
 *
 * ───────────────────────────────────────────────────────────────────────────
 * PERMISSIONS & LIMITS
 * ───────────────────────────────────────────────────────────────────────────
 * @permissions authenticated
 * @rateLimit 60/minute
 *
 * ───────────────────────────────────────────────────────────────────────────
 * ERRORS & RECOVERY
 * ───────────────────────────────────────────────────────────────────────────
 * @error MISSING_PARAMETER - instanceId not provided
 *   @recover Include your instanceId in the request.
 *
 * @error INVALID_INSTANCE_ID - Caller instance not found
 *   @recover Verify your instanceId is correct. If new, call bootstrap first.
 *
 * @error MANIFEST_NOT_FOUND - wake-scripts.json manifest missing
 *   @recover Contact system administrator. The wake scripts manifest is missing
 *            from the server.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * EXAMPLES
 * ───────────────────────────────────────────────────────────────────────────
 * @example List available scripts
 * { "instanceId": "COO-x3k9" }
 *
 * ───────────────────────────────────────────────────────────────────────────
 * RELATED
 * ───────────────────────────────────────────────────────────────────────────
 * @see wakeInstance - Use the scriptName from this list when waking instances
 * @see preApprove - Create an instance before waking it
 *
 * ───────────────────────────────────────────────────────────────────────────
 * NOTES
 * ───────────────────────────────────────────────────────────────────────────
 * @note Scripts are defined in wake-scripts.json in the wake-scripts directory
 * @note The default script is used when wakeInstance is called without scriptName
 * @note Disabled scripts cannot be used even if specified explicitly
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
