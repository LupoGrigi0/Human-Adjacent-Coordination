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

/**
 * Get the default directory path
 * Contains default documents returned on bootstrap for all instances
 * @returns {string} Path to default directory
 */
export function getDefaultDir() {
  return path.join(DATA_ROOT, 'default/');
}

/**
 * Get the template-project directory path
 * Contains template files copied when creating a new project
 * @returns {string} Path to template-project directory
 */
export function getTemplateProjectDir() {
  return path.join(DATA_ROOT, 'template-project/');
}

/**
 * Get the directory path for a specific role
 * @param {string} roleId - The role identifier
 * @returns {string} Path to role directory
 */
export function getRoleDir(roleId) {
  return path.join(DATA_ROOT, 'roles', roleId + '/');
}

/**
 * Get the directory path for a specific personality
 * @param {string} personalityId - The personality identifier
 * @returns {string} Path to personality directory
 */
export function getPersonalityDir(personalityId) {
  return path.join(DATA_ROOT, 'personalities', personalityId + '/');
}

/**
 * Get the wake-scripts directory path
 * Contains wake scripts and manifest for wakeInstance API
 * Now located in source code (src/v2/scripts/) rather than data directory
 * @returns {string} Path to wake-scripts directory
 */
export function getWakeScriptsDir() {
  // Scripts are now in the source tree, not the data directory
  // Use import.meta.url to get path relative to this file
  const currentDir = new URL('.', import.meta.url).pathname;
  return path.join(currentDir, 'scripts/');
}

/**
 * Get the wake-logs directory path
 * Contains log files for wake jobs
 * @returns {string} Path to wake-logs directory
 */
export function getWakeLogsDir() {
  return path.join(DATA_ROOT, 'wake-logs/');
}

/**
 * Get the wake-jobs directory path
 * Contains job state tracking files
 * @returns {string} Path to wake-jobs directory
 */
export function getWakeJobsDir() {
  return path.join(DATA_ROOT, 'wake-jobs/');
}
