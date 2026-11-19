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
