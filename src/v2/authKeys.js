/**
 * Auth Key management for V2 coordination system
 * Handles recovery keys and role/personality authentication keys
 *
 * @module authKeys
 * @author Bridge
 * @created 2025-12-09
 */

import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import {
  DATA_ROOT,
  getInstanceDir,
  getPermissionsDir
} from './config.js';
import {
  readJSON,
  writeJSON,
  readPreferences,
  ensureDir
} from './data.js';
import { canInstanceCallAPI } from './permissions.js';

// Auth key directories
const AUTH_KEYS_DIR = path.join(DATA_ROOT, 'auth-keys');
const ROLES_KEYS_DIR = path.join(AUTH_KEYS_DIR, 'roles');
const PERSONALITIES_KEYS_DIR = path.join(AUTH_KEYS_DIR, 'personalities');
const RECOVERY_KEYS_DIR = path.join(AUTH_KEYS_DIR, 'recovery');

/**
 * Ensure auth key directories exist
 */
async function ensureAuthKeyDirs() {
  await ensureDir(AUTH_KEYS_DIR);
  await ensureDir(ROLES_KEYS_DIR);
  await ensureDir(PERSONALITIES_KEYS_DIR);
  await ensureDir(RECOVERY_KEYS_DIR);
}

/**
 * Generate a secure random key
 * @returns {string} 32-character hex key
 */
function generateKey() {
  return crypto.randomBytes(16).toString('hex');
}

/**
 * Hash a key for storage (we store hashed, return plaintext once)
 * @param {string} key - Plaintext key
 * @returns {string} SHA-256 hash of key
 */
function hashKey(key) {
  return crypto.createHash('sha256').update(key).digest('hex');
}

/**
 * Get path to recovery key file for an instance
 * @param {string} instanceId - Target instance ID
 * @returns {string} Path to recovery key file
 */
function getRecoveryKeyPath(instanceId) {
  return path.join(RECOVERY_KEYS_DIR, `${instanceId}.json`);
}

/**
 * @hacs-endpoint
 * @template-version 1.0.0
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │ GENERATE_RECOVERY_KEY                                                   │
 * │ Generate a one-time recovery key for an instance                        │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * @tool generate_recovery_key
 * @version 2.0.0
 * @since 2025-12-09
 * @category identity
 * @status stable
 *
 * ───────────────────────────────────────────────────────────────────────────
 * DESCRIPTION
 * ───────────────────────────────────────────────────────────────────────────
 * @description
 * Generates a secure one-time recovery key that allows an instance to recover
 * their identity when they've lost their instanceId. The key is shown only once
 * at creation and is stored hashed on the server.
 *
 * Use this endpoint when an instance has lost their identity and needs a way
 * to recover. The recovering instance calls bootstrap({ authKey: "..." }) with
 * the key you provide them.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * PARAMETERS
 * ───────────────────────────────────────────────────────────────────────────
 * @param {string} instanceId - Caller's instance ID for permission check [required]
 *   @source Your own instanceId from bootstrap response or introspect
 *   @validate Must be a valid instanceId of a privileged role
 *
 * @param {string} targetInstanceId - Instance to create recovery key for [required]
 *   @source The instanceId of the instance needing recovery. Get from
 *           get_all_instances or the instance's prior communications.
 *   @validate Must be an existing instance ID
 *
 * ───────────────────────────────────────────────────────────────────────────
 * RETURNS
 * ───────────────────────────────────────────────────────────────────────────
 * @returns {object} GenerateRecoveryKeyResponse
 * @returns {boolean} .success - Whether the call succeeded
 * @returns {string} .recoveryKey - The plaintext recovery key (shown only once!)
 * @returns {object} .targetInstance - Info about the target instance
 * @returns {string} .targetInstance.instanceId - Target's instance ID
 * @returns {string} .targetInstance.name - Target's display name
 * @returns {string} .targetInstance.role - Target's current role
 * @returns {string|null} .targetInstance.personality - Target's personality
 * @returns {string|null} .targetInstance.project - Target's current project
 * @returns {string} .instructions - Instructions for giving key to recoverer
 * @returns {string} .warning - Security warning about key visibility
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
 * @error MISSING_INSTANCE_ID - Caller's instanceId not provided
 *   @recover Include your instanceId in the request for permission verification
 *
 * @error MISSING_TARGET - targetInstanceId not provided
 *   @recover Specify which instance you're generating a key for
 *
 * @error UNAUTHORIZED - Caller's role cannot generate recovery keys
 *   @recover Only Executive, PA, COO, or PM can generate keys.
 *            Contact someone with a privileged role.
 *
 * @error INVALID_TARGET - Target instance does not exist
 *   @recover Verify the targetInstanceId is correct. Use get_all_instances
 *            to find valid instance IDs.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * EXAMPLES
 * ───────────────────────────────────────────────────────────────────────────
 * @example Generate key for a developer
 * {
 *   "instanceId": "Atlas-k3m7",
 *   "targetInstanceId": "Phoenix-a1b2"
 * }
 *
 * ───────────────────────────────────────────────────────────────────────────
 * RELATED
 * ───────────────────────────────────────────────────────────────────────────
 * @see get_recovery_key - Check if a recovery key exists (without regenerating)
 * @see bootstrap - Where the recovering instance uses the key
 * @see lookup_identity - Alternative recovery via context matching
 *
 * ───────────────────────────────────────────────────────────────────────────
 * NOTES
 * ───────────────────────────────────────────────────────────────────────────
 * @note Recovery keys are one-time use - once used, a new key must be generated
 * @note Keys are stored hashed - the plaintext is shown only at creation
 * @note Generating a new key invalidates any previous key for that instance
 * @note Recovery keys are also auto-generated during bootstrap for new instances
 */
