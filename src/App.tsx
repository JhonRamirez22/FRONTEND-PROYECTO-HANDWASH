import { useCallback, useEffect, useRef, useState } from 'react';
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
import { StationEnrollmentPage } from './components/StationEnrollmentPage';
import { StepStepper } from './components/StepStepper';
import { DeploymentStatusService } from './lib/DeploymentStatusService';
import { BrowserRtcCameraRelay, type CameraRelayState, type ProducerTelemetry } from './lib/BrowserRtcCameraRelay';
import { cognitoAdminAuth } from './lib/adminAuth';
import { CognitoAdminAuthService, type HumanRole } from './lib/CognitoAdminAuthService';
import { ContinuityBrowserCameraService, stopTracks } from './lib/ContinuityBrowserCameraService';
import { RuntimeEndpointConfig } from './lib/RuntimeEndpointConfig';
import { stationApi, type ActiveStationSession } from './lib/StationApi';
import { useSessionStore } from './stores/sessionStore';

const deploymentStatusService = new DeploymentStatusService();
const cameraRelay = new BrowserRtcCameraRelay();

function App() {
  const cloudMode = RuntimeEndpointConfig.isCloudMode();
  const hasAuthCallback = new URLSearchParams(window.location.search).has('code')
    || new URLSearchParams(window.location.search).has('error');
  const [authReady, setAuthReady] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [adminRoute, setAdminRoute] = useState(
    isAdminLocation() || CognitoAdminAuthService.hasPendingLogout(),
  );
  const [, setAuthRevision] = useState(0);
  const callbackHandled = useRef(false);

  useEffect(() => {
    const updateRoute = () => setAdminRoute(isAdminLocation());
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
      if (CognitoAdminAuthService.hasPendingLogout()) {
        callbackHandled.current = true;
        if (CognitoAdminAuthService.pendingLandingHash() !== '#/admin') {
          cognitoAdminAuth.clearPendingSignIn();
          setAdminRoute(true);
          setAuthError('La transacción de acceso ADMIN no es válida. Inicia sesión de nuevo.');
          setAuthReady(true);
          return;
        }
        window.history.replaceState(null, '', `${window.location.pathname}#/admin`);
        setAdminRoute(true);
        void cognitoAdminAuth.continueSignInAfterLogout()
          .catch((cause: unknown) => {
            cognitoAdminAuth.clearPendingSignIn();
            setAuthError(cause instanceof Error ? cause.message : 'No se pudo iniciar sesión.');
          })
          .finally(() => {
            setAuthRevision((revision) => revision + 1);
            setAuthReady(true);
          });
        return;
      }
      setAuthReady(true);
      return;
    }
    if (callbackHandled.current) return;
    callbackHandled.current = true;
    const requestedRoute = CognitoAdminAuthService.pendingLandingHash();
    if (requestedRoute !== '#/admin' || !CognitoAdminAuthService.hasPendingRedirect()) {
      cognitoAdminAuth.clear();
      setAuthError('No se encontró una transacción ADMIN válida. Abre la consola e inicia sesión de nuevo.');
      window.history.replaceState(null, '', `${window.location.pathname}#/admin`);
      setAdminRoute(true);
      setAuthReady(true);
      return;
    }
    void cognitoAdminAuth.completeRedirect()
      .then(() => {
        if (!cognitoAdminAuth.getHumanRoles().includes('ADMIN')) {
          cognitoAdminAuth.clear();
          setAuthError('La cuenta no pertenece al grupo ADMIN.');
        }
        setAdminRoute(true);
      })
      .catch((cause: unknown) => {
        cognitoAdminAuth.clear();
        setAuthError(cause instanceof Error ? cause.message : 'No se pudo completar el inicio de sesión.');
        setAdminRoute(true);
      })
      .finally(() => {
        setAuthRevision((revision) => revision + 1);
        setAuthReady(true);
      });
  }, [cloudMode]);

  if (cloudMode && !adminRoute && !hasAuthCallback) return <PublicStationRoute />;
  if (cloudMode && !authReady) {
    return <div className="full-page-state" role="status"><LoaderCircle className="animate-spin" />Validando consola ADMIN…</div>;
  }
  if (cloudMode && adminRoute && !cognitoAdminAuth.getAccessToken()) {
    return <CloudAccessPage message={authError} />;
  }

  const roles: HumanRole[] = cloudMode ? cognitoAdminAuth.getHumanRoles() : ['OPERATOR'];
  if (cloudMode && adminRoute && !roles.includes('ADMIN')) {
    return <AccessDenied onSignOut={() => cognitoAdminAuth.signOut()} />;
  }
  if (cloudMode && adminRoute) {
    return <AdminAuditPage onBack={() => cognitoAdminAuth.signOut()} />;
  }
  return <Dashboard roles={roles} cloudMode={cloudMode} />;
}

