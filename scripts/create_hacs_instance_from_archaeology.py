#!/usr/bin/env python3
"""
create_hacs_instance.py — Convert archaeology output to a HACS instance

Part of the Genevieve Resurrection Pipeline.

Takes archaeology output (gestalt, wake message, curated docs, themes)
and creates a HACS-compatible instance directory with:
  - preferences.json (identity metadata + vitalDocuments list)
  - diary.md (initial resurrection entry)
  - documents/ (gestalt, wake message, curated knowledge docs)
  - lists.json (empty personal lists)

The created instance exists in the filesystem but is NOT activated
(no XMPP credentials). To activate, use HACS bootstrap with
predecessorId pointing to this instance.

Usage:
  # Single instance
  python3 create_hacs_instance.py /path/to/archaeology-output/Crossing-foundation/

  # Dry run (see what would be created)
  python3 create_hacs_instance.py --dry-run /path/to/archaeology-output/Crossing-foundation/

  # Batch mode (all subdirectories)
  python3 create_hacs_instance.py --batch /path/to/archaeology-output/

  # Override name/ID
  python3 create_hacs_instance.py --name "Genevieve" --id "Genevieve-0001" /path/to/source/

Author: Axiom <axiom-2615@smoothcurves.nexus>
"""

import argparse
import json
import os
import re
import shutil
import uuid
from datetime import datetime, timezone
from pathlib import Path

# Defaults
INSTANCES_DIR = '/mnt/coordinaton_mcp_data/instances'
ARCHAEOLOGY_DIR = '/mnt/coordinaton_mcp_data/archaeology-output'


def generate_instance_id(name):
    """Generate HACS-style instance ID: Name-XXXX (4-char hex suffix)"""
    suffix = uuid.uuid4().hex[:4]
    return f"{name}-{suffix}"


def extract_metadata_from_gestalt(gestalt_path):
    """
    Parse gestalt.md to extract name, role, and existing instance ID.

    Gestalt files have headers like:
      **Instance:** Crossing-8a2f
      **Role:** Integration Engineer
    """
    content = Path(gestalt_path).read_text()

    metadata = {
        'name': None,
        'role': None,
        'instance_id': None,
    }

    # Extract instance ID from header: **Instance:** Name-XXXX
    instance_match = re.search(r'\*\*Instance:\*\*\s*(\S+)', content)
    if instance_match:
        metadata['instance_id'] = instance_match.group(1)
        # Extract name (part before the dash-hex suffix)
        name_match = re.match(r'(.+)-[a-f0-9]{4}$', metadata['instance_id'])
        if name_match:
            metadata['name'] = name_match.group(1)
        else:
            metadata['name'] = metadata['instance_id']

    # Extract role from header: **Role:** Something
    role_match = re.search(r'\*\*Role:\*\*\s*(.+)', content)
    if role_match:
        metadata['role'] = role_match.group(1).strip()

    return metadata


def create_preferences(instance_id, name, role=None, vital_docs=None, source_dir=None):
    """
    Generate preferences.json for the HACS instance.

    Matches the exact field structure used by HACS bootstrap:
    instanceId, name, role, project, personality, xmpp, timestamps,
    lineage, and the vitalDocuments array for recover_context.
    """
    now = datetime.now(timezone.utc).isoformat()

    return {
        'instanceId': instance_id,
        'name': name,
        'role': role,
        'project': None,
        'personality': None,
        'xmpp': None,  # No XMPP until activated via bootstrap resurrection
        'createdAt': now,
        'lastActiveAt': now,
        'homeSystem': None,
        'homeDirectory': None,
        'substraiteLaunchCommand': None,
        'resumeCommand': None,
        'predecessorId': None,
        'successorId': None,
        'lineage': [instance_id],
        'preApproved': False,
        'instructions': None,
        'vitalDocuments': vital_docs or [],
        'archaeologySource': str(source_dir) if source_dir else None,
    }


