import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useCameraRecovery } from '@/hooks/useCameraRecovery';
import { StationCameraSession } from '@/lib/StationCameraSession';

function fakeStream() {
  const stop = vi.fn();
  const track = { readyState: 'live', stop, addEventListener: vi.fn() };
  return { stream: { getVideoTracks: () => [track], getTracks: () => [track] } as unknown as MediaStream, stop };
}

describe('camera recovery for an unattended station', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => { StationCameraSession.set(null); vi.useRealTimers(); });

  it('reopens the camera shortly after it disappears while a session needs it', async () => {
    const { stream } = fakeStream();
    const open = vi.fn().mockResolvedValue(stream);
    renderHook(() => useCameraRecovery(true, null, open));

    vi.advanceTimersByTime(1_999);
    expect(open).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);

    expect(open).toHaveBeenCalledTimes(1);
    expect(StationCameraSession.get()).toBe(stream);
  });

  it('retries with growing delays when the browser refuses, and stops once it works', async () => {
    const { stream } = fakeStream();
    const open = vi.fn().mockRejectedValueOnce(new Error('denied')).mockRejectedValueOnce(new Error('denied')).mockResolvedValue(stream);
    renderHook(() => useCameraRecovery(true, null, open));

    await vi.advanceTimersByTimeAsync(2_000);
    expect(open).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(5_000);
    expect(open).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(open).toHaveBeenCalledTimes(3);
    await vi.advanceTimersByTimeAsync(120_000);
    expect(open).toHaveBeenCalledTimes(3);
  });

  it('does nothing when no session needs the camera or a stream already exists', async () => {
    const open = vi.fn();
    renderHook(() => useCameraRecovery(false, null, open));
    renderHook(() => useCameraRecovery(true, fakeStream().stream, open));

    await vi.advanceTimersByTimeAsync(300_000);
    expect(open).not.toHaveBeenCalled();
  });

  it('releases a camera that opens after the station stopped needing it', async () => {
    const { stream, stop } = fakeStream();
    let resolveOpen: (value: MediaStream) => void = () => {};
    const open = vi.fn(() => new Promise<MediaStream>((resolve) => { resolveOpen = resolve; }));
    const { unmount } = renderHook(() => useCameraRecovery(true, null, open));

    await vi.advanceTimersByTimeAsync(2_000);
    unmount();
    resolveOpen(stream);
    await vi.advanceTimersByTimeAsync(0);

    expect(stop).toHaveBeenCalled();
    expect(StationCameraSession.get()).toBeNull();
  });
});
