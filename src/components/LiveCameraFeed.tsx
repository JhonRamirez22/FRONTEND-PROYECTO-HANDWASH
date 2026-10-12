import { useEffect, useRef, useState } from 'react';
import { LoaderCircle, ScanEye, Video, VideoOff, Wifi, WifiOff } from 'lucide-react';
import { useSessionStore } from '@/stores/sessionStore';
import { STEP_LABELS } from '@/types';
import { RuntimeEndpointConfig } from '@/lib/RuntimeEndpointConfig';
import type { DeploymentStatus } from '@/lib/DeploymentStatusService';
import { ProcessingPath } from './ProcessingPath';
import { useSession } from '@/hooks/useSession';
import { stopTracks } from '@/lib/ContinuityBrowserCameraService';
import type { CameraRelayState, ProducerTelemetry } from '@/lib/BrowserRtcCameraRelay';

type StreamStatus = 'idle' | 'connecting' | 'live' | 'offline';
type CameraHealth = 'connected' | 'reconnecting' | 'unknown';
type HandPresence = {
  handsVisible: number;
  warmupElapsedMs: number;
  warmupRequiredMs: number;
  warmupComplete: boolean;
  stepsEnabled: boolean;
};

function parseHandPresence(value: unknown): HandPresence | null {
  if (typeof value !== 'object' || value === null) return null;
  const status = value as Record<string, unknown>;
  const { handsVisible, warmupElapsedMs, warmupRequiredMs, warmupComplete, stepsEnabled } = status;
  if (!Number.isInteger(handsVisible) || (handsVisible as number) < 0 || (handsVisible as number) > 2
    || !Number.isInteger(warmupElapsedMs) || (warmupElapsedMs as number) < 0
    || !Number.isInteger(warmupRequiredMs) || (warmupRequiredMs as number) < 0
    || (warmupRequiredMs as number) > 10_000
    || typeof warmupComplete !== 'boolean' || typeof stepsEnabled !== 'boolean') return null;
  return {
    handsVisible: handsVisible as number,
    warmupElapsedMs: Math.min(warmupElapsedMs as number, warmupRequiredMs as number),
    warmupRequiredMs: warmupRequiredMs as number,
    warmupComplete,
    stepsEnabled,
  };
}

const STREAM_URL = RuntimeEndpointConfig.cameraStreamUrl();
const CAMERA_HEALTH_TIMEOUT_MS = 2_000;
const CAMERA_HEALTH_POLL_MS = 1_500;

interface LiveCameraFeedProps {
  backendStatus?: DeploymentStatus;
  backendLoading?: boolean;
  browserStream?: MediaStream | null;
  onToggleBrowserCamera?: () => Promise<boolean>;
  relayStatus?: CameraRelayState | 'idle';
  producerTelemetry?: ProducerTelemetry | null;
}

