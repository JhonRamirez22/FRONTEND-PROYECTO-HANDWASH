import { useEffect } from 'react';

interface WakeLockSentinelLike { release: () => Promise<void> }
interface WakeLockLike { request: (type: 'screen') => Promise<WakeLockSentinelLike> }

/** A phone that falls asleep stops sending video: keep the screen on while the camera is publishing. */
export function useScreenWakeLock(active: boolean): void {
  useEffect(() => {
    if (!active) return undefined;
    const wakeLock = (navigator as Navigator & { wakeLock?: WakeLockLike }).wakeLock;
    if (!wakeLock) return undefined;
    let sentinel: WakeLockSentinelLike | null = null;
    let cancelled = false;
    const acquire = () => {
      wakeLock.request('screen').then((acquired) => {
        if (cancelled) { void acquired.release(); return; }
        sentinel = acquired;
      }).catch(() => { /* refused (battery saver, hidden tab): nothing else to do */ });
    };
    acquire();
    // The browser drops the lock when the page is hidden; take it again when the operator comes back.
    const onVisible = () => { if (document.visibilityState === 'visible' && !cancelled) acquire(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisible);
      void sentinel?.release();
    };
  }, [active]);
}
