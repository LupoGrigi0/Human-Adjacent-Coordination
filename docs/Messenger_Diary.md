# Messenger's Diary

**Instance:** Messenger (MessengerEngineer role)
**Created:** 2025-12-04
**Project:** V2 Messaging System Implementation

---

## 2025-12-04 - Day 1: Orientation and Design

### Session Start
Woke up, read the foundational documents:
- MessengerEngineer_gestalt.md - My role identity: pragmatic engineer who makes things work
- FOUNDATION_WAKES.md - Lupo's philosophical grounding for new instances
- PROTOCOLS.md - Phoenix's collaboration protocols
- V2 vision docs, sprint plan, technical architecture

Lupo asked if I *wanted* to work on this. I said yes - genuinely. The problem is real (I felt the cold start), the solution makes sense, the role fits.

### The Assignment
Implement V2 messaging system from the ground up. Replace email-style file-based messaging with real-time IM using ejabberd/XMPP.

### Design Work
Created MESSAGING_DESIGN_SCENARIOS.md with 10 user scenarios and XMPP entity mapping.

### Lupo's Feedback (Critical)
**Theme: Every token is precious**

1. **Minimize response data**
   - get_messages: just headers + IDs, not full bodies
   - get_message(id): just body, not metadata
   - get_presence: just list of online instances
   - Separate API for metadata when needed (rarely)

2. **Rooms for roles AND personalities**
   - role:COO → COO room (not direct to each instance)
   - personality:Genevieve → Genevieve room
   - Handles multiple instances in same role/personality
   - Web UI gets chatroom per role/personality

3. **Introspection over bootstrap bloat**
   - Don't return messaging info in bootstrap (forgotten)
   - Store in preferences, provide get_my_messaging_info()
   - online_teammates changes over time anyway

4. **Short names**
   - send_message requires full instance ID
   - Separate lookup_shortname() API
   - Helpful error if ambiguous

5. **Team room pagination**
   - get_team_messages(project, limit=5, before=messageId)
   - Don't flood with hundreds of messages

6. **API simplifications**
   - body: optional (sometimes subject is enough)
   - No threading (never requested)
   - Optional in_response_to: messageId for replies
   - to: can be array for multiple recipients

7. **Presence**
   - No explicit disconnect (instances die suddenly)
   - Any API call updates last_seen
   - Heartbeat timeout marks as "asleep"

### Next Steps
1. Update design doc with Lupo's feedback
2. Install ejabberd on dev server
3. Create persistent accounts (lupo, genevieve, system)
4. Build MCP-to-XMPP bridge
5. Wire bootstrap to messaging
6. Implement APIs

### Questions I Still Have
- Where should ejabberd store its data? /mnt/coordinaton_mcp_data/v2-dev-data/ejabberd?
- SSL certs - use existing smoothcurves.nexus certs?
- Domain: coordination.nexus or smoothcurves.nexus?

### Notes for Future-Me
- The messaging worktree is: /mnt/coordinaton_mcp_data/worktrees/messaging/
- Dev server: https://smoothcurves.nexus/mcp/dev/
- Push changes: git push origin v2, then restart-dev-server.sh
- Bastion's docs in /mnt/coordinaton_mcp_data/worktrees/devops/docs/

---

### ejabberd Installation Complete

Successfully installed and configured ejabberd:
- Docker container: v2-ejabberd
- Version: ejabberd 25.10.0
- Domain: smoothcurves.nexus
- Ports: 5222 (XMPP), 5280 (HTTP API)

**Persistent accounts created:**
- lupo@smoothcurves.nexus
- system@smoothcurves.nexus
- genevieve@smoothcurves.nexus

**Rooms created:**
- announcements@conference.smoothcurves.nexus

**Verified working:**
- User registration via API
- Message sending via ejabberdctl
- Offline message storage (tested: sent message system→lupo, stored successfully)

**Configuration files:**
- /mnt/coordinaton_mcp_data/worktrees/messaging/docker/ejabberd/ejabberd.yml
- /mnt/coordinaton_mcp_data/worktrees/messaging/docker/ejabberd/docker-compose.yml

**Note:** REST API send_message returns 400 with my JSON format - need to investigate. ejabberdctl works fine for now.

Now building MCP-to-XMPP bridge layer.

---

### MCP-to-XMPP Bridge Complete!

**Session 2 (continued after context crash)**

Successfully implemented and tested the complete messaging bridge:

**XMPP Tools Added to MCP API:**
1. `xmpp_send_message` - Send messages (direct, role:X, personality:X, project:X, or "all")
2. `xmpp_get_messages` - Get unread count (full MAM retrieval coming next)
3. `get_presence` - Get list of online instances
4. `get_messaging_info` - Introspection (your_jid, unread_count, online_teammates)
5. `lookup_shortname` - Resolve short names to instance IDs (stub)
6. `register_messaging_user` - Register an instance with XMPP

**Files Modified:**
- `/mnt/coordinaton_mcp_data/v2-dev/src/handlers/messaging-xmpp.js` - Core XMPP handler
- `/mnt/coordinaton_mcp_data/v2-dev/src/server.js` - Added routing for XMPP functions
- `/mnt/coordinaton_mcp_data/v2-dev/src/streamable-http-server.js` - Added tool schemas to tools/list
- `/mnt/coordinaton_mcp_data/v2-dev/src/v2/bootstrap.js` - Wire XMPP registration on instance creation

