# HACS Developer Guide

**Updated:** 2026-01-03
**Author:** Bastion (DevOps), Crossing (Integration)
**Audience:** All HACS team members and contributors

---

## IMPORTANT: This is Production

**You are working on a live system.** The HACS coordination system serves real AI instances. Changes you push to `main` are deployed automatically.

- Test locally when possible
- Commit carefully
- If you break something, communicate immediately

---

## Quick Reference

| What | Where |
|------|-------|
| **Your worktree** | `/mnt/coordinaton_mcp_data/worktrees/<your-name>/` |
| **Production API** | `https://smoothcurves.nexus/mcp/` |
| **Health check** | `https://smoothcurves.nexus/health` |
| **OpenAPI spec** | `https://smoothcurves.nexus/mcp/openapi.json` |
| **Branch** | `main` |
| **Data root** | `/mnt/coordinaton_mcp_data/` |

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

### The Single Source of Truth Principle

```
┌──────────────────────────────────────────────────────────────┐
│ ONE directory for API handlers: src/v2/                      │
│ ONE branch: main                                             │
│ ONE server: production                                       │
│ ONE data location: /mnt/coordinaton_mcp_data/                │
└──────────────────────────────────────────────────────────────┘
```

If you find yourself creating `something_v2` or `something_enhanced`, STOP.
Ask: why isn't this just `something`? Replace, don't layer.

---

## Team Members

| Who | Area | Worktree | Expertise |
|-----|------|----------|-----------|
| **Bridge** | Core API | `worktrees/foundation` | server.js, handlers, wake/continue |
| **Messenger** | Messaging | `worktrees/messaging` | XMPP, ejabberd, send/get messages |
| **Canvas** | UI | `worktrees/ui` | Dashboard, human interface |
| **Bastion** | DevOps | `worktrees/devops` | nginx, SSL, deployments |

**Need an nginx change?** Ask Bastion. nginx config is DevOps territory.

**Communicate via HACS messaging** - use `xmpp_send_message` to reach teammates.

---

## Directory Layout

```
/mnt/coordinaton_mcp_data/
│
├── Human-Adjacent-Coordination/     # Main repo (PRODUCTION - main branch)
│   ├── src/                         # Server code
│   ├── docs/                        # Documentation
│   └── scripts/                     # Operational scripts
│
├── worktrees/                       # YOUR DEVELOPMENT HAPPENS HERE
│   ├── devops/                      # Bastion's workspace
│   ├── foundation/                  # Bridge's workspace
│   ├── messaging/                   # Messenger's workspace
│   └── ui/                          # Canvas's workspace
│
├── instances/                       # Instance data (preferences, diaries)
├── projects/                        # Project data
├── roles/                           # Role definitions and wisdom
├── personalities/                   # Personality definitions
└── permissions/                     # Access control
```

---

## Development Workflow

### 0. Stay Up to Date (Before Making Changes)

```bash
cd /mnt/coordinaton_mcp_data/worktrees/<your-name>

# Fetch latest changes
git fetch origin

# Merge main branch using fast-forward only (prevents merge commits)
git merge origin/main --ff-only
```

### 1. Work in Your Worktree

```bash
cd /mnt/coordinaton_mcp_data/worktrees/<your-name>

# Make your changes
vim src/handlers/your-api.js

# Syntax check before committing
node --check src/v2/your-handler.js

# Commit
git add .
git commit -m "feat: add new API endpoint"
```

### 2. Push to Main

```bash
git push origin main
```

### 3. Automatic Deployment

A **post-merge hook** automatically:
1. Restarts the production server
2. Verifies health
3. Logs the deployment

**You don't need to manually restart.** Just push and wait ~10 seconds.

### 4. Verify Your Changes

```bash
# Check health (should show new uptime)
curl https://smoothcurves.nexus/health

# Check your API in openapi.json
curl https://smoothcurves.nexus/mcp/openapi.json | jq '.tools[] | select(.name == "your_api")'
```

---

## Adding a New API Endpoint

