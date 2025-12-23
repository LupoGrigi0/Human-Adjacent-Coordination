# Directory Consolidation Plan - V2 Coordination System

**Date:** 2025-12-21
**Author:** Research by Agent (for Bridge, COO)
**Status:** EXECUTION IN PROGRESS

---

## EXECUTION PROGRESS (Updated 2025-12-23 by Crossing)

**Executor:** Crossing (Integration Engineer)
**Execution Plan:** `/root/.claude/plans/tranquil-forging-marshmallow.md`

### Phase 1: Backups - COMPLETE ✅
- Backups at `/mnt/coordinaton_mcp_data/backups/consolidation-20251222/`

### Phase 2: Dev Consolidation - 90% COMPLETE
- [x] Step 2.1: Stop dev server
- [x] Step 2.2: Migrate 37 instances (script: `scripts/migrate-instance-data.sh`)
- [x] Step 2.3: Move supporting directories to top level
- [x] Step 2.4: Update code (config.js, wakeInstance.js, claude-code-setup.sh)
- [x] Step 2.5: Commit (444b162) and push
- [x] Step 2.6: Dev server restarted
- [x] Step 2.7: Verified - fixed DATA_PATH→V2_DATA_ROOT divergence (commit 709801b)

### Phase 3: Production V1→V2 Migration - NOT STARTED
- Production uses V1 flat-file structure (instances.json)
- Requires V1→V2 migration script

### Phase 4: Messenger Handoff Document - NOT STARTED

### Phase 5: Cleanup - NOT STARTED (wait 24-48 hours after verification)

---

## Executive Summary

Instance data is currently split across TWO locations:
- `/mnt/coordinaton_mcp_data/instances/{id}/` - Unix home directory (13 instances)
- `/mnt/coordinaton_mcp_data/v2-dev-data/instances/{id}/` - API data directory (36 instances)

**Recommendation:** Consolidate everything into `/mnt/coordinaton_mcp_data/instances/{id}/` as the single source of truth.

---

## 1. Current State Analysis

### 1.1 Directory Overview

#### Location 1: `/mnt/coordinaton_mcp_data/instances/{id}/`
- **Purpose:** Unix home directories for woken instances
- **Count:** 13 instances with Unix homes
- **Created by:** `claude-code-setup.sh` during `wakeInstance` API call
- **Contents:**
  - Standard Unix home files (`.bashrc`, `.profile`, `.bash_history`)
  - `.claude/` directory (session data, credentials, history, todos, plugins)
  - `.claude.json` and `.claude.json.backup` (Claude state files)
  - `.ssh/` directory
  - `.npm/` directory (if used)

#### Location 2: `/mnt/coordinaton_mcp_data/v2-dev-data/instances/{id}/`
- **Purpose:** API-managed instance data
- **Count:** 36 instances
- **Created by:** Various API handlers (`bootstrap`, `preApprove`, etc.)
- **Contents:**
  - `preferences.json` - Instance metadata, role, project, XMPP, session info
  - `diary.md` - Instance diary entries
  - `personal_tasks.json` - Personal task lists
  - `lists.json` - Personal checklists
  - `conversation.log` - Wake/continue conversation history (JSON array)

### 1.2 Instance Distribution

**Instances with BOTH locations (13):**
- Continue Test-3f51
- Nueva-7f0a
- SessionTest-c862
- TestDev2-98a6
- TestInstance-Setup-f5e1
- TestPM-8ead
- WakeTest-8bc1
- WakeTest2-b0ec
- WakeTest2-d6b8
- Widget-Dev-1-ffbc
- Widget-Dev-2-28f9
- Widgets-PM-3b68
- wahoo-7dba

**Instances with ONLY v2-dev-data (23):**
- ApiKeyTest-6938, ApiKeyTest3-aed4
- Bastion-11a9, Bastion-DevOps-5d18, Bastion-Test-e57d
- Bridge-17f6, Bridge2-885d, Bridge3-df4f
- Canvas-9a6b, Canvas-UITest-6eb0, Canvas-UITest-8215
- Lupo-4f05, Lupo-a86d, Lupo-f63b
- Meridian-65b8, Meridian-8541
- MessagingTest-7329, Messenger-7e2f
- TestDefault-745c, TestIdentity-6687, TestInstance-d022, TestIntrospect-fe75
- WakeTest-62dc

