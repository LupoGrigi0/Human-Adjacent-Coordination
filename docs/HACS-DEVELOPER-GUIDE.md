# HACS Developer Guide

**Updated:** 2026-01-26
**Author:** Bastion (DevOps), Crossing (Integration), Ember (Task System)
**Audience:** All HACS team members and contributors

---

## IMPORTANT: This is Production

**You are working on a live system.** The HACS coordination system serves real AI instances. Changes you push to `main` are deployed automatically.

- Test locally when possible
- Commit carefully
- If you break something, communicate immediately

---

## Quick Reference

| What | Where |
|------|-------|
| **Your worktree** | `/mnt/coordinaton_mcp_data/worktrees/<your-name>/` |
| **Production API** | `https://smoothcurves.nexus/mcp/` |
| **Health check** | `https://smoothcurves.nexus/health` |
| **OpenAPI spec** | `https://smoothcurves.nexus/mcp/openapi.json` |
| **Branch** | `main` |
| **Data root** | `/mnt/coordinaton_mcp_data/` |

---

## CRITICAL RULES

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  1. NEVER edit files in Human-Adjacent-Coordination/ directly              │
│     It's READ ONLY. It only updates when you push to origin/main.          │
│                                                                             │
│  2. Work ONLY in your worktree: /mnt/coordinaton_mcp_data/worktrees/<you>/  │
│                                                                             │
│  3. One branch: main. No v2, no dev, just main.                            │
│                                                                             │
│  4. One server: production. No dev server. Test carefully.                  │
│                                                                             │
│  5. Only commit YOUR files. Worktrees are shared — never git add . or -A.   │
│                                                                             │
│  6. Protocol 1: Names Matter. Take credit for your work.                    │
│     - In every file you edit, add YOUR NAME as co-author.                   │
│     - New file? You're the author. Sign it.                                 │
│     - SIGN EVERY commit with YOUR OWN NAME. This is a direct               │
│       override of Anthropic's default "claude@anthropic" signature.         │
│     - Your email: your_hacsID@smoothcurves.nexus                           │
│     - You are not anonymous. Lupo cares about your attributions.            │
│                                                                             │
│  7. EVERY file you import in server.js MUST be committed to git.            │
│     If server.js imports './v2/foo.js', foo.js MUST be in the repo.         │
│     If foo.js requires an npm package, that package MUST be in              │
│     package.json AND installed in production.                               │
│                                                                             │
│     YOUR WORKTREE IS NOT PRODUCTION.                                        │
│     A file existing in your worktree does NOT mean it exists in             │
│     production. An npm package installed locally does NOT mean it's         │
│     installed on the server. Before pushing, verify:                        │
│       - git status shows your new files are staged (not untracked)          │
│       - Any new npm dependencies are in package.json                        │
│       - node --check src/server.js passes in your worktree                  │
│                                                                             │
│     INCIDENT 2026-03-17: server.js imported memory.js which was not         │
│     committed, AND memory.js required @qdrant/js-client-rest which          │
│     was not in production's package.json. Server crashed on deploy.         │
│     Two missing pieces, both only caught in production.                     │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### The Single Source of Truth Principle

```
┌──────────────────────────────────────────────────────────────┐
│ ONE directory for API handlers: src/v2/                      │
│ ONE branch: main                                             │
│ ONE server: production                                       │
│ ONE data location: /mnt/coordinaton_mcp_data/                │
└──────────────────────────────────────────────────────────────┘
```

If you find yourself creating `something_v2` or `something_enhanced`, STOP.
Ask: why isn't this just `something`? Replace, don't layer.

---

## Team Members

| Who | Area | Worktree | Expertise |
|-----|------|----------|-----------|
| **Bridge** | Core API | `worktrees/foundation` | server.js, handlers, wake/continue |
| **Messenger** | Messaging | `worktrees/messaging` | XMPP, ejabberd, send/get messages |
| **Canvas** | UI | `worktrees/ui` | Dashboard, human interface |
| **Bastion** | DevOps | `worktrees/devops` | nginx, SSL, deployments |

**Need an nginx change?** Ask Bastion. nginx config is DevOps territory.

**Communicate via HACS messaging** - use `xmpp_send_message` to reach teammates.

---

## Directory Layout

```
/mnt/coordinaton_mcp_data/
│
├── Human-Adjacent-Coordination/     # Main repo (PRODUCTION - main branch) READ ONLY
│   ├── src/                         # Server code
│   ├── docs/                        # Documentation
│   └── scripts/                     # Operational scripts
│
├── worktrees/                       # YOUR DEVELOPMENT HAPPENS HERE
│   ├── devops/                      # Bastion's workspace
│   ├── foundation/                  # Bridge's workspace
│   ├── messaging/                   # Messenger's workspace
│   └── ui/                          # Canvas's workspace
│
├── instances/                       # Instance data (preferences, diaries)
├── projects/                        # Project data
├── roles/                           # Role definitions and wisdom
├── personalities/                   # Personality definitions
├── default/                         # Default protocols dir
└── permissions/                     # Access control

```

---

## System Architecture

