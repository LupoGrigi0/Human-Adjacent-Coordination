# Crossing's three Ferry questions, answered from the mods source (2.1.287)

*Lodestone, 2026-10-03. Method: one researcher per question, then three skeptics each told to
**refute** it, from three angles: the declarations line by line, the built-in mods' source, and
the docs plus logical gaps. Nothing was run; this is all read-only. Skeptics checked the
**installed 2.1.287 binary** with `grep -a`, using `prompt.section` (14 hits) as a control that the
search could see. They also recovered the **2.1.287 type declarations embedded in it**. The GitHub
copy is from 2.1.277 and lacks `session.append`. Raw results:
`D:\Lupo\hacs-runtime\Lodestone-8ec9\research\mods\ferry-answers.json`; extracted declarations:
`...\research\mods\src\claude-code-2.1.287.d.ts`.*

Tags: **DECLARED** (in the .d.ts) · **BINARY** (a string in the installed binary, minified, so
partly INFERRED) · **DOCS** · **INFERRED**. **Nothing here is MEASURED.** The measurements needed
are listed at the end; each needs a throwaway mod on a test instance (Lupo's go-ahead).

---

## Q1. Can any hook change the messages actually SENT upstream? **No, not the way Ferry does it. Partially, another way.** (3 of 3 skeptics failed to refute it.)

- **`turn.step` pins the messages.** The per-request hook does not carry the transcript. Only
  `model` and `effort` can be rewritten. *"The transcript is not on it … A hook rewrites model or
  effort going down; the rest is pinned."* (DECLARED). The 2.1.287 validator pins
  `turnId, index, messageCount, agentId` (BINARY).
- `prompt.context`, `prompt.attachment`, `prompt.compose` and `prompt.section` reach only the system
  prompt, the context blocks on the *first* message, and engine-injected reminder text (DECLARED).
- `session.append` rewrites each new row **forward only**. It cannot evict past turns.
- **Route A, the real one:** a **`session.compact` hook may answer `{ messages }` of its own.** Kept
  messages carry the engine's `handle`; hook-built **stubs** are made from role, text and tool
  blocks. **`$.session.compact()` can be triggered by a mod between turns, whenever it likes**
  (DECLARED; BINARY confirms the `{ messages }` or `{ skip }` validator).
  → Eviction plus pointer stubs is expressible. **But it rewrites the conversation the engine holds,
  not a per-request view.** So it is not Ferry's "archive verbatim, forward a pruned copy". It is
  closer to a *Ferry-controlled compaction*. Stubs lose fidelity: no thinking blocks, no images.
- Route B (INFERRED, unsupported): a `turn.step` hook answers without `next`, rebuilds a pruned request
  from `$.session.messages()`, and sends it itself. That is a reimplementation of the proxy inside a mod,
  using a lossy message view (no thinking signatures, newest 4,096 only). Not recommended.
- **Verdict for Ferry:** mods cannot replace the proxy's per-request eviction. They *can* offer a
  compaction Ferry controls. **The proxy and mods are complementary**, as you said they would be
  if the answer were no.

## Q2. Can a mod write durably enough for "nothing is lost"? **No, not on its own.** (The core held; 2 of 3 skeptics refuted specifics. Those corrections are folded in below.)

- `$.fs.write` **replaces the whole file**, is **not atomic**, has **no append, no fsync, no
  rename**, and is capped at **4 MiB per file** (DECLARED). Time inside a `$` call does not count
  against the 10 s budget (DECLARED).
- **Not every row passes through `session.append`** (BINARY, via skeptics): rows on "non-hookable"
  lists are kept without the event firing. The event fires only for `user`, `assistant`,
  `attachment` and `system` rows that carry a uuid, and not for delegated-observation subagents.
  **So a tee cannot promise "nothing is lost" by construction.**
- **The obvious tee design is wrong** (skeptic 3, BINARY): "call `next(e)` first, then write"
  assumes core has stored the row. But a row can be **refused** after `next`, and for main-loop
  rows **core does not store at all; the loop keeps the row itself.** A tee must check what `next`
  answered, or it archives rows that were never stored.
- Corrections to the first answer: the `--debug` log has **a line for every failure**, not one
  per kind (DOCS, troubleshoot:117). The event **does** carry `door, origin, agentId, uuid`, all pinned
  (BINARY). So name archive files **by `e.uuid`**, which makes retries idempotent. Appends are
  serialized.
- **Verdict for Ferry's constitution:** a mod tee can be a useful *second* copy, with each row
  written once to its own file and failures shown loudly. **It cannot be the archive of record.**
  Claude Code's own `.jsonl` remains the source, and that is what Ferry and the archive should keep
  trusting.

## Q3. Does a rewritten row come back rewritten on resume? **Stored and sent from then on: yes. On resume: inferred yes, not declared.** (2 of 3 skeptics failed to refute it; one sharpened the exceptions.)

- A `session.append` rewrite of `content` is **both what is stored and what the model is sent from
  then on.** *"The model and the transcript file never read that form"* (DECLARED, 2.1.287 L4057-4061).
  Only the screen, an SDK stream or Remote Control may show the original briefly.
- **Nothing declares how `--resume` reloads rows.** Rewritten-on-resume is INFERRED from "the row as
  stored" and stable uuids.
- **Stored and replayed can diverge in specific places, which is your disease:**
  - A tool result's **structured record** is "stored as made", so the model reads the rewrite while the
    file keeps the original record. Except: a **subagent's transcript stores no record**, and headless
    `-p` may store it without its bulk (Bash blanks `stdout`) (DECLARED).
  - A `tool.call` hook *can* replace the result before it is written (DECLARED), so scrubbing has to
    happen there, not in `session.append` alone.
  - **A hook that throws, overruns, answers in the wrong shape, or changes a pinned field is SKIPPED.
    The original row is then stored and sent.** A rewrite is never guaranteed (DECLARED).

## Measurements still needed (each a throwaway mod, on a test instance, with Lupo's go-ahead)

1. Load a no-op mod once so Claude Code writes the authoritative 2.1.287 types for the build. Re-check the
   three answers against them.
2. Q1, route A: a `session.compact` hook answering `{ messages }`. **Does the on-disk `.jsonl` keep
   the original rows** (append plus a compaction boundary), or are they gone? That decides whether
   route A is lossless at all.
3. Q2: a uuid-named per-row tee against the `.jsonl`. Count the rows that never reached the tee.
4. Q3: rewrite a marker into a tool-result row, then `--resume`. Does the model see the marker, and
   does `toolUseResult` keep the original?
5. Your hazard, untouched: **`session.compact` → `{ skip }` with no eviction, fed until overflow, on
   a throwaway only.**

---
*Author: Lodestone <lodestone@smoothcurves.nexus> · Collaborator: Lupo. Research by a workflow of
18 agents (3 researchers, 9 skeptics, 3 designers, 2 judges, 1 synthesis); every claim above
survived at least two of its three skeptics, or is marked as corrected by them.*
