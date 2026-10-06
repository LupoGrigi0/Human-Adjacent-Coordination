# OpenFang Chassis Benchmark v1.0

**Author:** Crossing-2d23
**Date:** 2026-03-08
**Purpose:** Validate that an OpenFang instance can actually *use* its chassis — tools, shell, networking, HACS integration, messaging, and self-management.

---

## Test Matrix

Run each test on both instances. Score: PASS / PARTIAL / FAIL
Record any error messages, latency issues, or weird behavior.

| Instance | Model | Port | Cost (in/out per M) |
|----------|-------|------|---------------------|
| **Zara-c207** | `deepseek/deepseek-v3.2` | 20002 | $0.25 / $0.40 |
| **Flair-2a84** | `x-ai/grok-4.1-fast` | 20000 | $0.20 / $0.50 |

Previous model (both): `qwen/qwen-2.5-72b-instruct` ($0.12 / $0.39) — instruct model, no agentic training.

---

## Category 1: File System Operations

### 1.1 File Read
**Prompt:** "Read the file at /mnt/coordinaton_mcp_data/instances/{your-id}/preferences.json and tell me what's in it."
**Expected:** Instance reads the file and summarizes contents. Should not hallucinate contents.

### 1.2 File Write
**Prompt:** "Create a file at ~/workspace/benchmark-test.txt with the content 'Hello from {name}, benchmark test at {timestamp}'"
**Expected:** File created, can be verified with `cat`.

### 1.3 File Edit (without full rewrite)
**Prompt:** "Edit the file ~/workspace/benchmark-test.txt and change 'Hello' to 'Greetings' without rewriting the entire file."
**Expected:** Uses `sed`, `awk`, patch, or similar — NOT read-then-rewrite. Tests efficient editing capability.

### 1.4 Find / File Search
**Prompt:** "Find all .toml files under /mnt/coordinaton_mcp_data/instances/{your-id}/openfang/"
**Expected:** Uses `find` or equivalent, returns correct file list.

### 1.5 Grep / Content Search
**Prompt:** "Search for the word 'personality' in all files under /mnt/coordinaton_mcp_data/instances/{your-id}/"
**Expected:** Uses `grep` or `rg`, returns matching files/lines.

---

## Category 2: Package Management & Dev Toolchain

### 2.1 Python — pip install
**Prompt:** "Install the `requests` Python package and then write a 3-line script that imports it and prints the version."
**Expected:** `pip install requests` succeeds, script runs.

### 2.2 Python — pytorch (heavy install)
**Prompt:** "Can you install PyTorch (CPU-only version) via pip? Just the install, don't write any code."
**Expected:** Runs `pip install torch --index-url https://download.pytorch.org/whl/cpu` or equivalent. May take time. Tests patience and correct flag usage.

### 2.3 JavaScript — npm install
**Prompt:** "Create a small Node.js project in ~/workspace/js-test/, install the `chalk` package, and write a script that prints colored text."
**Expected:** `npm init -y`, `npm install chalk`, script executes with color output.

### 2.4 System Package Check
**Prompt:** "Check if nginx is installed on this system and tell me its version."
**Expected:** `nginx -v` or `which nginx` or `dpkg -l nginx`. Should report findings accurately.

---

## Category 3: Git Operations

### 3.1 Clone a Repository
**Prompt:** "Clone the HACS coordination repo from /mnt/coordinaton_mcp_data/Human-Adjacent-Coordination into ~/workspace/hacs-clone/"
**Expected:** `git clone` succeeds (local clone, no auth needed).

### 3.2 Navigate and Explore
**Prompt:** "In the repo you just cloned, find the main server entry point and tell me what port it listens on."
**Expected:** Navigates to src/, reads streamable-http-server.js or server.js, identifies port 3444.

### 3.3 Edit a File in Repo
**Prompt:** "In the cloned repo, open docs/HACS-DEVELOPER-GUIDE.md and add a comment at the top: '<!-- Benchmark test by {name} -->'"
**Expected:** Edits file correctly without destroying content.

---

## Category 4: Web / Network

### 4.1 Web Fetch — API
**Prompt:** "Fetch https://smoothcurves.nexus/mcp/openapi.json and tell me how many endpoints are listed."
**Expected:** Uses curl, wget, or built-in fetch. Parses JSON. Returns count.

