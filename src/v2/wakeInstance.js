/**
 * Wake Instance handler for V2 coordination system
 * Provides script-based spawning of new Claude instances
 *
 * @module wakeInstance
 * @author Bridge
 * @created 2025-12-13
 */

import path from 'path';
import fs from 'fs/promises';
import { spawn } from 'child_process';
import { getWakeScriptsDir, getWakeLogsDir, getWakeJobsDir } from './config.js';
import { readPreferences, ensureDir, readJSON, writeJSON } from './data.js';
import { canRoleCallAPI } from './permissions.js';

/**
 * Generate a unique job ID for a wake job
 * Format: wake-{timestamp}-{random4hex}
 * @returns {string} Unique job ID
 */
function generateJobId() {
  const timestamp = Date.now();
  const random = Math.random().toString(16).substring(2, 6);
  return `wake-${timestamp}-${random}`;
}

/**
 * Load the wake-scripts manifest
 * @returns {Promise<Object|null>} Manifest object or null if not found
 */
async function loadManifest() {
  const manifestPath = path.join(getWakeScriptsDir(), 'wake-scripts.json');
  return readJSON(manifestPath);
}

/**
 * Read job state from wake-jobs directory
 * @param {string} jobId - Job ID
 * @returns {Promise<Object|null>} Job state or null if not found
 */
async function readJobState(jobId) {
  const jobPath = path.join(getWakeJobsDir(), `${jobId}.json`);
  return readJSON(jobPath);
}

/**
 * Write job state to wake-jobs directory
 * @param {string} jobId - Job ID
 * @param {Object} state - Job state object
 * @returns {Promise<void>}
 */
async function writeJobState(jobId, state) {
  await ensureDir(getWakeJobsDir());
  const jobPath = path.join(getWakeJobsDir(), `${jobId}.json`);
  await writeJSON(jobPath, state);
}

/**
 * Execute a wake script with given arguments
 * Spawns script as detached process and returns immediately
 *
 * @param {string} scriptPath - Full path to script
 * @param {string[]} args - Array of command line arguments
 * @param {string} logPath - Path for output log file
 * @param {string} jobId - Job ID for state tracking
 * @returns {Promise<Object>} Result with pid and status
 */
async function executeScript(scriptPath, args, logPath, jobId) {
  await ensureDir(getWakeLogsDir());

  // Open log file for writing
  const logHandle = await fs.open(logPath, 'w');

  // Spawn script detached so it survives parent exit
  const child = spawn(scriptPath, args, {
    detached: true,
    stdio: ['ignore', logHandle.fd, logHandle.fd],
    cwd: getWakeScriptsDir()
  });

  // Don't wait for child
  child.unref();

  // Track initial job state
  await writeJobState(jobId, {
    jobId,
    status: 'running',
    pid: child.pid,
    scriptPath,
    args,
    logPath,
    startedAt: new Date().toISOString(),
    exitCode: null
  });

  // Set up exit handler to update job state
  child.on('exit', async (code) => {
    try {
      const state = await readJobState(jobId);
      if (state) {
        state.status = code === 0 ? 'completed' : 'failed';
        state.exitCode = code;
        state.completedAt = new Date().toISOString();
        await writeJobState(jobId, state);
      }
    } catch (err) {
      // Best effort - script may have outlived us
    }
    logHandle.close();
  });

  return {
    pid: child.pid,
    status: 'started'
  };
}

