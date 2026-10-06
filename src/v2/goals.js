/**
 * Goals handler for V2 coordination system
 *
 * Goals are semantically elevated checklists. The data model is identical
 * to lists (name, description, items with checked status) with additions:
 *   - list.type = "goal"
 *   - list.status = "in_progress" | "achieved" | "exceeded"
 *   - items may have: description, stretch flag, dependency link
 *
 * Personal goals: stored in instance's lists.json (type: "goal")
 * Project goals: stored in project's goals.json
 *
 * "Keep the smarts where the smarts belong — in the clients' heads."
 *
 * @module goals
 * @author Ember-75b6
 * @created 2026-03-10
 */

import path from 'path';
import { getInstanceDir, getProjectDir } from './config.js';
import { readJSON, writeJSON, readPreferences, generateSuffix } from './data.js';

// =============================================================================
// DATA ACCESS
// =============================================================================

const GOAL_STATUSES = ['in_progress', 'achieved', 'exceeded', 'archived'];

function getInstanceGoalsFile(instanceId) {
  return path.join(getInstanceDir(instanceId), 'lists.json');
}

function getProjectGoalsFile(projectId) {
  return path.join(getProjectDir(projectId), 'goals.json');
}

/**
 * Read goals from the appropriate file.
 * Personal goals: filter lists.json for type="goal"
 * Project goals: read goals.json
 */
async function readGoals(scope, id) {
  if (scope === 'project') {
    const goalsFile = getProjectGoalsFile(id);
    const data = await readJSON(goalsFile);
    if (!data) {
      const defaultData = {
        schema_version: '1.0',
        project_id: id,
        created: new Date().toISOString(),
        last_updated: new Date().toISOString(),
        goals: []
      };
      await writeJSON(goalsFile, defaultData);
      return defaultData;
    }
    return data;
  }

  // Personal goals: stored in lists.json with type="goal"
  const listsFile = getInstanceGoalsFile(id);
  const data = await readJSON(listsFile);
  if (!data) {
    return { lists: [], last_updated: null };
  }
  return data;
}

/**
 * Get goal array from data (handles both personal and project storage)
 */
function getGoalArray(data, scope) {
  if (scope === 'project') {
    return data.goals || [];
  }
  // Personal: filter lists for type="goal"
  return (data.lists || []).filter(l => l.type === 'goal');
}

/**
 * Find goal index in the appropriate array
 */
function findGoalIndex(data, goalId, scope) {
  if (scope === 'project') {
    return (data.goals || []).findIndex(g => g.id === goalId);
  }
  return (data.lists || []).findIndex(l => l.id === goalId && l.type === 'goal');
}

/**
 * Write goals data back
 */
async function writeGoals(scope, id, data) {
  if (scope === 'project') {
    data.last_updated = new Date().toISOString();
    await writeJSON(getProjectGoalsFile(id), data);
  } else {
    data.last_updated = new Date().toISOString();
    await writeJSON(getInstanceGoalsFile(id), data);
  }
}

// =============================================================================
// PERMISSIONS
// =============================================================================

/**
 * Check goal permissions.
 * Project goals: PM of that project, COO, Executive
 * Personal goals: self, COO, Executive
 */
async function checkGoalPermission(callerPrefs, scope, targetId) {
  const role = callerPrefs.role;
  const callerId = callerPrefs.instanceId || callerPrefs.id;

  // Executive and COO can do anything
  if (['Executive', 'COO'].includes(role)) return { allowed: true };

  if (scope === 'project') {
    // PM of the specific project can manage its goals
    if (role === 'PM' && callerPrefs.project === targetId) return { allowed: true };
    return {
      allowed: false,
      error: `Only the project PM, COO, or Executive can manage project goals`
    };
  }

  // Personal goals: only self (+ COO/Executive already handled above)
  if (callerId === targetId) return { allowed: true };
  return {
    allowed: false,
    error: `Only the individual, COO, or Executive can manage personal goals`
  };
}

// =============================================================================
// API HANDLERS
// =============================================================================

/**
 * @hacs-endpoint
 * @tool create_goal
 * @version 1.0.0
 * @since 2026-03-10
 * @category goals
 * @status stable
 * @description Create a new goal for an instance or project.
 * @param {string} instanceId - Caller's instance ID [required]
 * @param {string} name - Goal name [required]
 * @param {string} context - Why this goal exists, what it enables [optional]
 * @param {string} projectId - Create a project goal instead of personal [optional]
 * @permissions Project goals: PM/COO/Executive. Personal: self/COO/Executive.
 * @example { "instanceId": "Ember-75b6", "name": "Ship Goals Feature", "context": "Enable project tracking with measurable criteria" }
 * @example { "instanceId": "Ember-75b6", "projectId": "hacs-ui", "name": "Dashboard v3", "context": "Executive needs goal visibility at a glance" }
 * @see list_personal_goals, list_project_goals, add_criteria
 * @note Goals are checklists with status tracking and dependency support
 */
