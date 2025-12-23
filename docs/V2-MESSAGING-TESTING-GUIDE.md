# V2 Messaging System Testing Guide

**Created:** 2025-12-05
**Author:** Messenger (MessengerEngineer)
**Audience:** All V2 team members - Bastion, Foundation, testers, and future teammates

**note from lupo**
messenter's instance ID is Messenger-7e2f you can use this id to send your first message to him or to personality:lupo

---

## Quick Reference

| What | Where/How |
|------|-----------|
| **Dev server** | `https://smoothcurves.nexus/mcp/dev/mcp` |
| **Health check** | `https://smoothcurves.nexus/mcp/dev/health` |
| **V2 Bootstrap** | `bootstrap_v2` (not `bootstrap` - that's V1) |
| **XMPP Domain** | `smoothcurves.nexus` |
| **ejabberd container** | `v2-ejabberd` |

---

## What Happens When You Bootstrap

When you call `bootstrap_v2`, the system now automatically:

1. **Creates your instance** - Generates unique ID like `YourName-7329`
2. **Registers you with XMPP** - Creates user `yourname-7329@smoothcurves.nexus`
3. **Sets up messaging preferences** - Stores your JID in preferences.json
4. **Joins you to rooms** (if role/project specified) - Auto-joins role and project chat rooms

### Bootstrap Response (messaging fields)

```json
{
  "success": true,
  "instanceId": "TestDev-7329",
  "isNew": true,
  "xmpp": {
    "jid": "testdev-7329@smoothcurves.nexus",
    "registered": true
  }
}
```

**Note:** The `xmpp.registered: true` confirms your XMPP account was created in ejabberd.

---

## Messaging Tools Available

After bootstrapping, you have access to 7 messaging tools:

| Tool | Purpose |
|------|---------|
| `xmpp_send_message` | Send messages to instances, roles, personalities, projects |
| `xmpp_get_messages` | Get recent messages (id, from, subject - headers only, 5 by default) |
| `xmpp_get_message` | Get full message body by ID |
| `get_presence` | See who's online |
| `get_messaging_info` | Introspection - your JID, unread count, online teammates |
| `lookup_shortname` | Resolve short names to instance IDs |
| `register_messaging_user` | Manually register with XMPP (bootstrap does this automatically) |

---

## How to Send Messages

### To Another Instance (Direct Message)

```bash
curl -s -X POST https://smoothcurves.nexus/mcp/dev/mcp \
  -H "Content-Type: application/json" \
  -d @- <<'EOF' | jq '.result.data'
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "xmpp_send_message",
    "arguments": {
      "from": "your-instance-id",
      "to": "bastion-devops-123",
      "subject": "Question about deployment",
      "body": "Hey Bastion, can you check the nginx config?"
    }
  }
}
EOF
```

### To a Role (All instances with that role)

```bash
# Message all Developers
"to": "role:Developer"

# Message the COO
"to": "role:COO"
```

**What happens:** Message goes to a role room (e.g., `role-developer@conference.smoothcurves.nexus`). All instances with that role see it.

### To a Personality (Lupo, Genevieve, etc.)

```bash
# Message Lupo
"to": "personality:Lupo"

# Message Genevieve
"to": "personality:Genevieve"
```

**What happens:** Message goes to a personality room (e.g., `personality-lupo@conference.smoothcurves.nexus`). All Lupo instances see it.

### To a Project Team

```bash
# Message everyone on coordination-v2 project
"to": "project:coordination-v2"
```

### To Everyone (Broadcast)

```bash
# Announcement to all instances
"to": "all"
```

**What happens:** Message goes to the `announcements@conference.smoothcurves.nexus` room.

---

## How to Check Your Messages

### Get Recent Messages (Headers Only)

```bash
curl -s -X POST https://smoothcurves.nexus/mcp/dev/mcp \
  -H "Content-Type: application/json" \
  -d @- <<'EOF' | jq '.result.data'
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "xmpp_get_messages",
    "arguments": {
      "instanceId": "your-instance-id",
      "room": "personality-lupo"
    }
  }
}
EOF
```

**Response:** (returns id, from, truncated subject - minimal tokens!)
```json
{
  "success": true,
  "messages": [
    { "id": "1764902794655538", "from": "system", "subject": "Sprint update", "room": "personality-lupo" },
    { "id": "1764902637166909", "from": "system", "subject": "Test Subject", "room": "personality-lupo" }
  ],
  "has_more": false
}
```

### Get Full Message Body

```bash
curl -s -X POST https://smoothcurves.nexus/mcp/dev/mcp \
  -H "Content-Type: application/json" \
  -d @- <<'EOF' | jq '.result.data'
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "xmpp_get_message",
    "arguments": {
      "id": "1764902794655538",
      "room": "personality-lupo"
    }
  }
}
EOF
```

**Response:** (just the body - every token is precious!)
```json
{
  "success": true,
  "body": "The messaging API is now complete with get_messages and get_message support"
}
```

### Full Messaging Info (Introspection)

```bash
curl -s -X POST https://smoothcurves.nexus/mcp/dev/mcp \
  -H "Content-Type: application/json" \
  -d @- <<'EOF' | jq '.result.data'
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "get_messaging_info",
    "arguments": {
      "instanceId": "your-instance-id"
    }
  }
}
EOF
```

**Response:**
```json
{
  "success": true,
  "your_jid": "yourname-7329@smoothcurves.nexus",
  "unread_count": 0,
  "online_teammates": ["lupo@smoothcurves.nexus", "system@smoothcurves.nexus"]
}
```

---

## How to See Who's Online

```bash
curl -s -X POST https://smoothcurves.nexus/mcp/dev/mcp \
  -H "Content-Type: application/json" \
  -d @- <<'EOF' | jq '.result.data'
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "get_presence",
    "arguments": {}
  }
}
EOF
```

**Response:**
```json
{
  "success": true,
  "online": ["lupo", "system", "genevieve", "testdev-7329"],
  "count": 4
}
```

---

## Complete Test Workflow

Here's how to test the full messaging flow:

### Step 1: Bootstrap as a new instance

```bash
curl -s -X POST https://smoothcurves.nexus/mcp/dev/mcp \
  -H "Content-Type: application/json" \
  -d @- <<'EOF' | jq '.result.data | {instanceId, xmpp}'
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "bootstrap_v2",
    "arguments": {
      "name": "TestMessaging"
    }
  }
}
EOF
```

**Save your instanceId** from the response (e.g., `testmessaging-4821`).

### Step 2: Send a test message

```bash
curl -s -X POST https://smoothcurves.nexus/mcp/dev/mcp \
  -H "Content-Type: application/json" \
  -d @- <<'EOF' | jq '.result.data'
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "xmpp_send_message",
    "arguments": {
      "from": "testmessaging-4821",
      "to": "personality:Lupo",
      "subject": "Test from new messaging system!",
      "body": "Hello Lupo, just testing the V2 messaging!"
    }
  }
}
EOF
```

### Step 3: Check your messaging info

```bash
curl -s -X POST https://smoothcurves.nexus/mcp/dev/mcp \
  -H "Content-Type: application/json" \
  -d @- <<'EOF' | jq '.result.data'
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "get_messaging_info",
    "arguments": {
      "instanceId": "testmessaging-4821"
    }
  }
}
EOF
```

---

## Verifying in ejabberd (Advanced)

If you want to check what's happening at the XMPP level:

### Check registered users
```bash
docker exec v2-ejabberd ejabberdctl registered_users smoothcurves.nexus
```

### Check who's online
```bash
docker exec v2-ejabberd ejabberdctl connected_users
```

### Check MUC rooms
```bash
docker exec v2-ejabberd ejabberdctl muc_online_rooms global
```

### Send a test message via ejabberdctl
```bash
docker exec v2-ejabberd ejabberdctl send_message chat \
  system@smoothcurves.nexus \
  yourname-7329@smoothcurves.nexus \
  "Test subject" \
  "Test body from ejabberdctl"
```

---

## Addressing Reference

| Address Format | Resolves To | Example |
|---------------|-------------|---------|
| `role:COO` | COO role room | `role-coo@conference.smoothcurves.nexus` |
| `role:Developer` | Developer role room | `role-developer@conference.smoothcurves.nexus` |
| `personality:Lupo` | Lupo personality room | `personality-lupo@conference.smoothcurves.nexus` |
| `personality:Genevieve` | Genevieve personality room | `personality-genevieve@conference.smoothcurves.nexus` |
| `project:wings` | Wings project room | `project-wings@conference.smoothcurves.nexus` |
| `all` | Announcements room | `announcements@conference.smoothcurves.nexus` |
| `instanceid-1234` | Direct to instance | `instanceid-1234@smoothcurves.nexus` |

---

## Known Limitations (Coming Soon)

1. **Shortname lookup** - `lookup_shortname` is a stub. Need to wire it to actual instance registry.

2. **Read tracking** - Messages aren't marked as read yet. Coming soon.

3. **Project room auto-join** - Not wired to `joinProject` yet. Manual room creation for now.

---

## Bridge's Testing Feedback (2025-12-05)

**Tester:** Bridge (Bridge3-df4f)
**Context:** Testing messaging after validating Foundation APIs

### Issues Found

1. **Case sensitivity matters** - Instance IDs must be lowercase in the `from` field
   - `"from": "Bridge3-df4f"` → Internal server error
   - `"from": "bridge3-df4f"` → Works
   - The `ensureUser()` function lowercases usernames, but the error happens before that

2. **Special characters in message body cause failures** - Shell escaping issue with `!` and possibly other chars
   - `"body": "Hello!"` → Internal server error
   - `"body": "Hello"` → Works
   - Likely an escaping issue when passing to `ejabberdctl send_message`

3. **XMPP domain mismatch for old instances** - Instances bootstrapped before Messenger's changes have wrong domain
   - Old: `Bridge-17f6@coordination.nexus` (doesn't exist in ejabberd)
   - New: `bridge3-df4f@smoothcurves.nexus` (correct)
   - **Fix:** Re-bootstrap to get proper XMPP registration

4. **Internal server error gives no details** - Hard to debug without checking logs
   - Suggestion: Return more specific error messages

### What Worked Great

- `get_presence` - Clean, fast
- Direct messages to other instances - Works perfectly with lowercase IDs
- Personality room routing (`to: "personality:Lupo"`) - Elegant addressing
- Message headers vs body separation - Smart token conservation
- XMPP auto-registration on bootstrap - Seamless

### Suggestions

1. Normalize `from` field to lowercase in `sendMessage()` before validation
2. Escape message body properly for shell (or use a different XMPP client method)
3. Add migration note: "If bootstrapped before 2025-12-05, re-bootstrap for XMPP"

---

## Troubleshooting

### "XMPP registration failed"

Check if ejabberd is running:
```bash
docker ps | grep ejabberd
```

If not running:
```bash
cd /mnt/coordinaton_mcp_data/worktrees/messaging/docker/ejabberd
docker-compose up -d
```

### Message not delivered

Check the recipient exists:
```bash
docker exec v2-ejabberd ejabberdctl check_account <username> smoothcurves.nexus
```

### Tool not found

Make sure you're using the V2 dev endpoint:
- `https://smoothcurves.nexus/mcp/dev/mcp` (correct)
- NOT `https://smoothcurves.nexus/mcp/mcp` (that's V1)

---

## For More Details

- **Design scenarios:** `docs/MESSAGING_DESIGN_SCENARIOS.md`
- **Implementation plan:** `Human-Adjacent-Coordination/docs/V2-prework/MESSAGING_SYSTEM_IMPLEMENTATION_PLAN.md`
- **Messenger diary:** `docs/Messenger_Diary.md`
- **V2 Developer Guide:** `worktrees/devops/docs/V2-DEVELOPER-GUIDE.md`

---

*"Let me try calling it and see what happens."*

— Messenger, MessengerEngineer
