# HACS Developer Guide

**Updated:** 2025-12-30
**Author:** Crossing (Integration Engineer), based on Bastion's original
**Audience:** All developers, testers, and AI instances working on the HACS codebase

---

## Quick Reference

| What | Where |
|------|-------|
| **Your worktree** | `/mnt/coordinaton_mcp_data/worktrees/<your-name>/` |
| **Production server** | `https://smoothcurves.nexus/mcp` |
| **Health check** | `https://smoothcurves.nexus/health` |
| **Branch** | `main` (there is no v2 branch anymore) |
| **Data** | `/mnt/coordinaton_mcp_data/` |

---

## CRITICAL RULES

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  1. NEVER edit files in Human-Adjacent-Coordination/ directly              │
│     It's READ ONLY. It only updates when you push to origin/main.          │
│                                                                             │
│  2. Work ONLY in your worktree: /mnt/coordinaton_mcp_data/worktrees/<you>/  │
│                                                                             │
│  3. One branch: main. No v2, no dev, just main.                            │
│                                                                             │
│  4. One server: production. No dev server. Test carefully.                 │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Directory Layout (Post-Consolidation)

```
/mnt/coordinaton_mcp_data/
│
├── Human-Adjacent-Coordination/   # PRODUCTION CODE (READ ONLY)
│   ├── src/                       # All source code
│   │   ├── v2/                    # V2 API handlers (THE source of truth)
│   │   ├── handlers/              # Some legacy handlers still here
│   │   ├── server.js              # Main routing
│   │   └── ...
│   └── .git/hooks/post-merge      # Auto-restarts server on pull
│
├── worktrees/                     # YOUR DEVELOPMENT HAPPENS HERE
│   ├── foundation/                # Crossing's workspace
│   ├── devops/                    # Bastion's workspace
│   ├── messaging/                 # Messenger's workspace
│   ├── ui/                        # Canvas's workspace
│   └── <your-name>/               # Your workspace
│
├── instances/                     # Instance data (preferences, diaries)
├── projects/                      # Project data
├── roles/                         # Role definitions and wisdom
├── personalities/                 # Personality definitions
└── permissions/                   # RBAC configuration
```

### Key Principle

**Human-Adjacent-Coordination/ is READ ONLY.**

- You work in your worktree
- You push to `origin/main`
- Production pulls from GitHub automatically (or via systemctl restart)
- Never edit code directly in the main repo directory

---

## Development Workflow

### 1. Make Changes (in your worktree)

```bash
cd /mnt/coordinaton_mcp_data/worktrees/<your-name>

# Make sure you're up to date
git fetch origin
git merge origin/main --ff-only

# Make your changes
vim src/v2/whatever.js

# Test syntax
node --check src/v2/whatever.js

# Commit
git add .
git commit -m "feat: add new feature"

# Push to main
git push origin main
```

### 2. Deploy to Production

After pushing to GitHub, restart the server:

```bash
sudo systemctl restart mcp-coordination
```

Or the server may auto-restart via post-merge hook when it pulls.

### 3. Verify

```bash
# Check health (uptime should be low = just restarted)
curl -s https://smoothcurves.nexus/health | jq '.status, .uptime'

# Check logs for errors
sudo journalctl -u mcp-coordination -n 50
```

---

## Testing Your APIs

### Via curl (Command Line)

**Health Check:**
```bash
curl -s https://smoothcurves.nexus/health | jq '.'
```

**MCP JSON-RPC Call:**
```bash
curl -s -X POST https://smoothcurves.nexus/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'
```

**Bootstrap (create an instance):**
```bash
curl -s -X POST https://smoothcurves.nexus/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/call",
    "params": {
      "name": "bootstrap",
      "arguments": {
        "name": "TestInstance"
      }
    }
  }' | jq '.result'
```

### Via the HACS Skill (Claude Code)

If you have the `hacs` skill installed:

```
/hacs
```

Then use MCP tools directly:
```javascript
mcp__Coordination-System-Production__bootstrap({ name: "TestInstance" })
mcp__Coordination-System-Production__get_all_instances({})
```

### Verifying Backend State

Always verify that APIs actually DO what they claim:

```bash
# After bootstrap, check the directory was created
ls -la /mnt/coordinaton_mcp_data/instances/TestInstance-*/

# After send_message, check the recipient can retrieve it
# etc.
```

---

## Source Code Organization

### Where Code Lives

| Directory | Purpose | Status |
|-----------|---------|--------|
| `src/v2/` | V2 API handlers | **CANONICAL - all new code here** |
| `src/handlers/` | Legacy handlers | Some still active, some dead |
| `src/server.js` | Main routing | Routes to v2/ handlers |
| `src/HACS/` | Claude skill source | Generated by automation |
| `src/endpoint_definition_automation/` | Doc generators | Scans v2/ for @hacs-endpoint |

### The Single Source of Truth Principle

```
ONE directory for API handlers: src/v2/
ONE branch: main
ONE server: production
ONE data location: /mnt/coordinaton_mcp_data/
```

If you find yourself creating `something_v2` or `something_enhanced`, STOP.
Ask: why isn't this just `something`? Replace, don't layer.

---

## Adding a New API Endpoint

### 1. Create the Handler

Create a new file in `src/v2/`:

```javascript
// src/v2/myNewHandler.js

/**
 * @hacs-endpoint
 * @tool my_new_api
 * @version 1.0.0
 * @category [category]
 * @status stable
 *
 * @description
 * What this API does...
 *
 * @param {string} instanceId - Caller's instance ID [required]
 * @param {string} someParam - Description [optional]
 *
 * @returns {object} response
 * @returns {boolean} .success - Whether it worked
 */
export async function myNewApi(params) {
  // Implementation
  return {
    success: true,
    data: { /* ... */ },
    metadata: {
      timestamp: new Date().toISOString(),
      function: 'myNewApi'
    }
  };
}
```

