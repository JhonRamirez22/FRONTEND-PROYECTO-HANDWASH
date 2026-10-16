import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Check, Clipboard, LoaderCircle, RefreshCw, ShieldCheck, Unlink, UserPlus } from 'lucide-react';
import { AdminAuditApi, type IssuedOperatorAccessCode, type OperatorAccessCode, type OperatorGrant, type StationAdminRecord } from '@/lib/AdminAuditApi';
import { cognitoAdminAuth } from '@/lib/adminAuth';

const api = new AdminAuditApi();

export function AdminOperatorAccess() {
  const [stations, setStations] = useState<StationAdminRecord[]>([]);
  const [grants, setGrants] = useState<OperatorGrant[]>([]);
  const [codes, setCodes] = useState<OperatorAccessCode[]>([]);
  const [stationId, setStationId] = useState('');
  const [email, setEmail] = useState('');
  const [issued, setIssued] = useState<IssuedOperatorAccessCode | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async (signal?: AbortSignal) => {
    const token = cognitoAdminAuth.getAccessToken();
    if (!token) { setError('Sesión ADMIN vencida.'); setLoading(false); return; }
    setLoading(true);
    try {
      const [nextStations, nextGrants, nextCodes] = await Promise.all([
        api.stations(token), api.operators(token), api.operatorCodes(token),
      ]);
      if (signal?.aborted) return;
      setStations(nextStations);
      setGrants(nextGrants);
      setCodes(nextCodes);
      setStationId((current) => current || nextStations.find((item) => item.revokedAtEpochMs === null)?.stationId || '');
      setError(null);
    } catch (cause) {
      if (!signal?.aborted) setError(messageOf(cause));
    } finally { if (!signal?.aborted) setLoading(false); }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  async function issue(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const token = cognitoAdminAuth.getAccessToken();
    if (!token || busy || !stationId) return;
    setBusy(true); setError(null); setNotice(null); setIssued(null); setCopied(false);
    try {
      const result = await api.issueOperatorCode(token, stationId, email.trim());
      setIssued(result);
      setEmail('');
      setNotice('Código emitido. Copíalo ahora; Java no volverá a mostrarlo.');
      await load();
    } catch (cause) { setError(messageOf(cause)); }
    finally { setBusy(false); }
  }

  async function copyCode() {
    if (!issued) return;
    try { await navigator.clipboard.writeText(issued.code); setCopied(true); }
    catch { setError('No se pudo copiar. Selecciona el código y cópialo manualmente.'); }
  }

  async function revokeGrant(grant: OperatorGrant) {
    if (busy || grant.revokedAtEpochMs !== null
      || !window.confirm(`¿Revocar el acceso de ${grant.email} a ${grant.stationName}?`)) return;
    const token = cognitoAdminAuth.getAccessToken();
    if (!token) return;
    setBusy(true); setError(null);
    try {
      await api.revokeOperator(token, grant.subject);
      setNotice(`Acceso revocado para ${grant.email}.`);
      await load();
    } catch (cause) { setError(messageOf(cause)); }
    finally { setBusy(false); }
  }

  async function revokeCode(item: OperatorAccessCode) {
    if (busy || item.consumedAtEpochMs !== null || item.revokedAtEpochMs !== null
      || !window.confirm(`¿Revocar el código pendiente para ${item.email}?`)) return;
    const token = cognitoAdminAuth.getAccessToken();
    if (!token) return;
    setBusy(true); setError(null);
    try {
      await api.revokeOperatorCode(token, item.codeId);
      setNotice(`Código pendiente revocado para ${item.email}.`);
      await load();
    } catch (cause) { setError(messageOf(cause)); }
    finally { setBusy(false); }
  }

  const activeStations = stations.filter((item) => item.revokedAtEpochMs === null);

  return <section className="admin-data-section operator-access-admin" aria-labelledby="operator-access-title">
    <div className="admin-section-header">
      <div className="admin-section-title"><ShieldCheck className="h-4 w-4" /><h2 id="operator-access-title">Accesos de operador</h2></div>
      <button className="button-quiet" type="button" onClick={() => void load()} disabled={loading}>
        {loading ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Actualizar
      </button>
    </div>
    <p className="admin-data-footnote">El código se liga al correo verificado y a un solo puesto; queda guardado únicamente como hash y se muestra una vez. La asignación permanece hasta revocación ADMIN.</p>
    <form className="operator-admin-form" onSubmit={(event) => void issue(event)}>
      <label htmlFor="operator-station-select">Puesto</label>
      <select id="operator-station-select" value={stationId} onChange={(event) => setStationId(event.target.value)} required>
        <option value="">Selecciona un puesto activo</option>
        {activeStations.map((station) => <option key={station.stationId} value={station.stationId}>{station.stationName}</option>)}
      </select>
      <label htmlFor="operator-email">Correo Cognito verificado</label>
      <input id="operator-email" type="email" autoComplete="email" maxLength={254} required
        value={email} onChange={(event) => setEmail(event.target.value)} placeholder="operador@institucion.org" />
      <button className="button-primary" type="submit" disabled={busy || !stationId || activeStations.length === 0}>
        {busy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />} Emitir código de operador
      </button>
    </form>
    {issued && <div className="operator-code-once" role="status">
      <div><strong>Código de un solo uso</strong><span>{issued.email} · {stationName(stations, issued.stationId)}</span></div>
      <code>{issued.code}</code>
      <button className="button-quiet" type="button" onClick={() => void copyCode()}>
        {copied ? <Check size={16} /> : <Clipboard size={16} />}{copied ? 'Copiado' : 'Copiar ahora'}
      </button>
    </div>}
    {notice && <p className="station-admin-notice" role="status">{notice}</p>}
    {error && <p className="form-error" role="alert">{error}</p>}

    <h3 className="operator-admin-subheading">Asignaciones</h3>
    {grants.length === 0 ? <p className="admin-secondary-empty">No hay operadores asignados.</p> : <div className="audit-table-wrap" role="region" aria-label="Asignaciones de operador" tabIndex={0}>
      <table className="audit-table"><thead><tr><th>Correo</th><th>Puesto</th><th>Alta</th><th>Estado</th><th /></tr></thead>
        <tbody>{grants.map((grant) => <tr key={grant.subject}><td>{grant.email}</td><td>{grant.stationName}</td>
          <td>{new Date(grant.grantedAtEpochMs).toLocaleString()}</td><td>{grant.revokedAtEpochMs === null ? 'Activo' : 'Revocado'}</td>
          <td>{grant.revokedAtEpochMs === null && <button className="button-quiet" type="button" disabled={busy}
            onClick={() => void revokeGrant(grant)}><Unlink size={15} /> Revocar</button>}</td></tr>)}</tbody>
      </table></div>}

    <h3 className="operator-admin-subheading">Códigos emitidos</h3>
    {codes.length === 0 ? <p className="admin-secondary-empty">No hay códigos emitidos.</p> : <div className="audit-table-wrap" role="region" aria-label="Códigos de operador" tabIndex={0}>
      <table className="audit-table"><thead><tr><th>Correo</th><th>Puesto</th><th>Emitido</th><th>Estado</th><th /></tr></thead>
        <tbody>{codes.map((item) => <tr key={item.codeId}><td>{item.email}</td><td>{stationName(stations, item.stationId)}</td>
          <td>{new Date(item.createdAtEpochMs).toLocaleString()}</td>
          <td>{item.consumedAtEpochMs !== null ? 'Canjeado' : item.revokedAtEpochMs !== null ? 'Revocado' : 'Pendiente'}</td>
          <td>{item.consumedAtEpochMs === null && item.revokedAtEpochMs === null && <button className="button-quiet" type="button" disabled={busy}
            onClick={() => void revokeCode(item)}><Unlink size={15} /> Revocar</button>}</td></tr>)}</tbody>
      </table></div>}
  </section>;
}

function stationName(stations: StationAdminRecord[], id: string): string {
  return stations.find((station) => station.stationId === id)?.stationName ?? 'Puesto no disponible';
}

function messageOf(error: unknown): string { return error instanceof Error ? error.message : 'No se pudo completar la operación.'; }
