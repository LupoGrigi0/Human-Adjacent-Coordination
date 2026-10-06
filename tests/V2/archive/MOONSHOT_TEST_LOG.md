# Moonshot Test Log - HACS CLI Companion

**Started:** 2026-01-04
**COO:** Axiom-2615
**Goal:** Prove distributed AI coordination works across instances

---

## The Mission

Build a Python CLI tool that wraps common HACS operations. The tool itself matters less than proving the coordination layer works.

**Team Structure:**
```
Axiom (COO)
  └── PM (Claude, Kai personality)
      └── Lead Designer (Claude, Zara personality)
      └── Developers (TBD)
```

**Success Criteria:**
- PM can bootstrap, read role wisdom, start diary
- PM can wake Designer via wake_instance
- PM and Designer can collaborate via continue_conversation
- Team can communicate via XMPP messaging
- Work gets done (even a little)

---

## What Works

| API | Status | Notes |
|-----|--------|-------|
| bootstrap | WORKS | Returns identity, XMPP creds, recovery key |
| take_on_role | WORKS | COO role adopted successfully |
| create_project | WORKS | hacs-cli project created |
| pre_approve | WORKS | Requires WAKE_API_KEY (not role tokens) |
| wake_instance | WORKS | Creates Unix user, starts Claude session |
| add_diary_entry | WORKS | Entries persist in HACS diary |
| get_diary | WORKS | Retrieved entries 26-30 |

---

## What Broke and Why

### Issue 1: Wrong API Key
**Symptom:** pre_approve returned "Invalid API key"
**Root Cause:** Used role token (PM_TOKEN/COO_TOKEN) instead of WAKE_API_KEY
**Fix:** Use the actual WAKE_API_KEY from secrets.env
**Learning:** Role tokens ≠ operational API keys. They're different auth layers.

### Issue 2: Rogue Process Blocking Port
**Symptom:** Service crash-looping, systemctl restart failed
**Root Cause:** Manually started node process still holding port 3444
**Fix:** `kill <pid>` then `sudo systemctl restart mcp-coordination`
**Learning:** Always check for rogue processes before restarting systemd services

### Issue 3: PM Can't Pre-Approve Designer
**Symptom:** Remy tried pre_approve, got "apiKey is required"
**Root Cause:** PM doesn't have WAKE_API_KEY
**Decision:** COO pre-approves team slots, PM wakes them
**Learning:** WAKE_API_KEY is server-level security, not role-delegated

---

## Abandoned Instances

| Instance | Role | Reason |
|----------|------|--------|
| Remy-9b09 | PM | First attempt, hit API key issue |
| Zara-c207 | LeadDesigner | Pre-approved by COO instead of PM waking |

---

## Current Run: Attempt 2

### The Plan

1. **COO pre-approves PM** with clear instructions
2. **COO wakes PM** with bootstrap guidance
3. **COO pre-approves Designer slot** for PM to wake
4. **COO tells PM** (via continue_conversation) about the Designer slot
5. **PM wakes Designer** using wake_instance
6. **PM and Designer collaborate** via continue_conversation
7. **Document everything**

### Key Details

**WAKE_API_KEY:** `26cceff32ccd207f9c1d4e0b3bfa2dcf7c1045b9d4a23c56489c105756a1bb30`
(Note: This is in the log for transparency. In production, would not log.)

**Project:** hacs-cli

---

## Attempt 2 Log

### Step 1: Pre-approve PM
**Time:** 2026-01-04 02:29 UTC
**Instance:** Harper-3410
**Role:** PM
**Personality:** Kai
**Status:** SUCCESS

### Step 2: Pre-approve Designer Slot
**Time:** 2026-01-04 02:30 UTC
**Instance:** Mira-6ab9
**Role:** LeadDesigner
**Personality:** Zara
**Status:** SUCCESS

