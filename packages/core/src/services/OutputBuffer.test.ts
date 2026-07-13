import { describe, it, expect } from 'vitest';
import { OutputBuffer } from './OutputBuffer';

describe('OutputBuffer', () => {
  it('accumulates chunks in order', () => {
    const buffer = new OutputBuffer();
    buffer.append('a');
    buffer.append('b');
    buffer.append('c');
    expect(buffer.snapshot()).toBe('abc');
    expect(buffer.size).toBe(3);
  });

  it('ignores empty chunks', () => {
    const buffer = new OutputBuffer();
    buffer.append('');
    expect(buffer.isEmpty).toBe(true);
  });

  it('drops oldest chunks when over the cap', () => {
    const buffer = new OutputBuffer(10);
    buffer.append('11111');
    buffer.append('22222');
    buffer.append('33333');
    expect(buffer.snapshot()).toBe('2222233333');
    expect(buffer.size).toBe(10);
  });

  it('keeps a single oversized chunk rather than dropping everything', () => {
    const buffer = new OutputBuffer(5);
    buffer.append('0123456789');
    expect(buffer.snapshot()).toBe('0123456789');
  });

  it('handles multibyte content by character count', () => {
    const buffer = new OutputBuffer(4);
    buffer.append('日本');
    buffer.append('語で');
    expect(buffer.snapshot()).toBe('日本語で');
    buffer.append('す!');
    expect(buffer.snapshot()).toBe('語です!');
  });

  it('clears', () => {
    const buffer = new OutputBuffer();
    buffer.append('data');
    buffer.clear();
    expect(buffer.isEmpty).toBe(true);
    expect(buffer.snapshot()).toBe('');
  });
});
