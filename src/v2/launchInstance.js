/**
 * Launch/Land Instance handler for V2 coordination system
 * Manages runtime lifecycle for HACS instances (OpenFang, ZeroClaw, future runtimes)
 *
 * launch_instance: Start a runtime for a bootstrapped HACS instance
 * land_instance: Stop a running instance, preserve all data for re-launch
 *
 * @module launchInstance
 * @author Crossing-2d23
 * @created 2026-02-22
 * @updated 2026-03-06 — Generic runtime support (OpenFang + ZeroClaw)
 */

import path from 'path';
import { execSync } from 'child_process';
import { getInstanceDir, getInstancesDir } from './config.js';
import { readPreferences, writePreferences } from './data.js';
import { canRoleCallAPI } from './permissions.js';
import fs from 'fs/promises';

/**
 * Get the scripts directory for a given runtime.
 * @param {string} runtime - "openfang" or "zeroclaw"
 * @returns {string} Path to the scripts directory
 */
function getScriptsDir(runtime) {
  const currentDir = new URL('.', import.meta.url).pathname;
  if (runtime === 'openfang') {
    return path.join(currentDir, '..', 'chassis', 'openfang/');
  }
  // ZeroClaw scripts are in src/zeroclaw-hacs/
  return path.join(currentDir, '..', 'zeroclaw-hacs/');
}

/**
 * Get the launch script path for a runtime.
 * @param {string} runtime
 * @returns {string}
 */
function getLaunchScript(runtime) {
  if (runtime === 'openfang') {
    return path.join(getScriptsDir('openfang'), 'launch-openfang.sh');
  }
  return path.join(getScriptsDir('zeroclaw'), 'launch-zeroclaw.sh');
}

/**
 * Get the setup script path for a runtime.
 * @param {string} runtime
 * @returns {string}
 */
function getSetupScript(runtime) {
  if (runtime === 'openfang') {
    return path.join(getScriptsDir('openfang'), 'openfang-setup.sh');
  }
  return null; // ZeroClaw setup is handled by its launch script
}

/**
 * Check if an instance has been prepared for a given runtime.
 * Uses generic runtime.ready flag, with backward compat for zeroclaw_ready.
 * @param {object} prefs - Instance preferences
 * @param {string} runtime - Runtime to check
 * @returns {boolean}
 */
function isRuntimeReady(prefs, runtime) {
  // Check generic runtime flag first
  if (prefs.runtime && prefs.runtime.type === runtime && prefs.runtime.ready === true) {
    return true;
  }
  // Backward compat: check legacy zeroclaw_ready flag
  if (runtime === 'zeroclaw' && prefs.zeroclaw_ready === true) {
    return true;
  }
  // OpenFang: check if config files exist as readiness signal
  if (runtime === 'openfang') {
    // The openfang_ready flag is set by configure_for_openfang.py or openfang-setup.sh
    if (prefs.openfang_ready === true) {
      return true;
    }
  }
  return false;
}

/**
 * Check if an instance is currently running on any runtime.
 * @param {object} prefs - Instance preferences
 * @returns {{ enabled: boolean, type: string|null }}
 */
function getRuntimeStatus(prefs) {
  // Check generic runtime flag
  if (prefs.runtime && prefs.runtime.enabled === true) {
    return { enabled: true, type: prefs.runtime.type };
  }
  // Backward compat: check legacy zeroclaw flag
  if (prefs.zeroclaw && prefs.zeroclaw.enabled === true) {
    return { enabled: true, type: 'zeroclaw' };
  }
  return { enabled: false, type: null };
}

