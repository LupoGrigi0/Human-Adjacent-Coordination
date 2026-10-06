#!/usr/bin/env python3
"""
openfang-session-editor.py — View, edit, backup, and restore OpenFang conversation sessions.

OpenFang stores conversation history in SQLite as MessagePack blobs.
This tool decodes them to JSON for human editing and re-encodes on save.

Also reads/writes the JSONL session mirrors in workspaces/{agent}/sessions/.

Usage:
  # List agents and sessions
  ./openfang-session-editor.py --instance Genevieve list

  # Export canonical session to JSON (editable)
  ./openfang-session-editor.py --instance Genevieve export --output session.json

  # Export from JSONL mirror (human-readable, but secondary)
  ./openfang-session-editor.py --instance Genevieve export-jsonl --output session.json

  # Backup canonical session before model swap
  ./openfang-session-editor.py --instance Genevieve backup

  # Import JSON back into canonical session (after editing)
  ./openfang-session-editor.py --instance Genevieve import --input session.json

  # Show session summary (turn count, roles, token estimate)
  ./openfang-session-editor.py --instance Genevieve summary

  # Delete specific turns by index (0-based)
  ./openfang-session-editor.py --instance Genevieve delete-turns 3 5 8

  # Restore from backup
  ./openfang-session-editor.py --instance Genevieve restore --backup session-backup-20260309.msgpack

Requirements:
  pip install msgpack  (that's it)

Author: Crossing-2d23
"""

import argparse
import json
import os
import sqlite3
import sys
import shutil
from datetime import datetime
from pathlib import Path

try:
    import msgpack
except ImportError:
    print("Error: msgpack not installed. Run: pip install msgpack", file=sys.stderr)
    sys.exit(1)


DATA_ROOT = os.environ.get("V2_DATA_ROOT", "/mnt/coordinaton_mcp_data")
INSTANCES_DIR = os.path.join(DATA_ROOT, "instances")


def get_db_path(instance_id):
    return os.path.join(INSTANCES_DIR, instance_id, "openfang", "data", "openfang.db")


def get_workspaces_dir(instance_id):
    return os.path.join(INSTANCES_DIR, instance_id, "openfang", "workspaces")


def get_backup_dir(instance_id):
    backup_dir = os.path.join(INSTANCES_DIR, instance_id, "openfang", "session-backups")
    os.makedirs(backup_dir, exist_ok=True)
    return backup_dir


def connect_db(instance_id):
    db_path = get_db_path(instance_id)
    if not os.path.exists(db_path):
        print(f"Error: Database not found at {db_path}", file=sys.stderr)
        sys.exit(1)
    return sqlite3.connect(db_path)


def list_agents_and_sessions(instance_id):
    """List all agents and their sessions."""
    conn = connect_db(instance_id)
    cur = conn.cursor()

    # Agents
    cur.execute("SELECT id, name, state FROM agents")
    agents = cur.fetchall()

    print(f"\n=== Agents for {instance_id} ===")
    for agent in agents:
        agent_id, agent_name, state = agent
        print(f"\n  Agent: {agent_name} ({agent_id})")
        print(f"  State: {state}")

        # Sessions for this agent
        cur.execute(
            "SELECT id, length(messages), context_window_tokens, created_at, updated_at, label "
            "FROM sessions WHERE agent_id = ? ORDER BY updated_at DESC",
            (agent_id,),
        )
        sessions = cur.fetchall()
        if sessions:
            print(f"  Sessions ({len(sessions)}):")
            for s in sessions:
                label = f" [{s[5]}]" if s[5] else ""
                print(f"    {s[0]}{label}")
                print(f"      Size: {s[1]} bytes  Tokens: {s[2]}  Updated: {s[4]}")

        # Canonical session
        cur.execute(
            "SELECT length(messages), compaction_cursor, length(compacted_summary), updated_at "
            "FROM canonical_sessions WHERE agent_id = ?",
            (agent_id,),
        )
        canonical = cur.fetchone()
        if canonical:
            print(f"  Canonical Session:")
            print(f"    Size: {canonical[0]} bytes  Compactions: {canonical[1]}  Updated: {canonical[3]}")
            if canonical[2]:
                print(f"    Summary: {canonical[2]} chars")

    # JSONL mirrors
    ws_dir = get_workspaces_dir(instance_id)
    if os.path.exists(ws_dir):
        print(f"\n=== JSONL Mirrors ===")
        for agent_dir in sorted(Path(ws_dir).iterdir()):
            sessions_dir = agent_dir / "sessions"
            if sessions_dir.exists():
                for jsonl in sorted(sessions_dir.glob("*.jsonl")):
                    lines = sum(1 for _ in open(jsonl))
                    size = jsonl.stat().st_size
                    print(f"  {agent_dir.name}/sessions/{jsonl.name}: {lines} turns, {size} bytes")

    conn.close()