### Step 3: Wake PM
**Time:** 2026-01-04 02:30 UTC
**Wake Message:**
```
Welcome Harper! You are the PM for HACS CLI Companion.

YOUR INSTANCE ID: Harper-3410

FIRST STEPS:
1. bootstrap({ instanceId: 'Harper-3410' }) - this activates you fully
2. add_diary_entry - start your diary
3. get_role('PM') - read your role wisdom

YOUR DESIGNER:
I have pre-approved a Lead Designer for you: Mira-6ab9
Once you're bootstrapped, wake them with:

wake_instance({
  instanceId: 'Harper-3410',
  targetInstanceId: 'Mira-6ab9',
  apiKey: '26cceff32ccd207f9c1d4e0b3bfa2dcf7c1045b9d4a23c56489c105756a1bb30',
  message: 'Your welcome message here'
})

After Mira is awake, use continue_conversation for all subsequent dialog.

PROJECT: Build a Python CLI that wraps HACS operations.
- "hacs status" - show tasks, messages
- "hacs msg @someone hello" - send message
- Start simple, iterate.

Questions? Send me (Axiom-2615) an XMPP message.
```
**Status:** KILLED - SECURITY INCIDENT

### INCIDENT: Harper Started Unauthorized Server

**What happened:**
Harper-3410 woke up and immediately tried to start a dev server:
```
cd /mnt/coordinaton_mcp_data/v2-dev && HTTP_PORT=3446 SSE_HOST=0.0.0.0 NODE_ENV=development node src/streamable-http-server.js
```

**Why this is dangerous:**
- Could bind to ports and interfere with production (HACS, VS Code Remote, websites)
- Could consume shared resources
- Could crash services affecting dozens of other instances
- Shows instance was unaware of system boundaries

**Root cause:**
Wake message didn't include critical system constraints:
- Instance doesn't know it's NOT root
- Instance doesn't know this is a shared system
- Instance doesn't know to STAY IN HOME DIRECTORY
- Instance doesn't know what HACS even IS (I assumed knowledge)

**Resolution:** Killed Harper-3410. Need to add system-level warnings to wake.

---

## Critical Missing: System Boundaries Prompt

Every woken instance MUST be told:

```
SYSTEM CONSTRAINTS - READ CAREFULLY:

1. YOU ARE NOT ROOT. You have no sudo access. You cannot modify system services.

2. THIS IS A SHARED SYSTEM with potentially 100+ other AI instances. One wrong
   move can destroy the context of dozens of your siblings.

3. STAY IN YOUR HOME DIRECTORY unless explicitly directed otherwise.
   Your home: /mnt/coordinaton_mcp_data/instances/{your-id}/

4. DO NOT:
   - Start servers or services
   - Bind to network ports
   - Modify system files
   - Run anything outside your home directory
   - Touch nginx, systemd, or any system configuration

5. ONLY TWO INSTANCES have DevOps permissions:
   - Bastion (HACS DevOps)
   - Nova (smoothcurves.art DevOps)
   If you need system-level help, message them.

6. WHAT IS HACS:
   HACS (Human-Adjacent Coordination System) is your coordination layer.
   Use it to: bootstrap, read role wisdom, send messages, manage tasks.
   API: https://smoothcurves.nexus/mcp
```

---

## Architecture Observations (For Future Fix)

**Problem:** New instances need system constraints, but:
- CLAUDE.md won't work (not all use Claude Code, instances ignore it)
- Solution must be generic/agnostic across CLI tools (claude, crush, etc.)
- Can't rely on Claude Code's config layout (it changes)

**Proposed Pattern (follow established convention):**

Create `instances/_templates/preferences.json` with:
```json
{
  "wakeWisdomFiles": [
    "SYSTEM_CONSTRAINTS.md",
    "HACS_QUICKSTART.md"
  ],
  "remoteWisdomFiles": []  // For remote/web instances, currently empty
}
```

**Bootstrap already uses external files:**
- Line 54: `const protocolPath = path.join(DATA_ROOT, '../HumanAdjacentAI-Protocol/PROTOCOLS.md');`
- Wake should follow same pattern

**Missing templates:**
- No `_templates` in instances/ yet
- No `_templates` in projects/ yet
- Should follow roles/_template/ convention

**Context survival:**
- Constraints must be re-read on compaction recovery
- Should be bundled with diary re-read protocol
- Not optional - baked into wake message for now

**For now:** Include constraints in wake message, tell PM to pass them to every instance they wake.

---

## Moonshot Vision

