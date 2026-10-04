import type { HacsInboxQuery, HacsLetter, HacsList, HacsMessage, HacsReadInput, HacsSendInput, HacsSent } from '../types'
import type { Config } from './config.js'
import { loadConfig } from './config.js'
import type { HubHost } from './host.js'
import { HacsError, callHub, messageOf } from './hub.js'
import { BODY_MAX_CHARS, UNREAD_ID_CAP } from './limits.js'
import { scrub, scrubDeep } from './secrets.js'

/**
 * The HACS operations, over a Host. Each reads the configuration afresh
 * (identity from preferences.json in the launch directory, never from an
 * argument), calls the hub,
 * checks the reply's shape, and rejects with a reason that carries no secret.
 */

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)

const str = (value: unknown): string => (typeof value === 'string' ? value : '')

/** The configuration, refusing to act without an identity. */
export async function identified(host: HubHost): Promise<Config & { instanceId: string }> {
  const config = await loadConfig(host)
  if (!config.instanceId) {
    throw new HacsError(
      'identity',
      config.prefsProblem !== null && config.prefsProblem !== 'missing'
        ? `no identity: ${config.prefsPath} ${config.prefsProblem} (fix it; no fallback is used)`
        : `no identity: set "hacs": { "instanceId": "Name-xxxx" } in ${config.prefsPath}`,
    )
  }
  return config as Config & { instanceId: string }
}

/**
 * Runs `work` with the configuration, rethrowing any failure as a HacsError
 * whose message is scrubbed of every secret and names the operation.
 */
async function guarded<T>(host: HubHost, op: string, work: (config: Config & { instanceId: string }) => Promise<T>): Promise<T> {
  let secrets: readonly string[] = []
  try {
    const config = await identified(host)
    secrets = config.secrets
    return scrubDeep(await work(config), secrets)
  } catch (error) {
    const kind = error instanceof HacsError ? error.kind : 'hub'
    throw new HacsError(kind, `hacs.${op}: ${scrub(messageOf(error), secrets)}`)
  }
}

/**
 * Sends one message and verifies the recipient: resolves only when the hub's
 * `delivered_to_id` equals `to`, ignoring case (the "--force" -> "Forge"
 * lesson: success over the wrong recipient is not success).
 *
 * Takes one object, as every op on `$` carries one input; positional
 * `(to, subject, body)` also works when called directly.
 */
export function send(host: HubHost, input: HacsSendInput | string, subject?: string, body?: string): Promise<HacsSent> {
  return guarded(host, 'send', async config => {
    const message = typeof input === 'string' ? { to: input, subject, body } : input
    const to = isRecord(message) ? str(message.to).trim() : ''
    const title = isRecord(message) ? str(message.subject) : ''
    const text = isRecord(message) ? str(message.body) : ''

    if (!to) throw new HacsError('input', 'refused: "to" is required (an instanceId, Name-xxxx)')
    if (to.startsWith('-')) throw new HacsError('input', `refused: flag-shaped recipient ${JSON.stringify(to)}`)
    // Rooms and broadcasts carry no delivered_to_id, so they could never be
    // verified: refused before sending, never reported failed after delivery.
    if (to.includes(':') || to.toLowerCase() === 'all') {
      throw new HacsError('input', `refused: ${JSON.stringify(to)} is a room or broadcast; v0.1 sends to one instanceId`)
    }
    if (!title.trim()) throw new HacsError('input', 'refused: "subject" is required')
    if (!text.trim()) throw new HacsError('input', 'refused: "body" is required (the hub refuses a subject alone)')
    if (text.length > BODY_MAX_CHARS) {
      throw new HacsError('input', `refused: body is ${text.length} chars, over ${BODY_MAX_CHARS} (hub limit 8192)`)
    }

    const data = await callHub(host, config.hubUrl, 'send_message', {
      from: config.instanceId,
      to,
      subject: title,
      body: text,
    })

    const deliveredToId = str(data.delivered_to_id)
    const deliveredTo = str(data.delivered_to)
    if (!deliveredToId) {
      throw new HacsError(
        'misdelivery',
        `the hub reported no delivered_to_id (delivered_to ${JSON.stringify(deliveredTo)}), ` +
          `so the recipient cannot be verified; it may have been delivered: check before resending`,
      )
    }
    if (deliveredToId.toLowerCase() !== to.toLowerCase()) {
      throw new HacsError(
        'misdelivery',
        `MISDELIVERY: the hub delivered to ${JSON.stringify(deliveredToId)}, not ${JSON.stringify(to)}; ` +
          `it was sent: check who received it before resending`,
      )
    }
    const messageId = str(data.message_id) || str(data.messageId) || str(data.id)
    return { messageId: messageId || null, deliveredTo: deliveredTo || deliveredToId, deliveredToId }
  })
}

