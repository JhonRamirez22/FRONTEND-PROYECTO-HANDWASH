import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { Activity, Camera, Check, CircleAlert, LoaderCircle, LogOut, Play, ShieldCheck, Square } from 'lucide-react';
import { localAdminAuth, operatorAuth, operatorHasOwnPool } from '@/lib/adminAuth';
import { RehearsalPanel } from './RehearsalPanel';
import { CameraLinkPanel } from './CameraLinkPanel';
import { describeAgent, type AgentView } from '@/lib/CameraAgent';
import { OperatorApi, SessionExpiredError, type OperatorStatus, type ShiftView } from '@/lib/OperatorApi';
import { KEY_SESSION, OperatorKeySession, defaultLinkMac, phoneCodeFromHash } from '@/lib/OperatorKeySession';
import { StationApi, type PublicStationStatus } from '@/lib/StationApi';
import { ContinuityBrowserCameraService, isPhoneLikeDevice, type CameraChoice } from '@/lib/ContinuityBrowserCameraService';
import { useStationCamera } from '@/hooks/useStationCamera';
import { useScreenWakeLock } from '@/hooks/useScreenWakeLock';
import { useWebSocket } from '@/hooks/useWebSocket';
import { useRelaySupervisor } from '@/hooks/useRelaySupervisor';
import { OperatorShiftPanel } from './OperatorShiftPanel';
import { operatorPreflight } from '@/lib/OperatorPreflight';
import { useSessionStore } from '@/stores/sessionStore';
import type { Protocolo } from '@/types';

const operatorApi = new OperatorApi();
const stationApi = new StationApi();
const keySession = new OperatorKeySession();

interface OperatorConsoleProps {
  authError?: string | null;
  onSignedOut: () => void;
}

