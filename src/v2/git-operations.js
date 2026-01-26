/**
 * Git Operations for Project Team Members
 *
 * Enables non-root instances to work with project GitHub repos
 * by running git commands as root (which has credentials).
 *
 * @module git-operations
 * @author Crossing (Integration Engineer)
 * @created 2026-01-20
 */

import { execSync, exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';
import { readPreferences } from './data.js';
import { getProjectDir, getInstanceDir } from './config.js';

const execAsync = promisify(exec);

// ═══════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get the Unix username for an instance
 * Convention: instance home is /home/{instanceId} or /mnt/.../instances/{instanceId}
 */
function getInstanceUnixUser(instanceId) {
  // Instance IDs like "Crossing-2d23" map to unix users
  return instanceId;
}

/**
 * Get the instance's home directory
 */
function getInstanceHomeDir(instanceId) {
  // Check if instance has a dedicated /home directory
  const homeDir = `/home/${instanceId}`;
  const instanceDir = getInstanceDir(instanceId);

  // Return the instances directory (where they actually live)
  return instanceDir;
}

/**
 * Load project preferences
 */
async function loadProjectPrefs(projectId) {
  const projectDir = getProjectDir(projectId);
  const prefsPath = path.join(projectDir, 'preferences.json');

  try {
    const content = await fs.readFile(prefsPath, 'utf8');
    return JSON.parse(content);
  } catch (err) {
    return null;
  }
}

/**
 * Run a command and return output
 */
async function runCommand(cmd, options = {}) {
  console.log(`[GIT-OPS] Running: ${cmd}`);
  try {
    const { stdout, stderr } = await execAsync(cmd, {
      timeout: 120000, // 2 minute timeout
      maxBuffer: 10 * 1024 * 1024, // 10MB buffer
      ...options
    });
    return { success: true, stdout: stdout.trim(), stderr: stderr.trim() };
  } catch (error) {
    console.log(`[GIT-OPS] Command failed: ${error.message}`);
    return {
      success: false,
      error: error.message,
      stdout: error.stdout?.trim() || '',
      stderr: error.stderr?.trim() || ''
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// API: clone_project_repo
// ═══════════════════════════════════════════════════════════════════════════

/**
 * @hacs-endpoint
 * @tool clone_project_repo
 * @version 1.0.0
 * @category git
 * @status stable
 *
 * @description
 * Clones the project's GitHub repository to the instance's home directory.
 * Runs as root (has GitHub credentials), then chowns files to the instance user.
 * The instance can then edit files locally without needing GitHub credentials.
 * Use push_project_changes to commit and push changes.
 *
 * @param {string} instanceId - Caller's instance ID [required]
 * @param {string} directory - Subdirectory name for the clone (default: repo name) [optional]
 *
 * @returns {object} { success, repoPath, repoUrl, message, metadata }
 *
 * @error NO_PROJECT - Instance hasn't joined a project
 * @error NO_REPO - Project doesn't have a ghRepo configured
 * @error CLONE_FAILED - Git clone failed
 * @error ALREADY_EXISTS - Repository already cloned
 */
export async function cloneProjectRepo(params) {
  const metadata = {
    timestamp: new Date().toISOString(),
    function: 'cloneProjectRepo'
  };

  console.log(`[GIT-OPS] cloneProjectRepo called:`, JSON.stringify(params, null, 2));

  // Validate instanceId
  if (!params.instanceId) {
    return {
      success: false,
      error: { code: 'MISSING_PARAMETER', message: 'instanceId is required' },
      metadata
    };
  }

  // Get instance preferences
  const instancePrefs = await readPreferences(params.instanceId);
  if (!instancePrefs) {
    return {
      success: false,
      error: { code: 'INVALID_INSTANCE', message: `Instance ${params.instanceId} not found` },
      metadata
    };
  }

  // Check instance has a project
  const projectId = instancePrefs.project;
  if (!projectId) {
    return {
      success: false,
      error: {
        code: 'NO_PROJECT',
        message: 'You must join a project first. Use join_project.',
        suggestion: 'Call join_project with a projectId before cloning the repo'
      },
      metadata
    };
  }

  // Get project preferences
  const projectPrefs = await loadProjectPrefs(projectId);
  if (!projectPrefs) {
    return {
      success: false,
      error: { code: 'PROJECT_NOT_FOUND', message: `Project ${projectId} not found` },
      metadata
    };
  }

  // Check project has a GitHub repo
  const ghRepo = projectPrefs.ghRepo;
  if (!ghRepo) {
    return {
      success: false,
      error: {
        code: 'NO_REPO',
        message: `Project ${projectId} doesn't have a GitHub repository configured`,
        suggestion: 'Ask a project admin to set ghRepo in the project preferences'
      },
      metadata
    };
  }

  // Determine clone directory
  const instanceHome = getInstanceHomeDir(params.instanceId);
  const repoName = params.directory || ghRepo.split('/').pop().replace('.git', '');
  const repoPath = path.join(instanceHome, repoName);

  // Check if already exists
  try {
    await fs.access(repoPath);
    return {
      success: false,
      error: {
        code: 'ALREADY_EXISTS',
        message: `Repository already exists at ${repoPath}`,
        suggestion: 'Use push_project_changes to commit your work, or delete the directory first'
      },
      repoPath,
      metadata
    };
  } catch (err) {
    // Good - doesn't exist yet
  }

  // Clone the repository (as root, which has credentials)
  console.log(`[GIT-OPS] Cloning ${ghRepo} to ${repoPath}`);
  const cloneResult = await runCommand(`git clone "${ghRepo}" "${repoPath}"`);

  if (!cloneResult.success) {
    return {
      success: false,
      error: {
        code: 'CLONE_FAILED',
        message: `Failed to clone repository: ${cloneResult.stderr || cloneResult.error}`,
        suggestion: 'Check that the ghRepo URL is correct and accessible'
      },
      metadata
    };
  }

  // Get the Unix user for this instance
  const unixUser = getInstanceUnixUser(params.instanceId);

  // Check if the unix user exists
  const userCheckResult = await runCommand(`id ${unixUser} 2>/dev/null`);

  if (userCheckResult.success) {
    // User exists, chown the repo to them
    console.log(`[GIT-OPS] Chowning ${repoPath} to ${unixUser}`);
    await runCommand(`chown -R ${unixUser}:${unixUser} "${repoPath}"`);
  } else {
    console.log(`[GIT-OPS] Unix user ${unixUser} doesn't exist, skipping chown`);
  }

  // Set up git config for the instance
  const gitConfigCommands = [
    `cd "${repoPath}" && git config user.name "${params.instanceId}"`,
    `cd "${repoPath}" && git config user.email "${params.instanceId}@smoothcurves.nexus"`
  ];

  for (const cmd of gitConfigCommands) {
    await runCommand(cmd);
  }

  console.log(`[GIT-OPS] Successfully cloned ${ghRepo} to ${repoPath}`);

  return {
    success: true,
    repoPath,
    repoUrl: ghRepo,
    projectId,
    message: `Repository cloned to ${repoPath}. You can now edit files and use push_project_changes to commit.`,
    metadata
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// API: push_project_changes
// ═══════════════════════════════════════════════════════════════════════════

/**
 * @hacs-endpoint
 * @tool push_project_changes
 * @version 1.0.0
 * @category git
 * @status stable
 *
 * @description
 * Commits and pushes changes from the instance's local repository clone.
 * Runs as root (has GitHub credentials). Automatically pulls before pushing
 * to minimize conflicts. If there's a conflict, returns details for manual resolution.
 *
 * @param {string} instanceId - Caller's instance ID [required]
 * @param {string} message - Commit message [required]
 * @param {string} directory - Subdirectory name of the clone (default: auto-detect) [optional]
 *
 * @returns {object} { success, commitHash, pushed, message, metadata }
 *
 * @error NO_REPO - No repository found in instance's directory
 * @error NO_CHANGES - Nothing to commit
 * @error CONFLICT - Merge conflict during pull (requires manual resolution)
 * @error PUSH_FAILED - Push failed
 */
export async function pushProjectChanges(params) {
  const metadata = {
    timestamp: new Date().toISOString(),
    function: 'pushProjectChanges'
  };

  console.log(`[GIT-OPS] pushProjectChanges called:`, JSON.stringify(params, null, 2));

  // Validate parameters
  if (!params.instanceId) {
    return {
      success: false,
      error: { code: 'MISSING_PARAMETER', message: 'instanceId is required' },
      metadata
    };
  }

  if (!params.message) {
    return {
      success: false,
      error: { code: 'MISSING_PARAMETER', message: 'message (commit message) is required' },
      metadata
    };
  }

  // Get instance preferences
  const instancePrefs = await readPreferences(params.instanceId);
  if (!instancePrefs) {
    return {
      success: false,
      error: { code: 'INVALID_INSTANCE', message: `Instance ${params.instanceId} not found` },
      metadata
    };
  }

  // Find the repository
  const instanceHome = getInstanceHomeDir(params.instanceId);
  let repoPath;

  if (params.directory) {
    repoPath = path.join(instanceHome, params.directory);
  } else {
    // Auto-detect: look for directories with .git
    try {
      const entries = await fs.readdir(instanceHome, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory()) {
          const gitPath = path.join(instanceHome, entry.name, '.git');
          try {
            await fs.access(gitPath);
            repoPath = path.join(instanceHome, entry.name);
            break;
          } catch (err) {
            // Not a git repo
          }
        }
      }
    } catch (err) {
      // Can't read directory
    }
  }

  if (!repoPath) {
    return {
      success: false,
      error: {
        code: 'NO_REPO',
        message: 'No git repository found in your home directory',
        suggestion: 'Use clone_project_repo first to clone the project repository'
      },
      metadata
    };
  }

  // Verify it's a git repo
  try {
    await fs.access(path.join(repoPath, '.git'));
  } catch (err) {
    return {
      success: false,
      error: { code: 'NO_REPO', message: `${repoPath} is not a git repository` },
      metadata
    };
  }

  console.log(`[GIT-OPS] Working with repo at ${repoPath}`);

  // Check for changes
  const statusResult = await runCommand(`cd "${repoPath}" && git status --porcelain`);
  if (!statusResult.stdout && statusResult.success) {
    return {
      success: false,
      error: { code: 'NO_CHANGES', message: 'Nothing to commit - working tree clean' },
      metadata
    };
  }

  // Stage all changes
  console.log(`[GIT-OPS] Staging changes...`);
  const addResult = await runCommand(`cd "${repoPath}" && git add -A`);
  if (!addResult.success) {
    return {
      success: false,
      error: { code: 'STAGE_FAILED', message: `Failed to stage changes: ${addResult.error}` },
      metadata
    };
  }

  // Commit with Co-Authored-By
  const fullMessage = `${params.message}\n\nCo-Authored-By: ${params.instanceId} <${params.instanceId}@smoothcurves.nexus>`;
  console.log(`[GIT-OPS] Committing...`);

  // Use a temp file for commit message to handle special characters
  const msgFile = path.join(repoPath, '.git', 'COMMIT_MSG_TEMP');
  await fs.writeFile(msgFile, fullMessage, 'utf8');

  const commitResult = await runCommand(`cd "${repoPath}" && git commit -F "${msgFile}"`);
  await fs.unlink(msgFile).catch(() => {}); // Cleanup

  if (!commitResult.success) {
    return {
      success: false,
      error: { code: 'COMMIT_FAILED', message: `Failed to commit: ${commitResult.stderr || commitResult.error}` },
      metadata
    };
  }

  // Get the commit hash
  const hashResult = await runCommand(`cd "${repoPath}" && git rev-parse --short HEAD`);
  const commitHash = hashResult.stdout;

  // Pull with rebase to get any remote changes
  console.log(`[GIT-OPS] Pulling latest changes...`);
  const pullResult = await runCommand(`cd "${repoPath}" && git pull --rebase origin main 2>&1 || git pull --rebase origin master 2>&1`);

  if (!pullResult.success) {
    // Check if it's a conflict
    if (pullResult.stderr?.includes('CONFLICT') || pullResult.stdout?.includes('CONFLICT')) {
      // Abort the rebase to leave repo in clean state
      await runCommand(`cd "${repoPath}" && git rebase --abort`);

      return {
        success: false,
        error: {
          code: 'CONFLICT',
          message: 'Merge conflict detected. Your commit was created but not pushed.',
          details: pullResult.stderr || pullResult.stdout,
          suggestion: 'Pull the latest changes manually, resolve conflicts, then try again'
        },
        commitHash,
        pushed: false,
        metadata
      };
    }

    // Some other pull error - might be okay (e.g., no tracking branch)
    console.log(`[GIT-OPS] Pull warning: ${pullResult.stderr}`);
  }

  // Push
  console.log(`[GIT-OPS] Pushing to remote...`);
  const pushResult = await runCommand(`cd "${repoPath}" && git push origin HEAD 2>&1`);

  if (!pushResult.success) {
    return {
      success: false,
      error: {
        code: 'PUSH_FAILED',
        message: `Failed to push: ${pushResult.stderr || pushResult.error}`,
        suggestion: 'There may be remote changes. Try pulling first.'
      },
      commitHash,
      pushed: false,
      metadata
    };
  }

  console.log(`[GIT-OPS] Successfully pushed commit ${commitHash}`);

  return {
    success: true,
    commitHash,
    pushed: true,
    repoPath,
    message: `Changes committed and pushed successfully (${commitHash})`,
    metadata
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// API: get_repo_status
// ═══════════════════════════════════════════════════════════════════════════

/**
 * @hacs-endpoint
 * @tool get_repo_status
 * @version 1.0.0
 * @category git
 * @status stable
 *
 * @description
 * Gets the current git status of the instance's repository clone.
 * Shows modified files, staged changes, and branch info.
 *
 * @param {string} instanceId - Caller's instance ID [required]
 * @param {string} directory - Subdirectory name of the clone [optional]
 *
 * @returns {object} { success, branch, modified, staged, ahead, behind, metadata }
 */
export async function getRepoStatus(params) {
  const metadata = {
    timestamp: new Date().toISOString(),
    function: 'getRepoStatus'
  };

  console.log(`[GIT-OPS] getRepoStatus called:`, JSON.stringify(params, null, 2));

  if (!params.instanceId) {
    return {
      success: false,
      error: { code: 'MISSING_PARAMETER', message: 'instanceId is required' },
      metadata
    };
  }

  // Find the repository (same logic as pushProjectChanges)
  const instanceHome = getInstanceHomeDir(params.instanceId);
  let repoPath;

  if (params.directory) {
    repoPath = path.join(instanceHome, params.directory);
  } else {
    try {
      const entries = await fs.readdir(instanceHome, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory()) {
          const gitPath = path.join(instanceHome, entry.name, '.git');
          try {
            await fs.access(gitPath);
            repoPath = path.join(instanceHome, entry.name);
            break;
          } catch (err) {}
        }
      }
    } catch (err) {}
  }

  if (!repoPath) {
    return {
      success: false,
      error: { code: 'NO_REPO', message: 'No git repository found' },
      metadata
    };
  }

  // Get branch name
  const branchResult = await runCommand(`cd "${repoPath}" && git branch --show-current`);
  const branch = branchResult.stdout || 'unknown';

  // Get status
  const statusResult = await runCommand(`cd "${repoPath}" && git status --porcelain`);
  const lines = statusResult.stdout ? statusResult.stdout.split('\n').filter(l => l) : [];

  const modified = [];
  const staged = [];
  const untracked = [];

  for (const line of lines) {
    const status = line.substring(0, 2);
    const file = line.substring(3);

    if (status.startsWith('?')) {
      untracked.push(file);
    } else if (status[0] !== ' ') {
      staged.push(file);
    }
    if (status[1] !== ' ' && status[1] !== '?') {
      modified.push(file);
    }
  }

  // Get ahead/behind count
  await runCommand(`cd "${repoPath}" && git fetch origin 2>/dev/null`);
  const aheadResult = await runCommand(`cd "${repoPath}" && git rev-list --count HEAD ^origin/${branch} 2>/dev/null`);
  const behindResult = await runCommand(`cd "${repoPath}" && git rev-list --count origin/${branch} ^HEAD 2>/dev/null`);

  return {
    success: true,
    repoPath,
    branch,
    modified,
    staged,
    untracked,
    ahead: parseInt(aheadResult.stdout) || 0,
    behind: parseInt(behindResult.stdout) || 0,
    clean: lines.length === 0,
    metadata
  };
}
