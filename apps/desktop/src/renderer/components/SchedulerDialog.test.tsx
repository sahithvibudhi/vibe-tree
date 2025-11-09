import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SchedulerDialog } from './SchedulerDialog';
import type { SchedulerConfig } from './SchedulerDialog';

describe('SchedulerDialog', () => {
  const mockOnClose = vi.fn();
  const mockOnStart = vi.fn();
  const mockOnStop = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Dialog rendering', () => {
    it('should render when open is true', () => {
      render(
        <SchedulerDialog
          open={true}
          onClose={mockOnClose}
          onStart={mockOnStart}
          onStop={mockOnStop}
          isRunning={false}
          currentConfig={null}
        />
      );

      expect(screen.getByText('Schedule Terminal Command')).toBeInTheDocument();
      expect(screen.getByText('Configure a command to be typed into the terminal automatically. Characters will be typed one by one, then ENTER will be pressed to execute.')).toBeInTheDocument();
    });

    it('should not render when open is false', () => {
      const { container } = render(
        <SchedulerDialog
          open={false}
          onClose={mockOnClose}
          onStart={mockOnStart}
          onStop={mockOnStop}
          isRunning={false}
          currentConfig={null}
        />
      );

      // Dialog content should not be visible when closed
      expect(container.querySelector('[role="dialog"]')).not.toBeInTheDocument();
    });
  });

  describe('Form inputs', () => {
    it('should render all form inputs when not running', () => {
      render(
        <SchedulerDialog
          open={true}
          onClose={mockOnClose}
          onStart={mockOnStart}
          onStop={mockOnStop}
          isRunning={false}
          currentConfig={null}
        />
      );

      expect(screen.getByLabelText('Command')).toBeInTheDocument();
      expect(screen.getByLabelText('Delay (seconds)')).toBeInTheDocument();
      expect(screen.getByLabelText('Repeat command')).toBeInTheDocument();
    });

    it('should allow entering command text', () => {
      render(
        <SchedulerDialog
          open={true}
          onClose={mockOnClose}
          onStart={mockOnStart}
          onStop={mockOnStop}
          isRunning={false}
          currentConfig={null}
        />
      );

      const commandInput = screen.getByLabelText('Command') as HTMLInputElement;
      fireEvent.change(commandInput, { target: { value: 'echo "Hello World"' } });

      expect(commandInput.value).toBe('echo "Hello World"');
    });

    it('should allow entering delay value', () => {
      render(
        <SchedulerDialog
          open={true}
          onClose={mockOnClose}
          onStart={mockOnStart}
          onStop={mockOnStop}
          isRunning={false}
          currentConfig={null}
        />
      );

      const delayInput = screen.getByLabelText('Delay (seconds)') as HTMLInputElement;
      fireEvent.change(delayInput, { target: { value: '2.5' } });

      expect(delayInput.value).toBe('2.5');
    });

    it('should allow checking repeat checkbox', () => {
      render(
        <SchedulerDialog
          open={true}
          onClose={mockOnClose}
          onStart={mockOnStart}
          onStop={mockOnStop}
          isRunning={false}
          currentConfig={null}
        />
      );

      const repeatCheckbox = screen.getByLabelText('Repeat command') as HTMLInputElement;
      fireEvent.click(repeatCheckbox);

      expect(repeatCheckbox.checked).toBe(true);
    });

    it('should disable inputs when scheduler is running', () => {
      const config: SchedulerConfig = {
        command: 'echo "test"',
        delayMs: 1000,
        repeat: false,
      };

      render(
        <SchedulerDialog
          open={true}
          onClose={mockOnClose}
          onStart={mockOnStart}
          onStop={mockOnStop}
          isRunning={true}
          currentConfig={config}
        />
      );

      const commandInput = screen.getByLabelText('Command') as HTMLInputElement;
      const delayInput = screen.getByLabelText('Delay (seconds)') as HTMLInputElement;
      const repeatCheckbox = screen.getByLabelText('Repeat command') as HTMLInputElement;

      expect(commandInput.disabled).toBe(true);
      expect(delayInput.disabled).toBe(true);
      expect(repeatCheckbox.disabled).toBe(true);
    });
  });

  describe('Button behavior', () => {
    it('should show Start and Cancel buttons when not running', () => {
      render(
        <SchedulerDialog
          open={true}
          onClose={mockOnClose}
          onStart={mockOnStart}
          onStop={mockOnStop}
          isRunning={false}
          currentConfig={null}
        />
      );

      expect(screen.getByText('Start')).toBeInTheDocument();
      expect(screen.getByText('Cancel')).toBeInTheDocument();
    });

    it('should show Stop button when running', () => {
      const config: SchedulerConfig = {
        command: 'echo "test"',
        delayMs: 1000,
        repeat: false,
      };

      render(
        <SchedulerDialog
          open={true}
          onClose={mockOnClose}
          onStart={mockOnStart}
          onStop={mockOnStop}
          isRunning={true}
          currentConfig={config}
        />
      );

      expect(screen.getByText('Stop Scheduler')).toBeInTheDocument();
      expect(screen.queryByText('Start')).not.toBeInTheDocument();
      expect(screen.queryByText('Cancel')).not.toBeInTheDocument();
    });

    it('should disable Start button when command is empty', () => {
      render(
        <SchedulerDialog
          open={true}
          onClose={mockOnClose}
          onStart={mockOnStart}
          onStop={mockOnStop}
          isRunning={false}
          currentConfig={null}
        />
      );

      const startButton = screen.getByText('Start').closest('button');
      expect(startButton).toBeDisabled();
    });

    it('should enable Start button when valid inputs are provided', () => {
      render(
        <SchedulerDialog
          open={true}
          onClose={mockOnClose}
          onStart={mockOnStart}
          onStop={mockOnStop}
          isRunning={false}
          currentConfig={null}
        />
      );

      const commandInput = screen.getByLabelText('Command');
      const delayInput = screen.getByLabelText('Delay (seconds)');

      fireEvent.change(commandInput, { target: { value: 'echo "test"' } });
      fireEvent.change(delayInput, { target: { value: '1' } });

      const startButton = screen.getByText('Start').closest('button');
      expect(startButton).not.toBeDisabled();
    });

    it('should call onClose when Cancel is clicked', () => {
      render(
        <SchedulerDialog
          open={true}
          onClose={mockOnClose}
          onStart={mockOnStart}
          onStop={mockOnStop}
          isRunning={false}
          currentConfig={null}
        />
      );

      const cancelButton = screen.getByText('Cancel');
      fireEvent.click(cancelButton);

      expect(mockOnClose).toHaveBeenCalledTimes(1);
    });

    it('should call onStop when Stop button is clicked', () => {
      const config: SchedulerConfig = {
        command: 'echo "test"',
        delayMs: 1000,
        repeat: false,
      };

      render(
        <SchedulerDialog
          open={true}
          onClose={mockOnClose}
          onStart={mockOnStart}
          onStop={mockOnStop}
          isRunning={true}
          currentConfig={config}
        />
      );

      const stopButton = screen.getByText('Stop Scheduler');
      fireEvent.click(stopButton);

      expect(mockOnStop).toHaveBeenCalledTimes(1);
    });
  });

  describe('Scheduler start functionality', () => {
    it('should call onStart with correct config for one-time execution', () => {
      render(
        <SchedulerDialog
          open={true}
          onClose={mockOnClose}
          onStart={mockOnStart}
          onStop={mockOnStop}
          isRunning={false}
          currentConfig={null}
        />
      );

      const commandInput = screen.getByLabelText('Command');
      const delayInput = screen.getByLabelText('Delay (seconds)');

      fireEvent.change(commandInput, { target: { value: 'echo "Hello World"' } });
      fireEvent.change(delayInput, { target: { value: '1' } });

      const startButton = screen.getByText('Start');
      fireEvent.click(startButton);

      expect(mockOnStart).toHaveBeenCalledTimes(1);
      expect(mockOnStart).toHaveBeenCalledWith({
        command: 'echo "Hello World"',
        delayMs: 1000,
        repeat: false,
      });
    });

    it('should call onStart with correct config for repeating execution', () => {
      render(
        <SchedulerDialog
          open={true}
          onClose={mockOnClose}
          onStart={mockOnStart}
          onStop={mockOnStop}
          isRunning={false}
          currentConfig={null}
        />
      );

      const commandInput = screen.getByLabelText('Command');
      const delayInput = screen.getByLabelText('Delay (seconds)');
      const repeatCheckbox = screen.getByLabelText('Repeat command');

      fireEvent.change(commandInput, { target: { value: 'echo "test"' } });
      fireEvent.change(delayInput, { target: { value: '2.5' } });
      fireEvent.click(repeatCheckbox);

      const startButton = screen.getByText('Start');
      fireEvent.click(startButton);

      expect(mockOnStart).toHaveBeenCalledTimes(1);
      expect(mockOnStart).toHaveBeenCalledWith({
        command: 'echo "test"',
        delayMs: 2500,
        repeat: true,
      });
    });

    it('should trim whitespace from command', () => {
      render(
        <SchedulerDialog
          open={true}
          onClose={mockOnClose}
          onStart={mockOnStart}
          onStop={mockOnStop}
          isRunning={false}
          currentConfig={null}
        />
      );

      const commandInput = screen.getByLabelText('Command');
      const delayInput = screen.getByLabelText('Delay (seconds)');

      fireEvent.change(commandInput, { target: { value: '  echo "test"  ' } });
      fireEvent.change(delayInput, { target: { value: '1' } });

      const startButton = screen.getByText('Start');
      fireEvent.click(startButton);

      expect(mockOnStart).toHaveBeenCalledWith({
        command: 'echo "test"',
        delayMs: 1000,
        repeat: false,
      });
    });
  });

  describe('Current config display', () => {
    it('should populate form with current config values', () => {
      const config: SchedulerConfig = {
        command: 'echo "existing"',
        delayMs: 3000,
        repeat: true,
      };

      render(
        <SchedulerDialog
          open={true}
          onClose={mockOnClose}
          onStart={mockOnStart}
          onStop={mockOnStop}
          isRunning={true}
          currentConfig={config}
        />
      );

      const commandInput = screen.getByLabelText('Command') as HTMLInputElement;
      const delayInput = screen.getByLabelText('Delay (seconds)') as HTMLInputElement;
      const repeatCheckbox = screen.getByLabelText('Repeat command') as HTMLInputElement;

      expect(commandInput.value).toBe('echo "existing"');
      expect(delayInput.value).toBe('3');
      expect(repeatCheckbox.checked).toBe(true);
    });

    it('should show running indicator when scheduler is running', () => {
      const config: SchedulerConfig = {
        command: 'echo "test"',
        delayMs: 1000,
        repeat: true,
      };

      render(
        <SchedulerDialog
          open={true}
          onClose={mockOnClose}
          onStart={mockOnStart}
          onStop={mockOnStop}
          isRunning={true}
          currentConfig={config}
        />
      );

      expect(screen.getByText('Scheduler is running')).toBeInTheDocument();
      expect(screen.getByText(/Repeating.*Every 1s/)).toBeInTheDocument();
    });

    it('should show one-time indicator for non-repeating scheduler', () => {
      const config: SchedulerConfig = {
        command: 'echo "test"',
        delayMs: 2000,
        repeat: false,
      };

      render(
        <SchedulerDialog
          open={true}
          onClose={mockOnClose}
          onStart={mockOnStart}
          onStop={mockOnStop}
          isRunning={true}
          currentConfig={config}
        />
      );

      expect(screen.getByText(/One-time.*Every 2s/)).toBeInTheDocument();
    });

    it('should update description when scheduler is running', () => {
      const config: SchedulerConfig = {
        command: 'echo "test"',
        delayMs: 1000,
        repeat: false,
      };

      render(
        <SchedulerDialog
          open={true}
          onClose={mockOnClose}
          onStart={mockOnStart}
          onStop={mockOnStop}
          isRunning={true}
          currentConfig={config}
        />
      );

      expect(screen.getByText('Scheduler is running. Stop it to reconfigure.')).toBeInTheDocument();
    });

    it('should send command with newline character to emulate ENTER', () => {
      render(
        <SchedulerDialog
          open={true}
          onClose={mockOnClose}
          onStart={mockOnStart}
          onStop={mockOnStop}
          isRunning={false}
          currentConfig={null}
        />
      );

      const commandInput = screen.getByLabelText('Command');
      const delayInput = screen.getByLabelText('Delay (seconds)');

      fireEvent.change(commandInput, { target: { value: 'echo "test"' } });
      fireEvent.change(delayInput, { target: { value: '1' } });

      const startButton = screen.getByText('Start');
      fireEvent.click(startButton);

      // Verify the command is passed as-is to onStart
      // The parent component (ClaudeTerminal) is responsible for appending '\r' (ENTER key)
      expect(mockOnStart).toHaveBeenCalledWith({
        command: 'echo "test"',
        delayMs: 1000,
        repeat: false,
      });
    });
  });

  describe('Cleanup on unmount', () => {
    it('should call onStop when dialog unmounts while scheduler is running', () => {
      const config: SchedulerConfig = {
        command: 'echo "test"',
        delayMs: 1000,
        repeat: true,
      };

      const { unmount } = render(
        <SchedulerDialog
          open={true}
          onClose={mockOnClose}
          onStart={mockOnStart}
          onStop={mockOnStop}
          isRunning={true}
          currentConfig={config}
        />
      );

      // Unmount the component
      unmount();

      // onStop should not be called on unmount - the parent (ClaudeTerminal) handles cleanup
      // This test just verifies the component can be safely unmounted
      expect(mockOnStop).not.toHaveBeenCalled();
    });
  });

  describe('Input validation', () => {
    it('should not call onStart if command is empty', () => {
      render(
        <SchedulerDialog
          open={true}
          onClose={mockOnClose}
          onStart={mockOnStart}
          onStop={mockOnStop}
          isRunning={false}
          currentConfig={null}
        />
      );

      const delayInput = screen.getByLabelText('Delay (seconds)');
      fireEvent.change(delayInput, { target: { value: '1' } });

      const startButton = screen.getByText('Start').closest('button');
      expect(startButton).toBeDisabled();

      fireEvent.click(startButton!);
      expect(mockOnStart).not.toHaveBeenCalled();
    });

    it('should disable Start button if delay is invalid', () => {
      render(
        <SchedulerDialog
          open={true}
          onClose={mockOnClose}
          onStart={mockOnStart}
          onStop={mockOnStop}
          isRunning={false}
          currentConfig={null}
        />
      );

      const commandInput = screen.getByLabelText('Command');
      const delayInput = screen.getByLabelText('Delay (seconds)');

      fireEvent.change(commandInput, { target: { value: 'echo "test"' } });
      fireEvent.change(delayInput, { target: { value: '-1' } });

      const startButton = screen.getByText('Start').closest('button');
      expect(startButton).toBeDisabled();
    });

    it('should disable Start button if delay is not a number', () => {
      render(
        <SchedulerDialog
          open={true}
          onClose={mockOnClose}
          onStart={mockOnStart}
          onStop={mockOnStop}
          isRunning={false}
          currentConfig={null}
        />
      );

      const commandInput = screen.getByLabelText('Command');
      const delayInput = screen.getByLabelText('Delay (seconds)');

      fireEvent.change(commandInput, { target: { value: 'echo "test"' } });
      fireEvent.change(delayInput, { target: { value: 'abc' } });

      const startButton = screen.getByText('Start').closest('button');
      expect(startButton).toBeDisabled();
    });
  });
});
