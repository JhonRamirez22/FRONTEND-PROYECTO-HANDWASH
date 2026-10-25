import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Clipboard, KeyRound, LoaderCircle, RefreshCw, Unlink } from 'lucide-react';
import { AdminAuditApi, type ApiKeyCreated, type ApiKeyRecord, type StationAdminRecord } from '@/lib/AdminAuditApi';
import { cognitoAdminAuth } from '@/lib/adminAuth';

const api = new AdminAuditApi();
type Scope = 'CONSOLE' | 'PRODUCER';
const SCOPE_LABEL: Record<Scope, string> = { CONSOLE: 'Consola', PRODUCER: 'PC YOLO' };

interface AdminApiKeysPanelProps { onSignOut: () => void }

export function AdminApiKeysPanel({ onSignOut }: AdminApiKeysPanelProps) {
  const [keys, setKeys] = useState<ApiKeyRecord[]>([]);
  const [stations, setStations] = useState<StationAdminRecord[]>([]);
  const [stationId, setStationId] = useState('');
  const [label, setLabel] = useState('');
  const [console_, setConsole] = useState(true);
  const [producer, setProducer] = useState(true);
  const [created, setCreated] = useState<ApiKeyCreated | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const fail = useCallback((cause: unknown) => {
    const message = cause instanceof Error ? cause.message : 'No se pudo completar la operación.';
    setError(message);
    if (message.includes('Sesión ADMIN vencida')) onSignOut();
  }, [onSignOut]);

  const load = useCallback(async () => {
    const token = cognitoAdminAuth.getAccessToken();
    if (!token) { setLoading(false); setError('Sesión ADMIN vencida. Inicia sesión de nuevo.'); return; }
    setLoading(true);
    setError(null);
    try {
      const [records, stationRecords] = await Promise.all([api.apiKeys(token), api.stations(token)]);
      setKeys(records);
      const active = stationRecords.filter((station) => station.revokedAtEpochMs === null);
      setStations(active);
      setStationId((current) => current || active[0]?.stationId || '');
    } catch (cause) { fail(cause); }
    finally { setLoading(false); }
  }, [fail]);

  useEffect(() => { void load(); }, [load]);

  const scopes: Scope[] = [...(console_ ? ['CONSOLE' as const] : []), ...(producer ? ['PRODUCER' as const] : [])];

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const token = cognitoAdminAuth.getAccessToken();
    if (!token || busy || scopes.length === 0) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      setCreated(await api.createApiKey(token, { stationId, label: label.trim(), scopes }));
      setLabel('');
      await load();
    } catch (cause) { fail(cause); }
    finally { setBusy(false); }
  }

  async function revoke(key: ApiKeyRecord) {
    if (key.revokedAtEpochMs !== null
      || !window.confirm(`¿Revocar la key “${key.label}”? Cortará su acceso de inmediato.`)) return;
    const token = cognitoAdminAuth.getAccessToken();
    if (!token || busy) return;
    setBusy(true);
    setError(null);
    try {
      await api.revokeApiKey(token, key.keyId);
      setNotice(`Key “${key.label}” revocada.`);
      await load();
    } catch (cause) { fail(cause); }
    finally { setBusy(false); }
  }

  async function copy() {
    if (!created) return;
    try { await navigator.clipboard.writeText(created.key); setNotice('Key copiada.'); }
    catch { setError('No se pudo copiar automáticamente. Selecciónala y cópiala a mano.'); }
  }

  return (
    <section className="admin-data-section station-registry" aria-labelledby="api-keys-title">
      <div className="admin-section-header">
        <div className="admin-section-title"><KeyRound className="h-4 w-4" /><h2 id="api-keys-title">API keys</h2></div>
        <button className="button-quiet" type="button" onClick={() => void load()} disabled={loading}>
          {loading ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Actualizar
        </button>
      </div>
      <p className="admin-data-footnote">Una key abre la consola de un puesto y/o conecta el PC con YOLO. Solo ADMIN las crea; se muestran una sola vez y no caducan hasta que las revoques.</p>

      <form className="station-code-form" onSubmit={(event) => void create(event)}>
        <div>
          <label htmlFor="api-key-station">Puesto</label>
          <select id="api-key-station" value={stationId} onChange={(event) => setStationId(event.target.value)} required>
            {stations.map((station) => <option key={station.stationId} value={station.stationId}>{station.stationName}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="api-key-label">Etiqueta (quién la usa)</label>
          <input id="api-key-label" value={label} maxLength={80} required placeholder="Ej. María – turno mañana"
            onChange={(event) => setLabel(event.target.value)} />
        </div>
        <fieldset>
          <legend>Permisos</legend>
          <label><input type="checkbox" checked={console_} onChange={(event) => setConsole(event.target.checked)} /> Consola del operador</label>
          <label><input type="checkbox" checked={producer} onChange={(event) => setProducer(event.target.checked)} /> PC YOLO</label>
        </fieldset>
        <button className="button-primary" type="submit" disabled={busy || !label.trim() || !stationId || scopes.length === 0}>
          {busy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
          Crear API key
        </button>
      </form>

      {created && <div className="station-issued-code" role="status" aria-live="polite">
        <div><strong>Key “{created.label}” — se muestra una sola vez</strong>
          <span>Cópiala ahora y entrégala por un canal privado. No se puede volver a ver.</span></div>
        <code>{created.key}</code>
        <button className="button-quiet" type="button" onClick={() => void copy()}><Clipboard className="h-4 w-4" />Copiar key</button>
        <button className="button-quiet" type="button" onClick={() => setCreated(null)}>Ya la guardé</button>
      </div>}
      {notice && <p className="station-admin-notice" role="status">{notice}</p>}
      {error && <p className="form-error" role="alert">{error}</p>}

      {keys.length === 0 && !loading ? <p className="admin-secondary-empty">Aún no hay API keys.</p> : (
        <div className="audit-table-wrap" role="region" aria-label="API keys. Desplazamiento horizontal disponible." tabIndex={0}>
          <table className="audit-table station-registry-table">
            <thead><tr><th>Etiqueta</th><th>Puesto</th><th>Permisos</th><th>Último uso</th><th>Estado</th><th /></tr></thead>
            <tbody>{keys.map((key) => {
              const revoked = key.revokedAtEpochMs !== null;
              return <tr key={key.keyId}>
                <td><strong>{key.label}</strong><code className="station-id">{key.keyId}</code></td>
                <td>{key.stationName}</td>
                <td>{key.scopes.map((scope) => SCOPE_LABEL[scope]).join(' + ')}</td>
                <td>{key.lastUsedAtEpochMs ? `${new Date(key.lastUsedAtEpochMs).toLocaleString()} · ${key.lastUsedIp ?? ''}` : 'Sin uso todavía'}</td>
                <td><span className={`admin-status-pill ${revoked ? 'admin-status-pill--deleted' : 'admin-status-pill--active'}`}>
                  {revoked ? 'Revocada' : 'Activa'}</span></td>
                <td className="text-right">{!revoked && <button className="button-quiet station-revoke-button" type="button"
                  disabled={busy} onClick={() => void revoke(key)}><Unlink className="h-4 w-4" />Revocar</button>}</td>
              </tr>;
            })}</tbody>
          </table>
        </div>
      )}
    </section>
  );
}