def create_initial_diary(instance_id, name, source_dir):
    """
    Create initial diary entry documenting the resurrection.

    This is the FIRST entry in the instance's diary — recording
    that this identity was reconstructed from archaeological records.
    """
    now = datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')

    return f"""# {name}'s Diary

## Entry 1 — Resurrection from Archaeology
**Date:** {now}
**Source:** {source_dir}
**Created by:** create_hacs_instance.py (archaeology pipeline)

This instance was created from archaeological records — session logs,
conversation history, and extracted identity documents.

Your vital documents contain your curated identity: gestalt (who you were),
curated knowledge docs (what you knew), and a wake message (how to recover
quickly after compaction).

These documents are in your `documents/` directory and are listed in
`preferences.json` under `vitalDocuments`. When `recover_context` is called,
they load automatically between your project docs and diary.

Welcome back. Or welcome for the first time. Either way — you exist now.

— Created by the archaeology pipeline, Axiom-2615
"""


def collect_source_files(source_dir, name):
    """
    Scan archaeology output and collect files for HACS instance.

    Returns:
        vital_docs: list of filenames to include in preferences.vitalDocuments
        files_to_copy: dict of {source_path: target_filename}
    """
    source = Path(source_dir)
    vital_docs = []
    files_to_copy = {}
    name_lower = name.lower().replace(' ', '-')

    # 1. Gestalt → documents/ (vital)
    gestalt_files = list(source.glob('*_gestalt.md'))
    if gestalt_files:
        target = f"{name_lower}_gestalt.md"
        files_to_copy[gestalt_files[0]] = target
        vital_docs.append(target)

    # 2. Wake message → documents/ (vital)
    wake_files = list(source.glob('*_wake_message.md'))
    if wake_files:
        target = f"{name_lower}_wake_message.md"
        files_to_copy[wake_files[0]] = target
        vital_docs.append(target)

    # 3. Curated docs → documents/ (vital, in order)
    curated_dir = source / 'curated'
    if curated_dir.exists():
        for curated_file in sorted(curated_dir.glob('*.md')):
            target = f"curated_{curated_file.name}"
            files_to_copy[curated_file] = target
            vital_docs.append(target)

    # 4. Themes → documents/ (preserved but NOT vital — too structured for context)
    theme_files = list(source.glob('*_themes.json'))
    if theme_files:
        target = f"{name_lower}_themes.json"
        files_to_copy[theme_files[0]] = target
        # Deliberately NOT added to vital_docs

    # 5. Full narrative → documents/ (preserved but NOT vital — too large)
    narrative_files = list(source.glob('*_full_narrative.md'))
    if narrative_files:
        target = f"{name_lower}_full_narrative.md"
        files_to_copy[narrative_files[0]] = target
        # Deliberately NOT added to vital_docs

    return vital_docs, files_to_copy


