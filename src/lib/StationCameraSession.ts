import { stopTracks } from './ContinuityBrowserCameraService';

type Listener = (stream: MediaStream | null) => void;

/** Holds one camera stream for the whole page lifetime, so it survives route changes. */
export function createCameraSession() {
  let currentStream: MediaStream | null = null;
  const listeners = new Set<Listener>();
  const session = {
    get(): MediaStream | null {
      if (currentStream && !currentStream.getVideoTracks().some((track) => track.readyState === 'live')) {
        currentStream = null;
      }
      return currentStream;
    },
    set(stream: MediaStream | null): void {
      if (currentStream === stream) return;
      if (currentStream && currentStream !== stream) stopTracks(currentStream);
      currentStream = stream;
      currentStream?.getVideoTracks().forEach((track) => {
        track.addEventListener('ended', () => {
          if (currentStream === stream) session.set(null);
        }, { once: true });
      });
      listeners.forEach((listener) => listener(currentStream));
    },
    subscribe(listener: Listener): () => void {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
  return session;
}

const station = createCameraSession();

export class StationCameraSession {
  static get(): MediaStream | null { return station.get(); }
  static set(stream: MediaStream | null): void { station.set(stream); }
  static subscribe(listener: Listener): () => void { return station.subscribe(listener); }
}

/** The Mac's built-in camera, kept apart from the iPhone feed. */
export const PresenceCameraSession = createCameraSession();