/**
 * @hacs-endpoint
 * @template-version 1.0.0
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │ LAUNCH_INSTANCE                                                        │
 * │ Launch a runtime for a bootstrapped HACS instance                     │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * @tool launch_instance
 * @version 2.0.0
 * @since 2026-02-22
 * @category instances
 * @status stable
 *
 * @description
 * Starts a runtime (OpenFang or ZeroClaw) for an existing HACS instance.
 * The instance must already be bootstrapped and prepared for the chosen runtime.
 *
 * For OpenFang: runs openfang-setup.sh (creates Unix user, generates config)
 * then launch-openfang.sh (starts daemon + auto-approver as instance user).
 *
 * For ZeroClaw: runs launch-zeroclaw.sh (starts Docker container).
 *
 * On re-launch (after land_instance), existing workspace, memory, and config
 * are preserved. Only auth tokens are regenerated.
 *
 * @param {string} instanceId - Caller's instance ID [required]
 *   @validate Must exist, must have privileged role
 *
 * @param {string} targetInstanceId - Instance to launch [required]
 *   @validate Must exist, must be prepared for the chosen runtime
 *
 * @param {string} apiKey - Authorization key [required]
 *   @validate Must match WAKE_API_KEY environment variable
 *
 * @param {string} [runtime=openfang] - Runtime to use
 *   @default "openfang"
 *   @enum openfang|zeroclaw
 *
 * @param {string} [provider] - LLM provider override
 *   @default From config template
 *   @enum xai|anthropic|openai|google|openrouter
 *
 * @param {string} [model] - LLM model override
 *   @default From config template
 *
 * @param {number} [port] - Port override
 *   @default Auto-allocated
 *
 * @param {boolean} [setup=true] - Run setup script before launch
 *   @default true
 *   @note Set to false if setup was already done (e.g., re-launch)
 *
 * @returns {object} LaunchResult
 * @returns {boolean} .success - Whether launch succeeded
 * @returns {string} .targetInstanceId - Launched instance ID
 * @returns {string} .runtime - Runtime used
 * @returns {number} .port - API port
 * @returns {string} .agentName - OpenFang agent name
 * @returns {string} .dashboardUrl - Web dashboard URL
 * @returns {string} .unixUser - Unix user the instance runs as
 * @returns {object} .metadata - Timestamp and function info
 *
 * @permissions role:Executive|role:EA|role:COO|role:PM
 *
 * @error UNAUTHORIZED - Caller lacks permission
 * @error INVALID_API_KEY - API key doesn't match
 * @error INSTANCE_NOT_FOUND - Target instance doesn't exist
 * @error ALREADY_RUNNING - Instance is already running on a runtime
 * @error UNSUPPORTED_RUNTIME - Runtime not implemented
 * @error SETUP_FAILED - Setup script failed
 * @error LAUNCH_FAILED - Launch script failed
 *
 * @example Launch with OpenFang (default)
 * { "instanceId": "Manager-abc1", "targetInstanceId": "Worker-def2", "apiKey": "..." }
 *
 * @example Launch with ZeroClaw
 * { "instanceId": "Manager-abc1", "targetInstanceId": "Worker-def2", "apiKey": "...", "runtime": "zeroclaw" }
 *
 * @example Re-launch (skip setup)
 * { "instanceId": "Manager-abc1", "targetInstanceId": "Worker-def2", "apiKey": "...", "setup": false }
 *
 * @see land_instance - Stop a launched instance
 * @see pre_approve - Create a new instance before launching
 * @see get_all_instances - See runtime status for all instances
 */
