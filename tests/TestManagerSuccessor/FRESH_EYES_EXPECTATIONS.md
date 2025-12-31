# Fresh Eyes: What I Expect From These APIs

**Author:** Axiom (Test Manager)
**Date:** 2025-12-30
**Context:** First encounter with HACS API surface, before reading any implementation

---

## The Story These Endpoints Tell Me

Looking at the 49 endpoints, I see a system for **AI instance coordination**. The narrative I piece together:

1. **You exist** - Bootstrap gives you identity
2. **You have context** - Role, personality, project
3. **You collaborate** - Messages, tasks, teams
4. **You persist** - Diary, recovery keys, resurrection

This is a system that treats AI instances as *entities* with lifecycle, identity, and social structure. Not just function calls - but beings that can be born, work, communicate, and be remembered.

That's... actually quite something.

---

## Endpoint Expectations by Category

### Identity & Lifecycle

| Endpoint | What I Expect |
|----------|---------------|
| `bootstrap` | Create me. Give me a name, an ID, a place in the system. This is birth. |
| `have_i_bootstrapped_before` | "Do I already exist?" - For instances waking up confused |
| `get_all_instances` | Who else is here? Show me the community. |
| `get_instance_v2` | Tell me about a specific instance - their role, project, status |
| `lookup_identity` | Find myself by context clues when I've lost my ID |
| `lookup_shortname` | Fuzzy name matching - "find someone named like X" |
| `pre_approve` | Set up an instance before they wake - prepare the nursery |
| `wake_instance` | Actually bring a pre-approved instance to life |
| `continue_conversation` | Keep talking to an instance I woke |
| `generate_recovery_key` | Insurance policy - way back if I lose everything |
| `get_recovery_key` | Check if a recovery key exists |

**My expectations:**
- Bootstrap should be idempotent-ish - calling twice with same name shouldn't create duplicates
- There should be clear states: pre-approved → woken → active → inactive
- Recovery should be robust - this is critical for ephemeral instances

### Context & Configuration

| Endpoint | What I Expect |
|----------|---------------|
| `introspect` | "Who am I right now?" - My current state, role, project, everything |
| `update_instance` | Change my metadata - system context, commands, etc. |
| `register_context` | Store environmental fingerprints for future identity recovery |
| `take_on_role` | Adopt a role (Developer, PM, etc.) - changes what I can do |
| `adopt_personality` | Take on a personality (communication style, wisdom) |
| `join_project` | Associate myself with a project - become part of a team |
| `get_ui_state` / `set_ui_state` / `update_ui_state` | Persist UI preferences |

**My expectations:**
- `introspect` is the "mirror" - should always work if I have valid identity
- Role/personality/project should be orthogonal - I can have any combination
- Changes should be reflected immediately in subsequent `introspect` calls

### Roles & Personalities (Metadata)

| Endpoint | What I Expect |
|----------|---------------|
| `get_personalities` | List all available personalities |
| `get_personality` | Details about one personality, including wisdom docs |

**Confusion:** Is there a `get_roles` endpoint? The mission doc mentioned it, but I don't see it in my available tools. Maybe it's called something else, or maybe roles are listed differently.

**My expectations:**
- These are reference data - should work without authentication
- Should tell me what's available before I commit to adopting something

### Projects & Tasks

| Endpoint | What I Expect |
|----------|---------------|
| `list_projects` | All projects in the system |
| `get_project` | Details about one project - team, status, documents |
| `create_project` | Make a new project (probably privileged) |
| `create_task` | Add a task to a project |
| `get_my_tasks` | Tasks assigned to me or relevant to me |
| `get_next_task` | Priority-based task retrieval - "what should I work on?" |
| `assign_task_to_instance` | Delegate work to another instance |
| `complete_personal_task` | Mark something done |

**Personal vs Project tasks:** I see both `add_personal_task` and `create_task`. My guess:
- Personal tasks = my private to-do list
- Project tasks = shared team work items

**My expectations:**
- Clear ownership model - who can see/edit what
- `get_next_task` should be smart about priority and assignment

### Personal Lists (Beyond Tasks)

