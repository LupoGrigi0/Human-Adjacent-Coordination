/**
 * The mod's fixed numbers and names, in one place so tests read the same
 * values the hooks use.
 */

/** Kept in step with .claude-plugin/plugin.json `version`. */
export const MOD_VERSION = '0.1.0'

/** The hub every HACS client defaults to. */
export const DEFAULT_HUB_URL = 'https://smoothcurves.nexus/mcp'

/** Poll period when preferences say nothing. */
export const DEFAULT_POLL_SECONDS = 60
export const MIN_POLL_SECONDS = 15
export const MAX_POLL_SECONDS = 3600

/**
 * How long one hub call may take before it rejects as a timeout. Under the
 * engine's ten-second hook budget, so a /hacs command answers in its budget.
 */
export const HUB_TIMEOUT_MS = 8000

/** `/hacs` output is at most this many lines. */
export const COMMAND_MAX_LINES = 12

/** One line of `/hacs` output is cut at this many characters. */
export const COMMAND_LINE_CHARS = 160

/** A message body is wrapped at this width before lines are counted. */
export const BODY_WRAP_COLUMNS = 100

/** Guidance on prompt.submit is at most this many lines. */
export const GUIDANCE_MAX_LINES = 6

/** One guidance line is cut at this many characters. */
export const GUIDANCE_LINE_CHARS = 200

/** The hub refuses bodies over 8192; leave headroom as the CLI does. */
export const BODY_MAX_CHARS = 8000

/** do_i_have_new_messages reports at most this many unread ids. */
export const UNREAD_ID_CAP = 5

/** Already-rung message ids kept in $.store, newest last. */
export const RUNG_KEEP = 500

/** Preferences are rewritten when status changes, or at least this often. */
export const PREFS_HEARTBEAT_MS = 5 * 60 * 1000

/** The merge helper gets this long to finish. */
export const PREFS_TIMEOUT_MS = 10_000

/** A secret file larger than this is not read. */
export const SECRET_FILE_MAX_BYTES = 4096

/** A secret shorter than this is not redacted (too likely to match prose). */
export const SECRET_MIN_CHARS = 6

/** What a secret is replaced with wherever it would leave the mod. */
export const REDACTED = '[redacted]'

/** The command's name, typed `/hacs`. */
export const COMMAND_NAME = 'hacs'

/** Where the helper lives inside the plugin directory. */
export const PREFS_HELPER = 'bin/hacs-prefs-merge.py'

/** The first words of every doorbell notice. */
export const DOORBELL_PREFIX = 'HACS doorbell:'
