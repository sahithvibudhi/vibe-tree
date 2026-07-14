#!/bin/bash

# VibeTree Docker Deployment Script
# This script builds and runs VibeTree in a Docker container with a single command

set -e  # Exit on any error

echo "🚀 Starting VibeTree Docker Deployment..."

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo "❌ Error: Docker is not running. Please start Docker and try again."
    exit 1
fi

# Check if pnpm is available
if ! command -v pnpm &> /dev/null; then
    echo "❌ Error: pnpm is not installed. Please install pnpm and try again."
    exit 1
fi

echo "📦 Building VibeTree locally..."
pnpm build:web && pnpm --filter @vibetree/server build

echo "🐳 Building Docker image..."
docker build -t vibetree-webapp .

echo "🛑 Stopping any existing VibeTree container..."
docker stop vibetree-container 2>/dev/null || true
docker rm vibetree-container 2>/dev/null || true

echo "🌟 Starting VibeTree container..."
docker run -d \
  -p 3000:3000 \
  -p 3002:3002 \
  --name vibetree-container \
  --restart unless-stopped \
  vibetree-webapp

echo ""
echo "✅ VibeTree is now running!"
echo "🌐 Web UI: http://localhost:3000"
echo "🔌 API Server: http://localhost:3002"
echo ""
echo "📋 Useful commands:"
echo "   View logs: docker logs -f vibetree-container"
echo "   Stop: docker stop vibetree-container"
echo "   Restart: docker restart vibetree-container"
echo ""
echo "🎉 Deployment complete!"