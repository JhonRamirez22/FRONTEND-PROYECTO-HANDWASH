import { describe, expect, it } from 'vitest';
import { parseProducerTelemetry } from '@/lib/BrowserRtcCameraRelay';

describe('producer WebRTC telemetry', () => {
  it('accepts only bounded operational status and never requires step labels', () => {
    expect(parseProducerTelemetry(JSON.stringify({
      type: 'producer-status', modelsReady: true, activeModelsReady: true,
      challengerReady: false, inferenceFps: 5, inferenceMs: 91,
      javaTransport: 'connected', clinicalValidation: 'NOT_VALIDATED',
    }))).toEqual({
      modelsReady: true, activeModelsReady: true, challengerReady: false,
      inferenceFps: 5, inferenceMs: 91, javaTransport: 'connected',
      clinicalValidation: 'NOT_VALIDATED',
    });
  });

  it('rejects malformed, oversized, unbounded or clinical-approval claims', () => {
    expect(parseProducerTelemetry('{')).toBeNull();
    expect(parseProducerTelemetry('x'.repeat(4097))).toBeNull();
    expect(parseProducerTelemetry(JSON.stringify({ type: 'producer-status', inferenceFps: 1000 }))).toBeNull();
    expect(parseProducerTelemetry(JSON.stringify({
      type: 'producer-status', modelsReady: true, activeModelsReady: true,
      challengerReady: true, inferenceFps: 5, inferenceMs: 2,
      javaTransport: 'connected', clinicalValidation: 'APPROVED', step: 'PASO_1_PALMAS',
    }))).toBeNull();
  });
});
