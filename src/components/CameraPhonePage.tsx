import { useCallback, useEffect, useRef, useState } from 'react';
import { CameraPairingApi, cameraCodeFromHash } from '@/lib/CameraPairingApi';
import { BrowserRtcCameraRelay, type CameraRelayState } from '@/lib/BrowserRtcCameraRelay';
import { RelaySupervisor } from '@/lib/RelaySupervisor';
import type { WebRtcAccess } from '@/lib/StationApi';
import { useScreenWakeLock } from '@/hooks/useScreenWakeLock';

const TOKEN_KEY = 'handwash.camera.token';

type Phase = 'redeeming' | 'opening' | 'waiting' | 'sending' | 'reconnecting' | 'replaced' | 'expired' | 'no-permission' | 'no-code' | 'error';

interface SupervisorLike {
  run(sessionId: string, stream: MediaStream, onState: (state: CameraRelayState, attempt: number) => void): () => void;
}

interface CameraPhonePageProps {
  api?: CameraPairingApi;
  openCamera?: (facing: 'environment' | 'user') => Promise<MediaStream>;
  makeSupervisor?: (access: (sessionId: string) => Promise<WebRtcAccess>) => SupervisorLike;
  pollMs?: number;
}

const defaultOpenCamera = (facing: 'environment' | 'user') => navigator.mediaDevices.getUserMedia({
  video: { facingMode: { ideal: facing }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false,
});
const defaultSupervisor = (access: (sessionId: string) => Promise<WebRtcAccess>): SupervisorLike =>
  new RelaySupervisor(new BrowserRtcCameraRelay(access));

const HEADLINE: Record<Phase, string> = {
  redeeming: 'Conectando…',
  opening: 'Abriendo la cámara…',
  waiting: 'Esperando el lavado',
  sending: 'Enviando al PC',
  reconnecting: 'Reconectando…',
  replaced: 'Cámara reemplazada',
  expired: 'La conexión venció',
  'no-permission': 'Falta el permiso de cámara',
  'no-code': 'Escanea el QR del panel',
  error: 'No se pudo conectar',
};

const DETAIL: Record<Phase, string> = {
  redeeming: 'Validando el código del panel.',
  opening: 'Acepta el permiso de cámara cuando el navegador lo pida.',
  waiting: 'En cuanto el panel inicie el lavado, el video sale solo. Deja esta pantalla abierta.',
  sending: 'Deja el celular apoyado apuntando a las manos, con esta pantalla abierta.',
  reconnecting: 'Se perdió la conexión con el PC; se reintenta solo.',
  replaced: 'Otro celular escaneó el QR y ahora es la cámara del puesto.',
  expired: 'Escanea el QR de nuevo en el panel.',
  'no-permission': 'Activa el permiso de cámara para este sitio en los ajustes del navegador y recarga.',
  'no-code': 'Abre la cámara del celular y apunta al QR que muestra el panel.',
  error: 'Escanea el QR de nuevo o reintenta en unos segundos.',
};

/** The page a phone opens from the panel's QR: it publishes its camera to the station's PC, nothing else. */
export function CameraPhonePage({
  api = new CameraPairingApi(), openCamera = defaultOpenCamera, makeSupervisor = defaultSupervisor, pollMs = 2_000,
}: CameraPhonePageProps) {
  const [phase, setPhase] = useState<Phase>('redeeming');
  const [stationName, setStationName] = useState('');
  const [facing, setFacing] = useState<'environment' | 'user'>('environment');
  const [token, setToken] = useState<string | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  useScreenWakeLock(stream !== null && (phase === 'sending' || phase === 'waiting' || phase === 'reconnecting'));

  // 1. The QR code (once) or the token kept from a previous scan on this phone.
  useEffect(() => {
    let alive = true;
    const code = cameraCodeFromHash(window.location.hash);
    const saved = (() => { try { return window.sessionStorage.getItem(TOKEN_KEY); } catch { return null; } })();
    if (!code) {
      if (saved) setToken(saved); else setPhase('no-code');
      return undefined;
    }
    window.history.replaceState(null, '', `${window.location.pathname}#/camera`);
    api.redeem(code).then((paired) => {
      if (!alive) return;
      try { window.sessionStorage.setItem(TOKEN_KEY, paired.token); } catch { /* the page still works until it is closed */ }
      setStationName(paired.stationName);
      setToken(paired.token);
    }).catch((cause: unknown) => {
      if (alive) { setPhase('expired'); setStationName(cause instanceof Error ? cause.message : ''); }
    });
    return () => { alive = false; };
  }, [api]);

  // 2. The camera.
  const openFacing = useCallback(async (wanted: 'environment' | 'user') => {
    try {
      const opened = await openCamera(wanted);
      setStream((previous) => { previous?.getTracks().forEach((track) => track.stop()); return opened; });
      setPhase('waiting');
    } catch (cause) {
      setPhase(cause instanceof DOMException && cause.name === 'NotAllowedError' ? 'no-permission' : 'error');
    }
  }, [openCamera]);

  useEffect(() => {
    if (!token) return;
    setPhase('opening');
    void openFacing(facing);
    // The camera is reopened only when the phone is flipped; a new token alone keeps the same stream.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, facing]);

  useEffect(() => {
    if (videoRef.current) videoRef.current.srcObject = stream;
  }, [stream]);

  // 3. Follow the station's active session: publish to it, switch when it changes, stop when replaced.
  useEffect(() => {
    if (!token || !stream) return undefined;
    let alive = true;
    let currentSession: string | null = null;
    let stopRelay: (() => void) | null = null;
    const supervisor = makeSupervisor(async (sessionId) => {
      const result = await api.ticket(token);
      if (result.kind !== 'ready' || result.sessionId !== sessionId) throw new Error('La sesión cambió');
      return result.access;
    });
    const stopAll = () => { stopRelay?.(); stopRelay = null; currentSession = null; };
    const poll = async () => {
      const state = await api.state(token);
      if (!alive) return;
      if (state.kind === 'replaced') { stopAll(); setPhase('replaced'); return; }
      if (state.kind === 'expired') { stopAll(); setPhase('expired'); return; }
      if (state.kind === 'waiting') { if (currentSession) stopAll(); setPhase((p) => (p === 'sending' || p === 'reconnecting' ? 'waiting' : p)); return; }
      if (state.sessionId !== currentSession) {
        stopRelay?.();
        currentSession = state.sessionId;
        stopRelay = supervisor.run(state.sessionId, stream, (relayState) => {
          if (!alive) return;
          setPhase(relayState === 'connected' ? 'sending' : 'reconnecting');
        });
      }
    };
    void poll();
    const timer = window.setInterval(() => void poll(), pollMs);
    return () => { alive = false; window.clearInterval(timer); stopAll(); };
  }, [token, stream, api, makeSupervisor, pollMs]);

  const live = phase === 'sending' || phase === 'waiting' || phase === 'reconnecting';
  return (
    <main className="camera-phone">
      <header className="camera-phone-bar">
        <strong>HandWash</strong>
        <span>{stationName && phase !== 'expired' ? stationName : 'Cámara'}</span>
      </header>
      <section className="camera-phone-body">
        <h1>{HEADLINE[phase]}</h1>
        <p role="status">{DETAIL[phase]}</p>
        {live && <div className="camera-phone-preview">
          <video ref={videoRef} autoPlay muted playsInline aria-label="Vista previa de la cámara" />
          <span className={`camera-phone-badge is-${phase}`}>{phase === 'sending' ? 'Enviando' : phase === 'waiting' ? 'Lista' : 'Reconectando'}</span>
        </div>}
        {live && <button className="button-quiet camera-phone-flip" type="button" onClick={() => setFacing((value) => (value === 'environment' ? 'user' : 'environment'))}>
          Cambiar a cámara {facing === 'environment' ? 'frontal' : 'trasera'}
        </button>}
        {live && <p className="camera-phone-note">La pantalla se mantiene encendida mientras envías video.</p>}
      </section>
    </main>
  );
}
