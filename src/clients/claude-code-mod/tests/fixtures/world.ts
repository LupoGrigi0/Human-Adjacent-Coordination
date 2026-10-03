import type { Args, CommandRunInput, On, PromptSubmitInput, SessionStartInput } from 'claude-code'
import { mock } from 'claude-code/testing'
import type { MockClock } from 'claude-code/testing'

/**
 * The world beneath the hacs mod in a test: HOME and its files, a faked HACS
 * hub behind `http.fetch`, the store, the status line, the prompt, and the
 * preferences helper behind `process.run`, on a mock clock.
 *
 * Every stub keeps what the mod did, so a test reads it back. Hub replies
 * are a mutable table: a test changes `w.hub.<fn>` between clock advances.
 */

export const HOME = '/home/mind'
export const PREFS_PATH = HOME + '/preferences.json'
export const IDENTITY_PATH = HOME + '/.hacs-identity'
export const SECRETS_DIR = HOME + '/.hacs_secrets'
export const ME = 'Forge-ba0e'
export const HUB = 'https://smoothcurves.nexus/mcp'

/** 2026-10-03T12:00:00.000Z */
export const NOW = Date.UTC(2026, 9, 3, 12, 0, 0)

export const SESSION: SessionStartInput = {
  surface: 'terminal',
  isInteractive: true,
  cwd: '/work',
}

/** `/hacs <args>` as the person types it. */
export const hacs = (args: string): CommandRunInput => ({
  command: 'hacs',
  args,
  origin: { kind: 'composer' },
  presentation: { isFullscreen: false, columns: 120 },
})

/** A prompt as the person submits it. */
export const typed = (text: string, context?: readonly string[]): PromptSubmitInput => ({
  text,
  ...(context && { context }),
  wait: false,
  origin: { kind: 'composer' },
})

/** One faked hub answer. */
export type Reply =
  | { data: Record<string, unknown> }
  | { unreachable: string }
  | { status: number; text?: string }
  | { rpcError: string }
  | { slowMs: number; then: Reply }

export type HubTable = Record<string, Reply | ((args: Record<string, unknown>) => Reply)>

/** The hub's answers when a test says nothing else. */
export const defaultHub = (): HubTable => ({
  do_i_have_new_messages: { data: { success: true, new_messages: false } },
  list_my_messages: { data: { success: true, messages: [], hint: 'use get_message(id) to read full message' } },
  get_message: args => ({
    data: {
      success: true,
      from: 'Lupo-f63b',
      subject: 'hello',
      body: 'hi Forge',
      date: '2026-10-03T11:00:00.000Z',
      id: String(args.id),
    },
  }),
  get_personal_lists: {
    data: { success: true, lists: [{ key: 'default', name: 'default', taskCount: 14, pendingCount: 0 }] },
  },
  send_message: args => ({
    data: {
      success: true,
      message_id: 'm-sent-1',
      delivered_to: String(args.to),
      delivered_to_id: String(args.to),
    },
  }),
})

export type WorldOptions = {
  /** preferences.json: an object is written as JSON, a string as is, null for none. */
  prefs?: unknown
  /** ~/.hacs-identity: an object is written as JSON, null (default) for none. */
  identity?: unknown
  /** Files in ~/.hacs_secrets, by name. */
  secrets?: Record<string, string>
  /** Names in ~/.hacs_secrets that are symbolic links (listed as `other`). */
  linkedSecrets?: readonly string[]
  /** Hub answers over the defaults. */
  hub?: HubTable
  /** What $.store holds at the start. */
  store?: Record<string, unknown>
  /** $.store refuses every call. */
  isStoreBroken?: boolean
  /** The preferences helper's exit code and stderr. */
  helper?: { exitCode: number; stderr: string }
  /** No HOME in the environment. */
  isHomeless?: boolean
  /** $.command.register refuses /hacs (a taken name). */
  isCommandTaken?: boolean
}

export type World = {
  clock: MockClock
  hub: HubTable
  files: Record<string, string>
  /** Each hub call: the function, its arguments, the URL and the raw body. */
  calls: { fn: string; args: Record<string, unknown>; url: string; body: string }[]
  statuses: (string | undefined)[]
  submitted: Args<'prompt.submit'>[]
  runs: Args<'process.run'>[]
  stored: Map<string, unknown>
  registered: string[]
  /** store.set and prompt.submit in the order they happened. */
  order: string[]
  /** Hub calls of one function so far. */
  count: (fn: string) => number
  /** The patches the preferences helper received, parsed. */
  patches: () => { set: Record<string, unknown>; default: Record<string, unknown> }[]
}

const respond = (text: string, status = 200) => ({
  value: { status, ok: status >= 200 && status < 300, headers: { 'content-type': 'application/json' }, text },
})

