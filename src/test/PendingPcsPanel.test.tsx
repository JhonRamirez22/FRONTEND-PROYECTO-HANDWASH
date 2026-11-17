import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PendingPcsPanel } from '@/components/PendingPcsPanel';

const PC = { userCode: 'ABCD-2345', deviceName: 'DESKTOP-RTX', address: '203.0.113.5', ageSeconds: 12 };
const STATIONS = [{ stationId: 's1', stationName: 'Lavamanos A' }, { stationId: 's2', stationName: 'Lavamanos B' }];

describe('PendingPcsPanel', () => {
  afterEach(() => { cleanup(); vi.useRealTimers(); });

  it('lists the PCs waiting with their code and approves one for a station in one click', async () => {
    const user = userEvent.setup();
    const approve = vi.fn().mockResolvedValue(undefined);
    render(<PendingPcsPanel loadPending={async () => [PC]} loadStations={async () => STATIONS} approve={approve} reject={vi.fn()} pollMs={60_000} />);

    expect(await screen.findByText('ABCD-2345')).toBeTruthy();
    expect(screen.getByText(/DESKTOP-RTX · hace 12 s/)).toBeTruthy();
    await user.selectOptions(screen.getByLabelText('Puesto para DESKTOP-RTX'), 's2');
    await user.click(screen.getByRole('button', { name: 'Aprobar' }));

    expect(approve).toHaveBeenCalledWith('ABCD-2345', 's2');
    expect(await screen.findByText(/aprobado/i)).toBeTruthy();
  });

  it('tells the admin what to do when no PC is waiting', async () => {
    render(<PendingPcsPanel loadPending={async () => []} loadStations={async () => STATIONS} approve={vi.fn()} reject={vi.fn()} pollMs={60_000} />);
    expect(await screen.findByText(/Ningún PC esperando/)).toBeTruthy();
    expect(screen.getAllByText(/INICIAR-HANDWASH/).length).toBeGreaterThan(0);
  });

  it('asks for a station first when there is none, instead of offering a dead button', async () => {
    render(<PendingPcsPanel loadPending={async () => [PC]} loadStations={async () => []} approve={vi.fn()} reject={vi.fn()} pollMs={60_000} />);
    expect(await screen.findByText(/Crea primero un puesto/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Aprobar' })).toBeNull();
  });

  it('shows the failure and keeps the PC listed', async () => {
    const user = userEvent.setup();
    render(<PendingPcsPanel loadPending={async () => [PC]} loadStations={async () => STATIONS}
      approve={vi.fn().mockRejectedValue(new Error('Límite de keys del puesto'))} reject={vi.fn()} pollMs={60_000} />);

    await user.click(await screen.findByRole('button', { name: 'Aprobar' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Límite de keys');
    expect(screen.getByText('ABCD-2345')).toBeTruthy();
  });

  it('can reject a PC it does not recognise', async () => {
    const user = userEvent.setup();
    const reject = vi.fn().mockResolvedValue(undefined);
    render(<PendingPcsPanel loadPending={async () => [PC]} loadStations={async () => STATIONS} approve={vi.fn()} reject={reject} pollMs={60_000} />);

    await user.click(await screen.findByRole('button', { name: 'Rechazar' }));
    await waitFor(() => expect(reject).toHaveBeenCalledWith('ABCD-2345'));
  });
});
