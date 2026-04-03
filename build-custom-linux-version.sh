#!/bin/bash

# Build script for custom VibeTree variations (Linux)
# Usage: ./build-custom-linux-version.sh [VARIATION_NAME]
# Example: ./build-custom-linux-version.sh Nov2  -> Creates VibeTreeNov2 AppImage

set -e  # Exit on error

# --- Detect package manager ---
install_pkg() {
  if command -v pacman &>/dev/null; then
    sudo pacman -S --needed --noconfirm "$@"
  elif command -v apt-get &>/dev/null; then
    sudo apt-get update && sudo apt-get install -y "$@"
  elif command -v dnf &>/dev/null; then
    sudo dnf install -y "$@"
  else
    echo "Error: Could not detect package manager (pacman/apt/dnf). Install manually: $*"
    exit 1
  fi
}

# --- Install Node.js if missing ---
if ! command -v node &>/dev/null; then
  echo "Node.js not found, installing..."
  if command -v pacman &>/dev/null; then
    install_pkg nodejs npm
  elif command -v apt-get &>/dev/null; then
    # Use NodeSource for a recent version on Debian/Ubuntu
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
    sudo apt-get install -y nodejs
  elif command -v dnf &>/dev/null; then
    install_pkg nodejs npm
  fi
fi

echo "Node.js version: $(node --version)"

# --- Install pnpm if missing ---
if ! command -v pnpm &>/dev/null; then
  echo "pnpm not found, installing..."
  if command -v corepack &>/dev/null; then
    sudo corepack enable
    sudo corepack prepare pnpm@8.14.0 --activate
  else
    echo "corepack not available, installing pnpm via npm..."
    sudo npm install -g pnpm@8.14.0
  fi
fi

echo "pnpm version: $(pnpm --version)"

# --- Install native build dependencies for node-pty / electron ---
echo "Checking native build dependencies..."
if command -v pacman &>/dev/null; then
  install_pkg base-devel python python-setuptools libxkbfile jq
elif command -v apt-get &>/dev/null; then
  install_pkg build-essential python3 python3-setuptools libxkbfile-dev jq
elif command -v dnf &>/dev/null; then
  install_pkg gcc-c++ make python3 python3-setuptools libxkbfile-devel jq
fi

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

# Cleanup function to restore config on exit
cleanup() {
  if [ -f "${BACKUP_CONFIG}" ]; then
    echo "Restoring original electron-builder config..."
    mv "${BACKUP_CONFIG}" "${ELECTRON_BUILDER_CONFIG}"
  fi
}

# Set trap to call cleanup on script exit
trap cleanup EXIT

echo "Installing project dependencies..."
pnpm install

echo "Building core package..."
pnpm --filter @vibetree/core build

echo "Building VibeTree desktop app..."
pnpm --filter @vibetree/desktop build

echo "Updating electron-builder config with custom product name..."
# Backup original config
cp "${ELECTRON_BUILDER_CONFIG}" "${BACKUP_CONFIG}"

# Update productName and set linux target to AppImage only using jq
if command -v jq &>/dev/null; then
  jq --arg name "${PRODUCT_NAME}" \
     '.productName = $name | .linux.target = [{"target": "AppImage", "arch": ["x64"]}]' \
     "${ELECTRON_BUILDER_CONFIG}" > "${ELECTRON_BUILDER_CONFIG}.tmp" \
    && mv "${ELECTRON_BUILDER_CONFIG}.tmp" "${ELECTRON_BUILDER_CONFIG}"
else
  echo "Error: jq is required for config manipulation. Install it with your package manager."
  exit 1
fi

echo "Packaging the app as ${PRODUCT_NAME}..."
pnpm --filter @vibetree/desktop package --linux

# Find the built AppImage
APPIMAGE_FILE=$(ls apps/desktop/release/${PRODUCT_NAME}*.AppImage 2>/dev/null | head -1)

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

echo ""
echo "Build complete! Output files are in apps/desktop/release/"
