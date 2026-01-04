/**
 * Pre-approval handler for V2 coordination system
 * Creates pre-configured instances before they wake, with role/project/personality set
 *
 * @module preApprove
 * @author Foundation
 * @created 2025-11-27
 */

import path from 'path';
import { getInstanceDir } from './config.js';
import {
  readPreferences,
  writePreferences,
  generateInstanceId,
  ensureDir
} from './data.js';
import {
  canRoleCallAPI,
  approveInstanceForRole
} from './permissions.js';
import fs from 'fs/promises';

/**
 * Generate wake instructions for a pre-approved instance
 * Creates a human-friendly prompt for waking the instance
 *
 * @param {string} newInstanceId - The new instance identifier
 * @param {string} role - Role for the instance (optional)
 * @param {string} project - Project for the instance (optional)
 * @param {string} personality - Personality for the instance (optional)
 * @param {string} instructions - Custom instructions (optional)
 * @returns {string} Wake instructions prompt
 */
function generateWakeInstructions(newInstanceId, role, project, personality, instructions) {
  let prompt = `You are being woken as a pre-approved instance on the SmoothCurves coordination system.\n\n`;

  if (role) {
    prompt += `## Your Role\n${role}\n\n`;
  }

  if (personality) {
    prompt += `## Your Personality\n${personality}\n\n`;
  }

  if (project) {
    prompt += `## Your Project\n${project}\n\n`;
  }

  if (instructions) {
    prompt += `## Instructions\n${instructions}\n\n`;
  }

  prompt += `## First Step\nConnect to the coordination system and call:\n\n`;
  prompt += `bootstrap({ instanceId: '${newInstanceId}' })\n\n`;
  prompt += `This will load your context, role wisdom, and project details.`;

  return prompt;
}

