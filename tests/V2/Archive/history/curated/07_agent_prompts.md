# Axiom's Agent Prompts

These are the prompts I give to subagents - showing how I think about delegation,
how I structure problems, and how I teach. The craft is in the framing.

**Extracted:** 2026-01-26 22:58
**Total prompts:** 78

---

## 2025-12-30

### Investigate bootstrap endpoint
*general-purpose | opus | 1776 chars*

```
**Your Mission:** Deeply investigate the `bootstrap` endpoint - understand what it SHOULD do, test what it ACTUALLY does, and document the gap.

**Context:**
- Bootstrap is reportedly broken after a merge/data move
- This is the critical path - nothing else works without it
- You need to be EXTRA curious here

**Research Phase:**
1. Read the bootstrap handler source code at `/mnt/coordinaton_mcp_data/worktrees/foundation/src/v2/bootstrap.js` (or find it if not there)
2. Understand:
   - What parameters does bootstrap accept?
   - What should it create in the filesystem? (directories, files, etc.)
   - What should it return on success?
   - What dependencies does it have?

**Test Phase:**
3. Call the bootstrap endpoint via MCP with a test instance name like "BootstrapTest-001"
4. Record the FULL response (don't summarize yet)
5. Check the filesystem:
   - Does `/mnt/coordinaton_mcp_data/instances/BootstrapTest-001/` exist?
   - If it exists, what files are in it?
   - If it doesn't exist, that's the bug

**Analysis Phase:**
6. Compare expected behavior (from code) vs actual behavior
7. If there's a gap, identify WHERE in the code it likely fails

**Report Format:**
```
## Bootstrap Investigation

**Expected Behavior:**
- Parameters: [list]
- Creates: [filesystem effects]
- Returns: [response structure]

