export class ContinuityBrowserCameraService {
  static async open(mediaDevices: MediaDevices = navigator.mediaDevices,
    secureContext = window.isSecureContext): Promise<MediaStream> {
    if (!secureContext) {
      throw new Error('La cámara del iPhone requiere HTTPS o localhost en este navegador.');
    }
    if (!mediaDevices?.getUserMedia || !mediaDevices.enumerateDevices) {
      throw new Error('Este navegador no permite seleccionar una cámara de Continuidad.');
    }

    let probe: MediaStream | null = null;
    try {
      // The temporary stream grants camera-label access; it is stopped before selecting iPhone.
      probe = await mediaDevices.getUserMedia({ audio: false, video: true });
      const probeTrack = probe.getVideoTracks()[0];
      if (probeTrack && isContinuityCamera(probeTrack.label)) return probe;

      const cameras = await mediaDevices.enumerateDevices();
      const continuity = cameras.find((device) => device.kind === 'videoinput'
        && device.deviceId && isContinuityCamera(device.label));
      stopTracks(probe);
      probe = null;
      if (!continuity) {
        throw new Error('No se encontró la cámara principal del iPhone. Desk View y FaceTime no se usarán.');
      }

      const selected = await mediaDevices.getUserMedia({
        audio: false,
        video: {
          deviceId: { exact: continuity.deviceId },
          width: { ideal: 1280 },
          height: { ideal: 720 },
          frameRate: { ideal: 30, max: 30 },
        },
      });
      const track = selected.getVideoTracks()[0];
      if (!track || !isContinuityCamera(track.label)) {
        stopTracks(selected);
        throw new Error('El navegador no abrió la cámara principal del iPhone seleccionada.');
      }
      return selected;
    } catch (error) {
      if (probe) stopTracks(probe);
      if (error instanceof Error && error.name === 'NotAllowedError') {
        throw new Error('Permite el acceso a la cámara para enlazar el iPhone.');
      }
      if (error instanceof Error && error.name === 'NotFoundError') {
        throw new Error('macOS no expone una cámara de Continuidad disponible al navegador.');
      }
      throw error;
    }
  }
}

export function stopTracks(stream: MediaStream | null | undefined): void {
  stream?.getTracks().forEach((track) => track.stop());
}

function isContinuityCamera(label: string): boolean {
  const normalized = label.toLocaleLowerCase();
  return /iphone|continuity|c[aá]mara de continuidad/.test(normalized)
    && !/desk\s*view|vista de escritorio|deskview/.test(normalized);
}
