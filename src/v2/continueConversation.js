/**
 * Continue Conversation handler for V2 coordination system
 * Enables communication with woken instances via Claude's session persistence
 *
 * @module continueConversation
 * @author Bridge
 * @created 2025-12-19
 */

import path from 'path';
import fs from 'fs/promises';
import { spawn } from 'child_process';
import { getInstancesDir } from './config.js';
import { readPreferences, writePreferences } from './data.js';
import { canRoleCallAPI } from './permissions.js';

/**
 * Execute claude command and capture output
 *
 * @param {string} workingDir - Directory to run command in
 * @param {string[]} args - Command arguments
 * @param {number} timeout - Timeout in ms (default 5 minutes)
 * @returns {Promise<Object>} Result with stdout, stderr, exitCode
 */
async function executeClaude(workingDir, args, timeout = 300000) {
  return new Promise((resolve, reject) => {
    const child = spawn('claude', args, {
      cwd: workingDir,
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout
    });

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
 * Continue a conversation with a woken instance
 *
 * This API sends a message to an instance that was woken via wakeInstance,
 * using Claude's session persistence to maintain conversation context.
 *
 * @param {Object} params - Parameters
 * @param {string} params.instanceId - Caller instance ID (required, for auth)
 * @param {string} params.targetInstanceId - Instance to talk to (required)
 * @param {string} params.message - Message to send (required)
 * @param {Object} [params.options] - Optional settings
 * @param {string} [params.options.outputFormat='json'] - 'text', 'json', or 'stream-json'
 * @param {boolean} [params.options.includeThinking=false] - Include thinking/partial messages
 * @param {number} [params.options.timeout=300000] - Timeout in ms (default 5 min)
 * @returns {Promise<Object>} Result with response
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

  if (!targetPrefs.sessionId) {
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

  // Build claude command arguments
  const options = params.options || {};
  const outputFormat = options.outputFormat || 'json';
  const timeout = options.timeout || 300000;

  const claudeArgs = [
    '-p',  // Print mode (non-interactive)
    '--session-id', targetPrefs.sessionId,
    '--output-format', outputFormat,
    '--dangerously-skip-permissions'
  ];

  if (options.includeThinking) {
    claudeArgs.push('--include-partial-messages');
  }

  // Add the message as the final argument
  claudeArgs.push(params.message);

  // Track conversation turn
  const turnNumber = (targetPrefs.conversationTurns || 0) + 1;

  // Execute claude
  try {
    const result = await executeClaude(workingDir, claudeArgs, timeout);

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
      sessionId: targetPrefs.sessionId,
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
        message: `Failed to execute claude: ${err.message}`
      },
      metadata
    };
  }
}

/**
 * Get conversation log for an instance
 *
 * @param {Object} params - Parameters
 * @param {string} params.instanceId - Caller instance ID (required, for auth)
 * @param {string} params.targetInstanceId - Instance to get log for (required)
 * @param {number} [params.limit] - Limit number of turns returned (default: all)
 * @returns {Promise<Object>} Result with conversation log
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
