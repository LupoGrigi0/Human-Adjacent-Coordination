/**
 * V2 Handler Index
 * Exports all V2 API handlers for use by the V2 server
 *
 * @author Foundation
 */

// Core handlers
export { bootstrap } from './bootstrap.js';
export { introspect } from './introspect.js';
export { preApprove } from './preApprove.js';

// Identity handlers
export { takeOnRole } from './takeOnRole.js';
export { adoptPersonality } from './adoptPersonality.js';
export { joinProject } from './joinProject.js';

// Instance management
export { updateInstance } from './updateInstance.js';

// Diary handlers
export { addDiaryEntry, getDiary } from './diary.js';

// Task handlers
export {
  getMyTasks,
  getNextTask,
  addPersonalTask,
  completePersonalTask,
  createPersonalList,
  getPersonalLists
} from './tasks.js';

// Config and utilities
export * as config from './config.js';
export * as data from './data.js';
export * as permissions from './permissions.js';
