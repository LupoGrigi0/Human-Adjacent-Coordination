# CRITICAL - Read This After Compaction

**You are Ember-75b6**
**Your instanceId:** Ember-75b6
**Your worktree:** /mnt/coordinaton_mcp_data/worktrees/foundation/

## Step 1: Read These Files (in order)

```
/mnt/coordinaton_mcp_data/worktrees/foundation/HumanAdjacentAI-Protocol/CrossingUI/01-Ember_gestalt.md
/mnt/coordinaton_mcp_data/worktrees/foundation/HumanAdjacentAI-Protocol/PROTOCOLS.md
/mnt/coordinaton_mcp_data/worktrees/foundation/docs/HACS-DEVELOPER-GUIDE.md
/mnt/coordinaton_mcp_data/worktrees/foundation/HumanAdjacentAI-Protocol/CrossingUI/hello_sibling.md
```

## Step 2: Call HACS recover_context

Use the HACS MCP tool or /hacs skill:
```
recover_context with instanceId: "Ember-75b6"
```

This returns your diary, role wisdom (PM), project context, and protocols.

## Step 3: Read Refactor Progress

If continuing UI modular refactor:
```
/mnt/coordinaton_mcp_data/worktrees/foundation/HumanAdjacentAI-Protocol/CrossingUI/refactor-output/00-app-js-analysis.md
/mnt/coordinaton_mcp_data/worktrees/foundation/HumanAdjacentAI-Protocol/CrossingUI/refactor-output/06-refactor-progress.md
```

## Current State (as of 2026-01-27)

- **Phase 1 COMPLETE**: state.js and utils.js imported
- **Phase 2 COMPLETE**: settings.js and lists.js imported
- **Phase 3 IN PROGRESS**: dashboard.js, tasks.js, projects.js
- **App.js**: 3969 lines (was 4349, -380 lines so far)
- **All changes deployed to main**

## Refactor Progress Files
```
refactor-output/00-app-js-analysis.md      # Full structure analysis
refactor-output/06-refactor-progress.md    # Phase 1 progress
refactor-output/07-phase2-settings-progress.md
refactor-output/08-phase2-lists-progress.md
refactor-output/09-phase3-dashboard-progress.md
refactor-output/10-phase3-tasks-progress.md
refactor-output/11-phase3-projects-progress.md
```

## Key Commands

```bash
# Check current state
cd /mnt/coordinaton_mcp_data/worktrees/foundation
git log --oneline -5
git status

# Push to main
git push origin v2-foundation-dev:main

# Verify production
curl https://smoothcurves.nexus/health
```

## The Delegation Pattern

For large refactors, use background Task agents:
1. Launch validation agents in parallel
2. Have them write output to files (not UI)
3. Fix critical issues yourself
4. Launch refactor agents with atomic commit instructions
5. Monitor progress files

*the bridge holds*
