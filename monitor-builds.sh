#!/bin/bash

echo "Monitoring builds 19-23 (latest 5 with AbortController fix)..."
echo ""

while true; do
  BUILDS=$(gh run list --branch fix-worker-teardown-timeout --limit 5 --json databaseId,status,conclusion)

  COMPLETED=$(echo "$BUILDS" | jq '[.[] | select(.status == "completed")] | length')

  echo "$(date +%H:%M:%S) - Completed: $COMPLETED/5"

  if [ "$COMPLETED" = "5" ]; then
    echo ""
    echo "=== ALL 5 BUILDS COMPLETED ==="
    echo ""
    echo "$BUILDS" | jq -r '.[] | "Build \(.databaseId): \(.conclusion)"'

    PASSED=$(echo "$BUILDS" | jq '[.[] | select(.conclusion == "success")] | length')
    FAILED=$(echo "$BUILDS" | jq '[.[] | select(.conclusion != "success")] | length')

    echo ""
    echo "Final Results: $PASSED passed, $FAILED failed"
    echo ""

    if [ "$PASSED" = "5" ]; then
      echo "✅ SUCCESS: All 5 builds passed!"
      exit 0
    else
      echo "❌ FAILURE: $FAILED build(s) failed"
      echo "Failed builds:"
      echo "$BUILDS" | jq -r '.[] | select(.conclusion != "success") | "  - Build \(.databaseId): \(.conclusion)"'
      exit 1
    fi
  fi

  sleep 30
done