export async function launchInstance(params) {
  const {
    instanceId,
    targetInstanceId,
    apiKey,
    runtime = 'openfang',
    provider,
    model,
    port,
    setup = true
  } = params;

  const metadata = {
    timestamp: new Date().toISOString(),
    function: 'launch_instance'
  };

  // --- Validate required params ---
  if (!instanceId) {
    return { success: false, error: { code: 'MISSING_PARAM', message: 'instanceId is required' }, metadata };
  }
  if (!targetInstanceId) {
    return { success: false, error: { code: 'MISSING_PARAM', message: 'targetInstanceId is required' }, metadata };
  }
  if (!apiKey) {
    return { success: false, error: { code: 'MISSING_PARAM', message: 'apiKey is required' }, metadata };
  }

  // --- Validate API key ---
  const expectedKey = process.env.WAKE_API_KEY;
  if (!expectedKey || apiKey !== expectedKey) {
    return { success: false, error: { code: 'INVALID_API_KEY', message: 'Invalid API key' }, metadata };
  }

  // --- Validate runtime ---
  const SUPPORTED_RUNTIMES = ['openfang', 'zeroclaw'];
  if (!SUPPORTED_RUNTIMES.includes(runtime)) {
    return {
      success: false,
      error: {
        code: 'UNSUPPORTED_RUNTIME',
        message: `Runtime '${runtime}' not supported. Supported: ${SUPPORTED_RUNTIMES.join(', ')}`
      },
      metadata
    };
  }

  // --- Validate caller permissions ---
  const callerPrefs = await readPreferences(instanceId);
  if (!callerPrefs) {
    return { success: false, error: { code: 'CALLER_NOT_FOUND', message: `Caller not found: ${instanceId}` }, metadata };
  }
  if (callerPrefs.role) {
    const authorized = await canRoleCallAPI(callerPrefs.role, 'launchInstance');
    if (!authorized) {
      return { success: false, error: { code: 'UNAUTHORIZED', message: `Role '${callerPrefs.role}' not authorized` }, metadata };
    }
  }

  // --- Validate target instance ---
  const targetPrefs = await readPreferences(targetInstanceId);
  if (!targetPrefs) {
    return { success: false, error: { code: 'INSTANCE_NOT_FOUND', message: `Target not found: ${targetInstanceId}` }, metadata };
  }

  // --- Check not already running ---
  const currentStatus = getRuntimeStatus(targetPrefs);
  if (currentStatus.enabled) {
    return {
      success: false,
      error: {
        code: 'ALREADY_RUNNING',
        message: `Instance '${targetInstanceId}' is already running on ${currentStatus.type}. Use land_instance first.`,
        currentRuntime: currentStatus.type
      },
      metadata
    };
  }

  // --- OpenFang launch flow ---
  if (runtime === 'openfang') {
    return launchOpenFang(targetInstanceId, instanceId, { provider, model, port, setup, metadata });
  }

  // --- ZeroClaw launch flow (legacy) ---
  return launchZeroClaw(targetInstanceId, instanceId, targetPrefs, { provider, model, port, metadata });
}


/**
 * Launch an instance with OpenFang runtime.
 */
