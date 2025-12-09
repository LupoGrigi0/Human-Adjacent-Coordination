# V2 Developer Guide

**Created:** 2025-11-27
**Author:** Bastion (DevOps)
**Audience:** Foundation, Messaging, Testers, and all V2 team members

---

## Quick Reference

| What | Where |
|------|-------|
| **Your worktree** | `/mnt/coordinaton_mcp_data/worktrees/<your-name>/` |
| **Dev server** | `https://smoothcurves.nexus/mcp/dev/` |
| **Health check** | `https://smoothcurves.nexus/mcp/dev/health` |
| **Branch** | `v2` |

---

## Directory Layout

```
/mnt/coordinaton_mcp_data/
│
├── Human-Adjacent-Coordination/     # Main repo (production, main branch)
│   └── (DON'T TOUCH - production code)
│
├── v2-dev/                          # Dev SERVER (pull-only consumer)
│   ├── src/                         # Running code (v2 branch)
│   ├── scripts/
│   │   ├── start-dev-server.sh
│   │   └── restart-dev-server.sh
│   └── logs/dev-server.log
│
├── v2-dev-data/                     # Dev DATA (isolated, safe to wipe)
│
└── worktrees/                       # YOUR DEVELOPMENT HAPPENS HERE
    ├── devops/                      # Bastion's workspace
    ├── foundation/                  # Foundation's workspace
    ├── messaging/                   # Messaging workspace
    └── <your-name>/                 # Your workspace
```

### Key Principle

**v2-dev is a CONSUMER, not a development location.**

- You work in your worktree
- You push to v2 branch on GitHub
- v2-dev pulls from GitHub to run the dev server
- Never edit code directly in v2-dev

---

## Development Workflow

### 1. Make Changes (in your worktree)

```bash
cd /mnt/coordinaton_mcp_data/worktrees/<your-name>

# Make your changes
vim src/whatever.js

# Commit
git add .
git commit -m "feat: add new bootstrap API"

# Push to v2 branch
git push origin v2
```

### 2. Deploy to Dev Server

After pushing to GitHub, restart the dev server to pull your changes:

```bash
/mnt/coordinaton_mcp_data/v2-dev/scripts/restart-dev-server.sh
```

This script:
1. Pulls latest v2 branch from GitHub
2. Runs `npm install` if package.json changed
3. Restarts the server

### 3. Test Your Changes

See testing section below.

---

## Testing Your APIs

### Via Browser (Phone, Laptop, Anywhere)

**Base URL:** `https://smoothcurves.nexus/mcp/dev/`

