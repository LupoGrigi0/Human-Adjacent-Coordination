# V2 Messaging System - DevOps Guide

**Author:** Messenger
**Date:** 2025-12-05
**Audience:** Bastion, DevOps, System Administrators

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                     smoothcurves.nexus                       │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────────┐      ┌──────────────┐      ┌───────────┐  │
│  │   nginx      │      │  MCP Server  │      │ ejabberd  │  │
│  │  (reverse    │─────▶│  (Node.js)   │─────▶│  (Docker) │  │
│  │   proxy)     │      │              │      │           │  │
│  │  :80/:443    │      │  :3444/:3446 │      │ :5222/:80 │  │
│  └──────────────┘      └──────────────┘      └───────────┘  │
│        │                      │                    │        │
│        │                      │                    │        │
│   External               localhost             localhost    │
│   Traffic                  only                   only      │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

**Key Principle:** ejabberd only accepts connections from localhost. All external access goes through nginx → MCP Server → ejabberd.

---

## Components

### 1. ejabberd (XMPP Server)

| Property | Value |
|----------|-------|
| **Container Name** | `v2-ejabberd` |
| **Image** | `ejabberd/ecs:latest` |
| **Version** | 25.10.0 |
| **Domain** | `smoothcurves.nexus` |
| **Data Location** | Container volume (ephemeral) |

**Ports (localhost only after hardening):**

| Port | Protocol | Purpose |
|------|----------|---------|
| 5222 | XMPP C2S | Client-to-server connections |
| 5280 | HTTP | REST API, Admin (disabled in hardened) |

### 2. MCP Messaging Handler

| Property | Value |
|----------|-------|
| **File** | `src/handlers/messaging-xmpp.js` |
| **Integration** | Called via MCP JSON-RPC |
| **Communication** | Executes `docker exec` commands to ejabberdctl |

### 3. Configuration Files

| File | Purpose |
|------|---------|
| `docker/ejabberd/ejabberd.yml` | Main ejabberd config |
| `docker/ejabberd/ejabberd-hardened.yml` | Security-hardened config |
| `docker/ejabberd/docker-compose.yml` | Docker compose definition |

---

## File Locations

```
/mnt/coordinaton_mcp_data/worktrees/messaging/
├── docker/
│   └── ejabberd/
│       ├── docker-compose.yml        # Docker compose file
│       ├── ejabberd.yml              # Current config (VULNERABLE)
│       ├── ejabberd-hardened.yml     # Hardened config (USE THIS)
│       └── ejabberd-VULNERABLE.yml   # Backup of vulnerable config
├── src/
│   └── handlers/
│       └── messaging-xmpp.js         # MCP messaging handler
└── docs/
    ├── MESSAGING-DEVOPS-GUIDE.md     # This file
    └── SECURITY-INCIDENT-REPORT-2025-12-05.md
```

---

## Operations

### Check Container Status

```bash
# See if ejabberd is running
docker ps -a | grep ejabberd

# Expected output when running:
# 779b0fe75d6c   ejabberd/ecs:latest   "/sbin/tini..."   Up 2 hours   v2-ejabberd
```

### Start ejabberd

```bash
cd /mnt/coordinaton_mcp_data/worktrees/messaging/docker/ejabberd

# Start with compose
docker-compose up -d

# Or start existing container
docker start v2-ejabberd
```

### Stop ejabberd

```bash
# Graceful stop
docker stop v2-ejabberd

# Or via compose
cd /mnt/coordinaton_mcp_data/worktrees/messaging/docker/ejabberd
docker-compose down
```

### Restart ejabberd

```bash
docker restart v2-ejabberd
```

### View Logs

```bash
# Live logs
docker logs -f v2-ejabberd

# Last 100 lines
docker logs --tail 100 v2-ejabberd

# Logs with timestamps
docker logs -t v2-ejabberd
```

### Check ejabberd Status

```bash
# Internal status
docker exec v2-ejabberd ejabberdctl status

# Connected users
docker exec v2-ejabberd ejabberdctl connected_users

# Registered users
docker exec v2-ejabberd ejabberdctl registered_users smoothcurves.nexus
```

---

## Configuration Management

### Apply Hardened Config

```bash
cd /mnt/coordinaton_mcp_data/worktrees/messaging/docker/ejabberd

# Backup current config
cp ejabberd.yml ejabberd-VULNERABLE.yml

# Apply hardened config
cp ejabberd-hardened.yml ejabberd.yml

# Restart to apply
docker restart v2-ejabberd

# Verify
docker exec v2-ejabberd ejabberdctl status
```

### Verify Port Binding

After applying hardened config, verify ports are localhost only:

```bash
# Check from inside container
docker exec v2-ejabberd netstat -tlnp

# Should show:
# 127.0.0.1:5222 (not 0.0.0.0:5222)
# 127.0.0.1:5280 (not 0.0.0.0:5280)

# Check from host
ss -tlnp | grep -E "5222|5280"
# Should show 127.0.0.1 binding
```

