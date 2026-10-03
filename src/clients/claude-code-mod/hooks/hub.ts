import type { HubHost } from './host.js'
import { HUB_TIMEOUT_MS } from './limits.js'

/**
 * Why a hub call failed: `unreachable` when the mod could not get an answer
 * (network, timeout, HTTP error status), `hub` when the hub answered with an
 * error or a reply it should not have sent, `misdelivery` when a send went to
 * someone else, `input` when the call was refused before reaching the hub,
 * `identity` when there is no instanceId to act as.
 */
export type HacsErrorKind = 'unreachable' | 'hub' | 'misdelivery' | 'input' | 'identity'

export class HacsError extends Error {
  kind: HacsErrorKind

  constructor(kind: HacsErrorKind, message: string) {
    super(message)
    this.kind = kind
    this.name = 'HacsError'
  }
}

export const kindOf = (error: unknown): HacsErrorKind =>
  error instanceof HacsError ? error.kind : 'hub'

export const messageOf = (error: unknown): string =>
  error instanceof Error ? error.message : String(error)

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)

/** The hub's error field, which is a string or `{ code, message }`. */
function errorText(error: unknown): string {
  if (typeof error === 'string' && error) return error
  if (isRecord(error)) {
    const code = typeof error.code === 'string' || typeof error.code === 'number' ? String(error.code) : ''
    const message = typeof error.message === 'string' ? error.message : ''
    const text = [code, message].filter(Boolean).join(': ')
    if (text) return text
  }
  return 'no reason given'
}

/**
 * Calls one HACS function over JSON-RPC (`tools/call`) and resolves with
 * `result.data`. Rejects, with the reason, on a network failure, a timeout,
 * a non-2xx status, a body that is not JSON-RPC, a JSON-RPC error, or a
 * reply whose `success` is false. Nothing is ever swallowed.
 */
export async function callHub(
  host: HubHost,
  hubUrl: string,
  fn: string,
  args: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const request = host.fetch(hubUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      method: 'tools/call',
      params: { name: fn, arguments: args },
      id: 1,
    }),
  })

  // The host's fetch takes no timeout, so race it against a clock wait that
  // is cancelled (aborted) as soon as the fetch settles.
  const stop = new AbortController()
  let timedOut = false
  const timeout = host.sleep(HUB_TIMEOUT_MS, stop.signal).then(
    () => {
      timedOut = true
    },
    // An aborted (or refused) wait never ends the race: only the fetch can.
    () => new Promise<void>(() => undefined),
  )

  let response: Awaited<typeof request>
  try {
    const first = await Promise.race([request, timeout])
    if (timedOut || first === undefined) {
      void request.catch(() => undefined)
      throw new HacsError('unreachable', `${fn}: hub timed out after ${HUB_TIMEOUT_MS / 1000} s`)
    }
    response = first
  } catch (error) {
    if (error instanceof HacsError) throw error
    throw new HacsError('unreachable', `${fn}: hub unreachable: ${messageOf(error)}`)
  } finally {
    if (!timedOut) stop.abort()
  }

  if (!response.ok) {
    throw new HacsError('unreachable', `${fn}: hub answered HTTP ${response.status}`)
  }

  let reply: unknown
  try {
    reply = JSON.parse(response.text)
  } catch {
    throw new HacsError('hub', `${fn}: hub reply is not JSON`)
  }
  if (!isRecord(reply)) throw new HacsError('hub', `${fn}: hub reply is not a JSON-RPC object`)
  if (reply.error !== undefined && reply.error !== null) {
    throw new HacsError('hub', `${fn}: hub error: ${errorText(reply.error)}`)
  }

  const result = reply.result
  const data = isRecord(result) ? result.data : undefined
  if (!isRecord(data)) throw new HacsError('hub', `${fn}: hub reply has no result.data`)
  if (data.success === false) {
    throw new HacsError('hub', `${fn}: hub refused: ${errorText(data.error)}`)
  }
  return data
}
