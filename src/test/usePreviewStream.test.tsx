import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { usePreviewStream } from '@/hooks/usePreviewStream';

class FakeSocket {
  static instances: FakeSocket[] = [];
  binaryType = '';
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: Blob }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  closed = false;
  constructor(public url: string) { FakeSocket.instances.push(this); }
  close() { this.closed = true; this.onclose?.(); }
}

describe('usePreviewStream', () => {
  afterEach(() => { vi.unstubAllGlobals(); FakeSocket.instances = []; });

  function setup() {
    vi.stubGlobal('WebSocket', FakeSocket);
    let counter = 0;
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: vi.fn(() => `blob:frame-${++counter}`), revokeObjectURL: vi.fn() }));
  }

  it('connects to the session preview with a fresh ticket and shows the newest frame', async () => {
    setup();
    const ticket = vi.fn(async () => 'T'.repeat(43));
    const { result } = renderHook(() => usePreviewStream('s1', ticket, 'wss://api.example'));

    await waitFor(() => expect(FakeSocket.instances.length).toBe(1));
    expect(FakeSocket.instances[0]!.url).toBe(`wss://api.example/ws/preview/s1?ticket=${'T'.repeat(43)}`);
    expect(FakeSocket.instances[0]!.binaryType).toBe('blob');
    expect(result.current.url).toBeNull();

    act(() => { FakeSocket.instances[0]!.onmessage?.({ data: new Blob([new Uint8Array([255, 216])]) }); });
    expect(result.current.url).toBe('blob:frame-1');
    expect(result.current.live).toBe(true);
    act(() => { FakeSocket.instances[0]!.onmessage?.({ data: new Blob([new Uint8Array([255, 216])]) }); });
    expect(result.current.url).toBe('blob:frame-2');
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:frame-1');
  });

  it('does nothing without a session and closes the socket when the session ends', async () => {
    setup();
    const ticket = vi.fn(async () => 'T'.repeat(43));
    const { rerender } = renderHook(({ id }: { id: string | null }) => usePreviewStream(id, ticket, 'wss://api.example'),
      { initialProps: { id: null as string | null } });
    expect(FakeSocket.instances.length).toBe(0);
    rerender({ id: 's1' });
    await waitFor(() => expect(FakeSocket.instances.length).toBe(1));
    rerender({ id: null });
    expect(FakeSocket.instances[0]!.closed).toBe(true);
  });
});
