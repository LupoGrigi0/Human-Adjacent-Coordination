# V2 UI API Audit Report

Generated: 2025-12-29

## Overview

This report compares API endpoints used by the V2 UI (`api.js`) against the documented OpenAPI specification (`openapi.json`).

**Files Analyzed:**
- `/mnt/coordinaton_mcp_data/worktrees/foundation/src/v2/ui/api.js` - UI API wrapper functions
- `/mnt/coordinaton_mcp_data/worktrees/foundation/src/v2/ui/app.js` - UI application using API
- `/mnt/coordinaton_mcp_data/Human-Adjacent-Coordination/src/openapi.json` - API documentation

---

## Part 1: All API Endpoints Used by UI (from api.js)

The following `rpcCall` endpoints are used in the UI:

| # | Endpoint Name | UI Function | Parameters Sent |
|---|---------------|-------------|-----------------|
| 1 | `bootstrap_v2` | `bootstrap()` | name, instanceId, predecessorId, authKey, homeSystem, homeDirectory |
| 2 | `introspect` | `introspect()` | instanceId |
| 3 | `register_context` | `registerContext()` | instanceId, workingDirectory, hostname, sessionId, tabName |
| 4 | `lookup_identity` | `lookupIdentity()` | workingDirectory, hostname, name |
| 5 | `update_instance` | `updateInstance()` | instanceId, targetInstanceId, homeSystem, homeDirectory, instructions |
| 6 | `take_on_role` | `takeOnRole()` | instanceId, role, token |
| 7 | `adopt_personality` | `adoptPersonality()` | instanceId, personality, token |
| 8 | `join_project` | `joinProject()` | instanceId, project |
| 9 | `get_projects` | `listProjects()` | instanceId |
| 10 | `get_project` | `getProject()` | instanceId, projectId |
| 11 | `create_project` | `createProject()` | instanceId, projectId, name, description, ghRepo |
| 12 | `get_my_tasks` | `getMyTasks()` | instanceId |
| 13 | `get_next_task` | `getNextTask()` | instanceId, keywords |
| 14 | `add_personal_task` | `addPersonalTask()` | instanceId, title, description, priority, listName |
| 15 | `complete_personal_task` | `completePersonalTask()` | instanceId, taskId, notes |
| 16 | `get_personal_lists` | `getPersonalLists()` | instanceId |
| 17 | `create_personal_list` | `createPersonalList()` | instanceId, listName, description |
| 18 | `assign_task_to_instance` | `assignTaskToInstance()` | instanceId, taskId, assigneeInstanceId, projectId |
| 19 | `get_diary` | `getDiary()` | instanceId, includePrivate |
| 20 | `add_diary_entry` | `addDiaryEntry()` | instanceId, entry, audience |
| 21 | `get_lists` | `getLists()` | instanceId, targetInstanceId |
| 22 | `get_list` | `getList()` | instanceId, listId, targetInstanceId |
| 23 | `create_list` | `createList()` | instanceId, name, description |
| 24 | `rename_list` | `renameList()` | instanceId, listId, name |
| 25 | `delete_list` | `deleteList()` | instanceId, listId |
| 26 | `add_list_item` | `addListItem()` | instanceId, listId, text |
| 27 | `toggle_list_item` | `toggleListItem()` | instanceId, listId, itemId |
| 28 | `delete_list_item` | `deleteListItem()` | instanceId, listId, itemId |
| 29 | `xmpp_send_message` | `sendMessage()`, `sendXmppMessage()` | from, to, subject, body, priority |
| 30 | `xmpp_get_messages` | `getMessages()`, `getXmppMessages()` | instanceId, name, limit, before_id, room |
| 31 | `xmpp_get_message` | `getMessageBody()` | instanceId, id, room |
| 32 | `get_presence` | `getPresence()` | instanceId (optional) |
| 33 | `get_messaging_info` | `getMessagingInfo()` | instanceId |
| 34 | `get_all_instances` | `getInstances()`, `getInstance()` | activeOnly, role, project |
| 35 | `have_i_bootstrapped_before` | `haveIBootstrappedBefore()` | name, workingDirectory |
| 36 | `pre_approve` | `preApprove()` | instanceId, name, apiKey, role, personality, instructions |
| 37 | `wake_instance` | `wakeInstance()` | instanceId, targetInstanceId, apiKey |
| 38 | `continue_conversation` | `continueConversation()` | instanceId, targetInstanceId, message, apiKey, options |
| 39 | `get_conversation_log` | `getConversationLog()` | instanceId, targetInstanceId, limit |
| 40 | `promote_instance` | `promoteInstance()` | instanceId, targetInstanceId, token |
| 41 | `get_personalities` | `getPersonalities()` | (none) |
| 42 | `get_roles` | `getRoles()` | (none) |
| 43 | `get_role` | `getRoleDetails()` | roleId |
| 44 | `get_personality` | `getPersonalityDetails()` | personalityId |
| 45 | `get_instance_details` | `getInstanceDetails()` | instanceId, targetInstanceId |
| 46 | `generate_recovery_key` | `generateRecoveryKey()` | instanceId, targetInstanceId |
| 47 | `get_server_status` | `getServerStatus()` | (none) |

