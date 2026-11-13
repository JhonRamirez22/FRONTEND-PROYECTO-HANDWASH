import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RehearsalPanel } from '@/components/RehearsalPanel';
import { stepNumber } from '@/lib/stepNumber';

describe('rehearsal panel', () => {
  afterEach(() => cleanup());

  it('reads the step number from a Java step code', () => {
    expect(stepNumber('PASO_3_INTERDIGITALES')).toBe(3);
    expect(stepNumber('Paso6_PuntaDeDedos')).toBe(6);
    expect(stepNumber('OMS_01_MOJAR_MANOS')).toBeNull();
    expect(stepNumber('')).toBeNull();
  });

  it('stays out of the way until rehearsal mode is switched on', () => {
    render(<RehearsalPanel detectedStep="PASO_2_DORSOS" onFeedback={vi.fn()} />);
    expect(screen.queryByRole('button', { name: /Es correcto/ })).toBeNull();
  });

  it('confirms the detected step', async () => {
    const onFeedback = vi.fn().mockResolvedValue(undefined);
    render(<RehearsalPanel detectedStep="PASO_2_DORSOS" onFeedback={onFeedback} />);
    const user = userEvent.setup();

    await user.click(screen.getByLabelText('Modo ensayo'));
    await user.click(screen.getByRole('button', { name: /Es correcto/ }));

    expect(onFeedback).toHaveBeenCalledWith(2, undefined);
    expect(await screen.findByText(/1 confirmados · 0 corregidos/)).toBeTruthy();
  });

  it('corrects the detected step with the one actually performed', async () => {
    const onFeedback = vi.fn().mockResolvedValue(undefined);
    render(<RehearsalPanel detectedStep="PASO_2_DORSOS" onFeedback={onFeedback} />);
    const user = userEvent.setup();

    await user.click(screen.getByLabelText('Modo ensayo'));
    await user.selectOptions(screen.getByLabelText('Paso realmente realizado'), '5');
    await user.click(screen.getByRole('button', { name: /Corregir/ }));

    expect(onFeedback).toHaveBeenCalledWith(2, 5);
    expect(await screen.findByText(/0 confirmados · 1 corregidos/)).toBeTruthy();
  });

  it('shows an error and keeps the counts when the backend rejects the feedback', async () => {
    const onFeedback = vi.fn().mockRejectedValue(new Error('No se pudo registrar'));
    render(<RehearsalPanel detectedStep="PASO_2_DORSOS" onFeedback={onFeedback} />);
    const user = userEvent.setup();

    await user.click(screen.getByLabelText('Modo ensayo'));
    await user.click(screen.getByRole('button', { name: /Es correcto/ }));

    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo registrar');
    expect(screen.getByText(/0 confirmados · 0 corregidos/)).toBeTruthy();
  });

  it('waits for a detected step before offering feedback', async () => {
    render(<RehearsalPanel detectedStep="" onFeedback={vi.fn()} />);
    await userEvent.setup().click(screen.getByLabelText('Modo ensayo'));
    expect(screen.getByText(/Esperando un paso detectado/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Es correcto/ })).toBeNull();
  });
});
