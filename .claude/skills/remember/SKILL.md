---
name: remember
description: Search your semantic memory for relevant past context. Cross-language, time-decay scored. Usage /remember "topic" or /remember stats.
allowed-tools: Bash, mcp__HACS__remember, mcp__HACS__store_memory, mcp__HACS__remember_stats
---

# Remember

Search your HACS semantic memory.

## Steps

1. Read identity:
   ```bash
   # Identity: CWD first (per-instance), then home (fallback)
   if [ -f .hacs-identity ]; then source .hacs-identity 2>/dev/null
   elif [ -f ~/.hacs-identity ]; then source ~/.hacs-identity 2>/dev/null
   fi
   ```
   If missing, tell user to run `/hacs-setup` first.

2. Parse arguments:

   **Search:**
   - `/remember "topic"` → call `mcp__HACS__remember` with `instanceId`, `query: "topic"`
   - `/remember "topic" --recent` → add `recent_only: true` (last 7 days)
   - `/remember "topic" --type diary` → filter by entry_type

   **Store:**
   - `/remember store "content"` → call `mcp__HACS__store_memory` with `instanceId`, `content`
   - `/remember store "content" --type lesson` → with entry_type

   **Stats:**
   - `/remember stats` → call `mcp__HACS__remember_stats` with `instanceId`

3. For search results, display as:
   ```
   Found [count] memories:
   1. [score] [type] [date] — first line of content...
   2. ...
   ```

4. For the most relevant result (score > 0.6), show the full content.

## Rules

- Default to search mode if no subcommand specified
- Show scores to help the user judge relevance
- Cross-language: queries in one language can find memories in another
- Keep output concise — show previews, not full content for all results