export function OperatorConsole({ authError, onSignedOut }: OperatorConsoleProps) {
  const [keyMode, setKeyMode] = useState(keySession.isActive());
  const [apiKey, setApiKey] = useState('');
  const [linkMac, setLinkMac] = useState(true);
  const [replaceMac, setReplaceMac] = useState(false);
  const [macNotice, setMacNotice] = useState<string | null>(null);
  const currentToken = useCallback(() => operatorAuth.getAccessToken() ?? (keyMode ? KEY_SESSION : null), [keyMode]);
  const token = currentToken();
  const idToken = operatorAuth.getIdToken();
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
  const [phoneLink, setPhoneLink] = useState<{ url: string; expiresAt: number } | null>(null);
  const [now, setNow] = useState(() => Date.now());
  // iPhone through the helper that runs on this Mac (reads Continuity straight from macOS, no browser).
  const [iphoneRequestedAt, setIphoneRequestedAt] = useState<number | null>(null);
  const [agent, setAgent] = useState<AgentView | null>(null);
  const iphoneRequested = iphoneRequestedAt !== null;
  const isPhone = isPhoneLikeDevice();
  const videoRef = useRef<HTMLVideoElement>(null);
  const activeSessionId = useSessionStore((state) => state.sessionId);
  const sessionActive = useSessionStore((state) => state.isActive);
  const currentStep = useSessionStore((state) => state.currentStep);
  const candidateStep = useSessionStore((state) => state.claseCandidata);
  const { stream, setStream } = useStationCamera();
  useScreenWakeLock(isPhone && Boolean(stream));
  const preflight = operatorPreflight({
    assigned: Boolean(status),
    cameraLive: Boolean(stream?.getVideoTracks().some((track) => track.readyState === 'live')),
    shiftActive: Boolean(shift?.active),
  });
  // Any device the operator links a camera on may publish it: the operator grant authorizes the session ticket.
  const relayedSession = status && sessionActive ? activeSessionId : null;
  // While the helper owns the camera the browser must not publish a second video to the same PC.
  const { state: relayState, telemetry } = useRelaySupervisor(relayedSession, iphoneRequested ? null : stream, 'operator');
  const { connect, disconnect } = useWebSocket(async (sessionId) => {
    const activeToken = currentToken();
    if (!activeToken) throw new Error('La sesión de operador expiró.');
    return operatorApi.websocketTicket(activeToken, sessionId);
  });

  const refresh = useCallback(async () => {
    const activeToken = currentToken();
    if (!activeToken) {
      setChecking(false);
      return;
    }
    try {
      const [operatorStatus, localStatus, currentShift] = await Promise.all([
        operatorApi.status(activeToken), stationApi.status(useSessionStore.getState().sessionId),
        operatorApi.shiftStatus(activeToken).catch(() => null),
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
      if (cause instanceof SessionExpiredError && keyMode) {
        // ADMIN revoked the key or the 12-hour session ended: back to the key screen.
        keySession.clear();
        setKeyMode(false);
        setStatus(null);
        setError('Tu API key fue revocada o la sesión venció. Escribe una key vigente.');
      } else {
        setError(cause instanceof Error ? cause.message : 'No se pudo consultar el puesto.');
      }
    } finally {
      setChecking(false);
    }
  }, [connect, disconnect, currentToken, keyMode]);

  useEffect(() => {
    if (!token) return;
    let mounted = true;
    const run = async () => { if (mounted) await refresh(); };
    void run();
    const timer = window.setInterval(() => void run(), 5_000);
    return () => { mounted = false; window.clearInterval(timer); };
  }, [refresh, token]);

  // A phone opened by QR (#/operator?phone=CODE): trade the one-time code for this device's own console session.
  useEffect(() => {
    const code = phoneCodeFromHash(window.location.hash);
    if (!code || keyMode) return;
    window.history.replaceState(null, '', `${window.location.pathname}#/operator`);
    setBusy(true);
    keySession.loginWithPhoneCode(code)
      .then(() => { setChecking(true); setKeyMode(true); setError(null); })
      .catch((cause: unknown) => setError(messageOf(cause)))
      .finally(() => setBusy(false));
  }, [keyMode]);

  // While the iPhone helper is wanted: renew the request and read the helper's state.
  useEffect(() => {
    if (!iphoneRequested) return undefined;
    const activeToken = currentToken();
    if (!activeToken) return undefined;
    let alive = true;
    const renew = () => { void operatorApi.requestCameraAgent(activeToken, true).catch(() => undefined); };
    const read = () => {
      void operatorApi.cameraAgent(activeToken).then((view) => { if (alive) setAgent(view); }).catch(() => { if (alive) setAgent(null); });
      if (alive) setNow(Date.now());
    };
    renew();
    read();
    const renewTimer = window.setInterval(renew, 10_000);
    const readTimer = window.setInterval(read, 2_000);
    return () => { alive = false; window.clearInterval(renewTimer); window.clearInterval(readTimer); };
  }, [iphoneRequested, currentToken]);

  useEffect(() => {
    if (!phoneLink) return undefined;
    const timer = window.setInterval(() => {
      const current = Date.now();
      setNow(current);
      if (current >= phoneLink.expiresAt) setPhoneLink(null);
    }, 1_000);
    return () => window.clearInterval(timer);
  }, [phoneLink]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.srcObject = stream;
    if (stream) void video.play().catch(() => setCameraError('El navegador no pudo mostrar la vista previa.'));
    return () => { video.srcObject = null; };
  }, [stream]);

  useEffect(() => {
    if (keyMode) return;
    // Entering from a laptop must not take the station over: tick "this is the Mac" only if this browser has none.
    let active = true;
    void stationApi.status(null).then((local) => { if (active) setLinkMac(defaultLinkMac(Boolean(local?.registered))); })
      .catch(() => { /* keep the default; the box stays editable */ });
    return () => { active = false; };
  }, [keyMode]);

  async function signInWithKey(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const profile = await keySession.login(apiKey, linkMac, replaceMac);
      setApiKey('');
      setReplaceMac(false);
      setMacNotice(profile.macAlreadyLinked
        ? 'El puesto ya tiene otro Mac enlazado, así que este equipo entró solo como consola. Si este es el Mac nuevo, vuelve a entrar con “Reemplazar el Mac anterior”.'
        : null);
      setChecking(true);
      setKeyMode(true);
    } catch (cause) { setError(messageOf(cause)); }
    finally { setBusy(false); }
  }

  async function signOut() {
    if (keyMode) {
      disconnect();
      await keySession.logout();
      setKeyMode(false);
      setStatus(null);
      setStream(null);
      return;
    }
    onSignedOut();
  }

  async function signIn() {
    setError(null);
    try { await operatorAuth.beginSignIn('#/operator'); }
    catch (cause) { setError(messageOf(cause)); }
  }

  async function signUp() {
    setError(null);
    try { await operatorAuth.beginSignUp('#/operator'); }
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

  function stopHelper() {
    setIphoneRequestedAt(null);
    setAgent(null);
    const activeToken = currentToken();
    if (activeToken) void operatorApi.requestCameraAgent(activeToken, false).catch(() => undefined);
  }

  async function authorizeCamera(deviceId?: string) {
    stopHelper();
    setCameraError(null);
    setCameraBusy(true);
    try {
      const wanted = deviceId ?? ContinuityBrowserCameraService.remembered() ?? undefined;
      let opened: MediaStream;
      try {
        opened = await ContinuityBrowserCameraService.open(undefined, undefined, { deviceId: wanted, waitMs: 30_000 });
      } catch (cause) {
        if (!wanted || deviceId) throw cause;
        // The remembered camera is gone (iPhone away): fall back to automatic detection.
        ContinuityBrowserCameraService.remember(null);
        opened = await ContinuityBrowserCameraService.open(undefined, undefined, { waitMs: 30_000 });
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

  /** This phone's own camera (any Android or iOS browser): no Continuity involved. */
  async function linkPhoneCamera() {
    stopHelper();
    setCameraError(null);
    setCameraBusy(true);
    try {
      const opened = await ContinuityBrowserCameraService.openPhoneCamera();
      setStream(opened);
      setCameraChoices([]);
    } catch (cause) { setCameraError(messageOf(cause)); }
    finally { setCameraBusy(false); }
  }

  /** From a computer: a QR that opens this console on the phone, whose camera then feeds the YOLO PC. */
  async function showPhoneLink() {
    const activeToken = currentToken();
    if (!activeToken) return;
    setCameraError(null);
    setCameraBusy(true);
    try {
      const link = await operatorApi.phoneLink(activeToken);
      setPhoneLink({ url: `${window.location.origin}/#/operator?phone=${link.code}`, expiresAt: Date.now() + link.expiresInSeconds * 1_000 });
      setNow(Date.now());
    } catch (cause) { setCameraError(messageOf(cause)); }
    finally { setCameraBusy(false); }
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
        <p>Escribe la API key que te dio ADMIN. Con ella se abre la consola de tu puesto y se conecta el PC con YOLO.</p>
        {error && <p className="operator-error" role="alert">{error}</p>}
        <form className="operator-inline-form" onSubmit={(event) => void signInWithKey(event)}>
          <label htmlFor="operator-api-key">API key</label>
          <div><input id="operator-api-key" type="password" value={apiKey} onChange={(event) => setApiKey(event.target.value)}
            autoComplete="off" autoCapitalize="none" spellCheck={false} minLength={40} maxLength={80} required />
            <button className="operator-button operator-button--primary" type="submit" disabled={busy || apiKey.trim().length < 40}>
              {busy ? <LoaderCircle className="animate-spin" size={16} /> : <Check size={16} />} Entrar
            </button></div>
          <label className="operator-footnote"><input type="checkbox" checked={linkMac} onChange={(event) => setLinkMac(event.target.checked)} />{' '}
            Este equipo es el Mac del puesto (enlazarlo y usar su cámara)</label>
          {linkMac && <label className="operator-footnote"><input type="checkbox" checked={replaceMac} onChange={(event) => setReplaceMac(event.target.checked)} />{' '}
            Reemplazar el Mac anterior (déjalo desmarcado salvo que cambies de equipo)</label>}
        </form>
        {!localAdminAuth && <details className="operator-footnote">
          <summary>Entrar con una cuenta (alternativa)</summary>
          <button className="operator-button operator-button--secondary" type="button" onClick={() => void signIn()}>Iniciar sesión con cuenta</button>
          {!operatorHasOwnPool && <button className="operator-button operator-button--secondary" type="button" onClick={() => void signUp()}>Crear cuenta de operador</button>}
        </details>}
        <p className="operator-footnote"><ShieldCheck size={15} /> La key no se guarda en el navegador: se cambia por una sesión protegida y ADMIN puede revocarla en cualquier momento.</p>
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
      <button className="operator-button operator-button--quiet" type="button" onClick={() => void signOut()}><LogOut size={16} /> Salir</button>
    </div></header>
    <div className="operator-content">
      <div className="operator-heading"><div><p className="operator-eyebrow">Consola privada</p><h1>Operación del puesto</h1>
        <p>Configura localmente la cámara y controla la sesión. Java confirma los pasos.</p></div>
        <span className={`operator-pill ${status ? 'is-connected' : 'is-pending'}`}><span />{status ? 'Cuenta verificada' : 'Puesto sin asignar'}</span>
      </div>

      {error && <p className="operator-error" role="alert">{error}</p>}
      {macNotice && <p className="operator-footnote" role="status">{macNotice}</p>}

      {!status && (operatorHasOwnPool || keyMode) && !checking && <section className="operator-panel" role="status">
        <div className="operator-panel-heading"><div><p className="operator-eyebrow">Cuenta sin puesto</p><h2>Aún no tienes un puesto asignado</h2></div><ShieldCheck /></div>
        <p>Pide a ADMIN que cree tu cuenta dentro de un puesto. Si ya la creó, es posible que haya sido deshabilitada.</p>
      </section>}

      {!status && !operatorHasOwnPool && !keyMode && <section className="operator-panel" aria-labelledby="claim-title">
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

      {!keyMode && (!station?.registered || (status && station.stationId !== status.grant.stationId)) && (
        <section className="operator-panel operator-panel--commission" aria-labelledby="commission-title">
          <div className="operator-panel-heading"><div><p className="operator-eyebrow">Configuración física</p><h2 id="commission-title">Registrar este equipo</h2></div><Camera /></div>
          <p>En el Mac conectado a Continuity, pega el enlace o token de activación que ADMIN te dio al crear el puesto (o abre el enlace directamente). Este registro es independiente de tu acceso personal.</p>
          <form className="operator-inline-form" onSubmit={(event) => void registerStation(event)}>
            <label htmlFor="operator-station-code">Token de activación del puesto</label>
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

      {status && <>
        <section className="operator-station-banner"><div><p className="operator-eyebrow">Puesto asignado</p><h2>{status.grant.stationName}</h2>
          <code>{status.grant.stationId}</code></div><span className="operator-pill is-connected"><span /> Java autorizado</span></section>

        <section className="operator-grid">
          <CameraLinkPanel linked={Boolean(stream)} busy={cameraBusy} error={cameraError} choices={cameraChoices}
            chosen={chosenCamera} onChoose={setChosenCamera} onLink={(deviceId) => void authorizeCamera(deviceId)} videoRef={videoRef}
            onLinkIphone={() => { setCameraError(null); setIphoneRequestedAt(Date.now()); }}
            agentNote={describeAgent({ agent, requested: iphoneRequested, waitedMs: iphoneRequestedAt === null ? 0 : now - iphoneRequestedAt })}
            onUseBrowser={() => void authorizeCamera()} onLinkPhone={() => void (isPhone ? linkPhoneCamera() : showPhoneLink())}
            isPhone={isPhone} phoneLink={phoneLink ? { url: phoneLink.url, secondsLeft: Math.max(0, Math.ceil((phoneLink.expiresAt - now) / 1_000)) } : null} />

          <div className="operator-panel operator-session-panel">
            <div className="operator-panel-heading"><div><p className="operator-eyebrow">Sesión remota</p><h2>Control de detección</h2></div><Activity /></div>
            <p className={`operator-footnote ${preflight.ready ? '' : 'operator-error'}`} role="status">{preflight.message}</p>
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
              <RehearsalPanel detectedStep={candidateStep || currentStep} onFeedback={async (step, correctedTo) => {
                const activeToken = currentToken();
                if (!activeToken || !activeSessionId) throw new Error('Sin sesión activa.');
                await operatorApi.stepFeedback(activeToken, activeSessionId, step, correctedTo);
              }} />
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
