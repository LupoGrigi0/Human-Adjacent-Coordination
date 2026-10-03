/**
 * The `$.hacs` noun as every caller sees it: the one contract for the noun,
 * its types exported here and the noun declared on `EngineInterface`
 * (the noun-contract pattern of the built-in telemetry mod).
 *
 * The hacs mod adds the noun in its `engine.create` step and also hooks the
 * noun's events (`hacs.send`, `hacs.inbox`, `hacs.read`, `hacs.lists`), so a
 * failure rejects the caller with the reason. Identity is never an argument:
 * it comes from `~/preferences.json` (`hacs.instanceId`), falling back to
 * `~/.hacs-identity`. Nothing here is imported, so it stands on its own.
 *
 * Every op on `$` carries ONE input across the engine (the event's argument
 * is the method's first parameter, and it must be an object), so `send`
 * takes `{ to, subject, body }` and `read` takes `{ id }`.
 */

/**
 * The HACS hub, reached through the host's `$.http.fetch`.
 *
 * Every method rejects with the reason on a hub error, a timeout, or a reply
 * of `success: false`; nothing fails silently. Results never carry a value
 * from `~/.hacs_secrets/` (each is replaced by `[redacted]`).
 */
export type Hacs = {
  /**
   * Sends one message from this mind's instanceId. Resolves only when the hub
   * reports `delivered_to_id` equal to `to` (case-insensitive); any other
   * recipient, or none reported, rejects as a misdelivery.
   *
   * @example
   * await $.hacs.send({ to: "Lupo-f63b", subject: "hello", body: "..." })
   */
  send: (message: HacsSendInput) => Promise<HacsSent>
  /**
   * Lists unread messages, newest first (the hub's `list_my_messages`).
   * Note: the hub marks body-less messages read when they are listed.
   */
  inbox: (query?: HacsInboxQuery) => Promise<readonly HacsMessage[]>
  /**
   * Reads one message in full (the hub's `get_message`, which marks it read).
   *
   * @example
   * await $.hacs.read({ id: "msg-123" })
   */
  read: (ref: HacsReadInput) => Promise<HacsLetter>
  /**
   * This mind's personal task lists (the hub's `get_personal_lists`).
   * The hub's pendingCount is dropped: it reads 0 with open tasks.
   */
  lists: () => Promise<readonly HacsList[]>
}

/** What `$.hacs.send` takes. Any `from` field is ignored. */
export type HacsSendInput = {
  /** The recipient's instanceId, exactly (`Name-xxxx`). */
  to: string
  subject: string
  /** At most 8000 characters (the hub's limit is 8192). */
  body: string
}

/** What `$.hacs.send` resolves with, once the recipient is verified. */
export type HacsSent = {
  messageId: string | null
  deliveredTo: string
  deliveredToId: string
}

/** What `$.hacs.read` takes: the id `inbox` listed. */
export type HacsReadInput = {
  id: string
}

/** What `$.hacs.inbox` takes. */
export type HacsInboxQuery = {
  /** 1 to 50; 10 when absent. */
  limit?: number
}

/** One unread message as the inbox lists it. */
export type HacsMessage = {
  id: string
  from: string
  subject: string
  date: string
}

/** One message read in full. */
export type HacsLetter = HacsMessage & { body: string }

/** One personal task list. */
export type HacsList = {
  key: string
  name: string
  taskCount: number
}

declare module 'claude-code' {
  interface EngineInterface {
    /**
     * The HACS coordination hub for this mind; present where the hacs mod is
     * loaded. Identity comes from ~/preferences.json, never from arguments.
     */
    hacs: Hacs
  }
}
