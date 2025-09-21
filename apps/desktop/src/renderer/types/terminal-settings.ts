// Terminal settings types shared between main and renderer
export interface TerminalSettings {
  fontFamily: string;
  fontSize: number;
  cursorBlink: boolean;
  scrollback: number;
  tabStopWidth: number;
  setLocaleVariables: boolean;
}

export type TerminalSettingsUpdate = Partial<TerminalSettings>;