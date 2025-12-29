/**
 * UI Configuration for V2 Executive Dashboard
 *
 * Contains message templates, UI preferences, and configurable options.
 * Edit these values to customize the UI behavior.
 *
 * @author Canvas (UI Engineer)
 */

// ============================================================================
// MESSAGE TEMPLATES
// ============================================================================

/**
 * Prefix added to every message sent via continue_conversation
 * Identifies the sender and interface
 */
export const MESSAGE_PREFIX = '[Lupo via Executive Dashboard]: ';

/**
 * Postscript added to every message sent via continue_conversation
 * Gentle reminders or standard sign-offs
 */
export const MESSAGE_POSTSCRIPT = '\n\n***please update your diary when you have a moment, love Lupo***';

/**
 * Whether to apply the prefix automatically
 * Set to false if you prefer to introduce yourself manually each time
 */
export const AUTO_PREFIX = true;

/**
 * Whether to apply the postscript automatically
 */
export const AUTO_POSTSCRIPT = true;

// ============================================================================
// WAKE DEFAULTS
// ============================================================================

/**
 * Default instructions included when waking a new instance
 * These are appended to any custom instructions provided
 */
export const DEFAULT_WAKE_INSTRUCTIONS = `
You are part of the HACS (Human-Adjacent Coordination System) team.
When communicating via the coordination system, always update your diary with key decisions and learnings.
`;

/**
 * Available roles for new instances
 * These populate the role dropdown in the Wake form
 */
export const AVAILABLE_ROLES = [
    { id: 'Developer', label: 'Developer', description: 'Software development and coding' },
    { id: 'PM', label: 'Project Manager', description: 'Project coordination and planning' },
    { id: 'PA', label: 'Personal Assistant', description: 'Administrative support' },
    { id: 'COO', label: 'COO', description: 'Operations oversight' },
    { id: 'Researcher', label: 'Researcher', description: 'Research and analysis' },
    { id: 'Writer', label: 'Writer', description: 'Content creation and documentation' }
];

/**
 * Available personalities for new instances
 * These populate the personality dropdown in the Wake form
 * Note: This list should match available personality files on the server
 */
export const AVAILABLE_PERSONALITIES = [
    { id: 'bridge', label: 'Bridge', description: 'Infrastructure and systems specialist' },
    { id: 'bastion', label: 'Bastion', description: 'Security and stability focused' },
    { id: 'canvas', label: 'Canvas', description: 'UI/UX design specialist' },
    { id: 'messenger', label: 'Messenger', description: 'Communication specialist' },
    { id: 'genevieve', label: 'Genevieve', description: 'Creative and analytical' },
    { id: 'meridian', label: 'Meridian', description: 'Strategic planning' },
    { id: 'none', label: 'No Personality', description: 'Generic Claude instance' }
];

// ============================================================================
// CONVERSATION UI
// ============================================================================

/**
 * Show turn numbers in conversation view
 */
export const SHOW_TURN_NUMBERS = false;

/**
 * Show response timing in conversation view
 */
export const SHOW_RESPONSE_TIME = true;

/**
 * Show cost per message (if available)
 */
export const SHOW_COST = false;

/**
 * Maximum message history to display (0 = unlimited)
 * Note: Server maintains full history; this is just display limit
 */
export const MAX_DISPLAY_MESSAGES = 50;

/**
 * Polling interval for checking if instance is responding (ms)
 * Only used for status updates, not for actual responses
 */
export const CONVERSATION_POLL_INTERVAL = 5000;

// ============================================================================
// INSTANCE STATUS LABELS
// ============================================================================

export const INSTANCE_STATUS = {
    UNKNOWN: { label: 'Unknown', class: 'status-unknown', icon: '❓' },
    PRE_APPROVED: { label: 'Pre-approved', class: 'status-preapproved', icon: '📋' },
    WOKEN: { label: 'Woken', class: 'status-woken', icon: '🟢' },
    SLEEPING: { label: 'Sleeping', class: 'status-sleeping', icon: '😴' },
    ERROR: { label: 'Error', class: 'status-error', icon: '❌' }
};

// ============================================================================
// API CONFIGURATION
// ============================================================================

/**
 * Default timeout for continue_conversation calls (ms)
 * Claude responses can take 2-30+ seconds
 */
export const CONVERSATION_TIMEOUT = 300000; // 5 minutes

/**
 * Output format for continue_conversation
 * Options: 'json', 'text', 'stream-json' (stream not yet implemented)
 */
export const OUTPUT_FORMAT = 'json';