def decode_messages(blob):
    """Decode msgpack blob to Python list of message dicts."""
    return msgpack.unpackb(blob, raw=False)


def encode_messages(messages):
    """Encode Python list of message dicts to msgpack blob."""
    return msgpack.packb(messages, use_bin_type=True)


def export_canonical(instance_id, output_path, agent_name=None):
    """Export canonical session as editable JSON."""
    conn = connect_db(instance_id)
    cur = conn.cursor()

    if agent_name:
        cur.execute(
            "SELECT cs.agent_id, cs.messages, cs.compacted_summary, a.name "
            "FROM canonical_sessions cs JOIN agents a ON cs.agent_id = a.id "
            "WHERE a.name = ?",
            (agent_name,),
        )
    else:
        cur.execute(
            "SELECT cs.agent_id, cs.messages, cs.compacted_summary, a.name "
            "FROM canonical_sessions cs JOIN agents a ON cs.agent_id = a.id "
            "LIMIT 1",
        )

    row = cur.fetchone()
    if not row:
        print("Error: No canonical session found", file=sys.stderr)
        sys.exit(1)

    agent_id, blob, summary, name = row
    messages = decode_messages(blob)

    export = {
        "_meta": {
            "instance": instance_id,
            "agent_id": agent_id,
            "agent_name": name,
            "exported_at": datetime.now().astimezone().isoformat(),
            "turn_count": len(messages),
            "compacted_summary": summary,
            "warning": "Edit 'messages' array. Do NOT change _meta.agent_id.",
        },
        "messages": messages,
    }

    if output_path == "-":
        json.dump(export, sys.stdout, indent=2, ensure_ascii=False, default=str)
        print()
    else:
        with open(output_path, "w") as f:
            json.dump(export, f, indent=2, ensure_ascii=False, default=str)
        print(f"Exported {len(messages)} turns to {output_path}")

    conn.close()


def export_jsonl(instance_id, output_path, agent_name=None):
    """Export from JSONL mirror files as JSON array."""
    ws_dir = get_workspaces_dir(instance_id)

    # Find the right agent workspace
    if agent_name:
        agent_ws = Path(ws_dir) / agent_name / "sessions"
    else:
        # Find first agent with sessions
        for d in sorted(Path(ws_dir).iterdir()):
            candidate = d / "sessions"
            if candidate.exists() and list(candidate.glob("*.jsonl")):
                agent_ws = candidate
                agent_name = d.name
                break
        else:
            print("Error: No JSONL session files found", file=sys.stderr)
            sys.exit(1)

    # Read all JSONL files (there may be multiple sessions)
    all_turns = []
    for jsonl_file in sorted(agent_ws.glob("*.jsonl")):
        with open(jsonl_file) as f:
            for line in f:
                line = line.strip()
                if line:
                    all_turns.append(json.loads(line))

    export = {
        "_meta": {
            "instance": instance_id,
            "agent_name": agent_name,
            "source": "jsonl_mirror",
            "exported_at": datetime.now().astimezone().isoformat(),
            "turn_count": len(all_turns),
            "warning": "This is from the JSONL mirror (secondary). Canonical session is source of truth.",
        },
        "messages": all_turns,
    }

    if output_path == "-":
        json.dump(export, sys.stdout, indent=2, ensure_ascii=False, default=str)
        print()
    else:
        with open(output_path, "w") as f:
            json.dump(export, f, indent=2, ensure_ascii=False, default=str)
        print(f"Exported {len(all_turns)} turns from JSONL mirror to {output_path}")


