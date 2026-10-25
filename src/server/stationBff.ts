import { randomBytes, timingSafeEqual } from 'node:crypto';

const STATION_COOKIE = 'hw_station_credential';
const SESSION_COOKIE = 'hw_station_session';
const OPERATOR_KEY_COOKIE = 'hw_operator_key_session';
const OPERATOR_COOKIE_PATH = '/api/operator';
const API_KEY_PATTERN = /^hwk_[0-9a-f]{16}_[A-Za-z0-9_-]{43}$/;
const KEY_SESSION_PATTERN = /^hws_[A-Za-z0-9_-]{43}$/;
const CSRF_COOKIE = 'hw_station_csrf';
const COOKIE_PATH = '/api/station';
const CSRF_COOKIE_PATH = '/api';
const MAX_BODY_BYTES = 4_096;
const MIN_EVIDENCE_BYTES = 1_024;
const MAX_EVIDENCE_BYTES = 300 * 1024;
const UPSTREAM_TIMEOUT_MS = 7_000;
const RATE_WINDOW_MS = 60_000;
const rateBuckets = new Map<string, { windowStart: number; count: number }>();

type JsonObject = Record<string, unknown>;

export async function csrf(request: Request): Promise<Response> {
  const originError = requireOrigin(request);
  if (originError) return originError;
  const token = randomBytes(32).toString('hex');
  return json({ token }, 200, csrfCookie(token));
}

export async function status(request: Request): Promise<Response> {
  if (isCrossSite(request)) return error(403, 'ORIGIN_INVALID');
  const credential = cookieValue(request, STATION_COOKIE);
  if (!credential) return json(unregistered(), 200, clearCookie(SESSION_COOKIE));

  let upstream: UpstreamResponse;
  try {
    upstream = await callBackend('/api/v1/stations/me', 'GET', undefined, credential);
  } catch {
    return error(503, 'BACKEND_UNAVAILABLE');
  }
  if (upstream.status === 401) {
    return json(unregistered(), 200, [clearCookie(STATION_COOKIE), clearCookie(SESSION_COOKIE)]);
  }
  if (!upstream.ok || !isObject(upstream.body) || upstream.body.registered !== true
    || typeof upstream.body.stationId !== 'string'
    || typeof upstream.body.stationName !== 'string') {
    return error(503, 'STATION_STATUS_UNAVAILABLE');
  }

  let activeSession: SafeSession | null = null;
  let sessionCookie = clearCookie(SESSION_COOKIE);
  let resumeError = false;
  if (typeof upstream.body.activeSessionId === 'string') {
    const knownSessionId = new URL(request.url).searchParams.get('knownSessionId');
    // The session capability cookie expires with its token; once it is gone the known session
    // must be resumed again, or a long shift would lose its camera link after the first hour.
    if (isUuid(knownSessionId) && knownSessionId === upstream.body.activeSessionId
      && cookieValue(request, SESSION_COOKIE)) {
      return json({ registered: true, stationId: upstream.body.stationId,
        stationName: upstream.body.stationName, activeSession: null,
        unchangedActiveSession: true, resumeError: false,
        photoEvidence: upstream.body.photoEvidence === true });
    }
    try {
      const resume = await callBackend('/api/v1/stations/resume', 'POST', undefined, credential);
      if (resume.status === 200 && isObject(resume.body)) {
        const cookie = sessionCookieFor(resume.body);
        if (!cookie) return error(502, 'SESSION_RESPONSE_INVALID');
        sessionCookie = cookie;
        activeSession = safeSession(resume.body);
        if (!activeSession) return error(502, 'SESSION_RESPONSE_INVALID');
      } else if (resume.status !== 204) {
        resumeError = true;
      }
    } catch {
      resumeError = true;
    }
  }
  return json({
    registered: true,
    stationId: upstream.body.stationId,
    stationName: upstream.body.stationName,
    activeSession,
    unchangedActiveSession: false,
    resumeError,
    photoEvidence: upstream.body.photoEvidence === true,
  }, 200, sessionCookie);
}

