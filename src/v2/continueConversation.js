/**
 * Continue Conversation handler for V2 coordination system
 * Enables communication with woken instances via Claude's session persistence
 *
 * DESIGN: continue_conversation is used for ALL communication AFTER wake_instance.
 * - wake_instance calls Claude with --session-id (turn 1)
 * - continue_conversation ALWAYS uses --resume (turn 2+)
 *
 * @module continueConversation
 * @author Bridge
 * @created 2025-12-19
 * @updated 2025-12-21 - Simplified: always use --resume, wake handles first call
 */

import path from 'path';
import fs from 'fs/promises';
import { spawn } from 'child_process';
import { getInstancesDir } from './config.js';
import { readPreferences, writePreferences } from './data.js';
import { canRoleCallAPI } from './permissions.js';

/**
 * Convert instance ID to Unix username
 * Must match the logic in claude-code-setup.sh
 *
 * @param {string} instanceId - Instance ID
 * @returns {string} Sanitized Unix username
 */
function instanceIdToUnixUser(instanceId) {
  // Replace spaces with underscores, remove non-alphanumeric chars except _ and -
  return instanceId.replace(/ /g, '_').replace(/[^a-zA-Z0-9_-]/g, '');
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
    // Run as the instance's Unix user via sudo
    // This provides security isolation between instances
    const sudoArgs = ['-u', unixUser, command, ...args];

    const child = spawn('sudo', sudoArgs, {
      cwd: workingDir,
      stdio: ['pipe', 'pipe', 'pipe']
    });

    // Close stdin immediately - we're not sending any input
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
      resolve({
        exitCode: code,
        stdout,
        stderr
      });
    });

    child.on('error', (err) => {
      reject(err);
    });

    // Set up timeout
    setTimeout(() => {
      child.kill('SIGTERM');
      reject(new Error(`Command timed out after ${timeout}ms`));
    }, timeout);
  });
}

/**
 * Log a conversation turn to the instance's conversation log
 *
 * @param {string} instanceId - Instance ID
 * @param {Object} turn - Turn data to log
 * @returns {Promise<void>}
 */
async function logConversationTurn(instanceId, turn) {
  const logPath = path.join(getInstancesDir(), instanceId, 'conversation.log');

  // Read existing log or create new array
  let log = [];
  try {
    const existing = await fs.readFile(logPath, 'utf8');
    log = JSON.parse(existing);
  } catch (err) {
    // File doesn't exist or invalid JSON - start fresh
  }

  // Add new turn
  log.push(turn);

  // Write back
  await fs.writeFile(logPath, JSON.stringify(log, null, 2));
}

