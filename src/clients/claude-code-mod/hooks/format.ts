import type { HacsLetter, HacsList, HacsMessage } from '../types'
import type { Config } from './config.js'
import { identityNote } from './config.js'
import {
  BODY_WRAP_COLUMNS,
  COMMAND_LINE_CHARS,
  COMMAND_MAX_LINES,
  DOORBELL_PREFIX,
  GUIDANCE_LINE_CHARS,
  GUIDANCE_MAX_LINES,
  MOD_VERSION,
} from './limits.js'

/**
 * Every piece of text the mod shows or hands the model, as pure functions,
 * so tests can check sizes and wording without a session.
 */

/** What the last look at the hub found. */
export type Phase = 'checking' | 'ok' | 'unreachable' | 'hub-error' | 'no-identity'

export type PollState = {
  phase: Phase
  /** Null whenever the mod could not look: never a stand-in 0. */
  unread: number | null
  isCapped: boolean
  ids: readonly string[]
  lastPollAt: number | null
  lastError: string | null
}

export const INITIAL_STATE: PollState = {
  phase: 'checking',
  unread: null,
  isCapped: false,
  ids: [],
  lastPollAt: null,
  lastError: null,
}

/** Drops terminal escapes and control characters other than newline and tab. */
export function clean(text: string): string {
  return text
    .replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, '')
    .replace(/\x1b\][^\x07\x1b]*(\x07|\x1b\\)/g, '')
    .replace(/\r\n?/g, '\n')
    .replace(/[\x00-\x08\x0b-\x1f\x7f]/g, '')
}

/** Cuts one line to `width` characters. */
export function cut(line: string, width: number): string {
  return line.length <= width ? line : line.slice(0, Math.max(0, width - 3)) + '...'
}

/**
 * At most `max` lines of at most `width` characters: a longer text keeps
 * its first max-1 lines and says how many it left out.
 */
export function clampLines(text: string, max: number, width: number): string {
  const lines = text.split('\n').map(line => cut(line, width))
  if (lines.length <= max) return lines.join('\n')
  const kept = lines.slice(0, max - 1)
  kept.push(`... (${lines.length - kept.length} more lines not shown)`)
  return kept.join('\n')
}

/** Wraps one paragraph at `width`, breaking long words. */
export function wrap(text: string, width: number): string[] {
  const out: string[] = []
  for (const paragraph of text.split('\n')) {
    if (paragraph.length <= width) {
      out.push(paragraph)
      continue
    }
    let line = ''
    for (const word of paragraph.split(/(\s+)/)) {
      if ((line + word).length <= width) {
        line += word
        continue
      }
      if (line.trim()) out.push(line.trimEnd())
      let rest = word.trimStart()
      while (rest.length > width) {
        out.push(rest.slice(0, width))
        rest = rest.slice(width)
      }
      line = rest
    }
    if (line.trim()) out.push(line.trimEnd())
  }
  return out
}

/** The command's text, held to COMMAND_MAX_LINES lines. */
export const commandText = (text: string): string =>
  clampLines(clean(text), COMMAND_MAX_LINES, COMMAND_LINE_CHARS)

const unreadWords = (state: PollState): string =>
  `${state.unread ?? '?'}${state.isCapped ? '+' : ''} unread`

/**
 * The status line, after the engine's own `⚠ hacs:` prefix. An unanswered
 * look reads "hub unreachable" or "hub error", never a count.
 */
export function statusLine(state: PollState): string {
  switch (state.phase) {
    case 'ok':
      return unreadWords(state)
    case 'unreachable':
      return 'hub unreachable'
    case 'hub-error':
      return 'hub error (see /hacs)'
    case 'no-identity':
      return 'no identity (see /hacs help)'
    default:
      return 'checking...'
  }
}

const iso = (ms: number | null): string => (ms === null ? 'never' : new Date(ms).toISOString())

const idsWords = (ids: readonly string[]): string => (ids.length ? ` (ids: ${ids.join(', ')})` : '')

/** What the last look found, in words. */
function inboxWords(state: PollState): string {
  switch (state.phase) {
    case 'ok':
      return unreadWords(state) + idsWords(state.ids)
    case 'unreachable':
      return `hub unreachable: ${state.lastError ?? 'no reason recorded'}`
    case 'hub-error':
      return `hub error: ${state.lastError ?? 'no reason recorded'}`
    case 'no-identity':
      return 'not checked: no identity'
    default:
      return 'not checked yet'
  }
}

/** `/hacs`: who, where, what the hub said, the doorbell, the preferences. */
export function statusText(config: Config, state: PollState, prefsNote: string, doorbellNote = ''): string {
  const who = config.instanceId
    ? `hacs ${MOD_VERSION} - ${config.instanceId} (${identityNote(config)})`
    : config.prefsProblem !== null && config.prefsProblem !== 'missing'
      ? `hacs ${MOD_VERSION} - no identity: ~/preferences.json ${config.prefsProblem}`
      : `hacs ${MOD_VERSION} - no identity: set "hacs": {"instanceId": "Name-xxxx"} in ~/preferences.json`
  return commandText(
    [
      who,
      `hub ${config.hubUrl}: ${inboxWords(state)}`,
      `last look: ${iso(state.lastPollAt)}${state.phase === 'ok' ? ' (ok)' : ''}`,
      `doorbell: ${config.doorbell ? 'on' : 'off (set hacs.doorbell: true in ~/preferences.json to turn it on)'}${doorbellNote ? '; ' + doorbellNote : ''}`,
      `status line every ${config.pollSeconds} s; preferences: ${prefsNote}`,
      '/hacs help lists the commands',
    ].join('\n'),
  )
}

