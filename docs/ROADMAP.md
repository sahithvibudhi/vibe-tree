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

## Planned features, in build order

### 1. Fleet dashboard

A home view that answers "what are my agents doing right now" across all
projects and worktrees, from any device.

- Server tracks per-session agent state (working, needs input, done, idle)
  using the existing AgentActivityMonitor from @vibetree/core, and
  broadcasts state changes over the existing WebSocket channel.
- Web home view lists every worktree with a live status chip; sidebar rows
  get the same chip. Tapping a row jumps to that terminal.
- Counts surface in the header (for example "2 working, 1 waiting").
- Desktop reuses the same server state for its notification badges.

### 2. Agent presets

Per-project default agent command, so new terminals do not start at a bare
prompt.

- Project setting: agent command (claude, codex, gemini, aider, or any
  custom string). Stored server-side per project path.
- New terminals show a one-click launch affordance for the configured
  agent; optionally auto-run on first terminal open.
- Onboarding asks which CLI the user runs and stores it as the default
  for new projects.

### 3. Diff comment to prompt

Close the review loop without an IDE: comment on a change in the Changes
view and send it to the worktree's terminal as an instruction.

- In the diff view, select a line or hunk, write a short note, send.
- The client formats it as "In <file> around line <n>: <note>" and writes
  it to the worktree's primary terminal session via the existing
  shell:write path.
- No server changes required beyond what exists.

### 4. vibetree CLI

A thin command-line client over the server's REST and WebSocket APIs, for
scripting and automation.

- vibetree worktrees list / add <branch> / remove <branch>
- vibetree status (fleet view in the terminal)
- vibetree run <branch> "<prompt>" (create if needed, launch preset agent,
  send prompt)
- Distributed via npx/npm; talks to a local or remote VibeTree server.
