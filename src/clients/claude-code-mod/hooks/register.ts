import type { EngineInterface, On, Timer } from 'claude-code'

import * as Api from './api.js'
import type { Config } from './config.js'
import { launchDirOf, loadConfig } from './config.js'
import * as Format from './format.js'
import type { PollState } from './format.js'
import type { Host, HubHost } from './host.js'
import { kindOf, messageOf } from './hub.js'
import {
  COMMAND_NAME,
  DEFAULT_POLL_SECONDS,
  DOORBELL_PREFIX,
  MOD_VERSION,
  PREFS_HEARTBEAT_MS,
  PREFS_HELPER,
  PREFS_TIMEOUT_MS,
  RUNG_KEEP,
} from './limits.js'
import { scrub } from './secrets.js'

/**
 * Everything the mod reaches, as closures over one `$`. The only function
 * that spells `$`: every other piece takes the Host it returns.
 *
 * @param $ the mods API of the hook (or, for the noun, the engine beneath)
 * @param launchDir the launch directory the mod recorded, if any
 * @returns the Host
 */
function hostOf($: EngineInterface, launchDir: () => string | undefined): Host {
  return {
    fetch: (url, init) => $.http.fetch(url, init),
    read: path => $.fs.read(path),
    list: path => $.fs.list(path),
    home: () => $.env.get('HOME'),
    launchDir,
    now: () => $.clock.now(),
    sleep: (ms, signal) => $.clock.sleep(ms, signal ? { signal } : undefined),
    every: (ms, fn) => $.clock.every(ms, fn),
    after: (ms, fn) => $.clock.after(ms, fn),
    status: text => $.ui.status(text),
    submit: text => $.prompt.submit({ text }),
    storeGet: key => $.store.get(key),
    storeSet: (key, value) => $.store.set(key, value),
    run: (argv, init) => $.process.run(argv, init),
    root: () => $.plugin.root,
    registerCommand: spec => $.command.register(spec),
  }
}

/** A noun op's answer: `{ value }`, or `{ deny }` carrying the reason. */
const answerOf = <T>(work: Promise<T>) =>
  work.then(
    value => ({ value }),
    (error: unknown) => ({ deny: messageOf(error) }),
  )

const asIds = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((id): id is string => typeof id === 'string') : []

/**
 * Registers the mod's hooks: the `$.hacs` noun (engine.create, and the
 * hacs.* events answering with a reason on failure), `/hacs`, the poll timer
 * armed in session.start, and the prompt.submit guidance.
 *
 * No event hook but command.run awaits the hub: the poll runs in the timer,
 * and guidance reads what the last poll found.
 *
 * @param on the engine's registrar
 */
