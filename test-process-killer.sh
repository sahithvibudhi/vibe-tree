#!/bin/bash
# Test script that continuously writes timestamps to a file
# This helps verify if the process is actually killed

TEMP_FILE="/tmp/vibe-tree-process-test-$$"
echo "Writing to: $TEMP_FILE"

# Trap SIGTERM for graceful shutdown
trap 'echo "Received SIGTERM, cleaning up..."; rm -f "$TEMP_FILE"; exit 0' TERM

# Keep writing timestamps
while true; do
    date +%s.%N > "$TEMP_FILE"
    sleep 0.1
done
