import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { GitCompareArrows, LoaderCircle, Undo2 } from 'lucide-react';
import { AdminAuditApi, type ChangeControlOverview, type ProfileChange } from '@/lib/AdminAuditApi';
import { cognitoAdminAuth } from '@/lib/adminAuth';

const api = new AdminAuditApi();
const STATE_LABEL: Record<ProfileChange['estado'], string> = { ACTIVE: 'En vigor / vigente antes', PENDING: 'Pendiente de aprobación', REJECTED: 'Rechazada' };
const ERROR_TEXT: Record<string, string> = {
  MOTIVO_INVALIDO: 'Escribe un motivo de 10 a 200 caracteres.',
  SE_REQUIERE_OTRO_ADMIN: 'Otro ADMIN debe aprobar este cambio.',
  VERSION_NO_PENDIENTE: 'Esa versión ya fue decidida.',
  MODELO_DESCONOCIDO: 'Ese modelo no aparece en el registro.',
  HASH_INVALIDO: 'El hash debe tener 64 caracteres hexadecimales.',
  INFORME_INVALIDO: 'Revisa el título (3–120) y el resumen (10–500).',
};

function dateText(epochMs: number | null): string {
  return epochMs ? new Date(epochMs).toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' }) : '—';
}

/** Profile history with reasons, one-click rollback, approvals and the model-evidence registry (R-16, R-17). */
export function AdminChangeControlPanel({ onSignOut }: { onSignOut: () => void }) {
  const [data, setData] = useState<ChangeControlOverview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [revertTarget, setRevertTarget] = useState<number | null>(null);
  const [reason, setReason] = useState('');
  const [report, setReport] = useState({ modeloSha256: '', versionPerfil: '', titulo: '', resumen: '', documentoSha256: '' });

  const run = useCallback(async (action: (token: string) => Promise<unknown>) => {
    const token = cognitoAdminAuth.getAccessToken();
    if (!token) { onSignOut(); return false; }
    setBusy(true);
    setError(null);
    try {
      await action(token);
      setData(await api.changeControl(token));
      return true;
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Error inesperado.';
      setError(ERROR_TEXT[message] ?? message);
      if (message.includes('Sesión ADMIN vencida')) onSignOut();
      return false;
    } finally {
      setBusy(false);
    }
  }, [onSignOut]);

  useEffect(() => { void run(async () => undefined); }, [run]);

  async function submitRevert(event: FormEvent) {
    event.preventDefault();
    if (revertTarget === null) return;
    const ok = await run((token) => api.revertProfile(token, revertTarget, reason));
    if (ok) { setRevertTarget(null); setReason(''); }
  }

  async function submitReport(event: FormEvent) {
    event.preventDefault();
    const ok = await run((token) => api.registerValidationReport(token, {
      ...report, versionPerfil: report.versionPerfil ? Number(report.versionPerfil) : null,
    }));
    if (ok) setReport({ modeloSha256: '', versionPerfil: '', titulo: '', resumen: '', documentoSha256: '' });
  }

  if (!data) return error ? <p className="wash-report-error" role="alert">{error}</p> : null;
  return (
    <section className="admin-data-section" aria-labelledby="change-control-title">
      <div className="admin-section-header">
        <div className="admin-section-title"><GitCompareArrows className="h-4 w-4" /><h2 id="change-control-title">Control de cambios</h2></div>
        {busy && <LoaderCircle className="h-4 w-4 animate-spin" aria-label="Cargando" />}
      </div>
      {error && <p className="wash-report-error" role="alert">{error}</p>}

      <div className="evidence-switch">
        <div>
          <strong>Segundo aprobador: {data.ajustes.secondApproverRequired ? 'exigido' : 'no exigido'}</strong>
          <span>Actívalo cuando exista un segundo ADMIN: los cambios de perfil quedan pendientes hasta que otra persona los apruebe.
            Si lo activas con un solo ADMIN, ningún cambio podrá aprobarse.</span>
        </div>
        <button type="button" className="button-quiet" disabled={busy}
          onClick={() => void run((token) => api.setSecondApprover(token, !data.ajustes.secondApproverRequired))}>
          {data.ajustes.secondApproverRequired ? 'Dejar de exigirlo' : 'Exigir segundo aprobador'}
        </button>
      </div>

      <h3 className="change-control-subtitle">Versiones del perfil de lavado</h3>
      <div className="audit-table-wrap" role="region" aria-label="Historial de versiones del perfil" tabIndex={0}>
        <table className="audit-table">
          <thead><tr><th>Versión</th><th>Fecha</th><th>Autor</th><th>Motivo</th><th>Estado</th><th>Informe</th><th>Acción</th></tr></thead>
          <tbody>
            {data.cambios.map((change) => {
              const isCurrent = data.vigente?.perfil.version === change.perfil.version;
              return (
                <tr key={change.perfil.version}>
                  <td>v{change.perfil.version}{isCurrent && <strong> · vigente</strong>}{change.revertidoDe !== null && <small> (copia de v{change.revertidoDe})</small>}</td>
                  <td className="whitespace-nowrap">{dateText(change.perfil.creadoEnEpochMs)}</td>
                  <td>{change.perfil.creadoPor === 'SYSTEM' ? 'Sistema' : change.perfil.creadoPor.slice(0, 8)}</td>
                  <td>{change.motivo ?? '—'}<small className="block text-slate-500">{(change.perfil.duracionTotalMs / 1000).toLocaleString('es-CO')} s en total</small></td>
                  <td>{STATE_LABEL[change.estado]}{change.decididoPor && <small className="block">por {change.decididoPor.slice(0, 8)}</small>}</td>
                  <td>{change.conInformeDeValidacion ? 'Con informe' : 'Sin informe'}</td>
                  <td>
                    {change.estado === 'PENDING' && (
                      <span className="audit-chain-actions">
                        <button type="button" className="button-quiet" disabled={busy} onClick={() => void run((t) => api.decideProfile(t, change.perfil.version, 'approve'))}>Aprobar</button>
                        <button type="button" className="button-quiet" disabled={busy} onClick={() => void run((t) => api.decideProfile(t, change.perfil.version, 'reject'))}>Rechazar</button>
                      </span>
                    )}
                    {change.estado === 'ACTIVE' && !isCurrent && (
                      <button type="button" className="button-quiet" disabled={busy} onClick={() => { setRevertTarget(change.perfil.version); setReason(''); }}>
                        <Undo2 size={14} aria-hidden="true" /> Revertir a v{change.perfil.version}
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {revertTarget !== null && (
        <form className="change-control-form" onSubmit={(event) => void submitRevert(event)} aria-label={`Revertir a la versión ${revertTarget}`}>
          <label>Motivo de la reversión a v{revertTarget}
            <input value={reason} onChange={(event) => setReason(event.target.value)} maxLength={200} required minLength={10} autoFocus />
          </label>
          <button type="submit" className="button-quiet" disabled={busy}>Confirmar reversión</button>
          <button type="button" className="button-quiet" onClick={() => setRevertTarget(null)}>Cancelar</button>
        </form>
      )}

      <h3 className="change-control-subtitle">Modelos y evidencia</h3>
      <div className="audit-table-wrap" role="region" aria-label="Modelos registrados" tabIndex={0}>
        <table className="audit-table">
          <thead><tr><th>Modelo</th><th>Dataset</th><th>SHA-256</th><th>Lavados</th><th>Evidencia</th></tr></thead>
          <tbody>
            {data.modelos.length === 0 && <tr><td colSpan={5}>Aún no hay modelos registrados.</td></tr>}
            {data.modelos.map((item) => (
              <tr key={`${item.model.modelSha256}-${item.model.modelVersion}`}>
                <td>{item.model.modelVersion}</td>
                <td>{item.model.datasetVersion}</td>
                <td><code>{item.model.modelSha256.slice(0, 12)}…</code></td>
                <td>{item.model.encounters}</td>
                <td><span className={`admin-status-pill ${item.evidencia === 'SIN_EVIDENCIA' ? 'admin-status-pill--reported' : 'admin-status-pill--completed'}`}>
                  {item.evidencia === 'SIN_EVIDENCIA' ? 'Sin evidencia' : 'Con informe'}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="admin-data-footnote">Un informe registrado demuestra que existe una medición; no aprueba el modelo ni vuelve clínico al sistema.</p>

      <form className="change-control-form" onSubmit={(event) => void submitReport(event)} aria-label="Registrar informe de validación">
        <label>Modelo
          <select value={report.modeloSha256} onChange={(event) => setReport({ ...report, modeloSha256: event.target.value })} required>
            <option value="">Elige un modelo</option>
            {data.modelos.map((item) => <option key={item.model.modelSha256} value={item.model.modelSha256}>{item.model.modelVersion} · {item.model.modelSha256.slice(0, 8)}</option>)}
          </select>
        </label>
        <label>Versión del perfil (opcional)
          <input type="number" min={1} value={report.versionPerfil} onChange={(event) => setReport({ ...report, versionPerfil: event.target.value })} />
        </label>
        <label>Título<input value={report.titulo} onChange={(event) => setReport({ ...report, titulo: event.target.value })} minLength={3} maxLength={120} required /></label>
        <label>Resumen de resultados<input value={report.resumen} onChange={(event) => setReport({ ...report, resumen: event.target.value })} minLength={10} maxLength={500} required /></label>
        <label>SHA-256 del documento<input value={report.documentoSha256} onChange={(event) => setReport({ ...report, documentoSha256: event.target.value })} pattern="[0-9a-fA-F]{64}" required /></label>
        <button type="submit" className="button-quiet" disabled={busy}>Registrar informe</button>
      </form>
      {data.informes.length > 0 && (
        <ul className="change-control-reports">
          {data.informes.map((item) => <li key={item.reportId}><strong>{item.title}</strong> · modelo {item.modelSha256.slice(0, 8)} · {dateText(item.createdAtEpochMs)}</li>)}
        </ul>
      )}
    </section>
  );
}
