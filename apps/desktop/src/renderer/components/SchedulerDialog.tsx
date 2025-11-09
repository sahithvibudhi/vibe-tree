import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from './ui/dialog';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { PlayCircle, StopCircle } from 'lucide-react';

export interface SchedulerConfig {
  command: string;
  delayMs: number;
  repeat: boolean;
}

interface SchedulerDialogProps {
  open: boolean;
  onClose: () => void;
  onStart: (config: SchedulerConfig) => void;
  onStop: () => void;
  isRunning: boolean;
  currentConfig: SchedulerConfig | null;
}

export function SchedulerDialog({
  open,
  onClose,
  onStart,
  onStop,
  isRunning,
  currentConfig,
}: SchedulerDialogProps) {
  const [command, setCommand] = useState('');
  const [delaySeconds, setDelaySeconds] = useState('1');
  const [repeat, setRepeat] = useState(false);

  // Update form when currentConfig changes
  useEffect(() => {
    if (currentConfig) {
      setCommand(currentConfig.command);
      setDelaySeconds((currentConfig.delayMs / 1000).toString());
      setRepeat(currentConfig.repeat);
    } else {
      // Reset to defaults when no config
      setCommand('');
      setDelaySeconds('1');
      setRepeat(false);
    }
  }, [currentConfig]);

  const handleStart = () => {
    const delayMs = parseFloat(delaySeconds) * 1000;

    if (!command.trim()) {
      return;
    }

    if (isNaN(delayMs) || delayMs <= 0) {
      return;
    }

    onStart({
      command: command.trim(),
      delayMs,
      repeat,
    });
  };

  const handleStop = () => {
    onStop();
    onClose();
  };

  const isValid = command.trim().length > 0 &&
                  !isNaN(parseFloat(delaySeconds)) &&
                  parseFloat(delaySeconds) > 0;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Schedule Terminal Command</DialogTitle>
          <DialogDescription>
            {isRunning
              ? 'Scheduler is running. Stop it to reconfigure.'
              : 'Configure a command to be typed into the terminal automatically. Characters will be typed one by one, then ENTER will be pressed to execute.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <label htmlFor="command" className="text-sm font-medium">
              Command
            </label>
            <Input
              id="command"
              type="text"
              placeholder='echo "Hello World"'
              value={command}
              onChange={(e) => setCommand(e.target.value)}
              disabled={isRunning}
              className={isRunning ? 'opacity-50 cursor-not-allowed' : ''}
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="delay" className="text-sm font-medium">
              Delay (seconds)
            </label>
            <Input
              id="delay"
              type="number"
              min="0.1"
              step="0.1"
              placeholder="1"
              value={delaySeconds}
              onChange={(e) => setDelaySeconds(e.target.value)}
              disabled={isRunning}
              className={isRunning ? 'opacity-50 cursor-not-allowed' : ''}
            />
          </div>

          <div className="flex items-center space-x-2">
            <input
              id="repeat"
              type="checkbox"
              checked={repeat}
              onChange={(e) => setRepeat(e.target.checked)}
              disabled={isRunning}
              className={`h-4 w-4 rounded border-gray-300 ${isRunning ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
            />
            <label
              htmlFor="repeat"
              className={`text-sm font-medium ${isRunning ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
            >
              Repeat command
            </label>
          </div>

          {isRunning && (
            <div className="flex items-center gap-2 p-3 bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-md">
              <div className="flex-shrink-0">
                <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-blue-900 dark:text-blue-100">
                  Scheduler is running
                </p>
                <p className="text-xs text-blue-700 dark:text-blue-300">
                  {repeat ? 'Repeating' : 'One-time'} • Every {delaySeconds}s
                </p>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          {isRunning ? (
            <Button
              onClick={handleStop}
              variant="destructive"
              className="w-full"
            >
              <StopCircle className="h-4 w-4 mr-2" />
              Stop Scheduler
            </Button>
          ) : (
            <div className="flex gap-2 w-full">
              <Button
                onClick={onClose}
                variant="outline"
                className="flex-1"
              >
                Cancel
              </Button>
              <Button
                onClick={handleStart}
                disabled={!isValid}
                className="flex-1"
              >
                <PlayCircle className="h-4 w-4 mr-2" />
                Start
              </Button>
            </div>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
