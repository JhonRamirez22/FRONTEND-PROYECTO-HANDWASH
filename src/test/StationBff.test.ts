import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  csrf, enroll, operatorClaim, operatorShiftStart, operatorShiftStatus, operatorShiftStop, operatorStartSession,
  startSession, status, webrtcTicket,
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

  it('recovers an active AGUA_Y_JABON session, the only protocol the operator can start', async () => {
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
        protocolo: 'AGUA_Y_JABON',
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
      sessionId: 'a23f6a29-281a-4eac-9d7c-716d761b9618', protocolo: 'AGUA_Y_JABON',
    });
    expect(JSON.stringify(payload)).not.toContain(sessionToken);
    expect(response.headers.get('set-cookie')).toContain('hw_station_session=');
    expect(response.headers.get('set-cookie')).toContain('HttpOnly; SameSite=Strict');
    expect(String(vi.mocked(fetch).mock.calls[1]?.[0])).toBe('https://java.example.com/api/v1/stations/resume');
  });

  describe('known session and its capability cookie', () => {
    const sessionId = 'a23f6a29-281a-4eac-9d7c-716d761b9618';
    const sessionToken = 'session_capability_' + 't'.repeat(40);
    const me = () => new Response(JSON.stringify({
      registered: true, stationId: 'd398e61f-56d9-47d3-9381-bdff87731931', stationName: 'Lavamanos A', activeSessionId: sessionId,
    }), { status: 200 });

    it('keeps the shortcut while the session cookie is still present', async () => {
      vi.mocked(fetch).mockResolvedValueOnce(me());
      const response = await status(request(`/api/station/status?knownSessionId=${sessionId}`, 'GET', undefined, {
        Cookie: `hw_station_credential=${stationCredential}; hw_station_session=${sessionToken}`,
      }));

      expect(await response.json()).toMatchObject({ unchangedActiveSession: true });
      expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1);
    });

    it('re-issues the cookie when the known session has lost it, so the camera link can be rebuilt', async () => {
      vi.mocked(fetch).mockResolvedValueOnce(me()).mockResolvedValueOnce(new Response(JSON.stringify({
        sessionId, protocolo: 'AGUA_Y_JABON', accessToken: sessionToken,
        accessTokenExpiresAt: new Date(Date.now() + 3_600_000).toISOString(),
      }), { status: 200 }));
      const response = await status(request(`/api/station/status?knownSessionId=${sessionId}`, 'GET', undefined, {
        Cookie: `hw_station_credential=${stationCredential}`,
      }));
      const payload = await response.json() as Record<string, unknown>;

      expect(payload.unchangedActiveSession).toBeFalsy();
      expect(payload.activeSession).toEqual({ sessionId, protocolo: 'AGUA_Y_JABON' });
      expect(response.headers.get('set-cookie')).toContain(`hw_station_session=${sessionToken}`);
      expect(JSON.stringify(payload)).not.toContain(sessionToken);
      expect(String(vi.mocked(fetch).mock.calls[1]?.[0])).toBe('https://java.example.com/api/v1/stations/resume');
    });
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

  describe('WebRTC ticket with ICE servers', () => {
    const sessionId = 'a23f6a29-281a-4eac-9d7c-716d761b9618';
    const sessionCookie = 'session_capability_' + 't'.repeat(40);
    const ticket = 'k'.repeat(43);

    async function ticketWith(upstream: Record<string, unknown>) {
      vi.mocked(fetch)
        .mockResolvedValueOnce(new Response(JSON.stringify({ registered: true, activeSessionId: sessionId }), { status: 200 }))
        .mockResolvedValueOnce(new Response(JSON.stringify({
          ticket, peerRole: 'BROWSER', expiresAt: new Date(Date.now() + 30_000).toISOString(), ...upstream,
        }), { status: 200 }));
      return webrtcTicket(request('/api/station/webrtc-ticket', 'POST', { sessionId }, {
        Origin: origin, 'X-CSRF-Token': csrfToken,
        Cookie: `hw_station_credential=${stationCredential}; hw_station_session=${sessionCookie}; hw_station_csrf=${csrfToken}`,
      }));
    }

    it('re-emits only allowlisted STUN/TURN fields from Java', async () => {
      const response = await ticketWith({ iceServers: [
        { urls: ['stun:stun.example.org:3478'], leaked: 'x' },
        { urls: ['turns:turn.example.org:443?transport=tcp'], username: '1792603600:s:BROWSER', credential: 'cred=', secret: 'no' },
      ] });
      const payload = await response.json() as Record<string, unknown>;

      expect(response.status).toBe(200);
      expect(payload.ticket).toBe(ticket);
      expect(payload.iceServers).toEqual([
        { urls: ['stun:stun.example.org:3478'] },
        { urls: ['turns:turn.example.org:443?transport=tcp'], username: '1792603600:s:BROWSER', credential: 'cred=' },
      ]);
      expect(JSON.stringify(payload)).not.toContain('leaked');
      expect(JSON.stringify(payload)).not.toContain('"secret"');
    });

    it('treats a Java build without iceServers as LAN only', async () => {
      const response = await ticketWith({});
      expect(response.status).toBe(200);
      expect((await response.json() as Record<string, unknown>).iceServers).toEqual([]);
    });

    it.each([
      ['a non-ICE scheme', [{ urls: ['http://evil.example'] }]],
      ['credentials inside the URL', [{ urls: ['turn:user:pass@turn.example.org'], username: 'u', credential: 'c' }]],
      ['TURN without credentials', [{ urls: ['turn:turn.example.org:3478'] }]],
      ['STUN with credentials', [{ urls: ['stun:stun.example.org'], username: 'u', credential: 'c' }]],
      ['too many servers', Array.from({ length: 5 }, () => ({ urls: ['stun:stun.example.org'] }))],
      ['a non-array value', { urls: ['stun:stun.example.org'] }],
    ])('rejects %s instead of forwarding it to the browser', async (_name, iceServers) => {
      const response = await ticketWith({ iceServers });
      expect(response.status).toBe(502);
      expect(await response.json()).toEqual({ code: 'WEBRTC_TICKET_INVALID' });
    });
  });

  describe('operator shift (unattended mode)', () => {
    const bearer = 'Bearer aaaa.bbbb.cccc';
    // The BFF rate limiter is keyed by client address: give every request its own.
    let address = 0;
    const fresh = (headers: Record<string, string>) => ({ ...headers, 'X-Forwarded-For': `198.51.100.${++address}` });
    const mutation = () => fresh({ Origin: origin, Authorization: bearer, 'X-CSRF-Token': csrfToken, Cookie: `hw_station_csrf=${csrfToken}` });
    const open = { active: true, protocolo: 'AGUA_Y_JABON', startedAtEpochMs: 1_000, endsAtEpochMs: 9_000 };

    it('reports the shift with only the fields the kiosk needs', async () => {
      vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({ ...open, secret: 'x' }), { status: 200 }));
      const response = await operatorShiftStatus(request('/api/operator?action=shift', 'GET', undefined, { Authorization: bearer }));

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual(open);
      expect(String(vi.mocked(fetch).mock.calls[0]?.[0])).toBe('https://java.example.com/api/v1/operator/shift');
    });

    it('requires a bearer token and rejects malformed Java answers', async () => {
      expect((await operatorShiftStatus(request('/api/operator?action=shift', 'GET'))).status).toBe(401);
      expect(vi.mocked(fetch)).not.toHaveBeenCalled();
      for (const bad of [{ active: 'yes' }, { active: true, protocolo: 'OTRO', startedAtEpochMs: 1, endsAtEpochMs: 2 },
        { active: true, protocolo: 'AGUA_Y_JABON', startedAtEpochMs: null, endsAtEpochMs: 2 }]) {
        vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify(bad), { status: 200 }));
        expect((await operatorShiftStatus(request('/api/operator?action=shift', 'GET', undefined, { Authorization: bearer }))).status).toBe(502);
      }
    });

    it('starts a shift with validated hours and forwards the Java conflict code', async () => {
      vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify(open), { status: 200 }));
      const ok = await operatorShiftStart(request('/api/operator?action=shift', 'POST', { hours: 10, protocolo: 'AGUA_Y_JABON' }, mutation()));
      expect(ok.status).toBe(200);
      expect(JSON.parse(String(vi.mocked(fetch).mock.calls[0]?.[1]?.body))).toEqual({ hours: 10, protocolo: 'AGUA_Y_JABON' });

      vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({ error: 'TURNO_YA_ACTIVO' }), { status: 409 }));
      const conflict = await operatorShiftStart(request('/api/operator?action=shift', 'POST', { hours: 8, protocolo: 'AGUA_Y_JABON' }, mutation()));
      expect(conflict.status).toBe(409);
      expect(await conflict.json()).toEqual({ code: 'TURNO_YA_ACTIVO' });
    });

    it.each([0, 17, 1.5, '8', null, undefined])('rejects %s hours without contacting Java', async (hours) => {
      const response = await operatorShiftStart(request('/api/operator?action=shift', 'POST', { hours, protocolo: 'AGUA_Y_JABON' }, mutation()));
      expect(response.status).toBe(400);
      expect(vi.mocked(fetch)).not.toHaveBeenCalled();
    });

    it('protects start and stop with origin and CSRF', async () => {
      const noCsrf = () => fresh({ Origin: origin, Authorization: bearer });
      expect((await operatorShiftStart(request('/api/operator?action=shift', 'POST', { hours: 8, protocolo: 'AGUA_Y_JABON' }, noCsrf()))).status).toBe(403);
      expect((await operatorShiftStop(request('/api/operator?action=shift-stop', 'POST', {}, noCsrf()))).status).toBe(403);
      expect(vi.mocked(fetch)).not.toHaveBeenCalled();
    });

    it('stops the shift through Java and clears the session capability cookie', async () => {
      vi.mocked(fetch).mockResolvedValueOnce(new Response(null, { status: 204 }));
      const response = await operatorShiftStop(request('/api/operator?action=shift-stop', 'POST', {}, mutation()));

      expect(response.status).toBe(200);
      expect(response.headers.get('set-cookie')).toContain('hw_station_session=;');
      expect(vi.mocked(fetch).mock.calls[0]?.[1]?.method).toBe('DELETE');
    });
  });
});
