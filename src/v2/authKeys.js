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
 * Generate a recovery key for an instance
 * Called automatically on bootstrap, or manually by privileged roles
 *
 * @param {Object} params - Generation parameters
 * @param {string} params.instanceId - Caller's instance ID (for permission check)
 * @param {string} params.targetInstanceId - Instance to create key for
 * @returns {Promise<Object>} Key generation result with plaintext key
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
 * Get recovery key for an instance (returns existing key if not used)
 * Privileged roles only
 *
 * @param {Object} params - Retrieval parameters
 * @param {string} params.instanceId - Caller's instance ID
 * @param {string} params.targetInstanceId - Instance to get key for
 * @returns {Promise<Object>} Key retrieval result
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
 * Validate a recovery key and return target instance if valid
 * Called by bootstrap when authKey is provided
 *
 * @param {string} authKey - Plaintext recovery key
 * @returns {Promise<Object|null>} Target instance preferences if valid, null otherwise
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
 * Invalidate a recovery key (mark as used)
 *
 * @param {string} targetInstanceId - Instance whose key to invalidate
 * @returns {Promise<boolean>} True if invalidated, false if not found
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
 * Validate a role key (permanent password for privileged roles)
 *
 * @param {string} role - Role to validate key for
 * @param {string} authKey - Key to validate
 * @returns {Promise<boolean>} True if key is valid
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
 * Validate a personality key (permanent password for special personalities)
 *
 * @param {string} personality - Personality to validate key for
 * @param {string} authKey - Key to validate
 * @returns {Promise<boolean>} True if key is valid
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
 * Auto-generate recovery key for a new instance
 * Called internally by bootstrap for new instances
 *
 * @param {string} instanceId - New instance ID
 * @param {string} createdBy - Who created this instance (or 'system')
 * @returns {Promise<string>} Plaintext recovery key
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
 * Get auth keys directory path (for .gitignore)
 * @returns {string} Path to auth-keys directory
 */
export function getAuthKeysDir() {
  return AUTH_KEYS_DIR;
}