export function register(on: On) {
  let timer: Timer | undefined
  let kick: Timer | undefined
  let config: Config | undefined
  let state: PollState = Format.INITIAL_STATE
  let isPolling = false
  let isFirstPrompt = true
  let isInteractive = false
  let doorbellNote = ''
  let guidedIds = ''
  let prefsNote = 'not written yet'
  let prefsSignature = ''
  let prefsWrittenAt = -Infinity
  // The directory Claude Code was launched from: `e.cwd` of the FIRST
  // session.start this mod sees, kept for the life of the mod. A later
  // session.start (a reload, /resume, a cwd change) never moves it, so
  // preferences.json and .hacs_secrets/ stay where they were found.
  let launchDir: string | undefined
  let hasSeenStart = false
  const launchDirNow = (): string | undefined => launchDir

  const secretsOf = (): readonly string[] => config?.secrets ?? []

  /** The status line, never a count the mod did not see. */
  function show(host: Host): void {
    try {
      host.status(scrub(Format.statusLine(state), secretsOf()))
    } catch {
      // the status line is a convenience; the session goes on without it
    }
  }

  /**
   * Merges status (and config defaults) into the `hacs` key of the resolved
   * preferences.json (cfg.prefsPath) through the atomic helper, when status changed or
   * the heartbeat is due. Only the hacs key is ever touched.
   */
  async function writePrefs(host: Host, cfg: Config): Promise<void> {
    const status = {
      lastPollAt: state.lastPollAt === null ? null : new Date(state.lastPollAt).toISOString(),
      lastPollOk: state.phase === 'ok',
      unread: state.phase === 'ok' ? state.unread : null,
      unreadCapped: state.phase === 'ok' ? state.isCapped : false,
      lastError: state.lastError === null ? null : scrub(state.lastError, cfg.secrets),
      identitySource: cfg.identitySource,
      modVersion: MOD_VERSION,
    }
    const signature = JSON.stringify({ ...status, lastPollAt: null })
    const now = await host.now()
    if (signature === prefsSignature && now - prefsWrittenAt < PREFS_HEARTBEAT_MS) return

    if (cfg.prefsProblem !== null && cfg.prefsProblem !== 'missing') {
      prefsNote = `${cfg.prefsPath} ${cfg.prefsProblem}: not written`
      return
    }
    const patch = {
      set: status,
      default: { hubUrl: cfg.hubUrl, pollSeconds: cfg.pollSeconds, doorbell: cfg.doorbell },
    }
    try {
      const done = await host.run(['python3', host.root() + '/' + PREFS_HELPER, cfg.prefsPath], {
        stdin: JSON.stringify(patch),
        timeoutMs: PREFS_TIMEOUT_MS,
      })
      if (done.exitCode === 0) {
        prefsNote = 'written'
        prefsSignature = signature
        prefsWrittenAt = now
      } else {
        const why = done.stderr.trim().split('\n')[0] || `exit ${done.exitCode}`
        prefsNote = 'write failed: ' + scrub(why, cfg.secrets)
      }
    } catch (error) {
      prefsNote = 'write failed: ' + scrub(messageOf(error), cfg.secrets)
    }
  }

  /**
   * Rings once per new unread id; rung ids persist in $.store first. Only in
   * an interactive session: a headless run (`claude -p`, the SDK) would take
   * the ring from the mind's own session and end before anyone heard it.
   * A ring that fails is named in /hacs, never dropped without a word.
   */
  async function ring(host: Host, cfg: Config, ids: readonly string[]): Promise<void> {
    if (!cfg.doorbell || !cfg.instanceId || ids.length === 0) return
    if (!isInteractive) {
      doorbellNote = 'not ringing in a non-interactive session'
      return
    }
    const key = 'rung:' + cfg.instanceId
    const rung = asIds(await host.storeGet(key))
    const fresh = ids.filter(id => !rung.includes(id))
    if (fresh.length === 0) return
    // Saved before ringing: a crash between the two loses a ring, never repeats one.
    await host.storeSet(key, [...rung, ...fresh].slice(-RUNG_KEEP))
    for (const id of [...fresh].reverse()) {
      void host.submit(scrub(Format.doorbellText(cfg.instanceId, id), cfg.secrets)).then(
        () => {
          doorbellNote = ''
        },
        (error: unknown) => {
          doorbellNote = scrub(`ring for ${id} failed: ${messageOf(error)}`, cfg.secrets)
        },
      )
    }
  }

  /** Records one look at the hub (or the failure to look). */
  async function look(host: Host, cfg: Config): Promise<Api.Unread | undefined> {
    const at = await host.now().catch(() => null)
    if (!cfg.instanceId) {
      state = { ...Format.INITIAL_STATE, phase: 'no-identity', lastPollAt: at, lastError: 'no identity' }
      return undefined
    }
    try {
      const found = await Api.unread(host)
      state = {
        phase: 'ok',
        unread: found.ids.length,
        isCapped: found.isCapped,
        ids: found.ids,
        lastPollAt: at,
        lastError: null,
      }
      return found
    } catch (error) {
      state = {
        phase: kindOf(error) === 'unreachable' ? 'unreachable' : 'hub-error',
        unread: null,
        isCapped: false,
        ids: [],
        lastPollAt: at,
        lastError: scrub(messageOf(error), cfg.secrets),
      }
      return undefined
    }
  }

  /** One poll, run by the timer: look, show, ring, record. Never throws. */
  async function poll(host: Host): Promise<void> {
    if (isPolling) return
    isPolling = true
    try {
      let cfg: Config
      try {
        cfg = await loadConfig(host)
      } catch (error) {
        state = { ...Format.INITIAL_STATE, phase: 'no-identity', lastError: messageOf(error) }
        show(host)
        return
      }
      config = cfg
      const found = await look(host, cfg)
      show(host)
      if (found) {
        try {
          await ring(host, cfg, found.ids)
        } catch (error) {
          // no store, no ring: better quiet than ringing every poll, but /hacs says so
          doorbellNote = scrub('store unavailable, not ringing: ' + messageOf(error), cfg.secrets)
        }
      }
      await writePrefs(host, cfg)
    } catch {
      // a timer callback that throws only reaches the debug log
    } finally {
      isPolling = false
    }
  }

  /** `/hacs ...`: the text, at most twelve lines; never starts a turn. */
  async function command(host: Host, args: string): Promise<string> {
    const [sub = '', ...rest] = args.trim().split(/\s+/).filter(Boolean)
    const cfg = await loadConfig(host)
    config = cfg
    switch (sub.toLowerCase()) {
      case '':
      case 'status': {
        await look(host, cfg)
        show(host)
        await writePrefs(host, cfg)
        return Format.statusText(cfg, state, prefsNote, cfg.doorbell ? doorbellNote : '')
      }
      case 'inbox': {
        const page = await Api.inboxPage(host, { limit: 10 })
        return Format.inboxText(cfg.instanceId ?? '?', page.messages, page.total)
      }
      case 'read': {
        const id = rest[0]
        if (!id) return Format.commandText('usage: /hacs read <id>  (ids come from /hacs inbox)')
        return Format.readText(await Api.read(host, id))
      }
      case 'lists':
        return Format.listsText(cfg.instanceId ?? '?', await Api.lists(host))
      case 'help':
        return Format.helpText()
      default:
        return Format.helpText(`unknown subcommand ${JSON.stringify(sub)}`)
    }
  }

  on('engine.create', async (_$, e, next) => {
    const beneath = await next(e)
    const host: HubHost = {
      fetch: (url, init) => beneath.http.fetch(url, init),
      read: path => beneath.fs.read(path),
      list: path => beneath.fs.list(path),
      home: () => beneath.env.get('HOME'),
      launchDir: launchDirNow,
      sleep: (ms, signal) => beneath.clock.sleep(ms, signal ? { signal } : undefined),
    }
    const hacs: EngineInterface['hacs'] = {
      send: message => Api.send(host, message),
      inbox: query => Api.inbox(host, query),
      read: id => Api.read(host, id),
      lists: () => Api.lists(host),
    }
    const added = { hacs }
    return { ...added, ...beneath }
  })

  on('hacs.send', ($, e) => answerOf(Api.send(hostOf($, launchDirNow), e)))
  on('hacs.inbox', ($, e) => answerOf(Api.inbox(hostOf($, launchDirNow), e)))
  on('hacs.read', ($, e) => answerOf(Api.read(hostOf($, launchDirNow), e)))
  on('hacs.lists', $ => answerOf(Api.lists(hostOf($, launchDirNow))))

  on('session.start', async ($, e, next) => {
    if (!hasSeenStart) {
      hasSeenStart = true
      launchDir = launchDirOf(e.cwd) ?? undefined
    }
    const host = hostOf($, launchDirNow)
    try {
      // Re-armed on every start (a reload runs session.start again): the old
      // interval and first look are cancelled before new ones begin.
      timer?.cancel()
      kick?.cancel()
      timer = undefined
      kick = undefined
      isFirstPrompt = true
      isInteractive = e.isInteractive === true
      guidedIds = ''
      let pollMs = DEFAULT_POLL_SECONDS * 1000
      try {
        config = await loadConfig(host)
        pollMs = config.pollSeconds * 1000
        state = config.instanceId
          ? Format.INITIAL_STATE
          : { ...Format.INITIAL_STATE, phase: 'no-identity', lastError: 'no identity' }
      } catch (error) {
        config = undefined
        state = { ...Format.INITIAL_STATE, phase: 'no-identity', lastError: messageOf(error) }
      }
      show(host)
      try {
        timer = host.every(pollMs, () => {
          void poll(host)
        })
        kick = host.after(0, () => {
          void poll(host)
        })
      } catch {
        // no timer: no status line updates, but /hacs and the noun still work
      }
      try {
        await host.registerCommand({
          name: COMMAND_NAME,
          description: 'HACS: status, inbox, read <id>, lists, help (no model turn)',
          argumentHint: '[inbox | read <id> | lists | help]',
        })
      } catch {
        // a taken name: the timer, status line and noun still work
      }
    } catch {
      // the session starts whatever happened here
    }
    return next(e)
  })

  on('session.end', async ($, e, next) => {
    // After /clear or /resume the next prompt starts a conversation again.
    isFirstPrompt = true
    guidedIds = ''
    return next(e)
  })

  on('command.run', { command: 'hacs' }, async ($, e) => {
    const host = hostOf($, launchDirNow)
    try {
      const text = await command(host, e.args)
      return { text: scrub(text, secretsOf()) }
    } catch (error) {
      return { text: Format.commandText('hacs: ' + scrub(messageOf(error), secretsOf())) }
    }
  })

  on('prompt.submit', async ($, e, next) => {
    // The mod's own doorbell notice passes untouched: it neither takes the
    // first-prompt orientation nor carries a second copy of the unread note.
    if (e.origin?.kind === 'plugin' && e.text.startsWith(DOORBELL_PREFIX)) return next(e)
    let note: string | undefined
    try {
      if (config) {
        const ids = state.phase === 'ok' ? state.ids.join(',') : ''
        if (state.phase === 'ok' && state.unread === 0) guidedIds = ''
        if (isFirstPrompt) {
          note = Format.firstGuidance(config, state)
          guidedIds = ids
        } else if (state.phase === 'ok' && (state.unread ?? 0) > 0 && ids !== guidedIds) {
          note = Format.unreadGuidance(config, state)
          guidedIds = ids
        }
        isFirstPrompt = false
        if (note !== undefined) note = scrub(note, config.secrets)
      }
    } catch {
      note = undefined
    }
    return next(note ? { ...e, context: [...(e.context ?? []), note] } : e)
  })
}