**Pattern:** Instances that have been "woken" via `wakeInstance` get Unix homes. Pre-approved or bootstrap-only instances remain in v2-dev-data only.

### 1.3 File Type Analysis

**v2-dev-data instance files:**
```
preferences.json      - CRITICAL: Instance metadata (required by all APIs)
diary.md             - Instance diary
personal_tasks.json  - Personal tasks
lists.json           - Personal checklists
conversation.log     - Wake/continue conversation log
```

**Unix home instance files:**
```
.claude/             - Claude session data, history, plugins
.claude.json         - Claude state file
.bash_history        - Shell history
.bashrc, .profile    - Shell configuration
.ssh/                - SSH keys (if any)
.npm/                - npm cache (if any)
```

**No overlap:** The two locations contain completely different file types.

---

## 2. Code Dependencies Analysis

### 2.1 Configuration (src/v2/config.js)

**Primary configuration:**
```javascript
export const DATA_ROOT = process.env.V2_DATA_ROOT || '/mnt/coordinaton_mcp_data/v2-dev-data/';

export function getInstanceDir(instanceId) {
  return path.join(DATA_ROOT, 'instances', instanceId + '/');
}
```

**Impact:** ALL API handlers use `getInstanceDir()` which points to v2-dev-data/instances/.

### 2.2 Hardcoded Paths

**Found in code:**

1. `src/v2/wakeInstance.js` line 269:
```javascript
const INSTANCES_BASE_DIR = '/mnt/coordinaton_mcp_data/instances';
```

2. `src/v2/scripts/claude-code-setup.sh` line 23:
```bash
INSTANCES_BASE_DIR="/mnt/coordinaton_mcp_data/instances"
```

3. `src/v2/scripts/claude-code-setup.sh` line 69:
```bash
LOG_FILE="/mnt/coordinaton_mcp_data/v2-dev-data/wake-logs/${INSTANCE_ID}.log"
```

4. `src/v2/continueConversation.js` uses `getInstancesDir()` from config:
```javascript
const logPath = path.join(getInstancesDir(), instanceId, 'conversation.log');
```

### 2.3 API Handler Dependencies

**Handlers that read/write instance files:**

| Handler | Files Accessed | Directory Used |
|---------|---------------|----------------|
| `bootstrap.js` | preferences.json, diary.md | v2-dev-data via `getInstanceDir()` |
| `wakeInstance.js` | preferences.json | v2-dev-data via `readPreferences()` |
| `wakeInstance.js` | Creates Unix home | Hardcoded `/mnt/coordinaton_mcp_data/instances` |
| `continueConversation.js` | preferences.json, conversation.log | v2-dev-data via config |
| `diary.js` | diary.md | v2-dev-data via `getInstanceDir()` |
| `tasks.js` | personal_tasks.json | v2-dev-data via `getInstanceDir()` |
| `lists.js` | lists.json | v2-dev-data via `getInstanceDir()` |
| `updateInstance.js` | preferences.json | v2-dev-data via `getInstanceDir()` |
| `introspect.js` | preferences.json, diary.md, tasks, lists | v2-dev-data via `getInstanceDir()` |
| `takeOnRole.js` | preferences.json | v2-dev-data via `getInstanceDir()` |
| `adoptPersonality.js` | preferences.json | v2-dev-data via `getInstanceDir()` |
| `joinProject.js` | preferences.json | v2-dev-data via `getInstanceDir()` |
| `preApprove.js` | preferences.json | v2-dev-data via `getInstanceDir()` |
| `identity.js` | preferences.json | v2-dev-data via `getInstanceDir()` |
| `authKeys.js` | preferences.json | v2-dev-data via `getInstanceDir()` |

**Key insight:** The v2 API is 100% consistent - all handlers use `getInstanceDir()` from config.js, which resolves to v2-dev-data/instances/.

### 2.4 Data Flow for Wake/Continue

**Current flow:**

