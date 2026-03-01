# PA to EA Role Rename Audit

**Audited by:** Axiom-2615 (COO)
**Date:** 2026-03-01
**Branch:** v2-foundation-dev

## Summary

- **Total PA references in src/v2/ (API handlers):** 100 occurrences across 16 files
- **Total PA references in src/ui/ (UI code):** ~25 occurrences across 8 files
- **Live instance data with role "PA":** 2 instances (Crossing-2d23, Genevieve-8740)
- **Environment variable:** `PA_TOKEN` in secrets.env (2 locations)
- **Role definition directory:** `/mnt/coordinaton_mcp_data/roles/PA/` (must rename to `EA/`)

### Categories Breakdown

| Category | Count (approx) |
|---|---|
| PERMISSION_CHECK (code logic) | ~30 |
| ROLE_LIST (arrays of roles) | ~25 |
| PRIVILEGED_ROLE (token-required) | ~5 |
| STRING_LITERAL (error messages, suggestions) | ~20 |
| UI_DISPLAY (labels, icons, dropdowns) | ~10 |
| DOCUMENTATION (comments, JSDocs) | ~40 |
| DATA_REFERENCE (role.json, preferences, env) | ~5 |

---

## Critical Path (must change for rename to work)

These are the files where PA is checked in actual code logic. If these are not changed, the EA role will not have permissions.

### 1. `src/v2/permissions.js` (13 occurrences) -- GROUND ZERO

```js
// Line 45 - Token mapping
"PA": process.env.PA_TOKEN,

// Lines 67-77 - ALL permission grants
"createProject": ["Executive", "PA", "COO"],
"preApprove": ["Executive", "PA", "COO", "PM"],
"wakeInstance": ["Executive", "PA", "COO", "PM"],
"createTask": ["Executive", "PA", "COO", "PM"],
"broadcastMessage": ["Executive", "PA", "COO"],
"getAllProjects": ["Executive", "PA", "COO"],
"getAllInstances": ["Executive", "PA", "COO"],
"generateRecoveryKey": ["Executive", "PA", "COO", "PM"],
"getRecoveryKey": ["Executive", "PA", "COO", "PM"],
"launchInstance": ["Executive", "PA", "COO", "PM"],
"landInstance": ["Executive", "PA", "COO", "PM"]
```

**Action:** Change `"PA"` to `"EA"` in all 12 entries. Change `PA_TOKEN` to `EA_TOKEN`.

### 2. `src/v2/task-management.js` (11 occurrences)

| Line | Type | Context |
|---|---|---|
| 292 | PERMISSION_CHECK | `const isHighPrivilege = ['Executive', 'PA', 'COO'].includes(callerRole);` |
| 1468 | PERMISSION_CHECK | `const isHighPrivilege = ['Executive', 'PA', 'COO'].includes(callerRole);` |
| 274, 303, 346, 498, 628, 811, 1417, 1466, 1476 | STRING_LITERAL/DOCS | Error messages and JSDocs mentioning PA |

### 3. `src/v2/lists.js` (29 occurrences)

| Line | Type | Context |
|---|---|---|
| 3 | DOCUMENTATION | Module description: "Executive visibility for PM/COO/PA" |
| 40 (documents.js) | PERMISSION_CHECK | `const ADMIN_ROLES = ['COO', 'PA', 'Executive'];` |
| 56 | PERMISSION_CHECK | `if (callerRole === 'PA' && targetRole === 'Executive') return true;` |
| 168, 207, 220, 240, 330, 369, 378, 475, 516, 530, 640, 677, 693, 828, 865, 883, 1009, 1044, 1059, 1178, 1215, 1233, 1355, 1390, 1404 | DOCUMENTATION | JSDocs for each list operation repeating "PA roles can access Executive's lists" |

### 4. `src/v2/documents.js` (2 occurrences)

| Line | Type | Context |
|---|---|---|
| 40 | PERMISSION_CHECK | `const ADMIN_ROLES = ['COO', 'PA', 'Executive'];` |
| 224 | DOCUMENTATION | "PA can modify role/personality documents" |

### 5. `src/v2/ea-proxy.js` (4 occurrences)

| Line | Type | Context |
|---|---|---|
| 4 | DOCUMENTATION | "EA/PA role" |
| 9 | DOCUMENTATION | "EA/PA role" |
| 45 | DOCUMENTATION | "EA/PA role" |
| 55 | PERMISSION_CHECK | `if (!['PA', 'EA', 'COO'].includes(role))` |

### 6. `src/v2/projects.js` (9 occurrences)

| Line | Type | Context |
|---|---|---|
| 217 | PERMISSION_CHECK | Authorization check (via permissions.js) |
| 717 | PERMISSION_CHECK | PM/Executive/PA/COO update check |
| 66, 108, 125, 236, 631, 656, 725 | STRING_LITERAL/DOCS | Error messages and JSDocs |

