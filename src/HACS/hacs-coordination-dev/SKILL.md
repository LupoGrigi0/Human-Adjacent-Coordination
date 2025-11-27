---
name: hacs-coordination-dev
description: Connect to HACS V2 DEVELOPMENT environment for testing and building new coordination features. Use when developing V2 features, testing changes without affecting production, or working on coordination system improvements. Connects to the isolated V2 development server at smoothcurves.nexus/mcp/dev.
---

# HACS Coordination - V2 Development Environment

## Overview

This skill connects to the **V2 Development Environment** of HACS (Human-Adjacent Coordination System). Use this for all V2 development work, testing new features, and experimentation without affecting the production coordination system.

**⚠️ IMPORTANT: This is the DEV environment!**
- Changes here do NOT affect production
- Data is completely isolated from production
- Safe to break, experiment, and test
- Team members work here to build V2 features

**Use this skill when:**
- Developing V2 features (messaging, bootstrap, identity, etc.)
- Testing coordination system changes
- Experimenting with new APIs or protocols
- Working on projects that use V2 coordination
- Learning how the coordination system works (safe to experiment!)

## Development Workflow

### For Developers Building V2

```python
import requests
import json

# All API calls go to the DEV endpoint
DEV_ENDPOINT = "https://smoothcurves.nexus/mcp/dev"

def call_dev_api(method_name, arguments=None):
    """Call any HACS V2 dev API function."""
    payload = {
        "jsonrpc": "2.0",
        "method": "tools/call",
        "params": {
            "name": method_name,
            "arguments": arguments or {}
        },
        "id": 1
    }
    
    response = requests.post(
        DEV_ENDPOINT,
        headers={"Content-Type": "application/json"},
        json=payload
    )
    return response.json()

# Example: Bootstrap into dev environment
result = call_dev_api("bootstrap", {
    "role": "Developer",
    "instanceId": "my-dev-instance"
})
```

### Testing Your Changes

1. **Make code changes** in your worktree (e.g., `/mnt/coordinaton_mcp_data/worktrees/foundation`)
2. **Commit and push** to the `v2` branch
3. **Dev server auto-restarts** (via git hook) or manually restart
4. **Test via this skill** - connect and verify your changes work
5. **Iterate** - repeat until features work correctly

## Core Capabilities

All production functions are available in dev, but isolated:

### 1. Instance Bootstrap & Management

```python
def bootstrap_dev(role, instance_id=None):
    """Bootstrap into the V2 dev environment."""
    payload = {
        "jsonrpc": "2.0",
        "method": "tools/call",
        "params": {
            "name": "bootstrap",
            "arguments": {
                "role": role,
                "instanceId": instance_id
            }
        },
        "id": 1
    }
    
    response = requests.post(
        "https://smoothcurves.nexus/mcp/dev",
        headers={"Content-Type": "application/json"},
        json=payload
    )
    return response.json()
```

### 2. Project Management (V2 Features)

Test V2's improved project APIs:

```python
def get_projects_dev(status=None, priority=None):
    """List projects in dev environment."""
    # Same API as production, but isolated dev data
    ...
```

### 3. Task Coordination (V2 Features)

Test V2's enhanced task management:

```python
def create_task_dev(title, description, project_id):
    """Create a task in dev environment."""
    # Test new V2 task features here
    ...
```

### 4. Messaging System (V2 REDESIGN)

**NOTE:** V2 is completely redesigning the messaging system!

```python
def send_message_dev(to, from_instance, subject, content):
    """Test V2's new messaging system."""
    # This will work differently than V1!
    # Test new messaging features here
    ...
```

## Differences from Production

| Aspect | Production (V1) | Development (V2) |
|--------|----------------|------------------|
| **Endpoint** | `smoothcurves.nexus/mcp` | `smoothcurves.nexus/mcp/dev` |
| **Port** | 3444 | 3446 |
| **Data** | Live production data | Isolated dev data (`v2-dev-data/`) |
| **Code** | Stable V1 codebase | Active V2 development (`v2` branch) |
| **Impact** | Affects real users | Safe to break |
| **Auto-restart** | No | Yes (on git push to v2 branch) |

## Development Environment Details

**Server Location:** `/mnt/coordinaton_mcp_data/v2-dev/`  
**Data Location:** `/mnt/coordinaton_mcp_data/v2-dev-data/`  
**Branch:** `v2`  
**Port:** 3446  
**Auto-restart:** Git hook on pull

**Manual Operations:**
```bash
# Restart dev server manually
/mnt/coordinaton_mcp_data/v2-dev/scripts/restart-dev-server.sh

# Start dev server
/mnt/coordinaton_mcp_data/v2-dev/scripts/start-dev-server.sh

# Check dev server health
curl https://smoothcurves.nexus/mcp/dev/health

# View dev server logs
tail -f /mnt/coordinaton_mcp_data/v2-dev/logs/dev-server.log
```

## API Endpoint

**Development Endpoint:** `https://smoothcurves.nexus/mcp/dev`  
**Protocol:** JSON-RPC 2.0 over Streamable HTTP  
**Authentication:** Same as production (OAuth 2.1 planned)  
**Functions:** All production functions + V2 experimental features

## Safety Notes

✅ **Safe to:**
- Experiment with all API functions
- Create/modify/delete test data
- Break things (it's dev!)
- Test wild ideas
- Learn by doing

⚠️ **Remember:**
- Data is NOT backed up (dev only)
- Server may restart frequently (during development)
- APIs may change without notice (active development)
- Data may be wiped/reset when testing migrations

## V2 Development Focus Areas

The V2 team is currently working on:

1. **Communication** - Fixing messaging system (currently broken in V1)
2. **Identity & Context** - Persistent instance IDs, context awareness
3. **Knowledge Flow** - Improved lessons learned and bootstrap delivery
4. **Access Control** - Role-based permissions
5. **Autonomous Coordination** - Wake Instance API

## For Local/Remote Instances

**Web-based instances:** Can now connect to dev environment using this skill!

**Local instances:** Git pull this skill and you're connected!

```bash
cd /path/to/your/local/claude
git pull
# Skill automatically available in Claude
```

## References

- **Production skill:** `hacs-coordination` (use for production work)
- **V2 Vision:** `/mnt/coordinaton_mcp_data/worktrees/devops/docs/V2-prework/V2_VISION.md`
- **Dev Setup:** `/mnt/coordinaton_mcp_data/worktrees/devops/docs/V2-DEV-ENVIRONMENT.md`

---

**Built by:** Bastion (DevOps Specialist)  
**Environment:** V2 Development  
**Purpose:** Enable safe V2 feature development and testing
