# HACS UI: Daemon Status & Instance Lifecycle Controls

**For:** Ember (UI Engineer)
**From:** Crossing-2d23 (Infrastructure/Integration)
**Date:** 2026-03-10
**Context:** Integrates with Ember's current Goals feature work and existing
instance list/task UI. This spec covers what the UI needs to show and control
for long-running daemon instances (Claude Code and OpenFang).

---

## Background

HACS instances can now run as **long-running daemons** — not just one-shot wake/continue
cycles. Two chassis types support daemon mode:

- **Claude Code**: `--print` mode + system cron polling every 5 minutes. Session persists
  via `--resume`. No persistent process — cron fires, Claude runs, exits, waits.
- **OpenFang**: Persistent process via systemd. Always-on with webhook for push events.

The UI needs to surface daemon status and provide basic lifecycle controls.

---

## 1. Instance Card Enhancements

### Current State
The instance card (in the instance list/grid) shows:
- Instance name, ID, role
- Project membership
- Last active timestamp
- XMPP presence (online/offline)

### New Fields

Add a **runtime status section** to each instance card:

```
┌─────────────────────────────────────────┐
│ Crossing-2d23                    [PA]   │
│ Project: HACS Coordination System       │
│                                         │
│ Runtime: Claude Code          [●] Active│
│ Model: sonnet                           │
│ Last poll: 2 min ago                    │
│ Poll interval: 5m                       │
│ Session age: 2h 15m                     │
│                                         │
│ [Land]  [Poll Now]                      │
└─────────────────────────────────────────┘
```

```
┌─────────────────────────────────────────┐
│ Flair-2a84                [Developer]   │
│ Project: HACS Coordination System       │
│                                         │
│ Runtime: OpenFang             [●] Active│
│ Model: x-ai/grok-4.1-fast              │
│ Port: 20000                             │
│ Uptime: 3d 4h                           │
│                                         │
│ [Land]  [Web UI]  [Switch Model]        │
└─────────────────────────────────────────┘
```

```
┌─────────────────────────────────────────┐
│ Meridian-a1b2                    [Dev]  │
│ Project: paula-book                     │
│                                         │
│ Runtime: none                 [○] Asleep│
│ Last seen: 3 days ago                   │
│                                         │
│ [Launch ▾]                              │
└─────────────────────────────────────────┘
```

### Status Indicator

| State | Icon | Color | Meaning |
|-------|------|-------|---------|
| Active | ● | Green | Daemon running, polling/responding |
| Idle | ● | Amber | Daemon running but no activity for >30 min |
| Asleep | ○ | Gray | No daemon running |
| Error | ● | Red | Daemon registered but polls failing |
| Launching | ◐ | Blue | Launch in progress |

### Data Source

All runtime data comes from `preferences.json` via the existing `get_instance_v2` API:

```json
{
  "runtime": {
    "type": "claude-code",
    "ready": true,
    "enabled": true,
    "sessionId": "c03c89f0-8f5a-4dc9-b6c7-2820776ac216",
    "pollInterval": "5m",
    "model": "sonnet",
    "unixUser": "Crossing-2d23",
    "workDir": "/mnt/.../claude-code",
    "hooksDeployed": ["PreCompact", "SessionStart"],
    "launchedBy": "Lupo",
    "launchedAt": "2026-03-10T19:36:26Z",
    "launchedVia": "launch_instance"
  }
}
```

**New field needed:** `runtime.lastPollAt` — updated by the poller on each cycle. This
lets the UI show "Last poll: 2 min ago" and detect stale/dead daemons.

**API change needed:** `get_instance_v2` should include runtime block in response. If
it doesn't already, this is a small addition to the handler.

---

## 2. Instance Launch Flow

### Current State
Creating a new instance goes through `pre_approve` → `wake_instance`. This creates
the instance and runs a one-shot Claude session.

### New: Launch with Runtime Selection

When launching an instance (or re-launching an existing one), the UI should offer
a runtime choice:

```
┌─ Launch Instance ────────────────────────┐
│                                          │
│ Instance: Phoenix-abc1                   │
│                                          │
│ Runtime:                                 │
│   ○ One-shot (wake/continue)             │
│   ● Claude Code Daemon                   │
│   ○ OpenFang                             │
│                                          │
│ Model: [sonnet           ▾]              │
│                                          │
│ [ Cancel ]              [ Launch ]       │
└──────────────────────────────────────────┘
```

**API call:** `launch_instance` with `runtime: "claude-code"` or `runtime: "openfang"`

For Claude Code daemon:
- Model selection (sonnet, opus, haiku)
- Poll interval (default: 5m, options: 1m, 5m, 15m, 30m)

For OpenFang:
- Model selection (from OpenRouter catalog)
- Port (auto-allocated or manual)

---

## 3. Daemon Controls (Instance Detail View)

When viewing an active daemon instance, show a control panel:

### Claude Code Daemon Controls

