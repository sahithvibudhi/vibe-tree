<div align="center">
  <img src="assets/icons/VibeTree.png" alt="VibeTree Logo" width="128" height="128">
  
  # VibeTree
  
  **Vibe code with AI in parallel git worktrees**
  
  [![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
  [![Release](https://img.shields.io/github/v/release/sahithvibudhi/vibe-tree)](https://github.com/sahithvibudhi/vibe-tree/releases)
  ![Status: Active Development](https://img.shields.io/badge/Status-Active%20Development-orange)
</div>

---

VibeTree is a desktop application that enhances your development workflow by enabling parallel development with AI assistance across multiple git worktrees. Work on features simultaneously without context switching.

## Screenshot

![VibeTree Screenshot](assets/screenshot.png)

## Demo

[View Demo Video](assets/demo.mov)

## Installation

### Download Pre-built Binaries

Download the latest release for your platform from the [Releases page](https://github.com/sahithvibudhi/vibe-tree/releases):

- **macOS**: Download `.dmg` file (supports both Intel and Apple Silicon)
- **Windows**: Download `.exe` installer
- **Linux**: Download `.AppImage` or `.deb` file

### Build from Source

```bash
# Install dependencies
npm install

# Run in development mode
npm run dev

# Build for production
npm run build

# Package the app
npm run package
```

## Features

- **Parallel Development** - Work on multiple features simultaneously without stashing or switching branches
- **Persistent Terminal Sessions** - Each worktree maintains its own terminal session with full state preservation
- **Claude CLI Integration** - Seamlessly work with Claude in each terminal
- **IDE Integration** - Open any worktree directly in VS Code or Cursor
- **Multi-Project Support** - Work with multiple repositories in tabbed interface
- **Dark/Light Mode** - Automatic OS theme detection with manual toggle
- **macOS Native** - Proper traffic light window controls integration

## Contributing

Contributions are welcome! Please read our [Contributing Guidelines](CONTRIBUTING.md) for details on our code of conduct and the process for submitting pull requests.

## License

MIT License - see the LICENSE file for details.