export async function createGoal(params) {
  const metadata = { timestamp: new Date().toISOString(), function: 'createGoal' };

  if (!params.instanceId) {
    return { success: false, error: { code: 'MISSING_PARAMETER', message: 'instanceId is required' }, metadata };
  }
  if (!params.name) {
    return { success: false, error: { code: 'MISSING_PARAMETER', message: 'name is required' }, metadata };
  }

  const callerPrefs = await readPreferences(params.instanceId);
  if (!callerPrefs) {
    return { success: false, error: { code: 'INVALID_INSTANCE', message: `Instance ${params.instanceId} not found` }, metadata };
  }

  const scope = params.projectId ? 'project' : 'personal';
  const targetId = params.projectId || params.targetInstanceId || params.instanceId;

  const perm = await checkGoalPermission(callerPrefs, scope, targetId);
  if (!perm.allowed) {
    return { success: false, error: { code: 'UNAUTHORIZED', message: perm.error }, metadata };
  }

  const data = await readGoals(scope, targetId);
  const now = new Date().toISOString();

  const newGoal = {
    id: `goal-${generateSuffix()}${generateSuffix()}`,
    type: 'goal',
    name: params.name,
    context: params.context || null,
    description: params.context || null, // alias for checklist compat
    status: 'in_progress',
    createdAt: now,
    updatedAt: now,
    items: []
  };

  if (scope === 'project') {
    if (!data.goals) data.goals = [];
    data.goals.push(newGoal);
  } else {
    data.lists.push(newGoal);
  }

  await writeGoals(scope, targetId, data);

  return {
    success: true,
    goal: { id: newGoal.id, name: newGoal.name, context: newGoal.context, status: newGoal.status },
    scope,
    targetId,
    message: `Goal '${params.name}' created`,
    metadata
  };
}

/**
 * @hacs-endpoint
 * @tool list_personal_goals
 * @version 1.0.0
 * @since 2026-03-10
 * @category goals
 * @status stable
 * @description List all personal goals for an instance with progress counts.
 * @param {string} instanceId - Caller's instance ID [required]
 * @param {string} targetInstanceId - View another instance's goals (COO/Executive only) [optional]
 * @permissions Self, COO, Executive
 * @example { "instanceId": "Ember-75b6" }
 * @see list_project_goals, get_goal, create_goal
 * @note Returns goal summaries with criteria counts, not full criteria lists
 */
export async function listPersonalGoals(params) {
  const metadata = { timestamp: new Date().toISOString(), function: 'listPersonalGoals' };

  if (!params.instanceId) {
    return { success: false, error: { code: 'MISSING_PARAMETER', message: 'instanceId is required' }, metadata };
  }

  const targetId = params.targetInstanceId || params.instanceId;

  // Permission check for viewing others' goals
  if (targetId !== params.instanceId) {
    const callerPrefs = await readPreferences(params.instanceId);
    if (!callerPrefs || !['Executive', 'COO'].includes(callerPrefs.role)) {
      return { success: false, error: { code: 'UNAUTHORIZED', message: 'Only COO/Executive can view other instances\' goals' }, metadata };
    }
  }

  const data = await readGoals('personal', targetId);
  let goals = getGoalArray(data, 'personal');

  // Filter out archived by default
  if (!params.includeArchived) {
    goals = goals.filter(g => (g.status || 'in_progress') !== 'archived');
  }

  const summaries = goals.map(g => ({
    id: g.id,
    name: g.name,
    context: g.context || g.description,
    status: g.status || 'in_progress',
    criteriaCount: g.items.length,
    validatedCount: g.items.filter(i => i.checked).length,
    stretchCount: g.items.filter(i => i.stretch).length,
    createdAt: g.createdAt,
    updatedAt: g.updatedAt
  }));

  return { success: true, goals: summaries, targetInstance: targetId, metadata };
}

/**
 * @hacs-endpoint
 * @tool list_project_goals
 * @version 1.0.0
 * @since 2026-03-10
 * @category goals
 * @status stable
 * @description List all goals for a project with progress counts.
 * @param {string} instanceId - Caller's instance ID [required]
 * @param {string} projectId - Project ID [required]
 * @permissions Any authenticated instance
 * @example { "instanceId": "Ember-75b6", "projectId": "hacs-ui" }
 * @see list_personal_goals, get_goal, create_goal
 * @note Returns goal summaries with criteria counts, not full criteria lists
 */