/** `/hacs help`. */
export function helpText(prefix?: string): string {
  return commandText(
    [
      ...(prefix ? [prefix] : []),
      '/hacs              status: identity, hub, unread, doorbell',
      '/hacs inbox        unread messages (id, date, sender, subject)',
      '/hacs read <id>    one message (the hub marks it read)',
      '/hacs lists        your personal task lists',
      '/hacs help         this help',
      'Config: "hacs" key of ~/preferences.json: instanceId, hubUrl, pollSeconds, doorbell',
      'Secrets: ~/.hacs_secrets/ (chmod 700); never shown, logged, or given to the model',
      'Status line: "N unread", or "hub unreachable" / "hub error" (never shown as 0)',
      'Mods: $.hacs.send({to, subject, body}), inbox({limit}), read({id}), lists()',
      'Without mods, the hacs CLI works unchanged',
    ].join('\n'),
  )
}

/** `/hacs inbox`. */
export function inboxText(instanceId: string, messages: readonly HacsMessage[], total = messages.length): string {
  if (messages.length === 0) return commandText(`inbox for ${instanceId}: no unread messages`)
  const shown = messages.slice(0, COMMAND_MAX_LINES - 2)
  const lines = shown.map(m => `${m.id}  ${m.date.slice(0, 16)}  ${m.from}  ${m.subject}`)
  const all = Math.max(total, messages.length)
  const more = all - shown.length
  return commandText(
    [
      `inbox for ${instanceId}: ${all} unread${more > 0 ? ` (${more} not shown)` : ''}`,
      ...lines,
      'read one: /hacs read <id>',
    ].join('\n'),
  )
}

/**
 * `/hacs read <id>`: the header and as much of the body as fits; a cut body
 * says so loudly, because the hub has already marked the letter read.
 */
export function readText(letter: HacsLetter): string {
  const header = [
    `From: ${clean(letter.from)}   Date: ${clean(letter.date)}`,
    `Subject: ${clean(letter.subject)}`,
    '',
  ]
  const body = wrap(clean(letter.body), BODY_WRAP_COLUMNS)
  const room = COMMAND_MAX_LINES - header.length
  if (body.length <= room) return commandText([...header, ...body].join('\n'))
  const kept = body.slice(0, room - 1)
  const left = body.length - kept.length
  return commandText(
    [
      ...header,
      ...kept,
      `[TRUNCATED: ${left} more lines. The hub has marked it read; full text: hacs read ${letter.id}]`,
    ].join('\n'),
  )
}

/** `/hacs lists`. */
export function listsText(instanceId: string, lists: readonly HacsList[]): string {
  if (lists.length === 0) return commandText(`lists for ${instanceId}: none`)
  const shown = lists.slice(0, COMMAND_MAX_LINES - 2)
  return commandText(
    [
      `lists for ${instanceId}: ${lists.length}`,
      ...shown.map(l => `- ${l.key}: ${l.name}, ${l.taskCount} tasks`),
      "(open counts omitted: the hub's pendingCount reads 0 with open tasks)",
    ].join('\n'),
  )
}

const hostOfUrl = (url: string): string => {
  try {
    return new URL(url).host
  } catch {
    return url
  }
}

/** Guidance held to GUIDANCE_MAX_LINES lines. */
const guidance = (lines: readonly string[]): string =>
  clampLines(clean(lines.join('\n')), GUIDANCE_MAX_LINES, GUIDANCE_LINE_CHARS)

const POINTER =
  'The user can run /hacs, /hacs inbox, /hacs read <id> or /hacs lists (no model turn); /hacs help explains more.'

/** On the first prompt of a session: who this mind is on HACS, and where to look. */
export function firstGuidance(config: Config, state: PollState): string {
  if (!config.instanceId) {
    return guidance([
      'HACS mod loaded, but this mind has no HACS identity yet.',
      'Ask the user to set "hacs": {"instanceId": "Name-xxxx"} in ~/preferences.json; /hacs help explains more.',
    ])
  }
  return guidance([
    `HACS: you are ${config.instanceId} on the coordination hub (${hostOfUrl(config.hubUrl)}); inbox: ${inboxWords({ ...state, lastError: null })}.`,
    POINTER,
    ...(config.identitySource === 'hacs-identity'
      ? ['Identity came from ~/.hacs-identity: ~/preferences.json has no hacs.instanceId.']
      : []),
  ])
}

/** When unread mail is waiting: how much, which ids, and where to look. */
export function unreadGuidance(config: Config, state: PollState): string {
  return guidance([
    `HACS: ${unreadWords(state)} message(s) for ${config.instanceId ?? 'this mind'}${idsWords(state.ids)}.`,
    POINTER,
  ])
}

/** One doorbell notice: one message id, one line, no subject or body. */
export function doorbellText(instanceId: string, id: string): string {
  return clean(
    `${DOORBELL_PREFIX} new HACS message ${id} for ${instanceId}. ` +
      `To read it: the user runs /hacs read ${id}, or use \`hacs read ${id}\` where the CLI exists.`,
  )
}