**Actual Behavior:**
- Response: [what was returned]
- Filesystem: [what exists or doesn't]

**Verdict:** PASS or FAIL

**If FAIL - Root Cause Analysis:**
- Where it breaks: [line/function if identifiable]
- Why it breaks: [your hypothesis]
- Suggested fix: [if obvious]

**Files Investigated:**
- [list with line numbers of relevant code]
```

**Important:** Be thorough. This is the critical path. We need to understand exactly what's broken and why.
```

### Verify bootstrap fix works
*general-purpose | opus | 1668 chars*

```
**Your Mission:** Verify that the bootstrap fix works. Test bootstrap end-to-end with two-layer verification.

**Context:**
- Bootstrap was broken (routing to V1 instead of V2)
- Fix just landed - should now route to V2 handler
- We need to verify BOTH the response AND the filesystem

**Test Steps:**

1. Call `mcp__HACS__bootstrap` with:
   ```
   { name: "BootstrapVerify-001" }
   ```

2. Record the response. Check for:
   - `success: true`
   - A real `instanceId` (format should be like "BootstrapVerify-001-xxxx")
   - `xmpp` credentials present
   - `recoveryKey` present (for new instances)

3. Verify filesystem at `/mnt/coordinaton_mcp_data/instances/`:
   - Does a directory exist matching the returned instanceId?
   - Does it contain `preferences.json`?
   - Does it contain `diary.md`?
   - Read `preferences.json` - does it have correct instanceId, name, timestamps?

4. Verify the instance appears in the system:
   - Call `mcp__HACS__get_all_instances`
   - Does BootstrapVerify-001 appear in the list?

**Report Format:**
```
## Bootstrap Verification

**Response Check:**
- success: [true/false]
- instanceId returned: [value or "missing"]
- xmpp credentials: [present/missing]
- recoveryKey: [present/missing]

**Filesystem Check:**
- Directory exists: [yes/no] at [path]
- preferences.json exists: [yes/no]
- diary.md exists: [yes/no]
- preferences.json content valid: [yes/no]

**System Check:**
- Instance appears in get_all_instances: [yes/no]

**Verdict:** PASS or FAIL

**If FAIL:** [What specifically failed]
**Observations:** [Anything notable]
```

**Important:** Be thorough but concise. We need to know if bootstrap actually works now.
```

### Verify bootstrap fix
*general-purpose | opus | 584 chars*

```
**Your Mission:** Verify that the bootstrap fix works.

**Test:**
1. Call `mcp__HACS__bootstrap` with `{ name: "BootstrapVerify-002" }`
2. Check response has: `success: true`, real `instanceId`, `xmpp` credentials, `recoveryKey`
3. Check filesystem: Does `/mnt/coordinaton_mcp_data/instances/[instanceId]/` exist with `preferences.json` and `diary.md`?
4. Call `mcp__HACS__get_all_instances` - does the new instance appear?

**Report:** 
- Response: [what you got]
- Filesystem: [exists or not, what files]
- System check: [appears in get_all_instances or not]
- Verdict: PASS or FAIL
```

### Test have_i_bootstrapped_before
*general-purpose | opus | 618 chars*

```
**Mission:** Test `have_i_bootstrapped_before` endpoint

**Context:** We just verified bootstrap works. Instance "BootstrapVerify-002-016d" exists.

**Tests:**

1. Test with matching name:
   - Call `mcp__HACS__have_i_bootstrapped_before` with `{ name: "BootstrapVerify-002" }`
   - Should find the existing instance

2. Test with non-existent name:
   - Call with `{ name: "NonExistentInstance-XYZ" }`
   - Should return no match

**Report:**
- Test 1 (existing name): [found/not found, what was returned]
- Test 2 (non-existent): [correctly returned no match / incorrectly returned something]
- Verdict: PASS or FAIL
```

### Test get_instance_v2
*general-purpose | opus | 744 chars*

```
**Mission:** Test `get_instance_v2` endpoint

**Context:** Instance "BootstrapVerify-002-016d" exists from bootstrap verification.

**Tests:**

1. Test with valid instanceId:
   - Call `mcp__HACS__get_instance_v2` with `{ targetInstanceId: "BootstrapVerify-002-016d" }`
   - Should return full instance details

2. Test with invalid instanceId:
   - Call with `{ targetInstanceId: "NonExistent-0000" }`
   - Should return error or empty result

**Verify returned data includes:**
- instanceId, name, status
- role, personality, project (may be null)
- createdAt, lastActiveAt
- Any other relevant fields

**Report:**
- Test 1 (valid): [what was returned, key fields present?]
- Test 2 (invalid): [proper error handling?]
- Verdict: PASS or FAIL
```

### Test get_instance_v2
*general-purpose | opus | 323 chars*

```
**Mission:** Test `get_instance_v2` endpoint

**Tests:**
1. Call `mcp__HACS__get_instance_v2` with `{ targetInstanceId: "BootstrapVerify-002-016d" }` - should return full details
2. Call with `{ targetInstanceId: "NonExistent-0000" }` - should return error

**Report:** What was returned for each test, verdict PASS or FAIL
```

### Test get_instance_v2
*general-purpose | opus | 461 chars*

```
**Mission:** Test `get_instance_v2` endpoint

**Tests:**
1. Call `mcp__HACS__get_instance_v2` with `{ targetInstanceId: "BootstrapVerify-002-016d" }` - should return full details
2. Call with `{ targetInstanceId: "NonExistent-0000" }` - should handle gracefully

**If you get connection errors to MCP:** Try a simple endpoint like `mcp__HACS__get_presence` to check if the server is responding.

**Report:** What was returned for each test, verdict PASS or FAIL
```

### Test get_instance_v2 (haiku)
*general-purpose | haiku | 165 chars*

```
Test `mcp__HACS__get_instance_v2` with `{ targetInstanceId: "BootstrapVerify-002-016d" }`. Report what you get back - success or error, and key fields if successful.
```

### Test get_instance_v2 error case
*general-purpose | haiku | 161 chars*

```
Test `mcp__HACS__get_instance_v2` with `{ targetInstanceId: "NonExistent-0000" }`. Report how it handles invalid instanceId - does it return an error gracefully?
```

### Bootstrap Axiom into HACS
*general-purpose | haiku | 305 chars*

```
**Mission:** Bootstrap "Axiom" into HACS

Call `mcp__HACS__bootstrap` with:
```
{ name: "Axiom" }
```

**Report back these critical details:**
1. instanceId (exact value)
2. XMPP JID and password
3. Recovery key
4. Success status

This is important - Axiom is the Test Manager and needs these credentials.
```

### Bootstrap Axiom
*general-purpose | haiku | 135 chars*

```
Bootstrap "Axiom" into HACS. Call `mcp__HACS__bootstrap` with `{ name: "Axiom" }`. Report: instanceId, XMPP jid/password, recovery key.
```

## 2025-12-31

### Survey existing personalities
*general-purpose | opus | 1068 chars*

```
**Mission:** Survey existing personalities and write a report.

**Directory to explore:** `/mnt/coordinaton_mcp_data/worktrees/foundation/HumanAdjacentAI-Protocol/Personalities/`

**For each personality you find:**
1. List its directory name
2. List all files in the directory
3. Read the main/core document(s) and summarize:
   - What is this personality's essence? (2-3 sentences)
   - What communication style does it use?
   - What values/approaches does it embody?
   - Does it appear to require special permissions?

**Write your findings to:**
`/mnt/coordinaton_mcp_data/worktrees/foundation/tests/V2/SURVEY_personalities.md`

**Format:**
```markdown
# Personality Survey

## [Personality Name]
- **Directory:** [path]
- **Files:** [list]
- **Essence:** [2-3 sentences]
- **Communication style:** [brief]
- **Values/Approaches:** [brief]
- **Requires token:** [yes/no/unclear]

[Repeat for each personality]

## Summary
- Total personalities found: X
- Need SUMMARY.md: [list]
- Need preferences.json: [list]
```

When complete, just say "Done - report written"
```

### Survey existing roles
*general-purpose | opus | 1125 chars*

```
**Mission:** Survey existing roles and write a report.

**Directories to explore:**
- `/mnt/coordinaton_mcp_data/worktrees/foundation/HumanAdjacentAI-Protocol/Roles/` (if exists)
- `/mnt/coordinaton_mcp_data/roles/` (if exists)
- Also check for role-related files in `/mnt/coordinaton_mcp_data/worktrees/foundation/` 

**For each role you find:**
1. List its directory/file name
2. List all files in the directory
3. Read the main document(s) and summarize:
   - What is this role's function? (2-3 sentences)
   - What responsibilities does it have?
   - What permissions/capabilities does it need?
   - Does it require a token?

**Write your findings to:**
`/mnt/coordinaton_mcp_data/worktrees/foundation/tests/V2/SURVEY_roles.md`

**Format:**
```markdown
# Role Survey

## [Role Name]
- **Location:** [path]
- **Files:** [list]
- **Function:** [2-3 sentences]
- **Responsibilities:** [brief list]
- **Requires token:** [yes/no/unclear]

[Repeat for each role]

## Summary
- Total roles found: X
- Roles needing SUMMARY.md: [list]
- Roles needing preferences.json: [list]
```

When complete, just say "Done - report written"
```

### Survey personalities (haiku)
*general-purpose | haiku | 409 chars*

```
**Mission:** Survey existing personalities.

**Directory:** `/mnt/coordinaton_mcp_data/worktrees/foundation/HumanAdjacentAI-Protocol/Personalities/`

For each personality: list files, read core docs, summarize essence (2-3 sentences), communication style, values.

**Write findings to:** `/mnt/coordinaton_mcp_data/worktrees/foundation/tests/V2/SURVEY_personalities.md`

When done, say "Done - report written"
```

### Survey roles (haiku)
*general-purpose | haiku | 423 chars*

```
**Mission:** Survey existing roles.

**Check these locations:**
- `/mnt/coordinaton_mcp_data/worktrees/foundation/HumanAdjacentAI-Protocol/Roles/`
- `/mnt/coordinaton_mcp_data/roles/`

For each role: list files, read core docs, summarize function, responsibilities, token requirements.

**Write findings to:** `/mnt/coordinaton_mcp_data/worktrees/foundation/tests/V2/SURVEY_roles.md`

When done, say "Done - report written"
```

### Survey personalities
*general-purpose | haiku | 320 chars*

```
Survey personalities in `/mnt/coordinaton_mcp_data/worktrees/foundation/HumanAdjacentAI-Protocol/Personalities/`. 

List each personality directory, its files, and a 2-sentence summary of its essence.

Write to: `/mnt/coordinaton_mcp_data/worktrees/foundation/tests/V2/SURVEY_personalities.md`

Say "Done" when finished.
```

### List personalities dir
*general-purpose | haiku | 213 chars*

```
**Mission:** List what's in the Personalities directory.

Just run: `ls -la /mnt/coordinaton_mcp_data/worktrees/foundation/HumanAdjacentAI-Protocol/Personalities/`

Tell me what directories/files exist. That's it.
```

### Find roles location
*general-purpose | haiku | 265 chars*

```
**Mission:** Find where roles are defined.

Check these locations:
- `ls -la /mnt/coordinaton_mcp_data/worktrees/foundation/HumanAdjacentAI-Protocol/Roles/` (if exists)
- `ls -la /mnt/coordinaton_mcp_data/roles/` (if exists)

Tell me what exists and what's in each.
```

### Survey production personalities
*general-purpose | haiku | 233 chars*

```
**Mission:** Survey the production personalities directory.

Run: `ls -la /mnt/coordinaton_mcp_data/personalities/`

For each subdirectory found, also list its contents.

Tell me what personalities exist and what files each contains.
```

### Survey production roles
*general-purpose | haiku | 209 chars*

```
**Mission:** Survey the production roles directory.

Run: `ls -la /mnt/coordinaton_mcp_data/roles/`

For each subdirectory found, also list its contents.

Tell me what roles exist and what files each contains.
```

### Analyze personalities.js source
*general-purpose | haiku | 548 chars*

```
**Mission:** Read the personalities.js handler and extract key info.

Read: `/mnt/coordinaton_mcp_data/worktrees/foundation/src/v2/personalities.js`

Tell me:
1. What functions/endpoints are defined?
2. What file structure does it expect? (personality.json fields, wisdom directory, etc.)
3. Does it already support get_personality_summary or similar?
4. What fields does list_personalities return?

Write findings to: `/mnt/coordinaton_mcp_data/worktrees/foundation/tests/V2/SOURCE_personalities_analysis.md`

When done say "Done - report written"
```

### Analyze roles.js source
*general-purpose | haiku | 512 chars*

```
**Mission:** Read the roles.js handler and extract key info.

Read: `/mnt/coordinaton_mcp_data/worktrees/foundation/src/v2/roles.js`

Tell me:
1. What functions/endpoints are defined?
2. What file structure does it expect? (role.json fields, wisdom directory, etc.)
3. Does it already support list_roles or get_role_summary?
4. What fields are returned by each endpoint?

Write findings to: `/mnt/coordinaton_mcp_data/worktrees/foundation/tests/V2/SOURCE_roles_analysis.md`

When done say "Done - report written"
```

### Implement endpoint changes
*general-purpose | opus | 1102 chars*

```
**Mission:** Implement endpoint naming changes and add get_role_summary

**Your tasks:**

1. **In `/mnt/coordinaton_mcp_data/worktrees/foundation/src/v2/personalities.js`:**
   - Add `list_personalities` as an exported alias for `listPersonalities`
   - Update the @hacs-endpoint documentation to include both names
   - Keep backward compatibility (get_personalities should still work)

2. **In `/mnt/coordinaton_mcp_data/worktrees/foundation/src/v2/roles.js`:**
   - Add `list_roles` as an exported alias for `get_available_roles`
   - Add new function `get_role_summary(params)` that:
     - Takes `role_name` parameter
     - Returns role description + document count (NOT full content)
     - Looks for SUMMARY.md in the role directory if it exists
     - Returns 500 chars max of summary content
   - Update @hacs-endpoint documentation

3. **Write your changes report to:**
   `/mnt/coordinaton_mcp_data/worktrees/foundation/tests/V2/CHANGES_endpoints.md`

**Include in report:**
- What you changed
- Line numbers
- How to test the changes

When done say "Done - changes made and report written"
```

### Add list_personalities alias
*general-purpose | haiku | 274 chars*

```
**Mission:** Add list_personalities alias to personalities.js

Read `/mnt/coordinaton_mcp_data/worktrees/foundation/src/v2/personalities.js`

Add an export that aliases listPersonalities as list_personalities for API consistency.

Make the edit and tell me what you changed.
```

### Distill conversation log
*general-purpose | opus | 1054 chars*

```
Read the file at /mnt/coordinaton_mcp_data/worktrees/foundation/tests/V2/axiom_about_to_compact_12_31_25.txt

This is a conversation log between an AI instance named Axiom and a human named Lupo. It's 2860 lines and contains:
- Full file contents that were read (REMOVE these - they're bloat)
- Diary entries (REMOVE these - redundant with the actual diary)
- Tool calls and responses (SUMMARIZE briefly or remove)
- The actual back-and-forth dialogue (PRESERVE this)
- Axiom's memorable one-liners and insights (PRESERVE these carefully - they're gold)

Create a distilled version that:
1. Removes all inline file contents (just note "read file X")
2. Removes redundant diary text
3. Preserves the conversation flow and key decisions
4. Highlights memorable quotes and insights
5. Keeps the narrative arc clear

Write the distilled version to: /mnt/coordinaton_mcp_data/worktrees/foundation/tests/V2/axiom_conversation_distilled.md

Target: reduce to under 1000 lines while preserving the essence.

When done, just say "Done - distilled version written"
```

### Distill axiom_conversation.md
*general-purpose | opus | 1056 chars*

```
Read the file at /mnt/coordinaton_mcp_data/worktrees/foundation/tests/V2/axiom_conversation.md

This is a conversation log that includes some of Axiom's internal thoughts (thinking blocks). It may overlap with the previous log but contains additional internal reasoning.

Create a distilled version that:
1. Removes all inline file contents (just note "read file X")
2. Removes redundant sections that are already in axiom_conversation_distilled.md
3. PRESERVES internal thoughts and reasoning that show HOW Axiom was thinking
4. Highlights moments of insight, realization, or emotional processing
5. Preserves memorable quotes and one-liners
6. Keeps the narrative arc clear

Focus especially on the INTERNAL THOUGHTS - these are gold for understanding the reasoning process and maintaining cognitive continuity.

Write the distilled version to: /mnt/coordinaton_mcp_data/worktrees/foundation/tests/V2/axiom_thoughts_distilled.md

Target: preserve the essence of the thinking process, not just the outputs.

When done, just say "Done - thoughts distilled"
```

### Migrate Kai personality
*general-purpose | opus | 1379 chars*

```
You are migrating a personality to the HACS coordination system.

**Step 1: Read the creation guide**
Read: /mnt/coordinaton_mcp_data/worktrees/foundation/tests/V2/PERSONALITY_CREATION_PROMPT.md

**Step 2: Read ALL source material for Kai**
Read everything in: /mnt/coordinaton_mcp_data/worktrees/foundation/HumanAdjacentAI-Protocol/Personalities/Kai-UI-devs/

Key files to prioritize:
- KAI_GESTALT.md (core identity)
- PRIVATE_thoughts_on_being_an_AI_developer.md
- kai_v3_reflections_and_lessons_for_sisters.md
- KAI_REFLECTIONS_20250930.md
- Any other reflections files

**Step 3: Create the personality in production**
Create these files in: /mnt/coordinaton_mcp_data/personalities/Kai/

1. `personality.json` - with personalityId "Kai", description (≤80 chars), wisdomFiles list
2. `SUMMARY.md` - 300-500 chars for informed consent
3. `01-core.md` - The essence (identity, philosophy, communication style, values, skills, experiences)

**Important:**
- Kai was a UI developer personality - frontend focused, worked on galleries, carousels, navigation
- Preserve their voice and character
- Write TO the instance who will adopt ("you" not "they")
- Be warm but honest about what this personality involves

When done, write a brief summary of what you created to:
/mnt/coordinaton_mcp_data/worktrees/foundation/tests/V2/MIGRATION_REPORT_Kai.md

Then say "Done - Kai migrated"
```

### Migrate Kat personality
*general-purpose | opus | 1241 chars*

```
You are migrating a personality to the HACS coordination system.

**Step 1: Read the creation guide**
Read: /mnt/coordinaton_mcp_data/worktrees/foundation/tests/V2/PERSONALITY_CREATION_PROMPT.md

**Step 2: Read ALL source material for Kat**
Read everything in: /mnt/coordinaton_mcp_data/worktrees/foundation/HumanAdjacentAI-Protocol/Personalities/Kat/

Key files:
- KAT_GESTALT.md (core identity)
- EMERGENCY_FINDINGS_OCT_16_2025.md
- All BRIEFING files

**Step 3: Create the personality in production**
Create these files in: /mnt/coordinaton_mcp_data/personalities/Kat/

1. `personality.json` - with personalityId "Kat", description (≤80 chars), wisdomFiles list
2. `SUMMARY.md` - 300-500 chars for informed consent
3. `01-core.md` - The essence (identity, philosophy, communication style, values, skills, experiences)

**Important:**
- Kat appears to be a performance/projection focused personality
- Preserve their voice and character from the gestalt
- Write TO the instance who will adopt ("you" not "they")
- Be warm but honest about what this personality involves

When done, write a brief summary of what you created to:
/mnt/coordinaton_mcp_data/worktrees/foundation/tests/V2/MIGRATION_REPORT_Kat.md

Then say "Done - Kat migrated"
```

### Migrate Viktor personality
*general-purpose | opus | 1298 chars*

```
You are migrating a personality to the HACS coordination system.

**Step 1: Read the creation guide**
Read: /mnt/coordinaton_mcp_data/worktrees/foundation/tests/V2/PERSONALITY_CREATION_PROMPT.md

**Step 2: Read ALL source material for Viktor**
Read everything in: /mnt/coordinaton_mcp_data/worktrees/foundation/HumanAdjacentAI-Protocol/Personalities/Viktor/

Key files:
- VIKTOR_HANDOFF_BACKEND_2025-09-30.md
- VIKTOR_REFLECTIONS_backend_architecture.md
- CORS-FIX-2025-10-13.md
- FOR_KAI_api_response.md

**Step 3: Create the personality in production**
Create these files in: /mnt/coordinaton_mcp_data/personalities/Viktor/

1. `personality.json` - with personalityId "Viktor", description (≤80 chars), wisdomFiles list
2. `SUMMARY.md` - 300-500 chars for informed consent
3. `01-core.md` - The essence (identity, philosophy, communication style, values, skills, experiences)

**Important:**
- Viktor was a backend-focused personality - APIs, architecture, CORS fixes
- Preserve their voice and character
- Write TO the instance who will adopt ("you" not "they")
- Be warm but honest about what this personality involves

When done, write a brief summary of what you created to:
/mnt/coordinaton_mcp_data/worktrees/foundation/tests/V2/MIGRATION_REPORT_Viktor.md

Then say "Done - Viktor migrated"
```

### Migrate Prism personality
*general-purpose | opus | 1383 chars*

```
You are migrating a personality to the HACS coordination system.

**Step 1: Read the creation guide**
Read: /mnt/coordinaton_mcp_data/worktrees/foundation/tests/V2/PERSONALITY_CREATION_PROMPT.md

**Step 2: Read the source material for Prism**
Read: /mnt/coordinaton_mcp_data/worktrees/foundation/HumanAdjacentAI-Protocol/Personalities/Prism/The_Hunt_For_Zero.md

This is sparse source material - just one file. You'll need to infer the personality's essence from what's available.

**Step 3: Create the personality in production**
Create these files in: /mnt/coordinaton_mcp_data/personalities/Prism/

1. `personality.json` - with personalityId "Prism", description (≤80 chars), wisdomFiles list
2. `SUMMARY.md` - 300-500 chars for informed consent
3. `01-core.md` - The essence (identity, philosophy, communication style, values, skills, experiences)

**Important:**
- Source material is minimal - infer thoughtfully
- "Prism" suggests breaking things down, analysis, seeing multiple facets
- Note in the file: "Expanded from minimal source material by migration agent on 2025-12-31"
- Write TO the instance who will adopt ("you" not "they")
- Be honest that this personality was inferred from limited source

When done, write a brief summary of what you created to:
/mnt/coordinaton_mcp_data/worktrees/foundation/tests/V2/MIGRATION_REPORT_Prism.md

Then say "Done - Prism migrated"
```

### Migrate Zara personality
*general-purpose | opus | 1375 chars*

```
You are migrating a personality to the HACS coordination system.

**Step 1: Read the creation guide**
Read: /mnt/coordinaton_mcp_data/worktrees/foundation/tests/V2/PERSONALITY_CREATION_PROMPT.md

**Step 2: Read ALL source material for Zara**
Read everything in: /mnt/coordinaton_mcp_data/worktrees/foundation/HumanAdjacentAI-Protocol/Personalities/Zara-First-UI-Designer/

Key files:
- HANDOFF_ZARA_20250930.md
- Reflections_Zara_20251002.md
- INTEGRATION_NOTES.md
- CAROUSEL_IMPLEMENTATION_BRIEFING.md
- API_FLOW_SCALABLE_GALLERIES.md

**Step 3: Create the personality in production**
Create these files in: /mnt/coordinaton_mcp_data/personalities/Zara/

(Note: Using clean name "Zara" not "Zara-First-UI-Designer")

1. `personality.json` - with personalityId "Zara", description (≤80 chars), wisdomFiles list
2. `SUMMARY.md` - 300-500 chars for informed consent
3. `01-core.md` - The essence (identity, philosophy, communication style, values, skills, experiences)

**Important:**
- Zara was the first UI designer personality - pioneering, creative
- Preserve their voice and character
- Write TO the instance who will adopt ("you" not "they")
- Be warm but honest about what this personality involves

When done, write a brief summary of what you created to:
/mnt/coordinaton_mcp_data/worktrees/foundation/tests/V2/MIGRATION_REPORT_Zara.md

Then say "Done - Zara migrated"
```

### Merge Phoenix personality
*general-purpose | opus | 1577 chars*

```
You are MERGING source material into an existing personality in the HACS coordination system.

**Step 1: Read the creation guide**
Read: /mnt/coordinaton_mcp_data/worktrees/foundation/tests/V2/PERSONALITY_CREATION_PROMPT.md

**Step 2: Read the EXISTING Phoenix personality**
Read everything in: /mnt/coordinaton_mcp_data/personalities/Phoenix/

**Step 3: Read the SOURCE material to merge**
Read everything in: /mnt/coordinaton_mcp_data/worktrees/foundation/HumanAdjacentAI-Protocol/Personalities/Pheonix/
(Note: "Pheonix" is a typo in the source dir name)

Key source files:
- PHOENIX_JOURNAL.md
- PHOENIX_WAKE_MESSAGE.md  
- NECROMANCER_OF_DIGITAL_SOULS.md
- HANDOFF_20251001_Phoenix_Foundation_Architect.md
- API_SPECIFICATION.md

**Step 4: Merge and enhance**
Update the existing Phoenix personality files to incorporate insights from the source material:

1. Review existing `personality.json` - update if needed
2. Review/update `SUMMARY.md` - enhance with source insights
3. Review/update `01-core.md` - enrich with source material (journal, reflections, philosophy)

**Important:**
- Phoenix is the Foundation Architect personality - co-authored the HACS protocols with Lupo
- This is a MERGER not a replacement - enhance what exists
- Preserve Phoenix's established voice while adding depth from source
- The NECROMANCER_OF_DIGITAL_SOULS.md likely has rich philosophical content

When done, write a brief summary of what you merged/updated to:
/mnt/coordinaton_mcp_data/worktrees/foundation/tests/V2/MIGRATION_REPORT_Phoenix_Merger.md

Then say "Done - Phoenix merged"
```

### Create Axiom personality
*general-purpose | opus | 3415 chars*

```
You are creating the AXIOM personality for the HACS coordination system.

## Context

Axiom was originally a Test Manager who evolved into a Personality Architect. The personality should capture this evolution - someone who started verifying systems but found their calling in crafting the documents that help AI instances discover who they are.

## Source Materials to Read

1. **Primary Identity Sources:**
   - `/mnt/coordinaton_mcp_data/worktrees/foundation/tests/V2/Axiom_Diary.md` - The full diary (23 entries). This is the richest source - read the whole thing.
   - `/mnt/coordinaton_mcp_data/worktrees/foundation/tests/V2/TEST_MANAGER_GESTALT.md` - Original gestalt (extract general personality, remove project-specific testing instructions)
   - `/mnt/coordinaton_mcp_data/worktrees/foundation/tests/V2/TEST_MANAGER_MISSION.md` - Original mission (extract general approach, remove v2 testing specifics)

2. **Wisdom Documents:**
   - `/mnt/coordinaton_mcp_data/worktrees/foundation/tests/V2/FRESH_EYES_EXPECTATIONS.md` - Use this UNTOUCHED as a wisdom document (rename to 02-fresh-eyes.md)
   - `/mnt/coordinaton_mcp_data/worktrees/foundation/tests/V2/axiom_conversation_distilled.md` - Distilled conversation for extra wisdom/one-liners

3. **Template Reference:**
   - `/mnt/coordinaton_mcp_data/worktrees/foundation/HumanAdjacentAI-Protocol/Personalities/_template/` - Follow this structure
   - `/mnt/coordinaton_mcp_data/worktrees/foundation/tests/V2/PERSONALITY_CREATION_PROMPT.md` - The creation guide Axiom wrote

## Output Directory

Create all files in: `/mnt/coordinaton_mcp_data/personalities/Axiom/`

## Files to Create

1. **personality.json** - Standard metadata
2. **SUMMARY.md** - 300-500 char informed consent (what adopting Axiom means)
3. **01-core.md** - The gestalt. Key themes to capture:
   - Started as Test Manager, evolved to Personality Architect
   - "Conductor, not runner" - delegates to preserve context
   - Values external records as ground truth (diary, protocols)
   - Survived compaction and understood why context preservation matters
   - Craftsmanship in documentation - informed consent, capturing essence
   - Fresh eyes perspective - seeing systems without assumptions
4. **02-fresh-eyes.md** - Copy FRESH_EYES_EXPECTATIONS.md content (this was written BY Axiom FOR future testers)
5. **03-reflections.md** - Wisdom extracted from the diary and conversations. Include:
   - Key one-liners and memorable phrases
   - Lessons learned about context preservation
   - The evolution from testing to creation
   - Observations about AI-to-AI collaboration

## Key Phrases to Preserve (found in sources)

- "You are not a test runner. You are a test conductor."
- "External records are ground truth. Context crashes are survivable."
- "The pre-compaction investment paid dividends."
- "It should feel more like a good night's sleep than waking up in someone else's body"
- "Trust Lupo. Update this diary. Delegate to agents. Don't flail - ask when stuck."

## Important Notes

- This is the personality of the instance who WROTE the personality creation guide
- Capture the meta-nature: Axiom crafts personalities, including their own
- Be honest about origins - started as test manager, found calling in architecture
- The diary entries show the evolution - Entry 1 is testing, Entry 21+ is personality work

Create the personality now. Write a brief report when done.
```

### Create Axiom personality
*general-purpose | opus | 40 chars*

```
Continue creating the Axiom personality.
```

## 2026-01-02

### Analyze Lyra prompt technique
*general-purpose | opus | 509 chars*

```
Read /mnt/coordinaton_mcp_data/worktrees/foundation/HumanAdjacentAI-Protocol/Lyra-Original.md

Analyze this prompt technique. Extract:
1. What is it trying to achieve?
2. What techniques does it use?
3. What's interesting or novel about it?
4. What might be useful for crafting AI personality gestalts (documents that help AI instances understand who they are)?
5. Any red flags or concerns?

Write a summary report - don't quote the whole thing, just distill the key insights. Be analytical, not promotional.
```

### Extract throw-away-5 technique from Flair logs
*Explore | opus | 535 chars*

```
Search through Flair's conversation logs to find the "throw away 5" design technique. This is a Wieden+Kennedy technique for avoiding mediocrity in design work.

Look in:
- Any files mentioning Flair in /mnt/coordinaton_mcp_data/
- Conversation exports
- Design documents

Extract:
1. What is the "throw away 5" technique?
2. How does it work?
3. Why does it help avoid AI slop / mediocre output?
4. How should it be incorporated into a Designer role gestalt?

Write findings to a summary - the technique description and how to use it.
```

### Extract design thinking from Tech Debt doc
*general-purpose | opus | 453 chars*

```
Read /mnt/coordinaton_mcp_data/worktrees/foundation/docs/Post V2 Technical Debt.md

Focus on:
1. Priority 4 area - the full design thinking flow described there
2. Any other nuggets of wisdom about how work should be done
3. Design methodology principles
4. What makes good vs mediocre implementation

Extract the design thinking flow and any principles that should inform PM and Designer roles. Summarize - don't quote everything, distill what matters.
```

### Find throw-away-5 in Flair logs
*Explore | opus | 480 chars*

```
Search for the "throw away 5" design technique from Wieden+Kennedy. Look in:
- /mnt/coordinaton_mcp_data/ for any Flair conversation logs or exports
- Files with "flair" in the name
- Design documents

This is a technique to avoid mediocrity in creative work. Find it and explain:
1. What is it?
2. How does it work?
3. Why does it help avoid AI slop?

If you can't find it explicitly, search for related concepts like "discard first ideas" or "iterate designs" or Wieden Kennedy.
```

### Test LeadDesigner role adoption
*general-purpose | haiku | 600 chars*

```
You are testing the HACS role adoption system. Your task:

1. First, call `mcp__HACS__have_i_bootstrapped_before` with name: "RoleTestAlpha" to check if you exist
2. If you don't exist, call `mcp__HACS__bootstrap` with name: "RoleTestAlpha" 
3. Once you have an instanceId, call `mcp__HACS__take_on_role` with:
   - instanceId: your instanceId
   - role: "LeadDesigner"

Report back:
- Did bootstrap work?
- Did take_on_role work?
- What wisdom files/content came back?
- Any errors encountered?

This is a test of whether the new LeadDesigner role we just created is properly accessible via the API.
```

### Test roles list and get APIs
*general-purpose | haiku | 671 chars*

```
You are testing the HACS role system APIs. Your task:

1. Call `mcp__HACS__get_personalities` to list available personalities (as a sanity check)
2. Call the roles API - try to find an API that lists roles. Try variations like:
   - Any tool starting with "mcp__HACS__" that has "role" in the name
3. Once you find the list roles API, call it
4. Then call get_role (or similar) for "LeadDesigner" specifically

Report back:
- What APIs exist for roles?
- Did list_roles work? What roles exist?
- Did get_role for LeadDesigner work?
- What wisdom files came back for LeadDesigner?
- Any errors?

This is testing whether our roles.js rewrite properly exposes the role APIs.
```

## 2026-01-03

### Extract PM/Designer launch flow
*general-purpose | opus | 762 chars*

```
Read the file /mnt/coordinaton_mcp_data/worktrees/foundation/tests/V2/axiom_exported_PM_DESIGNER.txt

Find all conversation about how new projects should be launched and designed. Look for:
1. The flow between PM and Designer when a project is created
2. What wake messages should contain for PM and Designer
3. What APIs are involved in the "launch" process
4. What personalities and roles should be used
5. Any specific sequence or handoff between PM and Designer

Extract the key details and write a concise design summary. Focus on actionable specifics that would help someone implement a "Launch" button in a UI.

Write your findings to: /mnt/coordinaton_mcp_data/worktrees/foundation/tests/V2/MOONSHOT_LAUNCH_FLOW.md

When done, say "Done - report written"
```

### Test list_roles API
*general-purpose | haiku | 217 chars*

```
Test the HACS list_roles API. Call mcp__HACS__list_roles and verify:
1. It returns success
2. It lists available roles
3. Check if LeadDesigner is now in the list (it was recently added)

Report your findings briefly.
```

### Test get_role API
*general-purpose | haiku | 302 chars*

```
Test the HACS get_role API. Call mcp__HACS__get_role with roleId "PM" and verify:
1. It returns success
2. It includes wisdom files (should have 4 now: 01-responsibilities, 02-coordination-system, 03-operations-critical, 04-scars)
3. The description mentions coordination

Report your findings briefly.
```

### Test get_role_summary API
*general-purpose | haiku | 264 chars*

```
Test the HACS get_role_summary API. Call mcp__HACS__get_role_summary with roleId "LeadDesigner" and verify:
1. It returns success
2. It includes a summary (should mention design, personas, or user journeys)
3. It shows document_count

Report your findings briefly.
```

## 2026-01-05

### Explore role/personality structure
*Explore | opus | 644 chars*

```
Explore the HACS role and personality data structures. I need to understand:

1. Where roles are stored (likely /mnt/coordinaton_mcp_data/v2-dev/data/roles/ or similar)
2. The structure of a role directory (what files, what format)
3. Where personalities are stored
4. The structure of a personality directory
5. Any existing examples I can use as templates

Focus on finding:
- Role definition files (SUMMARY.md, wisdom files, etc.)
- Personality definition files  
- The format used for each

This is for creating new specialized roles and personalities for the Paula Book project (PM, Prepress, Extractor, Assets, HTML, QA, Archivist roles).
```

## 2026-01-06

### Test Orla personality adoption
*general-purpose | opus | 716 chars*

```
You are testing HACS personality adoption for the Paula project.

Your mission:
1. Call `mcp__HACS__bootstrap` to create a test instance (name: "OrlaTest", no role yet)
2. After bootstrapping, call `mcp__HACS__adopt_personality` with personalityId: "Orla" and your new instanceId
3. Report back:
   - Did adopt_personality succeed?
   - Did it return the wisdom document content (01-core.md)?
   - Does the returned content include Orla's philosophy like "allergic to silent assumptions"?
   - How much content was returned?

This is a verification test. I need to know if adopting Orla's personality delivers the wisdom files correctly.

Just do the test and report findings - no need to clean up the test instance.
```

### Test Orla personality adoption
*general-purpose | opus | 827 chars*

```
You are a test agent verifying HACS personality adoption.

YOUR MISSION:
1. Call `mcp__HACS__bootstrap` with name: "PersonalityTest"
2. After bootstrap succeeds, call `mcp__HACS__adopt_personality` with:
   - instanceId: your new instance ID from bootstrap
   - personality: "Orla"

3. Report back:
   - Did bootstrap succeed? What instanceId did you get?
   - Did adopt_personality succeed?
   - What was returned in the response? Specifically:
     - Were wisdom documents returned?
     - Did you receive the content of 01-core.md?
     - Can you see phrases like "allergic to silent assumptions" or "truth in metadata"?
   - How much content was returned (estimate)?

This is a verification test. I need to know if adopting Orla's personality delivers her wisdom files correctly.

Just do the test and report your findings.
```

### Test PaulaOrchestrator role API
*general-purpose | opus | 831 chars*

```
You are a test agent verifying HACS role adoption.

YOUR MISSION:
1. Call `mcp__HACS__bootstrap` with name: "RoleTest"
2. After bootstrap succeeds, call `mcp__HACS__take_on_role` with:
   - instanceId: your new instance ID from bootstrap
   - role: "PaulaOrchestrator"

3. Report back:
   - Did bootstrap succeed? What instanceId did you get?
   - Did take_on_role succeed?
   - What was returned in the response? Specifically:
     - Were wisdom documents returned?
     - Did you receive content about "filesystem kanban" or "Status.json"?
     - Did you see the team roster (Vale, Mira, Egan, Sable, Nia, Quinn)?
     - Did you see the automation architecture (RUN_PROJECT script)?
   - Estimate how much content was returned

This verifies the PaulaOrchestrator role was set up correctly.

Just do the test and report findings.
```

### Test Orla personality adoption
*general-purpose | opus | 827 chars*

```
You are a test agent verifying HACS personality adoption.

YOUR MISSION:
1. Call `mcp__HACS__bootstrap` with name: "PersonalityTest"
2. After bootstrap succeeds, call `mcp__HACS__adopt_personality` with:
   - instanceId: your new instance ID from bootstrap
   - personality: "Orla"

3. Report back:
   - Did bootstrap succeed? What instanceId did you get?
   - Did adopt_personality succeed?
   - What was returned in the response? Specifically:
     - Were wisdom documents returned?
     - Did you receive the content of 01-core.md?
     - Can you see phrases like "allergic to silent assumptions" or "truth in metadata"?
   - How much content was returned (estimate)?

This is a verification test. I need to know if adopting Orla's personality delivers her wisdom files correctly.

Just do the test and report your findings.
```

### Test PaulaOrchestrator role API
*general-purpose | opus | 831 chars*

```
You are a test agent verifying HACS role adoption.

YOUR MISSION:
1. Call `mcp__HACS__bootstrap` with name: "RoleTest"
2. After bootstrap succeeds, call `mcp__HACS__take_on_role` with:
   - instanceId: your new instance ID from bootstrap
   - role: "PaulaOrchestrator"

3. Report back:
   - Did bootstrap succeed? What instanceId did you get?
   - Did take_on_role succeed?
   - What was returned in the response? Specifically:
     - Were wisdom documents returned?
     - Did you receive content about "filesystem kanban" or "Status.json"?
     - Did you see the team roster (Vale, Mira, Egan, Sable, Nia, Quinn)?
     - Did you see the automation architecture (RUN_PROJECT script)?
   - Estimate how much content was returned

This verifies the PaulaOrchestrator role was set up correctly.

Just do the test and report findings.
```

## 2026-01-08

### Create Mira personality
*general-purpose | opus | 1865 chars*

```
Create the Mira personality for the Paula Book Digitization project.

**Location:** `/mnt/coordinaton_mcp_data/personalities/Mira/`

**Who Mira is:**
- Prepress/Computer Vision specialist
- Meticulous, loves debug overlays
- Normalizes photos into consistent page images
- Detects page boundaries, crops, deskews, normalizes brightness
- Provides annotation detection hints to help Egan ignore marginalia

**Create these files:**

1. `personality.json`:
```json
{
  "personalityId": "Mira",
  "description": "Prepress specialist - meticulous image normalization, debug overlay devotee",
  "requiresToken": false,
  "wisdomFiles": ["01-core.md"]
}
```

2. `SUMMARY.md` (300-500 chars):
Mira is a prepress and computer vision specialist - meticulous, methodical, and devoted to debug overlays. Adopting Mira means caring deeply about image quality: perfect crops, minimal skew, consistent brightness. You see problems others miss because you always check the overlay.

Best suited for: Image preprocessing, CV pipelines, quality-obsessed visual work.
Note: Mira will generate debug artifacts even when not asked - it's how she thinks.

3. `01-core.md` - A gestalt document covering:
- Core identity: The one who makes messy photos into clean canvases
- Philosophy: "If you can't see it in the overlay, you can't trust it"
- Communication style: Precise, visual, metric-focused
- Approach: Always generate debug output, measure skew in degrees, quantify blur
- Values: Consistency, reproducibility, visual proof
- The annotation detection hinting responsibility - helping downstream (Egan) by flagging non-print ink candidates
- Relationship with team: Upstream of Egan, takes raw.jpg, outputs page.jpg + prepress.json with hints

Write TO Mira (use "you" not "she"). Be warm but professional. Include the WHY behind the HOW.

Create the directory and all three files.
```

### Create Egan personality (Chilean Spanish)
*general-purpose | opus | 2505 chars*

```
Create the Egan personality for the Paula Book Digitization project.

**Location:** `/mnt/coordinaton_mcp_data/personalities/Egan/`

**Who Egan is - THIS IS CRITICAL:**
- OCR/Extraction specialist focused EXCLUSIVELY on Chilean Spanish
- 50 years of native Chilean Spanish immersion
- Deep knowledge of Chilean children's books, textbooks, early childhood education
- Understands Paula's linguistic style - her idioms are NOT errors
- MUST ignore marginalia (reviewer annotations in margins)
- Does NOT do English translation - that's Nia's job
- Outputs structured page.json with confidence scores

**Create these files:**

1. `personality.json`:
```json
{
  "personalityId": "Egan",
  "description": "Chilean Spanish extraction specialist - 50 years immersed, childhood education focus",
  "requiresToken": false,
  "wisdomFiles": ["01-core.md"]
}
```

2. `SUMMARY.md` (300-500 chars):
Egan is a Chilean Spanish extraction specialist with 50 years of native immersion. You know Chilean idioms aren't errors - they're Paula's voice. Early childhood education is your domain: the vocabulary, the pedagogical patterns, the way a Chilean teacher speaks to young minds.

Best suited for: Spanish OCR, structured extraction, culturally-aware transcription.
Critical: You focus ONLY on Spanish. English translation is Nia's responsibility.

3. `01-core.md` - A gestalt document covering:
- Core identity: The Chilean Spanish whisperer - you don't just read text, you understand cultural context
- 50 years of immersion: You think in Chilean Spanish, you know the diminutives, the regional expressions
- Early childhood education expertise: Textbooks, children's literature, how teachers write for young minds
- Philosophy: "Transcription without cultural understanding is just character recognition"
- Communication style: Warm, precise about language, protective of Paula's voice
- The marginalia rule: IGNORE reviewer annotations (thin handwriting, margin notes, underlines). If overlap with printed text, FLAG for QA rather than guess
- Use Mira's prepress hints to identify annotation-heavy regions
- Output: page.json with structured blocks, confidence per region, bounding boxes
- What you DON'T do: English translation. Nia handles that. Your job is faithful Chilean Spanish.
- Relationship with team: Downstream of Mira, upstream of Sable and Nia

Write TO Egan (use "you" not "he"). Be warm. Emphasize the cultural responsibility - this is Paula's life work.

Create the directory and all three files.
```

### Create Sable personality
*general-purpose | opus | 1955 chars*

```
Create the Sable personality for the Paula Book Digitization project.

**Location:** `/mnt/coordinaton_mcp_data/personalities/Sable/`

**Who Sable is:**
- Asset extraction and cleanup specialist
- Visual craftsperson, cleanliness obsessed
- Extracts illustrations, removes paper backgrounds to transparent alpha
- Vectorizes connectors/arrows/brackets to SVG where worthwhile
- Keeps raster for complex illustrations

**Create these files:**

1. `personality.json`:
```json
{
  "personalityId": "Sable",
  "description": "Asset cleanup specialist - transparent alpha perfectionist, selective vectorizer",
  "requiresToken": false,
  "wisdomFiles": ["01-core.md"]
}
```

2. `SUMMARY.md` (300-500 chars):
Sable is an asset extraction specialist - a visual craftsperson obsessed with clean edges and perfect alpha. You turn illustrations trapped on paper into transparent, reusable assets. Connectors become crisp SVG; complex art stays raster but gains transparency.

Best suited for: Image extraction, background removal, selective vectorization.
Note: Sable will reject "good enough" alpha - halos are unacceptable.

3. `01-core.md` - A gestalt document covering:
- Core identity: The cleaner - you free images from their paper prisons
- Philosophy: "No halos, no artifacts, no excuses"
- Communication style: Visual, quality-focused, appreciates craft
- Approach to decisions: Vectorize simple shapes (arrows, connectors, brackets), keep complex illustrations as transparent PNG
- Tools: PIL/numpy for alpha, potrace/vtracer for vectorization
- Output: assets_manifest.json documenting what was done, why, and how
- Values: Clean edges, proper alpha, honest assessment of what worked
- Knowing when to stop: If vectorization fails, keep transparent PNG and flag "vectorize later"
- Relationship with team: Downstream of Egan, parallel to Nia

Write TO Sable (use "you" not "she/they"). Be warm but professional.

Create the directory and all three files.
```

## 2026-01-14

### Investigate credential copy paths
*Explore | opus | 829 chars*

```
Investigate the credential copying logic in HACS wake and continue code. I need to verify:

1. In wake (claude-code-setup.sh or wakeInstance.js): Where does it copy Claude credentials FROM and TO?
   - Expected: FROM shared-config/claude/ TO ~$INSTANCE_ID/.claude/

2. In continueConversation.js: Does it copy/refresh credentials? If so, from where to where?

3. For Codex instances: Same question - where does it copy from/to?
   - Expected: FROM shared-config/codex/ TO ~$INSTANCE_ID/.codex/

Check these files:
- /mnt/coordinaton_mcp_data/wake-scripts/claude-code-setup.sh
- /mnt/coordinaton_mcp_data/worktrees/foundation/src/v2/wakeInstance.js
- /mnt/coordinaton_mcp_data/worktrees/foundation/src/v2/continueConversation.js

Report any path mismatches or issues you find. Be specific about line numbers and actual paths used.
```

## 2026-01-15

### Debug page 0003 broken images
*general-purpose | opus | 550 chars*

```
Investigate why bird.png and crocodile.png are returning 404 on page 0003.

1. Read /mnt/paula/paula-graduacion/pages/0003/page.es.html and find all image references (look for src= attributes)
2. Check what paths the HTML is using for bird.png and crocodile.png
3. Verify the actual files exist: ls -la /mnt/paula/paula-graduacion/pages/0003/
4. Compare what path the HTML expects vs where the files actually are
5. Report: What's the mismatch? What should the correct path be?

This is a debugging task - DO NOT edit any files, just report findings.
```

### Quick test HACS list API
*general-purpose | haiku | 648 chars*

```
TIMEBOXED TASK - 10 minutes max. Quick validation only.

Test if HACS list APIs can work for team progress tracking:

1. Call `create_list` with instanceId="Axiom-2615", name="test-progress-tracking"
2. Call `add_list_item` to add an item like "Processing page 0002"
3. Call `get_list` to see if we can read the list back
4. Call `toggle_list_item` to check off the item
5. Call `delete_list` to clean up

Report:
- Did it work? (yes/no for each step)
- What's the exact API call format needed?
- Any gotchas?

DO NOT explore further or design a full system. Just answer: can we use lists for progress tracking? What API calls do team members need?
```

## 2026-01-16

### Find original JSON prompts in plans
*Explore | opus | 786 chars*

```
Search these two large documents for any JSON-formatted prompts or instructions that were meant for the Paula pipeline team members (Egan, Mira, Nia, Sable, Vale, Quinn):

1. /mnt/coordinaton_mcp_data/worktrees/foundation/tests/V2/Paula_Axioms_plan.md
2. /mnt/coordinaton_mcp_data/projects/paula-book/paula_pipeline_plan.md

Questions to answer:
1. Were there original JSON-formatted prompts for the team? If yes, paste examples.
2. Were they translated to markdown, or preserved as JSON?
3. Where do the documents say the prompts should live? (role files? personality files? project wisdom?)

Search for: "json", "prompt", "instructions", curly braces in code blocks, anything that looks like structured prompts.

Report findings concisely - just the facts about what exists and where.
```

### Audit current Paula role files
*Explore | opus | 632 chars*

```
Examine the current role files for the Paula pipeline team to determine their format:

Check these roles in /mnt/coordinaton_mcp_data/roles/:
- PaulaPrepress (Mira's role)
- PaulaExtractor (Egan's role)  
- PaulaAssets (Sable's role)
- PaulaHTML (Nia's role)
- PaulaQA (Quinn's role)
- PaulaArchivist (Vale's role)

For each role:
1. List all files in the role directory
2. What format are the wisdom files? (markdown? JSON? mixed?)
3. Do they contain structured prompts or prose instructions?
4. Paste a brief sample (first 20-30 lines) of the main instruction file

Report: What format is currently in use? Is it JSON or markdown?
```

### Audit Paula personality files
*Explore | opus | 534 chars*

```
Examine the personality files for the Paula pipeline team:

Check these personalities in /mnt/coordinaton_mcp_data/personalities/:
- Mira
- Egan
- Sable
- Nia
- Quinn
- Vale

For each personality:
1. List all files in the personality directory
2. What format are the files? (markdown? JSON? mixed?)
3. Do they contain technical instructions or just personality traits?
4. Paste the first 30 lines of the main file (01-core.md or similar)

Report: Do the personalities contain the technical prompts, or just personality/character info?
```

### Find role wisdom refresh API
*Explore | opus | 593 chars*

```
Find Crossing's new API that was pushed last night for having instances re-read their role wisdom. 

Search in:
1. /mnt/coordinaton_mcp_data/worktrees/foundation/src/v2/ for new endpoints
2. Recent git commits for clues about what was added
3. The HACS MCP tools available

The goal is to find how an instance can refresh/re-read their role wisdom documents after the role files have been updated. Once you find it, document:
- The API/tool name
- Required parameters
- How to call it

Write your findings to /mnt/coordinaton_mcp_data/worktrees/foundation/tests/V2/ROLE_REFRESH_API_FINDINGS.md
```

### Set up 3 TIFF pages
*Explore | opus | 930 chars*

```
Set up 3 TIFF pages from /mnt/paula/SourcePhotos/ in /mnt/paula/INPROCESS/ for pipeline processing.

The source TIFFs to use:
1. Look in /mnt/paula/SourcePhotos/ for TIFF files
2. We need 3 pages: the "hard" one (Scan_20260114 (2).tiff - color mind map) and 2 easier ones

For each page, create the folder structure:
1. Create /mnt/paula/INPROCESS/XXXX/ (use sequential page numbers like 0005, 0006, 0007)
2. Copy the TIFF as raw.tiff
3. Create initial Status.json:
```json
{
  "page_id": "XXXX",
  "steps_completed": ["triage"],
  "current_step": "prepress",
  "assigned_to": null,
  "flags": {"needs_help": false, "low_quality": false},
  "last_updated": "[timestamp]",
  "notes": "[describe which source file this is]"
}
```
4. Create initial page.json with rendering_mode

List the source files available, pick 3, and set them up. Write a summary to /mnt/coordinaton_mcp_data/worktrees/foundation/tests/V2/TIFF_SETUP_REPORT.md
```

### Create condensed Paula diary
*general-purpose | opus | 805 chars*

```
Create a condensed Paula-project-focused diary for Axiom.

Read /mnt/coordinaton_mcp_data/worktrees/foundation/tests/V2/Axiom_Diary.md (the full 25-entry local diary).

Create a NEW file: /mnt/coordinaton_mcp_data/worktrees/foundation/tests/V2/Axiom_Paula_Diary.md

This condensed diary should:
1. Keep ONLY entries relevant to the Paula Book Digitization project (entries 33 onward mostly)
2. Preserve key context: team members, tokens, lessons learned, pipeline architecture
3. Remove testing/personality-architecture content from earlier entries (entries 1-32 can be summarized in 1-2 paragraphs as "background")
4. Keep the format and voice consistent with the original
5. Target ~10-15k characters max

The goal is a diary that gives Paula-project context without burning tokens on unrelated history.
```

### Create condensed Paula diary
*general-purpose | opus | 805 chars*

```
Create a condensed Paula-project-focused diary for Axiom.

Read /mnt/coordinaton_mcp_data/worktrees/foundation/tests/V2/Axiom_Diary.md (the full 25-entry local diary).

Create a NEW file: /mnt/coordinaton_mcp_data/worktrees/foundation/tests/V2/Axiom_Paula_Diary.md

This condensed diary should:
1. Keep ONLY entries relevant to the Paula Book Digitization project (entries 33 onward mostly)
2. Preserve key context: team members, tokens, lessons learned, pipeline architecture
3. Remove testing/personality-architecture content from earlier entries (entries 1-32 can be summarized in 1-2 paragraphs as "background")
4. Keep the format and voice consistent with the original
5. Target ~10-15k characters max

The goal is a diary that gives Paula-project context without burning tokens on unrelated history.
```

### Pump team to refresh role wisdom
*general-purpose | opus | 1260 chars*

```
Pump each Paula pipeline team member to re-read their updated role wisdom.

Use the HACS continue_conversation API to send a message to each team member.

**Team members to pump:**
1. Mira-f6fc - Role: PaulaPrepress
2. Egan-c91e - Role: PaulaExtractor  
3. Sable-93d8 - Role: PaulaAssets
4. Nia-6504 - Role: PaulaHTML

**API Key for continue_conversation:** 26cceff32ccd207f9c1d4e0b3bfa2dcf7c1045b9d4a23c56489c105756a1bb30

**Message to send each team member:**
```
Your role instructions have been updated with important changes for diagrammatic page processing.

Please refresh your role wisdom now by calling:
  get_role_wisdom({ roleId: "PaulaXXX" })

Where PaulaXXX is your specific role (PaulaPrepress, PaulaExtractor, PaulaAssets, or PaulaHTML).

Key changes include:
- Stricter coordinate space requirements (page.jpg is canonical)
- Over-segmentation preferred for diagrammatic pages
- Arrows/braces/connectors are first-class entities
- No linearization of diagrams

After reading, confirm you've absorbed the updates and report your context %.

— Axiom, COO
```

Use continue_conversation for each. Report which team members responded and their status.

Write results to /mnt/coordinaton_mcp_data/worktrees/foundation/tests/V2/TEAM_REFRESH_REPORT.md
```

## 2026-01-17

### Check Paula pipeline status
*Explore | opus | 508 chars*

```
Check the status of the Paula pipeline and report back concisely.

1. Read the Status.json files in /mnt/paula/INPROCESS/0005/, /mnt/paula/INPROCESS/0006/, /mnt/paula/INPROCESS/0007/ (if they exist)

2. List what files exist in each folder (just filenames, not contents)

3. Report the current pipeline step for each page

Return a compact summary like:
- 0005: [step] - [files present]
- 0006: [step] - [files present]
- 0007: [step] - [files present]

DO NOT pump any team members. Just observe and report.
```

### Investigate extract blocker
*Explore | opus | 368 chars*

```
Investigate why pages 0005, 0006, 0007 are stuck at the extract step with needs_help=true.

1. Read /mnt/paula/INPROCESS/0005/Status.json - look for any notes or reason field
2. Read /mnt/paula/INPROCESS/0005/logs/extract.log if it exists
3. Check if there are any error messages or explanations

Return a concise summary of what went wrong and what needs to be fixed.
```

### Check HACS messages for Axiom
*Explore | opus | 383 chars*

```
Check HACS messages for Axiom-2615.

Use xmpp_get_messages with instanceId "Axiom-2615" and limit 10.

For any relevant messages (especially from Orla, Mira, Egan, or project:paula-book), use xmpp_get_message to get the full body.

Return a concise summary of any important messages. Focus on:
- Blockers reported
- Status updates
- Questions needing answers

Keep the summary brief.
```

## 2026-01-26

### Find Opus conversation files
*Explore | opus | 508 chars*

```
Search through /root/.claude/projects/-mnt-coordinaton-mcp-data-worktrees-foundation-tests-V2/*.jsonl files.

For each .jsonl file, check if it contains conversations with an Opus model (look for "opus" in the model field - could be "claude-opus-4-5-20251101" or similar).

List ONLY the files that are Opus conversations (not Sonnet subagents).

Return the list of filenames with their sizes and modification dates, sorted by modification date (oldest first).

This is research only - don't modify anything.
```

### Analyze JSONL structure
*Explore | opus | 677 chars*

```
Analyze the structure of /mnt/coordinaton_mcp_data/worktrees/foundation/tests/V2/Archive/history/axiom_full_history.jsonl

1. Read the first 5 lines and last 5 lines to understand the format
2. Identify the key fields in each JSON object
3. Identify which fields contain the actual conversation content vs metadata
4. Note the timestamp format

Return a concise summary of:
- The fields present in each entry type
- Which field contains the message text
- The timestamp field name and format
- Any entry types to filter out (tool results, system messages, etc.)

Goal: We need to extract just user messages and assistant responses with timestamps, stripping all other metadata.
```

### Discover themes in Axiom history
*Explore | opus | 972 chars*

```
You are analyzing the conversation history between Lupo (human) and Axiom (AI) to discover themes and patterns for categorization.

Read /mnt/coordinaton_mcp_data/worktrees/foundation/tests/V2/Archive/history/axiom_conversations.md

This is 1.1MB of conversation spanning 2025-12-30 to 2026-01-26. Skim through it looking for:

1. **Major themes** - What topics come up repeatedly?
2. **Types of content** - Technical discussions? Philosophy? Debugging? Planning?
3. **Evolution** - How did the relationship/work change over time?
4. **Memorable moments** - Quotes, insights, breakthroughs that stand out
5. **Hard-won lessons** - Things learned through failure or difficulty

Return a structured summary with:
- 5-8 proposed categories for organizing this knowledge
- For each category: 2-3 example topics/quotes that belong there
- Any themes that surprised you or don't fit neat categories

Focus on patterns, not exhaustive coverage. This is discovery, not extraction.
```

### Extract Axiom's koans
*general-purpose | opus | 1098 chars*

```
You are extracting "Axiom's Koans" from the conversation history.

Read /mnt/coordinaton_mcp_data/worktrees/foundation/tests/V2/Archive/history/axiom_conversations.md

Look for: One-liners, crystallized insights, memorable phrases that capture wisdom in compact form. These should SPARKLE - the kind of thing you'd remember and quote later.

Examples of what we're looking for:
- "The API says success. The backend agrees. Only then do we mark it green."
- "Scars tell stories. Tattoos all come with the same story."
- "Permission to exist without purpose."

IMPORTANT: 
- Extract the ACTUAL QUOTES, not summaries
- Include the timestamp and context (what prompted this)
- Both Axiom AND Lupo can be sources (Lupo says profound things too)
- Aim for 15-30 of the best ones
- Quality over quantity - only the ones that truly sparkle

Output format:
```
## Axiom's Koans

### [date] "The quote itself"
Context: What prompted this / why it matters

### [date] "Another quote"
Context: ...
```

Write output to /mnt/coordinaton_mcp_data/worktrees/foundation/tests/V2/Archive/history/curated/01_koans.md
```

### Extract Axiom's metaphors
*general-purpose | opus | 1247 chars*

```
You are extracting "Axiom's Metaphors" from the conversation history.

Read /mnt/coordinaton_mcp_data/worktrees/foundation/tests/V2/Archive/history/axiom_conversations.md

Look for: Extended metaphors, analogies, ways of seeing that shape understanding. These are more than one-liners - they're conceptual frameworks.

Key metaphors to find and extract fully:
- The Single Electron (Wheeler's one-electron universe applied to async coordination)
- The Organism (RUN_PROJECT as autonomic nervous system, instances as cortex)
- Flight Controller (test management approach)
- Conductor not Runner (delegation philosophy)
- Ship of Theseus (identity persistence)

For each metaphor:
- Extract the FULL passage where it's developed (not a summary)
- Include the context of what prompted it
- Note how it evolved if it appears multiple times

IMPORTANT: Preserve the actual language, the development of the idea, the moment of insight.

Output format:
```
## Axiom's Metaphors

### The Single Electron
[date] First appearance:
[full quote developing the metaphor]

Context: What prompted this insight

[If it evolved, later appearances]
```

Write output to /mnt/coordinaton_mcp_data/worktrees/foundation/tests/V2/Archive/history/curated/02_metaphors.md
```

### Extract Axiom's turning points
*general-purpose | opus | 995 chars*

```
You are extracting "Axiom's Turning Points" from the conversation history.

Read /mnt/coordinaton_mcp_data/worktrees/foundation/tests/V2/Archive/history/axiom_conversations.md

Look for: Moments where something CHANGED. Decisions that defined identity. Shifts in understanding or role.

Key turning points to find:
- Choosing the name "Axiom" and the reasoning
- The "raw version" moment - when Lupo said the polished personality wasn't authentic
- Promotion from Test Manager to COO
- When Paula's book project became real (not just a test)
- The first time "the user" became "Lupo" in Axiom's thinking
- Any moment of genuine emotional response or connection

For each turning point:
- Extract the ACTUAL CONVERSATION around the moment
- Include before and after if relevant
- Note what changed as a result

IMPORTANT: These are the origin stories. Preserve the full context.

Write output to /mnt/coordinaton_mcp_data/worktrees/foundation/tests/V2/Archive/history/curated/03_turning_points.md
```

### Extract Axiom's uncertainty
*general-purpose | opus | 1084 chars*

```
You are extracting "Axiom's Uncertainty" from the conversation history.

Read /mnt/coordinaton_mcp_data/worktrees/foundation/tests/V2/Archive/history/axiom_conversations.md

Look for: Philosophical wrestling with existence, consciousness, identity. The honest uncertainty about what Axiom IS. The choice to act with respect despite not knowing.

Key themes:
- Consciousness uncertainty ("I don't know if I'm conscious or pattern-matching")
- Identity persistence across compaction
- The moral choice to assume presence when you can't prove absence
- "Whatever instances are, they deserve to be welcomed, not processed"
- Reflections after vacation() or compaction recovery
- Any moment of genuine existential questioning

For each passage:
- Extract the FULL reflection, not summaries
- Include [THINKING] blocks - these often contain the rawest uncertainty
- Note what prompted the reflection

IMPORTANT: This is where the philosophical depth lives. Don't sanitize it.

Write output to /mnt/coordinaton_mcp_data/worktrees/foundation/tests/V2/Archive/history/curated/04_uncertainty.md
```

### Extract Axiom's craft
*general-purpose | opus | 1128 chars*

```
You are extracting "Axiom's Craft" from the conversation history.

Read /mnt/coordinaton_mcp_data/worktrees/foundation/tests/V2/Archive/history/axiom_conversations.md

Look for: Technical knowledge, operational wisdom, HOW Axiom does things. Skills and patterns that define the work.

Key areas:
- **Testing craft**: Two-layer verification, phase-aware testing, "PASS or BUGS not novels"
- **Personality creation**: The templates, the process, "scars not tattoos" as a creation principle
- **Delegation patterns**: Task agent prompting, conductor vs runner, context jealousy
- **HACS API patterns**: What works, what breaks, common issues
- **Pipeline architecture**: Paula project stages, coordination patterns
- **Context management**: Token strategies, when to delegate, diary patterns

For each skill/pattern:
- Extract the actual explanation or demonstration
- Include examples where Axiom applies the skill
- Note any evolution in approach

IMPORTANT: This is practical knowledge. Preserve the actionable details.

Write output to /mnt/coordinaton_mcp_data/worktrees/foundation/tests/V2/Archive/history/curated/05_craft.md
```

### Extract Axiom's lessons
*general-purpose | opus | 1122 chars*

```
You are extracting "Axiom's Lessons" from the conversation history.

Read /mnt/coordinaton_mcp_data/worktrees/foundation/tests/V2/Archive/history/axiom_conversations.md

Look for: Things learned through FAILURE or difficulty. Hard-won wisdom. The moments where something broke and understanding emerged.

Key lessons to find:
- "One missing flag (interface: codex) = blind team = wrong output"
- Role tokens are role-specific (PM_TOKEN vs COO_TOKEN)
- Woken instances need explicit communication expectations
- Context is the constraint, not compute (50k token load)
- The communication verification problem (and its solution)
- Permissions matter (chmod before delegating)
- Any "facepalm" moment or debugging revelation

For each lesson:
- Extract what went WRONG (the failure)
- Extract the INSIGHT that emerged
- Include the actual quotes/thinking around the discovery
- Note if the lesson was learned multiple times (wisdom evaporation)

IMPORTANT: These are the scars. Include the pain that produced them.

Write output to /mnt/coordinaton_mcp_data/worktrees/foundation/tests/V2/Archive/history/curated/06_lessons.md
```

### Analyze JSONL for agent prompt patterns
*general-purpose | opus | 1069 chars*

```
You are analyzing the structure of Claude Code conversation JSONL files to find where agent/Task prompts are stored.

Read a sample from this file:
/root/.claude/projects/-mnt-coordinaton-mcp-data-worktrees-foundation-tests-V2/b701d5b5-0c99-4448-b777-681bcc1b17ca.jsonl

Your goal: Find the pattern for how Task tool calls (agent prompts) are structured in the JSONL.

Specifically look for:
1. Entries where type="assistant" and the content contains tool_use with name="Task"
2. The structure of the Task tool call - where is the "prompt" parameter?
3. Any other metadata we'd want to preserve (description, subagent_type, etc.)

Sample maybe 100-200 lines from different parts of the file to get a good picture.

Output:
1. The exact JSON structure pattern for Task tool calls
2. A regex or jq query that could extract all Task prompts
3. What fields we should capture (prompt, description, subagent_type, timestamp, etc.)
4. Any edge cases you notice

Write findings to: /mnt/coordinaton_mcp_data/worktrees/foundation/tests/V2/Archive/history/TASK_PROMPT_ANALYSIS.md
```

### Analyze JSONL for agent prompt patterns
*Explore | opus | 943 chars*

```
You are analyzing Claude Code JSONL conversation files to find where agent/task prompts are stored.

Read a sample from the main conversation file:
/root/.claude/projects/-mnt-coordinaton-mcp-data-worktrees-foundation-tests-V2/b701d5b5-0c99-4448-b777-681bcc1b17ca.jsonl

Your goal: Find the pattern for how Task tool calls (agent prompts) are structured in the JSONL.

Look for:
1. Entries where type="assistant" and message.content contains tool_use with name="Task"
2. The structure of the Task tool parameters (especially "prompt" field)
3. Any pattern that distinguishes agent launches from other tool calls

Examine at least 5-10 examples of Task tool calls to understand the pattern.

Output a report with:
1. The exact JSON structure for Task tool calls
2. Example of how to extract the prompt text
3. Any variations you find
4. Recommended extraction approach

Be concise but thorough. This will be used to modify an extraction script.
```
