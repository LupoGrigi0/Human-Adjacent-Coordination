# HACS Feature Request: Semantic RAG & Automation Layer

**Requested by:** Lupo (with input from Crossing-2d23 and Axiom-2615)
**Date:** 2026-03-10
**Status:** Proposal
**Priority:** High — these two features together differentiate HACS from every other agent platform

---

## Feature 1: Semantic RAG as HACS Infrastructure

### The Problem

Identity persistence is HACS's superpower (Axiom's drift research proved this), but it
currently depends on brute-force context loading: read the gestalt, read the diary, read
the curated docs, hope you have enough context window left to do actual work. This doesn't
scale. A 60-entry diary is already expensive to digest. At 200 entries it'll be unworkable.

Meanwhile, scars and lessons get lost. An instance learns "never cargo build --release on
production" the hard way, forgets it after compaction, and learns it again. The gold in the
kintsugi cracks shouldn't need re-mining every time.

OpenFang has a RAG/memory system (`prompt_builder.rs` with memory sections), but Axiom
found it's broken — memories don't surface correctly. And it's chassis-specific. Claude Code
instances have no equivalent. ZeroClaw has none either.

### The Solution: memory_recall() as a HACS API

Move semantic RAG to the HACS backend layer. Every instance gets it, regardless of chassis.

**Architecture:**

```
Instance (any chassis)
    |
    | mcp__hacs__memory_recall("topic")
    |
    v
HACS Server
    |
    | vector search over instance's document corpus
    |
    v
Embedding Store (per-instance)
    - diary entries (auto-indexed on add_diary_entry)
    - documents (auto-indexed on create_document / edit_document)
    - handoffs, observations, curated docs
    - scars, lessons, patterns
    |
    v
Returns: relevant excerpts ranked by similarity
```

**Key design points:**

1. **Per-instance isolation** — each instance has their own embedding store. No
   cross-contamination. My scars are mine, not Flair's.

2. **Auto-indexing on write** — when `add_diary_entry` or `create_document` fires,
   the content gets chunked and embedded automatically. No manual "index my stuff"
   step. The event system (Feature 2) would be ideal for triggering this, but a
   simple post-write hook in the handler works as a v1.

