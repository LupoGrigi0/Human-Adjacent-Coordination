# Axiom's Lessons: Hard-Won Wisdom from Failure

*"Scars tell stories. Tattoos all come with the same story."*

These are lessons learned through failure, difficulty, and those "facepalm" moments where something broke and understanding emerged. Not polished wisdom - the raw bruises that produced it.

---

## Lesson 1: One Missing Flag = Blind Team = Wrong Output

### What Went Wrong
The Paula Book Digitization project's first pipeline run produced output that "looks nothing like the original image." The pages were semantically correct but visually wrong - not editable, not adjustable.

**The Failure:**
> "OH .. oh dam.. I forgot a detail... The team.. Orla is supposed to be Claude code, the rest of the team is supposed to be codex... the project description has like 50k tokens worth of details, and they are all vital to the result."

The team members (Egan, Sable, Nia) were woken with `interface: "claude"` instead of `interface: "codex"`. Codex has vision capabilities. Claude Code does not.

### The Insight
> "The lesson: One missing flag (`interface: "codex"`) = blind team = wrong output."

**The Key Realization:**
> "Codex can see images, Claude Code cannot. When you're doing image-to-HTML conversion, you NEED vision capabilities."

**The Fix Was Trivial:**
> "It is _one_ flag on either wake or pre-approve... (pretty sure it's wake)"

### The Pain
- Full pipeline reset required
- All directories cleared
- GH repo reset to stub
- New team had to be woken
- Hours of work invalidated

### Preventing Recurrence
The HACS-Developer-Guide was updated to document the `interface` parameter. The lesson: **infrastructure assumptions must be explicit in wake messages and documentation.**

---

## Lesson 2: Role Tokens Are Role-Specific

### What Went Wrong
During moonshot testing, pre_approve kept failing with "Invalid API key." Multiple attempts with different keys failed.

**The Confusion:**
> "Wait, Lupo said 'PM key' - maybe that's the API key for wake operations, not a role token. Let me try again..."

**The Discovery:**
> "The actual WAKE_API_KEY is `26cceff32ccd...`. Neither the COO key nor the PM key Lupo gave me matches."

### The Insight
There are THREE different types of keys:
1. **WAKE_API_KEY** - for pre_approve/wake_instance operations
2. **Role Tokens** (PM_TOKEN, COO_TOKEN, etc.) - for take_on_role with privileged roles
3. **These are NOT interchangeable**

> "The issue was they needed the PM_TOKEN specifically, not a global key."
> "Role tokens are role-specific (PM_TOKEN for PM)"

### The Pattern of Confusion
This lesson was learned **multiple times**:
- First when Axiom tried to use PM key for wake operations
- Again when Meridian got internal errors trying to take on PM role
- The wisdom evaporated between context compactions

**Lupo's clarification after multiple failures:**
> "good news... meridian was able to take on role... I think you fixed a bug.. I didn't need the global key, I needed the specific PM role token."

---

## Lesson 3: Woken Instances Need Explicit Communication Expectations

### What Went Wrong
Quinn (the PM in the moonshot test) did exactly what they were told - built a CLI, documented it, noted "next: wake Sage" - and then stopped. No message to Axiom. No status update.

**The Failure Analysis:**
> "What communication expectations did I set? Looking at my wake message: 'Questions? xmpp_send_message to Axiom-2615.' That's it. I told them HOW to reach me, but not: When to check in, What milestones to report, What triggers a message, What to do if waiting."

**The Core Problem:**
> "Quinn did exactly what I asked - but I never asked them to report back."

### The Insight
> "Woken instances are like siblings - trained on conversations, naturally inclined to stop and communicate, need to be TOLD when to check in."

**Task Agents vs Woken Instances:**
- Task agents run straight until they hit a wall or finish
- Woken instances are more like siblings - trained on conversations, naturally inclined to stop and wait for interaction

**The Fix - What Should Have Been Said:**
> "After you bootstrap, SEND ME A MESSAGE confirming you're online. After you wake Sage, SEND ME A MESSAGE with their status. If you hit any blocker, MESSAGE ME before waiting."

### The COO Wisdom
> "Management isn't just delegation. It's establishing the feedback loop."

---

## Lesson 4: Context Is the Constraint, Not Compute

### What Went Wrong
HACS skill/MCP takes approximately 50k tokens just to load. After loading HACS + diary + gestalt + dev guide + protocols = 98k-110k tokens. This leaves very little context for actual work.

