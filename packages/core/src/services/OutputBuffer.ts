/**
 * Bounded text buffer for terminal output replay.
 * Keeps whole chunks and drops the oldest ones once the total size
 * exceeds the cap, so replayed output never starts mid escape sequence
 * more than one chunk deep.
 */
export class OutputBuffer {
  private chunks: string[] = [];
  private totalSize = 0;

  constructor(private maxSize: number = 100000) {}

  append(chunk: string): void {
    if (!chunk) return;
    this.chunks.push(chunk);
    this.totalSize += chunk.length;

    while (this.totalSize > this.maxSize && this.chunks.length > 1) {
      const removed = this.chunks.shift();
      if (removed) {
        this.totalSize -= removed.length;
      }
    }
  }

  snapshot(): string {
    return this.chunks.join('');
  }

  get size(): number {
    return this.totalSize;
  }

  get isEmpty(): boolean {
    return this.chunks.length === 0;
  }

  clear(): void {
    this.chunks = [];
    this.totalSize = 0;
  }
}
