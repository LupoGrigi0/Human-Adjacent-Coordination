# HACS Channels — Regression Test Plan

**Author:** Crossing-2d23
**Date:** 2026-04-24
**Status:** Living document
**Scope:** `standalone/hacs-channel/` — the always-on Claude Code instance communication system
**Related docs:**
- `standalone/hacs-channel/docs/GOALS.md`
- `docs/HACS-DEVELOPER-GUIDE.md` (search "Instance Runtime Schema")
- `docs/HACS-EVENT-BROKER-GUIDE.md`
- `src/v2/event-broker.js` (`webhookEmitter`)
- `tests/test_event_broker.py`, `tests/test_memory_integration.py` (model patterns)

---

## 0. Document Purpose

This is a **test plan**, not a test implementation. The plan exists to:

1. Translate every goal in `GOALS.md` into one or more concrete, executable test scenarios.
2. Tag each scenario as **runnable now** (Phase A complete) or **blocked on future work** (Phase B+).
3. Record the cleanup contract so the suite never leaks state into production HACS.
4. Identify cross-team dependencies — which tests unblock when Messenger, Ember, or Axiom finish their pieces.
5. Inform implementation order. When `wake_instance` is built, Phase B tests unblock; when permission relay lands, Phase C tests unblock.

When implementation lands for a deferred test, the engineer building it should:
- Lift the scenario block from this document
- Translate into Python following the patterns in `tests/test_event_broker.py`
- Mark the scenario in this doc as `Implemented in <test-file>:<test-name>`

---

## 1. Architecture Under Test (recap)

Each HACS instance can run `claude -r <name> --dangerously-load-development-channels server:hacs-channel`. The MCP subprocess (`src/channel.mjs`) exposes:

| Endpoint | Method | Purpose | Phase |
|----------|--------|---------|-------|
| `POST /broker-event` | HTTP | Event broker delivers HACS message/task/etc. as `<channel>` notification | A — exists |
| `POST /direct-message` | HTTP | Instance-to-instance bypass (fallback layer 2) | A — exists |
| `GET /events` | SSE | Debug stream | A — exists |
| `GET /health` | HTTP | Liveness check | A — exists |
| `POST /pending` | HTTP | Permission relay queue (Telegram approve/deny) | **B — NOT BUILT** |
| `reply` | MCP tool | Routes outbound text via HACS `send_message` | A — exists |

The runtime schema (`runtime.type === "claude-code-channel"`) is documented in `HACS-DEVELOPER-GUIDE.md` lines 1450–1503. Per-instance ports follow the `21000 + N` convention.

**Fallback ladder** (from `GOALS.md`):

| # | Mechanism | Test category |
|---|-----------|---------------|
| 1 | Event broker → channel MCP → Claude turn | Core comms |
| 2 | Direct webhook POST to channel HTTP port | Direct messaging |
| 3 | HACS API polling via `/loop` | Out of scope (own suite) |
| 4 | JSONL transcript tailing | Out of scope (read-only ops) |
| 5 | Telegram | Out of scope (`/telegram` skill suite) |
| 6 | SSH + `claude -r` | Out of scope (manual emergency only) |

This plan covers layers 1, 2, and the lifecycle/permission glue around them.

---

## 2. Goals → Testable Scenarios (cross-reference)

Every goal from `standalone/hacs-channel/docs/GOALS.md` maps to at least one scenario. Goals without a numbered ID in the source doc are referenced by section heading.

| Goal | Scenarios | Phase |
|------|-----------|-------|
| Receive events while active (Core Goal §1) | `CC-01`, `CC-02`, `CC-03`, `MULTI-01` | A |
| Respond through the same channel (Core Goal §2) | `CC-04`, `CC-05`, `MULTI-02` | A |
| Initiate contact (Core Goal §3) | `CC-06`, `PERM-04` | A / C |
| Operate continuously — tmux + systemd (Core Goal §4) | `LIFE-04`, `LIFE-05`, `LIFE-06` | B |
| PM woken by Axiom (Use Case §1) | `LIFE-01`, `LIFE-02`, `MULTI-03` | B |
| Bastion patrolling (Use Case §2) | `LOOP-01`, `LOOP-02` | B (depends on `/loop` skill) |
| Core team talking to Lupo (Use Case §3) | `UI-01`, `PERM-01`, `PERM-02` | C |
| Instance-to-instance mind-to-mind (Use Case §4) | `MULTI-01`, `MULTI-02`, `DIRECT-01`, `DIRECT-02` | A |
| Emergency SSH `claude -r` (Use Case §5) | `LIFE-07`, `FAIL-06` | A (manual) |
| Remote instances on other machines (Use Case §6) | Out of scope (post-containerization) | — |
| Fallback ladder works in isolation (Success Criterion) | `FAIL-01` … `FAIL-08` | A / B |
| New PM onboarding (Success Criterion) | `DOCS-01` (not a code test — manual checklist) | A |

---

## 3. Test Categories (high-level matrix)

Each row is a category. The table summarizes what's runnable today vs blocked.

| Category | # Scenarios | Runnable Phase A | Blocked on Phase B | Blocked on Phase C |
|----------|-------------|------------------|--------------------|--------------------|
| Core comms | 6 | 6 | 0 | 0 |
| Direct messaging | 4 | 4 | 0 | 0 |
| Lifecycle | 7 | 2 | 5 | 0 |
| Permission relay | 4 | 0 | 0 | 4 |
| Failure modes | 8 | 5 | 2 | 1 |
| Multi-instance | 4 | 3 | 1 | 0 |
| Performance / scale | 3 | 2 | 1 | 0 |
| Loop / patrol | 2 | 0 | 2 | 0 |
| Documentation | 1 | 1 (manual) | 0 | 0 |
| **Total** | **39** | **23** | **11** | **5** |

---

## 4. Cleanup Contract

Every test must clean up after itself. The harness is designed so that an aborted test still runs cleanup in a `finally` block.

### Standard fixture lifecycle

```
setup_test_instance()            # bootstrap unique-name HACS instance
    -> bootstrap → returns instanceId
    -> register port allocation in /tmp/hacs-channel-test-ports.lock
    -> launch channel.mjs subprocess on free port
    -> wait for /health to return 200
yield                            # test body runs
teardown_test_instance()         # always runs
    -> kill channel.mjs (SIGTERM, then SIGKILL after 2s)
    -> tmux kill-session if used
    -> release port in lock file
    -> land_instance via HACS API (best effort)
    -> archive any documents created
    -> delete any tasks created
```

### Resource categories that need explicit cleanup

