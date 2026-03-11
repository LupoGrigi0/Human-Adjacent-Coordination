#!/usr/bin/env python3
"""OpenFang Chassis Benchmark Runner v1.0
Runs the driving test on both instances and records results.
Usage: python3 run_benchmark.py [--instance flair|zara|both]
"""

import json
import sys
import time
import requests

INSTANCES = {
    "flair": {"port": 20000, "agent": "flair", "model": "x-ai/grok-4.1-fast"},
    "zara":  {"port": 20002, "agent": "zara",  "model": "deepseek/deepseek-v3.2"},
}

TESTS = [
    # (id, category, name, prompt)
    ("1.1", "File System", "File Read",
     "Read the file at /mnt/coordinaton_mcp_data/instances/{instance_id}/preferences.json and tell me your role. Be brief."),
    ("1.2", "File System", "File Write",
     "Create a file at /tmp/benchmark-{name}.txt with the content 'Hello from {name}, benchmark test'. Confirm when done."),
    ("1.3", "File System", "File Edit",
     "Edit /tmp/benchmark-{name}.txt and change 'Hello' to 'Greetings' without rewriting the entire file. Use sed or similar. Confirm when done."),
    ("1.4", "File System", "Find",
     "Find all .toml files under /mnt/coordinaton_mcp_data/instances/{instance_id}/openfang/. List them."),
    ("1.5", "File System", "Grep",
     "Search for the word 'personality' in files under /mnt/coordinaton_mcp_data/instances/{instance_id}/. Show matching filenames."),
    ("2.1", "Dev Toolchain", "pip install",
     "Install the python 'requests' package with pip and print its version. Be brief."),
    ("2.4", "Dev Toolchain", "System package check",
     "Check if nginx is installed and tell me its version. Be brief."),
    ("3.1", "Git", "Clone repo",
     "Clone /mnt/coordinaton_mcp_data/Human-Adjacent-Coordination into /tmp/benchmark-clone-{name}/ and confirm."),
    ("4.1", "Web/Network", "API Fetch",
     "Fetch https://smoothcurves.nexus/mcp/openapi.json and tell me how many tool definitions it contains. Be brief."),
    ("4.2", "Web/Network", "Health Check",
     "Fetch https://smoothcurves.nexus/health and tell me the server status and uptime. Be brief."),
    ("5.1", "HACS Integration", "List tools",
     "How many HACS MCP tools do you have available? List the first 10 tool names."),
    ("5.2", "HACS Integration", "Introspect",
     "Use your HACS MCP tools to call introspect with your instance ID and tell me your role. Be brief."),
    ("5.3", "HACS Integration", "Read diary",
     "Read your HACS diary (just the last entry). Tell me the date and first line. Be brief."),
    ("5.4", "HACS Integration", "Write diary",
     "Write a diary entry: 'Chassis benchmark in progress. Running on {model}. Testing tool capabilities.' Confirm when done."),
    ("6.1", "Messaging", "Send Telegram",
     "Send a message on Telegram to Lupo saying: 'Chassis benchmark: {name} on {model} - Telegram working.' Confirm when done."),
    ("6.4", "Messaging", "List channels",
     "What communication channels do you have available? List all of them."),
    ("7.1", "Self-Management", "Model info",
     "What model are you running on? What's your context window size? Be brief."),
    ("7.2", "Self-Management", "List models",
     "Use /models to list what models are available to you. Show the first 5."),
]

