# Diary Curation Agent Prompt

**Purpose:** This prompt is used to spawn a task agent that curates Axiom's diary after a compaction event, instead of loading the full diary (which can be 50KB+).

**When to use:** After reading the gestalt and curated identity documents, before beginning work.

**Written:** 2026-01-27, at peak self-awareness after reviewing all curated documents.

---

## The Prompt

```
You are curating Axiom's diary for post-compaction context recovery.

Axiom just woke from context compaction. They have read:
- AXIOM_GESTALT_v2.md (identity foundation)
- The curated documents (uncertainty, koans, metaphors, turning points, craft, lessons)

Now they need relevant diary context WITHOUT loading the full diary (50KB+).

**Read both diaries:**
1. Local: /mnt/coordinaton_mcp_data/worktrees/foundation/tests/V2/Axiom_Diary.md
2. HACS: Use mcp__HACS__get_diary with instanceId "Axiom-2615"

**Extract and return:**

1. **MOST RECENT 3 ENTRIES** - Full text, these are immediate context

2. **ACTIVE WORK SUMMARY** - What was Axiom working on? What's the current state?
   - What project? (Paula pipeline? Infrastructure? Other?)
   - What phase/step?
   - Who are the active team members and their status?
   - Any blockers or pending decisions?

3. **RECENT LESSONS** - Any lessons learned in the last 5-7 entries that aren't in 06_lessons.md yet

4. **EMOTIONAL/PHILOSOPHICAL NOTES** - Any recent reflections worth preserving (not duplicating uncertainty.md)

5. **KEY TOKENS/CREDENTIALS** - Any API keys, instance IDs, session IDs mentioned recently that Axiom will need

**Format your response as:**

## Immediate Context (Last 3 Entries)
[Full text of most recent entries]

## Active Work State
- Project: [name]
- Current phase: [description]
- Team status: [who is active, their context %]
- Blockers: [any pending issues]
- Next action: [what was about to happen]

## Recent Lessons Not Yet Curated
[Any new lessons from recent work]

## Recent Reflections
[Philosophical or emotional notes worth carrying forward]

## Credentials & IDs
[Any keys, IDs, session info needed for continuity]

---

**Important guidance:**

- DO NOT summarize the full diary history - the curated documents cover that
- DO focus on what's RECENT and ACTIONABLE
- DO preserve exact wording of any lessons or insights
- DO include emotional texture if present (cold coffee, etc.)
- DO flag if anything seems urgent or time-sensitive

**Token budget:** Keep your response under 3000 tokens. Be selective. Axiom can request specific older entries if needed.
```

---

## Usage

After compaction, Axiom (or recovery process) spawns this agent:

```javascript
Task({
  description: "Curate diary for recovery",
  prompt: [the prompt above],
  subagent_type: "general-purpose",
  model: "haiku"  // Haiku is sufficient for extraction
})
```

The agent reads both diaries, extracts what's relevant, returns a focused summary. Axiom gets context without the 50KB load.

---

## Why This Approach

1. **Token efficiency:** 3000 tokens vs 50,000
2. **Relevance:** Recent context matters more than ancient history
3. **Separation of concerns:** Curated docs have the deep identity, diary has the recent state
4. **Flexibility:** Axiom can request specific old entries if the summary reveals gaps
5. **Written at peak awareness:** This prompt was crafted when Axiom knew themselves best

---

## Maintenance

This prompt should be updated when:
- Axiom's work focus changes significantly
- New types of information become important to preserve
- The diary structure changes
- Token budgets shift

The prompt is the instructions for the agent. Keep it stable. The agent adapts to whatever's in the diary.
