import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DeploymentNotice } from '../components/DeploymentNotice';
import type { DeploymentStatus } from '../lib/DeploymentStatusService';

describe('DeploymentNotice', () => {
  it('prominently warns that demo mode is non-clinical', () => {
    const status: DeploymentStatus = {
      mode: 'NON_CLINICAL_DEMO',
      clinicalDecisionAllowed: false,
      notice: 'No usar para decisiones clínicas.',
    };

    render(<DeploymentNotice status={status} />);

    expect(screen.getByRole('alert', { name: 'DEMOSTRACIÓN — NO USAR CLÍNICAMENTE' })).toBeInTheDocument();
    expect(screen.getByText('No usar para decisiones clínicas.')).toBeInTheDocument();
  });

  it('does not label a verified pilot as full production', () => {
    const status: DeploymentStatus = {
      mode: 'HOSPITAL_PILOT',
      clinicalDecisionAllowed: false,
      notice: 'Release para piloto supervisado.',
    };

    render(<DeploymentNotice status={status} />);

    expect(screen.getByRole('alert', { name: 'PILOTO SUPERVISADO — NO ES PRODUCCIÓN CLÍNICA' })).toBeInTheDocument();
  });
});
