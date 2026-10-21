import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import {
  ArrowLeft, ArrowUpRight, CircleAlert, ClipboardList, Database, Eye, LoaderCircle,
  RefreshCw, ShieldCheck, ShieldX,
} from 'lucide-react';
import { AdminAuditApi, type EncounterAuditRecord, type FailedAttemptAuditRecord, type SessionAuditEvent } from '../lib/AdminAuditApi';
import { AdminStationRegistry } from './AdminStationRegistry';
import { AdminOperatorAccess } from './AdminOperatorAccess';
import { AdminWashReports } from './AdminWashReports';
import { cognitoAdminAuth } from '../lib/adminAuth';
import { DeploymentStatusService } from '../lib/DeploymentStatusService';
import { AppShell } from './AppShell';

const auditApi = new AdminAuditApi();
const deploymentStatusService = new DeploymentStatusService();

interface AdminAuditPageProps {
  onBack: () => void;
}

type ViewState = 'checking' | 'unconfigured' | 'signed-out' | 'forbidden' | 'loading' | 'ready' | 'error';

export function AdminAuditPage({ onBack }: AdminAuditPageProps) {
  const [view, setView] = useState<ViewState>('checking');
  const [encounters, setEncounters] = useState<EncounterAuditRecord[]>([]);
  const [accessEvents, setAccessEvents] = useState<SessionAuditEvent[]>([]);
  const [failedAttempts, setFailedAttempts] = useState<FailedAttemptAuditRecord[]>([]);
  const [sessionEvents, setSessionEvents] = useState<SessionAuditEvent[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [eventError, setEventError] = useState<string | null>(null);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [environmentLabel, setEnvironmentLabel] = useState('Verificando entorno');
  const callbackHandled = useRef(false);
  const eventsRequest = useRef<AbortController | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    void deploymentStatusService.load(controller.signal)
      .then((status) => setEnvironmentLabel(`Entorno · ${status.mode}`))
      .catch(() => {
        if (!controller.signal.aborted) setEnvironmentLabel('Entorno no verificado');
      });
    return () => {
      controller.abort();
      eventsRequest.current?.abort();
      eventsRequest.current = null;
    };
  }, []);

  const load = useCallback(async (token = cognitoAdminAuth.getAccessToken()) => {
    if (!token) {
      setView('signed-out');
      return;
    }
    if (!cognitoAdminAuth.getHumanRoles().includes('ADMIN')) {
      setView('forbidden');
      return;
    }
    setView('loading');
    setError(null);
    setEventError(null);
    try {
      const [nextEncounters, nextAccessEvents, nextFailedAttempts] = await Promise.all([
        auditApi.encounters(token), auditApi.accessEvents(token), auditApi.failedAttempts(token),
      ]);
      setEncounters(nextEncounters);
      setAccessEvents(nextAccessEvents);
      setFailedAttempts(nextFailedAttempts);
      setView('ready');
    } catch (cause) {
      if (cause instanceof Error && cause.message.includes('inicia sesión de nuevo')) {
        cognitoAdminAuth.clear();
        setView('signed-out');
      } else {
        setError(messageOf(cause));
        setView('error');
      }
    }
  }, []);

  const initialize = useCallback(async () => {
    if (!cognitoAdminAuth.isConfigured()) {
      setView('unconfigured');
      return;
    }
    try {
      await cognitoAdminAuth.completeRedirect();
    } catch (cause) {
      setError(messageOf(cause));
      setView('error');
      return;
    }
    const token = cognitoAdminAuth.getAccessToken();
    if (!token) {
      setView('signed-out');
      return;
    }
    if (!cognitoAdminAuth.getHumanRoles().includes('ADMIN')) {
      setView('forbidden');
      return;
    }
    await load(token);
  }, [load]);

  useEffect(() => {
    if (callbackHandled.current) return;
    callbackHandled.current = true;
    void initialize();
  }, [initialize]);

  async function showEvents(encounter: EncounterAuditRecord) {
    const token = cognitoAdminAuth.getAccessToken();
    if (!token) {
      setView('signed-out');
      return;
    }
    eventsRequest.current?.abort();
    const request = new AbortController();
    eventsRequest.current = request;
    setSelectedId(encounter.sessionId);
    setSessionEvents([]);
    setEventError(null);
    setEventsLoading(true);
    try {
      const nextEvents = await auditApi.events(token, encounter.sessionId, 100, request.signal);
      if (!request.signal.aborted) setSessionEvents(nextEvents);
    } catch (cause) {
      if (request.signal.aborted) return;
      const message = messageOf(cause);
      if (message.includes('Sesión ADMIN vencida')) {
        cognitoAdminAuth.clear();
        setView('signed-out');
      } else {
        setEventError(message);
      }
    } finally {
      if (eventsRequest.current === request) {
        eventsRequest.current = null;
        setEventsLoading(false);
      }
    }
  }

  async function signIn() {
    try {
      await cognitoAdminAuth.beginSignIn();
    } catch (cause) {
      setError(messageOf(cause));
      setView('error');
    }
  }

  const signOut = useCallback(() => {
    eventsRequest.current?.abort();
    eventsRequest.current = null;
    cognitoAdminAuth.signOut();
    setEncounters([]);
    setAccessEvents([]);
    setFailedAttempts([]);
    setSessionEvents([]);
    setSelectedId(null);
    setView('signed-out');
  }, []);

  const roles = cognitoAdminAuth.getHumanRoles();
  const shellRoles = roles.length > 0 ? roles : ['ADMIN' as const];
  const statuses = useMemo(() => [...new Set(encounters.map((item) => item.status))].sort(), [encounters]);
  const filteredEncounters = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    return encounters.filter((item) => {
      const matchesStatus = statusFilter === 'all' || item.status === statusFilter;
      const searchable = [item.sessionId, item.protocolCode, item.modelVersion, item.datasetVersion,
        item.producerClientId ?? ''].join(' ').toLocaleLowerCase();
      return matchesStatus && (!normalizedQuery || searchable.includes(normalizedQuery));
    });
  }, [encounters, query, statusFilter]);

  return (
    <AppShell role="ADMIN" roles={shellRoles} active="audit" environmentLabel={environmentLabel}
      onSignOut={view !== 'signed-out' ? signOut : undefined}>
      <div className="admin-page">
        <div className="page-heading">
          <div>
            <h1>Auditoría</h1>
            <p>Encuentros, intentos y accesos administrativos. Solo lectura.</p>
          </div>
          <div className="topbar-actions">
            {roles.includes('OPERATOR') && (
              <button onClick={onBack} className="button-quiet" type="button"><ArrowLeft size={16} />Estación</button>
            )}
            {view === 'ready' && (
              <button onClick={() => void load()} className="button-quiet" type="button"><RefreshCw size={15} />Actualizar</button>
            )}
          </div>
        </div>

        <section className="admin-context-panel">
          <div className="admin-context-icon">
            <Database className="h-5 w-5" />
          </div>
          <div>
            <h2>Registro de encuentros</h2>
            <p>
              Release de modelo/dataset comparado con la configuración del servidor, `client_id` M2M y epoch del productor. Identifica la credencial lógica, no atesta el hardware. No se guardan imágenes ni video.
            </p>
          </div>
        </section>

        {view === 'ready' && <AdminWashReports onSignOut={signOut} />}
        {view === 'ready' && <AdminStationRegistry onSignOut={signOut} />}
        {view === 'ready' && <AdminOperatorAccess />}

        {view === 'ready' && (
          <div className="audit-filter-row" role="search" aria-label="Filtrar encuentros">
            <input aria-label="Buscar encuentros" value={query} onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar por sesión, modelo o productor" />
            <select aria-label="Filtrar por estado" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
              <option value="all">Todos los estados</option>
              {statuses.map((status) => <option key={status} value={status}>{status.replace(/_/g, ' ')}</option>)}
            </select>
            <span className="admin-result-count">{filteredEncounters.length} de {encounters.length}</span>
          </div>
        )}

        {view === 'unconfigured' && (
          <Notice icon={<ShieldX className="h-5 w-5" />} title="Autenticación ADMIN no configurada">
            Define el dominio de Cognito, el client ID público y la URL de retorno antes de habilitar esta consola.
          </Notice>
        )}
        {view === 'signed-out' && (
          <section className="admin-signed-out">
            <div className="admin-signed-out-icon">
              <ShieldCheck className="h-6 w-6" />
            </div>
            <h2>Acceso de administrador</h2>
            <p>
              Cognito autentica al usuario. El backend verifica el access token y exige pertenecer al grupo ADMIN.
            </p>
            <button onClick={() => void signIn()} className="button-primary admin-sign-in">
              Iniciar sesión segura <ArrowUpRight className="h-4 w-4" />
            </button>
          </section>
        )}
        {view === 'checking' && <LoadingNotice label="Verificando sesión administrativa…" />}
        {view === 'loading' && <LoadingNotice label="Cargando registros auditables…" />}
        {view === 'error' && (
          <Notice icon={<CircleAlert className="h-5 w-5" />} title="No se pudo cargar la auditoría" tone="error">
            {error ?? 'Error inesperado.'}
            <button onClick={() => void load()} className="admin-retry-button">Reintentar</button>
          </Notice>
        )}
        {view === 'forbidden' && (
          <Notice icon={<ShieldX className="h-5 w-5" />} title="Acceso ADMIN requerido" tone="error">
            La cuenta autenticada no pertenece al grupo ADMIN. No se solicitaron datos de auditoría.
          </Notice>
        )}

        {view === 'ready' && (
          <>
            <section className="admin-data-section">
              <div className="admin-section-header">
                <div className="admin-section-title">
                  <ClipboardList className="h-4 w-4" />
                  <h2>Encuentros recientes</h2>
                </div>
                <span className="admin-count">{encounters.length}</span>
              </div>
              {filteredEncounters.length === 0 ? (
                <p className="admin-empty">
                  {encounters.length === 0 ? 'Aún no hay sesiones auditadas.' : 'Ningún encuentro coincide con estos filtros.'}
                </p>
              ) : (
                <div className="audit-table-wrap" role="region" aria-label="Tabla de encuentros. Desplazamiento horizontal disponible." tabIndex={0}>
                  <table className="audit-table">
                    <thead>
                      <tr><th className="px-5 py-3 font-medium">Inicio</th><th className="px-5 py-3 font-medium">Protocolo</th><th className="px-5 py-3 font-medium">Estado</th><th className="px-5 py-3 font-medium">Modelo / dataset</th><th className="px-5 py-3 font-medium">Productor registrado</th><th className="px-5 py-3 font-medium">Reintentos</th><th className="px-5 py-3" /></tr>
                    </thead>
                    <tbody>
                      {filteredEncounters.map((encounter) => (
                        <tr key={encounter.sessionId} className={selectedId === encounter.sessionId ? 'is-selected' : undefined}>
                          <td className="whitespace-nowrap">{formatDate(encounter.startedAtEpochMs)}</td>
                          <td className="font-medium">{encounter.protocolCode}</td>
                          <td><StatusPill status={encounter.status} /></td>
                          <td>
                            <span className="block">{encounter.modelVersion} / {encounter.modelSha256.slice(0, 12)}</span>
                            <span className="mt-1 block text-slate-400">{encounter.datasetVersion}</span>
                          </td>
                          <td>
                            {encounter.producerClientId ? (
                              <><code>{encounter.producerClientId}</code><span className="mt-1 block text-slate-400">epoch {encounter.producerEpoch ?? 'Sin dato'}</span></>
                            ) : 'Sin vincular'}
                          </td>
                          <td className="tabular-nums">{encounter.attemptsRestarted}</td>
                          <td className="text-right">
                            <button onClick={() => void showEvents(encounter)} className="button-quiet" type="button">
                              <Eye className="h-3.5 w-3.5" /> Ver eventos
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            {selectedId && (
              <>
                <p className="selected-audit-session"><span>Sesión seleccionada</span><code>{selectedId}</code></p>
                {eventError && <Notice icon={<CircleAlert className="h-5 w-5" />} title="No se pudieron cargar los eventos" tone="error">{eventError}</Notice>}
                {eventsLoading
                  ? <LoadingNotice label="Cargando eventos…" />
                  : !eventError && <AuditEventList title="Eventos del encuentro" events={sessionEvents} empty="No hay eventos para esta sesión." />}
              </>
            )}
            <AuditEventList title="Accesos ADMIN" events={accessEvents} empty="No hay accesos administrativos registrados." />
            <FailedAttemptList attempts={failedAttempts} />
            <p className="admin-fineprint">
              El panel es de solo lectura: no permite cambiar decisiones, borrar eventos ni recuperar evidencia visual. “Completo” describe el estado registrado del software, no una certificación clínica.
            </p>
          </>
        )}
      </div>
    </AppShell>
  );
}

function FailedAttemptList({ attempts }: { attempts: FailedAttemptAuditRecord[] }) {
  return (
    <section className="admin-data-section">
      <div className="admin-section-header">
        <div className="admin-section-title"><h2>Intentos reiniciados</h2></div>
        <span className="admin-count">{attempts.length}</span>
      </div>
      {attempts.length === 0 ? <p className="admin-secondary-empty">No hay reintentos registrados.</p> : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[680px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr><th className="px-5 py-3 font-medium">Fecha</th><th className="px-5 py-3 font-medium">Sesión</th><th className="px-5 py-3 font-medium">Intento</th><th className="px-5 py-3 font-medium">Motivo</th><th className="px-5 py-3 font-medium">Duración</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {attempts.map((attempt) => (
                <tr key={`${attempt.sessionId}-${attempt.attemptNumber}`}>
                  <td className="whitespace-nowrap px-5 py-3 text-slate-700">{formatDate(attempt.createdAtEpochMs)}</td>
                  <td className="px-5 py-3 font-mono text-xs text-slate-600">{attempt.sessionId}</td>
                  <td className="px-5 py-3 tabular-nums">{attempt.attemptNumber}</td>
                  <td className="px-5 py-3 text-slate-700">{attempt.reasonCode}</td>
                  <td className="px-5 py-3 tabular-nums">{Math.round(attempt.durationMs / 1_000)} s</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="admin-data-footnote">Solo metadatos de reintentos; no se exponen el JSON interno ni texto libre de infracciones.</p>
    </section>
  );
}

function AuditEventList({ title, events, empty }: { title: string; events: SessionAuditEvent[]; empty: string }) {
  return (
    <section className="admin-data-section">
      <div className="admin-section-header">
        <div className="admin-section-title"><h2>{title}</h2></div>
      </div>
      {events.length === 0 ? <p className="admin-secondary-empty">{empty}</p> : (
        <ol className="admin-event-list">
          {events.map((event) => (
            <li key={event.eventId} className="admin-event-row">
              <div>
                <p className="admin-event-title">{event.eventType.replace(/_/g, ' ')}</p>
                <p className="admin-event-meta">
                  {[event.stepCode, event.decisionCode, event.reasonCode,
                    event.actorSubject ? `sub ${event.actorSubject}` : null]
                    .filter(Boolean).join(' / ') || 'Evento de acceso'}
                </p>
              </div>
              <time>{formatDate(event.occurredAtEpochMs)}</time>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function Notice({ icon, title, children, tone = 'neutral' }: {
  icon: ReactNode; title: string; children: ReactNode; tone?: 'neutral' | 'error';
}) {
  return (
    <div role="status" className={`admin-notice ${tone === 'error' ? 'admin-notice--error' : ''}`}>
      <span>{icon}</span>
      <div><p className="admin-notice-title">{title}</p><div className="admin-notice-copy">{children}</div></div>
    </div>
  );
}

function LoadingNotice({ label }: { label: string }) {
  return <div role="status" className="admin-loading">
    <LoaderCircle className="h-5 w-5 animate-spin" /> {label}
  </div>;
}

function StatusPill({ status }: { status: string }) {
  const tone = status === 'COMPLETED' ? 'admin-status-pill--completed'
    : status === 'INTERRUPTED' ? 'admin-status-pill--interrupted'
      : status === 'DELETED' ? 'admin-status-pill--deleted'
        : status === 'ACTIVE' ? 'admin-status-pill--active' : '';
  return <span className={`admin-status-pill ${tone}`}>{status.replace(/_/g, ' ')}</span>;
}

function formatDate(epochMs: number): string {
  return Number.isFinite(epochMs) ? new Date(epochMs).toLocaleString() : 'Sin fecha';
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : 'Error inesperado.';
}
