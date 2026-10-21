import { describe, expect, it } from 'vitest';
import { ANALYZER_GRACE_MS, evaluateStationHealth, type StationHealthInput } from '@/lib/StationHealth';

const healthy: StationHealthInput = {
  gate: 'ready', sessionActive: true, hasStream: true, websocket: 'connected', relay: 'connected',
  relayStalledMs: 0, telemetryStale: false, javaTransport: 'connected',
};
const check = (overrides: Partial<StationHealthInput>) => evaluateStationHealth({ ...healthy, ...overrides });

describe('station health', () => {
  it('reports ok only when everything works', () => {
    expect(check({})).toMatchObject({ level: 'ok', code: 'OK' });
  });

  it('names a single real cause, highest priority first', () => {
    expect(check({ gate: 'checking' })).toMatchObject({ level: 'connecting', code: 'CHECKING' });
    expect(check({ gate: 'unregistered' })).toMatchObject({ level: 'idle', code: 'SETUP' });
    expect(check({ gate: 'unavailable', hasStream: false })).toMatchObject({ level: 'offline', code: 'SERVER_UNREACHABLE' });
    expect(check({ gate: 'resume-error' })).toMatchObject({ level: 'offline', code: 'SESSION_LOST' });
    expect(check({ sessionActive: false, hasStream: false })).toMatchObject({ level: 'idle', code: 'IDLE' });
    expect(check({ websocket: 'disconnected', hasStream: false })).toMatchObject({ code: 'SERVER_UNREACHABLE' });
    expect(check({ hasStream: false, relay: 'failed' })).toMatchObject({ level: 'offline', code: 'CAMERA_LOST' });
  });

  it('every offline state says the wash is not being evaluated, and never blames the person', () => {
    const offline = [
      check({ gate: 'unavailable' }), check({ gate: 'resume-error' }), check({ hasStream: false }),
      check({ websocket: 'disconnected' }), check({ relay: 'failed', relayStalledMs: ANALYZER_GRACE_MS + 1 }),
      check({ telemetryStale: true }),
    ];
    for (const state of offline) {
      expect(state.level).toBe('offline');
      expect(state.detail).toContain('El lavado no se está evaluando');
    }
  });

  it('gives a missing or reconnecting PC twenty seconds before declaring it offline', () => {
    expect(check({ relay: 'waiting-peer', relayStalledMs: ANALYZER_GRACE_MS }))
      .toMatchObject({ level: 'connecting', code: 'RECONNECTING_ANALYZER' });
    expect(check({ relay: 'waiting-peer', relayStalledMs: ANALYZER_GRACE_MS + 1 }))
      .toMatchObject({ level: 'offline', code: 'ANALYZER_OFFLINE' });
    expect(check({ relay: 'reconnecting', relayStalledMs: 3_000 })).toMatchObject({ level: 'connecting' });
  });

  it('treats a silent PC behind a live video link as offline and Java transport hiccups as recovering', () => {
    expect(check({ telemetryStale: true })).toMatchObject({ level: 'offline', code: 'ANALYZER_OFFLINE' });
    for (const javaTransport of ['retrying', 'rejected', 'reauthentication-required', 'session-ended'] as const) {
      expect(check({ javaTransport })).toMatchObject({ level: 'connecting', code: 'ANALYZER_RECOVERING' });
    }
    expect(check({ websocket: 'reconnecting' })).toMatchObject({ level: 'connecting', code: 'RECONNECTING_SERVER' });
    expect(check({ javaTransport: null })).toMatchObject({ level: 'ok' });
  });
});
