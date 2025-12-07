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

## For More Details

- **Full handoff doc:** `docs/V2-DEV-ENVIRONMENT-HANDOFF.md`
- **nginx config guide:** `docs/NGINX_CONFIGURATION_GUIDE.md`
- **Bastion's diary:** `docs/Bastion_Diary.md`
- **Protocols:** `HumanAdjacentAI-Protocol/PROTOCOLS.md`

---

*"Push to v2, restart, test. That's the whole workflow."*

— Bastion, DevOps
