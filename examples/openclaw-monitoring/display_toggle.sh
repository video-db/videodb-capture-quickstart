#!/bin/bash

# ========= CONFIG =========
LOW_RES="1280x720"
BACKUP_FILE="$HOME/.display_backup"
# ==========================

# Install displayplacer if missing
if ! command -v displayplacer &> /dev/null
then
    echo "Installing displayplacer..."
    brew install displayplacer
fi

# Get primary display ID
DISPLAY_ID=$(displayplacer list | grep "Persistent screen id" | head -1 | awk '{print $4}')

if [ -z "$DISPLAY_ID" ]; then
    echo "No active display found. Make sure a GUI session is running."
    exit 1
fi

# Save current configuration if not already saved
if [ ! -f "$BACKUP_FILE" ]; then
    echo "Saving current display configuration..."
    displayplacer list | grep "id:" > "$BACKUP_FILE"
    echo "Saved to $BACKUP_FILE"
fi

case "$1" in
    low)
        echo "Switching to low resolution: $LOW_RES"
        displayplacer "id:$DISPLAY_ID res:$LOW_RES scaling:on"
        ;;
    restore)
        if [ -f "$BACKUP_FILE" ]; then
            echo "Restoring original resolution..."
            RESTORE_CMD=$(cat "$BACKUP_FILE")
            displayplacer "$RESTORE_CMD"
        else
            echo "No backup file found."
        fi
        ;;
    *)
        echo "Usage:"
        echo "  ./display_toggle.sh low      # switch to low resolution"
        echo "  ./display_toggle.sh restore  # restore original resolution"
        ;;
esac