async function launchOpenFang(targetInstanceId, callerId, options) {
  const { provider, model, port, setup, metadata } = options;
  const scriptsDir = getScriptsDir('openfang');

  // --- Step 1: Setup (creates Unix user, config, agent.toml) ---
  if (setup) {
    const setupScript = getSetupScript('openfang');
    try {
      await fs.access(setupScript, fs.constants.X_OK);
    } catch {
      return { success: false, error: { code: 'SCRIPT_NOT_FOUND', message: `Setup script not found: ${setupScript}` }, metadata };
    }

    const setupArgs = [`--instance-id "${targetInstanceId}"`];
    if (port) setupArgs.push(`--port ${port}`);

    try {
      const command = `"${setupScript}" ${setupArgs.join(' ')} 2>&1`;
      const output = execSync(command, {
        cwd: scriptsDir,
        timeout: 60000,
        encoding: 'utf8',
        env: { ...process.env }
      });

      // Parse setup output
      const setupResult = JSON.parse(output.trim().split('\n').pop());
      if (setupResult.status !== 'success') {
        return { success: false, error: { code: 'SETUP_FAILED', message: setupResult.message || 'Setup failed' }, metadata };
      }
    } catch (err) {
      return {
        success: false,
        error: {
          code: 'SETUP_FAILED',
          message: 'Setup script failed',
          details: err.stderr || err.stdout || err.message
        },
        metadata
      };
    }
  }

  // --- Step 2: Launch (starts daemon + auto-approver as instance user) ---
  const launchScript = getLaunchScript('openfang');
  try {
    await fs.access(launchScript, fs.constants.X_OK);
  } catch {
    return { success: false, error: { code: 'SCRIPT_NOT_FOUND', message: `Launch script not found: ${launchScript}` }, metadata };
  }

  let launchOutput;
  try {
    const command = `"${launchScript}" --instance-id "${targetInstanceId}" 2>&1`;
    launchOutput = execSync(command, {
      cwd: scriptsDir,
      timeout: 90000,
      encoding: 'utf8',
      env: { ...process.env }
    });
  } catch (err) {
    return {
      success: false,
      error: {
        code: 'LAUNCH_FAILED',
        message: 'Launch script failed',
        details: err.stderr || err.stdout || err.message
      },
      metadata
    };
  }

  // Parse launch output (last line is JSON)
  let launchResult;
  try {
    const lines = launchOutput.trim().split('\n');
    launchResult = JSON.parse(lines[lines.length - 1]);
  } catch {
    launchResult = { port: port || 20000 };
  }

  // --- Step 3: Update preferences with generic runtime block ---
  const updatedPrefs = await readPreferences(targetInstanceId);
  updatedPrefs.runtime = {
    type: 'openfang',
    ready: true,
    enabled: true,
    port: launchResult.port,
    agentName: launchResult.agentName,
    unixUser: launchResult.unixUser,
    apiUrl: launchResult.apiUrl,
    dashboardUrl: launchResult.dashboardUrl,
    launchedBy: callerId,
    launchedAt: new Date().toISOString(),
    launchedVia: 'launch_instance'
  };
  // Also set openfang_ready for backward compat queries
  updatedPrefs.openfang_ready = true;
  await writePreferences(targetInstanceId, updatedPrefs);

  return {
    success: true,
    targetInstanceId,
    runtime: 'openfang',
    port: launchResult.port,
    agentName: launchResult.agentName,
    unixUser: launchResult.unixUser,
    apiUrl: launchResult.apiUrl,
    dashboardUrl: launchResult.dashboardUrl,
    hint: 'Instance running. Use land_instance to stop. Dashboard at dashboardUrl.',
    metadata
  };
}


/**
 * Launch an instance with ZeroClaw runtime (legacy).
 */
async function launchZeroClaw(targetInstanceId, callerId, targetPrefs, options) {
  const { provider, model, port, metadata } = options;

  // ZeroClaw requires zeroclaw_ready flag
  if (!targetPrefs.zeroclaw_ready) {
    return {
      success: false,
      error: {
        code: 'NOT_READY',
        message: `Instance '${targetInstanceId}' not ready for ZeroClaw. Run export pipeline first.`
      },
      metadata
    };
  }

  const scriptPath = getLaunchScript('zeroclaw');

  try {
    await fs.access(scriptPath, fs.constants.X_OK);
  } catch {
    return { success: false, error: { code: 'SCRIPT_NOT_FOUND', message: `Launch script not found: ${scriptPath}` }, metadata };
  }

  const args = [targetInstanceId];
  if (provider) args.push('--provider', provider);
  if (model) args.push('--model', model);
  if (port) args.push('--port', String(port));

  let stdout;
  try {
    const command = `"${scriptPath}" ${args.map(a => `"${a}"`).join(' ')} 2>&1`;
    stdout = execSync(command, {
      cwd: getScriptsDir('zeroclaw'),
      timeout: 90000,
      encoding: 'utf8',
      env: { ...process.env }
    });
  } catch (err) {
    return {
      success: false,
      error: {
        code: 'LAUNCH_FAILED',
        message: 'ZeroClaw launch script failed',
        details: err.stderr || err.stdout || err.message
      },
      metadata
    };
  }

  // Re-read preferences and update with generic runtime block
  const updatedPrefs = await readPreferences(targetInstanceId);
  const zc = updatedPrefs?.zeroclaw || {};

  updatedPrefs.runtime = {
    type: 'zeroclaw',
    ready: true,
    enabled: true,
    port: zc.port,
    containerName: zc.containerName,
    gatewayUrl: zc.gatewayUrl,
    webUrl: zc.webUrl,
    bearerToken: zc.bearerToken,
    launchedBy: callerId,
    launchedAt: new Date().toISOString(),
    launchedVia: 'launch_instance'
  };
  // Also update legacy zeroclaw block for backward compat
  updatedPrefs.zeroclaw = {
    ...zc,
    enabled: true,
    launchedBy: callerId,
    launchedAt: new Date().toISOString()
  };
  await writePreferences(targetInstanceId, updatedPrefs);

  return {
    success: true,
    targetInstanceId,
    runtime: 'zeroclaw',
    containerName: zc.containerName || `zeroclaw-${targetInstanceId}`,
    port: zc.port,
    webPort: zc.webPort,
    gatewayUrl: zc.gatewayUrl,
    webUrl: zc.webUrl,
    bearerToken: zc.bearerToken,
    provider: zc.provider || provider || 'xai',
    model: zc.model || model || 'grok-4',
    hint: 'Web chat: append ?token=<bearerToken> to webUrl. Use land_instance to stop.',
    metadata
  };
}


