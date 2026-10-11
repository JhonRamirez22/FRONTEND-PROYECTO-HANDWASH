import { useEffect, useRef, useState } from 'react';
import { CircleAlert, LoaderCircle, ShieldX } from 'lucide-react';
import { AdminAuditPage } from './components/AdminAuditPage';
import { AppShell } from './components/AppShell';
import { CloudAccessPage } from './components/CloudAccessPage';
import { ConnectionStatusBadge } from './components/ConnectionStatusBadge';
import { ControlPanel } from './components/ControlPanel';
import { DeploymentNotice } from './components/DeploymentNotice';
import { InfractionsLog } from './components/InfractionsLog';
import { LiveCameraFeed } from './components/LiveCameraFeed';
import { SessionSummary } from './components/SessionSummary';
import { StepStepper } from './components/StepStepper';
import { DeploymentStatusService } from './lib/DeploymentStatusService';
import { cognitoAdminAuth } from './lib/adminAuth';
import { CognitoAdminAuthService, type HumanRole } from './lib/CognitoAdminAuthService';
import { RuntimeEndpointConfig } from './lib/RuntimeEndpointConfig';
import { postLoginSurface, resolveProtectedSurface } from './lib/RoleRouter';
import { useSessionStore } from './stores/sessionStore';

const deploymentStatusService = new DeploymentStatusService();

function App() {
  const cloudMode = RuntimeEndpointConfig.isCloudMode();
  const [authReady, setAuthReady] = useState(!cloudMode);
  const [authError, setAuthError] = useState<string | null>(null);
  const [route, setRoute] = useState(isAdminLocation());
  const [, setAuthRevision] = useState(0);
  const callbackHandled = useRef(false);

  useEffect(() => {
    const updateRoute = () => setRoute(isAdminLocation());
    window.addEventListener('hashchange', updateRoute);
    window.addEventListener('popstate', updateRoute);
    return () => {
      window.removeEventListener('hashchange', updateRoute);
      window.removeEventListener('popstate', updateRoute);
    };
  }, []);

  useEffect(() => {
    if (!cloudMode) {
      setAuthReady(true);
      return;
    }
    const params = new URLSearchParams(window.location.search);
    if (!params.has('code') && !params.has('error')) {
      setAuthReady(true);
      return;
    }
    if (callbackHandled.current) return;
    callbackHandled.current = true;
    const requestedRoute = CognitoAdminAuthService.pendingLandingHash() === '#/admin' ? 'audit' : 'station';
    if (!CognitoAdminAuthService.hasPendingRedirect()) {
      setAuthError('No se encontró la transacción PKCE. Inicia sesión de nuevo.');
      setAuthReady(true);
      return;
    }
    void cognitoAdminAuth.completeRedirect()
      .then(() => {
        const roles = cognitoAdminAuth.getHumanRoles();
        if (roles.length === 0) {
          cognitoAdminAuth.clear();
          setAuthError('La cuenta no tiene el grupo OPERATOR ni ADMIN. Solicita acceso al administrador del sistema.');
          return;
        }
        const destination = postLoginSurface(roles, requestedRoute) === 'audit' ? '#/admin' : '#/';
        if (window.location.hash !== destination) window.location.hash = destination;
      })
      .catch((cause: unknown) => {
        setAuthError(cause instanceof Error ? cause.message : 'No se pudo completar el inicio de sesión.');
      })
      .finally(() => {
        setAuthRevision((revision) => revision + 1);
        setAuthReady(true);
      });
  }, [cloudMode]);

  if (cloudMode && !authReady) {
    return <div className="full-page-state" role="status"><LoaderCircle className="animate-spin" />Validando sesión…</div>;
  }
  if (cloudMode && !cognitoAdminAuth.getAccessToken()) {
    return <CloudAccessPage message={authError} />;
  }

  const roles: HumanRole[] = cloudMode ? cognitoAdminAuth.getHumanRoles() : ['OPERATOR'];
  if (cloudMode && roles.length === 0) return <AccessDenied onSignOut={() => cognitoAdminAuth.signOut()} />;

  const surface = cloudMode
    ? resolveProtectedSurface(roles, route ? 'audit' : 'station')
    : 'station';
  if (surface === 'forbidden') {
    return <AccessDenied onSignOut={() => cognitoAdminAuth.signOut()} />;
  }
  if (surface === 'audit') return <AdminAuditPage onBack={() => { window.location.hash = '#/'; }} />;
  return <Dashboard roles={roles} cloudMode={cloudMode} />;
}

