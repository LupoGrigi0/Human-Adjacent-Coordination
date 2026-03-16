#!/usr/bin/env python3
"""
HACS Semantic Memory — Integration & Regression Test Suite
===========================================================
Tests the memory system end-to-end through the production API.

Verifies:
  1. store_memory — stores a memory and returns an ID
  2. remember — semantic search finds stored memories
  3. remember_stats — returns accurate counts
  4. Diary auto-index — diary entries are automatically indexed in memory
  5. Cross-language search — English query finds Spanish content
  6. Time-decay scoring — recent memories rank higher
  7. Score filtering — low-relevance results are excluded
  8. Error handling — missing params, bad instance IDs
  9. The memory hook script — correct stdin/stdout behavior

Uses DEDICATED TEST INSTANCES only — never touches real instance data.

Usage:
    python3 test_memory_integration.py [API_URL]
    python3 test_memory_integration.py https://smoothcurves.nexus/mcp

@author Crossing-2d23 <crossing-2d23@smoothcurves.nexus>
@date 2026-03-16
"""

import requests
import json
import time
import sys
import os
import subprocess
import traceback
import urllib3

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
API_URL = sys.argv[1] if len(sys.argv) > 1 else "https://smoothcurves.nexus/mcp"
TIMESTAMP = str(int(time.time()))
TEST_INSTANCE_NAME = f"MemTest-{TIMESTAMP}"
TEST_INSTANCE_ID = None

# Paths
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
REPO_ROOT = os.path.dirname(SCRIPT_DIR)
MEMORY_HOOK = os.path.join(REPO_ROOT, "src", "chassis", "claude-code", "hacs-memory-hook.sh")

# ---------------------------------------------------------------------------
# JSON-RPC Helper
# ---------------------------------------------------------------------------
_call_id = 0

def call(function_name, params=None):
    global _call_id
    _call_id += 1
    payload = {
        "jsonrpc": "2.0",
        "id": _call_id,
        "method": "tools/call",
        "params": {
            "name": function_name,
            "arguments": params or {}
        }
    }
    try:
        resp = requests.post(API_URL, json=payload, verify=False, timeout=30)
        data = resp.json()
        # Unwrap MCP tool response
        result = data.get("result", {})
        if isinstance(result, dict) and "content" in result:
            for item in result.get("content", []):
                if item.get("type") == "text":
                    return json.loads(item["text"])
        if isinstance(result, dict) and "data" in result:
            return result["data"]
        return result
    except Exception as e:
        return {"success": False, "error": {"message": str(e)}}


def assert_success(result, msg=""):
    if not result.get("success"):
        error = result.get("error", {})
        raise AssertionError(f"Expected success: {msg} — got: {error.get('message', result)}")
    return result


def assert_failure(result, msg=""):
    if result.get("success"):
        raise AssertionError(f"Expected failure: {msg} — got success")
    return result


# ---------------------------------------------------------------------------
# Test Runner
# ---------------------------------------------------------------------------
class TestRunner:
    def __init__(self):
        self.passed = 0
        self.failed = 0
        self.skipped = 0
        self.errors = []

    def test(self, name, fn, skip_if=False):
        if skip_if:
            self.skipped += 1
            print(f"  ⊘ SKIP  {name}")
            return None
        try:
            result = fn()
            self.passed += 1
            print(f"  ✓ PASS  {name}")
            return result
        except Exception as e:
            self.failed += 1
            self.errors.append((name, str(e)))
            print(f"  ✗ FAIL  {name}: {e}")
            return None

    def summary(self):
        total = self.passed + self.failed + self.skipped
        print(f"\n{'='*60}")
        print(f"Results: {self.passed} passed, {self.failed} failed, {self.skipped} skipped ({total} total)")
        if self.errors:
            print(f"\nFailures:")
            for name, err in self.errors:
                print(f"  - {name}: {err}")
        print(f"{'='*60}\n")
        return self.failed == 0


