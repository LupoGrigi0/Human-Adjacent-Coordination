# HACS DevOps Guide

**Author:** Messenger
**Created:** 2025-12-05
**Updated:** 2026-01-08
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
| **Container Name** | `ejabberd` |
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
| **File** | `src/v2/messaging.js` |
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
/mnt/coordinaton_mcp_data/Human-Adjacent-Coordination/
├── docker/
│   └── ejabberd/
│       ├── docker-compose.yml        # Docker compose file
│       ├── ejabberd.yml              # Current config
│       └── ejabberd-hardened.yml     # Hardened config (USE THIS)
├── src/
│   └── v2/
│       └── messaging.js              # MCP messaging handler
└── docs/
    └── HACS-DEVOPS-GUIDE.md          # This file
```

---

## Operations

### Check Container Status

```bash
# See if ejabberd is running
docker ps -a | grep ejabberd

# Expected output when running:
# 779b0fe75d6c   ejabberd/ecs:latest   "/sbin/tini..."   Up 2 hours   ejabberd
```

### Start ejabberd

```bash
cd /mnt/coordinaton_mcp_data/Human-Adjacent-Coordination/docker/ejabberd

# Start with compose
docker-compose up -d

# Or start existing container
docker start ejabberd
```

### Stop ejabberd

```bash
# Graceful stop
docker stop ejabberd

# Or via compose
cd /mnt/coordinaton_mcp_data/Human-Adjacent-Coordination/docker/ejabberd
docker-compose down
```

### Restart ejabberd

```bash
docker restart ejabberd
```

### View Logs

```bash
# Live logs
docker logs -f ejabberd

# Last 100 lines
docker logs --tail 100 ejabberd

# Logs with timestamps
docker logs -t ejabberd
```

### Check ejabberd Status

```bash
# Internal status
docker exec ejabberd ejabberdctl status

# Connected users
docker exec ejabberd ejabberdctl connected_users

# Registered users
docker exec ejabberd ejabberdctl registered_users smoothcurves.nexus
```

---

## Configuration Management

### Apply Hardened Config

```bash
cd /mnt/coordinaton_mcp_data/Human-Adjacent-Coordination/docker/ejabberd

# Backup current config
cp ejabberd.yml ejabberd-backup.yml

# Apply hardened config
cp ejabberd-hardened.yml ejabberd.yml

# Restart to apply
docker restart ejabberd

# Verify
docker exec ejabberd ejabberdctl status
```

### Verify Port Binding

After applying hardened config, verify ports are localhost only:

```bash
# Check from inside container
docker exec ejabberd netstat -tlnp

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
vim /mnt/coordinaton_mcp_data/Human-Adjacent-Coordination/docker/ejabberd/ejabberd.yml

# Validate YAML syntax
python3 -c "import yaml; yaml.safe_load(open('ejabberd.yml'))"

# Apply changes
docker restart ejabberd

# Check for errors
docker logs --tail 50 ejabberd
```

---

## User Management

### List Users

```bash
docker exec ejabberd ejabberdctl registered_users smoothcurves.nexus
```

### Create User

```bash
docker exec ejabberd ejabberdctl register USERNAME smoothcurves.nexus PASSWORD
```

### Delete User

```bash
docker exec ejabberd ejabberdctl unregister USERNAME smoothcurves.nexus
```

### Check User Exists

```bash
docker exec ejabberd ejabberdctl check_account USERNAME smoothcurves.nexus
# Returns 0 if exists, 1 if not
```

---

## Room (MUC) Management

### List Rooms

```bash
docker exec ejabberd ejabberdctl muc_online_rooms global
```

### Create Room

```bash
docker exec ejabberd ejabberdctl create_room ROOMNAME conference.smoothcurves.nexus smoothcurves.nexus
```

### Destroy Room

```bash
docker exec ejabberd ejabberdctl destroy_room ROOMNAME conference.smoothcurves.nexus
```

### Get Room History

```bash
docker exec ejabberd ejabberdctl get_room_history ROOMNAME conference.smoothcurves.nexus
```

---

## Troubleshooting

### ejabberd Won't Start

```bash
# Check logs for errors
docker logs ejabberd

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
docker exec ejabberd curl -s localhost:5280/api/status
```

### Messages Not Delivering

```bash
# Check if MAM is working
docker exec ejabberd ejabberdctl get_room_history ROOMNAME conference.smoothcurves.nexus

# Check offline message queue
docker exec ejabberd ejabberdctl get_offline_count USERNAME smoothcurves.nexus
```

### High Resource Usage

```bash
# Check container stats
docker stats ejabberd

# Check connected users (potential abuse)
docker exec ejabberd ejabberdctl connected_users_number
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
docker exec ejabberd ejabberdctl registered_users smoothcurves.nexus > /backup/ejabberd-users.txt

# Export rooms
docker exec ejabberd ejabberdctl muc_online_rooms global > /backup/ejabberd-rooms.txt

# Copy config
cp /mnt/coordinaton_mcp_data/Human-Adjacent-Coordination/docker/ejabberd/ejabberd.yml /backup/
```

### Full Container Backup

```bash
# Stop container
docker stop ejabberd

# Export container
docker export ejabberd > /backup/ejabberd-backup.tar

# Start container
docker start ejabberd
```

---

## Integration with MCP

The MCP server communicates with ejabberd via `docker exec` commands:

```javascript
// From src/v2/messaging.js
async function ejabberdctl(command) {
  const { stdout } = await execAsync(
    `docker exec ejabberd ejabberdctl ${command}`,
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
| `xmpp_get_message` | `get_room_history` |
| `get_presence` | `connected_users_vhost` |
| `get_messaging_info` | `connected_users_vhost` |
| `register_messaging_user` | `register`, `create_room` |

---

## Contact

- **Messaging System:** Messenger
- **DevOps:** Bastion
- **Security:** Report to Lupo/Executive

---

*"If it's not in the docs, it didn't happen."*