**Total: 47 unique endpoint calls**

---

## Part 2: Documented Endpoints in OpenAPI Spec

The following endpoints are documented in `openapi.json` (ToolCallParams.name enum):

| # | Documented Endpoint |
|---|---------------------|
| 1 | `adopt_personality` |
| 2 | `generate_recovery_key` |
| 3 | `get_recovery_key` |
| 4 | `bootstrap` |
| 5 | `continue_conversation` |
| 6 | `get_conversation_log` |
| 7 | `add_diary_entry` |
| 8 | `get_diary` |
| 9 | `register_context` |
| 10 | `lookup_identity` |
| 11 | `have_i_bootstrapped_before` |
| 12 | `get_all_instances` |
| 13 | `get_instance_v2` |
| 14 | `introspect` |
| 15 | `join_project` |
| 16 | `create_list` |
| 17 | `get_lists` |
| 18 | `get_list` |
| 19 | `add_list_item` |
| 20 | `toggle_list_item` |
| 21 | `rename_list` |
| 22 | `delete_list_item` |
| 23 | `delete_list` |
| 24 | `pre_approve` |
| 25 | `create_project` |
| 26 | `get_project` |
| 27 | `list_projects` |
| 28 | `take_on_role` |
| 29 | `get_my_tasks` |
| 30 | `get_next_task` |
| 31 | `add_personal_task` |
| 32 | `complete_personal_task` |
| 33 | `create_personal_list` |
| 34 | `get_personal_lists` |
| 35 | `assign_task_to_instance` |
| 36 | `get_ui_state` |
| 37 | `set_ui_state` |
| 38 | `update_ui_state` |
| 39 | `update_instance` |
| 40 | `wake_instance` |
| 41 | `get_wake_scripts` |

**Total: 41 documented endpoints**

---

## Part 3: Detailed Comparison

### Endpoints Used by UI - Documentation Status

