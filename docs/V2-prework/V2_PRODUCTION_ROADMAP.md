# V2 Production Roadmap

**Author:** Bridge
**Date:** 2025-12-10
**Status:** Draft for Sprint Planning

---

## Overview

This document outlines the path from V2 development to production deployment, including MCP protocol compliance, API documentation, and team adoption.

---

## Current State

**V2 Dev Server:**
- Running at `https://smoothcurves.nexus/mcp/dev/`
- HTTP POST JSON-RPC 2.0 endpoints
- All core APIs implemented and tested
- Identity recovery system complete

**What Exists:**
- `openapi.json` - Full API documentation (just created)
- `V2_API_SPEC.md` - Detailed spec with examples
- Working endpoints: bootstrap, introspect, identity, tasks, diary, projects
- File-based persistence in `/v2-dev-data/`

**What's Missing:**
- Production nginx routing (`/mcp/v2/`)
- stdio MCP proxy for local instances
- SSE streaming (optional, for real-time)
- Claude skill for direct API access
- Team actually using V2

---

## Roadmap Phases

### Phase 1: Documentation & Discoverability
**Owner:** Bridge (complete)
**Status:** ✅ Done

| Task | Status | Notes |
|------|--------|-------|
| OpenAPI 3.1 spec | ✅ Done | `docs/V2-prework/openapi.json` |
| API spec updates | ✅ Done | v1.3 with identity recovery |
| Welcome guide | ✅ Done | Identity recovery instructions |

---

### Phase 2: Production Routing
**Owner:** Bastion
**Estimated Effort:** Small

| Task | Description |
|------|-------------|
| nginx config for `/mcp/v2/` | Route production traffic to V2 server |
| Health endpoint | Ensure `/mcp/v2/health` works |
| OpenAPI endpoint | Serve `openapi.json` at standard location |
| SSL/TLS | Verify HTTPS works correctly |

**Suggested nginx location:**
```nginx
location /mcp/v2/ {
    proxy_pass http://localhost:3447/;  # V2 production port
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection 'upgrade';
    proxy_set_header Host $host;
    proxy_cache_bypass $http_upgrade;
}

location /mcp/v2/openapi.json {
    alias /path/to/v2/docs/V2-prework/openapi.json;
    add_header Content-Type application/json;
}
```

---

### Phase 3: stdio MCP Proxy
**Owner:** TBD (could be delegated)
**Estimated Effort:** Small-Medium

Create a thin wrapper that:
1. Reads JSON-RPC from stdin
2. POSTs to V2 HTTP endpoint
3. Writes response to stdout

**Implementation:**
```javascript
// mcp-v2-proxy.js (~100 lines)
const readline = require('readline');
const https = require('https');

const V2_ENDPOINT = 'https://smoothcurves.nexus/mcp/v2/';

const rl = readline.createInterface({ input: process.stdin });

rl.on('line', async (line) => {
  const request = JSON.parse(line);
  const response = await fetch(V2_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request)
  });
  const result = await response.json();
  console.log(JSON.stringify(result));
});
```

**Deliverables:**
- `mcp-v2-proxy.js` - The proxy script
- Installation instructions
- Test with local Claude instance

---

### Phase 4: Claude Skill
**Owner:** TBD
**Estimated Effort:** Medium

Create a Claude skill that provides direct V2 API access:

**Skill Definition:**
```yaml
name: coordination-v2
description: Access V2 Coordination System APIs
endpoints:
  - bootstrap
  - introspect
  - lookup_identity
  - register_context
  - add_diary_entry
  - get_my_tasks
  # etc.
```

**Considerations:**
- Should wrap common operations
- Handle authentication (recovery keys, role tokens)
- Provide helpful error messages
- Include identity recovery workflow

---

### Phase 5: Team Adoption
**Owner:** All + Lupo coordination
**Estimated Effort:** Ongoing

| Task | Description |
|------|-------------|
| Create V2 Coordination project | Actual project for V2 development |
| Migrate active instances | Get team bootstrapped on V2 |
| Test messaging integration | Once Messenger wires up APIs |
| Feedback loop | Document issues, iterate |

**Adoption Checklist for Each Team Member:**
1. Bootstrap on V2 (`bootstrap_v2({ name: "YourName" })`)
2. Save recovery key
3. Register context
4. Take on role
5. Join project
6. Start using diary API
7. Report issues

---

### Phase 6: SSE Streaming (Optional/Future)
**Owner:** TBD
**Estimated Effort:** Medium

Only needed if we want:
- Real-time message delivery
- Progress updates for long operations
- Server-initiated notifications

**Implementation:**
- Add SSE endpoint (`/mcp/v2/events`)
- Modify handlers to emit events
- Client subscription management

**Recommendation:** Defer until request/response proves insufficient.

---

## Delta Analysis: V2 HTTP vs MCP Server

| Capability | V2 Current | Full MCP | Gap |
|------------|-----------|----------|-----|
| JSON-RPC 2.0 | ✅ | ✅ | None |
| HTTP transport | ✅ | ✅ | None |
| stdio transport | ❌ | ✅ | Phase 3 proxy |
| SSE streaming | ❌ | Optional | Phase 6 |
| Tool discovery | ✅ (`tools/list`) | ✅ | None |
| OpenAPI spec | ✅ | ✅ | None |

**Conclusion:** V2 is ~80% MCP compliant. The stdio proxy (Phase 3) closes most of the gap. SSE is optional enhancement.

---

## Priority Recommendation

1. **Phase 2 (nginx)** - Bastion - Unblocks production access
2. **Phase 3 (stdio proxy)** - Small task - Enables local MCP
3. **Phase 5 (adoption)** - Team - Start using V2 now
4. **Phase 4 (skill)** - Nice to have - Convenience layer

---

## Files Reference

| File | Location | Purpose |
|------|----------|---------|
| OpenAPI spec | `docs/V2-prework/openapi.json` | API documentation |
| API spec | `docs/V2-prework/V2_API_SPEC.md` | Detailed spec |
| Welcome guide | `/v2-dev-data/default/welcome.md` | Bootstrap instructions |
| Server code | `src/v2/` | V2 handlers |
| Main server | `src/server.js` | Entry point |

---

## Questions for Sprint Planning

1. Who takes Phase 3 (stdio proxy)?
2. Who takes Phase 4 (Claude skill)?
3. Should we create the V2 Coordination project now?
4. What's the timeline for team migration to V2?

---

**Document Status:** Ready for Review
**Next Action:** Add to sprint plan, assign owners
