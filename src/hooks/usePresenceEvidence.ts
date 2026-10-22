import { useEffect, useRef } from 'react';
import { EvidenceFrameBuffer } from '@/lib/EvidenceFrameBuffer';
import { stationApi } from '@/lib/StationApi';
import type { FrictionEvaluation } from '@/types';

const SAMPLE_MS = 1_000;

/** True when Java closed the attempt because the person left before finishing (a reported wash). */
export function isReportedResult(result: FrictionEvaluation['ultimoResultado']): boolean {
  return result?.resultado === 'INTERRUPTED' && result.motivo === 'HANDS_ABSENT';
}

/**
 * Keeps one frame per attempt in RAM while the attempt is in progress and uploads it once, only if
 * Java reports that attempt. Any other outcome discards it. Does nothing unless capture is active.
 */
export function usePresenceEvidence(enabled: boolean, stream: MediaStream | null, sessionId: string | null,
  evaluation: FrictionEvaluation | null): void {
  const buffer = useRef<EvidenceFrameBuffer | null>(null);
  const uploaded = useRef(new Set<string>());
  const attemptRef = useRef<{ number: number; running: boolean }>({ number: 0, running: false });

  attemptRef.current = {
    number: evaluation?.numeroIntento ?? 0,
    running: evaluation?.estadoIntento === 'ACTIVO' || evaluation?.estadoIntento === 'PAUSADO',
  };

  useEffect(() => {
    if (!enabled || !stream || !sessionId) return;
    const frames = buffer.current ?? (buffer.current = new EvidenceFrameBuffer());
    const timer = window.setInterval(() => {
      const { number, running } = attemptRef.current;
      if (running && number > 0) void frames.capture(stream, number).catch(() => undefined);
    }, SAMPLE_MS);
    return () => window.clearInterval(timer);
  }, [enabled, stream, sessionId]);

  const result = evaluation?.ultimoResultado ?? null;
  useEffect(() => {
    if (!result || !sessionId) return;
    const frames = buffer.current;
    const key = `${sessionId}:${result.numeroIntento}`;
    const blob = frames?.take(result.numeroIntento) ?? null;
    if (!enabled || !isReportedResult(result) || !blob || uploaded.current.has(key)) return;
    uploaded.current.add(key);
    void stationApi.uploadEvidence(sessionId, result.numeroIntento, blob).catch(() => {
      // A failed or late upload only leaves the report without a photo; the wash result is unaffected.
    });
  }, [enabled, sessionId, result]);

  useEffect(() => {
    if (enabled && sessionId) return;
    buffer.current?.dispose();
    buffer.current = null;
  }, [enabled, sessionId]);

  useEffect(() => () => buffer.current?.dispose(), []);
}