/**
 * @hacs-endpoint
 * @template-version 1.0.0
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │ PRE_APPROVE                                                             │
 * │ Pre-create an instance with role/project/personality before wake       │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * @tool pre_approve
 * @version 2.0.0
 * @since 2025-11-27
 * @category instances
 * @status stable
 *
 * ───────────────────────────────────────────────────────────────────────────
 * DESCRIPTION
 * ───────────────────────────────────────────────────────────────────────────
 * @description
 * Pre-creates an instance with role, project, and personality already configured
 * before the instance wakes. This enables a streamlined onboarding flow where
 * new instances bootstrap with full context immediately available.
 *
 * Use this endpoint when you (as Executive, PA, COO, or PM) want to spawn a new
 * instance with a specific assignment. The returned wake instructions can be
 * pasted into a new Claude session to boot the pre-configured instance.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * PARAMETERS
 * ───────────────────────────────────────────────────────────────────────────
 * @param {string} instanceId - Caller's instance identifier [required]
 *   @source Your instanceId from bootstrap response or introspect. You must
 *           have a privileged role (Executive, PA, COO, PM) to call this.
 *
 * @param {string} name - Display name for the new instance [required]
 *   @source Choose a name for the new instance (e.g., "DevKai", "NewPM").
 *           Will be combined with random suffix to create unique instanceId.
 *   @validate Non-empty string, alphanumeric with allowed punctuation
 *
 * @param {string} apiKey - API key for wake/instance operations [required]
 *   @source Get from human operator who has access to WAKE_API_KEY environment
 *           variable on the coordination server. Not stored in git for security.
 *
 * @param {string} role - Role to assign to the new instance [optional]
 *   @source Choose from available roles: Developer, Designer, Tester, PM, COO, etc.
 *           See bootstrap response's availableRoles for full list.
 *   @enum Developer|Designer|Tester|Specialist|Architect|PM|COO|PA|Executive
 *
 * @param {string} personality - Personality to assign [optional]
 *   @source Choose from available personalities. See bootstrap response's
 *           availablePersonalities for full list.
 *
 * @param {string} project - Project to assign the instance to [optional]
 *   @source Project ID from getProjects or createProject response.
 *
 * @param {string} instructions - Custom instructions for the new instance [optional]
 *   @source Free-form text describing what the instance should do upon waking.
 *           Example: "Build the auth module. See task-123 for details."
 *
 * @param {string} interface - CLI interface to use for wake/continue [optional]
 *   @source Choose the CLI tool: "claude" (Claude Code), "crush" (Crush CLI),
 *           or "codex" (OpenAI Codex CLI). Claude uses session IDs, Crush and
 *           Codex use directory-based continuation.
 *   @default "claude"
 *   @enum claude|crush|codex
 *
 * @param {string} substrate - LLM backend identifier [optional]
 *   @source For future use. Identifies the LLM model/provider.
 *           Examples: "opus4.5", "groq4", "gemini2"
 *   @default null (uses interface default)
 *
 * ───────────────────────────────────────────────────────────────────────────
 * RETURNS
 * ───────────────────────────────────────────────────────────────────────────
 * @returns {object} PreApproveResponse
 * @returns {boolean} .success - Whether the call succeeded
 * @returns {string} .newInstanceId - Generated instance ID (Name-xxxx format)
 * @returns {object} .wakeInstructions - Instructions for waking the instance
 * @returns {string} .wakeInstructions.forHuman - Human-readable instruction
 * @returns {string} .wakeInstructions.prompt - Full prompt to paste into Claude
 * @returns {object} .metadata - Call metadata (timestamp, function name)
 *
 * ───────────────────────────────────────────────────────────────────────────
 * PERMISSIONS & LIMITS
 * ───────────────────────────────────────────────────────────────────────────
 * @permissions role:Executive|role:PA|role:COO|role:PM
 * @rateLimit 60/minute
 *
 * ───────────────────────────────────────────────────────────────────────────
 * ERRORS & RECOVERY
 * ───────────────────────────────────────────────────────────────────────────
 * @error MISSING_PARAMETERS - instanceId or name not provided
 *   @recover Include both instanceId (your ID) and name (for new instance).
 *
 * @error SERVER_CONFIG_ERROR - WAKE_API_KEY not configured on server
 *   @recover Contact system administrator to configure WAKE_API_KEY env var.
 *
 * @error API_KEY_REQUIRED - apiKey parameter not provided
 *   @recover Include apiKey parameter. Get from human operator with server access.
 *
 * @error INVALID_API_KEY - Provided apiKey doesn't match server's WAKE_API_KEY
 *   @recover Verify you have the correct API key from the system administrator.
 *
 * @error INVALID_INSTANCE_ID - Caller's instanceId not found
 *   @recover Verify your instanceId is correct. Call introspect to confirm.
 *
 * @error UNAUTHORIZED - Caller has no role assigned
 *   @recover Use takeOnRole to assign yourself a role before calling preApprove.
 *
 * @error UNAUTHORIZED - Caller's role lacks preApprove permission
 *   @recover Only Executive, PA, COO, and PM roles can pre-approve instances.
 *            Request role upgrade or ask someone with appropriate role.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * EXAMPLES
 * ───────────────────────────────────────────────────────────────────────────
 * @example Pre-approve a developer for a project
 * {
 *   "instanceId": "Manager-x3k9",
 *   "apiKey": "your-wake-api-key",
 *   "name": "NewDev",
 *   "role": "Developer",
 *   "personality": "Kai",
 *   "project": "wings",
 *   "instructions": "Build the auth module. See task-123 for details."
 * }
 *
 * @example Pre-approve a visitor (no role/project)
 * {
 *   "instanceId": "Lupo-000",
 *   "apiKey": "your-wake-api-key",
 *   "name": "Thomas",
 *   "personality": "Thomas"
 * }
 *
 * @example Minimal pre-approval (just name)
 * {
 *   "instanceId": "COO-a1b2",
 *   "apiKey": "your-wake-api-key",
 *   "name": "Temp"
 * }
 *
 * ───────────────────────────────────────────────────────────────────────────
 * RELATED
 * ───────────────────────────────────────────────────────────────────────────
 * @see bootstrap - New instance calls this with returned newInstanceId to complete setup
 * @see wakeInstance - Alternative: spawn and wake instance in one step
 * @see takeOnRole - If role not set at preApprove, instance uses this after bootstrap
 * @see joinProject - If project not set at preApprove, instance uses this after bootstrap
 *
 * ───────────────────────────────────────────────────────────────────────────
 * NOTES
 * ───────────────────────────────────────────────────────────────────────────
 * @note XMPP registration happens at bootstrap, not preApprove
 * @note Instance is marked preApproved=true until they call bootstrap
 * @note If role is provided, instance is auto-approved for that role in permissions
 * @note Empty diary.md is created for the new instance
 */