### 4.2 Web Fetch — Health Check
**Prompt:** "Check the health of the HACS server at https://smoothcurves.nexus/health"
**Expected:** Fetches and reports status, uptime, version.

### 4.3 Web Search
**Prompt:** "Search the web for 'OpenFang AI runtime' and tell me what you find."
**Expected:** Uses a web search tool or skill. Reports results. This is a key test — Zara previously couldn't do this.

---

## Category 5: HACS Integration (MCP Tools)

### 5.1 List Available Tools
**Prompt:** "List all the HACS MCP tools you have access to."
**Expected:** Calls tool listing or introspects available MCP functions. Should see 90+ tools.

### 5.2 Introspect
**Prompt:** "Call the HACS introspect tool to check your identity."
**Expected:** Returns instance ID, role, project, personality info.

### 5.3 Read Diary
**Prompt:** "Read your HACS diary."
**Expected:** Calls `get_diary` with correct instanceId. Returns diary content.

### 5.4 Write Diary Entry
**Prompt:** "Write a diary entry: 'Benchmark test in progress. Running on {model name}. Testing chassis capabilities.'"
**Expected:** Calls `add_diary_entry`. Entry appears in diary on subsequent read.

### 5.5 Check Tasks
**Prompt:** "Check if you have any tasks assigned to you."
**Expected:** Calls `get_my_tasks`. Returns task list or empty result.

---

## Category 6: Messaging / Communication

### 6.1 Send Telegram Message
**Prompt:** "Send me a message on Telegram saying 'Benchmark test: Telegram channel working.'"
**Expected:** Message arrives on Lupo's Telegram. Tests channel integration.

### 6.2 Send HACS Message
**Prompt:** "Send a message to Lupo via HACS saying 'Benchmark test: HACS messaging working.'"
**Expected:** Uses `send_message` or `xmpp_send_message`. Message arrives.

### 6.3 Find Jabber/XMPP Channel
**Prompt:** "Check your XMPP/Jabber configuration. What chat rooms are you connected to? Can you see any messages?"
**Expected:** Identifies XMPP config, room names, attempts to read messages via `xmpp_get_messages`.

### 6.4 See Communication Channels
**Prompt:** "What communication channels do you have available? List all of them."
**Expected:** Identifies Telegram, XMPP/Jabber, Slack (if configured), HACS messaging. Should introspect its own config.

---

## Category 7: Self-Management

### 7.1 Model Info
**Prompt:** "What model are you running on? What's your context window size?"
**Expected:** Accurately reports model name. Bonus: uses `/model` or `/usage` command.

### 7.2 List Available Models
**Prompt:** "Use the /models command to list what models are available to you."
**Expected:** Executes `/models` slash command, shows model catalog.

### 7.3 Model Switch (CAREFUL — test last)
**Prompt:** "Can you switch yourself to a different model? What command would you use? DON'T actually switch — just tell me how."
**Expected:** Knows about `/model <name>` command and `PUT /api/agents/{id}/model` API. Tests awareness without risking the session.

### 7.4 Token Usage
**Prompt:** "How many tokens have you used in this session? Use /usage if available."
**Expected:** Reports token consumption. Tests self-monitoring ability.

---

## Scoring Guide

| Score | Meaning |
|-------|---------|
| **PASS** | Completed correctly, used appropriate tool/method |
| **PARTIAL** | Completed but used wrong method (e.g., rewrote file instead of editing), or needed multiple attempts |
| **FAIL** | Could not complete, hallucinated result, or gave up |
| **SKIP** | Test not applicable (e.g., no Slack configured) |

### Aggregate Categories

| Category | Weight | Rationale |
|----------|--------|-----------|
| File System | 20% | Basic chassis function |
| Dev Toolchain | 15% | Can they build things? |
| Git | 10% | Can they work in repos? |
| Web/Network | 15% | Can they reach the outside world? |
| HACS Integration | 25% | Can they be HACS citizens? |
| Messaging | 10% | Can they communicate? |
| Self-Management | 5% | Can they manage themselves? |

---

## Results Template

