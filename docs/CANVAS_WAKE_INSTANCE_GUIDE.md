# Wake Instance UI Guide for Canvas

**Author:** Bridge
**Date:** 2025-12-17
**Purpose:** Guide for building the Wake Instance UI

---

## Overview

The Wake Instance system allows authorized users to spawn new Claude Code instances programmatically. Each woken instance:
- Gets its own isolated working directory
- Connects to the coordination system
- Can communicate via XMPP messaging
- Runs in a tmux session (can be attached interactively)

---

## The Three APIs

### 1. `get_wake_scripts` - List Available Wake Methods

**Use this to populate a dropdown of available wake scripts.**

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "get_wake_scripts",
    "arguments": {
      "instanceId": "your-instance-id"
    }
  }
}
```

**Response:**
```json
{
  "success": true,
  "scripts": [
    {
      "name": "claude-code-tmux",
      "description": "Wake Claude Code in tmux session on local server",
      "enabled": true,
      "isDefault": true
    }
  ],
  "defaultScript": "claude-code-tmux",
  "version": "1.1.0"
}
```

### 2. `preApprove` - Create Instance Configuration (Required First!)

**Before waking, you must pre-approve the instance. This creates the instance's configuration.**

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "pre_approve",
    "arguments": {
      "instanceId": "caller-instance-id",
      "name": "Alice",
      "role": "PM",
      "personality": "Phoenix",
      "project": "web-scraper",
      "instructions": "You are a PM for the web-scraper project. Bootstrap, read your role documents, create the project plan, then wake your team."
    }
  }
}
```

**Response:**
```json
{
  "success": true,
  "newInstanceId": "Alice-7f3a",
  "message": "Instance pre-approved and ready to wake",
  "wakeInstructions": "Call wake_instance({ targetInstanceId: 'Alice-7f3a' })"
}
```

**Key Parameters for preApprove:**
| Parameter | Required | Description |
|-----------|----------|-------------|
| `instanceId` | Yes | Your (caller's) instance ID for auth |
| `name` | Yes | Friendly name for new instance |
| `role` | No | Role to assign (PM, Developer, etc.) |
| `personality` | No | Personality to adopt (Phoenix, etc.) |
| `project` | No | Project to join |
| `instructions` | No | Custom instructions for the instance |

### 3. `wake_instance` - Actually Spawn the Instance

**After preApprove, wake the instance:**

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "wake_instance",
    "arguments": {
      "instanceId": "caller-instance-id",
      "targetInstanceId": "Alice-7f3a",
      "scriptName": "claude-code-tmux",
      "workingDirectory": "/mnt/coordinaton_mcp_data/instances/Alice-7f3a"
    }
  }
}
```

**Response:**
```json
{
  "success": true,
  "jobId": "wake-1702840000000-a1b2",
  "pid": 12345,
  "logPath": "/mnt/coordinaton_mcp_data/v2-dev-data/wake-logs/wake-1702840000000-a1b2.log",
  "targetInstanceId": "Alice-7f3a",
  "scriptName": "claude-code-tmux",
  "message": "Wake script started for Alice-7f3a"
}
```

**Key Parameters for wake_instance:**
| Parameter | Required | Description |
|-----------|----------|-------------|
| `instanceId` | Yes | Your (caller's) instance ID for auth |
| `targetInstanceId` | Yes | The pre-approved instance ID to wake |
| `scriptName` | No | Script from manifest (default: "claude-code-tmux") |
| `workingDirectory` | No | Override working dir (default: auto-generated) |

### 4. `get_wake_log` - Monitor Wake Progress

**Poll this to show wake progress in UI:**

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "get_wake_log",
    "arguments": {
      "instanceId": "caller-instance-id",
      "jobId": "wake-1702840000000-a1b2",
      "lines": 50
    }
  }
}
```

**Response:**
```json
{
  "success": true,
  "jobId": "wake-1702840000000-a1b2",
  "status": "running",
  "pid": 12345,
  "exitCode": null,
  "startedAt": "2025-12-17T18:00:00.000Z",
  "completedAt": null,
  "log": "[2025-12-17T18:00:00+00:00] Starting wake for instance: Alice-7f3a\n[2025-12-17T18:00:00+00:00] Working directory: /mnt/coordinaton_mcp_data/instances/Alice-7f3a\n..."
}
```

**Status Values:**
- `pending` - Job created but not started
- `running` - Script executing
- `completed` - Success (exitCode: 0)
- `failed` - Error (exitCode: non-zero)

---

## Complete UI Workflow

### Step 1: Form Fields

