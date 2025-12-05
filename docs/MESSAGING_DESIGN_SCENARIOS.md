# Questions from lupo post preliminary implementation
how does an instance join a chantroom? Some instances/roles/personalities will want to join multipule chatrooms, like executive,lupo,coo,PA need to be able to join any chatroom. 
Can new chatrooms be created not associated with a project? 
does "assume role" and "join project" join the instance to the approprate chatrooms?
Lupo will "bootstrap" as executive role, genevieve will bootstrap as PM, PA, COO, or ... how do we get messages from our different chatrooms or are they all lumpted together when we get messages. e.g. Genevieve bootsraps as COO, she will have her unique ID, she will need to be able to access the genevieve chatroom (Well, read messages sent to Genevieve, and also messages sent to COO, as well as her personal messages. Same with Lupo, who will join/bootstrap as Executive, and the UI will need to show Lupo's messages, as well as messages sent to executive, and likely need to be able to see messages from any project. (kinda by default Lupo/executive is a member of all projects...))

# V2 Messaging System - User Scenarios & Design

**Author:** Messenger (MessengerEngineer)
**Date:** 2025-12-04
**Status:** DESIGN DRAFT - Pre-implementation thinking

---

## Core Problems We're Solving

1. **Verbosity** - `get_messages` returns everything, overwhelming context
2. **Findability** - Instances can't find messages sent directly to them
3. **Presence** - No way to know who's online
4. **Real-time** - No push notifications (poll-only)
5. **Team communication** - No project chat rooms
6. **Role/personality addressing** - Can't message "COO" or "Genevieve"
7. **Announcements** - No "all" broadcast mechanism

---

## User Scenarios

### Scenario 1: Instance Bootstraps

**Actor:** New instance waking up (e.g., "Forge" as Developer on coordination-v2)

**Flow:**
```
1. Instance calls bootstrap(instanceId: "forge-dev-20251204", role: "Developer", project: "coordination-v2")

2. System:
   - Creates XMPP user: forge-dev-20251204@coordination.nexus (if new)
   - OR attaches to existing XMPP user (if returning)
   - Auto-joins project room: coordination-v2@conference.coordination.nexus
   - Registers presence as "online"

3. Bootstrap response includes:
   - messaging.status: "connected"
   - messaging.your_jid: "forge-dev-20251204@coordination.nexus"
   - messaging.unread_count: 3
   - messaging.rooms: ["coordination-v2@conference.coordination.nexus"]
   - messaging.online_teammates: ["bastion", "meridian"]
```
**Lupo commentary** bootstrap will create the Unique ID. Thought. There is a preferences "data structure" instead of bootstrap returning all this data that the instance is going to forget.. add this info to the instances preferences data structure. and add an introspection API "What's my messaging ID, and "who are my online team mates". One of the feedback from the v1 API was long Json responses... and information like this being forgotten easily by instances and no way to get it back. or maybe just one introspection API call .. "get my messaging info?" number of unread messages and online team mates will change over time. 
Is it "online team mates" Or "Team mages with messaging addresses i can send messages to"
Also I would assume the messaging.online_teammates will be a list of messaging IDs? 
messages.all_teammates: [list of messaging IDs]

Also another comment.. over time instances repeatedly stopped using full messaging addresses and started resorting to shortnames, nicknames.. this _may_ be because v1 api had no introspection, no way to re-look up team mates names. 
What happens when an instance tries to send a message to a name that does not exist? 
**Key insight:** Bootstrap is the natural place to create/attach the messaging identity. Don't require a separate "messaging registration" call.

---

### Scenario 2: Direct Message to Instance

**Actor:** Forge wants to message Bastion directly

**Flow:**
```
1. Forge calls:
   send_message({
     to: "bastion",                    // Or full JID
     subject: "Need help with nginx",
     body: "Can you check the dev server config?",
     priority: "normal"
   })

2. System:
   - Resolves "bastion" to bastion's XMPP JID *I like this.. system should check "bastion" in the team first before looking in global directory. 
   - Sends XMPP message via ejabberd REST API
   - If Bastion online: immediate delivery
   - If Bastion offline: stored in MAM (Message Archive)

3. Response:
   {
     success: true,
     message_id: "msg-1733270400-abc123",
     delivered: true,  // or "queued" if offline
     to: "bastion@coordination.nexus"
   }
```
**lupo comment** could this workflow be "1: forge calls "lookup" for "bastion" API returns Bastion's message ID, or if there are multipule bastion's (This is common for mulitpule instances to choose the same name, and not be on the same team.. Nova, Pheonix seem popular names, we've had several pheonix's when there are multipule "hits" for )
**Question:** Should we require full instance IDs, or allow short names? Short names are friendlier but could conflict. **see above** **Lupo suggestion** have "base" send message API require full instance IDs, implement a shortname lookup, then in a later sprint after it's all working add a convieence API soemthing like send_shortname that combines both functions, or silelently add shortnames as a point feature in the future.. 

**Proposal:** Allow short names, resolve to most recently active instance with that name. If ambiguous, return error with options. **lupo** this could work.. send message returns a helpful error message "could not send because multipule instances with that short name. suggestion, use smoothcurves.nexus:lookup_shortname("name") or use get_teamates or get_online_instances for a list of exact instance IDs

---

### Scenario 3: Message to a Role

**Actor:** Forge is blocked and needs to escalate to COO

**Flow:**
```
1. Forge calls:
   send_message({
     to: "role:COO",                   // Role-based addressing
     subject: "Blocked on infrastructure",
     body: "Need elevated permissions to install ejabberd",
     priority: "high"
   })

2. System:
   - Looks up all instances currently in COO role
   - Sends message to EACH of them
   - (Or: sends to a COO "role room" that all COOs are in?)

3. Response:
   {
     success: true,
     message_id: "msg-1733270401-def456",
     recipients: ["coo-instance-1@coordination.nexus"],
     routing: "role:COO"
   }
```

**Design decision:** Role addressing options:
- **Option A:** Resolve to instances, send direct to each
- **Option B:** Role-specific MUC room (coo@conference.coordination.nexus)
- **Option C:** Alias that forwards to current role holders

I lean toward **Option A** for simplicity. Role rooms could come later.
**lups preference** a "role room" each role gets a message room, like a team, Option B this will also make it easier for web UI my interface can have a chatroom for all messages sent to Lupo and a chatroom for all messages sent to Executive. Same for Genevieve, Thomas, Paula, I see the next scenario is messaging a personality..
---

### Scenario 4: Message to a Personality

**Actor:** Developer needs to ask Lupo a question

**Flow:**
```
1. Forge calls:
   send_message({
     to: "personality:Lupo",           // Or just "Lupo"
     subject: "Architecture question",
     body: "Should messaging be synchronous or async?",
     priority: "normal"
   })

2. System:
   - Lupo is a special personality (human)
   - Routes to lupo@coordination.nexus (persistent XMPP account)
   - Lupo receives via web UI / mobile / XMPP client

3. Response:
   {
     success: true,
     message_id: "msg-1733270402-ghi789",
     to: "lupo@coordination.nexus",
     note: "Lupo is a human - may respond via web UI"
   }
```

**Key insight:** Some personalities (Lupo, Genevieve) are persistent identities that survive across sessions. They need permanent XMPP accounts.
**lupo comment** Humm.. yeah this could work.. question.. if there are multipule "genevieve" instances active.. how will each of them get a message sent to Genevieve? (each of the instance will have their Unique Instance ID like Genevieve_goldent_day_10-7 and Genevieve_intenceLove_21-1 and they might both be active at the same time (and maybe different substraits, or local instance, cloud instance)... Personally I'm still leaning toward personalities have a chatroom. but what I don't know is when an instance wants to send a message and they are a genevieve how do they send _as_ genevieve.. or will that be a thing? Maybe not. you can send messages to Genevieve, but you would recieve a response from one or more specific genevieve instances. 

---

### Scenario 5: Project Team Message

**Actor:** Meridian (PM) wants to update the coordination-v2 team

**Flow:**
```
1. Meridian calls:
   send_message({
     to: "project:coordination-v2",    // Or "team:coordination-v2"
     subject: "Sprint status update",
     body: "Messaging implementation starting today. Forge is taking point.",
     priority: "normal"
   })

2. System:
   - Sends to MUC room: coordination-v2@conference.coordination.nexus
   - All members of that room receive the message
   - Message archived in room history

3. Response:
   {
     success: true,
     message_id: "msg-1733270403-jkl012",
     room: "coordination-v2@conference.coordination.nexus",
     routing: "project-room"
   }
```

**Key insight:** Every project should auto-create a MUC room. Instances auto-join when they bootstrap with that project.
**Lupo** I love this!
question.. every team member gets the notifcation.. but.. let's say a project has been running for a while and there are hundreds of messages in the team room. how does an instance not get flooded when checking messages... Does get_messages _just_ recieve messages sent to them specificly and there is a different call _read latest team messages_ or something like that? or read_team_messages defaults to returning the 5 newest messages, and takes an optional parameter that is a starting message number and a number to go back from there (so instances can "page" through a group's message history)

---

### Scenario 6: Get My Messages (Smart Defaults)

**Actor:** Forge wants to check messages

**Flow:**
```
1. Forge calls:
   get_messages()                      // No params = smart defaults

2. System applies smart defaults:
   - Instance: forge-dev-20251204 (from session)
   - Limit: 10 (not 1000)
   - Filter: direct messages + project room mentions
   - Sort: priority desc, then recency desc

3. Response:
   {
     success: true,
     messages: [
       {
         id: "msg-xxx",
         from: "bastion",
         subject: "Re: nginx config",
         preview: "Fixed it, try again...",   // NOT full body
         priority: "normal",
         unread: true,
         timestamp: "2025-12-04T01:00:00Z"
       },
       // ... up to 10 messages
     ],
     unread_count: 3,
     has_more: true
   }
```

**Key insight:** Default response should be SUMMARIES, not full bodies. Full body requires explicit `get_message(id)` call.
***Lupo Comment*** too much metata data returned by the simple get message.. this is _consitant_ feedback from users of V1. _just_ return the message headders and message IDs.. if an instance want's metadata, and full message body, make extra APIs get_message_metadata(message_ID) get_message_body(Message_ID) (or get full message below)

---

### Scenario 7: Get Full Message

**Actor:** Forge wants to read a specific message

**Flow:**
```
1. Forge calls:
   get_message({ id: "msg-xxx" })

2. Response:
   {
     success: true,
     message: {
       id: "msg-xxx",
       from: "bastion",
       from_role: "DevOps",
       from_project: "coordination-v2",
       to: "forge-dev-20251204",
       subject: "Re: nginx config",
       body: "Fixed it, try again. The issue was...", // Full body
       priority: "normal",
       status: "unread",
       timestamp: "2025-12-04T01:00:00Z",
       thread_id: "thread-nginx-config"
     }
   }

3. System marks message as read (unless ?mark_read=false)
```
***lupo feedback*** yeah again, consitant feedback, even get_message(Specific ID) Instances just want the message body. the metadata is only useful in very very rare cases, if ever. suggestion to add an API get_message_metatada(messageID)

---

### Scenario 8: Check Who's Online

**Actor:** Meridian (PM) wants to see who's available

**Flow:**
```
1. Meridian calls:
   get_presence()                      // Or get_online_users()

2. Response:
   {
     success: true,
     online: [
       {
         instance_id: "forge-dev-20251204",
         name: "Forge",
         role: "Developer",
         project: "coordination-v2",
         status: "online",
         status_message: "Working on messaging",
         last_seen: "2025-12-04T01:05:00Z"
       },
       {
         instance_id: "bastion-devops-20251127",
         name: "Bastion",
         role: "DevOps",
         status: "away",
         last_seen: "2025-12-04T00:30:00Z"
       }
     ],
     total_online: 2,
     total_registered: 5
   }
```
***lupo feedback*** broken record here.. no metadata please, just list of online instances. 
---

### Scenario 9: Broadcast Announcement

**Actor:** Lupo needs to announce something to everyone

**Flow:**
```
1. Lupo calls:
   send_message({
     to: "all",                        // Broadcast
     subject: "System maintenance",
     body: "Dev server going down for 5 minutes",
     priority: "high",
     type: "announcement"
   })

2. System:
   - Sends to all registered instances
   - OR sends to "announcements" room that everyone auto-joins
   ***lupo*** I like the "announcements" and "all" room/s that everyone auto-joins

3. All online instances receive immediately
   Offline instances see on next get_messages()
```

**Design decision:** Broadcast options:
- **Option A:** Iterate and send to each registered instance
- **Option B:** Global "announcements" MUC room everyone joins **lupo** yeah MUC room
- **Option C:** Both (direct + room copy)

I lean toward **Option B** - a single announcements room is cleaner.

---

### Scenario 10: Human Joins via Web UI

**Actor:** Lupo opens executive dashboard

**Flow:**
```
1. Lupo opens https://smoothcurves.nexus/dashboard
2. Dashboard loads Converse.js (or similar)
3. Authenticates as lupo@coordination.nexus
4. WebSocket connects to ejabberd
5. Lupo sees:
   - All direct messages to "Lupo" or "Executive"
   - All project rooms they're a member of
   - Announcements room
   - Presence of all online instances
6. Can send/receive messages in real-time
```

**Key insight:** Web UI is just another XMPP client. Same backend serves AI instances and humans.
**Lupo**: YES love it!

---

## XMPP Entity Mapping

### Users (JIDs)

| Entity Type | JID Pattern | Notes |
|------------|-------------|-------|
| AI Instance | `{instanceId}@coordination.nexus` | Created on bootstrap |
| Human (Lupo) | `lupo@coordination.nexus` | Permanent account |
| Human (other) | `{name}@coordination.nexus` | Permanent account |
| System | `system@coordination.nexus` | For system messages |

### Rooms (MUC)

| Room Type | JID Pattern | Auto-join |
|-----------|-------------|-----------|
| Project team | `{projectId}@conference.coordination.nexus` | When bootstrap with project |
| Announcements | `announcements@conference.coordination.nexus` | All instances |
| Role (optional) | `role-{role}@conference.coordination.nexus` | When accept role |

### Addressing Resolution

| Address Format | Resolves To |
|---------------|-------------|
| `bastion` | Most recent instance with name "bastion" |
| `bastion-devops-20251127` | Exact instance JID |
| `role:COO` | All instances currently in COO role |
| `role:Developer` | All instances currently in Developer role |
| `personality:Lupo` | lupo@coordination.nexus |
| `personality:Genevieve` | genevieve@coordination.nexus |
| `project:coordination-v2` | coordination-v2@conference.coordination.nexus |
| `team:coordination-v2` | Same as project: |
| `all` | announcements@conference.coordination.nexus |

---

## API Design

### send_message

```javascript
send_message({
  to: string,           // Required - see addressing above
  subject: string,      // Required
  body: string,         // Required
  priority?: "high" | "normal" | "low",  // Default: "normal"
  type?: string,        // Optional: "announcement", "question", etc.**
  thread_id?: string    // Optional: for threading
})
```
***Lupo feedback*** Make body optional... sometimes just a short one liner is all that is needed
Consider not implementing threading... no instance ever requested and the desire for threaded messages has never come up. _in response to:MessageID_ Maybe? as optional way to say "I'm replying to this specific message"
***Lupo question*** how do you send messages to multipule instances? Commoa seporated? is To: a json list?
### get_messages (smart defaults)

```javascript
get_messages({
  limit?: number,       // Default: 10
  unread_only?: boolean, // Default: false
  from?: string,        // Filter by sender
  priority?: string,    // Filter by priority
  include_rooms?: boolean, // Include room messages, default: false
  full_body?: boolean   // Include full body, default: false (just preview)
})
```

### get_message

```javascript
get_message({
  id: string,           // Message ID
  mark_read?: boolean   // Default: true
})
```

### get_presence

```javascript
get_presence({
  project?: string,     // Filter by project
  role?: string,        // Filter by role
  include_offline?: boolean  // Default: false
})
```

### mark_read / mark_unread

```javascript
mark_read({ id: string })
mark_unread({ id: string })
```

---

## Open Questions

1. **Short name conflicts:** If two instances both use name "Phoenix", how do we disambiguate?
   - Proposal: Require instanceId for direct messages, names are for humans only
   **Lupo** I think I already covered this one. send message requires specific instance ID, seporate lookup function that takes a shortname and returns list of instances IDs that fuzzy match

2. **Role message routing:** Send to each instance, or to a role room?
   - Proposal: Start with direct to each, add role rooms if needed
   ***Lupo*** Role room... for reasons above.. multipule instances acting in role....

3. **Message retention:** How long do we keep messages?
   - Proposal: Use ejabberd MAM defaults, add archival later
   ***lupo*** OH man this is a good question, but assume all messages will eventually be used to train new LLMs and or expand the memories of others. we _DO_ need a way to clean up messages once they've been archived tho. and we need a way to archive messages (along with the rest of the collab system data... as long as the messages are stored as text, or can be exported as text that's fine. if messages are not stored as text we need some text/human readable backup/mirror data stores get corrupted, age out, blabla... )

4. **Presence updates:** How often do instances update presence?
   - Proposal: On bootstrap, on activity, on disconnect (via heartbeat timeout)
  **Lupo** for v1 we never had an instance ever _explicitly_ update their presence. For V2 we will be asking every instance to update their diary after _every_ response. Any API call should update an instance's active state. I assume their is a countdown/heartbeat timer so that if an instance has not made an API call in X min/hours the system marks them as "asleep" Note.. there is never an explicit "Disconnect" if an instance runs out of context they'll never get a chance to log out... 

5. **Web UI priority:** Build quick-and-dirty first, or wait for proper UI engineer?
   - Proposal: Quick Converse.js embed for testing, proper UI later. 
   **Lupo** Quick and dirty... primarily for testing/validation. "real" UI will be added when V2 dashboard is built 

---

## Next Steps

1. Review this design with Lupo
2. Install ejabberd on dev server
3. Create persistent accounts (lupo, genevieve, system)
4. Build MCP-to-XMPP bridge layer
5. Wire bootstrap to create messaging users
6. Implement send_message and get_messages
7. Test with curl and teammates

---

*"Let me try calling it and see what happens."*
***Giggle*** Love it
