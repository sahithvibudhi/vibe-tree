<div align="center">
  <img src="assets/icons/VibeTree.png" alt="VibeTree Logo" width="128" height="128">

# VibeTree

**Run every AI coding agent in its own git worktree, in parallel.**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Release](https://img.shields.io/github/v/release/sahithvibudhi/vibe-tree)](https://github.com/sahithvibudhi/vibe-tree/releases)
[![CI](https://github.com/sahithvibudhi/vibe-tree/actions/workflows/ci.yml/badge.svg)](https://github.com/sahithvibudhi/vibe-tree/actions/workflows/ci.yml)

Works with Claude Code, OpenAI Codex CLI, Gemini CLI, Aider, opencode, and any other terminal program.

[Website](https://sahithvibudhi.github.io/vibe-tree/) · [Docs](https://sahithvibudhi.github.io/vibe-tree/docs/) · [Demo](https://sahithvibudhi.github.io/vibe-tree/#demo) · [Download](https://github.com/sahithvibudhi/vibe-tree/releases/latest)

</div>

---

VibeTree is mission control for parallel AI coding agents. Every task gets its own git worktree: an isolated checkout with its own branch and a persistent terminal. Run one agent per worktree, watch them all at once, review each branch's diff, and throw away failed experiments with one click. Use it as a desktop app, or run the server and drive your agents from any browser, including your phone.

![VibeTree Screenshot](assets/screenshot.png)

## Why worktrees

- Parallel agents do not stomp on each other: each works in its own checkout on its own branch
- Every conversation maps to one reviewable diff; review and merge per branch
- Failed experiment? Delete the worktree and its branch is gone with it

## Install

### macOS

```bash
brew install --cask --no-quarantine sahithvibudhi/tap/vibetree
```

Or download the dmg from the [latest release](https://github.com/sahithvibudhi/vibe-tree/releases/latest) (Intel and Apple Silicon). Builds are not yet notarized; approve the app once under System Settings, Privacy and Security, or use the brew command above.

### Windows and Linux

Download the Setup exe, AppImage, or deb from the [latest release](https://github.com/sahithvibudhi/vibe-tree/releases/latest).

### From source

```bash
pnpm install
pnpm dev:desktop    # desktop app
pnpm dev:all        # server + web; scan the QR code with your phone
```

## Features

| Feature | Description |
| --- | --- |
| Parallel worktrees | One isolated checkout, branch, and terminal per task |
| Any agent CLI | It is a real terminal: claude, codex, gemini, aider, or plain shells |
| Persistent sessions | Terminals keep running and scrollback survives reloads and reconnects |
| Fleet status | See which agents are working, waiting, or done; a ding when one needs you |
| Changes view | Review the diff beside the terminal and send a note back as the agent's next prompt |
| Browser preview | Dev server URLs are detected and opened next to the terminal |
| Lifecycle hooks | Run your own scripts when worktrees are created or removed |
| Phone access | Installable web app with QR pairing; check the fleet from anywhere on your network |

## Worktree hooks

Executable scripts in your repository, using the same trust model as git hooks:

```bash
mkdir -p .vibetree/hooks
printf '#!/bin/sh\nnpm install\n' > .vibetree/hooks/post-create
chmod +x .vibetree/hooks/post-create
```

`post-create` runs in each new worktree; `pre-remove` runs before deletion and can never block it. See the [hooks docs](https://sahithvibudhi.github.io/vibe-tree/docs/hooks.html) for environment variables and examples.

## Security

- The desktop app embeds its server on 127.0.0.1 with a per-launch token; nothing is exposed to the network.
- The standalone server binds the network so phones can reach it, and warns at startup when reachable without auth. Enable login with `AUTH_REQUIRED=true`, `VIBETREE_USERNAME`, and `VIBETREE_PASSWORD`. All options are in the [configuration docs](https://sahithvibudhi.github.io/vibe-tree/docs/config.html).

## Development

```bash
pnpm install
pnpm dev:desktop   # desktop app
pnpm dev:all       # server + web
pnpm test:run      # unit tests
pnpm --filter @vibetree/desktop test:e2e   # desktop e2e (Playwright)
pnpm --filter @vibetree/web test:e2e       # web e2e (Playwright)
pnpm typecheck && pnpm lint
```

Repo layout and design decisions live in [ARCHITECTURE.md](ARCHITECTURE.md).

## License

MIT. See [LICENSE](LICENSE).