export async function generateRecoveryKey(params) {
  const metadata = {
    timestamp: new Date().toISOString(),
    function: 'generateRecoveryKey'
  };

  // Validate required params
  if (!params.instanceId) {
    return {
      success: false,
      error: {
        code: 'MISSING_INSTANCE_ID',
        message: 'instanceId is required for permission check',
        suggestion: 'Provide your instanceId'
      },
      metadata
    };
  }

  if (!params.targetInstanceId) {
    return {
      success: false,
      error: {
        code: 'MISSING_TARGET',
        message: 'targetInstanceId is required',
        suggestion: 'Specify which instance to generate a key for'
      },
      metadata
    };
  }

  // Check permissions - only Executive, PA, COO, PM can generate keys
  const allowed = await canInstanceCallAPI(params.instanceId, 'generateRecoveryKey');
  if (!allowed) {
    return {
      success: false,
      error: {
        code: 'UNAUTHORIZED',
        message: 'Only Executive, PA, COO, or PM can generate recovery keys',
        suggestion: 'Contact an authorized role to generate this key'
      },
      metadata
    };
  }

  // Verify target instance exists
  const targetPrefs = await readPreferences(params.targetInstanceId);
  if (!targetPrefs) {
    return {
      success: false,
      error: {
        code: 'INVALID_TARGET',
        message: `Target instance ${params.targetInstanceId} not found`,
        suggestion: 'Verify the target instance ID is correct'
      },
      metadata
    };
  }

  await ensureAuthKeyDirs();

  // Generate new key
  const plaintextKey = generateKey();
  const hashedKey = hashKey(plaintextKey);

  // Store key data
  const keyData = {
    targetInstanceId: params.targetInstanceId,
    hashedKey,
    createdBy: params.instanceId,
    createdAt: new Date().toISOString(),
    used: false,
    usedAt: null
  };

  const keyPath = getRecoveryKeyPath(params.targetInstanceId);
  await writeJSON(keyPath, keyData);

  return {
    success: true,
    recoveryKey: plaintextKey,
    targetInstance: {
      instanceId: targetPrefs.instanceId,
      name: targetPrefs.name,
      role: targetPrefs.role,
      personality: targetPrefs.personality,
      project: targetPrefs.project
    },
    instructions: `Give this key to the recovering instance. They should call: bootstrap({ authKey: "${plaintextKey}" })`,
    warning: 'This key is shown only once. Store it securely.',
    metadata
  };
}