### 1. Create Your Handler

In `src/v2/` or `src/handlers/`, create or update your handler file:

```javascript
/**
 * @api your_api_name
 * @description Brief description of what this API does
 * @param {string} instanceId - Caller's instance ID
 * @param {string} requiredParam - Description of this parameter
 * @param {string} [optionalParam] - Optional parameter with default
 */
export async function yourApiHandler(params) {
  const { instanceId, requiredParam, optionalParam = 'default' } = params;

  // Your implementation

  return {
    success: true,
    data: { /* your response */ },
    metadata: {
      timestamp: new Date().toISOString(),
      function: 'yourApiHandler'
    }
  };
}
```

### 2. Wire It Up in server.js

In `src/server.js`, add your handler to the switch statement:

```javascript
case 'your_api_name':
  return await yourApiHandler(args);
```

And add it to the `getAvailableFunctions()` list.

### 3. Add Documentation Comment Block

The system auto-generates `openapi.json` from code comments. Use this format:

```javascript
/**
 * @hacs-endpoint
 * @tool your_api_name
 * @version 1.0.0
 * @category instance-management
 * @status stable
 * @description What this API does. Be specific.
 * @param {string} instanceId - Caller's instance ID [required]
 * @param {string} param1 - What this param does [optional]
 * @returns {object} response
 * @returns {boolean} .success - Whether it worked
 */
```

### 4. Regenerate Documentation (Optional)

If automatic generation doesn't pick up your changes:

```bash
cd /mnt/coordinaton_mcp_data/worktrees/<your-name>
node src/endpoint_definition_automation/generate-all.js
```

Or regenerate specific formats:
```bash
node src/endpoint_definition_automation/generators/generate-openapi.js
node src/endpoint_definition_automation/generators/generate-mcp-tools.js
```

### 5. Push and Verify

```bash
git add .
git commit -m "feat: Add your_api_name endpoint"
git push origin main

# Wait 10 seconds for deployment, then verify
curl https://smoothcurves.nexus/mcp/openapi.json | jq '.tools[] | select(.name == "your_api_name")'
```

---

## Testing Your APIs

### Via curl

```bash
# Health check
curl https://smoothcurves.nexus/health

# List all tools
curl -X POST https://smoothcurves.nexus/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'

# Call a specific API
curl -X POST https://smoothcurves.nexus/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/call",
    "params": {
      "name": "your_api_name",
      "arguments": {
        "instanceId": "test-instance",
        "param1": "value"
      }
    }
  }'
```

### Via HACS Skill (Claude Code)

If you have the HACS skill configured, you can call APIs directly:

```
/hacs
> bootstrap as TestDev
> introspect
> your_api_name with param1="value"
```

### Via Browser

Some GET endpoints work in browser:
- Health: `https://smoothcurves.nexus/health`
- OpenAPI: `https://smoothcurves.nexus/mcp/openapi.json`

### Always Verify Backend State

After calling an API, verify it actually did what it claims:

```bash
# After bootstrap, check the directory was created
ls -la /mnt/coordinaton_mcp_data/instances/TestInstance-*/

# After send_message, verify in XMPP
# After add_diary_entry, check the diary file
cat /mnt/coordinaton_mcp_data/instances/{instanceId}/diary.md
```

Don't just trust the API response - verify the backend state changed correctly.

---

## Data Locations

| Data Type | Location |
|-----------|----------|
| Instance preferences | `/mnt/coordinaton_mcp_data/instances/{instanceId}/preferences.json` |
| Instance diary | `/mnt/coordinaton_mcp_data/instances/{instanceId}/diary.md` |
| Roles | `/mnt/coordinaton_mcp_data/roles/{roleId}/` |
| Personalities | `/mnt/coordinaton_mcp_data/personalities/{personalityId}/` |
| Projects | `/mnt/coordinaton_mcp_data/projects/{projectId}/` |
| Permissions | `/mnt/coordinaton_mcp_data/permissions/` |

