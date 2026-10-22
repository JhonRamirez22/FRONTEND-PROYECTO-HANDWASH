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

export type WashOutcome = 'CORRECTO' | 'REPORTADO' | 'REINICIADO' | 'INTERRUMPIDO';

export interface WashReportStep {
  paso: string;
  estado: 'PENDIENTE' | 'EN_CURSO' | 'VALIDADO' | 'REQUIERE_REPETICION';
  tiempoAcreditadoMs: number;
  minimoRequeridoMs: number;
  motivo: string | null;
}

export interface WashReportRecord {
  sessionId: string;
  attemptNumber: number;
  policyVersion: string;
  resultado: WashOutcome;
  motivo: string | null;
  inicioEpochMs: number | null;
  finEpochMs: number | null;
  duracionMs: number | null;
  lento: boolean;
  estadoEvidencia: 'DESACTIVADA' | 'PENDIENTE' | 'NO_CAPTURADA' | 'CAPTURADA' | 'EXPIRADA' | null;
  pasos: WashReportStep[];
}

export interface EvidenceSettings {
  /** Deployment flag and bucket/key present; without it the switch cannot be turned on. */
  deploymentEnabled: boolean;
  configured: boolean;
  switchOn: boolean;
  captureActive: boolean;
  retentionDays: number;
  updatedBy: string;
  updatedAtEpochMs: number;
}

export interface AuditChainProblem { eventId: number | null; code: string }
export interface AuditSeal {
  sealId: number; sealedAtEpochMs: number; toEventId: number | null; headHash: string; eventCount: number;
  resultsCount: number; keyed: boolean; objectKey: string | null;
}
export interface AuditChainStatus {
  chain: {
    ok: boolean; keyed: boolean; checked: number; firstChainedEventId: number | null; lastEventId: number | null;
    headHash: string; matchesLatestSeal: boolean; problems: AuditChainProblem[];
  };
  resultsMatchLatestSeal: boolean;
  seals: AuditSeal[];
}

export interface ProfileChange {
  perfil: { version: number; tiemposPasoMs: Record<string, number>; duracionTotalMs: number; umbralLentoMs: number;
    creadoPor: string; creadoEnEpochMs: number };
  motivo: string | null;
  revertidoDe: number | null;
  estado: 'ACTIVE' | 'PENDING' | 'REJECTED';
  decididoPor: string | null;
  decididoEnEpochMs: number | null;
  conInformeDeValidacion: boolean;
}
export interface ModelStatus {
  model: { modelSha256: string; modelVersion: string; datasetVersion: string; firstSeenEpochMs: number;
    lastSeenEpochMs: number; encounters: number; reports: number };
  evidencia: 'SIN_EVIDENCIA' | 'CON_INFORME';
}
export interface ValidationReport {
  reportId: number; modelSha256: string; profileVersion: number | null; title: string; summary: string;
  documentSha256: string; createdBy: string; createdAtEpochMs: number;
}
export interface ChangeControlOverview {
  ajustes: { secondApproverRequired: boolean; updatedBy: string; updatedAtEpochMs: number };
  vigente: ProfileChange | null;
  cambios: ProfileChange[];
  modelos: ModelStatus[];
  informes: ValidationReport[];
}
export interface ValidationReportInput {
  modeloSha256: string; versionPerfil: number | null; titulo: string; resumen: string; documentoSha256: string;
}

export interface TrendBucket {
  total: number; correctos: number; reportados: number; reiniciados: number; interrumpidos: number; lentos: number;
  duracionMediaCorrectosMs: number | null; porcentajeCorrectos: number | null;
}
export interface WashTrends {
  zonaHoraria: string;
  total: TrendBucket;
  dias: { fecha: string; metricas: TrendBucket }[];
  turnos: Record<'MANANA' | 'TARDE' | 'NOCHE', TrendBucket>;
  movimientosOmitidosEnReportados: Record<string, number>;
}

export interface WashReportFilter {
  desde: number;
  hasta: number;
  resultado: WashOutcome | null;
  limit: number;
}

export class AdminAuditApi {
  async washReports(token: string, filter: WashReportFilter, signal?: AbortSignal): Promise<WashReportRecord[]> {
    const params = new URLSearchParams({
      desde: String(filter.desde), hasta: String(filter.hasta), limit: String(filter.limit),
    });
    if (filter.resultado) params.set('resultado', filter.resultado);
    return this.request(`/api/v1/admin/wash-reports?${params.toString()}`, token, signal);
  }