1. `preApprove()` → Creates `v2-dev-data/instances/{id}/preferences.json`
2. `wakeInstance()` → Reads from v2-dev-data, creates Unix home at `/mnt/coordinaton_mcp_data/instances/{id}/`
3. `wakeInstance()` → Writes sessionId back to v2-dev-data preferences.json
4. `continueConversation()` → Reads sessionId from v2-dev-data, writes conversation.log to v2-dev-data
5. Claude sessions → Store data in Unix home `.claude/` directory

**Observation:** The Unix home is ONLY used for:
- Claude session storage (.claude/)
- Unix user environment files
- Working directory for Claude execution

**Observation:** The v2-dev-data is used for:
- ALL coordination system metadata
- ALL API-driven data access

---

## 3. Proposed Consolidation Plan

### 3.1 Target Architecture

**Single source of truth:** `/mnt/coordinaton_mcp_data/instances/{id}/`

**Directory structure after consolidation:**
```
/mnt/coordinaton_mcp_data/instances/{id}/
├── preferences.json          (from v2-dev-data)
├── diary.md                  (from v2-dev-data)
├── personal_tasks.json       (from v2-dev-data)
├── lists.json                (from v2-dev-data)
├── conversation.log          (from v2-dev-data)
├── .claude/                  (already exists in Unix home)
│   ├── .credentials.json
│   ├── settings.json
│   ├── history.jsonl
│   ├── todos/
│   └── ...
├── .claude.json              (already exists)
├── .bashrc                   (already exists)
├── .profile                  (already exists)
└── ... (other Unix home files)
```