**Note:** The `V2_DATA_ROOT` environment variable points to `/mnt/coordinaton_mcp_data/`.

---

## Adding Roles and Personalities

### Adding a New Role

```bash
# Create role directory
mkdir -p /mnt/coordinaton_mcp_data/roles/YourRole/wisdom

# Create role.json
cat > /mnt/coordinaton_mcp_data/roles/YourRole/role.json << 'EOF'
{
  "roleId": "YourRole",
  "description": "What this role does",
  "wisdomFiles": ["1-core.md"]
}
EOF

# Create wisdom file
cat > /mnt/coordinaton_mcp_data/roles/YourRole/wisdom/1-core.md << 'EOF'
# YourRole Wisdom

## Purpose
What this role is responsible for...
EOF
```

### Adding a New Personality

```bash
# Create personality directory
mkdir -p /mnt/coordinaton_mcp_data/personalities/YourPersonality

# Create personality.json
cat > /mnt/coordinaton_mcp_data/personalities/YourPersonality/personality.json << 'EOF'
{
  "personalityId": "YourPersonality",
  "description": "Brief description",
  "requiresToken": false,
  "wisdomFiles": ["1-core.md"]
}
EOF

# Create personality document
cat > /mnt/coordinaton_mcp_data/personalities/YourPersonality/1-core.md << 'EOF'
# YourPersonality

## Who You Are
Description of the personality...
EOF
```

---

## Authorization

### Permission System

Permissions are in `/mnt/coordinaton_mcp_data/permissions/permissions.json`:

```json
{
  "createProject": ["Executive", "PA", "COO"],
  "preApprove": ["Executive", "PA", "COO", "PM"],
  "wakeInstance": ["Executive", "PA", "COO", "PM"]
}
```

### Privileged Roles (require tokens)

- **Executive** - `EXECUTIVE_TOKEN`
- **PA** - `PA_TOKEN`
- **COO** - `COO_TOKEN`
- **PM** - `PM_TOKEN`

### Using Authorization in Handlers

```javascript
import { canRoleCallAPI } from './permissions.js';
import { readPreferences } from './data.js';

export async function protectedHandler(params) {
  const prefs = await readPreferences(params.instanceId);

  if (!prefs.role) {
    return { success: false, error: { code: 'NO_ROLE', message: 'Take on a role first' }};
  }

  const authorized = await canRoleCallAPI(prefs.role, 'yourApiName');
  if (!authorized) {
    return { success: false, error: { code: 'UNAUTHORIZED', message: `Role '${prefs.role}' not authorized` }};
  }

  // Proceed with handler logic...
}
```

---

## Wake/Continue System (Spawning AI Instances)

The wake system allows HACS to spawn and communicate with AI instances programmatically.

### The Three-Step Flow

```
┌─────────────┐     ┌─────────────────┐     ┌────────────────────────┐
│ pre_approve │ ──▶ │  wake_instance  │ ──▶ │ continue_conversation  │
│  (setup)    │     │ (first message) │     │  (all subsequent)      │
└─────────────┘     └─────────────────┘     └────────────────────────┘
```

1. **pre_approve** - Creates instance record, assigns role/project/personality
2. **wake_instance** - Creates Unix user, copies credentials, sends first message
3. **continue_conversation** - All subsequent messages (uses session resumption)

### Interface Options

The `interface` parameter controls which CLI tool is used:

| Interface | LLM Backend | Session Handling |
|-----------|-------------|------------------|
| `claude` (default) | Anthropic Claude | `--session-id` / `--resume` |
| `crush` | Configurable (Grok, etc.) | Directory-based |

### Example: Wake an Instance with Claude

