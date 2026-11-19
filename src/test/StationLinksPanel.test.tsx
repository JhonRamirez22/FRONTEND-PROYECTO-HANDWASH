import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StationLinksPanel } from '@/components/StationLinksPanel';

describe('StationLinksPanel', () => {
  afterEach(() => cleanup());

  it('lists the active stations and issues a link for the chosen one', async () => {
    const user = userEvent.setup();
    const onIssue = vi.fn(async () => ({ code: 'A'.repeat(43), expiresInSeconds: 3600 }));
    render(<StationLinksPanel origin="https://app.example" onIssue={onIssue}
      loadStations={async () => [{ stationId: 's1', stationName: 'Lavamanos A' }, { stationId: 's2', stationName: 'Lavamanos B' }]} />);

    expect(await screen.findByText('Lavamanos B')).toBeTruthy();
    await user.click(screen.getAllByRole('button', { name: 'Enlace para un celular' })[1]!);
    expect(onIssue).toHaveBeenCalledWith('s2', false);
  });

  it('says so when there are no stations yet', async () => {
    render(<StationLinksPanel origin="https://x" onIssue={vi.fn()} loadStations={async () => []} />);
    expect(await screen.findByText(/Aún no hay puestos/)).toBeTruthy();
  });
});