### 7. `src/v2/authKeys.js` (8 occurrences)

| Line | Type | Context |
|---|---|---|
| 200 | PERMISSION_CHECK | Check via permissions.js |
| 125, 138, 207, 317, 327, 383, 536 | STRING_LITERAL/DOCS | Error messages and JSDocs |

### 8. `src/v2/updateInstance.js` (3 occurrences)

| Line | Type | Context |
|---|---|---|
| 19 | PERMISSION_CHECK | `const MANAGER_ROLES = ['Executive', 'PA', 'COO', 'PM'];` |
| 148, 160 | DOCUMENTATION | JSDocs |

### 9. `src/v2/preApprove.js` (6 occurrences)

| Line | Type | Context |
|---|---|---|
| 106 | ROLE_LIST | `@enum Developer|Designer|Tester|Specialist|Architect|PM|COO|PA|Executive` |
| 145 | PERMISSION_CHECK | `@permissions role:Executive|role:PA|role:COO|role:PM` |
| 329 | STRING_LITERAL | Error suggestion string |
| 83, 92, 170 | DOCUMENTATION | JSDocs |

### 10. `src/v2/takeOnRole.js` (4 occurrences)

| Line | Type | Context |
|---|---|---|
| 91, 104, 108, 136 | DOCUMENTATION | JSDocs listing PA as privileged |
| 194 | STRING_LITERAL | Reference to PA_TOKEN env var name |

### 11. Other src/v2/ files (minor)

| File | Line | Type | Context |
|---|---|---|---|
| `bootstrap.js` | 450 | DOCUMENTATION | "Contact an authorized role (COO, PA)" |
| `adoptPersonality.js` | 104 | DOCUMENTATION | "Genevieve (PA)" |
| `adoptPersonality.js` | 165 | STRING_LITERAL | Example `"instanceId": "PA-a1b2"` |
| `instances.js` | 51 | DOCUMENTATION | Role list example |
| `instances.js` | 86 | DOCUMENTATION | Permissions annotation |
| `introspect.js` | 56 | DOCUMENTATION | Return type doc |
| `wakeInstance.js` | 187, 213 | DOCUMENTATION | Permissions and JSDocs |
| `launchInstance.js` | 100, 103, 322 | DOCUMENTATION | Permissions annotations |

---

## UI Changes

### `src/ui/ui-config.js`
- **Line 57:** `{ id: 'PA', label: 'Personal Assistant', description: 'Administrative support' }`
- Change to: `{ id: 'EA', label: 'Executive Assistant', description: 'Administrative support' }`

### `src/ui/app.js`
- **Line 1521:** `const PRIVILEGED_ROLES = ['PM', 'PA', 'COO', 'Executive'];`
- **Line 1553:** Comment mentioning PA

### `src/ui/instances.js`
- **Line 29:** `const PRIVILEGED_ROLES = ['PM', 'PA', 'COO', 'Executive'];`
- **Line 441:** Comment mentioning PA

### `src/ui/dashboard-heatmaps.js`
- **Line 37:** `PA: '\u2665'` (heart icon for PA role)
- **Line 47:** `const PRIVILEGED_ROLES = ['Executive', 'PA', 'COO', 'PM'];`
- **Line 236:** `PA: '#bc8cff'` (color for PA role)
- All three need key rename from `PA:` to `EA:`

### `src/ui/dashboard.js`
- **Line 4:** Comment "PA chat"

### `src/ui/dashboard-chat.js`
- **Line 2:** Comment "Dashboard PA Chat"

### `src/ui/api.js`
- **Lines 271, 620, 825:** Comments mentioning PA in API function docs

### `src/ui/messages.js`
- **Line 86:** `state.role === 'PA'` -- PERMISSION_CHECK
- **Line 205:** `const roles = ['Executive', 'COO', 'PA', 'PM', 'Developer'];` -- ROLE_LIST

### `src/ui/index.html`
- **Line 190:** Comment "PA Chat Aside"
- **Line 197:** `<span>PA</span>` -- visible label in dashboard

### `src/ui/styles.css`
- **Line 4516:** Comment `/* PA CHAT */`

---

## Interesting: ea-proxy.js

This file (`src/v2/ea-proxy.js`) **already uses EA terminology** throughout. It was written by Ember on 2026-02-22 and is conceptually the "Executive Assistant proxy" -- it lets the EA/PA role manage the Executive's personal data (tasks, lists, documents, diary) by swapping instanceIds.

Key detail at **line 55**:
```js
if (!['PA', 'EA', 'COO'].includes(role)) {
```