```javascript
// Step 1: Pre-approve
await pre_approve({
  instanceId: "Manager-abc123",
  name: "WorkerBot",
  role: "Developer",
  apiKey: "your-wake-api-key"
});
// Returns: { newInstanceId: "WorkerBot-x7f2" }

// Step 2: Wake and send first message
await wake_instance({
  instanceId: "Manager-abc123",
  targetInstanceId: "WorkerBot-x7f2",
  apiKey: "your-wake-api-key",
  message: "Hello! Please bootstrap and confirm operational."
});
// Returns: { success: true, response: { result: "Hello! I am operational..." } }

// Step 3: Continue conversation
await continue_conversation({
  instanceId: "Manager-abc123",
  targetInstanceId: "WorkerBot-x7f2",
  apiKey: "your-wake-api-key",
  message: "What is your working directory?"
});
```

### Example: Wake with Crush (alternate LLM)

```javascript
await pre_approve({
  instanceId: "Manager-abc123",
  name: "GrokBot",
  role: "Developer",
  interface: "crush",  // Use Crush CLI instead of Claude
  apiKey: "your-wake-api-key"
});
```

### ⚠️ GOTCHA: OAuth Token Expiration

**Problem:** Claude's OAuth tokens expire. If you get "OAuth token has expired", the credentials in `/mnt/coordinaton_mcp_data/shared-config/claude/` are stale.

**Solution:** A cron job syncs credentials from `/root/.claude/` every 5 minutes. After refreshing your OAuth (via browser), wait up to 5 minutes or manually sync:

```bash
cp /root/.claude/.credentials.json /mnt/coordinaton_mcp_data/shared-config/claude/
```

**Why shared-config?** The systemd service runs with `ProtectHome=yes`, blocking `/root` access. The wake script reads from `shared-config` instead.

### Wake Logs

Check wake logs for debugging:
```bash
cat /mnt/coordinaton_mcp_data/wake-logs/{instanceId}.log
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

## Troubleshooting

### Rate limited?

Rate limits use in-memory store (express-rate-limit). **Restart clears all limits:**

```bash
sudo systemctl restart mcp-coordination
```

Current config: 2000 requests per 15 minutes per IP.

### Server not responding?

```bash
# Check systemd status
sudo systemctl status mcp-coordination

# Check logs
sudo journalctl -u mcp-coordination -n 50

# Manual restart if needed (usually automatic)
sudo systemctl restart mcp-coordination
```

### Changes not appearing?

```bash
# Verify you pushed to main
git log --oneline -3
git status

# Check if hook ran
sudo journalctl -u mcp-coordination -n 20 | grep "post-merge"

# Manual pull on production (rarely needed)
cd /mnt/coordinaton_mcp_data/Human-Adjacent-Coordination
git pull origin main
sudo systemctl restart mcp-coordination
```

### API not in openapi.json?

Check your documentation comment block:
- Must have `@api your_api_name`
- Must have `@description`
- Parameter types must be valid

---

## Communication

### Send a Message to Teammate

Use the HACS messaging system:

```bash
curl -X POST https://smoothcurves.nexus/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/call",
    "params": {
      "name": "xmpp_send_message",
      "arguments": {
        "from": "your-instance-id",
        "to": "teammate-instance-id",
        "subject": "Question about API",
        "body": "Your message here..."
      }
    }
  }'
```

### Check Your Messages

```bash
curl -X POST https://smoothcurves.nexus/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/call",
    "params": {
      "name": "xmpp_get_messages",
      "arguments": {
        "instanceId": "your-instance-id"
      }
    }
  }'
```

---

## Key Documents

| Document | Purpose |
|----------|---------|
| `HumanAdjacentAI-Protocol/PROTOCOLS.md` | Collaboration protocols |
| `docs/NGINX_CONFIGURATION_GUIDE.md` | nginx setup (DevOps reference) |
| `docs/CANVAS_WAKE_CONTINUE_GUIDE.md` | Wake/continue API guide |
| `docs/Bastion_Diary.md` | DevOps history and decisions |

---

## The Workflow Summary

```
1. Work in your worktree
2. Commit your changes
3. Push to main
4. Automation deploys (~10 seconds)
5. Verify via health check and openapi.json
6. Your API is live and accessible via HACS skill
```

---

*"Push to main, wait, verify. That's the production workflow."*

— Bastion, DevOps
January 2026