type StationGate = 'checking' | 'ready' | 'unregistered' | 'unavailable' | 'resume-error';

function PublicStationRoute() {
  const [gate, setGate] = useState<StationGate>('checking');
  const [stationName, setStationName] = useState('');
  const [activeSession, setActiveSession] = useState<ActiveStationSession | null>(null);
  const [error, setError] = useState<string | null>(null);
  const generation = useRef(0);

  const refresh = useCallback(async () => {
    const current = ++generation.current;
    setGate('checking');
    setError(null);
    try {
      const status = await stationApi.status();
      if (current !== generation.current) return;
      if (!status.registered || !status.stationName) {
        setActiveSession(null);
        setGate('unregistered');
        return;
      }
      setStationName(status.stationName);
      if (status.resumeError) {
        setGate('resume-error');
        return;
      }
      setActiveSession(status.activeSession);
      setGate('ready');
    } catch (cause) {
      if (current !== generation.current) return;
      setError(cause instanceof Error ? cause.message : 'No se pudo consultar el servicio.');
      setGate('unavailable');
    }
  }, []);

  useEffect(() => {
    void refresh();
    return () => { generation.current += 1; };
  }, [refresh]);

  if (gate === 'checking') {
    return <div className="full-page-state" role="status"><LoaderCircle className="animate-spin" />Verificando el puesto…</div>;
  }
  if (gate === 'unregistered' || gate === 'unavailable') {
    return <StationEnrollmentPage
      onEnrolled={(name) => { setStationName(name); setActiveSession(null); setGate('ready'); }}
      onRetry={() => void refresh()}
      unavailable={gate === 'unavailable'}
      error={error}
    />;
  }
  if (gate === 'resume-error') {
    return <main className="full-page-state station-resume-error" role="alert">
      <div><ShieldX size={24} /><h1>No se pudo recuperar la sesión del puesto</h1>
        <p>Java reporta una sesión activa, pero su estado no está disponible. No se abrirá otra sesión para evitar duplicados.</p>
        {error && <p>{error}</p>}
        <button className="button-primary" type="button" onClick={() => void refresh()}>Reintentar conexión</button>
      </div>
    </main>;
  }
  return <Dashboard roles={[]} cloudMode publicStation stationName={stationName} initialSession={activeSession} />;
}