export function world(on: On, options: WorldOptions = {}): World {
  const clock = mock.clock(on, { now: NOW })
  mock.env(on, options.isHomeless ? {} : { HOME })

  const files: Record<string, string> = {}
  const prefs = options.prefs === undefined ? { theme: 'dark', hacs: { instanceId: ME } } : options.prefs
  if (prefs !== null) files[PREFS_PATH] = typeof prefs === 'string' ? prefs : JSON.stringify(prefs)
  if (options.identity !== undefined && options.identity !== null) {
    files[IDENTITY_PATH] = typeof options.identity === 'string' ? options.identity : JSON.stringify(options.identity)
  }
  const secrets = options.secrets ?? {}
  for (const [name, text] of Object.entries(secrets)) files[SECRETS_DIR + '/' + name] = text

  const hub: HubTable = { ...defaultHub(), ...options.hub }
  const calls: World['calls'] = []
  const statuses: World['statuses'] = []
  const submitted: World['submitted'] = []
  const runs: World['runs'] = []
  const stored = new Map<string, unknown>(Object.entries(options.store ?? {}))
  const registered: string[] = []
  const order: string[] = []

  on('session.start', ($, e) => ({ cwd: e.cwd }))

  on('command.register', ($, e) => {
    if (options.isCommandTaken) return { deny: `"/${e.name}" refused: it is taken` }
    registered.push(e.name)
    return { value: { command: e.name } }
  })

  on('fs.read', ($, e) => {
    const text = files[e.path]
    return text === undefined ? { deny: `ENOENT: no such file, open '${e.path}'` } : { value: text }
  })

  on('fs.list', ($, e) => {
    if (e.path !== SECRETS_DIR || Object.keys(secrets).length === 0) {
      return { deny: `ENOENT: no such directory, scandir '${e.path}'` }
    }
    return {
      value: Object.entries(secrets).map(([name, text]) =>
        options.linkedSecrets?.includes(name)
          ? { name, kind: 'other' as const, size: 24, isLink: true }
          : { name, kind: 'file' as const, size: text.length, isLink: false },
      ),
    }
  })

  on('ui.status', ($, e) => {
    statuses.push(e.text)
    return { value: undefined }
  })

  on('store.get', ($, e) => (options.isStoreBroken ? { deny: 'store unavailable' } : { value: stored.get(e.key) }))

  on('store.set', ($, e) => {
    if (options.isStoreBroken) return { deny: 'store unavailable' }
    stored.set(e.key, e.value)
    order.push('store.set:' + e.key)
    return { value: undefined }
  })

  on('process.run', ($, e) => {
    runs.push(e)
    const helper = options.helper ?? { exitCode: 0, stderr: '' }
    return { value: { exitCode: helper.exitCode, stdout: helper.exitCode === 0 ? 'ok\n' : '', stderr: helper.stderr } }
  })

  on('prompt.submit', ($, e) => {
    submitted.push(e)
    order.push('submit:' + e.text)
    return { text: e.text, context: e.context }
  })

  async function answer(reply: Reply): Promise<unknown> {
    if ('slowMs' in reply) {
      await clock.sleep(reply.slowMs)
      return answer(reply.then)
    }
    if ('unreachable' in reply) return { deny: reply.unreachable }
    if ('status' in reply) return respond(reply.text ?? '', reply.status)
    if ('rpcError' in reply) {
      return respond(JSON.stringify({ jsonrpc: '2.0', id: 1, error: { code: -32000, message: reply.rpcError } }))
    }
    return respond(JSON.stringify({ jsonrpc: '2.0', id: 1, result: { success: true, content: [], data: reply.data } }))
  }

  on('http.fetch', async ($, e) => {
    const body = e.init?.body ?? ''
    let parsed: { params?: { name?: string; arguments?: Record<string, unknown> } } = {}
    try {
      parsed = JSON.parse(body)
    } catch {
      parsed = {}
    }
    const fn = parsed.params?.name ?? '?'
    const args = parsed.params?.arguments ?? {}
    calls.push({ fn, args, url: e.url, body })
    const entry = hub[fn]
    if (entry === undefined) return { deny: `the fake hub has no ${fn}` }
    const reply = typeof entry === 'function' ? entry(args) : entry
    return (await answer(reply)) as never
  })

  return {
    clock,
    hub,
    files,
    calls,
    statuses,
    submitted,
    runs,
    stored,
    registered,
    order,
    count: fn => calls.filter(call => call.fn === fn).length,
    patches: () => runs.map(run => JSON.parse(run.init?.stdin ?? '{}')),
  }
}

/** The number of lines in a text (an absent text has none). */
export const linesOf = (text: string | undefined): number => (text === undefined || text === '' ? 0 : text.split('\n').length)

/** Unread ids, as do_i_have_new_messages answers them. */
export const unreadReply = (ids: readonly string[]): Reply =>
  ids.length === 0
    ? { data: { success: true, new_messages: false } }
    : { data: { success: true, new_messages: true, unread_ids: [...ids] } }
