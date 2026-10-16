import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  csrf, enroll, operatorClaim, operatorStartSession, startSession, status,
} from '../server/stationBff';

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
    expect(response.headers.get('set-cookie')).toContain('Path=/api;');
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

  it('blocks starting a session from the public station BFF', async () => {
    const response = await startSession(request('/api/station/session', 'POST', {
      protocolo: 'DOMESTICO', requestId: 'a23f6a29-281a-4eac-9d7c-716d761b9618',
    }, { Origin: origin, Cookie: `hw_station_credential=${stationCredential}; hw_station_csrf=${csrfToken}`,
      'X-CSRF-Token': csrfToken }));
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ code: 'OPERATOR_AUTH_REQUIRED' });
    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
  });

  it('does not create a Java session anonymously', async () => {
    const response = await startSession(request('/api/station/session', 'POST', {
      protocolo: 'DOMESTICO', requestId: 'a23f6a29-281a-4eac-9d7c-716d761b9618',
    }, {
      Origin: origin,
      Cookie: `hw_station_csrf=${csrfToken}`,
      'X-CSRF-Token': csrfToken,
    }));

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ code: 'OPERATOR_AUTH_REQUIRED' });
    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
  });

  it('requires CSRF and bearer auth before an operator can claim a code', async () => {
    const missingCsrf = await operatorClaim(request('/api/operator/claim', 'POST', { code: 'x'.repeat(43) }, {
      Origin: origin, Authorization: 'Bearer header.payload.signature',
    }));
    expect(missingCsrf.status).toBe(403);
    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
  });

  it('claims operator access through Java and returns only the allowlisted grant fields', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({
      subject: 'cognito-subject', email: 'operator@example.org',
      stationId: 'd398e61f-56d9-47d3-9381-bdff87731931', stationName: 'Lavamanos A',
      grantedBy: 'admin-subject', grantedAtEpochMs: Date.now(), revokedAtEpochMs: null,
      credential: 'must-not-leak',
    }), { status: 200 }));
    const response = await operatorClaim(request('/api/operator/claim', 'POST', { code: 'x'.repeat(43) }, {
      Origin: origin, 'X-Forwarded-For': '198.51.100.21',
      Cookie: `hw_station_csrf=${csrfToken}`, 'X-CSRF-Token': csrfToken,
      Authorization: 'Bearer header.payload.signature', 'X-Cognito-Id-Token': 'i'.repeat(120),
    }));
    const payload = await response.json() as Record<string, unknown>;

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({
      subject: 'cognito-subject', email: 'operator@example.org',
      stationId: 'd398e61f-56d9-47d3-9381-bdff87731931', stationName: 'Lavamanos A',
      grantedAtEpochMs: expect.any(Number), revokedAtEpochMs: null,
    });
    expect(payload).not.toHaveProperty('credential');
    expect(JSON.stringify(payload)).not.toContain('must-not-leak');
    expect(vi.mocked(fetch).mock.calls[0]?.[1]?.headers).toMatchObject({
      Authorization: 'Bearer header.payload.signature',
      'X-Cognito-Id-Token': 'i'.repeat(120),
    });
  });

  it('starts operator sessions while keeping the Java capability in an HttpOnly cookie', async () => {
    const sessionToken = 'session_capability_' + 't'.repeat(40);
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({
      sessionId: 'a23f6a29-281a-4eac-9d7c-716d761b9618', protocolo: 'DOMESTICO',
      accessToken: sessionToken, accessTokenExpiresAt: new Date(Date.now() + 60_000).toISOString(),
      internalCredential: 'must-not-leak',
    }), { status: 201 }));
    const response = await operatorStartSession(request('/api/operator/session', 'POST', {
      protocolo: 'DOMESTICO', requestId: 'c3a0b390-3c06-4db8-83f6-9de74dfe44a8',
    }, {
      Origin: origin, 'X-Forwarded-For': '198.51.100.22',
      Cookie: `hw_station_csrf=${csrfToken}`, 'X-CSRF-Token': csrfToken,
      Authorization: 'Bearer header.payload.signature',
    }));
    const payload = await response.json() as Record<string, unknown>;

    expect(response.status).toBe(200);
    expect(payload).toEqual({
      sessionId: 'a23f6a29-281a-4eac-9d7c-716d761b9618', protocolo: 'DOMESTICO',
    });
    expect(JSON.stringify(payload)).not.toContain(sessionToken);
    expect(JSON.stringify(payload)).not.toContain('must-not-leak');
    expect(response.headers.get('set-cookie')).toContain('hw_station_session=');
    expect(response.headers.get('set-cookie')).toContain('HttpOnly; SameSite=Strict');
  });
});
