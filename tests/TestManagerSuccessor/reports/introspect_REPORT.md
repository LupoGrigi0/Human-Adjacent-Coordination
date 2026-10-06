## introspect

**Status:** FAIL

**Response Summary:**
- success: true
- instance: Contains instanceId, name, role (null), project, personality (null), homeSystem (null), createdAt, lastActiveAt, predecessorId, lineage
- projectContext: Contains projectId, name, pm, team array, activeTaskCount (0), myTaskCount (0)
- xmpp: Contains jid, projectRoom, online (true)
- unreadMessages: 0
- personalTaskCount: 0

**Backend Verification:**
Checked `/mnt/coordinaton_mcp_data/instances/Sentinel-817b/preferences.json`

| Field | API Response | Backend File | Match? |
|-------|-------------|--------------|--------|
| instanceId | Sentinel-817b | Sentinel-817b | YES |
| name | Sentinel | Sentinel | YES |
| role | null | Developer | NO |
| project | v2-test-project | v2-test-project | YES |
| personality | null | Phoenix | NO |
| homeSystem | null | null | YES |
| createdAt | 2025-12-31T00:17:28.014Z | 2025-12-31T00:17:28.014Z | YES |
| predecessorId | null | null | YES |
| lineage | ["Sentinel-817b"] | ["Sentinel-817b"] | YES |
| xmpp.jid | Sentinel-817b@coordination.nexus | Sentinel-817b@coordination.nexus | YES |

**Observations:**
1. **BUG FOUND:** The `role` field is returned as `null` by the API but is actually "Developer" in preferences.json
2. **BUG FOUND:** The `personality` field is returned as `null` by the API but is actually "Phoenix" in preferences.json
3. The endpoint correctly returns project context with team members
4. The endpoint correctly returns XMPP messaging info
5. The endpoint correctly returns task counts
6. All other fields match between API and backend

**Root Cause Hypothesis:**
The introspect endpoint implementation may be checking for role/personality in a different location or format than where bootstrap/takeOnRole stores them, OR there is a caching issue where the latest preferences are not being read.

**Severity:** HIGH - This bug would cause instances to not know their own role or personality after context recovery, breaking the coordination system's core identity management.
