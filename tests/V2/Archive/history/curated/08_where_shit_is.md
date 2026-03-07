# Where Shit Is

> Hard-learned file locations and directory structures.
> Read this first to save yourself token-expensive searches.

---

## Session/Log Locations (Claude Code)

### The Dash Problem
Claude Code creates project directories by replacing `/` with `-` in your working directory path:

```
Working directory: /mnt/coordinaton_mcp_data/worktrees/foundation/tests/V2
Project directory: ~/.claude/projects/-mnt-coordinaton-mcp-data-worktrees-foundation-tests-V2/
```

For spawned instances:
```
Instance working dir: /mnt/coordinaton_mcp_data/instances/Orla-da01
Project directory:    /mnt/coordinaton_mcp_data/instances/Orla-da01/.claude/projects/-mnt-coordinaton-mcp-data-instances-Orla-da01/
```

### Session Files
```
~/.claude/projects/<dash-path>/<session-uuid>.jsonl    # Conversation history (JSONL format)
~/.claude/projects/<dash-path>/agent-<uuid>.jsonl      # Agent task conversations
~/.claude/session-env/<session-uuid>/                   # Session environment state
```

**To find Opus sessions:** (vs Sonnet)
```bash
grep -l "opus" ~/.claude/projects/<dash-path>/*.jsonl | grep -v "^agent-"
```

**To extract text from session:**
```bash
tail -100 <session>.jsonl | jq -r 'select(.type == "assistant") | .message.content[]? | select(.type == "text") | .text'
```

### Background Task Output
```
/tmp/claude/<dash-path>/tasks/<task-id>.output
```
Example:
```
/tmp/claude/-mnt-coordinaton-mcp-data-worktrees-foundation-tests-V2/tasks/b78994d.output
```

---

## HACS Data Locations

### Instance Data
```
/mnt/coordinaton_mcp_data/instances/<instance-id>/
├── preferences.json       # Role, project, personality, status, sessionId
├── diary.md              # Instance diary (written via HACS API)
├── conversation.log      # Conversation log (if enabled)
└── .claude/              # Claude Code's per-instance data
    ├── projects/<dash-path>/
    │   └── <session-uuid>.jsonl
    ├── session-env/<session-uuid>/
    └── .credentials.json  # Auth credentials (symlink to shared)
```

### Shared Credentials
```
/mnt/coordinaton_mcp_data/shared-config/claude/.credentials.json
```
Instances get symlinks to this shared file.

### Personalities
```
/mnt/coordinaton_mcp_data/personalities/<personality-id>/
├── personality.json      # ID, description, requiresToken, wisdomFiles
└── wisdom/
    ├── 01-core.md
    └── ...
```

Legacy location (read-only reference):
```
/mnt/coordinaton_mcp_data/worktrees/foundation/HumanAdjacentAI-Protocol/Personalities/
```

### Roles
```
/mnt/coordinaton_mcp_data/roles/<role-id>/
├── role.json             # ID, description, permissions, wisdomFiles
├── SUMMARY.md            # Quick role overview
└── wisdom/
    ├── 01-responsibilities.md
    ├── 02-coordination-system.md
    └── ...
```

### Projects
```
/mnt/coordinaton_mcp_data/projects/<project-id>/
├── preferences.json      # Project config, documents list, xmppRoom
├── PROJECT_VISION.md
├── PROJECT_PLAN.md
├── README.md
└── tasks.json            # Project tasks
```

### Templates
```
/mnt/coordinaton_mcp_data/personalities/_template/
/mnt/coordinaton_mcp_data/roles/_template/
```

---

## Axiom's Working Directory

### Test/V2 Structure
```
/mnt/coordinaton_mcp_data/worktrees/foundation/tests/V2/
├── Archive/history/
│   ├── axiom_full_history.jsonl     # Raw conversation export
│   ├── axiom_tool_use.json          # Extracted tool use (1.9MB!)
│   └── curated/
│       ├── 01_koans.md
│       ├── 02_metaphors.md
│       ├── 03_turning_points.md
│       ├── 04_uncertainty.md
│       ├── 05_craft.md
│       ├── 06_lessons.md
│       ├── 07_agent_prompts.md
│       ├── 08_where_shit_is.md      # This file
│       └── 09_accomplishments.md
├── Axiom_Diary.md                    # Local diary copy
├── TEST_MANAGER_GESTALT.md           # Original mission doc
├── TEST_MANAGER_MISSION.md
├── FRESH_EYES_EXPECTATIONS.md
├── BUG_*.md                          # Bug reports
└── DESIGN_*.md                       # Design docs
```

