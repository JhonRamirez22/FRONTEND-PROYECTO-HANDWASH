import { useEffect, useRef, useState } from 'react';
import { RuntimeEndpointConfig } from '@/lib/RuntimeEndpointConfig';

/** The panel is "live" while a frame arrived in the last this-many milliseconds. */
const LIVE_WINDOW_MS = 3_000;
const RETRY_MS = [1_000, 2_000, 4_000];

export interface PreviewStream {
  /** Object URL of the newest annotated frame (the camera image with the hand boxes), or null. */
  url: string | null;
  live: boolean;
}

/**
 * Watches the annotated preview the RTX PC publishes for a session. Frames replace each other; a dropped socket
 * reconnects with a fresh ticket for as long as the session lasts.
 */
export function usePreviewStream(
  sessionId: string | null,
  getTicket: (sessionId: string) => Promise<string>,
  wsBase: string = RuntimeEndpointConfig.websocketBaseUrl(),
): PreviewStream {
  const [url, setUrl] = useState<string | null>(null);
  const [live, setLive] = useState(false);
  const lastFrameAt = useRef(0);
  const ticketRef = useRef(getTicket);
  ticketRef.current = getTicket;

  useEffect(() => {
    if (!sessionId) { setUrl(null); setLive(false); return undefined; }
    let alive = true;
    let socket: WebSocket | null = null;
    let retryTimer: number | undefined;
    let attempt = 0;
    let currentUrl: string | null = null;

    const showFrame = (blob: Blob) => {
      const next = URL.createObjectURL(blob);
      if (currentUrl) URL.revokeObjectURL(currentUrl);
      currentUrl = next;
      lastFrameAt.current = Date.now();
      setUrl(next);
      setLive(true);
    };

    const connect = async () => {
      let ticket: string;
      try { ticket = await ticketRef.current(sessionId); } catch { scheduleRetry(); return; }
      if (!alive) return;
      const base = wsBase.replace(/\/+$/, '').replace(/^http/, 'ws');
      socket = new WebSocket(`${base}/ws/preview/${encodeURIComponent(sessionId)}?ticket=${ticket}`);
      socket.binaryType = 'blob';
      socket.onopen = () => { attempt = 0; };
      socket.onmessage = (event) => { if (event.data instanceof Blob) showFrame(event.data); };
      socket.onclose = () => { if (alive) scheduleRetry(); };
      socket.onerror = () => { socket?.close(); };
    };
    const scheduleRetry = () => {
      if (!alive) return;
      retryTimer = window.setTimeout(() => void connect(), RETRY_MS[Math.min(attempt++, RETRY_MS.length - 1)]);
    };
    void connect();

    const watchdog = window.setInterval(() => {
      if (lastFrameAt.current && Date.now() - lastFrameAt.current > LIVE_WINDOW_MS) setLive(false);
    }, 1_000);

    return () => {
      alive = false;
      window.clearTimeout(retryTimer);
      window.clearInterval(watchdog);
      const closing = socket;
      socket = null;
      if (closing) { closing.onclose = null; closing.close(); }
      if (currentUrl) URL.revokeObjectURL(currentUrl);
      lastFrameAt.current = 0;
      setUrl(null);
      setLive(false);
    };
  }, [sessionId, wsBase]);

  return { url, live };
}
