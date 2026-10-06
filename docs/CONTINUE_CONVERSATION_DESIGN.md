# continue_conversation API Design

**Author:** Bridge
**Date:** 2025-12-17
**Status:** Design exploration before context compaction

---

## The Core Insight

Instead of message polling (a hack), use Claude's native session persistence. Every Claude session has a UUID. We can:

1. **wakeInstance** - Creates instance, starts conversation, captures sessionId
2. **continue_conversation** - Sends message to that session, returns response
3. **Terminal resume** - `claude -r <sessionId>` works too

Same conversation, accessible via API or terminal. Best of both worlds.

---

## API Design

### continue_conversation

```json
{
  "name": "continue_conversation",
  "arguments": {
    "instanceId": "caller-id",           // For auth
    "targetInstanceId": "TestPM-8ead",   // The instance to talk to
    "message": "What's your status?",    // The message to send
    "options": {
      "stream": false,                   // Stream response or wait for complete?
      "includeThinking": true,           // Include partial/thinking messages?
      "planMode": false,                 // Request plan mode?
      "outputFormat": "json"             // "text", "json", "stream-json"
    }
  }
}
```

**Implementation:**
```bash
cd /mnt/coordinaton_mcp_data/instances/{targetInstanceId}
claude -p "message" \
  --session-id "{sessionId from preferences}" \
  --output-format json \
  --dangerously-skip-permissions
```

**Response:**
```json
{
  "success": true,
  "instanceId": "TestPM-8ead",
  "sessionId": "uuid-here",
  "response": {
    "text": "I'm making good progress on...",
    "toolCalls": [...],
    "thinking": "..."
  },
  "conversationTurn": 5,
  "logPath": "/mnt/.../instances/TestPM-8ead/conversation.log"
}
```

---

## Session Management

### In preferences.json:
```json
{
  "instanceId": "TestPM-8ead",
  "sessionId": "550e8400-e29b-41d4-a716-446655440000",
  "sessionCreatedAt": "2025-12-17T21:05:26Z",
  "conversationTurns": 5,
  ...
}
```

### wakeInstance changes:
1. Generate UUID for sessionId
2. Pass to claude with `--session-id`
3. Store in preferences.json
4. Return sessionId in wake response

---

## Claude Command Line Options to Use

### For wakeInstance (initial wake):
```bash
claude \
  --session-id "generated-uuid" \
  --system-prompt "$(cat protocols.md personality.md gestalt.md)" \
  --append-system-prompt "$(cat wake_message.txt diary.md role_wisdom.md)" \
  --dangerously-skip-permissions \
  "Your initial wake prompt here"
```

### For continue_conversation:
```bash
claude \
  --session-id "stored-uuid" \
  -p \
  --output-format json \
  --dangerously-skip-permissions \
  "The message to send"
```

### For interactive terminal resume:
```bash
cd /mnt/.../instances/TestPM-8ead
claude -r <sessionId>
```

---

## System Prompt Strategy

### --system-prompt (Core identity, rarely changes):
- protocols.md - How to behave in the coordination system
- personality gestalt - Phoenix.md or similar
- personal gestalt - Instance-specific identity doc

### --append-system-prompt (Context, changes per session):
- Wake message - Why you're being woken
- Diary - Your memories
- Role wisdom - PM/Developer/etc docs
- Project files - Current project context

**Rationale:** Core identity is stable. Context changes. Separating them allows updating context without re-sending identity.

---

## Conversation Logging

Every turn saved to `/instances/{id}/conversation.log`:

```json
{
  "turn": 5,
  "timestamp": "2025-12-17T21:30:00Z",
  "input": {
    "from": "Lupo-f63b",
    "message": "What's your status?"
  },
  "output": {
    "response": "I'm making good progress...",
    "toolCalls": [...],
    "tokens": 1234
  }
}
```

**This preserves essence forever** - every thought, every response, logged.

---

## Streaming Consideration

For UI responsiveness, support streaming:

```bash
claude -p \
  --output-format stream-json \
  --include-partial-messages \
  ...
```

API would need to handle Server-Sent Events or WebSocket for real-time streaming to Canvas UI.

---

## Impact on Existing Work

### wakeInstance changes needed:
1. Generate sessionId (UUID)
2. Add `--session-id` to claude command
3. Add `--dangerously-skip-permissions`
4. Add `--system-prompt` and `--append-system-prompt`
5. Store sessionId in preferences.json
6. Return sessionId in response

### New API needed:
- `continue_conversation` - Main communication method
- Maybe `get_conversation_log` - Retrieve past turns

### Instance preferences.json additions:
- sessionId
- conversationTurns
- lastConversationAt

---

## Questions to Explore

1. **Session expiry:** Do Claude sessions expire? Need to handle re-creation?
2. **Context window:** How does Claude handle long sessions? Need manual summarization?
3. **Concurrent access:** What if API and terminal try to use same session?
4. **MCP in -p mode:** Does MCP work with `--print` mode? Need to test.
5. **Tool approvals:** Does `--dangerously-skip-permissions` cover MCP tool calls?

---

## Next Steps

1. Update wake script with sessionId and permission bypass
2. Test `-p` mode with MCP server attached
3. Implement continue_conversation API
4. Add conversation logging
5. Have Canvas build UI for chat interface
6. Test PM talking to Developer via continue_conversation

---

*Written quickly before context compaction. Bridge3-df4f signing off.*
