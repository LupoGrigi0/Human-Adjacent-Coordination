/**
 * Shared Selector Constants for HACS Dashboard UI Tests
 *
 * All selectors extracted from the actual index.html and JS modules in
 * /src/ui/. When the UI changes, update selectors here — test files
 * import from this single source of truth.
 *
 * Convention:
 *   - IDs use '#element-id'
 *   - Classes use '.class-name'
 *   - data-attributes use '[data-attr="value"]'
 *   - Composite selectors use template literals or concatenation
 */

// ============================================================================
// HEADER & NAVIGATION
// ============================================================================

const HEADER = {
  /** Top-level header element */
  ROOT: 'header.header',
  HEADER_CONTENT: '.header-content',

  /** Logo (top-left, clickable — navigates to dashboard) */
  LOGO: '.logo',
  LOGO_IMG: '.logo-img',

  /** Desktop navigation dropdown (center) */
  NAV_DROPDOWN: '#nav-dropdown',
  NAV_DROPDOWN_TOGGLE: '#nav-dropdown-toggle',
  NAV_DROPDOWN_MENU: '#nav-dropdown-menu',
  NAV_DROPDOWN_ITEM: '.nav-dropdown-item',
  /** Select a specific nav item by tab name */
  navItemByTab: (tab) => `.nav-dropdown-item[data-tab="${tab}"]`,
  NAV_DROPDOWN_DIVIDER: '.nav-dropdown-divider',

  /** Unread messages badge inside the Messages nav item */
  UNREAD_COUNT: '#unread-count',

  /** User status area (top-right) */
  USER_STATUS: '#user-status',
  USER_INSTANCE_ID: '#user-instance-id',
  USER_ROLE: '#user-role',

  /** Connection indicator */
  CONNECTION_STATUS: '#connection-status',
  STATUS_DOT: '#status-dot',

  /** Theme toggle button */
  THEME_TOGGLE: '#theme-toggle',
  THEME_ICON: '.theme-icon',
};

// ============================================================================
// TAB CONTENT CONTAINERS
// ============================================================================

const TABS = {
  /** Each tab-content div, keyed by tab name */
  DASHBOARD: '#tab-dashboard',
  MESSAGES: '#tab-messages',
  PROJECTS: '#tab-projects',
  INSTANCES: '#tab-instances',
  SETTINGS: '#tab-settings',
  /** Generic active tab */
  ACTIVE: '.tab-content.active',
};

// ============================================================================
// MOBILE BOTTOM NAVIGATION
// ============================================================================

const BOTTOM_NAV = {
  ROOT: '#bottom-nav',
  ITEM: '.bottom-nav-item',
  /** Select a bottom nav item by tab name */
  itemByTab: (tab) => `.bottom-nav-item[data-tab="${tab}"]`,
  ACTIVE: '.bottom-nav-item.active',
  UNREAD_BADGE: '#bottom-unread-count',
  MORE_MENU_BTN: '#more-menu-btn',
};

// ============================================================================
// DASHBOARD
// ============================================================================

const DASHBOARD = {
  /** Top-level dashboard wrapper */
  ROOT: '.dash',
  HEADER: '.dash-header',
  TITLE: '.dash-header h1',
  ROLE_BADGE: '#dash-role-badge',
  SETTINGS_BTN: '#dash-settings-btn',

  /** Layout containers */
  LAYOUT: '#dash-layout',
  MAIN: '.dash-main',

  /** Activity chart section */
  CHART_SECTION: '#dash-chart',

  /** World info strip */
  WORLD_STRIP: '#dash-world',

  /** Heatmap containers */
  HEATMAPS: '#dash-heatmaps',
  HEATMAP_PROJECTS: '#hm-projects',
  HEATMAP_PROJECTS_GRID: '#hm-projects-grid',
  HEATMAP_TASKS: '#hm-tasks',
  HEATMAP_TASKS_GRID: '#hm-tasks-grid',
  HEATMAP_INSTANCES: '#hm-instances',
  HEATMAP_INSTANCES_GRID: '#hm-instances-grid',
  SECTION_HEADER: '.section-header',

  /** PM status scroll */
  PM_STATUS: '#dash-pm-status',

  /** Task + list columns */
  LISTS_SECTION: '#dash-lists',
  TASKS_COL: '#dash-tasks-col',
  TASKS_COUNT: '#dash-tasks-count',
  NEW_TASK_INPUT: '#dash-new-task',
  TASKS_LIST: '#dash-tasks-list',
  PERSONAL_COL: '#dash-personal-col',
  LISTS_COUNT: '#dash-lists-count',
  PERSONAL_LISTS: '#dash-personal-lists',

  /** EA Chat aside (right panel) */
  PA_CHAT: '#dash-pa-chat',
  PA_CHAT_HEADER: '.pa-chat-header',
  PA_CHAT_MSGS: '#pa-chat-msgs',
  PA_CHAT_INPUT: '#pa-chat-input',
  PA_CHAT_SEND: '#pa-chat-send',
};