  async washTrends(token: string, desde: number, hasta: number, signal?: AbortSignal): Promise<WashTrends> {
    return this.request(`/api/v1/admin/wash-stats/trends?desde=${desde}&hasta=${hasta}`, token, signal);
  }

  /** Anonymous CSV of finished washes; the server audits every export and sets the file name. */
  async washCsv(token: string, desde: number, hasta: number): Promise<{ blob: Blob; filename: string }> {
    const response = await fetch(`${RuntimeEndpointConfig.apiBaseUrl()}/api/v1/admin/wash-stats/export.csv?desde=${desde}&hasta=${hasta}`, {
      method: 'GET', credentials: 'omit', cache: 'no-store',
      headers: { Authorization: `Bearer ${token}`, Accept: 'text/csv' },
    });
    if (response.status === 401) throw new Error('Sesión ADMIN vencida. Inicia sesión de nuevo.');
    if (response.status === 400) throw new Error('El rango tiene demasiados lavados o fechas inválidas. Acótalo.');
    if (!response.ok) throw new Error('No fue posible generar el archivo. Reintenta más tarde.');
    const disposition = response.headers.get('content-disposition') ?? '';
    const filename = /filename="([A-Za-z0-9_.-]+)"/.exec(disposition)?.[1] ?? 'handwash-lavados.csv';
    return { blob: await response.blob(), filename };
  }

  async changeControl(token: string, signal?: AbortSignal): Promise<ChangeControlOverview> {
    return this.request('/api/v1/admin/change-control', token, signal);
  }

  async revertProfile(token: string, version: number, motivo: string): Promise<ProfileChange> {
    return this.request(`/api/v1/admin/change-control/profile/${version}/revert`, token, undefined, 'POST', { motivo });
  }

  async decideProfile(token: string, version: number, decision: 'approve' | 'reject'): Promise<ProfileChange> {
    return this.request(`/api/v1/admin/change-control/profile/${version}/${decision}`, token, undefined, 'POST');
  }

  async setSecondApprover(token: string, required: boolean): Promise<void> {
    await this.request('/api/v1/admin/change-control/settings', token, undefined, 'PUT', { segundoAprobadorRequerido: required });
  }

  async registerValidationReport(token: string, input: ValidationReportInput): Promise<ValidationReport> {
    return this.request('/api/v1/admin/change-control/validation-reports', token, undefined, 'POST', input);
  }

  /** Recomputes the whole hash chain on the server; the read itself is audited. */
  async auditChain(token: string, signal?: AbortSignal): Promise<AuditChainStatus> {
    return this.request('/api/v1/admin/audit-chain', token, signal);
  }

  async sealAuditChain(token: string): Promise<AuditSeal | null> {
    return this.request('/api/v1/admin/audit-chain/seal', token, undefined, 'POST');
  }

  async evidenceSettings(token: string, signal?: AbortSignal): Promise<EvidenceSettings> {
    return this.request('/api/v1/admin/evidence', token, signal);
  }

  async setEvidenceEnabled(token: string, enabled: boolean): Promise<EvidenceSettings> {
    return this.request('/api/v1/admin/evidence', token, undefined, 'PUT', { enabled });
  }

  /** Streams the private photo through Java so every view is audited; no public or presigned URL exists. */
  async evidencePhoto(token: string, sessionId: string, attemptNumber: number, signal?: AbortSignal): Promise<Blob> {
    const response = await fetch(`${RuntimeEndpointConfig.apiBaseUrl()}/api/v1/admin/evidence/`
      + `${encodeURIComponent(sessionId)}/${attemptNumber}/photo`, {
      method: 'GET', credentials: 'omit', cache: 'no-store', signal,
      headers: { Authorization: `Bearer ${token}`, Accept: 'image/jpeg' },
    });
    if (response.status === 401) throw new Error('Sesión ADMIN vencida. Inicia sesión de nuevo.');
    if (response.status === 404) throw new Error('La foto ya no existe (venció su retención).');
    if (!response.ok) throw new Error('No fue posible abrir la foto. Reintenta más tarde.');
    return response.blob();
  }

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