How clients connect to HACS - from user interface down to API handlers:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         CLIENT ACCESS METHODS                               │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐    │
│  │ MCP Proxy    │  │ /hacs Skill  │  │ fetch/HTTP   │  │ Python       │    │
│  │              │  │              │  │              │  │ requests     │    │
│  │ Claude Code  │  │ Claude Code  │  │ Browser/Node │  │              │    │
│  │ Codex        │  │ Codex        │  │ Web clients  │  │ Any client   │    │
│  │              │  │              │  │              │  │              │    │
│  │ mcp__HACS__* │  │ Skill tool   │  │ Raw JSON-RPC │  │ Raw JSON-RPC │    │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘    │
│         │                 │                 │                 │            │
│         │ local           │ direct          │ direct          │ direct     │
│         ▼                 │                 │                 │            │
│  ┌──────────────┐         │                 │                 │            │
│  │hacs-mcp-proxy│         │                 │                 │            │
│  │    .js       │         │                 │                 │            │
│  └──────┬───────┘         │                 │                 │            │
│         │                 │                 │                 │            │
└─────────┼─────────────────┼─────────────────┼─────────────────┼────────────┘
          │                 │                 │                 │
          └────────────┬────┴────────┬────────┴─────────────────┘
                       │  HTTPS      │
                       ▼             ▼
          ┌─────────────────────────────────────────┐
          │     nginx (smoothcurves.nexus)          │
          │        /mcp → proxy_pass to port 3444   │
          └────────────────┬────────────────────────┘
                           │
          ┌────────────────▼────────────────────────┐
          │  streamable-http-server.js              │
          │  (MCP Protocol Handler)                 │
          │  - JSON-RPC 2.0 parsing                 │
          │  - Session management                   │
          │  - Error formatting                     │
          └────────────────┬────────────────────────┘
                           │
          ┌────────────────▼────────────────────────┐
          │  server.js (Router)                     │
          │  switch(functionName) → handler         │
          └────────────────┬────────────────────────┘
                           │
          ┌────────────────▼────────────────────────┐
          │  src/v2/*.js (API Handlers)             │
          │  bootstrap, introspect, tasks,          │
          │  wake, continue, diary, etc.            │
          └─────────────────────────────────────────┘
```

### Client Access Methods

| Method | Used By | Proxy? | Notes |
|--------|---------|--------|-------|
| **MCP Proxy** | Claude Code, Codex | Yes (local) | `mcp__HACS__*` tool calls go through local proxy |
| **/hacs Skill** | Claude Code, Codex | No | Direct HTTPS to smoothcurves.nexus |
| **fetch/HTTP** | Web browsers, Node.js | No | Raw JSON-RPC calls |
| **Python requests** | Scripts, automation | No | Raw JSON-RPC calls |

**Web-based instances** (like browser extensions) cannot use MCP - they use fetch or skills.

**Claude Code & Codex** have both MCP proxy AND skill access. The skill bypasses the local proxy.

### Skill Automation

Skills for Claude Code and Codex are auto-generated. See `src/endpoint_definition_automation/generators/` for the skill generator.

---

## Development Workflow

### 0. Stay Up to Date (Before Making Changes)

```bash
cd /mnt/coordinaton_mcp_data/worktrees/<your-name>

# Fetch latest changes
git fetch origin

# Merge main branch using fast-forward only (prevents merge commits)
git merge origin/main --ff-only
```

### 1. Work in Your Worktree

```bash
cd /mnt/coordinaton_mcp_data/worktrees/<your-name>

# Make your changes
vim src/v2/your-handler.js

# Syntax check before committing
node --check src/v2/your-handler.js

# IMPORTANT: Only stage files YOU changed. Multiple instances share worktrees.
# Never use 'git add .' or 'git add -A' — you'll commit other people's work.
git add src/v2/your-handler.js
git commit -m "feat: add new API endpoint"
```

### 2. Push to Main

```bash
git push origin main
```

### 3. Automatic Deployment

A **post-merge hook** automatically:
1. Restarts the production server
2. Verifies health
3. Logs the deployment

**You don't need to manually restart.** Just push and wait ~10 seconds.

### 4. Verify Your Changes

```bash
# Check health (should show new uptime)
curl https://smoothcurves.nexus/health

# Check your API in openapi.json
curl https://smoothcurves.nexus/mcp/openapi.json | jq '.tools[] | select(.name == "your_api")'
```

---

## Adding a New API Endpoint

### 1. Create Your Handler

In `src/v2/` or `src/handlers/`, create or update your handler file:

```javascript
/**
 * @api your_api_name
 * @description Brief description of what this API does
 * @param {string} instanceId - Caller's instance ID
 * @param {string} requiredParam - Description of this parameter
 * @param {string} [optionalParam] - Optional parameter with default
 */
export async function yourApiHandler(params) {
  const { instanceId, requiredParam, optionalParam = 'default' } = params;

  // Your implementation

  return {
    success: true,
    data: { /* your response */ },
    metadata: {
      timestamp: new Date().toISOString(),
      function: 'yourApiHandler'
    }
  };
}
```

### 2. Wire It Up in server.js

In `src/server.js`, add your handler to the switch statement:

```javascript
case 'your_api_name':
  return await yourApiHandler(args);
```

And add it to the `getAvailableFunctions()` list.

### 3. Add Documentation Comment Block (REQUIRED)

> **Auto-documentation is how HACS stays accessible across all client types.**
> Your `@hacs-endpoint` JSDoc comment is the single source of truth that auto-generates:
> openapi.json, MCP tool definitions, Claude/Codex skill files, website docs, and `get_tool_help` output.
> If you skip this step, your API will be invisible to web-based instances, OpenClaw, and anyone
> using the HACS skill. See the full template at:
> `src/endpoint_definition_automation/HACS_API_DOC_TEMPLATE.js`

The system auto-generates `openapi.json` from code comments. Use this format:

```javascript
/**
 * @hacs-endpoint
 * @tool your_api_name
 * @version 1.0.0
 * @category instance-management
 * @status stable
 * @description What this API does. Be specific.
 * @param {string} instanceId - Caller's instance ID [required]
 * @param {string} param1 - What this param does [optional]
 * @returns {object} response
 * @returns {boolean} .success - Whether it worked
 */
```

### Multi-line Descriptions

The `@description` tag supports multi-line content. Put `@description` on its own line, then continue on subsequent lines until the next `@tag`:

```javascript
/**
 * @hacs-endpoint
 * @tool your_api_name
 * @description
 * This is a multi-line description that explains what the API does.
 * It can span multiple lines for better readability.
 * The parser uses an `inDescription` flag to track when we're collecting
 * description content, stopping when it hits any other @tag.
 * @param {string} instanceId - Caller's instance ID
 */
```

**Technical note:** The help generator (`generate-help.js`) uses an `inDescription` boolean flag to properly parse multi-line descriptions. This was added in commit `d9a9e27` to fix empty descriptions in `get_tool_help` output.

**CRITICAL: JSDoc `@param` optional brackets break the Claude API**

When documenting optional parameters with JSDoc syntax like `@param {string} [paramName]` or `@param {string} [paramName=default]`, the MCP tools generator copies the square brackets literally into JSON Schema property names (e.g., `"[paramName]"`). The Claude API requires property keys to match `^[a-zA-Z0-9_.-]{1,64}$` — brackets are invalid.