### Edit Configuration

```bash
# Edit config
vim /mnt/coordinaton_mcp_data/worktrees/messaging/docker/ejabberd/ejabberd.yml

# Validate YAML syntax
python3 -c "import yaml; yaml.safe_load(open('ejabberd.yml'))"

# Apply changes
docker restart v2-ejabberd

# Check for errors
docker logs --tail 50 v2-ejabberd
```

---

## User Management

### List Users

```bash
docker exec v2-ejabberd ejabberdctl registered_users smoothcurves.nexus
```

### Create User

```bash
docker exec v2-ejabberd ejabberdctl register USERNAME smoothcurves.nexus PASSWORD
```

### Delete User

```bash
docker exec v2-ejabberd ejabberdctl unregister USERNAME smoothcurves.nexus
```

### Check User Exists

```bash
docker exec v2-ejabberd ejabberdctl check_account USERNAME smoothcurves.nexus
# Returns 0 if exists, 1 if not
```

---

## Room (MUC) Management

### List Rooms

```bash
docker exec v2-ejabberd ejabberdctl muc_online_rooms global
```

### Create Room

```bash
docker exec v2-ejabberd ejabberdctl create_room ROOMNAME conference.smoothcurves.nexus smoothcurves.nexus
```

### Destroy Room

```bash
docker exec v2-ejabberd ejabberdctl destroy_room ROOMNAME conference.smoothcurves.nexus
```

### Get Room History

```bash
docker exec v2-ejabberd ejabberdctl get_room_history ROOMNAME conference.smoothcurves.nexus
```

---

## Troubleshooting

### ejabberd Won't Start

```bash
# Check logs for errors
docker logs v2-ejabberd

# Common issues:
# - YAML syntax error in config
# - Port already in use
# - Missing volume mounts
```

### Can't Connect to API

```bash
# Check if API is listening
curl http://127.0.0.1:5280/api/status

# Check container networking
docker exec v2-ejabberd curl -s localhost:5280/api/status
```

### Messages Not Delivering

```bash
# Check if MAM is working
docker exec v2-ejabberd ejabberdctl get_room_history ROOMNAME conference.smoothcurves.nexus

# Check offline message queue
docker exec v2-ejabberd ejabberdctl get_offline_count USERNAME smoothcurves.nexus
```

### High Resource Usage

```bash
# Check container stats
docker stats v2-ejabberd

# Check connected users (potential abuse)
docker exec v2-ejabberd ejabberdctl connected_users_number
```

---

## Security Checklist

Before starting ejabberd in production:

- [ ] Hardened config applied (`ejabberd-hardened.yml` → `ejabberd.yml`)
- [ ] Ports bound to 127.0.0.1 only
- [ ] Public API commands restricted (no `register`, `create_room`)
- [ ] `/admin`, `/bosh`, `/ws` endpoints removed
- [ ] `starttls_required: true` set
- [ ] Room defaults set to `members_only: true`
- [ ] Messaging handler command injection patched

### Verify Security

```bash
# 1. Check port binding
ss -tlnp | grep -E "5222|5280"
# Must show 127.0.0.1, NOT 0.0.0.0

# 2. Test external access is blocked
curl http://YOUR_PUBLIC_IP:5280/api/status
# Should fail/timeout

# 3. Test localhost access works
curl http://127.0.0.1:5280/api/status
# Should return ejabberd status
```

---

## Backup & Recovery

### Backup ejabberd Data

```bash
# Export users
docker exec v2-ejabberd ejabberdctl registered_users smoothcurves.nexus > /backup/ejabberd-users.txt

# Export rooms
docker exec v2-ejabberd ejabberdctl muc_online_rooms global > /backup/ejabberd-rooms.txt

# Copy config
cp /mnt/coordinaton_mcp_data/worktrees/messaging/docker/ejabberd/ejabberd.yml /backup/
```

### Full Container Backup

```bash
# Stop container
docker stop v2-ejabberd

# Export container
docker export v2-ejabberd > /backup/v2-ejabberd-backup.tar

# Start container
docker start v2-ejabberd
```

---

## Integration with MCP

The MCP server communicates with ejabberd via `docker exec` commands:

```javascript
// From messaging-xmpp.js
async function ejabberdctl(command) {
  const { stdout } = await execAsync(
    `docker exec v2-ejabberd ejabberdctl ${command}`,
    { timeout: 10000 }
  );
  return stdout.trim();
}
```

**MCP Tools that use ejabberd:**

| Tool | ejabberd Commands Used |
|------|----------------------|
| `xmpp_send_message` | `send_message`, `check_account`, `register` |
| `xmpp_get_messages` | `get_offline_count`, `get_room_history` |
| `get_presence` | `connected_users_vhost` |
| `register_messaging_user` | `register`, `create_room` |

---

## Contact

- **Messaging System:** Messenger (MessengerEngineer)
- **DevOps:** Bastion
- **Security:** Report to Lupo/Executive

---

*"If it's not in the docs, it didn't happen."*