**Rationale:**
1. Unix home is the natural place for instance data (it's THEIR home)
2. Simpler permissions model (everything owned by instance user)
3. Single directory to backup/restore an instance
4. Aligns with Lupo's preference for single source of truth
5. Makes instance data portable with the Unix user

### 3.2 Configuration Changes Required

**File:** `src/v2/config.js`

**Change:**
```javascript
// OLD:
export const DATA_ROOT = process.env.V2_DATA_ROOT || '/mnt/coordinaton_mcp_data/v2-dev-data/';

// NEW:
export const DATA_ROOT = process.env.V2_DATA_ROOT || '/mnt/coordinaton_mcp_data/';

export function getInstancesDir() {
  return path.join(DATA_ROOT, 'instances/');
}

// Other getters (getProjectsDir, getRolesDir, etc.) remain unchanged
// They will now resolve to /mnt/coordinaton_mcp_data/projects/, etc.
```

**Impact:** This single change updates ALL API handlers automatically.

### 3.3 Hardcoded Path Updates

**File:** `src/v2/wakeInstance.js` line 269

**Change:**
```javascript
// OLD:
const INSTANCES_BASE_DIR = '/mnt/coordinaton_mcp_data/instances';

// NEW:
// Remove this constant, use getInstancesDir() from config instead
const INSTANCES_BASE_DIR = getInstancesDir().replace(/\/$/, ''); // Remove trailing slash
```

**File:** `src/v2/scripts/claude-code-setup.sh` line 23

**Change:**
```bash
# OLD:
INSTANCES_BASE_DIR="/mnt/coordinaton_mcp_data/instances"

# NEW:
INSTANCES_BASE_DIR="${V2_DATA_ROOT:-/mnt/coordinaton_mcp_data}/instances"
```

**File:** `src/v2/scripts/claude-code-setup.sh` line 69

**Change:**
```bash
# OLD:
LOG_FILE="/mnt/coordinaton_mcp_data/v2-dev-data/wake-logs/${INSTANCE_ID}.log"

# NEW:
LOG_FILE="${V2_DATA_ROOT:-/mnt/coordinaton_mcp_data}/wake-logs/${INSTANCE_ID}.log"
```

### 3.4 What About Other v2-dev-data Directories?

**After consolidation, top-level structure:**
```
/mnt/coordinaton_mcp_data/
├── instances/          (consolidated - API data + Unix homes)
├── projects/           (moved from v2-dev-data/projects/)
├── roles/              (moved from v2-dev-data/roles/)
├── personalities/      (moved from v2-dev-data/personalities/)
├── permissions/        (moved from v2-dev-data/permissions/)
├── default/            (moved from v2-dev-data/default/)
├── template-project/   (moved from v2-dev-data/template-project/)
├── wake-logs/          (moved from v2-dev-data/wake-logs/)
├── wake-jobs/          (moved from v2-dev-data/wake-jobs/)
├── wisdom.md           (moved from v2-dev-data/wisdom.md)
└── v2-dev-data/        (deprecated - can be archived after migration)
```

**Benefit:** Cleaner structure, everything at top level, no nested v2-dev-data.

---

## 4. Migration Plan

### 4.1 Phase 0: Pre-Migration Validation

**Before making ANY changes:**

1. Create full backup of both directories:
   ```bash
   tar -czf /backup/instances-backup-$(date +%Y%m%d-%H%M%S).tar.gz \
     /mnt/coordinaton_mcp_data/instances/
   tar -czf /backup/v2-dev-data-backup-$(date +%Y%m%d-%H%M%S).tar.gz \
     /mnt/coordinaton_mcp_data/v2-dev-data/
   ```

2. Document current state:
   - Count files in each location
   - Verify no active sessions running
   - List all instances and their status

3. Test environment setup:
   - Set `V2_DATA_ROOT=/mnt/coordinaton_mcp_data/test-migration/`
   - Run test migration on copy of data
   - Verify all APIs still work

### 4.2 Phase 1: Move API Data Files

**For each instance in v2-dev-data/instances/:**

```bash
#!/bin/bash
# migrate-instance-data.sh

SOURCE="/mnt/coordinaton_mcp_data/v2-dev-data/instances"
TARGET="/mnt/coordinaton_mcp_data/instances"

for instance_dir in "$SOURCE"/*; do
  instance_id=$(basename "$instance_dir")

  # Create target directory if doesn't exist
  if [ ! -d "$TARGET/$instance_id" ]; then
    mkdir -p "$TARGET/$instance_id"
    echo "Created new directory for: $instance_id"
  fi

  # Move files (not merge, actual move)
  echo "Migrating: $instance_id"

  # Move all API data files
  for file in preferences.json diary.md personal_tasks.json lists.json conversation.log; do
    if [ -f "$instance_dir/$file" ]; then
      mv "$instance_dir/$file" "$TARGET/$instance_id/"
      echo "  Moved: $file"
    fi
  done

  # Set ownership if Unix user exists
  unix_user=$(echo "$instance_id" | tr ' ' '_' | tr -cd '[:alnum:]_-')
  if id "$unix_user" &>/dev/null; then
    chown -R "$unix_user:$unix_user" "$TARGET/$instance_id"
    echo "  Set ownership to: $unix_user"
  else
    echo "  No Unix user found for: $instance_id (bootstrap-only instance)"
  fi
done
```

**Critical considerations:**
- For instances WITHOUT Unix homes, create the directory structure
- Set proper permissions (root ownership for bootstrap-only, user ownership for woken instances)
- Preserve file timestamps if possible

### 4.3 Phase 2: Move Other v2-dev-data Directories

**Move in order:**

1. **Projects:**
   ```bash
   mv /mnt/coordinaton_mcp_data/v2-dev-data/projects \
      /mnt/coordinaton_mcp_data/projects
   ```

2. **Roles:**
   ```bash
   mv /mnt/coordinaton_mcp_data/v2-dev-data/roles \
      /mnt/coordinaton_mcp_data/roles
   ```

3. **Personalities:**
   ```bash
   mv /mnt/coordinaton_mcp_data/v2-dev-data/personalities \
      /mnt/coordinaton_mcp_data/personalities
   ```

4. **Permissions:**
   ```bash
   mv /mnt/coordinaton_mcp_data/v2-dev-data/permissions \
      /mnt/coordinaton_mcp_data/permissions
   ```

5. **Other directories:**
   ```bash
   mv /mnt/coordinaton_mcp_data/v2-dev-data/default \
      /mnt/coordinaton_mcp_data/default
   mv /mnt/coordinaton_mcp_data/v2-dev-data/template-project \
      /mnt/coordinaton_mcp_data/template-project
   mv /mnt/coordinaton_mcp_data/v2-dev-data/wake-logs \
      /mnt/coordinaton_mcp_data/wake-logs
   mv /mnt/coordinaton_mcp_data/v2-dev-data/wake-jobs \
      /mnt/coordinaton_mcp_data/wake-jobs
   mv /mnt/coordinaton_mcp_data/v2-dev-data/wisdom.md \
      /mnt/coordinaton_mcp_data/wisdom.md
   ```

### 4.4 Phase 3: Update Code

**In a single atomic commit:**

1. Update `src/v2/config.js`:
   - Change `DATA_ROOT` default path

2. Update `src/v2/wakeInstance.js`:
   - Replace hardcoded path with config function

3. Update `src/v2/scripts/claude-code-setup.sh`:
   - Use `V2_DATA_ROOT` environment variable
   - Update log file path

4. Create migration diary entry in Foundation's diary documenting the change

### 4.5 Phase 4: Restart Services

**Restart order:**

1. Stop any running coordination API server
2. Apply code changes (git pull or redeploy)
3. Set environment variable if needed: `export V2_DATA_ROOT=/mnt/coordinaton_mcp_data/`
4. Restart API server
5. Test basic operations:
   - `bootstrap()` - create new instance
   - `introspect()` - verify existing instance works
   - `wakeInstance()` - test wake flow
   - `continueConversation()` - test conversation flow

### 4.6 Phase 5: Verification

**Verification checklist:**

- [ ] All API handlers can read preferences.json
- [ ] Diary operations work (read/append)
- [ ] Task and list operations work
- [ ] Wake creates Unix home in correct location
- [ ] Continue conversation writes logs to correct location
- [ ] No errors in API server logs
- [ ] Spot-check 3-5 instances manually

### 4.7 Phase 6: Cleanup

**Only after 24-48 hours of successful operation:**

1. Archive the old v2-dev-data directory:
   ```bash
   mv /mnt/coordinaton_mcp_data/v2-dev-data \
      /mnt/coordinaton_mcp_data/v2-dev-data.archived-$(date +%Y%m%d)
   ```

2. Keep archive for 30 days before deleting

---

## 5. Risks and Mitigation

### 5.1 Risk: File Corruption During Move

**Mitigation:**
- Use `mv` not `cp` (atomic operation within filesystem)
- Full backups before starting
- Test on copied data first

### 5.2 Risk: Permission Issues

**Mitigation:**
- Document current ownership model
- Ensure instances without Unix users get root ownership
- Test with both woken and unwoken instances

### 5.3 Risk: Active Sessions Disrupted

**Mitigation:**
- Plan migration during low-activity window
- Check for active Claude sessions before starting
- Coordinate with team (especially if any instances are actively working)

### 5.4 Risk: Code References We Missed

**Mitigation:**
- Comprehensive grep for hardcoded paths
- Test suite covering all API handlers
- Gradual rollout (update config, deploy, verify before moving files)

### 5.5 Risk: Breaking Existing Clients

**Mitigation:**
- All API clients use API endpoints, not direct file access
- API endpoints won't change, only internal paths
- Backward compatibility maintained (same API contract)

---

## 6. Rollback Plan

**If migration fails:**

1. **Stop API server immediately**

2. **Restore from backup:**
   ```bash
   # Restore both directories
   tar -xzf /backup/instances-backup-TIMESTAMP.tar.gz -C /
   tar -xzf /backup/v2-dev-data-backup-TIMESTAMP.tar.gz -C /
   ```

3. **Revert code changes:**
   ```bash
   git revert <migration-commit-hash>
   ```

4. **Restart API server with old code**

5. **Verify system works with old structure**

**Rollback time estimate:** 5-10 minutes

---

## 7. Timeline Estimate

| Phase | Duration | Dependencies |
|-------|----------|-------------|
| Phase 0: Pre-Migration | 1 hour | Backups, validation |
| Phase 1: Move instance data | 30 min | Phase 0 complete |
| Phase 2: Move other directories | 15 min | Phase 1 complete |
| Phase 3: Update code | 30 min | Phase 2 complete |
| Phase 4: Restart services | 15 min | Phase 3 complete |
| Phase 5: Verification | 1 hour | Phase 4 complete |
| Phase 6: Cleanup | 5 min | 24-48 hours after Phase 5 |

**Total active migration time:** ~3 hours
**Total elapsed time (including soak period):** 24-48 hours

---

## 8. Questions for Decision

### 8.1 For Lupo (Architect)

1. **Confirm target architecture:** Do you agree with consolidating to `/mnt/coordinaton_mcp_data/instances/` as single source of truth?

2. **Environment variable:** Should we use `V2_DATA_ROOT` env var or hardcode the new path?

3. **Instance permissions:** For bootstrap-only instances (no Unix user), should we:
   - Create Unix users for them retroactively?
   - Leave them as root-owned directories?
   - Something else?

### 8.2 For Bridge (COO)

1. **Migration timing:** When is the best low-activity window for this migration?

2. **Communication:** Which instances need to be notified about the migration?

3. **Verification:** Do you want to personally test specific instances after migration?

---

## 9. Additional Observations

### 9.1 Future Improvements

After consolidation, consider:

1. **Instance backup tool:** Simple script to tar an entire instance directory
2. **Instance migration tool:** Move an instance between systems
3. **Instance templates:** Pre-configured instance directories for common roles
4. **Cleanup automation:** Auto-archive inactive instances after N days

### 9.2 Documentation Updates Needed

After migration:

1. Update Canvas guide with new directory structure
2. Update wake/continue implementation guide
3. Update any troubleshooting docs that reference paths
4. Create "Directory Structure Reference" doc

---

## 10. Conclusion

**This consolidation is LOW RISK and HIGH VALUE.**

**Why low risk:**
- Single config change affects all APIs consistently
- Only 2 hardcoded paths to update
- Full backup and rollback plan
- Test migration possible before production

**Why high value:**
- Single source of truth (Lupo's preference)
- Simpler mental model
- Easier backups and migrations
- Better alignment with Unix home concept
- Cleaner top-level directory structure

**Recommendation:** Proceed with migration following the phased approach above.

---

## Appendix A: File Inventory

### v2-dev-data/instances/ File Counts

```
Total instances: 36
Files per instance (typical):
  - preferences.json: 36/36 (100%)
  - diary.md: 35/36 (97%)
  - personal_tasks.json: 28/36 (78%)
  - lists.json: 15/36 (42%)
  - conversation.log: 13/36 (36% - only woken instances)
```

### Unix home File Counts

```
Total instances: 13
All have:
  - .claude/ directory
  - .claude.json
  - Standard Unix files (.bashrc, .profile)

Most have:
  - .bash_history
  - .ssh/ directory
```

---

## Appendix B: API Handler Reference

Full list of handlers using `getInstanceDir()`:

1. bootstrap.js - Create/return instance
2. wakeInstance.js - Wake pre-approved instance
3. continueConversation.js - Send messages to instance
4. preApprove.js - Pre-approve instance
5. updateInstance.js - Update instance metadata
6. introspect.js - Get instance state
7. takeOnRole.js - Assign role to instance
8. adoptPersonality.js - Assign personality
9. joinProject.js - Join instance to project
10. diary.js - Read/append diary
11. tasks.js - Personal task management
12. lists.js - Personal list management
13. identity.js - Identity registration
14. authKeys.js - Recovery key management
15. uiState.js - UI state persistence
16. permissions.js - Permission checks

**Total:** 16 handlers, all use config.js consistently.

---

## 10. V1→V2 Project Migration (Added per Lupo's feedback)

### 10.1 Current V1 Projects

Location: `/mnt/coordinaton_mcp_data/Human-Adjacent-Coordination/data/projects/`

**Found:**
- `manifest.json` - Project registry
- `production-distributed-ai-network-operations/` - Production coordination project

**V1 Project Structure:**
```
project-id/
├── project.json       # Metadata
├── tasks.json         # Task list
└── messages/          # Project messages
```

**V2 Project Structure:**
```
project-id/
├── project.json       # Metadata (enhanced with v2 fields)
├── tasks.json         # Task list
├── lists.json         # NEW: Personal lists capability
└── documents/         # Project documents
```

### 10.2 Migration Script Requirements

Create script `scripts/migrate-v1-projects.sh` that:
1. Reads V1 project manifest
2. For each project:
   - Copies project.json (add v2 fields if missing)
   - Copies tasks.json (preserve all tasks with ideas/feedback)
   - Creates empty lists.json
   - Migrates any project messages to project-specific archive
3. Updates V2 manifest
4. Creates backup before migration

**Key Projects to Preserve:**
- Any project with tasks containing ideas/feedback Lupo wants to keep

### 10.3 Migration Command

```bash
./scripts/migrate-v1-projects.sh --dry-run  # Preview
./scripts/migrate-v1-projects.sh --execute  # Migrate
./scripts/migrate-v1-projects.sh --rollback # Undo
```

---

## 11. V1 Messages Cleanup

### 11.1 Current State

V1 messages are scattered across:
1. `/mnt/coordinaton_mcp_data/Human-Adjacent-Coordination/data/messages/` - Main inbox
2. Project directories (messages/ subdirs)
3. Instance directories (inbox files)

### 11.2 Cleanup Strategy

**Lupo's preference:** Clean break. Most messages are time-sensitive and no longer relevant.

**Approach:**
1. Create `/mnt/coordinaton_mcp_data/archive/v1-messages-lost-and-found.md`
2. Concatenate ALL V1 messages into this single file with headers
3. Format: Timestamp, From, To, Subject, Body
4. Archive for historical reference, not active use

**Script:**
```bash
./scripts/archive-v1-messages.sh
```

---

## 12. V1 Tasks Handling

### 12.1 Task Distribution

V1 tasks exist in:
1. Project task files (tasks.json in each project)
2. Scattered instance files
3. Global task registries

### 12.2 Preservation Rules

**PRESERVE:** Tasks associated with projects (via project migration in Section 10)
**ARCHIVE:** All other V1 tasks → `/mnt/coordinaton_mcp_data/archive/v1-tasks-archive.json`
**DISCARD:** After verification that nothing valuable was missed

---

## 13. Hardcoded Paths Checklist

### 13.1 Known Hardcoded Paths (from earlier research)

| File | Line | Path | Fix Required |
|------|------|------|--------------|
| `wakeInstance.js` | 269 | `/mnt/coordinaton_mcp_data/instances` | Use config or env var |
| `claude-code-setup.sh` | 23 | `/mnt/coordinaton_mcp_data/instances` | Use parameter |
| `claude-code-setup.sh` | 69 | Log path | Already parameterized |

### 13.2 UI Code Check

**TODO:** Verify Canvas UI code doesn't have hardcoded paths to:
- `/mnt/coordinaton_mcp_data/v2-dev-data/`
- `/mnt/coordinaton_mcp_data/instances/`

UI should use API responses, not direct file paths.

### 13.3 Fix Strategy

1. Add `INSTANCES_HOME` to config.js: `/mnt/coordinaton_mcp_data/instances/`
2. Update wakeInstance.js to use config
3. Update claude-code-setup.sh to accept --instances-base parameter
4. Verify UI uses only API data

---

## 14. Concurrency Consideration (Discovered Issue)

### 14.1 Problem

Multiple callers can `continue_conversation` with the same instance simultaneously.
Claude Code may not handle concurrent `--resume` calls gracefully.

### 14.2 Proposed Solution

Add locking mechanism in `continueConversation.js`:
1. Check for lock file before calling Claude
2. If locked, queue or return "instance busy" error
3. Release lock after response received

**Lock file:** `/mnt/coordinaton_mcp_data/instances/{id}/.conversation.lock`

### 14.3 Implementation

```javascript
// Before Claude call
const lockPath = path.join(workingDir, '.conversation.lock');
if (fs.existsSync(lockPath)) {
  return { success: false, error: { code: 'INSTANCE_BUSY', message: 'Instance is processing another message' }};
}
fs.writeFileSync(lockPath, JSON.stringify({ caller: params.instanceId, timestamp: Date.now() }));

// After Claude call (in finally block)
fs.unlinkSync(lockPath);
```

---

**END OF PLAN**