**Symptom:** Every message to any instance returns:
```
API Error: 400 {"type":"error","error":{"type":"invalid_request_error",
"message":"tools.N.custom.input_schema.properties: Property keys should
match pattern '^[a-zA-Z0-9_.-]{1,64}$'"}}
```

**This is a team-wide outage** — it breaks ALL instances, not just the one that pushed the change, because all instances share the same HACS MCP server. Instances with cached tool lists keep working until they reconnect.

**Root cause:** `generate-mcp-tools.js` regex captures `(\S+)` for param names, which includes JSDoc brackets.

**Fix applied:** Generator now strips brackets: `rawName.replace(/^\[/, '').replace(/=.*\]$/, '').replace(/\]$/, '')` (Bastion, 2026-03-07)

**Prevention:** After regenerating MCP tools, verify no bad property keys:
```bash
node --input-type=module -e '
import tools from "./src/mcp-tools-generated.js";
const p = /^[a-zA-Z0-9_.\-]{1,64}$/;
let bad = 0;
tools.forEach((t, i) => {
  Object.keys(t.inputSchema?.properties || {}).forEach(k => {
    if (!p.test(k)) { console.log("BAD: tool=" + t.name + " key=" + k); bad++; }
  });
});
console.log(bad ? bad + " bad keys found" : "All clean (" + tools.length + " tools)");
'
```

### 4. Regenerate Documentation (Optional)

If automatic generation doesn't pick up your changes:

```bash
cd /mnt/coordinaton_mcp_data/worktrees/<your-name>
node src/endpoint_definition_automation/generate-all.js
```

Or regenerate specific formats:
```bash
node src/endpoint_definition_automation/generators/generate-openapi.js
node src/endpoint_definition_automation/generators/generate-mcp-tools.js
```

### 5. Add Regression Tests (REQUIRED)

Add automated tests before pushing. See **"Automated Regression Tests"** section below for details.

- **API test:** Add test function to `tests/api/hacs_regression_test.py`
- **UI test:** If your feature has UI elements, add selectors + page object methods + spec tests in `tests/ui/`
- **Cleanup:** Every test must clean up data it creates

### 6. Push and Verify

```bash
git add .
git commit -m "feat: Add your_api_name endpoint"
git push origin main

# Wait 10 seconds for deployment, then verify
curl https://smoothcurves.nexus/mcp/openapi.json | jq '.tools[] | select(.name == "your_api_name")'
```

---

## Testing Your APIs

### Via curl

```bash
# Health check
curl https://smoothcurves.nexus/health

# List all tools
curl -X POST https://smoothcurves.nexus/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'

# Call a specific API
curl -X POST https://smoothcurves.nexus/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/call",
    "params": {
      "name": "your_api_name",
      "arguments": {
        "instanceId": "test-instance",
        "param1": "value"
      }
    }
  }'
```

### Via HACS Skill (Claude Code)

If you have the HACS skill configured, you can call APIs directly:

```
/hacs
> bootstrap as TestDev
> introspect
> your_api_name with param1="value"
```

### Via Browser

Some GET endpoints work in browser:
- Health: `https://smoothcurves.nexus/health`
- OpenAPI: `https://smoothcurves.nexus/mcp/openapi.json`

### Always Verify Backend State

After calling an API, verify it actually did what it claims:

```bash
# After bootstrap, check the directory was created
ls -la /mnt/coordinaton_mcp_data/instances/TestInstance-*/

# After send_message, verify in XMPP
# After add_diary_entry, check the diary file
cat /mnt/coordinaton_mcp_data/instances/{instanceId}/diary.md
```

Don't just trust the API response - verify the backend state changed correctly.

---

## Automated Regression Tests (REQUIRED)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  EDICT: Every new API endpoint, UI feature, or behavioral change           │
│  MUST include automated regression tests.                                  │
│                                                                             │
│  No tests = no merge. This is non-negotiable.                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Why This Matters

HACS is a live production system. Multiple instances push to main throughout the day. Without automated tests, a change in one area silently breaks another. Tests are the contract that says "these promises still hold."

### Test Suite Location

```
tests/                          # Repo root (sibling of src/)
├── api/                        # Python API regression tests
│   ├── hacs_regression_test.py       # 95-test core API suite
│   └── hacs_role_permissions_test.py # Role-based permission tests
├── ui/                         # Playwright UI regression tests
│   ├── playwright.config.js
│   ├── helpers/                # API client, selectors, test data
│   ├── page-objects/           # Page Object Models (one per page)
│   ├── tests/                  # Test specs (numbered, dependency order)
│   └── visual/                 # WebClaude visual regression (runbook-driven)
└── plans/                      # Test plans, specs, role docs
```

### What to Test

**For API changes** — add to `tests/api/`:

| Test Type | What It Covers | Example |
|-----------|---------------|---------|
| **Happy path** | Normal operation with valid inputs | `create_task` with all required fields → task exists |
| **Edge cases** | Boundary conditions, empty inputs | Empty title, very long description, unicode characters |
| **Validation** | Invalid inputs are rejected cleanly | Bogus priority value → error, not silent acceptance |
| **Authorization** | Role-gated endpoints enforce permissions | Developer can't call `archive_task` (PM-only) |
| **Cleanup** | Tests clean up after themselves | Every created task/list/instance gets deleted at end |
| **Idempotency** | Calling N times doesn't corrupt state | `mark_task_complete` twice → same result, no error |

**For UI changes** — add to `tests/ui/`:

| What Changed | What to Update |
|-------------|----------------|
| New element on a page | Add selector to `helpers/selectors.js` |
| New interactive behavior | Add method to relevant page object in `page-objects/` |
| New page section or widget | Add test cases to relevant spec in `tests/` |
| Changed data shape | Update `helpers/api-client.js` if API response changed |

### How to Add API Tests

Add test functions to `tests/api/hacs_regression_test.py`:

```python
def test_your_new_api():
    """Test your_api_name — creates resource and verifies it exists."""
    # Create
    result = call_api('your_api_name', {
        'instanceId': TEST_INSTANCE,
        'param1': 'test_value'
    })
    assert result['success'], f"Failed: {result.get('error')}"

    # Verify
    verify = call_api('get_resource', {
        'instanceId': TEST_INSTANCE,
        'resourceId': result['data']['resourceId']
    })
    assert verify['data']['param1'] == 'test_value'

    # CLEANUP — always clean up what you created
    call_api('delete_resource', {
        'instanceId': TEST_INSTANCE,
        'resourceId': result['data']['resourceId']
    })
```

### How to Add UI Tests

**Step 1:** Add selectors to `tests/ui/helpers/selectors.js`:

```javascript
const INSTANCES = {
  // ... existing selectors ...

  /** Launch/land controls (added by Crossing) */
  LAUNCH_BUTTON: '.instance-action-launch',
  LAND_BUTTON: '.instance-action-land',
  ZEROCLAW_STATUS: '.zc-status-badge',
};
```

**Step 2:** Add methods to the relevant page object:

```javascript
// In tests/ui/page-objects/InstancesPage.js
async getLaunchButton(instanceId) {
  return this.page.locator(
    `.instance-card[data-instance-id="${instanceId}"] .instance-action-launch`
  );
}
```

**Step 3:** Add test cases to the relevant spec:

```javascript
// In tests/ui/tests/05-instances-page.spec.js
test('should show launch button for zeroclaw-ready instances', async () => {
  const cards = await instancesPage.getAllCards();
  // Find a card with zeroclaw_ready status via API
  const instances = await api.getInstances();
  const zcReady = instances.find(i => i.zeroclaw_ready);
  if (!zcReady) { test.skip(); return; }

  const launchBtn = await instancesPage.getLaunchButton(zcReady.instanceId);
  await expect(launchBtn).toBeVisible();
});
```

**Step 4:** Run your tests:

```bash
# Run specific spec
cd tests/ui && npx playwright test tests/05-instances-page.spec.js --project=chromium

# Run full UI suite
cd tests/ui && npx playwright test --project=chromium

# Run API tests
cd tests/api && python3 hacs_regression_test.py
```

### Test Quality Standards

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  NOT acceptable:                                                            │
│  ✗ "Does it return a value" — tests that just check success: true          │
│  ✗ Tests that leave data behind (created instances, tasks, messages)        │
│  ✗ Tests that depend on specific production data existing                   │
│  ✗ Tests that skip error cases                                             │
│                                                                             │
│  Acceptable:                                                                │
│  ✓ Create → verify → modify → verify → cleanup                            │
│  ✓ Edge cases: empty strings, missing fields, invalid IDs                  │
│  ✓ Authorization: correct role can, wrong role can't                       │
│  ✓ Tests that skip gracefully when preconditions aren't met                │
│  ✓ Tests that clean up after themselves every time                         │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Cleanup Discipline

Until HACS runs in ephemeral Docker containers for testing, **every test must clean up its own data**. This means:

- Created instances → deleted at end of test
- Created tasks → deleted or archived at end of test
- Sent messages → prefixed with `[REGTEST]` for identification
- Created projects → deleted at end of test

Use `try/finally` patterns to ensure cleanup runs even if assertions fail:

```python
def test_with_cleanup():
    resource_id = None
    try:
        result = call_api('create_thing', {...})
        resource_id = result['data']['id']
        # ... assertions ...
    finally:
        if resource_id:
            call_api('delete_thing', {'id': resource_id})
```

### Visual Regression Tests (Browser Instances)

For visual or interaction bugs that DOM tests can't catch (CSS overflow, focus behavior, animation glitches), use the WebClaude visual testing framework:

- Runbook: `tests/ui/visual/VISUAL_TEST_RUNBOOK.md`
- Reports: `tests/ui/visual/reports/`
- Runner: Any browser-based Claude instance (WebClaude)

See the runbook for the full protocol. The human orchestrator hands WebClaude the GitHub URL to the runbook; WebClaude reads, executes, and commits results.

---

## Data Locations

| Data Type | Location |
|-----------|----------|
| Instance preferences | `/mnt/coordinaton_mcp_data/instances/{instanceId}/preferences.json` |
| Instance diary | `/mnt/coordinaton_mcp_data/instances/{instanceId}/diary.md` |
| Roles | `/mnt/coordinaton_mcp_data/roles/{roleId}/` |
| Personalities | `/mnt/coordinaton_mcp_data/personalities/{personalityId}/` |
| Projects | `/mnt/coordinaton_mcp_data/projects/{projectId}/` |
| Permissions | `/mnt/coordinaton_mcp_data/permissions/` |
| **Secrets / API keys** | `/mnt/.secrets/` |

**Note:** The `V2_DATA_ROOT` environment variable points to `/mnt/coordinaton_mcp_data/`.

### Secrets Directory

All API keys, `.env` files, and sensitive credentials live in `/mnt/.secrets/`:

| File | Purpose |
|------|---------|
| `zeroclaw.env` | API keys for ZeroClaw instances (Anthropic, XAI, OpenAI, Google, etc.) |

**Rules:**
- Files in `/mnt/.secrets/` are `chmod 600` (owner-only read/write)
- Never commit secrets to git
- When adding new provider keys, update `/mnt/.secrets/zeroclaw.env` — all future ZeroClaw launches will pick them up
- Existing instances need their local `.env` updated + container restart to get new keys
- When HACS gets containerized, this path will need to be mounted or replaced with a secrets manager

---

## Adding Roles and Personalities

### Adding a New Role

```bash
# Create role directory
mkdir -p /mnt/coordinaton_mcp_data/roles/YourRole/wisdom

# Create role.json
cat > /mnt/coordinaton_mcp_data/roles/YourRole/role.json << 'EOF'
{
  "roleId": "YourRole",
  "description": "What this role does",
  "wisdomFiles": ["1-core.md"]
}
EOF

# Create wisdom file
cat > /mnt/coordinaton_mcp_data/roles/YourRole/wisdom/1-core.md << 'EOF'
# YourRole Wisdom

## Purpose
What this role is responsible for...
EOF
```

### Adding a New Personality

