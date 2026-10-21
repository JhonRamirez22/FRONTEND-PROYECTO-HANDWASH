import type { Protocolo } from '@/types';

export interface OperatorGrantView {
  subject: string;
  email: string;
  stationId: string;
  stationName: string;
  grantedAtEpochMs: number;
  revokedAtEpochMs: number | null;
}

export interface OperatorSession {
  sessionId: string;
  protocolo: Protocolo;
  mensaje?: string;
}

export interface OperatorStatus {
  grant: OperatorGrantView;
  activeSession: OperatorSession | null;
  resumeError: boolean;
}

export class OperatorApi {
  async status(accessToken: string): Promise<OperatorStatus | null> {
    const response = await fetch('/api/operator/me', {
      method: 'GET', credentials: 'same-origin', cache: 'no-store',
      headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
    });
    if (response.status === 404) return null;
    const payload = await readPayload(response);
    if (!response.ok || !isGrant(payload.grant)) throw new Error(messageFor(payload.code, response.status));
    return {
      grant: payload.grant,
      activeSession: isSession(payload.activeSession) ? payload.activeSession : null,
      resumeError: payload.resumeError === true,
    };
  }

  async claim(accessToken: string, idToken: string, code: string): Promise<OperatorGrantView> {
    const response = await fetch('/api/operator/claim', {
      method: 'POST', credentials: 'same-origin', cache: 'no-store',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json', 'X-CSRF-Token': await csrfToken(),
        'X-Cognito-Id-Token': idToken,
      },
      body: JSON.stringify({ code: code.trim() }),
    });
    const payload = await readPayload(response);
    if (!response.ok || !isGrant(payload)) throw new Error(messageFor(payload.code, response.status));
    return payload;
  }

  async startSession(accessToken: string, protocolo: Protocolo, requestId: string): Promise<OperatorSession> {
    const response = await fetch('/api/operator/session', {
      method: 'POST', credentials: 'same-origin', cache: 'no-store',
      headers: {
        Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json',
        'X-CSRF-Token': await csrfToken(),
      },
      body: JSON.stringify({ protocolo, requestId }),
    });
    const payload = await readPayload(response);
    if (!response.ok || !isSession(payload)) throw new Error(messageFor(payload.code, response.status));
    return payload;
  }

  async stopSession(accessToken: string, sessionId: string): Promise<void> {
    const response = await fetch('/api/operator/stop', {
      method: 'POST', credentials: 'same-origin', cache: 'no-store',
      headers: {
        Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json',
        'X-CSRF-Token': await csrfToken(),
      },
      body: JSON.stringify({ sessionId }),
    });
    if (!response.ok) throw new Error(messageFor((await readPayload(response)).code, response.status));
  }

  async websocketTicket(accessToken: string, sessionId: string): Promise<string> {
    const response = await fetch('/api/operator/ticket', {
      method: 'POST', credentials: 'same-origin', cache: 'no-store',
      headers: {
        Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json',
        'X-CSRF-Token': await csrfToken(),
      },
      body: JSON.stringify({ sessionId }),
    });
    const payload = await readPayload(response);
    if (!response.ok || typeof payload.ticket !== 'string' || payload.ticket.length < 32) {
      throw new Error(messageFor(payload.code, response.status));
    }
    return payload.ticket;
  }
}

async function csrfToken(): Promise<string> {
  const response = await fetch('/api/station/csrf', {
    method: 'POST', credentials: 'same-origin', cache: 'no-store',
  });
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

function isGrant(value: unknown): value is OperatorGrantView {
  if (!value || typeof value !== 'object') return false;
  const item = value as Record<string, unknown>;
  return typeof item.subject === 'string' && typeof item.email === 'string'
    && typeof item.stationId === 'string' && typeof item.stationName === 'string'
    && typeof item.grantedAtEpochMs === 'number';
}

function isSession(value: unknown): value is OperatorSession {
  if (!value || typeof value !== 'object') return false;
  const item = value as Record<string, unknown>;
  return typeof item.sessionId === 'string'
    && (item.protocolo === 'AGUA_Y_JABON' || item.protocolo === 'DOMESTICO' || item.protocolo === 'CLINICO_QUIRURGICO');
}

function messageFor(code: unknown, status: number): string {
  if (code === 'OPERADOR_SIN_ASIGNACION') return 'Tu cuenta aún no tiene un puesto asignado.';
  if (code === 'CORREO_NO_COINCIDE') return 'El código fue emitido para otro correo verificado.';
  if (code === 'CODIGO_OPERADOR_INVALIDO' || status === 401) return 'Código inválido, revocado o ya utilizado.';
  if (status === 403) return 'La cuenta no está autorizada para este puesto.';
  if (status === 409) return 'La asignación ya existe o el puesto tiene una sesión activa.';
  if (status === 429) return 'Se alcanzó el límite de intentos. Espera y vuelve a intentar.';
  if (status >= 500) return 'Java no está disponible. La sesión no se confirmó.';
  return 'No se pudo completar la operación. Revisa la solicitud.';
}

export const operatorApi = new OperatorApi();
