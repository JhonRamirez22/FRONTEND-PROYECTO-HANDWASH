import { memo, useCallback, useEffect, useState, type ReactNode } from 'react';
import { LoaderCircle, Play, Square } from 'lucide-react';
import { OperatorApi, SessionExpiredError, type OperatorStatus, type ShiftView } from '@/lib/OperatorApi';
import { KEY_SESSION, OperatorKeySession, phoneCodeFromHash } from '@/lib/OperatorKeySession';
import { useWebSocket } from '@/hooks/useWebSocket';
import { usePreviewCanvas, type DetectedSummary } from '@/hooks/usePreviewCanvas';
import { useSessionStore } from '@/stores/sessionStore';
import { KioskProgress } from './KioskProgress';
import { QrImage } from './QrImage';

const operatorApi = new OperatorApi();
const keySession = new OperatorKeySession();
const DEMO_SHIFT_HOURS = 2;
const PAIR_RENEW_MS = 100_000;

type Health = 'ok' | 'wait' | 'off';

function HealthItem({ label, state, detail }: { label: string; state: Health; detail: string }) {
  return (
    <div className="live-health-item">
      <span className={`live-dot is-${state}`} aria-hidden="true" />
      <div><strong>{label}</strong><span>{detail}</span></div>
    </div>
  );
}

/**
 * The phone's picture with the PC's boxes over it. It lives in its own component so that ~15 new frames per second
 * repaint only this <canvas>: the panel around it re-renders only when "is it live" changes.
 */
const PreviewImage = memo(function PreviewImage({ sessionId, getTicket, onLive, onDetected, empty }: {
  sessionId: string | null;
  getTicket: (sessionId: string) => Promise<string>;
  onLive: (live: boolean) => void;
  onDetected: (detected: DetectedSummary | null) => void;
  empty: ReactNode;
}) {
  const { attachCanvas, live, detected } = usePreviewCanvas(sessionId, getTicket);
  useEffect(() => { onLive(live); }, [live, onLive]);
  useEffect(() => { onDetected(detected); }, [detected, onDetected]);
  return <>
    <canvas ref={attachCanvas} className="live-video-canvas" role="img" aria-label="Cámara con las manos encuadradas" hidden={!live} />
    {!live && empty}
  </>;
});

const previewTicket = (id: string) => operatorApi.websocketTicket(KEY_SESSION, id);

