import type { DeploymentStatus } from '@/lib/DeploymentStatusService';

interface ProcessingPathProps {
  previewReady: boolean;
  backendStatus?: DeploymentStatus;
  backendLoading: boolean;
}

/** Makes the camera, future RTX producer and Java authority distinct at a glance. */
export function ProcessingPath({ previewReady, backendStatus, backendLoading }: ProcessingPathProps) {
  const backendReady = !backendLoading && backendStatus !== undefined
    && backendStatus.mode !== 'UNVERIFIED';

  return (
    <ol className="connection-path" aria-label="Ruta de procesamiento">
      <li className={`connection-node ${previewReady ? 'is-ready' : 'is-waiting'}`}>
        <span className="connection-node-index" aria-hidden="true">01</span>
        <span className="connection-node-copy">
          <strong>Continuity</strong>
          <span>{previewReady ? 'Vista previa local' : 'Cámara sin enlazar'}</span>
        </span>
      </li>
      <li className="connection-node is-pending">
        <span className="connection-node-index" aria-hidden="true">02</span>
        <span className="connection-node-copy">
          <strong>PC RTX · YOLO26</strong>
          <span>Relay WebRTC pendiente</span>
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
