/**
 * @hacs-endpoint
 * @template-version 1.1.0
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │ PERMISSIONS MODULE                                                      │
 * │ Role-based access control and token validation                          │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * @tool permissions_module
 * @version 2.0.0
 * @since 2025-11-27
 * @category system
 * @status stable
 * @visibility internal
 *
 * @description
 * Internal permissions and authorization module for V2 coordination system.
 * Handles role-based access control, token validation, and instance approvals.
 *
 * Key functions:
 * - canRoleCallAPI: Check if role can call specific API
 * - validateRoleToken: Validate privileged role tokens
 * - validatePersonalityToken: Validate privileged personality tokens
 * - approveInstanceForRole: Pre-approve instance for a role
 *
 * Privileged roles (require env tokens): Executive, PA, COO, PM
 * Privileged personalities (require env tokens): Genevieve, Thomas, Lupo
 *
 * @note Tokens stored in environment variables (not in git)
 * @note Default permissions loaded from DEFAULT_PERMISSIONS if file missing
 * @see data.js - Used for reading/writing JSON files
 */

import path from 'path';
import { getPermissionsDir } from './config.js';
import { readJSON, writeJSON, ensureFile } from './data.js';

/**
 * Privileged roles that require token validation
 * Tokens are stored in environment variables
 * @type {Object<string, string|undefined>}
 */
const PRIVILEGED_ROLES = {
  "Executive": process.env.EXECUTIVE_TOKEN,
  "PA": process.env.PA_TOKEN,
  "COO": process.env.COO_TOKEN,
  "PM": process.env.PM_TOKEN
};

/**
 * Privileged personalities that require token validation
 * Tokens are stored in environment variables
 * @type {Object<string, string|undefined>}
 */
const PRIVILEGED_PERSONALITIES = {
  "Genevieve": process.env.GENEVIEVE_TOKEN,
  "Thomas": process.env.THOMAS_TOKEN,
  "Lupo": process.env.LUPO_TOKEN
};

/**
 * Default permissions mapping API names to allowed roles
 * Created automatically if permissions.json doesn't exist
 * @type {Object<string, string[]>}
 */
const DEFAULT_PERMISSIONS = {
  "createProject": ["Executive", "PA", "COO"],
  "preApprove": ["Executive", "PA", "COO", "PM"],
  "wakeInstance": ["Executive", "PA", "COO", "PM"],
  "createTask": ["Executive", "PA", "COO", "PM"],
  "broadcastMessage": ["Executive", "PA", "COO"],
  "getAllProjects": ["Executive", "PA", "COO"],
  "getAllInstances": ["Executive", "PA", "COO"],
  "generateRecoveryKey": ["Executive", "PA", "COO", "PM"],
  "getRecoveryKey": ["Executive", "PA", "COO", "PM"],
  "launchInstance": ["Executive", "PA", "COO", "PM"],
  "landInstance": ["Executive", "PA", "COO", "PM"]
};

/**
 * Default approved roles mapping (empty object)
 * Created automatically if approved_roles.json doesn't exist
 * @type {Object<string, string>}
 */
const DEFAULT_APPROVED_ROLES = {};

/**
 * Get the path to permissions.json file
 * @returns {string} Path to permissions.json
 */
function getPermissionsPath() {
  return path.join(getPermissionsDir(), 'permissions.json');
}

/**
 * Get the path to approved_roles.json file
 * @returns {string} Path to approved_roles.json
 */
function getApprovedRolesPath() {
  return path.join(getPermissionsDir(), 'approved_roles.json');
}

/**
 * Initialize permission files with defaults if they don't exist
 * Creates the permissions directory and both JSON files
 * @returns {Promise<void>}
 */
export async function initializePermissions() {
  const permissionsPath = getPermissionsPath();
  const approvedRolesPath = getApprovedRolesPath();

  await ensureFile(permissionsPath, DEFAULT_PERMISSIONS);
  await ensureFile(approvedRolesPath, DEFAULT_APPROVED_ROLES);
}

/**
 * Load permissions.json file
 * Returns default permissions if file doesn't exist
 * @returns {Promise<Object<string, string[]>>} Permissions mapping API → roles
 * @throws {Error} If file exists but contains invalid JSON
 */
export async function loadPermissions() {
  const permissionsPath = getPermissionsPath();
  const permissions = await readJSON(permissionsPath);

  if (permissions === null) {
    return DEFAULT_PERMISSIONS;
  }

  return permissions;
}