/**
 * @hacs-endpoint
 * @template-version 1.0.0
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │ LAND_INSTANCE                                                          │
 * │ Stop a running instance, preserve data for re-launch                  │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * @tool land_instance
 * @version 2.0.0
 * @since 2026-02-22
 * @category instances
 * @status stable
 *
 * @description
 * Stops a running instance regardless of runtime (OpenFang or ZeroClaw).
 * All data is preserved: workspace, memory, config, logs.
 * The instance can be re-launched with launch_instance.
 *
 * Sets runtime.enabled to false but keeps runtime.ready as true,
 * meaning the instance can be re-launched without re-running setup.
 *
 * @param {string} instanceId - Caller's instance ID [required]
 *   @validate Must exist, must have privileged role
 *
 * @param {string} targetInstanceId - Instance to land [required]
 *   @validate Must exist, must have a running runtime
 *
 * @param {string} apiKey - Authorization key [required]
 *   @validate Must match WAKE_API_KEY environment variable
 *
 * @returns {object} LandResult
 * @returns {boolean} .success - Whether land succeeded
 * @returns {string} .targetInstanceId - Landed instance ID
 * @returns {string} .runtime - Runtime that was stopped
 * @returns {string} .status - "landed"
 * @returns {boolean} .relaunchable - Whether instance can be re-launched
 * @returns {object} .metadata - Timestamp and function info
 *
 * @permissions role:Executive|role:EA|role:COO|role:PM
 *
 * @error UNAUTHORIZED - Caller lacks permission
 * @error INVALID_API_KEY - API key doesn't match
 * @error INSTANCE_NOT_FOUND - Target instance doesn't exist
 * @error NOT_RUNNING - Instance doesn't have a running runtime
 * @error LAND_FAILED - Failed to stop the runtime
 *
 * @example Land an instance
 * { "instanceId": "Manager-abc1", "targetInstanceId": "Worker-def2", "apiKey": "..." }
 *
 * @see launch_instance - Start a runtime for an instance
 */
