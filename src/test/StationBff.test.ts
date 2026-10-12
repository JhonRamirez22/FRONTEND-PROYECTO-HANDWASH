import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { csrf, enroll, startSession, status } from '../server/stationBff';

const origin = 'https://frontend-proyecto-handwash.vercel.app';
const stationCredential = 'station_secret_' + 's'.repeat(32);
const csrfToken = 'a'.repeat(64);

function request(path: string, method: string, body?: unknown,
  headers: Record<string, string> = {}): Request {
  return new Request(`https://frontend-proyecto-handwash.vercel.app${path}`, {
    method,
    headers: {
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

describe('station Vercel BFF', () => {
  beforeEach(() => {
    vi.stubEnv('HANDWASH_PUBLIC_ORIGIN', origin);
    vi.stubEnv('HANDWASH_BACKEND_ORIGIN', 'https://java.example.com');
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('fails closed when origin is absent or different during CSRF bootstrap', async () => {
    const missing = await csrf(request('/api/station/csrf', 'POST'));
    expect(missing.status).toBe(403);
    const foreign = await csrf(request('/api/station/csrf', 'POST', undefined, { Origin: 'https://evil.example' }));
    expect(foreign.status).toBe(403);
  });

  it('issues a random secure double-submit CSRF cookie without caching it', async () => {
    const response = await csrf(request('/api/station/csrf', 'POST', undefined, { Origin: origin }));
    const payload = await response.json() as { token: string };
    expect(response.status).toBe(200);
    expect(payload.token).toMatch(/^[a-f0-9]{64}$/);
    expect(response.headers.get('set-cookie')).toContain('Secure; SameSite=Strict');
    expect(response.headers.get('cache-control')).toContain('no-store');
  });

  it('does not contact Java or disclose station state without the HttpOnly credential', async () => {
    const fetchMock = vi.mocked(fetch);
    const response = await status(request('/api/station/status', 'GET'));
    expect(await response.json()).toMatchObject({ registered: false, stationId: null });
    expect(response.status).toBe(200);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('recovers an active Java session into an HttpOnly cookie without returning its capability', async () => {
    const sessionToken = 'session_capability_' + 't'.repeat(40);
    vi.mocked(fetch)
      .mockResolvedValueOnce(new Response(JSON.stringify({
        registered: true,
        stationId: 'd398e61f-56d9-47d3-9381-bdff87731931',
        stationName: 'Lavamanos A',
        activeSessionId: 'a23f6a29-281a-4eac-9d7c-716d761b9618',
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        sessionId: 'a23f6a29-281a-4eac-9d7c-716d761b9618',
        protocolo: 'DOMESTICO',
        accessToken: sessionToken,
        accessTokenExpiresAt: new Date(Date.now() + 60_000).toISOString(),
      }), { status: 200 }));

    const response = await status(request('/api/station/status', 'GET', undefined, {
      Cookie: `hw_station_credential=${stationCredential}`,
    }));
    const payload = await response.json() as Record<string, unknown>;
    expect(response.status).toBe(200);
    expect(payload).toMatchObject({ registered: true, stationName: 'Lavamanos A' });
    expect(payload.activeSession).toEqual({
      sessionId: 'a23f6a29-281a-4eac-9d7c-716d761b9618', protocolo: 'DOMESTICO',
    });
    expect(JSON.stringify(payload)).not.toContain(sessionToken);
    expect(response.headers.get('set-cookie')).toContain('hw_station_session=');
    expect(response.headers.get('set-cookie')).toContain('HttpOnly; SameSite=Strict');
    expect(String(vi.mocked(fetch).mock.calls[1]?.[0])).toBe('https://java.example.com/api/v1/stations/resume');
  });

  it('clears both cookies when Java reports that the station credential was revoked', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({ error: 'PUESTO_NO_AUTORIZADO' }), { status: 401 }));
    const response = await status(request('/api/station/status', 'GET', undefined, {
      Cookie: `hw_station_credential=${stationCredential}; hw_station_session=${'s'.repeat(50)}`,
    }));
    expect(response.status).toBe(200);
    expect(response.headers.get('set-cookie')).toContain('hw_station_credential=;');
    expect(response.headers.get('set-cookie')).toContain('hw_station_session=;');
  });

  it('rejects enrollment without matching origin, CSRF cookie and header', async () => {
    const response = await enroll(request('/api/station/enroll', 'POST', { code: 'x'.repeat(40) }, {
      Origin: origin,
      Cookie: `hw_station_csrf=${csrfToken}`,
    }));
    expect(response.status).toBe(403);
    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
  });

  it('keeps the station credential in an HttpOnly cookie, never in JSON', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({
      stationId: 'd398e61f-56d9-47d3-9381-bdff87731931',
      stationName: 'Lavamanos A', credential: stationCredential, createdAtEpochMs: Date.now(),
    }), { status: 200 }));
    const response = await enroll(request('/api/station/enroll', 'POST', { code: 'z'.repeat(40) }, {
      Origin: origin,
      'X-CSRF-Token': csrfToken,
      Cookie: `hw_station_csrf=${csrfToken}`,
    }));
    const payload = await response.json() as Record<string, unknown>;
    expect(response.status).toBe(200);
    expect(payload).toEqual({ stationId: 'd398e61f-56d9-47d3-9381-bdff87731931', stationName: 'Lavamanos A' });
    expect(JSON.stringify(payload)).not.toContain(stationCredential);
    expect(response.headers.get('set-cookie')).toContain('HttpOnly; SameSite=Strict');
    expect(String(vi.mocked(fetch).mock.calls[0]?.[0])).toBe('https://java.example.com/api/v1/stations/enroll');
  });

  it('forwards only the fixed station start contract and hides the owner capability', async () => {
    const token = 'owner_capability_' + 'x'.repeat(40);
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({
      sessionId: 'd398e61f-56d9-47d3-9381-bdff87731931',
      protocolo: 'DOMESTICO', pairingCode: 'PAIRING-CODE', accessToken: token,
      accessTokenExpiresAt: new Date(Date.now() + 60_000).toISOString(), mensaje: 'Sesión creada',
    }), { status: 200 }));
    const requestId = 'a23f6a29-281a-4eac-9d7c-716d761b9618';
    const response = await startSession(request('/api/station/session', 'POST', {
      protocolo: 'DOMESTICO', requestId,
    }, {
      Origin: origin,
      Cookie: `hw_station_credential=${stationCredential}; hw_station_csrf=${csrfToken}`,
      'X-CSRF-Token': csrfToken,
    }));
    const payload = await response.json() as Record<string, unknown>;
    expect(response.status).toBe(200);
    expect(payload.sessionId).toBe('d398e61f-56d9-47d3-9381-bdff87731931');
    expect(payload).not.toHaveProperty('accessToken');
    expect(payload).not.toHaveProperty('pairingCode');
    expect(response.headers.get('set-cookie')).toContain('HttpOnly');
    expect(String(vi.mocked(fetch).mock.calls[0]?.[0])).toBe('https://java.example.com/api/v1/stations/session');
    const upstream = vi.mocked(fetch).mock.calls[0]?.[1] as RequestInit;
    expect(upstream.headers).toMatchObject({
      'X-Station-Credential': stationCredential,
      'X-Station-Request-Id': requestId,
    });
    expect(upstream.body).toBe(JSON.stringify({ protocolo: 'DOMESTICO', producerProtocolVersion: '2' }));
  });

  it('does not create a Java session anonymously', async () => {
    const response = await startSession(request('/api/station/session', 'POST', {
      protocolo: 'DOMESTICO', requestId: 'a23f6a29-281a-4eac-9d7c-716d761b9618',
    }, {
      Origin: origin,
      Cookie: `hw_station_csrf=${csrfToken}`,
      'X-CSRF-Token': csrfToken,
    }));

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ code: 'STATION_NOT_REGISTERED' });
    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
  });
});
