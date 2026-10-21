import { stopTracks } from './ContinuityBrowserCameraService';

const EXCLUDED = /iphone|ipad|continuity|c[aá]mara de continuidad|desk\s*view|vista de escritorio|deskview|virtual|obs/i;
const BUILT_IN = /facetime|built-?in|integrad|macbook|imac|studio display/i;

/** True for the Mac's own camera; the iPhone is the washing-station feed, never the photo source. */
export function isBuiltInCamera(label: string): boolean {
  return BUILT_IN.test(label) && !EXCLUDED.test(label);
}

/** Opens the Mac's built-in camera, only used to keep one frame while a wash is in progress. */
export class PresenceCameraService {
  static async open(mediaDevices: MediaDevices = navigator.mediaDevices,
    secureContext = window.isSecureContext): Promise<MediaStream> {
    if (!secureContext) throw new Error('La cámara de la Mac requiere HTTPS o localhost.');
    if (!mediaDevices?.getUserMedia || !mediaDevices.enumerateDevices) {
      throw new Error('Este navegador no permite elegir la cámara de la Mac.');
    }
    let probe: MediaStream | null = null;
    try {
      // A temporary stream unlocks device labels; it is stopped before the built-in camera is selected.
      probe = await mediaDevices.getUserMedia({ audio: false, video: true });
      const probeLabel = probe.getVideoTracks()[0]?.label ?? '';
      if (isBuiltInCamera(probeLabel)) return probe;
      const devices = await mediaDevices.enumerateDevices();
      const builtIn = devices.find((device) => device.kind === 'videoinput' && device.deviceId
        && isBuiltInCamera(device.label));
      stopTracks(probe);
      probe = null;
      if (!builtIn) throw new Error('No se encontró la cámara integrada de la Mac.');
      const selected = await mediaDevices.getUserMedia({
        audio: false,
        video: { deviceId: { exact: builtIn.deviceId }, width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 5, max: 10 } },
      });
      const track = selected.getVideoTracks()[0];
      if (!track || !isBuiltInCamera(track.label)) {
        stopTracks(selected);
        throw new Error('El navegador no abrió la cámara integrada de la Mac.');
      }
      return selected;
    } catch (error) {
      if (probe) stopTracks(probe);
      if (error instanceof Error && error.name === 'NotAllowedError') {
        throw new Error('Permite el acceso a la cámara de la Mac para el registro de reportes.');
      }
      throw error;
    }
  }
}