export async function landInstance(params) {
  const { instanceId, targetInstanceId, apiKey } = params;

  const metadata = {
    timestamp: new Date().toISOString(),
    function: 'land_instance'
  };

  // --- Validate required params ---
  if (!instanceId) {
    return { success: false, error: { code: 'MISSING_PARAM', message: 'instanceId is required' }, metadata };
  }
  if (!targetInstanceId) {
    return { success: false, error: { code: 'MISSING_PARAM', message: 'targetInstanceId is required' }, metadata };
  }
  if (!apiKey) {
    return { success: false, error: { code: 'MISSING_PARAM', message: 'apiKey is required' }, metadata };
  }

  // --- Validate API key ---
  const expectedKey = process.env.WAKE_API_KEY;
  if (!expectedKey || apiKey !== expectedKey) {
    return { success: false, error: { code: 'INVALID_API_KEY', message: 'Invalid API key' }, metadata };
  }

  // --- Validate caller permissions ---
  const callerPrefs = await readPreferences(instanceId);
  if (!callerPrefs) {
    return { success: false, error: { code: 'CALLER_NOT_FOUND', message: `Caller not found: ${instanceId}` }, metadata };
  }
  if (callerPrefs.role) {
    const authorized = await canRoleCallAPI(callerPrefs.role, 'landInstance');
    if (!authorized) {
      return { success: false, error: { code: 'UNAUTHORIZED', message: `Role '${callerPrefs.role}' not authorized` }, metadata };
    }
  }

  // --- Validate target instance ---
  const targetPrefs = await readPreferences(targetInstanceId);
  if (!targetPrefs) {
    return { success: false, error: { code: 'INSTANCE_NOT_FOUND', message: `Target not found: ${targetInstanceId}` }, metadata };
  }

  // --- Determine runtime type ---
  const currentStatus = getRuntimeStatus(targetPrefs);
  if (!currentStatus.enabled) {
    return {
      success: false,
      error: { code: 'NOT_RUNNING', message: `Instance '${targetInstanceId}' is not currently running.` },
      metadata
    };
  }

  const runtime = currentStatus.type;

  // --- Stop the runtime ---
  if (runtime === 'openfang') {
    await landOpenFang(targetInstanceId, targetPrefs);
  } else if (runtime === 'zeroclaw') {
    await landZeroClaw(targetInstanceId, targetPrefs);
  }

  // --- Update preferences ---
  const landedAt = new Date().toISOString();

  // Update generic runtime block
  if (targetPrefs.runtime) {
    targetPrefs.runtime.enabled = false;
    targetPrefs.runtime.landedAt = landedAt;
    targetPrefs.runtime.landedBy = instanceId;
  }

  // Update legacy blocks for backward compat
  if (runtime === 'zeroclaw' && targetPrefs.zeroclaw) {
    targetPrefs.zeroclaw.enabled = false;
    targetPrefs.zeroclaw.landedAt = landedAt;
    targetPrefs.zeroclaw.landedBy = instanceId;
  }

  await writePreferences(targetInstanceId, targetPrefs);

  return {
    success: true,
    targetInstanceId,
    runtime,
    status: 'landed',
    landedAt,
    landedBy: instanceId,
    relaunchable: true,
    hint: 'Runtime stopped. Data preserved. Use launch_instance to restart.',
    metadata
  };
}


/**
 * Stop an OpenFang instance.
 * Uses land-openfang.sh for graceful shutdown (preserves agent state to SQLite),
 * systemd cleanup, and stray process cleanup.
 */
async function landOpenFang(targetInstanceId, prefs) {
  const scriptsDir = getScriptsDir('openfang');
  const landScript = path.join(scriptsDir, 'land-openfang.sh');

  try {
    const result = execSync(
      `bash "${landScript}" --instance-id "${targetInstanceId}"`,
      { encoding: 'utf8', timeout: 30000 }
    );
    const parsed = JSON.parse(result.trim());
    if (parsed.status !== 'success') {
      console.error(`land-openfang.sh warning: ${parsed.message}`);
    }
  } catch (err) {
    // Fallback: direct process cleanup if script fails
    const port = prefs.runtime?.port || prefs.openfang?.port;
    if (port) {
      try {
        const pids = execSync(`lsof -ti:${port}`, { encoding: 'utf8', timeout: 5000 }).trim();
        if (pids) {
          execSync(`echo "${pids}" | xargs kill`, { timeout: 5000 });
        }
      } catch { /* Port may already be free */ }
      try {
        execSync(`pkill -f "auto-approve.py --port ${port}"`, { timeout: 5000 });
      } catch { /* May not be running */ }
    }
    console.error(`land-openfang.sh failed, used fallback: ${err.message}`);
  }
}


/**
 * Stop a ZeroClaw instance (Docker container).
 */
async function landZeroClaw(targetInstanceId, prefs) {
  const instanceDir = getInstanceDir(targetInstanceId);
  const zeroClawDir = path.join(instanceDir, 'zeroclaw');

  try {
    execSync('docker-compose down 2>&1', {
      cwd: zeroClawDir,
      timeout: 30000,
      encoding: 'utf8'
    });
  } catch (err) {
    throw new Error(`Failed to stop ZeroClaw container: ${err.message}`);
  }
}
