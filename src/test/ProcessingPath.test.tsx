import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ProcessingPath } from '@/components/ProcessingPath';
import type { ProducerTelemetry } from '@/lib/BrowserRtcCameraRelay';
import type { DeploymentStatus } from '@/lib/DeploymentStatusService';

const development: DeploymentStatus = {
  mode: 'DEVELOPMENT',
  clinicalDecisionAllowed: false,
  notice: 'Entorno de desarrollo.',
};

describe('ProcessingPath', () => {
  it('shows the local preview, pending RTX relay and reachable Java API as separate states', () => {
    render(<ProcessingPath previewReady backendStatus={development} backendLoading={false} relayStatus="idle" />);

    expect(screen.getByText('Vista previa local')).toBeInTheDocument();
    expect(screen.getByText('Esperando PC RTX autenticado')).toBeInTheDocument();
    expect(screen.getByText(/API REST disponible/)).toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'Ruta de procesamiento' })).toBeInTheDocument();
  });

  it('does not claim the Java API is available when it cannot be verified', () => {
    render(<ProcessingPath previewReady={false} backendLoading={false} relayStatus="idle" />);

    expect(screen.getByText('Cámara sin enlazar')).toBeInTheDocument();
    expect(screen.getByText('API no verificada desde esta URL')).toBeInTheDocument();
    expect(screen.getByText('Esperando PC RTX autenticado')).toBeInTheDocument();
  });

  it('keeps the backend in a checking state while the request is pending', () => {
    render(<ProcessingPath previewReady={false} backendStatus={development} backendLoading relayStatus="idle" />);

    expect(screen.getByText('Verificando API…')).toBeInTheDocument();
  });

  it('keeps WebRTC transport separate from Java-confirmed inference results', () => {
    render(<ProcessingPath previewReady backendStatus={development} backendLoading={false} relayStatus="connected" />);

    expect(screen.getByText('WebRTC conectado; esperando estado de modelos e inferencia')).toBeInTheDocument();
    expect(screen.getByText(/API REST disponible/)).toBeInTheDocument();
  });

  it('shows RTX inference telemetry without presenting it as a Java-confirmed step', () => {
    const telemetry: ProducerTelemetry = {
      modelsReady: true, activeModelsReady: true, challengerReady: true,
      inferenceFps: 5.2, inferenceMs: 84.1, javaTransport: 'connected',
      clinicalValidation: 'NOT_VALIDATED',
    };
    render(<ProcessingPath previewReady backendStatus={development} backendLoading={false}
      relayStatus="connected" producerTelemetry={telemetry} />);

    expect(screen.getByText(/Inferencia activa · 5\.2 fps/)).toBeInTheDocument();
    expect(screen.getByText(/estado confirmado se muestra abajo/)).toBeInTheDocument();
  });

  it('surfaces a Java producer-contract rejection instead of reporting active inference', () => {
    const telemetry: ProducerTelemetry = {
      modelsReady: true, activeModelsReady: true, challengerReady: false,
      inferenceFps: 0, inferenceMs: 0, javaTransport: 'rejected',
      clinicalValidation: 'NOT_VALIDATED',
    };
    render(<ProcessingPath previewReady backendStatus={development} backendLoading={false}
      relayStatus="connected" producerTelemetry={telemetry} />);

    expect(screen.getByText('Java rechazó el contrato del productor; revisa la configuración RTX')).toBeInTheDocument();
    expect(screen.queryByText(/Inferencia activa/)).not.toBeInTheDocument();
  });

  it('separates a model candidate from Java sequence state', () => {
    render(<ProcessingPath
      previewReady
      backendStatus={development}
      backendLoading={false}
      relayStatus="connected"
      candidateClass="PASO_1_PALMAS"
      candidateConfidence={0.83}
      javaStep="PASO_2_DORSOS"
    />);

    expect(screen.getByText('Candidato del modelo')).toBeInTheDocument();
    expect(screen.getByText('Palmas · 83 %')).toBeInTheDocument();
    expect(screen.getByText('Java · secuencia')).toBeInTheDocument();
    expect(screen.getByText(/Estado actual: Dorsos/)).toBeInTheDocument();
    expect(screen.getByText('Java · secuencia').closest('li')).toHaveClass('is-active');
  });

  it('does not invent a candidate or active Java step when neither is present', () => {
    render(<ProcessingPath
      previewReady={false}
      backendStatus={development}
      backendLoading={false}
      relayStatus="idle"
    />);

    expect(screen.getByText('Sin candidato reportado')).toBeInTheDocument();
    expect(screen.getByText(/API REST disponible · Sin paso activo/)).toBeInTheDocument();
  });
});