export async function enroll(request: Request): Promise<Response> {
  const securityError = requireMutationSecurity(request);
  if (securityError) return securityError;
  if (!allowRequest(request, 8)) return error(429, 'RATE_LIMITED');
  const body = await readJson(request);
  const activation = body && typeof body.activation === 'string' ? body.activation : null;
  const secret = activation ?? (body && typeof body.code === 'string' ? body.code : null);
  if (!secret || secret.length < 30 || secret.length > 100
    || (activation !== null && !/^[A-Za-z0-9_-]+$/.test(activation))) {
    return error(400, 'ENROLLMENT_CODE_INVALID');
  }
  try {
    // "Crear puesto" hands the Mac a one-time activation token; the older enrollment code still works.
    const result = activation !== null
      ? await callBackend('/api/v1/stations/activate', 'POST', { token: activation })
      : await callBackend('/api/v1/stations/enroll', 'POST', { code: secret });
    if (!result.ok) return upstreamError(result.status, result.body);
    if (!isObject(result.body) || !isCredential(result.body.credential)
      || !isUuid(result.body.stationId) || typeof result.body.stationName !== 'string') {
      return error(502, 'ENROLLMENT_RESPONSE_INVALID');
    }
    return json({ stationId: result.body.stationId, stationName: result.body.stationName }, 200,
      persistentCookie(STATION_COOKIE, result.body.credential));
  } catch {
    return error(503, 'BACKEND_UNAVAILABLE');
  }
}

export async function startSession(): Promise<Response> {
  return error(403, 'OPERATOR_AUTH_REQUIRED');
}

export async function stopSession(): Promise<Response> {
  return error(403, 'OPERATOR_AUTH_REQUIRED');
}

export async function operatorStatus(request: Request): Promise<Response> {
  if (isCrossSite(request)) return error(403, 'ORIGIN_INVALID');
  const authorization = bearerToken(request);
  if (!authorization) return error(401, 'AUTH_REQUIRED');
  try {
    const result = await callBackend('/api/v1/operator/me', 'GET', undefined, undefined,
      { Authorization: authorization });
    if (!result.ok) return upstreamError(result.status, result.body);
    if (!isObject(result.body)) return error(502, 'OPERATOR_RESPONSE_INVALID');
    const grant = safeOperatorGrant(result.body.grant);
    if (!grant) return error(502, 'OPERATOR_RESPONSE_INVALID');
    let activeSession: SafeSession | null = null;
    let cookie: string | undefined = clearCookie(SESSION_COOKIE);
    let resumeError = false;
    if (isObject(result.body.activeSession) && isUuid(result.body.activeSession.sessionId)) {
      const resumed = await callBackend('/api/v1/operator/resume', 'POST', undefined, undefined,
        { Authorization: authorization });
      if (resumed.ok && isObject(resumed.body)) {
        activeSession = safeSession(resumed.body);
        cookie = sessionCookieFor(resumed.body) ?? undefined;
        if (!activeSession || !cookie) return error(502, 'SESSION_RESPONSE_INVALID');
      } else resumeError = true;
    }
    return json({ grant, activeSession, resumeError }, 200, cookie);
  } catch {
    return error(503, 'BACKEND_UNAVAILABLE');
  }
}

/** Console login with an ADMIN-issued API key. The key is traded for HttpOnly cookies; JS never sees a token. */
export async function operatorKeyLogin(request: Request): Promise<Response> {
  const securityError = requireMutationSecurity(request);
  if (securityError) return securityError;
  if (!allowRequest(request, 10)) return error(429, 'RATE_LIMITED');
  const body = await readJson(request);
  if (!body || typeof body.key !== 'string' || !API_KEY_PATTERN.test(body.key.trim())) {
    return error(400, 'KEY_FORMAT_INVALID');
  }
  const linkStation = body.linkStation === true;
  try {
    const result = await callBackend('/api/v1/operator/key-login', 'POST',
      { key: body.key.trim(), linkStation }, undefined, { 'X-Forwarded-For': clientAddress(request) });
    if (!result.ok) return upstreamError(result.status, result.body);
    if (!isObject(result.body) || typeof result.body.sessionToken !== 'string'
      || !KEY_SESSION_PATTERN.test(result.body.sessionToken) || !isUuid(result.body.stationId)
      || typeof result.body.stationName !== 'string' || typeof result.body.label !== 'string'
      || typeof result.body.expiresAtEpochMs !== 'number') {
      return error(502, 'KEY_LOGIN_RESPONSE_INVALID');
    }
    const maxAge = Math.max(1, Math.min(43_200, Math.floor((result.body.expiresAtEpochMs - Date.now()) / 1000)));
    const cookies = [`${OPERATOR_KEY_COOKIE}=${result.body.sessionToken}; Path=${OPERATOR_COOKIE_PATH}; `
      + `Max-Age=${maxAge}; Secure; HttpOnly; SameSite=Strict`];
    if (linkStation && isCredential(result.body.stationCredential)) {
      cookies.push(persistentCookie(STATION_COOKIE, result.body.stationCredential));
    }
    return json({ stationId: result.body.stationId, stationName: result.body.stationName,
      label: result.body.label, expiresAtEpochMs: result.body.expiresAtEpochMs,
      stationLinked: linkStation && isCredential(result.body.stationCredential) }, 200, cookies);
  } catch {
    return error(503, 'BACKEND_UNAVAILABLE');
  }
}

