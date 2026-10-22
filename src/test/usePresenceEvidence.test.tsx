import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { isReportedResult, usePresenceEvidence } from '@/hooks/usePresenceEvidence';
import { stationApi } from '@/lib/StationApi';
import type { FrictionEvaluation } from '@/types';

const frames = vi.hoisted(() => ({
  capture: vi.fn(), take: vi.fn(), dispose: vi.fn(), clear: vi.fn(),
}));
vi.mock('@/lib/EvidenceFrameBuffer', () => ({ EvidenceFrameBuffer: class { capture = frames.capture; take = frames.take; dispose = frames.dispose; clear = frames.clear; } }));
vi.mock('@/lib/StationApi', () => ({ stationApi: { uploadEvidence: vi.fn(async () => undefined) } }));

const SESSION = '11111111-2222-3333-4444-555555555555';
const stream = {} as MediaStream;
function evaluation(overrides: Partial<FrictionEvaluation>): FrictionEvaluation {
  return { numeroIntento: 2, estadoIntento: 'ACTIVO', ultimoResultado: null, ...overrides } as FrictionEvaluation;
}
const reported = (attempt: number) => ({ numeroIntento: attempt, resultado: 'INTERRUPTED', motivo: 'HANDS_ABSENT', pasos: [] });

describe('report photo hook', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    frames.capture.mockResolvedValue(undefined);
    frames.take.mockReturnValue(new Blob([new Uint8Array(2000)], { type: 'image/jpeg' }));
  });
  afterEach(() => vi.useRealTimers());

  it('recognizes only the Java report result', () => {
    expect(isReportedResult(reported(1))).toBe(true);
    expect(isReportedResult({ numeroIntento: 1, resultado: 'INTERRUPTED', motivo: 'SESSION_CLOSED', pasos: [] })).toBe(false);
    expect(isReportedResult({ numeroIntento: 1, resultado: 'COMPLETE', motivo: null, pasos: [] })).toBe(false);
    expect(isReportedResult(null)).toBe(false);
  });

  it('samples one frame per second only while an attempt is running', () => {
    const { rerender } = renderHook(({ ev }) => usePresenceEvidence(true, stream, SESSION, ev),
      { initialProps: { ev: evaluation({}) } });
    act(() => { vi.advanceTimersByTime(3_000); });
    expect(frames.capture).toHaveBeenCalledTimes(3);
    expect(frames.capture).toHaveBeenCalledWith(stream, 2);

    rerender({ ev: evaluation({ estadoIntento: 'ESPERANDO_INICIO' }) });
    frames.capture.mockClear();
    act(() => { vi.advanceTimersByTime(3_000); });
    expect(frames.capture).not.toHaveBeenCalled();
  });

  it('uploads the retained frame once when Java reports that attempt', () => {
    const { rerender } = renderHook(({ ev }) => usePresenceEvidence(true, stream, SESSION, ev),
      { initialProps: { ev: evaluation({}) } });
    rerender({ ev: evaluation({ estadoIntento: 'ESPERANDO_INICIO', ultimoResultado: reported(2) }) });
    rerender({ ev: evaluation({ estadoIntento: 'ESPERANDO_INICIO', ultimoResultado: { ...reported(2) } }) });

    expect(frames.take).toHaveBeenCalledWith(2);
    expect(stationApi.uploadEvidence).toHaveBeenCalledTimes(1);
    expect(stationApi.uploadEvidence).toHaveBeenCalledWith(SESSION, 2, expect.any(Blob));
  });

  it('discards the frame and uploads nothing for unreported results', () => {
    const { rerender } = renderHook(({ ev }) => usePresenceEvidence(true, stream, SESSION, ev),
      { initialProps: { ev: evaluation({}) } });
    rerender({ ev: evaluation({ ultimoResultado: { numeroIntento: 2, resultado: 'COMPLETE', motivo: null, pasos: [] } }) });

    expect(frames.take).toHaveBeenCalledWith(2);
    expect(stationApi.uploadEvidence).not.toHaveBeenCalled();
  });

  it('does nothing and drops its buffer while capture is not active', () => {
    const { rerender } = renderHook(({ ev }) => usePresenceEvidence(false, null, SESSION, ev),
      { initialProps: { ev: evaluation({}) } });
    act(() => { vi.advanceTimersByTime(3_000); });
    rerender({ ev: evaluation({ ultimoResultado: reported(2) }) });

    expect(frames.capture).not.toHaveBeenCalled();
    expect(stationApi.uploadEvidence).not.toHaveBeenCalled();
  });
});
