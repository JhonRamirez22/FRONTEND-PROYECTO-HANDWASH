import { useCallback, useEffect, useRef, useState } from 'react';
import { DeploymentStatusService } from '@/lib/DeploymentStatusService';
import { stationApi } from '@/lib/StationApi';
import { evaluateStationHealth, type StationGate } from '@/lib/StationHealth';
import { useSession } from '@/hooks/useSession';
import { useStationCamera } from '@/hooks/useStationCamera';
import { useCameraRecovery } from '@/hooks/useCameraRecovery';
import { useRelaySupervisor } from '@/hooks/useRelaySupervisor';
import { useSessionStore } from '@/stores/sessionStore';
import { useConnectionStore } from '@/stores/connectionStore';
import { LiveCameraFeed } from './LiveCameraFeed';
import { KioskProgress } from './KioskProgress';

type Gate = StationGate;
const deployment = new DeploymentStatusService();

export function KioskScreen() {
  const [gate, setGate] = useState<Gate>('checking');
  const [stationName, setStationName] = useState('Puesto de lavado');
  const [clinicalStatus, setClinicalStatus] = useState(DeploymentStatusService.unverified());
  const { stream } = useStationCamera();
  const { resume, disconnect } = useSession();
  const sessionId = useSessionStore((state) => state.sessionId);
  const active = useSessionStore((state) => state.isActive);
  const connection = useConnectionStore((state) => state.status);
  const reconnectAttempts = useConnectionStore((state) => state.reconnectAttempts);
  const generation = useRef(0);
  const supervised = useRelaySupervisor(active ? sessionId : null, stream);
  const { state: relayStatus, telemetry } = supervised;
  useCameraRecovery(gate === 'ready' && active, stream);
  const health = evaluateStationHealth({
    gate, sessionActive: active, hasStream: Boolean(stream),
    // The socket reports "reconnecting" during each retry; after a failed attempt that is still an outage.
    websocket: connection === 'reconnecting' && reconnectAttempts > 0 ? 'disconnected' : connection,
    relay: relayStatus, relayStalledMs: supervised.stalledMs, telemetryStale: supervised.telemetryStale,
    javaTransport: telemetry?.javaTransport ?? null,
  });
  const connectionTone = health.code === 'CHECKING' ? 'checking' : health.code === 'SETUP' ? 'setup'
    : health.level === 'offline' ? 'error' : health.level === 'ok' ? 'connected' : 'waiting';
  const connectionMessage = health.level === 'ok'
    ? 'Evaluación en curso · estado confirmado por Java.' : `${health.title}. ${health.detail}`;

  const refresh = useCallback(async () => {
    const current = ++generation.current;
    const currentSessionId = useSessionStore.getState().sessionId;
    try {
      const status = await stationApi.status(currentSessionId);
      if (current !== generation.current) return;
      if (!status.registered || !status.stationName) {
        setGate('unregistered');
        if (currentSessionId) {
          disconnect();
          useSessionStore.getState().endSession();
        }
      } else {
        setStationName(status.stationName);
        if (status.resumeError) {
          setGate('resume-error');
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

  return (
    <main className="patient-kiosk" aria-label="Puesto de lavado de manos">
      <header className="kiosk-header">
        <div className="kiosk-brand"><img src="/handwash-logo.png" alt="" /><strong>HandWash</strong></div>
        <div className={`kiosk-connection kiosk-connection--${connectionTone}`} role="status" aria-live="polite">
          <span className="kiosk-connection-indicator" aria-hidden="true" />
          <span>{connectionMessage}</span>
        </div>
      </header>
      {health.level === 'offline' && (
        <div className="kiosk-offline-banner" role="alert">
          <strong>{health.title}</strong><span>{health.detail}</span>
        </div>
      )}
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
