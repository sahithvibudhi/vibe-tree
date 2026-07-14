# VibeTree Web Application

The web interface for VibeTree that connects to the socket server for terminal and git operations.

## Setup

### Development

```bash
# Start both web app and socket server (both use random 3XXX ports)
pnpm dev:all

# Or start them separately:
pnpm dev:server  # Socket server on random 3XXX port
pnpm dev:web     # Web app on random 3XXX port
```

### Network/Mobile Access

1. Start the services:

   ```bash
   pnpm dev:all
   ```

2. The server will display:
   - Web App URL - Access the UI here
   - Socket Server URL - API/WebSocket endpoint
   - QR code pointing to the Web App

3. For mobile access on the same network:
   - Scan the QR code, OR
   - Navigate to the Network URL shown (e.g., `http://192.168.1.100:3000`)
   - The web app will automatically discover and connect to the WebSocket server

4. **Important for Safari/iOS**:
   - The web app tries to connect to the socket server on the same IP
   - Both services must be running on their respective random ports
   - If you have firewall enabled, allow connections on the ports shown in the console output

If you see "Not connected" on mobile:

- Start the server allowing LAN dev connections (no pairing/auth):
  `ALLOW_INSECURE_NETWORK=1 HOST=0.0.0.0 pnpm dev:server`
- Optionally set an explicit socket URL in `apps/web/.env`:
  `VITE_WS_URL=ws://192.168.1.100:XXXX` (replace XXXX with actual server port)

### Configuration

Create a `.env` file (see `.env.example`):

```env
# For network access, set your machine's IP
VITE_WS_URL=ws://192.168.1.100:XXXX  # Replace XXXX with actual server port

# Optional: Set project path
VITE_PROJECT_PATH=/path/to/your/project
```

### Architecture

- **Web App**: React-based UI with Vite dev server on random 3XXX port
- **Socket Server**: Express server providing WebSocket and REST APIs on random 3XXX port
- The web app connects to the socket server for all backend operations
- No build/bundling needed for development - both run independently

### Production Build

```bash
# Build the web app
pnpm build:web

# The built files will be in apps/web/dist
# Deploy to any static hosting (Vercel, Netlify, etc.)
```

## Features

- Terminal emulation via xterm.js
- Git worktree management
- Mobile-responsive design
- Progressive Web App (PWA) support
- Real-time WebSocket communication
