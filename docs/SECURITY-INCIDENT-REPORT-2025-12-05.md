# Security Incident Report - 2025-12-05

**Author:** Messenger
**Status:** ACTIVE INCIDENT RESPONSE
**Severity:** HIGH

---

## Incident Summary

Server was used as a vector in a DDoS attack. Attack vectors under investigation include:
- Open XMPP ports (ejabberd)
- Next.js vulnerability in smoothcurves.art
- Potentially open API endpoints

All Docker containers have been stopped as immediate mitigation.

---

## FINDINGS: ejabberd Configuration

### CRITICAL ISSUES

**File:** `/mnt/coordinaton_mcp_data/worktrees/messaging/docker/ejabberd/ejabberd.yml`

| Issue | Severity | Description |
|-------|----------|-------------|
| Open Ports | CRITICAL | Port 5222 (XMPP) and 5280 (HTTP) bound to `::` (all interfaces) |
| Public Registration | CRITICAL | `register` command in public API permissions - anyone can create accounts |
| Public Messaging | CRITICAL | `send_message` in public commands - anyone can send messages |
| Public Room Creation | HIGH | `create_room` in public commands - anyone can create rooms |
| No TLS Required | HIGH | `starttls_required: false` - unencrypted connections allowed |
| Open c2s Access | HIGH | `c2s: allow: all` - no restrictions on client connections |
| Rooms Not Members-Only | MEDIUM | `members_only: false` - rooms open to anyone |

### REMEDIATION

Created hardened config at:
`/mnt/coordinaton_mcp_data/worktrees/messaging/docker/ejabberd/ejabberd-hardened.yml`

Changes:
- Ports bound to `127.0.0.1` only (localhost)
- Removed `/admin`, `/bosh`, `/ws` endpoints
- Removed `register`, `create_room`, `destroy_room` from public API
- Added `starttls_required: true`
- Set `members_only: true` for rooms
- Reduced rate limits

---

## FINDINGS: MCP Messaging Handler

### CRITICAL ISSUES

**File:** `/mnt/coordinaton_mcp_data/worktrees/messaging/src/handlers/messaging-xmpp.js`

| Issue | Severity | Line | Description |
|-------|----------|------|-------------|
| Command Injection | CRITICAL | 221-226 | Incomplete shell escaping allows injection via `$()`, backticks, etc. |
| No Rate Limiting | HIGH | N/A | APIs can be flooded with requests |
| No Input Validation | HIGH | N/A | No max length on subject/body - DoS via huge messages |
| Arbitrary User Creation | MEDIUM | 196 | `sendMessage` auto-creates sender without verification |
| No Auth Check | MEDIUM | N/A | `from` field can be spoofed |

### COMMAND INJECTION EXAMPLE

```javascript
// Current escaping (INSUFFICIENT):
const escapedSubject = (subject || '').replace(/"/g, '\\"').replace(/\n/g, ' ');

// Attack vector:
subject: "test$(cat /etc/passwd)"
subject: "test`whoami`"
subject: "test; rm -rf /"
```

### RECOMMENDED FIXES

```javascript
// 1. Use shell-escape library or strict validation
import shellEscape from 'shell-escape';

// 2. Validate input lengths
const MAX_SUBJECT_LENGTH = 256;
const MAX_BODY_LENGTH = 4096;
if (subject && subject.length > MAX_SUBJECT_LENGTH) {
  return { success: false, error: 'Subject too long' };
}

// 3. Whitelist characters for shell commands
function sanitizeForShell(str) {
  return str.replace(/[^a-zA-Z0-9\s.,!?@#-]/g, '');
}

// 4. Add rate limiting
const rateLimit = new Map();
const RATE_LIMIT = 10; // messages per minute
```

---

## NETWORK EXPOSURE (Current)

With Docker stopped:

| Port | Service | Binding | Status |
|------|---------|---------|--------|
| 22 | SSH | 0.0.0.0 | OPEN |
| 80 | nginx | 0.0.0.0 | OPEN |
| 443 | nginx | 0.0.0.0 | OPEN |
| 3444 | MCP (v1) | ::1 | localhost only |
| 5222 | XMPP | - | DOWN |
| 5280 | XMPP API | - | DOWN |

---

## IMMEDIATE ACTIONS REQUIRED

1. **DO NOT restart ejabberd** until hardened config is applied
2. Patch Next.js vulnerability on smoothcurves.art
3. Review nginx config for any exposed backends
4. Implement command injection fixes in messaging handler before re-enabling

---

## RESTART PROCEDURE (When Ready)

```bash
# 1. Backup old config
cp docker/ejabberd/ejabberd.yml docker/ejabberd/ejabberd-VULNERABLE.yml

# 2. Apply hardened config
cp docker/ejabberd/ejabberd-hardened.yml docker/ejabberd/ejabberd.yml

# 3. Restart with hardened config
docker-compose -f docker/ejabberd/docker-compose.yml up -d

# 4. Verify ports are localhost only
docker exec v2-ejabberd netstat -tlnp
# Should show 127.0.0.1:5222 and 127.0.0.1:5280

# 5. Test API still works internally
curl http://127.0.0.1:5280/api/status
```

---

## LONG-TERM RECOMMENDATIONS

1. **WAF/Firewall**: Add rate limiting at nginx level
2. **Monitoring**: Add alerting for unusual API activity
3. **Audit Logging**: Log all API calls with source IP
4. **Input Validation**: Implement strict validation on all user inputs
5. **Authentication**: Require instance authentication for messaging APIs
6. **Security Review**: Regular security audits of configuration

---

**Report Status:** In Progress
**Next Update:** After DevOps confirms infrastructure lockdown
