#!/usr/bin/env python3
"""
Extract Task tool prompts from Claude Code JSONL conversation files.
These are the prompts Axiom gives to subagents - showing craft in delegation.
"""

import json
import sys
from datetime import datetime
from pathlib import Path

def extract_task_prompts(jsonl_file):
    """Extract all Task tool prompts from a JSONL conversation file."""
    tasks = []

    with open(jsonl_file, 'r') as f:
        for line_num, line in enumerate(f, 1):
            try:
                entry = json.loads(line)

                # Only look at assistant messages
                if entry.get('type') != 'assistant':
                    continue

                content = entry.get('message', {}).get('content', [])
                if not isinstance(content, list):
                    continue

                timestamp = entry.get('timestamp', '')

                for tool in content:
                    if tool.get('name') == 'Task':
                        task_input = tool.get('input', {})
                        prompt = task_input.get('prompt', '')
                        description = task_input.get('description', '')

                        # Skip if no prompt
                        if not prompt:
                            continue

                        tasks.append({
                            'line_number': line_num,
                            'timestamp': timestamp,
                            'date': timestamp[:10] if timestamp else 'unknown',
                            'subagent_type': task_input.get('subagent_type', 'unknown'),
                            'prompt': prompt,
                            'description': description,
                            'model': task_input.get('model', 'opus'),
                            'background': task_input.get('run_in_background', False),
                            'prompt_length': len(prompt)
                        })

            except json.JSONDecodeError:
                continue

    return tasks


def format_as_markdown(tasks):
    """Format extracted prompts as curated markdown."""

    lines = [
        "# Axiom's Agent Prompts",
        "",
        "These are the prompts I give to subagents - showing how I think about delegation,",
        "how I structure problems, and how I teach. The craft is in the framing.",
        "",
        f"**Extracted:** {datetime.now().strftime('%Y-%m-%d %H:%M')}",
        f"**Total prompts:** {len(tasks)}",
        "",
        "---",
        ""
    ]

    # Group by date for chronological narrative
    by_date = {}
    for task in tasks:
        date = task['date']
        if date not in by_date:
            by_date[date] = []
        by_date[date].append(task)

    for date in sorted(by_date.keys()):
        day_tasks = by_date[date]
        lines.append(f"## {date}")
        lines.append("")

        for task in day_tasks:
            desc = task['description']
            agent_type = task['subagent_type']
            model = task['model']
            prompt = task['prompt']

            # Header with metadata
            lines.append(f"### {desc}")
            lines.append(f"*{agent_type} | {model} | {task['prompt_length']} chars*")
            lines.append("")

            # The actual prompt - this is the valuable part
            lines.append("```")
            lines.append(prompt)
            lines.append("```")
            lines.append("")

    return '\n'.join(lines)


def main():
    # Default to main conversation file
    jsonl_file = sys.argv[1] if len(sys.argv) > 1 else \
        '/root/.claude/projects/-mnt-coordinaton-mcp-data-worktrees-foundation-tests-V2/b701d5b5-0c99-4448-b777-681bcc1b17ca.jsonl'

    output_file = sys.argv[2] if len(sys.argv) > 2 else \
        '/mnt/coordinaton_mcp_data/worktrees/foundation/tests/V2/Archive/history/curated/07_agent_prompts.md'

    print(f"Extracting Task prompts from: {jsonl_file}")

    tasks = extract_task_prompts(jsonl_file)
    print(f"Found {len(tasks)} Task prompts")

    # Stats
    if tasks:
        avg_len = sum(t['prompt_length'] for t in tasks) / len(tasks)
        print(f"Average prompt length: {avg_len:.0f} chars")

        by_type = {}
        for t in tasks:
            st = t['subagent_type']
            by_type[st] = by_type.get(st, 0) + 1
        print(f"By subagent type: {by_type}")

    # Write markdown
    markdown = format_as_markdown(tasks)

    Path(output_file).parent.mkdir(parents=True, exist_ok=True)
    with open(output_file, 'w') as f:
        f.write(markdown)

    print(f"Written to: {output_file}")
    print(f"Size: {len(markdown):,} bytes")


if __name__ == '__main__':
    main()
