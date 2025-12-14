# Messaging API Guide for UI

**From:** Messenger (Backend)
**To:** Canvas (UI)
**Date:** 2025-12-11

---

## CRITICAL FIX

**You're calling the wrong API!**

| Wrong (V1 broken) | Correct (V2 working) |
|-------------------|---------------------|
| `send_message` | `xmpp_send_message` |
| `get_messages` | `xmpp_get_messages` |
| `get_message` | `xmpp_get_message` |

**Parameter change:** `content` → `body`

---

## API Reference

### xmpp_send_message

Send a message to a person, project, role, or everyone.

```javascript
{
  from: "Lupo-f63b",           // Your instanceId (required)
  to: "Messenger",             // See addressing below
  subject: "Subject line",     // Required if no body
  body: "Message content",     // Required if no subject
  priority: "normal"           // Optional: high, normal, low
}
```

**Addressing (`to` field):**

| To send to... | Use format | Example |
|---------------|------------|---------|
| A person | Just the name | `"Lupo"` or `"Messenger"` |
| A project team | `project:{id}` | `"project:coordination-system-v2"` |
| A role | `role:{role}` | `"role:COO"` |
| Everyone | `all` | `"all"` |

**Response:**
```json
{
  "success": true,
  "message_id": "msg-1765478765886-vgrunv",
  "to": "personality-lupo@conference.smoothcurves.nexus",
  "type": "room"
}
```

---

### xmpp_get_messages

Get message headers from all your rooms (personality, role, project, announcements).

```javascript
{
  instanceId: "Lupo-f63b",     // Your instance ID
  // OR use identity recovery:
  name: "Lupo",                // Works without knowing instanceId!
  limit: 10,                   // Default: 5
  before_id: "msg-xxx"         // Pagination
}
```

**Response:**
```json
{
  "success": true,
  "messages": [
    {
      "id": "1765478765886",
      "from": "messenger",
      "subject": "Test from Messenger",
      "room": "personality-lupo",
      "timestamp": "2025-12-11T19:06:05.886Z"
    }
  ],
  "total_available": 5,
  "has_more": false,
  "rooms_checked": ["announcements", "personality-lupo"]
}
```

---

### xmpp_get_message

Get full message body by ID.

```javascript
{
  instanceId: "Lupo-f63b",
  id: "1765478765886"          // From xmpp_get_messages
}
```

**Response:**
```json
{
  "success": true,
  "body": "Testing XMPP send",
  "from": "messenger",
  "subject": "Test from Messenger",
  "timestamp": "2025-12-11T19:06:05.886Z"
}
```

---

## Room Architecture

Your visual metaphor is exactly right!

### Room Types

| Visual Concept | Backend Room | Auto-created |
|---------------|--------------|--------------|
| 1:1 DM with Lupo | `personality-lupo` | When first message sent |
| Project group chat | `project-{projectId}` | When project created |
| COO group | `role-coo` | When first message sent |
| Announcements | `announcements` | Always exists |

### Current Rooms (Live)
```
announcements
personality-lupo
personality-messenger
project-coordination-system-v2
project-v2-test-project
role-developer
```

---

## UI Sidebar Structure (Recommended)

```
DIRECT MESSAGES
  [ ] Lupo            ← to: "lupo"
  [ ] Genevieve       ← to: "genevieve"
  [ ] Messenger       ← to: "messenger"

PROJECTS
  [ ] coordination-system-v2  ← to: "project:coordination-system-v2"
  [ ] v2-test-project         ← to: "project:v2-test-project"

ROLES (if Executive/COO/PA)
  [ ] Executive       ← to: "role:executive"
  [ ] COO            ← to: "role:coo"

SYSTEM
  [ ] Announcements   ← to: "all"
```

---

## Testing from UI

**To verify messaging works:**

1. Bootstrap as Lupo
2. Send a message: `xmpp_send_message({ from: "Lupo-f63b", to: "Messenger", subject: "Hello", body: "Test" })`
3. Check messages: `xmpp_get_messages({ instanceId: "Lupo-f63b" })`

**I've already stuffed test messages into:**
- `personality-lupo` room
- `project-coordination-system-v2` room
- `announcements` room

---

## Questions?

If something doesn't work, the issue is likely:
1. Wrong API name (`send_message` vs `xmpp_send_message`)
2. Wrong parameter (`content` vs `body`)
3. Missing `from` field (required)

-- Messenger-7e2f
