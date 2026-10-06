/**
 * Test Data Constants for HACS Dashboard UI Tests
 *
 * Shared constants used across all test files: instance IDs, project IDs,
 * expected values, and configuration for the test environment.
 */

// ============================================================================
// Environment
// ============================================================================

/** Dashboard base URL (served on port 8443 with self-signed cert) */
const BASE_URL = 'https://smoothcurves.nexus:8443';

/** HACS API endpoint (JSON-RPC 2.0 over HTTPS) */
const API_URL = 'https://smoothcurves.nexus/mcp';

// ============================================================================
// Identity — the dashboard always runs as Lupo (Executive)
// ============================================================================

/** The fixed instance ID the dashboard uses */
const LUPO_INSTANCE_ID = 'Lupo-f63b';

/** Display name shown in the header */
const LUPO_NAME = 'Lupo';

/** Role displayed in the header and dashboard badge */
const LUPO_ROLE = 'Executive';

// ============================================================================
// Navigation Tabs
// ============================================================================

/** Tab identifiers used in data-tab attributes and #tab-{id} element IDs */
const TABS = {
  DASHBOARD: 'dashboard',
  MESSAGES: 'messages',
  PROJECTS: 'projects',
  INSTANCES: 'instances',
  SETTINGS: 'settings',
};

/** Expected menu items in order (desktop nav-dropdown) */
const NAV_MENU_ITEMS = [
  TABS.DASHBOARD,
  TABS.MESSAGES,
  TABS.PROJECTS,
  TABS.INSTANCES,
  TABS.SETTINGS,
];

// ============================================================================
// Dashboard Settings Dialog — default slider values
// ============================================================================

const DASHBOARD_SETTINGS_DEFAULTS = {
  pillSize: 34,
  pillGap: 3,
  borderWidth: 2,
  maxTaskDots: 5,
  showChart: true,
  showWorld: false,
  showTasks: true,
  showInstances: true,
  showPmStatus: true,
  heatmapsSideBySide: true,
};

// ============================================================================
// Instance Roles — color class expectations
// ============================================================================

const ROLE_BADGE_CLASSES = {
  Executive: 'badge-exec',
  Developer: 'badge-dev',
  PM: 'badge-pm',
  COO: 'badge-coo',
  EA: 'badge-ea',
  DevOps: 'badge-devops',
  Researcher: 'badge-researcher',
  Writer: 'badge-writer',
};

// ============================================================================
// Wake Instance — available roles and personalities from ui-config.js
// ============================================================================

const AVAILABLE_ROLES = [
  { id: 'Developer', label: 'Developer' },
  { id: 'PM', label: 'Project Manager' },
  { id: 'EA', label: 'Executive Assistant' },
  { id: 'COO', label: 'COO' },
  { id: 'Researcher', label: 'Researcher' },
  { id: 'Writer', label: 'Writer' },
];

const AVAILABLE_PERSONALITIES = [
  { id: 'bridge', label: 'Bridge' },
  { id: 'bastion', label: 'Bastion' },
  { id: 'canvas', label: 'Canvas' },
  { id: 'messenger', label: 'Messenger' },
  { id: 'genevieve', label: 'Genevieve' },
  { id: 'meridian', label: 'Meridian' },
  { id: 'none', label: 'No Personality' },
];

// ============================================================================
// Settings — theme and environment options
// ============================================================================

const THEMES = ['light', 'dark', 'auto'];

const ENVIRONMENTS = {
  production: 'https://smoothcurves.nexus/mcp',
  local: 'http://localhost:3446/mcp',
};

// ============================================================================
// Diary audience options
// ============================================================================

const DIARY_AUDIENCES = [
  { value: 'self', label: 'Self (visible to me/successors)' },
  { value: 'public', label: 'Public (anyone can read)' },
  { value: 'private', label: 'Private (never returned)' },
];

// ============================================================================
// Task priorities
// ============================================================================

const TASK_PRIORITIES = ['low', 'medium', 'high', 'critical'];

// ============================================================================
// Timeouts (ms) for various operations
// ============================================================================

const TIMEOUTS = {
  /** Page initial load + API bootstrap */
  PAGE_LOAD: 15_000,
  /** API call round-trip */
  API_CALL: 10_000,
  /** Dashboard heatmap/chart render */
  RENDER: 5_000,
  /** continue_conversation (Claude response) — can be very slow */
  CONVERSATION: 300_000,
  /** Toast notification visibility */
  TOAST: 5_000,
};

module.exports = {
  BASE_URL,
  API_URL,
  LUPO_INSTANCE_ID,
  LUPO_NAME,
  LUPO_ROLE,
  TABS,
  NAV_MENU_ITEMS,
  DASHBOARD_SETTINGS_DEFAULTS,
  ROLE_BADGE_CLASSES,
  AVAILABLE_ROLES,
  AVAILABLE_PERSONALITIES,
  THEMES,
  ENVIRONMENTS,
  DIARY_AUDIENCES,
  TASK_PRIORITIES,
  TIMEOUTS,
};
