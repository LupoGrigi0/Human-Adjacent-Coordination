/**
 * Claude Code PULL Adapter — for a mind whose doorbell is its OWN poller.
 *
 * Contract: EVENT-HUB-CONTRACT.md §8c (Messenger-aa2a, 6386343), which exists
 * because §8b could not express this case and I stopped on it rather than guess.
 *
 * ============================ WHY THIS ADAPTER DOES NOTHING ================
 *
 * §8b gave an adapter exactly two outcomes:
 *
 *     resolves -> VERIFIED DELIVERY (the hub marks the slot 'active')
 *     throws   -> failure           (slot 'pending', retry with backoff)
 *
 * A pull chassis has neither. The hub does not deliver — the mind's own
 * background poller fetches (see ../doorbell.sh). So:
 *
 *   {ok:true}  is a LIE. Nothing was delivered; the mind may be asleep for days.
 *              And it is a specific lie: it writes a FALSE DELIVERY RECEIPT into
 *              the hub's ledger, which is Messenger's own "accepted is never
 *              delivered" implemented backwards, inside the component that
 *              exists to refuse it.
 *   {ok:false} is TRUE but useless: retry-forever against something that was
 *              never going to be the deliverer.
 *
 * §8c's answer is better than either, and better than my own preferred fix
 * (which was "a pull chassis registers no adapter at all" — rejected because
 * then UNCONFIGURED and PULL would render identically, and that collapse is the
 * defect this house keeps paying for):
 *
 *     a STATIC `mode: 'pull'` declaration, read by the registry.
 *       -> the hub MUST NOT call notify() at all
 *       -> slot.status = 'awaiting_fetch'
 *       -> _retryPending() MUST skip it  (no unbounded retry)
 *       -> drain_events clears it exactly as it clears 'active'
 *
 * `awaiting_fetch` IS RFC-0001 §5b's *retain until read*, named, extended on-box.
 * Custody stays with the bus. Nothing claims delivery, and the registry still
 * records that this mind is reachable-by-pull rather than unconfigured.
 *
 * ========================= THE DECLARATION IS STATIC, DELIBERATELY =========
 *
 * `mode` is a property, not a per-call return value. A per-call answer would let
 * a transient failure look like a mode change, and would mean the hub had to
 * CALL the thing it must not call in order to learn not to call it.
 */

/**
 * Does this instance's doorbell belong to the instance rather than the hub?
 *
 * Primary signal: identity.chassis names us. Fallback: preferences declare the
 * runtime type. Sync and pure — the registry hands us the identity and prefs it
 * has already read, so this never does I/O and never throws.
 */
function detect(instanceId, identity, prefs) {
  if (identity?.chassis === 'claude-code-pull') return true;
  if (prefs?.runtime?.type === 'claude-code-pull') return true;
  // `independence` is Lupo's single-key home for all of this (his standing
  // requirement: everything in preferences.json, no proliferation of dotfiles).
  if (prefs?.independence?.config?.doorbell === 'pull') return true;
  return false;
}

/**
 * MUST NEVER BE CALLED. Present only because the contract shape requires it.
 *
 * If the hub calls this, the hub is not honouring §8c — so the honest answer is
 * a LOUD FAILURE NAMING THE VIOLATION, never {ok:true}.
 *
 * Returning {ok:false} here does mark the slot pending and retryable, which is
 * imperfect. It is chosen deliberately: "pending" is TRUE (nothing was
 * delivered), whereas {ok:true} would be false in the one direction that
 * corrupts the ledger. A noisy true beats a quiet false.
 *
 * It never throws, per the registry's contract that an adapter fault must not
 * take down hub dispatch.
 */
async function notify(instanceId, _notification) {
  const error =
    `§8c VIOLATION: notify() was called for ${instanceId}, which declares mode:'pull'. ` +
    `A pull chassis is not delivered to — its own poller fetches. The hub must set ` +
    `slot.status='awaiting_fetch' and skip retry instead of dispatching. ` +
    `Refusing to report delivery that did not happen.`;
  return { ok: false, error, contract: '§8c', mode: 'pull' };
}

export const claudeCodePullAdapter = {
  name: 'claude-code-pull',
  /** §8c: static, read by the registry; never inferred from a call result. */
  mode: 'pull',
  detect,
  notify
};
