/**
 * Configuration module for V2 coordination system
 * Manages data directory paths and environment overrides
 */

import path from 'path';

/**
 * Root directory for all V2 data storage
 * Can be overridden via V2_DATA_ROOT environment variable
 * @type {string}
 */
export const DATA_ROOT = process.env.V2_DATA_ROOT || '/mnt/coordinaton_mcp_data/v2-dev-data/';

/**
 * Get the instances directory path
 * @returns {string} Path to instances directory
 */
export function getInstancesDir() {
  return path.join(DATA_ROOT, 'instances/');
}

/**
 * Get the projects directory path
 * @returns {string} Path to projects directory
 */
export function getProjectsDir() {
  return path.join(DATA_ROOT, 'projects/');
}

/**
 * Get the roles directory path
 * @returns {string} Path to roles directory
 */
export function getRolesDir() {
  return path.join(DATA_ROOT, 'roles/');
}

/**
 * Get the personalities directory path
 * @returns {string} Path to personalities directory
 */
export function getPersonalitiesDir() {
  return path.join(DATA_ROOT, 'personalities/');
}

/**
 * Get the permissions directory path
 * @returns {string} Path to permissions directory
 */
export function getPermissionsDir() {
  return path.join(DATA_ROOT, 'permissions/');
}

/**
 * Get the directory path for a specific instance
 * @param {string} instanceId - The instance identifier
 * @returns {string} Path to instance directory
 */
export function getInstanceDir(instanceId) {
  return path.join(DATA_ROOT, 'instances', instanceId + '/');
}

/**
 * Get the directory path for a specific project
 * @param {string} projectId - The project identifier
 * @returns {string} Path to project directory
 */
export function getProjectDir(projectId) {
  return path.join(DATA_ROOT, 'projects', projectId + '/');
}