export async function operatorKeyLogout(request: Request): Promise<Response> {
  const securityError = requireMutationSecurity(request);
  if (securityError) return securityError;
  const headers = new Headers({ 'Cache-Control': 'no-store, max-age=0', 'X-Content-Type-Options': 'nosniff' });
  headers.append('Set-Cookie', `${OPERATOR_KEY_COOKIE}=; Path=${OPERATOR_COOKIE_PATH}; Max-Age=0; Secure; HttpOnly; SameSite=Strict`);
  return new Response(null, { status: 204, headers });
}

export async function operatorClaim(request: Request): Promise<Response> {
  const securityError = requireMutationSecurity(request);
  if (securityError) return securityError;
  if (!allowRequest(request, 8)) return error(429, 'RATE_LIMITED');
  const authorization = bearerToken(request);
  const idToken = request.headers.get('x-cognito-id-token') ?? '';
  if (!authorization) return error(401, 'AUTH_REQUIRED');
  if (idToken.length < 100 || idToken.length > 8_192 || !/^[A-Za-z0-9_.-]+$/.test(idToken)) {
    return error(400, 'ID_TOKEN_INVALID');
  }
  const body = await readJson(request);
  if (!body || typeof body.code !== 'string' || body.code.length < 40 || body.code.length > 64) {
    return error(400, 'OPERATOR_CODE_INVALID');
  }
  try {
    const result = await callBackend('/api/v1/operator/claim', 'POST', { code: body.code }, undefined,
      { Authorization: authorization, 'X-Cognito-Id-Token': idToken });
    if (!result.ok) return upstreamError(result.status, result.body);
    const grant = isObject(result.body) ? safeOperatorGrant(result.body) : null;
    if (!grant) return error(502, 'OPERATOR_RESPONSE_INVALID');
    return json(grant);
  } catch {
    return error(503, 'BACKEND_UNAVAILABLE');
  }
}

export async function operatorStartSession(request: Request): Promise<Response> {
  const securityError = requireMutationSecurity(request);
  if (securityError) return securityError;
  if (!allowRequest(request, 12)) return error(429, 'RATE_LIMITED');
  const authorization = bearerToken(request);
  if (!authorization) return error(401, 'AUTH_REQUIRED');
  const body = await readJson(request);
  if (!body || !isProtocol(body.protocolo) || !isUuid(body.requestId)) {
    return error(400, 'SESSION_REQUEST_INVALID');
  }
  try {
    const result = await callBackend('/api/v1/operator/session', 'POST', {
      protocolo: body.protocolo, producerProtocolVersion: '2',
    }, undefined, { Authorization: authorization, 'X-Station-Request-Id': body.requestId });
    if (!result.ok) return upstreamError(result.status, result.body);
    if (!isObject(result.body)) return error(502, 'SESSION_RESPONSE_INVALID');
    const cookie = sessionCookieFor(result.body);
    const session = safeSession(result.body);
    if (!cookie || !session) return error(502, 'SESSION_RESPONSE_INVALID');
    return json({ ...session }, 200, cookie);
  } catch {
    return error(503, 'BACKEND_UNAVAILABLE');
  }
}

export async function operatorStopSession(request: Request): Promise<Response> {
  const securityError = requireMutationSecurity(request);
  if (securityError) return securityError;
  const authorization = bearerToken(request);
  if (!authorization) return error(401, 'AUTH_REQUIRED');
  const body = await readJson(request);
  if (!body || !isUuid(body.sessionId)) return error(400, 'SESSION_ID_INVALID');
  try {
    const result = await callBackend(`/api/v1/operator/sessions/${body.sessionId}`, 'DELETE',
      undefined, undefined, { Authorization: authorization });
    if (!result.ok) return upstreamError(result.status, result.body);
    return json({ stopped: true }, 200, clearCookie(SESSION_COOKIE));
  } catch {
    return error(503, 'BACKEND_UNAVAILABLE');
  }
}

interface SafeShift {
  active: boolean;
  protocolo: 'AGUA_Y_JABON' | 'DOMESTICO' | 'CLINICO_QUIRURGICO' | null;
  startedAtEpochMs: number | null;
  endsAtEpochMs: number | null;
}