/**
 * @hacs-endpoint
 * @template-version 1.0.0
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │ CONTINUE_CONVERSATION                                                   │
 * │ Send a message to a woken instance and receive its response             │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * @tool continue_conversation
 * @version 2.0.0
 * @since 2025-12-19
 * @category instances
 * @status stable
 *
 * ───────────────────────────────────────────────────────────────────────────
 * DESCRIPTION
 * ───────────────────────────────────────────────────────────────────────────
 * @description
 * Sends a message to an instance that was previously woken via wake_instance,
 * using Claude's session persistence (--resume) to maintain conversation context.
 * Returns the instance's response synchronously.
 *
 * Use this endpoint to communicate with woken instances after the initial wake.
 * The first turn is handled by wake_instance; all subsequent turns use this API.
 * Messages are automatically prefixed with sender identification so the target
 * instance knows who is communicating with them.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * PARAMETERS
 * ───────────────────────────────────────────────────────────────────────────
 * @param {string} instanceId - Caller's instance ID for authentication [required]
 *   @source Your instanceId from bootstrap response, or recovered via lookup_identity.
 *           This identifies who is sending the message to the target instance.
 *
 * @param {string} targetInstanceId - Instance ID of the woken instance to talk to [required]
 *   @source The instanceId returned from pre_approve or wake_instance. Must be an
 *           instance that was previously woken via wake_instance (has a sessionId).
 *
 * @param {string} message - The message to send to the target instance [required]
 *   @source Your message content. Will be prefixed with "[Message from: {instanceId}]"
 *           automatically so the target knows who is communicating.
 *
 * @param {string} apiKey - API key for wake/continue operations [required]
 *   @source Must match the server's WAKE_API_KEY environment variable.
 *           Get this from the system administrator or your manager.
 *
 * @param {object} options - Optional configuration settings [optional]
 *   @source Set based on your output needs
 *   @default {}
 *
 * @param {string} options.outputFormat - Claude output format [optional]
 *   @source Choose based on how you want to process the response
 *   @default "json"
 *   @enum text|json|stream-json
 *
 * @param {boolean} options.includeThinking - Include Claude's thinking/partial messages [optional]
 *   @source Set to true if you need to see Claude's reasoning process
 *   @default false
 *
 * @param {number} options.timeout - Timeout in milliseconds [optional]
 *   @source Increase for complex tasks that may take longer
 *   @default 300000 (5 minutes)
 *   @validate min: 1000, max: 600000
 *
 * ───────────────────────────────────────────────────────────────────────────
 * RETURNS
 * ───────────────────────────────────────────────────────────────────────────
 * @returns {object} ContinueConversationResponse
 * @returns {boolean} .success - Whether the call succeeded
 * @returns {string} .targetInstanceId - The instance that was communicated with
 * @returns {string} .sessionId - The Claude session ID used for persistence
 * @returns {number} .turnNumber - The conversation turn number (2+ since wake is turn 1)
 * @returns {object} .response - The parsed response from Claude (format depends on outputFormat)
 * @returns {number} .exitCode - Claude process exit code (0 = success)
 * @returns {string|null} .stderr - Any stderr output from Claude, if present
 * @returns {object} .metadata - Call metadata (timestamp, function name)
 *
 * ───────────────────────────────────────────────────────────────────────────
 * PERMISSIONS & LIMITS
 * ───────────────────────────────────────────────────────────────────────────
 * @permissions authenticated + apiKey
 * @rateLimit 60/minute
 *
 * @needs-clarification PERMISSION_UNCLEAR: Permission check exists in code but
 *   result is not enforced (lines 213-217 compute hasPermission but don't use it).
 *   Comment says "can be tightened later". Currently any authenticated caller
 *   with valid apiKey can use this endpoint.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * ERRORS & RECOVERY
 * ───────────────────────────────────────────────────────────────────────────
 * @error MISSING_PARAMETER - Required parameter not provided
 *   @recover Include all required parameters: instanceId, targetInstanceId,
 *            message, and apiKey.
 *
 * @error SERVER_CONFIG_ERROR - WAKE_API_KEY not configured on server
 *   @recover Contact system administrator to configure the WAKE_API_KEY
 *            environment variable on the server.
 *
 * @error API_KEY_REQUIRED - apiKey parameter not provided
 *   @recover Include apiKey in your request. Get the key from your manager
 *            or system administrator.
 *
 * @error INVALID_API_KEY - Provided apiKey doesn't match server's WAKE_API_KEY
 *   @recover Verify you have the correct API key. Contact your manager if unsure.
 *
 * @error INVALID_INSTANCE_ID - Caller instance not found
 *   @recover Verify your instanceId is correct. If you're new, call bootstrap first.
 *            If recovering, use lookup_identity with your fingerprint.
 *
 * @error INSTANCE_NOT_FOUND - Target instance not found
 *   @recover Verify the targetInstanceId is correct. The instance must exist
 *            and have been pre-approved via pre_approve.
 *
 * @error NO_SESSION - Target instance has no active session
 *   @recover The target instance must be woken via wake_instance before you
 *            can continue a conversation. Call wake_instance first.
 *
 * @error WORKING_DIR_NOT_FOUND - Working directory not accessible
 *   @recover The target instance's working directory doesn't exist or isn't
 *            accessible. Check that the instance was set up correctly.
 *
 * @error EXECUTION_FAILED - Failed to execute Claude command
 *   @recover Check that Claude is installed and accessible. The error message
 *            will contain details. May be a timeout or process error.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * EXAMPLES
 * ───────────────────────────────────────────────────────────────────────────
 * @example Basic message
 * {
 *   "instanceId": "COO-x3k9",
 *   "apiKey": "your-wake-api-key",
 *   "targetInstanceId": "Developer-j4k8",
 *   "message": "How is the auth module coming along?"
 * }
 *
 * @example With custom timeout and text output
 * {
 *   "instanceId": "COO-x3k9",
 *   "apiKey": "your-wake-api-key",
 *   "targetInstanceId": "Developer-j4k8",
 *   "message": "Please analyze this codebase and provide recommendations",
 *   "options": {
 *     "outputFormat": "text",
 *     "timeout": 600000
 *   }
 * }
 *
 * ───────────────────────────────────────────────────────────────────────────
 * RELATED
 * ───────────────────────────────────────────────────────────────────────────
 * @see wake_instance - Must call this first to wake the target instance
 * @see pre_approve - Create an instance before waking it
 * @see get_conversation_log - Retrieve conversation history with an instance
 *
 * ───────────────────────────────────────────────────────────────────────────
 * NOTES
 * ───────────────────────────────────────────────────────────────────────────
 * @note wake_instance handles turn 1; this API handles turn 2+
 * @note Messages are prefixed with "[Message from: {instanceId}]" automatically
 * @note Each turn is logged to {targetInstanceId}/conversation.log
 * @note Runs Claude as the target instance's Unix user for security isolation
 * @note Uses sudo to run as the instance-specific Unix user
 */