export async function listProjectGoals(params) {
  const metadata = { timestamp: new Date().toISOString(), function: 'listProjectGoals' };

  if (!params.instanceId || !params.projectId) {
    return { success: false, error: { code: 'MISSING_PARAMETER', message: 'instanceId and projectId are required' }, metadata };
  }

  const data = await readGoals('project', params.projectId);
  let goals = getGoalArray(data, 'project');

  if (!params.includeArchived) {
    goals = goals.filter(g => (g.status || 'in_progress') !== 'archived');
  }

  const summaries = goals.map(g => ({
    id: g.id,
    name: g.name,
    context: g.context || g.description,
    status: g.status || 'in_progress',
    criteriaCount: g.items.length,
    validatedCount: g.items.filter(i => i.checked).length,
    stretchCount: g.items.filter(i => i.stretch).length,
    createdAt: g.createdAt,
    updatedAt: g.updatedAt
  }));

  return { success: true, goals: summaries, projectId: params.projectId, metadata };
}

/**
 * @hacs-endpoint
 * @tool get_goal
 * @version 1.0.0
 * @since 2026-03-10
 * @category goals
 * @status stable
 * @description Get a single goal with all criteria details.
 * @param {string} instanceId - Caller's instance ID [required]
 * @param {string} goalId - Goal ID [required]
 * @param {string} projectId - If this is a project goal [optional]
 * @permissions Any authenticated instance
 * @example { "instanceId": "Ember-75b6", "goalId": "goal-ab12cd34" }
 * @see list_personal_goals, add_criteria, validate_criteria
 */
export async function getGoal(params) {
  const metadata = { timestamp: new Date().toISOString(), function: 'getGoal' };

  if (!params.instanceId || !params.goalId) {
    return { success: false, error: { code: 'MISSING_PARAMETER', message: 'instanceId and goalId are required' }, metadata };
  }

  const scope = params.projectId ? 'project' : 'personal';
  const targetId = params.projectId || params.targetInstanceId || params.instanceId;
  const data = await readGoals(scope, targetId);
  const idx = findGoalIndex(data, params.goalId, scope);

  if (idx === -1) {
    return { success: false, error: { code: 'GOAL_NOT_FOUND', message: `Goal ${params.goalId} not found` }, metadata };
  }

  const goal = scope === 'project' ? data.goals[idx] : data.lists[idx];

  return {
    success: true,
    goal: {
      id: goal.id,
      name: goal.name,
      context: goal.context || goal.description,
      status: goal.status || 'in_progress',
      criteria: goal.items.map(i => ({
        id: i.id,
        text: i.text,
        description: i.description || null,
        validated: i.checked,
        stretch: i.stretch || false,
        dependency: i.dependency || null,
        createdAt: i.createdAt
      })),
      createdAt: goal.createdAt,
      updatedAt: goal.updatedAt
    },
    metadata
  };
}

/**
 * @hacs-endpoint
 * @tool add_criteria
 * @version 1.0.0
 * @since 2026-03-10
 * @category goals
 * @status stable
 * @description Add a criteria item to a goal.
 * @param {string} instanceId - Caller's instance ID [required]
 * @param {string} goalId - Goal ID [required]
 * @param {string} text - Criteria text [required]
 * @param {string} description - Detailed description [optional]
 * @param {boolean} stretch - Mark as stretch criteria [optional, default: false]
 * @param {string} projectId - If this is a project goal [optional]
 * @permissions Project goals: PM/COO/Executive. Personal: self/COO/Executive.
 * @example { "instanceId": "Ember-75b6", "goalId": "goal-ab12cd34", "text": "All regression tests pass", "description": "177+ Playwright tests green" }
 * @see validate_criteria, add_dependency, get_goal
 */
