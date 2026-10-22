import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { BarChart3, Download, LoaderCircle } from 'lucide-react';
import { AdminAuditApi, type TrendBucket, type WashTrends } from '@/lib/AdminAuditApi';
import { cognitoAdminAuth } from '@/lib/adminAuth';
import { STEP_LABELS } from '@/types';

const api = new AdminAuditApi();
const DAY_MS = 86_400_000;
const MAX_RANGE_DAYS = 93;
const SHIFT_LABEL = { MANANA: 'Mañana (06–14)', TARDE: 'Tarde (14–22)', NOCHE: 'Noche (22–06)' } as const;

function toDateInput(epochMs: number): string {
  const d = new Date(epochMs);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function startOfLocalDay(value: string): number {
  const [y, m, d] = value.split('-').map(Number);
  return new Date(y!, m! - 1, d!).getTime();
}
const percent = (value: number | null) => (value === null ? '—' : `${value.toLocaleString('es-CO', { maximumFractionDigits: 1 })} %`);
const seconds = (ms: number | null) => (ms === null ? '—' : `${(ms / 1000).toLocaleString('es-CO', { maximumFractionDigits: 1 })} s`);

function Row({ label, bucket }: { label: string; bucket: TrendBucket }) {
  return (
    <tr>
      <th scope="row">{label}</th>
      <td>{bucket.total}</td>
      <td>{bucket.correctos}</td>
      <td>{bucket.reportados}</td>
      <td>{bucket.interrumpidos + bucket.reiniciados}</td>
      <td>
        <span className="trend-bar" role="img" aria-label={`Correctos: ${percent(bucket.porcentajeCorrectos)}`}>
          <i style={{ width: `${bucket.porcentajeCorrectos ?? 0}%` }} />
        </span>
        {percent(bucket.porcentajeCorrectos)}
      </td>
      <td>{seconds(bucket.duracionMediaCorrectosMs)}</td>
    </tr>
  );
}

/** Daily and per-shift trends for infection control, plus the anonymous CSV; Java computes every number. */
export function AdminWashTrends({ onSignOut, now = Date.now }: { onSignOut: () => void; now?: () => number }) {
  const [from, setFrom] = useState(() => toDateInput(now() - 6 * DAY_MS));
  const [to, setTo] = useState(() => toDateInput(now()));
  const [data, setData] = useState<WashTrends | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const request = useRef<AbortController | null>(null);

  const window = useCallback((): { desde: number; hasta: number } | null => {
    const desde = startOfLocalDay(from);
    const hasta = startOfLocalDay(to) + DAY_MS;
    if (!Number.isFinite(desde) || !Number.isFinite(hasta) || desde >= hasta) {
      setError('La fecha inicial debe ser anterior o igual a la final.');
      return null;
    }
    if (hasta - desde > MAX_RANGE_DAYS * DAY_MS) {
      setError(`El rango máximo es de ${MAX_RANGE_DAYS} días.`);
      return null;
    }
    return { desde, hasta };
  }, [from, to]);

  const load = useCallback(async () => {
    const range = window();
    if (!range) return;
    const token = cognitoAdminAuth.getAccessToken();
    if (!token) { onSignOut(); return; }
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setLoading(true);
    setError(null);
    try {
      const next = await api.washTrends(token, range.desde, range.hasta, controller.signal);
      if (!controller.signal.aborted) setData(next);
    } catch (cause) {
      if (controller.signal.aborted) return;
      const message = cause instanceof Error ? cause.message : 'Error inesperado.';
      setError(message);
      if (message.includes('Sesión ADMIN vencida')) onSignOut();
    } finally {
      if (request.current === controller) { request.current = null; setLoading(false); }
    }
  }, [window, onSignOut]);

  const initial = useRef(load);
  useEffect(() => {
    void initial.current();
    return () => request.current?.abort();
  }, []);

  async function download() {
    const range = window();
    if (!range) return;
    const token = cognitoAdminAuth.getAccessToken();
    if (!token) { onSignOut(); return; }
    setError(null);
    try {
      const { blob, filename } = await api.washCsv(token, range.desde, range.hasta);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      link.click();
      URL.revokeObjectURL(url);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Error inesperado.';
      setError(message);
      if (message.includes('Sesión ADMIN vencida')) onSignOut();
    }
  }

  function apply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void load();
  }

  const omitted = data ? Object.entries(data.movimientosOmitidosEnReportados) : [];
  const maxOmitted = Math.max(1, ...omitted.map(([, count]) => count));
  return (
    <section className="admin-data-section" aria-labelledby="trends-title">
      <div className="admin-section-header">
        <div className="admin-section-title"><BarChart3 className="h-4 w-4" /><h2 id="trends-title">Tendencias de lavado</h2></div>
        {loading && <LoaderCircle className="h-4 w-4 animate-spin" aria-label="Cargando" />}
      </div>
      <form className="wash-report-filters" onSubmit={apply} aria-label="Rango de tendencias">
        <label>Desde<input type="date" value={from} max={to} onChange={(event) => setFrom(event.target.value)} required /></label>
        <label>Hasta<input type="date" value={to} min={from} onChange={(event) => setTo(event.target.value)} required /></label>
        <button type="submit" className="button-quiet" disabled={loading}>Aplicar</button>
        <button type="button" className="button-quiet" onClick={() => void download()}><Download size={14} aria-hidden="true" /> Descargar CSV</button>
      </form>
      {error && <p className="wash-report-error" role="alert">{error}</p>}
      {data && data.total.total === 0 && !error && <p className="admin-secondary-empty">No hay lavados finalizados en este rango.</p>}
      {data && data.total.total > 0 && (
        <>
          <p className="wash-report-summary" role="status">
            {percent(data.total.porcentajeCorrectos)} de lavados correctos ({data.total.correctos} de {data.total.correctos + data.total.reportados} atribuibles)
            · {data.total.interrumpidos + data.total.reiniciados} sin contar por causa técnica o reinicio · zona {data.zonaHoraria}
          </p>
          <div className="audit-table-wrap" role="region" aria-label="Tendencias por día y por turno" tabIndex={0}>
            <table className="audit-table">
              <thead><tr><th>Periodo</th><th>Lavados</th><th>Correctos</th><th>Reportados</th><th>Técnicos</th><th>% correctos</th><th>Duración media</th></tr></thead>
              <tbody>
                {data.dias.map((day) => <Row key={day.fecha} label={new Date(`${day.fecha}T12:00:00`).toLocaleDateString('es-CO', { weekday: 'short', day: '2-digit', month: 'short' })} bucket={day.metricas} />)}
                {(Object.keys(SHIFT_LABEL) as (keyof typeof SHIFT_LABEL)[]).map((shift) => <Row key={shift} label={SHIFT_LABEL[shift]} bucket={data.turnos[shift]} />)}
              </tbody>
            </table>
          </div>
          <h3 className="change-control-subtitle">Movimientos que se omiten en lavados reportados</h3>
          <ul className="trend-omitted">
            {omitted.map(([step, count]) => (
              <li key={step}>
                <span>{STEP_LABELS[step as keyof typeof STEP_LABELS] ?? step}</span>
                <span className="trend-bar"><i style={{ width: `${(100 * count) / maxOmitted}%` }} /></span>
                <b>{count}</b>
              </li>
            ))}
          </ul>
        </>
      )}
      <p className="admin-data-footnote">
        El porcentaje cuenta solo lavados que la persona pudo hacer bien o mal (correctos frente a reportados); las fallas técnicas y
        reinicios nunca cuentan en su contra. El CSV es anónimo (sin identificadores ni fotos) y cada descarga queda auditada.
      </p>
    </section>
  );
}
