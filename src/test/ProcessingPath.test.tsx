import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ProcessingPath } from '@/components/ProcessingPath';
import type { DeploymentStatus } from '@/lib/DeploymentStatusService';

const development: DeploymentStatus = {
  mode: 'DEVELOPMENT',
  clinicalDecisionAllowed: false,
  notice: 'Entorno de desarrollo.',
};

describe('ProcessingPath', () => {
  it('shows the local preview, pending RTX relay and reachable Java API as separate states', () => {
    render(<ProcessingPath previewReady backendStatus={development} backendLoading={false} />);

    expect(screen.getByText('Vista previa local')).toBeInTheDocument();
    expect(screen.getByText('Relay WebRTC pendiente')).toBeInTheDocument();
    expect(screen.getByText('API REST disponible')).toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'Ruta de procesamiento' })).toBeInTheDocument();
  });

  it('does not claim the Java API is available when it cannot be verified', () => {
    render(<ProcessingPath previewReady={false} backendLoading={false} />);

    expect(screen.getByText('Cámara sin enlazar')).toBeInTheDocument();
    expect(screen.getByText('API no verificada desde esta URL')).toBeInTheDocument();
    expect(screen.getByText('Relay WebRTC pendiente')).toBeInTheDocument();
  });

  it('keeps the backend in a checking state while the request is pending', () => {
    render(<ProcessingPath previewReady={false} backendStatus={development} backendLoading />);

    expect(screen.getByText('Verificando API…')).toBeInTheDocument();
  });
});
