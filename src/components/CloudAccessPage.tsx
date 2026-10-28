import { useEffect, useState, type FormEvent } from 'react';
import { ArrowRight, ShieldCheck } from 'lucide-react';
import { cognitoAdminAuth, localAdminAuth } from '@/lib/adminAuth';
import { DeploymentStatusService, type DeploymentStatus } from '@/lib/DeploymentStatusService';

const deploymentStatusService = new DeploymentStatusService();

interface CloudAccessPageProps {
  message?: string | null;
  onSignedIn?: () => void;
}

export function CloudAccessPage({ message, onSignedIn }: CloudAccessPageProps) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [totp, setTotp] = useState('');
  const [enrollment, setEnrollment] = useState<{ secret: string; otpauthUri: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(message ?? null);
  const [status, setStatus] = useState<DeploymentStatus>(DeploymentStatusService.checking());
  const [loading, setLoading] = useState(true);
  const configured = cognitoAdminAuth.isConfigured();
  const apiVerified = !loading && status.mode !== 'UNVERIFIED';
  const accessReady = configured && apiVerified;

  useEffect(() => {
    const controller = new AbortController();
    void deploymentStatusService.load(controller.signal)
      .then(setStatus)
      .catch(() => {
        if (!controller.signal.aborted) setStatus(DeploymentStatusService.unverified());
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, []);

  async function signIn() {
    setError(null);
    try {
      await cognitoAdminAuth.beginSignIn('#/admin');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No fue posible iniciar sesión.');
    }
  }

  async function signInLocal(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!localAdminAuth || busy) return;
    setError(null);
    setBusy(true);
    try {
      const result = await localAdminAuth.login(username.trim(), password, totp.trim() || undefined);
      if (result.kind === 'enrollment') {
        setEnrollment({ secret: result.secret, otpauthUri: result.otpauthUri });
        setTotp('');
      } else {
        setPassword('');
        setTotp('');
        onSignedIn?.();
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No fue posible iniciar sesión.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="access-page">
      <section className="access-panel" aria-labelledby="access-title">
        <a className="brand-lockup access-brand" href="#/" aria-label="HandWash">
          <span className="brand-mark"><img src="/handwash-logo.png" alt="" /></span>
          <span><strong>HandWash</strong><small>Estación de verificación</small></span>
        </a>
        <div className="access-copy">
          <h1 id="access-title">Consola ADMIN</h1>
          <p>Acceso reservado para administración y auditoría. El puesto de lavado no requiere inicio de sesión.</p>
        </div>
        <div className="access-status" role="status" aria-live="polite">
          <span className={`status-indicator ${loading ? 'is-pending' : status.mode === 'UNVERIFIED' ? 'is-warning' : 'is-ready'}`} />
          <div>
            <strong>{loading ? 'Consultando el backend' : status.mode === 'UNVERIFIED' ? 'API Java no verificada' : 'Backend Java · ' + status.mode}</strong>
            <span>{loading ? 'Verificando el estado operativo…' : status.mode === 'UNVERIFIED'
              ? 'No se pudo leer su estado desde este dominio.'
              : status.clinicalDecisionAllowed ? 'Decisión clínica habilitada' : 'Modo no clínico; no usar para decisiones clínicas.'}</span>
          </div>
        </div>
        {error && <p className="form-error" role="alert">{error}</p>}
        {(!configured || !loading && !apiVerified) && (
          <div id="access-setup-note" className="setup-notice" role="status" aria-label="Configuración pendiente">
            <strong>Acceso aún no habilitado</strong>
            <ul>
              {!configured && <li>{localAdminAuth ? 'Configura VITE_API_URL con la URL HTTPS pública del backend.' : 'Configura el App Client público de Cognito y registra el callback exacto de Vercel.'}</li>}
              {!apiVerified && <li>Verifica que la API responda y autoriza este origen en CORS de Java.</li>}
            </ul>
          </div>
        )}
        {localAdminAuth ? (
          <form className="access-form" onSubmit={(event) => void signInLocal(event)}>
            {enrollment && (
              <div className="setup-notice" role="status">
                <strong>Registra tu autenticador (solo se muestra una vez)</strong>
                <p>Agrega esta clave en tu app de autenticación (Microsoft Authenticator, Google Authenticator…) y escribe el código de 6 dígitos.</p>
                <code aria-label="Clave TOTP">{enrollment.secret}</code>
              </div>
            )}
            <label htmlFor="admin-user">Usuario</label>
            <input id="admin-user" value={username} onChange={(event) => setUsername(event.target.value)}
              autoComplete="username" autoCapitalize="none" spellCheck={false} required />
            <label htmlFor="admin-password">Contraseña</label>
            <input id="admin-password" type="password" value={password} onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password" required />
            <label htmlFor="admin-totp">Código de 6 dígitos{enrollment ? '' : ' (déjalo vacío en tu primer ingreso)'}</label>
            <input id="admin-totp" value={totp} onChange={(event) => setTotp(event.target.value)}
              inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} />
            <button className="button-primary access-submit" type="submit" disabled={!accessReady || busy}
              aria-describedby={!accessReady ? 'access-setup-note' : undefined}>
              <span>{busy ? 'Verificando…' : 'Iniciar sesión como ADMIN'}</span><ArrowRight size={17} />
            </button>
          </form>
        ) : (
          <button className="button-primary access-submit" type="button" onClick={() => void signIn()}
            disabled={!accessReady}
            aria-describedby={!accessReady ? 'access-setup-note' : undefined}>
            <span>Iniciar sesión como ADMIN</span><ArrowRight size={17} />
          </button>
        )}
        <div className="access-note"><ShieldCheck size={16} /><span>La autorización final siempre la valida el backend Java.</span></div>
      </section>
      <aside className="access-aside">
        <div className="aside-mark"><img src="/handwash-logo.png" alt="" /></div>
        <h2>Control administrativo separado del puesto</h2>
        <p>Cada acceso cierra la sesión previa de Cognito y exige volver a autenticarte. Usa la cuenta Cognito y su MFA; Microsoft Authenticator es compatible con el código TOTP. HandWash mantiene los tokens solo en memoria.</p>
        <div className="access-limits">
          <span><i className="legend-dot dot-blue" />Cámara: vista previa local</span>
          <span><i className="legend-dot dot-amber" />RTX / YOLO: aún sin conectar</span>
          <span><i className="legend-dot dot-gray" />Datos de imagen: no se almacenan</span>
        </div>
      </aside>
    </main>
  );
}