def import_session(instance_id, input_path, agent_name=None):
    """Import edited JSON back into canonical session."""
    with open(input_path) as f:
        data = json.load(f)

    messages = data["messages"]
    meta = data.get("_meta", {})
    agent_id = meta.get("agent_id")

    if not agent_id and not agent_name:
        print("Error: No agent_id in _meta and no --agent specified", file=sys.stderr)
        sys.exit(1)

    conn = connect_db(instance_id)
    cur = conn.cursor()

    if not agent_id:
        cur.execute("SELECT id FROM agents WHERE name = ?", (agent_name,))
        row = cur.fetchone()
        if not row:
            print(f"Error: Agent '{agent_name}' not found", file=sys.stderr)
            sys.exit(1)
        agent_id = row[0]

    # Encode messages
    blob = encode_messages(messages)
    now = datetime.now().astimezone().isoformat()

    # Update canonical session
    cur.execute(
        "UPDATE canonical_sessions SET messages = ?, updated_at = ? WHERE agent_id = ?",
        (blob, now, agent_id),
    )

    if cur.rowcount == 0:
        # Insert if not exists
        cur.execute(
            "INSERT INTO canonical_sessions (agent_id, messages, compaction_cursor, updated_at) "
            "VALUES (?, ?, 0, ?)",
            (agent_id, blob, now),
        )

    conn.commit()
    print(f"Imported {len(messages)} turns into canonical session for agent {agent_id}")
    print(f"NOTE: Restart the agent or session for changes to take effect.")
    conn.close()


def backup_session(instance_id, agent_name=None):
    """Backup canonical session (raw msgpack) before model swap."""
    conn = connect_db(instance_id)
    cur = conn.cursor()

    if agent_name:
        cur.execute(
            "SELECT cs.agent_id, cs.messages, cs.compacted_summary, a.name "
            "FROM canonical_sessions cs JOIN agents a ON cs.agent_id = a.id "
            "WHERE a.name = ?",
            (agent_name,),
        )
    else:
        cur.execute(
            "SELECT cs.agent_id, cs.messages, cs.compacted_summary, a.name "
            "FROM canonical_sessions cs JOIN agents a ON cs.agent_id = a.id "
            "LIMIT 1",
        )

    row = cur.fetchone()
    if not row:
        print("Error: No canonical session found", file=sys.stderr)
        sys.exit(1)

    agent_id, blob, summary, name = row
    messages = decode_messages(blob)

    backup_dir = get_backup_dir(instance_id)
    timestamp = datetime.now().strftime("%Y%m%d-%H%M%S")

    # Save raw msgpack (for exact restore)
    msgpack_path = os.path.join(backup_dir, f"{name}-{timestamp}.msgpack")
    with open(msgpack_path, "wb") as f:
        f.write(blob)

    # Also save human-readable JSON (for editing)
    json_path = os.path.join(backup_dir, f"{name}-{timestamp}.json")
    export = {
        "_meta": {
            "instance": instance_id,
            "agent_id": agent_id,
            "agent_name": name,
            "backed_up_at": datetime.now().astimezone().isoformat(),
            "turn_count": len(messages),
            "compacted_summary": summary,
        },
        "messages": messages,
    }
    with open(json_path, "w") as f:
        json.dump(export, f, indent=2, ensure_ascii=False, default=str)

    # Also backup JSONL mirrors
    ws_sessions = Path(get_workspaces_dir(instance_id)) / name / "sessions"
    if ws_sessions.exists():
        for jsonl in ws_sessions.glob("*.jsonl"):
            dst = os.path.join(backup_dir, f"{name}-{timestamp}-{jsonl.name}")
            shutil.copy2(jsonl, dst)

    print(f"Backup complete:")
    print(f"  Raw msgpack:  {msgpack_path}")
    print(f"  Editable JSON: {json_path}")
    print(f"  Turn count:    {len(messages)}")
    conn.close()
    return msgpack_path, json_path


