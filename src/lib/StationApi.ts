import type { Protocolo } from '@/types';

export interface ActiveStationSession {
  sessionId: string;
  protocolo: Protocolo;
  mensaje?: string;
}

export interface PublicStationStatus {
  registered: boolean;
  stationId: string | null;
  stationName: string | null;
  activeSession: ActiveStationSession | null;
  unchangedActiveSession?: boolean;
  resumeError: boolean;
}

export interface WebRtcAccess {
  ticket: string;
  /** Empty means LAN only; TURN entries carry short-lived credentials from Java. */
  iceServers: RTCIceServer[];
}

function parseIceServers(value: unknown): RTCIceServer[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry): RTCIceServer[] => {
    if (typeof entry !== 'object' || entry === null || !Array.isArray((entry as { urls?: unknown }).urls)) return [];
    const { urls, username, credential } = entry as { urls: unknown[]; username?: unknown; credential?: unknown };
    const safeUrls = urls.filter((url): url is string => typeof url === 'string' && /^(stun|turn|turns):/.test(url));
    if (safeUrls.length === 0) return [];
    return [typeof username === 'string' && typeof credential === 'string'
      ? { urls: safeUrls, username, credential } : { urls: safeUrls }];
  });
}

export class StationApi {
  async status(knownSessionId?: string | null): Promise<PublicStationStatus> {
    const url = new URL('/api/station/status', window.location.origin);
    if (knownSessionId && isUuid(knownSessionId)) url.searchParams.set('knownSessionId', knownSessionId);
    const response = await fetch(url, {
      method: 'GET', credentials: 'same-origin', cache: 'no-store',
      headers: { Accept: 'application/json' },
    });
    const payload = await response.json() as Partial<PublicStationStatus>;
    if (!response.ok || typeof payload.registered !== 'boolean') {
      throw new Error('No se pudo verificar el registro de este puesto. Reintenta.');
    }
    return {
      registered: payload.registered,
      stationId: typeof payload.stationId === 'string' ? payload.stationId : null,
      stationName: typeof payload.stationName === 'string' ? payload.stationName : null,
      activeSession: isActiveSession(payload.activeSession) ? payload.activeSession : null,
      unchangedActiveSession: payload.unchangedActiveSession === true,
      resumeError: payload.resumeError === true,
    };
  }

  async enroll(code: string): Promise<{ stationId: string; stationName: string }> {
    const csrf = await this.csrfToken();
    const response = await fetch('/api/station/enroll', {
      method: 'POST', credentials: 'same-origin', cache: 'no-store',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf },
      body: JSON.stringify({ code: code.trim() }),
    });
    const payload = await this.readPayload(response);
    if (!response.ok || typeof payload.stationId !== 'string' || typeof payload.stationName !== 'string') {
      throw new Error(errorMessage(payload.code, response.status));
    }
    return { stationId: payload.stationId, stationName: payload.stationName };
  }

  async createSession(protocolo: Protocolo, requestId: string): Promise<ActiveStationSession> {
    const csrf = await this.csrfToken();
    const response = await fetch('/api/station/session', {
      method: 'POST', credentials: 'same-origin', cache: 'no-store',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf },
      body: JSON.stringify({ protocolo, requestId }),
    });
    const payload = await this.readPayload(response);
    if (!response.ok || typeof payload.sessionId !== 'string'
      || !isProtocol(payload.protocolo)) {
      throw new Error(errorMessage(payload.code, response.status));
    }
    return { sessionId: payload.sessionId, protocolo: payload.protocolo,
      mensaje: typeof payload.mensaje === 'string' ? payload.mensaje : undefined };
  }

  async stopSession(sessionId: string): Promise<void> {
    const csrf = await this.csrfToken();
    const response = await fetch('/api/station/stop', {
      method: 'POST', credentials: 'same-origin', cache: 'no-store',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf },
      body: JSON.stringify({ sessionId }),
    });
    if (!response.ok) throw new Error(errorMessage(undefined, response.status));
  }

  async websocketTicket(sessionId: string): Promise<string> {
    const csrf = await this.csrfToken();
    const response = await fetch('/api/station/ticket', {
      method: 'POST', credentials: 'same-origin', cache: 'no-store',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf },
      body: JSON.stringify({ sessionId }),
    });
    const payload = await this.readPayload(response);
    if (!response.ok || typeof payload.ticket !== 'string' || payload.ticket.length < 32) {
      throw new Error('Java no entregó un ticket válido para el canal en vivo.');
    }
    return payload.ticket;
  }

  async webrtcAccess(sessionId: string): Promise<WebRtcAccess> {
    const csrf = await this.csrfToken();
    const response = await fetch('/api/station/webrtc-ticket', {
      method: 'POST', credentials: 'same-origin', cache: 'no-store',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf },
      body: JSON.stringify({ sessionId }),
    });
    const payload = await this.readPayload(response);
    if (!response.ok || typeof payload.ticket !== 'string' || payload.ticket.length < 32) {
      throw new Error('Java no entregó un ticket WebRTC válido para esta sesión.');
    }
    return { ticket: payload.ticket, iceServers: parseIceServers(payload.iceServers) };
  }

  async clearSession(): Promise<void> {
    const csrf = await this.csrfToken();
    await fetch('/api/station/clear-session', {
      method: 'POST', credentials: 'same-origin', cache: 'no-store',
      headers: { 'X-CSRF-Token': csrf },
    });
  }

  private async csrfToken(): Promise<string> {
    const response = await fetch('/api/station/csrf', {
      method: 'POST', credentials: 'same-origin', cache: 'no-store',
    });
    if (!response.ok) throw new Error('No se pudo preparar la protección de la solicitud.');
    const payload = await response.json() as { token?: unknown };
    if (typeof payload.token !== 'string' || !/^[a-f0-9]{64}$/.test(payload.token)) {
      throw new Error('La protección CSRF del puesto no respondió correctamente.');
    }
    return payload.token;
  }

  private async readPayload(response: Response): Promise<Record<string, unknown>> {
    try {
      const payload: unknown = await response.json();
      return typeof payload === 'object' && payload !== null
        ? payload as Record<string, unknown> : {};
    } catch {
      return {};
    }
  }
}

function isActiveSession(value: unknown): value is ActiveStationSession {
  if (!value || typeof value !== 'object') return false;
  const session = value as Record<string, unknown>;
  return typeof session.sessionId === 'string' && isProtocol(session.protocolo);
}

function isProtocol(value: unknown): value is Protocolo {
  return value === 'AGUA_Y_JABON' || value === 'DOMESTICO' || value === 'CLINICO_QUIRURGICO';
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function errorMessage(code: unknown, status: number): string {
  if (code === 'CODIGO_DE_INSCRIPCION_INVALIDO' || status === 401) {
    return 'Código inválido, vencido o ya utilizado. Pide a ADMIN uno nuevo.';
  }
  if (code === 'PUESTO_CON_SESION_ACTIVA' || status === 409) {
    return 'Este puesto ya tiene una sesión activa. Finalízala o espera su cierre.';
  }
  if (status === 429) return 'Demasiadas solicitudes. Espera un momento e intenta de nuevo.';
  if (status >= 500) return 'El backend no está disponible. No se inició una detección.';
  return 'No se pudo completar la operación. Revisa la conexión e intenta de nuevo.';
}

export const stationApi = new StationApi();
