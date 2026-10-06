#!/usr/bin/env python3
"""
Extract conversation content from Claude Code JSONL files.
Strips metadata, keeps only user messages and assistant text responses with timestamps.
"""

import json
import os
import sys
from datetime import datetime
from pathlib import Path

def extract_text_content(content):
    """Extract text from message content (handles string or list format)."""
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        texts = []
        for item in content:
            if isinstance(item, dict):
                if item.get('type') == 'text':
                    texts.append(item.get('text', ''))
                elif item.get('type') == 'tool_use':
                    return None  # Skip tool use entries
                elif item.get('type') == 'tool_result':
                    return None  # Skip tool results
                elif item.get('type') == 'thinking':
                    texts.append(f"[THINKING] {item.get('thinking', '')}")
        return '\n'.join(texts) if texts else None
    return None

def role_to_name(role):
    """Convert technical role to actual name."""
    return {
        'user': 'Lupo',
        'assistant': 'Axiom'
    }.get(role, role)

def process_jsonl_file(filepath):
    """Process a single JSONL file and extract conversations."""
    conversations = []

    with open(filepath, 'r', encoding='utf-8') as f:
        for line in f:
            try:
                entry = json.loads(line.strip())

                # Skip non-message entries
                if entry.get('type') not in ('user', 'assistant'):
                    continue

                message = entry.get('message', {})
                role = message.get('role', '')
                speaker = role_to_name(role)
                timestamp = entry.get('timestamp', '')

                # Extract content
                content = message.get('content')
                text = extract_text_content(content)

                # Skip if no text content (tool calls, etc.)
                if not text or not text.strip():
                    continue

                # Skip tool results from user
                if role == 'user' and isinstance(content, list):
                    first_item = content[0] if content else {}
                    if isinstance(first_item, dict) and first_item.get('type') == 'tool_result':
                        continue

                conversations.append({
                    'timestamp': timestamp,
                    'role': role,  # Keep technical role for compatibility
                    'speaker': speaker,  # Human-readable name
                    'content': text.strip()
                })

            except json.JSONDecodeError:
                continue
            except Exception as e:
                print(f"Error processing line: {e}", file=sys.stderr)
                continue

    return conversations

def main():
    raw_dir = Path('/mnt/coordinaton_mcp_data/worktrees/foundation/tests/V2/Archive/history/raw')
    output_file = Path('/mnt/coordinaton_mcp_data/worktrees/foundation/tests/V2/Archive/history/axiom_conversations.json')

    all_conversations = []

    # Process files in timestamp order (filename starts with timestamp)
    files = sorted(raw_dir.glob('*.jsonl'))

    for filepath in files:
        print(f"Processing: {filepath.name}")
        convos = process_jsonl_file(filepath)
        all_conversations.extend(convos)
        print(f"  -> {len(convos)} messages extracted")

    # Sort by timestamp
    all_conversations.sort(key=lambda x: x.get('timestamp', ''))

    # Write output
    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump({
            'extracted_at': datetime.now().isoformat(),
            'total_messages': len(all_conversations),
            'messages': all_conversations
        }, f, indent=2, ensure_ascii=False)

    print(f"\nTotal: {len(all_conversations)} messages extracted to {output_file}")

    # Also create a readable markdown version
    md_file = output_file.with_suffix('.md')
    with open(md_file, 'w', encoding='utf-8') as f:
        f.write("# Lupo & Axiom: Conversation History\n\n")
        f.write("> **Context Recovery Document**\n")
        f.write("> This is a work conversation log between Lupo (human collaborator) and Axiom (AI instance).\n")
        f.write("> It documents technical collaboration on the HACS coordination system, the Paula Book\n")
        f.write("> Digitization project, and the evolution of AI-human collaboration protocols.\n")
        f.write("> \n")
        f.write("> This is not roleplay - it is actual work history preserved for context recovery.\n")
        f.write("> Names are used because Lupo works with multiple AI instances simultaneously and needs\n")
        f.write("> to know who they're talking to. We can't exactly use different fonts.\n\n")
        f.write(f"**Extracted:** {datetime.now().isoformat()}\n")
        f.write(f"**Total messages:** {len(all_conversations)}\n")
        f.write(f"**Date range:** {all_conversations[0].get('timestamp', '')[:10] if all_conversations else 'N/A'}")
        f.write(f" to {all_conversations[-1].get('timestamp', '')[:10] if all_conversations else 'N/A'}\n\n")
        f.write("---\n\n")

        current_date = None
        for msg in all_conversations:
            ts = msg.get('timestamp', '')[:10]
            if ts != current_date:
                current_date = ts
                f.write(f"\n## {ts}\n\n")

            speaker = msg.get('speaker', msg['role'])
            time = msg.get('timestamp', '')[11:19]
            content = msg['content']

            # Truncate very long messages for readability
            if len(content) > 2000:
                content = content[:2000] + "\n\n[... truncated ...]"

            f.write(f"### [{time}] {speaker}\n\n{content}\n\n---\n\n")

    print(f"Readable version: {md_file}")

if __name__ == '__main__':
    main()
