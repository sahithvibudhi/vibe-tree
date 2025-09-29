import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { Terminal } from './Terminal';
import { escapeShellPath } from '@vibetree/core';
import React from 'react';

// Mock xterm and its addons
vi.mock('@xterm/xterm', () => ({
  Terminal: vi.fn().mockImplementation(() => ({
    loadAddon: vi.fn(),
    open: vi.fn(),
    write: vi.fn(),
    clear: vi.fn(),
    focus: vi.fn(),
    blur: vi.fn(),
    resize: vi.fn(),
    dispose: vi.fn(),
    onData: vi.fn(() => ({ dispose: vi.fn() })),
    onKey: vi.fn(() => ({ dispose: vi.fn() })),
    onBell: vi.fn(() => ({ dispose: vi.fn() })),
    cols: 80,
    rows: 24,
    options: {},
  })),
}));

vi.mock('@xterm/addon-fit', () => ({
  FitAddon: vi.fn().mockImplementation(() => ({
    fit: vi.fn(),
  })),
}));

vi.mock('@xterm/addon-web-links', () => ({
  WebLinksAddon: vi.fn().mockImplementation(() => ({})),
}));

vi.mock('@xterm/addon-serialize', () => ({
  SerializeAddon: vi.fn().mockImplementation(() => ({
    serialize: vi.fn(),
  })),
}));

vi.mock('@xterm/addon-unicode11', () => ({
  Unicode11Addon: vi.fn().mockImplementation(() => ({
    activate: vi.fn(),
  })),
}));

vi.mock('@xterm/addon-search', () => ({
  SearchAddon: vi.fn().mockImplementation(() => ({
    findNext: vi.fn(),
    findPrevious: vi.fn(),
  })),
}));

// Test the escapeShellPath function
describe('escapeShellPath', () => {

  it('should not escape simple paths without special characters', () => {
    expect(escapeShellPath('/home/user/file.txt')).toBe('/home/user/file.txt');
    expect(escapeShellPath('/usr/local/bin/app')).toBe('/usr/local/bin/app');
    expect(escapeShellPath('file.txt')).toBe('file.txt');
  });

  it('should escape paths with spaces', () => {
    expect(escapeShellPath('/home/user/my file.txt')).toBe("'/home/user/my file.txt'");
    expect(escapeShellPath('my folder/file.txt')).toBe("'my folder/file.txt'");
  });

  it('should escape paths with single quotes', () => {
    expect(escapeShellPath("/home/user/it's.txt")).toBe("'/home/user/it'\\''s.txt'");
    expect(escapeShellPath("don't.txt")).toBe("'don'\\''t.txt'");
  });

  it('should escape paths with double quotes', () => {
    expect(escapeShellPath('/home/user/"quoted".txt')).toBe('\'/home/user/"quoted".txt\'');
  });

  it('should escape paths with parentheses', () => {
    expect(escapeShellPath('/home/user/file(1).txt')).toBe("'/home/user/file(1).txt'");
    expect(escapeShellPath('/home/user/file)test(.txt')).toBe("'/home/user/file)test(.txt'");
  });

  it('should escape paths with brackets', () => {
    expect(escapeShellPath('/home/user/file[1].txt')).toBe("'/home/user/file[1].txt'");
    expect(escapeShellPath('/home/user/file{test}.txt')).toBe("'/home/user/file{test}.txt'");
  });

  it('should escape paths with special shell characters', () => {
    expect(escapeShellPath('/home/user/file&test.txt')).toBe("'/home/user/file&test.txt'");
    expect(escapeShellPath('/home/user/file|test.txt')).toBe("'/home/user/file|test.txt'");
    expect(escapeShellPath('/home/user/file;test.txt')).toBe("'/home/user/file;test.txt'");
    expect(escapeShellPath('/home/user/file<test>.txt')).toBe("'/home/user/file<test>.txt'");
    expect(escapeShellPath('/home/user/file*test.txt')).toBe("'/home/user/file*test.txt'");
    expect(escapeShellPath('/home/user/file?test.txt')).toBe("'/home/user/file?test.txt'");
  });

  it('should escape paths with dollar signs', () => {
    expect(escapeShellPath('/home/user/$file.txt')).toBe("'/home/user/$file.txt'");
  });

  it('should escape paths with backslashes', () => {
    expect(escapeShellPath('/home/user\\file.txt')).toBe("'/home/user\\file.txt'");
  });

  it('should handle complex paths with multiple special characters', () => {
    expect(escapeShellPath("/home/user/My Documents/Project (2024)/it's & file's.txt"))
      .toBe("'/home/user/My Documents/Project (2024)/it'\\''s & file'\\''s.txt'");
  });
});

