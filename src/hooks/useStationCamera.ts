import { useEffect, useState } from 'react';
import { StationCameraSession } from '@/lib/StationCameraSession';

export function useStationCamera() {
  const [stream, setStream] = useState<MediaStream | null>(() => StationCameraSession.get());
  useEffect(() => StationCameraSession.subscribe(setStream), []);
  return { stream, setStream: StationCameraSession.set };
}
