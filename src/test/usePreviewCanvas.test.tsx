import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { usePreviewCanvas } from '@/hooks/usePreviewCanvas';

class FakeSocket {
  static instances: FakeSocket[] = [];
  binaryType = '';
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: ArrayBuffer | string }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  closed = false;
  constructor(public url: string) { FakeSocket.instances.push(this); }
  close() { this.closed = true; this.onclose?.(); }
}

const framed = (seq: number) => new Uint8Array([0, 0, 0, seq, 0xff, 0xd8, 1, 2]).buffer;

function setup() {
  FakeSocket.instances = [];
  vi.stubGlobal('WebSocket', FakeSocket);
  const bitmap = { width: 960, height: 540, close: vi.fn() };
  vi.stubGlobal('createImageBitmap', vi.fn(async () => bitmap));
  const ctx = { drawImage: vi.fn(), clearRect: vi.fn(), strokeRect: vi.fn(), fillRect: vi.fn(), fillText: vi.fn(), beginPath: vi.fn(), arc: vi.fn(), fill: vi.fn(),
    measureText: () => ({ width: 30 }), save: vi.fn(), restore: vi.fn() };
  const canvas = { width: 0, height: 0, getContext: () => ctx } as unknown as HTMLCanvasElement;
  return { ctx, canvas, bitmap };
}

describe('usePreviewCanvas', () => {
  afterEach(() => { vi.unstubAllGlobals(); });

  it('connects to the session with a fresh ticket and draws the phone frame at full size', async () => {
    const { ctx, canvas } = setup();
    const { result } = renderHook(() => usePreviewCanvas('s1', async () => 'T'.repeat(43), 'wss://api.example'));
    act(() => result.current.attachCanvas(canvas));
    await waitFor(() => expect(FakeSocket.instances.length).toBe(1));
    expect(FakeSocket.instances[0]!.url).toBe(`wss://api.example/ws/preview/s1?ticket=${'T'.repeat(43)}`);
    expect(FakeSocket.instances[0]!.binaryType).toBe('arraybuffer');

    act(() => { FakeSocket.instances[0]!.onmessage?.({ data: framed(1) }); });
    await waitFor(() => expect(ctx.drawImage).toHaveBeenCalled());
    expect(canvas.width).toBe(960);
    expect(canvas.height).toBe(540);
    expect(result.current.live).toBe(true);
  });

  it('draws the PC boxes over the picture and reports the detected step', async () => {
    const { ctx, canvas } = setup();
    const { result } = renderHook(() => usePreviewCanvas('s1', async () => 'T'.repeat(43), 'wss://api.example'));
    act(() => result.current.attachCanvas(canvas));
    await waitFor(() => expect(FakeSocket.instances.length).toBe(1));
    act(() => { FakeSocket.instances[0]!.onmessage?.({ data: framed(1) }); });
    await waitFor(() => expect(ctx.drawImage).toHaveBeenCalled());

    act(() => {
      FakeSocket.instances[0]!.onmessage?.({ data: JSON.stringify({ seq: 1, w: 960, h: 540, hands: [{ b: [10, 20, 110, 220], c: 0.9, k: [] }], step: 'Paso1_Palmas', conf: 0.88, fps: 14 }) });
    });
    await waitFor(() => expect(ctx.strokeRect).toHaveBeenCalled());
    expect(result.current.detected).toEqual({ step: 'Paso1_Palmas', confidence: 0.88, hands: 1, current: 0, expected: 1, error: false });
  });

  it('ignores a malformed overlay and does nothing without a session', async () => {
    const { canvas } = setup();
    const { result, rerender } = renderHook(({ id }: { id: string | null }) => usePreviewCanvas(id, async () => 'T'.repeat(43), 'wss://api.example'),
      { initialProps: { id: null as string | null } });
    act(() => result.current.attachCanvas(canvas));
    expect(FakeSocket.instances.length).toBe(0);
    rerender({ id: 's1' });
    await waitFor(() => expect(FakeSocket.instances.length).toBe(1));
    act(() => { FakeSocket.instances[0]!.onmessage?.({ data: 'not json' }); });
    expect(result.current.detected).toBeNull();
    rerender({ id: null });
    expect(FakeSocket.instances[0]!.closed).toBe(true);
  });
});