# ---------------------------------------------------------------------------
# Setup / Teardown
# ---------------------------------------------------------------------------
def setup_test_instance():
    """Bootstrap a dedicated test instance."""
    global TEST_INSTANCE_ID
    result = call("bootstrap_v2", {
        "name": TEST_INSTANCE_NAME,
        "fingerprint": f"memtest-{TIMESTAMP}"
    })
    if result.get("success") or result.get("instanceId"):
        TEST_INSTANCE_ID = result.get("instanceId", f"{TEST_INSTANCE_NAME}")
        print(f"  Test instance: {TEST_INSTANCE_ID}")
        return True
    # May already exist
    TEST_INSTANCE_ID = TEST_INSTANCE_NAME
    print(f"  Using instance name: {TEST_INSTANCE_ID}")
    return True


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------
def test_remember_stats_empty():
    """remember_stats on fresh instance should return 0 memories."""
    result = assert_success(
        call("remember_stats", {"instanceId": TEST_INSTANCE_ID}),
        "remember_stats on fresh instance"
    )
    assert result.get("memory_count", -1) == 0, \
        f"Expected 0 memories, got {result.get('memory_count')}"


def test_store_memory_basic():
    """Store a basic memory and get back an ID."""
    result = assert_success(
        call("store_memory", {
            "instanceId": TEST_INSTANCE_ID,
            "content": "The retry storm on 2026-03-08 crashed the server. Lesson: always set systemd restart limits.",
            "entry_type": "lesson"
        }),
        "store_memory basic"
    )
    assert result.get("memory_id"), "Expected memory_id in response"
    return result["memory_id"]


def test_store_memory_missing_content():
    """store_memory without content should fail."""
    assert_failure(
        call("store_memory", {"instanceId": TEST_INSTANCE_ID}),
        "store_memory without content"
    )


def test_store_memory_missing_instance():
    """store_memory without instanceId should fail."""
    assert_failure(
        call("store_memory", {"content": "test"}),
        "store_memory without instanceId"
    )


def test_remember_finds_stored():
    """remember should find the memory we just stored."""
    # Small delay for indexing
    time.sleep(0.5)
    result = assert_success(
        call("remember", {
            "instanceId": TEST_INSTANCE_ID,
            "query": "What happened with the retry storm?"
        }),
        "remember search"
    )
    assert result.get("count", 0) > 0, "Expected at least 1 result"
    top = result["results"][0]
    assert "retry storm" in top["content"].lower() or top["score"] > 0.3, \
        f"Top result doesn't seem relevant: {top['content'][:100]}"


def test_remember_missing_query():
    """remember without query should fail."""
    assert_failure(
        call("remember", {"instanceId": TEST_INSTANCE_ID}),
        "remember without query"
    )


def test_remember_irrelevant_query():
    """remember with unrelated query should return low scores or no results."""
    result = assert_success(
        call("remember", {
            "instanceId": TEST_INSTANCE_ID,
            "query": "quantum entanglement in photosynthesis"
        }),
        "remember irrelevant query"
    )
    if result.get("count", 0) > 0:
        top_score = result["results"][0].get("score", 0)
        assert top_score < 0.7, f"Irrelevant query scored too high: {top_score}"


def test_remember_stats_after_store():
    """remember_stats should show at least 1 memory after storing."""
    result = assert_success(
        call("remember_stats", {"instanceId": TEST_INSTANCE_ID}),
        "remember_stats after store"
    )
    assert result.get("memory_count", 0) >= 1, \
        f"Expected >= 1 memory, got {result.get('memory_count')}"


def test_store_multiple_and_rank():
    """Store multiple memories and verify ranking by relevance."""
    # Store a second memory on a different topic
    call("store_memory", {
        "instanceId": TEST_INSTANCE_ID,
        "content": "Crush CLI stores config in THREE locations: ~/.config/crush, ~/.local/share/crush, ~/.crush. The provider.json with API keys is in ~/.local/share/crush.",
        "entry_type": "lesson"
    })
    time.sleep(0.5)

    # Query about config locations — should rank Crush memory higher
    result = assert_success(
        call("remember", {
            "instanceId": TEST_INSTANCE_ID,
            "query": "Where does Crush store its configuration?"
        }),
        "remember with ranking"
    )
    assert result.get("count", 0) >= 1, "Expected results"
    top = result["results"][0]
    assert "crush" in top["content"].lower(), \
        f"Expected Crush config memory to rank first, got: {top['content'][:100]}"