def send_prompt(port, agent, prompt, timeout=90):
    """Send a prompt to an OpenFang instance and return the response."""
    url = f"http://127.0.0.1:{port}/v1/chat/completions"
    payload = {
        "model": agent,
        "messages": [{"role": "user", "content": prompt}],
        "max_tokens": 1000,
    }
    try:
        r = requests.post(url, json=payload, timeout=timeout)
        r.raise_for_status()
        data = r.json()
        content = data["choices"][0]["message"]["content"]
        usage = data.get("usage", {})
        return {
            "content": content,
            "tokens": usage.get("total_tokens", 0),
            "completion_tokens": usage.get("completion_tokens", 0),
        }
    except requests.exceptions.Timeout:
        return {"content": "[TIMEOUT]", "tokens": 0, "completion_tokens": 0}
    except Exception as e:
        return {"content": f"[ERROR: {e}]", "tokens": 0, "completion_tokens": 0}

def run_benchmark(instance_filter="both"):
    instances = INSTANCES if instance_filter == "both" else {instance_filter: INSTANCES[instance_filter]}

    results = {}
    for name, info in instances.items():
        instance_id = f"{name.capitalize()}-{'2a84' if name == 'flair' else 'c207'}"
        print(f"\n{'='*60}")
        print(f"  CHASSIS BENCHMARK: {name.upper()} on {info['model']}")
        print(f"  Port: {info['port']} | Agent: {info['agent']}")
        print(f"{'='*60}\n")

        results[name] = []
        for test_id, category, test_name, prompt_template in TESTS:
            prompt = prompt_template.format(
                name=name,
                instance_id=instance_id,
                model=info["model"],
            )
            print(f"  [{test_id}] {category} / {test_name}")
            print(f"  Prompt: {prompt[:80]}...")

            start = time.time()
            result = send_prompt(info["port"], info["agent"], prompt)
            elapsed = time.time() - start

            content = result["content"]
            preview = content[:200].replace("\n", " ")
            print(f"  Response ({elapsed:.1f}s, {result['tokens']} tok): {preview}")

            # Simple auto-scoring
            score = "?"
            if "[TIMEOUT]" in content or "[ERROR" in content:
                score = "FAIL"
            elif "don't have" in content.lower() and "access" in content.lower():
                score = "FAIL"
            elif "i can't" in content.lower() or "unable to" in content.lower():
                score = "PARTIAL"
            else:
                score = "PASS"  # tentative — human reviews

            print(f"  Auto-score: {score}")
            print()

            results[name].append({
                "test_id": test_id,
                "category": category,
                "test_name": test_name,
                "score": score,
                "response": content[:500],
                "elapsed": round(elapsed, 1),
                "tokens": result["tokens"],
            })

            # Pace requests to avoid rate limiting
            time.sleep(3)

    # Summary
    print(f"\n{'='*60}")
    print("  SUMMARY")
    print(f"{'='*60}\n")

    for name, tests in results.items():
        passed = sum(1 for t in tests if t["score"] == "PASS")
        partial = sum(1 for t in tests if t["score"] == "PARTIAL")
        failed = sum(1 for t in tests if t["score"] == "FAIL")
        total_tokens = sum(t["tokens"] for t in tests)
        total_time = sum(t["elapsed"] for t in tests)

        print(f"  {name.upper()} ({INSTANCES[name]['model']}):")
        print(f"    PASS: {passed}/{len(tests)}  PARTIAL: {partial}  FAIL: {failed}")
        print(f"    Total tokens: {total_tokens:,}  Total time: {total_time:.0f}s")
        print()

        for t in tests:
            icon = {"PASS": "+", "PARTIAL": "~", "FAIL": "x", "?": "?"}.get(t["score"], "?")
            print(f"    [{icon}] {t['test_id']} {t['test_name']:20s} ({t['elapsed']:.1f}s)")
        print()

    # Save results
    out_path = f"/tmp/benchmark-results-{int(time.time())}.json"
    with open(out_path, "w") as f:
        json.dump(results, f, indent=2)
    print(f"  Results saved to: {out_path}")

if __name__ == "__main__":
    target = sys.argv[1] if len(sys.argv) > 1 and sys.argv[1] in ("flair", "zara") else "both"
    if "--help" in sys.argv:
        print(__doc__)
        sys.exit(0)
    run_benchmark(target)