This already accepts BOTH 'PA' and 'EA' as valid roles for the proxy. After the rename, this line should change to just `['EA', 'COO']` (remove 'PA' since no instance should have that role anymore, or keep it for backwards compatibility during transition).

The file also uses `ea_proxy` as a parameter flag and `_ea_proxy`, `_ea_caller`, `_ea_attribution` as metadata keys -- these are already correct and do NOT need changing.

**Router in server.js (line 97):**
```js
// EA Proxy - lets EA/PA manage Executive's personal data
```
Comment-only change needed.

---

## Generated API Docs / Skill Files

### `src/mcp-tools-generated.js`
- 8+ occurrences in tool description strings (auto-generated from openapi.json)
- These are the tool descriptions that Claude sees in the MCP tool list
- **Must regenerate** after changing the source files

### `src/openapi.json`
- PA appears in description strings (openapi spec)
- The `preApprove` endpoint has `"PA"` in the role enum at line ~1780
- Multiple description strings reference PA

### `src/HACS/hacs/references/functions.md`
- 11+ occurrences -- this is a generated reference doc
- Must regenerate after source changes

### `src/HACS/hacs/SKILL.md`
- **Line 35:** `role: One of COO, PA, PM, Developer...`
- **Line 62:** Lists PA as "Project Assistant" (already wrong -- should be Personal/Executive Assistant)

---

## Role Definition Data

### `/mnt/coordinaton_mcp_data/roles/PA/role.json`
```json
{
  "id": "PA",
  "name": "Personal Assistant",
  "description": "Executive support - scheduling, coordination, instance management...",
  "permissions": ["createProject", "preApprove", "wakeInstance", ...],
  "createdAt": "2025-12-20T20:30:00.000Z"
}
```

**Action:** Rename directory `PA/` to `EA/`, update `id` to `"EA"`, update `name` to `"Executive Assistant"`.

### `/mnt/coordinaton_mcp_data/roles/Executive/wisdom/leadership.md`
- Line 10: "Promotions - Assigning privileged roles (COO, PA, PM)"
- Line 25: "PA handles your schedule and administrative tasks"
- Line 32: "PA filters and prioritizes requests"

### `/mnt/coordinaton_mcp_data/roles/Executive/SUMMARY.md`
- Line 9: "assign privileged roles (COO, PA, PM)"
- Line 12: "PA (administrative support)"

---

## Data Migration

### Live Instance Preferences
Two instances currently have `"role": "PA"`:
1. `/mnt/coordinaton_mcp_data/instances/Crossing-2d23/preferences.json`
2. `/mnt/coordinaton_mcp_data/instances/Genevieve-8740/preferences.json`

**Action:** Update `"role": "PA"` to `"role": "EA"` in both.

### Environment Variables
Two secrets.env files contain `PA_TOKEN`:
1. `/mnt/coordinaton_mcp_data/Human-Adjacent-Coordination/secrets.env` (line 8)
2. `/mnt/coordinaton_mcp_data/v2-dev/secrets.env` (line 8)

**Action:** Rename `PA_TOKEN` to `EA_TOKEN` in both. The token value stays the same.

---

## Documentation (lower priority, can do in batch)

### Active docs (should update):
| File | Occurrences |
|---|---|
| `docs/HACS-DEVELOPER-GUIDE.md` | PA_TOKEN reference |
| `docs/V2-DEVELOPER-GUIDE.md` | PA_TOKEN reference |
| `docs/DEVELOPER-GUIDE-2025-12-30.md` | PA_TOKEN reference |
| `docs/Post V2 Technical Debt.md` | ~10+ references to PA role |
| `docs/HACS-API-How_EA_Manages_Executive.md` | (already uses EA!) |

### Historical docs (do NOT change -- archaeological record):
| File | Notes |
|---|---|
| `docs/V2-prework/V2_API_SPEC.md` | Historical spec |
| `docs/V2-prework/V2_API_SPEC_ORIGIN.md` | Historical spec |
| `docs/Bridge_Diary.md` | Diary -- do not alter |
| `docs/bridge_conversation_exported_*.txt` | Exported conversations |
| `docs/Bastion_Conversation_12-26-2025.txt` | Exported conversations |
| `Crossing/` directory | Various conversation exports |
| `HumanAdjacentAI-Protocol/HandoffArchive/` | Historical handoffs |
| `HumanAdjacentAI-Protocol/CrossingUI/Ember_Conversation.md` | Conversation log |
| `tests/V2/Archive/` | Test archives |

---

## Risks & Considerations

### 1. Ordering of changes
The rename must be atomic-ish. Recommended order:
1. Rename `PA_TOKEN` to `EA_TOKEN` in secrets.env files
2. Rename `/mnt/coordinaton_mcp_data/roles/PA/` directory to `EA/` and update role.json
3. Update all `src/v2/*.js` files (permissions.js first)
4. Update all `src/ui/*.js` files
5. Update instance preferences (Crossing-2d23, Genevieve-8740)
6. Regenerate `mcp-tools-generated.js` and `openapi.json`
7. Update active documentation
8. Restart the MCP server