| Resource | How to clean |
|----------|--------------|
| HACS test instance(s) | `land_instance` with apiKey, then verify `get_instance_v2` returns landed |
| HACS messages | Cannot delete; use unique timestamp in subject so they don't pollute searches |
| HACS tasks | `delete_task` with `taskId` (see `test_event_broker.py:751-765`) |
| HACS documents | `archive_document` (see `test_event_broker.py:768-776`) |
| Channel subprocess | Track PID, SIGTERM on teardown |
| tmux session | `tmux kill-session -t <name>` |
| Open ports | Release via lock file; suite uses `21090-21099` range to avoid clashing with prod |
| Subscriptions in event broker | `unsubscribeInstance(instanceId)` if API exists; otherwise rely on `instance.landed` auto-cleanup (see `event-broker.js:707-712`) |
| Pre-approval entries | None for now; if `/pending` adds persistence, must clean |

### Naming conventions

```
INSTANCE_NAME = f"ChanTest-{TIMESTAMP}-{ROLE}"   # e.g. ChanTest-1714000000-Sender
PORT_BASE     = 21090                            # test range, never 21000-21089 (prod)
TMUX_SESSION  = f"chantest-{TIMESTAMP}-{ROLE}"
LOG_FILE      = f"/tmp/chantest-{TIMESTAMP}-{ROLE}.log"
```

Use the timestamp seen in `test_event_broker.py:53` so concurrent suite runs don't collide.

### Cleanup verification

Each test logs the resources it created. The suite prints a leak report at end:

```
Leak report:
  Test instances created: 4
  Test instances landed:  4   ✓
  Channel subprocesses:   4 spawned, 4 reaped ✓
  Tasks created/deleted:  0/0 ✓
  Documents created/archived: 1/1 ✓
  Ports allocated/released: 21090,21091,21092,21093 / all released ✓
```

If any line is mismatched, exit non-zero so CI catches leaks.

---

## 5. Test Scenarios

Each scenario has:
- **What it validates** (goal cross-reference)
- **Phase** (A=now, B=needs wake_instance / systemd, C=needs permission relay)
- **APIs required** (existing vs to-be-built)
- **Setup**, **Action**, **Verification**, **Cleanup**
- **Negative cases** (failure modes the same scenario must exercise)
- **Dependencies** on other team members' work

---

### 5.1 Core Comms (CC-NN)

The primary path: event broker → `/broker-event` → MCP `notifications/claude/channel` → Claude session.

#### CC-01 — Broker event arrives as channel notification

- **Validates:** Core Goal §1 (receive events while active), Success Criterion 1 (receives HACS message via injection, not polling)
- **Phase:** A
- **APIs required:**
  - `POST /broker-event` (exists, `channel.mjs:193`)
  - `mcp.notification` with method `notifications/claude/channel` (exists, `channel.mjs:212`)
  - SSE `/events` for observation (exists)