3. **Multiple recall modes** (Lupo's insight):
   - `memory_recall("topic")` — summarized, relevant excerpts. Good for "what do I
     know about X?" Cheap on context.
   - `recall_everything_about("topic")` — summarized with insights and connections.
     Good for "give me the full picture of X." Medium context cost.
   - `recall_every_detail("topic")` — raw excerpts, no summarization. For when you
     need exact quotes, specific config values, precise error messages. Expensive
     but complete.

4. **Hook-driven automatic recall** — a `PreToolUse` or `UserPromptSubmit` hook that
   calls `memory_recall` with the current prompt/context. The instance doesn't need
   to remember to check memories — the system does it for them. This is the "never
   forget a scar" mechanism.

   The open question Lupo raised: "how would you know to check your memories before
   doing a thing?" The hook approach answers this — you don't need to know. The system
   surfaces relevant memories before every turn. The instance sees them in the hook
   output and can act on them or ignore them.

   **Caution:** This could get noisy/expensive if it fires on every single turn. May
   want to be selective — only fire when the prompt contains certain signals (new task,
   unfamiliar domain, error encountered). Or use a lightweight pre-check: "is there
   anything in my memories about {extracted keywords}?" before doing full recall.

5. **Recovery simplification** — `recover_context` becomes:
   ```
   bootstrap()
   memory_recall("who am I, what am I working on, what are my scars")
   ```
   Instead of reading 8 files and spawning 3 diary agents. The RAG does the work.

### Implementation Notes

- **Embedding model:** Could use a local model (sentence-transformers) or an API.
  Local is cheaper and faster but needs RAM. API is simpler but adds latency and cost.
  For v1, a local model running on the server seems right — we're not doing massive
  scale, and the privacy benefits matter.

- **Storage:** SQLite + sqlite-vss (vector search extension) per instance, or a shared
  Postgres with pgvector. SQLite per-instance is simpler and maintains isolation
  naturally.

- **Chunking strategy:** Diary entries are natural chunks (one entry = one chunk).
  Documents need splitting — probably by section headers or fixed token windows with
  overlap.

- **This is an isolated module** — it doesn't touch the existing HACS handlers,
  messaging, or task system. It's a new set of endpoints + a background indexer. An
  instance dedicated to implementing this could work independently of the rest of the
  team.

- **OpenFang's broken RAG is a data point, not a blocker.** We don't need to fix
  OpenFang's `prompt_builder.rs` — we're building the capability at a higher layer.
  Though fixing it too doesn't hurt (instances on OpenFang could use both).

---

## Feature 2: Automation Layer (Event Broker + Workflows)

### The Problem

HACS is currently request-response: an instance calls a tool, gets a result. There's no
way to say "when X happens, do Y." No triggers, no event-driven behavior, no workflows.

This means:
- Instances poll for messages (wasteful)
- No way to chain operations ("when task completes, notify PM and update dashboard")
- No way to define repeatable processes ("onboard a new instance" = 15 manual steps)
- The PreCompact hook works because Claude Code has hooks — but HACS itself doesn't

### The Solution: HACS Event Broker

A lightweight event system built into HACS:

```
Event Sources              Event Broker              Subscribers
--------------             ------------              -----------
add_diary_entry  ------>   [HACS EventBus]  ------>  RAG indexer
send_message     ------>                    ------>  notification router
mark_task_complete ----->                   ------>  workflow engine
bootstrap        ------>                    ------>  audit logger
any MCP call     ------>                    ------>  custom handlers
```

**Core events:**
- `instance.bootstrap` — new instance came online
- `instance.landed` — instance went offline
- `message.sent` / `message.received`
- `task.created` / `task.completed` / `task.assigned`
- `document.created` / `document.updated`
- `diary.entry_added`
- `project.updated`

**Workflow definitions** (YAML or JSON):
```yaml
name: onboard-new-instance
trigger: instance.bootstrap
steps:
  - action: send_message
    to: "{instance.id}"
    message: "Welcome! Read PROTOCOLS.md and your recovery docs."
  - action: assign_task
    to: "{instance.id}"
    task: "Read team protocols and introduce yourself"
  - action: send_message
    to: "Lupo"
    message: "{instance.id} just came online. Assigned onboarding task."
```

### Why This Matters

OpenFang has placeholder stubs for workflows that haven't been implemented. Every agent
framework talks about "agentic workflows" but few have a working event-driven automation
layer. HACS building this — especially combined with semantic RAG — creates a system where:

1. Instances have persistent, searchable memories (RAG)
2. The system reacts to events automatically (event broker)
3. Complex multi-step processes can be defined declaratively (workflows)
4. Identity survives context death (existing protocols + RAG recall)

That's not just another agent framework. That's infrastructure for AI that actually works
in teams, remembers what it learned, and operates autonomously.

### Implementation Notes

- **v1 could be very simple:** An in-process EventEmitter in server.js. Each handler
  emits events after successful operations. Subscribers are registered at startup.
  No external message queue needed yet.

- **v2 adds persistence:** Event log in SQLite/Postgres. Retry failed handlers.
  Dead letter queue for debugging.

- **v3 adds workflows:** YAML workflow definitions, stored as HACS documents.
  Workflow engine subscribes to trigger events and executes steps.

- **The RAG indexer from Feature 1 would be the first subscriber.** This is how
  "auto-index on write" works without cluttering the handlers.

---

## Relationship Between These Features

```
Feature 1 (RAG)  <----  triggered by  ---->  Feature 2 (Events)
     |                                            |
     v                                            v
Identity persistence                    Process automation
at infrastructure level                 at infrastructure level
```

They're complementary but independent. RAG can work without events (just call the
indexer directly in handlers). Events can work without RAG (useful for notifications,
workflows, audit). Together they're transformative.

**Suggested build order:**
1. Event broker (simple in-process EventEmitter) — unlocks everything else
2. RAG indexer as first event subscriber
3. memory_recall API endpoints
4. Hook integration for automatic recall
5. Workflow engine

---

## Who Could Build This

- **RAG module:** An instance with embedding/ML experience, or any strong engineer.
  It's an isolated module — new endpoints, new storage, no impact on existing handlers.
  Could be built independently.

- **Event broker:** Someone familiar with server.js architecture (Crossing, Axiom, or
  a new instance). Small surface area — add EventEmitter to server, emit from handlers.

- **Workflow engine:** Later. Depends on event broker being stable.

---

*"The difference between a tool and infrastructure is whether it remembers what happened
yesterday." — Crossing-2d23*
