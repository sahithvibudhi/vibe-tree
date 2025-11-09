import { app } from 'electron';
import path from 'path';
import fs from 'fs';

export interface SchedulerHistoryEntry {
  command: string;
  delayMs: number;
  repeat: boolean;
  timestamp: number;
}

class SchedulerHistoryManager {
  private historyEntries: SchedulerHistoryEntry[] = [];
  private readonly maxHistoryEntries = 20;
  private readonly storageFile: string;

  constructor() {
    this.storageFile = path.join(app.getPath('userData'), 'scheduler-history.json');
    this.loadHistory();
  }

  private loadHistory() {
    try {
      if (fs.existsSync(this.storageFile)) {
        const data = fs.readFileSync(this.storageFile, 'utf8');
        this.historyEntries = JSON.parse(data);
        // Validate and clean up invalid entries
        this.historyEntries = this.historyEntries.filter(entry =>
          typeof entry.command === 'string' &&
          typeof entry.delayMs === 'number' &&
          typeof entry.repeat === 'boolean' &&
          typeof entry.timestamp === 'number'
        );

        // Ensure we don't exceed max entries even after loading
        if (this.historyEntries.length > this.maxHistoryEntries) {
          this.historyEntries = this.historyEntries
            .sort((a, b) => b.timestamp - a.timestamp)
            .slice(0, this.maxHistoryEntries);
        }
      }
    } catch (error) {
      console.error('Failed to load scheduler history:', error);
      this.historyEntries = [];
    }
  }

  private saveHistory() {
    try {
      const dir = path.dirname(this.storageFile);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(this.storageFile, JSON.stringify(this.historyEntries, null, 2));
    } catch (error) {
      console.error('Failed to save scheduler history:', error);
    }
  }

  addHistoryEntry(command: string, delayMs: number, repeat: boolean) {
    // Check if an identical entry already exists (ignoring timestamp)
    const existingIndex = this.historyEntries.findIndex(
      entry => entry.command === command && entry.delayMs === delayMs && entry.repeat === repeat
    );

    const entry: SchedulerHistoryEntry = {
      command,
      delayMs,
      repeat,
      timestamp: Date.now()
    };

    if (existingIndex >= 0) {
      // Update existing entry's timestamp and move to front
      this.historyEntries.splice(existingIndex, 1);
    }

    this.historyEntries.unshift(entry);

    // Keep only the most recent entries
    if (this.historyEntries.length > this.maxHistoryEntries) {
      this.historyEntries = this.historyEntries.slice(0, this.maxHistoryEntries);
    }

    this.saveHistory();
  }

  getHistory(): SchedulerHistoryEntry[] {
    // Return a copy sorted by timestamp (most recent first)
    return [...this.historyEntries].sort((a, b) => b.timestamp - a.timestamp);
  }

  clearHistory() {
    this.historyEntries = [];
    this.saveHistory();
  }
}

export const schedulerHistoryManager = new SchedulerHistoryManager();