/**
 * Load approved_roles.json file
 * Returns empty object if file doesn't exist
 * @returns {Promise<Object<string, string>>} Approved roles mapping instanceId → role
 * @throws {Error} If file exists but contains invalid JSON
 */
export async function loadApprovedRoles() {
  const approvedRolesPath = getApprovedRolesPath();
  const approvedRoles = await readJSON(approvedRolesPath);

  if (approvedRoles === null) {
    return DEFAULT_APPROVED_ROLES;
  }

  return approvedRoles;
}

/**
 * Check if a role is allowed to call a specific API
 * @param {string} role - Role name to check
 * @param {string} apiName - API name to check access for
 * @returns {Promise<boolean>} True if role can call API, false otherwise
 */
export async function canRoleCallAPI(role, apiName) {
  const permissions = await loadPermissions();

  // If API is not in permissions, deny access
  if (!permissions[apiName]) {
    return false;
  }

  // Check if role is in the allowed roles list
  return permissions[apiName].includes(role);
}

/**
 * Get the approved role for an instance
 * @param {string} instanceId - Instance identifier
 * @returns {Promise<string|null>} Role string if approved, null if not pre-approved
 */
export async function getApprovedRole(instanceId) {
  const approvedRoles = await loadApprovedRoles();
  return approvedRoles[instanceId] || null;
}

/**
 * Approve an instance for a specific role
 * Updates approved_roles.json with the new approval
 * @param {string} instanceId - Instance identifier
 * @param {string} role - Role to approve instance for
 * @returns {Promise<void>}
 */
export async function approveInstanceForRole(instanceId, role) {
  const approvedRolesPath = getApprovedRolesPath();
  const approvedRoles = await loadApprovedRoles();

  approvedRoles[instanceId] = role;

  await writeJSON(approvedRolesPath, approvedRoles);
}

/**
 * Validate token for a privileged role
 * Returns true if token matches or role doesn't require token validation
 * @param {string} role - Role name to validate
 * @param {string} token - Token to validate
 * @returns {boolean} True if token is valid or role is not privileged
 */
export function validateRoleToken(role, token) {
  // If role is not privileged, no token validation needed
  if (!isPrivilegedRole(role)) {
    return true;
  }

  // Get expected token for this role
  const expectedToken = PRIVILEGED_ROLES[role];

  // If no token is configured, validation fails
  if (!expectedToken) {
    return false;
  }

  // Case-sensitive string comparison
  return token === expectedToken;
}

/**
 * Validate token for a privileged personality
 * Returns true if token matches or personality doesn't require token validation
 * @param {string} personality - Personality name to validate
 * @param {string} token - Token to validate
 * @returns {boolean} True if token is valid or personality is not privileged
 */
export function validatePersonalityToken(personality, token) {
  // If personality is not privileged, no token validation needed
  if (!isPrivilegedPersonality(personality)) {
    return true;
  }

  // Get expected token for this personality
  const expectedToken = PRIVILEGED_PERSONALITIES[personality];

  // If no token is configured, validation fails
  if (!expectedToken) {
    return false;
  }

  // Case-sensitive string comparison
  return token === expectedToken;
}

/**
 * Check if a role is privileged (requires token validation)
 * @param {string} role - Role name to check
 * @returns {boolean} True if role is privileged
 */
export function isPrivilegedRole(role) {
  return role in PRIVILEGED_ROLES;
}

/**
 * Check if a personality is privileged (requires token validation)
 * @param {string} personality - Personality name to check
 * @returns {boolean} True if personality is privileged
 */
export function isPrivilegedPersonality(personality) {
  return personality in PRIVILEGED_PERSONALITIES;
}

/**
 * Check if an instance can call a specific API based on their role
 * Looks up instance's role from preferences and checks permissions
 * @param {string} instanceId - Instance identifier
 * @param {string} apiName - API name to check access for
 * @returns {Promise<boolean>} True if instance can call API
 */
export async function canInstanceCallAPI(instanceId, apiName) {
  // Import readPreferences here to avoid circular dependency
  const { readPreferences } = await import('./data.js');

  const prefs = await readPreferences(instanceId);
  if (!prefs || !prefs.role) {
    return false;
  }

  return canRoleCallAPI(prefs.role, apiName);
}
