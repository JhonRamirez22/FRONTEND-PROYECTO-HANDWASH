import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import {
  ArrowLeft, ArrowUpRight, CircleAlert, ClipboardList, Database, Eye, LoaderCircle,
  RefreshCw, ShieldCheck, ShieldX,
} from 'lucide-react';
import { AdminAuditApi, type EncounterAuditRecord, type FailedAttemptAuditRecord, type SessionAuditEvent } from '../lib/AdminAuditApi';
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

  function signOut() {
    eventsRequest.current?.abort();
    eventsRequest.current = null;
    cognitoAdminAuth.signOut();
    setEncounters([]);
    setAccessEvents([]);
    setFailedAttempts([]);
    setSessionEvents([]);
    setSelectedId(null);
    setView('signed-out');
  }

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
      <div className="page-heading">
        <div>
          <h1>Auditoría</h1>
          <p>Encuentros, intentos y accesos administrativos · solo lectura.</p>
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

        <section className="panel panel-padding flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 rounded-lg bg-emerald-50 p-2 text-emerald-700">
              <Database className="h-5 w-5" />
            </div>
            <div>
              <h2 className="font-heading text-base font-semibold">Registro de encuentros</h2>
              <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-600">
                Release de modelo/dataset comparado con la configuración del servidor, `client_id` M2M y epoch del productor. Identifica la credencial lógica, no atesta el hardware. No se guardan imágenes ni video.
              </p>
            </div>
          </div>
        </section>

        {view === 'ready' && (
          <div className="audit-filter-row" role="search" aria-label="Filtrar encuentros">
            <input aria-label="Buscar encuentros" value={query} onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar por sesión, modelo o productor" />
            <select aria-label="Filtrar por estado" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
              <option value="all">Todos los estados</option>
              {statuses.map((status) => <option key={status} value={status}>{status.replace(/_/g, ' ')}</option>)}
            </select>
            <span className="text-xs text-slate-600">{filteredEncounters.length} de {encounters.length}</span>
          </div>
        )}

        {view === 'unconfigured' && (
          <Notice icon={<ShieldX className="h-5 w-5" />} title="Autenticación ADMIN no configurada">
            Define el dominio de Cognito, el client ID público y la URL de retorno antes de habilitar esta consola.
          </Notice>
        )}
        {view === 'signed-out' && (
          <section className="mx-auto max-w-xl rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm sm:p-9">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-700">
              <ShieldCheck className="h-6 w-6" />
            </div>
            <h2 className="mt-4 font-heading text-xl font-semibold">Acceso de administrador</h2>
            <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-slate-600">
              Cognito autentica al usuario. El backend verifica el access token y exige pertenecer al grupo ADMIN.
            </p>
            <button onClick={() => void signIn()} className="mt-6 inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-700">
              Iniciar sesión segura <ArrowUpRight className="h-4 w-4" />
            </button>
          </section>
        )}
        {view === 'checking' && <LoadingNotice label="Verificando sesión administrativa…" />}
        {view === 'loading' && <LoadingNotice label="Cargando registros auditables…" />}
        {view === 'error' && (
          <Notice icon={<CircleAlert className="h-5 w-5" />} title="No se pudo cargar la auditoría" tone="error">
            {error ?? 'Error inesperado.'}
            <button onClick={() => void load()} className="ml-2 inline-flex items-center gap-1 font-semibold underline underline-offset-2">Reintentar</button>
          </Notice>
        )}
        {view === 'forbidden' && (
          <Notice icon={<ShieldX className="h-5 w-5" />} title="Acceso ADMIN requerido" tone="error">
            La cuenta autenticada no pertenece al grupo ADMIN. No se solicitaron datos de auditoría.
          </Notice>
        )}

        {view === 'ready' && (
          <>
            <section className="panel overflow-hidden">
              <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
                <div className="flex items-center gap-2">
                  <ClipboardList className="h-4 w-4 text-slate-500" />
                  <h2 className="font-heading font-semibold">Encuentros recientes</h2>
                </div>
                <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">{encounters.length}</span>
              </div>
              {filteredEncounters.length === 0 ? (
                <p className="px-5 py-10 text-center text-sm text-slate-500">
                  {encounters.length === 0 ? 'Aún no hay sesiones auditadas.' : 'Ningún encuentro coincide con estos filtros.'}
                </p>
              ) : (
                <div className="audit-table-wrap">
                  <table className="audit-table">
                    <thead>
                      <tr><th className="px-5 py-3 font-medium">Inicio</th><th className="px-5 py-3 font-medium">Protocolo</th><th className="px-5 py-3 font-medium">Estado</th><th className="px-5 py-3 font-medium">Modelo / dataset</th><th className="px-5 py-3 font-medium">Productor registrado</th><th className="px-5 py-3 font-medium">Reintentos</th><th className="px-5 py-3" /></tr>
                    </thead>
                    <tbody>
                      {filteredEncounters.map((encounter) => (
                        <tr key={encounter.sessionId} className={selectedId === encounter.sessionId ? 'bg-blue-50' : ''}>
                          <td className="whitespace-nowrap">{formatDate(encounter.startedAtEpochMs)}</td>
                          <td className="font-medium">{encounter.protocolCode}</td>
                          <td><StatusPill status={encounter.status} /></td>
                          <td>
                            <span className="block">{encounter.modelVersion} · {encounter.modelSha256.slice(0, 12)}</span>
                            <span className="mt-1 block text-slate-400">{encounter.datasetVersion}</span>
                          </td>
                          <td>
                            {encounter.producerClientId ? (
                              <><code>{encounter.producerClientId}</code><span className="mt-1 block text-slate-400">epoch {encounter.producerEpoch ?? '—'}</span></>
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
            <p className="text-xs leading-5 text-slate-500">
              El panel es de solo lectura: no permite cambiar decisiones, borrar eventos ni recuperar evidencia visual. “Completo” describe el estado registrado del software, no una certificación clínica.
            </p>
          </>
        )}
    </AppShell>
  );
}

function FailedAttemptList({ attempts }: { attempts: FailedAttemptAuditRecord[] }) {
  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
        <h2 className="font-heading font-semibold">Intentos reiniciados</h2>
        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">{attempts.length}</span>
      </div>
      {attempts.length === 0 ? <p className="px-5 py-7 text-sm text-slate-500">No hay reintentos registrados.</p> : (
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
      <p className="border-t border-slate-100 px-5 py-3 text-xs text-slate-500">Solo metadatos de reintentos; no se exponen el JSON interno ni texto libre de infracciones.</p>
    </section>
  );
}

function AuditEventList({ title, events, empty }: { title: string; events: SessionAuditEvent[]; empty: string }) {
  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 px-5 py-4">
        <h2 className="font-heading font-semibold">{title}</h2>
      </div>
      {events.length === 0 ? <p className="px-5 py-7 text-sm text-slate-500">{empty}</p> : (
        <ol className="divide-y divide-slate-100">
          {events.map((event) => (
            <li key={event.eventId} className="flex flex-wrap items-start justify-between gap-x-6 gap-y-2 px-5 py-3.5">
              <div>
                <p className="text-sm font-medium text-slate-800">{event.eventType.replace(/_/g, ' ')}</p>
                <p className="mt-1 text-xs text-slate-500">
                  {[event.stepCode, event.decisionCode, event.reasonCode,
                    event.actorSubject ? `sub ${event.actorSubject}` : null]
                    .filter(Boolean).join(' · ') || 'Evento de acceso'}
                </p>
              </div>
              <time className="text-xs tabular-nums text-slate-500">{formatDate(event.occurredAtEpochMs)}</time>
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
  const color = tone === 'error'
    ? 'border-rose-200 bg-rose-50 text-rose-800'
    : 'border-amber-200 bg-amber-50 text-amber-900';
  return (
    <div role="status" className={`flex items-start gap-3 rounded-xl border p-4 text-sm leading-6 ${color}`}>
      <span className="mt-0.5 shrink-0">{icon}</span>
      <div><p className="font-semibold">{title}</p><div className="mt-1">{children}</div></div>
    </div>
  );
}

function LoadingNotice({ label }: { label: string }) {
  return <div role="status" className="flex items-center justify-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-10 text-sm text-slate-600">
    <LoaderCircle className="h-5 w-5 animate-spin" /> {label}
  </div>;
}

function StatusPill({ status }: { status: string }) {
  const style = status === 'COMPLETED' ? 'bg-emerald-50 text-emerald-800'
    : status === 'INTERRUPTED' ? 'bg-amber-50 text-amber-800'
      : status === 'DELETED' ? 'bg-slate-100 text-slate-700'
        : 'bg-cyan-50 text-cyan-800';
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${style}`}>{status.replace(/_/g, ' ')}</span>;
}

function formatDate(epochMs: number): string {
  return Number.isFinite(epochMs) ? new Date(epochMs).toLocaleString() : '—';
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : 'Error inesperado.';
}
