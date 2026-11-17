import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { KioskProgress } from '@/components/KioskProgress';
import { RuntimeEndpointConfig } from '@/lib/RuntimeEndpointConfig';

describe('steps still in evaluation', () => {
  afterEach(() => { cleanup(); vi.unstubAllEnvs(); });

  it('reads the list from the deployment configuration and ignores anything that is not a step 1-6', () => {
    vi.stubEnv('VITE_STEPS_IN_EVALUATION', ' 3, 5 ,9,x,3');
    expect(RuntimeEndpointConfig.stepsInEvaluation()).toEqual([3, 5]);
    vi.stubEnv('VITE_STEPS_IN_EVALUATION', '');
    expect(RuntimeEndpointConfig.stepsInEvaluation()).toEqual([]);
  });

  it('marks only the configured steps with a visible "En evaluación" label', () => {
    vi.stubEnv('VITE_STEPS_IN_EVALUATION', '3,5');
    render(<KioskProgress />);

    const items = screen.getAllByRole('listitem');
    expect(items).toHaveLength(6);
    expect(screen.getAllByText('En evaluación')).toHaveLength(2);
    expect(items[2]).toHaveTextContent('En evaluación');
    expect(items[4]).toHaveTextContent('En evaluación');
    expect(items[0]).not.toHaveTextContent('En evaluación');
  });

  it('shows nothing extra when no step is configured', () => {
    render(<KioskProgress />);
    expect(screen.queryByText('En evaluación')).toBeNull();
  });
});