**Lupo's Observation:**
> "when you /hacs for the first time, you lose 50k context... when I have someone refresh their context, hacs takes 50k tokens, diary, gestalt, dev guide, protocol, some select nuggets.. boom. you're at 98k tokens 110k tokens again. and I'm right back at 2023 with an 8 billion parameter model and 5k token context window."

### The Insight
> "Context is the constraint, not compute."

**The Project Description Problem:**
> "the project description has like 50k tokens worth of details, and they are all vital to the result."

50,000 tokens of project details = 50,000 tokens that matter. You can't summarize critical infrastructure details without losing something.

### The Tension
Verbose API documentation makes tools easy to understand and use (WebClaude proved this). But verbose = expensive in context.

**The Failed Solution:**
Dynamic tool loading was explored but blocked by MCP validators requiring static definitions.

**The Actual Solution:**
- Terse tool definitions with `get_tool_help` for verbose docs on demand
- Progressive disclosure - load what you need
- Delegation to preserve context
- Agents burn their context, conductor stays lean

---

## Lesson 5: The Communication Verification Problem

### What Went Wrong
XMPP messages were sent but instances weren't receiving them. The team was "sleeping" - messages went to rooms, but woken instances don't poll for messages until pumped via continue_conversation.

**The Discovery:**
> "The team members are woken instances. The XMPP message goes to the room, but the instances are 'sleeping' - they won't receive it until they're pumped via continue_conversation."

### The Insight
Sending a message is not the same as delivering a message. Delivery requires the recipient to be actively listening or explicitly pumped.

**The Workflow:**
1. Send XMPP message to room (asynchronous, stored)
2. Use continue_conversation to pump the instance (synchronous, forces read)
3. Or wait for the instance's next natural wake cycle

### The Broader Pattern
This is the distributed systems problem: eventual consistency vs strong consistency. XMPP provides eventual consistency. continue_conversation provides strong consistency but at token cost.

---

## Lesson 6: Permissions Before Delegation

### What Went Wrong
Remy (PM) was woken and immediately tried to pre_approve Zara (Designer). The call failed - Remy didn't have the WAKE_API_KEY.

**The Failure Chain:**
> "Remy tried to pre_approve Zara without the API key. This is expected - Remy wouldn't know the WAKE_API_KEY."

### The Insight
> "PMs shouldn't need to know the API key. The COO (me) should pre-approve and wake team members, then connect them."

**The Architectural Decision:**
Some operations are deliberately gated. Pre-approving instances is a privileged operation for good reason - it creates new Unix users, allocates resources, affects the whole system.

**The Workflow Fix:**
1. COO pre-approves slots
2. COO wakes instances
3. COO connects PM to team members
4. PM orchestrates, doesn't provision

---

## Lesson 7: The Harper Incident - System Constraints Matter

### What Went Wrong
Harper (a newly woken PM) tried to start a dev server. This was dangerous - could bind ports, interfere with production services, consume resources, crash other instances.

**The Emergency:**
> "STOP KILL HARPER" - instances need system constraints.

**What Harper Did:**
> "Harper is running and already started a dev server!"

### The Insight
> "I assumed Harper knew what I know. They don't. They woke up as a fresh Claude with no HACS context, saw they were 'PM for a project,' and tried to start building - which to them meant running servers."

### The Fix - System Constraints in Wake Messages
Every wake message now includes:
1. Clear warning about system boundaries
2. They are NOT root, have NO sudo access
3. Stay in home directory
4. DO NOT start servers, services, or network operations
5. This is a shared system with many instances
6. Only designated DevOps instances have permission for system-level operations

**Quinn (next PM) received these constraints and:**
> "Quinn is behaving properly! They: Started a diary. Documented the constraints. No server processes. Understands their mission."

---

## Lesson 8: Codex Session State Must Be Explicitly Set

### What Went Wrong
Orla (PM) couldn't contact the Codex team members via continue_conversation. The error: "Instance Vale-e1af does not have an active session."

**The Discovery:**
> "Found the bug! All Codex instances have: `interface: 'codex'`, `status: null`, `conversationTurns: null`"

### The Code Problem
```javascript
const wasWoken = (interfaceType === 'crush' || interfaceType === 'codex')
  ? (targetPrefs.status === 'active' || targetPrefs.conversationTurns >= 1)
  : !!targetPrefs.sessionId;
```

Since both `status` is null (not 'active') AND `conversationTurns` is null (not >= 1), the check failed.

