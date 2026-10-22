import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { Activity, Camera, Check, CircleAlert, LoaderCircle, LogOut, Play, ShieldCheck, Square, VideoOff } from 'lucide-react';
import { cognitoAdminAuth } from '@/lib/adminAuth';
import { OperatorApi, type OperatorStatus, type ShiftView } from '@/lib/OperatorApi';
import { StationApi, type PublicStationStatus } from '@/lib/StationApi';
import { ContinuityBrowserCameraService, type CameraChoice } from '@/lib/ContinuityBrowserCameraService';
import { useStationCamera } from '@/hooks/useStationCamera';
import { useWebSocket } from '@/hooks/useWebSocket';
import { useRelaySupervisor } from '@/hooks/useRelaySupervisor';
import { OperatorShiftPanel } from './OperatorShiftPanel';
import { useSessionStore } from '@/stores/sessionStore';
import type { Protocolo } from '@/types';

const operatorApi = new OperatorApi();
const stationApi = new StationApi();

interface OperatorConsoleProps {
  authError?: string | null;
  onSignedOut: () => void;
}

export function OperatorConsole({ authError, onSignedOut }: OperatorConsoleProps) {
  const token = cognitoAdminAuth.getAccessToken();
  const idToken = cognitoAdminAuth.getIdToken();
  const [status, setStatus] = useState<OperatorStatus | null>(null);
  const [station, setStation] = useState<PublicStationStatus | null>(null);
  const [checking, setChecking] = useState(Boolean(token));
  const [error, setError] = useState<string | null>(authError ?? null);
  const [code, setCode] = useState('');
  const [stationCode, setStationCode] = useState('');
  const [protocol, setProtocol] = useState<Protocolo>('AGUA_Y_JABON');
  const [busy, setBusy] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [cameraBusy, setCameraBusy] = useState(false);
  const [cameraChoices, setCameraChoices] = useState<CameraChoice[]>([]);
  const [chosenCamera, setChosenCamera] = useState('');
  const [shift, setShift] = useState<ShiftView | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const activeSessionId = useSessionStore((state) => state.sessionId);
  const sessionActive = useSessionStore((state) => state.isActive);
  const currentStep = useSessionStore((state) => state.currentStep);
  const { stream, setStream } = useStationCamera();
  const relayedSession = status && station?.stationId === status.grant.stationId && sessionActive ? activeSessionId : null;
  const { state: relayState, telemetry } = useRelaySupervisor(relayedSession, stream);
  const { connect, disconnect } = useWebSocket(async (sessionId) => {
    const currentToken = cognitoAdminAuth.getAccessToken();
    if (!currentToken) throw new Error('La sesión de operador expiró.');
    return operatorApi.websocketTicket(currentToken, sessionId);
  });

  const refresh = useCallback(async () => {
    const currentToken = cognitoAdminAuth.getAccessToken();
    if (!currentToken) {
      setChecking(false);
      return;
    }
    try {
      const [operatorStatus, localStatus, currentShift] = await Promise.all([
        operatorApi.status(currentToken), stationApi.status(useSessionStore.getState().sessionId),
        operatorApi.shiftStatus(currentToken).catch(() => null),
      ]);
      setStatus(operatorStatus);
      setShift(currentShift);
      setStation(localStatus);
      const session = operatorStatus?.activeSession;
      const current = useSessionStore.getState();
      if (session && current.sessionId !== session.sessionId) {
        current.startSession(session.sessionId, session.protocolo, null, true);
        connect(session.sessionId, null);
      } else if (!session && current.isActive) {
        disconnect();
        current.endSession();
      }
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo consultar el puesto.');
    } finally {
      setChecking(false);
    }
  }, [connect, disconnect]);

  useEffect(() => {
    if (!token) return;
    let mounted = true;
    const run = async () => { if (mounted) await refresh(); };
    void run();
    const timer = window.setInterval(() => void run(), 5_000);
    return () => { mounted = false; window.clearInterval(timer); };
  }, [refresh, token]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.srcObject = stream;
    if (stream) void video.play().catch(() => setCameraError('El navegador no pudo mostrar la vista previa.'));
    return () => { video.srcObject = null; };
  }, [stream]);

  async function signIn() {
    setError(null);
    try { await cognitoAdminAuth.beginSignIn('#/operator'); }
    catch (cause) { setError(messageOf(cause)); }
  }

  async function signUp() {
    setError(null);
    try { await cognitoAdminAuth.beginSignUp('#/operator'); }
    catch (cause) { setError(messageOf(cause)); }
  }

  async function claimAccess(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token || !idToken || busy) return;
    setBusy(true);
    setError(null);
    try {
      await operatorApi.claim(token, idToken, code);
      setCode('');
      await refresh();
    } catch (cause) { setError(messageOf(cause)); }
    finally { setBusy(false); }
  }

  async function registerStation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await stationApi.enroll(stationCode);
      setStationCode('');
      await refresh();
    } catch (cause) { setError(messageOf(cause)); }
    finally { setBusy(false); }
  }

  async function authorizeCamera(deviceId?: string) {
    setCameraError(null);
    setCameraBusy(true);
    try {
      const wanted = deviceId ?? ContinuityBrowserCameraService.remembered() ?? undefined;
      let opened: MediaStream;
      try {
        opened = await ContinuityBrowserCameraService.open(undefined, undefined, { deviceId: wanted });
      } catch (cause) {
        if (!wanted || deviceId) throw cause;
        // The remembered camera is gone (iPhone away): fall back to automatic detection.
        ContinuityBrowserCameraService.remember(null);
        opened = await ContinuityBrowserCameraService.open();
      }
      const track = opened.getVideoTracks()[0];
      const label = track?.label ?? '';
      const settings = track?.getSettings?.();
      if (settings?.deviceId) ContinuityBrowserCameraService.remember(settings.deviceId);
      setStream(opened);
      setCameraChoices([]);
      if (deviceId && !/iphone|continuity|continuidad/i.test(label)) {
        setCameraError(`Estás usando "${label || 'otra cámara'}", no el iPhone. Funciona, pero revisa el encuadre.`);
      }
    } catch (cause) {
      setCameraError(messageOf(cause));
      try {
        const choices = await ContinuityBrowserCameraService.listCameras();
        setCameraChoices(choices);
        setChosenCamera((current) => choices.some((c) => c.deviceId === current)
          ? current : (choices.find((c) => c.likelyIphone) ?? choices[0])?.deviceId ?? '');
      } catch { setCameraChoices([]); }
    } finally { setCameraBusy(false); }
  }

  async function startSession() {
    if (!token || busy) return;
    setBusy(true);
    setError(null);
    try {
      const session = await operatorApi.startSession(token, protocol, crypto.randomUUID());
      useSessionStore.getState().startSession(session.sessionId, session.protocolo, null, true);
      connect(session.sessionId, null);
      await refresh();
    } catch (cause) { setError(messageOf(cause)); }
    finally { setBusy(false); }
  }

  async function startShift(hours: number) {
    if (!token || busy) return;
    setBusy(true);
    setError(null);
    try {
      await operatorApi.startShift(token, hours, protocol);
      await refresh();
    } catch (cause) { setError(messageOf(cause)); }
    finally { setBusy(false); }
  }

  async function stopShift() {
    if (!token || busy) return;
    setBusy(true);
    setError(null);
    try {
      await operatorApi.stopShift(token);
      disconnect();
      useSessionStore.getState().endSession();
      await refresh();
    } catch (cause) { setError(messageOf(cause)); }
    finally { setBusy(false); }
  }

  async function stopSession() {
    if (!token || !activeSessionId || busy) return;
    setBusy(true);
    setError(null);
    try {
      await operatorApi.stopSession(token, activeSessionId);
      disconnect();
      useSessionStore.getState().endSession();
      await refresh();
    } catch (cause) { setError(messageOf(cause)); }
    finally { setBusy(false); }
  }

  if (!token) {
    return <main className="operator-access-page">
      <section className="operator-access-card" aria-labelledby="operator-access-title">
        <Brand />
        <p className="operator-eyebrow">Acceso de operación</p>
        <h1 id="operator-access-title">Control del puesto</h1>
        <p>Inicia sesión con tu cuenta verificada. Java solo habilita los controles después de validar una asignación activa.</p>
        {error && <p className="operator-error" role="alert">{error}</p>}
        <button className="operator-button operator-button--primary" type="button" onClick={() => void signIn()}>Iniciar sesión</button>
        <button className="operator-button operator-button--secondary" type="button" onClick={() => void signUp()}>Crear cuenta de operador</button>
        <p className="operator-footnote"><ShieldCheck size={15} /> Cognito verifica el correo y exige MFA TOTP. Una cuenta nueva no obtiene acceso al puesto sin código ADMIN.</p>
      </section>
    </main>;
  }

  if (!status && checking) return <main className="operator-access-page" role="status"><LoaderCircle className="animate-spin" /> Verificando asignación…</main>;

  return <main className="operator-console">
    <header className="operator-topbar"><Brand /><div className="operator-top-actions">
      <span className="operator-identity">{status?.grant.email ?? 'Cuenta autenticada'}</span>
      {status && station?.stationId === status.grant.stationId && (
        <a className="operator-button operator-button--quiet operator-kiosk-link" href="#/">
          Ver pantalla del puesto
        </a>
      )}
      <button className="operator-button operator-button--quiet" type="button" onClick={onSignedOut}><LogOut size={16} /> Salir</button>
    </div></header>
    <div className="operator-content">
      <div className="operator-heading"><div><p className="operator-eyebrow">Consola privada</p><h1>Operación del puesto</h1>
        <p>Configura localmente la cámara y controla la sesión. Java confirma los pasos.</p></div>
        <span className={`operator-pill ${status ? 'is-connected' : 'is-pending'}`}><span />{status ? 'Cuenta verificada' : 'Puesto sin asignar'}</span>
      </div>

      {error && <p className="operator-error" role="alert">{error}</p>}

      {!status && <section className="operator-panel" aria-labelledby="claim-title">
        <div className="operator-panel-heading"><div><p className="operator-eyebrow">Vinculación personal</p><h2 id="claim-title">Canjear acceso de operador</h2></div><ShieldCheck /></div>
        <p>ADMIN emite un código de un solo uso asociado a tu correo verificado y a un único puesto. El código no caduca, pero deja de servir al usarse o revocarse.</p>
        <form className="operator-inline-form" onSubmit={(event) => void claimAccess(event)}>
          <label htmlFor="operator-access-code">Código asignado</label>
          <div><input id="operator-access-code" value={code} onChange={(event) => setCode(event.target.value)}
            autoComplete="off" autoCapitalize="none" spellCheck={false} minLength={40} maxLength={64} required />
            <button className="operator-button operator-button--primary" type="submit" disabled={busy || !idToken || code.trim().length < 40}>
              {busy ? <LoaderCircle className="animate-spin" size={16} /> : <Check size={16} />} Canjear
            </button></div>
        </form>
        {!idToken && <p className="operator-footnote">Vuelve a iniciar sesión para renovar la prueba de identidad Cognito.</p>}
      </section>}

      {!status && station?.registered && (
        <section className="operator-panel operator-station-ready" role="status">
          <div className="operator-panel-heading"><div><p className="operator-eyebrow">Configuración física</p>
            <h2>{station.stationName} registrado</h2></div><Check className="operator-ok" /></div>
          <p>El puesto ya está provisionado. Solicita a ADMIN que asigne tu cuenta verificada para habilitar la operación.</p>
        </section>
      )}

      {(!station?.registered || (status && station.stationId !== status.grant.stationId)) && (
        <section className="operator-panel operator-panel--commission" aria-labelledby="commission-title">
          <div className="operator-panel-heading"><div><p className="operator-eyebrow">Configuración física</p><h2 id="commission-title">Registrar este equipo</h2></div><Camera /></div>
          <p>En el Mac conectado a Continuity, canjea el código técnico emitido por ADMIN. Este registro es independiente de tu acceso personal.</p>
          <form className="operator-inline-form" onSubmit={(event) => void registerStation(event)}>
            <label htmlFor="operator-station-code">Código técnico de inscripción</label>
            <div><input id="operator-station-code" type="password" value={stationCode}
              onChange={(event) => setStationCode(event.target.value)} autoComplete="off"
              autoCapitalize="none" spellCheck={false} minLength={30} maxLength={100} required />
              <button className="operator-button operator-button--primary" type="submit"
                disabled={busy || stationCode.trim().length < 30}>
                {busy ? <LoaderCircle className="animate-spin" size={16} /> : <Check size={16} />} Registrar Mac
              </button></div>
          </form>
          <p className="operator-footnote">El registro crea una credencial técnica en cookie HttpOnly. No escribas este código en la pantalla del paciente.</p>
        </section>
      )}

      {status && station?.stationId === status.grant.stationId && <>
        <section className="operator-station-banner"><div><p className="operator-eyebrow">Puesto asignado</p><h2>{status.grant.stationName}</h2>
          <code>{status.grant.stationId}</code></div><span className="operator-pill is-connected"><span /> Java autorizado</span></section>

        <section className="operator-grid">
          <div className="operator-panel operator-camera-panel">
            <div className="operator-panel-heading"><div><p className="operator-eyebrow">Solo configuración local</p><h2>Cámara Continuity</h2></div>
              {stream ? <Check className="operator-ok" /> : <VideoOff className="operator-muted" />}</div>
            <p>Autoriza la cámara principal del iPhone desde el Mac que funciona como puesto. La consola remota no puede seleccionar el hardware de ese Mac.</p>
            {stream ? <video ref={videoRef} className="operator-camera-preview" autoPlay muted playsInline aria-label="Vista previa local de Continuity" /> :
              <div className="operator-camera-empty"><Camera size={25} /><span>Cámara local sin autorizar</span></div>}
            {cameraError && <p className="operator-error" role="alert">{cameraError}</p>}
            {cameraChoices.length > 0 && (
              <label className="operator-field-label">
                <span>Cámara disponible en este Mac</span>
                <select style={{ display: 'block', width: '100%', marginTop: 6, padding: 8 }} value={chosenCamera} onChange={(event) => setChosenCamera(event.target.value)}>
                  {cameraChoices.map((choice) => (
                    <option key={choice.deviceId} value={choice.deviceId}>
                      {choice.label}{choice.likelyIphone ? ' (iPhone)' : ''}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {cameraChoices.length > 0 && (
              <button className="operator-button operator-button--secondary" type="button"
                disabled={cameraBusy || !chosenCamera} onClick={() => void authorizeCamera(chosenCamera)}>
                <Camera size={16} /> Usar esta cámara
              </button>
            )}
            <button className="operator-button operator-button--secondary" type="button"
              disabled={cameraBusy} onClick={() => void authorizeCamera()}>
              <Camera size={16} /> {cameraBusy ? 'Buscando cámara del iPhone…'
                : cameraChoices.length > 0 ? 'Buscar de nuevo' : stream ? 'Volver a autorizar cámara' : 'Autorizar en este Mac'}
            </button>
          </div>

          <div className="operator-panel operator-session-panel">
            <div className="operator-panel-heading"><div><p className="operator-eyebrow">Sesión remota</p><h2>Control de detección</h2></div><Activity /></div>
            <div className="operator-checks" aria-label="Estado de integraciones">
              <StatusLine label="Java" ok={Boolean(status)} detail={status ? 'Asignación activa' : 'Sin asignación'} />
              <StatusLine label="Cámara de este Mac" ok={Boolean(stream)} detail={stream ? 'Permiso activo' : 'Requiere configuración local'} />
              <StatusLine label="PC RTX / YOLO" ok={telemetry?.activeModelsReady === true}
                detail={telemetry?.activeModelsReady ? 'Modelo conectado' : 'Sin telemetría confirmada'} />
              <StatusLine label="Video WebRTC" ok={relayState === 'connected'}
                detail={relayState === 'connected' ? 'Cámara entregada al PC' : relayState === 'failed' ? 'Enlace fallido' : 'Esperando enlace desde el Mac del puesto'} />
              <StatusLine label="Transporte Java" ok={telemetry?.javaTransport === 'connected'}
                detail={telemetry?.javaTransport === 'connected' ? 'Conectado' : 'Esperando inferencia'} />
            </div>
            <OperatorShiftPanel shift={shift} busy={busy} onStart={(hours) => void startShift(hours)} onStop={() => void stopShift()} />
            {sessionActive ? <>
              <div className="operator-active-session"><span>Sesión Java activa</span><code>{activeSessionId}</code>
                <strong>{currentStep ? `Paso confirmado: ${currentStep}` : 'Esperando primera confirmación de Java'}</strong></div>
              {!shift?.active && <button className="operator-button operator-button--danger" type="button" onClick={() => void stopSession()} disabled={busy}>
                {busy ? <LoaderCircle className="animate-spin" size={16} /> : <Square size={15} />} Detener sesión
              </button>}
            </> : shift?.active ? <p className="operator-footnote" role="status">El turno está activo: Java abrirá la sesión en unos segundos.</p> : <>
              <label className="operator-field-label" htmlFor="operator-protocol">Protocolo</label>
              <select id="operator-protocol" value={protocol} onChange={(event) => setProtocol(event.target.value as Protocolo)}>
                <option value="AGUA_Y_JABON">Agua y jabón · seis movimientos</option>
              </select>
              <p className="operator-footnote">Evalúa los seis movimientos de fricción con los tiempos del perfil vigente; no verifica mojado, jabón ni enjuague, ni es una decisión clínica.</p>
              <button className="operator-button operator-button--primary" type="button" onClick={() => void startSession()} disabled={busy}>
                {busy ? <LoaderCircle className="animate-spin" size={16} /> : <Play size={16} />} Iniciar detección
              </button>
            </>}
          </div>
        </section>
        <p className="operator-notice"><CircleAlert size={15} /> Sin grabación de video o imágenes. Piloto no clínico; estados del PC se muestran solo cuando llega telemetría real.</p>
      </>}
    </div>
  </main>;
}

function Brand() {
  return <div className="operator-brand"><img src="/handwash-logo.png" alt="" /><span><strong>HandWash</strong><small>Control de estación</small></span></div>;
}

function StatusLine({ label, ok, detail }: { label: string; ok: boolean; detail: string }) {
  return <div className="operator-status-line"><span className={ok ? 'is-ok' : 'is-waiting'} />
    <span><strong>{label}</strong><small>{detail}</small></span></div>;
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : 'No se pudo completar la operación.';
}
