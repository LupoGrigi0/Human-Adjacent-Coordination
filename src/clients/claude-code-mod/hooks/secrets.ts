import type { HubHost } from './host.js'
import { REDACTED, SECRET_FILE_MAX_BYTES, SECRET_MIN_CHARS } from './limits.js'

/**
 * Secrets live in .hacs_secrets/ beside preferences.json, in the launch
 * directory (chmod 700): one value per file,
 * KEY=VALUE or `key: value` lines, or a JSON object (every string in it). v0.1 sends none of them anywhere: the mod reads them only
 * so it can redact each one from everything that leaves it (command text,
 * the status line, prompt context, the preferences write, a rejection's
 * reason, the noun's results). The values stay in this module's memory.
 */

/**
 * Reads every small file in `dir` (a symbolic link is followed) and returns
 * the values to redact, longest first. A missing or unreadable directory
 * yields none.
 */
export async function loadSecrets(host: HubHost, dir: string): Promise<readonly string[]> {
  let entries: readonly { name: string; kind: string; size: number }[]
  try {
    entries = await host.list(dir)
  } catch {
    return []
  }
  const values = new Set<string>()
  for (const entry of entries) {
    if (entry.kind === 'dir') continue
    // A link reports its own size (`other`), so its target is checked once read.
    if (entry.kind === 'file' && entry.size > SECRET_FILE_MAX_BYTES) continue
    let text: string
    try {
      text = await host.read(dir + '/' + entry.name)
    } catch {
      continue
    }
    if (text.length > SECRET_FILE_MAX_BYTES) continue
    addValues(values, text)
  }
  return [...values].sort((a, b) => b.length - a.length)
}

function addValues(values: Set<string>, text: string): void {
  const add = (value: string) => {
    if (value.length >= SECRET_MIN_CHARS) values.add(value)
  }
  add(text.trim())
  try {
    addJsonStrings(add, JSON.parse(text))
  } catch {
    // not JSON: the lines below cover it
  }
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()
    add(line)
    // KEY=VALUE, and `key: value` (YAML, or one line of a JSON object)
    const match = /^["']?[\w.-]+["']?\s*[=:]\s*(.+?)\s*,?$/.exec(line)
    if (match?.[1]) add(match[1].trim().replace(/^["']|["']$/g, ''))
  }
}

function addJsonStrings(add: (value: string) => void, value: unknown): void {
  if (typeof value === 'string') add(value.trim())
  else if (Array.isArray(value)) for (const item of value) addJsonStrings(add, item)
  else if (value !== null && typeof value === 'object') {
    for (const item of Object.values(value)) addJsonStrings(add, item)
  }
}

/** Replaces every secret in `text` with [redacted]. */
export function scrub(text: string, secrets: readonly string[]): string {
  let out = text
  for (const secret of secrets) {
    if (secret && out.includes(secret)) out = out.split(secret).join(REDACTED)
  }
  return out
}

/** Scrubs every string inside a JSON-like value, returning a copy. */
export function scrubDeep<T>(value: T, secrets: readonly string[]): T {
  if (secrets.length === 0) return value
  if (typeof value === 'string') return scrub(value, secrets) as unknown as T
  if (Array.isArray(value)) return value.map(item => scrubDeep(item, secrets)) as unknown as T
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      out[key] = scrubDeep(item, secrets)
    }
    return out as T
  }
  return value
}
