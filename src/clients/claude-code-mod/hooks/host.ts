import type { FsEntry, HttpInit, HttpResponse, ProcessRunInit, ProcessRunResult, Timer } from 'claude-code'

/**
 * What the hub operations reach: the network, the files that hold the
 * configuration and the secrets, the launch directory, HOME, and a clock
 * wait for timeouts.
 *
 * register.ts builds one inline over the engine beneath it in engine.create
 * (the static analysis wants `beneath.noun.event(...)` spelled there), and
 * every hook's Host (below) is one too.
 */
export type HubHost = {
  fetch: (url: string, init?: HttpInit) => Promise<HttpResponse>
  read: (path: string) => Promise<string>
  list: (path: string) => Promise<readonly FsEntry[]>
  home: () => Promise<string | undefined>
  /**
   * The directory Claude Code was launched from (`e.cwd` of the first
   * session.start this mod saw), or undefined before then or when it
   * carried none. preferences.json and .hacs_secrets/ live there.
   */
  launchDir: () => string | undefined
  sleep: (ms: number, signal?: AbortSignal) => Promise<void>
}

/**
 * Everything the mod reaches outside itself, as plain closures over `$`.
 *
 * register.ts builds one with its top-level `hostOf($)` (the only place that
 * spells `$`), so every other file takes a Host and never `$`, as the static
 * analysis of a hooks module requires.
 */
export type Host = HubHost & {
  now: () => Promise<number>
  every: (ms: number, fn: () => void) => Timer
  after: (ms: number, fn: () => void) => Timer
  status: (text: string | undefined) => void
  submit: (text: string) => Promise<unknown>
  storeGet: (key: string) => Promise<unknown>
  storeSet: (key: string, value: unknown) => Promise<void>
  run: (argv: readonly string[], init?: ProcessRunInit) => Promise<ProcessRunResult>
  root: () => string
  registerCommand: (spec: { name: string; description: string; argumentHint?: string }) => Promise<unknown>
}
