import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { useScreenWakeLock } from '@/hooks/useScreenWakeLock';

function Probe({ active }: { active: boolean }) {
  useScreenWakeLock(active);
  return null;
}

function fakeWakeLock() {
  const release = vi.fn(async () => undefined);
  const request = vi.fn(async () => ({ release, addEventListener: vi.fn() }));
  Object.defineProperty(navigator, 'wakeLock', { value: { request }, configurable: true });
  return { request, release };
}

describe('useScreenWakeLock', () => {
  afterEach(() => { cleanup(); Reflect.deleteProperty(navigator, 'wakeLock'); });

  it('keeps the screen on while the phone is streaming and lets go afterwards', async () => {
    const { request, release } = fakeWakeLock();
    const { rerender } = render(<Probe active />);
    await vi.waitFor(() => expect(request).toHaveBeenCalledWith('screen'));

    rerender(<Probe active={false} />);
    await vi.waitFor(() => expect(release).toHaveBeenCalled());
  });

  it('does nothing when the browser has no wake lock or the lock is refused', async () => {
    expect(() => render(<Probe active />)).not.toThrow();
    cleanup();
    Object.defineProperty(navigator, 'wakeLock', { value: { request: vi.fn(async () => { throw new Error('denied'); }) }, configurable: true });
    expect(() => render(<Probe active />)).not.toThrow();
  });

  it('does not ask for the lock while inactive', () => {
    const { request } = fakeWakeLock();
    render(<Probe active={false} />);
    expect(request).not.toHaveBeenCalled();
  });
});
