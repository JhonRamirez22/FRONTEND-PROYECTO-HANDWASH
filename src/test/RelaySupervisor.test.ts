import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CameraRelayState } from '@/lib/BrowserRtcCameraRelay';
import { RelaySupervisor, type RelayConnector } from '@/lib/RelaySupervisor';

type StateCallback = (state: CameraRelayState) => void;

class FakeConnector implements RelayConnector {
  calls: { onState: StateCallback; signal?: AbortSignal; release: ReturnType<typeof vi.fn>;
    onTelemetry?: (value: null | object) => void; resolve: () => void; reject: (error: unknown) => void }[] = [];

  connect(_sessionId: string, _stream: MediaStream, onState: StateCallback, signal?: AbortSignal,
    onTelemetry?: (status: never) => void): Promise<() => void> {
    return new Promise((resolve, reject) => {
      const release = vi.fn();
      this.calls.push({ onState, signal, release, onTelemetry: onTelemetry as never,
        resolve: () => resolve(release), reject });
    });
  }
}

const stream = {} as MediaStream;
const flush = async () => { await Promise.resolve(); await Promise.resolve(); };

describe('RelaySupervisor', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  function setup() {
    const connector = new FakeConnector();
    const states: [CameraRelayState, number][] = [];
    const telemetry: unknown[] = [];
    const stop = new RelaySupervisor(connector, () => 0.5).run('s1', stream,
      (state, attempt) => states.push([state, attempt]), (status) => telemetry.push(status));
    return { connector, states, telemetry, stop };
  }

  it('retries every failure with doubling delays capped at 30 s, and resets after a success', async () => {
    const { connector, states } = setup();
    connector.calls[0]!.resolve();
    await flush();
    connector.calls[0]!.onState('failed');
    expect(states.at(-1)).toEqual(['reconnecting', 1]);

    const delays = [1_000, 2_000, 4_000, 8_000, 16_000, 30_000, 30_000];
    for (const [index, delay] of delays.entries()) {
      vi.advanceTimersByTime(delay - 1);
      expect(connector.calls, `attempt ${index} must wait ${delay} ms`).toHaveLength(index + 1);
      vi.advanceTimersByTime(1);
      expect(connector.calls).toHaveLength(index + 2);
      connector.calls[index + 1]!.onState('failed');
    }

    const last = connector.calls.at(-1)!;
    vi.advanceTimersByTime(30_000);
    connector.calls.at(-1)!.resolve();
    await flush();
    connector.calls.at(-1)!.onState('connected');
    expect(states.at(-1)).toEqual(['connected', 0]);
    connector.calls.at(-1)!.onState('failed');
    expect(states.at(-1)).toEqual(['reconnecting', 1]);
    expect(last.signal?.aborted, 'an abandoned attempt is aborted').toBe(true);
  });

  it('retries when the connection itself cannot be established', async () => {
    const { connector, states } = setup();
    connector.calls[0]!.reject(new Error('ticket'));
    await flush();

    expect(states.at(-1)).toEqual(['reconnecting', 1]);
    vi.advanceTimersByTime(1_000);
    expect(connector.calls).toHaveLength(2);
  });

  it('gives a brief WebRTC disconnect five seconds to heal before rebuilding the peer', async () => {
    const { connector, states } = setup();
    connector.calls[0]!.resolve();
    await flush();
    connector.calls[0]!.onState('connected');

    connector.calls[0]!.onState('disconnected');
    vi.advanceTimersByTime(4_999);
    connector.calls[0]!.onState('connected');
    vi.advanceTimersByTime(10_000);
    expect(connector.calls, 'healed in time: no new connection').toHaveLength(1);
    expect(states.at(-1)).toEqual(['connected', 0]);

    connector.calls[0]!.onState('disconnected');
    vi.advanceTimersByTime(5_000);
    expect(states.at(-1)![0]).toBe('reconnecting');
    expect(connector.calls[0]!.release).toHaveBeenCalledTimes(1);
  });

  it('ignores callbacks from a connection that was already abandoned and closes its late result', async () => {
    const { connector, states, telemetry } = setup();
    connector.calls[0]!.onState('failed');
    expect(telemetry).toEqual([null]);
    vi.advanceTimersByTime(1_000);

    connector.calls[0]!.onState('connected');
    expect(states.at(-1)![0], 'old peer must not report connected').toBe('connecting');
    connector.calls[0]!.resolve();
    await flush();
    expect(connector.calls[0]!.release, 'late result of the abandoned attempt is closed').toHaveBeenCalledTimes(1);
    expect(connector.calls[0]!.signal?.aborted).toBe(true);
  });

  it('stops cleanly: closes the open relay, cancels timers and never adopts a late connection', async () => {
    const { connector, stop } = setup();
    connector.calls[0]!.resolve();
    await flush();
    connector.calls[0]!.onState('failed');
    stop();
    vi.advanceTimersByTime(120_000);
    expect(connector.calls).toHaveLength(1);

    const second = setup();
    second.stop();
    second.connector.calls[0]!.resolve();
    await flush();
    expect(second.connector.calls[0]!.release).toHaveBeenCalledTimes(1);
    expect(second.connector.calls[0]!.signal?.aborted).toBe(true);
  });

  it('does not retry an abort caused by stopping', async () => {
    const { connector, stop } = setup();
    stop();
    connector.calls[0]!.reject(new DOMException('cancelled', 'AbortError'));
    await flush();
    vi.advanceTimersByTime(60_000);
    expect(connector.calls).toHaveLength(1);
  });

  it('adds up to 25 % of jitter either way to the delay', () => {
    expect(RelaySupervisor.delayFor(0, 0)).toBe(750);
    expect(RelaySupervisor.delayFor(0, 1)).toBe(1_250);
    expect(RelaySupervisor.delayFor(20, 0.5)).toBe(30_000);
  });
});