export async function continueConversation(params) {
  const metadata = {
    timestamp: new Date().toISOString(),
    function: 'continueConversation'
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

  if (!params.message) {
    return {
      success: false,
      error: { code: 'MISSING_PARAMETER', message: 'message is required' },
      metadata
    };
  }

  // API Key protection - required for continue operations
  const requiredKey = process.env.WAKE_API_KEY;
  if (!requiredKey) {
    return {
      success: false,
      error: {
        code: 'SERVER_CONFIG_ERROR',
        message: 'WAKE_API_KEY not configured on server'
      },
      metadata
    };
  }

  if (!params.apiKey) {
    return {
      success: false,
      error: {
        code: 'API_KEY_REQUIRED',
        message: 'apiKey is required for continue_conversation'
      },
      metadata
    };
  }

  if (params.apiKey !== requiredKey) {
    return {
      success: false,
      error: {
        code: 'INVALID_API_KEY',
        message: 'Invalid API key'
      },
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
        message: `Caller instance ${params.instanceId} not found`
      },
      metadata
    };
  }

  // Check permission (same as wakeInstance - PM and above)
  const callerRole = callerPrefs.role;
  if (callerRole) {
    const hasPermission = await canRoleCallAPI(callerRole, 'continueConversation');
    // If permission not explicitly defined, allow (for now)
    // This can be tightened later
  }

  // Validate target instance exists and has a session
  const targetPrefs = await readPreferences(params.targetInstanceId);
  if (!targetPrefs) {
    return {
      success: false,
      error: {
        code: 'INSTANCE_NOT_FOUND',
        message: `Target instance ${params.targetInstanceId} not found`
      },
      metadata
    };
  }

  // Check if instance was woken
  // Claude instances need sessionId, Crush/Codex instances just need to have been woken (status: 'active')
  const interfaceType = targetPrefs.interface || 'claude';
  const wasWoken = (interfaceType === 'crush' || interfaceType === 'codex')
    ? (targetPrefs.status === 'active' || targetPrefs.conversationTurns >= 1)
    : !!targetPrefs.sessionId;

  if (!wasWoken) {
    return {
      success: false,
      error: {
        code: 'NO_SESSION',
        message: `Instance ${params.targetInstanceId} does not have an active session. Was it woken via wakeInstance?`
      },
      metadata
    };
  }

  // Determine working directory
  const workingDir = targetPrefs.workingDirectory ||
    path.join(getInstancesDir(), params.targetInstanceId);

  // Ensure working directory exists
  try {
    await fs.access(workingDir);
  } catch (err) {
    return {
      success: false,
      error: {
        code: 'WORKING_DIR_NOT_FOUND',
        message: `Working directory ${workingDir} not accessible`
      },
      metadata
    };
  }

  // Determine Unix user for this instance
  // This must match the user created by claude-code-setup.sh
  const unixUser = instanceIdToUnixUser(params.targetInstanceId);

  // Build command arguments based on interface
  const options = params.options || {};
  const outputFormat = options.outputFormat || 'json';
  const timeout = options.timeout || 300000;

  // Track conversation turn (wake_instance is turn 1, so we start at 2)
  const turnNumber = (targetPrefs.conversationTurns || 1) + 1;

  // Prepend sender identification so the instance knows who's talking
  const messageWithSender = `[Message from: ${params.instanceId}]\n\n${params.message}`;

  // Build command and arguments based on interface
  // (interfaceType was determined earlier in the session check)
  let command;
  let cliArgs;

  if (interfaceType === 'crush') {
    // Crush: uses 'run' subcommand with --quiet for cleaner output
    // Directory-based continuation - no resume flag needed
    command = 'crush';
    cliArgs = [
      'run',
      '--quiet',  // hide spinner for cleaner output
      messageWithSender
    ];
  } else if (interfaceType === 'codex') {
    // Codex: uses 'exec resume --last' for non-interactive session continuation
    // (codex resume is interactive TUI; codex exec resume is non-interactive)
    command = 'codex';
    cliArgs = [
      'exec',
      'resume',
      '--last',  // automatically resume most recent session
      '--json',
      messageWithSender
    ];
  } else {
    // Claude Code: uses -p for print mode, --resume for continuation
    command = 'claude';
    cliArgs = [
      '-p',  // Print mode (non-interactive)
      '--output-format', outputFormat,
      '--dangerously-skip-permissions',
      '--resume', targetPrefs.sessionId  // Use --resume (wake_instance did --session-id)
    ];

    if (options.includeThinking) {
      cliArgs.push('--include-partial-messages');
    }

    // Add the message as the final argument
    cliArgs.push(messageWithSender);
  }

  // Execute interface as the instance user
  try {
    const result = await executeInterface(command, workingDir, cliArgs, unixUser, timeout);

    // Parse response based on output format
    let response;
    if (outputFormat === 'json' || outputFormat === 'stream-json') {
      try {
        response = JSON.parse(result.stdout);
      } catch (parseErr) {
        // If JSON parse fails, return raw stdout
        response = { raw: result.stdout };
      }
    } else {
      response = { text: result.stdout };
    }

    // Log the conversation turn
    const turn = {
      turn: turnNumber,
      timestamp: new Date().toISOString(),
      input: {
        from: params.instanceId,
        message: params.message
      },
      output: {
        response,
        exitCode: result.exitCode,
        stderr: result.stderr || null
      }
    };

    await logConversationTurn(params.targetInstanceId, turn);

    // Update target preferences with turn count
    targetPrefs.conversationTurns = turnNumber;
    targetPrefs.lastConversationAt = new Date().toISOString();
    await writePreferences(params.targetInstanceId, targetPrefs);

    return {
      success: true,
      targetInstanceId: params.targetInstanceId,
      interface: interfaceType,
      sessionId: interfaceType === 'claude' ? targetPrefs.sessionId : null,
      turnNumber,
      response,
      exitCode: result.exitCode,
      stderr: result.stderr || null,
      metadata
    };

  } catch (err) {
    return {
      success: false,
      error: {
        code: 'EXECUTION_FAILED',
        message: `Failed to execute ${interfaceType}: ${err.message}`
      },
      metadata
    };
  }
}