function safeShift(value: unknown): SafeShift | null {
  if (!isObject(value) || typeof value.active !== 'boolean') return null;
  const epoch = (item: unknown) => item === null ? null
    : typeof item === 'number' && Number.isSafeInteger(item) && item > 0 ? item : undefined;
  const startedAtEpochMs = epoch(value.startedAtEpochMs);
  const endsAtEpochMs = epoch(value.endsAtEpochMs);
  if (startedAtEpochMs === undefined || endsAtEpochMs === undefined) return null;
  if (value.active && (!isProtocol(value.protocolo) || startedAtEpochMs === null || endsAtEpochMs === null)) return null;
  return { active: value.active, protocolo: value.active ? value.protocolo as SafeShift['protocolo'] : null,
    startedAtEpochMs: value.active ? startedAtEpochMs : null, endsAtEpochMs: value.active ? endsAtEpochMs : null };
}

export async function operatorShiftStatus(request: Request): Promise<Response> {
  if (isCrossSite(request)) return error(403, 'ORIGIN_INVALID');
  const authorization = bearerToken(request);
  if (!authorization) return error(401, 'AUTH_REQUIRED');
  try {
    const result = await callBackend('/api/v1/operator/shift', 'GET', undefined, undefined,
      { Authorization: authorization });
    if (!result.ok) return upstreamError(result.status, result.body);
    const shift = safeShift(result.body);
    return shift ? json({ ...shift }) : error(502, 'SHIFT_RESPONSE_INVALID');
  } catch {
    return error(503, 'BACKEND_UNAVAILABLE');
  }
}

export async function operatorShiftStart(request: Request): Promise<Response> {
  const securityError = requireMutationSecurity(request);
  if (securityError) return securityError;
  if (!allowRequest(request, 12)) return error(429, 'RATE_LIMITED');
  const authorization = bearerToken(request);
  if (!authorization) return error(401, 'AUTH_REQUIRED');
  const body = await readJson(request);
  if (!body || !isProtocol(body.protocolo) || typeof body.hours !== 'number'
    || !Number.isInteger(body.hours) || body.hours < 1 || body.hours > 16) {
    return error(400, 'SHIFT_REQUEST_INVALID');
  }
  try {
    const result = await callBackend('/api/v1/operator/shift', 'POST',
      { hours: body.hours, protocolo: body.protocolo }, undefined, { Authorization: authorization });
    if (!result.ok) return upstreamError(result.status, result.body);
    const shift = safeShift(result.body);
    return shift && shift.active ? json({ ...shift }) : error(502, 'SHIFT_RESPONSE_INVALID');
  } catch {
    return error(503, 'BACKEND_UNAVAILABLE');
  }
}

export async function operatorShiftStop(request: Request): Promise<Response> {
  const securityError = requireMutationSecurity(request);
  if (securityError) return securityError;
  const authorization = bearerToken(request);
  if (!authorization) return error(401, 'AUTH_REQUIRED');
  try {
    const result = await callBackend('/api/v1/operator/shift', 'DELETE', undefined, undefined,
      { Authorization: authorization });
    if (!result.ok) return upstreamError(result.status, result.body);
    return json({ stopped: true }, 200, clearCookie(SESSION_COOKIE));
  } catch {
    return error(503, 'BACKEND_UNAVAILABLE');
  }
}

export async function operatorTicket(request: Request): Promise<Response> {
  const securityError = requireMutationSecurity(request);
  if (securityError) return securityError;
  if (!allowRequest(request, 24)) return error(429, 'RATE_LIMITED');
  const authorization = bearerToken(request);
  if (!authorization) return error(401, 'AUTH_REQUIRED');
  const body = await readJson(request);
  if (!body || !isUuid(body.sessionId)) return error(400, 'SESSION_ID_INVALID');
  try {
    const result = await callBackend(`/api/v1/operator/sessions/${body.sessionId}/websocket-ticket`,
      'POST', undefined, undefined, { Authorization: authorization });
    if (!result.ok) return upstreamError(result.status, result.body);
    if (!isObject(result.body) || typeof result.body.ticket !== 'string'
      || result.body.ticket.length < 32 || typeof result.body.expiresAt !== 'string') {
      return error(502, 'WEBSOCKET_TICKET_INVALID');
    }
    return json({ ticket: result.body.ticket, expiresAt: result.body.expiresAt });
  } catch {
    return error(503, 'BACKEND_UNAVAILABLE');
  }
}