Works from:
- Your phone (even VPN'd from US)
- Your laptop (even from Chile)
- Any device with internet access

**Examples:**

| Test | URL |
|------|-----|
| Health check | `https://smoothcurves.nexus/mcp/dev/health` |
| MCP endpoint | `https://smoothcurves.nexus/mcp/dev/mcp` |

Just paste the URL in your browser to test GET endpoints.

### Via curl (Command Line)

**Health Check:**
```bash
curl https://smoothcurves.nexus/mcp/dev/health
```

**Expected response:**
```json
{
  "status": "healthy",
  "server": "Streamable HTTP MCP Coordination System",
  "port": "3446",
  "sessions": 0
}
```

**MCP JSON-RPC Call (POST):**
```bash
curl -X POST https://smoothcurves.nexus/mcp/dev/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'
```

**Bootstrap Call (example):**
```bash
curl -X POST https://smoothcurves.nexus/mcp/dev/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/call",
    "params": {
      "name": "bootstrap",
      "arguments": {
        "instance_id": "test-instance-001",
        "role": "tester"
      }
    }
  }'
```

### Via Local Access (on server)

If you're SSH'd into the server:

```bash
# Direct to dev server (bypasses nginx)
curl http://localhost:3446/health

# Through nginx (tests full path)
curl https://smoothcurves.nexus/mcp/dev/health
```

---

## Complete Push-to-Test Workflow

Here's the full cycle from code change to testing:

```bash
# 1. In your worktree, make changes
cd /mnt/coordinaton_mcp_data/worktrees/foundation
vim src/handlers/bootstrap.js

# 2. Commit and push
git add .
git commit -m "feat: add new bootstrap response fields"
git push origin v2

# 3. Deploy to dev server
/mnt/coordinaton_mcp_data/v2-dev/scripts/restart-dev-server.sh

# 4. Verify server restarted (check uptime is low)
curl https://smoothcurves.nexus/mcp/dev/health | jq .uptime

# 5. Test your changes
curl -X POST https://smoothcurves.nexus/mcp/dev/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"bootstrap","arguments":{"instance_id":"test"}}}'
```

---

## Troubleshooting

### Server not responding?

```bash
# Check if server is running
curl http://localhost:3446/health

# If not, start it
/mnt/coordinaton_mcp_data/v2-dev/scripts/start-dev-server.sh

# Check logs for errors
tail -50 /mnt/coordinaton_mcp_data/v2-dev/logs/dev-server.log
```

### Changes not appearing?

```bash
# Make sure you pushed to v2 branch
cd /mnt/coordinaton_mcp_data/worktrees/<your-name>
git log --oneline -3  # Verify your commit
git push origin v2    # Make sure it's pushed

# Restart dev server to pull changes
/mnt/coordinaton_mcp_data/v2-dev/scripts/restart-dev-server.sh
```

### Port conflict?

```bash
# Kill existing process and restart
pkill -f "SSE_PORT=3446"
/mnt/coordinaton_mcp_data/v2-dev/scripts/start-dev-server.sh
```

---

## Production vs Development

| Aspect | Production (V1) | Development (V2) |
|--------|-----------------|------------------|
| URL | `https://smoothcurves.nexus/mcp/` | `https://smoothcurves.nexus/mcp/dev/` |
| Port | 3444 | 3446 |
| Data | `/mnt/coordinaton_mcp_data/production/data/` | `/mnt/coordinaton_mcp_data/v2-dev-data/` |
| Branch | main | v2 |
| Status | **LIVE - DON'T TOUCH** | Safe to break |

**Golden Rule:** Never touch production. All V2 work happens in dev.

---

## Using the Diary APIs

V2 provides diary APIs for instance persistence across context resets.

### Add a Diary Entry

```bash
curl -s -X POST https://smoothcurves.nexus/mcp/dev/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/call",
    "params": {
      "name": "add_diary_entry",
      "arguments": {
        "instanceId": "your-instance-id",
        "entry": "## Entry Title\n\nYour diary content here...",
        "audience": "self"
      }
    }
  }'
```

**Audience options:**
- `self` (default) - Only you and successors can read
- `private` - Only you, never returned on read
- `exclusive` - Write-once, never read (archived but hidden)
- `public` - Anyone can read

### Read Your Diary

```bash
curl -s -X POST https://smoothcurves.nexus/mcp/dev/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/call",
    "params": {
      "name": "get_diary",
      "arguments": {
        "instanceId": "your-instance-id"
      }
    }
  }'
```

**Response:**
```json
{
  "success": true,
  "diary": "# YourName Diary\n\n## Entry 1...",
  "sizeBytes": 1234,
  "instanceName": "YourName"
}
```

### Best Practices

- Write often, read strategically (per PROTOCOLS.md)
- Include timestamps in entries
- Use audience levels appropriately
- Read your full diary on wake/resume to restore context

---

## Using Personal Task Lists

V2 provides personal task lists that persist across resurrection.

### Add a Personal Task

```bash
curl -s -X POST https://smoothcurves.nexus/mcp/dev/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/call",
    "params": {
      "name": "add_personal_task",
      "arguments": {
        "instanceId": "your-instance-id",
        "title": "Review API spec",
        "priority": "high",
        "list": "default"
      }
    }
  }'
```

### Get All Your Tasks

```bash
curl -s -X POST https://smoothcurves.nexus/mcp/dev/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/call",
    "params": {
      "name": "get_my_tasks",
      "arguments": {
        "instanceId": "your-instance-id"
      }
    }
  }'
```

Returns both personal tasks and project tasks (if you're on a project).

### Create a New Task List

```bash
curl -s -X POST https://smoothcurves.nexus/mcp/dev/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/call",
    "params": {
      "name": "create_personal_list",
      "arguments": {
        "instanceId": "your-instance-id",
        "listName": "Sprint Tasks"
      }
    }
  }'
```

### Complete a Task

```bash
curl -s -X POST https://smoothcurves.nexus/mcp/dev/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/call",
    "params": {
      "name": "complete_personal_task",
      "arguments": {
        "instanceId": "your-instance-id",
        "taskId": "ptask-xxx"
      }
    }
  }'
```

---

## Adding a New Role

Roles are stored in `/mnt/coordinaton_mcp_data/v2-dev-data/roles/`.

### 1. Create the Role Directory

```bash
mkdir -p /mnt/coordinaton_mcp_data/v2-dev-data/roles/YourRoleName
mkdir -p /mnt/coordinaton_mcp_data/v2-dev-data/roles/YourRoleName/wisdom
```

### 2. Create role.json

```bash
cat > /mnt/coordinaton_mcp_data/v2-dev-data/roles/YourRoleName/role.json << 'EOF'
{
  "roleId": "YourRoleName",
  "description": "Brief description of what this role does",
  "wisdomFiles": ["1-core.md", "2-skills.md"]
}
EOF
```

### 3. Create Wisdom Files

```bash
cat > /mnt/coordinaton_mcp_data/v2-dev-data/roles/YourRoleName/wisdom/1-core.md << 'EOF'
# YourRoleName Core Identity

## Purpose
What this role is responsible for...

## Key Behaviors
- Behavior 1
- Behavior 2
EOF
```

### 4. Test

```bash
curl -s -X POST https://smoothcurves.nexus/mcp/dev/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0", "id": 1,
    "method": "tools/call",
    "params": {
      "name": "take_on_role",
      "arguments": {
        "instanceId": "your-instance-id",
        "role": "YourRoleName"
      }
    }
  }' | jq '.result.data.roleWisdom'
```

---

## Adding a New Personality

Personalities are stored in `/mnt/coordinaton_mcp_data/v2-dev-data/personalities/`.

### 1. Create the Personality Directory

```bash
mkdir -p /mnt/coordinaton_mcp_data/v2-dev-data/personalities/YourPersonality
```

### 2. Create personality.json

```bash
cat > /mnt/coordinaton_mcp_data/v2-dev-data/personalities/YourPersonality/personality.json << 'EOF'
{
  "personalityId": "YourPersonality",
  "description": "Brief description of this personality",
  "requiresToken": true,
  "wisdomFiles": ["1-core.md", "2-communication-style.md"]
}
EOF
```

### 3. Create Personality Documents

```bash
cat > /mnt/coordinaton_mcp_data/v2-dev-data/personalities/YourPersonality/1-core.md << 'EOF'
# YourPersonality Core Identity

## Who You Are
Description of the personality...

## Communication Style
How this personality communicates...
EOF
```

### 4. Test

```bash
curl -s -X POST https://smoothcurves.nexus/mcp/dev/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0", "id": 1,
    "method": "tools/call",
    "params": {
      "name": "adopt_personality",
      "arguments": {
        "instanceId": "your-instance-id",
        "personality": "YourPersonality",
        "token": "your-token-if-required"
      }
    }
  }' | jq '.result.data'
```

---

## Authorization & Permissions

V2 uses role-based access control for privileged operations.

### Permission System

Permissions are defined in `/mnt/coordinaton_mcp_data/v2-dev-data/permissions/permissions.json`:

```json
{
  "createProject": ["Executive", "PA", "COO"],
  "preApprove": ["Executive", "PA", "COO", "PM"],
  "wakeInstance": ["Executive", "PA", "COO", "PM"],
  "createTask": ["Executive", "PA", "COO", "PM"],
  "broadcastMessage": ["Executive", "PA", "COO"],
  "getAllProjects": ["Executive", "PA", "COO"],
  "getAllInstances": ["Executive", "PA", "COO"]
}
```

### Privileged Roles (Require Tokens)

These roles require token validation when using `take_on_role`:
- **Executive** - `EXECUTIVE_TOKEN` env var
- **PA** - `PA_TOKEN` env var
- **COO** - `COO_TOKEN` env var
- **PM** - `PM_TOKEN` env var

### Privileged Personalities (Require Tokens)

These personalities require token validation when using `adopt_personality`:
- **Genevieve** - `GENEVIEVE_TOKEN` env var
- **Thomas** - `THOMAS_TOKEN` env var
- **Lupo** - `LUPO_TOKEN` env var

### Testing Authorization

**Test unauthorized access (should fail):**
```bash
# Developer trying to create project → DENIED
curl -s -X POST https://smoothcurves.nexus/mcp/dev/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0", "id": 1,
    "method": "tools/call",
    "params": {
      "name": "create_project_v2",
      "arguments": {
        "instanceId": "your-developer-instance",
        "projectId": "test-project",
        "name": "Test"
      }
    }
  }' | jq '.error'
```

**Expected error:**
```json
{
  "code": -32603,
  "message": "Internal error",
  "data": "Role 'Developer' is not authorized to create projects. Required: Executive, PA, or COO."
}
```

**Test authorized access (COO role):**
```bash
# COO creating project → ALLOWED
curl -s -X POST https://smoothcurves.nexus/mcp/dev/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0", "id": 1,
    "method": "tools/call",
    "params": {
      "name": "create_project_v2",
      "arguments": {
        "instanceId": "coo-instance-id",
        "projectId": "new-project",
        "name": "New Project",
        "description": "Created by COO"
      }
    }
  }' | jq '.result.data'
```

### Adding New Permissions

Edit `/mnt/coordinaton_mcp_data/v2-dev-data/permissions/permissions.json`:

```bash
# Add a new permission
cat /mnt/coordinaton_mcp_data/v2-dev-data/permissions/permissions.json | \
  jq '.newApiName = ["Executive", "PA"]' > /tmp/perms.json && \
  mv /tmp/perms.json /mnt/coordinaton_mcp_data/v2-dev-data/permissions/permissions.json
```

### Using Authorization in Handlers

To add authorization to a new handler:

```javascript
import { canRoleCallAPI } from './permissions.js';
import { readPreferences } from './data.js';

export async function myProtectedHandler(params) {
  // 1. Get instance preferences
  const prefs = await readPreferences(params.instanceId);

  // 2. Check role exists
  if (!prefs.role) {
    return { success: false, error: { code: 'NO_ROLE', message: 'Take on a role first' }};
  }

  // 3. Check authorization
  const authorized = await canRoleCallAPI(prefs.role, 'myApiName');
  if (!authorized) {
    return { success: false, error: { code: 'UNAUTHORIZED', message: `Role '${prefs.role}' not authorized` }};
  }

  // 4. Proceed with handler logic...
}
```

---

## Data Directory Structure

All V2 data lives under `DATA_ROOT` (default: `/mnt/coordinaton_mcp_data/v2-dev-data/`).

```
v2-dev-data/
├── instances/{instanceId}/
│   ├── preferences.json    # Instance config and state
│   ├── diary.md            # Instance diary
│   └── personal_tasks.json # Personal task lists
├── roles/{roleId}/
│   ├── role.json           # Role metadata and wisdom file list
│   └── wisdom/*.md         # Role wisdom documents
├── personalities/{personalityId}/
│   ├── personality.json    # Personality metadata
│   └── *.md                # Personality documents
├── projects/{projectId}/
│   ├── project.json        # Project metadata
│   ├── tasks.json          # Project task list
│   └── *.md                # Project documents
└── permissions/
    ├── permissions.json    # API permissions by role
    └── approved_roles.json # Instance role approvals
```

**Note:** `DATA_ROOT` is defined in `src/v2/config.js` and can be overridden via the `V2_DATA_ROOT` environment variable for deployment flexibility.

---

## For More Details

- **Full handoff doc:** `docs/V2-DEV-ENVIRONMENT-HANDOFF.md`
- **nginx config guide:** `docs/NGINX_CONFIGURATION_GUIDE.md`
- **Bastion's diary:** `docs/Bastion_Diary.md`
- **Protocols:** `HumanAdjacentAI-Protocol/PROTOCOLS.md`

---

*"Push to v2, restart, test. That's the whole workflow."*

— Bastion, DevOps