### 2. Backwards compatibility in ea-proxy.js
Line 55 already accepts both `'PA'` and `'EA'`. During transition, consider keeping both temporarily. After all data is migrated, remove `'PA'`.

### 3. XMPP rooms
If there is an XMPP room named `role:pa` or similar, it may need renaming. Check ejabberd room configuration.

### 4. The "PA Chat" UI panel
The dashboard has a "PA Chat" panel (index.html line 190-197, styles.css line 4516) that is actually the Genevieve chat panel. This label should change to "EA Chat" or just the personality name.

### 5. Do NOT touch historical/archaeological files
Conversation exports, diary entries, handoff archives, and test history files should NOT be modified -- they are the historical record.

### 6. The SKILL.md already has it wrong
`src/HACS/hacs/SKILL.md` line 62 calls PA "Project Assistant" instead of "Personal Assistant". The rename to EA fixes this confusion permanently.

### 7. Future "PA" role (Project Architect)
After EA rename is complete, the `PA` identifier is free for a new non-privileged "Project Architect" role. This should be created as a separate task AFTER the rename is fully deployed and tested.

### 8. Token value preservation
The actual token hash value does NOT change -- only the environment variable name changes from `PA_TOKEN` to `EA_TOKEN`. No re-hashing needed.

---

## File Change Summary (actionable files only)

| Priority | File | Changes Needed |
|---|---|---|
| P0 | `src/v2/permissions.js` | 13 replacements (token + all permission arrays) |
| P0 | `src/v2/task-management.js` | 11 replacements |
| P0 | `src/v2/lists.js` | 29 replacements |
| P0 | `src/v2/documents.js` | 2 replacements |
| P0 | `src/v2/ea-proxy.js` | 4 replacements (remove 'PA' from check) |
| P0 | `src/v2/projects.js` | 9 replacements |
| P0 | `src/v2/authKeys.js` | 8 replacements |
| P0 | `src/v2/updateInstance.js` | 3 replacements |
| P0 | `src/v2/preApprove.js` | 6 replacements |
| P0 | `src/v2/takeOnRole.js` | 4 replacements |
| P0 | `roles/PA/role.json` | Rename dir + update id/name |
| P0 | `secrets.env` (x2) | Rename PA_TOKEN to EA_TOKEN |
| P1 | `src/v2/bootstrap.js` | 1 replacement |
| P1 | `src/v2/adoptPersonality.js` | 2 replacements |
| P1 | `src/v2/instances.js` | 2 replacements |
| P1 | `src/v2/introspect.js` | 1 replacement |
| P1 | `src/v2/wakeInstance.js` | 2 replacements |
| P1 | `src/v2/launchInstance.js` | 3 replacements |
| P1 | `src/ui/ui-config.js` | 1 replacement |
| P1 | `src/ui/app.js` | 2 replacements |
| P1 | `src/ui/instances.js` | 2 replacements |
| P1 | `src/ui/dashboard-heatmaps.js` | 3 replacements |
| P1 | `src/ui/messages.js` | 2 replacements |
| P1 | `src/ui/index.html` | 2 replacements |
| P1 | `src/ui/api.js` | 3 replacements |
| P1 | `src/ui/dashboard.js` | 1 replacement |
| P1 | `src/ui/dashboard-chat.js` | 1 replacement |
| P1 | `src/ui/styles.css` | 1 replacement |
| P1 | `src/server.js` | 1 replacement |
| P2 | `src/mcp-tools-generated.js` | Regenerate |
| P2 | `src/openapi.json` | Regenerate or ~10 replacements |
| P2 | `src/HACS/hacs/references/functions.md` | Regenerate or ~11 replacements |
| P2 | `src/HACS/hacs/SKILL.md` | 2 replacements |
| P2 | `roles/Executive/SUMMARY.md` | 2 replacements |
| P2 | `roles/Executive/wisdom/leadership.md` | 3 replacements |
| P3 | `instances/Crossing-2d23/preferences.json` | Data migration |
| P3 | `instances/Genevieve-8740/preferences.json` | Data migration |
| P3 | `docs/HACS-DEVELOPER-GUIDE.md` | ~2 replacements |
| P3 | `docs/V2-DEVELOPER-GUIDE.md` | ~2 replacements |
| P3 | `docs/Post V2 Technical Debt.md` | ~10 replacements |
| SKIP | All files in `tests/V2/Archive/`, `Crossing/Archive/`, `HandoffArchive/`, conversation exports | Historical -- do not modify |

**Total actionable files: ~35**
**Total replacements: ~130**