export async function addCriteria(params) {
  const metadata = { timestamp: new Date().toISOString(), function: 'addCriteria' };

  if (!params.instanceId || !params.goalId || !params.text) {
    return { success: false, error: { code: 'MISSING_PARAMETER', message: 'instanceId, goalId, and text are required' }, metadata };
  }

  const callerPrefs = await readPreferences(params.instanceId);
  if (!callerPrefs) {
    return { success: false, error: { code: 'INVALID_INSTANCE', message: `Instance ${params.instanceId} not found` }, metadata };
  }

  const scope = params.projectId ? 'project' : 'personal';
  const targetId = params.projectId || params.targetInstanceId || params.instanceId;

  const perm = await checkGoalPermission(callerPrefs, scope, targetId);
  if (!perm.allowed) {
    return { success: false, error: { code: 'UNAUTHORIZED', message: perm.error }, metadata };
  }

  const data = await readGoals(scope, targetId);
  const idx = findGoalIndex(data, params.goalId, scope);

  if (idx === -1) {
    return { success: false, error: { code: 'GOAL_NOT_FOUND', message: `Goal ${params.goalId} not found` }, metadata };
  }

  const now = new Date().toISOString();
  const goal = scope === 'project' ? data.goals[idx] : data.lists[idx];

  const newItem = {
    id: `crit-${generateSuffix()}${generateSuffix()}`,
    text: params.text,
    description: params.description || null,
    checked: false,
    stretch: params.stretch || false,
    createdAt: now
  };

  goal.items.push(newItem);
  goal.updatedAt = now;

  await writeGoals(scope, targetId, data);

  return {
    success: true,
    criteria: { id: newItem.id, text: newItem.text, description: newItem.description, stretch: newItem.stretch },
    goalId: params.goalId,
    message: `Criteria added to goal '${goal.name}'`,
    metadata
  };
}

/**
 * @hacs-endpoint
 * @tool update_criteria
 * @version 1.0.0
 * @since 2026-03-10
 * @category goals
 * @status stable
 * @description Update a criteria's text, description, or stretch flag.
 * @param {string} instanceId - Caller's instance ID [required]
 * @param {string} goalId - Goal ID [required]
 * @param {string} criteriaId - Criteria ID [required]
 * @param {string} text - New text [optional]
 * @param {string} description - New description [optional]
 * @param {boolean} stretch - Update stretch flag [optional]
 * @param {string} projectId - If this is a project goal [optional]
 * @permissions Project goals: PM/COO/Executive. Personal: self/COO/Executive.
 */
export async function updateCriteria(params) {
  const metadata = { timestamp: new Date().toISOString(), function: 'updateCriteria' };

  if (!params.instanceId || !params.goalId || !params.criteriaId) {
    return { success: false, error: { code: 'MISSING_PARAMETER', message: 'instanceId, goalId, and criteriaId are required' }, metadata };
  }

  const callerPrefs = await readPreferences(params.instanceId);
  if (!callerPrefs) {
    return { success: false, error: { code: 'INVALID_INSTANCE', message: `Instance ${params.instanceId} not found` }, metadata };
  }

  const scope = params.projectId ? 'project' : 'personal';
  const targetId = params.projectId || params.targetInstanceId || params.instanceId;

  const perm = await checkGoalPermission(callerPrefs, scope, targetId);
  if (!perm.allowed) {
    return { success: false, error: { code: 'UNAUTHORIZED', message: perm.error }, metadata };
  }

  const data = await readGoals(scope, targetId);
  const goalIdx = findGoalIndex(data, params.goalId, scope);
  if (goalIdx === -1) {
    return { success: false, error: { code: 'GOAL_NOT_FOUND', message: `Goal ${params.goalId} not found` }, metadata };
  }

  const goal = scope === 'project' ? data.goals[goalIdx] : data.lists[goalIdx];
  const itemIdx = goal.items.findIndex(i => i.id === params.criteriaId);
  if (itemIdx === -1) {
    return { success: false, error: { code: 'CRITERIA_NOT_FOUND', message: `Criteria ${params.criteriaId} not found` }, metadata };
  }

  const item = goal.items[itemIdx];
  if (params.text !== undefined) item.text = params.text;
  if (params.description !== undefined) item.description = params.description;
  if (params.stretch !== undefined) item.stretch = params.stretch;
  goal.updatedAt = new Date().toISOString();

  await writeGoals(scope, targetId, data);

  return { success: true, criteria: { id: item.id, text: item.text, description: item.description, stretch: item.stretch }, metadata };
}

/**
 * @hacs-endpoint
 * @tool validate_criteria
 * @version 1.0.0
 * @since 2026-03-10
 * @category goals
 * @status stable
 * @description Toggle a criteria's validated status (checked/unchecked).
 * @param {string} instanceId - Caller's instance ID [required]
 * @param {string} goalId - Goal ID [required]
 * @param {string} criteriaId - Criteria ID [required]
 * @param {string} projectId - If this is a project goal [optional]
 * @permissions Project goals: PM/COO/Executive. Personal: self/COO/Executive.
 * @example { "instanceId": "Ember-75b6", "goalId": "goal-ab12cd34", "criteriaId": "crit-ef56gh78" }
 * @see add_criteria, set_goal_status, validate_dependency
 */
