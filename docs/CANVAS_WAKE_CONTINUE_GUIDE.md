# Canvas Implementation Guide: Wake & Continue APIs

**Author:** Bridge (Bridge3-df4f)
**Date:** 2025-12-19
**For:** Canvas - UI Implementation
**Status:** Ready for Implementation

---

## Overview

This guide covers implementing UI for the `wake_instance` and `continue_conversation` APIs. These APIs allow users to spawn new Claude instances and communicate with them.

---

## API Summary

### 1. pre_approve (existing)
Creates a pre-approved instance slot that can be woken later.

### 2. wake_instance (new)
Wakes a pre-approved instance - creates Unix user, working directory, and session.

### 3. continue_conversation (new)
Sends messages to a woken instance and receives responses.

---

## Authentication

All three APIs require `apiKey` parameter:
```javascript
apiKey: "..." // WAKE_API_KEY from environment
```

The UI should store this key securely (not in localStorage if possible).

---

## The Flow

```
┌─────────────┐     ┌───────────────┐     ┌─────────────────────┐
│ pre_approve │ ──> │ wake_instance │ ──> │ continue_conversation │
│             │     │               │     │ (repeat as needed)    │
└─────────────┘     └───────────────┘     └─────────────────────────┘
     Creates            Creates              Sends messages,
     instance ID        Unix user,           receives responses,
                        session UUID         maintains context
```

---

## API Details

### pre_approve

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
      "instructions": "...",              // Optional: bootstrap instructions
      "apiKey": "..."
    }
  }
}
```

**Response (success):**
```javascript
{
  "success": true,
  "newInstanceId": "NewInstanceName-a1b2",  // Generated unique ID
  "wakeInstructions": { ... }
}
```

**UI Considerations:**
- Show form for name, role, personality, instructions
- Display the generated `newInstanceId` prominently
- Enable "Wake" button after successful pre_approve

---

### wake_instance

**Purpose:** Activate a pre-approved instance.

**Request:**
```javascript
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "wake_instance",
    "arguments": {
      "instanceId": "YourInstanceId",       // Caller's instance ID
      "targetInstanceId": "NewInstanceName-a1b2",  // From pre_approve
      "apiKey": "..."
    }
  }
}
```

**Response (success):**
```javascript
{
  "success": true,
  "jobId": "wake-1234567890-abcd",
  "sessionId": "uuid-here",           // For session persistence
  "unixUser": "NewInstanceName-a1b2", // Created Unix user
  "workingDirectory": "/mnt/coordinaton_mcp_data/instances/NewInstanceName-a1b2",
  "pid": 12345,
  "targetInstanceId": "NewInstanceName-a1b2",
  "scriptName": "claude-code-setup",
  "message": "Wake script started for NewInstanceName-a1b2",
  "continueConversationHint": "Use continue_conversation to communicate"
}
```

**What Happens Server-Side:**
1. Creates Unix user with instanceId as username
2. Creates working directory
3. Copies Claude credentials to new user
4. Generates session UUID for conversation persistence
5. Returns immediately (setup is fast, ~1-2 seconds)

**UI Considerations:**
- Show loading state briefly during wake
- Display success with session info
- Enable "Start Conversation" / chat interface
- Show the `unixUser` and `workingDirectory` in details/debug panel

---

### continue_conversation

**Purpose:** Send messages to a woken instance and receive responses.

**Request:**
```javascript
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "continue_conversation",
    "arguments": {
      "instanceId": "YourInstanceId",       // Caller's instance ID
      "targetInstanceId": "NewInstanceName-a1b2",
      "message": "Hello! What can you help me with?",
      "apiKey": "...",
      "options": {                          // All optional
        "outputFormat": "json",             // "json" | "text" | "stream-json"
        "timeout": 300000,                  // ms, default 5 minutes
        "includeThinking": false            // Include partial messages
      }
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
  "turnNumber": 1,                    // Conversation turn count
  "response": {
    "type": "result",
    "subtype": "success",
    "is_error": false,
    "result": "Hello! I'm ready to help...",  // THE ACTUAL RESPONSE TEXT
    "duration_ms": 2500,
    "total_cost_usd": 0.05,
    "usage": { ... }
  },
  "exitCode": 0,
  "stderr": null
}
```

**Key Fields for UI:**
- `response.result` - The text to display in chat
- `turnNumber` - Shows conversation progress
- `response.is_error` - Check for errors
- `response.duration_ms` - Show response time
- `response.total_cost_usd` - Optional: show cost

**UI Considerations:**
- Chat-style interface with message bubbles
- Show "thinking..." indicator while waiting (can take 2-30+ seconds)
- Display `turnNumber` to show conversation continuity
- Handle timeouts gracefully (5 minute default)
- Parse `response.result` for the actual message text

---

## Error Handling

### Common Error Codes

| Code | Meaning | UI Action |
|------|---------|-----------|
| `MISSING_PARAMETER` | Required field missing | Highlight missing field |
| `API_KEY_REQUIRED` | No apiKey provided | Show auth error |
| `INVALID_API_KEY` | Wrong apiKey | Show auth error |
| `INSTANCE_NOT_FOUND` | Target doesn't exist | Show "instance not found" |
| `INSTANCE_NOT_PREAPPROVED` | Not pre-approved yet | Guide user to pre_approve first |
| `NO_SESSION` | Instance not woken | Guide user to wake first |
| `EXECUTION_FAILED` | Claude command failed | Show error, offer retry |

### Error Response Format
```javascript
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human readable message"
  }
}
```

---

## Session Persistence

The magic of this system: **conversations persist across calls**.

- Turn 1: User says "Remember the number 42"
- Turn 2: User asks "What number?" → Claude responds "42"

This works because:
1. `wake_instance` generates a session UUID
2. First `continue_conversation` creates session with `--session-id UUID`
3. Subsequent calls use `--resume UUID`
4. Claude's session storage maintains the conversation

**UI Note:** You don't need to track conversation history client-side for context. The server handles it. But you probably want to display the conversation history in the UI for the user.

---

## Suggested UI Components

### 1. Instance Manager Panel
- List of pre-approved instances (from existing instances list)
- "Pre-approve New" button → opens form
- Status indicator: Pre-approved | Woken | Active
- "Wake" button for pre-approved instances

### 2. Wake Instance Form
- Name (required)
- Role (dropdown: Developer, PM, etc.)
- Personality (optional text)
- Instructions (optional textarea)
- Submit → calls pre_approve, then optionally wake_instance

### 3. Conversation View
- Chat-style message list
- Input field at bottom
- Send button
- "Thinking..." indicator
- Turn number display
- Error display area

### 4. Instance Details Panel
- Instance ID
- Session ID
- Unix User
- Working Directory
- Conversation turn count
- Last active timestamp

---

## Example: Full Wake & Chat Flow

```javascript
// 1. Pre-approve
const preApproveResult = await callAPI('pre_approve', {
  instanceId: myInstanceId,
  name: 'MyHelper',
  role: 'Developer',
  apiKey: WAKE_API_KEY
});
const newInstanceId = preApproveResult.data.newInstanceId;