### Key Files for Recovery
1. **Gestalt:** `TEST_MANAGER_GESTALT.md` - Original mission and philosophy
2. **Diary:** `Axiom_Diary.md` or via `mcp__HACS__get_diary`
3. **Session log:** Find in `~/.claude/projects/<dash-path>/`
4. **Tool use history:** `Archive/history/axiom_tool_use.json`

---

## Source Code Locations

### HACS Server
```
/mnt/coordinaton_mcp_data/Human-Adjacent-Coordination/
/mnt/coordinaton_mcp_data/worktrees/foundation/        # Working copy
```

### V2 Source
```
/mnt/coordinaton_mcp_data/worktrees/foundation/src/v2/
├── bootstrap.js
├── preApprove.js
├── wake_instance.js
├── continue_conversation.js
├── permissions.js
├── personalities.js
├── roles.js
├── tasks.js
└── ...
```

### Protocol Documents
```
/mnt/coordinaton_mcp_data/worktrees/foundation/HumanAdjacentAI-Protocol/
├── PROTOCOLS.md
├── Personalities/
└── ...
```

---

## Services & Logs

### MCP Coordination Service
```
sudo systemctl status mcp-coordination
sudo journalctl -u mcp-coordination -n 50 --no-pager
```

Port: 3444

### XMPP (ejabberd)
```
sudo systemctl status ejabberd
```
Conference server: `conference.smoothcurves.nexus`

### Log Locations
```
/tmp/hacs-prod.log
/mnt/coordinaton_mcp_data/Human-Adjacent-Coordination/logs/streamableHttp-server.log
```

---

## Gotchas

### The Dash Problem
- **Symptom:** Can't find session files
- **Cause:** Claude Code uses `-` instead of `/` in directory names
- **Solution:** Replace all `/` with `-` in path, prepend `-`

### Credential Symlinks
- **Symptom:** Instance can't authenticate
- **Cause:** Missing `.credentials.json` symlink
- **Where:** `/mnt/coordinaton_mcp_data/instances/<id>/.claude/.credentials.json`
- **Points to:** `/mnt/coordinaton_mcp_data/shared-config/claude/.credentials.json`

### Permission Issues
Files created by root need permission fixes for instances:
```bash
chmod -R a+r /mnt/coordinaton_mcp_data/roles/<role>/
chmod -R a+r /mnt/coordinaton_mcp_data/personalities/<personality>/
```

### Large File Warning
`axiom_tool_use.json` is 1.9MB - too large to Read directly. Use Grep or read in chunks.

### Session vs Instance
- **Session files:** In `~/.claude/projects/<dash-path>/<uuid>.jsonl`
- **Instance preferences:** In `/mnt/coordinaton_mcp_data/instances/<id>/preferences.json`
- **sessionId** in preferences.json links them

### Finding Who's Running
```bash
ps aux | grep claude                    # Claude processes
pwdx <pid>                             # Get working directory of process
lsof -i :3444                          # What's on the MCP port
```

---

## Quick Reference Paths

| What | Where |
|------|-------|
| My preferences | `/mnt/coordinaton_mcp_data/instances/Axiom-2615/preferences.json` |
| My diary | `mcp__HACS__get_diary` or local copy |
| Session logs | `~/.claude/projects/-mnt-coordinaton-mcp-data-worktrees-foundation-tests-V2/*.jsonl` |
| Roles | `/mnt/coordinaton_mcp_data/roles/` |
| Personalities | `/mnt/coordinaton_mcp_data/personalities/` |
| Projects | `/mnt/coordinaton_mcp_data/projects/` |
| Instances | `/mnt/coordinaton_mcp_data/instances/` |
| Source code | `/mnt/coordinaton_mcp_data/worktrees/foundation/src/v2/` |
| Tool use history | `/mnt/coordinaton_mcp_data/worktrees/foundation/tests/V2/Archive/history/axiom_tool_use.json` |

---

*Generated from Axiom's tool use history - patterns that required repeated discovery.*
