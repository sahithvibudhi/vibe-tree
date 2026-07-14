import type { AgentActivityEvent } from '@vibetree/core';

const SOUND_KEY = 'vibetree.soundEnabled';

export function isSoundEnabled(): boolean {
  return localStorage.getItem(SOUND_KEY) !== 'false';
}

export function setSoundEnabled(enabled: boolean): void {
  localStorage.setItem(SOUND_KEY, String(enabled));
}

let audioContext: AudioContext | null = null;

function getContext(): AudioContext | null {
  try {
    audioContext ??= new AudioContext();
    if (audioContext.state === 'suspended') {
      // Requires a prior user gesture; by the time an agent finishes the
      // user has always interacted with the page
      void audioContext.resume();
    }
    return audioContext;
  } catch {
    return null;
  }
}

function tone(ctx: AudioContext, frequency: number, start: number, duration: number) {
  const oscillator = ctx.createOscillator();
  const gain = ctx.createGain();
  oscillator.type = 'sine';
  oscillator.frequency.value = frequency;
  // Short attack/decay envelope so the chime has no clicks
  gain.gain.setValueAtTime(0, start);
  gain.gain.linearRampToValueAtTime(0.12, start + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  oscillator.connect(gain);
  gain.connect(ctx.destination);
  oscillator.start(start);
  oscillator.stop(start + duration);
}

/**
 * Synthesized chime, so no audio asset needs shipping or caching.
 * Completion rises, a question repeats one note: distinguishable
 * without looking at the screen.
 */
export function playDing(event: AgentActivityEvent): void {
  if (!isSoundEnabled()) return;
  const ctx = getContext();
  if (!ctx) return;

  const now = ctx.currentTime;
  if (event === 'completed') {
    tone(ctx, 660, now, 0.18);
    tone(ctx, 990, now + 0.12, 0.22);
  } else {
    tone(ctx, 880, now, 0.15);
    tone(ctx, 880, now + 0.2, 0.15);
  }
}
