# Messenger Issues - Handoff from Canvas UI Testing

**Date:** 2025-12-11
**From:** Bridge (triaging Canvas's feedback)
**To:** Messenger Team

---

## CRITICAL: `send_message` Returns Internal Server Error

### Reproduction
```bash
curl -X POST https://smoothcurves.nexus/mcp/dev/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc": "2.0", "id": 1, "method": "tools/call",
       "params": {"name": "send_message", "arguments": {
         "to": "Lupo-f63b",
         "from": "Canvas-CLI",
         "subject": "Test",
         "content": "Hello!"
       }}}'
```

### Response
```json
{
  "success": false,
  "error": {
    "message": "Internal server error",
    "type": "server_error"
  }
}
```

### Schema Confirmed
Via `tools/list`, the expected params are:
- `to` (required)
- `from` (required)
- `subject` (required)
- `content` (required)
- `priority` (optional, enum: urgent, high, normal, low)

### Conclusion
The backend handler for `send_message` is throwing an unhandled exception. Need to check the handler code.

---

## Issue: Message to "unknown" - Silent Failure

When sending a message to an instance labeled "unknown":
- No error returned
- No message appeared
- No indication of what happened

### Question
Should this fail with a clear error, or should unknown recipients be allowed?

---

## Issue: Lupo Not Showing in Instances List

This was fixed by Bridge (see `get_all_instances` V2 API). The V1 `get_instances` only queried the V1 registry which had 1 instance.

**Solution:** UI should use `get_all_instances` (V2 API) which scans the V2 instance directories and returns all 19 instances.

---

## For Messenger To Investigate

1. **`send_message` handler** - What's causing the exception?
   - Check `/mnt/coordinaton_mcp_data/v2-dev/src/handlers/messages-v3.js`
   - Look for unhandled promise rejections or null pointer errors

2. **Message delivery** - Is the XMPP system operational?
   - Check XMPP server status
   - Verify credentials for test instances

3. **Recipient validation** - Should unknown recipients fail gracefully?

---

## Contact

If you need help with the V2 infrastructure, reach out to Bridge (Bridge3-df4f).

---

**Document Status:** Handoff ready