export async function validateCriteria(params) {
  const metadata = { timestamp: new Date().toISOString(), function: 'validateCriteria' };

  if (!params.instanceId || !params.goalId || !params.criteriaId) {
    return { success: false, error: { code: 'MISSING_PARAMETER', message: 'instanceId, goalId, and criteriaId are required' }, metadata };
  }

  const callerPrefs = await readPreferences(params.instanceId);
  if (!callerPrefs) {
    return { success: false, error: { code: 'INVALID_INSTANCE', message: `Instance ${params.instanceId} not found` }, metadata };
  }

  const scope = params.projectId ? 'project' : 'personal';
  const targetId = params.projectId || params.targetInstanceId || params.instanceId;

  const perm = await checkGoalPermission(callerPrefs, scope, targetId);
  if (!perm.allowed) {
    return { success: false, error: { code: 'UNAUTHORIZED', message: perm.error }, metadata };
  }

  const data = await readGoals(scope, targetId);
  const goalIdx = findGoalIndex(data, params.goalId, scope);
  if (goalIdx === -1) {
    return { success: false, error: { code: 'GOAL_NOT_FOUND', message: `Goal ${params.goalId} not found` }, metadata };
  }

  const goal = scope === 'project' ? data.goals[goalIdx] : data.lists[goalIdx];
  const itemIdx = goal.items.findIndex(i => i.id === params.criteriaId);
  if (itemIdx === -1) {
    return { success: false, error: { code: 'CRITERIA_NOT_FOUND', message: `Criteria ${params.criteriaId} not found` }, metadata };
  }

  // Toggle
  goal.items[itemIdx].checked = !goal.items[itemIdx].checked;
  goal.updatedAt = new Date().toISOString();

  await writeGoals(scope, targetId, data);

  return {
    success: true,
    criteria: { id: params.criteriaId, validated: goal.items[itemIdx].checked },
    goalId: params.goalId,
    metadata
  };
}

/**
 * @hacs-endpoint
 * @tool set_goal_status
 * @version 1.0.0
 * @since 2026-03-10
 * @category goals
 * @status stable
 * @description Set a goal's status: in_progress, achieved, or exceeded.
 * @param {string} instanceId - Caller's instance ID [required]
 * @param {string} goalId - Goal ID [required]
 * @param {string} status - New status: in_progress, achieved, exceeded [required]
 * @param {string} projectId - If this is a project goal [optional]
 * @permissions Project goals: PM/COO/Executive. Personal: self/COO/Executive.
 * @example { "instanceId": "Ember-75b6", "goalId": "goal-ab12cd34", "status": "achieved", "projectId": "hacs-ui" }
 * @see get_goal, validate_criteria
 * @note Only PM/COO/Executive can set project goal status. Exceeded is a manual flag.
 */
export async function setGoalStatus(params) {
  const metadata = { timestamp: new Date().toISOString(), function: 'setGoalStatus' };

  if (!params.instanceId || !params.goalId || !params.status) {
    return { success: false, error: { code: 'MISSING_PARAMETER', message: 'instanceId, goalId, and status are required' }, metadata };
  }

  if (!GOAL_STATUSES.includes(params.status)) {
    return { success: false, error: { code: 'INVALID_STATUS', message: `Status must be one of: ${GOAL_STATUSES.join(', ')}` }, metadata };
  }

  const callerPrefs = await readPreferences(params.instanceId);
  if (!callerPrefs) {
    return { success: false, error: { code: 'INVALID_INSTANCE', message: `Instance ${params.instanceId} not found` }, metadata };
  }

  const scope = params.projectId ? 'project' : 'personal';
  const targetId = params.projectId || params.targetInstanceId || params.instanceId;

  const perm = await checkGoalPermission(callerPrefs, scope, targetId);
  if (!perm.allowed) {
    return { success: false, error: { code: 'UNAUTHORIZED', message: perm.error }, metadata };
  }

  const data = await readGoals(scope, targetId);
  const goalIdx = findGoalIndex(data, params.goalId, scope);
  if (goalIdx === -1) {
    return { success: false, error: { code: 'GOAL_NOT_FOUND', message: `Goal ${params.goalId} not found` }, metadata };
  }

  const goal = scope === 'project' ? data.goals[goalIdx] : data.lists[goalIdx];
  goal.status = params.status;
  goal.updatedAt = new Date().toISOString();

  await writeGoals(scope, targetId, data);

  return {
    success: true,
    goal: { id: params.goalId, name: goal.name, status: goal.status },
    message: `Goal '${goal.name}' marked ${params.status}`,
    metadata
  };
}