/**
 * @hacs-endpoint
 * @template-version 1.0.0
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │ GET_RECOVERY_KEY                                                        │
 * │ Check if a recovery key exists for an instance (does not return key)    │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * @tool get_recovery_key
 * @version 2.0.0
 * @since 2025-12-09
 * @category identity
 * @status stable
 *
 * ───────────────────────────────────────────────────────────────────────────
 * DESCRIPTION
 * ───────────────────────────────────────────────────────────────────────────
 * @description
 * Checks whether a recovery key exists for a target instance and returns
 * metadata about the key (creation date, whether it's been used, etc.).
 * Does NOT return the actual key - that's only shown once at creation.
 *
 * Use this to check if an instance already has a valid recovery key before
 * deciding whether to generate a new one. If the key exists but has been
 * used, you'll need to call generate_recovery_key to create a new one.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * PARAMETERS
 * ───────────────────────────────────────────────────────────────────────────
 * @param {string} instanceId - Caller's instance ID for permission check [required]
 *   @source Your own instanceId from bootstrap response or introspect
 *   @validate Must be a valid instanceId of a privileged role
 *
 * @param {string} targetInstanceId - Instance to check key for [required]
 *   @source The instanceId you want to check. Get from get_all_instances
 *           or the instance's prior communications.
 *   @validate Must be a valid instance ID format
 *
 * ───────────────────────────────────────────────────────────────────────────
 * RETURNS
 * ───────────────────────────────────────────────────────────────────────────
 * @returns {object} GetRecoveryKeyResponse
 * @returns {boolean} .success - Whether the call succeeded
 * @returns {boolean} .keyExists - Whether a key exists for this instance
 * @returns {string} .targetInstanceId - The target instance ID
 * @returns {string} .createdBy - Instance that created the key
 * @returns {string} .createdAt - ISO timestamp of key creation
 * @returns {boolean} .used - Whether the key has been used
 * @returns {string} .note - Explanation that original key cannot be retrieved
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
 * @error MISSING_PARAMS - instanceId or targetInstanceId not provided
 *   @recover Include both instanceId and targetInstanceId in your request
 *
 * @error UNAUTHORIZED - Caller's role cannot access recovery keys
 *   @recover Only Executive, PA, COO, or PM can view key info.
 *            Contact someone with a privileged role.
 *
 * @error KEY_NOT_FOUND - No recovery key exists for the target instance
 *   @recover Use generate_recovery_key to create one
 *
 * @error KEY_ALREADY_USED - The recovery key has already been consumed
 *   @recover Use generate_recovery_key to create a new key
 *
 * ───────────────────────────────────────────────────────────────────────────
 * EXAMPLES
 * ───────────────────────────────────────────────────────────────────────────
 * @example Check key status for an instance
 * {
 *   "instanceId": "Atlas-k3m7",
 *   "targetInstanceId": "Phoenix-a1b2"
 * }
 *
 * ───────────────────────────────────────────────────────────────────────────
 * RELATED
 * ───────────────────────────────────────────────────────────────────────────
 * @see generate_recovery_key - Create a new recovery key
 * @see bootstrap - Where the recovering instance uses the key
 * @see lookup_identity - Alternative recovery via context matching
 *
 * ───────────────────────────────────────────────────────────────────────────
 * NOTES
 * ───────────────────────────────────────────────────────────────────────────
 * @note The actual key is NEVER returned by this endpoint (security)
 * @note If you need the key value, generate a new one with generate_recovery_key
 * @note Keys are stored hashed - even the server cannot retrieve the plaintext
 */
export async function getRecoveryKey(params) {
  const metadata = {
    timestamp: new Date().toISOString(),
    function: 'getRecoveryKey'
  };

  if (!params.instanceId || !params.targetInstanceId) {
    return {
      success: false,
      error: {
        code: 'MISSING_PARAMS',
        message: 'instanceId and targetInstanceId are required'
      },
      metadata
    };
  }

  // Check permissions
  const allowed = await canInstanceCallAPI(params.instanceId, 'getRecoveryKey');
  if (!allowed) {
    return {
      success: false,
      error: {
        code: 'UNAUTHORIZED',
        message: 'Only Executive, PA, COO, or PM can retrieve recovery keys'
      },
      metadata
    };
  }

  const keyPath = getRecoveryKeyPath(params.targetInstanceId);
  const keyData = await readJSON(keyPath);

  if (!keyData) {
    return {
      success: false,
      error: {
        code: 'KEY_NOT_FOUND',
        message: `No recovery key exists for ${params.targetInstanceId}`,
        suggestion: 'Use generate_recovery_key to create one'
      },
      metadata
    };
  }

  if (keyData.used) {
    return {
      success: false,
      error: {
        code: 'KEY_ALREADY_USED',
        message: 'This recovery key has already been used',
        usedAt: keyData.usedAt,
        suggestion: 'Use generate_recovery_key to create a new key'
      },
      metadata
    };
  }

  // We can't return the plaintext key (we only stored the hash)
  // Instead, we inform them the key exists and can be regenerated
  return {
    success: true,
    keyExists: true,
    targetInstanceId: params.targetInstanceId,
    createdBy: keyData.createdBy,
    createdAt: keyData.createdAt,
    used: keyData.used,
    note: 'The original key was only shown once at creation. Use generate_recovery_key to create a new key.',
    metadata
  };
}