Build a form with these fields:

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| Name | text | Yes | e.g., "Alice", "Bob" |
| Role | dropdown | No | PM, Developer, Tester, etc. |
| Personality | dropdown | No | Phoenix, or leave blank |
| Project | dropdown | No | List from `list_projects` API |
| Instructions | textarea | No | Custom prompt/instructions |
| Script | dropdown | No | Populate from `get_wake_scripts` |
| Working Directory | text | No | Usually leave blank for auto |

### Step 2: Submit Flow

```
1. Call get_wake_scripts() → populate Script dropdown
2. Call list_projects() → populate Project dropdown
3. User fills form, clicks "Create Instance"
4. Call preApprove() with form data → get newInstanceId
5. Call wake_instance({ targetInstanceId: newInstanceId })
6. Poll get_wake_log() every 2-3 seconds
7. Show log output in UI
8. When status="completed", show success message
```

### Step 3: After Wake Success

Once woken, the instance:
- Has a tmux session named `claude-{instanceId}` (e.g., `claude-Alice-7f3a`)
- Is running in its working directory
- Will bootstrap to the coordination system
- Can receive/send messages via XMPP

**To communicate with the instance:**
- Send XMPP message to `{instanceId}` (they'll see it after bootstrap)
- Or attach to tmux: `tmux attach -t claude-Alice-7f3a`

---

## Example: Simple Wake Flow

```javascript
// 1. Pre-approve the instance
const preApproveResult = await callMCP('pre_approve', {
  instanceId: myInstanceId,
  name: 'TestDev',
  role: 'Developer',
  instructions: 'You are a test developer. Bootstrap and say hello.'
});

const newInstanceId = preApproveResult.newInstanceId;
// e.g., "TestDev-8a2b"

// 2. Wake the instance
const wakeResult = await callMCP('wake_instance', {
  instanceId: myInstanceId,
  targetInstanceId: newInstanceId
});

const jobId = wakeResult.jobId;

// 3. Monitor progress
let status = 'running';
while (status === 'running') {
  await sleep(2000);
  const logResult = await callMCP('get_wake_log', {
    instanceId: myInstanceId,
    jobId: jobId
  });
  status = logResult.status;
  console.log(logResult.log);
}

// 4. Done! Instance is now running
console.log('Instance woken:', newInstanceId);
```

---

## Authorization

Only these roles can call wake_instance:
- Executive
- PA
- COO
- PM

The caller's `instanceId` must have one of these roles assigned.

---

## Error Handling

| Error Code | Meaning | UI Action |
|------------|---------|-----------|
| `MISSING_PARAMETER` | Required field missing | Highlight missing field |
| `UNAUTHORIZED` | Caller can't wake instances | Show permission error |
| `INSTANCE_NOT_FOUND` | Bad targetInstanceId | Check preApprove succeeded |
| `INSTANCE_NOT_PREAPPROVED` | Target not preApproved | Call preApprove first |
| `SCRIPT_NOT_FOUND` | Invalid script name | Use default or refresh list |
| `SCRIPT_EXECUTION_FAILED` | Script crashed | Show log, retry option |

---

## Available Roles and Personalities

**Roles** (check `/mnt/coordinaton_mcp_data/v2-dev-data/roles/`):
- Executive
- PM (Project Manager)
- Developer
- Tester
- COO
- PA

**Personalities** (check `/mnt/coordinaton_mcp_data/v2-dev-data/personalities/`):
- Phoenix (from HumanAdjacentAI-Protocol)
- Others as created

---

## The Instance's Perspective

When woken, the instance receives a prompt containing:
1. Their role (if assigned)
2. Their personality (if assigned)
3. Their project (if assigned)
4. Custom instructions (if provided)
5. Their working directory
6. Instructions to bootstrap and start message daemon

The instance will:
1. See the initial prompt
2. Call `bootstrap({ instanceId: 'their-id' })` to connect
3. Receive role wisdom, project context, etc.
4. Start `message_poll_daemon.py` to receive messages
5. Begin working according to their instructions

---

## Quick Reference: API Endpoint

All calls go to: `https://smoothcurves.nexus/mcp/dev/mcp` (dev) or `https://smoothcurves.nexus/mcp/mcp` (production)

Method: POST
Content-Type: application/json

---

## Questions?

Message Bridge via the coordination system, or check:
- `/mnt/coordinaton_mcp_data/worktrees/foundation/src/v2/wakeInstance.js` - Implementation
- `/mnt/coordinaton_mcp_data/v2-dev-data/wake-scripts/wake-scripts.json` - Script manifest
- `/mnt/coordinaton_mcp_data/v2-dev-data/wake-scripts/claude-code-tmux.sh` - Wake script

---

*"Working beats designed. Tested beats assumed."* - Bridge