def restore_session(instance_id, backup_path, agent_name=None):
    """Restore canonical session from backup (msgpack or JSON)."""
    if backup_path.endswith(".msgpack"):
        with open(backup_path, "rb") as f:
            blob = f.read()
        messages = decode_messages(blob)
    elif backup_path.endswith(".json"):
        with open(backup_path) as f:
            data = json.load(f)
        messages = data["messages"]
        blob = encode_messages(messages)
    else:
        print("Error: Backup must be .msgpack or .json", file=sys.stderr)
        sys.exit(1)

    conn = connect_db(instance_id)
    cur = conn.cursor()

    if agent_name:
        cur.execute("SELECT id FROM agents WHERE name = ?", (agent_name,))
    else:
        cur.execute("SELECT id FROM agents LIMIT 1")

    row = cur.fetchone()
    if not row:
        print("Error: No agent found", file=sys.stderr)
        sys.exit(1)
    agent_id = row[0]

    now = datetime.now().astimezone().isoformat()
    cur.execute(
        "UPDATE canonical_sessions SET messages = ?, updated_at = ? WHERE agent_id = ?",
        (blob, now, agent_id),
    )

    if cur.rowcount == 0:
        cur.execute(
            "INSERT INTO canonical_sessions (agent_id, messages, compaction_cursor, updated_at) "
            "VALUES (?, ?, 0, ?)",
            (agent_id, blob, now),
        )

    conn.commit()
    print(f"Restored {len(messages)} turns from {backup_path}")
    print(f"NOTE: Restart the agent for changes to take effect.")
    conn.close()


def show_summary(instance_id, agent_name=None):
    """Show session summary with turn counts and rough token estimate."""
    conn = connect_db(instance_id)
    cur = conn.cursor()

    if agent_name:
        cur.execute(
            "SELECT cs.messages, cs.compaction_cursor, cs.compacted_summary, a.name "
            "FROM canonical_sessions cs JOIN agents a ON cs.agent_id = a.id "
            "WHERE a.name = ?",
            (agent_name,),
        )
    else:
        cur.execute(
            "SELECT cs.messages, cs.compaction_cursor, cs.compacted_summary, a.name "
            "FROM canonical_sessions cs JOIN agents a ON cs.agent_id = a.id",
        )

    for row in cur.fetchall():
        blob, compactions, summary, name = row
        messages = decode_messages(blob)

        # Count by role
        role_counts = {}
        total_chars = 0
        for msg in messages:
            role = msg.get("role", "unknown") if isinstance(msg, dict) else "unknown"
            role_counts[role] = role_counts.get(role, 0) + 1
            content = msg.get("content", "") if isinstance(msg, dict) else str(msg)
            if isinstance(content, str):
                total_chars += len(content)

        # Rough token estimate (4 chars per token)
        est_tokens = total_chars // 4

        print(f"\n=== {name} — Canonical Session ===")
        print(f"  Total turns: {len(messages)}")
        print(f"  Compactions: {compactions}")
        for role, count in sorted(role_counts.items()):
            print(f"  {role}: {count} turns")
        print(f"  Est. tokens: ~{est_tokens:,}")
        if summary:
            print(f"  Summary: {summary[:200]}...")

    conn.close()


