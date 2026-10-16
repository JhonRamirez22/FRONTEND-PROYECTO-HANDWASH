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

export interface StationAdminRecord {
  stationId: string;
  stationName: string;
  createdAtEpochMs: number;
  createdBy: string;
  revokedAtEpochMs: number | null;
  lastStartedAtEpochMs: number | null;
  activeSessionId: string | null;
  producerClientId: string | null;
}

export interface StationEnrollmentCode {
  code: string;
  expiresAtEpochMs: number;
}

export interface OperatorAccessCode {
  codeId: string;
  stationId: string;
  email: string;
  createdBy: string;
  createdAtEpochMs: number;
  consumedAtEpochMs: number | null;
  consumedBy: string | null;
  revokedAtEpochMs: number | null;
}

export interface OperatorGrant {
  subject: string;
  email: string;
  stationId: string;
  stationName: string;
  grantedBy: string;
  grantedAtEpochMs: number;
  revokedAtEpochMs: number | null;
}

export interface IssuedOperatorAccessCode {
  codeId: string;
  code: string;
  stationId: string;
  email: string;
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

  async stations(token: string): Promise<StationAdminRecord[]> {
    return this.request('/api/v1/admin/stations', token);
  }

  async issueStationCode(token: string, stationName: string): Promise<StationEnrollmentCode> {
    return this.request('/api/v1/admin/stations/enrollment-codes', token, undefined, 'POST', { stationName });
  }

  async revokeStation(token: string, stationId: string): Promise<void> {
    await this.request(`/api/v1/admin/stations/${encodeURIComponent(stationId)}`, token, undefined, 'DELETE');
  }

  async bindStationProducer(token: string, stationId: string, clientId: string): Promise<void> {
    await this.request(`/api/v1/admin/stations/${encodeURIComponent(stationId)}/producer`,
      token, undefined, 'PUT', { clientId });
  }

  async operators(token: string): Promise<OperatorGrant[]> {
    return this.request('/api/v1/admin/operators', token);
  }

  async operatorCodes(token: string): Promise<OperatorAccessCode[]> {
    return this.request('/api/v1/admin/operators/codes', token);
  }

  async issueOperatorCode(token: string, stationId: string, email: string): Promise<IssuedOperatorAccessCode> {
    return this.request('/api/v1/admin/operators/codes', token, undefined, 'POST', { stationId, email });
  }

  async revokeOperatorCode(token: string, codeId: string): Promise<void> {
    await this.request(`/api/v1/admin/operators/codes/${encodeURIComponent(codeId)}`, token, undefined, 'DELETE');
  }

  async revokeOperator(token: string, subject: string): Promise<void> {
    await this.request(`/api/v1/admin/operators/${encodeURIComponent(subject)}`, token, undefined, 'DELETE');
  }

  private async request<T>(path: string, token: string, signal?: AbortSignal,
    method = 'GET', body?: unknown): Promise<T> {
    const response = await fetch(`${RuntimeEndpointConfig.apiBaseUrl()}${path}`, {
      method,
      credentials: 'omit',
      cache: 'no-store',
      signal,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (response.status === 401) throw new Error('Sesión ADMIN vencida. Inicia sesión de nuevo.');
    if (response.status === 403) throw new Error('Tu cuenta no tiene el grupo ADMIN autorizado.');
    if (!response.ok) throw new Error('No fue posible cargar la auditoría. Reintenta más tarde.');
    if (response.status === 204) return undefined as T;
    return response.json() as Promise<T>;
  }
}
