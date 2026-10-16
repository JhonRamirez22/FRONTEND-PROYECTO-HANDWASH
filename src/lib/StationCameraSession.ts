import { stopTracks } from './ContinuityBrowserCameraService';

let currentStream: MediaStream | null = null;
const listeners = new Set<(stream: MediaStream | null) => void>();

export class StationCameraSession {
  static get(): MediaStream | null {
    if (currentStream && !currentStream.getVideoTracks().some((track) => track.readyState === 'live')) {
      currentStream = null;
    }
    return currentStream;
  }

  static set(stream: MediaStream | null): void {
    if (currentStream === stream) return;
    if (currentStream && currentStream !== stream) stopTracks(currentStream);
    currentStream = stream;
    currentStream?.getVideoTracks().forEach((track) => {
      track.addEventListener('ended', () => {
        if (currentStream === stream) StationCameraSession.set(null);
      }, { once: true });
    });
    listeners.forEach((listener) => listener(currentStream));
  }

  static subscribe(listener: (stream: MediaStream | null) => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }
}
