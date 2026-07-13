# VibeTree Architecture

## Overview

VibeTree runs AI coding agents in parallel git worktrees. It is a pnpm + Turborepo monorepo with one architectural rule: desktop and web share the same backend. The Express/WebSocket server in `packages/server-core` is embedded by the Electron main process (bound to 127.0.0.1 with a per-launch token) and run standalone by `apps/server` for browser and phone clients.

## Directory structure

```
vibe-tree/
  apps/
    desktop/        Electron app; embeds the server on loopback
    web/            React PWA; connects to a remote server
    server/         Standalone server CLI (port discovery, QR pairing,
                    optional static serving of the built web app)
  packages/
    core/           Shared logic: git operations, worktree hooks,
                    ShellSessionManager (PTY sessions + scrollback buffers),
                    WebSocketAdapter, types
    server-core/    createVibeTreeServer(): Express + ws router, REST API,
                    AuthService, typed config
    ui/             Shared xterm Terminal component
    auth/           Login page and auth context for the web app
  scripts/          Maintenance scripts (fix-electron, docker-deploy)
```

## The unified backend

```
                      +---------------------------+
   Desktop renderer   |  packages/server-core     |   Web / PWA client
   (React + xterm)    |  Express + WebSocket      |   (React + xterm)
        |             |  ShellManager             |        |
        |  WebSocket  |  AuthService              |  WebSocket
        +------------>+  git + hooks (core)       +<-------+
                      +------------+--------------+
                                   |
                         ShellSessionManager (core)
                         one PTY per worktree+terminal,
                         output buffered for replay
```

- **Transport**: all shell and git traffic uses one WebSocket protocol (`shell:*`, `git:*` messages). The shared client is `WebSocketAdapter` in `packages/core`, used verbatim by both the desktop renderer and the web app.
- **Desktop embedding**: `apps/desktop/src/main/embedded-server.ts` starts the server on an ephemeral loopback port with a random token; the renderer fetches the endpoint over a single IPC call (`server:get-endpoint`) and connects.
- **Electron IPC** is reserved for native OS concerns: dialogs, notifications, theme, IDE launching, settings files, menu events, and diagnostics.

## Terminal session lifecycle

`ShellSessionManager` (singleton in `packages/core`) owns all PTYs:

- Session IDs are deterministic per `worktreePath + terminalId`, so a reconnecting client resumes its session instead of spawning a duplicate shell.
- Output is buffered (bounded, ~100KB) from the moment the PTY starts, even while no client is attached.
- A client disconnect (page reload, network blip, window close) only detaches that connection's listeners; the session keeps running.
- On reattach, the `shell:start` response carries the buffered scrollback; clients restore it when their local serialized snapshot is cold.
- The standalone server reaps sessions idle beyond `SESSION_IDLE_TIMEOUT_MS` (default 24h); the desktop keeps sessions until quit.

## Worktree lifecycle hooks

`packages/core/src/utils/worktree-hooks.ts` runs per-project executable scripts (`.vibetree/hooks/post-create`, `.vibetree/hooks/pre-remove`) around `git worktree add`/`remove`. Because hooks run inside the core git functions, every platform gets them through the shared server. Failure warns but never blocks; output is captured and surfaced in the UI.

## Authentication

Off by default. `packages/server-core/src/config.ts` is the single typed source of configuration (a future in-app password setup only has to write here). Modes:

- **Embedded (desktop)**: loopback + static per-launch token; safe by construction.
- **Open (default standalone)**: unauthenticated; the server warns when bound to 0.0.0.0.
- **Password**: `AUTH_REQUIRED=true` + `VIBETREE_USERNAME`/`VIBETREE_PASSWORD`; the web app shows a login page and uses session tokens.
- **QR device pairing**: short-lived tokens exchanged for 7-day JWTs.

## Testing

- **Unit (vitest)**: core (git parsing, session manager, buffers, hooks), server-core (config, WebSocket API integration with a mock PTY), desktop (renderer logic, main-process managers), ui.
- **E2E (Playwright)**: desktop suite drives the real Electron app; web suite runs a real server plus the production PWA build and proves the reload-with-scrollback flow end to end.
- CI runs lint, typecheck, unit tests, platform builds, and both e2e suites.

## Build

- `packages/core`, `ui`, `auth`: esbuild bundles (`build.js`), tsc for declarations
- `packages/server-core`, `apps/server`: tsc (CommonJS)
- `apps/desktop`: Vite renderer + tsc main/preload, packaged by electron-builder
- `apps/web`: Vite + vite-plugin-pwa (manifest, service worker, offline shell)
