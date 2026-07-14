/**
 * Detection of AI-CLI activity from raw terminal output, shared by the
 * desktop notification manager and the web ding notifications so both
 * platforms agree on what "done" and "needs input" look like.
 */

/* eslint-disable no-control-regex */
const ANSI_REGEX = /[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><~]/g;
const OSC_REGEX = /\u001b\].*?(?:\u0007|\u001b\\)/g;
const CONTROL_CHARS_REGEX = /[\u0000-\u0008\u000b\u000c\u000e-\u001a]/g;
/* eslint-enable no-control-regex */

export function stripAnsi(str: string): string {
  if (typeof str !== 'string') return '';
  return str.replace(OSC_REGEX, '').replace(ANSI_REGEX, '').replace(CONTROL_CHARS_REGEX, '');
}

export function stripAnsiAndSplitLines(str: string): string[] {
  return stripAnsi(str)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

// "send" is the idle prompt hint Claude Code and similar CLIs show once a
// response has finished streaming
export const COMPLETION_PATTERNS: RegExp[] = [/send\s*$/i, /↵\s*send/i];

export const QUESTION_PATTERNS: RegExp[] = [
  /Enter to select.*Tab\/Arrow keys to navigate.*Esc to cancel/i,
  /Tab\/Arrow keys to navigate/i,
  /\[Y\/n\]/,
  /\[y\/N\]/,
  /\(yes\/no\)/i,
  /Do you want to proceed\?/i,
  />\s*\d+\.\s*Yes/i
];

export type AgentActivityEvent = 'completed' | 'question';

type AgentState = 'idle' | 'working' | 'completed' | 'question';

/**
 * Per-session state machine. Events fire only for a working -> done
 * transition and only once per prompt: "working" is entered exclusively
 * via markUserInput because output alone (redraws, replays, scrollback
 * restores) must never look like the agent got busy or finished.
 */
export class AgentActivityMonitor {
  private state: AgentState = 'idle';
  private hasNotifiedForCurrentCompletion = false;

  markUserInput(): void {
    this.hasNotifiedForCurrentCompletion = false;
    this.state = 'working';
  }

  processOutput(data: string): AgentActivityEvent | null {
    const lines = stripAnsiAndSplitLines(data);

    for (const line of lines) {
      if (QUESTION_PATTERNS.some((pattern) => pattern.test(line))) {
        if (this.state !== 'question') return this.transitionTo('question');
        return null;
      }
      if (COMPLETION_PATTERNS.some((pattern) => pattern.test(line))) {
        if (this.state !== 'completed') return this.transitionTo('completed');
        return null;
      }
    }
    return null;
  }

  private transitionTo(newState: AgentActivityEvent): AgentActivityEvent | null {
    const prevState = this.state;
    this.state = newState;

    if (prevState !== 'working') return null;
    if (this.hasNotifiedForCurrentCompletion) return null;

    this.hasNotifiedForCurrentCompletion = true;
    return newState;
  }
}
