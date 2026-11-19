import { afterEach, describe, expect, it, vi } from 'vitest';
import { CameraPairingApi, cameraCodeFromHash } from '../lib/CameraPairingApi';

const CODE = 'A'.repeat(43);
const TOKEN = 'T'.repeat(43);
const api = new CameraPairingApi(() => 'https://api.example');

function stub(handler: (url: string, init?: RequestInit) => Response) {
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => handler(url, init)));
}
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

describe('cameraCodeFromHash', () => {
  it('reads the one-time code of the QR and nothing else', () => {
    expect(cameraCodeFromHash(`#/camera?c=${CODE}`)).toBe(CODE);
    expect(cameraCodeFromHash('#/camera')).toBeNull();
    expect(cameraCodeFromHash(`#/operator?c=${CODE}`)).toBeNull();
    expect(cameraCodeFromHash('#/camera?c=short')).toBeNull();
  });
});

describe('CameraPairingApi', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('trades the code for a camera token without sending any credential', async () => {
    stub((url, init) => {
      expect(url).toBe('https://api.example/api/v1/camera/redeem');
      expect(JSON.parse(String(init?.body))).toEqual({ code: CODE });
      expect(init?.credentials).toBe('omit');
      return json({ cameraToken: TOKEN, stationName: 'LAVAMANOS TEST', expiresInSeconds: 43200 });
    });
    await expect(api.redeem(CODE)).resolves.toEqual({ token: TOKEN, stationName: 'LAVAMANOS TEST' });
  });

  it('says the QR expired when the code is no longer valid', async () => {
    stub(() => json({ error: 'CODIGO_DE_CAMARA_NO_VALIDO' }, 401));
    await expect(api.redeem(CODE)).rejects.toThrow(/venció|usó/);
  });

  it('returns a ready ticket for the active session', async () => {
    stub((url, init) => {
      expect(url).toBe('https://api.example/api/v1/camera/ticket');
      expect((init?.headers as Record<string, string>)['X-Camera-Token']).toBe(TOKEN);
      return json({ sessionId: 's1', ticket: { ticket: 't'.repeat(43), peerRole: 'BROWSER', expiresAt: 'x', iceServers: [{ urls: ['stun:s:1'] }] } });
    });
    const result = await api.ticket(TOKEN);
    expect(result).toMatchObject({ kind: 'ready', sessionId: 's1' });
    if (result.kind === 'ready') expect(result.access.iceServers).toEqual([{ urls: ['stun:s:1'] }]);
  });

  it('maps 204, 409 and 401 to waiting, replaced and expired', async () => {
    stub(() => new Response(null, { status: 204 }));
    await expect(api.ticket(TOKEN)).resolves.toEqual({ kind: 'waiting' });
    stub(() => json({ error: 'CAMARA_REEMPLAZADA' }, 409));
    await expect(api.ticket(TOKEN)).resolves.toEqual({ kind: 'replaced' });
    stub(() => json({ error: 'CAMARA_NO_AUTORIZADA' }, 401));
    await expect(api.ticket(TOKEN)).resolves.toEqual({ kind: 'expired' });
  });

  it('polls the session cheaply: active, waiting, replaced or expired', async () => {
    stub((url) => { expect(url).toBe('https://api.example/api/v1/camera/state'); return json({ sessionId: 's9' }); });
    await expect(api.state(TOKEN)).resolves.toEqual({ kind: 'active', sessionId: 's9' });
    stub(() => new Response(null, { status: 204 }));
    await expect(api.state(TOKEN)).resolves.toEqual({ kind: 'waiting' });
    stub(() => json({}, 409));
    await expect(api.state(TOKEN)).resolves.toEqual({ kind: 'replaced' });
    stub(() => json({}, 401));
    await expect(api.state(TOKEN)).resolves.toEqual({ kind: 'expired' });
  });

  it('treats a network failure as waiting so the phone keeps trying', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('offline'); }));
    await expect(api.ticket(TOKEN)).resolves.toEqual({ kind: 'waiting' });
  });
});