// ============================================================================
// DASHBOARD SETTINGS DIALOG
// ============================================================================

const DASHBOARD_SETTINGS = {
  DIALOG: '#dash-settings-dialog',
  CLOSE_BTN: '#dash-settings-close',
  CANCEL_BTN: '#dash-settings-cancel',
  SAVE_BTN: '#dash-settings-save',

  /** Sliders */
  PILL_SIZE: '#ds-pill-size',
  PILL_SIZE_VAL: '#ds-pill-val',
  PILL_GAP: '#ds-pill-gap',
  PILL_GAP_VAL: '#ds-gap-val',
  BORDER_WIDTH: '#ds-border-width',
  BORDER_WIDTH_VAL: '#ds-border-val',
  TASK_DOTS: '#ds-task-dots',
  TASK_DOTS_VAL: '#ds-dots-val',

  /** Toggle checkboxes */
  SHOW_CHART: '#ds-show-chart',
  SHOW_WORLD: '#ds-show-world',
  SHOW_TASKS: '#ds-show-tasks',
  SHOW_INSTANCES: '#ds-show-instances',
  SHOW_PM: '#ds-show-pm',
  HM_SIDE_BY_SIDE: '#ds-hm-sbs',

  /** OpenRouter key */
  OPENROUTER_KEY: '#ds-openrouter-key',
};

// ============================================================================
// MESSAGES TAB
// ============================================================================

const MESSAGES = {
  ROOT: '#tab-messages',
  LAYOUT: '.messaging-layout',

  /** Conversations sidebar */
  CONVERSATIONS_PANEL: '.conversations-panel',
  REFRESH_BTN: '#refresh-messages-btn',
  CONVERSATION_LIST: '#conversation-list',

  /** Chat area */
  CHAT_PANEL: '.chat-panel',
  CHAT_HEADER: '#chat-header',
  RECIPIENT_NAME: '.chat-panel .recipient-name',
  RECIPIENT_STATUS: '.chat-panel .recipient-status',
  CHAT_INFO_BTN: '#chat-info-btn',
  CHAT_MESSAGES: '#chat-messages',
  CHAT_INPUT_AREA: '#chat-input-area',
  MESSAGE_SUBJECT: '#message-subject',
  MESSAGE_INPUT: '#message-input',
  SEND_BTN: '#send-btn',
};

// ============================================================================
// PROJECTS TAB
// ============================================================================

const PROJECTS = {
  ROOT: '#tab-projects',
  TITLE: '#tab-projects .page-header h1',
  NEW_PROJECT_BTN: '#new-project-btn',
  PROJECT_GRID: '#project-grid',
  /** Project detail view (dynamically generated) */
  DETAIL_VIEW: '#project-detail-view',
};

// ============================================================================
// INSTANCES TAB
// ============================================================================

const INSTANCES = {
  ROOT: '#tab-instances',
  LAYOUT: '.instances-layout',
  MAIN: '.instances-main',
  TITLE: '#tab-instances .page-header h1',
  PRE_APPROVE_BTN: '#pre-approve-btn',
  GRID: '#instances-grid',

  /** Instance Detail View */
  DETAIL_VIEW: '#instance-detail-view',
  BACK_BTN: '#instance-back-btn',
  DETAIL_AVATAR: '#instance-detail-avatar',
  DETAIL_NAME: '#instance-detail-name',
  DETAIL_ID: '#instance-detail-id',
  DETAIL_ROLE: '#instance-detail-role',
  DETAIL_PERSONALITY: '#instance-detail-personality',
  DETAIL_PROJECT_SELECT: '#instance-detail-project-select',
  DETAIL_PROJECT_SAVE: '#instance-detail-project-save',
  DETAIL_STATUS: '#instance-detail-status',
  DETAIL_HOME: '#instance-detail-home',
  DETAIL_LAST_ACTIVE: '#instance-detail-last-active',
  DETAIL_INSTRUCTIONS: '#instance-detail-instructions',
  DETAIL_PREFERENCES_SECTION: '#instance-preferences-section',
  DETAIL_PREFERENCES: '#instance-detail-preferences',

  /** Action buttons on instance detail */
  CHAT_BTN: '#instance-chat-btn',
  WAKE_BTN: '#instance-wake-btn',
  MESSAGE_BTN: '#instance-message-btn',
  PROMOTE_BTN: '#instance-promote-btn',

  /** Conversation panel (continue_conversation chat) */
  CHAT_PANEL: '#instance-chat-panel',
  CHAT_BACK_BTN: '#chat-back-btn',
  CHAT_BREADCRUMB_NAME: '#chat-breadcrumb-name',
  CHAT_INSTANCE_AVATAR: '#chat-instance-avatar',
  CHAT_INSTANCE_NAME: '#chat-instance-name',
  CHAT_INSTANCE_STATUS: '#chat-instance-status',
  CHAT_TURN_COUNT: '#chat-turn-count',
  CHAT_DETAILS_BTN: '#chat-details-btn',
  CHAT_MESSAGES: '#instance-chat-messages',
  CHAT_INPUT: '#instance-chat-input',
  CHAT_SEND: '#instance-chat-send',
};