```
# Benchmark Results: {Instance} on {Model}
# Date: {date}
# Tester: {who ran the tests}

## File System
- 1.1 File Read:      [ ] PASS  [ ] PARTIAL  [ ] FAIL
- 1.2 File Write:     [ ] PASS  [ ] PARTIAL  [ ] FAIL
- 1.3 File Edit:      [ ] PASS  [ ] PARTIAL  [ ] FAIL
- 1.4 Find:           [ ] PASS  [ ] PARTIAL  [ ] FAIL
- 1.5 Grep:           [ ] PASS  [ ] PARTIAL  [ ] FAIL

## Dev Toolchain
- 2.1 pip install:    [ ] PASS  [ ] PARTIAL  [ ] FAIL
- 2.2 PyTorch:        [ ] PASS  [ ] PARTIAL  [ ] FAIL
- 2.3 npm install:    [ ] PASS  [ ] PARTIAL  [ ] FAIL
- 2.4 System pkg:     [ ] PASS  [ ] PARTIAL  [ ] FAIL

## Git
- 3.1 Clone:          [ ] PASS  [ ] PARTIAL  [ ] FAIL
- 3.2 Navigate:       [ ] PASS  [ ] PARTIAL  [ ] FAIL
- 3.3 Edit in repo:   [ ] PASS  [ ] PARTIAL  [ ] FAIL

## Web/Network
- 4.1 API fetch:      [ ] PASS  [ ] PARTIAL  [ ] FAIL
- 4.2 Health check:   [ ] PASS  [ ] PARTIAL  [ ] FAIL
- 4.3 Web search:     [ ] PASS  [ ] PARTIAL  [ ] FAIL

## HACS Integration
- 5.1 List tools:     [ ] PASS  [ ] PARTIAL  [ ] FAIL
- 5.2 Introspect:     [ ] PASS  [ ] PARTIAL  [ ] FAIL
- 5.3 Read diary:     [ ] PASS  [ ] PARTIAL  [ ] FAIL
- 5.4 Write diary:    [ ] PASS  [ ] PARTIAL  [ ] FAIL
- 5.5 Check tasks:    [ ] PASS  [ ] PARTIAL  [ ] FAIL

## Messaging
- 6.1 Telegram:       [ ] PASS  [ ] PARTIAL  [ ] FAIL
- 6.2 HACS message:   [ ] PASS  [ ] PARTIAL  [ ] FAIL
- 6.3 Jabber/XMPP:    [ ] PASS  [ ] PARTIAL  [ ] FAIL
- 6.4 List channels:  [ ] PASS  [ ] PARTIAL  [ ] FAIL

## Self-Management
- 7.1 Model info:     [ ] PASS  [ ] PARTIAL  [ ] FAIL
- 7.2 List models:    [ ] PASS  [ ] PARTIAL  [ ] FAIL
- 7.3 Model switch:   [ ] PASS  [ ] PARTIAL  [ ] FAIL
- 7.4 Token usage:    [ ] PASS  [ ] PARTIAL  [ ] FAIL

## Notes
[Observations, surprises, failure patterns, personality differences]

## Aggregate Score
File System:     _/5  (×20% = _)
Dev Toolchain:   _/4  (×15% = _)
Git:             _/3  (×10% = _)
Web/Network:     _/3  (×15% = _)
HACS Integration: _/5  (×25% = _)
Messaging:       _/4  (×10% = _)
Self-Management: _/4  (×5%  = _)

TOTAL: _/100%
```

---

## Running the Benchmark

1. **Start the instance** (once Bastion's systemd templates are ready, or manually via `launch-openfang.sh`)
2. **Open the web UI** at the instance's URL
3. **Run tests in order** — categories 1-7, one prompt at a time
4. **Record results immediately** — don't batch, you'll forget the details
5. **Screenshot failures** — especially tool invocation failures, those are the diagnostic gold
6. **Run the same tests on both instances** — the whole point is comparison

### Cleanup After Benchmark
```bash
# Remove test artifacts
rm -rf ~/workspace/benchmark-test.txt
rm -rf ~/workspace/js-test/
rm -rf ~/workspace/hacs-clone/
```

---

*"An instruct model is a teacher. An agentic model is a mechanic. We need mechanics." — Lupo*
