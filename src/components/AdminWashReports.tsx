import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { Check, ClipboardCheck, LoaderCircle, RefreshCw, X } from 'lucide-react';
import { AdminAuditApi, type WashOutcome, type WashReportRecord } from '@/lib/AdminAuditApi';
import { cognitoAdminAuth } from '@/lib/adminAuth';
import { STEP_LABELS } from '@/types';

const api = new AdminAuditApi();
const DAY_MS = 86_400_000;
const MAX_RANGE_DAYS = 93;
const OUTCOME_LABELS: Record<WashOutcome, string> = {
  CORRECTO: 'Correcto', REPORTADO: 'Reportado', REINICIADO: 'Reiniciado', INTERRUMPIDO: 'Interrumpido (técnico)',
};
const OUTCOME_TONES: Record<WashOutcome, string> = {
  CORRECTO: 'admin-status-pill--completed', REPORTADO: 'admin-status-pill--reported',
  REINICIADO: 'admin-status-pill--interrupted', INTERRUMPIDO: 'admin-status-pill--deleted',
};

/** yyyy-mm-dd in the browser's local time zone. */
function toDateInput(epochMs: number): string {
  const date = new Date(epochMs);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function startOfLocalDay(value: string): number {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year!, month! - 1, day!).getTime();
}

function formatExact(epochMs: number | null): string {
  return epochMs == null ? 'Sin dato'
    : new Date(epochMs).toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'medium' });
}

function formatDuration(ms: number | null): string {
  return ms == null ? '—' : `${(ms / 1000).toLocaleString('es-CO', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} s`;
}

interface AdminWashReportsProps {
  onSignOut: () => void;
  now?: () => number;
}