// ============================================================================
// SETTINGS TAB
// ============================================================================

const SETTINGS = {
  ROOT: '#tab-settings',
  TITLE: '#tab-settings h1',

  /** Identity card */
  INSTANCE_ID: '#settings-instance-id',
  NAME: '#settings-name',
  ROLE: '#settings-role',

  /** Environment card */
  ENVIRONMENT_SELECT: '#settings-environment',
  ENDPOINT: '#settings-endpoint',

  /** Appearance card */
  THEME_SELECT: '#settings-theme',

  /** Diary card */
  REFRESH_DIARY_BTN: '#refresh-diary-btn',
  DIARY_CONTENT: '#diary-content',
  DIARY_ENTRY: '#diary-entry',
  DIARY_AUDIENCE: '#diary-audience',
  ADD_DIARY_BTN: '#add-diary-entry-btn',

  /** Administration card */
  CLEAR_SESSION_BTN: '#clear-session-btn',
  VIEW_RECOVERY_KEY_BTN: '#view-recovery-key-btn',
  RECOVERY_KEY: '#settings-recovery-key',
};

// ============================================================================
// MODALS
// ============================================================================

const MODALS = {
  /** Generic modal selectors */
  MODAL: '.modal',
  BACKDROP: '.modal-backdrop',
  CONTENT: '.modal-content',
  CLOSE_BTN: '.modal-close',
  FOOTER: '.modal-footer',

  /** Bootstrap modal */
  BOOTSTRAP: '#bootstrap-modal',
  BOOTSTRAP_NAME: '#bootstrap-name',
  BOOTSTRAP_EXISTING_ID: '#bootstrap-existing-id',
  BOOTSTRAP_SUBMIT: '#bootstrap-submit',

  /** Wake Instance modal */
  WAKE: '#wake-instance-modal',
  WAKE_NAME: '#wake-name',
  WAKE_ROLE: '#wake-role',
  WAKE_PERSONALITY: '#wake-personality',
  WAKE_PROJECT: '#wake-project',
  WAKE_INSTRUCTIONS: '#wake-instructions',
  WAKE_SPECIFIC_ID_CHECKBOX: '#wake-specific-id',
  WAKE_SPECIFIC_ID_GROUP: '#wake-specific-id-group',
  WAKE_INSTANCE_ID: '#wake-instance-id',
  WAKE_SUBMIT: '#wake-instance-submit',

  /** API Key modal */
  API_KEY: '#api-key-modal',
  API_KEY_INPUT: '#api-key-input',
  API_KEY_REMEMBER: '#api-key-remember',
  API_KEY_SUBMIT: '#api-key-submit',

  /** Create Project modal */
  CREATE_PROJECT: '#create-project-modal',
  PROJECT_NAME: '#project-name',
  PROJECT_DESCRIPTION: '#project-description',
  PROJECT_GH_REPO: '#project-gh-repo',
  PM_PERSONALITY: '#pm-personality',
  CREATE_PROJECT_SUBMIT: '#create-project-submit',
  LAUNCH_PROJECT_BTN: '#launch-project-btn',

  /** Create Task modal */
  CREATE_TASK: '#create-task-modal',
  TASK_TITLE: '#task-title',
  TASK_DESCRIPTION: '#task-description',
  TASK_PROJECT: '#task-project',
  TASK_PRIORITY: '#task-priority',
  CREATE_TASK_SUBMIT: '#create-task-submit',

  /** Assign Instance modal */
  ASSIGN_INSTANCE: '#assign-instance-modal',
  INSTANCE_SELECT_LIST: '#instance-select-list',

  /** Entity Details modal (instance, role, personality, project drill-down) */
  ENTITY_DETAILS: '#entity-details-modal',
  ENTITY_DETAILS_TITLE: '#entity-details-title',

  /** Entity Details — Instance sub-view */
  ENTITY_INSTANCE_VIEW: '#instance-details-view',
  ENTITY_INSTANCE_ID: '#entity-instance-id',
  ENTITY_INSTANCE_NAME: '#entity-instance-name',
  ENTITY_INSTANCE_ROLE: '#entity-instance-role',
  ENTITY_INSTANCE_PERSONALITY: '#entity-instance-personality',
  ENTITY_INSTANCE_HOME: '#entity-instance-home',
  ENTITY_INSTANCE_WORKDIR: '#entity-instance-workdir',
  ENTITY_INSTANCE_SESSION: '#entity-instance-session',
  ENTITY_INSTANCE_STATUS: '#entity-instance-status',
  ENTITY_INSTANCE_LASTACTIVE: '#entity-instance-lastactive',
  ENTITY_INSTANCE_INSTRUCTIONS: '#entity-instance-instructions',
  ENTITY_INSTANCE_GESTALT_SECTION: '#entity-instance-gestalt-section',
  ENTITY_INSTANCE_GESTALT: '#entity-instance-gestalt',
  ENTITY_INSTANCE_PREFS: '#entity-instance-prefs',

  /** Entity Details — Role sub-view */
  ENTITY_ROLE_VIEW: '#role-details-view',
  ENTITY_ROLE_ID: '#entity-role-id',
  ENTITY_ROLE_NAME: '#entity-role-name',
  ENTITY_ROLE_DIR: '#entity-role-dir',
  ENTITY_ROLE_DESCRIPTION: '#entity-role-description',
  ENTITY_ROLE_CONTENT: '#entity-role-content',

  /** Entity Details — Personality sub-view */
  ENTITY_PERSONALITY_VIEW: '#personality-details-view',
  ENTITY_PERSONALITY_ID: '#entity-personality-id',
  ENTITY_PERSONALITY_NAME: '#entity-personality-name',
  ENTITY_PERSONALITY_DIR: '#entity-personality-dir',
  ENTITY_PERSONALITY_DESCRIPTION: '#entity-personality-description',
  ENTITY_PERSONALITY_CONTENT: '#entity-personality-content',

  /** Entity Details — Project sub-view */
  ENTITY_PROJECT_VIEW: '#project-details-view-modal',
  ENTITY_PROJECT_ID: '#entity-project-id',
  ENTITY_PROJECT_NAME: '#entity-project-name',
  ENTITY_PROJECT_STATUS: '#entity-project-status',
  ENTITY_PROJECT_DIR: '#entity-project-dir',
  ENTITY_PROJECT_DESCRIPTION: '#entity-project-description',
  ENTITY_PROJECT_SETTINGS: '#entity-project-settings',
};

