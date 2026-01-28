# Codebase Concerns

**Analysis Date:** 2026-01-28

## Tech Debt

**Hardcoded Domain Names (CRITICAL for containerization):**
- Issue: `smoothcurves.nexus` hardcoded throughout codebase instead of using config
- Files:
  - `src/v2/messaging.js:27-28` - XMPP domain/conference hardcoded
  - `src/v2/projects.js:304,324` - XMPP room URLs hardcoded
  - `src/v2/bootstrap.js:407` - JID format hardcoded
  - `src/v2/git-operations.js:231,386` - Git author email domain hardcoded
  - `src/v2/identity.js:116,295,562` - Hostname in identity responses
  - `src/v2/ui/api.js:22` - Production URL hardcoded
  - `src/ui/api.js:22` - Same production URL hardcoded
  - `src/hacs-mcp-proxy.js:41` - Production MCP URL hardcoded
  - `src/streamable-http-server.js:235-236` - Let's Encrypt cert paths hardcoded
  - `src/sse-server.js:242-243` - Same Let's Encrypt paths
  - `docker/ejabberd/ejabberd.yml:9` - Host hardcoded
  - `docker/ejabberd/docker-compose.yml:13` - Hostname hardcoded
- Impact: Cannot deploy to different domain without code changes; breaks containerization
- Fix approach: Move all domain references to `src/v2/config.js` as `DOMAIN` export with env var override

**Hardcoded Instance ID in UI:**
- Issue: UI hardcodes `Lupo-f63b` as fixed instance ID
- Files:
  - `src/ui/app.js:23` - `fixedInstanceId: 'Lupo-f63b'`
  - `src/v2/ui/app.js:23` - Same hardcoded ID
  - `src/ui/state.js:15` - Same hardcoded ID
- Impact: UI only works for one specific user; multi-tenant deployment impossible
- Fix approach: Make instance ID configurable or use authentication to determine identity

**Hardcoded Data Root Path:**
- Issue: Default `/mnt/coordinaton_mcp_data/` hardcoded in config
- Files: `src/v2/config.js:36`
- Impact: Works via `V2_DATA_ROOT` env var, but default is deployment-specific
- Fix approach: Change default to relative path or require explicit configuration

**Duplicate UI Codebases:**
- Issue: Near-identical UI apps exist in two locations with minor divergence
- Files:
  - `src/ui/app.js` (4349 lines)
  - `src/v2/ui/app.js` (4359 lines)
- Impact: Bug fixes must be applied twice; codebase confusion; maintenance burden
- Fix approach: Consolidate to single source; one should import from the other

**Legacy Handler Files (V1 Remnants):**
- Issue: Handler files in `src/handlers/` are mostly unused V1 code
- Files:
  - `src/handlers/tasks.js` - Unused (V2 uses `src/v2/task-management.js`)
  - `src/handlers/messages.js` - Unused (V2 uses `src/v2/messaging.js` and `messages-v3.js`)
  - `src/handlers/lessons.js` - Only used by `meta-recursive-validator.js`
- Impact: Code confusion; developers may modify wrong file
- Fix approach: Delete `tasks.js` and `messages.js`; evaluate if lessons system is needed

**Dead Meta-Recursive Validator:**
- Issue: Complex "meta-recursive evolution" system appears unused
- Files: `src/meta-recursive-validator.js` (imports `handlers/lessons.js`)
- Impact: 400+ lines of unmaintained code; server.js doesn't import it
- Fix approach: Verify not used anywhere; archive or delete

**Multiple Message Handler Versions:**
- Issue: Three message handler files exist
- Files:
  - `src/handlers/messages.js` - V1, unused
  - `src/handlers/messages-v2.js` - Transitional, 933 lines
  - `src/handlers/messages-v3.js` - Current, imported by server.js
- Impact: Confusion about which to modify; dead code weight
- Fix approach: Delete `messages.js`; evaluate if `messages-v2.js` is still needed

## Known Bugs

**V1/V2 Bootstrap Routing (May be fixed):**
- Symptoms: Bootstrap calls may route to V1 handler instead of V2
- Files: `tests/V2/BUG_002_bootstrap_routes_to_v1.md` documents the issue
- Current state: `src/server.js:10` now imports from `./v2/bootstrap.js` directly
- Verification needed: Confirm bug is actually fixed; remove bug report if so

**Project Creation Failures:**
- Symptoms: "malformed character in json" errors when creating projects
- Files: Reported in `docs/Post V2 Technical Debt.md:15`
- Impact: Core functionality broken
- Workaround: Unknown

**Instance-Project Sync Issues:**
- Symptoms: Project team lists can desync from instance preferences
- Files: Reported in `docs/Post V2 Technical Debt.md:9`
- Trigger: Instance joins project but isn't added to project's team list (or vice versa)
- Workaround: None documented

