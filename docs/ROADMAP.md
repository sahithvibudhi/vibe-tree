# Roadmap: mission control for parallel AI agents

## Positioning

VibeTree is the lightweight, server-first alternative in the parallel-agent
space (compare Orca, onorca.dev). The architectural bet is one small
embeddable server with every client, desktop, browser, and phone, speaking
to the same backend. No separate mobile apps, no SSH bolt-ons, no app-store
gatekeeping: self-host the server anywhere and every device is a full
client via the PWA.

More powerful where it counts: scriptable worktree lifecycle hooks,
server-side session persistence, and agent activity detection shared by
all platforms.

Deliberately not chasing: SSH remote worktrees (the server-first model
already covers the use case), native mobile apps (the PWA is the point),
and project-management integrations (the terminal plus gh covers most of
it). Multi-agent fan-out (same prompt to N worktrees, compare and merge)
was considered and excluded for now.

## Phase 1: desktop correctness fixes

### 1a. Fix pnpm dev:desktop failing with spawn npx EACCES

apps/desktop/wait-for-dev-server.js spawns "npx wait-on tcp:<port>", the
only npx invocation in the repo, so a broken global npx shim kills the dev
flow. wait-on is already a local devDependency: spawn the local binary
directly (resolve node_modules/.bin/wait-on or use the wait-on API) so the
dev flow never depends on the machine's global npx.

### 1b. Fix duplicated keystrokes with multiple terminals per worktree

Root cause: in ClaudeTerminal's shell-start effect, listeners (xterm
onData -> PTY write, PTY output -> xterm write, exit, save interval) are
stored by overwriting removeListenersRef.current instead of disposing the
previous set. The effect re-fires when the xterm instance is recreated
(terminal settings or theme changes) and startShell is async, so a stale
run's listeners leak: two onData handlers write each keystroke to the PTY
twice and two output listeners echo it twice. Splits re-render all
terminals through portals, multiplying the opportunities.

Fix: epoch/cancel token so stale startShell runs abandon themselves
before registering, dispose-before-assign for the listener set, and add
terminalId to the effect dependencies. Add a regression test that mounts
two terminals on one worktree and asserts single-write per keystroke.

### 1c. Fix terminal resize handling

Today: a global window-resize listener per terminal, a MutationObserver
that fires synthetic window resize events, and setTimeout-based fits at
50 and 100 ms. Every terminal refits on any change and timing races leave
panes mis-sized.

Fix: one debounced ResizeObserver per terminal container that calls
fit() and resizes the PTY only when cols/rows actually changed; remove
the synthetic resize-event hacks and the MutationObserver.

## Phase 2: desktop multi-terminal UX

### 2a. Draggable split dividers

The grid model already stores splitRatio but renders a fixed 50/50. Add
drag handles on split borders (with minimum pane sizes), persist the
ratio in the existing grid cache, and refit panes via the ResizeObserver
path from 1c.

### 2b. Focus and pane clarity

Visible focused-pane indication, and per-pane toolbars that show controls
on the active pane only, so dense grids stay readable.

## Phase 3: unified window chrome (Linear/Slack style)

The window already uses titleBarStyle hiddenInset, but the renderer
stacks a large banner header (wordmark plus subtitle, about 90 px) above
a separate project-tab row and a worktree tab row. Replace this with:

- One compact titlebar (about 44 px) that is the drag region and
  contains: traffic-light inset spacing on macOS, project tabs, the
  connection status, and a compact overflow menu for settings and
  actions.
- titleBarOverlay on Windows/Linux with theme-matched colors so the
  native controls blend with the bar.
- Collapsible sidebar (Cmd/Ctrl+B, plus a titlebar toggle), consistent
  with the keyboard-shortcut system.
- Remove the banner header; the brand lives in the titlebar text and the
  welcome screen.

## Phase 4: product features (shared web and desktop)

### 4a. Fleet dashboard

A home view that answers "what are my agents doing right now" across all
projects and worktrees, from any device.

- Server tracks per-session agent state (working, needs input, done,
  idle) using the existing AgentActivityMonitor from @vibetree/core and
  broadcasts state changes over the existing WebSocket channel.
- Web home view lists every worktree with a live status chip; sidebar
  rows get the same chip. Tapping a row jumps to that terminal.
- Counts surface in the header (for example "2 working, 1 waiting").
- Desktop reuses the same server state for its notification badges.

### 4b. Agent presets

Per-project default agent command, so new terminals do not start at a
bare prompt.

- Project setting: agent command (claude, codex, gemini, aider, or any
  custom string), stored server-side per project path.
- New terminals show a one-click launch affordance for the configured
  agent; optionally auto-run on first terminal open.
- Onboarding asks which CLI the user runs and stores it as the default
  for new projects.

### 4c. Diff comment to prompt

Close the review loop without an IDE: comment on a change in the Changes
view and send it to the worktree's terminal as an instruction.

- Select a line or hunk in the diff view, write a short note, send.
- The client formats it as "In <file> around line <n>: <note>" and
  writes it to the worktree's primary terminal session via the existing
  shell write path.

### 4d. vibetree CLI

A thin command-line client over the server's REST and WebSocket APIs,
for scripting and automation.

- vibetree worktrees list / add <branch> / remove <branch>
- vibetree status (fleet view in the terminal)
- vibetree run <branch> "<prompt>" (create if needed, launch preset
  agent, send prompt)
- Distributed via npm; talks to a local or remote VibeTree server.