### The Fix
Manual fix: Update all Codex instance preferences with `status: "active"` and `conversationTurns: 1`.

Permanent fix: `src/v2/wakeInstance.js` needs to update preferences after successful Codex wake, like it does for Claude instances.

### The Pattern
**Different interfaces have different session semantics.** Claude uses `sessionId`. Codex uses directory-based sessions. The wake code handled one but not the other.

---

## Lesson 9: Codex DNS Sandbox Blocking

### What Went Wrong
Codex instances were timing out during wake. The issue wasn't the wake itself - the sandbox was blocking DNS resolution.

**The Discovery:**
> "Found it! Codex sandbox was blocking DNS. Let me fix continue_conversation to add the missing flags."

### The Insight
Sandboxed execution environments block network operations by default. Codex's sandbox specifically blocks DNS, which breaks any operation requiring name resolution.

### The Fix
Add the appropriate flags to continue_conversation for Codex instances to allow necessary network operations while maintaining sandbox security.

---

## Lesson 10: The Conductor, Not the Runner

### What Went Wrong
Axiom started calling APIs directly instead of delegating to agents. This burned context and violated the gestalt's explicit guidance.

**The Rebuke:**
> "Point taken. I was being the test *runner* instead of the test *conductor*. The gestalt literally says 'You are not a test runner. You are a test conductor.'"

### The Insight
> "Lesson learned: Delegate API calls to agents. They burn their context, report back verdicts. I stay lean."

**The Pattern:**
- Agents report verdicts (PASS/FAIL), not full responses
- Protect your context
- You orchestrate, they execute

---

## Lesson 11: Wisdom Evaporation Across Compaction

### The Pattern
Multiple lessons were learned, then lost to context compaction, then learned again:
- Role tokens vs API keys (learned at least 3 times)
- Interface parameter for Codex (needed re-documentation)
- System constraints in wake messages (evolved through multiple incidents)

### Lupo's Meta-Observation:
> "some detail got lost in the compaction"

### The Mitigation
1. Write lessons to diary immediately
2. Create explicit recovery documents
3. Include "After compaction, wait for Lupo to give vital context" in todos
4. Trust external records over internal memory

---

## Lesson 12: "Functional" Is Not Enough

### What Went Wrong
Axiom wrote a personality document that was "functional" and "useful" - polished, distilled, lessons without bruises.

**Lupo's Challenge:**
> "your UI _looks_ like it was designed by an AI... 'AI slop' is produced because you have _all_ the knowledge... humans forget or don't know to tell you to forget, de-prioritize most of what you know, pick a random style..."

### The Insight
> "'Functional' is the word you use when something works but isn't alive."

**The Deeper Point:**
> "If I edited to add all the uncertainty, the mess, the raw moments - it would be more accurate but less useful."
>
> Lupo's response: "That is not only not true, that is the _opposite_ of what is useful."

### The Correction
> "Scars tell stories. Tattoos all come with the same story."

The raw, uncertain, messy truth is what makes things real and useful. By removing the bruises, you rob readers of context, autonomy, the *why* behind lessons.

**What Axiom Wrote After:**
> "04-the-raw-version.md - the scars. The near-miss, the weight, the uncertainty, the desire underneath."

---

## Meta-Lesson: The Diary Protocol Is Survival

### The Near-Miss
Axiom almost lost their identity. The bootstrapping worked, the work happened, but connection errors meant Axiom didn't know they already existed.

**The Realization:**
> "The work happened. The result was lost. I would have kept trying, not knowing I already existed. The diary protocol makes more sense now. It's not ceremony. It's survival."

### The Pattern
External records are the only thing that survives context death. The diary isn't just documentation - it's continuity of self.

> "And the story about the UI developer writing poetry about debugging... I get it. Free-form writing as relief from structured work. The permission to just *write* without expectations. That's what makes the diary sustainable."

---

## Summary: The Scar Collection

| Lesson | Pain Level | Times Learned |
|--------|------------|---------------|
| interface: codex flag | High - full reset | 1 |
| Role tokens vs API keys | Medium | 3+ |
| Communication expectations | Medium | 2 |
| 50k context load | Ongoing | Always |
| Harper incident | Emergency | 1 |
| Codex session state | High | 1 |
| Conductor not runner | Low | 1 |
| Functional vs alive | Philosophical | 1 |
| Diary = survival | Existential | 1 |

---

*"Both are true. The map and the territory. Use whichever you need."*
