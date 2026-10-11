import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DeploymentStatusService } from '../lib/DeploymentStatusService';

describe('DeploymentStatusService', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('requests runtime mode without allowing browser caching', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        mode: 'NON_CLINICAL_DEMO',
        clinicalDecisionAllowed: false,
        notice: 'Demo no clínica',
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const status = await new DeploymentStatusService().load();

    expect(status.mode).toBe('NON_CLINICAL_DEMO');
    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1:8080/api/v1/deployment/status',
      expect.objectContaining({ cache: 'no-store' })
    );
  });

  it('rejects a backend response that claims clinical authorization', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        mode: 'HOSPITAL_PILOT',
        clinicalDecisionAllowed: true,
        notice: 'Autorizado',
      }),
    }));

    await expect(new DeploymentStatusService().load()).rejects.toThrow('deployment status response is invalid');
  });

  it('times out a stalled backend request so the dashboard can return to an unverified state', async () => {
    vi.useFakeTimers();
    let requestSignal: AbortSignal | undefined;
    vi.stubGlobal('fetch', vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
      requestSignal = init?.signal as AbortSignal;
      return new Promise<Response>((_resolve, reject) => {
        requestSignal?.addEventListener('abort', () => reject(requestSignal?.reason), { once: true });
      });
    }));

    const pending = new DeploymentStatusService().load();
    const rejection = expect(pending).rejects.toThrow('deployment status request timed out');
    await vi.advanceTimersByTimeAsync(5_000);

    await rejection;
    expect(requestSignal?.aborted).toBe(true);
  });

  it('propagates caller cancellation and does not leave the timeout armed', async () => {
    vi.useFakeTimers();
    const caller = new AbortController();
    let requestSignal: AbortSignal | undefined;
    vi.stubGlobal('fetch', vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
      requestSignal = init?.signal as AbortSignal;
      return new Promise<Response>((_resolve, reject) => {
        requestSignal?.addEventListener('abort', () => reject(requestSignal?.reason), { once: true });
      });
    }));

    const pending = new DeploymentStatusService().load(caller.signal);
    const rejection = expect(pending).rejects.toBeDefined();
    caller.abort();

    await rejection;
    expect(requestSignal?.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });
});
