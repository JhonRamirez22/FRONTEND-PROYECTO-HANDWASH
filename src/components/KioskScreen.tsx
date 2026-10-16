import { useCallback, useEffect, useRef, useState } from 'react';
import { BrowserRtcCameraRelay, type CameraRelayState, type ProducerTelemetry } from '@/lib/BrowserRtcCameraRelay';
import { DeploymentStatusService } from '@/lib/DeploymentStatusService';
import { stationApi } from '@/lib/StationApi';
import { useSession } from '@/hooks/useSession';
import { useStationCamera } from '@/hooks/useStationCamera';
import { useSessionStore } from '@/stores/sessionStore';
import { useConnectionStore } from '@/stores/connectionStore';
import { LiveCameraFeed } from './LiveCameraFeed';
import { KioskProgress } from './KioskProgress';

type Gate = 'checking' | 'ready' | 'unregistered' | 'unavailable' | 'resume-error';
const relay = new BrowserRtcCameraRelay();
const deployment = new DeploymentStatusService();

export function KioskScreen() {
  const [gate, setGate] = useState<Gate>('checking');
  const [stationName, setStationName] = useState('Puesto de lavado');
  const [relayStatus, setRelayStatus] = useState<CameraRelayState | 'idle'>('idle');
  const [telemetry, setTelemetry] = useState<ProducerTelemetry | null>(null);
  const [connectionMessage, setConnectionMessage] = useState('Verificando el puesto…');
  const [clinicalStatus, setClinicalStatus] = useState(DeploymentStatusService.unverified());
  const { stream } = useStationCamera();
  const { resume, disconnect } = useSession();
  const sessionId = useSessionStore((state) => state.sessionId);
  const active = useSessionStore((state) => state.isActive);
  const intention = useSessionStore((state) => state.estadoIntencion);
  const connection = useConnectionStore((state) => state.status);
  const generation = useRef(0);
  const connectionTone = gate === 'checking' ? 'checking'
    : gate === 'unregistered' || (active && !stream) ? 'setup'
      : gate === 'unavailable' || gate === 'resume-error'
        || (active && (relayStatus === 'failed' || connection === 'disconnected')) ? 'error'
        : telemetry?.activeModelsReady && telemetry.javaTransport === 'connected' ? 'connected'
          : 'waiting';

  const refresh = useCallback(async () => {
    const current = ++generation.current;
    const currentSessionId = useSessionStore.getState().sessionId;
    try {
      const status = await stationApi.status(currentSessionId);
      if (current !== generation.current) return;
      if (!status.registered || !status.stationName) {
        setGate('unregistered');
        setConnectionMessage('Puesto pendiente de configuración. Solicita ayuda al operador.');
        if (currentSessionId) {
          disconnect();
          useSessionStore.getState().endSession();
        }
      } else {
        setStationName(status.stationName);
        if (status.resumeError) {
          setGate('resume-error');
          setConnectionMessage('Sesión no recuperable. Intervención del operador requerida.');
        } else if (status.unchangedActiveSession && currentSessionId) {
          setGate('ready');
        } else if (status.activeSession) {
          setGate('ready');
          if (currentSessionId !== status.activeSession.sessionId) resume(status.activeSession);
        } else {
          setGate('ready');
          if (currentSessionId) {
            disconnect();
            useSessionStore.getState().endSession();
          }
        }
      }
    } catch {
      if (current !== generation.current) return;
      setGate('unavailable');
      setConnectionMessage('Conexión interrumpida. El puesto requiere revisión del operador.');
    }
  }, [disconnect, resume]);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), 2_000);
    return () => {
      window.clearInterval(timer);
      generation.current += 1;
    };
  }, [refresh]);

  useEffect(() => {
    const controller = new AbortController();
    void deployment.load(controller.signal).then(setClinicalStatus).catch(() => {
      if (!controller.signal.aborted) setClinicalStatus(DeploymentStatusService.unverified());
    });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!active || !sessionId || !stream) {
      setRelayStatus('idle');
      setTelemetry(null);
      return;
    }
    const controller = new AbortController();
    let mounted = true;
    let close: (() => void) | null = null;
    setRelayStatus('connecting');
    void relay.connect(sessionId, stream, (state) => {
      if (mounted) setRelayStatus(state);
    }, controller.signal, (next) => {
      if (mounted) setTelemetry(next);
    }).then((release) => {
      if (mounted) close = release;
      else release();
    }).catch(() => {
      if (mounted) setRelayStatus('failed');
    });
    return () => {
      mounted = false;
      controller.abort();
      close?.();
    };
  }, [active, sessionId, stream]);

  useEffect(() => {
    if (gate === 'checking') setConnectionMessage('Verificando el puesto…');
    else if (gate === 'unregistered') setConnectionMessage('Puesto pendiente de configuración. Solicita ayuda al operador.');
    else if (gate === 'resume-error') setConnectionMessage('Sesión no recuperable. Intervención del operador requerida.');
    else if (gate === 'unavailable') setConnectionMessage('Conexión interrumpida. El puesto requiere revisión del operador.');
    else if (!active) setConnectionMessage('Esperando al operador.');
    else if (!stream) setConnectionMessage('Sesión activa · cámara sin conexión. Solicita ayuda al operador.');
    else if (relayStatus === 'failed') setConnectionMessage('Conexión con el PC interrumpida. Solicita ayuda al operador.');
    else if (telemetry?.activeModelsReady && telemetry.javaTransport === 'connected') {
      setConnectionMessage('Evaluación en curso · estado confirmado por Java.');
    } else if (relayStatus === 'connected') setConnectionMessage('Video conectado · esperando inferencia del PC.');
    else if (connection === 'reconnecting' || connection === 'disconnected') {
      setConnectionMessage('Reconectando con Java…');
    } else setConnectionMessage('Sesión activa · esperando al PC con YOLO.');
  }, [active, connection, gate, intention, relayStatus, stream, telemetry]);

  return (
    <main className="patient-kiosk" aria-label="Puesto de lavado de manos">
      <header className="kiosk-header">
        <div className="kiosk-brand"><img src="/handwash-logo.png" alt="" /><strong>HandWash</strong></div>
        <div className={`kiosk-connection kiosk-connection--${connectionTone}`} role="status" aria-live="polite">
          <span className="kiosk-connection-indicator" aria-hidden="true" />
          <span>{connectionMessage}</span>
        </div>
      </header>
      <div className="kiosk-layout">
        <div className="kiosk-camera-region">
          <LiveCameraFeed passive browserStream={stream} relayStatus={relayStatus}
            producerTelemetry={telemetry} backendStatus={clinicalStatus} backendLoading={false} />
        </div>
        <KioskProgress />
      </div>
      <footer className="kiosk-footer">{stationName} · Piloto no clínico · no se guarda video ni imágenes</footer>
    </main>
  );
}