/** What the professor opens from the ADMIN link: start the camera, scan the QR, watch the boxes and the steps. */
export function LivePanel() {
  const [keyMode, setKeyMode] = useState(keySession.isActive());
  const [status, setStatus] = useState<OperatorStatus | null>(null);
  const [shift, setShift] = useState<ShiftView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pair, setPair] = useState<{ url: string } | null>(null);
  const sessionId = useSessionStore((state) => state.sessionId);
  const active = useSessionStore((state) => state.isActive);
  const { connect, disconnect } = useWebSocket(async (id) => operatorApi.websocketTicket(KEY_SESSION, id));
  const [previewLive, setPreviewLive] = useState(false);
  const [detected, setDetected] = useState<DetectedSummary | null>(null);

  // The ADMIN link (#/panel?phone=CODE) is traded once for this browser's own session.
  useEffect(() => {
    const code = phoneCodeFromHash(window.location.hash);
    if (!code || keyMode) return;
    window.history.replaceState(null, '', `${window.location.pathname}#/panel`);
    setBusy(true);
    keySession.loginWithPhoneCode(code)
      .then(() => { setKeyMode(true); setError(null); })
      .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : 'No se pudo abrir el panel.'))
      .finally(() => setBusy(false));
  }, [keyMode]);

  const refresh = useCallback(async () => {
    try {
      const [operatorStatus, currentShift] = await Promise.all([
        operatorApi.status(KEY_SESSION), operatorApi.shiftStatus(KEY_SESSION).catch(() => null),
      ]);
      setStatus(operatorStatus);
      setShift(currentShift);
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
      if (cause instanceof SessionExpiredError) {
        keySession.clear();
        setKeyMode(false);
        setError('El enlace del panel venció. Pide otro a ADMIN.');
      } else {
        setError(cause instanceof Error ? cause.message : 'No se pudo consultar el puesto.');
      }
    }
  }, [connect, disconnect]);

  useEffect(() => {
    if (!keyMode) return undefined;
    void refresh();
    const timer = window.setInterval(() => void refresh(), 4_000);
    return () => window.clearInterval(timer);
  }, [keyMode, refresh]);

  // While no camera is sending, keep a fresh QR on screen (a code lives two minutes).
  const wantsQr = keyMode && Boolean(shift?.active) && !previewLive;
  useEffect(() => {
    if (!wantsQr) { setPair(null); return undefined; }
    let alive = true;
    const renew = () => {
      operatorApi.cameraPair(KEY_SESSION)
        .then((result) => { if (alive) setPair({ url: `${window.location.origin}/#/camera?c=${result.code}` }); })
        .catch(() => { if (alive) setPair(null); });
    };
    renew();
    const timer = window.setInterval(renew, PAIR_RENEW_MS);
    return () => { alive = false; window.clearInterval(timer); };
  }, [wantsQr]);

  async function startCamera() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await operatorApi.startShift(KEY_SESSION, DEMO_SHIFT_HOURS, 'AGUA_Y_JABON');
      await refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'No se pudo iniciar.'); }
    finally { setBusy(false); }
  }

  async function stopShift() {
    if (busy) return;
    setBusy(true);
    try {
      await operatorApi.stopShift(KEY_SESSION);
      disconnect();
      useSessionStore.getState().endSession();
      await refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'No se pudo terminar.'); }
    finally { setBusy(false); }
  }

  if (!keyMode) {
    return (
      <main className="live-panel live-panel--empty">
        <h1>Panel de lavado</h1>
        {busy ? <p role="status"><LoaderCircle className="animate-spin" size={16} /> Abriendo el panel…</p>
          : <p role="status">{error ?? 'Abre el enlace que te dio ADMIN para ver el panel.'}</p>}
      </main>
    );
  }

  const shiftActive = Boolean(shift?.active);
  const station = status?.grant.stationName ?? '';
  const chip = !shiftActive ? 'Sin cámara' : previewLive ? 'En vivo' : 'Esperando cámara';
  return (
    <main className="live-panel">
      <header className="live-panel-bar">
        <strong>HandWash</strong>
        <span>{station ? `${station} · ` : ''}{shiftActive ? 'Demostración en curso' : 'Demostración detenida'}</span>
        {shiftActive && <button className="button-quiet" type="button" onClick={() => void stopShift()} disabled={busy}><Square size={14} /> Terminar</button>}
      </header>

      <section className="live-panel-title">
        <div>
          <h1>Lavado de manos en vivo</h1>
          <p>{!shiftActive ? 'Pulsa “Iniciar cámara” y escanea el código con tu celular.'
            : previewLive ? 'Lava las manos frente a la cámara; los pasos avanzan al confirmarlos.'
              : 'Escanea el código con tu iPhone o Android para conectar la cámara.'}</p>
        </div>
        <span className="live-chip"><span className={`live-dot is-${previewLive ? 'ok' : 'wait'}`} aria-hidden="true" />{chip}</span>
      </section>
      {error && <p className="form-error" role="alert">{error}</p>}

      <div className="live-panel-main">
        <section className="live-video" aria-label="Cámara con detección">
          <div className="live-video-head"><h2>Cámara y detección</h2><span>{previewLive ? 'Cámara conectada' : 'Sin cámara'}</span></div>
          <div className="live-video-stage">
            <PreviewImage sessionId={active ? sessionId : null} getTicket={previewTicket} onLive={setPreviewLive} onDetected={setDetected} empty={
              <div className="live-video-empty">
                <strong>{shiftActive ? 'Esperando la cámara del celular' : 'La cámara no está iniciada'}</strong>
                <span>{shiftActive ? 'Escanea el código de abajo.' : 'Pulsa “Iniciar cámara”.'}</span>
              </div>} />
          </div>
        </section>
        <KioskProgress evaluating={previewLive} detected={previewLive ? detected : null} />
      </div>

      <div className="live-panel-main">
        <section className="live-card" aria-label="Conectar cámara">
          {!shiftActive
            ? <div className="live-start">
              <h2>Empieza aquí</h2>
              <p>Abre un turno de demostración de {DEMO_SHIFT_HOURS} horas y muestra el código para conectar la cámara.</p>
              <button className="button-primary" type="button" onClick={() => void startCamera()} disabled={busy}>
                {busy ? <LoaderCircle className="animate-spin" size={16} /> : <Play size={16} />} Iniciar cámara
              </button>
            </div>
            : pair
              ? <div className="live-qr">
                <QrImage value={pair.url} label="Código QR para conectar la cámara del celular" size={176} />
                <div>
                  <h2>Conecta una cámara</h2>
                  <p>Escanea con la cámara de tu iPhone o Android. Se abre una página sola, sin instalar nada ni escribir claves.</p>
                  <p className="live-note">El código sirve una vez y se renueva solo. Si escanean otro celular, la cámara anterior se reemplaza.</p>
                </div>
              </div>
              : <div className="live-start"><h2>Conecta una cámara</h2><p>{previewLive ? 'La cámara está enviando video.' : 'Preparando el código…'}</p></div>}
        </section>
        <section className="live-card" aria-label="Estado de la conexión">
          <h2>Conexión de punta a punta</h2>
          <HealthItem label="Sesión de lavado" state={active ? 'ok' : shiftActive ? 'wait' : 'off'} detail={active ? 'Activa en el servidor' : shiftActive ? 'Abriendo' : 'Sin turno'} />
          <HealthItem label="Video con cajas" state={previewLive ? 'ok' : shiftActive ? 'wait' : 'off'} detail={previewLive ? 'Llega del PC' : 'Esperando al celular y al PC'} />
        </section>
      </div>
    </main>
  );
}