/**
 * @hacs-endpoint
 * @template-version 1.0.0
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │ GET_CONVERSATION_LOG                                                    │
 * │ Retrieve conversation history for a woken instance                      │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * @tool get_conversation_log
 * @version 2.0.0
 * @since 2025-12-19
 * @category instances
 * @status stable
 *
 * ───────────────────────────────────────────────────────────────────────────
 * DESCRIPTION
 * ───────────────────────────────────────────────────────────────────────────
 * @description
 * Retrieves the conversation log for an instance that has been communicated
 * with via continue_conversation. Each turn includes the input message, the
 * response from Claude, timestamps, and any errors.
 *
 * Use this endpoint to review what has been discussed with an instance,
 * debug issues, or provide context to a new manager taking over communication.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * PARAMETERS
 * ───────────────────────────────────────────────────────────────────────────
 * @param {string} instanceId - Caller's instance ID for authentication [required]
 *   @source Your instanceId from bootstrap response, or recovered via lookup_identity.
 *
 * @param {string} targetInstanceId - Instance ID to get conversation log for [required]
 *   @source The instanceId of the woken instance whose conversation history you
 *           want to retrieve.
 *
 * @param {number} limit - Maximum number of turns to return [optional]
 *   @source Set to limit results. Returns most recent turns first.
 *   @default null (all turns)
 *   @validate min: 1
 *
 * ───────────────────────────────────────────────────────────────────────────
 * RETURNS
 * ───────────────────────────────────────────────────────────────────────────
 * @returns {object} GetConversationLogResponse
 * @returns {boolean} .success - Whether the call succeeded
 * @returns {string} .targetInstanceId - The instance whose log was retrieved
 * @returns {array} .turns - Array of conversation turns
 * @returns {number} .turns[].turn - Turn number (1-indexed)
 * @returns {string} .turns[].timestamp - ISO timestamp when turn occurred
 * @returns {object} .turns[].input - Input message details
 * @returns {string} .turns[].input.from - Instance ID of sender
 * @returns {string} .turns[].input.message - The message sent
 * @returns {object} .turns[].output - Response details
 * @returns {object} .turns[].output.response - Parsed Claude response
 * @returns {number} .turns[].output.exitCode - Claude process exit code
 * @returns {string|null} .turns[].output.stderr - Any stderr output
 * @returns {number} .totalTurns - Total number of turns in the log
 * @returns {string} .message - Status message (only if log is empty)
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
 * @error MISSING_PARAMETER - Required parameter not provided
 *   @recover Include both instanceId and targetInstanceId in your request.
 *
 * @error INVALID_INSTANCE_ID - Caller instance not found
 *   @recover Verify your instanceId is correct. If you're new, call bootstrap first.
 *            If recovering, use lookup_identity with your fingerprint.
 *
 * @error LOG_READ_FAILED - Failed to read conversation log file
 *   @recover The log file may be corrupted or have permission issues.
 *            Contact system administrator.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * EXAMPLES
 * ───────────────────────────────────────────────────────────────────────────
 * @example Get full log
 * {
 *   "instanceId": "COO-x3k9",
 *   "targetInstanceId": "Developer-j4k8"
 * }
 *
 * @example Get last 5 turns
 * {
 *   "instanceId": "COO-x3k9",
 *   "targetInstanceId": "Developer-j4k8",
 *   "limit": 5
 * }
 *
 * ───────────────────────────────────────────────────────────────────────────
 * RELATED
 * ───────────────────────────────────────────────────────────────────────────
 * @see continue_conversation - Send messages that get logged here
 * @see wake_instance - Wake an instance to begin conversation
 *
 * ───────────────────────────────────────────────────────────────────────────
 * NOTES
 * ───────────────────────────────────────────────────────────────────────────
 * @note Returns empty array if no conversations have occurred
 * @note Log file is stored at {instanceId}/conversation.log as JSON
 * @note Does not require apiKey unlike continue_conversation
 */
export async function getConversationLog(params) {
  const metadata = {
    timestamp: new Date().toISOString(),
    function: 'getConversationLog'
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

  // Read conversation log
  const logPath = path.join(getInstancesDir(), params.targetInstanceId, 'conversation.log');

  let log = [];
  try {
    const content = await fs.readFile(logPath, 'utf8');
    log = JSON.parse(content);
  } catch (err) {
    if (err.code === 'ENOENT') {
      return {
        success: true,
        targetInstanceId: params.targetInstanceId,
        turns: [],
        totalTurns: 0,
        message: 'No conversation log found',
        metadata
      };
    }
    return {
      success: false,
      error: {
        code: 'LOG_READ_FAILED',
        message: `Failed to read conversation log: ${err.message}`
      },
      metadata
    };
  }

  // Apply limit if specified
  const limit = params.limit;
  const turns = limit ? log.slice(-limit) : log;

  return {
    success: true,
    targetInstanceId: params.targetInstanceId,
    turns,
    totalTurns: log.length,
    metadata
  };
}
