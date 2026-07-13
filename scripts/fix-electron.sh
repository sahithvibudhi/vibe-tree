#!/bin/bash

# Ultimate simple fix for Electron - works with any version
echo "🔧 Fixing Electron..."

# Find the electron directory (works with any version)
ELECTRON_DIR=$(find node_modules/.pnpm -maxdepth 2 -name "electron@*" -type d | head -1)

if [ -n "$ELECTRON_DIR" ]; then
    cd "$ELECTRON_DIR/node_modules/electron"
    rm -rf dist
    npm run postinstall
    echo "✅ Electron fixed! Run: pnpm dev:desktop"
else
    echo "❌ Electron not found. Running pnpm install..."
    pnpm install
fi