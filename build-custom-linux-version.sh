#!/bin/bash

# Build script for custom VibeTree variations (Linux)
# Usage: ./build-custom-linux-version.sh [VARIATION_NAME]
# Example: ./build-custom-linux-version.sh Nov2  -> Creates VibeTreeNov2 AppImage

set -e  # Exit on error

# Cleanup function to restore config on exit
cleanup() {
  if [ -f "${BACKUP_CONFIG}" ]; then
    echo "Restoring original electron-builder config..."
    mv "${BACKUP_CONFIG}" "${ELECTRON_BUILDER_CONFIG}"
  fi
}

# Set trap to call cleanup on script exit
trap cleanup EXIT

# Check if variation name is provided
if [ -z "$1" ]; then
  echo "Error: VARIATION_NAME is required"
  echo "Usage: ./build-custom-linux-version.sh [VARIATION_NAME]"
  echo "Example: ./build-custom-linux-version.sh Nov2"
  exit 1
fi

VARIATION_NAME="$1"
PRODUCT_NAME="VibeTree${VARIATION_NAME}"
ELECTRON_BUILDER_CONFIG="apps/desktop/electron-builder.json"
BACKUP_CONFIG="${ELECTRON_BUILDER_CONFIG}.backup"

echo "Installing dependencies..."
pnpm install

echo "Building core package..."
pnpm --filter @vibetree/core build

echo "Building VibeTree desktop app..."
pnpm --filter @vibetree/desktop build

echo "Updating electron-builder config with custom product name..."
# Backup original config
cp "${ELECTRON_BUILDER_CONFIG}" "${BACKUP_CONFIG}"

# Update productName in the config
sed -i "s/\"productName\": \"VibeTree\"/\"productName\": \"${PRODUCT_NAME}\"/" "${ELECTRON_BUILDER_CONFIG}"

echo "Packaging the app as ${PRODUCT_NAME}..."
pnpm --filter @vibetree/desktop package

# Find the built AppImage
APPIMAGE_FILE=$(find apps/desktop/release -name "${PRODUCT_NAME}*.AppImage" -print -quit 2>/dev/null)
DEB_FILE=$(find apps/desktop/release -name "${PRODUCT_NAME}*.deb" -print -quit 2>/dev/null)

INSTALL_DIR="${HOME}/.local/bin"
mkdir -p "${INSTALL_DIR}"

if [ -n "${APPIMAGE_FILE}" ]; then
  DEST="${INSTALL_DIR}/${PRODUCT_NAME}.AppImage"
  echo "Installing AppImage to ${DEST}..."
  cp "${APPIMAGE_FILE}" "${DEST}"
  chmod +x "${DEST}"
  echo "${PRODUCT_NAME} AppImage installed to ${DEST}"
  echo "Run it with: ${DEST}"
else
  echo "Warning: No AppImage found in apps/desktop/release/"
fi

if [ -n "${DEB_FILE}" ]; then
  echo ""
  echo "A .deb package was also built: ${DEB_FILE}"
  echo "Install it with: sudo dpkg -i ${DEB_FILE}"
fi

echo ""
echo "Build complete! Output files are in apps/desktop/release/"