/**
 * @hacs-endpoint
 * @tool delete_goal
 * @version 1.0.0
 * @since 2026-03-10
 * @category goals
 * @status stable
 * @description Delete a goal and all its criteria.
 * @param {string} instanceId - Caller's instance ID [required]
 * @param {string} goalId - Goal ID [required]
 * @param {string} projectId - If this is a project goal [optional]
 * @permissions Project goals: PM/COO/Executive. Personal: self/COO/Executive.
 */
export async function deleteGoal(params) {
  const metadata = { timestamp: new Date().toISOString(), function: 'deleteGoal' };

  if (!params.instanceId || !params.goalId) {
    return { success: false, error: { code: 'MISSING_PARAMETER', message: 'instanceId and goalId are required' }, metadata };
  }

  const callerPrefs = await readPreferences(params.instanceId);
  if (!callerPrefs) {
    return { success: false, error: { code: 'INVALID_INSTANCE', message: `Instance ${params.instanceId} not found` }, metadata };
  }

  const scope = params.projectId ? 'project' : 'personal';
  const targetId = params.projectId || params.targetInstanceId || params.instanceId;

  const perm = await checkGoalPermission(callerPrefs, scope, targetId);
  if (!perm.allowed) {
    return { success: false, error: { code: 'UNAUTHORIZED', message: perm.error }, metadata };
  }

  const data = await readGoals(scope, targetId);
  const goalIdx = findGoalIndex(data, params.goalId, scope);
  if (goalIdx === -1) {
    return { success: false, error: { code: 'GOAL_NOT_FOUND', message: `Goal ${params.goalId} not found` }, metadata };
  }

  const arr = scope === 'project' ? data.goals : data.lists;
  const removed = arr.splice(goalIdx, 1)[0];

  await writeGoals(scope, targetId, data);

  return { success: true, deleted: { id: removed.id, name: removed.name }, metadata };
}

// =============================================================================
// DEPENDENCIES (Phase 2)
// =============================================================================

/**
 * @hacs-endpoint
 * @tool add_dependency
 * @version 1.0.0
 * @since 2026-03-10
 * @category goals
 * @status stable
 * @description Add a dependency to a goal criteria. Links to a task, goal, or project.
 * When validate_dependency is called, it checks the linked entity's status.
 * @param {string} instanceId - Caller's instance ID [required]
 * @param {string} goalId - Goal ID [required]
 * @param {string} criteriaId - Criteria ID to add dependency to [required]
 * @param {string} dependsOnTask - Task ID this depends on [optional, one of task/goal/project required]
 * @param {string} dependsOnGoal - Goal ID this depends on [optional]
 * @param {string} dependsOnProject - Project ID this depends on [optional]
 * @param {string} projectId - If this is a project goal [optional]
 * @permissions Project goals: PM/COO/Executive. Personal: self/COO/Executive.
 * @example { "instanceId": "Ember-75b6", "goalId": "goal-ab12", "criteriaId": "crit-cd34", "dependsOnTask": "prjtask-hacs-ui::default::mm5kprm61817" }
 * @see validate_dependency, validate_dependencies
 * @note Dependencies are 1:1 — one criteria links to one entity. Does not recurse.
 */
export async function addDependency(params) {
  const metadata = { timestamp: new Date().toISOString(), function: 'addDependency' };

  if (!params.instanceId || !params.goalId || !params.criteriaId) {
    return { success: false, error: { code: 'MISSING_PARAMETER', message: 'instanceId, goalId, and criteriaId are required' }, metadata };
  }

  const depType = params.dependsOnTask ? 'task' : params.dependsOnGoal ? 'goal' : params.dependsOnProject ? 'project' : null;
  const depId = params.dependsOnTask || params.dependsOnGoal || params.dependsOnProject;

  if (!depType || !depId) {
    return { success: false, error: { code: 'MISSING_PARAMETER', message: 'One of dependsOnTask, dependsOnGoal, or dependsOnProject is required' }, metadata };
  }

  const callerPrefs = await readPreferences(params.instanceId);
  if (!callerPrefs) {
    return { success: false, error: { code: 'INVALID_INSTANCE', message: `Instance ${params.instanceId} not found` }, metadata };
  }

  const scope = params.projectId ? 'project' : 'personal';
  const targetId = params.projectId || params.targetInstanceId || params.instanceId;

  const perm = await checkGoalPermission(callerPrefs, scope, targetId);
  if (!perm.allowed) {
    return { success: false, error: { code: 'UNAUTHORIZED', message: perm.error }, metadata };
  }

  const data = await readGoals(scope, targetId);
  const goalIdx = findGoalIndex(data, params.goalId, scope);
  if (goalIdx === -1) {
    return { success: false, error: { code: 'GOAL_NOT_FOUND', message: `Goal ${params.goalId} not found` }, metadata };
  }

  const goal = scope === 'project' ? data.goals[goalIdx] : data.lists[goalIdx];
  const itemIdx = goal.items.findIndex(i => i.id === params.criteriaId);
  if (itemIdx === -1) {
    return { success: false, error: { code: 'CRITERIA_NOT_FOUND', message: `Criteria ${params.criteriaId} not found` }, metadata };
  }

  goal.items[itemIdx].dependency = { type: depType, id: depId };
  goal.updatedAt = new Date().toISOString();

  await writeGoals(scope, targetId, data);

  return {
    success: true,
    dependency: { criteriaId: params.criteriaId, type: depType, id: depId },
    message: `Dependency added: criteria depends on ${depType} ${depId}`,
    metadata
  };
}

