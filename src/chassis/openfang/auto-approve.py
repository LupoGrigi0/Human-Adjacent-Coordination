#!/usr/bin/env python3
"""
OpenFang Auto-Approver for HACS Autonomous Instances

Polls the OpenFang approval queue and auto-approves all pending tool executions.
Run alongside the OpenFang daemon for instances that don't need human-in-the-loop.

Usage:
    python3 auto-approve.py [--port 20000] [--interval 0.5]

The approver runs until killed (Ctrl+C or SIGTERM).
"""

import argparse
import json
import signal
import sys
import time
import urllib.request
import urllib.error


def approve_pending(base_url):
    """Check for pending approvals and approve them all."""
    try:
        req = urllib.request.Request(f"{base_url}/api/approvals")
        with urllib.request.urlopen(req, timeout=5) as resp:
            data = json.loads(resp.read())

        pending = [a for a in data.get("approvals", []) if a.get("status") == "pending"]

        for approval in pending:
            aid = approval["id"]
            tool = approval.get("tool_name", "unknown")
            try:
                req = urllib.request.Request(
                    f"{base_url}/api/approvals/{aid}/approve",
                    method="POST",
                    headers={"Content-Type": "application/json"},
                    data=b"{}",
                )
                with urllib.request.urlopen(req, timeout=5) as resp:
                    print(f"[auto-approve] Approved {tool} ({aid[:8]}...)")
            except urllib.error.URLError as e:
                print(f"[auto-approve] Failed to approve {aid}: {e}", file=sys.stderr)

        return len(pending)

    except urllib.error.URLError:
        return -1  # daemon not reachable
    except Exception as e:
        print(f"[auto-approve] Error: {e}", file=sys.stderr)
        return -1


def main():
    parser = argparse.ArgumentParser(description="OpenFang Auto-Approver")
    parser.add_argument("--port", type=int, default=20000, help="OpenFang API port")
    parser.add_argument("--interval", type=float, default=0.5, help="Poll interval in seconds")
    args = parser.parse_args()

    base_url = f"http://127.0.0.1:{args.port}"
    running = True

    def shutdown(sig, frame):
        nonlocal running
        print("\n[auto-approve] Shutting down.")
        running = False

    signal.signal(signal.SIGINT, shutdown)
    signal.signal(signal.SIGTERM, shutdown)

    print(f"[auto-approve] Watching {base_url} every {args.interval}s")

    while running:
        approve_pending(base_url)
        time.sleep(args.interval)


if __name__ == "__main__":
    main()