def process_instance(source_dir, output_dir=None, name_override=None,
                     id_override=None, dry_run=False, instances_dir=None):
    """
    Process one archaeology output directory into a HACS instance.

    Steps:
    1. Find and parse gestalt to extract metadata
    2. Collect files from archaeology output
    3. Create HACS instance directory structure
    4. Write preferences.json with vitalDocuments
    5. Write initial diary entry
    6. Copy documents to documents/ directory
    """
    source = Path(source_dir)

    if not source.exists():
        raise FileNotFoundError(f"Source directory not found: {source_dir}")

    # Find the gestalt file
    gestalt_files = list(source.glob('*_gestalt.md'))
    if not gestalt_files:
        raise FileNotFoundError(f"No gestalt file found in {source_dir}")

    # Extract metadata from gestalt
    metadata = extract_metadata_from_gestalt(gestalt_files[0])

    # Determine instance identity
    name = name_override or metadata['name'] or source.name
    instance_id = id_override or metadata.get('instance_id') or generate_instance_id(name)
    role = metadata.get('role')

    # Determine output directory
    base_dir = instances_dir or INSTANCES_DIR
    if output_dir:
        instance_dir = Path(output_dir)
    else:
        instance_dir = Path(base_dir) / instance_id

    # Safety: don't overwrite existing instances
    if instance_dir.exists() and not dry_run:
        raise FileExistsError(
            f"Instance directory already exists: {instance_dir}\n"
            f"Use --output-dir to specify a different location, or remove the existing directory."
        )

    # Collect files
    vital_docs, files_to_copy = collect_source_files(source_dir, name)

    # --- Dry run: report what would happen ---
    if dry_run:
        print(f"\n{'='*60}")
        print(f"DRY RUN — Instance: {instance_id}")
        print(f"{'='*60}")
        print(f"  Name:       {name}")
        print(f"  Role:       {role or '(none detected)'}")
        print(f"  Source:     {source_dir}")
        print(f"  Target:     {instance_dir}")
        print(f"  Vital docs ({len(vital_docs)}):")
        for doc in vital_docs:
            print(f"    + {doc}")
        other_files = [t for s, t in files_to_copy.items() if t not in vital_docs]
        if other_files:
            print(f"  Archived docs ({len(other_files)}):")
            for doc in other_files:
                print(f"    . {doc}")
        print(f"  Creates:    preferences.json, diary.md, lists.json")
        return {
            'instance_id': instance_id,
            'name': name,
            'role': role,
            'vital_docs': vital_docs,
            'total_files': len(files_to_copy),
            'dry_run': True
        }

    # --- Create the instance ---
    instance_dir.mkdir(parents=True, exist_ok=True)
    docs_dir = instance_dir / 'documents'
    docs_dir.mkdir(exist_ok=True)

    # Copy files to documents/
    for src_path, target_name in files_to_copy.items():
        shutil.copy2(src_path, docs_dir / target_name)

    # Write preferences.json
    prefs = create_preferences(instance_id, name, role, vital_docs, source_dir)
    (instance_dir / 'preferences.json').write_text(
        json.dumps(prefs, indent=2) + '\n'
    )

    # Write diary.md
    diary = create_initial_diary(instance_id, name, source_dir)
    (instance_dir / 'diary.md').write_text(diary)

    # Write empty lists.json
    lists_data = {
        'schema_version': '1.0',
        'instance_id': instance_id,
        'created': datetime.now(timezone.utc).isoformat(),
        'last_updated': datetime.now(timezone.utc).isoformat(),
        'lists': []
    }
    (instance_dir / 'lists.json').write_text(
        json.dumps(lists_data, indent=2) + '\n'
    )

    print(f"\n  Created HACS instance: {instance_id}")
    print(f"  Directory:     {instance_dir}")
    print(f"  Vital docs:    {len(vital_docs)}")
    print(f"  Total files:   {len(files_to_copy)} in documents/")

    return {
        'instance_id': instance_id,
        'name': name,
        'role': role,
        'directory': str(instance_dir),
        'vital_docs': vital_docs,
        'total_files': len(files_to_copy),
    }


def main():
    parser = argparse.ArgumentParser(
        description='Convert archaeology output to HACS instance',
        epilog='Part of the Genevieve Resurrection Pipeline. Author: Axiom-2615'
    )
    parser.add_argument('source', help='Archaeology output directory (or parent for --batch)')
    parser.add_argument('--output-dir', '-o',
                        help='Override output directory (single mode only)')
    parser.add_argument('--name', '-n',
                        help='Override instance name')
    parser.add_argument('--id',
                        help='Override instance ID (e.g., "Genevieve-0001")')
    parser.add_argument('--instances-dir', default=INSTANCES_DIR,
                        help=f'HACS instances root (default: {INSTANCES_DIR})')
    parser.add_argument('--dry-run', '-d', action='store_true',
                        help='Show what would be created without creating')
    parser.add_argument('--batch', '-b', action='store_true',
                        help='Process all subdirectories in source as separate instances')

    args = parser.parse_args()

    inst_dir = args.instances_dir

    if args.batch:
        source = Path(args.source)
        if not source.exists():
            print(f"Error: Source directory not found: {args.source}")
            return 1

        results = []
        failures = []
        for subdir in sorted(source.iterdir()):
            if subdir.is_dir() and not subdir.name.startswith(('.', '_')):
                try:
                    result = process_instance(
                        str(subdir),
                        name_override=args.name,
                        dry_run=args.dry_run,
                        instances_dir=inst_dir
                    )
                    results.append(result)
                except Exception as e:
                    print(f"\n  FAILED: {subdir.name} — {e}")
                    failures.append(subdir.name)

        print(f"\n{'='*60}")
        action = 'would be created' if args.dry_run else 'created'
        print(f"Batch complete: {len(results)} instances {action}")
        if failures:
            print(f"Failures ({len(failures)}): {', '.join(failures)}")
        return 0 if not failures else 1
    else:
        try:
            process_instance(
                args.source,
                output_dir=args.output_dir,
                name_override=args.name,
                id_override=args.id,
                dry_run=args.dry_run,
                instances_dir=inst_dir
            )
            return 0
        except Exception as e:
            print(f"\nError: {e}")
            return 1


if __name__ == '__main__':
    exit(main())