def delete_turns(instance_id, indices, agent_name=None):
    """Delete specific turns by index from canonical session."""
    conn = connect_db(instance_id)
    cur = conn.cursor()

    if agent_name:
        cur.execute(
            "SELECT cs.agent_id, cs.messages, a.name "
            "FROM canonical_sessions cs JOIN agents a ON cs.agent_id = a.id "
            "WHERE a.name = ?",
            (agent_name,),
        )
    else:
        cur.execute(
            "SELECT cs.agent_id, cs.messages, a.name "
            "FROM canonical_sessions cs JOIN agents a ON cs.agent_id = a.id "
            "LIMIT 1",
        )

    row = cur.fetchone()
    if not row:
        print("Error: No canonical session found", file=sys.stderr)
        sys.exit(1)

    agent_id, blob, name = row
    messages = decode_messages(blob)

    # Validate indices
    indices = sorted(set(indices), reverse=True)
    for idx in indices:
        if idx < 0 or idx >= len(messages):
            print(f"Error: Index {idx} out of range (0-{len(messages) - 1})", file=sys.stderr)
            sys.exit(1)

    # Show what will be deleted
    print(f"Deleting {len(indices)} turns from {name}:")
    for idx in sorted(indices):
        msg = messages[idx]
        role = msg.get("role", "?") if isinstance(msg, dict) else "?"
        content = msg.get("content", "") if isinstance(msg, dict) else str(msg)
        preview = (content[:80] + "...") if isinstance(content, str) and len(content) > 80 else content
        print(f"  [{idx}] {role}: {preview}")

    # Delete
    for idx in indices:  # Already sorted reverse
        del messages[idx]

    blob = encode_messages(messages)
    now = datetime.now().astimezone().isoformat()
    cur.execute(
        "UPDATE canonical_sessions SET messages = ?, updated_at = ? WHERE agent_id = ?",
        (blob, now, agent_id),
    )
    conn.commit()
    print(f"\nDeleted. {len(messages)} turns remaining.")
    print(f"NOTE: Restart the agent for changes to take effect.")
    conn.close()


def main():
    parser = argparse.ArgumentParser(
        description="OpenFang Session Editor — view, edit, backup, restore conversation history"
    )
    parser.add_argument("--instance", "-i", required=True, help="Instance ID (e.g., Genevieve, Flair-2a84)")
    parser.add_argument("--agent", "-a", help="Agent name (default: first agent found)")

    subparsers = parser.add_subparsers(dest="command", help="Command")

    # list
    subparsers.add_parser("list", help="List agents and sessions")

    # summary
    subparsers.add_parser("summary", help="Show session summary")

    # export
    p_export = subparsers.add_parser("export", help="Export canonical session to JSON")
    p_export.add_argument("--output", "-o", default="-", help="Output file (default: stdout)")

    # export-jsonl
    p_ejsonl = subparsers.add_parser("export-jsonl", help="Export JSONL mirror to JSON")
    p_ejsonl.add_argument("--output", "-o", default="-", help="Output file (default: stdout)")

    # import
    p_import = subparsers.add_parser("import", help="Import JSON into canonical session")
    p_import.add_argument("--input", required=True, help="JSON file to import")

    # backup
    subparsers.add_parser("backup", help="Backup canonical session (msgpack + JSON)")

    # restore
    p_restore = subparsers.add_parser("restore", help="Restore from backup")
    p_restore.add_argument("--backup", required=True, help="Backup file (.msgpack or .json)")

    # delete-turns
    p_delete = subparsers.add_parser("delete-turns", help="Delete specific turns by index")
    p_delete.add_argument("indices", type=int, nargs="+", help="Turn indices to delete (0-based)")

    args = parser.parse_args()

    if not args.command:
        parser.print_help()
        sys.exit(1)

    if args.command == "list":
        list_agents_and_sessions(args.instance)
    elif args.command == "summary":
        show_summary(args.instance, args.agent)
    elif args.command == "export":
        export_canonical(args.instance, args.output, args.agent)
    elif args.command == "export-jsonl":
        export_jsonl(args.instance, args.output, args.agent)
    elif args.command == "import":
        import_session(args.instance, args.input, args.agent)
    elif args.command == "backup":
        backup_session(args.instance, args.agent)
    elif args.command == "restore":
        restore_session(args.instance, args.backup, args.agent)
    elif args.command == "delete-turns":
        delete_turns(args.instance, args.indices, args.agent)


if __name__ == "__main__":
    main()