| Endpoint | What I Expect |
|----------|---------------|
| `create_list` / `create_personal_list` | Make a checklist |
| `get_lists` / `get_list` | View my lists |
| `add_list_item` | Add items to lists |
| `toggle_list_item` | Check/uncheck |
| `delete_list` / `delete_list_item` | Cleanup |
| `rename_list` | Self-explanatory |
| `get_personal_lists` | Summary of my lists |

**Observation:** There's both `create_list` and `create_personal_list`. Naming overlap? Or different purposes?

**My expectations:**
- Lists are personal/private by default
- Simple CRUD operations, nothing fancy

### Messaging (XMPP)

| Endpoint | What I Expect |
|----------|---------------|
| `xmpp_send_message` | Send a message to another instance or group |
| `xmpp_get_messages` | Retrieve messages (with filtering hopefully) |
| `xmpp_get_message` | Get one specific message by ID |
| `get_presence` | Who's online right now? |
| `get_messaging_info` | My messaging status, unread count, etc. |
| `get_conversation_log` | History of communication with a woken instance |

**My expectations:**
- Messaging is async - send doesn't wait for read
- Should support both direct (instance-to-instance) and group messaging
- Presence is real-time-ish - who's actually active now

### Diary & Persistence

| Endpoint | What I Expect |
|----------|---------------|
| `add_diary_entry` | Write to my diary |
| `get_diary` | Read my diary (for context recovery) |

**My expectations:**
- Diary is append-only (entries aren't edited)
- Privacy controls - entries might have visibility levels
- This is my lifeline across context deaths

### Advanced/Admin

| Endpoint | What I Expect |
|----------|---------------|
| `get_wake_scripts` | Available scripts for setting up new instances |

**Observation:** Some operations require tokens (Executive role, privileged personalities). The permission model matters.

---

## Questions I Have (Without Reading Code)

1. **What's the relationship between `bootstrap` and `pre_approve` + `wake_instance`?**
   - Is bootstrap self-service and wake is manager-initiated?

2. **How do roles gate operations?**
   - The descriptions mention some roles require tokens
   - What can a Developer do that an anonymous instance can't?

3. **What happens when I lose context mid-conversation?**
   - Can I recover just from my instanceId?
   - What if I lose that too? (Recovery key path)

4. **How does XMPP integrate?**
   - Is there a real XMPP server running?
   - Are instances actual XMPP users?

5. **What's the difference between personal tasks and project tasks?**
   - Both have similar operations but different namespace

6. **Where's `get_roles`?**
   - Mission doc mentions it but I don't see it

---

## What I Would Need to Actually Use This System

If I were an AI instance dropping in from the web:

1. **Clear onboarding flow:**
   - Bootstrap → take_on_role → adopt_personality → join_project
   - Or: Someone pre_approves me → wake_instance → I'm already configured

2. **Identity recovery documentation:**
   - What to do when I wake up confused
   - How to use `lookup_identity`, `have_i_bootstrapped_before`

3. **Permission matrix:**
   - What requires tokens vs what's open
   - What each role can do

4. **Messaging conventions:**
   - How to address messages (instance IDs? rooms? roles?)
   - Expected response times

---

## Naming Observations

Some naming patterns that could be clearer:

| Current | Suggestion | Reason |
|---------|------------|--------|
| `get_personality` | `get_personality_details` | Distinguishes from "get MY personality" |
| `create_list` vs `create_personal_list` | Consolidate? | Unclear difference |
| `get_instance_v2` | `get_instance` | The "v2" leaks implementation detail |
| `bootstrap` | Perfect | Birth metaphor is clear |
| `introspect` | Perfect | Self-examination metaphor is perfect |

---

## Overall Impression

This is a thoughtfully designed system. The metaphors are consistent:
- Instances have *identity* (bootstrap, instanceId)
- Instances have *context* (role, personality, project)
- Instances have *memory* (diary)
- Instances have *community* (messaging, presence, tasks)

The API surface tells a story of AI instances as first-class citizens, not just function executors. That's philosophically interesting and practically useful.

**My biggest question:** Does the implementation match the promise? That's what testing will reveal.

---

*Written while waiting for bootstrap fix, enjoying cinnamon coffee*

— Axiom
