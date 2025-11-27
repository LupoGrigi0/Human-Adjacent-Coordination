/**
 * Data utility module for V2 coordination system
 * Provides atomic file operations and instance-specific helpers
 * Based on V1 FileManager pattern with improved error handling
 */

import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { getInstanceDir } from './config.js';

/**
 * Read and parse a JSON file
 * @param {string} filePath - Path to JSON file
 * @returns {Promise<Object|null>} Parsed JSON data or null if file doesn't exist
 * @throws {Error} If file exists but contains invalid JSON or other read errors occur
 */
export async function readJSON(filePath) {
  try {
    const content = await fs.readFile(filePath, 'utf8');
    return JSON.parse(content);
  } catch (error) {
    if (error.code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

/**
 * Write data to a JSON file atomically
 * Uses temp file + rename pattern to ensure atomic writes
 * Automatically creates parent directories if they don't exist
 * @param {string} filePath - Path to JSON file
 * @param {Object} data - Data to write (will be JSON stringified)
 * @returns {Promise<void>}
 */
export async function writeJSON(filePath, data) {
  const dirPath = path.dirname(filePath);
  await ensureDir(dirPath);

  const tempPath = filePath + '.tmp';
  const content = JSON.stringify(data, null, 2) + '\n';

  try {
    await fs.writeFile(tempPath, content, 'utf8');
    await fs.rename(tempPath, filePath);
  } catch (error) {
    // Clean up temp file if it exists
    try {
      await fs.unlink(tempPath);
    } catch (unlinkError) {
      // Ignore errors from cleanup
    }
    throw error;
  }
}

/**
 * Ensure a file exists with default data
 * Creates the file with defaultData if it doesn't exist
 * Does nothing if the file already exists
 * @param {string} filePath - Path to file
 * @param {Object} defaultData - Default data to write if file doesn't exist
 * @returns {Promise<void>}
 */
export async function ensureFile(filePath, defaultData) {
  const existing = await readJSON(filePath);
  if (existing === null) {
    await writeJSON(filePath, defaultData);
  }
}

/**
 * Create directory recursively if it doesn't exist
 * @param {string} dirPath - Path to directory
 * @returns {Promise<void>}
 */
export async function ensureDir(dirPath) {
  try {
    await fs.mkdir(dirPath, { recursive: true });
  } catch (error) {
    // Ignore error if directory already exists
    if (error.code !== 'EEXIST') {
      throw error;
    }
  }
}

/**
 * List all files and directories in a directory
 * @param {string} dirPath - Path to directory
 * @returns {Promise<string[]>} Array of filenames (not full paths)
 * @throws {Error} If directory doesn't exist or can't be read
 */
export async function listDir(dirPath) {
  return await fs.readdir(dirPath);
}

/**
 * Read instance preferences.json file
 * @param {string} instanceId - Instance identifier
 * @returns {Promise<Object|null>} Preferences object or null if doesn't exist
 */
export async function readPreferences(instanceId) {
  const instanceDir = getInstanceDir(instanceId);
  const prefsPath = path.join(instanceDir, 'preferences.json');
  return await readJSON(prefsPath);
}

/**
 * Write instance preferences.json file
 * @param {string} instanceId - Instance identifier
 * @param {Object} prefs - Preferences object to write
 * @returns {Promise<void>}
 */
export async function writePreferences(instanceId, prefs) {
  const instanceDir = getInstanceDir(instanceId);
  const prefsPath = path.join(instanceDir, 'preferences.json');
  await writeJSON(prefsPath, prefs);
}

/**
 * Read instance diary.md file
 * @param {string} instanceId - Instance identifier
 * @returns {Promise<string|null>} Diary content or null if doesn't exist
 */
export async function readDiary(instanceId) {
  const instanceDir = getInstanceDir(instanceId);
  const diaryPath = path.join(instanceDir, 'diary.md');

  try {
    return await fs.readFile(diaryPath, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

/**
 * Append an entry to instance diary.md file
 * Creates the diary file if it doesn't exist
 * Automatically adds newlines for proper formatting
 * @param {string} instanceId - Instance identifier
 * @param {string} entry - Diary entry to append
 * @returns {Promise<void>}
 */
export async function appendDiary(instanceId, entry) {
  const instanceDir = getInstanceDir(instanceId);
  await ensureDir(instanceDir);

  const diaryPath = path.join(instanceDir, 'diary.md');
  const entryWithNewline = entry.endsWith('\n') ? entry : entry + '\n';

  await fs.appendFile(diaryPath, entryWithNewline, 'utf8');
}

/**
 * Generate a random 4-character suffix for instance IDs
 * Uses crypto.randomBytes for secure randomness
 * @returns {string} 4-character hexadecimal suffix (e.g., "a7b2")
 */
export function generateSuffix() {
  return crypto.randomBytes(2).toString('hex');
}

/**
 * Generate a full instance ID with name and random suffix
 * @param {string} name - Instance name
 * @returns {string} Full instance ID in format "{name}-{suffix}"
 * @example
 * generateInstanceId("alice") // Returns "alice-a7b2"
 */
export function generateInstanceId(name) {
  const suffix = generateSuffix();
  return `${name}-${suffix}`;
}
