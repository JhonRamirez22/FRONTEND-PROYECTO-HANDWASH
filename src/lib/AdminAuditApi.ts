import { RuntimeEndpointConfig } from './RuntimeEndpointConfig';

export interface EncounterAuditRecord {
  sessionId: string;
  protocolCode: string;
  status: string;
  startedAtEpochMs: number;
  endedAtEpochMs: number | null;
  modelVersion: string;
  modelSha256: string;
  datasetVersion: string;
  attemptsRestarted: number;
  producerClientId: string | null;
  producerEpoch: string | null;
}

export interface SessionAuditEvent {
  eventId: number;
  sessionId: string | null;
  eventType: string;
  actorSubject: string | null;
  stepCode: string | null;
  decisionCode: string;
  reasonCode: string | null;
  attemptNumber: number | null;
  frameSequence: number | null;
  confidence: number | null;
  occurredAtEpochMs: number;
}

export interface FailedAttemptAuditRecord {
  sessionId: string;
  attemptNumber: number;
  result: string;
  reasonCode: string;
  durationMs: number;
  createdAtEpochMs: number;
}

export class AdminAuditApi {
  async encounters(token: string, limit = 50): Promise<EncounterAuditRecord[]> {
    return this.request(`/api/v1/admin/encounters?limit=${limit}`, token);
  }

  async events(token: string, sessionId: string, limit = 100, signal?: AbortSignal): Promise<SessionAuditEvent[]> {
    return this.request(
      `/api/v1/admin/encounters/${encodeURIComponent(sessionId)}/events?limit=${limit}`,
      token,
      signal,
    );
  }

  async accessEvents(token: string, limit = 50): Promise<SessionAuditEvent[]> {
    return this.request(`/api/v1/admin/access-events?limit=${limit}`, token);
  }

  async failedAttempts(token: string, limit = 50): Promise<FailedAttemptAuditRecord[]> {
    return this.request(`/api/v1/admin/failed-attempts?limit=${limit}`, token);
  }

  private async request<T>(path: string, token: string, signal?: AbortSignal): Promise<T> {
    const response = await fetch(`${RuntimeEndpointConfig.apiBaseUrl()}${path}`, {
      method: 'GET',
      credentials: 'omit',
      cache: 'no-store',
      signal,
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    });
    if (response.status === 401) throw new Error('Sesión ADMIN vencida. Inicia sesión de nuevo.');
    if (response.status === 403) throw new Error('Tu cuenta no tiene el grupo ADMIN autorizado.');
    if (!response.ok) throw new Error('No fue posible cargar la auditoría. Reintenta más tarde.');
    return response.json() as Promise<T>;
  }
}