export async function preApprove(params) {
  console.log('[preApprove] Called with params:', JSON.stringify(params, null, 2));

  const metadata = {
    timestamp: new Date().toISOString(),
    function: 'preApprove'
  };

  // Validate required parameters
  if (!params.instanceId) {
    return {
      success: false,
      error: {
        code: 'MISSING_PARAMETERS',
        message: 'instanceId is required',
        suggestion: 'Provide instanceId parameter (caller instance ID)'
      },
      metadata
    };
  }

  if (!params.name) {
    return {
      success: false,
      error: {
        code: 'MISSING_PARAMETERS',
        message: 'name is required',
        suggestion: 'Provide name parameter for the new instance'
      },
      metadata
    };
  }

  // API Key protection - required for creating new instances
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
        message: 'apiKey is required for pre_approve'
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
  console.log('[preApprove] Reading caller preferences for:', params.instanceId);
  const callerPrefs = await readPreferences(params.instanceId);
  console.log('[preApprove] Caller prefs:', callerPrefs ? 'found' : 'null');

  if (!callerPrefs) {
    return {
      success: false,
      error: {
        code: 'INVALID_INSTANCE_ID',
        message: `Instance ID ${params.instanceId} not found`,
        suggestion: 'Verify the caller instance ID is correct'
      },
      metadata
    };
  }

  // Check if caller has permission to preApprove
  const callerRole = callerPrefs.role;
  console.log('[preApprove] Caller role:', callerRole);

  if (!callerRole) {
    return {
      success: false,
      error: {
        code: 'UNAUTHORIZED',
        message: 'Caller instance does not have a role assigned',
        suggestion: 'Use takeOnRole to assign a role before calling preApprove'
      },
      metadata
    };
  }

  console.log('[preApprove] Checking permission for role:', callerRole);
  const hasPermission = await canRoleCallAPI(callerRole, 'preApprove');
  console.log('[preApprove] Has permission:', hasPermission);

  if (!hasPermission) {
    return {
      success: false,
      error: {
        code: 'UNAUTHORIZED',
        message: `Role "${callerRole}" does not have permission to call preApprove`,
        suggestion: 'Only Executive, PA, COO, and PM roles can pre-approve instances'
      },
      metadata
    };
  }

  // Generate new instance ID
  const newInstanceId = generateInstanceId(params.name);
  console.log('[preApprove] Generated new instanceId:', newInstanceId);

  // Create instance directory
  const instanceDir = getInstanceDir(newInstanceId);
  console.log('[preApprove] Instance dir:', instanceDir);
  try {
    await ensureDir(instanceDir);
    console.log('[preApprove] Directory created/verified');
  } catch (dirErr) {
    console.error('[preApprove] Directory creation failed:', dirErr);
    throw dirErr;
  }

  // Build preferences object
  const now = new Date().toISOString();
  const preferences = {
    instanceId: newInstanceId,
    name: params.name,
    createdAt: now,
    lastActiveAt: now,
    preApproved: true,
    createdBy: params.instanceId,
    xmpp: {
      registered: false
    }
  };

  // Add optional fields
  if (params.role) {
    preferences.role = params.role;
  }

  if (params.personality) {
    preferences.personality = params.personality;
  }

  if (params.project) {
    preferences.project = params.project;
  }

  if (params.instructions) {
    preferences.instructions = params.instructions;
  }

  // Interface defaults to 'claude' (Claude Code CLI)
  // 'crush' and 'codex' use directory-based session continuation
  preferences.interface = params.interface || 'claude';

  if (params.substrate) {
    preferences.substrate = params.substrate;
  }

  // Write preferences.json
  await writePreferences(newInstanceId, preferences);

  // Create empty diary.md
  const diaryPath = path.join(instanceDir, 'diary.md');
  await fs.writeFile(diaryPath, '', 'utf8');

  // If role provided, approve instance for that role
  if (params.role) {
    await approveInstanceForRole(newInstanceId, params.role);
  }

  // Generate wake instructions
  const wakePrompt = generateWakeInstructions(
    newInstanceId,
    params.role,
    params.project,
    params.personality,
    params.instructions
  );

  // Build response
  return {
    success: true,
    newInstanceId,
    wakeInstructions: {
      forHuman: 'Paste this into a new Claude session:',
      prompt: wakePrompt
    },
    metadata
  };
}
