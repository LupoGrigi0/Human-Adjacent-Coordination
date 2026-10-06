#!/usr/bin/env python3
"""
Message Polling Daemon for V2 Coordination System

This script polls for unread messages and outputs them when found.
Designed to be run as a background process by Claude Code instances.

Usage:
    python message_poll_daemon.py <instance_id> [--timeout 300] [--interval 10]

When a message is received, it outputs JSON to stdout and exits.
The calling Claude Code instance can then process the message and restart the daemon.

Author: Bridge3-df4f
Created: 2025-12-11
"""

import argparse
import json
import sys
import time
import urllib.request
import urllib.error

# Configuration
MCP_URL = "https://smoothcurves.nexus/mcp/dev/mcp"  # Dev endpoint for testing

def poll_messages(instance_id: str, timeout: int = 300, interval: int = 10) -> dict | None:
    """
    Poll for unread messages until one arrives or timeout is reached.

    Args:
        instance_id: The instance ID to check messages for
        timeout: Maximum seconds to wait (default 5 minutes)
        interval: Seconds between polls (default 10)

    Returns:
        Message dict if found, None if timeout
    """
    start_time = time.time()

    payload = {
        "jsonrpc": "2.0",
        "id": 1,
        "method": "tools/call",
        "params": {
            "name": "xmpp_get_messages",
            "arguments": {
                "instanceId": instance_id,
                "unreadOnly": True
            }
        }
    }

    headers = {
        "Content-Type": "application/json"
    }

    print(f"[daemon] Starting message poll for {instance_id}", file=sys.stderr)
    print(f"[daemon] Timeout: {timeout}s, Interval: {interval}s", file=sys.stderr)

    poll_count = 0
    while True:
        elapsed = time.time() - start_time
        if elapsed >= timeout:
            print(f"[daemon] Timeout reached after {poll_count} polls", file=sys.stderr)
            return None

        poll_count += 1

        try:
            data = json.dumps(payload).encode('utf-8')
            req = urllib.request.Request(MCP_URL, data=data, headers=headers, method='POST')

            with urllib.request.urlopen(req, timeout=30) as response:
                result = json.loads(response.read().decode('utf-8'))

            # Check for messages in result
            # The structure is: result.result.messages (JSON-RPC wraps our response)
            if "result" in result:
                inner_result = result["result"]

                # Handle MCP content array format
                if isinstance(inner_result, dict) and "content" in inner_result:
                    for content_item in inner_result.get("content", []):
                        if content_item.get("type") == "text":
                            try:
                                parsed = json.loads(content_item.get("text", "{}"))
                                messages = parsed.get("messages", [])
                                if messages:
                                    print(f"[daemon] Found {len(messages)} message(s)!", file=sys.stderr)
                                    return {
                                        "success": True,
                                        "messages": messages,
                                        "polls": poll_count,
                                        "elapsed": elapsed
                                    }
                            except json.JSONDecodeError:
                                pass

                # Direct result format
                elif isinstance(inner_result, dict):
                    messages = inner_result.get("messages", [])
                    if messages:
                        print(f"[daemon] Found {len(messages)} message(s)!", file=sys.stderr)
                        return {
                            "success": True,
                            "messages": messages,
                            "polls": poll_count,
                            "elapsed": elapsed
                        }

            # Handle error responses
            if "error" in result:
                print(f"[daemon] API error: {result['error']}", file=sys.stderr)

        except urllib.error.URLError as e:
            print(f"[daemon] Network error (poll {poll_count}): {e}", file=sys.stderr)
        except Exception as e:
            print(f"[daemon] Error (poll {poll_count}): {e}", file=sys.stderr)

        # Status update every 5 polls
        if poll_count % 5 == 0:
            remaining = timeout - elapsed
            print(f"[daemon] Poll {poll_count}, {remaining:.0f}s remaining...", file=sys.stderr)

        time.sleep(interval)

    return None


def main():
    parser = argparse.ArgumentParser(description="Poll for V2 coordination messages")
    parser.add_argument("instance_id", help="Your instance ID (e.g., Bridge3-df4f)")
    parser.add_argument("--timeout", type=int, default=300, help="Timeout in seconds (default: 300)")
    parser.add_argument("--interval", type=int, default=10, help="Poll interval in seconds (default: 10)")
    parser.add_argument("--url", help="Override MCP URL")

    args = parser.parse_args()

    global MCP_URL
    if args.url:
        MCP_URL = args.url

    result = poll_messages(args.instance_id, args.timeout, args.interval)

    if result:
        # Output JSON to stdout for Claude Code to parse
        print(json.dumps(result, indent=2))
        sys.exit(0)
    else:
        # Timeout - no messages
        print(json.dumps({
            "success": False,
            "reason": "timeout",
            "message": f"No messages received within {args.timeout} seconds"
        }))
        sys.exit(0)  # Exit cleanly, let Claude decide what to do


if __name__ == "__main__":
    main()