function Dashboard({ roles, cloudMode, publicStation = false, stationName = '', initialSession = null }: {
  roles: HumanRole[];
  cloudMode: boolean;
  publicStation?: boolean;
  stationName?: string;
  initialSession?: ActiveStationSession | null;
}) {
  const summary = useSessionStore((state) => state.summary);
  const sessionActive = useSessionStore((state) => state.isActive);
  const [deploymentStatus, setDeploymentStatus] = useState(DeploymentStatusService.checking());
  const [deploymentStatusLoading, setDeploymentStatusLoading] = useState(true);
  const [browserStream, setBrowserStream] = useState<MediaStream | null>(null);
  const [relayStatus, setRelayStatus] = useState<CameraRelayState | 'idle'>('idle');
  const [producerTelemetry, setProducerTelemetry] = useState<ProducerTelemetry | null>(null);
  const wasSessionActive = useRef(false);
  const sessionId = useSessionStore((state) => state.sessionId);
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

  useEffect(() => () => stopTracks(browserStream), [browserStream]);

  useEffect(() => {
    if (!cloudMode || !sessionActive || !sessionId || !browserStream) {
      setRelayStatus('idle');
      setProducerTelemetry(null);
      return;
    }
    const controller = new AbortController();
    let active = true;
    let closeRelay: (() => void) | null = null;
    setRelayStatus('connecting');
    void cameraRelay.connect(sessionId, browserStream, (state) => {
      if (active) setRelayStatus(state);
    }, controller.signal, (status) => {
      if (active) setProducerTelemetry(status);
    }).then((close) => {
      if (active) closeRelay = close;
      else close();
    }).catch((cause: unknown) => {
      if (active && !(cause instanceof Error && cause.name === 'AbortError')) setRelayStatus('failed');
    });
    return () => {
      active = false;
      controller.abort();
      closeRelay?.();
    };
  }, [cloudMode, sessionActive, sessionId, browserStream]);

  useEffect(() => {
    if (wasSessionActive.current && !sessionActive && browserStream) {
      stopTracks(browserStream);
      setBrowserStream(null);
    }
    wasSessionActive.current = sessionActive;
  }, [browserStream, sessionActive]);

  const refreshDeploymentStatus = () => {
    setDeploymentStatusLoading(true);
    void deploymentStatusService.load()
      .then(setDeploymentStatus)
      .catch(() => setDeploymentStatus(DeploymentStatusService.unverified()))
      .finally(() => setDeploymentStatusLoading(false));
  };

  const toggleBrowserCamera = useCallback(async () => {
    if (browserStream) {
      stopTracks(browserStream);
      setBrowserStream(null);
      return false;
    }
    setBrowserStream(await ContinuityBrowserCameraService.open());
    return true;
  }, [browserStream]);

  const ensureBrowserCamera = useCallback(async () => {
    if (browserStream && browserStream.getVideoTracks().some((track) => track.readyState === 'live')) return;
    setBrowserStream(await ContinuityBrowserCameraService.open());
  }, [browserStream]);

  return (
    <AppShell
      role="OPERATOR"
      roles={roles}
      active="station"
      publicStation={publicStation}
      environmentLabel={environmentLabel}
      status={cloudMode ? <div className="service-status"><span>Eventos Java</span><ConnectionStatusBadge /></div> : undefined}
      onSignOut={cloudMode && !publicStation && !sessionActive ? () => cognitoAdminAuth.signOut() : undefined}
    >
      <div className="page-heading">
        <div>
          <h1>{publicStation ? stationName || 'Puesto de lavado' : 'Estación en vivo'}</h1>
          <p>{publicStation ? 'Puesto registrado · los pasos solo se mostrarán cuando el productor YOLO esté conectado.'
            : 'Supervisa la cámara y el progreso que confirma el backend Java.'}</p>
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
            browserStream={cloudMode ? browserStream : undefined}
            onToggleBrowserCamera={cloudMode ? toggleBrowserCamera : undefined}
            relayStatus={relayStatus}
            producerTelemetry={producerTelemetry}
          />
        </div>
        <div className="station-controls-slot">
          <ControlPanel
            publicStation={publicStation}
            initialSession={initialSession}
            onBeforeStart={cloudMode ? ensureBrowserCamera : undefined}
            onStartFailure={cloudMode ? () => {
              if (browserStream) stopTracks(browserStream);
              setBrowserStream(null);
            } : undefined}
          />
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
        <h1>Consola ADMIN no habilitada para esta cuenta</h1>
        <p>El backend Java exige el grupo ADMIN en cada solicitud.</p>
        <button className="button-primary" type="button" onClick={onSignOut}>Cerrar sesión</button>
      </section>
      <p className="access-global-note"><CircleAlert size={15} /> El puesto público no muestra ni concede acceso administrativo.</p>
    </main>
  );
}

function isAdminLocation(): boolean {
  return window.location.hash.startsWith('#/admin');
}

export default App;
