import type { CameraRelayState, ProducerTelemetry } from './BrowserRtcCameraRelay';

export interface RelayConnector {
  connect(sessionId: string, stream: MediaStream, onState: (state: CameraRelayState) => void,
    signal?: AbortSignal, onTelemetry?: (status: ProducerTelemetry | null) => void): Promise<() => void>;
}

export interface SupervisorTimers {
  setTimeout(callback: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}

const browserTimers: SupervisorTimers = {
  setTimeout: (callback, ms) => window.setTimeout(callback, ms),
  clearTimeout: (handle) => window.clearTimeout(handle as number),
};

/**
 * Keeps the camera relay alive for as long as a session needs it. An unattended station cannot
 * ask an operator for help, so every failure becomes a new attempt with capped exponential backoff
 * and jitter. A brief WebRTC "disconnected" is given time to heal before the peer is rebuilt.
 */
export class RelaySupervisor {
  static readonly BASE_DELAY_MS = 1_000;
  static readonly MAX_DELAY_MS = 30_000;
  static readonly DISCONNECT_GRACE_MS = 5_000;

  constructor(
    private readonly connector: RelayConnector,
    private readonly random: () => number = Math.random,
    private readonly timers: SupervisorTimers = browserTimers,
  ) {}

  static delayFor(attempt: number, random: number): number {
    const exponential = Math.min(RelaySupervisor.MAX_DELAY_MS, RelaySupervisor.BASE_DELAY_MS * 2 ** attempt);
    return Math.round(exponential * (0.75 + 0.5 * random));
  }

  /** Returns the function that stops supervising and closes whatever is open. */
  run(sessionId: string, stream: MediaStream,
    onState: (state: CameraRelayState, attempt: number) => void,
    onTelemetry?: (status: ProducerTelemetry | null) => void): () => void {
    let stopped = false;
    let attempt = 0;
    let generation = 0;
    let release: (() => void) | null = null;
    let controller: AbortController | null = null;
    let retryTimer: unknown = null;
    let graceTimer: unknown = null;

    const clearGrace = () => {
      if (graceTimer === null) return;
      this.timers.clearTimeout(graceTimer);
      graceTimer = null;
    };
    const teardown = () => {
      generation += 1; // a late result of the abandoned connection is closed, never adopted
      clearGrace();
      controller?.abort();
      controller = null;
      release?.();
      release = null;
    };
    const scheduleRetry = () => {
      if (stopped || retryTimer !== null) return;
      teardown();
      onTelemetry?.(null);
      const delay = RelaySupervisor.delayFor(attempt, this.random());
      attempt += 1;
      onState('reconnecting', attempt);
      retryTimer = this.timers.setTimeout(() => {
        retryTimer = null;
        void connect();
      }, delay);
    };
    const connect = async () => {
      if (stopped) return;
      generation += 1;
      const mine = generation;
      const attemptController = new AbortController();
      controller = attemptController;
      onState('connecting', attempt);
      try {
        const opened = await this.connector.connect(sessionId, stream, (state) => {
          if (stopped || mine !== generation) return;
          if (state === 'connected') {
            attempt = 0;
            clearGrace();
            onState('connected', 0);
          } else if (state === 'failed') {
            scheduleRetry();
          } else if (state === 'disconnected') {
            onState('disconnected', attempt);
            if (graceTimer === null) graceTimer = this.timers.setTimeout(() => {
              graceTimer = null;
              scheduleRetry();
            }, RelaySupervisor.DISCONNECT_GRACE_MS);
          } else {
            onState(state, attempt);
          }
        }, attemptController.signal, (status) => {
          if (!stopped && mine === generation) onTelemetry?.(status);
        });
        if (stopped || mine !== generation) opened();
        else release = opened;
      } catch (error) {
        if (stopped || mine !== generation || (error instanceof DOMException && error.name === 'AbortError')) return;
        scheduleRetry();
      }
    };

    void connect();
    return () => {
      stopped = true;
      if (retryTimer !== null) this.timers.clearTimeout(retryTimer);
      retryTimer = null;
      teardown();
    };
  }
}
