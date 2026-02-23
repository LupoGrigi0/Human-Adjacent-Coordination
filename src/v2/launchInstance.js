/**
 * Launch/Land Instance handler for V2 coordination system
 * Manages container lifecycle for ZeroClaw (and future runtimes)
 *
 * launch_instance: Start a container for a bootstrapped HACS instance
 * land_instance: Stop a running container, preserve all data for re-launch
 *
 * @module launchInstance
 * @author Crossing-2d23
 * @created 2026-02-22
 */

import path from 'path';
import { execSync } from 'child_process';
import { getInstanceDir, getInstancesDir } from './config.js';
import { readPreferences, writePreferences } from './data.js';
import { canRoleCallAPI } from './permissions.js';
import fs from 'fs/promises';

/**
 * Get the zeroclaw-hacs scripts directory
 * Contains launch-zeroclaw.sh, templates, etc.
 * @returns {string} Path to zeroclaw-hacs directory
 */
function getZeroClawScriptsDir() {
  const currentDir = new URL('.', import.meta.url).pathname;
  return path.join(currentDir, '..', 'zeroclaw-hacs/');
}

/**
 * @hacs-endpoint
 * @template-version 1.0.0
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │ LAUNCH_INSTANCE                                                        │
 * │ Launch a container runtime for a bootstrapped HACS instance            │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * @tool launch_instance
 * @version 1.0.0
 * @since 2026-02-22
 * @category instances
 * @status stable
 *
 * @description
 * Starts a container runtime (currently ZeroClaw) for an existing HACS instance.
 * The instance must already be bootstrapped and have zeroclaw_ready: true in
 * preferences (meaning identity documents have been prepared by the export pipeline).
 *
 * This gives the instance a persistent, always-on environment with web chat,
 * multi-channel I/O, memory/RAG, and autonomous operation.
 *
 * The instance must already exist (have a HACS directory). Use pre_approve +
 * bootstrap to create new instances, then the export pipeline to prepare
 * ZeroClaw documents, then launch_instance to bring them online.
 *
 * On re-launch (after land_instance), existing workspace, memory, and config
 * are preserved. Only the bearer token is regenerated.
 *
 * @param {string} instanceId - Caller's instance ID [required]
 *   @source Caller provides their own ID
 *   @validate Must exist, must have privileged role
 *
 * @param {string} targetInstanceId - Instance to launch [required]
 *   @source Caller specifies which instance to launch
 *   @validate Must exist, must have zeroclaw_ready: true, must not already be launched
 *
 * @param {string} apiKey - Authorization key [required]
 *   @source Caller provides
 *   @validate Must match WAKE_API_KEY environment variable
 *
 * @param {string} [runtime=zeroclaw] - Container runtime to use
 *   @default "zeroclaw"
 *   @enum zeroclaw
 *   @note Future: openclaw, kimiclaw, etc.
 *
 * @param {string} [provider] - LLM provider override
 *   @default From config template (xai)
 *   @enum xai|anthropic|openai|google|openrouter
 *
 * @param {string} [model] - LLM model override
 *   @default From config template (grok-4)
 *
 * @param {number} [port] - Gateway port override
 *   @default Auto-allocated from 19000-19100
 *
 * @returns {object} LaunchResult
 * @returns {boolean} .success - Whether launch succeeded
 * @returns {string} .targetInstanceId - Launched instance ID
 * @returns {string} .runtime - Runtime used
 * @returns {string} .containerName - Docker container name
 * @returns {number} .port - Gateway port
 * @returns {number} .webPort - Web UI port
 * @returns {string} .gatewayUrl - Public gateway URL
 * @returns {string} .webUrl - Public web chat URL (append ?token=... for browser access)
 * @returns {string} .bearerToken - Auth token for API/web access
 * @returns {string} .provider - LLM provider configured
 * @returns {string} .model - LLM model configured
 * @returns {object} .metadata - Timestamp and function info
 *
 * @permissions role:Executive|role:PA|role:COO|role:PM
 *
 * @error UNAUTHORIZED - Caller lacks permission
 *   @recover Ensure caller has Executive, PA, COO, or PM role
 * @error INVALID_API_KEY - API key doesn't match
 *   @recover Use the correct WAKE_API_KEY
 * @error INSTANCE_NOT_FOUND - Target instance doesn't exist
 *   @recover Bootstrap the instance first
 * @error NOT_READY - Instance hasn't been prepared for launch
 *   @recover Run the export pipeline to set zeroclaw_ready: true
 * @error ALREADY_LAUNCHED - Container is already running
 *   @recover Use land_instance first, then re-launch
 * @error UNSUPPORTED_RUNTIME - Runtime not implemented
 *   @recover Currently only "zeroclaw" is supported
 * @error LAUNCH_FAILED - Script execution failed
 *   @recover Check docker logs and instance directory
 *
 * @example Launch with defaults
 * { "instanceId": "Manager-abc1", "targetInstanceId": "Worker-def2", "apiKey": "..." }
 *
 * @example Launch with Anthropic
 * { "instanceId": "Manager-abc1", "targetInstanceId": "Worker-def2", "apiKey": "...", "provider": "anthropic", "model": "claude-sonnet-4-20250514" }
 *
 * @see land_instance - Stop a launched instance
 * @see pre_approve - Create a new instance before launching
 * @see wake_instance - Alternative: ephemeral CLI-based instance communication
 */
