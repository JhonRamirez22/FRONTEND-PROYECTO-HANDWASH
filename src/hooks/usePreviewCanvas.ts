import { useCallback, useEffect, useRef, useState } from 'react';
import { RuntimeEndpointConfig } from '@/lib/RuntimeEndpointConfig';
import { drawOverlay, parseOverlay, splitFrame, type Overlay } from '@/lib/CameraFrames';

const LIVE_WINDOW_MS = 3_000;
const OVERLAY_FRESH_MS = 700;
const RETRY_MS = [1_000, 2_000, 4_000];

export interface DetectedSummary {
  step: string | null; confidence: number | null; hands: number;
  /** Steps done so far, the step expected next (0 = complete) and whether the last one was out of order. */
  current: number; expected: number; error: boolean;
}

export interface PreviewCanvas {
  /** Gives the hook the <canvas> it draws on (a callback ref). */
  attachCanvas: (canvas: HTMLCanvasElement | null) => void;
  live: boolean;
  /** What the PC last reported, for the labels around the picture. */
  detected: DetectedSummary | null;
}

/**
 * The panel's picture: the phone's own frames in full quality with the PC's hand boxes drawn over them. Only the newest
 * frame is decoded and painted, so the browser can never fall behind; a dropped socket reconnects with a fresh ticket.
 */
export function usePreviewCanvas(
  sessionId: string | null,
  getTicket: (sessionId: string) => Promise<string>,
  wsBase: string = RuntimeEndpointConfig.websocketBaseUrl(),
): PreviewCanvas {
  const [live, setLive] = useState(false);
  const [detected, setDetected] = useState<DetectedSummary | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const ticketRef = useRef(getTicket);
  ticketRef.current = getTicket;
  const attachCanvas = useCallback((canvas: HTMLCanvasElement | null) => { canvasRef.current = canvas; }, []);

  useEffect(() => {
    if (!sessionId) { setLive(false); setDetected(null); return undefined; }
    let alive = true;
    let socket: WebSocket | null = null;
    let retryTimer: number | undefined;
    let attempt = 0;
    let bitmap: ImageBitmap | null = null;
    let overlay: Overlay | null = null;
    let overlayAt = 0;
    let lastFrameAt = 0;
    let decoding = false;
    let pending: Blob | null = null;
    let paintRequest = 0;
    let lastSummary = '';

    const paint = () => {
      paintRequest = 0;
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext('2d');
      if (!canvas || !ctx || !bitmap) return;
      if (canvas.width !== bitmap.width || canvas.height !== bitmap.height) { canvas.width = bitmap.width; canvas.height = bitmap.height; }
      ctx.drawImage(bitmap, 0, 0);
      if (overlay && Date.now() - overlayAt < OVERLAY_FRESH_MS) drawOverlay(ctx, overlay, canvas.width, canvas.height);
    };
    const requestPaint = () => { if (!paintRequest) paintRequest = window.requestAnimationFrame(paint); };

    const decodeNewest = async () => {
      if (decoding) return;
      decoding = true;
      try {
        while (pending && alive) {
          const blob = pending;
          pending = null;
          let next: ImageBitmap;
          try { next = await createImageBitmap(blob); } catch { continue; }
          bitmap?.close?.();
          bitmap = next;
          lastFrameAt = Date.now();
          setLive(true);
          requestPaint();
        }
      } finally { decoding = false; }
    };

    const onMessage = (data: unknown) => {
      if (typeof data === 'string') {
        const parsed = parseOverlay(data);
        if (!parsed) return;
        overlay = parsed;
        overlayAt = Date.now();
        const summary = `${parsed.step ?? ''}|${parsed.conf ?? ''}|${parsed.hands.length}|${parsed.cur}|${parsed.exp}|${parsed.err}`;
        if (summary !== lastSummary) {
          lastSummary = summary;
          setDetected({ step: parsed.step, confidence: parsed.conf, hands: parsed.hands.length, current: parsed.cur, expected: parsed.exp, error: parsed.err });
        }
        requestPaint();
      } else if (data instanceof ArrayBuffer) {
        const frame = splitFrame(data);
        if (frame) { pending = frame.jpeg; void decodeNewest(); }
      }
    };

    const connect = async () => {
      let ticket: string;
      try { ticket = await ticketRef.current(sessionId); } catch { scheduleRetry(); return; }
      if (!alive) return;
      const base = wsBase.replace(/\/+$/, '').replace(/^http/, 'ws');
      socket = new WebSocket(`${base}/ws/preview/${encodeURIComponent(sessionId)}?ticket=${ticket}`);
      socket.binaryType = 'arraybuffer';
      socket.onopen = () => { attempt = 0; };
      socket.onmessage = (event) => onMessage(event.data);
      socket.onclose = () => { if (alive) scheduleRetry(); };
      socket.onerror = () => { socket?.close(); };
    };
    const scheduleRetry = () => {
      if (!alive) return;
      retryTimer = window.setTimeout(() => void connect(), RETRY_MS[Math.min(attempt++, RETRY_MS.length - 1)]);
    };
    void connect();

    const watchdog = window.setInterval(() => {
      if (lastFrameAt && Date.now() - lastFrameAt > LIVE_WINDOW_MS) { setLive(false); setDetected(null); }
    }, 1_000);

    return () => {
      alive = false;
      window.clearTimeout(retryTimer);
      window.clearInterval(watchdog);
      if (paintRequest) window.cancelAnimationFrame(paintRequest);
      const closing = socket;
      socket = null;
      if (closing) { closing.onclose = null; closing.close(); }
      bitmap?.close?.();
      setLive(false);
      setDetected(null);
    };
  }, [sessionId, wsBase]);

  return { attachCanvas, live, detected };
}
