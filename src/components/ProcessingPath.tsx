import type { DeploymentStatus } from '@/lib/DeploymentStatusService';
import type { CameraRelayState, ProducerTelemetry } from '@/lib/BrowserRtcCameraRelay';
import { STEP_LABELS } from '@/types';

interface ProcessingPathProps {
  previewReady: boolean;
  backendStatus?: DeploymentStatus;
  backendLoading: boolean;
  relayStatus: CameraRelayState | 'idle';
  producerTelemetry?: ProducerTelemetry | null;
  candidateClass?: string;
  candidateConfidence?: number | null;
  javaStep?: string | null;
}

/** Makes the camera, future RTX producer and Java authority distinct at a glance. */
export function ProcessingPath({ previewReady, backendStatus, backendLoading, relayStatus,
  producerTelemetry = null, candidateClass = '', candidateConfidence = null, javaStep = null }: ProcessingPathProps) {
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
      <li className={`connection-node ${candidateClass ? 'is-candidate' : 'is-pending'}`}>
        <span className="connection-node-index" aria-hidden="true">03</span>
        <span className="connection-node-copy">
          <strong>Candidato del modelo</strong>
          <span>{candidateClass
            ? `${STEP_LABELS[candidateClass] ?? candidateClass}${candidateConfidence === null ? '' : ` · ${Math.round(candidateConfidence * 100)} %`}`
            : 'Sin candidato reportado'}</span>
        </span>
      </li>
      <li className={`connection-node ${javaStep ? 'is-active' : backendReady ? 'is-pending' : 'is-warning'}`}>
        <span className="connection-node-index" aria-hidden="true">04</span>
        <span className="connection-node-copy">
          <strong>Java · secuencia</strong>
          <span>{backendLoading ? 'Verificando API…' : !backendReady ? 'API no verificada desde esta URL'
            : `API REST disponible · ${javaStep ? `Estado actual: ${STEP_LABELS[javaStep] ?? javaStep}` : 'Sin paso activo'}`}</span>
        </span>
      </li>
    </ol>
  );
}