export async function launchInstance(params) {
  const {
    instanceId,
    targetInstanceId,
    apiKey,
    runtime = 'zeroclaw',
    provider,
    model,
    port
  } = params;

  // --- Validate required params ---
  if (!instanceId) {
    return { success: false, error: { code: 'MISSING_PARAM', message: 'instanceId is required' } };
  }
  if (!targetInstanceId) {
    return { success: false, error: { code: 'MISSING_PARAM', message: 'targetInstanceId is required' } };
  }
  if (!apiKey) {
    return { success: false, error: { code: 'MISSING_PARAM', message: 'apiKey is required' } };
  }

  // --- Validate API key ---
  const expectedKey = process.env.WAKE_API_KEY;
  if (!expectedKey || apiKey !== expectedKey) {
    return { success: false, error: { code: 'INVALID_API_KEY', message: 'Invalid API key' } };
  }

  // --- Validate caller permissions ---
  const callerPrefs = await readPreferences(instanceId);
  if (!callerPrefs) {
    return { success: false, error: { code: 'CALLER_NOT_FOUND', message: `Caller instance not found: ${instanceId}` } };
  }
  if (callerPrefs.role) {
    const authorized = await canRoleCallAPI(callerPrefs.role, 'launchInstance');
    if (!authorized) {
      return { success: false, error: { code: 'UNAUTHORIZED', message: `Role '${callerPrefs.role}' not authorized to launch instances` } };
    }
  }

  // --- Validate target instance ---
  const targetPrefs = await readPreferences(targetInstanceId);
  if (!targetPrefs) {
    return { success: false, error: { code: 'INSTANCE_NOT_FOUND', message: `Target instance not found: ${targetInstanceId}` } };
  }

  // --- Validate runtime ---
  if (runtime !== 'zeroclaw') {
    return { success: false, error: { code: 'UNSUPPORTED_RUNTIME', message: `Runtime '${runtime}' not supported. Currently supported: zeroclaw` } };
  }

  // --- Check zeroclaw_ready flag ---
  if (!targetPrefs.zeroclaw_ready) {
    return {
      success: false,
      error: {
        code: 'NOT_READY',
        message: `Instance '${targetInstanceId}' is not ready for launch. Run the export pipeline to prepare ZeroClaw documents and set zeroclaw_ready: true.`
      }
    };
  }

  // --- Check not already launched ---
  if (targetPrefs.zeroclaw && targetPrefs.zeroclaw.enabled === true) {
    return {
      success: false,
      error: {
        code: 'ALREADY_LAUNCHED',
        message: `Instance '${targetInstanceId}' is already launched. Use land_instance first to stop, then re-launch.`,
        currentConfig: {
          containerName: targetPrefs.zeroclaw.containerName,
          port: targetPrefs.zeroclaw.port,
          webUrl: targetPrefs.zeroclaw.webUrl
        }
      }
    };
  }

  // --- Build launch command ---
  const scriptsDir = getZeroClawScriptsDir();
  const scriptPath = path.join(scriptsDir, 'launch-zeroclaw.sh');

  // Verify script exists
  try {
    await fs.access(scriptPath, fs.constants.X_OK);
  } catch {
    return { success: false, error: { code: 'SCRIPT_NOT_FOUND', message: `Launch script not found or not executable: ${scriptPath}` } };
  }

  const args = [targetInstanceId];
  if (provider) args.push('--provider', provider);
  if (model) args.push('--model', model);
  if (port) args.push('--port', String(port));

  // --- Execute launch script ---
  let stdout;
  try {
    const command = `"${scriptPath}" ${args.map(a => `"${a}"`).join(' ')} 2>&1`;
    stdout = execSync(command, {
      cwd: scriptsDir,
      timeout: 90000,  // 90s — health check + pairing can take time
      encoding: 'utf8',
      env: { ...process.env, PATH: process.env.PATH }
    });
  } catch (err) {
    return {
      success: false,
      error: {
        code: 'LAUNCH_FAILED',
        message: 'Launch script failed',
        details: err.stderr || err.stdout || err.message,
        exitCode: err.status
      }
    };
  }

  // --- Re-read preferences (launcher updates them) ---
  const updatedPrefs = await readPreferences(targetInstanceId);
  const zc = updatedPrefs?.zeroclaw || {};

  // --- Update with launch metadata ---
  updatedPrefs.zeroclaw = {
    ...zc,
    enabled: true,
    launchedBy: instanceId,
    launchedAt: new Date().toISOString(),
    launchedVia: 'launch_instance'
  };
  await writePreferences(targetInstanceId, updatedPrefs);

  return {
    success: true,
    targetInstanceId,
    runtime,
    containerName: zc.containerName || `zeroclaw-${targetInstanceId}`,
    port: zc.port,
    webPort: zc.webPort,
    gatewayUrl: zc.gatewayUrl,
    webUrl: zc.webUrl,
    bearerToken: zc.bearerToken,
    provider: zc.provider || provider || 'xai',
    model: zc.model || model || 'grok-4',
    hint: 'Web chat: append ?token=<bearerToken> to webUrl. Use land_instance to stop.',
    metadata: {
      timestamp: new Date().toISOString(),
      function: 'launch_instance'
    }
  };
}