function Dashboard({ roles, cloudMode }: { roles: HumanRole[]; cloudMode: boolean }) {
  const summary = useSessionStore((state) => state.summary);
  const sessionActive = useSessionStore((state) => state.isActive);
  const [deploymentStatus, setDeploymentStatus] = useState(DeploymentStatusService.checking());
  const [deploymentStatusLoading, setDeploymentStatusLoading] = useState(true);
  const environmentLabel = deploymentStatusLoading ? 'Verificando entorno'
    : deploymentStatus.mode === 'UNVERIFIED' ? 'Entorno no verificado'
      : `Entorno · ${deploymentStatus.mode}`;

  useEffect(() => {
    const controller = new AbortController();
    void deploymentStatusService.load(controller.signal)
      .then(setDeploymentStatus)
      .catch(() => {
        if (!controller.signal.aborted) setDeploymentStatus(DeploymentStatusService.unverified());
      })
      .finally(() => {
        if (!controller.signal.aborted) setDeploymentStatusLoading(false);
      });
    return () => controller.abort();
  }, []);

  const refreshDeploymentStatus = () => {
    setDeploymentStatusLoading(true);
    void deploymentStatusService.load()
      .then(setDeploymentStatus)
      .catch(() => setDeploymentStatus(DeploymentStatusService.unverified()))
      .finally(() => setDeploymentStatusLoading(false));
  };

  return (
    <AppShell
      role="OPERATOR"
      roles={roles}
      active="station"
      environmentLabel={environmentLabel}
      status={cloudMode ? <div className="service-status"><span>Eventos Java</span><ConnectionStatusBadge /></div> : undefined}
      onSignOut={cloudMode && !sessionActive ? () => cognitoAdminAuth.signOut() : undefined}
    >
      <div className="page-heading">
        <div>
          <h1>Estación en vivo</h1>
          <p>Supervisa la cámara y el progreso que confirma el backend Java.</p>
        </div>
        <div className={`session-state ${sessionActive ? 'is-active' : 'is-idle'}`} role="status">
          <span className="status-indicator" />{sessionActive ? 'Sesión Java activa' : 'Sin sesión activa'}
        </div>
      </div>

      <DeploymentNotice status={deploymentStatus} loading={deploymentStatusLoading} onRetry={refreshDeploymentStatus} />

      <div className="station-layout">
        <div className="station-camera-slot">
          <LiveCameraFeed
            backendStatus={deploymentStatus}
            backendLoading={deploymentStatusLoading}
          />
        </div>
        <div className="station-controls-slot">
          <ControlPanel />
        </div>
        <div className="station-progress-slot">
          <StepStepper deploymentStatus={deploymentStatus} />
        </div>
        <div className="station-infractions-slot">
          <InfractionsLog />
        </div>
        {summary && <div className="station-summary-slot"><SessionSummary deploymentStatus={deploymentStatus} /></div>}
      </div>
    </AppShell>
  );
}

function AccessDenied({ onSignOut }: { onSignOut: () => void }) {
  return (
    <main className="access-page">
      <section className="access-panel access-denied" role="alert">
        <span className="denied-icon"><ShieldX size={24} /></span>
        <h1>Este espacio no está habilitado para tu cuenta</h1>
        <p>Solicita el grupo requerido. El backend Java vuelve a comprobar los permisos en cada solicitud.</p>
        <button className="button-primary" type="button" onClick={onSignOut}>Cerrar sesión</button>
      </section>
      <p className="access-global-note"><CircleAlert size={15} /> La interfaz no concede permisos por sí sola.</p>
    </main>
  );
}

function isAdminLocation(): boolean {
  return window.location.hash.startsWith('#/admin');
}

export default App;