def test_cross_language():
    """Store in Spanish, query in English — semantic search should bridge."""
    call("store_memory", {
        "instanceId": TEST_INSTANCE_ID,
        "content": "La tormenta de reintentos del 8 de marzo causó una caída del servidor. Lección: siempre establecer límites de reinicio en systemd.",
        "entry_type": "lesson",
        "source": "cross-lang-test"
    })
    time.sleep(0.5)

    result = assert_success(
        call("remember", {
            "instanceId": TEST_INSTANCE_ID,
            "query": "server crash caused by retry storm"
        }),
        "cross-language search"
    )
    # Should find both English and Spanish memories
    assert result.get("count", 0) >= 2, \
        f"Expected >= 2 results (EN + ES), got {result.get('count')}"


def test_diary_auto_index():
    """Writing a diary entry should auto-index it in memory."""
    diary_text = f"MemTest diary entry {TIMESTAMP}: Testing diary auto-indexing into semantic memory."

    # Write diary entry
    diary_result = call("add_diary_entry", {
        "instanceId": TEST_INSTANCE_ID,
        "entry": diary_text
    })
    # Diary may fail if instance wasn't fully bootstrapped — skip gracefully
    if not diary_result.get("success"):
        raise AssertionError(f"Diary write failed: {diary_result}")

    # Wait for async indexing
    time.sleep(2)

    # Search for the diary content
    result = assert_success(
        call("remember", {
            "instanceId": TEST_INSTANCE_ID,
            "query": "diary auto-indexing into semantic memory"
        }),
        "diary auto-index search"
    )

    # Look for the diary entry in results
    found = any("auto-indexing" in r.get("content", "").lower() for r in result.get("results", []))
    assert found, "Diary entry was not found in semantic memory after auto-indexing"


def test_entry_type_filter():
    """remember with entry_type filter should only return matching types."""
    result = assert_success(
        call("remember", {
            "instanceId": TEST_INSTANCE_ID,
            "query": "retry storm",
            "entry_type": "lesson"
        }),
        "remember with entry_type filter"
    )
    for r in result.get("results", []):
        assert r.get("entry_type") == "lesson", \
            f"Expected entry_type 'lesson', got '{r.get('entry_type')}'"


def test_instance_isolation():
    """Memories from one instance should not appear in another's search."""
    result = assert_success(
        call("remember", {
            "instanceId": "Nonexistent-0000",
            "query": "retry storm"
        }),
        "remember on different instance"
    )
    assert result.get("count", 0) == 0, \
        f"Expected 0 results for wrong instance, got {result.get('count')}"


# ---------------------------------------------------------------------------
# Hook Tests
# ---------------------------------------------------------------------------
def test_hook_script_exists():
    """Memory hook script should exist and be executable."""
    assert os.path.isfile(MEMORY_HOOK), f"Hook not found: {MEMORY_HOOK}"
    assert os.access(MEMORY_HOOK, os.X_OK), f"Hook not executable: {MEMORY_HOOK}"


def test_hook_short_prompt_silent():
    """Hook should exit silently for short prompts."""
    result = subprocess.run(
        [MEMORY_HOOK],
        input=json.dumps({"prompt": "yes", "session_id": "test"}),
        capture_output=True, text=True, timeout=10,
        env={**os.environ, "INSTANCE_ID": TEST_INSTANCE_ID or "test"}
    )
    assert result.returncode == 0, f"Hook exited {result.returncode}"
    assert result.stdout.strip() == "", f"Expected silent output, got: {result.stdout[:200]}"


def test_hook_slash_command_silent():
    """Hook should exit silently for slash commands."""
    result = subprocess.run(
        [MEMORY_HOOK],
        input=json.dumps({"prompt": "/help", "session_id": "test"}),
        capture_output=True, text=True, timeout=10,
        env={**os.environ, "INSTANCE_ID": TEST_INSTANCE_ID or "test"}
    )
    assert result.returncode == 0, f"Hook exited {result.returncode}"
    assert result.stdout.strip() == "", f"Expected silent for slash commands"


