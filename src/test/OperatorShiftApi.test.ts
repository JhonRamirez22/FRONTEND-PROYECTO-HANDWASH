import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OperatorApi } from '@/lib/OperatorApi';

const open = { active: true, protocolo: 'AGUA_Y_JABON', startedAtEpochMs: 1_000, endsAtEpochMs: 9_000 };

function respond(map: Record<string, () => Response>) {
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    const handler = map[url];
    if (!handler) throw new Error(`unexpected request ${url}`);
    return handler();
  }));
}
const json = (body: unknown, status = 200) => () => new Response(JSON.stringify(body), { status });
const csrf = { '/api/station/csrf': json({ token: 'a'.repeat(64) }) };

describe('operator shift client', () => {
  beforeEach(() => vi.stubGlobal('fetch', vi.fn()));
  afterEach(() => vi.unstubAllGlobals());

  it('reads the shift with the bearer token', async () => {
    respond({ '/api/operator?action=shift': json(open) });

    expect(await new OperatorApi().shiftStatus('tok')).toEqual(open);
    const init = vi.mocked(fetch).mock.calls[0]![1] as RequestInit;
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer tok');
  });

  it('starts a shift sending hours and protocol with the CSRF token', async () => {
    respond({ ...csrf, '/api/operator?action=shift': json(open) });

    await new OperatorApi().startShift('tok', 10, 'AGUA_Y_JABON');

    const init = vi.mocked(fetch).mock.calls.at(-1)![1] as RequestInit;
    expect(JSON.parse(String(init.body))).toEqual({ hours: 10, protocolo: 'AGUA_Y_JABON' });
    expect((init.headers as Record<string, string>)['X-CSRF-Token']).toBe('a'.repeat(64));
  });

  it('turns Java error codes into readable messages', async () => {
    respond({ ...csrf, '/api/operator?action=shift': json({ code: 'TURNO_YA_ACTIVO' }, 409) });
    await expect(new OperatorApi().startShift('tok', 8, 'AGUA_Y_JABON')).rejects.toThrow('Ya hay un turno activo');

    respond({ ...csrf, '/api/operator?action=shift': json({ code: 'TURNO_INVALIDO' }, 400) });
    await expect(new OperatorApi().startShift('tok', 8, 'AGUA_Y_JABON')).rejects.toThrow('entre 1 y 16 horas');
  });

  it('rejects an answer that is not a shift, and stopping an already ended shift is not an error', async () => {
    respond({ '/api/operator?action=shift': json({ nope: true }) });
    await expect(new OperatorApi().shiftStatus('tok')).rejects.toThrow();

    respond({ ...csrf, '/api/operator?action=shift-stop': json({ code: 'REQUEST_REJECTED' }, 404) });
    await expect(new OperatorApi().stopShift('tok')).resolves.toBeUndefined();

    respond({ ...csrf, '/api/operator?action=shift-stop': json({ code: 'BACKEND_UNAVAILABLE' }, 503) });
    await expect(new OperatorApi().stopShift('tok')).rejects.toThrow('Java no está disponible');
  });
});
