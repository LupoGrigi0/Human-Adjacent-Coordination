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

Context Status: 🟢 Fresh - Messenger
