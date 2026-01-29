#!/usr/bin/env python3
"""
Extract tool_use entries from Claude Code JSONL files.
This captures what Axiom DID - commands run, files created, APIs called.

Output is unfiltered initially - review before deciding what to merge.
"""

import json
import sys
from datetime import datetime
from pathlib import Path

def extract_tool_uses(content):
    """Extract tool_use entries from message content."""
    if not isinstance(content, list):
        return []

    tool_uses = []
    for item in content:
        if isinstance(item, dict) and item.get('type') == 'tool_use':
            tool_uses.append({
                'id': item.get('id', ''),
                'name': item.get('name', ''),
                'input': item.get('input', {})
            })
    return tool_uses

def summarize_tool_use(tool):
    """Create a human-readable summary of a tool use."""
    name = tool.get('name', 'Unknown')
    inp = tool.get('input', {})

    if name == 'Bash':
        cmd = inp.get('command', '')
        desc = inp.get('description', '')
        return f"**Bash:** `{cmd[:200]}{'...' if len(cmd) > 200 else ''}`" + (f"\n  _{desc}_" if desc else "")

    elif name == 'Write':
        path = inp.get('file_path', '')
        content = inp.get('content', '')
        lines = content.count('\n') + 1 if content else 0
        return f"**Write:** `{path}` ({lines} lines)"

    elif name == 'Edit':
        path = inp.get('file_path', '')
        old = inp.get('old_string', '')[:50]
        new = inp.get('new_string', '')[:50]
        return f"**Edit:** `{path}`\n  `{old}...` → `{new}...`"

    elif name == 'Read':
        path = inp.get('file_path', '')
        return f"**Read:** `{path}`"

    elif name == 'Task':
        desc = inp.get('description', '')
        prompt = inp.get('prompt', '')[:100]
        agent = inp.get('subagent_type', '')
        return f"**Task ({agent}):** {desc}\n  _{prompt}..._"

    elif name == 'Glob':
        pattern = inp.get('pattern', '')
        return f"**Glob:** `{pattern}`"

    elif name == 'Grep':
        pattern = inp.get('pattern', '')
        path = inp.get('path', '.')
        return f"**Grep:** `{pattern}` in `{path}`"

    elif name.startswith('mcp__HACS__'):
        api_name = name.replace('mcp__HACS__', '')
        # Summarize key params
        params = ', '.join(f"{k}={v}" for k, v in list(inp.items())[:3])
        return f"**HACS.{api_name}:** {params}"

    else:
        # Generic summary
        params = json.dumps(inp, default=str)[:100]
        return f"**{name}:** {params}..."

def process_jsonl_file(filepath):
    """Process a single JSONL file and extract tool uses."""
    tool_entries = []

    with open(filepath, 'r', encoding='utf-8') as f:
        for line_num, line in enumerate(f, 1):
            try:
                entry = json.loads(line.strip())

                # Only assistant messages have tool_use
                if entry.get('type') != 'assistant':
                    continue

                message = entry.get('message', {})
                content = message.get('content')
                timestamp = entry.get('timestamp', '')

                tool_uses = extract_tool_uses(content)

                for tool in tool_uses:
                    tool_entries.append({
                        'timestamp': timestamp,
                        'tool_name': tool['name'],
                        'tool_id': tool['id'],
                        'input': tool['input'],
                        'summary': summarize_tool_use(tool),
                        'line_num': line_num
                    })

            except json.JSONDecodeError:
                continue
            except Exception as e:
                print(f"Error on line {line_num}: {e}", file=sys.stderr)
                continue

    return tool_entries

def main():
    # Can process either raw dir or single full_history file
    full_history = Path('/mnt/coordinaton_mcp_data/worktrees/foundation/tests/V2/Archive/history/axiom_full_history.jsonl')
    output_json = Path('/mnt/coordinaton_mcp_data/worktrees/foundation/tests/V2/Archive/history/axiom_tool_use.json')
    output_md = Path('/mnt/coordinaton_mcp_data/worktrees/foundation/tests/V2/Archive/history/axiom_tool_use.md')

    print(f"Processing: {full_history}")
    print(f"File size: {full_history.stat().st_size / 1024 / 1024:.1f} MB")

    tool_entries = process_jsonl_file(full_history)

    print(f"Extracted {len(tool_entries)} tool uses")

    # Count by tool type
    by_type = {}
    for entry in tool_entries:
        name = entry['tool_name']
        by_type[name] = by_type.get(name, 0) + 1

    print("\nBy tool type:")
    for name, count in sorted(by_type.items(), key=lambda x: -x[1]):
        print(f"  {name}: {count}")

    # Write JSON (full data)
    with open(output_json, 'w', encoding='utf-8') as f:
        json.dump({
            'extracted_at': datetime.now().isoformat(),
            'source': str(full_history),
            'total_tool_uses': len(tool_entries),
            'by_type': by_type,
            'entries': tool_entries
        }, f, indent=2, ensure_ascii=False, default=str)

    print(f"\nFull data: {output_json}")

    # Write readable markdown (summaries only)
    with open(output_md, 'w', encoding='utf-8') as f:
        f.write("# Axiom's Tool Use History\n\n")
        f.write("> **What Axiom DID** - commands, files, API calls\n\n")
        f.write(f"**Extracted:** {datetime.now().isoformat()}\n")
        f.write(f"**Total tool uses:** {len(tool_entries)}\n\n")

        f.write("## Summary by Type\n\n")
        for name, count in sorted(by_type.items(), key=lambda x: -x[1]):
            f.write(f"- {name}: {count}\n")
        f.write("\n---\n\n")

        current_date = None
        for entry in tool_entries:
            ts = entry.get('timestamp', '')[:10]
            if ts != current_date:
                current_date = ts
                f.write(f"\n## {ts}\n\n")

            time = entry.get('timestamp', '')[11:19]
            summary = entry.get('summary', '')

            f.write(f"### [{time}]\n\n{summary}\n\n")

    print(f"Readable version: {output_md}")

if __name__ == '__main__':
    main()
