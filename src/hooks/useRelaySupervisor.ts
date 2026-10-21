import { useEffect, useRef, useState } from 'react';
import { BrowserRtcCameraRelay, type CameraRelayState, type ProducerTelemetry } from '@/lib/BrowserRtcCameraRelay';
import { RelaySupervisor } from '@/lib/RelaySupervisor';

const supervisor = new RelaySupervisor(new BrowserRtcCameraRelay());
export const TELEMETRY_STALE_MS = 10_000;
const CHECK_INTERVAL_MS = 2_000;

export interface SupervisedRelay {
  state: CameraRelayState | 'idle';
  attempt: number;
  telemetry: ProducerTelemetry | null;
  /** Milliseconds the relay has been unable to deliver video, or 0 while it is connected. */
  stalledMs: number;
  /** True when the relay is up but the PC stopped reporting its status. */
  telemetryStale: boolean;
}

/** One supervised relay per session and camera stream; null inputs mean "nothing to relay". */
export function useRelaySupervisor(sessionId: string | null, stream: MediaStream | null): SupervisedRelay {
  const [state, setState] = useState<CameraRelayState | 'idle'>('idle');
  const [attempt, setAttempt] = useState(0);
  const [telemetry, setTelemetry] = useState<ProducerTelemetry | null>(null);
  const [stalledMs, setStalledMs] = useState(0);
  const [telemetryStale, setTelemetryStale] = useState(false);
  const stateRef = useRef<CameraRelayState | 'idle'>('idle');
  const downSince = useRef<number | null>(null);
  const lastSignOfLife = useRef<number | null>(null);

  useEffect(() => {
    const apply = (next: CameraRelayState | 'idle') => {
      stateRef.current = next;
      setState(next);
      if (next === 'connected') {
        downSince.current = null;
        lastSignOfLife.current = Date.now();
        setStalledMs(0);
      } else if (next !== 'idle' && downSince.current === null) {
        downSince.current = Date.now();
      }
    };
    if (!sessionId || !stream) {
      downSince.current = null;
      lastSignOfLife.current = null;
      apply('idle');
      setAttempt(0);
      setTelemetry(null);
      setStalledMs(0);
      setTelemetryStale(false);
      return;
    }
    downSince.current = Date.now();
    lastSignOfLife.current = null;
    const stop = supervisor.run(sessionId, stream, (next, currentAttempt) => {
      apply(next);
      setAttempt(currentAttempt);
    }, (status) => {
      setTelemetry(status);
      if (status) {
        lastSignOfLife.current = Date.now();
        setTelemetryStale(false);
      }
    });
    const timer = window.setInterval(() => {
      const now = Date.now();
      const connected = stateRef.current === 'connected';
      setStalledMs(!connected && downSince.current !== null ? now - downSince.current : 0);
      setTelemetryStale(connected && lastSignOfLife.current !== null && now - lastSignOfLife.current > TELEMETRY_STALE_MS);
    }, CHECK_INTERVAL_MS);
    return () => {
      window.clearInterval(timer);
      stop();
    };
  }, [sessionId, stream]);

  return { state, attempt, telemetry, stalledMs, telemetryStale };
}