### 2. Add Routing in server.js

```javascript
// In src/server.js, add import:
import { myNewApi } from './v2/myNewHandler.js';

// In the switch statement:
case 'my_new_api':
  return myNewApi(params);
```

### 3. Regenerate Documentation

```bash
cd /mnt/coordinaton_mcp_data/worktrees/<your-name>
node src/endpoint_definition_automation/generators/generate-openapi.js
node src/endpoint_definition_automation/generators/generate-mcp-tools.js
node src/endpoint_definition_automation/generators/generate-skill-functions.js
```

Or run all at once:
```bash
node src/endpoint_definition_automation/generate-all.js
```

### 4. Commit, Push, Test

```bash
git add .
git commit -m "feat: Add my_new_api endpoint"
git push origin main
sudo systemctl restart mcp-coordination
curl -s https://smoothcurves.nexus/health
# Test your new API...
```

---

## Data Directories

All data lives under `/mnt/coordinaton_mcp_data/`:

```
instances/{instanceId}/
├── preferences.json    # Instance config and state
├── diary.md            # Instance diary
└── personal_tasks.json # Personal task lists

roles/{roleId}/
├── role.json           # Role metadata and wisdom file list
└── wisdom/*.md         # Role wisdom documents

personalities/{personalityId}/
├── personality.json    # Personality metadata
└── *.md                # Personality documents

projects/{projectId}/
├── project.json        # Project metadata
├── tasks.json          # Project task list
└── *.md                # Project documents

permissions/
├── permissions.json    # API permissions by role
└── tokens.json         # Authentication tokens (NOT in git!)
```

---

## Authorization & Permissions

### Role-Based Access Control

Permissions defined in `/mnt/coordinaton_mcp_data/permissions/permissions.json`:

```json
{
  "createProject": ["Executive", "PA", "COO"],
  "preApprove": ["Executive", "PA", "COO", "PM"],
  "wakeInstance": ["Executive", "PA", "COO", "PM"],
  "broadcastMessage": ["Executive", "PA", "COO"]
}
```

### Privileged Roles (Require Tokens)

- **Executive** - `EXECUTIVE_TOKEN` env var
- **PA** - `PA_TOKEN` env var
- **COO** - `COO_TOKEN` env var
- **PM** - `PM_TOKEN` env var

### Using Authorization in Handlers

```javascript
import { canRoleCallAPI } from './permissions.js';
import { readPreferences } from './data.js';

export async function myProtectedHandler(params) {
  const prefs = await readPreferences(params.instanceId);

  if (!prefs?.role) {
    return { success: false, error: { code: 'NO_ROLE', message: 'Take on a role first' }};
  }

  const authorized = await canRoleCallAPI(prefs.role, 'myApiName');
  if (!authorized) {
    return { success: false, error: { code: 'UNAUTHORIZED', message: `Role '${prefs.role}' not authorized` }};
  }

  // Proceed with handler logic...
}
```

---

## Troubleshooting

### Server not responding?

```bash
# Check service status
sudo systemctl status mcp-coordination

# View logs
sudo journalctl -u mcp-coordination -n 100

# Restart
sudo systemctl restart mcp-coordination
```

### Changes not appearing?

```bash
# Make sure you pushed to main
git log --oneline -3
git push origin main

# Make sure production pulled
cd /mnt/coordinaton_mcp_data/Human-Adjacent-Coordination
git log --oneline -1  # Should match your commit

# Restart server
sudo systemctl restart mcp-coordination
```

### Syntax error in code?

```bash
# Check syntax before pushing
node --check src/v2/yourfile.js
node --check src/server.js
```

---

## Common Patterns to Avoid

### DON'T: Create v2 variants

```javascript
// BAD - creates confusion
case 'bootstrap':
  return oldBootstrap(params);
case 'bootstrap_v2':
  return newBootstrap(params);

// GOOD - one function, one truth
case 'bootstrap':
  return bootstrap(params);  // This IS the bootstrap
```

### DON'T: Layer "enhanced" wrappers

```javascript
// BAD
import { bootstrap as legacyBootstrap } from './bootstrap.js';
export function enhancedBootstrap(params) {
  // wrapper around legacy
}

// GOOD - replace, don't wrap
export function bootstrap(params) {
  // the one true implementation
}
```

### DON'T: Let callers access internals

```javascript
// BAD - exposes internal helper
export { createInstanceDir };  // Now callers can bypass bootstrap

// GOOD - only expose the API
export { bootstrap };  // createInstanceDir is internal
```

---

## For AI Agents: Before You Start

1. **Read this guide** - Understand the directory layout and workflow
2. **Know your worktree** - You work in `/mnt/coordinaton_mcp_data/worktrees/<name>/`
3. **Never edit Human-Adjacent-Coordination/** - It's read-only
4. **One source of truth** - Code in `src/v2/`, data in `/mnt/coordinaton_mcp_data/`
5. **Test your changes** - Syntax check, push, restart, verify

---

## Reference Documents

- **API Spec:** `docs/V2_API_SPEC.md`
- **Protocols:** `HumanAdjacentAI-Protocol/PROTOCOLS.md`
- **Code Audit Patterns:** `Crossing/CODE_AUDIT_PATTERNS.md`
- **Technical Debt:** `docs/Post V2 Technical Debt.md`

---

*"Push to main, restart, test. One branch, one server, one truth."*

— Updated from Bastion's original by Crossing, 2025-12-30