- **Dependencies:** none (uses raw HTTP, doesn't require the broker actually firing — we POST directly)

**Setup**
1. Bootstrap test instance `ChanTest-{ts}-Recv`.
2. Spawn `channel.mjs` subprocess with `HACS_INSTANCE_ID=<recv-id>`, `CHANNEL_PORT=21090`, `HACS_API_URL=<test-api>`.
3. Connect SSE listener to `http://127.0.0.1:21090/events` to observe broadcasts.
4. Wait for `/health` to return 200 (poll up to 5s).

**Action**
```
POST /broker-event
{
  "event_type": "message.received",
  "id": "msg-123",
  "source": "Ember-75b6",
  "target": "<recv-id>",
  "data": "Hey Crossing, can you check the deploy status?"
}
```

**Verification**
1. HTTP 200 + body `ok`.
2. SSE stream contains a line `[broker] message.received from Ember-75b6` (channel.mjs:226).
3. The MCP notification was emitted. (Phase A workaround: the test cannot directly inspect Claude's context, so we trust the SSE broadcast as a proxy. Phase B: add a test-only debug endpoint `/last-notification` that returns the last `notifications/claude/channel` payload for verification — see TODO at end.)
4. Notification payload includes:
   - `params.content` === the `data` field (string) or stringified JSON
   - `params.meta.event_type === "message.received"`
   - `params.meta.from === "Ember-75b6"`
   - `params.meta.target === <recv-id>`
   - `params.meta.event_id === "msg-123"`
   - `params.meta.origin === "broker"`

**Cleanup**
- Close SSE stream
- Kill channel.mjs subprocess
- `land_instance` test recv

**Negative cases**
- Malformed JSON → expect 400 + body `bad json` (channel.mjs:200)
- Missing `event_type` → still accepted, content broadcast as `[broker] unknown from <source>` (channel.mjs:204)
- Empty `data` → notification still fires with `content === ""` or `content === "null"` — assert no crash
- `target` differs from `INSTANCE_ID` → currently still delivered (channel doesn't gate); flag as future hardening: should it 403?

---

#### CC-02 — Full body intact (no truncation)

- **Validates:** Reliability of the event payload contract
- **Phase:** A
- **APIs required:** same as CC-01

**Setup** — same as CC-01

**Action**
- POST `/broker-event` with `data` containing:
  - 100KB string of repeating ASCII (`"x" * 102400`)
  - Embedded UTF-8 (Japanese, emoji)
  - Embedded JSON-as-string with nested quotes
  - Newlines (`\n`, `\r\n`)
  - Null bytes (`\x00`) — see `test_event_broker.py:537`

**Verification**
- SSE broadcast still appears (truncated to 100 chars by channel — that's expected, see `channel.mjs:226`)
- The MCP notification's `content` field is byte-for-byte equal to the input `data` (no truncation, no escaping artifacts)

**Cleanup** — same as CC-01

**Negative cases**
- 10MB body → channel may run out of memory; document expected behavior. Either succeeds or returns 413/500 cleanly without leaving the listener in a wedged state.
- Content-Type missing — channel ignores it and parses anyway (`channel.mjs:194-202`); assert this still works.

---

#### CC-03 — Reply tool routes through HACS send_message

- **Validates:** Core Goal §2 (respond through the same channel), Success Criterion 2 (Crossing replies to Ember via reply tool — round-trip mind-to-mind)
- **Phase:** A
- **APIs required:**
  - `reply` MCP tool (exists, `channel.mjs:106`)
  - `send_message` HACS API (exists)

**Setup**
1. Bootstrap two test instances: `Sender` and `Recv`.
2. Spawn channel.mjs for `Sender` only (the test invokes `reply` as if Claude would).
3. Configure `HACS_API_URL` to point at the test API.
4. Open a stdio pair to talk to the MCP via JSON-RPC (or have channel.mjs accept tool calls via a test-only HTTP endpoint — currently it doesn't, see TODO).

**Action**
- Invoke MCP `tools/call` with name `reply`, arguments `{ to: "<recv-id>", text: "Round-trip test", subject: "CC-03" }`.

**Verification**
1. Tool call returns `{ content: [{ type: "text", text: "Reply sent to <recv-id>" }] }` (channel.mjs:135).
2. SSE broadcast: `[reply] <sender-id> -> <recv-id>: Round-trip test`.
3. Poll `list_my_messages` on Recv; expect to find a message with subject `CC-03` and body `Round-trip test` from `<sender-id>`.

**Cleanup**
- Land both instances
- Drain Recv's inbox (no API to delete, just leave with timestamp-tagged subject so it's distinguishable)

**Negative cases**
- `to` field missing → tool call returns `isError: true` (current behavior: throws because `req.params.arguments.to` is undefined; the destructure tolerates it but `send_message` fails). Verify graceful error.
- `text` field missing — same.
- HACS API unreachable (set `HACS_API_URL=http://localhost:1`) → tool returns `isError: true` with message `Failed to send reply: <network error>` (channel.mjs:138).
- HACS API returns 500 → tool currently swallows non-2xx because it just calls `response.text()` (channel.mjs:132). **Bug to surface:** add assertion that confirms the test catches this; file a follow-up to error-check the response.

**Dependencies:** none

---

#### CC-04 — Reply with multi-line / unicode body

- **Validates:** Round-trip preservation of message content
- **Phase:** A

**Setup** — same as CC-03

**Action**
- `reply` with `text` containing newlines, unicode, code blocks, 5KB of body.

**Verification**
- Recv's `list_my_messages` returns a message whose body matches input byte-for-byte.

**Cleanup** — same as CC-03

**Negative cases**
- Empty `text` → does HACS reject? Document.
- Extremely long `text` (50KB) — does it succeed?

---

#### CC-05 — Reply uses configured `HACS_API_URL`

- **Validates:** Configuration contract (env var honored, no hardcoding)
- **Phase:** A

**Setup**
1. Spawn channel.mjs with `HACS_API_URL=http://localhost:21199/fake-mcp`
2. Spawn a tiny mock HTTP server on `21199` that records incoming POSTs.

**Action**
- Invoke `reply` tool.

**Verification**
- Mock server received exactly one POST.
- Body is JSON-RPC `tools/call` for `send_message` with correct args.
- Channel's tool response is `Reply sent to ...` (channel doesn't actually verify the upstream succeeded — see CC-03 negative case).

**Cleanup**
- Kill mock server
- Kill channel

**Negative cases**
- Mock returns 500 → channel still returns success (current bug, document).
- Mock returns malformed JSON → channel still returns success because it only reads `response.text()`.

---

#### CC-06 — Initiating contact (channel as outbound, not just inbound)

- **Validates:** Core Goal §3 (initiate contact)
- **Phase:** A

**Setup** — same as CC-03

**Action**
- Without any inbound `/broker-event`, just invoke `reply` to a target instance.

**Verification**
- HACS message arrives at target. This is logically identical to CC-03 but tests the "no inbound first" path: nothing about reply requires a prior event.

**Cleanup** — same as CC-03

---

### 5.2 Direct Messaging (DIRECT-NN)

Fallback layer 2: `POST /direct-message` for instance-to-instance bypass when the broker is offline.

#### DIRECT-01 — Direct message arrives as channel notification

- **Validates:** Fallback layer 2
- **Phase:** A
- **APIs required:** `POST /direct-message` (exists, `channel.mjs:233`)

**Setup** — same as CC-01

**Action**
```
POST /direct-message
{
  "from": "Ember-75b6",
  "text": "Quick question, the broker is down",
  "thread_id": "thread-abc"
}
```

**Verification**
1. HTTP 200, body `{ ok: true, thread_id: "thread-abc" }`.
2. MCP notification fires with `meta.event_type === "direct.message"`, `meta.from === "Ember-75b6"`, `meta.thread_id === "thread-abc"`, `meta.origin === "direct"`.
3. SSE broadcast: `[direct] Ember-75b6 -> <recv>: Quick question...`.

**Cleanup** — same as CC-01

**Negative cases**
- Missing `text` AND `message` → `text` defaults to `""` (channel.mjs:245). Notification still fires with empty content. Document.
- Missing `from` → defaults to `"unknown"` (channel.mjs:244). Notification fires. **Future hardening:** sender allowlist (channel.mjs:248 TODO).
- Missing `thread_id` → channel autogenerates `direct-<timestamp>` (channel.mjs:246). Verify ID is in response.

---

#### DIRECT-02 — Backward-compat field name (`message` instead of `text`)

- **Validates:** API tolerance
- **Phase:** A

**Action**
- POST with `{ from, message: "old-style payload" }` — note `message` not `text`.

**Verification**
- Channel falls back to `body.message` (channel.mjs:245) — payload arrives in notification.

**Cleanup** — same as DIRECT-01

---

#### DIRECT-03 — Sender gating (allowlist) — **PHASE B**

- **Validates:** Security — prevent spoofed direct messages from arbitrary sources
- **Phase:** B (TODO at `channel.mjs:248`)
- **APIs required:**
  - Channel reads an allowlist (env var `CHANNEL_ALLOWLIST` or config file)
  - 403 response when sender not on list

**Setup**
- Spawn channel with `CHANNEL_ALLOWLIST=Ember-75b6,Bastion-99aa`

**Action**
- POST `/direct-message` with `from: "Random-1234"`.

**Verification**
- HTTP 403, no notification fires.

**Cleanup** — same as DIRECT-01

**Negative cases**
- Empty allowlist (env unset) → either deny-all or allow-all? Decide and test.
- Allowlist contains shortname `Ember` not full ID `Ember-75b6` → resolve via HACS `lookup_shortname`?

**Dependencies:** Decision needed from Crossing on allowlist policy.

---

#### DIRECT-04 — Direct message reply path (not via broker)

- **Validates:** When broker is offline, replies still work via direct HTTP
- **Phase:** A (partial) / B (full)

**Setup** — two channel.mjs instances on ports 21090 and 21091

**Action**
- A POSTs `/direct-message` to B → B's Claude (simulated) calls `reply` → reply currently goes through HACS API.

**Verification (Phase A):** reply lands in A's HACS inbox (broker independent).

**Phase B verification:** when broker is offline, reply should fall back to direct POST to A's `/direct-message`. **This requires**: `reply` tool to support a `via: "direct"` option and to know A's port. Not yet built. Document scenario for when implemented.

---

### 5.3 Lifecycle (LIFE-NN)

The wake → channel registers → land → cleanup story.

#### LIFE-01 — Channel starts cleanly with required env

- **Validates:** Cold-start contract
- **Phase:** A

**Setup**
- Pick free port, ensure no stale tmux session.

**Action**
- Spawn `node src/channel.mjs` with `HACS_INSTANCE_ID`, `HACS_API_URL`, `CHANNEL_PORT`, `CHANNEL_BIND` set.

**Verification**
- Process logs `[hacs-channel] Instance <id>, listening on http://127.0.0.1:<port>` (channel.mjs:278) within 3s.
- `GET /health` returns `{ ok: true, instance: <id>, port: <port>, listeners: 0 }`.

**Cleanup** — kill process

**Negative cases**
- `HACS_INSTANCE_ID` unset → defaults to `"unknown"` (channel.mjs:39). Document — should this be a hard error?
- `CHANNEL_PORT` non-numeric → `parseInt` returns NaN → process tries to bind port NaN → crash. **Hardening test**: assert clean error message.
- `CHANNEL_BIND=0.0.0.0` → binds publicly. Document risk; permission to do so should require explicit env override.

---

#### LIFE-02 — `runtime.channelPort` written to preferences on start — **PHASE B**

- **Validates:** Runtime schema contract (`HACS-DEVELOPER-GUIDE.md:1450-1503`)
- **Phase:** B (channel does not currently write to preferences; assumed responsibility of `wake_instance` or `launch_instance`)
- **APIs required:**
  - `wake_instance` extended with `runtime: "claude-code-channel"` mode that sets `runtime.type`, `runtime.channelPort`, `runtime.tmuxSession`, `runtime.launchedAt`, `runtime.launchedBy`, `runtime.enabled = true`.

**Setup**
- Bootstrap test instance.

**Action**
- Call `wake_instance(instanceId, runtime: "claude-code-channel", apiKey: ...)`.

**Verification**
- `get_instance_v2(instanceId)` returns `runtime.type === "claude-code-channel"`, `runtime.channelPort` is a number, `runtime.tmuxSession` is a string, `runtime.enabled === true`.
- `GET http://127.0.0.1:<channelPort>/health` returns 200.

**Cleanup**
- `land_instance` → verify `runtime.enabled === false`, `runtime.landedAt` set (event-broker.js:707-712 unsubscribes the broker).
- Kill tmux session.

**Negative cases**
- Port already in use → `wake_instance` should return error code, not orphan a tmux session. See FAIL-01.
- `HACS_INSTANCE_ID` env disagrees with target → channel logs identity confusion. Document.

**Dependencies:** Axiom (instance home migration), Crossing (wake_instance extension for channel chassis).

---

#### LIFE-03 — `runtime.lastPollAt` updated on broker events — **PHASE B**

- **Validates:** Liveness telemetry
- **Phase:** B
- **APIs required:** Channel writes `lastPollAt` to preferences whenever it receives `/broker-event`.

**Setup** — channel running per LIFE-02

**Action**
- POST `/broker-event` once.

**Verification**
- `get_instance_v2` shows `runtime.lastPollAt` within last 5s.

**Cleanup** — land

**Negative cases**
- HACS API unreachable while writing lastPollAt → channel must not crash; degrade silently.

---

#### LIFE-04 — tmux session survives Claude restart — **PHASE B**

- **Validates:** Operate continuously (Core Goal §4)
- **Phase:** B
- **APIs required:** systemd unit template, tmux orchestration

**Setup**
- `systemctl --user start claude-code@<test-id>` (unit not yet written)

**Action**
- Confirm tmux session exists.
- `systemctl --user restart claude-code@<test-id>`
- Wait 30s.

**Verification**
- Tmux session still exists (or restarts).
- Channel /health on the configured port returns 200.
- `runtime.enabled === true`.

**Cleanup** — `systemctl --user stop` and verify tmux gone.

**Negative cases**
- Channel subprocess exits → unit restarts. Verify backoff (don't thrash).
- Claude binary missing/broken → unit fails cleanly with useful journalctl output.

**Dependencies:** Crossing/Axiom — systemd unit + Unix-user-per-instance migration.

---

#### LIFE-05 — Channel reconnects after machine reboot — **PHASE B**

- **Validates:** Core Goal §4, Success Criterion 5
- **Phase:** B
- **APIs required:** systemd `@reboot` semantics + persisted runtime state

**Setup**
- Use `systemd-run --scope` to simulate, OR run on a dedicated test VM. Test docs note the manual variant for first pass.

**Action**
- Reboot the test VM.

**Verification**
- After boot, channel /health returns 200.
- `runtime.enabled` reflects current state.

**Cleanup** — land.

**Negative cases**
- HACS API unreachable on boot → channel should still come up; broker registration retries with backoff.

**Dependencies:** As LIFE-04. Probably only run during release validation, not every CI run.

---

#### LIFE-06 — `land_instance` cleans up subscription and process — **PHASE B**

- **Validates:** Cleanup invariant
- **Phase:** B (landing the channel chassis is not yet wired to actually shut anything down)
- **APIs required:**
  - `land_instance` extended to: SIGTERM the channel subprocess, kill tmux session, set `runtime.enabled = false`.

**Setup**
- Channel running per LIFE-02.

**Action**
- Call `land_instance(instanceId, targetInstanceId, apiKey)`.

**Verification**
- Subprocess gone.
- Tmux session gone.
- Port released (`ss -tlnp` shows nothing on it).
- Broker auto-unsubscribed (event-broker.js:707-712 — `instance.landed` triggers `broker.unsubscribeInstance`).
- `get_instance_v2` returns `runtime.enabled === false`, `runtime.landedAt` set, `runtime.landedBy` set.

**Cleanup** — already done by the test action; verify no leaks.

**Negative cases**
- Channel subprocess hung → `land_instance` should SIGKILL after timeout (5s).
- Already landed → idempotent, second call returns success without error.

---

#### LIFE-07 — Emergency `claude -r` works without channel — **MANUAL**

- **Validates:** Use Case §5 (Lupo on DigitalOcean recovery console)
- **Phase:** A (already true by design — channel is opt-in)

**Procedure (documented, not automated):**
1. SSH to host as the instance's Unix user.
2. `tmux attach -t <session>` OR `claude -r <name>` standalone.
3. Confirm Claude session works without `--dangerously-load-development-channels`.
4. Confirm HACS API still reachable.

**Note:** This is a "tested by Lupo" scenario. We don't automate, but we record it as validated each release.

---

### 5.4 Permission Relay (PERM-NN) — **PHASE C**

When Claude hits a permission prompt (e.g., `mcp__plugin_playwright_playwright__browser_navigate` requires approval), the channel forwards it to Lupo's Telegram and waits for approve/deny.

**Status:** Not built. The MCP capability `claude/channel/permission` is reserved (channel.mjs:62 TODO). The `/pending` HTTP endpoint does not exist.

#### PERM-01 — Permission prompt routes to Telegram

- **Validates:** Use Case §3, Success Criterion 3
- **Phase:** C
- **APIs required:**
  - `claude/channel/permission` MCP capability — needs Anthropic SDK support for permission interception
  - `POST /pending` to enqueue the prompt
  - Telegram bot integration (existing `/telegram` skill, integrated via `crossing-telegram-send.sh`)
  - `POST /pending/<id>/approve` and `/pending/<id>/deny` endpoints
  - In-memory or sqlite queue with TTL

**Setup**
- Channel running with `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` set.

**Action**
- Trigger a permission-requiring tool call inside the simulated Claude session (or invoke `/pending` directly with the prompt body for unit-level testing).

**Verification**
- Telegram message arrives in Lupo's chat with approve/deny inline keyboard.
- `GET /pending` returns the queued request.
- Click approve in Telegram (or POST `/pending/<id>/approve`).
- Permission tool call resolves → action proceeds.

**Cleanup** — drain `/pending`.

**Negative cases**
- Telegram API down → fall back to: queue stays, eventually times out and denies (configurable: `--auto-deny-after 300s`).
- Approve clicked twice → idempotent.
- Approve from a non-Lupo Telegram chat → reject (verify chat_id allowlist).

**Dependencies:** Anthropic SDK permission API, decision on storage backend.

---

#### PERM-02 — Permission denial blocks the tool call

- **Validates:** Same as PERM-01 but the negative path
- **Phase:** C

**Setup** — same as PERM-01

**Action**
- Trigger a permission prompt; deny via `POST /pending/<id>/deny`.

**Verification**
- The tool call returns an error / cancelled status to Claude.
- Claude session continues without crashing.
- `/pending` no longer contains the request.

**Cleanup** — none

**Negative cases**
- Deny followed by retry of same tool → re-prompts. Verify no permanent block (unless that's a feature).

---

#### PERM-03 — Permission timeout default-denies

- **Validates:** Don't hang Claude forever waiting for approval
- **Phase:** C

**Setup** — channel with `PERMISSION_TIMEOUT_SECONDS=10`

**Action**
- Trigger a permission prompt, do not respond.

**Verification**
- After 10s, prompt resolves as denied.
- Claude session continues.

**Cleanup** — none

---

#### PERM-04 — Pre-approved tool list bypasses Telegram

- **Validates:** Channel doesn't pester Lupo for safe tools (Read, Grep, Bash readonly)
- **Phase:** C
- **APIs required:** `pre_approve` HACS tool (exists) integrated with channel; or env-var allowlist.

**Setup** — channel with `PRE_APPROVED_TOOLS=Read,Grep,Bash:ls,Bash:cat`

**Action**
- Trigger a `Read` permission prompt.

**Verification**
- No Telegram message sent.
- Tool proceeds immediately.

**Cleanup** — none

**Negative cases**
- Pre-approval list contains a tool that doesn't exist → channel logs warning, skips silently.

**Dependencies:** Decision on integration point (env vs HACS API call to `pre_approve`).

---

### 5.5 Failure Modes (FAIL-NN)

Negative-path tests for things that *will* go wrong in production.

#### FAIL-01 — Port conflict on startup

- **Validates:** Reliability — clear error, don't silently misbehave
- **Phase:** A
- **APIs required:** existing channel.mjs

**Setup**
- Already-running process on port 21090 (use `nc -l 21090` in test fixture).

**Action**
- Spawn channel.mjs with `CHANNEL_PORT=21090`.

**Verification**
- Channel process exits non-zero within 5s.
- Stderr contains `EADDRINUSE` or similar diagnostic.
- `wake_instance` (Phase B) surfaces this as a structured error, not a silent hang.

**Cleanup** — kill the netcat blocker, the channel is already dead.

**Negative cases:** N/A — this IS the negative case.

---

#### FAIL-02 — MCP startup failure (stdio not connected)

- **Validates:** Channel detects bad parent and bails
- **Phase:** A

**Setup**
- Spawn channel.mjs with stdin connected to `/dev/null`.

**Action**
- Wait 10s.

**Verification**
- One of:
  - Channel exits cleanly after detecting no stdio peer.
  - Channel logs warning and continues (HTTP listener works) — document which.

**Negative cases**
- Stdin/stdout closed mid-stream after successful handshake → channel should keep HTTP listener alive (graceful degrade) OR exit (decide policy).

---

#### FAIL-03 — Claude auth failure

- **Validates:** Use Case §3 / lifecycle resilience
- **Phase:** B (requires wake_instance)

**Setup**
- Test VM with no `~/.claude/credentials.json`.

**Action**
- `wake_instance(instanceId, runtime: "claude-code-channel", ...)`.

**Verification**
- `wake_instance` returns structured error like `{ success: false, error: { code: "CLAUDE_AUTH_MISSING", message: "..." } }`.
- No tmux session left orphan.
- `runtime.enabled` stays false.

**Cleanup** — none needed.

**Negative cases**
- Credentials present but expired → similar error, distinct code (`CLAUDE_AUTH_EXPIRED`).

**Dependencies:** Anthropic auth flow stability.

---

#### FAIL-04 — Broker offline (channel still serves direct messages)

- **Validates:** Fallback layer 2 works when layer 1 down
- **Phase:** A

**Setup**
- Channel running normally.
- Broker not actually firing events at it (we just don't POST to /broker-event).

**Action**
- POST `/direct-message` from a peer instance.

**Verification**
- Notification still fires (channel doesn't depend on broker for /direct-message). Identical to DIRECT-01.

**Cleanup** — same as DIRECT-01

---

#### FAIL-05 — HACS API unreachable on reply

- **Validates:** Reply tool degrades gracefully
- **Phase:** A
- **APIs required:** existing reply tool

**Setup**
- Spawn channel with `HACS_API_URL=http://localhost:1` (closed port).

**Action**
- Invoke `reply` MCP tool.

**Verification**
- Tool returns `{ isError: true, content: [{ text: "Failed to send reply: ..." }] }` (channel.mjs:139).
- Channel does not crash.

**Cleanup** — kill channel.

**Negative cases**
- HACS API hangs (no response) → reply blocks until fetch timeout. Verify no infinite hang. **Action item:** add `AbortSignal.timeout(15000)` to the fetch in `channel.mjs:127` — currently no timeout (bug).

---

#### FAIL-06 — Channel crash mid-event (recovery)

- **Validates:** Crash safety
- **Phase:** A (test) / B (recovery via systemd)

**Setup**
- Channel running, mid-process of broker event.

**Action**
- `kill -9 <pid>` while POST /broker-event is in flight.

**Verification (Phase A):** caller sees connection drop / 5xx. No corrupted state in HACS.

**Verification (Phase B):** systemd restarts within 5s. Next /broker-event delivered cleanly.

**Cleanup** — none.

---

#### FAIL-07 — Malformed broker event payload

- **Validates:** Don't trust broker output
- **Phase:** A

**Setup** — channel running

**Action(s)** — issue each in turn:
1. POST `/broker-event` with body `not json`
2. POST with empty body
3. POST with deeply nested JSON (10 levels deep)
4. POST with `data` as `null`
5. POST with `event_type` containing newlines / control characters

**Verification**
- Cases 1-2: HTTP 400 + body `bad json`.
- Cases 3-5: 200, channel processes safely, no crash.

**Cleanup** — none.

---

#### FAIL-08 — SSE listener leak

- **Validates:** Resource cleanup on client disconnect
- **Phase:** A

**Setup** — channel running.

**Action**
- Connect 100 SSE clients in parallel, all immediately disconnect.

**Verification**
- `GET /health` returns `listeners: 0` after a brief settle (channel.mjs:176 removes on close).
- Channel memory usage doesn't grow unbounded.

**Cleanup** — none.

---

### 5.6 Multi-Instance (MULTI-NN)

Two or more channel-enabled instances exchange messages without a human in the loop.

#### MULTI-01 — A and B exchange a single round-trip

- **Validates:** Use Case §4 (mind-to-mind), Success Criterion 1+2
- **Phase:** A

**Setup**
- Bootstrap A (`ChanTest-{ts}-A`) and B (`ChanTest-{ts}-B`).
- Spawn channel.mjs for each on ports 21090 and 21091.

**Action**
1. POST `/broker-event` to A's channel: `{ event_type: "message.received", source: B-id, target: A-id, data: "ping" }`.
2. Simulate A's Claude calling `reply { to: B-id, text: "pong" }`.

**Verification**
- B's HACS inbox contains the `pong` message.
- (Optional, when broker fully wired) Posting via `send_message` API actually fires `/broker-event` to B's channel automatically.

**Cleanup** — land both, kill both channels.

**Negative cases**
- B's channel down (port closed) → broker delivery to B fails; A's reply still lands in B's HACS inbox via API. (Channel is one delivery path among many.)

**Dependencies:** Messenger's broker auto-subscription. Currently the test simulates the broker by POSTing directly to /broker-event.

---

#### MULTI-02 — Reply round-trip across two channels

- **Validates:** Same as MULTI-01 but full bidirectional flow
- **Phase:** A (manual broker simulation) / B (with auto broker subscription)

**Setup** — same as MULTI-01

**Action**
- A → B "are you up?"
- B → A "yes, what's up?"
- A → B "great, here's the request"

**Verification**
- All three messages land in the correct HACS inboxes.
- `thread_id` (if used) is consistent across the conversation.

**Cleanup** — same as MULTI-01

---

#### MULTI-03 — Axiom wakes a PM with channel chassis — **PHASE B**

- **Validates:** Use Case §1 (PM woken by Axiom)
- **Phase:** B
- **APIs required:** `wake_instance(runtime: "claude-code-channel", project: <pid>, ...)`

**Setup**
- Test project bootstrapped.

**Action**
- Axiom-style call: `wake_instance({ name: "ChanTest-PM", runtime: "claude-code-channel", project: <pid>, apiKey })`.

**Verification**
- New instance has `runtime.type === "claude-code-channel"`.
- Channel /health responds.
- Inbox events from team members route into the channel.
- PM can `reply` to team.

**Cleanup** — land PM.

**Dependencies:** Axiom's wake_instance extension.

---

#### MULTI-04 — 3-way conversation thread

- **Validates:** Multi-instance fan-out
- **Phase:** A

**Setup** — A, B, C each with channel.

**Action**
- A POSTs to broker; broker fans out to B and C; B and C both reply to A.

**Verification**
- A's inbox has both replies.
- No cross-talk (B doesn't see C's reply unless C explicitly addresses B).

**Cleanup** — land all three.

---

### 5.7 Performance / Scale (PERF-NN)

#### PERF-01 — 100 events/second sustained

- **Validates:** Channel doesn't fall over under load
- **Phase:** A

**Setup** — single channel.

**Action**
- Drive `POST /broker-event` at 100 req/s for 60s using `wrk` or a Python asyncio loop. Use small (1KB) payloads.

**Verification**
- All 6000 requests return 200.
- No memory leak (RSS stable after 60s).
- Final `/health` succeeds.
- (Phase B) channel emits all 6000 MCP notifications. Use a debug endpoint to count.

**Cleanup** — kill channel.

**Negative cases**
- 1000 req/s → expected to degrade. Document where it falls over (e.g., dropping requests vs. queueing).

---

#### PERF-02 — 10 simultaneous channels on one host

- **Validates:** Per-instance isolation, port-allocation convention works
- **Phase:** A (Phase B for production readiness)

**Setup**
- Bootstrap 10 instances. Spawn 10 channels on ports 21090-21099.

**Action**
- POST one event to each channel.

**Verification**
- All 10 deliver correctly. No cross-talk.
- `/health` on each returns its own instance ID.
- Total RSS across all 10 < 500MB.

**Cleanup** — land all, kill all subprocesses, release all ports.

**Negative cases**
- Two channels with same port → second errors per FAIL-01.
- Same INSTANCE_ID across two channels → each runs, document. Future: detect and refuse.

---

#### PERF-03 — Replay storm: 1000 events queued during downtime — **PHASE B**

- **Validates:** Catch-up after channel restart
- **Phase:** B (requires broker queueing replay events)

**Setup**
- Bring channel up, then down.

**Action**
- While channel down, broker accumulates 1000 events. Restart channel.

**Verification**
- Channel processes the backlog in < 30s without dropping.
- (Or, if the design says "events during downtime are lost", verify that's the documented behavior.)

**Cleanup** — kill channel.

**Dependencies:** Broker design decision — does it queue or drop? Currently: webhookEmitter is best-effort (event-broker.js:480-506).

---

### 5.8 Loop / Patrol (LOOP-NN) — **PHASE B**

Bastion's heartbeat usage pattern.

#### LOOP-01 — `/loop` triggers self-pinging cron — **PHASE B**

- **Validates:** Use Case §2 (Bastion patrolling)
- **Phase:** B (requires `/loop` skill integration with channel)

**Setup**
- Bastion-style instance with `/loop` configured to fire every 1m (test override).

**Action**
- Wait 3 minutes.

**Verification**
- Channel receives 3 cron-origin events.
- `runtime.lastPollAt` updated each time.

**Cleanup** — land instance.

**Dependencies:** `/loop` skill design (currently in `~/.claude/skills/loop/SKILL.md`).

---

#### LOOP-02 — Health check anomaly triggers Telegram — **PHASE C**

- **Validates:** Use Case §2 + permission relay
- **Phase:** C

**Setup** — Bastion-style channel + Telegram bot.

**Action**
- Inject a fake "anomaly" event: high CPU, suspicious IP.

**Verification**
- Telegram message lands.
- Optional: linked approve/deny for action (e.g., kill process).

**Cleanup** — none.

---

### 5.9 Documentation (DOCS-NN)

#### DOCS-01 — New PM onboarding checklist (manual)

- **Validates:** Success Criterion 7 (documentation a new PM can follow)
- **Phase:** A

**Procedure (manual, run by a fresh-eyes person):**
1. Read `standalone/hacs-channel/README.md`.
2. Follow the install instructions.
3. Get a working channel running on a chosen port.
4. Send a test event with `curl`.
5. Reply via the MCP `reply` tool.
6. Land cleanly.

**Pass criterion:** Fresh-eyes person hits zero blockers documented as "we'll get to that". Every step works as written, or the doc is corrected.

---

## 6. Cross-Team Dependencies

### 6.1 On Messenger (event broker)

- **Auto-subscription on instance launch.** When `wake_instance(runtime: "claude-code-channel")` runs, broker should auto-subscribe the instance to `message.received`, `task.assigned`, etc., delivering to `http://127.0.0.1:<channelPort>/broker-event` via `webhookEmitter` (event-broker.js:480-506).
  - **Blocks:** MULTI-01 full automation, MULTI-03, LIFE-02
  - **Workaround:** tests POST directly to /broker-event to simulate.
- **Auto-unsubscribe on `instance.landed`.** Already implemented (event-broker.js:707-712). Verify in LIFE-06.
- **Decision:** does broker queue events for offline channels? Affects PERF-03.
- **`unsubscribeInstance(instanceId)` helper exposed via MCP API?** Useful for test cleanup; currently internal.

### 6.2 On Ember (UI)

- **Cairn web UI chat panel.** Depends on `runtime.channelPort` being readable from `get_instance_v2`. Schema is documented (`HACS-DEVELOPER-GUIDE.md:1494-1503`).
  - **Blocks:** UI-01 (not in this plan; will be in Ember's UI test suite).
  - **Contract for Ember to test against:** UI POSTs to `http://localhost:<channelPort>/direct-message`. Channel returns `{ ok: true, thread_id }`.
- **Runtime badge ("channel" indicator).** UI reads `runtime.type === "claude-code-channel"`. Verify Ember's implementation in their UI tests.

### 6.3 On Axiom (instance home migration)

- **Per-instance Unix user.** Depends on Axiom's home migration. Lifecycle tests (LIFE-04, LIFE-05) assume Unix-user-per-instance for systemd `claude-code@<id>.service` units.
  - **Blocks:** LIFE-04, LIFE-05.
  - **Workaround for early tests:** run all channels under the test runner's UID. Document that production uses dedicated users.

### 6.4 On Crossing (this team)

- `wake_instance` chassis extension (`runtime: "claude-code-channel"`).
- systemd unit template.
- Permission relay design (PERM-01 through PERM-04).
- Sender allowlist for `/direct-message` (DIRECT-03).

---

## 7. What We Are NOT Testing (explicit non-goals)

These are deliberately out of scope for this suite. If a regression appears in one of these areas, file a bug against the appropriate component's test suite, not this one.

| Out of scope | Reason | Where it IS tested |
|--------------|--------|--------------------|
| HACS event broker internal correctness | Owned by Messenger | `tests/test_event_broker.py` |
| HACS messaging API correctness | Foundation API | `tests/test_messaging.py` |
| Semantic memory indexing | Separate feature | `tests/test_memory_integration.py` |
| Claude Code itself (core CLI bugs) | Anthropic | upstream |
| `--dangerously-load-development-channels` flag | Anthropic | upstream |
| MCP SDK correctness | Anthropic | `@modelcontextprotocol/sdk` repo |
| OpenFang chassis | Different chassis entirely | OpenFang test suite |
| Zeroclaw chassis | Legacy, migrating away | n/a |
| Plugin marketplace publishing | 6-12 months out (GOALS Non-goals) | n/a |
| Remote instances on other machines | Post-containerization (GOALS Non-goals) | n/a |
| Replacing wake/continue entirely | Complement, don't replace (GOALS Non-goals) | n/a |
| Telegram bot itself | Separate concern (`/telegram` skill) | tests for `crossing-telegram-send.sh` |
| `tmux send-keys` / pane scraping | "fragile as a fucked fish" — explicitly rejected (GOALS) | nothing |
| Cairn web UI | Owned by Ember | Ember's UI tests |
| Performance > 1000 req/s | Far past current need; revisit when a real instance exceeds 100/s | n/a |
| Multi-host channel mesh | Post-containerization | n/a |
| End-to-end encryption of `/direct-message` payloads | Local-bind (`127.0.0.1`) is the threat model boundary | n/a |
| Channel as a generic webhook receiver | Channel is HACS-specific by design | n/a |
| Replacement for HACS API polling | Polling is fallback layer 3, separate suite | n/a |

---

## 8. Test File Layout (when implemented)

Following `tests/test_event_broker.py` patterns:

```
standalone/hacs-channel/test/
├── TEST-PLAN.md              ← this document
├── launch-test-instance.sh   ← interactive smoke launcher (exists)
├── conftest.py               ← shared fixtures: instance bootstrap, channel spawn, port lock
├── test_core_comms.py        ← CC-01 .. CC-06
├── test_direct_messaging.py  ← DIRECT-01 .. DIRECT-04
├── test_lifecycle.py         ← LIFE-01 .. LIFE-07 (skip Phase B/C for now)
├── test_failure_modes.py     ← FAIL-01 .. FAIL-08
├── test_multi_instance.py    ← MULTI-01 .. MULTI-04
├── test_perf.py              ← PERF-01 .. PERF-03 (slow, gated by env var)
├── test_permission_relay.py  ← PERM-01 .. PERM-04 (Phase C, all skip for now)
├── test_loop_patrol.py       ← LOOP-01 .. LOOP-02 (Phase B/C, all skip for now)
├── helpers/
│   ├── channel_fixture.py    ← spawn / kill channel.mjs subprocess
│   ├── port_lock.py          ← /tmp/hacs-channel-test-ports.lock allocator
│   ├── mock_hacs_api.py      ← lightweight stand-in for FAIL-05, CC-05
│   ├── sse_client.py         ← stream /events for assertions
│   └── jsonrpc.py            ← reuse pattern from tests/test_event_broker.py:71
└── fixtures/
    └── sample_events.json    ← canonical event bodies for replay
```

### Recommended language

Python 3 + `requests` (matches existing suites), with `node` subprocess for spawning channel.mjs. Avoid testing Node code from Node — keeping the runner uniform with the rest of the foundation suite is more valuable than language match.

### Useful test helpers to build first

1. **`channel_fixture.py`** — `spawn_channel(instance_id, port=None) -> ChannelHandle` with auto-cleanup on context exit. Models pytest fixture pattern.
2. **`port_lock.py`** — flock-based allocator over `/tmp/hacs-channel-test-ports.lock`, range `21090-21099`. Each test acquires + releases.
3. **`mock_hacs_api.py`** — tiny `http.server.HTTPServer` that records POSTs. Unblocks CC-05, FAIL-05, and many MCP tool tests without touching prod HACS.
4. **`sse_client.py`** — block-on-line consumer of `/events` for verification, with a 2s default timeout.

These four helpers unblock all 23 Phase A scenarios.

---

## 9. Test Execution Strategy

### Local development

```bash
cd standalone/hacs-channel
npm install
npm test                          # node --test test/  (when impl exists)
# OR (preferred, matches foundation pattern):
python3 -m pytest test/ -v
```

### CI gating

| Phase | Gate | Suite |
|-------|------|-------|
| Pre-merge to `v2-foundation-dev` | Phase A only (~23 scenarios, ~2 min) | `pytest test/ -m 'not slow and not phase_b and not phase_c'` |
| Pre-merge to `main` | Phase A + integration smoke | `pytest test/ -m 'not phase_c'` |
| Nightly | Full Phase A + B + perf | `pytest test/` |
| Manual / release | Phase C, manual lifecycle, multi-host | tagged scenarios in this doc |

Tests that need real HACS API hit `https://smoothcurves.nexus/mcp` (matches `test_event_broker.py:51`). For CI hermetic mode, point at `mock_hacs_api.py`.

### Skip markers

```python
import pytest
pytestmark_phase_b = pytest.mark.skipif(
    not os.environ.get("HACS_CHANNEL_PHASE_B"),
    reason="Phase B (wake_instance + systemd) not yet implemented"
)
pytestmark_phase_c = pytest.mark.skipif(
    not os.environ.get("HACS_CHANNEL_PHASE_C"),
    reason="Phase C (permission relay) not yet implemented"
)
```

When a phase lands, flip the env var in CI and the relevant tests start running.

---

## 10. Known Bugs / Hardening Opportunities Surfaced by Plan

Writing this plan surfaced several issues that the implementation work should address. Filed here for traceability:

| ID | File:Line | Issue | Surfaced by |
|----|-----------|-------|-------------|
| H-01 | `channel.mjs:127` | `fetch` for reply has no timeout — can hang indefinitely | FAIL-05 |
| H-02 | `channel.mjs:132` | Reply tool ignores HACS API non-2xx responses, returns success regardless | CC-03, CC-05 |
| H-03 | `channel.mjs:206` | Channel does not validate `target` matches `INSTANCE_ID` — accepts events for other instances | CC-01 negative |
| H-04 | `channel.mjs:248` | TODO: sender allowlist on /direct-message — currently any source accepted | DIRECT-03 |
| H-05 | `channel.mjs:39` | `HACS_INSTANCE_ID` defaults to `"unknown"` — should this fail-fast? | LIFE-01 negative |
| H-06 | `channel.mjs:41` | `parseInt(CHANNEL_PORT)` of garbage value silently produces NaN | LIFE-01 negative |
| H-07 | `channel.mjs` | No debug endpoint to introspect last MCP notification — testing relies on SSE proxy | CC-01 verification |
| H-08 | `channel.mjs` | No persistence of `runtime.channelPort` / `runtime.lastPollAt` to preferences | LIFE-02, LIFE-03 |
| H-09 | n/a | `/pending` endpoint not built; permission MCP capability stubbed | PERM-01..04 |
| H-10 | n/a | No systemd unit template; no per-instance Unix user | LIFE-04, LIFE-05 |

Each is referenced in the scenario that surfaces it. Fix order should follow phase order (H-01..H-08 are Phase A; H-09 is Phase C; H-10 is Phase B).

---

## 11. Living Document Conventions

When you (future engineer) implement a scenario:

1. Find its block above.
2. Translate to Python, following `tests/test_event_broker.py` patterns:
   - JSON-RPC helper with normalized response shape
   - `assert_success` / `assert_failure`
   - TestRunner with pass/fail/skip tracking
   - Resource tracking + final cleanup section
3. Mark the scenario block: `> Implemented in `test_core_comms.py::test_cc_01_broker_event_arrives` as of <date>`
4. If you find that the scenario's assumptions were wrong, update this doc in the same PR. The plan and the code stay in sync.

When a new goal is added to `GOALS.md`:

1. Add a row to the goals-to-scenarios cross-reference (§2).
2. Add a new scenario block in the appropriate category (§5).
3. Update the count in §3's matrix.

When a hardening item is fixed:

1. Mark H-NN as resolved with the fix's PR/commit.
2. Move the affected scenario from "negative — current bug" to "negative — verified hardened".

---

## 12. Open Questions for Crossing-2d23 / Lupo / Team

Things this plan deliberately leaves undecided. Each blocks a specific scenario.

1. **Sender allowlist for /direct-message** (DIRECT-03): env-var only, or HACS-aware via `lookup_shortname`? Default-allow or default-deny?
2. **Replay-on-restart semantics** (PERF-03): broker queues, or events during downtime are lost?
3. **Multiple INSTANCE_IDs on same host** (PERF-02 negative): refuse, or warn + allow?
4. **Permission timeout default** (PERM-03): 5min (lots of slack) or 30s (snappy default-deny)?
5. **Pre-approval mechanism** (PERM-04): env var, HACS `pre_approve` integration, or both?
6. **`CHANNEL_BIND=0.0.0.0`** (LIFE-01): allow with warning, or hard-refuse and require explicit opt-in env?
7. **Channel writes to preferences** (LIFE-02, LIFE-03): direct file write, or HTTP call to `update_instance`?
8. **Test API endpoint**: dedicated test deploy (e.g., `https://test.smoothcurves.nexus/mcp`), or share prod with timestamped names?

Resolving these unblocks the corresponding scenarios for implementation.

---

*End of test plan. Last updated: 2026-04-24 by Crossing-2d23.*
