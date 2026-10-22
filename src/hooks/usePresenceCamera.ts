import { useEffect, useState } from 'react';
import { PresenceCameraService } from '@/lib/PresenceCameraService';
import { PresenceCameraSession } from '@/lib/StationCameraSession';
import { useCameraRecovery } from './useCameraRecovery';

const open = () => PresenceCameraService.open();
const adopt = (stream: MediaStream) => PresenceCameraSession.set(stream);

/** The Mac's built-in camera, opened only while photo capture is active for a running session. */
export function usePresenceCamera(needed: boolean): MediaStream | null {
  const [stream, setStream] = useState<MediaStream | null>(() => PresenceCameraSession.get());
  useEffect(() => PresenceCameraSession.subscribe(setStream), []);
  useEffect(() => {
    if (!needed) PresenceCameraSession.set(null);
  }, [needed]);
  useCameraRecovery(needed, stream, open, adopt);
  return stream;
}