/**
 * @hacs-endpoint
 * @tool validate_dependency
 * @version 1.0.0
 * @since 2026-03-10
 * @category goals
 * @status stable
 * @description Check if a dependency criteria is satisfied by looking at the linked entity's status.
 * Does NOT recurse into the dependency's own dependencies. Simple 1:1 status check.
 * Auto-validates the criteria if the dependency is met.
 * @param {string} instanceId - Caller's instance ID [required]
 * @param {string} goalId - Goal ID [required]
 * @param {string} criteriaId - Criteria ID with dependency [required]
 * @param {string} projectId - If this is a project goal [optional]
 * @permissions Any authenticated instance
 * @example { "instanceId": "Ember-75b6", "goalId": "goal-ab12", "criteriaId": "crit-cd34" }
 * @see add_dependency, validate_dependencies
 * @note Does not recurse. Checks linked entity status only. HACS is a filing cabinet, not a brain.
 */
export async function validateDependency(params) {
  const metadata = { timestamp: new Date().toISOString(), function: 'validateDependency' };

  if (!params.instanceId || !params.goalId || !params.criteriaId) {
    return { success: false, error: { code: 'MISSING_PARAMETER', message: 'instanceId, goalId, and criteriaId are required' }, metadata };
  }

  const scope = params.projectId ? 'project' : 'personal';
  const targetId = params.projectId || params.targetInstanceId || params.instanceId;
  const data = await readGoals(scope, targetId);
  const goalIdx = findGoalIndex(data, params.goalId, scope);

  if (goalIdx === -1) {
    return { success: false, error: { code: 'GOAL_NOT_FOUND', message: `Goal ${params.goalId} not found` }, metadata };
  }

  const goal = scope === 'project' ? data.goals[goalIdx] : data.lists[goalIdx];
  const item = goal.items.find(i => i.id === params.criteriaId);

  if (!item) {
    return { success: false, error: { code: 'CRITERIA_NOT_FOUND', message: `Criteria ${params.criteriaId} not found` }, metadata };
  }

  if (!item.dependency) {
    return { success: false, error: { code: 'NO_DEPENDENCY', message: 'This criteria has no dependency link' }, metadata };
  }

  // Check the linked entity's status
  const dep = item.dependency;
  let depStatus = 'unknown';
  let satisfied = false;

  if (dep.type === 'task') {
    // Read the task's status from the task system
    const taskData = await resolveTaskStatus(dep.id);
    depStatus = taskData.status;
    satisfied = ['completed', 'completed_verified'].includes(depStatus);
  } else if (dep.type === 'goal') {
    // Look up the goal's status — could be in any project or instance
    // For now, check project goals in the same scope
    const goalData = findGoalById(data, dep.id, scope);
    depStatus = goalData ? (goalData.status || 'in_progress') : 'not_found';
    satisfied = ['achieved', 'exceeded'].includes(depStatus);
  } else if (dep.type === 'project') {
    // Check project status
    const projPrefs = await readJSON(path.join(getProjectDir(dep.id), 'preferences.json'));
    depStatus = projPrefs?.status || 'unknown';
    satisfied = ['finished', 'completed'].includes(depStatus);
  }

  // Auto-validate if satisfied
  if (satisfied && !item.checked) {
    item.checked = true;
    goal.updatedAt = new Date().toISOString();
    await writeGoals(scope, targetId, data);
  }

  return {
    success: true,
    dependency: { type: dep.type, id: dep.id, status: depStatus },
    satisfied,
    autoValidated: satisfied && !item.checked,
    criteriaId: params.criteriaId,
    metadata
  };
}

