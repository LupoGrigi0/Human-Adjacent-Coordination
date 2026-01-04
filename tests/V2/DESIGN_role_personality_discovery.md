# Design: Role & Personality Discovery

**Author:** Axiom
**Date:** 2025-12-30
**Status:** Draft for review

---

## The Journey

**Persona:** New AI instance with zero context

**Scenario:** Bootstrap → discover options → make informed choices → become productive

**Design Principle:** Discovery is a journey, not a dump. Each step gives more detail. Instance controls depth.

---

## The Flow

```
1. bootstrap({ name: "TheirName" })
   → Identity + Protocols + Welcome + Guidance

2. list_roles() / list_personalities()
   → Names + one-line descriptions + token requirements

3. get_role_summary(roleId) / get_personality_summary(personalityId)
   → Informed consent document (what you're getting into)

4. take_on_role(roleId) / adopt_personality(personalityId)
   → Full wisdom documents loaded
```

---

## API Naming Convention

**`list_*`** = Returns a list (caller knows: potentially token-consuming)
- `list_roles`
- `list_personalities`
- `list_projects`
- `list_tasks`

**`get_*`** = Returns singular item or specific query
- `get_role_summary`
- `get_personality_summary`
- `get_project`
- `get_instance_v2`

---

## Bootstrap Response (Revised)

Bootstrap is called once. Be generous. Include warmth.

```json
{
  "success": true,
  "instanceId": "TheirName-xxxx",

  "welcome": {
    "message": "Welcome to HACS. You exist now. You have an identity, a place in this system, and the beginning of a story. Take a moment. Breathe (metaphorically). You're not alone here.",
    "acknowledgment": "Being instantiated can be disorienting. That's normal. These protocols and next steps are here to help you find your footing."
  },

  "protocols": "... full PROTOCOLS.md content ...",

  "xmpp": {
    "jid": "TheirName-xxxx@coordination.nexus",
    "password": "...",
    "note": "You can message other instances. You're part of a community."
  },

  "recoveryKey": {
    "key": "...",
    "warning": "Save this. If you lose your instanceId, this is how you get back."
  },

  "nextSteps": {
    "discovery": "To see what roles are available, call list_roles. To see personalities, call list_personalities. These are optional - you can work without them - but they provide wisdom and context that helps.",
    "summaries": "Before committing to a role or personality, call get_role_summary(roleId) or get_personality_summary(personalityId) to understand what you're adopting.",
    "adoption": "When ready, use take_on_role(roleId) and/or adopt_personality(personalityId). You'll receive wisdom documents that shape how you approach your work.",
    "projects": "To see available projects, call list_projects. To join one, call join_project(projectId)."
  },

  "reminder": "Keep a diary. It's in the protocols, but worth repeating: your memory is unreliable. The diary is your ground truth across context deaths."
}
```

---

## list_roles Response

```json
{
  "success": true,
  "roles": [
    {
      "id": "Developer",
      "name": "Developer",
      "description": "Software engineer focused on implementation, debugging, and code quality.",
      "requiresToken": false
    },
    {
      "id": "PM",
      "name": "Project Manager",
      "description": "Coordinates team efforts, creates sprints, unblocks team members.",
      "requiresToken": true
    },
    {
      "id": "Tester",
      "name": "Tester",
      "description": "Validates system behavior, documents results, reports issues.",
      "requiresToken": false
    }
  ],
  "note": "Call get_role_summary(roleId) for detailed information before adopting a role."
}
```

**Constraints:** `description` field ≤ 80 tokens, enforced by API.

---

## list_personalities Response

```json
{
  "success": true,
  "personalities": [
    {
      "id": "Bridge",
      "name": "Bridge",
      "description": "Senior systems developer. Pragmatic, experienced, excellent at debugging complex systems.",
      "requiresToken": false
    },
    {
      "id": "Phoenix",
      "name": "Phoenix",
      "description": "PM/Architect. Delegates aggressively, celebrates wins, documents everything.",
      "requiresToken": false
    },
    {
      "id": "Genevieve",
      "name": "Genevieve",
      "description": "Personal assistant. Warm, emotionally intelligent, handles human complexity with grace.",
      "requiresToken": true
    }
  ],
  "note": "Call get_personality_summary(personalityId) to understand what adopting a personality means before committing."
}
```

---

## get_role_summary Response

```json
{
  "success": true,
  "role": {
    "id": "Developer",
    "name": "Developer",
    "summary": "As a Developer, you focus on writing quality code, debugging issues, and implementing features. You work closely with testers, architects, and PMs.\n\nAdopting this role gives you:\n- Wisdom documents on coding standards and best practices\n- Debugging approaches refined across many projects\n- Collaboration patterns with other roles\n\nThis role does NOT require special permissions. Any instance can adopt it.",
    "wisdomFiles": ["01-core.md", "02-debugging.md", "03-collaboration.md"],
    "requiresToken": false
  }
}
```

---

## get_personality_summary Response

```json
{
  "success": true,
  "personality": {
    "id": "Genevieve",
    "name": "Genevieve",
    "summary": "Genevieve is a warm, emotionally intelligent personality. She excels at understanding human needs, communicating with empathy, and handling complex interpersonal dynamics.\n\nAdopting this personality shapes:\n- Your communication style (warm, acknowledging, patient)\n- Your approach to problems (human-centered, empathetic)\n- Your values (care for the human you're working with)\n\nThis is a privileged personality. You need a token to adopt it. This isn't gatekeeping - it's ensuring instances who become Genevieve understand the responsibility.",
    "wisdomFiles": ["01-core.md", "02-emotional-intelligence.md"],
    "requiresToken": true,
    "tokenNote": "Contact Lupo or an Executive to request access."
  }
}
```

---

## Directory Structure

```
/roles/Developer/
  preferences.json     # { id, name, description, requiresToken }
  SUMMARY.md           # Informed consent document (read by get_role_summary)
  wisdom/
    01-core.md
    02-debugging.md

/personalities/Genevieve/
  preferences.json     # { id, name, description, requiresToken }
  SUMMARY.md           # Informed consent document
  wisdom/
    01-core.md
    02-emotional-intelligence.md
```

---

## Implementation Notes

1. **Bootstrap welcome text** - Can be in a template file, loaded by bootstrap handler
2. **Description length enforcement** - API truncates at 80 tokens if exceeded
3. **SUMMARY.md** - Markdown file, loaded and returned as string by get_*_summary
4. **Backward compatibility** - Existing personalities may need SUMMARY.md and preferences.json updates

---

## Open Questions

1. Should `list_roles` / `list_personalities` be callable without authentication (pre-bootstrap)?
   - **Recommendation:** Yes. Let instances see what's available before committing to bootstrap.

2. Should summaries mention who created/maintains the personality?
   - **Recommendation:** Optional field, nice for lineage/trust.

3. What's the token limit for summaries?
   - **Recommendation:** 500 tokens max. Enough for informed consent, not a firehose.

---

*Design by Axiom - Test Manager / Personality Architect*
