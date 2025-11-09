<div align="center">
  <img src="assets/icons/VibeTree.png" alt="VibeTree Logo" width="128" height="128">
  
  # VibeTree
  
  **Vibe code with AI in parallel git worktrees**
  
  [![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
  [![Release](https://img.shields.io/github/v/release/sahithvibudhi/vibe-tree)](https://github.com/sahithvibudhi/vibe-tree/releases)
</div>

---

> [!IMPORTANT]
> 🚧 **Active Development Notice**: We're currently working on adding cloud support and multi-platform capabilities. 
> For a stable desktop-only version, please use the [`release-v0.1`](https://github.com/sahithvibudhi/vibe-tree/tree/release-v0.1) branch.

---

VibeTree is a cross-platform application that enhances your development workflow by enabling parallel development with AI assistance across multiple git worktrees. Work on features simultaneously without context switching. Access from desktop, browser, or mobile devices.

## Screenshot

![VibeTree Screenshot](assets/screenshot.png)

## Demo

![VibeTree Demo](assets/demo.gif)

## Installation

### Quick Start

```bash
# Development Mode
pnpm install
pnpm dev:all  # Run both web and server

# Docker Deployment (Production)
npm run deploy  # One-command deployment

# Or run services separately:
pnpm dev:server  # Socket server on random 3XXX port
pnpm dev:web     # Web app on :3000
pnpm dev:desktop # Desktop app
```

### Desktop App

Download the latest release for your platform from the [Releases page](https://github.com/sahithvibudhi/vibe-tree/releases):

- **macOS**: Download `.dmg` file (supports both Intel and Apple Silicon)
- **Windows**: Download `.exe` installer
- **Linux**: Download `.AppImage` or `.deb` file

**Build custom versions** (macOS): `./build-custom-mac-version.sh [VARIATION_NAME]` to create a custom build with the variation name included in both the app file name and displayed app name (e.g., `./build-custom-mac-version.sh Nov2` creates VibeTreeNov2.app which displays as "VibeTreeNov2" when opened)

#### Testing with Auto-Open Project

`bin/launch-with-project /path/to/project [--name "CustomName"]` - Launch app with auto-opened project. Optional `--name` sets window title for easy identification.

### Web/Mobile Access

1. Start services: `pnpm dev:all`
2. Access locally: http://localhost:3000
3. For mobile/network access:
   - Scan the QR code shown in terminal
   - Or navigate to the network URL (e.g., http://192.168.1.x:3000)

### 🐳 Docker Deployment

Deploy VibeTree on any VM or cloud instance with one command:

```bash
npm run deploy
```

This automatically builds and runs VibeTree in a Docker container. Perfect for deployment on EC2, Digital Ocean, or any Docker-enabled environment. See [DOCKER.md](DOCKER.md) for detailed instructions.

**Access VibeTree:**
- **Web Interface**: http://localhost:3000
- **API Server**: http://localhost:3002
- **Health Check**: http://localhost:3002/health

#### Cloud Deployment

Deploy on AWS EC2, Digital Ocean, or any cloud VM:

```bash
# On your cloud instance
git clone <your-repo>
cd vibe-tree
npm run deploy
```

Configure security groups to allow ports 3000 and 3002, then access via `http://your-vm-ip:3000`.

**Safari/iOS Requirements:**
- Both services must be running (web on random 3XXX port, server on random 3XXX port)
- Allow firewall connections on both ports if prompted

#### LAN Dev Mode (no pairing)
When opening from a phone on your Wi‑Fi, the web UI loads over LAN and the web app automatically discovers and connects to the socket server via WebSocket. In development, enable LAN WebSocket access without pairing:

```bash
# Allow LAN connections to the WebSocket server in dev (no auth)
ALLOW_INSECURE_NETWORK=1 HOST=0.0.0.0 pnpm dev:server
pnpm dev:web
```

Then open the printed Network URL (e.g., http://192.168.1.x:3000) on your phone. If you still see "Not connected", you can explicitly point the web app at the socket server by creating `apps/web/.env`:

```ini
VITE_WS_URL=ws://192.168.1.x:XXXX  # Replace XXXX with actual server port
```

### Environment Variables

Create `.env` files as needed:

```bash
# apps/web/.env (optional)
VITE_WS_URL=ws://192.168.1.100:XXXX     # For custom socket server (replace XXXX with actual port)
VITE_PROJECT_PATH=/path/to/project       # Override project path

# apps/server/.env (optional)
PORT=3002                              # Socket server port (optional, uses random port by default)
HOST=0.0.0.0                          # Bind to all interfaces
PROJECT_PATH=/path/to/project          # Default project path
# In dev, allow unauthenticated LAN WebSocket connections (use only on trusted networks)
# Any of these enables it:
# ALLOW_INSECURE_NETWORK=1
# ALLOW_INSECURE_LAN=1
# ALLOW_NETWORK_DEV=1
DEFAULT_PROJECTS=/path1,/path2         # Auto-load projects (first becomes default)
# Authentication (for webapp login)
USERNAME=your_username                  # Set username for authentication
PASSWORD=your_password                  # Set password for authentication
AUTH_REQUIRED=true                     # Enable authentication

# Docker-specific variables
PROJECT_PATH=/workspace                 # Project directory inside container
WEB_PORT=3000                          # Web frontend port
NODE_ENV=production                    # Runtime environment
```

## Features

- **Parallel Development** - Work on multiple features simultaneously without stashing or switching branches
- **Persistent Terminal Sessions** - Each worktree maintains its own terminal session with full state preservation
- **Claude CLI Integration** - Seamlessly work with Claude in each terminal
- **IDE Integration** - Open any worktree directly in VS Code or Cursor
- **Multi-Project Support** - Work with multiple repositories in tabbed interface
- **Cross-Platform Access** - Desktop app, web browser, and mobile support
- **Docker Deployment** - One-command deployment for cloud VMs and production environments
- **Dark/Light Mode** - Automatic OS theme detection with manual toggle
- **macOS Native** - Proper traffic light window controls integration

## Roadmap

- [x] Mobile access - Access from your phone via web browser
- [ ] Claude notifications - Get notified when Claude finishes tasks or needs user input
- [ ] PWA offline support - Work offline on mobile devices

## Contributing

Contributions are welcome! Please read our [Contributing Guidelines](CONTRIBUTING.md) for details on our code of conduct and the process for submitting pull requests.

## License

MIT License - see the LICENSE file for details.