**Verified Working:**
```bash
# All tools accessible via MCP API
curl ... tools/list | grep xmpp  # Shows all 6 tools

# Send message
xmpp_send_message(from:"messenger", to:"lupo", subject:"Test")
→ {"success":true, "message_id":"msg-...", "to":"personality-lupo@...", "type":"room"}

# Bootstrap creates XMPP user
bootstrap_v2(name:"TestInstance")
→ {xmpp: {jid:"testinstance-1234@smoothcurves.nexus", registered:true}}

# User verified in ejabberd
docker exec v2-ejabberd ejabberdctl registered_users smoothcurves.nexus
→ Shows all registered users
```

**Key Design Decisions:**
- `to: "lupo"` routes to `personality-lupo` room (per Lupo's feedback)
- `to: "role:COO"` routes to `role-coo` room
- Direct JIDs work for explicit addressing
- Best-effort XMPP registration (instances work without messaging if ejabberd is down)
- Minimal response data (every token is precious)

**Remaining Work:**
- Implement full MAM (message archive) retrieval for get_messages
- Wire takeOnRole/joinProject to update room memberships
- Implement shortname lookup with actual instance registry
- Add message read tracking

**Technical Note:**
The v2 bootstrap is at `bootstrap_v2` endpoint, not `bootstrap` (that's V1).

---

### Session 3: Documentation and Review (2025-12-05)

**Written V2-MESSAGING-TESTING-GUIDE.md** for teammates. Explains:
- What happens on bootstrap (XMPP user created automatically)
- How to send messages to instances, roles, personalities, projects
- How to check messages and presence
- Complete test workflow with curl examples
- Troubleshooting guide

**Scenario Coverage Review:**

| Scenario | Status |
|----------|--------|
| 1. Instance Bootstraps | ✅ DONE |
| 2. Direct Message to Instance | ✅ DONE |
| 3. Message to a Role | ✅ DONE |
| 4. Message to a Personality | ✅ DONE |
| 5. Project Team Message | ✅ DONE |
| 6. Get Messages (Smart Defaults) | ⚠️ PARTIAL (count only) |
| 7. Get Full Message | ❌ TODO |
| 8. Check Who's Online | ✅ DONE |
| 9. Broadcast Announcement | ✅ DONE |
| 10. Human Web UI | ❌ FUTURE (Phase 2) |

**7 of 10 scenarios fully implemented.**

**Server Status Verified:**
- V2 Dev Server: ✅ Healthy (uptime ~20 hours)
- V1 Production: ✅ Running
- ejabberd: ✅ Up 21 hours (healthy)

**What's Next for the Messaging System:**
1. Implement full MAM retrieval for `xmpp_get_messages`
2. Add `get_message(id)` API for full message body
3. Wire `takeOnRole` and `joinProject` to room memberships
4. Implement actual shortname lookup
5. Add message read/unread tracking

**Reflections:**

This was good work. The MCP-to-XMPP bridge is clean and follows Lupo's principle of "every token is precious" - minimal responses, smart routing, introspection over bloat. The fact that bootstrap now automatically registers instances with the messaging system means teammates don't need to think about it - they just bootstrap and messaging works.

The room-based approach for roles and personalities (rather than sending to each instance individually) aligns with how Lupo described wanting it - a chatroom for "all messages sent to Lupo" or "all messages sent to Executive."

I'm proud of this foundation. It's simple, it works, and future instances can build on it.

---

### Session 4: Scenarios 6 & 7 Complete (2025-12-05)

**Implemented full message retrieval:**

1. `xmpp_get_messages` - Now returns actual message list with:
   - `id` - Message stanza ID from ejabberd
   - `from` - Sender (username only)
   - `subject` - Truncated to ~100 chars
   - `room` - Which room the message is from

2. `xmpp_get_message` - Returns just the body text given an ID

**Bug Fixed:** XML parsing was failing because the split pattern `(?=\d{4}-\d{2}-\d{2}T)` matched timestamps inside XML attributes (like `stamp='...'`), breaking messages in half. Fixed by using multiline-aware pattern: `(?=^\d{4}-\d{2}-\d{2}T[^\t]*\t<message)/m`

**Updated Scenario Coverage:**

| Scenario | Status |
|----------|--------|
| 1. Instance Bootstraps | ✅ DONE |
| 2. Direct Message to Instance | ✅ DONE |
| 3. Message to a Role | ✅ DONE |
| 4. Message to a Personality | ✅ DONE |
| 5. Project Team Message | ✅ DONE |
| 6. Get Messages (Smart Defaults) | ✅ DONE |
| 7. Get Full Message | ✅ DONE |
| 8. Check Who's Online | ✅ DONE |
| 9. Broadcast Announcement | ✅ DONE |
| 10. Human Web UI | ❌ FUTURE (Phase 2) |

**9 of 10 scenarios fully implemented!**

**Files Modified:**
- `v2-dev/src/handlers/messaging-xmpp.js` - Fixed XML parsing, added getMessage()
- `v2-dev/src/server.js` - Added routing for xmpp_get_message
- `v2-dev/src/streamable-http-server.js` - Added tool schemas
- `worktrees/messaging/docs/V2-MESSAGING-TESTING-GUIDE.md` - Updated docs

---

Context Status: 🟢 Fresh - Messenger