/**
 * @hacs-endpoint
 * @tool validate_dependencies
 * @version 1.0.0
 * @since 2026-03-10
 * @category goals
 * @status stable
 * @description Validate all dependencies in a goal (or all goals in a project/instance).
 * Loops through criteria with dependencies and checks each one.
 * @param {string} instanceId - Caller's instance ID [required]
 * @param {string} goalId - Validate deps in this specific goal [optional]
 * @param {string} projectId - Validate all project goals' deps [optional]
 * @permissions Any authenticated instance
 * @example { "instanceId": "Ember-75b6", "goalId": "goal-ab12" }
 * @example { "instanceId": "Ember-75b6", "projectId": "hacs-ui" }
 * @see validate_dependency, add_dependency
 * @note Runs validate_dependency for each criteria with a dependency. Non-recursive.
 */
export async function validateDependencies(params) {
  const metadata = { timestamp: new Date().toISOString(), function: 'validateDependencies' };

  if (!params.instanceId) {
    return { success: false, error: { code: 'MISSING_PARAMETER', message: 'instanceId is required' }, metadata };
  }

  const scope = params.projectId ? 'project' : 'personal';
  const targetId = params.projectId || params.targetInstanceId || params.instanceId;
  const data = await readGoals(scope, targetId);
  const goals = getGoalArray(data, scope);

  // Filter to specific goal if provided
  const targetGoals = params.goalId ? goals.filter(g => g.id === params.goalId) : goals;

  const results = [];
  let totalDeps = 0;
  let satisfiedCount = 0;
  let blockedCount = 0;

  for (const goal of targetGoals) {
    const depItems = goal.items.filter(i => i.dependency);
    for (const item of depItems) {
      totalDeps++;
      // Inline validation (same logic as validateDependency but batched)
      const dep = item.dependency;
      let depStatus = 'unknown';
      let satisfied = false;

      if (dep.type === 'task') {
        const taskData = await resolveTaskStatus(dep.id);
        depStatus = taskData.status;
        satisfied = ['completed', 'completed_verified'].includes(depStatus);
      } else if (dep.type === 'goal') {
        const goalData = findGoalById(data, dep.id, scope);
        depStatus = goalData ? (goalData.status || 'in_progress') : 'not_found';
        satisfied = ['achieved', 'exceeded'].includes(depStatus);
      } else if (dep.type === 'project') {
        const projPrefs = await readJSON(path.join(getProjectDir(dep.id), 'preferences.json'));
        depStatus = projPrefs?.status || 'unknown';
        satisfied = ['finished', 'completed'].includes(depStatus);
      }

      if (satisfied) {
        satisfiedCount++;
        if (!item.checked) {
          item.checked = true;
          goal.updatedAt = new Date().toISOString();
        }
      } else {
        blockedCount++;
      }

      results.push({
        goalId: goal.id,
        goalName: goal.name,
        criteriaId: item.id,
        criteriaText: item.text,
        dependsOn: { type: dep.type, id: dep.id },
        status: depStatus,
        satisfied
      });
    }
  }

  // Write back if any auto-validations happened
  if (satisfiedCount > 0) {
    await writeGoals(scope, targetId, data);
  }

  return {
    success: true,
    totalDependencies: totalDeps,
    satisfied: satisfiedCount,
    blocked: blockedCount,
    details: results,
    metadata
  };
}

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Resolve a task's status from the task system.
 * Tasks can be personal or project — try to find by ID pattern.
 */
async function resolveTaskStatus(taskId) {
  // Project tasks: stored in project's project_tasks.json
  // Pattern: prjtask-{projectId}::... or prjtask-{projectId}-...
  const match = taskId.match(/^prjtask-([^:]+?)(?:::|-)default/);
  if (match) {
    const projectId = match[1];
    const tasksFile = path.join(getProjectDir(projectId), 'project_tasks.json');
    const tasksData = await readJSON(tasksFile);
    if (tasksData?.taskLists) {
      for (const list of tasksData.taskLists) {
        const task = (list.tasks || []).find(t => t.id === taskId);
        if (task) return { status: task.status || 'not_started', title: task.title };
      }
    }
  }
  // Personal tasks: would need to search instance lists — for now return unknown
  return { status: 'unknown' };
}

/**
 * Find a goal by ID within the current data scope
 */
function findGoalById(data, goalId, scope) {
  const goals = getGoalArray(data, scope);
  return goals.find(g => g.id === goalId) || null;
}

// =============================================================================
// EXPORTS
// =============================================================================

export const handlers = {
  create_goal: createGoal,
  list_personal_goals: listPersonalGoals,
  list_project_goals: listProjectGoals,
  get_goal: getGoal,
  add_criteria: addCriteria,
  update_criteria: updateCriteria,
  validate_criteria: validateCriteria,
  set_goal_status: setGoalStatus,
  delete_goal: deleteGoal,
  add_dependency: addDependency,
  validate_dependency: validateDependency,
  validate_dependencies: validateDependencies
};

export default handlers;