describe('Terminal Component Drag and Drop', () => {
  let mockOnData: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockOnData = vi.fn();
    vi.clearAllMocks();
  });

  it('should render terminal container with drag and drop handlers', () => {
    const { container } = render(
      <Terminal id="test-terminal" onData={mockOnData} />
    );

    const terminalContainer = container.querySelector('.terminal-container');
    expect(terminalContainer).toBeInTheDocument();
  });

  it('should prevent default and stop propagation on dragOver', () => {
    const { container } = render(
      <Terminal id="test-terminal" onData={mockOnData} />
    );

    const terminalContainer = container.querySelector('.terminal-container');
    const dragOverEvent = new Event('dragover', { bubbles: true });

    Object.defineProperty(dragOverEvent, 'preventDefault', {
      value: vi.fn(),
      writable: true,
    });
    Object.defineProperty(dragOverEvent, 'stopPropagation', {
      value: vi.fn(),
      writable: true,
    });
    const dataTransfer = { dropEffect: null as string | null };
    Object.defineProperty(dragOverEvent, 'dataTransfer', {
      value: dataTransfer,
      writable: true,
    });

    fireEvent(terminalContainer!, dragOverEvent);

    expect(dragOverEvent.preventDefault).toHaveBeenCalled();
    expect(dragOverEvent.stopPropagation).toHaveBeenCalled();
    expect(dataTransfer.dropEffect).toBe('copy');
  });

  it('should handle file drop with single file', () => {
    const { container } = render(
      <Terminal id="test-terminal" onData={mockOnData} />
    );

    const terminalContainer = container.querySelector('.terminal-container');

    // Create a mock file
    const file = new File(['content'], 'test.txt', { type: 'text/plain' });
    (file as any).path = '/home/user/test.txt';

    const dropEvent = new Event('drop', { bubbles: true });
    Object.defineProperty(dropEvent, 'preventDefault', {
      value: vi.fn(),
      writable: true,
    });
    Object.defineProperty(dropEvent, 'stopPropagation', {
      value: vi.fn(),
      writable: true,
    });
    Object.defineProperty(dropEvent, 'dataTransfer', {
      value: {
        files: [file],
      },
      writable: true,
    });

    fireEvent(terminalContainer!, dropEvent);

    expect(dropEvent.preventDefault).toHaveBeenCalled();
    expect(dropEvent.stopPropagation).toHaveBeenCalled();

    // Verify onData was called with the file path
    expect(mockOnData).toHaveBeenCalledWith('/home/user/test.txt');
  });

  it('should handle file drop with multiple files', () => {
    const { container } = render(
      <Terminal id="test-terminal" onData={mockOnData} />
    );

    const terminalContainer = container.querySelector('.terminal-container');

    // Create mock files
    const file1 = new File(['content1'], 'test1.txt', { type: 'text/plain' });
    (file1 as any).path = '/home/user/test1.txt';

    const file2 = new File(['content2'], 'test2.txt', { type: 'text/plain' });
    (file2 as any).path = '/home/user/test2.txt';

    const dropEvent = new Event('drop', { bubbles: true });
    Object.defineProperty(dropEvent, 'preventDefault', {
      value: vi.fn(),
      writable: true,
    });
    Object.defineProperty(dropEvent, 'stopPropagation', {
      value: vi.fn(),
      writable: true,
    });
    Object.defineProperty(dropEvent, 'dataTransfer', {
      value: {
        files: [file1, file2],
      },
      writable: true,
    });

    fireEvent(terminalContainer!, dropEvent);

    // Verify onData was called with both file paths
    expect(mockOnData).toHaveBeenCalledWith('/home/user/test1.txt /home/user/test2.txt');
  });

  it('should escape file paths with special characters on drop', () => {
    const { container } = render(
      <Terminal id="test-terminal" onData={mockOnData} />
    );

    const terminalContainer = container.querySelector('.terminal-container');

    // Create a mock file with spaces in the path
    const file = new File(['content'], 'my file.txt', { type: 'text/plain' });
    (file as any).path = '/home/user/My Documents/my file.txt';

    const dropEvent = new Event('drop', { bubbles: true });
    Object.defineProperty(dropEvent, 'preventDefault', {
      value: vi.fn(),
      writable: true,
    });
    Object.defineProperty(dropEvent, 'stopPropagation', {
      value: vi.fn(),
      writable: true,
    });
    Object.defineProperty(dropEvent, 'dataTransfer', {
      value: {
        files: [file],
      },
      writable: true,
    });

    fireEvent(terminalContainer!, dropEvent);

    // Verify onData was called with escaped path
    expect(mockOnData).toHaveBeenCalledWith("'/home/user/My Documents/my file.txt'");
  });

  it('should not call onData if no files are dropped', () => {
    const { container } = render(
      <Terminal id="test-terminal" onData={mockOnData} />
    );

    const terminalContainer = container.querySelector('.terminal-container');

    const dropEvent = new Event('drop', { bubbles: true });
    Object.defineProperty(dropEvent, 'preventDefault', {
      value: vi.fn(),
      writable: true,
    });
    Object.defineProperty(dropEvent, 'stopPropagation', {
      value: vi.fn(),
      writable: true,
    });
    Object.defineProperty(dropEvent, 'dataTransfer', {
      value: {
        files: [],
      },
      writable: true,
    });

    fireEvent(terminalContainer!, dropEvent);

    expect(dropEvent.preventDefault).toHaveBeenCalled();
    expect(dropEvent.stopPropagation).toHaveBeenCalled();
    expect(mockOnData).not.toHaveBeenCalled();
  });

  it('should apply drag over styles when dragging over terminal', () => {
    const { container } = render(
      <Terminal id="test-terminal" onData={mockOnData} />
    );

    const terminalContainer = container.querySelector('.terminal-container') as HTMLElement;

    const dragOverEvent = new Event('dragover', { bubbles: true });
    Object.defineProperty(dragOverEvent, 'preventDefault', {
      value: vi.fn(),
      writable: true,
    });
    Object.defineProperty(dragOverEvent, 'stopPropagation', {
      value: vi.fn(),
      writable: true,
    });
    const dataTransfer = { dropEffect: null as string | null };
    Object.defineProperty(dragOverEvent, 'dataTransfer', {
      value: dataTransfer,
      writable: true,
    });

    fireEvent(terminalContainer!, dragOverEvent);

    // Check if drag over styles are applied
    expect(terminalContainer.style.outline).toBe('2px dashed #007acc');
    expect(terminalContainer.style.backgroundColor).toBe('rgba(0, 122, 204, 0.1)');
  });
});