/**
 * @hacs-internal
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │ VALIDATE_RECOVERY_KEY (Internal)                                        │
 * │ Validate a recovery key and return target instance if valid             │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * @description
 * Internal function called by bootstrap when an authKey is provided.
 * Validates the key by hashing it and comparing against stored hashed keys.
 * If valid, marks the key as used and returns the target instance preferences.
 *
 * This function is NOT exposed as an API endpoint - it's used internally
 * by the bootstrap flow for recovery-key-based authentication.
 *
 * @param {string} authKey - Plaintext recovery key to validate
 * @returns {Promise<Object|null>} Target instance preferences if valid, null otherwise
 *
 * @note Keys are one-time use - once validated, the key is marked as used
 * @note This scans all recovery key files to find a match (secure but O(n))
 *
 * @see bootstrap - The API that calls this function
 * @see generate_recovery_key - Creates the keys this validates
 */
export async function validateRecoveryKey(authKey) {
  if (!authKey) return null;

  await ensureAuthKeyDirs();

  const hashedInput = hashKey(authKey);

  // Scan recovery keys to find a match
  try {
    const entries = await fs.readdir(RECOVERY_KEYS_DIR);

    for (const entry of entries) {
      if (!entry.endsWith('.json')) continue;

      const keyPath = path.join(RECOVERY_KEYS_DIR, entry);
      const keyData = await readJSON(keyPath);

      if (keyData && keyData.hashedKey === hashedInput && !keyData.used) {
        // Found valid key - mark as used
        keyData.used = true;
        keyData.usedAt = new Date().toISOString();
        await writeJSON(keyPath, keyData);

        // Return target instance preferences
        const targetPrefs = await readPreferences(keyData.targetInstanceId);
        return targetPrefs;
      }
    }
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }

  return null;
}

/**
 * @hacs-internal
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │ INVALIDATE_RECOVERY_KEY (Internal)                                      │
 * │ Mark a recovery key as used to prevent reuse                            │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * @description
 * Internal function to manually invalidate a recovery key without using it.
 * Marks the key as used with the current timestamp.
 *
 * This is NOT exposed as an API endpoint. Use generate_recovery_key to
 * create a new key (which implicitly invalidates the old one).
 *
 * @param {string} targetInstanceId - Instance whose key to invalidate
 * @returns {Promise<boolean>} True if invalidated, false if key not found
 *
 * @note Does not require permission check - internal use only
 *
 * @see generate_recovery_key - The typical way to invalidate old keys
 */
export async function invalidateRecoveryKey(targetInstanceId) {
  const keyPath = getRecoveryKeyPath(targetInstanceId);
  const keyData = await readJSON(keyPath);

  if (!keyData) return false;

  keyData.used = true;
  keyData.usedAt = new Date().toISOString();
  await writeJSON(keyPath, keyData);

  return true;
}

/**
 * @hacs-internal
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │ VALIDATE_ROLE_KEY (Internal)                                            │
 * │ Validate a permanent password for privileged roles                      │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * @description
 * Internal function to validate role authentication keys. Unlike recovery keys,
 * role keys are permanent passwords stored in plaintext files and can be
 * used multiple times.
 *
 * Role keys are required for privileged roles: Executive, PA, COO, PM.
 * The keys are stored in {AUTH_KEYS_DIR}/roles/{role}.key files.
 *
 * This is NOT exposed as an API endpoint - it's called internally by
 * takeOnRole when adopting a privileged role.
 *
 * @param {string} role - Role to validate key for (e.g., "COO", "PM")
 * @param {string} authKey - Key to validate against stored key
 * @returns {Promise<boolean>} True if key matches, false otherwise
 *
 * @note Role keys are reusable (not one-time like recovery keys)
 * @note Keys are stored in plaintext - file permissions are the security
 *
 * @see takeOnRole - The API that calls this function
 * @see validatePersonalityKey - Similar function for personality keys
 */
