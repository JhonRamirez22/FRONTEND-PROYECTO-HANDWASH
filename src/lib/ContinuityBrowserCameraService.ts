export interface CameraChoice { deviceId: string; label: string; likelyIphone: boolean }
export interface OpenCameraOptions {
  /** Camera picked by the operator; opened as-is, without the iPhone label check. */
  deviceId?: string;
  /** How long to keep looking for the iPhone after permission is granted. */
  waitMs?: number;
  pollMs?: number;
}

const DEFAULT_WAIT_MS = 8000;
const DEFAULT_POLL_MS = 500;
const REMEMBERED_KEY = 'handwash.stationCameraId';

export class ContinuityBrowserCameraService {
  static async open(mediaDevices: MediaDevices = navigator.mediaDevices,
    secureContext = window.isSecureContext, options: OpenCameraOptions = {}): Promise<MediaStream> {
    if (!secureContext) {
      throw new Error('La cámara del iPhone requiere HTTPS o localhost en este navegador.');
    }
    if (!mediaDevices?.getUserMedia || !mediaDevices.enumerateDevices) {
      throw new Error('Este navegador no permite seleccionar una cámara de Continuidad.');
    }

    let probe: MediaStream | null = null;
    try {
      if (options.deviceId) return await openDevice(mediaDevices, options.deviceId, false);

      // The temporary stream grants camera-label access; it is stopped before selecting iPhone.
      probe = await mediaDevices.getUserMedia({ audio: false, video: true });
      const probeTrack = probe.getVideoTracks()[0];
      if (probeTrack && isContinuityCamera(probeTrack.label)) return probe;

      // Continuity Camera often shows up a few seconds after the permission prompt.
      const continuity = await waitForContinuity(mediaDevices,
        options.waitMs ?? DEFAULT_WAIT_MS, options.pollMs ?? DEFAULT_POLL_MS);
      stopTracks(probe);
      probe = null;
      if (!continuity) {
        throw new Error('No se encontró la cámara principal del iPhone. Desk View y FaceTime no se usarán.');
      }
      return await openDevice(mediaDevices, continuity.deviceId, true);
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

  /** Video inputs the operator may pick manually; Desk View is never offered. */
  static async listCameras(mediaDevices: MediaDevices = navigator.mediaDevices): Promise<CameraChoice[]> {
    if (!mediaDevices?.enumerateDevices) return [];
    const devices = await mediaDevices.enumerateDevices();
    return devices
      .filter((device) => device.kind === 'videoinput' && device.deviceId && !isDeskView(device.label))
      .map((device) => ({
        deviceId: device.deviceId,
        label: device.label || 'Cámara sin nombre',
        likelyIphone: isContinuityCamera(device.label),
      }));
  }

  static remember(deviceId: string | null): void {
    try {
      if (deviceId) localStorage.setItem(REMEMBERED_KEY, deviceId);
      else localStorage.removeItem(REMEMBERED_KEY);
    } catch { /* storage unavailable: nothing to remember */ }
  }

  static remembered(): string | null {
    try { return localStorage.getItem(REMEMBERED_KEY); } catch { return null; }
  }
}

async function openDevice(mediaDevices: MediaDevices, deviceId: string, requireIphone: boolean): Promise<MediaStream> {
  const selected = await mediaDevices.getUserMedia({
    audio: false,
    video: {
      deviceId: { exact: deviceId },
      width: { ideal: 1280 },
      height: { ideal: 720 },
      frameRate: { ideal: 30, max: 30 },
    },
  });
  const track = selected.getVideoTracks()[0];
  if (!track || isDeskView(track.label) || (requireIphone && !isContinuityCamera(track.label))) {
    stopTracks(selected);
    throw new Error('El navegador no abrió la cámara principal del iPhone seleccionada.');
  }
  return selected;
}

async function waitForContinuity(mediaDevices: MediaDevices, waitMs: number, pollMs: number) {
  const deadline = Date.now() + waitMs;
  for (;;) {
    const devices = await mediaDevices.enumerateDevices();
    const found = devices.find((device) => device.kind === 'videoinput'
      && device.deviceId && isContinuityCamera(device.label));
    if (found || Date.now() >= deadline) return found ?? null;
    await new Promise((resolve) => setTimeout(resolve, pollMs));
  }
}

export function stopTracks(stream: MediaStream | null | undefined): void {
  stream?.getTracks().forEach((track) => track.stop());
}

function isDeskView(label: string): boolean {
  return /desk\s*view|vista de escritorio|deskview/.test(label.toLocaleLowerCase());
}

function isContinuityCamera(label: string): boolean {
  return /iphone|continuity|c[aá]mara de continuidad/.test(label.toLocaleLowerCase()) && !isDeskView(label);
}