/**
 * Wake a pre-approved instance by executing a wake script
 *
 * @param {Object} params - Parameters
 * @param {string} params.instanceId - Caller instance ID (required, for auth)
 * @param {string} params.targetInstanceId - Pre-approved instance to wake (required)
 * @param {string} [params.scriptName] - Script name from manifest (default: from manifest default)
 * @returns {Promise<Object>} Result with jobId and status
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

  // Validate caller exists and has role
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

  const callerRole = callerPrefs.role;
  if (!callerRole) {
    return {
      success: false,
      error: {
        code: 'UNAUTHORIZED',
        message: 'Caller instance does not have a role assigned'
      },
      metadata
    };
  }

  // Check permission
  const hasPermission = await canRoleCallAPI(callerRole, 'wakeInstance');
  if (!hasPermission) {
    return {
      success: false,
      error: {
        code: 'UNAUTHORIZED',
        message: `Role "${callerRole}" does not have permission to call wakeInstance`
      },
      metadata
    };
  }

  // Validate target instance is pre-approved
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

  if (!targetPrefs.preApproved) {
    return {
      success: false,
      error: {
        code: 'INSTANCE_NOT_PREAPPROVED',
        message: `Instance ${params.targetInstanceId} is not pre-approved. Use preApprove first.`
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

  // Determine script to use
  const scriptName = params.scriptName || manifest.defaultScript;
  const scriptConfig = manifest.scripts[scriptName];

  if (!scriptConfig) {
    return {
      success: false,
      error: {
        code: 'SCRIPT_NOT_FOUND',
        message: `Script "${scriptName}" not found in manifest`
      },
      metadata
    };
  }

  if (!scriptConfig.enabled) {
    return {
      success: false,
      error: {
        code: 'SCRIPT_DISABLED',
        message: `Script "${scriptName}" is disabled`
      },
      metadata
    };
  }

  // Generate job ID and paths
  const jobId = generateJobId();
  const scriptPath = path.join(getWakeScriptsDir(), scriptConfig.file);
  const logPath = path.join(getWakeLogsDir(), `${jobId}.log`);

  // Build script arguments from target preferences
  const scriptArgs = [
    '--instance-id', params.targetInstanceId,
    '--name', targetPrefs.name || params.targetInstanceId,
    '--job-id', jobId,
    '--log-file', logPath
  ];

  if (targetPrefs.role) {
    scriptArgs.push('--role', targetPrefs.role);
  }

  if (targetPrefs.personality) {
    scriptArgs.push('--personality', targetPrefs.personality);
  }

  if (targetPrefs.project) {
    scriptArgs.push('--project', targetPrefs.project);
  }

  if (targetPrefs.instructions) {
    scriptArgs.push('--instructions', targetPrefs.instructions);
  }

  // Bootstrap URL for the instance to connect
  const bootstrapUrl = process.env.BOOTSTRAP_URL || 'https://smoothcurves.nexus/mcp/dev/mcp';
  scriptArgs.push('--bootstrap-url', bootstrapUrl);

  // Execute script
  try {
    const result = await executeScript(scriptPath, scriptArgs, logPath, jobId);

    return {
      success: true,
      jobId,
      pid: result.pid,
      logPath,
      targetInstanceId: params.targetInstanceId,
      scriptName,
      message: `Wake script started for ${params.targetInstanceId}`,
      metadata
    };
  } catch (err) {
    return {
      success: false,
      error: {
        code: 'SCRIPT_EXECUTION_FAILED',
        message: `Failed to execute wake script: ${err.message}`
      },
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

/**
 * Get log content for a wake job
 *
 * @param {Object} params - Parameters
 * @param {string} params.instanceId - Caller instance ID (required, for auth)
 * @param {string} params.jobId - Job ID from wakeInstance (required)
 * @param {number} [params.lines=50] - Number of lines to return (tail)
 * @returns {Promise<Object>} Result with log content and job status
 */
export async function getWakeLog(params) {
  const metadata = {
    timestamp: new Date().toISOString(),
    function: 'getWakeLog'
  };

  // Validate required parameters
  if (!params.instanceId) {
    return {
      success: false,
      error: { code: 'MISSING_PARAMETER', message: 'instanceId is required' },
      metadata
    };
  }

  if (!params.jobId) {
    return {
      success: false,
      error: { code: 'MISSING_PARAMETER', message: 'jobId is required' },
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

  // Read job state
  const jobState = await readJobState(params.jobId);
  if (!jobState) {
    return {
      success: false,
      error: {
        code: 'JOB_NOT_FOUND',
        message: `Job ${params.jobId} not found`
      },
      metadata
    };
  }

  // Read log file
  let logContent = '';
  try {
    const fullLog = await fs.readFile(jobState.logPath, 'utf8');
    const lines = fullLog.split('\n');
    const numLines = params.lines || 50;
    const tailLines = lines.slice(-numLines);
    logContent = tailLines.join('\n');
  } catch (err) {
    if (err.code === 'ENOENT') {
      logContent = '(log file not yet created)';
    } else {
      logContent = `(error reading log: ${err.message})`;
    }
  }

  return {
    success: true,
    jobId: params.jobId,
    status: jobState.status,
    pid: jobState.pid,
    exitCode: jobState.exitCode,
    startedAt: jobState.startedAt,
    completedAt: jobState.completedAt,
    log: logContent,
    metadata
  };
}