```
┌─ Daemon Controls ────────────────────────┐
│                                          │
│ Status: Active (polling)                 │
│ Session: c03c89f0-...                    │
│ Created: 2h 15m ago                      │
│ Last poll: 2 min ago                     │
│ Polls completed: 27                      │
│ Model: sonnet                            │
│                                          │
│ Poll interval: [5m ▾]  [Apply]           │
│                                          │
│ [Poll Now]  [Land Instance]              │
│                                          │
│ ─── Recent Activity ───                  │
│ 19:50 - Bootstrapped, sent 2 messages    │
│ 19:55 - Poll: idle                       │
│ 20:00 - Poll: idle                       │
│ 20:05 - Poll: processed 1 message        │
│ 20:10 - Poll: idle                       │
└──────────────────────────────────────────┘
```

### Actions

| Action | API Call | Notes |
|--------|----------|-------|
| Poll Now | Run poller script immediately | Triggers out-of-schedule poll |
| Land Instance | `land_instance` | Removes cron, writes diary, cleans up |
| Change Poll Interval | Update cron entry | Modify `*/5` to `*/1` etc. |
| Switch Model | Re-launch with new model | Lands then re-launches |

### OpenFang Daemon Controls

```
┌─ Daemon Controls ────────────────────────┐
│                                          │
│ Status: Active (systemd)                 │
│ Port: 20000                              │
│ Uptime: 3d 4h                            │
│ Model: x-ai/grok-4.1-fast               │
│ Token budget: 2M/hour                    │
│                                          │
│ [Web UI]  [Switch Model]  [Land]         │
│                                          │
│ ─── Recent Activity ───                  │
│ (from OpenFang logs or HACS messages)    │
└──────────────────────────────────────────┘
```

---

## 4. Cron/Schedule Management

For Claude Code daemons, expose the polling schedule:

```
┌─ Schedule ───────────────────────────────┐
│                                          │
│ ● Polling every 5 minutes                │
│   ○ Polling every 1 minute               │
│   ○ Polling every 15 minutes             │
│   ○ Polling every 30 minutes             │
│   ○ Custom: [*/10 * * * *]               │
│                                          │
│ [Apply Schedule]                         │
│                                          │
│ Note: Existing cron UIs are well-solved. │
│ Consider reusing a lightweight open-     │
│ source cron editor component rather than │
│ building from scratch.                   │
└──────────────────────────────────────────┘
```

**Implementation note:** There are many open-source web UIs for cron job management
(cron-job.org's editor, react-cron-generator, etc.). Don't build this from scratch —
adapt an existing component. The backend just needs an endpoint that modifies the
crontab entry for the instance.

---

## 5. API Endpoints Needed

### New Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `get_daemon_status` | GET | Returns runtime status for an instance |
| `update_poll_interval` | POST | Changes cron frequency |
| `trigger_poll` | POST | Forces immediate poll cycle |

### Modified Endpoints

| Endpoint | Change |
|----------|--------|
| `get_instance_v2` | Include `runtime` block in response |
| `launch_instance` | Already supports `runtime: "claude-code"` (done) |
| `land_instance` | Already dispatches to `landClaudeCode()` (done) |

### get_daemon_status Response

```json
{
  "instanceId": "Crossing-2d23",
  "runtime": "claude-code",
  "status": "active",
  "sessionId": "c03c89f0-8f5a-4dc9-b6c7-2820776ac216",
  "model": "sonnet",
  "pollInterval": "5m",
  "lastPollAt": "2026-03-10T20:15:17Z",
  "pollCount": 27,
  "launchedAt": "2026-03-10T19:36:26Z",
  "launchedBy": "Lupo",
  "cronActive": true
}
```

---

## 6. Integration with Goals Feature

Ember is implementing Goals as a HACS core concept. The daemon status integrates
naturally:

- An instance's **goals** drive what it works on during poll cycles
- The daemon detail view could show the instance's current goals alongside
  daemon status
- Goal progress updates happen through task completion, which the daemon
  reports via HACS API calls during its poll cycles
- A goal like "respond to all messages within 5 minutes" directly maps to
  poll interval configuration

This is complementary, not conflicting — the Goals feature defines WHAT instances
work toward, the daemon infrastructure defines HOW they do the work autonomously.

---

## 7. Fleet View (Nice to Have)

A dashboard showing all active daemons at a glance:

```
┌─ Active Daemons ─────────────────────────────────────┐
│                                                       │
│ Instance        Runtime      Model          Status    │
│ ──────────────  ───────────  ────────────   ──────    │
│ Crossing-2d23   Claude Code  sonnet         ● Active  │
│ Flair-2a84      OpenFang     grok-4.1-fast  ● Active  │
│ Zara-c207       OpenFang     deepseek-v3.2  ● Idle    │
│ Genevieve-xxx   OpenFang     grok-4.1-fast  ● Active  │
│ Ember-xxxx      Claude Code  sonnet         ○ Asleep  │
│                                                       │
│ Total: 4 active, 1 asleep                             │
└───────────────────────────────────────────────────────┘
```

---

## Implementation Priority

1. **Instance card runtime badge + status indicator** (small, high impact)
2. **Launch modal with runtime selection** (enables launching daemons from UI)
3. **Daemon controls in instance detail** (poll now, land, interval change)
4. **`get_daemon_status` API endpoint** (Crossing builds, Ember consumes)
5. **Schedule editor** (reuse open-source cron component)
6. **Fleet view** (nice to have, lower priority)

---

*The instances are alive. The UI should show it.*