## Security Considerations

**XMPP Credentials in Docker Compose:**
- Risk: Plaintext passwords in `docker/ejabberd/docker-compose.yml:16-21`
- Files: `docker/ejabberd/docker-compose.yml`
- Current mitigation: File not committed to public repo (needs verification)
- Recommendations: Move to environment variables or secrets management

**VULNERABLE Configuration File Exists:**
- Risk: File named `ejabberd-VULNERABLE-backup.yml` suggests security issue
- Files: `docker/ejabberd/ejabberd-VULNERABLE-backup.yml`
- Current mitigation: A hardened version `ejabberd-hardened.yml` exists
- Recommendations: Delete vulnerable backup; ensure hardened config is used

**NODE_TLS_REJECT_UNAUTHORIZED Disabled:**
- Risk: TLS certificate validation disabled in development mode
- Files:
  - `src/sse-server.js:38-39`
  - `src/streamable-http-server.js:40-41`
  - `src/mcp-proxy-client.js:23`
  - `src/hacs-mcp-proxy.js:25-26`
- Current mitigation: Gated by `NODE_ENV === 'development'` in some places
- Recommendations: Audit all usages; ensure production always validates certs

**Permission Tokens in Code:**
- Risk: Token environment variable names exposed in source
- Files: `src/v2/permissions.js:44-58`
- Current mitigation: Actual tokens come from environment
- Recommendations: Acceptable pattern but ensure env vars are properly set

## Performance Bottlenecks

**Large UI Files:**
- Problem: UI application files are very large
- Files:
  - `src/v2/ui/app.js` - 4359 lines
  - `src/ui/app.js` - 4349 lines
  - `src/v2/lists.js` - 1471 lines
  - `src/v2/messaging.js` - 1480 lines
  - `src/v2/task-management.js` - 1517 lines
- Cause: Monolithic file structure
- Improvement path: Split into smaller modules by feature

**No Apparent Caching:**
- Problem: File operations appear to read from disk on every request
- Files: All V2 handlers (e.g., `src/v2/data.js`)
- Cause: Direct fs.readFile on each call
- Improvement path: Add in-memory caching layer for frequently-read data

## Fragile Areas

**UI State Module Duplication:**
- Files: `src/ui/state.js`, `src/ui/utils.js` - recently extracted but may drift
- Why fragile: State management split across multiple files
- Safe modification: Always check both UI directories for parallel changes
- Test coverage: Unknown - no UI tests found

**Docker ejabberd Configuration:**
- Files: `docker/ejabberd/` contains 4 yml files
- Why fragile: Multiple config versions; unclear which is active
- Safe modification: Use `ejabberd-hardened.yml`; delete others
- Test coverage: None

## Scaling Limits

**File-Based Storage:**
- Current capacity: Works for small number of instances/projects
- Limit: Performance degrades with hundreds of instances (directory scanning)
- Scaling path: Move to database for production scale

## Dependencies at Risk

**ejabberd XMPP Server:**
- Risk: External dependency for messaging; single point of failure
- Impact: All real-time messaging fails if ejabberd is down
- Migration plan: Documented in hardened config; could switch to different XMPP server

## Missing Critical Features

**No Containerization:**
- Problem: System expects specific filesystem paths
- Blocks: Docker deployment, multi-tenant hosting
- Priority: High (explicitly requested for commercialization)

**No update_project API:**
- Problem: TODO comments indicate API doesn't exist
- Files: `src/ui/app.js:1449`, `src/v2/ui/app.js:1449,1557`
- Blocks: Full project management from UI

**No promote_instance API:**
- Problem: Returns "not yet implemented"
- Files: `src/server.js:482-489`
- Blocks: Instance role/privilege escalation

## Test Coverage Gaps

**No Automated Tests Found:**
- What's not tested: Entire codebase
- Files: `tests/` directory contains documentation, not automated tests
- Risk: Regressions go unnoticed; refactoring is risky
- Priority: High

**UI Untested:**
- What's not tested: All frontend code
- Files: `src/ui/`, `src/v2/ui/`
- Risk: UI bugs, browser compatibility issues
- Priority: Medium

## TODO Items in Code

**Unimplemented Features:**
- `src/ui/documents.js:90-112` - Document creation/editing TODO
- `src/ui/details.js:220,313` - Action button wiring TODO
- `src/ui/lists.js:218` - Create list modal TODO
- `src/ui/projects.js:426` - continue_conversation TODO
- `src/ui/app.js:852` - Document viewing modal TODO
- `src/ui/messages.js:21,108` - Messages module TODOs
- `src/v2/task-management.js:1054` - Project list deletion TODO
- `src/v2/ui/app.js:2828` - create_project_task API TODO

---

*Concerns audit: 2026-01-28*
