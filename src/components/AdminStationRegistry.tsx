import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Clipboard, LoaderCircle, Plus, RefreshCw, ShieldX, Unlink } from 'lucide-react';
import { AdminAuditApi, type StationAdminRecord, type StationProvision } from '@/lib/AdminAuditApi';
import { cognitoAdminAuth } from '@/lib/adminAuth';

const api = new AdminAuditApi();

interface AdminStationRegistryProps {
  onSignOut: () => void;
}

export function AdminStationRegistry({ onSignOut }: AdminStationRegistryProps) {
  const [stations, setStations] = useState<StationAdminRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [revoking, setRevoking] = useState<string | null>(null);
  const [binding, setBinding] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [wizardName, setWizardName] = useState('');
  const [wizardProducer, setWizardProducer] = useState('');
  const [wizardEmails, setWizardEmails] = useState('');
  const [provisioned, setProvisioned] = useState<StationProvision | null>(null);

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

  async function provision(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const token = cognitoAdminAuth.getAccessToken();
    if (!token || submitting) return;
    const operatorEmails = wizardEmails.split(/[\s,;]+/).map((email) => email.trim()).filter(Boolean);
    const producerClientId = wizardProducer.trim();
    if (producerClientId && !/^[A-Za-z0-9_-]{1,128}$/.test(producerClientId)) {
      setError('El App client ID del productor RTX solo admite letras, números, guion y guion bajo; nunca el client secret.');
      return;
    }
    setSubmitting(true);
    setError(null);
    setNotice(null);
    setProvisioned(null);
    try {
      const result = await api.provisionStation(token, { stationName: wizardName.trim(), producerClientId, operatorEmails });
      setProvisioned(result);
      setWizardName('');
      setWizardProducer('');
      setWizardEmails('');
      await load();
    } catch (cause) {
      const message = messageOf(cause);
      setError(message);
      if (message.includes('Sesión ADMIN vencida')) onSignOut();
    } finally {
      setSubmitting(false);
    }
  }

  async function reissue(station: StationAdminRecord) {
    const token = cognitoAdminAuth.getAccessToken();
    if (!token || submitting) return;
    setError(null);
    setNotice(null);
    try {
      const result = await api.reissueStationActivation(token, station.stationId);
      setProvisioned({ stationId: station.stationId, stationName: station.stationName,
        producerClientId: station.producerClientId, activationToken: result.code,
        activationExpiresAtEpochMs: result.expiresAtEpochMs, operators: [], operatorFailures: [] });
    } catch {
      setError('No se pudo generar un enlace nuevo. Si el Mac ya activó el puesto, el enlace anterior ya cumplió su función.');
    }
  }

  async function addOperator(station: StationAdminRecord) {
    const email = window.prompt(`Correo del nuevo operador para “${station.stationName}”`)?.trim();
    const token = cognitoAdminAuth.getAccessToken();
    if (!email || !token) return;
    setError(null);
    setNotice(null);
    try {
      const account = await api.createOperatorAccount(token, station.stationId, email);
      setProvisioned({ stationId: station.stationId, stationName: station.stationName,
        producerClientId: station.producerClientId, activationToken: '', activationExpiresAtEpochMs: 0,
        operators: [account], operatorFailures: [] });
    } catch {
      setError('No se pudo crear el operador: revisa el correo, que no exista ya, y que el pool de operadores esté configurado.');
    }
  }

  async function copyText(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setNotice('Copiado al portapapeles.');
    } catch {
      setError('No se pudo copiar automáticamente. Selecciona y copia manualmente.');
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

      <form className="station-code-form" onSubmit={(event) => void provision(event)}>
        <div>
          <label htmlFor="new-station-name">Nombre del puesto</label>
          <input id="new-station-name" value={wizardName} maxLength={80} required
            onChange={(event) => setWizardName(event.target.value)} placeholder="Ej. Lavamanos 1" />
        </div>
        <div>
          <label htmlFor="new-station-producer">App client ID del productor RTX (opcional)</label>
          <input id="new-station-producer" value={wizardProducer} maxLength={128}
            onChange={(event) => setWizardProducer(event.target.value)} placeholder="Cognito App client ID" />
        </div>
        <div>
          <label htmlFor="new-station-operators">Correos de operadores (uno por línea)</label>
          <textarea id="new-station-operators" value={wizardEmails} rows={3}
            onChange={(event) => setWizardEmails(event.target.value)} placeholder="operador@universidad.edu" />
        </div>
        <button className="button-primary" type="submit" disabled={submitting || !wizardName.trim()}>
          {submitting ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          Crear puesto
        </button>
      </form>

      {provisioned && <div className="station-issued-code" role="status" aria-live="polite">
        <div><strong>Puesto “{provisioned.stationName}” listo — se muestra una sola vez</strong>
          {provisioned.activationToken && <span>El enlace vence {new Date(provisioned.activationExpiresAtEpochMs).toLocaleString()}</span>}</div>
        {provisioned.activationToken && <>
          <p>1. En el Mac del puesto abre este enlace:</p>
          <code>{`${window.location.origin}/#/activate/${provisioned.activationToken}`}</code>
          <button className="button-quiet" type="button"
            onClick={() => void copyText(`${window.location.origin}/#/activate/${provisioned.activationToken}`)}>
            <Clipboard className="h-4 w-4" />Copiar enlace
          </button>
        </>}
        {provisioned.operators.length > 0 && <>
          <p>2. Entrega a cada operador su correo y contraseña temporal (la cambia al primer acceso):</p>
          <ul>{provisioned.operators.map((operator) => <li key={operator.subject}>
            <strong>{operator.email}</strong> · <code>{operator.temporaryPassword}</code>{' '}
            <button className="button-quiet" type="button" onClick={() => void copyText(operator.temporaryPassword)}>Copiar</button>
          </li>)}</ul>
        </>}
        {provisioned.operatorFailures.length > 0 && <ul role="alert">{provisioned.operatorFailures.map((failure) =>
          <li key={failure.email}>{failure.email}: {failure.code === 'OPERADOR_YA_EXISTE' ? 'ya existe una cuenta con ese correo'
            : failure.code === 'CORREO_INVALIDO' ? 'correo inválido' : 'no se pudo crear; reintenta con “Agregar operador”'}</li>)}</ul>}
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
                  {revoked ? 'Revocado' : station.activatedAtEpochMs === null ? 'Pendiente de activar' : 'Activo'}
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
                  {!revoked && <button className="button-quiet" type="button" onClick={() => void reissue(station)}>Enlace de activación</button>}
                  {!revoked && <button className="button-quiet" type="button" onClick={() => void addOperator(station)}>Agregar operador</button>}
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
