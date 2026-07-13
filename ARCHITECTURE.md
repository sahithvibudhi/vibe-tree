# VibeTree Architecture

## Overview

VibeTree is a multi-platform application that enables parallel development with AI assistance across multiple git worktrees. The architecture follows a monorepo structure with clear separation between applications and shared packages.

## Directory Structure

```
vibetree/
├── apps/                    # Applications
│   ├── desktop/            # Electron desktop app
│   ├── server/             # Backend service for web/mobile
│   └── web/                # Progressive Web App
│
├── packages/               # Shared libraries
│   ├── core/              # Business logic and types
│   └── ui/                # Shared UI components
│
├── pnpm-workspace.yaml     # Workspace configuration
├── turbo.json             # Build orchestration
└── package.json           # Root package scripts
```

## Packages

### @vibetree/core

**Purpose**: Shared business logic, types, and utilities

**Key Exports**:

- **Types**: `Worktree`, `GitStatus`, `ShellSession`, etc.
- **Adapters**: `CommunicationAdapter` interface for platform abstraction
- **Utilities**: Git parsing functions (`parseWorktrees`, `parseGitStatus`)

### @vibetree/ui

**Purpose**: Shared React components for consistent UI across platforms

**Key Components**:

- `Terminal`: Cross-platform terminal component using xterm.js
- Future: `WorktreeList`, `GitDiffViewer`, common UI elements

## Applications

### @vibetree/desktop

**Platform**: Electron
**Communication**: IPC (Inter-Process Communication)
**Features**:

- Native terminal via node-pty
- Direct file system access
- IDE integration (VS Code, Cursor)
- Native git operations

### @vibetree/server

**Platform**: Node.js
**Communication**: WebSocket + REST API
**Features**:

- Terminal session management
- Git operations API
- QR code authentication
- JWT-based sessions
- Device pairing

### @vibetree/web

**Platform**: Browser (PWA)
**Communication**: WebSocket
**Features**:

- Mobile-responsive design
- Touch-optimized terminal
- Progressive Web App capabilities
- QR code scanning for pairing

## Communication Architecture

### Adapter Pattern

All applications use the same `CommunicationAdapter` interface, enabling code reuse:

```typescript
interface CommunicationAdapter {
  // Terminal operations
  startShell(worktreePath: string): Promise<ShellStartResult>;
  writeToShell(processId: string, data: string): Promise<void>;

  // Git operations
  listWorktrees(projectPath: string): Promise<Worktree[]>;
  addWorktree(projectPath: string, branch: string): Promise<void>;

  // System operations
  selectDirectory(): Promise<string>;
  getTheme(): Promise<'light' | 'dark'>;
}
```

### Implementation by Platform

**Desktop (Electron)**:

```
UI → IPCAdapter → IPC → Main Process → Native APIs
```

**Web/Mobile**:

```
UI → WebSocketAdapter → WebSocket → Server → Native APIs
```

## Key Design Decisions

### 1. Monorepo Structure

- **Reasoning**: Code sharing, unified versioning, easier refactoring
- **Tool**: pnpm workspaces + Turborepo for efficient builds

### 2. Adapter Pattern

- **Reasoning**: Platform abstraction without code duplication
- **Benefit**: Same components work on desktop and web

### 3. Shared UI Components

- **Reasoning**: Consistent user experience across platforms
- **Implementation**: React components in @vibetree/ui package

### 4. Git Operations in Core

- **Reasoning**: Parsing logic is platform-independent
- **Benefit**: Server and desktop use same git utilities

## Security Considerations

### Authentication Flow

1. Desktop app generates QR code with temporary token (5 min expiry)
2. Mobile device scans and sends device info
3. Server validates token and issues JWT (7 day expiry)
4. All subsequent requests use JWT authentication

### Network Security

- Local network only by default
- HTTPS/WSS recommended for production
- Device fingerprinting for session management
- Automatic session cleanup for inactive connections

## Development Workflow

### Commands

```bash
# Install dependencies
pnpm install

# Development
pnpm dev           # All services
pnpm dev:desktop   # Desktop only
pnpm dev:server    # Server only
pnpm dev:web       # Web only

# Building
pnpm build         # All packages
pnpm package:desktop  # Package desktop app

# Type checking
pnpm typecheck
```

### Adding New Features

1. **Shared Logic**: Add to `packages/core`
2. **UI Components**: Add to `packages/ui`
3. **Platform-Specific**: Add to respective app in `apps/`

### Testing Changes

1. Build core packages first: `pnpm build --filter @vibetree/core`
2. Test in target application: `pnpm dev:desktop`
3. Verify cross-platform compatibility

## Future Enhancements

### Near Term

- [ ] React Native mobile app (`apps/mobile`)
- [ ] Shared UI component library expansion
- [ ] WebRTC for P2P connections
- [ ] Cloud sync capabilities

### Long Term

- [ ] Collaborative features (shared sessions)
- [ ] Plugin system for extensibility
- [ ] Self-hosted server option
- [ ] End-to-end encryption for remote access

## Performance Considerations

### Terminal Rendering

- Virtual scrolling for large outputs
- Serialization for session persistence
- Efficient diff algorithms for git operations

### Build Optimization

- Turborepo caching for unchanged packages
- Tree shaking for smaller bundles
- Code splitting in web application

### Network Optimization

- WebSocket connection pooling
- Message batching for bulk operations
- Automatic reconnection with exponential backoff

## Deployment

### Desktop

- Electron Builder for cross-platform packages
- Auto-updater for seamless updates
- Code signing for trusted distribution

### Server

- Docker containerization
- Environment-based configuration
- Health check endpoints
- Graceful shutdown handling

### Web

- Static hosting (Vercel, Netlify, etc.)
- PWA manifest for installability
- Service worker for offline capability
- CDN for global distribution