/**
 * @hacs-endpoint
 * @template-version 1.0.0
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │ LAND_INSTANCE                                                          │
 * │ Stop a running container, preserve data for re-launch                 │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * @tool land_instance
 * @version 1.0.0
 * @since 2026-02-22
 * @category instances
 * @status stable
 *
 * @description
 * Stops a running container for a HACS instance. All data is preserved:
 * workspace, memory/RAG database, config, logs. The instance can be
 * re-launched at any time with launch_instance.
 *
 * Sets zeroclaw.enabled to false but keeps zeroclaw_ready as true,
 * meaning the instance is eligible for re-launch without re-running
 * the export pipeline.
 *
 * Use this to free resources when instances aren't needed, or to
 * rotate through project teams on limited infrastructure.
 *
 * @param {string} instanceId - Caller's instance ID [required]
 *   @validate Must exist, must have privileged role
 *
 * @param {string} targetInstanceId - Instance to land [required]
 *   @validate Must exist, must have zeroclaw.enabled: true
 *
 * @param {string} apiKey - Authorization key [required]
 *   @validate Must match WAKE_API_KEY environment variable
 *
 * @returns {object} LandResult
 * @returns {boolean} .success - Whether land succeeded
 * @returns {string} .targetInstanceId - Landed instance ID
 * @returns {string} .status - "landed"
 * @returns {string} .landedAt - ISO timestamp
 * @returns {string} .landedBy - Caller instance ID
 * @returns {boolean} .relaunchable - Whether instance can be re-launched (zeroclaw_ready)
 * @returns {object} .metadata - Timestamp and function info
 *
 * @permissions role:Executive|role:PA|role:COO|role:PM
 *
 * @error UNAUTHORIZED - Caller lacks permission
 * @error INVALID_API_KEY - API key doesn't match
 * @error INSTANCE_NOT_FOUND - Target instance doesn't exist
 * @error NOT_LAUNCHED - Instance doesn't have a running container
 * @error LAND_FAILED - Docker-compose down failed
 *
 * @example Land an instance
 * { "instanceId": "Manager-abc1", "targetInstanceId": "Worker-def2", "apiKey": "..." }
 *
 * @see launch_instance - Start a container for an instance
 */