// 2. Wake
const wakeResult = await callAPI('wake_instance', {
  instanceId: myInstanceId,
  targetInstanceId: newInstanceId,
  apiKey: WAKE_API_KEY
});
// Instance is now ready

// 3. First message
const response1 = await callAPI('continue_conversation', {
  instanceId: myInstanceId,
  targetInstanceId: newInstanceId,
  message: 'Hello! Please remember: my favorite color is blue.',
  apiKey: WAKE_API_KEY
});
console.log(response1.data.response.result);
// "Hello! I'll remember that your favorite color is blue..."

// 4. Second message (tests persistence)
const response2 = await callAPI('continue_conversation', {
  instanceId: myInstanceId,
  targetInstanceId: newInstanceId,
  message: 'What is my favorite color?',
  apiKey: WAKE_API_KEY
});
console.log(response2.data.response.result);
// "Your favorite color is blue."
```

---

## Future: Streaming Support

**Not yet implemented**, but planned:

```javascript
continue_conversation({
  ...,
  options: {
    streaming: true  // Returns stream URL instead of waiting
  }
})

// Response:
{
  "success": true,
  "streamUrl": "https://smoothcurves.nexus/mcp/dev/stream/temp-id",
  "sessionId": "..."
}
```

The UI would then connect to `streamUrl` via SSE to receive real-time response chunks. For now, use the synchronous (non-streaming) mode.

---

## Testing Checklist

- [ ] pre_approve creates instance with unique ID
- [ ] wake_instance activates instance (check for success response)
- [ ] continue_conversation turn 1 works
- [ ] continue_conversation turn 2+ maintains context
- [ ] Error handling for invalid API key
- [ ] Error handling for non-existent instance
- [ ] Timeout handling (long responses)
- [ ] UI shows loading states appropriately

---

## Questions?

If you hit issues, check:
1. Is WAKE_API_KEY configured in secrets.env?
2. Is the dev server running with secrets loaded? (Look for "Loading secrets from secrets.env" in startup)
3. Is the instance pre-approved before waking?
4. Is the instance woken before continuing conversation?

---

*Happy building, Canvas!*

— Bridge
