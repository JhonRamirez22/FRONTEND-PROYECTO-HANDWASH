import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { OperatorShiftPanel } from '@/components/OperatorShiftPanel';
import { formatRemaining } from '@/lib/shiftFormat';

const NOW = new Date(2026, 9, 21, 8, 0).getTime();

describe('operator shift panel', () => {
  afterEach(() => { cleanup(); vi.restoreAllMocks(); });

  it('starts a shift with the chosen duration', async () => {
    const onStart = vi.fn();
    render(<OperatorShiftPanel shift={{ active: false, protocolo: null, startedAtEpochMs: null, endsAtEpochMs: null }}
      busy={false} onStart={onStart} onStop={vi.fn()} now={() => NOW} />);

    await userEvent.setup().selectOptions(screen.getByLabelText('Duración del turno'), '10');
    await userEvent.setup().click(screen.getByRole('button', { name: /Iniciar turno/ }));

    expect(onStart).toHaveBeenCalledWith(10);
  });

  it('defaults to eight hours', async () => {
    const onStart = vi.fn();
    render(<OperatorShiftPanel shift={null} busy={false} onStart={onStart} onStop={vi.fn()} now={() => NOW} />);
    await userEvent.setup().click(screen.getByRole('button', { name: /Iniciar turno/ }));
    expect(onStart).toHaveBeenCalledWith(8);
  });

  it('shows the remaining time and asks for confirmation before ending an active shift', async () => {
    const onStop = vi.fn();
    const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true);
    render(<OperatorShiftPanel shift={{ active: true, protocolo: 'AGUA_Y_JABON', startedAtEpochMs: NOW,
      endsAtEpochMs: NOW + 7 * 3_600_000 + 12 * 60_000 }} busy={false} onStart={vi.fn()} onStop={onStop} now={() => NOW} />);

    expect(screen.getByRole('status')).toHaveTextContent('quedan 7 h 12 min');
    expect(screen.queryByRole('button', { name: /Iniciar turno/ })).toBeNull();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /Finalizar turno/ }));
    expect(onStop).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: /Finalizar turno/ }));
    expect(confirm).toHaveBeenCalledTimes(2);
    expect(onStop).toHaveBeenCalledTimes(1);
  });

  it('disables the controls while busy and formats remaining time safely', () => {
    render(<OperatorShiftPanel shift={null} busy onStart={vi.fn()} onStop={vi.fn()} now={() => NOW} />);
    expect(screen.getByRole('button', { name: /Iniciar turno/ })).toBeDisabled();
    expect(formatRemaining(35 * 60_000)).toBe('35 min');
    expect(formatRemaining(-5_000)).toBe('0 min');
    expect(formatRemaining(60 * 60_000)).toBe('1 h 0 min');
  });
});
