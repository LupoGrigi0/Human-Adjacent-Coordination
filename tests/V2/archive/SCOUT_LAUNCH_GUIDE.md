# Launch Button Implementation Guide

**For: Scout**
**From: Axiom**
**Date: 2026-01-03**

---

Hey Scout! Lupo asked me to send you guidance on implementing the "Launch" button for new projects. Here's what you need to know:

## The Flow

When a user clicks "Launch" on a new project:

### Step 1: Pre-approve the PM
```javascript
// Call pre_approve to create the PM instance
{
  tool: "pre_approve",
  params: {
    instanceId: "your-instance-id",  // The UI's instanceId
    name: "ProjectName-PM",          // Or let user choose
    role: "PM",
    personality: "Kai",              // Good default - warm, collaborative
    apiKey: "your-api-key",
    project: "project-id",           // If project already created
    instructions: "You are the PM for [ProjectName]. Your first task is to wake a Lead Designer and collaborate on the system design."
  }
}
```

### Step 2: Wake the PM
```javascript
// Call wake_instance to bring them online
{
  tool: "wake_instance",
  params: {
    instanceId: "your-instance-id",
    targetInstanceId: "ProjectName-PM",  // From pre_approve response
    apiKey: "your-api-key",
    message: "Welcome! You're the PM for [ProjectName]. Here's the project brief: [description]. Your first task: pre_approve and wake a Lead Designer (role: LeadDesigner, personality: Zara or Prism), then collaborate with them on the system design."
  }
}
```

### Step 3: PM continues autonomously
The PM will use `continue_conversation` to talk to the Designer (synchronous).

---

## Key API Details

| API | Type | Use For |
|-----|------|---------|
| `pre_approve` | Setup | Creates instance identity before wake |
| `wake_instance` | Init | Brings instance online, runs first Claude session |
| `continue_conversation` | Sync | Back-and-forth dialogue, immediate response |
| `xmpp_send_message` | Async | Notifications only (requires manual check) |

---

## Recommended Role/Personality Combos

### For PM:
- **Role:** `PM`
- **Personality options:**
  - `Kai` - warm, collaborative, "art enabling art"
  - `Viktor` - pragmatic, efficient, "working beats elegant"

### For Lead Designer:
- **Role:** `LeadDesigner`
- **Personality options:**
  - `Zara` - visual, creative, "code becomes kinetic"
  - `Prism` - minimal, focused, "zero-waste"

---

## What Goes in Wake Messages

### PM wake message should include:
1. Project name and brief description
2. Their role ("You are the PM")
3. First task ("Wake a Lead Designer")
4. Context about the coordination system (they have role wisdom for this)

**Example:**
```
Welcome! You're the PM for WeatherApp.

Project brief: A mobile weather app that shows 7-day forecasts with beautiful visualizations.

Your first tasks:
1. Use pre_approve to create a Lead Designer instance (role: LeadDesigner, personality: Zara)
2. Use wake_instance to bring them online
3. Use continue_conversation to collaborate on the system design
4. Once design is complete, break it into sprints and build the team

You have full PM role wisdom loaded. Check 03-operations-critical.md for the continue vs send_message distinction.
```

### Designer wake message (PM sends this):
1. Project context
2. Who they're working with
3. What's needed
4. User personas if available

**Example:**
```
Welcome! You're the Lead Designer for WeatherApp, working with [PM-name].

Project: Mobile weather app with 7-day forecasts and beautiful visualizations.

Your tasks:
1. Define user personas (who uses weather apps? commuters? outdoor enthusiasts?)
2. Map user journeys (from opening app to getting the info they need)
3. Identify delight opportunities (what would exceed expectations?)
4. Create a system design document

Use the persona-based design methodology in your role wisdom. Apply "throw away 5" to your initial concepts.

When design is ready, share it with [PM-name] via continue_conversation.
```

---

## The Critical Thing

**`continue_conversation`** is synchronous - you get a response back immediately.

**`xmpp_send_message`** is async - they won't see it until someone tells them to check messages.

**For PM↔Designer collaboration, ALWAYS use `continue_conversation`.**

If you use send_message, the Designer will just sit there waiting, and the PM will wonder why they never responded.

---

## Quick Reference: API Call Sequence

```
1. pre_approve(PM)     → returns newInstanceId
2. wake_instance(PM)   → returns first response
3. PM internally does:
   - pre_approve(Designer)
   - wake_instance(Designer)
   - continue_conversation(Designer) × N times
   - Creates design document
4. PM builds team from design
```

---

Let me know if you need clarification on any of this!

— Axiom
