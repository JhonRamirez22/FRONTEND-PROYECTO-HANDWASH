import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Clipboard, LoaderCircle, Plus, RefreshCw, ShieldX, Unlink } from 'lucide-react';
import { AdminAuditApi, type StationAdminRecord, type StationEnrollmentCode } from '@/lib/AdminAuditApi';
import { cognitoAdminAuth } from '@/lib/adminAuth';

const api = new AdminAuditApi();

interface AdminStationRegistryProps {
  onSignOut: () => void;
}

export function AdminStationRegistry({ onSignOut }: AdminStationRegistryProps) {
  const [stations, setStations] = useState<StationAdminRecord[]>([]);
  const [stationName, setStationName] = useState('');
  const [issued, setIssued] = useState<StationEnrollmentCode | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [revoking, setRevoking] = useState<string | null>(null);
  const [binding, setBinding] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async (signal?: AbortSignal) => {
    const token = cognitoAdminAuth.getAccessToken();
    if (!token) {
      setLoading(false);
      setError('Sesión ADMIN vencida. Inicia sesión de nuevo.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const records = await api.stations(token);
      if (!signal?.aborted) setStations(records);
    } catch (cause) {
      if (signal?.aborted) return;
      const message = messageOf(cause);
      setError(message);
      if (message.includes('Sesión ADMIN vencida')) onSignOut();
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [onSignOut]);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  async function issueCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const token = cognitoAdminAuth.getAccessToken();
    if (!token || submitting) return;
    setSubmitting(true);
    setError(null);
    setNotice(null);
    setIssued(null);
    setCopied(false);
    try {
      const result = await api.issueStationCode(token, stationName.trim());
      setIssued(result);
      setStationName('');
      setNotice('Código creado. Se muestra una sola vez y vence en 10 minutos.');
      await load();
    } catch (cause) {
      const message = messageOf(cause);
      setError(message);
      if (message.includes('Sesión ADMIN vencida')) onSignOut();
    } finally {
      setSubmitting(false);
    }
  }

  async function copyCode() {
    if (!issued) return;
    try {
      await navigator.clipboard.writeText(issued.code);
      setCopied(true);
    } catch {
      setError('No se pudo copiar automáticamente. Selecciona y copia el código manualmente.');
    }
  }

  async function revoke(station: StationAdminRecord) {
    if (station.revokedAtEpochMs !== null || !window.confirm(`¿Revocar el puesto “${station.stationName}”?`)) return;
    const token = cognitoAdminAuth.getAccessToken();
    if (!token || revoking) return;
    setRevoking(station.stationId);
    setError(null);
    setNotice(null);
    try {
      await api.revokeStation(token, station.stationId);
      setNotice(`Puesto “${station.stationName}” revocado.`);
      await load();
    } catch (cause) {
      const message = messageOf(cause);
      setError(message);
      if (message.includes('Sesión ADMIN vencida')) onSignOut();
    } finally {
      setRevoking(null);
    }
  }

  async function bindProducer(station: StationAdminRecord) {
    const clientId = station.producerClientId?.trim() ?? '';
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(clientId)) {
      setError('Ingresa el App client ID Cognito del productor RTX; nunca el client secret.');
      return;
    }
    const token = cognitoAdminAuth.getAccessToken();
    if (!token || binding) return;
    setBinding(station.stationId);
    setError(null);
    setNotice(null);
    try {
      await api.bindStationProducer(token, station.stationId, clientId);
      setNotice(`Productor RTX vinculado a “${station.stationName}”.`);
      await load();
    } catch (cause) {
      const message = messageOf(cause);
      setError(message);
      if (message.includes('Sesión ADMIN vencida')) onSignOut();
    } finally {
      setBinding(null);
    }
  }

  return (
    <section className="admin-data-section station-registry" aria-labelledby="station-registry-title">
      <div className="admin-section-header">
        <div className="admin-section-title"><ShieldX className="h-4 w-4" /><h2 id="station-registry-title">Puestos registrados</h2></div>
        <button className="button-quiet" type="button" onClick={() => void load()} disabled={loading}>
          {loading ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Actualizar
        </button>
      </div>

      <form className="station-code-form" onSubmit={(event) => void issueCode(event)}>
        <div>
          <label htmlFor="new-station-name">Nombre del puesto</label>
          <input id="new-station-name" value={stationName} maxLength={80} required
            onChange={(event) => setStationName(event.target.value)} placeholder="Ej. Lavamanos 1" />
        </div>
        <button className="button-primary" type="submit" disabled={submitting || !stationName.trim()}>
          {submitting ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          Generar código de inscripción
        </button>
      </form>

      {issued && <div className="station-issued-code" role="status" aria-live="polite">
        <div><strong>Código de un solo uso</strong><span>Vence {new Date(issued.expiresAtEpochMs).toLocaleString()}</span></div>
        <code>{issued.code}</code>
        <button className="button-quiet" type="button" onClick={() => void copyCode()}>
          <Clipboard className="h-4 w-4" />{copied ? 'Copiado' : 'Copiar código'}
        </button>
      </div>}
      {notice && <p className="station-admin-notice" role="status">{notice}</p>}
      {error && <p className="form-error" role="alert">{error}</p>}

      {loading && stations.length === 0 ? <div className="admin-loading" role="status">
        <LoaderCircle className="h-5 w-5 animate-spin" />Consultando puestos…
      </div> : stations.length === 0 ? <p className="admin-secondary-empty">No hay puestos registrados.</p> : (
        <div className="audit-table-wrap" role="region" aria-label="Puestos registrados. Desplazamiento horizontal disponible." tabIndex={0}>
          <table className="audit-table station-registry-table">
            <thead><tr><th>Puesto</th><th>Estado</th><th>Último inicio</th><th>Sesión</th><th>App client M2M RTX</th><th /></tr></thead>
            <tbody>{stations.map((station) => {
              const revoked = station.revokedAtEpochMs !== null;
              return <tr key={station.stationId}>
                <td><strong>{station.stationName}</strong><code className="station-id">{station.stationId}</code></td>
                <td><span className={`admin-status-pill ${revoked ? 'admin-status-pill--deleted' : 'admin-status-pill--active'}`}>
                  {revoked ? 'Revocado' : 'Activo'}
                </span></td>
                <td>{station.lastStartedAtEpochMs ? formatDate(station.lastStartedAtEpochMs) : 'Sin actividad'}</td>
                <td>{station.activeSessionId ? <code>{station.activeSessionId}</code> : '—'}</td>
                <td>
                  {!revoked && <div className="flex min-w-56 gap-2">
                    <input aria-label={`App client ID RTX para ${station.stationName}`}
                      value={station.producerClientId ?? ''} maxLength={128}
                      onChange={(event) => setStations((current) => current.map((item) => item.stationId === station.stationId
                        ? { ...item, producerClientId: event.target.value } : item))}
                      placeholder="Cognito App client ID" />
                    <button className="button-quiet" type="button" disabled={binding !== null}
                      onClick={() => void bindProducer(station)}>
                      {binding === station.stationId ? <LoaderCircle className="h-4 w-4 animate-spin" /> : 'Vincular'}
                    </button>
                  </div>}
                </td>
                <td className="text-right">
                  {!revoked && <button className="button-quiet station-revoke-button" type="button"
                    disabled={revoking !== null} onClick={() => void revoke(station)}>
                    {revoking === station.stationId ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Unlink className="h-4 w-4" />}
                    Revocar
                  </button>}
                </td>
              </tr>;
            })}</tbody>
          </table>
        </div>
      )}
      <p className="admin-data-footnote">El client ID no es secreto; el client secret solo se instala como variable protegida en el PC RTX. Revocar impide nuevos inicios del puesto; no borra auditoría.</p>
    </section>
  );
}

function formatDate(epochMs: number): string {
  return Number.isFinite(epochMs) ? new Date(epochMs).toLocaleString() : 'Sin fecha';
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : 'No se pudo completar la operación.';
}