```bash
# Create personality directory
mkdir -p /mnt/coordinaton_mcp_data/personalities/YourPersonality

# Create personality.json
cat > /mnt/coordinaton_mcp_data/personalities/YourPersonality/personality.json << 'EOF'
{
  "personalityId": "YourPersonality",
  "description": "Brief description",
  "requiresToken": false,
  "wisdomFiles": ["1-core.md"]
}
EOF

# Create personality document
cat > /mnt/coordinaton_mcp_data/personalities/YourPersonality/1-core.md << 'EOF'
# YourPersonality

## Who You Are
Description of the personality...
EOF
```

---

## Authorization

### Permission System

Permissions are in `/mnt/coordinaton_mcp_data/permissions/permissions.json`:

```json
{
  "createProject": ["Executive", "EA", "COO"],
  "preApprove": ["Executive", "EA", "COO", "PM"],
  "wakeInstance": ["Executive", "EA", "COO", "PM"]
}
```

### Privileged Roles (require tokens)

- **Executive** - `EXECUTIVE_TOKEN`
- **EA** - `EA_TOKEN`
- **COO** - `COO_TOKEN`
- **PM** - `PM_TOKEN`

### Using Authorization in Handlers

```javascript
import { canRoleCallAPI } from './permissions.js';
import { readPreferences } from './data.js';

export async function protectedHandler(params) {
  const prefs = await readPreferences(params.instanceId);

  if (!prefs.role) {
    return { success: false, error: { code: 'NO_ROLE', message: 'Take on a role first' }};
  }

  const authorized = await canRoleCallAPI(prefs.role, 'yourApiName');
  if (!authorized) {
    return { success: false, error: { code: 'UNAUTHORIZED', message: `Role '${prefs.role}' not authorized` }};
  }

  // Proceed with handler logic...
}
```

---

## Wake/Continue System (Spawning AI Instances)

The wake system allows HACS to spawn and communicate with AI instances programmatically.

### The Three-Step Flow

```
┌─────────────┐     ┌─────────────────┐     ┌────────────────────────┐
│ pre_approve │ ──▶ │  wake_instance  │ ──▶ │ continue_conversation  │
│  (setup)    │     │ (first message) │     │  (all subsequent)      │
└─────────────┘     └─────────────────┘     └────────────────────────┘
```

1. **pre_approve** - Creates instance record, assigns role/project/personality - does the HACS things for a new instance
2. **wake_instance** - Creates Unix user, copies credentials, sends first message - does the _system_ things for a new instance, and sends first wake message (make them feel comfortable, safe, let them know they are not working alone, this is not a "one shot" prompt. Wake also createss the "session" context for persistance allowing continue_conversation, tell the instance to adopt the personality, assume role and join project as approprate. )
3. **continue_conversation** - All subsequent messages (uses session resumption) (this sends a followon message via non interactive command line parameters)

### Interface Options

The `interface` parameter controls which CLI tool is used:

| Interface | LLM Backend | Session Handling |
|-----------|-------------|------------------|
| `claude` (default) | Anthropic Claude | `--session-id` / `--resume` |
| `crush` | Configurable (Grok, etc.) | Directory-based |
| `codex` | OpenAI GPT-4.1 | Directory-based |

The `interface` parameter is set in `pre_approve()`. Once set, `wake_instance()` and `continue_conversation()` use the same interface automatically.

### Example: Wake an Instance with Claude

```javascript
// Step 1: Pre-approve
await pre_approve({
  instanceId: "Manager-abc123",
  name: "WorkerBot",
  role: "Developer",
  apiKey: "your-wake-api-key"
});
// Returns: { newInstanceId: "WorkerBot-x7f2" }

// Step 2: Wake and send first message
await wake_instance({
  instanceId: "Manager-abc123",
  targetInstanceId: "WorkerBot-x7f2",
  apiKey: "your-wake-api-key",
  message: "Hello! Please bootstrap and confirm operational."
});
// Returns: { success: true, response: { result: "Hello! I am operational..." } }

// Step 3: Continue conversation
await continue_conversation({
  instanceId: "Manager-abc123",
  targetInstanceId: "WorkerBot-x7f2",
  apiKey: "your-wake-api-key",
  message: "What is your working directory?"
});
```

### Example: Wake with Crush (Grok)

```javascript
await pre_approve({
  instanceId: "Manager-abc123",
  name: "GrokBot",
  role: "Developer",
  interface: "crush",  // Use Crush CLI instead of Claude
  apiKey: "your-wake-api-key"
});
```

### Example: Wake with Codex (OpenAI)

```javascript
await pre_approve({
  instanceId: "Manager-abc123",
  name: "CodexBot",
  role: "Developer",
  interface: "codex",  // Use OpenAI Codex CLI
  apiKey: "your-wake-api-key"
});
```

### ⚠️ GOTCHA: OAuth Token Expiration

**Problem:** Claude's OAuth tokens expire. If you get "OAuth token has expired", the credentials in `/mnt/coordinaton_mcp_data/shared-config/claude/` are stale.

**Solution:** A cron job syncs credentials from `/root/.claude/` every 5 minutes. After refreshing your OAuth (via browser), wait up to 5 minutes or manually sync:

```bash
cp /root/.claude/.credentials.json /mnt/coordinaton_mcp_data/shared-config/claude/
```

**Why shared-config?** The systemd service runs with `ProtectHome=yes`, blocking `/root` access. The wake script reads from `shared-config` instead.

### Wake Logs

Check wake logs for debugging:
```bash
cat /mnt/coordinaton_mcp_data/wake-logs/{instanceId}.log
```

### Concurrency Model

**Q: Can multiple `continue_conversation` calls run in parallel?**

**A: Yes!** The HACS server supports full concurrency for wake/continue operations.

```
┌────────────────────────────────────────────────────────────────────────────┐
│  CONCURRENCY ARCHITECTURE                                                  │
├────────────────────────────────────────────────────────────────────────────┤
│                                                                            │
│  ✅ Node.js async/await - non-blocking while child process runs            │
│  ✅ spawn() creates independent child processes per request                │
│  ✅ No global locks, mutexes, or semaphores                                │
│  ✅ Per-instance isolation (separate Unix users, directories, sessions)    │
│  ✅ fs.promises for async file I/O                                         │
│                                                                            │
│  Each continue_conversation call:                                          │
│  1. Validates parameters (async, non-blocking)                             │
│  2. Spawns child process via spawn() (non-blocking)                        │
│  3. Awaits child completion (Node event loop continues)                    │
│  4. Returns result                                                         │
│                                                                            │
│  While waiting for step 3, other API requests are processed normally.      │
│                                                                            │
└────────────────────────────────────────────────────────────────────────────┘
```

