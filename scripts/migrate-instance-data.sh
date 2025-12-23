#!/bin/bash
# Migrate instance data from v2-dev-data to consolidated instances directory
# Author: Crossing (Integration Engineer)
# Date: 2025-12-22

set -e

SOURCE="/mnt/coordinaton_mcp_data/v2-dev-data/instances"
TARGET="/mnt/coordinaton_mcp_data/instances"

echo "=== Instance Data Migration ==="
echo "FROM: $SOURCE"
echo "TO:   $TARGET"
echo ""

# Count instances
INSTANCE_COUNT=$(ls -1 "$SOURCE" | wc -l)
echo "Found $INSTANCE_COUNT instances to migrate"
echo ""

MIGRATED=0
SKIPPED=0

for instance_dir in "$SOURCE"/*; do
    if [ ! -d "$instance_dir" ]; then
        continue
    fi

    instance_id=$(basename "$instance_dir")
    target_dir="$TARGET/$instance_id"

    echo "Processing: $instance_id"

    # Create target directory if doesn't exist
    if [ ! -d "$target_dir" ]; then
        mkdir -p "$target_dir"
        echo "  Created directory: $target_dir"
    fi

    # Move API data files
    for file in preferences.json diary.md personal_tasks.json lists.json conversation.log; do
        if [ -f "$instance_dir/$file" ]; then
            # Use cp + rm instead of mv for cross-device safety
            cp "$instance_dir/$file" "$target_dir/"
            rm "$instance_dir/$file"
            echo "  Moved: $file"
        fi
    done

    # Set ownership - check if Unix user exists
    # Convert instance_id to valid unix username (replace spaces with _, remove special chars)
    unix_user=$(echo "$instance_id" | tr ' ' '_' | tr -cd '[:alnum:]_-')

    if id "$unix_user" &>/dev/null; then
        chown -R "$unix_user:$unix_user" "$target_dir"
        echo "  Set ownership to: $unix_user"
    else
        echo "  Keeping root ownership (no Unix user for $instance_id)"
    fi

    MIGRATED=$((MIGRATED + 1))
    echo ""
done

echo "=== Migration Complete ==="
echo "Migrated: $MIGRATED instances"
echo "Skipped:  $SKIPPED instances"
