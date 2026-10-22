import { useCallback, useState } from 'react';
import { LoaderCircle, ShieldAlert, ShieldCheck } from 'lucide-react';
import { AdminAuditApi, type AuditChainStatus } from '@/lib/AdminAuditApi';
import { cognitoAdminAuth } from '@/lib/adminAuth';

const api = new AdminAuditApi();
const PROBLEM_TEXT: Record<string, string> = {
  HASH_MISMATCH: 'un evento fue modificado',
  BROKEN_LINK: 'falta o sobra un evento en la cadena',
  UNHASHED_EVENT: 'un evento perdió su huella',
  HEAD_MISMATCH: 'el final de la cadena no coincide con el registro',
  SEAL_MISMATCH: 'el último sello ya no coincide con la base de datos',
};

/** ADMIN-only integrity check of the audit log. It detects tampering; it cannot prevent it. */
export function AdminAuditChainPanel({ onSignOut }: { onSignOut: () => void }) {
  const [status, setStatus] = useState<AuditChainStatus | null>(null);
  const [busy, setBusy] = useState<'verify' | 'seal' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(async (kind: 'verify' | 'seal') => {
    const token = cognitoAdminAuth.getAccessToken();
    if (!token) { onSignOut(); return; }
    setBusy(kind);
    setError(null);
    try {
      if (kind === 'seal') await api.sealAuditChain(token);
      setStatus(await api.auditChain(token));
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Error inesperado.';
      setError(message);
      if (message.includes('Sesión ADMIN vencida')) onSignOut();
    } finally {
      setBusy(null);
    }
  }, [onSignOut]);

  const intact = status ? status.chain.ok && status.chain.matchesLatestSeal && status.resultsMatchLatestSeal : null;
  const latest = status?.seals[0];
  return (
    <section className="admin-data-section" aria-labelledby="audit-chain-title">
      <div className="admin-section-header">
        <div className="admin-section-title">
          {intact === false ? <ShieldAlert className="h-4 w-4" /> : <ShieldCheck className="h-4 w-4" />}
          <h2 id="audit-chain-title">Integridad de la auditoría</h2>
        </div>
      </div>
      <div className="evidence-switch">
        <div>
          <strong>Cadena de huellas de los eventos y sellos diarios</strong>
          <span>Detecta si alguien modificó, borró o insertó registros. Solo ADMIN puede verificarla y cada verificación queda auditada.</span>
        </div>
        <div className="audit-chain-actions">
          <button type="button" className="button-quiet" disabled={busy !== null} onClick={() => void run('verify')}>
            {busy === 'verify' && <LoaderCircle className="h-4 w-4 animate-spin" />} Verificar ahora
          </button>
          <button type="button" className="button-quiet" disabled={busy !== null} onClick={() => void run('seal')}>
            {busy === 'seal' && <LoaderCircle className="h-4 w-4 animate-spin" />} Sellar ahora
          </button>
        </div>
      </div>
      {error && <p className="wash-report-error" role="alert">{error}</p>}
      {status && (
        <div className={`audit-chain-result ${intact ? 'is-ok' : 'is-broken'}`} role="status">
          <strong>{intact ? 'Cadena íntegra' : 'Se detectó una inconsistencia'}</strong>
          <span>
            {status.chain.checked} eventos verificados · {status.chain.keyed ? 'firmada con clave del servidor' : 'sin clave (solo local)'}
            {latest ? ` · último sello ${new Date(latest.sealedAtEpochMs).toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' })}${latest.objectKey ? ' (copia de solo escritura)' : ' (solo en base de datos)'}` : ' · aún no hay sellos'}
          </span>
          {!status.chain.ok && (
            <ul>{status.chain.problems.map((problem, index) => (
              <li key={`${problem.code}-${index}`}>
                {PROBLEM_TEXT[problem.code] ?? problem.code}{problem.eventId != null ? ` (evento ${problem.eventId})` : ''}
              </li>
            ))}</ul>
          )}
          {status.chain.ok && !status.resultsMatchLatestSeal && <span>Los resultados de lavado ya no coinciden con el último sello.</span>}
        </div>
      )}
    </section>
  );
}