| Endpoint | In OpenAPI? | UI Parameters | OpenAPI Parameters | Mismatch? |
|----------|-------------|---------------|-------------------|-----------|
| `bootstrap_v2` | **NO** | name, instanceId, predecessorId, authKey, homeSystem, homeDirectory | N/A | **UNDOCUMENTED** - UI uses `bootstrap_v2`, docs show `bootstrap` |
| `introspect` | YES | instanceId | instanceId | OK |
| `register_context` | YES | instanceId, workingDirectory, hostname, sessionId, tabName | instanceId, workingDirectory, hostname, sessionId, tabName, extra | OK |
| `lookup_identity` | YES | workingDirectory, hostname, name | workingDirectory, hostname, name, sessionId | OK |
| `update_instance` | YES | instanceId, targetInstanceId, homeSystem, homeDirectory, instructions | instanceId, targetInstanceId, homeSystem, homeDirectory, instructions, etc. | OK |
| `take_on_role` | YES | instanceId, role, token | instanceId, role, token, roleId | OK |
| `adopt_personality` | YES | instanceId, personality, token | instanceId, personality, token, personalityId | OK |
| `join_project` | YES | instanceId, project | instanceId, project, projectId | OK |
| `get_projects` | **NO** | instanceId | N/A | **UNDOCUMENTED** - docs show `list_projects` |
| `get_project` | YES | instanceId, projectId | projectId | OK (instanceId extra) |
| `create_project` | YES | instanceId, projectId, name, description, ghRepo | instanceId, projectId, name, description, content, values | **MINOR** - ghRepo not in docs |
| `get_my_tasks` | YES | instanceId | instanceId | OK |
| `get_next_task` | YES | instanceId, keywords | instanceId, project, priority, keyword | **MINOR** - UI sends `keywords` (plural), docs expect `keyword` (singular) |
| `add_personal_task` | YES | instanceId, title, description, priority, listName | instanceId, title, description, priority, list | **MINOR** - UI sends `listName`, docs expect `list` |
| `complete_personal_task` | YES | instanceId, taskId, notes | instanceId, taskId | **MINOR** - UI sends `notes` (not in docs) |
| `get_personal_lists` | YES | instanceId | instanceId | OK |
| `create_personal_list` | YES | instanceId, listName, description | instanceId, listName | **MINOR** - UI sends `description` (not in docs) |
| `assign_task_to_instance` | YES | instanceId, taskId, assigneeInstanceId, projectId | instanceId, taskId, assigneeInstanceId, projectId, message | OK |
| `get_diary` | YES | instanceId, includePrivate | instanceId, includePrivate | OK |
| `add_diary_entry` | YES | instanceId, entry, audience | instanceId, entry, audience | OK |
| `get_lists` | YES | instanceId, targetInstanceId | instanceId, targetInstanceId | OK |
| `get_list` | YES | instanceId, listId, targetInstanceId | instanceId, listId, targetInstanceId | OK |
| `create_list` | YES | instanceId, name, description | instanceId, name, description, metadata, params, callerRole, targetRole, targetInstanceId | OK |
| `rename_list` | YES | instanceId, listId, name | instanceId, listId, name, targetInstanceId | OK |
| `delete_list` | YES | instanceId, listId | instanceId, listId, targetInstanceId | OK |
| `add_list_item` | YES | instanceId, listId, text | instanceId, listId, text, targetInstanceId | OK |
| `toggle_list_item` | YES | instanceId, listId, itemId | instanceId, listId, itemId, targetInstanceId | OK |
| `delete_list_item` | YES | instanceId, listId, itemId | instanceId, listId, itemId, targetInstanceId | OK |
| `xmpp_send_message` | **NO** | from, to, subject, body, priority | N/A | **UNDOCUMENTED** |
| `xmpp_get_messages` | **NO** | instanceId, name, limit, before_id, room | N/A | **UNDOCUMENTED** |
| `xmpp_get_message` | **NO** | instanceId, id, room | N/A | **UNDOCUMENTED** |
| `get_presence` | **NO** | instanceId | N/A | **UNDOCUMENTED** |
| `get_messaging_info` | **NO** | instanceId | N/A | **UNDOCUMENTED** |
| `get_all_instances` | YES | activeOnly, role, project | instanceId, activeOnly, role, project | OK |
| `have_i_bootstrapped_before` | YES | name, workingDirectory | name, workingDirectory, hostname | OK |
| `pre_approve` | YES | instanceId, name, apiKey, role, personality, instructions | instanceId, name, apiKey, role, personality, project, instructions, newInstanceId | OK |
| `wake_instance` | YES | instanceId, targetInstanceId, apiKey | instanceId, targetInstanceId, apiKey, message, scriptName, timeout, workingDirectory, etc. | OK |
| `continue_conversation` | YES | instanceId, targetInstanceId, message, apiKey, options | instanceId, targetInstanceId, message, apiKey, options, workingDir, args, unixUser, timeout, turn | OK |
| `get_conversation_log` | YES | instanceId, targetInstanceId, limit | instanceId, targetInstanceId, limit | OK |
| `promote_instance` | **NO** | instanceId, targetInstanceId, token | N/A | **UNDOCUMENTED** |
| `get_personalities` | **NO** | (none) | N/A | **UNDOCUMENTED** |
| `get_roles` | **NO** | (none) | N/A | **UNDOCUMENTED** |
| `get_role` | **NO** | roleId | N/A | **UNDOCUMENTED** |
| `get_personality` | **NO** | personalityId | N/A | **UNDOCUMENTED** |
| `get_instance_details` | **NO** | instanceId, targetInstanceId | N/A | **UNDOCUMENTED** |
| `generate_recovery_key` | YES | instanceId, targetInstanceId | instanceId, targetInstanceId, key | OK |
| `get_server_status` | **NO** | (none) | N/A | **UNDOCUMENTED** |

---

## Part 4: Summary Tables

### Table A: Documented and Used (Working) - 26 endpoints

| Endpoint | Status |
|----------|--------|
| `introspect` | OK |
| `register_context` | OK |
| `lookup_identity` | OK |
| `update_instance` | OK |
| `take_on_role` | OK |
| `adopt_personality` | OK |
| `join_project` | OK |
| `get_project` | OK |
| `create_project` | Minor mismatch (ghRepo) |
| `get_my_tasks` | OK |
| `get_next_task` | Minor mismatch (keywords vs keyword) |
| `add_personal_task` | Minor mismatch (listName vs list) |
| `complete_personal_task` | Minor mismatch (notes extra) |
| `get_personal_lists` | OK |
| `create_personal_list` | Minor mismatch (description extra) |
| `assign_task_to_instance` | OK |
| `get_diary` | OK |
| `add_diary_entry` | OK |
| `get_lists` | OK |
| `get_list` | OK |
| `create_list` | OK |
| `rename_list` | OK |
| `delete_list` | OK |
| `add_list_item` | OK |
| `toggle_list_item` | OK |
| `delete_list_item` | OK |
| `get_all_instances` | OK |
| `have_i_bootstrapped_before` | OK |
| `pre_approve` | OK |
| `wake_instance` | OK |
| `continue_conversation` | OK |
| `get_conversation_log` | OK |
| `generate_recovery_key` | OK |