export function LiveCameraFeed({ backendStatus, backendLoading = true, browserStream: controlledStream,
  onToggleBrowserCamera, relayStatus = 'idle', producerTelemetry = null }: LiveCameraFeedProps) {
  const [status, setStatus] = useState<StreamStatus>('idle');
  const [cameraHealth, setCameraHealth] = useState<CameraHealth>('unknown');
  const [handPresence, setHandPresence] = useState<HandPresence | null>(null);
  const [retry, setRetry] = useState(0);
  const [linking, setLinking] = useState(false);
  const [linkMessage, setLinkMessage] = useState<string | null>(null);
  const [linkError, setLinkError] = useState(false);
  const [localBrowserStream, setLocalBrowserStream] = useState<MediaStream | null>(null);
  const browserStream = controlledStream === undefined ? localBrowserStream : controlledStream;
  const linkRequest = useRef<AbortController | null>(null);
  const videoElement = useRef<HTMLVideoElement | null>(null);
  const cloudMode = RuntimeEndpointConfig.isCloudMode();
  const { linkCamera, linkCloudCamera } = useSession();
  const sessionId = useSessionStore((state) => state.sessionId);
  const currentStep = useSessionStore((state) => state.currentStep);
  const isActive = useSessionStore((state) => state.isActive);
  const summary = useSessionStore((state) => state.summary);
  const retries = useSessionStore((state) => state.intentosReiniciados);
  const mode = useSessionStore((state) => state.modoEvaluacion);
  const intentionState = useSessionStore((state) => state.estadoIntencion);
  const setCameraHandsVisible = useSessionStore((state) => state.setCameraHandsVisible);

  const linkIphone = async () => {
    if (linkRequest.current) return;
    const controller = new AbortController();
    linkRequest.current = controller;
    setLinking(true);
    setLinkError(false);
    setLinkMessage('Buscando cámara de Continuidad…');
    try {
      if (cloudMode) {
        if (onToggleBrowserCamera) {
          const opened = await onToggleBrowserCamera();
          setStatus(opened ? 'connecting' : 'idle');
          setLinkMessage(opened
            ? isActive ? 'Cámara abierta; negociando WebRTC con el PC RTX.'
              : 'Vista previa lista. Inicia detección para enlazarla al PC RTX.'
            : 'Cámara desconectada.');
          setLinkError(false);
        } else if (browserStream) {
          stopTracks(browserStream);
          setLocalBrowserStream(null);
          setStatus('idle');
          setLinkMessage('Vista previa local desconectada.');
          setLinkError(false);
        } else {
          const result = await linkCloudCamera(controller.signal);
          if (controller.signal.aborted) {
            stopTracks(result.stream);
            return;
          }
          setLocalBrowserStream(result.stream);
          setStatus('connecting');
          setLinkMessage(result.message);
        }
      } else {
        const message = await linkCamera(controller.signal);
        if (controller.signal.aborted) return;
        setLinkMessage(message);
        // Linking an already healthy camera must not interrupt its stream.
        if (status === 'offline') {
          setStatus('connecting');
          setRetry((count) => count + 1);
        }
      }
    } catch (error) {
      if (linkRequest.current !== controller) return;
      setLinkError(true);
      setLinkMessage(error instanceof Error && error.name !== 'AbortError'
        ? error.message : 'No responde el capturador. Comprueba que el arranque local sigue activo.');
    } finally {
      if (linkRequest.current === controller) {
        linkRequest.current = null;
        setLinking(false);
      }
    }
  };

  useEffect(() => () => {
    linkRequest.current?.abort();
    linkRequest.current = null;
  }, []);

  useEffect(() => {
    const video = videoElement.current;
    if (!video || !browserStream) return;
    video.srcObject = browserStream;
    void video.play().catch(() => setLinkMessage('El navegador bloqueó la vista previa; vuelve a pulsar Enlazar iPhone.'));
    return () => { video.srcObject = null; };
  }, [browserStream]);

  useEffect(() => {
    if (cloudMode || isActive || !browserStream) return;
    stopTracks(browserStream);
    setLocalBrowserStream(null);
  }, [isActive, browserStream, cloudMode]);

  useEffect(() => () => {
    if (controlledStream === undefined) stopTracks(localBrowserStream);
  }, [controlledStream, localBrowserStream]);

  useEffect(() => {
    setStatus(browserStream ? 'live' : sessionId ? 'connecting' : 'idle');
    setCameraHealth('unknown');
    setHandPresence(null);
    setCameraHandsVisible(null);
    setRetry(0);
  }, [sessionId, browserStream, setCameraHandsVisible]);

  useEffect(() => {
    if (!sessionId || cloudMode) return;

    const healthUrl = new URL('/health', STREAM_URL);
    let active = true;
    let controller: AbortController | null = null;
    let timeout = 0;
    let requestTimeout = 0;

    const checkCameraHealth = async () => {
      const requestController = new AbortController();
      let timedOut = false;
      controller = requestController;
      requestTimeout = window.setTimeout(() => {
        timedOut = true;
        requestController.abort();
      }, CAMERA_HEALTH_TIMEOUT_MS);
      try {
        const response = await fetch(healthUrl, {
          cache: 'no-store',
          signal: requestController.signal,
        });
        if (!response.ok) throw new Error('Camera stream health unavailable');
        const health = await response.json() as {
          camera?: string; sessionId?: string | null; handPresence?: unknown;
        };
        if (!active) return;
        if (health.sessionId !== sessionId) {
          setCameraHealth('unknown');
          setHandPresence(null);
          setCameraHandsVisible(null);
          return;
        }
        setCameraHealth(health.camera === 'connected' ? 'connected' : 'reconnecting');
        const presence = parseHandPresence(health.handPresence);
        setHandPresence(presence);
        setCameraHandsVisible(presence?.handsVisible ?? null);
      } catch {
        if (active && (!requestController.signal.aborted || timedOut)) {
          setCameraHealth('unknown');
          setHandPresence(null);
          setCameraHandsVisible(null);
        }
      } finally {
        window.clearTimeout(requestTimeout);
        if (active) timeout = window.setTimeout(() => void checkCameraHealth(), CAMERA_HEALTH_POLL_MS);
      }
    };

    void checkCameraHealth();
    return () => {
      active = false;
      controller?.abort();
      window.clearTimeout(requestTimeout);
      window.clearTimeout(timeout);
    };
  }, [sessionId, setCameraHandsVisible, cloudMode]);

  useEffect(() => {
    if (!sessionId || cloudMode || status !== 'offline') return;
    const timeout = window.setTimeout(() => {
      setStatus('connecting');
      setRetry((count) => count + 1);
    }, 2500);
    return () => window.clearTimeout(timeout);
  }, [sessionId, status, cloudMode]);

  const streamUrl = !cloudMode && sessionId
    ? (() => {
      const url = new URL(STREAM_URL, window.location.href);
      url.searchParams.set('sessionId', sessionId);
      url.searchParams.set('retry', String(retry));
      return url.toString();
    })()
    : null;
  const handPresenceLabel = handPresence === null ? null
    : handPresence.stepsEnabled ? intentionState === 'LAVADO_PROBABLE'
      ? 'Dos manos visibles · seguimiento de pasos activo'
      : intentionState === 'PAUSA'
        ? 'Seguimiento en pausa · consulta el motivo'
        : 'Dos manos detectadas · verificando preparación'
      : handPresence.handsVisible < 2 ? `Manos en encuadre: ${handPresence.handsVisible}/2`
        : handPresence.warmupComplete ? 'Preparando detección de pasos'
          : `Estabilizando manos: ${(handPresence.warmupElapsedMs / 1000).toFixed(1)}/`
            + `${(handPresence.warmupRequiredMs / 1000).toFixed(1)} s`;

  return (
    <section className="panel camera-panel" aria-label="Video en vivo del lavado">
      <header className="panel-header">
        <div className="panel-heading-icon"><ScanEye size={17} aria-hidden="true" /></div>
        <h2>{cloudMode ? 'Cámara de Continuidad' : 'Cámara y detección YOLO'}</h2>
        <div className="camera-state" role="status" aria-live="polite">
          {cloudMode && status === 'live' ? (
            <><Wifi className="h-4 w-4 text-warning" aria-hidden="true" /><span>Vista previa local</span></>
          ) : status === 'live' && cameraHealth === 'connected' ? (
            <><Wifi className="h-4 w-4 text-success" aria-hidden="true" /><span>En vivo</span></>
          ) : status === 'live' && cameraHealth === 'reconnecting' ? (
            <><WifiOff className="h-4 w-4 text-warning" aria-hidden="true" /><span>Cámara reconectando</span></>
          ) : status === 'live' ? (
            <><Wifi className="h-4 w-4 text-warning" aria-hidden="true" /><span>Stream conectado · cámara sin verificar</span></>
          ) : status === 'idle' ? (
            <><WifiOff className="h-4 w-4 text-muted-foreground" aria-hidden="true" /><span>Sin cámara</span></>
          ) : status === 'connecting' ? (
            <><LoaderCircle className="h-4 w-4 animate-spin text-warning" aria-hidden="true" /><span>Conectando</span></>
          ) : (
            <><WifiOff className="h-4 w-4 text-muted-foreground" aria-hidden="true" /><span>Sin señal</span></>
          )}
        </div>
      </header>

      <div className="camera-toolbar">
        <button type="button" onClick={() => void linkIphone()}
          disabled={linking}
          className="button-primary">
          {linking ? <LoaderCircle className="animate-spin" size={17} aria-hidden="true" /> : (
            <span className="t-icon-swap" data-state={cloudMode && browserStream ? 'b' : 'a'} aria-hidden="true">
              <Video className="t-icon" data-icon="a" size={17} />
              <VideoOff className="t-icon" data-icon="b" size={17} />
            </span>
          )}
          <span>{linking ? 'Enlazando…' : cloudMode && browserStream ? 'Desconectar iPhone' : 'Enlazar iPhone'}</span>
        </button>
        <span className={`camera-message ${linkError ? 'is-error' : ''}`}
          role={linkError ? 'alert' : 'status'}>
          {linkMessage ?? (sessionId ? 'iPhone cercano, con Cámara de Continuidad activada.'
            : 'Selecciona la cámara principal del iPhone desde este navegador.')}
        </span>
        {cloudMode && <span className="camera-limit-note">
          {producerTelemetry?.activeModelsReady && producerTelemetry.javaTransport === 'connected'
            ? `YOLO en RTX · ${producerTelemetry.inferenceFps.toFixed(1)} fps · observaciones enviadas a Java; pasos confirmados abajo`
            : relayStatus === 'connected' ? 'Video WebRTC conectado al PC · esperando estado de inferencia'
              : relayStatus === 'failed' ? 'No se conectó el PC RTX; revisa que el productor esté activo en la misma red'
                : browserStream ? isActive ? 'Cámara lista · esperando conexión WebRTC con el PC RTX'
                  : 'Vista previa local · inicia la sesión para enviar video al PC RTX'
                  : 'Sin grabación · el PC RTX debe estar activo para recibir video'}
        </span>}
      </div>

      {cloudMode && <ProcessingPath
        previewReady={Boolean(browserStream)}
        backendStatus={backendStatus}
        backendLoading={backendLoading}
        relayStatus={relayStatus}
        producerTelemetry={producerTelemetry}
      />}

      <div className="camera-stage">
        {cloudMode && (
          <video
            ref={videoElement}
            autoPlay
            playsInline
            muted
            aria-label="Vista de Continuity Camera; WebRTC transmite video directo al PC RTX cuando el enlace está activo"
            className={`camera-video ${browserStream ? 'is-visible' : ''}`}
            onLoadedMetadata={() => setStatus('live')}
            onError={() => { setStatus('offline'); setLinkError(true); }}
          />
        )}
        {streamUrl && (
          <img
            key={`${sessionId}:${retry}`}
            src={streamUrl}
            alt="Video en vivo de las manos con las detecciones del modelo YOLO superpuestas"
            className={`camera-video ${status === 'live' ? 'is-visible' : ''}`}
            onLoad={() => setStatus('live')}
            onError={() => setStatus('offline')}
          />
        )}

        {status !== 'live' && (
          <div className="camera-empty-state">
            <div className="camera-empty-content">
              <div className="camera-empty-icon">
                {status === 'connecting' ? <LoaderCircle className="animate-spin" size={20} /> : <WifiOff size={20} />}
              </div>
              <p className="camera-empty-title">
                {status === 'idle' ? 'Enlaza el iPhone para comenzar'
                  : status === 'connecting' ? 'Esperando la cámara del iPhone'
                    : 'No llega el video de esta sesión'}
              </p>
              <p className="camera-empty-copy">
                {status === 'idle'
                  ? 'No necesitas códigos ni una app en el iPhone.'
                  : 'Comprueba que el iPhone esté disponible y que el launcher siga activo. Pulsa Enlazar iPhone para reintentar.'}
              </p>
            </div>
          </div>
        )}

        <div className="camera-caption">
          {isActive
            ? currentStep ? `Movimiento actual: ${STEP_LABELS[currentStep as keyof typeof STEP_LABELS] ?? currentStep}` : retries > 0 ? `Intento reiniciado · vuelve a empezar por ${mode === 'PROTOCOLO_OMS' ? 'mojar las manos' : 'Palmas'}` : cloudMode && relayStatus !== 'connected' ? 'Sesión Java activa · esperando cámara y PC RTX' : 'Sesión activa · esperando el primer paso'
            : summary ? 'Sesión finalizada · consulta el resumen'
              : cloudMode ? browserStream ? 'Vista previa local · el enlace WebRTC se activa al iniciar la sesión' : 'Enlaza el iPhone para comenzar'
                : 'Enlaza el iPhone para evaluar los movimientos'}
          {isActive && mode !== 'PROTOCOLO_OMS' && handPresenceLabel && (
            <p className="mt-1 text-white/80" role="status" aria-live="polite">{handPresenceLabel}</p>
          )}
        </div>
      </div>
    </section>
  );
}
