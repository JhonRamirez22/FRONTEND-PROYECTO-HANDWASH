import { useEffect } from 'react';
import { ContinuityBrowserCameraService, stopTracks } from '@/lib/ContinuityBrowserCameraService';
import { StationCameraSession } from '@/lib/StationCameraSession';

const defaultOpen = () => ContinuityBrowserCameraService.open();
const FIRST_TRY_MS = 2_000;
const BASE_RETRY_MS = 5_000;
const MAX_RETRY_MS = 60_000;

/**
 * Re-opens the Continuity camera when a session needs it and the stream is gone (browser reload,
 * iPhone sleeping, cable). It works unattended only if the browser already remembers the camera
 * permission for this site; otherwise the retry simply keeps waiting.
 */
export function useCameraRecovery(needed: boolean, stream: MediaStream | null,
  open: () => Promise<MediaStream> = defaultOpen): void {
  useEffect(() => {
    if (!needed || stream) return;
    let cancelled = false;
    let attempt = 0;
    let timer: number | undefined;
    const tryOpen = async () => {
      try {
        const opened = await open();
        if (cancelled) stopTracks(opened);
        else StationCameraSession.set(opened);
      } catch {
        if (cancelled) return;
        timer = window.setTimeout(() => void tryOpen(), Math.min(MAX_RETRY_MS, BASE_RETRY_MS * 2 ** attempt));
        attempt += 1;
      }
    };
    timer = window.setTimeout(() => void tryOpen(), FIRST_TRY_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [needed, stream, open]);
}
