import { useCallback, useEffect, useState } from 'react';
import { Camera, CameraOff, LoaderCircle } from 'lucide-react';
import { AdminAuditApi, type EvidenceSettings } from '@/lib/AdminAuditApi';
import { cognitoAdminAuth } from '@/lib/adminAuth';

const api = new AdminAuditApi();

/** Kill switch for report photos. Turning it off stops capture and uploads on the next request. */
export function AdminEvidenceSwitch({ onSignOut }: { onSignOut: () => void }) {
  const [settings, setSettings] = useState<EvidenceSettings | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(async (action: (token: string) => Promise<EvidenceSettings>) => {
    const token = cognitoAdminAuth.getAccessToken();
    if (!token) { onSignOut(); return; }
    setBusy(true);
    setError(null);
    try {
      setSettings(await action(token));
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Error inesperado.';
      setError(message);
      if (message.includes('Sesión ADMIN vencida')) onSignOut();
    } finally {
      setBusy(false);
    }
  }, [onSignOut]);

  useEffect(() => { void run((token) => api.evidenceSettings(token)); }, [run]);

  if (!settings) {
    return error ? <p className="wash-report-error" role="alert">{error}</p> : null;
  }
  const unavailable = !settings.deploymentEnabled || !settings.configured;
  return (
    <div className="evidence-switch" role="group" aria-label="Foto de lavados reportados">
      <div>
        <strong>{settings.captureActive ? <Camera size={14} aria-hidden="true" /> : <CameraOff size={14} aria-hidden="true" />}{' '}
          Foto de lavados reportados: {settings.captureActive ? 'activa' : 'apagada'}</strong>
        <span>
          {unavailable
            ? 'El despliegue no la habilita todavía (bucket cifrado, clave y bandera de captura).'
            : `Se guarda solo cuando el lavado queda incompleto. Retención ${settings.retentionDays} días. Solo ADMIN puede verla y cada vista queda auditada.`}
        </span>
      </div>
      <button type="button" className="button-quiet" disabled={busy || (unavailable && !settings.switchOn)}
        onClick={() => void run((token) => api.setEvidenceEnabled(token, !settings.switchOn))}>
        {busy && <LoaderCircle className="h-4 w-4 animate-spin" />}
        {settings.switchOn ? 'Apagar captura' : 'Encender captura'}
      </button>
      {error && <p className="wash-report-error" role="alert">{error}</p>}
    </div>
  );
}