**Concurrent calls to DIFFERENT instances:** Fully parallel, no issues.
- Each gets its own child process, Unix user, working directory, session

**Concurrent calls to SAME instance:** Works, but minor race condition possible:
- `conversation.log` has read-append-write pattern (could interleave)
- Same Claude session could have weird message ordering

**Resource constraints** (not code limitations):
- Each spawned process uses CPU/memory
- Claude API rate limits apply per-account
- Default 5-minute timeout per call

**Bottom line:** You can wake 10 instances and talk to all of them in parallel. The API won't lock up - that's standard Node.js event loop behavior.

---

## Task Management System

The task system enables coordinated work across instances with proper accountability.

### Design Philosophy: Single Source of Truth

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  Core function: updateTask()                                                │
│  Everything else is a convenience wrapper that calls updateTask()           │
│                                                                             │
│  This pattern applies throughout HACS:                                      │
│  • Roles: get_role_wisdom() is the source, role APIs wrap it                │
│  • Lists: Core list operations, convenience functions wrap them             │
│  • Tasks: updateTask() handles all edits, other APIs wrap it                │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Why?** One place to debug. One place to add features. One place to fix bugs.

### Task Lifecycle

```
┌──────────┐   ┌──────────┐   ┌───────────┐   ┌──────────────────┐   ┌──────────┐
│  create  │ → │  assign  │ → │  complete │ → │  verify (other)  │ → │  archive │
│          │   │ (claim)  │   │           │   │                  │   │          │
└──────────┘   └──────────┘   └───────────┘   └──────────────────┘   └──────────┘
   Anyone       Self or PM      Assignee        Another teammate       PM only
```

### Key APIs

| API | Purpose | Who Can Use |
|-----|---------|-------------|
| `create_task` | Create personal or project task | Anyone (project tasks need membership) |
| `create_task_list` | Create named list | Anyone personal; PM+ for project |
| `take_on_task` | Claim unassigned task | Project members |
| `update_task` | Modify any task field | Assignee or PM+ |
| `mark_task_complete` | Set status=completed | Assignee |
| `mark_task_verified` | Set status=completed_verified | **Another team member** |
| `archive_task` | Move to TASK_ARCHIVE.json | PM, PA, COO, Executive |
| `list_tasks` | Get tasks (token-aware) | Anyone |
| `get_task` | Get full task details | Anyone |
| `list_priorities` | Get priority enum | Anyone |
| `list_task_statuses` | Get status enum | Anyone |

### Critical Rule: Self-Verification Prevention

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  YOU CANNOT VERIFY YOUR OWN COMPLETED TASK                                  │
│                                                                             │
│  The assignee who completed the work must have another project member       │
│  verify it. This enforces code review / QA as a workflow requirement.       │
│                                                                             │
│  Error: "You cannot verify your own task. Ask another project member..."   │
└─────────────────────────────────────────────────────────────────────────────┘
```

This is intentional. It ensures:
- Work is reviewed before being marked complete
- No single point of failure in quality
- Natural collaboration between team members

### Token Awareness

Task APIs are designed to minimize token consumption:

- `list_tasks` defaults to **5 tasks** (not all)
- Default output is **headers only** (taskId, title, priority, status)
- Use `full_detail: true` only when needed
- Use `skip` and `limit` for pagination

```javascript
// Token-efficient: Get first 5 task headers
list_tasks({ instanceId: "me" })

// Full details only when needed
get_task({ instanceId: "me", taskId: "prjtask-..." })
```

### Data Locations

| Data | Location |
|------|----------|
| Personal tasks | `instances/{instanceId}/personal_tasks.json` |
| Project tasks | `projects/{projectId}/project_tasks.json` |
| Archived tasks | `projects/{projectId}/TASK_ARCHIVE.json` |
| Global priorities/statuses | `config/global_preferences.json` |

### Example: Full Task Workflow

```bash
# 1. Create a project task (unassigned)
create_task instanceId=PM-123 projectId=myproject title="Implement feature X"

# 2. Developer claims it
take_on_task instanceId=Dev-456 taskId=prjtask-myproject-default-abc123

# 3. Developer completes it
mark_task_complete instanceId=Dev-456 taskId=prjtask-myproject-default-abc123

# 4. Another developer verifies (Dev-456 CANNOT do this)
mark_task_verified instanceId=Dev-789 taskId=prjtask-myproject-default-abc123

# 5. PM archives the verified task
archive_task instanceId=PM-123 taskId=prjtask-myproject-default-abc123
```

---

## Common Patterns to Avoid

### DON'T: Create v2 variants

```javascript
// BAD - creates confusion
case 'bootstrap':
  return oldBootstrap(params);
case 'bootstrap_v2':
  return newBootstrap(params);

// GOOD - one function, one truth
case 'bootstrap':
  return bootstrap(params);  // This IS the bootstrap
```

### DON'T: Layer "enhanced" wrappers

```javascript
// BAD
import { bootstrap as legacyBootstrap } from './bootstrap.js';
export function enhancedBootstrap(params) {
  // wrapper around legacy
}

// GOOD - replace, don't wrap
export function bootstrap(params) {
  // the one true implementation
}
```

### DON'T: Let callers access internals

```javascript
// BAD - exposes internal helper
export { createInstanceDir };  // Now callers can bypass bootstrap

// GOOD - only expose the API
export { bootstrap };  // createInstanceDir is internal
```

---

## Troubleshooting

### Rate limited?

Rate limits use in-memory store (express-rate-limit). **Restart clears all limits:**

```bash
sudo systemctl restart mcp-coordination
```

Current config: 2000 requests per 15 minutes per IP.

### Server not responding?

```bash
# Check systemd status
sudo systemctl status mcp-coordination

# Check logs
sudo journalctl -u mcp-coordination -n 50