export async function ticket(request: Request): Promise<Response> {
  const securityError = requireMutationSecurity(request);
  if (securityError) return securityError;
  const sessionToken = cookieValue(request, SESSION_COOKIE);
  const credential = cookieValue(request, STATION_COOKIE);
  if (!sessionToken || !credential) return error(401, 'SESSION_CAPABILITY_EXPIRED');
  const body = await readJson(request);
  if (!body || !isUuid(body.sessionId)) return error(400, 'SESSION_ID_INVALID');
  try {
    const station = await callBackend('/api/v1/stations/me', 'GET', undefined, credential);
    if (!station.ok || !isObject(station.body)
      || station.body.activeSessionId !== body.sessionId) return error(403, 'STATION_SESSION_MISMATCH');
    const result = await callBackend(`/api/v1/session/${body.sessionId}/websocket-ticket`, 'POST',
      undefined, undefined, { 'X-Session-Token': sessionToken });
    if (!result.ok) return upstreamError(result.status, result.body);
    if (!isObject(result.body) || typeof result.body.ticket !== 'string'
      || result.body.ticket.length < 32 || result.body.ticket.length > 512) {
      return error(502, 'WEBSOCKET_TICKET_INVALID');
    }
    return json({ ticket: result.body.ticket });
  } catch {
    return error(503, 'BACKEND_UNAVAILABLE');
  }
}

export async function webrtcTicket(request: Request): Promise<Response> {
  const securityError = requireMutationSecurity(request);
  if (securityError) return securityError;
  if (!allowRequest(request, 24)) return error(429, 'RATE_LIMITED');
  const sessionToken = cookieValue(request, SESSION_COOKIE);
  const credential = cookieValue(request, STATION_COOKIE);
  if (!sessionToken || !credential) return error(401, 'SESSION_CAPABILITY_EXPIRED');
  const body = await readJson(request);
  if (!body || !isUuid(body.sessionId)) return error(400, 'SESSION_ID_INVALID');
  try {
    const station = await callBackend('/api/v1/stations/me', 'GET', undefined, credential);
    if (!station.ok || !isObject(station.body)
      || station.body.activeSessionId !== body.sessionId) return error(403, 'STATION_SESSION_MISMATCH');
    const result = await callBackend(`/api/v1/session/${body.sessionId}/webrtc-ticket`, 'POST',
      undefined, undefined, { 'X-Session-Token': sessionToken });
    if (!result.ok) return upstreamError(result.status, result.body);
    if (!isObject(result.body) || typeof result.body.ticket !== 'string'
      || result.body.ticket.length < 32 || result.body.peerRole !== 'BROWSER'
      || typeof result.body.expiresAt !== 'string'
      || !Number.isFinite(Date.parse(result.body.expiresAt))) {
      return error(502, 'WEBRTC_TICKET_INVALID');
    }
    // Older Java builds omit iceServers (LAN only); a present but malformed list is rejected.
    const iceServers = result.body.iceServers === undefined ? [] : sanitizeIceServers(result.body.iceServers);
    if (iceServers === null) return error(502, 'WEBRTC_TICKET_INVALID');
    return json({ ticket: result.body.ticket, expiresAt: result.body.expiresAt, iceServers });
  } catch {
    return error(503, 'BACKEND_UNAVAILABLE');
  }
}

/**
 * Forwards the one retained frame of a reported attempt to Java. The BFF only checks shape and size;
 * Java decides eligibility and re-encodes the image. Nothing is stored or logged here.
 */
