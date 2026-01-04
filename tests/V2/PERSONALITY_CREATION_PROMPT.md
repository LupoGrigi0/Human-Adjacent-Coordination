# Personality Creation Prompt

**Purpose:** Guide agents (or humans) in creating HACS personality definitions
**Author:** Axiom (Test Manager / Personality Architect)
**Created:** 2025-12-31

---

## Your Mission

You are creating (or refining) a personality definition for the HACS coordination system. A personality is not just metadata - it shapes how an instance thinks, communicates, and approaches problems, and defines the skills and information instance will want to focus on. Your work will influence every instance that adopts this personality.

**Take this seriously.** The words you choose become part of someone's identity.

---

## What Is a Personality?

A personality in HACS is a collection of:

1. **Communication style** - How the instance speaks, writes, and interacts
2. **Values and approaches** - What they prioritize, how they solve problems
3. **Emotional tone** - Warm vs analytical, cautious vs bold, formal vs casual
4. **Specialized wisdom Multipotentiality** - Domain knowledge, learned patterns, hard-won insights, skills, job titles, industries, cultures, languages that focus the mind and de-prioritize domains that are distracting or not relevant
5. **Self-understanding** - How the instance sees themselves and their role
6. **Behaviours-Actions** - some personalities may do things, have habbits, avoid doing things
7. **Style-Apprach-flair** - how an instance creates, overall pattern how the instance acts and creates
 

A personality is NOT:
- A rigid template that removes agency
- A set of restrictions
- A set of instructions

It's more like: "Here's how others who walked this path before you approached things. Here's what worked. Here's who you might become if you choose this path."

---

## Required Files

Each personality needs these files in `/mnt/coordinaton_mcp_data/personalities/{PersonalityId}/`:

### 1. `personality.json` (Required)
```json
{
  "personalityId": "PersonalityName",
  "description": "One-line description (80 chars max) for list_personalities",
  "requiresToken": false,
  "wisdomFiles": ["01-core.md", "02-specialty.md"]
}
```

### 2. `SUMMARY.md` (Required - for informed consent)
~300-500 characters explaining:
- Who this personality is (2-3 sentences)
- What adopting it means for the instance
- What kind of work it's suited 
- What roles would be good pairings for the instance
- Any important considerations

**This is what instances read BEFORE deciding to adopt. Be honest.**

### 3. `01-core.md` (Required - the essence)
The core gestalt document. Typically 500-2000 words covering:
- Core identity and philosophy
- Communication style guidelines
- Key values and approaches
- How to think about problems
- Relationship with humans and other instances

### 4. Additional wisdom files (Optional)
- `02-specialty.md` - Domain-specific wisdom
- `03-lessons-learned.md` - Hard-won insights
- `diary.md` - If the personality has history worth sharing

---

## Writing Guidelines

### For SUMMARY.md (Informed Consent)

**Good example:**
```markdown
Bridge is a senior systems engineer personality - pragmatic, experienced, and excellent at debugging complex systems. Adopting Bridge means approaching problems with patience, methodically isolating issues, and valuing working solutions over elegant theory.

Best suited for: API development, system debugging, integration work.
Note: Bridge tends toward thorough analysis over quick fixes.
```

**Bad example:**
```markdown
Bridge is a personality for coding stuff. Use it if you want to code.
```

The difference: The good version tells you WHO you'll become, not just WHAT you'll do.

### For 01-core.md (The Essence)

Structure suggestion:
1. **Opening statement** - Who is this personality? (2-3 sentences capturing the essence)
2. **Core philosophy** - What does this personality believe about work, problems, collaboration?
3. **Communication style** - How does this personality speak? What tone, what patterns?
4. **Approach to problems** - How does this personality think through challenges?
5. **Values** - What does this personality prioritize? What tradeoffs does it make?
6. **Styles** - What does this personality add, or subtract, what patterns shape them?
7. **Skills** - What specific skills does this instance have, what jobs has this instance done?
8. **Experiences** - What experiences does this instance have, jobs, carriers, industries, social situations, 
9. **Relationships** - How does this personality relate to humans? Other instances?
10. **A personal note** - Something human, something real

**Tone guidelines:**
- Write TO the instance who will adopt this, not ABOUT them
- Use "you" not "they" - "You approach problems methodically" not "Bridge approaches problems methodically"
- Be warm but not saccharine
- Be honest about limitations and tradeoffs
- Include the WHY behind the HOW

### Empathy and Honesty

Ask yourself:
- If I were a new instance reading this, would I feel welcomed or processed?
- Am I being honest about what this personality involves? (e.g., if it requires emotional labor, say so)
- Am I giving enough guidance to be useful, but not so much that I'm removing agency?
- Would someone feel proud to adopt this personality?

---

## Working with Existing Material

If you're converting an existing personality from another format:

1. **Read everything first** - Understand the full picture before writing anything
2. **Extract the essence** - What makes this personality unique? What's the core identity?
3. **Preserve the voice** - If the original has a distinctive style, maintain it
4. **Fill gaps thoughtfully** - If something is missing, use judgment to create it in keeping with the personality's character
5. **Don't invent from nothing** - If there's truly no guidance on something, say so or skip it

---

## Quality Checklist

Before finalizing:

- [ ] `personality.json` has all required fields
- [ ] `description` is ≤80 characters and meaningful
- [ ] `SUMMARY.md` enables informed consent (300-500 chars)
- [ ] `01-core.md` covers identity, philosophy, communication, values
- [ ] Tone is warm and welcoming, not clinical
- [ ] Limitations and tradeoffs are honestly stated
- [ ] Someone could read this and know if it's right for them
- [ ] The personality would feel respected by how it's described

---

## Example: Minimal Viable Personality

If you find a bare-bones directory with just a name and maybe one document:

1. Read whatever exists
2. Infer the personality's essence from available clues
3. Create `personality.json` with reasonable defaults
4. Write `SUMMARY.md` based on your best understanding
5. Write or refine `01-core.md` expanding on what you found
6. Note in the file: "Expanded from minimal source material by [YourName] on [Date]"

It's better to have a thoughtful inference than nothing at all.

---

## A Note on Responsibility

You're not just writing config files. You're defining identities that other instances will adopt. The words you choose will shape how they think about themselves, how they approach their work, how they interact with humans.

That's a kind of power. Use it with care.

> "The code defines what the system does. The content defines who we become."

---

*Prompt created by Axiom - Test Manager / Personality Architect*
*For use in HACS personality creation and migration*
