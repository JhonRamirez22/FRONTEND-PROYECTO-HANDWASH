/** Sentinel "token" for an operator signed in with an API key: the credential is an HttpOnly cookie, not JS-visible. */
export const KEY_SESSION = 'key-session';

const FLAG = 'handwash.operator.keySession';
const API_KEY_PATTERN = /^hwk_[0-9a-f]{16}_[A-Za-z0-9_-]{43}$/;

export interface KeyLoginProfile {
  stationId: string;
  stationName: string;
  label: string;
  expiresAtEpochMs: number;
  stationLinked: boolean;
  /** Another Mac already holds this station; this device logged in as a console only. */
  macAlreadyLinked: boolean;
}

/** The "this is the Mac" box starts ticked only when this browser has no station yet. */
export function defaultLinkMac(browserHasStation: boolean): boolean {
  return !browserHasStation;
}

/** Authorization headers for OperatorApi calls: a key session relies on its cookie, Cognito sends a bearer. */
export function authHeader(token: string): Record<string, string> {
  return token === KEY_SESSION ? {} : { Authorization: `Bearer ${token}` };
}

/**
 * The key is typed once, sent to the BFF over HTTPS and traded for an HttpOnly cookie. Only a non-secret
 * "signed in" flag is kept so the console knows to ask the server; revoking the key ends the session server-side.
 */
export class OperatorKeySession {
  isActive(): boolean {
    try { return window.sessionStorage.getItem(FLAG) === '1'; } catch { return false; }
  }

  clear(): void {
    try { window.sessionStorage.removeItem(FLAG); } catch { /* storage unavailable */ }
  }

  async login(rawKey: string, linkStation: boolean, forceLink = false): Promise<KeyLoginProfile> {
    const key = rawKey.trim();
    if (!API_KEY_PATTERN.test(key)) throw new Error('La API key no tiene el formato correcto (empieza con hwk_).');
    const response = await fetch('/api/operator?action=key-login', {
      method: 'POST', credentials: 'same-origin', cache: 'no-store',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': await csrfToken() },
      body: JSON.stringify({ key, linkStation, forceLink: linkStation && forceLink }),
    });
    const payload = await readPayload(response);
    if (response.status === 401) throw new Error('La API key no es válida o fue revocada. Pide otra a ADMIN.');
    if (response.status === 429) throw new Error('Demasiados intentos con una key incorrecta. Espera unos minutos.');
    if (!response.ok || typeof payload.stationId !== 'string' || typeof payload.stationName !== 'string') {
      throw new Error('No se pudo iniciar sesión con la API key. Reintenta en unos segundos.');
    }
    try { window.sessionStorage.setItem(FLAG, '1'); } catch { /* the cookie still works; only the flag is lost */ }
    return {
      stationId: payload.stationId, stationName: payload.stationName,
      label: typeof payload.label === 'string' ? payload.label : '',
      expiresAtEpochMs: typeof payload.expiresAtEpochMs === 'number' ? payload.expiresAtEpochMs : 0,
      stationLinked: payload.stationLinked === true,
      macAlreadyLinked: payload.macAlreadyLinked === true,
    };
  }

  async logout(): Promise<void> {
    this.clear();
    try {
      await fetch('/api/operator?action=key-logout', {
        method: 'POST', credentials: 'same-origin', cache: 'no-store',
        headers: { 'X-CSRF-Token': await csrfToken() },
      });
    } catch { /* the server session also expires on its own */ }
  }
}

async function csrfToken(): Promise<string> {
  const response = await fetch('/api/station/csrf', { method: 'POST', credentials: 'same-origin', cache: 'no-store' });
  const payload = await readPayload(response);
  if (!response.ok || typeof payload.token !== 'string' || !/^[a-f0-9]{64}$/.test(payload.token)) {
    throw new Error('No se pudo preparar la protección de la solicitud.');
  }
  return payload.token;
}

async function readPayload(response: Response): Promise<Record<string, unknown>> {
  try {
    const value: unknown = await response.json();
    return typeof value === 'object' && value !== null ? value as Record<string, unknown> : {};
  } catch {
    return {};
  }
}