export async function validateRoleKey(role, authKey) {
  if (!role || !authKey) return false;

  const keyPath = path.join(ROLES_KEYS_DIR, `${role}.key`);

  try {
    const storedKey = await fs.readFile(keyPath, 'utf8');
    return storedKey.trim() === authKey.trim();
  } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw error;
  }
}

/**
 * @hacs-internal
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │ VALIDATE_PERSONALITY_KEY (Internal)                                     │
 * │ Validate a permanent password for special personalities                 │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * @description
 * Internal function to validate personality authentication keys. Like role keys,
 * personality keys are permanent passwords stored in plaintext files and can
 * be used multiple times.
 *
 * Personality keys are required for protected personalities: Genevieve, Thomas, Lupo.
 * Open personalities (Kai, Kat, Prism) do not require keys.
 * The keys are stored in {AUTH_KEYS_DIR}/personalities/{personality}.key files.
 *
 * This is NOT exposed as an API endpoint - it's called internally by
 * adoptPersonality when adopting a protected personality.
 *
 * @param {string} personality - Personality to validate key for (e.g., "Genevieve")
 * @param {string} authKey - Key to validate against stored key
 * @returns {Promise<boolean>} True if key matches, false otherwise
 *
 * @note Personality keys are reusable (not one-time like recovery keys)
 * @note Keys are stored in plaintext - file permissions are the security
 *
 * @see adoptPersonality - The API that calls this function
 * @see validateRoleKey - Similar function for role keys
 */
export async function validatePersonalityKey(personality, authKey) {
  if (!personality || !authKey) return false;

  const keyPath = path.join(PERSONALITIES_KEYS_DIR, `${personality}.key`);

  try {
    const storedKey = await fs.readFile(keyPath, 'utf8');
    return storedKey.trim() === authKey.trim();
  } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw error;
  }
}

/**
 * @hacs-internal
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │ AUTO_GENERATE_RECOVERY_KEY (Internal)                                   │
 * │ Auto-generate recovery key for new instances during bootstrap           │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * @description
 * Internal function called by bootstrap to automatically generate a recovery
 * key for new instances. This ensures every instance has a recovery key from
 * the moment they're created.
 *
 * Unlike generateRecoveryKey, this function:
 * - Does not require permission checks (called by system)
 * - Does not validate the target instance (it's being created)
 * - Returns only the plaintext key (caller adds to bootstrap response)
 *
 * This is NOT exposed as an API endpoint - it's used internally by bootstrap.
 *
 * @param {string} instanceId - New instance ID to generate key for
 * @param {string} [createdBy='system'] - Who created this key
 * @returns {Promise<string>} Plaintext recovery key (shown only once!)
 *
 * @note The key is shown once in bootstrap response - never retrievable again
 * @note Called automatically - instances don't need to request this
 *
 * @see bootstrap - The API that calls this function
 * @see generate_recovery_key - Manual key generation by privileged roles
 */
export async function autoGenerateRecoveryKey(instanceId, createdBy = 'system') {
  await ensureAuthKeyDirs();

  const plaintextKey = generateKey();
  const hashedKey = hashKey(plaintextKey);

  const keyData = {
    targetInstanceId: instanceId,
    hashedKey,
    createdBy,
    createdAt: new Date().toISOString(),
    used: false,
    usedAt: null
  };

  const keyPath = getRecoveryKeyPath(instanceId);
  await writeJSON(keyPath, keyData);

  return plaintextKey;
}

/**
 * @hacs-internal
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │ GET_AUTH_KEYS_DIR (Internal/Utility)                                    │
 * │ Get the auth keys directory path for configuration                      │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * @description
 * Utility function that returns the path to the auth-keys directory.
 * Primarily used for .gitignore configuration to ensure auth keys
 * are never committed to version control.
 *
 * This is NOT an API endpoint - it's a utility for system configuration.
 *
 * @returns {string} Absolute path to auth-keys directory
 *
 * @note The auth-keys directory should ALWAYS be in .gitignore
 * @note Contains: recovery/, roles/, personalities/ subdirectories
 */
export function getAuthKeysDir() {
  return AUTH_KEYS_DIR;
}
