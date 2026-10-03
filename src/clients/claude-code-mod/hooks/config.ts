import type { HubHost } from './host.js'
import {
  DEFAULT_HUB_URL,
  DEFAULT_POLL_SECONDS,
  MAX_POLL_SECONDS,
  MIN_POLL_SECONDS,
} from './limits.js'
import { loadSecrets } from './secrets.js'

/** Where this mind's identity was found. */
export type IdentitySource = 'preferences' | 'hacs-identity' | 'none'

/**
 * The mod's configuration as read now: from the `hacs` key of
 * ~/preferences.json, the identity falling back to ~/.hacs-identity.
 */
export type Config = {
  home: string
  prefsPath: string
  secretsDir: string
  instanceId: string | null
  identitySource: IdentitySource
  hubUrl: string
  pollSeconds: number
  doorbell: boolean
  /** Why preferences.json could not be used, when it could not. */
  prefsProblem: string | null
  /** Values to redact; never leave the mod. */
  secrets: readonly string[]
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)

const nonEmpty = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() !== '' ? value.trim() : null

/**
 * Reads the configuration. Never throws for a missing or broken file: it
 * says so in `prefsProblem` / `identitySource` so status can show it. Throws
 * only when HOME itself is unknown.
 */
export async function loadConfig(host: HubHost): Promise<Config> {
  const home = await host.home()
  if (!home) throw new Error('HOME is not set, so ~/preferences.json cannot be found')

  const prefsPath = home + '/preferences.json'
  const secretsDir = home + '/.hacs_secrets'

  let prefsProblem: string | null = null
  let hacs: Record<string, unknown> = {}
  let text: string | null = null
  try {
    text = await host.read(prefsPath)
  } catch (error) {
    // Only a file that is not there counts as missing; any other failure
    // (permission, size, a refused read) is named, and blocks the fallback.
    const why = error instanceof Error ? error.message : String(error)
    prefsProblem = /ENOENT|no such file/i.test(why) ? 'missing' : 'unreadable: ' + why.split('\n')[0]
  }
  if (text !== null) {
    try {
      const parsed: unknown = JSON.parse(text)
      if (!isRecord(parsed)) prefsProblem = 'not a JSON object'
      else if (parsed.hacs !== undefined && !isRecord(parsed.hacs)) prefsProblem = '"hacs" is not an object'
      else hacs = isRecord(parsed.hacs) ? parsed.hacs : {}
    } catch {
      prefsProblem = 'not valid JSON'
    }
  }

  let instanceId = nonEmpty(hacs.instanceId)
  let identitySource: IdentitySource = instanceId ? 'preferences' : 'none'
  // ~/.hacs-identity is read only when preferences.json is absent or valid
  // without hacs.instanceId: a broken or unreadable file must not quietly
  // swap in another identity.
  if (!instanceId && (prefsProblem === null || prefsProblem === 'missing')) {
    try {
      const identity: unknown = JSON.parse(await host.read(home + '/.hacs-identity'))
      instanceId = isRecord(identity) ? nonEmpty(identity.instanceId) : null
      if (instanceId) identitySource = 'hacs-identity'
    } catch {
      instanceId = null
    }
  }

  const hub = nonEmpty(hacs.hubUrl)
  const hubUrl = hub && /^https?:\/\//.test(hub) ? hub : DEFAULT_HUB_URL

  const poll = typeof hacs.pollSeconds === 'number' && Number.isFinite(hacs.pollSeconds)
    ? hacs.pollSeconds
    : DEFAULT_POLL_SECONDS
  const pollSeconds = Math.min(MAX_POLL_SECONDS, Math.max(MIN_POLL_SECONDS, Math.round(poll)))

  return {
    home,
    prefsPath,
    secretsDir,
    instanceId,
    identitySource,
    hubUrl,
    pollSeconds,
    doorbell: hacs.doorbell === true,
    prefsProblem,
    secrets: await loadSecrets(host, secretsDir),
  }
}

/** How status names where the identity came from. */
export function identityNote(config: Config): string {
  if (config.identitySource === 'preferences') return 'from ~/preferences.json'
  if (config.identitySource === 'hacs-identity') {
    return 'from ~/.hacs-identity (~/preferences.json is missing or has no hacs.instanceId)'
  }
  return 'none'
}