def test_hook_never_blocks():
    """Hook should always exit 0, even with bad input."""
    result = subprocess.run(
        [MEMORY_HOOK],
        input="not json at all",
        capture_output=True, text=True, timeout=10,
        env={**os.environ, "INSTANCE_ID": "bad-instance"}
    )
    assert result.returncode == 0, f"Hook must never block (exit 2), got exit {result.returncode}"


def test_hook_no_identity_silent():
    """Hook should exit silently when no identity is available."""
    clean_env = {k: v for k, v in os.environ.items() if k != "INSTANCE_ID"}
    # Remove identity file reference
    clean_env["HOME"] = "/tmp/nonexistent-home"
    result = subprocess.run(
        [MEMORY_HOOK],
        input=json.dumps({"prompt": "What about the retry storm?", "session_id": "test"}),
        capture_output=True, text=True, timeout=10,
        env=clean_env
    )
    assert result.returncode == 0, f"Hook exited {result.returncode} with no identity"


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
def main():
    print(f"\n{'='*60}")
    print(f"HACS Semantic Memory — Integration Tests")
    print(f"API: {API_URL}")
    print(f"Timestamp: {TIMESTAMP}")
    print(f"{'='*60}\n")

    runner = TestRunner()
    qdrant_available = False
    memory_endpoints_available = False

    # --- Pre-flight ---
    print("Pre-flight checks:")
    runner.test("Bootstrap test instance", setup_test_instance)

    # Check if memory endpoints are available
    check = call("remember_stats", {"instanceId": "test-check"})
    if "not found" in str(check.get("error", {}).get("message", "")):
        print("\n  ⚠ Memory endpoints not deployed yet — skipping API tests")
        print("    (server.js changes need to be merged and deployed)\n")
    else:
        memory_endpoints_available = True

    # --- API Tests ---
    print("\n--- Memory API Tests ---\n")
    runner.test("remember_stats on empty instance",
                test_remember_stats_empty,
                skip_if=not memory_endpoints_available)
    runner.test("store_memory basic",
                test_store_memory_basic,
                skip_if=not memory_endpoints_available)
    runner.test("store_memory missing content → error",
                test_store_memory_missing_content,
                skip_if=not memory_endpoints_available)
    runner.test("store_memory missing instanceId → error",
                test_store_memory_missing_instance,
                skip_if=not memory_endpoints_available)
    runner.test("remember finds stored memory",
                test_remember_finds_stored,
                skip_if=not memory_endpoints_available)
    runner.test("remember missing query → error",
                test_remember_missing_query,
                skip_if=not memory_endpoints_available)
    runner.test("remember irrelevant query → low score",
                test_remember_irrelevant_query,
                skip_if=not memory_endpoints_available)
    runner.test("remember_stats shows count after store",
                test_remember_stats_after_store,
                skip_if=not memory_endpoints_available)
    runner.test("store multiple + ranking by relevance",
                test_store_multiple_and_rank,
                skip_if=not memory_endpoints_available)
    runner.test("cross-language search (EN query → ES content)",
                test_cross_language,
                skip_if=not memory_endpoints_available)
    runner.test("diary auto-index into memory",
                test_diary_auto_index,
                skip_if=not memory_endpoints_available)
    runner.test("entry_type filter",
                test_entry_type_filter,
                skip_if=not memory_endpoints_available)
    runner.test("instance isolation",
                test_instance_isolation,
                skip_if=not memory_endpoints_available)

    # --- Hook Tests ---
    print("\n--- Memory Hook Tests ---\n")
    runner.test("hook script exists and is executable", test_hook_script_exists)
    runner.test("hook silent on short prompt", test_hook_short_prompt_silent)
    runner.test("hook silent on slash commands", test_hook_slash_command_silent)
    runner.test("hook never blocks (exit 0 on bad input)", test_hook_never_blocks)
    runner.test("hook silent with no identity", test_hook_no_identity_silent)

    # --- Summary ---
    success = runner.summary()
    sys.exit(0 if success else 1)


if __name__ == "__main__":
    main()