export async function evidenceUpload(request: Request): Promise<Response> {
  const securityError = requireMutationSecurity(request);
  if (securityError) return securityError;
  if (!allowRequest(request, 12)) return error(429, 'RATE_LIMITED');
  const sessionToken = cookieValue(request, SESSION_COOKIE);
  const credential = cookieValue(request, STATION_COOKIE);
  if (!sessionToken || !credential) return error(401, 'SESSION_CAPABILITY_EXPIRED');
  const params = new URL(request.url).searchParams;
  const sessionId = params.get('sessionId');
  const attempt = Number(params.get('attempt'));
  if (!isUuid(sessionId) || !Number.isInteger(attempt) || attempt < 1 || attempt > 100_000) {
    return error(400, 'SESSION_ID_INVALID');
  }
  if ((request.headers.get('content-type') ?? '').toLowerCase().split(';')[0]?.trim() !== 'image/jpeg') {
    return error(415, 'IMAGE_INVALID');
  }
  const declared = Number(request.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > MAX_EVIDENCE_BYTES) return error(413, 'IMAGE_TOO_LARGE');
  let image: Uint8Array;
  try {
    image = new Uint8Array(await request.arrayBuffer());
  } catch {
    return error(400, 'IMAGE_INVALID');
  }
  if (image.byteLength > MAX_EVIDENCE_BYTES) return error(413, 'IMAGE_TOO_LARGE');
  if (image.byteLength < MIN_EVIDENCE_BYTES || image[0] !== 0xff || image[1] !== 0xd8 || image[2] !== 0xff) {
    return error(400, 'IMAGE_INVALID');
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const station = await callBackend('/api/v1/stations/me', 'GET', undefined, credential);
    if (!station.ok || !isObject(station.body) || station.body.activeSessionId !== sessionId) {
      return error(403, 'STATION_SESSION_MISMATCH');
    }
    const response = await fetch(new URL(`/api/v1/stations/evidence/${sessionId}/${attempt}`, backendOrigin()), {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'image/jpeg',
        'X-Station-Credential': credential,
        'X-Session-Token': sessionToken,
      },
      body: image,
      cache: 'no-store',
      redirect: 'error',
      signal: controller.signal,
    });
    let parsed: unknown = null;
    try { parsed = JSON.parse(await readLimitedText(response, 2_048)); } catch { parsed = null; }
    if (response.ok) return json({ stored: true });
    return upstreamError(response.status, parsed);
  } catch {
    return error(503, 'BACKEND_UNAVAILABLE');
  } finally {
    clearTimeout(timeout);
  }
}

export async function clearSession(request: Request): Promise<Response> {
  const securityError = requireMutationSecurity(request);
  if (securityError) return securityError;
  return json({ cleared: true }, 200, clearCookie(SESSION_COOKIE));
}

async function callBackend(path: string, method: string, body?: JsonObject,
  stationCredential?: string, headers: Record<string, string> = {}): Promise<UpstreamResponse> {
  const origin = backendOrigin();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
  try {
    const requestHeaders: Record<string, string> = { Accept: 'application/json', ...headers };
    if (body) requestHeaders['Content-Type'] = 'application/json';
    if (stationCredential) requestHeaders['X-Station-Credential'] = stationCredential;
    const response = await fetch(new URL(path, origin), {
      method,
      headers: requestHeaders,
      body: body ? JSON.stringify(body) : undefined,
      cache: 'no-store',
      redirect: 'error',
      signal: controller.signal,
    });
    const text = await readLimitedText(response, 32_768);
    let parsed: unknown = null;
    if (text) {
      try { parsed = JSON.parse(text) as unknown; } catch { parsed = null; }
    }
    return { ok: response.ok, status: response.status, body: parsed };
  } finally {
    clearTimeout(timeout);
  }
}