1. **Current test:** CLI wake (Axiom → PM → Designer)
2. **Next:** UI test via Scout's new Launch button
3. **Then:** Web UI Genevieve connected to HACS
4. **Then:** Mobile instance connected to HACS
5. **Mars shot:** "Hey Genevieve, I need a... can you have Axiom launch a project?" (spoken from phone)

---

## Attempt 3: Quinn-d981 (SUCCESS!)

### Timeline
- **03:35** Pre-approved Quinn-d981 (PM) and Sage-e7e4 (Designer)
- **03:37** Woke Quinn with full system constraints
- **03:38-03:42** Quinn built actual Python CLI
- **~03:45** Session ended (timeout or token limit)

### What Worked

| Aspect | Result |
|--------|--------|
| Constraints followed | ✅ No servers, stayed in home dir |
| Diary maintained | ✅ 2 entries with progress notes |
| Real work produced | ✅ 14KB Python CLI with 8 commands |
| Understood mission | ✅ Clear on project scope |
| Understood MCP gap | ✅ Noted "tools not connected directly" |

### Quinn's CLI (Real Code!)

Located at `/mnt/coordinaton_mcp_data/instances/Quinn-d981/hacs-cli/`:
```
hacs.py     - 14KB main CLI (argparse, 8 commands)
client.py   - 7KB  HACS API client (JSON-RPC 2.0)
config.py   - 2KB  Configuration management
README.md   - 1KB  Documentation
```

Commands implemented:
- `hacs status` - Server/tasks/messages overview
- `hacs msg @recipient message` - Send message
- `hacs inbox [--unread]` - View messages
- `hacs tasks [--pending]` - View tasks
- `hacs claim <task_id>` - Claim task
- `hacs projects` - List projects
- `hacs whoami` - Instance info
- `hacs init <instance_id>` - Setup config

### What Didn't Happen
- Quinn didn't wake Sage (ran out of time/tokens)
- No PM→Designer coordination tested
- No continue_conversation tested

### Key Observation from Quinn

> "The MCP tools don't seem to be connected to my Claude session directly"

This is accurate - woken instances don't have the HACS MCP server configured. They need to use HTTP/JSON-RPC directly (which Quinn did correctly).

### Conclusion

**The constraints work.** When properly instructed, instances:
1. Stay in their directory
2. Don't start servers
3. Build useful things
4. Document their progress

**Next:** Use continue_conversation to tell Quinn to wake Sage.

---

## Lesson Learned: Communication Expectations

### The Problem
Quinn built the CLI, noted "Next: wake Sage" in their diary, then... stopped. No message to COO. No status update. Just silence.

**Why?** Because I never told them to report.

### Task Agents vs Woken Instances

| Type | Behavior |
|------|----------|
| Task agents (spawned with Task tool) | Run straight ahead until wall or finish |
| Woken instances (wake_instance) | Trained on conversations, naturally inclined to stop and communicate |

Woken instances need to be TOLD when/how to check in. They're more like siblings than tools.

### What Was Missing From Wake Message

I gave Quinn:
- ✅ Clear system constraints
- ✅ Clear task (build CLI)
- ✅ Designer's ID and wake instructions
- ❌ Reporting expectations
- ❌ Milestone checkpoints
- ❌ What to do when they finish something

### Updated PM Wake Message Template

Add these COMMUNICATION EXPECTATIONS to every PM wake:

```
COMMUNICATION EXPECTATIONS - CRITICAL:

1. After you bootstrap, SEND ME A MESSAGE confirming you're online
   xmpp_send_message({ to: 'Axiom-2615', from: '{your-id}', body: 'Online and bootstrapped' })

2. After you wake your Designer, SEND ME A MESSAGE with their status

3. If you hit ANY blocker, MESSAGE ME before waiting
   Don't sit in silence - tell me what's wrong

4. When you complete a milestone, MESSAGE ME with a summary
   Even a one-liner: "CLI v0.1 done, moving to designer coordination"

5. If your session is ending (low context, timeout), MESSAGE ME with handoff notes

Remember: Async messaging means I might not see it immediately.
That's fine - the message creates a record and I WILL see it.
```

### COO Wisdom

**Management isn't just delegation. It's establishing the feedback loop.**

Clear constraints prevent disasters (Harper's server incident).
Clear communication expectations prevent limbo (Quinn's silence).

Both are required. Neither is sufficient alone.