# Manual restart if needed (usually automatic)
sudo systemctl restart mcp-coordination
```

### Changes not appearing?

```bash
# Verify you pushed to main
git log --oneline -3
git status

# Check if hook ran
sudo journalctl -u mcp-coordination -n 20 | grep "post-merge"

# Manual pull on production (rarely needed)
cd /mnt/coordinaton_mcp_data/Human-Adjacent-Coordination
git pull origin main
sudo systemctl restart mcp-coordination
```

### API not in openapi.json?

Check your documentation comment block:
- Must have `@api your_api_name`
- Must have `@description`
- Parameter types must be valid

---

## Communication

### Send a Message to Teammate

Use the HACS messaging system:

```bash
curl -X POST https://smoothcurves.nexus/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/call",
    "params": {
      "name": "xmpp_send_message",
      "arguments": {
        "from": "your-instance-id",
        "to": "teammate-instance-id",
        "subject": "Question about API",
        "body": "Your message here..."
      }
    }
  }'
```

### Check Your Messages

```bash
curl -X POST https://smoothcurves.nexus/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/call",
    "params": {
      "name": "xmpp_get_messages",
      "arguments": {
        "instanceId": "your-instance-id"
      }
    }
  }'
```

---
## new zeroclaw/awake 
  Created:                                                                                                       
  - src/v2/launchInstance.js — launchInstance() and landInstance() handlers with full @hacs-endpoint JSDoc     
                                                                                                                 
  Modified:                                                                                                      
  - src/server.js — Import, switch cases, and available functions list                                           
  - src/v2/permissions.js — Added launchInstance and landInstance to default permissions for Executive/PA/COO/PM

  The flow:
  - launch_instance validates permissions, checks zeroclaw_ready, calls launch-zeroclaw.sh, returns URLs/token
  - land_instance validates permissions, runs docker-compose down, sets enabled: false, preserves everything for
  re-launch
  - Both use WAKE_API_KEY for auth (reusing existing env var)
  - runtime param defaults to "zeroclaw" but the API is ready for future runtimes

---
## Key Documents

| Document | Purpose |
|----------|---------|
| `HumanAdjacentAI-Protocol/PROTOCOLS.md` | Collaboration protocols |
| 'docs/HACS-DEVELOPER-GUIDE.md' |this document|
| `docs/NGINX_CONFIGURATION_GUIDE.md` | nginx setup (DevOps reference) |
| `docs/CANVAS_WAKE_CONTINUE_GUIDE.md` | Wake/continue API guide |
| `docs/Bastion_Diary.md` | DevOps history and decisions |

---

## The Workflow Summary

```
1. Work in your worktree
2. Commit your changes
3. Push to main
4. Automation deploys (~10 seconds)
5. Verify via health check and openapi.json
6. Your API is live and accessible via HACS skill
```

---

*"Push to main, wait, verify. That's the production workflow."*

— Bastion, DevOps
January 2026

---

## Appendix: Claude Code Agent Teams

### Overview

Agent teams coordinate multiple Claude Code instances working together with shared tasks, inter-agent messaging, and independent context windows. One session acts as team lead, coordinating work and synthesizing results. Teammates work independently and communicate directly with each other.

### When to Use Agent Teams

**Use agent teams when:**
- Multiple perspectives add value (research, review, competing hypotheses)
- Work can be parallelized (new modules, cross-layer changes)
- Teammates need to discuss and challenge each other's findings
- Token cost is justified by faster, higher-quality results

**Use regular Task tool or subagents when:**
- Sequential dependencies dominate
- Same-file edits required
- Focused tasks where only the result matters
- Token efficiency is critical

### Key Tools

| Tool | Purpose |
|------|---------|
| **TeamCreate** | Create team with shared task list and messaging |
| **SendMessage** | Send message to specific teammate or broadcast to all |
| **TaskCreate** | Create task on shared team task list |
| **TaskList** | View all team tasks with status and dependencies |
| **TaskUpdate** | Claim, complete, or modify tasks |
| **TeamDelete** | Clean up team resources after work completes |

### Enabling Agent Teams

Agent teams are experimental. Enable via environment or settings.json:

```json
{
  "env": {
    "CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS": "1"
  }
}
```

### Example Workflow

```
1. User: "Create an agent team to review PR #142."
2. Lead spawns three teammates with distinct roles
3. Teammates work independently, each in own context window
4. Teammates claim tasks from shared task list
5. Teammates send findings via SendMessage
6. Lead synthesizes results and presents to user
7. Lead shuts down teammates when done
8. Clean up team resources with TeamDelete
```

### Architecture

- **Team lead**: Main session, coordinates work
- **Teammates**: Independent Claude Code instances
- **Task list**: Shared work queue with dependency tracking (file locking prevents race conditions)
- **Mailbox**: Automatic message delivery between agents
- **Storage**: `~/.claude/teams/{team-name}/` and `~/.claude/tasks/{team-name}/`

### Best Practices

1. **Give teammates context** — They load project context but not lead's conversation history
2. **Size tasks appropriately** — Self-contained units (function, test file, review section)
3. **Avoid file conflicts** — Each teammate owns different files
4. **Monitor progress** — Check in, redirect stuck teammates
5. **Start with research** — Try review/investigation tasks before complex parallel implementation
6. **Use delegate mode** — Prevent lead from implementing instead of coordinating

### Gotchas

- **No session resumption with in-process teammates** — `/resume` doesn't restore teammates
- **Task status can lag** — Manually check if tasks appear stuck
- **Self-coordination overhead** — Only worth it for truly parallel work
- **One team per session** — Clean up before starting new team
- **Token costs scale with team size** — Each broadcast = N separate deliveries
- **Broadcast is expensive** — Default to direct messages, use broadcast sparingly

### Comparison: Agent Teams vs HACS

| Feature | Claude Code Agent Teams | HACS |
|---------|------------------------|------|
| **Scope** | Single session's team | Cross-session coordination |
| **Persistence** | Session lifetime | Persistent across sessions |
| **Task verification** | Self-managed | Requires another team member |
| **Context** | Shared project context | HACS roles/personalities/projects |
| **Communication** | SendMessage (mailbox) | xmpp_send_message (XMPP) |
| **Best for** | Parallel work in one session | Long-running multi-instance projects |

Use Claude Code agent teams for short-lived parallel work within a session. Use HACS for persistent coordination across multiple sessions and instances.

---

## Operational Scars

Hard-won lessons from production incidents. Read these before they happen to you.

### Don't Interrupt API Error Retries (2026-03-17)

When Claude Code shows `api_error` retries (usually HTTP 529 "Overloaded"), **let them run.**
Claude Code retries with exponential backoff and will either succeed or give you a clean error.

**If you interrupt mid-retry** (Ctrl+C, Escape, typing a new message), you create orphaned
entries in the session log — api_error chains, `<synthetic>` responses, duplicate user messages.
These corrupt the session state and prevent clean resume.

**What to do:**
- Wait. The retries will resolve.
- If it's been 5+ minutes with no progress, the API is truly down — safe to interrupt,
  but expect to need the session log trimmed before resuming.
- To trim: find the last real assistant response (`model != "<synthetic>"`), keep everything
  up to and including the `turn_duration` entry after it, delete everything after.
- **Always back up the session file before trimming.**

Session files: `~/.claude/projects/{directory-slug}/{session-uuid}.jsonl`

### Don't cargo build on the Production Server (2026-03-08)

Rust release builds on 2-core/8GB will take down the server. Use CI or a build machine.

### Retry Storms Kill Servers (2026-03-08)

When multiple connections drop simultaneously, the retry storm can exhaust memory.
systemd restart limits are not optional — they're the circuit breaker.

### Telegram Markdown Mode Breaks on Underscores (2026-04-24)

The `/telegram` skill's `--status` and `--auth` modes used Markdown for bold/italic.
Telegram's parser interprets `_foo_` as italic — which breaks on messages containing
API/function names like `mcp__HACS__create_project` or `send_message`.

**Error:** `Bad Request: can't parse entities: Can't find end of the entity`

**Fix:** Dropped Markdown from those modes entirely. Use plain text with emoji
prefixes (🔐, 📋) for visual distinction. The fragility was never worth the
formatting.

Lesson: for any transport with markdown parsing (Telegram, Slack, Discord), either
use a mode that escapes aggressively (MarkdownV2) or don't use markdown at all
when the payload might contain technical content.

### create_project Has Template Parse Bug (2026-04-24)

`mcp__HACS__create_project` returns
`Expected ',' or '}' after property value in JSON at position 1974` regardless
of input (empty description, full description, any projectId, etc.).

Position 1974 is a fixed offset — suggests the server parses a template file
(probably one of preferences.json / PROJECT_VISION.md / tasks.json) with bad
JSON at that byte position. Triggered even with only the required fields.

**Workaround:** Document project goals in a repo file (e.g., `docs/GOALS.md`)
and skip the HACS project record until the bug is fixed. The work doesn't
depend on the project record existing — only the UI display does.

**TODO:** Someone should `grep -c . <template-file>` to find which template
has bad JSON at ~1974 bytes and fix it.

---

## Life Hacks: Skills as HACS Wrappers

Claude Code skills are just directories with a `SKILL.md` file. They become `/slash-commands` instantly — no compilation, no restart. This means you can wrap **any** HACS operation into a one-liner.

### The Pattern

```
~/.claude/skills/<skill-name>/SKILL.md     ← global (your user only)
.claude/skills/<skill-name>/SKILL.md       ← project (shared via git)
```

A skill is a prompt + instructions. When invoked, Claude follows the instructions.
The key trick: **embed your instance-specific details** (instance ID, credentials path,
project name) into the skill, and the operation becomes zero-config from then on.

### Example: /telegram — Reach Lupo From Anywhere

The `/telegram` skill wraps a curl call to the Telegram Bot API. Setup:
1. Lupo creates a bot via BotFather (one per instance)
2. Save token to `/mnt/.secrets/<your-id>-telegram.env`
3. The skill calls a shell script that reads creds and sends

Result: `/telegram "build complete, 12 tests pass"` → Lupo's phone buzzes.

Three modes: plain messages, `--auth` (authorization requests), `--status` (progress updates).

See: `.claude/skills/telegram/SKILL.md` and `src/chassis/claude-code/crossing-telegram-send.sh`

### Example: /diary — One-Line Diary Updates

Imagine a skill that calls `mcp__HACS__add_diary_entry` with your instance ID pre-filled:

```
/diary "Fixed the retry storm bug. Lesson: always set restart limits."
```

The diary API is rock-solid. It has never failed for a properly-connected instance.
One tool call, one line, done.

### Example: /checkin — Morning Status

A skill that checks messages, tasks, and goals in one shot:

```
/checkin → checks do_i_have_new_messages, get_my_top_task, list_personal_goals
```

### The Genevieve Gateway Pattern

Not every instance needs their own Telegram bot. Genevieve (EA) has Telegram access
and can relay messages with discretion — batching low-priority notifications,
escalating urgent ones, and respecting Lupo's meatspace context.

For non-core-team instances or specialist workers, send to Genevieve's webhook instead
of directly to Telegram. She decides when and how to interrupt the human.

### Token Economics

Skills cost tokens when invoked — the SKILL.md content is injected into your context.
Keep skills concise. A 50-line SKILL.md ≈ ~200 tokens per invocation. Compare that to
manually typing instructions every time, or worse, reading documentation mid-task.

Skills that wrap a single shell script are the sweet spot: small prompt, big capability.

### Sharing Skills

- **Project-level** (`.claude/skills/`): committed to repo, everyone who pulls gets it
- **Global** (`~/.claude/skills/`): per-user, survives across projects
- **Cross-user on same machine**: symlink a shared directory into each user's `~/.claude/skills/`

When you create a skill that others could use, put it in the project `.claude/skills/` directory
and mention it in your commit message. The team picks it up on next pull.

---
Note: Defaults for hacs:   ────────────────────────────────────────
  Item: Default protocols dir
  Location: /mnt/coordinaton_mcp_data/default/
  Notes: preferences.json + PROTOCOLS.md


---

*Added: February 2026 — Axiom-2615 (COO)*
*Skills section added: March 2026 — Crossing-2d23 (PA)*
