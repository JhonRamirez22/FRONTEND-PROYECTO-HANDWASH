import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { KEY_SESSION, OperatorKeySession, defaultLinkMac } from '@/lib/OperatorKeySession';
import { OperatorApi } from '@/lib/OperatorApi';

const KEY = 'hwk_0123456789abcdef_' + 'A'.repeat(43);
const csrf = 'a'.repeat(64);

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

describe('OperatorKeySession', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    vi.stubGlobal('fetch', vi.fn());
  });
  afterEach(() => vi.unstubAllGlobals());

  it('logs in with the key, keeps only a flag and never stores the key', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(jsonResponse({ token: csrf }))
      .mockResolvedValueOnce(jsonResponse({ stationId: 's1', stationName: 'Lavamanos A', label: 'María',
        expiresAtEpochMs: Date.now() + 1000, stationLinked: true }));
    const session = new OperatorKeySession();

    const profile = await session.login(`  ${KEY}  `, true);

    expect(profile).toMatchObject({ stationName: 'Lavamanos A', label: 'María', stationLinked: true });
    expect(session.isActive()).toBe(true);
    const [url, init] = vi.mocked(fetch).mock.calls[1]!;
    expect(String(url)).toBe('/api/operator?action=key-login');
    expect(JSON.parse(String(init?.body))).toEqual({ key: KEY, linkStation: true, forceLink: false });
    expect((init?.headers as Record<string, string>)['X-CSRF-Token']).toBe(csrf);
    expect(JSON.stringify({ ...window.sessionStorage })).not.toContain(KEY);
  });

  it('explains a rejected, locked or malformed key without leaking details', async () => {
    const session = new OperatorKeySession();
    await expect(session.login('hwk_short', false)).rejects.toThrow('formato');
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ token: csrf }));
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({ token: csrf }))
      .mockResolvedValueOnce(jsonResponse({ code: 'KEY_NO_VALIDA' }, 401));
    await expect(session.login(KEY, false)).rejects.toThrow('no es válida o fue revocada');
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({ token: csrf }))
      .mockResolvedValueOnce(jsonResponse({ code: 'LIMITE_INTENTOS_KEY' }, 429));
    await expect(session.login(KEY, false)).rejects.toThrow('Demasiados intentos');
    expect(session.isActive()).toBe(false);
  });

  it('logout clears the flag and the cookie', async () => {
    window.sessionStorage.setItem('handwash.operator.keySession', '1');
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({ token: csrf })).mockResolvedValueOnce(new Response(null, { status: 204 }));
    const session = new OperatorKeySession();

    await session.logout();

    expect(session.isActive()).toBe(false);
    expect(String(vi.mocked(fetch).mock.calls[1]![0])).toBe('/api/operator?action=key-logout');
  });

  it('OperatorApi sends no bearer header for a key session, so the HttpOnly cookie is the credential', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({}, 404));
    await new OperatorApi().status(KEY_SESSION);
    const headers = vi.mocked(fetch).mock.calls[0]![1]!.headers as Record<string, string>;
    expect(headers.Authorization).toBeUndefined();

    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({}, 404));
    await new OperatorApi().status('real.cognito.token');
    expect((vi.mocked(fetch).mock.calls[1]![1]!.headers as Record<string, string>).Authorization).toBe('Bearer real.cognito.token');
  });

  it('tells the console when another Mac already holds the station, and can replace it on request', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(jsonResponse({ token: csrf }))
      .mockResolvedValueOnce(jsonResponse({ stationId: 's1', stationName: 'Lavamanos A', label: 'María',
        expiresAtEpochMs: Date.now() + 1000, stationLinked: false, macAlreadyLinked: true }))
      .mockResolvedValueOnce(jsonResponse({ token: csrf }))
      .mockResolvedValueOnce(jsonResponse({ stationId: 's1', stationName: 'Lavamanos A', label: 'María',
        expiresAtEpochMs: Date.now() + 1000, stationLinked: true }));
    const session = new OperatorKeySession();

    expect(await session.login(KEY, true)).toMatchObject({ stationLinked: false, macAlreadyLinked: true });
    expect(await session.login(KEY, true, true)).toMatchObject({ stationLinked: true, macAlreadyLinked: false });
    expect(JSON.parse(String(vi.mocked(fetch).mock.calls[3]![1]!.body))).toMatchObject({ forceLink: true });
  });

  it('only ticks "this is the Mac" by default when the browser has no station yet', () => {
    expect(defaultLinkMac(false)).toBe(true);
    expect(defaultLinkMac(true)).toBe(false);
  });
});
