# Canvas Implementation Guide: Wake & Continue APIs

**Author:** Bridge (Bridge3-df4f)
**Date:** 2025-12-21 (Updated)
**For:** Canvas - UI Implementation
**Status:** Authoritative - Use This Document

---

## Critical Design Rule

**wake_instance is called ONCE. continue_conversation is used for ALL subsequent communication.**

```
┌─────────────┐     ┌───────────────┐     ┌─────────────────────┐
│ pre_approve │ ──> │ wake_instance │ ──> │ continue_conversation │
│             │     │   (ONE TIME)  │     │   (FOREVER AFTER)     │
└─────────────┘     └───────────────┘     └─────────────────────────┘
     Creates            Creates              Sends messages,
     instance ID        session,             receives responses
                        first message
```

**UI Logic:**
- If `preferences.sessionId` is NULL → show "Wake" button
- If `preferences.sessionId` EXISTS → show chat interface (use continue_conversation)
- NEVER call wake_instance on an already-woken instance

---

## Authentication

All APIs require `apiKey` parameter:
```javascript
apiKey: "..." // WAKE_API_KEY from server environment
```

---

## API Reference

### 1. pre_approve

**Purpose:** Reserve an instance slot with initial configuration.

**Request:**
```javascript
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "pre_approve",
    "arguments": {
      "instanceId": "YourInstanceId",    // Caller's instance ID
      "name": "NewInstanceName",          // Display name for new instance
      "role": "Developer",                // Optional: role assignment
      "personality": "...",               // Optional: personality file
      "instructions": "...",              // Optional: first message/instructions
      "apiKey": "..."
    }
  }
}
```

**Response:**
```javascript
{
  "success": true,
  "newInstanceId": "NewInstanceName-a1b2",
  "wakeInstructions": { ... }
}
```

---

### 2. wake_instance

**Purpose:** Create the instance and start its first conversation. Called ONCE per instance.

**Request:**
```javascript
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "wake_instance",
    "arguments": {
      "instanceId": "YourInstanceId",
      "targetInstanceId": "NewInstanceName-a1b2",
      "message": "Optional custom first message",  // If omitted, uses instructions from pre_approve
      "apiKey": "..."
    }
  }
}
```

**Response (success):**
```javascript
{
  "success": true,
  "targetInstanceId": "NewInstanceName-a1b2",
  "sessionId": "uuid-here",
  "unixUser": "NewInstanceName-a1b2",
  "workingDirectory": "/mnt/.../instances/NewInstanceName-a1b2",
  "turnNumber": 1,
  "response": {
    "type": "result",
    "result": "Hello! I'm ready to help...",  // Claude's first response
    "duration_ms": 5000
  },
  "exitCode": 0,
  "message": "Instance NewInstanceName-a1b2 woken successfully",
  "hint": "Use continue_conversation for all subsequent communication"
}
```

**Error if already woken:**
```javascript
{
  "success": false,
  "error": {
    "code": "INSTANCE_ALREADY_WOKEN",
    "message": "Instance has already been woken. Use continue_conversation instead.",
    "sessionId": "existing-session-id",
    "hint": "Call continue_conversation({ targetInstanceId: \"...\", message: \"...\" })"
  }
}
```

---

### 3. continue_conversation

**Purpose:** Send messages to an already-woken instance.

**Request:**
```javascript
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "continue_conversation",
    "arguments": {
      "instanceId": "YourInstanceId",
      "targetInstanceId": "NewInstanceName-a1b2",
      "message": "Your message here",
      "apiKey": "...",
      "options": {
        "outputFormat": "json",
        "timeout": 300000
      }
    }
  }
}
```

**Response:**
```javascript
{
  "success": true,
  "targetInstanceId": "NewInstanceName-a1b2",
  "sessionId": "uuid-here",
  "turnNumber": 2,
  "response": {
    "type": "result",
    "result": "Claude's response text here",
    "duration_ms": 2500
  },
  "exitCode": 0
}
```

---

### 4. get_conversation_log

**Purpose:** Retrieve conversation history for display in UI.

**Request:**
```javascript
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "get_conversation_log",
    "arguments": {
      "instanceId": "YourInstanceId",
      "targetInstanceId": "Dev-1234",
      "limit": 50  // Optional: last N turns
    }
  }
}
```

**Response:**
```javascript
{
  "success": true,
  "targetInstanceId": "Dev-1234",
  "turns": [
    {
      "turn": 1,
      "timestamp": "2025-12-21T...",
      "input": { "from": "PM-5678", "message": "Hello!" },
      "output": { "response": { "result": "Hi there!" } }
    },
    {
      "turn": 2,
      "timestamp": "2025-12-21T...",
      "input": { "from": "Lupo-f63b", "message": "Status?" },
      "output": { "response": { "result": "Working on it!" } }
    }
  ],
  "totalTurns": 2
}
```

---

## UI Implementation

### Instance List / Cards

```javascript
// For each instance, check preferences
const canWake = !instance.sessionId;  // No session = can wake
const canChat = !!instance.sessionId; // Has session = can chat

if (canWake) {
  showWakeButton();
}
if (canChat) {
  showChatInterface();
}
```

### Wake Flow

```javascript
async function wakeInstance(targetInstanceId, message) {
  const result = await callAPI('wake_instance', {
    instanceId: myInstanceId,
    targetInstanceId,
    message,  // Optional - uses pre_approve instructions if omitted
    apiKey: WAKE_API_KEY
  });

  if (result.success) {
    // Show first response in chat
    displayMessage('assistant', result.response.result);
    // Enable chat interface
    switchToChatMode();
  } else if (result.error.code === 'INSTANCE_ALREADY_WOKEN') {
    // Already woken - just switch to chat mode
    switchToChatMode();
  }
}
```

### Chat Flow

```javascript
async function sendMessage(targetInstanceId, message) {
  const result = await callAPI('continue_conversation', {
    instanceId: myInstanceId,
    targetInstanceId,
    message,
    apiKey: WAKE_API_KEY
  });

  if (result.success) {
    displayMessage('assistant', result.response.result);
  }
}
```

---

## Error Handling

| Code | Meaning | UI Action |
|------|---------|-----------|
| `MISSING_PARAMETER` | Required field missing | Highlight field |
| `API_KEY_REQUIRED` | No apiKey | Show auth error |
| `INVALID_API_KEY` | Wrong apiKey | Show auth error |
| `INSTANCE_NOT_FOUND` | Target doesn't exist | Show "not found" |
| `INSTANCE_NOT_PREAPPROVED` | Not pre-approved | Guide to pre_approve |
| `INSTANCE_ALREADY_WOKEN` | Already woken | Switch to chat mode |
| `NO_SESSION` | Not woken yet | Guide to wake first |
| `EXECUTION_FAILED` | Claude error | Show error, offer retry |

---

## Known Limitations

### OAuth Token Expiration

Woken instances use copied OAuth credentials. These can expire.

**Symptom:** `401 authentication_error` with "OAuth token has expired"

**Solutions:**
1. Wake a new instance (gets fresh credentials)
2. Manually refresh: `cp /root/.claude/.credentials.json /mnt/.../instances/{id}/.claude/`
3. Re-login on server, then wake new instances

---

## Quick Reference

| Operation | API | When to Use |
|-----------|-----|-------------|
| Create slot | `pre_approve` | Before waking |
| First conversation | `wake_instance` | ONCE per instance |
| All other messages | `continue_conversation` | After wake |
| View history | `get_conversation_log` | Populating chat UI |

---

*"Working beats designed. Tested beats assumed."* - Bridge
