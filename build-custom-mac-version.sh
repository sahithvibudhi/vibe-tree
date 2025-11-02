#!/bin/bash

# Build script for custom VibeTree variations (macOS only)
# Usage: ./build-custom-mac-version.sh [VARIATION_NAME]
# Example: ./build-custom-mac-version.sh Nov2  -> Creates VibeTreeNov2.app

set -e  # Exit on error

# Cleanup function to restore config on exit
cleanup() {
  if [ -f "${BACKUP_CONFIG}" ]; then
    echo "🔄 Restoring original electron-builder config..."
    mv "${BACKUP_CONFIG}" "${ELECTRON_BUILDER_CONFIG}"
  fi
}

# Set trap to call cleanup on script exit
trap cleanup EXIT

# Check if variation name is provided
if [ -z "$1" ]; then
  echo "❌ Error: VARIATION_NAME is required"
  echo "Usage: ./build-custom-mac-version.sh [VARIATION_NAME]"
  echo "Example: ./build-custom-mac-version.sh Nov2"
  exit 1
fi

VARIATION_NAME="$1"
PRODUCT_NAME="VibeTree${VARIATION_NAME}"
APP_NAME="${PRODUCT_NAME}.app"
ELECTRON_BUILDER_CONFIG="apps/desktop/electron-builder.json"
BACKUP_CONFIG="${ELECTRON_BUILDER_CONFIG}.backup"

echo "📦 Installing dependencies..."
pnpm install

echo "🔨 Building core package..."
pnpm --filter @vibetree/core build

echo "🔨 Building VibeTree desktop app..."
pnpm --filter @vibetree/desktop build

echo "📝 Updating electron-builder config with custom product name..."
# Backup original config
cp "${ELECTRON_BUILDER_CONFIG}" "${BACKUP_CONFIG}"

# Update productName in the config
if [[ "$OSTYPE" == "darwin"* ]]; then
  # macOS sed syntax
  sed -i '' "s/\"productName\": \"VibeTree\"/\"productName\": \"${PRODUCT_NAME}\"/" "${ELECTRON_BUILDER_CONFIG}"
else
  # Linux sed syntax
  sed -i "s/\"productName\": \"VibeTree\"/\"productName\": \"${PRODUCT_NAME}\"/" "${ELECTRON_BUILDER_CONFIG}"
fi

echo "📦 Packaging the app as ${PRODUCT_NAME}..."
pnpm --filter @vibetree/desktop package

echo "🗑️  Removing old ${APP_NAME} if exists..."
rm -rf "/Applications/${APP_NAME}"

echo "💿 Mounting DMG..."
DMG_FILE="apps/desktop/release/${PRODUCT_NAME}-0.0.1-arm64.dmg"
hdiutil attach "${DMG_FILE}"

echo "📋 Copying app to Applications as ${APP_NAME}..."
cp -R "/Volumes/${PRODUCT_NAME} 0.0.1-arm64/${APP_NAME}" "/Applications/${APP_NAME}"

echo "💿 Unmounting DMG..."
hdiutil detach "/Volumes/${PRODUCT_NAME} 0.0.1-arm64"

echo "✅ ${APP_NAME} has been successfully installed to /Applications/${APP_NAME}"
echo "You can now launch ${APP_NAME} from your Applications folder!"