/** Read-only list of finished washes with exact times; Java decides every outcome. */
export function AdminWashReports({ onSignOut, now = Date.now }: AdminWashReportsProps) {
  const [from, setFrom] = useState(() => toDateInput(now() - 6 * DAY_MS));
  const [to, setTo] = useState(() => toDateInput(now()));
  const [outcome, setOutcome] = useState<WashOutcome | ''>('');
  const [reports, setReports] = useState<WashReportRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const request = useRef<AbortController | null>(null);

  const load = useCallback(async () => {
    const desde = startOfLocalDay(from);
    const hasta = startOfLocalDay(to) + DAY_MS;
    if (!Number.isFinite(desde) || !Number.isFinite(hasta) || desde >= hasta) {
      setError('La fecha inicial debe ser anterior o igual a la final.');
      return;
    }
    if (hasta - desde > MAX_RANGE_DAYS * DAY_MS) {
      setError(`El rango máximo es de ${MAX_RANGE_DAYS} días.`);
      return;
    }
    const token = cognitoAdminAuth.getAccessToken();
    if (!token) {
      onSignOut();
      return;
    }
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setLoading(true);
    setError(null);
    try {
      const next = await api.washReports(token,
        { desde, hasta, resultado: outcome || null, limit: 100 }, controller.signal);
      if (!controller.signal.aborted) setReports(next);
    } catch (cause) {
      if (controller.signal.aborted) return;
      const message = cause instanceof Error ? cause.message : 'Error inesperado.';
      setError(message);
      if (message.includes('Sesión ADMIN vencida')) onSignOut();
    } finally {
      if (request.current === controller) {
        request.current = null;
        setLoading(false);
      }
    }
  }, [from, to, outcome, onSignOut]);

  // Load once on mount; later loads run when the ADMIN applies the filters.
  const initial = useRef(load);
  useEffect(() => {
    void initial.current();
    return () => request.current?.abort();
  }, []);

  function apply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void load();
  }

  const reported = reports.filter((item) => item.resultado === 'REPORTADO').length;
  const correct = reports.filter((item) => item.resultado === 'CORRECTO').length;

  return (
    <section className="admin-data-section" aria-labelledby="wash-reports-title">
      <div className="admin-section-header">
        <div className="admin-section-title">
          <ClipboardCheck className="h-4 w-4" />
          <h2 id="wash-reports-title">Lavados registrados</h2>
        </div>
        <span className="admin-count" aria-label={`${reports.length} lavados`}>{reports.length}</span>
      </div>
      <form className="wash-report-filters" onSubmit={apply} aria-label="Filtrar lavados">
        <label>Desde<input type="date" value={from} max={to} onChange={(event) => setFrom(event.target.value)} required /></label>
        <label>Hasta<input type="date" value={to} min={from} onChange={(event) => setTo(event.target.value)} required /></label>
        <label>Resultado
          <select value={outcome} onChange={(event) => setOutcome(event.target.value as WashOutcome | '')}>
            <option value="">Todos</option>
            {(Object.keys(OUTCOME_LABELS) as WashOutcome[]).map((value) => <option key={value} value={value}>{OUTCOME_LABELS[value]}</option>)}
          </select>
        </label>
        <button type="submit" className="button-quiet" disabled={loading}>
          {loading ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Aplicar
        </button>
      </form>
      {error && <p className="wash-report-error" role="alert">{error}</p>}
      {!error && !loading && reports.length > 0 && (
        <p className="wash-report-summary" role="status">
          {correct} correctos · {reported} reportados · {reports.length - correct - reported} otros
          {reports.length === 100 && ' · se muestran los 100 más recientes; acota el rango'}
        </p>
      )}
      {loading && reports.length === 0 ? (
        <p className="admin-secondary-empty" role="status">Cargando lavados…</p>
      ) : reports.length === 0 && !error ? (
        <p className="admin-secondary-empty">No hay lavados finalizados en este rango.</p>
      ) : reports.length > 0 && (
        <div className="audit-table-wrap" role="region" aria-label="Tabla de lavados. Desplazamiento horizontal disponible." tabIndex={0}>
          <table className="audit-table">
            <thead>
              <tr><th>Fin (hora exacta)</th><th>Resultado</th><th>Duración</th><th>Movimientos</th><th>Foto</th><th>Inicio</th><th>Sesión</th></tr>
            </thead>
            <tbody>
              {reports.map((report) => {
                const missing = report.pasos.filter((step) => step.estado !== 'VALIDADO');
                return (
                  <tr key={`${report.sessionId}-${report.attemptNumber}`}>
                    <td className="whitespace-nowrap tabular-nums">{formatExact(report.finEpochMs)}</td>
                    <td><span className={`admin-status-pill ${OUTCOME_TONES[report.resultado]}`}>{OUTCOME_LABELS[report.resultado]}</span></td>
                    <td className="whitespace-nowrap tabular-nums">
                      {formatDuration(report.duracionMs)}
                      {report.lento && <span className="wash-report-slow">Lento</span>}
                    </td>
                    <td>
                      <span className="wash-report-steps">
                        {missing.length === 0 ? <Check size={14} aria-hidden="true" /> : <X size={14} aria-hidden="true" />}
                        {report.pasos.length - missing.length}/{report.pasos.length}
                      </span>
                      {missing.length > 0 && (
                        <span className="mt-1 block text-slate-500">
                          Faltó: {missing.map((step) => STEP_LABELS[step.paso] ?? step.paso).join(', ')}
                        </span>
                      )}
                    </td>
                    <td>{report.resultado !== 'REPORTADO' ? '—'
                      : report.estadoEvidencia === 'CAPTURADA' ? 'Capturada'
                        : report.estadoEvidencia === 'NO_CAPTURADA' ? 'No capturada' : 'Desactivada'}</td>
                    <td className="whitespace-nowrap tabular-nums">{formatExact(report.inicioEpochMs)}</td>
                    <td><code>{report.sessionId.slice(0, 8)}</code> · #{report.attemptNumber}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="admin-data-footnote">
        “Reportado” significa que la persona inició el lavado y se fue sin validar los seis movimientos. Las fallas técnicas
        se registran como “Interrumpido” y nunca como reporte. La captura de foto está desactivada hasta tener cámara de
        presencia y aprobación institucional.
      </p>
    </section>
  );
}