// ============================================================================
// TOAST NOTIFICATIONS
// ============================================================================

const TOAST = {
  CONTAINER: '#toast-container',
  /** Individual toast — class varies by type */
  ITEM: '.toast',
};

// ============================================================================
// COMMON UI PATTERNS
// ============================================================================

const COMMON = {
  /** Loading placeholder shown before data loads */
  LOADING: '.loading-placeholder',
  /** Empty state displayed when no data */
  EMPTY_STATE: '.empty-state',
  /** Card containers */
  CARD: '.card',
  CARD_TITLE: '.card-title',
  /** Buttons */
  BTN: '.btn',
  BTN_PRIMARY: '.btn.btn-primary',
  BTN_SECONDARY: '.btn.btn-secondary',
  BTN_ICON: '.btn-icon',
  BTN_BACK: '.btn-back',
  /** Badges */
  BADGE: '.badge',
  ROLE_BADGE: '.role-badge',
  /** Form elements */
  FORM_GROUP: '.form-group',
  FORM_HELP: '.form-help',
  REQUIRED: '.required',
};

module.exports = {
  HEADER,
  TABS,
  BOTTOM_NAV,
  DASHBOARD,
  DASHBOARD_SETTINGS,
  MESSAGES,
  PROJECTS,
  INSTANCES,
  SETTINGS,
  MODALS,
  TOAST,
  COMMON,
};
