import { RuntimeEndpointConfig } from '@/lib/RuntimeEndpointConfig';
import type { CameraRelayState } from '@/lib/BrowserRtcCameraRelay';
import { frameWithSequence } from '@/lib/CameraFrames';
import { QualityGovernor, type PictureSetting } from '@/lib/QualityGovernor';

export interface FrameSenderOptions {
  /** Frames per second to send (the phone drops frames when the network cannot keep up). */
  fps?: number;
  /** Longest side of the picture in pixels. */
  maxSide?: number;
  /** JPEG quality, 0..1. */
  quality?: number;
  /** Do not send while more than this many bytes are still waiting in the socket. */
  maxBuffered?: number;
  /** Turns the camera picture into a JPEG; replaceable for tests. */
  encode?: (video: HTMLVideoElement, setting: PictureSetting) => Promise<ArrayBuffer | null>;
}

const DEFAULTS = { fps: 15, maxSide: 960, quality: 0.72, maxBuffered: 90_000 };
const RETRY_MS = [1_000, 2_000, 4_000];
const REPLACED = 4000;
const OPEN = 1; // WebSocket.OPEN

function canvasEncoder() {
  const canvas = document.createElement('canvas');
  return async (video: HTMLVideoElement, { maxSide, quality }: PictureSetting): Promise<ArrayBuffer | null> => {
    const width = video.videoWidth;
    const height = video.videoHeight;
    if (!width || !height) return null;
    const scale = Math.min(1, maxSide / Math.max(width, height));
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
    return blob ? blob.arrayBuffer() : null;
  };
}

/**
 * Sends the phone's camera to the backend as JPEG frames over one WebSocket. Quality and frame rate are fixed here,
 * not negotiated: the PC always receives the same good picture. When the network falls behind, frames are dropped at
 * the phone (never queued), so the delay cannot grow.
 */
export class CameraFrameSender {
  private readonly options: Required<Omit<FrameSenderOptions, 'encode'>> & Pick<FrameSenderOptions, 'encode'>;

  constructor(
    private readonly getTicket: (sessionId: string) => Promise<string>,
    private readonly wsBase: string = RuntimeEndpointConfig.websocketBaseUrl(),
    options: FrameSenderOptions = {},
  ) {
    this.options = { ...DEFAULTS, ...options };
  }

  /** Returns the function that stops sending and closes everything. */
  run(sessionId: string, stream: MediaStream, onState: (state: CameraRelayState, attempt: number) => void): () => void {
    const { fps, maxBuffered } = this.options;
    const encode = this.options.encode ?? canvasEncoder();
    const governor = new QualityGovernor();
    const interval = Math.round(1000 / fps);
    const video = this.options.encode ? ({} as HTMLVideoElement) : document.createElement('video');
    if (!this.options.encode) {
      video.muted = true;
      video.playsInline = true;
      video.srcObject = stream;
      void video.play().catch(() => undefined);
    }
    let stopped = false;
    let socket: WebSocket | null = null;
    let attempt = 0;
    let seq = 0;
    let encoding = false;
    let tickTimer: ReturnType<typeof setTimeout> | undefined;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;

    const tick = async () => {
      if (stopped) return;
      const current = socket;
      if (current && current.readyState === OPEN && current.bufferedAmount >= maxBuffered) governor.congested();
      if (current && current.readyState === OPEN && current.bufferedAmount < maxBuffered && !encoding) {
        encoding = true;
        try {
          const jpeg = await encode(video, governor.current());
          if (jpeg && !stopped && current.readyState === OPEN) { current.send(frameWithSequence(seq++, jpeg)); governor.sent(); }
        } catch { /* one bad frame is skipped */ } finally { encoding = false; }
      }
      if (!stopped) tickTimer = setTimeout(() => void tick(), interval);
    };

    const connect = async () => {
      onState(attempt === 0 ? 'connecting' : 'reconnecting', attempt);
      let ticket: string;
      try { ticket = await this.getTicket(sessionId); } catch { scheduleRetry(); return; }
      if (stopped) return;
      const base = this.wsBase.replace(/\/+$/, '').replace(/^http/, 'ws');
      const ws = new WebSocket(`${base}/ws/camera-in/${encodeURIComponent(sessionId)}?ticket=${ticket}`);
      ws.binaryType = 'arraybuffer';
      socket = ws;
      ws.onopen = () => { attempt = 0; onState('connected', 0); };
      ws.onclose = (event) => {
        if (socket === ws) socket = null;
        if (stopped) return;
        if (event.code === REPLACED) { onState('failed', attempt); stopped = true; clearTimeout(tickTimer); return; }
        scheduleRetry();
      };
      ws.onerror = () => { ws.close(); };
    };

    const scheduleRetry = () => {
      if (stopped) return;
      onState('reconnecting', attempt + 1);
      retryTimer = setTimeout(() => void connect(), RETRY_MS[Math.min(attempt++, RETRY_MS.length - 1)]);
    };

    void connect();
    tickTimer = setTimeout(() => void tick(), interval);

    return () => {
      stopped = true;
      clearTimeout(tickTimer);
      clearTimeout(retryTimer);
      const closing = socket;
      socket = null;
      if (closing) { closing.onclose = null; closing.close(); }
      if (!this.options.encode) { video.srcObject = null; }
    };
  }
}
