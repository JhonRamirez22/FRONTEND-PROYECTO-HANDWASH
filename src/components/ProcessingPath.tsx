import type { DeploymentStatus } from '@/lib/DeploymentStatusService';
import type { CameraRelayState, ProducerTelemetry } from '@/lib/BrowserRtcCameraRelay';

interface ProcessingPathProps {
  previewReady: boolean;
  backendStatus?: DeploymentStatus;
  backendLoading: boolean;
  relayStatus: CameraRelayState | 'idle';
  producerTelemetry?: ProducerTelemetry | null;
}

/** Makes the camera, future RTX producer and Java authority distinct at a glance. */
export function ProcessingPath({ previewReady, backendStatus, backendLoading, relayStatus,
  producerTelemetry = null }: ProcessingPathProps) {
  const backendReady = !backendLoading && backendStatus !== undefined
    && backendStatus.mode !== 'UNVERIFIED';
  const producerMessage = producerTelemetry?.javaTransport === 'rejected'
    ? 'Java rechazó el contrato del productor; revisa la configuración RTX'
    : producerTelemetry?.javaTransport === 'session-ended'
      ? 'Java cerró la sesión del puesto'
      : producerTelemetry?.javaTransport === 'reauthentication-required'
        ? 'Renovando la credencial de sesión con Java'
        : producerTelemetry?.javaTransport === 'retrying'
          ? 'Java no responde; reintentando el envío'
          : producerTelemetry?.activeModelsReady && producerTelemetry.javaTransport === 'connected'
            ? `Inferencia activa · ${producerTelemetry.inferenceFps.toFixed(1)} fps · eventos enviados a Java; el estado confirmado se muestra abajo`
            : producerTelemetry?.modelsReady ? 'Modelos cargados; esperando inferencia o envío a Java'
              : relayStatus === 'connected' ? 'WebRTC conectado; esperando estado de modelos e inferencia'
                : relayStatus === 'failed' ? 'WebRTC sin conexión; revisa RTX y red'
                  : relayStatus === 'connecting' ? 'Abriendo señalización segura…'
                    : 'Esperando PC RTX autenticado';

  return (
    <ol className="connection-path" aria-label="Ruta de procesamiento">
      <li className={`connection-node ${previewReady ? 'is-ready' : 'is-waiting'}`}>
        <span className="connection-node-index" aria-hidden="true">01</span>
        <span className="connection-node-copy">
          <strong>Continuity</strong>
          <span>{previewReady ? 'Vista previa local' : 'Cámara sin enlazar'}</span>
        </span>
      </li>
      <li className={`connection-node ${relayStatus === 'connected' ? 'is-ready' : relayStatus === 'failed' ? 'is-warning' : 'is-pending'}`}>
        <span className="connection-node-index" aria-hidden="true">02</span>
        <span className="connection-node-copy">
          <strong>PC RTX · YOLO26</strong>
          <span>{producerMessage}</span>
        </span>
      </li>
      <li className={`connection-node ${backendReady ? 'is-ready' : 'is-warning'}`}>
        <span className="connection-node-index" aria-hidden="true">03</span>
        <span className="connection-node-copy">
          <strong>Java · autoridad</strong>
          <span>{backendLoading ? 'Verificando API…' : backendReady ? 'API REST disponible' : 'API no verificada desde esta URL'}</span>
        </span>
      </li>
    </ol>
  );
}