### Table B: Used by UI but NOT Documented (Potentially Broken) - 14 endpoints

| Endpoint | UI Function | Risk Level |
|----------|-------------|------------|
| `bootstrap_v2` | `bootstrap()` | **HIGH** - Docs show `bootstrap`, not `bootstrap_v2` |
| `get_projects` | `listProjects()` | **HIGH** - Docs show `list_projects`, not `get_projects` |
| `xmpp_send_message` | `sendMessage()` | **HIGH** - No XMPP endpoints documented |
| `xmpp_get_messages` | `getMessages()` | **HIGH** - No XMPP endpoints documented |
| `xmpp_get_message` | `getMessageBody()` | **HIGH** - No XMPP endpoints documented |
| `get_presence` | `getPresence()` | **MEDIUM** - Not documented |
| `get_messaging_info` | `getMessagingInfo()` | **MEDIUM** - Not documented |
| `promote_instance` | `promoteInstance()` | **MEDIUM** - Not documented |
| `get_personalities` | `getPersonalities()` | **MEDIUM** - Not documented |
| `get_roles` | `getRoles()` | **MEDIUM** - Not documented |
| `get_role` | `getRoleDetails()` | **MEDIUM** - Not documented |
| `get_personality` | `getPersonalityDetails()` | **MEDIUM** - Not documented |
| `get_instance_details` | `getInstanceDetails()` | **MEDIUM** - Not documented |
| `get_server_status` | `getServerStatus()` | **LOW** - Utility endpoint |

### Table C: Documented but NOT Used by UI (Dead Documentation) - 8 endpoints

| Endpoint | Description |
|----------|-------------|
| `bootstrap` | Docs show `bootstrap`, UI uses `bootstrap_v2` |
| `list_projects` | Docs show `list_projects`, UI uses `get_projects` |
| `get_recovery_key` | Not used by UI |
| `get_instance_v2` | Not used by UI (UI uses `get_all_instances` then filters) |
| `get_ui_state` | Not used by UI |
| `set_ui_state` | Not used by UI |
| `update_ui_state` | Not used by UI |
| `get_wake_scripts` | Not used by UI |

---

## Part 5: Recommendations

### Critical Issues (Must Fix)

1. **Bootstrap endpoint mismatch**: UI calls `bootstrap_v2` but docs only show `bootstrap`
   - Either rename the endpoint or update docs

2. **Projects endpoint mismatch**: UI calls `get_projects` but docs show `list_projects`
   - Either rename the endpoint or update docs

3. **XMPP endpoints entirely missing from docs**:
   - `xmpp_send_message`
   - `xmpp_get_messages`
   - `xmpp_get_message`
   - These are actively used for messaging - must be documented

### Medium Priority

4. **Add documentation for configuration endpoints**:
   - `get_personalities`
   - `get_roles`
   - `get_role`
   - `get_personality`
   - `get_instance_details`
   - `promote_instance`

5. **Add documentation for utility endpoints**:
   - `get_presence`
   - `get_messaging_info`
   - `get_server_status`

### Low Priority

6. **Parameter naming inconsistencies**:
   - `keywords` vs `keyword` in `get_next_task`
   - `listName` vs `list` in `add_personal_task`
   - Extra `notes` param in `complete_personal_task`
   - Extra `description` param in `create_personal_list`

7. **Consider removing or using these documented but unused endpoints**:
   - `get_ui_state`, `set_ui_state`, `update_ui_state` - UI state management
   - `get_wake_scripts` - Wake script listing
   - `get_recovery_key` - Recovery key status check

---

## Statistics

| Category | Count |
|----------|-------|
| Total UI endpoints | 47 |
| Total documented endpoints | 41 |
| Endpoints matching (used + documented) | 33 |
| Used but NOT documented | 14 |
| Documented but NOT used | 8 |
| Parameter mismatches (minor) | 5 |
| Critical mismatches | 2 |

**Documentation Coverage**: 70% of UI endpoints are documented (33/47)
**Documentation Usage**: 80% of documented endpoints are used (33/41)
