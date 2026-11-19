import { describe, expect, it, vi } from 'vitest';
import { drawOverlay, frameWithSequence, parseOverlay, splitFrame, type Overlay } from '../lib/CameraFrames';

describe('frameWithSequence / splitFrame', () => {
  it('prefixes a 4-byte big-endian sequence and reads it back with the JPEG', () => {
    const jpeg = new Uint8Array([0xff, 0xd8, 1, 2, 3]);
    const framed = frameWithSequence(258, jpeg.buffer);
    expect([...new Uint8Array(framed).slice(0, 4)]).toEqual([0, 0, 1, 2]);
    const split = splitFrame(framed);
    expect(split?.seq).toBe(258);
    expect(split!.jpeg.size).toBe(jpeg.length);
    expect(split?.jpeg.type).toBe('image/jpeg');
  });

  it('refuses anything that is not a sequence followed by a JPEG', () => {
    expect(splitFrame(new Uint8Array([1, 2, 3]).buffer)).toBeNull();
    expect(splitFrame(new Uint8Array([0, 0, 0, 1, 9, 9, 9]).buffer)).toBeNull();
  });
});

describe('parseOverlay', () => {
  const good = { seq: 3, w: 960, h: 540, hands: [{ b: [10, 20, 110, 220], c: 0.9, k: new Array(42).fill(5) }], step: 'Paso1_Palmas', conf: 0.88, fps: 14.2 };

  it('accepts the PC message and keeps only what it needs', () => {
    expect(parseOverlay(JSON.stringify(good))).toMatchObject({ seq: 3, w: 960, h: 540, step: 'Paso1_Palmas' });
  });

  it('rejects malformed or hostile messages', () => {
    for (const bad of ['nope', '[]', '{}', JSON.stringify({ ...good, w: 0 }), JSON.stringify({ ...good, hands: 'x' }),
      JSON.stringify({ ...good, hands: [{ b: [1, 2, 3], c: 1, k: [] }] }), JSON.stringify({ ...good, hands: new Array(9).fill(good.hands[0]) })]) {
      expect(parseOverlay(bad)).toBeNull();
    }
  });
});

describe('drawOverlay', () => {
  const overlay: Overlay = { seq: 1, w: 960, h: 540, step: null, conf: null, fps: 0,
    hands: [{ b: [96, 54, 192, 108], c: 0.91, k: [100, 60, 110, 70] }] };

  it('draws each box scaled to the picture that is on screen, with its confidence and landmarks', () => {
    const ctx = { strokeRect: vi.fn(), fillRect: vi.fn(), fillText: vi.fn(), beginPath: vi.fn(), arc: vi.fn(), fill: vi.fn(), measureText: () => ({ width: 40 }),
      save: vi.fn(), restore: vi.fn(), lineWidth: 0, strokeStyle: '', fillStyle: '', font: '' };
    drawOverlay(ctx as unknown as CanvasRenderingContext2D, overlay, 480, 270);
    expect(ctx.strokeRect).toHaveBeenCalledWith(48, 27, 48, 27);
    expect(ctx.fillText).toHaveBeenCalledWith(expect.stringContaining('0.91'), expect.any(Number), expect.any(Number));
    expect(ctx.arc).toHaveBeenCalledTimes(2);
  });

  it('draws nothing for a frame with no hands', () => {
    const ctx = { strokeRect: vi.fn(), fillRect: vi.fn(), fillText: vi.fn(), beginPath: vi.fn(), arc: vi.fn(), fill: vi.fn(), measureText: () => ({ width: 0 }),
      save: vi.fn(), restore: vi.fn() };
    drawOverlay(ctx as unknown as CanvasRenderingContext2D, { ...overlay, hands: [] }, 480, 270);
    expect(ctx.strokeRect).not.toHaveBeenCalled();
  });
});

import { stepNumber, drawOverlay } from '@/lib/CameraFrames';

describe('step guidance in the overlay', () => {
  const base = { seq: 1, w: 100, h: 100, conf: 0.9, fps: 10, cur: 1, exp: 2, err: false };
  const hand = { b: [10, 20, 60, 80] as [number, number, number, number], c: 0.9, k: [] };
  const fakeCtx = () => {
    const calls: string[] = [];
    const ctx = { save: () => undefined, restore: () => undefined, strokeRect: () => calls.push('box'), fillRect: () => undefined,
      fillText: (t: string) => calls.push(t), measureText: () => ({ width: 10 }), beginPath: () => undefined, arc: () => undefined, fill: () => undefined,
      lineWidth: 1, strokeStyle: '', fillStyle: '', font: '' } as unknown as CanvasRenderingContext2D;
    return { ctx, calls };
  };

  it('reads the step number from the PC name', () => {
    expect(stepNumber('Paso3_Interdigitales')).toBe(3);
    expect(stepNumber('Paso7_Circulares')).toBeNull();
    expect(stepNumber(null)).toBeNull();
  });
  it('parses the coach fields with safe defaults', () => {
    const ok = parseOverlay(JSON.stringify({ seq: 1, w: 10, h: 10, hands: [], step: null, conf: null, fps: 1, cur: 2, exp: 3, err: true }));
    expect([ok?.cur, ok?.exp, ok?.err]).toEqual([2, 3, true]);
    const old = parseOverlay(JSON.stringify({ seq: 1, w: 10, h: 10, hands: [] }));
    expect([old?.cur, old?.exp, old?.err]).toEqual([0, 1, false]);
  });
  it('labels the box with the detected step, once even for joined hands', () => {
    const { ctx, calls } = fakeCtx();
    drawOverlay(ctx, { ...base, step: 'Paso2_Dorsos', hands: [hand, { ...hand }] }, 100, 100);
    expect(calls.filter((c) => c === 'box')).toHaveLength(1);
    expect(calls).toContain('Paso 2 · Dorsos 90%');
  });
  it('says what it waits for when no step is detected, and flags an out-of-order step', () => {
    const waiting = fakeCtx();
    drawOverlay(waiting.ctx, { ...base, step: null, hands: [hand] }, 100, 100);
    expect(waiting.calls).toContain('Esperando: Paso 2 · Dorsos');
    const wrong = fakeCtx();
    drawOverlay(wrong.ctx, { ...base, step: 'Paso5_Pulgar', err: true, hands: [hand] }, 100, 100);
    expect(wrong.calls).toContain('Paso incorrecto: hiciste el Paso 5 · Pulgar; tocaba el Paso 2 · Dorsos. Se reinicia desde Palmas');
  });
});