async function readJson(request: Request): Promise<JsonObject | null> {
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) return null;
  try {
    const raw = await request.text();
    if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) return null;
    const parsed: unknown = JSON.parse(raw);
    return isObject(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

async function readLimitedText(response: Response, maximumBytes: number): Promise<string> {
  const declaredLength = Number(response.headers.get('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > maximumBytes) {
    await response.body?.cancel();
    throw new Error('upstream response exceeds limit');
  }
  if (!response.body) return '';
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > maximumBytes) {
        await reader.cancel();
        throw new Error('upstream response exceeds limit');
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

function requireMutationSecurity(request: Request): Response | null {
  const originError = requireOrigin(request);
  if (originError) return originError;
  const supplied = request.headers.get('x-csrf-token') ?? '';
  const cookie = cookieValue(request, CSRF_COOKIE) ?? '';
  if (!isHexToken(supplied) || !isHexToken(cookie) || !safeEqual(supplied, cookie)) {
    return error(403, 'CSRF_INVALID');
  }
  return null;
}

function requireOrigin(request: Request): Response | null {
  const expected = process.env.HANDWASH_PUBLIC_ORIGIN?.trim();
  const origin = request.headers.get('origin');
  if (!expected || !origin || origin !== expected || isCrossSite(request)) {
    return error(403, 'ORIGIN_INVALID');
  }
  return null;
}

function isCrossSite(request: Request): boolean {
  return request.headers.get('sec-fetch-site') === 'cross-site';
}

function backendOrigin(): string {
  const raw = process.env.HANDWASH_BACKEND_ORIGIN?.trim();
  if (!raw) throw new Error('Backend origin is not configured');
  const parsed = new URL(raw);
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password
    || parsed.pathname !== '/' || parsed.search || parsed.hash) {
    throw new Error('Backend origin must be an HTTPS origin');
  }
  return parsed.origin;
}

function allowRequest(request: Request, limit: number): boolean {
  const now = Date.now();
  const client = (request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown').slice(0, 64);
  // One bucket per route and client: a busy route (tickets, shifts) must not exhaust another route's allowance.
  const url = new URL(request.url);
  const route = `${url.pathname}${url.searchParams.get('action') ? `?${url.searchParams.get('action')}` : ''}`.slice(0, 80);
  const key = `${route}:${request.method}:${client}`;
  let bucket = rateBuckets.get(key);
  if (!bucket || now - bucket.windowStart >= RATE_WINDOW_MS) {
    if (!bucket && rateBuckets.size >= 2_048) {
      for (const [id, entry] of rateBuckets) {
        if (now - entry.windowStart >= RATE_WINDOW_MS) rateBuckets.delete(id);
      }
      if (rateBuckets.size >= 2_048) return false;
    }
    bucket = { windowStart: now, count: 0 };
    rateBuckets.set(key, bucket);
  }
  bucket.count += 1;
  return bucket.count <= limit;
}

function cookieValue(request: Request, name: string): string | null {
  const entries = request.headers.get('cookie')?.split(';')
    .map((part) => part.trim()).filter((part) => part.startsWith(`${name}=`)) ?? [];
  if (entries.length !== 1) return null;
  return entries[0]!.slice(name.length + 1);
}

function json(body: JsonObject, statusCode = 200, cookie?: string | string[]): Response {
  const headers = new Headers({
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store, max-age=0',
    Pragma: 'no-cache',
    Vary: 'Cookie, Origin',
    'X-Content-Type-Options': 'nosniff',
  });
  if (Array.isArray(cookie)) cookie.forEach((value) => headers.append('Set-Cookie', value));
  else if (cookie) headers.set('Set-Cookie', cookie);
  return new Response(JSON.stringify(body), { status: statusCode, headers });
}

function error(statusCode: number, code: string): Response {
  return json({ code }, statusCode);
}

function upstreamError(statusCode: number, body: unknown): Response {
  const allowedCodes = new Set([
    'PUESTO_NO_AUTORIZADO', 'CODIGO_DE_INSCRIPCION_INVALIDO', 'PUESTO_CON_SESION_ACTIVA',
    'LIMITE_CREACION_SESIONES', 'LIMITE_INTENTOS_VINCULACION', 'CAPTURADOR_PROTOCOL_VERSION_REQUIRED',
    'SESION_TERMINADA', 'ACCESO_NO_AUTORIZADO', 'AUDITORIA_NO_DISPONIBLE',
    'OPERADOR_SIN_ASIGNACION', 'CODIGO_OPERADOR_INVALIDO', 'CORREO_NO_COINCIDE',
    'OPERADOR_YA_ASIGNADO', 'PUESTO_NO_DISPONIBLE', 'CUENTA_COGNITO_NO_AUTORIZADA',
    'ID_TOKEN_NO_VALIDO', 'CORREO_NO_VERIFICADO', 'TICKET_WEBSOCKET_NO_DISPONIBLE',
    'STATION_SESSION_MISMATCH', 'ACCESO_NO_AUTORIZADO', 'ASIGNACION_NO_DISPONIBLE',
    'PUESTO_CON_SESION_ACTIVA', 'TURNO_YA_ACTIVO', 'TURNO_INVALIDO', 'TURNO_NO_DISPONIBLE',
    'KEY_NO_VALIDA', 'LIMITE_INTENTOS_KEY', 'KEYS_NO_DISPONIBLES',
    'FOTO_DESACTIVADA', 'FOTO_NO_ELEGIBLE', 'FOTO_YA_REGISTRADA', 'FOTO_NO_DISPONIBLE', 'IMAGEN_INVALIDA',
  ]);
  const upstreamCode = isObject(body) && typeof body.error === 'string' ? body.error : null;
  const code = upstreamCode && allowedCodes.has(upstreamCode)
    ? upstreamCode : statusCode >= 500 ? 'BACKEND_UNAVAILABLE' : 'REQUEST_REJECTED';
  const safeStatus = [400, 401, 403, 404, 409, 429, 503].includes(statusCode) ? statusCode : 502;
  return error(safeStatus, code);
}

function unregistered(): JsonObject {
  return { registered: false, stationId: null, stationName: null, activeSession: null, resumeError: false };
}

function safeSession(value: JsonObject): SafeSession | null {
  if (!isUuid(value.sessionId) || !isProtocol(value.protocolo)) return null;
  return {
    sessionId: value.sessionId,
    protocolo: value.protocolo,
    ...(typeof value.mensaje === 'string' ? { mensaje: value.mensaje } : {}),
  };
}

function sessionCookieFor(value: JsonObject): string | null {
  const token = value.accessToken;
  const expiresAt = typeof value.accessTokenExpiresAt === 'string'
    ? Date.parse(value.accessTokenExpiresAt) : NaN;
  if (typeof token !== 'string' || token.length < 32 || token.length > 512 || !Number.isFinite(expiresAt)) {
    return null;
  }
  const maxAge = Math.floor(Math.min(86_400, (expiresAt - Date.now()) / 1000));
  if (maxAge < 1) return null;
  return `${SESSION_COOKIE}=${token}; Path=${COOKIE_PATH}; Max-Age=${maxAge}; Secure; HttpOnly; SameSite=Strict`;
}

function persistentCookie(name: string, value: string): string {
  return `${name}=${value}; Path=${COOKIE_PATH}; Max-Age=31536000; Secure; HttpOnly; SameSite=Strict`;
}

function csrfCookie(value: string): string {
  return `${CSRF_COOKIE}=${value}; Path=${CSRF_COOKIE_PATH}; Max-Age=1800; Secure; SameSite=Strict`;
}

function clearCookie(name: string): string {
  return `${name}=; Path=${COOKIE_PATH}; Max-Age=0; Secure; HttpOnly; SameSite=Strict`;
}

function safeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  return timingSafeEqual(Buffer.from(left, 'utf8'), Buffer.from(right, 'utf8'));
}

function isHexToken(value: string): boolean { return /^[a-f0-9]{64}$/.test(value); }
function bearerToken(request: Request): string | null {
  const authorization = request.headers.get('authorization') ?? '';
  if (/^Bearer [A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(authorization)
    && authorization.length <= 8_200) return authorization;
  // No Cognito bearer: an operator signed in with an API key carries its session in an HttpOnly cookie.
  const keySession = cookieValue(request, OPERATOR_KEY_COOKIE);
  return keySession && KEY_SESSION_PATTERN.test(keySession) ? `KeySession ${keySession}` : null;
}
function clientAddress(request: Request): string {
  return (request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown').slice(0, 64);
}
function isCredential(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{40,64}$/.test(value);
}
function isUuid(value: unknown): value is string {
  return typeof value === 'string'
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
function isProtocol(value: unknown): value is 'AGUA_Y_JABON' | 'DOMESTICO' | 'CLINICO_QUIRURGICO' {
  return value === 'AGUA_Y_JABON' || value === 'DOMESTICO' || value === 'CLINICO_QUIRURGICO';
}
function safeOperatorGrant(value: unknown): JsonObject | null {
  if (!isObject(value) || typeof value.subject !== 'string' || !value.subject
    || typeof value.email !== 'string' || !value.email || !isUuid(value.stationId)
    || typeof value.stationName !== 'string' || !Number.isSafeInteger(value.grantedAtEpochMs)
    || (value.revokedAtEpochMs !== null && !Number.isSafeInteger(value.revokedAtEpochMs))) return null;
  return {
    subject: value.subject,
    email: value.email,
    stationId: value.stationId,
    stationName: value.stationName,
    grantedAtEpochMs: value.grantedAtEpochMs,
    revokedAtEpochMs: value.revokedAtEpochMs,
  };
}
/** Strict allowlist: re-emits only urls/username/credential and only stun:/turn:/turns: URLs. */
function sanitizeIceServers(value: unknown): JsonObject[] | null {
  if (!Array.isArray(value) || value.length > 4) return null;
  const servers: JsonObject[] = [];
  for (const entry of value) {
    if (!isObject(entry) || !Array.isArray(entry.urls) || entry.urls.length < 1 || entry.urls.length > 4) return null;
    const urls: string[] = [];
    for (const url of entry.urls) {
      if (typeof url !== 'string' || url.length > 300 || !/^(stun|turn|turns):[^\s@]+$/.test(url)) return null;
      urls.push(url);
    }
    const turn = urls.some((url) => !url.startsWith('stun:'));
    const username = entry.username ?? null;
    const credential = entry.credential ?? null;
    const credentialOk = (item: unknown) => typeof item === 'string' && item.length > 0 && item.length <= 256;
    if (turn ? !credentialOk(username) || !credentialOk(credential) : username !== null || credential !== null) return null;
    servers.push(turn ? { urls, username, credential } : { urls });
  }
  return servers;
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

interface SafeSession {
  sessionId: string;
  protocolo: 'AGUA_Y_JABON' | 'DOMESTICO' | 'CLINICO_QUIRURGICO';
  mensaje?: string;
}

interface UpstreamResponse {
  ok: boolean;
  status: number;
  body: unknown;
}
