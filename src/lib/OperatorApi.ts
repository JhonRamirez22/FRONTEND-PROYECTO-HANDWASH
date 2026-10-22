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

  async shiftStatus(accessToken: string): Promise<ShiftView> {
    const response = await fetch('/api/operator?action=shift', {
      method: 'GET', credentials: 'same-origin', cache: 'no-store',
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const payload = await readPayload(response);
    if (!response.ok || !isShift(payload)) throw new Error(messageFor(payload.code, response.status));
    return payload;
  }

  async startShift(accessToken: string, hours: number, protocolo: Protocolo): Promise<ShiftView> {
    const response = await fetch('/api/operator?action=shift', {
      method: 'POST', credentials: 'same-origin', cache: 'no-store',
      headers: {
        Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json',
        'X-CSRF-Token': await csrfToken(),
      },
      body: JSON.stringify({ hours, protocolo }),
    });
    const payload = await readPayload(response);
    if (!response.ok || !isShift(payload) || !payload.active) throw new Error(messageFor(payload.code, response.status));
    return payload;
  }

  async stopShift(accessToken: string): Promise<void> {
    const response = await fetch('/api/operator?action=shift-stop', {
      method: 'POST', credentials: 'same-origin', cache: 'no-store',
      headers: {
        Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json',
        'X-CSRF-Token': await csrfToken(),
      },
      body: '{}',
    });
    if (!response.ok && response.status !== 404) throw new Error(messageFor((await readPayload(response)).code, response.status));
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

export interface ShiftView {
  active: boolean;
  protocolo: Protocolo | null;
  startedAtEpochMs: number | null;
  endsAtEpochMs: number | null;
}

function isShift(value: unknown): value is ShiftView {
  if (typeof value !== 'object' || value === null) return false;
  const shift = value as Record<string, unknown>;
  const epoch = (item: unknown) => item === null || (typeof item === 'number' && Number.isFinite(item));
  return typeof shift.active === 'boolean' && epoch(shift.startedAtEpochMs) && epoch(shift.endsAtEpochMs)
    && (shift.protocolo === null || typeof shift.protocolo === 'string');
}

/**
 * Spanish message for an error from the operator API. A plain HTTP 401 is NOT "invalid code": Spring rejects an
 * unusable Cognito token the same way, so each known server code gets its own explanation and the technical code
 * is appended in brackets, which lets support tell the real cause from one line.
 */
function messageFor(code: unknown, status: number): string {
  const tag = typeof code === 'string' && /^[A-Z0-9_]{3,60}$/.test(code) ? ` [${code}]` : status ? ` [HTTP ${status}]` : '';
  if (code === 'TURNO_YA_ACTIVO') return 'Ya hay un turno activo en este puesto.';
  if (code === 'TURNO_INVALIDO') return 'El turno debe durar entre 1 y 16 horas.';
  if (code === 'OPERADOR_SIN_ASIGNACION') return 'Tu cuenta aún no tiene un puesto asignado.';
  if (code === 'CORREO_NO_COINCIDE') return `El código fue emitido para otro correo verificado. Emite uno para el correo con el que iniciaste sesión.${tag}`;
  if (code === 'CORREO_NO_VERIFICADO') return `Tu cuenta no tiene el correo verificado en Cognito. Pide a ADMIN que lo marque como verificado.${tag}`;
  if (code === 'ID_TOKEN_NO_VALIDO' || code === 'ID_TOKEN_INVALID') {
    return `El token de identidad no es válido o venció. Cierra sesión, vuelve a entrar con MFA y repite.${tag}`;
  }
  if (code === 'CODIGO_OPERADOR_INVALIDO') {
    return `El servidor no reconoce ese código: está mal copiado, ya fue canjeado, fue revocado o venció. Emite uno nuevo en ADMIN y pégalo completo.${tag}`;
  }
  if (code === 'OPERADOR_YA_ASIGNADO') return `Esta cuenta ya tiene un puesto asignado. Recarga la página: debe aparecer "Puesto asignado".${tag}`;
  if (code === 'PUESTO_NO_DISPONIBLE') return `El puesto del código fue revocado o no existe. Emite el código para otro puesto.${tag}`;
  if (code === 'CUENTA_COGNITO_NO_AUTORIZADA') return `Esta cuenta no puede operar puestos.${tag}`;
  if (status === 401) return `El servidor no aceptó tu sesión de Cognito. Cierra sesión y vuelve a entrar con MFA.${tag}`;
  if (status === 403) return `La cuenta no está autorizada para este puesto.${tag}`;
  if (status === 409) return `La asignación ya existe o el puesto tiene una sesión activa.${tag}`;
  if (status === 429) return 'Se alcanzó el límite de intentos. Espera y vuelve a intentar.';
  if (status >= 500) return `Java no está disponible. La sesión no se confirmó.${tag}`;
  return `No se pudo completar la operación. Revisa la solicitud.${tag}`;
}

export const operatorApi = new OperatorApi();