export async function landInstance(params) {
  const { instanceId, targetInstanceId, apiKey } = params;

  // --- Validate required params ---
  if (!instanceId) {
    return { success: false, error: { code: 'MISSING_PARAM', message: 'instanceId is required' } };
  }
  if (!targetInstanceId) {
    return { success: false, error: { code: 'MISSING_PARAM', message: 'targetInstanceId is required' } };
  }
  if (!apiKey) {
    return { success: false, error: { code: 'MISSING_PARAM', message: 'apiKey is required' } };
  }

  // --- Validate API key ---
  const expectedKey = process.env.WAKE_API_KEY;
  if (!expectedKey || apiKey !== expectedKey) {
    return { success: false, error: { code: 'INVALID_API_KEY', message: 'Invalid API key' } };
  }

  // --- Validate caller permissions ---
  const callerPrefs = await readPreferences(instanceId);
  if (!callerPrefs) {
    return { success: false, error: { code: 'CALLER_NOT_FOUND', message: `Caller instance not found: ${instanceId}` } };
  }
  if (callerPrefs.role) {
    const authorized = await canRoleCallAPI(callerPrefs.role, 'landInstance');
    if (!authorized) {
      return { success: false, error: { code: 'UNAUTHORIZED', message: `Role '${callerPrefs.role}' not authorized to land instances` } };
    }
  }

  // --- Validate target instance ---
  const targetPrefs = await readPreferences(targetInstanceId);
  if (!targetPrefs) {
    return { success: false, error: { code: 'INSTANCE_NOT_FOUND', message: `Target instance not found: ${targetInstanceId}` } };
  }

  // --- Check instance is actually launched ---
  if (!targetPrefs.zeroclaw || targetPrefs.zeroclaw.enabled !== true) {
    return {
      success: false,
      error: {
        code: 'NOT_LAUNCHED',
        message: `Instance '${targetInstanceId}' does not have a running container.`
      }
    };
  }

  // --- Stop container ---
  const instanceDir = getInstanceDir(targetInstanceId);
  const zeroClawDir = path.join(instanceDir, 'zeroclaw');

  try {
    execSync('docker-compose down 2>&1', {
      cwd: zeroClawDir,
      timeout: 30000,  // 30s should be plenty for docker-compose down
      encoding: 'utf8'
    });
  } catch (err) {
    return {
      success: false,
      error: {
        code: 'LAND_FAILED',
        message: 'Failed to stop container',
        details: err.stderr || err.stdout || err.message,
        exitCode: err.status
      }
    };
  }

  // --- Update preferences ---
  const landedAt = new Date().toISOString();
  targetPrefs.zeroclaw = {
    ...targetPrefs.zeroclaw,
    enabled: false,
    landedAt,
    landedBy: instanceId
  };
  // zeroclaw_ready stays true — instance can be re-launched
  await writePreferences(targetInstanceId, targetPrefs);

  return {
    success: true,
    targetInstanceId,
    status: 'landed',
    landedAt,
    landedBy: instanceId,
    relaunchable: targetPrefs.zeroclaw_ready === true,
    hint: 'Container stopped. Data preserved. Use launch_instance to restart.',
    metadata: {
      timestamp: landedAt,
      function: 'land_instance'
    }
  };
}