/** Unread messages, newest first. */
export async function inbox(host: HubHost, query?: HacsInboxQuery): Promise<readonly HacsMessage[]> {
  return (await inboxPage(host, query)).messages
}

/**
 * One page of the inbox, plus how many are unread in all: the hub reports
 * `total_unread` only when there are more than the page holds.
 */
export function inboxPage(
  host: HubHost,
  query?: HacsInboxQuery,
): Promise<{ messages: readonly HacsMessage[]; total: number }> {
  return guarded(host, 'inbox', async config => {
    const asked = isRecord(query) && typeof query.limit === 'number' ? query.limit : 10
    const limit = Math.min(50, Math.max(1, Math.round(asked)))
    const data = await callHub(host, config.hubUrl, 'list_my_messages', {
      instanceId: config.instanceId,
      limit,
    })
    if (!Array.isArray(data.messages)) throw new HacsError('hub', 'hub reply has no messages list')
    const messages = data.messages.filter(isRecord).map(m => ({
      id: str(m.id),
      from: str(m.from),
      subject: str(m.subject),
      date: str(m.date),
    }))
    const total = typeof data.total_unread === 'number' && data.total_unread > messages.length
      ? data.total_unread
      : messages.length
    return { messages, total }
  })
}

/**
 * One message in full; the hub marks it read. Takes `{ id }`, as every op on
 * `$` carries one object; a bare id also works when called directly.
 */
export function read(host: HubHost, input: HacsReadInput | string): Promise<HacsLetter> {
  return guarded(host, 'read', async config => {
    const id = typeof input === 'string' ? input : isRecord(input) ? input.id : undefined
    const ref = typeof id === 'string' ? id.trim() : ''
    if (!ref) throw new HacsError('input', 'refused: a message id is required')
    const data = await callHub(host, config.hubUrl, 'get_message', {
      instanceId: config.instanceId,
      messageId: ref,
      id: ref,
    })
    const m = isRecord(data.message) ? data.message : data
    return {
      id: ref,
      from: str(m.from),
      subject: str(m.subject),
      date: str(m.date),
      body: str(m.body),
    }
  })
}

/**
 * Personal task lists. The hub's pendingCount is not passed on: it counts
 * status "pending" while new personal tasks are "not_started", so it reads
 * 0 with open tasks (see KNOWN-GAPS.md).
 */
export function lists(host: HubHost): Promise<readonly HacsList[]> {
  return guarded(host, 'lists', async config => {
    const data = await callHub(host, config.hubUrl, 'get_personal_lists', {
      instanceId: config.instanceId,
    })
    if (!Array.isArray(data.lists)) throw new HacsError('hub', 'hub reply has no lists')
    return data.lists.filter(isRecord).map(l => ({
      key: str(l.key),
      name: str(l.name) || str(l.key),
      taskCount: typeof l.taskCount === 'number' ? l.taskCount : 0,
    }))
  })
}

/** What one look at the inbox found. */
export type Unread = {
  /** Unread ids, newest first, at most UNREAD_ID_CAP. */
  ids: readonly string[]
  /** True when the hub's cap was reached, so there may be more. */
  isCapped: boolean
}

/**
 * Looks for unread mail without side effects (`do_i_have_new_messages`
 * marks nothing read; `list_my_messages` would).
 */
export function unread(host: HubHost): Promise<Unread> {
  return guarded(host, 'unread', async config => {
    const data = await callHub(host, config.hubUrl, 'do_i_have_new_messages', {
      instanceId: config.instanceId,
    })
    if (data.new_messages === false) return { ids: [], isCapped: false }
    if (data.new_messages !== true || !Array.isArray(data.unread_ids)) {
      throw new HacsError('hub', 'hub reply has no new_messages answer')
    }
    const ids = data.unread_ids.filter((id): id is string => typeof id === 'string')
    // new_messages: true with no usable id must never read as "0 unread".
    if (ids.length === 0 || ids.length !== data.unread_ids.length) {
      throw new HacsError('hub', 'hub said new_messages but gave no usable unread_ids')
    }
    return { ids, isCapped: ids.length >= UNREAD_ID_CAP }
  })
}
